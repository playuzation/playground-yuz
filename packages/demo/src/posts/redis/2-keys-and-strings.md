# [Redis 실무 2/10] 키와 문자열: SET, GET, INCR, 만료

> **한 줄 요약** — Redis의 모든 값은 키 이름으로 찾고, 가장 기본인 문자열 값은 글자·숫자·바이너리를 담으며, `SET`의 NX·XX·EX 같은 옵션과 원자적 `INCR`, 그리고 키마다 붙일 수 있는 만료 시간(TTL)이 캐시·카운터·잠금의 재료가 된다.

## 이 글에서 다루는 것
- 키 이름 짓기: 콜론으로 나눈 이름 공간
- 문자열 값과 내부 인코딩(int, embstr, raw)
- `SET`의 옵션: NX, XX, EX, GET
- 숫자처럼 쓰기: `INCR`, `INCRBYFLOAT`
- 만료: `EXPIRE`, `TTL`, 그리고 Redis가 만료된 키를 지우는 방법
- 키 찾기: `KEYS` 대신 `SCAN`, `DEL` 대신 `UNLINK`

## 키 이름 짓기
Redis에는 테이블이 없다. 하나의 거대한 사전에 키와 값이 들어 있을 뿐이다. 그래서 키 이름이 곧 구조다. 흔한 관례는 콜론으로 이름 공간을 나누는 것이다. `user:42:name`, `session:9f2c…`, `cache:product:1001`처럼 "종류:식별자:필드" 순서로 쓰면 사람이 읽기 쉽고, 뒤에서 볼 `SCAN MATCH user:*`로 한 종류만 골라 볼 수 있다. 키는 바이너리 안전한 문자열이라 무엇이든 되지만, 너무 긴 키는 그만큼 메모리를 쓴다.

## 직접 해 보기 1: 문자열과 SET의 옵션
실습용 서버를 띄운다. 이번부터는 터미널에서 직접 칠 때와 같은 모양(`(integer)`, `(nil)`, 따옴표)으로 보려고 `--no-raw`를 붙인다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
r() { redis-cli -p 6390 --no-raw "$@"; }
r set user:42:name minji
r get user:42:name
r get user:99:name
r set user:42:name sora NX
r set user:42:name sora XX GET
r get user:42:name
```
```text
OK
"minji"
(nil)
(nil)
"minji"
"sora"
```
없는 키를 읽으면 `(nil)`이다. `NX`는 "없을 때만 써라"라서, 이미 있는 키에는 쓰지 않고 `(nil)`을 돌려줬다. `XX`는 반대로 "있을 때만 써라"이고, `GET`을 함께 주면 바꾸기 전의 옛 값(`"minji"`)을 돌려준다. 읽고 바꾸는 두 단계를 명령 하나로 하니 사이에 다른 클라이언트가 끼어들 틈이 없다. `SET … NX EX 30`은 "아무도 안 잡았으면 내가 30초 동안 잡는다"는 간단한 잠금이 된다(5편에서 한계와 함께 다룬다).

## 값의 내부 모양
문자열 값은 최대 512MB까지 담을 수 있고, Redis는 값의 모양에 따라 메모리를 아끼는 **인코딩**을 고른다.
```bash
r set n 12345
r object encoding n
r object encoding user:42:name
r set bio "$(printf 'a%.0s' $(seq 1 50))"
r object encoding bio
```
```text
OK
"int"
"embstr"
OK
"raw"
```
정수로 해석되는 값은 숫자 그대로(`int`), 44바이트 이하의 짧은 글자는 키 정보와 한 덩어리로(`embstr`), 더 긴 글자는 따로 잡은 버퍼(`raw`)에 저장한다. 사용자가 신경 쓸 일은 아니지만, 9편에서 메모리를 아낄 때 이 차이가 드러난다.

## 숫자처럼 쓰기
문자열이 정수처럼 보이면 `INCR`, `INCRBY`, `DECR`로 올리고 내릴 수 있다. 서버 안에서 읽고 더하고 쓰는 일이 명령 하나로 일어나므로, 클라이언트 여러 개가 동시에 올려도 하나도 빠지지 않는다(1편의 원자성).
```bash
r incr page:home:views
r incrby page:home:views 10
r incrbyfloat price 0.1
r incrbyfloat price 0.2
r mset a 1 b 2
r mget a b c
```
```text
(integer) 1
(integer) 11
"0.1"
"0.3"
OK
1) "1"
2) "2"
3) (nil)
```
`INCRBYFLOAT`의 결과가 0.30000000000000004가 아니라 "0.3"인 것은 Redis가 결과를 사람이 읽기 좋은 정밀도로 글자로 저장하기 때문이다. 그래도 돈 계산은 원 단위 정수로 하는 편이 안전하다(PostgreSQL 실무 2편의 이야기와 같다). `MSET`과 `MGET`은 여러 키를 한 번의 왕복으로 쓰고 읽는다.

## 만료: 시간이 지나면 사라지는 키
캐시와 세션은 영원히 둘 필요가 없다. 키마다 **만료 시간**(TTL)을 붙이면 그 시간이 지난 뒤 Redis가 지운다.
```bash
r set session:abc user42 EX 2
r ttl session:abc
r ttl page:home:views
r ttl no:such:key
sleep 2.2
r get session:abc
r set code 1234 PX 1500
r persist code
r ttl code
```
```text
OK
(integer) 2
(integer) -1
(integer) -2
(nil)
OK
(integer) 1
(integer) -1
```
`TTL`은 남은 초를 알려 주고, `-1`은 "만료 없음", `-2`는 "키가 없음"이다. 2초 뒤 세션은 사라졌다. `PX`는 밀리초 단위이고, `PERSIST`는 만료를 없앤다. 주의할 점이 하나 있다. 값을 `SET`으로 다시 쓰면 기존 TTL이 지워진다. TTL을 유지하려면 `SET … KEEPTTL`을 쓴다.

만료된 키를 지우는 방법은 두 가지다. 누군가 그 키에 접근할 때 확인해 지우는 **게으른 삭제**, 그리고 1초에 여러 번 만료 시간이 있는 키를 무작위로 표본 추출해 지우는 **능동 삭제**다. 그래서 만료된 키는 아무도 읽지 않아도 결국 메모리에서 빠지지만, 정확히 그 순간에 지워진다는 보장은 없다.

## 키 찾기와 지우기
```bash
r scan 0 match 'user:*' count 100
r type user:42:name
r unlink a b
r dbsize
r shutdown nosave
```
```text
1) "0"
2) 1) "user:42:name"
string
(integer) 2
(integer) 6
```
`KEYS user:*`도 같은 결과를 주지만, 키 전체를 한 번에 훑는 동안 서버의 한 줄 실행이 멈춘다. 키가 수백만 개인 운영 서버에서는 몇 초씩 모든 요청이 기다릴 수 있다. `SCAN`은 조금씩 나눠 훑으며 다음에 이어 갈 커서를 돌려준다(첫 줄의 `"0"`은 "끝까지 다 봤다"는 뜻이다). 지우기도 비슷하다. `DEL`은 큰 값을 그 자리에서 해제하느라 멈출 수 있고, `UNLINK`는 키만 즉시 떼어 내고 메모리 해제는 뒤에서 한다.

## 흔한 오해
- "TTL이 지나면 그 순간 정확히 지워진다": 만료된 키는 읽히지 않지만, 메모리에서 실제로 빠지는 시점은 게으른 삭제와 표본 추출에 달려 있다.
- "값을 다시 쓰면 만료 시간은 그대로다": `SET`은 TTL을 지운다. `KEEPTTL`을 주거나 다시 `EXPIRE`를 걸어야 한다.
- "`KEYS`는 개발 중에만 쓰면 괜찮다": 개발 습관이 운영 스크립트로 옮겨 가는 일이 흔하다. 처음부터 `SCAN`을 쓰는 편이 낫다.

## 어디에 쓰이나
- 웹 앱의 원리 11편 「상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰」: 세션 ID를 키로, 사용자 정보를 값으로, 로그인 유지 시간을 TTL로 두는 것이 가장 흔한 세션 저장 방식이다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 멱등 키를 `SET NX EX`로 저장하면 "처음 본 키인가"와 "일정 기간 기억하기"를 명령 하나로 처리한다.
- PostgreSQL 실무 2편 「자료형 고르기: 숫자, 문자열, 시간, UUID, 배열」: 부동소수점 금액 문제는 저장소가 달라도 똑같이 생긴다.

## 정리
- 키 이름이 구조다. 콜론으로 이름 공간을 나눈다.
- `SET`의 NX·XX·GET·EX 옵션은 읽기와 쓰기를 명령 하나로 묶어 원자적으로 만든다.
- 정수처럼 보이는 문자열은 `INCR`로 동시에 안전하게 센다.
- TTL은 캐시와 세션의 수명이다. `SET`은 TTL을 지우고, 만료된 키는 게으른 삭제와 표본 추출로 빠진다.
- 운영에서는 `KEYS` 대신 `SCAN`, 큰 값은 `DEL` 대신 `UNLINK`를 쓴다.

## 더 알아보기
- 이전 글: 1편 「Redis란: 메모리 위의 자료 구조 서버」
- 다음 글: 3편 「자료 구조: 리스트, 해시, 셋, 정렬된 셋」
