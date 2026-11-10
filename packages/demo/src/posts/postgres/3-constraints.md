# [PostgreSQL 실무 3/16] 제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약

> **한 줄 요약** — 제약 조건은 모든 쓰기 경로에서 예외 없이 검사되는 규칙이라, "먼저 조회하고 넣기"가 동시 요청에서 놓치는 중복·고아 행·겹친 예약을 데이터베이스가 마지막에 막아 준다.

## 이 글에서 다루는 것
- 검사를 애플리케이션이 아니라 데이터베이스에 두는 이유(동시 요청 재현)
- NOT NULL, CHECK, PRIMARY KEY, UNIQUE와 NULL(`NULLS NOT DISTINCT`)
- 외래 키와 ON DELETE, 지연 가능한 제약
- 배제 제약과 PostgreSQL 18의 `WITHOUT OVERLAPS`, 오류 처리

## "먼저 조회하고 넣기"는 왜 실패하나
회원 가입을 "같은 이메일을 조회하고 없으면 INSERT"로 짜면, 동시에 온 요청 두 개가 둘 다 "없음"을 보고 둘 다 넣는다. 연결 두 개로 순서를 고정해 재현한다. 파이썬 블록의 접속 정보는 libpq 환경 변수(`PG*`)로 준다.
```python
import psycopg

db = psycopg.connect(autocommit=True)
db.execute("CREATE TABLE plain (email text)")
db.execute("CREATE TABLE guarded (email text UNIQUE)")
for table in ("plain", "guarded"):
    a, b = psycopg.connect(), psycopg.connect()
    q = f"SELECT count(*) FROM {table} WHERE email = 'kim@example.com'"
    seen = [a.execute(q).fetchone()[0], b.execute(q).fetchone()[0]]
    for conn in (a, b):
        try:
            conn.execute(f"INSERT INTO {table} VALUES ('kim@example.com')")
            conn.commit()
        except psycopg.errors.UniqueViolation as e:
            print(" ", e.diag.message_primary)
            conn.rollback()
    n = db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    print(table, "조회", seen, "→ 저장", n)
```
```text
plain 조회 [0, 0] → 저장 2
  duplicate key value violates unique constraint "guarded_email_key"
guarded 조회 [0, 0] → 저장 1
```
둘 다 0을 봤지만 UNIQUE가 있는 쪽만 중복을 막았다. UNIQUE는 유일 B-트리 인덱스로 구현되어 키를 넣는 순간 같은 키를 확인하므로 조회와 삽입 사이의 틈이 없다. 정말 동시라면 뒤의 INSERT가 앞 트랜잭션이 끝나길 기다렸다가 오류를 받는다(9편, 11편). 애플리케이션 검사는 친절한 메시지용이고, 최종 판정은 제약이 한다.

## NOT NULL, CHECK, UNIQUE, PRIMARY KEY
```sql
CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  phone text UNIQUE,
  age int CHECK (age >= 0)
);
INSERT INTO users (email) VALUES ('a@example.com'), ('b@example.com');
INSERT INTO users (email) VALUES ('a@example.com');
INSERT INTO users (email) VALUES (NULL);
INSERT INTO users (email, age) VALUES ('c@example.com', -1);
INSERT INTO users (email, age) VALUES ('c@example.com', NULL);
```
```text
CREATE TABLE
INSERT 0 2
ERROR:  duplicate key value violates unique constraint "users_email_key"
DETAIL:  Key (email)=(a@example.com) already exists.
ERROR:  null value in column "email" of relation "users" violates not-null constraint
DETAIL:  Failing row contains (4, null, null, null).
ERROR:  new row for relation "users" violates check constraint "users_age_check"
DETAIL:  Failing row contains (5, c@example.com, null, -1).
INSERT 0 1
```
마지막 줄이 함정이다. CHECK는 식이 거짓일 때만 거부하므로 결과가 NULL(모름)인 `NULL >= 0`은 통과한다. 값이 꼭 있어야 하면 NOT NULL을 함께 건다(실패한 INSERT도 identity 값을 소비해 id가 4, 5로 올랐다). PRIMARY KEY는 UNIQUE + NOT NULL이고 테이블에 하나뿐이며, 둘 다 인덱스를 만든다(`\d users`의 Indexes). 한편 `phone`에는 NULL이 이미 여럿이다. UNIQUE가 NULL끼리를 서로 다른 값으로 보기 때문이다. 미입력을 여럿 허용하는 이 동작이 보통 맞지만, NULL도 한 번만 허용하려면 PostgreSQL 15부터 `NULLS NOT DISTINCT`를 쓴다.
```sql
CREATE TABLE devices (
  user_id bigint, serial text,
  UNIQUE NULLS NOT DISTINCT (user_id, serial)
);
INSERT INTO devices VALUES (1, NULL);
INSERT INTO devices VALUES (1, NULL);
```
```text
CREATE TABLE
INSERT 0 1
ERROR:  duplicate key value violates unique constraint "devices_user_id_serial_key"
DETAIL:  Key (user_id, serial)=(1, null) already exists.
```

## 외래 키와 ON DELETE
외래 키(foreign key)는 "이 값은 저 테이블에 있어야 한다"는 규칙이고, 부모 행을 지울 때 할 일을 `ON DELETE`로 정한다.
```sql
CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE orders (id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers);
CREATE TABLE order_items (sku text,
  order_id int REFERENCES orders ON DELETE CASCADE);
CREATE TABLE coupons (code text,
  order_id int REFERENCES orders ON DELETE SET NULL);
INSERT INTO customers VALUES (1, '김하나');
INSERT INTO orders VALUES (10, 1), (11, 1);
INSERT INTO order_items VALUES ('pen', 10), ('ink', 10), ('cup', 11);
INSERT INTO coupons VALUES ('WELCOME', 10);
```
```sql
INSERT INTO orders VALUES (12, 99);
DELETE FROM customers WHERE id = 1;
DELETE FROM orders WHERE id = 10;
SELECT (SELECT count(*) FROM order_items) AS items_left,
       (SELECT order_id FROM coupons) AS coupon_order;
```
```text
ERROR:  insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"
DETAIL:  Key (customer_id)=(99) is not present in table "customers".
ERROR:  update or delete on table "customers" violates foreign key constraint "orders_customer_id_fkey" on table "orders"
DETAIL:  Key (id)=(1) is still referenced from table "orders".
DELETE 1
 items_left | coupon_order
------------+--------------
          1 |
(1 row)
```
없는 고객의 주문과 주문이 남은 고객의 삭제는 막혔고, 주문 10을 지우자 품목 두 개는 함께 지워지고(CASCADE) 쿠폰은 연결만 끊겼다(SET NULL). 기본값 `NO ACTION`은 `RESTRICT`처럼 막되 검사를 미룰 수 있다는 점만 다르다. CASCADE는 사슬처럼 이어져 생각보다 많이 지울 수 있다. 또 외래 키는 참조하는 쪽 열(`orders.customer_id`)에 인덱스를 만들지 않아 부모를 지울 때마다 자식 테이블을 훑으므로, 인덱스를 직접 만든다(6편).

## 지연 가능한 제약
기본 UNIQUE는 행 하나를 바꿀 때마다 즉시 검사해서, 자리 번호를 하나씩 미는 UPDATE가 중간 상태에서 실패한다. `DEFERRABLE`로 선언하면 SQL 표준대로 문장 끝에 검사하고, `SET CONSTRAINTS … DEFERRED`로 커밋까지 미룰 수도 있다.
```sql
CREATE TABLE seats (pos int UNIQUE);
CREATE TABLE seats_d (pos int UNIQUE DEFERRABLE);
INSERT INTO seats VALUES (1), (2), (3);
INSERT INTO seats_d VALUES (1), (2), (3);
UPDATE seats SET pos = pos + 1;
UPDATE seats_d SET pos = pos + 1;
BEGIN;
SET CONSTRAINTS seats_d_pos_key DEFERRED;
INSERT INTO seats_d VALUES (2);
COMMIT;
```
```text
CREATE TABLE
CREATE TABLE
INSERT 0 3
INSERT 0 3
ERROR:  duplicate key value violates unique constraint "seats_pos_key"
DETAIL:  Key (pos)=(2) already exists.
UPDATE 3
BEGIN
SET CONSTRAINTS
INSERT 0 1
ERROR:  duplicate key value violates unique constraint "seats_d_pos_key"
DETAIL:  Key (pos)=(2) already exists.
```
미룬 위반은 INSERT가 아니라 COMMIT에서 터지므로 커밋의 오류도 처리해야 한다. 서로 참조하는 두 행을 한 트랜잭션에서 넣을 때 외래 키를 이렇게 미룬다.

## 배제 제약: 겹치는 예약 막기
10:00~11:00과 10:30~11:30은 값이 달라도 겹치므로 회의실 예약은 UNIQUE로 못 막는다. **배제 제약**(exclusion constraint)은 UNIQUE를 일반화해 "지정한 연산자들로 비교해 모두 참인 두 행"을 막는다. 여기서는 같은 방(`=`)이면서 범위가 겹치는(`&&`) 행이다. 검사는 GiST 인덱스로 하고, 정수의 `=`를 GiST에서 쓰려고 기본 제공 확장 `btree_gist`를 켠다.
```sql
CREATE EXTENSION btree_gist;
CREATE TABLE booking (
  room int, during tstzrange,
  EXCLUDE USING gist (room WITH =, during WITH &&)
);
INSERT INTO booking VALUES (1, '[2026-03-02 10:00, 2026-03-02 11:00)');
INSERT INTO booking VALUES (1, '[2026-03-02 11:00, 2026-03-02 12:00)');
INSERT INTO booking VALUES (1, '[2026-03-02 10:30, 2026-03-02 11:30)');
```
```text
CREATE EXTENSION
CREATE TABLE
INSERT 0 1
INSERT 0 1
ERROR:  conflicting key value violates exclusion constraint "booking_room_during_excl"
DETAIL:  Key (room, during)=(1, ["2026-03-02 10:30:00+00","2026-03-02 11:30:00+00")) conflicts with existing key (room, during)=(1, ["2026-03-02 10:00:00+00","2026-03-02 11:00:00+00")).
```
`[)`는 끝을 빼는 반열린 구간이라 11:00에 끝나는 예약과 11:00에 시작하는 예약은 겹치지 않는다(방이 다르면 같은 시간도 된다). PostgreSQL 18부터는 이 규칙을 기본 키로 쓸 수 있다. `WITHOUT OVERLAPS`는 마지막 범위 열이 겹치지 않아야 한다는 시간 제약(temporal constraint)이고, 내부적으로 같은 GiST 배제 제약이 된다.
```sql
CREATE TABLE booking18 (
  room int, during tstzrange,
  PRIMARY KEY (room, during WITHOUT OVERLAPS)
);
INSERT INTO booking18 VALUES (1, '[2026-03-02 10:00, 2026-03-02 11:00)');
INSERT INTO booking18 VALUES (1, '[2026-03-02 10:30, 2026-03-02 11:30)');
```
```text
CREATE TABLE
INSERT 0 1
ERROR:  conflicting key value violates exclusion constraint "booking18_pkey"
DETAIL:  Key (room, during)=(1, …) conflicts with existing key …
```

## 제약 이름과 오류 처리
이름을 주지 않으면 `테이블_열_key`(UNIQUE), `_pkey`, `_check`, `_fkey`, `_excl`이 붙고, PostgreSQL 18부터는 NOT NULL도 `_not_null` 이름의 제약으로 카탈로그에 남는다. `CONSTRAINT price_nonnegative CHECK (price >= 0)`처럼 규칙이 드러나게 지으면 오류를 읽기 좋다. 애플리케이션은 오류 문장 대신 SQLSTATE와 진단 필드로 분기한다.
```python
import psycopg

bad = [
    "INSERT INTO users (email) VALUES ('a@example.com')",
    "INSERT INTO users (email) VALUES (NULL)",
    "INSERT INTO orders VALUES (13, 99)",
    "INSERT INTO booking VALUES (1, '[2026-03-02 10:30, 2026-03-02 11:00)')",
]
with psycopg.connect(autocommit=True) as conn:
    for sql in bad:
        try:
            conn.execute(sql)
        except psycopg.errors.IntegrityError as e:
            d = e.diag
            print(e.sqlstate, type(e).__name__, d.constraint_name or d.column_name)
```
```text
23505 UniqueViolation users_email_key
23502 NotNullViolation email
23503 ForeignKeyViolation orders_customer_id_fkey
23P01 ExclusionViolation booking_room_during_excl
```
psycopg는 SQLSTATE마다 예외 클래스를 둔다. NOT NULL 위반은 18에서도 제약 이름 대신 열 이름을 준다. 제약 이름을 사용자 메시지에 대응시키면 앞단 검사를 지나친 동시 요청도 같은 메시지로 처리된다.

## 권장 설정
- 운영 중인 큰 테이블에 제약을 추가하면 전체를 검사하는 동안 잠금이 걸린다(`NOT VALID` 후 `VALIDATE`는 13편).
- 체크리스트: 모든 테이블에 기본 키, 빠지면 안 되는 열에 NOT NULL, 업무 규칙은 이름 붙은 CHECK, 참조는 외래 키 + 참조 열 인덱스, 겹침 금지는 배제 제약.

## 어디에 쓰이나
- 추상 데이터 타입 심화 12편 「정보를 덧붙인 트리: 순위 통계 트리와 구간 트리」: 겹치는 예약을 로그 시간에 찾는 구간 트리의 가지치기를 배제 제약의 GiST 인덱스가 범위에 대해 한다.
- 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: UNIQUE와 기본 키는 유일 B-트리 인덱스라 삽입할 잎을 찾는 김에 중복을 확인한다.
- 9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」: "조회 후 삽입" 경쟁은 쓰기 왜곡과 같은 계열이고, 제약으로 못 막는 경우는 격리 수준과 행 잠금으로 막는다.

## 정리
- "조회 후 삽입"은 동시 요청에서 둘 다 통과하지만, UNIQUE는 인덱스 삽입 시점에 검사해 빈틈이 없다.
- CHECK는 NULL을 통과시키고, UNIQUE는 NULL끼리 다르다고 본다(`NULLS NOT DISTINCT`로 바꿀 수 있다).
- 외래 키는 ON DELETE로 부모 삭제를 막거나 전파하며, 참조 열 인덱스는 직접 만든다.
- 겹침 금지는 배제 제약(18에서는 `WITHOUT OVERLAPS` 기본 키)으로 걸고, 오류는 SQLSTATE와 제약 이름으로 처리한다.

## 더 알아보기
- 이전 글: 2편 「자료형 고르기: 숫자, 문자열, 시간, UUID, 배열」
- 다음 글: 4편 「조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기」
- PostgreSQL 문서 "Constraints": https://www.postgresql.org/docs/current/ddl-constraints.html
