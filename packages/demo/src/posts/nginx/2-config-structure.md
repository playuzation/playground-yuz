# [Nginx 웹 서버 2/10] 설정 파일 구조: 블록, 지시어, 상속, 다시 읽기

> **한 줄 요약** — Nginx 설정은 `이름 값;` 형태의 지시어와 `{ }` 블록이 main → http → server → location으로 겹친 나무이고, 바깥 블록의 값은 안쪽으로 상속되지만 `add_header`처럼 안쪽에서 한 번이라도 쓰면 바깥 것을 통째로 잃는 지시어가 있으며, `nginx -s reload`는 연결을 끊지 않고 새 설정의 워커로 갈아 끼운다.

## 이 글에서 다루는 것
- 지시어와 블록, 그리고 컨텍스트의 나무
- 요청이 server 블록을 고르는 방법: `listen`과 `server_name`
- 변수와 `map`
- 상속의 규칙과 `add_header`의 함정
- 다시 읽기: 끊지 않고 설정 바꾸기, 틀린 설정을 넣으면

## 지시어와 블록의 나무
설정 파일은 **지시어**(directive)의 목록이다. 지시어는 `worker_processes 2;`처럼 이름과 값, 그리고 세미콜론으로 끝난다. 일부 지시어는 `{ }`로 다른 지시어들을 감싸는 **블록**이고, 블록이 놓인 자리를 **컨텍스트**라고 부른다.
```text
main      worker_processes, pid
├ events  worker_connections
└ http    log, gzip, include
  └ server    listen, server_name
    └ location  root, proxy_pass
```
`http` 안에는 사이트마다 `server` 블록이, `server` 안에는 URL 경로마다 `location` 블록이 들어간다. 각 지시어는 쓸 수 있는 컨텍스트가 정해져 있어서, 엉뚱한 곳에 쓰면 `nginx -t`가 "directive is not allowed here"라고 알려 준다. 우분투 패키지의 기본 설정은 `include /etc/nginx/sites-enabled/*;`로 사이트별 파일을 끌어온다. `include`는 그 자리에 다른 파일의 내용을 끼워 넣을 뿐이다.

## 요청이 server를 고르는 방법
요청이 오면 Nginx는 먼저 받은 주소와 포트에 맞는 `listen`을 가진 server 블록들을 고르고, 그중에서 요청의 `Host` 헤더(웹 앱의 원리 9편)가 `server_name`과 맞는 블록을 고른다. 맞는 것이 없으면 그 포트의 **기본 서버**(`default_server`를 붙인 것, 없으면 처음 나온 것)가 받는다. 아래 설정은 같은 포트에서 두 사이트와 기본 서버를 운영한다. 변수와 `map`, 그리고 상속을 함께 보려고 헤더도 몇 개 붙였다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log logs/access.log;
    add_header X-Frame-Options DENY;                 # http 단계의 헤더

    map $http_user_agent $client_kind {              # 값을 고르는 표
        ~*curl   "command-line";
        default  "browser";
    }

    server {
        listen 127.0.0.1:8080 default_server;
        return 404 "unknown site: $host\n";
    }

    server {
        listen 127.0.0.1:8080;
        server_name blog.localhost;
        location / {
            return 200 "blog home ($client_kind)\n";
        }
        location /static/ {
            add_header Cache-Control "max-age=60";   # 여기서 하나를 더 쓰면?
            return 200 "blog static\n";
        }
    }

    server {
        listen 127.0.0.1:8080;
        server_name shop.localhost;
        location / {
            return 200 "shop home, uri=$uri\n";
        }
    }
}
```
```bash
mkdir -p logs
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
curl -s -H 'Host: blog.localhost' $U/
curl -s -H 'Host: shop.localhost' $U/cart
curl -s -H 'Host: unknown.localhost' $U/
```
```text
blog home (command-line)
shop home, uri=/cart
unknown site: unknown.localhost
```
같은 IP와 포트로 보냈지만 `Host`에 따라 다른 server가 답했고, 이름이 맞지 않는 요청은 기본 서버가 404로 받았다. `$host`, `$uri`, `$http_user_agent`(요청 헤더는 `$http_` 뒤에 소문자 이름)처럼 요청 정보는 **변수**로 꺼내 쓴다. `map`은 한 변수의 값에 따라 다른 변수의 값을 정하는 표다. 여기서는 User-Agent에 curl이 들어 있어 `command-line`이 골라졌다.

## 상속의 규칙과 add_header의 함정
바깥 컨텍스트에 쓴 지시어는 안쪽으로 **상속**된다. http에 쓴 `access_log`는 모든 server와 location에 적용된다. 안쪽에서 같은 지시어를 다시 쓰면 그 블록에서는 안쪽 값이 이긴다. 여기까지는 직관대로다. 함정은 `add_header`, `proxy_set_header`처럼 **여러 번 쓸 수 있는 지시어**에 있다. 안쪽 블록에서 하나라도 쓰면, 바깥 블록의 것들을 **합치지 않고 통째로 버린다**.
```bash
curl -sI -H 'Host: blog.localhost' $U/ | grep -iE '^(x-frame|cache-control)'
echo '---'
curl -sI -H 'Host: blog.localhost' $U/static/ | grep -iE '^(x-frame|cache-control)'
```
```text
X-Frame-Options: DENY
---
Cache-Control: max-age=60
```
`/`에는 http 단계의 보안 헤더 `X-Frame-Options`가 붙었지만, `add_header`를 하나 더 쓴 `/static/`에서는 보안 헤더가 사라졌다. 캐시 헤더 하나를 추가하려다 보안 헤더를 잃는 일은 실무에서 실제로 자주 일어난다. 안쪽에서 `add_header`를 쓰면 바깥의 것도 다시 적거나, 공통 헤더를 파일로 빼서 `include`로 각 블록에 넣는다. 또 하나, `add_header`는 기본적으로 성공 응답(200, 204, 301, 302, 304 등)에만 붙는다. 오류 응답에도 붙이려면 끝에 `always`를 쓴다.

## 다시 읽기: 끊지 않고 바꾸기
설정을 바꾼 뒤 `nginx -s reload`(또는 마스터에 HUP 신호)를 보내면, 마스터는 새 설정을 검사하고, 새 워커들을 띄우고, 옛 워커들에게 "새 연결은 받지 말고 처리 중인 요청만 마치고 끝내라"고 알린다. 사용자 연결이 끊기지 않는다. 새 설정이 틀렸다면 마스터는 오류를 기록하고 **옛 설정으로 계속 돈다**.
```bash
sed -i 's/blog home (/blog home v2 (/' nginx.conf
kill -HUP "$(cat nginx.pid)"; sleep 0.5               # nginx -s reload와 같은 신호
curl -s -H 'Host: blog.localhost' $U/
sed -i 's/return 200 "blog static\\n";/return 200 "blog static\\n"/' nginx.conf   # 세미콜론을 지웠다
nginx -p "$PWD" -c nginx.conf -t > /dev/null 2>&1 || echo 'nginx -t: 설정 오류'
kill -HUP "$(cat nginx.pid)"; sleep 0.5
curl -s -H 'Host: blog.localhost' $U/static/
grep -c 'emerg' logs/error.log
```
```text
blog home v2 (command-line)
nginx -t: 설정 오류
blog static
1
```
첫 번째 다시 읽기는 연결을 끊지 않고 새 문구를 적용했다. 두 번째로 세미콜론을 빠뜨린 설정은 `nginx -t`가 먼저 잡아냈다(세미콜론이 없으니 뒤의 `}`를 지시어의 일부로 읽다가 `unexpected "}"`라고 알린다). 그래도 신호를 보내 다시 읽게 하자, 마스터는 새 설정을 거부하고 마지막으로 성공한 설정으로 계속 답했으며 오류 로그에 `emerg` 등급의 기록을 하나 남겼다. 이 실패를 알아채지 못하면 "바꿨는데 왜 안 바뀌지?"가 된다. `nginx -s reload` 명령은 신호를 보내기 전에 설정을 검사해 틀리면 아예 보내지 않지만, 배포 스크립트는 대개 `nginx -t && nginx -s reload`로 검사를 분명히 드러내 쓴다.
```bash
kill -QUIT "$(cat nginx.pid)"
```

## 흔한 오해
- "안쪽 블록의 `add_header`는 바깥 것에 더해진다": 하나라도 쓰면 바깥 것을 모두 잃는다. `proxy_set_header`(5편)도 같다.
- "`server_name`이 맞지 않으면 요청을 거절한다": 그 포트의 기본 서버가 받는다. 모르는 이름의 요청을 막으려면 기본 서버를 따로 두고 404나 444(연결 닫기)로 답하게 한다.
- "reload는 잠깐 서비스를 끊는다": 새 워커가 새 연결을 받고 옛 워커는 하던 일을 마친다. 끊기는 것은 없다. 다만 오래 열린 웹소켓 연결이 있으면 옛 워커가 오래 남는다.

## 어디에 쓰이나
- 웹 앱의 원리 9편 「HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더」: `Host` 헤더 하나로 서버 한 대가 여러 사이트를 운영하는 원리가 server 블록 선택의 바탕이다.
- 웹 앱의 원리 3편 「설치 없이도 안전한 이유: 샌드박스, 동일 출처 정책, CORS」: `X-Frame-Options` 같은 보안 헤더가 브라우저에서 무엇을 막는지 이어진다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: `nginx -t`를 배포 전 CI 단계에 넣어 틀린 설정이 서버에 닿지 않게 할 수 있다.

## 정리
- 설정은 지시어와 블록의 나무다. main → events, http → server → location.
- 요청은 `listen`으로 후보를 좁히고 `Host`와 `server_name`으로 server를 고른다. 맞는 것이 없으면 기본 서버가 받는다.
- 바깥 값은 안쪽으로 상속되지만, `add_header`처럼 여러 번 쓰는 지시어는 안쪽에서 하나만 써도 바깥 것을 잃는다.
- `nginx -t && nginx -s reload`로 연결을 끊지 않고 설정을 바꾼다. 틀린 설정은 거부되고 옛 설정이 계속 돈다.

## 더 알아보기
- 이전 글: 1편 「Nginx란: 이벤트 기반 웹 서버와 C10K」
- 다음 글: 3편 「정적 파일 서빙: root, alias, try_files」
