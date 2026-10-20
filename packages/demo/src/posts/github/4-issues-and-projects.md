# [GitHub 협업과 자동화 4/12] 이슈와 프로젝트: 할 일을 추적하고 계획하기

> **한 줄 요약** — 이슈는 재현 단계와 기대·실제 결과를 담은 작업 단위이고, 라벨·마일스톤·하위 이슈·이슈 폼으로 구조를 주고 Projects로 계획하며, PR의 닫는 키워드는 기본 브랜치를 향할 때만 동작한다는 규칙까지 알아야 추적이 끊기지 않는다.

## 이 글에서 다루는 것
- 좋은 이슈의 구성과 라벨·마일스톤·담당자, 하위 이슈와 이슈 유형
- 이슈 템플릿과 이슈 폼: YAML을 파이썬으로 파싱해 필수 키와 흔한 실수 검사하기
- Projects의 보기·필드·자동화와 검색 문법
- PR과 이슈를 잇는 닫는 키워드의 규칙을 작은 파이썬으로 확인하기

## 문제: "로그인이 안 돼요"
메신저로 받은 버그 보고는 한 달 뒤면 찾을 수 없고, "안 돼요"만 적힌 이슈는 재현에 하루를 쓴다. **이슈**(issue)는 버그, 기능 요청, 할 일을 하나씩 기록하는 GitHub의 작업 단위다. 저장소 단위로 번호가 붙고(`#12`), PR·커밋과 서로 참조되며, 닫힌 뒤에도 검색된다. 좋은 버그 이슈는 다음을 담는다.
- 제목: 증상과 위치(`글 목록에서 좋아요 수가 0으로 보임`)
- 재현 단계: 번호를 붙인 최소 절차
- 기대 결과와 실제 결과, 환경(브라우저, 버전), 오류 메시지 원문
- 한 이슈에 한 문제. 기능 요청은 해결책보다 풀고 싶은 문제를 먼저 쓴다

## 라벨, 마일스톤, 담당자, 하위 이슈
**라벨**(label)은 분류 태그다. 새 저장소에는 `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` 아홉 개가 기본으로 들어 있다. **마일스톤**(milestone)은 이슈·PR을 묶어 마감일과 완료 비율을 보여 준다. 담당자(assignee)는 이슈·PR마다 10명까지다. 이슈를 닫을 때는 완료(completed)와 계획 없음(not planned)을 구분해 두면 나중에 검색할 때 갈린다.

큰 작업은 **하위 이슈**(sub-issue)로 나눈다. 부모 이슈 하나에 하위 이슈를 100개까지, 8단계 깊이까지 만들 수 있고 진행률이 부모에 표시된다. 조직은 **이슈 유형**(issue type)을 정해 저장소를 가로질러 같은 분류를 쓸 수 있다. 기본 유형은 task, bug, feature이고 최대 25개까지 만든다.

## 이슈 템플릿과 이슈 폼
템플릿은 기본 브랜치의 `.github/ISSUE_TEMPLATE/` 폴더에 둔다. 마크다운 템플릿(`.md`)은 본문의 뼈대를 채워 줄 뿐이지만, **이슈 폼**(issue form, `.yml`)은 입력 칸·드롭다운·체크박스로 된 양식을 보여 주고 응답을 마크다운으로 바꿔 본문에 넣는다. 이슈 폼은 2026년 10월 현재 공개 프리뷰이고 PR에는 쓸 수 없다. 공식 문서의 규칙 중 자주 틀리는 것은 다음과 같다.
- 최상위 `name`, `description`, `body`는 필수다. `title`, `labels`, `assignees`, `type`, `projects`는 선택이다.
- `body` 요소의 `type`은 `markdown`, `textarea`, `input`, `dropdown`, `checkboxes`, `upload`이다. `markdown`은 안내문이라 제출되지 않는다.
- `name`은 세 글자보다 길어야 선택 화면에 나온다. `id`는 영문·숫자·`-`·`_`만 쓰고 폼 안에서 유일해야 하며, 입력 요소의 `label`도 서로 달라야 한다.
- `dropdown`의 `options`는 비어 있으면 안 되고 서로 달라야 한다. `Yes`·`No` 같은 단어는 YAML이 불리언으로 읽으므로 따옴표로 감싼다.
- `validations.required`는 공개 저장소에서만 동작한다. 템플릿의 라벨이 저장소에 없으면 붙지 않는다.
- YAML에서 `#`은 주석이라 `## 제목` 같은 마크다운은 따옴표로 감싸야 한다.

## 따라 하기: 이슈 폼을 파싱해 검사하기
잘못된 폼은 GitHub에서 만들거나 저장하거나 볼 때 검증 오류가 나므로, 커밋 전에 구조를 검사하면 시행착오가 준다. 버그 신고 폼을 하나 만든다.
```yaml
# 파일: .github/ISSUE_TEMPLATE/bug.yml
name: 버그 신고
description: 재현할 수 있는 문제를 알려 주세요
title: "[버그] "
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: "## 먼저 기존 이슈를 검색해 주세요"
  - type: textarea
    id: steps
    attributes:
      label: 재현 단계
      placeholder: "1. 글 목록을 연다"
    validations:
      required: true
  - type: textarea
    id: result
    attributes:
      label: 기대 결과와 실제 결과
  - type: dropdown
    id: browser
    attributes:
      label: 브라우저
      options: [Chrome, Firefox, Safari, 기타]
  - type: input
    id: version
    attributes:
      label: 앱 버전
      placeholder: "예: 1.4.2"
```
검사기는 위 규칙을 그대로 옮겼다. PyYAML이 필요하다(Ubuntu는 `sudo apt install python3-yaml`, 가상 환경은 `pip install pyyaml`). 여기서는 PyYAML이 설치된 시스템 파이썬을 경로로 직접 부른다.
```python
# 파일: check_form.py
import re, sys, yaml

TYPES = {"markdown", "textarea", "input", "dropdown", "checkboxes", "upload"}

def check(form):
    errs = [f"최상위 키 {k} 없음" for k in ("name", "description", "body")
            if not form.get(k)]
    ids = []
    for i, el in enumerate(form.get("body") or []):  # GitHub처럼 0부터
        t, a, at = el.get("type"), el.get("attributes") or {}, f"body[{i}]"
        if t not in TYPES:
            errs.append(f"{at}: 알 수 없는 type {t!r}"); continue
        if t == "markdown":
            if not isinstance(a.get("value"), str):
                errs.append(f"{at}: value가 문자열이 아님 ({a.get('value')!r})")
            continue
        if not a.get("label"): errs.append(f"{at}: label 없음")
        if "id" in el:
            ids.append(el["id"])
            if not re.fullmatch(r"[A-Za-z0-9_-]+", str(el["id"])):
                errs.append(f"{at}: id 형식 {el['id']!r}")
        opts = a.get("options")
        if t == "dropdown" and opts:
            if any(isinstance(o, bool) for o in opts):
                errs.append(f"{at}: options에 불리언 {opts}")
            if len(set(map(str, opts))) < len(opts):
                errs.append(f"{at}: options 중복")
    dup = sorted({x for x in ids if ids.count(x) > 1})
    if dup: errs.append(f"id 중복: {dup}")
    return errs

form = yaml.safe_load(open(sys.argv[1]))
errs = check(form)
n = sum(e.get("type") != "markdown" for e in form.get("body") or [])
print("\n".join(errs) if errs else f"OK: 입력 요소 {n}개")
sys.exit(1 if errs else 0)
```
```bash
/usr/bin/python3 check_form.py .github/ISSUE_TEMPLATE/bug.yml
```
```text
OK: 입력 요소 4개
```
이번에는 흔한 실수를 한 폼에 모아 본다.
```bash
cat > broken.yml <<'EOF'
name: 기능 제안
body:
  - type: markdown
    attributes:
      value: ## 제안 전에 읽어 주세요
  - type: input
    id: app version
    attributes:
      label: 앱 버전
  - type: dropdown
    id: area
    attributes:
      label: 영역
      options: [웹, API, 웹]
  - type: dropdown
    id: repro
    attributes:
      label: 재현되나요?
      options: [Yes, No, 모름]
  - type: textarea
    id: area
    attributes:
      description: 무엇이 필요한가요
EOF
/usr/bin/python3 check_form.py broken.yml
```
```text
최상위 키 description 없음
body[0]: value가 문자열이 아님 (None)
body[1]: id 형식 'app version'
body[2]: options 중복
body[3]: options에 불리언 [True, False, '모름']
body[4]: label 없음
id 중복: ['area']
```
심어 둔 일곱 가지가 모두 잡혔다. GitHub 편집기도 같은 종류의 오류를 `body[i]` 번호(0부터)와 함께 보여 준다. 그런데 `body[0]`과 `body[3]`은 눈으로 보면 멀쩡하다. YAML 파서가 실제로 무엇을 읽는지 확인한다.
```bash
/usr/bin/python3 -c 'import yaml
print(yaml.safe_load("value: ## 제목"))
print(yaml.safe_load("value: \"## 제목\""))
print(yaml.safe_load("options: [Yes, No, \"Yes\"]"))'
```
```text
{'value': None}
{'value': '## 제목'}
{'options': [True, False, 'Yes']}
```
공백 뒤의 `#`부터 줄 끝까지가 주석이 되어 값이 `None`이 되고, 따옴표 없는 `Yes`·`No`는 YAML 1.1 규칙에 따라 불리언이 된다. 공식 문서가 마크다운 제목과 이런 단어를 따옴표로 감싸라고 하는 이유다. 템플릿 선택 화면은 같은 폴더의 `config.yml`로 조정한다. `blank_issues_enabled: false`로 빈 이슈를 막고(쓰기 권한자에게는 계속 보인다), `contact_links`로 보안 제보처럼 이슈가 아닌 곳으로 안내한다.

## Projects와 검색
**Projects**는 이슈·PR을 모아 테이블, 칸반 보드, 로드맵으로 보는 계획 도구다. 텍스트·숫자·날짜·단일 선택·반복 주기(iteration) 같은 사용자 정의 필드를 내장 필드와 합쳐 50개까지 쓰고, 항목과 이슈는 양방향으로 동기화된다. 내장 워크플로 중 "닫히면 Done"과 "PR이 병합되면 Done"은 처음부터 켜져 있고, 조건에 맞는 이슈 자동 추가와 자동 보관도 설정할 수 있다. 더 복잡한 자동화는 GraphQL API와 Actions로 한다.

이슈 목록의 검색창은 한정자(qualifier)를 이해한다.
| 검색어 | 찾는 것 |
|---|---|
| `is:issue is:open label:bug` | 열린 버그 이슈 |
| `assignee:@me` | 나에게 배정된 것 |
| `no:assignee -label:wontfix` | 담당자 없고 그 라벨도 없는 것 |
| `label:"bug","wip"` | 두 라벨 중 하나 |
| `linked:pr` | 닫는 PR이 연결된 이슈 |
| `reason:"not planned"` | 계획 없음으로 닫힌 이슈 |

저장소 이슈 목록에서는 `(type:"Bug" AND assignee:@me) OR label:urgent`처럼 `AND`·`OR`와 괄호(5단계까지)도 쓸 수 있다. 같은 검색을 터미널에서 할 수도 있다(실행하지 않은 예시, 11편).
```sh
gh issue list --search 'no:assignee label:"help wanted",bug sort:created-asc'
```

## PR과 이슈 잇기: 닫는 키워드의 규칙
PR 설명이나 커밋 메시지에 `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved` 중 하나와 이슈 번호를 쓰면 병합 때 이슈가 닫힌다. 대소문자는 상관없고 `Closes: #10`처럼 콜론도 된다. 다른 저장소는 `example-org/docs#7`처럼 쓰고, 여러 이슈는 이슈마다 키워드를 붙인다. 그리고 **PR이 기본 브랜치를 향할 때만** 해석된다. 문서 규칙을 옮긴 작은 파서로 확인한다(GitHub 구현이 아니다).
```python
import re
KW = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)"
PAT = re.compile(KW + r":?\s+((?:[\w.-]+/[\w.-]+)?#\d+)", re.I)

def closes(body, base, default="main"):
    return PAT.findall(body) if base == default else []

body = "Closes #1, #2\nFIXES: #5\nresolves example-org/docs#7\nclosing #8"
print("main으로 가는 PR:", closes(body, "main"))
print("dev로 가는 PR:", closes(body, "dev"))
```
```text
main으로 가는 PR: ['#1', '#5', 'example-org/docs#7']
dev로 가는 PR: []
```
`#2`는 키워드가 없어 연결되지 않고, `closing`은 키워드가 아니다. `feat/*` → `dev` → `main`처럼 통합 브랜치를 두는 팀에서는 작업 PR의 `Closes`가 무시되어 이슈가 열린 채 남는다. 커밋 메시지의 키워드는 그 커밋이 기본 브랜치에 들어갈 때 이슈를 닫으므로, squash 커밋 메시지에 `Closes #12`를 남기거나 `dev` → `main` PR 설명에 닫을 이슈를 모아 적는다.

## 흔한 실수와 권장 설정
- 템플릿을 작업 브랜치에만 커밋했다: 기본 브랜치에 병합되어야 선택 화면에 나타난다.
- 비공개 저장소에서 `required: true`를 믿었다: 공개 저장소에서만 강제된다. 필수 항목은 리뷰 단계에서 확인한다.
- `projects:` 키로 자동 추가가 안 된다: 이슈를 여는 사람이 그 프로젝트에 쓰기 권한이 있어야 한다. 프로젝트의 자동 추가 워크플로를 쓴다.
- 라벨은 종류·우선순위·상태 정도로 적게 두고, 폼에서 `triage` 라벨을 자동으로 붙여 새 이슈를 놓치지 않는다.
- 보안 취약점은 공개 이슈 대신 `contact_links`와 보안 정책으로 받는다(10편).

## 어디에 쓰이나
- 레벨 디자인과 콘텐츠 제공 16편 「콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포」: 데이터 파일을 빌드 전에 검증기로 걸러 내는 발상이 이슈 폼 YAML 검사와 같다.
- 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: PR 설명의 `Closes`가 병합 방식과 상관없이 기본 브랜치 병합 시점에만 동작한다는 점이 여기서 이어진다.
- 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 이슈 열림·라벨 이벤트로 워크플로를 돌려 분류를 자동화할 수 있다.

## 정리
- 좋은 이슈는 재현 단계, 기대·실제 결과, 환경을 담고 한 이슈에 한 문제만 다룬다.
- 라벨·마일스톤·하위 이슈·이슈 유형으로 구조를 주고, Projects로 계획하고 내장 워크플로로 상태를 자동으로 맞춘다.
- 이슈 폼은 최상위 세 키, 유일한 `id`, 따옴표로 감싼 `#`를 지켜야 하고, 커밋 전에 파싱해 검사할 수 있다.
- 닫는 키워드는 이슈마다 붙여야 하고 기본 브랜치로 가는 PR에서만 동작한다.

## 더 알아보기
- 이전 글: 3편 「코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법」
- 다음 글: 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」
- 이슈 폼 문법: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
