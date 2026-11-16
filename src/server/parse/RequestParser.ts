// 클라이언트 요청 검사 — 본문·상태·글 맥락·대화 기록. 클라이언트가 보낸 상태를 그대로 믿지 않고 모양을 다시 세운다 (모르는 필드는 버림)
import {
  type CaCounts, type Criterion, type Lang, type Open, type SessionState, type Stage, type Task, type TaskKind, type TaskStatus,
  PATTERNS,
} from '../../state';
import { RUBRIC_AXIS_KEYS } from '../../rubric';
import { bool, fail, num, obj, oneOf, optNum, optStr, str, strList, ValidationError, type Obj } from './fields';

export const LANGS: readonly Lang[] = ['ko', 'en'];
export const KINDS: readonly TaskKind[] = ['content', 'form', 'structure'];
const STAGES: readonly Stage[] = ['opening', 'briefing', 'content', 'form', 'structure', 'closing', 'ended'];
const STATUSES: readonly TaskStatus[] = ['pending', 'active', 'done', 'skipped', 'timeout'];

export interface Context { posting: string; paragraphs: string[]; resume: string }
export interface Line { who: 'tutor' | 'student'; text: string }

// 0 이상의 정수
function count(x: unknown, name: string): number {
  const n = num(x, name);
  return Number.isInteger(n) && n >= 0 ? n : fail(`${name}: 0 이상의 정수가 아니에요.`);
}

const CHECKS = ['llm', 'noCliche'] as const;
const SOURCES = ['diagnosis', 'conclusion', 'code'] as const;

function parseCriterion(x: unknown, i: number): Criterion {
  const c = obj(x, `criteria[${i}]`);
  return {
    id: str(c.id, 'criterion.id', 20),
    text: str(c.text, 'criterion.text', 300),
    check: oneOf(c.check, CHECKS, 'criterion.check'),
    source: oneOf(c.source, SOURCES, 'criterion.source'),
    met: bool(c.met, 'criterion.met'),
    ...(c.evidence === undefined ? {} : { evidence: str(c.evidence, 'criterion.evidence', 400) }),
    ...(c.needsNew === undefined ? {} : { needsNew: bool(c.needsNew, 'criterion.needsNew') }),
  };
}

function numList(x: unknown, name: string): number[] {
  if (!Array.isArray(x) || x.length > 20) fail(`${name}: 목록이 아니거나 너무 길어요.`);
  return x.map((v, i) => num(v, `${name}[${i}]`));
}

function parseCheck(x: unknown): Task['check'] {
  const c = obj(x, 'task.check');
  return { asked: count(c.asked, 'task.check.asked'), claimOk: bool(c.claimOk, 'task.check.claimOk') };
}

function parseTask(x: unknown, i: number): Task {
  const t = obj(x, `tasks[${i}]`);
  const target = obj(t.target, `tasks[${i}].target`);
  if (t.criteria !== undefined && (!Array.isArray(t.criteria) || t.criteria.length > 6)) fail('task.criteria: 목록이 아니거나 너무 길어요.');
  return {
    id: str(t.id, 'task.id', 40),
    order: oneOf(t.order as never, [1, 2, 3] as never[], 'task.order'),
    kind: oneOf(t.kind, KINDS, 'task.kind'),
    target: {
      keyword: optStr(target.keyword, 'task.keyword'), paragraph: num(target.paragraph, 'task.paragraph'),
      ...(target.paragraphs === undefined ? {} : { paragraphs: numList(target.paragraphs, 'task.paragraphs') }),
    },
    axis: t.axis === undefined ? undefined : oneOf(t.axis, RUBRIC_AXIS_KEYS, 'task.axis'),
    goal: str(t.goal, 'task.goal', 300),
    doneWhen: str(t.doneWhen, 'task.doneWhen', 500),
    // 2026-11-16에 더한 칸 — 예전 상태에는 없으니 빈 목록 (doneWhen 한 문장으로 판정)
    criteria: t.criteria === undefined ? [] : (t.criteria as unknown[]).map(parseCriterion),
    opener: str(t.opener, 'task.opener', 400),
    status: oneOf(t.status, STATUSES, 'task.status'),
    evidence: optStr(t.evidence, 'task.evidence'),
    // fromExemplar · exemplar(시범 문장)는 2026-11-16에 없앴다 — 예전 상태가 보내면 무시한다
    startedAt: optNum(t.startedAt, 'task.startedAt'),
    endedAt: optNum(t.endedAt, 'task.endedAt'),
    turns: num(t.turns, 'task.turns'),
    edits: num(t.edits, 'task.edits'),
    experience: strList(t.experience, 'task.experience', 50),
    // 2026-11-16에 더한 칸 — 예전 상태에는 없으니 빈 값
    notes: t.notes === undefined ? [] : strList(t.notes, 'task.notes', 20, 400),
    lastHint: optStr(t.lastHint, 'task.lastHint'),
    stuckOn: optStr(t.stuckOn, 'task.stuckOn'),
    stuckCount: t.stuckCount === undefined ? 0 : count(t.stuckCount, 'task.stuckCount'),
    check: t.check === undefined ? { asked: 0, claimOk: false } : parseCheck(t.check),
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
    criteria: o.criteria === undefined ? undefined : strList(o.criteria, 'open.criteria', 3, 300),
  };
}

export class RequestParser {
  static async body(req: Request): Promise<Obj> {
    if (req.method !== 'POST') throw new ValidationError('POST만 받아요.');
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError('요청 본문이 JSON이 아니에요.');
    }
    return obj(raw, 'body');
  }

  static state(x: unknown): SessionState {
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
      // 2026-11-03에 더한 칸 — 예전 상태에는 없으니 0으로 본다
      confusedStreak: s.confusedStreak === undefined ? 0 : count(s.confusedStreak, 'state.confusedStreak'),
      offGoalCount: s.offGoalCount === undefined ? 0 : count(s.offGoalCount, 'state.offGoalCount'),
      tasks: s.tasks.map(parseTask),
      startedAt: num(s.startedAt, 'state.startedAt'),
      helped: s.helped === null ? null : bool(s.helped, 'state.helped'),
      closeOffered: bool(s.closeOffered, 'state.closeOffered'),
    };
  }

  // 끼어들기 집계 (선택) — 없으면 0/0 (표본 부족 = 짧게 하지 않음)
  static ca(x: unknown): CaCounts {
    if (x === undefined || x === null) return { bargeIns: 0, botTurns: 0 };
    const c = obj(x, 'ca');
    return { bargeIns: count(c.bargeIns, 'ca.bargeIns'), botTurns: count(c.botTurns, 'ca.botTurns') };
  }

  static context(x: unknown): Context {
    const c = obj(x, 'context');
    const paragraphs = strList(c.paragraphs, 'paragraphs', 20);
    if (paragraphs.length === 0) fail('paragraphs: 문단이 하나 이상 있어야 해요.');
    // 공고·이력서는 선택 — 없으면 빈 문자열 (사용자 결정 2026-11-03 · 이력서는 2026-11-16부터 턴·재평가에도 준다)
    return {
      posting: c.posting === undefined ? '' : str(c.posting, 'posting', 6000).trim(),
      paragraphs,
      resume: c.resume === undefined ? '' : str(c.resume, 'resume', 6000).trim(),
    };
  }

  static history(x: unknown): Line[] {
    if (!Array.isArray(x)) fail('history: 목록이 아니에요.');
    return x.slice(-12).map((v, i) => {
      const l = obj(v, `history[${i}]`);
      return { who: oneOf(l.who, ['tutor', 'student'] as const, 'history.who'), text: str(l.text, 'history.text') };
    });
  }

  static lang(x: unknown): Lang {
    return oneOf(x, LANGS, 'lang');
  }
}
