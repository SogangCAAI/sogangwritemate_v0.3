// v3 본 설계 — 판정과 응답을 Haiku 한 번에. 같은 29개 목업 발화로 라벨 정확도 · 지연 · 응답 길이를 잰다.
// 실행: node experiments/combined_eval.mjs <.env 경로> [반복 횟수=2]
import { LABELS, CASES } from './cases.mjs';

const [envPath, repeatArg] = process.argv.slice(2);
if (!envPath) throw new Error('사용법: node experiments/combined_eval.mjs <.env 경로> [반복]');
process.loadEnvFile(envPath);
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error('ANTHROPIC_API_KEY 없음');
const REPEAT = Number(repeatArg || 2);
const MODEL = 'claude-haiku-5-5';

const SYSTEM = `너는 대학생의 자기소개서를 음성 대화로 함께 고치는 튜터 '글벗'이다.
대신 써 주지 않는다(예문은 한 문장까지). 근거 중심으로 말하고, 학생이 거절하면 다시 밀지 않는다. 제안은 언제든 바꿀 수 있다.

[오늘 자료]
공고: 한빛물류 데이터분석 인턴 — 데이터로 문제를 정의하고 푼 경험 · 여러 부서와의 협업 · SQL 또는 R
글: 1문단 "저는 데이터로 문제를 해결하는 사람입니다. 한빛물류 데이터분석 인턴에 지원합니다." /
    2문단 "학교 마케팅 동아리에서 회장으로 활동하며 리더십을 길렀습니다. 다양한 사람들과 소통하는 법을 배웠습니다." /
    3문단 "통계 수업에서 R을 배웠고 열정을 가지고 공부했습니다. 입사 후 최선을 다하겠습니다."
과제: T1 2문단에 협업 경험(직접 한 행동+결과) · T2 1문단에 지원 이유 · T3 3문단 상투 표현을 구체적 내용으로

[할 일] 학생의 마지막 발화를 먼저 판정하고(move), 그 판정에 맞는 튜터의 다음 말(reply)을 만든다.
판정 기준은 직전 튜터 발화(열린 패턴)다. 같은 "네"도 직전이 질문이면 ANSWER, 제안이면 ACCEPT, 설명 중이면 CONTINUER, 설명이 끝난 뒤면 CLOSER다.
머뭇거림·긴 쉼·"근데"가 붙은 약한 응답은 거절 쪽으로 본다.
라벨:
${Object.entries(LABELS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

[말 길이] 받음·맞장구는 "네" 한마디. 질문은 키워드를 짚고 질문 한 문장으로 끝낸다. 기본 2문장까지.
설명이나 답을 한 뒤에는 다음 질문을 붙이지 않는다. 해요체.
[함께 만들 것] paraphrase = reply를 더 쉽게 풀어 쓴 말. example = reply에 대한 예 하나(없으면 빈 문자열).`;

const TOOL = {
  name: 'respond',
  description: '판정과 튜터의 다음 말',
  input_schema: {
    type: 'object',
    properties: {
      move: { type: 'string', enum: Object.keys(LABELS) },
      reply: { type: 'string' },
      paraphrase: { type: 'string' },
      example: { type: 'string' },
    },
    required: ['move', 'reply', 'paraphrase', 'example'],
  },
};

const sentences = s => s.split(/(?<=[.?!])\s+/).filter(x => x.trim()).length;

async function respondOnce([, open, tutor, student, , pauseMs]) {
  const user = `열린 패턴: ${open}\n튜터: ${tutor}\n${pauseMs ? `(학생이 ${(pauseMs / 1000).toFixed(1)}초 쉬고 말함)\n` : ''}학생: ${student}`;
  const t0 = performance.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 600, system: SYSTEM,
      tools: [TOOL], tool_choice: { type: 'tool', name: 'respond' },
      messages: [{ role: 'user', content: user }],
    }),
  });
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = (await res.json()).content.find(b => b.type === 'tool_use')?.input;
  if (!out || !(out.move in LABELS) || typeof out.reply !== 'string') throw new Error(`형식 밖 응답: ${JSON.stringify(out)}`);
  return { ...out, ms };
}

const rows = await Promise.all(CASES.map(async c => {
  const runs = [];
  for (let i = 0; i < REPEAT; i++) runs.push(await respondOnce(c));
  return { id: c[0], expected: c[4], student: c[3], runs };
}));

// 수리 요청(반복·뜻·예시)은 v3에서 코드가 last.*로 답하므로 모델 reply 길이 검사에서 뺀다
const CODE_SERVED = new Set(['REPEAT_REQ', 'PARAPHRASE_REQ', 'EXAMPLE_REQ']);
let correct = 0, total = 0, longReplies = 0, checked = 0;
for (const r of rows) {
  const moves = r.runs.map(x => x.move);
  const right = moves.filter(m => m === r.expected).length;
  correct += right; total += moves.length;
  const mark = right === moves.length ? 'O' : right === 0 ? 'X' : '△';
  console.log(`${mark} ${r.id.padEnd(8)} 기대 ${r.expected.padEnd(14)} 결과 ${moves.join(', ')}`);
  console.log(`     학생: ${r.student}`);
  for (const x of r.runs) {
    const n = sentences(x.reply);
    const limit = x.move === 'PRE_CLOSING' ? 3 : 2; // 마무리 요약은 A3 파트 하나까지 허용
    if (!CODE_SERVED.has(x.move)) { checked++; if (n > limit) longReplies++; }
    console.log(`     튜터(${n}문장, ${Math.round(x.ms)}ms): ${x.reply}`);
  }
}
const lat = rows.flatMap(r => r.runs.map(x => x.ms)).sort((a, b) => a - b);
const pct = p => Math.round(lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]);
console.log(`\n모델 ${MODEL} · 케이스 ${rows.length} × ${REPEAT}회 (판정 + 응답 한 호출)`);
console.log(`판정 정확도 ${correct}/${total} = ${(100 * correct / total).toFixed(1)}%`);
console.log(`응답 길이 초과 ${longReplies}/${checked} (수리 요청 제외)`);
console.log(`지연 p50 ${pct(0.5)}ms · p95 ${pct(0.95)}ms (스트리밍 없음 — 전체 완료 시간)`);
