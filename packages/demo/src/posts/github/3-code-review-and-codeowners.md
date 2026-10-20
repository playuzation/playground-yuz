# [GitHub 협업과 자동화 3/12] 코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법

> **한 줄 요약** — 리뷰는 Comment·Approve·Request changes 세 결정과 줄 단위 코멘트·제안으로 이루어지고, 작은 PR과 분명한 설명이 리뷰의 질을 정하며, CODEOWNERS는 gitignore를 닮은 패턴 중 마지막으로 일치한 줄의 소유자에게 리뷰를 자동으로 요청한다.

## 이 글에서 다루는 것
- 리뷰의 세 가지 결정과 대기 중 코멘트, 줄 단위 코멘트와 제안된 변경(suggestion)
- 작은 PR이 좋은 이유와 PR 크기를 재는 법(three-dot diff)
- 작성자와 리뷰어의 습관: 무엇을, 어떤 순서로 볼까
- CODEOWNERS 문법과 "마지막 일치 규칙이 이긴다"를 파이썬 매처로 확인하기

## 문제: 리뷰가 늦거나 형식적이다
PR을 열었는데 하루 넘게 아무도 보지 않거나, 2,000줄짜리 PR에 "LGTM" 한 줄만 달리는 일이 흔하다. 누가 봐야 하는지 모르니 요청이 엉뚱한 사람에게 가고, 큰 PR은 읽기 싫으니 대충 승인된다. 리뷰를 제도로 만들려면 세 가지가 필요하다. 리뷰 도구를 정확히 쓰는 것, 리뷰하기 쉬운 PR을 만드는 것, 그리고 "이 파일은 이 팀이 본다"를 저장소에 적어 두는 것이다.

## 리뷰의 세 가지 결정
읽기 권한이 있으면 누구나 PR에 코멘트할 수 있고, 리뷰를 제출할 때 셋 중 하나를 고른다.
| 결정 | 의미 |
|---|---|
| Comment | 승인도 거절도 아닌 의견 |
| Approve | 병합해도 좋다 |
| Request changes | 병합 전에 반영할 것이 있다 |

Request changes가 병합을 실제로 막는 것은 저장소 규칙으로 리뷰를 필수로 했을 때다(5편). **Files changed** 탭에서 줄에 남긴 코멘트는 리뷰를 제출할 때까지 대기(pending) 상태라 나만 보이고, 제출할 때 한꺼번에 알림이 간다. 코멘트마다 알림이 쏟아지지 않게 하려면 줄 코멘트를 모아 리뷰로 제출한다.

줄 코멘트에서 제안 버튼을 누르면 `suggestion` 코드 블록이 들어가고, 그 안을 고친 내용으로 바꾸면 **제안된 변경**이 된다.
```suggestion
const MAX_TITLE_LENGTH = 100;
```
작성자는 **Commit suggestion**으로 바로 반영하거나 **Add suggestion to batch**로 여러 제안을 모아 커밋 하나로 반영한다. 제안한 사람은 그 커밋의 공동 작성자(Co-authored-by)가 되고, 반영한 사람은 공동 작성자이자 커미터가 된다. 다 반영한 대화는 **Resolve conversation**으로 접어 남은 논의만 보이게 한다.

## 작은 PR과 PR 크기 재기
구글의 공개 리뷰 지침은 작은 변경이 더 빨리, 더 꼼꼼히 리뷰되고, 버그가 덜 들어가며, 거절돼도 버리는 작업이 적고, 되돌리기 쉽다고 설명한다. 정해진 상한은 없지만 100줄 정도면 대체로 적당하고 1,000줄은 대체로 너무 크며, 200줄이라도 50개 파일에 흩어져 있으면 너무 크다고 본다. 큰 기능은 리팩터링과 동작 변경을 나눈다. GitHub 문서에는 서로 의존하는 작은 PR을 쌓아 층마다 따로 리뷰·병합하는 stacked pull requests 기능도 소개되어 있다.

PR 화면의 변경 내용은 **three-dot diff**다. 두 브랜치가 갈라진 지점(merge base)과 head를 비교하므로, PR을 연 뒤 base에 들어온 커밋은 PR 크기에 섞이지 않는다. 로컬에서 직접 비교해 보자.
```bash
git init -q app && cd app
seq 1 50 > a.txt && git add . && git commit -qm "초기"
git switch -qc feat/search
seq 1 20 > search.txt && git add . && git commit -qm "검색"
git switch -q main
seq 1 300 > big.txt && git add . && git commit -qm "다른 PR"
git diff --shortstat main...feat/search
git diff --shortstat main..feat/search
```
```text
 1 file changed, 20 insertions(+)
 2 files changed, 20 insertions(+), 300 deletions(-)
```
점 셋은 이 PR이 들인 변경만, 점 둘은 지금의 main과 head의 차이를 보여 준다. PR을 올리기 전 `git diff --stat main...HEAD`로 크기를 확인하는 습관을 들이면 좋다.

## 작성자와 리뷰어의 습관
작성자는 리뷰를 요청하기 전에 자기 diff를 먼저 읽는다. 실수로 들어간 파일과 디버그 출력이 여기서 걸러진다. 설명에는 무엇을 왜 바꿨는지, 어디부터 보면 되는지, 어떻게 테스트했는지를 쓴다. 리뷰 중 강제 push로 이력을 갈아엎으면 리뷰어가 무엇이 바뀌었는지 놓치므로 가능하면 커밋을 덧붙인다.

리뷰어는 큰 것부터 본다.
- 설계: 이 변경이 여기 있어야 하나, 더 단순한 방법은 없나
- 정확성: 경계 조건, 오류 처리, 동시성, 보안(입력 검증, 권한)
- 테스트: 바뀐 동작을 테스트가 실제로 확인하나
- 이름과 가독성: 다음 사람이 읽을 수 있나. 서식은 린터에 맡긴다

구글 지침의 기준은 "완벽하지 않아도 코드베이스의 전반적인 건강을 분명히 개선하면 승인한다"이고, 꼭 고치지 않아도 되는 다듬기 의견에는 `Nit:`을 붙인다. 응답은 늦어도 영업일 하루 안에 하라고 권한다. 지적은 사람이 아니라 코드에 하고, 명령보다 이유와 질문으로 쓴다.

## CODEOWNERS: 누가 봐야 하는지 저장소에 적기
`CODEOWNERS` 파일은 `.github/`, 저장소 루트, `docs/` 중 한 곳에 둔다. 여러 곳에 있으면 이 순서로 찾아 처음 것을 쓴다. 각 줄은 gitignore와 거의 같은 패턴 하나와 소유자(`@사용자`, `@조직/팀`, 계정에 등록된 이메일)들이다. PR이 어떤 파일을 바꾸면 그 파일의 소유자에게 리뷰 요청이 자동으로 간다(초안 PR은 준비 완료로 바꿀 때). 공식 문서의 규칙을 정리하면 다음과 같다.
- **마지막으로 일치한 패턴이 이긴다.** 기본 소유자 `*`는 맨 위에 둔다.
- 한 패턴의 소유자는 한 줄에 모두 쓴다. 같은 패턴을 두 줄에 쓰면 마지막 줄만 남는다.
- gitignore와 달리 `!` 부정, `[ ]` 문자 범위, `\#` 이스케이프는 안 된다. 문법이 틀린 줄은 건너뛴다.
- 경로는 대소문자를 구분하고, 파일은 3MB 미만이어야 한다.
- 소유자는 저장소 쓰기 권한이 있어야 하고, 팀은 공개(visible) 상태에 쓰기 권한이 있어야 한다.
- PR은 base 브랜치에 있는 CODEOWNERS를 쓴다.

규칙을 확인하려고 GitHub 문서의 예(`docs/*`는 하위 폴더를 포함하지 않는다 등)에 맞춘 작은 매처를 만든다. GitHub의 실제 구현이 아니라 문서 규칙을 옮긴 시뮬레이터다.
```python
# 파일: codeowners.py
import re, sys

def to_regex(pat):
    anchored = pat.startswith("/") or "/" in pat.rstrip("/")
    body, out, i = pat.strip("/"), "", 0
    while i < len(body):
        if body.startswith("**/", i): out += "(?:.*/)?"; i += 3
        elif body.startswith("**", i): out += ".*"; i += 2
        elif body[i] == "*": out += "[^/]*"; i += 1
        elif body[i] == "?": out += "[^/]"; i += 1
        else: out += re.escape(body[i]); i += 1
    head = "" if anchored else "(?:.*/)?"
    tail = "" if body.endswith("/*") else "(?:/.*)?"  # 폴더면 그 아래 전부
    return re.compile(head + out + tail)

def load(path):
    rules = []
    for n, line in enumerate(open(path), 1):
        line = line.split(" #")[0].strip()
        if not line or line.startswith("#"): continue
        pat, *owners = line.split()
        why = ("! 부정" if pat.startswith("!") else "[ ] 범위" if "[" in pat
               else "소유자 형식" if any("@" not in o for o in owners) else "")
        if why: print(f"건너뜀 {n}행({why}): {pat}"); continue
        rules.append((to_regex(pat), owners))
    return rules

def owners_of(rules, path):
    found = None
    for rx, owners in rules:  # 마지막으로 일치한 규칙이 이긴다
        if rx.fullmatch(path): found = owners
    return " ".join(found) if found else "(소유자 없음)"

rules = load(sys.argv[1])
for path in sys.stdin.read().split():
    print(f"{path:29} {owners_of(rules, path)}")
```
모노레포 하나를 가정한 CODEOWNERS다. 끝의 세 줄은 일부러 틀렸다.
```gitignore
# 파일: CODEOWNERS
# 기본 소유자: 더 구체적인 규칙이 없으면 이 팀
*                    @example-org/maintainers
/packages/web/       @example-org/frontend
/packages/api/       @example-org/backend
/packages/core/      @example-org/backend @example-org/frontend
*.sql                @example-org/dba
docs/*               docs@example.com
/.github/            @example-org/admins
/packages/web/dist/
!/packages/web/old/  @example-org/frontend
/packages/api/v[12]/ @example-org/backend
/scripts/            devops-team
```
```bash
cd ..
cat > paths.txt <<'EOF'
README.md
packages/web/src/App.tsx
packages/web/dist/app.js
packages/api/db/001_init.sql
packages/core/src/store.ts
docs/intro.md
docs/guide/setup.md
.github/workflows/ci.yml
scripts/deploy.sh
EOF
python3 codeowners.py CODEOWNERS < paths.txt
```
```text
건너뜀 11행(! 부정): !/packages/web/old/
건너뜀 12행([ ] 범위): /packages/api/v[12]/
건너뜀 13행(소유자 형식): /scripts/
README.md                     @example-org/maintainers
packages/web/src/App.tsx      @example-org/frontend
packages/web/dist/app.js      (소유자 없음)
packages/api/db/001_init.sql  @example-org/dba
packages/core/src/store.ts    @example-org/backend @example-org/frontend
docs/intro.md                 docs@example.com
docs/guide/setup.md           @example-org/maintainers
.github/workflows/ci.yml      @example-org/admins
scripts/deploy.sh             @example-org/maintainers
```
읽는 법은 이렇다. `001_init.sql`은 `/packages/api/`와 `*.sql`에 모두 일치하지만 뒤에 있는 `*.sql`이 이겨 DBA 팀이 소유한다. `dist/` 아래는 소유자 없는 줄이 마지막으로 일치해 아무에게도 요청이 가지 않는다(쓰기 권한자 누구의 승인이든 된다). `docs/*`는 바로 아래 파일만 잡아서 `docs/guide/setup.md`는 기본 팀으로 떨어진다. `@`가 빠진 `devops-team` 줄은 통째로 무시되어 `scripts/`는 기본 팀 소유가 되었다. 이런 실수는 오류 없이 조용히 지나가므로 GitHub 화면의 CODEOWNERS 파일 보기에서 강조된 오류를 확인하거나 API로 오류 목록을 읽는다(실행하지 않은 예시).
```sh
gh api repos/example-org/example-app/codeowners/errors
```

## 흔한 실수: 기본 규칙을 맨 아래에 둔다
"모든 파일은 maintainers"를 마지막에 적으면 그 위의 구체적인 규칙이 전부 덮인다.
```bash
cat > CODEOWNERS.bad <<'EOF'
/packages/web/  @example-org/frontend
*.sql           @example-org/dba
*               @example-org/maintainers
EOF
printf 'packages/web/src/App.tsx\npackages/api/db/001_init.sql\n' \
  | python3 codeowners.py CODEOWNERS.bad
```
```text
packages/web/src/App.tsx      @example-org/maintainers
packages/api/db/001_init.sql  @example-org/maintainers
```
그 밖의 흔한 실수: 팀에 저장소 쓰기 권한을 주지 않아 요청이 가지 않는다, 대소문자가 다른 경로(`Docs/`)를 적는다, 작업 브랜치에만 CODEOWNERS를 고치고 base 브랜치에는 없다.

## 권장 설정과 한계
- `/.github/` 폴더(그 안의 CODEOWNERS와 워크플로 포함)의 소유자를 관리자로 지정한다. 그렇지 않으면 CODEOWNERS를 고치는 PR이 일반 승인만으로 병합되어 소유자 규칙 자체가 우회될 수 있다.
- 브랜치 보호의 "Require review from Code Owners"를 켜면 소유자 승인이 필수가 된다(5편). 한 줄에 여러 소유자가 있으면 그중 한 명의 승인으로 충분하다.
- 소유자는 사람보다 팀으로 지정해 휴가·퇴사에 흔들리지 않게 한다.
- 무료 요금제의 비공개 저장소에서는 코드 소유자 기능을 쓸 수 없고 Pro·Team 이상이 필요하다. 이 글의 매처는 문서의 규칙만 옮긴 것이라 실제 GitHub와 세부 동작이 다를 수 있다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: `to_regex`는 패턴을 한 글자씩 읽어 정규식이라는 다른 언어로 번역하는 아주 작은 컴파일러다.
- Git 버전 관리 2편 「커밋의 기본: 작업 트리, 스테이징 영역, 저장소」: CODEOWNERS 패턴은 거기서 본 `.gitignore` 패턴 문법에서 세 가지를 뺀 것이다.
- 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」: 필수 승인 수와 코드 소유자 리뷰 요구가 여기서 정한 소유자를 실제 병합 조건으로 만든다.

## 정리
- 리뷰는 Comment·Approve·Request changes 중 하나로 제출하고, 줄 코멘트는 모아서 제출하며, 제안된 변경은 커밋으로 바로 반영된다.
- PR 크기는 three-dot diff로 재고, 작게 나눌수록 리뷰가 빠르고 정확해진다.
- CODEOWNERS는 마지막으로 일치한 줄이 이기므로 기본 규칙은 맨 위에, 구체적인 규칙은 아래에 둔다.
- 문법이 틀린 줄은 조용히 무시되므로 오류 표시와 API로 점검한다.

## 더 알아보기
- 이전 글: 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」
- 다음 글: 4편 「이슈와 프로젝트: 할 일을 추적하고 계획하기」
- 코드 소유자 문서: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
