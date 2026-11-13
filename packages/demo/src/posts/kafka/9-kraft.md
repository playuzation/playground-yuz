# [카프카 이벤트 스트리밍 9/12] KRaft: ZooKeeper 없이 메타데이터 관리하기

> **한 줄 요약** — 어떤 토픽과 파티션이 있고 누가 리더인지 같은 클러스터 메타데이터를, 예전에는 별도 시스템인 ZooKeeper에 두었지만 KRaft에서는 컨트롤러 노드들이 Raft 합의로 복제하는 메타데이터 로그에 기록으로 쌓으며, 컨트롤러 과반이 살아 있으면 리더 컨트롤러가 죽어도 몇 초 만에 넘겨받고, 과반을 잃으면 메타데이터 변경만 멈추고 기존 파티션의 읽기·쓰기는 계속된다.

## 이 글에서 다루는 것
- 메타데이터와 컨트롤러가 하는 일
- ZooKeeper에서 KRaft로 바꾼 이유
- 메타데이터 로그: 클러스터의 상태를 기록으로 쌓기
- 직접 해 보기: 컨트롤러 셋, 리더 컨트롤러 죽이기, 과반 잃기
- 컨트롤러는 몇 대를 두나

## 메타데이터와 컨트롤러
8편에서 브로커가 죽자 누군가 새 리더를 정하고, 그 결과를 모든 브로커와 클라이언트가 알게 되었다. 그 "누군가"가 **컨트롤러**이고, 컨트롤러가 관리하는 정보가 **메타데이터**다.
- 클러스터에 속한 브로커와, 각자의 주소와 상태.
- 토픽, 파티션, 복제본의 위치, 파티션마다의 리더와 ISR.
- 토픽과 브로커의 설정, 권한(ACL), 기능 버전.

브로커는 이 정보를 받아 두고 클라이언트의 "이 파티션의 리더가 누구냐"는 질문에 답한다. 메타데이터는 작지만, 틀리거나 끊기면 클러스터 전체가 길을 잃는다.

## ZooKeeper에서 KRaft로
카프카는 오랫동안 메타데이터를 **ZooKeeper**라는 별도의 분산 코디네이션 시스템에 저장했다. 브로커 중 하나가 ZooKeeper를 통해 컨트롤러로 뽑혀, 바뀐 내용을 다른 브로커들에게 전했다. 이 구조에는 불편이 있었다.
- 운영할 시스템이 둘이다. 설정, 보안, 감시, 업그레이드를 따로 해야 했다.
- 컨트롤러가 바뀌면 새 컨트롤러가 ZooKeeper에서 모든 메타데이터를 다시 읽어야 해서, 파티션이 수십만 개면 장애 조치가 오래 걸렸다. 그래서 클러스터에 둘 수 있는 파티션 수에도 실질적인 한계가 있었다.

2019년의 제안(KIP-500)으로 카프카가 메타데이터를 스스로 관리하는 **KRaft**(Kafka Raft) 작업이 시작되었다. 3.x 동안 단계적으로 옮겨 갔고, 3.9가 옮겨 가는 마지막 다리 버전이며, 4.0(2025년 3월)에서 ZooKeeper 지원이 빠졌다. 지금 새로 만드는 클러스터는 모두 KRaft다.

## 메타데이터 로그
KRaft의 생각은 단순하다. 카프카가 가장 잘하는 것이 로그이므로, 메타데이터도 **로그**로 다룬다.
- 컨트롤러 노드 몇 대(보통 3대)가 **쿼럼**을 이룬다. 이들은 Raft 합의 알고리즘으로 리더 하나를 뽑고, 리더가 **활성 컨트롤러**가 된다.
- 메타데이터의 모든 변화는 "토픽이 생겼다", "파티션 0의 리더가 2가 되었다" 같은 **기록**(record)으로, 내부 토픽 `__cluster_metadata`의 파티션 하나에 순서대로 덧붙는다.
- 기록은 컨트롤러 과반이 받으면 확정된다. 나머지 컨트롤러는 같은 로그를 가진 대기 인원이라, 리더가 죽으면 다시 읽을 것 없이 바로 넘겨받는다.
- 브로커는 투표하지 않는 **관찰자**(observer)로서 이 로그를 가져가 메모리의 메타데이터에 차례로 반영한다. 로그가 길어지면 주기적으로 **스냅숏**을 만들어 앞부분을 정리한다.

## 직접 해 보기: 컨트롤러 셋과 브로커 하나
컨트롤러 셋(노드 1~3, 포트 9095~9097)과 브로커 하나(노드 4, 포트 9092)를 띄운다. 처음 쿼럼을 이룰 컨트롤러는 포맷할 때 `--initial-controllers`로 알려 주고, 각자의 저장 폴더에 고유 ID를 붙인다. 브로커는 `controller.quorum.bootstrap.servers`로 컨트롤러를 찾아간다. 토픽을 만드는 한 번의 시도가 오래 멈추지 않게 `timeout 20`으로 끊고 다시 시도한다.
```bash
export PATH="$PATH:/opt/kafka/bin" KAFKA_HEAP_OPTS="-Xmx512m -Xms512m"
CID=$(kafka-storage.sh random-uuid)
conf() {   # 노드 번호와 역할을 받아 설정 파일 내용을 만든다
  cat <<EOF
process.roles=$2
node.id=$1
controller.quorum.bootstrap.servers=localhost:9095,localhost:9096,localhost:9097
controller.listener.names=CONTROLLER
listener.security.protocol.map=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
log.dirs=$PWD/data$1
EOF
  if [ $2 = controller ]; then echo "listeners=CONTROLLER://localhost:909$((4 + $1))"
  else echo 'listeners=PLAINTEXT://localhost:9092'; fi
}
for n in 1 2 3; do conf $n controller > node$n.properties; done
conf 4 broker > node4.properties
VOTERS=$(for n in 1 2 3; do echo "$n@localhost:909$((4 + n)):$(kafka-storage.sh random-uuid)"; done | paste -sd,)
for n in 1 2 3; do kafka-storage.sh format -t $CID -c node$n.properties --initial-controllers "$VOTERS" > /dev/null; done
kafka-storage.sh format -t $CID -c node4.properties --no-initial-controllers > /dev/null
for n in 1 2 3 4; do (kafka-server-start.sh node$n.properties > node$n.log 2>&1 &); done
K=localhost:9092
until timeout 20 kafka-topics.sh --bootstrap-server $K --create --if-not-exists --topic orders \
    --partitions 1 --replication-factor 1 > /dev/null 2>&1; do sleep 1; done
echo before-outage | kafka-console-producer.sh --bootstrap-server $K --topic orders
kafka-metadata-quorum.sh --bootstrap-server $K describe --replication 2>/dev/null | awk 'NR > 1 { print "노드", $1, $NF }'
```
```text
노드 … Leader
노드 … Follower
노드 … Follower
노드 4 Observer
```
컨트롤러 셋 중 하나가 리더(활성 컨트롤러), 둘이 팔로워이고, 브로커 4는 관찰자다. 누가 리더가 될지는 선거 시점에 따라 달라 가렸다. 이제 메타데이터 로그를 직접 읽어 본다. 컨트롤러의 저장 폴더에 있는 `__cluster_metadata-0`을 `kafka-dump-log.sh`로 풀면 기록이 하나씩 나온다. 종류별로 세어 본다.
```bash
LOG=data1/__cluster_metadata-0/00000000000000000000.log
kafka-dump-log.sh --cluster-metadata-decoder --files $LOG | grep -o '"type":"[A-Z_]*"' | cut -d'"' -f4 \
  | sort | uniq -c | grep -E 'REGISTER|TOPIC|PARTITION'
kafka-dump-log.sh --cluster-metadata-decoder --files $LOG | grep -o '{"type":"PARTITION_RECORD".*' \
  | jq -c '.data | {partitionId, replicas, isr, leader}'
```
```text
      1 PARTITION_RECORD
      1 REGISTER_BROKER_RECORD
      3 REGISTER_CONTROLLER_RECORD
      1 TOPIC_RECORD
{"partitionId":0,"replicas":[4],"isr":[4],"leader":4}
```
컨트롤러 셋과 브로커 하나가 등록된 기록, 토픽 `orders`가 생긴 기록, 그 파티션 0의 복제본·ISR·리더를 정한 기록이 차례로 쌓여 있다. 클러스터의 지금 상태는 이 기록들을 처음부터 차례로 적용한 결과다. 8편에서 리더가 바뀔 때마다 생긴 일도 이런 기록 하나씩이었다.

## 리더 컨트롤러를 죽이면
활성 컨트롤러를 강제로 죽인다. 남은 두 컨트롤러가 과반(3대 중 2대)이므로 새 리더를 뽑는다. Raft의 **에포크**(epoch)는 선거를 할 때마다 커지는 번호로, 옛 리더가 돌아와서 낡은 명령을 내려도 번호가 작아 무시되게 한다.
```bash
quorum() { kafka-metadata-quorum.sh --bootstrap-server $K describe --status 2>/dev/null \
  | awk '$1 == "LeaderId:" { l = $2 } $1 == "LeaderEpoch:" { e = $2 } END { print l, e }'; }
read L1 E1 < <(quorum)
pkill -KILL -f "kafka.Kafka node$L1.properties"
until read L2 E2 < <(quorum) && [ -n "$L2" ] && [ "$L2" != "$L1" ] && [ "$L2" != -1 ]; do sleep 0.5; done
echo "리더가 바뀌었다: 노드 $L1 → 노드 $L2"
echo "에포크가 커졌다: $(( E2 > E1 ))"
kafka-topics.sh --bootstrap-server $K --create --topic payments --partitions 1 --replication-factor 1 > /dev/null \
  && echo "토픽 만들기: 성공"
```
```text
리더가 바뀌었다: 노드 … → 노드 …
에포크가 커졌다: 1
토픽 만들기: 성공
```
몇 초 만에 다른 컨트롤러가 리더가 되었고, 토픽 만들기 같은 메타데이터 변경도 그대로 된다. 새 리더는 이미 같은 로그를 가지고 있었으므로 ZooKeeper 시절처럼 메타데이터를 다시 읽어 들일 필요가 없다.

## 과반을 잃으면
새 리더까지 죽여, 컨트롤러가 한 대만 남게 한다. 한 대는 과반이 아니므로 리더를 뽑을 수 없다.
```bash
pkill -KILL -f "kafka.Kafka node$L2.properties"; sleep 3
printf 'default.api.timeout.ms=10000\nrequest.timeout.ms=5000\n' > quick.properties   # 10초 안에 포기한다
kafka-topics.sh --bootstrap-server $K --command-config quick.properties --create --topic refunds \
  --partitions 1 --replication-factor 1 > /dev/null 2>&1 || echo "토픽 만들기: 실패"
echo during-outage | kafka-console-producer.sh --bootstrap-server $K --topic orders && echo "기존 토픽에 쓰기: 성공"
echo "기존 토픽 읽기: $(kafka-console-consumer.sh --bootstrap-server $K --topic orders --partition 0 \
  --offset earliest --timeout-ms 5000 2>/dev/null | tr '\n' ' ')"
```
```text
토픽 만들기: 실패
기존 토픽에 쓰기: 성공
기존 토픽 읽기: before-outage during-outage 
```
기본 설정이면 클라이언트가 몇 분 동안 다시 시도하므로, 관리 도구의 시간 제한을 줄여 빨리 포기하게 했다. 메타데이터를 **바꾸는** 일(토픽 만들기)은 실패했지만, 브로커는 이미 받아 둔 메타데이터로 기존 파티션의 쓰기와 읽기를 계속했다. 다만 이 상태에서는 브로커가 죽어도 리더를 새로 뽑을 수 없고, 컨슈머 그룹처럼 새 내부 토픽이 필요한 일도 막힌다. 그래서 일부러 `--partition`을 지정해 그룹 없이 읽었다. 새 프로듀서도 조건이 있다. 멱등 프로듀서(5편)가 받는 프로듀서 ID는 브로커가 컨트롤러에게서 묶음으로 받아 두고 나눠 주는 것이라, 브로커가 아직 묶음을 받기 전이면 새 프로듀서는 ID를 받지 못해 쓰기를 시작하지 못한다. 처음에 장애 전 메시지를 하나 써 둔 것이 그 때문이다. 두 컨트롤러를 되살리면 과반이 돌아온다.
```bash
for n in $L1 $L2; do (kafka-server-start.sh node$n.properties > node$n.log 2>&1 &); done
until timeout 20 kafka-topics.sh --bootstrap-server $K --create --if-not-exists --topic refunds \
    --partitions 1 --replication-factor 1 > /dev/null 2>&1; do sleep 1; done
echo "토픽 목록: $(kafka-topics.sh --bootstrap-server $K --list | tr '\n' ' ')"
kafka-server-stop.sh > /dev/null
```
```text
토픽 목록: orders payments refunds 
```

## 컨트롤러는 몇 대를 두나
Raft는 과반이 있어야 움직이므로, 견딜 수 있는 장애 수가 컨트롤러 수로 정해진다.
- 3대: 1대가 죽어도 된다. 대부분의 클러스터가 이것으로 충분하다.
- 5대: 2대가 죽어도 된다. 한 대를 점검하는 동안에도 1대의 장애를 견딜 수 있다.
- 짝수는 이득이 없다. 4대는 과반이 3이라 3대와 똑같이 1대까지만 견디고, 투표할 곳만 늘어난다.

개발용으로는 한 프로세스가 브로커와 컨트롤러를 함께 하는 **결합 모드**(`process.roles=broker,controller`, 2편의 설정)를 쓰고, 실무에서는 컨트롤러를 별도 노드로 떼어 브로커의 부하가 메타데이터 처리에 번지지 않게 한다. 이 글처럼 `--initial-controllers`로 만든 쿼럼(동적 쿼럼)에서는 컨트롤러를 더하거나 빼는 일(`kafka-metadata-quorum.sh add-controller`, `remove-controller`)도 클러스터를 멈추지 않고 할 수 있다.

## 흔한 오해
- "KRaft는 ZooKeeper를 카프카 안에 넣은 것이다": 별도의 저장소를 들여온 것이 아니라, 카프카의 로그와 복제를 메타데이터에도 쓰는 구조다.
- "컨트롤러 과반을 잃으면 카프카 전체가 멈춘다": 메타데이터 변경과 장애 조치가 멈춘다. 기존 파티션의 읽기·쓰기는 한동안 계속된다. 그래도 위험한 상태이므로 곧바로 복구해야 한다.
- "컨트롤러를 많이 둘수록 안전하다": 견디는 장애 수는 늘지만 합의에 참여할 곳이 늘어 느려진다. 3대나 5대가 보통이다.

## 어디에 쓰이나
- Redis 실무 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」: 센티널도 과반의 동의로 장애를 판정하고 새 주 서버를 정한다.
- PostgreSQL 실무 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 변화를 로그로 쌓아 두고 다시 적용해 상태를 만들며, 체크포인트로 앞부분을 정리하는 생각이 메타데이터 로그와 스냅숏과 같다.
- Git 버전 관리 1편 「Git이란: 스냅숏으로 기록하는 분산 버전 관리」: 상태를 기록의 역사로 다루는 또 하나의 예다.

## 정리
- 컨트롤러는 브로커, 토픽, 파티션의 리더와 ISR 같은 메타데이터를 관리한다.
- KRaft는 ZooKeeper 대신, 컨트롤러 쿼럼이 Raft로 복제하는 메타데이터 로그(`__cluster_metadata`)에 모든 변화를 기록한다. 4.0부터는 KRaft만 있다.
- 리더 컨트롤러가 죽으면 같은 로그를 가진 다른 컨트롤러가 몇 초 만에 넘겨받는다. 과반을 잃으면 메타데이터 변경이 멈춘다.
- 컨트롤러는 3대나 5대, 실무에서는 브로커와 따로 둔다.

## 더 알아보기
- 이전 글: 8편 「복제와 장애 조치: 리더, 팔로워, ISR」
- 다음 글: 10편 「로그 컴팩션: 키마다 마지막 값만 남기기」
