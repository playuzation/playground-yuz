# [PostgreSQL 실무 10/16] MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈

> **한 줄 요약** — PostgreSQL의 UPDATE·DELETE는 행을 고쳐 쓰지 않고 `xmin`·`xmax`가 붙은 버전을 쌓아 읽기와 쓰기가 서로 막지 않게 하는 대신, 아무에게도 안 보이게 된 죽은 버전은 VACUUM이 치워야 하고, 32비트 트랜잭션 ID가 한 바퀴 돌기 전에 오래된 행을 동결해야 한다.

## 이 글에서 다루는 것
- 행 버전과 시스템 열 `xmin`·`xmax`·`ctid`, 스냅숏 가시성
- 죽은 튜플과 테이블 팽창, VACUUM 대 VACUUM FULL(잠금 차이)
- autovacuum 임계값, HOT 업데이트와 fillfactor
- 트랜잭션 ID 고갈과 동결, 오래 열린 트랜잭션이 VACUUM을 막는 문제

## 문제: 지운 만큼 줄지 않는 테이블
자주 갱신하는 테이블이 행 수는 그대로인데 몇 배로 커지고, 큰 DELETE를 해도 디스크가 줄지 않고, 몇 시간 열려 있던 트랜잭션 하나를 끝내자 갑자기 정리가 된다. 모두 **다중 버전 동시성 제어**(MVCC, multiversion concurrency control)에서 나온다. 9편의 스냅숏이 어떻게 구현되는지 보면 이유가 보인다.

## 원리: 행은 고쳐 쓰지 않고 버전을 쌓는다
각 행 버전(튜플)의 머리말에는 `xmin`(이 버전을 만든 트랜잭션 ID, XID), `xmax`(이 버전을 지우거나 대체한 XID, 없으면 0)가 있고, `ctid`는 (페이지 번호, 페이지 안 위치)로 된 물리 주소다. INSERT는 xmin을 채운 버전을 쓰고, DELETE는 기존 버전의 xmax만 채우며, UPDATE는 옛 버전의 xmax를 채우고 새 버전을 다른 자리에 쓴다.

버전이 내 스냅숏에 보이려면 xmin이 커밋됐고 스냅숏 이전이어야 하며, xmax는 비었거나 중단됐거나 스냅숏 이후여야 한다. 커밋·중단 여부는 커밋 로그(`pg_xact`)에 적힌다. 쓰는 중에도 옛 버전을 보면 되므로 읽기가 쓰기를 기다리지 않는다.

## 따라 하기 1: 행 버전 들여다보기
결과는 PostgreSQL 18.6 기준이다. XID 값은 환경마다 다르며, 여기 값은 새로 띄운 서버에서 매번 같게 나온 값이다.
```sql
CREATE TABLE items (id int PRIMARY KEY, qty int);
INSERT INTO items VALUES (1, 0), (2, 0), (3, 0);
UPDATE items SET qty = 1 WHERE id = 2;
SELECT xmin, xmax, ctid, * FROM items;
```
```text
CREATE TABLE
INSERT 0 3
UPDATE 1
 xmin | xmax | ctid  | id | qty
------+------+-------+----+-----
  754 |    0 | (0,1) |  1 |   0
  754 |    0 | (0,3) |  3 |   0
  755 |    0 | (0,4) |  2 |   1
(3 rows)
```
id 2는 XID 755가 만든 새 버전으로 (0,4)에 있다. 이제 연결 두 개로 커밋 전의 모습을 본다. 접속 정보는 libpq 환경 변수(`PG*`)로 준다.
```python
import psycopg
a = psycopg.connect(autocommit=True)
b = psycopg.connect(autocommit=True)
ROW = "SELECT xmin::text, xmax::text, ctid::text, qty FROM items WHERE id = 2"
a.execute("BEGIN")
a.execute("UPDATE items SET qty = 2 WHERE id = 2")
print("a의 XID", a.execute("SELECT pg_current_xact_id()::text").fetchone()[0])
print("a가 보는 행", a.execute(ROW).fetchone())
print("b가 보는 행", b.execute(ROW).fetchone())
a.execute("ROLLBACK")
print("롤백 뒤 b", b.execute(ROW).fetchone())
```
```text
a의 XID 756
a가 보는 행 ('756', '0', '(0,5)', 2)
b가 보는 행 ('755', '756', '(0,4)', 1)
롤백 뒤 b ('755', '756', '(0,4)', 1)
```
a는 자기가 쓴 (0,5)를, b는 xmax에 756이 찍힌 (0,4)를 본다. 756이 커밋 전이니 b에게 (0,4)는 살아 있고, 롤백 뒤에는 xmax가 그대로여도 756이 중단됐으니 여전히 산 버전이다. ROLLBACK은 되돌릴 데이터를 쓰지 않고 커밋 로그에 "중단"만 적어 즉시 끝나며, a가 만든 (0,5)와 755가 대체한 처음의 (0,2)는 누구에게도 보이지 않는 **죽은 튜플**(dead tuple)로 페이지에 남는다(contrib 확장 pageinspect의 `heap_page_items`로 페이지를 열면 직접 보인다).

## 따라 하기 2: 팽창, VACUUM, VACUUM FULL, HOT
행 10만 개 테이블을 통째로 갱신하며 잰다. 죽은 튜플은 contrib 확장 pgstattuple(테이블을 다 읽어 센다)로 세고 autovacuum은 껐다. `snap`이 단계마다 측정값을 `log`에 남긴다. 6·7단계의 `hot`은 `fillfactor = 50`으로 페이지를 절반만 채운 테이블이다. **HOT 업데이트**(heap-only tuple)는 인덱스가 참조하는 열을 바꾸지 않고 같은 페이지에 빈 공간이 있으면 새 버전을 같은 페이지에 두고 인덱스 항목을 추가하지 않는데, fillfactor를 낮추면 그 빈칸이 생긴다(공식 문서).
```sql
CREATE EXTENSION pgstattuple;
CREATE TABLE log (step text, size text, dead bigint, free_pct numeric, index text);
CREATE PROCEDURE snap(step text, t regclass) LANGUAGE sql AS $$
  INSERT INTO log SELECT step, pg_size_pretty(table_len), dead_tuple_count,
         round(free_percent), pg_size_pretty(pg_indexes_size(t))
  FROM pgstattuple(t) $$;
CREATE TABLE bloat (id int PRIMARY KEY, v int) WITH (autovacuum_enabled = off);
INSERT INTO bloat SELECT g, 0 FROM generate_series(1, 100000) g;
CALL snap('1 적재', 'bloat');
UPDATE bloat SET v = v + 1;
CALL snap('2 UPDATE', 'bloat');
VACUUM bloat;
CALL snap('3 VACUUM', 'bloat');
UPDATE bloat SET v = v + 1;
CALL snap('4 UPDATE', 'bloat');
VACUUM FULL bloat;
CALL snap('5 VACUUM FULL', 'bloat');
CREATE TABLE hot (id int PRIMARY KEY, v int)
  WITH (autovacuum_enabled = off, fillfactor = 50);
INSERT INTO hot SELECT g, 0 FROM generate_series(1, 100000) g;
CALL snap('6 hot 적재', 'hot');
UPDATE hot SET v = v + 1;
CALL snap('7 hot UPDATE', 'hot');
```
```sql
SELECT * FROM log ORDER BY step;
```
```text
     step      |  size   |  dead  | free_pct |  index
---------------+---------+--------+----------+---------
 1 적재        | 3544 kB |      0 |        1 | 2208 kB
 2 UPDATE      | 7080 kB | 100000 |        0 | 4408 kB
 3 VACUUM      | 7080 kB |      0 |       50 | 4408 kB
 4 UPDATE      | 7080 kB | 100000 |        0 | 4408 kB
 5 VACUUM FULL | 3544 kB |      0 |        1 | 2208 kB
 6 hot 적재    | 7080 kB |      0 |       50 | 2208 kB
 7 hot UPDATE  | 7080 kB | 100000 |        0 | 2208 kB
(7 rows)
```
UPDATE 한 번에 테이블과 인덱스가 두 배가 됐다. VACUUM은 죽은 튜플을 빈칸(50%)으로 만들 뿐 파일을 줄이지 않고, 다음 UPDATE가 그 빈칸을 다시 써서 더 커지지 않았다. 파일을 줄인 것은 테이블을 새 파일로 다시 쓰는 VACUUM FULL이다. `hot`은 처음부터 두 배 공간을 쓰지만 전체 UPDATE 뒤에도 인덱스가 2208 kB 그대로다. VACUUM FULL의 대가는 잠금이다. 다른 연결이 읽기 트랜잭션을 연 채로 `lock_timeout`을 걸고 둘을 실행해 본다.
```python
import psycopg
a = psycopg.connect(autocommit=True)
b = psycopg.connect(autocommit=True)
a.execute("BEGIN")
a.execute("SELECT count(*) FROM bloat")  # 읽기만 하는 중
b.execute("SET lock_timeout = '1s'")
for sql in ("VACUUM bloat", "VACUUM FULL bloat"):
    try:
        b.execute(sql); print(sql, "완료")
    except psycopg.errors.LockNotAvailable as e:
        print(sql, "실패:", e.diag.message_primary)
a.execute("COMMIT")
```
```text
VACUUM bloat 완료
VACUUM FULL bloat 실패: canceling statement due to lock timeout
```
공식 문서대로 VACUUM은 SHARE UPDATE EXCLUSIVE 잠금이라 읽기·쓰기와 함께 돌고, VACUUM FULL은 ACCESS EXCLUSIVE 잠금이라 SELECT까지 막으며 디스크도 한 벌 더 쓴다. 운영 중에는 autovacuum이 제때 돌게 조정하는 것이 정석이다.

## autovacuum은 언제 도나
autovacuum 런처는 `autovacuum_naptime`(기본 1분)마다 데이터베이스를 돌며, 죽은 튜플 추정치(`pg_stat_user_tables.n_dead_tup`)가 아래 임계값을 넘은 테이블을 VACUUM한다(PostgreSQL 18 문서).
```text
limit = min(max_threshold,
  threshold + scale_factor × rows)
```
`rows`는 행 수 추정치(`pg_class.reltuples`)이고, 설정 이름 앞에는 `autovacuum_vacuum_`이 붙는다. 기본값은 `threshold` 50, `scale_factor` 0.2, `max_threshold` 1억이다(18.6에서 `SHOW`로 확인). 10만 행이면 죽은 튜플 50 + 0.2 × 100,000 = 20,050개에서 돌고, 10억 행이면 2억이지만 18에서 생긴 상한이 1억에서 자른다. 큰 테이블은 `ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01)`처럼 테이블별로 낮추곤 한다.

## 트랜잭션 ID 고갈과 동결
XID는 32비트라 약 42억 개를 돌려 쓰고, 비교는 원형이라 각 XID에게 약 21억(2³¹)은 과거, 나머지는 미래다. 오래된 행의 xmin이 21억 넘게 뒤처지면 "미래의 행"이 되어 안 보이게 된다. 그래서 VACUUM은 충분히 오래된 행을 **동결**(freeze)해 모두에게 보이게 표시하고, 테이블마다 "이보다 오래된 XID는 다 동결됐다"는 `relfrozenxid`를 올린다. XID는 쓰기를 하는 트랜잭션만 받는다.
```sql
SELECT relname, age(relfrozenxid) FROM pg_class WHERE relname = 'items';
VACUUM (FREEZE) items;
SELECT relname, age(relfrozenxid) FROM pg_class WHERE relname = 'items';
```
```text
 relname | age
---------+-----
 items   |  23
(1 row)

VACUUM
 relname | age
---------+-----
 items   |   0
(1 row)
```
`age`가 `autovacuum_freeze_max_age`(기본 2억)를 넘으면 autovacuum을 꺼 둔 테이블에도 고갈 방지 VACUUM이 강제로 돌고, `vacuum_failsafe_age`(16억)를 넘으면 VACUUM이 인덱스 정리 등을 건너뛰고 동결부터 끝낸다. 공식 문서에 따르면 고갈까지 4천만 남으면 경고가, 3백만 남으면 `database is not accepting commands that assign new transaction IDs to avoid wraparound data loss` 오류로 쓰기가 멈추며, 이때는 VACUUM FULL이 아닌 일반 VACUUM으로 푼다.

## 오래 열린 트랜잭션이 VACUUM을 막는다
VACUUM은 열려 있는 가장 오래된 스냅숏이 볼 수 있는 버전을 지우지 못한다. a가 REPEATABLE READ 스냅숏을 연 동안 b가 500행을 지우고 VACUUM한다. `VERBOSE` 보고에서 튜플 수만 뽑는다.
```python
import psycopg, re
a = psycopg.connect(autocommit=True)
b = psycopg.connect(autocommit=True)
def report(d):  # VACUUM VERBOSE의 INFO 메시지
    m = re.search(r"(\d+) removed.*?(\d+) are dead but not yet", d.message_primary)
    if m: print(f"  지움 {m[1]}, 남은 죽은 튜플 {m[2]}")
b.add_notice_handler(report)
a.execute("BEGIN ISOLATION LEVEL REPEATABLE READ")
a.execute("SELECT count(*) FROM items")  # 스냅숏을 잡는다
b.execute("DELETE FROM bloat WHERE id <= 500")
print("a가 열려 있을 때"); b.execute("VACUUM (VERBOSE) bloat")
print(b.execute("SELECT state FROM pg_stat_activity WHERE pid = %s",
                (a.info.backend_pid,)).fetchone()[0])
a.execute("COMMIT")
print("a가 끝난 뒤"); b.execute("VACUUM (VERBOSE) bloat")
```
```text
a가 열려 있을 때
  지움 0, 남은 죽은 튜플 500
idle in transaction
a가 끝난 뒤
  지움 500, 남은 죽은 튜플 0
```
a는 `bloat`를 읽지도 않았는데 500행을 붙잡았다. 스냅숏은 테이블을 가리지 않는다. 운영에서는 `pg_stat_activity`를 `age(backend_xmin)` 순으로 보고, `idle in transaction` 세션, 끝내지 않은 준비된 트랜잭션, 버려진 복제 슬롯(15편)을 의심한다.

## 흔한 실수와 권장 설정
- **autovacuum 끄기**: 팽창이 쌓이다 결국 고갈 방지 VACUUM이 강제로 돈다. 끄지 말고 테이블별로 조정한다.
- **VACUUM FULL을 정기 작업으로**: 매번 전체를 막는다. 빈칸은 재사용되니 크기가 안정되면 정상이다.
- **큰 DELETE 뒤 디스크 반환 기대**: 일반 VACUUM은 파일 끝의 빈 페이지만 돌려준다. 오래된 데이터를 주기적으로 버린다면 날짜별 파티션을 DROP하는 설계가 낫다.
- **모니터링**: `pg_stat_user_tables`의 `n_dead_tup`·`last_autovacuum`, `pg_database`의 `age(datfrozenxid)`를 본다. 자주 갱신되는 테이블은 fillfactor를 낮추고, 방치된 트랜잭션은 `idle_in_transaction_session_timeout`으로 끊는다(9편).

## 어디에 쓰이나
- 메모리 시스템 9편 「플래시 저장 장치: NAND 셀, FTL, 쓰기 증폭」: 덮어쓰지 않고 빈 곳에 새로 쓴 뒤 옛것은 무효 표시하고 나중에 가비지 컬렉션으로 치우는 FTL의 구조가 MVCC + VACUUM과 같다.
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 옛 버전을 남겨 과거 시점을 읽게 하는 발상이 같고, PostgreSQL은 어떤 스냅숏도 보지 않는 버전을 지운다는 점이 다르다.
- 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」: 행 잠금도 별도 표가 아니라 튜플 머리말의 `xmax`에 기록된다.

## 정리
- UPDATE는 옛 버전의 `xmax`를 채우고 새 버전을 쓰며, 보이는지는 스냅숏과 커밋 로그로 정한다. 롤백도 죽은 튜플을 남긴다.
- 10만 행 전체 UPDATE 한 번에 테이블·인덱스가 두 배가 됐고, VACUUM은 빈칸을 만들어 재사용하게 할 뿐 VACUUM FULL만 줄이며 그 대가로 모든 접근을 막는다.
- autovacuum은 50 + 0.2 × 행 수(18부터 상한 1억)를 넘으면 돌고, HOT 업데이트는 인덱스를 키우지 않는다.
- 32비트 XID 때문에 동결이 필수이며, 오래 열린 트랜잭션 하나가 데이터베이스 전체의 정리를 막는다.

## 더 알아보기
- 이전 글: 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」
- 다음 글: 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」
- PostgreSQL 공식 문서 "Routine Vacuuming": https://www.postgresql.org/docs/current/routine-vacuuming.html
