// v2 caJudge에서 옮긴 세 가지 — 막힘 사다리(CONFUSED) · 다른 요청(OFF_GOAL) · 끼어들기 비율 → 짧게
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { next } from '../src/decide';
import { Interruption } from '../src/conversation/Interruption';
import { lines } from '../src/lines';
import { PromptBook } from '../src/server/llm/PromptBook';
import { TurnPrompt } from '../src/server/llm/TurnPrompt';
import { parseJudge } from '../src/server/parse/LlmOutputParser';
import { RequestParser } from '../src/server/parse/RequestParser';
import { ValidationError } from '../src/server/parse/fields';
import { TurnResponder } from '../src/server/services/TurnResponder';
import { activeTask, type Judge, type Move, type Outcome, type SessionState } from '../src/state';
import { ESSAY, fresh, j, MIN, POSTING, T0 } from './fixture';

const L = lines('ko');
type Say = { move: Move; judge?: Partial<Judge>; at?: number; text?: string };

function say(s: SessionState, steps: Say[]): Outcome {
  let o: Outcome = { state: s, say: null, agentAction: 'none' };
  for (const st of steps) {
    o = next(o.state, j(st.move, st.judge), { kind: 'say', text: st.text ?? '음… 잘 모르겠어요', now: T0 + (st.at ?? 1) * MIN });
  }
  return o;
}

// 브리핑을 넘기고 과제 1(2문단 협업, content)을 시작한 상태 — t2(1문단)·t3(3문단, form)은 pending
const inTask1 = (): SessionState => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = next(s, null, { kind: 'pause', now: T0 }).state;
  return next(s, j('ACCEPT'), { kind: 'say', text: '네 좋아요.', now: T0 }).state;
};
const task = (s: SessionState, id: string) => s.tasks.find((t) => t.id === id)!;

// ── 1. 막힘 사다리 ──

test('막힘 1회 → 모델이 단서 하나 + 같은 질문 (clue_up, A5.1)', () => {
  const o = say(inTask1(), [{ move: 'CONFUSED', judge: { reply: '예를 들면 "축제 때 ~했다"처럼요. 같이 해낸 일이 있었어요?' } }]);
  assert.equal(o.state.confusedStreak, 1);
  assert.equal(o.agentAction, 'clue_up');
  assert.equal(o.state.open?.pattern, 'A5.1');
  assert.equal(o.say, '예를 들면 "축제 때 ~했다"처럼요. 같이 해낸 일이 있었어요?');
  assert.equal(activeTask(o.state)?.id, 't1');
});

test('막힘 2회 → 모델이 시범 한 문장 (exemplar, P1.4), 시범 문장 기록', () => {
  const o = say(inTask1(), [{ move: 'CONFUSED' }, { move: 'CONFUSED', judge: { exemplar: '예산표를 공유 시트로 만들었습니다.' } }]);
  assert.equal(o.state.confusedStreak, 2);
  assert.equal(o.agentAction, 'exemplar');
  assert.equal(o.state.open?.pattern, 'P1.4');
  assert.equal(task(o.state, 't1').exemplar, '예산표를 공유 시트로 만들었습니다.');
});

test('막힘 3회 → 코드가 과제를 미루고(skipped, 학생이 막힘) 다음 과제 제안, 횟수 0', () => {
  const o = say(inTask1(), [{ move: 'CONFUSED' }, { move: 'CONFUSED' }, { move: 'CONFUSED' }]);
  assert.equal(task(o.state, 't1').status, 'skipped');
  assert.equal(task(o.state, 't1').evidence, L.stuckEvidence);
  assert.equal(o.say, `${L.stuckMoveOn} ${L.proposeTask('1문단에 지원 이유 넣기')}`);
  assert.deepEqual([o.state.open?.effect, o.state.open?.taskId], ['startTask', 't2']);
  assert.equal(o.state.confusedStreak, 0);
  assert.equal(o.agentAction, 'move_on:P1');
});

test('막힘 3회인데 남은 시간이 7분보다 적으면 다음 과제 대신 마무리 (시간 규칙 그대로)', () => {
  const o = say(inTask1(), [{ move: 'CONFUSED', at: 14 }, { move: 'CONFUSED', at: 14 }, { move: 'CONFUSED', at: 14 }]);
  assert.equal(o.state.stage, 'closing');
  assert.ok(o.say?.startsWith(L.stuckMoveOn));
  assert.equal(task(o.state, 't1').status, 'skipped');
});

test('막힘 횟수: 다른 수가 오면 0, 수리·못 알아들음은 건너뛴다', () => {
  assert.equal(say(inTask1(), [{ move: 'CONFUSED' }, { move: 'ANSWER' }]).state.confusedStreak, 0);
  assert.equal(say(inTask1(), [{ move: 'CONFUSED' }, { move: 'USER_INQUIRY' }]).state.confusedStreak, 0);
  const skipped = say(inTask1(), [{ move: 'CONFUSED' }, { move: 'REPEAT_REQ' }, { move: 'UNCLEAR' }, { move: 'CONFUSED' }]);
  assert.equal(skipped.state.confusedStreak, 2);
  assert.equal(skipped.agentAction, 'exemplar');
});

test('과제가 없을 때(브리핑)는 사다리를 타지 않는다 — 모델이 풀어 말하고 브리핑은 열린 채', () => {
  const o = say(fresh(), [{ move: 'CONFUSED' }]);
  assert.equal(o.state.confusedStreak, 0);
  assert.equal(o.state.open?.pattern, 'A3');
  assert.equal(o.agentAction, 'clarify');
});

test('마무리 성공 확인에 "잘 모르겠어요"(CONFUSED) → 부정 답으로 (C4.7)', () => {
  let s = say(inTask1(), [{ move: 'PRE_CLOSING' }]).state;
  s = next(s, null, { kind: 'pause', now: T0 }).state;
  s = next(s, null, { kind: 'pause', now: T0 }).state;
  assert.equal(s.open?.pattern, 'C4');
  const o = say(s, [{ move: 'CONFUSED' }]);
  assert.equal(o.state.helped, false);
  assert.equal(o.state.stage, 'closing');
});

// ── 2. 다른 요청 ──

const offGoal = (importance: Judge['importance'], targetParagraph: number, reply = '(모델 응답:OFF_GOAL)'): Say =>
  ({ move: 'OFF_GOAL', text: '3문단 먼저 볼래요', judge: { importance, targetParagraph, reply } });

test('첫 요청(equal) → 겹쳐 받기: 지금 과제 계속, 모델 말, 횟수 1', () => {
  const o = say(inTask1(), [offGoal('equal', 3)]);
  assert.equal(activeTask(o.state)?.id, 't1');
  assert.equal(task(o.state, 't3').status, 'pending');
  assert.equal(o.state.offGoalCount, 1);
  assert.equal(o.agentAction, 'subsume');
  assert.equal(o.say, '(모델 응답:OFF_GOAL)');
});

test('첫 요청(lower) → 양보+그러나+이유로 지금 과제를 지킨다 (keep_goal)', () => {
  const o = say(inTask1(), [offGoal('lower', 3)]);
  assert.equal(activeTask(o.state)?.id, 't1');
  assert.equal(o.agentAction, 'keep_goal');
});

test('첫 요청이라도 higher + 남은 과제의 문단 → 그 과제로 바꾼다 (지금 과제는 pending, 들은 것 유지)', () => {
  const s0 = say(inTask1(), [{ move: 'ANSWER', text: '축제 부스를 했어요.' }]).state;
  const o = say(s0, [offGoal('higher', 3)]);
  assert.equal(task(o.state, 't1').status, 'pending');
  assert.deepEqual(task(o.state, 't1').experience, ['축제 부스를 했어요.']);
  assert.equal(task(o.state, 't1').turns, 2);
  assert.equal(task(o.state, 't3').status, 'active');
  assert.equal(o.state.stage, 'form');
  assert.equal(o.say, `${L.switchTask} ${task(o.state, 't3').opener}`);
  assert.deepEqual([o.state.open?.pattern, o.state.open?.firstPair], ['A5.1', task(o.state, 't3').opener]);
  assert.equal(o.agentAction, 'sequence_student_first');
});

test('두 번째 요청 + 남은 과제의 문단 → 중요도와 상관없이 학생을 따라 바꾼다', () => {
  const o = say(inTask1(), [offGoal('equal', 3), offGoal('equal', 3)]);
  assert.equal(activeTask(o.state)?.id, 't3');
  assert.equal(task(o.state, 't1').status, 'pending');
  assert.equal(o.state.offGoalCount, 2);
});

test('두 번째 요청인데 맞는 과제가 없으면 → 학생 요청에 답하고 지금 과제는 그대로 (follow_student)', () => {
  const o = say(inTask1(), [offGoal('equal', 3), offGoal('equal', 0)]);
  assert.equal(activeTask(o.state)?.id, 't1');
  assert.equal(o.agentAction, 'follow_student');
  const done = say(inTask1(), [offGoal('equal', 2), offGoal('higher', 2)]); // 2문단 = 지금 과제(pending 아님)
  assert.equal(activeTask(done.state)?.id, 't1');
  assert.equal(done.agentAction, 'follow_student');
});

test('첫 요청 higher인데 맞는 과제가 없으면 → 학생을 따른다 (follow_student)', () => {
  const o = say(inTask1(), [offGoal('higher', 0)]);
  assert.equal(activeTask(o.state)?.id, 't1');
  assert.equal(o.agentAction, 'follow_student');
});

test('과제 시작 제안 중의 요청(higher, 3문단) → 제안된 과제는 pending으로 남고 3문단 과제 시작', () => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = next(s, null, { kind: 'pause', now: T0 }).state;
  assert.equal(s.open?.taskId, 't1');
  const o = say(s, [offGoal('higher', 3)]);
  assert.equal(task(o.state, 't1').status, 'pending');
  assert.equal(activeTask(o.state)?.id, 't3');
});

test('첫 요청 겹쳐 받기는 과제 시작 제안을 열린 채 둔다', () => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = next(s, null, { kind: 'pause', now: T0 }).state;
  const o = say(s, [offGoal('equal', 3)]);
  assert.equal(o.state.open?.effect, 'startTask');
});

// ── 3. 끼어들기 비율 → 짧게 ──

test('끼어들기 등급: 표본 5턴 미만은 none, 0.10 이상 some, 0.25 이상 high (경계 포함)', () => {
  assert.equal(new Interruption({ bargeIns: 4, botTurns: 4 }).level, 'none'); // 표본 부족
  assert.equal(new Interruption({ bargeIns: 0, botTurns: 0 }).rate, 0);
  assert.equal(new Interruption({ bargeIns: 0, botTurns: 5 }).level, 'none');
  assert.equal(new Interruption({ bargeIns: 1, botTurns: 10 }).level, 'some'); // 정확히 0.10
  assert.equal(new Interruption({ bargeIns: 2, botTurns: 9 }).level, 'some');
  assert.equal(new Interruption({ bargeIns: 2, botTurns: 8 }).level, 'high'); // 정확히 0.25
  assert.equal(new Interruption({ bargeIns: 2, botTurns: 5 }).shorten, true); // 정확히 5턴
  assert.equal(new Interruption({ bargeIns: 2, botTurns: 9 }).shorten, false);
  assert.deepEqual(new Interruption({ bargeIns: 1, botTurns: 3 }).toLog(), { bargeIns: 1, botTurns: 3, rate: 0.333, level: 'none' });
});

test('짧게: 기본 2문장 → 1문장, 시범 턴 3 → 2 (시범 문장은 남는다)', () => {
  const three = '좋아요. 두 번째 문장이에요. 세 번째 문장이에요.';
  assert.equal(TurnResponder.tidy(j('ANSWER', { reply: three })).reply, '좋아요. 두 번째 문장이에요.');
  assert.equal(TurnResponder.tidy(j('ANSWER', { reply: three }), null, true).reply, '좋아요.');
  assert.equal(TurnResponder.tidy(j('EXEMPLAR_REQ', { reply: three, opens: 'P1.4' }), null, true).reply, '좋아요. 두 번째 문장이에요.');
  const stuckOnce = { ...inTask1(), confusedStreak: 1 };
  assert.equal(TurnResponder.maxSentences(j('CONFUSED'), stuckOnce, false), 3); // 막힘 2회째 = 시범 턴
  assert.equal(TurnResponder.maxSentences(j('CONFUSED'), inTask1(), false), 2);
});

test('턴 프롬프트: 막힘 횟수 · 다른 요청 횟수 · 끼어들기 줄', () => {
  const p = new TurnPrompt(new PromptBook());
  const ctx = { posting: POSTING, paragraphs: ESSAY };
  const plain = p.system(inTask1(), ctx);
  assert.ok(!plain.includes('한 문장으로 짧게'));
  assert.ok(plain.includes('이번이 첫 요청이다'));
  assert.ok(p.system(inTask1(), ctx, true).includes('한 문장으로 짧게'));
  assert.ok(p.system({ ...inTask1(), confusedStreak: 1 }, ctx).includes('시범 한 문장을 따옴표로'));
  assert.ok(p.system({ ...inTask1(), confusedStreak: 2 }, ctx).includes('이 과제를 미루고'));
  assert.ok(p.system({ ...inTask1(), offGoalCount: 1 }, ctx).includes('학생 뜻을 따른다'));
  assert.ok(!p.system(inTask1(), ctx).includes('{{'));
});

// ── 4. 파서 기본값 ──

test('예전 상태(confusedStreak·offGoalCount 없음)는 0으로 읽는다, 음수·소수는 400', () => {
  const { confusedStreak: _c, offGoalCount: _o, ...old } = fresh();
  const s = RequestParser.state(JSON.parse(JSON.stringify(old)));
  assert.equal(s.confusedStreak, 0);
  assert.equal(s.offGoalCount, 0);
  assert.throws(() => RequestParser.state({ ...fresh(), confusedStreak: -1 }), ValidationError);
  assert.throws(() => RequestParser.state({ ...fresh(), offGoalCount: 1.5 }), ValidationError);
});

test('끼어들기 집계: 없으면 0/0, 0 이상의 정수만', () => {
  assert.deepEqual(RequestParser.ca(undefined), { bargeIns: 0, botTurns: 0 });
  assert.deepEqual(RequestParser.ca({ bargeIns: 2, botTurns: 8 }), { bargeIns: 2, botTurns: 8 });
  assert.throws(() => RequestParser.ca({ bargeIns: -1, botTurns: 8 }), ValidationError);
  assert.throws(() => RequestParser.ca({ bargeIns: 1 }), ValidationError);
  assert.throws(() => RequestParser.ca('x'), ValidationError);
});

test('판정: importance·targetParagraph가 없거나 틀리면 none/0 (실패하지 않음)', () => {
  const base = { move: 'OFF_GOAL', reply: '네.', paraphrase: '', example: '', opens: 'none', exemplar: '', positive: false };
  assert.deepEqual([parseJudge(base).importance, parseJudge(base).targetParagraph], ['none', 0]);
  const bad = parseJudge({ ...base, importance: 'urgent', targetParagraph: '3' });
  assert.deepEqual([bad.importance, bad.targetParagraph], ['none', 0]);
  const good = parseJudge({ ...base, importance: 'higher', targetParagraph: 3 });
  assert.deepEqual([good.importance, good.targetParagraph], ['higher', 3]);
});
