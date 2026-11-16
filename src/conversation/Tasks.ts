// 과제 표를 다루는 작은 연산 — 모두 새 상태를 돌려준다 (받은 상태는 그대로)
import { activeTask, type Criterion, type Open, type SessionState, type Task, type TaskStatus, type Verdict } from '../state';

const MAX_NOTES = 12;

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

  // ── 완료 항목 (체크리스트, 2026-11-16) ──

  // 결론 확인(A2.6)을 학생이 받았다 — 합의한 항목이 진단의 초안(llm 항목)을 대신한다. 코드 항목(상투 표현 · 새 내용)은 그대로.
  // 내용 과제의 합의 항목은 학생이 꺼낸 경험이라 모두 '새 내용'이다 — 그러면 코드가 넣어 둔 일반 새-내용 항목(n1)은 뺀다.
  // 모델이 항목을 내지 않았으면 결론 문장 자체를 항목 하나로 쓴다 (합의한 내용이 글에 들어가야 한다)
  static confirmCriteria(s: SessionState, id: string, agreed: readonly string[], conclusion: string): SessionState {
    const t = Tasks.find(s, id);
    if (!t) return s;
    const texts = agreed.map((x) => x.trim()).filter(Boolean).slice(0, 3);
    const items = texts.length ? texts : [conclusion.trim()].filter(Boolean);
    const needsNew = t.kind === 'content';
    const fresh: Criterion[] = items.map((text, i) => ({ id: `a${i + 1}`, text, check: 'llm', source: 'conclusion', met: false, ...(needsNew ? { needsNew: true } : {}) }));
    const kept = t.criteria.filter((c) => c.source === 'code' && !(needsNew && c.id === 'n1'));
    return Tasks.update(s, id, { criteria: [...fresh, ...kept], evidence: conclusion });
  }

  // 결론 확인을 거쳐 항목이 확정됐나 (학생과 합의한 항목이 하나라도 있나)
  static confirmed(t: Task): boolean {
    return t.criteria.some((c) => c.source === 'conclusion');
  }

  // 재평가 결과를 항목에 적는다 — met인 항목만 참(근거 인용도 함께), 나머지는 거짓 (학생이 지웠을 수도 있다)
  static applyVerdict(s: SessionState, id: string, v: Verdict): SessionState {
    const t = Tasks.find(s, id);
    if (!t) return s;
    return Tasks.update(s, id, {
      criteria: t.criteria.map((c) => {
        const met = v.met.includes(c.id);
        const evidence = met ? v.evidence?.[c.id] ?? c.evidence : undefined;
        return { ...c, met, ...(evidence ? { evidence } : {}) };
      }),
    });
  }

  // 이미 정해진 것을 기록한다 — 같은 말은 한 번만, 오래된 것부터 밀어낸다
  static note(s: SessionState, id: string, text: string): SessionState {
    const t = Tasks.find(s, id);
    const line = text.trim();
    if (!t || !line || t.notes.includes(line)) return s;
    return Tasks.update(s, id, { notes: [...t.notes, line].slice(-MAX_NOTES) });
  }

  // 이 과제가 손댈 수 있는 문단들 (주 문단 포함)
  static targets(t: Task): readonly number[] {
    const all = t.target.paragraphs ?? [];
    return all.includes(t.target.paragraph) ? all : [t.target.paragraph, ...all];
  }

  static isTarget(t: Task, paragraph: number): boolean {
    return Tasks.targets(t).includes(paragraph);
  }

  // 아직 못 채운 항목
  static unmet(t: Task): readonly Criterion[] {
    return t.criteria.filter((c) => !c.met);
  }
}
