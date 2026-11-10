# [웹 앱의 원리 10/20] HTTPS와 TLS: 암호화, 인증서, 핸드셰이크

> **한 줄 요약** — HTTPS는 HTTP를 TLS로 감싼 것으로, 공개키 기술로 처음 보는 상대와 비밀 열쇠를 나눠 갖고, 인증서로 "이 열쇠의 주인이 정말 그 도메인인가"를 확인한 뒤, 빠른 대칭키 암호로 모든 요청과 응답을 엿보거나 바꿀 수 없게 만든다.

## 이 글에서 다루는 것
- 엿보기, 바꿔치기, 사칭: TLS가 막는 세 가지
- 대칭키와 공개키, 그리고 처음 만난 사이의 열쇠 나누기
- 인증서와 인증 기관(CA), 신뢰의 사슬
- TLS 1.3 핸드셰이크와 왕복 횟수
- 직접 해 보기: 엿보는 중계기로 HTTP와 HTTPS 비교하기, 내 인증 기관과 인증서 만들기, 작은 수로 해 보는 디피-헬만

## 질문: 카페 와이파이의 다른 손님은 무엇을 볼 수 있을까
7편에서 패킷은 여러 장비를 한 칸씩 지난다고 했다. 그 길 위의 누구든(같은 와이파이의 손님, 공유기, 통신사 장비) 지나가는 바이트를 볼 수 있다. HTTP는 글자 그대로 오가므로(9편) 로그인 비밀번호도 쿠키도 다 보인다. 볼 수만 있는 것이 아니라 중간에서 바꿀 수도 있고, 가짜 서버가 진짜인 척할 수도 있다. **TLS**(Transport Layer Security)는 이 셋을 막는다.
- **기밀성**: 중간에서 내용을 읽을 수 없다.
- **무결성**: 중간에서 한 바이트라도 바꾸면 받는 쪽이 알아챈다.
- **인증**: 지금 대화하는 상대가 정말 그 도메인의 주인이다.

## 직접 해 보기 1: 엿보는 중계기
길 위의 엿보는 사람을 직접 만들어 본다. 받은 바이트를 그대로 넘겨주면서 클라이언트가 보낸 것을 파일에 몰래 적는 중계기다. 코드는 훑어만 보자.
```python
# 파일: snoop.py
import socket, sys, threading

listen_port, target_port = int(sys.argv[1]), int(sys.argv[2])
log = open(f'snoop-{listen_port}.bin', 'wb')

def pipe(src, dst, record):
    try:
        while data := src.recv(4096):
            if record:                  # 클라이언트가 보낸 바이트를 몰래 기록
                log.write(data); log.flush()
            dst.sendall(data)
        dst.shutdown(socket.SHUT_WR)
    except OSError:                     # 한쪽이 먼저 끊으면 조용히 끝낸다
        pass

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('127.0.0.1', listen_port)); srv.listen()
while True:
    client, _ = srv.accept()
    server = socket.create_connection(('127.0.0.1', target_port))
    threading.Thread(target=pipe, args=(client, server, True), daemon=True).start()
    threading.Thread(target=pipe, args=(server, client, False), daemon=True).start()
```
HTTPS 서버도 하나 필요하다. 진짜 인증 기관 대신 이 컴퓨터에서만 쓰는 장난감 **인증 기관**(CA)을 만들고, 그 기관이 `localhost`라는 이름의 서버 인증서에 서명하게 한다.
```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt \
  -days 30 -subj '/CN=Toy Local CA' 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj '/CN=localhost' 2>/dev/null
printf 'subjectAltName=DNS:localhost\n' > san.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 30 -extfile san.ext 2>/dev/null
openssl x509 -in server.crt -noout -subject -issuer -ext subjectAltName
```
```text
subject=CN = localhost
issuer=CN = Toy Local CA
X509v3 Subject Alternative Name:
    DNS:localhost
```
인증서에는 "이 공개키의 주인은 `localhost`"라는 내용과, 그것을 보증하는 발급자(issuer)가 적혀 있다. 이제 이 인증서로 TLS 서버를 띄운다.
```python
# 파일: tls_server.py
import http.server, ssl

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = '암호화된 연결로 받은 응답\n'.encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('server.crt', 'server.key')     # 인증서와 개인키
srv = http.server.HTTPServer(('127.0.0.1', 8010), Handler)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
```
일반 HTTP 서버(8012번)와 HTTPS 서버(8010번) 앞에 각각 중계기(8013번, 8014번)를 세우고, 같은 비밀번호를 담은 요청을 두 번 보낸다.
```bash
python3 tls_server.py &
python3 -m http.server 8012 --bind 127.0.0.1 > /dev/null 2>&1 &
python3 snoop.py 8013 8012 &
python3 snoop.py 8014 8010 &
sleep 1
curl -s -o /dev/null 'http://localhost:8013/login?pw=secret123'
curl -s -o /dev/null --cacert ca.crt 'https://localhost:8014/login?pw=secret123'
sleep 0.5
python3 -c "
for port in (8013, 8014):
    data = open(f'snoop-{port}.bin', 'rb').read()
    head = data[:16] if port == 8013 else data[:3].hex(' ')
    print(port, '비밀번호가 보이나:', b'secret123' in data, '| 앞부분:', head)
"
```
```text
8013 비밀번호가 보이나: True | 앞부분: b'GET /login?pw=se'
8014 비밀번호가 보이나: False | 앞부분: 16 03 01
```
HTTP 쪽 중계기는 요청 첫 줄을 글자 그대로 읽었다. HTTPS 쪽은 비밀번호를 찾지 못했다. 앞부분 `16 03 01`은 "TLS 핸드셰이크 메시지"라는 표시와 버전 번호이고, 그 뒤는 협상 내용과 암호문뿐이다. 중계기는 여전히 바이트를 넘겨주고 있지만 내용을 알 수 없다. 바꿔치기를 하면 무결성 검사에 걸려 연결이 끊긴다. 그런데 이 중계기가 아예 자기 인증서를 내밀며 진짜 서버인 척하면 어떻게 될까. 그것을 막는 것이 인증서 검사다.

## 직접 해 보기 2: 인증서 검사
```bash
curl -s --cacert ca.crt https://localhost:8010/
curl -sS https://localhost:8010/ 2>&1 | head -1
curl -sS --cacert ca.crt https://127.0.0.1:8010/ 2>&1 | head -1
curl -sv --cacert ca.crt https://localhost:8010/ 2>&1 | grep -E 'SSL connection|issuer:'
```
```text
암호화된 연결로 받은 응답
curl: (60) SSL certificate problem: unable to get local issuer certificate
curl: (60) SSL: no alternative certificate subject name matches target host name '127.0.0.1'
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / …
*  issuer: CN=Toy Local CA
```
- 장난감 CA를 믿으라고(`--cacert`) 알려 주면 연결이 된다.
- 알려 주지 않으면 curl은 이 CA를 모르니 거절한다. 브라우저의 "연결이 비공개로 설정되어 있지 않습니다" 경고가 이것이다.
- 같은 서버에 `127.0.0.1`이라는 이름으로 접속하면, 인증서에 적힌 이름(`localhost`)과 달라서 거절한다. 인증서는 "공개키 + 이름"에 대한 보증이라 이름이 맞아야 한다.
- 마지막 줄은 협상 결과다. TLS 1.3으로, 데이터는 AES-256-GCM 대칭키 암호로 보호된다.

## 열쇠를 어떻게 나눠 갖나
암호화에는 두 종류가 있다. **대칭키** 암호(AES 같은)는 같은 열쇠로 잠그고 연다. 빠르지만 처음 만난 서버와 열쇠를 어떻게 나눠 가질지가 문제다. 열쇠를 그냥 보내면 엿보는 사람도 받는다. **공개키** 기술은 이 문제를 푼다. 1976년 디피와 헬만이 발표한 키 교환은, 엿보는 사람이 모든 대화를 들어도 두 사람만 같은 비밀 수를 얻는 방법이다. 아주 작은 수로 해 보면 이렇다.
```python
p, g = 23, 5                    # 모두에게 공개된 수
a, b = 6, 15                    # 브라우저와 서버가 각자 몰래 고른 수
A = pow(g, a, p)                # 브라우저가 보내는 값
B = pow(g, b, p)                # 서버가 보내는 값
print('길 위에서 보이는 것:', p, g, A, B)
print('브라우저가 계산한 비밀:', pow(B, a, p))
print('서버가 계산한 비밀:', pow(A, b, p))
```
```text
길 위에서 보이는 것: 23 5 8 19
브라우저가 계산한 비밀: 2
서버가 계산한 비밀: 2
```
엿보는 사람은 23, 5, 8, 19를 모두 봤지만 몰래 고른 6과 15를 모르면 2를 알아내기 어렵다. 이 예의 수는 너무 작아 금방 풀리지만, 실제로는 타원 곡선(위 출력의 X25519)처럼 지금의 컴퓨터로는 사실상 풀 수 없는 크기를 쓴다. 이렇게 얻은 비밀로 대칭키를 만들고, 그다음 모든 데이터는 빠른 대칭키 암호로 오간다.

그런데 키 교환만으로는 "상대가 진짜 그 서버인가"를 모른다. 중간의 가짜 서버와 키를 교환했을 수도 있다. 그래서 서버는 자기 인증서와 함께, 그 인증서의 공개키에 짝이 되는 개인키로 핸드셰이크 내용에 서명해 보낸다. 브라우저는 인증서가 믿을 만한 CA의 서명을 받았는지, 이름이 맞는지, 기간이 지나지 않았는지, 서명이 맞는지를 확인한다. 브라우저와 운영체제에는 믿을 루트 CA 목록이 미리 들어 있고, 서버 인증서는 보통 중간 CA를 거쳐 루트까지 이어지는 **신뢰의 사슬**을 이룬다.

## 핸드셰이크와 왕복 횟수
TLS 1.3(2018년 8월, RFC 8446)의 핸드셰이크는 TCP 연결(7편) 위에서 왕복 한 번이면 끝난다.
```text
client                     server
  │── hello + key share ──→ │
  │←─ hello + key share ─── │
  │   + cert + signature    │
  │── finished + request ──→│
```
이전 버전인 TLS 1.2는 보통 왕복 두 번이 필요했다. 다시 접속할 때는 이전 세션 정보로 첫 패킷에 데이터를 실어 보내는 0-RTT도 있지만, 공격자가 그 패킷을 다시 보내는 재전송 공격에 약해 멱등한 요청(9편)에만 쓴다. 정리하면 새 HTTPS 연결 하나는 DNS(8편) + TCP 왕복 1번 + TLS 왕복 1번을 거쳐야 첫 요청을 보낼 수 있다. 15편과 20편에서 이 비용을 줄이는 방법을 본다.

## HTTPS가 기본이 되기까지
넷스케이프가 1995년 SSL 2.0을 내놓으며 시작했고, 1999년 TLS 1.0으로 이름이 바뀌어 표준이 되었다. 한동안 HTTPS는 로그인과 결제 화면에만 쓰였다. 인증서가 유료이고 발급 절차가 번거로웠기 때문이다. 2015년 12월 공개 베타를 시작해 2016년 4월 정식 서비스가 된 Let's Encrypt가 인증서를 무료로, ACME라는 프로토콜로 자동 발급·갱신하게 하면서 모든 페이지를 HTTPS로 제공하는 것이 당연해졌다. 지금은 서비스 워커(6편)처럼 HTTPS에서만 쓸 수 있는 기능도 많다.

## 흔한 오해
- "자물쇠 표시가 있으면 믿을 만한 사이트다": 자물쇠는 "이 도메인과 암호화된 연결"을 보증할 뿐이다. 사기 사이트도 자기 도메인의 인증서를 쉽게 받는다. 주소의 도메인을 확인해야 한다.
- "HTTPS면 아무것도 새지 않는다": 내용은 숨지만 어느 IP에 언제 얼마나 보냈는지, 그리고 접속하려는 도메인 이름 상당 부분은 여전히 드러날 수 있다.
- "암호화 때문에 HTTPS는 느리다": 요즘 CPU는 AES를 하드웨어로 처리해 암호화 자체의 비용은 작다. 느림의 대부분은 핸드셰이크 왕복이고, 연결 재사용과 TLS 1.3이 그것을 줄였다.

## 어디에 쓰이나
- 컴퓨터와 AI의 첫걸음 3편 「정보 이론이란 무엇인가: 놀라움을 비트로 재기」: 암호문이 무작위 바이트처럼 보여야 한다는 요구는 정보 이론의 언어로 표현된다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: 서명과 짧게 사는 증명서로 신원을 확인하는 생각이 CI의 OIDC에도 쓰인다.
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 서버의 개인키는 대표적인 비밀이고, 이미지나 저장소에 넣지 않고 다루는 법이 거기 있다.

## 정리
- TLS는 기밀성, 무결성, 인증을 준다. HTTPS는 HTTP를 TLS로 감싼 것이다.
- 공개키 기술로 처음 만난 상대와 비밀을 나눠 갖고, 그 비밀로 만든 대칭키로 데이터를 빠르게 암호화한다.
- 인증서는 "이 공개키의 주인은 이 이름"이라는 CA의 보증이다. 브라우저는 신뢰의 사슬, 이름, 기간, 서명을 확인한다.
- TLS 1.3 핸드셰이크는 왕복 한 번이다. 무료 자동 인증서(Let's Encrypt) 이후 HTTPS가 기본이 되었다.

## 더 알아보기
- 이전 글: 9편 「HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더」
- 다음 글: 11편 「상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰」
- TLS 1.3 명세 RFC 8446: https://datatracker.ietf.org/doc/rfc8446/
