# [WSL 개발 환경 10/10] 문제 해결과 관리: 디스크 회수, 메모리, 흔한 오류

> **한 줄 요약** — 리눅스에서 파일을 지워도 `ext4.vhdx`가 줄지 않는 것은 빈 블록 정보가 바깥 파일까지 내려가지 않기 때문이고(희소 VHD나 압축으로 회수한다), 메모리·시계·DNS·오류 코드 문제도 "윈도우 쪽 VM과 리눅스 쪽 배포판 중 어디의 일인가"를 먼저 가르면 대부분 문서에 정해진 해결책이 있다.

## 이 글에서 다루는 것
- 가상 디스크가 자라기만 하는 이유를 ext4 이미지로 재현하고 회수하기
- `df`·`du`로 리눅스 쪽 디스크 사용량 진단, 지웠는데 공간이 안 돌아오는 경우
- 메모리 회수 설정과 `wsl --export` 정기 백업
- 공식 문서의 오류 코드, 시계 어긋남, DNS 점검, 로그 수집

## 지웠는데 C 드라이브가 그대로다
도커 이미지와 `node_modules`를 잔뜩 지웠는데 윈도우의 C 드라이브 여유 공간은 그대로이고, 배포판 폴더의 `ext4.vhdx`는 수십 GB다. 3편에서 본 대로 배포판의 파일 시스템은 윈도우에 파일 하나로 놓인 가상 디스크(VHDX) 안의 ext4다. 공식 문서에 따르면 이 디스크는 쓰는 만큼 자라고 기본 최대 크기는 1TB다(WSL 0.58.0 이전에는 512GB, 그 전에는 256GB).

## 왜 자라기만 하나: ext4 이미지로 재현
ext4가 파일을 지우면 자기 비트맵에 "이 블록은 비었다"고 적을 뿐, 그 아래 저장 장치에 알리지는 않는다. 바깥 파일을 줄이려면 빈 블록 정보를 아래로 내려보내야 하고(discard, SSD의 TRIM과 같은 명령), 받는 쪽 파일이 구멍을 허용하는 희소(sparse) 파일이어야 한다. 리눅스의 희소 파일 위에 ext4 이미지를 만들어 같은 일을 재현해 보자. 마운트 없이 `mkfs.ext4 -d`로 폴더 내용을 담고, `debugfs`로 이미지 안의 파일을 지운다.
```bash
mkdir -p rootfs && head -c 100M /dev/urandom > rootfs/big.bin
truncate -s 1G disk.img                    # 최대 1GB, 실제로는 빈 희소 파일
mkfs.ext4 -q -d rootfs disk.img            # rootfs를 담은 ext4 이미지
usage() {                                  # 실제 할당 / 겉보기 크기
  echo "$1: 실제 $(du -m disk.img | cut -f1)MB" \
       "/ 최대 $(du -m --apparent-size disk.img | cut -f1)MB"
}
usage "만든 직후"
debugfs -w -R "rm big.bin" disk.img >/dev/null 2>&1   # 이미지 안에서 삭제
usage "안에서 삭제 후"
e2fsck -fy -E discard disk.img >/dev/null 2>&1    # 빈 블록을 discard
usage "discard 후"
```
```text
만든 직후: 실제 133MB / 최대 1024MB
안에서 삭제 후: 실제 133MB / 최대 1024MB
discard 후: 실제 33MB / 최대 1024MB
```
이미지 안에서 100MB 파일을 지워도 바깥 파일은 133MB 그대로다. 빈 블록을 discard하자 바깥 파일에 구멍이 뚫려 33MB(저널과 메타데이터)로 줄었다. `ext4.vhdx`도 같은 구조다. 리눅스에서 지운 공간은 VHDX가 회수할 방법을 갖출 때까지 윈도우로 돌아가지 않는다.

## 회수하기: 희소 VHD와 압축
2023년 9월 업데이트(WSL 2.0.0)에서 실험 기능으로 들어온 희소 VHD가 바로 그 방법이다(WSL 소스에도 "Sparse VHDs are currently experimental"이라는 경고 문구가 남아 있다). WSL 도움말은 `--set-sparse`를 "디스크 공간을 자동으로 회수할 수 있게 VHD를 희소로 설정"한다고 설명한다. 새로 만드는 VHD는 `.wslconfig`의 `[experimental] sparseVhd=true`로(6편), 이미 있는 배포판은 명령으로 바꾼다.
```powershell
wsl --shutdown
wsl --manage Ubuntu --set-sparse true
# 수동 압축(Hyper-V 모듈 필요): 읽기 전용으로 붙여 Full 모드
Mount-VHD -Path "<ext4.vhdx 경로>" -ReadOnly
Optimize-VHD -Path "<ext4.vhdx 경로>" -Mode Full
Dismount-VHD -Path "<ext4.vhdx 경로>"
```
`Optimize-VHD`는 Hyper-V PowerShell 모듈의 명령이다. 문서상 디스크가 연결되지 않았거나 읽기 전용으로 연결된 상태에서만 동작하고, 빈 블록까지 찾아 회수하는 Full 모드는 읽기 전용으로 연결했을 때만 쓸 수 있다. VHDX 경로는 공식 문서의 레지스트리 조회 스크립트(`HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss`의 `BasePath`)로 찾는다. WSL 저장소의 최신 도움말에는 `--manage`에 `--compact`도 보이므로, 여러분의 버전에 있는지 `wsl --help`로 확인한다. 회수 전에 리눅스 안의 쓰레기부터 지운다(`docker system prune`은 도커와 컨테이너 14편, `sudo apt clean`). 반대로 1TB 한도가 모자라면 `wsl --manage <배포판> --resize <크기>`(WSL 2.5 이상)로 늘린다.

## 무엇이 공간을 차지하나: df와 du
`df`는 파일 시스템 전체의 사용량을, `du`는 폴더를 돌며 파일 크기를 더한 값을 보여 준다. 공식 문서는 윈도우에서 `wsl.exe --system -d <배포판> df -h /mnt/wslg/distro`로 배포판 디스크를 보는 방법을 안내하고, 리눅스 안에서는 `df -h /`다. WSL에서는 크기 열이 실제 남은 윈도우 디스크와 상관없이 VHD 최대 크기(1TB)로 나온다. 아래 결과는 이 글을 실행한 우분투 24.04 컨테이너(WSL 아님)의 것이라 값을 가렸다.
```bash
df -hT /
```
```text
Filesystem     Type  Size  Used Avail Use% Mounted on
/dev/… ext4 … /
```
어디가 큰지는 `du`로 한 단계씩 내려가며 찾는다.
```bash
mkdir -p proj/node_modules/pkg proj/src proj/.cache
head -c 30M /dev/zero > proj/node_modules/pkg/big.dat
head -c 5M /dev/zero > proj/.cache/blob
echo 'print(1)' > proj/src/app.py
du -h -d1 proj | sort -h                   # 한 단계 깊이, 작은 것부터
```
```text
8.0K	proj/src
5.1M	proj/.cache
31M	proj/node_modules
36M	proj
```
실무에서는 `du -h -d1 ~ | sort -h`로 시작해 큰 폴더로 내려간다. `~/.cache`, 언어별 패키지 캐시, 도커 데이터가 단골이다. `df`의 Used가 `du` 합계보다 훨씬 크다면, 지웠지만 아직 어떤 프로세스가 열고 있는 파일을 의심한다. 파일 이름은 사라졌어도 열린 동안에는 블록이 해제되지 않는다.
```bash
head -c 50M /dev/zero > app.log
sleep 300 >> app.log &                    # 로그를 열어 둔 채 도는 프로세스
LOGPID=$!
rm app.log
readlink /proc/$LOGPID/fd/1 | sed "s#$PWD/##"   # 열린 파일이 가리키는 곳
stat -L -c '%s bytes' /proc/$LOGPID/fd/1        # 아직 남은 크기
kill $LOGPID                              # 프로세스가 닫아야 공간이 돌아온다
```
```text
app.log (deleted)
52428800 bytes
```
전체에서 찾을 때는 `sudo find /proc/*/fd -lname '*(deleted)'`를 쓰고, 해당 서비스를 다시 시작한다(8편).

## 메모리: 캐시와 autoMemoryReclaim
VM은 `.wslconfig`의 `memory`(기본 윈도우 메모리의 50%)까지 쓴다. 예전 문서는 프로세스가 해제한 메모리는 윈도우로 돌아가지만 페이지 캐시는 WSL을 끌 때까지 돌려주지 않는다고 설명했다. 2023년 9월에 실험 기능 `autoMemoryReclaim`이 들어왔고, 2026년 10월 문서는 `[experimental]`의 이 값을 `disabled`, `gradual`(천천히 회수), `dropCache`(즉시 회수)로 설명하며 기본값을 `dropCache`로 적고 있다. 쓰는 버전의 문서를 확인하고, 빌드가 많아 메모리가 모자라면 `memory` 한도를 정하고, 급하면 `wsl --shutdown`이 가장 확실하다.

## 정기 백업
배포판은 `wsl --export`로 tar 파일 하나가 된다(옵션은 2편). 작업 스케줄러로 주기 실행하고, 가끔은 다른 이름으로 `--import`해 복원이 되는지 확인한다.
```powershell
$f = "D:\backup\ubuntu-$(Get-Date -Format yyyyMMdd).tar"
wsl --export Ubuntu $f
wsl --import Ubuntu-restore-test D:\wsl\restore-test $f   # 복원 연습 후
wsl --unregister Ubuntu-restore-test                      # 지운다
```

## 흔한 오류 코드
공식 문제 해결 문서에서 확인한 것만 모았다.

| 코드 | 원인 | 해결 |
| --- | --- | --- |
| 0x80370102 | 가상화 꺼짐 | 기능·BIOS 켜기 |
| 0x80070003 | C 밖에 설치 | C로 옮기기 |
| 0x8007019e | WSL 기능 꺼짐 | 기능 켜기 |
| 0x1bc | 커널 업데이트 필요 | `wsl --update` |
| 0x80040306 | 레거시 콘솔 | 콘솔 속성에서 해제 |
| 0x80040154 | 업데이트 뒤 기능 꺼짐 | 다시 켜기 |
| 0x8000FFFF | 예기치 않은 실패 | 업데이트·재시작 |

표의 "가상화 꺼짐"은 윈도우의 가상 머신 플랫폼 기능이나 BIOS/UEFI의 CPU 가상화가 꺼진 경우이고, 둘 다 켰는데도 같으면 `bcdedit`의 `hypervisorlaunchtype` 설정을 확인한다. 0x80070003은 배포판을 시스템 드라이브(C)가 아닌 곳에 설치했거나 가상화가 꺼진 경우다. 0x8000FFFF는 `wsl --update`, `wsl --shutdown`, 관리자 PowerShell의 `sfc /scannow` 순서로 시도한다.

갑자기 꺼진 뒤 "mounted read-only as a fallback"이 뜨고 `Read-only file system`으로 쓰기가 실패하면, 문서의 절차대로 `wsl --mount <vhdx> --vhd --bare`로 붙인 뒤 `e2fsck -f /dev/<장치>`로 고친다. 위에서 이미지에 쓴 그 `e2fsck`다.

## 시계가 어긋날 때
절전·최대 절전에서 깨어난 뒤 리눅스 시계가 윈도우와 어긋나 `apt update`나 TLS 인증서 검사가 실패하던 문제는 오래된 단골이었다. 캐노니컬의 Ubuntu on WSL 문서는 이 문제가 커널 패치(Hyper-V 시간 샘플로 즉시 동기화)로 고쳐져 기본으로 윈도우 시계와 맞춰진다고 설명한다. 오히려 리눅스 쪽 NTP 클라이언트가 윈도우와 다른 서버로 맞추면 어긋날 수 있어, 우분투 24.04 이하는 기본으로 켜진 `systemd-timesyncd`를 끄라고 권한다(25.10부터는 chrony가 WSL에서 기본으로 시계를 바꾸지 않는다). 확인은 양쪽 UTC 시각 비교로 한다.
```sh
date -u                                                    # 리눅스
powershell.exe -NoProfile -Command "[DateTime]::UtcNow"    # 윈도우(5편의 상호 운용)
sudo systemctl disable --now systemd-timesyncd             # 24.04 이하에서 충돌할 때
```

## DNS가 안 될 때
순서대로 좁힌다. `/etc/resolv.conf`가 WSL이 만든 파일인지(`generateResolvConf`, 6편), DNS 터널링이면 `nameserver 10.255.255.254`인지(7편) 본다. `getent hosts <이름>`은 프로그램들이 쓰는 시스템 경로(보통 `/etc/hosts` 다음 DNS)로 이름을 풀어 보므로, `ping`보다 먼저 쓰기 좋다.
```bash
getent hosts localhost
```
```text
127.0.0.1       localhost
```
VPN 연결 뒤 끊긴다면 문제 해결 문서는 DNS 터널링을 켜 두거나, `[network] generateResolvConf=false`로 자동 생성을 끄고 VPN의 DNS 서버(`ipconfig.exe /all`로 확인)를 `/etc/resolv.conf` 첫 줄에 직접 쓰는 방법을 안내한다. 회사 방화벽 정책이 로컬 규칙을 막아 NAT의 DNS 패킷이 차단되는 경우도 문서에 있고, 이때도 DNS 터널링이 해법이다.

## 로그 수집
이슈를 올리거나 문의할 때 필요한 정보는 WSL 저장소의 안내대로다. 윈도우 버전(`cmd.exe /c ver`), `wsl --version`, `wsl -l -v`, 커널(`cat /proc/version`). 자세한 로그는 관리자 PowerShell에서 공식 스크립트로 모은다.
```powershell
Invoke-WebRequest -UseBasicParsing -OutFile collect-wsl-logs.ps1 `
  "https://raw.githubusercontent.com/microsoft/WSL/master/diagnostics/collect-wsl-logs.ps1"
.\collect-wsl-logs.ps1 -LogProfile networking   # 재현한 뒤 아무 키나 눌러 종료
```
부팅 문제는 `.wslconfig`의 `debugConsole=true`(윈도우 11)로 `dmesg` 창을 띄워 보고, systemd를 켰다면 `journalctl -b`로 이번 시작의 로그를 본다.

## 어디에 쓰이나
- 메모리 시스템 9편 「플래시 저장 장치: NAND 셀, FTL, 쓰기 증폭」: SSD가 TRIM으로 빈 블록을 알아야 정리하듯, VHDX도 discard를 받아야 줄어든다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 지운 파일이 공간을 계속 차지하는 것은 열린 파일 디스크립터가 이름과 별개로 파일을 붙잡기 때문이다.
- 도커와 컨테이너 14편 「컨테이너로 일하는 습관: 개발 환경, 디버깅, 정리, 그다음 단계」: 이미지·볼륨 정리로 리눅스 쪽 공간을 비운 뒤에야 VHDX 회수가 의미가 있다.

## 정리
- VHDX는 리눅스에서 지워도 줄지 않는다. 빈 블록이 discard로 내려가 희소 파일에 구멍이 나야 줄고, WSL에서는 희소 VHD(`--set-sparse`)나 `Optimize-VHD`로 회수한다.
- `du -h -d1 | sort -h`로 큰 폴더를 찾고, `df`와 `du`가 크게 다르면 지웠지만 열린 파일을 찾는다.
- 메모리는 `memory` 한도와 `autoMemoryReclaim`, 시계는 리눅스 쪽 NTP 충돌, DNS는 `resolv.conf`와 DNS 터널링부터 본다.
- 오류 코드는 공식 문제 해결 문서에, 자세한 로그는 `collect-wsl-logs.ps1`에 맡긴다.

## 더 알아보기
- 이전 글: 9편 「WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱」
- 처음 글: 1편 「WSL이란: 윈도우 안의 리눅스, WSL 1과 WSL 2의 구조」
- How to manage WSL disk space: https://learn.microsoft.com/windows/wsl/disk-space
