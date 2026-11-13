# [Redis 실무 6/10] 메시징: Pub/Sub과 스트림

> **한 줄 요약** — Pub/Sub은 지금 듣고 있는 구독자에게만 메시지를 흘려보내고 아무것도 저장하지 않는 방송이고, 스트림은 메시지를 ID와 함께 로그로 남겨 나중에 읽고, 컨슈머 그룹으로 나눠 처리하고, 처리 확인(ACK)이 없는 메시지를 다른 소비자가 넘겨받게 하는 작업 큐다.

## 이 글에서 다루는 것
- Pub/Sub: 채널과 구독, 그리고 "듣지 않으면 사라진다"
- 스트림: 추가만 되는 로그와 ID
- 컨슈머 그룹: 나눠 읽기, ACK, 대기 목록
- 죽은 소비자의 메시지 넘겨받기
- Pub/Sub, 리스트, 스트림, 카프카 중 고르기

## Pub/Sub: 지금 듣는 사람에게만
**Pub/Sub**(publish/subscribe)에서 발행자는 채널 이름으로 메시지를 보내고, 그 채널을 구독 중인 클라이언트 모두가 받는다. 발행자는 누가 듣는지 모르고, Redis는 메시지를 저장하지 않는다. 웹 앱의 원리 13편의 실시간 알림을 서버 여러 대에 퍼뜨릴 때 흔히 쓴다. 한 서버에 연결된 사용자에게 보낼 메시지를 모든 서버가 받고, 각자 자기 연결로 전달한다.
```bash
redis-server --port 6390 --save "" --appendonly no > redis.log 2>&1 &
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
```
```python
import time, redis

r = redis.Redis(port=6390, decode_responses=True)
print('구독자 없을 때 발행 → 받은 구독자 수:', r.publish('chat:room1', '아무도 없나요?'))

sub = r.pubsub(ignore_subscribe_messages=True)
sub.subscribe('chat:room1')
time.sleep(0.1)
print('구독 후 발행 → 받은 구독자 수:', r.publish('chat:room1', '안녕하세요'))
r.publish('chat:room1', '반가워요')
time.sleep(0.1)
received = []
for _ in range(5):                       # 구독 확인 신호는 건너뛰고 메시지만 모은다
    m = sub.get_message(timeout=0.2)
    if m:
        received.append(m['data'])
print('구독자가 받은 것:', received)
```
```text
구독자 없을 때 발행 → 받은 구독자 수: 0
구독 후 발행 → 받은 구독자 수: 1
구독자가 받은 것: ['안녕하세요', '반가워요']
```
구독 전에 보낸 "아무도 없나요?"는 받은 사람이 0명이었고 어디에도 남지 않았다. 구독자가 잠깐 끊겼다가 다시 붙어도 그사이의 메시지는 받지 못한다. 그래서 Pub/Sub은 놓쳐도 되는 알림(누가 입력 중입니다, 캐시를 지우라는 신호)에 맞고, 놓치면 안 되는 일(주문 처리)에는 맞지 않는다.

## 스트림: 남는 로그
Redis 5.0에서 들어온 **스트림**(stream)은 메시지를 지우지 않고 뒤에 덧붙이는 로그다. 메시지마다 **ID**가 붙고, 기본 ID는 "밀리초 시각-순번"(예: `1700000000000-0`)이라 시간 순서를 따른다. 여기서는 출력이 늘 같도록 ID를 직접 `1-0`, `2-0`처럼 정했다. 실제로는 `*`를 주어 Redis가 붙이게 한다.
```bash
r() { redis-cli -p 6390 --no-raw "$@"; }
r xadd orders 1-0 item coffee qty 1
r xadd orders 2-0 item tea qty 2
r xadd orders 3-0 item cake qty 1
r xlen orders
r xrange orders 2-0 +
```
```text
"1-0"
"2-0"
"3-0"
(integer) 3
1) 1) "2-0"
   2) 1) "item"
      2) "tea"
      3) "qty"
      4) "2"
2) 1) "3-0"
   2) 1) "item"
      2) "cake"
      3) "qty"
      4) "1"
```
메시지는 필드-값 묶음이고, 읽어도 사라지지 않는다. `XRANGE`로 ID 구간을, `XREAD`로 "이 ID 다음부터"를 읽는다. 무한히 쌓이지 않게 `XADD orders MAXLEN ~ 10000 * …`처럼 최대 길이를 정해 오래된 것부터 잘라 낸다.

## 컨슈머 그룹: 나눠 읽고 확인하기
주문 처리 워커가 여러 개라면 메시지를 나눠 가져야 한다. **컨슈머 그룹**은 그룹 이름 하나에 "어디까지 나눠 줬나"를 기억하고, 그룹 안의 소비자들에게 메시지를 하나씩 배분한다. 소비자는 처리를 마치면 `XACK`로 확인한다. 확인되지 않은 메시지는 **대기 목록**(PEL, pending entries list)에 소비자 이름과 함께 남는다.
```bash
r xgroup create orders workers 0
r xreadgroup group workers alice count 1 streams orders '>'
r xreadgroup group workers bob count 1 streams orders '>'
r xack orders workers 1-0
r xpending orders workers
```
```text
OK
1) 1) "orders"
   2) 1) 1) "1-0"
         2) 1) "item"
            2) "coffee"
            3) "qty"
            4) "1"
1) 1) "orders"
   2) 1) 1) "2-0"
         2) 1) "item"
            2) "tea"
            3) "qty"
            4) "2"
(integer) 1
1) (integer) 1
2) "2-0"
3) "2-0"
4) 1) 1) "bob"
      2) "1"
```
`>`는 "그룹에서 아직 아무에게도 주지 않은 새 메시지"라는 뜻이다. alice는 1번, bob은 2번을 받았다. alice는 처리를 마치고 ACK했고, bob은 아직이다. `XPENDING`의 요약은 "대기 중 1건, ID 2-0, bob이 1건 들고 있음"이다.

## 죽은 소비자의 메시지 넘겨받기
bob이 메시지를 받은 뒤 죽었다고 하자. 리스트 기반 큐(3편)였다면 그 주문은 사라졌을 것이다. 스트림에서는 대기 목록에 남아 있으므로, 다른 소비자가 일정 시간 이상 확인되지 않은 메시지를 넘겨받을 수 있다.
```bash
sleep 1
r xautoclaim orders workers carol 500 0 count 10
r xack orders workers 2-0
r xpending orders workers
r shutdown nosave
```
```text
1) "0-0"
2) 1) 1) "2-0"
      2) 1) "item"
         2) "tea"
         3) "qty"
         4) "2"
3) (empty array)
(integer) 1
1) (integer) 0
2) (nil)
3) (nil)
4) (nil)
```
`XAUTOCLAIM … carol 500`은 "500ms 넘게 확인되지 않은 메시지를 carol에게 넘겨라"다. carol이 2번 주문을 받아 처리하고 ACK하자 대기 목록이 비었다. 이렇게 스트림은 "적어도 한 번" 전달을 만든다. 넘겨받은 메시지가 bob에게서도 이미 처리됐을 수 있으므로, 처리 자체는 같은 메시지를 두 번 받아도 괜찮게(멱등하게) 만들어야 한다(웹 앱의 원리 14편).

## 무엇을 고를까
| 방식 | 남는가 | 잘 맞는 곳 |
| --- | --- | --- |
| Pub/Sub | 남지 않음 | 놓쳐도 되는 실시간 알림 |
| 리스트 | 꺼내면 사라짐 | 단순한 작업 큐 |
| 스트림 | 로그로 남음 | 확인이 필요한 작업, 짧은 이벤트 기록 |
| 카프카 | 디스크 로그 | 대용량, 장기 보관, 재처리 |

스트림은 카프카와 생각이 닮았다. 다만 Redis는 메모리에 담으므로 며칠, 몇 주 치의 대량 이벤트를 쌓아 두고 다시 읽는 용도에는 디스크 기반 로그인 카프카가 맞다. 그 이야기는 카프카 이벤트 스트리밍 1편 「카프카란: 지워지지 않는 로그로 만든 메시지 시스템」부터 이어진다.

## 흔한 오해
- "Pub/Sub이면 메시지 큐다": 저장도 확인도 없다. 구독자가 없거나 끊겨 있던 동안의 메시지는 그냥 사라진다.
- "컨슈머 그룹이면 메시지가 정확히 한 번 처리된다": 넘겨받기 때문에 같은 메시지가 두 번 처리될 수 있다. 처리를 멱등하게 만드는 것이 짝이다.
- "스트림은 자동으로 정리된다": `MAXLEN`이나 `MINID`로 자르지 않으면 계속 커진다. 메모리 한도(4편)에 닿기 전에 정리 규칙을 정한다.

## 어디에 쓰이나
- 웹 앱의 원리 13편 「실시간 통신: 폴링, 서버 전송 이벤트, 웹소켓」: 웹소켓 서버 여러 대에 같은 알림을 뿌리는 연결 고리로 Pub/Sub이 쓰인다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 스트림의 대기 목록과 넘겨받기가 작업 큐의 "적어도 한 번" 전달 그 자체다.
- PostgreSQL 실무 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」: 같은 작업 큐를 데이터베이스 테이블로 만드는 방법과 비교해 볼 수 있다.

## 정리
- Pub/Sub은 지금 듣는 구독자에게만 흘려보내는 방송이다. 저장하지 않는다.
- 스트림은 ID가 붙은 추가 전용 로그다. 읽어도 남고, 길이를 정해 잘라 낸다.
- 컨슈머 그룹은 메시지를 소비자들에게 나눠 주고, ACK 전까지 대기 목록에 남긴다.
- 확인되지 않은 메시지는 `XAUTOCLAIM`으로 다른 소비자가 넘겨받는다. 그래서 처리는 멱등해야 한다.

## 더 알아보기
- 이전 글: 5편 「원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua」
- 다음 글: 7편 「영속성: RDB 스냅숏과 AOF」
