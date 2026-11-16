// 끝 재진단 출력 — 처음 진단과 같은 루브릭(5축) + 잘한 점. 과제·브리핑은 없다
import type { Tool } from '../../llm/LlmClient';
import { RUBRIC_AXIS_KEYS, RUBRIC_GRADES, type Rubric } from '../../../rubric';
import { obj } from '../fields';
import { parseRubric } from './diagnosis';

const GRADE = { type: 'string', enum: [...RUBRIC_GRADES] };
const JUDGEMENT = { type: 'object', properties: { grade: GRADE, evidence: { type: 'string' } }, required: ['grade', 'evidence'] };

export const REGRADE_TOOL: Tool = {
  name: 'regrade',
  description: '끝 글의 채점 루브릭 5축 판정과 잘한 점',
  input_schema: {
    type: 'object',
    properties: {
      rubric: {
        type: 'object',
        properties: {
          claim: JUDGEMENT,
          hierarchy: JUDGEMENT,
          alignment: {
            type: 'object',
            properties: { grade: GRADE, evidence: { type: 'string' }, transfer: JUDGEMENT, consistency: JUDGEMENT },
            required: ['grade', 'evidence', 'transfer', 'consistency'],
          },
          cohesion: JUDGEMENT,
          expression: JUDGEMENT,
        },
        required: [...RUBRIC_AXIS_KEYS],
      },
      strengths: { type: 'string' },
    },
    required: ['rubric', 'strengths'],
  },
};

export interface Regrade { rubric: Rubric; strengths: string }

export function parseRegrade(x: unknown): Regrade {
  const d = obj(x, 'regrade');
  return { rubric: parseRubric(d.rubric), strengths: typeof d.strengths === 'string' ? d.strengths.trim().slice(0, 400) : '' };
}
