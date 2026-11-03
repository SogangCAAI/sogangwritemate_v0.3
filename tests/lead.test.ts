// 튜터가 이끈다 (사용자 결정 2026-11-03) — 과제 중 모델 말이 다음 걸음 없이 끝나면 코드가 한 걸음을 붙인다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lines } from '../src/lines';
import { TurnResponder } from '../src/server/services/TurnResponder';
import type { SessionState } from '../src/state';
import { fresh, j } from './fixture';

const L = lines('ko');
const inTask = (patch: Partial<SessionState['tasks'][number]> = {}): SessionState => {
  const s = fresh();
  return { ...s, stage: 'content', open: null, tasks: s.tasks.map((t, i) => (i === 0 ? { ...t, status: 'active', ...patch } : t)) };
};

test('학생 질문에 답만 하고 멈추면 → 과제로 잇는 질문을 붙이고 A5.1을 연다', () => {
  const r = TurnResponder.tidy(j('USER_INQUIRY', { reply: "좋은 질문이에요. 'AI에는 수학이 필요하다'는 근거가 강점과 이어져요." }), inTask());
  assert.ok(r.reply.endsWith(L.leadDraft(2))); assert.equal(r.opens, 'A5.1');
});

test('결론을 확인한 뒤에는 "지금 고쳐 볼래요?"를, 구조·표현 과제에는 바꾸는 질문을', () => {
  assert.ok(TurnResponder.tidy(j('ANSWER', { reply: '좋아요.' }), inTask({ evidence: '결론' })).reply.endsWith(L.leadEdit(2)));
  assert.ok(TurnResponder.tidy(j('ANSWER', { reply: '좋아요.' }), inTask({ kind: 'form' })).reply.endsWith(L.leadForm(2)));
});

test('이미 질문으로 끝나거나 짝을 열었거나 맞장구면 붙이지 않는다', () => {
  assert.equal(TurnResponder.tidy(j('ANSWER', { reply: '어떤 결과가 있었어요?' }), inTask()).reply, '어떤 결과가 있었어요?');
  assert.equal(TurnResponder.tidy(j('ANSWER', { reply: '이렇게 바꾸면 어때요.', opens: 'P1' }), inTask()).reply, '이렇게 바꾸면 어때요.');
  assert.equal(TurnResponder.tidy(j('CONTINUER', { reply: '네.' }), inTask()).reply, '네.');
});

test('과제가 없을 때(브리핑·과제 사이)는 붙이지 않는다', () => {
  assert.equal(TurnResponder.tidy(j('USER_INQUIRY', { reply: '제한은 없어요.' }), fresh()).reply, '제한은 없어요.');
});

test('opens를 A5.1로 표시했어도 물음 없이 끝났으면 붙인다 (실측 사례)', () => {
  const r = TurnResponder.tidy(j('USER_INQUIRY', { reply: "방향은 하나예요. '저는 ___한 강점이 있습니다'를 넣어 보는 거예요.", opens: 'A5.1' }), inTask());
  assert.ok(r.reply.endsWith(L.leadDraft(2)));
});

test('끝 질문은 잘리지 않는다 — 앞 두 문장 + 질문 (실측: 끝 질문이 잘려 나갔다)', () => {
  const r = TurnResponder.tidy(j('USER_INQUIRY', { reply: '좋은 질문이에요. 방향은 하나예요. 첫 문장을 어떻게 바꿔 볼까요?' }), inTask());
  assert.equal(r.reply, '좋은 질문이에요. 방향은 하나예요. 첫 문장을 어떻게 바꿔 볼까요?');
});

test('네 문장이면 앞 두 문장 + 끝 질문', () => {
  const r = TurnResponder.tidy(j('ANSWER', { reply: '하나. 둘. 셋. 어때요?' }), inTask());
  assert.equal(r.reply, '하나. 둘. 어때요?');
});
