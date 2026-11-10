# [웹 앱의 원리 18/20] 트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서

> **한 줄 요약** — 서버 한 대로 감당할 수 없거나 한 대가 죽으면 서비스가 멈추는 문제를 풀려고, 서버 여러 대 앞에 리버스 프록시와 로드 밸런서를 세워 요청을 나눠 주고, 헬스 체크로 아픈 서버를 빼며, 상태를 서버 밖에 두어 아무 서버나 아무 요청을 받을 수 있게 한다.

## 이 글에서 다루는 것
- 키우기(scale up)와 늘리기(scale out)
- 리버스 프록시: 서버들의 대문
- 로드 밸런서: L4와 L7, 나누는 알고리즘
- 헬스 체크와 배포 중의 빼고 넣기
- 직접 해 보기: 백엔드 세 대 앞의 라운드 로빈 프록시와 장애 서버 빼기, 서버를 늘릴 때 일관된 해싱이 옮기는 양

## 한 대로는 부족할 때
요청이 늘면 두 가지 길이 있다. 더 큰 서버로 바꾸는 **키우기**(scale up)는 간단하지만 한계와 값이 가파르게 오르고, 그 한 대가 죽으면 서비스 전체가 멈춘다. 같은 서버를 여러 대 두는 **늘리기**(scale out)는 끝없이 늘릴 수 있고 한 대가 죽어도 나머지가 버틴다. 대신 요청을 어느 서버로 보낼지 정하는 장치가 필요하고, 어느 서버가 받아도 같은 답을 하도록 서버가 사용자별 기억을 들고 있지 않아야 한다. 11편에서 본 상태 없는 HTTP와 공유 세션 저장소가 바로 이것을 가능하게 한다.

## 리버스 프록시: 서버들의 대문
**프록시**(proxy)는 남을 대신해 요청을 전달하는 중개자다. 회사 네트워크에서 직원들의 요청을 대신 내보내는 것은 **포워드 프록시**이고, 서버들 앞에 서서 바깥의 요청을 대신 받는 것은 **리버스 프록시**(reverse proxy)다. 사용자는 리버스 프록시만 보고, 그 뒤에 서버가 몇 대인지 모른다. 리버스 프록시는 이 시리즈에서 본 일들을 한곳에서 맡는다.
- HTTPS 종료: TLS 핸드셰이크(10편)를 여기서 끝내고, 안쪽으로는 가까운 네트워크로 넘긴다.
- 길 안내: `Host` 헤더(9편)와 경로를 보고 `api.example.com`은 API 서버로, `/static/`은 파일 서버로 보낸다.
- 압축(17편), 캐시(16편), 요청 크기와 속도 제한(19편).
- 원래 클라이언트의 주소를 `X-Forwarded-For` 같은 헤더에 적어 안쪽 서버에 알려 준다. 안쪽 서버가 보기에는 모든 요청이 프록시에서 오기 때문이다.

## 로드 밸런서: 어떻게 나누나
요청을 여러 서버에 나누는 일을 **로드 밸런싱**(load balancing)이라고 한다. 어느 층을 보고 나누느냐에 따라 두 종류로 부른다.
- **L4**: IP와 포트(7편)만 보고 TCP·UDP 연결 단위로 나눈다. 내용을 열어 보지 않아 빠르다.
- **L7**: HTTP 요청을 열어 경로, 헤더, 쿠키를 보고 요청 단위로 나눈다. 더 똑똑하지만 일이 많다. 리버스 프록시가 대개 이 역할을 겸한다.

나누는 규칙도 여러 가지다.
- **라운드 로빈**: 차례대로 한 번씩. 요청의 무게가 비슷할 때 잘 맞는다.
- **가중치**: 큰 서버에 더 많이.
- **최소 연결**: 지금 처리 중인 요청이 가장 적은 서버로. 요청마다 걸리는 시간이 들쭉날쭉할 때 낫다.
- **해시**: 사용자 ID나 주소의 해시로 서버를 정해 같은 사용자를 늘 같은 서버로 보낸다. 서버의 메모리 캐시를 살리거나, 어쩔 수 없이 서버에 세션을 둘 때(고정 세션) 쓴다.

## 헬스 체크와 빼고 넣기
로드 밸런서는 주기적으로 각 서버의 `/healthz` 같은 주소를 불러 보거나(능동 검사), 실제 요청의 실패를 세어(수동 검사) 아픈 서버를 명단에서 뺀다. 회복되면 다시 넣는다. 배포할 때도 같은 장치를 쓴다. 서버 한 대를 명단에서 빼고, 처리 중인 요청이 끝나길 기다렸다가(연결 드레이닝), 새 버전으로 바꾸고, 헬스 체크를 통과하면 다시 넣는다. 이것을 한 대씩 반복하면 사용자는 배포를 눈치채지 못한다.

## 직접 해 보기 1: 프록시와 백엔드 세 대
이름만 다른 백엔드 서버 세 대와, 그 앞에서 차례로 나눠 주며 0.2초마다 헬스 체크를 하는 프록시를 만든다. 코드는 훑어만 보자.
```python
# 파일: backend.py
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

NAME, PORT = sys.argv[1], int(sys.argv[2])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/healthz':
            body = b'ok'
        else:
            client = self.headers.get('X-Forwarded-For')
            body = f'{NAME}가 처리 (원래 클라이언트: {client})\n'.encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
```
```python
# 파일: proxy.py
import itertools, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BACKENDS = ['http://127.0.0.1:8021', 'http://127.0.0.1:8022', 'http://127.0.0.1:8023']
healthy = set(BACKENDS)
turn = itertools.count()                  # 라운드 로빈 순번

def health_check():                       # 0.2초마다 모든 백엔드를 불러 본다
    while True:
        for backend in BACKENDS:
            try:
                urllib.request.urlopen(backend + '/healthz', timeout=0.5).read()
                healthy.add(backend)
            except OSError:
                healthy.discard(backend)
        time.sleep(0.2)

class Proxy(BaseHTTPRequestHandler):
    def do_GET(self):
        alive = [b for b in BACKENDS if b in healthy]
        if not alive:
            self.send_response(503)
            self.end_headers()
            return
        backend = alive[next(turn) % len(alive)]
        request = urllib.request.Request(backend + self.path,
                                         headers={'X-Forwarded-For': self.client_address[0]})
        with urllib.request.urlopen(request, timeout=2) as reply:
            body = reply.read()
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

threading.Thread(target=health_check, daemon=True).start()
ThreadingHTTPServer(('127.0.0.1', 8020), Proxy).serve_forever()
```
클라이언트는 프록시 주소(8020번) 하나만 안다. 여섯 번 요청하고, 서버B를 끈 뒤 네 번 더 요청한다.
```bash
python3 backend.py 서버A 8021 &
python3 backend.py 서버B 8022 & B_PID=$!
python3 backend.py 서버C 8023 &
sleep 1
python3 proxy.py &
sleep 1
for i in 1 2 3 4 5 6; do curl -s http://127.0.0.1:8020/; done
kill $B_PID
sleep 1                                   # 헬스 체크가 알아챌 시간
echo '--- 서버B가 죽은 뒤'
for i in 1 2 3 4; do curl -s http://127.0.0.1:8020/; done
```
```text
서버A가 처리 (원래 클라이언트: 127.0.0.1)
서버B가 처리 (원래 클라이언트: 127.0.0.1)
서버C가 처리 (원래 클라이언트: 127.0.0.1)
서버A가 처리 (원래 클라이언트: 127.0.0.1)
서버B가 처리 (원래 클라이언트: 127.0.0.1)
서버C가 처리 (원래 클라이언트: 127.0.0.1)
--- 서버B가 죽은 뒤
서버A가 처리 (원래 클라이언트: 127.0.0.1)
서버C가 처리 (원래 클라이언트: 127.0.0.1)
서버A가 처리 (원래 클라이언트: 127.0.0.1)
서버C가 처리 (원래 클라이언트: 127.0.0.1)
```
요청이 A, B, C 차례로 나뉘었고, B가 죽자 헬스 체크가 명단에서 빼서 클라이언트는 오류 한 번 보지 않고 A와 C만 쓰게 되었다. 다만 B가 죽은 순간부터 헬스 체크가 알아채기까지의 짧은 틈에 B로 간 요청은 실패할 수 있다. 실제 로드 밸런서는 그런 요청을 멱등한 경우(9편)에만 다른 서버로 다시 보내고, 실패 횟수를 세어 더 빨리 뺀다. 실제로는 nginx, HAProxy, Envoy 같은 소프트웨어나 클라우드의 로드 밸런서 서비스가 이 일을 한다.

## 직접 해 보기 2: 서버를 한 대 늘리면
해시로 나눌 때는 서버 수가 바뀌는 순간이 문제다. 가장 단순한 방법인 "해시 % 서버 수"는 서버가 3대에서 4대가 되면 거의 모든 키의 자리가 바뀐다. 서버의 캐시가 한꺼번에 쓸모없어지는 것이다. **일관된 해싱**(consistent hashing)은 서버와 키를 같은 원(해시 값의 고리) 위에 놓고, 키를 시계 방향으로 처음 만나는 서버에 맡긴다. 서버가 늘면 새 서버 앞쪽 구간의 키만 옮겨 간다.
```python
import bisect, hashlib

def h(text):
    return int(hashlib.md5(text.encode()).hexdigest()[:8], 16)

keys = [f'user{i}' for i in range(10_000)]

def modulo(servers):
    return {k: servers[h(k) % len(servers)] for k in keys}

def ring(servers, points_per_server=100):     # 서버마다 원 위에 점 100개
    points = sorted((h(f'{s}#{v}'), s) for s in servers for v in range(points_per_server))
    marks = [p for p, _ in points]
    return {k: points[bisect.bisect(marks, h(k)) % len(points)][1] for k in keys}

for name, assign in [('해시 % 서버 수', modulo), ('일관된 해싱', ring)]:
    before, after = assign(['A', 'B', 'C']), assign(['A', 'B', 'C', 'D'])
    moved = sum(before[k] != after[k] for k in keys)
    print(f'{name}: 서버 3대 → 4대에서 자리를 옮긴 키 {moved / len(keys):.0%}')
```
```text
해시 % 서버 수: 서버 3대 → 4대에서 자리를 옮긴 키 75%
일관된 해싱: 서버 3대 → 4대에서 자리를 옮긴 키 24%
```
나머지 방식은 키의 4분의 3이 다른 서버로 옮겨 갔다. 일관된 해싱은 새 서버 D가 맡아야 할 몫(약 4분의 1)만 옮겼다. 캐시 서버 묶음, CDN 엣지 안의 서버 배정, 데이터를 여러 대에 나눠 저장하는 시스템이 이 방법을 쓴다.

## 더 바깥의 분배
로드 밸런서 자체도 한 대면 그것이 약점이 된다. 그래서 로드 밸런서를 여러 대 두고, 그 앞은 DNS가 여러 주소로 나누거나(8편), 같은 IP 주소를 여러 지역에서 동시에 알려 가장 가까운 곳으로 패킷이 가게 하는 **애니캐스트**(anycast)를 쓴다. CDN(16편)과 공용 DNS 서비스가 이 방식으로 세계의 요청을 받는다. 요청량에 따라 서버 수를 자동으로 늘리고 줄이는 **오토스케일링**은 새 서버가 헬스 체크를 통과하면 명단에 넣는 이 글의 장치 위에서 돈다.

## 흔한 오해
- "서버를 늘리면 무조건 빨라진다": 뒤의 데이터베이스가 병목이면 앱 서버를 늘려도 데이터베이스에 연결과 쿼리가 더 몰릴 뿐이다. 병목을 먼저 찾는다.
- "고정 세션이면 세션 문제가 해결된다": 그 서버가 죽으면 그 사용자들의 세션이 함께 사라지고, 부하도 고르게 나뉘지 않는다. 세션은 공유 저장소에 두는 편이 낫다.
- "헬스 체크가 200이면 건강하다": 프로세스는 살아 있는데 데이터베이스 연결이 끊긴 서버도 200을 줄 수 있다. 헬스 체크가 무엇까지 확인할지 정해야 하고, 너무 많이 확인하면 데이터베이스 하나의 문제로 모든 서버가 동시에 빠질 수 있다.

## 어디에 쓰이나
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: 프록시 하나와 앱 컨테이너 여러 개를 한 파일로 띄워 이 글의 구성을 직접 만들 수 있다.
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: 컨테이너의 헬스 체크가 로드 밸런서의 명단 관리와 같은 생각이다.
- PostgreSQL 실무 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: 앱 서버는 늘리기 쉽지만 데이터베이스를 여러 대로 나누는 일은 훨씬 어렵다.

## 정리
- 늘리기(scale out)는 한계가 없고 장애에 강하지만, 요청을 나누는 장치와 상태 없는 서버가 필요하다.
- 리버스 프록시는 서버들의 대문으로 TLS 종료, 길 안내, 압축, 캐시, 속도 제한을 맡고 원래 클라이언트 주소를 전달한다.
- 로드 밸런서는 L4(연결)나 L7(요청) 단위로 라운드 로빈, 가중치, 최소 연결, 해시 규칙에 따라 나누고, 헬스 체크로 아픈 서버를 뺀다.
- 해시로 나눌 때 일관된 해싱은 서버가 늘어도 일부 키만 옮긴다.

## 더 알아보기
- 이전 글: 17편 「작게 보내기: 압축, 코드 분할, 페이지네이션」
- 다음 글: 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」
