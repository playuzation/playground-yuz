# [WSL 개발 환경 8/10] systemd와 백그라운드 서비스: WSL에서 데몬 운영하기

> **한 줄 요약** — WSL 배포판의 PID 1은 기본으로 WSL 자체 init이라 `systemctl`이 듣지 않지만, `wsl.conf`에 `[boot] systemd=true`를 넣으면 systemd가 PID 1이 되어 유닛 파일로 서비스를 정의·감시·자동 재시작할 수 있다. 다만 서비스가 돌고 있어도 WSL은 유휴 시간이 지나면 멈춘다.

## 이 글에서 다루는 것
- `System has not been booted with systemd` 오류의 정체와 PID 1 확인
- systemd 없이 서비스를 띄우던 방식(`service`, `[boot] command`)과 그 한계를 실행으로 확인
- 유닛 파일 작성과 `systemd-analyze verify`로 오류 잡기
- `systemctl`·`journalctl`로 PostgreSQL, 도커 엔진, SSH 운영하기
- WSL이 멈추는 시점과 유휴 시간 설정

## 증상: systemctl이 듣지 않는다
PostgreSQL을 설치하고 `systemctl start postgresql`을 치면 이런 메시지를 만날 수 있다. 이 글을 실행한 컨테이너도 systemd가 PID 1이 아니라서 똑같은 메시지가 나온다.
```bash
systemctl status
```
```text
System has not been booted with systemd as init system (PID 1). Can't operate.
Failed to connect to bus: Host is down
```
`systemctl`은 PID 1로 도는 systemd 관리자에게 버스로 명령을 전하는 클라이언트일 뿐이다. 관리자가 없으니 할 일이 없다. systemd가 떠 있는지는 `/run/systemd/system` 폴더로 판단하는 것이 관례다(systemd 라이브러리의 `sd_booted()`가 이 폴더를 본다).
```bash
if [ -d /run/systemd/system ]; then echo "systemd가 PID 1"
else echo "systemd 아님"; fi
```
```text
systemd 아님
```

## PID 1과 WSL의 init
PID 1은 커널이 처음 띄우는 프로세스로, 나머지 프로세스를 시작하고 부모를 잃은 프로세스를 거둬들이는(reap) 일을 맡는다(운영체제와 프로세스는 트랜지스터에서 자연어까지 10편). WSL은 배포판마다 자체 init을 PID 1로 띄우는데, 이 init이 윈도우와 리눅스 사이의 통신(5편의 상호 운용 등)을 맡는다. 마이크로소프트는 2022년 9월 21일 블로그로 systemd 지원을 발표했다. 공식 문서 기준 요구 사항과 동작은 이렇다.
- WSL 0.67.6 이상(`wsl --version`으로 확인, 이 옵션이 없다는 오류가 나면 `wsl --update`)과 WSL 2 배포판.
- `/etc/wsl.conf`에 `[boot]` 아래 `systemd=true`를 넣고 `wsl --shutdown`으로 다시 시작한다(6편의 적용 규칙).
- `wsl --install`이 기본으로 설치하는 현재 버전의 우분투는 이미 systemd가 기본이다. 다른 배포판은 여전히 WSL init을 쓸 수 있다.
- systemd를 켜면 systemd가 PID 1이 되고 WSL init은 그 자식 프로세스가 된다.

## systemd 없이 띄우던 방식
systemd 이전에는 `/etc/init.d`의 스크립트를 `sudo service postgresql start`로 부르는 방식(SysV init)을 썼고, 공식 문서의 데이터베이스 튜토리얼도 이 명령을 쓴다. 매번 치기 귀찮으면 `wsl.conf`의 `[boot] command`(시작할 때 root로 실행, 문서상 윈도우 11·Server 2022)에 `service docker start` 같은 명령을 넣는다. 이런 스크립트가 실제로 하는 일을 흉내 내 보면 한계가 보인다. 프로세스를 배경으로 띄우고 PID를 파일에 적는 것이 전부다.
```sh
# 파일: devsvc.sh
PIDFILE=notes.pid
alive() { ps -o stat= -p "$1" | grep -q '^[^Z]'; }   # 좀비(Z)는 죽은 것
case "$1" in
start)
  nohup python3 -m http.server 8765 --bind 127.0.0.1 >notes.log 2>&1 &
  echo $! > "$PIDFILE"; echo "시작" ;;
status)
  if [ ! -f "$PIDFILE" ]; then echo "멈춤"
  elif alive "$(cat "$PIDFILE")"; then echo "실행 중"
  else echo "pid 파일은 있는데 프로세스가 없음"; exit 3; fi ;;
stop)
  kill "$(cat "$PIDFILE")" 2>/dev/null; rm -f "$PIDFILE"; echo "정지" ;;
esac
```
서비스를 띄운 뒤 `kill -9`로 프로세스가 죽은 상황을 만든다.
```bash
sh devsvc.sh start && sleep 1
sh devsvc.sh status
kill -9 "$(cat notes.pid)"; sleep 1     # 서버가 죽었다
sh devsvc.sh status
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8765/
sh devsvc.sh stop
```
```text
시작
실행 중
pid 파일은 있는데 프로세스가 없음
HTTP 000
정지
```
아무도 다시 띄워 주지 않고, 남은 pid 파일은 거짓말을 한다. PID는 재사용되므로 낡은 pid 파일이 엉뚱한 프로세스를 가리킬 수도 있다. 로그도 각자 파일에 흩어진다. systemd는 서비스를 자기 자식으로 직접 띄워 cgroup으로 추적하므로 pid 파일 없이 상태를 알고, 죽으면 정책대로 다시 띄우며, 출력은 저널 한 곳에 모은다.

## 유닛 파일로 서비스 정의하기
같은 서버를 systemd 서비스로 정의한 유닛 파일이다.
```ini
# 파일: notes-api.service
[Unit]
Description=Notes API (dev)
After=network.target

[Service]
Type=simple
User=dev
WorkingDirectory=/home/dev/notes
ExecStart=/usr/bin/python3 -m http.server 8765 --bind 127.0.0.1
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```
`ExecStart`의 프로세스가 곧 서비스이고(`Type=simple`), `User`와 `WorkingDirectory`로 권한과 위치를 정한다. `Restart=on-failure`는 비정상 종료 시 2초(`RestartSec`) 뒤 다시 띄우고, `[Install]`의 `WantedBy=multi-user.target`은 `enable`했을 때 부팅 과정에 끼워 넣을 자리다. 설치하기 전에 `systemd-analyze verify`로 검사한다. 이 명령은 systemd가 PID 1이 아니어도 파일을 검사할 수 있다. 정상 파일은 아무것도 출력하지 않는다.
```bash
systemd-analyze verify ./notes-api.service && echo "통과"
```
```text
통과
```
흔한 실수 세 가지를 넣어 본다. 키 이름 오타, 허용되지 않는 값, 실행 파일 경로 오타다.
```bash
sed -e 's/^Restart=on-failure/Restart=sometimes/' \
    -e 's#/usr/bin/python3#/usr/bin/pyhton3#' notes-api.service > bad1.service
sed -e 's/^ExecStart=/ExecStrat=/' notes-api.service > bad2.service
systemd-analyze verify ./bad1.service
systemd-analyze verify ./bad2.service
```
```text
…bad1.service:11: Failed to parse service restart specifier, ignoring: sometimes
bad1.service: Command /usr/bin/pyhton3 is not executable: No such file or directory
…bad2.service:10: Unknown key name 'ExecStrat' in section 'Service', ignoring.
bad2.service: Service has no ExecStart=, ExecStop=, or SuccessAction=. Refusing.
Unit bad2.service has a bad unit file setting.
```
눈여겨볼 것은 `ignoring`이다. 오타 난 키와 틀린 값은 경고만 남기고 무시된다. `Restart=sometimes`는 재시작 정책이 기본값으로 남아 "죽으면 다시 뜬다"는 기대가 조용히 깨지고, `ExecStrat` 오타는 실행할 명령이 없어져 유닛 자체가 거부된다.

## systemctl과 journalctl
검사를 통과한 유닛은 `/etc/systemd/system/`에 두고 systemd에 알린다. 아래는 systemd가 켜진 WSL에서 쓰는 명령이다.
```sh
sudo cp notes-api.service /etc/systemd/system/
sudo systemctl daemon-reload              # 유닛 파일을 다시 읽는다
sudo systemctl enable --now notes-api     # 자동 시작 등록 + 지금 시작
systemctl status notes-api                # 상태와 최근 로그 몇 줄
journalctl -u notes-api -f                # 이 서비스의 로그 따라 보기
journalctl -u notes-api --since "10 min ago"
systemctl --failed                        # 실패한 유닛 목록
```
자주 쓰는 데몬도 같은 방식이다. 패키지가 유닛 파일을 함께 설치하므로 켜기만 하면 된다. 도커 엔진을 WSL 안에 직접 설치하는 방식과 도커 데스크톱의 차이는 9편에서 다룬다.
```sh
sudo systemctl enable --now postgresql    # PostgreSQL 서버
sudo systemctl enable --now docker        # WSL 안에 설치한 도커 엔진
sudo systemctl enable --now ssh           # OpenSSH 서버
```
서비스가 바인딩하는 주소와 포트는 7편의 방법(`ss -ltnp`)으로 확인한다. 공식 문서는 데비안·우분투·칼리에서 systemd를 켤 때 `systemd`와 함께 `systemd-sysv` 패키지가 설치돼 있는지도 확인하라고 한다.

## WSL은 언제 멈추나
리눅스 서버에서는 enable한 서비스가 계속 돌지만, WSL은 다르다. 공식 문서는 systemd 서비스가 WSL 인스턴스를 살려 두지 않는다고 분명히 적는다. 2026년 10월 문서 기준 `.wslconfig`의 관련 값은 다음과 같다.
```ini
[general]
; 배포판 유휴 종료(기본 15000ms), -1이면 끄지 않음
instanceIdleTimeout=-1

[wsl2]
; VM 유휴 종료(기본 60000ms, 윈도우 11 전용)
vmIdleTimeout=60000
```
즉 터미널을 모두 닫고 유휴 시간(현재 문서의 기본 15000ms)이 지나면 배포판이 멈추고, systemd도 그 안의 서비스도 함께 내려간다. 6편의 "약 8초"는 같은 문서의 더 오래된 설명이라 버전마다 다를 수 있으니 `wsl --list --running`으로 확인한다. 다음에 터미널을 열면 systemd가 다시 시작하며 enable한 서비스를 띄운다. 계속 돌려야 한다면 터미널 하나를 열어 두거나 `instanceIdleTimeout=-1`로 바꾸되, 그만큼 메모리를 계속 쓴다는 점(10편)을 감안한다. `wsl --shutdown`은 이 모든 것을 즉시 끈다. 한편 시작 쪽에는 `wsl.conf`의 `[boot] initTimeout`(기본 10000ms)이 있어 systemd 초기화를 그만큼 기다린다.

## 흔한 실수와 문제 해결
- `systemd=true`를 넣고 창만 닫았다: 배포판이 아직 돌고 있다. `wsl --shutdown` 후 다시 연다.
- `[boot] command`와 systemd가 같은 서비스를 둘 다 띄운다: 하나는 `Address already in use`로 죽는다. systemd를 켰다면 `command`의 `service ...` 줄은 지운다.
- 서비스가 "가끔" 꺼져 있다: 고장이 아니라 유휴 종료일 수 있다. 저널이 디스크에 남는다면 `journalctl --list-boots`와 `journalctl -b -1`로 이전 시작의 마지막 로그를 본다.
- 유닛을 고쳤는데 그대로다: `daemon-reload`를 잊었다.

## 숫자로 보기
| 항목 | 값 |
| --- | --- |
| systemd 지원 발표 | 2022년 9월 21일 |
| 필요한 WSL 버전 | 0.67.6 이상 |
| `instanceIdleTimeout` 기본 | 15000ms |
| `vmIdleTimeout` 기본 | 60000ms |
| `initTimeout` 기본 | 10000ms |

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: init이 모든 프로세스의 조상이고 고아를 거둔다는 운영체제의 기본 구조가 PID 1 논의의 바탕이다.
- 도커와 컨테이너 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」: 컨테이너 안 PID 1이 시그널과 좀비를 다루지 못해 생기는 문제가 같은 뿌리다.
- PostgreSQL 실무 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」: 서버를 컨테이너 대신 WSL에 직접 설치한다면 `systemctl enable --now postgresql`로 띄운다.

## 정리
- `systemctl`은 PID 1 systemd의 클라이언트다. systemd가 없으면 `System has not been booted with systemd` 오류가 난다.
- `[boot] systemd=true`와 `wsl --shutdown`으로 systemd를 켠다(WSL 0.67.6 이상, 현재 우분투는 기본).
- pid 파일 방식은 죽은 서비스를 알아채지도 다시 띄우지도 못한다. 유닛 파일의 `Restart=`와 저널이 그 일을 한다. 설치 전에 `systemd-analyze verify`로 `ignoring` 경고를 잡는다.
- systemd 서비스가 있어도 WSL은 유휴 시간이 지나면 멈춘다. 필요하면 `instanceIdleTimeout`을 조정한다.

## 더 알아보기
- 이전 글: 7편 「네트워크: NAT와 미러 모드, localhost 포워딩, 포트 열기」
- 다음 글: 9편 「WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱」
- Use systemd to manage Linux services with WSL: https://learn.microsoft.com/windows/wsl/systemd
