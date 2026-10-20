# [PostgreSQL 실무 12/16] JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기

> **한 줄 요약** — jsonb의 `@>`·`?`와 전문 검색의 `tsvector`는 GIN 역색인으로 빨라지지만 쿼리 식이 인덱스와 맞아야 타고, 기본 설정에는 한국어 형태소 분석이 없어 한국어 부분 일치는 `pg_trgm` 삼중자 검색으로 보완한다.

## 이 글에서 다루는 것
- json 대 jsonb, 연산자 `->`·`->>`·`@>`·`?`와 SQL/JSON 경로
- GIN 인덱스(`jsonb_ops` 대 `jsonb_path_ops`)와 인덱스를 못 타는 식
- 언제 JSON 안의 값을 열로 빼야 하나
- 전문 검색(`tsvector`, `ts_rank`, 저장 생성 열 + GIN)과 한국어의 한계, `pg_trgm`

## 문제: 모양이 제각각인 데이터와 LIKE 검색
상품은 종류마다 속성이 다르다(옷은 색과 사이즈, 노트북은 CPU). 속성마다 열을 만들면 NULL투성이가 되고, (상품, 속성, 값) 행으로 쪼개는 EAV 설계는 조인이 늘어난다. 게시판 검색은 `body LIKE '%인덱스%'`로 시작했다가 데이터가 늘면 매번 전체를 훑고 관련도 순서도 없다. PostgreSQL은 둘을 jsonb와 전문 검색으로 푼다.

## json과 jsonb
`json`은 입력 텍스트를 그대로 저장하고 쓸 때마다 파싱한다. `jsonb`는 파싱한 이진 형식으로 저장해 공백을 버리고 키를 정렬하며 중복 키는 마지막 값만 남긴다. 인덱스와 대부분의 연산자는 jsonb에만 있다. 결과는 PostgreSQL 18.6 기준이다.
```sql
SELECT '{"b": 1, "a": 2, "a": 3}'::json AS json,
       '{"b": 1, "a": 2, "a": 3}'::jsonb AS jsonb;
```
```text
           json           |      jsonb
--------------------------+------------------
 {"b": 1, "a": 2, "a": 3} | {"a": 3, "b": 1}
(1 row)
```
상품 2만 개를 만든다. 100개 중 1개만 gold, 200개 중 1개에만 `discount` 키가 있다.
```sql
CREATE TABLE products (id int PRIMARY KEY, attrs jsonb NOT NULL);
INSERT INTO products SELECT g, jsonb_build_object(
  'color', CASE WHEN g % 100 = 0 THEN 'gold'
                ELSE (ARRAY['red', 'blue', 'green'])[g % 3 + 1] END,
  'tags', CASE WHEN g % 50 = 0 THEN '["sale", "new"]'::jsonb
               ELSE '["new"]'::jsonb END,
  'variants', jsonb_build_array(
     jsonb_build_object('sku', g || '-S', 'stock', g % 5),
     jsonb_build_object('sku', g || '-L', 'stock', g % 7)))
  || CASE WHEN g % 200 = 0 THEN '{"discount": 10}'::jsonb ELSE '{}' END
FROM generate_series(1, 20000) g;
ANALYZE products;
```
`->`는 jsonb를, `->>`는 text를 돌려주고 `#>>`는 경로로 내려간다. `@>`는 "이 문서를 포함하는가", `?`는 "이 키가 있는가"다. SQL/JSON 경로 함수 `jsonb_path_query`는 배열 안을 조건으로 거른다.
```sql
SELECT attrs->>'color' AS color, attrs->'tags' AS tags,
       attrs #>> '{variants,1,sku}' AS sku, attrs ? 'discount' AS discount
FROM products WHERE id = 200;
SELECT jsonb_path_query(attrs, '$.variants[*] ? (@.stock > 3).sku')
FROM products WHERE id = 104;
```
```text
 color |      tags       |  sku  | discount
-------+-----------------+-------+----------
 gold  | ["sale", "new"] | 200-L | t
(1 row)

 jsonb_path_query
------------------
 "104-S"
 "104-L"
(2 rows)
```

## GIN 인덱스: jsonb_ops와 jsonb_path_ops
**GIN**(generalized inverted index)은 값에 든 원소(키, 값, 낱말)마다 "그 원소를 가진 행 목록"을 두는 역색인이다. 기본 `jsonb_ops`는 키와 값을 따로 색인해 `?`·`?|`·`?&`·`@>`·`@?`·`@@`를 지원하고, `jsonb_path_ops`는 "경로 + 값"의 해시만 색인해 더 작은 대신 키 존재 연산자(`?` 등)를 못 쓴다(공식 문서). 둘을 다 만들어 본다.
```sql
CREATE INDEX products_attrs_ops ON products USING gin (attrs);
CREATE INDEX products_attrs_path ON products USING gin (attrs jsonb_path_ops);
SELECT relname, pg_size_pretty(pg_relation_size(oid)) AS size
FROM pg_class WHERE relname LIKE 'products_attrs%' ORDER BY 1;
EXPLAIN (COSTS OFF) SELECT * FROM products WHERE attrs @> '{"color": "gold"}';
EXPLAIN (COSTS OFF) SELECT * FROM products WHERE attrs ? 'discount';
EXPLAIN (COSTS OFF) SELECT * FROM products WHERE attrs->>'color' = 'gold';
```
```text
CREATE INDEX
CREATE INDEX
       relname       |  size
---------------------+---------
 products_attrs_ops  | 2784 kB
 products_attrs_path | 2304 kB
(2 rows)

                        QUERY PLAN
-----------------------------------------------------------
 Bitmap Heap Scan on products
   Recheck Cond: (attrs @> '{"color": "gold"}'::jsonb)
   ->  Bitmap Index Scan on products_attrs_path
         Index Cond: (attrs @> '{"color": "gold"}'::jsonb)
(4 rows)

                   QUERY PLAN
------------------------------------------------
 Bitmap Heap Scan on products
   Recheck Cond: (attrs ? 'discount'::text)
   ->  Bitmap Index Scan on products_attrs_ops
         Index Cond: (attrs ? 'discount'::text)
(4 rows)

                      QUERY PLAN
------------------------------------------------------
 Seq Scan on products
   Filter: ((attrs ->> 'color'::text) = 'gold'::text)
(2 rows)
```
`@>`에는 플래너가 작은 `jsonb_path_ops`를, `?`에는 `jsonb_ops`를 골랐다. 셋째는 뜻이 첫째와 같아도 순차 스캔이다. GIN은 `attrs`에 대한 연산자를 색인할 뿐 `attrs->>'color'`라는 식의 값을 색인하지 않는다. 이렇게 자주 찾는다면 `@>`로 바꿔 쓰거나 표현식 인덱스 `((attrs->>'color'))`를 만든다(7편). `@?` 경로 식도 공식 문서상 `==` 비교 같은 일부 형태만 인덱스를 쓰며, `@.stock > 3` 같은 범위 비교는 이 서버에서도 순차 스캔이었다.

## 언제 열로 빼야 하나
jsonb는 "모양이 제각각이고 통째로 읽고 쓰는" 값에 맞는다. 다음에 해당하는 값은 일반 열로 뺀다.
- 자주 거르거나 조인·정렬하는 값: B-트리가 바로 쓰이고, 열 통계로 행 수 추정이 정확해진다(8편).
- 타입·제약이 필요한 값: `NOT NULL`, `CHECK`, 외래 키(3편)는 열에만 걸 수 있다.
- 자주 바뀌는 값: jsonb의 키 하나를 고쳐도 행 전체가 새 버전이 된다(10편).

## 전문 검색: tsvector와 tsquery
**전문 검색**(full text search)은 문서를 `tsvector`(정규화한 낱말과 위치), 검색어를 `tsquery`로 바꿔 `@@`로 맞춘다. `english` 설정은 불용어(the, with)를 버리고 어간을 뽑아 Indexing·indexes를 index로 만들며, `ts_rank`는 낱말 빈도로 관련도를 매긴다.
```sql
SELECT id, to_tsvector('english', body) AS tsv,
       round(ts_rank(to_tsvector('english', body),
                     to_tsquery('english', 'json & index'))::numeric, 3) AS rank
FROM (VALUES (1, 'Indexing JSON documents with GIN indexes'),
             (2, 'A JSON index'), (3, 'The quick brown foxes jumped')) d(id, body)
ORDER BY rank DESC, id;
```
```text
 id |                    tsv                    | rank
----+-------------------------------------------+-------
  1 | 'document':3 'gin':5 'index':1,6 'json':2 | 0.185
  2 | 'index':3 'json':2                        | 0.099
  3 | 'brown':3 'fox':4 'jump':5 'quick':2      | 0.000
(3 rows)
```
테이블에서는 `tsvector`를 생성 열로 두고 GIN을 건다. 함정은 18부터 생성 열의 기본값이 읽을 때 계산하는 VIRTUAL이 되었고(공식 문서), 가상 생성 열에는 인덱스를 만들 수 없다.
```sql
CREATE TABLE posts (id int PRIMARY KEY, body text);
INSERT INTO posts SELECT g, (ARRAY['인덱스를 설계했다 Indexing JSON',
  '백업과 복구 Backups and replication'])[g % 2 + 1]
  || CASE WHEN g % 500 = 0 THEN ' 트랜잭션 격리' ELSE '' END
FROM generate_series(1, 20000) g;
ALTER TABLE posts ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', body));
CREATE INDEX posts_tsv ON posts USING gin (tsv);
ALTER TABLE posts DROP COLUMN tsv;
ALTER TABLE posts ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
CREATE INDEX posts_tsv ON posts USING gin (tsv);
EXPLAIN (COSTS OFF) SELECT id FROM posts WHERE tsv @@ to_tsquery('english', 'replication');
```
```text
CREATE TABLE
INSERT 0 20000
ALTER TABLE
ERROR:  indexes on virtual generated columns are not supported
ALTER TABLE
ALTER TABLE
CREATE INDEX
                     QUERY PLAN
----------------------------------------------------
 Bitmap Heap Scan on posts
   Recheck Cond: (tsv @@ '''replic'''::tsquery)
   ->  Bitmap Index Scan on posts_tsv
         Index Cond: (tsv @@ '''replic'''::tsquery)
(4 rows)
```
`STORED`로 저장하자 인덱스가 만들어졌고, 검색어 replication도 어간 `replic`이 되어 인덱스를 탔다. 사용자 입력은 `websearch_to_tsquery`로 받으면 따옴표·`-`·`or` 같은 검색창 문법이 오류 없이 통한다.

## 한국어의 한계와 pg_trgm
18.6의 텍스트 검색 설정 30개(`\dF`)에 한국어는 없어, 한국어는 띄어쓰기 단위(어절)가 조사까지 붙은 채 낱말이 된다.
```sql
WITH d AS (SELECT to_tsvector('simple', '데이터베이스 인덱스를 설계했다') AS v)
SELECT v, v @@ to_tsquery('simple', '인덱스') AS exact,
       v @@ to_tsquery('simple', '인덱스:*') AS prefix,
       v @@ to_tsquery('simple', '베이스:*') AS middle
FROM d;
```
```text
                     v                      | exact | prefix | middle
--------------------------------------------+-------+--------+--------
 '데이터베이스':1 '설계했다':3 '인덱스를':2 | f     | t      | f
(1 row)
```
"인덱스"로는 "인덱스를"을 못 찾고, 접두사 검색 `:*`로 조사는 넘기지만 낱말 가운데("베이스")는 못 찾는다. 부분 일치는 contrib 확장 **pg_trgm**이 돕는다. 문자열을 연속한 세 글자(삼중자, trigram)로 쪼개 GIN에 넣고 `LIKE '%…%'`를 인덱스로 처리한다.
```sql
CREATE EXTENSION pg_trgm;
CREATE INDEX posts_trgm ON posts USING gin (body gin_trgm_ops);
EXPLAIN (COSTS OFF) SELECT id FROM posts WHERE body LIKE '%트랜잭션%';
EXPLAIN (COSTS OFF) SELECT id FROM posts WHERE body LIKE '%격리%';
```
```text
CREATE EXTENSION
CREATE INDEX
                    QUERY PLAN
--------------------------------------------------
 Bitmap Heap Scan on posts
   Recheck Cond: (body ~~ '%트랜잭션%'::text)
   ->  Bitmap Index Scan on posts_trgm
         Index Cond: (body ~~ '%트랜잭션%'::text)
(4 rows)

             QUERY PLAN
------------------------------------
 Seq Scan on posts
   Filter: (body ~~ '%격리%'::text)
(2 rows)
```
네 글자 "트랜잭션"은 인덱스를 탔지만 두 글자 "격리"는 삼중자가 없어 순차 스캔이다. 한국어는 두 글자 낱말이 흔해 이 한계가 자주 드러난다. 형태소 분석과 관련도 순위가 중요하면 별도 확장이나 한국어 분석기를 갖춘 외부 검색 엔진을 검토한다.

## 흔한 실수와 권장 설정
- **인덱스를 만들고 확인하지 않기**: 식이 맞지 않으면 타지 않으니 늘 `EXPLAIN`으로 본다.
- **생성 열에 `STORED` 빠뜨리기(18 이상)**: 인덱스를 걸 열이면 `STORED`를 명시한다.
- **설정 이름 생략**: `to_tsvector(body)`는 `default_text_search_config`(이 서버는 `pg_catalog.english`)를 따라 환경마다 달라진다. 설정 이름을 적는다.
- GIN은 쓰기 비용이 커서, 대량 적재는 인덱스 없이 넣고 나중에 만든다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: GIN의 빠른 갱신(fastupdate)은 새 항목을 대기 목록에 모았다가 한꺼번에 본 인덱스에 합치는, LSM과 같은 발상으로 쓰기 비용을 줄인다.
- 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: GIN은 키(낱말·삼중자·jsonb 원소)를 B-트리로 찾고 키마다 행 목록을 붙인다.
- 7편 「인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN」: GIN의 기본 개념과 표현식 인덱스를 jsonb·전문 검색 연산자 클래스로 넓혔다.

## 정리
- jsonb는 파싱해 저장하며 `@>`·`?`를 GIN으로 찾는다. `jsonb_path_ops`는 작지만 `?`를 못 쓴다.
- 인덱스는 연산자와 식이 맞아야 탄다. 같은 뜻의 `attrs->>'color' = 'gold'`는 순차 스캔이었다.
- 전문 검색은 정규화한 낱말의 역색인이고, 18부터는 생성 열에 `STORED`를 붙여야 GIN을 걸 수 있다.
- 한국어는 조사가 붙은 어절이 낱말이 되고, `pg_trgm`은 세 글자 이상 부분 일치만 인덱스로 돕는다.

## 더 알아보기
- 이전 글: 11편 「락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태」
- 다음 글: 13편 「스키마 마이그레이션: 운영 중인 테이블을 안전하게 바꾸기」
- PostgreSQL 공식 문서 "JSON Types": https://www.postgresql.org/docs/current/datatype-json.html
