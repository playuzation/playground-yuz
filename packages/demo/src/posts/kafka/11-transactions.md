# [카프카 이벤트 스트리밍 11/12] 트랜잭션: 읽고 처리하고 쓰기를 한 번에

> **한 줄 요약** — 카프카 트랜잭션은 여러 토픽·파티션에 쓰는 메시지와 컨슈머 오프셋 커밋을 하나로 묶어 모두 반영되거나 모두 버려지게 하며, `read_committed`로 읽는 컨슈머는 버려진 메시지를 보지 않으므로, 카프카에서 읽어 처리한 결과를 카프카에 쓰는 흐름을 장애가 나도 정확히 한 번으로 만들 수 있다.

## 이 글에서 다루는 것
- 트랜잭션이 묶는 것: 여러 파티션에 쓰기, 그리고 오프셋 커밋
- 트랜잭션 ID, 코디네이터, 커밋 표시
- 읽는 쪽의 선택: `read_committed`와 `read_uncommitted`
- 직접 해 보기: 두 토픽에 함께 쓰고 되돌리기, 처리 도중 죽기
- 비용과 한계

## 트랜잭션이 묶는 것
7편에서 "처리했다"와 "커밋했다" 사이의 틈이 중복과 손실을 만든다고 했다. 결과를 데이터베이스에 쓴다면 결과와 오프셋을 같은 DB 트랜잭션에 넣었다. 결과를 **카프카 토픽에** 쓰는 경우, 즉 토픽에서 읽어 처리하고 다른 토픽에 쓰는 흐름이라면 카프카 자신의 트랜잭션이 같은 일을 한다.
- 한 트랜잭션 안에서 여러 토픽과 파티션에 메시지를 쓸 수 있다.
- 읽은 메시지의 오프셋 커밋(7편)도 같은 트랜잭션에 넣을 수 있다.
- 트랜잭션을 커밋하면 이 모두가 함께 반영되고, 되돌리면(abort) 함께 버려진다.

## 어떻게 동작하나
- 프로듀서는 **트랜잭션 ID**(`transactional.id`)를 설정한다. 프로그램이 재시작해도 같은 ID를 쓰는 것이 핵심이다.
- 브로커 중 하나가 그 ID의 **트랜잭션 코디네이터**를 맡아, 진행 상태를 내부 토픽 `__transaction_state`에 기록한다.
- 프로듀서가 시작하며 `init_transactions()`를 부르면, 코디네이터는 그 ID의 **에포크**를 하나 올린다. 같은 ID로 아직 살아 있던 옛 프로듀서(멈춰 있다 깨어난 "좀비")는 에포크가 낮아 이후의 쓰기가 거절된다. 옛 프로듀서가 끝내지 못한 트랜잭션은 이때 되돌려진다.
- 트랜잭션 안의 메시지는 바로 파티션 로그에 쓰인다. 커밋이나 되돌리기가 정해지면 코디네이터가 관련 파티션마다 **커밋 표시**(control record)를 덧붙인다.
- 읽는 쪽에서 `isolation.level=read_committed`인 컨슈머는 커밋 표시가 붙은 메시지만 넘겨받고, 되돌려진 메시지는 건너뛴다. 기본값 `read_uncommitted`는 모두 넘겨받는다.

## 직접 해 보기 1: 두 토픽에 함께 쓰고 되돌리기
송금을 "출금" 토픽과 "입금" 토픽에 나눠 쓴다고 하자. 둘 중 하나만 반영되면 돈이 사라지거나 생긴다. 첫 송금은 커밋하고, 둘째 송금은 쓰다가 되돌린다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'group.initial.rebalance.delay.ms=0' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
for t in debits credits orders results; do
  kafka-topics.sh --bootstrap-server $K --create --topic $t --partitions 1 --replication-factor 1 > /dev/null
done
```
```python
from confluent_kafka import Producer

p = Producer({'bootstrap.servers': 'localhost:9092', 'transactional.id': 'transfer'})
p.init_transactions()

p.begin_transaction()
p.produce('debits', 'minji -5000')
p.produce('credits', 'sora +5000')
p.commit_transaction()                       # 둘 다 반영

p.begin_transaction()
p.produce('debits', 'minji -9000')
p.produce('credits', 'jun +9000')
p.flush()                                    # 메시지는 이미 브로커의 로그에 들어갔다
p.abort_transaction()                        # 그래도 둘 다 버린다
```
같은 토픽을 두 가지 격리 수준으로 읽는다.
```bash
read_all() {   # 격리 수준, 토픽
  kafka-console-consumer.sh --bootstrap-server $K --topic $2 --from-beginning --timeout-ms 4000 \
    --isolation-level $1 2>/dev/null | paste -sd, | sed 's/,/, /g'
}
for level in read_committed read_uncommitted; do
  echo "$level 출금: $(read_all $level debits) / 입금: $(read_all $level credits)"
done
```
```text
read_committed 출금: minji -5000 / 입금: sora +5000
read_uncommitted 출금: minji -5000, minji -9000 / 입금: sora +5000, jun +9000
```
되돌린 송금의 메시지도 로그에는 남아 있어, `read_uncommitted`로 읽으면 보인다. `read_committed`로 읽는 컨슈머에게는 커밋한 첫 송금만 보인다. 트랜잭션을 쓰는 흐름의 컨슈머는 반드시 `read_committed`로 읽어야 한다.

## 직접 해 보기 2: 읽고 처리하고 쓰다가 죽기
이번에는 주문 토픽(`orders`)에서 읽어 처리 결과를 `results` 토픽에 쓰는 처리기다. 메시지 하나마다 트랜잭션을 열고, 결과 쓰기와 오프셋 커밋(`send_offsets_to_transaction`)을 함께 커밋한다. `o3`에서는 결과를 브로커에 보낸 뒤 커밋하기 전에 죽는다.
```python
# 파일: process.py
import os, sys
from confluent_kafka import Consumer, Producer

crash_at = sys.argv[1]
c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': 'billing', 'enable.auto.commit': False,
              'auto.offset.reset': 'earliest', 'isolation.level': 'read_committed',
              'session.timeout.ms': 6000})
p = Producer({'bootstrap.servers': 'localhost:9092', 'transactional.id': 'billing-1'})
p.init_transactions()            # 옛 프로듀서를 막고, 끝나지 않은 트랜잭션을 되돌린다
c.subscribe(['orders'])
while True:
    msg = c.poll(1)
    if msg is None:
        continue
    v = msg.value().decode()
    p.begin_transaction()
    p.produce('results', f'{v} 처리됨')
    if v == crash_at:
        p.flush(); os._exit(1)   # 결과는 브로커에 갔지만 커밋 전에 죽는다
    p.send_offsets_to_transaction(c.position(c.assignment()), c.consumer_group_metadata())
    p.commit_transaction()       # 결과와 "여기까지 읽었다"를 함께 확정한다
    if v == 'o6':
        break
c.close()
```
```bash
printf '%s\n' o1 o2 o3 o4 o5 o6 | kafka-console-producer.sh --bootstrap-server $K --topic orders
python3 process.py o3
python3 process.py - 2>/dev/null   # 옛 트랜잭션이 정리되기를 기다리며 남기는 재시도 로그는 감춘다
for level in read_committed read_uncommitted; do echo "$level: $(read_all $level results)"; done
kafka-server-stop.sh > /dev/null
```
```text
read_committed: o1 처리됨, o2 처리됨, o3 처리됨, o4 처리됨, o5 처리됨, o6 처리됨
read_uncommitted: o1 처리됨, o2 처리됨, o3 처리됨, o3 처리됨, o4 처리됨, o5 처리됨, o6 처리됨
```
- 처음 실행은 `o3`의 결과를 로그에 쓴 뒤 커밋 전에 죽었다. 오프셋도 같은 트랜잭션에 있었으므로 커밋된 위치는 `o3` 앞이다.
- 다시 시작한 처리기는 같은 트랜잭션 ID로 `init_transactions()`를 불렀고, 코디네이터가 죽은 쪽의 트랜잭션을 되돌렸다. 되돌리는 동안에는 "같은 트랜잭션에 다른 작업이 진행 중"이라는 응답을 받고 잠시 다시 시도한다. 그 뒤 `o3`부터 다시 처리했다.
- 로그에는 `o3`의 결과가 두 번 있지만(`read_uncommitted`), 첫 번째는 되돌려진 것이라 `read_committed` 컨슈머에게는 **정확히 한 번**씩만 보인다. 7편의 적어도 한 번과 달리, 결과를 받는 쪽에서 중복을 거를 필요가 없다.

## 비용과 한계
- **지연**: 트랜잭션이 커밋될 때까지 `read_committed` 컨슈머는 그 메시지를 받지 못한다. 게다가 열려 있는 트랜잭션이 있으면 그 뒤에 쓰인 다른 메시지도 기다린다(그 앞의 위치를 마지막 안정 오프셋, LSO라고 한다). 그래서 트랜잭션은 짧게, 메시지 하나가 아니라 수백 ms 분량을 묶어 커밋하는 것이 보통이다.
- **부하**: 커밋마다 코디네이터와 왕복하고, 파티션마다 커밋 표시가 붙는다. 이 표시도 오프셋을 하나씩 차지하므로 트랜잭션 토픽의 오프셋에는 빈 번호가 생긴다.
- **범위**: 카프카 안에서 읽고 카프카에 쓰는 것만 묶는다. 데이터베이스에 쓰거나 메일을 보내는 일은 트랜잭션에 들어가지 않으므로, 7편의 방법(DB 트랜잭션에 오프셋 함께 저장, 멱등 키)이 필요하다.
- **트랜잭션 ID 정하기**: 처리기 인스턴스마다 겹치지 않고 재시작해도 그대로인 ID를 쓴다. 매번 새로 만들면 좀비를 막지 못한다.

12편의 카프카 스트림즈는 이 모든 것을 설정 하나(`processing.guarantee=exactly_once_v2`)로 감싸 준다. 직접 트랜잭션 코드를 쓰는 일은 드물지만, 그 아래에서 무슨 일이 일어나는지 알아야 지연과 장애를 해석할 수 있다.

## 흔한 오해
- "트랜잭션 프로듀서를 쓰면 컨슈머도 알아서 정확히 한 번이다": 컨슈머가 `read_committed`로 읽어야 되돌린 메시지를 건너뛴다. 기본값은 `read_uncommitted`다.
- "되돌린 메시지는 로그에서 지워진다": 로그에 그대로 있고, 표시로 걸러질 뿐이다. 보존 정책으로 지워질 때까지 디스크를 차지한다.
- "트랜잭션이면 DB 쓰기도 함께 묶인다": 카프카 트랜잭션은 카프카의 쓰기와 오프셋 커밋만 묶는다.

## 어디에 쓰이나
- PostgreSQL 실무 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」: 커밋되지 않은 데이터를 보지 않는 격리가 `read_committed`와 같은 생각이다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 카프카 밖의 부작용은 여전히 멱등 키로 다룬다.
- Redis 실무 5편 「원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua」: 여러 명령을 하나로 묶는 다른 방식과 그 보장을 비교한다.

## 정리
- 카프카 트랜잭션은 여러 파티션에 쓰기와 오프셋 커밋을 하나로 묶어, 함께 반영되거나 함께 버려지게 한다.
- 같은 트랜잭션 ID로 다시 시작하면 에포크가 올라 좀비 프로듀서가 막히고, 끝나지 않은 트랜잭션이 되돌려진다.
- 컨슈머는 `read_committed`로 읽어야 되돌려진 메시지를 건너뛴다.
- 지연과 부하가 늘고, 카프카 밖의 부작용은 묶지 못한다.

## 더 알아보기
- 이전 글: 10편 「로그 컴팩션: 키마다 마지막 값만 남기기」
- 다음 글: 12편 「생태계와 운영: Connect, Streams, 스키마, 지연 감시」
