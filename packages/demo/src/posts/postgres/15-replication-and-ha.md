# [PostgreSQL 실무 15/16] 복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치

> **한 줄 요약** — 스트리밍 복제는 대기 서버가 주 서버의 WAL을 실시간으로 받아 재생해 클러스터 전체를 읽기 전용으로 따라가고, 논리 복제는 테이블 단위 행 변경을 독립 서버로 보내며, 어느 쪽이든 복제 지연과 장애 조치 때의 손실을 설계에 넣어야 한다.

## 이 글에서 다루는 것
- 스트리밍 복제의 구조: walsender, walreceiver, 복제 슬롯
- 컨테이너 두 개로 주 서버와 대기 서버를 띄워 확인하기
- 복제 지연과 지연된 읽기, 동기 복제의 대가
- 논리 복제(PUBLICATION/SUBSCRIPTION)와 승격

## 문제: 서버 한 대의 한계
서버가 한 대면 호스트가 죽는 순간 서비스가 멈춘다. 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」의 시점 복구는 백업을 풀고 WAL을 재생하느라 오래 걸리고, 읽기 부하를 나눌 곳도 없다. 그래서 늘 최신 상태를 따라가는 사본 서버를 둔다.

## 원리: 복구를 끝내지 않는 서버
14편의 복구는 WAL을 목표 시각까지 재생하고 끝났다. **대기 서버**(standby)는 복구를 끝내지 않고 주 서버(primary)의 WAL을 네트워크로 계속 받아 재생한다.
```text
primary                    standby
write → WAL → walsender ─TCP─┐
                             ↓
          replay ← WAL ← walreceiver
```
- 주 서버의 **walsender**가 WAL을 보내고, 대기 서버의 **walreceiver**가 받아 디스크에 쓰고, startup 프로세스가 재생한다.
- 재생 중에도 읽기 쿼리는 받고(`hot_standby`, 기본 on) 쓰기는 거부한다.
- **복제 슬롯**(replication slot)은 대기 서버가 아직 받지 않은 WAL을 주 서버가 지우지 못하게 붙잡는다. 대기 서버가 오래 죽어 있으면 디스크가 차므로 `max_slot_wal_keep_size`로 상한을 둔다.
- 바이트 단위 복제라 주 버전과 CPU 아키텍처가 같아야 하고, 클러스터 전체가 따라간다.

## 따라 하기: 주 서버와 대기 서버
사용자 정의 네트워크(도커와 컨테이너 8편 「컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS」)에 주 서버를 띄운다. 스트리밍 복제는 기본값 `wal_level=replica`로 충분하지만 뒤의 논리 복제를 위해 `logical`로 띄운다. 복제 전용 롤을 만들고 `pg_hba.conf`에 복제 연결 줄을 더한다. 데이터베이스 칸의 `all`은 물리 복제 연결과 맞지 않아, 이 줄이 없으면 `no pg_hba.conf entry for replication connection` 오류가 난다. 셸 함수 `p`는 결과와 오류의 순서가 섞이지 않게 컨테이너 안에서 둘을 합친다.
```bash
docker network create repl-net >/dev/null
docker run -d --name pg-primary --network repl-net \
  -e POSTGRES_PASSWORD=example-password postgres:18-alpine \
  -c wal_level=logical >/dev/null
until docker exec pg-primary pg_isready -q -h 127.0.0.1; do sleep 0.2; done
p() { docker exec pg-primary sh -c 'psql -U postgres "$@" 2>&1' - "$@"; }
p -c "CREATE ROLE repl WITH REPLICATION LOGIN PASSWORD 'example-password'"
docker exec pg-primary sh -c \
  'echo "host replication repl all scram-sha-256" >> "$PGDATA/pg_hba.conf"'
p -Atc "SELECT pg_reload_conf()"
```
```text
CREATE ROLE
t
```
대기 서버의 데이터 디렉터리는 `pg_basebackup`으로 만든다. `-R`은 `standby.signal` 파일과 접속 설정(`primary_conninfo`)을 써 주고, `-C -S standby1`은 주 서버에 슬롯을 만든다. `cluster_name`은 주 서버에서 이 대기 서버를 부르는 이름이 된다.
```bash
docker run --rm --network repl-net -v standby-data:/var/lib/postgresql \
  -u postgres -e PGPASSWORD=example-password postgres:18-alpine \
  pg_basebackup -h pg-primary -U repl -D /var/lib/postgresql/18/docker \
  -R -X stream -C -S standby1 -c fast
docker run -d --name pg-standby --network repl-net \
  -v standby-data:/var/lib/postgresql postgres:18-alpine \
  -c cluster_name=standby1 >/dev/null
s() { docker exec pg-standby sh -c 'psql -U postgres "$@" 2>&1' - "$@"; }
until [ "$(p -Atc 'SELECT state FROM pg_stat_replication')" = streaming ]; do sleep 0.2; done
p -c "SELECT application_name, state, sync_state FROM pg_stat_replication"
```
```text
 application_name |   state   | sync_state
------------------+-----------+------------
 standby1         | streaming | async
(1 row)
```
주 서버에 쓰면 대기 서버에서 읽힌다. 비동기라 도착 시점이 정해져 있지 않으니 행 수가 맞을 때까지 기다렸다가 확인한다.
```bash
p -c "CREATE TABLE orders (id int PRIMARY KEY, item text)" \
  -c "INSERT INTO orders SELECT g, 'item' || g FROM generate_series(1, 100) g"
until [ "$(s -Atc 'SELECT count(*) FROM orders')" = 100 ]; do sleep 0.2; done
s -c "SELECT pg_is_in_recovery(), count(*) FROM orders"
s -c "INSERT INTO orders VALUES (999, 'x')"
```
```text
CREATE TABLE
INSERT 0 100
 pg_is_in_recovery | count
-------------------+-------
 t                 |   100
(1 row)

ERROR:  cannot execute INSERT in a read-only transaction
```

## 복제 지연과 지연된 읽기
`pg_stat_replication`은 WAL 위치 네 개를 보여 준다. 보냄(`sent_lsn`) → 대기 서버 OS에 씀(`write_lsn`) → 디스크 기록(`flush_lsn`) → 재생(`replay_lsn`). 위치 차이(`pg_wal_lsn_diff`)가 바이트 단위 지연, `replay_lag` 같은 열이 시간 단위 지연이다. 읽기를 대기 서버로 보내는 앱은 "방금 쓴 것이 안 보이는" 문제를 겪는다. 재생을 멈춰 지연을 만든다.
```bash
s -c "SELECT pg_wal_replay_pause()" >/dev/null
p -c "INSERT INTO orders VALUES (101, 'item101')"
until [ "$(s -Atc 'SELECT pg_get_wal_replay_pause_state()')" = paused ]; do sleep 0.2; done
s -Atc "SELECT count(*) FROM orders"
p -Atc "SELECT sent_lsn = flush_lsn, pg_wal_lsn_diff(sent_lsn, replay_lsn) > 0 FROM pg_stat_replication"
s -c "SELECT pg_wal_replay_resume()" >/dev/null
until [ "$(s -Atc 'SELECT count(*) FROM orders')" = 101 ]; do sleep 0.2; done
```
```text
INSERT 0 1
100
t|t
```
WAL은 대기 서버 디스크까지 갔지만(`sent = flush`) 재생되지 않아 대기 서버에서는 100행이다. 실제 지연은 대기 서버의 긴 쿼리, 네트워크, 대량 쓰기(13편의 백필) 때문에 생긴다. 방금 쓴 데이터를 다시 읽는 화면은 주 서버에서 읽는다.

## 동기 복제: 커밋이 대기 서버를 기다린다
비동기 복제는 주 서버가 커밋 직후 죽으면 아직 못 보낸 트랜잭션을 잃는다. `synchronous_standby_names`에 대기 서버를 적으면 커밋이 그 서버의 디스크 기록 확인을 기다린다. 대신 대기 서버가 죽으면 쓰기가 멈춘다.
```bash
p -c "ALTER SYSTEM SET synchronous_standby_names = 'standby1'" \
  -c "SELECT pg_reload_conf()" >/dev/null
until [ "$(p -Atc 'SELECT sync_state FROM pg_stat_replication')" = sync ]; do sleep 0.2; done
docker stop pg-standby >/dev/null
p -c "INSERT INTO orders VALUES (102, 'item102')" > insert.log &
until [ "$(p -Atc "SELECT count(*) FROM pg_stat_activity WHERE wait_event = 'SyncRep'")" = 1 ]; do sleep 0.2; done
p -Atc "SELECT wait_event, query FROM pg_stat_activity WHERE wait_event = 'SyncRep'"
p -Atc "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE wait_event = 'SyncRep'"
wait; cat insert.log
```
```text
SyncRep|INSERT INTO orders VALUES (102, 'item102')
t
WARNING:  canceling wait for synchronous replication due to user request
DETAIL:  The transaction has already committed locally, but might not have been replicated to the standby.
INSERT 0 1
```
INSERT는 `SyncRep` 대기 이벤트에서 멈춰 있었고, 취소하자 "로컬에는 이미 커밋됐다"는 경고와 함께 끝났다. 동기 복제는 커밋 확인을 늦출 뿐 로컬 커밋을 되돌리지 않는다. 그래서 대기 서버를 둘 이상 두고 `ANY 1 (s1, s2)`처럼 하나만 확인하게 한다. 설정을 되돌리고 대기 서버를 다시 붙인다.
```bash
p -c "ALTER SYSTEM RESET synchronous_standby_names" -c "SELECT pg_reload_conf()" >/dev/null
docker start pg-standby >/dev/null
until [ "$(s -Atc 'SELECT count(*) FROM orders')" = 102 ]; do sleep 0.2; done
```

## 논리 복제: 테이블 단위로 다른 서버에
**논리 복제**는 WAL을 행 단위 변경(INSERT·UPDATE·DELETE)으로 풀어 보낸다. 받는 쪽은 독립된 서버라 주 버전이 달라도 되고, 일부 테이블만 받고, 직접 쓸 수도 있다. 보내는 쪽에 **발행**(PUBLICATION), 받는 쪽에 **구독**(SUBSCRIPTION)을 만든다. DDL은 복제되지 않아 테이블은 미리 만든다.
```bash
docker run -d --name pg-sub --network repl-net \
  -e POSTGRES_PASSWORD=example-password postgres:18-alpine >/dev/null
until docker exec pg-sub pg_isready -q -h 127.0.0.1; do sleep 0.2; done
b() { docker exec pg-sub sh -c 'psql -U postgres "$@" 2>&1' - "$@"; }
p -c "CREATE PUBLICATION pub_orders FOR TABLE orders" -c "GRANT SELECT ON orders TO repl"
b -c "CREATE TABLE orders (id int PRIMARY KEY, item text, note text)"
b -c "CREATE SUBSCRIPTION sub_orders
  CONNECTION 'host=pg-primary dbname=postgres user=repl password=example-password'
  PUBLICATION pub_orders"
```
```text
CREATE PUBLICATION
GRANT
CREATE TABLE
NOTICE:  created replication slot "sub_orders" on publisher
CREATE SUBSCRIPTION
```
구독을 만들면 기존 행을 먼저 복사하고(초기 동기화), 그 뒤 변경을 따라간다. 받는 쪽 테이블에는 열이 더 있어도 되고, 열은 이름으로 맞춘다.
```bash
until [ "$(b -Atc "SELECT count(*) FROM pg_subscription_rel WHERE srsubstate <> 'r'")" = 0 ]; do sleep 0.2; done
p -c "UPDATE orders SET item = 'changed' WHERE id = 1"
until [ "$(b -Atc 'SELECT item FROM orders WHERE id = 1')" = changed ]; do sleep 0.2; done
b -c "SELECT count(*), max(id), (SELECT item FROM orders WHERE id = 1) FROM orders"
p -Atc "SELECT slot_name, slot_type, active FROM pg_replication_slots ORDER BY 1"
```
```text
UPDATE 1
 count | max |  item
-------+-----+---------
   102 | 102 | changed
(1 row)

standby1|physical|t
sub_orders|logical|t
```
주 서버에는 물리 슬롯과 논리 슬롯이 하나씩 있다. 받는 쪽이 쓰기 가능하다는 점은 함정이다. 거기 직접 넣은 행과 같은 키가 복제되어 오면 적용이 실패하고 복제가 멈춘다. 논리 복제는 주 버전 업그레이드(16편)나 일부 테이블을 분석용 서버로 보내는 데 쓴다.

## 승격과 장애 조치
주 서버가 죽으면 대기 서버를 **승격**(promote)한다. `pg_promote()`는 복구를 끝내고 새 타임라인을 시작한다.
```bash
docker stop pg-primary >/dev/null
s -Atc "SELECT pg_promote()" -c "SELECT pg_is_in_recovery()"
s -Atc "SELECT pg_walfile_name(pg_current_wal_lsn())"
s -c "INSERT INTO orders VALUES (103, 'after failover')"
```
```text
t
f
00000002…
INSERT 0 1
```
WAL 파일 이름이 타임라인 2로 바뀌었고 쓰기가 된다. 실제 장애 조치에는 할 일이 더 있다.
- 옛 주 서버가 살아나 쓰기를 받으면 주 서버가 둘인 **분할 뇌**(split brain)가 된다. 옛 주 서버는 확실히 막고(fencing), `pg_rewind`나 새 베이스 백업으로 대기 서버로 다시 붙인다.
- 앱의 접속 대상도 바뀐다. libpq는 `host=a,b target_session_attrs=read-write`로 쓰기 가능한 서버를 골라 붙는다.
- 감지·승격·재구성은 Patroni 같은 도구가 etcd 같은 합의 저장소로 리더를 정해 자동화한다.
- 논리 복제 슬롯은 기본적으로 대기 서버에 없어 장애 조치 뒤 구독이 끊긴다. PostgreSQL 17부터 구독의 `failover` 옵션과 대기 서버의 `sync_replication_slots`로 동기화할 수 있다.
```bash
docker rm -fv pg-primary pg-standby pg-sub >/dev/null
docker volume rm standby-data && docker network rm repl-net
```
```text
standby-data
repl-net
```

## 숫자로 보기
동기 대기 서버가 있을 때 `synchronous_commit` 값별로 커밋이 기다리는 것이다.
| 값 | 커밋이 기다리는 것 |
|---|---|
| `local` | 주 서버 디스크 기록 |
| `remote_write` | + 대기 서버 OS에 전달 |
| `on`(기본) | + 대기 서버 디스크 기록 |
| `remote_apply` | + 대기 서버 재생(읽기 가능) |

## 어디에 쓰이나
- 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 대기 서버는 WAL 재생이라는 같은 메커니즘을 끝없이 이어 가는 복구다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: walsender와 walreceiver는 연결마다 생기는 별도 프로세스이고, 사이를 잇는 것은 운영체제의 TCP 소켓이다.

## 정리
- 스트리밍 복제는 WAL을 실시간으로 받아 재생하는 끝나지 않는 복구이고, 대기 서버는 읽기 전용이다.
- 비동기 복제는 방금 쓴 데이터가 안 보일 수 있고, 장애 때 마지막 트랜잭션을 잃을 수 있다.
- 동기 복제는 커밋을 대기 서버 확인까지 늦추고, 대기 서버 하나의 장애가 쓰기 장애가 된다.
- 논리 복제는 테이블 단위로 독립 서버에 보내고, 승격 뒤에는 분할 뇌 방지와 접속 전환이 필요하다.

## 더 알아보기
- 이전 글: 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」
- 다음 글: 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」
- PostgreSQL 문서 "Log-Shipping Standby Servers": https://www.postgresql.org/docs/current/warm-standby.html
