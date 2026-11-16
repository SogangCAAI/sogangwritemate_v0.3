// 재평가 출력 — 완료 항목마다 고친 문단에 보이나 (절대 판정) + 튜터가 말할 문장
import type { Tool } from '../../llm/LlmClient';
import { bool, clip, obj } from '../fields';

export const EVALUATE_TOOL: Tool = {
  name: 'evaluate',
  description: '완료 항목마다 고친 문단에 보이는지, 그리고 튜터가 학생에게 할 말',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, met: { type: 'boolean' }, evidence: { type: 'string' } },
          required: ['id', 'met', 'evidence'],
        },
      },
      reason: { type: 'string' },
    },
    required: ['items', 'reason'],
  },
};

// 모델이 낸 항목 판정 — 코드가 코드 항목과 합쳐 Verdict를 만든다 (Evaluator)
export interface ItemJudgement { readonly id: string; readonly met: boolean; readonly evidence: string }
export interface RawVerdict { readonly items: readonly ItemJudgement[]; readonly reason: string }

export function parseVerdict(x: unknown): RawVerdict {
  const v = obj(x, 'verdict');
  const reason = clip(v.reason ?? '', 'verdict.reason', 600); // 비면 EditingPhase가 기본 힌트를 쓴다
  // 모양이 틀린 항목은 실패 대신 버린다 — 빠진 항목은 '아직'으로 본다
  const items = Array.isArray(v.items)
    ? v.items.flatMap((it): ItemJudgement[] => {
      if (!it || typeof it !== 'object' || Array.isArray(it)) return [];
      const o = it as Record<string, unknown>;
      if (typeof o.id !== 'string' || typeof o.met !== 'boolean') return [];
      return [{ id: o.id.trim().slice(0, 20), met: bool(o.met, 'verdict.items.met'), evidence: typeof o.evidence === 'string' ? o.evidence.trim().slice(0, 300) : '' }];
    })
    : [];
  return { items, reason };
}
