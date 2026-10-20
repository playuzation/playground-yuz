# [Git 버전 관리 7/14] 원격 저장소: clone, fetch, pull, push와 추적 브랜치

> **한 줄 요약** — `origin/main`은 마지막으로 통신했을 때 본 서버 브랜치의 위치일 뿐이라서 fetch는 내 브랜치를 건드리지 않고 push는 서버 브랜치를 앞으로만 옮기며, 덮어써야 할 때는 `--force`가 아니라 "내가 본 그대로일 때만" 덮어쓰는 `--force-with-lease`를 쓴다.

## 이 글에서 다루는 것
- 원격, `origin`, 원격 추적 브랜치의 정체와 refspec
- 두 사람 시나리오: clone → push → fetch → pull
- 갈라진 이력과 `pull.rebase`, `pull.ff only`
- push 거부와 `--force` 대 `--force-with-lease`의 차이
- 업스트림 설정(`-u`), 포크와 `upstream` 원격

## 문제: "내 브랜치는 최신이라는데"
Git은 분산 버전 관리라서(1편) 모든 클론이 이력 전체를 가진 저장소이고, 서버도 그중 하나일 뿐이다. 각자의 브랜치는 따로 움직이므로 `git status`가 "up to date"라는데 push가 거부되거나, 강제 push로 동료의 커밋을 지우는 사고가 난다. 원인은 대개 원격 추적 브랜치에 대한 오해다.

## 원리: 원격 추적 브랜치는 마지막으로 본 위치다
**원격**(remote)은 다른 저장소의 이름과 URL이다. clone하면 원본이 `origin`이라는 이름으로 등록되고, `refs/remotes/origin/` 아래에 **원격 추적 브랜치**(remote-tracking branch)가 생긴다. `origin/main`은 "마지막으로 서버와 통신했을 때 서버의 main이 가리키던 커밋"을 적어 둔 참조라서, 그 뒤에 서버가 움직여도 내 쪽은 그대로다.
- `git fetch`: 서버에서 내게 없는 객체를 받고 `origin/*`만 갱신한다. 내 브랜치와 작업 트리는 건드리지 않는다.
- `git push`: 내 커밋을 보내고 서버에게 브랜치를 옮겨 달라고 요청한다. 서버는 기본적으로 fast-forward(새 커밋이 옛 커밋을 조상으로 포함)일 때만 받아 준다.
- `git pull`: fetch한 뒤 현재 브랜치에 업스트림을 병합하거나 리베이스한다.

## 따라 하기: 서버 하나, 개발자 두 명
GitHub 대신 로컬 bare 저장소(작업 트리 없이 `.git` 내용만 있는 저장소)를 서버로 쓴다. 해시와 시각은 여러분의 환경에서 다르게 나오고, 경로는 `…`로 줄였다.
```bash
git init -q --bare server.git
git clone -q server.git alice && cd alice
git config user.name Alice
echo "v1" > app.txt
git add app.txt && git commit -qm "첫 버전"
git push -u origin main
```
```text
warning: You appear to have cloned an empty repository.
To …/server.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```
서버에 main이 생겼고, `-u` 덕분에 로컬 main이 `origin/main`을 업스트림으로 추적한다. 이 관계는 설정에 그대로 적힌다.
```bash
git config --get-regexp '^(remote|branch)\.'
```
```text
remote.origin.url …/server.git
remote.origin.fetch +refs/heads/*:refs/remotes/origin/*
branch.main.remote origin
branch.main.merge refs/heads/main
```
`fetch` 줄이 **refspec**이다. 서버의 `refs/heads/*`를 내 `refs/remotes/origin/*`로 받아 적으라는 뜻이고, 앞의 `+`는 fast-forward가 아니어도 갱신하라는 표시다. 이제 Bob이 clone하고, 그 뒤 Alice가 커밋을 하나 더 올린다.
```bash
cd .. && git clone -q server.git bob
cd alice
echo "v2" > app.txt && git commit -qam "두 번째 버전"
git push -q
cd ../bob && git config user.name Bob
git status -sb
```
```text
## main...origin/main
```
서버에는 "두 번째 버전"이 있는데 Bob의 `git status`는 뒤처졌다고 하지 않는다. Bob의 `origin/main`은 clone한 순간에 멈춰 있다. fetch해야 비로소 안다.
```bash
git fetch
git status -sb
cat app.txt
```
```text
From …/server
   0a2e202..4d9f973  main       -> origin/main
## main...origin/main [behind 1]
v1
```
`origin/main`만 앞으로 갔고 작업 트리는 여전히 v1이다. 받아 온 커밋을 내 브랜치에 반영하는 것은 병합이고, 여기서는 fast-forward다.
```bash
git merge -q origin/main && cat app.txt
```
```text
v2
```

## 갈라진 이력: push 거부와 pull
이번에는 둘이 동시에 커밋한다. Alice가 먼저 push하면 Bob의 push는 거부된다.
```bash
cd ../alice && git pull -q
echo "alice" > a.txt && git add a.txt && git commit -qm "Alice 작업"
git push -q
cd ../bob
echo "bob" > b.txt && git add b.txt && git commit -qm "Bob 작업"
git push
```
```text
To …/server.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to '…/server.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
...
```
서버의 main을 Bob의 커밋으로 옮기면 Alice의 커밋이 빠지므로(fast-forward가 아니다) 서버가 거절했다. 받아서 합쳐야 하는데, 설정 없이 `git pull`을 하면 Git 2.43은 방법을 고르라며 멈춘다.
```bash
git pull
```
```text
From …/server
   4d9f973..6d10f74  main       -> origin/main
hint: You have divergent branches and need to specify how to reconcile them.
hint: You can do so by running one of the following commands sometime before
hint: your next pull:
hint:
hint:   git config pull.rebase false  # merge
hint:   git config pull.rebase true   # rebase
hint:   git config pull.ff only       # fast-forward only
hint:
...
fatal: Need to specify how to reconcile divergent branches.
```
fetch까지는 끝났다. 병합(`--no-rebase`), 리베이스(`--rebase`), fast-forward만 허용(`--ff-only`) 중에서 고른다. 아직 push하지 않은 내 커밋만 다시 쌓는 리베이스(6편)를 고르면 이력이 일직선이 된다.
```bash
git pull --rebase
git push -q
git log --oneline --format='%h %an %s'
```
```text
...
Successfully rebased and updated refs/heads/main.
c319ff1 Bob Bob 작업
6d10f74 Alice Alice 작업
4d9f973 Alice 두 번째 버전
0a2e202 Alice 첫 버전
```
매번 고르지 않으려면 `pull.rebase true`(갈라지면 리베이스)나 `pull.ff only`(앞으로 가기만 하고, 갈라지면 멈춰서 사람이 판단)를 설정해 둔다.

## 강제 push: `--force`와 `--force-with-lease`
Bob이 이미 push한 "Bob 작업"의 메시지를 `--amend`로 고쳤다(8편). 커밋이 새로 만들어졌으니 강제 push가 필요하다. 그 사이 Alice는 새 커밋을 올렸다.
```bash
git commit -q --amend -m "Bob 작업: b.txt 추가"
cd ../alice && git pull -q
echo "hotfix" >> a.txt && git commit -qam "Alice 긴급 수정"
git push -q
cd ../bob
git push --force-with-lease
```
```text
To …/server.git
 ! [rejected]        main -> main (stale info)
error: failed to push some refs to '…/server.git'
```
`--force-with-lease`는 "서버의 main이 아직 내 `origin/main`과 같을 때만 덮어써라"라는 조건부 갱신이다. Bob이 마지막으로 본 뒤 Alice가 서버를 옮겼으므로 `stale info`로 거부되었다.

그런데 기준이 `origin/main`이라는 점이 함정이다. IDE가 뒤에서 `git fetch`를 해 두면 Bob이 본 적도 없는 커밋으로 조건이 맞아 버린다. 자동 fetch를 흉내 내고 `--dry-run`으로 결과만 보자.
```bash
git fetch -q
git push --force-with-lease --dry-run
git push --force-with-lease --force-if-includes
```
```text
To …/server.git
 + 96d7336...9011918 main -> main (forced update)
To …/server.git
 ! [rejected]        main -> main (remote ref updated since checkout)
error: failed to push some refs to '…/server.git'
hint: Updates were rejected because the tip of the remote-tracking branch has
hint: been updated since the last checkout. If you want to integrate the
...
```
`--force-with-lease`만으로는 통과해서 Alice의 커밋을 지웠을 것이다(`forced update`). `--force-if-includes`(2.30부터)는 원격 추적 브랜치의 끝 커밋이 내 브랜치의 reflog 기록 어딘가에서 닿는지, 즉 한 번이라도 내 브랜치에 통합한 적이 있는지까지 확인하므로, fetch만 하고 통합하지 않은 커밋이 있으면 거부한다. `--force`는 이런 확인을 하나도 하지 않는다.
```bash
git push --force
git -C ../server.git log --oneline -3
```
```text
To …/server.git
 + 96d7336...9011918 main -> main (forced update)
9011918 Bob 작업: b.txt 추가
6d10f74 Alice 작업
4d9f973 두 번째 버전
```
서버 이력에서 "Alice 긴급 수정"이 사라졌다. Alice의 로컬에는 남아 있지만, 이제 서버에서 받는 사람들과 CI는 지워진 이력을 본다.

## 업스트림, 포크, upstream 원격
`git push -u origin <브랜치>`는 push와 함께 업스트림을 설정해 인자 없는 `git pull`·`git push`와 앞뒤 커밋 수 표시가 동작하게 한다(새 브랜치마다 하기 귀찮으면 `push.autoSetupRemote`). 앞뒤 커밋 수는 `git status -sb`나 `git branch -vv`로 보는데, 이것도 마지막 fetch 기준이다.
```bash
git switch -qc feature
echo "x" > x.txt && git add x.txt && git commit -qm "기능 시작"
git push -qu origin feature
echo "y" > y.txt && git add y.txt && git commit -qm "기능 계속"
git status -sb
```
```text
## feature...origin/feature [ahead 1]
```
원본에 쓰기 권한이 없는 오픈 소스에서는 GitHub에서 **포크**(fork)를 만들어 내 계정의 저장소로 push한다. 원격이 둘이 되고, 관례상 내 포크가 `origin`, 원본이 `upstream`이다(GitHub 계정이 필요한 예시).
```sh
git clone https://github.com/me/example-app.git && cd example-app
git remote add upstream https://github.com/example-org/example-app.git
git fetch upstream
git switch -c fix-typo upstream/main
git push -u origin fix-typo
```
원본의 최신 변경은 `upstream`에서 받고, 내 작업은 `origin`에 올려 풀 리퀘스트를 연다(GitHub 협업과 자동화 2편). HTTPS·SSH 인증과 토큰은 GitHub 협업과 자동화 1편에서 다룬다.

## 흔한 실수와 문제 해결
- `(fetch first)`·`(non-fast-forward)`: 서버에 내게 없는 커밋이 있다. `git pull --rebase` 후 다시 push한다. 강제 push로 풀지 않는다.
- `(stale info)`·`(remote ref updated since checkout)`: 내가 본 뒤 서버가 움직였다. 바뀐 내용을 보고 통합한 뒤 다시 시도한다.
- 강제 push로 지운 커밋: 그 커밋을 가진 사람의 reflog(8편)에서 찾아 다시 올린다. 근본 대책은 서버의 브랜치 보호로 강제 push를 막는 것이다(GitHub 협업과 자동화 5편).
- "up to date"를 믿기 전에 `git fetch`부터 한다.

## 권장 설정
```bash
git config --global pull.rebase true
git config --global push.autoSetupRemote true
git config --global alias.pushf \
  "push --force-with-lease --force-if-includes"
```
`push.default`는 2.0부터 `simple`(현재 브랜치를 같은 이름의 업스트림에만)이 기본이라 따로 바꿀 필요가 없다. 공유 브랜치에는 강제 push를 쓰지 않는다.

## 한계와 버전별 차이
- 이 글의 실행 결과는 Git 2.43 기준이다. `--force-with-lease`는 1.8.5, `--force-if-includes`는 2.30에 들어왔다.
- 설정 없는 `git pull`이 갈라진 이력에서 멈추는 것은 비교적 최근 동작이다. 예전에는 조용히 병합 커밋을 만들었고, 2.27부터 경고가 붙었다.
- 원격 추적 브랜치는 서버에서 지워진 브랜치를 자동으로 지우지 않는다. `git fetch --prune` 또는 `fetch.prune true`로 정리한다.

## 어디에 쓰이나
- CPU 마이크로아키텍처 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」: `--force-with-lease`는 "기대값과 같을 때만 바꾼다"는 비교 후 교환(CAS)을 브랜치 참조에 적용한 것이다.
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: push가 fast-forward인지는 새 커밋에서 부모를 따라가 옛 커밋에 닿는지를 보는 도달 가능성 문제다.
- GitHub 협업과 자동화 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」: 강제 push 금지와 필수 검사가 이 글의 사고를 서버 쪽에서 막는다.

## 정리
- `origin/main`은 마지막 통신 때 본 서버 브랜치의 위치다. fetch해야 갱신되고, fetch는 내 브랜치와 작업 트리를 건드리지 않는다.
- push는 서버 브랜치를 fast-forward로만 옮긴다. 거부되면 pull(병합 또는 리베이스)로 통합한 뒤 다시 push한다.
- `--force`는 남의 커밋을 지울 수 있다. `--force-with-lease`는 내가 본 그대로일 때만 덮어쓰고, `--force-if-includes`가 자동 fetch의 함정을 막는다.
- 업스트림은 `-u`로 설정하고, 포크에서는 `origin`(내 포크)과 `upstream`(원본)을 함께 쓴다.

## 더 알아보기
- 이전 글: 6편 「리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙」
- 다음 글: 8편 「되돌리기: restore, reset, revert, reflog」
- Git 공식 문서 git-push: https://git-scm.com/docs/git-push
