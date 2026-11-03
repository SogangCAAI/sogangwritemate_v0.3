// 진단 출력 검사 — 채점 루브릭(5축)은 학생이 그대로 읽는다. 모양이 틀린 축은 그 축만 판정불가, 진단 전체는 실패시키지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagnosis, parseJudge, parseRubric, parseSummary, parseVerdict } from '../src/server/parse/LlmOutputParser';

const task = (paragraph: number, axis = 'claim') => ({ axis, kind: 'content', paragraph, keyword: 'k', goal: 'g', doneWhen: 'd', opener: 'o?' });
const j = (grade: string, evidence = `근거(1번 문단).`) => ({ grade, evidence });
const fullRubric = (over: Record<string, unknown> = {}) => ({
  claim: j('중'), hierarchy: j('하'),
  alignment: { ...j('중'), transfer: j('중'), consistency: j('상') },
  cohesion: j('상'), expression: j('하'), ...over,
});
const raw = (rubric: unknown = fullRubric(), tasks: unknown[] = [task(1), task(2), task(3)]) => ({
  rubric, strengths: '첫 문장이 분명해요.', tasks,
  briefing: ['먼저, a', '다음으로, b', '마지막으로, c'],
});

test('루브릭: 다섯 축의 등급과 근거를 그대로 읽는다', () => {
  const d = parseDiagnosis(raw(), 3);
  assert.deepEqual(Object.keys(d.rubric), ['claim', 'hierarchy', 'alignment', 'cohesion', 'expression']);
  assert.equal(d.rubric.hierarchy.grade, '하');
  assert.equal(d.rubric.cohesion.evidence, '근거(1번 문단).');
  assert.equal(d.strengths, '첫 문장이 분명해요.');
});

test('루브릭: 정합성 등급은 판정할 수 있었던 하위 중 가장 나쁜 것', () => {
  const r = parseRubric(fullRubric({ alignment: { ...j('상'), transfer: j('하'), consistency: j('중') } }));
  assert.equal(r.alignment.grade, '하');
  assert.equal(r.alignment.sub?.transfer?.grade, '하');
  assert.equal(r.alignment.sub?.consistency?.grade, '중');
});

test('루브릭: 하위 하나가 판정불가면 나머지로 정한다, 둘 다 판정불가면 판정불가', () => {
  const one = parseRubric(fullRubric({ alignment: { ...j('판정불가'), transfer: j('중'), consistency: j('판정 불가') } }));
  assert.equal(one.alignment.grade, '중');
  assert.equal(one.alignment.sub?.consistency?.grade, '판정불가'); // '판정 불가' 띄어쓰기 변형도 받는다
  const none = parseRubric(fullRubric({ alignment: { ...j('판정불가'), transfer: j('판정불가'), consistency: j('판정불가') } }));
  assert.equal(none.alignment.grade, '판정불가');
});

test('루브릭: 모르는 등급·빠진 축은 그 축만 판정불가 (진단은 실패하지 않는다)', () => {
  const d = parseDiagnosis(raw({ claim: j('great'), hierarchy: 'x', alignment: j('중'), cohesion: j('상') }), 3);
  assert.deepEqual(d.rubric.claim, { grade: '판정불가', evidence: '' });
  assert.deepEqual(d.rubric.hierarchy, { grade: '판정불가', evidence: '' });
  assert.deepEqual(d.rubric.expression, { grade: '판정불가', evidence: '' });
  assert.equal(d.rubric.alignment.grade, '중');
  assert.equal(d.rubric.alignment.sub, undefined);
  assert.equal(parseDiagnosis(raw(null), 3).rubric.cohesion.grade, '판정불가');
});

test('루브릭: 긴 근거와 잘한 점은 자른다', () => {
  const long = '가'.repeat(900);
  const d = parseDiagnosis({ ...raw(fullRubric({ claim: j('중', long) })), strengths: long }, 3);
  assert.equal(d.rubric.claim.evidence.length, 400);
  assert.equal(d.strengths.length, 400);
});

test('과제 순서: 가장 낮은 축부터 (하 → 중, 같은 등급이면 축 순서), 모르는 축은 뒤로', () => {
  // claim=중 · hierarchy=하 · alignment=중 · cohesion=상 · expression=하
  const d = parseDiagnosis(raw(fullRubric(), [
    { ...task(1, 'cohesion'), goal: 'c' }, { ...task(2, 'expression'), goal: 'e' }, { ...task(3, 'hierarchy'), goal: 'h' },
  ]), 3);
  assert.deepEqual(d.tasks.map((t) => t.goal), ['h', 'e', 'c']);
  assert.deepEqual(d.tasks.map((t) => t.order), [1, 2, 3]);
  const e = parseDiagnosis(raw(fullRubric(), [{ ...task(1, 'nope'), goal: 'x' }, { ...task(2, 'alignment'), goal: 'a' }, { ...task(3, 'claim'), goal: 'c' }]), 3);
  assert.deepEqual(e.tasks.map((t) => t.goal), ['c', 'a', 'x']);
});

// "튜터가 답을 잘못 만들었어요" 회귀 — 모델이 낼 수 있는 모양을 형식 오류로 보지 않는다
test('판정: 빈 reply는 형식 오류가 아니다 (respond가 "네."로 채운다)', () => {
  const j = parseJudge({ move: 'CONTINUER', reply: '', paraphrase: '', example: '', opens: 'none', exemplar: '', positive: false });
  assert.equal(j.reply, '');
});

test('진단·요약: 목록이 넘치면 앞에서부터 쓴다', () => {
  const r = raw();
  const d = parseDiagnosis({ ...r, tasks: [...r.tasks, task(1)], briefing: [...r.briefing, '덤'] }, 3);
  assert.equal(d.tasks.length, 3); assert.equal(d.briefing.length, 3);
  assert.equal(parseSummary({ report: 'r', nextSteps: ['a', 'b', 'c', 'd'] }).nextSteps.length, 3);
});

test('재평가: 빈 이유도 받는다', () => {
  assert.deepEqual(parseVerdict({ better: false, reason: '' }), { better: false, reason: '' });
});

test('진단: 모델이 쓴 긴 과제 이름은 실패 대신 자른다', () => {
  const r = raw();
  const long = '가'.repeat(500);
  const d = parseDiagnosis({ ...r, tasks: [{ ...task(1), goal: long }, task(2), task(3)] }, 3);
  assert.equal(d.tasks[0]?.goal.length, 120);
});

test('진단: 글 범위를 벗어난 과제 문단 번호는 범위 안으로 맞춘다', () => {
  const d = parseDiagnosis({ ...raw(), tasks: [task(0), task(2), task(7)] }, 3);
  assert.deepEqual(d.tasks.map((t) => t.target.paragraph).sort(), [1, 2, 3]);
});
