// esbuild의 text 로더로 .md 파일을 문자열로 가져온다(build.mjs 참고).
declare module '*.md' {
  const content: string;
  export default content;
}
