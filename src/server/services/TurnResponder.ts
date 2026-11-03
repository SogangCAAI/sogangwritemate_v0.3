// 한 턴의 LLM 부분 — Haiku 한 번으로 판정 + 응답, 그다음 결정적 검사로 다듬는다
import { capSentences, stripTrailingQuestion } from '../../checks';
import { Interruption } from '../../conversation/Interruption';
import { lines } from '../../lines';
import { activeTask, type CaCounts, type Judge, type SessionState } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { TurnPrompt } from '../llm/TurnPrompt';
import { LlmOutputParser, TURN_TOOL } from '../parse/LlmOutputParser';
import type { Context, Line } from '../parse/RequestParser';

const NO_CA: CaCounts = { bargeIns: 0, botTurns: 0 };

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

  // 길이 규칙 · 3번째 자리 규칙 — 모델 문장에만 적용한다 (코드가 말하는 줄은 이미 규칙대로)
  static tidy(j: Judge, s: SessionState | null = null, short = false): Judge {
    const capped = capSentences(j.reply, TurnResponder.maxSentences(j, s, short));
    return {
      ...j,
      reply: j.move === 'USER_INQUIRY' ? stripTrailingQuestion(capped) : capped,
      paraphrase: capSentences(j.paraphrase, 3),
      example: capSentences(j.example, 2),
    };
  }
}
