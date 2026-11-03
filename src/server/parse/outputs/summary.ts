// 요약 출력 — 튜터의 정리 + 다음에 할 것 (3개까지)
import type { Tool } from '../../llm/LlmClient';
import { clip, firstN, obj, strList } from '../fields';

export const SUMMARY_TOOL: Tool = {
  name: 'summarize',
  description: '세션 요약',
  input_schema: {
    type: 'object',
    properties: {
      report: { type: 'string' },
      nextSteps: { type: 'array', maxItems: 3, items: { type: 'string' } },
    },
    required: ['report', 'nextSteps'],
  },
};

export interface Summary { report: string; nextSteps: string[] }

export function parseSummary(x: unknown): Summary {
  const s = obj(x, 'summary');
  return { report: clip(s.report, 'summary.report', 3000), nextSteps: strList(firstN(s.nextSteps, 3), 'summary.nextSteps', 3).map((n) => n.trim().slice(0, 400)) };
}
