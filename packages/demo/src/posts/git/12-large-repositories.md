# [Git 버전 관리 12/14] 큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS

> **한 줄 요약** — 클론은 객체 그래프 전체를 받는 일이라서, 큰 저장소는 그 그래프를 시간(얕은 클론), 객체 종류(부분 클론), 경로(희소 체크아웃)로 잘라 받고, 큰 바이너리는 내용을 Git 밖에 두고 포인터만 커밋한다(Git LFS).

## 이 글에서 다루는 것
- 저장소가 커지는 이유와 클론이 받는 것
- 얕은 클론과 그 한계, 부분 클론이 블롭을 나중에 받는 동작
- 희소 체크아웃(cone 모드)과 부분 클론의 조합
- Git LFS의 포인터 파일, LFS 없이 클론하면 생기는 일
- 잘못 커밋한 큰 파일, `git maintenance`, 서브모듈과 서브트리

## 문제: 클론이 왜 이렇게 오래 걸리나
3편에서 본 것처럼 커밋은 트리를, 트리는 블롭을 가리키고, 클론은 기본으로 모든 커밋의 모든 객체를 받는다. 그래서 저장소는 세 방향으로 커진다. 커밋이 수십만 개로 쌓이는 이력, 디자인 파일처럼 압축되지 않는 바이너리의 버전마다 쌓이는 블롭, 모노레포의 파일 수다. 파일을 지우는 커밋을 해도 옛 커밋의 트리가 그 블롭을 여전히 가리키므로 이력에서는 사라지지 않는다. 줄이는 방법은 그래프를 어디서 자르느냐로 나뉜다.
```text
commit -> tree -> blob
얕은 클론: 최근 N개 커밋만
부분 클론: 블롭(또는 트리)은 나중에
희소 체크아웃: 작업 트리에 일부 경로만
Git LFS: 큰 파일 내용 대신 포인터
```
실습용으로 커밋 21개짜리 저장소를 만든다. 커밋마다 작은 소스 두 개와 압축되지 않는 300KB 바이너리(무작위 바이트)가 바뀐다. `objs`는 팩 안 객체 수와 팩 크기를 한 줄로 보이는 셸 함수다(해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
objs() { git count-objects -vH | grep -E 'in-pack|size-pack' | paste -sd' '; }
git init -q big && cd big && mkdir web api assets
for i in $(seq 1 20); do
  echo "console.log($i)" > web/app.js
  echo "package main // $i" > api/main.go
  python3 -c "import random,sys; sys.stdout.buffer.write(
    random.Random($i).randbytes(300_000))" > assets/logo.bin
  git add -A && git commit -q -m "release $i"
done
echo "# big" > README.md && git add README.md && git commit -q -m "docs: readme"
cd .. && git clone -q file://$PWD/big full && (cd full && objs)
```
```text
in-pack: 163 size-pack: 5.74 MiB
```
작업 트리의 바이너리는 300KB인데 클론은 5.74MiB다. 커밋 21 + 트리 81 + 블롭 61 = 163개 객체가 모두 왔고, 무작위 바이트는 델타 압축도 안 되니 20개 버전이 그대로 쌓였다.

## 얕은 클론: 시간 축으로 자르기
**얕은 클론**(shallow clone)은 `--depth N`으로 최근 N개 커밋만 받는다. 흔한 실수부터 보자. 로컬 경로로 클론하면 Git은 객체를 하드 링크로 복사하는 지름길을 쓰고 `--depth`를 무시한다.
```bash
git clone -q --depth 1 big wrong
```
```text
warning: --depth is ignored in local clones; use file:// instead.
```
경고대로 `file://`을 쓴다.
```bash
git clone -q --depth 1 file://$PWD/big shallow && cd shallow
git log --oneline; cat .git/shallow; objs
git log --oneline HEAD~1
```
```text
b70e3e1 docs: readme
b70e3e1d4a15389fc829872e33e9c2ed630f8fb1
in-pack: 9 size-pack: 294.87 KiB
fatal: ambiguous argument 'HEAD~1': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'
```
`.git/shallow`에 적힌 커밋에서 이력이 끊긴 것으로 취급되어 부모를 찾지 않는다. 객체 9개(커밋 1, 트리 4, 블롭 4)만 왔다. 이전 커밋이 없으니 `HEAD~1`이 없고, `git log`·`blame`·`describe`·`merge-base`가 끊긴 이력만큼 틀리거나 실패한다. 얕은 클론은 기본으로 브랜치 하나만 받는다(`--single-branch`). 나중에 `git fetch --deepen=10`이나 `--unshallow`로 이력을 더 받을 수 있다.

## 부분 클론: 블롭은 필요할 때
**부분 클론**(partial clone)은 이력은 모두 받되 `--filter`로 일부 객체를 뺀다. `--filter=blob:none`은 블롭을 빼고 체크아웃에 필요한 것만 받는다. 서버가 필터를 허용해야 한다.
```bash
cd .. && git clone -q --filter=blob:none file://$PWD/big partial
```
```text
warning: filtering not recognized by server, ignoring
```
조용히 전체 클론이 되었다. 서버 쪽 `uploadpack.allowFilter`를 켜고 다시 받는다(GitHub 같은 호스팅은 이미 지원한다).
```bash
rm -rf partial && git -C big config uploadpack.allowFilter true
git clone -q --filter=blob:none file://$PWD/big partial && cd partial
git config --get-regexp 'remote.origin.(promisor|partialclonefilter)'
objs
git rev-list --objects --all --missing=print | grep -c '^?'
git show HEAD~5:assets/logo.bin | wc -c
git rev-list --objects --all --missing=print | grep -c '^?'
```
```text
remote.origin.promisor true
remote.origin.partialclonefilter blob:none
in-pack: 106 size-pack: 305.90 KiB
57
300000
56
```
커밋 21개와 트리 81개는 모두 왔고 블롭은 HEAD의 4개뿐이라 106개다. 빠진 57개는 원격이 "약속한"(promisor) 객체로 기록된다. `git log`는 커밋만 보므로 전부 되고, 옛 블롭이 필요한 순간(`git show HEAD~5:…`) Git이 그 블롭 하나를 받아 와서 빠진 객체가 56개로 줄었다. 대신 `git log -p`나 `blame`처럼 옛 블롭을 많이 읽는 명령은 네트워크를 계속 쓴다. 트리까지 빼는 `--filter=tree:0`은 더 작지만 이력 탐색이 더 자주 느려진다.

## 희소 체크아웃: 경로로 자르기
모노레포에서 내 팀 폴더만 필요하면 **희소 체크아웃**(sparse checkout)으로 작업 트리에 일부 경로만 둔다. 폴더 단위로 지정하는 cone 모드가 기본(이 글의 Git 2.43 기준)이고 빠르다. 부분 클론과 함께 쓰면 받는 블롭도 그 경로만큼으로 준다.
```bash
cd .. && git clone -q --filter=blob:none --sparse file://$PWD/big sparse
cd sparse && ls
git sparse-checkout set web
ls; cat .git/info/sparse-checkout
git rev-list --objects --all --missing=print | grep -c '^?'
```
```text
README.md
README.md
web
/*
!/*/
/web/
59
```
`--sparse`로 받으면 루트의 파일만 있다. `set web` 뒤에는 cone 패턴(루트 파일 모두, 하위 폴더는 빼고, `/web/`만 포함)이 기록되고, 받은 블롭은 README와 `web/app.js` 두 개뿐이다(61개 중 59개가 빠짐). 희소 체크아웃만 쓰면 객체는 모두 받고 작업 트리만 줄어든다는 점을 구분하자.

## Git LFS: 큰 파일은 밖에, 포인터는 안에
**Git LFS**(Large File Storage)는 지정한 파일의 내용을 LFS 저장소에 두고 Git에는 작은 포인터 파일만 커밋한다. `.gitattributes`의 필터가 `git add` 때 내용을 포인터로 바꾸고(clean), 체크아웃 때 되돌린다(smudge).
```bash
cd .. && git init -q game && cd game
git lfs install --local && git lfs track "*.psd"
cat .gitattributes
python3 -c "import random,sys; sys.stdout.buffer.write(
  random.Random(7).randbytes(2_000_000))" > hero.psd
git add .gitattributes hero.psd && git commit -q -m "add hero art"
git cat-file -p HEAD:hero.psd
sha256sum hero.psd; find .git/lfs/objects -type f
```
```text
Updated Git hooks.
Git LFS initialized.
Tracking "*.psd"
*.psd filter=lfs diff=lfs merge=lfs -text
version https://git-lfs.github.com/spec/v1
oid sha256:66233931adf0c0d624b7f46c537e61c8ba90fc4454dbbe023a29912367de3d08
size 2000000
66233931adf0c0d624b7f46c537e61c8ba90fc4454dbbe023a29912367de3d08  hero.psd
.git/lfs/objects/66/23/66233931adf0c0d624b7f46c537e61c8ba90fc4454dbbe023a29912367de3d08
```
Git이 저장한 블롭은 세 줄짜리 포인터이고, `oid`는 파일 내용의 SHA-256이다(`sha256sum`과 같다). 내용은 `.git/lfs/objects`에 그 해시 이름으로 있다. 2MB 파일의 버전이 백 개 쌓여도 Git 이력에는 포인터 백 개만 남고, 클론은 필요한 버전의 내용만 받는다. 포인터가 서버로 가려면 내용도 함께 올라가야 하므로 `git lfs install`은 pre-push 등의 훅을 설치한다(훅은 13편). 실무에서는 GitHub 같은 호스팅의 LFS 서버로 올라가지만, git-lfs 3.4는 `file://` 원격이면 서버 없이 파일을 복사하므로 여기서도 해 볼 수 있다. LFS를 설정하지 않은 사람이 클론하면 어떻게 될까.
```bash
git init -q --bare ../game.git && git remote add origin ../game.git
git push -q origin main 2>&1 | grep -v '^Uploading LFS'
find ../game.git/lfs/objects -type f
cd .. && git clone -q file://$PWD/game.git game2 && cd game2
wc -c < hero.psd; git lfs ls-files
```
```text
../game.git/lfs/objects/66/23/66233931adf0c0d624b7f46c537e61c8ba90fc4454dbbe023a29912367de3d08
132
66233931ad - hero.psd
```
내용은 원격의 Git 객체가 아니라 LFS 저장 공간에 올라갔다. 그런데 새 클론에는 smudge 필터가 없으니 작업 트리에 132바이트 포인터가 그대로 나왔다(`-`는 내용을 받지 않았다는 표시). "이미지가 깨졌다"는 신고의 흔한 원인이다. LFS를 설정하고 내용을 받으면 원래 크기가 된다.
```bash
git lfs install --local >/dev/null && git lfs pull
wc -c < hero.psd; git lfs ls-files
```
```text
2000000
66233931ad * hero.psd
```

## 잘못 커밋한 큰 파일과 저장소 관리
앞의 `big`처럼 이미 커밋한 바이너리는 다음 커밋에서 지워도 이력의 5.74MiB가 그대로 남는다. 아직 push 전이면 `git reset`(8편)으로 커밋을 고치고, 공유했다면 이력을 다시 써야 한다. 기존 이력의 파일을 LFS로 옮기는 `git lfs migrate import --include="*.psd" --everything`도 커밋 해시를 모두 바꾼다. 이력 재작성의 절차와 주의는 14편에서 다룬다.

커밋이 많은 저장소에서는 커밋 그래프 파일이 `log --graph`나 병합 기준 계산을 빠르게 한다. `git maintenance`가 이것과 백그라운드 fetch, 느슨한 객체 정리 같은 작업을 맡는다.
```bash
git maintenance run --task=commit-graph && ls .git/objects/info
```
```text
commit-graphs
```
```sh
git maintenance start    # 이 저장소를 등록하고 주기 작업을 스케줄러(cron·systemd 등)에 건다
```
다른 저장소를 품는 방법도 둘 있다. **서브모듈**(submodule)은 상위 저장소의 트리에 다른 저장소의 커밋 해시만 기록하므로 `git clone --recurse-submodules`나 `git submodule update --init`을 잊으면 빈 폴더가 남는다. **서브트리**(subtree)는 다른 저장소의 내용을 하위 폴더에 복사해 넣어 클론이 단순한 대신 저장소가 커진다.

## 권장 설정과 한계
- 개발자 PC에는 부분 클론(`--filter=blob:none`), 한 번 빌드하고 버리는 CI에는 얕은 클론, 모노레포에는 희소 체크아웃을 더한다.
- 로컬 경로 클론은 `--depth`·`--filter`를 무시할 수 있으니 `file://`을 쓴다. 필터 경고가 보이면 서버 설정부터 확인한다.
- 바이너리는 처음 커밋하기 전에 `git lfs track`으로 등록하고 `.gitattributes`를 함께 커밋한다. LFS는 호스팅의 저장 용량·전송량 한도를 쓴다.
- 이 글의 실행 결과는 Git 2.43, git-lfs 3.4 기준이다.

## 숫자로 보기
| 클론 방식 | 객체 수 | 팩 크기 |
| --- | --- | --- |
| 전체 | 163 | 5.74 MiB |
| `--depth 1` | 9 | 294.87 KiB |
| `--filter=blob:none` | 106 | 305.90 KiB |
| 부분 + 희소(web) | 104 | 13.82 KiB |

## 어디에 쓰이나
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: `actions/checkout`은 기본으로 커밋 하나만 받는 얕은 클론이라, 태그나 이력이 필요한 잡은 `fetch-depth: 0`을 준다.
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: Git 커밋도 바뀐 파일까지의 트리 경로만 새로 만들고 나머지를 공유하는 경로 복사라서, 옛 버전이 모두 남고 큰 블롭도 이력에서 사라지지 않는다.
- 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」: 부분 클론이 빼는 것은 이 글의 객체 그래프에서 블롭이고, LFS 포인터의 oid도 같은 내용 주소 생각이다.

## 정리
- 클론은 커밋·트리·블롭 그래프 전체를 받으므로, 큰 저장소는 시간·객체 종류·경로로 잘라 받는다.
- 얕은 클론은 가장 작지만 이력이 끊기고, 부분 클론은 이력을 모두 두고 블롭을 필요할 때 받는다(서버의 `uploadpack.allowFilter` 필요).
- 희소 체크아웃은 작업 트리를, 부분 클론과 함께 쓰면 받는 블롭까지 경로로 줄인다.
- Git LFS는 SHA-256 포인터만 커밋하고 내용은 따로 옮기며, LFS 없이 받으면 포인터 파일이 그대로 보인다.

## 더 알아보기
- 이전 글: 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」
- 다음 글: 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」
- Git 문서 partial-clone: https://git-scm.com/docs/partial-clone
