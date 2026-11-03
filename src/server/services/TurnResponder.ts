// 한 턴의 LLM 부분 — Haiku 한 번으로 판정 + 응답, 그다음 결정적 검사로 다듬는다
import { capSentences, stripTrailingQuestion } from '../../checks';
import { lines } from '../../lines';
import type { Judge, SessionState } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { TurnPrompt } from '../llm/TurnPrompt';
import { LlmOutputParser, TURN_TOOL } from '../parse/LlmOutputParser';
import type { Context, Line } from '../parse/RequestParser';

export class TurnResponder {
  constructor(private readonly llm: LlmClient, private readonly prompt: TurnPrompt) {}

  async respond(s: SessionState, ctx: Context, history: readonly Line[], text: string): Promise<Judge> {
    const raw = await this.llm.call({
      model: MODELS.turn, maxTokens: 700, tool: TURN_TOOL,
      system: this.prompt.system(s, ctx), user: this.prompt.user(history, text, s.lang),
    });
    const j = LlmOutputParser.judge(raw);
    return TurnResponder.tidy(j.reply ? j : { ...j, reply: lines(s.lang).ok });
  }

  // 길이 규칙 · 3번째 자리 규칙 — 모델 문장에만 적용한다 (코드가 말하는 줄은 이미 규칙대로)
  static tidy(j: Judge): Judge {
    // 시범 턴만 3문장: 받음 + 시범 한 문장 + "바꿔도 돼요" (목업 M5-26)
    const capped = capSentences(j.reply, j.opens === 'P1.4' ? 3 : 2);
    return {
      ...j,
      reply: j.move === 'USER_INQUIRY' ? stripTrailingQuestion(capped) : capped,
      paraphrase: capSentences(j.paraphrase, 3),
      example: capSentences(j.example, 2),
    };
  }
}
