# [Git 버전 관리 9/14] 이력 탐색과 디버깅: log 필터, blame, bisect

> **한 줄 요약** — 버그를 넣은 커밋은 경로·작성자·시간·내용으로 `git log`를 좁히고, `git blame`으로 줄의 마지막 변경을 따라가고, 단서가 없으면 `git bisect run`에 테스트를 맡겨 커밋 N개를 log₂N번 시험만으로 찾는다.

## 이 글에서 다루는 것
- `git log`의 필터(경로, `--author`, `--since`, `--grep`)와 곡괭이 `-S`·`-G`
- `--format`으로 필요한 정보만 뽑기
- `git blame`의 `-L`, `-w`, `-C`와 `blame.ignoreRevsFile`
- `git bisect run`으로 커밋 64개에서 범인을 자동으로 찾기, `git grep`

## 문제: "어제까지는 됐는데"
합계가 틀리게 나온다는 보고가 들어왔다. 지난주 릴리스에서는 맞았고 그 사이 커밋이 수십 개다. 커밋을 하나씩 열어 보는 대신, 이력을 질의하는 도구를 순서대로 쓴다. 단서가 있으면 log 필터와 blame, 단서가 없으면 bisect다.

## 실습 저장소 만들기
커밋 64개짜리 저장소를 만든다. 첫 커밋에 합계 함수를 넣고, 문서 커밋 63개를 Alice와 Bob이 번갈아 쌓는다. 그 사이 20번째에 Bob이 서식을 정리하고, 37번째에 Alice가 버그를 넣는다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git init -q shop && cd shop
printf '%s\n' 'def total(xs):' '    return sum(xs)' '' '' \
  'def count(xs):' '    return len(xs)' > price.py
git add price.py && git commit -qm "합계와 개수 함수 추가"
A="Alice <alice@example.com>"; B="Bob <bob@example.com>"
for i in $(seq 1 63); do
  who=$B; [ $((i % 2)) = 1 ] && who=$A
  echo "문서 $i" >> notes.txt; msg="문서 $i 갱신"
  if [ $i = 20 ]; then
    sed -i 's/^    /  /' price.py; msg="코드 서식 정리"
  fi
  if [ $i = 37 ]; then
    sed -i 's/sum(xs)/sum(xs[1:])/' price.py; msg="합계 계산 정리"
  fi
  git add -A && git commit -q --author="$who" -m "$msg"
done
git rev-list --count HEAD && cat price.py
```
```text
64
def total(xs):
  return sum(xs[1:])


def count(xs):
  return len(xs)
```
`xs[1:]` 때문에 첫 항목이 빠진다. 커밋 메시지만 봐서는 "합계 계산 정리"가 범인인지 알 수 없다고 하자.

## log 필터: 질문을 좁히기
가장 강한 필터는 경로다. `--` 뒤에 파일을 주면 그 파일을 바꾼 커밋만 남는다.
```bash
git log --oneline -- price.py
```
```text
e2e1483 합계 계산 정리
6be1d9c 코드 서식 정리
5fc8b42 합계와 개수 함수 추가
```
64개가 3개로 줄었다. 작성자, 시간, 메시지로도 거른다. `--author`와 `--grep`은 정규식이고, 여러 조건은 AND로 묶인다.
```bash
git log --oneline --author=Alice --grep="정리"
git log --oneline --since="2026-03-02 10:14" \
  --until="2026-03-02 10:20"
```
```text
e2e1483 합계 계산 정리
ee55933 문서 38 갱신
e2e1483 합계 계산 정리
1a41738 문서 36 갱신
```
첫 명령은 Alice가 쓴 "정리" 커밋 하나를, 둘째 명령은 10:14~10:20(지역 시간)에 만든 커밋 셋을 보여 준다. **곡괭이**(pickaxe)는 메시지가 아니라 변경 내용을 찾는다. `-S <문자열>`은 그 문자열의 등장 횟수가 바뀐 커밋, `-G <정규식>`은 추가·삭제된 줄 중 정규식에 맞는 줄이 있는 커밋을 찾는다.
```bash
echo "-S 'sum(':"; git log --oneline -S 'sum('
echo "-G 'sum\(':"; git log --oneline -G 'sum\('
echo "-S 'xs[1:]':"; git log --oneline -S 'xs[1:]'
```
```text
-S 'sum(':
5fc8b42 합계와 개수 함수 추가
-G 'sum\(':
e2e1483 합계 계산 정리
6be1d9c 코드 서식 정리
5fc8b42 합계와 개수 함수 추가
-S 'xs[1:]':
e2e1483 합계 계산 정리
```
`sum(xs)`를 `sum(xs[1:])`로 바꾼 커밋은 `sum(`의 개수를 바꾸지 않으므로 `-S 'sum('`에는 잡히지 않고, 그 줄을 바꿨으므로 `-G`에는 잡힌다. 의심 가는 코드 조각을 안다면 `-S 'xs[1:]'`처럼 그 조각이 처음 들어온 커밋을 바로 찾는다.

필요한 정보만 보려면 `--format`(`%h` 짧은 해시, `%an` 작성자, `%ad` 작성 시각, `%s` 제목)을 쓴다. `git show <커밋>`은 커밋 하나의 메타 정보와 변경을 보여 준다(`HEAD~26`은 부모를 26번 거슬러 간 37번째 커밋이다).
```bash
git log -1 --format='%h %an %ad %s' --date=iso -S 'xs[1:]'
git show --format= HEAD~26 -- price.py | grep '^[-+] '
```
```text
e2e1483 Alice 2026-03-02 10:17:00 +0900 합계 계산 정리
-  return sum(xs)
+  return sum(xs[1:])
```

## blame: 이 줄은 누가 마지막으로 바꿨나
`git blame`은 파일의 줄마다 그 줄을 마지막으로 바꾼 커밋을 붙인다. `-L 시작,끝`으로 줄 범위를 고른다.
```bash
git blame -L 1,2 --date=short price.py
git blame -L 5,6 --date=short price.py
```
```text
^5fc8b42 (Dev Kim 2026-03-02 1) def total(xs):
e2e1483c (Alice   2026-03-02 2)   return sum(xs[1:])
^5fc8b42 (Dev Kim 2026-03-02 5) def count(xs):
6be1d9c6 (Bob     2026-03-02 6)   return len(xs)
```
`^`는 이력이 시작된 경계 커밋이라는 표시다. 2번 줄은 바로 범인 커밋을 가리킨다. 그런데 6번 줄은 들여쓰기만 바꾼 "코드 서식 정리"를 가리킨다. 서식 커밋은 줄의 진짜 출처를 가린다. `-w`는 공백 변경을 무시하고 그 이전으로 거슬러 간다.
```bash
git blame -w -L 6,6 --date=short price.py
```
```text
^5fc8b42 (Dev Kim 2026-03-02 6)   return len(xs)
```
매번 `-w`를 붙이는 대신 서식 커밋을 목록에 적어 두고 `blame.ignoreRevsFile`로 지정하면, blame이 그 커밋을 건너뛰고 그 앞의 커밋에 줄을 돌린다. 관례적인 파일 이름은 `.git-blame-ignore-revs`이고, GitHub의 blame 화면도 저장소 루트의 이 파일을 읽는다.
```bash
git log --format=%H --grep="서식" > .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
git blame -L 5,6 --date=short price.py
```
```text
^5fc8b42 (Dev Kim 2026-03-02 5) def count(xs):
^5fc8b42 (Dev Kim 2026-03-02 6)   return len(xs)
```
`-C`는 다른 파일에서 옮기거나 복사해 온 줄의 원래 커밋을 찾는다. 함수를 다른 파일로 옮기는 리팩터링 뒤에 blame이 리팩터링 커밋만 가리킬 때 쓴다(`-C`를 두세 번 겹칠수록 더 넓게 찾고 느려진다).

## bisect: 이분 탐색으로 범인 찾기
단서가 없을 때는 **bisect**를 쓴다. 잘 되던 커밋(good)과 안 되는 커밋(bad)을 알려 주면 Git이 가운데 커밋을 체크아웃하고, 결과에 따라 범위를 절반씩 줄인다. 알고리즘 기법 3편의 이분 탐색을 커밋 이력에 적용한 것이다. 사람이 매번 "good"·"bad"를 입력해도 되지만, 판정 스크립트가 있으면 `git bisect run`이 끝까지 자동으로 돈다. 스크립트의 종료 코드가 0이면 good, 125면 이 커밋은 시험할 수 없으니 건너뜀, 1~127의 나머지는 bad, 그 밖의 값은 bisect 중단이다. 아래에서는 HEAD를 bad, 첫 커밋(부모가 없는 커밋)을 good으로 준다.
```bash
cat > ../check.sh <<'EOF'
#!/bin/sh
python3 -B -c "from price import total; assert total([1, 2, 3]) == 6" 2>/dev/null
EOF
chmod +x ../check.sh
git bisect start HEAD "$(git rev-list --max-parents=0 HEAD)"
git bisect run ../check.sh
```
```text
Bisecting: 31 revisions left to test after this (roughly 5 steps)
[45d613a9299a03d813899985f70ef0543f633e90] 문서 31 갱신
running '../check.sh'
Bisecting: 15 revisions left to test after this (roughly 4 steps)
[0e6af698eb816e7204b9c918a417a412da154275] 문서 47 갱신
running '../check.sh'
Bisecting: 7 revisions left to test after this (roughly 3 steps)
[c549830e07f349450289e4501ee53eefe0e0c66c] 문서 39 갱신
running '../check.sh'
Bisecting: 3 revisions left to test after this (roughly 2 steps)
[8c01df9e72522b8e88143486167f3a350af425cb] 문서 35 갱신
running '../check.sh'
Bisecting: 1 revision left to test after this (roughly 1 step)
[e2e1483c4ee34e9b6c15358c3121fd1a2b63827c] 합계 계산 정리
running '../check.sh'
Bisecting: 0 revisions left to test after this (roughly 0 steps)
[1a41738a609b86d01c12e7100d7f644443baa361] 문서 36 갱신
running '../check.sh'
e2e1483c4ee34e9b6c15358c3121fd1a2b63827c is the first bad commit
commit e2e1483c4ee34e9b6c15358c3121fd1a2b63827c
Author: Alice <alice@example.com>
Date:   Mon Mar 2 10:17:00 2026 +0900

    합계 계산 정리

 notes.txt | 1 +
 price.py  | 2 +-
 2 files changed, 2 insertions(+), 1 deletion(-)
bisect found first bad commit
```
시험한 커밋은 문서 31(good) → 47(bad) → 39(bad) → 35(good) → 합계 계산 정리(37, bad) → 36(good) 순으로 범위를 절반씩 줄였고, 범인은 "합계 계산 정리"다. 시험 횟수를 bisect 기록에서 세어 이론값과 비교한다.
```bash
git bisect log | grep -cE '^git bisect (good|bad)'
python3 -c "import math; print(math.log2(63))"
git bisect reset
```
```text
6
5.977279923499917
Previous HEAD position was 1a41738 문서 36 갱신
Switched to branch 'main'
```
처음과 끝 사이 후보 63개를 6번 시험해서 찾았다. log₂63 ≈ 5.98이므로 이론대로다. 후보가 1,000개라도 10번, 10만 개라도 17번이면 된다. 마지막의 `git bisect reset`은 시작 전 브랜치로 돌아간다.

## git grep: 추적 중인 파일에서 찾기
`git grep`은 작업 트리의 추적 중인 파일만 찾고(빌드 결과물 같은 무시된 파일은 건너뛴다), 커밋을 주면 그 시점의 파일에서 찾는다. 체크아웃하지 않고 옛 코드를 뒤질 수 있다.
```bash
git grep -n 'sum(' HEAD~40 -- price.py
git grep -c '문서' -- notes.txt
```
```text
HEAD~40:price.py:2:  return sum(xs)
notes.txt:63
```

## 흔한 실수와 문제 해결
- bisect 판정 스크립트가 빌드 실패나 의존성 문제로 실패하면 그 커밋이 bad로 찍혀 엉뚱한 범인이 나온다. 시험할 수 없는 경우를 구분해 `exit 125`로 건너뛴다.
- 판정 스크립트를 저장소에서 추적하는 파일로 두면 옛 커밋을 체크아웃할 때 그 시점의 버전으로 바뀌거나 사라진다. 위처럼 저장소 밖에 둔다.
- 중간에 멈추면 `git bisect log > bisect.txt`로 기록을 남기고 `git bisect replay`로 이어 간다. 끝나면 반드시 `git bisect reset`.
- `-S`가 아무것도 못 찾으면 개수가 바뀌지 않는 수정일 수 있다. `-G`로 바꿔 본다.

## 권장 설정
```bash
git config --global log.date iso
git config --global alias.lg "log --oneline --graph --decorate"
git config blame.ignoreRevsFile .git-blame-ignore-revs
```
서식 정리 커밋은 기능 변경과 섞지 말고 따로 만든 뒤 `.git-blame-ignore-revs`에 등록한다. 커밋마다 빌드되고 테스트가 통과하는 이력(6편의 fixup 정리)이 bisect를 믿을 수 있게 한다.

## 숫자로 보기
| 후보 커밋 수 | bisect 시험 횟수(약) |
| --- | --- |
| 63 (이 글) | 6 |
| 1,000 | 10 |
| 100,000 | 17 |

## 한계와 버전별 차이
- 이 글의 실행 결과는 Git 2.43 기준이다. blame의 `--ignore-rev`, `--ignore-revs-file`과 `blame.ignoreRevsFile` 설정은 2.23에 들어왔다.
- bisect는 버그가 한 커밋에서 생겨 그 뒤로 계속 남는다고 가정한다. 간헐적으로 실패하는 테스트로는 범인이 흔들리므로 판정을 여러 번 돌려 확정한다.
- 병합 커밋이 많은 이력에서는 bisect가 병합 커밋을 범인으로 지목할 수 있다. 그때는 그 병합의 두 부모 쪽을 다시 살핀다.

## 어디에 쓰이나
- 알고리즘 기법 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」: bisect는 "이 커밋에서 버그가 있는가"라는 단조로운 판정 함수로 하는 매개 변수 탐색이다.
- 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」: 커밋을 하나씩 보는 O(N) 대신 O(log N)번 시험한다는 차이가 후보 10만 개에서 17번으로 나타난다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 커밋마다 CI가 테스트를 돌려 두면 bisect를 하기 전에 대부분의 범인이 CI 기록에서 바로 보인다.

## 정리
- `git log`는 경로, 작성자, 시간, 메시지, 내용(`-S`·`-G`)으로 커밋을 걸러 내는 질의 도구다.
- `git blame`은 줄의 마지막 변경을 보여 주고, `-w`와 `.git-blame-ignore-revs`로 서식 커밋을 건너뛴다.
- `git bisect run`은 종료 코드로 판정하는 스크립트만 있으면 log₂N번 시험으로 버그를 넣은 커밋을 찾는다.
- `git grep`은 추적 중인 파일과 과거 시점의 파일을 체크아웃 없이 검색한다.

## 더 알아보기
- 이전 글: 8편 「되돌리기: restore, reset, revert, reflog」
- 다음 글: 10편 「stash, worktree, cherry-pick: 작업을 잠시 두고, 나누고, 옮기기」
- Git 공식 문서 git-bisect: https://git-scm.com/docs/git-bisect
