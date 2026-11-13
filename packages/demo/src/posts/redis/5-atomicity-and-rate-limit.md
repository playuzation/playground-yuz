# [Redis 실무 5/10] 원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua

> **한 줄 요약** — 클라이언트에서 "읽고 고쳐서 쓰면" 동시에 실행된 요청끼리 변경을 덮어쓰므로, 명령 하나로 끝나는 `INCR`, 묶어서 실행하는 `MULTI`/`EXEC`와 바뀌면 포기하는 `WATCH`, 서버 안에서 통째로 실행되는 Lua 스크립트로 읽기와 쓰기를 원자적으로 묶고, 그 위에 레이트 리밋과 잠금을 만든다.

## 이 글에서 다루는 것
- 읽고-고치고-쓰기의 경쟁: 사라지는 증가
- `MULTI`/`EXEC`: 묶음 실행과 그 한계
- `WATCH`: 바뀌었으면 포기하는 낙관적 잠금
- Lua 스크립트: 조건문까지 원자적으로
- 레이트 리밋 두 가지: 고정 창과 미끄러지는 창
- 분산 잠금의 기본과 주의점

## 사라지는 증가
1편에서 Redis는 명령을 하나씩 실행한다고 했다. 그런데 클라이언트가 `GET`으로 읽고, 1을 더하고, `SET`으로 쓰면 명령은 두 개다. 그 사이에 다른 클라이언트의 `GET`이 끼어들 수 있다. 실습 서버를 띄우고 스레드 10개가 각각 100번씩 올려 본다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
```
```python
import threading, time, redis

r = redis.Redis(port=6390)

def get_then_set():
    for _ in range(100):
        n = int(r.get('views:get-set') or 0)
        time.sleep(0.0005)                 # 계산하는 척: 이 틈에 남이 끼어든다
        r.set('views:get-set', n + 1)

def incr():
    for _ in range(100):
        r.incr('views:incr')

for name, fn in [('GET→SET', get_then_set), ('INCR', incr)]:
    threads = [threading.Thread(target=fn) for _ in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    key = 'views:get-set' if fn is get_then_set else 'views:incr'
    total = int(r.get(key))
    print(f'{name}: 1000번 올렸는데 {"1000" if total == 1000 else "1000보다 적음"}')
```
```text
GET→SET: 1000번 올렸는데 1000보다 적음
INCR: 1000번 올렸는데 1000
```
`GET→SET`은 두 스레드가 같은 값을 읽고 각자 1을 더해 쓰면서 증가 하나가 사라지는 일이 반복되었다(**갱신 분실**). `INCR`은 읽기·더하기·쓰기가 서버 안의 명령 하나라 하나도 빠지지 않았다. Redis를 잘 쓰는 첫 원칙은 "읽고 고쳐서 쓰지 말고, 그 일을 하는 명령을 찾아라"다.

## MULTI와 EXEC
명령 여러 개를 묶고 싶으면 `MULTI`로 시작해 명령을 쌓고 `EXEC`로 한꺼번에 실행한다. 쌓인 명령은 다른 클라이언트의 명령이 끼어들지 않고 연속으로 실행된다. 하지만 관계형 데이터베이스의 트랜잭션과는 다르다. 중간 명령 하나가 실행 중에 오류가 나도 나머지는 그대로 실행되고 **되돌리기(롤백)가 없다**. 그리고 쌓는 동안에는 결과를 볼 수 없으므로, "읽은 값에 따라 다르게 쓰기"는 할 수 없다. 그 빈틈을 `WATCH`가 메운다.

## WATCH: 바뀌었으면 포기하기
`WATCH key` 뒤에 `MULTI`/`EXEC`를 하면, 지켜보던 키가 그사이 다른 클라이언트에 의해 바뀌었을 때 `EXEC`가 아무것도 실행하지 않고 실패한다. 클라이언트는 처음부터 다시 시도한다. 잠금을 걸지 않고 충돌을 감지하는 **낙관적 잠금**이다. 재고가 남아 있을 때만 하나 줄이는 예를 보자. 중간에 다른 사람이 먼저 사 가도록 일부러 끼워 넣었다.
```python
import redis

r = redis.Redis(port=6390, decode_responses=True)
other = redis.Redis(port=6390, decode_responses=True)
r.set('stock:cup', 1)

def buy(interfere):
    with r.pipeline() as p:
        while True:
            try:
                p.watch('stock:cup')
                stock = int(p.get('stock:cup'))
                if stock <= 0:
                    return '품절'
                if interfere:
                    other.decr('stock:cup')        # 그사이 다른 사람이 마지막 하나를 샀다
                    interfere = False
                p.multi()
                p.decr('stock:cup')
                p.execute()
                return '구매 성공'
            except redis.WatchError:
                print('  바뀐 것을 감지: 다시 시도')

print('결과:', buy(interfere=True))
print('남은 재고:', r.get('stock:cup'))
```
```text
  바뀐 것을 감지: 다시 시도
결과: 품절
남은 재고: 0
```
첫 시도에서 재고 1을 읽었지만, `EXEC` 전에 다른 클라이언트가 재고를 바꿨으므로 Redis가 실행을 거부했다. 다시 읽어 보니 0이라 "품절"로 끝났다. `WATCH`가 없었다면 재고가 -1이 되어 하나를 더 팔았을 것이다.

## Lua 스크립트: 조건까지 서버 안에서
`EVAL`로 보낸 Lua 스크립트는 서버 안에서 **통째로 원자적으로** 실행된다. 읽은 값에 따라 분기하는 로직도 왕복 없이 한 번에 끝난다. 대신 스크립트가 도는 동안 다른 모든 명령이 기다리므로 짧게 써야 한다. Redis 7에서는 스크립트를 이름 붙여 서버에 저장하는 `FUNCTION`도 있다.

### 레이트 리밋 1: 고정 창
"사용자마다 1초에 3번"을 가장 간단히 만드는 방법은 초마다 카운터 키를 두는 것이다. `INCR`하고, 처음 만든 키면 만료를 건다. 이 두 명령을 Lua로 묶어야, `INCR` 직후 클라이언트가 죽어 만료 없는 키가 영원히 남는 일이 없다. 시각은 설명을 위해 숫자로 넘긴다.
```python
import redis

r = redis.Redis(port=6390)
FIXED = r.register_script("""
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
""")

def fixed_window(user, now_ms, limit=3):
    window = now_ms // 1000                       # 몇 번째 1초 창인가
    return FIXED(keys=[f'rl:fixed:{user}:{window}'], args=[2]) <= limit

times = [900, 950, 990, 1010, 1050, 1090]          # 0.2초 안에 6번
print('고정 창:', ['통과' if fixed_window('u1', t) else '거절' for t in times])
```
```text
고정 창: ['통과', '통과', '통과', '통과', '통과', '통과']
```
0.2초 사이에 6번 모두 통과했다. 0.9초대의 세 번은 첫 번째 창, 1.0초대의 세 번은 두 번째 창에 세어졌기 때문이다. 고정 창은 단순하고 가볍지만, 창 경계에서 한도의 두 배까지 몰릴 수 있다.

### 레이트 리밋 2: 미끄러지는 창
경계 문제를 없애려면 "지금부터 거꾸로 1초" 안의 요청 수를 센다. 3편의 정렬된 셋에 요청 시각을 점수로 넣고, 창 밖으로 밀려난 것은 지운 뒤 개수를 본다.
```python
import redis

r = redis.Redis(port=6390)
SLIDING = r.register_script("""
local key, now, window, limit = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, window)
  return 1
end
return 0
""")

def sliding(user, now_ms, limit=3, window_ms=1000):
    return SLIDING(keys=[f'rl:slide:{user}'], args=[now_ms, window_ms, limit, f'req-{now_ms}']) == 1

times = [900, 950, 990, 1010, 1050, 1090, 1960]
print('미끄러지는 창:', ['통과' if sliding('u1', t) else '거절' for t in times])
```
```text
미끄러지는 창: ['통과', '통과', '통과', '거절', '거절', '거절', '통과']
```
같은 0.2초에 3번만 통과하고 나머지는 거절되었다. 1.96초의 요청은 0.96초 이전의 기록이 창 밖으로 빠진 뒤라 통과했다. 정확한 대신 요청마다 기록을 남기므로 한도가 크면 메모리를 더 쓴다. 웹 앱의 원리 19편의 토큰 버킷도 같은 방식으로 Lua 스크립트 하나에 담을 수 있다.

## 분산 잠금의 기본
여러 서버 중 하나만 어떤 일을 하게 하려면 `SET lock:job <내 고유값> NX PX 30000`으로 잠금을 잡는다. 두 가지를 지켜야 한다. 첫째, 만료 시간이 있어야 잡은 쪽이 죽어도 잠금이 풀린다. 둘째, 풀 때는 "값이 내 고유값일 때만 지우기"를 Lua로 원자적으로 해야 한다. 그냥 `DEL`하면, 내 잠금이 이미 만료되어 남이 잡은 잠금을 지울 수 있다. 그래도 한계가 있다. 잠금을 잡은 프로세스가 오래 멈췄다가(가비지 컬렉션, 네트워크 단절) 만료 뒤에 깨어나면 두 프로세스가 동시에 일한다. 정확성이 중요한 일에는 잠금과 함께 데이터베이스 쪽에서 버전 번호나 UNIQUE 제약으로 한 번 더 막아야 한다. 여러 Redis에 걸친 잠금 알고리즘(Redlock)의 안전성에 대해서는 마틴 클레프만의 비판처럼 논쟁이 있다는 점도 알아 두자.
```bash
redis-cli -p 6390 shutdown nosave
```

## 흔한 오해
- "MULTI/EXEC는 데이터베이스 트랜잭션처럼 실패하면 되돌린다": 롤백이 없다. 실행 중 오류가 난 명령만 실패하고 나머지는 실행된다.
- "Lua 스크립트면 무엇이든 해도 된다": 실행 중에는 서버 전체가 기다린다. 큰 컬렉션을 훑는 스크립트는 `KEYS *`만큼 위험하다.
- "Redis 잠금이면 동시에 두 명이 일하는 일은 없다": 만료와 프로세스 정지가 겹치면 생긴다. 중요한 쓰기는 저장소 쪽 제약으로 한 번 더 막는다.

## 어디에 쓰이나
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 토큰 버킷과 429 응답의 설계를 Redis의 원자적 스크립트로 여러 서버가 공유하게 만든다.
- PostgreSQL 실무 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」: 갱신 분실과 낙관적 잠금을 관계형 데이터베이스 쪽에서 본다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 잠금이 실패할 때를 대비해 처리 자체를 멱등하게 만드는 방법이다.

## 정리
- 클라이언트에서 읽고 고쳐 쓰면 갱신이 사라진다. 그 일을 하는 원자적 명령(`INCR`, `SET NX`)을 먼저 찾는다.
- `MULTI`/`EXEC`는 끼어들기 없이 묶어 실행하지만 롤백이 없다. `WATCH`로 바뀌었으면 포기하고 다시 시도한다.
- Lua 스크립트는 조건 분기까지 서버 안에서 원자적으로 실행한다. 짧게 쓴다.
- 레이트 리밋은 고정 창(단순, 경계에서 두 배)과 미끄러지는 창(정확, 메모리 더)으로 만든다.
- 분산 잠금은 만료, 고유값, 원자적 해제를 갖추고, 중요한 쓰기는 저장소 제약으로 한 번 더 막는다.

## 더 알아보기
- 이전 글: 4편 「캐시로 쓰기: 캐시 어사이드, TTL, 메모리 정책」
- 다음 글: 6편 「메시징: Pub/Sub과 스트림」
