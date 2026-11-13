# [Nginx 웹 서버 8/10] 캐시와 압축: proxy_cache, gzip, 만료 헤더

> **한 줄 요약** — Nginx는 앱의 응답을 디스크 캐시에 저장해 같은 요청에 앱을 부르지 않고 답할 수 있고(`proxy_cache`), 캐시가 빈 순간 몰린 요청을 하나만 보내며(`proxy_cache_lock`), 글자 응답을 gzip으로 줄이고, 정적 파일에 `expires`로 브라우저 캐시 수명을 붙여 원본까지 오는 트래픽을 단계마다 줄인다.

## 이 글에서 다루는 것
- 프록시 캐시: `proxy_cache_path`, `proxy_cache_valid`, 캐시 상태 헤더
- 캐시가 빈 순간의 폭주 막기: `proxy_cache_lock`
- 무엇을 캐시하면 안 되나: 쿠키와 로그인
- gzip 압축 켜기
- 정적 파일의 만료 헤더

## 프록시 캐시
웹 앱의 원리 16편에서 CDN은 사용자 가까이에 둔 공유 캐시였다. Nginx도 같은 일을 할 수 있다. 앱의 응답을 디스크(와 메모리의 키 목록)에 저장해 두고, 유효한 동안 같은 요청에는 앱을 부르지 않는다. Redis 실무 4편의 캐시 어사이드가 앱 코드 안의 캐시라면, 이것은 앱 앞의 캐시다. 상품 목록을 0.3초 걸려 만드는 앱을 띄운다. 경로마다 몇 번 불렸는지 센다.
```python
# 파일: app.py
import json, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

calls, guard = {}, threading.Lock()
PRODUCTS = json.dumps([{'id': i, 'name': f'상품 {i}', 'price': 1000 + i} for i in range(80)],
                      ensure_ascii=False).encode()

class App(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/calls':                      # 몇 번 불렸나(캐시를 거치지 않고 직접 묻는다)
            body = json.dumps(calls).encode()
        else:
            with guard:
                calls[self.path] = calls.get(self.path, 0) + 1
            time.sleep(0.3)                            # 느린 쿼리 흉내
            body = PRODUCTS
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 9001), App).serve_forever()
```
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log off;
    proxy_cache_path cache levels=1:2 keys_zone=app:10m max_size=100m inactive=10m;

    gzip on;
    gzip_types application/json text/css application/javascript;
    gzip_min_length 256;
    gzip_vary on;

    server {
        listen 127.0.0.1:8080;

        location /products/ {
            proxy_pass http://127.0.0.1:9001;
            proxy_cache app;
            proxy_cache_valid 200 30s;                    # 200 응답을 30초 보관
            proxy_cache_lock on;                          # 빈 캐시를 채우는 요청은 하나만
            proxy_cache_use_stale error timeout updating; # 앱이 아프면 낡은 사본이라도
            add_header X-Cache $upstream_cache_status;
        }
        location /nocache/ {
            proxy_pass http://127.0.0.1:9001;
        }
        location ~* "\.[0-9a-f]{6}\.(js|css)$" {          # 지문 넣은 정적 파일({ }가 있으면 따옴표)
            root static;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```
```bash
mkdir -p logs static
python3 app.py &
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
for i in 1 2 3; do
  curl -s -o /dev/null -w '%{time_total} ' -D head.txt $U/products/list
  grep -i '^x-cache' head.txt | tr -d '\r'
done | awk '{ printf "%s (%s)\n", $3, ($1 >= 0.3 ? "0.3초 이상" : "0.05초 미만") }'
curl -s http://127.0.0.1:9001/calls; echo
```
```text
MISS (0.3초 이상)
HIT (0.05초 미만)
HIT (0.05초 미만)
{"/products/list": 1}
```
첫 요청은 캐시에 없어(`MISS`) 앱까지 가서 0.3초가 걸렸고, 그 응답이 저장되어 다음 두 요청은 앱을 부르지 않고(`HIT`) 바로 나갔다. 앱은 한 번만 불렸다. `X-Cache` 헤더로 보이는 `$upstream_cache_status`는 이 밖에도 `EXPIRED`(유효 기간이 지나 다시 받음), `STALE`(낡은 사본으로 답함), `UPDATING`, `BYPASS` 같은 값을 가진다. 디버깅과 적중률 측정에 아주 유용하다.

## 캐시가 빈 순간의 폭주
Redis 실무 4편에서 본 캐시 폭주가 여기서도 생긴다. 인기 페이지의 캐시가 비어 있는 순간 요청 수십 개가 동시에 오면 모두 앱으로 간다. `proxy_cache_lock on`은 같은 키에 대해 첫 요청만 앱으로 보내고, 나머지는 그 응답이 캐시에 들어올 때까지 기다리게 한다. 캐시하지 않는 경로(`/nocache/`)와 비교해 10개를 동시에 보낸다.
```bash
burst() { pids=(); for i in $(seq 10); do curl -s -o /dev/null "$1" & pids+=($!); done; wait "${pids[@]}"; }
burst $U/products/hot          # 동시에 10개
burst $U/nocache/hot
curl -s http://127.0.0.1:9001/calls; echo
```
```text
{"/products/list": 1, "/products/hot": 1, "/nocache/hot": 10}
```
캐시와 잠금이 있는 경로는 동시 요청 10개에 앱이 한 번 불렸고, 없는 경로는 열 번 다 불렸다. `proxy_cache_use_stale … updating`을 함께 주면 유효 기간이 지난 뒤에도 새 사본을 받는 동안 낡은 사본으로 답해, 만료 순간의 지연까지 숨길 수 있다. 앱이 죽었을 때(`error timeout`) 낡은 사본으로 버티는 것도 같은 지시어다.

## 무엇을 캐시하면 안 되나
공유 캐시의 가장 큰 사고는 한 사용자의 화면을 다른 사용자에게 보여 주는 것이다(웹 앱의 원리 16편). Nginx는 기본으로 `Set-Cookie`가 있는 응답이나 `Cache-Control: private`·`no-store` 응답을 캐시하지 않는다. 그래도 캐시 키(`proxy_cache_key`, 기본은 스킴+호스트+경로+쿼리)에 사용자가 들어 있지 않다는 점을 기억하자. 로그인 사용자의 요청은 `proxy_cache_bypass $http_authorization $cookie_session;`처럼 캐시를 건너뛰게 하고, 공개 페이지에만 캐시를 건다. 앱이 응답에 `Cache-Control`을 정확히 붙이는 것이 가장 확실하다.

## gzip 압축
위 설정은 http 단계에서 gzip을 켜 두었다. `gzip_types`에 적은 형식만 압축하고(HTML은 기본으로 포함), `gzip_min_length`보다 작은 응답은 건너뛰며, `gzip_vary`로 `Vary: Accept-Encoding`을 붙인다(웹 앱의 원리 17편).
```bash
curl -s -o /dev/null -w '압축 없이: %{size_download}바이트\n' $U/products/list
curl -s --compressed -o /dev/null -w 'gzip으로: %{size_download}바이트\n' $U/products/list
curl -s --compressed -D - -o /dev/null $U/products/list | grep -iE '^(content-encoding|vary)' | tr -d '\r'
```
```text
압축 없이: 3820바이트
gzip으로: 590바이트
Vary: Accept-Encoding
Content-Encoding: gzip
```
캐시에서 나온 응답도 요청마다 압축된다. CPU를 아끼려면 정적 파일은 미리 `.gz` 파일을 만들어 두고 `gzip_static on;`으로 그 파일을 그대로 보내게 할 수 있다.

## 정적 파일의 만료 헤더
마지막 location은 이름에 지문이 들어간 파일(`app.3f9a1c.js`)에 1년짜리 수명을 준다. `expires 1y`는 `Expires`와 `Cache-Control: max-age=31536000`을 붙인다.
```bash
printf 'console.log(1)\n' > static/app.3f9a1c.js
curl -sI $U/app.3f9a1c.js | grep -iE '^cache-control' | tr -d '\r'
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
Cache-Control: max-age=31536000
Cache-Control: public, immutable
```
`Cache-Control` 줄이 두 개 나갔다. 브라우저는 둘을 합쳐 읽는다. 이 파일들은 브라우저가 1년 동안 다시 묻지 않고, 내용이 바뀌면 이름이 바뀌므로 문제없다. 그 이름을 담은 HTML은 짧게 두거나 매번 확인하게 한다(웹 앱의 원리 16편의 지문 넣은 파일 이름).

## 흔한 오해
- "프록시 캐시는 켜기만 하면 안전하다": 캐시 키에는 사용자가 없다. 로그인 응답이 쿠키 없이 나가는 앱이라면 남의 화면이 캐시될 수 있다. 공개 경로에만 켜고, 앱이 `Cache-Control`을 정확히 붙인다.
- "캐시가 있으면 폭주는 없다": 비어 있거나 만료된 순간이 문제다. `proxy_cache_lock`과 `proxy_cache_use_stale updating`이 그 순간을 막는다.
- "압축은 모든 응답에 걸면 좋다": 이미 압축된 이미지·동영상에는 CPU만 쓰고, 아주 작은 응답은 이득이 없다. 형식과 최소 길이를 정한다.

## 어디에 쓰이나
- 웹 앱의 원리 16편 「다시 받지 않기: 브라우저 캐시, ETag, CDN」: 공유 캐시, Vary, 지문 넣은 파일 이름의 원리를 HTTP 쪽에서 설명한다.
- Redis 실무 4편 「캐시로 쓰기: 캐시 어사이드, TTL, 메모리 정책」: 앱 안의 캐시에서 같은 폭주 문제를 `SET NX` 잠금으로 막는 방법과 비교할 수 있다.
- 웹 앱의 원리 17편 「작게 보내기: 압축, 코드 분할, 페이지네이션」: 무엇이 잘 압축되고 왜 그런지를 실험으로 본다.

## 정리
- `proxy_cache_path`로 캐시 저장소를, `proxy_cache`·`proxy_cache_valid`로 무엇을 얼마나 보관할지 정한다. `$upstream_cache_status`로 적중을 확인한다.
- `proxy_cache_lock`은 빈 캐시를 채우는 요청을 하나로, `proxy_cache_use_stale`은 만료·장애 순간을 낡은 사본으로 막는다.
- 사용자별 응답은 캐시하지 않는다. 쿠키·Authorization 요청은 건너뛰게 한다.
- gzip은 글자 형식에만, 정적 지문 파일에는 `expires 1y`와 `immutable`을 준다.

## 더 알아보기
- 이전 글: 7편 「HTTPS와 HTTP/2: 인증서, 리다이렉트, HSTS」
- 다음 글: 9편 「속도 제한과 접근 제어: limit_req, limit_conn, allow와 deny」
