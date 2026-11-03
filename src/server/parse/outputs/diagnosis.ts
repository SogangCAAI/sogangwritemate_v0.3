// 진단 출력 — 과제 정확히 3개 + 브리핑 3파트 + 평가(주장별 근거 등급)
import type { Tool } from '../../llm/LlmClient';
import type { Assessment, Evidence, Task } from '../../../state';
import { clip, fail, firstN, num, obj, oneOf, strList } from '../fields';
import { KINDS } from '../RequestParser';

export const DIAGNOSE_TOOL: Tool = {
  name: 'diagnose',
  description: '과제 3개와 브리핑 3파트',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['content', 'form'] },
            paragraph: { type: 'integer' },
            keyword: { type: 'string' },
            goal: { type: 'string' },
            doneWhen: { type: 'string' },
            opener: { type: 'string' },
          },
          required: ['kind', 'paragraph', 'keyword', 'goal', 'doneWhen', 'opener'],
        },
      },
      briefing: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
      assessment: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          claims: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                paragraph: { type: 'integer' },
                claim: { type: 'string' },
                evidence: { type: 'string', enum: ['strong', 'weak', 'none'] },
                note: { type: 'string' },
              },
              required: ['paragraph', 'claim', 'evidence', 'note'],
            },
          },
        },
        required: ['summary', 'claims'],
      },
    },
    required: ['tasks', 'briefing', 'assessment'],
  },
};

export interface Diagnosis { tasks: Task[]; briefing: string[]; assessment: Assessment }

const EVIDENCE: readonly Evidence[] = ['strong', 'weak', 'none'];
const MAX_CLAIMS = 8;

// 평가는 학생이 그대로 읽는다 — 글에 없는 문단을 가리키는 항목은 버린다
function parseAssessment(x: unknown, paragraphCount: number): Assessment {
  const a = obj(x, 'diagnosis.assessment');
  if (!Array.isArray(a.claims)) fail('assessment.claims: 목록이 아니에요.');
  const claims = a.claims.slice(0, MAX_CLAIMS).map((v, i) => {
    const c = obj(v, `assessment.claims[${i}]`);
    return {
      paragraph: num(c.paragraph, 'claim.paragraph'),
      claim: clip(c.claim, 'claim.claim', 200),
      evidence: oneOf(c.evidence, EVIDENCE, 'claim.evidence'),
      note: clip(c.note, 'claim.note', 300),
    };
  }).filter((c) => Number.isInteger(c.paragraph) && c.paragraph >= 1 && c.paragraph <= paragraphCount);
  return { summary: clip(a.summary, 'assessment.summary', 400), claims };
}

// 진단은 과제 정확히 3개 + 브리핑 3파트. 내용 과제가 앞에 오도록 코드가 다시 세운다
export function parseDiagnosis(x: unknown, paragraphCount: number): Diagnosis {
  const d = obj(x, 'diagnosis');
  const taskList = firstN(d.tasks, 3);
  if (!Array.isArray(taskList) || taskList.length !== 3) fail('diagnosis.tasks: 과제가 3개보다 적어요.');
  const briefing = strList(firstN(d.briefing, 3), 'diagnosis.briefing', 3).map((b) => b.trim().slice(0, 600));
  if (briefing.length !== 3) fail('diagnosis.briefing: 파트가 3개가 아니에요.');
  const raw = taskList.map((v, i) => {
    const t = obj(v, `diagnosis.tasks[${i}]`);
    // 글 범위를 벗어난 문단 번호는 실패 대신 범위 안으로 맞춘다 (모델 출력이라 보정한다)
    const paragraph = Math.min(Math.max(Math.round(num(t.paragraph, 'task.paragraph')), 1), paragraphCount);
    return {
      kind: oneOf(t.kind, KINDS, 'task.kind'),
      paragraph,
      keyword: clip(t.keyword, 'task.keyword', 60),
      goal: clip(t.goal, 'task.goal', 120),
      doneWhen: clip(t.doneWhen, 'task.doneWhen', 300),
      opener: clip(t.opener, 'task.opener', 300),
    };
  });
  const ordered = [...raw.filter((t) => t.kind === 'content'), ...raw.filter((t) => t.kind === 'form')];
  const tasks: Task[] = ordered.map((t, i) => ({
    id: `t${i + 1}`, order: (i + 1) as 1 | 2 | 3, kind: t.kind,
    target: { paragraph: t.paragraph, keyword: t.keyword }, goal: t.goal, doneWhen: t.doneWhen, opener: t.opener,
    status: 'pending', fromExemplar: false, turns: 0, edits: 0, experience: [], nudged: false,
  }));
  return { tasks, briefing, assessment: parseAssessment(d.assessment, paragraphCount) };
}
