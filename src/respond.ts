// 한 턴의 LLM 부분 — Haiku 한 번으로 판정 + 응답, 그다음 결정적 검사로 다듬는다
import { capSentences, stripTrailingQuestion } from './checks';
import { lines } from './lines';
import { callTool, LlmError, MODELS } from './llm';
import { TURN_TOOL, turnSystem, turnUser } from './prompt';
import type { Judge, SessionState } from './state';
import { parseJudge, ValidationError, type Context, type Line } from './validate';

// LLM 출력이 형식 밖이면 사용자에게는 '다시 보내 주세요'로 보인다
export function fromLlm<T>(name: string, parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    if (e instanceof ValidationError) throw new LlmError(`${name} 형식 밖 출력: ${e.message}`, '튜터가 답을 잘못 만들었어요. 다시 보내 주세요.');
    throw e;
  }
}

export async function respond(s: SessionState, ctx: Context, history: Line[], text: string): Promise<Judge> {
  const raw = await callTool({
    model: MODELS.turn, maxTokens: 700, tool: TURN_TOOL,
    system: turnSystem(s, ctx), user: turnUser(history, text, s.lang),
  });
  const j = fromLlm('respond', () => parseJudge(raw));
  return tidy(j.reply ? j : { ...j, reply: lines(s.lang).ok });
}

// 길이 규칙 · 3번째 자리 규칙 — 모델 문장에만 적용한다 (코드가 말하는 줄은 이미 규칙대로)
export function tidy(j: Judge): Judge {
  // 시범 턴만 3문장: 받음 + 시범 한 문장 + "바꿔도 돼요" (목업 M5-26)
  const capped = capSentences(j.reply, j.opens === 'P1.4' ? 3 : 2);
  return {
    ...j,
    reply: j.move === 'USER_INQUIRY' ? stripTrailingQuestion(capped) : capped,
    paraphrase: capSentences(j.paraphrase, 3),
    example: capSentences(j.example, 2),
  };
}
