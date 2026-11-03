// 재평가 출력 — 고친 문단이 완료 기준을 원래보다 더 채우나
import type { Tool } from '../../llm/LlmClient';
import type { Verdict } from '../../../state';
import { bool, clip, obj } from '../fields';

export const EVALUATE_TOOL: Tool = {
  name: 'evaluate',
  description: '고친 문단이 기준을 원래 문단보다 더 충족하는지',
  input_schema: {
    type: 'object',
    properties: { better: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['better', 'reason'],
  },
};

export function parseVerdict(x: unknown): Verdict {
  const v = obj(x, 'verdict');
  const reason = clip(v.reason ?? '', 'verdict.reason', 600); // 비면 EditingPhase가 기본 힌트를 쓴다
  return { better: bool(v.better, 'verdict.better'), reason };
}
