# playground-yuz

포스트(마크다운)·좋아요·댓글만 있는 아주 작은 플랫폼입니다.
기능보다 **"모바일 Claude 앱 + 클라우드 세션 + GitHub만으로 개발할 때 CI와 실제 브라우저 테스트를 어떻게 하느냐"**를 실험하는 토이 프로젝트입니다.

## 모바일 전용 개발에서 검증하는 방법

로컬 브라우저도 터미널도 없으므로, 검증을 세 군데로 나누고 각각의 결과를 **휴대폰에서 볼 수 있는 형태**로 만듭니다.

| 무엇을 | 어디서 실행 | 휴대폰에서 확인하는 방법 |
| --- | --- | --- |
| 타입·의존 규칙·단위/통합 테스트 | 클라우드 컨테이너 + GitHub Actions (`npm run verify`) | Claude 보고, GitHub 앱의 체크 표시 |
| 실제 브라우저 E2E (Chromium, 데스크톱·모바일 뷰포트) | 컨테이너에 미리 설치된 Chromium + GitHub Actions (`npm run e2e`) | Claude가 대화창으로 보내는 스크린샷, Pages의 테스트 리포트 |
| 사람이 직접 만져 보기 | GitHub Pages의 **데모** (서버 없이 브라우저 안에서 API가 동작) | 휴대폰 브라우저로 데모 URL 열기 |

핵심 아이디어:

1. **컨테이너 안에서 진짜 브라우저를 돌린다.** 클라우드 세션에는 Chromium이 미리 설치되어 있어, Playwright로 실서버를 띄우고 실제 렌더링을 검사합니다. 세션 시작 훅이 의존성을 설치해 두므로 새 세션에서도 바로 실행됩니다.
2. **눈으로 볼 증거를 만든다.** 화면 둘러보기 테스트(`npm run shots`)가 주요 화면을 PNG로 저장하고, Claude가 직접 확인한 뒤 대화창으로 보내 줍니다.
3. **같은 코드를 서버 없이도 돌린다.** API(Hono)는 웹 표준 API만 쓰기 때문에 브라우저 안에서도 실행됩니다. 데모는 UI + API + 메모리 저장소를 한 번들로 묶어 GitHub Pages에 올립니다. E2E는 실서버와 데모 **둘 다** 같은 시나리오로 검사합니다.
4. **CI 결과도 Claude가 본다.** push 후 Claude가 GitHub MCP로 Actions 결과와 로그를 확인하고, PR이면 이벤트를 구독해 실패를 고칩니다.

## 최초 1회 설정 (휴대폰 브라우저로 가능)

GitHub 저장소 → **Settings → Pages → Build and deployment → Source: `GitHub Actions`**

설정 후 기본 브랜치에 push될 때마다 아래 주소로 배포됩니다. 설정 전에는 배포 단계만 건너뛰고 CI는 정상 통과합니다.

- 데모: https://playuzation.github.io/playground-yuz/
- 테스트 리포트: https://playuzation.github.io/playground-yuz/report/

## 구조

모듈은 계층(layer)을 가진 트리로 나누고, 아래 방향으로만 의존합니다. `npm run check:deps`가 이 규칙과 순환 참조를 검사합니다.

```
L2  server ─ Node 런타임: SQLite 저장소 + API + 정적 파일
    demo   ─ 정적 데모: web + api + 메모리 저장소 (GitHub Pages)
L1  api    ─ HTTP API (Hono, Node와 브라우저 양쪽에서 동작)
    web    ─ UI (Preact SPA, 마크다운 렌더링)
L0  core   ─ 도메인 타입, 입력 검증, 저장소 계약(Store), 메모리 저장소
e2e        ─ Playwright (코드 의존 없음, 블랙박스)
```

## 명령어

```bash
npm install
npm run verify   # 의존 규칙 → 타입체크 → 단위/통합 테스트 → 빌드
npm run e2e      # Playwright E2E (실서버 데스크톱/모바일 + 데모 모바일)
npm run shots    # 주요 화면 스크린샷 → e2e/screenshots/
npm start        # http://localhost:3000
```

## 범위

- 포함: 가입/로그인/로그아웃, 포스트 작성·목록·상세(마크다운 렌더링), 좋아요 토글, 댓글 작성·목록
- 제외: 이미지·첨부파일(마크다운의 HTML·이미지 문법도 렌더링하지 않음), 수정·삭제, 페이지네이션, 검색, 실서버 배포
