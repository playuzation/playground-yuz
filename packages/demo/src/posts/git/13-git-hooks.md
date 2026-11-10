# [Git 버전 관리 13/14] Git 훅: 커밋과 푸시 전에 자동으로 검사하기

> **한 줄 요약** — 훅은 Git이 커밋·push 같은 순간에 실행하는 실행 파일이고 0이 아닌 종료 코드로 그 동작을 멈출 수 있지만, 클라이언트 훅은 저장소에 실려 오지 않고 `--no-verify`로 건너뛸 수 있으므로 반드시 지켜야 할 규칙은 서버 훅이나 CI에 둔다.

## 이 글에서 다루는 것
- 훅의 동작 원리: 이름, 시점, 입력, 종료 코드
- pre-commit, commit-msg, pre-push를 직접 작성해 거부되는 것 확인하기
- 훅이 커밋되지 않는 이유와 `core.hooksPath`로 공유하기
- 서버 훅 pre-receive로 push 거부하기, `--no-verify`와 CI의 역할

## 문제: 리뷰에서 매번 같은 지적
"`console.log` 지워 주세요", "커밋 메시지 형식이 틀렸어요", "main에 직접 push하면 안 돼요". 사람이 리뷰에서 반복하는 지적은 기계가 먼저 하는 편이 싸다. Git은 정해진 순간에 저장소의 스크립트를 실행하는 **훅**(hook)을 제공한다. 실패를 커밋 순간에 알려 주면 고치는 비용이 가장 작다.

## 원리: 이름이 곧 시점이다
훅은 `.git/hooks/` 안에 정해진 이름으로 둔 **실행 가능한** 파일이다. 언어는 상관없다(첫 줄의 `#!`로 고른다). Git은 그 시점에 훅을 실행하고, 동작 전에 도는 훅(pre-commit, commit-msg, pre-push 등)이 0이 아닌 값으로 끝나면 동작을 멈춘다. `post-`로 시작하는 훅(post-commit, post-checkout 등)은 이미 일어난 일 뒤에 돌아서 막지 못한다. `git init`은 예제 파일을 넣어 둔다.
```bash
git init -q app && cd app
echo "# app" > README.md && git add README.md
git commit -q -m "docs: readme"
ls .git/hooks
```
```text
applypatch-msg.sample
commit-msg.sample
...
pre-push.sample
pre-rebase.sample
pre-receive.sample
...
```
`.sample` 확장자가 붙어 있어 아무것도 실행되지 않는다. 자주 쓰는 훅과 입력은 다음과 같다.

| 훅 | 시점 | 입력 |
| --- | --- | --- |
| pre-commit | 메시지 입력 전 | 없음(스테이징 영역 검사) |
| commit-msg | 메시지 작성 후 | `$1` 메시지 파일 |
| pre-push | 전송 직전 | 표준 입력의 참조 목록 |
| pre-receive | 서버의 참조 갱신 전 | 표준 입력의 참조 목록 |

`git commit`은 pre-commit → prepare-commit-msg → commit-msg → post-commit 순서로 훅을 부른다.

## pre-commit: 커밋될 내용을 검사한다
`.js` 파일에 `console.log`가 남아 있으면 거부하는 훅이다. 검사 대상이 작업 트리가 아니라 **스테이징 영역**(커밋될 내용)이라는 점이 중요해서 `git grep --cached`를 쓴다. 먼저 흔한 실수를 하나 넣어 둔다. 실행 권한을 주지 않았다.
```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
# 커밋될 .js에 console.log가 있으면 거부한다
if git grep --cached -n 'console\.log' -- '*.js'; then
  echo "pre-commit: console.log를 지우고 다시 커밋하세요" >&2
  exit 1
fi
EOF
printf 'const x = 1;\nconsole.log(x);\n' > app.js
git add app.js && git commit -q -m "feat: add app"
```
```text
hint: The '.git/hooks/pre-commit' hook was ignored because it's not set as executable.
hint: You can disable this warning with `git config advice.ignoredHook false`.
```
검사 없이 커밋이 되어 버렸다. 커밋을 되돌리고(8편) 실행 권한을 준 뒤 다시 커밋한다.
```bash
git reset -q --soft HEAD~1
chmod +x .git/hooks/pre-commit
git commit -q -m "feat: add app"; echo "종료 코드 $?"
```
```text
app.js:2:console.log(x);
pre-commit: console.log를 지우고 다시 커밋하세요
종료 코드 1
```
훅이 스테이징 영역을 본다는 것을 확인하자. 작업 트리에서만 지우면 커밋될 내용은 그대로이므로 여전히 거부되어야 한다.
```bash
sed -i '/console/d' app.js        # 작업 트리만 고침
git commit -q -m "feat: add app"; echo "종료 코드 $?"
git add app.js && git commit -q -m "feat: add app" && git log --oneline -1
```
```text
app.js:2:console.log(x);
pre-commit: console.log를 지우고 다시 커밋하세요
종료 코드 1
f267e43 feat: add app
```
작업 트리의 파일을 `grep`하는 훅이었다면 첫 커밋을 통과시켰을 것이다. 고친 내용을 `add`해야 통과한다. 해시는 여러분의 환경에서 다르게 나온다.

## commit-msg: 메시지 형식 검사
commit-msg 훅은 메시지가 담긴 임시 파일 경로를 `$1`로 받는다. 11편의 Conventional Commits 형식을 강제해 보자.
```bash
cat > .git/hooks/commit-msg <<'EOF'
#!/bin/sh
# $1: 커밋 메시지가 담긴 파일
types='feat|fix|docs|refactor|test|chore'
head -1 "$1" | grep -qE "^($types)(\([a-z0-9-]+\))?!?: .+" && exit 0
echo "commit-msg: 제목은 '<type>(<scope>): <설명>' 형식으로" >&2
exit 1
EOF
chmod +x .git/hooks/commit-msg
echo "a" > a.txt && git add a.txt
git commit -q -m "update stuff"
git commit -q -m "chore(repo): add a.txt" && git log --oneline -1
```
```text
commit-msg: 제목은 '<type>(<scope>): <설명>' 형식으로
c65b670 chore(repo): add a.txt
```
그런데 클라이언트 훅은 사용자가 끌 수 있다. `--no-verify`(`-n`)는 pre-commit과 commit-msg를 모두 건너뛴다.
```bash
echo 'console.log("wip")' >> app.js && git add app.js
git commit -q --no-verify -m "wip" && git log --oneline -1
git reset -q --hard HEAD~1
```
```text
c33e308 wip
```
급할 때의 탈출구로 필요하지만, 훅만 믿으면 규칙은 언제든 깨진다는 뜻이기도 하다.

## 훅은 저장소에 실려 오지 않는다
`.git/` 안은 커밋되지 않으므로 클론하면 훅이 따라오지 않는다. 클론만으로 남의 스크립트가 내 PC에서 실행된다면 그 자체가 보안 구멍이기 때문이다. 팀이 훅을 공유하려면 훅을 저장소의 일반 폴더에 커밋하고, 각자 `core.hooksPath`로 그 폴더를 가리키게 한다.
```bash
mkdir .githooks && mv .git/hooks/pre-commit .git/hooks/commit-msg .githooks/
git config core.hooksPath .githooks
git add .githooks && git commit -q -m "chore: share hooks"
git clone -q . ../teammate && cd ../teammate
ls .githooks; git config core.hooksPath; echo "종료 코드 $?"
git commit -q --allow-empty -m "bad message" && git log --oneline -1
git config core.hooksPath .githooks
git commit -q --allow-empty -m "bad message"
```
```text
commit-msg
pre-commit
종료 코드 1
dbaa774 bad message
commit-msg: 제목은 '<type>(<scope>): <설명>' 형식으로
```
실행 비트도 커밋되므로 훅 파일은 그대로 왔지만, 설정이 없는 동안에는 형식이 틀린 커밋이 통과했다. 설정은 각자 해야 하니 프로젝트의 설치 스크립트나 README에 이 한 줄을 넣는다. 아래에 나오는 도구들이 이 과정을 자동화한다.

## pre-push와 서버 훅 pre-receive
pre-push는 전송 직전에 돌고, 표준 입력으로 `<로컬 참조> <로컬 해시> <원격 참조> <원격 해시>` 줄을 받는다. main으로 가는 push를 막아 보자.
```bash
cd ../app
cat > .githooks/pre-push <<'EOF'
#!/bin/sh
while read lref loid rref roid; do
  if [ "$rref" = refs/heads/main ]; then
    echo "pre-push: main에 직접 push하지 말고 PR을 여세요" >&2
    exit 1
  fi
done
EOF
chmod +x .githooks/pre-push
git init -q --bare ../server.git && git remote add origin ../server.git
git push -q origin main
git push -q origin main:feat/hooks && git ls-remote --heads origin | cut -f2
```
```text
pre-push: main에 직접 push하지 말고 PR을 여세요
error: failed to push some refs to '../server.git'
refs/heads/feat/hooks
```
이것도 `git push --no-verify`면 건너뛴다. 건너뛸 수 없는 검사는 받는 쪽에 둔다. 서버의 **pre-receive** 훅은 받은 객체를 임시로 보관한 채 실행되고, 실패하면 참조를 하나도 갱신하지 않는다. 1MB가 넘는 파일이 새로 들어오는 push를 거부하는 훅을 bare 저장소에 건다. `--not --all`은 서버에 이미 있는 객체를 빼고 이번 push로 들어오는 객체만 남긴다.
```bash
cat > ../server.git/hooks/pre-receive <<'EOF'
#!/bin/sh
zero=0000000000000000000000000000000000000000
while read old new ref; do
  [ "$new" = "$zero" ] && continue      # 브랜치 삭제
  git rev-list --objects "$new" --not --all |
  git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' |
  awk '$1 == "blob" && $2 > 1000000 { bad = 1
         print "pre-receive: " $3 " " $2 "바이트, 한도 1MB" }
       END { exit bad }' >&2 || exit 1
done
EOF
chmod +x ../server.git/hooks/pre-receive
head -c 2000000 /dev/zero > big.bin && git add big.bin
git commit -q -m "chore: add big.bin"
git push -q --no-verify origin HEAD:feat/big
```
```text
remote: pre-receive: big.bin 2000000바이트, 한도 1MB
To ../server.git
 ! [remote rejected] HEAD -> feat/big (pre-receive hook declined)
error: failed to push some refs to '../server.git'
```
훅의 표준 오류가 `remote:` 줄로 돌아왔고, `--no-verify`로도 피할 수 없었다. GitHub에서 이런 사용자 정의 서버 훅은 GitHub Enterprise Server의 사이트 관리자가 거는 기능이고, github.com 저장소에서는 브랜치 보호·규칙 세트와 CI가 그 역할을 한다.

## 도구와 권장 설정
- pre-commit 프레임워크(파이썬)는 `.pre-commit-config.yaml`에 `repos`·`rev`·`hooks`로 검사 도구를 버전과 함께 적고, `pre-commit install`이 `.git/hooks/pre-commit`을 써 넣는다. husky(npm)는 `package.json`의 `prepare` 스크립트로 `npm install` 때 `core.hooksPath`를 자기 폴더로 바꾼다. 둘 다 "각자 설정해야 하는" 단계를 설치 과정에 숨긴 것이다.
- 훅은 몇 초 안에 끝나게 하고, 바뀐 파일만 검사한다. 느린 훅은 결국 `--no-verify` 습관을 만든다.
- 훅과 CI가 같은 명령(예: `npm run lint`)을 부르게 해 규칙을 한곳에 둔다. 훅은 빠른 경고, CI는 최종 관문이다.
- 검사는 스테이징 영역을 기준으로 하고, 훅이 파일을 고쳐 다시 `add`하는 동작은 부분 스테이징과 충돌하므로 조심한다.

## 한계와 버전별 차이
클라이언트 훅은 설치를 강제할 수 없고 끌 수 있으며, 실행 환경(셸, 설치된 도구)이 사람마다 다르다. 서버 훅은 호스팅 서비스가 허용할 때만 쓸 수 있다. 실행 권한이 없는 훅을 알려 주는 힌트처럼 메시지 문구는 버전마다 다를 수 있다(이 글은 Git 2.43 기준).

## 어디에 쓰이나
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 훅이 건너뛰어질 수 있으므로 같은 검사를 push마다 CI에서 다시 돌린다. 이 사이트 저장소도 의존 규칙 검사·테스트·빌드를 CI의 verify 잡에서 돌린다.
- GitHub 협업과 자동화 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」: 이 글의 pre-push·pre-receive가 흉내 낸 "main 직접 push 금지"를 서버 설정으로 강제한다.
- 12편 「큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS」: `git lfs install`이 거는 pre-push 훅이 포인터를 보내기 전에 큰 파일 내용을 올린다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 훅을 거부하는 신호는 프로세스의 종료 코드이고, 실행 권한과 `#!` 줄로 프로그램을 고르는 것도 운영체제의 실행 규칙이다.

## 정리
- 훅은 `.git/hooks`(또는 `core.hooksPath`)의 실행 파일이고, 동작 전에 도는 훅의 0이 아닌 종료 코드가 동작을 멈춘다. 실행 권한이 없으면 힌트만 내고 건너뛴다.
- pre-commit은 작업 트리가 아니라 스테이징 영역을, commit-msg는 `$1` 파일을, pre-push와 pre-receive는 표준 입력의 참조 목록을 검사한다.
- 훅은 클론되지 않으므로 폴더에 커밋하고 `core.hooksPath`로 공유하며, 클라이언트 훅은 `--no-verify`로 건너뛸 수 있다.
- 반드시 지킬 규칙은 서버 훅이나 브랜치 보호와 CI에 둔다.

## 더 알아보기
- 이전 글: 12편 「큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS」
- 다음 글: 14편 「설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응」
- Git 문서 githooks: https://git-scm.com/docs/githooks
