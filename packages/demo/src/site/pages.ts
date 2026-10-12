// build.mjs가 esbuild로 번들해 실행하는 진입점(.md를 문자열로 불러와야 해서 Node로 바로 실행하지 않는다).
import { examplePosts } from '../example-posts.ts';
import { seed } from '../seed.ts';
import { buildSite, type Page } from './render.ts';

export function pages(): Page[] {
  // 체험 데모의 초기 데이터와 같은 id로 연결하기 위해 실제 seed를 만들어 본다.
  const idByTitle = new Map(seed().posts.map((p) => [p.title, p.id]));
  return buildSite(examplePosts.map((p) => ({ ...p, demoId: idByTitle.get(p.title)! })));
}
