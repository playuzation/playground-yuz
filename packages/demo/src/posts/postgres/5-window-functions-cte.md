# [PostgreSQL 실무 5/16] 윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리

> **한 줄 요약** — 윈도 함수는 행을 접지 않고 각 행 옆에 "창" 안의 집계를 붙이고, CTE는 쿼리를 이름 붙은 단계로 나누며, 재귀 CTE는 트리와 그래프를 펼친다. 기본 프레임·인라인·순환이라는 함정만 알면 애플리케이션의 반복문을 크게 줄인다.

## 이 글에서 다루는 것
- `OVER (PARTITION BY … ORDER BY …)`의 뜻과 실행 방식
- `row_number`·`rank`·`dense_rank`, `lag`, 누적 합과 이동 평균
- 기본 프레임 RANGE의 함정
- CTE와 `MATERIALIZED`, 재귀 CTE와 `CYCLE` 절, 서브쿼리 방식과 결과 대조

## 문제: 매장별 일 매출 보고서
"매장별로 날짜마다 매출, 전일 대비, 누적 합, 순위를 한 표로"는 흔한 요청이다. GROUP BY는 매장당 한 줄로 접어 날짜 행을 없애고, 예전에는 자기 조인이나 서브쿼리로 풀었다. PostgreSQL 8.4(2009)부터 있는 **윈도 함수**(window function)가 답이다. 데이터를 만든다(PostgreSQL 18.6 기준, 행 수 줄은 생략). west는 3월 4일 매출이 없다.
```sql
\pset footer off
CREATE TABLE sales (store text, day date, amount int);
INSERT INTO sales VALUES
 ('east', '2026-03-02', 120), ('east', '2026-03-03', 90),
 ('east', '2026-03-04', 150), ('east', '2026-03-05', 150),
 ('east', '2026-03-06', 200), ('west', '2026-03-02', 80),
 ('west', '2026-03-03', 110), ('west', '2026-03-05', 130),
 ('west', '2026-03-06', 100);
```
집계 함수에 `OVER`를 붙이면 행이 그대로 남고 옆에 값이 붙는다. `lag(열)`은 창 안의 바로 앞 행 값을, `ORDER BY`가 있는 `sum`은 누적 합을, 프레임을 지정한 `avg`는 이동 평균을 준다.
```sql
SELECT store, day, amount,
       amount - lag(amount) OVER (PARTITION BY store ORDER BY day)
         AS diff,
       sum(amount) OVER (PARTITION BY store ORDER BY day) AS running,
       round(avg(amount) OVER (PARTITION BY store ORDER BY day
                               ROWS 2 PRECEDING), 1) AS avg3
FROM sales ORDER BY store, day;
```
```text
 store |    day     | amount | diff | running | avg3
-------+------------+--------+------+---------+-------
 east  | 2026-03-02 |    120 |      |     120 | 120.0
 east  | 2026-03-03 |     90 |  -30 |     210 | 105.0
 east  | 2026-03-04 |    150 |   60 |     360 | 120.0
 east  | 2026-03-05 |    150 |    0 |     510 | 130.0
 east  | 2026-03-06 |    200 |   50 |     710 | 166.7
 west  | 2026-03-02 |     80 |      |      80 |  80.0
 west  | 2026-03-03 |    110 |   30 |     190 |  95.0
 west  | 2026-03-05 |    130 |   20 |     320 | 106.7
 west  | 2026-03-06 |    100 |  -30 |     420 | 113.3
```
매장이 바뀌면 누적 합이 다시 시작하고, 첫날은 앞 행이 없어 `diff`가 NULL이다. west의 3월 5일 20은 3월 3일과의 차이다. `lag`는 "어제"가 아니라 "앞 행"이다. 날짜가 빠질 수 있으면 `generate_series`로 만든 날짜 표에 LEFT JOIN한 뒤 계산한다.

## 원리: 나누고, 정렬하고, 창을 민다
`OVER (…)`의 세 부분이 각 행의 **창**(window)을 정한다. `PARTITION BY`는 행을 묶음으로 나누고(없으면 전체가 하나), `ORDER BY`는 묶음 안 순서를, **프레임**(frame)은 현재 행 기준 집계 범위를 정한다. 실행기는 파티션·정렬 열로 한 번 정렬하고 위에서부터 훑는다.
```sql
EXPLAIN (COSTS OFF)
SELECT store, day, sum(amount) OVER (PARTITION BY store ORDER BY day)
FROM sales;
```
```text
                    QUERY PLAN
---------------------------------------------------
 WindowAgg
   Window: w1 AS (PARTITION BY store ORDER BY day)
   ->  Sort
         Sort Key: store, day
         ->  Seq Scan on sales
```
`Sort` 위의 `WindowAgg`가 그 훑기다. 큰 테이블에서는 `(store, day)` 인덱스가 정렬을 대신할 수 있다(6편).

## 순위: row_number, rank, dense_rank
세 함수는 동점(같은 `ORDER BY` 값, **피어**(peer)라 부른다)을 다르게 다룬다. 같은 창을 여러 번 쓰면 `WINDOW` 절로 이름을 붙인다.
```sql
SELECT day, amount,
       row_number() OVER w, rank() OVER w, dense_rank() OVER w
FROM sales WHERE store = 'east'
WINDOW w AS (ORDER BY amount DESC);
```
```text
    day     | amount | row_number | rank | dense_rank
------------+--------+------------+------+------------
 2026-03-06 |    200 |          1 |    1 |          1
 2026-03-04 |    150 |          2 |    2 |          2
 2026-03-05 |    150 |          3 |    2 |          2
 2026-03-02 |    120 |          4 |    4 |          3
 2026-03-03 |     90 |          5 |    5 |          4
```
150이 두 번이다. `row_number`는 동점에도 끊김 없이 매기고(어느 쪽이 2인지는 보장되지 않는다), `rank`는 같은 순위 뒤 건너뛰고(2, 2, 4), `dense_rank`는 건너뛰지 않는다(2, 2, 3).

## 프레임: 기본값 RANGE의 함정
프레임을 생략하면 `ORDER BY`가 있을 때 기본값은 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`다. RANGE는 행 개수가 아니라 `ORDER BY` 값으로 범위를 잡아 현재 행의 피어를 모두 넣는다. 금액 순 누적 합으로 확인한다.
```sql
SELECT amount,
       sum(amount) OVER (ORDER BY amount) AS range_sum,
       sum(amount) OVER (ORDER BY amount
                         ROWS UNBOUNDED PRECEDING) AS rows_sum
FROM sales WHERE store = 'east';
```
```text
 amount | range_sum | rows_sum
--------+-----------+----------
     90 |        90 |       90
    120 |       210 |      210
    150 |       510 |      360
    150 |       510 |      510
    200 |       710 |      710
```
150인 두 행은 기본 프레임에서 둘 다 510이다. 첫 150 행에서 이미 피어인 둘째 행까지 더했다. `ROWS`로 바꾸면 한 행씩 쌓인다(360 → 510). 같은 이유로 `last_value`도 파티션의 끝이 아니라 현재 피어 중 마지막을 돌려주니, 끝까지 보려면 프레임을 `UNBOUNDED FOLLOWING`까지 넓힌다.

앞 표의 이동 평균 `avg3`은 `ROWS 2 PRECEDING`(앞 두 행 + 현재 행)이라, west의 3월 5일 106.7은 나흘(3월 2·3·5일)에 걸친 평균이다. "최근 3일"을 원하면 PostgreSQL 11부터 쓸 수 있는 `RANGE BETWEEN '2 days' PRECEDING AND CURRENT ROW`로 값의 거리를 준다(3월 3·5일 두 행, 120.0).

## 흔한 실수: WHERE에서 윈도 함수 쓰기
"1위만" 거르려고 WHERE에 윈도 함수를 쓰면 오류다. 윈도 함수는 WHERE·GROUP BY·HAVING 다음에 계산된다.
```sql
SELECT day, amount FROM sales
WHERE rank() OVER (ORDER BY amount DESC) = 1;
```
```text
ERROR:  window functions are not allowed in WHERE
LINE 2: WHERE rank() OVER (ORDER BY amount DESC) = 1;
              ^
```
순위를 계산하는 단계를 먼저 두고 그 결과를 거른다.

## CTE와 MATERIALIZED
`WITH 이름 AS (쿼리)`로 만드는 **공통 테이블 식**(common table expression, CTE)은 쿼리를 위에서 아래로 읽히는 단계로 나눈다(PostgreSQL 18에는 `QUALIFY` 절이 없다).
```sql
WITH ranked AS (
  SELECT store, day, amount,
         rank() OVER (PARTITION BY store ORDER BY amount DESC) AS rnk
  FROM sales)
SELECT store, amount FROM ranked WHERE rnk = 1;
```
```text
 store | amount
-------+--------
 east  |    200
 west  |    130
```
PostgreSQL 11까지 CTE는 늘 먼저 통째로 계산되는 **최적화 울타리**였다. 12부터는 재귀가 아니고 부수 효과가 없으며 한 번만 참조되는 CTE를 바깥 쿼리에 녹여(인라인) 조건을 안으로 밀어 넣는다. 1만 행 테이블로 비교한다.
```sql
CREATE TABLE big (id int PRIMARY KEY);
INSERT INTO big SELECT generate_series(1, 10000);
ANALYZE big;
EXPLAIN (COSTS OFF)
WITH t AS (SELECT * FROM big) SELECT * FROM t WHERE id = 42;
EXPLAIN (COSTS OFF)
WITH t AS MATERIALIZED (SELECT * FROM big) SELECT * FROM t WHERE id = 42;
```
```text
CREATE TABLE
INSERT 0 10000
ANALYZE
              QUERY PLAN
---------------------------------------
 Index Only Scan using big_pkey on big
   Index Cond: (id = 42)

       QUERY PLAN
-------------------------
 CTE Scan on t
   Filter: (id = 42)
   CTE t
     ->  Seq Scan on big
```
기본은 `id = 42`가 안으로 들어가 인덱스를 탔고, `MATERIALIZED`는 1만 행을 다 만든 뒤(`CTE Scan`) 걸렀다. 두 번 이상 참조하는 CTE는 지금도 한 번만 계산해 재사용하며, 그래도 녹이고 싶으면 `NOT MATERIALIZED`를 붙인다.

## 재귀 CTE: 조직도 펼치기
`WITH RECURSIVE`는 시작 행(앵커)을 구한 뒤, 직전 단계에서 새로 나온 행만으로 재귀 부분을 반복하다 새 행이 없으면 멈춘다. 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」의 BFS처럼 단계별로 넓혀 간다. PostgreSQL 14부터는 `SEARCH DEPTH FIRST BY`로 깊이 우선 순서 열을 만들 수 있다.
```sql
CREATE TABLE emp (id int PRIMARY KEY, name text, boss int);
INSERT INTO emp VALUES (1, 'ceo', NULL), (2, 'cto', 1), (3, 'cfo', 1),
  (4, 'dev-lead', 2), (5, 'dev-a', 4), (6, 'accountant', 3);
WITH RECURSIVE tree AS (
  SELECT id, name, 1 AS depth FROM emp WHERE boss IS NULL   -- 앵커
  UNION ALL
  SELECT e.id, e.name, t.depth + 1
  FROM emp e JOIN tree t ON e.boss = t.id
) SEARCH DEPTH FIRST BY id SET ord
SELECT repeat('  ', depth - 1) || name AS org, depth
FROM tree ORDER BY ord;
```
```text
CREATE TABLE
INSERT 0 6
      org       | depth
----------------+-------
 ceo            |     1
   cto          |     2
     dev-lead   |     3
       dev-a    |     4
   cfo          |     2
     accountant |     3
```

## 순환 막기: CYCLE 절
a → b → c → a 같은 순환이 있으면 재귀가 끝나지 않는다. 예전에는 지나온 경로 배열로 직접 막았고, PostgreSQL 14부터는 `CYCLE` 절이 지나온 노드를 다시 만나면 `is_cycle`을 참으로 표시하고 거기서 멈춘다.
```sql
CREATE TABLE link (src text, dst text);
INSERT INTO link VALUES ('a', 'b'), ('b', 'c'), ('c', 'a'), ('c', 'd');
WITH RECURSIVE walk AS (
  SELECT 'a' AS node
  UNION ALL
  SELECT l.dst FROM link l JOIN walk w ON l.src = w.node
) CYCLE node SET is_cycle USING path
SELECT node, is_cycle, path FROM walk;
```
```text
CREATE TABLE
INSERT 0 4
 node | is_cycle |       path
------+----------+-------------------
 a    | f        | {(a)}
 b    | f        | {(a),(b)}
 c    | f        | {(a),(b),(c)}
 a    | t        | {(a),(b),(c),(a)}
 d    | f        | {(a),(b),(c),(d)}
```

## 검증: 서브쿼리 방식과 같은 답인가
윈도 함수의 누적 합을, 행마다 상관 서브쿼리로 다시 더한 값과 맞춘다. 양쪽 모두 9행이니 차집합(`EXCEPT`)이 비면 같다.
```sql
SELECT count(*) AS mismatches FROM (
  SELECT store, day, sum(amount) OVER (PARTITION BY store ORDER BY day)
  FROM sales
  EXCEPT
  SELECT store, day, (SELECT sum(amount) FROM sales x
                      WHERE x.store = o.store AND x.day <= o.day)
  FROM sales o) d;
```
```text
 mismatches
------------
          0
```
답은 같지만 서브쿼리 방식은 행마다 테이블을 다시 훑어 O(n²)이고, 윈도 함수는 정렬 한 번에 훑기 한 번이다.

## 권장 습관
- 누적 합·이동 평균은 프레임을 늘 명시하고(`ROWS BETWEEN …`), `ORDER BY`에 동점을 가르는 열(기본 키 등)을 더해 결과를 결정적으로 만든다.
- 재귀 CTE의 `UNION`(중복 제거)은 완전히 같은 행만 거르므로 깊이 열이 있으면 순환을 못 막는다. 그래프에는 `CYCLE`을, 깊이 제한에는 `WHERE depth < N`을 둔다.
- `MATERIALIZED`는 습관처럼 붙이지 않는다(조건이 안으로 못 들어간다).

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 재귀 CTE의 반복은 BFS의 단계별 확장이고, `SEARCH DEPTH FIRST`는 DFS 순서를 만든다.
- 알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」: `sum() OVER (ORDER BY …)`가 누적 합 배열이고, 이동 합은 두 누적 합의 차다.

## 정리
- 윈도 함수는 행을 남긴 채 파티션·순서·프레임으로 정한 창의 값을 붙인다. 실행은 정렬 한 번과 훑기 한 번이다.
- `ORDER BY`가 있으면 기본 프레임은 피어를 포함하는 RANGE라 동점에서 결과가 기대와 달라진다.
- CTE는 PostgreSQL 12부터 한 번만 참조되면 인라인되고, `MATERIALIZED`로 울타리를 칠 수 있다.
- 재귀 CTE는 앵커 + 반복으로 트리를 펼치고, 순환은 PostgreSQL 14의 `CYCLE` 절로 막는다.

## 더 알아보기
- 이전 글: 4편 「조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기」
- 다음 글: 6편 「인덱스 1: B-트리와 실행 계획 읽기」
- PostgreSQL 공식 문서 「WITH Queries (Common Table Expressions)」: https://www.postgresql.org/docs/current/queries-with.html
