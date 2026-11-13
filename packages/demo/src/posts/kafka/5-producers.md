# [카프카 이벤트 스트리밍 5/12] 프로듀서: acks, 배치, 압축, 멱등성

> **한 줄 요약** — 프로듀서는 메시지를 바로 보내지 않고 파티션별 묶음(배치)에 모았다가 압축해 한 번에 보내며, `acks`로 "몇 개의 복제본이 받았을 때 성공으로 볼지"를 정하고, 재시도로 생기는 중복은 브로커가 프로듀서 ID와 순번으로 걸러 내는 멱등 프로듀서로 막는다.

## 이 글에서 다루는 것
- 보내기는 비동기다: 전달 보고(delivery report)와 `flush`
- 배치: `linger.ms`와 묶음 크기, 요청 수가 줄어드는 장면
- 압축: 묶음 단위로 줄이기
- `acks`: 0, 1, all
- 재시도와 멱등 프로듀서: 프로듀서 ID와 순번

## 보내기는 비동기다
이 시리즈의 파이썬 예제는 C 라이브러리 librdkafka를 감싼 `confluent-kafka` 클라이언트(`pip install confluent-kafka`)를 쓴다. 자바 클라이언트와 설정 이름이 대부분 같다. `produce()`는 메시지를 클라이언트 안의 버퍼에 넣고 바로 돌아온다. 실제 전송은 뒤에서 일어나고, 결과는 **전달 보고**로 알려 준다. 프로그램이 끝나기 전에는 `flush()`로 버퍼가 비워질 때까지 기다려야 한다. 그러지 않으면 보냈다고 생각한 메시지가 버퍼에 남은 채 사라진다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
for t in orders plain packed safe; do
  kafka-topics.sh --bootstrap-server localhost:9092 --create --topic $t --partitions 1 --replication-factor 1 > /dev/null
done
```
```python
from confluent_kafka import Producer

p = Producer({'bootstrap.servers': 'localhost:9092'})

def report(err, msg):                       # 전송 결과가 정해지면 불린다
    if err:
        print('실패:', err)
    else:
        print(f'전달됨: {msg.key().decode()} → 파티션 {msg.partition()}, 오프셋 {msg.offset()}')

for i, item in enumerate(['coffee', 'tea', 'cake']):
    p.produce('orders', key=f'order-{i}', value=item, callback=report)
print('produce()는 이미 돌아왔다. 아직 보고는 없다.')
p.flush()                                   # 모두 전달될 때까지 기다리며 보고를 부른다
```
```text
produce()는 이미 돌아왔다. 아직 보고는 없다.
전달됨: order-0 → 파티션 0, 오프셋 0
전달됨: order-1 → 파티션 0, 오프셋 1
전달됨: order-2 → 파티션 0, 오프셋 2
```
전달 보고는 `flush()`나 `poll()`을 부를 때 실행된다. 실제 서비스에서는 보고에서 실패를 기록하고 경보를 걸어야, 조용히 사라진 메시지를 알아챌 수 있다.

## 배치와 압축
프로듀서는 파티션마다 메시지를 묶음(배치)에 모았다가 한 번의 요청으로 보낸다. `linger.ms`는 "묶음을 채우려고 최대 얼마나 기다릴지"다. 0이면 거의 바로 보내고, 몇 ms~수십 ms를 주면 묶음이 커져 요청 수가 크게 준다. 압축(`compression.type`: gzip, snappy, lz4, zstd)은 묶음 단위로 하므로 묶음이 클수록 잘 줄어든다. 같은 JSON 메시지 2만 개를 두 방식으로 보내고, 보낸 요청 수(클라이언트 통계)와 디스크에 저장된 크기를 비교한다.
```python
import json, time
from confluent_kafka import Producer

MSG = json.dumps({'user': 'minji', 'item': 'coffee', 'price': 4500, 'note': 'no sugar please'}).encode()

def send(topic, conf):
    stats = {}
    p = Producer({'bootstrap.servers': 'localhost:9092', 'statistics.interval.ms': 100,
                  'stats_cb': lambda s: stats.update(json.loads(s)), **conf})
    for _ in range(20_000):
        p.produce(topic, MSG)
        p.poll(0)
    p.flush(); time.sleep(0.3); p.poll(0)          # 마지막 통계를 받는다
    return sum(b['tx'] for b in stats['brokers'].values() if b['nodeid'] >= 0)

one_by_one = send('plain', {'linger.ms': 0, 'batch.num.messages': 1})
batched = send('packed', {'linger.ms': 50, 'compression.type': 'lz4'})
print('하나씩 보낼 때 요청 수:', '2만 번 이상' if one_by_one >= 20_000 else one_by_one)
print('묶어서 압축할 때 요청 수:', '10번 미만' if batched < 10 else batched)
```
```text
하나씩 보낼 때 요청 수: 2만 번 이상
묶어서 압축할 때 요청 수: 10번 미만
```
```bash
kafka-log-dirs.sh --bootstrap-server localhost:9092 --describe --topic-list plain,packed 2>/dev/null | tail -1 \
  | jq -r '.brokers[0].logDirs[0].partitions[] | "\(.partition): \(.size / 1e6 * 100 | round / 100) MB"' | sort -r
```
```text
plain-0: 2.94 MB
packed-0: 0.1 MB
```
하나씩 보내면 메시지마다 요청이 나가 2만 번 넘게 왕복했고, 묶어서 보내자 몇 번의 요청으로 끝났다. 디스크에도 압축된 묶음이 그대로 저장되어 30분의 1 크기다. 컨슈머도 압축된 묶음을 받아 스스로 푼다. 그래서 배치와 압축은 네트워크, 브로커 디스크, 복제 트래픽(8편)을 함께 줄인다. 대신 메시지 하나의 지연이 최대 `linger.ms`만큼 늘어난다. 처리량이 중요한 로그·이벤트는 길게, 지연이 중요한 요청은 짧게 잡는다.

## acks: 언제 성공으로 볼까
- `acks=0`: 보내고 응답을 기다리지 않는다. 가장 빠르지만 브로커가 받았는지조차 모른다.
- `acks=1`: 리더 브로커가 자기 로그에 쓰면 성공. 리더가 복제본에 넘기기 전에 죽으면 잃을 수 있다.
- `acks=all`(-1): 동기화된 복제본(ISR) 모두가 받으면 성공. 토픽의 `min.insync.replicas`(예: 2)와 함께 쓰면 "최소 두 곳에 기록되기 전에는 성공이라고 하지 않는다"가 된다. 최근 클라이언트의 기본값이다.

브로커가 하나인 지금은 차이가 드러나지 않는다. 8편에서 브로커 세 대로 리더를 죽여 보며 확인한다.

## 재시도와 멱등 프로듀서
네트워크 오류로 응답을 못 받으면 프로듀서는 같은 묶음을 다시 보낸다. 그런데 첫 전송이 실제로는 브로커에 도착해 기록되었고 응답만 사라졌다면(웹 앱의 원리 14편의 "응답이 사라진 순간"), 같은 메시지가 두 번 기록된다. **멱등 프로듀서**(`enable.idempotence=true`)는 이것을 막는다. 프로듀서는 시작할 때 브로커에게서 **프로듀서 ID**를 받고, 파티션마다 묶음에 0부터 늘어나는 **순번**(sequence)을 붙인다. 브로커는 이미 받은 순번의 묶음이 다시 오면 버리고, 순번이 건너뛰면 거절한다. 그래서 재시도해도 중복이 생기지 않고 순서도 지켜진다. 자바 클라이언트는 3.0부터 기본으로 켜져 있다. 켰을 때와 껐을 때 로그에 무엇이 남는지 본다.
```python
from confluent_kafka import Producer

for topic, idem in [('plain', False), ('safe', True)]:
    p = Producer({'bootstrap.servers': 'localhost:9092', 'enable.idempotence': idem})
    for i in range(3):
        p.produce(topic, f'm{i}')
    p.flush()
```
```bash
for t in plain safe; do
  kafka-dump-log.sh --files kafka-data/$t-0/00000000000000000000.log 2>/dev/null | grep 'baseOffset' | tail -1 \
    | grep -oE '(baseSequence|producerId): -?[0-9]+' | tr '\n' ' ' | sed "s/^/$t: /"; echo
done
kafka-server-stop.sh > /dev/null 2>&1
```
```text
plain: baseSequence: -1 producerId: -1 
safe: baseSequence: 0 producerId: … 
```
멱등을 끈 쪽은 프로듀서 ID와 순번이 없다(-1). 켠 쪽은 브로커가 준 프로듀서 ID와 순번 0이 묶음에 붙었다. 다만 멱등성은 **한 프로듀서 세션 안의 재시도**만 걸러 낸다. 앱이 같은 주문을 두 번 `produce()`하거나, 프로듀서가 재시작해 새 ID를 받은 뒤 다시 보내는 중복은 막지 못한다. 그런 중복은 메시지에 주문 ID 같은 업무 키를 넣어 받는 쪽에서 거르거나, 11편의 트랜잭션으로 다룬다.

## 흔한 오해
- "`produce()`가 오류 없이 돌아왔으니 전달된 것이다": 버퍼에 넣었을 뿐이다. 전달 보고를 확인하고, 끝내기 전에 `flush()`한다.
- "`acks=all`이면 절대 잃지 않는다": `min.insync.replicas`가 1이면 리더 하나만 받아도 "all"이 충족된다. 복제 수와 함께 정해야 한다(8편).
- "멱등 프로듀서면 중복이 전혀 없다": 같은 프로듀서 세션의 재시도만 막는다. 앱 수준의 중복과 재시작 뒤의 중복은 따로 다룬다.

## 어디에 쓰이나
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 응답이 사라진 순간의 중복을 요청 수준에서 막는 멱등 키와, 프로듀서 ID·순번은 같은 문제의 두 판이다.
- Redis 실무 9편 「성능과 메모리: 파이프라이닝, 큰 키, 느린 명령」: 왕복을 줄이려 명령을 묶어 보내는 파이프라이닝과 배치가 같은 생각이다.
- 웹 앱의 원리 17편 「작게 보내기: 압축, 코드 분할, 페이지네이션」: 반복되는 글자가 잘 줄어드는 이유와 압축 방식의 교환을 본다.

## 정리
- `produce()`는 버퍼에 넣고 바로 돌아온다. 전달 보고로 결과를 확인하고 `flush()`로 비운다.
- 배치(`linger.ms`)와 압축은 요청 수, 디스크, 복제 트래픽을 크게 줄이고 지연을 조금 늘린다.
- `acks`는 성공의 기준이다. `acks=all`과 `min.insync.replicas`를 함께 정한다.
- 멱등 프로듀서는 프로듀서 ID와 순번으로 재시도 중복을 막는다. 앱 수준의 중복은 따로 다룬다.

## 더 알아보기
- 이전 글: 4편 「오프셋과 보존: 읽어도 사라지지 않는 메시지」
- 다음 글: 6편 「컨슈머 그룹: 나눠 읽기와 리밸런스」
