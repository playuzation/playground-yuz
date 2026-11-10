# [웹 앱의 원리 13/20] 실시간 통신: 폴링, 서버 전송 이벤트, 웹소켓

> **한 줄 요약** — HTTP는 클라이언트가 물어야만 서버가 답하는 구조라서, 서버가 먼저 알려야 하는 채팅·알림·시세는 자주 묻는 폴링, 끝나지 않는 응답으로 흘려보내는 서버 전송 이벤트(SSE), HTTP로 시작해 양방향 통로로 바꾸는 웹소켓 중에서 골라 만든다.

## 이 글에서 다루는 것
- 서버가 먼저 말할 수 없는 HTTP
- 폴링과 롱 폴링, 그 비용
- 서버 전송 이벤트(SSE): 끝나지 않는 응답
- 웹소켓: 101 Switching Protocols 이후의 양방향 프레임
- 직접 해 보기: 폴링 비용 계산, SSE 스트림 받기와 이어 받기, 손으로 만든 웹소켓 서버와 Node.js 클라이언트의 대화

## 질문: 새 메시지는 누가 먼저 알려 주나
지금까지의 HTTP는 항상 클라이언트가 먼저 요청하고 서버가 답했다. 그런데 채팅방에 새 메시지가 오거나, 배송 상태가 바뀌거나, 공동 편집 문서에서 다른 사람이 글자를 고쳤을 때는 **서버가 먼저** 알려야 한다. 서버는 브라우저의 주소로 연결을 열 수 없다(사설 주소와 방화벽 뒤에 있으니까, 7편). 그래서 방법은 모두 "클라이언트가 열어 둔 연결을 이용해 서버가 말하는" 변형이다.

## 폴링과 롱 폴링
가장 단순한 방법은 **폴링**(polling)이다. 몇 초마다 "새 소식 있나요?"라고 묻는다. 서버도 클라이언트도 평범한 HTTP라 만들기 쉽지만 대부분의 요청은 "없음"으로 끝나고, 소식이 생겨도 다음 질문까지 기다려야 한다.
```python
users, interval = 10_000, 5          # 동시 접속 1만 명, 5초마다 질문
events_per_user_hour = 2             # 실제로 새 소식은 한 사람당 시간당 2건
polls_hour = users * 3600 // interval
useful = users * events_per_user_hour
print(f'초당 요청: {users // interval}건, 시간당 {polls_hour:,}건')
print(f'새 소식이 담긴 요청: {useful:,}건 ({useful / polls_hour:.2%})')
print(f'소식이 생겨서 알기까지 평균 {interval / 2}초, 최악 {interval}초')
```
```text
초당 요청: 2000건, 시간당 7,200,000건
새 소식이 담긴 요청: 20,000건 (0.28%)
소식이 생겨서 알기까지 평균 2.5초, 최악 5초
```
요청의 99.7%가 헛걸음이고, 요청마다 TCP·TLS·HTTP 헤더(9편, 10편)의 비용을 낸다. 간격을 줄이면 지연은 줄지만 헛걸음이 그만큼 늘어난다.

**롱 폴링**(long polling)은 서버가 소식이 생길 때까지 답을 미루는 방식이다. 클라이언트가 물으면 서버는 응답을 붙잡고 있다가 소식이 생기는 순간 답하고, 클라이언트는 받자마자 다시 묻는다. 지연은 거의 없어지고 헛걸음도 줄지만, 서버는 기다리는 요청 수만큼 연결을 들고 있어야 하고 소식 하나마다 새 요청이 필요하다. 2000년대 중반 웹 채팅은 대부분 이 방식이었다.

## 서버 전송 이벤트: 끝나지 않는 응답
**SSE**(Server-Sent Events)는 응답 하나를 끝내지 않고 계속 흘려보낸다. 응답의 형식이 `text/event-stream`이고, 이벤트는 `data:` 줄들과 빈 줄로 구분된다. 브라우저의 `EventSource`가 이것을 받아 이벤트마다 처리기를 부르고, 연결이 끊기면 알아서 다시 연결하며, 마지막으로 받은 이벤트 번호를 `Last-Event-ID` 헤더로 알려 이어 받는다. 방향은 서버 → 클라이언트 하나뿐이지만, 평범한 HTTP 응답이라 프록시와 HTTP/2(15편)를 그대로 통과한다. 알림, 피드, 진행률 표시, 언어 모델이 답을 한 토큰씩 흘려보내는 화면에 잘 맞는다.

## 직접 해 보기 1: SSE 스트림
커피 가격이 0.2초마다 바뀌는 시세 스트림을 만든다. 코드는 훑어만 보자.
```python
# 파일: sse_server.py
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        last = int(self.headers.get('Last-Event-ID', 0))   # 어디까지 받았나
        for n in range(last + 1, last + 4):                 # 이벤트 세 개를 흘려보낸다
            event = f'id: {n}\nevent: price\ndata: {{"item": "커피", "price": {4000 + n * 100}}}\n\n'
            self.wfile.write(event.encode())
            self.wfile.flush()
            time.sleep(0.2)

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 8012), Handler).serve_forever()
```
curl의 `-N`은 받는 대로 바로 출력하라는 뜻이다. 처음 받고, 끊긴 뒤 3번까지 받았다고 알리며 다시 받는다.
```bash
python3 sse_server.py &
sleep 1
curl -sN http://127.0.0.1:8012/prices
echo '--- 다시 연결 (3번까지 받았음)'
curl -sN -H 'Last-Event-ID: 3' http://127.0.0.1:8012/prices | grep '^data'
```
```text
id: 1
event: price
data: {"item": "커피", "price": 4100}

id: 2
event: price
data: {"item": "커피", "price": 4200}

id: 3
event: price
data: {"item": "커피", "price": 4300}

--- 다시 연결 (3번까지 받았음)
data: {"item": "커피", "price": 4400}
data: {"item": "커피", "price": 4500}
data: {"item": "커피", "price": 4600}
```
화면으로는 보이지 않지만 세 이벤트는 0.2초 간격으로 하나씩 도착했다. 요청은 한 번이고 응답이 계속 흘러온 것이다. 다시 연결할 때는 번호 덕분에 4번부터 이어 받았다. 브라우저에서는 `new EventSource('/prices')` 한 줄이 이 모든 것(다시 연결, 번호 전달)을 한다.

## 웹소켓: HTTP로 시작해 다른 프로토콜로
채팅, 온라인 게임, 공동 편집처럼 **양쪽이 수시로** 말해야 하면 **웹소켓**(WebSocket)을 쓴다. 2011년 12월 RFC 6455로 표준이 되었다. 시작은 평범한 HTTP GET이다. 클라이언트가 `Upgrade: websocket` 헤더와 무작위 값 `Sec-WebSocket-Key`를 보내면, 서버는 `101 Switching Protocols`로 답하며 그 값에 정해진 문자열을 붙여 해시한 `Sec-WebSocket-Accept`를 돌려준다. 이 확인이 끝나면 같은 TCP 연결은 더 이상 HTTP가 아니다. 양쪽이 언제든 작은 **프레임**(최소 2바이트 머리말 + 내용)을 보낼 수 있는 통로가 된다. 브라우저가 보내는 프레임은 내용을 무작위 열쇠로 뒤섞어(masking) 보내는데, 중간의 오래된 캐시 프록시가 프레임을 HTTP 응답으로 착각해 저장하는 사고를 막기 위해서다.

## 직접 해 보기 2: 손으로 만든 웹소켓 서버
핸드셰이크와 텍스트 프레임만 다루는 최소한의 웹소켓 서버를 소켓 위에 직접 만든다. 연결되자마자 서버가 **먼저** 인사를 보내고, 받은 말에 답한다. 코드는 훑어만 보자.
```python
# 파일: ws_server.py
import base64, hashlib, socket, struct, threading

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'      # RFC 6455가 정한 문자열

def accept_key(key):
    return base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()

def recv_exact(conn, n):
    data = b''
    while len(data) < n:
        chunk = conn.recv(n - len(data))
        if not chunk:                              # 상대가 연결을 끊었다
            raise ConnectionError
        data += chunk
    return data

def read_frame(conn):
    b1, b2 = recv_exact(conn, 2)
    opcode, length = b1 & 0x0F, b2 & 0x7F
    if length == 126:
        length = struct.unpack('!H', recv_exact(conn, 2))[0]
    mask = recv_exact(conn, 4) if b2 & 0x80 else b'\0\0\0\0'
    payload = recv_exact(conn, length)
    return opcode, bytes(b ^ mask[i % 4] for i, b in enumerate(payload))  # 뒤섞인 내용 풀기

def send_text(conn, text):
    data = text.encode()
    head = bytes([0x81, len(data)]) if len(data) < 126 else bytes([0x81, 126]) + struct.pack('!H', len(data))
    conn.sendall(head + data)                      # 0x81 = 마지막 조각인 텍스트 프레임

def handle(conn):
    request = b''
    while b'\r\n\r\n' not in request:
        request += conn.recv(1024)
    lines = request.decode().split('\r\n')[1:]
    headers = {k.lower(): v for k, _, v in (line.partition(': ') for line in lines) if v}
    conn.sendall(('HTTP/1.1 101 Switching Protocols\r\n'
                  'Upgrade: websocket\r\nConnection: Upgrade\r\n'
                  f"Sec-WebSocket-Accept: {accept_key(headers['sec-websocket-key'])}\r\n\r\n").encode())
    send_text(conn, '연결됨: 서버가 먼저 보낸 인사')
    try:
        while True:
            opcode, payload = read_frame(conn)
            if opcode == 8:                        # 닫기 프레임
                conn.sendall(b'\x88\x00')
                break
            send_text(conn, '서버가 받은 말: ' + payload.decode())
    except ConnectionError:
        pass
    conn.close()

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('127.0.0.1', 8013)); srv.listen()
while True:
    client, _ = srv.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
```
먼저 RFC 6455 본문에 실린 예시 키로 핸드셰이크만 curl로 해 본다. 표준 문서가 적어 둔 답 `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`가 나와야 한다.
```bash
python3 ws_server.py &
sleep 1
curl -s -i -N --max-time 1 http://127.0.0.1:8013/chat \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' | head -4
```
```text
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```
이제 진짜 클라이언트로 대화한다. Node.js 22에는 브라우저와 같은 `WebSocket`이 들어 있다.
```js
// 파일: ws_client.mjs
const ws = new WebSocket('ws://127.0.0.1:8013/chat');
ws.onmessage = (event) => {
  console.log('받음:', event.data);
  if (event.data.startsWith('연결됨')) ws.send('안녕, 실시간 세상');
  else ws.close();
};
ws.onclose = () => console.log('연결 닫힘');
```
```bash
node ws_client.mjs
```
```text
받음: 연결됨: 서버가 먼저 보낸 인사
받음: 서버가 받은 말: 안녕, 실시간 세상
연결 닫힘
```
첫 줄은 클라이언트가 아무것도 묻지 않았는데 서버가 먼저 보낸 것이다. HTTP로는 할 수 없던 일이다. 그다음 한 연결 안에서 양쪽이 번갈아 말했고, 메시지마다 붙은 머리말은 몇 바이트뿐이다. 실제 서비스에서는 라이브러리가 조각난 프레임, 큰 메시지, 핑·퐁(연결 확인), 압축까지 처리한다.

## 무엇을 고를까
| 방식 | 방향 | 잘 맞는 곳 |
| --- | --- | --- |
| 폴링 | 클라이언트가 물음 | 드문 갱신, 단순함이 최우선 |
| SSE | 서버 → 클라이언트 | 알림, 피드, 진행률, 토큰 흘리기 |
| 웹소켓 | 양방향 | 채팅, 게임, 공동 편집 |

오래 열려 있는 연결은 공짜가 아니다. 연결마다 서버 메모리를 쓰고, 중간의 프록시와 로드 밸런서(18편)가 오래된 연결을 끊지 않게 설정해야 하며, 끊기면 클라이언트가 다시 연결하는데 수만 명이 동시에 다시 붙으면 서버가 쓰러질 수 있어 대기 시간에 무작위를 섞는다(19편). 영상 통화처럼 브라우저끼리 직접 미디어를 주고받는 일은 WebRTC라는 별도 기술이 맡는다.

## 흔한 오해
- "실시간이면 무조건 웹소켓이다": 서버에서 클라이언트로만 흐르면 SSE가 더 단순하고, HTTP의 인프라(인증, 프록시, HTTP/2)를 그대로 쓴다.
- "웹소켓은 HTTP와 무관하다": 시작은 HTTP 요청이고 같은 포트(80, 443)를 쓴다. 그래서 대부분의 방화벽을 통과한다. 핸드셰이크 이후의 프레임만 HTTP가 아니다.
- "연결이 열려 있으면 메시지는 반드시 도착한다": 연결은 소리 없이 죽을 수 있다(와이파이 전환, 중간 장비의 시간 제한). 핑으로 확인하고, 다시 연결한 뒤 빠진 메시지를 번호로 메우는 설계가 필요하다.

## 어디에 쓰이나
- 컴퓨터와 AI의 첫걸음 6편 「AI는 어떻게 사람과 대화하게 되었나: 규칙에서 다음 단어 예측까지」: 챗봇이 답을 한 토큰씩 보여 주는 화면은 대개 이 글의 SSE 같은 스트림으로 받는다.
- 게임 자원 관리 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」: 양방향 통로가 생긴 다음, 무엇을 얼마나 자주 보낼지를 다룬다.
- PostgreSQL 실무 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」: 실시간 알림의 출처가 되는 작업 처리와 상태 변경이 데이터베이스에서 어떻게 일어나는지 이어진다.

## 정리
- HTTP는 클라이언트가 먼저 묻는 구조라 서버가 먼저 알리려면 요령이 필요하다.
- 폴링은 단순하지만 헛걸음과 지연이 크고, 롱 폴링은 답을 미뤄 지연을 줄인다.
- SSE는 끝나지 않는 HTTP 응답으로 서버 → 클라이언트 이벤트를 흘려보내고, 번호로 이어 받는다.
- 웹소켓은 HTTP 요청으로 시작해 101 응답 뒤 양방향 프레임 통로가 된다. 오래 열린 연결의 관리와 다시 연결 설계가 함께 따라온다.

## 더 알아보기
- 이전 글: 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」
- 다음 글: 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」
- 웹소켓 명세 RFC 6455: https://www.rfc-editor.org/rfc/rfc6455
