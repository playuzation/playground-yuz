# [웹 앱의 원리 11/20] 상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰

> **한 줄 요약** — HTTP는 요청 하나하나를 따로 처리해 "방금 로그인한 사람"을 기억하지 못하므로, 서버가 기억을 맡는 세션(쿠키에는 무작위 번호만)이나 서버가 서명한 증명서를 클라이언트가 들고 다니는 토큰으로 로그인 상태를 이어 가고, 쿠키가 자동으로 실려 간다는 성질 때문에 CSRF와 XSS를 함께 막아야 한다.

## 이 글에서 다루는 것
- 상태 없는(stateless) 프로토콜의 장점과 문제
- 쿠키: `Set-Cookie`와 `Cookie`, 그리고 HttpOnly·Secure·SameSite
- 세션 방식과 토큰 방식의 차이
- CSRF와 XSS: 로그인을 노리는 두 공격
- 직접 해 보기: 세션 쿠키로 로그인·로그아웃, 서명한 토큰과 위조·만료 검사

## 상태 없는 HTTP
9편의 서버는 요청 하나를 받으면 답하고 잊었다. 다음 요청이 같은 사람에게서 왔는지 모른다. 이것을 **상태 없음**(stateless)이라고 한다. 단점처럼 보이지만 큰 장점이다. 어떤 요청이든 아무 서버나 처리할 수 있으니 서버를 늘리기 쉽고(18편), 중간의 캐시와 프록시가 요청 하나만 보고 판단할 수 있다(16편). 그러면 "로그인한 상태"는 어디에 둘까. 매 요청에 "나는 누구다"라는 증거를 실어 보내는 수밖에 없다. 그 증거를 담는 그릇이 쿠키나 `Authorization` 헤더다.

## 쿠키
**쿠키**(cookie)는 서버가 응답의 `Set-Cookie` 헤더로 "이것을 기억해 두라"고 맡기면, 브라우저가 이후 같은 사이트로 가는 요청마다 `Cookie` 헤더에 자동으로 실어 보내는 작은 값이다. 1994년 넷스케이프의 루 몬툴리가 고안해 그해 10월의 넷스케이프 브라우저가 지원했고, 2011년 4월 RFC 6265로 지금의 표준이 정리되었다. 쿠키에는 속성을 붙여 다루는 방법을 정한다.
- `HttpOnly`: 페이지의 자바스크립트가 읽을 수 없다. 스크립트를 몰래 넣는 공격(XSS)이 성공해도 쿠키를 빼 가지 못한다.
- `Secure`: HTTPS 연결(10편)에서만 보낸다.
- `SameSite`: 다른 사이트에서 시작된 요청에 쿠키를 실을지 정한다. `Lax`면 다른 사이트의 폼이 보내는 POST에는 싣지 않는다(아래의 CSRF 방어).
- `Max-Age`·`Expires`: 언제까지 기억할지. 없으면 브라우저를 닫을 때 사라진다.

## 세션 방식: 서버가 기억한다
가장 오래된 방식은 서버가 로그인 정보를 기억하고, 쿠키에는 그 기억을 찾을 **무작위 번호**(세션 ID)만 주는 것이다. 번호는 추측할 수 없을 만큼 길고 무작위여야 한다. 로그아웃하면 서버가 그 번호를 지우므로, 같은 쿠키를 다시 보내도 소용없다.

## 직접 해 보기 1: 세션 쿠키로 로그인
서버의 기억(`SESSIONS`)은 파이썬 딕셔너리 하나다. 코드는 훑어만 보자.
```python
# 파일: session_server.py
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer

SESSIONS = {}                          # 세션 ID → 사용자: 서버의 기억
USERS = {'minji': 'correct-horse'}     # 실제로는 비밀번호를 해시로만 저장한다

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, text, cookie=None):
        data = (text + '\n').encode()
        self.send_response(code)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def sid(self):
        jar = SimpleCookie(self.headers.get('Cookie', ''))
        return jar['sid'].value if 'sid' in jar else None

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length'])).decode()
        if self.path == '/login':
            user, _, password = body.partition(':')
            if USERS.get(user) != password:
                return self.reply(401, '로그인 실패')
            sid = secrets.token_urlsafe(16)          # 추측할 수 없는 번호
            SESSIONS[sid] = user
            return self.reply(200, '로그인 성공', f'sid={sid}; HttpOnly; SameSite=Lax; Path=/')
        if self.path == '/logout':
            SESSIONS.pop(self.sid(), None)           # 서버의 기억을 지운다
            return self.reply(200, '로그아웃', 'sid=; Max-Age=0; Path=/')

    def do_GET(self):
        user = SESSIONS.get(self.sid())
        if user:
            return self.reply(200, f'{user}님의 페이지')
        self.reply(401, '로그인이 필요합니다')

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 8011), Handler).serve_forever()
```
curl의 `-c`는 받은 쿠키를 파일(쿠키 통)에 저장하고, `-b`는 그 파일의 쿠키를 실어 보낸다. 브라우저가 자동으로 하는 일을 손으로 하는 것이다.
```bash
python3 session_server.py &
sleep 1
U=http://127.0.0.1:8011
curl -s $U/me
curl -s --data 'minji:wrong' $U/login
curl -s -i -c jar.txt --data 'minji:correct-horse' $U/login | grep -i '^set-cookie'
curl -s -b jar.txt $U/me
cp jar.txt stolen.txt                    # 누군가 쿠키를 복사해 갔다고 하자
curl -s -b jar.txt -c jar.txt --data '' $U/logout
curl -s -b stolen.txt $U/me
```
```text
로그인이 필요합니다
로그인 실패
Set-Cookie: sid=…; HttpOnly; SameSite=Lax; Path=/
minji님의 페이지
로그아웃
로그인이 필요합니다
```
쿠키가 없을 때는 401, 로그인 뒤에는 쿠키 하나로 "minji님"이 된다. 쿠키에는 사용자 이름도 비밀번호도 없고 무작위 번호뿐이다. 마지막 줄이 세션 방식의 장점이다. 로그아웃으로 서버가 기억을 지우자, 미리 복사해 둔 쿠키도 쓸모가 없어졌다. 실제 서비스라면 여기에 `Secure`를 붙여 HTTPS에서만 오가게 한다.

대가는 서버가 기억을 들고 있어야 한다는 것이다. 서버가 여러 대면(18편) 모든 서버가 같은 세션 저장소(데이터베이스나 메모리 저장소)를 함께 봐야 한다.

## 토큰 방식: 클라이언트가 증명서를 들고 다닌다
다른 방법은 서버가 "이 사람은 minji이고, 이 시각까지 유효하다"는 내용에 **서명**해서 통째로 주는 것이다. 클라이언트는 이 **토큰**을 매 요청의 `Authorization: Bearer <토큰>` 헤더에 싣는다. 서버는 기억할 필요 없이 서명만 확인하면 된다. 웹에서 많이 쓰는 형식인 JWT(JSON Web Token)는 2015년 5월 RFC 7519로 표준이 되었다. 아래는 JWT의 핵심만 남긴 장난감이다. 내용(JSON)을 글자로 바꾸고, 서버만 아는 비밀 열쇠로 HMAC 서명을 붙인다.
```python
import base64, hashlib, hmac, json

SECRET = b'server-only-secret'           # 서버만 아는 열쇠

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

def mac(body):
    return b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())

def issue(user, expires_at):
    body = b64(json.dumps({'sub': user, 'exp': expires_at}).encode())
    return body + '.' + mac(body)

def check(token, now):
    body, _, sig = token.partition('.')
    if not hmac.compare_digest(sig, mac(body)):
        return '거절: 서명이 맞지 않음'
    claims = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
    if claims['exp'] < now:
        return '거절: 만료됨'
    return f"통과: {claims['sub']}"

token = issue('minji', expires_at=1900)          # 시각은 설명용 숫자
print('토큰:', token)
print('t=1000:', check(token, 1000))
fake_body = b64(json.dumps({'sub': 'admin', 'exp': 1900}).encode())
print('admin으로 바꾼 토큰:', check(fake_body + '.' + token.split('.')[1], 1000))
print('t=2000:', check(token, 2000))
```
```text
토큰: eyJzdWIiOiAibWluamkiLCAiZXhwIjogMTkwMH0.RmH_TI61RqGpeYLnlphGvc24l3VM8FbRi9ehvXqr0Uk
t=1000: 통과: minji
admin으로 바꾼 토큰: 거절: 서명이 맞지 않음
t=2000: 거절: 만료됨
```
토큰의 앞부분은 암호화가 아니라 단순한 글자 변환이라 누구나 풀어 읽을 수 있다(`eyJzdWIi…`를 되돌리면 `{"sub": "minji", …}`). 그래서 토큰에 비밀을 넣으면 안 된다. 대신 내용을 한 글자라도 바꾸면 서명이 맞지 않는다. 비밀 열쇠를 모르는 사람은 올바른 서명을 만들 수 없기 때문이다.

토큰 방식의 대가는 세션의 장점과 정확히 반대다. 서버가 기억하지 않으니 **유효 기간이 끝나기 전에는 되돌리기 어렵다**. 도난당한 토큰은 만료될 때까지 통한다. 그래서 접근 토큰은 몇 분~몇십 분으로 짧게 주고, 새 토큰을 받을 때 쓰는 별도의 갱신 토큰을 서버가 기억해 두었다가 로그아웃 때 지우는 식으로 섞어 쓴다.

## 로그인을 노리는 두 공격
- **CSRF**(사이트 간 요청 위조): 쿠키는 자동으로 실려 가므로, 수상한 사이트에 숨겨 둔 폼이 내 은행 주소로 "송금" POST를 보내면 내 쿠키가 함께 간다. 동일 출처 정책(3편)은 응답을 읽지 못하게 할 뿐 요청 자체는 막지 않는다. `SameSite=Lax` 쿠키, 그리고 페이지에만 심어 둔 무작위 값(CSRF 토큰)을 요청에 함께 보내게 하는 방법으로 막는다. `Authorization` 헤더의 토큰은 자동으로 실리지 않으므로 이 공격에 덜 노출된다.
- **XSS**(사이트 간 스크립팅): 게시글이나 이름 칸에 넣은 스크립트가 다른 사용자의 화면에서 실행되는 공격이다. 성공하면 그 페이지의 권한으로 무엇이든 할 수 있고, localStorage에 둔 토큰은 그대로 빼 간다. 입력을 HTML로 해석하지 않고 글자로만 출력하는 것이 기본 방어이고, `HttpOnly` 쿠키는 적어도 쿠키 자체의 유출을 막는다. 이 사이트가 글에서 HTML을 렌더링하지 않는 이유도 여기에 있다.

쿠키냐 헤더 토큰이냐는 "자동으로 실리는 편리함과 CSRF 위험" 대 "스크립트가 다뤄야 하는 번거로움과 XSS 위험"의 교환이다. 어느 쪽이든 HTTPS, 짧은 수명, 서버의 권한 검사는 공통이다.

## 흔한 오해
- "토큰은 암호화되어 있어 안전하다": 서명은 위조를 막을 뿐 내용을 숨기지 않는다. 비밀번호나 개인 정보를 넣지 않는다.
- "로그인했으니 그 사용자의 요청은 다 허락한다": 로그인(인증, 누구인가)과 권한(인가, 무엇을 해도 되는가)은 다르다. 다른 사람의 주문 번호를 넣어 조회하는 요청은 로그인한 사용자도 막아야 한다.
- "비밀번호는 암호화해서 저장한다": 되돌릴 수 있는 암호화가 아니라, 사용자마다 다른 소금(salt)을 섞은 느린 해시(bcrypt, scrypt, Argon2)로 저장하고 로그인할 때 같은 계산을 해 비교한다.

## 어디에 쓰이나
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 토큰을 서명하는 비밀 열쇠는 코드나 이미지에 넣지 않고 따로 관리한다.
- PostgreSQL 실무 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」: "로그인한 사용자가 자기 행만 볼 수 있게" 하는 권한 검사를 데이터베이스에서 거는 방법이다.
- GitHub 협업과 자동화 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」: 개인 접근 토큰을 `Authorization` 헤더에 실어 API를 부르는 실제 예다.

## 정리
- HTTP는 상태가 없다. 그래서 확장하기 쉽고, 로그인 증거는 매 요청에 실어 보내야 한다.
- 세션 방식은 서버가 기억하고 쿠키에는 무작위 번호만 둔다. 로그아웃이 즉시 효과가 있지만 서버들이 저장소를 공유해야 한다.
- 토큰 방식은 서버가 서명한 증명서를 클라이언트가 들고 다닌다. 서버가 가볍지만 만료 전에는 되돌리기 어려워 수명을 짧게 한다.
- 쿠키는 자동으로 실려 CSRF에, 스크립트가 다루는 토큰은 XSS에 주의한다. HttpOnly·Secure·SameSite와 출력 이스케이프가 기본 방어다.

## 더 알아보기
- 이전 글: 10편 「HTTPS와 TLS: 암호화, 인증서, 핸드셰이크」
- 다음 글: 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」
