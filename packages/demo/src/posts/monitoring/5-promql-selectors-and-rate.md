# [Prometheus와 Grafana 모니터링 5/10] PromQL 1: 선택자, 범위 벡터, rate

> **한 줄 요약** — PromQL은 메트릭 이름과 라벨 조건으로 시계열을 고르는 선택자에서 시작하고, `[5m]`을 붙인 범위 벡터를 `rate`·`increase`·`*_over_time` 같은 함수에 넣어 "지난 5분 동안 초당 얼마나 늘었나" 같은 질문을 하며, `rate`는 카운터가 재시작으로 0이 된 것을 알아서 보정한다.

## 이 글에서 다루는 것
- 순간 벡터와 라벨 조건(`=`, `!=`, `=~`, `!~`)
- 범위 벡터: 시계열의 최근 샘플 묶음
- `rate`, `irate`, `increase`: 카운터를 속도로
- 카운터 재시작과 `rate`의 보정
- 게이지에는 `*_over_time`, 과거와 비교하는 `offset`

## 실습 데이터 만들기
PromQL의 결과는 시각에 따라 달라지므로, 이 글과 다음 글은 정해 둔 가짜 데이터를 Prometheus에 넣고 정해 둔 시각에 질의한다. 2026년 1월 1일 0시부터 10분 동안 10초마다 기록된 데이터다. 서버 `a`는 초당 2개, 서버 `b`는 초당 1개의 요청을 받고, `a`는 1분에 1개꼴로 500 오류를 낸다. 그리고 `b`는 5분째에 재시작해 카운터가 0으로 돌아간다. 메모리 게이지도 하나 둔다.
```python
# 파일: make_data.py
T0 = 1767225600                                  # 2026-01-01 00:00:00 UTC
out = ['# HELP http_requests Requests.', '# TYPE http_requests counter']
for i in range(61):                              # 10초 간격, 10분
    t = T0 + i * 10
    b = i * 10 if i < 30 else (i - 30) * 10      # b는 5분(i=30)에 재시작
    out.append(f'http_requests_total{{instance="a",status="200"}} {i * 20} {t}')
    out.append(f'http_requests_total{{instance="a",status="500"}} {i // 6} {t}')
    out.append(f'http_requests_total{{instance="b",status="200"}} {b} {t}')
out += ['# HELP memory_bytes Memory in use.', '# TYPE memory_bytes gauge']
for i in range(61):
    out.append(f'memory_bytes{{instance="a"}} {500 + (i % 12) * 10} {T0 + i * 10}')
out.append('# EOF')
open('data.om', 'w').write('\n'.join(out) + '\n')
```
`promtool`로 이 파일을 Prometheus의 저장 블록으로 바꾸고(지난 데이터를 채워 넣는 backfill), 그 블록을 읽는 Prometheus를 띄운다. 오래된 데이터가 보존 기간 때문에 지워지지 않게 보존 기간을 길게 준다.
```bash
python3 make_data.py
promtool tsdb create-blocks-from openmetrics data.om data > /dev/null
prometheus --config.file=/dev/null --storage.tsdb.path=data --storage.tsdb.retention.time=10y \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
T=1767226200                                     # 10분이 되는 시각에 묻는다
q() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1" --data-urlencode "time=$T" \
      | jq -r '.data.result | sort_by(.metric | tostring)[] | "\(.metric | del(.__name__) | tostring) \(.value[1] // .values)"'; }
q 'http_requests_total'
```
```text
{"instance":"a","status":"200"} 1200
{"instance":"a","status":"500"} 10
{"instance":"b","status":"200"} 300
```
`q` 함수는 결과를 "라벨 값"으로 한 줄씩 보이게 정리한다. 메트릭 이름만 쓴 질의는 그 이름의 모든 시계열의 **지금 값**을 준다. 이것을 **순간 벡터**(instant vector)라고 한다.

## 라벨로 고르기
중괄호 안에 라벨 조건을 쓴다. `=`(같음), `!=`(다름), `=~`(정규식에 맞음), `!~`(정규식에 맞지 않음).
```bash
q 'http_requests_total{instance="a"}'
echo '---'
q 'http_requests_total{status=~"5.."}'
echo '---'
q 'http_requests_total{status!="500", instance!~"a|c"}'
```
```text
{"instance":"a","status":"200"} 1200
{"instance":"a","status":"500"} 10
---
{"instance":"a","status":"500"} 10
---
{"instance":"b","status":"200"} 300
```
`status=~"5.."`은 500번대 전부다. 정규식은 값 전체에 맞아야 한다(앞뒤에 `^…$`가 붙은 것처럼).

## 범위 벡터
선택자 뒤에 `[30s]`처럼 기간을 붙이면, 시계열마다 그 기간 안의 **샘플 묶음**을 돌려준다. 이것이 **범위 벡터**(range vector)다.
```bash
q 'http_requests_total{instance="a", status="200"}[30s]'
```
```text
{"instance":"a","status":"200"} [[1767226170,"1140"],[1767226180,"1160"],[1767226190,"1180"],[1767226200,"1200"]]
```
마지막 30초 안의 네 샘플(시각, 값)이 나왔다. 범위 벡터는 그래프로 그릴 수 없고, 함수에 넣어 숫자 하나로 줄여야 한다.

## rate, increase, irate
카운터의 지금 값(1200)은 쓸모가 없다(3편). 알고 싶은 것은 속도다.
- `rate(x[5m])`: 지난 5분 동안의 **초당 평균 증가량**.
- `increase(x[5m])`: 지난 5분 동안의 **증가량**(대략 `rate × 300`).
- `irate(x[5m])`: 범위 안의 **마지막 두 샘플**만으로 계산한 순간 속도. 빠르게 변하는 그래프에는 민감하지만 경보에는 너무 출렁인다.
```bash
q 'rate(http_requests_total[1m])'
echo '---'
q 'increase(http_requests_total{status="500"}[5m])'
```
```text
{"instance":"a","status":"200"} 2
{"instance":"a","status":"500"} 0.016666666666666666
{"instance":"b","status":"200"} 1
---
{"instance":"a","status":"500"} 5
```
서버 `a`는 초당 2개, `b`는 초당 1개, `a`의 오류는 초당 1/60개(1분에 1개)다. 지난 5분 동안 오류는 5번 늘었다. `rate`의 결과에는 메트릭 이름이 빠진다. 값의 뜻이 "총 요청 수"에서 "초당 요청 수"로 바뀌었기 때문이다.

## 재시작과 rate
서버 `b`는 5분째에 재시작해 카운터가 300에서 0으로 떨어졌다. 그 순간을 포함한 구간에서 값의 단순한 차이는 음수가 되지만, `rate`는 값이 줄어든 것을 재시작으로 보고 그 앞까지의 증가를 이어 붙인다.
```bash
T=1767225930                                     # 재시작(5분) 직후
q 'http_requests_total{instance="b"}[40s]'
q 'rate(http_requests_total{instance="b"}[40s])'
q 'http_requests_total{instance="b"} - http_requests_total{instance="b"} offset 40s'
```
```text
{"instance":"b","status":"200"} [[1767225890,"290"],[1767225900,"0"],[1767225910,"10"],[1767225920,"20"],[1767225930,"30"]]
{"instance":"b","status":"200"} 0.75
{"instance":"b","status":"200"} -260
```
첫 줄은 범위 안의 샘플이다. 290 다음에 0이 왔다. `rate`는 값이 줄어든 곳을 재시작으로 보고, 그 뒤의 0→10→20→30만 증가로 셌다. 결과 0.75는 실제 속도 1보다 조금 낮은데, 재시작 직전 마지막 기록(290) 이후 꺼지기 전까지 늘어난 몫은 아무 데도 기록되지 않아 알 수 없기 때문이다. 그래도 음수가 되거나 크게 튀지는 않는다. 반면 `offset 40s`로 40초 전 값을 빼면 -260이라는 엉터리가 나온다. 카운터는 언제나 `rate`나 `increase`로 다루고, 직접 빼지 않는다. 여기서 쓴 `offset`은 "그만큼 과거의 값"을 고르는 수식어로, 어제 같은 시각과 비교하는 데(`offset 1d`) 유용하다.

## 게이지에는 max_over_time 같은 함수
게이지는 `rate`가 아니라 값 그대로, 또는 기간 안의 최대·평균·최소로 본다.
```bash
T=1767226200
q 'max_over_time(memory_bytes[2m])'
q 'avg_over_time(memory_bytes[2m])'
pkill -f 'web.listen-address=127.0.0.1:9090'
```
```text
{"instance":"a"} 610
{"instance":"a"} 550.7692307692307
```
메모리는 2분 안에 최대 610바이트까지 올랐다. 순간 값만 보면 지나간 꼭대기를 놓친다.

## 범위는 얼마나 잡을까
`rate`의 범위는 긁기 간격의 **4배 이상**으로 잡는 것이 안전하다. 15초 간격이라면 `[1m]` 이상이다. 범위 안에 샘플이 두 개도 안 되면 결과가 비어 버리고, 한 번의 긁기 실패에도 그래프가 끊긴다. 범위를 길게 잡으면 매끄러워지는 대신 변화를 늦게 알아챈다. 대시보드는 `[5m]`, 경보는 상황에 따라 `[5m]`~`[15m]`이 흔하다.

## 흔한 오해
- "카운터의 지금 값으로 바쁨을 안다": 누적 값은 서버가 떠 있던 시간에 달려 있다. `rate`로 본다.
- "카운터는 빼서 증가량을 구하면 된다": 재시작이 끼면 음수가 된다. `increase`는 재시작을 보정한다.
- "`irate`가 더 정확하니 늘 `irate`를 쓰자": 마지막 두 샘플만 봐서 출렁인다. 경보와 기록 규칙에는 `rate`가 맞다.

## 어디에 쓰이나
- 미적분 2편 「미분: 순간 변화율」: `rate`는 카운터라는 누적 함수의 기울기(변화율)를 구간 평균으로 어림한 것이다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 초당 요청 수와 오류 비율이 레이트 리밋과 서킷 브레이커가 보는 바로 그 숫자다.
- PostgreSQL 실무 5편 「윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리」: 누적 합과 구간 계산을 SQL의 윈도 함수로 하는 방법과 비교해 볼 수 있다.

## 정리
- 메트릭 이름과 라벨 조건(`=`, `!=`, `=~`, `!~`)으로 순간 벡터를 고른다.
- `[기간]`을 붙이면 범위 벡터가 된다. 함수로 숫자 하나로 줄인다.
- 카운터는 `rate`(초당), `increase`(증가량)로 본다. 둘 다 재시작을 보정한다. 직접 빼지 않는다.
- 게이지는 `max_over_time`·`avg_over_time` 등으로 기간을 요약한다. `rate`의 범위는 긁기 간격의 4배 이상.

## 더 알아보기
- 이전 글: 4편 「앱 계측: 파이썬 앱에 메트릭 달기」
- 다음 글: 6편 「PromQL 2: 집계, 백분위수, 벡터 매칭」
