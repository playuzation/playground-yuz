// web/public 정적 파일 + src/main.ts 번들 → dist/   (--serve: 빌드 후 정적 서버 실행)
import { context } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const port = Number(process.env.PORT ?? 4174);

rmSync(here('dist'), { recursive: true, force: true });
cpSync(here('../web/public'), here('dist'), { recursive: true });
const ctx = await context({
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/app.js'),
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
if (process.argv.includes('--serve')) {
  await ctx.serve({ servedir: here('dist'), port });
  console.log(`demo → http://localhost:${port}`);
} else {
  await ctx.dispose();
  console.log('demo → dist/');
}
