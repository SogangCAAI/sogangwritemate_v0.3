// 한 턴의 LLM 부분 — Haiku 한 번으로 판정 + 응답, 그다음 결정적 검사로 다듬는다
import { capSentences, sentences } from '../../checks';
import { Interruption } from '../../conversation/Interruption';
import { lines } from '../../lines';
import { activeTask, type CaCounts, type Judge, type SessionState } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { TurnPrompt } from '../llm/TurnPrompt';
import { LlmOutputParser, TURN_TOOL } from '../parse/LlmOutputParser';
import type { Context, Line } from '../parse/RequestParser';

const NO_CA: CaCounts = { bargeIns: 0, botTurns: 0 };
const CODE_SERVED = new Set(['REPEAT_REQ', 'PARAPHRASE_REQ', 'EXAMPLE_REQ']);
const QUESTION_END = /[?？]["”’']?\s*$/;

export class TurnResponder {
  constructor(private readonly llm: LlmClient, private readonly prompt: TurnPrompt) {}

  async respond(s: SessionState, ctx: Context, history: readonly Line[], text: string, ca: CaCounts = NO_CA): Promise<Judge> {
    const short = new Interruption(ca).shorten;
    const raw = await this.llm.call({
      model: MODELS.turn, maxTokens: 700, tool: TURN_TOOL,
      system: this.prompt.system(s, ctx, short), user: this.prompt.user(history, text, s.lang),
    });
    const j = LlmOutputParser.judge(raw);
    return TurnResponder.tidy(j.reply ? j : { ...j, reply: lines(s.lang).ok }, s, short);
  }

  // 이 턴의 문장 상한 — 기본 2, 시범 턴은 3(받음 + 시범 한 문장 + "바꿔도 돼요", 목업 M5-26).
  // 학생이 자주 끼어들면(short, v2 shorten) 한 단계 줄인다: 기본 1, 시범 턴 2 (시범 문장이 잘려 나가지 않게)
  static maxSentences(j: Judge, s: SessionState | null, short: boolean): number {
    const exemplarRung = j.move === 'CONFUSED' && !!s && s.confusedStreak === 1 && !!activeTask(s); // 막힘 2회째 = 시범
    const base = j.opens === 'P1.4' || exemplarRung ? 3 : 2;
    return short ? base - 1 : base;
  }

  // 튜터가 이끈다 (사용자 결정 2026-11-03): 과제 중 모델 말이 질문·제안 없이 끝나면 과제 단계에 맞는 한 걸음을 코드가 붙인다.
  // 예외 — 학생이 길게 말하는 중의 맞장구(A5.5·CONTINUER), 제안(P1)·시범(P1.4)으로 끝낸 말, 코드가 답하는 되묻기
  static lead(j: Judge, s: SessionState | null, reply = j.reply): string | null {
    const t = s ? activeTask(s) : undefined;
    if (!s || !t || (s.stage !== 'content' && s.stage !== 'form')) return null;
    // 모델의 opens 표시가 아니라 실제 문장으로 본다 — 'A5.1'이라 표시하고 물음 없이 끝내는 경우가 있었다 (실측)
    if (QUESTION_END.test(reply.trim()) || j.opens === 'P1' || j.opens === 'P1.4') return null;
    if (j.move === 'CONTINUER' || s.open?.pattern === 'A5.5' || CODE_SERVED.has(j.move)) return null;
    const L = lines(s.lang);
    const p = t.target.paragraph;
    return t.kind === 'form' ? L.leadForm(p) : t.evidence ? L.leadEdit(p) : L.leadDraft(p);
  }

  // 길이를 줄일 때 마지막 질문은 남긴다 — 앞에서부터 자르면 대화를 이끄는 끝 질문이 잘려 나갔다 (실측).
  // 가운데를 빼면 질문이 가리키는 말("빈칸")이 사라져서, 앞 max문장 + 끝 질문 한 문장까지 둔다
  static capKeepingQuestion(text: string, max: number): string {
    const all = sentences(text);
    const last = all[all.length - 1];
    if (all.length <= max || !last || !QUESTION_END.test(last)) return capSentences(text, max);
    return [...all.slice(0, max), last].join(' ');
  }

  // 길이 규칙 · 이끄는 끝 — 모델 문장에만 적용한다 (코드가 말하는 줄은 이미 규칙대로)
  static tidy(j: Judge, s: SessionState | null = null, short = false): Judge {
    const max = TurnResponder.maxSentences(j, s, short);
    const capped = TurnResponder.capKeepingQuestion(j.reply, max);
    const lead = TurnResponder.lead(j, s, capped);
    const reply = lead ? `${capSentences(capped, Math.max(1, max - 1))} ${lead}` : capped;
    return {
      ...j,
      reply,
      opens: lead ? 'A5.1' : j.opens, // 붙인 질문에 대한 학생 답이 ANSWER로 읽히게
      paraphrase: capSentences(j.paraphrase, 3),
      example: capSentences(j.example, 2),
    };
  }
}
