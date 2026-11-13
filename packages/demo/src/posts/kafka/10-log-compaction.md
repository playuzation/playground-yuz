# [카프카 이벤트 스트리밍 10/12] 로그 컴팩션: 키마다 마지막 값만 남기기

> **한 줄 요약** — 컴팩션 정책의 토픽은 시간이 지나도 통째로 지우지 않고, 닫힌 세그먼트에서 같은 키의 옛 값을 걸러 키마다 마지막 값만 남기며, 값이 비어 있는 툼스톤 메시지는 키 자체를 지우라는 표시라서, 이런 토픽을 처음부터 읽으면 "지금 상태"를 다시 만들 수 있다.

## 이 글에서 다루는 것
- 보존의 두 정책: 지우기(delete)와 컴팩션(compact)
- 컴팩션이 남기는 것과 지키는 것: 마지막 값, 오프셋, 순서
- 툼스톤: 키를 지우는 메시지
- 직접 해 보기: 정리 전후를 오프셋과 함께 보기, 토픽에서 상태 되살리기
- 어디에 쓰나: `__consumer_offsets`, 상태 저장, 변경 데이터

## 지우기와 컴팩션
4편의 토픽은 `cleanup.policy=delete`(기본값)였다. 오래된 세그먼트를 시간이나 크기 기준으로 통째로 지운다. 이벤트의 "흐름"을 다룰 때 맞는 정책이다. 그런데 "사용자마다 지금 주소", "상품마다 지금 가격"처럼 **키마다 최신 상태**가 중요한 데이터라면, 오래되었다고 지우면 곤란하다. 일주일 동안 주소를 바꾸지 않은 사용자의 주소가 사라지기 때문이다.

`cleanup.policy=compact`는 다르게 정리한다. 브로커의 **클리너** 스레드가 닫힌 세그먼트를 읽어, 같은 키의 값이 뒤에 또 있으면 앞의 것을 버린다. 결과적으로 키마다 마지막 값만 남는다. 두 정책을 함께 쓰는 `compact,delete`도 있다. 키마다 최신 값을 남기되, 너무 오래된 것은 지운다.

컴팩션이 지키는 것도 분명하다.
- **오프셋은 바뀌지 않는다.** 남은 메시지는 원래 오프셋 그대로이고, 사이에 빈 번호가 생길 뿐이다.
- **순서는 그대로다.** 남은 메시지끼리의 순서는 쓴 순서다.
- **지금 쓰고 있는 활성 세그먼트는 손대지 않는다.** 그래서 최근 메시지에는 같은 키의 옛 값이 섞여 있을 수 있다.

## 직접 해 보기 1: 정리 전후
기본 설정으로는 정리가 언제 일어날지 알기 어려우므로, 세그먼트를 1초마다 닫고(`segment.ms`), 조금만 쌓여도 정리하게(`min.cleanable.dirty.ratio=0.01`, 기본 0.5) 하고, 클리너가 0.5초마다 일감을 찾게 한다. 툼스톤을 남겨 두는 시간(`delete.retention.ms`, 기본 1일)은 3초로 줄였다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'log.cleaner.backoff.ms=500' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
kafka-topics.sh --bootstrap-server $K --create --topic profiles --partitions 1 --replication-factor 1 \
  --config cleanup.policy=compact --config segment.ms=1000 --config min.cleanable.dirty.ratio=0.01 \
  --config delete.retention.ms=3000 > /dev/null
put() {   # 키:값을 쓴다. 값 자리에 NULL을 쓰면 값이 없는 메시지(툼스톤)가 된다
  printf '%s\n' "$@" | kafka-console-producer.sh --bootstrap-server $K --topic profiles \
    --reader-property parse.key=true --reader-property key.separator=: --reader-property null.marker=NULL
}
show() {  # 처음부터 읽어 오프셋, 키, 값을 보여 준다
  kafka-console-consumer.sh --bootstrap-server $K --topic profiles --from-beginning --timeout-ms 4000 \
    --formatter-property print.offset=true --formatter-property print.key=true \
    --formatter-property key.separator=' ' 2>/dev/null
}
put minji:seoul sora:busan minji:daegu jun:incheon sora:jeju minji:gwangju jun:NULL
show
```
```text
Offset:0 minji seoul
Offset:1 sora busan
Offset:2 minji daegu
Offset:3 jun incheon
Offset:4 sora jeju
Offset:5 minji gwangju
Offset:6 jun null
```
사용자 셋이 사는 곳을 바꿔 온 기록이다. `minji`는 세 번, `sora`는 두 번 바뀌었고, `jun`은 마지막에 값이 없는 메시지(**툼스톤**)로 "이 키를 지워라"가 되었다. 아직 모두 활성 세그먼트에 있어 정리되지 않았다. 1초가 지난 뒤 메시지를 하나 더 쓰면, 그 순간 세그먼트가 닫히고 새 세그먼트가 열린다. 클리너가 닫힌 세그먼트를 정리했는지는 브로커가 정리한 위치를 적어 두는 `cleaner-offset-checkpoint` 파일로 확인한다.
```bash
sleep 1.5; put hana:ulsan
ls kafka-data/profiles-0 | grep '\.log$'
until grep -q 'profiles 0 7' kafka-data/cleaner-offset-checkpoint; do sleep 0.5; done
show
```
```text
00000000000000000000.log
00000000000000000007.log
Offset:4 sora jeju
Offset:5 minji gwangju
Offset:6 jun null
Offset:7 hana ulsan
```
- 오프셋 0~6이 든 세그먼트가 닫히고, 클리너가 그것을 7 앞까지 정리했다.
- `minji`와 `sora`는 마지막 값(오프셋 5, 4)만 남았다. 오프셋은 원래 번호 그대로이고 0~3은 빈 번호가 되었다.
- `jun`의 옛 값(오프셋 3)은 사라졌지만, 툼스톤(오프셋 6)은 **아직 남아 있다**. 지금 읽는 컨슈머들이 "jun이 지워졌다"는 사실을 알아야 하기 때문이다. 툼스톤은 `delete.retention.ms`가 지난 뒤의 정리에서 지워진다.

툼스톤의 보존 시간이 지나기를 기다렸다가 한 번 더 쓴다. 다시 세그먼트가 닫히고 정리가 돈다.
```bash
sleep 4; put hana:suwon
until grep -q 'profiles 0 8' kafka-data/cleaner-offset-checkpoint; do sleep 0.5; done
show
```
```text
Offset:4 sora jeju
Offset:5 minji gwangju
Offset:7 hana ulsan
Offset:8 hana suwon
```
툼스톤까지 지워져 `jun`은 흔적이 없다. 그런데 `hana`의 옛 값 `ulsan`은 남아 있다. 새 값 `suwon`이 아직 활성 세그먼트에 있어서, 클리너가 그것을 보지 않고 정리했기 때문이다. 컴팩션은 "키마다 정확히 하나"가 아니라 "**적어도 마지막 값은 남는다**"를 약속한다.

## 직접 해 보기 2: 토픽에서 상태 되살리기
컴팩션된 토픽은 처음부터 끝까지 읽어 키마다 덮어쓰면 지금 상태가 된다. 서비스가 재시작할 때 메모리 캐시를 이렇게 다시 채운다. 툼스톤을 만나면 키를 지운다.
```python
from confluent_kafka import Consumer, TopicPartition

c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': 'rebuild', 'enable.auto.commit': False})
tp = TopicPartition('profiles', 0, 0)                 # 커밋된 위치와 상관없이 늘 처음부터
low, high = c.get_watermark_offsets(tp)               # 지금의 끝까지만 읽는다
c.assign([tp])
state = {}
while high > 0:
    msg = c.poll(5)
    if msg is None or msg.error():
        continue
    key = msg.key().decode()
    if msg.value() is None:
        state.pop(key, None)                          # 툼스톤: 키를 지운다
    else:
        state[key] = msg.value().decode()
    if msg.offset() + 1 >= high:
        break
c.close()
print(dict(sorted(state.items())))
```
```text
{'hana': 'suwon', 'minji': 'gwangju', 'sora': 'jeju'}
```
남아 있던 `hana`의 옛 값은 뒤의 새 값으로 덮여, 결과에는 마지막 값만 들어갔다. 이 방법은 남은 메시지가 적을수록 빠르다. 컴팩션이 없으면 사용자가 주소를 바꾼 역사 전체를 매번 다시 읽어야 한다.

## 어디에 쓰나
- **컨슈머 그룹의 오프셋**: 7편에서 커밋한 위치가 기록되는 `__consumer_offsets`가 바로 컴팩션 토픽이다. 키는 "그룹, 토픽, 파티션"이고, 그룹마다 마지막으로 커밋한 위치만 남으면 된다.
```bash
kafka-configs.sh --bootstrap-server $K --entity-type topics --entity-name __consumer_offsets --describe \
  | grep -o 'cleanup.policy=[a-z]*' | head -1
kafka-server-stop.sh > /dev/null
```
```text
cleanup.policy=compact
```
- **상태 저장소의 변경 기록**: 12편의 카프카 스트림즈는 집계 결과 같은 상태를 로컬 저장소에 두고, 그 변경을 컴팩션 토픽에 기록해 두었다가 장애 뒤에 되살린다.
- **변경 데이터 캡처**(CDC): 데이터베이스의 행 변경을 기본 키를 키로 써서 토픽에 흘리면, 컴팩션 토픽이 테이블의 최신 사본 역할을 한다.

## 흔한 오해
- "컴팩션 토픽에는 키마다 메시지가 정확히 하나 있다": 활성 세그먼트와 아직 정리되지 않은 부분에는 옛 값이 섞여 있다. 읽는 쪽은 같은 키가 여러 번 나와도 마지막 것으로 덮어써야 한다.
- "값을 지우려면 메시지를 지워야 한다": 메시지는 지울 수 없다. 같은 키로 값이 없는 툼스톤을 쓴다.
- "툼스톤은 바로 사라진다": `delete.retention.ms`(기본 1일) 동안 남는다. 그보다 오래 멈춰 있다가 처음부터 다시 읽는 컨슈머는 지워진 것을 모르고 옛 값을 가진 채 남을 수 있다.

## 어디에 쓰이나
- Redis 실무 7편 「영속성: RDB 스냅숏과 AOF」: 명령을 덧붙이는 AOF가 커지면 지금 상태만 남기도록 다시 쓰는 것이 컴팩션과 같은 생각이다.
- PostgreSQL 실무 10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」: 같은 행의 옛 버전을 뒤에서 치우는 VACUUM이 클리너에 해당한다.
- Redis 실무 4편 「캐시로 쓰기: 캐시 어사이드, TTL, 메모리 정책」: 컴팩션 토픽으로 재시작한 서비스의 캐시를 다시 채우는 일을, 캐시를 채우고 비우는 일반적인 방법과 함께 본다.

## 정리
- `cleanup.policy=compact`는 시간이 아니라 키를 기준으로 정리해, 키마다 마지막 값을 남긴다.
- 오프셋과 순서는 그대로이고, 활성 세그먼트는 정리하지 않으므로 "적어도 마지막 값"이 남는다.
- 툼스톤(값이 없는 메시지)은 키를 지우는 표시이고, `delete.retention.ms`가 지나면 함께 지워진다.
- 컴팩션 토픽을 처음부터 읽으면 지금 상태를 되살릴 수 있다. 오프셋 저장, 상태 저장소, CDC가 이것을 쓴다.

## 더 알아보기
- 이전 글: 9편 「KRaft: ZooKeeper 없이 메타데이터 관리하기」
- 다음 글: 11편 「트랜잭션: 읽고 처리하고 쓰기를 한 번에」
