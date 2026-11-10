# [PostgreSQL 실무 2/16] 자료형 고르기: 숫자, 문자열, 시간, UUID, 배열

> **한 줄 요약** — 자료형은 저장 형식이자 첫 번째 검증 규칙이라, 키는 bigint identity나 uuidv7, 돈은 numeric, 문자열은 text에 CHECK, 시각은 timestamptz로 시작하면 키 고갈·반올림 오차·시간대 사고의 대부분을 피한다.

## 이 글에서 다루는 것
- integer와 bigint, serial 대신 identity 열
- numeric 대 double precision, text 대 varchar(n)
- timestamptz 대 timestamp, date와 interval 계산
- uuid와 PostgreSQL 18의 `uuidv7()`
- 배열·boolean·enum과 기본값

## 자료형이 사고가 되는 순간
주문 테이블이 21억 번째 행에서 INSERT를 거부하고, 정산 합계가 몇 원 어긋나고, 서버를 해외 리전으로 옮겼더니 주문 시각이 9시간 밀린다. 셋 다 처음 고른 자료형에서 시작한 사고이고, 데이터가 쌓인 뒤 바꾸려면 테이블을 다시 써야 한다(13편).

## 정수와 identity 열
`integer`는 4바이트로 2³¹ − 1 = 2,147,483,647까지, `bigint`는 8바이트로 약 9.2 × 10¹⁸까지 담는다. 넘치면 조용히 돌지 않고 오류가 난다.
```sql
SELECT 2147483647::int + 1;
```
```text
ERROR:  integer out of range
```
행이 계속 쌓이는 테이블의 키는 처음부터 `bigint`로 한다. 키 생성은 예전에는 `serial`을 썼다. `serial`은 자료형이 아니라 "시퀀스를 만들고 기본값을 `nextval()`로 거는" 줄임말이라, 값을 직접 넣으면 시퀀스는 그 사실을 모른다.
```sql
CREATE TABLE legacy (id serial PRIMARY KEY, name text);
INSERT INTO legacy (id, name) VALUES (1, '옮겨 온 행');
INSERT INTO legacy (name) VALUES ('새 행');
```
```text
CREATE TABLE
INSERT 0 1
ERROR:  duplicate key value violates unique constraint "legacy_pkey"
DETAIL:  Key (id)=(1) already exists.
```
데이터를 옮긴 뒤 흔히 나는 사고다. 시퀀스를 `SELECT setval('legacy_id_seq', (SELECT max(id) FROM legacy));`로 맞추면 풀린다. SQL 표준 문법인 **identity 열**은 시퀀스를 열의 일부로 관리하고, `GENERATED ALWAYS`면 직접 넣는 것부터 막는다.
```sql
CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item text NOT NULL
);
INSERT INTO orders (id, item) VALUES (1, '볼펜');
```
```text
CREATE TABLE
ERROR:  cannot insert a non-DEFAULT value into column "id"
DETAIL:  Column "id" is an identity column defined as GENERATED ALWAYS.
HINT:  Use OVERRIDING SYSTEM VALUE to override.
```
시퀀스는 동시성을 위해 트랜잭션과 무관하게 값을 내준다. 롤백해도 값은 돌아오지 않으니 번호에 빈칸이 생기는 것이 정상이다.
```sql
INSERT INTO orders (item) VALUES ('볼펜');
BEGIN;
INSERT INTO orders (item) VALUES ('공책');
ROLLBACK;
INSERT INTO orders (item) VALUES ('지우개');
SELECT * FROM orders;
```
```text
INSERT 0 1
BEGIN
INSERT 0 1
ROLLBACK
INSERT 0 1
 id |  item
----+--------
  1 | 볼펜
  3 | 지우개
(2 rows)
```
그래서 id로 행 수를 세거나 "빈 번호 = 삭제된 주문"이라 해석하면 안 된다.

## 돈은 numeric
`double precision`은 IEEE 754 2진 부동소수점이라 0.1을 정확히 담지 못한다(양자화 2편). `numeric`은 10진수 자릿수를 그대로 저장해 느리지만 정확하다. 소수점 리터럴 `0.1`은 기본이 `numeric`이다.
```sql
SELECT 0.1::float8 + 0.2::float8 AS float_sum,
       0.1::float8 + 0.2::float8 = 0.3 AS float_eq,
       0.1 + 0.2 = 0.3 AS numeric_eq;
SELECT sum(0.1::float8) AS float_total, sum(0.1) AS numeric_total
FROM generate_series(1, 1000);
```
```text
      float_sum      | float_eq | numeric_eq
---------------------+----------+------------
 0.30000000000000004 | f        | t
(1 row)

   float_total    | numeric_total
------------------+---------------
 99.9999999999986 |         100.0
(1 row)
```
0.1을 천 번 더했는데 100이 아니다. 금액·수량·환율처럼 맞아떨어져야 하는 값은 `numeric(12,2)`처럼 정밀도와 소수 자릿수를 정하고(넘는 자리는 반올림된다), 측정값이나 통계처럼 근사가 허용되는 값만 `double precision`을 쓴다.

## 문자열은 text, 길이 규칙은 CHECK
PostgreSQL 문서는 `char(n)`, `varchar(n)`, `text` 사이에 성능 차이가 없다고 밝힌다(공백을 채우는 `char(n)`이 오히려 공간을 더 쓴다). `varchar(n)`의 n은 바이트가 아니라 글자 수라 한글 다섯 글자(15바이트)도 `varchar(5)`에 들어간다. 함정은 따로 있다.
```sql
CREATE TABLE members (nick varchar(5));
INSERT INTO members VALUES ('PostgreSQL');
SELECT 'PostgreSQL'::varchar(5) AS cast_result;
```
```text
CREATE TABLE
ERROR:  value too long for type character varying(5)
 cast_result
-------------
 Postg
(1 row)
```
INSERT는 막지만 명시적 형 변환은 오류 없이 잘라 낸다(SQL 표준 동작). 길이 제한은 업무 규칙이므로 `text`에 `CHECK (char_length(nick) <= 20)`처럼 이름 붙은 제약으로 두는 편이 의도가 잘 드러나고 고치기도 쉽다(3편).

## 시각은 timestamptz
`timestamptz`(timestamp with time zone)는 이름과 달리 시간대를 저장하지 않는다. 입력을 UTC 기준의 한 순간으로 바꿔 8바이트에 담고, 출력할 때 세션의 `TimeZone` 설정으로 바꿔 보여 준다. `timestamp`(without time zone)는 벽시계 숫자만 담고 입력의 오프셋을 버린다.
```sql
CREATE TABLE events (at_tz timestamptz, at_local timestamp);
INSERT INTO events VALUES ('2026-03-02 09:00+09', '2026-03-02 09:00+09');
SET TimeZone = 'UTC';
SELECT * FROM events;
SET TimeZone = 'Asia/Seoul';
SELECT * FROM events;
```
```text
CREATE TABLE
INSERT 0 1
SET
         at_tz          |      at_local
------------------------+---------------------
 2026-03-02 00:00:00+00 | 2026-03-02 09:00:00
(1 row)

SET
         at_tz          |      at_local
------------------------+---------------------
 2026-03-02 09:00:00+09 | 2026-03-02 09:00:00
(1 row)
```
`at_tz`는 같은 순간을 보는 곳에 맞춰 보여 주고, `at_local`은 어디서 보든 "9시"라서 그것이 서울의 9시인지 UTC의 9시인지 아무도 모른다. 서버를 옮겨 시각이 밀리는 사고는 대개 `timestamp` 열에 애플리케이션이 현지 시각을 넣은 경우다. 날짜 계산도 시간대를 따른다.
```sql
SET TimeZone = 'America/New_York';
SELECT '2026-03-07 12:00'::timestamptz + interval '1 day' AS one_day,
       '2026-03-07 12:00'::timestamptz + interval '24 hours' AS hours_24;
SELECT date '2026-01-31' + interval '1 month' AS next_month,
       date '2026-03-31' - date '2026-03-02' AS days;
RESET TimeZone;
```
```text
SET
        one_day         |        hours_24
------------------------+------------------------
 2026-03-08 12:00:00-04 | 2026-03-08 13:00:00-04
(1 row)

     next_month      | days
---------------------+------
 2026-02-28 00:00:00 |   29
(1 row)

RESET
```
2026년 3월 8일 미국은 서머타임에 들어가 하루가 23시간이다. `1 day`는 벽시계로 하루, `24 hours`는 정확히 24시간이라 결과가 한 시간 다르다. 1월 31일에 한 달을 더하면 2월 말일로 맞춰지고, 날짜끼리 빼면 일수(정수)가 나온다.

## UUID와 uuidv7
`uuid`는 16바이트 값이다. 같은 값을 `text`로 두면 37바이트가 되고 비교도 느리다. `gen_random_uuid()`(PostgreSQL 13부터 내장)가 만드는 버전 4는 122비트가 무작위라 B-트리 인덱스의 아무 곳에나 끼어든다. PostgreSQL 18에 들어온 `uuidv7()`은 앞 48비트에 밀리초 단위 유닉스 시각을 넣고, 같은 세션 안에서는 값이 단조 증가하도록 만든다. 버전 4를 명시적으로 만드는 별칭 `uuidv4()`도 함께 들어왔다.
```sql
WITH g AS (
  SELECT n, uuidv7() AS v7, gen_random_uuid() AS v4
  FROM generate_series(1, 1000) n
)
SELECT array_agg(n ORDER BY v7) = array_agg(n ORDER BY n) AS v7_sorted,
       array_agg(n ORDER BY v4) = array_agg(n ORDER BY n) AS v4_sorted,
       bool_and(uuid_extract_version(v7) = 7) AS all_v7,
       bool_and(uuid_extract_timestamp(v7) > now() - interval '1 second') AS ts_ok
FROM g;
```
```text
 v7_sorted | v4_sorted | all_v7 | ts_ok
-----------+-----------+--------+-------
 t         | f         | t      | t
(1 row)
```
uuidv7은 만든 순서대로 정렬되고, 값에서 만든 시각을 꺼낼 수 있다. 이 차이가 인덱스 크기로 이어진다. 무작위 순서는 실행할 때마다 크기가 달라지므로, 여기서는 `md5()`로 결정적인 무작위 값을 만들어 버전 4를 흉내 낸다.
```sql
CREATE TABLE k_random (id uuid PRIMARY KEY);
CREATE TABLE k_time (id uuid PRIMARY KEY);
INSERT INTO k_random SELECT md5(g::text)::uuid FROM generate_series(1, 100000) g;
INSERT INTO k_time SELECT uuidv7() FROM generate_series(1, 100000);
SELECT pg_size_pretty(pg_relation_size('k_random_pkey')) AS random_order,
       pg_size_pretty(pg_relation_size('k_time_pkey')) AS time_order;
```
```text
CREATE TABLE
CREATE TABLE
INSERT 0 100000
INSERT 0 100000
 random_order | time_order
--------------+------------
 4320 kB      | 3104 kB
(1 row)
```
무작위 삽입은 가득 찬 페이지를 가운데서 쪼개 반쯤 빈 페이지를 남기고, 시간 순 삽입은 오른쪽 끝 페이지만 채워 나가 같은 키 10만 개의 인덱스가 약 28% 작다. 작은 인덱스는 메모리에 더 많이 올라간다. 대신 uuidv7은 생성 시각이 드러나므로 그 자체가 민감한 정보면 버전 4를 쓴다.

## 배열, boolean, enum
배열은 첨자가 1부터이고, 범위를 벗어나면 오류가 아니라 NULL이다.
```sql
CREATE TABLE posts (id int, tags text[]);
INSERT INTO posts VALUES (1, '{postgres,sql}'), (2, ARRAY['docker']);
SELECT id, tags[1] AS first_tag, tags[0] AS zero
FROM posts WHERE 'sql' = ANY (tags);
```
```text
CREATE TABLE
INSERT 0 2
 id | first_tag | zero
----+-----------+------
  1 | postgres  |
(1 row)
```
태그 몇 개처럼 늘 통째로 읽고 쓰는 값에는 편하지만, 원소마다 외래 키나 UNIQUE를 걸 수 없고 원소 하나를 바꿔도 배열 전체를 다시 쓴다. 다른 테이블의 행을 가리키는 목록이면 연결 테이블을 두고 조인한다(4편). 배열 검색용 GIN 인덱스는 7편에서 다룬다. `boolean`은 `'yes'`, `'on'`, `'1'`도 참으로 받고, NULL이 세 번째 상태가 되지 않게 `NOT NULL DEFAULT false`로 둔다(NULL의 논리는 4편). `DEFAULT now()`, `DEFAULT uuidv7()`처럼 기본값에 식을 쓰면 행마다 평가된다.

enum은 값 목록을 자료형으로 만든다. 선언 순서로 정렬되고 목록에 없는 값은 거부된다.
```sql
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped');
SELECT 'done'::order_status;
```
```text
CREATE TYPE
ERROR:  invalid input value for enum order_status: "done"
LINE 1: SELECT 'done'::order_status;
               ^
```
`ALTER TYPE … ADD VALUE`로 값을 더할 수는 있지만 지우거나 순서를 바꾸려면 타입을 새로 만들어야 한다. 값이 자주 바뀌거나 표시 이름 같은 속성이 붙으면 참조 테이블과 외래 키(3편)가 낫다.

## 고르는 기준
| 용도 | 권장 | 피할 것 |
|---|---|---|
| 대리 키 | bigint identity, uuidv7 | int serial |
| 금액 | numeric(p, s) | float8 |
| 문자열 | text + CHECK | char(n) |
| 시각 | timestamptz | timestamp |
| 상태값 | enum, 참조 테이블 | 자유 text |

## 숫자로 보기
`pg_column_size()`로 테이블에 저장된 값의 크기를 잰 결과다.

| 자료형 | 바이트 |
|---|---|
| smallint / integer / bigint | 2 / 4 / 8 |
| double precision | 8 |
| numeric 123456.78 | 9 |
| timestamptz / date | 8 / 4 |
| uuid / 같은 값의 text | 16 / 37 |
| boolean | 1 |

## 어디에 쓰이나
- 양자화 2편 「수 형식의 지도: FP32에서 FP4까지」: double precision은 가수 52비트의 2진 격자라 0.1 같은 10진 소수가 가장 가까운 격자점으로 반올림되어 저장되고, 그 오차가 합계에 쌓인다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: integer의 범위 −2³¹~2³¹ − 1은 32비트 2의 보수에서 나온다.
- 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: uuidv7 인덱스가 작은 이유는 삽입이 오른쪽 끝 잎에서만 일어나 분할이 한쪽으로만 생기기 때문이다.
- 3편 「제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약」: 자료형이 거르지 못하는 규칙(길이, 범위, 참조)을 CHECK와 외래 키로 이어서 건다.

## 정리
- 키는 처음부터 bigint, 생성은 serial 대신 identity 열이나 uuidv7으로 한다. 시퀀스 번호의 빈칸은 정상이다.
- 돈은 numeric이다. float8로 0.1을 천 번 더하면 99.9999999999986이 된다.
- text와 varchar(n)는 성능이 같고, 길이 규칙은 CHECK로 둔다.
- timestamptz는 한 순간을 저장하고 세션 시간대로 보여 준다. 시간대 없는 timestamp가 시각 사고의 출발점이다.

## 더 알아보기
- 이전 글: 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」
- 다음 글: 3편 「제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약」
- PostgreSQL 문서 "UUID Functions": https://www.postgresql.org/docs/current/functions-uuid.html
