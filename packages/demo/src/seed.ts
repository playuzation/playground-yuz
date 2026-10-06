import { MemoryStore, type MemoryState } from '@playground/core';

const WELCOME = `이 페이지는 **데모 모드**입니다. 서버 없이 브라우저 안에서 실제 API 코드가 동작하고,
데이터는 이 브라우저의 localStorage에만 저장됩니다.

## 해 볼 것
1. 오른쪽 위 **가입**으로 계정을 만든다
2. **새 글**에서 마크다운으로 포스트를 쓴다
3. 좋아요와 댓글을 남긴다

## 마크다운 예시
- *기울임*, **굵게**, \`인라인 코드\`
- [링크](https://github.com/playuzation/playground-yuz)

> 인용문

\`\`\`
코드 블록
\`\`\``;

// 처음 방문했을 때 보여 줄 초기 데이터. guide 계정은 로그인할 수 없다.
export function seed(): MemoryState {
  const store = new MemoryStore();
  const now = new Date().toISOString();
  const guide = store.createUser({ username: 'guide', passwordHash: '!', createdAt: now })!;
  store.createPost({ authorId: guide.id, title: '데모에 오신 것을 환영합니다', body: WELCOME, createdAt: now });
  return store.state;
}
