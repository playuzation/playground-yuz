# [도커와 컨테이너 6/14] 멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기

> **한 줄 요약** — 멀티 스테이지 빌드는 한 Dockerfile 안에서 컴파일러가 있는 빌드 단계와 결과물만 담는 실행 단계를 나누고 `COPY --from`으로 필요한 파일만 넘겨, 실행 이미지에서 빌드 도구·소스·캐시를 통째로 빼는 기법이다.

## 이 글에서 다루는 것
- 빌드 도구가 실행 이미지에 남는 문제와, 지워도 작아지지 않는 이유
- 스테이지와 `COPY --from`, BuildKit이 필요한 스테이지만 빌드하는 원리
- Go 정적 바이너리를 `scratch`에 담고 크기·레이어 수 비교
- slim·alpine·distroless·scratch 고르기와 musl·glibc 차이
- `--target`으로 테스트 단계 돌리기, 셸 없는 이미지 디버깅

## 컴파일러까지 배포하는 이미지
4편의 파이썬 앱은 인터프리터가 곧 실행 환경이었다. Go·자바·C나 프런트엔드 번들처럼 "빌드하면 결과물이 나오는" 앱은 다르다. 빌드에 쓴 `golang:1.26-alpine` 위에서 그대로 실행하면 실행에는 필요 없는 컴파일러, 표준 라이브러리 소스, 빌드 캐시가 모두 배포된다. 내려받는 시간과 저장 비용이 늘고, 셸과 패키지 관리자가 남아 점검할 대상과 공격 표면도 커진다(11편).

끝에 `RUN rm -rf /usr/local/go`를 붙여도 소용없다. 레이어는 쌓이기만 하므로 아래 레이어의 파일은 화이트아웃으로 가려질 뿐이다(2편). Docker 17.05(2017년 5월)에 멀티 스테이지 빌드가 들어오기 전에는 Dockerfile 두 개와 결과물을 옮기는 스크립트(빌더 패턴)를 썼다.

## 원리: 스테이지와 COPY --from
`FROM`이 나올 때마다 새 **스테이지**(stage)가 시작되고 `AS 이름`으로 이름을 붙인다. 결과 이미지에는 마지막 스테이지(또는 `--target`으로 고른 스테이지)의 레이어만 들어가고, 앞 스테이지는 빌드 중에만 있는 중간 파일 시스템이다. `COPY --from=build /out/hello /hello`는 다른 스테이지에서 파일만 골라 복사하므로 실행 이미지에는 COPY 레이어 하나만 생긴다. BuildKit은 Dockerfile을 스테이지 의존 그래프로 바꾸고 목표 스테이지에 필요한 스테이지만 빌드한다(서로 독립인 스테이지는 병렬로).
```text
      golang:1.26-alpine
             │
     build: go build
     ┌───────┼────────┐
     ↓       ↓        ↓
   test    debug    runtime
  go test  alpine   scratch
```

## 따라 하기: Go 서버를 scratch에 담기
표준 라이브러리만 쓰는 Go 웹 서버와 테스트 하나를 준비한다. 외부 모듈이 없으니 인터넷 없이 빌드된다.
```go
// 파일: main.go
package main

import (
	"fmt"
	"net/http"
	"os"
	"runtime"
)

func greeting() string { return "hello from a tiny image" }

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println(runtime.Version(), runtime.GOOS+"/"+runtime.GOARCH)
		return
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, greeting())
	})
	http.ListenAndServe(":8080", nil)
}
```
```go
// 파일: main_test.go
package main

import "testing"

func TestGreeting(t *testing.T) {
	if greeting() == "" {
		t.Fatal("empty greeting")
	}
}
```
```text
// 파일: go.mod
module example.com/hello

go 1.26
```
비교용 한 단계 Dockerfile과 멀티 스테이지 Dockerfile이다.
```dockerfile
# 파일: Dockerfile.single
FROM golang:1.26-alpine
WORKDIR /src
COPY go.mod *.go ./
RUN go build -o /usr/local/bin/hello .
CMD ["hello"]
```
```dockerfile
# 파일: Dockerfile
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/hello .

FROM build AS test
RUN go test ./...

FROM alpine:3.20 AS debug
COPY --from=build /out/hello /usr/local/bin/hello
ENTRYPOINT ["hello"]

FROM scratch AS runtime
COPY --from=build /out/hello /hello
USER 65534:65534
ENTRYPOINT ["/hello"]
```
`CGO_ENABLED=0`은 C 라이브러리에 링크하지 않는 정적 바이너리를 만들라는 뜻이고, `-ldflags="-s -w"`는 디버그 기호를 빼서 바이너리를 줄인다. `scratch`는 내려받는 이미지가 아니라 "빈 파일 시스템"을 뜻하는 예약어다. 셋을 빌드해 크기를 비교한다.
```bash
docker build -q -f Dockerfile.single -t gohello:single . >/dev/null
docker build -q -t gohello:scratch . >/dev/null
docker build -q --target debug -t gohello:alpine . >/dev/null
for t in single alpine scratch; do
  docker image ls gohello:$t --format '{{.Tag}}\t{{.Size}}'
done
docker run --rm gohello:scratch version
```
```text
single	489MB
alpine	20.4MB
scratch	8.24MB
go1.26.9 linux/amd64
```
같은 프로그램이 489MB에서 8.24MB가 되었다(이 환경의 DISK USAGE 열: 압축본과 풀어 놓은 크기의 합).

## 검증: 실행 이미지에 무엇이 남았나
레이어 수와 기록을 보면 실행 이미지가 빌드 스테이지와 분리되었음을 알 수 있다.
```bash
for t in single scratch; do
  docker image inspect -f "$t {{len .RootFS.Layers}}" gohello:$t
done
docker run --rm --entrypoint du gohello:single \
  -sh /root/.cache/go-build /usr/local/bin/hello
docker history gohello:scratch --format '{{.CreatedBy}} | {{.Size}}'
```
```text
single 8
scratch 1
86.5M	/root/.cache/go-build
8.0M	/usr/local/bin/hello
ENTRYPOINT ["/hello"] | 0B
USER 65534:65534 | 0B
COPY /out/hello /hello # buildkit | 5.78MB
```
한 단계 이미지에는 바이너리(8.0M)보다 열 배 큰 빌드 캐시가 실려 있다. 실행 이미지는 5.78MB짜리 COPY 레이어 하나뿐이고 셸도 없다.
```bash
docker run --rm --entrypoint sh gohello:scratch
```
```text
docker: Error response from daemon: …exec: "sh": executable file not found in $PATH
...
```
`scratch`에서 돌아가려면 바이너리가 정적으로 링크되어 있어야 한다. 셸이 없으니 `docker create`로 컨테이너를 만들기만 하고 `docker cp`로 파일을 꺼내 호스트의 `file`로 본다. 비교 대상은 alpine의 `busybox`다.
```bash
docker create --name probe gohello:scratch >/dev/null
docker cp -q probe:/hello ./hello.bin
docker rm probe >/dev/null
docker run --rm alpine:3.20 cat /bin/busybox > busybox.bin
file -b hello.bin busybox.bin \
  | grep -oE '(statically|dynamically) linked(, interpreter [^,]*)?'
```
```text
statically linked
dynamically linked, interpreter /lib/ld-musl-x86_64.so.1
```
동적으로 링크된 `busybox`를 `scratch`에 옮기면 어떻게 될까.
```dockerfile
# 파일: Dockerfile.broken
FROM alpine:3.20 AS src
FROM scratch
COPY --from=src /bin/busybox /busybox
ENTRYPOINT ["/busybox", "echo", "hi"]
```
```bash
docker build -q -f Dockerfile.broken -t gohello:broken . >/dev/null
docker run --rm gohello:broken
```
```text
exec /busybox: no such file or directory
```
파일은 분명 있는데 "no such file or directory"다. 커널이 ELF 머리에 적힌 해석기(동적 로더) `/lib/ld-musl-x86_64.so.1`을 찾지 못한 것이다. 이 메시지를 보면 바이너리가 아니라 로더와 libc를 의심한다.

## 베이스 이미지 고르기
이 환경에 있는 베이스 이미지의 크기를 같은 방법으로 쟀다.
```bash
for i in alpine:3.20 ubuntu:24.04 python:3.12-slim \
         golang:1.26-alpine; do
  docker image ls $i --format '{{.Repository}}:{{.Tag}} {{.Size}}'
done
```
```text
alpine:3.20 12.2MB
ubuntu:24.04 119MB
python:3.12-slim 179MB
golang:1.26-alpine 364MB
```
- **alpine**은 glibc 대신 musl libc를 쓴다. 다른 libc용으로 링크된 바이너리는 위와 같은 오류로 실패한다. 파이썬은 musl용 휠이 없는 패키지를 소스에서 컴파일하게 되어 느리고 오히려 커질 수 있어 slim을 고르는 경우가 많다.
- **distroless**(GoogleContainerTools 프로젝트)는 셸·패키지 관리자 없이 런타임 파일만 담는다. `gcr.io/distroless/static-debian12`에는 CA 인증서, 시간대 데이터, `/etc/passwd`(UID 65532 nonroot 포함), `/tmp`만 있어 Go 정적 바이너리에 알맞고, `:nonroot`·`:debug`(busybox 셸) 태그가 있다. 이 환경에는 받아 두지 않아 크기는 재지 않았다.
- **scratch**에는 CA 인증서가 없어 HTTPS 호출이 `x509: certificate signed by unknown authority`로 실패하고, 시간대 데이터와 `/etc/passwd`도 없다. 인증서는 빌드 스테이지의 `/etc/ssl/certs/ca-certificates.crt`를 `COPY --from`으로, 시간대는 Go의 `time/tzdata` 패키지로 넣고, 사용자는 숫자 UID로 지정한다(11편).

## --target: 테스트는 빌드 그래프의 한 갈래
기본 빌드의 목표는 마지막 스테이지 `runtime`이므로 `test`·`debug` 스테이지는 실행되지 않는다(BuildKit이 기본이 된 Docker 23.0 이전의 레거시 빌더는 목표 앞의 스테이지를 모두 빌드했다). 실행된 단계 이름만 뽑아 보자.
```bash
docker build --progress=plain -t gohello:scratch . 2>&1 \
  | grep -oE '\[(build|test|debug|runtime) [0-9]/[0-9]\]' | sort -u
```
```text
[build 1/4]
[build 2/4]
[build 3/4]
[build 4/4]
[runtime 1/1]
```
CI에서는 `--target test`로 테스트 스테이지를 돌린다. 캐시 때문에 테스트가 건너뛰어지지 않게 `--no-cache-filter test`로 그 스테이지만 캐시를 끈다.
```bash
docker build --progress=plain --target test \
  --no-cache-filter test . 2>&1 \
  | grep -E '^#[0-9]+ [0-9.]+ ok' | awk '{print $3, $4}'
```
```text
ok example.com/hello
```
테스트가 실패하면 `RUN go test`가 0이 아닌 코드로 끝나 빌드가 멈추므로, 실행 이미지를 만들기 전의 관문이 된다.

## 셸 없는 컨테이너 디버깅
실행 이미지에 셸이 없으면 `docker exec … sh`가 안 된다. 대신 대상 컨테이너의 PID·네트워크 네임스페이스에 붙는 임시 디버그 컨테이너를 띄운다. 도구는 디버그 컨테이너 쪽 이미지(여기서는 busybox)에서 온다.
```bash
docker run -d --name gohello -p 8080:8080 gohello:scratch >/dev/null
docker run --rm --pid container:gohello \
  --network container:gohello busybox:1.37 \
  sh -c 'ps -o pid,user,args | head -2; wget -qO- localhost:8080'
docker rm -f gohello >/dev/null
```
```text
PID   USER     COMMAND
    1 nobody   /hello
hello from a tiny image
```
PID 1이 `/hello`이고, 같은 네트워크 네임스페이스라 `localhost:8080`이 그 서버다. UID 65534가 `nobody`로 보이는 것은 busybox 쪽 `/etc/passwd`로 이름을 붙였기 때문이다(커널은 숫자만 안다). 파일만 보려면 `docker cp`, 셸이 꼭 필요하면 `--target debug` 변형을 쓴다. Docker Desktop의 `docker debug`도 같은 일을 하지만 Pro·Team·Business 구독이 필요하다.

## 흔한 실수와 문제 해결
- `exec /hello: no such file or directory`: 동적 링크 바이너리를 `scratch`나 libc가 다른 이미지에 넣었다. `CGO_ENABLED=0`으로 정적 빌드하거나 빌드와 같은 libc의 베이스를 쓴다.
- `exec: "sh": executable file not found`: `CMD hello`처럼 셸 형식으로 쓰면 `/bin/sh -c`로 감싸지므로 셸 없는 이미지에서 실패한다. exec 형식을 쓴다(4편).
- `COPY --from`의 경로 오타는 빌드에서 바로 드러난다.
```bash
printf 'FROM golang:1.26-alpine AS build\nFROM scratch\n%s\n' \
  'COPY --from=build /out/helo /hello' > Dockerfile.typo
docker build -q -f Dockerfile.typo . 2>&1 | grep ERROR
```
```text
ERROR: failed to build: failed to solve: failed to compute cache key: failed to calculate checksum of ref …: "/out/helo": not found
```

## 권장 설정과 체크리스트
- 빌드 스테이지는 버전을 고정한 툴체인 이미지, 실행 스테이지는 필요한 것만 있는 베이스(정적 바이너리면 scratch·distroless static, 인터프리터 언어면 slim).
- `COPY --from`으로는 결과물만 옮기고, 소스·캐시가 따라오지 않았는지 `docker history`로 확인한다.
- 테스트·린트 스테이지를 두고 CI에서 `--target`으로 돌린다(캐시 전략은 5편).
- 디버그용 변형 스테이지를 같은 파일에 두되 배포 태그는 실행 스테이지에만 붙인다.
- 한계: 인터프리터 언어는 런타임이 크기의 대부분이라 효과가 작지만, C 확장 같은 의존성 컴파일을 빌드 스테이지에 가두는 데는 쓸모 있다.

## 어디에 쓰이나
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: 정적 링크와 동적 로더의 차이가 `scratch`에서 "no such file or directory"가 나는 이유 그 자체다.
- 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」: 셸·패키지 관리자가 없는 실행 이미지는 점검할 패키지와 침입 뒤 쓸 도구가 모두 적다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: CI가 빌드해 레지스트리에 올리는 이미지가 작을수록 푸시와 배포가 빠르다.

## 정리
- `FROM`마다 스테이지가 생기고, 결과 이미지는 목표 스테이지의 레이어만 가진다.
- `COPY --from`으로 결과물만 옮기면 컴파일러·빌드 캐시가 빠진다(489MB → 8.24MB).
- `scratch`에서는 정적 바이너리만 돈다. 있는 파일이 "no such file or directory"면 동적 로더가 없다는 신호다.
- BuildKit은 목표에 필요한 스테이지만 빌드하므로 테스트·디버그 스테이지를 한 파일에 둘 수 있다.

## 더 알아보기
- 이전 글: 5편 「빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기」
- 다음 글: 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」
- Docker 공식 문서 Multi-stage builds: https://docs.docker.com/build/building/multi-stage/
