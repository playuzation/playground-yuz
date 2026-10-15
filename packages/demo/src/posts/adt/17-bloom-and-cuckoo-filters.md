# [추상 데이터 타입 심화 17/21] 블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합

> **한 줄 요약** — "확실히 없음"과 "아마 있음"만 답하는 집합 ADT는 거짓 양성을 조금 허용하는 대신 원소를 저장하지 않아 원소당 10비트 안팎으로 1% 오차를 내며, 블룸 필터는 비트 k개를 켜고 뻐꾸기 필터는 짧은 지문을 뻐꾸기 해싱으로 저장해 삭제까지 지원한다.

## 이 글에서 다루는 것
- 거짓 양성만 허용하는 집합 ADT와 정확한 집합의 메모리 비용
- 블룸 필터의 거짓 양성률 (1 − e^(−kn/m))ᵏ, 최적 k, 실험 비교
- 카운팅 블룸 필터와 뻐꾸기 필터의 삭제, 지문 길이와 공간 비교
- 모델 기반 대조: 넣은 원소는 절대 놓치지 않는가

## 문제: 없는 키 때문에 디스크를 읽지 않기
디스크에 키 10억 개가 흩어진 저장소에서 조회의 상당수가 없는 키라면, 매번 디스크를 읽어 "없음"을 확인하는 것이 가장 큰 낭비다. 메모리에 키 집합을 두면 되지만 64비트 키만 저장해도 원소당 64비트, 파이썬 set은 그 몇 배다. 그런데 이 용도에는 정확한 답이 필요 없다. "확실히 없음"만 틀리지 않으면, "아마 있음"이 가끔 틀려도 디스크를 한 번 더 읽을 뿐이다.

이것이 **근사 멤버십**(approximate membership) ADT다. 연산은 add(x)와 query(x)이고, 넣은 원소에 대해 query는 항상 참(거짓 음성 없음)이며, 넣지 않은 원소에 참이라 답할 확률이 **거짓 양성률**(false positive rate) ε 이하다.

## 블룸 필터: 비트 m개와 해시 k개
버턴 블룸(Burton Bloom)이 1970년에 발표한 **블룸 필터**(Bloom filter)는 0으로 채운 비트 m개와 해시 함수 k개를 둔다. add(x)는 k개 위치의 비트를 켜고, query(x)는 k개가 모두 켜졌는지 본다. 넣은 원소의 비트는 꺼질 일이 없으니 거짓 음성은 없다. 넣지 않은 원소는 k개 위치가 우연히 다른 원소들 때문에 모두 켜졌을 때만 틀린다.
```text
비트 하나가 0으로 남을 확률
(1 − 1/m)^(kn) ≈ e^(−kn/m)
ε ≈ (1 − e^(−kn/m))ᵏ
최적 k = (m/n)·ln 2
그때 ε ≈ 0.6185^(m/n)
원소당 비트 m/n ≈ 1.44·log₂(1/ε)
```
k가 작으면 검사할 비트가 적어 잘 걸러지지 않고, 크면 비트가 너무 많이 켜진다. 최적 k에서는 비트의 절반이 켜진다. 해시 k개는 64비트 해시 하나를 반으로 갈라 `a + i·b`로 만드는 **이중 해싱**으로 충분하다(커시-미첸마허 2006). 내장 `hash()`는 문자열에서 실행마다 바뀌므로 결정적 해시를 직접 쓴다.
```python
import math, random

M64 = (1 << 64) - 1
def mix(x):  # splitmix64식 결정적 64비트 해시
    x = (x + 0x9E3779B97F4A7C15) & M64
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & M64
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & M64
    return x ^ (x >> 31)

class Bloom:
    def __init__(self, m, k):
        self.m, self.k, self.bits = m, k, bytearray((m + 7) // 8)
    def spots(self, x):  # 해시 하나로 위치 k개(이중 해싱)
        h = mix(x)
        a, b = h & 0xFFFFFFFF, h >> 32 | 1
        return [(a + i * b) % self.m for i in range(self.k)]
    def add(self, x):
        for p in self.spots(x):
            self.bits[p >> 3] |= 1 << (p & 7)
    def __contains__(self, x):
        return all(self.bits[p >> 3] >> (p & 7) & 1 for p in self.spots(x))

n, rng = 5000, random.Random(17)
members = [rng.getrandbits(62) for _ in range(n)]
others = [rng.getrandbits(62) | 1 << 62 for _ in range(40000)]
print("m/n  k  실측(%) 공식(%)")
for bpe, k in [(10, 1), (10, 3), (10, 7), (10, 12), (5, 3), (15, 10)]:
    bf = Bloom(bpe * n, k)
    for x in members:
        bf.add(x)
    assert all(x in bf for x in members)  # 거짓 음성은 없다
    fp = sum(x in bf for x in others) / len(others)
    th = (1 - math.exp(-k / bpe)) ** k
    print(f"{bpe:3} {k:2} {100 * fp:7.3f} {100 * th:7.3f}")
```
```text
m/n  k  실측(%) 공식(%)
 10  1   9.545   9.516
 10  3   1.745   1.741
 10  7   0.935   0.819
 10 12   1.370   1.356
  5  3   9.305   9.185
 15 10   0.083   0.074
```
원소 5,000개, 없는 키 40,000개로 쟀다. 원소당 10비트에서 k = 7(≈ 10·ln 2)이 가장 낮아 약 0.9%이고, k가 1이나 12면 나빠진다. 원소당 15비트면 0.1% 아래로 내려간다. 실측은 공식과 대체로 맞고, 공식이 근사라 실측이 조금 높게 나오기도 한다.

## 삭제: 카운팅 블룸 필터
블룸 필터는 지울 수 없다. 비트 하나를 여러 원소가 함께 켰을 수 있어서, 끄면 다른 원소가 거짓 음성이 된다. **카운팅 블룸 필터**(counting Bloom filter)는 비트 대신 작은 카운터(보통 4비트)를 두고 add에 1을 더하고 remove에 1을 뺀다. 메모리는 4배가 되고, 넣은 적 없는 원소를 지우면 남의 카운터를 깎아 거짓 음성이 생긴다. 카운터가 넘칠 만큼 차면 그 칸은 더 이상 줄이지 않는다.

## 뻐꾸기 필터: 지문을 뻐꾸기 해싱으로
판(Bin Fan)·앤더슨·카민스키·미첸마허가 2014년 발표한 **뻐꾸기 필터**(cuckoo filter)는 원소 대신 f비트 **지문**(fingerprint)을 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」의 버킷형 뻐꾸기 해싱으로 저장한다. 버킷마다 칸이 4개다. 문제는 원소가 없으니 쫓겨난 지문의 다른 버킷을 원래 해시로 다시 계산할 수 없다는 것이다. 그래서 다른 버킷을 **지문만으로** 정한다.
```text
i₁ = hash(x) mod M
i₂ = i₁ XOR hash(지문) mod M
```
XOR는 두 번 하면 원래대로라 어느 버킷에 있든 `i XOR hash(지문)`이 다른 쪽이다(M은 2의 거듭제곱). 조회는 두 버킷에서 지문을 찾고, 삭제는 지문 하나를 지운다. 넣지 않은 원소는 두 버킷의 지문 최대 8개 중 하나와 우연히 같을 때 틀리므로 ε ≈ 2b·α/2ᶠ다(b = 4, α = 적재율). 앞 코드에 이어서, 버킷 4,096개를 첫 실패 직전까지 채우고 지문 길이별로 잰다.
```python
class CuckooFilter:  # 버킷 2^bbits개 × 칸 4개, 지문 f비트
    def __init__(self, bbits, f, seed=0):
        self.mask, self.f, self.n = (1 << bbits) - 1, f, 0
        self.b = [[] for _ in range(1 << bbits)]
        self.rng = random.Random(seed)
    def where(self, x):  # (0이 아닌 지문, 첫 버킷)
        h = mix(x)
        return (h >> 32) % ((1 << self.f) - 1) + 1, h & self.mask
    def alt(self, i, fp):  # 지문만으로 다른 버킷을 안다
        return i ^ (mix(fp) & self.mask)
    def add(self, x):
        fp, i = self.where(x)
        for j in (i, self.alt(i, fp)):
            if len(self.b[j]) < 4:
                self.b[j].append(fp); self.n += 1
                return True
        for _ in range(500):  # 둘 다 차면 칸 하나를 쫓아낸다
            s = self.rng.randrange(4)
            fp, self.b[j][s] = self.b[j][s], fp
            j = self.alt(j, fp)
            if len(self.b[j]) < 4:
                self.b[j].append(fp); self.n += 1
                return True
        return False  # 가득 참(쫓겨난 지문 하나를 잃는다)
    def remove(self, x):  # 넣은 적 있는 x만 지운다
        fp, i = self.where(x)
        for j in (i, self.alt(i, fp)):
            if fp in self.b[j]:
                self.b[j].remove(fp); self.n -= 1
                return
    def __contains__(self, x):
        fp, i = self.where(x)
        return fp in self.b[i] or fp in self.b[self.alt(i, fp)]

print(" f  적재율  실측(%)  공식(%)  비트/원소")
for f in (6, 8, 12):
    rng = random.Random(f)
    xs = [rng.getrandbits(62) for _ in range(4 << 12)]
    cf = CuckooFilter(12, f)
    full = next(i for i, x in enumerate(xs) if not cf.add(x))
    cf = CuckooFilter(12, f)  # 같은 시드로 실패 직전까지만 다시
    for x in xs[:full]:
        cf.add(x)
    a = cf.n / (4 << 12)
    assert all(x in cf for x in xs[:full])
    fp = sum(rng.getrandbits(62) | 1 << 62 in cf
             for _ in range(40000)) / 40000
    th = 8 * a / ((1 << f) - 1)
    print(f"{f:2} {a:7.3f} {100 * fp:8.3f} {100 * th:8.3f} {f / a:9.2f}")
```
```text
 f  적재율  실측(%)  공식(%)  비트/원소
 6   0.964   11.107   12.241      6.22
 8   0.971    2.893    3.048      8.24
12   0.969    0.200    0.189     12.38
```
버킷당 4칸이면 95% 넘게 채운 뒤에야 첫 실패가 난다. 지문 8비트면 원소당 약 8.2비트로 거짓 양성 약 2.9%, 12비트면 0.2%다.

## 어느 쪽이 작은가
목표 ε에 필요한 원소당 비트 수를 계산해 보자. 블룸은 1.44·log₂(1/ε), 뻐꾸기는 ε ≈ 8/2ᶠ에서 f = log₂(1/ε) + 3을 적재율 0.955로 나눈다. 논문의 **세미 정렬**(semi-sorting)은 버킷 안 지문 순서를 압축해 원소당 1비트를 더 아낀다.
```python
print("ε      블룸  뻐꾸기  세미정렬")
for eps in (0.1, 0.03, 0.01, 0.001, 0.0001):
    L = math.log2(1 / eps)
    print(f"{eps:<6} {1.44 * L:5.1f} {(L + 3) / 0.955:7.1f}"
          f" {(L + 2) / 0.955:8.1f}")
```
```text
ε      블룸  뻐꾸기  세미정렬
0.1      4.8     6.6      5.6
0.03     7.3     8.4      7.4
0.01     9.6    10.1      9.1
0.001   14.4    13.6     12.5
0.0001  19.1    17.1     16.0
```
기본 뻐꾸기 필터는 ε가 약 0.4%보다 작을 때, 세미 정렬판은 약 2.5%보다 작을 때 블룸보다 작아진다. 논문이 말하는 "3% 미만이면 블룸 필터보다 공간을 덜 쓴다"는 세미 정렬을 넣은 경우와 맞는다. 조회도 블룸은 메모리 k곳, 뻐꾸기는 버킷 두 곳만 읽는다.

## 모델 기반 대조
앞 코드에 이어서, 카운팅 블룸 필터를 만들고 두 삭제 가능 필터를 정답 다중집합(`Counter`)과 함께 돌린다. 넣고 지우기를 섞되 넣은 원소만 지우고, 매 연산 뒤 "들어 있는 원소는 모두 참"인지 본다. 뻐꾸기 필터는 같은 원소를 두 버킷 칸 수(8개)보다 많이 넣을 수 없으므로 원소당 2개까지만 넣는다.
```python
from collections import Counter

class CountingBloom(Bloom):  # 비트 대신 4비트 카운터(0~15)
    def __init__(self, m, k):
        self.m, self.k, self.cnt = m, k, bytearray(m)
    def add(self, x):
        for p in self.spots(x):
            self.cnt[p] = min(self.cnt[p] + 1, 15)
    def remove(self, x):
        for p in self.spots(x):
            if self.cnt[p] < 15:  # 넘친 칸은 줄이지 않는다
                self.cnt[p] -= 1
    def __contains__(self, x):
        return all(self.cnt[p] for p in self.spots(x))

rng, ok = random.Random(7), 0
for case in range(300):
    cb, cf = CountingBloom(256, 3), CuckooFilter(6, 8)
    ref, same = Counter(), True
    for _ in range(150):
        x = rng.randrange(60)
        if rng.random() < 0.55 and ref[x] < 2 and ref.total() < 40:
            cb.add(x); same &= cf.add(x); ref[x] += 1
        elif ref[x]:
            cb.remove(x); cf.remove(x); ref[x] -= 1
        same &= all(y in cb and y in cf for y in ref if ref[y])
    ok += same and cf.n == ref.total()
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 자주 하는 실수와 변형
- 넣은 적 없는 원소를 지우면 카운팅 블룸·뻐꾸기 필터 모두 거짓 음성이 생긴다. "지워도 되는지"는 필터가 아니라 바깥에서 확인해야 한다.
- 블룸 필터는 n을 미리 정해야 한다. 원소가 늘면 ε가 급히 나빠지므로 다시 짓거나, 필터를 층층이 추가하는 확장형을 쓴다.
- 해시 k개가 서로 상관되면 공식보다 나빠진다. 실험처럼 공식과 맞는지 재 본다.
- 뻐꾸기 필터의 버킷 수 M이 작으면 두 버킷이 같아지거나(hash(지문) mod M = 0) 후보가 겹치는 일이 잦아 일찍 가득 찬다. 처음에 대조 검사를 버킷 16개로 돌렸다가 적재율 60% 안팎에서 삽입이 실패해 64개로 늘렸다.
- 변형: m·k·해시가 같은 두 블룸 필터의 합집합은 비트 OR로 바로 된다. 비트를 블록 하나(캐시 줄)에 몰아 메모리 접근을 한 번으로 줄인 블록 블룸 필터도 흔하다.

## 복잡도
| 구조 | add·query | 원소당 비트(ε=1%) |
|---|---|---|
| 정확한 집합 | 기대 O(1) | 64 이상 |
| 블룸 | O(k) | 약 9.6 |
| 카운팅 블룸 | O(k) | 약 38 |
| 뻐꾸기 필터 | 조회 O(1), 삽입 기대 O(1) | 약 10.1 |

- 블룸의 k는 (m/n)·ln 2라 상수이고, 뻐꾸기 필터 조회는 버킷 두 개(지문 8개) 비교다. 삭제는 카운팅 블룸 O(k), 뻐꾸기 O(1)이다.

## 어디에 쓰이나
- 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: 정렬 파일마다 블룸 필터를 두어 없는 키의 디스크 읽기를 건너뛴다. LevelDB 헤더 주석은 키당 10비트로 거짓 양성 약 1%를 권한다.
- 미적분 4편 「지수 함수와 로그 함수」: `(1 − 1/m)^(kn) ≈ e^(−kn/m)` 근사와 최적 k를 구하는 미분이 그 글의 지수·로그 성질이다.
- 문자열 알고리즘 1편 「문자열 해싱과 라빈-카프」: 뻐꾸기 필터의 지문은 짧은 해시로 원소를 대신하는 것이라, 지문 충돌 확률 계산이 그 글의 해시 충돌 분석과 같다.

## 정리
- 거짓 양성만 허용하면 원소를 저장하지 않고 원소당 약 1.44·log₂(1/ε)비트로 집합을 표현한다.
- 블룸 필터의 실측 거짓 양성률은 (1 − e^(−kn/m))ᵏ와 대체로 맞았고, 원소당 10비트·k = 7에서 약 0.9%였다.
- 삭제는 카운팅 블룸(메모리 4배)이나 뻐꾸기 필터(지문 + XOR로 정한 다른 버킷)로 한다.
- 뻐꾸기 필터는 95% 넘게 채울 수 있고, 낮은 ε에서 블룸보다 작다.

## 더 알아보기
- 이전 글: 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」
- 다음 글: 18편 「스트림 요약 구조: 카운트-민 스케치와 하이퍼로그로그」
- 위키백과 Bloom filter: https://en.wikipedia.org/wiki/Bloom_filter
