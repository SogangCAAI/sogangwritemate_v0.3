// 클라이언트 요청 검사 — 본문·상태·글 맥락·대화 기록. 클라이언트가 보낸 상태를 그대로 믿지 않고 모양을 다시 세운다 (모르는 필드는 버림)
import {
  type Lang, type Open, type SessionState, type Stage, type Task, type TaskKind, type TaskStatus,
  PATTERNS,
} from '../../state';
import { bool, fail, num, obj, oneOf, optNum, optStr, str, strList, ValidationError, type Obj } from './fields';

export const LANGS: readonly Lang[] = ['ko', 'en'];
export const KINDS: readonly TaskKind[] = ['content', 'form'];
const STAGES: readonly Stage[] = ['opening', 'briefing', 'content', 'form', 'closing', 'ended'];
const STATUSES: readonly TaskStatus[] = ['pending', 'active', 'done', 'skipped', 'timeout'];

export interface Context { posting: string; paragraphs: string[] }
export interface Line { who: 'tutor' | 'student'; text: string }

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
      tasks: s.tasks.map(parseTask),
      startedAt: num(s.startedAt, 'state.startedAt'),
      helped: s.helped === null ? null : bool(s.helped, 'state.helped'),
      closeOffered: bool(s.closeOffered, 'state.closeOffered'),
    };
  }

  static context(x: unknown): Context {
    const c = obj(x, 'context');
    const paragraphs = strList(c.paragraphs, 'paragraphs', 20);
    if (paragraphs.length === 0) fail('paragraphs: 문단이 하나 이상 있어야 해요.');
    // 공고는 선택 — 없으면 빈 문자열 (사용자 결정 2026-11-03)
    return { posting: c.posting === undefined ? '' : str(c.posting, 'posting', 6000).trim(), paragraphs };
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
