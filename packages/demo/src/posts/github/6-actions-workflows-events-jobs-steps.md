# [GitHub 협업과 자동화 6/12] GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝

> **한 줄 요약** — GitHub Actions는 저장소에서 일어난 이벤트가 `.github/workflows/`의 YAML과 맞으면 잡마다 깨끗한 러너 머신을 하나씩 빌려 스텝을 차례로 실행하는 장치이고, 이 구조와 "식은 셸보다 먼저 치환된다", "schedule은 UTC" 같은 규칙을 알면 대부분의 사고를 actionlint와 로그만으로 진단할 수 있다.

## 이 글에서 다루는 것
- 워크플로 → 잡 → 스텝의 실행 모델과 러너
- 이벤트: push, pull_request, workflow_dispatch, schedule(cron은 UTC)
- 표현식 `${{ }}`와 컨텍스트, `needs`와 `if`
- 이 사이트 저장소의 CI 구조 읽기
- actionlint로 검사하고 일부러 넣은 오류 메시지 읽기

## 문제: 검사는 사람이 잊는다
"push 전에 테스트를 돌리자"는 약속은 바쁠 때 깨지고, 클라이언트 훅은 `--no-verify`로 우회된다(Git 버전 관리 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」). 그래서 서버가 push마다 같은 환경에서 검사를 돌려 결과를 커밋에 붙이고, 그것을 병합 조건으로 쓴다(5편). GitHub에서 이 일을 하는 것이 **GitHub Actions**다.

## 실행 모델: 워크플로, 잡, 스텝
**워크플로**(workflow)는 `.github/workflows/` 폴더의 YAML 파일 하나다. 이벤트가 일어나면 GitHub는 그 커밋의 워크플로 파일 중 `on:`이 맞는 것을 모두 실행한다. 워크플로는 **잡**(job)들로, 잡은 **스텝**(step)들로 이루어진다.
```text
이벤트(push …)
  → 워크플로(.yml 하나)
     → 잡 A ┐ 기본은 병렬,
     → 잡 B ┘ needs로 순서
        → 잡마다 새 러너 머신
           → 스텝 1, 2, 3 … 차례로
```
핵심은 경계다. 같은 잡의 스텝들은 한 러너에서 돌아 파일 시스템을 공유하지만, 잡끼리는 서로 다른 머신이라 아무것도 공유하지 않는다. 잡 사이에 파일을 넘기려면 아티팩트를, 값을 넘기려면 잡 출력(`outputs`)을 써야 한다(7편). 스텝은 둘 중 하나다. `run:`은 셸 명령이고, `uses:`는 남이 만들어 둔 **액션**(action)을 불러 `with:`로 입력을 준다. `actions/checkout`이 저장소 코드를 러너에 받아 오고, `actions/setup-node`가 지정한 Node 버전을 설치한다. 러너는 GitHub가 잡마다 새로 주는 **GitHub 호스팅 러너**(`ubuntu-latest` 등)와 내 서버에 에이전트를 설치한 **자체 호스팅 러너**(self-hosted runner)가 있다. 자체 호스팅 러너는 머신이 계속 남아 있어서, 포크 PR의 코드가 내 머신에서 돌 수 있는 공개 저장소에는 쓰지 말라는 것이 GitHub의 권고다.

## 따라 하기: 워크플로 하나 쓰기
Node 프로젝트용 CI를 예로 든다. 키 이름은 철자 하나까지 정해져 있다.
```yaml
# 파일: .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
  schedule:
    - cron: '30 0 * * 1'

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - run: npm test

  build:
    needs: test
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: echo "build ${{ github.sha }}"
```
`on:`의 네 이벤트는 이렇게 다르다.
- **push**: 커밋이 올라오면. `branches`, `tags`, `paths` 필터로 좁힌다.
- **pull_request**: PR이 열리거나 새 커밋이 오면. 검사 대상은 head 브랜치 자체가 아니라 base와 합친 임시 병합 커밋(`refs/pull/<번호>/merge`)이라서, "병합하면 어떻게 될지"를 미리 본다. 포크에서 온 PR에는 비밀 값이 전달되지 않는다(8편).
- **workflow_dispatch**: Actions 탭의 실행 버튼이나 API로 손으로 실행한다. 워크플로 파일이 기본 브랜치에 있어야 버튼이 보인다.
- **schedule**: cron 식으로 주기 실행한다. 기본 브랜치의 최신 커밋에서 돌고, 가장 짧은 간격은 5분이며, 부하가 몰리는 정각 근처에는 늦어지거나 빠질 수 있다. 공개 저장소에서 60일 동안 활동이 없으면 예약 실행이 자동으로 꺼진다.

머지 큐(5편)를 쓴다면 `merge_group` 이벤트도 추가한다.

## 검증: cron은 UTC다
schedule의 cron 다섯 칸(분 시 일 월 요일, 요일은 0이 일요일)은 기본적으로 UTC로 해석된다. 한국(UTC+9)에서 가장 흔한 실수는 시간만 9를 빼고 요일을 그대로 두는 것이다. 다음 실행 시각을 구하는 작은 cron 해석기로 확인한다(`*`, 숫자, 범위, 쉼표, `/` 간격만 지원하는 모형).
```python
from datetime import datetime, timedelta, timezone

def ok(spec, v):                    # cron 한 칸이 값 v와 맞나
    for part in spec.split(","):
        base, _, step = part.partition("/")
        lo, hi = (0, 99) if base == "*" else map(int, (base.split("-") * 2)[:2])
        if lo <= v <= hi and (v - lo) % int(step or 1) == 0:
            return True
    return False

def next_runs(expr, t, n):
    mi, h, dom, mon, dow = expr.split()
    out = []
    while len(out) < n:
        t += timedelta(minutes=1)
        if (ok(mi, t.minute) and ok(h, t.hour) and ok(dom, t.day)
                and ok(mon, t.month) and ok(dow, (t.weekday() + 1) % 7)):
            out.append(t)
    return out

KST = timezone(timedelta(hours=9))
start = datetime(2026, 10, 20, tzinfo=timezone.utc)
for expr in ["30 0 * * 1", "0 7 * * 1", "0 22 * * 0"]:
    t = next_runs(expr, start, 1)[0]
    print(f"{expr:11} {t:%a %H:%M} UTC = {t.astimezone(KST):%a %H:%M} KST")
```
```text
30 0 * * 1  Mon 00:30 UTC = Mon 09:30 KST
0 7 * * 1   Mon 07:00 UTC = Mon 16:00 KST
0 22 * * 0  Sun 22:00 UTC = Mon 07:00 KST
```
"한국 시간 월요일 아침 7시"는 `0 7 * * 1`이 아니라 UTC로 전날인 `0 22 * * 0`이다. 시간을 옮기면 날짜와 요일이 함께 넘어갈 수 있다. 2026년 3월 GitHub 변경 기록에 따라 cron 옆에 `timezone:` 키(IANA 이름, 예: `Asia/Seoul`)를 둘 수 있게 되었고, 생략하면 여전히 UTC다. 아래에서 보듯 actionlint 1.7.12도 이 키의 값을 검사한다. 또 YAML에서 `*`로 시작하는 값은 별칭 문법이라 cron 식은 반드시 따옴표로 감싼다.

## 표현식과 컨텍스트, needs와 if
`${{ 식 }}`은 **표현식**(expression)이다. 러너는 스텝을 실행하기 전에 이 부분을 계산해 문자열로 치환하고, 셸은 치환이 끝난 스크립트를 받는다. 위 `build` 잡의 `run`은 셸에 `echo "build 3f2a…"`처럼 도착한다. 이 "셸보다 먼저 치환"이 8편의 스크립트 주입 문제의 뿌리다. 식에서 읽는 값의 묶음을 **컨텍스트**(context)라 한다. `github`(이벤트 이름, 커밋 SHA, 브랜치 `github.ref_name` 등), `env`(환경 변수), `vars`·`secrets`(설정 값과 비밀, 8편), `matrix`(7편), `steps`·`needs`(앞 스텝·잡의 출력), `runner`가 있다.

`needs: test`는 `build`가 `test` 성공 뒤에만 돌게 한다. 잡들이 `needs`로 이어진 그래프는 사이클이 없어야 하고, 앞 잡이 실패하면 뒤 잡은 건너뛴다. `if:`는 잡이나 스텝을 조건부로 실행하고, `${{ }}` 없이 써도 식으로 계산된다. 상태 함수도 쓴다. 기본은 `success()`(앞이 모두 성공)이고, `failure()`, `always()`, `cancelled()`가 있다. 테스트가 실패해도 리포트는 올리고 싶을 때 `if: ${{ !cancelled() }}`를 쓴다.

## 이 사이트 저장소의 CI 읽기
이 사이트를 만드는 저장소의 CI 워크플로는 파일 하나에 잡 세 개다. 구조만 요약하면 이렇다.
```text
on: push(모든 브랜치), 수동 실행
concurrency: 같은 ref면 이전 실행 취소
permissions: contents read

verify: checkout → node 22(npm 캐시)
        → npm ci → npm run verify
e2e:    checkout → node → npm ci
        → 브라우저 설치 → npm run e2e
        → 리포트·스크린샷 업로드
        (!cancelled()일 때)
pages:  needs [verify, e2e]
        기본 브랜치일 때만 Pages 배포
```
verify와 e2e는 `needs`가 없어 동시에 돌고, pages는 둘 다 성공하고 `if: github.ref_name == github.event.repository.default_branch`가 참일 때만 돈다. 그래서 작업 브랜치 push에서는 검사만, 기본 브랜치에서는 검사 후 배포까지 한다. 캐시·아티팩트·concurrency는 7편, 잡 단위 `permissions`와 `environment`는 8편, Pages 배포는 9편에서 이 파일을 다시 본다.

## actionlint로 검사하기
워크플로의 오타는 push해야 드러나고, 어떤 오류는 그 이벤트가 올 때까지 숨어 있다. **actionlint**는 문법, 식의 타입, 알려진 액션의 입력, cron 식까지 정적으로 검사한다. 여기서는 도커 이미지로 실행한다.
```bash
actionlint() {
  docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -no-color "$@"
}
actionlint -version | head -1
actionlint .github/workflows/ci.yml && echo "문제 없음"
```
```text
1.7.12
문제 없음
```
이제 흔한 실수를 일부러 넣는다. 범위를 넘은 cron, 틀린 시간대 이름, `runs-on` 대신 `runs_on`, 액션 입력 오타(`fetch-depth` → `fetch-dept`, 같은 오타를 checkout v6과 v7에), 없는 컨텍스트 속성, 없는 잡을 가리키는 `needs`다.
```yaml
# 파일: .github/workflows/broken.yml
name: Broken
on:
  schedule:
    - cron: '0 25 * * *'
      timezone: Asia/Seol
jobs:
  test:
    runs_on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-dept: 0
      - uses: actions/checkout@v7
        with:
          fetch-dept: 0
      - run: echo "${{ github.refname }}"
  build:
    needs: tset
    runs-on: ubuntu-latest
    steps:
      - run: echo build
```
```bash
actionlint -oneline .github/workflows/broken.yml; echo "종료 코드 $?"
```
```text
.github/workflows/broken.yml:5:13: invalid CRON format "0 25 * * *" in schedule event: end of range (25) above maximum (23): 25 [events]
.github/workflows/broken.yml:6:17: invalid timezone "Asia/Seol" in schedule event. it must be a valid IANA timezone name [events]
.github/workflows/broken.yml:8:3: "runs-on" section is missing in job "test" [syntax-check]
.github/workflows/broken.yml:9:5: unexpected key "runs_on" for "job" section. expected one of …
.github/workflows/broken.yml:13:11: input "fetch-dept" is not defined in action "actions/checkout@v6". available inputs are …
.github/workflows/broken.yml:17:24: property "refname" is not defined in object type {…ref_name: string…} [expression]
.github/workflows/broken.yml:18:3: job "build" needs job "tset" which does not exist in this workflow [job-needs]
종료 코드 1
```
메시지는 `파일:줄:열: 내용 [검사 종류]` 형식이고, 대부분 무엇을 기대했는지(`expected one of …`)까지 알려 준다. 눈여겨볼 것은 빠진 줄이다. 같은 `fetch-dept` 오타인데 checkout v6(13줄)만 잡히고 v7(16줄)은 조용하다. actionlint는 자기가 아는 인기 액션 버전의 입력 목록을 내장하고 있어서, 그보다 새 주 버전은 입력을 검사하지 못한다. 실제 러너는 모르는 입력에 경고만 남기고 넘어가므로, 이런 오타는 "옵션이 안 먹는" 조용한 버그가 된다.

## 흔한 실수와 문제 해결
- **워크플로가 아예 안 돎**: 폴더가 `.github/workflows/`가 아니거나, YAML 오류(Actions 탭에 표시), `branches`·`paths` 필터 불일치. schedule과 수동 실행은 기본 브랜치의 파일만 본다.
- **PR에서만 실패**: pull_request는 병합 커밋을 검사하므로 base의 새 변경과 섞인 결과다. 로컬에서 base를 합쳐 재현한다.
- **포크 PR에서 비밀이 비어 있음**: 의도된 동작이다(8편).
- **잡 사이에 만든 파일이 없음**: 잡마다 다른 머신이다. 아티팩트를 쓴다(7편).

## 권장 설정
- 최상위에 `permissions: contents: read`를 두고 필요한 잡만 넓힌다(8편).
- 잡마다 `timeout-minutes`를 둔다. 기본값 360분은 멈춘 잡이 6시간 동안 러너를 잡게 한다.
- 워크플로를 바꾸는 PR에서 actionlint를 돌린다.
- 필수 검사로 쓸 잡은 `name:`을 정하고 함부로 바꾸지 않는다(5편).

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 잡마다 새 러너를 주는 격리는 프로세스마다 주소 공간을 따로 주는 운영체제의 격리를 머신 단위로 키운 것이다.
- 레벨 디자인과 콘텐츠 제공 16편 「콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포」: "검증기를 빌드마다 돌린다"를 실제로 구현하는 자리가 push 이벤트에 걸린 워크플로다.
- 도커와 컨테이너 5편 「빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기」: 매번 새 러너에서 빌드하므로 캐시를 밖에 저장했다가 가져오는 방법이 중요해진다(7편).

## 정리
- 워크플로는 이벤트와 맞으면 실행되고, 잡마다 새 러너, 잡 안의 스텝은 한 머신에서 차례로 돈다.
- `${{ }}`는 셸보다 먼저 문자열로 치환되고, schedule의 cron은 기본이 UTC라 요일까지 함께 옮겨야 한다.
- `needs`와 `if`, 상태 함수로 잡 그래프와 조건을 만든다.
- actionlint는 대부분의 오타를 잡지만 자기가 모르는 새 액션 버전의 입력은 검사하지 못한다.

## 더 알아보기
- 이전 글: 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」
- 다음 글: 7편 「GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로」
