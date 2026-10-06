import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validatePostInput } from '@playground/core';
import { renderMarkdown } from '@playground/web/markdown';
import { parsePost } from './parse-post.ts';

// posts/<시리즈>/<번호>-<이름>.md
const root = new URL('./posts/', import.meta.url);
const series = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const filesOf = (dir: string) =>
  readdirSync(new URL(`${dir}/`, root))
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => parseInt(a) - parseInt(b));

test('모든 예시 포스트가 example-posts.ts에 등록되어 있다', () => {
  const index = readFileSync(new URL('./example-posts.ts', import.meta.url), 'utf8');
  assert.deepEqual(series, ['ai', 'lang']);
  for (const dir of series) {
    for (const file of filesOf(dir)) assert.ok(index.includes(`./posts/${dir}/${file}`), `${dir}/${file} 미등록`);
  }
});

for (const dir of series) {
  const files = filesOf(dir);
  let seriesName: string | undefined;

  for (const [i, file] of files.entries()) {
    test(`${dir}/${file}: 포스트 입력 규칙과 시리즈 형식을 지킨다`, () => {
      assert.ok(file.startsWith(`${i + 1}-`), '파일 이름은 <번호>-로 시작');
      const source = readFileSync(new URL(`${dir}/${file}`, root), 'utf8');
      assert.match(source, /^# /, '첫 줄은 `# 제목`');
      const post = parsePost(source);
      assert.deepEqual(validatePostInput(post), { ok: true, value: post });

      const m = post.title.match(/^\[(.+) (\d+)\/(\d+)\] \S/);
      assert.ok(m, `제목 형식은 "[시리즈 n/N] 제목": ${post.title}`);
      assert.equal(Number(m[2]), i + 1, '편 번호');
      assert.equal(Number(m[3]), files.length, '전체 편수');
      seriesName ??= m[1];
      assert.equal(m[1], seriesName, '같은 폴더는 같은 시리즈 이름');

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
}
