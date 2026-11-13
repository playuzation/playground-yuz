# [카프카 이벤트 스트리밍 2/12] 설치와 첫 메시지: KRaft 브로커와 콘솔 도구

> **한 줄 요약** — 카프카 브로커 하나는 내려받은 바이너리, `server.properties` 설정, 클러스터 ID로 초기화한 데이터 폴더만 있으면 뜨고, `kafka-topics`·콘솔 프로듀서·콘솔 컨슈머·`kafka-get-offsets` 같은 함께 든 도구로 토픽을 만들고 키가 있는 메시지를 주고받으며, 데이터 폴더를 열어 보면 파티션마다 로그 파일이 쌓여 있다.

## 이 글에서 다루는 것
- 내려받기와 검증, 자바
- `server.properties`의 핵심: 역할, 노드 ID, 리스너와 광고 주소, 데이터 폴더
- 저장소 초기화와 시작·종료
- 콘솔 도구로 토픽 다루기, 키 있는 메시지 쓰고 읽기
- 데이터 폴더 안을 들여다보기

## 내려받기
카프카는 자바 17 이상에서 돈다. 공식 사이트(kafka.apache.org)의 내려받기 페이지에서 `kafka_2.13-4.4.0.tgz`처럼 생긴 바이너리를 받는다. 이름의 2.13은 일부 구성 요소가 쓰는 스칼라 버전이고, 4.4.0이 카프카 버전이다. 함께 제공되는 `.sha512` 파일로 내려받은 파일이 온전한지 확인하고 푼다. 이 시리즈는 `/opt/kafka`에 풀었다고 가정한다. 도커를 쓴다면 공식 `apache/kafka` 이미지로도 같은 브로커를 띄울 수 있다.

## server.properties의 핵심
`config/server.properties`는 브로커와 컨트롤러를 한 프로세스로 띄우는 개발용 예제 설정이다. 꼭 알아야 할 줄은 이렇다.
- `process.roles=broker,controller`: 이 프로세스가 데이터를 다루는 브로커이자 메타데이터를 관리하는 컨트롤러라는 뜻이다. 운영에서는 둘을 나누기도 한다(9편).
- `node.id=1`: 클러스터 안에서 이 노드의 번호.
- `listeners=PLAINTEXT://:9092,CONTROLLER://:9093`: 어느 포트에서 들을지.
- `advertised.listeners=PLAINTEXT://localhost:9092`: 클라이언트에게 "나에게는 이 주소로 접속하라"고 **알려 줄** 주소. 클라이언트는 처음 연결한 브로커에게서 클러스터 정보를 받은 뒤, 여기 적힌 주소로 다시 접속한다. 도커나 다른 컴퓨터에서 접속할 때 이 값이 `localhost`로 남아 있어 "처음엔 붙는데 그다음에 실패하는" 일이 가장 흔한 설치 문제다.
- `log.dirs`: 데이터(로그) 폴더. 기본값 `/tmp/…`는 재부팅하면 지워질 수 있으니 바꾼다.
- `num.partitions`, `log.retention.hours`: 토픽을 만들 때 따로 정하지 않으면 쓰는 기본값(파티션 1개, 보존 168시간).

## 초기화와 시작
KRaft 모드에서는 처음 한 번 **클러스터 ID**를 만들고 데이터 폴더를 그 ID로 초기화(format)해야 한다. 같은 클러스터의 노드들은 같은 ID로 초기화한다. `--standalone`은 컨트롤러 하나로 이루어진 클러스터라는 뜻이다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
grep -E '^(process.roles|node.id|listeners|advertised.listeners|log.dirs|num.partitions)=' server.properties \
  | sed "s#$PWD#.#"
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties \
  | grep -o 'Formatting.*with' | sed "s#$PWD#.#"
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
grep -o 'Kafka Server started' broker.log | head -1
```
```text
process.roles=broker,controller
node.id=1
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
advertised.listeners=PLAINTEXT://localhost:9092,CONTROLLER://localhost:9093
log.dirs=./kafka-data
num.partitions=1
Formatting dynamic metadata voter directory ./kafka-data with
Kafka Server started
```
몇 초 만에 브로커가 떴다. 실제 서버에서는 `bin/kafka-server-start.sh -daemon …`이나 systemd 서비스로 띄우고, 끌 때는 `kafka-server-stop.sh`를 쓴다.

## 토픽 다루기
`kafka-topics.sh`로 토픽을 만들고, 목록을 보고, 설정을 확인한다. 파티션 3개짜리 `orders`와, 보존 기간을 1시간으로 줄인 `clicks`를 만든다.
```bash
K=localhost:9092
kafka-topics.sh --bootstrap-server $K --create --topic orders --partitions 3 --replication-factor 1
kafka-topics.sh --bootstrap-server $K --create --topic clicks --partitions 1 --replication-factor 1 \
  --config retention.ms=3600000
kafka-topics.sh --bootstrap-server $K --list
kafka-topics.sh --bootstrap-server $K --describe --topic orders | sed -E 's/TopicId: [^\t]+/TopicId: …/; s/\tElr:.*//'
kafka-configs.sh --bootstrap-server $K --describe --entity-type topics --entity-name clicks | grep -o 'retention.ms=[0-9]*' | head -1
```
```text
Created topic orders.
Created topic clicks.
clicks
orders
Topic: orders	TopicId: …	PartitionCount: 3	ReplicationFactor: 1	Configs: min.insync.replicas=1,segment.bytes=1073741824
	Topic: orders	Partition: 0	Leader: 1	Replicas: 1	Isr: 1
	Topic: orders	Partition: 1	Leader: 1	Replicas: 1	Isr: 1
	Topic: orders	Partition: 2	Leader: 1	Replicas: 1	Isr: 1
retention.ms=3600000
```
`--describe`는 파티션마다 리더 브로커, 복제본(Replicas), 동기화된 복제본(Isr)을 보여 준다. 브로커가 하나라 모두 1번이다. 복제는 8편에서 브로커 세 대로 본다. 운영 클러스터에서는 토픽을 자동으로 만들지 않게 하고(`auto.create.topics.enable=false`), 이렇게 명시적으로 만든다.

## 키 있는 메시지 쓰고 읽기
카프카 메시지는 **키**와 **값**, 타임스탬프, 헤더로 이루어진다. 키는 어느 파티션으로 갈지를 정하는 데 쓰인다(3편). 콘솔 프로듀서에 "키:값" 형식으로 주고, 콘솔 컨슈머에서 키·파티션·오프셋을 함께 찍는다.
```bash
printf '%s\n' 'minji:coffee' 'sora:tea' 'minji:cake' 'jun:juice' \
  | kafka-console-producer.sh --bootstrap-server $K --topic orders \
      --reader-property parse.key=true --reader-property key.separator=:
kafka-console-consumer.sh --bootstrap-server $K --topic orders --from-beginning --timeout-ms 4000 \
  --formatter-property print.key=true --formatter-property print.partition=true \
  --formatter-property print.offset=true 2>/dev/null | sort
kafka-get-offsets.sh --bootstrap-server $K --topic orders
```
```text
Partition:0	Offset:0	jun	juice
Partition:1	Offset:0	sora	tea
Partition:2	Offset:0	minji	coffee
Partition:2	Offset:1	minji	cake
orders:0:1
orders:1:1
orders:2:2
```
같은 키 `minji`의 두 메시지는 같은 파티션(2번)에 순서대로 들어갔고, 다른 키들은 다른 파티션으로 갔다. `kafka-get-offsets.sh`는 파티션마다 로그 끝 오프셋(다음에 쓸 번호)을 보여 준다. 컨슈머 출력에 `sort`를 붙인 것은 여러 파티션을 함께 읽을 때 파티션 사이의 순서는 정해져 있지 않기 때문이다(3편의 핵심).

## 데이터 폴더 안
브로커의 데이터 폴더에는 "토픽-파티션" 이름의 폴더가 있고, 그 안에 실제 로그가 파일로 있다.
```bash
ls kafka-data | grep '^orders-'
ls kafka-data/orders-2
kafka-dump-log.sh --files kafka-data/orders-2/00000000000000000000.log --print-data-log \
  | grep -o 'offset: [0-9]* .*payload: .*' | sed -E 's/offset: ([0-9]+) .*key: ([^ ]+) payload: (.*)/offset \1, key \2, value \3/'
kafka-server-stop.sh > /dev/null 2>&1
```
```text
orders-0
orders-1
orders-2
00000000000000000000.index
00000000000000000000.log
00000000000000000000.timeindex
leader-epoch-checkpoint
partition.metadata
offset 0, key minji, value coffee
offset 1, key minji, value cake
```
파티션 하나는 폴더 하나이고, 메시지는 `.log` 파일에 차례로 덧붙여진다. 파일 이름의 숫자는 그 파일의 첫 오프셋이다. `.index`와 `.timeindex`는 오프셋과 시각으로 파일 안의 위치를 빨리 찾는 색인이다. 로그가 커지면 새 파일(세그먼트)이 생기고 오래된 세그먼트부터 지워지는데, 그 이야기가 4편이다.

## 흔한 오해
- "브로커에 접속만 되면 된다": 처음 연결한 뒤에는 `advertised.listeners`의 주소로 다시 접속한다. 그 주소가 클라이언트에서 닿지 않으면 연결은 되는데 읽기·쓰기가 실패한다.
- "토픽은 쓰다 보면 저절로 생기니 따로 만들 필요 없다": 자동 생성은 기본 설정(파티션 1개)으로 만든다. 파티션 수와 보존 기간을 정해 명시적으로 만든다.
- "`/tmp`에 둔 개발용 데이터로 충분하다": 재부팅하면 사라질 수 있다. 데이터 폴더는 처음부터 정해 둔다.

## 어디에 쓰이나
- 도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」: 컨테이너 안의 카프카에 바깥에서 붙을 때 `advertised.listeners`가 왜 어긋나는지 네트워크 쪽에서 이해할 수 있다.
- 웹 앱의 원리 7편 「패킷이 목적지에 닿기까지: IP, TCP, UDP, 포트」: 리스너와 포트, 그리고 "받는 주소"와 "알려 주는 주소"의 차이가 이어진다.
- PostgreSQL 실무 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」: 데이터 폴더를 초기화하고 서버를 띄우는 흐름을 데이터베이스에서도 똑같이 밟는다.

## 정리
- 바이너리와 자바, `server.properties`, 클러스터 ID로 초기화한 데이터 폴더가 있으면 브로커가 뜬다.
- `listeners`는 듣는 주소, `advertised.listeners`는 클라이언트에게 알려 주는 주소다. 원격 접속 문제의 단골 원인이다.
- `kafka-topics`로 토픽을 만들고, 콘솔 프로듀서·컨슈머로 키 있는 메시지를 주고받는다.
- 파티션은 데이터 폴더의 폴더 하나이고, 메시지는 `.log` 세그먼트 파일에 차례로 쌓인다.

## 더 알아보기
- 이전 글: 1편 「카프카란: 지워지지 않는 로그로 만든 메시지 시스템」
- 다음 글: 3편 「토픽과 파티션: 순서는 파티션 안에서만 지켜진다」
