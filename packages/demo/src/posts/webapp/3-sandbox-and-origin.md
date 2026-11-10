# [웹 앱의 원리 3/20] 설치 없이도 안전한 이유: 샌드박스, 동일 출처 정책, CORS

> **한 줄 요약** — 브라우저는 처음 보는 사이트의 코드를 샌드박스 안에 가둬 내 파일과 장치에 손대지 못하게 하고, 동일 출처 정책으로 한 사이트의 코드가 다른 사이트의 응답을 읽지 못하게 막으며, 서버가 허락한 경우에만 CORS로 그 벽에 문을 연다.

## 이 글에서 다루는 것
- 설치형 프로그램과 웹 페이지의 권한 차이: 샌드박스
- 출처(origin)란 무엇인가: 스킴, 호스트, 포트
- 동일 출처 정책이 막는 것과 막지 않는 것
- CORS와 사전 요청(preflight)
- 직접 해 보기: 출처 비교하기, CORS 헤더를 주고받는 작은 서버

## 질문: 모르는 사이트의 코드를 왜 그냥 실행해도 될까
설치형 프로그램을 실행하면 그 프로그램은 대개 내 사용자 권한을 그대로 가진다. 내 문서 폴더를 읽고, 다른 프로그램을 실행하고, 네트워크로 무엇이든 보낼 수 있다. 그래서 설치 전에 "이 회사를 믿는가"를 따진다. 반면 링크 하나를 누르면 처음 보는 사이트의 자바스크립트가 아무 확인 없이 내 컴퓨터에서 돈다. 이것이 가능한 이유는 브라우저가 페이지의 코드에 처음부터 아주 적은 권한만 주기 때문이다. 설치 과정을 없앤 대가로 권한을 줄였고, 그 덕분에 설치 없이도 비교적 안전하다.

## 샌드박스: 모래 상자 안에서만 놀기
**샌드박스**(sandbox)는 코드가 할 수 있는 일을 정해진 울타리 안으로 제한하는 장치다. 웹 페이지의 자바스크립트는 내 디스크의 파일을 마음대로 읽을 수 없고(사용자가 파일 선택 창에서 고른 파일만), 다른 프로그램을 실행할 수 없고, 카메라·마이크·위치 같은 장치는 사용자가 권한 요청에 "허용"을 눌러야 쓴다. 현대 브라우저는 여기에 운영체제의 격리도 겹친다. 크롬 같은 브라우저는 페이지를 그리고 스크립트를 실행하는 부분을 권한이 낮은 별도 프로세스로 돌리고, 사이트마다 프로세스를 나눠 한 사이트의 코드가 다른 사이트의 메모리에 닿기 어렵게 한다. 브라우저 자체에 버그가 있으면 이 울타리가 뚫릴 수 있으므로 브라우저 업데이트는 보안 업데이트이기도 하다.

## 출처: 스킴, 호스트, 포트
샌드박스가 "페이지와 내 컴퓨터" 사이의 벽이라면, 동일 출처 정책은 "사이트와 사이트" 사이의 벽이다. 그 기준이 **출처**(origin)다. 출처는 URL의 세 부분, 즉 **스킴**(http, https), **호스트**(shop.example.com), **포트**(443)의 묶음이다. 경로(`/cart`)는 출처에 들어가지 않는다. 세 가지가 모두 같아야 같은 출처다. 코드를 몰라도 괜찮다. 출력의 "같음/다름"만 보자.
```python
from urllib.parse import urlsplit

DEFAULT_PORT = {'http': 80, 'https': 443}

def origin(url):
    u = urlsplit(url)
    return (u.scheme, u.hostname, u.port or DEFAULT_PORT[u.scheme])

base = 'https://shop.example.com/cart'
print('기준:', origin(base))
for url in ['https://shop.example.com/pay',
            'https://shop.example.com:443/help',
            'http://shop.example.com/pay',
            'https://api.example.com/pay',
            'https://shop.example.com:8443/pay']:
    print('같음' if origin(url) == origin(base) else '다름', url)
```
```text
기준: ('https', 'shop.example.com', 443)
같음 https://shop.example.com/pay
같음 https://shop.example.com:443/help
다름 http://shop.example.com/pay
다름 https://api.example.com/pay
다름 https://shop.example.com:8443/pay
```
경로가 달라도, 기본 포트 443을 적었든 생략했든 같은 출처다. 스킴만 http로 바뀌어도, 같은 회사의 다른 하위 도메인(api)이어도, 포트만 달라도 다른 출처다.

## 동일 출처 정책이 막는 것
**동일 출처 정책**(same-origin policy)은 "한 출처의 스크립트는 다른 출처의 문서나 응답 내용을 읽을 수 없다"는 규칙이다. 1995년 넷스케이프 내비게이터 2에 자바스크립트가 들어온 직후 함께 도입되었다. 왜 필요한지는 쿠키(11편)를 생각하면 분명하다. 브라우저는 은행 사이트에 요청을 보낼 때 그 사이트의 로그인 쿠키를 자동으로 붙인다. 만약 내가 연 다른 탭의 수상한 사이트가 자바스크립트로 은행 주소에 요청을 보내고 응답을 읽을 수 있다면, 내 쿠키로 열린 내 계좌 화면을 그대로 훔쳐 갈 것이다. 동일 출처 정책은 그 응답을 수상한 사이트의 코드가 읽지 못하게 한다.

막지 않는 것도 알아야 한다. 다른 출처의 이미지, 스크립트, 스타일시트를 문서에 **끼워 넣는 것**은 허용된다(웹이 서로 연결되는 방식이다). 다른 출처로 폼을 **보내는 것**도 막지 않는다. 내용을 읽지 못할 뿐 요청 자체는 간다. 이 빈틈을 노린 공격이 CSRF이고, 막는 방법은 11편에서 다룬다.

## CORS: 서버가 여는 문
그런데 정당한 이유로 다른 출처의 응답을 읽어야 할 때가 많다. `app.example.com`의 화면이 `api.example.com`의 데이터를 쓰는 경우다. 그래서 응답하는 서버가 "이 출처의 코드는 내 응답을 읽어도 된다"고 헤더로 허락하는 규칙이 생겼다. **CORS**(Cross-Origin Resource Sharing)다. 지금은 브라우저의 요청 방식을 정한 WHATWG의 Fetch 표준에 들어 있다.
- 브라우저는 다른 출처로 요청할 때 `Origin: https://app.example.com` 헤더를 붙인다.
- 서버가 응답에 `Access-Control-Allow-Origin: https://app.example.com`을 넣으면 브라우저는 그 페이지의 코드에 응답을 넘겨준다. 없으면 응답을 받고도 코드에는 오류만 준다.
- 서버 데이터를 바꿀 수 있는 요청(PUT, DELETE, JSON 본문, 직접 만든 헤더)은 보내기 전에 먼저 `OPTIONS` 메서드로 "이런 요청을 보내도 되는가"를 묻는다. 이것이 **사전 요청**(preflight)이다. 서버가 허락해야 진짜 요청이 나간다.

## 직접 해 보기: CORS를 말하는 서버
허락한 출처 하나에만 문을 여는 작은 서버를 만든다. 서버 코드는 훑어만 보고, 아래 curl 출력을 보면 된다.
```python
# 파일: cors_server.py
from http.server import BaseHTTPRequestHandler, HTTPServer

ALLOWED = 'http://app.localhost:8080'   # 문을 열어 줄 출처 하나

class Handler(BaseHTTPRequestHandler):
    def allow(self):
        if self.headers.get('Origin') == ALLOWED:
            self.send_header('Access-Control-Allow-Origin', ALLOWED)
        self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):                  # 사전 요청에 답하기
        self.send_response(204)
        self.allow()
        if self.headers.get('Origin') == ALLOWED:
            self.send_header('Access-Control-Allow-Methods', 'GET, PUT')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self):
        body = b'{"balance": 1000}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.allow()
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):          # 요청 기록은 생략
        pass

HTTPServer(('127.0.0.1', 8003), Handler).serve_forever()
```
```bash
python3 cors_server.py &
sleep 1
U=http://127.0.0.1:8003/balance
echo '--- 허락된 출처'
curl -s -D - -o /dev/null -H 'Origin: http://app.localhost:8080' $U | grep -i '^access'
echo '--- 다른 출처'
curl -s -D - -o /dev/null -H 'Origin: http://evil.localhost:9999' $U | grep -ic '^access'
curl -s -H 'Origin: http://evil.localhost:9999' $U; echo
```
```text
--- 허락된 출처
Access-Control-Allow-Origin: http://app.localhost:8080
--- 다른 출처
0
{"balance": 1000}
```
두 번째 결과가 중요하다. 다른 출처에서 온 요청에도 서버는 **응답을 보냈다**. 허락 헤더가 0개일 뿐이다. curl은 브라우저가 아니라서 그 응답을 그대로 보여 준다. 브라우저였다면 응답을 받고도 허락 헤더가 없으니 페이지의 자바스크립트에는 "CORS 오류"만 건넸을 것이다. 즉 CORS는 **사용자를 지키는 브라우저의 규칙**이지 서버를 지키는 장치가 아니다. 서버의 데이터를 지키는 일은 로그인과 권한 검사(11편)가 한다. 이제 PUT 요청 전의 사전 요청을 흉내 낸다.
```bash
curl -s -i -X OPTIONS http://127.0.0.1:8003/balance \
  -H 'Origin: http://app.localhost:8080' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type' | grep -iE '^(HTTP|access)'
```
```text
HTTP/1.0 204 No Content
Access-Control-Allow-Origin: http://app.localhost:8080
Access-Control-Allow-Methods: GET, PUT
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 600
```
브라우저는 이 답을 보고 PUT을 보내도 된다고 판단하고, `Max-Age: 600` 덕분에 600초 동안은 같은 사전 요청을 다시 보내지 않는다. 사전 요청은 왕복 한 번을 더 쓰므로 트래픽 면에서도 비용이다(15편에서 왕복의 비용을 잰다).

## 흔한 오해
- "CORS 오류가 나면 서버가 요청을 거부한 것이다": 대부분 서버는 요청을 받아 처리하고 응답까지 보냈다. 브라우저가 페이지에 넘겨주지 않았을 뿐이다. 서버 기록을 보면 요청이 들어와 있다.
- "`Access-Control-Allow-Origin: *`로 열면 해결된다": 공개 데이터라면 괜찮지만, 쿠키 같은 자격 증명을 함께 보내는 요청에는 `*`를 쓸 수 없고 출처를 정확히 적어야 한다. 아무 출처나 비추어 돌려주는 설정은 동일 출처 정책을 사실상 끄는 것이다.
- "같은 회사 도메인이면 같은 출처다": `shop.example.com`과 `api.example.com`은 다른 출처다. 위 실습처럼 포트 하나만 달라도 다르다.

## 어디에 쓰이나
- 도커와 컨테이너 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」: 프로그램에 필요한 만큼만 권한을 주는 최소 권한 원칙은 샌드박스와 같은 생각이다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 프로세스마다 메모리를 나누는 운영체제의 격리가 사이트별 프로세스 분리의 바탕이다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: 남이 만든 코드를 실행할 때 권한을 좁히는 문제를 CI 쪽에서 다룬다.

## 정리
- 브라우저는 페이지 코드에 아주 적은 권한만 준다(샌드박스). 설치 없이 실행할 수 있는 것은 이 제한 덕분이다.
- 출처는 스킴·호스트·포트의 묶음이고, 셋 중 하나만 달라도 다른 출처다.
- 동일 출처 정책은 다른 출처의 응답을 **읽는 것**을 막는다. 끼워 넣기와 보내기는 막지 않는다.
- CORS는 응답하는 서버가 헤더로 특정 출처에 읽기를 허락하는 방식이다. 검사는 브라우저가 하고, 서버 데이터의 보호는 따로 해야 한다.

## 더 알아보기
- 이전 글: 2편 「브라우저 안에서 앱이 도는 방식: JavaScript 엔진, DOM, 이벤트 루프」
- 다음 글: 4편 「문서에서 앱으로: AJAX, fetch, 싱글 페이지 앱」
