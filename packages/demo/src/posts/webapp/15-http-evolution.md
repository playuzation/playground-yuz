# [웹 앱의 원리 15/20] 연결을 아끼는 HTTP의 진화: keep-alive, HTTP/2, HTTP/3

> **한 줄 요약** — 새 연결 하나에 왕복 두세 번이 드는 비용을 줄이려고 HTTP는 연결을 재사용하는 keep-alive(1.1), 한 연결 안에서 요청 여러 개를 섞어 보내는 멀티플렉싱(2), 그리고 TCP 대신 UDP 위의 QUIC으로 연결 설정과 패킷 손실의 영향까지 줄인 HTTP/3로 진화했다.

## 이 글에서 다루는 것
- 연결 하나의 값: DNS, TCP, TLS 왕복
- HTTP/1.0의 요청마다 새 연결과 HTTP/1.1의 keep-alive
- 한 연결에 한 요청씩이라는 한계와 브라우저의 우회로
- HTTP/2: 바이너리 프레임, 스트림 멀티플렉싱, 헤더 압축
- HTTP/3와 QUIC: TCP의 줄 막힘을 넘어서
- 직접 해 보기: 연결 재사용 확인, HTTP/2 스트림 세 개를 한 연결로, 왕복 수와 패킷 손실 시뮬레이션

## 연결 하나의 값
7편과 10편에서 본 것을 모으면, 새 HTTPS 연결로 첫 요청을 보내기까지 DNS 질의(캐시에 없으면) + TCP 핸드셰이크 왕복 1번 + TLS 1.3 핸드셰이크 왕복 1번이 들고, 그다음에야 요청과 응답이 왕복 1번을 쓴다. 왕복이 100ms인 모바일 환경이라면 첫 바이트까지 300ms다. 웹 페이지 하나는 HTML, CSS, 스크립트, 이미지, 글꼴, API 응답까지 수십 개의 자원을 받는다. 자원마다 새 연결을 연다면 대부분의 시간을 핸드셰이크로 보내게 된다. HTTP의 버전 변화는 대부분 이 비용과의 싸움이다.

## HTTP/1.0과 1.1: 연결을 재사용하라
HTTP/1.0은 기본적으로 요청 하나를 처리하면 연결을 닫았다. 1편의 파이썬 서버가 `HTTP/1.0`으로 답한 것이 이 방식이다. HTTP/1.1은 연결을 열어 둔 채 다음 요청에 다시 쓰는 **지속 연결**(persistent connection, 흔히 keep-alive)을 기본으로 만들었다. 직접 확인해 보자. 같은 파일 두 개를 HTTP/1.0 서버와 HTTP/1.1 서버에서 curl 한 번으로 받는다.
```python
# 파일: keepalive_server.py
import http.server

class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'          # 이 한 줄이 연결 재사용을 켠다

    def log_message(self, *args):
        pass

http.server.ThreadingHTTPServer(('127.0.0.1', 8016), Handler).serve_forever()
```
```bash
printf 'a\n' > a.txt; printf 'b\n' > b.txt
python3 -m http.server 8015 --bind 127.0.0.1 > /dev/null 2>&1 &
python3 keepalive_server.py &
sleep 1
echo '--- HTTP/1.0 서버'
curl -sv http://127.0.0.1:8015/a.txt http://127.0.0.1:8015/b.txt 2>&1 \
  | grep -E '^\* (Connected|Re-using)|^< HTTP'
echo '--- HTTP/1.1 서버'
curl -sv http://127.0.0.1:8016/a.txt http://127.0.0.1:8016/b.txt 2>&1 \
  | grep -E '^\* (Connected|Re-using)|^< HTTP'
```
```text
--- HTTP/1.0 서버
* Connected to 127.0.0.1 (127.0.0.1) port 8015
< HTTP/1.0 200 OK
* Connected to 127.0.0.1 (127.0.0.1) port 8015
< HTTP/1.0 200 OK
--- HTTP/1.1 서버
* Connected to 127.0.0.1 (127.0.0.1) port 8016
< HTTP/1.1 200 OK
* Re-using existing connection with host 127.0.0.1
< HTTP/1.1 200 OK
```
HTTP/1.0 서버에는 연결을 두 번 열었고(Connected 두 번), HTTP/1.1 서버에는 한 번 연 연결을 다시 썼다(Re-using). 같은 컴퓨터 안이라 차이가 작지만, 왕복 100ms의 HTTPS라면 두 번째 요청에서 핸드셰이크 200ms를 아낀 셈이다.

## 한 연결에 한 요청씩
keep-alive에도 한계가 있었다. HTTP/1.1의 연결 하나에서는 응답이 돌아와야 다음 요청을 보낼 수 있다. 응답을 기다리지 않고 요청을 줄줄이 보내는 파이프라이닝이 명세에 있었지만, 응답은 보낸 순서대로 와야 해서 앞의 느린 응답 하나가 뒤를 모두 막았고(**줄 막힘**, head-of-line blocking), 중간 장비들의 구현도 엉망이라 브라우저들은 사실상 쓰지 않았다. 대신 브라우저는 한 호스트에 연결을 여섯 개쯤 동시에 열었다. 개발자들은 더 짜냈다. 자원을 여러 도메인에 나눠 연결 수를 늘리고, 작은 이미지를 한 장으로 합치고(스프라이트), 스크립트를 한 파일로 묶었다(번들). 모두 "요청 수를 줄이라"는 HTTP/1.1 시대의 요령이다.

## HTTP/2: 한 연결에 여러 스트림
구글이 2009년부터 실험한 SPDY를 바탕으로, 2015년 5월 HTTP/2가 RFC 7540으로 표준이 되었다(지금은 2022년의 RFC 9113). 메서드·상태 코드·헤더의 뜻(9편)은 그대로 두고, 바이트로 싣는 방식을 바꿨다.
- **바이너리 프레임**: 글자 줄 대신 길이와 종류가 적힌 프레임으로 보낸다.
- **스트림 멀티플렉싱**: 요청·응답 쌍마다 스트림 번호를 붙이고, 여러 스트림의 프레임을 한 연결 위에 섞어 보낸다. 앞의 응답이 느려도 뒤의 응답이 먼저 올 수 있다.
- **헤더 압축**(HPACK): 요청마다 거의 같은 헤더(쿠키, User-Agent)를 앞서 보낸 것의 번호로 대신한다.

Node.js에 들어 있는 HTTP/2 서버로 확인한다. 응답마다 300ms씩 일부러 늦게 답한다.
```js
// 파일: h2_server.js
const http2 = require('node:http2');
const server = http2.createServer((req, res) => {
  setTimeout(() => res.end(`${req.url} via HTTP/${req.httpVersion}\n`), 300);
});
server.listen(8017, '127.0.0.1');
```
```bash
node h2_server.js &
sleep 1
U=http://127.0.0.1:8017
curl -sv -Z --http2-prior-knowledge -o /dev/null -o /dev/null -o /dev/null \
  $U/x $U/y $U/z 2>&1 | grep -E 'Connected to|OPENED stream'
start=$(date +%s%N)
curl -s -Z --http2-prior-knowledge -o /dev/null -o /dev/null -o /dev/null $U/x $U/y $U/z
ms=$(( ($(date +%s%N) - start) / 1000000 ))
[ $ms -lt 600 ] && echo "세 요청(각 300ms)을 마치는 데: 600ms 미만"
curl -s --http2-prior-knowledge $U/x
```
```text
* Connected to 127.0.0.1 (127.0.0.1) port 8017
* [HTTP/2] [1] OPENED stream for http://127.0.0.1:8017/x
* [HTTP/2] [3] OPENED stream for http://127.0.0.1:8017/y
* [HTTP/2] [5] OPENED stream for http://127.0.0.1:8017/z
세 요청(각 300ms)을 마치는 데: 600ms 미만
/x via HTTP/2.0
```
연결은 한 번만 열렸고(Connected 한 번), 그 위에 스트림 1, 3, 5가 차례로 열렸다(클라이언트가 여는 스트림은 홀수 번호다). 각 응답이 300ms씩 걸리는데 셋을 합쳐도 600ms가 안 걸렸다. 한 연결 안에서 세 요청이 동시에 진행됐기 때문이다. HTTP/2에서는 도메인 나누기나 과한 번들 같은 HTTP/1.1 시대의 요령이 오히려 해가 될 수 있다.

## 남은 줄 막힘: TCP
HTTP/2는 HTTP 층의 줄 막힘을 없앴지만 그 아래 TCP는 여전히 한 줄이다. TCP는 바이트 순서를 지키므로(7편) 패킷 하나가 사라지면, 그 패킷이 다시 올 때까지 뒤에 도착한 패킷이 **다른 스트림의 것이어도** 위로 올려 보내지 않는다. 패킷 손실이 잦은 모바일 망에서는 연결 하나에 모든 걸 실은 HTTP/2가 오히려 손해를 보기도 했다. 아래 시뮬레이션은 스트림 세 개(A, B, C)의 패킷 12개를 번갈아 보내다가 A의 두 번째 패킷 하나만 잃는 상황이다. 패킷은 1ms 간격으로 도착하고, 잃은 패킷은 왕복 100ms 뒤에 다시 온다고 가정한 가상의 수치다.
```python
order = [(s, i) for i in range(4) for s in 'ABC']   # A0 B0 C0 A1 B1 C1 ...
LOST, RTT = ('A', 1), 100
arrive = {p: t + 1 for t, p in enumerate(order)}
arrive[LOST] += RTT                                  # 다시 보낸 패킷은 늦게 온다

def tcp_done():          # 한 줄: 앞 패킷이 다 와야 뒤 패킷을 넘긴다
    ready, t = {}, 0
    for p in order:
        t = max(t, arrive[p])
        ready[p] = t
    return {s: max(ready[(s, i)] for i in range(4)) for s in 'ABC'}

def quic_done():         # 스트림마다 따로 순서를 지킨다
    return {s: max(arrive[(s, i)] for i in range(4)) for s in 'ABC'}

print('TCP 위 HTTP/2: ', tcp_done())
print('QUIC 위 HTTP/3:', quic_done())
```
```text
TCP 위 HTTP/2:  {'A': 104, 'B': 104, 'C': 104}
QUIC 위 HTTP/3: {'A': 104, 'B': 11, 'C': 12}
```
TCP 위에서는 A의 패킷 하나 때문에 B와 C도 104ms에야 끝났다. 스트림을 따로 다루는 QUIC에서는 B와 C가 11~12ms에 끝나고 A만 늦었다.

## HTTP/3와 QUIC
**QUIC**은 구글의 실험에서 시작해 2021년 5월 RFC 9000으로 표준이 된 전송 프로토콜이다. TCP 대신 UDP(7편) 위에서 돌며, 순서·재전송·혼잡 제어를 **스트림마다** 스스로 한다. 2022년 6월 RFC 9114로 표준이 된 **HTTP/3**는 HTTP의 뜻을 QUIC 위에 실은 것이다. 바뀐 점은 세 가지다.
- **스트림별 손실 처리**: 위 시뮬레이션처럼 한 스트림의 손실이 다른 스트림을 막지 않는다.
- **더 짧은 연결 설정**: QUIC은 TLS 1.3을 안에 품고 있어 전송 설정과 암호 설정을 왕복 한 번에 함께 끝낸다. 다시 접속할 때는 0-RTT도 된다(10편의 주의 사항은 같다).
- **연결 이동**: TCP 연결은 IP와 포트로 구별되어 와이파이에서 LTE로 바뀌면 끊긴다. QUIC은 연결 ID로 구별해 주소가 바뀌어도 이어 간다.

서버는 응답 헤더 `Alt-Svc: h3=":443"`로 "HTTP/3도 된다"고 알리고, 브라우저는 다음부터 QUIC으로 시도한다. UDP를 막는 네트워크에서는 HTTP/2로 돌아간다.

## 숫자로 보기
자원 30개를 받는 페이지에서 왕복 수만 세어 본 어림이다(왕복 100ms, 대역폭과 혼잡 제어는 무시한 가상의 계산).
| 방식 | 셈 | 약 |
| --- | --- | --- |
| 1.0, 연결 6개 | 묶음 5번 × 3왕복 | 1,500ms |
| 1.1 keep-alive 6개 | 2왕복 + 5번 | 700ms |
| HTTP/2 연결 1개 | 2왕복 + 1번 | 300ms |
| HTTP/3 | 1왕복 + 1번 | 200ms |

## 흔한 오해
- "HTTP/2로 바꾸면 무조건 빨라진다": 왕복이 많은 페이지에서는 크게 빨라지지만, 큰 파일 하나를 받는 데는 차이가 작고, 손실이 많은 망에서는 TCP의 줄 막힘으로 손해를 볼 수 있다.
- "HTTP/3는 UDP라서 신뢰성이 없다": QUIC이 UDP 위에서 순서와 재전송을 직접 한다. 신뢰성을 TCP에 맡기지 않고 스스로 가진 것이다.
- "서버 푸시로 미리 보내면 된다": HTTP/2의 서버 푸시는 브라우저가 이미 가진 것까지 보내는 낭비가 잦아 주요 브라우저가 지원을 거두었다. 대신 미리 받을 것을 힌트로 알리는 방식이 쓰인다.

## 어디에 쓰이나
- 게임 자원 관리 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」: 게임 네트워크가 TCP 대신 UDP 위에 자기만의 신뢰성을 얹는 이유가 QUIC과 같다.
- 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」: 앞의 일이 막히면 뒤가 줄줄이 멈추는 줄 막힘은 CPU 파이프라인에도 있는 문제다.
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: 컨테이너 앞의 프록시가 HTTP/2·3를 받아 뒤로는 HTTP/1.1로 넘기는 구성이 흔하다.

## 정리
- 새 HTTPS 연결은 왕복 두세 번이 든다. HTTP의 진화는 이 비용을 줄이는 역사다.
- HTTP/1.1은 연결을 재사용(keep-alive)했지만 한 연결에 한 요청씩이라 브라우저가 연결을 여러 개 열었다.
- HTTP/2는 한 연결에 여러 스트림을 섞어 보내고 헤더를 압축한다. 그러나 TCP 층의 줄 막힘은 남았다.
- HTTP/3는 UDP 위의 QUIC으로 스트림별 손실 처리, 왕복 한 번의 연결 설정, 주소가 바뀌어도 이어지는 연결을 얻었다.

## 더 알아보기
- 이전 글: 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」
- 다음 글: 16편 「다시 받지 않기: 브라우저 캐시, ETag, CDN」
- HTTP/3 명세 RFC 9114: https://datatracker.ietf.org/doc/rfc9114/
