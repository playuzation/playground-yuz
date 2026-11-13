# [Redis 실무 4/10] 캐시로 쓰기: 캐시 어사이드, TTL, 메모리 정책

> **한 줄 요약** — 캐시 어사이드는 "Redis에 있으면 쓰고, 없으면 데이터베이스에서 읽어 TTL과 함께 넣는" 가장 흔한 캐시 방식이고, 메모리가 차면 `maxmemory-policy`가 무엇을 버릴지 정하며, 인기 키가 동시에 만료되는 순간 데이터베이스로 요청이 몰리는 폭주는 잠금과 TTL 흔들기로 막는다.

## 이 글에서 다루는 것
- 캐시 어사이드: 읽을 때 채우는 캐시
- 쓸 때의 선택: 지우기, 함께 쓰기
- TTL과 신선도의 교환
- 메모리가 찼을 때: maxmemory와 퇴출 정책
- 캐시 폭주(stampede)와 막는 법
- 직접 해 보기: 파이썬으로 만든 캐시 어사이드, 퇴출 정책 비교, 폭주 막기

## 캐시 어사이드
캐시를 쓰는 방법 중 가장 흔한 것은 **캐시 어사이드**(cache-aside)다. 애플리케이션이 직접 캐시를 옆에 두고 관리한다.
```text
read(key):
  v = redis.get(key)
  if found: return v      (hit)
  v = db.query(...)       (miss)
  redis.set(key, v, ttl)
  return v
```
캐시는 처음 요청이 왔을 때 채워지므로, 자주 읽히는 값만 메모리에 남는다. Redis가 죽어도 느려질 뿐 데이터베이스에서 계속 답할 수 있다는 장점도 있다. 이 시리즈의 파이썬 예제는 `pip install redis`로 설치하는 공식 클라이언트(redis-py)를 쓴다. 실습 서버를 띄운다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
```

## 직접 해 보기 1: 캐시 어사이드
읽을 때마다 0.2초가 걸리는 느린 데이터베이스를 흉내 내고, 같은 상품을 세 번 읽는다. 코드를 몰라도 출력의 시간만 보면 된다.
```python
import json, time, redis

r = redis.Redis(port=6390, decode_responses=True)
DB = {1001: {'name': '커피', 'price': 4500}}
db_calls = 0

def db_get(pid):                      # 느린 데이터베이스 흉내
    global db_calls
    db_calls += 1
    time.sleep(0.2)
    return DB[pid]

def get_product(pid, ttl=60):
    key = f'cache:product:{pid}'
    hit = r.get(key)
    if hit:
        return json.loads(hit), '캐시'
    value = db_get(pid)
    r.set(key, json.dumps(value, ensure_ascii=False), ex=ttl)
    return value, 'DB'

for _ in range(3):
    t = time.perf_counter()
    value, source = get_product(1001)
    ms = (time.perf_counter() - t) * 1000
    print(source, value['name'], '200ms 이상' if ms >= 200 else '5ms 미만' if ms < 5 else f'{ms:.0f}ms')
print('DB 호출:', db_calls, '| TTL:', r.ttl('cache:product:1001') > 0)
```
```text
DB 커피 200ms 이상
캐시 커피 5ms 미만
캐시 커피 5ms 미만
DB 호출: 1 | TTL: True
```
첫 요청은 데이터베이스를 거쳤고, 다음 두 번은 Redis가 1ms 안팎에 답했다.

## 쓸 때는 지운다
데이터가 바뀌면 캐시의 사본은 낡는다. 방법은 크게 둘이다.
- **지우기**: 데이터베이스를 고친 뒤 캐시 키를 `DEL`한다. 다음 읽기가 새 값으로 채운다. 가장 단순하고 흔하다.
- **함께 쓰기**(write-through): 데이터베이스와 캐시를 모두 새 값으로 쓴다. 다만 두 쓰기 사이에 다른 요청이 끼어 옛 값을 캐시에 넣는 경쟁이 생길 수 있다.

어느 쪽이든 데이터베이스와 캐시를 한 트랜잭션으로 묶을 수는 없어서, 아주 짧은 시간 옛 값이 보일 수 있다. 그래서 TTL은 캐시의 **안전망**이다. 무효화를 깜빡하거나 실패해도 TTL이 지나면 결국 새 값이 된다. TTL을 길게 하면 데이터베이스 부담이 줄지만 낡은 값이 오래 남고, 짧게 하면 그 반대다. "이 값이 몇 초 늦게 바뀌어도 괜찮은가"를 먼저 정하고 TTL을 고른다.

## 메모리가 찼을 때
Redis는 메모리 안의 저장소라 한도가 필요하다. `maxmemory`로 한도를 정하고, 한도에 닿았을 때의 행동을 `maxmemory-policy`로 정한다.
- `noeviction`: 아무것도 버리지 않고 쓰기 명령을 오류로 거절한다. 데이터를 잃으면 안 되는 용도의 기본값.
- `allkeys-lru`, `allkeys-lfu`: 모든 키 중 가장 오래 안 쓴(LRU) 또는 가장 적게 쓴(LFU) 키를 버린다. 순수 캐시에 맞는다.
- `volatile-lru`, `volatile-ttl` 등: TTL이 있는 키만 버린다. 캐시와 버리면 안 되는 데이터를 한 서버에 섞을 때 쓴다.

Redis의 LRU는 정확한 LRU가 아니라 키 몇 개를 표본으로 뽑아 그중 가장 오래된 것을 버리는 근사다. 모든 키의 순서를 관리하는 비용을 피하는 대신 정확도를 조금 내준 것이다(게임 자원 관리 5편의 CLOCK과 같은 발상이다).

## 직접 해 보기 2: 퇴출 정책 비교
한도를 2MB로 정하고 1KB짜리 값 5,000개(약 5MB)를 넣어 본다. 정책만 바꿔 두 번 한다.
```python
import redis

r = redis.Redis(port=6390)
for policy in ['noeviction', 'allkeys-lru']:
    r.flushall()
    r.config_set('maxmemory', '2mb')
    r.config_set('maxmemory-policy', policy)
    r.config_resetstat()
    errors = 0
    for i in range(5000):
        try:
            r.set(f'item:{i}', 'x' * 1000)
        except redis.exceptions.ResponseError as e:
            errors += 1
            first_error = type(e).__name__
    evicted = r.info('stats')['evicted_keys']
    print(f'{policy}: 남은 키 {r.dbsize() < 5000}·{r.dbsize() > 0}, 거절 {errors > 0}, 퇴출 {evicted > 0}')
    if errors:
        print('  오류:', first_error)
r.config_set('maxmemory', '0')
```
```text
noeviction: 남은 키 True·True, 거절 True, 퇴출 False
  오류: OutOfMemoryError
allkeys-lru: 남은 키 True·True, 거절 False, 퇴출 True
```
`noeviction`에서는 한도에 닿은 뒤의 쓰기가 모두 거절되었다. 서버가 보낸 오류는 `OOM command not allowed when used memory > 'maxmemory'`이고, redis-py는 이것을 `OutOfMemoryError` 예외로 바꿔 준다. 애플리케이션이 이 오류를 처리하지 않으면 장애가 된다. `allkeys-lru`에서는 쓰기는 모두 성공했고, 대신 오래된 키들이 조용히 버려졌다. 캐시라면 뒤쪽이 맞고, 버리면 안 되는 데이터라면 앞쪽이 맞다. 어느 경우든 키 수와 메모리 사용량(10편의 `INFO`)을 지켜봐야 한다.

## 캐시 폭주와 막는 법
인기 상품 페이지의 캐시가 만료되는 순간, 동시에 들어온 수백 개 요청이 모두 "없음"을 보고 데이터베이스로 몰려가는 현상을 **캐시 폭주**(cache stampede)라고 한다. 막는 방법은 세 가지가 흔하다.
- **한 명만 채우기**: 캐시를 다시 채울 권한을 `SET lock NX EX 5`로 한 요청에게만 주고, 나머지는 잠깐 기다렸다가 캐시를 다시 본다.
- **TTL 흔들기**: 같은 시각에 만든 키들이 같은 시각에 만료되지 않게 TTL에 무작위 몇 초를 더한다(웹 앱의 원리 19편의 지터).
- **미리 갱신**: 만료 직전의 키를 백그라운드에서 다시 채운다.

## 직접 해 보기 3: 한 명만 채우기
캐시가 빈 상태에서 요청 20개가 동시에 들어온다. 잠금 없이, 그리고 `SET NX` 잠금으로 각각 돌려 데이터베이스 호출 수를 센다.
```python
import threading, time, redis

r = redis.Redis(port=6390, decode_responses=True)

def run(use_lock):
    r.delete('cache:hot', 'lock:hot')
    calls = []
    def handler():
        while True:
            if r.get('cache:hot'):
                return
            if not use_lock or r.set('lock:hot', '1', nx=True, ex=5):
                calls.append(1)
                time.sleep(0.2)                       # 느린 데이터베이스 질의
                r.set('cache:hot', 'value', ex=60)
                return
            time.sleep(0.05)                          # 남이 채우는 중: 잠깐 뒤 다시 본다
    threads = [threading.Thread(target=handler) for _ in range(20)]
    for t in threads: t.start()
    for t in threads: t.join()
    return len(calls)

print('잠금 없이 DB 호출:', run(False))
print('SET NX 잠금 DB 호출:', run(True))
```
```text
잠금 없이 DB 호출: 20
SET NX 잠금 DB 호출: 1
```
잠금이 없으면 20개 요청이 모두 데이터베이스로 갔다. 잠금이 있으면 한 요청만 데이터베이스에 갔고, 나머지 19개는 0.05초씩 기다렸다가 채워진 캐시를 읽었다. 잠금에 `EX 5`를 준 것이 중요하다. 채우던 요청이 죽어도 5초 뒤 잠금이 풀려 다른 요청이 이어받는다.
```bash
redis-cli -p 6390 shutdown nosave
```

## 흔한 오해
- "캐시를 두면 데이터베이스 부담이 사라진다": 첫 요청, 만료 직후, 캐시 서버 재시작 때는 모든 요청이 데이터베이스로 간다. 그 순간을 견딜 수 있어야 한다.
- "TTL을 길게 잡을수록 좋다": 적중률은 오르지만 낡은 값이 오래 보인다. 바뀌면 지우는 무효화와 짧은 TTL의 조합이 보통 더 안전하다.
- "LRU는 가장 오래된 키를 정확히 버린다": Redis는 표본을 뽑아 근사한다. 대부분의 캐시에서 충분히 좋지만, 정확한 순서를 기대하면 안 된다.

## 어디에 쓰이나
- 웹 앱의 원리 16편 「다시 받지 않기: 브라우저 캐시, ETag, CDN」: 신선도와 검증, 무효화라는 같은 문제를 HTTP 캐시 쪽에서 본다.
- 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」: 퇴출 정책의 LRU·LFU와 근사 방식을 직접 구현해 비교한다.
- 메모리 시스템 3편 「캐시 미스의 종류와 정책: 3C, 교체, 쓰기」: 처음 미스, 용량 미스, 쓰기 정책이 CPU 캐시와 Redis 캐시에서 같은 모양으로 나타난다.

## 정리
- 캐시 어사이드는 읽을 때 채우고, 바뀌면 지운다. Redis가 죽어도 데이터베이스로 답할 수 있다.
- TTL은 신선도와 데이터베이스 부담의 교환이자, 무효화 실패의 안전망이다.
- `maxmemory`와 `maxmemory-policy`로 한도와 퇴출 방식을 정한다. 순수 캐시는 allkeys-LRU·LFU, 잃으면 안 되는 데이터는 noeviction.
- 만료 순간의 폭주는 `SET NX` 잠금, TTL 흔들기, 미리 갱신으로 막는다.

## 더 알아보기
- 이전 글: 3편 「자료 구조: 리스트, 해시, 셋, 정렬된 셋」
- 다음 글: 5편 「원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua」
