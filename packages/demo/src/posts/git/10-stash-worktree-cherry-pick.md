# [Git 버전 관리 10/14] stash, worktree, cherry-pick: 작업을 잠시 두고, 나누고, 옮기기

> **한 줄 요약** — stash는 작업 트리와 스테이징 영역을 커밋 객체로 떠서 쌓아 두는 것이고, worktree는 한 저장소에 작업 폴더를 여러 개 붙여 브랜치를 동시에 펼치는 것이며, cherry-pick은 커밋의 차이만 다른 브랜치에 새 커밋으로 적용하는 것이라 같은 변경이 해시만 다른 두 커밋으로 남는다.

## 이 글에서 다루는 것
- `git stash push -m`·`list`·`apply`·`pop`·`drop`, `-u`, stash 충돌
- stash의 정체: 부모가 둘 이상인 커밋과 `refs/stash`의 reflog
- `git worktree add`로 다른 브랜치를 다른 폴더에 동시에 체크아웃하기
- `git cherry-pick -x`와 같은 변경을 알아보는 `git cherry`, `--cherry-pick`

## 문제: 하던 일을 두고 급한 일부터
기능 브랜치에서 반쯤 고친 상태인데 운영 버그를 먼저 고쳐 달라는 요청이 왔다. 덜 된 변경을 커밋하기는 싫고, 브랜치를 바꾸려니 Git이 막는다. 고친 뒤에는 그 수정을 출시된 릴리스 브랜치에도 넣어야 한다. 실습 저장소를 만들고 그 상황을 재현한다. 해시와 시각은 여러분의 환경에서 다르게 나오고, 경로는 `…`로 줄였다.
```bash
git init -q shop && cd shop
printf '%s\n' 'TITLE = "shop"' 'VERSION = "1.0"' 'DEBUG = False' \
  'PORT = 8000' 'WORKERS = 2' 'LOGIN = False' > app.py
git add app.py && git commit -qm "첫 버전"
git branch release-1.0 && git branch feature
sed -i 's/"shop"/"Shop"/' app.py && git commit -qam "제목 수정"
git switch -q feature
sed -i 's/LOGIN = False/LOGIN = True/' app.py && echo "할 일" > notes.txt
git switch main
```
```text
error: Your local changes to the following files would be overwritten by checkout:
	app.py
Please commit your changes or stash them before you switch branches.
Aborting
```
수정한 app.py가 main에서는 다른 내용이라, 브랜치를 바꾸면 내 수정이 덮어써진다. Git은 이런 경우 전환을 거부한다.

## stash: 작업을 커밋처럼 떠서 쌓아 두기
`git stash push`는 작업 트리와 스테이징 영역의 변경을 저장하고 작업 트리를 HEAD 상태로 되돌린다. `-m`으로 이름을 붙여 두면 나중에 찾기 쉽다.
```bash
git stash push -m "로그인 작업 중"
git status -s
git stash push -u -m "메모"
git stash list
```
```text
Saved working directory and index state On feature: 로그인 작업 중
?? notes.txt
Saved working directory and index state On feature: 메모
stash@{0}: On feature: 메모
stash@{1}: On feature: 로그인 작업 중
```
추적되지 않는 notes.txt는 첫 stash에 들어가지 않고 남았다. `-u`(`--include-untracked`)를 붙여야 함께 저장된다. 목록은 스택이라 최근 것이 `stash@{0}`이다.

stash는 특별한 저장소가 아니라 커밋이다. 그래프로 보면 HEAD와 "스테이징 영역을 뜬 커밋"을 부모로 둔 커밋이 보인다.
```bash
git log --oneline --graph stash@{1}
git rev-list --parents -n 1 stash@{0} | wc -w
```
```text
*   f5a78a5 On feature: 로그인 작업 중
|\
| * 43de053 index on feature: 511ae15 첫 버전
|/
* 511ae15 첫 버전
4
```
`-u`로 만든 `stash@{0}`은 추적되지 않는 파일을 담은 커밋까지 부모가 셋이다(해시 넷). 가장 최근 stash를 `refs/stash` 참조가 가리키고, `stash@{1}` 같은 이름은 그 참조의 reflog 항목(8편)이다. 커밋이므로 `git show stash@{1}`, `git diff stash@{0}`처럼 다룰 수 있고, 지운 stash도 객체는 바로 사라지지 않는다.

## worktree: 브랜치를 다른 폴더에 동시에 펼치기
stash 대신 폴더를 하나 더 쓰는 방법도 있다. `git worktree add`는 같은 저장소(같은 객체와 참조)를 공유하는 작업 폴더를 새로 만든다. 지금 폴더는 그대로 두고, 옆 폴더에서 main을 기점으로 hotfix 브랜치를 만들어 고친다.
```bash
git worktree add -q -b hotfix ../hotfix main
cd ../hotfix
sed -i 's/LOGIN = False/LOGIN = None/' app.py
git commit -qam "로그인 기본값 수정"
cat .git && git worktree list
```
```text
gitdir: …/shop/.git/worktrees/hotfix
…/shop    511ae15 [feature]
…/hotfix  b6de962 [hotfix]
```
추가된 폴더의 `.git`은 폴더가 아니라 원래 저장소 안의 `worktrees/hotfix`를 가리키는 파일이다. 커밋은 공유되므로 원래 폴더에서도 hotfix 브랜치가 바로 보인다. 단, 한 브랜치는 한 작업 폴더에서만 체크아웃할 수 있다.
```bash
cd ../shop && git switch hotfix
```
```text
fatal: 'hotfix' is already used by worktree at '…/hotfix'
```
두 폴더에서 같은 브랜치를 고치다 서로의 작업 트리를 어긋나게 만드는 일을 막는 규칙이다. 수정을 main에 병합하고 폴더를 정리한다.
```bash
git -C ../hotfix switch -q main && git -C ../hotfix merge -q hotfix
git worktree remove ../hotfix && git worktree list | wc -l
```
```text
1
```
긴 테스트를 돌리는 동안 다른 브랜치를 보거나, PR을 리뷰하며 내 작업을 그대로 두고 싶을 때 worktree가 stash보다 편하다. 빌드 결과물과 `node_modules` 같은 의존성은 폴더마다 따로 생긴다는 점은 감안한다.

## stash 되돌리기: apply와 pop, 그리고 충돌
feature로 돌아와 main의 수정을 받은 뒤 stash를 되살린다. `apply`는 적용만 하고 목록에 남기고, `pop`은 적용에 성공하면 목록에서 지운다.
```bash
git merge -q main
git stash apply -q && git stash list
git stash drop
```
```text
Already up to date.
stash@{0}: On feature: 메모
stash@{1}: On feature: 로그인 작업 중
Dropped refs/stash@{0} (d6525f65095dd1a047b7c15894ce86facb0b1f3b)
```
stash 적용도 내부적으로는 병합이라, 추적 파일 변경이 없는 메모 stash에서는 "Already up to date."가 찍힌다. 메모를 되살린 뒤에도 `stash@{0}`이 남아 있어서 `drop`으로 지웠다. 이제 로그인 작업을 `pop`한다. stash를 뜬 뒤 main의 핫픽스가 같은 줄을 바꿨으므로 충돌한다.
```bash
git stash pop
```
```text
Auto-merging app.py
CONFLICT (content): Merge conflict in app.py
...
The stash entry is kept in case you need it again.
```
충돌하면 pop이어도 stash를 지우지 않는다. 파일을 고치고(여기서는 내 작업인 True를 남긴다) 해결을 표시한 뒤 직접 지운다.
```bash
sed -i -e '/^<<<<<<</d' -e '/^=======/d' -e '/^>>>>>>>/d' \
  -e '/LOGIN = None/d' app.py
git add app.py && git stash drop -q && git stash list | wc -l
git commit -qm "로그인 켜기" && grep -e TITLE -e LOGIN app.py
```
```text
0
TITLE = "Shop"
LOGIN = True
```

## cherry-pick: 커밋 하나를 다른 브랜치로
핫픽스는 이미 출시한 release-1.0에도 필요하다. main을 release-1.0에 병합하면 아직 출시하지 않은 "제목 수정"까지 딸려 가므로 그 커밋만 골라 온다. `git cherry-pick`은 커밋과 그 부모의 차이를 현재 브랜치에 적용해 새 커밋을 만든다. `-x`는 메시지에 원래 커밋을 적어 둔다.
```bash
git switch -q release-1.0
git cherry-pick -x hotfix >/dev/null
git log -1 --format=%B && grep -e TITLE -e LOGIN app.py
```
```text
로그인 기본값 수정

(cherry picked from commit b6de96241f57a1ca8246baca92766e94a9cb6cf1)

TITLE = "shop"
LOGIN = None
```
제목은 release 쪽의 소문자 "shop" 그대로이고 LOGIN 줄만 바뀌었다. 충돌이 나면 리베이스(6편)와 같이 파일을 고치고 `git add` 후 `git cherry-pick --continue`, 그만두려면 `--abort`다.

### 같은 변경이 두 번: `git cherry`와 `--cherry-pick`
release-1.0에 버전 커밋을 하나 더 쌓고 main과 비교해 보자. 같은 변경이 해시가 다른 두 커밋으로 존재하므로, "release에만 있는 커밋"을 해시로 세면 핫픽스가 중복으로 잡힌다. Git은 변경 내용의 해시인 **patch-id**로 같은 변경을 알아본다.
```bash
sed -i 's/"1.0"/"1.0.1"/' app.py && git commit -qam "버전 1.0.1"
for c in hotfix release-1.0~1; do
  git show $c | git patch-id --stable | cut -c1-12
done
git cherry -v main release-1.0
git log --oneline --cherry-pick --right-only main...release-1.0
```
```text
6ffa3fd61125
6ffa3fd61125
- 0fca41df33d5cc0922b76438a519a13da2dc09fd 로그인 기본값 수정
+ 153ef30917dab0ee26ef4e2f049aa473538ca7e6 버전 1.0.1
153ef30 버전 1.0.1
```
두 핫픽스 커밋은 해시가 다르지만 patch-id가 같다. `git cherry`는 main에 같은 변경이 있는 커밋에 `-`, 없는 커밋에 `+`를 붙인다. `--cherry-pick`은 양쪽에 같은 변경이 있는 커밋을 빼고 보여 주므로, main에 아직 없는 것은 "버전 1.0.1"뿐이다. 리베이스도 같은 방법으로 이미 들어간 커밋을 건너뛴다.

## 흔한 실수와 문제 해결
- stash를 쌓아 두고 잊는다: 몇 주 지난 stash는 무엇이었는지 모르게 된다. `-m`으로 이름을 붙이고, 오래 걸릴 일은 WIP 커밋이나 worktree로 한다.
- 지운 stash 되찾기: drop할 때 찍힌 해시나 `git fsck --unreachable | grep commit`으로 찾은 고아 커밋을 `git stash apply <해시>`로 적용한다.
- worktree 폴더를 그냥 지웠다: `git worktree prune`이 남은 기록을 정리한다.
- cherry-pick을 남발하면 같은 변경이 브랜치마다 다른 해시로 흩어진다. 가능하면 가장 오래된 브랜치에서 고치고 새 브랜치로 병합해 올리는 흐름(11편)을 먼저 고려한다.

## 권장 설정
```bash
git config --global stash.showIncludeUntracked true
git config --global alias.wip "stash push -u -m"
```
첫 설정은 `git stash show`가 추적되지 않는 파일도 보여 주게 한다. 체크리스트: stash에는 이름을, 오래 걸릴 병행 작업은 worktree로, release로 옮기는 수정은 `cherry-pick -x`로 출처를 남긴다.

## 한계와 버전별 차이
- 이 글의 실행 결과는 Git 2.43 기준이다. `git worktree`는 2.5에 들어왔다. 예전 글의 `git stash save`는 `push`로 대체되었다.
- stash는 무시된 파일(`.gitignore`)을 기본으로 담지 않는다. `-a`(`--all`)로 포함한다.
- patch-id는 공백과 줄 번호만 다른 차이를 같게 보지만, 충돌을 풀며 내용이 달라진 cherry-pick은 다른 변경으로 본다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: patch-id는 차이의 내용을 해시해 같은 변경을 알아보는, 내용 주소 방식의 또 다른 쓰임이다.
- 추상 데이터 타입 심화 2편 「스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계」: stash 목록은 마지막에 넣은 것을 먼저 꺼내는 스택이고, `stash@{n}`은 그 스택의 위치다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: squash 병합 뒤의 브랜치 커밋도 해시는 다르고 변경은 같아서, 이 글의 `git cherry`로 이미 들어간 변경인지 확인할 수 있다.

## 정리
- stash는 작업 트리·스테이징 영역(·`-u`면 추적 안 된 파일)을 커밋으로 떠서 `refs/stash`의 reflog에 쌓는다. `apply`는 남기고 `pop`은 성공 시 지우며, 충돌하면 남긴다.
- worktree는 객체와 참조를 공유하는 작업 폴더를 추가한다. 한 브랜치는 한 폴더에서만 체크아웃된다.
- cherry-pick은 커밋의 차이를 새 커밋으로 적용한다. `-x`로 출처를 남긴다.
- 같은 변경은 patch-id로 알아보고, `git cherry`와 `--cherry-pick`으로 중복을 걸러 본다.

## 더 알아보기
- 이전 글: 9편 「이력 탐색과 디버깅: log 필터, blame, bisect」
- 다음 글: 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」
- Git 공식 문서 git-worktree: https://git-scm.com/docs/git-worktree
