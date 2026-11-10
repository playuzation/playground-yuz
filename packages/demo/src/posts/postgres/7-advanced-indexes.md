# [PostgreSQL 실무 7/16] 인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN

> **한 줄 요약** — B-트리도 담을 행(부분), 키로 쓸 식(표현식), 함께 실을 열(INCLUDE)을 고를 수 있고, 배열은 GIN, 거리와 겹침은 GiST, 시간 순으로 쌓이는 큰 테이블은 BRIN이 맡으며, 만든 뒤에는 크기와 사용 횟수로 값을 매긴다.

## 이 글에서 다루는 것
- 부분 인덱스, 표현식 인덱스와 IMMUTABLE 규칙
- 정렬까지 맡는 복합 인덱스와 포함 인덱스(INCLUDE)
- GIN(배열 포함 검색), GiST(가장 가까운 이웃), BRIN(시간 순 큰 테이블)
- 크기 비교와 안 쓰는 인덱스 찾기

## 문제: B-트리 하나로는 아쉬운 쿼리들
"대기 주문만 오래된 순으로", "대소문자 무시 이메일 찾기", "vip 태그 주문", "가장 가까운 매장 3곳", "1억 행 로그에서 한 시간 치". 6편의 B-트리를 그대로 걸면 크기가 아깝거나, 쓰이지 않거나, 연산 자체를 못 한다. 실습 테이블을 만든다(PostgreSQL 18.6 기준, `\t on`과 `:ex`는 6편과 같다).
```sql
CREATE TABLE orders (
  id int PRIMARY KEY, customer_id int NOT NULL, status text NOT NULL,
  email text NOT NULL, tags text[] NOT NULL, amount int NOT NULL,
  created_at timestamptz NOT NULL
) WITH (autovacuum_enabled = off);
INSERT INTO orders
SELECT i, (i * 7919) % 1000 + 1,
       CASE WHEN i % 100 = 0 THEN 'pending' ELSE 'done' END,
       'User' || i % 5000 || '@Example.com',
       CASE WHEN i % 500 = 0 THEN '{vip,gift}'
            WHEN i % 3 = 0 THEN '{gift}' ELSE '{}' END::text[],
       (i * 37) % 1000 + 100,
       timestamptz '2026-01-01' + i * interval '5 minutes'
FROM generate_series(1, 30000) AS i;
VACUUM ANALYZE orders;
\t on
\set ex 'EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF, BUFFERS OFF)'
```

## 부분 인덱스: 필요한 행만 담기
대기(`pending`) 주문은 1%뿐인데 화면은 늘 그것만 본다. **부분 인덱스**(partial index)는 `WHERE` 조건을 만족하는 행만 담는다.
```sql
CREATE INDEX orders_created_idx ON orders (created_at);
CREATE INDEX orders_pending_idx ON orders (created_at)
  WHERE status = 'pending';
SELECT relname, pg_size_pretty(pg_relation_size(oid)) FROM pg_class
WHERE relname IN ('orders_created_idx', 'orders_pending_idx');
:ex SELECT * FROM orders WHERE status = 'pending'
    ORDER BY created_at LIMIT 3;
```
```text
CREATE INDEX
CREATE INDEX
 orders_created_idx | 672 kB
 orders_pending_idx | 16 kB

 Limit (actual rows=3.00 loops=1)
   ->  Index Scan using orders_pending_idx on orders (actual rows=3.00 loops=1)
         Index Searches: 1
```
672kB 대신 16kB로 같은 쿼리를 정렬 없이 처리한다. 플래너는 쿼리의 WHERE가 인덱스 조건을 **함축**(imply)한다고 증명될 때만 부분 인덱스를 쓴다. `status = $1`처럼 값을 바인드 변수로 넘기는 일반 계획(generic plan)에서는 증명하지 못하니 조건은 쿼리에 상수로 쓴다. `CREATE UNIQUE INDEX … WHERE deleted_at IS NULL`로 "삭제 안 된 행끼리만 유일" 제약도 만든다(3편).

## 표현식 인덱스: 식의 결과를 키로
`lower(email)`로 비교하면 `email` 인덱스는 쓸모가 없다. 인덱스는 `lower()` 결과가 아니라 열 값으로 정렬되어 있다. 식 자체에 인덱스를 건다.
```sql
CREATE INDEX orders_email_lower_idx ON orders (lower(email));
:ex SELECT id FROM orders WHERE lower(email) = 'user42@example.com';
```
```text
CREATE INDEX
 Bitmap Heap Scan on orders (actual rows=6.00 loops=1)
   Recheck Cond: (lower(email) = 'user42@example.com'::text)
   Heap Blocks: exact=6
   ->  Bitmap Index Scan on orders_email_lower_idx (actual rows=6.00 loops=1)
         Index Cond: (lower(email) = 'user42@example.com'::text)
         Index Searches: 1
```
쿼리의 식이 인덱스 식과 **글자 그대로 같아야** 한다. 결과가 같아 보여도 `ILIKE`나 `upper(email)`는 못 쓴다. 또 같은 입력에 늘 같은 결과를 내는 **IMMUTABLE** 함수만 쓸 수 있다.
```sql
CREATE INDEX ON orders ((created_at::date));
CREATE INDEX ON orders (((created_at AT TIME ZONE 'Asia/Seoul')::date));
```
```text
ERROR:  functions in index expression must be marked IMMUTABLE
CREATE INDEX
```
`timestamptz`를 날짜로 바꾼 값은 세션의 `TimeZone` 설정에 따라 달라 거부되고, 시간대를 식 안에 못 박으면 허용된다. 다만 날짜 조회는 대개 범위 조건으로 고쳐 쓰는 편이 낫다(8편).

## 정렬까지 맡는 복합 인덱스와 INCLUDE
"고객 42번의 최근 주문 3건"은 `(customer_id, created_at DESC)` 인덱스로 찾기와 정렬을 함께 끝낸다. 같은 고객 안이 이미 최신순이라 앞에서 3개만 읽는다.
```sql
CREATE INDEX orders_cust_created_idx ON orders (customer_id, created_at DESC);
:ex SELECT id FROM orders WHERE customer_id = 42
    ORDER BY created_at DESC LIMIT 3;
```
```text
CREATE INDEX
 Limit (actual rows=3.00 loops=1)
   ->  Index Scan using orders_cust_created_idx on orders (actual rows=3.00 loops=1)
         Index Cond: (customer_id = 42)
         Index Searches: 1
```
`sum(amount)`라면 인덱스에 없는 `amount` 때문에 결국 힙을 읽는다. 키로 찾을 일은 없고 값만 필요하면 **포함 인덱스**(covering index)로 잎에만 실어 둔다(PostgreSQL 11부터).
```sql
CREATE INDEX orders_cust_incl_idx ON orders (customer_id) INCLUDE (amount);
:ex SELECT sum(amount) FROM orders WHERE customer_id = 42;
```
```text
CREATE INDEX
 Aggregate (actual rows=1.00 loops=1)
   ->  Index Only Scan using orders_cust_incl_idx on orders (actual rows=30.00 loops=1)
         Index Cond: (customer_id = 42)
         Heap Fetches: 0
         Index Searches: 1
```
`INCLUDE` 열은 위쪽 노드에 없어 검색·정렬에 못 쓰고, UNIQUE 인덱스의 유일성 검사에서도 빠진다. 공식 문서에 따르면 `INCLUDE`가 있는 B-트리는 중복 제거(deduplication, PostgreSQL 13부터 기본)를 쓰지 않는다.

## GIN: 원소마다 행 목록을 거꾸로
배열의 "포함"(`@>`)은 B-트리로 못 찾는다. 배열 전체로 정렬해도 원소 하나로는 찾을 수 없다. **GIN**(Generalized Inverted Index)은 책 뒤 찾아보기처럼 원소(`vip`, `gift`)마다 그 원소를 가진 행 주소 목록을 둔다.
```sql
CREATE INDEX orders_tags_gin ON orders USING gin (tags);
:ex SELECT count(*) FROM orders WHERE tags @> '{vip}';
```
```text
CREATE INDEX
 Aggregate (actual rows=1.00 loops=1)
   ->  Bitmap Heap Scan on orders (actual rows=60.00 loops=1)
         Recheck Cond: (tags @> '{vip}'::text[])
         Heap Blocks: exact=60
         ->  Bitmap Index Scan on orders_tags_gin (actual rows=60.00 loops=1)
               Index Cond: (tags @> '{vip}'::text[])
               Index Searches: 1
```
행 하나가 원소 수만큼 항목을 만들어 쓰기가 비싸다(대기 목록에 모았다 한꺼번에 넣어 줄인다). jsonb와 전문 검색의 GIN은 12편에서 본다.

## GiST: 가장 가까운 매장 3곳
**GiST**(Generalized Search Tree)는 영역(경계 상자)을 겹쳐 쌓은 트리를 만드는 틀이다. 점·도형·범위 타입을 다루고 3편의 배제 제약도 GiST 위에서 돈다. 거리순 정렬(`<->`)을 인덱스로 처리하는 **최근접 이웃 검색**(KNN)이 대표적이다. 100 × 100 격자에 매장 1만 곳을 놓는다.
```sql
CREATE TABLE stores (id int PRIMARY KEY, pos point NOT NULL);
INSERT INTO stores SELECT i, point(i % 100, i / 100)
FROM generate_series(0, 9999) AS i;
CREATE INDEX stores_pos_gist ON stores USING gist (pos);
ANALYZE stores;
:ex SELECT id FROM stores ORDER BY pos <-> point '(50.2,50.1)' LIMIT 3;
```
```text
CREATE TABLE
INSERT 0 10000
CREATE INDEX
ANALYZE
 Limit (actual rows=3.00 loops=1)
   ->  Index Scan using stores_pos_gist on stores (actual rows=3.00 loops=1)
         Order By: (pos <-> '(50.2,50.1)'::point)
         Index Searches: 1
```
1만 행의 거리를 다 계산해 정렬하지 않고, 가까운 상자부터 열어 3개를 찾자마자 멈췄다(`Order By`).

## BRIN: 블록 범위마다 최솟값·최댓값만
시간 순으로 쌓이는 로그는 물리적 순서가 곧 시간 순서다. **BRIN**(Block Range Index)은 연속된 페이지 묶음(기본 128페이지)마다 최솟값과 최댓값만 적어 두고, 조건에 걸릴 수 없는 묶음을 통째로 건너뛴다. 1초에 한 건씩 100만 행을 넣는다.
```sql
CREATE TABLE events (id bigint, at timestamptz, v int)
  WITH (autovacuum_enabled = off);
INSERT INTO events
SELECT i, timestamptz '2026-01-01' + i * interval '1 s', i % 97
FROM generate_series(1, 1000000) AS i;
VACUUM ANALYZE events;
CREATE INDEX events_at_btree ON events (at);
CREATE INDEX events_at_brin ON events USING brin (at);
SELECT relname, pg_size_pretty(pg_relation_size(oid)),
       pg_relation_size(oid) / 8192 AS pages
FROM pg_class WHERE relname LIKE 'events%' ORDER BY 1;
```
```text
CREATE TABLE
INSERT 0 1000000
VACUUM
CREATE INDEX
CREATE INDEX
 events          | 50 MB          |  6370
 events_at_brin  | 24 kB          |     3
 events_at_btree | 21 MB          |  2745
```
50MB 테이블에 B-트리는 21MB, BRIN은 24kB다. B-트리를 지우고 한 시간 치(3600행)를 센다(긴 시각 조건은 …로 줄였다).
```sql
DROP INDEX events_at_btree;
:ex SELECT count(*) FROM events
    WHERE at >= '2026-01-05' AND at < '2026-01-05 01:00';
```
```text
DROP INDEX
 Aggregate (actual rows=1.00 loops=1)
   ->  Bitmap Heap Scan on events (actual rows=3600.00 loops=1)
         Recheck Cond: ((at >= '2026-01-05 00:00:00+00'…))
         Rows Removed by Index Recheck: 16496
         Heap Blocks: lossy=128
         ->  Bitmap Index Scan on events_at_brin (actual rows=1280.00 loops=1)
               Index Cond: ((at >= '2026-01-05 00:00:00+00'…))
               Index Searches: 1
```
BRIN은 "이 128페이지 안에 있을 수 있다"만 알려 주므로(`lossy`) 그 페이지를 읽어 조건을 다시 확인하며 16,496행을 버렸지만, 6,370페이지 중 128페이지만 읽었다. 이 이득은 `pg_stats.correlation`이 1에 가까울 때만 있다. 행이 시간과 무관하게 섞이면 묶음마다 최솟값·최댓값 범위가 넓어져 아무것도 못 건너뛴다.

## 크기와 사용 횟수로 값 매기기
쓰이지 않는 인덱스는 디스크와 쓰기 비용만 먹는다. `pg_stat_user_indexes`의 `idx_scan`이 쓰인 횟수다(통계는 조금 늦게 반영되어 실습에서는 즉시 반영을 강제했다).
```sql
SELECT pg_stat_force_next_flush();
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE relname = 'orders' AND idx_scan = 0
ORDER BY 1;
```
```text
 orders_created_idx  | 672 kB
 orders_pkey         | 672 kB
 orders_timezone_idx | 224 kB
```
부분 인덱스에 밀려 안 쓰인 `orders_created_idx`와 시험 삼아 만든 표현식 인덱스가 보인다. 기본 키는 조회에 안 쓰여도 제약을 지키니 지우면 안 된다. 통계는 서버마다 따로라 복제본(15편)에서만 쓰이거나 월말 배치처럼 드물게 쓰일 수 있으니 `last_idx_scan`(마지막 사용 시각)도 보고 지운다.

## 흔한 실수와 문제 해결
- **부분·표현식 인덱스가 안 쓰인다**: 조건·식이 정의와 글자 그대로 맞는지, 바인드 변수라 함축을 증명 못 하는지 본다.
- IMMUTABLE 오류: 시간대·로캘 설정에 따라 결과가 바뀌는 식이다. 식 안에 설정을 고정하거나 범위 조건으로 바꾼다.
- BRIN 묶음 크기는 `WITH (pages_per_range = …)`로 바꾼다. 작게 하면 인덱스는 커지고 건너뛰기는 정밀해진다.
- 운영 중인 테이블에는 `CREATE INDEX CONCURRENTLY`를 쓴다(13편).

## 권장 설정과 체크리스트
- 대부분은 B-트리로 충분하다. 연산자(`@>`, `<->`, `&&`)가 B-트리로 안 될 때 GIN·GiST를, 크기가 문제인 시계열에 BRIN을 고른다.
- 자주 쓰는 소수 행에는 부분 인덱스, 정렬까지 필요한 조회에는 (=조건 열, 정렬 열) 복합 인덱스, 값만 더 필요하면 INCLUDE.
- 분기마다 `idx_scan`이 0인 인덱스와 크기를 점검한다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 13편 「k-d 트리: 다차원 범위 검색과 최근접 이웃」: GiST의 KNN 검색은 그 글의 최근접 이웃 탐색처럼 "아직 더 가까울 수 있는 상자"만 열어 본다.
- 12편 「JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기」: GIN을 jsonb 포함 검색과 전문 검색에 쓰고 연산자 클래스를 비교한다.

## 정리
- 부분 인덱스는 필요한 행만 담아 작고, 쿼리 조건이 인덱스 조건을 함축해야 쓰인다.
- 표현식 인덱스는 같은 식에만 쓰이고 IMMUTABLE 함수만 허용된다. INCLUDE는 인덱스 전용 스캔을 위한 짐칸이다.
- GIN은 원소 → 행 목록, GiST는 영역 트리로 KNN·겹침을, BRIN은 묶음별 최솟값·최댓값으로 시계열을 다룬다(100만 행에서 B-트리 21MB 대 BRIN 24kB).

## 더 알아보기
- 이전 글: 6편 「인덱스 1: B-트리와 실행 계획 읽기」
- 다음 글: 8편 「쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형」
- PostgreSQL 공식 문서 「BRIN Indexes」: https://www.postgresql.org/docs/current/brin.html
