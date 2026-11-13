# [Nginx 웹 서버 5/10] 리버스 프록시: proxy_pass와 헤더, 시간 제한

> **한 줄 요약** — `proxy_pass`는 요청을 뒤의 애플리케이션 서버로 넘기는데, 주소 뒤에 경로를 붙이느냐에 따라 넘기는 경로가 달라지고, 원래의 Host와 클라이언트 주소는 헤더로 직접 실어 줘야 하며, 뒤 서버가 죽으면 502, 제때 답하지 않으면 504가 된다.

## 이 글에서 다루는 것
- 왜 앱 서버 앞에 Nginx를 두나
- `proxy_pass`와 경로: 끝에 `/`를 붙이면 생기는 일
- 원래 요청 정보 넘기기: Host, X-Forwarded-For, X-Forwarded-Proto
- 시간 제한과 502·504
- 웹소켓과 스트리밍 응답을 위한 설정

## 왜 앞에 두나
파이썬·자바·노드 애플리케이션 서버도 HTTP를 직접 받을 수 있다. 그런데 대개는 그 앞에 Nginx를 둔다. 느린 클라이언트의 연결을 수천 개 붙잡는 일(1편), TLS(7편), 정적 파일(3편), 압축과 캐시(8편), 속도 제한(9편)을 Nginx가 맡으면, 앱 서버는 빠르게 도착한 완성된 요청만 처리하면 된다. 웹 앱의 원리 18편에서 파이썬으로 흉내 낸 리버스 프록시를 이번에는 Nginx로 만든다. 먼저 받은 요청의 경로와 헤더를 그대로 돌려주는 작은 앱을 띄운다. `/slow`는 3초 뒤에 답한다.
```python
# 파일: app.py
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class App(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/slow':
            time.sleep(3)
        seen = {'path': self.path,
                'host': self.headers.get('Host'),
                'x-forwarded-for': self.headers.get('X-Forwarded-For'),
                'x-forwarded-proto': self.headers.get('X-Forwarded-Proto')}
        body = (json.dumps(seen) + '\n').encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 9001), App).serve_forever()
```

## proxy_pass와 경로
`proxy_pass` 뒤의 주소에 **경로가 없으면** 요청 경로를 그대로 넘기고, **경로가 있으면**(끝의 `/` 하나도 경로다) location이 맞춘 부분을 그 경로로 바꿔 넘긴다. 3편의 `root`와 `alias`의 관계와 같다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log logs/access.log;
    upstream app { server 127.0.0.1:9001; }

    server {
        listen 127.0.0.1:8080;
        server_name shop.localhost;

        location /as-is/ {
            proxy_pass http://app;                 # 경로 없음: /as-is/items 그대로
        }
        location /api/ {
            proxy_pass http://app/;                # 경로 "/": /api/items → /items
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 1s;                 # 1초 안에 답이 없으면 포기
        }
        location /down/ {
            proxy_pass http://127.0.0.1:9002/;     # 아무도 듣지 않는 포트
        }
    }
}
```
```bash
mkdir -p logs
python3 app.py &
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
curl -s -H 'Host: shop.localhost' $U/as-is/items
curl -s -H 'Host: shop.localhost' -H 'X-Forwarded-For: 203.0.113.9' $U/api/items?page=2
```
```text
{"path": "/as-is/items", "host": "app", "x-forwarded-for": null, "x-forwarded-proto": null}
{"path": "/items?page=2", "host": "shop.localhost", "x-forwarded-for": "203.0.113.9, 127.0.0.1", "x-forwarded-proto": "http"}
```
첫 줄을 보자. 경로는 그대로 넘어갔지만, 앱이 본 `Host`는 사용자가 보낸 `shop.localhost`가 아니라 `app`(upstream 이름)이다. Nginx는 기본으로 `proxy_pass`에 적힌 이름을 Host로 보내기 때문이다. 앱이 Host로 링크를 만들거나 사이트를 구분한다면 엉뚱하게 동작한다. 클라이언트 주소도 사라졌다. 앱이 보기에는 모든 요청이 Nginx(127.0.0.1)에서 온다.

둘째 줄은 헤더를 챙긴 경우다. `/api/`가 떨어져 `/items?page=2`가 넘어갔고, `Host`는 원래 이름, `X-Forwarded-For`는 들어온 값에 Nginx가 본 클라이언트 주소를 덧붙인 목록, `X-Forwarded-Proto`는 원래 스킴이다. 앱은 이 헤더로 진짜 클라이언트 주소와 HTTPS 여부를 안다. 단, `X-Forwarded-For`의 앞쪽 값은 클라이언트가 마음대로 써 보낼 수 있다(위에서 `203.0.113.9`를 직접 넣었다). 앱은 자기가 믿는 프록시가 덧붙인 마지막 값만 믿어야 하고, Nginx의 `real_ip` 모듈로 믿을 프록시 목록을 정해 정리할 수도 있다. 2편에서 본 대로 `proxy_set_header`도 안쪽 블록에서 하나만 써도 바깥 것을 모두 잃으므로, 공통 헤더는 파일로 빼서 `include`하는 편이 안전하다.

## 시간 제한과 502·504
뒤의 서버에 문제가 생기면 Nginx는 상태 코드로 알린다(웹 앱의 원리 9편).
```bash
curl -s -o /dev/null -w '느린 앱(3초) → %{http_code}, %{time_total}초쯤\n' -H 'Host: shop.localhost' $U/api/slow | sed -E 's/[0-9]+\.[0-9]+초쯤/1초쯤/'
curl -s -o /dev/null -w '죽은 앱 → %{http_code}\n' $U/down/items
grep -oE 'upstream timed out|Connection refused' logs/error.log
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
느린 앱(3초) → 504, 1초쯤
죽은 앱 → 502
upstream timed out
Connection refused
```
- **504 Gateway Timeout**: 앱이 연결은 받았지만 `proxy_read_timeout`(기본 60초) 안에 답하지 않았다. 여기서는 1초로 줄여 3초짜리 요청이 1초 만에 504가 되었다.
- **502 Bad Gateway**: 앱에 연결조차 못 했거나(꺼짐, 포트 틀림) 앱이 이상한 응답을 보냈다.

오류 로그에는 원인이 그대로 적힌다. 10편에서 이 둘을 진단하는 순서를 정리한다. 시간 제한은 길수록 좋은 것이 아니다. 느린 앱을 60초씩 기다리면 Nginx와 앱 양쪽에 연결이 쌓인다(웹 앱의 원리 19편의 연쇄 장애). 정말 오래 걸리는 일은 시간 제한을 늘리기보다 접수와 처리를 나누는 편이 낫다(웹 앱의 원리 14편).

## 웹소켓과 스트리밍
두 가지 특별한 경우가 있다.
- **웹소켓**(웹 앱의 원리 13편): HTTP/1.1의 `Upgrade` 요청이 앱까지 가야 한다. `proxy_http_version 1.1;`과 함께 `proxy_set_header Upgrade $http_upgrade;`, `proxy_set_header Connection "upgrade";`를 그 location에 넣는다. 오래 열려 있으므로 `proxy_read_timeout`도 넉넉히 준다.
- **스트리밍 응답**(SSE, 토큰을 흘리는 응답): Nginx는 기본으로 앱의 응답을 버퍼에 모았다가 보낸다(`proxy_buffering on`). 느린 클라이언트로부터 앱을 빨리 놓아주려는 좋은 기본값이지만, 스트림은 버퍼에 막혀 한참 뒤에 한꺼번에 도착한다. 그 location에서 `proxy_buffering off;`를 주거나 앱이 응답 헤더 `X-Accel-Buffering: no`를 보낸다.

## 흔한 오해
- "`proxy_pass http://app;`과 `http://app/;`은 같다": 끝의 `/`가 경로라서 location 부분을 떼고 넘긴다. 경로가 하나씩 어긋나는 404의 흔한 원인이다.
- "프록시를 거쳐도 앱은 원래 Host와 클라이언트 IP를 안다": Nginx가 헤더로 넘겨주지 않으면 모른다. 넘겨받은 헤더도 믿을 프록시가 붙인 값만 믿어야 한다.
- "504가 나면 시간 제한을 늘리면 된다": 원인(느린 쿼리, 막힌 의존 서비스)은 그대로이고 연결만 쌓인다. 먼저 왜 느린지 본다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 파이썬으로 만든 프록시가 하던 일(X-Forwarded-For, 헬스 체크)을 Nginx 설정으로 다시 본다.
- 웹 앱의 원리 13편 「실시간 통신: 폴링, 서버 전송 이벤트, 웹소켓」: 프록시 뒤에서 웹소켓과 SSE가 끊기거나 늦게 도착하는 이유가 위의 두 설정이다.
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: Nginx 컨테이너가 서비스 이름으로 앱 컨테이너를 찾아 `proxy_pass`하는 구성이 흔하다.

## 정리
- 리버스 프록시는 느린 연결, TLS, 정적 파일, 압축을 앞에서 맡아 앱 서버를 가볍게 한다.
- `proxy_pass` 주소에 경로가 있으면 location 부분을 바꿔 넘기고, 없으면 그대로 넘긴다.
- Host, X-Forwarded-For, X-Forwarded-Proto를 직접 넘긴다. 앞쪽 X-Forwarded-For는 클라이언트가 위조할 수 있다.
- 앱이 죽으면 502, 제때 답하지 않으면 504다. 웹소켓은 Upgrade 헤더, 스트림은 버퍼링 끄기가 필요하다.

## 더 알아보기
- 이전 글: 4편 「location 매칭: 접두사, 정확히, 정규식의 우선순위」
- 다음 글: 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」
