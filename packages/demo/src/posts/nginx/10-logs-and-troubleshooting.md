# [Nginx 웹 서버 10/10] 로그와 문제 해결: 접근 로그, 오류 로그, 502와 504

> **한 줄 요약** — 접근 로그에 `$request_time`과 `$upstream_response_time`, `$upstream_addr`를 남겨 두면 느린 요청이 Nginx 탓인지 앱 탓인지, 어느 서버였는지 바로 보이고, 오류 로그는 502·504·413·499 같은 상태 코드의 원인을 문장으로 알려 주므로, 문제 해결은 "상태 코드 → 오류 로그 → 앱"의 순서로 좁혀 가면 된다.

## 이 글에서 다루는 것
- 접근 로그의 형식 만들기: 시간 두 개와 업스트림 주소
- JSON 로그
- 로그로 묻기: 상태 코드 분포, 느린 요청
- 오류 로그 읽기와 등급
- 자주 만나는 상태 코드: 499, 413, 502, 504
- 문제 해결 순서

## 접근 로그에 무엇을 남길까
기본 접근 로그 형식(`combined`)에는 클라이언트 주소, 시각, 요청 줄, 상태 코드, 크기, Referer, User-Agent가 있다. 리버스 프록시로 쓸 때는 여기에 시간이 꼭 필요하다.
- `$request_time`: Nginx가 요청의 첫 바이트를 읽은 순간부터 응답의 마지막 바이트를 보낼 때까지. 클라이언트가 느리면 이 값도 길어진다.
- `$upstream_response_time`: 뒤의 앱이 응답하는 데 걸린 시간. 이것이 길면 앱이 느린 것이다.
- `$upstream_addr`: 어느 백엔드가 처리했는지(6편의 로드 밸런싱).
- `$upstream_cache_status`: 캐시 적중 여부(8편).

두 시간의 차이가 크면 Nginx와 클라이언트 사이(느린 모바일 망, 큰 응답)가, 둘 다 길면 앱이 원인이다. 실습용으로 경로에 따라 빠르게, 느리게, 오류로 답하는 앱을 띄운다.
```python
# 파일: app.py
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class App(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/slow'):
            time.sleep(0.6)
        if self.path.startswith('/boom'):
            self.send_response(500); self.send_header('Content-Length', '0'); self.end_headers()
            return
        body = b'ok\n'
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        self.do_GET()
    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 9001), App).serve_forever()
```
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log warn;
events {}

http {
    log_format timed '$remote_addr "$request" $status $body_bytes_sent '
                     'rt=$request_time urt=$upstream_response_time ua=$upstream_addr';
    log_format json escape=json '{"time":"$time_iso8601","uri":"$uri","status":$status,'
                                '"rt":$request_time,"urt":"$upstream_response_time"}';
    access_log logs/access.log timed;
    access_log logs/access.json json;

    server {
        listen 127.0.0.1:8080;
        client_max_body_size 1m;                 # 이보다 큰 본문은 413
        location / {
            proxy_pass http://127.0.0.1:9001;
            proxy_read_timeout 1s;
        }
        location /dead/ {
            proxy_pass http://127.0.0.1:9002;    # 아무도 듣지 않는다
        }
    }
}
```
```bash
mkdir -p logs
python3 app.py 2>/dev/null &      # 끊긴 연결에 대한 파이썬의 경고는 숨긴다
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
for p in /a /b /slow/1 /a /boom /slow/2 /c; do curl -s -o /dev/null $U$p; done
head -c 2000000 /dev/zero > big.bin
curl -s -o /dev/null -w '큰 본문 업로드: %{http_code}\n' --data-binary @big.bin $U/upload
curl -s -o /dev/null -w '죽은 앱: %{http_code}\n' $U/dead/x
curl -s -o /dev/null --max-time 0.3 $U/slow/3; echo "0.3초 만에 포기한 클라이언트: curl 종료 코드 $?"
sleep 0.5
sed -E 's/(rt|urt)=[0-9.]+/\1=…/g' logs/access.log | head -3
```
```text
큰 본문 업로드: 413
죽은 앱: 502
0.3초 만에 포기한 클라이언트: curl 종료 코드 28
127.0.0.1 "GET /a HTTP/1.1" 200 3 rt=… urt=… ua=127.0.0.1:9001
127.0.0.1 "GET /b HTTP/1.1" 200 3 rt=… urt=… ua=127.0.0.1:9001
127.0.0.1 "GET /slow/1 HTTP/1.1" 200 3 rt=… urt=… ua=127.0.0.1:9001
```
로그 한 줄에 요청, 상태, 크기, 두 시간, 처리한 백엔드가 모두 들어 있다(시간 값은 실행마다 달라 `…`로 가렸다).

## 로그로 묻기
접근 로그는 그 자체로 작은 데이터베이스다. 상태 코드 분포와 가장 느린 요청을 꺼내 본다.
```bash
echo '상태 코드별 요청 수:'
awk '{print $(NF-4)}' logs/access.log | sort | uniq -c | awk '{printf "  %s: %s\n", $2, $1}'
echo '0.5초 넘게 걸린 요청:'
awk '{split($(NF-2), a, "="); if (a[2] > 0.5) print "  " $3, $(NF-4)}' logs/access.log | tr -d '"'
```
```text
상태 코드별 요청 수:
  200: 6
  413: 1
  499: 1
  500: 1
  502: 1
0.5초 넘게 걸린 요청:
  /slow/1 200
  /slow/2 200
```
499는 Nginx만의 코드로, **클라이언트가 응답을 기다리다 먼저 연결을 끊었다**는 뜻이다(위에서 curl이 0.3초 만에 포기했다). 499가 늘면 앱이 사용자의 인내심보다 느리다는 신호다. 413은 본문이 `client_max_body_size`(기본 1MB)보다 커서 앱까지 가지도 못했다. 파일 업로드가 갑자기 실패하면 가장 먼저 의심할 설정이다. 운영에서는 JSON 로그(`logs/access.json`)를 로그 수집기로 보내 같은 질문을 대시보드에서 던진다.
```bash
tail -1 logs/access.json | sed -E 's/"time":"[^"]+"/"time":"…"/; s/"rt":[0-9.]+/"rt":…/'
```
```text
{"time":"…","uri":"/slow/3","status":499,"rt":…,"urt":"…"}
```

## 오류 로그 읽기
오류 로그는 등급(`debug`, `info`, `notice`, `warn`, `error`, `crit`, `alert`, `emerg`)이 붙은 문장이다. `error_log logs/error.log warn;`은 warn 이상만 남긴다. 위의 문제들이 오류 로그에 어떻게 남았는지 원인만 뽑아 본다.
```bash
grep -oE '\[(warn|error)\].*(client intended to send too large body|Connection refused\)|upstream timed out|prematurely closed)' logs/error.log \
  | sed -E 's/\[(warn|error)\] [0-9#]+: \*[0-9]+ /[\1] /; s/ while .*//; s/: [0-9]+ bytes//' | sort -u
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
[error] client intended to send too large body
[error] connect() failed (111: Connection refused)
```
413은 "클라이언트가 너무 큰 본문을 보내려 했다", 502는 "connect() 실패: 연결 거부"로 원인이 그대로 적혀 있다. 5편에서 본 504라면 `upstream timed out`이 남는다.

## 자주 만나는 상태 코드와 첫 질문
| 코드 | 뜻 | 먼저 볼 것 |
| --- | --- | --- |
| 499 | 클라이언트가 먼저 끊음 | 앱 응답 시간, 클라이언트 시간 제한 |
| 413 | 본문이 너무 큼 | 본문 크기 한도 설정 |
| 502 | 앱 연결 실패·이상 응답 | 앱이 떠 있나, 포트, 앱의 오류 로그 |
| 504 | 앱이 제때 답 안 함 | 느린 쿼리, 읽기 시간 제한 |
| 503 | 제한 또는 과부하 | 속도·연결 제한(9편), 앱 상태 |

## 문제 해결 순서
1. **상태 코드**를 본다. 4xx면 요청 쪽, 5xx면 서버 쪽이다. 499·413처럼 Nginx가 직접 만든 코드인지, 앱이 만든 500인지 구분한다(`$upstream_status`를 로그에 넣으면 분명해진다).
2. **오류 로그**에서 같은 시각의 문장을 찾는다. 502·504는 대부분 원인이 문장으로 적혀 있다.
3. **두 시간**을 비교한다. `urt`가 길면 앱, `rt`만 길면 클라이언트 쪽이다.
4. **앱**의 로그와 지표로 넘어간다. 느린 쿼리(PostgreSQL 실무 8편), 꽉 찬 연결 풀, 외부 API 지연.
5. 설정을 바꿨다면 `nginx -t`(2편)를 거쳐 다시 읽고, 같은 질문을 로그에 다시 던져 확인한다.

## 흔한 오해
- "502와 504는 Nginx의 문제다": 대부분 뒤의 앱 문제를 Nginx가 대신 알려 주는 것이다. Nginx 설정을 고치기 전에 앱이 떠 있는지, 왜 느린지를 본다.
- "`$request_time`이 길면 앱이 느리다": 느린 클라이언트와 큰 응답도 이 값을 늘린다. `$upstream_response_time`과 함께 봐야 한다.
- "디버깅할 때는 오류 로그를 debug 등급으로": 로그 양이 폭증해 디스크와 성능을 잡아먹는다. 필요하면 `debug_connection`으로 특정 클라이언트에만 켠다.

## 어디에 쓰이나
- 웹 앱의 원리 20편 「한 번의 클릭이 지나가는 길: 주소창에서 화면까지」: 구간별 시간을 재서 어디가 느린지 좁히는 방법을 클라이언트 쪽에서 본다.
- Prometheus와 Grafana 모니터링 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」: 요청 수·오류율·지연(RED)을 로그 대신 지표로 꾸준히 보는 방법으로 이어진다.
- PostgreSQL 실무 8편 「쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형」: 504의 가장 흔한 뿌리인 느린 쿼리를 찾는 방법이다.

## 정리
- 접근 로그에 `$request_time`, `$upstream_response_time`, `$upstream_addr`를 남긴다. 두 시간의 차이가 원인의 위치를 알려 준다.
- 로그는 awk 몇 줄로도 상태 코드 분포와 느린 요청을 보여 준다. 운영에서는 JSON 로그를 수집한다.
- 499는 클라이언트가 먼저 끊음, 413은 본문 크기, 502는 연결 실패, 504는 시간 초과다. 오류 로그가 원인을 문장으로 적어 준다.
- 상태 코드 → 오류 로그 → 두 시간 → 앱 순서로 좁힌다. 이 시리즈의 1~9편이 각 단계의 도구다.

## 더 알아보기
- 이전 글: 9편 「속도 제한과 접근 제어: limit_req, limit_conn, allow와 deny」
- 처음 글: 1편 「Nginx란: 이벤트 기반 웹 서버와 C10K」
