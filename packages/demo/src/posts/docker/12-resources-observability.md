# [도커와 컨테이너 12/14] 리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그

> **한 줄 요약** — 컨테이너의 메모리·CPU·프로세스 수는 커널의 cgroups가 세고 막으며 메모리를 넘기면 OOM 킬러가 종료 코드 137로 끝내므로, 제한값은 cgroup 파일과 `docker inspect`로 확인하고, "살아 있지만 고장 난" 상태와 로그로 인한 디스크 고갈은 헬스 체크·로그 회전·이벤트로 미리 잡는다.

## 이 글에서 다루는 것
- `--memory`, `--cpus`, `--pids-limit`와 cgroup 파일(v1과 v2의 차이)
- OOM 킬 재현: 종료 코드 137, `OOMKilled`, `docker events`
- `HEALTHCHECK`의 상태 변화(starting → healthy → unhealthy)
- json-file 로그 회전과 로그 드라이버 기본값

## 문제: 한 컨테이너가 서버 전체를 끌고 내려간다
기본값으로 띄운 컨테이너에는 제한이 없다. 메모리가 새는 앱 하나가 호스트 메모리를 다 쓰면 커널의 OOM 킬러가 호스트의 다른 프로세스(데이터베이스, sshd)를 죽일 수도 있고, fork가 폭주하면 PID가 바닥난다. 반대로 프로세스는 살아 있는데 교착 상태라 요청에 답하지 않을 때도 `docker ps`는 태연히 `Up`이다. 이 글은 제한(cgroups)과 관찰(stats, 헬스 체크, 로그, 이벤트)을 다룬다. 실행 결과는 Docker Engine 29.6, cgroup v1 호스트 기준이다.

## 원리: cgroups는 커널의 자원 장부
**cgroups**(control groups)는 프로세스 묶음마다 자원 사용량을 세고 한도를 거는 커널 기능이다(1편). Docker는 컨테이너마다 cgroup을 만들고 `docker run`의 옵션을 그 cgroup의 파일에 쓴다. v1은 컨트롤러(memory, cpu, pids …)마다 트리를 따로 두고, v2는 한 트리에 모든 컨트롤러 파일을 둔다. Ubuntu 22.04, Debian 11 이후 같은 최근 배포판은 v2가 기본이지만 이 실행 환경은 v1이다.
```bash
docker info --format '{{.CgroupVersion}} {{.CgroupDriver}}'
docker run -d --name lim --memory 64m --cpus 0.5 --pids-limit 50 \
  alpine:3.20 sleep 300 >/dev/null
docker exec lim sh -c 'cd /sys/fs/cgroup; cat memory/memory.limit_in_bytes \
  cpu/cpu.cfs_quota_us cpu/cpu.cfs_period_us pids/pids.max'
```
```text
1 cgroupfs
67108864
50000
100000
50
```
64 MiB = 67,108,864바이트이고, `--cpus 0.5`는 "100ms 주기마다 CPU 시간 50ms까지"로 바뀌었다. 같은 옵션이 v2에서는 다른 파일에 적힌다.

| 옵션 | v1 파일 / v2 파일 |
| --- | --- |
| `--memory` | `memory.limit_in_bytes` / `memory.max` |
| `--cpus` | `cpu.cfs_quota_us` 등 / `cpu.max` |
| `--pids-limit` | `pids.max` / `pids.max` |

v2는 컨트롤러 폴더 없이 `/sys/fs/cgroup/memory.max`처럼 바로 있고, `cpu.max`는 한 줄에 `50000 100000`처럼 할당량과 주기를 함께 쓴다. `--cpus`는 코어 하나를 고정해 주는 것이 아니라 여러 코어에 걸친 합계 할당량이고, 주기 안에 다 쓰면 다음 주기까지 멈춘다(스로틀링). 평균 CPU 사용률이 낮아도 응답 지연이 튀는 원인이 된다. 호스트에서도 같은 값을 읽을 수 있다. cgroupfs 드라이버 + v1에서는 `/sys/fs/cgroup/memory/docker/<ID>/`이고, systemd 드라이버 + v2에서는 `/sys/fs/cgroup/system.slice/docker-<ID>.scope/`다.
```bash
id=$(docker inspect -f '{{.Id}}' lim)
cat /sys/fs/cgroup/memory/docker/$id/memory.limit_in_bytes
docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}' lim
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}, PIDs {{.PIDs}}' lim
docker rm -f lim >/dev/null
```
```text
67108864
67108864 134217728
lim: … / 64MiB, PIDs 1
```
`MemorySwap`이 메모리의 두 배다. `--memory-swap`을 주지 않으면 호스트에 스왑이 있을 때 메모리만큼 스왑을 더 쓸 수 있다는 뜻이고, 그러면 한도를 넘은 앱이 죽는 대신 느려진다. 결정적으로 죽게 하려면 둘을 같은 값으로 준다.

## OOM 킬 재현
16 MiB씩 메모리를 잡는 파이썬 프로그램을 64 MiB 컨테이너에서 돌린다.
```bash
t0=$(date +%s)
docker run --name hog --memory 64m --memory-swap 64m python:3.12-slim \
  python -c '
blocks = []
for i in range(1, 9):
    blocks.append(bytearray(16 * 1024 * 1024))
    print(f"{i * 16} MiB", flush=True)
'
echo "exit=$?"
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' hog
```
```text
16 MiB
32 MiB
48 MiB
exit=137
137 true
```
파이썬 자체가 쓰는 약 4 MiB(cgroup의 `memory.max_usage_in_bytes`로 잰 값)에 48 MiB를 더한 뒤, 다음 16 MiB 페이지를 채우는 순간 한도를 넘었다. 커널은 그 cgroup 안에서 OOM 킬러를 돌려 SIGKILL을 보냈고, 종료 코드는 128 + 9 = 137이다(3편). 파이썬은 `MemoryError`를 낼 기회도 없었다. 다만 137만으로 OOM이라고 단정하면 안 된다. `docker kill`이나 유예 시간을 넘긴 `docker stop`도 137이므로 `OOMKilled`를 함께 본다. 데몬의 이벤트 기록에도 남는다.
```bash
docker events --since "$t0" --until "$(( $(date +%s) + 1 ))" \
  --filter container=hog --format '{{.Action}}'
docker rm hog >/dev/null
```
```text
create
attach
start
oom
die
```
`--until` 없이 `docker events --filter event=oom`을 띄워 두면 OOM이 날 때마다 실시간으로 받는 감시 도구가 된다. 프로세스 수 제한은 fork 폭주를 막는다. 셸 1개 + `sleep` 9개 = 10개에서 멈춘다.
```bash
docker run --rm --pids-limit 10 alpine:3.20 \
  sh -c 'for i in $(seq 20); do sleep 30 & echo -n "$i "; done'
```
```text
1 2 3 4 5 6 7 8 9 sh: can't fork: Resource temporarily unavailable
```

## 헬스 체크: 살아 있지만 고장 난 컨테이너
`HEALTHCHECK`는 컨테이너 안에서 명령을 주기적으로 실행해 종료 코드 0이면 정상, 1이면 실패로 센다. 기본값은 간격 30초, 제한 시간 30초, 연속 실패 3번(`--retries`)에 unhealthy이고, `--start-period`(기본 0초) 동안의 실패는 세지 않는다. 그 기간의 검사 간격 `--start-interval`(기본 5초)은 Docker Engine 25부터 쓸 수 있다. `/health`가 생겨야 준비된 것으로 치는 웹 서버로 관찰하자.
```dockerfile
# 파일: hc/Dockerfile
FROM busybox:1.37
RUN mkdir /www
HEALTHCHECK --interval=1s --timeout=1s --retries=2 \
  --start-period=10s --start-interval=1s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
```
```bash
docker build -q -t hc hc >/dev/null
t0=$(date +%s)
docker run -d --name web hc >/dev/null
health() { docker inspect -f '{{.State.Health.Status}}' web; }
health; sleep 3; health
docker inspect -f '{{json .State.Health}}' web \
  | jq -r '.Log[-1] | "\(.ExitCode) \(.Output | rtrimstr("\n"))"'
```
```text
starting
starting
1 wget: server returned error: HTTP/1.1 404 Not Found
```
3초 동안 검사가 계속 실패(404)했지만 시작 유예 기간이라 여전히 `starting`이다. 이제 준비 완료를 흉내 냈다가 다시 고장 내 본다.
```bash
docker exec web touch /www/health
until [ "$(health)" = healthy ]; do sleep 0.2; done
docker ps --filter name=web --format '{{.Names}} {{.Status}}'
docker exec web rm /www/health
until [ "$(health)" = unhealthy ]; do sleep 0.2; done
docker events --since "$t0" --until "$(( $(date +%s) + 1 ))" \
  --filter container=web --filter event=health_status --format '{{.Action}}'
docker rm -f web >/dev/null
```
```text
web Up … (healthy)
health_status: healthy
health_status: unhealthy
```
한 번 성공하면 시작 유예가 끝나고, 그 뒤로는 2번 연속 실패에 unhealthy가 된다. 중요한 점은 Docker 엔진 자체는 unhealthy 컨테이너를 재시작하지 않는다는 것이다. 재시작 정책은 프로세스가 끝났을 때만 반응한다(3편). 상태를 행동으로 바꾸는 쪽은 Compose의 `condition: service_healthy`(9편), Swarm, 감시 스크립트다. 쿠버네티스는 Dockerfile의 `HEALTHCHECK`를 쓰지 않고 자체 프로브를 정의한다.

## 로그: json-file과 회전
기본 로그 드라이버 json-file은 컨테이너의 stdout·stderr를 한 줄씩 JSON으로 호스트 파일에 쌓고, 기본으로는 회전하지 않는다. 오래 도는 수다스러운 컨테이너가 디스크를 채우는 흔한 원인이다. 1 KiB에서 회전하고 파일 3개까지만 두게 해 보자.
```bash
docker run --name chatty --log-opt max-size=1k --log-opt max-file=3 \
  alpine:3.20 sh -c 'seq 500 | sed "s/^/line /"' >/dev/null
log=$(docker inspect -f '{{.LogPath}}' chatty)
ls "$(dirname "$log")" | grep -o 'json\.log.*'
tail -n 1 "$log"
docker logs chatty | grep -cx 'line 1'
docker logs chatty | tail -n 1
docker rm chatty >/dev/null
```
```text
json.log
json.log.1
json.log.2
{"log":"line 500\n","stream":"stdout","time":"…"}
0
line 500
```
파일은 세 개로 돌고, 가장 오래된 `line 1`은 이미 지워져 `docker logs`에도 없다. 운영 서버에서는 데몬 기본값을 `/etc/docker/daemon.json`에 둔다. 이 설정은 새로 만드는 컨테이너에만 적용된다.
```json
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```
`local` 드라이버는 옵션을 주지 않아도 20 MB 파일 5개까지 압축해서 보관한다. 앱은 컨테이너 안 파일이 아니라 stdout에 로그를 쓰고, 모으기·검색은 드라이버나 수집기에 맡긴다.

## 흔한 실수와 문제 해결
- 런타임이 컨테이너 한도를 모른다: JVM의 `-XX:MaxRAMPercentage`, Node의 `--max-old-space-size`처럼 힙 한도를 컨테이너 한도보다 작게 잡는다. 그렇지 않으면 GC가 돌기 전에 OOM 킬을 당한다.
- 헬스 체크 명령이 이미지에 없다: distroless 이미지에서 `wget: not found`면 영원히 unhealthy다. 앱 바이너리에 검사 하위 명령을 넣는 방법이 있다.
- 헬스 체크가 DB까지 확인한다: DB가 잠깐 멈추면 앱 컨테이너가 모두 unhealthy가 된다. 자기 프로세스가 응답하는지만 본다.

## 숫자로 보기
| 항목 | 기본값 |
| --- | --- |
| HEALTHCHECK 간격·제한 시간 | 30초·30초 |
| 재시도·시작 유예 | 3번·0초 |
| `--start-interval` (Engine 25+) | 5초 |
| json-file `max-size` | 제한 없음 |
| local 드라이버 | 20 MB × 5개, 압축 |
| CFS 주기(`--cpus`) | 100ms |

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 타이머 인터럽트로 CPU를 나눠 주는 스케줄러 위에 "주기당 할당량"을 덧씌운 것이 `--cpus`의 스로틀링이다.
- 메모리 시스템 7편 「가상 메모리 하드웨어: 페이지 테이블 워크와 TLB」: 할당은 가상 주소만 잡고 실제 프레임은 페이지를 처음 만질 때 잡히므로, OOM은 `bytearray`를 채우는 순간에 터졌다.
- 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: `healthcheck`와 `depends_on`의 `condition: service_healthy`가 이 글의 상태 값을 기다린다.
- PostgreSQL 실무 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」: postgres 컨테이너에 메모리 한도를 걸면 `shared_buffers`와 연결마다 쓰는 `work_mem` 같은 메모리가 모두 그 안에 들어가야 한다.

## 정리
- `--memory`·`--cpus`·`--pids-limit`는 cgroup 파일에 적히며, 파일 이름은 v1(`memory.limit_in_bytes`)과 v2(`memory.max`)가 다르다.
- 메모리 한도를 넘으면 OOM 킬러가 SIGKILL을 보낸다. 종료 코드 137에 `OOMKilled: true`, 이벤트 `oom`이 증거다.
- 헬스 체크는 상태만 바꾼다. 재시작이나 트래픽 차단은 Compose·오케스트레이터가 한다.
- json-file은 기본으로 회전하지 않으니 `max-size`를 걸거나 `local` 드라이버를 쓴다.

## 더 알아보기
- 이전 글: 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」
- 다음 글: 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」
