# [Prometheus와 Grafana 모니터링 9/10] Grafana 대시보드: 데이터 소스, 패널, 변수, 프로비저닝

> **한 줄 요약** — Grafana는 Prometheus 같은 데이터 소스에 질의해 그 결과를 패널(시계열 그래프, 숫자, 표)로 그리는 대시보드 도구이고, 대시보드 변수로 한 화면을 서버마다 바꿔 보며, 데이터 소스와 대시보드를 YAML·JSON 파일로 만들어 두면(프로비저닝) 저장소에 담아 검토하고 어느 환경에나 똑같이 띄울 수 있다.

## 이 글에서 다루는 것
- Grafana의 구성: 데이터 소스, 대시보드, 패널, 변수
- 좋은 패널의 조건: 단위, 범위, 문턱
- 직접 해 보기: 데이터 소스와 대시보드를 파일로 프로비저닝하고 API로 확인하기
- Grafana를 거쳐 Prometheus에 묻기
- 대시보드를 코드로 관리하기

## Grafana의 구성
Prometheus에도 질의 화면이 있지만, 여러 그래프를 한 화면에 모아 늘 띄워 두고 함께 보려면 대시보드 도구가 필요하다. **Grafana**는 2014년 토르켈 외데고르가 시작한 오픈 소스 대시보드 도구로, 2021년부터 AGPLv3 라이선스다. Prometheus 외에도 로그(Loki), 트레이스(Tempo), 데이터베이스 등 수많은 데이터 소스를 함께 그린다.
- **데이터 소스**(data source): 어디에 묻는가. Prometheus의 주소와 인증.
- **대시보드**: 패널들을 배치한 한 화면. JSON 문서 하나다.
- **패널**(panel): 질의 하나 이상과 그리는 방식. 시계열 그래프(time series), 큰 숫자(stat), 게이지, 표, 히트맵 등.
- **변수**(variable): 대시보드 위쪽의 고르기 상자. `label_values(up, instance)`처럼 질의로 값 목록을 채우고, 패널 질의 안에서 `$instance`로 쓴다. 한 대시보드로 서버 100대를 하나씩 바꿔 본다.

## 좋은 패널의 조건
- **단위**를 정한다. 초(`s`), 바이트(`bytes`), 비율(`percentunit`, 0~1을 0~100%로)을 지정하면 Grafana가 0.0123을 "12.3 ms"나 "1.23%"로 읽기 좋게 보여 준다. 그래서 메트릭은 기본 단위(초, 바이트)로 내놓는다(4편).
- **범위**를 고정한다. 사용률은 0~1로 고정해야 5%가 화면 꼭대기까지 차오르는 착시를 막는다.
- **문턱**(threshold)을 색으로 표시한다. SLO 목표선(7편)을 그어 두면 "괜찮은가"가 한눈에 보인다.
- 한 화면에는 **위에서 아래로 질문의 순서**대로 놓는다. 맨 위에 RED(사용자가 괜찮은가), 그 아래 USE(자원이 괜찮은가), 맨 아래 세부.

## 직접 해 보기: 파일로 프로비저닝하기
Grafana 웹 화면에서 데이터 소스를 추가하고 패널을 끌어다 놓을 수도 있지만, 그렇게 만든 대시보드는 그 서버의 데이터베이스에만 있다. 대신 파일로 정의해 Grafana가 시작할 때 읽게 한다. 이것을 **프로비저닝**(provisioning)이라고 한다. 데이터 소스 파일이다.
```yaml
# 파일: provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prom
    type: prometheus
    url: http://127.0.0.1:9090
    access: proxy
    isDefault: true
```
대시보드는 "이 폴더의 JSON 파일들을 읽어라"는 공급자 설정과, 대시보드 JSON 자체로 이루어진다.
```yaml
# 파일: provisioning/dashboards/provider.yml
apiVersion: 1
providers:
  - name: files
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```
```json
// 파일: provisioning/dashboards/node.json
{
  "uid": "node-overview",
  "title": "노드 개요",
  "schemaVersion": 39,
  "templating": {
    "list": [{
      "name": "instance", "type": "query", "refresh": 1,
      "datasource": {"type": "prometheus", "uid": "prom"},
      "query": "label_values(up, instance)"
    }]
  },
  "panels": [
    {
      "type": "timeseries", "title": "CPU 사용률",
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0},
      "datasource": {"type": "prometheus", "uid": "prom"},
      "targets": [{"refId": "A",
        "expr": "1 - avg(rate(node_cpu_seconds_total{mode=\"idle\", instance=\"$instance\"}[1m]))"}],
      "fieldConfig": {"defaults": {"unit": "percentunit", "min": 0, "max": 1}}
    },
    {
      "type": "stat", "title": "메모리 남은 비율",
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
      "datasource": {"type": "prometheus", "uid": "prom"},
      "targets": [{"refId": "A",
        "expr": "node_memory_MemAvailable_bytes{instance=\"$instance\"} / node_memory_MemTotal_bytes{instance=\"$instance\"}"}],
      "fieldConfig": {"defaults": {"unit": "percentunit",
        "thresholds": {"mode": "absolute", "steps": [
          {"color": "red", "value": null}, {"color": "green", "value": 0.2}]}}}
    }
  ]
}
```
JSON 파일 첫 줄의 `// 파일:` 주석은 이 글의 표기일 뿐 실제 JSON에는 쓸 수 없으니, 따라 할 때는 지우고 저장한다(아래에서도 지우고 쓴다). 노드 익스포터와 Prometheus를 띄우고, Grafana는 공식 도커 이미지로 띄우면서 `provisioning` 폴더를 연결한다. `--network host`는 컨테이너 안의 Grafana가 이 컴퓨터의 Prometheus(127.0.0.1:9090)에 닿게 하려는 것이다(도커와 컨테이너 8편).
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 5s
scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['127.0.0.1:9100']
```
```bash
sed -i '1d' provisioning/dashboards/node.json          # 표기용 주석 줄을 지운다
prometheus-node-exporter --web.listen-address=127.0.0.1:9100 > node.log 2>&1 &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
docker rm -f grafana > /dev/null 2>&1
docker run -d --name grafana --network host -e GF_SERVER_HTTP_ADDR=127.0.0.1 \
  -v "$PWD/provisioning:/etc/grafana/provisioning:ro" grafana/grafana:latest > /dev/null
until curl -s 127.0.0.1:3000/api/health > /dev/null; do sleep 1; done
G() { curl -s -u admin:admin "127.0.0.1:3000$1" "${@:2}"; }
G /api/health | jq -c '{database, version: (.version | split(".")[0] + ".x")}'
G /api/datasources | jq -c '.[] | {name, type, url}'
G /api/dashboards/uid/node-overview | jq -c '{title: .dashboard.title, panels: [.dashboard.panels[].title], variables: [.dashboard.templating.list[].name], provisioned: .meta.provisioned}'
```
```text
{"database":"ok","version":"…"}
{"name":"Prometheus","type":"prometheus","url":"http://127.0.0.1:9090"}
{"title":"노드 개요","panels":["CPU 사용률","메모리 남은 비율"],"variables":["instance"],"provisioned":true}
```
Grafana가 시작하면서 파일을 읽어 데이터 소스와 대시보드를 만들었다(`provisioned: true`). 첫 접속 계정은 `admin`/`admin`이고, 실제 서버에서는 첫 로그인 때 바꾸거나 환경 변수(`GF_SECURITY_ADMIN_PASSWORD`)로 정한다. 브라우저로 `http://127.0.0.1:3000`을 열면 이 대시보드가 보이고, 위쪽의 `instance` 상자에 노드 익스포터의 주소가 채워져 있다.

## Grafana를 거쳐 Prometheus에 묻기
패널이 그래프를 그릴 때 Grafana는 데이터 소스에 질의를 보낸다. 같은 일을 API로 해 보면 Grafana가 Prometheus와 제대로 이어졌는지 확인할 수 있다.
```bash
until [ "$(curl -s 127.0.0.1:9090/api/v1/query --data-urlencode 'query=up' | jq '.data.result | length')" = 1 ]; do sleep 1; done
G /api/ds/query -H 'Content-Type: application/json' -d '{
  "from": "now-5m", "to": "now",
  "queries": [{"refId": "A", "datasource": {"uid": "prom"}, "expr": "up", "instant": true}]
}' | jq -c '.results.A.frames[0] | {labels: .schema.fields[1].labels, value: .data.values[1][0]}'
G /api/search?query=노드 | jq -r '.[].title'
docker rm -f grafana > /dev/null
pkill -f 'web.listen-address=127.0.0.1:9090'; pkill -f 'prometheus-node-exporter --web.listen-address=127.0.0.1:9100'
```
```text
{"labels":{"__name__":"up","instance":"127.0.0.1:9100","job":"node"},"value":1}
노드 개요
```
Grafana가 Prometheus에 `up`을 물어 값 1을 받아 왔다. 대시보드 검색도 된다. 이 API로 대시보드를 만들고 고치는 스크립트를 짤 수도 있지만, 대개는 위처럼 파일로 두고 저장소에서 관리한다.

## 대시보드를 코드로
프로비저닝한 대시보드는 저장소에 들어가므로 바뀐 내용을 풀 리퀘스트로 검토하고, 개발·운영 환경에 똑같이 배포하고, 실수로 지워도 다시 만들 수 있다. 화면에서 고친 내용은 파일로 다시 내보내(JSON export) 저장소에 반영하는 흐름을 정해 둔다. 대시보드가 수십 개로 늘면 JSON을 손으로 고치기 어려우므로 코드로 생성하는 도구(Jsonnet 라이브러리, Terraform의 Grafana 공급자 등)를 쓰기도 한다(Terraform 인프라 코드 1편 「인프라를 코드로: Terraform이란」). Grafana에도 자체 경보 기능이 있어서, Prometheus 밖의 데이터 소스까지 묶어 경보를 걸 수 있다. 다만 Prometheus 지표에 대한 경보는 8편처럼 Prometheus 규칙과 Alertmanager에 두는 편이 대시보드와 독립적이라 안전하다.

## 흔한 오해
- "대시보드가 많을수록 잘 관찰하고 있다": 아무도 보지 않는 대시보드는 장애 때 오히려 찾을 시간을 잡아먹는다. 서비스마다 첫 화면 하나(RED 맨 위)를 정한다.
- "그래프가 출렁이면 문제다": 범위를 고정하지 않으면 작은 변화가 크게 보인다. 단위, 범위, 문턱을 먼저 맞춘다.
- "Grafana에 지표가 저장된다": Grafana는 그리기만 하고, 데이터는 데이터 소스(Prometheus)에 있다. Prometheus의 보존 기간이 끝난 과거는 Grafana로도 볼 수 없다(10편).

## 어디에 쓰이나
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: Prometheus·Grafana·익스포터를 한 파일로 묶어 띄우는 가장 흔한 실습 구성이다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 대시보드 JSON의 변경을 코드처럼 검토하는 흐름이다.
- 웹 앱의 원리 5편 「화면을 어디서 그릴까: 서버 렌더링, 클라이언트 렌더링, 하이드레이션」: Grafana도 브라우저가 API로 데이터를 받아 그리는 싱글 페이지 앱이다.

## 정리
- Grafana는 데이터 소스에 질의해 패널로 그리는 도구다. 데이터는 데이터 소스에 있다.
- 패널은 단위·범위·문턱을 정하고, 위에서 아래로 RED → USE → 세부 순서로 놓는다.
- 변수(`label_values`)로 한 대시보드를 대상마다 바꿔 본다.
- 데이터 소스와 대시보드를 파일로 프로비저닝하면 저장소에서 검토하고 어디서나 똑같이 띄운다.

## 더 알아보기
- 이전 글: 8편 「기록 규칙과 경보: 규칙 파일과 Alertmanager」
- 다음 글: 10편 「운영과 확장: 보존, 카디널리티, 원격 저장, OpenTelemetry」
