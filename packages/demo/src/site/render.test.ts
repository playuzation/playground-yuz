import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSite, type SitePost } from './render.ts';

const post = (title: string, demoId: number, body = '> **한 줄 요약** — `요약` 문장\n\n## 본문\n내용'): SitePost => ({
  title,
  body,
  demoId,
});

test('인덱스는 시리즈 순서대로 묶고 글 페이지로 링크한다', () => {
  const pages = buildSite([post('[AI 기초 1/1] 딥러닝', 3), post('[언어 기초 1/2] 첫 글', 2), post('[언어 기초 2/2] 둘째 글', 1)]);
  assert.deepEqual(
    pages.map((p) => p.path),
    ['index.html', 'posts/ai/1.html', 'posts/lang/1.html', 'posts/lang/2.html'],
  );
  const index = pages[0]!.html;
  assert.match(index, /예시 포스트 3편/);
  assert.ok(index.indexOf('id="lang"') < index.indexOf('id="ai"'), 'series.ts 순서(언어 기초가 먼저)');
  assert.match(index, /<a href="posts\/lang\/2.html">둘째 글<\/a>/);
  assert.doesNotMatch(index, /id="discrete"/, '글이 없는 시리즈는 빠진다');
});

test('글 페이지는 제목을 이스케이프하고 마크다운·이전/다음·데모 링크를 담는다', () => {
  const pages = buildSite([post('[언어 기초 1/2] <b>첫</b> 글', 9), post('[언어 기초 2/2] 둘째 글', 8)]);
  const first = pages[1]!.html;
  assert.match(first, /<h1>&lt;b&gt;첫&lt;\/b&gt; 글<\/h1>/);
  assert.match(first, /<h2>본문<\/h2>/);
  assert.match(first, /<meta name="description" content="요약 문장" \/>/);
  assert.match(first, /<a class="next" href="2.html">둘째 글 →<\/a>/);
  assert.doesNotMatch(first, /class="prev"/);
  assert.match(first, /href="..\/..\/app\/#\/posts\/9"/);
  assert.match(pages[2]!.html, /<a class="prev" href="1.html">← &lt;b&gt;첫&lt;\/b&gt; 글<\/a>/);
});

test('알 수 없는 시리즈나 형식이 틀린 제목은 빌드를 멈춘다', () => {
  assert.throws(() => buildSite([post('[없는 시리즈 1/1] 글', 1)]), /site\/series.ts에 없는 시리즈/);
  assert.throws(() => buildSite([post('시리즈 없는 글', 1)]), /제목 형식/);
});
