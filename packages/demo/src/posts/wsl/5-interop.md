# [WSL 개발 환경 5/10] 상호 운용: 리눅스에서 윈도우 프로그램을, 윈도우에서 리눅스 명령을

> **한 줄 요약** — 리눅스 커널의 binfmt_misc가 `MZ`로 시작하는 윈도우 실행 파일을 WSL의 중계 프로그램에 넘기기 때문에 bash에서 `notepad.exe`가 실행되고, 반대로 `wsl.exe`는 윈도우 명령줄을 리눅스 셸에 넘기며, 그 사이에서 PATH·환경 변수(`WSLENV`)·경로·줄 끝을 맞추는 규칙을 알아야 두 세계를 안전하게 섞을 수 있다.

## 이 글에서 다루는 것
- 리눅스 셸에서 `explorer.exe`, `cmd.exe`, `powershell.exe`를 부르는 원리: binfmt_misc 등록을 직접 재현하기
- 윈도우에서 `wsl ls`, `wsl -e`, `wsl -d`와 파이프로 두 세계 섞기
- PATH에 윈도우 경로가 붙는 동작(`appendWindowsPath`)과 그 비용
- `WSLENV`로 환경 변수 넘기기, 경로 변환, 성능과 보안상 주의

## 문제: 두 세계를 오가는 일상
WSL에서 작업하다 보면 지금 폴더를 윈도우 탐색기로 열고 싶고, 공개 키를 윈도우 클립보드에 복사하고 싶다. 반대로 PowerShell 스크립트 안에서 `grep`이나 `sed`를 한 번 쓰고 싶을 때도 있다. WSL은 두 방향을 모두 지원한다. 아래는 리눅스 셸에서 쓰는 예다(윈도우가 있어야 하므로 이 글의 환경에서는 실행하지 않았다).
```sh
explorer.exe .
cat ~/.ssh/id_ed25519.pub | clip.exe
cmd.exe /c ver
powershell.exe -NoProfile -Command 'Get-Date'
```
공식 문서에 따르면 이렇게 실행하는 윈도우 프로그램은 확장자 `.exe`까지 정확히 써야 하고, 현재 리눅스 셸의 작업 폴더를 이어받으며, WSL을 실행한 윈도우 사용자로 그 사용자 권한만큼 돈다. 리눅스에서 `sudo`를 붙여도 윈도우 쪽 권한이 올라가지 않는다.

## 원리: 커널이 실행 파일 머리를 본다
`execve`로 파일을 실행하면 커널은 파일 앞부분을 읽어 형식을 고른다. ELF면 바로 적재하고, `#!`이면 적힌 인터프리터를 부른다(4편의 CRLF 문제가 여기서 났다). 그 밖의 형식을 추가하는 장치가 **binfmt_misc**다. "이런 바이트로 시작하는 파일은 이 프로그램에게 넘겨라"를 등록해 두면 커널이 그대로 따른다. 윈도우 실행 파일(PE 형식)은 모두 `MZ` 두 바이트로 시작한다. 등록이 없으면 커널은 이 파일을 실행할 줄 모른다.
```bash
printf 'MZ\x90\x00' > notepad.exe && chmod +x notepad.exe
od -c -N 2 notepad.exe | head -1
bash -c './notepad.exe memo.txt'
```
```text
0000000   M   Z
bash: line 1: ./notepad.exe: cannot execute binary file: Exec format error
```
이제 `MZ`를 중계 프로그램에 넘기도록 등록한다. 시스템 전체를 건드리지 않도록 `unshare`로 만든 사용자 네임스페이스 안에서만 binfmt_misc를 마운트했다(리눅스 6.7부터 네임스페이스마다 따로 등록할 수 있다). 등록 문자열의 형식은 `:이름:종류:오프셋:매직:마스크:인터프리터:플래그`이고 종류 `M`은 매직 바이트로 판별하라는 뜻이다.
```bash
cat > relay.sh <<'EOF'
#!/bin/sh
echo "중계 프로그램이 받은 인자: $*"
EOF
chmod +x relay.sh
cat > interop-demo.sh <<'EOF'
mount -t binfmt_misc none /proc/sys/fs/binfmt_misc
echo ":DemoInterop:M::MZ::$PWD/relay.sh:" > /proc/sys/fs/binfmt_misc/register
cat /proc/sys/fs/binfmt_misc/DemoInterop
./notepad.exe memo.txt
echo 0 > /proc/sys/fs/binfmt_misc/DemoInterop
./notepad.exe memo.txt
EOF
unshare --user --map-root-user --mount sh interop-demo.sh
```
```text
enabled
interpreter …/relay.sh
flags:
offset 0
magic 4d5a
중계 프로그램이 받은 인자: ./notepad.exe memo.txt
interop-demo.sh: 6: ./notepad.exe: Exec format error
```
매직 `4d5a`는 `MZ`의 16진수다. 커널은 `./notepad.exe memo.txt`를 실행하는 대신 중계 프로그램에 파일 경로와 인자를 넘겼다. WSL도 같은 방식으로 `WSLInterop`이라는 항목을 등록하고, 그 중계 프로그램이 윈도우 쪽에 프로세스 생성을 부탁해 표준 입출력을 이어 준다. 항목에 0을 쓰자 다시 실행할 수 없게 됐다. 공식 문서가 안내하는 "이 세션에서만 상호 운용 끄기"가 바로 `WSLInterop`에 0을 쓰는 것이다. 실제 WSL에서 `cat /proc/sys/fs/binfmt_misc/WSLInterop`으로 등록 내용을 볼 수 있다.

## 윈도우에서 리눅스 명령 부르기
PowerShell에서는 `wsl` 뒤에 리눅스 명령을 붙인다. 기본은 기본 배포판의 기본 셸이 명령줄을 해석하고, `-e`(`--exec`)는 셸 없이 바로 실행한다. 아래 출력은 예다.
```powershell
wsl ls -la                  # 기본 배포판의 기본 셸로
wsl -d Debian -u root id    # 배포판과 사용자 지정
wsl echo '$HOME'            # 리눅스 셸이 $HOME을 펼친다
wsl -e echo '$HOME'         # 셸이 없으니 글자 그대로
```
```text
…
uid=0(root) gid=0(root) groups=0(root)
/home/me
$HOME
```
PowerShell 쪽에서 따옴표 없이 `$HOME`을 쓰면 PowerShell이 먼저 윈도우 값으로 바꿔 버린다. 어느 쪽 셸이 언제 펼치는지를 따옴표로 정한다. 셸 시작 파일이 출력을 내는 환경에서 프로그램끼리 통신할 때는 `-e`가 안전하다. 파이프로 두 세계를 섞을 수도 있다.
```powershell
wsl ls -la | findstr "git"
dir | wsl grep git
```

## PATH에 붙는 윈도우 경로
WSL은 기본적으로 윈도우의 PATH를 리눅스 PATH 뒤에 붙인다(`/etc/wsl.conf`의 `[interop] appendWindowsPath`, 기본값 true, 6편). 그래서 `code .`나 `explorer.exe`가 경로 없이 실행된다. 대신 리눅스에 없는 명령은 조용히 윈도우 쪽 같은 이름이 실행된다. 윈도우 경로를 `win-bin` 폴더로 흉내 내 보자.
```bash
mkdir -p linux-bin win-bin
printf '#!/bin/sh\necho "리눅스 쪽 npm"\n' > linux-bin/npm
printf '#!/bin/sh\necho "윈도우 쪽 npm"\n' > win-bin/npm
chmod +x linux-bin/npm win-bin/npm
P="$PWD/linux-bin:/usr/bin:/bin:$PWD/win-bin"
PATH="$P" sh -c npm
rm linux-bin/npm
PATH="$P" sh -c npm
strace -f -qq -e trace=newfstatat -o st.log \
  env PATH="$P" sh -c nosuchcmd
grep -o '"[^"]*nosuchcmd"' st.log | sed "s|$PWD|.|"
```
```text
리눅스 쪽 npm
윈도우 쪽 npm
sh: 1: nosuchcmd: not found
"./linux-bin/nosuchcmd"
"/usr/bin/nosuchcmd"
"/bin/nosuchcmd"
"./win-bin/nosuchcmd"
```
리눅스에 node를 설치하지 않았는데 `npm install`이 돈다면 윈도우의 npm이 리눅스 파일을 다루고 있는 것이다. 또 없는 명령 하나를 칠 때마다 셸은 PATH의 폴더를 하나씩 확인한다. WSL에서는 그 뒤쪽이 `/mnt/c` 아래 폴더 수십 개이고, 확인 하나하나가 9P 왕복이다(3편). 윈도우 경로를 빼려면 `appendWindowsPath=false`로 두고 필요한 폴더만 직접 붙인다. 지금 셸에서만 빼 보려면 이렇게 거른다.
```bash
WINPATH='/usr/bin:/bin:/mnt/c/Windows/system32:/mnt/c/Program Files/nodejs'
printf '%s\n' "$WINPATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -
```
```text
/usr/bin:/bin
```

## WSLENV: 환경 변수 넘기기
경계를 넘을 때 환경 변수는 기본적으로 넘어가지 않는다. 넘길 변수 이름을 `WSLENV`에 콜론으로 이어 적고, 이름 뒤에 플래그를 붙여 변환 방식을 정한다. 공식 문서 기준 플래그는 넷이다.

| 플래그 | 뜻 |
|---|---|
| `/p` | 경로를 반대쪽 형식으로 변환 |
| `/l` | 경로 목록으로 보고 하나씩 변환 |
| `/u` | 윈도우에서 WSL을 부를 때만 넘김 |
| `/w` | WSL에서 윈도우를 부를 때만 넘김 |

```powershell
$env:PROJ = "C:\work\app"
$env:WSLENV = "PROJ/p"
wsl -e sh -c 'echo $PROJ'
```
```text
/mnt/c/work/app
```
리눅스 경로를 윈도우 프로그램에 인자로 넘길 때는 `wslpath -w`로 바꾼다(3편). `notepad.exe "$(wslpath -w memo.txt)"`처럼 쓴다.

## 파이프와 CR
윈도우 프로그램의 출력은 CRLF로 끝난다. 리눅스 도구로 잘라 쓰면 값 끝에 CR이 남아 4편과 같은 문제가 생긴다. `ipconfig.exe`의 출력을 흉내 내어 확인하자.
```bash
printf 'IPv4 Address. . . : 172.20.0.1\r\n' > ipconfig-out.txt
ip=$(grep IPv4 ipconfig-out.txt | cut -d: -f2 | tr -d ' ')
printf '%s' "$ip" | od -c | head -1
ip=$(grep IPv4 ipconfig-out.txt | cut -d: -f2 | tr -d ' \r')
echo "[$ip]"
```
```text
0000000   1   7   2   .   2   0   .   0   .   1  \r
[172.20.0.1]
```

## 흔한 실수와 문제 해결
- `notepad: command not found`: 리눅스에서는 `notepad.exe`처럼 확장자까지 쓴다.
- 리눅스 폴더에서 `cmd.exe`를 부르면 아래 경고가 나고 윈도우 폴더에서 실행된다(출력 예). cmd.exe는 UNC 경로를 현재 폴더로 쓰지 못하므로 `cd /mnt/c` 뒤에 부르거나 `powershell.exe`를 쓴다.
```text
'\\wsl.localhost\Ubuntu\home\me'
CMD.EXE was started with the above path as the current directory.
UNC paths are not supported.  Defaulting to Windows directory.
```
- `.exe`가 `Exec format error`로 실행되지 않는다: 상호 운용이 꺼진 상태다. `/proc/sys/fs/binfmt_misc/WSLInterop`이 있는지, `/etc/wsl.conf`의 `[interop] enabled`가 false가 아닌지 본다(6편).
- 윈도우 프로그램이 리눅스 경로를 못 연다: `wslpath -w`로 바꿔 넘긴다.

## 권장 설정과 체크리스트
- 자주 쓰는 윈도우 도구(`explorer.exe`, `clip.exe`, `code`)만 PATH에 남기고 나머지는 빼면 명령 탐색이 빨라지고 이름 충돌이 사라진다.
- 프로그램 사이 연동은 `wsl -e`처럼 셸을 거치지 않는 형태로, 윈도우 출력은 `tr -d '\r'`로 정리한다.
- 상호 운용은 리눅스 프로세스가 윈도우 사용자 권한으로 윈도우 프로그램을 실행하는 통로다. 믿을 수 없는 코드를 돌리는 배포판이면 `[interop] enabled=false`로 막는다.

## 어디에 쓰이나
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: 커널이 ELF 머리를 보고 적재하는 과정에 binfmt_misc가 "다른 형식은 이 프로그램에게"라는 규칙을 더한다.
- 도커와 컨테이너 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」: 다른 CPU용 이미지를 QEMU로 실행하는 멀티 아키텍처 빌드도 같은 binfmt_misc 등록으로 실행 파일을 에뮬레이터에 넘긴다.
- 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」: 파이프로 받은 윈도우 출력의 CR은 그 글의 CRLF 문제와 같은 원인이다.

## 정리
- bash에서 `notepad.exe`가 실행되는 것은 binfmt_misc의 `WSLInterop` 등록이 `MZ` 파일을 중계 프로그램에 넘기기 때문이고, 같은 등록을 사용자 네임스페이스에서 재현하고 끌 수 있었다.
- `wsl 명령`은 기본 셸이 해석하고 `wsl -e`는 셸 없이 실행한다. 따옴표로 어느 쪽 셸이 펼칠지 정한다.
- 윈도우 PATH는 뒤에 붙어 리눅스에 없는 명령을 대신 실행하고, 없는 명령마다 `/mnt/c` 폴더를 훑는다. `WSLENV` 플래그와 `wslpath`로 변수와 경로를 맞춘다.

## 더 알아보기
- 이전 글: 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」
- 다음 글: 6편 「wsl.conf와 .wslconfig: 배포판 설정과 가상 머신 설정」
- WSL 파일 시스템과 상호 운용(공식 문서): https://learn.microsoft.com/windows/wsl/filesystems
