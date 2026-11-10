# [GitHub 협업과 자동화 1/12] GitHub란: 원격 저장소에서 개발 플랫폼까지

> **한 줄 요약** — Git은 내 컴퓨터에서 도는 버전 관리 도구이고 GitHub는 Git 저장소를 맡아 두면서 그 위에 이슈·풀 리퀘스트·Actions·Pages 같은 협업 기능을 얹은 서비스이므로, 둘의 경계와 원격 URL·인증의 동작을 알면 "push가 안 된다"를 스스로 진단할 수 있다.

## 이 글에서 다루는 것
- Git과 GitHub의 경계: 무엇이 저장소에 있고 무엇이 서비스에 있나
- GitHub의 기능 지도와 계정·조직·팀, 저장소 공개 범위
- 인증: 비밀번호가 막힌 이유, SSH 키, 개인 액세스 토큰(세분화 대 클래식), 2단계 인증
- 원격 URL 형식(HTTPS·SSH)과 자격 증명 도우미를 로컬 Git으로 확인하기

## 문제: "GitHub에 올렸다"는 말이 감추는 것
신입 개발자가 처음 막히는 곳은 대개 push다. `Authentication failed`, `Permission denied (publickey)`, `Repository not found`가 뜨면 Git이 고장 난 것인지 GitHub 설정이 잘못된 것인지부터 헷갈린다. 커밋·브랜치·병합은 **Git**(Git 버전 관리 시리즈)이 내 컴퓨터에서 하는 일이고, **GitHub**는 그 저장소를 인터넷에 맡아 두는 호스팅 서비스이자 협업 플랫폼이다. 이슈, 풀 리퀘스트(pull request, PR), 리뷰, CI 같은 것은 Git에는 없는 개념이다. 저장소를 클론해도 이슈와 PR 토론은 따라오지 않는다.

## Git은 도구, GitHub는 서비스
GitHub 저장소도 Git 입장에서는 그냥 원격 저장소 하나다. 로컬 폴더에 작업 트리 없는 bare 저장소를 만들어 GitHub 대신 써 보자(해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q --bare server.git
git init -q app && cd app
echo "# example-app" > README.md
git add README.md
git commit -q -m "첫 커밋"
git remote add origin ../server.git
git push -q origin main
git rev-parse --short main
git -C ../server.git rev-parse --short main
ls ../server.git
```
```text
62a8db5
62a8db5
HEAD
branches
config
description
hooks
info
objects
refs
```
원격에 올라간 것은 같은 해시의 커밋 객체와 참조뿐이다. GitHub도 저장소마다 이런 Git 데이터를 보관하고, 웹 화면·권한·이슈·PR은 그 바깥의 데이터베이스와 서비스로 붙어 있다. 그래서 커밋 이력은 어느 호스팅으로든 그대로 옮길 수 있지만 이슈와 리뷰 기록은 옮기려면 별도 도구가 필요하다.

## GitHub의 기능 지도
| 기능 | 하는 일 | 다루는 편 |
|---|---|---|
| 저장소 | Git 저장소, 브랜치, 태그, 릴리스 | 1·9편 |
| 풀 리퀘스트 | 브랜치 병합 제안과 리뷰 | 2·3·5편 |
| 이슈, Projects | 할 일 추적과 계획 | 4편 |
| Actions | 이벤트로 도는 CI/CD | 6~8편 |
| Pages, Packages | 정적 사이트, 이미지·패키지 배포 | 9편 |
| 보안 기능 | Dependabot, 코드·비밀 스캐닝 | 10편 |

GitHub는 2008년 4월 정식 공개되었고, 마이크로소프트가 2018년 6월 인수를 발표해 같은 해 10월 75억 달러 규모의 인수를 마쳤다. Git 자체는 2005년에 태어났다(Git 버전 관리 1편).

계정은 사람마다 하나인 **개인 계정**과, 여러 사람이 저장소를 함께 소유하는 **조직**(organization)으로 나뉜다. 조직 안에서는 **팀**(team)으로 권한을 묶고 `@example-org/backend`처럼 멘션하며, 3편의 CODEOWNERS도 팀을 소유자로 쓴다. 저장소는 공개(public)나 비공개(private)이고, 엔터프라이즈 계정 소속 조직에는 기업 구성원 전체가 보는 내부(internal) 저장소가 더 있다. 무료 요금제로도 공개·비공개 저장소를 개수 제한 없이 만들 수 있지만, 비공개 저장소에서 보호 브랜치·코드 소유자·필수 리뷰어 같은 기능을 쓰려면 Pro나 Team 이상이 필요하다(공식 요금제 문서 기준).

## 인증: push하는 사람이 누구인가
웹에 로그인할 때와 Git으로 push할 때의 인증은 다르다. 웹은 비밀번호 + 2단계 인증(two-factor authentication, 2FA)이나 패스키를 쓰고, Git 작업은 원격 URL의 형식에 따라 **HTTPS + 토큰** 또는 **SSH 키**로 인증한다. GitHub는 2020년 11월 REST API에서, 2021년 8월 13일 Git 작업에서 계정 비밀번호를 더는 받지 않는다. 비밀번호는 여러 사이트에서 재사용되고 유출되면 계정 전체가 넘어가지만, 토큰은 범위와 만료일을 정할 수 있고 하나만 폐기할 수 있기 때문이다. 지금 HTTPS로 push하면서 비밀번호 칸에 계정 비밀번호를 넣으면 `Support for password authentication was removed on August 13, 2021`이라는 응답과 함께 실패한다.

**개인 액세스 토큰**(personal access token, PAT)은 두 종류다. 접두사로 구별된다.
| 항목 | 세분화된 토큰 | 클래식 토큰 |
|---|---|---|
| 접두사 | `github_pat_` | `ghp_` |
| 범위 | 소유자 하나, 고른 저장소만 | 내가 접근 가능한 전 저장소 |
| 권한 | 기능별 읽기·쓰기 | 넓은 스코프 단위 |

GitHub는 2022년 10월 세분화된 토큰(fine-grained PAT)을 공개 프리뷰로 내놓고 2025년 3월 정식 출시했으며, 가능하면 이쪽을 쓰라고 권한다. 다만 내가 멤버가 아닌 조직의 공개 저장소에 쓰기, 외부 협력자로서의 접근, 일부 REST 엔드포인트는 아직 클래식 토큰만 된다. 조직 소유자는 세분화된 토큰이 조직 자원에 접근하기 전에 승인을 요구할 수 있다.

SSH는 키 쌍을 만들어 공개 키를 계정 설정(SSH and GPG keys)에 등록하는 방식이다. 이 글의 실행 환경에는 `ssh-keygen`이 없어 실행하지 않은 예시로 둔다.
```sh
ssh-keygen -t ed25519 -C "dev@example.com"
ssh -T git@github.com
```
처음 접속하면 호스트 키 지문(`SHA256:…`)을 묻는데, 공식 문서에 게시된 GitHub의 지문과 같은지 확인한 뒤 수락한다. 성공하면 다음과 같은 응답이 온다(공식 문서의 출력 예).
```text
Hi USERNAME! You've successfully authenticated, but GitHub does not provide shell access.
```
회사 방화벽이 22번 포트를 막으면 `ssh -T -p 443 git@ssh.github.com`처럼 443번 포트의 `ssh.github.com`을 쓴다. 2FA는 2023년 3월부터 코드를 기여하는 사용자에게 단계적으로 의무화되었다.

## 따라 하기: 원격 URL 두 형식
같은 저장소를 가리키는 URL은 두 가지다. HTTPS는 `https://github.com/OWNER/REPO.git`, SSH는 `git@github.com:OWNER/REPO.git`이다. 어느 쪽을 쓰느냐가 곧 인증 방식을 정한다.
```bash
git remote set-url origin git@github.com:example-org/example-app.git
git remote get-url origin
git remote set-url origin https://github.com/example-org/example-app.git
git remote get-url origin
```
```text
git@github.com:example-org/example-app.git
https://github.com/example-org/example-app.git
```
팀원마다 HTTPS·SSH 취향이 달라도 `url.<base>.insteadOf` 설정으로 내 컴퓨터에서만 주소를 바꿔 쓸 수 있다. 설정 파일의 원래 값과 Git이 실제로 접속할 주소를 비교해 보자.
```bash
git config url."git@github.com:".insteadOf https://github.com/
git config --get remote.origin.url
git remote get-url origin
git config --unset url."git@github.com:".insteadOf
```
```text
https://github.com/example-org/example-app.git
git@github.com:example-org/example-app.git
```
저장소 설정에는 HTTPS가 그대로 있지만 Git은 SSH로 접속한다. push가 엉뚱한 방식으로 인증된다면 `git remote get-url`로 실제 주소부터 본다.

## 검증: 자격 증명 도우미가 하는 일
HTTPS로 접속할 때 Git은 사용자 이름과 비밀번호(실제로는 토큰)를 **자격 증명 도우미**(credential helper)에게 묻고, 없으면 터미널에서 묻는다. `git credential fill`로 그 과정을 직접 부를 수 있다. 내 컴퓨터에 설정된 다른 도우미가 끼어들지 않도록 이 저장소에서만 도우미 목록을 비우고(빈 값은 목록을 초기화한다), CI처럼 터미널 입력을 끈 상태로 물어본다.
```bash
git config credential.helper ""
printf 'protocol=https\nhost=github.com\n\n' \
  | GIT_TERMINAL_PROMPT=0 git credential fill
```
```text
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```
CI 로그에서 자주 보는 이 오류는 "건넬 자격 증명이 하나도 없다"는 뜻이다. 이번에는 가장 단순한 `store` 도우미에 가짜 값을 저장해 보자.
```bash
git config --add credential.helper "store --file=../creds.txt"
printf '%s\n' protocol=https host=github.com username=dev-kim \
  password=example-token '' | git credential approve
cat ../creds.txt
printf 'protocol=https\nhost=github.com\n\n' | git credential fill
```
```text
https://dev-kim:example-token@github.com
protocol=https
host=github.com
username=dev-kim
password=example-token
```
`store`는 토큰을 파일에 평문으로 남긴다(기본 위치는 `~/.git-credentials`). 실무에서는 운영체제 키체인을 쓰는 Git Credential Manager나, `gh auth login` 후 `gh auth setup-git`으로 GitHub CLI를 도우미로 등록하는 방법을 쓴다(11편).
```bash
git config --unset-all credential.helper
rm ../creds.txt
```

## 흔한 실수와 문제 해결
- `Support for password authentication was removed`: 비밀번호 칸에 토큰을 넣거나 SSH URL로 바꾼다. 예전에 저장된 비밀번호가 도우미에 남아 있으면 지운다.
- `Permission denied (publickey)`: 공개 키가 계정에 등록되지 않았거나 다른 키가 쓰였다. `ssh -T git@github.com`으로 어느 계정으로 인증되는지 본다.
- `Repository not found`: 비공개 저장소에 권한 없는 계정으로 접속하면 존재 자체를 숨기기 위해 이렇게 답한다. 오타보다 계정·토큰 범위를 먼저 의심한다.
- 세분화된 토큰으로 push가 거부되면 저장소 선택과 Contents 쓰기 권한, 조직의 승인 대기를 확인한다.

## 권장 설정과 한계
- 2FA를 켜고 복구 코드를 보관한다. 가능하면 패스키를 쓴다.
- 기기마다 패스프레이즈를 건 ed25519 키를 따로 만들고, 기기를 잃으면 그 키만 지운다.
- 토큰은 세분화된 토큰으로, 필요한 저장소·권한만, 만료일을 두고 만든다. 토큰을 코드나 원격 URL에 넣지 않는다.
- 이 글의 실행 결과는 Git 2.43 기준이다. GitHub Enterprise Server는 인증 방식이 설치 설정에 따라 다르다.

## 숫자로 보기
| 항목 | 값 |
|---|---|
| GitHub 정식 공개 | 2008년 4월 |
| 마이크로소프트 인수 완료 | 2018년 10월 |
| Git 비밀번호 인증 중단 | 2021년 8월 13일 |
| 세분화된 토큰 정식 출시 | 2025년 3월 |
| 세분화된 토큰 최대 개수 | 계정당 50개 |

## 어디에 쓰이나
- Git 버전 관리 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」: 여기서 만든 `origin`과 bare 저장소 실습이 그대로 fetch·push 원리로 이어진다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: SSH 호스트 키 지문 `SHA256:…`은 공개 키의 해시라서, 몇십 글자만 비교해도 키 전체가 같은지 확인할 수 있다.
- Git 버전 관리 14편 「설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응」: 자격 증명 도우미와 회사·개인 계정 분리, 토큰이 유출됐을 때의 대응을 다룬다.
- 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」: `gh auth login`이 토큰을 받아 Git 도우미로 연결하는 과정을 이어서 본다.

## 정리
- Git은 이력을 다루는 도구, GitHub는 저장소를 맡아 두고 협업 기능을 얹은 서비스다. 이슈·PR은 Git 저장소 밖에 있다.
- Git 작업 인증은 URL 형식이 정한다. HTTPS는 토큰, SSH는 키다. 계정 비밀번호는 2021년부터 받지 않는다.
- 세분화된 토큰은 소유자·저장소·권한을 좁힐 수 있어 클래식 토큰보다 안전하다.
- `git remote get-url`과 `git credential fill`로 Git이 실제로 어디에 무엇을 들고 가는지 확인할 수 있다.

## 더 알아보기
- 다음 글: 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」
- GitHub 인증 개요: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github

## 시리즈 안내
1. **GitHub란: 원격 저장소에서 개발 플랫폼까지** ← 지금 읽는 글
2. 풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식
3. 코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법
4. 이슈와 프로젝트: 할 일을 추적하고 계획하기
5. 브랜치 보호와 규칙 세트: main을 지키는 장치
6. GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝
7. GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로
8. GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험
9. 배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스
10. 의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝
11. gh CLI와 API: 터미널과 스크립트로 GitHub 다루기
12. 오픈 소스 운영: README, 라이선스, 기여 안내, 커뮤니티 파일

먼저 읽으면 좋은 글: 이 시리즈는 Git을 안다고 가정한다. Git 버전 관리 1편 「Git이란: 스냅숏으로 기록하는 분산 버전 관리」로 세 영역을, Git 버전 관리 5편 「병합: fast-forward, 3-way 병합, 충돌 해결」로 병합 기준과 충돌을, Git 버전 관리 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」로 원격 추적 브랜치를 먼저 보면 2편의 병합 방식 비교가 쉽다. Actions 편들은 도커와 컨테이너 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」와 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」을 알면 러너가 하는 일이 잘 보인다.
