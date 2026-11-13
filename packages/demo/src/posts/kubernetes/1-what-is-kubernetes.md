# [쿠버네티스 실무 1/14] 쿠버네티스란: 컨테이너 오케스트레이션과 선언형 API

> **한 줄 요약** — 쿠버네티스는 여러 서버에 흩어진 컨테이너를 하나의 컴퓨터처럼 다루게 해 주는 시스템으로, "웹 서버 컨테이너가 3개 떠 있어야 한다" 같은 원하는 상태를 API에 적어 두면, 컨트롤러들이 실제 상태를 끊임없이 지켜보며 차이를 메워 죽은 컨테이너를 다시 띄우고 서버가 고장 나면 다른 서버로 옮긴다.

## 이 글에서 다루는 것
- 컨테이너가 많아지면 생기는 일: 오케스트레이션
- 선언형 API와 조정 루프
- 클러스터의 구성: 컨트롤 플레인과 노드
- 직접 해 보기: 원하는 상태를 적고, 파드를 지워 보기
- 짧은 역사

## 컨테이너가 많아지면
도커와 컨테이너 시리즈에서 컨테이너 하나를 띄우고, Compose로 몇 개를 한 서버에 띄웠다. 서비스가 커지면 질문이 바뀐다.
- 컨테이너 200개를 서버 20대 중 **어디에** 띄울까? 남은 CPU와 메모리를 보고 정해야 한다.
- 컨테이너가 죽으면 누가 **다시 띄울까**? 서버 한 대가 통째로 죽으면 그 위의 컨테이너는 다른 서버로 옮겨야 한다.
- 새 버전을 배포할 때 서비스를 멈추지 않고 **조금씩 바꿀** 수 있을까?
- 컨테이너는 계속 새로 뜨고 IP가 바뀌는데, 다른 서비스는 어떻게 **찾아갈까**?

이것을 사람 대신 해 주는 일을 **컨테이너 오케스트레이션**이라고 한다. 쿠버네티스(Kubernetes, 줄여서 k8s)는 그 사실상의 표준이다. 이름은 그리스어로 "조타수"라는 뜻이다.

## 선언형 API와 조정 루프
쿠버네티스를 쓸 때는 "컨테이너를 3개 띄워라"라는 명령을 내리지 않는다. "이 컨테이너가 3개 **있어야 한다**"는 **원하는 상태**를 API 서버에 적어 둔다. Terraform 시리즈의 선언형과 같은 생각이지만, 한 번 적용하고 끝나는 것이 아니라 **계속** 맞춘다는 점이 다르다.

쿠버네티스 안의 **컨트롤러**들은 각자 맡은 종류의 객체를 지켜보며 같은 일을 끝없이 되풀이한다. 이것을 **조정 루프**(reconciliation loop)라고 한다.
1. 원하는 상태(`spec`)를 읽는다.
2. 실제 상태(`status`)를 본다.
3. 차이가 있으면 메우는 쪽으로 한 걸음 움직인다.

그래서 컨테이너가 죽어도, 누가 실수로 지워도, 서버가 사라져도 결국 원하는 상태로 돌아온다. 이 성질을 흔히 **자가 치유**라고 부른다.

## 클러스터의 구성
쿠버네티스 클러스터는 두 부분으로 나뉜다.
- **컨트롤 플레인**: 클러스터의 두뇌다.
  - **API 서버**(kube-apiserver): 모든 요청의 입구. `kubectl`도, 컨트롤러도, 노드도 API 서버하고만 이야기한다.
  - **etcd**: 모든 객체를 저장하는 분산 키-값 저장소. 원하는 상태와 실제 상태가 여기 있다.
  - **스케줄러**: 새 파드를 어느 노드에 놓을지 정한다(9편).
  - **컨트롤러 매니저**: 디플로이먼트, 레플리카셋, 노드 같은 기본 컨트롤러들을 돌린다.
- **노드**: 컨테이너가 실제로 도는 서버다.
  - **kubelet**: 자기 노드에 배정된 파드를 컨테이너 런타임(containerd 등)으로 띄우고 상태를 보고한다.
  - **kube-proxy**: 서비스 주소로 온 트래픽을 파드로 보내는 규칙을 만든다(5편).

쿠버네티스가 다루는 가장 작은 실행 단위는 컨테이너가 아니라 **파드**(Pod, 3편)다. 파드는 함께 붙어 다니는 컨테이너 묶음이고, 보통은 컨테이너 하나짜리다.

## 직접 해 보기: 원하는 상태 적기
이 시리즈의 실습은 한 대짜리 로컬 클러스터(k3s, 쿠버네티스 1.34)에서 실행했다. 클러스터를 만드는 방법은 2편에서 다룬다. "nginx 컨테이너가 든 파드가 3개 있어야 한다"를 YAML로 적는다. 종류(`kind`)는 디플로이먼트(4편)다.
```yaml
# 파일: web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                # 원하는 파드 수
  selector:
    matchLabels:
      app: web
  template:                  # 이런 파드를 만든다
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
```
`kubectl apply`로 API 서버에 원하는 상태를 적고, 실제 상태가 따라오기를 기다린다.
```bash
kubectl apply -f web.yaml
kubectl rollout status deployment/web --timeout=120s
kubectl get deployment web -o custom-columns=NAME:.metadata.name,DESIRED:.spec.replicas,READY:.status.readyReplicas
kubectl get pods -l app=web -o custom-columns=NAME:.metadata.name,STATUS:.status.phase
```
```text
deployment.apps/web created
...
deployment "web" successfully rolled out
NAME   DESIRED   READY
web    3         3
NAME                   STATUS
web-…   Running
web-…   Running
web-…   Running
```
원하는 수(`DESIRED`, `spec`에서 옴)와 준비된 수(`READY`, `status`에서 옴)가 같아졌다. 파드 이름 뒤의 임의 문자열은 실행할 때마다 달라 가렸다.

## 파드를 지워 보기
이제 파드 하나를 "실수로" 지운다.
```bash
victim=$(kubectl get pods -l app=web -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod $victim > /dev/null
until [ "$(kubectl get deployment web -o jsonpath='{.status.readyReplicas}')" = 3 ] \
  && ! kubectl get pod $victim > /dev/null 2>&1; do sleep 1; done
echo "지운 파드가 다시 보이는가: $(kubectl get pods -l app=web -o name | grep -c $victim)"
echo "지금 파드 수: $(kubectl get pods -l app=web --no-headers | wc -l)"
kubectl get events --field-selector reason=SuccessfulCreate -o custom-columns=REASON:.reason,MESSAGE:.message --sort-by=.lastTimestamp | tail -1
```
```text
지운 파드가 다시 보이는가: 0
지금 파드 수: 3
SuccessfulCreate   Created pod: web-…
```
지운 파드는 돌아오지 않았지만, 그 자리를 **새 이름의 파드**가 채웠다. 아무도 "다시 띄워라"고 하지 않았다. 레플리카셋 컨트롤러(4편)가 "3개여야 하는데 2개다"라는 차이를 보고 하나를 만들었고, 그 기록이 이벤트로 남았다. 노드가 통째로 죽어도 같은 일이 다른 노드에서 일어난다.

명령형으로 "파드를 띄워라"고 했다면, 파드가 죽은 뒤에는 아무 일도 일어나지 않았을 것이다. 쿠버네티스에서는 개별 파드가 아니라 원하는 상태를 관리한다. 그래서 파드는 언제든 사라지고 새로 생길 수 있는 소모품으로 다룬다.
```bash
kubectl delete -f web.yaml
```
```text
deployment.apps "web" deleted from default namespace
```

## 짧은 역사
구글은 사내에서 Borg라는 클러스터 관리 시스템으로 오래전부터 대규모 서비스를 컨테이너로 돌려 왔다. 그 경험을 바탕으로 만든 오픈 소스가 쿠버네티스다. 2014년 6월 6일 첫 커밋이 올라갔고, 6월 10일 DockerCon에서 공개되었다. 2015년 7월 21일 1.0이 나왔고, 같은 날 리눅스 재단 아래 새로 만든 CNCF(Cloud Native Computing Foundation)에 기증되어 그 첫 프로젝트가 되었다. 지금은 AWS(EKS), Google Cloud(GKE), Azure(AKS) 같은 클라우드가 관리형 쿠버네티스를 제공해, 컨트롤 플레인 운영을 맡기고 노드만 쓰는 경우가 많다. 약 넉 달마다 새 버전(1.33, 1.34, …)이 나오고, 오래된 기능은 정해진 절차를 거쳐 사라진다. 예를 들어 1.35부터 cgroup v1 지원이 빠졌다.

## 흔한 오해
- "쿠버네티스는 도커를 대신한다": 쿠버네티스는 컨테이너를 **어디서 몇 개** 띄울지 정하고, 실제로 띄우는 것은 노드의 컨테이너 런타임(containerd 등)이다. 도커로 만든 이미지는 그대로 쓴다.
- "작은 서비스도 쿠버네티스가 필요하다": 서버 한두 대의 서비스라면 Compose나 관리형 플랫폼이 훨씬 간단하다. 쿠버네티스는 배우고 운영하는 비용이 크다.
- "kubectl 명령이 곧 동작이다": `kubectl`은 API 서버에 원하는 상태를 적을 뿐이다. 실제 일은 컨트롤러와 kubelet이 비동기로 한다. 그래서 `apply`가 끝나도 파드는 아직 뜨는 중일 수 있다.

## 어디에 쓰이나
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: 한 서버에서 여러 컨테이너를 정의하던 것을 여러 서버로 넓힌 것이 쿠버네티스다.
- Terraform 인프라 코드 1편 「인프라를 코드로: Terraform이란」: 원하는 모습을 적고 맞추는 선언형을, 한 번 적용하는 방식과 계속 맞추는 방식으로 비교해 본다.
- 카프카 이벤트 스트리밍 9편 「KRaft: ZooKeeper 없이 메타데이터 관리하기」: 클러스터의 상태를 합의로 지키는 저장소(etcd와 KRaft)라는 같은 문제를 본다.

## 정리
- 쿠버네티스는 여러 서버의 컨테이너를 배치하고, 다시 띄우고, 바꾸고, 찾아가게 해 주는 오케스트레이션 시스템이다.
- 원하는 상태(`spec`)를 API에 적으면, 컨트롤러가 실제 상태(`status`)를 지켜보며 차이를 계속 메운다.
- 컨트롤 플레인(API 서버, etcd, 스케줄러, 컨트롤러 매니저)과 노드(kubelet, 런타임, kube-proxy)로 이루어진다.
- 파드는 언제든 사라지고 새로 생기는 소모품이다. 관리하는 것은 원하는 상태다.

## 더 알아보기
- 다음 글: 2편 「클러스터와 kubectl: 로컬 클러스터를 만들고 오브젝트를 읽는 법」

## 시리즈 안내
1. **쿠버네티스란: 컨테이너 오케스트레이션과 선언형 API** ← 지금 읽는 글
2. 클러스터와 kubectl: 로컬 클러스터를 만들고 오브젝트를 읽는 법
3. 파드: 함께 뜨고 함께 죽는 컨테이너 묶음
4. 디플로이먼트: 개수 유지, 롤링 업데이트, 되돌리기
5. 서비스와 DNS: 바뀌는 파드 앞의 고정 주소
6. 인그레스와 게이트웨이 API: 클러스터 밖에서 들어오는 HTTP
7. ConfigMap과 Secret: 설정과 비밀을 이미지 밖으로
8. 볼륨과 StatefulSet: 파드가 사라져도 남는 데이터
9. 리소스 요청과 제한: 스케줄링, QoS, OOMKilled
10. 프로브와 우아한 종료: 살아 있음과 준비됨은 다르다
11. 오토스케일링: HPA, 메트릭, 노드 늘리기
12. 잡, 크론잡, 데몬셋: 디플로이먼트가 아닌 일들
13. 네임스페이스, RBAC, 네트워크 정책: 나누고 막기
14. 배포와 운영: Helm, Kustomize, GitOps, 문제 해결

이 시리즈 다음에 읽으면 좋은 글: 쿠버네티스에 올릴 이미지를 만드는 도커와 컨테이너 13편 「이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드」, 클러스터 자체를 코드로 만드는 Terraform 인프라 코드 7편 「모듈: 묶어서 다시 쓰기」, 그리고 클러스터의 상태를 지켜보는 Prometheus와 Grafana 모니터링 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」를 권한다.
