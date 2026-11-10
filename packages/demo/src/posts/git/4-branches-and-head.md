# [Git 버전 관리 4/14] 브랜치와 HEAD: 움직이는 포인터로 갈라지기

> **한 줄 요약** — 브랜치는 커밋 해시 한 줄을 적은 41바이트 파일이고 HEAD는 지금 어느 브랜치에 있는지를 적은 파일이라, 커밋하면 HEAD가 가리키는 브랜치 하나만 새 커밋으로 옮겨 가며, HEAD가 커밋을 직접 가리키는 분리된 HEAD에서 만든 커밋은 이름을 붙여야 잃지 않는다.

## 이 글에서 다루는 것
- 브랜치가 41바이트 파일이라는 것을 확인하고 손으로 만들어 보기
- `git switch`·`git switch -c`와 예전 `git checkout`의 관계
- 커밋하면 현재 브랜치만 앞으로 간다는 것, `git log --oneline --graph --all`
- 분리된 HEAD와 그 상태에서 만든 커밋을 살리는 법
- `git branch -v`, `-d`와 `-D`, 이름 바꾸기, 브랜치 전환이 거부되는 경우

## 문제: 하던 일을 두고 다른 일을 해야 할 때
새 기능을 반쯤 만들었는데 운영 중인 버전에서 급한 버그가 났다. 기능 코드를 섞지 않고 버그만 고쳐 내보내야 하고, 끝나면 다시 기능으로 돌아와야 한다. 폴더를 통째로 복사하는 방법은 무겁고 나중에 합치기 어렵다. Git의 **브랜치**(branch)는 이 일을 커밋 하나 크기도 안 되는 비용으로 해낸다. 3편에서 본 것처럼 브랜치가 커밋을 가리키는 이름표일 뿐이기 때문이다.

## 원리: 이름표 두 개
```text
C1 ← C2 ← C3   ← main ← HEAD
```
커밋은 부모를 가리키고(화살표), 브랜치 `main`은 C3을, HEAD는 `main`을 가리킨다. 커밋하면 Git은 HEAD를 따라가 현재 커밋 C3을 부모로 하는 새 커밋을 만들고, HEAD가 가리키는 브랜치 파일의 해시만 새 커밋으로 바꾼다. `feature` 브랜치를 만들어 거기로 옮긴 뒤 커밋하면 이렇게 된다.
```text
          main
           ↓
C1 ← C2 ← C3 ← F1
                ↑
             feature ← HEAD
```
`main`은 C3에 그대로 있고 `feature`만 F1로 갔다. 브랜치를 바꾼다는 것은 HEAD 파일의 내용을 바꾸고, 작업 트리와 인덱스를 그 브랜치 커밋의 스냅숏에 맞추는 일이다.

## 따라 하기: 브랜치는 41바이트 파일
커밋 세 개짜리 저장소를 만든다(이 글의 결과는 Git 2.43 기준이고, 커밋 해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q app && cd app
echo "# 앱" > README.md
for n in 1 2 3; do
  echo "v$n" > app.txt; git add .; git commit -qm "버전 $n"
done
git log --oneline
cat .git/HEAD
wc -c .git/refs/heads/main
```
```text
b92c300 버전 3
e2388b1 버전 2
ee501d9 버전 1
ref: refs/heads/main
41 .git/refs/heads/main
```
16진수 40자와 줄바꿈 하나, 41바이트다. 브랜치를 만들면 같은 해시를 적은 파일이 하나 더 생길 뿐이다.
```bash
git branch feature
git branch
cat .git/refs/heads/main .git/refs/heads/feature
```
```text
  feature
* main
b92c3001e800fbc9a9d7ac5020cc34ca841465ad
b92c3001e800fbc9a9d7ac5020cc34ca841465ad
```
`*`는 HEAD가 가리키는 현재 브랜치다.

## 검증: 브랜치를 손으로 만들기
한 커밋 전의 해시를 파일에 직접 써도 Git은 그것을 브랜치로 알아본다.
```bash
git rev-parse HEAD~1 > .git/refs/heads/handmade
git branch -v
```
```text
  feature  b92c300 버전 3
  handmade e2388b1 버전 2
* main     b92c300 버전 3
```
```bash
git branch -d handmade
```
```text
Deleted branch handmade (was e2388b1).
```
원리 확인용일 뿐, 실무에서는 이렇게 하지 않는다. 참조는 `git gc` 뒤에 `.git/packed-refs` 한 파일로 모이기도 하고, Git 3.0에서는 새 저장소의 참조 저장 형식을 reftable로 바꿀 계획이 공식 문서에 있다. 참조는 `git branch`나 `git update-ref`로 다룬다.

## 커밋하면 현재 브랜치만 움직인다
`feature`로 옮겨 커밋하고, `main`으로 돌아와 버그를 고친다.
```bash
git switch feature
echo "새 기능" > feature.txt
git add feature.txt && git commit -qm "기능 추가"
git switch main
echo "v3 수정" > app.txt && git commit -qam "버그 수정"
ls
git log --oneline --graph --all --decorate
```
```text
Switched to branch 'feature'
Switched to branch 'main'
README.md
app.txt
* b66ed59 (HEAD -> main) 버그 수정
| * 5af856e (feature) 기능 추가
|/  
* b92c300 버전 3
* e2388b1 버전 2
* ee501d9 버전 1
```
`main`으로 돌아오자 `feature.txt`가 작업 트리에서 사라졌다. 지워진 것이 아니라 `main`의 스냅숏에 없을 뿐이고, `feature`로 가면 다시 나타난다. 그래프에서 두 브랜치가 C3(`버전 3`)에서 갈라졌다. `--decorate`는 커밋 옆에 브랜치 이름을 붙이는 옵션으로 터미널에서는 기본으로 켜진다. `--all`이 없으면 현재 브랜치에서 닿는 커밋만 보이므로 갈라진 모양을 보려면 꼭 붙인다.

## switch와 checkout
예전에는 `git checkout` 하나가 브랜치 이동과 파일 되돌리기를 모두 했다. `git checkout main`과 `git checkout -- main`이 전혀 다른 일을 하는 혼란 때문에 Git 2.23에서 `git switch`(브랜치)와 `git restore`(파일, 8편)가 실험 기능으로 나뉘어 나왔다. 오래된 문서와 스크립트에는 여전히 `checkout`이 많으니 둘 다 읽을 줄 알아야 한다.

| 하는 일 | 예전 → 지금 |
|---|---|
| 브랜치 이동 | `checkout x` → `switch x` |
| 만들고 이동 | `checkout -b x` → `switch -c x` |
| 커밋으로 이동 | `checkout <해시>` → `switch --detach <해시>` |
| 파일 되돌리기 | `checkout -- f` → `restore f` |

## 분리된 HEAD
HEAD가 브랜치가 아니라 커밋을 직접 가리키는 상태를 **분리된 HEAD**(detached HEAD)라 한다. 태그나 과거 커밋을 둘러볼 때 생긴다.
```bash
git checkout HEAD~1
```
```text
Note: switching to 'HEAD~1'.

You are in 'detached HEAD' state. You can look around, make experimental
...
HEAD is now at b92c300 버전 3
```
HEAD 파일에 해시가 직접 적혔다. 이 상태에서도 커밋할 수 있지만, 커밋은 어느 브랜치에도 속하지 않는다.
```bash
cat .git/HEAD
echo "실험" > app.txt && git commit -qam "실험"
git switch main
```
```text
b92c3001e800fbc9a9d7ac5020cc34ca841465ad
Warning: you are leaving 1 commit behind, not connected to
any of your branches:

  96a6074 실험

If you want to keep it by creating a new branch, this may be a good time
to do so with:

 git branch <new-branch-name> 96a6074

Switched to branch 'main'
```
브랜치로 돌아가는 순간 "실험" 커밋을 가리키는 이름이 사라진다. Git이 경고에 해시를 남겨 주므로, 그 해시로 브랜치를 만들면 살아난다.
```bash
git branch experiment 96a6074
git log --oneline --graph --all --decorate
```
```text
* 96a6074 (experiment) 실험
| * b66ed59 (HEAD -> main) 버그 수정
|/  
| * 5af856e (feature) 기능 추가
|/  
* b92c300 버전 3
* e2388b1 버전 2
* ee501d9 버전 1
```
경고를 놓쳤다면 HEAD가 움직인 기록인 reflog(8편)에서 해시를 찾는다. 이름 없는 커밋은 reflog가 만료된 뒤 `gc`가 지운다.

## 브랜치 정리: -v, -d와 -D, 이름 바꾸기
```bash
git branch -m experiment spike
git switch -c fix/typo
git branch -v
git switch -q main
git branch -d feature
```
```text
Switched to a new branch 'fix/typo'
  feature  5af856e 기능 추가
* fix/typo b66ed59 버그 수정
  main     b66ed59 버그 수정
  spike    96a6074 실험
error: the branch 'feature' is not fully merged.
If you are sure you want to delete it, run 'git branch -D feature'
```
`-m`은 이름 바꾸기, `git switch -c`는 브랜치를 만들고 바로 옮기기(`git branch` + `git switch`), `-v`는 각 브랜치의 마지막 커밋 보기다. `-d`는 현재 브랜치에 병합되지 않은 커밋이 있으면 거부한다. 정말 버릴 때만 `-D`를 쓴다.
```bash
git branch -D feature
```
```text
Deleted branch feature (was 5af856e).
```
지워지는 것은 41바이트 이름표뿐이고 커밋 객체는 남는다. 출력의 해시를 기억해 두면 `git branch feature 5af856e`로 되살릴 수 있다. 병합이 끝난 브랜치는 `git branch --merged`로 골라 정리한다.

## 흔한 실수와 문제 해결
`git switch`에 커밋을 주면 실수로 분리된 HEAD가 되지 않도록 거부한다. 의도했다면 `--detach`를 붙인다.
```bash
git switch HEAD~1
```
```text
fatal: a branch is expected, got commit 'HEAD~1'
hint: If you want to detach HEAD at the commit, try again with the --detach option.
```
이름을 잘못 치면 참조를 찾지 못한다. `git branch -a`로 정확한 이름을 확인한다.
```bash
git switch spkie
```
```text
fatal: invalid reference: spkie
```
커밋하지 않은 변경은 브랜치에 속하지 않는다. 작업 트리와 인덱스는 하나뿐이라, 두 브랜치에서 내용이 같은 파일의 변경은 브랜치를 바꿔도 그대로 따라온다(`-q`는 안내 문구를 끈다).
```bash
echo "작업 중" >> README.md
git switch -q spike
git status -s
git switch -q main
```
```text
 M README.md
```
`spike`로 옮긴 뒤에도 README의 변경이 그대로 있다.
반대로 두 브랜치에서 내용이 다른 파일을 고친 상태라면, 전환이 그 변경을 덮어쓰게 되므로 Git이 거부한다.
```bash
echo "작업 중" > app.txt
git switch spike
```
```text
error: Your local changes to the following files would be overwritten by checkout:
	app.txt
Please commit your changes or stash them before you switch branches.
Aborting
```
커밋하거나, 잠시 치워 두거나(`git stash`, 10편), 다른 폴더에 그 브랜치를 따로 꺼내(`git worktree`, 10편) 해결한다.

## 권장 설정과 체크리스트
- 브랜치 이름에 종류를 붙인다: `feat/login`, `fix/price-rounding`, `docs/readme`. 이 사이트의 저장소도 작업 브랜치(`feat/*`, `docs/*`)를 통합 브랜치에 병합하는 흐름을 쓴다(11편).
- 셸 프롬프트에 현재 브랜치를 표시한다. 분리된 HEAD를 바로 알아챈다.
- 그래프 보기는 별칭으로 만든다(14편): `git log --oneline --graph --all`.
- 브랜치는 짧게 살린다. 오래 갈라져 있을수록 병합 충돌이 커진다(5편).

## 한계와 버전별 차이
- `git switch`·`git restore`는 Git 2.23(2019년)에 실험 기능으로 들어왔다. 그보다 오래된 Git에서는 `checkout`만 쓸 수 있다.
- 브랜치 이름에는 공백, `..`, `~`, `^`, `:` 등을 쓸 수 없다. `feat/login`과 `feat`를 함께 만들 수 없는 것은 참조가 폴더 경로로 저장되기 때문이다.
- 분리된 HEAD의 긴 안내문은 `advice.detachedHead=false`로 끌 수 있지만, 익숙해지기 전에는 켜 두는 편이 안전하다.

## 어디에 쓰이나
- 이산수학 8편 「그래프의 기초: 정점과 간선」: 커밋 이력은 방향 비순환 그래프이고, 브랜치는 그 정점 하나에 붙인 이름표다. `--graph`는 이 그래프를 글자로 그린 것이다.
- 고급 자료 구조 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」: 두 브랜치가 갈라진 지점은 그래프에서 공통 조상이고, 5편의 병합 기준(merge base)이 바로 그것이다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 브랜치 하나가 풀 리퀘스트 하나가 된다.

## 정리
- 브랜치는 커밋 해시를 적은 41바이트 파일, HEAD는 현재 브랜치를 적은 파일이다. 손으로 쓴 파일도 브랜치로 인식됐다.
- 커밋하면 HEAD가 가리키는 브랜치만 새 커밋으로 움직이고, 브랜치를 바꾸면 작업 트리가 그 스냅숏으로 바뀐다.
- 분리된 HEAD에서 만든 커밋은 브랜치를 바꾸면 이름을 잃는다. 경고의 해시나 reflog로 `git branch <이름> <해시>`.
- `-d`는 병합 안 된 브랜치를 지키고, `-D`도 이름표만 지운다. 커밋하지 않은 변경은 브랜치를 따라다닌다.

## 더 알아보기
- 이전 글: 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」
- 다음 글: 5편 「병합: fast-forward, 3-way 병합, 충돌 해결」
- Pro Git "Git Branching": https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell
