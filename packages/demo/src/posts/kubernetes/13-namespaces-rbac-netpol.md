# [쿠버네티스 실무 13/14] 네임스페이스, RBAC, 네트워크 정책: 나누고 막기

> **한 줄 요약** — 네임스페이스는 이름과 자원 할당량, 권한을 나누는 칸막이이고, RBAC는 "누가(주체) 어떤 자원에 어떤 동작을 할 수 있는가"를 Role과 RoleBinding으로 적어 API 요청을 허락하거나 거절하며, 네트워크 정책은 파드 사이의 트래픽을 레이블로 골라 막고 열어, 기본으로 모두 열려 있는 클러스터 안의 통신을 필요한 만큼만 남긴다.

## 이 글에서 다루는 것
- 네임스페이스: 이름, 할당량, 기본값 나누기
- RBAC: 주체, Role, RoleBinding, 서비스 계정
- 직접 해 보기: 허락된 요청과 거절된 요청(403)
- 네트워크 정책: 기본 거부와 필요한 것만 허용
- 직접 해 보기: 다른 팀의 파드가 데이터베이스에 닿지 못하게

## 네임스페이스
한 클러스터를 여러 팀과 환경이 나눠 쓰면, 이름이 겹치고, 한 팀이 자원을 다 써 버리고, 누가 무엇을 고칠 수 있는지 흐려진다. **네임스페이스**가 첫 번째 칸막이다.
- 이름은 네임스페이스 안에서만 유일하면 된다. 서비스 DNS도 `서비스.네임스페이스`로 갈린다(5편).
- **ResourceQuota**로 네임스페이스 전체의 파드 수, CPU·메모리 요청 합 등에 상한을 둔다.
- **LimitRange**로 요청과 제한을 적지 않은 컨테이너에 기본값을 넣고, 최소·최대를 강제한다(9편).
- 권한(RBAC)과 네트워크 정책도 네임스페이스 단위로 거는 경우가 많다.

노드, 네임스페이스 자체, StorageClass처럼 클러스터 전체에 하나뿐인 오브젝트는 네임스페이스에 속하지 않는다(2편의 `NAMESPACED`).

## 직접 해 보기: 할당량
두 팀의 네임스페이스를 만들고, `team-a`에는 파드를 2개까지만 허락한다.
```bash
kubectl create namespace team-a > /dev/null; kubectl create namespace team-b > /dev/null
kubectl create quota pods-limit --hard=pods=2 -n team-a > /dev/null
for i in 1 2 3; do kubectl run worker-$i --image=busybox:1.36 -n team-a -- sleep 3600 2>&1 | sed 's/: pods "worker-3" is forbidden//'; done
kubectl get quota pods-limit -n team-a -o jsonpath='쓰는 양 {.status.used.pods} / 상한 {.status.hard.pods}{"\n"}'
```
```text
pod/worker-1 created
pod/worker-2 created
Error from server (Forbidden): exceeded quota: pods-limit, requested: pods=1, used: pods=2, limited: pods=2
쓰는 양 2 / 상한 2
```
세 번째 파드는 API 서버가 받아들이지 않았다. 할당량은 만들 때 검사한다. 디플로이먼트라면 레플리카셋이 파드를 만들지 못한 이유가 이벤트에 남는다.

## RBAC
API 서버는 모든 요청에 대해 **인증**(누구인가)을 한 뒤 **인가**(해도 되는가)를 한다. 쿠버네티스의 인가는 보통 **RBAC**(Role-Based Access Control)이고, 기본은 "적어 둔 것만 허락"이다.
- **주체**: 사람 사용자, 그룹, 그리고 파드 안의 프로그램이 쓰는 **서비스 계정**(ServiceAccount).
- **Role**: 한 네임스페이스 안에서 "어떤 자원(`pods`, `secrets`…)에 어떤 동작(`get`, `list`, `watch`, `create`, `delete`…)"을 허락하는가.
- **RoleBinding**: Role을 주체에 묶는다.
- **ClusterRole**과 **ClusterRoleBinding**: 클러스터 전체 범위 판이다. 노드처럼 네임스페이스가 없는 자원이나, 모든 네임스페이스에 걸칠 권한에 쓴다.

`team-a`의 파드를 보기만 하는 서비스 계정을 만든다.
```yaml
# 파일: viewer.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: viewer
  namespace: team-a
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: team-a
rules:
  - apiGroups: [""]                  # 핵심 그룹(파드, 서비스 등)
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: viewer-reads-pods
  namespace: team-a
subjects:
  - kind: ServiceAccount
    name: viewer
    namespace: team-a
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```
`kubectl auth can-i`로 그 계정이 할 수 있는 일을 묻는다. `--as`는 다른 주체인 척 묻는 기능이다.
```bash
kubectl apply -f viewer.yaml > /dev/null
who=system:serviceaccount:team-a:viewer
for q in "list pods -n team-a" "delete pods -n team-a" "list secrets -n team-a" "list pods -n team-b"; do
  echo "$q: $(kubectl auth can-i $q --as=$who)"
done
```
```text
list pods -n team-a: yes
delete pods -n team-a: no
list secrets -n team-a: no
list pods -n team-b: no
```
실제로 그 계정의 토큰으로 API를 불러 본다. `kubectl create token`은 서비스 계정의 짧게 쓰는 토큰을 발급한다. 파드에 서비스 계정을 지정하면 이런 토큰이 파드 안에 자동으로 들어간다(7편에서 본 `/var/run/secrets/...`).
```bash
token=$(kubectl create token viewer -n team-a --duration=10m)
api=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
code() { curl -sk -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "$api$1"; }
echo "team-a 파드 목록: $(code /api/v1/namespaces/team-a/pods)"
echo "team-a Secret 목록: $(code /api/v1/namespaces/team-a/secrets)"
```
```text
team-a 파드 목록: 200
team-a Secret 목록: 403
```
허락한 것은 200, 나머지는 403(Forbidden)이다. 파드마다 필요한 권한만 가진 서비스 계정을 주면, 앱이 뚫려도 피해가 그 범위에 머문다. 사람에게도 기본 ClusterRole(`view`, `edit`, `admin`)을 네임스페이스 단위로 묶어 주고, 클러스터 전체 관리자 권한(`cluster-admin`)은 아껴 준다.

## 네트워크 정책
쿠버네티스의 기본 네트워크는 **모두 열려 있다**. 어느 네임스페이스의 파드든 다른 모든 파드에 닿는다. 다른 팀의 파드가 우리 데이터베이스에 바로 접속할 수 있는 것이다. **네트워크 정책**(NetworkPolicy)은 레이블로 고른 파드에 들어오고(ingress) 나가는(egress) 트래픽을 허용 목록으로 제한한다. 정책 하나가 어떤 파드를 고르면, 그 파드는 정책들이 허용한 것 말고는 모두 막힌다. 실제로 막는 일은 네트워크 플러그인(CNI)이 하므로, 정책을 지원하는 플러그인이어야 한다(k3s는 기본으로 지원한다).

## 직접 해 보기: 데이터베이스 지키기
`team-b`에 데이터베이스 역할의 파드와 같은 팀의 API 파드를 두고, `team-a`에는 다른 팀의 파드를 둔다.
```bash
kubectl run db -n team-b --image=busybox:1.36 --labels=role=db -- sh -c 'mkdir /www && echo db-ok > /www/index.html && httpd -f -p 8080 -h /www' > /dev/null
kubectl run api -n team-b --image=busybox:1.36 --labels=role=api -- sleep 3600 > /dev/null
kubectl delete pod worker-2 -n team-a --now > /dev/null
kubectl run other -n team-a --image=busybox:1.36 -- sleep 3600 > /dev/null
kubectl wait --for=condition=Ready pod/db pod/api -n team-b --timeout=60s > /dev/null
kubectl wait --for=condition=Ready pod/other -n team-a --timeout=60s > /dev/null
db=$(kubectl get pod db -n team-b -o jsonpath='{.status.podIP}')
try() { kubectl exec $1 -n $2 -- wget -qO- -T 3 http://$db:8080 2>/dev/null || echo "막힘"; }
echo "정책 전 - 같은 팀 api: $(try api team-b), 다른 팀 other: $(try other team-a)"
```
```text
정책 전 - 같은 팀 api: db-ok, 다른 팀 other: db-ok
```
다른 팀의 파드도 데이터베이스에 닿는다. 이제 "`team-b`의 모든 파드는 기본으로 들어오는 트래픽을 막는다"와 "`db`에는 같은 네임스페이스의 `role=api` 파드만 8080번으로 들어올 수 있다"는 정책 둘을 건다.
```yaml
# 파일: policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: team-b
spec:
  podSelector: {}                 # 이 네임스페이스의 모든 파드
  policyTypes: ["Ingress"]        # 들어오는 것은 허용 목록이 없으면 막힌다
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-from-api
  namespace: team-b
spec:
  podSelector:
    matchLabels:
      role: db
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector:            # 같은 네임스페이스의 role=api 파드에서
            matchLabels:
              role: api
      ports:
        - port: 8080
```
```bash
kubectl apply -f policies.yaml > /dev/null
until [ "$(try other team-a)" = "막힘" ]; do sleep 1; done
echo "정책 후 - 같은 팀 api: $(try api team-b), 다른 팀 other: $(try other team-a)"
kubectl delete namespace team-a team-b > /dev/null
```
```text
정책 후 - 같은 팀 api: db-ok, 다른 팀 other: 막힘
```
정책이 적용되자 다른 팀의 연결은 응답 없이 끊겼고(3초 시간 제한), 같은 팀의 API는 그대로 닿았다. 네임스페이스를 지우면 그 안의 모든 것(파드, 서비스 계정, 정책)이 함께 지워진다.

실무에서는 네임스페이스마다 "기본 거부"를 깔고 필요한 통로만 연다. 나가는 쪽(egress)도 막으면, 뚫린 파드가 바깥으로 데이터를 빼돌리는 것도 어렵게 할 수 있다. 다만 egress를 막을 때는 DNS(53번) 통로를 열어 두지 않으면 이름 풀이부터 실패한다.

## 흔한 오해
- "네임스페이스로 나누면 서로 격리된다": 이름과 할당량, 권한의 단위일 뿐이다. 네트워크는 정책을 걸기 전까지 모두 열려 있고, 노드도 함께 쓴다.
- "RBAC에서 거부 규칙을 쓴다": RBAC에는 거부가 없다. 허락만 더해 가므로, 넓은 권한을 준 뒤 일부를 빼는 방식은 안 된다.
- "네트워크 정책을 만들면 막힌다": 정책을 지원하지 않는 네트워크 플러그인에서는 오브젝트만 저장되고 아무 일도 일어나지 않는다. 적용 뒤에 실제로 막히는지 확인한다.

## 어디에 쓰이나
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: CI가 클러스터에 배포할 때 줄 최소 권한과, 장기 토큰 대신 짧은 토큰을 쓰는 이유를 본다.
- 웹 앱의 원리 11편 「상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰」: 서비스 계정 토큰 같은 Bearer 토큰과 인증·인가의 차이를 본다.
- 도커와 컨테이너 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」: 컨테이너 자체의 권한을 줄이는 일이 RBAC·네트워크 정책과 함께 가는 겹겹의 방어다.

## 정리
- 네임스페이스는 이름, 할당량(ResourceQuota), 기본값(LimitRange), 권한을 나누는 칸막이다.
- RBAC는 Role(무엇을)과 RoleBinding(누구에게)으로 허락만 더하며, 파드는 서비스 계정으로 최소 권한을 받는다.
- 클러스터 네트워크는 기본으로 모두 열려 있다. 네트워크 정책으로 기본 거부를 깔고 필요한 통로만 연다.
- 정책은 네트워크 플러그인이 지원해야 동작하므로, 적용 뒤 실제로 막히는지 확인한다.

## 더 알아보기
- 이전 글: 12편 「잡, 크론잡, 데몬셋: 디플로이먼트가 아닌 일들」
- 다음 글: 14편 「배포와 운영: Helm, Kustomize, GitOps, 문제 해결」
