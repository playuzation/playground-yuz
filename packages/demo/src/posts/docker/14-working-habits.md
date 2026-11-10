# [도커와 컨테이너 14/14] 컨테이너로 일하는 습관: 개발 환경, 디버깅, 정리, 그다음 단계

> **한 줄 요약** — 개발 중에는 Compose 오버라이드와 바인드 마운트로 재빌드 없이 코드를 반영하고, 문제가 생기면 `ps -a` → `logs` → `inspect` → `exec`·디버그 컨테이너 순서로 증거를 모으며, 디스크는 범위를 좁혀 정리하고, 여러 서버로 갈 때는 같은 이미지를 오케스트레이터에 넘긴다.

## 이 글에서 다루는 것
- 개발용 compose 오버라이드와 바인드 마운트로 코드 즉시 반영
- 디버깅 순서: `ps -a` → `logs` → `inspect` → `exec` → 임시 디버그 컨테이너
- 흔한 오류(이미지 없음, 포트 충돌, 권한 거부, 디스크 부족, exec format error) 재현
- `docker system df`와 범위를 좁힌 정리
- dev container와 쿠버네티스: 그다음 단계

## 문제: 고칠 때마다 다시 빌드하고, 막히면 지우고 다시 띄운다
처음에는 HTML 한 줄을 고칠 때마다 이미지를 다시 빌드하고, 컨테이너가 이상하면 원인을 보기 전에 지우고 다시 띄운다. 그사이 디스크는 이름 없는 이미지와 빌드 캐시로 찬다. 마지막 글은 매일 쓰는 습관을 정리한다. 실행 결과는 Docker Engine 29.6, Compose 5.3 기준이다.

## 개발 환경: 오버라이드 파일과 바인드 마운트
Compose는 `compose.yaml`을 읽은 뒤 같은 폴더의 `compose.override.yaml`이 있으면 자동으로 겹친다(9편). 운영과 같은 정의는 기본 파일에, 개발 전용 설정(소스 바인드 마운트, 디버그 포트)은 오버라이드 파일에 둔다.
```dockerfile
# 파일: Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY site/ site/
CMD ["python", "-m", "http.server", "8000", "-d", "site"]
```
```yaml
# 파일: compose.yaml
name: demo14
services:
  web:
    build: .
    ports:
      - "127.0.0.1:8080:8000"
```
```yaml
# 파일: compose.override.yaml
services:
  web:
    volumes:
      - ./site:/app/site
```
```bash
mkdir -p site && echo '<h1>v1</h1>' > site/index.html
docker compose up -d --build >/dev/null 2>&1
until curl -s http://127.0.0.1:8080/ >/dev/null; do sleep 0.2; done
curl -s http://127.0.0.1:8080/
echo '<h1>v2</h1>' > site/index.html
curl -s http://127.0.0.1:8080/
```
```text
<h1>v1</h1>
<h1>v2</h1>
```
재빌드 없이 바뀌었다. 이미지에 COPY된 `site/` 위를 바인드 마운트가 덮어 호스트 폴더가 그대로 보이기 때문이다(7편). 오버라이드가 겹친 결과와 기본 파일만의 결과를 비교하자.
```bash
docker compose config --format json \
  | jq -c '.services.web.volumes[] | {source, target}'
docker compose -f compose.yaml config --format json \
  | jq -c '.services.web.volumes'
docker compose down --rmi local >/dev/null 2>&1
```
```text
{"source":"…/site","target":"/app/site"}
null
```
CI와 운영은 `-f compose.yaml`처럼 파일을 명시해 마운트 없이 띄운다. 서버 코드라면 개발 서버의 자동 재시작(reload) 옵션도 켠다. 바인드 마운트가 느리거나 파일 변경 이벤트가 전달되지 않는 환경(가상 머신을 거치는 파일 공유)에서는 변경 파일을 컨테이너로 복사해 주는 `docker compose watch`(Compose 2.22부터, `develop.watch`)가 대안이다.

## 디버깅 순서: 지우기 전에 증거부터
"포트를 열었는데 접속이 안 된다"를 순서대로 풀어 보자.
```bash
docker run -d --name web -p 127.0.0.1:8080:8080 nginx:1.29-alpine >/dev/null
sleep 1; curl -sS http://127.0.0.1:8080/
```
```text
curl: (56) Recv failure: Connection reset by peer
```
1단계 `docker ps -a`로 살아 있는지, 재시작을 반복하는지, 포트가 어떻게 묶였는지 보고, 2단계 `docker logs`, 3단계 `docker inspect`로 넘어간다.
```bash
docker ps -a --filter name=web --format '{{.Status}} / {{.Ports}}'
docker logs web 2>&1 | grep -ci error
docker inspect -f '{{json .HostConfig.PortBindings}}' web
```
```text
Up … / 80/tcp, 127.0.0.1:8080->8080/tcp
0
{"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"8080"}]}
```
로그에 오류는 없고, 호스트 8080이 컨테이너 8080으로 묶였는데 이미지가 알리는 포트는 80이다. 4단계는 안에서 보기다. 대상 이미지에 `netstat`이 없어도 네트워크 네임스페이스를 함께 쓰는 도구 컨테이너를 붙이면 된다(셸 없는 이미지 디버깅은 6편).
```bash
docker run --rm --network container:web busybox:1.37 \
  sh -c 'netstat -ltn 2>/dev/null | grep LISTEN'
```
```text
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN
```
nginx는 80에서 듣는다. 매핑을 `8080:80`으로 고치면 끝이다.
```bash
docker rm -f web >/dev/null
docker run -d --name web -p 127.0.0.1:8080:80 nginx:1.29-alpine >/dev/null
until curl -s http://127.0.0.1:8080/ >/dev/null; do sleep 0.2; done
curl -s http://127.0.0.1:8080/ | grep -o '<title>.*</title>'
docker rm -f web >/dev/null
```
```text
<title>Welcome to nginx!</title>
```
곧바로 죽는 컨테이너도 지우지 않으면 로그와 설정이 남는다. 다만 `exec`는 실행 중일 때만 된다.
```bash
docker run --name crash python:3.12-slim \
  python -c 'import os; int(os.environ.get("PORT", "abc"))' 2>/dev/null
docker ps -a --filter name=crash --format '{{.Status}}'
docker logs crash 2>&1 | tail -n 1
docker exec crash sh
```
```text
Exited (1) …
ValueError: invalid literal for int() with base 10: 'abc'
Error response from daemon: container … is not running
```
멈춘 컨테이너는 `docker cp`로 파일을 꺼내거나 같은 이미지에 셸을 띄워(`docker run --rm -it --entrypoint sh python:3.12-slim`) 환경을 재현한다. 그래서 `--rm`은 문제가 없을 때 붙인다.

## 흔한 오류 모음
```bash
docker rm crash >/dev/null
docker run --pull never alpine:3.99
```
```text
docker: Error response from daemon: No such image: alpine:3.99

Run 'docker run --help' for more information
```
`--pull never`로 로컬만 찾게 했다. 원격에서는 태그 오타가 `not found`, 로그인이 필요한 비공개 저장소가 `pull access denied`로 나온다. 다음은 포트 충돌이다(8편).
```bash
docker run -d --name p1 -p 127.0.0.1:8080:80 nginx:1.29-alpine >/dev/null
docker run -d --name p2 -p 127.0.0.1:8080:80 nginx:1.29-alpine 2>&1 \
  | grep -o 'Bind for .*'
docker rm -f p1 p2 >/dev/null
```
```text
Bind for 127.0.0.1:8080 failed: port is already allocated
```
`docker ps --filter publish=8080`으로 범인을 찾고, 컨테이너가 아니면 `ss -ltnp`로 호스트 프로세스를 본다. `docker` 그룹에 없는 사용자는 데몬 소켓에서 막힌다(문구는 버전마다 조금 다르다).
```bash
setpriv --reuid=65534 --regid=65534 --clear-groups docker ps 2>&1 | tail -n 1
```
```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```
그룹에 넣으면 해결되지만 그 사용자는 사실상 root가 된다(11편). 디스크가 차면 쓰기마다 같은 오류가 난다. 1 MiB tmpfs로 흉내 내 보자.
```bash
docker run --rm --tmpfs /data:size=1m alpine:3.20 \
  dd if=/dev/zero of=/data/f bs=1M count=2 2>&1 | head -n 1
```
```text
dd: error writing '/data/f': No space left on device
```
마지막은 `exec format error`다. 커널이 실행 파일의 형식을 알아보지 못했다는 뜻이고 원인은 대개 두 가지다. 첫째, 첫 줄에 `#!`이 없는 스크립트다.
```bash
printf 'echo hi\n' > start.sh && chmod +x start.sh
docker run --rm -v "$PWD/start.sh:/start.sh" --entrypoint /start.sh alpine:3.20
```
```text
exec /start.sh: exec format error
```
첫 줄에 `#!/bin/sh`를 넣으면 된다. 둘째, 다른 CPU용 바이너리다. 맥(arm64)에서 만든 바이너리를 COPY한 상황을 arm64 교차 컴파일로 만든다.
```go
// 파일: arch/main.go
package main

import "fmt"

func main() { fmt.Println("hello") }
```
```dockerfile
# 파일: arch/Dockerfile
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY main.go .
RUN CGO_ENABLED=0 GOARCH=arm64 go build -o /hello main.go
FROM scratch
COPY --from=build /hello /hello
ENTRYPOINT ["/hello"]
```
```bash
docker build -q -t armapp arch >/dev/null
docker run --rm armapp
docker image inspect -f '{{.Os}}/{{.Architecture}}' armapp
docker create --name armbox armapp >/dev/null
docker cp -q armbox:/hello ./hello && docker rm armbox >/dev/null
file hello | cut -d, -f1,2
docker image rm armapp >/dev/null
```
```text
exec /hello: exec format error
linux/amd64
hello: ELF 64-bit LSB executable, ARM aarch64
```
이미지 표시는 amd64인데 바이너리는 ARM이다. 셸이 없어도 `docker cp`로 꺼내 `file`로 보면 확실하다. 해결은 대상 플랫폼으로 빌드하는 것이다(13편의 `TARGETARCH`).

## 정리하기: 무엇이 디스크를 쓰나
```bash
docker system df
```
```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          …
Containers      …
Local Volumes   …
Build Cache     …
```
이미지, 컨테이너 쓰기 계층, 볼륨, 빌드 캐시별 크기와 회수 가능한 양이다(이 호스트는 다른 작업이 함께 돌아 값을 가렸다). 오래 쓴 개발 PC는 빌드 캐시가 가장 큰 경우가 많다. 공용 서버나 CI에서는 라벨로 범위를 좁혀 남의 것을 건드리지 않는다.
```bash
docker run --label project=demo14 --name l1 alpine:3.20 true
docker run --label project=demo14 --name l2 alpine:3.20 true
docker container prune -f --filter label=project=demo14
```
```text
Deleted Containers:
…
…

Total reclaimed space: …
```
전체 정리 명령은 무엇을 지우는지 알고 쓴다. 아래는 예시로만 둔다.
```sh
docker image prune             # 이름 없는(dangling) 이미지만
docker image prune -a          # 컨테이너가 쓰지 않는 이미지 전부
docker builder prune           # 빌드 캐시
docker volume prune            # 이름 없는 볼륨만(Engine 23부터), -a는 이름 있는 것까지
docker system prune            # 멈춘 컨테이너, 안 쓰는 네트워크, dangling 이미지, 빌드 캐시
docker system prune -a --volumes   # 데이터 볼륨까지 사라질 수 있다
```

## 그다음 단계: dev container와 오케스트레이션
**dev container**는 개발 환경 자체를 컨테이너로 정의한다. 저장소의 `.devcontainer/devcontainer.json`을 VS Code의 Dev Containers 확장이나 GitHub Codespaces가 읽어 편집기는 호스트에, 런타임과 도구는 컨테이너에 둔다. 공개 명세는 containers.dev에 있다.
```json
{
  "name": "myapp",
  "image": "python:3.12-slim",
  "forwardPorts": [8000],
  "postCreateCommand": "pip install -r requirements.txt"
}
```
서버가 여러 대가 되면 컨테이너를 배치하고, 죽으면 다시 띄우고, 선언한 상태를 유지하는 오케스트레이터가 필요하다. 사실상 표준인 쿠버네티스로 이 시리즈의 개념이 거의 그대로 옮겨 간다. 다이제스트로 고정한 이미지(13편), `--memory`·`--cpus`에 해당하는 resources와 헬스 체크에 해당하는 프로브(12편), `USER`·`--cap-drop`에 해당하는 securityContext(11편), 서비스 이름 DNS(8편)다. 쿠버네티스는 1.24에서 dockershim을 빼 containerd 같은 런타임을 직접 쓰지만, OCI 표준 이미지라 Docker로 만든 이미지는 그대로 돈다(1편).

## 어디에 쓰이나
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: 링커가 만드는 ELF 실행 파일의 헤더에 대상 CPU가 적혀 있어 `file`이 ARM을 알아보고 커널이 실행을 거부했다.
- WSL 개발 환경 9편 「WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱」: 편집기는 윈도우에, 서버는 리눅스에 두는 구조가 dev container와 같다.
- PostgreSQL 실무 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」: 개발용 DB를 compose 오버라이드로 띄우고 지우는 습관이 그 글의 `docker run` 실습을 잇는다.

## 정리
- 개발 설정은 `compose.override.yaml`에 두고 바인드 마운트로 재빌드 없이 반영한다. 운영은 기본 파일만 쓴다.
- 문제는 `ps -a` → `logs` → `inspect` → `exec`·`--network container:` 순서로 증거를 모으고, 지우는 것은 마지막이다.
- `exec format error`는 `#!` 없는 스크립트나 다른 CPU용 바이너리다. `docker cp`와 `file`로 확인한다.
- 정리는 `docker system df`로 크기를 보고 라벨·종류로 범위를 좁혀 한다. `system prune -a --volumes`는 데이터까지 지운다.

## 더 알아보기
- 이전 글: 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」
- 처음 글: 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」
