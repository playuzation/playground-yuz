// 아키텍처 규칙 검사기 (트리/계층 구조 강제)
// 1) 패키지는 자신보다 낮은 layer의 패키지에만 의존할 수 있다 → 패키지 간 순환 불가
// 2) 소스에서 import하는 워크스페이스 패키지는 package.json에 선언되어 있어야 한다
// 3) 패키지 내부 파일 간 상대 import에 순환이 없어야 한다
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const errors = [];

const pkgs = new Map();
for (const dir of readJson(join(root, 'package.json')).workspaces) {
  const json = readJson(join(root, dir, 'package.json'));
  if (typeof json.layer !== 'number') errors.push(`${json.name}: package.json에 "layer"(숫자)가 없습니다`);
  pkgs.set(json.name, { dir: join(root, dir), json });
}

const listFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : /\.(ts|tsx|mjs)$/.test(p) ? [p] : [];
  });
const importsOf = (file) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

for (const [name, { dir, json }] of pkgs) {
  const declared = Object.keys({ ...json.dependencies, ...json.devDependencies }).filter((d) => pkgs.has(d));
  for (const dep of declared) {
    const depLayer = pkgs.get(dep).json.layer;
    if (!(depLayer < json.layer)) errors.push(`${name}(layer ${json.layer}) → ${dep}(layer ${depLayer}): 낮은 layer에만 의존할 수 있습니다`);
  }

  const srcDir = join(dir, 'src');
  const files = existsSync(srcDir) ? listFiles(srcDir) : [];
  const graph = new Map();
  for (const file of files) {
    const edges = [];
    for (const spec of importsOf(file)) {
      const ws = spec.match(/^(@playground\/[^/]+)/)?.[1];
      if (ws && ws === name) errors.push(`${relative(root, file)}: 자기 패키지를 이름으로 import하지 마세요`);
      else if (ws && !declared.includes(ws)) errors.push(`${relative(root, file)}: ${ws}를 import하지만 package.json에 선언되지 않았습니다`);
      if (spec.startsWith('.')) edges.push(resolve(dirname(file), spec));
    }
    graph.set(file, edges);
  }

  const state = new Map(); // 1 = 방문 중, 2 = 완료
  const visit = (file, path) => {
    if (state.get(file) === 2) return;
    if (state.get(file) === 1) {
      const cycle = [...path.slice(path.indexOf(file)), file].map((f) => relative(root, f));
      errors.push(`파일 순환 참조: ${cycle.join(' → ')}`);
      return;
    }
    state.set(file, 1);
    for (const next of graph.get(file) ?? []) if (graph.has(next)) visit(next, [...path, file]);
    state.set(file, 2);
  };
  for (const file of graph.keys()) visit(file, []);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
const order = [...pkgs].sort((a, b) => a[1].json.layer - b[1].json.layer);
console.log(`✓ 의존 규칙 통과: ${order.map(([n, p]) => `${n}(L${p.json.layer})`).join(', ')}`);
