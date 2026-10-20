# [Git 버전 관리 3/14] Git 내부 구조: 블롭, 트리, 커밋 객체와 참조

> **한 줄 요약** — Git 저장소는 `종류 크기\0내용`의 해시를 이름으로 쓰는 키-값 저장소이고, 파일 내용(블롭)·폴더(트리)·스냅숏(커밋)이 해시로 서로를 가리키며, 브랜치와 HEAD는 그 해시를 적은 작은 파일일 뿐이다.

## 이 글에서 다루는 것
- 내용 주소 저장소: 블롭 해시를 `sha1sum`과 파이썬으로 직접 계산해 `git hash-object`와 비교
- `git cat-file`로 커밋·트리 열어 보기, 트리와 커밋 해시까지 손으로 다시 계산
- 참조(`refs/heads/main`)와 HEAD
- 같은 내용은 한 번만 저장된다는 것, 느슨한 객체와 팩 파일
- SHA-256 저장소의 현황

## 문제: 이름 없는 파일들
1편에서 커밋 하나에 `.git/objects` 아래 이름 모를 16진수 파일이 4개 생겼다. 이 구조를 알면 "복사한 파일은 왜 저장소를 키우지 않나", "옛 커밋을 고치면 왜 뒤의 해시가 전부 바뀌나(6편)", "저장소가 깨졌다는 오류는 무슨 뜻인가"에 스스로 답할 수 있다. 해시 함수 자체는 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」를 참고한다.

## 원리: 내용이 곧 주소다
Git의 객체 데이터베이스는 키-값 저장소다. 값은 `종류 크기\0내용`이라는 바이트열, 키는 그 SHA-1 해시(16진수 40자)다. 이렇게 내용으로 주소를 정하는 방식을 **내용 주소 저장소**(content-addressable storage)라 한다. 같은 내용은 몇 번 나와도 객체 하나이고, 한 바이트만 바뀌어도 키가 바뀌므로 해시를 다시 계산하면 손상이나 변조를 알아챌 수 있다. 객체 종류는 넷이다. 파일 내용인 **블롭**(blob), 폴더 목록인 **트리**(tree), 스냅숏 하나인 **커밋**(commit), 그리고 주석 태그(11편).

## 따라 하기: 블롭 해시를 직접 계산하기
`hello\n`은 6바이트다. 앞에 `blob 6`과 널 바이트를 붙여 해시하면 Git과 같은 값이 나온다(이 글의 결과는 Git 2.43 기준이고, 커밋 해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q proj && cd proj
printf 'hello\n' > hello.txt
git add hello.txt
git hash-object hello.txt
printf 'blob 6\0hello\n' | sha1sum
```
```text
ce013625030ba8dba906f756967f9e9ca394464a
ce013625030ba8dba906f756967f9e9ca394464a  -
```
블롭은 파일 이름도 권한도 모른다. 내용이 `hello\n`인 파일은 모든 SHA-1 Git 저장소에서 `ce01362…`다. `git add`는 이 객체를 `.git/objects/<앞 2자>/<나머지 38자>`에 zlib으로 압축해 쓴다. 파이썬으로 같은 계산을 하고, 저장된 파일을 풀어 비교한다(파이썬 블록은 `proj`의 상위 폴더에서 실행했다).
```python
import hashlib, zlib
data = open("proj/hello.txt", "rb").read()
store = b"blob %d\0" % len(data) + data
print(store)
print(hashlib.sha1(store).hexdigest())
path = "proj/.git/objects/ce/013625030ba8dba906f756967f9e9ca394464a"
raw = open(path, "rb").read()
print(len(raw), zlib.decompress(raw) == store)
```
```text
b'blob 6\x00hello\n'
ce013625030ba8dba906f756967f9e9ca394464a
21 True
```
압축된 21바이트를 풀면 정확히 `blob 6\0hello\n`이다. 객체 파일은 이것이 전부다.

## 트리와 커밋 열어 보기
폴더를 하나 더 만들고 커밋한 뒤 `git cat-file`로 연다. `-t`는 종류, `-p`는 내용을 보기 좋게 출력한다. `HEAD^{tree}`는 HEAD 커밋의 트리, `HEAD:src`는 그 안의 `src` 트리다.
```bash
mkdir src && printf 'print("hi")\n' > src/main.py
git add . && git commit -qm "첫 커밋"
git cat-file -t HEAD
git cat-file -p HEAD
git cat-file -p 'HEAD^{tree}'
git cat-file -p HEAD:src
```
```text
commit
tree eda7844447ce32c0ee14ff76faf4834d6cd83957
author Dev Kim <dev@example.com> 1772409900 +0900
committer Dev Kim <dev@example.com> 1772409900 +0900

첫 커밋
100644 blob ce013625030ba8dba906f756967f9e9ca394464a	hello.txt
040000 tree 37a4b05693857e190d1ecbe45b4451bc36078274	src
100644 blob b80e3222ab264bd7cafb376749bd18814fd66776	main.py
```
커밋은 트리, 작성자와 커미터(유닉스 시각과 시간대), 메시지로 된 짧은 텍스트이고, 두 번째 커밋부터 `parent` 줄이 붙는다. 트리는 줄마다 모드, 종류, 해시, 이름을 담는다. `100644`는 일반 파일, `100755`는 실행 파일, `040000`은 하위 트리다. 파일 이름과 권한은 블롭이 아니라 트리에 있다.
```text
C2 (commit)
├─ parent → C1 (commit)
└─ tree
   ├─ hello.txt → blob ce01362
   └─ src/ → tree
      └─ main.py → blob b80e322
```
화살표는 모두 해시다. 커밋은 트리와 부모 커밋의 해시를, 트리는 블롭과 하위 트리의 해시를 담는다. 그래서 오래된 파일 한 바이트를 바꾸면 그 블롭, 위의 트리들, 그 커밋, 뒤의 모든 커밋 해시가 연달아 바뀐다. 최신 커밋 해시 하나가 이력 전체의 지문이다.

## 검증: 트리와 커밋 해시도 같은 규칙
트리 객체의 내용은 항목마다 `모드 이름\0`과 20바이트 이진 해시를 이어 붙인 것이다. 하위 트리 모드는 앞의 0 없이 `40000`이고, 항목은 이름순(폴더는 이름 뒤에 `/`가 있다고 보고)이다. 작업 트리의 파일만 읽어 Git 없이 루트 트리 해시를 계산한다.
```python
import hashlib, os

def oid(kind, data):
    head = b"%s %d\0" % (kind, len(data))
    return hashlib.sha1(head + data).digest()

def tree(path):
    items = []
    for name in os.listdir(path):
        if name == ".git": continue
        p = os.path.join(path, name)
        if os.path.isdir(p):
            key, mode, h = name + "/", b"40000", tree(p)
        else:
            data = open(p, "rb").read()
            key, mode, h = name, b"100644", oid(b"blob", data)
        items.append((key, mode + b" " + name.encode() + b"\0" + h))
    items.sort()
    return oid(b"tree", b"".join(e for _, e in items))

print(tree("proj").hex())
```
```text
eda7844447ce32c0ee14ff76faf4834d6cd83957
```
커밋 해시는 `git cat-file commit`이 보여 주는 원래 내용에 `commit 크기\0`를 붙여 해시한 값이다.
```bash
git rev-parse 'HEAD^{tree}'
(printf 'commit %d\0' "$(git cat-file -s HEAD)"
 git cat-file commit HEAD) | sha1sum
git rev-parse HEAD
```
```text
eda7844447ce32c0ee14ff76faf4834d6cd83957
20e32744a250d0cbbb88f1770a406fdf37140f3a  -
20e32744a250d0cbbb88f1770a406fdf37140f3a
```
세 종류 모두 `종류 크기\0내용`의 SHA-1이라는 한 가지 규칙으로 이름이 정해진다.

## 참조와 HEAD
**참조**(reference)는 해시에 붙인 이름이고, 브랜치 `main`은 `.git/refs/heads/main` 파일에 적힌 커밋 해시 한 줄이다. **HEAD**는 보통 해시가 아니라 "지금 어느 브랜치에 있는가"를 적은 **심볼릭 참조**(symbolic reference)다.
```bash
cat .git/HEAD
cat .git/refs/heads/main
git count-objects -v | grep -E '^(count|in-pack):'
```
```text
ref: refs/heads/main
20e32744a250d0cbbb88f1770a406fdf37140f3a
count: 5
in-pack: 0
```
커밋하면 Git은 새 커밋 객체를 쓰고 HEAD가 가리키는 브랜치 파일의 해시만 바꾼다(4편). 태그(`refs/tags`, 11편)와 원격 추적 브랜치(`refs/remotes`, 7편)도 참조다. 지금 객체는 블롭 2, 트리 2, 커밋 1로 5개이고 모두 압축된 개별 파일, 즉 **느슨한 객체**(loose object)다.

## 같은 내용은 한 번만 저장된다
`hello.txt`를 다른 이름으로 복사해 커밋한다.
```bash
cp hello.txt src/copy.txt
git add . && git commit -qm "같은 내용 복사"
git count-objects -v | grep '^count:'
git ls-tree -r HEAD
```
```text
count: 8
100644 blob ce013625030ba8dba906f756967f9e9ca394464a	hello.txt
100644 blob ce013625030ba8dba906f756967f9e9ca394464a	src/copy.txt
100644 blob b80e3222ab264bd7cafb376749bd18814fd66776	src/main.py
```
객체는 새 `src` 트리, 새 루트 트리, 새 커밋 3개만 늘었고, 두 경로가 같은 블롭 `ce01362…`를 가리킨다. Git이 이름 바꾸기를 기록하지 않고 "사라진 파일과 새 파일의 내용이 같거나 비슷하면 이름을 바꾼 것"으로 추정하는 이유도 여기에 있다.

## 느슨한 객체와 팩 파일
큰 파일을 조금씩 고칠 때마다 통째로 저장하면 공간이 낭비된다. `git gc`는 느슨한 객체들을 **팩 파일**(packfile) 하나로 묶으면서 비슷한 객체를 다른 객체와의 차이(델타)로 저장한다. 3,000줄 파일에서 한 줄만 고쳐 확인해 보자.
```bash
seq 1 3000 > big.txt && git add big.txt
git commit -qm "큰 파일"
sed -i 's/^1500$/fifteen hundred/' big.txt
git commit -qam "한 줄 수정"
git gc -q
git count-objects -v | grep -E '^(count|in-pack|packs):'
git verify-pack -v .git/objects/pack/*.idx | grep blob
```
```text
count: 0
in-pack: 14
packs: 1
5957221aad85ae0ec3d72d174c165bb71ca96e98 blob   13904 6503 634
ce013625030ba8dba906f756967f9e9ca394464a blob   6 15 7137
b80e3222ab264bd7cafb376749bd18814fd66776 blob   12 21 7152
1127304b44c93b81365608aa80e44d54815adb52 blob   17 29 7464 1 5957221aad85ae0ec3d72d174c165bb71ca96e98
```
느슨한 객체는 0개, 팩 하나에 14개가 들었다. `verify-pack`의 열은 해시, 종류, 크기, 팩 안의 크기, 위치이고, 델타로 저장된 객체는 크기 자리에 델타의 크기가 오고 뒤에 델타 깊이와 기준 객체가 붙는다. 13,904바이트인 새 `big.txt`는 압축만 해서 6,503바이트, 옛 판(13,893바이트)은 새 판을 기준으로 한 17바이트짜리 델타(팩 안 29바이트)로 저장됐다. 자주 읽는 최근 판을 통째로 두고 옛 판을 델타로 둔다. Git은 객체가 쌓이면 `gc`를 자동으로 돌리고(`gc.auto`) push·fetch도 팩으로 주고받는다.

## 흔한 실수와 문제 해결
객체 파일이 디스크 오류나 손작업으로 바뀌면 어떻게 될까. 새 블롭을 만들고 그 파일을 다른 내용으로 바꿔치기해 보자.
```bash
printf 'memo\n' > memo.txt && git add memo.txt
id=$(git rev-parse :memo.txt)
f=.git/objects/${id:0:2}/${id:2}
chmod u+w $f
python3 -c "import zlib, sys
open(sys.argv[1], 'wb').write(zlib.compress(b'blob 6\0MEMO!\n'))" $f
git cat-file -p $id
git fsck
```
```text
MEMO!
error: 3222d8f8708a248407e7f2d65280a6488a169058: hash-path mismatch, found at: .git/objects/a5/f34b60e4fe62a2844ceea1391a0abc22525494
missing blob a5f34b60e4fe62a2844ceea1391a0abc22525494
```
`cat-file`은 바뀐 내용을 그대로 보여 준다. 읽을 때마다 해시를 다시 계산하지는 않기 때문이다. `git fsck`는 모든 객체의 해시를 다시 계산해, 내용의 해시(`3222d8f…`)가 경로(`a5f34b6…`)와 다른 객체와 그래서 사라진 블롭을 찾아낸다. 저장소가 이상하면 먼저 `git fsck`다.
- `.git` 안의 파일은 손으로 고치지 않는다. 클라우드 동기화 폴더에 저장소를 두면 객체 파일이 반쯤 복사되어 깨지기 쉬우니, 백업은 원격 저장소(7편)로 한다.
- 지운 커밋은 reflog(8편)가 만료되기 전까지 보호되므로 `gc` 직후에도 바로 사라지지 않는다.

## SHA-256 저장소의 현황
2017년 2월 SHA-1 충돌을 실제로 만든 SHAttered 공격이 발표되자, Git은 그해 5월 2.13부터 충돌 공격의 흔적이 있는 객체를 거부하는 SHA-1 구현을 기본으로 쓰고 SHA-256으로 옮기는 작업을 이어 왔다. `--object-format=sha256`은 2020년 Git 2.29에 실험 기능으로 들어왔고 2.42에서 경고가 누그러졌다.
```bash
cd .. && git init -q --object-format=sha256 sha && cd sha
printf 'hello\n' > hello.txt
git hash-object hello.txt
printf 'blob 6\0hello\n' | sha256sum
git rev-parse --show-object-format
```
```text
2cf8d83d9ee29543b34a87727421fdecb7e3f3a183d337639025de576db9ebb4
2cf8d83d9ee29543b34a87727421fdecb7e3f3a183d337639025de576db9ebb4  -
sha256
```
규칙은 같고 해시 함수만 바뀌어 ID가 64자(256비트)가 된다. 공식 문서(BreakingChanges)는 Git 3.0에서 새 저장소의 기본 형식을 SHA-256으로 바꿀 계획을 밝히고 있고, SHA-1 지원을 없앨 계획은 없다고 적는다. 다만 지금은 SHA-1 저장소와 SHA-256 저장소가 서로 주고받지 못하고, 호스팅 서비스의 지원도 일부에 그친다(GitLab은 2024년 8월 실험 기능으로 SHA-256 프로젝트 생성을 열었다). 새 저장소를 SHA-256으로 만들려면 쓰는 호스팅과 도구의 지원부터 확인한다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 파일 하나를 바꾸면 그 위의 트리만 새로 만들고 나머지를 공유하는 것이 경로 복사와 같다.
- 도커와 컨테이너 2편 「이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트」: 이미지 레이어의 sha256 다이제스트와 바뀔 수 있는 태그의 관계는 Git의 객체 ID와 브랜치의 관계와 같다.
- 4편 「브랜치와 HEAD: 움직이는 포인터로 갈라지기」: 참조가 해시를 적은 파일이라는 사실 위에서 브랜치를 만들고 옮긴다.

## 정리
- 객체 ID는 `종류 크기\0내용`의 SHA-1이다. `sha1sum`과 파이썬으로 블롭·트리·커밋 해시를 모두 똑같이 재현했다.
- 커밋 → 트리 → 블롭이 해시로 이어져, 최신 커밋 해시 하나가 이력 전체의 지문이 된다.
- 브랜치는 해시 한 줄짜리 파일, HEAD는 브랜치를 가리키는 심볼릭 참조다. SHA-256 저장소는 상호 운용과 호스팅 지원이 아직 과제다.
- 같은 내용은 블롭 하나로 공유되고, `gc`는 팩에서 옛 판을 델타로 줄인다(13,893바이트 → 29바이트). 변조는 `git fsck`가 잡는다.

## 더 알아보기
- 이전 글: 2편 「커밋의 기본: 작업 트리, 스테이징 영역, 저장소」
- 다음 글: 4편 「브랜치와 HEAD: 움직이는 포인터로 갈라지기」
- Git 해시 함수 전환 문서: https://git-scm.com/docs/hash-function-transition
