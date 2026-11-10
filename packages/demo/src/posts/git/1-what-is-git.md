# [Git 버전 관리 1/14] Git이란: 스냅숏으로 기록하는 분산 버전 관리

> **한 줄 요약** — Git은 커밋할 때마다 프로젝트 전체의 스냅숏을 남기고 그 이력 전체를 모든 복제본이 나눠 갖는 분산 버전 관리 시스템이며, 작업 트리·스테이징 영역·저장소라는 세 영역을 알면 명령 대부분이 무엇을 어디로 옮기는지 보인다.

## 이 글에서 다루는 것
- 버전 관리가 푸는 문제, 중앙 집중식과 분산식의 차이
- Git의 탄생: 2005년 리눅스 커널과 BitKeeper
- 변경분이 아니라 스냅숏을 저장하는 모델과 세 영역
- 최초 설정, 첫 저장소와 첫 커밋, `.git` 폴더 둘러보기
- 스냅숏 모델과 분산 모델을 실행 결과로 확인하기

## 파일 이름에 버전을 붙이면 생기는 일
`보고서_최종.docx`, `보고서_진짜최종.docx`. 이 방식은 문서 하나에서도 무너지고 코드라면 더하다. 파일 수십 개가 함께 바뀌어야 기능 하나가 되고, 어제 돌던 코드가 깨지면 무엇이 언제 누구에 의해 왜 바뀌었는지 알아야 하며, 여러 사람이 같은 파일을 동시에 고친다. **버전 관리 시스템**(version control system)은 프로젝트 전체의 기록, 되돌리기, 동시 작업의 합치기를 맡는다.

## 중앙 집중식과 분산식
CVS와 Subversion 같은 **중앙 집중식** 시스템은 서버 하나가 이력을 모두 갖고, 개발자는 작업할 파일만 받아 고친 뒤 서버에 커밋한다. 단순하지만 서버에 닿지 않으면 커밋도 이력 조회도 못 하고, 서버 디스크가 망가지면 이력이 사라진다. **분산 버전 관리**(distributed version control)에서는 복제본 하나하나가 전체 이력을 가진 완전한 저장소다. 커밋·이력 조회·브랜치가 로컬 연산이라 빠르고 오프라인에서도 되며, 어느 복제본으로든 서버를 되살린다. 팀이 GitHub 같은 서버 하나를 "기준"으로 정해 쓰는 것은 기술이 아니라 약속이다.

| 항목 | 중앙 집중식 | 분산식(Git) |
|---|---|---|
| 이력 위치 | 서버에만 | 모든 복제본 |
| 커밋 | 서버 접속 필요 | 로컬에서 |
| 서버 장애 | 이력 유실 위험 | 복제본으로 복구 |

## 2005년, 리눅스 커널에서 태어나다
리눅스 커널은 오랫동안 패치 파일과 압축 파일로 변경을 주고받다가 2002년부터 상용 분산 버전 관리 도구 BitKeeper를 썼다. 2005년 커뮤니티와 BitKeeper 개발사의 관계가 틀어져 무료 사용이 끝나자 리누스 토르발스(Linus Torvalds)가 새 도구를 직접 만들었다. Git의 첫 커밋은 2005년 4월 7일이고, 같은 해 7월 하마노 주니오(Junio Hamano)가 관리자 자리를 넘겨받았다. 공식 책 Pro Git은 당시 목표를 속도, 단순한 설계, 수천 개의 병렬 브랜치를 견디는 비선형 개발, 완전한 분산, 커널 같은 큰 프로젝트를 효율적으로 다루기로 정리한다.

## 변경분이 아니라 스냅숏
CVS와 Subversion은 파일마다 이전 버전과의 차이를 쌓아 이력을 저장한다. Git은 커밋할 때마다 프로젝트 전체 파일 트리의 **스냅숏**(snapshot)을 찍는다. 그렇다고 매번 모든 파일을 복사하지는 않는다. 파일 내용의 해시를 이름으로 쓰기 때문에, 바뀌지 않은 파일은 이전 커밋이 가리키던 내용을 그대로 다시 가리킨다.
```text
          C1     C2     C3
README    A      A      A2
hello.py  B      B2     B2
```
C1~C3은 커밋이고 같은 글자는 같은 내용, 즉 객체 하나다. C2는 README의 A를 다시 저장하지 않고 가리키기만 한다. 우리가 보는 차이(diff)는 저장된 것이 아니라 두 스냅숏을 비교해 계산한 결과다.

## 세 영역: 작업 트리, 스테이징 영역, 저장소
```text
작업 트리(working tree)
  │ git add
  ↓
스테이징 영역(staging area, index)
  │ git commit
  ↓
저장소(repository, .git)
```
**작업 트리**(working tree)는 편집기로 여는 실제 파일이다. **스테이징 영역**(staging area)은 다음 커밋에 들어갈 내용을 모아 두는 초안이고, 실체가 `.git/index` 파일이라 **인덱스**(index)라고도 부른다. **저장소**(repository)는 `.git` 폴더 안의 객체와 참조다. `git add`는 작업 트리의 내용을 스테이징 영역으로, `git commit`은 스테이징 영역 전체를 새 스냅숏으로 저장소에 옮긴다. 초안이 따로 있어서 고친 것 중 일부만 골라 한 주제의 커밋을 만들 수 있다(2편).

## 따라 하기: 설치 확인과 최초 설정
우분투와 WSL은 `sudo apt install git`, macOS는 `xcode-select --install`이나 Homebrew, 윈도우는 Git for Windows로 설치한다. 이 글의 실행 결과는 Git 2.43 기준이고, 커밋 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git --version
```
```text
git version 2.43.0
```
커밋에는 작성자 이름과 이메일이 박히므로 처음 한 번 설정한다. `--global`은 사용자 홈의 `~/.gitconfig`에 쓰고, `--show-origin`은 각 값이 어느 파일에서 왔는지 보여 준다(설정 범위는 14편). 출력의 `…`는 환경마다 다른 경로를 줄인 것이다.
```bash
git config --global user.name "Dev Kim"
git config --global user.email "dev@example.com"
git config --global init.defaultBranch main
git config --global core.editor "code --wait"
git config --global --list --show-origin
```
```text
file:…/.gitconfig	user.name=Dev Kim
file:…/.gitconfig	user.email=dev@example.com
file:…/.gitconfig	init.defaultbranch=main
file:…/.gitconfig	core.editor=code --wait
```
`init.defaultBranch`는 Git 2.28에서 생긴 설정으로, 없으면 첫 브랜치가 `master`가 된다. `core.editor`는 `-m` 없이 커밋할 때 메시지를 쓸 편집기이고, VS Code처럼 창을 띄우는 편집기는 창을 닫을 때까지 기다리도록 `--wait`을 붙인다.

## 따라 하기: 첫 저장소와 첫 커밋
```bash
mkdir hello && cd hello
git init
```
```text
Initialized empty Git repository in /…/hello/.git/
```
```bash
echo "# 인사 프로그램" > README.md
echo 'print("hello")' > hello.py
git status
```
```text
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	README.md
	hello.py

nothing added to commit but untracked files present (use "git add" to track)
```
두 파일은 아직 **추적되지 않는**(untracked) 상태다. 스테이징하고 커밋한다.
```bash
git add README.md hello.py
git commit -m "인사 프로그램 추가"
```
```text
[main (root-commit) 1ef244a] 인사 프로그램 추가
 2 files changed, 2 insertions(+)
 create mode 100644 README.md
 create mode 100644 hello.py
```
`root-commit`은 부모가 없는 첫 커밋이라는 뜻이고, `1ef244a`는 커밋 ID(40자 해시)의 앞 7자다.

## .git 폴더 둘러보기
```bash
ls .git
cat .git/HEAD
cat .git/refs/heads/main
```
```text
COMMIT_EDITMSG
HEAD
branches
config
description
hooks
index
info
logs
objects
refs
ref: refs/heads/main
1ef244adb4d507d4d047bc24500847d78ade3a71
```
`HEAD`는 "지금 main 브랜치에 있다"는 한 줄, `refs/heads/main`은 커밋 ID 한 줄이다. `objects`는 내용, `index`는 스테이징 영역, `config`는 이 저장소만의 설정, `logs`는 참조가 움직인 기록(8편의 reflog), `hooks`는 13편에서 쓴다. 커밋 하나로 생긴 객체를 세어 보자.
```bash
find .git/objects -type f | sort
```
```text
.git/objects/11/b15b1a4584b08fa423a57964bdbf018b0da0d5
.git/objects/1e/f244adb4d507d4d047bc24500847d78ade3a71
.git/objects/9e/6659abf6ed0feb4b0b91f5a28a83a5fc6a7cb4
.git/objects/a0/540f2d32b62bdd0abaade619feba2ed8214062
```
파일 2개의 내용(블롭), 폴더 목록(트리), 커밋까지 4개다. 파일 이름이 곧 내용의 해시이고, 객체 속은 3편에서 연다.

## 검증 1: 스냅숏은 바뀐 것만 새로 저장한다
`hello.py`만 고쳐 두 번째 커밋을 만들고, 두 커밋의 파일 목록을 비교한다(`-a`는 추적 중인 파일의 변경을 스테이징까지 한 번에 한다).
```bash
echo 'print("hello, git")' > hello.py
git commit -am "인사말 바꾸기"
git ls-tree HEAD~1
git ls-tree HEAD
find .git/objects -type f | wc -l
```
```text
[main 47727c8] 인사말 바꾸기
 1 file changed, 1 insertion(+), 1 deletion(-)
100644 blob 9e6659abf6ed0feb4b0b91f5a28a83a5fc6a7cb4	README.md
100644 blob 11b15b1a4584b08fa423a57964bdbf018b0da0d5	hello.py
100644 blob 9e6659abf6ed0feb4b0b91f5a28a83a5fc6a7cb4	README.md
100644 blob 58fd1933942cbde8495d08e071329191fa363dbc	hello.py
7
```
`HEAD~1`은 한 커밋 전이다. 두 스냅숏 모두 README.md를 같은 ID `9e6659a…`로 가리키고, 객체는 새 `hello.py` 블롭, 새 트리, 새 커밋 3개만 늘었다. README.md는 다시 저장되지 않았다.

## 검증 2: 복제본은 전체 이력을 갖는다
서버 없이 폴더끼리 복제해도 이력이 통째로 따라온다.
```bash
cd ..
git clone hello hello-copy
git -C hello-copy log --format='%h %s'
```
```text
Cloning into 'hello-copy'...
done.
47727c8 인사말 바꾸기
1ef244a 인사 프로그램 추가
```
`hello-copy`는 같은 커밋 두 개를 가진 완전한 저장소라, 원본을 지워도 이력을 되살릴 수 있다. 원격과 주고받는 법은 7편.

## 흔한 실수와 문제 해결
저장소가 아닌 폴더에서 Git 명령을 실행하면 Git은 상위 폴더까지 `.git`을 찾다가 포기한다.
```bash
mkdir not-a-repo && cd not-a-repo
git status
```
```text
fatal: not a git repository (or any of the parent directories): .git
```
반대로 홈 폴더에서 실수로 `git init`을 하면 그 아래 모든 폴더가 거대한 저장소 하나가 된다. 지금 어느 저장소 안인지는 `git rev-parse --show-toplevel`로 확인하고, 잘못 만든 저장소는 그 폴더의 `.git`만 지우면 된다.

이름과 이메일이 없는 환경(새 서버, 컨테이너)에서 Git은 시스템 사용자 이름과 호스트 이름으로 이메일을 추측해 엉뚱한 작성자로 커밋하거나 거부한다. `user.useConfigOnly`를 켜면 추측하지 않고 바로 알려 준다. 빈 홈 폴더로 재현해 보자.
```bash
cd ../hello && mkdir -p ../empty-home
HOME=$PWD/../empty-home git -c user.useConfigOnly=true \
  commit --allow-empty -m "빈 커밋"
```
```text
Author identity unknown

*** Please tell me who you are.

Run

  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"

to set your account's default identity.
Omit --global to set the identity only in this repository.

fatal: no email was given and auto-detection is disabled
```
메시지대로 두 값을 설정하면 된다. GitHub는 커밋의 이메일로 계정을 찾으므로, 계정에 없는 이메일로 커밋하면 기여 기록에 연결되지 않는다.

## 권장 설정
- 위 네 가지(`user.name`, `user.email`, `init.defaultBranch`, `core.editor`)에 `user.useConfigOnly true`를 더한다. 회사와 개인 이메일을 나누는 조건부 설정은 14편.
- 윈도우와 리눅스를 오간다면 줄바꿈 설정부터: WSL 개발 환경 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」.

## 한계와 버전별 차이
- 팩 파일 안에서는 공간을 아끼려고 비슷한 객체끼리 차이만 저장한다(3편). 저장 최적화일 뿐 커밋이 스냅숏이라는 모델은 그대로다.
- 빈 폴더는 추적하지 않는다. 큰 바이너리는 모든 복제본이 모든 버전을 가져 부담이 크다(12편).
- `git switch`·`git restore`는 Git 2.23에서 `git checkout`의 일을 나누려고 생겼다(4·8편). 3.0에서는 새 저장소의 기본 브랜치 이름을 `main`으로, 해시 함수를 SHA-256으로 바꿀 계획이 발표되어 있다(3편).

## 어디에 쓰이나
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 새 커밋이 바뀐 부분만 새로 만들고 나머지를 공유하는 것은, 경로 복사로 이전 버전을 모두 남기는 퍼시스턴트 구조와 같은 생각이다.
- 이산수학 8편 「그래프의 기초: 정점과 간선」: 커밋이 부모를 가리키는 이력은 방향 비순환 그래프이고, 브랜치와 병합(4·5편)은 이 그래프 위의 연산이다.
- GitHub 협업과 자동화 1편 「GitHub란: 원격 저장소에서 개발 플랫폼까지」: 대등한 복제본 중 하나를 팀의 기준 원격으로 두는 서비스가 GitHub다.

## 정리
- 버전 관리는 기록, 되돌리기, 동시 작업의 합치기를 맡고, Git은 모든 복제본이 전체 이력을 갖는 분산식이다.
- Git은 2005년 리눅스 커널이 BitKeeper를 못 쓰게 되면서 태어났다.
- 커밋은 프로젝트 전체의 스냅숏이지만, 바뀌지 않은 파일은 같은 객체를 가리키므로 새로 저장되는 것은 바뀐 것뿐이다(객체 4개 → 7개).
- 작업 트리 → `add` → 스테이징 영역 → `commit` → 저장소. 이 세 영역이 이 시리즈의 지도다.

## 더 알아보기
- 다음 글: 2편 「커밋의 기본: 작업 트리, 스테이징 영역, 저장소」
- Pro Git(Git 공식 사이트의 무료 책): https://git-scm.com/book/en/v2

## 시리즈 안내
1~5편은 혼자 쓰는 Git의 모델(스냅숏, 객체, 브랜치, 병합), 6~10편은 이력을 다시 쓰고 나누고 되돌리고 찾는 법과 원격 협업, 11~14편은 팀 규칙, 큰 저장소, 자동 검사, 사고 복구다.

1. **Git이란: 스냅숏으로 기록하는 분산 버전 관리** ← 지금 읽는 글
2. 커밋의 기본: 작업 트리, 스테이징 영역, 저장소
3. Git 내부 구조: 블롭, 트리, 커밋 객체와 참조
4. 브랜치와 HEAD: 움직이는 포인터로 갈라지기
5. 병합: fast-forward, 3-way 병합, 충돌 해결
6. 리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙
7. 원격 저장소: clone, fetch, pull, push와 추적 브랜치
8. 되돌리기: restore, reset, revert, reflog
9. 이력 탐색과 디버깅: log 필터, blame, bisect
10. stash, worktree, cherry-pick: 작업을 잠시 두고, 나누고, 옮기기
11. 브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발
12. 큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS
13. Git 훅: 커밋과 푸시 전에 자동으로 검사하기
14. 설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응

먼저 읽으면 좋은 글: 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」(파일과 프로세스의 기본), 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」(3편의 해시), 이산수학 8편 「그래프의 기초: 정점과 간선」(커밋 그래프), WSL 개발 환경 1편 「WSL이란: 윈도우 안의 리눅스, WSL 1과 WSL 2의 구조」(윈도우에서 리눅스 Git 쓰기).
