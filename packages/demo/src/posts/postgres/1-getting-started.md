# [PostgreSQL 실무 1/16] PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마

> **한 줄 요약** — PostgreSQL은 연결마다 서버 프로세스를 하나씩 붙여 주는 클라이언트-서버 DBMS이고, 그 안의 객체는 클러스터 → 데이터베이스 → 스키마 → 테이블로 쌓이며, 스키마를 적지 않은 이름은 `search_path`가 어디서 찾을지 정한다.

## 이 글에서 다루는 것
- PostgreSQL의 연혁과 버전·지원 정책
- 도커로 서버 띄우기, 연결 하나에 프로세스 하나라는 구조
- 클러스터·데이터베이스·스키마·테이블의 계층과 `search_path`
- psql 메타 명령, 롤과 접속 문자열

## 처음 합류한 날 막히는 곳
README대로 PostgreSQL을 띄우고 접속했는데 테이블이 안 보이거나(다른 데이터베이스나 스키마), 같은 이름의 테이블이 둘이거나(`search_path`), 연결을 수백 개 열었더니 메모리가 바닥난다(연결마다 프로세스). 셋 다 서버 구조를 알면 바로 진단된다.

## PostgreSQL은 어디서 왔나
**PostgreSQL**은 오픈 소스 객체 관계형 데이터베이스 관리 시스템(object-relational DBMS)이다. 1986년 UC 버클리의 마이클 스톤브레이커(Michael Stonebraker) 교수가 이끈 POSTGRES 프로젝트에서 구현이 시작됐고, 질의 언어는 SQL이 아닌 PostQUEL이었다. 1994년 앤드루 유와 졸리 첸이 SQL 해석기를 붙여 Postgres95로 공개했고, 1996년 이름을 PostgreSQL로 바꿨다(줄여서 Postgres). 자료형·함수·인덱스 방식을 확장(extension)으로 끼워 넣는 구조가 그때부터의 특징이다.

주 버전(major)은 대략 해마다 9월 무렵 나오고, 첫 출시 후 5년 동안 수정판을 받는다(18은 2025년 9월 출시, 2030년 11월 지원 종료). 부 버전(minor)은 보통 분기마다(2·5·8·11월) 나오며 저장 형식을 바꾸지 않으므로 바이너리만 교체하면 된다. PostgreSQL 10부터는 첫 숫자가 주 버전이라 `18.6`은 18의 여섯 번째 수정판이다(9.6까지는 `9.6` 전체가 주 버전). 주 버전 업그레이드는 16편에서 다룬다. 이 시리즈의 실행 결과는 PostgreSQL 18.6 기준이다.

## 도커로 서버 띄우기
```bash
docker run -d --name mypg \
  -e POSTGRES_PASSWORD=example-password \
  -p 127.0.0.1:15432:5432 \
  -v mypg-data:/var/lib/postgresql \
  postgres:18-alpine > /dev/null
until docker exec mypg pg_isready -h 127.0.0.1 -q; do sleep 0.5; done
docker logs mypg 2>&1 | grep 'ready to accept'
docker exec mypg printenv PGDATA
```
```text
… LOG:  database system is ready to accept connections
… [1] LOG:  database system is ready to accept connections
/var/lib/postgresql/18/docker
```
첫 실행에서 시작 스크립트는 `initdb`로 데이터 디렉터리를 만들고, 유닉스 소켓만 여는 임시 서버로 초기화한 뒤(첫 줄) 진짜 서버를 PID 1로 다시 띄운다(둘째 줄). 그래서 `pg_isready -h 127.0.0.1`로 TCP를 물어야 진짜 서버를 기다린다. 호스트 포트 15432는 로컬 PostgreSQL이 이미 5432를 쓰는 경우를 피한 것이고, `127.0.0.1:`로 묶어 외부에 노출하지 않는다(도커와 컨테이너 8편). 18 이미지부터 데이터 디렉터리가 `/var/lib/postgresql/18/docker`로 바뀌어 볼륨은 그 위인 `/var/lib/postgresql`에 붙인다. 17까지의 습관대로 `/var/lib/postgresql/data`에 붙이면 `Error: in 18+, these Docker images are configured to store database data in a format …`을 내고 멈춘다.

## 연결 하나에 프로세스 하나
PostgreSQL 서버는 프로세스 여럿의 묶음이다(프로세스는 트랜지스터에서 자연어까지 10편).
```bash
docker exec mypg ps -o args | grep '^postgres' | sort
```
```text
postgres
postgres: autovacuum launcher
postgres: background writer
postgres: checkpointer
postgres: io worker 0
postgres: io worker 1
postgres: io worker 2
postgres: logical replication launcher
postgres: walwriter
```
맨 위가 연결을 받는 주 프로세스(postmaster)이고, 나머지는 더러워진 페이지를 쓰고(checkpointer, background writer), WAL을 내려보내고(walwriter, 14편), 죽은 행을 치우는(autovacuum, 10편) 일꾼이다. io worker는 PostgreSQL 18에 들어온 비동기 I/O 담당이다. 클라이언트가 접속하면 주 프로세스가 그 연결 전용 **백엔드 프로세스**(backend)를 fork한다. 3초 자는 쿼리로 연결을 붙잡아 두고 다시 보자.
```bash
docker exec -d mypg psql -U postgres -c "SELECT pg_sleep(3)"
until docker exec mypg ps -o args | grep '^postgres: .*SELECT$'; do
  sleep 0.2
done
```
```text
postgres: postgres postgres [local] SELECT
```
이름에 사용자, 데이터베이스, 접속 경로, 하는 일이 보인다. 연결마다 프로세스와 메모리가 드니 연결 수에 상한(`max_connections`, 기본 100)이 있고, 웹 서버 수십 대가 각자 연결을 열면 금방 찬다. 해법인 커넥션 풀링은 16편에서 다룬다.

## 클러스터 → 데이터베이스 → 스키마 → 테이블
```text
클러스터 = 서버 1개 + PGDATA 1개
├─ 롤 (클러스터 전체 공유)
├─ DB postgres, template0, template1
└─ DB shop
   ├─ 스키마 public ─ 테이블 items
   └─ 스키마 sales  ─ 테이블 items
```
**클러스터**(cluster)는 서버 여러 대가 아니라 서버 하나가 관리하는 데이터 디렉터리 전체다. `initdb`가 데이터베이스 셋을 만들어 두고, `CREATE DATABASE`는 `template1`을 복사한다. 이제부터 SQL은 `docker exec -it mypg psql -U postgres`로 연 psql에 입력한다.
```sql
CREATE DATABASE shop;
\c shop
CREATE SCHEMA sales;
CREATE TABLE items (id int, name text);
CREATE TABLE sales.items (id int, name text, price numeric);
```
```text
CREATE DATABASE
You are now connected to database "shop" as user "postgres".
CREATE SCHEMA
CREATE TABLE
CREATE TABLE
```
연결은 데이터베이스 하나에 붙는다. **스키마**(schema)는 데이터베이스 안의 이름 공간이라 한 쿼리에서 여러 스키마를 섞을 수 있지만, 다른 데이터베이스의 테이블은 볼 수 없다.
```sql
SELECT count(*) FROM postgres.public.items;
```
```text
ERROR:  cross-database references are not implemented: "postgres.public.items"
LINE 1: SELECT count(*) FROM postgres.public.items;
                             ^
```
그래서 실무에서는 서비스 하나에 데이터베이스 하나를 두고, 그 안의 영역을 스키마로 나눈다. 스키마를 적지 않은 `items`는 `search_path`의 스키마를 앞에서부터 찾는다.
```sql
SHOW search_path;
SET search_path TO sales, public;
\d items
```
```text
   search_path
-----------------
 "$user", public
(1 row)

SET
                Table "sales.items"
 Column |  Type   | Collation | Nullable | Default
--------+---------+-----------+----------+---------
 id     | integer |           |          |
 name   | text    |           |          |
 price  | numeric |           |          |
```
기본값 `"$user", public`은 "롤과 같은 이름의 스키마, 없으면 public"이다. 순서를 바꾸자 같은 `items`가 `sales.items`를 가리켰다. 스키마 없이 만든 테이블도 경로의 첫 번째 (존재하는) 스키마에 생긴다. 테이블이 "사라졌다"면 `SHOW search_path`와 `\dt *.이름`부터 본다.

## psql 기본기
| 명령 | 하는 일 |
|---|---|
| `\l` / `\c db [롤]` | DB 목록 / 다른 DB로 접속 |
| `\dn` / `\dt` / `\du` | 스키마 / 테이블 / 롤 목록 |
| `\d 이름` | 열, 인덱스, 제약 조건 |
| `\x` / `\timing` | 세로 출력 / 실행 시간 |
| `\i 파일` / `\q` | SQL 파일 실행 / 종료 |

백슬래시로 시작하는 메타 명령은 서버가 아니라 psql이 처리한다. `+`를 붙이면(`\dt+`) 크기 등이 더 나오고, 열이 많은 결과는 `\x`로 세로로 본다.
```sql
\x
SELECT current_database(), current_user, current_schemas(false);
\x
```
```text
Expanded display is on.
-[ RECORD 1 ]----+---------------
current_database | shop
current_user     | postgres
current_schemas  | {sales,public}

Expanded display is off.
```

## 롤과 접속 문자열
**롤**(role)은 사용자와 그룹을 합친 개념이고, `LOGIN` 속성이 있으면 접속할 수 있다. 슈퍼유저 `postgres`로 앱을 돌리지 말고 전용 롤을 만든다.
```sql
CREATE ROLE app LOGIN PASSWORD 'example-password';
ALTER DATABASE shop OWNER TO app;
\c shop app
CREATE TABLE sales.orders (id int);
```
```text
CREATE ROLE
ALTER DATABASE
You are now connected to database "shop" as user "app".
ERROR:  permission denied for schema sales
LINE 1: CREATE TABLE sales.orders (id int);
                     ^
```
`sales`는 `postgres`가 만든 스키마라 `app`에게 권한이 없다. 반면 `public` 스키마는 PostgreSQL 15부터 데이터베이스 소유자(와 슈퍼유저)만 객체를 만들 수 있으므로 소유자가 된 `app`은 쓸 수 있다(권한 설계는 16편).

애플리케이션은 접속 정보를 URI(`postgresql://롤:비밀번호@호스트:포트/DB`)나 키워드 형식(`host=… port=… dbname=… user=…`)으로 드라이버에 넘긴다. 둘 다 클라이언트 라이브러리 libpq의 형식이라 psql, psycopg 등이 같이 쓴다. 호스트의 파이썬에서 접속해 보자.
```python
import psycopg

url = "postgresql://postgres:example-password@localhost:15432/postgres"
with psycopg.connect(url) as conn:
    row = conn.execute("SELECT current_user, current_setting('server_version')").fetchone()
    print(row)
try:
    psycopg.connect(url.replace("example-password", "wrong"))
except psycopg.OperationalError as e:
    print(e)
```
```text
('postgres', '18.6')
connection failed: connection to server at "127.0.0.1", port 15432 failed: FATAL:  password authentication failed for user "postgres"
```
컨테이너 밖에서 온 연결은 비밀번호(`scram-sha-256`)를 요구하고 컨테이너 안의 소켓 접속은 묻지 않는다. 이 규칙이 `pg_hba.conf`다(16편). 호스트에 psql을 설치했다면 옵션 대신 libpq 환경 변수를 두고(비밀번호는 실무에서 `~/.pgpass` 파일에), `\i`로 SQL 파일을 실행해 보자.
```sql
-- 파일: notes.sql
CREATE TABLE notes (id int, body text);
```
```bash
export PGHOST=localhost PGPORT=15432 PGUSER=app
export PGPASSWORD=example-password PGDATABASE=shop
psql <<'EOF'
\i notes.sql
\dt
EOF
```
```text
CREATE TABLE
          List of tables
 Schema | Name  | Type  |  Owner
--------+-------+-------+----------
 public | items | table | postgres
 public | notes | table | app
(2 rows)
```

## 흔한 실수와 문제 해결
- `POSTGRES_PASSWORD` 없이 컨테이너를 띄우면 `Error: Database is uninitialized and superuser password is not specified.`를 내고 바로 끝난다.
- `connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory`: psql은 호스트를 안 주면 유닉스 소켓으로 붙는다. 서버가 떠 있는지, `-h localhost -p 15432`로 TCP를 써야 하는지 본다.
- `password authentication failed`: 롤 이름과 포트부터 본다. 로컬 PostgreSQL이 5432를 잡고 있으면 엉뚱한 서버에 붙는다.
- `relation "…" does not exist`: 접속한 데이터베이스(`\conninfo`)와 `search_path`를 본다.
- 태그를 `postgres:latest`로 두면 주 버전이 바뀐 날 새 서버가 기존 데이터 디렉터리를 읽지 못한다(주 버전 사이에는 저장 형식이 다르다). 주 버전까지 고정한다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 연결마다 fork되는 백엔드가 그 글의 프로세스이고, 연결이 비싼 이유도 거기 있다.
- 도커와 컨테이너 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」: `mypg-data` 볼륨 덕분에 컨테이너를 지워도 데이터 디렉터리가 남는다.
- 16편 「운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링」: 연결마다 프로세스라는 구조는 커넥션 풀링으로, 롤은 최소 권한 설계로 이어진다.

## 정리
- PostgreSQL은 1986년 버클리 POSTGRES에서 시작했고, 주 버전은 해마다 나와 5년 지원된다.
- 서버는 주 프로세스와 백그라운드 일꾼으로 이뤄지고, 연결마다 백엔드 프로세스가 하나씩 생긴다.
- 클러스터 → 데이터베이스 → 스키마 → 테이블 계층에서 연결은 DB 하나에 붙고, 스키마 없는 이름은 `search_path`로 찾는다.
- 앱은 슈퍼유저가 아닌 전용 롤로, 접속 정보는 URI나 libpq 환경 변수로 넘긴다.

## 더 알아보기
- 다음 글: 2편 「자료형 고르기: 숫자, 문자열, 시간, UUID, 배열」
- PostgreSQL 문서 "A Brief History of PostgreSQL": https://www.postgresql.org/docs/current/history.html

## 시리즈 안내
1. **PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마** ← 지금 읽는 글
2. 자료형 고르기: 숫자, 문자열, 시간, UUID, 배열
3. 제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약
4. 조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기
5. 윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리
6. 인덱스 1: B-트리와 실행 계획 읽기
7. 인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN
8. 쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형
9. 트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상
10. MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈
11. 락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태
12. JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기
13. 스키마 마이그레이션: 운영 중인 테이블을 안전하게 바꾸기
14. 백업과 복구: pg_dump, WAL 아카이브, 시점 복구
15. 복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치
16. 운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링

먼저 읽으면 좋은 글: 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」(연결마다 프로세스), 도커와 컨테이너 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」(서버를 띄우는 방법), 추상 데이터 타입 심화 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」(6~7편의 인덱스), 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」(4편의 NULL과 삼값 논리).
