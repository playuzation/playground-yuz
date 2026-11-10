import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { lessons, byKey } from './catalog.ts';
import { buildVisualizations } from './render.ts';
import { lesson, validateLessons } from './model.ts';

const root = new URL('../posts/', import.meta.url);
const posts = readdirSync(root).flatMap((series) => readdirSync(new URL(`${series}/`, root))
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ title: readFileSync(new URL(`${series}/${name}`, root), 'utf8').split('\n')[0]!.replace(/^# /, '') })));

test('모든 실제 포스트에 정확히 하나의 독립 HTML을 만든다', () => {
  assert.equal(posts.length, 313);
  assert.equal(lessons.length, posts.length);
  const pages = buildVisualizations(posts, 'window.playerLoaded = true;');
  assert.equal(pages.length, posts.length + 1);
  assert.equal(new Set(pages.map((p) => p.path)).size, pages.length);
  for (const page of pages.slice(1)) {
    const key = page.path.replace(/^visualizations\//, '').replace(/\.html$/, '');
    const l = byKey.get(key)!;
    assert.ok(l);
    assert.ok(l.frames.length >= 3);
    assert.match(page.html, /<html lang="ko">/);
    assert.match(page.html, /id="play"/);
    assert.match(page.html, /id="stop"/);
    assert.match(page.html, /id="restart"/);
    assert.match(page.html, /window.playerLoaded = true/);
    assert.doesNotMatch(page.html, /<script[^>]+src=|<link[^>]+stylesheet|<iframe|fetch\(/);
    assert.match(page.html, new RegExp(`href="../../posts/${key}.html"`));
  }
});

test('새 글의 시각화 누락과 삭제된 글의 남은 시각화를 빌드에서 잡는다', () => {
  assert.throws(() => buildVisualizations([...posts, { title: '[언어 기초 9/9] 새 글' }], ''), /시각화 누락/);
  assert.throws(() => buildVisualizations(posts.slice(1), ''), /포스트 없는 시각화/);
  assert.throws(() => buildVisualizations([...posts, posts[0]!], ''), /중복/);
});

test('잘못된 장면 데이터가 플레이어에 도달하기 전에 거절한다', () => {
  const sample = lesson('lang/1', 'bars', '숫자', ['a|x=1', 'b|x=2', 'c|x=3']);
  assert.throws(() => validateLessons([sample, sample]), /중복/);
  assert.throws(() => validateLessons([{ ...sample, frames: [{ caption: '값', items: ['x=NaN'] }, ...sample.frames] }]), /숫자가 아닌/);
  assert.throws(() => validateLessons([{ ...sample, frames: [] }]), /잘못된/);
});

test('제목의 HTML은 본문과 목록에서 이스케이프한다', () => {
  const modified = posts.map((p, i) => i ? p : { title: p.title.replace(/\] .+$/, '] <script>bad()</script>') });
  const pages = buildVisualizations(modified, '');
  assert.match(pages[0]!.html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(pages[1]!.html, /<script>bad\(\)<\/script>/);
});
