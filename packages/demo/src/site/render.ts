// 예시 포스트로 정적 읽기 사이트(인덱스 + 글마다 한 페이지)의 HTML을 만든다. 파일 쓰기는 build.mjs가 한다.
import { renderMarkdown } from '@playground/web/markdown';
import { SERIES, type SeriesInfo } from './series.ts';

export const REPO_URL = 'https://github.com/playuzation/playground-yuz';

export interface SitePost {
  title: string;
  body: string;
  /** 체험 데모(MemoryStore 초기 데이터)에서 이 글의 id */
  demoId: number;
}

export interface Page {
  path: string;
  html: string;
}

interface Entry {
  series: SeriesInfo;
  n: number;
  total: number;
  title: string;
  body: string;
  summary: string;
  demoId: number;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const postPath = (e: { series: SeriesInfo; n: number }) => `posts/${e.series.slug}/${e.n}.html`;

function toEntry(post: SitePost): Entry {
  const m = post.title.match(/^\[(.+) (\d+)\/(\d+)\] (.+)$/);
  if (!m) throw new Error(`제목 형식이 "[시리즈 n/N] 제목"이 아니다: ${post.title}`);
  const series = SERIES.find((s) => s.name === m[1]);
  if (!series) throw new Error(`site/series.ts에 없는 시리즈: ${m[1]}`);
  const summary = (post.body.match(/^> \*\*한 줄 요약\*\* — (.+)$/m)?.[1] ?? '').replace(/[`*]/g, '');
  return { series, n: Number(m[2]), total: Number(m[3]), title: m[4]!, body: post.body, summary, demoId: post.demoId };
}

function layout(o: { title: string; description: string; root: string; body: string }): string {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(o.title)}</title>
    <meta name="description" content="${escapeHtml(o.description)}" />
    <meta property="og:title" content="${escapeHtml(o.title)}" />
    <meta property="og:description" content="${escapeHtml(o.description)}" />
    <link rel="stylesheet" href="${o.root}styles.css" />
    <link rel="stylesheet" href="${o.root}site.css" />
  </head>
  <body>
    <header class="site-header">
      <nav class="container">
        <a class="brand" href="${o.root}">Playground</a>
        <span class="spacer"></span>
        <a href="${o.root}#posts">글 목록</a>
        <a href="${o.root}app/">체험하기</a>
      </nav>
    </header>
    <main class="container">
${o.body}
    </main>
    <footer class="container site-footer">
      <a href="${o.root}report/">테스트 리포트</a> · <a href="${REPO_URL}">소스 코드</a>
    </footer>
  </body>
</html>
`;
}

function indexPage(entries: Entry[]): Page {
  const groups = SERIES.map((series) => ({ series, items: entries.filter((e) => e.series === series) })).filter(
    (g) => g.items.length > 0,
  );
  const body = `      <section class="hero">
        <h1>모바일로만 만든 토이 플랫폼</h1>
        <p>마크다운 포스트·좋아요·댓글만 있는 작은 플랫폼입니다. 휴대폰의 Claude 앱과 클라우드 세션, GitHub만으로 개발하면서 CI와 실제 브라우저 테스트를 어떻게 해낼 수 있는지 실험했습니다.</p>
        <p class="cta"><a class="button" href="app/">체험하기</a> <a class="button secondary" href="#posts">글 읽기</a></p>
        <p class="muted">로그인 없이 모든 글을 읽을 수 있습니다. 체험하기에서는 가입하고 글·좋아요·댓글을 남겨 볼 수 있으며, 데이터는 내 브라우저에만 저장됩니다.</p>
      </section>
      <section id="posts">
        <h2>예시 포스트 ${entries.length}편</h2>
        <nav class="series-nav" aria-label="시리즈">
${groups.map((g) => `          <a href="#${g.series.slug}">${escapeHtml(g.series.name)}</a>`).join('\n')}
        </nav>
${groups
  .map(
    (g) => `        <section class="series" id="${g.series.slug}">
          <h3>${escapeHtml(g.series.name)} <span class="muted">${g.items.length}편</span></h3>
          <p class="muted">${escapeHtml(g.series.description)}</p>
          <ol class="toc">
${g.items.map((e) => `            <li><a href="${postPath(e)}">${escapeHtml(e.title)}</a></li>`).join('\n')}
          </ol>
        </section>`,
  )
  .join('\n')}
      </section>
      <section class="about">
        <h2>이 프로젝트는</h2>
        <ul>
          <li><a href="app/">체험 데모</a>: 서버 없이 브라우저 안에서 실제 API 코드가 동작합니다.</li>
          <li><a href="report/">테스트 리포트</a>: 배포할 때마다 실행한 Playwright E2E 결과와 화면별 스크린샷입니다.</li>
          <li><a href="${REPO_URL}">소스 코드</a>: 이 사이트와 플랫폼의 전체 코드입니다.</li>
        </ul>
      </section>`;
  return {
    path: 'index.html',
    html: layout({
      title: 'Playground — 모바일로만 만든 토이 플랫폼',
      description: '마크다운 포스트·좋아요·댓글 토이 플랫폼과 예시 포스트(언어, AI, 수학, 어텐션, 신경망 레이어, 오픈 웨이트 모델, 양자화, 트랜지스터에서 자연어까지, 알고리즘, 추상 데이터 타입, 하드웨어, 게임 셰이더, 레벨 디자인, WSL, 도커, PostgreSQL, Git, GitHub, AI 시대의 소프트웨어 부채)를 로그인 없이 읽어 보세요.',
      root: './',
      body,
    }),
  };
}

function postPage(e: Entry, prev: Entry | undefined, next: Entry | undefined): Page {
  const body = `      <nav class="crumbs" aria-label="위치"><a href="../../">홈</a> › <a href="../../#${e.series.slug}">${escapeHtml(e.series.name)}</a> › ${e.n}/${e.total}</nav>
      <article class="post">
        <h1>${escapeHtml(e.title)}</h1>
        <div class="markdown">${renderMarkdown(e.body)}</div>
      </article>
      <nav class="pager" aria-label="이전·다음 글">
${prev ? `        <a class="prev" href="${prev.n}.html">← ${escapeHtml(prev.title)}</a>\n` : ''}${next ? `        <a class="next" href="${next.n}.html">${escapeHtml(next.title)} →</a>\n` : ''}      </nav>
      <p class="try"><a class="button" href="../../app/#/posts/${e.demoId}">체험 데모에서 이 글에 좋아요·댓글 남기기</a></p>`;
  return {
    path: postPath(e),
    html: layout({ title: `${e.title} · ${e.series.name} — Playground`, description: e.summary, root: '../../', body }),
  };
}

export function buildSite(posts: SitePost[]): Page[] {
  const entries = posts.map(toEntry);
  const pages = [indexPage(entries)];
  for (const e of entries) {
    const siblings = entries.filter((x) => x.series === e.series);
    const i = siblings.indexOf(e);
    pages.push(postPage(e, siblings[i - 1], siblings[i + 1]));
  }
  return pages;
}
