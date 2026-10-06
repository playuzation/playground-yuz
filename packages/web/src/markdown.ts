import MarkdownIt from 'markdown-it';

// html: false → 본문 속 HTML 태그는 렌더링하지 않고 이스케이프한다(XSS 방지).
// 기본 링크 검증이 javascript:, vbscript:, file:, data: 링크를 막는다.
// 이미지 문법은 끈다: 포스트는 텍스트만 허용한다.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true }).disable('image');

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx]!.attrSet('target', '_blank');
  tokens[idx]!.attrSet('rel', 'noopener noreferrer nofollow');
  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
