# [카프카 이벤트 스트리밍 3/12] 토픽과 파티션: 순서는 파티션 안에서만 지켜진다

> **한 줄 요약** — 토픽은 여러 파티션으로 나뉘어 브로커들에 흩어지고, 같은 키의 메시지는 키의 해시로 늘 같은 파티션에 들어가므로 "같은 사용자, 같은 주문"의 순서는 지켜지지만 파티션 사이의 순서는 보장되지 않으며, 파티션 수를 나중에 늘리면 키와 파티션의 짝이 바뀐다.

## 이 글에서 다루는 것
- 파티션이 하는 세 가지 일: 병렬, 순서, 배치
- 키로 파티션 고르기: 해시와 나머지
- 키가 없을 때: 스티키 파티셔너
- 직접 해 보기: 파티션을 넘나드는 순서와 키별 순서, 파티션을 늘리면 생기는 일
- 파티션 수 정하기와 쏠림

## 파티션이 하는 일
2편에서 토픽 `orders`를 파티션 3개로 만들었고, 데이터 폴더에는 파티션마다 폴더가 하나씩 생겼다. 파티션은 카프카에서 세 가지 일의 단위다.
- **병렬**: 파티션마다 다른 브로커에 둘 수 있고, 컨슈머 그룹 안에서 파티션 하나는 컨슈머 하나가 읽는다(6편). 파티션이 3개면 같은 그룹에서 동시에 읽는 컨슈머도 최대 3개다.
- **순서**: 파티션 하나는 하나의 로그라, 그 안의 메시지는 쓴 순서대로 오프셋을 받고 그 순서대로 읽힌다. 파티션 **사이**에는 순서가 없다.
- **배치**: 파티션마다 리더 브로커와 복제본이 정해진다(8편).

## 키로 파티션 고르기
프로듀서는 메시지에 키가 있으면 키의 해시를 파티션 수로 나눈 나머지로 파티션을 고른다(자바 클라이언트와 콘솔 도구는 murmur2 해시를 쓴다). 그래서 같은 키는 늘 같은 파티션으로 가고, **같은 키끼리의 순서는 지켜진다**. 주문 하나의 "생성 → 결제 → 배송" 이벤트를 주문 ID를 키로 쓰면, 받는 쪽이 결제보다 배송을 먼저 보는 일이 없다.

키가 없는 메시지는 어디로 갈까. 예전에는 한 개씩 파티션을 돌아가며 보냈지만(라운드 로빈), 카프카 2.4부터는 한 파티션에 메시지를 모아 묶음(배치, 5편)을 채운 뒤 다음 파티션으로 넘어가는 **스티키 파티셔너**가 기본이다. 묶음이 커져 효율이 좋다. 키가 없으면 순서에 대한 보장도 없다.

## 직접 해 보기: 순서는 어디까지 지켜지나
사용자 세 명이 번갈아 가며 단계 1~3의 이벤트를 쓴다. 쓴 순서는 `minji-1, sora-1, jun-1, minji-2, …`다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
kafka-topics.sh --bootstrap-server $K --create --topic events --partitions 3 --replication-factor 1 > /dev/null
for step in 1 2 3; do for user in minji sora jun; do echo "$user:$user-step$step"; done; done \
  | kafka-console-producer.sh --bootstrap-server $K --topic events \
      --reader-property parse.key=true --reader-property key.separator=:
consume() {
  kafka-console-consumer.sh --bootstrap-server $K --topic events --from-beginning --timeout-ms 4000 \
    --formatter-property print.partition=true 2>/dev/null
}
consume > read.txt
echo "읽은 순서: $(cut -f2 read.txt | tr '\n' ' ')"
for p in 0 1 2; do echo "파티션 $p: $(grep "^Partition:$p" read.txt | cut -f2 | tr '\n' ' ')"; done
```
```text
읽은 순서: …
파티션 0: jun-step1 jun-step2 jun-step3 
파티션 1: sora-step1 sora-step2 sora-step3 
파티션 2: minji-step1 minji-step2 minji-step3 
```
전체를 읽은 순서는 쓴 순서와 다르고, 실행할 때마다 달라질 수 있어 가렸다. 컨슈머가 파티션 셋을 각자의 속도로 가져오기 때문이다. 하지만 파티션 안에서는, 즉 사용자별로는 단계 1 → 2 → 3이 정확히 지켜졌다. 카프카가 보장하는 순서는 이것이 전부다. "모든 이벤트의 전체 순서"가 필요하면 파티션을 하나로 해야 하고, 그러면 병렬로 읽을 수 없다.

## 파티션을 늘리면
트래픽이 늘어 파티션을 3개에서 4개로 늘렸다고 하자. 파티션은 늘릴 수는 있어도 줄일 수는 없다. 그리고 "해시 % 파티션 수"의 나머지가 바뀌므로, 일부 키가 다른 파티션으로 간다.
```bash
kafka-topics.sh --bootstrap-server $K --alter --topic events --partitions 4
echo 'sora:sora-step4' | kafka-console-producer.sh --bootstrap-server $K --topic events \
  --reader-property parse.key=true --reader-property key.separator=:
consume | grep 'sora'
kafka-server-stop.sh > /dev/null 2>&1
```
```text
Partition:1	sora-step1
Partition:1	sora-step2
Partition:1	sora-step3
Partition:2	sora-step4
```
`sora`의 1~3단계는 파티션 1에 있는데, 늘린 뒤의 4단계는 파티션 2로 갔다. 두 파티션은 서로 다른 컨슈머가 다른 속도로 읽을 수 있으므로, 받는 쪽에서 4단계를 3단계보다 먼저 볼 수도 있다. 웹 앱의 원리 18편에서 "해시 % 서버 수"가 서버 수를 바꿀 때 키를 대거 옮겼던 것과 같은 문제다. 그래서 순서가 중요한 토픽은 처음부터 넉넉하게 파티션을 잡고, 늘려야 하면 새 토픽을 만들어 옮기는 방법을 쓰기도 한다.

## 파티션 수 정하기와 쏠림
- **처리량에서 거꾸로 계산**: 목표 처리량을 파티션 하나가 감당하는 처리량(프로듀서 쪽, 컨슈머 쪽 중 작은 것)으로 나눈다. 컨슈머가 메시지 하나에 10ms를 쓴다면 파티션 하나는 초당 100개가 한계이므로, 초당 1,000개에는 파티션이 10개 이상 필요하다.
- **너무 많아도 비용**: 파티션마다 파일, 메모리, 메타데이터가 들고, 장애 조치와 리밸런스(6편)가 느려진다. 수만 개를 쓰기 전에 다시 생각한다.
- **쏠림**(hot partition): 키 하나에 트래픽이 몰리면(유명인 계정, 대형 거래처) 그 키의 파티션만 바빠진다. 파티션을 늘려도 소용없다. 키를 더 잘게 나누거나(`account-7:shard-3`), 순서가 덜 중요한 이벤트는 키 없이 보낸다.

## 흔한 오해
- "카프카는 순서를 보장한다": 파티션 안에서만이다. 토픽 전체의 순서가 필요하면 파티션이 하나여야 한다.
- "키가 같으면 영원히 같은 파티션이다": 파티션 수를 바꾸면 바뀐다. 프로듀서의 파티셔너를 다른 언어의 클라이언트로 바꿔도(해시 함수가 다르면) 바뀔 수 있다.
- "파티션은 많을수록 빠르다": 컨슈머 수와 처리량에 맞춰야 한다. 남는 파티션은 비용만 늘린다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 해시로 나누는 방식과 나눌 곳의 수가 바뀔 때의 문제를 로드 밸런서 쪽에서 본다.
- Redis 실무 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」: Redis 클러스터도 키를 해시 슬롯으로 나누고, 여러 키를 함께 다루려면 같은 슬롯에 모아야 한다.
- 추상 데이터 타입 심화 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」: 키를 해시해 자리를 정하는 같은 생각을 자료 구조 안에서 본다.

## 정리
- 파티션은 병렬 처리, 순서, 배치의 단위다.
- 키가 있으면 해시 % 파티션 수로 파티션이 정해져, 같은 키의 순서가 지켜진다. 키가 없으면 스티키 파티셔너가 묶음 단위로 돌아가며 보낸다.
- 순서는 파티션 안에서만 지켜진다. 파티션 수를 늘리면 일부 키가 옮겨 가 순서가 깨질 수 있다.
- 파티션 수는 처리량에서 거꾸로 계산하고, 특정 키로의 쏠림을 경계한다.

## 더 알아보기
- 이전 글: 2편 「설치와 첫 메시지: KRaft 브로커와 콘솔 도구」
- 다음 글: 4편 「오프셋과 보존: 읽어도 사라지지 않는 메시지」
