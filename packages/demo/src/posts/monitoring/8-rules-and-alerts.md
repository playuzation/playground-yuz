# [Prometheus와 Grafana 모니터링 8/10] 기록 규칙과 경보: 규칙 파일과 Alertmanager

> **한 줄 요약** — 기록 규칙은 자주 쓰는 무거운 질의를 미리 계산해 새 시계열로 저장하고, 경보 규칙은 PromQL 조건이 `for` 기간 동안 이어지면 경보를 발생(firing)시키며, Alertmanager는 그 경보들을 묶고·걸러·조용히 시켜 사람에게 보내고, 이 모든 규칙은 `promtool test rules`로 가짜 데이터에 대고 미리 시험할 수 있다.

## 이 글에서 다루는 것
- 기록 규칙: 무거운 질의를 미리 계산하기, 이름 관례
- 경보 규칙: `expr`, `for`, 라벨과 주석, 상태(대기·발생·해소)
- `promtool test rules`: 규칙을 단위 테스트하기
- Alertmanager: 라우팅, 묶기, 반복, 침묵
- 직접 해 보기: 경보가 대기 → 발생 → 해소로 바뀌고 웹훅으로 도착하는 것까지

## 기록 규칙
6편의 `histogram_quantile(0.9, sum by (le) (rate(…[5m])))` 같은 질의는 대시보드가 열릴 때마다 수많은 시계열을 다시 계산한다. **기록 규칙**(recording rule)은 이런 질의를 `evaluation_interval`마다 미리 계산해 결과를 새 이름의 시계열로 저장한다. 대시보드와 경보는 그 결과를 읽기만 하면 된다. 이름은 `단위:메트릭:연산` 관례를 따른다. 예를 들어 `job:http_requests:rate5m`은 "잡 단위로 합친, http_requests의 5분 rate"다.

## 경보 규칙
**경보 규칙**(alerting rule)은 PromQL 결과가 하나라도 나오면 그 시계열마다 경보를 만든다. 6편의 거르개 모양(`> 0.05`)이 그대로 조건이 된다.
- `for: 5m`: 조건이 5분 동안 **계속** 참이어야 발생한다. 그 전까지는 **대기**(pending) 상태다. 잠깐의 출렁임으로 사람을 깨우지 않기 위해서다.
- `labels`: 경보에 붙일 라벨(심각도 등). Alertmanager가 이것으로 받을 사람을 고른다.
- `annotations`: 사람이 읽을 설명. `{{ $labels.instance }}`, `{{ $value }}` 같은 템플릿을 쓴다.

조건이 거짓이 되면 경보는 **해소**(resolved)된다. 규칙 파일을 만든다.
```yaml
# 파일: rules.yml
groups:
  - name: shop
    rules:
      - record: instance:http_errors:ratio_rate1m
        expr: rate(http_errors_total[1m]) / rate(http_requests_total[1m])
      - alert: HighErrorRate
        expr: instance:http_errors:ratio_rate1m > 0.05
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "{{ $labels.instance }} 오류율 {{ $value | humanizePercentage }}"
```
```bash
promtool check rules rules.yml
```
```text
Checking rules.yml
  SUCCESS: 2 rules found

```

## 규칙을 단위 테스트하기
규칙은 코드다. 문턱을 잘못 쓰거나 라벨 이름을 틀리면 정작 필요할 때 경보가 울리지 않는다. `promtool test rules`는 가짜 시계열을 넣고, 정해진 시각에 기록 규칙의 값과 발생 중인 경보를 기대한 것과 비교한다. `0+60x10`은 "0에서 시작해 간격마다 60씩, 10번"이라는 뜻이다.
```yaml
# 파일: rules_test.yml
rule_files: [rules.yml]
evaluation_interval: 1m
tests:
  - interval: 1m
    input_series:
      - series: 'http_requests_total{instance="a"}'
        values: '0+60x10'                 # 초당 1개
      - series: 'http_errors_total{instance="a"}'
        values: '0+0x3 0+6x6'             # 3분까지는 0, 그 뒤 분당 6개(10%)
    promql_expr_test:
      - expr: instance:http_errors:ratio_rate1m
        eval_time: 6m
        exp_samples:
          - labels: 'instance:http_errors:ratio_rate1m{instance="a"}'
            value: 0.1
    alert_rule_test:
      - eval_time: 5m                     # 조건이 참이 된 지 2분이 안 됐다: 대기 중
        alertname: HighErrorRate
        exp_alerts: []
      - eval_time: 7m                     # 2분 넘게 이어졌다: 발생
        alertname: HighErrorRate
        exp_alerts:
          - exp_labels: {severity: page, instance: a}
            exp_annotations:
              summary: "a 오류율 10%"
```
```bash
promtool test rules rules_test.yml
```
```text
Unit Testing:  rules_test.yml
  SUCCESS

```
기록 규칙은 6분에 정확히 0.1(10%)을 냈고, 경보는 5분에는 아직 대기, 7분에는 기대한 라벨과 설명으로 발생했다. 문턱이나 `for`를 바꾸면 이 테스트가 먼저 알려 준다. 규칙 파일을 저장소에 두고 CI에서 이 명령을 돌리는 것이 좋다.

## Alertmanager: 묶고, 거르고, 보내기
Prometheus는 발생한 경보를 Alertmanager에 계속 보낸다. Alertmanager는 다음을 한다.
- **라우팅**: 경보의 라벨을 보고 받을 곳(메일, 메신저, 호출 서비스, 웹훅)을 고른다. `severity="page"`는 당직에게, 나머지는 채팅방으로.
- **묶기**(grouping): 서버 50대에서 같은 경보가 동시에 나면 알림 50개가 아니라 한 개로 묶는다(`group_by`). 첫 알림 전에 잠깐 기다려 함께 묶을 경보를 모은다(`group_wait`).
- **반복**: 해결될 때까지 정해진 간격(`repeat_interval`)으로 다시 알린다.
- **억제와 침묵**: 데이터센터 전체가 끊겼으면 그 안의 서버별 경보는 억제(inhibit)하고, 점검 중에는 미리 침묵(silence)을 건다.

## 직접 해 보기: 경보가 사람에게 닿기까지
대기열 길이를 파일에서 읽어 내놓는 대상, 받은 알림을 기록하는 웹훅 수신기, Prometheus, Alertmanager를 띄운다. 실습이라 모든 간격을 몇 초로 줄였다.
```python
# 파일: queue_target.py
from http.server import BaseHTTPRequestHandler, HTTPServer

class Target(BaseHTTPRequestHandler):
    def do_GET(self):
        n = open('queue.txt').read().strip()
        body = f'# TYPE demo_queue_length gauge\ndemo_queue_length {n}\n'.encode()
        self.send_response(200); self.end_headers(); self.wfile.write(body)
    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 9401), Target).serve_forever()
```
```python
# 파일: webhook.py
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class Hook(BaseHTTPRequestHandler):
    def do_POST(self):
        msg = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with open('notifications.log', 'a') as f:
            for a in msg['alerts']:
                f.write(f"{msg['status']} {a['labels']['alertname']} {a['annotations']['summary']}\n")
        self.send_response(200); self.end_headers()
    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 9402), Hook).serve_forever()
```
```yaml
# 파일: live_rules.yml
groups:
  - name: queue
    rules:
      - alert: QueueTooLong
        expr: demo_queue_length > 100
        for: 3s
        labels: {severity: page}
        annotations:
          summary: "대기열 {{ $value }}개"
```
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
  evaluation_interval: 1s
rule_files: [live_rules.yml]
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['127.0.0.1:9093']
scrape_configs:
  - job_name: queue
    static_configs:
      - targets: ['127.0.0.1:9401']
```
```yaml
# 파일: alertmanager.yml
route:
  receiver: hook
  group_by: [alertname]
  group_wait: 1s
  group_interval: 2s
  repeat_interval: 1h
receivers:
  - name: hook
    webhook_configs:
      - url: http://127.0.0.1:9402/
        send_resolved: true
```
```bash
echo 20 > queue.txt
python3 queue_target.py & python3 webhook.py &
prometheus-alertmanager --config.file=alertmanager.yml --storage.path=am \
  --web.listen-address=127.0.0.1:9093 --cluster.listen-address= > am.log 2>&1 &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null && curl -s 127.0.0.1:9093/-/ready > /dev/null; do sleep 0.2; done
state() { curl -s 127.0.0.1:9090/api/v1/alerts | jq -r '.data.alerts[0].state // "inactive"'; }
sleep 3; echo "대기열 20: $(state)"
echo 500 > queue.txt                                  # 대기열이 갑자기 늘었다
until [ "$(state)" = pending ]; do sleep 0.2; done; echo "대기열 500 직후: pending"
until [ "$(state)" = firing ]; do sleep 0.2; done;  echo "3초 넘게 이어지자: firing"
until [ -s notifications.log ]; do sleep 0.2; done; cat notifications.log
```
```text
대기열 20: inactive
대기열 500 직후: pending
3초 넘게 이어지자: firing
firing QueueTooLong 대기열 500개
```
조건이 참이 되자 경보는 먼저 대기(pending)였다가, `for: 3s`를 넘기자 발생(firing)했고, Alertmanager가 웹훅으로 알림을 보냈다. 실제로는 이 웹훅 자리에 메신저나 호출 서비스가 들어간다. 이제 대기열을 줄이면 해소 알림이 온다.
```bash
echo 30 > queue.txt
until grep -q '^resolved' notifications.log; do sleep 0.2; done; cat notifications.log
```
```text
firing QueueTooLong 대기열 500개
resolved QueueTooLong 대기열 500개
```
`send_resolved: true` 덕분에 "해결됨" 알림도 왔다(설명은 마지막으로 발생했을 때의 값이다). 점검 중이라 이 경보를 잠시 받지 않으려면 침묵을 건다.
```bash
amtool --alertmanager.url=http://127.0.0.1:9093 silence add alertname=QueueTooLong \
  --duration=1h --comment="점검 중" --author=ops > /dev/null
amtool --alertmanager.url=http://127.0.0.1:9093 silence query -o json | jq -r '.[0] | "\(.status.state) \(.matchers[0].name)=\(.matchers[0].value) \(.comment)"'
pkill -f 'web.listen-address=127.0.0.1:9090'; pkill -f 'web.listen-address=127.0.0.1:9093'
```
```text
active alertname=QueueTooLong 점검 중
```

## 좋은 경보의 조건
- **사용자에게 문제인 것**에 건다(7편의 RED, SLO 소진 속도). CPU 80% 같은 원인 지표로 사람을 깨우면 대부분 헛걸음이다.
- **행동할 수 있어야** 한다. 받은 사람이 할 일이 없는 경보는 무시하는 습관만 만든다. 설명에 대응 문서 링크를 넣는다.
- `for`로 출렁임을 거르고, `absent`(6편)로 지표가 사라진 경우도 잡는다.
- 규칙은 `promtool test rules`로 시험하고, 실제 알림 경로(Alertmanager → 메신저)도 주기적으로 시험한다.

## 흔한 오해
- "경보 조건이 참이 되면 바로 알림이 온다": `for` 동안 대기하고, Alertmanager의 `group_wait`만큼 묶는다. 둘을 합친 시간이 알림의 지연이다.
- "경보가 조용하면 모든 것이 정상이다": 수집이 끊겨 지표가 사라져도 조건이 거짓이 되어 조용해진다. `absent`와 `up` 경보를 함께 둔다.
- "알림은 많을수록 안전하다": 알림 피로는 진짜 경보를 놓치게 만든다. 묶기와 억제, 그리고 경보 수 줄이기가 안전이다.

## 어디에 쓰이나
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 서킷 브레이커의 닫힘·열림처럼, 경보도 대기·발생·해소 상태를 오가는 상태 기계다.
- 컴퓨터와 AI의 첫걸음 4편 「유한상태기계란 무엇인가: 기억이 정해진 만큼인 기계」: 경보의 상태 변화를 유한상태기계로 그려 볼 수 있다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: `promtool check rules`와 `promtool test rules`를 CI 단계로 넣는 방법이다.

## 정리
- 기록 규칙은 무거운 질의를 미리 계산해 `단위:메트릭:연산` 이름의 시계열로 저장한다.
- 경보 규칙은 조건이 `for` 동안 이어지면 대기에서 발생으로 바뀌고, 조건이 사라지면 해소된다.
- `promtool test rules`로 가짜 데이터에 대고 기록 값과 경보를 미리 시험한다.
- Alertmanager는 라우팅·묶기·반복·억제·침묵으로 경보를 사람에게 알맞게 전달한다.

## 더 알아보기
- 이전 글: 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」
- 다음 글: 9편 「Grafana 대시보드: 데이터 소스, 패널, 변수, 프로비저닝」
