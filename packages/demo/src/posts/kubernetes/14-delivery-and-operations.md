# [쿠버네티스 실무 14/14] 배포와 운영: Helm, Kustomize, GitOps, 문제 해결

> **한 줄 요약** — 여러 환경에 같은 매니페스트를 조금씩 다르게 배포하려면 Helm(값을 끼워 넣는 템플릿과 릴리스 이력)이나 Kustomize(원본에 덧대는 패치)를 쓰고, Git에 적힌 원하는 상태를 클러스터가 스스로 따라가게 하는 GitOps로 배포를 리뷰와 기록 안에 넣으며, 문제가 생기면 `get` → `describe`의 이벤트 → `logs`의 순서로 증상에서 원인으로 좁혀 간다.

## 이 글에서 다루는 것
- 매니페스트를 환경마다 다르게: 템플릿과 패치
- Helm: 차트, 값, 릴리스, 업그레이드와 되돌리기
- Kustomize: 기본과 덧씌우기, 설정 해시
- GitOps: Argo CD와 Flux가 하는 일
- 문제 해결: 증상별로 어디를 볼까

## 환경마다 조금씩 다르게
1~13편의 YAML을 운영에 쓰려면 곧 문제가 생긴다. 개발은 파드 1개, 운영은 5개, 이미지 태그는 배포마다 다르고, 도메인과 자원 요청도 환경마다 다르다. YAML을 복사해 고치면 금방 어긋난다. 두 가지 대표적인 해결이 있다.
- **템플릿**(Helm): YAML에 빈칸(`{{ .Values.replicas }}`)을 두고 값 파일로 채운다.
- **패치**(Kustomize): 완성된 YAML(기본)은 그대로 두고, 환경마다 바꿀 부분만 덧씌운다.

## Helm
**Helm**은 쿠버네티스의 패키지 관리자다.
- **차트**(chart): 템플릿과 기본값(`values.yaml`)을 묶은 패키지. 공개 저장소에 데이터베이스, 모니터링 도구 같은 차트가 많다.
- **릴리스**(release): 차트를 클러스터에 설치한 한 번의 결과. 같은 차트를 이름을 달리해 여러 번 설치할 수 있다.
- **리비전**: 설치, 업그레이드, 되돌리기마다 번호가 붙고, 기록이 클러스터에 Secret으로 남는다.

이 시리즈의 실습에는 Helm 4를 썼다. 작은 차트를 직접 만든다.
```yaml
# 파일: shop/Chart.yaml
apiVersion: v2
name: shop
version: 0.1.0
appVersion: "1.26"
```
```yaml
# 파일: shop/values.yaml
replicas: 1
image:
  repository: nginx
  tag: 1.26-alpine
```
```yaml
# 파일: shop/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-shop
  labels:
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicas }}
  selector:
    matchLabels:
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/instance: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```
`helm template`은 클러스터에 보내지 않고 결과 YAML만 만든다. `--set`이나 `-f 값파일`로 기본값을 덮는다.
```bash
helm template demo ./shop --set replicas=3 | grep -E '^  name:|replicas:|image:'
```
```text
  name: demo-shop
  replicas: 3
          image: "nginx:1.26-alpine"
```
이제 설치하고, 이미지 태그를 올리고, 되돌린다.
```bash
helm install web ./shop --wait | grep -E '^(STATUS|REVISION):'
helm upgrade web ./shop --set image.tag=1.27-alpine --wait | grep -E '^(STATUS|REVISION):'
helm rollback web 1 --wait
helm history web -o json | jq -r '.[] | "\(.revision) \(.status) \(.description)"'
kubectl get deployment web-shop -o jsonpath='지금 이미지: {.spec.template.spec.containers[0].image}{"\n"}'
kubectl get secrets -l owner=helm,name=web -o name | sort
helm uninstall web
```
```text
STATUS: deployed
REVISION: 1
STATUS: deployed
REVISION: 2
Rollback was a success! Happy Helming!
1 superseded Install complete
2 superseded Upgrade complete
3 deployed Rollback to 1
지금 이미지: nginx:1.26-alpine
secret/sh.helm.release.v1.web.v1
secret/sh.helm.release.v1.web.v2
secret/sh.helm.release.v1.web.v3
release "web" uninstalled
```
되돌리기도 새 리비전(3)으로 기록되었다. 리비전마다 적용한 매니페스트가 Secret에 남아 있어, Helm은 무엇을 지우고 무엇을 바꿀지 안다. 장점은 공개 차트로 복잡한 소프트웨어를 한 줄에 설치하는 것이고, 단점은 템플릿이 길어지면 읽기 어렵고, 결과 YAML을 보려면 한 번 렌더링해야 한다는 것이다.

## Kustomize
**Kustomize**는 `kubectl`에 들어 있다(`kubectl apply -k`). 템플릿 문법 없이 평범한 YAML을 **기본**(base)으로 두고, 환경마다 **덧씌우기**(overlay)에서 바꿀 것만 적는다.
```bash
mkdir -p base overlays/prod
kubectl create deployment shop --image=nginx:1.26-alpine --dry-run=client -o yaml > base/deployment.yaml
cat > base/kustomization.yaml <<'EOF'
resources:
  - deployment.yaml
configMapGenerator:
  - name: shop-config
    literals:
      - LOG_LEVEL=info
EOF
cat > overlays/prod/kustomization.yaml <<'EOF'
resources:
  - ../../base
namePrefix: prod-
images:
  - name: nginx
    newTag: 1.27-alpine
replicas:
  - name: shop
    count: 3
configMapGenerator:
  - name: shop-config
    behavior: merge
    literals:
      - LOG_LEVEL=warn
EOF
kubectl kustomize overlays/prod | grep -E '^  name:|replicas:|image:|LOG_LEVEL' | sed -E 's/shop-config-[a-z0-9]+/shop-config-…/'
```
```text
  LOG_LEVEL: warn
  name: prod-shop-config-…
  name: prod-shop
  replicas: 3
      - image: nginx:1.27-alpine
```
- 기본은 그대로인데, 운영 덧씌우기가 이름 앞에 `prod-`를 붙이고, 이미지 태그와 복제본 수를 바꾸고, 설정 값을 덮었다.
- `configMapGenerator`는 ConfigMap 이름 뒤에 **내용의 해시**를 붙인다. 설정이 바뀌면 이름이 바뀌고, 그 이름을 쓰는 디플로이먼트의 파드 틀도 바뀌어 롤링 업데이트가 일어난다. 7편에서 말한 "설정 변경을 배포로 반영하기"를 자동으로 해 준다.

Helm은 남이 만든 소프트웨어를 설치할 때, Kustomize는 우리 앱의 환경별 차이를 관리할 때 흔히 쓰고, Helm 차트를 렌더링한 결과에 Kustomize로 덧씌우는 조합도 쓴다.

## GitOps
지금까지는 사람이나 CI가 `kubectl apply`, `helm upgrade`를 실행했다. **GitOps**는 방향을 뒤집는다.
1. 클러스터의 원하는 상태(매니페스트, 차트 값, Kustomize 덧씌우기)를 **Git 저장소**에 둔다.
2. 클러스터 안의 **GitOps 컨트롤러**(Argo CD, Flux)가 저장소를 지켜보다가, Git과 클러스터가 다르면 클러스터를 Git에 맞춘다.
3. 배포는 풀 리퀘스트를 병합하는 것이고, 되돌리기는 커밋을 되돌리는 것이다.

1편의 조정 루프를 Git까지 넓힌 것이다. 누가 언제 무엇을 바꿨는지 Git에 남고, CI에 클러스터 관리자 권한을 주지 않아도 되며(13편), 누군가 `kubectl edit`로 바꾼 것(드리프트)도 되돌려진다. 이미지 태그를 올리는 커밋은 CI가 이미지를 빌드한 뒤 자동으로 만들게 하는 경우가 많다.

## 문제 해결: 증상에서 원인으로
흔히 만나는 세 가지 고장을 일부러 만든다. 이미지 이름 오타, 바로 죽는 명령, 노드에 들어가지 않는 요청이다.
```bash
kubectl create deployment typo --image=ngnix:1.27-alpine > /dev/null
kubectl create deployment crasher --image=busybox:1.36 -- sh -c 'echo "DATABASE_URL이 없다" >&2; exit 1' > /dev/null
kubectl create deployment toobig --image=busybox:1.36 --dry-run=client -o yaml -- sleep 3600 \
  | kubectl set resources --local -f - --requests=cpu=64 -o yaml | kubectl apply -f - > /dev/null
state() {   # 앱마다 파드 하나의 상태: 기다리는 이유, 또는 단계와 스케줄 실패 이유
  kubectl get pods -l app=$1 -o jsonpath='{.items[0].status.containerStatuses[0].state.waiting.reason}{.items[0].status.conditions[?(@.reason=="Unschedulable")].reason}'
}
restarts() { kubectl get pods -l app=$1 -o jsonpath='{.items[0].status.containerStatuses[0].restartCount}'; }
until [ "$(restarts crasher)" -ge 3 ] 2>/dev/null && [ "$(state crasher)" = CrashLoopBackOff ] \
  && state typo | grep -q ImagePull && [ "$(state toobig)" = Unschedulable ]; do sleep 2; done
for a in typo crasher toobig; do echo "$a: $(state $a | sed -E 's/ErrImagePull|ImagePullBackOff/이미지 받기 실패(ImagePull…)/')"; done
```
```text
typo: 이미지 받기 실패(ImagePull…)
crasher: CrashLoopBackOff
toobig: Unschedulable
```
`kubectl get pods`의 상태가 첫 단서다. 다음은 이벤트와 로그다.
```bash
pod() { kubectl get pods -l app=$1 -o jsonpath='{.items[0].metadata.name}'; }
kubectl describe pod $(pod typo) | grep -o 'Failed to pull image "ngnix:1.27-alpine"'
kubectl logs $(pod crasher) --previous
kubectl describe pod $(pod toobig) | grep -o '[0-9]*/[0-9]* nodes are available: [0-9]* Insufficient cpu'
kubectl delete deployment typo crasher toobig > /dev/null; kubectl delete pods -l 'app in (typo, crasher, toobig)' --now > /dev/null
```
```text
Failed to pull image "ngnix:1.27-alpine"
DATABASE_URL이 없다
0/1 nodes are available: 1 Insufficient cpu
```
증상별로 볼 곳을 정리하면 이렇다.

| 증상 | 먼저 볼 곳 | 흔한 원인 |
| --- | --- | --- |
| 배정 대기 | `describe` 이벤트 | 요청 과다, PVC 대기 |
| 이미지 받기 실패 | `describe` 이벤트 | 태그 오타, 인증 |
| 재시작 반복 | `logs -p` | 설정 누락, 시작 오류 |
| 메모리 초과 | 종료 이유 | 제한이 작음 |
| 응답 없음 | 엔드포인트 | 레이블, 프로브 |

`logs -p`는 `logs --previous`의 줄임이다. 마지막 줄이 가장 까다롭다. 서비스의 셀렉터가 파드의 레이블과 맞는지(`kubectl get endpointslices`, 5편), 준비 프로브가 통과하는지(10편), 네트워크 정책이 막지 않는지(13편)를 차례로 본다. 이미지에 셸이 없어 `exec`로 들어갈 수 없을 때는 `kubectl debug`로 디버깅 도구가 든 임시 컨테이너를 그 파드에 붙인다. 클러스터 전체의 흐름은 `kubectl get events -A --sort-by=.lastTimestamp`로 훑고, 길게 보려면 로그와 메트릭을 모니터링 시스템에 모은다.

## 흔한 오해
- "Helm을 쓰면 YAML을 몰라도 된다": 차트의 결과도 결국 1~13편의 오브젝트다. 문제가 생기면 렌더링된 YAML을 읽어야 한다.
- "GitOps면 kubectl을 쓰지 않는다": 읽기와 문제 해결에는 여전히 쓴다. 바꾸는 일을 Git으로 옮기는 것이다.
- "파드가 Running이면 정상이다": 준비되지 않았거나, 서비스에 붙지 않았거나, 같은 오류를 계속 내고 있을 수 있다. 엔드포인트와 로그까지 확인한다.

## 어디에 쓰이나
- Terraform 인프라 코드 10편 「팀으로 쓰기: CI의 plan, 테스트, 드리프트 감지」: 계획을 리뷰하고 병합 뒤 적용하는 흐름이 GitOps와 같은 뿌리다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 이미지를 빌드하고 레지스트리에 올리는 CI 쪽 절반을 본다.
- Prometheus와 Grafana 모니터링 8편 「기록 규칙과 경보: 규칙 파일과 Alertmanager」: CrashLoopBackOff나 재시작 증가 같은 증상을 경보로 먼저 알아채는 법을 본다.

## 정리
- 환경마다 다른 배포는 Helm(템플릿, 릴리스 이력, 되돌리기)이나 Kustomize(기본과 덧씌우기, 설정 해시)로 관리한다.
- GitOps는 Git의 원하는 상태를 클러스터 안의 컨트롤러가 따라가게 해, 배포를 풀 리퀘스트와 커밋으로 다룬다.
- 문제 해결은 `get`의 상태 → `describe`의 이벤트 → `logs --previous` → 엔드포인트·프로브·정책 순으로 좁혀 간다.

## 더 알아보기
- 이전 글: 13편 「네임스페이스, RBAC, 네트워크 정책: 나누고 막기」
- 처음 글: 1편 「쿠버네티스란: 컨테이너 오케스트레이션과 선언형 API」
