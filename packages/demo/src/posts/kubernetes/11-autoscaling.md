# [쿠버네티스 실무 11/14] 오토스케일링: HPA, 메트릭, 노드 늘리기

> **한 줄 요약** — HPA(Horizontal Pod Autoscaler)는 메트릭 서버가 모은 파드의 CPU 사용률이 요청 대비 목표를 넘으면 디플로이먼트의 파드 수를 늘리고, 부하가 빠지면 안정화 시간을 기다린 뒤 줄이며, 파드를 놓을 자리가 모자라면 클러스터 오토스케일러나 Karpenter가 노드를 늘리고, 큐 길이 같은 바깥 메트릭으로는 KEDA가 늘린다.

## 이 글에서 다루는 것
- 늘리는 세 가지 방향: 파드 수, 파드 크기, 노드 수
- 메트릭 서버와 `kubectl top`
- HPA의 계산식과 안정화
- 직접 해 보기: 부하를 걸어 늘리고, 부하를 빼서 줄이기
- 노드 늘리기와 이벤트 기반 확장

## 늘리는 세 가지 방향
- **수평 확장**(HPA): 파드 **수**를 늘린다. 상태가 없는 웹 서버처럼 복제본을 더하면 처리량이 느는 앱에 맞다.
- **수직 확장**(VPA): 파드의 요청과 제한(9편)을 사용량에 맞게 **고쳐 준다**. 바꿀 때 파드를 다시 만드는 것이 기본이라, 추천값만 받아 보는 용도로 많이 쓴다.
- **노드 확장**: 파드가 들어갈 노드가 모자라면 노드 **수**를 늘린다. 클라우드의 Cluster Autoscaler나 Karpenter가 맡는다.

## 메트릭 서버
HPA가 CPU와 메모리를 보려면 누군가 모아야 한다. **메트릭 서버**(metrics-server)가 각 노드의 kubelet에서 사용량을 주기적으로 모아, `metrics.k8s.io` API로 내놓는다. `kubectl top`(9편)도 이것을 읽는다. 메트릭 서버는 최근 값만 들고 있는 가벼운 장치라, 지난 사용량의 그래프는 Prometheus(모니터링 시리즈)로 본다.

## HPA의 계산
HPA는 15초마다 이렇게 계산한다.

> 원하는 파드 수 = 올림(지금 파드 수 × 지금 사용률 ÷ 목표 사용률)

사용률은 **요청 대비** 퍼센트다. CPU 요청이 100m인 파드가 200m을 쓰면 200%다. 그래서 HPA를 쓰려면 요청이 반드시 있어야 한다. 파드 2개가 평균 150%이고 목표가 50%면, 2 × 150 ÷ 50 = 6개가 된다. 줄일 때는 사용량이 잠깐 떨어졌다 다시 오르면서 파드 수가 출렁이지 않게, **안정화 시간**(기본 5분) 동안의 가장 큰 추천값을 따른다.

## 직접 해 보기: 부하를 걸어 늘리기
요청마다 계산을 조금 하는 웹 서버를 만든다. busybox의 `httpd`에서 CGI 스크립트가 숫자를 3만까지 센다. CPU 요청은 100m이다.
```yaml
# 파일: calc.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: calc
spec:
  replicas: 1
  selector:
    matchLabels:
      app: calc
  template:
    metadata:
      labels:
        app: calc
    spec:
      containers:
        - name: httpd
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              mkdir -p /www/cgi-bin
              printf '#!/bin/sh\ni=0; while [ $i -lt 30000 ]; do i=$((i+1)); done\necho "Content-Type: text/plain"; echo; echo done\n' > /www/cgi-bin/work
              chmod +x /www/cgi-bin/work
              exec httpd -f -p 8080 -h /www
          resources:
            requests:
              cpu: 100m
---
apiVersion: v1
kind: Service
metadata:
  name: calc
spec:
  selector:
    app: calc
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: calc
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: calc
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50     # 요청 대비 평균 50%를 목표로
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 15 # 실습이라 줄이기 전 기다림을 짧게
```
HPA가 처음 사용률을 읽을 때까지 기다린다.
```bash
kubectl apply -f calc.yaml > /dev/null && kubectl rollout status deployment/calc --timeout=120s > /dev/null
until [ -n "$(kubectl get hpa calc -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}')" ]; do sleep 5; done
kubectl get hpa calc -o jsonpath='부하 없을 때: 파드 {.status.currentReplicas}개, 사용률 {.status.currentMetrics[0].resource.current.averageUtilization}%{"\n"}' | sed -E 's/[0-9]+%/…%/'
```
```text
부하 없을 때: 파드 1개, 사용률 …%
```
이제 요청을 계속 보내는 파드를 띄운다. 세 갈래로 쉬지 않고 요청한다.
```bash
kubectl run load --image=busybox:1.36 -- sh -c \
  'for j in 1 2 3; do (while true; do wget -qO- http://calc/cgi-bin/work > /dev/null; done) & done; wait' > /dev/null
until [ "$(kubectl get hpa calc -o jsonpath='{.status.desiredReplicas}')" -ge 3 ] 2>/dev/null; do sleep 5; done
hpa=$(kubectl get hpa calc -o jsonpath='{.metadata.uid}')      # 이 HPA의 이벤트만 고른다
echo "부하 중: 원하는 파드 수가 3개 이상으로 늘었다"
kubectl get events --field-selector involvedObject.uid=$hpa,reason=SuccessfulRescale \
  -o jsonpath='{.items[0].message}{"\n"}' | sed -E 's/New size: [0-9]+/New size: …/'
```
```text
부하 중: 원하는 파드 수가 3개 이상으로 늘었다
New size: …; reason: cpu resource utilization (percentage of request) above target
```
사용률이 목표를 넘자 HPA가 디플로이먼트의 `replicas`를 바꿨다. 몇 개까지 늘었는지는 부하와 컴퓨터 성능에 따라 달라 가렸다. 이어서 새 파드가 뜨고 서비스(5편)가 요청을 나눠 받으면서 파드마다의 사용률이 내려간다.

## 부하를 빼서 줄이기
```bash
kubectl delete pod load --now > /dev/null
until [ "$(kubectl get deployment calc -o jsonpath='{.spec.replicas}')" = 1 ]; do sleep 5; done
echo "부하가 끝난 뒤: 파드 수가 다시 1개"
kubectl get events --field-selector involvedObject.uid=$hpa,reason=SuccessfulRescale \
  --sort-by=.lastTimestamp -o jsonpath='{.items[-1:].message}{"\n"}' | sed -E 's/New size: [0-9]+/New size: …/'
kubectl delete -f calc.yaml --now > /dev/null; kubectl delete pods -l app=calc --now > /dev/null
```
```text
부하가 끝난 뒤: 파드 수가 다시 1개
New size: …; reason: All metrics below target
```
부하가 빠지고 안정화 시간(여기서는 15초)이 지나자 최소 개수로 돌아왔다. 운영에서는 기본 5분이나 그 이상을 두어, 짧게 출렁이는 트래픽에 파드를 띄웠다 내렸다 하지 않게 한다.

## 노드 늘리기
HPA가 파드를 늘려도 노드에 자리가 없으면 새 파드는 `Pending`이다(9편). 이때 노드 확장 장치가 움직인다.
- **Cluster Autoscaler**: `Pending` 파드가 있으면 미리 정한 노드 그룹의 노드 수를 늘리고, 오래 한가한 노드는 파드를 옮긴 뒤 줄인다.
- **Karpenter**: `Pending` 파드의 요청을 보고 그에 맞는 크기와 종류의 노드를 바로 골라 만든다. 노드 그룹을 미리 정하지 않아도 된다.

노드를 새로 띄우는 데는 몇 분이 걸린다. 그래서 갑작스러운 부하에는 약간의 여유 노드를 남겨 두거나(낮은 우선순위의 자리 표시 파드), HPA 목표 사용률을 낮게 잡아 미리 늘린다. 노드를 줄일 때는 파드가 쫓겨나므로, 10편의 우아한 종료와 PodDisruptionBudget(한 번에 몇 개까지 내려가도 되는지)을 함께 갖춘다.

## CPU 말고 다른 기준으로
CPU는 많은 경우에 좋은 신호지만, 늘 그렇지는 않다. 큐를 처리하는 작업자는 CPU가 낮아도 큐가 쌓이면 늘려야 한다. HPA는 사용자 정의 메트릭과 외부 메트릭도 받을 수 있고, **KEDA**는 카프카의 컨슈머 지연(카프카 이벤트 스트리밍 12편), Redis 리스트 길이, 클라우드 큐의 메시지 수 같은 바깥 이벤트를 기준으로 파드를 늘리고, 일이 없으면 0개까지 줄인다.

## 흔한 오해
- "HPA는 요청 없이도 동작한다": 사용률은 요청 대비라서, CPU 요청이 없으면 계산할 수 없다.
- "늘리면 바로 처리량이 는다": 새 파드가 뜨고 준비될 때까지(10편) 시간이 걸린다. 그동안 기존 파드가 버틸 여유가 있어야 한다.
- "파드 수는 최대치까지 넉넉하게": 데이터베이스 연결 수처럼 뒤쪽 자원이 함께 늘지 않으면, 파드를 늘릴수록 뒤쪽이 먼저 무너진다. 최대치는 뒤쪽의 한계에서 거꾸로 정한다.

## 어디에 쓰이나
- Prometheus와 Grafana 모니터링 10편 「운영과 확장: 보존, 카디널리티, 원격 저장, OpenTelemetry」: 메트릭 서버보다 긴 기록과 사용자 정의 메트릭을 다루는 쪽을 본다.
- 카프카 이벤트 스트리밍 6편 「컨슈머 그룹: 나눠 읽기와 리밸런스」: 컨슈머 파드를 파티션 수보다 많이 늘려도 노는 이유를 알아야 KEDA의 최대치를 정할 수 있다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 늘어나기 전까지의 몇 분을 버티는 장치들을 본다.

## 정리
- 확장은 파드 수(HPA), 파드 크기(VPA), 노드 수(Cluster Autoscaler, Karpenter) 세 방향이다.
- HPA는 메트릭 서버가 모은 요청 대비 사용률로 원하는 파드 수를 계산하고, 줄일 때는 안정화 시간을 기다린다.
- 노드가 모자라면 `Pending` 파드를 보고 노드 확장 장치가 노드를 늘린다.
- 큐 길이 같은 바깥 메트릭은 KEDA로 쓴다. 최대치는 뒤쪽 자원의 한계에서 정한다.

## 더 알아보기
- 이전 글: 10편 「프로브와 우아한 종료: 살아 있음과 준비됨은 다르다」
- 다음 글: 12편 「잡, 크론잡, 데몬셋: 디플로이먼트가 아닌 일들」
