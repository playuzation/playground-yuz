# [추상 데이터 타입 심화 18/21] 스트림 요약 구조: 카운트-민 스케치와 하이퍼로그로그

> **한 줄 요약** — 다 저장할 수 없는 스트림에서 빈도는 카운트-민 스케치가 카운터 표 d×w로 "절대 적게 세지 않고 εN 넘게 더 세지도 않을 확률 1−δ"로, 서로 다른 원소 수는 하이퍼로그로그가 레지스터 m개로 표준 오차 약 1.04/√m로 근사하며, 둘 다 표를 합치기만 하면 분산 집계가 된다.

## 이 글에서 다루는 것
- 빈도 질의와 서로 다른 원소 수(cardinality) ADT, 정확한 방법의 메모리
- 카운트-민 스케치의 ε·δ 보장과 실험, 무거운 원소 찾기
- 하이퍼로그로그의 선행 0 개수·조화 평균·작은 범위 보정과 표준 오차 실험
- 병합 가능성과 모델 기반 대조

## 문제: 요청 20만 건을 한 번만 보고
웹 서버 로그가 끝없이 흘러온다. 묻고 싶은 것은 둘이다. "IP x는 몇 번 왔나"(빈도)와 "오늘 서로 다른 IP는 몇 개인가"(카디널리티). 정확한 답은 `Counter`나 `set`으로 내지만 메모리가 서로 다른 원소 수에 비례한다. IP가 수억 개면 서버 한 대에 못 담고, 서버 100대의 결과를 합치려면 집합을 통째로 보내야 한다.

**스트림 요약**(streaming sketch)은 원소를 저장하지 않고 고정 크기의 표만 갱신하는 ADT다. 연산은 add(x)와 질의, 그리고 같은 설정의 두 요약을 합치는 merge다. 대가는 근사이고, 오차를 확률로 보장한다. 확률 도구는 확률과 분포 시리즈를 참조하면 된다.

## 카운트-민 스케치
코르모드(Graham Cormode)와 무투크리슈난(S. Muthukrishnan)이 2005년 발표한 **카운트-민 스케치**(Count-Min sketch)는 d행 w열의 카운터 표다. 행마다 독립 해시를 하나씩 두고, add(x)는 각 행에서 x의 칸을 1 올린다. 질의는 x의 칸 d개 중 최솟값이다.

한 칸에는 x의 빈도와 같은 칸에 떨어진 다른 원소들의 빈도가 섞이므로 행마다 값은 참값 이상이고, 최솟값도 **절대 적게 세지 않는다**. 더 센 양은 이렇게 묶인다.
```text
X = 한 행에서 x 칸에 섞인 남의 빈도
E[X] ≤ N/w ≤ εN/e  (w = ⌈e/ε⌉)
P(X > εN) ≤ 1/e  (마르코프 부등식)
d행 모두 넘을 확률 ≤ e^(−d) ≤ δ
```
즉 w = ⌈e/ε⌉, d = ⌈ln(1/δ)⌉로 잡으면 확률 1 − δ 이상으로 `참값 ≤ 추정 ≤ 참값 + εN`이다(N은 전체 개수). 메모리는 원소 수와 무관하게 O((1/ε)·log(1/δ))다.

**무거운 원소**(heavy hitter), 즉 빈도가 φN 이상인 원소는 add할 때마다 추정을 보고 φ·(지금까지의 N) 이상이면 후보에 넣은 뒤, 끝에서 다시 걸러 찾는다. 추정이 적게 세지 않으니 진짜 무거운 원소는 빠지지 않는다. 아래는 원소 10⁶종에서 지프 분포(인기 순위 i의 빈도 ∝ 1/i¹·¹)로 뽑은 20만 건이다. 내장 `hash()`는 문자열에서 실행마다 바뀌므로 결정적 해시를 쓴다.
```python
import math, random
from collections import Counter

M64 = (1 << 64) - 1
def mix(x, seed=0):  # splitmix64식 결정적 64비트 해시
    x = (x + 0x9E3779B97F4A7C15 * (seed + 1)) & M64
    x = ((x ^ (x >> 30)) * 0xBF58476D1CE4E5B9) & M64
    x = ((x ^ (x >> 27)) * 0x94D049BB133111EB) & M64
    return x ^ (x >> 31)

class CountMin:
    def __init__(self, eps, delta):
        self.w = math.ceil(math.e / eps)
        self.d = math.ceil(math.log(1 / delta))
        self.t = [[0] * self.w for _ in range(self.d)]
    def add(self, x, c=1):
        for r in range(self.d):
            self.t[r][mix(x, r) % self.w] += c
    def est(self, x):  # 행마다 과대 추정, 그중 최솟값
        return min(self.t[r][mix(x, r) % self.w] for r in range(self.d))

rng, K, N = random.Random(18), 10**6, 200000
stream = rng.choices(range(K), [1 / (i + 1) ** 1.1 for i in range(K)], k=N)
cm, true, cand = CountMin(0.002, 0.05), Counter(), {}
for i, x in enumerate(stream, 1):
    cm.add(x); true[x] += 1
    if cm.est(x) >= 0.005 * i:  # 무거운 원소 후보
        cand[x] = True
err = [cm.est(x) - c for x, c in true.items()]
print("w, d =", cm.w, cm.d, "/ 카운터", cm.w * cm.d,
      "/ 서로 다른 원소", len(true))
print("과소 추정:", sum(e < 0 for e in err), "/ 최대 오차:", max(err),
      "/ εN =", 0.002 * N)
print(f"오차 ≤ εN 비율: {sum(e <= 0.002 * N for e in err) / len(err):.4f}")
heavy = {x for x, c in true.items() if c >= 0.005 * N}
found = {x for x in cand if cm.est(x) >= 0.005 * N}
print("무거운 원소(≥0.5%):", len(heavy), "찾음:", len(found),
      "모두 포함:", heavy <= found)
```
```text
w, d = 1360 3 / 카운터 4080 / 서로 다른 원소 41397
과소 추정: 0 / 최대 오차: 509 / εN = 400.0
오차 ≤ εN 비율: 0.9999
무거운 원소(≥0.5%): 17 찾음: 19 모두 포함: True
```
카운터 4,080개로 서로 다른 원소 41,397개의 빈도를 답했다. 적게 센 원소는 없고, εN = 400을 넘은 원소는 보장(5% 이하)보다 훨씬 적은 0.01%다. 무거운 원소는 17개 모두 찾았고, 추정이 부풀려진 2개가 더 섞였다. 변형으로, add할 때 최솟값인 칸들만 올리는 **보수적 갱신**(conservative update)은 과대 추정을 더 줄이지만 빼기(음수 갱신)를 못 한다.

## 하이퍼로그로그
서로 다른 원소 수는 빈도처럼 더해 갈 수 없다. 같은 원소가 다시 와도 답이 그대로여야 하기 때문이다. 플라졸레(Philippe Flajolet) 외가 2007년 발표한 **하이퍼로그로그**(HyperLogLog, HLL)는 해시값의 모양만 본다. 해시가 고르면 "선행 0이 r − 1개 이상"일 확률은 2^(−(r−1))이라, 서로 다른 원소 n개 중 가장 긴 선행 0이 약 log₂ n개다. 같은 원소는 같은 해시를 내니 중복은 자동으로 무시된다.
```text
해시 앞 p비트 → 레지스터 번호 j
나머지의 선행 0 개수 + 1 → ρ
M[j] = max(M[j], ρ)
E = αₘ·m² / Σ 2^(−M[j])
```
레지스터 하나는 운에 크게 흔들리므로 m = 2ᵖ개로 나눠 각자 최댓값을 기록하고, 2^M[j]들의 **조화 평균**으로 합친다. 조화 평균은 운 좋게 큰 레지스터 몇 개에 덜 휘둘린다. αₘ ≈ 0.7213/(1 + 1.079/m)는 편향 보정 상수다. n이 m에 비해 작으면 빈 레지스터가 많아 이 식이 크게 틀리므로, E ≤ 2.5m이고 빈 레지스터 V개가 있으면 **선형 계수**(linear counting) m·ln(m/V)를 쓴다. 표준 오차는 약 1.04/√m다. 앞 코드에 이어서 p = 10(레지스터 1,024개)으로 n마다 30번 재 본다.
```python
class HLL:
    def __init__(self, p):
        self.p, self.m = p, 1 << p
        self.reg = [0] * self.m
    def add(self, x):
        h = mix(x, 99)
        j, rest = h >> (64 - self.p), h & ((1 << (64 - self.p)) - 1)
        rho = (64 - self.p) - rest.bit_length() + 1  # 선행 0 + 1
        self.reg[j] = max(self.reg[j], rho)
    def raw(self):
        alpha = 0.7213 / (1 + 1.079 / self.m)
        return alpha * self.m ** 2 / sum(2.0 ** -r for r in self.reg)
    def count(self):
        e, zeros = self.raw(), self.reg.count(0)
        if e <= 2.5 * self.m and zeros:  # 작은 범위: 선형 계수
            return self.m * math.log(self.m / zeros)
        return e

print("이론 표준 오차 1.04/√1024 =", f"{1.04 / 32:.4f}")
print("     n  보정전/n   평균/n  RMS 상대오차")
rng = random.Random(5)
for n in [100, 1000, 10000, 30000]:
    raws, ests = [], []
    for t in range(30):
        h, base = HLL(10), rng.getrandbits(40) << 20
        for x in range(base, base + n):
            h.add(x)
        raws.append(h.raw() / n); ests.append(h.count() / n)
    rms = math.sqrt(sum((e - 1) ** 2 for e in ests) / 30)
    print(f"{n:6} {sum(raws) / 30:9.3f} {sum(ests) / 30:8.3f} {rms:11.4f}")
```
```text
이론 표준 오차 1.04/√1024 = 0.0325
     n  보정전/n   평균/n  RMS 상대오차
   100     7.872    1.007      0.0212
  1000     1.330    1.003      0.0289
 10000     0.997    0.997      0.0357
 30000     0.995    0.995      0.0325
```
n = 100이면 보정 전 식은 참값의 약 8배를 내지만 선형 계수가 이를 바로잡는다. n이 m보다 충분히 크면 상대 오차가 이론값 3.25% 근처다. ρ가 64 − p + 1을 넘지 않아 레지스터는 6비트면 충분하므로 1,024개가 768바이트이고, 이 크기로 수십억까지 센다.

## 병합과 모델 기반 대조
두 서버의 스케치는 칸별로 더하면(카운트-민), 레지스터별로 최댓값을 취하면(HLL) 두 스트림을 이어 붙인 스트림의 스케치와 **정확히 같다**. 해시가 같으니 각 칸에 들어갈 값이 같기 때문이다. 앞 코드에 이어서, 무작위 스트림을 두 쪽으로 나눠 넣고 (1) 병합 결과가 전체 스트림의 스케치와 같은지, (2) 카운트-민이 어떤 원소도 적게 세지 않는지, (3) HLL 오차가 3σ(σ = 1.04/√256 = 6.5%) 안인지 센다.
```python
rng, same, within = random.Random(9), 0, 0
for case in range(200):
    A, B, AB = (CountMin(0.05, 0.05) for _ in range(3))
    ha, hb, hab = HLL(8), HLL(8), HLL(8)
    true, R = Counter(), rng.choice([100, 1000, 100000])
    for _ in range(rng.randrange(1, 2000)):
        x = rng.randrange(R)
        side = rng.random() < 0.5
        (A if side else B).add(x); (ha if side else hb).add(x)
        AB.add(x); hab.add(x); true[x] += 1
    mc = [[a + b for a, b in zip(p, q)] for p, q in zip(A.t, B.t)]
    mh = [max(a, b) for a, b in zip(ha.reg, hb.reg)]
    same += mc == AB.t and mh == hab.reg and \
        all(AB.est(x) >= c for x, c in true.items())
    within += abs(hab.count() / len(true) - 1) <= 3 * 1.04 / 16
print(f"무작위 200개: 병합 일치·과소 추정 없음 {same}개, HLL 3σ 안 {within}개")
```
```text
무작위 200개: 병합 일치·과소 추정 없음 200개, HLL 3σ 안 200개
```

## 자주 하는 실수와 변형
- 카운트-민의 행들이 같은 해시(같은 시드)를 쓰면 d행이 한 행과 같아져 δ 보장이 사라진다.
- HLL에 작은 범위 보정을 빼면 원소가 적을 때 몇 배로 틀린다(위 실험의 7.87배). 하이퍼로그로그++ 같은 변형은 이 구간의 편향을 실험값 표로 더 보정한다.
- 해시가 약하면(예: 정수를 그대로 쓰기) 선행 0 분포가 무너진다. 64비트로 고르게 섞는다.
- 변형: 카운트 스케치는 행마다 ±1 부호를 곱하고 중앙값을 취해 편향 없는 추정을 낸다. 서로 다른 원소 수를 정확한 작은 집합에서 시작해 커지면 HLL로 바꾸는 하이브리드도 흔하다.

## 복잡도
| 구조 | 갱신·질의 | 메모리 |
|---|---|---|
| Counter·set | 기대 O(1) | O(서로 다른 원소 수) |
| 카운트-민 | O(log(1/δ)) | O((1/ε)·log(1/δ)) |
| HLL | 갱신 O(1), 질의 O(m) | O(m)개 6비트 |

- 카운트-민 오차: 확률 1 − δ로 εN 이하. HLL 표준 오차: 약 1.04/√m. 병합은 각각 O(d·w), O(m)이다.

## 어디에 쓰이나
- Redis의 `PFADD`·`PFCOUNT`가 하이퍼로그로그다. 공식 문서는 최대 12KB로 표준 오차 0.81%라고 하는데, 1.04/√16384 ≈ 0.81%이고 6비트 × 16,384 = 12KB라 레지스터 2¹⁴개와 맞는다.
- 확률과 분포 4편 「확률 변수와 기댓값」: 카운트-민의 오차 상한은 기댓값의 선형성과 마르코프 부등식 한 줄이다.
- 통계학 3편 「추정량의 성질: 편향과 분산」: αₘ와 작은 범위 보정은 편향을, 1.04/√m은 추정량의 표준 오차를 다루는 그 글의 개념 그대로다.
- 17편 「블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합」: 같은 "해시 칸 공유" 구조로, 블룸은 한쪽(거짓 양성)으로만, 카운트-민은 한쪽(과대 추정)으로만 틀린다.

## 정리
- 카운트-민은 d×w 표의 최솟값으로 빈도를 적게 세지 않고, w = ⌈e/ε⌉·d = ⌈ln(1/δ)⌉이면 확률 1 − δ로 오차 εN 이하다.
- 실험에서 카운터 4,080개로 41,397종의 빈도를 답했고, 무거운 원소를 모두 찾았다.
- HLL은 선행 0 개수의 최댓값을 레지스터 m개에 모아 조화 평균으로 합치고, 작은 범위는 선형 계수로 보정한다. 오차는 이론값 1.04/√m과 맞았다.
- 둘 다 병합이 칸별 합·최댓값이라 분산 집계에 그대로 쓴다.

## 더 알아보기
- 이전 글: 17편 「블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합」
- 다음 글: 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」
- 위키백과 HyperLogLog: https://en.wikipedia.org/wiki/HyperLogLog
