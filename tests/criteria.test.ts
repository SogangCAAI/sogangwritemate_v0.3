// 완료 항목(체크리스트) — 결론 확인에서 확정 · 코드 검사 먼저 · 항목별 절대 판정 · 못 채운 항목이 힌트 (2026-11-16)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeCheck } from '../src/checks';
import { Tasks } from '../src/conversation/Tasks';
import { next } from '../src/decide';
import { lines } from '../src/lines';
import { Evaluator } from '../src/server/services/Evaluator';
import { RequestParser } from '../src/server/parse/RequestParser';
import { criteriaProgress, type Criterion, type SessionState, type Verdict } from '../src/state';
import { TutoringSession } from '../src/conversation/TutoringSession';
import { TurnPrompt } from '../src/server/llm/TurnPrompt';
import { PromptBook } from '../src/server/llm/PromptBook';
import { parseDiagnosis } from '../src/server/parse/LlmOutputParser';
import { crit, fresh, j, T0, TASKS } from './fixture';

const L = lines('ko');
const t1Active = (): SessionState => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = next(s, null, { kind: 'pause', now: T0 }).state;
  return next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state; // 과제 1 active, A5.1 열림
};

test('A2.6을 열 때 모델이 낸 항목이 open.criteria에 실린다', () => {
  const o = next(t1Active(), j('ANSWER', { opens: 'A2.6', reply: '그러니까 예산표로 갈등을 푼 경험이네요, 맞아요?', criteria: ['2문단에 예산표를 공유 시트로 만든 행동이 들어간다', '2문단에 예산을 넘기지 않은 결과가 들어간다'] }), { kind: 'say', text: '시트를 만들었어요', now: T0 });
  assert.equal(o.state.open?.pattern, 'A2.6');
  assert.equal(o.state.open?.criteria?.length, 2);
});

test('결론 확인을 받으면 합의한 항목이 진단 초안을 대신하고, 코드 항목은 남는다', () => {
  const s = { ...t1Active(), open: { pattern: 'A2.6' as const, firstPair: '결론', criteria: ['행동 A', '결과 B'] } };
  const withCode = Tasks.update(s, 't1', { criteria: [...TASKS[0]!.criteria, crit('k1', '상투 표현 없음', 'noCliche', 'code')] });
  const o = next(withCode, j('ACCEPT'), { kind: 'say', text: '네 맞아요', now: T0 });
  const t = o.state.tasks[0]!;
  assert.deepEqual(t.criteria.map((c) => [c.id, c.text, c.check, c.source]), [['a1', '행동 A', 'llm', 'conclusion'], ['a2', '결과 B', 'llm', 'conclusion'], ['k1', '상투 표현 없음', 'noCliche', 'code']]);
  assert.equal(t.evidence, '결론');
  assert.equal(t.status, 'active'); // 글이 바뀌어야 done
});

test('모델이 항목을 내지 않았으면 결론 문장이 항목 하나가 된다', () => {
  const s = { ...t1Active(), open: { pattern: 'A2.6' as const, firstPair: '두 팀이 같은 숫자를 보게 한 경험을 2문단에 넣는다' } };
  const t = next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state.tasks[0]!;
  assert.deepEqual(t.criteria.map((c) => [c.id, c.text, c.source]), [['a1', '두 팀이 같은 숫자를 보게 한 경험을 2문단에 넣는다', 'conclusion']]);
});

test('재평가 !done → 항목 ✓/✗가 갱신되고 힌트가 P1을 연다 · done → 과제 끝, 합의한 evidence는 그대로', () => {
  const s0 = Tasks.update({ ...t1Active(), open: null }, 't1', { evidence: '합의한 결론' });
  const half = next(s0, null, { kind: 'edit', paragraph: 2, after: '시트를 만들었습니다.', verdict: { done: false, met: ['c1'], reason: '결과도 넣어 볼래요?' }, now: T0 });
  assert.deepEqual(half.state.tasks[0]!.criteria.map((c) => c.met), [true, false]);
  assert.deepEqual(criteriaProgress(half.state.tasks[0]!), { met: 1, total: 2 });
  assert.equal(half.state.tasks[0]!.status, 'active');
  assert.equal(half.say, '결과도 넣어 볼래요?'); assert.equal(half.agentAction, 'A4.1'); assert.equal(half.state.open?.pattern, 'P1');
  const allMet = next(half.state, null, { kind: 'edit', paragraph: 2, after: '시트를 만들어 예산을 지켰습니다.', verdict: { done: true, met: ['c1', 'c2'], reason: '둘 다 보여요.' }, now: T0 });
  assert.equal(allMet.state.tasks[0]!.status, 'active'); // 설명으로 보여 줘야 끝난다
  assert.equal(allMet.state.open?.pattern, 'A4');
  assert.equal(allMet.say, `${L.allMet} ${L.checkQuestion(2)}`);
  const done = next(allMet.state, j('ANSWER', { positive: true, reply: '맞아요.' }), { kind: 'say', text: '시트로 예산을 지켰다는 거요', now: T0 });
  assert.equal(done.state.tasks[0]!.status, 'done');
  assert.equal(done.state.tasks[0]!.evidence, '합의한 결론');
  assert.equal(done.agentAction, 'done:check');
});

test('새 내용 항목(needsNew): 인용한 근거가 원래 문단에 이미 있으면 충족이 아니다 — 문장 바꿔 쓰기로는 통과하지 못한다', () => {
  const original = '저는 수학을 좋아하다 보니 자연스럽게 AI와 컴퓨터 분야에 관심을 갖게 되었고, 개발자가 되고 싶다는 생각을 하게 되었습니다. 네이버 세미나에 참석했습니다.';
  const criteria = [crit('c1', '1문단 첫 문장이 역량을 주장한다'), { ...crit('c2', '그 주장을 뒷받침하는 사실이 문단 안에 있다'), needsNew: true }];
  const rewriteOnly = Evaluator.combine(criteria, [], { items: [{ id: 'c1', met: true, evidence: '잘하는 개발자가 되고 싶습니다' }, { id: 'c2', met: true, evidence: '네이버 세미나에 참석했습니다' }], reason: 'r' }, 'ko', original);
  assert.deepEqual(rewriteOnly.met, ['c1']); assert.equal(rewriteOnly.done, false);
  const withNew = Evaluator.combine(criteria, [], { items: [{ id: 'c1', met: true, evidence: 'x' }, { id: 'c2', met: true, evidence: '알고리즘 스터디에서 300문제를 풀었습니다' }], reason: 'r' }, 'ko', original);
  assert.equal(withNew.done, true);
  const noQuote = Evaluator.combine(criteria, [], { items: [{ id: 'c1', met: true, evidence: 'x' }, { id: 'c2', met: true, evidence: '' }], reason: 'r' }, 'ko', original);
  assert.equal(noQuote.done, false); // 새 내용 항목은 인용이 있어야 한다
});

test('결론 확인 뒤: 내용 과제의 합의 항목은 새 내용(needsNew)이고 코드의 일반 새-내용 항목(n1)은 빠진다, 형식 과제는 남는다', () => {
  const n1: Criterion = { ...crit('n1', '2문단에 원래 없던 학생의 경험·사실이 들어간다', 'llm', 'code'), needsNew: true };
  const s = Tasks.update({ ...t1Active(), open: { pattern: 'A2.6' as const, firstPair: '결론', criteria: ['행동 A'] } }, 't1', { criteria: [...TASKS[0]!.criteria, n1] });
  const c = next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state.tasks[0]!.criteria;
  assert.deepEqual(c.map((x) => [x.id, x.needsNew ?? false]), [['a1', true]]);
  const form = Tasks.update({ ...t1Active(), open: { pattern: 'A2.6' as const, firstPair: '결론', criteria: ['첫 문장이 주장한다'] } }, 't1', { kind: 'form', criteria: [...TASKS[0]!.criteria, n1] });
  const cf = next(form, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state.tasks[0]!.criteria;
  assert.deepEqual(cf.map((x) => [x.id, x.needsNew ?? false]), [['a1', false], ['n1', true]]);
});

test('코드 검사: 상투 표현이 남아 있으면 noCliche 항목은 미충족', () => {
  const k: Criterion = crit('k1', '상투 표현 없음', 'noCliche', 'code');
  assert.equal(codeCheck(k, '통계 수업에서 R을 배웠고 열정을 가지고 공부했습니다.'), false);
  assert.equal(codeCheck(k, '통계 수업에서 R로 배송 데이터를 분석했습니다.'), true);
});

test('Evaluator.combine: 코드 판정 + 모델 판정 → 전부 충족이면 done, 모델이 빠뜨린 항목은 아직', () => {
  const criteria = [crit('c1', 'a'), crit('c2', 'b'), crit('k1', 'k', 'noCliche', 'code')];
  const partial = Evaluator.combine(criteria, ['k1'], { items: [{ id: 'c1', met: true, evidence: 'x' }], reason: '힌트.' }, 'ko');
  assert.deepEqual(partial, { done: false, met: ['c1', 'k1'], reason: '힌트.', evidence: { c1: 'x' } });
  const all = Evaluator.combine(criteria, ['k1'], { items: [{ id: 'c1', met: true, evidence: '' }, { id: 'c2', met: true, evidence: '' }], reason: '좋아요.' }, 'ko');
  assert.equal(all.done, true);
  // 코드 항목만 있는 과제 — 모델 없이 판정, 힌트는 코드가 쓴다
  const codeOnly = Evaluator.combine([crit('k1', '3문단에 상투 표현이 없다', 'noCliche', 'code')], [], null, 'ko');
  assert.deepEqual(codeOnly, { done: false, met: [], reason: L.codeHint('3문단에 상투 표현이 없다'), evidence: {} });
});

// ── 돌지 않기 (2026-11-16 오후) ──

const editEv = (verdict: Verdict, paragraph = 2) => ({ kind: 'edit' as const, paragraph, after: 'x', verdict, now: T0 });
const unmet = (reason: string): Verdict => ({ done: false, met: ['c1'], reason });
const allMet: Verdict = { done: true, met: ['c1', 'c2'], reason: '둘 다 보여요.', evidence: { c1: '시트를 만들어', c2: '예산을 지켰다' } };

test('같은 항목이 연달아 안 채워지면 stuckCount가 오르고 직전 힌트가 남는다 — 다른 항목이면 1로', () => {
  const s0 = { ...t1Active(), open: null };
  const a = next(s0, null, editEv(unmet('결과도 넣어 볼래요?'))).state;
  assert.deepEqual([a.tasks[0]!.stuckOn, a.tasks[0]!.stuckCount, a.tasks[0]!.lastHint], ['c2', 1, '결과도 넣어 볼래요?']);
  const b = next(a, null, editEv(unmet('어떻게 됐는지도요?'))).state;
  assert.deepEqual([b.tasks[0]!.stuckOn, b.tasks[0]!.stuckCount, b.tasks[0]!.lastHint], ['c2', 2, '어떻게 됐는지도요?']);
  const c = next(b, null, editEv({ done: false, met: ['c2'], reason: '행동은요?' })).state;
  assert.deepEqual([c.tasks[0]!.stuckOn, c.tasks[0]!.stuckCount], ['c1', 1]);
  // 재평가 프롬프트에 직전 힌트와 횟수가 들어간다 · 2번째부터 재료(이력서·다른 문단)
  assert.match(Evaluator.historyText(b.tasks[0]!, 'ko'), /어떻게 됐는지도요\?.*2번째/);
  assert.equal(Evaluator.materialsText(a.tasks[0]!, { originals: [], paragraphs: ['a', 'b', 'c'], resume: 'TOEIC 985' }, 'ko'), '');
  assert.match(Evaluator.materialsText(b.tasks[0]!, { originals: [], paragraphs: ['a', 'b', 'c'], resume: 'TOEIC 985' }, 'ko'), /TOEIC 985[\s\S]*1문단: a[\s\S]*3문단: c/);
});

test('확인 질문은 과제당 두 번까지 — 주장만 짚으면 두 번째는 받침 문장만 묻고, 세 번째 충족은 바로 완료', () => {
  const s0 = { ...t1Active(), open: null };
  const q1 = next(s0, null, editEv(allMet));
  assert.equal(q1.say, `${L.allMet} ${L.checkQuestion(2)}`); assert.equal(q1.state.tasks[0]!.check.asked, 1);
  assert.equal(q1.state.tasks[0]!.criteria[0]!.evidence, '시트를 만들어'); // 인용 구절이 항목에 남는다
  // 주장만 짚음 → criteria=['claim']
  const half = next(q1.state, j('ANSWER', { positive: false, reply: '주장은 맞아요. 받쳐 주는 문장은요?', criteria: ['claim'] }), { kind: 'say', text: '갈등을 풀었다는 거요', now: T0 });
  assert.equal(half.state.tasks[0]!.status, 'active'); assert.equal(half.state.tasks[0]!.check.claimOk, true);
  assert.ok(half.state.tasks[0]!.notes.some((n) => n.includes('주장은 맞게 짚었다')));
  const q2 = next(half.state, null, editEv(allMet));
  assert.equal(q2.say, `${L.allMet} ${L.checkSupport(2)}`); assert.equal(q2.state.tasks[0]!.check.asked, 2);
  const miss = next(q2.state, j('ANSWER', { positive: false, reply: '힌트', criteria: [] }), { kind: 'say', text: '음', now: T0 });
  const done = next(miss.state, null, editEv(allMet));
  assert.equal(done.state.tasks[0]!.status, 'done'); assert.equal(done.agentAction, 'done:eval');
});

test('이미 정해진 것 기록: 결론 확정 · 두 번째 막힘의 질문 — 프롬프트에 "다시 묻지 않는다"로 들어간다', () => {
  const s = { ...t1Active(), open: { pattern: 'A2.6' as const, firstPair: '예산표로 갈등을 푼 경험을 2문단에', criteria: ['행동 A'] } };
  const c = next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state;
  assert.deepEqual(c.tasks[0]!.notes, ['결론 확정: 예산표로 갈등을 푼 경험을 2문단에']);
  const asked = { ...c, open: { pattern: 'A5.1' as const, firstPair: '세미나에서 어떤 수학 기초였어요?' } };
  const once = next(asked, j('CONFUSED'), { kind: 'say', text: '기억이 안 나요', now: T0 }).state;
  assert.equal(once.tasks[0]!.notes.length, 1);
  const twice = next({ ...once, open: asked.open }, j('CONFUSED'), { kind: 'say', text: '기억이 안 난다고요', now: T0 }).state;
  assert.ok(twice.tasks[0]!.notes.includes('학생이 답하지 못한 질문: 세미나에서 어떤 수학 기초였어요?'));
  const p = new TurnPrompt(new PromptBook());
  const sys = p.system(twice, { posting: '', paragraphs: ['a', 'b', 'c'], resume: 'TOEIC 985 · 과외' });
  assert.ok(sys.includes('이미 정해진 것') && sys.includes('답하지 못한 질문: 세미나') && sys.includes('TOEIC 985'));
});

test('막힘 2·3회에 모델이 재료 바꾸기로 A2.6을 열면 그대로 둔다 (swap)', () => {
  const s = { ...t1Active(), confusedStreak: 1 };
  const o = next(s, j('CONFUSED', { opens: 'A2.6', reply: '이력서에 과외가 있네요. 그걸로 하는 거죠?', criteria: ['과외 경험이 들어간다'] }), { kind: 'say', text: '기억 안 나요', now: T0 });
  assert.equal(o.agentAction, 'swap'); assert.equal(o.state.open?.pattern, 'A2.6'); assert.deepEqual(o.state.open?.criteria, ['과외 경험이 들어간다']);
});

test('형식 과제도 결론이 확정되면 다음 칸은 고치기(edit)다 — 합의를 되풀이하지 않는다', () => {
  const p = new TurnPrompt(new PromptBook());
  const ctx = { posting: '', paragraphs: ['a', 'b', 'c'], resume: '' };
  const form = Tasks.update({ ...t1Active(), open: null }, 't1', { kind: 'form' });
  assert.ok(p.system(form, ctx).includes('형식 과제다 — 고치기 전에 계획을 합의한다'));
  const confirmed = Tasks.confirmCriteria(form, 't1', ['첫 문장이 주장한다'], '결론');
  assert.ok(p.system(confirmed, ctx).includes('결론은 이미 확정됐다'));
});

test('구조 과제: 손대는 문단 어디를 고쳐도 판정하고, 새 내용 항목은 넣지 않는다', () => {
  const s0 = Tasks.update({ ...t1Active(), open: null }, 't1', { kind: 'structure', target: { paragraph: 1, paragraphs: [1, 4] } });
  assert.deepEqual(Tasks.targets(s0.tasks[0]!), [1, 4]);
  assert.equal(TutoringSession.from(s0).editNeedsEval(4, 'x'), true);
  assert.equal(TutoringSession.from(s0).editNeedsEval(2, 'x'), false);
  const o = next(s0, null, editEv(unmet('4문단에서 그 문장을 지웠나요?'), 4));
  assert.equal(o.state.tasks[0]!.edits, 1); assert.equal(o.agentAction, 'A4.1');
  const P = ['첫 문단.', '둘째.', '셋째.', '넷째 — 이력서를 첨부합니다.'];
  const d = parseDiagnosis({ rubric: {}, strengths: '', briefing: ['a', 'b', 'c'], tasks: [
    { axis: 'cohesion', kind: 'structure', paragraph: 1, paragraphs: [4, 1, 9], keyword: '이력서 문장', goal: '옮기기', criteria: [{ text: '1문단에 이력서 문장이 있다', needsNew: false }, { text: '4문단에 그 문장이 없다', needsNew: false }], doneWhen: 'd', opener: 'o?' },
    { axis: 'claim', kind: 'content', paragraph: 2, paragraphs: [2, 3], keyword: 'k', goal: 'g', criteria: [{ text: 'a', needsNew: true }], doneWhen: 'd', opener: 'o?' },
    { axis: 'expression', kind: 'form', paragraph: 3, paragraphs: [], keyword: 'k', goal: 'g', criteria: [], doneWhen: 'd', opener: 'o?' },
  ] }, P);
  const st = d.tasks.find((t) => t.kind === 'structure')!;
  assert.deepEqual(st.target.paragraphs, [1, 4]); // 범위 밖 9는 4로 잘려 합쳐진다
  assert.ok(!st.criteria.some((c) => c.needsNew));
  const ct = d.tasks.find((t) => t.kind === 'content')!;
  assert.equal(ct.target.paragraphs, undefined); // 내용 과제는 한 문단에 집중
});

test('재평가 맥락: 연결·주장 축 과제만 글 전체를 참고로 받는다', () => {
  const t = { ...TASKS[0]!, axis: 'cohesion' as const };
  assert.match(Evaluator.contextText(t, ['a', 'b', 'c'], 'ko'), /판정 대상은 2문단/);
  assert.equal(Evaluator.contextText({ ...t, axis: 'hierarchy' }, ['a', 'b', 'c'], 'ko'), '');
  assert.equal(Evaluator.contextText(t, ['a'], 'ko'), '');
});

test('상태 파서: 예전 상태(항목 없음)는 빈 목록으로, 항목이 있으면 그대로 읽는다', () => {
  const s = t1Active();
  const parsed = RequestParser.state(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(parsed.tasks[0]!.criteria, TASKS[0]!.criteria);
  const legacy = JSON.parse(JSON.stringify(s)); for (const t of legacy.tasks) delete t.criteria;
  assert.deepEqual(RequestParser.state(legacy).tasks.map((t) => t.criteria.length), [0, 0, 0]);
});
