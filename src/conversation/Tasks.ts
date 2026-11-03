// 과제 표를 다루는 작은 연산 — 모두 새 상태를 돌려준다 (받은 상태는 그대로)
import { activeTask, type Open, type SessionState, type Task, type TaskStatus } from '../state';

const squash = (x: string) => x.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').trim();

export class Tasks {
  static update(s: SessionState, id: string, patch: Partial<Task>): SessionState {
    return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
  }

  static find(s: SessionState, id: string | undefined): Task | undefined {
    return s.tasks.find((t) => t.id === id);
  }

  static firstPending(s: SessionState): Task | undefined {
    return s.tasks.find((t) => t.status === 'pending');
  }

  // 과제 턴 수는 과제가 active일 때만 센다
  static countTurn(s: SessionState): SessionState {
    const t = activeTask(s);
    return t ? Tasks.update(s, t.id, { turns: t.turns + 1 }) : s;
  }

  // 과제 시작 — 단계가 과제 종류(content/form)로, 화제가 과제 대상으로 바뀐다
  static start(s: SessionState, id: string, now: number): SessionState {
    const t = Tasks.find(s, id);
    if (!t) return s;
    const s1 = Tasks.update(s, id, { status: 'active', startedAt: now });
    return { ...s1, stage: t.kind, topic: { ...t.target }, open: null, confusedStreak: 0 }; // 막힘 횟수는 과제마다 새로
  }

  // 지금 과제를 잠시 내려놓는다 (학생 안건 먼저) — pending으로 돌리고 들은 경험·턴 수는 그대로 둔다
  static park(s: SessionState): SessionState {
    const t = activeTask(s);
    return t ? Tasks.update(s, t.id, { status: 'pending' }) : s;
  }

  // 지금 과제를 끝낸다 (done 이외의 끝 — timeout 등)
  static finish(s: SessionState, status: TaskStatus, now: number): SessionState {
    const t = activeTask(s);
    return t ? Tasks.update(s, t.id, { status, endedAt: now }) : s;
  }

  static skip(s: SessionState, id: string, reason: string, now: number): SessionState {
    return Tasks.update(s, id, { status: 'skipped', endedAt: now, evidence: reason });
  }

  // 과제 시작 제안(P1, effect=startTask)
  static proposal(say: string, t: Task): Open {
    return { pattern: 'P1', firstPair: say, effect: 'startTask', taskId: t.id };
  }

  // 튜터가 준 시범 문장이 고친 문단에 그대로 들어갔나 (따옴표·공백 무시)
  static exemplarUsed(t: Task, after: string): boolean {
    return !!t.exemplar && squash(after).includes(squash(t.exemplar));
  }
}
