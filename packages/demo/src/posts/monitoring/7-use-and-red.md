# [Prometheus와 Grafana 모니터링 7/10] 노드 익스포터와 USE·RED: 무엇을 볼 것인가

> **한 줄 요약** — 지표가 수백 개여도 볼 것은 정해져 있다. 서버 자원(CPU·메모리·디스크·네트워크)은 USE, 즉 사용률·포화·오류로, 서비스는 RED, 즉 요청 속도·오류·처리 시간으로 보고, 그중 사용자가 느끼는 것을 SLI로 정해 목표(SLO)와 오류 예산으로 관리한다.

## 이 글에서 다루는 것
- 무엇을 볼지 정하는 두 방법: USE와 RED, 그리고 네 가지 황금 신호
- 노드 익스포터로 보는 CPU·메모리·디스크·네트워크
- 직접 해 보기: CPU에 부하를 걸고 사용률이 오르는 것을 PromQL로 보기
- SLI·SLO·오류 예산: 숫자를 목표로 바꾸기

## 지표가 너무 많을 때
노드 익스포터 하나가 수백 개, 앱 계측(4편)이 수십 개, Redis·Nginx 익스포터가 또 수십 개의 지표를 내놓는다. 모두 그래프로 그리면 아무것도 보이지 않는다. 그래서 "어떤 질문에 답할 지표인가"를 먼저 정하는 방법론이 쓰인다.
- **USE**(자원마다): **사용률**(Utilization, 얼마나 바쁜가), **포화**(Saturation, 처리하지 못하고 줄 서 있는 일이 있는가), **오류**(Errors). 브렌던 그레그가 정리한, 서버 자원을 빠짐없이 점검하는 방법이다.
- **RED**(서비스마다): 요청 **속도**(Rate), **오류**(Errors), 처리 시간(**Duration**). 4편에서 앱에 단 세 가지가 이것이다.
- 구글의 SRE 책(2016)이 말한 **네 가지 황금 신호**(지연, 트래픽, 오류, 포화)는 둘을 합친 것에 가깝다.

USE는 "서버가 힘든가", RED는 "사용자가 힘든가"를 묻는다. 경보는 대개 RED에 걸고(사용자가 느끼는 문제), USE는 원인을 찾을 때와 용량을 계획할 때 본다.

## 노드 익스포터로 보는 USE
| 자원 | 사용률 | 포화·오류 |
| --- | --- | --- |
| CPU | idle이 아닌 시간 비율 | 부하 평균 대 코어 수 |
| 메모리 | 1 − 가용/전체 | 스왑 사용, OOM |
| 디스크 | 남은 공간, 바쁜 시간 | 입출력 대기 |
| 네트워크 | 주고받은 바이트 | 버려진 패킷, 오류 |

대표 지표는 이렇다.
- CPU: `node_cpu_seconds_total{mode=...}`는 코어·모드별로 쓴 초를 세는 카운터다. 사용률은 `1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))`.
- 포화: `node_load1`(1분 부하 평균)을 코어 수와 비교한다. 코어 수보다 꾸준히 크면 일이 줄 서 있다.
- 메모리: `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes`(남은 비율).
- 디스크: `node_filesystem_avail_bytes`(남은 공간), `rate(node_disk_io_time_seconds_total[1m])`(바쁜 시간 비율).
- 네트워크: `rate(node_network_receive_bytes_total[1m])`, 오류는 `node_network_receive_errs_total`.

## 직접 해 보기: CPU에 부하 걸기
노드 익스포터와 Prometheus를 띄우고, CPU 사용률·부하·메모리·디스크를 묻는다. 그다음 파이썬으로 코어 하나를 몇 초 동안 쉬지 않고 돌려, 사용률이 오르는 것을 본다. 컴퓨터마다 값이 다르므로 값 자체보다 변화와 범위를 출력한다.
```yaml
# 파일: prometheus.yml
global:
  scrape_interval: 1s
scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['127.0.0.1:9100']
```
```bash
prometheus-node-exporter --web.listen-address=127.0.0.1:9100 > node.log 2>&1 &
prometheus --config.file=prometheus.yml --storage.tsdb.path=data \
  --web.listen-address=127.0.0.1:9090 > prometheus.log 2>&1 &
until curl -s 127.0.0.1:9090/-/ready > /dev/null; do sleep 0.2; done
v() { curl -s 127.0.0.1:9090/api/v1/query --data-urlencode "query=$1" | jq -r '.data.result[0].value[1] // "없음"'; }
until [ "$(v 'count(node_cpu_seconds_total)')" != 없음 ]; do sleep 0.5; done
sleep 5
CPU_EXPR='1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5s]))'
before=$(v "$CPU_EXPR")
echo "코어 수: $(v 'count(count by (cpu) (node_cpu_seconds_total))' | awk '$1 >= 1 {print "1개 이상"}')"
echo "메모리 남은 비율이 0~1 사이: $(v 'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes' | awk '{print ($1 > 0 && $1 < 1)}')"
echo "루트 디스크 남은 공간 있음: $(v 'node_filesystem_avail_bytes{mountpoint="/"} > 0' | awk '{print ($1 > 0)}')"
```
```text
코어 수: 1개 이상
메모리 남은 비율이 0~1 사이: 1
루트 디스크 남은 공간 있음: 1
```
이제 코어 하나를 6초 동안 붙잡는다.
```bash
python3 -c "import time; end = time.time() + 6
while time.time() < end: pass" &
sleep 5
during=$(v "$CPU_EXPR")
busy_core=$(v 'max(1 - rate(node_cpu_seconds_total{mode="idle"}[3s]))')
awk -v b="$before" -v d="$during" 'BEGIN { print "부하 중 CPU 사용률이 올랐다:", (d > b) }'
awk -v c="$busy_core" 'BEGIN { print "가장 바쁜 코어의 사용률 80% 이상:", (c >= 0.8) }'
```
```text
부하 중 CPU 사용률이 올랐다: 1
가장 바쁜 코어의 사용률 80% 이상: 1
```
전체 평균 사용률이 올랐고, 그중 한 코어는 거의 100%였다. 코어가 많은 서버에서는 평균만 보면 "20%밖에 안 쓴다"로 보이지만, 단일 스레드 프로그램이 한 코어를 다 쓰고 있을 수 있다. `max`와 `avg`를 함께 보는 이유다. 부하 평균(`node_load1`)은 몇십 초에 걸쳐 따라 오르므로 이렇게 짧은 실험에서는 잘 보이지 않는다.
```bash
pkill -f 'web.listen-address=127.0.0.1:9090'; pkill -f 'prometheus-node-exporter --web.listen-address=127.0.0.1:9100'
```

## SLI, SLO, 오류 예산
RED 지표를 경보로 바꾸려면 "얼마면 문제인가"를 정해야 한다.
- **SLI**(서비스 수준 지표): 사용자 경험을 나타내는 비율. 예: "300ms 안에 성공한 요청의 비율" = `sum(rate(…_bucket{le="0.3"}[5m])) / sum(rate(…_count[5m]))`에서 오류를 뺀 것.
- **SLO**(서비스 수준 목표): SLI의 목표. 예: "30일 동안 99.9%".
- **오류 예산**: 1 − SLO. 99.9%라면 30일 동안 요청의 0.1%(약 43분 분량)는 실패해도 된다. 예산이 넉넉하면 새 기능을 빨리 내보내고, 바닥나면 안정화에 집중한다.

경보도 "오류율 1% 초과" 같은 고정 문턱보다 "이 속도로 실패하면 예산이 며칠 안에 바닥난다"는 **소진 속도**(burn rate)로 거는 방식이 흔해졌다. 짧게 출렁이는 것에는 깨우지 않고, 꾸준히 예산을 갉아먹는 것에는 빨리 깨운다(8편의 경보 규칙으로 만든다).

## 흔한 오해
- "CPU 사용률이 높으면 문제다": 일을 많이 하는 것은 좋은 일이다. 사용자 지연(RED)이 나빠지거나 포화(줄 선 일)가 생겨야 문제다.
- "평균 CPU가 낮으니 여유롭다": 코어 하나가 꽉 찬 단일 스레드 병목은 평균에 묻힌다. 코어별 최대를 함께 본다.
- "SLO는 100%가 목표다": 100%는 어떤 변경도 할 수 없다는 뜻이다. 사용자가 차이를 느끼지 못하는 선에서 목표를 정하고, 남는 예산으로 변경한다.

## 어디에 쓰이나
- Redis 실무 9편 「성능과 메모리: 파이프라이닝, 큰 키, 느린 명령」: 한 줄 실행의 Redis는 코어 하나가 포화되는 대표적인 예다.
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: 컨테이너 단위의 CPU·메모리 사용률과 한도가 USE의 컨테이너 판이다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 포화가 쌓이면 지연이 늘고 결국 붕괴한다는 흐름을 지표로 미리 본다.

## 정리
- USE(사용률·포화·오류)는 자원을, RED(속도·오류·처리 시간)는 서비스를 본다. 경보는 주로 RED에 건다.
- 노드 익스포터의 CPU·부하·메모리·디스크·네트워크 지표로 USE를 채운다. 평균과 최대를 함께 본다.
- 사용자 경험을 SLI로, 목표를 SLO로 정하고, 남는 실패의 몫(오류 예산)으로 변경 속도를 조절한다.

## 더 알아보기
- 이전 글: 6편 「PromQL 2: 집계, 백분위수, 벡터 매칭」
- 다음 글: 8편 「기록 규칙과 경보: 규칙 파일과 Alertmanager」
