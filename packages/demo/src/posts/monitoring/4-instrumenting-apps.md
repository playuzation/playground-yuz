# [Prometheus와 Grafana 모니터링 4/10] 앱 계측: 파이썬 앱에 메트릭 달기

> **한 줄 요약** — 앱에 메트릭을 다는 일(계측)은 요청 수·오류·처리 시간이라는 기본 세 가지를 라우트 단위로 세는 것에서 시작하고, 이름에는 단위를 붙이며, 라벨에는 사용자 ID나 원래 URL처럼 값이 끝없이 많은 것을 넣지 않아야 시계열이 폭발하지 않는다.

## 이 글에서 다루는 것
- 무엇을 셀까: 요청 수, 오류, 처리 시간, 처리 중인 요청
- 이름 짓기 규칙: 단위, `_total`, 기본 단위
- 라벨 고르기: 라우트 템플릿과 상태 코드 묶기
- 직접 해 보기: 파이썬 웹 앱 계측하고 Prometheus로 긁기
- 라벨 하나가 시계열을 폭발시키는 장면

## 무엇을 셀까
계측(instrumentation)은 코드 안에 메트릭을 다는 일이다. 노드 익스포터(7편)가 운영체제의 상태를 알려 준다면, 앱의 사정은 앱만 안다. 모든 요청 처리 코드에 기본으로 다는 것은 세 가지다(7편의 RED 방법).
- **요청 수**(Rate): 카운터. 라우트, 메서드, 상태 코드별로.
- **오류**(Errors): 따로 세지 않고 위 카운터의 상태 코드 라벨로 구분한다.
- **처리 시간**(Duration): 히스토그램(3편). 라우트별로.

여기에 지금 처리 중인 요청 수(게이지), 그리고 주문 수·결제 금액 같은 **사업 지표**를 더한다. 사업 지표는 기술 지표가 멀쩡한데 무언가 잘못된 상황(결제 버튼이 안 보여서 주문이 0)을 잡아 준다.

## 이름과 라벨
이름은 관례를 따르면 질의할 때 헷갈리지 않는다.
- 소문자와 밑줄, 앞에 앱이나 영역 이름: `shop_http_requests_total`.
- 단위를 이름 끝에, 기본 단위로: 초는 `_seconds`(밀리초 아님), 크기는 `_bytes`.
- 카운터는 `_total`로 끝낸다(라이브러리가 붙여 준다).

라벨은 "나중에 이것으로 나눠 보고 싶은가"를 기준으로 고르되, **값의 종류가 적어야** 한다. 라벨 값의 조합마다 시계열이 하나씩 생기기 때문이다. `route="/products/:id"` 같은 라우트 템플릿은 좋고, `path="/products/1234"` 같은 원래 경로는 상품 수만큼 시계열을 만든다. 사용자 ID, 이메일, 요청 ID는 절대 라벨에 넣지 않는다. 그런 정보는 로그와 트레이스의 몫이다(1편).

## 직접 해 보기 1: 앱 계측하기
상품 조회와 결제 두 라우트를 가진 작은 웹 앱이다. 결제는 네 번에 한 번 실패하게 만들었다. 미들웨어처럼 모든 요청을 한곳에서 재고, `/metrics`에 결과를 내놓는다. 비교를 위해 원래 경로를 라벨로 쓰는 나쁜 카운터도 하나 달았다.
```python
# 파일: shop_app.py
import re, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQUESTS = Counter('shop_http_requests', 'HTTP requests.', ['method', 'route', 'status'])
LATENCY = Histogram('shop_http_request_duration_seconds', 'Request latency.', ['route'],
                    buckets=[0.01, 0.05, 0.1, 0.3, 1.0])
IN_FLIGHT = Gauge('shop_http_in_flight_requests', 'Requests being handled.')
ORDERS = Counter('shop_orders', 'Orders completed.')
BAD = Counter('shop_bad_requests_by_path', 'Do not do this.', ['path'])  # 나쁜 예

checkouts = 0

def route_of(path):                                   # 원래 경로 → 라우트 템플릿
    if re.fullmatch(r'/products/\d+', path):
        return '/products/:id'
    return path if path in ('/checkout',) else 'other'

class App(BaseHTTPRequestHandler):
    def handle_one(self):
        global checkouts
        if self.path == '/products/0':
            return 404
        if self.path.startswith('/products/'):
            time.sleep(0.02)
            return 200
        if self.path == '/checkout':
            checkouts += 1
            time.sleep(0.06)
            if checkouts % 4 == 0:
                return 500
            ORDERS.inc()
            return 200
        return 404

    def serve(self):
        if self.path == '/metrics':
            body = generate_latest()
            self.send_response(200)
            self.send_header('Content-Type', CONTENT_TYPE_LATEST)
            self.end_headers()
            self.wfile.write(body)
            return
        route, start = route_of(self.path), time.perf_counter()
        IN_FLIGHT.inc()
        try:
            status = self.handle_one()
        finally:
            IN_FLIGHT.dec()
        LATENCY.labels(route).observe(time.perf_counter() - start)
        REQUESTS.labels(self.command, route, str(status)).inc()
        BAD.labels(self.path).inc()
        self.send_response(status)
        self.send_header('Content-Length', '0')
        self.end_headers()

    do_GET = do_POST = serve

    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', 9301), App).serve_forever()
```
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
scrape_configs:
  - job_name: shop
    static_configs:
      - targets: ['127.0.0.1:9301']
```
앱과 Prometheus를 띄우고, 상품 50개를 한 번씩 보고, 결제를 8번, 없는 상품을 2번 요청한다.
```bash
python3 shop_app.py &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
for id in $(seq 1 50); do curl -s -o /dev/null 127.0.0.1:9301/products/$id; done
for i in $(seq 1 8); do curl -s -o /dev/null -X POST 127.0.0.1:9301/checkout; done
for i in 1 2; do curl -s -o /dev/null 127.0.0.1:9301/products/0; done
curl -s 127.0.0.1:9301/metrics | grep -E '^shop_(http_requests_total|orders_total)'
```
```text
shop_http_requests_total{method="GET",route="/products/:id",status="200"} 50.0
shop_http_requests_total{method="POST",route="/checkout",status="200"} 6.0
shop_http_requests_total{method="POST",route="/checkout",status="500"} 2.0
shop_http_requests_total{method="GET",route="/products/:id",status="404"} 2.0
shop_orders_total 6.0
```
상품 조회 52번이 원래 경로와 상관없이 라우트 템플릿 하나로 모였고, 결제 8번은 성공 6번과 실패 2번으로 나뉘었다. 주문 카운터도 6이다.

## 직접 해 보기 2: Prometheus에서 묻기
```bash
q() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1"; }
until [ "$(q 'shop_orders_total' | jq -r '.data.result[0].value[1]')" = 6 ]; do sleep 0.5; done   # 다음 긁기까지
q 'sum by (route) (shop_http_requests_total)' | jq -r '.data.result | sort_by(.metric.route)[] | "\(.metric.route): \(.value[1])"'
q 'sum(shop_http_requests_total{status=~"5.."}) / sum(shop_http_requests_total{route="/checkout"})' | jq -r '"결제 오류 비율: \(.data.result[0].value[1])"'
q 'shop_http_request_duration_seconds_bucket{route="/checkout", le="0.05"}' | jq -r '"결제 중 0.05초 안에 끝난 수: \(.data.result[0].value[1])"'
```
```text
/checkout: 8
/products/:id: 52
결제 오류 비율: 0.25
결제 중 0.05초 안에 끝난 수: 0
```
라우트별 요청 수, 결제의 오류 비율(8번 중 2번), 그리고 히스토그램에서 "0.05초 안에 끝난 결제가 하나도 없다"(모두 0.06초 넘게 걸렸다)를 읽었다. 실제로는 누적 값이 아니라 5편의 `rate()`로 "지난 5분 동안의 비율"을 본다.

## 라벨 하나가 시계열을 폭발시킨다
같은 요청을 원래 경로로 센 나쁜 카운터와 비교한다.
```bash
q 'count(shop_http_requests_total)' | jq -r '"라우트 템플릿 라벨: 시계열 \(.data.result[0].value[1])개"'
q 'count(shop_bad_requests_by_path_total)' | jq -r '"원래 경로 라벨: 시계열 \(.data.result[0].value[1])개"'
```
```text
라우트 템플릿 라벨: 시계열 4개
원래 경로 라벨: 시계열 52개
```
같은 요청을 셌는데 원래 경로 라벨은 시계열 52개를 만들었다. 상품이 100만 개인 쇼핑몰이라면 시계열이 100만 개 생겨 Prometheus의 메모리를 다 먹는다. 라벨에 들어갈 값의 종류가 몇 개인지, 끝이 있는지를 늘 먼저 따진다(10편).

## 흔한 오해
- "자세할수록 좋으니 라벨을 많이 달자": 라벨 조합마다 시계열이 생긴다. 끝없는 값은 로그와 트레이스로 보낸다.
- "오류 카운터를 따로 만들어야 한다": 상태 코드 라벨이 있으면 같은 카운터에서 오류율을 계산할 수 있다. 따로 만들면 둘의 합이 어긋나기 쉽다.
- "처리 시간은 밀리초로 재는 게 읽기 편하다": Prometheus 생태계의 관례는 초다. 대시보드(9편)가 단위를 바꿔 보여 준다.

## 어디에 쓰이나
- Nginx 웹 서버 10편 「로그와 문제 해결: 접근 로그, 오류 로그, 502와 504」: 로그로 셌던 상태 코드 분포와 느린 요청을 앱이 직접 메트릭으로 내놓는 것이다.
- 웹 앱의 원리 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」: `/products/:id` 같은 라우트 템플릿이 곧 메트릭의 라벨 단위가 된다.
- Redis 실무 2편 「키와 문자열: SET, GET, INCR, 만료」: 여러 서버의 카운터를 Prometheus 대신 Redis로 직접 모으는 방법과 비교할 수 있다.

## 정리
- 모든 요청 처리에 요청 수(상태 코드 포함)와 처리 시간 히스토그램을 단다. 처리 중 게이지와 사업 지표를 더한다.
- 이름은 영역 접두사, 기본 단위 접미사, 카운터는 `_total`.
- 라벨은 값의 종류가 적은 것만. 원래 경로 대신 라우트 템플릿, 상태 코드는 그대로 두고 질의에서 묶는다.
- 라벨 하나의 선택이 시계열 수를 수십, 수백만 배로 바꾼다.

## 더 알아보기
- 이전 글: 3편 「메트릭 타입: 카운터, 게이지, 히스토그램, 서머리」
- 다음 글: 5편 「PromQL 1: 선택자, 범위 벡터, rate」
