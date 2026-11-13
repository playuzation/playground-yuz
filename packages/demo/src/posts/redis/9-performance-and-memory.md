# [Redis 실무 9/10] 성능과 메모리: 파이프라이닝, 큰 키, 느린 명령

> **한 줄 요약** — Redis가 느려지는 이유는 대개 Redis 자체가 아니라 왕복 횟수(파이프라이닝으로 줄인다), 한 번에 너무 많은 원소를 다루는 큰 키와 느린 명령(한 줄 실행을 붙잡는다), 그리고 메모리를 낭비하는 키 설계(작은 해시로 묶어 아낀다)다.

## 이 글에서 다루는 것
- 왕복이 처리량을 정한다: 파이프라이닝
- 큰 키 찾기: `--bigkeys`, `MEMORY USAGE`
- 느린 명령 찾기: `SLOWLOG`
- 메모리 아끼기: 작은 해시와 인코딩
- 직접 해 보기: 위의 네 가지를 숫자로

## 왕복이 처리량을 정한다
1편에서 `redis-benchmark`는 초당 10만 건을 넘었다. 그런데 애플리케이션에서 명령 하나씩 보내고 답을 기다리면, 처리량은 Redis의 속도가 아니라 **왕복 시간**으로 정해진다. 같은 데이터센터 안이라도 왕복이 0.5ms면 연결 하나로는 초당 2,000건이 한계다. **파이프라이닝**은 명령 여러 개를 답을 기다리지 않고 한꺼번에 보내고, 답도 한꺼번에 받는 방법이다(웹 앱의 원리 15편에서 HTTP가 연결 하나에 요청 여러 개를 섞은 것과 같은 발상이다). 실습 서버를 띄우고 1만 개의 `SET`을 두 방식으로 보낸다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
```
```python
import time, redis

r = redis.Redis(port=6390)

t = time.perf_counter()
for i in range(10_000):
    r.set(f'one:{i}', i)                       # 보내고 기다리기를 1만 번
one_by_one = time.perf_counter() - t

t = time.perf_counter()
pipe = r.pipeline(transaction=False)
for i in range(10_000):
    pipe.set(f'pipe:{i}', i)                   # 모아 두었다가
pipe.execute()                                 # 한꺼번에 보내고 한꺼번에 받기
pipelined = time.perf_counter() - t

ratio = one_by_one / pipelined
print('파이프라인이 빠른 정도:', '5배 이상' if ratio >= 5 else f'{ratio:.1f}배')
print('키 수:', r.dbsize())
```
```text
파이프라인이 빠른 정도: 5배 이상
키 수: 20000
```
같은 컴퓨터 안이라 왕복이 아주 짧은데도 이 실습 환경에서는 열 배 넘게 차이가 났다. 서버가 다른 장비에 있으면 차이는 더 커진다. 파이프라인은 원자적이지 않다는 점(그 사이에 다른 클라이언트의 명령이 끼어들 수 있다)을 기억하자. 묶어서 원자적으로 실행하려면 5편의 `MULTI`/`EXEC`나 Lua를 쓴다. `MSET`, `MGET`, `HSET`의 여러 필드처럼 명령 자체가 여러 값을 받는 경우도 왕복을 줄이는 쉬운 방법이다.

## 큰 키와 느린 명령
Redis는 명령을 한 줄로 실행하므로(1편), 원소 수십만 개를 한 번에 다루는 명령은 그동안 다른 모든 요청을 세운다. 원인은 보통 둘이다. 하나의 키에 원소가 끝없이 쌓인 **큰 키**, 그리고 그런 키 전체를 다루는 **느린 명령**이다. 원소 30만 개짜리 리스트를 일부러 만들고 찾아본다. `SLOWLOG`는 일정 시간(여기서는 2ms, 기본값은 10ms)보다 오래 걸린 명령을 기록한다.
```python
import redis

r = redis.Redis(port=6390)
pipe = r.pipeline(transaction=False)
for i in range(300_000):
    pipe.rpush('feed:all', i)                    # 끝없이 쌓인 피드
pipe.execute()
print('feed:all 메모리:', round(r.memory_usage('feed:all') / 1024 / 1024, 1), 'MB')

r.config_set('slowlog-log-slower-than', 2_000)   # 2ms(마이크로초 단위)
r.slowlog_reset()
r.lrange('feed:all', 0, -1)                      # 30만 개를 한 번에 읽기
r.lrange('feed:all', 0, 19)                      # 앞의 20개만 읽기
for entry in r.slowlog_get(10):
    print('느린 명령:', entry['command'].decode(), '| 2ms 이상:', entry['duration'] >= 2_000)
```
```text
feed:all 메모리: 1.4 MB
느린 명령: LRANGE feed:all 0 -1 | 2ms 이상: True
```
30만 개를 통째로 읽은 `LRANGE … 0 -1`만 느린 명령으로 기록되었고, 앞의 20개만 읽은 명령은 빨랐다. 이 실습 환경에서 십몇 ms쯤 걸렸고, 그동안 다른 클라이언트는 모두 기다렸다. 큰 키는 `--bigkeys` 옵션으로 서버 전체를 훑어 찾는다(내부적으로 2편의 `SCAN`을 쓰므로 운영 중에도 비교적 안전하다).
```bash
redis-cli -p 6390 --bigkeys 2>/dev/null | grep 'Biggest *list found'
```
```text
Biggest   list found '"feed:all"' has 300000 items
```
고치는 방법은 데이터 설계에 있다. 한 키가 끝없이 커지지 않게 날짜나 사용자로 키를 나누고(`feed:2026-11-11`), 길이를 잘라 두고(3편의 `LTRIM`, 6편의 `MAXLEN`), 전체 읽기 대신 범위로 나눠 읽는다. 큰 키를 지울 때는 `DEL` 대신 `UNLINK`(2편)를 쓴다.

## 메모리 아끼기: 작은 해시
Redis에서는 키 하나하나에 관리용 메모리가 붙는다. 그래서 같은 데이터라도 키를 어떻게 나누느냐에 따라 메모리가 크게 달라진다. 사용자 1,000명의 필드 세 개를 문자열 키 3,000개로 저장할 때와 해시 1,000개로 저장할 때를 비교한다.
```python
import redis

r = redis.Redis(port=6390)
r.flushall()
start = r.info('memory')['used_memory']
for u in range(1000):
    for field in ('name', 'city', 'tier'):
        r.set(f'user:{u}:{field}', 'x' * 8)        # 사용자당 키 3개
middle = r.info('memory')['used_memory']
for u in range(1000):
    r.hset(f'u:{u}', mapping={'name': 'x' * 8, 'city': 'x' * 8, 'tier': 'x' * 8})
end = r.info('memory')['used_memory']

per_strings = (middle - start) / 1000
per_hash = (end - middle) / 1000
print('사용자 1명당 문자열 키 3개:', round(per_strings / 50) * 50, '바이트 안팎')
print('사용자 1명당 해시 1개:', round(per_hash / 50) * 50, '바이트 안팎')
print('해시의 인코딩:', r.object('encoding', 'u:0').decode())
r.shutdown(nosave=True)
```
```text
사용자 1명당 문자열 키 3개: 300 바이트 안팎
사용자 1명당 해시 1개: 150 바이트 안팎
해시의 인코딩: listpack
```
해시로 묶자 메모리가 절반쯤으로 줄었다. 필드 수와 값 길이가 작은 해시는 `listpack`이라는 촘촘한 배열에 저장되기 때문이다(3편). 기본 한도(`hash-max-listpack-entries 128`, `hash-max-listpack-value 64`)를 넘으면 일반 해시 테이블로 바뀌며 이 이득이 사라진다. 키 이름을 짧게 하는 것, 정수는 정수로 저장하는 것(2편의 `int` 인코딩)도 같은 방향의 절약이다.

## 그 밖의 흔한 원인
- **연결 폭주**: 요청마다 새 연결을 열면 TCP 핸드셰이크(웹 앱의 원리 7편)가 매번 든다. 클라이언트 라이브러리의 연결 풀을 쓴다.
- **스왑**: 메모리가 모자라 운영체제가 Redis의 메모리를 디스크로 내보내면 모든 명령이 디스크 속도가 된다. `maxmemory`(4편)는 실제 메모리보다 넉넉히 작게 잡는다.
- **fork 지연**: 큰 인스턴스에서 RDB·AOF 다시 쓰기(7편)의 fork가 순간적인 멈춤을 만든다.
- **Pub/Sub 출력 버퍼**: 느린 구독자 앞에 메시지가 쌓이면 서버 메모리가 는다. 버퍼 한도를 넘은 클라이언트는 끊긴다.

## 흔한 오해
- "Redis가 느리면 서버를 더 좋은 것으로 바꾸면 된다": 대부분은 왕복 횟수와 큰 키 문제다. 명령 실행이 한 줄이라 코어를 늘려도 느린 명령 하나의 영향은 그대로다.
- "파이프라인은 트랜잭션이다": 왕복만 줄일 뿐 원자성은 없다. 다른 클라이언트의 명령이 사이에 실행될 수 있다.
- "`--bigkeys`는 운영 서버에서 쓰면 안 된다": SCAN 기반이라 비교적 안전하지만 서버를 끝까지 훑는 만큼 부하는 생긴다. 한가한 시간이나 레플리카에서 돌리는 편이 좋다.

## 어디에 쓰이나
- 웹 앱의 원리 15편 「연결을 아끼는 HTTP의 진화: keep-alive, HTTP/2, HTTP/3」: 왕복을 줄이기 위해 연결을 재사용하고 요청을 겹치는 생각이 파이프라이닝과 같다.
- 게임 자원 관리 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」: 한 번에 큰 일을 하지 말고 예산 안에서 나눠 하라는 원칙이 큰 키 다루기와 같다.
- 웹 앱의 원리 17편 「작게 보내기: 압축, 코드 분할, 페이지네이션」: 큰 목록을 한 번에 보내지 말고 잘라 주라는 페이지네이션이 큰 키의 범위 읽기와 같은 이야기다.

## 정리
- 처리량은 왕복이 정한다. 파이프라이닝과 여러 값을 받는 명령으로 왕복을 줄인다.
- 큰 키와 그 전체를 다루는 명령은 한 줄 실행을 붙잡는다. `SLOWLOG`와 `--bigkeys`로 찾고, 키를 나누고 범위로 읽는다.
- 키마다 관리 비용이 붙는다. 작은 해시로 묶으면 `listpack` 덕분에 메모리가 크게 준다.
- 연결 풀, 넉넉한 `maxmemory`, fork 지연, 출력 버퍼도 성능 문제의 흔한 원인이다.

## 더 알아보기
- 이전 글: 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」
- 다음 글: 10편 「운영과 보안: ACL, 설정, 모니터링」
