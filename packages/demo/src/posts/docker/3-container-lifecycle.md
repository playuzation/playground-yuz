# [도커와 컨테이너 3/14] 컨테이너 생명 주기: run, exec, logs, stop과 시그널

> **한 줄 요약** — `docker stop`은 컨테이너의 PID 1에 SIGTERM을 보내고 유예 시간(기본 10초)이 지나면 SIGKILL을 보내는데, 네임스페이스의 PID 1은 핸들러를 걸지 않은 시그널을 무시하므로 셸 형식 CMD나 핸들러 없는 앱은 10초를 버티다 137로 강제 종료된다.

## 이 글에서 다루는 것
- 컨테이너의 상태: created, running, paused, exited와 그 사이를 잇는 명령
- `run -d`, `exec`, `logs`로 컨테이너 다루기
- `stop`과 `kill`, 종료 코드 137과 143
- PID 1 문제 재현과 해결: exec 형식, 시그널 핸들러, `trap`, `--init`
- 재시작 정책과 `docker ps -a`로 종료 원인 읽기

## 문제: 배포할 때마다 10초씩 멈추고 요청이 끊긴다
새 버전을 배포하면 옛 컨테이너를 멈추는 데 매번 정확히 10초가 걸리고, 그동안 처리 중이던 요청은 응답 없이 끊긴다. 앱에는 종료 시 연결을 마무리하는 코드가 있는데도 그렇다. 원인은 앱 코드가 아니라 시그널이 앱까지 가지 못하는 데 있다. 이 글은 그 경로를 따라간다.

## 상태와 명령
```text
docker create
      ↓
   created
      │ start
      ↓
   running ⇄ paused  (pause/unpause)
      │ stop / kill / process exit
      ↓
   exited ── start ──→ running
      │ rm
      ↓
   (removed)
```
`docker run`은 `create`와 `start`를 한 번에 한다. 상태를 하나씩 확인해 보자.
```bash
docker create --name life alpine:3.20 sleep 300 > /dev/null
docker inspect --format '{{.State.Status}}' life
docker start life > /dev/null && docker inspect --format '{{.State.Status}}' life
docker pause life > /dev/null && docker inspect --format '{{.State.Status}}' life
docker exec life true
docker unpause life > /dev/null && docker kill life > /dev/null
docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' life
docker rm life
```
```text
created
running
paused
Error response from daemon: Container life is paused, unpause the container before exec
exited 137
life
```
`pause`는 시그널이 아니라 cgroup의 freezer로 프로세스를 얼려 두는 것이라 그동안 `exec`도 안 된다. `kill`은 기본으로 SIGKILL을 보내고, 종료 코드는 128 + 9 = 137이 된다. 멈춘(exited) 컨테이너는 쓰기 계층과 로그를 가진 채 남아 있다가 `rm`으로 지워진다.

## run -d, logs, exec
`-d`(detach)는 컨테이너를 백그라운드로 띄우고, 컨테이너의 표준 출력·오류는 데몬이 모아 두었다가 `docker logs`로 보여 준다. 실습용 앱은 시작 메시지를 찍고 기다리며, `--graceful`을 주면 SIGTERM 핸들러를 건다.
```python
# 파일: app.py
import signal, sys, time

def on_term(signum, frame):
    print("SIGTERM 받음: 정리 후 종료", flush=True)
    sys.exit(0)

if "--graceful" in sys.argv:
    signal.signal(signal.SIGTERM, on_term)
print("작업 시작", flush=True)
while True:
    time.sleep(1)
```
```dockerfile
# 파일: Dockerfile
FROM python:3.12-slim
COPY app.py run.sh /
CMD python /app.py
```
마지막 줄은 실무에서 흔히 보는 셸 형식 CMD다(경고의 줄 번호는 첫 줄 주석까지 센 것). 빌드하면 BuildKit이 벌써 경고를 준다(`run.sh`는 아래에서 쓴다).
```bash
printf '#!/bin/sh\ntrap "echo 정리 후 종료; exit 0" TERM\necho 작업 시작\nsleep 1000 & wait $!\n' > run.sh
docker build --progress=plain -t sigdemo . 2>&1 | grep 'WARN'
```
```text
#1 WARN: JSONArgsRecommended: JSON arguments recommended for CMD to prevent unintended behavior related to OS signals (line 4)
```
`docker exec`는 실행 중인 컨테이너에 프로세스를 하나 더 띄운다. 셸에 들어가려면 `docker exec -it <이름> sh`처럼 터미널을 붙인다.
```bash
docker run -d --name t1 --label demo=sig sigdemo > /dev/null
docker exec t1 cat /proc/1/cmdline | tr '\0' ' '; echo
docker logs t1
```
```text
/bin/sh -c python /app.py
작업 시작
```
PID 1은 파이썬이 아니라 `/bin/sh`다. 셸 형식 CMD는 `/bin/sh -c "<문자열>"`로 실행되고, 이 이미지의 `/bin/sh`(데비안의 dash)는 파이썬을 자식으로 띄운 채 남는다.

## stop의 동작과 PID 1 문제
`docker stop`은 PID 1에 SIGTERM(또는 이미지의 `STOPSIGNAL`)을 보내고, 유예 시간 안에 끝나지 않으면 SIGKILL을 보낸다. 리눅스 기본 유예 시간은 10초이고 `-t`로 바꾼다.
```bash
TIMEFORMAT='걸린 시간 %0R초'
time docker stop t1 > /dev/null
docker inspect --format '종료 코드 {{.State.ExitCode}}' t1
```
```text
걸린 시간 10초
종료 코드 137
```
정확히 10초를 기다린 뒤 SIGKILL로 죽었다. 이유는 두 겹이다. 첫째, 셸은 받은 SIGTERM을 자식에게 전달하지 않는다. 둘째, 더 근본적으로 pid 네임스페이스의 PID 1(init)은 **핸들러를 등록한 시그널만** 받는다(pid_namespaces(7)). 핸들러가 없으면 SIGTERM은 기본 동작(종료) 대신 그냥 무시된다. 바깥에서 보낸 SIGKILL만은 예외로 강제 전달된다. 그렇다면 셸을 없애고 파이썬을 PID 1로 만들면 될까. 명령을 exec 형식으로 덮어써 실행한다(`-t 3`으로 기다림을 줄였다).
```bash
docker run -d --name t2 --label demo=sig sigdemo python /app.py > /dev/null
time docker stop -t 3 t2 > /dev/null
docker inspect --format '종료 코드 {{.State.ExitCode}}' t2
```
```text
걸린 시간 3초
종료 코드 137
```
여전히 유예 시간을 다 쓰고 죽는다. 파이썬은 SIGINT에만 기본 핸들러를 두고 SIGTERM은 기본 동작에 맡기는데, PID 1에게 기본 동작은 "무시"이기 때문이다. exec 형식은 필요하지만 충분하지 않다.

## 고치는 세 가지 방법
첫째, 앱이 SIGTERM 핸들러를 건다. 원래 앱이 해야 하는 일이다. 연결을 마무리하고 스스로 끝낸다.
```bash
docker run -d --name t3 --label demo=sig sigdemo python /app.py --graceful > /dev/null
sleep 1
time docker stop t3 > /dev/null
docker inspect --format '종료 코드 {{.State.ExitCode}}' t3
docker logs t3
```
```text
걸린 시간 0초
종료 코드 0
작업 시작
SIGTERM 받음: 정리 후 종료
```
`sleep 1`은 핸들러가 걸린 뒤에 멈추려는 것이다. 핸들러를 걸기 전에 온 SIGTERM은 역시 무시된다. 둘째, 앱을 고칠 수 없으면 `--init`으로 작은 init(tini 기반의 docker-init)을 PID 1에 세운다. init은 받은 시그널을 자식에게 전달하고 좀비 프로세스도 거둔다.
```bash
docker run -d --init --name t4 --label demo=sig sigdemo python /app.py > /dev/null
time docker stop t4 > /dev/null
docker inspect --format '종료 코드 {{.State.ExitCode}}' t4
```
```text
걸린 시간 0초
종료 코드 143
```
파이썬은 이제 PID 1이 아니므로 SIGTERM의 기본 동작대로 바로 죽었고, init이 그 결과를 128 + 15 = 143으로 돌려준다. 143은 "SIGTERM으로 끝났다"는 뜻이라 대개 정상 종료로 본다. 셋째, 시작 스크립트가 PID 1이어야 한다면 스크립트가 `trap`으로 시그널을 받는다. 위에서 만든 `run.sh`가 그 예다.
```bash
docker run -d --name t5 --label demo=sig sigdemo sh /run.sh > /dev/null
sleep 1
time docker stop t5 > /dev/null
docker logs t5
```
```text
걸린 시간 0초
작업 시작
정리 후 종료
```
`sleep 1000 &` 다음 `wait`을 쓴 이유는 셸이 전경 명령을 실행하는 동안에는 trap을 미루기 때문이다. `wait`은 시그널이 오면 바로 돌아온다. 설정만 하고 앱에 넘기는 시작 스크립트라면 마지막 줄을 `exec "$@"`로 써서 셸을 앱으로 바꿔치기하는 것이 정석이다(공식 이미지들의 `docker-entrypoint.sh`가 이렇게 한다). 알파인의 busybox `sh`는 `-c` 문자열의 마지막 명령을 스스로 exec해서 셸 형식인데도 앱이 PID 1이 되기도 한다. 이미지마다 다르니 `/proc/1/cmdline`으로 확인하는 습관이 좋다.

## 종료 코드 읽기와 재시작 정책
```bash
docker ps -a --filter label=demo=sig --format '{{.Names}}\t{{.Status}}'
```
```text
t5	Exited (0) …
t4	Exited (143) …
t3	Exited (0) …
t2	Exited (137) …
t1	Exited (137) …
```
| 종료 코드 | 뜻 |
|---|---|
| 0 | 정상 종료 |
| 1 등 | 앱이 정한 오류 |
| 125 | docker 명령 자체의 오류 |
| 126 / 127 | 명령 실행 불가 / 명령 없음 |
| 137 | SIGKILL(유예 초과, kill, 메모리 초과) |
| 143 | SIGTERM으로 종료 |

137은 유예 시간 초과 말고도 메모리 제한을 넘어 OOM 킬러에 죽었을 때도 나온다. 둘은 `docker inspect`의 `OOMKilled`로 구분한다(12편). 죽은 컨테이너를 자동으로 다시 띄우는 것이 **재시작 정책**(`--restart`)이다. `no`(기본), 0이 아닌 코드로 끝날 때만 다시 띄우는 `on-failure[:최대 횟수]`, 항상 다시 띄우는 `always`, 사용자가 직접 멈춘 경우는 존중하는 `unless-stopped`가 있다.
```bash
docker run -d --name crashy --label demo=sig --restart on-failure:3 \
  alpine:3.20 sh -c 'echo 시작; exit 3' > /dev/null
sleep 4
docker inspect --format '{{.State.Status}}, 재시작 {{.RestartCount}}회, 코드 {{.State.ExitCode}}' crashy
docker logs crashy | wc -l
```
```text
exited, 재시작 3회, 코드 3
4
```
처음 실행 한 번과 재시작 세 번, 모두 네 번 실행된 뒤 포기했다. 로그는 재시작을 거쳐도 이어 쌓인다.

## 흔한 실수와 문제 해결
- `docker logs`가 비어 있다: 파이썬은 출력이 터미널이 아니면 버퍼에 모았다가 내보낸다. `ENV PYTHONUNBUFFERED=1`이나 `print(..., flush=True)`를 쓴다.
- 로그를 계속 보려면 `docker logs -f`, 끝부분만 보려면 `--tail 50`, 시각을 붙이려면 `-t`다.
- 실행 중인 컨테이너는 바로 지울 수 없다(`container is running: stop the container before removing or force remove`). `rm -f`는 SIGKILL로 즉시 지운다.
- 종료 처리가 10초보다 오래 걸리는 앱(큐 비우기 등)은 `docker stop -t`나 `docker run --stop-timeout`으로 유예 시간을 늘린다. 시그널을 SIGTERM이 아닌 것으로 받는 앱은 Dockerfile의 `STOPSIGNAL`로 바꾼다(nginx 이미지는 SIGQUIT).

```bash
docker rm -f $(docker ps -aq --filter label=demo=sig) | wc -l
docker image rm sigdemo | grep -c Untagged
```
```text
6
1
```

## 권장 설정
- CMD·ENTRYPOINT는 exec 형식(`["python", "app.py"]`)으로 쓴다(4편).
- 앱은 SIGTERM을 받으면 새 요청을 멈추고 진행 중인 일을 끝낸 뒤 0으로 종료한다. 셸 스크립트를 거치면 `exec`나 `trap`을 쓰고, 고칠 수 없으면 `--init`을 붙인다.
- 서비스 컨테이너는 `--restart unless-stopped`나 오케스트레이터의 재시작 기능에 맡기되, 계속 죽는 컨테이너는 재시작 횟수와 종료 코드로 원인부터 본다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 인터럽트로 커널이 제어를 되찾는 것처럼, 시그널은 커널이 프로세스의 실행 흐름을 끊고 핸들러로 보내는 장치다.
- 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: `docker compose down`도 컨테이너마다 같은 stop 절차를 밟으므로 PID 1 문제가 그대로 나타난다.
- PostgreSQL 실무 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 데이터베이스 컨테이너를 SIGKILL로 죽이면 다음 시작 때 WAL로 복구 과정을 거친다. 데이터베이스는 넉넉한 유예 시간을 준다.

## 정리
- 컨테이너는 created → running(⇄ paused) → exited → 삭제를 오가고, 첫 프로세스가 끝나면 컨테이너도 끝난다.
- `stop`은 SIGTERM 후 유예 시간(기본 10초) 뒤 SIGKILL이다. 137은 SIGKILL, 143은 SIGTERM으로 끝났다는 뜻이다.
- PID 1은 핸들러 없는 시그널을 무시한다. 셸 형식 CMD는 셸이 PID 1이 되어 시그널을 삼킨다.
- 해결은 exec 형식 + 앱의 SIGTERM 핸들러, `trap`·`exec`를 쓰는 스크립트, 또는 `--init`이다.

## 더 알아보기
- 이전 글: 2편 「이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트」
- 다음 글: 4편 「Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT」
- docker container stop 문서: https://docs.docker.com/reference/cli/docker/container/stop/
