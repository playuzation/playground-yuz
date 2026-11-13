# [쿠버네티스 실무 2/14] 클러스터와 kubectl: 로컬 클러스터를 만들고 오브젝트를 읽는 법

> **한 줄 요약** — 연습용 쿠버네티스는 kind, k3d, minikube, k3s 같은 도구로 한 대의 컴퓨터에 띄우고, `kubectl`은 kubeconfig에 적힌 클러스터의 API 서버에 REST 요청을 보내는 클라이언트이며, 모든 오브젝트는 `apiVersion`, `kind`, `metadata`, `spec`, `status`로 이루어져 `get`, `describe`, `explain`, 출력 형식으로 읽어 낸다.

## 이 글에서 다루는 것
- 로컬 클러스터를 만드는 도구들과 이 시리즈의 환경
- kubeconfig와 컨텍스트: kubectl은 어디로 말하는가
- 오브젝트 읽기: `get`, `describe`, `explain`, 출력 형식, 레이블
- 오브젝트의 구조: `metadata`, `spec`, `status`, 소유 관계
- kubectl 뒤의 REST API

## 로컬 클러스터 만들기
운영 클러스터는 보통 클라우드의 관리형 서비스(EKS, GKE, AKS)로 만든다. 배우고 실험할 때는 한 대의 컴퓨터에 띄우는 도구가 편하다.
- **kind**(Kubernetes in Docker): 도커 컨테이너를 노드로 삼는다. 여러 노드 클러스터도 쉽게 만들고 지운다. CI에서 많이 쓴다.
- **k3d**: kind와 비슷하게 도커 안에 k3s를 띄운다.
- **minikube**: 가상 머신이나 컨테이너로 한 노드 클러스터를 만든다. 부가 기능을 켜고 끄기 쉽다.
- **k3s**: 바이너리 하나로 된 가벼운 쿠버네티스 배포판이다. 리눅스 서버에 바로 설치하며, 기본으로 DNS(CoreDNS), 인그레스 컨트롤러(Traefik), 로컬 저장소, 메트릭 서버가 들어 있다.

이 시리즈의 실습은 리눅스 한 대에 설치한 **k3s 1.34** 단일 노드 클러스터에서 실행했다. 설치는 공식 스크립트 한 줄이다(이 글에서 실행하지는 않는다).
```sh
curl -sfL https://get.k3s.io | sh -
```
설치가 끝나면 클러스터에 접속하는 정보가 `/etc/rancher/k3s/k3s.yaml`에 생긴다. 다른 도구를 써도 이후의 `kubectl` 명령은 똑같다.

## kubeconfig와 컨텍스트
`kubectl`은 **kubeconfig** 파일을 읽어 어느 클러스터의 API 서버에, 어떤 사용자로 접속할지 정한다. 기본 위치는 `~/.kube/config`이고, 환경 변수 `KUBECONFIG`로 바꿀 수 있다. 클러스터·사용자·기본 네임스페이스를 묶은 것을 **컨텍스트**라고 하며, 여러 클러스터를 오갈 때는 `kubectl config use-context`로 바꾼다. 운영 클러스터에 연습 명령을 보내는 사고가 여기서 나므로, 지금 컨텍스트를 확인하는 습관이 중요하다.
```bash
kubectl config get-contexts
kubectl get nodes -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[-1].type,VERSION:.status.nodeInfo.kubeletVersion
```
```text
CURRENT   NAME      CLUSTER   AUTHINFO   NAMESPACE
*         default   default   default
NAME   STATUS   VERSION
…Ready    v1.34.13+k3s1
```
노드가 하나이고 준비(`Ready`)되어 있다. 노드 이름은 컴퓨터의 호스트 이름이라 가렸다.

## 오브젝트 읽기
클러스터 자체를 돌리는 파드는 `kube-system` 네임스페이스에 있다(네임스페이스는 13편). `-n`으로 네임스페이스를 고르고, `--field-selector`로 실행 중인 것만 본다.
```bash
kubectl get pods -n kube-system --field-selector status.phase=Running \
  -o custom-columns=NAME:.metadata.name,STATUS:.status.phase --sort-by=.metadata.name
```
```text
NAME…STATUS
coredns-…Running
local-path-provisioner-…Running
metrics-server-…Running
svclb-traefik-…Running
traefik-…Running
```
DNS 서버(5편), 저장소 제공자(8편), 메트릭 서버(11편), 인그레스 컨트롤러(6편)가 모두 파드로 돈다. 쿠버네티스는 자기 부품도 쿠버네티스로 돌린다.

어떤 종류의 오브젝트가 있는지는 `api-resources`로, 필드의 뜻은 `explain`으로 본다. 문서를 찾으러 브라우저를 열 필요가 없다.
```bash
kubectl api-resources --sort-by=name | awk 'NR == 1 || $1 ~ /^(pods|deployments|services|configmaps|namespaces|nodes)$/' | grep -v metrics
kubectl explain deployment.spec.replicas | grep -A2 DESCRIPTION
```
```text
NAME                                SHORTNAMES   APIVERSION                        NAMESPACED   KIND
configmaps                          cm           v1                                true         ConfigMap
deployments                         deploy       apps/v1                           true         Deployment
namespaces                          ns           v1                                false        Namespace
nodes                               no           v1                                false        Node
pods                                po           v1                                true         Pod
services                            svc          v1                                true         Service
DESCRIPTION:
    Number of desired pods. This is a pointer to distinguish between explicit
    zero and not specified. Defaults to 1.
```
`SHORTNAMES`는 줄임말이다(`kubectl get deploy`). `NAMESPACED`가 `false`인 노드와 네임스페이스는 클러스터 전체에 하나씩인 오브젝트다.

## 오브젝트의 구조
YAML을 처음부터 쓰는 대신 `--dry-run=client -o yaml`로 뼈대를 만들 수 있다. API 서버에 보내지 않고 만들어질 오브젝트를 출력만 한다.
```bash
kubectl create deployment hello --image=nginx:1.27-alpine --replicas=2 --dry-run=client -o yaml > hello.yaml
cat hello.yaml
```
```text
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: hello
  name: hello
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hello
  strategy: {}
  template:
    metadata:
      labels:
        app: hello
    spec:
      containers:
      - image: nginx:1.27-alpine
        name: nginx
        resources: {}
status: {}
```
모든 오브젝트의 모양이 이렇다.
- `apiVersion`과 `kind`: 어떤 API 그룹의 어떤 종류인가(`apps/v1`의 `Deployment`).
- `metadata`: 이름, 네임스페이스, **레이블**(골라내기 위한 키-값), 어노테이션(도구가 쓰는 메모).
- `spec`: 원하는 상태. 사용자가 쓴다.
- `status`: 실제 상태. 컨트롤러가 쓴다. 그래서 만들 때는 비어 있다.

이제 적용하고, 서버가 채운 필드를 본다.
```bash
kubectl apply -f hello.yaml > /dev/null && kubectl rollout status deployment/hello > /dev/null
kubectl get deployment hello -o jsonpath='uid: {.metadata.uid}{"\n"}generation: {.metadata.generation}{"\n"}observedGeneration: {.status.observedGeneration}{"\n"}conditions: {.status.conditions[*].type}{"\n"}'
kubectl get replicasets -l app=hello -o custom-columns=KIND:.kind,OWNER:.metadata.ownerReferences[0].kind
kubectl get pods -l app=hello -o custom-columns=KIND:.kind,OWNER:.metadata.ownerReferences[0].kind
```
```text
uid: …
generation: 1
observedGeneration: 1
conditions: Available Progressing
KIND         OWNER
ReplicaSet   Deployment
KIND   OWNER
Pod    ReplicaSet
Pod    ReplicaSet
```
- 서버가 고유 ID(`uid`)를 붙였다. `generation`은 `spec`이 바뀔 때마다 커지고, 컨트롤러는 자기가 처리한 세대를 `observedGeneration`에 적는다. 둘이 같으면 "최신 spec을 반영했다"는 뜻이다.
- 디플로이먼트가 레플리카셋을, 레플리카셋이 파드를 **소유**한다(`ownerReferences`). 디플로이먼트를 지우면 소유된 것들이 함께 지워진다(4편).
- `-l app=hello`는 **레이블 셀렉터**다. 쿠버네티스는 이름보다 레이블로 묶음을 고른다. 디플로이먼트가 자기 파드를 찾는 것도, 서비스가 트래픽을 보낼 파드를 찾는 것도 레이블이다.

`kubectl describe`는 사람이 읽기 좋게 정리하고, 맨 아래에 관련 **이벤트**를 보여 준다. 문제가 생기면 가장 먼저 보는 곳이다.
```bash
kubectl describe deployment hello | sed -n '/^Events:/,$p' | sed 's/  */ /g' | cut -d' ' -f2,3,6-
```
```text
Events:
Type Reason Message
---- ------ -------
Normal ScalingReplicaSet Scaled up replica set hello-… from 0 to 2
```

## kubectl 뒤의 REST API
`kubectl`이 하는 일은 결국 HTTP 요청이다. `-v=6`을 주면 보낸 요청이 보인다. `kubectl get --raw`로 같은 주소를 직접 부를 수도 있다.
```bash
kubectl get pods -v=6 2>&1 | grep -o 'verb="GET" url="[^"]*"'
kubectl get --raw /apis/apps/v1/namespaces/default/deployments/hello | jq -r '.kind, .spec.replicas'
kubectl delete -f hello.yaml
```
```text
verb="GET" url="https://127.0.0.1:6443/api/v1/namespaces/default/pods?limit=500"
Deployment
2
deployment.apps "hello" deleted from default namespace
```
주소 모양이 그대로 API의 구조다. 핵심 그룹은 `/api/v1/...`, 나머지 그룹은 `/apis/그룹/버전/...`이고, 그 뒤에 `namespaces/이름/종류/이름`이 온다. 컨트롤러, 대시보드, CI 도구 모두 이 API를 같은 방식으로 쓴다. `kubectl get -w`로 변화를 지켜보는 것도 이 API의 "watch" 기능이다.

## 흔한 오해
- "`kubectl`이 클러스터 안에서 돈다": 내 컴퓨터의 클라이언트일 뿐이다. kubeconfig가 가리키는 API 서버로 요청을 보낸다.
- "`status`도 YAML에 적어 두면 된다": `status`는 컨트롤러가 쓴다. 적어 보내도 무시되거나 덮어써진다.
- "이름으로 묶는다": 묶음은 레이블과 셀렉터로 만든다. 레이블을 잘못 주면 디플로이먼트나 서비스가 엉뚱한 파드를 고른다.

## 어디에 쓰이나
- 도커와 컨테이너 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」: `docker` CLI가 도커 데몬의 API를 부르듯, `kubectl`은 API 서버를 부른다.
- 웹 앱의 원리 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」: 자원을 주소로 가리키고 메서드로 다루는 쿠버네티스 API는 REST의 교과서적인 예다.
- Terraform 인프라 코드 2편 「HCL과 첫 리소스: init, plan, apply, destroy」: `--dry-run`과 `kubectl diff`로 적용 전에 보는 습관이 `plan`과 같다.

## 정리
- 연습용 클러스터는 kind, k3d, minikube, k3s 등으로 만든다. 이 시리즈는 k3s 1.34 한 대로 실습한다.
- `kubectl`은 kubeconfig의 컨텍스트가 가리키는 API 서버에 REST 요청을 보낸다. 지금 컨텍스트를 늘 확인한다.
- `get`(출력 형식, 레이블 셀렉터), `describe`(이벤트), `explain`(필드 설명)으로 오브젝트를 읽는다.
- 오브젝트는 `apiVersion`, `kind`, `metadata`, `spec`, `status`로 이루어지고, 소유 관계와 레이블로 서로 이어진다.

## 더 알아보기
- 이전 글: 1편 「쿠버네티스란: 컨테이너 오케스트레이션과 선언형 API」
- 다음 글: 3편 「파드: 함께 뜨고 함께 죽는 컨테이너 묶음」
