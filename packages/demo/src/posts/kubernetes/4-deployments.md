# [쿠버네티스 실무 4/14] 디플로이먼트: 개수 유지, 롤링 업데이트, 되돌리기

> **한 줄 요약** — 디플로이먼트는 파드 틀(template)마다 레플리카셋을 하나씩 두고, 틀이 바뀌면 새 레플리카셋을 조금씩 늘리면서 옛 레플리카셋을 조금씩 줄여 서비스를 멈추지 않고 버전을 바꾸며, 새 버전이 뜨지 않으면 옛 파드를 남긴 채 멈추고, 옛 레플리카셋을 기억해 두었다가 명령 하나로 되돌린다.

## 이 글에서 다루는 것
- 디플로이먼트, 레플리카셋, 파드의 관계
- 개수 바꾸기: `scale`
- 롤링 업데이트: `maxSurge`와 `maxUnavailable`
- 직접 해 보기: 버전 올리기, 잘못된 버전에서 멈추기, 되돌리기
- `Recreate` 전략과 배포 이력

## 세 층의 관계
1편에서 디플로이먼트를 만들자 레플리카셋과 파드가 생겼다(2편의 소유 관계).
- **레플리카셋**: "이 틀의 파드가 N개 있어야 한다"를 지키는 컨트롤러다. 개수만 안다.
- **디플로이먼트**: 레플리카셋 위에서 **버전 바꾸기**를 맡는다. 파드 틀(`spec.template`)이 바뀌면 그 틀로 새 레플리카셋을 만들고, 옛 것과 새 것의 개수를 조절하며 옮겨 간다.

그래서 레플리카셋을 직접 만들 일은 거의 없다. 레플리카셋 이름 뒤의 해시(`web-7d4b9c…`)는 파드 틀의 해시라서, 틀이 같으면 같은 레플리카셋을 다시 쓴다.

## 직접 해 보기: 배포와 개수 바꾸기
nginx 1.26 파드 4개를 띄운다. 업데이트 전략은 "한 번에 하나 더 띄우고(`maxSurge: 1`), 준비된 파드가 4개 아래로 내려가지 않게(`maxUnavailable: 0`)"다.
```yaml
# 파일: web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 4
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.26-alpine
```
```bash
kubectl apply -f web.yaml > /dev/null && kubectl rollout status deployment/web --timeout=180s | tail -1
kubectl scale deployment web --replicas=6 > /dev/null && kubectl rollout status deployment/web | tail -1
kubectl get deployment web -o jsonpath='원하는 수 {.spec.replicas}, 준비된 수 {.status.readyReplicas}{"\n"}'
kubectl scale deployment web --replicas=4 > /dev/null && kubectl rollout status deployment/web | tail -1
```
```text
deployment "web" successfully rolled out
deployment "web" successfully rolled out
원하는 수 6, 준비된 수 6
deployment "web" successfully rolled out
```
`scale`은 `spec.replicas`만 바꾼다. 파드 틀은 그대로라 레플리카셋도 그대로이고, 개수만 늘었다 줄었다.

## 롤링 업데이트
이미지를 1.27로 바꾼다. `kubectl set image`는 파드 틀의 이미지를 고치는 명령이다(YAML을 고쳐 `apply`해도 같다). 바꾼 이유를 `change-cause` 어노테이션으로 남기면 배포 이력에 보인다.
```bash
kubectl set image deployment/web nginx=nginx:1.27-alpine > /dev/null
kubectl annotate deployment web kubernetes.io/change-cause="nginx 1.27로 올림" > /dev/null
kubectl rollout status deployment/web --timeout=180s | tail -1
kubectl get replicasets -l app=web --sort-by=.metadata.creationTimestamp \
  -o custom-columns=IMAGE:.spec.template.spec.containers[0].image,DESIRED:.spec.replicas,READY:.status.readyReplicas
```
```text
deployment "web" successfully rolled out
IMAGE               DESIRED   READY
nginx:1.26-alpine   0         <none>
nginx:1.27-alpine   4         4
```
새 레플리카셋이 4개가 되고 옛 레플리카셋은 0개가 되었다. 옛 레플리카셋은 지워지지 않고 0개로 남는다. 되돌리기에 쓰기 위해서다(기본 10개까지, `revisionHistoryLimit`). 바뀌는 동안의 과정은 `kubectl describe deployment web`의 이벤트(`Scaled up replica set …`, `Scaled down replica set …`)에 차례로 남는다.

새 것을 하나 띄우고(`maxSurge: 1`이라 잠깐 5개), 그것이 **준비되면** 옛 것을 하나 줄이는 것을 네 번 되풀이했다. 파드 수는 이렇게 바뀌었다.

| 1.26 | 1.27 | 합계 |
| --- | --- | --- |
| 4 | 0 | 4 |
| 4 | 1 | 5 |
| 3 | 1 | 4 |
| 3 | 2 | 5 |
| 2 | 2 | 4 |
| 2 | 3 | 5 |
| 1 | 3 | 4 |
| 1 | 4 | 5 |
| 0 | 4 | 4 |

준비된 파드는 늘 4개 이상이었다(`maxUnavailable: 0`). 기본값은 둘 다 25%다. 늘 여유 파드를 하나 더 띄울 수 있다면 `maxUnavailable: 0`이 가장 안전하다.

## 잘못된 버전에서 멈추기
존재하지 않는 이미지 태그로 바꾼다. 새 파드는 이미지를 받지 못한다.
```bash
kubectl set image deployment/web nginx=nginx:9.99-does-not-exist > /dev/null
kubectl rollout status deployment/web --timeout=20s 2>&1 | tail -1
kubectl get pods -l app=web -o jsonpath='{range .items[*]}{.spec.containers[0].image} {.status.containerStatuses[0].ready} {.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}' | sort | uniq -c
```
```text
error: timed out waiting for the condition
      4 nginx:1.27-alpine true 
      1 nginx:9.99-does-not-exist false …
```
새 파드 하나가 `ErrImagePull`(또는 다시 시도하며 기다리는 `ImagePullBackOff`)에서 멈췄다. 새 파드가 준비되지 않으니 옛 파드는 하나도 줄지 않았고, 서비스는 1.27로 계속 돈다. 이렇게 멈춘 채 `progressDeadlineSeconds`(기본 600초)가 지나면 디플로이먼트에 `ProgressDeadlineExceeded`가 표시된다. 스스로 되돌리지는 않으므로, 배포 도구가 이 상태를 보고 알림을 보내거나 되돌린다.

## 되돌리기
```bash
kubectl rollout history deployment/web | tail -n +2
kubectl rollout undo deployment/web > /dev/null && kubectl rollout status deployment/web --timeout=120s | tail -1
kubectl get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl delete -f web.yaml
```
```text
REVISION  CHANGE-CAUSE
1         <none>
2         nginx 1.27로 올림
3         nginx 1.27로 올림

deployment "web" successfully rolled out
nginx:1.27-alpine
deployment.apps "web" deleted from default namespace
```
- 이력의 3번에도 "1.27로 올림"이 보인다. 어노테이션은 디플로이먼트에 붙어 있어, 바꾸지 않으면 다음 리비전에도 그대로 기록된다. 그래서 요즘은 이 어노테이션보다 Git 커밋(14편의 GitOps)으로 배포 이유를 남기는 편이다.
- `rollout undo`는 바로 앞 리비전(2번, 1.27)의 틀로 되돌렸다. 0개로 남아 있던 그 레플리카셋을 다시 키우는 것이다. `--to-revision=1`로 특정 리비전을 고를 수도 있다.
- 되돌리기도 롤링 업데이트로 진행되어 서비스가 멈추지 않는다.

## Recreate 전략
`strategy.type: Recreate`는 옛 파드를 모두 내린 **다음** 새 파드를 띄운다. 그동안 서비스가 멈춘다. 두 버전이 동시에 돌면 안 되는 경우(같은 디스크를 하나만 쓸 수 있거나, 데이터 형식이 호환되지 않을 때)에만 쓴다. 더 세밀한 배포(새 버전에 트래픽 5%만 보내기 같은 카나리 배포)는 디플로이먼트 둘과 서비스·인그레스를 조합하거나 Argo Rollouts 같은 도구를 쓴다.

## 흔한 오해
- "`kubectl rollout status`가 끝나면 사용자도 새 버전을 본다": 파드가 준비되었다는 뜻이다. "준비"의 기준은 10편의 준비 프로브가 정한다. 프로브가 없으면 컨테이너가 시작만 해도 준비로 본다.
- "디플로이먼트가 잘못된 배포를 알아서 되돌린다": 멈추기만 한다. 되돌리기는 사람이나 도구가 한다.
- "`latest` 태그로 배포하면 편하다": 파드 틀이 바뀌지 않아 롤링 업데이트가 일어나지 않고, 어떤 버전이 도는지도 알 수 없다. 버전 태그나 다이제스트를 쓴다.

## 어디에 쓰이나
- 도커와 컨테이너 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」: 롤링 업데이트가 기대하는 "바뀌지 않는 버전 태그"를 만드는 법을 본다.
- Nginx 웹 서버 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」: 서버를 하나씩 빼고 넣으며 무중단으로 바꾸는 일을 로드 밸런서 쪽에서 본다.
- Terraform 인프라 코드 9편 「변경을 안전하게: lifecycle, moved, import, replace」: 새것을 먼저 만들고 옛것을 지우는 `create_before_destroy`가 `maxSurge`와 같은 생각이다.

## 정리
- 디플로이먼트는 파드 틀마다 레플리카셋을 두고, 레플리카셋이 개수를 지킨다.
- 틀이 바뀌면 `maxSurge`와 `maxUnavailable`에 맞춰 새 레플리카셋을 늘리고 옛 것을 줄인다. 새 파드가 준비되어야 다음 단계로 간다.
- 새 버전이 뜨지 않으면 옛 파드를 남긴 채 멈춘다. `rollout undo`로 남겨 둔 옛 레플리카셋으로 되돌린다.
- 두 버전이 함께 돌면 안 될 때만 `Recreate`를 쓴다.

## 더 알아보기
- 이전 글: 3편 「파드: 함께 뜨고 함께 죽는 컨테이너 묶음」
- 다음 글: 5편 「서비스와 DNS: 바뀌는 파드 앞의 고정 주소」
