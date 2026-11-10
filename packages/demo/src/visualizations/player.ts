import type { Lesson, Frame } from './model.ts';

// HTML마다 이 플레이어를 인라인으로 넣는다. 외부 스크립트나 통신이 필요 없다.
const data = JSON.parse(document.querySelector('#lesson-data')!.textContent!) as Lesson;
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.querySelector<SVGSVGElement>('#diagram')!;
const play = get<HTMLButtonElement>('play');
const range = get<HTMLInputElement>('position');
const speed = get<HTMLSelectElement>('speed');
let index = 0;
let playing = false;
let elapsed = 0;
let lastTime = 0;
let animation = 0;
const ns = 'http://www.w3.org/2000/svg';
let horizontalScale = 1;
let mobile = false;

function element(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) {
    const scaled = typeof value === 'number' && ['x', 'cx', 'x1', 'x2', 'width'].includes(key) ? value * horizontalScale : value;
    e.setAttribute(key, String(scaled));
  }
  if (text !== undefined) e.textContent = text;
  svg.append(e);
  return e;
}
function text(x: number, y: number, value: string, size = 19, color = '#263d46') {
  element('text', { x, y, 'text-anchor': 'middle', 'font-size': mobile ? Math.min(size, 15) : size, fill: color }, value);
}
function box(x: number, y: number, w: number, h: number, label: string, active: boolean) {
  element('rect', { x, y, width: w, height: h, rx: 12, fill: active ? '#d4f3e5' : '#fff', stroke: active ? '#19745a' : '#c6d2d3', 'stroke-width': active ? 3 : 1.5 });
  // 긴 라벨은 여러 줄로 나눠 좁은 모바일 화면에서도 잘리지 않게 한다.
  const chars = Math.max(3, Math.floor(w * horizontalScale / (mobile ? 15 : 19)));
  const lines = label.match(new RegExp(`.{1,${chars}}`, 'gu')) ?? [''];
  lines.forEach((line, i) => text(x + w / 2, y + h / 2 + 6 + (i - (lines.length - 1) / 2) * 23, line));
}
const clean = (s: string) => s.replace(/^!/, '');
function draw(frame: Frame) {
  svg.replaceChildren();
  const viewport = Math.min(900, svg.clientWidth || 900);
  horizontalScale = viewport / 900;
  mobile = viewport < 600;
  svg.setAttribute('viewBox', `0 0 ${viewport} 360`);
  element('title', {}, data.subject);
  element('desc', {}, `${frame.caption}. ${frame.items.map(clean).join(', ')}`);
  const items = frame.items;
  if (data.diagram === 'bars' || data.diagram === 'plot') {
    const values = items.map((s) => Number(clean(s).split('=').at(-1)));
    // 모든 장면의 축을 고정해 값이 바뀌어도 막대의 길이를 직접 비교할 수 있게 한다.
    const all = data.frames.flatMap((f) => f.items.map((s) => Number(clean(s).split('=').at(-1))));
    const min = Math.min(0, ...all), max = Math.max(1, ...all);
    const y = (v: number) => 292 - (v - min) / (max - min) * 232;
    const gap = 740 / Math.max(1, items.length);
    element('line', { x1: 80, y1: y(0), x2: 820, y2: y(0), stroke: '#788f96' });
    text(45, 62, String(Math.round(max * 100) / 100), 14);
    text(45, 296, String(Math.round(min * 100) / 100), 14);
    if (data.diagram === 'plot') {
      element('polyline', { points: values.map((v, i) => `${(80 + gap * (i + .5)) * horizontalScale},${y(v)}`).join(' '), fill: 'none', stroke: '#3765a2', 'stroke-width': 3 });
    }
    items.forEach((s, i) => {
      const x = 80 + gap * (i + .5), value = values[i]!;
      if (data.diagram === 'bars') element('rect', { x: x - gap * .3, y: Math.min(y(0), y(value)), width: gap * .6, height: Math.max(2, Math.abs(y(0) - y(value))), rx: 5, fill: s.startsWith('!') ? '#19745a' : '#7b9abc' });
      else element('circle', { cx: x, cy: y(value), r: s.startsWith('!') ? 8 : 5, fill: s.startsWith('!') ? '#19745a' : '#3765a2' });
      text(x, Math.max(30, y(value) - 12), String(value), 16);
      text(x, 330, clean(s).includes('=') ? clean(s).split('=').slice(0, -1).join('=') : String(i + 1), 15);
    });
  } else if (data.diagram === 'tree') {
    const depth = Math.floor(Math.log2(Math.max(1, items.length))) + 1;
    const positions = items.map((_, i) => {
      const row = Math.floor(Math.log2(i + 1));
      const col = i - (2 ** row - 1);
      return { x: 900 * (col + .5) / 2 ** row, y: 55 + row * (250 / Math.max(1, depth - 1)) };
    });
    items.forEach((s, i) => {
      if (i && clean(s) !== '·') {
        const parent = positions[Math.floor((i - 1) / 2)]!, p = positions[i]!;
        element('line', { x1: parent.x, y1: parent.y + 20, x2: p.x, y2: p.y - 20, stroke: '#a2b6bb', 'stroke-width': 2 });
      }
    });
    items.forEach((s, i) => { if (clean(s) !== '·') { const p = positions[i]!; box(p.x - 43 / horizontalScale, p.y - 32, 86 / horizontalScale, 64, clean(s), s.startsWith('!')); } });
  } else if (data.diagram === 'network') {
    const defs = element('defs', {});
    const marker = document.createElementNS(ns, 'marker');
    for (const [k, v] of Object.entries({ id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' })) marker.setAttribute(k, v);
    const arrow = document.createElementNS(ns, 'path'); arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); arrow.setAttribute('fill', '#788f96'); marker.append(arrow); defs.append(marker);
    const edges = items.map((s) => clean(s).split('>'));
    const names = [...new Set(edges.flatMap((e) => [e[0]!, e[1]!.split('=')[0]!]))];
    const coords = names.map((_, i) => ({ x: 450 + 285 * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / names.length), y: 180 + 130 * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / names.length) }));
    edges.forEach(([a, rhs], i) => {
      const [b, weight] = rhs!.split('='); const p = coords[names.indexOf(a!)]!, q = coords[names.indexOf(b!)]!;
      const length = Math.hypot((q.x - p.x) * horizontalScale, q.y - p.y) || 1;
      const line = element('line', { x1: p.x, y1: p.y, x2: q.x - (q.x - p.x) / length * 49, y2: q.y - (q.y - p.y) / length * 31, stroke: items[i]!.startsWith('!') ? '#19745a' : '#a2b6bb', 'stroke-width': items[i]!.startsWith('!') ? 5 : 2 });
      if (!data.note.includes('무방향')) line.setAttribute('marker-end', 'url(#arrow)');
      if (weight) text((p.x + q.x) / 2, (p.y + q.y) / 2 - 8, weight, 17);
    });
    names.forEach((s, i) => { const p = coords[i]!; box(p.x - 43 / horizontalScale, p.y - 24, 86 / horizontalScale, 48, s, false); });
  } else {
    const cols = data.diagram === 'grid' ? Math.ceil(Math.sqrt(items.length)) : data.diagram === 'flow' ? Math.min(mobile ? 1 : 3, items.length) : Math.min(Math.max(2, Math.floor(viewport / 115)), items.length);
    const rows = Math.ceil(items.length / cols), gap = 12 / horizontalScale;
    const w = Math.min(data.diagram === 'flow' ? 248 : 108, (viewport - 32 - (cols - 1) * 12) / cols) / horizontalScale;
    const height = Math.min(100, 250 / rows), totalW = cols * w + (cols - 1) * gap;
    items.forEach((s, i) => {
      const x = (900 - totalW) / 2 + i % cols * (w + gap), y = (360 - rows * (height + 18)) / 2 + Math.floor(i / cols) * (height + 18);
      if (data.diagram === 'flow' && i % cols) text(x - 11, y + height / 2 + 6, '→', 20, '#788f96');
      if (data.diagram === 'flow' && i >= cols) text(x + w / 2, y - 3, '↓', 16, '#788f96');
      box(x, y, w, height, clean(s), s.startsWith('!'));
      if (data.diagram === 'array') text(x + w / 2, y + height + 21, `[${i}]`, 14, '#788f96');
    });
  }
}

function pause() {
  playing = false; cancelAnimationFrame(animation); play.textContent = '재생'; play.setAttribute('aria-pressed', 'false');
  get('status').textContent = index === data.frames.length - 1 ? '재생 완료' : '일시정지';
}
function render() {
  const frame = data.frames[index]!;
  draw(frame); range.value = String(index);
  get('caption').textContent = frame.caption;
  get('counter').textContent = `${index + 1} / ${data.frames.length}`;
  get<HTMLButtonElement>('previous').disabled = index === 0;
  get<HTMLButtonElement>('next').disabled = index === data.frames.length - 1;
  get('transcript').querySelectorAll('li').forEach((li, i) => { li.classList.toggle('current', i === index); if (i === index) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
  document.body.dataset.frame = String(index);
}
function tick(time: number) {
  if (!playing) return;
  elapsed += Math.min(100, time - lastTime) * Number(speed.value); lastTime = time;
  if (elapsed >= 2200) {
    elapsed = 0;
    if (index < data.frames.length - 1) { index++; render(); }
    else { pause(); return; }
  }
  animation = requestAnimationFrame(tick);
}
function start() {
  if (playing) return;
  if (index === data.frames.length - 1) { index = 0; elapsed = 0; render(); }
  playing = true; play.textContent = '일시정지'; play.setAttribute('aria-pressed', 'true'); get('status').textContent = '재생 중';
  lastTime = performance.now(); animation = requestAnimationFrame(tick);
}
play.addEventListener('click', () => playing ? pause() : start());
get('restart').addEventListener('click', () => { pause(); index = 0; elapsed = 0; render(); start(); });
get('stop').addEventListener('click', () => { index = 0; pause(); elapsed = 0; render(); });
function seek(n: number) { index = n; pause(); elapsed = 0; render(); }
get('previous').addEventListener('click', () => seek(Math.max(0, index - 1)));
get('next').addEventListener('click', () => seek(Math.min(data.frames.length - 1, index + 1)));
range.addEventListener('input', () => seek(Number(range.value)));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', render);
get('download').addEventListener('click', () => {
  const blob = new Blob(['<!doctype html>\n' + document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${data.key.replace('/', '-')}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// 재생 중 저장한 HTML을 다시 열어도 초기 상태에서 시작한다.
pause(); get('status').textContent = '준비'; render();
