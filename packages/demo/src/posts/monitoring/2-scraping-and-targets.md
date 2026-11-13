# [Prometheus와 Grafana 모니터링 2/10] 설치와 첫 수집: 스크레이프와 타깃

> **한 줄 요약** — Prometheus 설정의 핵심은 "어떤 대상을(타깃), 얼마나 자주(간격), 어떤 라벨을 붙여(잡·라벨) 긁을지"이고, 대상 목록은 파일 기반 서비스 디스커버리로 재시작 없이 바꿀 수 있으며, 긁기마다 생기는 `up`·`scrape_duration_seconds`와 타깃 화면의 오류 문장이 수집 문제를 알려 준다.

## 이 글에서 다루는 것
- `prometheus.yml`의 구조: global, scrape_configs, 잡과 타깃
- `promtool`로 설정 검사하기
- 직접 만든 `/metrics` 대상 긁기
- 파일 기반 서비스 디스커버리: 재시작 없이 대상 추가
- 타깃 상태와 긁기 오류 읽기, 설정 다시 읽기

## 설정 파일의 구조
1편에서 본 `prometheus.yml`은 크게 두 부분이다.
- `global`: 모든 잡의 기본값. `scrape_interval`(긁는 간격, 기본 1분이지만 보통 15초로 둔다), `scrape_timeout`, `evaluation_interval`(규칙 계산 간격, 8편), `external_labels`(이 서버가 내보내는 모든 데이터에 붙일 라벨, 10편).
- `scrape_configs`: **잡**(job)의 목록. 같은 역할을 하는 대상들의 묶음이다. 잡마다 대상 주소(타깃)를 적고, 필요하면 간격·경로(`metrics_path`, 기본 `/metrics`)·스킴·추가 라벨을 덮어쓴다.

대상 목록은 `static_configs`에 직접 적을 수도 있지만, 서버가 자주 바뀌는 환경에서는 **서비스 디스커버리**로 받아 온다. 쿠버네티스, 클라우드, DNS, 그리고 가장 단순한 **파일 기반**(`file_sd_configs`)이 있다. 파일 기반은 지정한 JSON·YAML 파일을 지켜보다가 바뀌면 다시 읽으므로, 배포 도구가 그 파일만 고치면 재시작 없이 대상이 바뀐다.

## 직접 해 보기 1: 내 /metrics 만들기
대상은 결국 글자 페이지 하나다. 라이브러리 없이 손으로 `/metrics`를 내놓는 작은 서버를 만든다(4편에서는 라이브러리로 한다). 실행할 때 이름과 포트를 받는다.
```python
# 파일: shop.py
import sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer

NAME, PORT = sys.argv[1], int(sys.argv[2])
START = time.time()

class Metrics(BaseHTTPRequestHandler):
    def do_GET(self):
        body = (
            '# HELP shop_orders_total Orders received.\n'
            '# TYPE shop_orders_total counter\n'
            f'shop_orders_total{{shop="{NAME}"}} {int(time.time() - START) * 3}\n'
        ).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; version=0.0.4')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', PORT), Metrics).serve_forever()
```
대상 목록은 파일에 둔다. 처음에는 가게 하나다.
```yaml
# 파일: targets/shops.yml
- targets: ['127.0.0.1:9201']
  labels:
    env: lab
```
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
  evaluation_interval: 1s
scrape_configs:
  - job_name: shop
    file_sd_configs:
      - files: ['targets/*.yml']
        refresh_interval: 1s
```
설정을 바꾸기 전에는 Nginx의 `nginx -t`처럼 `promtool`로 검사한다.
```bash
promtool check config prometheus.yml
```
```text
Checking prometheus.yml
 SUCCESS: prometheus.yml is valid prometheus config file syntax

```

## 직접 해 보기 2: 긁고, 대상 늘리기
```bash
python3 shop.py seoul 9201 &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 --web.enable-lifecycle > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
q() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1"; }
until [ "$(q 'up{job="shop"}' | jq '.data.result | length')" = 1 ]; do sleep 0.5; done
q shop_orders_total | jq -c '.data.result[].metric'
```
```text
{"__name__":"shop_orders_total","env":"lab","instance":"127.0.0.1:9201","job":"shop","shop":"seoul"}
```
긁어 온 시계열에는 대상이 붙인 라벨(`shop`), 파일에서 붙인 라벨(`env`), Prometheus가 붙인 라벨(`job`, `instance`)이 모두 들어 있다. 메트릭 이름 자체도 `__name__`이라는 특별한 라벨이다. 이제 가게를 하나 더 열고, 대상 파일에 한 줄 더한다. 그리고 아직 띄우지 않은 세 번째 주소도 적는다.
```bash
python3 shop.py busan 9202 &
cat > targets/shops.yml <<'EOF'
- targets: ['127.0.0.1:9201', '127.0.0.1:9202', '127.0.0.1:9203']
  labels:
    env: lab
EOF
until [ "$(q 'up{job="shop"}' | jq '.data.result | length')" = 3 ]; do sleep 0.5; done
sleep 2
q 'up{job="shop"}' | jq -r '.data.result | sort_by(.metric.instance)[] | "\(.metric.instance) up=\(.value[1])"'
curl -s 127.0.0.1:9090/api/v1/targets | jq -r '.data.activeTargets[] | select(.health == "down") | .lastError'
```
```text
127.0.0.1:9201 up=1
127.0.0.1:9202 up=1
127.0.0.1:9203 up=0
Get "http://127.0.0.1:9203/metrics": dial tcp 127.0.0.1:9203: connect: connection refused
```
Prometheus를 다시 띄우지 않았는데 대상이 셋으로 늘었다. 살아 있는 두 곳은 `up=1`, 아무도 듣지 않는 세 번째는 `up=0`이고, 타깃 API(웹 화면의 Status → Targets와 같은 정보)가 실패 이유를 문장으로 알려 준다. 수집이 안 될 때 가장 먼저 볼 곳이다. 흔한 원인은 주소·포트 오타, 방화벽, `/metrics`가 아닌 경로, 그리고 긁는 시간이 `scrape_timeout`을 넘는 경우다.

## 긁기마다 생기는 지표
`up` 말고도 Prometheus는 긁을 때마다 대상별 시계열 몇 개를 만든다.
```bash
q 'scrape_samples_scraped{instance="127.0.0.1:9201"}' | jq -r '.data.result[0].value[1]'
q 'scrape_duration_seconds{instance="127.0.0.1:9201"} < 1' | jq -r '.data.result | length'
```
```text
1
1
```
`scrape_samples_scraped`는 한 번 긁을 때 받은 줄(샘플) 수다. 우리 가게는 한 줄을 내놓았다. 이 값이 갑자기 수만으로 뛰면 누군가 라벨에 값이 끝없는 것을 넣었다는 신호다(10편의 카디널리티). `scrape_duration_seconds`는 긁는 데 걸린 시간이다. 큰 대상이 시간 제한에 가까워지면 여기서 보인다.

## 설정 다시 읽기
`prometheus.yml` 자체를 바꿨다면 Prometheus 프로세스에 HUP 신호를 보내거나, `--web.enable-lifecycle`로 띄운 경우 `/-/reload`에 POST를 보낸다. 틀린 설정이면 거부하고 옛 설정으로 계속 돈다(Nginx 웹 서버 2편과 같다).
```bash
sed -i 's/scrape_interval: 1s/scrape_interval: 2s/' prometheus.yml
curl -s -X POST 127.0.0.1:9090/-/reload -o /dev/null -w 'reload: %{http_code}\n'
curl -s 127.0.0.1:9090/api/v1/status/config | jq -r '.data.yaml' | grep -m1 'scrape_interval'
```
```text
reload: 200
  scrape_interval: 2s
```

## 흔한 오해
- "간격을 짧게 할수록 정확하다": 1초 간격은 저장할 데이터를 15배로 늘린다. 대부분의 서비스는 15~30초면 충분하고, 그보다 짧은 변화는 히스토그램(3편)으로 잡는다.
- "`up`이 1이면 서비스가 건강하다": `/metrics` 페이지에 답했다는 뜻일 뿐이다. 앱이 내부적으로 오류를 내고 있어도 `up`은 1이다. 건강은 오류율·지연 같은 지표로 본다(7편).
- "대상을 바꾸려면 Prometheus를 다시 띄워야 한다": 서비스 디스커버리는 대상 목록을 계속 갱신하고, 설정 파일 변경도 다시 읽기로 충분하다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 서버를 늘리고 줄일 때 로드 밸런서의 명단과 모니터링의 대상 목록이 함께 바뀌어야 한다.
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: 컨테이너의 헬스 체크와 Prometheus의 `up`은 "살아 있음"을 각자의 방식으로 묻는다.
- Nginx 웹 서버 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」: 검사하고 다시 읽는 습관이 같다.

## 정리
- 설정은 global 기본값과 잡의 목록이다. 잡은 같은 역할의 대상 묶음이다.
- 대상 목록은 서비스 디스커버리로 받아 온다. 파일 기반은 파일만 고치면 재시작 없이 바뀐다.
- 긁어 온 시계열에는 대상·파일·Prometheus가 붙인 라벨이 모두 붙는다.
- 수집 문제는 `up`, 타깃의 `lastError`, `scrape_samples_scraped`, `scrape_duration_seconds`로 진단한다. 설정은 `promtool`로 검사하고 다시 읽는다.

## 더 알아보기
- 이전 글: 1편 「모니터링이란: 메트릭, 로그, 트레이스와 Prometheus」
- 다음 글: 3편 「메트릭 타입: 카운터, 게이지, 히스토그램, 서머리」
