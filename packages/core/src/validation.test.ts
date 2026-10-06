import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommentInput, validateCredentials, validatePostInput } from './validation.ts';

test('아이디는 소문자로 정규화되고 형식을 검사한다', () => {
  assert.deepEqual(validateCredentials({ username: ' Alice_1 ', password: 'password1' }), {
    ok: true,
    value: { username: 'alice_1', password: 'password1' },
  });
  assert.equal(validateCredentials({ username: 'ab', password: 'password1' }).ok, false);
  assert.equal(validateCredentials({ username: 'has space', password: 'password1' }).ok, false);
  assert.equal(validateCredentials({ username: 'alice', password: 'short' }).ok, false);
  assert.equal(validateCredentials(null).ok, false);
});

test('포스트는 제목과 비어 있지 않은 본문이 필요하다', () => {
  assert.deepEqual(validatePostInput({ title: '  제목 ', body: '# 안녕' }), {
    ok: true,
    value: { title: '제목', body: '# 안녕' },
  });
  assert.equal(validatePostInput({ title: ' ', body: '본문' }).ok, false);
  assert.equal(validatePostInput({ title: '제목', body: '   ' }).ok, false);
  assert.equal(validatePostInput({ title: 'a'.repeat(101), body: '본문' }).ok, false);
  assert.equal(validatePostInput({ title: '제목', body: 'a'.repeat(10_001) }).ok, false);
});

test('댓글은 앞뒤 공백을 제거하고 길이를 검사한다', () => {
  assert.deepEqual(validateCommentInput({ body: ' 좋아요 ' }), { ok: true, value: { body: '좋아요' } });
  assert.equal(validateCommentInput({ body: '' }).ok, false);
  assert.equal(validateCommentInput({ body: 'a'.repeat(1_001) }).ok, false);
});
