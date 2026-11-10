# [Git 버전 관리 5/14] 병합: fast-forward, 3-way 병합, 충돌 해결

> **한 줄 요약** — 병합은 두 브랜치의 공통 조상(merge base)을 기준으로 양쪽 변경을 합치는 일로, 한쪽만 바뀌었으면 브랜치 포인터만 앞으로 옮기는 fast-forward, 둘 다 바뀌었으면 부모가 둘인 병합 커밋을 만드는 3-way 병합이 되고, 같은 곳을 둘 다 고쳤을 때만 충돌이 나서 사람이 결정한다.

## 이 글에서 다루는 것
- 병합 기준(`git merge-base`)과 3-way 병합 규칙
- fast-forward와 `--no-ff`, 부모가 둘인 병합 커밋을 `git cat-file -p`로 확인
- 충돌을 만들고 충돌 표시 읽기, `merge.conflictStyle=zdiff3`
- 해결 → `add` → `commit`, `git merge --abort`, 남은 충돌 표시 찾기
- 충돌을 줄이는 습관, `rerere`, 병합 전략 ort

## 문제: 갈라진 두 브랜치를 하나로
4편에서 `feature`와 `main`이 갈라졌다. 기능이 끝나면 합쳐야 하는데, 두 파일만 놓고 비교하는 방식(2-way)으로는 안 된다. `main`에 있고 `feature`에 없는 줄이 `main`에서 추가된 것인지 `feature`에서 지운 것인지 알 수 없기 때문이다. 판단하려면 둘이 갈라지기 전의 상태, 즉 공통 조상이 필요하다.

## 원리: 공통 조상을 기준으로 한 3-way 병합
Git은 두 브랜치 끝 커밋의 가장 가까운 공통 조상을 찾는다. 이것이 **병합 기준**(merge base)이다. 그리고 기준→우리 쪽(HEAD), 기준→그들 쪽(병합해 오는 브랜치)의 변경을 각각 구해 합친다. 부분마다 규칙은 단순하다.

| 기준 | 우리 | 그들 | 결과 |
|---|---|---|---|
| A | A | A | A |
| A | B | A | B |
| A | A | C | C |
| A | B | C | 충돌 |

한쪽만 바꾼 곳은 바뀐 쪽을 따르고, 양쪽이 같은 곳을 다르게 바꿨을 때만 **충돌**(conflict)이다. Git은 줄 단위로 판단하므로, 서로 붙어 있는 줄을 각각 고친 것도 충돌로 본다. 특별한 경우로, 병합 기준이 우리 쪽 끝 커밋 자체라면(우리가 그동안 아무것도 안 했다면) 합칠 것 없이 우리 브랜치를 그들 쪽 커밋으로 옮기면 된다. 이것이 **fast-forward**다.

## 따라 하기: fast-forward
메뉴판 저장소에서 `dessert` 브랜치에 커밋 하나를 만들고 `main`에 병합한다. `-q`는 출력을 줄이는 옵션이다(이 글의 결과는 Git 2.43 기준이고, 커밋 해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q cafe && cd cafe
printf '%s\n' "아메리카노 4000" "라떼 4500" "모카 5000" "녹차 4500" > menu.txt
git add . && git commit -qm "메뉴판 만들기"
git switch -qc dessert
echo "케이크 6000" > dessert.txt
git add . && git commit -qm "디저트 추가"
git switch -q main
git merge-base main dessert
git rev-parse main
git merge dessert
```
```text
f41dbf5b2c3d220ec4ad6a91eb7e843903c64040
f41dbf5b2c3d220ec4ad6a91eb7e843903c64040
Updating f41dbf5..6422e35
Fast-forward
 dessert.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 dessert.txt
```
병합 기준이 `main` 자신이므로 `Fast-forward`다. 새 커밋 없이 `main` 파일의 해시만 `6422e35`로 바뀌었다.

## --no-ff: 병합 커밋을 일부러 남기기
fast-forward가 가능해도 `--no-ff`를 주면 병합 커밋을 만든다. 기능 하나가 어디서 시작해 어디서 합쳐졌는지 이력에 묶음으로 남기려는 팀이 쓴다.
```bash
git switch -qc hours
echo "9시~21시" > hours.txt
git add . && git commit -qm "영업시간 추가"
git switch -q main
git merge --no-ff -m "영업시간 병합" hours
git log --oneline --graph --decorate
```
```text
Merge made by the 'ort' strategy.
 hours.txt | 1 +
 1 file changed, 1 insertion(+)
 create mode 100644 hours.txt
*   30d182f (HEAD -> main) 영업시간 병합
|\  
| * 9d93915 (hours) 영업시간 추가
|/  
* 6422e35 (dessert) 디저트 추가
* f41dbf5 메뉴판 만들기
```
`dessert`는 일직선에 녹아들었고, `hours`는 갈라졌다 합쳐지는 고리로 남았다. GitHub 풀 리퀘스트의 병합 방식 차이는 GitHub 협업과 자동화 2편에서 다룬다.

## 3-way 병합과 부모가 둘인 커밋
이번에는 양쪽이 모두 커밋한다. `price`에서는 1번 줄을, `main`에서는 4번 줄을 고친다.
```bash
git switch -qc price
sed -i 's/아메리카노 4000/아메리카노 4200/' menu.txt
git commit -qam "아메리카노 인상"
git switch -q main
sed -i 's/녹차 4500/녹차 4800/' menu.txt
git commit -qam "녹차 인상"
git merge-base main price
git merge -m "가격 조정 병합" price
cat menu.txt
git cat-file -p HEAD
```
```text
30d182f9bb93cf13c357ee5bb0e4b035852057a2
Auto-merging menu.txt
Merge made by the 'ort' strategy.
 menu.txt | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
아메리카노 4200
라떼 4500
모카 5000
녹차 4800
tree db9178382fd93473e9e8838a753fc25ebff152de
parent a9445c08ff3d99e776a2b46069fe493a908e50eb
parent 69cbf71af8dd663aa161cf0b05a6934681b04ebe
author Dev Kim <dev@example.com> 1772410920 +0900
committer Dev Kim <dev@example.com> 1772410920 +0900

가격 조정 병합
```
병합 기준은 `영업시간 병합` 커밋(`30d182f`)이다. 두 변경이 겹치지 않아 자동으로 합쳐졌고, 결과에는 4200과 4800이 모두 있다. 병합 커밋은 `parent` 줄이 둘이라는 점만 빼면 보통 커밋과 같다. 첫째 부모는 병합할 때 HEAD였던 커밋(`녹차 인상`), 둘째 부모는 병합해 온 커밋(`아메리카노 인상`)이다. 8편의 `revert -m 1`에서 이 순서가 중요해진다.

## 충돌 만들기와 읽기
이제 양쪽이 같은 줄을 다르게 고친다.
```bash
git switch -qc sale
sed -i 's/라떼 4500/라떼 4000/' menu.txt
git commit -qam "라떼 할인"
git switch -q main
sed -i 's/라떼 4500/라떼 5000/' menu.txt
git commit -qam "라떼 인상"
git merge sale
```
```text
Auto-merging menu.txt
CONFLICT (content): Merge conflict in menu.txt
Automatic merge failed; fix conflicts and then commit the result.
```
병합이 멈추고 충돌난 파일이 작업 트리에 표시와 함께 남는다. 이때 인덱스에는 한 파일이 세 판으로 들어 있다.
```bash
git status -s
git ls-files -u
cat menu.txt
```
```text
UU menu.txt
100644 7c27838be43a5e7c5a85765d8c7db0b1880bd8c9 1	menu.txt
100644 e6ba2550b619ada040d0b36f641ce9a88e4205eb 2	menu.txt
100644 2303596ac65838be28c15d26094ba247d7dbe63d 3	menu.txt
아메리카노 4200
<<<<<<< HEAD
라떼 5000
=======
라떼 4000
>>>>>>> sale
모카 5000
녹차 4800
```
`UU`는 양쪽 모두 고쳐서(unmerged) 충돌났다는 뜻이다. `git ls-files -u`의 셋째 열이 **단계**(stage)다. 1은 병합 기준, 2는 우리 쪽, 3은 그들 쪽의 블롭이다. 파일에서 `<<<<<<< HEAD`부터 `=======`까지가 우리 쪽, 거기부터 `>>>>>>> sale`까지가 그들 쪽이다. 충돌 밖의 줄(4200, 4800)은 이미 합쳐져 있다. `git diff`는 이 상태에서 두 부모와 비교한 결합 diff를 보여 준다. 앞의 두 칸이 각각 우리 쪽, 그들 쪽 기준이다.
```bash
git diff
```
```text
diff --cc menu.txt
index e6ba255,2303596..0000000
--- a/menu.txt
+++ b/menu.txt
@@@ -1,4 -1,4 +1,8 @@@
  아메리카노 4200
++<<<<<<< HEAD
 +라떼 5000
++=======
+ 라떼 4000
++>>>>>>> sale
  모카 5000
  녹차 4800
```

## zdiff3: 공통 조상까지 보기
기본 표시만으로는 원래 값이 무엇이었는지 알 수 없다. 원래 4500이었다면 "한쪽은 올리고 한쪽은 내렸다"는 사실이 해결 방향을 정한다. `git merge --abort`로 병합 전 상태로 돌아가 Git 2.35에 생긴 `zdiff3` 형식으로 다시 병합한다.
```bash
git merge --abort
git status -s
git config merge.conflictStyle zdiff3
git merge sale
```
```text
Auto-merging menu.txt
CONFLICT (content): Merge conflict in menu.txt
Automatic merge failed; fix conflicts and then commit the result.
```
`--abort` 뒤의 `git status -s`가 아무것도 출력하지 않은 것은 병합 전 상태로 깨끗이 돌아갔다는 뜻이다.
```bash
cat menu.txt
```
```text
아메리카노 4200
<<<<<<< HEAD
라떼 5000
||||||| 99bc88d
라떼 4500
=======
라떼 4000
>>>>>>> sale
모카 5000
녹차 4800
```
`|||||||` 아래가 병합 기준(`99bc88d`, 가격 조정 병합)의 내용이다. `diff3` 형식도 기준을 보여 주지만, `zdiff3`는 양쪽에 똑같이 들어간 앞뒤 줄을 충돌 밖으로 빼 주어 읽을 양이 줄어든다.

## 해결하고 커밋하기
충돌 해결은 파일을 원하는 최종 모습으로 고치고 표시를 모두 지우는 일이다. 어느 한쪽일 필요는 없다. 여기서는 4800으로 정했다. `git diff --check`로 남은 충돌 표시가 없는지 확인하고, `git add`로 "해결됨"을 알린 뒤 커밋한다. `--no-edit`는 Git이 준비한 메시지(`Merge branch 'sale'`)를 편집기 없이 쓴다.
```bash
printf '%s\n' "아메리카노 4200" "라떼 4800" "모카 5000" "녹차 4800" > menu.txt
git diff --check
git add menu.txt
git commit --no-edit
git log --oneline --graph --decorate -6
```
```text
[main 64acd67] Merge branch 'sale'
*   64acd67 (HEAD -> main) Merge branch 'sale'
|\  
| * a31c9c3 (sale) 라떼 할인
* | 0896907 라떼 인상
|/  
*   99bc88d 가격 조정 병합
|\  
| * 69cbf71 (price) 아메리카노 인상
* | a9445c0 녹차 인상
|/  
```
`git diff --check`는 문제가 없으면 아무것도 출력하지 않는다. 한쪽을 통째로 고르려면 `git checkout --ours menu.txt`나 `--theirs`를 쓴 뒤 `add`한다.

## 흔한 실수와 문제 해결
충돌 표시를 지우지 않고 커밋하는 사고는 생각보다 흔하다. `git diff --check`가 잡는다.
```bash
echo "<<<<<<< HEAD" >> menu.txt
git diff --check
```
```text
menu.txt:5: leftover conflict marker
```
커밋하지 않은 변경이 병합할 파일과 겹치면 병합이 시작되지 않는다. 커밋하거나 `git stash`(10편)로 치운 뒤 병합한다.
```bash
git restore menu.txt
git switch -qc night
echo "야간 메뉴" >> menu.txt && git commit -qam "야간 메뉴"
git switch -q main
echo "10시~22시" > hours.txt && git commit -qam "영업시간 변경"
echo "작업 중" >> menu.txt
git merge night
```
```text
error: Your local changes to the following files would be overwritten by merge:
	menu.txt
Please commit your changes or stash them before you merge.
Aborting
Merge with strategy ort failed.
```
- 받는 쪽은 언제나 현재 브랜치다. `main`에 기능을 넣으려면 `main`으로 옮긴 뒤 `git merge feature`다. 방향을 바꾸면 `feature`에 `main`이 들어간다.
- `-X ours`(충돌난 부분만 우리 쪽)와 `-s ours`(그들 쪽 변경을 통째로 버림)는 이름이 비슷하지만 전혀 다르다. 후자는 거의 쓸 일이 없다.
- 충돌을 해결하다 엉키면 `git merge --abort`로 처음부터 다시 한다. 커밋해 버린 병합을 되돌리는 법은 8편.

## 충돌을 줄이는 습관과 rerere
- 브랜치를 짧게 살리고 자주 합친다. 갈라진 기간이 길수록 겹치는 곳이 많다.
- 포매터를 팀 전체가 같은 설정으로 쓰고, 대량 서식 변경은 기능 변경과 다른 커밋으로 낸다.
- 목록은 한 줄에 하나씩, 끝에 쉼표를 남기는 스타일이 충돌을 줄인다.
- `git config --global rerere.enabled true`를 켜면 Git이 충돌 해결 결과를 기록해 두었다가 같은 충돌이 다시 나면 자동으로 적용한다(reuse recorded resolution). 같은 브랜치를 여러 번 병합하거나 리베이스(6편)할 때 쓸모 있다.

## 한계와 버전별 차이
- 병합 전략은 Git 2.34부터 `ort`가 기본이다. 이전 기본값 `recursive`를 다시 짠 것으로, 이름 바꾸기가 많은 병합에서 특히 빠르고 위의 출력에도 `'ort' strategy`로 나온다. `recursive` 구현은 Git 2.50에서 제거되었다.
- 3-way 병합은 줄 단위 텍스트 규칙이라 의미는 모른다. 충돌 없이 합쳐진 코드가 컴파일되지 않거나 테스트가 깨질 수 있으므로, 병합 후 테스트는 CI(GitHub 협업과 자동화 6편)가 맡는다.
- 바이너리 파일은 줄 단위로 합칠 수 없어 한쪽을 골라야 한다.

## 어디에 쓰이나
- 고급 자료 구조 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」: 병합 기준은 커밋 그래프에서의 최소 공통 조상이다. 트리와 달리 그래프라 공통 조상 후보가 여럿일 수 있다.
- 동적 계획법 4편 「LCS와 편집 거리: 두 문자열을 맞추는 DP」: 3-way 병합은 기준→우리, 기준→그들 두 diff를 구해 겹치는지 보는 것이고, 각 diff가 최단 편집 스크립트다.
- 6편 「리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙」: 병합 커밋 대신 커밋을 옮겨 쌓아 일직선 이력을 만드는 다른 합치기 방법이다.

## 정리
- 병합은 병합 기준(공통 조상)을 놓고 양쪽 변경을 합친다. 한쪽만 바꾼 곳은 자동, 같은 곳을 둘 다 바꾸면 충돌.
- 병합 기준이 현재 커밋이면 fast-forward로 포인터만 옮기고, `--no-ff`는 그래도 병합 커밋을 남긴다. 병합 커밋은 `parent`가 둘이다.
- 충돌 중 인덱스에는 단계 1(기준)·2(우리)·3(그들)이 있고, `zdiff3`는 파일에 기준 내용까지 보여 준다.
- 파일을 최종 모습으로 고치고 `git diff --check` → `add` → `commit`. 엉키면 `git merge --abort`.

## 더 알아보기
- 이전 글: 4편 「브랜치와 HEAD: 움직이는 포인터로 갈라지기」
- 다음 글: 6편 「리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙」
- git merge 공식 문서: https://git-scm.com/docs/git-merge
