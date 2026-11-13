# [카프카 이벤트 스트리밍 8/12] 복제와 장애 조치: 리더, 팔로워, ISR

> **한 줄 요약** — 파티션마다 복제본을 여러 브로커에 두고 그중 리더 하나가 읽기·쓰기를 맡으며, 리더를 제때 따라잡는 복제본 집합(ISR)이 모두 받은 메시지만 커밋된 것으로 보므로, 리더 브로커가 죽으면 컨트롤러가 ISR 안에서 새 리더를 골라 잃는 메시지 없이 이어 간다.

## 이 글에서 다루는 것
- 리더와 팔로워: 복제는 파티션 단위
- ISR과 하이 워터마크: "커밋되었다"의 뜻
- `acks=all`과 `min.insync.replicas`가 함께 하는 일
- 직접 해 보기: 브로커 셋에서 리더를 죽이고, 둘을 죽이고, 되살리기
- 깨끗하지 않은 리더 선출과 ELR

## 리더와 팔로워
토픽을 만들 때 정하는 **복제 계수**(replication factor)가 파티션마다 복사본을 몇 개 둘지다. 실무에서는 보통 3이다. 복사본들은 서로 다른 브로커에 놓이고, 그중 하나가 **리더**, 나머지는 **팔로워**다.
- 프로듀서와 컨슈머는 리더하고만 이야기한다(가까운 팔로워에서 읽는 설정도 있다).
- 팔로워는 컨슈머처럼 리더에게서 새 메시지를 가져와(fetch) 자기 로그에 똑같이 쓴다.
- 파티션마다 리더가 다르므로, 파티션이 여러 개면 리더 일이 브로커들에 나뉜다.

## ISR과 하이 워터마크
리더를 제때 따라잡고 있는 복제본(리더 자신 포함)의 집합을 **ISR**(in-sync replicas, 동기화된 복제본)이라고 한다. 팔로워가 `replica.lag.time.max.ms`(기본 30초) 동안 리더의 끝까지 따라오지 못하면 ISR에서 빠지고, 다시 따라잡으면 돌아온다.

ISR의 모든 복제본이 받은 위치를 **하이 워터마크**라고 하고(4편), 그 앞의 메시지를 **커밋되었다**고 한다. 컨슈머는 하이 워터마크까지만 읽는다. 리더만 가진 메시지는 리더가 죽으면 사라질 수 있으므로 아직 보여 주지 않는 것이다. 그래서 새 리더를 ISR 안에서 고르면 커밋된 메시지는 잃지 않는다.

5편의 `acks=all`은 "ISR 모두가 받으면 성공"이다. 그런데 ISR이 리더 하나로 줄어들면 리더 혼자 받아도 "모두"가 된다. 이를 막는 것이 토픽 설정 `min.insync.replicas`다. 2로 두면 ISR이 2개 미만일 때 `acks=all` 쓰기를 거절한다. 복제 계수 3, `min.insync.replicas=2`, `acks=all`이 흔한 조합이다. 브로커 하나가 죽어도 쓰기가 계속되고, 성공한 쓰기는 늘 두 곳 이상에 있다.

## 직접 해 보기: 리더를 죽여 보기
브로커 셋과, 메타데이터를 관리하는 컨트롤러 하나를 한 컴퓨터에 띄운다. 컨트롤러는 9편에서 자세히 보고, 실무에서는 컨트롤러도 셋을 둔다. 노드 0이 컨트롤러, 1~3이 브로커(포트 9092~9094)다.
```bash
export PATH="$PATH:/opt/kafka/bin" KAFKA_HEAP_OPTS="-Xmx512m -Xms512m"
CID=$(kafka-storage.sh random-uuid)
conf() {   # 노드 번호와 역할을 받아 설정 파일 내용을 만든다
  cat <<EOF
process.roles=$2
node.id=$1
controller.quorum.voters=0@localhost:9095
controller.listener.names=CONTROLLER
listener.security.protocol.map=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
log.dirs=$PWD/data$1
EOF
  if [ $2 = controller ]; then echo 'listeners=CONTROLLER://localhost:9095'
  else echo "listeners=PLAINTEXT://localhost:909$((1 + $1))"; fi
}
conf 0 controller > node0.properties
for n in 1 2 3; do conf $n broker > node$n.properties; done
for n in 0 1 2 3; do
  kafka-storage.sh format -t $CID -c node$n.properties > /dev/null
  (kafka-server-start.sh node$n.properties > node$n.log 2>&1 &)
done
K=localhost:9092,localhost:9093,localhost:9094
until kafka-topics.sh --bootstrap-server $K --create --if-not-exists --topic orders --config min.insync.replicas=2 \
    --replica-assignment 1:2:3,2:3:1,3:1:2 > /dev/null 2>&1; do sleep 1; done
state() {   # 파티션마다 리더, ISR, ELR을 보여 준다
  kafka-topics.sh --bootstrap-server $K --describe --topic orders 2>/dev/null | awk -F'\t' '$3 ~ /^Partition: / {
    gsub(/[A-Za-z]+: ?/, ""); printf "P%s 리더 %s | 복제본 %s | ISR %s%s\n", $3, $4, $5, $6, ($7 ? " | ELR " $7 : "") }'
}
state
```
```text
P0 리더 1 | 복제본 1,2,3 | ISR 1,2,3
P1 리더 2 | 복제본 2,3,1 | ISR 2,3,1
P2 리더 3 | 복제본 3,1,2 | ISR 3,1,2
```
`--replica-assignment`로 파티션마다 복제본을 놓을 브로커를 직접 정했다. 목록의 첫 번째가 **선호 리더**(preferred leader)다. 그래서 리더 일이 브로커 셋에 하나씩 나뉘었다. 복제 계수(3)와 `min.insync.replicas`(2)를 함께 정했다. 이제 파티션 0에 `acks=all`로 메시지 셋을 쓰는 작은 프로듀서를 만든다.
```python
# 파일: send.py
import sys
from confluent_kafka import Producer

acks, value = sys.argv[1], sys.argv[2]
p = Producer({'bootstrap.servers': 'localhost:9092,localhost:9093,localhost:9094',
              'acks': acks, 'retries': 0})       # 실패를 바로 보려고 재시도를 끈다
def report(err, msg):
    print(f'acks={acks} {value}:', f'실패 - {err.str()}' if err else f'성공, 오프셋 {msg.offset()}')
p.produce('orders', value, partition=0, callback=report)
p.flush(10)
```
```bash
for v in o1 o2 o3; do python3 send.py all $v; done
```
```text
acks=all o1: 성공, 오프셋 0
acks=all o2: 성공, 오프셋 1
acks=all o3: 성공, 오프셋 2
```
파티션 0의 리더인 브로커 1을 **갑자기** 죽인다(`pkill -KILL`로 강제 종료). 컨트롤러는 브로커의 하트비트가 `broker.session.timeout.ms`(기본 9초) 동안 끊기면 그 브로커를 빼고, 브로커 1이 리더였던 파티션에 ISR 안에서 새 리더를 정한다.
```bash
pkill -KILL -f 'kafka.Kafka node1.properties'
until state | grep -q '^P0 리더 2'; do sleep 0.5; done
state
echo "파티션 0에서 읽은 것: $(kafka-console-consumer.sh --bootstrap-server $K --topic orders --partition 0 \
  --offset earliest --timeout-ms 5000 2>/dev/null | tr '\n' ' ')"
```
```text
P0 리더 2 | 복제본 1,2,3 | ISR 2,3
P1 리더 2 | 복제본 2,3,1 | ISR 2,3
P2 리더 3 | 복제본 3,1,2 | ISR 3,2
파티션 0에서 읽은 것: o1 o2 o3 
```
- 파티션 0의 리더가 다음 복제본인 2로 바뀌었고, 브로커 1은 모든 ISR에서 빠졌다. 복제본 목록(어디에 놓을지)은 그대로다.
- 리더가 바뀌었어도 `acks=all`로 성공한 o1~o3은 모두 남아 있다. 성공의 기준이 "ISR 모두가 받았다"였으므로 새 리더도 이미 가지고 있었다.

## 두 대가 죽으면
브로커 2까지 죽인다. 이제 브로커 3만 남는다.
```bash
pkill -KILL -f 'kafka.Kafka node2.properties'
until state | grep -q '^P0 리더 3'; do sleep 0.5; done
state
python3 send.py all o4 2>/dev/null   # 죽은 브로커에 연결하지 못했다는 로그는 감춘다
python3 send.py 1 o5 2>/dev/null
```
```text
P0 리더 3 | 복제본 1,2,3 | ISR 3 | ELR 2
P1 리더 3 | 복제본 2,3,1 | ISR 3 | ELR 2
P2 리더 3 | 복제본 3,1,2 | ISR 3 | ELR 2
acks=all o4: 실패 - Broker: Not enough in-sync replicas
acks=1 o5: 성공, 오프셋 3
```
- 모든 파티션의 리더가 3이 되었고 ISR은 3 하나다. `min.insync.replicas=2`를 채우지 못하므로 `acks=all` 쓰기는 **거절**되었다. 성공했다고 답했다가 브로커 3마저 잃으면 그 메시지가 사라지기 때문이다. 내구성을 위해 가용성을 내준 것이다.
- `acks=1`은 리더 하나만 받으면 되므로 성공했다. 지금 브로커 3이 죽으면 o5는 잃는다.
- ELR(eligible leader replicas)은 카프카 4.x에 들어온 기능으로, ISR이 `min.insync.replicas`보다 작아질 때 마지막으로 빠진 복제본(여기서는 2)이 "커밋된 메시지는 다 가지고 있다"는 것을 기억해 둔다. 그 뒤로는 하이 워터마크가 더 나아가지 않기 때문이다. 리더 3까지 죽고 2가 먼저 돌아오면, 2를 안전하게 리더로 세울 수 있다.

이제 두 브로커를 되살린다. 되살아난 브로커는 팔로워로서 빠진 메시지를 따라잡은 뒤 ISR에 다시 들어간다. 리더는 바로 돌아오지 않는다. 선호 리더로 되돌리는 것은 주기적인 자동 작업(`auto.leader.rebalance.enable`, 기본 5분 간격 확인)이거나, 손으로 하는 선출이다.
```bash
for n in 1 2; do (kafka-server-start.sh node$n.properties > node$n.log 2>&1 &); done
until [ "$(state | grep -c 'ISR [0-9],[0-9],[0-9]$')" = 3 ]; do sleep 1; done
state
kafka-leader-election.sh --bootstrap-server $K --election-type preferred --all-topic-partitions > /dev/null
state
kafka-server-stop.sh > /dev/null
```
```text
P0 리더 3 | 복제본 1,2,3 | ISR 1,2,3
P1 리더 3 | 복제본 2,3,1 | ISR 1,2,3
P2 리더 3 | 복제본 3,1,2 | ISR 1,2,3
P0 리더 1 | 복제본 1,2,3 | ISR 1,2,3
P1 리더 2 | 복제본 2,3,1 | ISR 1,2,3
P2 리더 3 | 복제본 3,1,2 | ISR 1,2,3
```
되살린 직후에는 ISR은 다시 셋이지만 리더 일이 모두 브로커 3에 몰려 있다. 선호 리더 선출을 하자 각 파티션의 리더가 목록의 첫 브로커로 돌아가 다시 고르게 나뉘었다.

## 깨끗하지 않은 리더 선출
ISR의 복제본이 모두 죽고, ISR 밖에 있던(뒤처진) 복제본만 살아 있다면 어떻게 할까. `unclean.leader.election.enable`(기본 false)이 그 선택이다.
- **false**: ISR의 복제본이 돌아올 때까지 그 파티션은 읽기도 쓰기도 못 한다. 커밋된 메시지는 잃지 않는다.
- **true**: 뒤처진 복제본을 리더로 세워 바로 이어 간다. 그 복제본이 못 받은 메시지는 **잃는다**. 잃어도 되는 지표 로그처럼 가용성이 더 중요한 토픽에만 켠다.

## 흔한 오해
- "복제 계수 3이면 안전하다": `acks`와 `min.insync.replicas`가 함께 맞아야 한다. `acks=1`이면 리더만 받고 성공하므로 복제가 있어도 잃을 수 있다.
- "팔로워가 읽기를 나눠 맡는다": 기본으로는 리더만 읽기와 쓰기를 받는다. 팔로워는 대비용이고, 부하를 나누는 것은 파티션이다.
- "브로커가 되살아나면 원래대로 돌아간다": ISR은 돌아오지만 리더는 그대로일 수 있다. 리더가 한 브로커에 몰리지 않았는지 본다.

## 어디에 쓰이나
- Redis 실무 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」: 주 서버가 죽었을 때 복제본을 승격하는 같은 문제를, 비동기 복제의 손실 가능성과 함께 본다.
- PostgreSQL 실무 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: 동기 복제로 "몇 곳에 기록되면 성공인가"를 정하는 것이 `acks=all`과 `min.insync.replicas`에 해당한다.
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 죽은 서버를 빼고 남은 곳으로 보내는 장애 조치를 요청 수준에서 본다.

## 정리
- 복제는 파티션 단위다. 리더 하나가 읽기·쓰기를 맡고 팔로워가 따라 쓴다.
- ISR 모두가 받은 위치가 하이 워터마크이고, 그 앞이 커밋된 메시지다. 새 리더는 ISR에서 고르므로 커밋된 메시지를 잃지 않는다.
- 복제 계수 3, `min.insync.replicas=2`, `acks=all`이면 브로커 하나를 잃어도 쓰기가 계속되고, 둘을 잃으면 잃을 위험 대신 쓰기를 거절한다.
- 되살아난 브로커는 따라잡아 ISR로 돌아오고, 리더는 선호 리더 선출로 다시 나눈다.

## 더 알아보기
- 이전 글: 7편 「오프셋 커밋과 전달 보장: 최대 한 번, 적어도 한 번, 정확히 한 번」
- 다음 글: 9편 「KRaft: ZooKeeper 없이 메타데이터 관리하기」
