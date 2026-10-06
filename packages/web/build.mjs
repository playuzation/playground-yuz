// public/ 정적 파일 + src/main.ts 번들 → dist/
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

rmSync(here('dist'), { recursive: true, force: true });
cpSync(here('public'), here('dist'), { recursive: true });
await build({
  entryPoints: [here('src/main.ts')],
  outfile: here('dist/app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  sourcemap: true,
  logLevel: 'warning',
});
console.log('web → dist/');
