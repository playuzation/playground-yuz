# [WSL 개발 환경 4/10] 윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자

> **한 줄 요약** — 윈도우와 리눅스는 줄 끝(CRLF와 LF), 실행 비트, 파일 이름의 대소문자, BOM을 다르게 다루므로 같은 파일이 한쪽에서는 멀쩡하고 다른 쪽에서는 깨지며, 바이트를 직접 확인하는 습관과 저장소의 `.gitattributes`로 규칙을 고정하는 것이 해결책이다.

## 이 글에서 다루는 것
- CRLF 스크립트가 내는 오류 재현: `cannot execute: required file not found`, `$'\r': command not found`
- `file`과 `od -c`로 줄 끝 확인하기
- Git의 `core.autocrlf`와 `.gitattributes`로 줄바꿈을 정규화하는 과정을 저장소에서 확인하기
- 실행 비트와 `core.fileMode`, 대소문자만 다른 파일 이름, BOM

## 문제: 윈도우에서 받은 스크립트가 리눅스에서 깨진다
윈도우용 Git으로 클론한 저장소를 WSL에서 열고 `./deploy.sh`를 실행했더니 파일이 분명히 있는데 "찾을 수 없다"고 한다. CI에서는 같은 스크립트가 `Permission denied`로 멈추고, 맥을 쓰는 동료가 올린 `Readme.md`와 `README.md`는 윈도우에서 하나만 보인다. 세 문제의 뿌리는 같다. 두 운영체제가 파일의 일부 성질을 다르게 해석하고, 그 차이가 경계를 넘을 때 드러난다.

## 줄바꿈: CRLF와 LF
리눅스는 줄 끝을 LF(`\n`, 0x0A) 한 바이트로, 윈도우의 관례는 CR LF(`\r\n`, 0x0D 0x0A) 두 바이트로 표시한다. 윈도우 줄 끝으로 저장된 스크립트를 만들어 실행해 보자.
```bash
printf '#!/bin/bash\r\n\r\necho "hello"\r\ncd /tmp\r\n' > deploy.sh
chmod +x deploy.sh
bash -c ./deploy.sh
```
```text
bash: line 1: ./deploy.sh: cannot execute: required file not found
```
커널은 첫 줄 `#!` 뒤를 줄 끝 LF까지 읽어 인터프리터 경로로 쓴다. 그 경로는 `/bin/bash`가 아니라 끝에 CR이 붙은 `/bin/bash\r`이고, 그런 파일은 없다. 실행 파일은 있는데 커널이 ENOENT(파일 없음)를 돌려주니 bash 5.2는 위처럼 말한다. 이전 bash에서는 같은 상황이 `/bin/bash^M: bad interpreter: No such file or directory`로 보였다(`^M`이 CR이다). 커널이 돌려준 오류를 직접 확인할 수 있다.
```bash
python3 -c 'import os; os.execv("./deploy.sh", ["deploy.sh"])' 2>&1 | tail -1
ls "/bin/bash"$'\r'
```
```text
FileNotFoundError: [Errno 2] No such file or directory
ls: cannot access '/bin/bash'$'\r': No such file or directory
```
`bash deploy.sh`처럼 인터프리터를 직접 부르면 첫 줄 문제는 피하지만, 이번에는 줄마다 끝에 붙은 CR이 명령의 일부가 된다.
```bash
bash deploy.sh
```
```text
deploy.sh: line 2: $'\r': command not found
hello
deploy.sh: line 4: cd: $'/tmp\r': No such file or directory
```
빈 줄은 CR 한 글자짜리 명령이 되고, `cd /tmp`는 `/tmp\r`라는 없는 폴더로 가려 한다. `hello`도 실제로는 끝에 CR이 붙어 출력됐다. 눈에 보이지 않으므로 바이트로 확인한다.
```bash
file deploy.sh
od -c deploy.sh | head -2
```
```text
deploy.sh: Bourne-Again shell script, ASCII text executable, with CRLF line terminators
0000000   #   !   /   b   i   n   /   b   a   s   h  \r  \n  \r  \n   e
0000020   c   h   o       "   h   e   l   l   o   "  \r  \n   c   d
```
당장은 줄 끝의 CR을 지우면 된다(`dos2unix` 도구도 같은 일을 한다).
```bash
sed -i 's/\r$//' deploy.sh
file deploy.sh && ./deploy.sh
```
```text
deploy.sh: Bourne-Again shell script, ASCII text executable
hello
```

## Git이 줄바꿈을 바꾸는 시점
하지만 파일을 고쳐도 다음 클론에서 또 깨진다면 원인은 저장소 설정이다. Git은 줄바꿈을 두 시점에 바꿀 수 있다. 파일을 스테이징할 때(작업 트리 → 저장소)와 체크아웃할 때(저장소 → 작업 트리)다.

| `core.autocrlf` | 커밋할 때 | 체크아웃할 때 |
|---|---|---|
| `true` | CRLF → LF | LF → CRLF |
| `input` | CRLF → LF | 그대로 |
| `false` | 그대로 | 그대로 |

윈도우용 Git 설치 프로그램의 기본 선택은 `true`라서, 윈도우에서 클론한 작업 트리의 스크립트는 CRLF가 된다. 그 폴더를 WSL에서 실행하면 위의 오류가 난다. `core.autocrlf`는 사람마다 다른 개인 설정이라는 점이 더 큰 문제다. 그래서 규칙은 저장소에 커밋하는 `.gitattributes`에 둔다. 이 파일은 개인의 `core.autocrlf`보다 우선한다.

## 따라 하기: .gitattributes로 정규화하기
윈도우에서 `core.autocrlf=false`인 사람이 CRLF 파일을 그대로 커밋한 저장소를 만든다. `git ls-files --eol`은 파일마다 저장소 안(`i/`)과 작업 트리(`w/`)의 줄 끝, 적용된 속성(`attr/`)을 보여 준다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git init -q eol-demo && cd eol-demo
git config core.autocrlf false
printf '#!/bin/bash\r\necho hi\r\n' > build.sh
printf '@echo off\r\necho hi\r\n' > run.bat
printf 'line\n' > notes.txt
git add . && git commit -qm "윈도우에서 올린 커밋"
git ls-files --eol
```
```text
i/crlf  w/crlf  attr/                 	build.sh
i/lf    w/lf    attr/                 	notes.txt
i/crlf  w/crlf  attr/                 	run.bat
```
저장소 안에 CRLF가 그대로 들어갔다. 이제 규칙을 적는다. 텍스트는 자동 판별해 LF로, 셸 스크립트는 반드시 LF로, 배치 파일은 작업 트리에서 CRLF로, 이미지는 손대지 않는다.
```bash
# 파일: eol-demo/.gitattributes
* text=auto eol=lf
*.sh text eol=lf
*.bat text eol=crlf
*.png binary
```
규칙 파일도 커밋해야 모두에게 적용된다. 규칙을 추가해도 이미 커밋된 파일은 그대로이므로 `--renormalize`로 다시 스테이징해야 저장소 안의 내용이 바뀐다.
```bash
git add .gitattributes && git add --renormalize .
git ls-files --eol
```
```text
i/lf    w/lf    attr/text=auto eol=lf 	.gitattributes
i/lf    w/crlf  attr/text eol=lf      	build.sh
i/lf    w/lf    attr/text=auto eol=lf 	notes.txt
i/lf    w/crlf  attr/text eol=crlf    	run.bat
```
저장소 안(`i/`)은 모두 LF가 됐다. `eol=crlf`인 배치 파일도 저장소에는 LF로 저장되고 체크아웃할 때만 CRLF가 된다는 점이 핵심이다. 커밋하고 작업 트리를 새로 꺼내 확인한다.
```bash
git commit -qm "줄바꿈 정규화"
rm build.sh run.bat && git checkout -- .
git ls-files --eol
file build.sh run.bat
```
```text
i/lf    w/lf    attr/text=auto eol=lf 	.gitattributes
i/lf    w/lf    attr/text eol=lf      	build.sh
i/lf    w/lf    attr/text=auto eol=lf 	notes.txt
i/lf    w/crlf  attr/text eol=crlf    	run.bat
build.sh: Bourne-Again shell script, ASCII text executable
run.bat:  DOS batch file, ASCII text, with CRLF line terminators
```
이제 누가 어떤 `core.autocrlf`로 클론해도 셸 스크립트는 LF, 배치 파일은 CRLF로 나온다. CI에서 `git ls-files --eol | grep 'i/crlf'`가 아무것도 찾지 않는지 검사하면 다시 섞여 들어오는 것도 막는다.

## 실행 비트와 core.fileMode
Git은 파일 권한 중 실행 비트 하나만 기록한다(모드 100644 또는 100755). NTFS에는 이 비트가 없어서 윈도우용 Git은 저장소를 만들 때 `core.fileMode=false`로 권한 변화를 무시하게 한다. 반대로 WSL에서 `/mnt/c`의 파일은 기본 마운트 설정에서 권한이 윈도우 쪽 정보로 계산되어 모두 실행 가능처럼 보이기 쉽고(`metadata` 마운트 옵션은 6편), 리눅스 Git은 이것을 변경으로 본다. 그 상황을 흉내 낸다.
```bash
chmod 777 notes.txt
git diff
git -c core.fileMode=false diff --stat
echo "(fileMode=false: 차이 없음)"
```
```text
diff --git a/notes.txt b/notes.txt
old mode 100644
new mode 100755
(fileMode=false: 차이 없음)
```
권한이 의미 없는 파일 시스템에서 일하면서도 스크립트에는 실행 비트를 남겨야 한다면, 파일 권한 대신 인덱스에 직접 기록한다. 이러면 CI의 `Permission denied`도 사라진다.
```bash
git update-index --chmod=+x build.sh
git ls-files -s build.sh
cd ..
```
```text
100755 68d8222fcba19a5bc88746843bba6cac1506517a 0	build.sh
```

## 대소문자만 다른 파일 이름
ext4는 대소문자를 구분하므로 `Readme.md`와 `README.md`가 서로 다른 파일이다. NTFS는 기본적으로 구분하지 않고, 공식 문서에 따르면 WSL에 마운트된 NTFS 드라이브도 기본은 대소문자 무시다.
```bash
git init -q case-demo && cd case-demo
echo a > Readme.md; echo b > README.md
ls
git add . && git commit -qm docs
git ls-files | sort -f | uniq -di
cd ..
```
```text
README.md
Readme.md
README.md
```
마지막 줄이 충돌 검사다. 대소문자를 무시하고 정렬해 겹치는 이름을 찾는다. 이 저장소를 윈도우에서 클론하면 한 파일만 작업 트리에 남고 Git이 아래처럼 경고한다(출력 예). 둘 중 하나의 이름을 바꿔 커밋하는 것이 해결책이다.
```powershell
git clone https://example.com/example-org/example-app.git
```
```text
warning: the following paths have collided (e.g. case-sensitive paths
on a case-insensitive filesystem) and only one from the same
colliding group is in the working tree:

  'README.md'
  'Readme.md'
```
윈도우에서도 폴더 단위로 대소문자 구분을 켤 수 있다. 관리자 권한으로 `fsutil.exe file setCaseSensitiveInfo <폴더> enable`을 실행하며, 빈 폴더에만 적용되고 그 안에 새로 만드는 폴더는 설정을 물려받는다.

## BOM: 보이지 않는 세 바이트
일부 윈도우 편집기는 UTF-8 파일 앞에 BOM(EF BB BF)을 붙인다. 셸 스크립트에서는 `#!`이 파일 맨 앞이 아니게 된다.
```bash
printf '\xef\xbb\xbf#!/bin/bash\necho hi\n' > bom.sh && chmod +x bom.sh
./bom.sh
file bom.sh
```
```text
./bom.sh: line 1: …#!/bin/bash: No such file or directory
hi
bom.sh: Bourne-Again shell script, Unicode text, UTF-8 (with BOM) text executable
```
커널은 `#!`을 찾지 못해 실행을 거부하고, bash가 대신 셸 스크립트로 읽었다. 첫 줄은 BOM이 붙은 이상한 명령이 되어 실패했고 둘째 줄만 실행됐다. 첫 줄이 `#!/usr/bin/env python3`이었다면 파이썬 코드가 셸에서 실행됐을 것이다. `sed -i '1s/^\xEF\xBB\xBF//' bom.sh`로 지우고, 편집기를 "UTF-8(BOM 없음)"으로 설정한다.

## 권장 설정과 체크리스트
- 모든 저장소에 `.gitattributes`를 두고 `* text=auto eol=lf`와 `*.bat text eol=crlf`를 기본으로 한다. 기존 저장소는 `git add --renormalize .` 후 커밋한다.
- WSL의 Git은 `git config --global core.autocrlf input`으로 두고, 같은 작업 트리를 윈도우용 Git과 WSL Git이 번갈아 만지지 않는다.
- 편집기의 줄 끝을 LF로, 인코딩을 BOM 없는 UTF-8로 정한다. 팀이면 EditorConfig의 `end_of_line = lf`로 공유한다.
- "파일이 있는데 없다"는 오류에는 `file`과 `od -c`부터 실행한다.

## 숫자로 보기
| 이름 | 바이트 | `od -c` 표기 |
|---|---|---|
| LF | 0A | `\n` |
| CR | 0D | `\r` |
| UTF-8 BOM | EF BB BF | `357 273 277` |

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 줄 끝 문제는 결국 바이트 값(0x0D, 0x0A)의 문제이고, `od`가 보여 주는 16진수·8진수 표기를 읽는 데 그 글의 수 체계가 쓰인다.
- Git 버전 관리 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」: 줄 끝이 바뀌면 블롭 내용이 달라져 해시도 달라지므로, 정규화는 저장소에 어떤 블롭이 들어가는지를 정하는 일이다.
- 5편 「상호 운용: 리눅스에서 윈도우 프로그램을, 윈도우에서 리눅스 명령을」: 두 세계를 파이프로 섞을 때도 윈도우 프로그램의 출력에 CR이 섞여 같은 문제가 생긴다.

## 정리
- CRLF 스크립트는 shebang이 `/bin/bash\r`가 되어 "파일이 없다"는 오류를, 본문은 `$'\r': command not found`를 낸다. `file`과 `od -c`로 확인한다.
- 줄바꿈 규칙은 개인 설정 `core.autocrlf`가 아니라 저장소의 `.gitattributes`에 두고, 기존 파일은 `--renormalize`로 고친다. `git ls-files --eol`로 저장소와 작업 트리를 따로 본다.
- 실행 비트는 `git update-index --chmod=+x`로 인덱스에 기록하고, 대소문자 충돌은 `git ls-files | sort -f | uniq -di`로 미리 찾는다. BOM은 `#!`을 무력화한다.

## 더 알아보기
- 이전 글: 3편 「파일 시스템: 리눅스 쪽 ext4와 /mnt/c, 어디에 코드를 둘까」
- 다음 글: 5편 「상호 운용: 리눅스에서 윈도우 프로그램을, 윈도우에서 리눅스 명령을」
- Git 속성 문서: https://git-scm.com/docs/gitattributes
