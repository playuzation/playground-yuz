# [Nginx 웹 서버 6/10] 로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기

> **한 줄 요약** — `upstream` 블록에 서버 여러 대를 적으면 Nginx가 라운드 로빈·가중치·최소 연결·해시 중 하나로 요청을 나누고, 연결에 실패한 서버는 그 요청을 다음 서버로 다시 보내며 정해진 시간 동안 명단에서 빼 두고, 뒤 서버와의 연결은 keepalive로 재사용한다.

## 이 글에서 다루는 것
- `upstream` 블록과 기본 분배(라운드 로빈)
- 가중치, `least_conn`, `hash`와 `ip_hash`
- 수동 헬스 체크: `max_fails`, `fail_timeout`, 다음 서버로 넘기기
- 멱등하지 않은 요청은 다시 보내지 않는다
- 뒤 서버와의 keepalive 연결

## upstream과 라운드 로빈
웹 앱의 원리 18편에서는 파이썬으로 만든 프록시가 백엔드 세 대에 요청을 나눴다. Nginx에서는 `upstream` 블록 하나다. 이름만 다른 백엔드 앱을 세 개 띄운다.
```python
# 파일: backend.py
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NAME, PORT = sys.argv[1], int(sys.argv[2])

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'                 # Nginx와 연결을 재사용할 수 있게
    def do_GET(self):
        body = f'{NAME}\n'.encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
```
분배 방식을 비교하려고 upstream 세 개를 만들고 경로로 나눴다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log off;

    upstream round {                       # 기본: 차례대로
        server 127.0.0.1:9001 max_fails=1 fail_timeout=30s;
        server 127.0.0.1:9002 max_fails=1 fail_timeout=30s;
        server 127.0.0.1:9003 max_fails=1 fail_timeout=30s;
        keepalive 16;                      # 뒤 서버와의 연결을 남겨 두고 재사용
    }
    upstream weighted {                    # 가중치 3:1:1
        server 127.0.0.1:9001 weight=3;
        server 127.0.0.1:9002;
        server 127.0.0.1:9003;
    }
    upstream by_user {                     # 같은 사용자는 같은 서버로
        hash $arg_user consistent;
        server 127.0.0.1:9001;
        server 127.0.0.1:9002;
        server 127.0.0.1:9003;
    }

    server {
        listen 127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";    # keepalive를 위해 Connection: close를 지운다
        location /round/    { proxy_pass http://round; }
        location /weighted/ { proxy_pass http://weighted; }
        location /user/     { proxy_pass http://by_user; }
    }
}
```
```bash
mkdir -p logs
python3 backend.py A 9001 &
python3 backend.py B 9002 & B_PID=$!
python3 backend.py C 9003 &
sleep 0.5
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
echo "라운드 로빈: $(for i in $(seq 6); do curl -s $U/round/; done | tr '\n' ' ')"
echo "가중치 3:1:1, 10번: $(for i in $(seq 10); do curl -s $U/weighted/; done | sort | uniq -c | awk '{printf "%s×%s ", $2, $1}')"
echo "사용자별: $(for u in minji hana dong minji hana dong; do printf '%s→%s ' $u "$(curl -s "$U/user/?user=$u")"; done)"
```
```text
라운드 로빈: A B C A B C 
가중치 3:1:1, 10번: A×6 B×2 C×2 
사용자별: minji→A hana→C dong→B minji→A hana→C dong→B 
```
라운드 로빈은 차례대로, 가중치는 10번 중 A에 6번으로 나뉘었다. Nginx는 가중치를 "A A A B C"처럼 몰아 주지 않고 사이사이 섞어 주는 방식(smooth weighted round robin)을 쓴다. 성능이 다른 서버를 섞어 쓰거나, 새 버전을 일부 요청에만 보낼 때 가중치를 쓴다.

`hash $arg_user consistent`는 쿼리의 `user` 값을 해시해 서버를 고른다. `consistent`는 웹 앱의 원리 18편의 일관된 해싱이다. 어느 사용자가 어느 서버로 가는지는 해시 값이 정하고(사용자가 적으면 한 서버에 몰릴 수도 있다), 같은 사용자는 늘 같은 서버로 간다. 사용자마다 세 번씩 보내 확인해 보자.
```bash
for u in minji sora jun; do
  echo "$u: $(for i in 1 2 3; do curl -s "$U/user/?user=$u"; done | sort -u | wc -l)개 서버"
done
```
```text
minji: 1개 서버
sora: 1개 서버
jun: 1개 서버
```
세 번씩 보내도 각 사용자는 한 서버로만 갔다. 서버 메모리에 사용자별 캐시를 둘 때 적중률을 높인다. 클라이언트 IP로 고르는 `ip_hash`도 있지만, 회사 프록시 뒤의 많은 사용자가 한 IP로 보이면 한 서버에 몰린다. 처리 시간이 들쭉날쭉한 요청이라면 지금 연결이 가장 적은 서버로 보내는 `least_conn`이 낫다.

## 장애 서버 빼기
Nginx 오픈 소스판은 주기적으로 헬스 체크 요청을 보내는 능동 검사가 없고(상용판 기능이다), 실제 요청의 실패를 보고 판단하는 **수동 검사**를 한다. `max_fails=1 fail_timeout=30s`는 "30초 안에 1번 실패하면 30초 동안 빼라"는 뜻이다. 그리고 연결 실패나 시간 초과가 나면 그 요청을 **다음 서버로 다시 보낸다**(`proxy_next_upstream error timeout`이 기본값). B를 끄고 6번 보낸다.
```bash
kill $B_PID; sleep 0.3
for i in $(seq 6); do curl -s -o out.txt -w '%{http_code} ' $U/round/; cat out.txt; done > results.txt
echo "6번 중 200: $(grep -c '^200' results.txt)번, 답한 서버: $(cut -d' ' -f2 results.txt | sort -u | tr '\n' ' ')"
grep -c 'connect() failed' logs/error.log
```
```text
6번 중 200: 6번, 답한 서버: A C 
1
```
여섯 번 모두 200이었다. B로 간 첫 요청은 연결이 거절되자(오류 로그에 1번 기록) 바로 C로 다시 보내져 성공했고, 그 뒤 30초 동안 B는 명단에서 빠져 A와 C만 받았다(다시 보낸 요청 때문에 순서는 매번 조금 다르다). 사용자는 아무것도 눈치채지 못한다.

## 다시 보내면 안 되는 요청
다음 서버로 다시 보내는 것은 편리하지만 위험할 때가 있다. 요청이 B에 **도착해 처리되던 중** 시간 초과가 났다면, 다시 보낸 C에서 같은 주문이 한 번 더 처리된다(웹 앱의 원리 14편의 "응답이 사라진 순간"). 그래서 Nginx는 POST처럼 멱등하지 않은 요청(웹 앱의 원리 9편)은 뒤 서버에 일단 보낸 뒤에는 다른 서버로 다시 보내지 않는다. 이 동작을 `proxy_next_upstream … non_idempotent`로 바꿀 수는 있지만, 앱이 멱등 키로 중복을 막고 있을 때만 그렇게 한다. 다시 보내는 횟수와 시간도 `proxy_next_upstream_tries`, `proxy_next_upstream_timeout`으로 묶어 두면 장애 때 재시도가 폭주하지 않는다(웹 앱의 원리 19편).

## 뒤 서버와의 keepalive
클라이언트와 Nginx 사이는 keep-alive로 연결을 재사용하지만, Nginx는 기본으로 뒤 서버에 요청마다 새 연결을 열고 HTTP/1.0처럼 닫는다. 요청이 많으면 핸드셰이크와 TIME_WAIT 소켓이 쌓인다. 위 설정처럼 upstream에 `keepalive 16;`(워커마다 놀고 있는 연결 16개까지 보관)을 주고, `proxy_http_version 1.1;`과 `proxy_set_header Connection "";`을 함께 써야 재사용된다. 셋 중 하나라도 빠지면 조용히 효과가 없다.
```bash
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```

## 흔한 오해
- "Nginx가 주기적으로 백엔드 상태를 확인한다": 오픈 소스판은 실제 요청이 실패해야 안다. 앱이 살아 있는데 내부적으로 망가진 상태(500을 계속 반환)는 기본으로 실패로 보지도 않는다. 필요하면 `proxy_next_upstream`에 `http_500` 등을 더하거나 별도 헬스 체크를 둔다.
- "실패한 요청은 항상 다른 서버로 다시 간다": POST 같은 요청은 한 번 보낸 뒤에는 다시 보내지 않는다. 앱은 502·504를 받았을 때를 처리해야 한다.
- "`keepalive`만 적으면 연결이 재사용된다": HTTP/1.1과 빈 Connection 헤더가 함께 있어야 한다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 라운드 로빈, 해시, 일관된 해싱, 헬스 체크의 개념과 파이썬 구현을 함께 본다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 다시 보내도 안전한 요청을 만드는 멱등 키가 Nginx의 재전송 설정과 짝을 이룬다.
- Redis 실무 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」: 상태를 서버 밖의 공유 저장소에 두어야 아무 서버나 요청을 받을 수 있다.

## 정리
- `upstream`에 서버를 적으면 기본은 라운드 로빈이다. `weight`, `least_conn`, `hash … consistent`로 방식을 바꾼다.
- 오픈 소스판은 수동 검사다. `max_fails`·`fail_timeout`으로 실패한 서버를 잠시 빼고, 실패한 요청은 다음 서버로 다시 보낸다.
- 멱등하지 않은 요청은 기본으로 다시 보내지 않는다. 재시도 횟수와 시간을 묶어 둔다.
- 뒤 서버와의 연결 재사용은 `keepalive` + HTTP/1.1 + 빈 Connection 헤더가 함께 있어야 한다.

## 더 알아보기
- 이전 글: 5편 「리버스 프록시: proxy_pass와 헤더, 시간 제한」
- 다음 글: 7편 「HTTPS와 HTTP/2: 인증서, 리다이렉트, HSTS」
