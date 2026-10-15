# [추상 데이터 타입 심화 21/21] LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기

> **한 줄 요약** — LSM 트리는 제자리에서 고치는 대신 쓰기를 메모리의 정렬 구조에 모았다가 불변 정렬 파일로 내려 쓰고 백그라운드 병합으로 정리해, 쓰기를 순차 I/O로 바꾸는 대가로 읽기·공간 증폭을 받아들이고, 병합 정책과 블룸 필터로 그 균형을 고른다.

## 이 글에서 다루는 것
- 쓰기 위주 저장소에서 B-트리 제자리 갱신의 비용
- 멤테이블, 불변 정렬 파일(SSTable), 병합(compaction), 삭제 표시
- 레벨링과 티어링: 쓰기·읽기·공간 증폭을 시뮬레이션으로 세기
- 블룸 필터로 없는 키 읽기 줄이기, 모델 기반 대조

## 문제: 초당 수만 건의 작은 쓰기
로그, 시계열, 메시지 저장소는 읽기보다 쓰기가 훨씬 많다. 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」의 B-트리는 키 하나를 고칠 때 그 키가 든 블록을 통째로 읽고 써야 한다. 100바이트 레코드 때문에 4KB 블록을 쓰면 실제 쓴 양이 수십 배이고, 위치가 무작위라 무작위 쓰기가 된다. ADT는 여전히 정렬 맵(put, get, delete, 범위 scan)이지만 비용 모델이 "실제 디스크 쓰기 양"으로 바뀐다.

오닐(Patrick O'Neil) 외가 1996년 발표한 **LSM 트리**(log-structured merge-tree)는 쓰기를 고치지 않고 쌓는다.
```text
쓰기
↓
멤테이블 (메모리, 정렬 유지)
↓ 가득 차면 통째로 내려 쓰기
L0 런 (불변 정렬 파일)
↓ 병합 (compaction)
L1 런 (T배 크기)
↓ 병합
L2 런 (T²배 크기)
```
- **멤테이블**(memtable): 최근 쓰기를 모으는 메모리의 정렬 구조다. 10편 「스킵 리스트: 동전 던지기로 만드는 균형」이 흔히 쓰이고, 장애에 대비해 쓰기 로그(WAL)에도 순차로 남긴다.
- **SSTable**(sorted string table): 멤테이블이 차면 키 순으로 한 번에 써 내리는 불변 파일, 즉 **런**(run)이다. 한 번 쓰면 고치지 않는다.
- **병합**(compaction): 런들을 합병 정렬의 합치기처럼 이어 읽어 큰 런 하나로 다시 쓴다. 같은 키는 가장 새 값만 남긴다.
- **삭제 표시**(tombstone): 지우기도 "이 키는 지워짐"이라는 쓰기다. 옛 런에 남은 값을 가리기 위해서이고, 더 아래에 데이터가 없는 맨 아래 레벨로 병합될 때에야 버린다.

읽기는 멤테이블 → 새 런 → 옛 런 순으로 찾아 처음 만난 값을 쓰고, 범위 scan은 모든 레벨의 해당 구간을 합친다.

## 병합 정책: 레벨링과 티어링
- **레벨링**(leveling): 레벨 i에는 런을 하나만 두고 크기 한도를 cap·Tⁱ⁺¹로 둔다. 새 데이터가 오면 그 레벨의 런과 합치고, 한도를 넘으면 통째로 아래 레벨과 합친다. 레벨마다 런이 하나라 읽기가 싸지만, 같은 데이터를 레벨마다 여러 번 다시 쓴다.
- **티어링**(tiering, 크기별 병합): 레벨마다 런을 T개까지 그냥 쌓고, T개가 되면 한꺼번에 합쳐 아래 레벨의 런 하나로 보낸다. 레벨마다 한 번만 다시 쓰니 쓰기가 싸지만, 읽을 런이 많고 같은 키의 옛 값이 오래 남는다.

아래 구현은 런을 정렬된 리스트로, 디스크 쓰기를 "쓴 항목 수"로 센다. 런마다 17편 「블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합」의 블룸 필터(키당 10칸, 해시 7개)를 둔다. 내장 `hash()` 대신 결정적 해시를 쓴다.
```python
import bisect, random

M64 = (1 << 64) - 1
def mix(x):  # splitmix64식 결정적 64비트 해시
    x = (x + 0x9E3779B97F4A7C15) & M64
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & M64
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & M64
    return x ^ (x >> 31)

class Bloom:  # 키당 10칸, 해시 7개
    def __init__(self, keys):
        self.m = max(8, 10 * len(keys))
        self.b = bytearray(self.m)
        for x in keys:
            for p in self.spots(x):
                self.b[p] = 1
    def spots(self, x):
        h = mix(x)
        return [(h + i * (h >> 32 | 1)) % self.m for i in range(7)]
    def may(self, x):
        return all(self.b[p] for p in self.spots(x))

TOMB = None  # 삭제 표시(톰스톤)

class Run:  # 불변 정렬 파일(SSTable)
    def __init__(self, items):
        self.keys = [k for k, _ in items]
        self.vals = [v for _, v in items]
        self.bloom = Bloom(self.keys)

def merge(lists, drop):  # 새것부터 받은 정렬 목록들을 하나로
    d = {}
    for items in reversed(lists):  # 오래된 것부터 덮어쓴다
        d.update(items)
    return [(k, v) for k, v in sorted(d.items())
            if not (drop and v is TOMB)]

class LSM:
    def __init__(self, cap=100, T=4, policy="level"):
        self.mem, self.cap, self.T, self.policy = {}, cap, T, policy
        self.levels = []  # levels[i] = 런 목록(새것부터)
        self.written = self.reads = 0
        self.use_bloom = True

    def put(self, k, v):
        self.mem[k] = v
        if len(self.mem) >= self.cap:  # 멤테이블이 차면 내려 쓴다
            self.push(0, sorted(self.mem.items()))
            self.mem = {}

    def push(self, i, items):  # 레벨 i로 정렬된 항목을 내려보낸다
        if i == len(self.levels):
            self.levels.append([])
        lv = self.levels[i]
        bottom = all(not l for l in self.levels[i + 1:])  # 아래가 비었나
        old = [list(zip(r.keys, r.vals)) for r in lv]
        if self.policy == "level":  # 런 하나, 한도 cap·Tⁱ⁺¹
            items = merge([items] + old, bottom)
            lv.clear()
            if len(items) > self.cap * self.T ** (i + 1):
                return self.push(i + 1, items)
        elif len(lv) == self.T - 1:  # 런 T개가 모이면 합쳐 내림
            lv.clear()
            return self.push(i + 1, merge([items] + old, bottom))
        self.written += len(items)
        lv.insert(0, Run(items))

    def get(self, k):
        if k in self.mem:
            return self.mem[k]
        for lv in self.levels:
            for r in lv:  # 새 런부터
                if self.use_bloom and not r.bloom.may(k):
                    continue  # 확실히 없다: 읽지 않는다
                self.reads += 1
                i = bisect.bisect_left(r.keys, k)
                if i < len(r.keys) and r.keys[i] == k:
                    return r.vals[i]
        return None

    def scan(self, a, b):  # [a, b)의 살아 있는 키와 값
        d = {}
        for lv in reversed(self.levels):
            for r in reversed(lv):  # 오래된 런부터 덮어쓴다
                i = bisect.bisect_left(r.keys, a)
                j = bisect.bisect_left(r.keys, b)
                d.update(zip(r.keys[i:j], r.vals[i:j]))
        d.update((k, v) for k, v in self.mem.items() if a <= k < b)
        return sorted((k, v) for k, v in d.items() if v is not TOMB)

db = LSM(cap=4, T=2)
for k in [5, 1, 9, 3, 7, 1, 2, 8, 6]:
    db.put(k, f"v{k}")
db.put(9, TOMB)  # 9 삭제
print([[r.keys for r in lv] for lv in db.levels], db.mem)
print(db.get(1), db.get(9), db.scan(2, 8))
```
```text
[[[1, 2, 3, 5, 7, 8, 9]]] {6: 'v6', 9: None}
v1 None [(2, 'v2'), (3, 'v3'), (5, 'v5'), (6, 'v6'), (7, 'v7')]
```
9는 아직 런에 값이 남아 있지만 멤테이블의 삭제 표시가 가려서 보이지 않는다.

## 증폭 세기
앞 코드에 이어서, 키 5,000개에 쓰기 2만 번(10%는 삭제)을 멤테이블 100칸, T = 4로 넣고 세 가지 증폭을 잰다. **쓰기 증폭**은 디스크에 쓴 항목 수 ÷ 사용자 쓰기 수, **공간 증폭**은 디스크의 항목 수 ÷ 살아 있는 키 수, **읽기 증폭**은 조회 한 번에 실제로 읽은 런 수다.
```python
print("방식   쓰기증폭 공간증폭 레벨별런  읽은 런: 있는 키, 없는 키, 블룸 없이")
for policy in ("level", "tier"):
    rng, db, live = random.Random(21), LSM(100, 4, policy), {}
    for _ in range(20000):
        k = rng.randrange(5000)
        if rng.random() < 0.1:
            db.put(k, TOMB); live.pop(k, None)
        else:
            db.put(k, 1); live[k] = 1
    disk = sum(len(r.keys) for lv in db.levels for r in lv)
    absent = range(10**6, 10**6 + 2000)
    res = []
    for keys, bloom in ((list(live)[:2000], True), (absent, True),
                        (absent, False)):
        db.use_bloom, db.reads = bloom, 0
        for k in keys:
            db.get(k)
        res.append(f"{db.reads / 2000:.2f}")
    print(f"{policy:6} {db.written / 20000:8.2f} {disk / len(live):8.2f}",
          [len(lv) for lv in db.levels], ", ".join(res))
```
```text
방식   쓰기증폭 공간증폭 레벨별런  읽은 런: 있는 키, 없는 키, 블룸 없이
level      4.90     1.25 [1, 1, 1] 0.99, 0.04, 3.00
tier       2.60     2.50 [1, 1, 0, 3] 1.00, 0.05, 5.00
```
레벨링은 쓰기 증폭이 약 2배 크지만 공간 증폭은 1.25로, 위 레벨들이 맨 아래의 1/(T − 1) 정도라는 어림(약 1.33)에 가깝다. 티어링은 쓰기가 싼 대신 같은 키의 옛 값이 여러 런에 남아 공간이 2.5배다. 블룸 필터가 없으면 없는 키를 찾을 때 모든 런(레벨링 3개, 티어링 5개)을 읽지만, 있으면 거짓 양성(약 1%)만큼만 읽어 0.04~0.05런이다. 있는 키는 거의 정확히 런 하나만 읽는다. 범위 scan에는 블룸 필터가 소용없어 런 수가 그대로 비용이다.

## 모델 기반 무작위 대조
앞 코드에 이어서, 작은 멤테이블과 T로 병합을 자주 일으키며 두 정책을 dict와 함께 돌린다. 매번 get을, 가끔 scan을 비교하고 불변식(런은 키 순·중복 없음, 레벨링은 레벨당 런 하나와 크기 한도, 티어링은 런 T개 미만)을 검사한다.
```python
def check(db):
    for i, lv in enumerate(db.levels):
        if any(a >= b for r in lv for a, b in zip(r.keys, r.keys[1:])):
            return False
        if db.policy == "level" and (len(lv) > 1 or
                lv and len(lv[0].keys) > db.cap * db.T ** (i + 1)):
            return False
        if db.policy == "tier" and len(lv) >= db.T:
            return False
    return True

rng, ok = random.Random(5), 0
for case in range(300):
    policy = ("level", "tier")[case % 2]
    db, ref, same = LSM(rng.randint(2, 6), rng.randint(2, 4), policy), {}, True
    for _ in range(150):
        k, u = rng.randrange(40), rng.random()
        if u < 0.5:
            db.put(k, u); ref[k] = u
        elif u < 0.7:
            db.put(k, TOMB); ref.pop(k, None)
        q = rng.randrange(40)
        same &= db.get(q) == ref.get(q) and check(db)
        if u > 0.95:
            a = rng.randrange(40)
            same &= db.scan(a, a + 10) == sorted(
                (x, y) for x, y in ref.items() if a <= x < a + 10)
    ok += same
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 자주 하는 실수와 변형
- 삭제 표시를 맨 아래가 아닌 병합에서 버리면 아래 런의 옛 값이 되살아난다. 위 `bottom` 검사가 그것을 막고, 대조 검사가 삭제를 섞는 이유다.
- 읽기에서 런을 새것부터 보지 않으면 옛 값을 돌려준다.
- 쓰기가 병합 속도를 넘으면 L0 런이 쌓여 읽기가 느려지므로, 실제 엔진은 쓰기를 늦추거나 멈춘다.
- 변형: 실제 엔진은 레벨 전체가 아니라 파일 하나와 아래 레벨의 겹치는 파일만 골라 조금씩 병합한다. 위 레벨은 티어링, 맨 아래 레벨만 레벨링으로 섞기도 한다.

## 복잡도
| 지표 | 레벨링 | 티어링 |
|---|---|---|
| 쓰기 증폭 | O(T·L) | O(L) |
| 점 조회 런 수 | O(L) | O(T·L) |
| 공간 증폭 | 약 1 + 1/(T − 1) | 최대 약 T |

- L ≈ log_T(n/cap)은 레벨 수다. 블룸 필터가 있으면 없는 키의 점 조회는 런 수 × ε번만 읽는다.
- B-트리는 갱신마다 블록 하나(무작위 I/O)를 다시 쓰고 조회는 O(log_B n) 블록이다. LSM은 쓰기를 순차 I/O로 모아 쓰는 대신 조회 때 여러 런을 본다.

## 어디에 쓰이나
- LevelDB 설계 문서는 레벨 L+1이 L의 10배이고 L0만 파일끼리 겹친다고 설명하며, 멤테이블은 스킵 리스트이고 키당 10비트(약 1%) 블룸 필터 정책을 제공한다. 그 갈래인 RocksDB도 기본 멤테이블이 스킵 리스트다.
- Apache Cassandra는 크기별 병합(SizeTieredCompactionStrategy)이 기본이고, 읽기가 많거나 갱신·삭제가 잦으면 레벨 병합(LeveledCompactionStrategy)을 권한다.
- 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」: 병합은 합병 정렬의 합치기 단계를 디스크 위에서 되풀이하는 것이다.
- 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: 같은 정렬 맵 ADT를 블록 접근 수가 아닌 쓰기 양에 최적화하면 이 구조가 된다.

## 정리
- LSM 트리는 쓰기를 멤테이블에 모아 불변 정렬 파일로 내려 쓰고 병합으로 정리해, 무작위 쓰기를 순차 쓰기로 바꾼다.
- 삭제도 쓰기(삭제 표시)이고, 맨 아래로 병합될 때에야 버린다.
- 시뮬레이션에서 레벨링은 쓰기 증폭 4.9·공간 증폭 1.25, 티어링은 2.6·2.5로 맞바꿈이 보였다.
- 블룸 필터는 없는 키 조회의 읽는 런을 3~5개에서 0.05개 안팎으로 줄였다.

## 더 알아보기
- 이전 글: 20편 「로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스」
- 처음 글: 1편 「추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기」
- 위키백과 Log-structured merge-tree: https://en.wikipedia.org/wiki/Log-structured_merge-tree
