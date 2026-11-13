# [카프카 이벤트 스트리밍 12/12] 생태계와 운영: Connect, Streams, 스키마, 지연 감시

> **한 줄 요약** — 카프카 커넥트는 코드 없이 설정만으로 외부 시스템과 토픽 사이에 데이터를 옮기고, 카프카 스트림즈는 토픽을 읽어 집계한 결과를 다시 토픽에 쓰는 자바 라이브러리이며, 스키마와 호환성 규칙은 따로 배포되는 프로듀서와 컨슈머가 서로를 깨뜨리지 않게 하고, 운영에서는 컨슈머 지연과 복제 상태를 가장 먼저 지켜본다.

## 이 글에서 다루는 것
- 카프카 둘레의 도구들
- 카프카 커넥트: 소스와 싱크, 변환기
- 카프카 스트림즈: 상태를 가진 스트림 처리
- 스키마와 호환성: 형식을 바꿔도 깨지지 않게
- 컨슈머 지연 감시와 운영 점검 목록

## 카프카 둘레의 도구들
1~11편은 브로커와 클라이언트를 다뤘다. 실무에서 카프카는 혼자 쓰이지 않는다.
- **카프카 커넥트**(Connect): 데이터베이스, 파일, 검색 엔진, 객체 저장소 같은 외부 시스템과 토픽을 잇는다. 아파치 카프카에 들어 있다.
- **카프카 스트림즈**(Streams): 토픽을 읽어 거르고, 합치고, 집계해 다른 토픽에 쓰는 프로그램을 만드는 라이브러리다. 역시 아파치 카프카에 들어 있다.
- **스키마 레지스트리**: 메시지 형식(스키마)을 한곳에 등록하고 호환성을 검사한다. 아파치 카프카 밖의 제품들(Confluent Schema Registry, Apicurio 등)이 있다.
- **미러메이커 2**: 클러스터 사이에 토픽을 복제한다. 다른 지역에 대비용 클러스터를 둘 때 쓴다.
- 더 큰 스트림 처리에는 Apache Flink 같은 별도 엔진을 카프카에 붙이기도 한다.

## 카프카 커넥트
외부 시스템에서 토픽으로 가져오는 것을 **소스 커넥터**, 토픽에서 외부 시스템으로 내보내는 것을 **싱크 커넥터**라고 한다. 커넥터는 **워커**라는 프로세스 안에서 돌고, 실제 일은 커넥터가 나눈 **태스크**들이 한다. 데이터를 메시지로 바꾸는 방식은 **변환기**(converter)가 정하고, 가져간 위치(파일의 몇 번째 줄, DB의 어느 변경까지)는 커넥트가 따로 기록해 두어 재시작해도 이어 간다. 운영에서는 여러 워커가 묶여 커넥터를 나눠 맡는 분산 모드를 쓰고, REST API로 커넥터를 등록한다. 여기서는 워커 하나로 도는 단독 모드에 카프카에 들어 있는 파일 커넥터를 붙인다. `in.txt`에 줄을 더하면 토픽 `lines`를 거쳐 `out.txt`에 쓰인다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'group.initial.rebalance.delay.ms=0' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
cat > worker.properties <<EOF
bootstrap.servers=$K
key.converter=org.apache.kafka.connect.json.JsonConverter
value.converter=org.apache.kafka.connect.json.JsonConverter
offset.storage.file.filename=$PWD/connect.offsets
plugin.path=/opt/kafka/libs/connect-file-4.4.0.jar
EOF
printf 'name=file-in\nconnector.class=FileStreamSource\nfile=%s/in.txt\ntopic=lines\n' "$PWD" > source.properties
printf 'name=file-out\nconnector.class=FileStreamSink\nfile=%s/out.txt\ntopics=lines\n' "$PWD" > sink.properties
touch in.txt
connect-standalone.sh worker.properties source.properties sink.properties > connect.log 2>&1 &
printf 'hello kafka\nhello connect\n' >> in.txt
until [ -f out.txt ] && [ "$(wc -l < out.txt)" = 2 ]; do sleep 0.5; done
cat out.txt
kafka-console-consumer.sh --bootstrap-server $K --topic lines --from-beginning --max-messages 2 2>/dev/null
```
```text
hello kafka
hello connect
{"schema":{"type":"string","optional":false},"payload":"hello kafka"}
{"schema":{"type":"string","optional":false},"payload":"hello connect"}
```
코드 한 줄 없이 파일 → 토픽 → 파일 흐름이 생겼다. 토픽의 메시지를 직접 보면 JSON 변환기가 값마다 **스키마**(문자열이고 비어 있을 수 없다)를 함께 넣었다. 싱크 커넥터는 이것을 보고 원래 값으로 되돌렸다. 실제로는 파일 대신 데이터베이스의 변경을 읽는 소스(10편의 CDC), 검색 엔진이나 객체 저장소에 쓰는 싱크를 붙이고, 메시지마다 필드를 바꾸는 간단한 변환(SMT, single message transform)도 설정으로 건다.

## 카프카 스트림즈
카프카 스트림즈는 별도의 클러스터가 아니라 **자바 라이브러리**다. 앱 안에 넣어 실행하면, 토픽을 읽어 처리한 결과를 토픽에 쓴다. 앱을 여러 개 띄우면 컨슈머 그룹(6편)처럼 파티션을 나눠 맡는다. 핵심은 **상태**다. 단어 수 세기, 사용자별 합계처럼 이전 메시지를 기억해야 하는 처리를 위해 로컬 저장소에 상태를 두고, 그 변경을 컴팩션 토픽(10편)에 기록해 두었다가 장애 뒤에 되살린다. 카프카에 들어 있는 단어 세기 예제를 돌린다.
```bash
kafka-topics.sh --bootstrap-server $K --create --topic streams-plaintext-input --partitions 1 --replication-factor 1 > /dev/null
kafka-topics.sh --bootstrap-server $K --create --topic streams-wordcount-output --partitions 1 --replication-factor 1 > /dev/null
kafka-run-class.sh org.apache.kafka.streams.examples.wordcount.WordCountDemo > streams.log 2>&1 &
printf 'all streams lead to kafka\nhello kafka streams\n' \
  | kafka-console-producer.sh --bootstrap-server $K --topic streams-plaintext-input
kafka-console-consumer.sh --bootstrap-server $K --topic streams-wordcount-output --from-beginning --max-messages 8 \
  --formatter-property print.key=true \
  --formatter-property value.deserializer=org.apache.kafka.common.serialization.LongDeserializer 2>/dev/null
kafka-topics.sh --bootstrap-server $K --list | grep 'STATE-STORE'
```
```text
all	1
streams	1
lead	1
to	1
kafka	1
hello	1
kafka	2
streams	2
streams-wordcount-KSTREAM-AGGREGATE-STATE-STORE-0000000003-changelog
streams-wordcount-KSTREAM-AGGREGATE-STATE-STORE-0000000003-repartition
```
- 출력은 단어마다 **바뀐 개수**다. 둘째 줄을 처리하자 `kafka`와 `streams`가 2로 바뀌었다. 이렇게 키마다 최신 값이 의미 있는 스트림을 스트림즈에서는 **테이블**(KTable)로 다루고, 이벤트 하나하나가 의미 있는 스트림(KStream)과 구분한다.
- 앱이 내부 토픽 둘을 만들었다. `changelog`는 단어별 개수 저장소의 변경 기록(컴팩션 토픽)이고, `repartition`은 같은 단어가 같은 처리기에 모이도록 단어를 키로 다시 나눈 토픽이다.
- `processing.guarantee=exactly_once_v2`로 설정하면 이 읽기·상태 갱신·쓰기가 11편의 트랜잭션으로 묶인다.

## 스키마와 호환성
프로듀서와 컨슈머는 서로 다른 팀이 따로 배포한다. 프로듀서가 필드 이름을 바꾸면 컨슈머는 배포 순서에 따라 갑자기 깨진다. 그래서 메시지 형식을 **스키마**(Avro, Protobuf, JSON Schema)로 정하고, 바꿀 때 지킬 **호환성 규칙**을 정한다. 위 커넥트 예처럼 메시지마다 스키마를 넣으면 크기가 커지므로, 보통은 스키마 레지스트리에 스키마를 한 번 등록하고 메시지에는 스키마 번호만 붙인다. 레지스트리는 새 스키마를 등록할 때 규칙을 어기면 거절한다.

| 규칙 | 허용되는 변경 | 먼저 배포할 쪽 |
| --- | --- | --- |
| 하위 호환(BACKWARD) | 기본값이 있는 필드 추가, 필드 삭제 | 컨슈머 |
| 상위 호환(FORWARD) | 필드 추가, 기본값이 있는 필드 삭제 | 프로듀서 |
| 완전 호환(FULL) | 기본값이 있는 필드의 추가와 삭제 | 아무 쪽이나 |

하위 호환은 "새 스키마로 옛 메시지를 읽을 수 있다"는 뜻이라, 새 스키마를 쓰는 컨슈머를 먼저 배포한다. 토픽에는 보존 기간 동안 옛 메시지가 남아 있다는 점(4편)을 기억하면, 왜 이런 규칙이 필요한지 분명해진다.

## 컨슈머 지연 감시
운영에서 가장 먼저 보는 숫자는 **컨슈머 지연**(consumer lag)이다. 파티션의 끝 오프셋과 그룹이 커밋한 오프셋의 차이로, "아직 처리하지 못한 메시지 수"다. 메시지 100개 중 30개만 처리하고 커밋한 그룹을 만들어 본다.
```bash
kafka-topics.sh --bootstrap-server $K --create --topic events --partitions 1 --replication-factor 1 > /dev/null
seq 1 100 | kafka-console-producer.sh --bootstrap-server $K --topic events
python3 - <<'EOF'
from confluent_kafka import Consumer
c = Consumer({'bootstrap.servers': 'localhost:9092', 'group.id': 'report',
              'auto.offset.reset': 'earliest', 'enable.auto.commit': False})
c.subscribe(['events'])
n = 0
while n < 30:                      # 30개만 처리한다
    msg = c.poll(1)
    if msg is None or msg.error():
        continue
    n += 1
c.commit(message=msg, asynchronous=False)
c.close()
EOF
lag() { kafka-consumer-groups.sh --bootstrap-server $K --describe --group report 2>/dev/null \
  | awk '$1 == "report" { print "커밋 위치", $4, "| 끝", $5, "| 지연", $6 }'; }
lag
seq 101 150 | kafka-console-producer.sh --bootstrap-server $K --topic events
lag
kafka-server-stop.sh > /dev/null
```
```text
커밋 위치 30 | 끝 100 | 지연 70
커밋 위치 30 | 끝 150 | 지연 120
```
들어오는 속도가 처리 속도보다 빠르면 지연이 계속 커진다. 지연이 잠깐 튀는 것은 정상이지만 꾸준히 늘면 컨슈머가 따라가지 못하는 것이다. 이 숫자를 익스포터로 Prometheus에 모아 "지연이 10분 넘게 늘고 있다" 같은 경보를 건다. 개수만으로는 얼마나 늦었는지 알기 어려우므로, 가장 오래된 미처리 메시지의 나이(시간 지연)를 함께 본다. 대응은 컨슈머를 늘리거나(파티션 수까지, 6편), 처리 자체를 빠르게 하거나, 파티션을 늘리는 것이다.

## 운영 점검 목록
- **복제 상태**: 복제가 덜 된 파티션 수(under-replicated partitions)와 리더가 없는 파티션 수(offline partitions)는 0이어야 한다. ISR이 자주 줄었다 늘었다 하면 브로커나 네트워크가 느린 것이다(8편).
- **설정의 기본기**: 복제 계수 3, `min.insync.replicas=2`, 프로듀서 `acks=all`(5편, 8편). 브로커를 랙이나 가용 영역에 나눠 두고 `broker.rack`을 설정하면 복제본이 같은 곳에 몰리지 않는다.
- **컨트롤러**: 활성 컨트롤러가 정확히 하나인지, 쿼럼이 과반을 유지하는지 본다(9편).
- **디스크와 보존**: 보존 기간과 쓰는 속도로 필요한 디스크를 계산한다(4편). 최근 버전에는 오래된 세그먼트를 객체 저장소로 옮기는 계층형 저장소(tiered storage)도 있다.
- **업그레이드**: 브로커를 한 대씩 재시작하는 순차 업그레이드를 하고, 재시작 뒤 ISR이 다시 차는지 확인한 다음 넘어간다.
- **보안**: 통신 암호화(TLS), 클라이언트 인증(SASL), 토픽별 권한(ACL)을 켠다. 기본 설정은 아무나 읽고 쓸 수 있다.

## 흔한 오해
- "카프카 스트림즈는 서버를 따로 띄워야 한다": 앱에 넣는 라이브러리다. 확장은 앱 인스턴스를 늘리는 것이다.
- "JSON이면 스키마가 필요 없다": 필드 이름과 형식이 바뀌면 컨슈머가 깨지는 것은 같다. 규칙을 문서로라도 정하고 검사해야 한다.
- "지연이 0이 아니면 문제다": 들어오는 대로 처리 중이면 지연은 늘 조금 있다. 추세와 시간 지연을 본다.

## 어디에 쓰이나
- Prometheus와 Grafana 모니터링 8편 「기록 규칙과 경보: 규칙 파일과 Alertmanager」: 컨슈머 지연과 복제 상태에 경보를 거는 방법을 본다.
- 웹 앱의 원리 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」: gRPC의 Protobuf가 필드 번호로 호환성을 지키는 방식이 스키마 진화와 같은 문제다.
- PostgreSQL 실무 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: 논리 복제가 내보내는 행 변경이 CDC 소스 커넥터가 읽는 바로 그것이다.

## 정리
- 커넥트는 설정만으로 외부 시스템과 토픽을 잇고, 변환기가 메시지 형식을 정한다.
- 스트림즈는 앱에 넣는 라이브러리로, 상태를 컴팩션 토픽에 기록하고 트랜잭션으로 정확히 한 번 처리를 할 수 있다.
- 스키마와 호환성 규칙이 따로 배포되는 프로듀서와 컨슈머를 지킨다. 하위 호환이면 컨슈머를 먼저 배포한다.
- 운영에서는 컨슈머 지연, 복제가 덜 된 파티션, 컨트롤러 상태를 먼저 본다.

## 더 알아보기
- 이전 글: 11편 「트랜잭션: 읽고 처리하고 쓰기를 한 번에」
- 처음 글: 1편 「카프카란: 지워지지 않는 로그로 만든 메시지 시스템」
