# [도커와 컨테이너 4/14] Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT

> **한 줄 요약** — Dockerfile은 베이스 이미지 위에 명령을 한 줄씩 적용해 레이어와 설정을 만드는 빌드 대본이고, 빌드는 컨텍스트로 넘겨준 파일만 볼 수 있으며, 컨테이너가 실제로 실행할 명령은 ENTRYPOINT 뒤에 CMD(또는 `docker run`의 인자)를 붙이는 규칙으로 정해진다.

## 이 글에서 다루는 것
- 자주 쓰는 명령어: FROM, RUN, COPY·ADD, WORKDIR, ENV·ARG, EXPOSE, USER, CMD·ENTRYPOINT
- 표준 라이브러리만 쓰는 파이썬 웹 앱 이미지를 만들어 curl로 확인하기
- 빌드 컨텍스트와 `.dockerignore`: 컨텍스트에 무엇이 들어가는지 직접 보기
- CMD와 ENTRYPOINT의 결합 규칙을 표로 정리하고 실행으로 확인하기

## 문제: 파일이 있는데 없다고 하고, 인자를 줬더니 명령이 사라진다
`COPY ../config.yaml`이 "not found"로 실패하는데 파일은 분명히 있다. 작은 앱인데 빌드할 때마다 수백 MB를 데몬으로 보낸다. `docker run myapp --debug`를 했더니 앱이 뜨지 않고 "`--debug`: executable file not found"가 난다. 셋 다 Dockerfile 명령이 어디서, 무엇을 대상으로 실행되는지 몰라서 생긴다.

## 명령어 한눈에
| 명령 | 하는 일 |
|---|---|
| `FROM` | 베이스 이미지 지정 |
| `RUN` | 빌드 중 명령 실행, 결과가 레이어 |
| `COPY`, `ADD` | 컨텍스트의 파일을 이미지로, 레이어 |
| `WORKDIR` | 이후 명령의 작업 폴더(없으면 생성) |
| `ENV` | 빌드와 실행 모두에 남는 환경 변수 |
| `ARG` | 빌드 중에만 쓰는 변수 |
| `EXPOSE` | 듣는 포트를 기록(공개는 안 함) |
| `USER` | 이후 `RUN`과 실행 시의 사용자 |
| `CMD`, `ENTRYPOINT` | 컨테이너의 기본 실행 명령 |

파일 시스템을 바꾸는 `RUN`, `COPY`, `ADD`는 레이어를 만들고, 나머지는 설정(config)에 값만 남긴다(2편). `RUN`마다 새 셸이 뜨므로 `RUN cd /app`은 다음 줄에 이어지지 않는다. 폴더 이동은 `WORKDIR`로 한다.

## 따라 하기: 파이썬 웹 앱 이미지
의존성 없이 표준 라이브러리 `http.server`로 JSON을 돌려주는 앱이다.
```python
# 파일: app/server.py
import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"greeting": os.environ.get("GREETING", "hello"),
                           "version": os.environ["APP_VERSION"],
                           "user": os.getuid(), "path": self.path},
                          ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

port = int(os.environ["PORT"])
server = HTTPServer(("0.0.0.0", port), Handler)
print(f"listening on {port}")
server.serve_forever()
```
```dockerfile
# 파일: Dockerfile
FROM python:3.12-slim
ARG APP_VERSION=dev
ENV PYTHONUNBUFFERED=1 PORT=8000 APP_VERSION=$APP_VERSION
WORKDIR /app
COPY app/ ./
RUN useradd --uid 10001 --no-create-home appuser
USER appuser
EXPOSE 8000
CMD ["python", "server.py"]
```
`ARG` 값은 빌드할 때 `--build-arg`로 바꿀 수 있고, 실행 때까지 남기려면 `ENV`로 옮겨 담아야 한다. 서버는 `127.0.0.1`이 아니라 `0.0.0.0`에서 들어야 컨테이너 밖에서 들어오는 연결을 받는다(8편).
```bash
docker build -q --build-arg APP_VERSION=1.0 -t pyweb:1.0 . > /dev/null
docker run -d --name web -p 8080:8000 -e GREETING=안녕 pyweb:1.0 > /dev/null
until docker logs web 2>&1 | grep -q listening; do sleep 0.2; done
curl -s localhost:8080/hello; echo
```
```text
{"greeting": "안녕", "version": "1.0", "user": 10001, "path": "/hello"}
```
`--build-arg`로 넣은 버전, `-e`로 실행 때 덮어쓴 인사말, `USER`로 바꾼 UID 10001이 응답에 그대로 보인다. 앱이 듣기 시작하기 전에 요청하면 `Connection reset by peer`가 나므로 로그로 준비를 기다렸다. 이미지 설정에 무엇이 기록되었는지도 보자.
```bash
docker image inspect pyweb:1.0 \
  --format '{{.Config.User}} {{.Config.WorkingDir}} {{json .Config.ExposedPorts}} {{json .Config.Cmd}}'
docker port web
```
```text
appuser /app {"8000/tcp":{}} ["python","server.py"]
8000/tcp -> 0.0.0.0:8080
```
`EXPOSE 8000`은 설정에 "8000번을 쓴다"는 기록을 남길 뿐이다. 실제로 호스트에서 접속하게 해 준 것은 `-p 8080:8000`이다. 기록이 쓰이는 곳은 `docker run -P`(노출된 포트를 임의의 호스트 포트에 공개)와 사람이 읽는 문서다.

## 빌드 컨텍스트와 .dockerignore
`docker build .`의 `.`이 **빌드 컨텍스트**(build context)다. 빌드는 dockerd 안의 BuildKit이 하고, CLI는 컨텍스트 폴더의 파일을 BuildKit에 넘긴다. `COPY`의 원본 경로는 컨텍스트 기준이라 컨텍스트 밖은 볼 수 없다. 실무 폴더에 흔한 군더더기를 만들고, 무엇이 넘어가는지 모두 복사해 보는 이미지로 확인한다.
```bash
mkdir -p logs .venv/lib && echo 'API_KEY=example-key' > .env
head -c 5000000 /dev/zero > logs/debug.log && touch .venv/lib/site.py
printf 'FROM busybox:1.37\nCOPY . /ctx\n' | docker build -q -t ctx-check -f - . > /dev/null
docker run --rm ctx-check find /ctx -type f | sort
```
```text
/ctx/.env
/ctx/.venv/lib/site.py
/ctx/Dockerfile
/ctx/app/server.py
/ctx/logs/debug.log
```
비밀 값이 든 `.env`와 5MB 로그, 가상 환경까지 이미지에 들어갔다. `.dockerignore`(문법은 `.gitignore`와 비슷하다)로 뺀다.
```gitignore
# 파일: .dockerignore
.env
.venv
logs
*.log
Dockerfile
.dockerignore
```
```bash
printf 'FROM busybox:1.37\nCOPY . /ctx\n' | docker build -q -t ctx-check -f - . > /dev/null
docker run --rm ctx-check find /ctx -type f | sort
```
```text
/ctx/app/server.py
```
빌드에 쓰이는 Dockerfile은 따로 전달되므로 목록에서 빼도 빌드는 된다. 한 가지 덧붙이면 BuildKit은 `COPY`가 참조하는 경로만 받아 가므로, `pyweb`처럼 `COPY app/`만 하는 빌드라면 로그 파일은 전송되지 않는다. `.dockerignore`가 특히 중요한 것은 `COPY . .`를 쓸 때다. 무시된 파일이나 컨텍스트 밖 파일을 `COPY`하면 이렇게 실패한다.
```bash
printf 'FROM busybox:1.37\nCOPY ../.env /x\n' | docker build -q -f - . 2>&1 | grep ERROR
```
```text
ERROR: failed to build: failed to solve: failed to compute cache key: failed to calculate checksum of ref …: "/.env": not found
```
`../.env`가 컨텍스트 루트의 `/.env`로 잘렸고, 그 파일은 `.dockerignore`로 빠져 있어서 "not found"다. 처음의 `COPY ../config.yaml` 문제도 같다. 필요한 파일이 위 폴더에 있으면 컨텍스트를 위 폴더로 잡고 `-f`로 Dockerfile 위치를 준다.

## CMD와 ENTRYPOINT
두 명령 모두 형식이 두 가지다. **exec 형식**(`["python", "server.py"]`)은 그 프로그램을 바로 실행하고, **셸 형식**(`python server.py`)은 `/bin/sh -c "python server.py"`로 감싸서 실행한다(셸이 PID 1이 되는 문제는 3편). 둘을 함께 쓰면 ENTRYPOINT가 실행 파일, CMD가 기본 인자가 되고, `docker run 이미지 인자…`의 인자는 CMD를 대신한다. 다섯 가지 조합을 만들어 인자 없이, 그리고 `echo X`를 붙여 실행해 본다.
```bash
build() { printf 'FROM alpine:3.20\n%s\n%s\n' "$2" "$3" | docker build -q -t "ep:$1" - > /dev/null; }
build a '' 'CMD ["echo","C"]'
build b 'ENTRYPOINT ["echo","E"]' ''
build c 'ENTRYPOINT ["echo","E"]' 'CMD ["C"]'
build d 'ENTRYPOINT ["echo","E"]' 'CMD C'
build e 'ENTRYPOINT echo E' 'CMD ["C"]'
for t in a b c d e; do
  printf '%s: %-16s | %s\n' $t "$(docker run --rm ep:$t)" "$(docker run --rm ep:$t echo X)"
done
```
```text
a: C                | X
b: E                | E echo X
c: E C              | E echo X
d: E /bin/sh -c C   | E echo X
e: E                | E
```
| ENTRYPOINT / CMD | 실행되는 명령 |
|---|---|
| 없음 / `["echo","C"]` | `echo C` |
| `["echo","E"]` / 없음 | `echo E` |
| `["echo","E"]` / `["C"]` | `echo E C` |
| `["echo","E"]` / `C`(셸 형식) | `echo E /bin/sh -c C` |
| `echo E`(셸 형식) / 무엇이든 | `/bin/sh -c 'echo E'` |

규칙은 문서의 표와 같다. CMD만 있으면 인자가 명령 전체를 바꾸고(a), exec 형식 ENTRYPOINT가 있으면 인자는 뒤에 붙는다(b, c). exec 형식 ENTRYPOINT에 셸 형식 CMD를 붙이면 `/bin/sh -c C`가 통째로 인자가 되는 엉뚱한 결과가 나오고(d), 셸 형식 ENTRYPOINT는 CMD와 인자를 모두 버린다(e). 처음 문제의 `docker run myapp --debug`는 a 유형이라 `--debug`가 명령이 된 것이다. 앱이 인자를 받게 하려면 `ENTRYPOINT ["python", "server.py"]`에 기본 옵션을 `CMD ["--port", "8000"]`처럼 두는 c 유형이 맞다. ENTRYPOINT 자체를 바꾸려면 `docker run --entrypoint sh …`를 쓴다.

## COPY와 ADD
`ADD`는 `COPY`에 기능을 더한 것이다. 로컬 tar 파일은 자동으로 풀고, 원격 URL과 Git 저장소도 받을 수 있다.
```bash
mkdir -p site && echo '<h1>hi</h1>' > site/index.html && tar -czf site.tar.gz site
printf 'FROM busybox:1.37\nCOPY site.tar.gz /copy/\nADD site.tar.gz /add/\n' \
  | docker build -q -t addcopy -f - . > /dev/null
docker run --rm addcopy find /copy /add
```
```text
/copy
/copy/site.tar.gz
/add
/add/site
/add/site/index.html
```
같은 파일이 `COPY`로는 그대로, `ADD`로는 풀려서 들어갔다. 파일 형식에 따라 동작이 바뀌는 것은 놀라움의 원인이므로, 압축 해제가 필요할 때만 `ADD`를 쓰고 나머지는 `COPY`를 쓰는 것이 일반적인 권장이다. URL을 받는 것도 `RUN`에서 받고 검증까지 하는 편이 명시적이다.

## 흔한 실수와 문제 해결
- `COPY . .`를 `.dockerignore` 없이 쓰면 `.git`, `node_modules`, `.env`가 이미지에 들어간다. 비밀 값이 레이어에 들어가면 지워도 남는다(2편, 10편).
- `CMD ["python", "$PORT"]`처럼 exec 형식에 변수를 쓰면 치환되지 않는다. 셸이 없기 때문이다. 앱이 환경 변수를 직접 읽게 한다.
- `USER`를 지정하지 않으면 root로 돈다(11편). 기본 사용자를 바꾼 뒤 필요한 폴더의 소유권도 맞춘다.
- 이 글의 빌드는 컨테이너 안에 인터넷이 없는 환경에서 실행했기 때문에 `pip install` 같은 단계를 빼고 표준 라이브러리만 썼다. 의존성 설치를 넣은 Dockerfile과 그 순서는 5편에서 다룬다.

```bash
docker rm -f web > /dev/null
docker image rm pyweb:1.0 ctx-check addcopy ep:a ep:b ep:c ep:d ep:e | grep -c Untagged
```
```text
8
```

## 어디에 쓰이나
- 언어 기초 2편 「파이썬: 읽기 쉬운 코드를 위한 언어」: 표준 라이브러리만으로 HTTP 서버를 띄울 수 있다는 점이 의존성 없는 컨테이너 예제를 가능하게 했다.
- 5편 「빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기」: 이 글의 명령 순서가 그대로 캐시 효율을 결정한다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 여기서 만든 Dockerfile을 CI에서 빌드해 레지스트리로 올린다.

## 정리
- `RUN`·`COPY`·`ADD`는 레이어를, 나머지 명령은 설정 값을 남긴다. `EXPOSE`는 기록일 뿐이고 공개는 `-p`가 한다.
- 빌드는 컨텍스트 안의 파일만 볼 수 있다. `.dockerignore`로 비밀과 군더더기를 빼고, 컨텍스트 내용은 `COPY . /ctx` 이미지로 확인한다.
- 실행 명령은 ENTRYPOINT + (CMD 또는 `docker run` 인자)다. exec 형식으로 쓰고, 인자를 받는 앱은 ENTRYPOINT에 실행 파일, CMD에 기본 인자를 둔다.
- `ADD`의 자동 압축 해제가 필요할 때가 아니면 `COPY`를 쓴다.

## 더 알아보기
- 이전 글: 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」
- 다음 글: 5편 「빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기」
- Dockerfile 레퍼런스: https://docs.docker.com/reference/dockerfile/
