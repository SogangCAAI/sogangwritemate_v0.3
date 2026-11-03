// 세션 진행 클래스 — 서버 호출·기록·쉼 타이밍 (가짜 ApiClient, 브라우저 없음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiClient, TurnResult } from '../src/client/ApiClient';
import { SessionController } from '../src/client/session/SessionController';
import type { Start } from '../src/client/types';
import { ESSAY, fresh, POSTING } from './fixture';

const start = (): Start => ({
  state: fresh(), say: fresh().last.played, awaitPause: true, posting: POSTING, paragraphs: ESSAY,
  assessment: { summary: '', claims: [] },
});

function fakeApi(reply: TurnResult, seen: unknown[]): ApiClient {
  const answer = async (body: unknown) => { seen.push(body); return reply; };
  return { turn: answer, evaluate: answer } as unknown as ApiClient;
}

test('말 보내기: 지금 말은 기록에 붙지만 history에는 빠진다, 튜터 말을 읽고 줄 번호를 기억한다', async () => {
  const seen: { history: unknown[]; event: unknown }[] = [];
  const ctl = new SessionController(start(), fakeApi({ state: fresh(), say: '네.', awaitPause: false }, seen));
  let spoken = '';
  ctl.attachVoice({ speak: (t) => { spoken = t; return 7; }, stop: () => {} });
  await ctl.send({ kind: 'say', text: '안녕하세요' });
  const v = ctl.snapshot();
  assert.equal(seen[0]!.history.length, 1);
  assert.deepEqual(v.log.map((l) => l.who), ['tutor', 'student', 'tutor']);
  assert.equal(spoken, '네.'); assert.equal(v.sayId, 7); assert.equal(v.busy, false);
});

test('쉼 타이밍: 소리로 말한 줄이 끝나야 1초, 소리가 없으면 읽을 시간', () => {
  const ctl = new SessionController(start(), fakeApi({ state: fresh(), say: null, awaitPause: true }, []));
  const idle = { draft: '', interim: '', endedId: 0 };
  assert.equal(ctl.pauseDelay(idle), 1500 + start().say.length * 45);
  ctl.attachVoice({ speak: () => 3, stop: () => {} });
  ctl.speakOpening();
  assert.equal(ctl.pauseDelay(idle), null); // 아직 말하는 중
  assert.equal(ctl.pauseDelay({ ...idle, endedId: 3 }), 1000);
  assert.equal(ctl.pauseDelay({ ...idle, endedId: 3, draft: '쓰는 중' }), null);
});

test('요청이 겹치면 두 번째는 보내지 않는다', async () => {
  const seen: unknown[] = [];
  const ctl = new SessionController(start(), fakeApi({ state: fresh(), say: null, awaitPause: false }, seen));
  await Promise.all([ctl.send({ kind: 'pause' }), ctl.send({ kind: 'pause' }), ctl.saveEdit(2, 'x')]);
  assert.equal(seen.length, 1);
});
