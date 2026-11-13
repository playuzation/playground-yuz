# [Redis 실무 8/10] 복제와 고가용성: 레플리카, 센티널, 클러스터

> **한 줄 요약** — 레플리카는 마스터의 쓰기를 비동기로 따라 하는 사본이고, 센티널은 마스터가 죽으면 다수결로 레플리카 하나를 새 마스터로 올리는 감시자이며, 클러스터는 키를 16384개 해시 슬롯으로 나눠 여러 마스터에 흩어 담아 메모리와 쓰기 처리량을 함께 늘린다.

## 이 글에서 다루는 것
- 서버 한 대의 세 가지 한계: 장애, 읽기 부하, 메모리 크기
- 레플리카: 비동기 복제와 그 의미, `WAIT`
- 센티널: 장애 감지와 자동 승격
- 클러스터: 해시 슬롯, MOVED 리다이렉트, 해시 태그
- 직접 해 보기: 복제, 장애 조치, 클러스터를 한 컴퓨터에서

## 서버 한 대의 한계
Redis 한 대에는 세 가지 한계가 있다. 그 한 대가 죽으면 서비스가 멈추고(**가용성**), 읽기 요청이 아무리 많아도 한 대가 다 받아야 하고(**읽기 부하**), 데이터는 그 한 대의 메모리를 넘을 수 없다(**용량**). 복제는 앞의 둘을, 클러스터는 세 번째를 푼다. 실습은 한 컴퓨터에서 포트만 바꿔 여러 서버를 띄운다.

## 레플리카: 따라 쓰는 사본
`--replicaof 마스터주소 포트`로 띄운 서버는 **레플리카**(replica)가 된다. 처음 연결하면 마스터가 전체 데이터를 RDB(7편)로 보내고, 그 뒤로는 마스터가 실행한 쓰기 명령을 흘려보낸다. 레플리카는 기본으로 읽기만 받는다.
```bash
redis-server --port 6390 --save "" --repl-diskless-sync-delay 0 > master.log 2>&1 &
redis-server --port 6391 --save "" --replicaof 127.0.0.1 6390 > replica.log 2>&1 &
until redis-cli -p 6391 info replication 2>/dev/null | grep -q 'master_link_status:up'; do sleep 0.2; done
m() { redis-cli -p 6390 --no-raw "$@"; }
s() { redis-cli -p 6391 --no-raw "$@"; }
m set product:1 coffee
m wait 1 1000
s get product:1
s set product:2 tea
s info replication | grep -E '^(role|master_link_status)'
```
```text
OK
(integer) 1
"coffee"
(error) READONLY You can't write against a read only replica.
role:slave
master_link_status:up
```
`WAIT 1 1000`은 "레플리카 1대가 지금까지의 쓰기를 받았다고 확인할 때까지 최대 1000ms 기다려라"이고, 1대가 확인했다는 뜻으로 1이 돌아왔다. 복제는 기본적으로 **비동기**다. 마스터는 쓰기를 받자마자 클라이언트에 OK를 주고 레플리카에는 뒤이어 보낸다. 그래서 마스터가 OK를 준 직후 죽으면 그 쓰기는 레플리카에 없을 수 있다. 꼭 필요한 쓰기만 `WAIT`로 확인하지만, 그래도 강한 일관성을 보장하지는 않는다. 레플리카에서 읽으면 방금 쓴 값이 아직 안 보일 수도 있다는 점(복제 지연)도 기억하자.

## 센티널: 마스터가 죽으면
레플리카가 있어도 마스터가 죽으면 누군가 레플리카를 마스터로 올리고, 다른 레플리카와 클라이언트에게 새 주소를 알려야 한다. 이 일을 자동으로 하는 감시 프로세스가 **센티널**(Sentinel)이다. 여러 센티널이 마스터를 지켜보다가, 정해진 수(quorum) 이상이 "응답이 없다"고 동의하면 장애로 판정하고, 그중 하나가 대표가 되어 레플리카 하나를 승격시킨다. 클라이언트는 마스터 주소를 직접 적지 않고 센티널에게 "지금 마스터가 누구인가"를 묻는다. 실습에서는 센티널 하나에 quorum 1로 줄였지만, 실제로는 센티널을 서로 다른 장비에 셋 이상 두어야 한쪽 네트워크만 끊긴 상황을 마스터 장애로 오판하지 않는다.
```bash
cat > sentinel.conf <<'EOF'
port 26390
sentinel monitor shop 127.0.0.1 6390 1
sentinel down-after-milliseconds shop 1000
sentinel failover-timeout shop 5000
EOF
redis-server sentinel.conf --sentinel > sentinel.log 2>&1 &
sleep 2
redis-cli -p 26390 sentinel get-master-addr-by-name shop | tail -1
m shutdown nosave                                  # 마스터가 죽었다
until [ "$(redis-cli -p 26390 sentinel get-master-addr-by-name shop | tail -1)" = 6391 ]; do sleep 0.5; done
redis-cli -p 26390 sentinel get-master-addr-by-name shop | tail -1
s info replication | grep '^role'
grep -oE '\+(sdown|odown|switch-master) .*' sentinel.log
```
```text
6390
6391
role:master
+sdown master shop 127.0.0.1 6390
+odown master shop 127.0.0.1 6390 #quorum 1/1
+switch-master shop 127.0.0.1 6390 127.0.0.1 6391
```
마스터가 1초 넘게 답하지 않자 센티널이 주관적 다운(`+sdown`), quorum이 동의한 객관적 다운(`+odown`)으로 판정하고, 레플리카(6391)를 마스터로 바꿨다(`+switch-master`). 이 실습에서는 몇 초 만에 끝났다. 그동안 들어온 쓰기는 실패하고, 비동기 복제 때문에 옛 마스터가 마지막에 받은 쓰기 일부는 잃을 수 있다. 클라이언트 라이브러리는 센티널에게 다시 물어 새 마스터로 다시 연결한다.
```bash
redis-cli -p 26390 shutdown > /dev/null 2>&1
s shutdown nosave
```

## 클러스터: 키를 슬롯으로 나누기
데이터가 한 대의 메모리를 넘으면 여러 마스터에 나눠 담아야 한다. **Redis 클러스터**는 모든 키를 0~16383번 **해시 슬롯** 중 하나에 배정한다(키 이름의 CRC16 값을 16384로 나눈 나머지). 슬롯은 마스터들이 구간으로 나눠 맡는다. 웹 앱의 원리 18편의 일관된 해싱과 목적이 같다. 서버를 늘리면 슬롯 일부만 옮기면 된다. 마스터 세 대로 클러스터를 만든다(실제로는 마스터마다 레플리카를 붙인다).
```bash
for p in 7001 7002 7003; do
  redis-server --port $p --cluster-enabled yes --cluster-config-file nodes-$p.conf \
    --save "" --appendonly no > node-$p.log 2>&1 &
done
sleep 1
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 \
  --cluster-replicas 0 --cluster-yes | grep 'slots:\[' | sort -u
sleep 1
c() { redis-cli -p 7001 --no-raw "$@"; }
c cluster info | grep -E '^(cluster_state|cluster_slots_assigned)'
```
```text
   slots:[0-5460] (5461 slots) master
   slots:[10923-16383] (5461 slots) master
   slots:[5461-10922] (5462 slots) master
cluster_state:ok
cluster_slots_assigned:16384
```
세 마스터가 16384개 슬롯을 약 5,461개씩 나눠 맡았다. 이제 키를 넣어 본다.
```bash
cc() { redis-cli -c -p 7001 --no-raw "$@"; }      # -c: MOVED를 따라간다
c cluster keyslot user:42
c set user:42 minji
cc set user:42 minji
cc get user:42
c cluster keyslot '{user:42}:cart'
cc mset '{user:42}:cart' 3 '{user:42}:points' 120
cc mset a 1 b 2
for p in 7001 7002 7003; do redis-cli -p $p shutdown nosave; done
```
```text
(integer) 15880
(error) MOVED 15880 127.0.0.1:7003
OK
"minji"
(integer) 15880
OK
(error) CROSSSLOT Keys in request don't hash to the same slot
```
`user:42`는 15880번 슬롯이고, 그 슬롯은 7003번 노드가 맡고 있다. 7001번에 보냈더니 "그 슬롯은 7003에 있다"는 `MOVED` 오류가 돌아왔다. 클러스터를 아는 클라이언트(`redis-cli -c`나 대부분의 라이브러리)는 이 응답을 보고 올바른 노드로 다시 보내고, 슬롯 지도를 기억해 다음부터는 바로 간다. 여러 키를 한 번에 다루는 명령(`MSET`, 트랜잭션, Lua)은 모든 키가 같은 슬롯에 있어야 한다. 키 이름의 `{…}` 부분만 해시하는 **해시 태그**를 쓰면 `{user:42}:cart`와 `{user:42}:points`가 같은 슬롯에 들어가 함께 다룰 수 있다. 태그 없는 `a`와 `b`는 다른 슬롯이라 거절되었다.

## 무엇을 고를까
| 필요 | 구성 | 주의 |
| --- | --- | --- |
| 장애 대비 | 마스터, 레플리카, 센티널 | 센티널은 셋 이상 |
| 읽기 분산 | 레플리카에서 읽기 | 복제 지연 |
| 용량·쓰기 확장 | 클러스터 | 여러 키 명령 제약 |

관리형 서비스(클라우드의 Redis 호환 서비스)를 쓰면 이 구성과 장애 조치를 서비스가 대신한다. 그래도 비동기 복제로 쓰기를 잃을 수 있다는 점, 장애 조치 동안 몇 초간 쓰기가 실패한다는 점은 그대로이므로 애플리케이션이 재시도와 재연결을 견뎌야 한다.

## 흔한 오해
- "레플리카가 있으면 데이터를 잃지 않는다": 복제는 비동기라 마스터가 OK를 준 쓰기가 레플리카에 닿기 전에 마스터가 죽으면 잃는다. 실수로 지운 데이터도 그대로 복제된다.
- "센티널 하나면 충분하다": 센티널 자신이 죽거나, 센티널과 마스터 사이 네트워크만 끊기면 오판한다. 서로 다른 장비의 셋 이상이 다수결로 판단해야 한다.
- "클러스터로 바꾸면 코드는 그대로다": 여러 키 명령, 트랜잭션, Lua 스크립트가 같은 슬롯 제약을 받는다. 해시 태그로 키를 다시 설계해야 할 때가 많다.

## 어디에 쓰이나
- 웹 앱의 원리 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」: 일관된 해싱과 해시 슬롯은 서버를 늘릴 때 옮기는 키를 줄인다는 같은 목표를 가진다.
- PostgreSQL 실무 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: 비동기·동기 복제와 장애 조치의 교환 관계를 관계형 데이터베이스 쪽에서 비교할 수 있다.
- 웹 앱의 원리 19편 「과부하를 막는 장치: 혼잡 제어, 레이트 리밋, 서킷 브레이커」: 장애 조치 중 실패하는 몇 초를 재시도와 지터로 견디는 방법이다.

## 정리
- 레플리카는 마스터의 쓰기를 비동기로 따라 한다. 읽기를 나누고 장애에 대비하지만, 복제 지연과 쓰기 유실이 있을 수 있다.
- 센티널은 다수결로 마스터 장애를 판정하고 레플리카를 승격시킨다. 클라이언트는 센티널에게 마스터를 묻는다.
- 클러스터는 키를 16384개 슬롯에 배정해 여러 마스터에 나눈다. 다른 노드의 슬롯이면 `MOVED`로 안내한다.
- 여러 키를 함께 다루려면 해시 태그로 같은 슬롯에 모은다.

## 더 알아보기
- 이전 글: 7편 「영속성: RDB 스냅숏과 AOF」
- 다음 글: 9편 「성능과 메모리: 파이프라이닝, 큰 키, 느린 명령」
