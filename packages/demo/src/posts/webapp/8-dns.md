# [웹 앱의 원리 8/20] 이름을 주소로 바꾸는 DNS: 질의, 캐시, TTL

> **한 줄 요약** — DNS는 www.example.com 같은 이름을 IP 주소로 바꿔 주는 전 세계에 나뉜 전화번호부로, 루트에서 최상위 도메인과 각 도메인의 권한 서버로 차례로 위임하고, 받은 답은 TTL 동안 곳곳에 캐시해서 같은 질문을 다시 멀리 보내지 않는다.

## 이 글에서 다루는 것
- 파일 한 장(HOSTS.TXT)에서 분산 데이터베이스로
- 이름의 나무: 루트, 최상위 도메인, 권한 서버
- 재귀 리졸버가 답을 찾아가는 길과 캐시
- 레코드 종류(A, AAAA, CNAME, MX, TXT)와 TTL
- 직접 해 보기: UDP로 진짜 DNS 형식의 질의를 보내고 답을 해석하기, TTL 캐시가 바꾸는 것

## 질문: 사람은 이름을, 패킷은 숫자를
7편에서 패킷은 203.0.113.80 같은 숫자 주소만 보고 길을 찾았다. 하지만 사람은 이름을 기억한다. 주소창에 이름을 치면 브라우저는 가장 먼저 그 이름의 IP 주소를 알아내야 한다. 이 일을 **DNS**(Domain Name System)가 한다. 사이트가 열리기 전 가장 먼저 일어나는 네트워크 왕복이 대개 DNS 질의다.

## 파일 한 장에서 나무 구조로
인터넷 초기에는 모든 컴퓨터의 이름과 주소를 적은 파일 하나(HOSTS.TXT)를 중앙 기관(NIC)이 관리했고, 각 컴퓨터가 그 파일을 주기적으로 내려받았다. 컴퓨터가 수백 대일 때는 됐지만 늘어날수록 파일은 커지고, 내 컴퓨터 이름 하나를 바꾸려 해도 중앙의 수정을 기다려야 했다. 1983년 11월 폴 모카페트리스가 RFC 882·883으로 DNS를 제안했고, 1987년 11월의 RFC 1034·1035가 지금까지 쓰는 기본 명세가 되었다. 그 흔적이 지금도 컴퓨터마다 남아 있는 `/etc/hosts` 파일이다. 여기에 적은 이름은 DNS보다 먼저 확인된다.

DNS의 핵심은 **위임**이다. 이름을 점으로 끊어 오른쪽부터 읽으면 나무가 된다.
```text
. (root)
├─ com
│  └─ example.com
│     ├─ www  → 203.0.113.80
│     └─ api  → 203.0.113.81
└─ kr
   └─ co.kr ...
```
루트 서버는 `com`을 누가 맡는지만 알고, `com` 서버는 `example.com`을 누가 맡는지만 안다. `example.com`의 **권한 서버**(authoritative server)가 `www`의 진짜 주소를 안다. 각 단계는 자기 아래를 다른 서버에 위임하므로 누구도 전체를 들고 있지 않고, 도메인 주인은 자기 권한 서버만 고치면 된다. 루트 서버는 a부터 m까지 이름 13개로 운영되지만, 같은 주소를 세계 곳곳의 많은 장비가 나눠 응답한다.

## 답을 찾아가는 길과 캐시
내 컴퓨터가 직접 루트부터 묻지는 않는다. 운영체제의 작은 리졸버는 통신사나 공용 서비스가 운영하는 **재귀 리졸버**(recursive resolver)에게 "www.example.com의 주소"를 묻고, 재귀 리졸버가 대신 루트 → com → example.com 순으로 묻고 다닌다.
```text
browser → OS → resolver
resolver → root: com?
resolver → com: example.com?
resolver → example.com: www?
← 203.0.113.80 (TTL 300)
```
이렇게 매번 네 번씩 왕복한다면 느리고 루트 서버는 감당하지 못할 것이다. 그래서 모든 답에는 **TTL**(time to live, 초 단위)이 붙고, 재귀 리졸버와 운영체제와 브라우저는 그 시간 동안 답을 **캐시**한다. `com`을 누가 맡는지는 하루 넘게 캐시되므로 실제 질의는 대부분 리졸버의 캐시에서 끝나거나 마지막 권한 서버까지만 간다. 7편의 TTL(라우터를 지날 때마다 줄어드는 수)과 이름은 같지만 뜻은 다르다.

DNS 질의는 대개 UDP 53번 포트로 간다. 질문과 답이 한 패킷에 들어갈 만큼 작아서 TCP 핸드셰이크를 생략하는 것이 이득이기 때문이다(답이 크면 TCP로 다시 묻는다). 최근에는 엿보기와 바꿔치기를 막으려고 DNS를 HTTPS나 TLS 안에 넣어 보내는 방식(DoH, DoT)도 쓰인다.

## 레코드 종류
| 종류 | 담는 것 | 예 |
| --- | --- | --- |
| A | IPv4 주소 | 203.0.113.80 |
| AAAA | IPv6 주소 | 2001:db8::80 |
| CNAME | 다른 이름의 별명 | cdn 업체의 이름 |
| MX | 메일 서버 | 메일 받는 서버 이름 |
| TXT | 자유 글자 | 소유 확인 문구 |

CNAME은 "이 이름은 저 이름과 같다"는 뜻이라, 사이트를 CDN(16편)에 맡길 때 내 도메인을 CDN 업체의 이름으로 연결하는 데 자주 쓴다. 한 이름에 A 레코드를 여러 개 두면 리졸버마다 다른 순서로 받아 트래픽이 흩어진다. 사용자의 위치에 따라 가까운 서버 주소를 돌려주는 방식도 있다. DNS는 이름 풀이이면서 가장 바깥의 트래픽 분배 장치이기도 하다(18편).

## 직접 해 보기 1: 진짜 DNS 형식으로 묻고 답하기
DNS 메시지는 12바이트 헤더, 질문, 답으로 된 작은 바이너리 형식이다. 이름은 점 대신 "글자 수 + 글자"를 이어 붙인다(`www.example.com` → 3 www 7 example 3 com 0). 이 형식을 그대로 쓰는 장난감 권한 서버를 UDP 8053번 포트에 띄운다. 코드는 훑어만 보자.
```python
# 파일: tiny_dns.py
import socket, struct

ZONE = {'www.example.com': ('203.0.113.80', 300),   # 이름: (주소, TTL초)
        'api.example.com': ('203.0.113.81', 60)}

def read_name(data, i):
    labels = []
    while data[i]:
        n = data[i]
        labels.append(data[i + 1:i + 1 + n].decode())
        i += n + 1
    return '.'.join(labels), i + 1

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(('127.0.0.1', 8053))
while True:
    msg, client = sock.recvfrom(512)
    tid = struct.unpack('!H', msg[:2])[0]
    name, end = read_name(msg, 12)
    question = msg[12:end + 4]                       # 이름 + 종류 + 클래스
    if name in ZONE:
        ip, ttl = ZONE[name]
        head = struct.pack('!HHHHHH', tid, 0x8180, 1, 1, 0, 0)  # 응답, 답 1개
        answer = struct.pack('!HHHIH', 0xC00C, 1, 1, ttl, 4) + socket.inet_aton(ip)
        sock.sendto(head + question + answer, client)
    else:
        head = struct.pack('!HHHHHH', tid, 0x8183, 1, 0, 0, 0)  # 3 = 없는 이름
        sock.sendto(head + question, client)
```
```bash
python3 tiny_dns.py &
sleep 1
```
이제 클라이언트가 질의를 직접 만들어 보낸다.
```python
import socket, struct

def make_query(name, tid=0x1234):
    qname = b''.join(bytes([len(p)]) + p.encode() for p in name.split('.')) + b'\0'
    head = struct.pack('!HHHHHH', tid, 0x0100, 1, 0, 0, 0)  # 재귀 요청, 질문 1개
    return head, qname + struct.pack('!HH', 1, 1)           # 종류 A, 클래스 IN

head, body = make_query('www.example.com')
print('질의 크기:', len(head + body), '바이트')
print('헤더:', head.hex(' '))
print('질문:', body.hex(' '))

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(2)
for name in ['www.example.com', 'api.example.com', 'nope.example.com']:
    sock.sendto(b''.join(make_query(name)), ('127.0.0.1', 8053))
    reply, _ = sock.recvfrom(512)
    flags, _, answers = struct.unpack('!HHH', reply[2:8])
    if answers:
        ttl = struct.unpack('!I', reply[-10:-6])[0]
        print(f'{name} → {socket.inet_ntoa(reply[-4:])} (TTL {ttl}초)')
    else:
        print(f'{name} → 없는 이름 (오류 코드 {flags & 0xF})')
```
```text
질의 크기: 33 바이트
헤더: 12 34 01 00 00 01 00 00 00 00 00 00
질문: 03 77 77 77 07 65 78 61 6d 70 6c 65 03 63 6f 6d 00 00 01 00 01
www.example.com → 203.0.113.80 (TTL 300초)
api.example.com → 203.0.113.81 (TTL 60초)
nope.example.com → 없는 이름 (오류 코드 3)
```
질의 전체가 33바이트다. 질문 줄의 `03 77 77 77`이 "세 글자 www", `07 65 78…`이 "일곱 글자 example"이다. 이렇게 작기 때문에 핸드셰이크 없는 UDP 한 번으로 묻고 답한다. 실제 서비스에서는 이 질의가 재귀 리졸버를 거치고, 답에 붙은 TTL만큼 캐시된다.

## 직접 해 보기 2: TTL 캐시가 바꾸는 것
재귀 리졸버의 캐시를 흉내 낸다. 시계는 실제 시간 대신 숫자로 넘긴다. 중간(100초)에 사이트를 새 서버로 옮겨 권한 서버의 주소를 바꾼다.
```python
zone = {'www.example.com': ('203.0.113.80', 300)}
cache, asked = {}, 0

def resolve(name, now):
    global asked
    if name in cache and cache[name][1] > now:
        return cache[name][0] + ' (캐시)'
    ip, ttl = zone[name]
    asked += 1
    cache[name] = (ip, now + ttl)
    return ip + ' (권한 서버에 질의)'

for now in [0, 10, 100, 299, 301]:
    if now == 100:
        zone['www.example.com'] = ('198.51.100.7', 300)
        print('t=100초: 권한 서버의 주소를 새 서버로 변경')
    print(f't={now}초:', resolve('www.example.com', now))
print('권한 서버에 실제로 물은 횟수:', asked)
```
```text
t=0초: 203.0.113.80 (권한 서버에 질의)
t=10초: 203.0.113.80 (캐시)
t=100초: 권한 서버의 주소를 새 서버로 변경
t=100초: 203.0.113.80 (캐시)
t=299초: 203.0.113.80 (캐시)
t=301초: 198.51.100.7 (권한 서버에 질의)
권한 서버에 실제로 물은 횟수: 2
```
다섯 번 물었지만 권한 서버까지 간 것은 두 번뿐이다. 대가도 보인다. 주소를 바꾼 뒤에도 캐시가 만료되는 300초까지는 옛 주소가 나간다. 흔히 "DNS 전파에 시간이 걸린다"고 하는 현상의 정체가 이것이다. 서버를 옮길 계획이라면 며칠 전에 TTL을 짧게 낮춰 두고, 옮긴 뒤 다시 늘린다. 옛 서버도 한동안 켜 둬야 한다.

## 흔한 오해
- "DNS를 바꾸면 전 세계에 즉시 반영된다": 곳곳의 캐시가 TTL 동안 옛 답을 들고 있다. 일부 리졸버는 TTL을 제멋대로 늘려 잡기도 한다.
- "DNS는 웹만 쓴다": 메일(MX), 도메인 소유 확인(TXT), 서비스 찾기까지 인터넷의 거의 모든 서비스가 이름 풀이로 시작한다.
- "DNS가 느리면 어쩔 수 없다": 브라우저는 페이지 안의 다른 도메인 주소를 미리 풀어 두는 힌트(`dns-prefetch`)를 받을 수 있고, 페이지가 쓰는 도메인 수를 줄이면 질의 자체가 준다.

## 어디에 쓰이나
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: 컨테이너가 서로를 서비스 이름으로 찾는 것은 도커가 띄우는 작은 내장 DNS 덕분이다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 정적 사이트에 내 도메인을 연결할 때 CNAME과 A 레코드를 직접 설정한다.
- 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」: 시간으로 만료시키는 DNS 캐시와 공간이 모자랄 때 버리는 캐시 교체를 비교해 볼 수 있다.

## 정리
- DNS는 이름을 IP 주소로 바꾼다. 웹 요청의 첫 왕복이 대개 여기서 일어난다.
- 루트 → 최상위 도메인 → 권한 서버로 위임하는 나무 구조라, 누구도 전체를 들고 있지 않다.
- 재귀 리졸버가 대신 묻고 다니며, 모든 답은 TTL 동안 캐시된다. 캐시 덕분에 빠르고, 캐시 때문에 변경이 늦게 퍼진다.
- 질의는 작아서 주로 UDP로 간다. A·AAAA·CNAME·MX·TXT 레코드로 주소, 별명, 메일 서버, 확인 문구를 담는다.

## 더 알아보기
- 이전 글: 7편 「패킷이 목적지에 닿기까지: IP, TCP, UDP, 포트」
- 다음 글: 9편 「HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더」
- DNS의 기본 명세 RFC 1034: https://rfc-annotations.research.icann.org/rfc1034.html
