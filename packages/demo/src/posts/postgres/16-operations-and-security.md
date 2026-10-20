# [PostgreSQL 실무 16/16] 운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링

> **한 줄 요약** — 앱은 소유자가 아닌 최소 권한 롤로 붙이고, 테넌트 분리는 행 수준 보안으로 DB가 강제하며, 접속은 `scram-sha-256`으로 막고, 프로세스인 연결은 풀링으로 아끼며, 오래 열린 트랜잭션을 감시한다.

## 이 글에서 다루는 것
- 롤과 GRANT로 최소 권한 만들기, `ALTER DEFAULT PRIVILEGES`, PostgreSQL 15의 `public` 스키마 변화
- 행 수준 보안(RLS)으로 테넌트 분리하기
- `pg_hba.conf`와 `scram-sha-256` 인증
- 연결 관리와 모니터링, 기본 설정 조정의 출발점, 주 버전 업그레이드

## 문제: 슈퍼유저로 붙는 앱
흔한 시작은 앱이 `postgres` 슈퍼유저로 접속하는 것이다. 그러면 SQL 주입 한 번에 테이블 삭제는 물론 서버에서 명령 실행(`COPY ... TO PROGRAM`)까지 열린다. 원칙은 단순하다. 테이블은 로그인하지 않는 소유자 롤이 갖고, 앱과 사람은 필요한 권한만 받은 롤로 붙는다.

## 롤과 GRANT: 소유자, 앱, 읽기 전용
**롤**(role)은 사용자이자 그룹이고, `LOGIN` 속성이 있으면 접속할 수 있다. 권한은 단계마다 필요하다. 스키마의 `USAGE`가 있어야 그 안이 보이고, 테이블마다 `SELECT`·`INSERT` 등이 있어야 읽고 쓴다.
```sql
CREATE ROLE app_owner NOLOGIN;
CREATE ROLE app_rw LOGIN;
CREATE ROLE app_ro LOGIN;
CREATE SCHEMA app AUTHORIZATION app_owner;
GRANT USAGE ON SCHEMA app TO app_rw, app_ro;
SET ROLE app_owner;
CREATE TABLE app.accounts (id int PRIMARY KEY, name text);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_ro;
CREATE TABLE app.invoices (id int PRIMARY KEY, amount int);
RESET ROLE;
```
`SET ROLE`로 각 롤이 되어 확인한다.
```sql
SET ROLE app_ro;
SELECT count(*) FROM app.accounts;
SELECT count(*) FROM app.invoices;
CREATE TABLE public.notes (id int);
RESET ROLE;
```
```text
SET
 count
-------
     0
(1 row)

ERROR:  permission denied for table invoices
ERROR:  permission denied for schema public
LINE 1: CREATE TABLE public.notes (id int);
                     ^
RESET
```
첫 오류는 흔한 배포 사고다. `GRANT ... ON ALL TABLES`는 **지금 있는** 테이블에만 적용되어 새 테이블에서 앱이 `permission denied`를 맞는다. 앞으로 만들 테이블의 권한은 테이블을 만드는 롤 기준으로 `ALTER DEFAULT PRIVILEGES FOR ROLE app_owner`에 미리 정한다.
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoices TO app_rw;
GRANT SELECT ON app.invoices TO app_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO app_ro;
```

두 번째 오류는 PostgreSQL 15의 변화다. 14까지는 누구나 `public` 스키마에 객체를 만들 수 있었지만, 15부터 새 데이터베이스의 `public`은 `pg_database_owner`(그 DB의 소유자)가 갖고 다른 롤에게 CREATE 권한이 없다. 14 이하에서 업그레이드·복원한 DB는 예전 권한 그대로라 `REVOKE CREATE ON SCHEMA public FROM PUBLIC`을 직접 한다.

## 행 수준 보안으로 테넌트 분리
여러 고객사(테넌트)가 테이블을 함께 쓰면 모든 쿼리에 `WHERE tenant_id = ?`를 붙여야 하고, 하나만 빠져도 남의 데이터가 보인다. **행 수준 보안**(row-level security, RLS)은 이 조건을 테이블 정책으로 달아 DB가 강제한다. 앱은 자기 테넌트를 설정값으로 알린다.
```sql
SET ROLE app_owner;
CREATE TABLE app.docs (id int PRIMARY KEY, tenant_id int NOT NULL, body text);
INSERT INTO app.docs VALUES (1, 1, 'a-1'), (2, 1, 'a-2'), (3, 2, 'b-1');
ALTER TABLE app.docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.docs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::int);
```
```sql
SET ROLE app_rw;
SET app.tenant_id = '1';
SELECT * FROM app.docs;
INSERT INTO app.docs VALUES (4, 2, 'sneaky');
RESET app.tenant_id;
SELECT count(*) AS no_tenant FROM app.docs;
SET ROLE app_owner;
SELECT count(*) AS as_owner FROM app.docs;
RESET ROLE;
```
```text
SET
SET
 id | tenant_id | body
----+-----------+------
  1 |         1 | a-1
  2 |         1 | a-2
(2 rows)

ERROR:  new row violates row-level security policy for table "docs"
RESET
 no_tenant
-----------
         0
(1 row)

SET
 as_owner
----------
        3
(1 row)

RESET
```
테넌트 1은 자기 행만 보고, `USING` 조건이 새 행 검사에도 쓰여 테넌트 2의 행은 넣지 못한다. 설정이 없으면 0행이다. `current_setting(..., true)`는 설정이 없으면 NULL을, `RESET` 뒤에는 빈 문자열을 돌려주므로 `nullif`로 둘 다 NULL로 만들어 "안 보임"으로 닫는다. 마지막 결과가 함정이다. **테이블 소유자와 슈퍼유저는 RLS를 건너뛴다.** 소유자에게도 적용하려면 `FORCE ROW LEVEL SECURITY`를 쓴다. 커넥션 풀에서는 설정이 다음 사용자에게 남지 않게 트랜잭션 안에서 `SET LOCAL`로 건다.

## pg_hba.conf와 scram-sha-256
누가 어디서 어떤 방법으로 접속하는지는 `pg_hba.conf`가 정한다. 줄마다 연결 종류, 데이터베이스, 사용자, 주소, 인증 방법을 적고 **위에서부터 처음 맞는 줄**만 적용된다. 이 글의 SQL 실습 서버는 비밀번호 없는 `trust` 시험용이라, 비밀번호를 준 공식 이미지를 따로 띄워 본다.
```bash
docker run -d --name pg-sec -e POSTGRES_PASSWORD=example-password postgres:18-alpine >/dev/null
until docker exec pg-sec pg_isready -q -h 127.0.0.1; do sleep 0.2; done
docker exec pg-sec sh -c 'grep -Ev "^(#|$)" "$PGDATA/pg_hba.conf"'
docker exec -e PGPASSWORD=wrong pg-sec sh -c 'psql -h "$(hostname -i)" -U postgres -c "SELECT 1"'
docker exec pg-sec psql -U postgres -Atc "SELECT left(rolpassword, 19) FROM pg_authid WHERE rolname = 'postgres'"
docker rm -fv pg-sec >/dev/null
```
```text
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host all all all scram-sha-256
psql: error: connection to server at "…", port 5432 failed: FATAL:  password authentication failed for user "postgres"
SCRAM-SHA-256$4096:
```
컨테이너 안의 소켓과 `127.0.0.1`은 `trust`이고, 나머지 주소는 마지막 줄의 `scram-sha-256`에 걸려 틀린 비밀번호가 거부된다. 비밀번호는 SCRAM 검증값(반복 4096회)으로 저장된다. `password_encryption` 기본값은 PostgreSQL 14부터 `scram-sha-256`이고, 18은 MD5 비밀번호를 폐지 예정으로 바꿔 경고를 낸다.
```sql
SET password_encryption = 'md5';
CREATE ROLE legacy LOGIN PASSWORD 'example-password';
```
```text
SET
WARNING:  setting an MD5-encrypted password
DETAIL:  MD5 password support is deprecated and will be removed in a future release of PostgreSQL.
HINT:  Refer to the PostgreSQL documentation for details about migrating to another password type.
CREATE ROLE
```
운영에서는 주소를 앱 서버 대역으로 좁히고 TLS를 강제하는 `hostssl` 줄을 쓴다. 고친 뒤 `pg_hba_file_rules` 뷰의 `error` 열로 문법을 확인하고 `pg_reload_conf()`로 다시 읽힌다.

## 연결은 프로세스다: 한도와 풀링
1편에서 본 대로 연결마다 서버 프로세스가 하나씩 생긴다. 프로세스마다 메모리를 따로 쓰고 연결이 수천 개면 스냅숏 계산과 문맥 전환 비용도 커져서, `max_connections`(기본 100)는 크게 올리지 않는다. 롤별 한도와 유휴 트랜잭션 차단을 확인한다. 접속 정보는 libpq 환경 변수(`PGHOST` 등)로 준다.
```sql
ALTER ROLE app_ro CONNECTION LIMIT 2;
```
```python
import time, psycopg
ro = [psycopg.connect(user="app_ro") for _ in range(2)]   # 두 개를 열어 둔다
try:
    psycopg.connect(user="app_ro")
except psycopg.OperationalError as e:
    print(str(e).split("FATAL:")[1].strip())
mon = psycopg.connect(autocommit=True)
n = mon.execute("SELECT count(DISTINCT pid) FROM pg_stat_activity"
                " WHERE usename = 'app_ro'").fetchone()[0]
print(f"app_ro 서버 프로세스 {n}개")

w = psycopg.connect(user="app_rw")         # autocommit이 아니라 트랜잭션이 열린다
w.execute("SET idle_in_transaction_session_timeout = '1s'")
w.execute("SELECT count(*) FROM app.accounts")
print(mon.execute("SELECT state FROM pg_stat_activity WHERE usename = 'app_rw'").fetchone()[0])
time.sleep(1.5)
try:
    w.execute("SELECT 1")
except psycopg.Error as e:
    print(type(e).__name__, "-", e.diag.message_primary)
```
```text
too many connections for role "app_ro"
app_ro 서버 프로세스 2개
idle in transaction
IdleInTransactionSessionTimeout - terminating connection due to idle-in-transaction timeout
```
`idle in transaction`은 트랜잭션을 연 채 쉬는 연결로, 잠금을 쥐고 VACUUM을 막으니(10편 「MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈」) 제한 시간으로 끊는다. 앱 서버 여러 대의 풀을 합하면 `max_connections`를 넘기 쉬워, PgBouncer 같은 **커넥션 풀러**를 앞에 두고 서버 연결 수십 개를 많은 클라이언트가 나눠 쓴다. 트랜잭션 단위 풀링에서는 세션 상태(`SET`, 권고 잠금)가 트랜잭션을 넘어 유지되지 않는다.

## 모니터링과 기본 설정
매일 보는 뷰는 셋이다. `pg_stat_activity`(누가 무엇을 하나: `state`, `wait_event`, `xact_start`), `pg_stat_database`(커밋·롤백 수, 캐시 적중 `blks_hit`과 디스크 읽기 `blks_read`), `pg_stat_statements`(8편 「쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형」)다. 캐시 적중률 `blks_hit / (blks_hit + blks_read)`는 값 하나보다 추세를 본다.
```sql
SELECT name, setting, unit, context FROM pg_settings
WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'effective_cache_size')
ORDER BY name;
```
```text
         name         | setting | unit |  context
----------------------+---------+------+------------
 effective_cache_size | 524288  | 8kB  | user
 max_connections      | 100     |      | postmaster
 shared_buffers       | 16384   | 8kB  | postmaster
 work_mem             | 4096    | kB   | user
(4 rows)
```
기본값은 작은 기계용이다(`shared_buffers` 16384 × 8kB = 128MB, `effective_cache_size` 4GB, `work_mem` 4MB). 공식 문서의 출발점은 이렇다. `shared_buffers`는 메모리 1GB 이상인 전용 서버에서 메모리의 25%로 시작하고, 운영체제 캐시도 쓰므로 40%를 넘겨도 나아지기 어렵다. `effective_cache_size`는 메모리를 잡지 않는 플래너용 추정값이다. `work_mem`은 정렬·해시 연산 하나당 한도라 쿼리 하나가 여러 배를 쓰므로 필요한 세션에서만 올린다. `context`가 `postmaster`인 설정은 재시작해야 바뀐다.

## 주 버전 업그레이드
부 버전(18.5 → 18.6)은 실행 파일을 바꾸고 재시작하면 된다(릴리스 노트의 추가 절차는 확인한다). 주 버전(17 → 18)은 셋 중 하나다.
- 덤프·복원(14편): 가장 단순하지만 큰 DB는 오래 멈춘다.
- `pg_upgrade`: 카탈로그만 새로 만들고 데이터 파일은 복사·링크해 빠르다. 18부터 플래너 통계를 유지하고 디렉터리를 맞바꾸는 `--swap`이 생겼다. 먼저 `--check`로 점검한다.
- 논리 복제(15편): 새 버전 서버를 구독자로 따라오게 한 뒤 전환해 정지 시간을 가장 줄인다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 연결마다 프로세스를 띄우는 구조라 연결 수가 곧 프로세스 수이고 풀링이 필요하다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: 앱 롤에 필요한 권한만 주는 것과 `GITHUB_TOKEN`에 `permissions:`로 최소 권한을 주는 것은 같은 원칙이다.

## 정리
- 테이블은 로그인하지 않는 소유자 롤이 갖고, 앱·읽기 롤에는 필요한 권한과 `ALTER DEFAULT PRIVILEGES`를 준다.
- RLS는 테넌트 조건을 DB가 강제하지만 소유자와 슈퍼유저는 건너뛴다.
- `pg_hba.conf`는 처음 맞는 줄이 이기며, 인증은 `scram-sha-256`을 쓴다.
- 연결은 프로세스라 풀러로 아끼고, `idle in transaction`과 긴 트랜잭션을 감시한다.

## 더 알아보기
- 이전 글: 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」
- 처음 글: 1편 「PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마」
- PostgreSQL 문서 "Resource Consumption": https://www.postgresql.org/docs/current/runtime-config-resource.html
