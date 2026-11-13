# [카프카 이벤트 스트리밍 6/12] 컨슈머 그룹: 나눠 읽기와 리밸런스

> **한 줄 요약** — 같은 그룹 ID를 쓰는 컨슈머들은 토픽의 파티션을 나눠 맡고(파티션 하나는 그룹 안의 컨슈머 하나만), 컨슈머가 들어오거나 나가거나 응답이 끊기면 그룹 코디네이터가 파티션을 다시 나누는 리밸런스를 하며, 파티션보다 많은 컨슈머는 놀게 된다.

## 이 글에서 다루는 것
- 그룹 안에서 파티션 나누기의 규칙
- 그룹 코디네이터, 하트비트, 세션 시간 제한
- 리밸런스가 일어나는 세 가지 경우
- 직접 해 보기: 컨슈머를 하나씩 늘리고, 하나를 죽여 보기
- `max.poll.interval.ms`의 함정과 새 리밸런스 프로토콜

## 나눠 읽기의 규칙
1편에서 서로 다른 그룹은 같은 이벤트를 각자 다 읽었다. 같은 그룹 안에서는 반대로 **나눠** 읽는다. 배송 처리 서비스를 서버 세 대로 띄우면, 세 대가 같은 그룹 ID(`shipping`)로 주문 토픽을 구독하고 파티션을 나눠 맡는다. 규칙은 단순하다.
- 파티션 하나는 그룹 안에서 **컨슈머 하나**만 읽는다. 그래서 파티션 안의 순서(3편)가 그룹에서도 지켜진다.
- 컨슈머 하나는 파티션을 여러 개 맡을 수 있다.
- 컨슈머가 파티션보다 많으면 남는 컨슈머는 **아무것도 받지 못한다**. 처리를 더 나누고 싶으면 파티션부터 늘려야 한다.

## 그룹 코디네이터와 하트비트
브로커 중 하나가 그룹마다 **그룹 코디네이터**를 맡는다. 컨슈머는 코디네이터에 가입하고, 주기적으로 **하트비트**를 보내 살아 있음을 알린다. 코디네이터는 가입한 멤버 목록을 보고 파티션을 나눈다. 다음 경우에 **리밸런스**(rebalance, 다시 나누기)가 일어난다.
- 새 컨슈머가 들어왔을 때.
- 컨슈머가 정상적으로 떠났을 때(닫으면서 탈퇴를 알린다).
- 컨슈머가 `session.timeout.ms` 동안 하트비트를 보내지 않았거나, `max.poll.interval.ms` 동안 새 메시지를 가져가지 않았을 때(죽었거나 멈춘 것으로 본다).

## 직접 해 보기: 컨슈머를 늘리고 죽이기
파티션 4개짜리 토픽에 같은 그룹의 컨슈머를 하나씩 늘린다. 실습이라 브로커가 그룹의 첫 리밸런스를 미루는 시간(`group.initial.rebalance.delay.ms`, 기본 3초)을 0으로 줄였다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'group.initial.rebalance.delay.ms=0' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic orders --partitions 4 --replication-factor 1 > /dev/null
```
컨슈머는 이름을 받아 `client.id`로 쓰고, 계속 메시지를 가져가는(poll) 작은 프로그램이다. 세션 시간 제한을 6초로 줄였다.
```python
# 파일: worker.py
import sys
from confluent_kafka import Consumer

c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': 'shipping',
              'client.id': sys.argv[1], 'auto.offset.reset': 'earliest',
              'session.timeout.ms': 6000, 'heartbeat.interval.ms': 1000})
c.subscribe(['orders'])
while True:
    c.poll(0.5)            # 메시지를 가져가며 그룹에 살아 있음을 알린다
```
그룹의 멤버와 각자 맡은 파티션 수는 `kafka-consumer-groups.sh --describe --members`로 본다. 멤버 수가 기대한 만큼이 되고 리밸런스가 끝날 때까지 기다렸다가 출력하는 함수를 만든다.
```bash
members() {   # 멤버 수를 받아, 그만큼 모이고 파티션이 모두 배정될 때까지 기다린 뒤 보여 준다
  until kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group shipping --members 2>/dev/null \
      | awk -v n="$1" '$1 == "shipping" { m++; p += $5 } END { exit !(m == n && p == 4) }'; do sleep 0.5; done
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group shipping --members 2>/dev/null \
    | awk '$1 == "shipping" { printf "%s:%s ", $4, $5 }' | tr ' ' '\n' | sort | tr '\n' ' '; echo
}
python3 worker.py w1 & W1=$!
echo "1명: $(members 1)"
python3 worker.py w2 & W2=$!
echo "2명: $(members 2)"
python3 worker.py w3 & python3 worker.py w4 & python3 worker.py w5 &
echo "5명: $(members 5)"
```
```text
1명: w1:4 
2명: w1:2 w2:2 
5명: w1:… w2:… w3:… w4:… w5:… 
```
혼자일 때 w1이 파티션 4개를 모두 맡았고, w2가 들어오자 둘로 나뉘었다. 다섯 명이 되자 넷이 하나씩 맡고 한 명은 0개다(누가 노는지는 매번 달라 가렸다). 노는 컨슈머가 무조건 쓸모없는 것은 아니다. 다른 컨슈머가 죽으면 대신 받을 대기 인원이 된다.
```bash
python3 - <<'EOF'
import subprocess
out = subprocess.run(['kafka-consumer-groups.sh', '--bootstrap-server', 'localhost:9092', '--describe',
                      '--group', 'shipping', '--members'], capture_output=True, text=True).stdout
counts = sorted(int(line.split()[4]) for line in out.splitlines() if line.startswith('shipping'))
print('맡은 파티션 수:', counts)
EOF
```
```text
맡은 파티션 수: [0, 1, 1, 1, 1]
```
이제 w2를 **갑자기** 죽인다(`kill -9`). 정상적으로 닫으면 탈퇴를 알리지만, 죽은 프로세스는 말이 없다. 코디네이터는 하트비트가 6초(`session.timeout.ms`) 동안 끊긴 뒤에야 알아채고 리밸런스한다.
```bash
start=$(date +%s); { kill -9 $W2; wait $W2; } 2>/dev/null
echo "w2를 죽인 뒤: $(members 4)"
echo "다시 나뉘기까지 5초 넘게 걸렸다: $(( $(date +%s) - start >= 5 ))"
kafka-server-stop.sh > /dev/null 2>&1
```
```text
w2를 죽인 뒤: w1:1 w3:1 w4:1 w5:1 
다시 나뉘기까지 5초 넘게 걸렸다: 1
```
w2가 맡고 있던 파티션은 놀던 컨슈머에게 넘어가, 남은 넷이 하나씩 맡았다. 그 몇 초 동안 w2의 파티션은 아무도 읽지 않았다. 세션 시간 제한을 짧게 하면 빨리 알아채지만, 잠깐의 네트워크 지연이나 긴 가비지 컬렉션에도 멀쩡한 컨슈머를 쫓아내 불필요한 리밸런스가 잦아진다. 기본값은 45초다.

## max.poll.interval.ms의 함정
하트비트는 클라이언트의 별도 스레드가 보내므로, 처리 코드가 멈춰 있어도 하트비트는 계속 갈 수 있다. 그래서 카프카는 또 하나의 기준을 둔다. `max.poll.interval.ms`(기본 5분) 동안 `poll()`을 다시 부르지 않으면 "처리가 멈췄다"고 보고 그룹에서 내보낸다. 메시지 하나 처리에 오래 걸리는 작업을 한 번에 많이 가져오면, 처리하는 동안 이 기한을 넘겨 쫓겨나고, 다시 들어와 같은 메시지를 또 가져오고, 또 쫓겨나는 **리밸런스 반복**에 빠진다. 한 번에 가져오는 양(`max.poll.records`)을 줄이거나, 오래 걸리는 처리는 별도의 작업 큐로 넘긴다(웹 앱의 원리 14편).

## 리밸런스의 비용과 새 프로토콜
전통적인 리밸런스는 그룹 전체가 파티션을 모두 내려놓고 다시 받는 방식이라, 그동안 그룹 전체가 멈췄다. 이를 줄이려고 옮겨 갈 파티션만 내놓는 협력적(cooperative) 방식이 나왔고, 카프카 4.0에서는 배정을 브로커가 계산하고 멤버별로 점진적으로 적용하는 새 컨슈머 그룹 프로토콜(KIP-848)이 정식 기능이 되었다. 클라이언트에서 `group.protocol=consumer`로 켠다. 어느 방식이든 리밸런스는 공짜가 아니므로, 컨슈머를 자주 껐다 켜지 않고(배포할 때 한꺼번에가 아니라 차례로), 세션 시간 제한을 적당히 둔다.

## 흔한 오해
- "컨슈머를 늘리면 처리량이 늘어난다": 파티션 수까지만이다. 그 이상은 논다.
- "컨슈머가 죽으면 그 파티션은 바로 다른 컨슈머가 읽는다": 세션 시간 제한이 지나야 알아챈다. 그동안 그 파티션의 지연(lag)이 쌓인다.
- "하트비트가 가면 정상이다": 처리가 멈춰도 하트비트는 갈 수 있다. `max.poll.interval.ms`가 그 경우를 잡는다.

## 어디에 쓰이나
- Redis 실무 6편 「메시징: Pub/Sub과 스트림」: Redis 스트림의 컨슈머 그룹은 메시지 단위로 나누고, 카프카는 파티션 단위로 나눈다. 비교하면 차이가 분명해진다.
- Nginx 웹 서버 6편 「로드 밸런싱: upstream, 분배 방식, 장애 서버 빼기」: 일을 여러 처리기에 나누고 죽은 처리기를 빼는 문제를 반대 방향(요청을 밀어 넣기)에서 본다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 처리 속도가 따라가지 못할 때 지연이 쌓이고, 반복되는 재시작이 일을 더 늘리는 연쇄 장애의 모양이 리밸런스 반복과 같다.

## 정리
- 같은 그룹의 컨슈머는 파티션을 나눠 맡고, 파티션 하나는 컨슈머 하나만 읽는다. 컨슈머가 파티션보다 많으면 남는 쪽은 논다.
- 그룹 코디네이터가 하트비트로 멤버를 지켜보고, 가입·탈퇴·시간 초과 때 리밸런스한다.
- 갑자기 죽은 컨슈머는 `session.timeout.ms`가 지나야 알아챈다. 처리가 멈춘 컨슈머는 `max.poll.interval.ms`가 잡는다.
- 리밸런스는 비용이다. 협력적 방식과 새 프로토콜(KIP-848)이 그 비용을 줄인다.

## 더 알아보기
- 이전 글: 5편 「프로듀서: acks, 배치, 압축, 멱등성」
- 다음 글: 7편 「오프셋 커밋과 전달 보장: 최대 한 번, 적어도 한 번, 정확히 한 번」
