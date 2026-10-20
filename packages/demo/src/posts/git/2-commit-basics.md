# [Git 버전 관리 2/14] 커밋의 기본: 작업 트리, 스테이징 영역, 저장소

> **한 줄 요약** — `git status`와 `git diff`는 HEAD·인덱스·작업 트리 세 곳을 두 쌍으로 비교한 결과이고, 커밋에는 작업 트리가 아니라 인덱스에 올린 내용만 들어가므로, 스테이징을 이해하면 한 주제의 깔끔한 커밋을 골라 만들 수 있다.

## 이 글에서 다루는 것
- `git status`의 짧은 형식 두 칸이 비교하는 것
- `git diff`와 `git diff --staged`, 파일 일부만 스테이징하는 `git add -p`
- 커밋에 스테이징된 내용만 들어가는지 확인하기
- 좋은 커밋 메시지, `git log`와 `git show`
- `.gitignore` 패턴, `git check-ignore -v`, 이미 추적 중인 파일과 `git rm --cached`

## 문제: 이번 커밋에 무엇이 들어갔나
가격 계산을 고치다가 디버그 출력을 한 줄 넣고, README도 손보고, 메모 파일도 하나 만들었다. 여기서 `git add .` 후 커밋하면 디버그 출력과 메모까지 이력에 남고, 커밋 하나에 주제가 셋이 섞여 리뷰도 되돌리기(8편)도 어려워진다. 실무의 커밋은 "무엇을 넣을지 고르는 일"이고, 그 도구가 스테이징 영역이다.

## 원리: 세 곳을 두 쌍으로 비교한다
1편의 세 영역에서 HEAD는 마지막 커밋의 스냅숏, 인덱스는 다음 커밋의 초안, 작업 트리는 디스크의 파일이다. 막 커밋한 직후에는 셋이 같다. `git status`는 이 셋을 두 번 비교해 보여 준다.
```text
HEAD (마지막 커밋)
  ↕  git diff --staged / 첫째 칸
인덱스 (스테이징 영역)
  ↕  git diff / 둘째 칸
작업 트리
```
짧은 형식 `git status -s`의 첫째 칸은 HEAD와 인덱스의 차이(커밋될 변경), 둘째 칸은 인덱스와 작업 트리의 차이(아직 스테이징 안 된 변경)다. `M`은 수정, `A`는 새로 추가, `D`는 삭제, `??`는 Git이 모르는(untracked) 파일이다. `git add`는 파일의 현재 내용을 인덱스에 복사할 뿐이라, 그 뒤에 또 고치면 두 칸이 모두 찬다.

## 따라 하기: 상태 읽기
가격 계산 파일과 README를 커밋한 저장소에서 시작한다(커밋 해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
mkdir shop && cd shop && git init -q
cat > app.py <<'EOF'
import sys

def price(n):
    return n * 1000

def tax(n):
    return n // 10

def main():
    print(price(int(sys.argv[1])))

main()
EOF
echo "# 가게" > README.md
git add . && git commit -qm "가격 계산 추가"
```
가격을 바꾸고, 디버그 출력을 넣고, README에 한 줄 쓰고, 메모를 만든다.
```bash
sed -i 's/n \* 1000/n * 1200/' app.py
sed -i '10i\    print("debug", sys.argv)' app.py
echo "- 가격 단위: 원" >> README.md
echo "할인 아이디어" > notes.txt
git status -s
```
```text
 M README.md
 M app.py
?? notes.txt
```
둘째 칸의 `M`은 고쳤지만 아직 스테이징하지 않았다는 뜻이다.

## 파일 일부만 스테이징하기: git add -p
`app.py`에는 가격 변경(넣을 것)과 디버그 출력(뺄 것)이 함께 있다. `git add -p`는 변경을 덩어리(hunk)로 보여 주고 하나씩 물어본다. 원래는 키보드로 답하지만, 여기서는 답을 파이프로 넣었다. `s`는 덩어리를 더 잘게 나누기, `y`는 스테이징, `n`은 건너뛰기다.
```bash
printf 's\ny\nn\n' | git add -p app.py
```
```text
...
(1/1) Stage this hunk [y,n,q,a,d,s,e,?]? Split into 2 hunks.
@@ -1,9 +1,9 @@
...
-    return n * 1000
+    return n * 1200
...
(1/2) Stage this hunk [y,n,q,a,d,j,J,g,/,e,?]? @@ -5,8 +5,9 @@
...
+    print("debug", sys.argv)
...
(2/2) Stage this hunk [y,n,q,a,d,K,g,/,e,?]?
```
README도 스테이징한 다음, 깜빡한 줄을 하나 더 쓴다.
```bash
git add README.md
echo "- 부가세 별도" >> README.md
git status -s
```
```text
MM README.md
MM app.py
?? notes.txt
```
두 파일 모두 `MM`이다. 일부는 인덱스에 올라갔고 일부는 작업 트리에만 있다. 무엇이 커밋될지는 `git diff --staged`(같은 뜻의 `--cached`)로, 아직 남은 것은 `git diff`로 본다.
```bash
git diff --staged
```
```text
diff --git a/README.md b/README.md
index 7e38a18..c5aabc3 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # 가게
+- 가격 단위: 원
diff --git a/app.py b/app.py
index ea65e7f..ca8c13b 100644
--- a/app.py
+++ b/app.py
@@ -1,7 +1,7 @@
 import sys
 
 def price(n):
-    return n * 1000
+    return n * 1200
 
 def tax(n):
     return n // 10
```
```bash
git diff --stat
```
```text
 README.md | 1 +
 app.py    | 1 +
 2 files changed, 2 insertions(+)
```
커밋될 변경은 가격과 단위 안내뿐이고, 디버그 출력과 "부가세 별도"는 작업 트리에만 있다. `index ea65e7f..ca8c13b` 같은 줄의 두 값은 변경 전과 후(여기서는 인덱스에 올라간 판) 파일 내용의 객체 ID다(3편).

## 검증: 커밋에는 스테이징된 내용만 들어간다
제목과 본문을 `-m` 두 번으로 나눠 커밋하고, 커밋 안의 `app.py`와 작업 트리의 `app.py`를 비교한다. `HEAD:app.py`는 HEAD 스냅숏 안의 그 파일이다.
```bash
git commit -m "가격을 1,200원으로 인상" \
  -m "원가 상승분을 반영하고 README에 가격 단위를 적는다."
git show HEAD:app.py | grep -c debug
grep -c debug app.py
git status -s
```
```text
[main 6798036] 가격을 1,200원으로 인상
 2 files changed, 2 insertions(+), 1 deletion(-)
0
1
 M README.md
 M app.py
?? notes.txt
```
커밋 안에는 debug가 0번, 작업 트리에는 1번 나온다. 커밋은 작업 트리가 아니라 인덱스의 스냅숏이다. 남은 변경은 여전히 둘째 칸에 있다.

## 좋은 커밋 메시지
```bash
git log --oneline --graph --decorate
git show --stat HEAD
```
```text
* 6798036 (HEAD -> main) 가격을 1,200원으로 인상
* d90b9da 가격 계산 추가
commit 679803693c928b4bfe8b2ed108a67652ffcb9497
Author: Dev Kim <dev@example.com>
Date:   Mon Mar 2 09:10:00 2026 +0900

    가격을 1,200원으로 인상
    
    원가 상승분을 반영하고 README에 가격 단위를 적는다.

 README.md | 1 +
 app.py    | 2 +-
 2 files changed, 2 insertions(+), 1 deletion(-)
```
관례는 이렇다. 제목은 50자 안팎으로 무엇을 했는지, 빈 줄 하나, 본문은 72자 안팎에서 줄을 바꿔 왜 했는지를 쓴다(한글은 폭이 넓으니 더 짧게). 영어라면 "Fix", "Add"처럼 명령형으로 쓰는 것이 Git 프로젝트 자신의 관례다. 짧은 제목은 `--oneline`과 웹 화면에서 잘리지 않는다. 무엇보다 한 커밋에는 한 주제만 담는다. 그래야 리뷰가 쉽고, 문제가 생기면 그 커밋만 되돌리며, 9편의 `bisect`가 범인 커밋을 정확히 짚는다. 팀 단위 메시지 규칙(Conventional Commits)은 11편, 규칙을 자동으로 검사하는 commit-msg 훅은 13편에서 다룬다.

## .gitignore: 처음부터 추적하지 않을 파일
빌드 결과, 로그, 비밀 값이 든 설정은 저장소에 들어가면 안 된다. `.gitignore`의 각 줄은 패턴이다. `*.log`는 모든 폴더의 로그, `build/`처럼 끝의 `/`는 폴더만, `/build/`처럼 앞의 `/`는 `.gitignore`가 있는 폴더 기준, `!`는 예외로 다시 포함이다. 어떤 규칙이 걸렸는지는 `git check-ignore -v`로 확인한다(`-n`은 안 걸린 경로도 보여 준다).
```bash
printf '%s\n' '*.log' '/build/' '__pycache__/' > .gitignore
mkdir -p build src/build
touch debug.log build/app src/build/app
git check-ignore -v -n debug.log build/app src/build/app
```
```text
.gitignore:1:*.log	debug.log
.gitignore:2:/build/	build/app
::	src/build/app
```
`/build/`는 맨 위 `build`만 걸고 `src/build`는 걸지 않았다. 형식은 `파일:줄:패턴`과 경로이고, 안 걸리면 `::`이다.

## 흔한 실수와 문제 해결
스테이징한 것이 없으면 커밋이 거부된다. 위에서 남겨 둔 변경만 있는 상태에서 커밋해 보자.
```bash
git commit -m "디버그 출력 정리"
```
```text
On branch main
Changes not staged for commit:
...
no changes added to commit (use "git add" and/or "git commit -a")
```
`git commit -a`는 추적 중인 파일의 변경을 전부 스테이징하고 커밋하지만, `notes.txt` 같은 새 파일은 넣지 않는다. 편하지만 디버그 출력까지 휩쓸어 가므로 `git diff`를 본 뒤에 쓴다.

가장 흔한 실수는 이미 커밋한 파일을 나중에 `.gitignore`에 넣는 것이다. 무시 규칙은 추적하지 않는 파일에만 적용된다.
```bash
echo "API_KEY=example-key" > config.env
git add config.env && git commit -qm "설정 파일 추가"
echo '*.env' >> .gitignore
echo "API_KEY=example-key-2" > config.env
git status -s config.env
git check-ignore -v config.env || echo "규칙 적용 안 됨"
```
```text
 M config.env
규칙 적용 안 됨
```
규칙을 넣었는데도 변경이 보이고 `check-ignore`도 아무것도 찾지 않는다. 인덱스에서만 빼야(`--cached`) 무시가 시작되고, 디스크의 파일은 남는다.
```bash
git rm --cached config.env
git status -s config.env .gitignore
git check-ignore -v config.env
ls config.env
```
```text
rm 'config.env'
D  config.env
?? .gitignore
.gitignore:4:*.env	config.env
config.env
```
`D`는 다음 커밋에서 이 파일이 빠진다는 뜻이고, `.gitignore` 자체는 팀이 같은 규칙을 쓰도록 함께 커밋한다. 커밋하면 이후 스냅숏에서는 사라지지만, 과거 커밋에는 그대로 남는다. 비밀 값이었다면 이력에서 지우기 전에 먼저 키를 폐기·교체해야 한다(14편).

## 권장 설정과 체크리스트
- 커밋 전에 `git diff --staged`를 본다. `git config --global commit.verbose true`를 켜면 편집기에서 메시지를 쓸 때 커밋될 diff가 함께 보인다.
- 운영체제·편집기 파일(`.DS_Store`, `.idea/`)은 프로젝트가 아니라 개인 전역 무시 파일(`core.excludesFile`)에, 빌드 결과·로그처럼 프로젝트에 속한 것은 `.gitignore`에 둔다.
- `git add .` 대신 경로를 지정하거나 `git add -p`로 고른다. IDE의 줄 단위 스테이징도 같은 일을 한다.

## 한계와 버전별 차이
- `git add -p`는 대화형이라 스크립트에는 맞지 않는다. 새 파일은 덩어리가 없어 `git add -N`(추가 의도만 기록)을 먼저 해야 `-p`로 고를 수 있다.
- 스테이징 취소는 Git 2.23부터 `git restore --staged`가 권장되고, 예전 문서의 `git reset HEAD <파일>`과 같은 일을 한다(8편).
- 이 글의 출력은 Git 2.43 기준이다. 메시지 문구는 버전에 따라 조금씩 다르다.

## 어디에 쓰이나
- 동적 계획법 4편 「LCS와 편집 거리: 두 문자열을 맞추는 DP」: `git diff`는 두 파일의 줄을 맞춰 가장 짧은 추가·삭제 목록을 찾는 문제이고, Git의 기본 diff 알고리즘(Myers)은 그 최단 편집 스크립트를 빠르게 구한다.
- 도커와 컨테이너 4편 「Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT」: `.dockerignore`도 같은 생각의 패턴 파일로, 빌드 컨텍스트에서 뺄 파일을 정한다.
- GitHub 협업과 자동화 3편 「코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법」: 한 주제의 작은 커밋이 모여야 리뷰하기 좋은 작은 PR이 된다.

## 정리
- `git status -s`의 첫째 칸은 HEAD↔인덱스, 둘째 칸은 인덱스↔작업 트리이고, 각각 `git diff --staged`와 `git diff`로 내용을 본다.
- 커밋은 인덱스의 스냅숏이다. `git add -p`로 고른 덩어리만 커밋되고 나머지는 작업 트리에 남는다(debug 0번 대 1번).
- 메시지는 짧은 제목 + 빈 줄 + 이유를 쓴 본문, 한 커밋에 한 주제.
- `.gitignore`는 추적하지 않는 파일에만 듣는다. 이미 커밋한 파일은 `git rm --cached`로 인덱스에서 빼야 하고, 과거 이력에는 남는다.

## 더 알아보기
- 이전 글: 1편 「Git이란: 스냅숏으로 기록하는 분산 버전 관리」
- 다음 글: 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」
- gitignore 공식 문서: https://git-scm.com/docs/gitignore
