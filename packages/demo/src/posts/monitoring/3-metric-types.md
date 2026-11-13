# [Prometheus와 Grafana 모니터링 3/10] 메트릭 타입: 카운터, 게이지, 히스토그램, 서머리

> **한 줄 요약** — 카운터는 올라가기만 하는 누적 수(요청 수, 오류 수), 게이지는 오르내리는 현재 값(메모리, 대기열 길이), 히스토그램은 값을 정해 둔 구간(버킷)에 세어 나중에 백분위수를 어림하게 하는 분포, 서머리는 클라이언트가 직접 계산한 백분위수이며, 여러 서버를 합쳐야 한다면 히스토그램을 쓴다.

## 이 글에서 다루는 것
- 카운터: 누적만 하고, 재시작하면 0부터
- 게이지: 지금의 값
- 히스토그램: 누적 버킷, `_bucket`·`_sum`·`_count`
- 서머리: 미리 계산한 백분위수와 그 한계
- 직접 해 보기: 네 타입이 `/metrics`에 쓰이는 모양, 버킷으로 백분위수 어림하기

## 왜 타입이 필요한가
1편의 `/metrics` 페이지에는 `# TYPE` 줄이 있었다. 같은 숫자라도 성격이 다르면 다루는 법이 다르다. "지금까지 받은 요청 수"는 지금 값 자체보다 **얼마나 빨리 늘고 있는지**가 중요하고(5편의 `rate`), "지금 쓰는 메모리"는 값 그대로가 중요하다. 응답 시간처럼 요청마다 달라지는 값은 평균보다 **분포**가 중요하다. 이 시리즈의 파이썬 예제는 `pip install prometheus-client`로 설치하는 공식 라이브러리를 쓴다. 타입마다 `/metrics`에 무엇이 쓰이는지 직접 본다.

## 직접 해 보기 1: 네 타입의 모양
```python
from prometheus_client import (CollectorRegistry, Counter, Gauge, Histogram, Summary,
                               generate_latest, disable_created_metrics)

disable_created_metrics()                   # 생성 시각 줄은 생략(출력을 짧게)
reg = CollectorRegistry()
requests = Counter('shop_requests', 'Requests handled.', ['status'], registry=reg)
queue = Gauge('shop_queue_length', 'Jobs waiting.', registry=reg)
latency = Histogram('shop_latency_seconds', 'Request latency.',
                    buckets=[0.1, 0.3, 1.0], registry=reg)
size = Summary('shop_payload_bytes', 'Payload size.', registry=reg)

for status in ['200', '200', '200', '500']:
    requests.labels(status=status).inc()     # 카운터는 올리기만
queue.set(7); queue.dec(2)                   # 게이지는 오르내린다
for seconds in [0.05, 0.2, 0.25, 0.8, 1.5]:
    latency.observe(seconds)                 # 히스토그램은 값을 버킷에 센다
for n in [200, 400]:
    size.observe(n)

print(generate_latest(reg).decode().strip())
```
```text
# HELP shop_requests_total Requests handled.
# TYPE shop_requests_total counter
shop_requests_total{status="200"} 3.0
shop_requests_total{status="500"} 1.0
# HELP shop_queue_length Jobs waiting.
# TYPE shop_queue_length gauge
shop_queue_length 5.0
# HELP shop_latency_seconds Request latency.
# TYPE shop_latency_seconds histogram
shop_latency_seconds_bucket{le="0.1"} 1.0
shop_latency_seconds_bucket{le="0.3"} 3.0
shop_latency_seconds_bucket{le="1.0"} 4.0
shop_latency_seconds_bucket{le="+Inf"} 5.0
shop_latency_seconds_count 5.0
shop_latency_seconds_sum 2.8
# HELP shop_payload_bytes Payload size.
# TYPE shop_payload_bytes summary
shop_payload_bytes_count 2.0
shop_payload_bytes_sum 600.0
```
하나씩 읽어 보자.

## 카운터
카운터 이름에는 관례대로 `_total`이 붙는다. 라벨(`status`)마다 따로 센다. 카운터는 **줄어들지 않는다**. 단, 프로세스가 재시작하면 0부터 다시 센다. 그래서 카운터의 원래 값은 거의 보지 않고, 5편의 `rate()`로 "초당 얼마씩 늘었나"를 본다. `rate()`는 값이 갑자기 줄어든 것을 재시작으로 알아채고 보정한다. 요청 수, 오류 수, 보낸 바이트처럼 "지금까지 몇 번"인 것은 모두 카운터다. 줄어들 수 있는 값을 카운터로 만들면 `rate()`가 재시작으로 착각해 엉뚱한 값을 낸다.

## 게이지
게이지는 지금의 값이다. 7에서 2를 빼 5가 되었다. 메모리 사용량, 대기열 길이, 연결 수, 온도처럼 오르내리는 것에 쓴다. 게이지는 값 그대로 보거나, 일정 시간의 최대·평균(`max_over_time`, `avg_over_time`)을 본다.

## 히스토그램
히스토그램은 관측값을 미리 정한 **버킷**에 센다. 버킷은 **누적**이다. `le="0.3"`(less than or equal)은 "0.3초 이하인 관측 수"이고, 그 안에 0.1초 이하도 포함된다.
```text
values: 0.05 0.2 0.25 0.8 1.5
le=0.1  → 0.05                  : 1
le=0.3  → 0.05 0.2 0.25         : 3
le=1.0  → … + 0.8               : 4
le=+Inf → … + 1.5 (all)         : 5
```
`_count`는 전체 관측 수, `_sum`은 합(0.05+0.2+0.25+0.8+1.5=2.8)이다. 둘로 평균을, 버킷으로 "0.3초 안에 끝난 비율"(3/5=60%)이나 백분위수를 어림한다. 버킷 숫자들은 모두 카운터처럼 누적되므로, 서버 여러 대의 히스토그램을 **더해도** 의미가 유지된다. 그래서 "전체 서비스의 99번째 백분위수 응답 시간"을 구할 수 있다(6편의 `histogram_quantile`). 대가는 정밀도다. 버킷 경계 사이의 값은 알 수 없으니, 버킷은 관심 있는 기준(예: 목표가 300ms라면 0.3) 근처에 촘촘히 둔다. 버킷 하나하나가 시계열이므로 너무 많이 두면 비용이 커진다. Prometheus 2.40부터 실험적으로, 3.x에서 본격적으로 버킷을 자동으로 잡는 네이티브 히스토그램이 쓰인다.

## 서머리
서머리는 `_count`와 `_sum`에 더해, 클라이언트가 직접 계산한 백분위수(`{quantile="0.99"}`)를 내놓을 수 있다(파이썬 라이브러리는 백분위수를 계산하지 않고 개수와 합만 낸다). 정확하지만 치명적인 한계가 있다. 서버 A의 99번째 백분위수와 서버 B의 99번째 백분위수를 **합치거나 평균 내도 전체의 99번째 백분위수가 되지 않는다**. 서버가 여러 대인 서비스라면 히스토그램을 쓰고, 서머리는 개수와 합(평균) 정도로만 쓰는 편이 낫다.

## 직접 해 보기 2: 버킷으로 백분위수 어림하기
Prometheus의 `histogram_quantile`은 목표 순위가 들어 있는 버킷을 찾고, 그 버킷 안에서 값이 고르게 퍼져 있다고 보고 직선으로 어림한다. 응답 시간 1,000개(가상의 데이터)로 실제 99번째 백분위수와 두 가지 버킷 설계의 어림값을 비교한다.
```python
import random

rng = random.Random(42)
latencies = sorted(rng.lognormvariate(-2.0, 0.6) for _ in range(1000))   # 대부분 0.1초 근처
true_p99 = latencies[989]

def estimate(buckets, q=0.99):
    counts = [sum(1 for x in latencies if x <= b) for b in buckets]      # 누적 버킷
    rank = q * len(latencies)
    lower, below = 0.0, 0
    for b, c in zip(buckets, counts):
        if c >= rank:                                                    # 목표 순위가 든 버킷
            return lower + (b - lower) * (rank - below) / (c - below)    # 버킷 안은 고르게 가정
        lower, below = b, c

coarse = [0.1, 0.5, 1.0, 5.0]
fine = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 5.0]
print(f'실제 99번째 백분위수: {true_p99:.3f}초')
print(f'버킷 4개로 어림:      {estimate(coarse):.3f}초')
print(f'버킷 10개로 어림:     {estimate(fine):.3f}초')
```
```text
실제 99번째 백분위수: 0.533초
버킷 4개로 어림:      0.679초
버킷 10개로 어림:     0.550초
```
실제 값은 0.533초인데, 버킷 4개로는 0.679초로 어림했다. 99번째 순위가 0.5~1.0초의 넓은 버킷 안에 들어 있어서, 그 안에 값이 고르게 퍼져 있다고 가정하니 크게 빗나간 것이다. 0.5~1.0초 사이에 경계를 촘촘히 더하자 0.550초로 실제에 가까워졌다. 오차는 목표 순위가 든 버킷의 폭에 달려 있다. "300ms 안에 99%"가 목표라면 0.3초 경계를 꼭 두어, 적어도 "목표를 넘었나"는 정확히 알 수 있게 한다.

## 흔한 오해
- "카운터 값이 1,000,000이면 많이 바쁜 것이다": 누적 값은 서버가 얼마나 오래 떴는지에 달려 있다. 얼마나 바쁜지는 `rate()`로 본다.
- "평균 응답 시간만 보면 된다": 평균은 소수의 매우 느린 요청을 숨긴다. 사용자가 느끼는 것은 꼬리, 즉 95·99번째 백분위수다.
- "서머리가 더 정확하니 서머리를 쓰자": 서버 한 대 안에서는 정확하지만 여러 대를 합칠 수 없다. 대부분의 서비스에는 히스토그램이 맞다.

## 어디에 쓰이나
- 확률과 분포 7편 「연속 분포와 확률 밀도 함수」: 히스토그램이 어림하려는 분포와 그 꼬리의 개념이다.
- 통계학 1편 「기술 통계: 데이터를 숫자 몇 개로 요약하기」: 평균과 중앙값, 꼬리가 다른 이야기를 하는 이유를 숫자로 본다.
- Redis 실무 10편 「운영과 보안: ACL, 설정, 모니터링」: `keyspace_hits` 같은 카운터와 `used_memory` 같은 게이지가 실제로 섞여 있는 예다.

## 정리
- 카운터는 올라가기만 하는 누적 수다. 재시작하면 0부터이고, `rate()`로 본다.
- 게이지는 오르내리는 현재 값이다.
- 히스토그램은 누적 버킷과 `_sum`·`_count`로 분포를 담는다. 여러 서버를 더할 수 있고, 백분위수는 질의할 때 어림한다.
- 서머리는 클라이언트가 계산한 백분위수라 정확하지만 합칠 수 없다. 버킷은 목표 값 근처에 둔다.

## 더 알아보기
- 이전 글: 2편 「설치와 첫 수집: 스크레이프와 타깃」
- 다음 글: 4편 「앱 계측: 파이썬 앱에 메트릭 달기」
