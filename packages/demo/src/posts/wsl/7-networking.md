# [WSL 개발 환경 7/10] 네트워크: NAT와 미러 모드, localhost 포워딩, 포트 열기

> **한 줄 요약** — 기본 NAT 모드의 WSL 2는 윈도우 뒤에 숨은 가상 머신이라 윈도우의 `localhost`로는 포워딩 덕분에 닿지만 같은 네트워크의 다른 기기는 닿지 않으며, 그 경로를 열려면 서버를 `0.0.0.0`에 바인딩하고 portproxy와 방화벽을 쓰거나 미러 모드로 바꿔야 한다.

## 이 글에서 다루는 것
- NAT 모드의 구조: VM의 가상 IP, localhost 포워딩, 윈도우 호스트 주소
- `127.0.0.1`과 `0.0.0.0` 바인딩 차이를 직접 실행해 확인
- `ss -ltnp`와 `/proc/net/tcp`로 듣는 포트 읽기
- LAN에서 접속하기: netsh portproxy와 방화벽, 미러 모드
- DNS 터널링, VPN, 자주 나는 네트워크 오류

## 같은 서버, 다른 결과
WSL에서 `npm run dev`로 띄운 서버가 윈도우 브라우저의 `http://localhost:3000`에서는 잘 열린다. 그런데 같은 와이파이의 휴대폰으로 노트북 IP에 접속하면 안 되고, 반대로 윈도우에서 돌리는 서버에 WSL에서 `localhost`로 접속해도 안 된다. 셋 다 WSL 2 네트워크의 기본 구조에서 나온다.

## NAT 모드: 윈도우 뒤의 가상 머신
WSL 2는 기본으로 NAT(Network Address Translation) 구조를 쓴다. VM은 자기만의 가상 이더넷 어댑터와 IP를 받고, 공식 문서에 따르면 이 주소는 다시 시작할 때 바뀐다. 윈도우는 그 앞에서 공유기 역할을 한다.
```text
phone (LAN) --x--> Windows IP:8765
┌ Windows host ─────────────────┐
│ browser -> localhost:8765     │
│        | localhost forwarding │
│ ┌ WSL 2 VM (NAT) ───────────┐ │
│ │ eth0  172.30.98.229       │ │
│ │ gateway 172.30.96.1       │ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```
- 윈도우 → WSL: `.wslconfig`의 `localhostForwarding`(기본 true)이 VM 안에서 와일드카드나 localhost에 바인딩한 포트를 윈도우의 `localhost:포트`로 이어 준다. 그래서 브라우저는 그냥 `localhost`를 쓰면 된다.
- WSL → 윈도우: 리눅스의 `localhost`는 VM 자신이다. 윈도우 서버에 닿으려면 VM의 기본 게이트웨이, 즉 윈도우 쪽 주소를 쓴다. 문서의 방법은 `ip route show | grep -i default | awk '{ print $3}'`이고, 이때 연결은 LAN에서 온 것으로 취급되므로 윈도우 앱이 외부 연결을 받고 방화벽이 허용해야 한다.
- LAN → WSL: 다른 기기는 윈도우의 IP만 안다. VM은 그 뒤에 숨어 있으므로 일반 VM처럼 포트를 넘겨 줘야 한다.

VM 주소는 윈도우에서 `wsl hostname -I`로 본다(대문자 I, 소문자 `-i`는 다른 값을 낸다고 문서가 경고한다).

## 바인딩 주소: 127.0.0.1과 0.0.0.0
서버 프로그램은 듣는 주소를 고른다. `127.0.0.1`(루프백)에 바인딩하면 같은 기계 안에서 루프백으로 온 연결만 받고, `0.0.0.0`(와일드카드)에 바인딩하면 모든 인터페이스로 온 연결을 받는다. 리눅스 쪽에서 직접 확인하자(실행 결과는 WSL이 아닌 우분투 24.04 컨테이너 기준이지만, 바인딩 규칙은 WSL 안에서도 같다). 파이썬 내장 웹 서버 둘을 서로 다른 주소에 띄운다.
```bash
mkdir -p site && echo "hello from WSL" > site/index.html
python3 -m http.server 8765 --bind 127.0.0.1 -d site >/dev/null 2>&1 &
LOOP=$!
python3 -m http.server 8766 --bind 0.0.0.0 -d site >/dev/null 2>&1 &
ANY=$!
sleep 1
```
루프백 주소와, 이 기계의 루프백이 아닌 주소(WSL이라면 `eth0`의 172.x 주소) 두 곳으로 접속해 본다.
```bash
IP=$(hostname -I | cut -d' ' -f1)      # 루프백이 아닌 첫 주소
for port in 8765 8766; do
  for host in 127.0.0.1 "$IP"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://$host:$port/")
    [ "$host" = 127.0.0.1 ] && name=루프백 || name=외부주소
    echo "포트 $port ← $name: HTTP $code"
  done
done
```
```text
포트 8765 ← 루프백: HTTP 200
포트 8765 ← 외부주소: HTTP 000
포트 8766 ← 루프백: HTTP 200
포트 8766 ← 외부주소: HTTP 200
```
`127.0.0.1`에 바인딩한 8765는 외부 주소로 오면 연결 자체가 거부된다(000은 응답이 없다는 curl의 표시). 실제 오류는 이렇다.
```bash
curl -sS "http://$IP:8765/"
```
```text
curl: (7) Failed to connect to … port 8765 after … ms: Couldn't connect to server
```
WSL로 옮기면 의미가 분명해진다. 윈도우의 `localhost`는 포워딩이 VM 안으로 이어 주므로 두 서버 모두 열린다. 하지만 portproxy나 다른 기기처럼 VM의 172.x 주소로 들어오는 연결은 "외부 주소" 쪽이라 8765는 거부된다. 공식 문서도 원격 IP로 접속할 때는 앱을 `127.0.0.1` 대신 `0.0.0.0`에 바인딩해야 할 수 있다며 Flask의 `app.run(host='0.0.0.0')`을 예로 든다. 거꾸로, `0.0.0.0`은 열려 있는 모든 길로 연결을 받는다는 뜻이므로 외부에 보여 줄 필요가 없는 개발 서버와 데이터베이스는 `127.0.0.1`에 두는 것이 안전하다.

## 듣는 포트 확인: ss와 /proc/net/tcp
어떤 프로세스가 어느 주소의 몇 번 포트를 듣는지는 `ss -ltnp`로 본다. `-l`은 듣는 소켓만, `-t`는 TCP, `-n`은 이름 대신 숫자, `-p`는 프로세스(다른 사용자 것은 `sudo` 필요)다. 출력의 `Local Address:Port` 열에서 `127.0.0.1:8765`인지 `0.0.0.0:8766`인지를 읽으면 위 실험의 차이가 그대로 보인다.
```sh
ss -ltnp 'sport = :8765 or sport = :8766'
```
`ss`는 iproute2 패키지에 있는데, 이 글을 실행한 컨테이너에는 없어서 같은 정보를 커널 표에서 직접 읽었다. `ss`가 netlink로, 예전 `netstat`이 `/proc/net/tcp`로 읽는 것은 모두 커널의 같은 소켓 표다. 주소는 16진수 리틀 엔디언이고 상태 `0A`가 LISTEN이다.
```python
import socket, struct

rows = []
for line in open("/proc/net/tcp").readlines()[1:]:
    f = line.split()
    ip_hex, port_hex = f[1].split(":")
    port = int(port_hex, 16)
    if f[3] == "0A" and port in (8765, 8766):           # 0A = LISTEN
        ip = socket.inet_ntoa(struct.pack("<I", int(ip_hex, 16)))
        rows.append(f"LISTEN {ip}:{port}  (원문 {f[1]})")
print(*sorted(rows), sep="\n")
for line in open("/proc/net/route").readlines()[1:]:   # ip route의 원본
    iface, dest, gw = line.split()[:3]
    if dest == "00000000":                              # 기본 경로
        print("기본 게이트웨이", iface,
              socket.inet_ntoa(struct.pack("<I", int(gw, 16))))
```
```text
LISTEN 0.0.0.0:8766  (원문 00000000:223E)
LISTEN 127.0.0.1:8765  (원문 0100007F:223D)
기본 게이트웨이 eth0 …
```
`0100007F`를 바이트 순서대로 뒤집으면 7F.00.00.01, 곧 127.0.0.1이다. 마지막 줄의 기본 게이트웨이가 NAT 모드 WSL에서 윈도우 호스트로 가는 주소다(값은 환경마다 다르다).

같은 포트를 두 번 열면 이렇게 실패한다. 개발 서버가 안 뜰 때 가장 먼저 의심할 오류다.
```bash
python3 -m http.server 8766 --bind 0.0.0.0 2>&1 | tail -1
kill $LOOP $ANY
```
```text
OSError: [Errno 98] Address already in use
```

## LAN에서 접속하기: portproxy와 방화벽
NAT 모드에서 휴대폰으로 WSL 서버를 보려면 윈도우가 받은 연결을 VM으로 넘겨야 한다. 공식 문서의 방법은 `netsh interface portproxy`다. 관리자 PowerShell에서 실행한다.
```powershell
$ip = (wsl hostname -I).Trim().Split(' ')[0]   # 지금의 VM 주소
netsh interface portproxy add v4tov4 listenport=8766 listenaddress=0.0.0.0 `
  connectport=8766 connectaddress=$ip
New-NetFirewallRule -DisplayName "WSL dev 8766" -Direction Inbound `
  -Protocol TCP -LocalPort 8766 -Action Allow
netsh interface portproxy show v4tov4
netsh interface portproxy delete v4tov4 listenport=8766 `
  listenaddress=0.0.0.0
```
주의할 점이 셋이다. 리눅스 서버는 `0.0.0.0`에 바인딩해야 한다(위 실험의 8765처럼 거부된다). VM 주소가 재시작마다 바뀌므로 규칙의 `connectaddress`를 다시 맞춰야 한다. `listenaddress=0.0.0.0`과 방화벽 허용은 LAN의 누구에게나 포트를 여는 것이므로 쓰고 나면 지운다.

## 미러 모드
윈도우 11 22H2 이상에서는 `.wslconfig`의 `[wsl2]`에 `networkingMode=mirrored`를 넣어 미러 모드를 켤 수 있다. 윈도우의 네트워크 인터페이스를 리눅스에 그대로 비추는 새 구조로, 문서가 꼽는 이점은 IPv6 지원, 리눅스에서 `127.0.0.1`로 윈도우 서버 접속(`::1`은 지원 안 함), VPN 호환성 향상, 멀티캐스트, LAN에서 WSL로 직접 접속이다.
```ini
[wsl2]
networkingMode=mirrored

[experimental]
hostAddressLoopback=true
```
LAN에서 들어오는 연결은 Hyper-V 방화벽이 걸러 내므로 허용 규칙이 필요하다. 문서의 예(관리자 PowerShell)다.
```powershell
New-NetFirewallHyperVRule -Name "MyWebServer" -DisplayName "My Web Server" `
  -Direction Inbound -Protocol TCP -LocalPorts 80 `
  -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
```
미러 모드에서는 `localhostForwarding`이 무시되고, 윈도우와 리눅스가 같은 포트 공간을 보므로 윈도우가 쓰는 포트에 리눅스 서버가 바인딩하지 못할 수 있다. 그런 포트를 리눅스 안에서만 쓰게 하는 키가 `[experimental]`의 `ignoredPorts`이고, `hostAddressLoopback`은 `127.0.0.1` 말고 호스트에 할당된 다른 IPv4 주소로도 서로 접속하게 한다.

## DNS 터널링, 프록시, VPN
윈도우 11 22H2 이상에서는 `dnsTunneling`이 기본으로 켜져 있어 DNS 질의를 네트워크 패킷 대신 가상화 기능으로 윈도우에 넘긴다. 이때 리눅스의 `/etc/resolv.conf`에는 `10.255.255.254`(`dnsTunnelingIpAddress` 기본값)가 들어간다. 문제 해결 문서는 VPN을 쓴다면 DNS 터널링을 켜 두라고 권하고(VPN의 NRPT 정책이 이때만 적용된다), `resolv.conf`의 DNS 서버 3개 한도도 터널링이 없앤다고 설명한다. `autoProxy=true`는 윈도우의 HTTP 프록시 설정을 WSL에 그대로 적용한다. DNS가 안 될 때의 점검 순서는 10편에서 다룬다.

## 흔한 실수와 문제 해결
- 휴대폰에서 안 열림: 서버가 `127.0.0.1`에 바인딩했거나(`ss -ltn`으로 확인), portproxy의 VM 주소가 낡았거나, 방화벽 규칙이 없다.
- WSL에서 윈도우 서버 접속 실패: NAT 모드의 리눅스 `localhost`는 VM 자신이다. 게이트웨이 주소를 쓰고 윈도우 앱의 바인딩과 방화벽을 확인한다.
- `Address already in use`: 이미 같은 포트를 쓰는 프로세스가 있다. 미러 모드라면 윈도우 쪽 프로세스일 수도 있다.
- 컨테이너 포트(`-p 8080:80`)가 안 열림: 컨테이너 네트워크는 한 층 더 있다(도커와 컨테이너 8편).

## 어디에 쓰이나
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: `-p 127.0.0.1:8080:80`처럼 호스트 쪽 바인딩 주소를 고르는 판단이 이 글의 127.0.0.1 대 0.0.0.0과 같다.
- PostgreSQL 실무 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」: 데이터베이스가 어느 주소에서 듣고 누구를 받을지 정하는 일이 같은 문제다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 소켓도 파일 디스크립터라서 듣는 소켓 표를 `/proc`에서 파일처럼 읽을 수 있다.

## 정리
- NAT 모드에서 윈도우는 `localhost` 포워딩으로 WSL 서버에 닿고, WSL은 기본 게이트웨이 주소로 윈도우에 닿는다.
- `127.0.0.1` 바인딩은 VM 주소로 오는 연결을 거부한다. portproxy·LAN 접속에는 `0.0.0.0`이 필요하지만 그만큼 열린다.
- 듣는 주소와 포트는 `ss -ltnp`(또는 `/proc/net/tcp`)로 확인한다.
- 윈도우 11 22H2 이상이면 미러 모드가 LAN·IPv6·VPN 문제를 구조적으로 줄인다. 방화벽 규칙은 여전히 필요하다.

## 더 알아보기
- 이전 글: 6편 「wsl.conf와 .wslconfig: 배포판 설정과 가상 머신 설정」
- 다음 글: 8편 「systemd와 백그라운드 서비스: WSL에서 데몬 운영하기」
- Accessing network applications with WSL: https://learn.microsoft.com/windows/wsl/networking
