# [도커와 컨테이너 1/14] 컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이

> **한 줄 요약** — 컨테이너는 작은 가상 머신이 아니라 리눅스 커널의 네임스페이스와 cgroups로 보이는 범위와 쓸 수 있는 자원을 제한한 평범한 프로세스이고, 그 프로세스가 보는 파일 시스템을 이미지가 채워 준다.

## 이 글에서 다루는 것
- "내 컴퓨터에서는 되는데" 문제와 컨테이너가 푸는 것
- 컨테이너 = 네임스페이스 + cgroups + 이미지
- 가상 머신과의 차이: 커널을 공유한다는 것의 의미
- 도커의 구성(CLI → dockerd → containerd → runc)과 OCI 표준
- 첫 실행, 그리고 호스트에서 컨테이너 프로세스를 직접 찾아보기

## 문제: 환경이 다르면 같은 코드도 다르게 돈다
노트북의 파이썬 3.12에서 잘 돌던 서비스가 서버의 3.10과 다른 라이브러리 버전 때문에 죽는다. 설치 문서로 운영체제 패키지와 설정 파일까지 똑같이 맞추기는 어렵고, 가상 머신에 통째로 담으면 운영체제 전체를 부팅해야 한다. 컨테이너는 그 중간이다. 앱과 앱이 쓰는 사용자 공간(라이브러리, 셸, 설정 파일)만 묶어 **이미지**(image)로 만들고, 실행할 때는 호스트의 커널을 그대로 쓴다.

## 원리: 컨테이너는 격리된 프로세스다
운영체제가 프로세스에게 "기계를 혼자 쓴다"는 착각을 준다는 이야기는 트랜지스터에서 자연어까지 10편에서 했다. 컨테이너는 "이 컴퓨터에 나 혼자 있다"는 착각을 하나 더 얹고, 그 재료는 커널 기능 두 가지다.
- **네임스페이스**(namespace): 프로세스가 보는 범위를 나눈다. pid(프로세스 번호), mnt(마운트와 파일 시스템), net(네트워크 장치와 포트), uts(호스트 이름), ipc(공유 메모리), user(사용자 번호), cgroup이 있다. 새 pid 네임스페이스의 첫 프로세스는 자기가 PID 1이라고 본다.
- **cgroups**(control groups): 프로세스 묶음이 쓸 수 있는 CPU, 메모리, 프로세스 수를 제한하고 사용량을 센다. 2006년 구글 엔지니어들이 시작해 2008년 1월 리눅스 2.6.24에 들어갔다.

여기에 이미지가 루트 파일 시스템을 준다. 컨테이너 안의 `/`는 이미지의 레이어를 겹친 것이다(2편). 정리하면 컨테이너는 이미지로 만든 루트 파일 시스템, 네임스페이스로 가린 시야, cgroups로 묶은 자원, 그 안의 프로세스다. 이미지와 컨테이너는 실행 파일과 프로세스의 관계와 같아서, 이미지 하나로 컨테이너를 여럿 띄우고 각 컨테이너는 자기만의 쓰기 계층을 가진다.

## 가상 머신과의 차이
```text
 Virtual machine       Container
+---------------+   +---------------+
| app + libs    |   | app + libs    |
| guest kernel  |   +---------------+
+---------------+   | namespaces    |
| hypervisor    |   | + cgroups     |
+---------------+   +---------------+
| host kernel   |   | host kernel   |
+---------------+   +---------------+
```
가상 머신은 하이퍼바이저가 가짜 하드웨어를 만들고 그 위에서 게스트 커널이 따로 부팅한다. 컨테이너에는 게스트 커널이 없다. 그래서 시작이 프로세스 하나 띄우는 속도이고, 메모리도 앱이 쓰는 만큼만 든다. 대가도 같은 곳에서 나온다. 모든 컨테이너가 커널 하나를 공유하므로 격리 경계가 하이퍼바이저보다 얇고, 리눅스 커널 위에서는 리눅스용 프로그램만 돈다. 맥과 윈도우의 Docker Desktop이 내부에 작은 리눅스 가상 머신을 띄우고(윈도우에서는 WSL 2를 쓸 수 있다) 그 안에서 컨테이너를 돌리는 이유다.

## 도커의 구성과 OCI
```text
docker CLI
  │ REST API (/var/run/docker.sock)
  ↓
dockerd: 이미지·네트워크·볼륨 관리
  │ gRPC
  ↓
containerd: 이미지 저장, 실행 감독
  ↓
containerd-shim-runc-v2 (컨테이너마다)
  ↓ runc가 네임스페이스·cgroup 설정
컨테이너 프로세스 (PID 1)
```
`docker` 명령은 클라이언트일 뿐이고, 실제 일은 데몬 dockerd가 한다. dockerd는 컨테이너 실행을 containerd에 맡기고, containerd는 컨테이너마다 shim 프로세스를 띄워 저수준 런타임 runc를 부른다. runc는 네임스페이스와 cgroup을 설정하고 프로세스를 실행한 뒤 빠지고, shim이 부모로 남아 종료 코드와 입출력을 챙긴다.

연혁은 이렇다. 도커는 dotCloud의 사내 프로젝트로 시작해 2013년 3월 PyCon의 5분 발표로 처음 공개되었고 같은 달 오픈 소스가 되었다. 2015년 6월 도커와 CoreOS 등이 리눅스 재단 아래 **OCI**(Open Container Initiative)를 만들었고, 도커가 기증한 libcontainer가 runc가 되었다. 런타임·이미지 명세는 2017년 7월 1.0이 되었고, containerd는 2017년 3월 CNCF에 합류했다. 표준 덕분에 도커로 만든 이미지를 Podman이나 Kubernetes(보통 containerd를 직접 쓴다)에서도 그대로 돌린다. 지금 쓰는 구성 요소 버전은 이렇게 본다.
```bash
docker version --format '{{range .Server.Components}}{{.Name}} {{.Version}}{{"\n"}}{{end}}'
```
```text
Engine 29.6.2
containerd v2.2.6
runc 1.3.6
docker-init 0.19.0
```
이 글의 출력은 Docker 29.6 기준이고, 커널 버전처럼 환경마다 다른 값은 여러분의 환경에서 다르게 나온다.

## 따라 하기: 첫 컨테이너
```bash
docker run --rm alpine:3.20 cat /etc/os-release
```
```text
NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.20.10
PRETTY_NAME="Alpine Linux v3.20"
HOME_URL="https://alpinelinux.org/"
BUG_REPORT_URL="https://gitlab.alpinelinux.org/alpine/aports/-/issues"
```
`docker run`은 로컬에서 `alpine:3.20` 이미지를 찾고(없으면 레지스트리에서 내려받는다), 이미지 위에 쓰기 계층을 붙여 컨테이너를 만들고, 네임스페이스 안에서 `cat`을 실행한다. `cat`이 끝나면 컨테이너도 멈추고, `--rm` 때문에 바로 지워진다. 컨테이너의 수명은 그 안의 첫 프로세스의 수명이다. 이 호스트는 우분투인데 컨테이너 안은 알파인이다. 그런데 커널은 하나다.
```bash
grep PRETTY_NAME /etc/os-release
uname -r
docker run --rm alpine:3.20 uname -r
```
```text
PRETTY_NAME="Ubuntu 24.04.4 LTS"
6.18.44-fc-v139
6.18.44-fc-v139
```
배포판은 달라도 커널은 같다. 가상 머신이었다면 게스트 커널 버전이 나왔을 것이다. 프로세스 목록도 보자.
```bash
docker run --rm alpine:3.20 ps
```
```text
PID   USER     TIME  COMMAND
    1 root      0:00 ps
```
호스트에는 프로세스가 수백 개 있는데 컨테이너 안에서는 자기 자신만 보이고, 그 번호가 1이다. pid 네임스페이스의 효과다.

## 검증: 호스트에서 보면 그냥 프로세스다
오래 사는 컨테이너를 하나 띄우고 호스트 쪽에서 찾아본다.
```bash
docker run -d --name demo-sleep alpine:3.20 sleep 600 > /dev/null
docker exec demo-sleep ps
```
```text
PID   USER     TIME  COMMAND
    1 root      0:00 sleep 600
    … root      0:00 ps
```
`docker exec`는 실행 중인 컨테이너의 네임스페이스 안에 프로세스를 하나 더 띄운다. 이제 호스트에서 찾는다.
```bash
P=$(docker inspect --format '{{.State.Pid}}' demo-sleep)
ps -o user=,args= -p "$P"
ps -o comm= -p $(ps -o ppid= -p "$P")
```
```text
root     sleep 600
containerd-shim
```
컨테이너 안에서 PID 1이던 `sleep 600`이 호스트에서는 다른 번호를 가진 평범한 프로세스이고, 부모는 위 그림의 containerd-shim이다. 프로세스가 속한 네임스페이스를 `/proc/<PID>/ns`에서 호스트의 것과 비교하면 무엇이 격리되었는지 보인다(남의 프로세스 정보라 sudo가 필요하다).
```bash
for ns in pid mnt uts net ipc user; do
  a=$(sudo readlink /proc/self/ns/$ns); b=$(sudo readlink /proc/$P/ns/$ns)
  [ "$a" = "$b" ] && echo "$ns: 같음" || echo "$ns: 다름"
done
```
```text
pid: 다름
mnt: 다름
uts: 다름
net: 다름
ipc: 다름
user: 같음
```
다섯 가지는 컨테이너 전용이지만 user 네임스페이스는 호스트와 같다. 컨테이너 안의 root(UID 0)가 커널이 보기에는 호스트의 root와 같은 번호라는 뜻이고, 그래서 컨테이너를 root로 돌리는 것이 위험하다(11편). cgroups도 확인한다. 메모리를 64MiB로 제한하면 커널의 cgroup 파일에 그 값이 적힌다.
```bash
docker run --rm --memory 64m alpine:3.20 sh -c \
  'cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes'
```
```text
67108864
```
64 × 1024 × 1024 = 67108864다. cgroup v2 시스템은 `memory.max`, 이 실습 환경 같은 v1 시스템은 `memory.limit_in_bytes`에 적힌다. 제한을 넘으면 어떻게 되는지는 12편에서 본다. 마지막으로 이미지와 컨테이너의 관계를 확인한다.
```bash
docker run --name demo-note alpine:3.20 sh -c 'echo hello > /note.txt'
docker diff demo-note
docker run --rm alpine:3.20 cat /note.txt
```
```text
A /note.txt
cat: can't open '/note.txt': No such file or directory
```
멈춘 첫 컨테이너의 쓰기 계층에는 `/note.txt`가 추가(A)되어 남아 있지만, 같은 이미지로 만든 새 컨테이너에는 없다. 이미지는 읽기 전용이고 변경은 컨테이너마다 쌓인다.

## 흔한 실수와 문제 해결
도커를 처음 설치하고 가장 먼저 만나는 오류는 소켓 권한이다. 데몬 소켓은 root와 `docker` 그룹만 쓸 수 있다.
```bash
ls -l /var/run/docker.sock | cut -d' ' -f1,3,4
sudo -u nobody docker ps
```
```text
srw-rw---- root docker
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```
사용자를 `docker` 그룹에 넣으면(`sudo usermod -aG docker $USER` 후 다시 로그인) 해결되지만, 이 그룹은 사실상 root 권한이다. 데몬이 꺼져 있으면 `failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running`가 나온다(예전 버전은 `Cannot connect to the Docker daemon`, `Got permission denied` 같은 문구였다). 실행할 명령을 잘못 적었을 때의 오류에는 위의 구성 요소가 차례로 드러난다.
```bash
docker run --rm alpine:3.20 no-such-command
```
```text
docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "no-such-command": executable file not found in $PATH

Run 'docker run --help' for more information
```
dockerd → containerd(task, shim) → runc 순서로 오류가 감싸져 올라왔다. 긴 메시지는 맨 끝부터 읽으면 된다. 실습한 컨테이너는 정리한다(`stop` 대신 `rm -f`를 쓴 이유는 3편).
```bash
docker rm -f demo-sleep demo-note
```
```text
demo-sleep
demo-note
```

## 권장 습관과 한계
- 한 번 쓰고 버릴 컨테이너는 `--rm`, 오래 둘 컨테이너는 `--name`으로 이름을 붙인다.
- 컨테이너 안에 들어가 고치지 말고 이미지를 고쳐 다시 만든다(4편). 데이터는 컨테이너 밖에 둔다(7편).
- 커널 취약점은 모든 컨테이너에 영향을 준다. 더 강한 격리가 필요하면 가상 머신을 쓴다. 맥·윈도우에서는 컨테이너가 Docker Desktop의 가상 머신 안에 있어 호스트의 `ps`에 보이지 않는다.
- cgroup v1 지원은 사라지는 중이다. 이 실습 환경의 `docker info`도 v1이 늦어도 2029년 5월까지 제거될 예정이라고 경고한다.

## 숫자로 보기
| 항목 | 값 |
|---|---|
| alpine:3.20 내려받는 크기 | 3.71MB |
| ubuntu:24.04 내려받는 크기 | 31.7MB |
| 컨테이너 하나 실행·종료(`true`) | 약 0.38초(이 환경 측정) |
| 도커 공개 / OCI 출범 | 2013년 3월 / 2015년 6월 |

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 프로세스와 시스템 호출 위에 네임스페이스라는 "시야 제한"을 하나 더 얹은 것이 컨테이너다.
- WSL 개발 환경 9편 「WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱」: 윈도우에서 Docker Desktop의 WSL 2 백엔드와 WSL 안 Docker Engine 중 무엇을 쓸지 다룬다.
- PostgreSQL 실무 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」: 데이터베이스 서버를 설치 없이 `docker run`으로 띄운다.

## 정리
- 컨테이너는 네임스페이스로 시야를, cgroups로 자원을 제한한 호스트의 프로세스이고, 루트 파일 시스템은 이미지가 준다.
- 가상 머신과 달리 커널을 공유한다. 컨테이너 안의 `uname -r`이 호스트와 같은 이유다.
- 도커는 CLI → dockerd → containerd → shim·runc로 나뉘고, 이미지와 런타임 형식은 OCI 표준이다.
- 컨테이너는 첫 프로세스와 수명을 같이하고, 변경은 컨테이너마다의 쓰기 계층에 쌓인다.

## 더 알아보기
- 다음 글: 2편 「이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트」
- Docker 공식 문서: https://docs.docker.com/get-started/

## 시리즈 안내
1. **컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이** ← 지금 읽는 글
2. 이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트
3. 컨테이너 생명 주기: run, exec, logs, stop과 시그널
4. Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT
5. 빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기
6. 멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기
7. 볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다
8. 컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS
9. Docker Compose: 여러 컨테이너를 한 파일로 정의하기
10. 설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법
11. 컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검
12. 리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그
13. 이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드
14. 컨테이너로 일하는 습관: 개발 환경, 디버깅, 정리, 그다음 단계

먼저 읽으면 좋은 글: 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」(프로세스와 시스템 호출), 메모리 시스템 7편 「가상 메모리 하드웨어: 페이지 테이블 워크와 TLB」(프로세스마다 나뉜 주소 공간), 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」(공유 라이브러리가 만드는 환경 차이), WSL 개발 환경 1편 「WSL이란: 윈도우 안의 리눅스, WSL 1과 WSL 2의 구조」(윈도우에서 리눅스 쓰기).
