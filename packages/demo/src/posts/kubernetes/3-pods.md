# [쿠버네티스 실무 3/14] 파드: 함께 뜨고 함께 죽는 컨테이너 묶음

> **한 줄 요약** — 파드는 같은 노드에 함께 놓이고 네트워크(IP와 localhost)와 볼륨을 나눠 쓰는 컨테이너 묶음으로, 초기화 컨테이너가 먼저 끝나야 본 컨테이너가 시작되고, 컨테이너가 죽으면 kubelet이 재시작 정책에 따라 점점 긴 간격으로 다시 띄우며(CrashLoopBackOff), 파드 자체는 한 번 사라지면 되살아나지 않는다.

## 이 글에서 다루는 것
- 파드가 컨테이너를 묶는 이유: 공유하는 것들
- 초기화 컨테이너와 사이드카
- 파드와 컨테이너의 상태, 재시작 정책, CrashLoopBackOff
- 직접 해 보기: 컨테이너 셋짜리 파드, 죽는 컨테이너, `logs`·`exec`·`port-forward`
- 파드를 직접 만들지 않는 이유

## 왜 컨테이너를 묶나
한 컨테이너에는 한 프로세스(한 가지 일)를 넣는 것이 원칙이다. 그런데 어떤 프로세스들은 늘 붙어 다녀야 한다. 웹 서버와 그 로그를 모아 보내는 수집기, 앱과 앱 앞에서 TLS를 처리하는 프록시 같은 경우다. 쿠버네티스는 이런 컨테이너들을 **파드**로 묶는다. 한 파드의 컨테이너들은 이것을 나눠 쓴다.
- **네트워크**: 파드마다 IP가 하나 있고, 컨테이너들은 같은 네트워크 네임스페이스에 있다. 서로 `localhost`로 부르고, 포트가 겹치면 안 된다.
- **볼륨**: 파드에 선언한 볼륨을 여러 컨테이너가 함께 마운트해 파일을 주고받는다.
- **운명**: 같은 노드에 함께 놓이고, 함께 만들어지고 함께 지워진다.

## 초기화 컨테이너와 사이드카
- **초기화 컨테이너**(init container): 본 컨테이너보다 먼저, 하나씩 차례로 실행되어 **끝나야** 하는 컨테이너다. 설정 파일 만들기, DB가 뜰 때까지 기다리기, 마이그레이션 같은 준비 작업에 쓴다. 실패하면 본 컨테이너는 시작하지 않는다.
- **사이드카**: 본 컨테이너 곁에서 계속 함께 도는 보조 컨테이너다. 1.33부터 정식 기능이 된 "네이티브 사이드카"는 초기화 컨테이너 목록에 `restartPolicy: Always`를 붙여 선언하며, 본 컨테이너보다 먼저 뜨고 나중에 내려간다.

## 직접 해 보기: 컨테이너 셋짜리 파드
초기화 컨테이너가 웹 페이지 파일을 만들고, nginx가 그 파일을 제공하고, 사이드카가 2초마다 `localhost`로 nginx를 불러 결과를 로그로 남긴다. 셋은 `emptyDir` 볼륨(파드가 살아 있는 동안만 있는 빈 폴더, 8편)을 나눠 쓴다.
```yaml
# 파일: web-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  volumes:
    - name: html
      emptyDir: {}
  initContainers:
    - name: make-page
      image: busybox:1.36
      command: ["sh", "-c", "echo 'hello from init' > /work/index.html"]
      volumeMounts:
        - name: html
          mountPath: /work
  containers:
    - name: nginx
      image: nginx:1.27-alpine
      volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
    - name: poller
      image: busybox:1.36
      command: ["sh", "-c", "while true; do wget -qO- http://localhost:80; sleep 2; done"]
```
```bash
kubectl apply -f web-pod.yaml
kubectl wait --for=condition=Ready pod/web --timeout=120s
kubectl get pod web -o jsonpath='{range .status.initContainerStatuses[*]}{.name}: {.state.terminated.reason}{"\n"}{end}{range .status.containerStatuses[*]}{.name}: ready={.ready}{"\n"}{end}'
sleep 3; kubectl logs web -c poller --tail=1
```
```text
pod/web created
pod/web condition met
make-page: Completed
nginx: ready=true
poller: ready=true
hello from init
```
초기화 컨테이너는 할 일을 마치고 `Completed`로 끝났고, 그 뒤에 두 컨테이너가 떴다. 사이드카는 `localhost:80`으로 nginx를 불렀다. 다른 컨테이너인데도 같은 네트워크에 있기 때문이다. nginx는 초기화 컨테이너가 볼륨에 쓴 파일을 그대로 제공했다. `-c`로 컨테이너를 골라 로그를 본다.

`kubectl exec`는 실행 중인 컨테이너 안에서 명령을 실행하고, `kubectl port-forward`는 내 컴퓨터의 포트를 파드로 잇는다. 둘 다 디버깅용이다.
```bash
echo "nginx 컨테이너의 IP와 파드 IP가 같은가: $( [ "$(kubectl exec web -c nginx -- hostname -i)" = "$(kubectl get pod web -o jsonpath='{.status.podIP}')" ] && echo 예 )"
kubectl exec web -c poller -- ls /usr/share/nginx/html 2>&1
kubectl port-forward pod/web 8080:80 > /dev/null 2>&1 & PF=$!
until curl -s localhost:8080 > /dev/null; do sleep 0.5; done
curl -s localhost:8080
{ kill $PF; wait $PF; } 2>/dev/null
```
```text
nginx 컨테이너의 IP와 파드 IP가 같은가: 예
ls: /usr/share/nginx/html: No such file or directory
command terminated with exit code 1
hello from init
```
네트워크는 함께 쓰지만, 파일 시스템은 따로다. `poller`에는 nginx 컨테이너의 폴더가 없다. 볼륨을 마운트하지 않았기 때문이다. 나눠 쓰고 싶은 것만 볼륨으로 나눈다. 프로세스도 기본으로는 따로 보인다(`shareProcessNamespace: true`로 합칠 수 있다).

## 상태와 재시작
파드에는 **단계**(phase)가 있다. `Pending`(노드 배정이나 이미지 받기를 기다림), `Running`, `Succeeded`(모두 정상 종료), `Failed`, `Unknown`(노드와 연락 끊김). 컨테이너마다는 `Waiting`, `Running`, `Terminated` 상태가 있다. 컨테이너가 끝났을 때 어떻게 할지는 파드의 `restartPolicy`가 정한다. `Always`(기본값, 디플로이먼트의 파드), `OnFailure`, `Never`(12편의 잡).

계속 죽는 컨테이너를 만들어 본다. 시작하자마자 오류를 내고 끝난다.
```bash
kubectl run crash --image=busybox:1.36 --restart=Always -- sh -c 'echo "설정 파일이 없다"; exit 1' > /dev/null
until [ "$(kubectl get pod crash -o jsonpath='{.status.containerStatuses[0].restartCount}')" -ge 2 ] 2>/dev/null \
  && [ "$(kubectl get pod crash -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}')" = CrashLoopBackOff ]; do sleep 1; done
kubectl get pod crash -o jsonpath='상태: {.status.containerStatuses[0].state.waiting.reason}{"\n"}마지막 종료 코드: {.status.containerStatuses[0].lastState.terminated.exitCode}{"\n"}'
kubectl logs crash --previous
kubectl delete pod crash web --now > /dev/null
```
```text
상태: CrashLoopBackOff
마지막 종료 코드: 1
설정 파일이 없다
```
- kubelet은 죽은 컨테이너를 다시 띄우되, 실패가 이어지면 다음 시도까지 10초, 20초, 40초… 최대 5분까지 간격을 늘린다. 기다리는 동안의 상태가 **CrashLoopBackOff**다. 오류 자체가 아니라 "계속 죽어서 쉬는 중"이라는 표시다.
- `logs --previous`는 직전에 죽은 컨테이너의 로그를 보여 준다. CrashLoopBackOff의 원인은 대부분 여기에 있다.
- 다시 띄우는 것은 **컨테이너**다. 파드는 그대로이고 같은 노드, 같은 IP에 남는다.

## 파드를 직접 만들지 않는 이유
파드는 한 번 만들어지면 그 노드에 묶인다. 노드가 죽거나 파드가 지워지면 그 파드는 끝이고, 같은 파드가 되살아나지 않는다. 그래서 실제로는 파드를 직접 만들지 않고, 파드를 원하는 수만큼 유지해 주는 **디플로이먼트**(4편), 끝까지 실행하는 **잡**(12편), 노드마다 하나씩 두는 **데몬셋**(12편) 같은 컨트롤러에 파드의 틀(template)을 맡긴다. 위에서 만든 `web` 파드도 지우면 끝이다.

## 흔한 오해
- "파드 하나에 앱 여러 개를 넣으면 효율적이다": 함께 확장되고 함께 재시작된다. 따로 늘리고 배포할 것은 다른 파드로 나눈다. 같은 파드에는 정말 붙어 다녀야 하는 것만 넣는다.
- "CrashLoopBackOff는 쿠버네티스의 오류다": 대부분 앱이 바로 끝나는 문제다. `logs --previous`와 `describe`의 이벤트를 본다.
- "재시작되면 파드가 새로 만들어진다": 컨테이너만 다시 뜬다. 파드 이름, IP, `emptyDir`의 내용은 그대로다.

## 어디에 쓰이나
- 도커와 컨테이너 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」: 컨테이너 하나의 생명 주기와 `exec`, `logs`를 도커에서 먼저 본다.
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: 컨테이너마다 네트워크 네임스페이스가 있다는 점을 알면, 파드가 그것을 나눠 쓰는 방식이 이해된다.
- Nginx 웹 서버 5편 「리버스 프록시: proxy_pass와 헤더, 시간 제한」: 앱 곁에 붙는 프록시 사이드카가 하는 일을 본다.

## 정리
- 파드는 네트워크(IP, localhost), 볼륨, 운명을 함께하는 컨테이너 묶음이다.
- 초기화 컨테이너는 차례로 끝나야 본 컨테이너가 시작되고, 사이드카는 곁에서 함께 돈다.
- 컨테이너가 죽으면 재시작 정책에 따라 다시 띄우며, 실패가 이어지면 CrashLoopBackOff로 간격을 늘린다.
- 파드는 되살아나지 않는다. 그래서 디플로이먼트 같은 컨트롤러로 파드를 관리한다.

## 더 알아보기
- 이전 글: 2편 「클러스터와 kubectl: 로컬 클러스터를 만들고 오브젝트를 읽는 법」
- 다음 글: 4편 「디플로이먼트: 개수 유지, 롤링 업데이트, 되돌리기」
