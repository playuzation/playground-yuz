# [Nginx 웹 서버 9/10] 속도 제한과 접근 제어: limit_req, limit_conn, allow와 deny

> **한 줄 요약** — `limit_req`는 키(보통 클라이언트 IP)마다 초당 요청 수를 새는 양동이 방식으로 제한하고 `burst`만큼의 순간 몰림을 허락하며, `limit_conn`은 동시에 열린 연결 수를 제한하고, `allow`·`deny`와 `auth_basic`은 누가 들어올 수 있는지를 정한다. 프록시 뒤라면 진짜 클라이언트 IP를 먼저 되찾아야 이 모두가 제대로 동작한다.

## 이 글에서 다루는 것
- `limit_req`: 요청 속도 제한과 `burst`, `nodelay`
- `limit_conn`: 동시 연결 수 제한
- 429와 503, 어떤 상태 코드로 거절할까
- `allow`·`deny`로 IP 막기, `auth_basic`으로 비밀번호 걸기
- 프록시 뒤의 진짜 클라이언트 IP

## 요청 속도 제한: limit_req
웹 앱의 원리 19편의 레이트 리밋과 Redis 실무 5편의 구현을 Nginx에서는 지시어 두 개로 한다. http 단계의 `limit_req_zone`이 "무엇을 키로, 어떤 속도로"를 정하고, location의 `limit_req`가 그 영역을 적용한다. Nginx의 방식은 **새는 양동이**(leaky bucket)다. 요청은 양동이에 들어가고, 양동이는 정해진 속도로 비워진다. `burst`는 양동이의 크기, 즉 순간적으로 몰려도 받아 줄 여유분이다. `nodelay`가 없으면 여유분의 요청은 속도에 맞춰 **늦춰서** 처리하고, 있으면 즉시 처리하되 그만큼 여유분을 소진한다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log off;
    limit_req_zone  $binary_remote_addr zone=per_ip:10m rate=5r/s;
    limit_conn_zone $binary_remote_addr zone=conn_ip:10m;
    limit_req_status  429;
    limit_conn_status 429;

    server {
        listen 127.0.0.1:8080;
        root files;

        location /api/ {
            limit_req zone=per_ip burst=3 nodelay;     # 초당 5개, 순간 여유 3개
        }
        location /download/ {
            limit_conn conn_ip 2;                      # IP마다 동시 연결 2개
            limit_rate 100k;                           # 연결마다 초당 100KB로 천천히
        }
        location /admin/ {
            allow 10.0.0.0/8;                          # 사내망만
            deny  all;
        }
        location /private/ {
            auth_basic "staff only";
            auth_basic_user_file htpasswd;
        }
    }
}
```
```bash
mkdir -p logs files/download files/api files/admin files/private
printf 'ok\n' > files/api/x; printf 'admin\n' > files/admin/index.html; printf 'private\n' > files/private/index.html
head -c 200000 /dev/zero > files/download/big.bin       # 200KB: 받는 데 2초쯤
printf 'staff:%s\n' "$(openssl passwd -apr1 -salt 7QzJ2kLm 's3cret')" > htpasswd
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
codes() { for i in $(seq "$2"); do curl -s -o /dev/null -w '%{http_code} ' "$1"; done; echo; }
echo "한꺼번에 10번: $(codes $U/api/x 10)"
sleep 1
echo "1초 쉬고 3번:  $(codes $U/api/x 3)"
```
```text
한꺼번에 10번: 200 200 200 200 429 429 429 429 429 429 
1초 쉬고 3번:  200 200 200 
```
한꺼번에 보낸 10개 중 첫 요청과 여유분 3개, 모두 4개가 즉시 통과했고 나머지는 429로 거절되었다. 1초 쉬는 동안 양동이가 초당 5개씩 비워져 다시 통과했다. 키로 쓴 `$binary_remote_addr`는 IP 주소를 4바이트(IPv6는 16바이트)로 담은 변수라, 10MB 영역에 IP 수만 개의 상태를 담는다. 로그인한 API라면 키를 `$http_x_api_key`처럼 사용자 식별자로 바꿀 수도 있다.

## 동시 연결 제한: limit_conn
요청 속도와 별개로, 큰 파일을 받는 연결 수를 묶고 싶을 때가 있다. 한 사람이 다운로드 연결을 수십 개 열어 대역폭을 독차지하는 경우다. 위 설정은 IP마다 동시 연결을 2개로 묶고, 각 연결을 초당 100KB로 천천히 보내 200KB 파일이 2초쯤 걸리게 했다. 5개를 동시에 시작한다.
```bash
pids=(); for i in $(seq 5); do curl -s -o /dev/null -w '%{http_code}\n' $U/download/big.bin >> dl.txt & pids+=($!); done
wait "${pids[@]}"
sort dl.txt | uniq -c | awk '{printf "%s: %s개\n", $2, $1}'
```
```text
200: 2개
429: 3개
```
동시에 열린 두 연결만 받아들이고 나머지 셋은 즉시 거절했다. 거절 상태 코드는 기본이 503(Service Unavailable)인데, 위에서 `limit_req_status`, `limit_conn_status`로 429(Too Many Requests)로 바꿨다. 503은 "서버가 아프다"로 읽혀 감시 도구가 장애로 오인하고 클라이언트가 재시도할 수 있다. "당신이 너무 많이 보냈다"는 429가 정확하다(웹 앱의 원리 9편).

## 누가 들어올 수 있나: allow, deny, auth_basic
```bash
curl -s -o /dev/null -w 'admin(사내망 아님): %{http_code}\n' $U/admin/
curl -s -o /dev/null -w 'private(비밀번호 없음): %{http_code}\n' $U/private/
curl -s -D - -o /dev/null $U/private/ | grep -i '^www-authenticate' | tr -d '\r'
curl -s -u staff:s3cret $U/private/
curl -s -o /dev/null -w 'private(틀린 비밀번호): %{http_code}\n' -u staff:wrong $U/private/
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
admin(사내망 아님): 403
private(비밀번호 없음): 401
WWW-Authenticate: Basic realm="staff only"
private
private(틀린 비밀번호): 401
```
- `allow`·`deny`는 위에서부터 차례로 보고 처음 맞는 규칙을 쓴다. 127.0.0.1은 10.0.0.0/8이 아니어서 `deny all`에 걸려 403이 되었다.
- `auth_basic`은 비밀번호가 없으면 401과 함께 `WWW-Authenticate` 헤더로 로그인을 요구한다. 브라우저는 이것을 보고 로그인 창을 띄운다. 비밀번호 파일은 `openssl passwd -apr1`(또는 `htpasswd` 도구)로 만든 해시를 담는다. Basic 인증은 사용자 이름과 비밀번호를 매 요청에 실어 보내므로 HTTPS(7편) 위에서만 쓴다. 간단한 내부 도구 보호에는 충분하지만, 서비스의 로그인은 앱이 맡는다(웹 앱의 원리 11편).

## 프록시 뒤의 진짜 IP
위의 모든 제한은 `$remote_addr`, 즉 Nginx에 연결한 상대의 주소를 본다. Nginx 앞에 로드 밸런서나 CDN이 있으면 그 주소는 모두 로드 밸런서의 것이 되어, 모든 사용자가 한 IP로 보이고 레이트 리밋이 서비스 전체를 막아 버린다. `real_ip` 모듈로 "믿을 수 있는 프록시"를 정하고, 그 프록시가 보낸 헤더에서 진짜 주소를 꺼내 `$remote_addr`를 바꾼다.
```nginx
set_real_ip_from 10.0.0.0/8;     # 앞단 로드 밸런서
real_ip_header   X-Forwarded-For;
real_ip_recursive on;
```
믿을 프록시 목록을 넓게 잡으면 클라이언트가 `X-Forwarded-For`를 위조해 제한을 피할 수 있다(5편). 꼭 앞단 장비의 주소만 적는다.

## 흔한 오해
- "`rate=5r/s`면 1초에 5개를 몰아서 받는다": 새는 양동이라 200ms마다 하나씩이다. 몰려오는 것을 받으려면 `burst`를 준다.
- "속도 제한을 걸면 공격을 막을 수 있다": 한 IP의 과한 요청은 막지만, 수많은 IP에서 오는 분산 공격은 Nginx 앞(CDN, 네트워크 장비)에서 막아야 한다.
- "`deny` 다음에 `allow`를 써도 된다": 위에서부터 처음 맞는 규칙이 쓰인다. `deny all`을 먼저 쓰면 그 아래 `allow`는 의미가 없다.
- "같은 location에 `return`을 써도 제한이 걸린다": `return`은 요청 처리의 앞 단계(rewrite)에서 바로 응답해 버려서, 뒤 단계인 `limit_req`·`allow`·`deny`·`auth_basic`이 아예 실행되지 않는다. 처음 이 글의 예제를 `return`으로 만들었다가 모든 제한이 무시되는 것을 보고 파일을 주는 방식으로 바꿨다. 제한을 건 location에서는 `return` 대신 파일이나 `proxy_pass`로 답한다.

## 어디에 쓰이나
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 토큰 버킷, 429와 Retry-After의 설계 원칙을 본다.
- Redis 실무 5편 「원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua」: Nginx 여러 대가 같은 한도를 공유해야 할 때 Redis로 직접 만드는 방법이다.
- 웹 앱의 원리 11편 「상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰」: Basic 인증 대신 서비스가 쓰는 로그인 방식들이다.

## 정리
- `limit_req_zone`과 `limit_req`로 키마다 요청 속도를 제한한다. `burst`는 순간 여유분, `nodelay`는 여유분을 즉시 처리한다.
- `limit_conn`은 동시 연결 수를 제한한다. 거절 코드는 429로 바꾸는 편이 정확하다.
- `allow`·`deny`는 위에서부터 처음 맞는 규칙, `auth_basic`은 HTTPS 위에서만 쓴다.
- 프록시 뒤라면 `real_ip`로 진짜 클라이언트 IP를 되찾되, 믿을 프록시만 적는다.

## 더 알아보기
- 이전 글: 8편 「캐시와 압축: proxy_cache, gzip, 만료 헤더」
- 다음 글: 10편 「로그와 문제 해결: 접근 로그, 오류 로그, 502와 504」
