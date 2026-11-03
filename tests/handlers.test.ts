// 함수 핸들러 — LLM을 부르지 않는 경로만 (쉼 · 힌트 칩 · 잘못된 요청 · 시범 문장 편집)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import turn from '../netlify/functions/turn';
import evaluate from '../netlify/functions/evaluate';
import { next } from '../src/decide';
import { ESSAY, fresh, j, POSTING, T0 } from './fixture';

delete process.env.SUPABASE_URL; // 저장은 건너뛰고 경고만
const call = async (fn: (r: Request) => Promise<Response>, body: unknown) => {
  const res = await fn(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as { ok: boolean; data: any; error: string | null } };
};
const context = { posting: POSTING, paragraphs: ESSAY };

test('turn: 쉼 이벤트 → 다음 브리핑 파트, 봉투 {ok,data,error}', async () => {
  const r = await call(turn, { state: fresh(), context, event: { kind: 'pause' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data.state.open.part, 1);
  assert.equal(r.body.data.awaitPause, true);
});

test('turn: 힌트 칩은 판정 호출 없이 last에서 답한다', async () => {
  const r = await call(turn, { state: fresh(), context, event: { kind: 'say', text: '뭐라고요?', move: 'REPEAT_REQ' } });
  assert.equal(r.body.data.say, fresh().last.played);
});

test('turn: 칩으로 보낼 수 없는 라벨 · 깨진 상태는 400', async () => {
  const bad = await call(turn, { state: fresh(), context, event: { kind: 'say', text: 'x', move: 'ACCEPT' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.ok, false);
  const broken = await call(turn, { state: { ...fresh(), stage: 'hacked' }, context, event: { kind: 'pause' } });
  assert.equal(broken.status, 400);
});

test('evaluate: 시범 문장 그대로면 재평가 없이 done', async () => {
  let s = fresh();
  for (const ev of [{ kind: 'pause' }, { kind: 'pause' }, { kind: 'pause' }] as const) s = next(s, null, { ...ev, now: T0 }).state;
  s = next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state;
  s = next(s, j('EXEMPLAR_REQ', { opens: 'P1.4', exemplar: '공유 시트로 예산을 지켰습니다.' }), { kind: 'say', text: '써 주세요', now: T0 }).state;
  const r = await call(evaluate, { state: s, paragraph: 2, original: ESSAY[1], edited: `${ESSAY[1]} 공유 시트로 예산을 지켰습니다.` });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.data.verdict, null);
  assert.equal(r.body.data.state.tasks[0].status, 'done');
});
