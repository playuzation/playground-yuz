# [쿠버네티스 실무 5/14] 서비스와 DNS: 바뀌는 파드 앞의 고정 주소

> **한 줄 요약** — 파드는 새로 뜰 때마다 IP가 바뀌므로, 서비스가 레이블 셀렉터로 고른 파드들 앞에 바뀌지 않는 가상 IP와 DNS 이름을 두고 요청을 나눠 보내며, 클러스터 안에서는 `서비스이름.네임스페이스.svc.cluster.local`로 찾아가고, 밖으로는 NodePort나 LoadBalancer로 연다.

## 이 글에서 다루는 것
- 파드 IP를 직접 쓰면 안 되는 이유
- 서비스: 셀렉터, 가상 IP, 엔드포인트
- 클러스터 DNS: 이름 규칙과 검색 도메인
- 직접 해 보기: 요청이 나뉘는 모습, 파드가 바뀌어도 그대로인 주소
- 서비스의 종류: ClusterIP, NodePort, LoadBalancer, 헤드리스

## 파드 IP를 쓰면 안 되는 이유
파드마다 IP가 있고, 클러스터 안에서는 어느 파드끼리도 바로 통신할 수 있다(쿠버네티스 네트워크 모델). 그렇다고 주문 서비스가 결제 서비스 파드의 IP를 설정에 적으면 곧 깨진다. 파드는 재배포, 노드 장애, 확장 때마다 새로 만들어지고 **IP가 바뀐다**. 또 파드는 여러 개라서 어느 하나를 골라야 한다.

**서비스**(Service)가 이 둘을 해결한다.
- 레이블 셀렉터로 대상 파드를 고른다. 파드가 바뀌어도 셀렉터는 그대로다.
- 바뀌지 않는 **가상 IP**(ClusterIP)와 **DNS 이름**을 준다.
- 그 주소로 온 연결을 준비된 파드들에 나눠 보낸다.

서비스가 고른 파드의 실제 주소 목록은 **엔드포인트슬라이스**(EndpointSlice)라는 오브젝트에 컨트롤러가 계속 갱신해 둔다. 각 노드의 kube-proxy는 이 목록을 보고 "가상 IP로 가는 패킷을 이 파드들 중 하나로 보낸다"는 규칙(iptables 등)을 만든다. 그래서 가상 IP는 어느 컴퓨터의 네트워크 장치에도 붙어 있지 않다. 규칙으로만 존재하는 주소다.

## 직접 해 보기: 서비스 만들기
자기 호스트 이름(= 파드 이름)을 돌려주는 작은 웹 서버를 3개 띄우고, 그 앞에 서비스를 둔다. 서비스는 80번 포트로 받아 파드의 8080번으로 보낸다.
```yaml
# 파일: echo.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo
spec:
  replicas: 3
  selector:
    matchLabels:
      app: echo
  template:
    metadata:
      labels:
        app: echo
    spec:
      containers:
        - name: httpd
          image: busybox:1.36
          command: ["sh", "-c", "mkdir /www && hostname > /www/index.html && httpd -f -p 8080 -h /www"]
---
apiVersion: v1
kind: Service
metadata:
  name: echo
spec:
  selector:
    app: echo            # 이 레이블을 가진 파드로
  ports:
    - port: 80           # 서비스가 받는 포트
      targetPort: 8080   # 파드의 포트
```
```bash
kubectl apply -f echo.yaml
kubectl rollout status deployment/echo --timeout=120s > /dev/null
kubectl get service echo -o jsonpath='종류 {.spec.type}, 가상 IP {.spec.clusterIP}{"\n"}'
kubectl get endpointslices -l kubernetes.io/service-name=echo \
  -o jsonpath='준비된 엔드포인트 {range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]} {end}{"\n"}' | sed -E 's/[0-9.]+/IP/g'
```
```text
deployment.apps/echo created
service/echo created
종류 ClusterIP, 가상 IP …
준비된 엔드포인트 IP IP IP
```
서비스에 가상 IP가 붙었고, 엔드포인트슬라이스에는 파드 3개의 IP가 들어갔다. 이제 클러스터 안에 요청을 보낼 파드(`client`)를 하나 띄우고, 그 안에서 서비스 **이름**으로 30번 요청해 서로 다른 파드가 몇 개 답했는지 센다.
```bash
kubectl run client --image=busybox:1.36 -- sleep 3600 > /dev/null    # 요청을 보낼 파드
kubectl wait --for=condition=Ready pod/client --timeout=60s > /dev/null
ask() { kubectl exec client -- sh -c "$1"; }
ask 'for i in $(seq 30); do wget -qO- http://echo; done | sort | uniq -c | wc -l'
```
```text
3
```
요청이 서로 다른 파드 3개에 나뉘었다. 클라이언트는 파드가 몇 개인지, 어디에 있는지 모른다. 나누는 방식은 기본으로 연결마다 무작위에 가깝다. 같은 클라이언트를 늘 같은 파드로 보내려면 `sessionAffinity: ClientIP`를 쓴다.

## 클러스터 DNS
`http://echo`가 어떻게 가상 IP로 바뀌었을까. 클러스터에는 DNS 서버(CoreDNS, 2편에서 본 `coredns` 파드)가 있고, 모든 서비스에 이름을 붙인다. 이름 규칙은 `서비스.네임스페이스.svc.cluster.local`이다. 파드의 `/etc/resolv.conf`에는 검색 도메인이 들어 있어 짧은 이름도 찾아진다.
```bash
ask 'grep -E "^(search|nameserver)" /etc/resolv.conf; nslookup echo | grep -A1 "^Name:"' | sed -E 's/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/IP/g'
```
```text
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver IP
Name:	echo.default.svc.cluster.local
Address: IP
```
- 파드는 클러스터 DNS를 네임서버로 쓴다.
- `echo`는 검색 도메인 `default.svc.cluster.local`이 붙어 `echo.default.svc.cluster.local`로 찾아졌다. 같은 네임스페이스에서는 `echo`, 다른 네임스페이스에서는 `echo.default`처럼 네임스페이스를 붙여 부른다.

## 파드가 바뀌어도
파드를 모두 지워 새 파드로 바꾸고(새 IP), 개수도 하나로 줄인다. 서비스 주소는 그대로이고, 엔드포인트만 바뀐다.
```bash
before=$(kubectl get service echo -o jsonpath='{.spec.clusterIP}')
kubectl scale deployment echo --replicas=1 > /dev/null
kubectl delete pods -l app=echo --now > /dev/null          # 남은 파드도 지워 새 파드로 바꾼다
until [ "$(kubectl get pods -l app=echo --no-headers | wc -l)" = 1 ] && kubectl wait --for=condition=Ready pod -l app=echo --timeout=60s > /dev/null; do sleep 1; done
sleep 2                                                      # 노드의 전달 규칙이 바뀔 시간
echo "가상 IP가 그대로인가: $( [ "$before" = "$(kubectl get service echo -o jsonpath='{.spec.clusterIP}')" ] && echo 예 )"
ask 'for i in $(seq 10); do wget -qO- http://echo; done | sort | uniq -c | wc -l'
```
```text
가상 IP가 그대로인가: 예
1
```
준비된 파드가 하나뿐이라 모든 요청이 그 파드로 갔다. 엔드포인트슬라이스에는 파드마다 준비 여부가 함께 적히고, 요청은 **준비된**(ready) 파드로만 간다. 그래서 10편의 준비 프로브가 "아직 요청을 받을 수 없다"고 하면, 그 파드는 서비스에서 빠진다.

## 서비스의 종류
- **ClusterIP**(기본값): 클러스터 안에서만 닿는 가상 IP. 서비스끼리의 통신에 쓴다.
- **NodePort**: 모든 노드의 특정 포트(30000~32767)를 열어, `노드IP:포트`로 클러스터 밖에서 들어오게 한다. 직접 쓰기보다는 외부 로드 밸런서가 이 포트로 보내게 한다.
- **LoadBalancer**: 클라우드의 로드 밸런서를 만들어 외부 주소를 준다. 클라우드에서는 컨트롤러가 실제 로드 밸런서를 만들고, k3s에서는 노드 IP를 그대로 쓰는 간단한 구현(ServiceLB)이 붙는다.
- **헤드리스**(`clusterIP: None`): 가상 IP 없이, DNS가 파드 IP들을 직접 돌려준다. 파드 하나하나를 구별해 불러야 하는 StatefulSet(8편)에 쓴다.

헤드리스 서비스를 하나 더 만들어 DNS 응답을 비교한다.
```bash
kubectl scale deployment echo --replicas=3 > /dev/null && kubectl rollout status deployment/echo > /dev/null
kubectl create service clusterip echo-headless --clusterip=None --tcp=8080:8080 --dry-run=client -o yaml \
  | sed 's/app: echo-headless/app: echo/' | kubectl apply -f - > /dev/null
ask 'nslookup echo | grep -c "^Address: [0-9]"; nslookup echo-headless | grep -c "^Address: [0-9]"'
kubectl delete -f echo.yaml --now > /dev/null; kubectl delete service echo-headless > /dev/null
kubectl delete pods -l app=echo --now > /dev/null; kubectl delete pod client --now > /dev/null
```
```text
1
3
```
일반 서비스는 가상 IP 하나를, 헤드리스 서비스는 파드 IP 3개를 돌려주었다. 헤드리스로는 나누는 일을 클라이언트가 직접 한다.

## 흔한 오해
- "서비스의 가상 IP로 ping이 된다": 가상 IP는 서비스 포트에 대한 규칙일 뿐이라 ping(ICMP)에는 보통 답하지 않는다. 연결이 되는지는 실제 포트로 확인한다.
- "서비스가 HTTP 요청마다 나눠 준다": 연결(TCP) 단위로 나눈다. keep-alive로 연결을 오래 쓰면 한 파드에 몰릴 수 있다. HTTP 요청 단위로 나누려면 인그레스(6편)나 서비스 메시를 쓴다.
- "셀렉터에 맞으면 무조건 요청을 받는다": 준비된 파드만 요청을 받는다. 지워지는 중이거나 준비 프로브를 통과하지 못한 파드는 빠진다.

## 어디에 쓰이나
- 웹 앱의 원리 8편 「이름을 주소로 바꾸는 DNS: 질의, 캐시, TTL」: 검색 도메인과 이름 풀이, DNS 캐시가 서비스 이름 뒤에서 하는 일을 본다.
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 연결 단위로 나누는 L4와 요청 단위로 나누는 L7의 차이가 서비스와 인그레스의 차이다.
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: Compose의 서비스 이름 DNS와 비교해 본다.

## 정리
- 파드 IP는 바뀌므로, 서비스가 셀렉터로 고른 파드 앞에 고정된 가상 IP와 DNS 이름을 둔다.
- 엔드포인트슬라이스에는 파드의 주소와 준비 여부가 들어가고, kube-proxy가 가상 IP로 온 연결을 준비된 파드로 보낸다.
- DNS 이름은 `서비스.네임스페이스.svc.cluster.local`이고, 검색 도메인 덕에 짧은 이름도 된다.
- ClusterIP(안), NodePort·LoadBalancer(밖), 헤드리스(파드 IP 직접)를 용도에 맞게 쓴다.

## 더 알아보기
- 이전 글: 4편 「디플로이먼트: 개수 유지, 롤링 업데이트, 되돌리기」
- 다음 글: 6편 「인그레스와 게이트웨이 API: 클러스터 밖에서 들어오는 HTTP」
