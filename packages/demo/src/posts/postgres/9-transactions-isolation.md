# [PostgreSQL 실무 9/16] 트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상

> **한 줄 요약** — 기본 격리 수준 READ COMMITTED는 문장마다 새 스냅숏을 보므로 "읽고 계산해서 쓰는" 코드가 동시에 돌면 갱신이 사라지고, 원자적 UPDATE·`FOR UPDATE`·REPEATABLE READ로 이를 막더라도 서로 다른 행을 바꾸는 쓰기 왜곡까지 막으려면 SERIALIZABLE과 40001 재시도 루프가 필요하다.

## 이 글에서 다루는 것
- ACID와 세 격리 수준이 보는 스냅숏
- 갱신 손실을 연결 두 개로 재현하고 원자적 UPDATE·`FOR UPDATE`·REPEATABLE READ로 막기
- 쓰기 왜곡, SERIALIZABLE(SSI), 직렬화 실패(40001) 재시도 루프
- 저장점(SAVEPOINT)과 "current transaction is aborted"

## 문제: 혼자 돌 때는 맞던 코드
잔액 100원 계좌에 30원 출금과 50원 입금이 동시에 들어왔다. 요청마다 잔액을 읽고, 애플리케이션에서 계산해서, 쓴다. 하나씩 실행하면 120원이지만 두 요청이 같은 100원을 읽으면 나중에 쓴 쪽이 앞의 결과를 덮어 150원이나 70원이 된다. 이것이 **갱신 손실**(lost update)이고, 테스트는 통과하다가 운영에서 요청이 몰릴 때만 드물게 터진다.

**트랜잭션**(transaction)의 성질 ACID는 원자성(atomicity, 전부 아니면 전무), 일관성(consistency, 제약 조건 유지 — 3편), 격리성(isolation, 동시 실행끼리 서로를 얼마나 보나), 지속성(durability, 커밋하면 죽어도 남음 — 14편)이다. 위 사고의 두 요청은 각자 온전히 커밋됐으니 격리성 문제다.

## 원리: 격리 수준은 "어느 스냅숏을 보는가"
PostgreSQL은 행을 덮어쓰지 않고 새 버전을 만들며, 문장은 **스냅숏**(snapshot), 곧 "어느 트랜잭션까지의 커밋을 볼지"라는 기준으로 행 버전을 고른다(10편).
- **READ COMMITTED**(기본값): 문장마다 새 스냅숏을 찍는다. 고치려는 행을 다른 트랜잭션이 고치는 중이면 끝나길 기다렸다가, 커밋된 새 버전에 조건을 다시 확인하고 적용한다.
- **REPEATABLE READ**: 첫 문장에서 찍은 스냅숏을 끝까지 쓴다. 스냅숏 뒤에 남이 고치고 커밋한 행을 고치려 하면 SQLSTATE 40001로 실패한다.
- **SERIALIZABLE**: 여기에 읽기-쓰기 의존 추적을 더해, 하나씩 차례로 실행해서는 나올 수 없는 결과가 생기려 하면 하나를 40001로 실패시킨다. **직렬화 가능한 스냅숏 격리**(Serializable Snapshot Isolation, SSI)라 하며 2011년 9.1에 들어왔다(그전 SERIALIZABLE은 지금의 REPEATABLE READ).

READ UNCOMMITTED는 문법만 받고 READ COMMITTED로 동작한다(공식 문서). 아래 표의 "막음"에는 오류로 실패시키는 경우도 들어간다. 표에서 RC는 READ COMMITTED, RR은 REPEATABLE READ, SER은 SERIALIZABLE이다.

| 이상 현상 | RC | RR | SER |
|---|---|---|---|
| 더티 리드 | 막음 | 막음 | 막음 |
| 반복 불가능한 읽기 | 생김 | 막음 | 막음 |
| 팬텀 | 생김 | 막음 | 막음 |
| 갱신 손실 | 생김 | 막음 | 막음 |
| 쓰기 왜곡 | 생김 | 생김 | 막음 |

## 따라 하기 1: 갱신 손실 재현
psql 창 두 개로는 타이밍이 매번 달라지므로 파이썬 psycopg 연결 두 개(`a`, `b`)를 번갈아 써서 순서를 고정한다. 접속 정보는 libpq 환경 변수(`PG*`)로 준다. `autocommit=True`로 열고 `BEGIN`·`COMMIT`을 직접 보냈다(PostgreSQL 18.6 기준).
```sql
CREATE TABLE accounts (id int PRIMARY KEY, owner text, balance int);
INSERT INTO accounts VALUES (1, 'kim', 100);
```
```python
import psycopg
a = psycopg.connect(autocommit=True)  # 접속 정보는 PG* 환경 변수
b = psycopg.connect(autocommit=True)
SEL = "SELECT balance FROM accounts WHERE id = 1"
UPD = "UPDATE accounts SET balance = %s WHERE id = 1"

for level in ("READ COMMITTED", "REPEATABLE READ"):
    a.execute("UPDATE accounts SET balance = 100 WHERE id = 1")
    for c in (a, b): c.execute(f"BEGIN ISOLATION LEVEL {level}")
    x, y = (c.execute(SEL).fetchone()[0] for c in (a, b))  # 둘 다 100
    a.execute(UPD, (x - 30,)); a.execute("COMMIT")          # a: 30 출금
    print(f"{level}: b가 다시 읽은 값 {b.execute(SEL).fetchone()[0]}")
    try:
        b.execute(UPD, (y + 50,)); b.execute("COMMIT")      # b: 50 입금
    except psycopg.errors.SerializationFailure as e:
        b.execute("ROLLBACK")
        print(f"  b 실패 [{e.sqlstate}] {e.diag.message_primary}")
    print(f"  최종 잔액 {a.execute(SEL).fetchone()[0]} (기대값 120)")
```
```text
READ COMMITTED: b가 다시 읽은 값 70
  최종 잔액 150 (기대값 120)
REPEATABLE READ: b가 다시 읽은 값 100
  b 실패 [40001] could not serialize access due to concurrent update
  최종 잔액 70 (기대값 120)
```
READ COMMITTED의 b는 다시 읽으면 70이 보이지만(반복 불가능한 읽기) 처음 읽은 100으로 계산해 150을 썼고, 출금은 사라졌다. REPEATABLE READ의 b는 끝까지 100을 보다가 바뀐 행을 고치려는 순간 실패한다. 처음부터 다시 하면 70을 읽고 120을 쓴다.

## 따라 하기 2: READ COMMITTED에서 막는 두 방법
계산을 DB에 맡기는 **원자적 UPDATE**(`SET balance = balance + 50`)와, 읽을 때 행을 잠그는 `SELECT … FOR UPDATE`다. a가 커밋하기 직전에 b를 출발시키고, 세 번째 연결 `m`으로 b의 `wait_event_type`이 `Lock`이 될 때까지 확인해 순서를 고정한다.
```python
import psycopg, threading, time
a, b, m = (psycopg.connect(autocommit=True) for _ in range(3))
SEL = "SELECT balance FROM accounts WHERE id = 1"

def wait_blocked(c):  # c가 잠금 대기에 들어갈 때까지
    q = "SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s"
    while m.execute(q, (c.info.backend_pid,)).fetchone()[0] != "Lock":
        time.sleep(0.01)

def atomic(c, delta, pause=lambda: None):
    c.execute("BEGIN")
    c.execute("UPDATE accounts SET balance = balance + %s WHERE id = 1", (delta,))
    pause(); c.execute("COMMIT")

def locked(c, delta, pause=lambda: None):
    c.execute("BEGIN")
    x = c.execute(SEL + " FOR UPDATE").fetchone()[0]
    print(f"  FOR UPDATE로 읽은 값 {x}")
    c.execute("UPDATE accounts SET balance = %s WHERE id = 1", (x + delta,))
    pause(); c.execute("COMMIT")

for tx in (atomic, locked):
    m.execute("UPDATE accounts SET balance = 100 WHERE id = 1")
    t = threading.Thread(target=tx, args=(b, 50))
    def pause(): t.start(); wait_blocked(b)  # a의 커밋 직전, b는 막힌다
    tx(a, -30, pause); t.join()
    print(f"{tx.__name__}: 최종 {m.execute(SEL).fetchone()[0]}")
```
```text
atomic: 최종 120
  FOR UPDATE로 읽은 값 100
  FOR UPDATE로 읽은 값 70
locked: 최종 120
```
원자적 UPDATE의 b는 a의 커밋을 기다렸다가 새 버전(70)에 `+ 50`을 적용했고, `FOR UPDATE`에서는 b의 SELECT가 기다렸다가 최신 값 70을 받았다. 행 잠금의 종류와 `NOWAIT`은 11편에서 다룬다.

## 쓰기 왜곡과 재시도 루프
규칙이 "당직 의사는 최소 1명"인데 alice와 bob이 동시에 "당직이 2명 이상이면 나는 빠진다"를 실행한다. 서로 다른 행을 고치니 행 충돌이 없고, 각자는 규칙을 지켰지만 합치면 0명이다. 이것이 **쓰기 왜곡**(write skew)이다. 아래 `go_off`는 재시도 루프로, 40001을 받으면 **트랜잭션 전체를 읽기부터** 다시 한다. bob의 첫 시도 도중에 alice의 트랜잭션을 끼워 넣었다.
```sql
CREATE TABLE oncall (doctor text PRIMARY KEY, on_duty boolean);
INSERT INTO oncall VALUES ('alice', true), ('bob', true);
```
```python
import psycopg
a = psycopg.connect(autocommit=True)
b = psycopg.connect(autocommit=True)
COUNT = "SELECT count(*) FROM oncall WHERE on_duty"

def go_off(c, who, level, cut_in=None):
    for n_try in range(1, 4):
        try:
            c.execute(f"BEGIN ISOLATION LEVEL {level}")
            n = c.execute(COUNT).fetchone()[0]
            if n < 2:
                c.execute("ROLLBACK")
                return print(f"  {who} {n_try}차: 당직 {n}명이라 거절")
            c.execute("UPDATE oncall SET on_duty = false WHERE doctor = %s", (who,))
            if cut_in and n_try == 1: cut_in()  # 시연용 끼어들기
            c.execute("COMMIT")
            return print(f"  {who} {n_try}차: 커밋")
        except psycopg.errors.SerializationFailure as e:  # 40001
            c.execute("ROLLBACK")
            print(f"  {who} {n_try}차: {e.diag.message_primary}\n    HINT: {e.diag.message_hint}")
    raise RuntimeError("재시도 한도 초과")

for level in ("REPEATABLE READ", "SERIALIZABLE"):
    a.execute("UPDATE oncall SET on_duty = true")
    print(level)
    go_off(b, "bob", level, cut_in=lambda: go_off(a, "alice", level))
    print(f"  남은 당직 {a.execute(COUNT).fetchone()[0]}명")
```
```text
REPEATABLE READ
  alice 1차: 커밋
  bob 1차: 커밋
  남은 당직 0명
SERIALIZABLE
  alice 1차: 커밋
  bob 1차: could not serialize access due to read/write dependencies among transactions
    HINT: The transaction might succeed if retried.
  bob 2차: 당직 1명이라 거절
  남은 당직 1명
```
REPEATABLE READ에서는 규칙이 깨졌고, SERIALIZABLE에서는 "서로가 읽은 행을 서로 바꿨다"는 순환 의존이 잡혀 bob이 커밋 시점에 실패한 뒤 재시도에서 1명을 보고 거절했다. SSI는 기다리게 하지 않고 진행하다 판정하므로 재시도 루프와 짝이다. 루프는 40001과 40P01(교착 상태, 11편)만 재시도하고, 횟수 상한과 무작위 대기를 두며, 이메일 발송 같은 부수 효과는 커밋 뒤로 미룬다. REPEATABLE READ 이하라면 관여하는 행을 먼저 `FOR UPDATE`로 잠그고 센다.

## 저장점과 "current transaction is aborted"
트랜잭션 안의 문장 하나가 실패하면 트랜잭션 전체가 실패 상태가 되어 ROLLBACK 전까지 모든 문장이 거부된다. 일부만 되돌리려면 **저장점**(savepoint)을 둔다.
```sql
BEGIN;
INSERT INTO accounts VALUES (2, 'lee', 0);
SAVEPOINT before_dup;
INSERT INTO accounts VALUES (2, 'lee', 0);
SELECT count(*) FROM accounts;
ROLLBACK TO SAVEPOINT before_dup;
INSERT INTO accounts VALUES (3, 'park', 0);
COMMIT;
SELECT string_agg(owner, ', ' ORDER BY id) FROM accounts;
```
```text
BEGIN
INSERT 0 1
SAVEPOINT
ERROR:  duplicate key value violates unique constraint "accounts_pkey"
DETAIL:  Key (id)=(2) already exists.
ERROR:  current transaction is aborted, commands ignored until end of transaction block
ROLLBACK
INSERT 0 1
COMMIT
   string_agg
----------------
 kim, lee, park
(1 row)
```
중복 키 오류 뒤에는 멀쩡한 SELECT도 거부됐고, `ROLLBACK TO SAVEPOINT`로 저장점 뒤만 되돌리자 2번 행을 살린 채 이어 갔다. ORM의 중첩 트랜잭션도 대개 저장점이다.

## 흔한 실수와 권장 설정
- **애플리케이션에서 읽고-계산하고-쓰기**: ORM의 `obj.balance -= 30; obj.save()`가 갱신 손실 패턴이다. 원자적 UPDATE, `FOR UPDATE`, 또는 `UPDATE … WHERE id = 1 AND version = 7`이 0행이면 충돌로 보는 낙관적 잠금(optimistic locking)을 쓴다.
- **열린 채 방치된 트랜잭션**: DB-API 드라이버는 기본값(autocommit 꺼짐)에서 첫 문장 앞에 BEGIN을 보내고 `commit()`까지 트랜잭션을 연다. 그사이 외부 API를 기다리면 잠금이 다른 요청을 막고(11편) 오래된 스냅숏이 VACUUM을 막는다(10편). `state`가 `idle in transaction`인 세션을 `pg_stat_activity`에서 찾고, `idle_in_transaction_session_timeout`과 PostgreSQL 17의 `transaction_timeout`으로 상한을 둔다(둘 다 기본값 0, 꺼짐).
- **SERIALIZABLE의 함정**: SSI는 SERIALIZABLE 트랜잭션의 읽기만 추적하니 같은 규칙에 관여하는 트랜잭션은 모두 SERIALIZABLE로 돌린다. 공식 문서에 따르면 순차 스캔은 테이블 단위 술어 잠금을 잡아 거짓 충돌을 늘리므로, 인덱스를 두고 트랜잭션을 짧게 하고 읽기 전용이면 `READ ONLY`로 선언한다.

## 어디에 쓰이나
- CPU 마이크로아키텍처 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」: 원자적 UPDATE는 `fetch_add`, 버전 열 낙관적 잠금은 CAS(비교 후 교환)와 같은 발상이다.
- 10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」: 스냅숏이 `xmin`·`xmax`로 행 버전을 고르는 실제 모습.
- 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」: `FOR UPDATE`가 잡는 행 잠금과, 재시도 대상인 교착 상태(40P01).

## 정리
- 기본 READ COMMITTED에서 애플리케이션이 읽고 계산해서 쓰면 갱신이 사라졌다(기대 120, 실제 150).
- 원자적 UPDATE와 `FOR UPDATE`는 기다렸다가 최신 값에 적용했고, REPEATABLE READ는 덮어쓰는 대신 40001로 실패했다.
- 서로 다른 행을 바꾸는 쓰기 왜곡은 SERIALIZABLE(SSI)만 막으며, 트랜잭션 전체를 다시 하는 재시도 루프가 짝이다.
- 트랜잭션 안의 오류는 전체를 실패 상태로 만들고, 부분 복구는 저장점으로 한다.

## 더 알아보기
- 이전 글: 8편 「쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형」
- 다음 글: 10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」
- PostgreSQL 공식 문서 "Transaction Isolation": https://www.postgresql.org/docs/current/transaction-iso.html
