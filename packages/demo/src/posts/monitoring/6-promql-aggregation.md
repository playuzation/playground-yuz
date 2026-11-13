# [Prometheus와 Grafana 모니터링 6/10] PromQL 2: 집계, 백분위수, 벡터 매칭

> **한 줄 요약** — `sum by (라벨)` 같은 집계로 서버 여러 대의 시계열을 원하는 단위로 합치고, 오류율은 "rate를 먼저, sum을 나중에" 계산하며, 백분위수는 히스토그램 버킷의 rate를 `le` 라벨을 남긴 채 합쳐 `histogram_quantile`에 넣고, 두 벡터의 연산은 라벨이 같은 시계열끼리 짝지어지므로 `on`·`group_left`로 짝짓는 법을 정한다.

## 이 글에서 다루는 것
- 집계 연산자: `sum`, `avg`, `max`, `count`, `topk`와 `by`·`without`
- 오류율 구하기: rate 먼저, sum 나중
- `histogram_quantile`로 서비스 전체의 백분위수
- 벡터 매칭: 라벨이 같은 것끼리, `on`, `group_left`
- 비교 연산자로 거르기, `absent`로 사라진 시계열 잡기

## 실습 데이터
5편처럼 정해 둔 데이터를 넣는다. 서버 `a`는 10초마다 요청 20개(그중 오류 1개), 서버 `b`는 10초마다 10개(오류 없음)를 처리한다. 응답 시간은 히스토그램으로, 버전 정보는 `build_info` 게이지로 둔다.
```python
# 파일: make_data.py
T0 = 1767225600
BUCKETS = ['0.1', '0.5', '1', '+Inf']
PER_10S = {'a': [15, 19, 20, 20], 'b': [4, 8, 10, 10]}   # 버킷별 누적 개수(10초마다)
ERRORS = {'a': 1, 'b': 0}
out = ['# HELP http_request_duration_seconds Latency.', '# TYPE http_request_duration_seconds histogram']
for i in range(61):
    t = T0 + i * 10
    for inst, counts in PER_10S.items():
        for le, c in zip(BUCKETS, counts):
            out.append(f'http_request_duration_seconds_bucket{{instance="{inst}",le="{le}"}} {i * c} {t}')
        out.append(f'http_request_duration_seconds_count{{instance="{inst}"}} {i * counts[-1]} {t}')
        out.append(f'http_request_duration_seconds_sum{{instance="{inst}"}} {i * counts[-1] * 0.2} {t}')
out += ['# HELP http_errors Errors.', '# TYPE http_errors counter']
for i in range(61):
    for inst, e in ERRORS.items():
        out.append(f'http_errors_total{{instance="{inst}"}} {i * e} {T0 + i * 10}')
out += ['# HELP build_info Build.', '# TYPE build_info gauge']
for i in range(61):
    for inst, v in [('a', '1.4.0'), ('b', '1.5.0')]:
        out.append(f'build_info{{instance="{inst}",version="{v}"}} 1 {T0 + i * 10}')
out.append('# EOF')
open('data.om', 'w').write('\n'.join(out) + '\n')
```
```bash
python3 make_data.py
promtool tsdb create-blocks-from openmetrics data.om data > /dev/null
prometheus --config.file=/dev/null --storage.tsdb.path=data --storage.tsdb.retention.time=10y \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
T=1767226200
q() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1" --data-urlencode "time=$T" \
      | jq -r '.data.result | sort_by(.metric | tostring)[] | "\(.metric | del(.__name__) | tostring) \(.value[1])"'; }
q 'rate(http_request_duration_seconds_count[1m])'
```
```text
{"instance":"a"} 2
{"instance":"b"} 1
```
서버별로 초당 2개, 1개다. 이제 이것을 서비스 단위로 합친다.

## 집계: sum by, without
집계 연산자는 여러 시계열을 하나로, 또는 지정한 라벨 단위로 합친다. `by (라벨)`은 그 라벨만 남기고 나머지를 합치고, `without (라벨)`은 그 라벨만 지우고 합친다.
```bash
q 'sum(rate(http_request_duration_seconds_count[1m]))'
q 'max(rate(http_request_duration_seconds_count[1m]))'
q 'count(build_info)'
q 'topk(1, rate(http_request_duration_seconds_count[1m]))'
q 'sum by (version) (build_info)'
```
```text
{} 3
{} 2
{} 2
{"instance":"a"} 2
{"version":"1.4.0"} 1
{"version":"1.5.0"} 1
```
서비스 전체는 초당 3개, 가장 바쁜 서버는 초당 2개, 서버는 2대, 버전별로 1대씩이다. `topk(1, …)`은 값이 가장 큰 시계열 하나를 라벨째로 고른다.

## 오류율: rate 먼저, sum 나중
서비스 전체의 오류율은 "오류의 초당 수"를 "요청의 초당 수"로 나눈 것이다. 순서가 중요하다. 카운터는 재시작이 있어서 `rate`를 먼저 해야 한다(5편). `sum(…_total)`을 먼저 하고 `rate`를 씌우면, 한 서버의 재시작이 합계를 줄여 엉뚱한 값이 나온다. 그래서 언제나 `sum(rate(…))`이다.
```bash
q 'sum(rate(http_errors_total[5m])) / sum(rate(http_request_duration_seconds_count[5m]))'
echo '--- 서버별'
q 'rate(http_errors_total[5m]) / rate(http_request_duration_seconds_count[5m])'
echo '--- 1%를 넘는 서버만'
q 'rate(http_errors_total[5m]) / rate(http_request_duration_seconds_count[5m]) > 0.01'
```
```text
{} 0.03333333333333333
--- 서버별
{"instance":"a"} 0.05
{"instance":"b"} 0
--- 1%를 넘는 서버만
{"instance":"a"} 0.05
```
전체 오류율은 3.3%(초당 0.1개 / 3개), 서버별로는 `a`가 5%, `b`가 0%다. 비교 연산자(`> 0.01`)는 조건을 만족하는 시계열만 남기는 **거르개**로 동작한다. 8편의 경보 규칙이 바로 이 모양이다. 값 대신 1과 0을 원하면 `> bool 0.01`처럼 `bool`을 붙인다.

## 백분위수: histogram_quantile
3편의 히스토그램 버킷으로 서비스 전체의 백분위수를 구한다. 버킷 카운터에 `rate`를 씌우고, 서버들을 합치되 **`le` 라벨은 남겨야** 한다. `histogram_quantile`은 `le`를 보고 버킷 경계를 안다.
```bash
q 'histogram_quantile(0.9, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))'
echo '--- 서버별'
q 'histogram_quantile(0.9, sum by (le, instance) (rate(http_request_duration_seconds_bucket[5m])))'
```
```text
{} 0.5
--- 서버별
{"instance":"a"} 0.4
{"instance":"b"} 0.75
```
서비스 전체의 90번째 백분위수는 0.5초, 서버별로는 `a`가 0.4초, `b`가 0.75초다. `b`의 요청은 적지만 느려서 전체 꼬리를 끌어올렸다. 숫자가 버킷 경계 사이의 값인 것은 3편에서 본 직선 어림 때문이다. `by (le)`를 빼먹으면 `le`가 사라져 결과가 비는데, 가장 흔한 실수다.

## 벡터 매칭: 누구와 누구를 계산하나
위의 서버별 오류율에서 `rate(errors) / rate(count)`가 서버끼리 짝지어진 것은 두 쪽의 라벨이 똑같이 `{instance="a"}`, `{instance="b"}`였기 때문이다. 이항 연산은 **라벨이 완전히 같은** 시계열끼리 짝짓는다. 라벨이 다르면 짝을 찾지 못해 결과에서 빠진다. 짝짓는 기준을 바꾸려면 `on(라벨)`(이 라벨만 보고 짝짓기)이나 `ignoring(라벨)`(이 라벨은 무시하기)을 쓴다. 한쪽의 시계열 하나가 다른 쪽의 여러 시계열과 짝지어지면(일대다) `group_left`로 많은 쪽을 정하고, 덤으로 적은 쪽의 라벨을 가져올 수 있다. 서버별 요청 속도에 버전 라벨을 붙여 보자.
```bash
q 'rate(http_request_duration_seconds_count[1m]) * on(instance) group_left(version) build_info'
q 'absent(up{job="checkout"})'
pkill -f 'web.listen-address=127.0.0.1:9090'
```
```text
{"instance":"a","version":"1.4.0"} 2
{"instance":"b","version":"1.5.0"} 1
{"job":"checkout"} 1
```
`build_info`는 값이 늘 1인 게이지라 곱해도 값은 그대로이고, `version` 라벨만 따라왔다. 대시보드에서 "새 버전 서버만 느린가"를 볼 때 쓰는 흔한 요령이다. 마지막 줄의 `absent`는 그런 시계열이 **하나도 없으면** 1을 돌려준다. 수집 자체가 끊겨 지표가 사라지면 "오류율 > 1%" 같은 경보는 조용해지므로, 중요한 대상에는 `absent` 경보를 함께 건다.

## 흔한 오해
- "`rate(sum(x))`도 같은 결과다": 문법상 쓸 수도 없지만(범위 벡터가 아니다), 기록 규칙으로 합계를 먼저 만들고 rate를 씌우면 재시작이 섞여 틀린다. 늘 `sum(rate(x))`.
- "서버별 백분위수를 평균 내면 전체 백분위수다": 위에서 0.4와 0.75의 평균은 0.575지만 버킷을 합쳐 구한 전체는 0.5다. 요청이 두 배 많은 `a`의 몫이 평균에는 반영되지 않기 때문이다. 버킷을 합친 다음 백분위수를 구한다.
- "연산 결과가 비면 값이 0이다": 짝을 찾지 못하거나 거르개에 걸려 시계열이 없을 수 있다. 라벨 집합을 먼저 확인한다.

## 어디에 쓰이나
- PostgreSQL 실무 4편 「조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기」: `sum by`는 SQL의 `GROUP BY`, 벡터 매칭은 조인과 같은 생각이다.
- 통계학 1편 「기술 통계: 데이터를 숫자 몇 개로 요약하기」: 평균과 백분위수가 다른 이야기를 하는 이유를 숫자로 본다.
- Nginx 웹 서버 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」: 서버별로 쪼개 본 오류율이 어느 백엔드를 빼야 하는지 알려 준다.

## 정리
- 집계 연산자는 `by`(남길 라벨)나 `without`(지울 라벨)으로 단위를 정한다.
- 오류율은 `sum(rate(오류)) / sum(rate(전체))`. rate가 먼저다.
- 백분위수는 `histogram_quantile(q, sum by (le) (rate(…_bucket[5m])))`. `le`를 남긴다.
- 이항 연산은 라벨이 같은 것끼리 짝짓는다. `on`·`ignoring`·`group_left`로 짝짓기를 바꾸고 라벨을 붙인다. 비교 연산자는 거르개, `absent`는 사라진 시계열을 잡는다.

## 더 알아보기
- 이전 글: 5편 「PromQL 1: 선택자, 범위 벡터, rate」
- 다음 글: 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」
