# [PostgreSQL 실무 14/16] 백업과 복구: pg_dump, WAL 아카이브, 시점 복구

> **한 줄 요약** — `pg_dump`는 한 시점의 논리 사본이라 테이블 단위 복원과 버전 이동에 좋고, 베이스 백업에 WAL 아카이브를 더하면 사고 직전 아무 시점으로 클러스터를 되돌릴 수 있으며, 어느 쪽이든 실제로 복원해 본 백업만 믿을 수 있다.

## 이 글에서 다루는 것
- 논리 백업: `pg_dump` 형식, `pg_restore`로 선택 복원, 롤을 담는 `pg_dumpall --globals-only`
- 물리 백업: `pg_basebackup`과 WAL, 연속 아카이빙
- `DELETE` 사고를 컨테이너로 재현하고 시점 복구(PITR)로 되돌리기
- 복구 연습과 백업 도구

## 문제: 백업은 있는데 복구가 안 된다
백업 사고는 대개 "백업 파일은 있었다"로 시작한다. 롤이 빠져 복원이 실패하고, 어젯밤 덤프라 오늘 낮 주문이 사라지고, 복원 절차를 아무도 해 본 적이 없다. 그래서 먼저 두 숫자를 정한다. 얼마만큼의 데이터 손실을 견디나(RPO, 복구 시점 목표), 얼마 만에 되살려야 하나(RTO, 복구 시간 목표). 하루 한 번 `pg_dump`의 RPO는 최대 하루이고, WAL 아카이브를 쓰면 아직 아카이브되지 않은 마지막 WAL 분량으로 줄어든다(`archive_timeout`으로 시간 상한을 둔다).

## 논리 백업: pg_dump와 pg_restore
`pg_dump`는 데이터베이스 하나를 SQL(또는 그에 해당하는 아카이브)로 내보낸다. 덤프는 시작 시점의 스냅숏 하나로 읽으므로(9편 「트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상」) 쓰기를 막지 않고도 일관되다. 다만 테이블마다 ACCESS SHARE 잠금을 쥐므로 덤프 중의 `ALTER TABLE`은 기다린다(13편). 실습 데이터베이스를 만든다.
```sql
CREATE ROLE shop_owner LOGIN;
CREATE DATABASE shop OWNER shop_owner;
\c shop shop_owner
CREATE TABLE customers (id int PRIMARY KEY, name text);
CREATE TABLE orders (id int PRIMARY KEY, customer_id int REFERENCES customers, amount int);
CREATE INDEX orders_customer_idx ON orders (customer_id);
INSERT INTO customers SELECT g, 'customer' || g FROM generate_series(1, 100) g;
INSERT INTO orders SELECT g, g % 100 + 1, g * 10 FROM generate_series(1, 1000) g;
\c postgres postgres
```
일반 텍스트 형식과 커스텀 형식(`-Fc`, 압축된 아카이브)으로 덤프하고, 롤은 따로 받는다.
```bash
pg_dump shop > shop.sql
pg_dump -Fc -f shop.dump shop
pg_dumpall --globals-only > globals.sql
grep -E '^(CREATE|COPY)' shop.sql
pg_restore -l shop.dump | grep -v '^;'
```
```text
CREATE TABLE public.customers (
CREATE TABLE public.orders (
COPY public.customers (id, name) FROM stdin;
COPY public.orders (id, customer_id, amount) FROM stdin;
CREATE INDEX orders_customer_idx ON public.orders USING btree (customer_id);
…; 1259 … TABLE public customers shop_owner
…; 1259 … TABLE public orders shop_owner
…; 0 … TABLE DATA public customers shop_owner
…; 0 … TABLE DATA public orders shop_owner
…; 2606 … CONSTRAINT public customers customers_pkey shop_owner
…; 2606 … CONSTRAINT public orders orders_pkey shop_owner
…; 1259 … INDEX public orders_customer_idx shop_owner
…; 2606 … FK CONSTRAINT public orders orders_customer_id_fkey shop_owner
```
덤프 순서는 테이블 → 데이터(`COPY`) → 제약·인덱스다. 데이터를 다 넣은 뒤 인덱스를 한 번에 만드는 편이 빠르기 때문이다. 일반 텍스트는 `psql -f`로 통째로만 되돌릴 수 있고, 커스텀 형식은 목차(`-l`)가 있어 `pg_restore`로 골라 복원하고 `-j`로 병렬 복원할 수 있다.

이제 새 서버로 옮기는 상황을 흉내 낸다. 데이터베이스와 롤을 지우고 덤프만으로 복원한다.
```bash
dropdb shop && dropuser shop_owner
createdb shop
pg_restore -d shop shop.dump
```
```text
pg_restore: error: could not execute query: ERROR:  role "shop_owner" does not exist
Command was: ALTER TABLE public.customers OWNER TO shop_owner;

pg_restore: error: could not execute query: ERROR:  role "shop_owner" does not exist
Command was: ALTER TABLE public.orders OWNER TO shop_owner;

pg_restore: warning: errors ignored on restore: 2
```
`pg_dump`는 데이터베이스 안의 객체만 담는다. 롤과 테이블스페이스는 클러스터 전체에 속하므로 `pg_dumpall --globals-only`로 받은 파일을 먼저 적용해야 한다.
```bash
psql -q -f globals.sql
dropdb shop && createdb -O shop_owner shop
pg_restore -d shop shop.dump
psql -d shop -Atc "SELECT count(*) FROM customers" -c "SELECT count(*) FROM orders"
```
```text
psql:globals.sql:…: ERROR:  role "postgres" already exists
100
1000
```
`postgres` 롤이 이미 있다는 오류는 무시해도 된다. 행 수가 원본과 같다. 테이블 하나만 망가졌다면 그 테이블의 데이터만 되살린다.
```bash
psql -d shop -c "TRUNCATE orders"
pg_restore -d shop --data-only -t orders shop.dump
psql -d shop -Atc "SELECT count(*), sum(amount) FROM orders"
```
```text
TRUNCATE TABLE
1000|5005000
```
합계까지 원본(10 + 20 + … + 10000 = 5,005,000)과 맞는다. 논리 백업은 더 새로운 주 버전 서버로 옮길 수 있어 업그레이드(16편)에도 쓰인다. 대신 덤프 이후의 변경은 잃고, 큰 DB는 인덱스를 다시 만드느라 복원이 느리다.

## 물리 백업과 WAL
PostgreSQL은 데이터 파일을 바꾸기 전에 변경 내용을 **WAL**(write-ahead log, 선행 기록 로그)에 먼저 쓴다. 장애 뒤 재시작할 때 마지막 체크포인트부터 WAL을 다시 적용하는 것이 기본 복구다. 이 원리를 넓히면 백업이 된다.
- **베이스 백업**: `pg_basebackup`이 데이터 디렉터리 전체를 파일째 복사한다. 복사 도중 바뀐 페이지는 함께 받은 WAL로 맞춘다.
- **연속 아카이빙**: 16MB WAL 세그먼트가 찰 때마다 `archive_command`가 그 파일을 다른 곳에 복사한다.
- **시점 복구**(PITR, point-in-time recovery): 베이스 백업을 풀고 아카이브의 WAL을 원하는 시각까지만 재생한다.

```text
──B────┬────┬──T─x──→ 시간
  │    1    2
  └→ B를 복사해 WAL 1, 2를 재생하고
     T에서 멈춘다
```
B는 베이스 백업, 1·2는 아카이브된 WAL 세그먼트, T는 목표 시각, x는 사고다.

## 사고를 재현하고 시점 복구로 되돌리기
아카이브와 백업을 담을 볼륨 `pitr`을 만들고, 아카이빙을 켠 서버를 띄운다. 볼륨 폴더의 주인은 컨테이너 안 `postgres` 사용자로 맞춘다. `%p`는 WAL 파일 경로, `%f`는 파일 이름이고, `test ! -f`는 이미 있는 파일을 덮어쓰지 않게 한다.
```bash
docker volume create pitr >/dev/null
docker run --rm -v pitr:/pitr postgres:18-alpine \
  sh -c 'mkdir /pitr/archive && chown -R postgres /pitr'
docker run -d --name pg-primary -v pitr:/pitr \
  -e POSTGRES_PASSWORD=example-password postgres:18-alpine \
  -c archive_mode=on \
  -c archive_command='test ! -f /pitr/archive/%f && cp %p /pitr/archive/%f' >/dev/null
until docker exec pg-primary pg_isready -q -h 127.0.0.1; do sleep 0.2; done
p() { docker exec pg-primary psql -U postgres "$@"; }
```
데이터 100행을 넣고 베이스 백업을 받는다. `pg_verifybackup`은 백업에 함께 생기는 목록 파일(`backup_manifest`)과 실제 파일을 대조한다.
```bash
p -c "CREATE TABLE orders (id int PRIMARY KEY, item text)" \
  -c "INSERT INTO orders SELECT g, 'item' || g FROM generate_series(1, 100) g"
docker exec -u postgres pg-primary pg_basebackup -D /pitr/base -c fast
docker exec -u postgres pg-primary pg_verifybackup /pitr/base
```
```text
CREATE TABLE
INSERT 0 100
backup successfully verified
```
백업 뒤에 50행이 더 들어오고, 누군가 `WHERE` 없는 `DELETE`를 실행한다. 사고 직전 시각을 `T`에 적어 둔다(실무에서는 로그와 애플리케이션 기록으로 찾는다). `pg_switch_wal()`로 현재 세그먼트를 닫아 아카이브되게 하고, 파일이 생길 때까지 기다린다.
```bash
p -c "INSERT INTO orders SELECT g, 'item' || g FROM generate_series(101, 150) g"
T=$(p -Atc "SELECT now()")
p -c "DELETE FROM orders"
SEG=$(p -Atc "SELECT pg_walfile_name(pg_switch_wal())")
until docker exec pg-primary test -f /pitr/archive/$SEG; do sleep 0.2; done
docker exec pg-primary ls /pitr/archive
```
```text
INSERT 0 50
DELETE 150
000000010000000000000001
000000010000000000000002
000000010000000000000003
000000010000000000000003.00000028.backup
000000010000000000000004
```
베이스 백업을 새 폴더로 복사하고 `recovery.signal` 파일을 만든 뒤, 그 폴더로 복구용 서버를 띄운다. `restore_command`는 아카이브에서 WAL을 가져오는 명령이고, `recovery_target_time`이 멈출 시각, `promote`는 멈춘 뒤 쓰기 가능한 서버로 올라오라는 뜻이다.
```bash
docker run --rm -u postgres -v pitr:/pitr postgres:18-alpine \
  sh -c 'cp -a /pitr/base /pitr/restore && touch /pitr/restore/recovery.signal'
docker run -d --name pg-restore -v pitr:/pitr -e PGDATA=/pitr/restore \
  postgres:18-alpine -c restore_command='cp /pitr/archive/%f %p' \
  -c recovery_target_time="$T" -c recovery_target_action=promote >/dev/null
until docker logs pg-restore 2>&1 | grep -q 'ready to accept connections'; do sleep 0.2; done
docker logs pg-restore 2>&1 | grep -E 'point-in-time|stopping|new timeline|recovery complete' \
  | sed 's/.*LOG:  //'
docker exec pg-restore psql -U postgres -Atc "SELECT count(*) FROM orders"
p -Atc "SELECT count(*) FROM orders"
```
```text
starting point-in-time recovery to …
recovery stopping before commit of transaction …, time …
selected new timeline ID: 2
archive recovery complete
150
0
```
복구 서버는 `DELETE`를 커밋하기 직전에 멈춰 150행을 되살렸고, 원래 서버는 여전히 0행이다. 복구가 끝나면 **타임라인** 번호가 2로 바뀐다. 이후 WAL 파일 이름이 `00000002…`로 시작해, 아카이브 안에서 사고가 난 원래 역사(타임라인 1)의 파일을 덮어쓰지 않는다. 실무에서는 되살린 행을 `pg_dump -t`로 빼서 운영 서버에 다시 넣거나, 복구 서버를 새 운영 서버로 삼는다.
```bash
docker rm -fv pg-primary pg-restore >/dev/null && docker volume rm pitr
```
```text
pitr
```

## 비교: 논리 백업과 물리 백업
| 항목 | pg_dump | 베이스 백업 + WAL |
|---|---|---|
| 범위 | DB·테이블 | 클러스터 전체 |
| 복원 시점 | 덤프 시점 하나 | 아카이브 안 아무 시점 |
| 주 버전 | 새 버전으로 이동 가능 | 같은 주 버전만 |
| 복원 속도 | 인덱스 재생성으로 느림 | 파일 복사 + WAL 재생 |

## 흔한 실수와 문제 해결
- 복구 로그의 `cp: can't stat '/pitr/archive/00000002.history'`는 정상이다. 서버가 있을지 모르는 파일을 차례로 물어보는 것이다.
- `recovery ended before configured recovery target was reached`: 목표 시각까지의 WAL이 아카이브에 없다. 마지막 세그먼트가 아직 아카이브되지 않았거나 시각을 잘못 줬다.
- `archive_command`가 실패하면 WAL이 `pg_wal`에 쌓여 디스크가 찬다. `pg_stat_archiver`의 `failed_count`, `last_failed_wal`을 감시한다.
- 2025년 8월 보안 수정(17.6, 16.10 등) 이후 일반 텍스트 덤프 첫머리에 `\restrict` 메타 명령이 들어간다. 그보다 오래된 psql은 이 명령을 모르므로 복원에는 그 이후 버전의 psql을 쓴다.

## 권장 설정과 복구 연습
- RPO가 하루보다 짧아야 하면 연속 아카이빙을 켠다. 아카이브와 백업은 DB 서버와 다른 저장소(다른 서버, 객체 저장소)에 둔다.
- 베이스 백업은 정기적으로 다시 받는다. 재생할 WAL이 길수록 복구가 오래 걸린다. PostgreSQL 17부터는 바뀐 블록만 받는 `pg_basebackup --incremental`과 이를 합치는 `pg_combinebackup`이 있다.
- 실무에서는 pgBackRest, Barman, WAL-G 같은 도구가 아카이빙·보관 기간·압축·병렬 전송·검증을 맡는다.
- 복구 연습을 일정으로 잡는다. 이 글처럼 빈 서버에 복원해 행 수와 합계를 원본과 대조하고, 걸린 시간을 RTO와 비교한다. 복원해 본 적 없는 백업은 백업이 아니다.

## 어디에 쓰이나
- 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: 대기 서버는 WAL을 아카이브 대신 네트워크로 계속 받아 재생하는 영원한 복구 상태다.
- 도커와 컨테이너 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」: 아카이브와 백업을 컨테이너가 아닌 볼륨에 둔 이유다.
- 추상 데이터 타입 심화 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: 멤테이블을 잃지 않으려고 쓰기를 먼저 로그(WAL)에 순차로 남기는 것도 같은 선행 기록 원리다.

## 정리
- `pg_dump`는 스냅숏 하나를 내보내며, 롤은 `pg_dumpall --globals-only`로 따로 챙긴다.
- 커스텀 형식 덤프는 `pg_restore`로 테이블·데이터만 골라 복원할 수 있다.
- 베이스 백업 + WAL 아카이브는 사고 직전 시각까지 되돌리고, 복구 뒤에는 새 타임라인이 시작된다.
- 백업의 가치는 복원 연습으로만 확인된다.

## 더 알아보기
- 이전 글: 13편 「스키마 마이그레이션: 운영 중인 테이블을 안전하게 바꾸기」
- 다음 글: 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」
- PostgreSQL 문서 "Continuous Archiving and Point-in-Time Recovery (PITR)": https://www.postgresql.org/docs/current/continuous-archiving.html
