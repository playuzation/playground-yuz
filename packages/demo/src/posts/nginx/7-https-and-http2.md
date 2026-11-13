# [Nginx 웹 서버 7/10] HTTPS와 HTTP/2: 인증서, 리다이렉트, HSTS

> **한 줄 요약** — Nginx에 인증서와 개인키를 주고 `listen … ssl`로 HTTPS를 켜면 TLS를 앞에서 끝내고 뒤로는 평문으로 넘길 수 있으며, 80번의 HTTP 요청은 301로 HTTPS에 보내고, HSTS 헤더로 브라우저가 다음부터 처음부터 HTTPS로 오게 만들고, 같은 연결 위에서 HTTP/2를 켠다.

## 이 글에서 다루는 것
- TLS 종료: 왜 Nginx에서 HTTPS를 끝내나
- 인증서·개인키 설정과 프로토콜 제한
- HTTP/2 켜기(버전에 따른 문법 차이)
- HTTP → HTTPS 리다이렉트와 HSTS
- 인증서 갱신과 다시 읽기

## TLS 종료
웹 앱의 원리 10편에서 TLS의 원리와 인증서를 봤다. 실무에서는 대개 앱 서버마다 인증서를 두지 않고, 맨 앞의 Nginx(또는 로드 밸런서)가 TLS를 끝내고(**TLS 종료**, TLS termination), 안쪽으로는 평문 HTTP로 넘긴다. 인증서 갱신을 한 곳에서 하고, 앱은 TLS를 몰라도 된다. 대신 안쪽 네트워크를 믿을 수 있어야 하고, 앱은 원래 요청이 HTTPS였는지를 5편의 `X-Forwarded-Proto` 헤더로 안다.

## 인증서 만들기
실습용으로 웹 앱의 원리 10편처럼 이 컴퓨터에서만 쓰는 장난감 인증 기관을 만들고, `localhost` 인증서에 서명한다. 실제 서비스에서는 Let's Encrypt 같은 인증 기관에서 받는다.
```bash
mkdir -p logs
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt \
  -days 30 -subj '/CN=Toy Local CA' 2>/dev/null
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj '/CN=localhost' 2>/dev/null
printf 'subjectAltName=DNS:localhost\n' > san.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 30 -extfile san.ext 2>/dev/null
ls server.*
```
```text
server.crt
server.csr
server.key
```

## HTTPS와 HTTP/2 설정
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log logs/access.log;

    server {                                         # HTTP는 HTTPS로 보내기만 한다
        listen 127.0.0.1:8080;
        server_name localhost;
        return 301 https://$host:8443$request_uri;
    }

    server {
        listen 127.0.0.1:8443 ssl http2;             # 1.25.1부터는 "http2 on;"을 따로 쓴다
        server_name localhost;

        ssl_certificate     server.crt;
        ssl_certificate_key server.key;
        ssl_protocols       TLSv1.2 TLSv1.3;         # 오래된 SSL·TLS 1.0·1.1은 끈다
        ssl_session_cache   shared:SSL:10m;          # 다시 접속할 때 핸드셰이크를 줄인다

        add_header Strict-Transport-Security "max-age=31536000" always;

        location / {
            return 200 "secure hello over $server_protocol\n";
        }
    }
}
```
```bash
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
curl -sI http://localhost:8080/orders?id=7 | grep -iE '^(HTTP|location)'
curl -s --cacert ca.crt https://localhost:8443/
curl -sI --cacert ca.crt https://localhost:8443/ | grep -iE '^(HTTP|strict-transport)'
curl -sv --cacert ca.crt https://localhost:8443/ -o /dev/null 2>&1 | grep -E 'SSL connection|ALPN: server'
```
```text
HTTP/1.1 301 Moved Permanently
Location: https://localhost:8443/orders?id=7
secure hello over HTTP/2.0
HTTP/2 200
strict-transport-security: max-age=31536000
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / …
* ALPN: server accepted h2
```
- HTTP로 온 요청은 경로와 쿼리를 그대로 붙여 HTTPS 주소로 301 리다이렉트되었다. `$request_uri`가 원래의 경로와 쿼리다.
- HTTPS에서는 TLS 1.3으로 연결되었고, TLS 핸드셰이크 중의 **ALPN** 협상으로 HTTP/2(`h2`)가 골라졌다. HTTP/2 응답의 헤더 이름은 소문자로 나간다.
- 허용하지 않은 옛 프로토콜로는 연결되지 않는다.
```bash
curl -s --cacert ca.crt --tls-max 1.1 https://localhost:8443/ -o /dev/null; echo "TLS 1.1 시도 → 종료 코드 $?"
```
```text
TLS 1.1 시도 → 종료 코드 35
```
종료 코드 35는 curl의 "TLS 핸드셰이크 실패"다.

## HSTS: 처음부터 HTTPS로
301 리다이렉트만으로는 빈틈이 있다. 사용자가 주소창에 `example.com`만 치면 브라우저는 먼저 HTTP로 요청하고, 그 첫 요청은 암호화되지 않아 중간에서 가로채 가짜 페이지로 보낼 수 있다. **HSTS**(HTTP Strict Transport Security) 헤더 `Strict-Transport-Security: max-age=31536000`을 받은 브라우저는 그 기간(1년) 동안 이 도메인에는 HTTP 요청을 아예 보내지 않고 스스로 HTTPS로 바꿔 접속한다. 강력한 만큼 조심해야 한다. 하위 도메인까지 묶는 `includeSubDomains`를 붙였는데 HTTPS가 안 되는 하위 도메인이 있으면, 그 사이트는 기간 동안 열리지 않는다. 처음에는 짧은 `max-age`로 시작해 늘려 간다. `always`는 오류 응답에도 헤더를 붙이라는 뜻이다(2편).

## 인증서 갱신과 다시 읽기
Let's Encrypt의 인증서는 수명이 90일이라 자동 갱신이 필수다. certbot 같은 ACME 클라이언트가 인증서 파일을 새로 쓰고, Nginx에 `nginx -s reload`를 보내면 새 워커가 새 인증서로 핸드셰이크한다(2편). 연결은 끊기지 않는다. 갱신 실패를 놓치면 만료일에 모든 사용자가 경고 화면을 보게 되므로, 만료일까지 남은 날짜를 감시해 둔다.
```bash
openssl s_client -connect localhost:8443 -servername localhost -CAfile ca.crt </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
subject=CN = localhost
issuer=CN = Toy Local CA
```
`openssl s_client`로 서버가 실제로 내미는 인증서를 확인할 수 있다. 갱신한 뒤 새 인증서가 나가는지 볼 때 쓴다. 성능 면에서는 `ssl_session_cache`로 다시 접속한 클라이언트의 핸드셰이크를 줄이고, HTTP/2로 연결 하나에 요청을 섞어(웹 앱의 원리 15편) 왕복을 아낀다. Nginx 1.25부터는 QUIC 위의 HTTP/3도 켤 수 있다.

## 흔한 오해
- "앞에서 TLS를 끝내면 안쪽은 아무래도 좋다": 안쪽 네트워크가 다른 사람과 공유되거나 클라우드의 여러 구역을 지나면 안쪽도 암호화해야 한다(`proxy_pass https://…`).
- "HSTS는 켜기만 하면 된다": 한 번 받은 브라우저는 기간 동안 HTTP로 돌아가지 못한다. HTTPS 준비가 끝난 도메인에, 짧은 기간부터 적용한다.
- "TLS 설정은 최신 프로토콜만 켜면 끝이다": 인증서 체인 누락(중간 인증서를 빠뜨린 `ssl_certificate`)과 만료가 실제 장애의 더 흔한 원인이다. `fullchain` 파일을 쓰고 만료를 감시한다.

## 어디에 쓰이나
- 웹 앱의 원리 10편 「HTTPS와 TLS: 암호화, 인증서, 핸드셰이크」: 이 글의 설정이 기대는 핸드셰이크, 인증서, 신뢰의 사슬을 원리부터 설명한다.
- 웹 앱의 원리 15편 「연결을 아끼는 HTTP의 진화: keep-alive, HTTP/2, HTTP/3」: ALPN으로 고른 HTTP/2가 무엇을 바꾸는지 실험과 함께 본다.
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 개인키 같은 비밀을 이미지에 넣지 않고 Nginx 컨테이너에 전달하는 방법이다.

## 정리
- Nginx가 TLS를 끝내면 인증서를 한곳에서 관리하고 앱은 평문만 다룬다.
- `ssl_certificate`·`ssl_certificate_key`·`ssl_protocols`로 HTTPS를 켜고, `http2`로 HTTP/2를 켠다(1.25.1부터 `http2 on;`).
- HTTP는 `$request_uri`를 붙여 301로 HTTPS에 보내고, HSTS로 다음부터 처음부터 HTTPS로 오게 한다.
- 인증서는 자동 갱신과 `reload`, 만료 감시가 짝이다.

## 더 알아보기
- 이전 글: 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」
- 다음 글: 8편 「캐시와 압축: proxy_cache, gzip, 만료 헤더」
