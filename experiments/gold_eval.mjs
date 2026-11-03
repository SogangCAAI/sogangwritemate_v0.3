// 골드 케이스 29개를 실제 v3 턴 경로(TurnResponder의 프롬프트·도구·검사)로 돌리고,
// 라벨이 아니라 next()의 결과(상태 이동)로 채점한다 — 라벨이 달라도 결과가 같으면 맞음.
// 실행: npm run gold -- [<.env 경로>=../pre-dashboard_code/.env]   (API 호출 29회)
import { CASES } from './cases.mjs';
import { next } from '../src/decide.ts';
import { services } from '../src/server/deps.ts';
import { emptyJudge } from '../src/state.ts';
import { ESSAY, POSTING, T0, fresh } from '../tests/fixture.ts';

process.loadEnvFile(process.argv[2] ?? '../pre-dashboard_code/.env');
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 없음');

const CTX = { posting: POSTING, paragraphs: ESSAY };
const NOW = T0 + 60_000;

// ── 목업의 '열린 패턴'을 상태로 세운다 ──
const setTasks = (s, statuses) => ({
  ...s,
  stage: statuses.includes('active') ? (s.tasks[statuses.indexOf('active')].kind) : s.stage,
  tasks: s.tasks.map((t, i) => ({ ...t, status: statuses[i], startedAt: statuses[i] === 'pending' ? undefined : T0 })),
});
const at = (statuses, open, extra = {}) => (tutor) => ({
  ...setTasks(fresh(), statuses), open: open && { firstPair: tutor, ...open }, ...extra,
  last: { played: tutor, paraphrase: '', example: '' },
});
const T1 = ['active', 'pending', 'pending'];
const T2 = ['done', 'active', 'pending'];
const T3 = ['done', 'done', 'active'];

const SETUP = {
  'M1-2': (tutor) => ({ ...fresh(), last: { played: tutor, paraphrase: '', example: '' } }),
  'M1-5': at(['pending', 'pending', 'pending'], { pattern: 'A3', parts: ['a', 'b', 'c', 'd'], part: 2 }, { stage: 'briefing' }),
  'M1-7': at(['pending', 'pending', 'pending'], { pattern: 'P1', effect: 'startTask', taskId: 't1' }, { stage: 'briefing' }),
  'M2-9': at(T1, { pattern: 'A5.1' }),
  'M2-11': at(T1, { pattern: 'A5.5' }),
  'M2-15': at(T1, { pattern: 'A5.0' }),
  'M3-17': at(T1, { pattern: 'A2.6' }),
  'M3b-17': at(T1, { pattern: 'A2.6' }),
  'M4-21': at(T1, { pattern: 'P1' }),
  'M5-25': at(['done', 'pending', 'pending'], { pattern: 'P1', effect: 'startTask', taskId: 't2' }, { stage: 'content' }),
  'M5-27': at(T2, { pattern: 'P1.4' }),
  'M6-31': at(T3, { pattern: 'P1' }),
  'M6-30b': at(T3, { pattern: 'P1' }),
  'M6-32b': at(T3, { pattern: 'P1' }, { repaired: true }),
  'M6-35': at(T3, { pattern: 'A5.0' }),
  'M7-38': at(T3, { pattern: 'P1' }),
  'M7-40': at(T3, { pattern: 'P1' }, { repaired: true }),
  'M7-42': at(T3, { pattern: 'P1' }, { repaired: true }),
  'M7-44': at(T3, { pattern: 'P1' }, { repaired: true }),
  'M8-48': at(T3, { pattern: 'A5.1' }),
  'M8-52': at(T3, { pattern: 'A5.1' }, { unclearStreak: 2 }),
  'M9-55': at(T3, { pattern: 'A5.1' }),
  'M9-57': at(T3, { pattern: 'A5.1' }, { repaired: true }),
  'M10-59': at(T3, { pattern: 'A5.1' }),
  'M10-60b': at(T3, { pattern: 'P1', effect: 'close' }, { closeOffered: true }),
  'M11-61': at(T3, { pattern: 'A5.1' }),
  'M11-65': at(T3, { pattern: 'C4' }, { stage: 'closing' }),
  'M12-68': at(['pending', 'pending', 'pending'], { pattern: 'A3', parts: ['a', 'b', 'c', 'd'], part: 1 }, { stage: 'briefing' }),
  'M12-70': at(T1, null),
};

// 결과 서명 — 라벨이 아니라 상태 이동을 비교한다 (모델 문장은 같게 고정)
function outcome(state, move, text, positive) {
  const judge = { ...emptyJudge(move), reply: 'R', positive };
  const o = next(state, judge, { kind: 'say', text, now: NOW });
  const s = o.state;
  return JSON.stringify({
    stage: s.stage, open: s.open && [s.open.pattern, s.open.effect, s.open.taskId, s.open.part],
    tasks: s.tasks.map((t) => [t.status, !!t.evidence, t.experience.length]),
    unclear: s.unclearStreak, repaired: s.repaired, helped: s.helped, act: o.agentAction, say: o.say,
  });
}

async function runCase([id, , tutor, student, expected, pauseMs]) {
  const state = SETUP[id](tutor);
  const text = pauseMs ? `(${(pauseMs / 1000).toFixed(1)}초 쉬고) ${student}` : student;
  const t0 = performance.now();
  const j = await services.responder.respond(state, CTX, [{ who: 'tutor', text: tutor }], text);
  const ms = performance.now() - t0;
  const same = outcome(state, j.move, student, j.positive) === outcome(state, expected, student, j.positive);
  return { id, expected, got: j.move, same, ms, reply: j.reply };
}

// 동시 호출 5개까지
const results = [];
for (let i = 0; i < CASES.length; i += 5) {
  results.push(...(await Promise.all(CASES.slice(i, i + 5).map((c) => runCase(c).catch((e) => ({ id: c[0], expected: c[4], got: 'ERROR', same: false, ms: 0, reply: String(e) }))))));
}

for (const r of results) {
  const mark = r.got === r.expected ? 'O' : r.same ? '≈' : 'X';
  console.log(`${mark} ${r.id.padEnd(8)} 기대 ${r.expected.padEnd(14)} 결과 ${r.got.padEnd(14)} ${Math.round(r.ms)}ms  ${r.reply}`);
}
const n = results.length;
const label = results.filter((r) => r.got === r.expected).length;
const out = results.filter((r) => r.same).length;
const lat = results.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b);
const pct = (p) => Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] ?? 0);
console.log(`\n라벨 일치 ${label}/${n} = ${((100 * label) / n).toFixed(1)}%`);
console.log(`결과(next) 일치 ${out}/${n} = ${((100 * out) / n).toFixed(1)}%   (O 라벨 일치 · ≈ 라벨은 다르나 결과 같음 · X 결과 다름)`);
console.log(`지연 p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms`);
