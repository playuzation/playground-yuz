// 예시 포스트 파일 형식: 첫 줄 `# 제목`, 나머지는 마크다운 본문.
export function parsePost(source: string): { title: string; body: string } {
  const [first = '', ...rest] = source.split('\n');
  return { title: first.replace(/^#\s+/, '').trim(), body: rest.join('\n').trim() };
}
