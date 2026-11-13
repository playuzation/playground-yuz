# [Nginx 웹 서버 1/10] Nginx란: 이벤트 기반 웹 서버와 C10K

> **한 줄 요약** — Nginx는 연결마다 프로세스나 스레드를 붙이는 대신, 소수의 워커 프로세스가 이벤트 루프로 수만 개의 연결을 번갈아 돌보게 만든 웹 서버로, 정적 파일 서빙·리버스 프록시·로드 밸런싱·TLS 종료·캐시를 한 프로그램에서 해 웹 서비스의 대문으로 가장 많이 쓰인다.

## 이 글에서 다루는 것
- C10K 문제: 연결 1만 개를 동시에 붙잡는 일
- 연결마다 스레드 vs 이벤트 루프
- Nginx의 구조: 마스터 프로세스와 워커 프로세스
- Nginx가 맡는 일들
- 직접 해 보기: 띄우고, 프로세스를 보고, 연결 500개를 붙잡아 보기

## C10K 문제
1990년대 말 웹 서버는 대개 연결 하나에 프로세스나 스레드 하나를 붙였다. 요청을 읽고, 파일을 찾고, 응답을 쓰는 동안 그 스레드는 그 연결만 돌본다. 코드는 단순하지만 연결이 많아지면 문제가 된다. 스레드마다 스택 메모리가 들고, 운영체제는 수천 개 스레드 사이를 오가는 데(문맥 전환) 시간을 쓴다. 게다가 웹의 연결 대부분은 일을 하지 않고 **기다린다**. 느린 휴대폰이 요청을 천천히 보내거나, keep-alive(웹 앱의 원리 15편)로 다음 요청을 기다리는 연결이다. 1999년 무렵 댄 케겔은 "서버 한 대가 동시 연결 1만 개(C10K)를 감당하려면 어떻게 해야 하나"라는 질문으로 이 문제를 정리했다.

답은 **이벤트 기반** 설계였다. 스레드 하나가 수많은 연결을 운영체제에 맡겨 두고 "읽을 데이터가 온 연결", "쓸 수 있게 된 연결"만 알려 달라고 한다(리눅스의 epoll, BSD의 kqueue). 그리고 알림이 온 연결의 일만 조금씩 처리하고 다음으로 넘어간다. 기다리는 연결은 메모리 몇 KB와 목록의 한 줄만 차지한다. 웹 앱의 원리 2편의 이벤트 루프, Redis 실무 1편의 한 줄 실행과 같은 발상이다.

## Nginx의 구조
러시아의 이고르 시소예프가 이 문제를 풀려고 만들어 2004년 10월 4일 처음 공개한 것이 **Nginx**("엔진 엑스")다. 2019년 F5가 Nginx 회사를 인수했고, 지금도 오픈 소스로 개발된다.
```text
master (root)
  reads config, opens ports
  ├─ worker  event loop
  ├─ worker  event loop
  └─ worker  event loop
```
- **마스터 프로세스**: 설정 파일을 읽고, 포트를 열고, 워커를 띄우고 감시한다. 설정을 다시 읽을 때 새 워커를 띄우고 옛 워커를 조용히 내린다(2편).
- **워커 프로세스**: 실제 연결을 처리한다. 보통 CPU 코어 수만큼(`worker_processes auto`) 두고, 각 워커가 이벤트 루프로 수천~수만 연결(`worker_connections`)을 돌본다. 워커는 서로 메모리를 나누지 않아 한 워커가 죽어도 마스터가 새로 띄운다.

## Nginx가 맡는 일
- **정적 파일 서빙**: HTML, 이미지, 스크립트를 디스크에서 바로 보낸다(3편).
- **리버스 프록시**: 뒤의 애플리케이션 서버로 요청을 넘기고 응답을 돌려준다(5편).
- **로드 밸런싱**: 뒤의 서버 여러 대에 나눠 준다(6편).
- **TLS 종료와 HTTP/2**: HTTPS를 여기서 끝낸다(7편).
- **캐시와 압축, 속도 제한**: 원본의 부담을 줄이고 남용을 막는다(8편, 9편).

웹 앱의 원리 18편에서 파이썬으로 흉내 낸 리버스 프록시와 로드 밸런서를, 실무에서는 대개 Nginx 설정 몇 줄로 한다. 이 시리즈는 그 설정을 하나씩 실제로 돌려 본다.

## 직접 해 보기 1: 띄우고 프로세스 보기
우분투라면 `sudo apt install nginx`로 설치한다(이 글의 출력은 우분투 24.04 패키지의 Nginx 1.24 기준). 기본 설정(`/etc/nginx/nginx.conf`)을 건드리지 않도록, 지금 폴더에 작은 설정 파일을 두고 `-p`(기준 폴더)와 `-c`(설정 파일)로 띄운다. `daemon off`는 백그라운드로 숨지 않고 이 셸의 작업으로 남게 한다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
worker_processes 2;

events {
    worker_connections 2048;
}

http {
    access_log logs/access.log;
    server {
        listen 127.0.0.1:8080;
        location / {
            return 200 "hello from nginx\n";
        }
        location = /status {
            stub_status;
        }
    }
}
```
```bash
mkdir -p logs
nginx -p "$PWD" -c nginx.conf -t 2>&1 | sed 's#/.*/nginx.conf#nginx.conf#'
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
curl -s http://127.0.0.1:8080/
curl -sI http://127.0.0.1:8080/ | grep -E '^(HTTP|Server)'
ps -eo args | grep -E '^nginx: (master|worker)' | sed 's/ process.*/ process/' | sort | uniq -c
```
```text
nginx: the configuration file nginx.conf syntax is ok
nginx: configuration file nginx.conf test is successful
hello from nginx
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
      1 nginx: master process
      2 nginx: worker process
```
`-t`는 설정 파일을 검사만 하고 끝낸다. 바꾸기 전에 늘 먼저 돌리는 습관을 들이자. 프로세스는 마스터 하나와 설정대로 워커 둘이다.

## 직접 해 보기 2: 연결 500개 붙잡기
아무 요청도 보내지 않고 연결만 500개 열어 둔 채, Nginx의 상태 페이지(`stub_status`)와 워커의 메모리를 본다. 연결마다 스레드를 붙이는 서버였다면 스레드 500개가 생겼을 것이다.
```python
import re, socket, subprocess, urllib.request

idle = [socket.create_connection(('127.0.0.1', 8080)) for _ in range(500)]
status = urllib.request.urlopen('http://127.0.0.1:8080/status').read().decode()
print(status.splitlines()[0])

rss = subprocess.run(['ps', '-C', 'nginx', '-o', 'rss=,args='], capture_output=True, text=True).stdout
workers = [int(line.split()[0]) for line in rss.splitlines() if 'worker' in line]
print('워커 수:', len(workers), '| 워커당 메모리 20MB 미만:', all(kb < 20_000 for kb in workers))
for s in idle:
    s.close()
```
```text
Active connections: 501
워커 수: 2 | 워커당 메모리 20MB 미만: True
```
열어 둔 500개와 상태 페이지를 읽는 요청 하나로 활성 연결은 501개다. 워커 둘이 그 연결을 나눠 들고 있지만, 메모리는 각각 몇 MB에 그친다. 놀고 있는 연결은 이벤트 목록의 한 줄일 뿐이기 때문이다. 실제 운영에서는 이 수가 수만까지 올라가고, 그때는 운영체제의 파일 열기 한도(`ulimit -n`, `worker_rlimit_nofile`)가 먼저 한계가 된다.
```bash
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
sleep 0.5; ps -eo args | grep -c '^nginx:'
```
```text
0
```
`-s quit`은 처리 중인 요청을 마치고 우아하게 끝내라는 신호다. 바로 끊는 것은 `-s stop`이다.

## 흔한 오해
- "이벤트 기반이면 무조건 빠르다": 이벤트 루프는 기다리는 연결이 많을 때 강하다. 한 요청에 무거운 계산이 붙으면 그 워커의 다른 연결이 모두 기다린다. 그래서 무거운 일은 뒤의 애플리케이션 서버에 맡기고 Nginx는 앞에서 연결을 다룬다.
- "Nginx는 정적 파일 서버다": 정적 파일도 잘 주지만, 오늘날 가장 흔한 쓰임은 애플리케이션 앞의 리버스 프록시와 TLS 종료다.
- "워커를 많이 둘수록 좋다": 워커는 CPU 코어 수 정도면 충분하다. 연결 수는 워커 수가 아니라 `worker_connections`와 파일 열기 한도로 늘린다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 이 시리즈가 Nginx 설정으로 실제 구현하는 개념들이다.
- 웹 앱의 원리 2편 「브라우저 안에서 앱이 도는 방식: JavaScript 엔진, DOM, 이벤트 루프」: 한 스레드가 사건을 하나씩 꺼내 처리하는 이벤트 루프의 원리가 같다.
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: Nginx 컨테이너를 앱 컨테이너 앞에 두는 구성이 가장 흔한 Compose 예다.

## 정리
- C10K는 기다리는 연결 수만 개를 감당하는 문제였고, 답은 이벤트 기반 설계였다.
- Nginx는 마스터가 설정과 포트를 맡고, 소수의 워커가 이벤트 루프로 수많은 연결을 돌본다.
- 정적 파일, 리버스 프록시, 로드 밸런싱, TLS, 캐시, 속도 제한을 한 프로그램에서 한다.
- 설정을 바꾸기 전에는 늘 `nginx -t`로 검사한다.

## 더 알아보기
- 다음 글: 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」

## 시리즈 안내
1. **Nginx란: 이벤트 기반 웹 서버와 C10K** ← 지금 읽는 글
2. 설정 파일 구조: 블록, 지시어, 상속, 다시 읽기
3. 정적 파일 서빙: root, alias, try_files
4. location 매칭: 접두사, 정확히, 정규식의 우선순위
5. 리버스 프록시: proxy_pass와 헤더, 시간 제한
6. 로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기
7. HTTPS와 HTTP/2: 인증서, 리다이렉트, HSTS
8. 캐시와 압축: proxy_cache, gzip, 만료 헤더
9. 속도 제한과 접근 제어: limit_req, limit_conn, allow와 deny
10. 로그와 문제 해결: 접근 로그, 오류 로그, 502와 504

이 시리즈 다음에 읽으면 좋은 글: Nginx가 앞에서 받는 HTTP의 구조는 웹 앱의 원리 9편 「HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더」, 뒤에 붙일 앱을 컨테이너로 띄우는 법은 도커와 컨테이너 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」, Nginx의 지표를 모아 보는 법은 Prometheus와 Grafana 모니터링 1편 「모니터링이란: 메트릭, 로그, 트레이스와 Prometheus」에서 이어진다.
