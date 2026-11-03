// 진단 출력 검사 — 평가(assessment)는 학생이 그대로 읽으므로 글에 없는 문단·모르는 등급을 막는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiagnosis, ValidationError } from '../src/validate';

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
