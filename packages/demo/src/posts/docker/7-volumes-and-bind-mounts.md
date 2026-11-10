# [도커와 컨테이너 7/14] 볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다

> **한 줄 요약** — 컨테이너의 쓰기 계층은 컨테이너와 함께 사라지므로 남겨야 할 데이터는 Docker가 관리하는 볼륨이나 호스트 폴더를 연결하는 바인드 마운트로 컨테이너 밖에 두고, 초기화·권한(UID)·정리 규칙을 알고 써야 한다.

## 이 글에서 다루는 것
- 쓰기 계층의 수명을 `docker diff`로 확인하기
- 볼륨·바인드 마운트·tmpfs의 차이, `-v`와 `--mount`
- 새 볼륨은 이미지 내용으로 채워지고, 바인드 마운트는 가린다
- 바인드 마운트의 UID 문제, 볼륨 백업·복원
- postgres 18 이미지의 데이터 경로와 볼륨 정리 시 주의

## 컨테이너를 지우면 데이터도 지워진다
2편에서 본 것처럼 컨테이너는 읽기 전용 이미지 레이어 위에 얇은 쓰기 계층을 얹는다. 컨테이너 안에서 만든 파일은 그 쓰기 계층에 있고, `docker rm`은 쓰기 계층을 지운다.
```bash
docker run --name note1 alpine:3.20 sh -c 'echo hello > /note.txt'
docker diff note1
docker rm note1 >/dev/null
docker run --rm alpine:3.20 cat /note.txt
```
```text
A /note.txt
cat: can't open '/note.txt': No such file or directory
```
`docker diff`의 `A`는 이미지에 없던 파일이 쓰기 계층에 추가되었다는 뜻이다. 새 컨테이너는 이미지에서 새 쓰기 계층으로 시작하므로 파일이 없다. 이미지를 새 버전으로 바꿀 때마다 컨테이너를 새로 만드는 것이 컨테이너 운영의 기본이니, DB 파일·업로드 파일처럼 남아야 할 데이터는 처음부터 밖에 둬야 한다. 쓰기 계층은 copy-on-write라 쓰기가 많은 작업에는 느리기도 하다.

## 원리: 마운트 세 가지
컨테이너는 자기 마운트 네임스페이스(1편)를 가지므로, Docker는 컨테이너를 시작할 때 그 안의 경로 하나에 다른 디렉터리를 겹쳐 붙일 수 있다. 붙인 경로는 overlay 쓰기 계층을 거치지 않고 원본 파일 시스템에 직접 읽고 쓴다.
```text
container:/data
  ├─ volume: docker-managed dir
  │  /var/lib/docker/volumes/N/_data
  ├─ bind:   any host path
  └─ tmpfs:  memory only
```
- **볼륨**(volume): Docker가 만들고 이름으로 관리하는 디렉터리. 컨테이너와 수명이 따로이고, 드라이버로 NFS 같은 원격 저장소도 쓸 수 있다. DB 데이터처럼 컨테이너가 주인인 데이터에 쓴다.
- **바인드 마운트**(bind mount): 호스트의 아무 경로를 그대로 붙인다. 소스 코드, 설정 파일처럼 호스트에서 사람이 편집하는 파일에 쓴다.
- **tmpfs**: 메모리에만 있고 컨테이너가 멈추면 사라진다. 임시 파일, 디스크에 남기면 안 되는 값에 쓴다.

같은 마운트를 두 문법으로 쓸 수 있다. `--mount`는 길지만 키가 명시적이다.
```sh
-v notes:/data                                   # 볼륨
--mount type=volume,src=notes,dst=/data
-v "$PWD/conf":/conf:ro                          # 바인드, 읽기 전용
--mount type=bind,src="$PWD/conf",dst=/conf,readonly
--tmpfs /cache:size=16m
--mount type=tmpfs,dst=/cache,tmpfs-size=16m
```

## 따라 하기: 볼륨
```bash
docker volume create notes
docker run --rm -v notes:/data alpine:3.20 sh -c 'echo first > /data/a.txt'
docker run --rm -v notes:/data alpine:3.20 cat /data/a.txt
docker volume inspect notes --format '{{.Driver}} {{.Mountpoint}}'
```
```text
notes
first
local /var/lib/docker/volumes/notes/_data
```
두 컨테이너는 서로 다른 쓰기 계층을 가졌지만 같은 볼륨을 봤다. 볼륨의 실체는 호스트의 평범한 디렉터리다(Docker Desktop에서는 리눅스 VM 안에 있다).

볼륨과 바인드 마운트는 처음 붙일 때 동작이 다르다. **비어 있는 새 볼륨**을 이미지에 파일이 있는 경로에 붙이면 Docker가 그 내용(소유자 포함)을 볼륨에 복사한다. 바인드 마운트는 원래 내용을 그냥 가린다.
```bash
docker run --rm -v html:/usr/share/nginx/html nginx:1.29-alpine \
  ls /usr/share/nginx/html
mkdir empty
docker run --rm -v "$PWD/empty":/usr/share/nginx/html nginx:1.29-alpine \
  sh -c 'ls /usr/share/nginx/html | wc -l'
```
```text
50x.html
index.html
0
```
빈 폴더를 바인드 마운트해서 "nginx 기본 페이지가 사라졌다"거나 "설정 파일이 없다"는 오류가 나는 것이 이 때문이다. 반대로 볼륨은 한 번 채워진 뒤에는 이미지가 바뀌어도 다시 복사하지 않으므로, 이미지를 새 버전으로 바꿨는데 옛 파일이 보이는 일도 생긴다.

## -v와 --mount의 결정적 차이
`-v`는 호스트 경로가 없으면 빈 디렉터리를 만들어 붙이고, `--mount`는 오류를 낸다.
```bash
docker run --rm -v "$PWD/typo":/data alpine:3.20 true && ls -d typo
docker run --rm --mount type=bind,src="$PWD/missing",dst=/data alpine:3.20 true
```
```text
typo
docker: Error response from daemon: invalid mount config for type "bind": bind source path does not exist: …/missing
...
```
경로를 잘못 쓰면 `-v`는 빈 폴더를 만들어 앱이 "데이터가 없는" 상태로 조용히 뜬다. 스크립트와 운영 설정에서는 `--mount`가 안전하다. 읽기 전용 옵션도 확인하자(오류도 같은 출력으로 보려고 `exec 2>&1`을 붙였다).
```bash
mkdir conf && echo 'level=info' > conf/app.ini
docker run --rm --mount type=bind,src="$PWD/conf",dst=/conf,readonly \
  alpine:3.20 sh -c 'exec 2>&1; cat /conf/app.ini; echo x >> /conf/app.ini'
```
```text
level=info
sh: can't create /conf/app.ini: Read-only file system
```

## 바인드 마운트와 UID
커널은 파일 소유자를 이름이 아니라 숫자(UID)로 기록하고, 바인드 마운트는 그 숫자를 그대로 보여 준다. 컨테이너 안의 사용자와 호스트 폴더의 소유자가 다르면 권한 문제가 난다. 이 글을 실행한 환경의 사용자는 root(UID 0)라서 폴더 주인도 0이다.
```bash
mkdir shared
docker run --rm -v "$PWD/shared":/data --user 1000:1000 alpine:3.20 \
  touch /data/a.txt
```
```text
touch: /data/a.txt: Permission denied
```
비루트로 도는 컨테이너(postgres 이미지는 UID 70)가 root 소유 폴더에 쓰지 못한 것이다. 반대로 root로 도는 컨테이너가 만든 파일은 호스트에서도 root 소유라, UID 1000인 개발자는 지우지 못한다.
```bash
docker run --rm -v "$PWD/shared":/data alpine:3.20 touch /data/by-root.txt
chown 1000:1000 shared
docker run --rm -v "$PWD/shared":/data --user 1000:1000 alpine:3.20 \
  touch /data/by-1000.txt
stat -c '%u:%g %n' shared shared/*
```
```text
1000:1000 shared
1000:1000 shared/by-1000.txt
0:0 shared/by-root.txt
```
해결책은 셋이다. 개발 중에는 `--user "$(id -u):$(id -g)"`로 컨테이너를 호스트 사용자 UID로 돌리고, 이미지의 사용자가 정해져 있으면 호스트 폴더를 그 UID 소유로 바꾸고, 컨테이너가 주인인 데이터는 볼륨에 둔다. 새 볼륨은 이미지 디렉터리의 소유자를 복사하므로 권한이 저절로 맞는다.
```bash
docker run --rm -v pgowner:/var/lib/postgresql postgres:18-alpine \
  stat -c '%u:%g %n' /var/lib/postgresql
```
```text
70:70 /var/lib/postgresql
```
postgres 이미지의 데이터 폴더 주인인 UID 70이 새 볼륨에 그대로 옮겨졌다. 사용자 네임스페이스로 UID를 옮기는 방법은 11편에서 다룬다.

## 백업과 복원: 임시 컨테이너 + tar
볼륨은 Docker가 관리하는 경로라 호스트에서 직접 만지기보다 볼륨과 호스트 폴더를 함께 붙인 임시 컨테이너로 다룬다.
```bash
docker run --rm -v notes:/data:ro -v "$PWD":/backup alpine:3.20 \
  tar czf /backup/notes.tgz -C /data .
docker volume create notes2 >/dev/null
docker run --rm -v notes2:/data -v "$PWD":/backup alpine:3.20 \
  tar xzf /backup/notes.tgz -C /data
docker run --rm -v notes2:/data alpine:3.20 cat /data/a.txt
```
```text
first
```
이 방법은 파일을 쓰는 프로세스가 멈췄을 때만 일관된 백업이다. 실행 중인 DB 파일을 tar로 뜨면 깨진 백업이 될 수 있으니 DB는 `pg_dump` 같은 DB 도구를 쓴다(PostgreSQL 실무 14편).

## postgres 이미지의 데이터 볼륨
postgres 이미지는 Dockerfile에 `VOLUME`이 선언되어 있다. 18부터 그 위치가 바뀌었다.
```bash
docker image inspect -f '{{json .Config.Volumes}}' postgres:18-alpine
docker image inspect postgres:18-alpine \
  -f '{{range .Config.Env}}{{println .}}{{end}}' | grep PGDATA
```
```text
{"/var/lib/postgresql":{}}
PGDATA=/var/lib/postgresql/18/docker
```
데이터는 주 버전 이름이 붙은 하위 폴더에 생기므로 볼륨은 `/var/lib/postgresql`에 붙인다. 컨테이너를 지웠다 다시 만들어도 데이터가 남는지 확인한다.
```bash
docker run -d --name pg1 -e POSTGRES_PASSWORD=example-password \
  --mount type=volume,src=pgdata,dst=/var/lib/postgresql \
  postgres:18-alpine >/dev/null
until docker exec pg1 pg_isready -qh 127.0.0.1; do sleep 1; done
docker exec pg1 psql -U postgres -qc "CREATE TABLE memo(t text)" \
  -c "INSERT INTO memo VALUES ('살아남은 행')"
docker rm -f pg1 >/dev/null
docker run -d --name pg2 -e POSTGRES_PASSWORD=example-password \
  --mount type=volume,src=pgdata,dst=/var/lib/postgresql \
  postgres:18-alpine >/dev/null
until docker exec pg2 pg_isready -qh 127.0.0.1; do sleep 1; done
docker exec pg2 psql -U postgres -Atc "SELECT t FROM memo"
```
```text
살아남은 행
```
(`pg_isready`에 `-h 127.0.0.1`을 준 것은 초기화 중의 임시 서버가 유닉스 소켓만 열기 때문이다.) 17 이하용 글을 따라 `/var/lib/postgresql/data`에 붙이면 18 이미지는 시작을 거부한다.
```bash
docker run --rm -e POSTGRES_PASSWORD=example-password \
  -v oldstyle:/var/lib/postgresql/data postgres:18-alpine 2>&1 \
  | grep -E '^Error|unused mount'
```
```text
Error: in 18+, these Docker images are configured to store database data in a
         /var/lib/postgresql/data (unused mount/volume)
```

## 볼륨 정리 시 주의
`-v`나 `--mount` 없이 `VOLUME`이 선언된 이미지를 실행하면 64자리 16진수 이름의 **익명 볼륨**이 생긴다. `docker rm -v`는 컨테이너와 함께 익명 볼륨을 지우지만 이름 있는 볼륨은 지우지 않는다. 사용 중인 볼륨은 지울 수 없다.
```bash
docker volume rm pgdata
```
```text
Error response from daemon: remove pgdata: volume is in use - […]
```
`docker volume prune`은 어떤 컨테이너도 쓰지 않는 볼륨을 지우는데, Docker 23.0(API 1.42)부터 기본으로는 익명 볼륨만 지우고 `-a`(`--all`)를 붙이면 이름 있는 볼륨까지 지운다. 멈춰 둔 DB 컨테이너를 지운 뒤 `prune -a`를 실행하면 그 데이터가 사라진다.
```sh
docker volume prune        # 쓰지 않는 익명 볼륨만
docker volume prune -a     # 쓰지 않는 이름 있는 볼륨까지(되돌릴 수 없다)
```
실습 정리는 만든 것만 이름으로 지운다.
```bash
docker rm -f pg2 >/dev/null
docker volume rm notes notes2 html pgdata pgowner oldstyle >/dev/null \
  && echo removed
```
```text
removed
```

## 권장 설정과 체크리스트
- 남아야 할 데이터의 경로를 먼저 정하고(DB, 업로드), 그 경로만 볼륨으로 뺀다. 이미지에는 코드와 기본 설정만.
- 스크립트와 운영 설정에서는 `--mount`를 쓴다. 경로 오타가 오류로 드러난다.
- 설정 파일·인증서는 읽기 전용(`readonly`, `:ro`)으로 붙인다.
- 바인드 마운트는 UID를 맞춘다. Docker Desktop에서는 VM 경계를 넘는 바인드 마운트가 느릴 수 있어, WSL 2 백엔드라면 코드를 WSL의 리눅스 파일 시스템에 둔다.
- 볼륨 백업은 쓰는 프로세스를 멈추거나 앱 전용 도구로 하고, 복원 연습까지 한다.
- 한계: 로컬 드라이버 볼륨은 그 호스트에만 있다. 여러 호스트가 같은 데이터를 쓰려면 원격 저장소 드라이버나 DB 복제가 필요하다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 파일 추상화와 프로세스별 관점 위에서, 마운트 네임스페이스는 컨테이너마다 다른 파일 트리를 보여 주고 권한은 숫자 UID로 판정된다.
- WSL 개발 환경 3편 「파일 시스템: 리눅스 쪽 ext4와 /mnt/c, 어디에 코드를 둘까」: Docker Desktop의 바인드 마운트가 느린 이유와 같은 운영체제 경계 문제다.
- PostgreSQL 실무 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 볼륨 tar 백업 대신 DB가 보장하는 일관된 백업을 만드는 방법이다.

## 정리
- 컨테이너 쓰기 계층은 컨테이너와 함께 사라진다. 남길 데이터는 볼륨이나 바인드 마운트로 밖에 둔다.
- 새 볼륨은 이미지 내용과 소유자로 채워지고, 바인드 마운트는 원래 내용을 가린다.
- `-v`는 없는 경로를 만들고 `--mount`는 오류를 낸다. 권한은 숫자 UID로 판정된다.
- postgres 18 이미지는 `/var/lib/postgresql`에 볼륨을 붙이고, `prune -a`는 이름 있는 볼륨도 지운다.

## 더 알아보기
- 이전 글: 6편 「멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기」
- 다음 글: 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」
- Docker 공식 문서 Volumes: https://docs.docker.com/engine/storage/volumes/
