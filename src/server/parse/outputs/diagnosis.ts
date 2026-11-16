// 진단 출력 — 채점 루브릭(5축 × 하/중/상, v2와 같은 판정) + 잘한 점 + 과제 정확히 3개 + 브리핑 3파트
import type { Tool } from '../../llm/LlmClient';
import type { Criterion, Task } from '../../../state';
import { findCliches } from '../../../checks';
import {
  axisRank, RUBRIC_AXIS_KEYS, RUBRIC_GRADES, worstJudged,
  type AlignmentSubKey, type Rubric, type RubricAxisKey, type RubricAxisResult, type RubricGrade, type RubricJudgement,
} from '../../../rubric';
import { clip, fail, firstN, num, obj, oneOf, type Obj } from '../fields';
import { KINDS } from '../RequestParser';
import { DIAGNOSE } from '../../../prompts';

const GRADE = { type: 'string', enum: [...RUBRIC_GRADES] };
const JUDGEMENT = { type: 'object', properties: { grade: GRADE, evidence: { type: 'string' } }, required: ['grade', 'evidence'] };

// 속성 순서 = 모델이 쓰는 순서. 루브릭을 먼저 판정하고, 그 판정에서 과제를 고른다
export const DIAGNOSE_TOOL: Tool = {
  name: 'diagnose',
  description: '채점 루브릭 5축 판정, 과제 3개, 브리핑 3파트',
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
      tasks: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            axis: { type: 'string', enum: [...RUBRIC_AXIS_KEYS] },
            kind: { type: 'string', enum: ['content', 'form', 'structure'] },
            paragraph: { type: 'integer' },
            paragraphs: { type: 'array', items: { type: 'integer' } },
            keyword: { type: 'string' },
            goal: { type: 'string' },
            criteria: {
              type: 'array',
              items: { type: 'object', properties: { text: { type: 'string' }, needsNew: { type: 'boolean' } }, required: ['text', 'needsNew'] },
            },
            doneWhen: { type: 'string' },
            opener: { type: 'string' },
          },
          required: ['axis', 'kind', 'paragraph', 'paragraphs', 'keyword', 'goal', 'criteria', 'doneWhen', 'opener'],
        },
      },
      briefing: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    },
    required: ['rubric', 'strengths', 'tasks', 'briefing'],
  },
};

export interface Diagnosis { tasks: Task[]; briefing: string[]; rubric: Rubric; strengths: string }

const MAX_EVIDENCE = 400;
const MAX_STRENGTHS = 400;
const UNJUDGED: RubricJudgement = { grade: '판정불가', evidence: '' };

const asObj = (x: unknown): Obj | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null);
const text = (x: unknown, max: number): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');

// 축 하나 — 모양이 틀리거나 모르는 등급이면 실패 대신 그 축만 판정불가 ('판정 불가' 같은 띄어쓰기 변형은 받는다)
function judgement(x: unknown): RubricJudgement {
  const o = asObj(x);
  if (!o) return UNJUDGED;
  const grade = String(o.grade ?? '').replace(/\s+/g, '') as RubricGrade;
  if (!RUBRIC_GRADES.includes(grade)) return UNJUDGED;
  return { grade, evidence: text(o.evidence, MAX_EVIDENCE) };
}

// 정합성 — 하위 둘(transfer · consistency)을 따로 읽고, 축 등급은 판정할 수 있었던 하위 중 가장 나쁜 것
function alignment(x: unknown): RubricAxisResult {
  const head = judgement(x);
  const o = asObj(x);
  const present = (['transfer', 'consistency'] as const).filter((k) => o && asObj(o[k]));
  const sub: Partial<Record<AlignmentSubKey, RubricJudgement>> = Object.fromEntries(present.map((k) => [k, judgement(o?.[k])]));
  if (!sub.transfer && !sub.consistency) return head;
  const worst = worstJudged([sub.transfer?.grade, sub.consistency?.grade]);
  return { ...head, grade: worst ?? head.grade, sub };
}

// 루브릭은 진단 전체를 실패시키지 않는다 — 빠진 축은 판정불가로 둔다
export function parseRubric(x: unknown): Rubric {
  const o = asObj(x) ?? {};
  const entries = RUBRIC_AXIS_KEYS.map((k): [RubricAxisKey, RubricAxisResult] => [k, k === 'alignment' ? alignment(o[k]) : judgement(o[k])]);
  return Object.fromEntries(entries) as Rubric;
}

const isAxis = (x: unknown): x is RubricAxisKey => RUBRIC_AXIS_KEYS.includes(x as RubricAxisKey);

const MAX_CRITERIA = 3;
interface RawCriterion { text: string; needsNew: boolean }
const rawCriterion = (x: unknown): RawCriterion | null => {
  if (typeof x === 'string') return x.trim() ? { text: x.trim().slice(0, 200), needsNew: false } : null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  return typeof o.text === 'string' && o.text.trim() ? { text: o.text.trim().slice(0, 200), needsNew: o.needsNew === true } : null;
};

// 완료 항목 — 모델이 낸 관찰 문장(llm, 3개까지, 각각 '새 내용'인지) + 코드가 넣는 항목. 모델이 비우면 doneWhen 한 문장이 항목이 된다.
// 코드 항목: ① 대상 문단에 상투 표현이 있고 글을 고치는(form) 과제면 "상투 표현이 없다"(코드가 검사) ② 새 내용을 요구하는 항목이 없으면 하나 넣는다
function criteriaOf(raw: unknown, doneWhen: string, kind: Task['kind'], paragraph: number, paragraphs: readonly string[], lang: 'ko' | 'en'): Criterion[] {
  const given = Array.isArray(raw) ? raw.map(rawCriterion).filter((x): x is RawCriterion => !!x) : [];
  const texts = (given.length ? given : [{ text: doneWhen, needsNew: false }]).slice(0, MAX_CRITERIA);
  const items: Criterion[] = texts.map((c, i) => ({ id: `c${i + 1}`, text: c.text, check: 'llm', source: 'diagnosis', met: false, ...(c.needsNew ? { needsNew: true } : {}) }));
  const para = paragraphs[paragraph - 1] ?? '';
  if (kind === 'form' && findCliches([para]).length) items.push({ id: 'k1', text: DIAGNOSE.noClicheItem[lang](paragraph), check: 'noCliche', source: 'code', met: false });
  // 구조 과제(문장 이동·문단 삭제)는 새 내용을 요구하지 않는다 — 옮긴 문장은 원래 글에 있던 것이다
  if (kind !== 'structure' && !items.some((c) => c.needsNew)) items.push({ id: 'n1', text: DIAGNOSE.needsNewItem[lang](paragraph, kind), check: 'llm', source: 'code', met: false, needsNew: true });
  return items;
}

// 진단은 과제 정확히 3개 + 브리핑 3파트. 과제 순서는 코드가 루브릭으로 다시 세운다 (가장 낮은 축 먼저 — v2 decideTargetStage)
export function parseDiagnosis(x: unknown, paragraphs: readonly string[], lang: 'ko' | 'en' = 'ko'): Diagnosis {
  const paragraphCount = paragraphs.length;
  const d = obj(x, 'diagnosis');
  const rubric = parseRubric(d.rubric);
  const strengths = text(d.strengths, MAX_STRENGTHS);
  const taskList = firstN(d.tasks, 3);
  if (!Array.isArray(taskList) || taskList.length !== 3) fail('diagnosis.tasks: 과제가 3개보다 적어요.');
  const briefingRaw = firstN(d.briefing, 3);
  if (!Array.isArray(briefingRaw) || briefingRaw.length !== 3 || !briefingRaw.every((b) => typeof b === 'string')) fail('diagnosis.briefing: 파트가 3개가 아니에요.');
  const briefing = (briefingRaw as string[]).map((b) => b.trim().slice(0, 600));
  const raw = taskList.map((v, i) => {
    const t = obj(v, `diagnosis.tasks[${i}]`);
    // 글 범위를 벗어난 문단 번호는 실패 대신 범위 안으로 맞춘다 (모델 출력이라 보정한다)
    const clampP = (n: number) => Math.min(Math.max(Math.round(n), 1), paragraphCount);
    const paragraph = clampP(num(t.paragraph, 'task.paragraph'));
    // 손댈 수 있는 문단들 — 모델이 낸 것 + 주 문단. 구조 과제가 아니면 주 문단 하나로 둔다 (한 문단에 집중)
    const extra = Array.isArray(t.paragraphs) ? t.paragraphs.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).map(clampP) : [];
    const touched = [...new Set([paragraph, ...extra])].sort((a, b) => a - b);
    // 축을 모르면 맨 뒤로 (모델이 낸 순서는 지킨다)
    const axis = isAxis(t.axis) ? t.axis : undefined;
    const rank = axis ? axisRank(rubric, axis) : Number.MAX_SAFE_INTEGER;
    const kind = oneOf(t.kind, KINDS, 'task.kind');
    const doneWhen = clip(t.doneWhen, 'task.doneWhen', 300);
    return {
      rank, i, kind, paragraph, axis, doneWhen,
      paragraphs: kind === 'structure' ? touched : [paragraph],
      keyword: clip(t.keyword, 'task.keyword', 60),
      goal: clip(t.goal, 'task.goal', 120),
      criteria: criteriaOf(t.criteria, doneWhen, kind, paragraph, paragraphs, lang),
      opener: clip(t.opener, 'task.opener', 300),
    };
  });
  const ordered = [...raw].sort((a, b) => a.rank - b.rank || a.i - b.i);
  const tasks: Task[] = ordered.map((t, i) => ({
    id: `t${i + 1}`, order: (i + 1) as 1 | 2 | 3, kind: t.kind, axis: t.axis,
    target: { paragraph: t.paragraph, keyword: t.keyword, ...(t.paragraphs.length > 1 ? { paragraphs: t.paragraphs } : {}) }, goal: t.goal, doneWhen: t.doneWhen, criteria: t.criteria, opener: t.opener,
    status: 'pending', turns: 0, edits: 0, experience: [], nudged: false, notes: [], stuckCount: 0, check: { asked: 0, claimOk: false },
  }));
  return { tasks, briefing, rubric, strengths };
}
