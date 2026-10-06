import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.ts';

test('기본 마크다운 문법을 HTML로 렌더링한다', () => {
  const html = renderMarkdown('## 제목\n\n**굵게** _기울임_\n\n- 하나\n- 둘\n\n`code`\n\n```\nblock\n```');
  assert.match(html, /<h2>제목<\/h2>/);
  assert.match(html, /<strong>굵게<\/strong>/);
  assert.match(html, /<em>기울임<\/em>/);
  assert.match(html, /<li>하나<\/li>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<pre><code>block\n<\/code><\/pre>/);
});

test('링크는 새 탭에서 안전하게 열린다', () => {
  const html = renderMarkdown('[예시](https://example.com)');
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow">예시<\/a>/);
});

test('HTML 태그는 이스케이프된다', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('위험한 링크 스킴은 링크가 되지 않는다', () => {
  const html = renderMarkdown('[클릭](javascript:alert(1))');
  assert.doesNotMatch(html, /<a /);
});

test('이미지 문법은 지원하지 않는다', () => {
  assert.doesNotMatch(renderMarkdown('![그림](https://example.com/a.png)'), /<img/);
});
