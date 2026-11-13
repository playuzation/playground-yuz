# [Redis 실무 10/10] 운영과 보안: ACL, 설정, 모니터링

> **한 줄 요약** — Redis는 신뢰할 수 있는 네트워크 안에서 쓰도록 만들어졌으므로 바깥에 열지 않고, ACL로 앱마다 쓸 수 있는 명령과 키를 좁히고 기본 사용자를 막으며, `INFO`의 적중률·메모리·연결 수·저장 상태를 지켜보는 것이 운영의 기본이다.

## 이 글에서 다루는 것
- 왜 Redis를 인터넷에 열면 안 되나
- ACL: 사용자마다 명령과 키 패턴 제한하기
- 기본 사용자의 함정
- 설정: `CONFIG GET`, `CONFIG SET`, `CONFIG REWRITE`
- 무엇을 지켜볼까: `INFO`의 핵심 지표
- 운영 점검표와 시리즈 정리

## 바깥에 열지 않는다
Redis는 같은 데이터센터 안의 애플리케이션 서버가 쓰는 것을 전제로 만들어졌다. 비밀번호 없이 인터넷에 열린 Redis는 오랫동안 공격자들의 단골 표적이었다. 데이터를 지우거나 몸값을 요구하는 것은 물론, 설정 명령으로 저장 경로를 바꿔 서버에 파일을 써 넣는 식의 침입에도 쓰였다. 그래서 첫 원칙은 네트워크다. `bind`로 내부 주소에서만 듣게 하고, 방화벽과 보안 그룹으로 앱 서버에서 오는 연결만 허락한다. Redis 3.2부터는 비밀번호도 `bind`도 없으면 외부 연결을 거절하는 보호 모드(protected mode)가 기본으로 켜진다. 네트워크를 지나는 구간에는 TLS를 켤 수 있다(웹 앱의 원리 10편).

## ACL: 사용자마다 할 수 있는 일
Redis 6부터는 **ACL**(access control list)로 사용자를 여럿 만들고, 각자 쓸 수 있는 **명령**과 **키 패턴**을 정한다. 주문 서비스는 `order:*` 키에 읽기·쓰기만, 관리 도구는 `INFO`만 하게 하는 식이다. 실습 서버에서 `app:*` 키에 `GET`, `SET`, `INCR`만 할 수 있는 사용자를 만든다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
r() { redis-cli -p 6390 --no-raw "$@"; }
r acl setuser app on '>app-secret' '~app:*' '+get' '+set' '+incr'
a() { redis-cli -p 6390 --no-raw --user app --pass app-secret "$@" 2>/dev/null; }
a set app:count 1
a incr app:count
a get session:abc
a flushall
r acl list
```
```text
OK
OK
(integer) 2
(error) NOPERM this user has no permissions to access one of the keys used as arguments
(error) NOPERM this user has no permissions to run the 'flushall' command
1) "user app on #6c904c5190e8b45c2f0af062eefdb2f5b41ce3809b0e6b5bc50aafdd60b290d8 ~app:* resetchannels -@all +…"
2) "user default on nopass ~* &* +@all"
```
`app`은 자기 키는 읽고 쓰지만, 다른 키(`session:abc`)와 위험한 명령(`FLUSHALL`)은 거절되었다. 비밀번호는 SHA-256 해시(`#6c90…`)로만 저장된다. 줄 끝에는 허락한 명령 `+get +incr +set`이 붙는다(순서는 실행마다 다를 수 있다). `-@all`처럼 명령 묶음(카테고리)으로 한꺼번에 빼고 필요한 것만 `+`로 더하는 방식이 안전하다. `+@read`처럼 카테고리로 더할 수도 있다.

## 기본 사용자의 함정
`ACL LIST`의 두 번째 줄을 보자. 처음부터 있는 `default` 사용자는 비밀번호 없이(`nopass`) 모든 키와 모든 명령(`+@all`)을 쓸 수 있다. 클라이언트가 로그인하지 않으면 이 사용자로 간주된다. 그래서 `app` 사용자를 아무리 좁혀도, 기본 사용자가 열려 있으면 소용이 없다. 비밀번호를 틀려 보자.
```bash
redis-cli -p 6390 --no-raw --user app --pass wrong-password ping 2>/dev/null
```
```text
PONG
```
틀린 비밀번호로 로그인에 실패했는데도 `PING`이 성공했다. 로그인 실패 뒤에 연결이 그대로 기본 사용자로 남았기 때문이다. 기본 사용자를 끄기 전에 할 일이 하나 있다. 관리 명령을 쓸 **관리자 사용자**를 먼저 만들어 두지 않으면, 기본 사용자를 끄는 순간 아무도 ACL을 고칠 수 없게 된다.
```bash
r acl setuser admin on '>admin-secret' '~*' '&*' '+@all'
r acl setuser default off
redis-cli -p 6390 --no-raw ping
adm() { redis-cli -p 6390 --no-raw --user admin --pass admin-secret "$@" 2>/dev/null; }
adm ping
a get app:count
a shutdown
```
```text
OK
OK
(error) NOAUTH Authentication required.
PONG
"2"
(error) NOPERM this user has no permissions to run the 'shutdown' command
```
이제 로그인하지 않은 연결은 아무것도 할 수 없고, `app`은 자기 일만, `admin`은 관리 일을 한다. 실제 서버에서는 ACL을 `aclfile`로 파일에 저장해 재시작 뒤에도 남게 한다.

## 설정 다루기
설정은 `redis.conf` 파일로 시작하고, 대부분은 실행 중에 `CONFIG SET`으로 바꿀 수 있다. 바꾼 설정은 재시작하면 사라지므로, `CONFIG REWRITE`로 설정 파일에 다시 써 둔다(서버를 설정 파일로 띄웠을 때만 된다). 어떤 값이 실제로 쓰이는지는 `CONFIG GET`으로 확인한다.
```bash
adm config get maxmemory-policy
adm config set maxmemory-policy allkeys-lru
adm config get maxmemory-policy
```
```text
1) "maxmemory-policy"
2) "noeviction"
OK
1) "maxmemory-policy"
2) "allkeys-lru"
```

## 무엇을 지켜볼까
`INFO`는 서버 상태를 영역별로 알려 준다. 매번 다 볼 필요는 없고, 다음 지표를 꾸준히 기록해 두면 대부분의 문제를 미리 본다.
```bash
r() { adm "$@"; }
r set app:x 1 > /dev/null; r get app:x > /dev/null; r get app:missing > /dev/null
r info stats | grep -E '^(keyspace_hits|keyspace_misses|evicted_keys|instantaneous_ops_per_sec)' | sort
r info clients | grep -E '^connected_clients'
r info persistence | grep -E '^(rdb_last_bgsave_status|aof_last_write_status)'
r shutdown nosave
```
```text
evicted_keys:0
instantaneous_ops_per_sec:…
keyspace_hits:2
keyspace_misses:1
connected_clients:1
rdb_last_bgsave_status:ok
aof_last_write_status:ok
```
| 지표 | 뜻 | 볼 것 |
| --- | --- | --- |
| 적중·실패 | 캐시 적중과 실패 | 적중률이 떨어지면 TTL·용량 점검 |
| 메모리 | 쓰는 메모리 | 한도에 다가가는 속도 |
| 퇴출 | 퇴출된 키 수 | 의도치 않은 퇴출 |
| 연결 수 | 열린 연결 | 연결 누수, 풀 설정 |
| 저장 상태 | RDB·AOF 성공 여부 | ok가 아니면 즉시 확인 |

이 값들을 Prometheus 같은 모니터링 시스템으로 모으는 도구(redis_exporter)를 붙이면 시간에 따른 변화와 경보를 볼 수 있다. 그 방법은 Prometheus와 Grafana 모니터링 2편 「설치와 첫 수집: 스크레이프와 타깃」부터 이어진다. 디버깅에 쓰는 `MONITOR` 명령은 모든 명령을 흘려보내 서버를 크게 느리게 하므로 운영 서버에서는 짧게만 쓴다.

## 운영 점검표
- 네트워크: 내부 주소에만 `bind`, 방화벽, 필요하면 TLS.
- 인증: 기본 사용자 끄기, 앱마다 ACL 사용자, 관리자 분리, ACL 파일 저장.
- 메모리: `maxmemory`와 퇴출 정책(4편), 큰 키 점검(9편).
- 저장: 용도에 맞는 RDB·AOF(7편), 저장 상태 감시, 다른 곳으로의 백업.
- 가용성: 레플리카와 센티널 또는 클러스터(8편), 클라이언트의 재연결·재시도.
- 버전과 라이선스: 쓰는 배포판(Redis, Valkey, 관리형 서비스)의 버전과 조건(1편).

## 흔한 오해
- "비밀번호를 걸었으니 인터넷에 열어도 된다": 비밀번호 추측, 프로토콜 취약점, 평문 구간의 엿보기 위험이 남는다. 네트워크 차단이 먼저다.
- "앱 사용자를 좁혔으니 안전하다": 기본 사용자가 열려 있으면 로그인하지 않은 연결이 모든 권한을 가진다.
- "`CONFIG SET`으로 바꾸면 영구히 적용된다": 재시작하면 설정 파일 값으로 돌아간다. `CONFIG REWRITE`나 설정 관리 도구로 파일에도 반영한다.

## 어디에 쓰이나
- 도커와 컨테이너 11편 「컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검」: 필요한 만큼만 권한을 주는 최소 권한 원칙을 컨테이너 쪽에서 본다.
- PostgreSQL 실무 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」: 역할과 권한, 연결 관리, 모니터링이라는 같은 운영 주제를 관계형 데이터베이스에서 다룬다.
- 웹 앱의 원리 10편 「HTTPS와 TLS: 암호화, 인증서, 핸드셰이크」: Redis 연결에 TLS를 켤 때 필요한 인증서와 핸드셰이크의 원리다.

## 정리
- Redis는 내부 네트워크용이다. 바깥에 열지 않는 것이 첫 보안이다.
- ACL로 사용자마다 명령과 키 패턴을 좁힌다. 기본 사용자를 꺼야 좁힌 의미가 있다.
- 설정은 `CONFIG SET`으로 바꾸고 `CONFIG REWRITE`로 파일에 남긴다.
- 적중률, 메모리, 퇴출, 연결 수, 저장 상태를 꾸준히 기록하고 경보를 건다.
- 이 시리즈의 1~9편이 점검표의 각 항목이다.

## 더 알아보기
- 이전 글: 9편 「성능과 메모리: 파이프라이닝, 큰 키, 느린 명령」
- 처음 글: 1편 「Redis란: 메모리 위의 자료 구조 서버」
