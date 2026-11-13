# [Redis 실무 7/10] 영속성: RDB 스냅숏과 AOF

> **한 줄 요약** — Redis는 메모리 전체를 어느 순간의 사진처럼 파일로 찍는 RDB 스냅숏과, 들어온 쓰기 명령을 차례로 덧붙이는 AOF 로그로 데이터를 디스크에 남기며, 스냅숏은 작고 빠르게 되살리지만 마지막 사진 이후를 잃고, AOF는 잃는 범위를 1초 안쪽으로 줄이는 대신 파일이 커져 주기적으로 다시 쓴다.

## 이 글에서 다루는 것
- 메모리 저장소가 디스크를 쓰는 두 방법
- RDB: fork와 copy-on-write로 찍는 스냅숏
- 직접 해 보기: 스냅숏 뒤의 쓰기가 사라지는 장면
- AOF: 명령 로그, fsync 정책, 다시 쓰기
- 직접 해 보기: AOF 파일 안을 들여다보고 갑자기 죽여 보기
- 무엇을 켤까

## 메모리 저장소의 디스크
1편에서 Redis는 데이터를 메모리에 둔다고 했다. 전원이 나가거나 프로세스가 죽으면 메모리는 비워진다. 캐시로만 쓴다면 그래도 괜찮지만(데이터베이스에서 다시 채우면 된다), 세션이나 카운터나 스트림(6편)처럼 Redis에만 있는 데이터라면 디스크에 남겨야 한다. Redis는 두 가지 방법을 주고, 함께 켤 수도 있다.

## RDB: 어느 순간의 사진
**RDB**는 메모리의 데이터 전체를 압축된 바이너리 파일 하나(`dump.rdb`)로 저장한다. 서버가 멈추지 않고 사진을 찍는 비결은 운영체제의 `fork`다. Redis는 자식 프로세스를 하나 만들고, 자식이 그 순간의 메모리를 파일로 쓴다. 부모는 계속 요청을 처리한다. 둘은 처음에 같은 메모리 페이지를 나눠 보다가, 부모가 어떤 페이지를 고치는 순간에만 그 페이지를 복사한다(**copy-on-write**). 그래서 쓰기가 많은 서버는 스냅숏 동안 메모리를 더 쓴다. 저장 시점은 `save 3600 1 300 100 60 10000`처럼 "N초 동안 M번 이상 바뀌면"이라는 규칙으로 정하거나, `BGSAVE` 명령으로 직접 찍는다.

## 직접 해 보기 1: 스냅숏과 그 뒤의 공백
작업 폴더에 파일을 남기도록 `--dir .`을 주고, 자동 저장은 끈 채(`--save ""`) 직접 찍는다.
```bash
redis-server --port 6390 --dir . --save "" --appendonly no > redis.log 2>&1 &
PID=$!
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
r() { redis-cli -p 6390 --no-raw "$@"; }
r set before-snapshot 1
r bgsave
sleep 1
head -c 9 dump.rdb; echo
r set after-snapshot 2
{ kill -9 $PID; wait $PID; } 2>/dev/null          # 갑자기 죽는다
redis-server --port 6390 --dir . --save "" --appendonly no > redis.log 2>&1 &
PID=$!
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
r exists before-snapshot after-snapshot
r get before-snapshot
```
```text
OK
Background saving started
REDIS0010
OK
(integer) 1
"1"
```
파일은 `REDIS0010`(RDB 형식 10판)으로 시작한다. 다시 띄운 서버는 `dump.rdb`를 읽어 스냅숏 전의 키를 되살렸지만, 스냅숏 **뒤에** 쓴 `after-snapshot`은 사라졌다(두 키 중 1개만 존재). 이것이 RDB의 대가다. 5분마다 찍는다면 최대 5분 치를 잃을 수 있다. 대신 파일이 작아 백업과 복사가 쉽고, 다시 띄울 때 명령을 하나씩 다시 실행하지 않고 통째로 읽으므로 빠르다.
```bash
r shutdown nosave
```

## AOF: 명령을 덧붙이는 로그
**AOF**(append-only file)는 데이터를 바꾸는 명령을 받은 그대로 파일 뒤에 덧붙인다. 다시 띄울 때는 그 명령들을 처음부터 다시 실행해 메모리를 복원한다. 데이터베이스의 WAL(PostgreSQL 실무 14편)과 같은 생각이다. 핵심 설정은 디스크에 실제로 내려쓰게 하는 `fsync`를 얼마나 자주 하느냐다.
- `appendfsync always`: 명령마다. 거의 잃지 않지만 느리다.
- `appendfsync everysec`: 1초마다. 기본값. 최대 1초 치를 잃는다.
- `appendfsync no`: 운영체제에 맡긴다. 빠르지만 수십 초를 잃을 수 있다.

Redis 7부터 AOF는 폴더 하나(`appendonlydir`)에 여러 파일로 나뉜다. 다시 쓴 시점의 전체 데이터인 **base** 파일, 그 뒤의 명령을 덧붙이는 **incr** 파일, 둘을 묶는 **manifest** 파일이다.

## 직접 해 보기 2: AOF 들여다보기
```bash
redis-server --port 6390 --dir . --save "" --appendonly yes --appendfsync everysec > redis.log 2>&1 &
PID=$!
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
ls appendonlydir
for i in 1 2 3; do r incr counter > /dev/null; done
sleep 1.2                                         # everysec: 1초 안에 디스크로
tail -c 54 appendonlydir/appendonly.aof.1.incr.aof | tr '\r' '~'
```
```text
appendonly.aof.1.base.rdb
appendonly.aof.1.incr.aof
appendonly.aof.manifest
*2~
$4~
incr~
$7~
counter~
*2~
$4~
incr~
$7~
counter~
```
incr 파일에는 1편에서 본 RESP 형식 그대로 `incr counter` 명령이 쌓여 있다. 이제 서버를 갑자기 죽이고 다시 띄워 본다.
```bash
{ kill -9 $PID; wait $PID; } 2>/dev/null
redis-server --port 6390 --dir . --save "" --appendonly yes > redis.log 2>&1 &
PID=$!
until redis-cli -p 6390 ping > /dev/null 2>&1; do sleep 0.1; done
r get counter
```
```text
"3"
```
명령을 다시 실행해 `counter`가 3으로 돌아왔다. 1초 기다린 덕분에 마지막 명령까지 디스크에 있었다. 기다리지 않고 바로 죽였다면 마지막 1초 안쪽의 명령은 잃었을 수 있다.

## AOF 다시 쓰기
`INCR`을 100만 번 하면 AOF에는 명령 100만 개가 쌓이지만 결과는 숫자 하나다. 그래서 AOF가 일정 크기 이상 커지면 Redis는 현재 메모리 상태를 새 base 파일로 쓰고, 그 뒤의 명령만 새 incr 파일에 쌓는다. 이것이 **AOF 다시 쓰기**다. 이때도 RDB처럼 fork한 자식이 쓰고, 기본 설정(`aof-use-rdb-preamble yes`)에서는 base 파일을 RDB 형식으로 쓴다. 그래서 파일 이름이 `.base.rdb`다.
```bash
r bgrewriteaof
sleep 1
ls appendonlydir
head -c 9 appendonlydir/appendonly.aof.2.base.rdb; echo
r shutdown nosave
```
```text
Background append only file rewriting started
appendonly.aof.2.base.rdb
appendonly.aof.2.incr.aof
appendonly.aof.manifest
REDIS0010
```
번호가 2로 올라간 새 base와 incr이 생겼고, base는 RDB 형식이다. 즉 지금의 기본 AOF는 "RDB 사진 + 그 뒤의 명령 로그"이고, 두 방식의 장점을 섞은 것이다.

## 무엇을 켤까
| 용도 | 권하는 설정 | 잃을 수 있는 것 |
| --- | --- | --- |
| 순수 캐시 | 둘 다 끄거나 RDB만 | 전부(다시 채움) |
| 세션·카운터 | AOF everysec | 1초 안쪽 |
| 유일한 원본 | AOF + 복제 + 백업 | 1초 안쪽(+복제 지연) |

어느 설정이든 디스크가 꽉 차거나 fork할 메모리가 모자라면 저장이 실패한다. `INFO persistence`의 `rdb_last_bgsave_status`, `aof_last_write_status`가 `ok`인지 감시해야 한다(10편). 그리고 디스크의 파일은 서버 한 대가 통째로 사라지면 함께 사라지므로, 복제(8편)와 다른 곳으로의 백업이 영속성의 나머지 절반이다.

## 흔한 오해
- "AOF를 켜면 데이터를 하나도 잃지 않는다": 기본 `everysec`은 최대 1초를 잃는다. `always`도 디스크와 운영체제가 정직할 때의 이야기다.
- "RDB 저장은 서버를 멈춘다": `BGSAVE`는 fork한 자식이 쓴다. 다만 fork 자체와 copy-on-write로 인한 메모리 증가는 큰 인스턴스에서 눈에 띄는 지연이 될 수 있다. 멈추는 것은 `SAVE` 명령이다.
- "영속성을 켰으니 백업은 필요 없다": 잘못된 명령(`FLUSHALL`)도 그대로 기록되고 복제된다. 시점별 백업이 따로 있어야 되돌릴 수 있다.

## 어디에 쓰이나
- PostgreSQL 실무 14편 「백업과 복구: pg_dump, WAL 아카이브, 시점 복구」: 스냅숏과 로그를 조합하는 생각을 관계형 데이터베이스는 더 정교하게 쓴다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: fork와 copy-on-write가 운영체제의 가상 메모리 위에서 어떻게 가능한지 이어진다.
- 메모리 시스템 9편 「플래시 저장 장치: NAND 셀, FTL, 쓰기 증폭」: fsync가 실제로 장치에 무엇을 시키는지, 왜 비싼지를 저장 장치 쪽에서 본다.

## 정리
- RDB는 fork와 copy-on-write로 메모리 전체의 사진을 찍는다. 작고 빨리 복원되지만 마지막 사진 뒤를 잃는다.
- AOF는 쓰기 명령을 덧붙이고 다시 실행해 복원한다. `everysec`이면 최대 1초를 잃는다.
- Redis 7의 AOF는 base(RDB 형식) + incr + manifest로 나뉘고, 커지면 다시 쓴다.
- 저장 실패를 감시하고, 복제와 별도 백업으로 서버 하나가 통째로 사라지는 경우에 대비한다.

## 더 알아보기
- 이전 글: 6편 「메시징: Pub/Sub과 스트림」
- 다음 글: 8편 「복제와 고가용성: 레플리카, 센티널, 클러스터」
