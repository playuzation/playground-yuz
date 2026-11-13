# [카프카 이벤트 스트리밍 4/12] 오프셋과 보존: 읽어도 사라지지 않는 메시지

> **한 줄 요약** — 파티션의 메시지는 0부터 하나씩 늘어나는 오프셋을 받고, 컨슈머 그룹은 어디까지 읽었는지 오프셋으로 커밋해 두며, 로그는 세그먼트 파일 단위로 보존 기간이나 크기를 넘으면 앞에서부터 지워지므로, 보존 기간 안이라면 그룹의 오프셋을 되돌려 언제든 다시 읽을 수 있다.

## 이 글에서 다루는 것
- 오프셋의 세 기준점: 로그 시작, 로그 끝, 커밋한 위치
- 처음 읽는 그룹은 어디서 시작하나: `auto.offset.reset`
- 세그먼트와 보존: 시간·크기, 활성 세그먼트
- 직접 해 보기: 세그먼트가 생기고 지워지는 장면, 오프셋 되돌려 다시 읽기

## 오프셋의 기준점
파티션 하나는 로그 하나이고, 메시지는 쓰인 순서대로 0, 1, 2…의 **오프셋**을 받는다. 오프셋은 파티션마다 따로이고, 한 번 정해지면 바뀌지 않는다. 몇 가지 위치가 중요하다.
- **로그 시작 오프셋**: 아직 남아 있는 가장 오래된 메시지. 보존 기간이 지나 앞부분이 지워지면 커진다.
- **로그 끝 오프셋**(LEO): 다음에 쓸 메시지가 받을 번호.
- **하이 워터마크**: 복제본들이 모두 받아 "읽어도 되는" 끝. 복제가 없으면 로그 끝과 같다(8편).
- **커밋한 오프셋**: 컨슈머 그룹이 "여기까지 처리했다"고 카프카에 기록해 둔 위치(정확히는 다음에 읽을 오프셋). 그룹이 다시 시작하면 여기서 이어 읽는다(7편).

커밋한 오프셋이 없는 새 그룹은 `auto.offset.reset` 설정을 따른다. `latest`(기본값)면 지금부터 들어오는 것만, `earliest`면 남아 있는 가장 오래된 것부터 읽는다. 콘솔 컨슈머의 `--from-beginning`이 `earliest`다.

## 세그먼트와 보존
파티션의 로그는 하나의 큰 파일이 아니라 **세그먼트** 파일들로 나뉜다(2편에서 본 `00000000000000000000.log`). 지금 쓰고 있는 마지막 세그먼트를 **활성 세그먼트**라고 하고, 크기(`segment.bytes`, 기본 1GB)나 나이(`segment.ms`, 기본 7일)를 넘으면 닫고 새 세그먼트를 연다. 보존 정책은 세그먼트 단위로 적용된다.
- `retention.ms`(기본 7일): 세그먼트의 가장 새 메시지가 이보다 오래되면 그 세그먼트를 통째로 지운다.
- `retention.bytes`(기본 무제한): 파티션 전체 크기가 이를 넘으면 오래된 세그먼트부터 지운다.
- 지금 쓰고 있는 활성 세그먼트는 그대로 지우지 않는다. 그 안의 메시지까지 모두 기한을 넘기면 새 빈 세그먼트를 열고 나서 옛 세그먼트를 지운다.

## 직접 해 보기 1: 세그먼트가 생기고 지워지는 장면
기본값으로는 며칠을 기다려야 하므로, 이 실습에서는 세그먼트를 2초마다 닫고(`segment.ms=2000`) 6초가 지난 세그먼트를 지우게(`retention.ms=6000`) 줄이고, 브로커가 보존 기한을 1초마다 확인하게 한다.
```bash
export PATH="$PATH:/opt/kafka/bin"
sed "s#^log.dirs=.*#log.dirs=$PWD/kafka-data#" /opt/kafka/config/server.properties > server.properties
echo 'log.retention.check.interval.ms=1000' >> server.properties
kafka-storage.sh format --standalone -t "$(kafka-storage.sh random-uuid)" -c server.properties > /dev/null
kafka-server-start.sh server.properties > broker.log 2>&1 &
until kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do sleep 0.5; done
K=localhost:9092
kafka-topics.sh --bootstrap-server $K --create --topic logs --partitions 1 --replication-factor 1 \
  --config segment.ms=2000 --config retention.ms=6000 > /dev/null
put() { printf '%s\n' "$@" | kafka-console-producer.sh --bootstrap-server $K --topic logs; }
put m0 m1 m2; sleep 2.5
put m3 m4 m5; sleep 2.5
put m6 m7 m8
ls kafka-data/logs-0 | grep '\.log$'
offsets() { echo "시작 $(kafka-get-offsets.sh --bootstrap-server $K --topic logs --time -2 | cut -d: -f3), 끝 $(kafka-get-offsets.sh --bootstrap-server $K --topic logs --time -1 | cut -d: -f3)"; }
offsets
```
```text
00000000000000000000.log
00000000000000000003.log
00000000000000000006.log
시작 0, 끝 9
```
세 묶음이 세그먼트 세 개로 나뉘었다. 파일 이름이 그 세그먼트의 첫 오프셋이다(0, 3, 6). `--time -2`는 로그 시작, `--time -1`은 로그 끝 오프셋을 묻는다. 이제 보존 기간이 지나기를 기다린다.
```bash
until [ "$(kafka-get-offsets.sh --bootstrap-server $K --topic logs --time -2 | cut -d: -f3)" = 9 ]; do sleep 1; done
offsets
ls kafka-data/logs-0 | grep '\.log$'
kafka-console-consumer.sh --bootstrap-server $K --topic logs --from-beginning --timeout-ms 4000 2>/dev/null | tr '\n' ' '; echo
```
```text
시작 9, 끝 9
00000000000000000009.log

```
브로커가 1초마다 확인하다가, 세 세그먼트의 메시지가 모두 6초를 넘긴 시점에 한꺼번에 지웠다. 마지막(활성) 세그먼트는 먼저 새 빈 세그먼트(`…09.log`)로 바꿔 끼운 뒤 지웠다. 그래서 로그 시작 오프셋과 끝 오프셋이 모두 9이고, 처음부터 읽어도 아무것도 나오지 않는다(마지막 빈 줄). 오프셋은 9부터 이어진다. 지워진 번호를 다시 쓰는 일은 없다. 실제 설정(7일 보존)에서는 "지난 7일 치는 언제든 다시 읽을 수 있다"는 뜻이 된다.

## 직접 해 보기 2: 되돌려 다시 읽기
보존 기간 안의 메시지는 그룹의 커밋한 오프셋을 되돌려 다시 처리할 수 있다. 분석 코드의 버그를 고친 뒤 지난 데이터를 다시 계산하는 일이 대표적이다. 그룹이 실행 중이 아닐 때 `kafka-consumer-groups.sh --reset-offsets`로 되돌린다.
```bash
kafka-topics.sh --bootstrap-server $K --create --topic sales --partitions 1 --replication-factor 1 > /dev/null
printf '%s\n' 100 250 80 400 120 | kafka-console-producer.sh --bootstrap-server $K --topic sales
read_group() {
  kafka-console-consumer.sh --bootstrap-server $K --topic sales --group report --from-beginning \
    --timeout-ms 4000 2>/dev/null | tr '\n' ' '; echo
}
echo "처음 읽기: $(read_group)"
echo "다시 읽기: $(read_group)(커밋한 위치 다음부터라 없음)"
kafka-consumer-groups.sh --bootstrap-server $K --group report --topic sales --reset-offsets --to-earliest --execute \
  | awk '$1 == "report" { print "되돌린 위치:", $4 }'
echo "되돌린 뒤: $(read_group)"
kafka-consumer-groups.sh --bootstrap-server $K --group report --topic sales --reset-offsets --shift-by -2 --execute > /dev/null
echo "두 칸만 되돌린 뒤: $(read_group)"
kafka-server-stop.sh > /dev/null 2>&1
```
```text
처음 읽기: 100 250 80 400 120 
다시 읽기: (커밋한 위치 다음부터라 없음)
되돌린 위치: 0
되돌린 뒤: 100 250 80 400 120 
두 칸만 되돌린 뒤: 400 120 
```
`--to-earliest` 말고도 `--to-offset`, `--to-datetime 2026-11-01T00:00:00.000`(그 시각 이후의 첫 메시지), `--shift-by -2`(지금 위치에서 두 칸 뒤로)로 위치를 정한다. 먼저 `--dry-run`으로 결과를 보고 `--execute`로 적용하는 습관이 좋다. 같은 메시지를 다시 처리하게 되므로, 처리 결과가 중복되지 않게(멱등하게) 만들어 두어야 한다(웹 앱의 원리 14편).

## 흔한 오해
- "보존 기간이 지나면 그 메시지가 바로 지워진다": 세그먼트 단위로, 세그먼트의 가장 새 메시지가 기한을 넘어야 지워진다. 그래서 큰 세그먼트에 든 오래된 메시지는 기한보다 오래 남을 수 있다.
- "읽은 메시지는 디스크를 비운다": 읽기와 보존은 무관하다. 아무도 읽지 않아도 지워지고, 모두가 읽어도 기한 전에는 남는다.
- "오프셋은 토픽 전체에 하나다": 파티션마다 따로다. 파티션 0의 오프셋 5와 파티션 1의 오프셋 5는 아무 관계가 없다.

## 어디에 쓰이나
- Redis 실무 6편 「메시징: Pub/Sub과 스트림」: 스트림의 ID와 `MAXLEN` 잘라 내기가 카프카의 오프셋과 보존에 해당한다.
- PostgreSQL 실무 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 로그를 남겨 두었다가 원하는 시점까지 다시 적용하는 생각이 같다.
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 같은 메시지를 다시 처리해도 안전하게 만드는 멱등성이 다시 읽기의 짝이다.

## 정리
- 오프셋은 파티션마다 0부터 늘어나는 번호다. 로그 시작·끝, 하이 워터마크, 그룹이 커밋한 위치를 구분한다.
- 새 그룹은 `auto.offset.reset`(earliest·latest)에 따라 시작 위치를 정한다.
- 로그는 세그먼트로 나뉘고, 보존 기간·크기를 넘은 세그먼트가 통째로 지워진다. 활성 세그먼트는 닫힐 때까지 남는다.
- 보존 기간 안이라면 `--reset-offsets`로 그룹을 되돌려 다시 처리할 수 있다. 처리는 멱등하게 만든다.

## 더 알아보기
- 이전 글: 3편 「토픽과 파티션: 순서는 파티션 안에서만 지켜진다」
- 다음 글: 5편 「프로듀서: acks, 배치, 압축, 멱등성」
