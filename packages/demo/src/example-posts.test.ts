import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validatePostInput } from '@playground/core';
import { renderMarkdown } from '@playground/web/markdown';
import { parsePost } from './parse-post.ts';

const dir = new URL('./posts/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();

test('예시 포스트 6편이 모두 example-posts.ts에 등록되어 있다', () => {
  assert.equal(files.length, 6);
  const index = readFileSync(new URL('./example-posts.ts', import.meta.url), 'utf8');
  for (const file of files) assert.ok(index.includes(`./posts/${file}`), `${file} 미등록`);
});

for (const [i, file] of files.entries()) {
  test(`${file}: 포스트 입력 규칙과 시리즈 형식을 지킨다`, () => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    assert.match(source, /^# /, '첫 줄은 `# 제목`');
    const post = parsePost(source);
    assert.deepEqual(validatePostInput(post), { ok: true, value: post });
    assert.ok(post.title.startsWith(`[언어 기초 ${i + 1}/6] `), post.title);
    for (const section of ['> **한 줄 요약** — ', '## 이 글에서 다루는 것', '## 정리']) {
      assert.ok(post.body.includes(section), `"${section}" 섹션 없음`);
    }
    const prose = post.body.replace(/^```[\s\S]*?^```/gm, ''); // 코드 블록 속 `# 주석`은 제외
    assert.doesNotMatch(prose, /^# /m, '본문에는 # 제목을 쓰지 않는다(페이지 제목과 겹침)');

    // `**용어(English)**조사`처럼 문장부호 뒤에 한글이 붙으면 강조가 닫히지 않고 `**`가 그대로 보인다.
    const text = renderMarkdown(post.body).replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, '');
    assert.doesNotMatch(text, /\*\*/, '렌더링 결과에 `**`가 남아 있다(강조가 적용되지 않음)');
  });
}
