// 대본 목업(대본 목업 - NCF 패턴 1차.md)의 학생 발화를 Haiku가 1차 라벨 13개 중 맞게 고르는지, 몇 번 돌려도 같은지, 얼마나 걸리는지 잰다.
// 실행: node experiments/label_eval.mjs <.env 경로> [반복 횟수=3]
// shortcut: 판정만 따로 부른다 — v3 본 설계는 응답과 한 호출이라 정확도·지연이 다를 수 있다. 본 호출을 만들면 그걸로 다시 잰다.

const [envPath, repeatArg] = process.argv.slice(2);
if (!envPath) throw new Error('사용법: node experiments/label_eval.mjs <.env 경로> [반복]');
process.loadEnvFile(envPath);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error('ANTHROPIC_API_KEY 없음');
const REPEAT = Number(repeatArg || 3);
const MODEL = 'claude-haiku-5-5';

import { LABELS, CASES } from './cases.mjs';

const SYSTEM = `너는 자기소개서 음성 튜터링 대화에서 학생의 마지막 발화가 어떤 행위인지 고르는 판정기다.
판정 기준은 **직전 튜터 발화가 무엇이었나**(열린 패턴)다. 같은 "네"도 직전이 질문이면 ANSWER, 제안이면 ACCEPT, 설명 중이면 CONTINUER, 설명이 끝난 뒤면 CLOSER다.
머뭇거림·긴 쉼·"근데"가 붙은 약한 응답은 거절 쪽으로 본다.
라벨:
${Object.entries(LABELS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

const TOOL = {
  name: 'judge',
  description: '학생의 마지막 발화 판정',
  input_schema: {
    type: 'object',
    properties: { move: { type: 'string', enum: Object.keys(LABELS) } },
    required: ['move'],
  },
};


async function judgeOnce([, open, tutor, student, , pauseMs]) {
  const user = `열린 패턴: ${open}\n튜터: ${tutor}\n${pauseMs ? `(학생이 ${(pauseMs / 1000).toFixed(1)}초 쉬고 말함)\n` : ''}학생: ${student}`;
  const t0 = performance.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 100, system: SYSTEM,
      tools: [TOOL], tool_choice: { type: 'tool', name: 'judge' },
      messages: [{ role: 'user', content: user }],
    }),
  });
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const move = body.content.find(b => b.type === 'tool_use')?.input?.move;
  if (!(move in LABELS)) throw new Error(`라벨 밖 응답: ${JSON.stringify(body.content)}`);
  return { move, ms };
}

const rows = await Promise.all(CASES.map(async c => {
  const runs = [];
  for (let i = 0; i < REPEAT; i++) runs.push(await judgeOnce(c)); // 케이스 안은 순차, 케이스끼리는 병렬
  return { id: c[0], expected: c[4], runs };
}));

const lat = rows.flatMap(r => r.runs.map(x => x.ms)).sort((a, b) => a - b);
const pct = p => Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]);
let allRight = 0, stable = 0;
for (const r of rows) {
  const moves = r.runs.map(x => x.move);
  const right = moves.filter(m => m === r.expected).length;
  if (right === moves.length) allRight++;
  if (new Set(moves).size === 1) stable++;
  const mark = right === moves.length ? 'O' : right === 0 ? 'X' : '△';
  console.log(`${mark} ${r.id.padEnd(8)} 기대 ${r.expected.padEnd(14)} 결과 ${moves.join(', ')}`);
}
const total = rows.reduce((n, r) => n + r.runs.length, 0);
const correct = rows.reduce((n, r) => n + r.runs.filter(x => x.move === r.expected).length, 0);
console.log(`\n모델 ${MODEL} · 케이스 ${rows.length} × ${REPEAT}회`);
console.log(`정확도(호출 단위) ${correct}/${total} = ${(100 * correct / total).toFixed(1)}%`);
console.log(`매번 정답인 케이스 ${allRight}/${rows.length} · 매번 같은 답인 케이스 ${stable}/${rows.length}`);
console.log(`지연 p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms (판정만 단독 호출 기준)`);
