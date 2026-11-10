# [웹 앱의 원리 14/20] 오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키

> **한 줄 요약** — 몇 초 넘게 걸리는 일은 요청 안에서 끝내지 않고 "접수했다(202)"고 먼저 답한 뒤 작업 큐와 워커가 뒤에서 처리하게 하며, 네트워크에서는 "처리됐는지 모르는" 순간이 반드시 생기므로 재시도는 안전한 오류에만, 그리고 멱등 키로 같은 일이 두 번 일어나지 않게 해서 한다.

## 이 글에서 다루는 것
- 요청 하나로 기다리면 안 되는 일들
- 202 Accepted와 작업 상태 조회, 웹훅
- 작업 큐와 워커: 몰려드는 요청을 줄 세우기
- 재시도: 무엇을, 언제, 몇 번
- 멱등 키: 응답을 못 받았을 때의 이중 결제 막기
- 직접 해 보기: 접수 → 대기 → 처리 → 완료를 실제 HTTP로 따라가기, 멱등 키가 있을 때와 없을 때

## 질문: 동영상 변환을 요청한 뒤 탭을 닫으면?
보고서 만들기, 동영상 변환, 대량 메일 발송, 여러 회사를 거치는 결제처럼 몇 초에서 몇십 분 걸리는 일이 있다. 이것을 HTTP 요청 하나 안에서 처리하면 문제가 줄줄이 생긴다. 중간의 프록시와 로드 밸런서(18편)는 보통 수십 초 넘게 답이 없는 요청을 끊는다. 사용자는 기다리다 탭을 닫거나 새로 고침을 누른다. 서버는 그동안 연결과 스레드를 붙잡고 있어 다른 요청을 받지 못한다. 그리고 응답이 오지 않은 클라이언트는 일이 끝났는지조차 모른다.

## 202 Accepted: 먼저 접수증을 준다
해법은 일을 **접수**와 **처리**로 나누는 것이다. 클라이언트가 요청하면 서버는 할 일을 기록만 하고 즉시 `202 Accepted`와 함께 작업의 주소(`Location: /jobs/1`)를 돌려준다. 실제 일은 뒤에서 **워커**(worker)라는 별도 프로세스가 한다. 클라이언트는 작업 주소를 가끔 조회하거나(13편의 폴링), SSE로 진행률을 받거나, 끝나면 서버가 미리 등록해 둔 주소로 HTTP 요청을 보내 알려 주는 **웹훅**(webhook)을 받는다. 식당의 진동 벨과 같다. 주문을 받으면 벨을 주고, 음식은 주방이 만든다.

## 직접 해 보기 1: 접수부터 완료까지
접수 API와 워커 스레드 하나를 가진 서버를 만든다. 워커는 0.3초 쉬었다가 일을 꺼내 0.6초 동안 처리한다. 코드는 훑어만 보자.
```python
# 파일: job_server.py
import json, queue, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

JOBS, TODO = {}, queue.Queue()            # 작업 상태표와 작업 큐

def worker():
    while True:
        job_id = TODO.get()               # 줄 맨 앞의 일을 꺼낸다
        time.sleep(0.3)
        JOBS[job_id]['status'] = 'running'
        time.sleep(0.6)                   # 오래 걸리는 일 흉내
        JOBS[job_id].update(status='done', result=f'/files/report-{job_id}.pdf')

class Handler(BaseHTTPRequestHandler):
    def reply(self, code, data, headers=()):
        body = json.dumps(data).encode()
        self.send_response(code)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):                    # 접수: 기록하고 바로 답한다
        job_id = len(JOBS) + 1
        JOBS[job_id] = {'status': 'queued'}
        TODO.put(job_id)
        self.reply(202, {'job': job_id}, [('Location', f'/jobs/{job_id}')])

    def do_GET(self):                     # 상태 조회
        self.reply(200, JOBS[int(self.path.rsplit('/', 1)[1])])

    def log_message(self, *args):
        pass

threading.Thread(target=worker, daemon=True).start()
ThreadingHTTPServer(('127.0.0.1', 8014), Handler).serve_forever()
```
클라이언트는 접수증을 받은 뒤 0.2초마다 상태를 묻고, 상태가 바뀔 때만 출력한다.
```bash
python3 job_server.py &
sleep 1
U=http://127.0.0.1:8014
curl -s -i -X POST $U/reports | grep -iE '^(HTTP|location)'
for i in $(seq 1 15); do curl -s $U/jobs/1; echo; sleep 0.2; done | uniq
```
```text
HTTP/1.0 202 Accepted
Location: /jobs/1
{"status": "queued"}
{"status": "running"}
{"status": "done", "result": "/files/report-1.pdf"}
```
접수 응답은 즉시 왔고, 그 뒤 상태가 대기(queued) → 처리 중(running) → 완료(done)로 바뀌었다. 요청 하나가 1초 가까이 연결을 붙잡지 않았다. 클라이언트가 중간에 탭을 닫아도 일은 계속되고, 다시 와서 같은 작업 주소를 조회하면 결과를 받는다.

## 작업 큐: 몰려드는 요청을 줄 세우기
위의 `queue.Queue`는 한 프로세스 안의 줄이다. 실제 서비스에서는 서버가 여러 대이고 재시작해도 일이 사라지면 안 되므로, 줄을 데이터베이스 테이블이나 전용 메시지 큐에 둔다. **작업 큐**는 일을 넣는 쪽(API 서버)과 꺼내는 쪽(워커)을 떼어 놓는다. 그 덕분에 세 가지를 얻는다.
- **완충**: 이벤트 날 요청이 열 배로 몰려도 큐가 받아 두고, 워커는 감당할 속도로 꺼낸다. 대기 시간은 길어져도 시스템이 쓰러지지는 않는다(19편의 과부하 이야기로 이어진다).
- **독립 확장**: 화면용 API 서버와 무거운 워커를 따로 늘리고 줄일 수 있다.
- **재시도**: 워커가 처리 중에 죽으면 그 일을 다시 줄에 세운다.

마지막 성질 때문에 대부분의 큐는 "**적어도 한 번**"(at-least-once) 전달을 약속한다. 워커가 일을 끝내고 "끝났다"고 기록하기 직전에 죽으면, 그 일은 다른 워커에게 한 번 더 간다. 그래서 워커의 처리는 같은 일을 두 번 받아도 결과가 한 번과 같아야 한다. 9편의 멱등성이 여기서 다시 나온다.

## 재시도: 무엇을, 언제, 몇 번
네트워크 너머의 일은 실패한다. 재시도의 규칙은 9편의 상태 코드에서 출발한다.
- **다시 해 볼 만한 것**: 연결 실패, 시간 초과, 502·503·504, 429(너무 많이 보냄, `Retry-After` 헤더가 있으면 그만큼 기다린다).
- **다시 해도 소용없는 것**: 400, 401, 403, 404, 409 같은 대부분의 4xx. 요청 자체를 고쳐야 한다.
- **간격**: 바로 다시 보내지 말고 1초, 2초, 4초처럼 점점 늘린다(지수 백오프). 모두가 같은 박자로 다시 보내면 회복 중인 서버를 다시 쓰러뜨리므로 간격에 무작위를 섞는다(19편).
- **한도**: 몇 번 실패하면 멈추고, 일을 따로 빼 두는 줄(데드 레터 큐)에 옮겨 사람이 보게 한다.

## 응답이 사라진 순간
가장 까다로운 실패는 "요청은 도착해서 처리됐는데, 응답이 돌아오는 길에 사라진" 경우다. 클라이언트에게는 시간 초과로만 보인다. 결제를 다시 보내면 두 번 청구되고, 다시 보내지 않으면 결제가 안 됐을 수도 있다. 이 모호함은 네트워크로 떨어져 있는 한 없앨 수 없다. 대신 **같은 요청을 여러 번 보내도 한 번만 처리되게** 만들 수 있다.

**멱등 키**(idempotency key)는 클라이언트가 "논리적으로 하나인 작업"마다 무작위 고유값(UUID 같은)을 만들어 `Idempotency-Key` 헤더에 싣는 방식이다. 서버는 키와 처리 결과를 저장해 두고, 같은 키가 다시 오면 다시 처리하지 않고 저장한 결과를 돌려준다. 결제 API들이 오래 써 온 방식이고, IETF에서 표준 헤더로 정리하는 초안(Internet-Draft)이 진행 중이다.

## 직접 해 보기 2: 멱등 키가 있을 때와 없을 때
첫 번째 시도에서 서버는 결제를 처리했지만 응답이 길에서 사라지고, 클라이언트는 두 번째로 다시 보낸다. 같은 상황을 멱등 키 없이, 그리고 있게 돌려 본다.
```python
class PaymentServer:
    def __init__(self):
        self.charges, self.results = [], {}
    def charge(self, amount, key=None):
        if key in self.results:                    # 이미 처리한 키: 결과만 다시 준다
            return self.results[key]
        self.charges.append(amount)                # 실제 청구
        result = f'결제 #{len(self.charges)} 완료'
        if key:
            self.results[key] = result
        return result

def send(server, amount, key, reply_lost):
    result = server.charge(amount, key)            # 서버는 처리했다
    if reply_lost:
        raise TimeoutError                         # 그런데 응답이 사라졌다
    return result

def client(server, key):
    for attempt, lost in [(1, True), (2, False)]:
        try:
            return f'{attempt}번째 시도에서 받음: ' + send(server, 30000, key, lost)
        except TimeoutError:
            print(f'  {attempt}번째 시도: 응답 없음 → 다시 보낸다')

for key in [None, 'a3f1c2-order-42']:              # 실제 키는 uuid4() 같은 무작위 값
    server = PaymentServer()
    print('멱등 키:', key or '없음')
    print(' ', client(server, key))
    print('  실제 청구 내역:', server.charges)
```
```text
멱등 키: 없음
  1번째 시도: 응답 없음 → 다시 보낸다
  2번째 시도에서 받음: 결제 #2 완료
  실제 청구 내역: [30000, 30000]
멱등 키: a3f1c2-order-42
  1번째 시도: 응답 없음 → 다시 보낸다
  2번째 시도에서 받음: 결제 #1 완료
  실제 청구 내역: [30000]
```
키가 없으면 고객은 3만 원을 두 번 냈다. 키가 있으면 두 번째 요청은 저장된 "결제 #1 완료"를 다시 받았을 뿐이다. 실제 구현에서는 두 가지를 더 챙긴다. 같은 키의 요청 두 개가 거의 동시에 오면 둘 다 "처음 본 키"로 판단할 수 있으므로, 키를 데이터베이스의 UNIQUE 제약이 걸린 칸에 "처리 중"으로 먼저 넣어 하나만 통과시킨다. 그리고 같은 키에 다른 내용(금액이 다른)이 오면 오류로 거절한다. 키는 하루나 며칠 뒤에 지운다.

## 흔한 오해
- "재시도는 많이 할수록 안전하다": 멱등하지 않은 요청을 재시도하면 중복이 생기고, 장애 중인 서버에 재시도가 몰리면 회복을 막는다. 횟수 제한과 늘어나는 간격이 필수다.
- "큐에 넣었으니 정확히 한 번 처리된다": 대부분의 큐는 "적어도 한 번"이다. "정확히 한 번"처럼 보이게 하는 것은 멱등한 처리와 중복 제거의 몫이다.
- "202를 줬으면 일이 성공한 것이다": 202는 "접수했다"일 뿐이다. 실패할 수 있으므로 작업 상태에 실패와 그 이유를 담고, 클라이언트도 그 경우를 화면에 보여 줘야 한다.

## 어디에 쓰이나
- PostgreSQL 실무 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」: 작업 큐를 데이터베이스 테이블로 만들고 워커 여러 개가 겹치지 않게 일을 가져가는 방법이다.
- PostgreSQL 실무 3편 「제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약」: 동시에 온 같은 멱등 키 중 하나만 통과시키는 일은 UNIQUE 제약이 맡는다.
- 게임 자원 관리 10편 「시간 분할: 무거운 일을 여러 프레임에 나누기」: 무거운 일을 한 번에 하지 않고 나눠 뒤로 미루는 생각이 같다.

## 정리
- 오래 걸리는 일은 요청 안에서 끝내지 않는다. 202와 작업 주소를 먼저 주고, 워커가 뒤에서 처리한다. 결과는 조회, SSE, 웹훅으로 알린다.
- 작업 큐는 몰리는 요청을 완충하고, API와 워커를 따로 확장하게 하며, 실패한 일을 다시 맡긴다. 대신 같은 일이 두 번 갈 수 있다.
- 재시도는 다시 해 볼 만한 오류에만, 늘어나는 간격과 횟수 제한을 두고 한다.
- 응답이 사라지는 순간은 피할 수 없다. 멱등 키로 같은 요청을 여러 번 받아도 한 번만 처리되게 만든다.

## 더 알아보기
- 이전 글: 13편 「실시간 통신: 폴링, 서버 전송 이벤트, 웹소켓」
- 다음 글: 15편 「연결을 아끼는 HTTP의 진화: keep-alive, HTTP/2, HTTP/3」
- Idempotency-Key 헤더 초안: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header
