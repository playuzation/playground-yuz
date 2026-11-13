# [카프카 이벤트 스트리밍 7/12] 오프셋 커밋과 전달 보장: 최대 한 번, 적어도 한 번, 정확히 한 번

> **한 줄 요약** — 컨슈머가 "어디까지 처리했다"는 오프셋을 처리 전에 커밋하면 죽었을 때 메시지를 잃고(최대 한 번), 처리 후에 커밋하면 다시 처리하게 되며(적어도 한 번), 결과와 오프셋을 한 트랜잭션으로 함께 저장하거나 처리를 멱등하게 만들어야 결과가 정확히 한 번 반영된다.

## 이 글에서 다루는 것
- 커밋은 "다음에 읽을 위치"를 적어 두는 일
- 자동 커밋과 수동 커밋
- 직접 해 보기: 처리 전에 커밋하고 죽기, 처리 후에 커밋하기 전에 죽기
- 정확히 한 번을 만드는 세 가지 방법
- 직접 해 보기: 결과와 오프셋을 같은 DB 트랜잭션에 저장하기

## 커밋이란
4편에서 본 것처럼 컨슈머 그룹은 파티션마다 "다음에 읽을 오프셋"을 카프카에 기록해 둔다. 이를 **커밋**이라고 하고, 기록은 브로커 안의 특별한 토픽 `__consumer_offsets`에 남는다. 컨슈머가 다시 시작하거나, 리밸런스(6편)로 파티션이 다른 컨슈머에게 넘어가면 새 담당자는 커밋된 위치부터 읽는다. 그래서 **언제 커밋하느냐**가 장애 때 무엇이 빠지고 무엇이 겹치는지를 정한다.
- **자동 커밋**(`enable.auto.commit=true`, 기본값): 클라이언트가 일정 간격(`auto.commit.interval.ms`, 기본 5초)마다, 이미 받아 간 메시지의 위치를 알아서 커밋한다. 편하지만 커밋 시점이 처리와 상관없다.
- **수동 커밋**: 자동 커밋을 끄고, 코드가 원하는 시점에 `commit()`을 부른다. 기다리는 동기 커밋과 기다리지 않는 비동기 커밋이 있다.

## 직접 해 보기: 언제 커밋하느냐에 따라
결제 메시지 `p1`~`p6`을 넣고, 같은 컨슈머 코드를 두 방식으로 돌린다. 둘 다 `p3`에서 프로세스가 갑자기 죽는다(`os._exit`). 처리는 파일에 한 줄 적는 것으로 흉내 낸다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'group.initial.rebalance.delay.ms=0' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
kafka-topics.sh --bootstrap-server $K --create --topic payments --partitions 1 --replication-factor 1 > /dev/null
printf '%s\n' p1 p2 p3 p4 p5 p6 | kafka-console-producer.sh --bootstrap-server $K --topic payments
```
```python
# 파일: consume.py
import os, sys
from confluent_kafka import Consumer

mode, crash_at = sys.argv[1], sys.argv[2]           # crash_at 메시지에서 죽는다('-'면 끝까지)
c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': mode,
              'enable.auto.commit': False, 'auto.offset.reset': 'earliest',
              'session.timeout.ms': 6000})
c.subscribe(['payments'])
while True:
    msg = c.poll(1)
    if msg is None:
        continue
    v = msg.value().decode()
    if mode == 'at-most-once':
        c.commit(message=msg, asynchronous=False)    # 먼저 커밋하고
        if v == crash_at: os._exit(1)                # (여기서 죽으면)
        open(f'{mode}.txt', 'a').write(v + '\n')     # 처리한다
    else:
        open(f'{mode}.txt', 'a').write(v + '\n')     # 먼저 처리하고
        if v == crash_at: os._exit(1)                # (여기서 죽으면)
        c.commit(message=msg, asynchronous=False)    # 커밋한다
    if v == 'p6':
        break
c.close()
```
`commit(message=msg)`는 그 메시지의 다음 오프셋을 커밋한다. 각 방식으로 한 번 죽고, 다시 시작해 끝까지 처리한 뒤 무엇이 처리되었는지 본다.
```bash
for mode in at-most-once at-least-once; do
  python3 consume.py $mode p3
  python3 consume.py $mode -
  echo "$mode: $(tr '\n' ' ' < $mode.txt)"
done
```
```text
at-most-once: p1 p2 p4 p5 p6 
at-least-once: p1 p2 p3 p3 p4 p5 p6 
```
- **처리 전에 커밋**: `p3`의 위치까지 커밋한 뒤 처리하기 전에 죽었다. 다시 시작한 컨슈머는 `p4`부터 읽었고, `p3`은 **영영 처리되지 않았다**. 메시지가 최대 한 번 처리되는 **최대 한 번**(at-most-once)이다.
- **처리 후에 커밋**: `p3`을 처리한 뒤 커밋하기 전에 죽었다. 커밋된 위치는 `p3` 앞이라, 다시 시작한 컨슈머가 `p3`을 **또 처리했다**. 빠지는 것은 없지만 겹칠 수 있는 **적어도 한 번**(at-least-once)이다.

두 번째 실행은 6초쯤 기다린 뒤에 시작된다. 죽은 컨슈머가 그룹에서 빠지려면 세션 시간 제한(6편)이 지나야 하기 때문이다.

실무의 기본은 **적어도 한 번**이다. 잃는 것보다 겹치는 것이 다루기 쉽기 때문이다. 자동 커밋은 둘 다 일어날 수 있다. 받아 간 메시지를 처리하기 전에 5초 주기가 돌아오면 처리 전 커밋이 되고, 처리했지만 다음 주기 전에 죽으면 최대 5초 치를 다시 처리한다. 자바 클라이언트의 자동 커밋은 다음 `poll()` 때 이전에 받은 것까지 커밋하므로, 받은 메시지를 다음 `poll()` 전에 다 처리하면 적어도 한 번이 된다. 받은 메시지를 다른 스레드에 넘기고 바로 다음 `poll()`을 부르면 잃을 수 있다.

## 정확히 한 번은 어떻게
메시지 하나가 결과에 **정확히 한 번**(exactly-once) 반영되게 하려면 "처리했다"와 "커밋했다"가 따로 일어나는 틈을 없애야 한다. 방법은 세 가지다.
- **멱등한 처리**: 다시 처리해도 결과가 같게 만든다. 결제 ID를 기본 키로 두고 `INSERT … ON CONFLICT DO NOTHING`처럼 이미 있으면 건너뛰거나, "잔액에 더하기" 대신 "상태를 결제 완료로 바꾸기"처럼 덮어써도 같은 연산을 쓴다. 가장 흔하고 단순하다.
- **결과와 오프셋을 함께 저장**: 결과를 쓰는 DB에 오프셋도 같이 쓰고, 둘을 한 트랜잭션으로 묶는다. 시작할 때는 카프카의 커밋 대신 DB에 적힌 위치부터 읽는다. 아래에서 해 본다.
- **카프카 트랜잭션**: 결과도 카프카 토픽에 쓰는 "읽고 처리하고 쓰기"라면, 결과 쓰기와 오프셋 커밋을 카프카 트랜잭션 하나로 묶는다(11편).

## 직접 해 보기: 결과와 오프셋을 한 트랜잭션에
SQLite 파일에 처리 결과(`done`)와 다음에 읽을 위치(`pos`)를 함께 저장한다. 그룹에 가입하지 않고 파티션을 직접 지정(`assign`)해, DB에 적힌 오프셋부터 읽는다.
```python
# 파일: ledger.py
import os, sqlite3, sys
from confluent_kafka import Consumer, TopicPartition

crash_at = sys.argv[1]
db = sqlite3.connect('ledger.db', isolation_level=None)   # BEGIN과 COMMIT을 직접 쓴다
db.execute('CREATE TABLE IF NOT EXISTS done (value TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS pos (part INTEGER PRIMARY KEY, next INTEGER)')
row = db.execute('SELECT next FROM pos WHERE part = 0').fetchone()
c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': 'ledger', 'enable.auto.commit': False})
c.assign([TopicPartition('payments', 0, row[0] if row else 0)])   # 위치는 DB에서 가져온다
while True:
    msg = c.poll(1)
    if msg is None:
        continue
    v = msg.value().decode()
    db.execute('BEGIN')
    db.execute('INSERT INTO done VALUES (?)', (v,))
    if v == crash_at: os._exit(1)                   # 트랜잭션 도중에 죽으면 둘 다 없던 일이 된다
    db.execute('INSERT OR REPLACE INTO pos VALUES (0, ?)', (msg.offset() + 1,))
    db.execute('COMMIT')                            # 결과와 위치가 함께 저장된다
    if v == 'p6':
        break
c.close()
```
```bash
python3 ledger.py p3
python3 ledger.py -
python3 - <<'EOF'
import sqlite3
db = sqlite3.connect('ledger.db')
print('처리한 것:', ' '.join(v for (v,) in db.execute('SELECT value FROM done')))
print('DB에 적힌 다음 위치:', db.execute('SELECT next FROM pos').fetchone()[0])
EOF
kafka-server-stop.sh > /dev/null 2>&1
```
```text
처리한 것: p1 p2 p3 p4 p5 p6
DB에 적힌 다음 위치: 6
```
`p3`을 넣던 트랜잭션은 커밋 전에 죽어 결과와 위치가 함께 사라졌고, 다시 시작한 컨슈머는 DB에 남은 위치(`p3`의 오프셋 2)부터 읽었다. 빠지지도 겹치지도 않았다. 카프카에는 아무것도 커밋하지 않았다는 점에 주의한다. 위치의 진실은 DB에 있으므로, `kafka-consumer-groups.sh`로 보는 지연(lag)은 따로 커밋해 주지 않으면 맞지 않는다.

이것이 "정확히 한 번"의 정확한 뜻이다. 메시지가 네트워크를 정확히 한 번 지나가는 것이 아니라, 다시 읽고 다시 처리하더라도 **결과에는 한 번만 반영되는 것**이다. 메일 보내기나 외부 결제 API 호출처럼 되돌릴 수 없고 트랜잭션에 묶을 수 없는 부작용은 이 방법으로도 막을 수 없다. 그런 곳은 상대 쪽이 멱등 키를 받아 주어야 한다(웹 앱의 원리 14편).

## 흔한 오해
- "카프카를 쓰면 메시지가 정확히 한 번 처리된다": 기본은 적어도 한 번이다. 정확히 한 번은 처리 쪽의 설계로 만든다.
- "자동 커밋이면 안전하다": 커밋 시점이 처리와 무관해, 잃을 수도 있고 겹칠 수도 있다.
- "커밋은 메시지마다 해야 한다": 동기 커밋을 메시지마다 하면 느리다. 묶음을 처리한 뒤 한 번 커밋하는 것이 보통이고, 그만큼 겹칠 수 있는 양이 늘어나는 교환이다.

## 어디에 쓰이나
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 작업 큐에서도 같은 세 가지 보장이 나오고, 겹침은 멱등 키로 다룬다.
- PostgreSQL 실무 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」: 결과와 오프셋을 함께 묶는 트랜잭션이 무엇을 보장하는지 본다.
- Redis 실무 6편 「메시징: Pub/Sub과 스트림」: 스트림의 `XACK`도 처리 뒤에 확인하는 적어도 한 번 방식이다.

## 정리
- 커밋은 그룹이 다음에 읽을 오프셋을 기록하는 일이다. 언제 커밋하느냐가 장애 때의 결과를 정한다.
- 처리 전 커밋은 최대 한 번(잃을 수 있음), 처리 후 커밋은 적어도 한 번(겹칠 수 있음)이다. 기본은 적어도 한 번이다.
- 정확히 한 번은 멱등한 처리, 결과와 오프셋을 한 트랜잭션에 저장하기, 카프카 트랜잭션(11편)으로 만든다.
- 되돌릴 수 없는 외부 부작용은 상대 쪽의 멱등 키가 필요하다.

## 더 알아보기
- 이전 글: 6편 「컨슈머 그룹: 나눠 읽기와 리밸런스」
- 다음 글: 8편 「복제와 장애 조치: 리더, 팔로워, ISR」
