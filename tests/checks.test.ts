import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capSentences, findCliches, missingQuotes, mmss, sentences, sessionLeftMs, stripTrailingQuestion } from '../src/checks';
import { ESSAY, fresh, MIN, T0 } from './fixture';

test('문장 나누기 — 한국어·영어·닫는 따옴표', () => {
  assert.deepEqual(sentences('네. 좋아요! 써 볼래요?'), ['네.', '좋아요!', '써 볼래요?']);
  assert.deepEqual(sentences('"열정"은 흔해요." 그래서요.'), ['"열정"은 흔해요."', '그래서요.']);
  assert.deepEqual(sentences('Okay. Shall we?'), ['Okay.', 'Shall we?']);
});

test('기본 2문장, 마무리는 3문장까지 자른다', () => {
  const t = '하나. 둘. 셋. 넷.';
  assert.equal(capSentences(t), '하나. 둘.');
  assert.equal(capSentences(t, 3), '하나. 둘. 셋.');
  assert.equal(capSentences('짧아요.'), '짧아요.');
});

test('답 뒤에 붙은 질문을 뗀다 — 질문 하나뿐이면 그대로', () => {
  assert.equal(stripTrailingQuestion('공고에는 제한이 없어요. 다음으로 갈까요?'), '공고에는 제한이 없어요.');
  assert.equal(stripTrailingQuestion('어디가 걸려요?'), '어디가 걸려요?');
  assert.equal(stripTrailingQuestion('제한은 없어요.'), '제한은 없어요.');
});

test('글·공고에 없는 인용만 돌려준다', () => {
  const sources = [...ESSAY];
  assert.deepEqual(missingQuotes('3문단 "열정을 가지고 공부했습니다"를 보세요.', sources), []);
  assert.deepEqual(missingQuotes('"리더십을 키웠습니다"는요?', sources), ['리더십을 키웠습니다']);
});

test('상투 표현 — 목업 3문단에서 두 개, 문단 끝 규칙', () => {
  const hits = findCliches(ESSAY);
  assert.deepEqual(hits.filter((h) => h.paragraph === 3).map((h) => h.label), ['최선을 다하겠다', '열정을 가지고']);
  // 2문단은 "배웠습니다."로 끝난다 → 문단 끝 규칙에 걸린다
  assert.ok(hits.some((h) => h.paragraph === 2 && h.label === '어조: 학습자 프레임 마무리'));
  // 3문단 중간의 "배웠고"는 걸리지 않는다
  assert.ok(!hits.some((h) => h.paragraph === 3 && h.label.startsWith('어조: 학습자')));
});

test('시간 도우미', () => {
  assert.equal(mmss(4 * MIN + 50_000), '4:50');
  assert.equal(sessionLeftMs(fresh(), T0 + 17 * MIN), 3 * MIN);
});
