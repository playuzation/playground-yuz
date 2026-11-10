# [WSL 개발 환경 3/10] 파일 시스템: 리눅스 쪽 ext4와 /mnt/c, 어디에 코드를 둘까

> **한 줄 요약** — WSL 2에서 리눅스 홈은 VM 안 커널이 직접 다루는 가상 디스크 위 ext4이고 `/mnt/c`는 파일 연산마다 9P 메시지로 VM 경계를 넘는 원격 파일 시스템이라서, 작은 파일 수천 개를 다루는 설치·빌드·`git status`와 inotify 파일 감시는 프로젝트를 리눅스 쪽에 둘 때만 제 성능과 동작을 낸다.

## 이 글에서 다루는 것
- 배포판 파일이 사는 곳: ext4.vhdx 가상 디스크
- `/mnt/c`와 `\\wsl.localhost`: 경계를 넘는 두 방향의 파일 접근
- 작은 파일 1000개 작업의 시스템 호출 수 세기와 `time`으로 위치별 비교하기
- 파일 감시(inotify)가 `/mnt/c`에서 동작하지 않는 이유와 `wslpath`

## 문제: 같은 저장소, 다른 속도
윈도우에서 쓰던 습관대로 `C:\Users\me\work`에 저장소를 두고 WSL에서 `cd /mnt/c/Users/me/work`로 들어가 `npm install`을 하면 몇 배 느리다. 개발 서버의 자동 새로고침도 윈도우 편집기로 저장한 변경을 알아채지 못한다. 같은 디스크, 같은 파일인데 왜 그럴까. 답은 파일이 "어느 커널의 파일 시스템에 있는가"에 있다.

## 배포판 파일이 사는 곳: ext4.vhdx
WSL 2 배포판의 루트 파일 시스템은 윈도우 쪽에서 보면 ext4.vhdx라는 가상 디스크 파일 하나다. VM이 뜨면 이 파일은 리눅스 커널에 블록 장치로 붙고, 커널은 일반 리눅스와 똑같이 ext4로 마운트해 페이지 캐시와 함께 다룬다. 이 시리즈의 실행 환경도 가상 머신이라 사정이 같다. 현재 폴더가 가상 디스크 장치 위의 ext4임을 확인할 수 있다.
```bash
findmnt -T . -no FSTYPE,SOURCE
```
```text
ext4   /dev/vda
```
vhdx 파일이 어디 있는지는 윈도우 레지스트리에 배포판별로 적혀 있다. 아래 PowerShell은 배포판 이름으로 폴더(`BasePath`)를 찾아 파일 경로를 만든다. 이 파일을 직접 복사하거나 열 때는 먼저 `wsl --shutdown`으로 VM을 끈다. 크기 회수는 10편, 백업과 이동은 2편에서 다룬다.
```powershell
(Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss |
  Where-Object { $_.GetValue("DistributionName") -eq "Ubuntu" }
).GetValue("BasePath") + "\ext4.vhdx"
```

## 경계를 넘는 두 방향
리눅스에서 `/mnt/c`를 열면 그 파일은 VM 밖의 NTFS에 있다. WSL 2는 윈도우 드라이브를 DrvFs로 마운트하는데, 그 아래에서는 9P라는 파일 공유 프로토콜이 돈다. `stat`, `openat`, `getdents64` 같은 시스템 호출 하나하나가 9P 요청이 되어 VM 경계를 건너 윈도우 쪽 서버로 가고, 응답이 돌아와야 다음으로 넘어간다. 반대로 윈도우 탐색기에서 `\\wsl.localhost\Ubuntu\home\me`(`\\wsl$`로도 열린다)를 열면 리눅스 안에서 도는 9P 서버가 요청을 받는다.
```text
+-- WSL 2 VM -----------------+
| app --> ext4 (fast path)    |
| app --> 9P client           |
+-----------+-----------------+
            | request/reply
            v   (per file op)
Windows 9P server --> NTFS
```
ext4 쪽 시스템 호출은 커널 안의 함수 호출과 페이지 캐시 조회로 끝나지만, `/mnt/c` 쪽은 매번 경계를 넘는 왕복이다. 파일 하나를 읽는 비용은 작아도, 작업이 파일 수천 개를 건드리면 왕복 횟수가 곧 시간이 된다.

## 따라 하기: 작은 파일 작업의 시스템 호출 세기
패키지 설치를 흉내 내어 파일 1000개짜리 묶음을 만들고, 풀 때와 `git status`를 할 때 커널을 몇 번 부르는지 `strace`로 센다(없으면 `sudo apt install strace`).
```bash
for p in $(seq 20); do
  d=proj/node_modules/pkg$p; mkdir -p $d
  for f in $(seq 50); do echo "module.exports=$f" > $d/f$f.js; done
done
tar --mtime=2026-01-01 -cf pkgs.tar proj && rm -rf proj
cat > count.sh <<'EOF'
# 사용: bash count.sh 명령... (파일 관련 시스템 호출을 센다)
log=$(mktemp)
strace -f -qq -o "$log" -e trace=%file,getdents64,write,close "$@"
grep -oE '^[0-9]+ +[a-z0-9_]+' "$log" | awk '{print $2}' |
  sort | uniq -c | sort -rn | head -4
echo "합계 $(wc -l < "$log")"; rm -f "$log"
EOF
bash count.sh tar -xf pkgs.tar
```
```text
   1039 openat
   1032 close
   1022 utimensat
   1000 write
합계 4167
```
파일 1000개를 푸는 데 시스템 호출이 4천 번 넘게 나갔다. 파일마다 열고, 쓰고, 닫고, 수정 시각을 맞춘다. 이제 저장소로 만들고 `git status`를 세어 보자.
```bash
cd proj && git init -q && git add . && git commit -qm init
strace -f -qq -o ../st.log -e trace=newfstatat git status --short
grep -c 'node_modules/.*\.js"' ../st.log
cd ..
```
```text
1000
```
변경이 하나도 없는데도 `git status`는 추적 중인 파일 1000개마다 정확히 한 번씩 `newfstatat`으로 크기와 수정 시각을 확인했다(인덱스에 적어 둔 값과 비교한다). 묶을 때 `--mtime`으로 파일 시각을 과거로 고정한 것은, 인덱스를 쓴 순간과 같은 때 수정된 파일은 git이 한 번 더 확인해서 호출 수가 흔들리기 때문이다. `/mnt/c`에서는 이 호출 하나하나가 9P 왕복이다. 실제 `node_modules`는 파일이 수만 개라서 차이는 그만큼 커진다.

## 측정: 위치만 바꿔서 time으로 비교하기
원리를 알았으면 내 환경에서 재 본다. 같은 명령을 위치만 바꿔 실행하고 `time`의 실제 경과 시간(`real`)을 비교하면 된다. 여기서는 ext4 폴더와 메모리 파일 시스템(tmpfs)을 비교했다. WSL에서는 `~/bench`와 `/mnt/c/Users/<이름>/bench`를 넣으면 된다. 측정값은 환경마다 다르므로 가렸다.
```bash
TIMEFORMAT='  %R초'
for d in ./bench /dev/shm/bench-$$; do
  mkdir -p "$d"; echo "${d%-*} 풀기"
  time tar -xf pkgs.tar -C "$d"
  rm -rf "$d"
done
```
```text
./bench 풀기
  …초
/dev/shm/bench 풀기
  …초
```
캐시 영향을 줄이려면 같은 측정을 세 번쯤 반복해 가운데 값을 쓴다. 공식 문서는 리눅스 명령줄에서 작업한다면 파일을 WSL 파일 시스템에 두라고 권하고, 예로 `/mnt/c/Users/<이름>/Project` 대신 `/home/<이름>/Project`를 든다. 거꾸로 PowerShell 같은 윈도우 도구로 주로 다루는 파일은 윈도우 쪽에 두라고 한다. 경계를 넘는 쪽이 느리다는 같은 원리다.

## 파일 감시: inotify가 받지 못하는 변경
개발 서버의 자동 새로고침, `nodemon`, 테스트 감시 모드는 리눅스 커널의 inotify에 "이 폴더가 바뀌면 알려 달라"고 등록해 둔다. 파이썬으로 직접 등록해 보면 원리가 보인다.
```python
import ctypes, os, struct
libc = ctypes.CDLL(None, use_errno=True)
NAMES = {0x2: "IN_MODIFY", 0x100: "IN_CREATE", 0x200: "IN_DELETE"}
os.makedirs("src", exist_ok=True)
fd = libc.inotify_init1(0)
libc.inotify_add_watch(fd, b"src", 0x2 | 0x100 | 0x200)

with open("src/app.js", "w") as f:    # 편집기가 저장하는 것처럼
    f.write("console.log(1)\n")
os.remove("src/app.js")

buf, i = os.read(fd, 4096), 0
while i < len(buf):                    # struct inotify_event 해석
    wd, mask, cookie, n = struct.unpack_from("iIII", buf, i)
    print(NAMES.get(mask, hex(mask)), buf[i + 16:i + 16 + n].rstrip(b"\0").decode())
    i += 16 + n
```
```text
IN_CREATE app.js
IN_MODIFY app.js
IN_DELETE app.js
```
이벤트는 변경이 리눅스 커널의 파일 시스템 코드를 지나갈 때 생긴다. `/mnt/c`의 파일을 윈도우 편집기가 저장하면 그 쓰기는 윈도우 커널과 NTFS에서 일어나고 리눅스 커널은 지나가지 않으므로 이벤트가 생길 곳이 없다. WSL 2의 이 제약은 WSL GitHub 이슈(#4739)로 오래 보고된 알려진 문제다. 해결은 프로젝트를 리눅스 쪽으로 옮기는 것이고, 어쩔 수 없으면 도구의 폴링 감시(예: Vite의 `server.watch.usePolling`)를 켠다. 폴링은 주기적으로 `stat`을 도는 방식이라 파일이 많으면 앞의 비용을 계속 치른다.

## 경로 바꾸기: wslpath
두 세계의 경로를 오갈 때는 `wslpath`를 쓴다. 기본(`-u`)은 윈도우 경로를 리눅스 경로로, `-w`는 리눅스 경로를 윈도우 경로로, `-m`은 슬래시를 쓰는 윈도우 경로로 바꾼다. 아래는 공식 문서의 예다. 윈도우 프로그램에 경로를 넘기는 쓰임은 5편.
```sh
wslpath 'C:\Users\username\file.txt'
wslpath -w ~/file.txt
wslpath -m /mnt/c/Users/username/file.txt
```
```text
/mnt/c/Users/username/file.txt
\\wsl.localhost\Ubuntu-22.04\home\username\file.txt
C:/Users/username/file.txt
```

## 흔한 실수와 문제 해결
- `/mnt/c`에 클론해 둔 저장소가 느리다: 리눅스 쪽에서 새로 `git clone`한다. `mv`로 옮기면 파일 시스템 사이 복사가 되어 그 자체가 오래 걸린다.
- `ENOSPC: System limit for number of file watchers reached`: 이번에는 위치가 아니라 VM 안 커널의 inotify 감시 개수 한도(`fs.inotify.max_user_watches`) 문제다. 배포판 안에서 sysctl로 늘린다.
- 도커 바인드 마운트가 느리다: `/mnt/c` 폴더를 컨테이너에 마운트하면 같은 경계를 넘는다. 리눅스 쪽 폴더를 마운트한다(9편).
- 윈도우 프로그램으로 리눅스 파일을 고치고 싶다: `\\wsl.localhost` 경로나 VS Code의 WSL 연결(9편)을 쓴다. vhdx 파일을 직접 열지 않는다.

## 권장 설정과 체크리스트
- 저장소는 `~/work` 같은 리눅스 쪽 폴더에 클론하고, 윈도우 탐색기에서는 `\\wsl.localhost\<배포판>`으로 연다.
- 다운로드 폴더처럼 윈도우 앱이 주로 쓰는 파일만 `/mnt/c`에서 읽는다.
- 느리다고 느껴지면 감으로 판단하지 말고 같은 명령을 위치만 바꿔 `time`으로 잰다.
- 파일을 꼭 윈도우 쪽에 두고 리눅스 도구로 다뤄야 한다면 그 배포판만 WSL 1로 쓰는 방법도 있다(1편).

## 숫자로 보기
| 작업(파일 1000개) | 시스템 호출 수 |
|---|---|
| tar로 풀기 | 4167 |
| 그중 openat | 1039 |
| `git status`의 newfstatat | 1000 |

## 어디에 쓰이나
- 메모리 시스템 1편 「메모리 계층 지도: 레지스터에서 SSD까지 지연과 대역폭」: 연산 하나의 지연 × 연산 횟수가 시간이라는 계산이 9P 왕복 수천 번에 그대로 적용된다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 프로그램은 같은 `openat`을 부르지만 그 아래 파일 시스템 코드(ext4 대 9P 클라이언트)에 따라 비용과 inotify 이벤트 유무가 갈린다.
- 도커와 컨테이너 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」: 바인드 마운트할 원본 폴더를 리눅스 쪽에 두어야 하는 이유가 이 글의 경계 비용이다.

## 정리
- WSL 2 배포판의 파일은 ext4.vhdx 위 ext4이고, VM 안 커널이 직접 다뤄 빠르다.
- `/mnt/c`와 `\\wsl.localhost`는 9P로 VM 경계를 넘으므로 파일 연산마다 왕복 비용이 든다. 파일 1000개를 풀 때 시스템 호출 4167번, 변경 없는 `git status`도 파일마다 한 번씩 나간다.
- 윈도우 쪽에서 바뀐 `/mnt/c` 파일은 리눅스 커널을 지나지 않아 inotify 이벤트가 생기지 않는다.
- 리눅스 도구로 다루는 프로젝트는 리눅스 쪽에 두고, 의심되면 위치만 바꿔 `time`으로 잰다.

## 더 알아보기
- 이전 글: 2편 「설치와 배포판 관리: wsl 명령으로 설치, 전환, 백업, 이동하기」
- 다음 글: 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」
- 파일 시스템 간 작업(공식 문서): https://learn.microsoft.com/windows/wsl/filesystems
