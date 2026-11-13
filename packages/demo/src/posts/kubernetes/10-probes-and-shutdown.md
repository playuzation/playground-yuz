# [쿠버네티스 실무 10/14] 프로브와 우아한 종료: 살아 있음과 준비됨은 다르다

> **한 줄 요약** — 준비 프로브(readiness)가 실패한 파드는 서비스의 엔드포인트에서만 빠지고, 활성 프로브(liveness)가 실패한 컨테이너는 다시 시작되며, 시작 프로브(startup)는 느리게 뜨는 앱을 그동안 보호하고, 파드를 지울 때는 SIGTERM을 받아 하던 일을 마무리하도록 앱과 유예 시간, preStop 훅을 맞춰야 요청을 잃지 않는다.

## 이 글에서 다루는 것
- 프로브 셋: 준비, 활성, 시작
- 검사 방법: HTTP, TCP, 명령 실행, gRPC
- 직접 해 보기: 준비되지 않은 파드는 빠지고, 죽은 파드는 다시 시작된다
- 파드가 지워질 때 일어나는 일: SIGTERM, 유예 시간, SIGKILL
- 직접 해 보기: 신호를 처리하는 컨테이너와 무시하는 컨테이너

## 프로브 셋
kubelet은 컨테이너의 상태를 주기적으로 검사한다. 이 검사를 **프로브**라고 하고, 목적이 셋이다.
- **준비 프로브**(readinessProbe): "지금 요청을 받을 수 있는가". 실패하면 그 파드를 서비스의 엔드포인트에서 **뺀다**(5편). 컨테이너는 그대로 둔다. 시작하며 캐시를 데우는 중이거나, 의존하는 DB가 잠깐 끊긴 경우가 여기에 해당한다. 4편의 롤링 업데이트도 이 "준비"를 기다린다.
- **활성 프로브**(livenessProbe): "살아 있는가". 실패가 이어지면 컨테이너를 **다시 시작한다**. 교착 상태에 빠져 프로세스는 있지만 아무 일도 못 하는 경우를 되살린다.
- **시작 프로브**(startupProbe): "다 떴는가". 이것이 성공할 때까지 나머지 두 프로브를 미룬다. 시작에 몇 분 걸리는 앱이 뜨는 도중에 활성 프로브에 걸려 죽는 것을 막는다.

검사 방법은 HTTP GET(200~399면 성공), TCP 연결, 컨테이너 안의 명령 실행(종료 코드 0이면 성공), gRPC 상태 확인이 있다. `periodSeconds`(간격), `failureThreshold`(몇 번 연속 실패해야 실패로 볼지), `timeoutSeconds`로 민감도를 조절한다.

## 직접 해 보기: 준비와 활성
파일 두 개로 상태를 흉내 내는 앱이다. `/tmp/ready`가 있으면 준비, `/tmp/alive`가 있으면 살아 있음이다. 시작할 때 둘 다 만든다.
```yaml
# 파일: api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: httpd
          image: busybox:1.36
          command: ["sh", "-c", "touch /tmp/ready /tmp/alive && mkdir /www && hostname > /www/index.html && httpd -f -p 8080 -h /www"]
          readinessProbe:
            exec:
              command: ["cat", "/tmp/ready"]
            periodSeconds: 1
            failureThreshold: 1
          livenessProbe:
            exec:
              command: ["cat", "/tmp/alive"]
            periodSeconds: 2
            failureThreshold: 2
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 8080
```
```bash
kubectl apply -f api.yaml > /dev/null && kubectl rollout status deployment/api --timeout=120s > /dev/null
ready() { kubectl get endpointslices -l kubernetes.io/service-name=api -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}x{end}' | wc -c; }
pods=($(kubectl get pods -l app=api -o jsonpath='{.items[*].metadata.name}'))
echo "처음: 준비된 엔드포인트 $(ready)개"
kubectl exec ${pods[0]} -- rm /tmp/ready                  # 첫 파드가 "준비 안 됨"이 된다
until [ "$(ready)" = 1 ]; do sleep 1; done
echo "준비 프로브 실패 뒤: 준비된 엔드포인트 $(ready)개"
kubectl get pod ${pods[0]} -o jsonpath='  첫 파드: ready={.status.containerStatuses[0].ready}, 재시작 {.status.containerStatuses[0].restartCount}번{"\n"}'
kubectl exec ${pods[0]} -- touch /tmp/ready
until [ "$(ready)" = 2 ]; do sleep 1; done
echo "다시 준비된 뒤: 준비된 엔드포인트 $(ready)개"
```
```text
처음: 준비된 엔드포인트 2개
준비 프로브 실패 뒤: 준비된 엔드포인트 1개
  첫 파드: ready=false, 재시작 0번
다시 준비된 뒤: 준비된 엔드포인트 2개
```
준비 프로브가 실패한 파드는 서비스에서 빠졌다가 돌아왔다. 컨테이너는 한 번도 다시 시작되지 않았다. 이번에는 둘째 파드를 "죽은" 상태로 만든다.
```bash
kubectl exec ${pods[1]} -- rm /tmp/alive
until [ "$(kubectl get pod ${pods[1]} -o jsonpath='{.status.containerStatuses[0].restartCount}')" = 1 ]; do sleep 1; done
kubectl get events --field-selector involvedObject.name=${pods[1]},reason=Killing -o jsonpath='{.items[0].message}{"\n"}'
kubectl rollout status deployment/api --timeout=60s > /dev/null && echo "다시 시작한 뒤: 준비된 엔드포인트 $(ready)개"
kubectl delete -f api.yaml --now > /dev/null; kubectl delete pods -l app=api --now > /dev/null
```
```text
Container httpd failed liveness probe, will be restarted
다시 시작한 뒤: 준비된 엔드포인트 2개
```
활성 프로브가 두 번 연속 실패하자 kubelet이 컨테이너를 다시 시작했고, 새 컨테이너가 파일을 다시 만들어 정상으로 돌아왔다.

## 프로브를 쓸 때 조심할 것
- **활성 프로브에 외부 의존성을 넣지 않는다.** DB 연결을 활성 프로브로 확인하면, DB가 잠깐 멈췄을 때 모든 파드가 동시에 재시작되어 장애가 커진다. 활성 프로브는 "이 프로세스 자체가 멈췄는가"만 본다. 의존성 문제는 준비 프로브로 다룬다.
- **활성 프로브는 넉넉하게.** 잠깐 느려진 것을 죽은 것으로 보면 재시작이 오히려 부하를 늘린다(웹 앱의 원리 19편의 연쇄 장애). 확신이 없으면 활성 프로브는 없이 시작해도 된다.
- **느린 시작은 시작 프로브로.** 활성 프로브의 첫 지연(`initialDelaySeconds`)을 길게 잡는 것보다, 시작 프로브에 넉넉한 `failureThreshold × periodSeconds`를 주는 편이 낫다.

## 파드가 지워질 때
롤링 업데이트, 축소, 노드 비우기 때마다 파드는 지워진다. 그 순간 이런 일이 **동시에** 시작된다.
1. 파드가 "종료 중"으로 표시되고, 엔드포인트에서 빠지기 시작한다. 각 노드의 kube-proxy와 인그레스 컨트롤러에 반영되기까지는 잠깐 걸린다.
2. `preStop` 훅이 있으면 먼저 실행한다.
3. 컨테이너의 PID 1에 **SIGTERM**을 보낸다. 앱은 새 요청을 그만 받고, 처리 중인 요청을 끝내고, 연결을 닫고 나가야 한다.
4. `terminationGracePeriodSeconds`(기본 30초)가 지나도 살아 있으면 **SIGKILL**로 끝낸다.

1번과 3번이 동시라서, 앱이 SIGTERM을 받자마자 바로 꺼지면 아직 이 파드로 보내는 중이던 요청이 실패한다. 그래서 `preStop`에서 몇 초 기다려 라우팅이 바뀔 시간을 벌어 주는 방법을 흔히 쓴다.
```yaml
lifecycle:
  preStop:
    sleep:
      seconds: 5      # 엔드포인트에서 빠지는 동안 기다린다
```

## 직접 해 보기: 신호를 처리하는 컨테이너와 무시하는 컨테이너
유예 시간을 8초로 두고, SIGTERM을 받으면 정리하고 끝내는 컨테이너와, 신호를 처리하지 않는 컨테이너를 지워 걸린 시간을 잰다. 셸이 PID 1이면 따로 처리하지 않은 SIGTERM은 무시된다.
```bash
term() {   # 이름과 명령을 받아 유예 시간 8초짜리 파드를 만든다
  kubectl run $1 --image=busybox:1.36 --overrides="{\"spec\":{\"terminationGracePeriodSeconds\":8,
    \"containers\":[{\"name\":\"c\",\"image\":\"busybox:1.36\",\"command\":[\"sh\",\"-c\",\"$2\"]}]}}" > /dev/null
}
term polite "trap 'echo 정리하고 끝냄; exit 0' TERM; while true; do sleep 1; done"
term deaf "while true; do sleep 1; done"
kubectl wait --for=condition=Ready pod/polite pod/deaf --timeout=60s > /dev/null
for p in polite deaf; do
  start=$(date +%s); kubectl delete pod $p > /dev/null; took=$(( $(date +%s) - start ))
  echo "$p: $( [ $took -le 3 ] && echo '3초 안에 끝남' || { [ $took -ge 7 ] && echo '유예 시간을 다 기다린 뒤 강제 종료'; } )"
done
```
```text
polite: 3초 안에 끝남
deaf: 유예 시간을 다 기다린 뒤 강제 종료
```
신호를 처리한 컨테이너는 곧바로 끝났고, 무시한 컨테이너는 8초를 꽉 채운 뒤 SIGKILL로 죽었다. 롤링 업데이트마다 이 시간이 쌓이고, 강제 종료된 앱은 처리 중이던 일을 잃는다. 앱을 셸 스크립트로 감싸 띄운다면 `exec`로 앱을 PID 1로 만들어 신호가 앱에 닿게 하고, 앱은 SIGTERM에 우아하게 끝나도록 만든다(도커와 컨테이너 3편).

## 흔한 오해
- "준비 프로브가 실패하면 파드가 재시작된다": 서비스에서 빠질 뿐이다. 재시작은 활성 프로브의 몫이다.
- "활성 프로브는 많이 넣을수록 안전하다": 잘못된 활성 프로브는 멀쩡한 파드를 반복해서 죽인다.
- "파드를 지우면 바로 사라진다": SIGTERM 뒤 유예 시간 동안 살아 있고, 그동안 엔드포인트에서 빠지는 일이 함께 진행된다. 이 순서를 맞추지 않으면 배포 때마다 오류가 난다.

## 어디에 쓰이나
- 도커와 컨테이너 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」: PID 1과 신호 처리, `docker stop`의 유예 시간을 먼저 본다.
- Nginx 웹 서버 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」: 상태 검사로 장애 서버를 빼는 같은 일을 로드 밸런서 쪽에서 본다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 성급한 재시작이 부하를 키우는 연쇄 장애의 모양을 본다.

## 정리
- 준비 프로브 실패는 서비스에서 빼기, 활성 프로브 실패는 재시작, 시작 프로브는 느린 시작 보호다.
- 활성 프로브에는 외부 의존성을 넣지 않고, 넉넉하게 잡는다.
- 파드를 지우면 엔드포인트에서 빠지는 일과 SIGTERM이 동시에 일어나고, 유예 시간이 지나면 SIGKILL이다.
- 앱이 SIGTERM을 처리하게 하고, `preStop`으로 라우팅이 바뀔 시간을 벌어 요청을 잃지 않는다.

## 더 알아보기
- 이전 글: 9편 「리소스 요청과 제한: 스케줄링, QoS, OOMKilled」
- 다음 글: 11편 「오토스케일링: HPA, 메트릭, 노드 늘리기」
