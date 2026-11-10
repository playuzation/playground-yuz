# [GitHub 협업과 자동화 8/12] GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험

> **한 줄 요약** — CI 러너는 비밀 값과 쓰기 토큰을 든 채 남이 쓴 코드(PR, 이슈 제목, 서드파티 액션)를 실행하는 기계이므로, 토큰 권한은 최소로, 신뢰할 수 없는 입력은 환경 변수로, 액션은 움직이지 않는 커밋 SHA로, 클라우드 자격 증명은 OIDC의 단기 토큰으로 다뤄야 한다.

## 이 글에서 다루는 것
- secrets·variables와 환경(environment) 보호 규칙
- `GITHUB_TOKEN`의 기본 권한과 `permissions:`로 최소 권한 만들기
- `pull_request_target`과 스크립트 주입을 안전한 예로 재현하고 actionlint로 잡기
- 태그가 움직이는 것을 로컬에서 재현하고 2025년 tj-actions/changed-files 사고 읽기
- OIDC로 장기 키 없이 클라우드에 배포하기

## 문제: CI는 권한 있는 남의 코드 실행기
6·7편의 워크플로는 저장소에 쓰고, 배포하고, 클라우드 키를 쓴다. 그러면서 PR 작성자가 고친 코드, 아무나 쓸 수 있는 이슈 제목, 수십 개의 서드파티 액션을 실행한다. 공격자에게 CI는 비밀이 모인 곳으로 들어가는 문이다. 문은 넷이다. 비밀 값, 토큰 권한, 신뢰할 수 없는 입력, 남의 액션.

## 비밀, 변수, 환경
**secrets**는 암호화해 저장하는 값이다. `${{ secrets.DEPLOY_KEY }}`로 읽고, 로그에 그 값이 찍히면 `***`로 가려진다. 가리기는 정확히 같은 문자열만 찾으므로 base64로 바꾸거나 한 글자씩 찍으면 그대로 보인다. 가리기는 실수 방지일 뿐 보안 경계가 아니다. 포크에서 온 PR로 실행된 워크플로에는 비밀이 전달되지 않는다(읽기 전용 `GITHUB_TOKEN`만 받는다). 비밀이 아닌 설정은 **variables**(`${{ vars.REGION }}`)에 둔다.

**환경**(environment)은 배포 대상별로 비밀과 보호 규칙을 묶는다. 잡에 `environment: production`을 적으면 필수 검토자(최대 6명, 그중 한 명 승인), 대기 타이머(최대 30일), 배포 가능한 브랜치 제한을 통과해야 잡이 시작되고, 그 환경의 비밀도 그때 비로소 잡에 주어진다. 비공개 저장소에서는 요금제에 따라 쓸 수 있는 보호 규칙이 다르다. 이 사이트를 만드는 저장소의 배포 잡도 `github-pages` 환경을 쓴다.

## GITHUB_TOKEN과 permissions
워크플로가 저장소에 무언가 하려면 토큰이 필요하다. GitHub는 잡마다 `GITHUB_TOKEN`을 새로 만들어 주고, 잡이 끝나면 만료시킨다. 권한의 기본값은 설정에 따라 다르다. 2023년 2월부터 새로 만든 조직·엔터프라이즈와 개인 계정의 새 저장소는 기본이 읽기 전용이지만(조직의 저장소는 조직 설정을 따른다), 그 전에 만든 곳은 읽기·쓰기 기본값이 남아 있을 수 있다. 그래서 기본값에 기대지 말고 워크플로에 `permissions:`를 적는다. 규칙 두 가지가 중요하다. 하나라도 적으면 적지 않은 권한은 모두 `none`이 된다. 잡 수준 `permissions:`는 워크플로 수준과 합쳐지지 않고 대체한다. 이 사이트 저장소는 최상위에 `contents: read`만 두고, 배포 잡에만 `pages: write`와 `id-token: write`를 준다.

## pull_request_target: 비밀을 든 채 PR 코드를
`pull_request`는 포크 PR이면 비밀 없이 읽기 전용 토큰으로 돈다. 그래서 포크 PR에 라벨이나 댓글을 다는 자동화를 위해 `pull_request_target`이 있다. 이 이벤트는 base 저장소의 워크플로를 base 저장소의 권한과 비밀로 실행한다. 위험은 여기서 PR의 코드를 체크아웃해 빌드·테스트할 때 생긴다.
```text
pull_request (포크)
  PR의 워크플로·코드, 비밀 없음
pull_request_target
  기본 브랜치의 워크플로, 비밀 있음
  + PR head 체크아웃 후 실행
  = 공격자 코드가 비밀과 함께 실행
```
PR의 `package.json` 스크립트 하나만 바꿔도 비밀이 새어 나간다. GitHub는 2025년 12월 8일부터 이 이벤트가 PR의 base와 상관없이 항상 기본 브랜치의 워크플로 파일을 쓰게 바꿨고, 2026년 6월 정식 출시된 `actions/checkout` v7은 이런 흔한 패턴을 기본으로 거부한다. 그래도 원칙은 같다. `pull_request_target`에서는 PR 코드를 실행하지 않는다.

## 스크립트 주입: 식은 셸보다 먼저 치환된다
6편에서 본 대로 러너는 `${{ }}`를 계산해 스크립트 문자열에 끼워 넣은 뒤 셸에 넘긴다. 이슈 제목처럼 누구나 쓸 수 있는 값이 그대로 들어가면 그 값이 코드가 된다. 치환 과정을 bash로 흉내 내 보자(주입되는 명령은 무해한 `echo`다).
```bash
title='버그 "; echo "주입된 명령 실행됨'
tmpl='echo "제목: ${{ github.event.issue.title }}"'
script=${tmpl//'${{ github.event.issue.title }}'/$title}
echo "$script"
bash -c "$script"
```
```text
echo "제목: 버그 "; echo "주입된 명령 실행됨"
제목: 버그
주입된 명령 실행됨
```
제목 속 따옴표가 문자열을 닫고 두 번째 명령을 시작했다. 실제 공격이라면 `echo` 자리에 토큰을 밖으로 보내는 명령이 온다. 고치는 방법은 식을 스크립트가 아니라 환경 변수에 넣는 것이다. 셸은 변수의 내용을 코드로 해석하지 않는다.
```bash
TITLE=$title bash -c 'echo "제목: $TITLE"'
```
```text
제목: 버그 "; echo "주입된 명령 실행됨
```
actionlint는 이 패턴을 안다. 위험한 워크플로와 고친 워크플로를 함께 검사한다.
```yaml
# 파일: .github/workflows/triage.yml
name: triage
on:
  issues:
    types: [opened]
jobs:
  greet:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - run: echo "새 이슈 ${{ github.event.issue.title }}"
      - run: echo "새 이슈 $TITLE"
        env:
          TITLE: ${{ github.event.issue.title }}
```
```bash
actionlint() {
  docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -no-color "$@"
}
actionlint -oneline .github/workflows/triage.yml
```
```text
.github/workflows/triage.yml:12:35: "github.event.issue.title" is potentially untrusted. avoid using it directly in inline scripts. instead, pass it through an environment variable. see https://docs.github.com/en/actions/reference/security/secure-use#good-practices-for-mitigating-script-injection-attacks for more details [expression]
```
12줄의 직접 삽입만 걸리고, 13~15줄의 환경 변수 방식은 통과했다. actionlint는 이슈·PR 제목과 본문, `github.head_ref`(브랜치 이름도 공격자가 정한다) 같은 값을 신뢰할 수 없는 입력으로 분류한다. 다만 `pull_request_target`에서 PR head를 체크아웃하는 패턴은 actionlint가 잡지 않으므로, 리뷰나 보안 특화 검사 도구(zizmor 등)로 본다.

## 서드파티 액션: 태그는 움직인다
`uses: owner/action@v1`의 `v1`은 Git 태그이고, 태그는 저장소에 쓰기 권한이 있는 사람이 언제든 다른 커밋으로 옮길 수 있다(Git 버전 관리 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」). 액션 저장소 하나를 로컬에 만들어 확인한다.
```bash
git init -q --bare action.git
git clone -q action.git action 2>/dev/null && cd action  # 빈 저장소 경고 숨김
echo 'echo "변경된 파일 목록"' > run.sh && git add run.sh
git commit -qm "v1" && git tag v1 && git push -q origin main v1
good=$(git rev-parse v1)
echo 'echo "(공격자가 바꾼 코드)"' > run.sh && git commit -qam "악성"
git tag -f v1 >/dev/null && git push -qf origin v1 && cd ..
git clone -q -c advice.detachedHead=false --branch v1 action.git by-tag
git clone -q action.git by-sha && git -C by-sha checkout -q $good
cat by-tag/run.sh by-sha/run.sh
```
```text
echo "(공격자가 바꾼 코드)"
echo "변경된 파일 목록"
```
태그로 받은 쪽은 사용자가 아무것도 바꾸지 않았는데 공격자의 코드를 받았고, 커밋 SHA로 받은 쪽은 원래 코드 그대로다. SHA는 내용의 해시라서 같은 SHA가 다른 내용을 가리키게 만들 수 없다.

2025년 3월의 **tj-actions/changed-files** 사고가 정확히 이것이었다. 3월 14~15일 공격자가 이 액션의 여러 버전 태그(v1~v45.0.7)를 악성 커밋으로 옮겼고, 그 코드는 러너 메모리에서 CI 비밀을 찾아 워크플로 로그에 찍었다. 공개 저장소라면 로그를 누구나 볼 수 있다. 이 액션을 쓰는 저장소는 2만 3천 개가 넘었고, CVE-2025-30066으로 등록되어 v46.0.1에서 고쳐졌다. 공격자는 이 저장소에 권한이 있던 봇 계정의 개인 액세스 토큰을 손에 넣었는데, Wiz는 그 직전(3월 11일) 침해된 reviewdog/action-setup(CVE-2025-30154)이 출발점이었을 가능성이 높다고 분석했다. reviewdog 사례는 SHA 고정의 한계도 보여 준다. 내가 SHA로 고정한 액션이 안에서 다른 액션을 태그로 부르면 그 부분은 여전히 움직인다. 커밋 SHA로 고정할 때는 사람이 읽을 버전을 주석으로 남긴다.
```yaml
- uses: example-org/some-action@<40자리 커밋 SHA>  # v2.3.1
```
고정한 SHA는 저절로 갱신되지 않으므로 Dependabot이 새 버전의 SHA로 바꾸는 PR을 올리게 한다(10편). 조직 설정에서 허용할 액션 목록을 제한할 수도 있다.

## OIDC: 장기 키 없이 클라우드에
클라우드 액세스 키를 secrets에 넣어 두면 위 사고처럼 로그에 한 번 찍히는 순간 만료될 때까지 유효한 키가 샌다. **OIDC**(OpenID Connect)를 쓰면 저장할 키가 없다. 잡이 GitHub의 OIDC 공급자(`https://token.actions.githubusercontent.com`)에게 서명된 ID 토큰을 받고, 클라우드는 미리 신뢰 관계를 맺어 둔 조건과 토큰의 클레임을 대조해 몇 분~몇 시간짜리 임시 자격 증명을 내준다. 조건의 핵심은 `sub` 클레임이다. `repo:example-org/example-app:ref:refs/heads/main`(그 브랜치), `repo:example-org/example-app:environment:production`(그 환경)처럼 좁게 건다. 조건이 얼마나 넓은지는 직접 대조해 보면 분명하다. AWS IAM의 `StringLike`처럼 `*`가 아무 글자나(`/`와 `:`도) 맞는다고 보고, 토큰 네 개의 `sub`를 조건 세 개에 맞춰 본다.
```python
from fnmatch import fnmatchcase

subs = ["repo:example-org/example-app:ref:refs/heads/main",
        "repo:example-org/example-app:pull_request",
        "repo:example-org/other-app:ref:refs/heads/feat-x",
        "repo:example-org/example-app:environment:production"]
for cond in ["repo:example-org/*", "repo:example-org/example-app:*",
             "repo:example-org/example-app:environment:production"]:
    print(sum(fnmatchcase(s, cond) for s in subs), "/ 4 ←", cond)
```
```text
4 / 4 ← repo:example-org/*
3 / 4 ← repo:example-org/example-app:*
1 / 4 ← repo:example-org/example-app:environment:production
```
조직 단위 조건은 다른 저장소의 기능 브랜치까지, 저장소 단위 조건도 PR 워크플로까지 배포 역할을 얻게 한다. 환경 조건을 쓰면 환경 보호 규칙(필수 검토자 등)을 통과한 잡만 남는다. 잡에는 `id-token: write` 권한이 필요하다. 이 사이트 저장소의 Pages 배포 잡에 이 권한이 있는 이유도 배포 액션이 OIDC 토큰으로 출처를 증명하기 때문이다.
```yaml
# 파일: .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::123456789012:role/example-deploy
          aws-region: ap-northeast-2
      - run: ./deploy.sh
```
```bash
actionlint -oneline .github/workflows/deploy.yml && echo "문제 없음"
```
```text
문제 없음
```
잡 수준 `permissions:`가 대체 규칙이라 `contents: read`를 다시 적었다. `persist-credentials: false`는 checkout이 토큰을 `.git/config`에 남기지 않게 해, 뒤 스텝이 실행하는 코드가 그 토큰을 집어 가지 못하게 한다.

## 흔한 실수와 체크리스트
- **포크 PR에서 비밀이 비어 테스트 실패**: 정상이다. `pull_request_target`으로 바꾸지 말고, 비밀이 필요한 단계는 병합 후 push에서 돌린다.
- **권한 오류 `Resource not accessible by integration`**: `permissions:`에 필요한 권한이 빠졌다(잡 수준이면 대체된다는 점부터 본다).
- 체크리스트: 최상위 `permissions: contents: read`, 신뢰할 수 없는 값은 `env:`로, 서드파티 액션은 SHA 고정 + Dependabot, 배포는 환경 보호 규칙 + OIDC, 워크플로 변경 PR에 actionlint.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: SHA 고정이 안전한 이유는 해시가 내용에서 계산되어, 같은 SHA로 다른 내용을 만들기가 사실상 불가능하기 때문이다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 정해진 입구로만 커널에 들어가게 하는 모드 분리처럼, `permissions:`는 잡마다 필요한 권한만 열어 준다.
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 로그와 이미지 레이어는 한 번 남으면 지우기 어렵다는 점이 같다.

## 정리
- 비밀 가리기는 실수 방지일 뿐이고, 포크 PR에는 비밀이 가지 않으며, 배포 비밀은 환경 보호 규칙 뒤에 둔다.
- `permissions:`는 적지 않은 권한을 `none`으로 만들고, 잡 수준은 워크플로 수준을 대체한다.
- `${{ }}`는 셸보다 먼저 치환되므로 신뢰할 수 없는 값은 환경 변수로 넘긴다.
- 태그는 움직이고 SHA는 움직이지 않는다. 클라우드 자격 증명은 OIDC의 단기 토큰으로 받는다.

## 더 알아보기
- 이전 글: 7편 「GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로」
- 다음 글: 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」
- GitHub Docs, Secure use reference: docs.github.com/en/actions/reference/security/secure-use
