# [GitHub 협업과 자동화 12/12] 오픈 소스 운영: README, 라이선스, 기여 안내, 커뮤니티 파일

> **한 줄 요약** — 저장소를 공개하는 것과 프로젝트를 운영하는 것은 다르다. README가 무엇인지, 라이선스가 써도 되는지, 기여 안내와 행동 강령이 어떻게 참여하는지, `SECURITY.md`가 어디로 보고하는지 답하게 하고, 이 파일들은 정해진 위치와 우선순위 규칙에 따라 GitHub이 찾아 보여 준다.

## 이 글에서 다루는 것
- 좋은 README의 구성과 GitHub이 README를 고르는 순서
- 라이선스: 없으면 생기는 일, MIT·Apache-2.0·GPL-3.0의 핵심 차이(개요)
- 커뮤니티 건강 파일의 위치 규칙과 조직 기본값을 점검 스크립트로 확인하기
- Discussions, CHANGELOG, 메인테이너의 부담을 줄이는 자동화
- Git·GitHub 두 시리즈를 잇는 정리

## 공개 저장소에 처음 온 사람의 질문
공개 저장소에 처음 온 사람은 넷을 묻는다. 이게 무엇이고 어떻게 쓰나(README), 내 회사 코드에 써도 되나(LICENSE), 고치고 싶으면 어떻게 하나(CONTRIBUTING), 보안 문제는 어디로 알리나(SECURITY). 답이 파일로 없으면 같은 질문이 이슈로 반복되고, 메인테이너의 시간은 코드 대신 답장에 쓰인다. 오픈 소스 운영의 절반은 이 질문들에 미리 답해 두는 일이다.

## README: 첫 화면
README는 저장소 첫 화면에 그대로 렌더링된다. 다음 순서가 무난하다.
- 한 줄 설명과 이 프로젝트가 푸는 문제
- 설치와 가장 짧은 사용 예(복사해서 바로 되는 명령)
- 문서·예제 링크, 지원하는 버전과 플랫폼
- 기여 방법과 라이선스 한 줄, 상태 배지(CI 결과 등)

GitHub은 `.github` 폴더, 루트, `docs` 폴더의 README를 알아보고, 여럿이면 `.github` → 루트 → `docs` 순서로 하나를 고른다. 500KiB를 넘는 부분은 잘린다. 같은 우선순위가 아래의 커뮤니티 파일에도 쓰인다.

## 라이선스: 쓰게 해 주는 문서
아래는 법률 조언이 아니라 개요다. 회사 프로젝트라면 회사의 정책을 따른다. 라이선스가 없으면 기본 저작권법이 적용되어, 다른 사람은 코드를 복제·배포하거나 고친 것을 만들 권리가 없다. 공개 저장소는 이용 약관에 따라 GitHub 안에서 보고 포크할 수는 있지만, 그것이 가져다 써도 된다는 뜻은 아니다. 그래서 "누구나 쓰게 하고 싶다"면 라이선스를 명시해야 한다.

| 라이선스 | 지켜야 할 조건 | 특허 |
| --- | --- | --- |
| MIT | 저작권·라이선스 고지 유지 | 명시 없음 |
| Apache-2.0 | 고지 유지, 변경 사항 표시 | 명시적 허락 |
| GPL-3.0 | 고지, 변경 표시, 같은 라이선스로 소스 공개 | 명시적 허락 |

MIT는 조건이 가장 가볍다. Apache-2.0은 기여자가 특허 사용을 명시적으로 허락한다는 점이 다르다. GPL-3.0은 강한 카피레프트(copyleft)다. 배포할 때 수정본과 이를 포함한 더 큰 저작물의 전체 소스를 같은 라이선스로 공개해야 한다. 라이선스 본문은 보통 루트의 `LICENSE` 파일에 두며, GitHub은 이를 읽어 저장소 옆에 이름을 표시한다. 파일마다 `SPDX-License-Identifier: MIT` 같은 SPDX 식별자 주석을 달거나 `package.json`의 `license` 필드에 같은 식별자를 쓰면 도구가 자동으로 판별할 수 있다.

## 커뮤니티 건강 파일과 위치 규칙
| 파일 | 담는 것 |
| --- | --- |
| `CONTRIBUTING.md` | 개발 환경, PR 규칙 |
| `CODE_OF_CONDUCT.md` | 행동 강령, 신고 창구 |
| `SECURITY.md` | 취약점 보고 방법(10편) |
| `SUPPORT.md` | 질문할 곳 |
| `.github/ISSUE_TEMPLATE/` | 이슈 템플릿·폼(4편) |
| `.github/FUNDING.yml` | 후원 버튼 |

위치 규칙은 이렇다. `FUNDING.yml`은 `.github` 폴더에, 이슈 템플릿은 `.github/ISSUE_TEMPLATE`에 둔다. 나머지는 루트, `.github`, `docs` 어디든 되고 여럿이면 README와 같은 우선순위를 따른다. 조직은 공개 저장소 `.github`를 만들어 기본값을 둘 수 있고, 자기 파일이 없는 저장소에 그것이 적용된다. 단 라이선스는 기본값이 될 수 없고(복제·배포될 때 함께 가야 하므로), 저장소에 자기 이슈 템플릿이 있으면 조직 기본 템플릿은 하나도 쓰이지 않는다. 이 규칙을 점검 스크립트로 옮겨 본다.
```python
# 파일: community.py
import sys
from pathlib import Path

ORDER = [".github", ".", "docs"]  # 문서의 우선순위
FILES = {"README.md": (ORDER, False), "LICENSE": (["."], False),
         "CONTRIBUTING.md": (ORDER, True), "CODE_OF_CONDUCT.md": (ORDER, True),
         "SECURITY.md": (ORDER, True), "SUPPORT.md": (ORDER, True),
         "FUNDING.yml": ([".github"], True),
         "ISSUE_TEMPLATE": ([".github"], True)}

def find(root, name, dirs):
    for d in dirs:
        if Path(root, d, name).exists():
            return str(Path(d, name))

repo, org = sys.argv[1], sys.argv[2]  # 저장소, 조직의 .github 저장소
for name, (dirs, default_ok) in FILES.items():
    where = find(repo, name, dirs)
    if not where and default_ok and (d := find(org, name, dirs)):
        where = f"조직 기본값 {d}"
    print(f"{name:18} {where or '없음'}")
```
저장소에는 README 둘과 `docs`의 기여 안내, 라이선스, 이슈 템플릿을 두고, 조직 저장소에는 행동 강령, 보안 정책, 질문용 이슈 템플릿을 둔다.
```bash
mkdir -p app/.github/ISSUE_TEMPLATE app/docs org/.github/ISSUE_TEMPLATE
touch app/README.md app/.github/README.md app/docs/CONTRIBUTING.md \
  app/LICENSE app/.github/ISSUE_TEMPLATE/bug.yml
touch org/CODE_OF_CONDUCT.md org/SECURITY.md \
  org/.github/ISSUE_TEMPLATE/question.yml
python3 community.py app org
```
```text
README.md          .github/README.md
LICENSE            LICENSE
CONTRIBUTING.md    docs/CONTRIBUTING.md
CODE_OF_CONDUCT.md 조직 기본값 CODE_OF_CONDUCT.md
SECURITY.md        조직 기본값 SECURITY.md
SUPPORT.md         없음
FUNDING.yml        없음
ISSUE_TEMPLATE     .github/ISSUE_TEMPLATE
```
루트에도 README가 있지만 `.github`의 것이 이긴다. 저장소에 자기 이슈 템플릿이 있으니 조직의 `question.yml`은 쓰이지 않는다. 실제 저장소에서는 공개 저장소의 Insights → Community Standards 화면이 비슷한 점검표를 보여 준다. 우선순위를 한 번 더 확인하고 정리한다.
```bash
rm app/.github/README.md
python3 community.py app org | grep README
rm -r app org
```
```text
README.md          README.md
```

## Discussions: 질문은 이슈 밖으로
"이거 어떻게 써요?"가 이슈에 쌓이면 진짜 버그가 묻힌다. Discussions는 질문(Q&A)·아이디어·공지를 위한 게시판으로, 답변을 채택할 수 있다. 이슈 템플릿의 `config.yml`에서 `blank_issues_enabled: false`로 빈 이슈를 막고 `contact_links`로 질문을 Discussions에 보내면 이슈는 할 일만 남는다(이슈 폼은 4편).

## 릴리스와 CHANGELOG
9편의 자동 릴리스 노트는 병합된 PR 목록이라 GitHub 화면에 있다. 패키지와 함께 배포되는 `CHANGELOG.md`는 오프라인에서도 읽히고, 사용자 관점으로 정리된 변경 기록이다. 흔한 형식은 맨 위 `Unreleased` 아래에 Added·Changed·Fixed 같은 절을 두는 관례다. 커밋 메시지가 Conventional Commits(Git 버전 관리 11편)를 따르면 초안은 기계가 쓴다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git init -q app && cd app
c() { echo "$1" >> log.txt; git add log.txt; git commit -qm "$1"; }
c "feat: 포스트 작성"; git tag -a v1.0.0 -m v1.0.0
c "feat: 댓글 수정"; c "docs: 설치 절차"; c "fix: 긴 제목 줄바꿈"
c "feat(api): 좋아요 취소"
git log v1.0.0..HEAD --reverse --format=%s | awk '
  { t = $0; sub(/[(:!].*/, "", t); m = $0; sub(/^[^:]*: /, "", m) }
  t == "feat" { add = add "- " m "\n" }
  t == "fix"  { fix = fix "- " m "\n" }
  END { printf "## [Unreleased]\n### Added\n%s### Fixed\n%s", add, fix }'
```
```text
## [Unreleased]
### Added
- 댓글 수정
- 좋아요 취소
### Fixed
- 긴 제목 줄바꿈
```
`docs:` 커밋은 사용자에게 의미가 없어 빠졌다. 이 초안을 사람이 다듬어 릴리스 때 버전 번호로 바꾼다. 릴리스 노트와 CHANGELOG를 둘 다 손으로 관리하면 어긋나므로 하나를 원본으로 정한다.

## 메인테이너의 부담을 줄이는 자동화
반복 작업은 Actions에 넘긴다. 바뀐 경로에 따라 PR에 라벨을 붙이는 `actions/labeler`, 오래 움직임 없는 이슈에 표시를 하고 닫는 `actions/stale`이 대표적이다. stale 정책은 양날의 검이다. 백로그가 줄고 "아직 유효한가"를 묻게 되지만, 재현이 어려운 진짜 버그가 시간만 지나 닫히고 보고자는 무시당했다고 느낀다. 그래서 대상을 좁힌다. 아래는 정보를 요청한 이슈(`needs-info`)에만 적용하고, 보안·고정 라벨은 뺀다.
```yaml
# 파일: .github/workflows/stale.yml
name: Stale
on:
  schedule:
    - cron: '17 3 * * *'
permissions:
  issues: write
  pull-requests: write
jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v10
        with:
          only-labels: needs-info
          days-before-stale: 30
          days-before-close: 14
          stale-issue-message: 추가 정보가 30일째 없어 stale로 표시합니다.
          exempt-issue-labels: security,pinned
```
입력 이름을 틀리면 그 입력은 무시되고(실행 로그에 경고만 남는다) 기본값으로 돈다. 30일이 60일이 되어도 모른다. 그래서 push 전에 actionlint(6편)로 검사한다.
```bash
cd .. && git init -q
lint() { docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest "$@"; }
lint && echo "actionlint: 문제 없음"
sed 's/days-before-stale/days-before-stal/' .github/workflows/stale.yml > bad.yml
lint -oneline bad.yml; rm bad.yml
```
```text
actionlint: 문제 없음
bad.yml:16:11: input "days-before-stal" is not defined in action "actions/stale@v10". available inputs are … [action]
```

## 두 시리즈를 잇는 흐름
Git 버전 관리 시리즈와 이 시리즈는 변경 하나가 사용자에게 닿는 길을 나눠 맡았다.
```text
커밋 (Git 2·3)
 → 브랜치·병합 (Git 4~6)
 → push (Git 7, GitHub 1)
 → PR·리뷰 (GitHub 2·3)
 → 보호 규칙 (GitHub 5, Git 13)
 → CI (GitHub 6~8)
 → 배포·릴리스 (GitHub 9, Git 11)
 → 보안·자동화 (GitHub 10·11)
 → 커뮤니티 (GitHub 12)
```
이 사이트도 같은 길을 따른다. 작업 브랜치의 커밋이 PR로 통합 브랜치에 squash 병합되고, CI가 통과한 것만 배포 브랜치로 병합되어 Pages로 나간다.

## 흔한 실수와 문제 해결
- 라이선스 없이 공개: 누구도 합법적으로 가져다 쓸 수 없다. 처음부터 `LICENSE`를 넣는다.
- 의존성의 라이선스를 안 본다: GPL 계열 의존성을 넣으면 배포 조건이 바뀔 수 있다. 의존성 그래프와 라이선스 점검 도구로 확인한다.
- 조직 기본 템플릿이 안 보인다: 저장소에 자기 `ISSUE_TEMPLATE`이 있거나, 조직의 `.github` 저장소가 공개가 아니다.
- stale이 보안 이슈를 닫았다: 예외 라벨과 적용 대상을 좁힌다.

## 권장 설정과 체크리스트
- README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY를 갖추고 Community Standards에서 확인한다.
- 조직 공통 파일은 공개 `.github` 저장소에 두되, 라이선스는 저장소마다 넣는다.
- 질문은 Discussions로, 이슈는 템플릿·폼으로 받는다.
- CHANGELOG나 릴리스 노트 중 하나를 원본으로 정하고, 자동화는 대상을 좁혀 켠다.

## 어디에 쓰이나
- 4편 「이슈와 프로젝트: 할 일을 추적하고 계획하기」: 이슈 폼과 `config.yml`의 `contact_links`가 질문을 Discussions로 보내는 입구가 된다.
- 언어 기초 7편 「자바스크립트: 브라우저에서 npm까지」: npm 패키지의 `package.json` `license` 필드에 SPDX 식별자를 쓰면 의존성 라이선스를 도구로 모을 수 있다.
- 트랜지스터에서 자연어까지 13편 「AI 에이전트와 자연어 프로그래밍: 명세와 검증의 시대」: CONTRIBUTING과 CI 검사는 사람이든 에이전트든 모든 기여자에게 주는 명세와 검증이다.

## 정리
- README·LICENSE·CONTRIBUTING·SECURITY는 방문자의 네 가지 질문에 대한 답이다.
- 라이선스가 없으면 기본 저작권이 적용된다. MIT는 고지, Apache-2.0은 특허 허락 추가, GPL-3.0은 같은 라이선스로 소스 공개가 핵심이다(개요).
- 커뮤니티 파일은 `.github` → 루트 → `docs` 순서로 찾고, 없으면 조직 `.github` 저장소의 기본값을 쓴다(라이선스 제외).
- 자동화는 메인테이너를 돕지만 stale처럼 기여자를 밀어낼 수 있으니 대상을 좁힌다.

## 더 알아보기
- 이전 글: 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」
- 처음 글: 1편 「GitHub란: 원격 저장소에서 개발 플랫폼까지」
- choosealicense.com 라이선스 비교: https://choosealicense.com/licenses/
