// GitHub Pages에 올라가는 사이트를 dist/에 만든다.   (--serve: 빌드 후 정적 서버 실행)
//   dist/index.html, dist/posts/<시리즈>/<n>.html  정적 읽기 사이트(src/site)
//   dist/app/                                      체험 데모: web UI + 브라우저 안 API(src/main.ts)
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const port = Number(process.env.PORT ?? 4174);

rmSync(here('dist'), { recursive: true, force: true });
cpSync(here('../web/public'), here('dist/app'), { recursive: true });
const ctx = await context({
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/app/app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  sourcemap: true,
  loader: { '.md': 'text' },
  logLevel: 'warning',
});
await ctx.rebuild();

// 정적 페이지: src/site/pages.ts를 Node용으로 번들해 실행하고, 돌려받은 HTML을 파일로 쓴다.
const site = await build({
  entryPoints: [here('src/site/pages.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  loader: { '.md': 'text' },
  logLevel: 'warning',
});
const { pages } = await import(`data:text/javascript;base64,${Buffer.from(site.outputFiles[0].text).toString('base64')}`);
for (const page of pages()) {
  mkdirSync(dirname(here(`dist/${page.path}`)), { recursive: true });
  writeFileSync(here(`dist/${page.path}`), page.html);
}
cpSync(here('../web/public/styles.css'), here('dist/styles.css'));
cpSync(here('public/site.css'), here('dist/site.css'));

if (process.argv.includes('--serve')) {
  await ctx.serve({ servedir: here('dist'), port });
  console.log(`demo → http://localhost:${port} (체험 데모: /app/)`);
} else {
  await ctx.dispose();
  console.log('demo → dist/ (정적 사이트 + app/)');
}
