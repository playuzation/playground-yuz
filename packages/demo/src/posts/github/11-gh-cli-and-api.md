# [GitHub 협업과 자동화 11/12] gh CLI와 API: 터미널과 스크립트로 GitHub 다루기

> **한 줄 요약** — 웹 화면에서 하는 일 대부분은 API로도 할 수 있고, `gh`는 그 호출을 인증과 함께 감싼 도구다. 매일 쓰는 PR·이슈·실행 명령에 더해 `gh api`의 `--paginate`·`--jq`, 요청 한도, 웹훅 서명 검증, 앱과 토큰의 차이를 알면 반복 작업을 스크립트로 옮길 수 있다.

## 이 글에서 다루는 것
- `gh`로 PR·이슈·워크플로 실행을 다루는 명령과 인증 방식
- REST API와 GraphQL API, `gh api`, 요청 한도와 페이지네이션
- 응답 JSON을 jq로 가공하는 스크립트(저장된 예시 JSON으로 실행)
- 웹훅 서명 검증, GitHub 앱·OAuth 앱·개인 액세스 토큰의 차이

## 웹 화면으로는 반복이 안 된다
"열린 PR 중 사흘 넘게 리뷰를 못 받은 것", "실패한 CI의 로그만" 같은 질문을 매일 클릭으로 답하면 시간이 새고 실수가 생긴다. 웹 화면에서 하는 일 대부분은 REST·GraphQL API로도 할 수 있으므로 터미널과 스크립트로 옮기면 된다. 공식 CLI인 `gh`가 그 입구다. 이 글의 `gh` 옵션은 gh 2.89의 도움말로 확인했다.

## gh: 터미널에서 하는 GitHub 일
아래는 계정이 필요한 명령이라 예시로만 둔다.
```sh
gh auth login                      # 브라우저 또는 토큰으로 로그인
gh repo clone example-org/example-app
gh pr create --fill --base dev     # 커밋 메시지로 제목·본문
gh pr checkout 42                  # 남의 PR을 로컬 브랜치로
gh pr checks 42 --watch            # 상태 검사가 끝날 때까지
gh pr merge 42 --squash --delete-branch
gh issue list --label bug --assignee @me
gh run watch                       # 진행 중인 실행 따라가기
gh run view --log-failed           # 실패한 스텝 로그만
```
`gh pr checkout`은 포크에서 온 PR도 원격을 따로 추가하지 않고 받아 온다. `gh run view --log-failed`는 수천 줄 로그에서 실패한 스텝만 보여 줘서 CI 진단(6편)의 첫 명령으로 좋다. 옵션은 도움말에서 바로 확인할 수 있다.
```bash
gh --version | head -1
gh pr merge --help | grep -E -- '--(squash|delete-branch|auto)\b'
```
```text
gh version 2.89.0 (2026-03-26)
      --auto                    Automatically merge only after necessary requirements are met
  -d, --delete-branch           Delete the local and remote branch after merge
  -s, --squash                  Squash the commits into one commit and merge it into the base branch
```
`--auto`는 필수 검사와 승인(5편)이 채워지면 병합하도록 예약한다. 인증 정보는 `gh auth login`이 운영체제의 자격 증명 저장소에 넣고, `gh auth setup-git`을 하면 Git의 HTTPS push도 같은 인증을 쓴다. 워크플로 안에는 로그인 절차가 없으므로 환경 변수 `GH_TOKEN`으로 토큰을 준다. 이 사이트의 배포 잡이 Pages가 켜졌는지 `gh api`로 확인할 때도 그렇게 한다(9편). 빠뜨리면 이렇게 된다.
```bash
env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_ACTIONS=true gh api user
```
```text
gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable. Example:
  env:
    GH_TOKEN: ${{ github.token }}
```

## REST API와 GraphQL API
REST API는 자원마다 주소가 있다(`GET /repos/{owner}/{repo}/pulls`). 주소가 정해져 있어 단순하지만, PR 목록과 각 PR의 리뷰를 함께 보려면 PR마다 한 번씩 더 불러야 한다. GraphQL API는 주소가 `/graphql` 하나이고, 질의에 필요한 필드와 중첩 관계를 적어 한 번에 받는다. `gh api`는 둘 다 부르며, 저장소 폴더 안에서는 `{owner}`·`{repo}`를 현재 저장소로 채운다.
```sh
gh api repos/{owner}/{repo}/pulls --paginate --jq '.[].number'
gh api -i repos/{owner}/{repo}            # 응답 헤더까지
gh api graphql -F owner='{owner}' -F name='{repo}' -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: OPEN, first: 20) {
        nodes { number title reviews(first: 5) { totalCount } }
      }
    }
  }'
```
목록 API는 한 번에 30개(`per_page`로 최대 100개)를 주고, 다음 쪽 주소를 `Link` 헤더의 `rel="next"`로 알려 준다. `--paginate`는 그 링크를 끝까지 따라가고, `--slurp`를 더하면 모든 쪽을 배열 하나로 합친다. 페이지네이션을 잊은 스크립트는 31번째부터 조용히 빠뜨린다.

## 요청 한도
API에는 시간당 요청 한도가 있다.

| 호출 주체 | 시간당 한도 |
| --- | --- |
| 인증 안 함(IP 기준) | 60 |
| 사용자 토큰(PAT 등) | 5,000 |
| Actions의 `GITHUB_TOKEN` | 저장소당 1,000 |

GraphQL은 요청 수 대신 질의 비용을 점수로 매긴다. 남은 양은 응답 헤더와 `/rate_limit`으로 본다. `/rate_limit` 호출은 한도를 쓰지 않는다. 숫자는 인증 여부와 시점에 따라 달라서 가렸다.
```bash
curl -s https://api.github.com/rate_limit | jq '.resources.core'
curl -sI https://api.github.com/rate_limit \
  | grep -io '^x-ratelimit-[a-z]*' | tr A-Z a-z | sort
```
```text
{
  "limit": …,
  "used": …,
  "remaining": …,
  "reset": …
}
x-ratelimit-limit
x-ratelimit-remaining
x-ratelimit-reset
x-ratelimit-resource
x-ratelimit-used
```
`reset`은 한도가 다시 차는 시각(유닉스 초)이다. 짧은 시간에 몰아서 부르면 시간당 한도와 별개인 보조 한도(secondary rate limit)에 걸리므로, 루프에는 간격을 두고 `Retry-After` 헤더를 따른다.

## 응답 JSON을 jq로 가공하기
"사흘 넘게 기다린 PR" 보고서를 만들어 보자. 실제 호출 결과는 매번 달라지므로, PR 목록 API의 응답 모양을 줄인 예시 파일로 jq 필터를 만든다.
```bash
cat > pulls.json <<'EOF'
[
  {"number": 41, "title": "로그인 화면 다듬기", "draft": false,
   "user": {"login": "mina"}, "labels": [{"name": "ui"}],
   "created_at": "2026-02-20T01:00:00Z", "base": {"ref": "dev"}},
  {"number": 42, "title": "댓글 길이 검사 고치기", "draft": false,
   "user": {"login": "joon"}, "labels": [{"name": "bug"}, {"name": "api"}],
   "created_at": "2026-03-01T09:30:00Z", "base": {"ref": "dev"}},
  {"number": 43, "title": "검색 기능 초안", "draft": true,
   "user": {"login": "mina"}, "labels": [{"name": "api"}],
   "created_at": "2026-03-03T05:00:00Z", "base": {"ref": "dev"}},
  {"number": 44, "title": "dev를 main으로", "draft": false,
   "user": {"login": "dev-kim"}, "labels": [],
   "created_at": "2026-03-04T00:00:00Z", "base": {"ref": "main"}}
]
EOF
jq -r --arg now 2026-03-05T00:00:00Z '
  .[] | select(.draft | not)
  | ((($now | fromdate) - (.created_at | fromdate)) / 86400 | floor) as $d
  | select($d >= 3) | "#\(.number) \($d)일 \(.user.login) → \(.base.ref)"
' pulls.json
jq -r '[.[].labels[].name] | group_by(.) | map("\(.[0]) \(length)") | .[]' pulls.json
```
```text
#41 12일 mina → dev
#42 3일 joon → dev
api 2
bug 1
ui 1
```
초안(#43)과 하루 된 #44는 빠졌다. 기준 시각을 `--arg`로 넘겨서 결과가 실행 시각에 흔들리지 않게 했다(실제 보고서에서는 `now`를 쓴다). 실제 저장소에는 같은 필터를 `gh api repos/{owner}/{repo}/pulls --paginate --jq '…'`로 붙인다. 흔한 실수는 배열을 객체처럼 다루는 것이다.
```bash
jq '.[].labels.name' pulls.json
```
```text
jq: error (at pulls.json:14): Cannot index array with string "name"
```
`labels`는 배열이라 `.labels[].name`처럼 한 번 더 펼쳐야 한다.

## 웹훅: GitHub이 나를 부르는 방식
"PR이 열리면 알려 달라"를 주기적인 API 조회(polling)로 하면 한도를 낭비한다. 웹훅(webhook)은 반대로 이벤트가 생기면 GitHub이 내 서버로 JSON을 POST한다. 누구나 그 주소로 POST할 수 있으므로, 받는 쪽은 `X-Hub-Signature-256` 헤더를 검증해야 한다. 값은 웹훅에 설정한 비밀을 키로 본문 바이트의 HMAC-SHA256을 구한 16진수 앞에 `sha256=`를 붙인 것이다.
```python
import hashlib, hmac, json

secret = b"example-webhook-secret"         # 웹훅 설정에 넣은 비밀
body = b'{"action":"opened","number":42}'  # 받은 본문 그대로
header = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()

def verify(raw, received):
    expected = "sha256=" + hmac.new(secret, raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)  # 일정 시간 비교

print("원본:", verify(body, header))
print("번호 변조:", verify(body.replace(b"42", b"43"), header))
print("JSON 다시 직렬화:", verify(json.dumps(json.loads(body)).encode(), header))
```
```text
원본: True
번호 변조: False
JSON 다시 직렬화: False
```
셋째 줄이 중요하다. 내용이 같아도 프레임워크가 JSON을 파싱했다가 다시 직렬화하면 공백이 달라져 서명이 안 맞는다. 검증은 받은 원본 바이트로 하고, 비교는 `==` 대신 시간이 일정한 `compare_digest`로 한다.

## GitHub 앱, OAuth 앱, 개인 액세스 토큰
스크립트가 누구의 이름으로 API를 부를지도 정해야 한다.

| 방식 | 누구로 행동하나 | 토큰 수명 |
| --- | --- | --- |
| 개인 액세스 토큰 | 나 | 정한 만료일까지 |
| OAuth 앱 | 승인한 사용자 | 취소할 때까지 |
| GitHub 앱 | 앱 자신(설치) | 설치 토큰 1시간 |

개인 스크립트는 필요한 저장소와 권한만 고른 세분화된 토큰(1편)이면 충분하다. 팀이나 조직의 자동화는 GitHub 앱이 낫다. 권한을 세밀하게 정하고, 짧게 사는 토큰을 쓰고, 설치한 사람이 퇴사해도 그대로 동작한다. 문서도 일반적으로 OAuth 앱보다 GitHub 앱을 권한다.

## 흔한 실수와 문제 해결
- CI에서 `API rate limit exceeded`: 인증 없이 부르면 러너들이 IP 한도 60을 나눠 쓴다. `GH_TOKEN`이나 `Authorization` 헤더로 인증한다.
- 결과가 30개에서 끊긴다: `--paginate`를 빠뜨렸다.
- 웹훅 서명이 가끔 틀린다: 파싱된 객체로 검증했거나, 프록시가 본문을 바꿨다.
- 개인 토큰을 공용 봇에 넣었다: 퇴사·만료와 함께 자동화가 멈춘다. GitHub 앱으로 옮긴다.

## 권장 설정과 체크리스트
- 반복 조회는 `gh api --paginate --jq`로 스크립트화하고, 필터는 예시 JSON으로 먼저 시험한다.
- 루프에는 간격을 두고 `x-ratelimit-remaining`과 `Retry-After`를 확인한다.
- 이벤트에 반응해야 하면 조회 대신 웹훅을 쓰고 서명을 원본 바이트로 검증한다.
- 토큰은 최소 권한·짧은 수명으로, 조직 자동화는 GitHub 앱으로 만든다.

## 어디에 쓰이나
- 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 워크플로의 `run:`에서 `gh`와 `GH_TOKEN`으로 PR에 댓글을 달거나 라벨을 붙이는 스텝을 만든다.
- 언어 기초 7편 「자바스크립트: 브라우저에서 npm까지」: 웹훅 수신 서버와 API 클라이언트는 대개 JSON을 다루는 Node 프로그램이고, `JSON.parse` 뒤의 객체로 서명을 검증하면 안 된다는 점이 그대로 적용된다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 웹훅 서명의 HMAC은 해시 함수에 비밀 키를 섞은 구조라서 비밀을 모르는 사람은 맞는 값을 만들 수 없다.

## 정리
- `gh`는 인증을 감싼 API 클라이언트이고, 워크플로 안에서는 `GH_TOKEN`으로 토큰을 받는다.
- REST는 자원별 주소, GraphQL은 필요한 필드만 한 번에. 목록은 `--paginate`로 끝까지 받는다.
- 한도는 인증 안 함 60, 사용자 5,000, `GITHUB_TOKEN` 저장소당 1,000(시간당)이다.
- 웹훅은 원본 바이트의 HMAC-SHA256으로 검증하고, 조직 자동화는 GitHub 앱으로 만든다.

## 더 알아보기
- 이전 글: 10편 「의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝」
- 다음 글: 12편 「오픈 소스 운영: README, 라이선스, 기여 안내, 커뮤니티 파일」
- GitHub Docs, REST API 요청 한도: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
