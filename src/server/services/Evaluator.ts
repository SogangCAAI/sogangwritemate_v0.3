// 재평가 — 완료 항목(체크리스트)마다 "고친 문단에 보이나"를 판정한다 (2026-11-16, 상대 비교 → 항목별 절대 판정)
//   1) 코드 항목(상투 표현 등)은 코드가 먼저 본다 — LLM 없음 (checks.codeCheck)
//   2) llm 항목이 있으면 Haiku 1회 — 항목 id마다 met + 인용. 연결·주장 축 과제는 앞뒤 문단을 참고로 함께 준다
//   3) '새 내용' 항목(needsNew)은 모델이 인용한 근거가 원래 문단에 이미 있으면 충족으로 치지 않는다 — 문장 하나 바꿔 쓰기로는 통과하지 못한다
//   4) 전부 met이면 done. reason은 모델이 쓰고(힌트 = 못 채운 항목), 모델을 부르지 않은 턴에는 코드가 쓴다
//   5) 돌지 않기: 직전 힌트와 같은 항목이 몇 번째인지 넘긴다 — 2번째면 뼈대, 3번째면 다른 재료(이력서·다른 문단)로 힌트를 바꾼다
//   6) 구조 과제는 손대는 문단 전부를 판정 대상으로 준다 (문장 이동은 두 문단을 봐야 안다)
import { capSentences, codeCheck } from '../../checks';
import { Tasks } from '../../conversation/Tasks';
import { lines } from '../../lines';
import type { Criterion, Lang, Task, Verdict } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { EVALUATE_TOOL, LlmOutputParser, type RawVerdict } from '../parse/LlmOutputParser';

// 문단 하나로는 판정할 수 없는 축 — 앞뒤 문단을 참고로 넣는다 (claim: 첫 문단이 본문을 예고하나 · cohesion: 문단 사이가 이어지나)
const CONTEXT_AXES = new Set(['claim', 'cohesion']);
const squash = (x: string) => x.replace(/["“”'‘’.,·…]/g, '').replace(/\s+/g, '').trim();

// 재평가 입력 — 판정 대상 문단들(원래·고친), 지금 글 전체, 이력서
export interface EvalInput {
  readonly originals: readonly string[]; // 처음 글 (문단 배열, 지금 글과 같은 번호 — 새로 더한 문단은 '')
  readonly paragraphs: readonly string[]; // 고친 뒤의 지금 글 전체
  readonly resume?: string;
}

export class Evaluator {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  async evaluate(task: Task, input: EvalInput, lang: Lang): Promise<Verdict> {
    const criteria: readonly Criterion[] = task.criteria.length
      ? task.criteria
      : [{ id: 'doneWhen', text: task.doneWhen, check: 'llm', source: 'diagnosis', met: false }]; // 예전 과제(항목 없음)는 doneWhen 한 문장이 항목
    const targets = Tasks.targets(task).filter((n) => n >= 1 && n <= input.paragraphs.length);
    const editedAll = targets.map((n) => input.paragraphs[n - 1] ?? '').join('\n');
    const originalAll = targets.map((n) => input.originals[n - 1] ?? '').join('\n');
    const codeMet = criteria.filter((c) => c.check !== 'llm' && codeCheck(c, editedAll)).map((c) => c.id);
    const llmItems = criteria.filter((c) => c.check === 'llm');
    if (!llmItems.length) return Evaluator.combine(criteria, codeMet, null, lang, originalAll);

    const block = (ns: readonly number[], src: readonly string[]) => ns.map((n) => `${n}문단: ${src[n - 1] ?? ''}`).join('\n');
    const raw = await this.llm.call({
      model: MODELS.evaluate, maxTokens: 700, tool: EVALUATE_TOOL,
      system: 'You judge a paragraph revision against a checklist of observable criteria.',
      user: this.prompts.render('evaluate.md', {
        paragraphNo: targets.join('·'), goal: task.goal,
        criteria: llmItems.map((c) => `- ${c.id}${c.needsNew ? ' (새 내용 — 원래 문단에 없던 것을 그대로 인용)' : ''}: ${c.text}`).join('\n'),
        original: block(targets, input.originals), edited: block(targets, input.paragraphs),
        context: Evaluator.contextText(task, input.paragraphs, lang),
        history: Evaluator.historyText(task, lang),
        materials: Evaluator.materialsText(task, input, lang),
        lang: PromptBook.langName(lang),
      }),
    });
    return Evaluator.combine(criteria, codeMet, LlmOutputParser.verdict(raw), lang, originalAll);
  }

  // 코드 판정 + 모델 판정 → Verdict. 모델이 빠뜨린 항목은 '아직'.
  // needsNew 항목: 모델이 met이라 해도 인용한 근거(evidence)가 비었거나 원래 문단에 이미 있는 글자면 '아직'
  static combine(criteria: readonly Criterion[], codeMet: readonly string[], raw: RawVerdict | null, lang: Lang, original = ''): Verdict {
    const orig = squash(original);
    const items = raw ? raw.items.filter((it) => it.met && !(Evaluator.needsNew(criteria, it.id) && (!squash(it.evidence) || orig.includes(squash(it.evidence))))) : [];
    const llmMet = items.map((it) => it.id);
    const met = criteria.filter((c) => (c.check === 'llm' ? llmMet.includes(c.id) : codeMet.includes(c.id))).map((c) => c.id);
    const done = met.length === criteria.length;
    const L = lines(lang);
    const unmet = criteria.find((c) => !met.includes(c.id));
    const reason = raw ? capSentences(raw.reason, 2) : done ? '' : unmet ? L.codeHint(unmet.text) : '';
    const evidence = Object.fromEntries(items.filter((it) => it.evidence).map((it) => [it.id, it.evidence]));
    return { done, met, reason, evidence };
  }

  static needsNew(criteria: readonly Criterion[], id: string): boolean {
    return !!criteria.find((c) => c.id === id)?.needsNew;
  }

  // 연결·주장 축 과제면 지금 글 전체를 참고로 — 판정 대상은 그 문단 하나라고 분명히 적는다
  static contextText(task: Task, paragraphs: readonly string[], lang: Lang): string {
    if (!task.axis || !CONTEXT_AXES.has(task.axis) || paragraphs.length < 2) return '';
    const head = lang === 'en'
      ? `[Whole draft, for context — judge only paragraph ${task.target.paragraph}; the others show whether it connects]`
      : `[글 전체 — 참고용. 판정 대상은 ${task.target.paragraph}문단 하나다. 다른 문단은 앞뒤와 이어지는지 볼 때만 쓴다]`;
    return `\n${head}\n${PromptBook.essayText(paragraphs)}`;
  }

  // 직전 힌트와 같은 항목이 몇 번째인지 — 같은 말을 되풀이하지 않게
  static historyText(task: Task, lang: Lang): string {
    if (!task.lastHint) return '';
    const n = task.stuckCount;
    if (lang === 'en') {
      return `[Previous hint] "${task.lastHint}" — the same item has now been missed ${n} time(s). Do NOT repeat it. ` +
        (n >= 3 ? 'Suggest a DIFFERENT material (from the resume or another paragraph) instead.' : n === 2 ? 'Give the frame (slots) instead of the same hint.' : 'Approach from another angle.');
    }
    return `[직전 힌트] "${task.lastHint}" — 같은 항목이 ${n}번째 안 채워졌다. 같은 말을 되풀이하지 말 것. ` +
      (n >= 3 ? '**다른 재료**(아래 이력서·다른 문단)로 바꿔 제안한다.' : n === 2 ? '같은 힌트 대신 틀(자리 순서)을 보여 준다.' : '다른 각도로 짚는다.');
  }

  // 재료 창고 — 두 번째 이상 막혔을 때만 이력서와 다른 문단을 준다 (힌트가 "기억 안 나는 것"을 또 요구하지 않게)
  static materialsText(task: Task, input: EvalInput, lang: Lang): string {
    if (task.stuckCount < 2) return '';
    const targets = Tasks.targets(task);
    const others = input.paragraphs.map((p, i) => [i + 1, p] as const).filter(([n]) => !targets.includes(n)).map(([n, p]) => `${n}문단: ${p}`).join('\n');
    const head = lang === 'en' ? '[Materials the hint may point to — resume and other paragraphs]' : '[힌트에 쓸 수 있는 재료 — 이력서와 다른 문단]';
    return `\n${head}\n이력서: ${input.resume?.trim() || '(없음)'}\n${others}`;
  }
}
