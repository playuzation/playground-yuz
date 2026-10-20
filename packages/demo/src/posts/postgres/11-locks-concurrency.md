# [PostgreSQL 실무 11/16] 락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태

> **한 줄 요약** — PostgreSQL은 테이블 잠금과 튜플에 적는 행 잠금으로 쓰기 충돌을 줄 세우므로, 기다림에는 `NOWAIT`·`lock_timeout`으로 상한을 두고, 작업 큐는 `FOR UPDATE SKIP LOCKED`로 만들고, 교착 상태는 잠금 순서를 맞추고 재시도로 다루며, 막히면 `pg_blocking_pids`로 누가 막는지부터 찾는다.

## 이 글에서 다루는 것
- 테이블 잠금 수준과 행 잠금, `NOWAIT`·`lock_timeout`
- `pg_stat_activity`·`pg_blocking_pids`·`pg_locks`로 막는 쪽 찾기
- `FOR UPDATE SKIP LOCKED` 작업 큐와 권고 잠금
- 교착 상태 재현, DDL이 잠금 대기열을 막는 사고

## 문제: 기다림이 사고가 될 때
MVCC 덕분에 읽기와 쓰기는 서로 막지 않지만(10편), 같은 행을 둘이 고치면 한쪽은 기다린다. 작업자 여럿이 같은 작업을 두 번 처리하고, 두 요청이 서로를 기다리며 멈추고, 배포 중 열 하나 추가가 서비스를 세우는 사고가 여기서 난다.

## 원리: 두 층의 잠금
**테이블 잠금**은 문장이 자동으로 잡고 트랜잭션이 끝날 때 풀린다. 모드 8가지 중 자주 만나는 것만 추리면 다음과 같다(PostgreSQL 18 문서).

| 모드 | 잡는 명령 → 함께 못 도는 것 |
|---|---|
| ACCESS SHARE | SELECT → ACCESS EXCLUSIVE |
| ROW EXCLUSIVE | INSERT, UPDATE, DELETE → CREATE INDEX 등 |
| SHARE UPDATE EXCLUSIVE | VACUUM, CREATE INDEX CONCURRENTLY → 자기 자신, 대부분의 DDL |
| SHARE | CREATE INDEX → 쓰기 |
| ACCESS EXCLUSIVE | 많은 ALTER TABLE, DROP, TRUNCATE, VACUUM FULL → 전부(SELECT 포함) |

**행 잠금**은 `FOR UPDATE`(DELETE도 잡음), `FOR NO KEY UPDATE`(일반 UPDATE가 잡음), `FOR SHARE`, `FOR KEY SHARE`(외래 키 검사가 잡음) 네 가지다. 잠금 표가 아니라 튜플의 `xmax`에 잠근 트랜잭션을 적으므로(10편) 행 수 한도가 없고, 기다리는 쪽은 "그 트랜잭션 ID가 끝나기를" 기다린다.

## 따라 하기 1: 기다리지 않기, 누가 막는지 보기
파이썬 psycopg 연결 여럿으로 순서를 고정한다. 접속 정보는 libpq 환경 변수(`PG*`)로 준다. 결과는 PostgreSQL 18.6 기준이다.
```sql
CREATE TABLE jobs (id int PRIMARY KEY, status text NOT NULL DEFAULT 'pending', worker text);
INSERT INTO jobs (id) SELECT generate_series(1, 100);
CREATE TABLE accounts (id int PRIMARY KEY, balance int);
INSERT INTO accounts VALUES (1, 100), (2, 100);
```
```python
import psycopg, threading, time
a, b, m = (psycopg.connect(autocommit=True) for _ in range(3))
who = {a.info.backend_pid: "a", b.info.backend_pid: "b"}
LOCK = "SELECT id FROM jobs WHERE id = 1 FOR UPDATE"
a.execute("BEGIN"); a.execute(LOCK)         # a가 1번 행을 잠근 채 둔다
for sql in (LOCK + " NOWAIT", "SET lock_timeout = '200ms'", LOCK):
    try: b.execute(sql)
    except psycopg.errors.LockNotAvailable as e:
        print(f"[{e.sqlstate}] {e.diag.message_primary}")
b.execute("RESET lock_timeout")
t = threading.Thread(target=b.execute, args=(LOCK,)); t.start()  # 이번엔 기다린다
Q = """SELECT pid, pg_blocking_pids(pid), wait_event FROM pg_stat_activity
WHERE wait_event_type = 'Lock'"""
while not (rows := m.execute(Q).fetchall()): time.sleep(0.01)
for pid, by, ev in rows: print(f"{who[pid]} ← {[who[p] for p in by]} ({ev})")
print(m.execute("SELECT locktype, mode FROM pg_locks WHERE NOT granted").fetchall())
a.execute("COMMIT"); t.join()
print("권고 잠금 42:", [c.execute("SELECT pg_try_advisory_lock(42)").fetchone()[0]
                     for c in (a, b)])
```
```text
[55P03] could not obtain lock on row in relation "jobs"
[55P03] canceling statement due to lock timeout
b ← ['a'] (transactionid)
[('transactionid', 'ShareLock')]
권고 잠금 42: [True, False]
```
`NOWAIT`은 즉시, `lock_timeout`은 200ms 뒤 SQLSTATE 55P03(lock_not_available)으로 실패한다. 기다리는 b는 a의 트랜잭션 ID에 대한 ShareLock을 못 받은 상태이고, `pg_blocking_pids`가 막는 쪽 a를 알려 준다. 위 `Q`가 "누가 누구를 막나"를 묻는 기본 쿼리다. `log_lock_waits`(18.6 기본값 off)를 켜면 `deadlock_timeout`(기본 1초)보다 오래 기다린 대기가 서버 로그에 남는다.

마지막 줄의 **권고 잠금**(advisory lock)은 애플리케이션이 정한 숫자에 거는 잠금으로, 크론 작업이 겹쳐 돌지 않게 false면 그냥 끝내는 식으로 쓴다. 세션 잠금은 연결이 끊길 때까지 남으니 트랜잭션 단위 풀러(16편) 뒤에서는 `pg_advisory_xact_lock`을 쓴다.

## 따라 하기 2: SKIP LOCKED 작업 큐
"아직 안 한 작업 하나"를 잠금 없이 집으면 두 작업자가 같은 행을 집고, `FOR UPDATE`만 붙이면 둘째가 첫째의 커밋을 기다린다. `SKIP LOCKED`(9.5부터)는 잠긴 행을 건너뛰고 다음 행을 가져간다. 작업자 4개로 100건을 처리해 중복도 센다.
```python
import psycopg, threading
a = psycopg.connect(autocommit=True)
b = psycopg.connect(autocommit=True)
PICK = "SELECT id FROM jobs WHERE status = 'pending' ORDER BY id LIMIT 1"
print("잠금 없이:", [c.execute(PICK).fetchone()[0] for c in (a, b)])
for c in (a, b): c.execute("BEGIN")
print("SKIP LOCKED:", [c.execute(PICK + " FOR UPDATE SKIP LOCKED").fetchone()[0]
                       for c in (a, b)])
for c in (a, b): c.execute("ROLLBACK")

def worker(name, done):
    c = psycopg.connect(autocommit=True)
    while True:
        c.execute("BEGIN")
        row = c.execute(PICK + " FOR UPDATE SKIP LOCKED").fetchone()
        if row is None:
            c.execute("COMMIT"); return
        c.execute("UPDATE jobs SET status = 'done', worker = %s WHERE id = %s",
                  (name, row[0]))             # 실제 작업을 하고 완료 표시
        c.execute("COMMIT"); done.append(row[0])

done = []
ts = [threading.Thread(target=worker, args=(f"w{i}", done)) for i in range(4)]
for t in ts: t.start()
for t in ts: t.join()
print(f"처리 {len(done)}건, 서로 다른 작업 {len(set(done))}건")
```
```text
잠금 없이: [1, 1]
SKIP LOCKED: [1, 2]
처리 100건, 서로 다른 작업 100건
```
작업자가 죽으면 롤백되어 행이 다시 `pending`이 되니 작업이 사라지지 않는다. 다만 작업 동안 트랜잭션이 열려 있으므로(10편), 긴 작업은 `running`을 먼저 커밋하고 오래된 `running`을 되살리는 정리 작업을 둔다. 공식 문서도 SKIP LOCKED는 일관되지 않은 결과를 주니 큐 같은 용도에만 쓰라고 한다.

## 교착 상태: 서로를 기다릴 때
a는 1번 → 2번, b는 2번 → 1번 순서로 고치면 서로를 기다리는 순환이 생긴다. 대기 시간이 `deadlock_timeout`을 넘은 프로세스가 대기 관계에서 순환을 찾으면 자기 트랜잭션을 오류로 끝낸다. 실습은 b의 `deadlock_timeout`을 짧게(슈퍼유저 전용 설정) 해 b가 먼저 검사하게 했다. 오류 속 pid와 트랜잭션 ID는 a, b, `xid_a`, `xid_b`로 바꿔 출력한다.
```python
import psycopg, threading, time, re
a, b, m = (psycopg.connect(autocommit=True) for _ in range(3))
who = {str(c.info.backend_pid): n for c, n in ((a, "a"), (b, "b"))}
W = "SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s"
UPD = "UPDATE accounts SET balance = balance + 1 WHERE id = %s"
a.execute("SET deadlock_timeout = '10s'")
b.execute("SET deadlock_timeout = '100ms'")
for c, n, row in ((a, "a", 1), (b, "b", 2)):  # a는 1번, b는 2번을 먼저
    c.execute("BEGIN"); c.execute(UPD, (row,))
    who[c.execute("SELECT pg_current_xact_id()::text").fetchone()[0]] = "xid_" + n
t = threading.Thread(target=a.execute, args=(UPD, (2,))); t.start()
while m.execute(W, (a.info.backend_pid,)).fetchone()[0] != "Lock":
    time.sleep(0.01)                    # a가 2번 행을 기다릴 때까지
try:
    b.execute(UPD, (1,))                # b가 1번을 기다리면 순환
except psycopg.errors.DeadlockDetected as e:
    detail = re.sub(r"\b\d+\b", lambda x: who.get(x[0], x[0]), e.diag.message_detail)
    print(f"ERROR:  {e.diag.message_primary} [{e.sqlstate}]\nDETAIL:  {detail}")
    print(f"CONTEXT:  {e.diag.context}"); b.execute("ROLLBACK")
t.join(); a.execute("COMMIT")
print(m.execute("SELECT id, balance FROM accounts ORDER BY id").fetchall())
```
```text
ERROR:  deadlock detected [40P01]
DETAIL:  Process b waits for ShareLock on transaction xid_a; blocked by process a.
Process a waits for ShareLock on transaction xid_b; blocked by process b.
CONTEXT:  while updating tuple (0,1) in relation "accounts"
[(1, 101), (2, 101)]
```
b가 취소되자 a는 커밋했다. 공식 문서는 어느 쪽이 취소될지 예측하기 어려우니 기대지 말라고 한다. 예방은 잠금 순서다. 여러 행이면 `… ORDER BY id FOR UPDATE`로 같은 순서로 먼저 잠그고, 트랜잭션을 짧게 하고, 그래도 나는 40P01은 9편의 재시도 루프로 받는다.

## DDL 하나가 서비스를 세우는 이유
잠금 요청은 충돌하는 앞사람이 있으면 줄을 선다. a가 읽기 트랜잭션을 연 채(ACCESS SHARE) b가 `ALTER TABLE`(ACCESS EXCLUSIVE)을 실행하면 b는 a를 기다리고, 뒤에 온 평범한 SELECT c는 a와 충돌하지 않는데도 b 뒤에 선다.
```python
import psycopg, threading, time
a, b, c, m = (psycopg.connect(autocommit=True) for _ in range(4))
who = {x.info.backend_pid: n for x, n in ((a, "a"), (b, "b"), (c, "c"))}
W = "SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s"
def run(x, sql):  # 다른 스레드에서 실행하고 잠금 대기에 들어갈 때까지 본다
    th = threading.Thread(target=x.execute, args=(sql,)); th.start()
    while m.execute(W, (x.info.backend_pid,)).fetchone()[0] != "Lock":
        time.sleep(0.01)
    return th
a.execute("BEGIN"); a.execute("SELECT count(*) FROM jobs")  # 오래 열린 읽기
ths = [run(b, "ALTER TABLE jobs ADD COLUMN note text"),
       run(c, "SELECT count(*) FROM jobs")]
for x in (b, c):
    by = m.execute("SELECT pg_blocking_pids(%s)", (x.info.backend_pid,)).fetchone()[0]
    print(who[x.info.backend_pid], "←", [who[p] for p in by])
a.execute("COMMIT"); [th.join() for th in ths]
a.execute("BEGIN"); a.execute("SELECT count(*) FROM jobs")
b.execute("SET lock_timeout = '200ms'")      # 고친 방법: DDL은 빨리 포기한다
try: b.execute("ALTER TABLE jobs ADD COLUMN memo text")
except psycopg.errors.LockNotAvailable as e: print("b:", e.diag.message_primary)
print("c:", c.execute("SELECT count(*) FROM jobs").fetchone()[0])
a.execute("COMMIT")
```
```text
b ← ['a']
c ← ['b']
b: canceling statement due to lock timeout
c: 100
```
c를 막은 것은 줄에 선 b다. 실제로는 c 뒤로 요청이 쌓여 연결이 바닥나고, 원인인 a는 눈에 띄지 않는다. DDL 앞에 `lock_timeout`을 걸면 b가 200ms 만에 포기하고 c는 바로 실행된다(마이그레이션 절차는 13편).

## 흔한 실수와 권장 설정
- **트랜잭션 안에서 외부 호출**: 잠금은 트랜잭션 끝까지 간다. 행을 잠근 채 HTTP 응답을 기다리면 그 행에 쓰려는 요청이 모두 선다.
- **타임아웃 없음**: `lock_timeout`·`statement_timeout`은 기본값 0(무한)이니 앱 롤과 마이그레이션 세션에 상한을 건다.
- 사고 때는 `pg_blocking_pids`로 사슬의 맨 앞을 찾아 `pg_cancel_backend(pid)`(문장 취소)나 `pg_terminate_backend(pid)`(연결 종료)로 끊는다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 교착 상태 검사는 "누가 누구를 기다리나" 방향 그래프에서 DFS로 사이클을 찾는 문제다.
- 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」: `FOR UPDATE`로 갱신 손실을 막는 원리와, 40P01까지 받는 재시도 루프.
- 13편 「스키마 마이그레이션: 운영 중인 테이블을 안전하게 바꾸기」: `lock_timeout`을 건 DDL과 재시도, `CREATE INDEX CONCURRENTLY`.

## 정리
- 테이블 잠금은 모드별 충돌 표로, 행 잠금은 튜플의 `xmax`로 관리된다.
- `NOWAIT`·`lock_timeout`은 55P03으로 기다림을 끊고, `pg_blocking_pids`가 막는 쪽을 알려 준다.
- `FOR UPDATE SKIP LOCKED`로 작업자 4개가 100건을 중복 없이 나눠 처리했다.
- 교착 상태는 서버가 찾아 한쪽을 40P01로 끝내고, 오래 열린 트랜잭션 + DDL은 뒤의 SELECT까지 줄 세운다.

## 더 알아보기
- 이전 글: 10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」
- 다음 글: 12편 「JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기」
- PostgreSQL 공식 문서 "Explicit Locking": https://www.postgresql.org/docs/current/explicit-locking.html
