# [WSL 개발 환경 2/10] 설치와 배포판 관리: wsl 명령으로 설치, 전환, 백업, 이동하기

> **한 줄 요약** — `wsl.exe` 하나로 설치·버전 전환·종료·백업을 모두 하며, 배포판은 결국 리눅스 루트 파일 시스템 묶음이라서 `--export`로 tar를 떠 두고 `--import`로 원하는 드라이브에 되살릴 수 있지만, `--unregister`는 가상 디스크를 통째로 지우므로 백업이 온전한지 확인한 뒤에만 쓴다.

## 이 글에서 다루는 것
- 설치 요구 사항과 `wsl --install`, 배포판 고르기
- 상태 보기와 전환: `-l -v`, `--set-default`, `--set-version`, `--update`
- `--shutdown`과 `--terminate`의 차이
- `--export`/`--import`로 백업하고 다른 드라이브로 옮기기, `--unregister`의 위험
- 팀 표준 배포판을 tar로 만들어 내용을 검증하기

## 문제: 새 노트북, 꽉 찬 C 드라이브
새 노트북에 개발 환경을 깔아야 하고, 몇 달 쓰다 보면 C 드라이브가 차서 배포판을 D 드라이브로 옮기고 싶어진다. 인터넷의 "WSL 초기화" 글을 따라 `wsl --unregister`를 쳤다가 홈 폴더의 커밋 안 한 코드를 잃는 사고도 흔하다. 명령 몇 개를 외우기 전에 알아 둘 사실은 하나다. 배포판은 윈도우에 등록된 이름 하나와, 그 이름이 가리키는 리눅스 루트 파일 시스템(WSL 2에서는 ext4.vhdx 가상 디스크)이다. 설치는 이것을 만들고, 백업은 복사하고, 등록 해제는 지운다.

## 설치: 요구 사항과 wsl --install
공식 문서 기준으로 윈도우 10 버전 2004(빌드 19041) 이상이나 윈도우 11이 필요하고, 펌웨어(BIOS/UEFI)에서 CPU 가상화가 켜져 있어야 한다. WSL 2 VM은 윈도우의 "가상 머신 플랫폼" 기능 위에서 돈다. 관리자 PowerShell에서 아래 한 줄이면 필요한 기능을 켜고 기본 배포판 Ubuntu를 설치한다. 재부팅 뒤 배포판을 처음 열면 리눅스 사용자 이름과 암호를 만든다. 윈도우 계정과는 별개다.
```powershell
wsl --install
```
다른 배포판은 이름을 확인해 고른다. 이 명령은 WSL이 아직 없을 때만 전체 설치를 하고, 이미 있으면 도움말만 보여 주므로 그때는 `-d`로 배포판을 지정한다. 다운로드가 0.0%에서 멈추면 `--web-download`로 스토어 대신 직접 받는다.
```powershell
wsl --list --online
wsl --install -d Debian
wsl --install --web-download -d Ubuntu-24.04
```
bash 안에서 윈도우 쪽 명령을 부를 때는 `wsl` 대신 `wsl.exe`로 쓴다(5편). 예전 방식처럼 기능을 직접 켜야 하는 환경이라면 `dism.exe`로 두 기능을 켠다.
```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

## 상태 보기와 전환
`-l -v`(`--list --verbose`)는 등록된 배포판과 상태, WSL 버전을 보여 준다. 별표가 기본 배포판, 즉 인자 없이 `wsl`을 쳤을 때 열리는 배포판이다. 아래는 출력 예다.
```powershell
wsl -l -v
```
```text
  NAME      STATE           VERSION
* Ubuntu    Running         2
  Debian    Stopped         2
```
```powershell
wsl --set-default Debian          # 기본 배포판 바꾸기(-s)
wsl --set-version Ubuntu 2        # 이 배포판을 WSL 2로 변환
wsl --set-default-version 2       # 앞으로 설치할 배포판의 기본 버전
wsl -d Debian                     # 특정 배포판 열기
wsl -d Debian -u root             # 특정 사용자로 열기
wsl --update                      # WSL과 커널 갱신
wsl --version                     # WSL·커널 등 구성 요소 버전
wsl --status                      # 기본 배포판, 기본 버전 등
```
`--set-version`은 파일 시스템 전체를 NTFS와 가상 디스크 사이에서 옮기는 변환이라 배포판 크기만큼 시간과 공간이 든다. `wsl --install`로 새로 설치한 배포판은 기본이 WSL 2다. `wsl --update`는 스토어에서 받고, `--web-download`를 붙이면 GitHub에서 받는다.

## 끄기: --terminate와 --shutdown
`wsl --terminate Ubuntu`(`-t`)는 그 배포판만 멈춘다. 같은 VM의 다른 배포판은 계속 돈다. `wsl --shutdown`은 모든 배포판과 WSL 2 경량 VM 자체를 즉시 끈다. 배포판의 `/etc/wsl.conf`를 고쳤다면 그 배포판만 다시 시작하면 되지만, VM 설정인 `.wslconfig`는 VM이 새로 떠야 적용되므로 `--shutdown`이 필요하다(6편). 두 명령 모두 안에서 돌던 프로세스를 그냥 끊으므로 편집 중인 파일과 데이터베이스는 먼저 저장하고 멈춘다.

## 백업과 이동: export, unregister, import
`--export`는 배포판의 루트 파일 시스템을 tar 파일 하나로 뜬다. WSL 2라면 `--vhd`를 붙여 .vhdx 그대로 떠도 된다. `--import`는 tar(또는 `--vhd`로 vhdx)에서 새 배포판을 만들고 가상 디스크를 지정한 폴더에 둔다. 그래서 배포판을 D 드라이브로 옮기는 정석은 내보내기, 등록 해제, 가져오기 세 단계다.
```powershell
wsl --shutdown
wsl --export Ubuntu D:\backup\ubuntu.tar
wsl --unregister Ubuntu
wsl --import Ubuntu D:\WSL\Ubuntu D:\backup\ubuntu.tar --version 2
```
셋째 줄이 위험 지점이다. 공식 문서는 등록을 해제하면 그 배포판의 모든 데이터·설정·소프트웨어가 영구히 사라진다고 경고한다. 휴지통도 없다. 이미 vhdx 파일이 원하는 위치에 있다면 복사 없이 그 자리에서 등록하는 `--import-in-place`도 있다. 가져온 배포판은 처음 설치할 때 정한 기본 사용자를 모르므로 root로 열리기 쉽다. 기본 사용자는 스토어 배포판이면 `ubuntu config --default-user dev`처럼 배포판 실행 명령으로, 일반적으로는 배포판 안의 `/etc/wsl.conf` `[user]` 항목으로 정한다(6편).

## 따라 하기: 팀 표준 배포판을 tar로 만들기
배포판이 "루트 파일 시스템 tar"라는 사실을 거꾸로 이용하면 팀 표준 환경을 배포할 수 있다. 공식 문서도 컨테이너를 `docker export`로 tar로 떠서 `wsl --import`하는 방법을 안내한다. 사용자 `dev`와 기본 사용자 설정을 넣은 Ubuntu를 만들어 보자. `ubuntu:24.04` 이미지에는 uid 1000인 `ubuntu` 계정이 이미 있어서, 지우고 `dev`에게 1000을 준다.
```dockerfile
# 파일: Dockerfile
FROM ubuntu:24.04
RUN userdel -r ubuntu \
 && useradd -m -u 1000 -s /bin/bash dev \
 && printf '[user]\ndefault=dev\n' > /etc/wsl.conf
```
```bash
docker build -q -t team-wsl . > /dev/null
docker create --name team-wsl-src team-wsl > /dev/null
docker export team-wsl-src -o team-ubuntu.tar
du -h team-ubuntu.tar
tar -tf team-ubuntu.tar | grep -E '^(etc/wsl.conf|home/dev/)$'
```
```text
77M	team-ubuntu.tar
etc/wsl.conf
home/dev/
```

## 검증: tar 안을 열어 보고, 깨진 백업을 잡아내기
가져오기 전에 tar 안의 설정과 계정을 직접 읽어 확인한다.
```bash
tar -xOf team-ubuntu.tar etc/wsl.conf
tar -xOf team-ubuntu.tar etc/passwd | grep -E '^(dev|ubuntu):'
```
```text
[user]
default=dev
dev:x:1000:1000::/home/dev:/bin/bash
```
이 파일을 윈도우로 옮겨 `wsl --import TeamUbuntu D:\WSL\TeamUbuntu .\team-ubuntu.tar`로 가져오면 `dev`로 열리는 배포판이 된다. 같은 확인은 `--unregister` 직전의 백업에도 필요하다. 복사가 중간에 끊긴 tar를 흉내 내 보면, 목록을 끝까지 읽는 `tar -tf`가 실패로 알려 준다.
```bash
head -c 1000000 team-ubuntu.tar > broken.tar
tar -tf broken.tar > /dev/null
echo "종료 코드 $?"
```
```text
tar: Unexpected EOF in archive
tar: Error is not recoverable: exiting now
종료 코드 2
```
백업을 다른 곳으로 옮긴다면 해시를 함께 적어 두고 옮긴 뒤 대조한다.
```bash
sha256sum team-ubuntu.tar > team-ubuntu.tar.sha256
sha256sum -c team-ubuntu.tar.sha256
docker rm team-wsl-src > /dev/null && docker rmi team-wsl > /dev/null
```
```text
team-ubuntu.tar: OK
```

## 흔한 실수와 문제 해결
- `wsl --install`이 도움말만 출력한다: WSL이 이미 설치된 상태다. `wsl --list --online`으로 이름을 보고 `wsl --install -d <이름>`을 쓴다.
- 문제를 고치려고 `--unregister`부터 한다: 설정 문제는 `wsl --shutdown` 뒤 다시 여는 것으로 풀리는 경우가 많다. 지우기 전에는 반드시 `--export`하고 `tar -tf`로 확인한다.
- 가상화 관련 오류로 시작이 안 된다: 펌웨어의 가상화 설정과 "가상 머신 플랫폼" 기능을 확인한다. 오류 코드별 해결은 10편.
- 가져온 배포판이 root로 열린다: `/etc/wsl.conf`의 `[user] default`를 설정한다.
- 같은 이름으로 가져오려다 실패한다: 배포판 이름은 겹칠 수 없으니 다른 이름을 쓰거나 기존 것을 먼저 정리한다.

## 권장 설정과 체크리스트
| 상황 | 명령 |
|---|---|
| 처음 설치 | `wsl --install` |
| 배포판 상태 | `wsl -l -v` |
| VM 설정 적용 | `wsl --shutdown` |
| 정기 백업 | `wsl --export` |
| 드라이브 이동 | export → unregister → import |
| 구성 요소 갱신 | `wsl --update` |

- 배포판은 용도별로 여러 개 둘 수 있다. 실험용은 `--import`로 따로 만들어 쓰고 버린다.
- 백업 tar는 `tar -tf`와 해시로 확인한 다음에만 원본을 지운다.

## 한계와 버전별 차이
윈도우 쪽 명령의 출력은 공식 문서로 확인한 형태를 예로 든 것이며, 옵션은 WSL 버전에 따라 늘어난다. 공식 문서에 따르면 배포판 디스크를 다루는 `wsl --manage`는 WSL 2.5 이상에서만 쓸 수 있으므로, 쓰기 전에 `wsl --help`로 내 버전의 옵션을 확인한다. 윈도우 10 버전 2004 이전에서는 `wsl --install`이 없어 수동 설치 절차를 따른다. 디스크 크기 회수는 10편에서 다룬다.

## 어디에 쓰이나
- 도커와 컨테이너 2편 「이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트」: `docker export`는 이미지 레이어를 쌓아 올린 결과를 평평한 tar 하나로 뜨고, WSL은 그 tar를 배포판의 루트 파일 시스템으로 쓴다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 백업을 `sha256sum -c`로 대조하는 것은 한 바이트만 달라도 해시가 달라진다는 성질에 기댄 검사다.
- 6편 「wsl.conf와 .wslconfig: 배포판 설정과 가상 머신 설정」: tar에 넣은 `/etc/wsl.conf`의 `[user]` 말고도 배포판마다 정할 수 있는 설정이 그 글에 있다.

## 정리
- 배포판은 등록된 이름과 루트 파일 시스템(WSL 2에서는 ext4.vhdx)이며, `wsl --install`·`-d`로 만들고 `-l -v`로 상태와 버전을 본다.
- `--terminate`는 배포판 하나, `--shutdown`은 모든 배포판과 VM을 끈다. `.wslconfig` 적용에는 `--shutdown`이 필요하다.
- 이동은 export → unregister → import이고, `--unregister`는 되돌릴 수 없으니 tar를 `tar -tf`와 해시로 확인한 뒤에 한다.
- 루트 파일 시스템 tar를 직접 만들면 팀 표준 배포판을 나눠 줄 수 있다.

## 더 알아보기
- 이전 글: 1편 「WSL이란: 윈도우 안의 리눅스, WSL 1과 WSL 2의 구조」
- 다음 글: 3편 「파일 시스템: 리눅스 쪽 ext4와 /mnt/c, 어디에 코드를 둘까」
- WSL 기본 명령(공식 문서): https://learn.microsoft.com/windows/wsl/basic-commands
