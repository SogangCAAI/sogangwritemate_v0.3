// 턴 출력 — Haiku 한 번이 내는 판정 + 튜터의 다음 말 + 수리용 콘텐츠
import type { Tool } from '../../llm/LlmClient';
import { IMPORTANCES, MOVES, PATTERNS, type Importance, type Judge, type Move } from '../../../state';
import { obj, oneOf, str } from '../fields';

export const TURN_TOOL: Tool = {
  name: 'respond',
  description: '판정과 튜터의 다음 말',
  input_schema: {
    type: 'object',
    properties: {
      move: { type: 'string', enum: [...MOVES] },
      reply: { type: 'string' },
      paraphrase: { type: 'string' },
      example: { type: 'string' },
      opens: { type: 'string', enum: [...PATTERNS, 'none'] },
      exemplar: { type: 'string' },
      positive: { type: 'boolean' },
      importance: { type: 'string', enum: [...IMPORTANCES] },
      targetParagraph: { type: 'integer' },
    },
    required: ['move', 'reply', 'paraphrase', 'example', 'opens', 'exemplar', 'positive', 'importance', 'targetParagraph'],
  },
};

export function parseJudge(x: unknown): Judge {
  const j = obj(x, 'judge');
  // 빈 말은 형식 오류로 보지 않는다 — 맞장구·코드가 답하는 되묻기에서 모델이 비워 둘 수 있다 (TurnResponder가 '네.'로 채운다)
  const reply = str(j.reply, 'judge.reply').trim();
  return {
    move: oneOf(j.move, MOVES, 'judge.move') as Move,
    reply,
    paraphrase: typeof j.paraphrase === 'string' ? j.paraphrase : '',
    example: typeof j.example === 'string' ? j.example : '',
    opens: oneOf(j.opens ?? 'none', [...PATTERNS, 'none'] as const, 'judge.opens'),
    exemplar: typeof j.exemplar === 'string' ? j.exemplar : '',
    positive: j.positive === true,
    // OFF_GOAL 전용 칸 — 모양이 틀리면 실패시키지 않고 '없음'으로 본다
    importance: IMPORTANCES.includes(j.importance as Importance) ? (j.importance as Importance) : 'none',
    targetParagraph: Number.isInteger(j.targetParagraph) && (j.targetParagraph as number) > 0 ? (j.targetParagraph as number) : 0,
  };
}
