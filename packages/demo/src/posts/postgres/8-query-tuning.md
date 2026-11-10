# [PostgreSQL 실무 8/16] 쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형

> **한 줄 요약** — 느린 쿼리는 대개 행 수 추정이 실제와 어긋났거나 쿼리가 인덱스를 못 쓰는 모양이라서 생기므로, `EXPLAIN ANALYZE`로 추정과 실제를 비교해 통계나 쿼리 모양을 고치고, 고칠 순서는 `pg_stat_statements`로 정한다.

## 이 글에서 다루는 것
- 비용과 추정 행 수 읽기, 통계가 없거나 낡았을 때
- `pg_stats`의 독립 가정과 `CREATE STATISTICS`
- 인덱스를 못 쓰는 쿼리 모양, OFFSET 대 키셋 페이지네이션
- N+1 쿼리와 `pg_stat_statements`, `work_mem`과 디스크 정렬

## 문제: 어제까지 빠르던 쿼리
쿼리는 그대로인데 느려진다. 플래너는 행을 다 세는 대신 **통계**(statistics)로 조건을 통과할 행 수를 추정해 계획을 고르므로, 추정이 틀리면 계획도 틀린다. 실습 테이블을 만든다(PostgreSQL 18.6 기준, `\t on`과 `:ex`는 6편과 같고 `:ea`는 비용까지 보인다). 구 `d13`은 늘 시 `c3`에 속하고, 일부러 아직 `ANALYZE`하지 않는다.
```sql
CREATE TABLE orders (
  id int PRIMARY KEY, city text NOT NULL, district text NOT NULL,
  created_at timestamptz NOT NULL
) WITH (autovacuum_enabled = off);
INSERT INTO orders
SELECT i, 'c' || i % 10, 'd' || i % 100,
       timestamptz '2026-01-01' + i * interval '5 minutes'
FROM generate_series(1, 30000) AS i;
\t on
\set ea 'EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF, BUFFERS OFF)'
\set ex 'EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF, BUFFERS OFF)'
```

## 추정과 실제를 나란히 읽기
```sql
:ea SELECT * FROM orders WHERE city = 'c3';
VACUUM ANALYZE orders;
:ea SELECT * FROM orders WHERE city = 'c3';
```
```text
 Seq Scan on orders  (cost=0.00..379.20 rows=75 width=76) (actual rows=3000.00 loops=1)
   Filter: (city = 'c3'::text)
   Rows Removed by Filter: 27000

VACUUM
 Seq Scan on orders  (cost=0.00..567.00 rows=3000 width=18) (actual rows=3000.00 loops=1)
   Filter: (city = 'c3'::text)
   Rows Removed by Filter: 27000
```
첫 괄호가 추정이다. `cost=시작..전체`는 첫 행과 마지막 행까지의 비용(순차 페이지 읽기 1을 기준으로 한 상대 단위), `rows`는 추정 행 수, `width`는 평균 행 바이트다. 둘째 괄호 `actual rows`가 실제다. 통계가 없던 첫 계획은 3000행을 75행으로 짐작했다. 평소에는 autovacuum이 행의 10% + 50행이 바뀔 때마다 `ANALYZE`해 주지만, 대량 적재 직후 바로 도는 배치나 autovacuum이 손대지 않는 임시 테이블은 직접 해야 한다. 추정과 실제가 10배 넘게 차이 나는 노드가 튜닝의 출발점이다.

## 독립 가정: 열끼리 상관이 있으면
`ANALYZE`는 열마다 서로 다른 값의 수(`n_distinct`), 자주 나오는 값과 빈도(MCV), 히스토그램을 `pg_stats`에 남긴다. 기본값(`default_statistics_target = 100`)에서는 최대 3만 행을 표본으로 읽는다.
```sql
SELECT attname, n_distinct, most_common_freqs[1] FROM pg_stats
WHERE tablename = 'orders' AND attname IN ('city', 'district');
:ea SELECT * FROM orders WHERE city = 'c3' AND district = 'd13';
```
```text
 city     |         10 |               0.1
 district |        100 |              0.01

 Seq Scan on orders  (cost=0.00..642.00 rows=30 width=18) (actual rows=300.00 loops=1)
   Filter: ((city = 'c3'::text) AND (district = 'd13'::text))
   Rows Removed by Filter: 29700
```
시 하나는 10%, 구 하나는 1%다. 조건이 둘이면 플래너는 두 열이 **독립**이라 보고 선택도를 곱한다. 30000 × 0.1 × 0.01 = 30. 그런데 `d13`이면 늘 `c3`이니 실제는 300이다. 추정이 10배 작으면 조인 방식 등을 잘못 고른다. **확장 통계**(extended statistics)로 열 사이의 관계를 알려 준다(PostgreSQL 10부터).
```sql
CREATE STATISTICS orders_city_district (dependencies)
  ON city, district FROM orders;
ANALYZE orders;
SELECT dependencies FROM pg_stats_ext
WHERE statistics_name = 'orders_city_district';
:ea SELECT * FROM orders WHERE city = 'c3' AND district = 'd13';
```
```text
CREATE STATISTICS
ANALYZE
 {"3 => 2": 1.000000}

 Seq Scan on orders  (cost=0.00..642.00 rows=300 width=18) (actual rows=300.00 loops=1)
   Filter: ((city = 'c3'::text) AND (district = 'd13'::text))
   Rows Removed by Filter: 29700
```
`"3 => 2": 1.000000`은 3번 열(`district`)이 2번 열(`city`)을 100% 결정한다는 함수 종속이고, 추정이 300으로 맞았다. 그 밖에 그룹 수 추정용 `ndistinct`, 값 조합 빈도 목록 `mcv`(PostgreSQL 12부터)가 있다. PostgreSQL 18의 `pg_upgrade`는 일반 통계는 옮기지만 확장 통계는 옮기지 않으니 업그레이드 뒤 `ANALYZE`를 다시 돌린다.

## 인덱스를 못 쓰는 쿼리 모양
인덱스는 인덱스된 열이 연산자 한쪽에 **그대로** 있을 때만 쓰인다. 열에 함수나 형 변환을 씌우면 그 값으로는 정렬되어 있지 않으니 못 쓴다.
```sql
CREATE INDEX orders_created_idx ON orders (created_at);
:ex SELECT count(*) FROM orders WHERE created_at::date = '2026-02-01';
:ex SELECT count(*) FROM orders
    WHERE created_at >= '2026-02-01' AND created_at < '2026-02-02';
:ex SELECT * FROM orders WHERE id = 42.0;
```
```text
CREATE INDEX
 Aggregate (actual rows=1.00 loops=1)
   ->  Seq Scan on orders (actual rows=288.00 loops=1)
         Filter: ((created_at)::date = '2026-02-01'::date)
         Rows Removed by Filter: 29712

 Aggregate (actual rows=1.00 loops=1)
   ->  Index Only Scan using orders_created_idx on orders (actual rows=288.00 loops=1)
         Index Cond: ((created_at >= '2026-02-01 00:00:00+00'::timestamp with time zone) AND (created_at < '2026-02-02 00:00:00+00'::timestamp with time zone))
         Heap Fetches: 0
         Index Searches: 1

 Seq Scan on orders (actual rows=1.00 loops=1)
   Filter: ((id)::numeric = 42.0)
   Rows Removed by Filter: 29999
```
날짜로 바꾼 조건은 3만 행을 다 읽었고, 같은 뜻의 반열린 범위(`>=`, `<`)는 인덱스로 288행만 읽었다. `id = 42.0`은 리터럴이 `numeric`이라 `id`가 `numeric`으로 바뀌어(`(id)::numeric`) 기본 키를 못 썼다. 드라이버가 매개변수를 다른 형으로 보낼 때도 같으니, `Filter`에 열 쪽 형 변환이 보이면 의심한다(식에 인덱스를 거는 법은 7편).

## OFFSET 대신 키셋 페이지네이션
게시판의 "2001쪽"을 `OFFSET 20000 LIMIT 10`으로 구하면, 데이터베이스는 앞의 2만 행을 읽고 버린다. 마지막으로 본 키보다 작은 것부터 읽는 **키셋 페이지네이션**(keyset pagination)은 몇 쪽이든 10행만 읽는다.
```sql
:ex SELECT * FROM orders ORDER BY id DESC OFFSET 20000 LIMIT 10;
:ex SELECT * FROM orders WHERE id < 10000 ORDER BY id DESC LIMIT 10;
```
```text
 Limit (actual rows=10.00 loops=1)
   ->  Index Scan Backward using orders_pkey on orders (actual rows=20010.00 loops=1)
         Index Searches: 1

 Limit (actual rows=10.00 loops=1)
   ->  Index Scan Backward using orders_pkey on orders (actual rows=10.00 loops=1)
         Index Cond: (id < 10000)
         Index Searches: 1
```
`actual rows=20010` 대 `10`이다. OFFSET은 뒤쪽일수록 느리고, 읽는 사이 행이 추가되면 같은 행이 두 쪽에 나온다. 정렬 열이 유일하지 않으면 `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC`처럼 기본 키를 덧붙이고 같은 순서의 복합 인덱스를 만든다. 대신 임의의 쪽으로 건너뛰지는 못한다.

## N+1 쿼리와 pg_stat_statements
ORM이 주문 목록을 읽은 뒤 주문마다 고객을 따로 읽으면 쿼리가 1 + N번 나간다. 하나하나는 빨라 느린 쿼리 로그에 안 잡히고 왕복만 쌓인다. 쿼리 모양별 누적 통계를 모으는 확장 `pg_stat_statements`로 찾는다. 공유 메모리를 쓰므로 `shared_preload_libraries`에 넣고 재시작한 뒤 데이터베이스마다 `CREATE EXTENSION`을 한다. 그 설정으로 별도 서버를 띄운다.
```bash
docker run -d --name pg-tune -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:18-alpine \
  -c shared_preload_libraries=pg_stat_statements >/dev/null
until docker exec pg-tune pg_isready -q -h 127.0.0.1; do sleep 0.5; done
```
psql의 `\gexec`는 결과의 각 행을 SQL로 실행한다. 이것으로 N+1을 흉내 낸다.
```sql
-- 파일: n1.sql
CREATE EXTENSION pg_stat_statements;
CREATE TABLE customers (id int PRIMARY KEY, name text);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int);
INSERT INTO customers SELECT i, 'cust' || i FROM generate_series(1, 100) i;
INSERT INTO orders SELECT i, i % 100 + 1 FROM generate_series(1, 1000) i;
\o /dev/null
SELECT pg_stat_statements_reset();
-- N+1: 주문 100건(1) + 주문마다 고객 조회(N)
SELECT format('SELECT name FROM customers WHERE id = %s', customer_id)
FROM orders WHERE id <= 100 \gexec
-- 조인 한 번
SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id
WHERE o.id <= 100;
\o
SELECT calls, rows, query FROM pg_stat_statements
WHERE query LIKE 'SELECT%' AND query NOT LIKE '%pg_stat%'
ORDER BY calls DESC, query;
```
```bash
docker exec -i pg-tune psql -U postgres -X -q < n1.sql
docker rm -f pg-tune >/dev/null
```
```text
 calls | rows |                                   query
-------+------+----------------------------------------------------------------------------
   100 |  100 | SELECT name FROM customers WHERE id = $1
     1 |  100 | SELECT format($1, customer_id)                                            +
       |      | FROM orders WHERE id <= $2
     1 |  100 | SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id+
       |      | WHERE o.id <= $1
(3 rows)
```
상수가 `$1`로 바뀌어 같은 모양의 쿼리가 한 줄로 모였고, 고객 조회가 100번 불렸다. 조인은 1번으로 같은 100행을 얻었다. 운영에서는 `total_exec_time`(누적 실행 시간, 밀리초) 상위 10개부터 보고(시간 열은 실행마다 달라 여기서는 뺐다), 그 쿼리에 `EXPLAIN ANALYZE`를 건다.

## work_mem과 디스크 정렬
정렬과 해시는 노드마다 `work_mem`(기본 4MB)까지 메모리를 쓰고, 넘치면 임시 파일로 내려간다.
```sql
SET work_mem = '64kB';
:ex SELECT * FROM orders ORDER BY district, id;
RESET work_mem;
:ex SELECT * FROM orders ORDER BY district, id;
```
```text
SET
 Sort (actual rows=30000.00 loops=1)
   Sort Key: district, id
   Sort Method: external merge  Disk: 1048kB
   ->  Seq Scan on orders (actual rows=30000.00 loops=1)

RESET
 Sort (actual rows=30000.00 loops=1)
   Sort Key: district, id
   Sort Method: quicksort  Memory: 1940kB
   ->  Seq Scan on orders (actual rows=30000.00 loops=1)
```
같은 정렬이 `external merge`(디스크 1MB)에서 `quicksort`(메모리 약 1.9MB)로 바뀌었다. 그렇다고 서버 전체의 `work_mem`을 크게 올리면 위험하다. 정렬·해시 노드마다, 연결마다 따로 쓰기 때문이다. 무거운 보고서 쿼리만 `SET LOCAL work_mem`으로 올리고, `log_temp_files`로 임시 파일을 쓰는 쿼리를 로그에 남긴다.

## 흔한 실수와 권장 체크리스트
- 계획 모양부터 보지 말고 **추정과 실제가 처음 크게 어긋나는 노드**를 찾는다. 그 아래가 원인이다.
- 대량 적재·삭제 직후, 임시 테이블, 업그레이드 직후에는 `ANALYZE`. 분포가 치우친 열은 `ALTER COLUMN … SET STATISTICS 500`처럼 표본을 늘린다.
- WHERE의 열에는 함수·형 변환을 씌우지 않는다. 날짜는 반열린 범위로, 매개변수 형은 열 형과 맞춘다.
- 깊은 페이지는 키셋으로, 목록 + 상세 조회는 조인이나 `WHERE id = ANY($1)` 한 번으로 바꾼다.

## 어디에 쓰이나
- 확률과 분포 2편 「조건부 확률과 독립」: 플래너의 선택도 곱셈은 P(A ∩ B) = P(A)·P(B)라는 독립 가정이고, 함수 종속이 있으면 P(A ∩ B) = P(B)가 된다.
- 통계학 2편 「모집단, 표본, 표본 분포」: `ANALYZE`는 테이블을 다 읽지 않고 표본으로 분포를 추정하므로, 큰 테이블의 드문 값은 표본 크기(`STATISTICS`)에 따라 추정이 흔들린다.

## 정리
- `EXPLAIN ANALYZE`의 `rows`(추정)와 `actual rows`(실제)를 노드마다 비교하는 것이 튜닝의 첫걸음이다.
- 통계가 없거나 낡으면 `ANALYZE`, 열끼리 상관이 있으면 `CREATE STATISTICS`로 추정을 고친다.
- 열에 씌운 함수·형 변환과 깊은 OFFSET은 인덱스를 무력화한다. 범위 조건과 키셋으로 바꾼다.
- N+1은 `pg_stat_statements`의 호출 수로 드러나고, 디스크 정렬은 쿼리 단위 `work_mem`으로 없앤다.

## 더 알아보기
- 이전 글: 7편 「인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN」
- 다음 글: 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」
- PostgreSQL 공식 문서 「pg_stat_statements」: https://www.postgresql.org/docs/current/pgstatstatements.html
