# [Prometheus와 Grafana 모니터링 1/10] 모니터링이란: 메트릭, 로그, 트레이스와 Prometheus

> **한 줄 요약** — 모니터링은 시스템이 지금 어떤지와 무엇이 언제부터 이상한지를 숫자(메트릭), 사건 기록(로그), 요청의 여정(트레이스)으로 아는 일이고, Prometheus는 대상들이 내놓은 `/metrics` 페이지를 주기적으로 긁어 와(pull) "이름+라벨"로 구별되는 시계열로 저장하고 질의·경보하는 메트릭 시스템이다.

## 이 글에서 다루는 것
- 왜 모니터링하나: 사용자보다 먼저 알기
- 메트릭, 로그, 트레이스의 차이
- Prometheus의 데이터 모델: 메트릭 이름, 라벨, 시계열
- 끌어오기(pull) 구조와 구성 요소
- 직접 해 보기: 노드 익스포터의 `/metrics` 읽기, Prometheus 띄워 첫 질의

## 왜 모니터링하나
서비스가 느려지거나 오류를 내기 시작했을 때 그것을 사용자의 항의 메일로 처음 안다면 이미 늦다. 모니터링의 목표는 세 가지다. 지금 정상인지 한눈에 보기(대시보드), 이상이 생기면 사람을 깨우기(경보), 그리고 문제가 생겼을 때 언제부터 무엇이 달라졌는지 거슬러 보기(진단). Nginx 웹 서버 10편에서는 로그를 awk로 훑어 느린 요청을 찾았다. 그 방식은 사건이 끝난 뒤의 조사로는 좋지만, 수십 대 서버의 오류율을 1초마다 보고 경보를 거는 데는 맞지 않는다. 그 일을 하는 것이 메트릭이다.

## 메트릭, 로그, 트레이스
| 종류 | 담는 것 | 잘하는 질문 |
| --- | --- | --- |
| 메트릭 | 시간에 따른 숫자 | 지금 오류율이 몇 %인가 |
| 로그 | 사건 하나하나의 기록 | 이 요청에 무슨 일이 있었나 |
| 트레이스 | 요청 하나가 거친 서비스들 | 어느 구간에서 느려졌나 |

**메트릭**은 "초당 요청 수", "남은 디스크", "응답 시간 분포" 같은 숫자를 일정 간격으로 기록한 것이다. 요청이 하루 1억 건이어도 메트릭은 카운터 몇 개라 싸고 빠르다. 대신 개별 요청의 사정은 모른다. **로그**는 요청 하나하나의 기록이라 자세하지만 양이 많다. **트레이스**는 요청 하나가 여러 서비스를 지나는 동안의 구간별 시간을 이어 붙인 것이다. 셋은 경쟁하지 않고 이어진다. 메트릭으로 이상을 알아채고, 로그와 트레이스로 원인을 찾는다. 이 시리즈는 메트릭을 중심으로 다루고, 마지막 10편에서 셋을 잇는 OpenTelemetry를 짧게 본다.

## Prometheus의 데이터 모델
**Prometheus**는 사운드클라우드에서 2012년에 시작되어 2015년 1월 공개되었고, 2016년 5월 쿠버네티스에 이어 CNCF의 두 번째 프로젝트가 되어 2018년 졸업했다. 데이터는 모두 **시계열**(time series)이다. 시계열 하나는 메트릭 이름과 라벨들의 조합으로 구별되고, 그 안에 (시각, 값) 쌍이 쌓인다.
```text
name:   http_requests_total
labels: {method="GET",status="200"}
  → one time series
labels: {method="POST",status="500"}
  → another time series
```
이름이 같아도 라벨 값이 다르면 다른 시계열이다. 그래서 "모든 요청 수"는 라벨을 무시하고 합치고, "500 오류만"은 라벨로 고른다(5편의 PromQL). 라벨은 강력하지만, 사용자 ID처럼 값이 끝없이 많은 것을 라벨로 쓰면 시계열이 폭발한다(10편의 카디널리티).

## 끌어오는 구조
```text
app /metrics ──┐
node /metrics ─┼─ scrape → Prometheus
exporters ─────┘           │ alerts
                           ↓
                      Alertmanager
Grafana ─ PromQL → Prometheus
```
- **대상**(target)은 자기 상태를 `/metrics`라는 HTTP 페이지에 글자로 내놓는다. 앱은 라이브러리로(4편), 운영체제·Redis·Nginx처럼 직접 내놓지 못하는 것은 **익스포터**(exporter)라는 작은 프로그램이 대신 내놓는다.
- **Prometheus 서버**는 설정된 대상들을 정해진 간격(보통 15초)마다 **긁어 와**(scrape) 자기 시계열 데이터베이스(TSDB)에 저장하고, 규칙을 계산한다(8편).
- **Alertmanager**는 Prometheus가 보낸 경보를 묶고 걸러 메일·메신저로 보낸다(8편).
- **Grafana**는 Prometheus에 질의해 대시보드를 그린다(9편).

대상이 Prometheus로 보내는(push) 대신 Prometheus가 가져오는(pull) 이유는, 대상이 죽었는지를 "긁기에 실패했다"로 바로 알 수 있고, 대상 쪽이 수집 서버의 주소를 몰라도 되기 때문이다.

## 직접 해 보기 1: /metrics 읽기
우분투라면 `sudo apt install prometheus prometheus-node-exporter`로 설치한다. 이 시리즈의 출력은 우분투 24.04 패키지(Prometheus 2.45, 노드 익스포터 1.7) 기준이다. 2024년 11월 나온 Prometheus 3.0은 화면과 일부 기본값이 바뀌었지만 이 시리즈의 개념과 질의는 그대로 통한다. 먼저 운영체제의 지표를 내놓는 노드 익스포터를 띄우고 `/metrics`를 읽는다.
```bash
prometheus-node-exporter --web.listen-address=127.0.0.1:9100 > node.log 2>&1 &
until curl -s 127.0.0.1:9100/metrics > /dev/null; do sleep 0.2; done
curl -s 127.0.0.1:9100/metrics | grep -E '^# (HELP|TYPE) node_cpu_seconds_total'
curl -s 127.0.0.1:9100/metrics | grep -c '^node_'
```
```text
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
…
```
페이지는 글자다. `# HELP`는 설명, `# TYPE`은 종류(3편), 그 아래 `이름{라벨} 값` 줄들이 이어진다. 노드 익스포터 하나가 CPU·메모리·디스크·네트워크에 관한 줄을 수백 개 내놓는다(개수는 컴퓨터마다 달라 가렸다).

## 직접 해 보기 2: Prometheus로 긁어 오기
설정 파일에 무엇을 얼마나 자주 긁을지 적는다. 실습이라 간격을 1초로 줄였다.
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
scrape_configs:
  - job_name: prometheus          # 자기 자신의 지표도 긁는다
    static_configs:
      - targets: ['127.0.0.1:9090']
  - job_name: node
    static_configs:
      - targets: ['127.0.0.1:9100']
```
```bash
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
q() { curl -s "127.0.0.1:9090/api/v1/query" --data-urlencode "query=$1"; }
until [ "$(q up | jq '.data.result | length')" = 2 ]; do sleep 0.5; done
q up | jq -c '.data.result | sort_by(.metric.job)[] | {job: .metric.job, instance: .metric.instance, up: .value[1]}'
q 'count(node_cpu_seconds_total{mode="idle"}) > 0' | jq -r '.data.result | length'
```
```text
{"job":"node","instance":"127.0.0.1:9100","up":"1"}
{"job":"prometheus","instance":"127.0.0.1:9090","up":"1"}
1
```
`up`은 Prometheus가 긁을 때마다 스스로 만드는 시계열로, 긁기에 성공하면 1, 실패하면 0이다. 긁어 온 시계열에는 `job`(설정의 묶음 이름)과 `instance`(대상 주소) 라벨이 자동으로 붙는다. 질의는 HTTP API(`/api/v1/query`)로 했고, 같은 질의를 Prometheus의 웹 화면(기본 9090번 포트)이나 Grafana에서 할 수 있다. 노드 익스포터를 끄면 `up`이 0이 되는 것도 확인한다.
```bash
pkill -f 'prometheus-node-exporter --web.listen-address=127.0.0.1:9100'
sleep 3
q 'up{job="node"}' | jq -r '.data.result[0].value[1]'
```
```text
0
```
대상이 죽었다는 사실 자체가 지표가 되었다. 8편에서는 `up == 0`이 일정 시간 이어지면 경보를 보내는 규칙을 만든다.

## 흔한 오해
- "모니터링은 그래프를 많이 그리는 것이다": 그래프보다 먼저 "무엇이 사용자에게 문제인가"를 정해야 한다. 7편의 RED·USE 방법이 그 출발점이다.
- "Prometheus가 로그도 모은다": 숫자 시계열만 다룬다. 로그와 트레이스는 다른 시스템(로그 수집기, 트레이싱 백엔드)이 맡는다.
- "끌어오기 방식이면 짧게 사는 작업은 못 잰다": 몇 초 만에 끝나는 배치 작업은 긁히기 전에 사라질 수 있다. 이런 경우를 위해 결과를 잠시 맡아 두는 Pushgateway가 있지만, 꼭 필요한 곳에만 쓴다.

## 어디에 쓰이나
- Nginx 웹 서버 10편 「로그와 문제 해결: 접근 로그, 오류 로그, 502와 504」: 로그로 하던 사후 조사를 메트릭으로 바꾸면 꾸준한 감시와 경보가 된다.
- Redis 실무 10편 「운영과 보안: ACL, 설정, 모니터링」: `INFO`의 지표를 익스포터로 Prometheus에 넘기면 적중률과 메모리를 시간에 따라 본다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 서킷 브레이커가 열리고 레이트 리밋이 거절하는 순간을 숫자로 보려면 메트릭이 필요하다.

## 정리
- 모니터링은 지금 상태 보기, 이상 알리기, 원인 거슬러 보기다. 메트릭·로그·트레이스가 서로를 잇는다.
- Prometheus의 데이터는 "메트릭 이름 + 라벨"로 구별되는 시계열이다.
- 대상은 `/metrics`에 글자로 상태를 내놓고, Prometheus가 주기적으로 긁어 온다. 직접 못 내놓는 것은 익스포터가 대신한다.
- `up`은 긁기 성공 여부이고, 대상이 죽은 것도 지표가 된다.

## 더 알아보기
- 다음 글: 2편 「설치와 첫 수집: 스크레이프와 타깃」

## 시리즈 안내
1. **모니터링이란: 메트릭, 로그, 트레이스와 Prometheus** ← 지금 읽는 글
2. 설치와 첫 수집: 스크레이프와 타깃
3. 메트릭 타입: 카운터, 게이지, 히스토그램, 서머리
4. 앱 계측: 파이썬 앱에 메트릭 달기
5. PromQL 1: 선택자, 범위 벡터, rate
6. PromQL 2: 집계, 백분위수, 벡터 매칭
7. 노드 익스포터와 USE·RED: 무엇을 볼 것인가
8. 기록 규칙과 경보: 규칙 파일과 Alertmanager
9. Grafana 대시보드: 데이터 소스, 패널, 변수, 프로비저닝
10. 운영과 확장: 보존, 카디널리티, 원격 저장, OpenTelemetry

이 시리즈 다음에 읽으면 좋은 글: 감시할 대상을 직접 띄워 보려면 Nginx 웹 서버 1편 「Nginx란: 이벤트 기반 웹 서버와 C10K」와 Redis 실무 1편 「Redis란: 메모리 위의 자료 구조 서버」, 모니터링 스택을 컨테이너로 묶으려면 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」, 여러 대로 나뉜 서비스에서 무엇을 재야 하는지는 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」를 함께 보면 좋다.
