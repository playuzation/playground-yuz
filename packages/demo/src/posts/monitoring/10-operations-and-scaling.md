# [Prometheus와 Grafana 모니터링 10/10] 운영과 확장: 보존, 카디널리티, 원격 저장, OpenTelemetry

> **한 줄 요약** — Prometheus 서버 하나는 최근 데이터를 메모리와 로컬 디스크에 두고 정해진 기간만 보존하므로, 비용을 정하는 가장 큰 변수는 시계열 수(카디널리티)이고, 이것을 `sample_limit` 같은 안전장치로 묶으며, 오래 보관하거나 여러 서버를 합칠 때는 원격 저장으로 보내고, 메트릭·로그·트레이스를 잇는 표준으로 OpenTelemetry를 쓴다.

## 이 글에서 다루는 것
- 저장 구조: 메모리의 헤드 블록, WAL, 압축된 블록, 보존 기간
- 디스크와 메모리 어림하기
- 카디널리티: 시계열이 폭발하는 장면과 찾는 법, 막는 법
- 고가용성, 페더레이션, 원격 저장
- OpenTelemetry와 로그·트레이스

## 저장 구조와 보존
Prometheus의 시계열 데이터베이스(TSDB)는 들어온 샘플을 먼저 메모리의 **헤드 블록**에 쌓고, 장애에 대비해 디스크의 **WAL**(먼저 쓰는 로그, Redis 실무 7편의 AOF와 같은 생각)에도 남긴다. 2시간마다 헤드의 데이터를 압축된 **블록**으로 디스크에 내려쓰고, 블록들은 시간이 지나며 더 큰 블록으로 합쳐진다. 기본 보존 기간은 15일(`--storage.tsdb.retention.time`)이고, 크기로도 제한할 수 있다(`--storage.tsdb.retention.size`). 5편에서 지난 데이터를 넣을 때 보존 기간을 10년으로 늘린 이유가 이것이다.

## 디스크와 메모리 어림하기
Prometheus는 샘플 하나를 압축해 평균 1~2바이트 정도로 저장한다. 디스크는 대략 "시계열 수 × 하루 샘플 수 × 보존 일수 × 샘플당 바이트"다. 메모리는 헤드에 있는 **시계열 수**에 비례한다(시계열마다 라벨과 최근 데이터를 들고 있어 수 KB씩). 가상의 서비스로 어림해 본다.
```python
series = 200_000                     # 서버 50대 × 대상당 4,000개
interval = 15                        # 긁기 간격(초)
days = 15                            # 보존 기간
bytes_per_sample = 1.5
samples_per_day = 86_400 // interval
disk = series * samples_per_day * days * bytes_per_sample
print(f'하루 샘플: {series * samples_per_day:,}개')
print(f'디스크 어림: {disk / 1e9:.0f} GB')
print(f'간격을 15초→60초로: {disk / 4 / 1e9:.0f} GB, 시계열을 절반으로: {disk / 2 / 1e9:.0f} GB')
```
```text
하루 샘플: 1,152,000,000개
디스크 어림: 26 GB
간격을 15초→60초로: 6 GB, 시계열을 절반으로: 13 GB
```
디스크는 생각보다 작다. 실제로 비싼 것은 시계열 수에 비례하는 메모리와, 질의할 때 훑어야 하는 시계열의 양이다. 그래서 운영의 핵심 지표는 `prometheus_tsdb_head_series`(지금 헤드에 있는 시계열 수)다.

## 카디널리티 폭발
4편에서 원래 경로를 라벨로 쓰면 시계열이 늘어나는 것을 봤다. 이번에는 사용자 ID를 라벨로 쓴 지표가 들어왔을 때 서버 쪽에서 무슨 일이 생기는지 본다. 대상 하나가 사용자 5,000명분의 시계열을 내놓는다.
```python
# 파일: noisy.py
from http.server import BaseHTTPRequestHandler, HTTPServer

LINES = ''.join(f'shop_orders_by_user_total{{user_id="u{i}"}} {i % 7}\n' for i in range(5000))

class Target(BaseHTTPRequestHandler):
    def do_GET(self):
        body = ('# TYPE shop_orders_by_user_total counter\n' + LINES).encode()
        self.send_response(200); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 9501), Target).serve_forever()
```
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
scrape_configs:
  - job_name: noisy
    static_configs:
      - targets: ['127.0.0.1:9501']
```
```bash
python3 noisy.py &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 --web.enable-lifecycle > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
v() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1" | jq -r '.data.result[0].value[1] // "없음"'; }
until [ "$(v 'scrape_samples_scraped{job="noisy"}')" = 5000 ]; do sleep 0.5; done
echo "대상 하나가 긁기마다 내놓은 샘플: $(v 'scrape_samples_scraped{job="noisy"}')"
curl -s 127.0.0.1:9090/api/v1/status/tsdb | jq -r '.data.labelValueCountByLabelName[0] | "값이 가장 많은 라벨: \(.name) (\(.value)개)"'
curl -s 127.0.0.1:9090/api/v1/status/tsdb | jq -r '.data.seriesCountByMetricName[0] | "시계열이 가장 많은 메트릭: \(.name) (\(.value)개)"'
```
```text
대상 하나가 긁기마다 내놓은 샘플: 5000
값이 가장 많은 라벨: user_id (5000개)
시계열이 가장 많은 메트릭: shop_orders_by_user_total (5000개)
```
TSDB 상태 API(웹 화면의 Status → TSDB Status)는 어떤 메트릭과 라벨이 시계열을 가장 많이 만드는지 보여 준다. 카디널리티 문제를 찾을 때 가장 먼저 보는 곳이다. 사용자가 100만 명이면 이 메트릭 하나가 시계열 100만 개가 되어 서버의 메모리를 다 먹는다.

## 막는 법: sample_limit
고치는 것은 앱의 몫(4편)이지만, 서버 쪽에도 안전장치를 둔다. 잡마다 `sample_limit`을 걸면, 한 번 긁을 때 그보다 많은 샘플을 내놓는 대상은 **그 긁기 전체를 버리고** 실패로 처리한다.
```bash
cat >> prometheus.yml <<'EOF'
    sample_limit: 1000
EOF
curl -s -X POST 127.0.0.1:9090/-/reload > /dev/null
until [ "$(v 'up{job="noisy"}')" = 0 ]; do sleep 0.5; done
echo "up: $(v 'up{job="noisy"}')"
curl -s 127.0.0.1:9090/api/v1/targets | jq -r '.data.activeTargets[0].lastError'
pkill -f 'web.listen-address=127.0.0.1:9090'
```
```text
up: 0
sample limit exceeded
```
한도를 넘긴 대상은 `up=0`이 되고 이유가 남는다. 데이터를 잃는 대신 서버 전체가 쓰러지는 것을 막고, `up` 경보(8편)로 누가 한도를 넘겼는지 알게 된다. 특정 라벨이나 메트릭을 긁을 때 버리는 `metric_relabel_configs`도 같은 목적으로 쓴다.

## 서버 하나를 넘어서
- **고가용성**: 같은 설정의 Prometheus 두 대가 같은 대상을 따로 긁는다. 둘 다 경보를 보내지만 Alertmanager가 같은 경보를 하나로 합친다.
- **페더레이션**: 상위 Prometheus가 하위 서버들에서 기록 규칙(8편)으로 미리 줄인 시계열만 긁어 와 전체를 본다.
- **원격 저장**(remote write): 긁은 샘플을 다른 저장소로 실시간으로 보낸다. Thanos, Mimir, VictoriaMetrics 같은 시스템이 여러 Prometheus의 데이터를 모아 몇 년씩 보관하고 한꺼번에 질의하게 해 준다. 로컬에 거의 저장하지 않고 보내기만 하는 에이전트 모드도 있다.

## OpenTelemetry, 그리고 로그와 트레이스
1편에서 메트릭·로그·트레이스는 서로를 잇는다고 했다. 언어마다, 도구마다 계측 방식이 달라서 생기는 문제를 풀려고 2019년 OpenTracing과 OpenCensus 두 프로젝트가 합쳐져 **OpenTelemetry**가 되었다. 앱은 OpenTelemetry 라이브러리로 메트릭·로그·트레이스를 한 번에 계측하고, 공통 형식(OTLP)으로 수집기(Collector)에 보내며, 수집기가 메트릭은 Prometheus로, 로그와 트레이스는 각각의 저장소로 나눠 보낸다. Prometheus 3.0은 OTLP로 들어오는 메트릭을 직접 받을 수 있게 되었다. 메트릭 샘플에 그 순간의 트레이스 ID를 붙이는 **엑셈플러**(exemplar)를 쓰면, 대시보드의 느린 꼭대기 점을 눌러 바로 그 요청의 트레이스로 넘어갈 수 있다.

## 흔한 오해
- "Prometheus는 데이터를 오래 보관하는 저장소다": 기본은 15일이고, 서버 한 대의 디스크에 있다. 몇 달, 몇 년은 원격 저장의 일이다.
- "디스크만 넉넉하면 지표를 마음껏 늘려도 된다": 시계열 수는 메모리와 질의 속도를 직접 늘린다. 디스크보다 카디널리티가 먼저 한계다.
- "OpenTelemetry를 쓰면 Prometheus가 필요 없다": OpenTelemetry는 계측과 전달의 표준이고, 저장하고 질의하고 경보하는 일은 여전히 Prometheus 같은 백엔드가 한다.

## 어디에 쓰이나
- Redis 실무 7편 「영속성: RDB 스냅숏과 AOF」: 먼저 로그에 쓰고 나중에 압축된 스냅숏으로 만드는 구조가 WAL과 블록의 관계와 같다.
- 추상 데이터 타입 심화 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: 메모리에 모았다가 블록으로 내려쓰고 합치는 TSDB의 바탕 생각이다.
- 웹 앱의 원리 20편 「한 번의 클릭이 지나가는 길: 주소창에서 화면까지」: 요청 하나가 거치는 구간들이 트레이스가 보여 주는 바로 그 구간이다.

## 정리
- TSDB는 헤드 블록(메모리)과 WAL, 2시간마다 내려쓰는 블록으로 이루어지고, 기본 15일 보존한다.
- 비용의 핵심은 시계열 수다. `prometheus_tsdb_head_series`와 TSDB 상태로 카디널리티를 감시한다.
- `sample_limit`과 `metric_relabel_configs`로 서버 쪽 안전장치를 두고, 고치는 것은 앱의 라벨 설계다.
- 고가용성은 두 대와 Alertmanager의 중복 제거, 장기 보관과 통합은 원격 저장, 계측 표준은 OpenTelemetry다.
- 이 시리즈의 1~9편이 대상을 세우고(1·2편), 숫자를 정의하고(3·4편), 묻고(5·6편), 고르고(7편), 알리고(8편), 보여 주는(9편) 단계였다.

## 더 알아보기
- 이전 글: 9편 「Grafana 대시보드: 데이터 소스, 패널, 변수, 프로비저닝」
- 처음 글: 1편 「모니터링이란: 메트릭, 로그, 트레이스와 Prometheus」
