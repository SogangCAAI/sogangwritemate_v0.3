// 진단 출력 검사 — 평가(assessment)는 학생이 그대로 읽으므로 글에 없는 문단·모르는 등급을 막는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagnosis, parseJudge, parseSummary, parseVerdict, ValidationError } from '../src/validate';

const task = (paragraph: number) => ({ kind: 'content', paragraph, keyword: 'k', goal: 'g', doneWhen: 'd', opener: 'o?' });
const raw = (claims: unknown[]) => ({
  tasks: [task(1), task(2), task(3)],
  briefing: ['먼저, a', '다음으로, b', '마지막으로, c'],
  assessment: { summary: '잘 된 점과 빈 곳.', claims },
});

test('평가: 글에 없는 문단을 가리키는 주장은 버린다', () => {
  const d = parseDiagnosis(raw([
    { paragraph: 2, claim: '협업', evidence: 'weak', note: '결과가 없다' },
    { paragraph: 9, claim: '없는 문단', evidence: 'none', note: 'x' },
  ]), 3);
  assert.deepEqual(d.assessment.claims.map((c) => c.paragraph), [2]);
  assert.equal(d.assessment.summary, '잘 된 점과 빈 곳.');
});

test('평가: 모르는 근거 등급은 형식 오류', () => {
  assert.throws(() => parseDiagnosis(raw([{ paragraph: 1, claim: 'a', evidence: 'great', note: 'b' }]), 3), ValidationError);
});

// "튜터가 답을 잘못 만들었어요" 회귀 — 모델이 낼 수 있는 모양을 형식 오류로 보지 않는다
test('판정: 빈 reply는 형식 오류가 아니다 (respond가 "네."로 채운다)', () => {
  const j = parseJudge({ move: 'CONTINUER', reply: '', paraphrase: '', example: '', opens: 'none', exemplar: '', positive: false });
  assert.equal(j.reply, '');
});

test('진단·요약: 목록이 넘치면 앞에서부터 쓴다', () => {
  const r = raw([]);
  const d = parseDiagnosis({ ...r, tasks: [...r.tasks, task(1)], briefing: [...r.briefing, '덤'] }, 3);
  assert.equal(d.tasks.length, 3); assert.equal(d.briefing.length, 3);
  assert.equal(parseSummary({ report: 'r', nextSteps: ['a', 'b', 'c', 'd'] }).nextSteps.length, 3);
});

test('재평가: 빈 이유도 받는다', () => {
  assert.deepEqual(parseVerdict({ better: false, reason: '' }), { better: false, reason: '' });
});

test('진단: 모델이 쓴 긴 과제 이름은 실패 대신 자른다', () => {
  const r = raw([]);
  const long = '가'.repeat(500);
  const d = parseDiagnosis({ ...r, tasks: [{ ...task(1), goal: long }, task(2), task(3)] }, 3);
  assert.equal(d.tasks[0]?.goal.length, 120);
});

test('진단: 글 범위를 벗어난 과제 문단 번호는 범위 안으로 맞춘다', () => {
  const d = parseDiagnosis({ ...raw([]), tasks: [task(0), task(2), task(7)] }, 3);
  assert.deepEqual(d.tasks.map((t) => t.target.paragraph).sort(), [1, 2, 3]);
});
