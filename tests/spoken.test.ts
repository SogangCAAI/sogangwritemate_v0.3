// 소리로 읽을 글 — 문단 번호를 서수로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSpoken } from '../src/spoken';

test('문단 번호는 소리로 첫째·둘째…로 읽는다', () => {
  assert.equal(toSpoken('1문단부터 볼까요? 2번 문단과 3 문단도요.', 'ko'), '첫째 문단부터 볼까요? 둘째 문단과 셋째 문단도요.');
  assert.equal(toSpoken('12문단', 'ko'), '열두째 문단');
});

test('영어 세션 · 문단이 아닌 숫자 · 범위 밖 숫자는 그대로', () => {
  assert.equal(toSpoken('paragraph 1', 'en'), 'paragraph 1');
  assert.equal(toSpoken('과제 1 · 2분 남았어요', 'ko'), '과제 1 · 2분 남았어요');
  assert.equal(toSpoken('25문단', 'ko'), '25문단');
});
