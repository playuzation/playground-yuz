# CLAUDE.md

포스트(마크다운)·좋아요·댓글만 있는 토이 플랫폼. 진짜 목적은 **모바일 Claude 앱 + 클라우드 세션만으로 개발하면서 CI·실제 브라우저 검증을 해내는 것**이다.
사용자는 로컬 브라우저나 터미널이 없다. 사용자에게 보이는 증거(스크린샷, CI 결과, 배포 URL)를 직접 만들어 전달해야 한다.

## 명령어

| 명령 | 내용 |
| --- | --- |
| `npm run verify` | 의존 규칙 검사 → 타입체크 → 단위/통합 테스트 → 빌드 (CI `verify` 잡과 동일) |
| `npm run e2e` | Playwright E2E 전체 (실서버 데스크톱/모바일 + 데모 모바일, CI `e2e` 잡과 동일) |
| `npm run shots` | 화면 둘러보기 테스트만 실행 → `e2e/screenshots/<프로젝트>/*.png` |
| `npm start` | web 빌드 후 서버 실행 (http://localhost:3000, DB: `packages/server/data/app.db`) |

단일 테스트: `node --test packages/api/src/app.test.ts`, `npx playwright test -c e2e social --project=demo-mobile`

## 검증 루프 (변경할 때마다 지킬 것)

1. 코드 변경 후 `npm run verify`.
2. 동작/UI에 영향이 있으면 `npm run e2e`.
3. UI가 바뀌면 `npm run shots` → 바뀐 화면을 Read로 **직접 열어 확인**하고, `SendUserFile`로 사용자에게 보낸다(모바일 화면 우선: `fullstack-mobile`, `demo-mobile`).
4. push 후 GitHub MCP(`actions_list`, `get_job_logs`)로 CI 결과를 확인한다. PR이 있으면 `subscribe_pr_activity`로 CI/리뷰 이벤트를 받는다.
5. 실패를 "flake"로 넘기지 않는다. 재현 → 원인 수정 → 같은 검사 통과를 확인한 뒤 push.

## 아키텍처 규칙 (트리/계층, 순환 금지)

```
L2  server (Node: SQLite + 정적 파일)     demo (정적 데모: web + api + MemoryStore)
L1  api (Hono HTTP, 웹 표준 API만)        web (Preact SPA, 마크다운 렌더링)
L0  core (도메인 타입, 검증, Store 계약, MemoryStore — 외부 의존 없음)
```

- 각 `packages/*/package.json`의 `"layer"` 숫자보다 **낮은 layer에만** 의존할 수 있다. 같은 layer끼리도 안 된다.
- import하는 워크스페이스 패키지는 반드시 `package.json`에 선언한다.
- `scripts/check-deps.mjs`가 위 규칙과 패키지 내부 파일 순환을 검사한다(`verify`에 포함).
- `core`는 여러 상위 패키지가 공유하는 잎(leaf)이다. 이를 넘어서는 공유(예: 같은 layer 간 의존)가 불가피해 보이면 구현하지 말고 사용자에게 먼저 경고한다.
- 새 패키지는 결합도/응집도를 따져 꼭 필요할 때만 만들고, `layer`를 지정하고 루트 `workspaces`에 추가한다.

## 코드 규칙

- 서버/테스트는 Node의 네이티브 TypeScript 실행(type stripping)으로 돈다. 빌드 단계 없음.
  - 상대 import는 `.ts`/`.tsx` 확장자를 붙인다.
  - 지워지는 문법만 쓴다: `enum`, `namespace`, 생성자 파라미터 프로퍼티 금지(`erasableSyntaxOnly`).
  - `.tsx`는 web에만 있고 esbuild로 번들된다. Node 테스트(`*.test.ts`)는 `.tsx`를 import할 수 없다.
- `api`는 Node 전용 모듈을 쓰지 않는다(데모에서 브라우저로 번들됨). 암호화는 WebCrypto.
- 인증은 `Authorization: Bearer <token>`. 쿠키를 쓰지 않는 이유는 `packages/api/src/app.ts` 주석 참고.
- Store 구현을 바꾸거나 추가하면 `@playground/core/store-contract`의 계약 테스트를 통과시켜야 한다(실서버와 데모의 동작 일치 보장).
- 포스트는 텍스트만: 마크다운의 HTML·이미지는 렌더링하지 않는다(`packages/web/src/markdown.ts`).

## 브랜치와 병합

- `main`: 기본 브랜치이자 배포(GitHub Pages) 기준. 직접 push하지 않는다.
- `dev`: 통합 브랜치. 직접 push하지 않는다(아래의 재생성만 예외).
- 작업 브랜치는 최신 `dev`에서 분기한다. 클라우드 세션이 `claude/*` 브랜치를 지정해도 이 규칙을 따른다(사용자 결정).
  - `feat/{feature}`: 코드를 추가·변경하는 작업.
  - `docs/{topic}`: 코드 변경 없이 md 같은 텍스트 파일만 추가·수정하는 작업(CLAUDE.md, README, 포스트 원문 등). 예시 포스트를 싣기 위한 `example-posts.ts` 등록 줄만 함께 바뀌는 경우도 여기에 포함한다.
- 병합은 PR로 한다. Claude가 PR을 만들고, PR head 커밋의 CI가 통과한 것을 확인한 뒤 직접 병합한다.
  - `feat/*`, `docs/*` → `dev`: squash 병합. 병합된 브랜치는 저장소의 "병합된 브랜치 자동 삭제" 설정이 지운다.
  - `dev` → `main`: merge commit(squash 금지, dev와 main 이력을 맞추기 위해). 사용자가 요청할 때 진행한다.
  - **`dev` → `main` 병합이 성공하면 자동 삭제 설정 때문에 `dev`도 함께 지워진다. 병합 직후 바로 `main`을 기점으로 `dev`를 다시 만든다**(사용자가 승인한 절차): `git fetch origin main && git push origin origin/main:refs/heads/dev`

## 환경 메모

- `@playwright/test`는 **1.56.1로 고정**한다. 클라우드 컨테이너의 `/opt/pw-browsers`에 있는 Chromium(revision 1194)과 맞는 버전이다. 올리면 컨테이너 E2E가 깨지므로, 올려야 한다면 `launchOptions.executablePath: '/opt/pw-browsers/chromium'`을 함께 설정한다. `playwright install`은 컨테이너에서 실행하지 않는다(CI에서만).
- 세션 시작 훅(`.claude/hooks/session-start.sh`)이 `npm install`을 해 둔다.
- GitHub Pages(기본 브랜치에서만 배포): 루트 = 데모, `/report/` = Playwright 리포트.
