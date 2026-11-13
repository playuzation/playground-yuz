# [쿠버네티스 실무 9/14] 리소스 요청과 제한: 스케줄링, QoS, OOMKilled

> **한 줄 요약** — 요청(requests)은 "이만큼은 보장해 달라"는 예약으로 스케줄러가 파드를 놓을 노드를 고르는 기준이고, 제한(limits)은 "이 이상은 쓰지 못한다"는 상한으로, CPU를 넘으면 느려지기만 하지만 메모리를 넘으면 커널이 컨테이너를 죽이며(OOMKilled), 요청과 제한의 조합이 노드가 부족할 때 누가 먼저 쫓겨날지(QoS 등급)를 정한다.

## 이 글에서 다루는 것
- 요청과 제한, CPU와 메모리의 단위
- 스케줄러가 요청을 보는 방식: 할당 가능량과 Pending
- CPU 제한은 조절, 메모리 제한은 종료
- QoS 등급: Guaranteed, Burstable, BestEffort
- 직접 해 보기: 넘치는 요청, CPU 조절, 메모리 초과

## 요청과 제한
컨테이너마다 `resources`에 두 가지를 적는다.
- **요청**(`requests`): 이 컨테이너가 쓸 것으로 **예약**하는 양. 스케줄러는 노드에 남은 예약 가능량을 보고 파드를 놓는다.
- **제한**(`limits`): 이 컨테이너가 쓸 수 있는 **최대**치. 노드의 커널(cgroup)이 강제한다.

단위는 이렇다. CPU는 코어 수로, `1`은 코어 하나, `500m`(밀리코어)는 반 코어다. 메모리는 바이트로, `128Mi`(메비바이트), `1Gi`처럼 적는다. `128M`(10의 거듭제곱)과 `128Mi`(2의 거듭제곱)는 다르다.

## 스케줄러는 요청을 본다
노드는 자기 자원에서 운영체제와 쿠버네티스 부품 몫을 뺀 **할당 가능량**(allocatable)을 알린다. 스케줄러는 "노드의 할당 가능량 − 이미 놓인 파드들의 요청 합"이 새 파드의 요청보다 큰 노드만 고른다. 실제 사용량이 아니라 **요청의 합**을 본다는 점이 중요하다.
```bash
kubectl get node -o jsonpath='할당 가능: CPU {.items[0].status.allocatable.cpu}, 메모리 {.items[0].status.allocatable.memory}{"\n"}'
kubectl run greedy --image=busybox:1.36 --overrides='{"spec":{"containers":[{"name":"greedy","image":"busybox:1.36",
  "command":["sleep","3600"],"resources":{"requests":{"cpu":"64"}}}]}}' > /dev/null
until kubectl get events --field-selector involvedObject.name=greedy,reason=FailedScheduling -o name | grep -q .; do sleep 1; done
kubectl get pod greedy -o jsonpath='단계: {.status.phase}, 이유: {.status.conditions[?(@.type=="PodScheduled")].reason}{"\n"}'
kubectl get events --field-selector involvedObject.name=greedy,reason=FailedScheduling -o jsonpath='{.items[0].message}' \
  | grep -o '[0-9]*/[0-9]* nodes are available: [0-9]* Insufficient cpu'
kubectl delete pod greedy --now > /dev/null
```
```text
할당 가능: CPU …, 메모리 …
단계: Pending, 이유: Unschedulable
0/1 nodes are available: 1 Insufficient cpu
```
CPU 64개를 요청한 파드는 들어갈 노드가 없어 `Pending`에 머물렀다. 노드가 여럿이라면 스케줄러는 요청이 들어가는 노드 가운데 점수가 높은 곳(자원이 고르게 쓰이는 곳 등)을 고른다. 노드를 자동으로 늘리는 장치(11편)는 바로 이렇게 `Pending`인 파드를 보고 움직인다.

요청을 너무 작게 잡으면 한 노드에 파드가 지나치게 몰려 실제로는 자원이 모자라고, 너무 크게 잡으면 노드가 놀면서도 새 파드를 받지 못한다. 그래서 요청은 **평소 사용량**에 맞춰 잡고, 사용량은 메트릭(11편)으로 확인한다.

## CPU 제한: 느려질 뿐
CPU는 나눠 쓰는 시간이라, 제한을 넘으면 커널이 그 컨테이너를 잠시 멈춰 세운다(**스로틀링**). 죽이지는 않는다. 끝없이 계산하는 컨테이너에 CPU 제한 200m을 걸어 본다.
```bash
kubectl run burner --image=busybox:1.36 --overrides='{"spec":{"containers":[{"name":"burner","image":"busybox:1.36",
  "command":["sh","-c","while true; do :; done"],"resources":{"limits":{"cpu":"200m"}}}]}}' > /dev/null
kubectl wait --for=condition=Ready pod/burner --timeout=60s > /dev/null
until v=$(kubectl top pod burner --no-headers 2>/dev/null | awk '{print $2}') && [ -n "$v" ]; do sleep 5; done
echo "CPU 사용량이 200m 근처에 묶였다: $( m=${v%m}; [ $m -ge 150 ] && [ $m -le 250 ] && echo 예 )"
kubectl exec burner -- sh -c 'cat /sys/fs/cgroup/cpu.stat 2>/dev/null || cat /sys/fs/cgroup/cpu/cpu.stat' | grep -q 'nr_throttled [1-9]' && echo "멈춰 세워진 적이 있다: 예"
kubectl get pod burner -o jsonpath='재시작 횟수: {.status.containerStatuses[0].restartCount}{"\n"}'
kubectl delete pod burner --now > /dev/null
```
```text
CPU 사용량이 200m 근처에 묶였다: 예
멈춰 세워진 적이 있다: 예
재시작 횟수: 0
```
코어 하나를 다 쓰려던 프로세스가 0.2코어에 묶였고(`kubectl top`은 11편의 메트릭 서버에서 온다), cgroup의 통계에 스로틀링 횟수가 쌓였다. 웹 서버라면 응답이 느려지는 모습으로 나타난다. 그래서 응답 시간이 중요한 서비스는 CPU 제한을 두지 않거나 넉넉히 두고, 요청만 정확히 잡는 운영 방식도 흔하다.

## 메모리 제한: 넘으면 죽는다
메모리는 빌려준 것을 돌려받을 수 없으므로, 제한을 넘으면 커널의 OOM 킬러가 컨테이너의 프로세스를 **죽인다**. 64Mi 제한에서 200MB를 쓰려는 컨테이너를 띄운다.
```yaml
# 파일: hog.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hog
spec:
  restartPolicy: Never
  containers:
    - name: hog
      image: busybox:1.36
      command: ["sh", "-c", "head -c 200m /dev/zero | tail > /dev/null"]   # 200MB를 한 줄로 메모리에 담는다
      resources:
        requests:
          memory: 32Mi
        limits:
          memory: 64Mi
```
```bash
kubectl apply -f hog.yaml > /dev/null
until [ -n "$(kubectl get pod hog -o jsonpath='{.status.containerStatuses[0].state.terminated.reason}')" ]; do sleep 1; done
kubectl get pod hog -o jsonpath='종료 이유: {.status.containerStatuses[0].state.terminated.reason}, 종료 코드: {.status.containerStatuses[0].state.terminated.exitCode}{"\n"}'
kubectl delete -f hog.yaml --now > /dev/null
```
```text
종료 이유: OOMKilled, 종료 코드: 137
```
종료 코드 137은 128 + 9, 곧 `SIGKILL`로 죽었다는 뜻이다. 앱은 정리할 기회도 없이 끝난다. 디플로이먼트의 파드였다면 다시 시작되어 같은 일을 되풀이하며 CrashLoopBackOff(3편)에 빠진다. 메모리 제한은 실제 최대 사용량(자바라면 힙 바깥까지 포함해)보다 여유 있게 잡는다.

## QoS 등급
노드 전체의 메모리가 모자라면 kubelet은 파드를 **쫓아낸다**(eviction). 누구를 먼저 내보낼지는 요청과 제한의 조합으로 정해지는 **QoS 등급**이 기준이 된다.
- **Guaranteed**: 모든 컨테이너가 CPU와 메모리 모두 요청 = 제한. 가장 늦게 쫓겨난다.
- **Burstable**: 요청이나 제한이 일부 있다. 요청보다 많이 쓰는 파드부터 쫓겨난다.
- **BestEffort**: 아무것도 적지 않았다. 가장 먼저 쫓겨난다.

세 파드를 만들어 등급을 확인한다.
```bash
mk() { kubectl run $1 --image=busybox:1.36 --overrides="{\"spec\":{\"containers\":[{\"name\":\"c\",\"image\":\"busybox:1.36\",\"command\":[\"sleep\",\"3600\"],\"resources\":$2}]}}" > /dev/null; }
mk none '{}'
mk some '{"requests":{"memory":"32Mi"}}'
mk exact '{"requests":{"cpu":"100m","memory":"64Mi"},"limits":{"cpu":"100m","memory":"64Mi"}}'
kubectl get pods none some exact -o custom-columns=POD:.metadata.name,QOS:.status.qosClass
kubectl delete pod none some exact --now > /dev/null
```
```text
POD     QOS
none    BestEffort
some    Burstable
exact   Guaranteed
```
데이터베이스처럼 쫓겨나면 곤란한 파드는 Guaranteed로, 배치 작업처럼 자리가 날 때만 돌아도 되는 파드는 낮은 등급으로 둔다. 네임스페이스마다 기본값과 상한을 강제하려면 LimitRange와 ResourceQuota를 쓴다(13편).

## 흔한 오해
- "요청은 참고용이다": 스케줄러가 노드를 고르는 기준이다. 실제 사용량과 크게 다르면 노드가 몰리거나 놀게 된다.
- "CPU 제한을 넘으면 파드가 죽는다": CPU는 스로틀링으로 느려질 뿐이다. 죽는 것은 메모리다.
- "제한이 없으면 노드 전체를 쓸 수 있어 좋다": 이웃 파드와 노드를 함께 위험하게 만들고, 노드가 모자랄 때 먼저 쫓겨난다.

## 어디에 쓰이나
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: 요청과 제한이 결국 cgroup 설정이 되는 모습을 도커에서 먼저 본다.
- Prometheus와 Grafana 모니터링 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」: 사용량, 포화(스로틀링), 오류를 보는 USE 방법으로 요청과 제한을 다듬는다.
- Redis 실무 9편 「성능과 메모리: 파이프라이닝, 큰 키, 느린 명령」: 메모리 상한(maxmemory)과 컨테이너 메모리 제한을 함께 맞추지 않으면 OOMKilled로 이어진다.

## 정리
- 요청은 예약이자 스케줄링의 기준이고, 제한은 cgroup이 강제하는 상한이다.
- 요청이 들어갈 노드가 없으면 파드는 `Pending`이 된다.
- CPU 제한을 넘으면 스로틀링으로 느려지고, 메모리 제한을 넘으면 OOMKilled(종료 코드 137)로 죽는다.
- 요청과 제한의 조합이 QoS 등급(Guaranteed, Burstable, BestEffort)을 정하고, 노드가 모자랄 때 쫓겨나는 순서가 된다.

## 더 알아보기
- 이전 글: 8편 「볼륨과 StatefulSet: 파드가 사라져도 남는 데이터」
- 다음 글: 10편 「프로브와 우아한 종료: 살아 있음과 준비됨은 다르다」
