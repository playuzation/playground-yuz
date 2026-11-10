# [GitHub 협업과 자동화 9/12] 배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스

> **한 줄 요약** — 배포를 워크플로로 옮기면 어느 커밋이 어떤 검사를 거쳐 나갔는지가 기록으로 남는다. Pages는 아티팩트를 `deploy-pages`가 내보내고, 이미지는 `GITHUB_TOKEN`으로 GHCR에 푸시하고, 릴리스는 태그 push가 만들며, 셋은 필요한 권한이 저마다 다르다.

## 이 글에서 다루는 것
- Pages의 두 게시 방식과, 이 사이트가 배포되는 구조
- Pages 배포 워크플로를 만들고 actionlint로 검사하기
- GHCR에 이미지를 빌드·푸시하는 워크플로와 `packages: write`
- 태그 push로 릴리스 만들기: 태그 필터, 자동 릴리스 노트, 체크섬

## 손으로 하는 배포의 문제
"제 노트북에서 빌드해서 올렸어요"라는 배포는 어느 커밋을 빌드했는지, 테스트를 통과했는지, 커밋 안 한 파일이 섞였는지 알 수 없고, 배포용 비밀번호는 노트북마다 흩어진다. 워크플로로 배포하면 깨끗한 러너가 특정 커밋을 빌드하고, 검사 잡이 통과해야만(`needs`) 배포 잡이 돌고, 자격 증명은 실행 동안만 사는 토큰이 된다. 6~8편의 CI 위에 배포 단계를 얹는 것이다.

## GitHub Pages: 브랜치에서 게시 대 Actions로 게시
Pages는 저장소의 정적 파일을 웹 사이트로 내보낸다. 게시 원천(source)은 저장소 설정에서 고른다.

| 방식 | 올라가는 것 | 맞는 경우 |
| --- | --- | --- |
| 브랜치에서 게시 | 브랜치의 `/` 또는 `/docs` | 결과물을 커밋하는 사이트 |
| GitHub Actions | 워크플로가 만든 아티팩트 | 빌드가 필요한 사이트 |

브랜치 방식은 빌드 결과물을 커밋해야 해서 이력이 더러워진다. Actions 방식에서는 `actions/upload-pages-artifact`가 폴더를 gzip으로 압축한 tar 하나로 묶어 `github-pages` 아티팩트로 올리고(10GB 미만, 심볼릭·하드 링크 금지), `actions/deploy-pages`가 그것을 배포한다. 배포 잡에는 배포를 만들 권한 `pages: write`와, 이 실행이 누구인지 증명하는 OIDC 토큰(8편)을 받을 권한 `id-token: write`가 필요하다. 배포는 `github-pages` 환경(environment)에 묶여 배포 기록에 커밋과 URL이 남는다. 게시 사이트는 1GB, 배포 한 번은 10분까지이고 대역폭은 월 100GB의 소프트 한도가 있다.

## 이 사이트는 어떻게 배포되나
이 글이 올라간 사이트도 Actions 방식이다. 워크플로 파일 하나에 잡이 셋 있다.
```text
push (모든 브랜치)
 ├ verify: 의존 검사, 테스트, 빌드
 └ e2e: Playwright → 리포트 아티팩트
       ↓ needs: [verify, e2e]
pages (기본 브랜치에서만)
 ├ 데모 빌드 + 리포트 내려받기
 ├ site/ 하나로 합치기(report/ 아래)
 └ upload-pages-artifact
     → deploy-pages
```
워크플로 전체는 `contents: read`이고 Pages 권한 둘은 pages 잡에만 준다. pages 잡은 `if:`로 기본 브랜치에서만 돌고, E2E 잡의 리포트 아티팩트(7편)를 받아 `report/` 아래에 넣는다. 첫 스텝은 `gh api`로 Pages가 켜졌는지 보고 꺼져 있으면 안내만 남기고 나머지를 건너뛴다. Pages를 안 켠 포크에서 빨간불을 막는 장치다.

## 따라 하기: Pages 배포 워크플로
빌드 잡과 배포 잡을 나눈 최소 형태다. 액션의 주 버전은 공식 문서 예를 따랐다.
```yaml
# 파일: .github/workflows/pages.yml
name: Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm ci && npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
`cancel-in-progress: false`는 진행 중인 배포를 끊지 않고 그사이 쌓인 실행 중 최신 것만 남긴다. push 전에 actionlint(6편)로 검사하고, 배포 스텝의 `id`만 바꾼 사본으로 흔한 실수도 본다(actionlint는 Git 저장소 안에서 돈다).
```bash
git init -q
lint() { docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest "$@"; }
lint && echo "actionlint: 문제 없음"
sed 's/id: deployment/id: deploy/' .github/workflows/pages.yml > bad.yml
lint bad.yml; rm bad.yml
```
```text
actionlint: 문제 없음
bad.yml:29:16: property "deployment" is not defined in object type {deploy: {conclusion: string; outcome: string; outputs: {page_url: string}}} [expression]
   |
29 |       url: ${{ steps.deployment.outputs.page_url }}
   |                ^~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```
actionlint는 `deploy-pages`의 출력이 `page_url` 하나라는 것까지 안다. 반면 `id-token: write`를 빠뜨린 것은 문법이 맞아서 못 잡고 실행해야 실패한다. 권한은 체크리스트로 지킨다.

## 컨테이너 이미지를 GHCR에 푸시하기
GitHub 컨테이너 레지스트리(GHCR)는 `ghcr.io/<소유자>/<이미지>` 주소를 쓴다. 워크플로에서는 `GITHUB_TOKEN`으로 로그인하되 잡에 `packages: write`를 준다. `docker/login-action`이 로그인하고, `docker/metadata-action`이 Git 태그에서 이미지 태그와 OCI 라벨을 만들고, `docker/build-push-action`이 빌드해 푸시한다.
```yaml
# 파일: .github/workflows/image.yml
name: Image
on:
  push:
    tags: ['v*.*.*']
permissions:
  contents: read
  packages: write
jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/${{ github.repository }}
          tags: type=semver,pattern={{version}}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```
`v1.2.0`을 push하면 이미지에 `1.2.0` 태그가 붙는다(태그 전략은 도커와 컨테이너 13편). 권한 이름과 입력 이름을 하나씩 틀린 사본을 검사해 보자.
```bash
sed -e 's/packages: write/package: write/' \
  -e 's/^          tags: \$/          tag: $/' \
  .github/workflows/image.yml > bad.yml
lint -oneline bad.yml; rm bad.yml
```
```text
bad.yml:8:3: unknown permission scope "package". all available permission scopes are "actions", … [permissions]
bad.yml:28:11: input "tag" is not defined in action "docker/build-push-action@v7". available inputs are … [action]
```
그대로 push했다면 앞의 것은 푸시 거부로, 뒤의 것은 태그 없이 푸시하려다 실패하는 식으로 실행 중에야 드러났을 것이다.

## 태그 push로 릴리스 만들기
릴리스(release)는 태그에 설명과 내려받을 파일(자산, asset)을 붙인 것이다. 태그를 방아쇠로 쓰려면 어떤 태그가 걸리는지부터 알아야 한다. 문서의 필터 패턴 규칙에서 `*`는 `/`를 뺀 0자 이상, `**`는 아무 글자 0자 이상, `+`는 앞 글자 1번 이상, `[0-9]`는 한 글자다. 이 규칙을 정규식으로 옮겨 태그에 대 본다.
```python
import re

def to_regex(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out, i = out + ".*", i + 2
            continue
        c = pattern[i]
        if c == "*": out += "[^/]*"
        elif c == "[":
            j = pattern.index("]", i)
            out, i = out + pattern[i:j + 1], j
        elif c == "+": out += c
        else: out += re.escape(c)
        i += 1
    return re.compile(out + r"\Z")

pats = ["v*.*.*", "v[0-9]+.[0-9]+.[0-9]+", "**v*"]
for t in ["v1.2.0", "v1.2.0-rc.1", "v10.0.1", "rel/v1.0.0"]:
    print(f"{t:12}", *["O" if to_regex(p).match(t) else "." for p in pats])
```
```text
v1.2.0       O O O
v1.2.0-rc.1  O . O
v10.0.1      O O O
rel/v1.0.0   . . O
```
`v*.*.*`는 마지막 `*`가 `0-rc.1`까지 삼켜 시험판 태그도 통과시킨다. 정식 버전만 원하면 둘째 패턴을 쓰고, 시험판은 `contains(github.ref_name, '-')`로 갈라 `--prerelease`를 붙인다. `*`는 `/`를 넘지 못해 `rel/v1.0.0`은 `**`로만 걸린다.

릴리스 워크플로는 소스 묶음과 체크섬 파일을 만들어 `gh release create`(11편)로 올린다. 릴리스를 만들려면 `contents: write`가 필요하다.
```yaml
# 파일: .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: |
          git archive --format=tar.gz --prefix="app-$GITHUB_REF_NAME/" \
            -o "app-$GITHUB_REF_NAME.tar.gz" HEAD
          sha256sum app-*.tar.gz > SHA256SUMS
      - env:
          GH_TOKEN: ${{ github.token }}
        run: >-
          gh release create "$GITHUB_REF_NAME"
          --verify-tag --generate-notes app-*.tar.gz SHA256SUMS
```
`--generate-notes`는 지난 릴리스 이후 병합된 PR 목록으로 노트를 쓴다. `.github/release.yml`의 `changelog.categories`에 범주 제목과 라벨을 적으면 PR이 라벨별로 묶이고, 라벨 `"*"` 범주는 앞 범주에 안 걸린 나머지를 받는다. `changelog.exclude`로 뺄 라벨·작성자도 정한다.
러너가 할 일을 로컬에서 해 보고 받는 쪽의 검증까지 확인한다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
lint && echo "actionlint: 문제 없음"
echo "# app" > README.md
git add -A && git commit -qm "배포 워크플로 추가"
git tag -a v1.2.0 -m "v1.2.0"
GITHUB_REF_NAME=v1.2.0
git archive --format=tar.gz --prefix="app-$GITHUB_REF_NAME/" \
  -o "app-$GITHUB_REF_NAME.tar.gz" HEAD
sha256sum app-*.tar.gz > SHA256SUMS
tar tzf app-v1.2.0.tar.gz | grep -v '/$'
sha256sum -c SHA256SUMS
```
```text
actionlint: 문제 없음
app-v1.2.0/.github/workflows/image.yml
app-v1.2.0/.github/workflows/pages.yml
app-v1.2.0/.github/workflows/release.yml
app-v1.2.0/README.md
app-v1.2.0.tar.gz: OK
```
묶음에는 태그가 가리키는 커밋의 파일만 들어가고 작업 트리의 `SHA256SUMS`는 빠진다. 깨졌거나 바꿔치기된 파일은 체크섬이 잡는다.
```bash
echo "변조" >> app-v1.2.0.tar.gz
sha256sum -c SHA256SUMS
```
```text
app-v1.2.0.tar.gz: FAILED
sha256sum: WARNING: 1 computed checksum did NOT match
```
다만 체크섬도 같은 릴리스에 있으므로, 릴리스 자체를 바꿀 수 있는 공격자까지 막으려면 서명이나 빌드 출처 증명(attestation)이 필요하다.

## 흔한 실수와 문제 해결
- 배포 잡이 Pages를 찾지 못한다: 설정에서 Pages 원천을 GitHub Actions로 바꾸지 않았다.
- 배포 스텝만 권한 오류로 실패한다: 배포 잡에 `pages: write`·`id-token: write`가 없다.
- GHCR 푸시가 거부된다: `packages: write`가 없거나, 같은 이름의 패키지를 예전에 따로 올려 저장소와 연결되지 않았다(패키지 설정에서 Actions 접근을 허락). 이미지 이름은 소문자만 된다.
- 워크플로가 만든 태그로 릴리스 워크플로가 안 돈다: `GITHUB_TOKEN`으로 일으킨 이벤트는 새 실행을 만들지 않는다(무한 루프 방지, `workflow_dispatch`·`repository_dispatch`는 예외).

## 권장 설정과 체크리스트
- 기본은 `contents: read`, 쓰기 권한은 배포 잡에만 준다.
- 배포 잡은 `needs`로 검사 뒤에, 기본 브랜치나 태그에서만 돌린다.
- 배포에 환경을 붙이고 운영 환경에는 승인 규칙을 둔다(8편).
- 액션은 SHA로 고정하고(8편), 릴리스 자산에는 체크섬을 붙인다.

## 어디에 쓰이나
- 도커와 컨테이너 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」: 로컬 레지스트리로 해 본 tag·push를 `build-push-action`이 CI에서 대신한다.
- Git 버전 관리 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」: 주석 태그와 시맨틱 버저닝이 릴리스 워크플로의 방아쇠가 된다.
- 레벨 디자인과 콘텐츠 제공 16편 「콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포」: 검증을 통과한 빌드만 내보내고 해시로 받은 것을 확인하는 원리가 `needs`와 `SHA256SUMS`에서 같다.

## 정리
- Pages의 Actions 방식은 아티팩트를 `deploy-pages`가 내보낸다(`pages: write`, `id-token: write`).
- GHCR 푸시는 `packages: write`, 릴리스는 `contents: write`가 필요하다.
- 태그 필터의 `*`는 시험판도 삼키므로 패턴을 정확히 쓰고, 자산에는 체크섬을 붙인다.
- actionlint는 이름 오타를 잡지만 빠진 권한은 못 잡는다.

## 더 알아보기
- 이전 글: 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」
- 다음 글: 10편 「의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝」
- GitHub Docs, Pages 사용자 정의 워크플로: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
