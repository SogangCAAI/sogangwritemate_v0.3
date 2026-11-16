// 재평가 — 완료 항목(체크리스트)마다 "고친 문단에 보이나"를 판정한다 (2026-11-16, 상대 비교 → 항목별 절대 판정)
//   1) 코드 항목(상투 표현 등)은 코드가 먼저 본다 — LLM 없음 (checks.codeCheck)
//   2) llm 항목이 있으면 Haiku 1회 — 항목 id마다 met + 인용. 연결·주장 축 과제는 앞뒤 문단을 참고로 함께 준다
//   3) '새 내용' 항목(needsNew)은 모델이 인용한 근거가 원래 문단에 이미 있으면 충족으로 치지 않는다 — 문장 하나 바꿔 쓰기로는 통과하지 못한다
//   4) 전부 met이면 done. reason은 모델이 쓰고(힌트 = 못 채운 항목), 모델을 부르지 않은 턴에는 코드가 쓴다
import { capSentences, codeCheck } from '../../checks';
import { lines } from '../../lines';
import type { Criterion, Lang, Task, Verdict } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { EVALUATE_TOOL, LlmOutputParser, type RawVerdict } from '../parse/LlmOutputParser';

// 문단 하나로는 판정할 수 없는 축 — 앞뒤 문단을 참고로 넣는다 (claim: 첫 문단이 본문을 예고하나 · cohesion: 문단 사이가 이어지나)
const CONTEXT_AXES = new Set(['claim', 'cohesion']);
const squash = (x: string) => x.replace(/["“”'‘’.,·…]/g, '').replace(/\s+/g, '').trim();

export class Evaluator {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  // paragraphs: 고친 문단이 들어간 지금 글 전체 (앞뒤 문단 참고용) — 없으면 문단만 본다
  async evaluate(task: Task, original: string, edited: string, lang: Lang, paragraphs: readonly string[] = []): Promise<Verdict> {
    const criteria: readonly Criterion[] = task.criteria.length
      ? task.criteria
      : [{ id: 'doneWhen', text: task.doneWhen, check: 'llm', source: 'diagnosis', met: false }]; // 예전 과제(항목 없음)는 doneWhen 한 문장이 항목
    const codeMet = criteria.filter((c) => c.check !== 'llm' && codeCheck(c, edited)).map((c) => c.id);
    const llmItems = criteria.filter((c) => c.check === 'llm');
    if (!llmItems.length) return Evaluator.combine(criteria, codeMet, null, lang, original);

    const raw = await this.llm.call({
      model: MODELS.evaluate, maxTokens: 600, tool: EVALUATE_TOOL,
      system: 'You judge one paragraph revision against a checklist of observable criteria.',
      user: this.prompts.render('evaluate.md', {
        paragraphNo: String(task.target.paragraph), goal: task.goal,
        criteria: llmItems.map((c) => `- ${c.id}${c.needsNew ? ' (새 내용 — 원래 문단에 없던 것을 그대로 인용)' : ''}: ${c.text}`).join('\n'),
        original, edited,
        context: Evaluator.contextText(task, paragraphs, lang),
        lang: PromptBook.langName(lang),
      }),
    });
    return Evaluator.combine(criteria, codeMet, LlmOutputParser.verdict(raw), lang, original);
  }

  // 코드 판정 + 모델 판정 → Verdict. 모델이 빠뜨린 항목은 '아직'.
  // needsNew 항목: 모델이 met이라 해도 인용한 근거(evidence)가 비었거나 원래 문단에 이미 있는 글자면 '아직'
  static combine(criteria: readonly Criterion[], codeMet: readonly string[], raw: RawVerdict | null, lang: Lang, original = ''): Verdict {
    const orig = squash(original);
    const llmMet = raw
      ? raw.items.filter((it) => it.met && !(Evaluator.needsNew(criteria, it.id) && (!squash(it.evidence) || orig.includes(squash(it.evidence))))).map((it) => it.id)
      : [];
    const met = criteria.filter((c) => (c.check === 'llm' ? llmMet.includes(c.id) : codeMet.includes(c.id))).map((c) => c.id);
    const done = met.length === criteria.length;
    const L = lines(lang);
    const unmet = criteria.find((c) => !met.includes(c.id));
    const reason = raw ? capSentences(raw.reason, 2) : done ? '' : unmet ? L.codeHint(unmet.text) : '';
    return { done, met, reason };
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
}
