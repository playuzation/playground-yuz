# [도커와 컨테이너 13/14] 이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드

> **한 줄 요약** — 레지스트리는 매니페스트 내용의 sha256인 다이제스트로 이미지를 저장하고 태그는 그 다이제스트를 가리키는 바뀔 수 있는 이름표일 뿐이므로, 배포는 불변 태그나 다이제스트로 고정하고, 여러 CPU 아키텍처용 이미지는 이미지 인덱스 하나로 묶어 올린다.

## 이 글에서 다루는 것
- 이미지 이름의 구조: 레지스트리, 저장소, 태그, 다이제스트
- `registry:3`으로 로컬 레지스트리를 띄워 push·pull하고 다이제스트를 직접 계산해 확인
- 태그가 움직이는 것을 재현하고 다이제스트로 고정하기, 태그 전략
- buildx 멀티 플랫폼 빌드: 교차 컴파일과 QEMU
- CI에서 푸시, 출처 증명·SBOM·서명

## 문제: "어제 배포한 그 이미지"가 오늘은 다르다
서버 두 대에 `myapp:latest`를 배포했는데 한 대만 재시작한 뒤 동작이 달라졌다. 그사이 누군가 `latest`를 다시 푸시했고 재시작한 서버만 새 이미지를 받은 것이다. 맥(arm64)에서 빌드한 이미지가 amd64 서버에서 `exec format error`로 안 뜨는 일도 흔하다. 둘 다 레지스트리가 이미지를 어떻게 이름 붙이고 저장하는지 알면 막을 수 있다. 실행 결과는 Docker Engine 29.6, buildx 0.35 기준이다.

## 원리: 이름은 네 조각, 저장은 다이제스트로
이미지 참조 `127.0.0.1:5000/team/myapp:1.0@sha256:…`는 네 조각이다.
- **레지스트리**(registry): 이미지를 저장·배포하는 서버. Docker Hub(`docker.io`), GHCR(`ghcr.io`), 클라우드 레지스트리 등. 생략하면 `docker.io`다.
- **저장소**(repository): `team/myapp`. Docker Hub 공식 이미지는 `library/` 네임스페이스라 `alpine`은 `docker.io/library/alpine`이다.
- 태그: 저장소 안의 이름표. 생략하면 `latest`이고 언제든 옮겨 붙일 수 있다.
- 다이제스트: 매니페스트 바이트의 sha256(2편). 한 바이트라도 다르면 다르다.

```bash
docker image ls docker.io/library/alpine:3.20 --format '{{.Repository}}:{{.Tag}}'
```
```text
alpine:3.20
```
레지스트리는 OCI 배포 명세(Distribution Spec)의 HTTP API를 말하는 서버다. 블롭(레이어·설정)과 매니페스트를 다이제스트로 저장하고, 태그는 "이 이름 → 이 다이제스트" 표일 뿐이다. `registry:3`은 그 참조 구현인 CNCF Distribution 프로젝트의 레지스트리다. 로컬에 띄워 보자. Docker는 레지스트리에 HTTPS를 요구하지만 `127.0.0.0/8`은 기본 예외라 이 실습이 된다.
```bash
docker run -d --name reg -p 127.0.0.1:5000:5000 registry:3 >/dev/null
until curl -s http://127.0.0.1:5000/v2/ >/dev/null; do sleep 0.2; done
curl -si http://127.0.0.1:5000/v2/ | tr -d '\r' | grep -i '^docker-dist'
```
```text
Docker-Distribution-Api-Version: registry/2.0
```

## 따라 하기: tag, push, pull
```dockerfile
# 파일: app/Dockerfile
FROM alpine:3.20
COPY VERSION /VERSION
CMD ["cat", "/VERSION"]
```
`docker tag`는 이미지를 복사하지 않고 이름만 하나 더 붙인다. 이름의 레지스트리 부분이 push할 곳을 정한다.
```bash
echo 'version 1' > app/VERSION
docker build -q -t myapp:1.0 app >/dev/null
R=127.0.0.1:5000/team/myapp
docker tag myapp:1.0 $R:1.0
docker push $R:1.0
curl -s http://127.0.0.1:5000/v2/_catalog
curl -s http://127.0.0.1:5000/v2/team/myapp/tags/list
```
```text
The push refers to repository [127.0.0.1:5000/team/myapp]
…: Pushed
…: Pushed
…: Pushed
1.0: digest: sha256:… size: 855
{"repositories":["team/myapp"]}
{"name":"team/myapp","tags":["1.0"]}
```
다이제스트는 빌드마다 달라지므로(생성 시각이 들어간다) 가렸다. 대신 매니페스트 바이트의 sha256을 직접 계산해 레지스트리 응답 헤더, 로컬 이미지 기록과 맞춰 본다.
```bash
curl -s -D headers.txt -o index.json \
  -H 'Accept: application/vnd.oci.image.index.v1+json' \
  http://127.0.0.1:5000/v2/team/myapp/manifests/1.0
grep -i '^docker-content-digest' headers.txt | tr -d '\r' \
  | cut -d' ' -f2 > from-registry
echo "sha256:$(sha256sum < index.json | cut -d' ' -f1)" > computed
docker image inspect $R:1.0 \
  --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | grep "^$R@" | cut -d@ -f2 > local
cmp from-registry computed && cmp computed local && echo "세 값이 같다"
jq -r '.manifests[] | [.platform.os + "/" + .platform.architecture,
  .annotations["vnd.docker.reference.type"] // "image"] | join(" ")' index.json
```
```text
세 값이 같다
linux/amd64 image
unknown/unknown attestation-manifest
```
push한 것은 매니페스트 하나가 아니라 플랫폼별 매니페스트의 목록인 **이미지 인덱스**(image index)였다. linux/amd64 이미지와, 플랫폼이 `unknown/unknown`인 증명(attestation) 매니페스트가 들어 있다. 후자는 BuildKit이 기본으로 붙이는 빌드 출처 증명(provenance)이고 `--provenance=false`로 끈다. 이제 로컬 이미지를 지우고 받아 본다.
```bash
docker image rm myapp:1.0 $R:1.0 >/dev/null
docker pull $R:1.0 | grep -E '^(Digest|Status)' | sed 's/sha256:.*/sha256:…/'
docker run --rm $R:1.0
```
```text
Digest: sha256:…
Status: Downloaded newer image for 127.0.0.1:5000/team/myapp:1.0
version 1
```

## 태그는 움직인다: 다이제스트로 고정하기
같은 태그에 다른 내용을 덮어 푸시하면 어떻게 되는지 보자. 실무에서 `latest`나 `1.0`을 다시 푸시하는 것과 같다.
```bash
old=$(cat computed)
echo 'version 2' > app/VERSION
docker build -q -t $R:1.0 app >/dev/null
docker push -q $R:1.0
docker run --rm $R:1.0
docker run --rm -q $R:1.0@$old
```
```text
127.0.0.1:5000/team/myapp:1.0
version 2
version 1
```
태그 `1.0`은 새 이미지로 옮겨 갔지만 옛 매니페스트는 레지스트리에 남아, 다이제스트로 받으면 여전히 `version 1`이다. 마지막 줄처럼 태그와 다이제스트를 함께 쓰면 태그가 지금 무엇을 가리키든 다이제스트를 따른다. 그래서 배포 설정에 `image: registry.example.com/team/myapp:1.4.2@sha256:…`처럼 다이제스트를 적으면 모든 서버가 같은 바이트를 실행하고, 태그는 사람이 읽기 위한 주석이 된다.

## 태그 전략
한 이미지에 이름표 여러 개를 붙이는 것이 보통이다.
```bash
for t in 1.4.2 1.4 1 sha-3f9c2ab; do docker tag $R:1.0 $R:$t; done
docker push -q --all-tags $R
curl -s http://127.0.0.1:5000/v2/team/myapp/tags/list
docker rm -f reg >/dev/null
```
```text
127.0.0.1:5000/team/myapp
{"name":"team/myapp","tags":["1","1.0","1.4","1.4.2","sha-3f9c2ab"]}
```
- 불변 태그: `1.4.2`(시맨틱 버전 전체)와 `sha-3f9c2ab`(Git 커밋 해시)는 다시 쓰지 않는다. 배포와 롤백은 이것으로 하고, 커밋 태그로 이미지에서 소스를 거꾸로 찾는다.
- 움직이는 태그: `1.4`, `1`, `latest`는 "그 계열의 최신"을 가리키는 편의용이다. 베이스 이미지(`python:3.12-slim`)가 이렇게 움직인다.
- `latest`의 함정: 생략하면 붙는 기본 이름일 뿐 최신이라는 보장이 없고, 로컬에 같은 태그가 있으면 `docker run`은 레지스트리를 확인하지 않아 서버마다 다른 `latest`를 돌린다.
- 일부 레지스트리는 태그 덮어쓰기를 막는 설정을 제공한다(예: Amazon ECR의 태그 변경 불가 설정).

## 멀티 아키텍처 빌드
pull할 때 Docker는 인덱스에서 자기 플랫폼의 매니페스트를 고른다. 그러니 인덱스에 amd64와 arm64를 함께 넣으면 맥과 서버가 같은 이름을 쓴다. 만드는 방법은 둘이다. QEMU 에뮬레이션은 Dockerfile을 그대로 다른 아키텍처로 실행하지만 모든 `RUN`을 에뮬레이션해서 느리다. 교차 컴파일은 빌드는 호스트 아키텍처에서 하고 결과물만 대상 아키텍처로 만든다. Go는 `GOARCH`만 바꾸면 된다.
```go
// 파일: hello/main.go
package main

import (
	"fmt"
	"runtime"
)

func main() {
	fmt.Printf("hello from %s/%s\n", runtime.GOOS, runtime.GOARCH)
}
```
```dockerfile
# 파일: hello/Dockerfile
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY main.go .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -o /out/hello main.go

FROM scratch
COPY --from=build /out/hello /hello
ENTRYPOINT ["/hello"]
```
`BUILDPLATFORM`(빌드하는 기계)과 `TARGETOS`·`TARGETARCH`(만들 대상)는 BuildKit이 채워 주는 인자다. 빌드 단계는 amd64에서 두 번 돌고, 실행 단계는 `scratch`라 받을 베이스도 없다. 레지스트리를 다시 띄워 두 플랫폼을 한 번에 푸시한다.
```bash
docker run -d --name reg -p 127.0.0.1:5000:5000 registry:3 >/dev/null
until curl -s http://127.0.0.1:5000/v2/ >/dev/null; do sleep 0.2; done
H=127.0.0.1:5000/team/hello:1.0
docker buildx build --platform linux/amd64,linux/arm64 \
  -t $H --push hello 2>/dev/null
docker buildx imagetools inspect $H | grep Platform
docker run --rm -q $H
docker run --rm -q --platform linux/arm64 $H
docker rm -f reg >/dev/null
```
```text
  Platform:    linux/amd64
  Platform:    linux/arm64
  Platform:    unknown/unknown
  Platform:    unknown/unknown
hello from linux/amd64
exec /hello: exec format error
```
인덱스에 두 플랫폼과 각각의 증명 매니페스트가 들어갔고, 이 amd64 호스트는 amd64판을 골라 실행했다. arm64판을 강제로 받으면 에뮬레이터가 없는 이 호스트의 커널은 ARM 기계어를 실행하지 못한다(진단법은 14편). 기본 `docker` 드라이버로 멀티 플랫폼 이미지를 만들려면 containerd 이미지 저장소가 필요하다(Docker Engine 29부터 새 설치의 기본값). 아니면 `docker buildx create --driver docker-container --use`로 별도 빌더를 만든다. C 확장이 있는 파이썬 패키지처럼 교차 컴파일이 어려우면 QEMU를 등록해 쓴다.
```sh
docker run --privileged --rm tonistiigi/binfmt --install all
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/example-org/example-app:1.4.2 --push .
```

## CI에서 푸시, 출처 증명·SBOM·서명
실무에서는 CI가 Git 태그 `v1.4.2`를 받아 빌드하고 `1.4.2`, `1.4`, `sha-…` 태그로 푸시한다. GitHub Actions라면 `docker/login-action`, `docker/metadata-action`, `docker/build-push-action` 조합이다(GitHub 협업과 자동화 9편). 공급망 보안을 위해 세 가지를 더 붙인다. 출처 증명은 위의 증명 매니페스트로 "어느 소스·빌더로 만들었나"를 기록하고, SBOM(소프트웨어 구성 명세)은 이미지 안 패키지 목록을 붙인다(`--sbom=true`는 스캐너 이미지를 받아야 해서 여기서는 실행하지 않았다). 서명은 Sigstore의 cosign 같은 도구로 태그가 아니라 다이제스트에 붙이고, 배포 쪽에서 검증한 이미지만 받는다.
```sh
docker buildx build --sbom=true --provenance=mode=max \
  -t ghcr.io/example-org/example-app:1.4.2 --push .
cosign sign --key cosign.key ghcr.io/example-org/example-app@sha256:<다이제스트>
cosign verify --key cosign.pub ghcr.io/example-org/example-app@sha256:<다이제스트>
```

## 흔한 실수와 문제 해결
- `http: server gave HTTP response to HTTPS client`: HTTP로 띄운 원격 레지스트리에 push했다. TLS 인증서를 붙이는 것이 정답이고, 데몬의 `insecure-registries`는 격리된 시험 환경에서만 쓴다.
- `denied: requested access to the resource is denied`: 로그인하지 않았거나 이름에 네임스페이스가 빠졌다. Docker Hub에 `myapp`을 push하면 `docker.io/library/myapp`이 되어 권한이 없다.
- 맥에서 만든 이미지가 서버에서 안 뜬다: `docker image inspect --format '{{.Architecture}}'`로 아키텍처를 확인하고 `--platform`으로 다시 빌드한다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 다이제스트는 내용의 해시라서 이름 자체가 "같은 바이트"의 증명이 되고, 이 글에서 `sha256sum`으로 직접 확인했다.
- 언어 기초 5편 「컴파일 언어: 실행 전에 번역하기」: 컴파일러가 대상 CPU의 기계어를 만든다는 점 덕분에 `GOARCH` 하나로 arm64 바이너리를 amd64에서 만들 수 있다.
- Git 버전 관리 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」: Git 태그와 시맨틱 버전이 이미지 태그 전략의 원본이 된다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: GHCR에 빌드·푸시하는 워크플로가 이 글의 태그·다이제스트 규칙을 자동으로 지킨다.

## 정리
- 레지스트리는 블롭과 매니페스트를 다이제스트로 저장하고, 태그는 다이제스트를 가리키는 바뀔 수 있는 이름표다.
- 다이제스트는 매니페스트 바이트의 sha256이다. 레지스트리 헤더·직접 계산·로컬 기록이 모두 같았다.
- 배포는 불변 태그(`1.4.2`, `sha-…`)나 다이제스트로 고정하고 `latest`에 기대지 않는다.
- 멀티 플랫폼 이미지는 플랫폼별 매니페스트를 묶은 인덱스다. 교차 컴파일이 빠르고 QEMU는 범용이다.

## 더 알아보기
- 이전 글: 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」
- 다음 글: 14편 「컨테이너로 일하는 습관: 개발 환경, 디버깅, 정리, 그다음 단계」
