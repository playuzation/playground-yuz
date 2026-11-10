# [도커와 컨테이너 8/14] 컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS

> **한 줄 요약** — 컨테이너는 저마다 네트워크 네임스페이스를 갖고 가상 이더넷으로 브리지에 연결되며, 이름으로 서로를 찾으려면 내장 DNS가 있는 사용자 정의 네트워크가, 밖에서 들어오려면 `-p`로 호스트 포트를 공개하는 규칙이 필요하다.

## 이 글에서 다루는 것
- 네트워크 네임스페이스, veth, 브리지, NAT로 보는 컨테이너 네트워크
- 기본 브리지에서는 이름이 안 통하고 사용자 정의 네트워크에서는 통하는 이유
- 네트워크 사이의 격리와 `docker network connect`
- `-p 8080:80`과 `127.0.0.1:8080:80`, 포트 공개와 방화벽
- host·none 네트워크와 흔한 오류(포트 충돌, 컨테이너 안의 localhost)

## 웹 컨테이너가 DB를 못 찾는다
처음 컨테이너 두 개를 엮으면 대개 이런 일을 겪는다. 앱 설정에 `localhost:5432`를 적었더니 연결이 거부되고, 컨테이너 이름 `db`를 적었더니 `bad address`가 나고, 호스트에서 `curl localhost`를 하면 응답이 없다. 세 오류는 모두 같은 사실에서 나온다. 컨테이너마다 네트워크가 따로 있다.

## 원리: 네임스페이스, veth, 브리지
1편의 네임스페이스 중 **네트워크 네임스페이스**는 인터페이스, IP 주소, 라우팅 표, 포트 번호 공간을 프로세스 묶음마다 따로 준다. 그래서 컨테이너 안의 `localhost`는 그 컨테이너 자신이고, 컨테이너 열 개가 모두 80번 포트를 열어도 충돌하지 않는다. Docker는 컨테이너마다 가상 이더넷 쌍(veth pair)을 만들어 한쪽 끝을 컨테이너의 `eth0`으로, 다른 끝을 호스트의 **브리지**(가상 스위치)에 꽂는다. 밖으로 나가는 패킷은 호스트 IP로 주소 변환(NAT)되고, 밖에서 들어오는 연결은 `-p`로 공개한 포트만 컨테이너로 전달된다.
```text
 host
 ┌──────────────────────────────┐
 │ eth0 (host IP) ←NAT→ bridge  │
 │                     ┌──┴──┐  │
 │                   veth   veth│
 └─────────────────────┼─────┼──┘
                     eth0   eth0
                     web    db
```
```bash
docker run --rm alpine:3.20 ip -o -4 addr show | awk '{print $2, $4}'
```
```text
lo 127.0.0.1/8
eth0 172.17.0.…/16
```
아무 옵션 없이 실행한 컨테이너는 기본 브리지(`bridge`, 호스트 쪽 이름 `docker0`)에 붙어 `172.17.0.0/16` 대역의 주소를 받는다.

## 기본 브리지에는 이름이 없다
```bash
docker run -d --name web1 nginx:1.29-alpine >/dev/null
docker run --rm alpine:3.20 wget -qO- -T 2 http://web1
ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' web1)
docker run --rm alpine:3.20 wget -qO- -T 2 "http://$ip" | grep -o '<title>.*</title>'
```
```text
wget: bad address 'web1'
<title>Welcome to nginx!</title>
```
IP로는 닿지만 이름으로는 못 찾는다. 기본 브리지는 하위 호환을 위해 남은 네트워크라 이름 해석을 해 주지 않는다(예전에는 `--link`로 메웠지만 지금은 레거시다). 컨테이너 IP는 다시 만들 때마다 바뀔 수 있으니 설정에 IP를 적는 것은 답이 아니다.

## 사용자 정의 네트워크와 내장 DNS
네트워크를 직접 만들면 Docker의 **내장 DNS 서버**가 컨테이너 이름과 별칭(`--network-alias`)을 IP로 풀어 준다. 결과를 결정적으로 보이려고 서브넷을 지정했다.
```bash
docker network create --subnet 10.89.0.0/24 appnet >/dev/null
docker run -d --name web2 --network appnet --network-alias api \
  nginx:1.29-alpine >/dev/null
docker run --rm --network appnet alpine:3.20 sh -c '
  grep nameserver /etc/resolv.conf
  ping -c1 web2 | head -1
  wget -qO- -T 2 http://api | grep -o "<title>.*</title>"'
```
```text
nameserver 127.0.0.11
PING web2 (10.89.0.2): 56 data bytes
<title>Welcome to nginx!</title>
```
컨테이너의 `/etc/resolv.conf`는 `127.0.0.11`을 가리킨다. Docker가 컨테이너 네임스페이스 안에 심어 둔 DNS 응답기로, 같은 네트워크의 컨테이너 이름은 직접 답하고 나머지 이름은 호스트의 DNS 설정으로 넘긴다. 9편의 Compose는 프로젝트마다 이런 네트워크를 만들어 서비스 이름을 그대로 호스트 이름으로 쓰게 해 준다.

## 네트워크는 격리의 경계다
서로 다른 사용자 정의 네트워크의 컨테이너는 이름도, IP도 닿지 않는다.
```bash
docker network create --subnet 10.89.1.0/24 othernet >/dev/null
docker run --rm --network othernet alpine:3.20 sh -c \
  'wget -qO- -T 2 http://web2; wget -qO- -T 2 http://10.89.0.2'
```
```text
wget: bad address 'web2'
wget: download timed out
```
이름은 DNS가 모르고, IP는 Docker가 넣은 방화벽 규칙이 네트워크 사이의 패킷을 버려서 시간 초과가 났다. 컨테이너를 두 네트워크에 동시에 붙이면 양쪽에서 닿는다. 프런트엔드 네트워크와 백엔드 네트워크를 나누고 API 서버만 양쪽에 붙이면, 바깥쪽 컨테이너는 DB에 닿을 수 없다.
```bash
docker network connect othernet web2
for n in appnet othernet; do
  docker network inspect $n \
    -f '{{.Name}}: {{range .Containers}}{{.Name}} {{.IPv4Address}}{{end}}'
done
docker run --rm --network othernet alpine:3.20 \
  wget -qO- -T 2 http://web2 | grep -o '<title>.*</title>'
```
```text
appnet: web2 10.89.0.2/24
othernet: web2 10.89.1.…/24
<title>Welcome to nginx!</title>
```
`docker network inspect`로 네트워크 쪽에서 보면 web2가 네트워크마다 다른 IP와 인터페이스를 하나씩 가졌다.

## 포트 공개: -p의 의미
`-p 8080:80`은 "호스트의 8080번으로 들어온 연결을 이 컨테이너의 80번으로 전달하라"는 규칙이다. 앞이 호스트, 뒤가 컨테이너다. Docker는 호스트 커널의 주소 변환(iptables NAT) 규칙과 보조 프로세스(docker-proxy)로 이를 구현한다. 4편에서 본 `EXPOSE`는 문서일 뿐이고, 실제 공개는 `-p`다.
```bash
docker run -d --name web3 -p 8080:80 -p 127.0.0.1:8081:80 \
  nginx:1.29-alpine >/dev/null
docker port web3
curl -s localhost:8080 | grep -o '<title>.*</title>'
```
```text
80/tcp -> 0.0.0.0:8080
80/tcp -> 127.0.0.1:8081
<title>Welcome to nginx!</title>
```
주소를 생략하면 모든 인터페이스(`0.0.0.0`, IPv6가 켜진 호스트에서는 `[::]`도)에 공개되어 같은 네트워크의 다른 기기에서도 접속된다. 공식 문서에 따르면 공개 포트의 패킷은 주소 변환 단계에서 먼저 컨테이너로 돌려지므로 ufw 같은 호스트 방화벽의 차단 규칙이 적용되지 않는다. 개발용 DB처럼 내 컴퓨터에서만 쓸 포트는 `127.0.0.1:`을 붙여 루프백에만 공개한다.

## host와 none 네트워크
`--network none`은 루프백만 있는 네임스페이스를 준다. 네트워크가 필요 없는 일괄 작업에 쓴다.
```bash
docker run --rm --network none alpine:3.20 ip -o -4 addr show | awk '{print $2, $4}'
```
```text
lo 127.0.0.1/8
```
`--network host`는 네트워크 네임스페이스를 따로 만들지 않고 호스트의 것을 그대로 쓴다. 주소 변환이 없어 빠르고 `-p`가 필요 없지만 포트 충돌과 격리 상실을 감수해야 한다. 리눅스 엔진에서의 이야기이고, Docker Desktop에서는 "호스트"가 리눅스 VM이다.
```bash
hostname; docker run --rm --network host alpine:3.20 hostname
```
```text
vm
vm
```

## 흔한 실수와 문제 해결
**포트가 이미 쓰이고 있다.** 같은 호스트 포트는 하나만 공개할 수 있다. 실패한 컨테이너는 만들어진 채 남으므로 지워야 한다.
```bash
docker run -d --name web4 -p 8080:80 nginx:1.29-alpine
```
```text
…
docker: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint web4 (…): Bind for 0.0.0.0:8080 failed: port is already allocated
...
```
첫 줄의 컨테이너 ID가 컨테이너는 이미 만들어졌다는 증거다.

**컨테이너 안의 localhost는 호스트가 아니다.** 호스트에서 도는 서버에 컨테이너가 `localhost`로 접속하면 거부된다. Docker Desktop은 `host.docker.internal`이라는 이름을 기본으로 주고, 리눅스 엔진에서는 `--add-host host.docker.internal:host-gateway`로 같은 이름을 만든다(호스트 서버는 `127.0.0.1`이 아니라 브리지 쪽에서 닿는 주소에 바인딩되어 있어야 한다).
```bash
python3 -m http.server 9000 --bind 0.0.0.0 >/dev/null 2>&1 & srv=$!
sleep 1
docker run --rm alpine:3.20 wget -qO- -T 2 http://localhost:9000
docker run --rm --add-host host.docker.internal:host-gateway alpine:3.20 \
  wget -qO- -T 2 http://host.docker.internal:9000 | grep -o '<title>.*</title>'
kill $srv
```
```text
wget: can't connect to remote host (127.0.0.1): Connection refused
<title>Directory listing for /</title>
```
**컨테이너 안 서버가 `127.0.0.1`에만 바인딩했다.** `-p`로 공개해도 연결이 끊긴다. 전달된 연결은 컨테이너의 `eth0`으로 들어오므로 컨테이너 안 서버는 `0.0.0.0`에 바인딩해야 한다(WSL 개발 환경 7편에서 같은 원리를 다룬다).

정리는 만든 것만 이름으로 지운다.
```bash
docker rm -f web1 web2 web3 web4 >/dev/null
docker network rm appnet othernet
```
```text
appnet
othernet
```

## 권장 설정과 체크리스트
- 함께 일하는 컨테이너는 사용자 정의 네트워크에 넣고 이름으로 부른다. IP를 설정에 적지 않는다.
- 외부에 열 서비스만 `-p`로 공개하고, DB·캐시는 공개하지 않는다. 개발 중 접속이 필요하면 `127.0.0.1:`에만 연다.
- 공개 포트는 ufw 같은 호스트 방화벽 규칙을 우회할 수 있다. 서버에서는 공식 문서의 `DOCKER-USER` 체인 안내를 따른다.
- 계층마다 네트워크를 나누고(프런트·백엔드) 경계에 있는 서비스만 양쪽에 붙인다.
- 진단 순서: `docker port` → `docker inspect`의 네트워크 → 같은 네트워크의 임시 컨테이너에서 `wget`·`ping` → 서버의 바인딩 주소.

## 숫자로 보기
| 항목 | 값 |
|---|---|
| 기본 브리지 대역 | 172.17.0.0/16 |
| 내장 DNS 주소 | 127.0.0.11 |
| /24 서브넷의 주소 | 256개(게이트웨이 .1) |

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: `10.89.0.0/24`의 `/24`는 32비트 주소의 앞 24비트가 네트워크 부분이라는 2진수 표기다.
- WSL 개발 환경 7편 「네트워크: NAT와 미러 모드, localhost 포워딩, 포트 열기」: WSL 2의 NAT와 localhost 포워딩은 이 글의 브리지·포트 공개와 같은 구조다.
- 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: Compose가 만드는 프로젝트 네트워크가 이 글의 사용자 정의 네트워크다.

## 정리
- 컨테이너마다 네트워크 네임스페이스가 있어 `localhost`와 포트 공간이 따로다.
- 이름 해석(127.0.0.11)은 사용자 정의 네트워크에서만 된다. 기본 브리지에서는 IP만 통한다.
- 네트워크가 다르면 서로 닿지 않고, `docker network connect`로 경계를 연다.
- `-p`는 호스트 포트를 컨테이너로 전달하는 규칙이며 생략한 주소는 모든 인터페이스다.

## 더 알아보기
- 이전 글: 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」
- 다음 글: 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」
- Docker 공식 문서 Packet filtering and firewalls: https://docs.docker.com/engine/network/packet-filtering-firewalls/
