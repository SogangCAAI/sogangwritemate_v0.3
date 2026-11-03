// next(state, judge, event) — 상태 이동·과제 전환·종료의 유일한 자리 (NCF 문서 5절)
// 순수 함수: 입력 상태를 바꾸지 않고 새 상태를 돌려준다. LLM·시계·네트워크 없음 (시각은 event.now로 받는다).
import {
  activeTask, CLOSE_WARN_MS, TASK_BUDGET_MS,
  type Judge, type Lang, type Open, type Outcome, type SessionState, type Task, type TaskStatus, type TurnEvent,
} from './state';
import { closingParts, lines } from './lines';
import { sessionLeftMs } from './checks';

export function next(s: SessionState, judge: Judge | null, ev: TurnEvent): Outcome {
  if (s.stage === 'ended') return out(s, null, 'none');
  if (ev.kind === 'pause') return onPause(s);
  if (ev.kind === 'edit') return onEdit(s, ev);
  if (!judge) throw new Error('next(): 학생 발화에는 판정이 필요합니다');
  return onSay(countTurn(s), judge, ev.text, ev.now);
}

// 클라이언트가 쉼(맞장구로 보는 침묵) 이벤트를 보내야 하는 상태인가
export function wantsPause(s: SessionState): boolean {
  if (s.stage === 'ended') return false;
  if (s.open?.pattern === 'A3') return true;
  return s.stage !== 'closing' && s.open === null && !activeTask(s);
}

// 학생이 대상 문단을 고쳤을 때 재평가(Haiku)를 불러야 하나 — 시범 문장을 그대로 넣었으면 부르지 않는다
export function editNeedsEval(s: SessionState, paragraph: number, after: string): boolean {
  const t = activeTask(s);
  return !!t && t.target.paragraph === paragraph && !exemplarUsed(t, after);
}

export function newSession(a: {
  id: string; lang: Lang; tasks: Task[]; briefing: string[]; now: number;
}): SessionState {
  const L = lines(a.lang);
  const [b1 = '', b2 = '', b3 = ''] = a.briefing;
  const parts = [L.greeting, b1, b2, `${b3} ${L.firstTask(a.tasks[0]?.goal ?? '')}`.trim()];
  return {
    id: a.id, lang: a.lang, stage: 'opening',
    open: { pattern: 'A3', firstPair: L.greeting, parts, part: 0 },
    topic: {}, last: { played: L.greeting, paraphrase: '', example: '' },
    repaired: false, unclearStreak: 0, tasks: a.tasks, startedAt: a.now, helped: null, closeOffered: false,
  };
}

// ── 학생 발화 ──

function onSay(s: SessionState, j: Judge, text: string, now: number): Outcome {
  const L = lines(s.lang);
  switch (j.move) {
    // 수리는 직전에 만들어 둔 last.*로 답한다 — 모델의 reply는 버린다. last는 그대로 둬서 거듭 물어도 원래 말 기준
    case 'REPEAT_REQ': return out({ ...s, repaired: true }, s.last.played, 'B2.1');
    case 'PARAPHRASE_REQ': return out({ ...s, repaired: true }, s.last.paraphrase || L.noParaphrase, 'B2.4');
    case 'EXAMPLE_REQ': return out({ ...s, repaired: true }, s.last.example || L.noExample, 'B2.6');
    case 'UNCLEAR': return unclear(s, j);
    case 'PRE_CLOSING': return startClosing(s, true);
    case 'ABORT': return abort(s, text, now);
  }
  const s0 = { ...s, unclearStreak: 0 };
  if (s0.open?.pattern === 'A3' && j.move !== 'USER_INQUIRY' && j.move !== 'EXEMPLAR_REQ') {
    return nextPart({ ...s0, repaired: false });
  }
  if (s0.stage === 'closing') return closingReply(s0, j);

  switch (j.move) {
    case 'USER_INQUIRY': return modelSays({ ...s0, repaired: true }, j, true); // A1: 답하고 원래 open 유지
    case 'EXEMPLAR_REQ': return modelSays({ ...s0, repaired: false }, j, false);
    case 'CONTINUER':
      // 맞장구는 튜터가 말하는 중의 것 — 학생이 경험을 이어 말하는 중(A5.1/A5.5)이면 답의 일부로 본다
      if (s0.open?.pattern === 'A5.1' || s0.open?.pattern === 'A5.5') return nudge(answer({ ...s0, repaired: false }, j, text), now);
      return modelSays({ ...s0, repaired: false }, j, true);
    case 'CLOSER':
      // B4.4: 수리·질문 직후의 "고마워요"는 그 곁가지만 닫는다
      if (s0.repaired) return { ...modelSays({ ...s0, repaired: false }, j, true), agentAction: 'B4.4' };
      return nudge(modelSays({ ...s0, open: null }, j, false), now);
    case 'ACCEPT': return accept({ ...s0, repaired: false }, j, now);
    case 'REJECT': return reject({ ...s0, repaired: false }, j, text, now);
    case 'ANSWER': return nudge(answer({ ...s0, repaired: false }, j, text), now);
  }
}

function unclear(s: SessionState, j: Judge): Outcome {
  const L = lines(s.lang);
  const n = s.unclearStreak + 1;
  if (n === 1) return out({ ...s, unclearStreak: 1 }, L.askAgain, 'B1.2.0'); // 팁은 첫 회부터 붙이지 않는다
  if (n === 2) return { ...modelSays({ ...s, unclearStreak: 2 }, j, true), agentAction: 'B1.2.1' }; // 모델이 예시를 붙여 다시 묻는다
  return codeSays({ ...s, unclearStreak: 0 }, L.giveUpUnclear, { pattern: 'P1', firstPair: L.giveUpUnclear }, 'B5.1');
}

function answer(s: SessionState, j: Judge, text: string): Outcome {
  const t = activeTask(s);
  const telling = s.open?.pattern === 'A5.1' || s.open?.pattern === 'A5.5';
  if (!telling) return modelSays({ ...s, open: null }, j, false);
  // A5.5: 학생이 이어 말하는 동안 원문을 그대로 모은다
  const s1 = t ? updateTask(s, t.id, { experience: [...t.experience, text] }) : s;
  return modelSays({ ...s1, open: { pattern: 'A5.5', firstPair: s.open!.firstPair } }, j, false);
}

function accept(s: SessionState, j: Judge, now: number): Outcome {
  const o = s.open;
  // 과제 시작을 받으면 진단이 만든 첫 질문을 코드가 바로 한다 — 모델에 맡기면 "시작해 볼게요"로 멈춰 학생이 먼저 말해야 했다
  if (o?.effect === 'startTask' && o.taskId) {
    const t = s.tasks.find((x) => x.id === o.taskId);
    if (t) return codeSays(startTask(s, t.id, now), `${lines(s.lang).startAck} ${t.opener}`, { pattern: 'A5.1', firstPair: t.opener }, 'A5.1');
  }
  if (o?.effect === 'moveOn') return proposeNext(finish(s, 'timeout', now));
  if (o?.effect === 'close') return startClosing(finish(s, 'timeout', now), true);
  const t = activeTask(s);
  // A2.6 결론 확인을 받았다 — 아직 done은 아니다 (글이 바뀌어야 한다)
  const s1 = o?.pattern === 'A2.6' && t ? updateTask(s, t.id, { evidence: o.firstPair }) : s;
  return nudge(modelSays({ ...s1, open: null }, j, false), now);
}

function reject(s: SessionState, j: Judge, text: string, now: number): Outcome {
  const o = s.open;
  // P1.1: 과제 시작 제안을 거절 → 그 과제는 건너뛰고 다음 후보 하나 (재설득 없음)
  if (o?.effect === 'startTask' && o.taskId) {
    const s1 = updateTask(s, o.taskId, { status: 'skipped', endedAt: now, evidence: text });
    return proposeNext({ ...s1, open: null }, lines(s.lang).ok);
  }
  // 시간 제안 거절 = 계속한다. nudged·closeOffered가 이미 켜져 있어 다시 묻지 않는다
  return modelSays({ ...s, open: null }, j, false);
}

function abort(s: SessionState, text: string, now: number): Outcome {
  const L = lines(s.lang);
  const base = { ...s, repaired: false, unclearStreak: 0 };
  if (s.stage === 'closing') return end(out(base, L.bye, 'B5'));
  if (s.open?.pattern === 'A3') {
    const t = firstPending(s);
    const say = t ? `${L.abortBriefing} ${L.firstTask(t.goal)}` : L.abortBriefing;
    return codeSays({ ...base, stage: 'briefing' }, say, t ? startProposal(say, t) : null, 'A3.1');
  }
  const t = activeTask(s) ?? (s.open?.effect === 'startTask' ? s.tasks.find((x) => x.id === s.open?.taskId) : undefined);
  if (!t) return codeSays({ ...base, open: null }, L.ok, null, 'B5');
  const s1 = updateTask(base, t.id, { status: 'skipped', endedAt: now, evidence: text });
  return codeSays({ ...s1, open: null }, L.abortTask, null, 'B5');
}

function closingReply(s: SessionState, j: Judge): Outcome {
  if (s.open?.pattern !== 'C4') return end(modelSays(s, j, true));
  const s1 = { ...s, helped: j.positive, open: null };
  // C4.7: 성공 확인이 부정이면 무엇이 걸리는지 한 번 더 듣고 끝낸다
  return j.positive ? end(modelSays(s1, j, true)) : modelSays(s1, j, false);
}

// ── 쉼 · 편집 ──

function onPause(s: SessionState): Outcome {
  if (s.open?.pattern === 'A3') return nextPart(s);
  if (wantsPause(s)) return proposeNext(s);
  return out(s, null, 'none');
}

function onEdit(s: SessionState, ev: Extract<TurnEvent, { kind: 'edit' }>): Outcome {
  const L = lines(s.lang);
  const t = activeTask(s);
  if (!t || t.target.paragraph !== ev.paragraph) return out(s, null, 'none');
  const edits = t.edits + 1;
  if (exemplarUsed(t, ev.after)) {
    const s1 = updateTask(s, t.id, { edits, status: 'done', endedAt: ev.now, fromExemplar: true, evidence: t.exemplar });
    return codeSays({ ...s1, open: null }, L.exemplarDone, null, 'done:exemplar');
  }
  if (!ev.verdict) return out(updateTask(s, t.id, { edits }), null, 'none');
  const { better } = ev.verdict;
  const reason = ev.verdict.reason || (better ? '' : L.tryAgain);
  if (better) {
    const s1 = updateTask(s, t.id, { edits, status: 'done', endedAt: ev.now, evidence: reason });
    return codeSays({ ...s1, open: null }, `${L.better} ${reason}`.trim(), null, 'done:eval');
  }
  // A4.1: 아직 부족 — reason이 곧 힌트 하나
  return codeSays(updateTask(s, t.id, { edits }), reason, { pattern: 'P1', firstPair: reason }, 'A4.1');
}

// ── 진행 ──

function nextPart(s: SessionState): Outcome {
  const idx = (s.open?.part ?? 0) + 1;
  const parts = s.open?.parts ?? [];
  if (idx >= parts.length) return out(s, null, 'none');
  return servePart({ ...s, stage: s.stage === 'opening' ? 'briefing' : s.stage }, idx, parts[idx]!);
}

function servePart(s: SessionState, idx: number, text: string): Outcome {
  const parts = s.open?.parts ?? [];
  if (idx < parts.length - 1) return codeSays(s, text, { pattern: 'A3', firstPair: text, parts, part: idx }, 'A3');
  if (s.stage === 'closing') return codeSays(s, text, { pattern: 'C4', firstPair: text }, 'C4.6');
  const t = firstPending(s);
  return codeSays(s, text, t ? startProposal(text, t) : null, 'A3');
}

function proposeNext(s: SessionState, lead = ''): Outcome {
  const t = firstPending(s);
  if (!t) return startClosing(s, true);
  const say = [lead, lines(s.lang).proposeTask(t.goal)].filter(Boolean).join(' ');
  return codeSays({ ...s, repaired: false }, say, startProposal(say, t), 'P1');
}

function startClosing(s: SessionState, withLead: boolean): Outcome {
  const L = lines(s.lang);
  const parts = closingParts(s.lang, s.tasks);
  const first = withLead ? `${L.closingLead} ${parts[0]}` : parts[0]!;
  const s1: SessionState = {
    ...s, stage: 'closing', repaired: false, unclearStreak: 0,
    open: { pattern: 'A3', firstPair: first, parts, part: 0 },
  };
  return { ...servePart(s1, 0, first), agentAction: 'C4.0' };
}

// 시간 예산은 강제가 아니라 제안이다 — 세션 마감이 과제 예산보다 먼저
function nudge(o: Outcome, now: number): Outcome {
  const s = o.state;
  if (s.open?.effect || (s.stage !== 'content' && s.stage !== 'form')) return o;
  const L = lines(s.lang);
  const left = sessionLeftMs(s, now);
  if (left <= CLOSE_WARN_MS) {
    // 마감이 가까우면 '다음 과제로' 제안은 하지 않는다 — 마무리 제안 한 번뿐
    if (s.closeOffered) return o;
    const say = L.closeSoon(Math.max(1, Math.ceil(left / 60_000)));
    return codeSays({ ...s, closeOffered: true }, say, { pattern: 'P1', firstPair: say, effect: 'close' }, 'P1:close');
  }
  const t = activeTask(s);
  if (t && !t.nudged && t.startedAt !== undefined && now - t.startedAt >= TASK_BUDGET_MS) {
    const say = L.moveOn(t.goal);
    return codeSays(updateTask(s, t.id, { nudged: true }), say, { pattern: 'P1', firstPair: say, effect: 'moveOn' }, 'P1:moveOn');
  }
  return o;
}

// ── 작은 도우미 ──

function out(state: SessionState, say: string | null, agentAction: string): Outcome {
  return { state, say, agentAction };
}

function end(o: Outcome): Outcome {
  return { ...o, state: { ...o.state, stage: 'ended', open: null } };
}

// 코드가 새로 말한 턴 — last를 이 말로 바꾼다 (바꿔 말하기·예시는 없음)
function codeSays(s: SessionState, say: string, open: Open | null, agentAction: string): Outcome {
  return out({ ...s, open, last: { played: say, paraphrase: '', example: '' } }, say, agentAction);
}

// 모델이 새로 말한 턴 — keepOpen이면 모델이 무엇을 열었든 지금 open을 유지한다
function modelSays(s: SessionState, j: Judge, keepOpen: boolean): Outcome {
  const open: Open | null = keepOpen || j.opens === 'none' ? s.open : { pattern: j.opens, firstPair: j.reply };
  const t = activeTask(s);
  const s1 = j.exemplar && t ? updateTask(s, t.id, { exemplar: j.exemplar }) : s;
  const last = { played: j.reply, paraphrase: j.paraphrase, example: j.example };
  return out({ ...s1, open, last }, j.reply, keepOpen || j.opens === 'none' ? 'reply' : j.opens);
}

function updateTask(s: SessionState, id: string, patch: Partial<Task>): SessionState {
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

function countTurn(s: SessionState): SessionState {
  const t = activeTask(s);
  return t ? updateTask(s, t.id, { turns: t.turns + 1 }) : s;
}

function startTask(s: SessionState, id: string, now: number): SessionState {
  const t = s.tasks.find((x) => x.id === id);
  if (!t) return s;
  const s1 = updateTask(s, id, { status: 'active', startedAt: now });
  return { ...s1, stage: t.kind, topic: { ...t.target }, open: null };
}

function finish(s: SessionState, status: TaskStatus, now: number): SessionState {
  const t = activeTask(s);
  return t ? updateTask(s, t.id, { status, endedAt: now }) : s;
}

function firstPending(s: SessionState): Task | undefined {
  return s.tasks.find((t) => t.status === 'pending');
}

function startProposal(say: string, t: Task): Open {
  return { pattern: 'P1', firstPair: say, effect: 'startTask', taskId: t.id };
}

const squash = (x: string) => x.replace(/["“”'‘’]/g, '').replace(/\s+/g, ' ').trim();

function exemplarUsed(t: Task, after: string): boolean {
  return !!t.exemplar && squash(after).includes(squash(t.exemplar));
}
