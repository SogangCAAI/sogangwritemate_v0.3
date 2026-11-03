// 신뢰 경계 검사 — 요청 본문(클라이언트가 보낸 상태 포함)과 LLM 도구 출력. 작은 손 검사만 쓴다.
import {
  MOVES, PATTERNS,
  type Assessment, type Evidence, type Judge, type Lang, type Move, type Open, type SessionState, type Stage, type Task, type TaskKind, type TaskStatus, type Verdict,
} from './state';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type Obj = Record<string, unknown>;

const MAX_TEXT = 4000;

function fail(msg: string): never {
  throw new ValidationError(msg);
}

export function obj(x: unknown, name: string): Obj {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : fail(`${name}: 객체가 아니에요.`);
}

export function str(x: unknown, name: string, max = MAX_TEXT): string {
  if (typeof x !== 'string') fail(`${name}: 글자가 아니에요.`);
  if (x.length > max) fail(`${name}: 너무 길어요 (${max}자까지).`);
  return x;
}

const optStr = (x: unknown, name: string): string | undefined => (x === undefined ? undefined : str(x, name));

export function num(x: unknown, name: string): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fail(`${name}: 숫자가 아니에요.`);
}

const optNum = (x: unknown, name: string): number | undefined => (x === undefined ? undefined : num(x, name));

export function oneOf<T extends string>(x: unknown, allowed: readonly T[], name: string): T {
  return allowed.includes(x as T) ? (x as T) : fail(`${name}: 허용되지 않는 값이에요.`);
}

function bool(x: unknown, name: string): boolean {
  return typeof x === 'boolean' ? x : fail(`${name}: 참/거짓이 아니에요.`);
}

export function strList(x: unknown, name: string, maxItems: number, maxLen = MAX_TEXT): string[] {
  if (!Array.isArray(x) || x.length > maxItems) fail(`${name}: 목록이 아니거나 너무 길어요.`);
  return x.map((v, i) => str(v, `${name}[${i}]`, maxLen));
}

export const LANGS: readonly Lang[] = ['ko', 'en'];
const STAGES: readonly Stage[] = ['opening', 'briefing', 'content', 'form', 'closing', 'ended'];
const STATUSES: readonly TaskStatus[] = ['pending', 'active', 'done', 'skipped', 'timeout'];
const KINDS: readonly TaskKind[] = ['content', 'form'];

function parseTask(x: unknown, i: number): Task {
  const t = obj(x, `tasks[${i}]`);
  const target = obj(t.target, `tasks[${i}].target`);
  return {
    id: str(t.id, 'task.id', 40),
    order: oneOf(t.order as never, [1, 2, 3] as never[], 'task.order'),
    kind: oneOf(t.kind, KINDS, 'task.kind'),
    target: { keyword: optStr(target.keyword, 'task.keyword'), paragraph: num(target.paragraph, 'task.paragraph') },
    goal: str(t.goal, 'task.goal', 300),
    doneWhen: str(t.doneWhen, 'task.doneWhen', 500),
    opener: str(t.opener, 'task.opener', 400),
    status: oneOf(t.status, STATUSES, 'task.status'),
    evidence: optStr(t.evidence, 'task.evidence'),
    fromExemplar: bool(t.fromExemplar, 'task.fromExemplar'),
    startedAt: optNum(t.startedAt, 'task.startedAt'),
    endedAt: optNum(t.endedAt, 'task.endedAt'),
    turns: num(t.turns, 'task.turns'),
    edits: num(t.edits, 'task.edits'),
    experience: strList(t.experience, 'task.experience', 50),
    exemplar: optStr(t.exemplar, 'task.exemplar'),
    nudged: bool(t.nudged, 'task.nudged'),
  };
}

function parseOpen(x: unknown): Open | null {
  if (x === null) return null;
  const o = obj(x, 'open');
  return {
    pattern: oneOf(o.pattern, PATTERNS, 'open.pattern'),
    firstPair: str(o.firstPair, 'open.firstPair'),
    parts: o.parts === undefined ? undefined : strList(o.parts, 'open.parts', 6),
    part: optNum(o.part, 'open.part'),
    effect: o.effect === undefined ? undefined : oneOf(o.effect, ['startTask', 'moveOn', 'close'] as const, 'open.effect'),
    taskId: optStr(o.taskId, 'open.taskId'),
  };
}

// 클라이언트가 보낸 상태를 그대로 믿지 않는다 — 모양을 다시 세운다 (모르는 필드는 버림)
export function parseState(x: unknown): SessionState {
  const s = obj(x, 'state');
  const last = obj(s.last, 'state.last');
  const topic = obj(s.topic, 'state.topic');
  if (!Array.isArray(s.tasks) || s.tasks.length < 1 || s.tasks.length > 3) fail('state.tasks: 과제는 1~3개예요.');
  return {
    id: str(s.id, 'state.id', 64),
    lang: oneOf(s.lang, LANGS, 'state.lang'),
    stage: oneOf(s.stage, STAGES, 'state.stage'),
    open: parseOpen(s.open),
    topic: { keyword: optStr(topic.keyword, 'topic.keyword'), paragraph: optNum(topic.paragraph, 'topic.paragraph') },
    last: { played: str(last.played, 'last.played'), paraphrase: str(last.paraphrase, 'last.paraphrase'), example: str(last.example, 'last.example') },
    repaired: bool(s.repaired, 'state.repaired'),
    unclearStreak: num(s.unclearStreak, 'state.unclearStreak'),
    tasks: s.tasks.map(parseTask),
    startedAt: num(s.startedAt, 'state.startedAt'),
    helped: s.helped === null ? null : bool(s.helped, 'state.helped'),
    closeOffered: bool(s.closeOffered, 'state.closeOffered'),
  };
}

export interface Context { posting: string; paragraphs: string[] }

export function parseContext(x: unknown): Context {
  const c = obj(x, 'context');
  const paragraphs = strList(c.paragraphs, 'paragraphs', 20);
  if (paragraphs.length === 0) fail('paragraphs: 문단이 하나 이상 있어야 해요.');
  // 공고는 선택 — 없으면 빈 문자열 (사용자 결정 2026-11-03)
  return { posting: c.posting === undefined ? '' : str(c.posting, 'posting', 6000).trim(), paragraphs };
}

export interface Line { who: 'tutor' | 'student'; text: string }

export function parseHistory(x: unknown): Line[] {
  if (!Array.isArray(x)) fail('history: 목록이 아니에요.');
  return x.slice(-12).map((v, i) => {
    const l = obj(v, `history[${i}]`);
    return { who: oneOf(l.who, ['tutor', 'student'] as const, 'history.who'), text: str(l.text, 'history.text') };
  });
}

// ── LLM 도구 출력 ──

export function parseJudge(x: unknown): Judge {
  const j = obj(x, 'judge');
  const reply = str(j.reply, 'judge.reply').trim();
  if (!reply) fail('judge.reply: 비어 있어요.');
  return {
    move: oneOf(j.move, MOVES, 'judge.move') as Move,
    reply,
    paraphrase: typeof j.paraphrase === 'string' ? j.paraphrase : '',
    example: typeof j.example === 'string' ? j.example : '',
    opens: oneOf(j.opens ?? 'none', [...PATTERNS, 'none'] as const, 'judge.opens'),
    exemplar: typeof j.exemplar === 'string' ? j.exemplar : '',
    positive: j.positive === true,
  };
}

export function parseVerdict(x: unknown): Verdict {
  const v = obj(x, 'verdict');
  const reason = str(v.reason, 'verdict.reason', 600).trim();
  if (!reason) fail('verdict.reason: 비어 있어요.');
  return { better: bool(v.better, 'verdict.better'), reason };
}

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
      claim: str(c.claim, 'claim.claim', 200).trim(),
      evidence: oneOf(c.evidence, EVIDENCE, 'claim.evidence'),
      note: str(c.note, 'claim.note', 300).trim(),
    };
  }).filter((c) => Number.isInteger(c.paragraph) && c.paragraph >= 1 && c.paragraph <= paragraphCount);
  return { summary: str(a.summary, 'assessment.summary', 400).trim(), claims };
}

// 진단은 과제 정확히 3개 + 브리핑 3파트. 내용 과제가 앞에 오도록 코드가 다시 세운다
export function parseDiagnosis(x: unknown, paragraphCount: number): Diagnosis {
  const d = obj(x, 'diagnosis');
  if (!Array.isArray(d.tasks) || d.tasks.length !== 3) fail('diagnosis.tasks: 과제가 정확히 3개가 아니에요.');
  const briefing = strList(d.briefing, 'diagnosis.briefing', 3, 600);
  if (briefing.length !== 3) fail('diagnosis.briefing: 파트가 3개가 아니에요.');
  const raw = d.tasks.map((v, i) => {
    const t = obj(v, `diagnosis.tasks[${i}]`);
    const paragraph = num(t.paragraph, 'task.paragraph');
    if (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > paragraphCount) fail('task.paragraph: 글에 없는 문단이에요.');
    return {
      kind: oneOf(t.kind, KINDS, 'task.kind'),
      paragraph,
      keyword: str(t.keyword, 'task.keyword', 60),
      goal: str(t.goal, 'task.goal', 120).trim(),
      doneWhen: str(t.doneWhen, 'task.doneWhen', 300).trim(),
      opener: str(t.opener, 'task.opener', 300).trim(),
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

export interface Summary { report: string; nextSteps: string[] }

export function parseSummary(x: unknown): Summary {
  const s = obj(x, 'summary');
  return { report: str(s.report, 'summary.report', 3000), nextSteps: strList(s.nextSteps, 'summary.nextSteps', 3, 400) };
}
