# [도커와 컨테이너 9/14] Docker Compose: 여러 컨테이너를 한 파일로 정의하기

> **한 줄 요약** — Docker Compose는 서비스·네트워크·볼륨을 compose.yaml 한 파일에 선언해 두면 프로젝트 이름으로 묶인 컨테이너들을 의존 순서와 헬스 체크에 맞춰 만들고, 파일이 바뀌면 달라진 서비스만 다시 만드는 도구다.

## 이 글에서 다루는 것
- `docker run` 여러 줄을 파일 하나로: services·networks·volumes
- 프로젝트 이름, 기본 네트워크, 서비스 이름 DNS
- `depends_on`과 `condition: service_healthy` + `healthcheck`
- 환경 변수와 `.env`, 변수 치환과 우선순위
- `up`·`ps`·`logs`·`exec`·`down -v`, 프로필, 오버라이드 파일

## 명령 세 줄이 문서가 되어야 하는 이유
웹 앱 하나에 PostgreSQL과 Redis를 붙이려면 7·8편의 지식으로 네트워크 하나, 볼륨 하나, `docker run` 세 줄이 필요하다. 옵션은 길고, DB가 준비되기 전에 웹이 뜨면 연결 오류가 나고, 동료는 그 명령들을 어디선가 복사해야 한다. Compose는 이 구성을 YAML 파일로 선언하게 한다. 파일은 저장소에 커밋되는 실행 가능한 문서가 된다.

## 원리: 선언을 Docker API 호출로 바꾸기
Compose는 별도의 서버가 아니라 `docker` CLI 플러그인이다. compose.yaml을 읽어 같은 Docker 엔진에 네트워크·볼륨·컨테이너 생성 요청을 보낸다. 하이픈이 들어간 옛 `docker-compose`(파이썬으로 만든 V1)는 2023년 7월부터 업데이트가 끊겼고, 지금은 Go로 다시 만든 `docker compose`를 쓴다(이 글의 실행 결과는 Docker 29.6, Compose v5.3 기준).
- **프로젝트 이름**: 기본은 compose.yaml이 있는 폴더 이름(최상위 `name:`이나 `-p`로 바꿀 수 있다). 모든 자원 이름 앞에 붙고 라벨(`com.docker.compose.project`)로도 기록된다. 같은 파일을 다른 이름으로 띄우면 서로 간섭하지 않는다.
- **기본 네트워크**: `<프로젝트>_default`라는 사용자 정의 네트워크를 만들고 모든 서비스를 붙이므로, 서비스 이름이 곧 호스트 이름이다(8편의 내장 DNS).
- **원하는 상태 맞추기**: `up`은 파일에 적힌 상태와 실제 컨테이너를 비교해 없으면 만들고, 설정이 달라졌으면 다시 만들고, 같으면 그대로 둔다.
- **의존 순서**: `depends_on`으로 그린 그래프를 위상 정렬한 순서로 시작한다. 순환이 있으면 거부한다.

## 따라 하기: 웹 + PostgreSQL + Redis
방문할 때마다 Redis의 카운터를 올리고 DB에 TCP로 닿는지 알려 주는 작은 웹 앱이다. 드라이버를 설치할 수 없는 환경이라 파이썬 표준 라이브러리만 쓴다. Redis에는 소켓으로 `INCR` 명령 한 줄을 보낸다.
```python
# 파일: visits/app.py
import os, socket
from http.server import BaseHTTPRequestHandler, HTTPServer

def incr(key):
    with socket.create_connection((os.environ["REDIS_HOST"], 6379), 2) as s:
        s.sendall(f"INCR {key}\r\n".encode())
        return int(s.recv(64).strip().lstrip(b":"))

def db_ok():
    try:
        socket.create_connection((os.environ["DB_HOST"], 5432), 2).close()
        return "ok"
    except OSError as e:
        return f"error {e}"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = f"{os.environ['GREETING']}! visits={incr('visits')} db={db_ok()}\n"
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body.encode())

HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
```
```dockerfile
# 파일: visits/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY app.py .
CMD ["python", "-u", "app.py"]
```
```yaml
# 파일: visits/compose.yaml
services:
  web:
    build: .
    ports:
      - "127.0.0.1:${WEB_PORT:-8080}:8000"
    environment:
      GREETING: ${GREETING:-hello}
      REDIS_HOST: cache
      DB_HOST: db
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy

  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "app", "-h", "127.0.0.1"]
      interval: 2s
      retries: 15

  cache:
    image: redis:8-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      retries: 15

  probe:
    image: busybox:1.37
    profiles: [debug]
    command: wget -qO- http://web:8000

volumes:
  pgdata:
```
```ini
# 파일: visits/.env
DB_PASSWORD=example-password
GREETING=hello
```
`${DB_PASSWORD:?…}`는 값이 없으면 오류로 멈추고, `${WEB_PORT:-8080}`은 없으면 기본값을 쓰는 치환 문법이다. Compose는 프로젝트 폴더의 `.env`를 읽어 이 치환에 쓴다. 비밀번호를 `.env`에 두는 것의 문제와 대안은 10편에서 다룬다.
```bash
cd visits
docker compose up -d --wait
```
```text
...
 Network visits_default Created
...
 Volume visits_pgdata Created
...
 Container visits-db-1 Healthy
...
 Container visits-web-1 Started
...
```
처음에는 web 이미지 빌드 기록이 앞에 붙는다(중간 줄은 `...`로 줄였다). `--wait`는 모든 서비스가 실행 중(헬스 체크가 있으면 healthy)이 될 때까지 기다린다. web은 db와 cache가 healthy가 된 뒤에야 시작되었다.
```bash
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}'
curl -s localhost:8080; curl -s localhost:8080
docker compose exec cache redis-cli get visits
docker compose exec db psql -U app -Atc 'SELECT current_user'
docker compose logs db | grep -c 'ready to accept connections'
```
```text
cache running healthy
db running healthy
web running
hello! visits=1 db=ok
hello! visits=2 db=ok
2
app
2
```
`logs`에 "ready to accept connections"가 두 번 있는 것은 postgres 이미지가 첫 실행 때 초기화용 임시 서버(유닉스 소켓만 연다)를 띄웠다가 내리고 진짜 서버를 다시 띄우기 때문이다. 헬스 체크에 `-h 127.0.0.1`을 준 것은 임시 서버를 "준비됨"으로 오인하지 않기 위해서다.

## 검증: Compose가 만든 것들
이름 규칙과 서비스 이름 DNS를 확인한다.
```bash
docker network ls --filter name=visits --format '{{.Name}}'
docker volume ls --filter name=visits --format '{{.Name}}'
docker ps --filter label=com.docker.compose.project=visits \
  --format '{{.Names}}' | sort
docker compose exec web getent hosts db cache | awk '{print $2, "->", $1}'
```
```text
visits_default
visits_pgdata
visits-cache-1
visits-db-1
visits-web-1
db -> …
cache -> …
```
설정을 바꾸고 다시 `up`하면 바뀐 서비스만 다시 만든다. 셸의 환경 변수는 `.env`보다 우선한다.
```bash
GREETING=hi docker compose up -d --wait 2>&1 | grep -E 'Running|Recreated' | sort
curl -s localhost:8080
```
```text
 Container visits-cache-1 Running
 Container visits-db-1 Running
 Container visits-web-1 Recreated
hi! visits=3 db=ok
```
web만 다시 만들어졌고, 카운터는 cache 컨테이너가 그대로라 이어진다. 치환 결과가 헷갈리면 `docker compose config`로 최종 설정을 본다.

## 흔한 실수와 문제 해결
**`depends_on`만으로는 준비를 기다리지 않는다.** 조건 없이 쓰면 "컨테이너가 시작됨"까지만 기다린다. PostgreSQL은 시작 후 초기화에 몇 초가 걸리므로 그 사이 앱이 접속하면 실패한다. 헬스 체크와 `condition: service_healthy`를 쓰고, 앱 자체도 재시도하게 만든다(DB가 운영 중에 재시작될 수도 있다).

**필수 변수가 없다.** `.env` 없이 실행하면 치환 단계에서 멈춘다.
```bash
docker compose --env-file /dev/null config -q
```
```text
error while interpolating services.db.environment.POSTGRES_PASSWORD: required variable DB_PASSWORD is missing a value: set DB_PASSWORD in .env
```
**`version:`을 적었다.** 옛 글의 `version: "3.8"`은 이제 쓸모가 없다. 공식 문서에 따르면 이 필드는 하위 호환을 위해서만 남아 있고 Compose는 항상 최신 스키마로 검사한다. 적으면 경고가 나온다.
```bash
sed -i '1a version: "3.8"' compose.yaml
docker compose config -q
sed -i '/^version:/d' compose.yaml
```
```text
time="…" level=warning msg="…/visits/compose.yaml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion"
```
**의존이 순환한다.** 위상 정렬이 불가능하므로 설정 단계에서 거부된다.
```yaml
# 파일: visits/cycle.yaml
services:
  a: {image: busybox:1.37, depends_on: [b]}
  b: {image: busybox:1.37, depends_on: [a]}
```
```bash
docker compose -f cycle.yaml config -q
```
```text
dependency cycle detected: a -> b -> a
```
**DB 데이터가 사라졌다.** `docker compose down`은 컨테이너와 네트워크만 지우고 볼륨은 남긴다. `-v`를 붙여야 볼륨까지 지운다.

## 프로필과 오버라이드 파일
`profiles`가 붙은 서비스는 그 프로필을 켤 때만 뜬다. 디버깅·관리 도구를 같은 파일에 두기 좋다.
```bash
docker compose --profile debug run --rm probe 2>/dev/null
```
```text
hi! visits=4 db=ok
```
같은 폴더의 `compose.override.yaml`은 자동으로 합쳐지고, `-f compose.yaml -f compose.prod.yaml`처럼 여러 파일을 겹칠 수 있다. 개발용 오버라이드로 코드를 바인드 마운트하는 방법은 14편에서 다룬다. 마지막으로 정리한다.
```bash
docker compose down >/dev/null 2>&1
docker volume ls --filter name=visits --format '{{.Name}}'
docker compose down -v >/dev/null 2>&1
docker volume ls --filter name=visits --format '{{.Name}}' | wc -l
```
```text
visits_pgdata
0
```

## 권장 설정과 체크리스트
- compose.yaml을 저장소에 커밋하고, 비밀이 든 `.env`는 커밋하지 않는다(10편). 필요한 변수는 `${VAR:?메시지}`로 강제한다.
- DB·캐시에는 `healthcheck`를, 의존하는 서비스에는 `condition: service_healthy`를 쓴다.
- 이미지 태그는 고정하고, DB 포트는 공개하지 않거나 `127.0.0.1:`에만 연다.
- `docker compose config`로 최종 설정을, `docker compose logs -f 서비스`로 로그를 본다.
- 한계: Compose는 호스트 한 대의 도구다. 여러 서버에 나눠 띄우고 장애 시 옮기는 일은 오케스트레이터의 몫이다(14편).

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: `depends_on`의 시작 순서는 서비스 의존 그래프의 위상 정렬이고, 순환 의존이 거부되는 이유도 같다.
- PostgreSQL 실무 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」: `docker run`으로 띄운 서버를 이 글처럼 Compose 서비스로 옮기면 볼륨·헬스 체크까지 파일에 남는다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: CI에서 `docker compose up --wait`로 의존 서비스를 띄우고 통합 테스트를 돌릴 수 있다.

## 정리
- Compose는 compose.yaml의 선언을 Docker API 호출로 바꾸는 CLI 플러그인이다.
- 프로젝트 이름이 모든 자원의 이름과 라벨이 되고, 기본 네트워크에서 서비스 이름이 호스트 이름이 된다.
- `depends_on`은 순서만 정한다. 준비를 기다리려면 `healthcheck` + `condition: service_healthy`.
- `up`은 달라진 서비스만 다시 만들고, `down`은 볼륨을 남긴다(`-v`로 삭제).

## 더 알아보기
- 이전 글: 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」
- 다음 글: 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」
- Docker 공식 문서 Compose file reference: https://docs.docker.com/reference/compose-file/
