# [PostgreSQL 실무 4/16] 조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기

> **한 줄 요약** — 외부 조인은 짝 없는 쪽을 NULL로 채우고 NULL과의 비교는 "모름"이 되므로, 조건을 ON과 WHERE 중 어디에 두는지, `NOT IN`과 `NOT EXISTS`, `count(*)`와 `count(열)` 중 무엇을 쓰는지에 따라 행이 조용히 사라지거나 0이 1이 된다.

## 이 글에서 다루는 것
- INNER·LEFT·FULL 조인, 조건을 ON에 둘 때와 WHERE에 둘 때
- NULL의 삼값 논리: `NOT IN` 함정과 `IS DISTINCT FROM`
- GROUP BY·HAVING, `count(*)`와 `count(열)`, FILTER 절
- DISTINCT ON, EXISTS 대 IN, LATERAL로 그룹별 상위 N개
- 결과를 손으로 센 값과 파이썬 계산으로 대조하기

## 예제 데이터와 손으로 센 기대값
고객 넷 중 박세나와 최네오는 주문이 없고 최네오는 도시가 NULL이다. 주문 여섯 건 중 105번은 비회원 주문이라 `customer_id`가 NULL이다.
```sql
CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, city text);
CREATE TABLE orders (
  id int PRIMARY KEY, customer_id int REFERENCES customers,
  amount int NOT NULL, status text NOT NULL, ordered_at date NOT NULL
);
INSERT INTO customers VALUES
  (1, '김하나', '서울'), (2, '이두리', '부산'),
  (3, '박세나', '서울'), (4, '최네오', NULL);
INSERT INTO orders VALUES
  (101, 1, 30000, 'paid', '2026-03-01'), (102, 1, 12000, 'paid', '2026-03-05'),
  (103, 2, 50000, 'cancelled', '2026-03-02'), (104, 2, 8000, 'paid', '2026-03-07'),
  (105, NULL, 5000, 'paid', '2026-03-03'), (106, 1, 20000, 'cancelled', '2026-03-08');
```
기대값부터 센다. 고객이 있는 주문 5건이 INNER 조인 5행, 주문 없는 고객 둘이 붙으면 LEFT 7행, 고객 없는 주문 105까지 붙으면 FULL 8행이다. psql은 NULL을 빈칸으로 보여 주므로 `\pset null`로 드러낸다.
```sql
\pset null '(null)'
SELECT
  (SELECT count(*) FROM customers c JOIN orders o ON o.customer_id = c.id) AS inner_rows,
  (SELECT count(*) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id) AS left_rows,
  (SELECT count(*) FROM customers c FULL JOIN orders o ON o.customer_id = c.id) AS full_rows;
```
```text
Null display is "(null)".
 inner_rows | left_rows | full_rows
------------+-----------+-----------
          5 |         7 |         8
(1 row)
```
**외부 조인**(outer join)은 짝이 없는 행을 버리지 않고 반대쪽 열을 NULL로 채운다(FULL은 양쪽 모두). 이 NULL이 뒤에서 말썽을 부린다.

## 조건은 ON에, 아니면 WHERE에?
"고객별 결제 완료 주문 수, 주문이 없으면 0"을 구하려고 LEFT 조인 뒤 WHERE로 상태를 거르면 고객 둘이 사라진다.
```sql
SELECT c.name, count(o.id) AS paid_orders
FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.id ORDER BY c.id;
```
```text
  name  | paid_orders
--------+-------------
 김하나 |           2
 이두리 |           1
(2 rows)
```
WHERE는 조인이 끝난 뒤 적용된다. 박세나의 행은 `o.status`가 NULL로 채워져 있고 `NULL = 'paid'`는 참이 아니라 모름이라 걸러진다. 결국 LEFT 조인이 INNER 조인과 같아진다. 조인 부분의 실행 계획을 보면 플래너도 그렇게 판단한다(계획 읽는 법은 6편).
```sql
EXPLAIN (COSTS OFF) SELECT c.name FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'paid';
```
```text
                  QUERY PLAN
-----------------------------------------------
 Hash Join
   Hash Cond: (c.id = o.customer_id)
   ->  Seq Scan on customers c
   ->  Hash
         ->  Seq Scan on orders o
               Filter: (status = 'paid'::text)
(6 rows)
```
계획에 Left가 없는 그냥 `Hash Join`이다. "어느 행을 짝지을지"는 ON에, "결과에서 어느 행을 남길지"는 WHERE에 둔다. 조건을 ON으로 옮기고 집계 함수의 차이도 함께 보자.
```sql
SELECT c.name, count(*) AS count_star, count(o.id) AS paid_orders,
       sum(o.amount) AS paid_sum, coalesce(sum(o.amount), 0) AS paid_sum0
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
GROUP BY c.id ORDER BY c.id;
```
```text
  name  | count_star | paid_orders | paid_sum | paid_sum0
--------+------------+-------------+----------+-----------
 김하나 |          2 |           2 |    42000 |     42000
 이두리 |          1 |           1 |     8000 |      8000
 박세나 |          1 |           0 |   (null) |         0
 최네오 |          1 |           0 |   (null) |         0
(4 rows)
```
네 명이 모두 남았다. `count(*)`는 NULL로 채운 행도 1로 세고 `count(o.id)`는 NULL이 아닌 값만 세므로, 외부 조인의 개수는 오른쪽 테이블의 열로 센다. `sum`은 더할 값이 없으면 NULL이라 `coalesce`로 0을 채운다. `c.name`을 SELECT하면서 `GROUP BY c.id`만 적어도 되는 것은 기본 키로 묶으면 같은 테이블의 다른 열도 정해진다는 것을 PostgreSQL이 알기 때문이다.

## NULL의 삼값 논리
SQL의 비교는 참, 거짓, 모름(NULL) 세 값을 낸다. WHERE는 참인 행만 남긴다.
```sql
SELECT NULL = NULL AS eq, NULL IS NULL AS is_null,
       NULL IS DISTINCT FROM 1 AS dist,
       3 NOT IN (1, 2) AS a, 3 NOT IN (1, 2, NULL) AS b;
```
```text
   eq   | is_null | dist | a |   b
--------+---------+------+---+--------
 (null) | t       | t    | t | (null)
(1 row)
```
`3 NOT IN (1, 2, NULL)`은 `3 <> 1 AND 3 <> 2 AND 3 <> NULL`이고 마지막 항이 모름이라 전체가 모름이다. 그래서 하위 쿼리에 NULL이 섞이면 `NOT IN`은 아무 행도 돌려주지 않는다. 주문한 적 없는 고객을 찾아 보자.
```sql
SELECT name FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
SELECT name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
ORDER BY id;
```
```text
 name
------
(0 rows)

  name
--------
 박세나
 최네오
(2 rows)
```
주문 105의 NULL 하나 때문에 `NOT IN`은 0행이다. `NOT EXISTS`는 "짝이 있는가"만 물어 NULL에 흔들리지 않고, 플래너가 안티 조인(anti join)으로 바꿀 수 있다.
```sql
EXPLAIN (COSTS OFF) SELECT name FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```
```text
...
 Hash Right Anti Join
   Hash Cond: (o.customer_id = c.id)
   ->  Seq Scan on orders o
   ->  Hash
         ->  Seq Scan on customers c
(5 rows)
```
`NOT IN`은 NULL 의미를 지키느라 안티 조인이 되지 못하고, 하위 쿼리 결과를 해시해 두고 행마다 찾아보는 필터(`hashed SubPlan`)로 남는다. 긍정형 `IN (하위 쿼리)`와 `EXISTS`는 NULL 문제가 없고 이 데이터에서는 계획도 똑같이 나왔다. 부정형만 `NOT EXISTS`로 쓰면 된다. 값 비교도 마찬가지로, `WHERE city <> '서울'`은 도시가 NULL인 최네오를 빠뜨린다. NULL을 하나의 값처럼 비교하는 `city IS DISTINCT FROM '서울'`을 쓰면 이두리와 최네오가 함께 나온다.

## GROUP BY, HAVING, FILTER
집계 함수는 NULL을 건너뛴다. `count(DISTINCT 열)`은 서로 다른 값의 수이고, `FILTER (WHERE …)`는 집계마다 다른 조건을 건다. 손으로 세면 주문 6건, 고객이 있는 주문 5건, 고객 2명, 결제 완료 합계 30000 + 12000 + 8000 + 5000 = 55000, 취소 2건이다.
```sql
SELECT count(*) AS orders, count(customer_id) AS with_customer,
       count(DISTINCT customer_id) AS customers,
       sum(amount) FILTER (WHERE status = 'paid') AS paid_total,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders;
```
```text
 orders | with_customer | customers | paid_total | cancelled
--------+---------------+-----------+------------+-----------
      6 |             5 |         2 |      55000 |         2
(1 row)
```
WHERE는 그룹을 만들기 전에 행을 거르고, HAVING은 집계가 끝난 그룹을 거른다. "결제 합계가 2만 원 이상인 고객"은 HAVING이다.
```sql
SELECT c.name, sum(o.amount) AS paid_total
FROM customers c JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.id HAVING sum(o.amount) >= 20000;
```
```text
  name  | paid_total
--------+------------
 김하나 |      42000
(1 row)
```

## DISTINCT ON과 LATERAL: 그룹별 최신·상위 N개
"고객별 가장 최근 주문"은 PostgreSQL 고유 문법 `DISTINCT ON`이 가장 짧다. 괄호 안 식이 같은 행들 중 ORDER BY 순서로 첫 행만 남기므로, ORDER BY를 그 식으로 시작하고 동점을 가를 열(`id DESC`)까지 적는다.
```sql
SELECT DISTINCT ON (customer_id) customer_id, id, ordered_at
FROM orders WHERE customer_id IS NOT NULL
ORDER BY customer_id, ordered_at DESC, id DESC;
```
```text
 customer_id | id  | ordered_at
-------------+-----+------------
           1 | 106 | 2026-03-08
           2 | 104 | 2026-03-07
(2 rows)
```
상위 N개는 **LATERAL** 조인으로 푼다. LATERAL 하위 쿼리는 앞 테이블의 현재 행(`c.id`)을 참조해 고객마다 "금액 상위 2건"을 따로 실행하는 것과 같다. `LEFT JOIN … ON true`는 주문 없는 고객도 남긴다.
```sql
SELECT c.name, t.id, t.amount
FROM customers c
LEFT JOIN LATERAL (
  SELECT o.id, o.amount FROM orders o
  WHERE o.customer_id = c.id
  ORDER BY o.amount DESC LIMIT 2
) t ON true
ORDER BY c.id, t.amount DESC;
```
```text
  name  |   id   | amount
--------+--------+--------
 김하나 |    101 |  30000
 김하나 |    106 |  20000
 이두리 |    103 |  50000
 이두리 |    104 |   8000
 박세나 | (null) | (null)
 최네오 | (null) | (null)
(6 rows)
```
`orders(customer_id, amount)` 인덱스가 있으면 고객마다 인덱스 앞부분만 읽고 끝난다(6편). 같은 문제를 `row_number()` 윈도 함수로 푸는 방법은 5편에서 비교한다.

## 파이썬으로 다시 세어 대조하기
원시 행으로 다시 계산해 SQL과 비교한다. 접속 정보는 libpq 환경 변수(`PG*`)로 준다.
```python
import psycopg

with psycopg.connect() as conn:
    ids = [r[0] for r in conn.execute("SELECT id FROM customers")]
    rows = conn.execute("SELECT customer_id, amount, status FROM orders").fetchall()
    sql = conn.execute("""
        SELECT c.id, count(o.id), coalesce(sum(o.amount), 0)
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'paid'
        GROUP BY c.id ORDER BY c.id""").fetchall()

mine = []
for cid in sorted(ids):
    paid = [amt for c, amt, st in rows if c == cid and st == "paid"]
    mine.append((cid, len(paid), sum(paid)))
print(mine)
print("SQL과 일치:", mine == sql)
```
```text
[(1, 2, 42000), (2, 1, 8000), (3, 0, 0), (4, 0, 0)]
SQL과 일치: True
```

## 흔한 실수와 문제 해결
- `column "customers.name" must appear in the GROUP BY clause or be used in an aggregate function`: 그룹마다 하나로 정해지지 않는 열을 SELECT에 썼다. GROUP BY에 넣거나, 기본 키로 묶거나, 집계 함수로 감싼다.
- 일대다 조인 뒤 부모 쪽 금액을 `sum`하면 자식 수만큼 부풀려진다. 먼저 집계하고 조인한다.
- 외부 조인의 `count(*)`, WHERE에 둔 오른쪽 테이블 조건, NULL이 섞인 `NOT IN`은 오류 없이 틀린 답을 내므로 기대 행 수를 미리 세어 비교한다.

## 어디에 쓰이나
- 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」: SQL은 참·거짓에 "모름"을 더한 삼값 논리라 `p OR NOT p`가 늘 참이라는 배중률이 NULL에서 깨진다.
- 이산수학 1편 「집합과 함수: 수학의 기본 언어」: INNER 조인은 곱집합에서 조건을 만족하는 쌍이고, 세미·안티 조인은 교집합·차집합에 해당한다.
- 5편 「윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리」: 그룹별 상위 N개를 `row_number()`로 다시 풀고, 행을 줄이지 않는 집계를 다룬다.

## 정리
- 외부 조인은 짝 없는 쪽을 NULL로 채운다. 짝짓는 조건은 ON에, 결과를 거르는 조건은 WHERE에 둔다.
- NULL과의 비교는 모름이라 WHERE를 통과하지 못한다. 부정형은 `NOT EXISTS`, NULL을 값처럼 비교하려면 `IS DISTINCT FROM`이다.
- 외부 조인의 개수는 `count(오른쪽 열)`로 세고, 빈 그룹의 `sum`은 NULL이니 `coalesce`로 0을 채운다.
- 그룹별 최신 행은 DISTINCT ON, 상위 N개는 LATERAL로 풀고, 결과는 손으로 센 값과 대조한다.

## 더 알아보기
- 이전 글: 3편 「제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약」
- 다음 글: 5편 「윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리」
- PostgreSQL 문서 "Table Expressions": https://www.postgresql.org/docs/current/queries-table-expressions.html
