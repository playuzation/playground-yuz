# [Git 버전 관리 6/14] 리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙

> **한 줄 요약** — 리베이스는 커밋을 옮기는 것이 아니라 같은 변경을 새 기점 위에 다시 적용해 새 커밋을 만드는 일이라서, 혼자 쓰는 브랜치를 다듬는 데는 강력하지만 공유한 커밋에 쓰면 동료의 이력과 갈라진다.

## 이 글에서 다루는 것
- 리베이스가 커밋을 새로 만든다는 것을 커밋 객체로 확인하기
- 대화형 리베이스의 pick·reword·squash·fixup·drop과 `--autosquash`
- 리베이스 중 충돌: `--continue`, `--abort`, 뒤바뀐 ours와 theirs
- `--onto`로 기점 바꾸기, 황금률과 `pull --rebase`

## 문제: 병합 커밋이 섞인 기능 브랜치
기능 브랜치에서 일하는 사이 main이 앞서 나가면, 따라잡으려고 main을 병합할 때마다 병합 커밋이 생기고(5편) 리뷰어는 섞인 이력에서 이 브랜치의 변경만 골라 읽어야 한다. **리베이스**(rebase)는 브랜치의 커밋들을 최신 main 끝에서 시작한 것처럼 다시 쌓아 일직선 이력을 만든다.

## 원리: 커밋은 고칠 수 없고 다시 만들 뿐이다
커밋 해시는 트리, 부모, 작성자·커미터, 메시지를 모두 넣어 계산한다(3편). 부모가 바뀌면 변경이 같아도 다른 커밋이다. 그래서 `git rebase main`은 이렇게 일한다.
1. main과의 병합 기준(merge base) 이후 현재 브랜치에만 있는 커밋 목록(`main..HEAD`)을 만든다.
2. HEAD를 main 끝으로 옮기고, 목록의 커밋마다 "부모와의 차이"를 차례로 적용해 새 커밋을 만든다.
3. 브랜치 참조를 마지막 새 커밋으로 옮긴다. 옛 커밋은 지워지지 않고 닿을 수 없게 될 뿐이다.

```text
리베이스 전
A---B---E  main
     \
      C---D  feature

리베이스 후 (C', D'는 새 커밋)
A---B---E  main
         \
          C'--D'  feature
```

## 따라 하기: 해시가 바뀌는 것을 확인
main에서 갈라진 feature에 커밋 두 개를 만들고, 그사이 main에도 커밋 하나를 더한다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git init -q shop && cd shop
echo "# shop" > README.md
git add README.md && git commit -qm "프로젝트 시작"
git switch -qc feature
echo "def total(xs): return sum(xs)" > cart.py
git add cart.py && git commit -qm "장바구니 합계 추가"
echo "def count(xs): return len(xs)" >> cart.py
git commit -qam "장바구니 개수 추가"
git switch -q main
echo "MIT" > LICENSE
git add LICENSE && git commit -qm "라이선스 추가"
git log --oneline --graph --all
```
```text
* ad49d46 라이선스 추가
| * a691996 장바구니 개수 추가
| * 809f422 장바구니 합계 추가
|/
* 315ed4a 프로젝트 시작
```
feature를 main 위로 리베이스하고, 전후의 끝 커밋을 비교한다.
```bash
old=$(git rev-parse feature)
git switch -q feature
git rebase main
git log --oneline --graph --all
```
```text
...
Successfully rebased and updated refs/heads/feature.
* 540b45a 장바구니 개수 추가
* b244f25 장바구니 합계 추가
* ad49d46 라이선스 추가
* 315ed4a 프로젝트 시작
```
갈래가 사라지고 두 커밋의 해시가 바뀌었다. 옛 끝 커밋과 새 끝 커밋의 부모, 트리, 작성 시각, 커밋 시각을 나란히 보자.
```bash
git log --no-walk=unsorted --date=format:%H:%M \
  --format='%h 부모 %p 트리 %t 작성 %ad 커밋 %cd' "$old" feature
git cat-file -t "$old"
```
```text
a691996 부모 809f422 트리 9d0da6c 작성 09:07 커밋 09:07
540b45a 부모 b244f25 트리 7b15951 작성 09:07 커밋 09:14
commit
```
부모와 트리(LICENSE가 들어갔다)가 바뀌었고, 작성 시각은 그대로인데 커밋 시각만 새로 찍혔다. 옛 커밋은 여전히 저장소에 있어서 `ORIG_HEAD`나 reflog로 되돌아갈 수 있다(8편).

일직선 이력은 읽기 쉽고 `git bisect`(9편)도 깔끔하게 돈다. 대신 새 커밋 C'는 E와 함께 테스트된 적 없는 조합이고, 원래 어디서 갈라졌는지가 이력에서 사라진다. 병합 커밋을 남길지는 팀 정책으로 정한다(11편).

## 대화형 리베이스: 커밋 목록을 편집하기
`git rebase -i <기점>`은 1단계의 커밋 목록(todo)을 편집기로 열어 준다. 줄 맨 앞의 명령이나 줄 순서를 바꾸고 저장하면 그대로 실행한다.

| 명령 | 하는 일 |
| --- | --- |
| pick | 커밋을 그대로 적용 |
| reword | 적용하고 메시지만 고침 |
| squash | 앞 커밋에 합치고 메시지도 이어 붙임 |
| fixup | 앞 커밋에 합치고 메시지는 버림 |
| drop | 커밋을 버림 |
| edit | 적용한 뒤 멈춰서 손보게 함 |

PR을 올리기 전의 지저분한 이력을 만들어 보자.
```bash
git switch -qc discount main
echo "RATE = 0.1O" > discount.py
git add discount.py && git commit -qm "할인율 추가"
echo "RATE = 0.10" > discount.py && git commit -qam "할인율 오타 수정"
echo "print('debug')" >> discount.py && git commit -qam "디버그 출력"
echo "assert RATE == 0.10" > test_discount.py
git add test_discount.py && git commit -qm "할인 테스트 추가"
echo "assert RATE < 1" >> test_discount.py && git commit -qam "테스트 하나 더"
git log --oneline main..
```
```text
f7a7d65 테스트 하나 더
1b9101e 할인 테스트 추가
f83a63a 디버그 출력
60d5d7a 할인율 오타 수정
c1eb597 할인율 추가
```
원래는 편집기가 열려 손으로 고치지만, 여기서는 `GIT_SEQUENCE_EDITOR`에 todo 파일을 고치는 `sed` 명령을 넣어 같은 편집을 한다. 오타 수정은 fixup, 디버그 출력은 drop, "할인 테스트 추가"는 reword, "테스트 하나 더"는 squash. reword 때 열리는 메시지 편집기도 `GIT_EDITOR`의 `sed`로 대신한다.
```bash
GIT_SEQUENCE_EDITOR="sed -i -e '/오타/s/^pick/fixup/' \
  -e '/디버그/s/^pick/drop/' -e '/테스트 추가/s/^pick/reword/' \
  -e '/하나 더/s/^pick/squash/'" \
GIT_EDITOR="sed -i 's/^할인 테스트 추가$/할인율 테스트 추가/'" \
git rebase -i main
git log --oneline main..
git log -1 --format=%B
```
```text
...
Successfully rebased and updated refs/heads/discount.
66dc5d1 할인율 테스트 추가
ab2d9e3 할인율 추가
할인율 테스트 추가

테스트 하나 더
```
다섯 커밋이 둘이 되었고 squash한 커밋에는 두 메시지가 이어 붙었다. 리베이스 직전(`ORIG_HEAD`)과 비교하면 차이는 버린 디버그 줄뿐이어야 한다.
```bash
git diff ORIG_HEAD HEAD
```
```text
diff --git a/discount.py b/discount.py
index 0d36a4a..c91c34d 100644
--- a/discount.py
+++ b/discount.py
@@ -1,2 +1 @@
 RATE = 0.10
-print('debug')
```

### `--fixup`과 `--autosquash`
`git commit --fixup=<커밋>`은 메시지가 `fixup! <대상 제목>`인 커밋을 만들고, `--autosquash`는 todo를 만들 때 그 커밋을 대상 바로 아래로 옮겨 fixup으로 표시한다. 아래 `GIT_SEQUENCE_EDITOR`는 todo를 고치지 않고 화면에 보여 주기만 한다.
```bash
echo "SHIP = 3000" > ship.py
git add ship.py && git commit -qm "배송비 추가"
echo "def summary(): pass" > order.py
git add order.py && git commit -qm "주문 요약 추가"
echo "SHIP = 2500" > ship.py
git commit -qa --fixup=HEAD~1
GIT_SEQUENCE_EDITOR="grep -v -e '^#' -e '^$'" \
git rebase -i --autosquash HEAD~3
git log --oneline -2
```
```text
pick 04043ef 배송비 추가
fixup 12465b6 fixup! 배송비 추가
pick 6d9ef2d 주문 요약 추가
...
Successfully rebased and updated refs/heads/discount.
dcc5c61 주문 요약 추가
21e4027 배송비 추가
```
`fixup!` 커밋이 대상 바로 아래로 옮겨져 합쳐졌다.

## 리베이스 중 충돌
커밋을 하나씩 다시 적용하므로 충돌도 커밋 단위로 난다. main과 feature가 README의 같은 줄을 고치게 해 보자.
```bash
git switch -q main
echo "# shop v2" > README.md && git commit -qam "README 버전 표기"
git switch -q feature
echo "# 쇼핑몰" > README.md && git commit -qam "README 한글 제목"
git rebase main
```
```text
...
Auto-merging README.md
CONFLICT (content): Merge conflict in README.md
error: could not apply 7f6f3a9... README 한글 제목
...
Could not apply 7f6f3a9... README 한글 제목
```
앞의 두 커밋은 깨끗하게 적용되었고 세 번째에서 멈췄다. 충돌 표시를 보자.
```bash
cat README.md
```
```text
<<<<<<< HEAD
# shop v2
=======
# 쇼핑몰
>>>>>>> 7f6f3a9 (README 한글 제목)
```
`HEAD` 쪽이 main, 아래쪽이 다시 적용하려는 내 커밋이다. 리베이스는 main 끝에서 출발해 내 커밋을 남의 변경처럼 적용하므로 `git checkout --ours`는 main 쪽, `--theirs`는 내 커밋 쪽이다. 병합(5편)과 반대라 자주 틀린다. 해결하고 `--continue`로 이어 간다(원래는 메시지 편집기가 열린다).
```bash
echo "# 쇼핑몰 v2" > README.md
git add README.md
git rebase --continue
git log --oneline -4
```
```text
[detached HEAD 9d998fc] README 한글 제목
 1 file changed, 1 insertion(+), 1 deletion(-)
...
Successfully rebased and updated refs/heads/feature.
9d998fc README 한글 제목
00e2b41 장바구니 개수 추가
ef09aed 장바구니 합계 추가
0338cac README 버전 표기
```
`git rebase --abort`는 시작 전 상태로 되돌리고, `--skip`은 그 커밋을 건너뛴다. 같은 충돌을 반복해서 푸는 일은 rerere(5편)가 줄여 준다.

## `--onto`: 기점을 바꿔 일부만 옮기기
리뷰 중인 feature 위에서 만든 `report`만 먼저 main에 올리고 싶다면, `git rebase main`은 feature의 커밋까지 끌고 온다. `git rebase --onto <새 기점> <옛 기점> <브랜치>`는 옛 기점 이후의 커밋만 옮긴다.
```bash
git switch -qc report feature
echo "print('report')" > report.py
git add report.py && git commit -qm "보고서 추가"
git rebase --onto main feature report
git log --oneline main~1..report
```
```text
...
Successfully rebased and updated refs/heads/report.
5532cbe 보고서 추가
0338cac README 버전 표기
```
feature의 커밋 없이 "보고서 추가"만 main 위에 올라갔다.

## 황금률: 공유한 커밋은 리베이스하지 않는다
옛 커밋을 동료가 이미 받아 그 위에서 일하고 있다면, 동료가 리베이스된 브랜치를 병합할 때 같은 변경이 해시만 다른 두 벌로 들어간다. 리베이스 전의 feature(`$old`)를 받은 동료를 브랜치로 흉내 내 보자.
```bash
git switch -qc teammate "$old"
git merge -q --no-edit feature
git log --oneline | grep 장바구니
```
```text
00e2b41 장바구니 개수 추가
ef09aed 장바구니 합계 추가
a691996 장바구니 개수 추가
809f422 장바구니 합계 추가
```
같은 커밋이 두 번씩 보인다. 게다가 리베이스한 브랜치를 올리려면 강제 push가 필요해 동료의 커밋을 덮어쓸 위험까지 생긴다(7편). 그래서 아직 나만 가진 커밋만 리베이스하고, 공유 브랜치(main, dev)의 이력은 고치지 않는다. `git pull --rebase`는 이 규칙 안의 리베이스다. 받은 커밋은 그대로 두고 아직 push하지 않은 내 커밋만 그 위로 다시 쌓는다(설정은 7편).

## 흔한 실수와 문제 해결
커밋하지 않은 변경이 있으면 리베이스가 시작되지 않는다.
```bash
git switch -q feature
echo "# memo" >> cart.py
git rebase main
```
```text
error: cannot rebase: You have unstaged changes.
error: Please commit or stash them.
```
커밋하거나 stash(10편)로 치우거나 `--autostash`를 붙인다.
- 끝난 리베이스를 무르기: 바로 다음이면 `git reset --hard ORIG_HEAD`, 나중이면 reflog(8편).
- 리베이스 후 push 거부(non-fast-forward): 혼자 쓰는 브랜치면 `--force-with-lease`(7편), 공유 브랜치면 리베이스가 잘못이다.
- 병합 커밋이 사라짐: 리베이스는 기본적으로 병합 커밋을 펼친다. 모양을 지키려면 `--rebase-merges`.

## 권장 설정
```bash
git config --global rebase.autoSquash true
git config --global rebase.autoStash true
git config --global rebase.updateRefs true
```
`updateRefs`는 report를 feature째로 옮길 때 중간의 feature 브랜치도 함께 옮긴다. 체크리스트: `git status`가 깨끗한가, 나만 가진 커밋인가, 리베이스 후 테스트를 다시 돌렸는가.

## 한계와 버전별 차이
- 이 글의 실행 결과는 Git 2.43 기준이다. 2.26부터 기본 백엔드가 병합 기계(merge)로 바뀌었고, 예전 패치 적용 방식은 `--apply`로 남았다.
- `--update-refs`는 2.38에 들어왔고, 2.44부터 `--autosquash`가 `-i` 없이도 동작한다.
- 리베이스는 커밋을 다시 테스트하지 않는다. `git rebase -x "make test" main`처럼 `--exec`로 커밋마다 명령을 돌린다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 리베이스는 노드를 고치지 않고 새 노드를 만드는 경로 복사와 같아서 옛 버전이 그대로 남는다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: "rebase and merge"는 서버가 리베이스를 해 주는 것이라 병합된 커밋의 해시가 PR의 커밋과 다르다.
- 9편 「이력 탐색과 디버깅: log 필터, blame, bisect」: fixup으로 정리해 커밋마다 빌드되는 이력은 bisect가 건너뛸 커밋을 줄인다.

## 정리
- 리베이스는 커밋마다 차이를 새 기점 위에 다시 적용해 새 커밋을 만든다. 작성 시각은 남고 부모·트리·커밋 시각이 바뀐다.
- 대화형 리베이스의 todo로 커밋을 합치고(squash·fixup) 버리고(drop) 메시지를 고친다(reword). `--autosquash`는 fixup 커밋을 자동으로 배치한다.
- 리베이스 충돌에서 ours는 기점(main), theirs는 내 커밋이다. `--continue`, `--skip`, `--abort`로 진행한다.
- 공유한 커밋은 리베이스하지 않는다. 같은 변경이 두 벌이 되고 강제 push가 필요해진다.

## 더 알아보기
- 이전 글: 5편 「병합: fast-forward, 3-way 병합, 충돌 해결」
- 다음 글: 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」
- Git 공식 문서 git-rebase: https://git-scm.com/docs/git-rebase
