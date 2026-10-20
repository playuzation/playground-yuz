# [PostgreSQL 실무 6/16] 인덱스 1: B-트리와 실행 계획 읽기

> **한 줄 요약** — 인덱스는 읽을 페이지 수를 줄이는 정렬된 B-트리이고, 플래너는 통계로 비용을 따져 순차·인덱스·비트맵·인덱스 전용 스캔 중 하나를 고르므로, `EXPLAIN`으로 그 선택과 이유를 읽을 줄 알아야 한다.

## 이 글에서 다루는 것
- 순차 스캔과 `EXPLAIN ANALYZE` 읽는 법
- PostgreSQL B-트리의 실제 모양: 페이지당 키 수와 높이
- 네 가지 스캔, 플래너가 인덱스를 안 쓰는 이유, 가시성 맵
- 복합 인덱스 열 순서와 PostgreSQL 18 스킵 스캔, 정렬, 쓰기 비용

## 문제: 주문 3만 건에서 고객 한 명 찾기
"고객 42번의 주문" 화면이 데이터가 늘수록 느려진다. 인덱스가 없으면 PostgreSQL은 테이블의 모든 페이지를 읽는다. 실습 테이블을 만든다(PostgreSQL 18.6 기준). 결과가 흔들리지 않게 이 테이블만 autovacuum을 껐고(운영에서는 끄지 않는다), 출력을 줄이려고 psql의 `\t on`(머리글과 행 수 줄 생략)을 켜고 긴 EXPLAIN 옵션은 psql 변수에 담아 `:ex`로 쓴다.
```sql
CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id int NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
) WITH (autovacuum_enabled = off);
INSERT INTO orders (customer_id, status, created_at)
SELECT (i * 7919) % 1000 + 1,        -- 고객 1000명, 고르게 섞임
       CASE WHEN i % 100 = 0 THEN 'pending'
            WHEN i % 10 = 0 THEN 'canceled' ELSE 'done' END,
       timestamptz '2026-01-01' + i * interval '5 minutes'
FROM generate_series(1, 30000) AS i;
ANALYZE orders;
\t on
\set ex 'EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF, BUFFERS OFF)'
```
`EXPLAIN`은 플래너가 고른 **실행 계획**(execution plan)을, `ANALYZE`를 붙이면 실제로 실행해 노드마다 실제 행 수를 보여 준다. 비용 추정치는 8편에서 읽기로 하고 `COSTS OFF`로 감춘다. PostgreSQL 18부터는 `ANALYZE`에 읽은 버퍼 수가 자동으로 붙고 행 수가 `30.00`처럼 소수로 나온다. 이번에는 버퍼를 켠 채로 본다.
```sql
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM orders WHERE customer_id = 42;
```
```text
 Seq Scan on orders (actual rows=30.00 loops=1)
   Filter: (customer_id = 42)
   Rows Removed by Filter: 29970
   Buffers: shared hit=221
...
```
**순차 스캔**(Seq Scan)이 3만 행을 다 읽고 29,970행을 버렸다. `shared hit`은 읽은 8KB 페이지 수로, 테이블 전부다(뒤의 `...`는 계획 단계의 버퍼 줄을 줄인 것).

## B-트리 인덱스의 실제 모양
기본 키에는 이미 B-트리 인덱스가 있다. 구조는 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」의 B+트리와 같다(잎끼리 옆 링크로 이어진다). 확장 `pageinspect`로 트리 높이, 잎 페이지 하나의 항목 수와 크기, 행 주소를 차례로 본다.
```sql
CREATE EXTENSION pageinspect;
SELECT level FROM bt_metap('orders_pkey');
SELECT live_items, avg_item_size FROM bt_page_stats('orders_pkey', 1);
SELECT ctid, id FROM orders WHERE id IN (1, 136, 137);
```
```text
CREATE EXTENSION
     1

        367 |            16

 (0,1)   |   1
 (0,136) | 136
 (1,1)   | 137
```
`level` 1은 뿌리 바로 아래가 잎이라는 뜻이라 3만 행을 두 단계로 찾는다. 잎 페이지 하나에 항목 367개, 항목 하나는 16바이트(헤더 8 + bigint 키 8)다. 잎 항목은 행이 아니라 `ctid`, 즉 테이블(**힙**(heap)) 안의 (페이지, 줄) 주소를 담는다. 인덱스로 찾기는 "트리를 내려가 주소를 얻고 → 힙 페이지를 읽는" 두 단계이고, 이것이 아래 모든 계획의 바탕이다.

## 플래너가 고르는 네 가지 스캔
고객 번호에 인덱스를 만들고 같은 쿼리를 다시 본다.
```sql
CREATE INDEX orders_customer_idx ON orders (customer_id);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM orders WHERE customer_id = 42;
```
```text
CREATE INDEX
 Bitmap Heap Scan on orders (actual rows=30.00 loops=1)
   Recheck Cond: (customer_id = 42)
   Heap Blocks: exact=30
   Buffers: shared hit=30 read=2
   ->  Bitmap Index Scan on orders_customer_idx (actual rows=30.00 loops=1)
         Index Cond: (customer_id = 42)
         Index Searches: 1
         Buffers: shared read=2
...
```
읽은 페이지가 32개(인덱스 2 + 힙 30)로 줄었다. 계획은 **비트맵 힙 스캔**(Bitmap Heap Scan)이다. 행 30개가 힙 페이지 30개에 흩어져 있어, 인덱스에서 주소를 다 모아 페이지 순서로 정렬한 뒤(비트맵) 페이지마다 한 번씩만 읽는다. 행이 몇 개뿐이면 주소를 바로 따라가는 **인덱스 스캔**(Index Scan)이, 아주 많으면 순차 스캔이 나온다.
```sql
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE customer_id <= 700;
```
```text
 Seq Scan on orders
   Filter: (customer_id <= 700)
```
행 70%를 원하면 인덱스가 있어도 순차 스캔이다. 플래너는 **선택도**(selectivity, 조건을 통과하는 행의 비율)와 페이지 읽기 비용으로 판단한다. 기본값은 순차 읽기 `seq_page_cost = 1`, 임의 읽기 `random_page_cost = 4`라, 거의 모든 페이지를 이리저리 읽느니 한 번 훑는 쪽이 이긴다. 행이 놓인 순서도 따진다.
```sql
SELECT attname, round(correlation::numeric, 2) FROM pg_stats
WHERE tablename = 'orders' AND attname IN ('id', 'customer_id');
```
```text
 id          |  1.00
 customer_id |  0.00
```
`correlation`은 열 값의 순서와 행의 물리적 순서가 맞는 정도(-1~1)다. `id`는 1이라 범위를 찾아도 이웃 페이지만 읽지만, `customer_id`는 0이라 같은 범위가 테이블 전체에 흩어진다.

## 인덱스 전용 스캔과 가시성 맵
고객 번호만 고르는 쿼리는 인덱스만 읽으면 될 것 같지만, 행이 지금 트랜잭션에 보이는지(10편의 MVCC)는 힙의 행에만 적혀 있다. 그래서 PostgreSQL은 "이 페이지의 행은 모두에게 보인다"를 표시한 **가시성 맵**(visibility map)을 두고, 표시된 페이지만 힙 방문을 건너뛴다. 표시는 VACUUM이 한다.
```sql
:ex SELECT customer_id FROM orders WHERE customer_id <= 10;
VACUUM orders;
:ex SELECT customer_id FROM orders WHERE customer_id <= 10;
```
```text
 Bitmap Heap Scan on orders (actual rows=300.00 loops=1)
   Recheck Cond: (customer_id <= 10)
   Heap Blocks: exact=147
   ->  Bitmap Index Scan on orders_customer_idx (actual rows=300.00 loops=1)
         Index Cond: (customer_id <= 10)
         Index Searches: 1

VACUUM
 Index Only Scan using orders_customer_idx on orders (actual rows=300.00 loops=1)
   Index Cond: (customer_id <= 10)
   Heap Fetches: 0
   Index Searches: 1
```
VACUUM 전에는 힙 147페이지를 읽었고, 뒤에는 **인덱스 전용 스캔**(Index Only Scan)이 힙을 한 번도 읽지 않았다(`Heap Fetches: 0`). 행을 고치면 그 페이지의 표시가 지워져 `Heap Fetches`가 다시 는다.

## 복합 인덱스의 열 순서와 스킵 스캔
여러 열 인덱스는 첫 열로 정렬하고, 첫 열이 같으면 둘째 열로 정렬한다. 그래서 "왼쪽 접두사가 조건에 있어야 쓸 수 있다"가 오랜 규칙이었다.
```sql
DROP INDEX orders_customer_idx;
CREATE INDEX orders_status_customer_idx ON orders (status, customer_id);
:ex SELECT * FROM orders WHERE customer_id = 42;
```
```text
DROP INDEX
CREATE INDEX
 Index Scan using orders_status_customer_idx on orders (actual rows=30.00 loops=1)
   Index Cond: (customer_id = 42)
   Index Searches: 4
```
첫 열 조건이 없는데도 인덱스 스캔이다. PostgreSQL 18에 들어온 B-트리 **스킵 스캔**(skip scan)이다. 첫 열 값이 'canceled', 'done', 'pending' 셋뿐이라 값마다 `status = 그 값 AND customer_id = 42`를 찾듯 트리를 여러 번 내려갔다. `Index Searches: 4`가 내려간 횟수로, 잎 전체를 훑지 않았다는 뜻이다. 공식 문서는 선두 열의 서로 다른 값이 적을 때 효과가 있고, 많으면 인덱스 전체를 읽게 되어 플래너가 대개 순차 스캔을 고른다고 설명한다. 순서를 뒤집어 본다.
```sql
DROP INDEX orders_status_customer_idx;
CREATE INDEX orders_customer_status_idx ON orders (customer_id, status);
:ex SELECT * FROM orders WHERE status = 'pending';
```
```text
DROP INDEX
CREATE INDEX
 Bitmap Heap Scan on orders (actual rows=300.00 loops=1)
   Recheck Cond: (status = 'pending'::text)
   Heap Blocks: exact=221
   ->  Bitmap Index Scan on orders_customer_status_idx (actual rows=300.00 loops=1)
         Index Cond: (status = 'pending'::text)
         Index Searches: 1
```
선두 열 값이 1000개라 건너뛸 게 없으니 트리를 한 번 내려가 잎 전체를 읽었고(`Index Searches: 1`) 힙도 전부 읽었다. 계획에 인덱스 이름이 보인다고 효율적인 것은 아니다. 복합 인덱스는 **같다(=) 조건 열을 앞에, 범위·정렬 열을 뒤에** 두는 것이 기본이고, 스킵 스캔은 이 규칙을 대신하지 않는 보험이다.

## 정렬과 LIMIT
"최근 주문 5건"은 인덱스가 없으면 3만 행을 다 읽고 정렬한다. B-트리는 이미 정렬되어 있으니 끝에서 5개만 읽으면 된다.
```sql
DROP INDEX orders_customer_status_idx;
:ex SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;
CREATE INDEX orders_created_idx ON orders (created_at);
:ex SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;
```
```text
DROP INDEX
 Limit (actual rows=5.00 loops=1)
   ->  Sort (actual rows=5.00 loops=1)
         Sort Key: created_at DESC
         Sort Method: top-N heapsort  Memory: 25kB
         ->  Seq Scan on orders (actual rows=30000.00 loops=1)

CREATE INDEX
 Limit (actual rows=5.00 loops=1)
   ->  Index Scan Backward using orders_created_idx on orders (actual rows=5.00 loops=1)
         Index Searches: 1
```

## 인덱스의 쓰기 비용
행을 넣거나 인덱스 열을 고칠 때마다 모든 인덱스에 항목을 넣어야 하고, 그만큼 WAL(변경 기록)도 는다. 기본 키만 있는 테이블과 인덱스가 넷인 테이블에 같은 3만 행을 넣어 비교한다(실행마다 다른 `buffers full` 값은 …로 가렸다).
```sql
CREATE TABLE w1 (id int PRIMARY KEY, c int, t timestamptz);
CREATE TABLE w4 (LIKE w1 INCLUDING ALL);
CREATE INDEX ON w4 (c);
CREATE INDEX ON w4 (t);
CREATE INDEX ON w4 (c, t);
CREATE TEMP TABLE src AS SELECT i AS id, i % 1000 AS c,
  timestamptz '2026-01-01' + i * interval '1 min' AS t
FROM generate_series(1, 30000) AS i;
```
```sql
\set exw 'EXPLAIN (ANALYZE, WAL, COSTS OFF, TIMING OFF, SUMMARY OFF, BUFFERS OFF)'
:exw INSERT INTO w1 SELECT * FROM src;
:exw INSERT INTO w4 SELECT * FROM src;
```
```text
 Insert on w1 (actual rows=0.00 loops=1)
   WAL: records=60082 bytes=4111700…
   ->  Seq Scan on src (actual rows=30000.00 loops=1)

 Insert on w4 (actual rows=0.00 loops=1)
   WAL: records=150903 bytes=10862420…
   ->  Seq Scan on src (actual rows=30000.00 loops=1)
```
같은 데이터인데 WAL 기록이 2.5배다. 인덱스 하나하나가 모든 쓰기에 비용을 더한다.

## 흔한 실수와 문제 해결
- **인덱스를 만들었는데 순차 스캔이 나온다**: 행을 많이 통과시키는 조건이면 그게 맞다. 추정 행 수가 실제와 크게 다르면 `ANALYZE`부터, 그래도 다르면 8편의 방법으로 추적한다.
- `SET enable_seqscan = off`는 인덱스를 쓴 계획을 엿보는 진단용이다. 운영 설정에 넣지 않는다.
- 외래 키를 걸어도 참조하는 쪽 열에는 인덱스가 자동으로 생기지 않는다(기본 키와 UNIQUE만 생긴다). 조인과 부모 행 삭제가 느려지는 흔한 원인이다.
- 인덱스 전용 스캔의 `Heap Fetches`가 크면 VACUUM이 못 따라가는 것이다(10편). 큰 테이블의 `CREATE INDEX`는 끝날 때까지 쓰기를 막으니 운영 중에는 `CONCURRENTLY`를 쓴다(13편).

## 권장 설정과 체크리스트
- 인덱스는 테이블이 아니라 쿼리에서 출발한다. 자주 쓰는 WHERE·JOIN·ORDER BY와 그 선택도를 보고 만든다.
- 복합 인덱스는 =조건 열 → 범위·정렬 열 순서로. 앞 열만 쓰는 쿼리는 같은 인덱스로 되니 따로 만들지 않는다.
- 만든 뒤에는 `EXPLAIN (ANALYZE)`로 읽은 페이지가 줄었는지 확인한다. 쓰기가 많은 테이블일수록 인덱스를 아낀다(안 쓰는 인덱스 찾기는 7편).

## 어디에 쓰이나
- 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: "노드 하나 = 블록 하나, 키 수백 개" 모델이 PostgreSQL에서는 8KB 페이지에 항목 367개로 그대로 나타났다.
- 메모리 시스템 1편 「메모리 계층 지도: 레지스터에서 SSD까지 지연과 대역폭」: 순차 읽기와 임의 읽기의 비용 차이가 `random_page_cost`라는 플래너 설정으로 들어가 있다.
- 10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」: 가시성 맵과 `Heap Fetches`가 VACUUM과 이어지는 방식을 다룬다.

## 정리
- 인덱스 항목은 힙의 (페이지, 줄) 주소를 가리키고, 찾기는 "트리 내려가기 + 힙 읽기" 두 단계다.
- 플래너는 선택도와 물리적 순서(correlation)로 Seq·Index·Bitmap·Index Only 스캔 중 싼 것을 고른다.
- 인덱스 전용 스캔은 VACUUM이 채우는 가시성 맵에 기댄다.
- 복합 인덱스는 =조건 열을 앞에 둔다. PostgreSQL 18의 스킵 스캔은 선두 열 값이 적을 때만 돕는다.

## 더 알아보기
- 이전 글: 5편 「윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리」
- 다음 글: 7편 「인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN」
- PostgreSQL 공식 문서 「Multicolumn Indexes」: https://www.postgresql.org/docs/current/indexes-multicolumn.html
