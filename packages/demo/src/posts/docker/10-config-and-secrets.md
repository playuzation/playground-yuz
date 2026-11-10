# [도커와 컨테이너 10/14] 설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법

> **한 줄 요약** — 설정은 이미지 밖에서 실행할 때 넣고, 비밀은 ARG·ENV·COPY로 이미지에 들어가는 순간 기록과 레이어에 남으므로 빌드 때는 BuildKit 시크릿 마운트로, 실행 때는 파일로 마운트되는 시크릿으로 건넨다.

## 이 글에서 다루는 것
- 12요소 앱의 설정 원칙: 이미지는 하나, 환경은 여럿
- ARG·ENV의 수명과, 이미지 기록에 남는 비밀
- 지운 파일도 레이어에 남는다: `docker save`로 꺼내 보기
- BuildKit 빌드 시크릿 `RUN --mount=type=secret`
- 실행 시 비밀은 환경 변수보다 `/run/secrets` 파일

## 이미지는 하나, 환경은 여럿
개발·스테이징·운영은 DB 주소, 로그 수준, 외부 API 키가 다르다. 환경마다 설정을 넣어 이미지를 따로 빌드하면 테스트한 이미지와 배포한 이미지가 달라진다. 2011년에 공개된 **12요소 앱**(The Twelve-Factor App)은 배포마다 달라지는 모든 것을 설정으로 보고, 코드와 엄격히 분리해 환경 변수에 두라고 한다. 판단 기준은 "지금 이 코드를 공개해도 자격 증명이 새지 않는가"다. Docker로 옮기면 이미지(코드 + 런타임)는 모든 환경에서 같은 다이제스트로 쓰고, 설정은 `docker run -e`나 Compose의 `environment`로 실행할 때 넣는다.

그런데 설정 중에서도 **비밀**(secret)은 다르게 다뤄야 한다. 가장 흔한 사고는 빌드에 필요한 토큰(사설 패키지 저장소 등)을 이미지에 넣어 버리는 것이다.

## 원리: 무엇이 이미지에 남나
| 방법 | 보이는 범위 | 이미지에 남는 것 |
|---|---|---|
| ARG | 빌드 중 | RUN 기록에 값 |
| ENV | 빌드·실행 | 설정에 값 |
| COPY 후 rm | 빌드 중 | 앞 레이어에 파일 |
| 시크릿 마운트 | RUN 하나 | 없음 |

ARG는 컨테이너의 환경 변수가 되지 않지만, BuildKit은 그 값을 쓴 RUN의 기록에 `RUN |1 API_TOKEN=…` 형태로 남긴다. ENV는 이미지 설정의 일부라 모든 컨테이너가 물려받는다. 레이어는 바뀌지 않는 tar 묶음이라, 뒤 레이어에서 지운 파일은 화이트아웃으로 가려질 뿐 앞 레이어에 그대로 있다(2편).

## 따라 하기: 비밀이 새는 Dockerfile
가짜 토큰으로 일부러 잘못 만든다.
```dockerfile
# 파일: Dockerfile.bad
FROM alpine:3.20
ARG API_TOKEN
ENV DB_PASSWORD=example-password
RUN echo "token length: ${#API_TOKEN}" > /build-info.txt
COPY token.txt /tmp/token.txt
RUN wc -c < /tmp/token.txt && rm /tmp/token.txt
```
BuildKit의 빌드 검사(`--check`)는 이름이 비밀처럼 보이는 ARG·ENV를 경고한다.
```bash
printf 'fake-token-123' > token.txt
docker build --check -f Dockerfile.bad . 2>&1 | grep -A1 '^WARNING'
```
```text
WARNING: SecretsUsedInArgOrEnv - https://docs.docker.com/go/dockerfile/rule/secrets-used-in-arg-or-env/
Do not use ARG or ENV instructions for sensitive data (ARG "API_TOKEN")
--
WARNING: SecretsUsedInArgOrEnv - https://docs.docker.com/go/dockerfile/rule/secrets-used-in-arg-or-env/
Do not use ARG or ENV instructions for sensitive data (ENV "DB_PASSWORD")
```
경고일 뿐 빌드는 된다. 빌드한 뒤 이미지를 받은 사람의 입장에서 비밀을 찾아본다.
```bash
docker build -q --build-arg API_TOKEN=fake-token-123 \
  -f Dockerfile.bad -t secretdemo:bad . >/dev/null
docker history --no-trunc --format '{{.CreatedBy}}' secretdemo:bad \
  | grep -o 'API_TOKEN=[^ ]*' | sort -u
docker image inspect secretdemo:bad \
  -f '{{range .Config.Env}}{{println .}}{{end}}' | grep PASSWORD
```
```text
API_TOKEN=fake-token-123
DB_PASSWORD=example-password
```
지운 파일은 이미지를 tar로 내보내 레이어를 하나씩 열면 나온다.
```bash
docker save secretdemo:bad -o bad.tar
mkdir img && tar -xf bad.tar -C img
for b in img/blobs/sha256/*; do tar -tf "$b" 2>/dev/null | grep token; done | sort
for b in img/blobs/sha256/*; do tar -xOf "$b" tmp/token.txt 2>/dev/null; done
```
```text
tmp/.wh.token.txt
tmp/token.txt
fake-token-123
```
`docker save`는 이미지를 OCI 형식(레이어마다 blob 하나)으로 내보낸다. COPY 레이어에 `tmp/token.txt`가, 다음 레이어에 그것을 가리는 화이트아웃 `tmp/.wh.token.txt`가 있다. 이미지를 pull할 수 있는 사람은 누구나 이렇게 꺼낼 수 있다. 비밀이 든 이미지를 레지스트리에 올렸다면 태그를 지우는 것으로 끝나지 않는다(CI 캐시, 이미 받아 간 서버에 사본이 있다). **먼저 그 비밀을 폐기하고 새로 발급**한 뒤 이미지를 다시 만든다.

## BuildKit 빌드 시크릿
`RUN --mount=type=secret`은 비밀을 그 RUN이 실행되는 동안에만 파일(기본 `/run/secrets/<id>`)로 붙이고, 레이어에도 기록에도 남기지 않는다. `env=`를 주면 파일 대신 환경 변수로 받는다(Dockerfile 문법 1.10에서 추가된 옵션이다).
```dockerfile
# 파일: Dockerfile.good
FROM alpine:3.20
RUN --mount=type=secret,id=api_token \
    echo "file: $(wc -c < /run/secrets/api_token)" > /build-info.txt
RUN --mount=type=secret,id=api_token,env=API_TOKEN \
    echo "env: ${#API_TOKEN}" >> /build-info.txt
```
```bash
docker build -q --secret id=api_token,src=token.txt \
  -f Dockerfile.good -t secretdemo:good . >/dev/null
docker history --no-trunc secretdemo:good | grep -c fake-token
docker run --rm secretdemo:good sh -c 'exec 2>&1; cat /build-info.txt; ls /run/secrets'
```
```text
0
file: 14
env: 14
ls: /run/secrets: No such file or directory
```
빌드 안에서는 두 방식 모두 14자짜리 토큰을 읽었지만 기록에는 한 번도 나오지 않고, 이미지에는 `/run/secrets`도 없다. CI에서는 `--secret id=api_token,env=API_TOKEN`처럼 러너의 환경 변수를 원천으로 쓸 수 있다. 다만 RUN이 비밀을 다른 파일에 써 두면 그 파일은 레이어에 남는다. 패키지 관리자 설정 파일이 필요하면 그 파일 자체를 시크릿으로 붙인다(이 환경은 인터넷이 없어 실행하지 않은 예).
```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
```

## 실행 시 비밀: 환경 변수보다 파일
실행 시 환경 변수로 넘긴 비밀은 이미지에는 없지만 여러 곳에서 보인다.
```bash
docker run -d --name envdemo -e DB_PASSWORD=example-password \
  alpine:3.20 sleep 300 >/dev/null
docker inspect envdemo -f '{{range .Config.Env}}{{println .}}{{end}}' | grep PASS
docker exec envdemo sh -c 'sh -c env | grep PASS'
docker rm -f envdemo >/dev/null
```
```text
DB_PASSWORD=example-password
DB_PASSWORD=example-password
```
Docker API에 접근할 수 있는 사람은 `docker inspect`로 읽고, 자식 프로세스는 모두 물려받고, 오류 보고 도구가 환경 변수를 통째로 기록하기도 한다. 파일로 주면 읽을 수 있는 프로세스를 파일 권한으로 좁히고 로그에 섞일 일도 줄어든다. Compose의 `secrets`는 파일을 컨테이너의 `/run/secrets/<이름>`에 읽기 전용으로 붙이고, 공식 postgres 이미지처럼 `_FILE`로 끝나는 변수(`POSTGRES_PASSWORD_FILE`)로 파일 경로를 받는 이미지가 많다.
```yaml
# 파일: secretapp/compose.yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    healthcheck:
      test: ["CMD", "pg_isready", "-h", "127.0.0.1"]
      interval: 2s
      retries: 15
secrets:
  db_password:
    file: ./db_password.txt
```
```bash
cd secretapp && echo 'example-password' > db_password.txt
docker compose up -d --wait >/dev/null 2>&1
docker compose exec db sh -c 'ls /run/secrets; env | grep PASS'
docker compose exec -e PGPASSWORD="$(cat db_password.txt)" db \
  psql -h db -U postgres -Atc 'SELECT 1'
docker compose exec -e PGPASSWORD=wrong db psql -h db -U postgres -c 'SELECT 1'
```
```text
db_password
POSTGRES_PASSWORD_FILE=/run/secrets/db_password
1
psql: error: connection to server at "db" (…), port 5432 failed: FATAL:  password authentication failed for user "postgres"
```
환경에는 경로만 있고, 비밀번호는 파일에서 읽혀 실제 인증(`-h db`로 네트워크를 거치게 해 비밀번호 검사를 받았다)에 쓰였다. Swarm이 아닌 Compose의 secrets는 암호화가 아니라 읽기 전용 바인드 마운트이므로, 호스트의 원본 파일 권한과 위치도 관리해야 한다.
```bash
docker compose down >/dev/null 2>&1; cd ..
```

## 흔한 실수와 문제 해결
- **"빌드 인자는 이미지에 안 남는다"**: 위에서 본 것처럼 RUN 기록에 남는다. `docker build --check`는 경고가 있으면 종료 코드 1로 끝나므로 CI의 관문으로 쓸 수 있다.
- **`.env`를 커밋하거나 이미지에 넣었다**: Compose의 `.env`는 변수 치환용이라 비밀이 들어가기 쉽다. `.gitignore`(Git 버전 관리 2편)와 `.dockerignore`(4편)에 함께 넣고, 저장소에는 가짜 값을 넣은 `.env.example`만 둔다. `.dockerignore`가 없으면 `COPY . .`가 `.env`를 이미지에 담는다.
- **빌드 로그에 비밀을 출력했다**: `RUN echo $TOKEN`은 CI 로그에 남는다. 길이나 해시처럼 값이 드러나지 않는 것만 출력한다.
- **시크릿을 바꿨는데 이미지가 그대로다**: 시크릿 내용은 빌드 캐시 키에 들어가지 않아서, 값만 바꾸면 그 RUN은 캐시로 건너뛴다.
```bash
printf 'new-token-45678' > token.txt
docker build --progress=plain --secret id=api_token,src=token.txt \
  -f Dockerfile.good -t secretdemo:good . 2>&1 | grep -c CACHED
docker run --rm secretdemo:good cat /build-info.txt
```
```text
2
file: 14
env: 14
```
15자 토큰으로 바꿨는데 이미지는 14자 토큰으로 만든 그대로다. 비밀이 바뀌면 다시 돌아야 하는 단계는 `--no-cache-filter`나 값이 바뀌는 빌드 인자(토큰 버전 번호 같은)로 캐시를 깬다.
- **설정 내용 공유**: `docker compose config`는 치환된 비밀번호까지 출력한다. 이슈나 채팅에 붙이기 전에 가린다.

## 권장 설정과 체크리스트
- 이미지는 환경과 무관하게 하나만 만들고, 설정은 실행할 때 넣는다.
- 비밀은 ARG·ENV·COPY로 넣지 않는다. 빌드에는 `--mount=type=secret`, 실행에는 파일 시크릿(`/run/secrets`, `_FILE` 변수)을 쓴다.
- 이미지에 비밀이 들어갔다면 폐기·재발급이 먼저고, 재빌드와 레지스트리 정리는 그다음이다.
- 운영에서는 Swarm·Kubernetes의 시크릿 객체나 클라우드 비밀 관리 서비스를 쓴다(접근 기록, 교체 주기 관리).
- 한계: 파일 시크릿도 컨테이너 안에서 root나 같은 UID로 도는 프로세스는 읽을 수 있다. 권한 줄이기는 11편에서 다룬다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 레이어는 고치지 않고 새 버전을 쌓는 퍼시스턴트 구조라서, "지우기"도 새 버전일 뿐 옛 버전의 비밀은 그대로 남는다.
- Git 버전 관리 14편 「설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응」: 커밋 이력도 같은 이유로 비밀을 지우기 어렵고, 대응 순서(폐기 먼저)도 같다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: Actions의 secrets를 환경 변수로 받아 `docker build --secret`의 원천으로 쓰는 것이 CI의 표준 경로다.

## 정리
- 설정은 이미지 밖에서 넣는다. 이미지는 모든 환경에서 같은 것을 쓴다.
- ARG 값은 RUN 기록에, ENV 값은 이미지 설정에, 지운 파일은 앞 레이어에 남는다.
- 빌드 시크릿 마운트는 그 RUN 동안만 보이고 이미지에 흔적을 남기지 않는다.
- 실행 시 비밀은 환경 변수보다 `/run/secrets` 파일로 주고, 새었다면 폐기부터 한다.

## 더 알아보기
- 이전 글: 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」
- 다음 글: 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」
- Docker 공식 문서 Build secrets: https://docs.docker.com/build/building/secrets/
