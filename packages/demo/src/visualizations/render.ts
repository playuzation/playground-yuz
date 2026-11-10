import { byKey } from './catalog.ts';
import type { Lesson } from './model.ts';
import { SERIES } from '../site/series.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const css = `
:root{color-scheme:light;--ink:#263d46;--muted:#5c737c;--line:#ccd7d9;--green:#19745a;--paper:#f5f7f3}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Noto Sans KR",sans-serif}
a{color:#275a85;text-underline-offset:4px}button,a,select,input{touch-action:manipulation}button,select{font:inherit}button{cursor:pointer}
:focus-visible{outline:3px solid #e6952a;outline-offset:4px}header,main,footer{max-width:1120px;margin:auto;padding:22px 32px}header{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid var(--line)}
.brand{font-weight:750;letter-spacing:-.04em;font-size:21px;text-decoration:none;color:var(--ink)}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--green);margin:8px 0}
h1{font-size:clamp(25px,4vw,40px);line-height:1.3;letter-spacing:-.04em;margin:8px 0 14px;max-width:900px}h2{font-size:22px;letter-spacing:-.02em}p{max-width:900px}.muted{color:var(--muted)}
.stage{background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden;margin:28px 0 14px;box-shadow:0 12px 32px #28414708}.stage-head{padding:14px 22px;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;font-size:13px;color:var(--muted)}
svg{display:block;width:100%;min-height:180px;font-family:system-ui,sans-serif;background:linear-gradient(180deg,#fff,#f2f8f6)}svg text{font-weight:550}svg rect,svg circle{transition:fill .18s,stroke .18s}
.caption{margin:0;padding:18px 22px;min-height:90px;border-top:1px solid var(--line);font-weight:650;font-size:19px;line-height:1.6}
.controls{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:16px 0}button,.button{min-height:46px;border:1px solid var(--line);border-radius:9px;padding:9px 15px;background:#fff;color:var(--ink);font-weight:650;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button:hover,.button:hover{border-color:var(--green);background:#edf7f2}button:disabled{opacity:.4;cursor:default}#play{background:var(--green);border-color:var(--green);color:white;min-width:108px}select{min-height:44px;border:1px solid var(--line);border-radius:8px;background:white;color:var(--ink);padding:5px 8px}.speed{margin-left:auto;display:flex;align-items:center;gap:8px;font-size:14px}
.seek{display:flex;align-items:center;gap:14px}.seek input{flex:1;min-width:0;accent-color:var(--green);height:36px}.seek button{width:50px}.note{font-size:14px;border-left:3px solid #a6c6b6;padding:4px 14px;margin:20px 0;color:var(--muted)}
.transcript{padding-left:1.7em}.transcript li{padding:10px 14px;border-left:2px solid var(--line);margin:0 0 8px}.transcript li.current{background:#e4f2ea;border-color:var(--green);border-radius:0 8px 8px 0}.legend{font-size:13px;color:var(--muted)}.legend span{display:inline-block;background:#d4f3e5;border:1px solid #19745a;border-radius:3px;width:12px;height:12px;margin-right:6px}
footer{border-top:1px solid var(--line);font-size:14px;color:var(--muted);padding-bottom:40px}.catalog{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px}.series{padding:20px;background:#fff;border:1px solid var(--line);border-radius:14px}.series h2{margin-top:0}.series ol{padding-left:22px}.series li{margin:9px 0}.search{width:100%;font:inherit;padding:14px;border:1px solid var(--line);border-radius:10px;margin:12px 0 26px}
@media(max-width:600px){header,main,footer{padding:18px}header{font-size:13px}h1{font-size:27px}.stage{margin-top:20px;border-radius:12px}.stage-head{padding:12px}.caption{padding:14px;font-size:17px;min-height:105px}.controls{gap:7px}.controls button{padding:8px 10px;font-size:14px}.speed{margin-left:0}svg{min-height:160px}.catalog{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}}
@media print{.controls,.seek,#download{display:none}.stage{break-inside:avoid;box-shadow:none}body{background:#fff}.transcript li{break-inside:avoid}}
`;

function shell(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Playground 시각화</title><style>${css}</style></head>
<body>${body}${script ? `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>` : ''}</body></html>`;
}

function page(title: string, series: string, l: Lesson, script: string): string {
  const json = JSON.stringify(l).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const n = l.key.split('/')[1]!;
  return shell(title, `
<header><a class="brand" href="../index.html">Playground <span class="muted">/ 시각화</span></a><a href="../../posts/${l.key}.html">본문 읽기 ↗</a></header>
<main><p class="eyebrow">${esc(series)} · ${n}편 / INTERACTIVE NOTE</p><h1>${esc(title)}</h1><p class="muted">${esc(l.subject)} — 단계를 따라가며 핵심 개념을 살펴보세요.</p>
<section class="stage" aria-label="시각화"><div class="stage-head"><span>${esc(l.subject)}</span><span id="counter">1 / ${l.frames.length}</span></div>
<svg id="diagram" viewBox="0 0 900 360" role="img" aria-label="${esc(l.subject)}"></svg><p class="caption" id="caption" aria-live="polite" aria-atomic="true">${esc(l.frames[0]!.caption)}</p></section>
<p class="legend"><span aria-hidden="true"></span>초록색 강조: 이번 단계에서 살펴볼 대상</p>
<div class="controls" role="group" aria-label="재생 조작"><button id="play" aria-pressed="false">재생</button><button id="stop">정지</button><button id="restart">처음부터 재생</button><label class="speed">속도 <select id="speed"><option value="0.5">0.5배</option><option value="1" selected>1배</option><option value="2">2배</option></select></label><span id="status" role="status">준비</span></div>
<div class="seek"><button id="previous" aria-label="이전 단계">←</button><label for="position">단계</label><input id="position" type="range" min="0" max="${l.frames.length - 1}" value="0" step="1"><button id="next" aria-label="다음 단계">→</button></div>
<p class="note">${esc(l.note || '본문에서 다룬 한 가지 개념을 작은 입력으로 정리한 단계별 예제입니다. 전체 구현과 적용 조건은 본문에서 확인하세요.')}</p>
<h2>단계별 설명</h2><ol class="transcript" id="transcript">${l.frames.map((f) => `<li>${esc(f.caption)}</li>`).join('')}</ol>
<p><button id="download">이 HTML 저장</button></p><noscript><p>재생 버튼에는 JavaScript가 필요합니다. 위의 단계별 설명은 스크립트 없이도 읽을 수 있습니다.</p></noscript></main>
<footer>자동재생 없이 시작합니다. 저장한 HTML은 인터넷 연결 없이도 열 수 있습니다. <a href="https://github.com/playuzation/playground-yuz">소스 코드</a></footer>
<script id="lesson-data" type="application/json">${json}</script>`, script);
}

export function buildVisualizations(posts: { title: string }[], script: string) {
  const covered = new Set<string>();
  const entries = posts.map((post) => {
    const m = post.title.match(/^\[(.+) (\d+)\/\d+\] (.+)$/);
    const series = SERIES.find((s) => s.name === m?.[1]);
    if (!m || !series) throw new Error(`시각화 제목 형식: ${post.title}`);
    const key = `${series.slug}/${m[2]}`;
    const l = byKey.get(key);
    if (!l || covered.has(key)) throw new Error(`시각화 누락 또는 중복: ${key}`);
    covered.add(key);
    return { key, l, title: m[3]!, series };
  });
  for (const key of byKey.keys()) if (!covered.has(key)) throw new Error(`포스트 없는 시각화: ${key}`);
  const body = `<header><a class="brand" href="../">Playground</a><a href="../#posts">글 목록 ↗</a></header><main><p class="eyebrow">VISUAL LIBRARY / ${entries.length} NOTES</p><h1>눈으로 따라가는<br>${entries.length}개의 개념</h1><p class="muted">글마다 하나의 핵심 개념을 골랐습니다. 재생하거나 한 단계씩 넘겨 보고, HTML을 저장해 다시 열어 보세요.</p><label for="search">제목·주제·시리즈 검색</label><input class="search" id="search" type="search" placeholder="예: 이분 탐색, 양자화, 캐시"><p id="matches" role="status">${entries.length}개 시각화</p><div class="catalog">${SERIES.map((s) => `<section class="series"><h2>${esc(s.name)}</h2><ol>${entries.filter((e) => e.series === s).map((e) => `<li data-search="${esc(`${s.name} ${e.title} ${e.l.subject}`)}"><a href="${e.key}.html">${esc(e.title)}</a><small class="muted"> · ${e.l.frames.length}단계</small></li>`).join('')}</ol></section>`).join('')}</div></main><footer>각 시각화는 독립 HTML입니다. 본문의 전체 알고리즘·실험을 대신하지 않으며, 단순화한 조건은 각 화면에 표시했습니다.</footer>`;
  const search = `document.querySelector('#search').addEventListener('input',event=>{const q=event.target.value.trim().toLocaleLowerCase();let count=0;document.querySelectorAll('[data-search]').forEach(item=>{item.hidden=!item.dataset.search.toLocaleLowerCase().includes(q);if(!item.hidden)count++});document.querySelectorAll('.series').forEach(section=>{section.hidden=![...section.querySelectorAll('li')].some(item=>!item.hidden)});document.querySelector('#matches').textContent=count+'개 시각화'})`;
  return [
    { path: 'visualizations/index.html', html: shell('시각화 모음', body, search) },
    ...entries.map((e) => ({ path: `visualizations/${e.key}.html`, html: page(e.title, e.series.name, e.l, script) })),
  ];
}
