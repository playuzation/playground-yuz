# [Git 버전 관리 14/14] 설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응

> **한 줄 요약** — Git 설정은 시스템·전역·저장소 세 겹이 겹쳐 가까운 쪽이 이기고 `includeIf`로 폴더마다 다른 신원을 쓸 수 있으며, 서명은 커밋 내용 전체를 묶어 위조를 드러내고, 비밀을 커밋했다면 이력 정리보다 키 폐기가 먼저다.

## 이 글에서 다루는 것
- 설정 범위와 `--show-origin`, 유용한 별칭
- `includeIf "gitdir:…"`로 회사·개인 계정 나누기
- GPG 커밋 서명과 검증, 내용을 바꾸면 서명이 깨지는 것 확인, SSH 서명
- 자격 증명 도우미
- 사고 복구: 비밀 유출, 잘못된 브랜치에 커밋, 큰 파일

## 설정은 세 겹이다
`git config`는 세 파일을 차례로 읽는다. 시스템(`/etc/gitconfig`, `--system`), 사용자 전역(`~/.gitconfig`, `--global`), 저장소(`.git/config`, `--local`)이고, 같은 키는 나중에 읽은 가까운 쪽이 이긴다. "왜 커밋 작성자가 이 주소지?"라는 질문에는 값이 어느 파일에서 왔는지 보여 주는 `--show-origin`과 `--show-scope`가 답한다(해시와 시각, 경로는 여러분의 환경에서 다르게 나온다).
```bash
git init -q app && cd app
git config user.email kim@corp.example.com     # 이 저장소에만
git config --list --show-scope --show-origin | grep user.email
git config user.email
```
```text
global	file:…/.gitconfig	user.email=dev@example.com
local	file:.git/config	user.email=kim@corp.example.com
kim@corp.example.com
```
두 값이 모두 있고 저장소 값이 이겼다. **별칭**(alias)도 설정이다. 값이 `!`로 시작하면 Git 명령이 아니라 셸 명령이 되고, 저장소 최상위 폴더에서 실행된다.
```bash
git config --global alias.st "status -sb"
git config --global alias.last "log -1 --format='%h %s'"
git config --global alias.root '!pwd'
git commit -q --allow-empty -m "chore: init"
mkdir -p src/deep && cd src/deep
git last; git st; git root
```
```text
4bbb22b chore: init
## main
…/app
```
`src/deep`에서 불렀는데 `git root`가 최상위를 출력했다. 셸 별칭 안의 상대 경로는 최상위 기준이라는 뜻이다. 자주 쓰는 `log --oneline --graph --all`(4편) 같은 긴 명령을 별칭으로 두면 좋다.

## 조건부 설정: 회사와 개인 계정 나누기
회사 저장소에 개인 메일로 커밋하는 실수는 `includeIf`로 막는다. 저장소의 `.git` 위치가 패턴에 맞을 때만 다른 설정 파일을 끼워 넣는다. 패턴이 `/`로 끝나면 그 아래 모든 폴더에 맞는다.
```bash
cd ~ && mkdir -p work personal
cat >> ~/.gitconfig <<'EOF'
[includeIf "gitdir:~/work/"]
	path = ~/.gitconfig-work
EOF
git config --file ~/.gitconfig-work user.email kim@corp.example.com
git init -q work/api && git init -q personal/blog
git -C work/api config user.email
git -C personal/blog config user.email
git -C work/api config --show-origin user.email
```
```text
kim@corp.example.com
dev@example.com
file:…/.gitconfig-work	kim@corp.example.com
```
같은 전역 설정인데 폴더에 따라 신원이 바뀌었고, `--show-origin`이 끼워 넣은 파일을 보여 준다. 회사 저장소를 `~/work` 밖에 클론하면 적용되지 않으니 폴더 규칙을 팀에서 정해 둔다. 서명 키나 자격 증명도 같은 방식으로 나눌 수 있다.

## 커밋 서명: 누가 만들었는지 증명하기
커밋의 `author` 줄은 아무 이름이나 적을 수 있다. **커밋 서명**(commit signing)은 커밋 객체 내용을 개인 키로 서명해 `gpgsig` 헤더에 넣고, 공개 키를 가진 사람이 검증한다. 실습용 임시 키링에 비밀번호 없는 테스트 키를 만든다(실제 키에는 비밀번호를 건다).
```bash
export GNUPGHOME=$(mktemp -d)
gpg --batch --passphrase '' --quick-gen-key \
  "Dev Kim <dev@example.com>" ed25519 sign never 2>/dev/null
fpr=$(gpg --list-keys --with-colons dev@example.com 2>/dev/null |
      awk -F: '/^fpr/ {print $10; exit}')
cd ~/personal/blog
git config user.signingkey $fpr
git config commit.gpgSign true          # 모든 커밋에 서명
echo hi > a.txt && git add a.txt && git commit -q -m "feat: signed commit"
git cat-file -p HEAD | head -4
git log --show-signature -1 --format=%s
```
```text
tree 0d8a474fc67971fb3dd7616e26323d3066442555
author Dev Kim <dev@example.com> 1772410860 +0900
committer Dev Kim <dev@example.com> 1772410860 +0900
gpgsig -----BEGIN PGP SIGNATURE-----
gpg: Signature made …
gpg:                using EDDSA key …
gpg: Good signature from "Dev Kim <dev@example.com>" [ultimate]
feat: signed commit
```
서명 시각과 키 지문(fingerprint)은 실행마다 달라서 가렸다. 서명이 정말 내용을 묶는지 확인하자. 커밋 객체를 꺼내 메시지만 바꾸고 서명은 그대로 둔 위조 커밋을 만든다.
```bash
git cat-file commit HEAD |
  sed 's/signed commit/signed commit (forged)/' > forged.txt
forged=$(git hash-object -t commit -w forged.txt)
git verify-commit $forged; echo "종료 코드 $?"
git -c commit.gpgSign=false commit -q --allow-empty -m "chore: unsigned"
git log --format='%G? %s'
```
```text
gpg: Signature made …
gpg:                using EDDSA key …
gpg: BAD signature from "Dev Kim <dev@example.com>" [ultimate]
종료 코드 1
N chore: unsigned
G feat: signed commit
```
서명은 `gpgsig`를 뺀 나머지 내용 전체에 대한 것이라 메시지 한 글자만 바뀌어도 BAD가 된다. 트리 해시가 들어 있으니 파일 내용도 묶인다. `%G?`는 서명 상태를 G(정상), N(서명 없음) 등 한 글자로 보여 준다. 서명에는 서명 시각과 키가 들어가므로, 같은 내용을 다시 서명해 커밋하면 해시도 달라진다. SSH 키로도 서명할 수 있다(Git 2.34부터).
```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
echo "dev@example.com $(cat ~/.ssh/id_ed25519.pub)" > ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```
GitHub에 공개 키를 서명 키로 등록하면 커밋에 Verified 표시가 붙는다.

## 자격 증명 도우미
HTTPS 원격은 매번 토큰을 묻는 대신 **자격 증명 도우미**(credential helper)에 맡긴다. 가장 단순한 `store`는 편하지만 무엇을 하는지 보자.
```bash
git config --global credential.helper store
printf 'protocol=https\nhost=git.example.com\nusername=dev\npassword=example-password\n\n' |
  git credential approve
cat ~/.git-credentials; ls -l ~/.git-credentials | cut -c1-10
```
```text
https://dev:example-password@git.example.com
-rw-------
```
권한은 본인만 읽게 했지만 평문이다. 백업이나 dotfiles 저장소에 딸려 나가면 그대로 유출된다. 메모리에만 잠시 두는 `cache`나 운영체제 키체인을 쓰는 도우미(Git Credential Manager, macOS의 `osxkeychain`, 리눅스의 `libsecret`)를 쓴다.

## 사고 복구 1: 비밀을 커밋했을 때
순서가 중요하다. **먼저 키를 폐기하고 새 키로 바꾼다.** 한 번 push한 비밀은 이미 유출된 것으로 본다. 클론, 포크, CI 로그, 캐시에 사본이 남기 때문이다. 이력 정리는 그다음이다. push 전이라도 커밋을 고친다고 바로 지워지지 않는다.
```bash
cd ~/work/api
echo "API_KEY=example-secret-123" > .env && git add .env
git commit -q -m "chore: add config"
git rm -q --cached .env && echo ".env" > .gitignore
git add .gitignore && git commit -q --amend -m "chore: ignore .env"
git log --oneline --all -S example-secret | wc -l
git log --oneline --reflog -S example-secret
```
```text
0
df56fed chore: add config
```
브랜치 이력에서는 사라졌지만 옛 커밋은 reflog가 가리키고 있어 여전히 읽힌다(8편). 로컬에서 완전히 지우려면 reflog를 비우고 가비지 컬렉션을 해야 한다.
```bash
old=$(git log --format=%h --reflog -S example-secret)
git reflog expire --expire=now --all && git gc -q --prune=now
git cat-file -t $old
```
```text
fatal: Not a valid object name df56fed
```
이미 push했다면 모든 이력을 다시 써야 한다. Git 프로젝트는 `filter-branch` 대신 별도 설치하는 `git filter-repo`를 권한다. 새로 클론한 저장소에서 실행하고, GitHub 문서는 `--sensitive-data-removal` 옵션(filter-repo 2.47 이상)을 쓰도록 안내한다.
```sh
git filter-repo --sensitive-data-removal --invert-paths --path .env
git filter-repo --strip-blobs-bigger-than 10M    # 큰 파일 사고
git push --force --all origin && git push --force --tags origin
```
비밀이 든 커밋부터 뒤의 해시가 모두 바뀌므로 동료는 새로 클론해야 하고, 다시 쓴 커밋의 서명도 사라진다. 남의 클론과 포크에 남은 사본은 지울 수 없으며, GitHub의 캐시된 화면이나 PR 참조는 지원팀에 요청해야 한다. 그래서 키 폐기가 먼저다.

## 사고 복구 2: 잘못된 브랜치, 큰 파일
main에서 기능 커밋 두 개를 만들어 버렸다면, push 전에는 현재 위치에 브랜치를 만들고 main만 되돌리면 된다.
```bash
git commit -q --allow-empty -m "feat: login form"
git commit -q --allow-empty -m "feat: login api"
git branch feat/login && git reset -q --hard HEAD~2
git log --oneline main; echo; git log --oneline feat/login
gpgconf --kill gpg-agent; rm -rf "$GNUPGHOME"    # 실습 키 정리
```
```text
671fc5d chore: ignore .env

4fd5b0a feat: login api
912587e feat: login form
671fc5d chore: ignore .env
```
커밋은 그대로이고 브랜치 이름표만 옮겼다(4편). 이미 push했다면 `revert`로 되돌린다(8편). 큰 파일은 push 전이면 `git reset --soft HEAD~1`로 다시 커밋하고, 공유했다면 위의 filter-repo나 `git lfs migrate import`(12편)로 이력을 다시 쓴다.

## 권장 설정과 한계
- 전역에는 이름·기본 브랜치·별칭만, 메일과 서명 키는 `includeIf`로 폴더마다 둔다. 헷갈리면 `--show-origin`부터 본다.
- 서명은 `commit.gpgSign`과 `tag.gpgSign`으로 자동화하고, 키에는 만료일과 비밀번호를 건다.
- 자격 증명은 키체인 도우미에, `.env` 같은 파일은 처음부터 `.gitignore`에 넣고 push 보호 같은 서버 검사를 켠다.
- 이 글은 Git 2.43, GnuPG 2.4 기준이다. 서명 검증 메시지는 GnuPG 버전과 키 신뢰 설정에 따라 다르고, filter-repo는 Git에 들어 있지 않다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 위조 커밋의 해시가 달라지고 서명이 BAD가 된 것은 내용이 조금만 바뀌어도 해시가 완전히 달라지는 성질 위에 서 있다.
- GitHub 협업과 자동화 10편 「의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝」: 비밀 스캐닝과 push 보호가 비밀이 든 커밋을 서버에서 막아 이 글의 사고를 예방한다.
- GitHub 협업과 자동화 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」: 서명된 커밋 요구 규칙이 이 글의 서명을 병합 조건으로 만든다.
- WSL 개발 환경 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」: `core.autocrlf`와 `.gitattributes`로 줄바꿈을 맞추는 설정은 거기서 실행해 본다.

## 정리
- 설정은 시스템·전역·저장소 순으로 겹쳐 가까운 쪽이 이기고, `--show-origin`이 출처를 보여 준다. `!` 별칭은 최상위에서 도는 셸 명령이다.
- `includeIf "gitdir:~/work/"`로 폴더마다 다른 메일과 키를 쓴다.
- 서명은 `gpgsig`를 뺀 커밋 내용 전체에 대한 것이라 메시지만 바꿔도 BAD가 된다.
- 비밀 유출은 키 폐기가 먼저이고, 이력 재작성은 reflog·클론·포크의 사본까지는 지우지 못한다.

## 더 알아보기
- 이전 글: 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」
- 처음 글: 1편 「Git이란: 스냅숏으로 기록하는 분산 버전 관리」
- Git 문서 git-config: https://git-scm.com/docs/git-config
