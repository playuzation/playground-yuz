# [쿠버네티스 실무 6/14] 인그레스와 게이트웨이 API: 클러스터 밖에서 들어오는 HTTP

> **한 줄 요약** — 서비스마다 외부 로드 밸런서를 두는 대신, 클러스터 입구의 리버스 프록시(인그레스 컨트롤러) 하나가 호스트 이름과 경로를 보고 HTTP 요청을 알맞은 서비스로 보내며, 그 규칙을 적는 오브젝트가 인그레스이고, 역할을 나누고 헤더 매칭과 트래픽 비율 같은 기능을 표준으로 넣은 후속 API가 게이트웨이 API다.

## 이 글에서 다루는 것
- 왜 HTTP 입구가 따로 필요한가
- 인그레스와 인그레스 컨트롤러
- 직접 해 보기: 호스트·경로로 나누기, TLS 붙이기
- 게이트웨이 API: GatewayClass, Gateway, HTTPRoute
- 직접 해 보기: 헤더로 새 버전 고르기, 비율로 나누기

## 왜 HTTP 입구가 따로 필요한가
5편의 LoadBalancer 서비스로도 밖에서 들어올 수 있다. 하지만 서비스마다 로드 밸런서를 만들면 비용이 늘고, 주소도 서비스마다 다르다. 웹 서비스에는 보통 이런 요구가 있다.
- `shop.example.com`은 쇼핑, `blog.example.com`은 블로그로 보내기(호스트 이름).
- 같은 도메인에서 `/api`는 API 서버, 나머지는 프론트엔드로 보내기(경로).
- TLS 인증서를 한곳에서 붙이고 갱신하기.

이것은 웹 앱의 원리 18편과 Nginx 웹 서버 5편의 **리버스 프록시**가 하는 일이다. 쿠버네티스에서는 이 프록시를 클러스터 입구에 두고, 규칙을 쿠버네티스 오브젝트로 적는다.

## 인그레스와 인그레스 컨트롤러
**인그레스**(Ingress)는 "이 호스트와 경로는 이 서비스로"라는 **규칙**일 뿐이다. 규칙을 읽어 실제로 요청을 나르는 프로그램이 **인그레스 컨트롤러**다. Traefik, NGINX 계열, HAProxy, 클라우드의 로드 밸런서 컨트롤러 등 여러 구현이 있고, 클러스터에 따로 설치한다. k3s에는 Traefik이 들어 있다(2편에서 본 `traefik` 파드). 인그레스의 `ingressClassName`이 어느 컨트롤러가 맡을지 정한다.

## 직접 해 보기: 호스트와 경로로 나누기
자기 이름을 돌려주는 앱 셋(`shop`, `shop-api`, `blog`)을 띄운다. 앱 하나는 디플로이먼트와 서비스 한 쌍이다.
```bash
app() {   # 이름과 응답 문장을 받아 디플로이먼트와 서비스를 만든다
  kubectl create deployment $1 --image=busybox:1.36 --dry-run=client -o yaml -- \
    sh -c "mkdir -p /www/api && echo '$2' | tee /www/index.html > /www/api/index.html && httpd -f -p 8080 -h /www" \
    | kubectl apply -f - > /dev/null
  kubectl expose deployment $1 --port=80 --target-port=8080 > /dev/null
}
app shop 'shop v1'; app shop-api 'shop api'; app blog 'blog'
kubectl wait --for=condition=Available deployment shop shop-api blog --timeout=120s > /dev/null && echo ready
```
```text
ready
```
규칙은 이렇다. `shop.example.com`의 `/api`로 시작하는 경로는 API로, 나머지는 쇼핑으로, `blog.example.com`은 블로그로.
```yaml
# 파일: ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: traefik
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: shop-api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: shop
                port:
                  number: 80
    - host: blog.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: blog
                port:
                  number: 80
```
Traefik은 노드의 80번 포트에서 기다린다. DNS를 따로 만들지 않고, 요청의 `Host` 헤더로 도메인을 흉내 낸다.
```bash
kubectl apply -f ingress.yaml
get() { curl -s -H "Host: $1" "http://127.0.0.1$2"; }
until [ "$(get shop.example.com /)" = "shop v1" ]; do sleep 1; done
get shop.example.com /
get shop.example.com /api/
get blog.example.com /
curl -s -o /dev/null -w '모르는 호스트: %{http_code}\n' -H 'Host: nobody.example.com' http://127.0.0.1/
```
```text
ingress.networking.k8s.io/web created
shop v1
shop api
blog
모르는 호스트: 404
```
같은 주소(노드의 80번)로 들어온 요청이 호스트와 경로에 따라 세 서비스로 나뉘었다. 규칙에 없는 호스트는 404다. `pathType: Prefix`는 경로 앞부분이 같으면(`/api`, `/api/orders`) 맞는 것으로 보고, 더 긴 경로의 규칙이 먼저 적용된다. `Exact`는 정확히 같을 때만이다.

## TLS 붙이기
인증서를 **Secret**(7편)에 넣고 인그레스의 `tls`에 연결하면, 컨트롤러가 HTTPS를 처리한다(TLS 종료). 연습이니 스스로 서명한 인증서를 만든다. 실무에서는 cert-manager 같은 도구가 Let's Encrypt에서 인증서를 받아 Secret을 자동으로 갱신한다.
```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj '/CN=shop.example.com' \
  -addext 'subjectAltName=DNS:shop.example.com' -keyout tls.key -out tls.crt 2> /dev/null
kubectl create secret tls shop-tls --cert=tls.crt --key=tls.key > /dev/null
kubectl patch ingress web --type=json -p '[{"op": "add", "path": "/spec/tls", "value": [{"hosts": ["shop.example.com"], "secretName": "shop-tls"}]}]' > /dev/null
https() { curl -s --cacert tls.crt --resolve shop.example.com:443:127.0.0.1 https://shop.example.com/; }
until [ "$(https)" = "shop v1" ]; do sleep 1; done
https
curl -sv --cacert tls.crt --resolve shop.example.com:443:127.0.0.1 https://shop.example.com/ 2>&1 | grep -o 'subject: CN=.*'
```
```text
shop v1
subject: CN=shop.example.com
```
`--cacert`로 우리 인증서를 믿게 하자 `curl`이 인증서 검사를 통과했고, Traefik이 우리 인증서로 TLS를 맺었다. 파드는 여전히 평문 HTTP(8080)만 안다. 인증서는 입구 한곳에서 관리한다.

## 게이트웨이 API
인그레스는 단순해서 널리 퍼졌지만 한계가 분명했다. 헤더로 나누기, 트래픽 비율, 요청 고쳐 쓰기 같은 기능이 표준에 없어 컨트롤러마다 어노테이션으로 따로 붙였다. 그래서 같은 인그레스가 컨트롤러를 바꾸면 다르게 동작했다. 또 오브젝트 하나에 인프라 설정(어느 포트, 어느 인증서)과 앱 라우팅이 섞여, 플랫폼 팀과 앱 팀이 함께 고쳐야 했다.

**게이트웨이 API**는 그 후속 표준으로, 2023년 10월 v1.0이 나왔다. 역할에 따라 오브젝트를 나눈다.
- **GatewayClass**: 어떤 구현(컨트롤러)을 쓰는가. 인프라 제공자가 만든다.
- **Gateway**: 입구 하나. 어느 포트에서 어떤 프로토콜로 받을지, 인증서는 무엇인지. 플랫폼 팀이 만든다.
- **HTTPRoute**: 그 입구에 붙는 라우팅 규칙. 앱 팀이 자기 네임스페이스에서 만든다.

k3s의 Traefik은 게이트웨이 API 지원이 꺼져 있어, k3s의 HelmChartConfig로 켠다(다른 클러스터라면 쓰는 컨트롤러의 설명서를 따른다).
```yaml
# 파일: traefik-gateway.yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    providers:
      kubernetesGateway:
        enabled: true
```
```bash
kubectl apply -f traefik-gateway.yaml > /dev/null
until kubectl get gatewayclass traefik > /dev/null 2>&1; do sleep 2; done
kubectl get gatewayclass traefik -o custom-columns=NAME:.metadata.name,CONTROLLER:.spec.controllerName
```
```text
NAME      CONTROLLER
traefik   traefik.io/gateway-controller
```

## 직접 해 보기: 헤더와 비율로 나누기
`shop`의 새 버전 v2를 띄우고, 게이트웨이와 라우트를 만든다. `x-version: v2` 헤더가 있으면 v2로 보내고, 나머지는 v1에 80%, v2에 20%를 보낸다(카나리 배포). Traefik은 HTTP를 안쪽 8000번 포트(노드의 80번이 이어진 곳)에서 받으므로 리스너도 8000번이다.
```yaml
# 파일: gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      protocol: HTTP
      port: 8000
      hostname: "*.example.org"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop
spec:
  parentRefs:
    - name: web
  hostnames: ["shop.example.org"]
  rules:
    - matches:
        - headers:
            - name: x-version
              value: v2
      backendRefs:
        - name: shop-v2
          port: 80
    - backendRefs:
        - name: shop
          port: 80
          weight: 80
        - name: shop-v2
          port: 80
          weight: 20
```
```bash
app shop-v2 'shop v2'
kubectl wait --for=condition=Available deployment shop-v2 --timeout=120s > /dev/null
kubectl apply -f gateway.yaml > /dev/null
until [ "$(kubectl get httproute shop -o jsonpath='{.status.parents[0].conditions[?(@.type=="Accepted")].status}')" = True ] \
  && [ -n "$(get shop.example.org /)" ]; do sleep 1; done
curl -s -H 'Host: shop.example.org' -H 'x-version: v2' http://127.0.0.1/
v2=$(for i in $(seq 100); do get shop.example.org /; done | grep -c 'v2')
echo "헤더 없이 100번 중 v2가 일부만 받았다: $( [ $v2 -gt 0 ] && [ $v2 -lt 50 ] && echo 예 )"
```
```text
shop v2
헤더 없이 100번 중 v2가 일부만 받았다: 예
```
헤더가 있는 요청은 정확히 v2로 갔고, 나머지는 대략 4:1로 나뉘었다(매번 수가 달라 범위만 확인했다). 둘 다 표준 필드라, 다른 게이트웨이 구현으로 바꿔도 같은 뜻이다. 비율을 20 → 50 → 100으로 올리면 새 버전으로 천천히 옮겨 갈 수 있다.
```bash
kubectl delete -f gateway.yaml -f ingress.yaml > /dev/null
kubectl delete deployment,service shop shop-api blog shop-v2 --now > /dev/null; kubectl delete secret shop-tls > /dev/null
kubectl delete pods -l 'app in (shop, shop-api, blog, shop-v2)' --now > /dev/null
```

## 흔한 오해
- "인그레스를 만들면 바로 동작한다": 인그레스 컨트롤러가 설치되어 있어야 한다. 없으면 규칙만 저장되고 아무 일도 일어나지 않는다.
- "인그레스는 TCP도 나눈다": 인그레스는 HTTP(S) 규칙이다. TCP·UDP는 LoadBalancer 서비스나 게이트웨이 API의 TCPRoute 같은 다른 방법을 쓴다.
- "게이트웨이 API가 나왔으니 인그레스는 곧 사라진다": 인그레스는 안정된 API로 계속 지원된다. 새 기능은 게이트웨이 API 쪽에 들어가므로 새로 시작한다면 게이트웨이 API를 먼저 검토한다.

## 어디에 쓰이나
- Nginx 웹 서버 5편 「리버스 프록시: proxy_pass와 헤더, 시간 제한」: 인그레스 컨트롤러가 안에서 하는 일(Host 헤더, 프록시 헤더, 시간 제한)을 직접 설정해 본다.
- 웹 앱의 원리 10편 「HTTPS와 TLS: 암호화, 인증서, 핸드셰이크」: 입구에서 TLS를 종료할 때 무슨 일이 일어나는지 본다.
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 호스트·경로·헤더로 나누는 L7 라우팅과 카나리 배포를 일반적인 형태로 본다.

## 정리
- 인그레스는 호스트·경로별 HTTP 라우팅 규칙이고, 인그레스 컨트롤러(Traefik 등)가 실제로 요청을 나른다.
- TLS는 인증서를 Secret에 넣고 인그레스에 연결해 입구에서 종료한다.
- 게이트웨이 API는 GatewayClass(구현), Gateway(입구), HTTPRoute(라우팅)로 역할을 나눈 후속 표준이다.
- 헤더 매칭과 가중치 같은 기능이 표준이라 카나리 배포를 구현에 묶이지 않고 적을 수 있다.

## 더 알아보기
- 이전 글: 5편 「서비스와 DNS: 바뀌는 파드 앞의 고정 주소」
- 다음 글: 7편 「ConfigMap과 Secret: 설정과 비밀을 이미지 밖으로」
