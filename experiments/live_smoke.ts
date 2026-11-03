// 네 함수를 실제 API로 한 번씩 — 배포 전 연기 시험. 실행: npx tsx experiments/live_smoke.ts <.env 경로>
import diagnose from '../netlify/functions/diagnose';
import turn from '../netlify/functions/turn';
import evaluate from '../netlify/functions/evaluate';
import summary from '../netlify/functions/summary';
import { ESSAY, POSTING } from '../tests/fixture';

const envPath = process.argv[2];
if (!envPath) throw new Error('사용법: npx tsx experiments/live_smoke.ts <.env 경로>');
process.loadEnvFile(envPath);
delete process.env.SUPABASE_URL; // 저장은 건너뛴다

const call = async (name: string, fn: (r: Request) => Promise<Response>, body: unknown) => {
  const t0 = performance.now();
  const res = await fn(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }));
  const env = (await res.json()) as { ok: boolean; data: any; error: string | null };
  console.log(`${env.ok ? 'OK ' : 'ERR'} ${name.padEnd(9)} ${res.status} ${Math.round(performance.now() - t0)}ms ${env.ok ? '' : env.error}`);
  if (!env.ok) process.exitCode = 1;
  return env.data;
};

const context = { posting: POSTING, paragraphs: ESSAY };
const d = await call('diagnose', diagnose, { ...context, lang: 'ko' });
if (!d) process.exit(1);
console.log('  과제:', d.state.tasks.map((t: any) => `${t.order}.${t.kind} ${t.target?.paragraph}문단 ${t.goal}`).join(' / '));
console.log('  잘한 점:', d.strengths);
for (const [k, v] of Object.entries(d.rubric as Record<string, any>)) {
  console.log(`  루브릭 ${k}: ${v.grade} — ${v.evidence}`);
  for (const [sk, sv] of Object.entries((v.sub ?? {}) as Record<string, any>)) console.log(`    ${sk}: ${sv.grade} — ${sv.evidence}`);
}
console.log('  첫 말:', d.say);

// 브리핑 파트를 쉼으로 넘기고(LLM 0회), 과제 시작 제안에 "네 좋아요"
let cur = d;
while (cur.awaitPause) {
  cur = await call('pause', turn, { state: cur.state, context, history: [], event: { kind: 'pause' } });
  console.log('  튜터:', cur.say);
}
const t = await call('turn', turn, { state: cur.state, context, history: [], event: { kind: 'say', text: '네 좋아요.' } });
if (t) console.log('  튜터:', t.say, '| 과제:', t.state.tasks.map((x: any) => x.status).join(','));

const st = t?.state ?? d.state;
const p = st.tasks[0].target.paragraph;
const e = await call('evaluate', evaluate, {
  state: st, context, paragraph: p, original: ESSAY[p - 1],
  edited: `${ESSAY[p - 1]} 축제 부스 예산표를 공유 시트로 만들어 두 팀이 같은 숫자를 보게 했고, 예산 초과 없이 행사를 마쳤습니다.`,
});
if (e) console.log('  재평가:', JSON.stringify(e.verdict), '| 튜터:', e.say);

const s = await call('summary', summary, { state: e?.state ?? st, original: ESSAY, final: ESSAY, posting: POSTING });
if (s) console.log('  요약:', String(s.report).slice(0, 120));
