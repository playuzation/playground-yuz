# [도커와 컨테이너 2/14] 이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트

> **한 줄 요약** — 이미지는 파일 시스템 변경분(레이어)을 tar로 쌓고 설정·매니페스트로 묶은 것이며 모든 조각이 sha256 내용 주소로 불리므로, 태그는 움직이는 이름표이고 다이제스트는 내용 그 자체이며, 컨테이너는 그 위에 overlay 쓰기 계층을 얹어 copy-on-write로 동작한다.

## 이 글에서 다루는 것
- 이미지의 구성: 레이어, 설정, 매니페스트, 멀티 아키텍처 인덱스
- sha256을 직접 계산해 다이제스트와 맞춰 보기
- overlay 파일 시스템: 읽기 전용 레이어, 쓰기 계층, copy-on-write, 화이트아웃
- 태그와 다이제스트, 그리고 지운 파일이 이미지 크기를 줄이지 않는 이유

## 문제: 같은 태그, 다른 이미지
어제 되던 빌드가 오늘 깨졌는데 Dockerfile은 그대로다. `FROM python:3.12-slim`이 가리키는 이미지가 밤사이 패치판으로 바뀐 것이다. 빌드 중 받은 캐시를 `rm`으로 지웠는데 이미지가 작아지지 않는 일도 있다. 둘 다 이미지의 저장 방식을 알면 설명된다.

## 원리: 내용 주소로 엮인 파일 묶음
이미지는 파일 몇 종류로 이루어진다.
- **레이어**(layer): 파일 시스템 변경분을 담은 tar(보통 gzip 압축). Dockerfile의 `RUN`, `COPY`가 하나씩 만든다.
- **설정**(config): 환경 변수, 기본 명령, 압축을 푼 레이어 tar의 해시 목록(diff ID)을 담은 JSON.
- **매니페스트**(manifest): 설정 하나와 레이어들의 다이제스트·크기를 나열한 JSON.
- **인덱스**(index): 플랫폼(amd64, arm64 …)별 매니페스트 목록. 같은 태그로 여러 CPU용 이미지를 내놓는 장치다.

모든 조각은 내용의 sha256 해시, 즉 **다이제스트**(digest)로 불린다. 내용이 1비트라도 다르면 이름이 달라지고, 같은 내용은 어디서 받아도 같은 이름이다. Git이 블롭·트리·커밋을 해시로 부르는 것과 같은 구조다(Git 버전 관리 3편). 반면 `alpine:3.20` 같은 **태그**(tag)는 인덱스(단일 플랫폼이면 매니페스트)를 가리키는 바꿀 수 있는 이름표다.
```text
alpine:3.20  <- tag (mutable)
  ↓
index d9e853e87e55
  ├─ amd64 manifest c64c687cbea9
  │    ├─ config bf8527eb54c3
  │    └─ layer  25f1d6b1951a
  ├─ arm64 manifest 45e09956dc66
  └─ ... 6 more platforms
```

## 따라 하기: 이미지 들여다보기
```bash
docker image ls --tree alpine:3.20
```
```text
IMAGE                   ID             DISK USAGE   CONTENT SIZE   EXTRA
alpine:3.20             d9e853e87e55       12.2MB         3.71MB…
├─ linux/amd64          c64c687cbea9       12.1MB         3.63MB…
├─ linux/arm/v6         37753b296504           0B             0B…
...
└─ linux/s390x          856b20bf4946           0B             0B…
```
인덱스 아래 플랫폼 8개가 있고 이 컴퓨터에는 amd64 내용만 있다(나머지는 0B). CONTENT SIZE는 압축된 크기, DISK USAGE는 압축을 푼 스냅숏까지 더한 크기다. 이 형식은 Docker 29부터 새 설치의 기본값이 된 containerd 이미지 저장소의 것이고, 예전 overlay2 저장소는 `SIZE` 한 열만 보인다.
```bash
docker image inspect alpine:3.20 --format '{{.Id}}'
docker image inspect alpine:3.20 --format '{{json .RootFS.Layers}}'
docker history alpine:3.20 --format '{{.Size}}\t{{.CreatedBy}}'
```
```text
sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
["sha256:08bc4e534116aa76b16015484b82eac51f9a593416feae9296c8a2d4bb7aa4a2"]
0B	CMD ["/bin/sh"]
8.47MB	ADD alpine-minirootfs-3.20.10-x86_64.tar.gz …
```
알파인은 루트 파일 시스템 tar를 `ADD`한 레이어 하나와 레이어 없는 `CMD` 기록뿐이다. `RootFS.Layers`의 값이 diff ID다.

## 검증: 다이제스트를 직접 계산하기
`docker save`로 이미지를 OCI 형식 tar로 꺼내면 조각들이 `blobs/sha256/<다이제스트>` 파일로 나온다. 파일 이름이 정말 내용의 해시인지 확인한다.
```bash
docker save --platform linux/amd64 alpine:3.20 -o alpine.tar
mkdir alpine && tar -xf alpine.tar -C alpine && cd alpine
for f in blobs/sha256/*; do
  h=$(sha256sum < "$f" | cut -c1-64)
  [ "$h" = "${f##*/}" ] && echo "일치 ${h:0:12} $(wc -c < "$f")바이트"
done
```
```text
일치 25f1d6b1951a 3630321바이트
일치 3a030ca3f633 5056바이트
일치 6243dec92868 838바이트
일치 9897c99a1a79 241바이트
일치 bf8527eb54c3 612바이트
일치 c64c687cbea9 1023바이트
일치 d4050d56ebf2 73692바이트
```
일곱 조각 모두 이름과 해시가 같다. 3.6MB짜리가 압축된 레이어, 1023바이트가 amd64 매니페스트, 612바이트가 설정이다(나머지는 빌드 출처 증명(attestation) 조각). 압축을 푼 tar의 해시가 diff ID인지도 본다.
```bash
layer=$(jq -r '.[0].Layers[0]' manifest.json)
echo "$layer"
gunzip -c "$layer" | sha256sum | cut -c1-64
cd ..
```
```text
blobs/sha256/25f1d6b1951ac8eb3740558fe94cb83d377bdadf95fd9f98b50d2e1b96130471
08bc4e534116aa76b16015484b82eac51f9a593416feae9296c8a2d4bb7aa4a2
```
`docker image inspect`의 diff ID와 같다. 레지스트리로 오가는 압축본은 그 해시(25f1…)로, 파일 시스템을 만드는 압축 푼 내용은 그 해시(08bc…)로 부른다.

## 레이어 공유
같은 레이어는 한 번만 받고 한 번만 저장된다. 공식 이미지 넷의 첫 레이어를 비교한다.
```bash
for i in node:22-alpine golang:1.26-alpine postgres:18-alpine registry:3; do
  docker image inspect $i --format "{{index .RootFS.Layers 0}} $i" | cut -c8-19,72-
done
```
```text
74d97c428c51 node:22-alpine
74d97c428c51 golang:1.26-alpine
74d97c428c51 postgres:18-alpine
74d97c428c51 registry:3
```
네 이미지가 같은 알파인 베이스 레이어 위에 있어서 이 레이어는 디스크에 하나뿐이다. 팀 이미지들이 베이스를 맞추면 pull과 저장 공간이 준다.

## 컨테이너의 쓰기 계층: overlay와 copy-on-write
컨테이너를 만들면 도커는 리눅스의 overlay 파일 시스템으로 이미지 레이어들을 읽기 전용 아래층(lowerdir)으로 겹치고, 그 위에 컨테이너 전용 쓰기 계층(upperdir)을 얹어 하나의 트리(merged)로 보여 준다.
- 읽기: 위층부터 찾아 처음 나오는 파일을 보여 준다.
- 수정: 아래층 파일을 처음 고칠 때 통째로 위층에 복사한 뒤 고친다(**copy-on-write**, copy-up).
- 삭제: 아래층 파일은 지울 수 없으므로 위층에 "지워졌음" 표시인 **화이트아웃**(whiteout)을 만든다.

```bash
docker run -d --name ovl alpine:3.20 sleep 600 > /dev/null
docker exec ovl sh -c 'rm /etc/motd; echo "# x" >> /etc/profile; echo hi > /root/new.txt'
docker diff ovl | sort -k2
```
```text
C /etc
D /etc/motd
C /etc/profile
C /root
A /root/new.txt
```
`docker diff`는 쓰기 계층을 아래층과 비교해 추가(A), 변경(C), 삭제(D)를 보여 준다(순서가 일정하지 않아 경로로 정렬했다). 쓰기 계층을 직접 열어 보자(리눅스 호스트, root 권한 필요). containerd 저장소는 overlay 마운트 정보에 컨테이너 ID가 들어 있고, overlay2 저장소는 `docker inspect --format '{{.GraphDriver.Data.UpperDir}}'`로 경로를 얻는다.
```bash
m=$(mount | grep "$(docker inspect --format '{{.Id}}' ovl)")
upper=$(echo "$m" | grep -o 'upperdir=[^,]*' | cut -d= -f2)
echo "lowerdir 수: $(echo "$m" | grep -o 'lowerdir=[^,]*' | tr ':' '\n' | wc -l)"
sudo find "$upper" -mindepth 1 | sed "s|$upper||" | sort
sudo stat -c '/etc/motd: %F %t,%T' "$upper/etc/motd"
```
```text
lowerdir 수: 2
/etc
/etc/motd
/etc/profile
/root
/root/new.txt
/etc/motd: character special file 0,0
```
아래층은 알파인 레이어 하나와, 도커가 `/etc/hosts`·`/etc/resolv.conf` 자리를 만들어 두는 초기화 계층 하나다. 위층에는 바뀐 파일만 있고, 지운 `/etc/motd`는 장치 번호 0,0인 문자 장치 파일, 즉 overlay의 화이트아웃으로 남았다.

## 지운 파일이 이미지에 남는 이유
이미지 레이어도 같은 규칙으로 쌓인다. 20MB 파일을 만든 `RUN`과 지우는 `RUN`을 나눈 경우와 한 `RUN`에서 만들고 지운 경우를 비교한다.
```dockerfile
# 파일: Dockerfile.two
FROM alpine:3.20
RUN head -c 20000000 /dev/urandom > /big.bin
RUN rm /big.bin
```
```dockerfile
# 파일: Dockerfile.one
FROM alpine:3.20
RUN head -c 20000000 /dev/urandom > /big.bin && rm /big.bin
```
```bash
docker build -q -f Dockerfile.two -t whiteout:two . > /dev/null
docker build -q -f Dockerfile.one -t whiteout:one . > /dev/null
docker image ls whiteout
docker history whiteout:two --format '{{.Size}}\t{{.CreatedBy}}' | head -2
```
```text
IMAGE          ID             DISK USAGE   CONTENT SIZE   EXTRA
whiteout:one   …       12.1MB         3.63MB
whiteout:two   …       52.1MB         23.6MB
4.1kB	RUN /bin/sh -c rm /big.bin # buildkit
20MB	RUN /bin/sh -c head -c 20000000 /dev/urandom…
```
둘 다 컨테이너 안에서는 `/big.bin`이 안 보이지만, 나눈 쪽은 20MB 레이어를 싣고 다닌다. 마지막 레이어 tar를 열어 본다.
```bash
docker save whiteout:two -o two.tar && mkdir two && tar -xf two.tar -C two
tar -tzvf "two/$(jq -r '.[0].Layers[-1]' two/manifest.json)"
```
```text
---------- 0/0               0 1970-01-01 … .wh.big.bin
```
지우기 레이어에는 0바이트 `.wh.big.bin` 표시만 있다(OCI 이미지 명세의 화이트아웃 규칙). 아래 레이어의 20MB는 내용 주소로 고정된 별개 파일이라 고칠 수 없다. 그래서 임시 파일은 만든 그 `RUN` 안에서 지우거나, 빌드 단계를 분리한다(6편). 같은 이유로 레이어에 한 번 들어간 비밀 값은 지워도 이미지에 남는다(10편).

## 태그와 다이제스트
```bash
docker tag alpine:3.20 base:stable
docker image inspect base:stable --format '{{.Id}}'
docker run --rm alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc \
  cat /etc/alpine-release
```
```text
sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
3.20.10
```
`docker tag`는 아무것도 복사하지 않고 같은 다이제스트에 이름을 하나 더 붙인다. 이름표는 언제든 옮겨 붙일 수 있어 `alpine:3.20`이 다음 달에도 같은 내용이라는 보장이 없지만, `image@sha256:…`은 내용 자체라 바뀌지 않는다. Dockerfile에서는 `FROM alpine:3.20@sha256:d9e8…`처럼 둘을 함께 적으면 사람이 읽을 이름과 고정된 내용을 같이 얻는다(이때 태그는 무시된다). 실습을 정리한다.
```bash
docker rm -f ovl > /dev/null
docker image rm whiteout:one whiteout:two base:stable | grep -c Untagged
```
```text
3
```

## 흔한 실수와 문제 해결
- `latest`는 "최신"이 아니라 태그를 생략했을 때 붙는 기본 이름일 뿐이다. 운영 배포에 쓰면 무엇이 돌고 있는지 알 수 없다(태그 전략은 13편).
- 다이제스트로 고정할 때는 인덱스 다이제스트(`docker image ls --tree`의 맨 윗줄, `RepoDigests`)를 쓴다. 플랫폼별 매니페스트 다이제스트를 적으면 다른 CPU의 서버에서도 그 플랫폼 이미지가 받아져 `exec format error`가 나기 쉽다.
- `docker history`의 `<missing>` 줄은 오류가 아니다. 레지스트리에서 받은 이미지는 중간 단계가 로컬 이미지로 존재하지 않아 ID 자리에 `<missing>`이 찍힌다.
- 쓰기 계층은 큰 파일을 조금만 고쳐도 통째로 copy-up하고 컨테이너와 함께 사라진다. 데이터베이스 파일 같은 데이터는 볼륨에 둔다(7편).

## 어디에 쓰이나
- Git 버전 관리 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」: 블롭·트리·커밋과 레이어·설정·매니페스트는 같은 내용 주소 저장소이고, 브랜치와 태그가 움직이는 이름표라는 점도 같다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 그 글대로 해시 충돌은 피할 수 없지만, sha256은 충돌을 일부러 찾기조차 어렵게 설계된 암호학적 해시라서 다이제스트를 이름으로 믿고 쓴다.
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 바뀐 부분만 새로 만들고 나머지를 공유하는 레이어 구조는 퍼시스턴트 자료 구조의 구조 공유와 같은 발상이다.

## 정리
- 이미지는 레이어 tar, 설정, 매니페스트, 인덱스로 이루어지고 모든 조각의 이름이 내용의 sha256이다(직접 계산해 일치 확인).
- 같은 레이어는 한 번만 저장되므로 베이스를 공유하면 pull과 디스크가 준다.
- 컨테이너는 읽기 전용 레이어 위의 쓰기 계층에서 copy-on-write로 동작하고 삭제는 화이트아웃으로 표시된다. 다른 `RUN`에서 지운 파일이 크기를 줄이지 않는 이유다.
- 태그는 움직이는 이름표, 다이제스트는 고정된 내용이다.

## 더 알아보기
- 이전 글: 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」
- 다음 글: 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」
- Docker 문서(스토리지 드라이버): https://docs.docker.com/engine/storage/drivers/
