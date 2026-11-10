# [GitHub 협업과 자동화 10/12] 의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝

> **한 줄 요약** — 남이 쓴 의존성은 Dependabot이 권고 데이터베이스와 대조해 알리고 고치는 PR을 열고, 내가 쓴 코드는 CodeQL 같은 코드 스캐닝이 질의로 훑고, 실수로 넣은 비밀은 비밀 스캐닝이 접두사와 체크섬으로 찾아 push 단계에서 막는다.

## 이 글에서 다루는 것
- 의존성 그래프와 Dependabot의 세 기능(경보, 보안 업데이트, 버전 업데이트)
- `dependabot.yml`을 쓰고 파이썬 yaml로 구조 검사하기, groups의 첫 일치 규칙
- 코드 스캐닝과 CodeQL의 기본 설정·고급 설정
- 비밀 스캐닝과 push 보호, 토큰 체크섬이 오탐을 줄이는 원리, 보안 권고

## 내가 쓰지 않은 코드, 실수로 올린 비밀
잠금 파일(lock file)에는 직접 고른 패키지보다 그것이 끌고 온 간접 의존성이 훨씬 많다. 그중 하나에 취약점이 공개되면 내 코드는 그대로인데 앱이 취약해진다. 내 코드에 SQL 문자열을 이어 붙이는 실수가 있을 수도, 테스트용 API 키가 커밋에 섞일 수도 있다. 수백 개 패키지의 보안 공지를 사람이 읽을 수는 없으니 저장소가 스스로 검사하게 만든다.

## 의존성 그래프와 Dependabot의 세 기능
GitHub은 `package.json`·`package-lock.json` 같은 매니페스트와 잠금 파일을 읽어 **의존성 그래프**(dependency graph)를 만든다. 이 그래프를 GitHub 권고 데이터베이스(GitHub Advisory Database)와 대조하는 것이 Dependabot이고, 한 이름 아래 기능이 셋이다.

| 기능 | 하는 일 | 계기 |
| --- | --- | --- |
| 경보 | 취약한 의존성을 알린다 | 새 권고, 그래프 변경 |
| 보안 업데이트 | 고친 버전으로 PR | 경보 |
| 버전 업데이트 | 새 버전으로 PR | `dependabot.yml` 일정 |

경보는 GitHub이 검토한 권고에만 뜬다. 보안 업데이트는 일정과 상관없이 권고가 나오면 열리고(열림 한도 10개), 매니페스트나 잠금 파일에 적힌 의존성만 고친다. 버전 업데이트는 취약점이 없어도 의존성을 주기적으로 올려, 보안 패치가 나왔을 때 메이저 버전 여러 개를 한꺼번에 건너지 않게 한다(열림 한도 기본 5개, 문서상 기본 쿨다운 3일). 의존성 그래프, 경보, 보안 업데이트는 요금제와 상관없이 쓸 수 있다.

## dependabot.yml 쓰고 검사하기
버전 업데이트는 `.github/dependabot.yml`로 켠다. 생태계(package-ecosystem)마다 매니페스트가 있는 폴더와 일정을 적고, `github-actions` 생태계는 워크플로의 액션 버전을 올린다.
```yaml
# 파일: .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      types:
        patterns: ["@types/*"]
      dev-tools:
        dependency-type: development
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```
`interval`은 daily, weekly, monthly, quarterly, semiannually, yearly, cron 일곱 가지이고 cron이면 `cronjob`에 식을 적는다. `groups`는 여러 업데이트를 PR 하나로 묶고, 이름 패턴(`patterns`), 개발·운영 구분(`dependency-type`), 올림 폭(`update-types`)으로 고른다. 설정이 틀리면 PR이 조용히 안 열리니 구조를 미리 검사하는 스크립트를 만든다.
```python
# 파일: check_dependabot.py
import sys, yaml

INTERVALS = {"daily", "weekly", "monthly", "quarterly",
             "semiannually", "yearly", "cron"}

def check(doc):
    if doc.get("version") != 2:
        yield "version은 2여야 한다"
    for n, u in enumerate(doc.get("updates", []), 1):
        if "package-ecosystem" not in u:
            yield f"updates[{n}]: package-ecosystem이 없다"
        if not u.keys() & {"directory", "directories"}:
            yield f"updates[{n}]: directory가 없다"
        iv = u.get("schedule", {}).get("interval")
        if iv not in INTERVALS:
            yield f"updates[{n}]: interval {iv!r}"
        for g, rule in u.get("groups", {}).items():
            bad = set(rule.get("update-types", [])) - {"major", "minor", "patch"}
            if bad:
                yield f"updates[{n}].groups.{g}: update-types {sorted(bad)}"

for path in sys.argv[1:]:
    errs = list(check(yaml.safe_load(open(path))))
    print(path, f"오류 {len(errs)}건" if errs else "통과")
    for e in errs:
        print("  -", e)
```
PyYAML(`pip install pyyaml`)이 필요하다. 원본과, 흔한 실수 셋(하이픈 대신 밑줄, 없는 주기 `biweekly`, `ignore`용 표기 `semver-minor`)을 넣은 사본을 검사한다.
```bash
python3 check_dependabot.py .github/dependabot.yml
sed -e 's/package-ecosystem: npm/package_ecosystem: npm/' \
  -e 's/interval: monthly/interval: biweekly/' \
  -e 's/\[minor, patch\]/[semver-minor]/' .github/dependabot.yml > bad.yml
python3 check_dependabot.py bad.yml
```
```text
.github/dependabot.yml 통과
bad.yml 오류 3건
  - updates[1]: package-ecosystem이 없다
  - updates[1].groups.dev-tools: update-types ['semver-minor']
  - updates[2]: interval 'biweekly'
```
groups의 `update-types`는 `minor`, `ignore`의 것은 `version-update:semver-minor`로 표기가 달라 헷갈리기 쉽다.

## groups는 첫 번째로 맞은 그룹이 가져간다
`@types/node`의 마이너 업데이트는 `types`에도 `dev-tools`에도 맞는다. 문서의 규칙은 "여러 그룹에 맞으면 적힌 순서상 첫 그룹"이고, 안 맞으면 개별 PR이다. 3편의 CODEOWNERS가 마지막 일치인 것과 반대다. 업데이트 넷을 두 순서로 배정해 본다.
```python
# 파일: groups.py
import yaml
from fnmatch import fnmatch

def pick(groups, dep, dev, kind):
    for g, r in groups.items():  # 적힌 순서대로
        if "patterns" in r and not any(fnmatch(dep, p) for p in r["patterns"]):
            continue
        if r.get("dependency-type") == ("production" if dev else "development"):
            continue
        if kind not in r.get("update-types", [kind]):
            continue
        return g
    return "개별 PR"

updates = [("@types/node", True, "minor"), ("typescript", True, "major"),
           ("esbuild", True, "patch"), ("preact", False, "minor")]
groups = yaml.safe_load(open(".github/dependabot.yml"))["updates"][0]["groups"]
for order in (list(groups), list(groups)[::-1]):
    print(" → ".join(order))
    for dep, dev, kind in updates:
        g = pick({k: groups[k] for k in order}, dep, dev, kind)
        print(f"  {dep:12} {kind:5} {g}")
```
```bash
python3 groups.py
```
```text
types → dev-tools
  @types/node  minor types
  typescript   major 개별 PR
  esbuild      patch dev-tools
  preact       minor 개별 PR
dev-tools → types
  @types/node  minor dev-tools
  typescript   major 개별 PR
  esbuild      patch dev-tools
  preact       minor 개별 PR
```
순서만 바꿨는데 `@types/node`의 행선지가 달라졌다. 좁은 그룹을 위에 둔다. 메이저 업데이트는 일부러 그룹 밖에 두어 하나씩 검토하게 했다.

## 코드 스캐닝과 CodeQL
코드 스캐닝(code scanning)은 내 코드의 취약한 패턴을 찾는 정적 분석이다. CodeQL은 코드를 데이터베이스로 바꾼 뒤 "사용자 입력이 검사 없이 SQL 실행까지 흘러가는 경로" 같은 데이터 흐름을 질의로 찾고, 결과를 Security 탭의 경보와 PR 주석으로 낸다. 기본 설정(default setup)은 워크플로 없이 GitHub이 언어와 질의를 골라 기본 브랜치 push·PR과 주 1회 돈다. 고급 설정(advanced setup)은 빌드 방법이나 일정을 바꿀 때 워크플로를 직접 둔다.
```yaml
# 파일: .github/workflows/codeql.yml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '23 4 * * 1'
permissions:
  contents: read
  security-events: write
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: github/codeql-action/init@v4
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v4
```
결과를 올리려면 `security-events: write`가 필요하다. 공개 저장소는 바로 쓸 수 있고, 조직의 비공개 저장소는 유료인 GitHub Code Security가 있어야 한다.
```bash
git init -q
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest \
  && echo "actionlint: 문제 없음"
```
```text
actionlint: 문제 없음
```

## 비밀 스캐닝과 push 보호
비밀 스캐닝(secret scanning)은 저장소 이력에서 알려진 형식의 토큰을 찾아 경보를 띄우고, push 보호(push protection)는 push 순간에 검사해 비밀이 든 push를 거부한다. 사유를 고르고 우회하면 그 사실이 경보로 남는다. 개인 계정의 push 보호는 기본으로 켜져 있어 공개 저장소로의 push에 적용된다. 공개 저장소의 비밀 스캐닝은 무료이고, 조직의 비공개·내부 저장소는 GitHub Secret Protection(Team, Enterprise Cloud)이 필요하다.

정규식만으로는 오탐이 문제다. GitHub의 옛 토큰 형식 다수는 40자리 16진수라 Git 해시와 구별되지 않았다. 2021년에 바꾼 형식은 종류를 알리는 접두사와 끝 6자의 CRC32 체크섬(62진수)으로, 스캐너가 서버에 묻지 않고 가짜를 거른다. 실제 형식의 가짜 토큰은 스캐너에 걸리므로 가상의 접두사 `demo_`로 원리만 재현한다.
```python
import hashlib, random, re, string, zlib

B62 = string.digits + string.ascii_letters
def b62(n):  # CRC32를 62진수 6자로
    s = ""
    while n:
        n, r = divmod(n, 62)
        s = B62[r] + s
    return s.rjust(6, "0")

def make(body):  # demo_ + 본문 30자 + 체크섬 6자
    return "demo_" + body + b62(zlib.crc32(body.encode()))

def checksum_ok(tok):
    return make(tok[5:-6]) == tok

rng = random.Random(7)
rand = lambda n: "".join(rng.choice(B62) for _ in range(n))
real = [make(rand(30)) for _ in range(1000)]
fake = ["demo_" + rand(36) for _ in range(100_000)]
print("진짜 토큰 통과:", sum(map(checksum_ok, real)), "/ 1000")
print("모양만 같은 문자열 통과:", sum(map(checksum_ok, fake)), "/ 100000")
sha = hashlib.sha1(b"blob 6\0hello\n").hexdigest()  # Git 블롭 해시
print("Git 해시가 옛 규칙에 걸림:", bool(re.fullmatch(r"[0-9a-f]{40}", sha)))
```
```text
진짜 토큰 통과: 1000 / 1000
모양만 같은 문자열 통과: 0 / 100000
Git 해시가 옛 규칙에 걸림: True
```
모양이 같은 무작위 문자열 10만 개 중 체크섬을 우연히 맞힌 것은 없다(무작위 6자가 맞을 확률은 62⁶, 약 568억분의 1). 접두사는 어느 서비스의 토큰인지 알려 주어, 공개 저장소에서 찾은 토큰을 발급처에 알려 폐기를 돕는 데도 쓰인다.

## 보안 권고와 SECURITY.md
권고 데이터베이스의 항목에는 `GHSA-`로 시작하는 ID가 붙는다. 내 프로젝트의 취약점은 저장소 보안 권고(repository security advisory)를 비공개 초안으로 만들어 고치고, 수정 버전과 함께 공개하며 CVE를 요청할 수 있다. 공개 저장소에서 비공개 취약점 보고를 켜 두면 외부 연구자가 이슈 대신 Security 탭으로 보고한다. `SECURITY.md`에는 보고 창구, 지원하는 버전, 응답 목표 기간을 적는다(파일 위치는 12편).

## 흔한 실수와 문제 해결
- Dependabot PR이 안 열린다: 설정 오류(위 검사), 열린 PR이 한도를 채움, 비공개 레지스트리 인증 누락을 차례로 본다.
- 경보를 그냥 닫는다: "위험한 코드 경로를 쓰지 않음" 같은 사유를 남겨 판단 근거를 공유한다.
- push 보호를 우회하고 잊는다: 우회는 키가 노출됐다는 뜻이다. 먼저 키를 폐기·교체하고 이력 정리는 그다음이다(Git 버전 관리 14편).

## 경보를 처리하는 팀의 습관
- 경보 담당을 돌아가며 정하고, 심각도별 처리 기한을 둔다.
- 패치·마이너 업데이트는 groups로 묶고 CI가 통과하면 바로 병합한다.
- 메이저 업데이트는 변경 기록을 읽고 따로 검토한다.
- 비밀은 처음부터 저장소 밖(Actions 비밀, 비밀 관리 서비스)에 둔다(8편).

## 어디에 쓰이나
- 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: 액션 버전을 고정해 두면 갱신을 잊기 쉬운데, `github-actions` 생태계의 버전 업데이트가 새 버전을 PR로 올려 준다.
- 3편 「코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법」: CODEOWNERS는 마지막 일치, groups는 첫 일치라서 넓은 규칙을 두는 위치가 반대다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 토큰 끝의 체크섬은 CRC32 값을 62진수로 쓴 것이고, 옛 토큰과 커밋 해시는 둘 다 16진수라 헷갈렸다.

## 정리
- Dependabot은 경보, 보안 업데이트(권고가 계기), 버전 업데이트(`dependabot.yml` 일정) 세 기능이다.
- groups는 적힌 순서상 첫 그룹이 가져가므로 좁은 그룹을 위에 둔다.
- CodeQL은 데이터 흐름을 질의로 찾고, 기본 설정은 워크플로 없이, 고급 설정은 워크플로로 돈다.
- 토큰의 접두사와 체크섬이 오탐을 줄여 비밀 스캐닝이 push 단계에서 막을 수 있다.

## 더 알아보기
- 이전 글: 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」
- 다음 글: 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」
- GitHub Docs, Dependabot 옵션 참조: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
