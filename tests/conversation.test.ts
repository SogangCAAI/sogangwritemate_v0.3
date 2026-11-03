// 국면 클래스 — 상태 필드에서 국면을 바르게 고르는지, 국면마다 쉼을 기다리는지 (decide.test는 흐름 전체를 본다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhaseFactory } from '../src/conversation/PhaseFactory';
import { TutoringSession } from '../src/conversation/TutoringSession';
import { LlmOutputParser } from '../src/server/parse/LlmOutputParser';
import { LlmError } from '../src/server/llm/LlmClient';
import type { SessionState } from '../src/state';
import { fresh, j, T0 } from './fixture';

const active = (s: SessionState): SessionState => ({ ...s, stage: 'content', tasks: s.tasks.map((t, i) => (i === 0 ? { ...t, status: 'active' } : t)) });
const withOpen = (s: SessionState, open: SessionState['open']): SessionState => ({ ...s, open });

const CASES: [string, SessionState, string, boolean][] = [
  ['첫 상태 = 브리핑', fresh(), 'briefing', true],
  ['과제 시작 제안', withOpen(fresh(), { pattern: 'P1', firstPair: 'p', effect: 'startTask', taskId: 't1' }), 'taskProposal', false],
  ['시간 제안', withOpen(active(fresh()), { pattern: 'P1', firstPair: 'p', effect: 'moveOn' }), 'taskProposal', false],
  ['경험 묻기 A5.1', withOpen(active(fresh()), { pattern: 'A5.1', firstPair: 'q' }), 'experience', false],
  ['닫힌 질문 A5.0', withOpen(active(fresh()), { pattern: 'A5.0', firstPair: 'q' }), 'experience', false],
  ['결론 확인 A2.6', withOpen(active(fresh()), { pattern: 'A2.6', firstPair: 'q' }), 'conclusion', false],
  ['과제 중 열린 짝 없음', withOpen(active(fresh()), null), 'editing', false],
  ['과제 중 시범 P1.4', withOpen(active(fresh()), { pattern: 'P1.4', firstPair: 'x' }), 'editing', false],
  ['과제 사이', withOpen({ ...fresh(), stage: 'content' }, null), 'idle', true],
  ['과제 사이, 제안이 열림', withOpen({ ...fresh(), stage: 'content' }, { pattern: 'P1', firstPair: 'x' }), 'idle', false],
  ['마무리 요약 A3', { ...fresh(), stage: 'closing' }, 'closing', true],
  ['성공 확인 C4', withOpen({ ...fresh(), stage: 'closing' }, { pattern: 'C4', firstPair: 'c' }), 'closing', false],
  ['끝', { ...fresh(), stage: 'ended', open: null }, 'ended', false],
];

for (const [name, s, phase, pause] of CASES) {
  test(`국면: ${name} → ${phase}${pause ? ' (쉼 기다림)' : ''}`, () => {
    assert.equal(PhaseFactory.for(s).name, phase);
    assert.equal(TutoringSession.from(s).wantsPause, pause);
  });
}

test('TutoringSession은 받은 상태를 바꾸지 않고 toState로 같은 객체를 돌려준다', () => {
  const s = fresh();
  const frozen = structuredClone(s);
  const session = TutoringSession.from(s);
  session.onSay(j('CONTINUER'), '네.', T0);
  session.onPause();
  assert.deepEqual(s, frozen);
  assert.equal(session.toState(), s);
});

test('끝난 세션은 말·쉼·편집 모두 그대로', () => {
  const s: SessionState = { ...fresh(), stage: 'ended', open: null };
  const session = TutoringSession.from(s);
  for (const o of [session.onSay(j('ANSWER'), 'x', T0), session.onPause(), session.onEdit({ kind: 'edit', paragraph: 2, after: 'x', verdict: null, now: T0 })]) {
    assert.equal(o.state, s); assert.equal(o.say, null);
  }
});

test('모델 출력 형식 오류 → LlmError, 사용자 문장에 (이름 · 칸) 꼬리표', () => {
  const orig = console.error;
  console.error = () => {};
  try {
    assert.throws(() => LlmOutputParser.judge({ move: 'DANCE', reply: 'x' }), (e: unknown) =>
      e instanceof LlmError && e.userMessage === '튜터가 답을 잘못 만들었어요. 다시 보내 주세요. (respond · judge.move: 허용되지 않는 값이에요.)');
  } finally {
    console.error = orig;
  }
});
