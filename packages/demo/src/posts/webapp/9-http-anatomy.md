# [웹 앱의 원리 9/20] HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더

> **한 줄 요약** — HTTP 요청은 "메서드 경로 버전" 한 줄, 헤더 몇 줄, 빈 줄, 본문으로 이루어진 글자이고, 응답은 세 자리 상태 코드로 결과를 알리며, 메서드마다 정해진 약속(안전한가, 반복해도 같은가)이 캐시·재시도·프록시가 안심하고 일할 바탕이 된다.

## 이 글에서 다루는 것
- 요청과 응답의 생김새: 시작 줄, 헤더, 빈 줄, 본문
- HTTP의 버전들과 변하지 않은 뜻
- 메서드: GET, POST, PUT, DELETE와 안전성·멱등성
- 상태 코드의 다섯 묶음
- 직접 해 보기: 소켓으로 요청을 손으로 쓰기, Host 헤더 하나로 사이트 둘 운영하기, 메서드마다 다른 결과

## 요청과 응답의 생김새
7편에서 TCP는 메시지의 경계를 기억하지 않는다고 했다. HTTP는 그 바이트 흐름 위에 경계를 정한다. 요청은 이렇게 생겼다.
```text
GET /items/1 HTTP/1.1   ← 1
Host: shop.localhost    ← 2
Accept: text/plain      ← 2
                        ← 3
(body, if any)          ← 4
```
1은 시작 줄, 2는 헤더, 3은 빈 줄, 4는 본문이다. 시작 줄은 **메서드**(무엇을 할지), **경로**(어떤 자원에), **버전**이다. 그 아래 `이름: 값` 형식의 **헤더**가 이어지고, 빈 줄이 헤더의 끝을 알린다. 본문이 있으면 그 길이를 `Content-Length` 헤더로 미리 알려 준다. 응답도 같은 모양이고 첫 줄만 다르다. `HTTP/1.1 200 OK`처럼 버전, **상태 코드**, 설명이 온다.

HTTP는 1991년의 0.9(GET 한 가지, 헤더 없음)에서 출발해 1996년 1.0(RFC 1945, 헤더와 상태 코드), 1999년 1.1(RFC 2616)로 자랐다. 2022년 6월에는 메서드·상태 코드·헤더의 **뜻**을 정한 RFC 9110과, 그 뜻을 각 버전의 바이트로 실어 나르는 방법을 정한 문서들로 다시 정리되었다. HTTP/2와 HTTP/3(15편)은 글자 대신 바이너리 프레임을 쓰지만 이 글의 메서드·상태 코드·헤더는 그대로다.

## 메서드와 두 가지 약속
| 메서드 | 하는 일 | 약속 |
| --- | --- | --- |
| GET | 자원을 읽는다 | 안전, 멱등 |
| HEAD | 헤더만 읽는다 | 안전, 멱등 |
| POST | 새로 만들거나 처리를 맡긴다 | 둘 다 아님 |
| PUT | 이 내용으로 통째로 바꾼다 | 멱등 |
| PATCH | 일부를 고친다 | 보장 안 됨 |
| DELETE | 지운다 | 멱등 |

**안전**(safe)은 "서버의 상태를 바꾸지 않는다"는 약속이다. 그래서 브라우저가 링크를 미리 불러오거나 검색 로봇이 마음대로 따라가도 된다. **멱등**(idempotent)은 "한 번 보내든 열 번 보내든 서버의 최종 상태가 같다"는 약속이다. 네트워크가 끊겨 응답을 못 받았을 때, 멱등인 요청은 프록시나 클라이언트가 걱정 없이 다시 보낼 수 있다. POST는 둘 다 아니라서 다시 보내면 주문이 두 번 생길 수 있다. 결제 화면에서 새로 고침을 하면 브라우저가 "다시 보낼까요?"라고 묻는 이유이고, 이 문제를 푸는 멱등 키는 14편에서 다룬다. 약속은 서버가 지켜야 의미가 있다. GET 요청으로 데이터를 지우는 서버를 만들면 미리 불러오기 한 번에 데이터가 사라진다.

## 상태 코드의 다섯 묶음
- **1xx** 정보: 계속 보내라(100), 프로토콜을 바꾼다(101, 13편의 웹소켓).
- **2xx** 성공: 200 OK, 201 Created(새로 만들었고 위치는 `Location` 헤더에), 204 No Content(성공했고 돌려줄 본문 없음).
- **3xx** 다른 곳을 보라: 301(영구 이동), 302·307(임시 이동), 304(바뀌지 않았으니 가진 것을 써라, 16편).
- **4xx** 요청이 잘못됐다: 400(형식 오류), 401(누구인지 모른다), 403(누구인지 알지만 권한 없음), 404(없음), 405(이 메서드는 안 된다), 409(충돌), 429(너무 많이 보냈다, 19편).
- **5xx** 서버가 실패했다: 500(내부 오류), 502(뒤의 서버가 이상한 답을 줌), 503(지금 받을 수 없음), 504(뒤의 서버가 제때 답하지 않음).

4xx와 5xx의 구분이 중요하다. 4xx는 "같은 요청을 다시 보내도 소용없다"는 뜻이고, 5xx와 일부 4xx(429)는 "나중에 다시 해 볼 만하다"는 뜻이다. 재시도 로직(14편)과 장애 감시(19편)가 이 구분을 그대로 쓴다.

## 직접 해 보기 1: 요청을 손으로 쓰기
메서드와 상태 코드를 실험할 작은 서버를 띄운다. 요청의 `Host` 헤더에 따라 다른 사이트를 보여 주고, `/items`에서 할 일을 읽고 만들고 바꾸고 지운다. 코드는 훑어만 보자.
```python
# 파일: http_server.py
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITES = {'blog.localhost': '블로그 첫 화면', 'shop.localhost': '쇼핑몰 첫 화면'}
ITEMS = {1: '우유 사기', 2: '책 반납'}

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def reply(self, code, body='', headers=()):
        data = body.encode()
        self.send_response_only(code)            # 날짜·서버 이름 헤더는 생략
        for name, value in headers:
            self.send_header(name, value)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def item_id(self):
        parts = self.path.strip('/').split('/')
        return int(parts[1]) if len(parts) == 2 and parts[0] == 'items' else None

    def body(self):
        return self.rfile.read(int(self.headers['Content-Length'])).decode()

    def do_GET(self):
        if self.path == '/':
            host = self.headers.get('Host', '').split(':')[0]
            return self.reply(200, SITES.get(host, '모르는 사이트'))
        if self.path == '/items':
            return self.reply(200, json.dumps(ITEMS, ensure_ascii=False))
        if self.path == '/old-items':
            return self.reply(301, headers=[('Location', '/items')])
        if self.item_id() in ITEMS:
            return self.reply(200, ITEMS[self.item_id()])
        self.reply(404, '없음')

    def do_POST(self):
        new = max(ITEMS) + 1
        ITEMS[new] = self.body()
        self.reply(201, ITEMS[new], [('Location', f'/items/{new}')])

    def do_PUT(self):
        ITEMS[self.item_id()] = self.body()
        self.reply(200, ITEMS[self.item_id()])

    def do_DELETE(self):
        ITEMS.pop(self.item_id(), None)
        self.reply(204)

    def do_PATCH(self):
        self.reply(405, '지원하지 않음', [('Allow', 'GET, POST, PUT, DELETE')])

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 8009), Handler).serve_forever()
```
```bash
python3 http_server.py &
sleep 1
```
브라우저나 curl 없이 TCP 소켓에 요청 글자를 그대로 써 보낸다. 같은 주소와 포트에 `Host`만 바꿔 두 번 보낸다.
```python
import socket

def raw(host_header):
    request = (f'GET / HTTP/1.1\r\n'
               f'Host: {host_header}\r\n'
               f'Connection: close\r\n'
               f'\r\n').encode()
    with socket.create_connection(('127.0.0.1', 8009)) as s:
        s.sendall(request)
        data = b''
        while chunk := s.recv(4096):
            data += chunk
    return data.decode()

print(raw('blog.localhost'))
print('====')
print(raw('shop.localhost').split('\r\n\r\n')[1])
```
```text
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Length: 20

블로그 첫 화면
====
쇼핑몰 첫 화면
```
응답의 첫 줄, 헤더 두 줄, 빈 줄, 본문이 그대로 보인다. 본문 "블로그 첫 화면"은 한글 여섯 자(18바이트)와 공백 두 개라서 `Content-Length: 20`이다. 받는 쪽은 이 숫자만큼 읽고 메시지가 끝났음을 안다. 두 요청은 같은 IP와 포트로 갔는데 `Host` 헤더 때문에 다른 사이트가 답했다. HTTP/1.1이 `Host`를 필수로 만든 덕분에 서버 한 대, IP 주소 하나로 수많은 사이트를 운영할 수 있다(18편의 리버스 프록시도 이 헤더를 보고 요청을 나눈다).

## 직접 해 보기 2: 메서드마다 다른 결과
curl의 `-X`로 메서드를, `--data`로 본문을 정하고, `-w '%{http_code}'`로 상태 코드만 찍는다.
```bash
U=http://127.0.0.1:8009
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "POST 두 번: $(code -X POST --data '운동' $U/items) $(code -X POST --data '운동' $U/items)"
curl -s $U/items; echo
echo "PUT 두 번: $(code -X PUT --data '운동 30분' $U/items/3) $(code -X PUT --data '운동 30분' $U/items/3)"
echo "DELETE 두 번: $(code -X DELETE $U/items/4) $(code -X DELETE $U/items/4)"
curl -s $U/items; echo
echo "없는 자원: $(code $U/items/99), PATCH: $(code -X PATCH $U/items/1)"
curl -s -i -X PATCH $U/items/1 | grep -i '^allow'
echo "옛 주소: $(code $U/old-items), 따라가면: $(code -L $U/old-items)"
```
```text
POST 두 번: 201 201
{"1": "우유 사기", "2": "책 반납", "3": "운동", "4": "운동"}
PUT 두 번: 200 200
DELETE 두 번: 204 204
{"1": "우유 사기", "2": "책 반납", "3": "운동 30분"}
없는 자원: 404, PATCH: 405
Allow: GET, POST, PUT, DELETE
옛 주소: 301, 따라가면: 200
```
POST를 두 번 보냈더니 "운동"이 두 개(3번, 4번) 생겼다. 멱등이 아니기 때문이다. PUT은 두 번 보내도 3번이 "운동 30분"인 상태 하나로 끝났고, DELETE도 두 번째는 이미 없는 것을 지울 뿐 결과는 같다. 405 응답의 `Allow` 헤더는 "대신 이것들은 된다"고 알려 준다. 301을 받은 curl은 `-L`을 주면 `Location`을 따라가 200을 받는다. 브라우저는 이것을 자동으로 한다.

## 자주 보는 헤더
- `Content-Type`: 본문의 형식(`application/json`, `text/html; charset=utf-8`). 받는 쪽은 이것을 보고 해석한다(1편).
- `Accept`, `Accept-Language`, `Accept-Encoding`: 클라이언트가 원하는 형식·언어·압축 방식(17편).
- `Authorization`, `Cookie`, `Set-Cookie`: 누구인지 알리고 기억하게 하기(11편).
- `Cache-Control`, `ETag`, `If-None-Match`: 다시 받지 않기 위한 약속(16편).
- `User-Agent`: 어떤 프로그램이 보냈는지. 통계에 쓰이지만 마음대로 바꿀 수 있어 믿을 근거는 아니다.

## 흔한 오해
- "200이 아니면 실패다": 201, 204, 304도 정상이다. 반대로 오류를 200 본문에 담아 보내는 API는 재시도와 캐시와 감시 도구를 모두 헷갈리게 한다.
- "401과 403은 같은 말이다": 401은 "누구인지 증명하라"(로그인 필요), 403은 "누구인지는 알지만 허락할 수 없다"다.
- "GET에도 본문을 넣으면 된다": 명세상 뜻이 정해져 있지 않아 프록시나 서버가 버리거나 거부할 수 있다. 조건은 경로나 쿼리 문자열에 담는다.

## 어디에 쓰이나
- GitHub 협업과 자동화 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」: 실제 서비스의 API를 메서드와 상태 코드로 다루는 예가 가득하다.
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: 헬스 체크는 대개 HTTP 요청 하나를 보내 상태 코드가 2xx인지 보는 일이다.
- PostgreSQL 실무 3편 「제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약」: 중복 생성 같은 충돌은 결국 데이터베이스 제약에서 걸리고, API는 그것을 409로 알린다.

## 정리
- HTTP 메시지는 시작 줄, 헤더, 빈 줄, 본문이다. `Content-Length`가 본문의 경계를 정한다.
- 버전이 바뀌어도 메서드·상태 코드·헤더의 뜻(RFC 9110)은 그대로다.
- 안전한 메서드는 상태를 바꾸지 않고, 멱등한 메서드는 반복해도 결과가 같다. 재시도와 캐시가 이 약속에 기댄다.
- 상태 코드는 2xx 성공, 3xx 다른 곳, 4xx 요청 문제, 5xx 서버 문제로 나뉜다. `Host` 헤더 덕분에 서버 한 대가 여러 사이트를 맡는다.

## 더 알아보기
- 이전 글: 8편 「이름을 주소로 바꾸는 DNS: 질의, 캐시, TTL」
- 다음 글: 10편 「HTTPS와 TLS: 암호화, 인증서, 핸드셰이크」
