# [GitHub 협업과 자동화 7/12] GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로

> **한 줄 요약** — 매트릭스는 곱집합에서 exclude를 빼고 include를 "원래 값을 덮어쓰지 않는 조합에만" 붙여 잡을 복제하고, 캐시는 지워져도 되는 사본, 아티팩트는 잡 사이에 넘기는 결과물이며, 반복은 재사용 워크플로(잡 단위)나 복합 액션(스텝 단위)으로 묶는다.

## 이 글에서 다루는 것
- `strategy.matrix`의 전개 규칙을 파이썬으로 재현해 공식 문서 예와 대조
- `fail-fast`, `max-parallel`, `concurrency`
- `actions/cache`의 key·restore-keys와 브랜치 범위 모형
- 아티팩트로 잡 사이 파일 넘기기
- 재사용 워크플로와 복합 액션, actionlint로 연결 검사

## 문제: 조합은 늘고, 설치는 느리고, 복붙은 쌓인다
Node 20·22·24와 리눅스·윈도우에서 시험하려면 잡이 여섯 개다. 잡마다 새 러너라서(6편) 의존성을 매번 처음부터 받고, 잡 사이에는 파일도 넘어가지 않는다. 비슷한 워크플로가 여럿이면 복사한 스텝 중 하나만 고쳐지는 일이 생긴다.

## 매트릭스: 잡을 곱집합으로 복제하기
`strategy.matrix`에 키와 값 목록을 주면 모든 조합마다 잡이 생기고, 스텝에서 `${{ matrix.node }}`로 읽는다. 한 실행에서 매트릭스 잡은 최대 256개다. 조합을 다듬는 공식 규칙은 이렇다.
- **exclude**: 항목에 적힌 키 값이 모두 같으면 나머지 키와 상관없이 그 조합을 뺀다(부분 일치).
- **include**: exclude 다음에 처리된다. 각 항목을 원래 매트릭스 값을 덮어쓰지 않고 붙일 수 있는 모든 조합에 더한다. 붙일 곳이 하나도 없으면 새 조합이 된다. 원래 값은 덮어쓰지 않지만, include가 더한 값은 뒤 항목이 덮어쓸 수 있다.

규칙을 그대로 코드로 옮기고 문서에 실린 include 예(과일·동물)와 exclude 예(운영 체제·버전)를 넣는다.
```python
from itertools import product

def expand(matrix):
    m = dict(matrix)
    include, exclude = m.pop("include", []), m.pop("exclude", [])
    keys = list(m)
    combos = [dict(zip(keys, v)) for v in product(*m.values())]
    combos = [c for c in combos if not any(      # 부분 일치면 제외
        all(c[k] == v for k, v in e.items()) for e in exclude)]
    extra = []
    for inc in include:                          # exclude 다음에
        hit = [c for c in combos                 # 원래 키 값이 같은 조합
               if all(c[k] == v for k, v in inc.items() if k in keys)]
        for c in hit: c.update(inc)
        if not hit: extra.append(dict(inc))      # 없으면 새 조합
    return combos + extra

doc1 = {"fruit": ["apple", "pear"], "animal": ["cat", "dog"],
        "include": [{"color": "green"}, {"color": "pink", "animal": "cat"},
                    {"fruit": "apple", "shape": "circle"},
                    {"fruit": "banana"}, {"fruit": "banana", "animal": "cat"}]}
for c in expand(doc1): print(c)
doc2 = {"os": ["macos-latest", "windows-latest"], "version": [12, 14, 16],
        "environment": ["staging", "production"],
        "exclude": [{"os": "macos-latest", "version": 12, "environment": "production"},
                    {"os": "windows-latest", "version": 16}]}
print(len(expand(doc2)), "jobs")
```
```text
{'fruit': 'apple', 'animal': 'cat', 'color': 'pink', 'shape': 'circle'}
{'fruit': 'apple', 'animal': 'dog', 'color': 'green', 'shape': 'circle'}
{'fruit': 'pear', 'animal': 'cat', 'color': 'pink'}
{'fruit': 'pear', 'animal': 'dog', 'color': 'green'}
{'fruit': 'banana'}
{'fruit': 'banana', 'animal': 'cat'}
9 jobs
```
공식 문서가 밝힌 결과와 같다. `color: green`은 모든 조합에 붙었다가 cat 조합에서 뒤 항목의 `pink`로 덮였다. `{fruit: banana}`는 원래 값을 덮어써야 해서 새 조합이 되고, `{fruit: banana, animal: cat}`은 앞의 banana(원래 조합이 아니다)에 붙지 않고 또 새 조합이 된다. exclude 예는 12개에서 완전 일치 1개와 부분 일치(windows·16) 2개를 빼 9개다.

기본값 `fail-fast: true`에서는 조합 하나가 실패하면 나머지 진행 중인 매트릭스 잡이 취소되므로, 모든 결과를 보려면 `false`로 둔다. `max-parallel`은 동시 잡 수를 제한한다.

## 캐시: 지워져도 되는 사본
`actions/cache`는 경로를 키 이름으로 저장했다가 다음 실행에서 되살린다. `key`와 같은 캐시가 있으면 되살리고(적중) 다시 저장하지 않는다. 없으면 `restore-keys` 접두사를 차례로 찾아 맞는 것 중 가장 최근 것을 되살리고(부분 복원), 잡이 성공하면 `key` 이름으로 새로 저장한다. 같은 키는 덮어쓰지 않으므로 키에 잠금 파일 해시를 넣는다(`hashFiles('package-lock.json')`). 찾는 범위는 현재 브랜치와 기본 브랜치(PR이면 base 브랜치도)이고 형제 브랜치의 캐시는 못 본다. 이 규칙을 옮긴 모형으로 실행 다섯 번을 따라간다.
```python
caches = []                          # (key, 브랜치, 순서)

def restore(key, prefixes, branch):
    for scope in dict.fromkeys([branch, "main"]):  # 현재 → 기본
        mine = [c for c in caches if c[1] == scope]
        if any(c[0] == key for c in mine):
            return f"적중 {key} ({scope})"
        for p in prefixes:
            part = [c for c in mine if c[0].startswith(p)]
            if part:
                return f"부분 {max(part, key=lambda c: c[2])[0]} ({scope})"
    return "없음"

def run(branch, key):
    got = restore(key, ["Linux-npm-"], branch)
    if not got.startswith("적중"):
        caches.append((key, branch, len(caches)))  # key로 저장
    print(f"{branch:6} {key} → {got}")

run("main", "Linux-npm-aaa")
run("main", "Linux-npm-aaa")    # 잠금 파일 그대로
run("main", "Linux-npm-bbb")    # 의존성 변경
run("feat-x", "Linux-npm-ccc")
run("feat-y", "Linux-npm-ccc")  # feat-x와 같은 키
```
```text
main   Linux-npm-aaa → 없음
main   Linux-npm-aaa → 적중 Linux-npm-aaa (main)
main   Linux-npm-bbb → 부분 Linux-npm-aaa (main)
feat-x Linux-npm-ccc → 부분 Linux-npm-bbb (main)
feat-y Linux-npm-ccc → 부분 Linux-npm-bbb (main)
```
마지막 줄이 핵심이다. feat-y는 feat-x가 막 저장한 같은 키를 못 보고 main의 캐시를 부분 복원한다. 그래서 기본 브랜치의 캐시를 최신으로 둔다. 저장소당 기본 한도는 10GB이고(2025년 11월부터 유료로 늘릴 수 있다), 7일 동안 안 쓴 캐시는 지워지며, 한도를 넘으면 가장 오래 안 쓴 것부터 지워진다. 캐시는 사라져도 빌드가 (느리게라도) 성공해야 한다. 흔한 경우는 `actions/setup-node`의 `cache: npm` 한 줄로 잠금 파일 해시를 키 삼아 npm 전역 캐시 폴더(`node_modules`가 아니다)를 저장하면 된다.

## 아티팩트: 잡 사이에 넘기는 결과물
잡끼리는 다른 머신이므로 리포트나 빌드 결과를 다음 잡이나 사람에게 주려면 `actions/upload-artifact`로 올리고 `actions/download-artifact`로 받는다. 캐시와 달리 없으면 다음 잡이 실패하는 결과물이고, 보존 기간(`retention-days`)까지 남는다. v4부터 아티팩트는 한 번 만들면 바뀌지 않고 한 실행 안에서 이름이 겹치면 안 되므로, 매트릭스 잡은 이름에 `matrix` 값을 넣는다. 이 사이트를 만드는 저장소에서는 e2e 잡이 Playwright 리포트를 테스트가 실패해도(`if: ${{ !cancelled() }}`) 14일 보존으로 올리고, 기본 브랜치에서만 도는 배포 잡이 받아 사이트의 `/report/`로 배포한다.

## concurrency: 낡은 실행 취소하기
`concurrency.group`이 같은 실행은 한 번에 하나만 돌고, `cancel-in-progress: true`면 진행 중인 것을 취소한다. 이 사이트 저장소는 최상위에 그룹 `ci-${{ github.ref }}`를 두어 브랜치마다 최신 커밋만 검사한다. 배포 잡은 끊기면 반쯤 배포된 상태가 남을 수 있으니 취소하지 않는 별도 그룹이 안전하다.

## 재사용 워크플로와 복합 액션
**재사용 워크플로**(reusable workflow)는 `on: workflow_call`로 입력과 비밀을 선언한 워크플로이고, 호출하는 쪽은 잡 자리에 `uses:`로 부른다. 잡 전체를 묶는다. **복합 액션**(composite action)은 `action.yml`에 `runs.using: composite`로 스텝 목록을 적은 것이고, 잡 안에서 스텝 하나처럼 부른다. 예제는 복합 액션, 재사용 워크플로, 둘을 쓰는 CI다.
```yaml
# 파일: .github/actions/setup/action.yml
name: setup
description: Node와 의존성 설치
inputs:
  node-version:
    description: Node 버전
    required: true
runs:
  using: composite
  steps:
    - uses: actions/setup-node@v7
      with:
        node-version: ${{ inputs.node-version }}
        cache: npm
    - run: npm ci
      shell: bash
```
```yaml
# 파일: .github/workflows/e2e.yml
name: e2e
on:
  workflow_call:
    inputs:
      node:
        type: string
        required: true
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: ./.github/actions/setup
        with:
          node-version: ${{ inputs.node }}
      - uses: actions/cache@v5
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-pw-${{ hashFiles('package-lock.json') }}
          restore-keys: ${{ runner.os }}-pw-
      - run: npx playwright install chromium && npm run e2e
```
```yaml
# 파일: .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22, 24]
        os: [ubuntu-latest, windows-latest]
        exclude:
          - os: windows-latest
            node: 20
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: ./.github/actions/setup
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
  e2e:
    needs: test
    uses: ./.github/workflows/e2e.yml
    with:
      node: '22'
```
actionlint는 `.git`이 있는 프로젝트 루트를 찾으면 `./.github/...`로 부른 로컬 액션과 재사용 워크플로까지 따라가 입력을 대조한다. 매트릭스 키 오타, 빠진 필수 입력, 없는 입력을 일부러 넣어 본다.
```yaml
# 파일: .github/workflows/broken.yml
name: Broken
on: push
jobs:
  test:
    strategy:
      matrix:
        node: [20, 22]
    runs-on: ubuntu-latest
    steps:
      - run: echo "${{ matrix.nod }}"
  e2e:
    uses: ./.github/workflows/e2e.yml
    with:
      nodee: '22'
```
```bash
git init -q
actionlint() {
  docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -no-color "$@"
}
actionlint -oneline .github/workflows/ci.yml .github/workflows/e2e.yml && echo "문제 없음"
actionlint -oneline .github/workflows/broken.yml
```
```text
문제 없음
.github/workflows/broken.yml:11:24: property "nod" is not defined in object type {node: number} [expression]
.github/workflows/broken.yml:13:11: input "node" is required by "./.github/workflows/e2e.yml" reusable workflow [workflow-call]
.github/workflows/broken.yml:15:7: input "nodee" is not defined in "./.github/workflows/e2e.yml" reusable workflow. defined input is "node" [workflow-call]
```
actionlint는 매트릭스 값에서 `matrix`의 타입(`{node: number}`)까지 추론한다. 두 방식의 차이는 이렇다.

| 구분 | 재사용 워크플로 | 복합 액션 |
| --- | --- | --- |
| 부르는 곳 | 잡의 `uses` | 스텝의 `uses` |
| 러너 | 스스로 정함 | 부른 잡의 러너 |
| 비밀 | `secrets:`로 전달 | 입력으로 받아야 |
| 로그 | 잡별로 보임 | 한 스텝 안에 묶임 |

재사용 워크플로는 2025년 11월부터 10단계까지 중첩하고, 한 파일에서 서로 다른 재사용 워크플로를 50개까지 부를 수 있다(이전에는 4단계, 20개).

## 흔한 실수와 문제 해결
- **캐시가 늘 부분 복원만 됨**: 키에 매번 바뀌는 값(시각, `github.sha`)이 들어갔다. 잠금 파일 해시만 넣는다.
- **재사용 워크플로에서 비밀이 비어 있음**: 호출 쪽에서 `secrets:`로 넘기거나 `secrets: inherit`를 쓴다.

## 어디에 쓰이나
- 도커와 컨테이너 5편 「빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기」: 잠금 파일이 바뀔 때만 키가 바뀌게 하는 것은 의존성 목록을 먼저 COPY하는 원리와 같다.
- 이산수학 6편 「경우의 수: 순열과 조합」: 매트릭스의 잡 수는 키별 값 개수의 곱(곱의 법칙)이다.
- 메모리 시스템 3편 「캐시 미스의 종류와 정책: 3C, 교체, 쓰기」: 한도를 넘으면 오래 안 쓴 것부터 지우는 것은 LRU 교체다.

## 정리
- 매트릭스는 곱집합 → exclude(부분 일치) → include(병합, 없으면 새 조합) 순서로 전개된다.
- 캐시는 정확한 키 → 접두사 순으로 현재·기본 브랜치에서 찾는, 사라져도 되는 사본이다.
- 아티팩트는 잡 사이·사람에게 넘기는 결과물이고, 이름은 실행 안에서 유일해야 한다.
- 잡 단위 반복은 재사용 워크플로, 스텝 단위는 복합 액션으로 묶고 actionlint로 연결을 검사한다.

## 더 알아보기
- 이전 글: 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」
- 다음 글: 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」
