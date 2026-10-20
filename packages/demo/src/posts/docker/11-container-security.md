# [도커와 컨테이너 11/14] 컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검

> **한 줄 요약** — 사용자 네임스페이스가 없으면 컨테이너의 root는 호스트의 UID 0 그대로이므로, 비루트 사용자·권한 제거·읽기 전용 루트·no-new-privileges로 "탈출해도 가진 것이 없게" 만들고, 이미지는 스캐너와 정기 재빌드로 관리한다.

## 이 글에서 다루는 것
- 컨테이너 안 root가 호스트에서 누구인지 확인하기
- Dockerfile `USER`와 비루트 실행
- 리눅스 권한(capability): 기본 14개, `--cap-drop ALL`과 필요한 것만 추가
- `--read-only`, `no-new-privileges`, 도커 소켓, rootless 모드와 사용자 네임스페이스
- 이미지 취약점 점검(Docker Scout, Trivy)과 베이스 이미지 갱신

## 문제: "컨테이너니까 안전하겠지"
1편에서 컨테이너는 네임스페이스와 cgroups로 격리한 프로세스라고 했다. 격리는 보이는 것을 나눌 뿐 커널은 하나라서, 커널이나 런타임에 구멍이 나면 컨테이너 안의 root가 호스트의 root가 될 수 있다. 2019년 runc 취약점(CVE-2019-5736)은 컨테이너 안에서 root로 도는 악성 프로세스가 호스트의 runc 실행 파일을 덮어쓰게 했다. 그래서 방어는 "못 나가게"와 함께 "나가도 가진 게 없게"를 겹겹이 쌓는 **심층 방어**(defense in depth)다. 이 글의 실행 결과는 Docker Engine 29.6 기준이다.

## 원리: 커널은 이름이 아니라 숫자를 본다
리눅스는 권한을 숫자 UID로 판단한다. 사용자 네임스페이스(user namespace)를 쓰지 않는 기본 설정에서 컨테이너의 UID 0은 호스트의 UID 0과 같은 숫자다. 대신 Docker는 리눅스 권한 40여 개 중 14개만 남기고, seccomp 프로필로 위험한 시스템 호출 수십 개를 막고, 배포판에 따라 AppArmor·SELinux 정책을 씌워 root의 힘을 깎는다. 호스트에서 컨테이너 프로세스의 주인을 보자.
```bash
docker run -d --name as-root alpine:3.20 sleep 300 >/dev/null
docker run -d --name as-1000 --user 1000:1000 alpine:3.20 sleep 300 >/dev/null
for c in as-root as-1000; do
  ps -o user=,args= -p "$(docker inspect -f '{{.State.Pid}}' $c)"
done
docker rm -f as-root as-1000 >/dev/null
```
```text
root     sleep 300
ubuntu   sleep 300
```
컨테이너 안의 root는 호스트에서도 `root`다. UID 1000 프로세스가 `ubuntu`로 보이는 것은 이 호스트의 `/etc/passwd`에서 1000번이 `ubuntu`이기 때문이다. 커널이 보는 것은 숫자뿐이다. 여러분의 PC에서 1000번은 보통 여러분 계정이므로, UID 1000 컨테이너는 바인드 마운트한 여러분의 파일을 고칠 수 있다(7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」).

## 비루트로 실행하기: USER
이미지 안에 전용 사용자를 만들고 마지막에 `USER`로 바꾼다. 쿠버네티스의 `runAsNonRoot` 검사는 숫자 UID만 확인할 수 있으므로 `USER`는 숫자로 쓰는 편이 좋다.
```dockerfile
# 파일: app/Dockerfile
FROM alpine:3.20
RUN addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app app
USER 10001:10001
CMD ["id"]
```
```bash
docker build -q -t secapp app >/dev/null
docker run --rm secapp
docker run --rm secapp sh -c \
  'touch /etc/x; awk "/CapEff/{print \$2}" /proc/self/status'
```
```text
uid=10001(app) gid=10001(app) groups=10001(app)
touch: /etc/x: Permission denied
0000000000000000
```
`USER` 앞의 `RUN`은 root로 실행되므로 설치·폴더 준비는 그 전에 끝낸다. 앱 코드는 root 소유로 두어 앱이 고치지 못하게 하고, 쓰는 폴더만 `chown 10001:10001`로 넘긴다. 마지막 줄의 `CapEff`(실효 권한)가 0이다. 비루트 프로세스는 Docker가 남긴 권한도 못 쓴다.

## 권한(capability): root를 쪼갠 조각
리눅스는 root의 힘을 `CAP_CHOWN`(파일 주인 바꾸기), `CAP_NET_BIND_SERVICE`(1024 미만 포트), `CAP_SYS_ADMIN`(마운트 등 거의 전부) 같은 조각으로 나눴다. root 컨테이너의 실효 권한 비트를 읽어 `capsh`(libcap2-bin 패키지)로 풀어 보자.
```bash
docker run --rm alpine:3.20 awk '/CapEff/{print $2}' /proc/self/status
capsh --decode=00000000a80425fb
```
```text
00000000a80425fb
0x00000000a80425fb=cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap
```
기본 14개다. 대부분의 웹 앱은 하나도 필요 없으니 모두 버리고(`--cap-drop ALL`) 필요한 것만 더한다(`--cap-add`).
```bash
docker run --rm --cap-drop ALL alpine:3.20 chown nobody /tmp
```
```text
chown: /tmp: Operation not permitted
```
root인데도 실패했다. `--cap-add CHOWN`을 더하면 이 명령만 다시 된다. 흔한 오해 하나. "비루트로 바꾸면 80번 포트를 못 연다"는 컨테이너에서는 대개 틀린다. Docker는 20.10부터 컨테이너의 네트워크 네임스페이스에 `net.ipv4.ip_unprivileged_port_start=0`을 설정해 모든 포트를 비특권 포트로 만든다.
```bash
docker run --rm --user 65534 busybox:1.37 sh -c \
  'sysctl net.ipv4.ip_unprivileged_port_start; httpd -p 80 && echo bound'
```
```text
net.ipv4.ip_unprivileged_port_start = 0
bound
```
커널 기본값 1024로 되돌리면 그제야 `CAP_NET_BIND_SERVICE`가 차이를 만든다.
```bash
for add in "" "--cap-add NET_BIND_SERVICE"; do
  docker run --rm --cap-drop ALL $add \
    --sysctl net.ipv4.ip_unprivileged_port_start=1024 \
    busybox:1.37 sh -c 'httpd -p 80 && echo bound'
done
```
```text
httpd: bind: Permission denied
bound
```

## 읽기 전용 루트와 no-new-privileges
`--read-only`는 루트 파일 시스템을 읽기 전용으로 마운트해, 셸을 얻은 공격자도 실행 파일을 심거나 설정을 바꾸기 어렵게 한다. 앱이 쓰는 곳만 tmpfs나 볼륨으로 연다. Docker의 `--tmpfs`는 기본으로 `noexec,nosuid,nodev`로 마운트된다.
```bash
docker run --rm --read-only --tmpfs /tmp alpine:3.20 \
  sh -c 'touch /etc/x; touch /tmp/x && echo tmp-ok'
```
```text
touch: /etc/x: Read-only file system
tmp-ok
```
비루트로 바꿔도 이미지에 setuid 프로그램이 있으면 root로 올라가는 계단이 된다. setuid 파일을 실행하면 실효 UID(euid)가 파일 주인으로 바뀌기 때문이다. `id`에 setuid를 붙인 이미지로 확인하자.
```dockerfile
# 파일: nnp/Dockerfile
FROM ubuntu:24.04
RUN cp /usr/bin/id /usr/local/bin/suid-id \
 && chmod u+s /usr/local/bin/suid-id
USER nobody
```
```bash
docker build -q -t nnp nnp >/dev/null
docker run --rm nnp suid-id
docker run --rm --security-opt no-new-privileges nnp suid-id
```
```text
uid=65534(nobody) gid=65534(nogroup) euid=0(root) groups=65534(nogroup)
uid=65534(nobody) gid=65534(nogroup) groups=65534(nogroup)
```
`no-new-privileges`는 커널의 no_new_privs 플래그를 켜서 exec로 권한이 늘어나는 길(setuid, 파일 capability)을 막는다. 같은 비트가 처음에는 `euid=0`을 줬고 두 번째에는 무시되었다.

## 도커 소켓은 root 열쇠다
```bash
ls -l /var/run/docker.sock | cut -d' ' -f1,3,4
```
```text
srw-rw---- root docker
```
Docker API를 부를 수 있으면 호스트의 `/`를 마운트한 `--privileged` 컨테이너를 띄울 수 있다. 그래서 사용자를 `docker` 그룹에 넣거나 `-v /var/run/docker.sock:/var/run/docker.sock`로 CI 러너·관리 도구에 소켓을 넘기는 것은 호스트 root를 건네는 일이다. 공식 문서도 데몬은 신뢰하는 사용자만 제어하게 하라고 경고한다. `--privileged`(모든 권한 + 모든 장치 + seccomp 해제)도 기본값처럼 쓰지 않는다.

## rootless 모드와 사용자 네임스페이스
근본적인 해법은 컨테이너의 UID 0을 호스트의 권한 없는 UID로 대응시키는 사용자 네임스페이스다. 원리는 `unshare`로 바로 볼 수 있다. 호스트 UID 1000이 새 네임스페이스에서 root가 되어 본다.
```bash
setpriv --reuid=1000 --regid=1000 --clear-groups \
  unshare --user --map-root-user \
  sh -c 'id -u; cat /proc/self/uid_map; head -c1 /etc/shadow'
```
```text
0
         0       1000          1
head: cannot open '/etc/shadow' for reading: Permission denied
```
안에서는 UID 0이지만 `uid_map`은 "안의 0 = 밖의 1000, 1개"라서 호스트 파일 앞에서는 여전히 1000이다. Docker에서 쓰는 방법은 두 가지다. **userns-remap**은 데몬은 root로 두고 컨테이너만 대응시킨다(`daemon.json`에 `"userns-remap": "default"`, `dockremap` 사용자와 `/etc/subuid` 범위 사용). 켜면 기존 이미지·컨테이너가 가려지므로 새로 설치할 때 켜고, `--pid=host`·`--network=host`와는 함께 쓸 수 없다. **rootless 모드**는 데몬까지 일반 사용자로 돌린다.
```sh
# 일반 사용자로 실행(전제: newuidmap·newgidmap(uidmap 패키지),
# /etc/subuid·/etc/subgid에 그 사용자 범위 65,536개 이상)
dockerd-rootless-setuptool.sh install
docker context use rootless
```
데몬이 뚫려도 일반 사용자 권한뿐이지만, 1024 미만 포트 공개에 rootlesskit의 `cap_net_bind_service`가 필요한 등 제약이 있으니 공식 문서의 제한 사항을 먼저 읽는다.

## 이미지 점검: 알려진 취약점 찾기
스캐너는 패키지 관리자의 데이터베이스 파일에서 패키지 목록을 읽어 CVE 데이터베이스와 대조한다. 베이스 이미지마다 점검 대상 수를 세어 보자.
```bash
docker run --rm alpine:3.20 grep -c '^P:' /lib/apk/db/installed
docker run --rm python:3.12-slim grep -c '^Package:' /var/lib/dpkg/status
docker run --rm ubuntu:24.04 grep -c '^Package:' /var/lib/dpkg/status
```
```text
14
87
92
```
패키지가 적을수록 경보도 공격 표면도 적다(6편의 베이스 이미지 비교). 스캔은 취약점 DB를 내려받아야 해서 이 실행 환경(인터넷 없음)에서는 돌리지 않았고, 명령은 공식 문서로 확인한 형태다.
```sh
docker scout quickview myapp:1.0
docker scout cves --only-severity critical,high --exit-code myapp:1.0
trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 myapp:1.0
```
CI 관문으로 쓸 때는 종료 코드가 핵심이다. Docker Scout는 `--exit-code`를 주면 취약점이 있을 때 2로 끝나고, Trivy는 `--exit-code` 기본값이 0이라 지정하지 않으면 취약점이 나와도 통과한다. `--ignore-unfixed`는 고친 버전이 아직 없는 항목을 뺀다.

## 흔한 실수와 문제 해결
- 비루트로 바꾼 뒤 `Permission denied`: 쓰는 폴더의 주인이 root다. `RUN mkdir -p /data && chown 10001:10001 /data`나 `COPY --chown`으로 준비한다.
- `--cap-drop ALL` 뒤 앱이 안 뜬다: `Operation not permitted`가 난 동작에 맞는 권한 하나만 `--cap-add`한다. `--privileged`로 덮지 않는다.
- 태그가 같으니 최신이라고 믿는다: `python:3.12-slim`은 패치 때마다 다이제스트가 바뀐다(2편). `docker build --pull`로 정기 재빌드하고, 다이제스트를 고정했다면 Dependabot 같은 도구로 갱신 PR을 받는다.

## 권장 설정
```sh
docker run -d --user 10001:10001 --cap-drop ALL \
  --read-only --tmpfs /tmp \
  --security-opt no-new-privileges \
  -p 127.0.0.1:8080:8080 myapp:1.0
```
Compose에서는 `user`, `cap_drop: [ALL]`, `read_only: true`, `tmpfs`, `security_opt: [no-new-privileges:true]`로 쓴다. 이 설정들은 탈출 뒤의 피해를 줄일 뿐 커널 취약점 자체를 막지 못하므로, 커널·엔진 업데이트와 신뢰하지 않는 코드의 VM 격리가 함께 가야 한다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 사용자·커널 모드와 시스템 호출이라는 경계 위에서, capability와 seccomp는 "누가 어떤 커널 기능을 부를 수 있나"를 더 잘게 나눈다.
- 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 권한을 아무리 줄여도 이미지 레이어에 비밀이 남아 있으면 이미지를 받은 누구나 읽는다.
- GitHub 협업과 자동화 10편 「의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝」: 베이스 이미지 갱신 PR과 스캔 결과를 저장소의 보안 흐름에 묶는다.

## 정리
- 사용자 네임스페이스가 없으면 컨테이너의 root는 호스트의 UID 0이다. `USER`로 비루트 실행이 첫걸음이고, 비루트 프로세스의 실효 권한은 0이다.
- 기본 권한 14개는 `--cap-drop ALL` 후 필요한 것만 더하고, `--read-only`와 `no-new-privileges`로 쓰기와 권한 상승의 길을 막는다.
- 도커 소켓과 `docker` 그룹은 호스트 root와 같다. rootless 모드와 userns-remap은 UID 0을 호스트의 일반 UID로 바꾼다.
- 스캐너는 종료 코드로 CI를 막게 설정하고, 베이스 이미지는 정기적으로 다시 받아 빌드한다.

## 더 알아보기
- 이전 글: 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」
- 다음 글: 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」
- Docker 공식 문서(rootless 모드): https://docs.docker.com/engine/security/rootless/
