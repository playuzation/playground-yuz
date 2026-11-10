# [웹 앱의 원리 4/20] 문서에서 앱으로: AJAX, fetch, 싱글 페이지 앱

> **한 줄 요약** — 페이지 전체를 새로 받는 대신 자바스크립트가 뒤에서 데이터만 요청하고 화면의 일부만 고치는 AJAX가 웹을 문서에서 앱으로 바꿨고, 그 방식을 끝까지 밀고 간 것이 HTML 한 장으로 모든 화면을 그리는 싱글 페이지 앱이다.

## 이 글에서 다루는 것
- 링크를 누를 때마다 화면 전체를 새로 받던 전통적인 웹
- XMLHttpRequest와 "Ajax"라는 이름, 그리고 JSON
- 지금의 방식: `fetch`와 `async`/`await`, 요청을 동시에 기다리기
- 싱글 페이지 앱(SPA)의 구조와 대가
- 직접 해 보기: 전체 페이지와 데이터만 받을 때의 크기 비교, 순서대로 기다리기와 동시에 기다리기

## 전통적인 웹: 누를 때마다 새 문서
초기 웹 앱에서 "할 일 하나 추가"는 이렇게 동작했다. 폼에 글을 쓰고 버튼을 누르면 브라우저가 서버로 폼을 보내고, 서버는 할 일이 하나 늘어난 **새 HTML 문서 전체**를 만들어 돌려주고, 브라우저는 화면을 지우고 처음부터 다시 그린다. 머리말, 메뉴, 꼬리말처럼 바뀌지 않은 부분까지 매번 다시 받았고, 그사이 화면이 하얗게 깜빡였다. 서버 입장에서는 단순하지만 사용자 입장에서는 앱이 아니라 "넘기는 문서"였다.

## XMLHttpRequest와 Ajax
전환점은 페이지를 떠나지 않고 자바스크립트가 뒤에서 서버에 요청하는 기능이었다. 마이크로소프트의 Outlook Web Access 팀이 1998년 무렵 이 개념을 만들었고, 1999년 3월 인터넷 익스플로러 5와 함께 나온 MSXML 라이브러리에 XMLHTTP로 들어갔다. 다른 브라우저들이 `XMLHttpRequest`라는 이름으로 따라 만들었고, 2004년의 Gmail과 2005년의 구글 지도가 이 기술로 "새로 고침 없는 웹"을 보여 주었다. 2005년 2월 18일 제시 제임스 개릿이 글 「Ajax: A New Approach to Web Applications」에서 이 기법 묶음에 **Ajax**(Asynchronous JavaScript and XML)라는 이름을 붙였다.

이름에 XML이 들어 있지만 곧 더 가볍고 자바스크립트와 모양이 같은 **JSON**(JavaScript Object Notation)이 주로 쓰이게 되었다. `["우유 사기", "책 반납"]` 같은 글자 형식이다. 중요한 것은 형식이 아니라 역할의 변화다. 서버는 화면(HTML)을 만드는 대신 **데이터**를 주고, 화면은 브라우저의 자바스크립트가 DOM을 고쳐 만든다(2편).

## 지금의 방식: fetch
요즘 코드는 `XMLHttpRequest` 대신 `fetch` 함수를 쓴다. 결과를 프로미스로 돌려주므로 `await`로 기다리는 코드가 읽기 쉽다.
```sh
const res = await fetch('/api/items');
const items = await res.json();
list.append(...items.map((t) => li(t)));
```
`await` 동안 메인 스레드는 멈추지 않는다. 2편의 이벤트 루프가 다른 일을 하다가, 응답이 도착하면 이어서 실행한다. 그래서 요청 여러 개를 **동시에** 기다릴 수 있다. 아래 실습에서 그 차이를 잰다.

## 직접 해 보기 1: 문서 전체와 데이터만
할 일 세 개를 보여 주는 전체 페이지(`/page`)와 같은 데이터만 주는 API(`/api/items`)를 가진 서버를 만든다. 머리말과 꼬리말은 실제 사이트처럼 무겁게 흉내 냈다. 요청마다 300ms가 걸리는 느린 API(`/api/slow`)도 하나 둔다. 서버 코드는 훑어만 보자.
```python
# 파일: app_server.py
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

ITEMS = ['우유 사기', '책 반납', '운동']
LAYOUT = '<nav>' + '<a href="#">메뉴</a>' * 200 + '</nav>'  # 무거운 틀

class Handler(BaseHTTPRequestHandler):
    def reply(self, text, ctype):
        data = text.encode()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/page':
            lis = ''.join(f'<li>{t}</li>' for t in ITEMS)
            self.reply(f'<!doctype html>{LAYOUT}<ul>{lis}</ul>{LAYOUT}',
                       'text/html; charset=utf-8')
        elif url.path == '/api/items':
            self.reply(json.dumps(ITEMS, ensure_ascii=False), 'application/json')
        elif url.path == '/api/slow':
            time.sleep(0.3)                    # 느린 작업 흉내
            n = parse_qs(url.query)['id'][0]
            self.reply(json.dumps({'id': n}), 'application/json')

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 8004), Handler).serve_forever()
```
```bash
python3 app_server.py &
sleep 1
curl -s -o /dev/null -w '전체 페이지: %{size_download}바이트\n' http://127.0.0.1:8004/page
curl -s -o /dev/null -w '데이터만: %{size_download}바이트\n' http://127.0.0.1:8004/api/items
curl -s http://127.0.0.1:8004/api/items; echo
```
```text
전체 페이지: 8902바이트
데이터만: 41바이트
["우유 사기", "책 반납", "운동"]
```
같은 할 일 세 개인데 전체 페이지는 약 8.9KB, 데이터만은 41바이트다. 할 일을 하나 추가할 때마다 전체 페이지를 다시 받는다면 바뀌지 않은 틀을 매번 다시 받는 셈이다. 실제 사이트의 틀은 이보다 훨씬 크고, 이미지와 스크립트도 붙는다. 데이터만 주고받으면 트래픽이 줄고, 화면도 깜빡이지 않는다.

## 직접 해 보기 2: 순서대로 기다리기와 동시에 기다리기
대시보드 화면이 서로 관계없는 데이터 세 개를 불러온다고 하자. 하나씩 차례로 기다리는 코드와 세 요청을 한꺼번에 보내고 모두를 기다리는 코드를 비교한다(Node.js 18 이상의 `fetch`).
```js
// 파일: wait.mjs
const get = (id) => fetch(`http://127.0.0.1:8004/api/slow?id=${id}`).then((r) => r.json());
const ms = (t0) => Date.now() - t0;

let t0 = Date.now();
for (const id of [1, 2, 3]) await get(id);          // 하나 끝나면 다음
const serial = ms(t0);

t0 = Date.now();
const all = await Promise.all([1, 2, 3].map(get));  // 셋을 한꺼번에
const parallel = ms(t0);

console.log('결과:', all.map((x) => x.id).join(', '));
console.log('차례로:', serial >= 900 ? '900ms 이상' : serial);
console.log('동시에:', parallel < 600 ? '600ms 미만' : parallel);
```
```bash
node wait.mjs
```
```text
결과: 1, 2, 3
차례로: 900ms 이상
동시에: 600ms 미만
```
요청 하나가 300ms라면 차례로 기다릴 때는 300 × 3 = 900ms가 넘게 걸리고, 동시에 보내면 가장 느린 하나만큼(300ms 남짓)만 걸린다. 자바스크립트는 메인 스레드 하나지만 기다리는 일은 겹칠 수 있다는 2편의 이야기가 이것이다. 웹 앱이 빨라 보이는 비결의 상당 부분은 계산을 빨리 하는 것이 아니라 **기다림을 겹치는 것**이다. 다만 서로 의존하는 요청(사용자 정보를 받아야 그 사람의 주문을 물을 수 있는 경우)은 겹칠 수 없고, 그 왕복을 줄이는 API 설계는 12편에서 다룬다.

## 싱글 페이지 앱
데이터만 받아 화면을 고치는 방식을 끝까지 밀면 **싱글 페이지 앱**(SPA, single-page application)이 된다. 서버는 처음에 거의 빈 HTML 한 장과 큰 자바스크립트 묶음을 보낸다. 그 뒤로는 화면 이동도 자바스크립트가 처리한다.
- 링크를 누르면 자바스크립트가 기본 동작(새 문서 요청)을 막는다.
- 브라우저의 History API로 주소창의 URL만 바꾼다(뒤로 가기가 동작하도록).
- 필요한 데이터를 `fetch`로 받아 해당 화면을 DOM으로 그린다.

장점은 화면 전환이 빠르고 상태(입력 중인 글, 재생 중인 음악)가 유지된다는 것이다. 대가도 분명하다. 첫 화면이 뜨기 전에 큰 자바스크립트를 내려받아 실행해야 하고, 자바스크립트를 실행하지 않는 검색 로봇이나 느린 휴대폰에서는 빈 화면이 오래 보일 수 있다. 화면 이동을 브라우저 대신 앱이 처리하니 뒤로 가기, 스크롤 위치, 접근성 같은 것을 직접 챙겨야 한다. 이 대가를 줄이려고 "첫 화면은 서버가 그리고 그다음은 브라우저가 맡는" 방식들이 나왔다. 다음 글의 주제다.

## 흔한 오해
- "AJAX는 특정 라이브러리 이름이다": 페이지를 떠나지 않고 뒤에서 요청해 화면 일부를 고치는 **기법**의 이름이다. 지금은 `fetch`로 같은 일을 한다.
- "SPA는 서버가 필요 없다": 화면 코드는 정적 파일로 줄 수 있어도 데이터, 로그인, 권한 확인은 여전히 서버의 API가 한다. 오히려 API가 앱의 중심이 된다.
- "데이터만 주고받으면 무조건 빠르다": 작은 요청을 수십 번 차례로 보내면 왕복 시간이 쌓여 전체 페이지 한 번보다 느릴 수 있다. 크기보다 왕복 횟수가 문제가 되는 경우가 많다(12편, 15편).

## 어디에 쓰이나
- 언어 기초 7편 「자바스크립트: 브라우저에서 npm까지」: `async`/`await`와 프로미스, 그리고 SPA 프레임워크를 내려받는 npm 생태계를 다룬다.
- PostgreSQL 실무 4편 「조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기」: API가 JSON으로 돌려주는 데이터는 결국 서버가 데이터베이스에서 조인하고 요약한 결과다.
- 게임 자원 관리 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」: 바뀐 것만 보내라는 생각을 게임 네트워크에서는 더 극단적으로 밀고 간다.

## 정리
- 전통적인 웹은 동작마다 문서 전체를 새로 받았다.
- XMLHttpRequest(1999년 IE5)와 2005년의 "Ajax"라는 이름 이후, 서버는 데이터를 주고 브라우저가 화면을 고치는 구조가 퍼졌다.
- `fetch`와 `await`로 요청을 보내는 동안에도 메인 스레드는 다른 일을 하고, 서로 무관한 요청은 동시에 기다릴 수 있다.
- SPA는 화면 이동까지 자바스크립트가 맡는다. 전환은 빠르지만 첫 화면, 검색, 뒤로 가기를 따로 챙겨야 한다.

## 더 알아보기
- 이전 글: 3편 「설치 없이도 안전한 이유: 샌드박스, 동일 출처 정책, CORS」
- 다음 글: 5편 「화면을 어디서 그릴까: 서버 렌더링, 클라이언트 렌더링, 하이드레이션」
