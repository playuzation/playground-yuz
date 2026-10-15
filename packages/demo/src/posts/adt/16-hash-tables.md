# [추상 데이터 타입 심화 16/21] 해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱

> **한 줄 요약** — 해시 테이블은 맵 ADT를 기대 O(1)에 구현하는데, 선형 탐사는 적재율이 높으면 군집으로 꼬리가 길고, 로빈 후드는 평균은 그대로 둔 채 최대·실패 탐사를 줄이며, 뻐꾸기 해싱은 조회를 최악 두 칸으로 묶는다.

## 이 글에서 다루는 것
- 맵 ADT, 체이닝과 개방 주소법, 선형 탐사의 군집
- 적재율별 탐사 길이 실험과 크누스의 공식
- 로빈 후드와 뒤로 당기기 삭제, 뻐꾸기 해싱의 재배치와 사이클
- 크기 늘리기, 묘비, 파이썬 dict

## 문제: 순서가 필요 없는 조회
사용자 ID별 요청 수를 세는 일은 **맵**(map) ADT의 put, get, delete다. 3부의 균형 트리는 O(log n)에 순서까지 주지만, 순서가 필요 없으면 해시 테이블이 기대 O(1)이다. 해시 함수가 키를 칸 번호로 고르게 흩는다는 가정이 핵심이다(이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」).

충돌은 칸마다 리스트를 두는 **체이닝**(chaining)이나, 배열 안의 다른 빈칸을 찾는 **개방 주소법**(open addressing)으로 다룬다. 후자는 연속 메모리를 훑어 캐시에 유리하다. 가장 단순한 **선형 탐사**(linear probing)는 빈칸까지 한 칸씩 옆으로 간다. 약점은 **군집**(clustering)이다. 덩어리에 떨어진 키는 끝까지 가야 하고 그 키가 덩어리를 더 키운다. 적재율 α에서 크누스(Knuth)가 구한 기대 탐사 수는 이렇다.
```text
성공 탐색 ≈ (1 + 1/(1−α)) / 2
실패 탐색 ≈ (1 + 1/(1−α)²) / 2
```

## 로빈 후드: 덜 밀려난 쪽이 양보한다
삽입 중인 키가 집(해시 칸)에서 d칸 떨어진 곳에 왔는데 칸 주인은 d보다 덜 밀려나 있다면, 자리를 빼앗고 쫓겨난 주인이 이어서 탐사한다. 셀리스(Pedro Celis)가 1986년 학위 논문에서 정리한 **로빈 후드 해싱**(Robin Hood hashing)이다. 누가 어느 칸에 앉든 차는 칸들은 같아서 거리의 합, 즉 평균 성공 탐사는 그대로고 분포만 바뀐다. 최댓값과 분산이 줄고, "주인의 거리가 내 거리보다 작으면 내 키는 없다"는 불변식으로 실패 탐색을 일찍 멈춘다.

선형 탐사에서 칸을 그냥 비우면 그 뒤의 키를 못 찾으므로 보통 **묘비**(tombstone, "지웠지만 탐사는 계속" 표시)를 남기지만, 로빈 후드는 **뒤로 당기기**(backward shift)를 쓴다. 지운 칸 뒤의 거리 1 이상인 키들을 한 칸씩 당긴다. 크기는 적재율 상한을 넘기 전에 2배로 늘려 다시 넣으며, 1편 「추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기」의 동적 배열처럼 분할 상환 O(1)이다. 내장 `hash()`는 문자열에서 실행마다 바뀌어 결정적 해시를 직접 만든다.

아래 코드는 칸 16,384개에 적재율 α만큼 키를 넣어 두 방식을 비교한다. 성공 탐사는 거리 + 1의 평균, 실패 탐사는 없는 키 2,000개를 찾을 때 본 칸 수다.
```python
import random

M64 = (1 << 64) - 1
def mix(x, seed=0):  # splitmix64식 결정적 64비트 해시
    x = (x + 0x9E3779B97F4A7C15 * (seed + 1)) & M64
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & M64
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & M64
    return x ^ (x >> 31)

PROBES = [0]

class LinearMap:  # 선형 탐사, robin=True면 로빈 후드
    LOAD = 0.95  # 적재율 상한(로빈 후드라 높게)
    def __init__(self, bits, robin=True):
        self.bits, self.robin, self.m, self.n = bits, robin, 1 << bits, 0
        self.slot = [None] * self.m  # (키, 값, 집에서 떨어진 거리)

    def put(self, k, v):
        if self.n + 1 > self.m * self.LOAD:  # 2배로 늘려 다시 넣기
            old = [e for e in self.slot if e]
            self.__init__(self.bits + 1, self.robin)
            for k2, v2, _ in old:
                self.put(k2, v2)
        i, d = mix(k) & (self.m - 1), 0
        while True:
            e = self.slot[i]
            if e is None:
                self.slot[i] = (k, v, d)
                self.n += 1
                return
            if e[0] == k:
                self.slot[i] = (k, v, e[2])
                return
            if self.robin and e[2] < d:  # 덜 밀려난 쪽이 양보
                self.slot[i] = (k, v, d)
                k, v, d = e
            i, d = (i + 1) & (self.m - 1), d + 1

    def find(self, k):  # 키가 있는 칸 번호 또는 None
        i, d = mix(k) & (self.m - 1), 0
        while True:
            PROBES[0] += 1
            e = self.slot[i]
            if e is None or (self.robin and e[2] < d):  # 일찍 멈춤
                return None
            if e[0] == k:
                return i
            i, d = (i + 1) & (self.m - 1), d + 1

    def delete(self, k):  # 로빈 후드용 뒤로 당기기(묘비 없음)
        i = self.find(k)
        if i is None:
            return
        j = (i + 1) & (self.m - 1)
        while self.slot[j] is not None and self.slot[j][2] > 0:
            k2, v2, d2 = self.slot[j]
            self.slot[i] = (k2, v2, d2 - 1)
            i, j = j, (j + 1) & (self.m - 1)
        self.slot[i] = None
        self.n -= 1

print("α     성공  공식  최대:선형 로빈  실패:선형 로빈  공식")
for a in [0.5, 0.7, 0.8, 0.9, 0.95]:
    rng = random.Random(int(a * 100))
    ks = [rng.getrandbits(62) for _ in range(int(a * (1 << 14)))]
    absent = [rng.getrandbits(62) | 1 << 62 for _ in range(2000)]
    row = []
    for robin in (False, True):
        t = LinearMap(14, robin)
        for k in ks:
            t.put(k, 0)
        ds = [e[2] + 1 for e in t.slot if e]
        PROBES[0] = 0
        any(t.find(k) for k in absent)  # 모두 None
        row.append((sum(ds) / len(ds), max(ds), PROBES[0] / 2000))
    (s1, x1, u1), (s2, x2, u2) = row
    fs, fu = (1 + 1 / (1 - a)) / 2, (1 + 1 / (1 - a) ** 2) / 2
    print(f"{a:<4} {s1:5.2f} {fs:5.2f} {x1:9} {x2:4}"
          f" {u1:10.1f} {u2:5.1f} {fu:5.1f}  {s1 == s2}")
```
```text
α     성공  공식  최대:선형 로빈  실패:선형 로빈  공식
0.5   1.48  1.50        21    9        2.6   1.8   2.5  True
0.7   2.25  2.17        76   19        6.5   2.6   6.1  True
0.8   3.07  3.00       124   19       13.7   3.5  13.0  True
0.9   4.79  5.50       299   25       35.9   5.3  50.5  True
0.95  9.37 10.50      1256   40      149.3  10.1 200.5  True
```
평균 성공 탐사는 두 방식이 정확히 같다(마지막 열). 높은 α에서 공식과 어긋나는 것은 공식이 무한히 큰 테이블의 근사이고 측정이 한 번뿐이라서다. 차이는 꼬리다. α = 0.95에서 최대 탐사는 1,256칸 대 40칸, 실패 탐색은 149칸 대 10칸이다. 그래도 α가 1에 가까우면 둘 다 느려져 상한을 둔다(위 구현은 0.95).

## 뻐꾸기 해싱: 조회는 최악에도 두 칸
파그(Rasmus Pagh)와 로들러(Flemming Rodler)가 2001년 발표한 **뻐꾸기 해싱**(cuckoo hashing)은 표 두 개와 해시 함수 두 개를 두고, 키 k를 표 0의 h₀(k)칸이나 표 1의 h₁(k)칸에만 둔다. 조회·삭제는 두 칸만 보면 되어 최악 O(1)이다. 삽입은 h₀(k)칸의 주인을 쫓아내 그 주인의 다른 표 칸으로 보내기를 빈칸에 닿을 때까지 반복한다. 쫓아내기가 상한을 넘으면 사이클로 보고 새 해시 함수와 2배 크기로 다시 짓는다. 적재율이 50% 미만이면 삽입은 기대 O(1)이다. 앞 코드에 이어서 실행한다.
```python
MAX_KICKS = 64

class CuckooMap:  # 표 두 개, 키마다 후보 칸 두 개
    def __init__(self, bits=3, seed=0, grow=True):
        self.bits, self.seed, self.grow, self.n = bits, seed, grow, 0
        self.t = [[None] * (1 << bits) for _ in range(2)]

    def pos(self, k, s):  # 표 s에서 키 k의 칸
        return mix(k, 2 * self.seed + s) & ((1 << self.bits) - 1)

    def get(self, k):  # 최악에도 두 칸만 본다
        for s in (0, 1):
            e = self.t[s][self.pos(k, s)]
            if e and e[0] == k:
                return e[1]

    def put(self, k, v):
        for s in (0, 1):  # 이미 있으면 값만 바꾼다
            i = self.pos(k, s)
            if self.t[s][i] and self.t[s][i][0] == k:
                self.t[s][i] = (k, v)
                return True
        e, s = (k, v), 0
        for _ in range(MAX_KICKS):
            i = self.pos(e[0], s)
            e, self.t[s][i] = self.t[s][i], e  # 자리를 빼앗는다
            if e is None:
                self.n += 1
                return True
            s = 1 - s  # 쫓겨난 키는 다른 표의 자기 칸으로
        if not self.grow:
            return False  # 실험용: 실패만 알린다
        items = [x for tb in self.t for x in tb if x] + [e]
        self.__init__(self.bits + 1, self.seed + 1)  # 사이클: 2배로
        for k, v in items:
            self.put(k, v)

print("적재율  다시 짓기 없이 성공(20번 중)")
for a in [0.3, 0.4, 0.45, 0.5, 0.55]:
    succ = 0
    for trial in range(20):
        rng, t = random.Random(trial), CuckooMap(11, trial, False)
        succ += all(t.put(rng.getrandbits(62), 0)
                    for _ in range(int(a * 4096)))
    print(f"{a:<6} {succ}")
```
```text
적재율  다시 짓기 없이 성공(20번 중)
0.3    20
0.4    20
0.45   20
0.5    15
0.55   1
```
표 두 개 × 2,048칸에 다시 짓기 없이 넣으면 45%까지는 20번 모두 성공하지만 50%를 넘으면 사이클로 실패가 급증한다. 그래서 실무에서는 상한을 두고 미리 늘린다. 칸 하나에 키를 4개쯤 두는 버킷 변형은 90% 넘게 채울 수 있고, 17편 「블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합」의 뻐꾸기 필터가 이 방식이다.

## 모델 기반 무작위 대조
앞 코드에 이어서, 작은 키 범위로 덮어쓰기와 삭제를 자주 일으키며 두 구현을 dict와 함께 돌리고, 불변식(로빈 후드: 저장된 거리가 실제 거리이고 거리 d인 키의 앞 칸은 거리 d − 1 이상, 뻐꾸기: 키가 자기 후보 칸에 있음)도 검사한다.
```python
def rh_ok(t):
    return all(e is None or (mix(e[0]) - i + e[2]) % t.m == 0 and
               (e[2] == 0 or (t.slot[i - 1] or (0, 0, -9))[2] >= e[2] - 1)
               for i, e in enumerate(t.slot))

def ck_ok(c):
    return all(e is None or c.pos(e[0], s) == i
               for s in (0, 1) for i, e in enumerate(c.t[s]))

rng, ok = random.Random(16), 0
for case in range(300):
    rh, ck, ref, ref2, same = LinearMap(2), CuckooMap(2), {}, {}, True
    for _ in range(150):
        op, k, v = rng.randrange(3), rng.randrange(40), rng.random()
        if op == 0:
            rh.put(k, v); ck.put(k, v); ref[k] = ref2[k] = v
        elif op == 1:
            rh.delete(k); ref.pop(k, None)
        i = rh.find(k)
        same &= (None if i is None else rh.slot[i][1]) == ref.get(k)
        same &= ck.get(k) == ref2.get(k)
        same &= rh_ok(rh) and ck_ok(ck) and rh.n == len(ref)
    ok += same
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 파이썬 dict는 무엇을 하나
CPython `Objects/dictobject.c`의 주석에 따르면 dict는 개방 주소법이고, 3.6부터 삽입 순서대로 쌓는 항목 배열과 항목 번호를 담는 작은 해시 테이블을 따로 둔다. 탐사는 매번 `perturb >>= 5` 한 뒤 `j = (5·j + 1 + perturb) mod 2ⁱ`로 고른다. 작은 정수의 해시는 자기 자신이라 perturb(처음엔 해시값)로 위쪽 비트를 섞고, perturb가 0이 되면 `5·j + 1` 순환이 모든 칸을 돈다. 지운 칸은 묘비(`DKIX_DUMMY`)로 남기고, 항목 배열(인덱스 테이블 크기의 2/3, `USABLE_FRACTION`)이 다 차면 새로 만든다.

## 복잡도
| 구현 | 조회(기대) | 조회(최악) |
|---|---|---|
| 체이닝 | O(1 + α) | O(n) |
| 선형 탐사 | 실패 O(1/(1−α)²) | O(n) |
| 로빈 후드 | 실패도 성공 수준 | O(n), 실제로 작음 |
| 뻐꾸기 | O(1) | 두 칸 |

- 삽입은 모두 기대 O(1)(늘리기는 분할 상환), 공간은 O(n)이다.

## 어디에 쓰이나
- 게임 자원 관리 7편 「공간 분할 1: 균일 격자와 공간 해싱」: 격자 좌표를 해시해 칸을 찾는 공간 해싱이 이 테이블 위에서 돈다.
- 알고리즘 기법 14편 「무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기」: 공격자가 입력을 고르면 기대 O(1)이 O(n)이 되는데, 그 글의 무작위 시드가 대책이다.
- 러스트 표준 `HashMap`은 1.36(2019년)에 SwissTable 계열인 hashbrown으로 바뀌기 전까지 로빈 후드 해싱을 썼다.

## 정리
- 선형 탐사는 군집 때문에 높은 적재율에서 꼬리가 길다(α = 0.95에서 최대 1,256칸).
- 로빈 후드는 평균은 그대로 두고 최대·실패 탐사를 줄이며, 뒤로 당기기로 묘비 없이 지운다.
- 뻐꾸기 해싱은 조회가 최악 두 칸이고, 적재율 50% 근처에서 실패가 급증한다.
- 파이썬 dict는 perturb 탐사와 묘비를 쓰고 2/3에서 늘린다.

## 더 알아보기
- 이전 글: 15편 「반 엠데 보아스 트리: 정수 키를 O(log log U)에」
- 다음 글: 17편 「블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합」
- 위키백과 Cuckoo hashing: https://en.wikipedia.org/wiki/Cuckoo_hashing
