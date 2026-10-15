# [심화 알고리즘 13/14] 선형 점화식: 벌레캄프-매시와 키타마사

> **한 줄 요약** — k차 선형 점화식을 따르는 수열은 소수 법에서 앞 2k항만 주면 벌레캄프-매시가 가장 짧은 점화식을 O(k²)에 찾아 주고, N번째 항은 xᴺ을 특성 다항식으로 나눈 나머지를 구하는 키타마사 방법으로 O(k² log N)에 얻어 행렬 거듭제곱의 O(k³ log N)보다 k/2배쯤 적은 곱셈으로 끝난다.

## 이 글에서 다루는 것
- 점화식이 숨은 수열: 도미노 타일링 수
- 벌레캄프-매시: 불일치를 이전 실패로 지우며 가장 짧은 식 찾기, 2k항이 필요한 이유
- 키타마사: xᴺ mod f(x)의 계수로 N번째 항 구하기
- 행렬 거듭제곱과 곱셈 횟수 비교, 무작위 대조

## 예제 문제: 4×n 판의 도미노 타일링
4×n 판을 2×1 도미노로 덮는 방법의 수를 n = 10¹⁸에 대해 998244353으로 나눈 나머지로 구하라. 열마다 "다음 열로 튀어나온 칸"을 비트마스크로 들고 가는 DP는 작은 n을 쉽게 세지만, 10¹⁸열을 하나씩 갈 수는 없다.

상태가 16개인 DP의 한 단계는 16×16 행렬 곱이라 수학·기하 알고리즘 3편 「빠른 거듭제곱과 행렬 거듭제곱」의 행렬 거듭제곱으로 풀린다. 그런데 이 수열은 사실 4차 **선형 점화식** `aₙ = r₁aₙ₋₁ + … + rₖaₙ₋ₖ`를 따른다. 그 식을 앞의 항에서 자동으로 찾으면 4차 크기로 계산할 수 있다. 점화식에 대응하는 **특성 다항식**은 `f(x) = xᵏ − r₁xᵏ⁻¹ − … − rₖ`다.

## 벌레캄프-매시: 가장 짧은 점화식 찾기
벌레캄프(Elwyn Berlekamp)가 1968년 책 「Algebraic Coding Theory」에서 BCH 부호 복호용으로 냈고, 매시(James Massey)가 1969년에 이것이 수열을 만드는 가장 짧은 선형 되먹임 시프트 레지스터(LFSR), 곧 가장 짧은 선형 점화식을 찾는 방법임을 보였다.

항을 하나씩 읽으며 지금까지의 항을 모두 만드는 식 C(길이 L)를 유지한다.
- 새 항 sᵢ에서 C의 예측과 실제의 차, **불일치**(discrepancy) d를 계산한다. d = 0이면 그대로 간다.
- d ≠ 0이면, 예전에 식이 실패했던 순간(m칸 전, 그때 불일치 b)의 식 B를 꺼낸다. B는 그 위치에서만 틀렸으므로, `C ← C − (d/b)·xᵐ·B`로 빼면 i에서의 불일치가 지워지고 앞의 항은 그대로 맞는다.
- 길이는 `L ← max(L, i + 1 − L)`로 늘어난다. 이 규칙으로 얻은 식이 가장 짧다는 것이 매시의 정리다.

d/b를 계산하려면 나눗셈이 필요해 소수 법에서 한다(수학·기하 알고리즘 1편 「유클리드 호제법과 확장 유클리드: 모듈러 역원 구하기」). 그리고 k차 점화식은 앞 **2k항**이 있어야 하나로 정해진다. 항이 그보다 적으면 주어진 항은 다 맞추지만 뒤가 틀린 식도 나올 수 있다.
```python
MOD = 998244353

def tilings(rows, cols):                  # rows×i 판을 도미노로 덮는 수, i < cols
    def fill(r, cur, nxt, out):           # 열 하나를 채우는 모든 방법
        if r == rows:
            out.append(nxt)
        elif cur >> r & 1:
            fill(r + 1, cur, nxt, out)
        else:
            fill(r + 1, cur, nxt | 1 << r, out)       # 가로: 다음 열로 튀어나감
            if r + 1 < rows and not cur >> (r + 1) & 1:
                fill(r + 2, cur, nxt, out)            # 세로
    trans = {m: [] for m in range(1 << rows)}
    for m in trans:
        fill(0, m, 0, trans[m])
    dp, seq = {0: 1}, []
    for _ in range(cols):
        seq.append(dp.get(0, 0))
        new = {}
        for m, c in dp.items():
            for m2 in trans[m]:
                new[m2] = (new.get(m2, 0) + c) % MOD
        dp = new
    return seq

def berlekamp_massey(s):                  # a_n = Σ rec[j−1]·a_(n−j)인 가장 짧은 rec
    C, B, L, m, b = [1], [1], 0, 1, 1     # C: 현재 식, B: 마지막 실패 직전의 식
    for i in range(len(s)):
        d = s[i]
        for j in range(1, L + 1):         # 불일치: 지금 식의 예측과 실제의 차
            d = (d + C[j] * s[i - j]) % MOD
        if d == 0:
            m += 1
            continue
        coef, T = d * pow(b, MOD - 2, MOD) % MOD, C[:]
        C += [0] * (len(B) + m - len(C))
        for j in range(len(B)):           # B를 m칸 밀어 빼서 불일치를 없앤다
            C[j + m] = (C[j + m] - coef * B[j]) % MOD
        if 2 * L <= i:                    # 식의 길이를 늘려야 하는 경우
            L, B, b, m = i + 1 - L, T, d, 1
        else:
            m += 1
    return [(-c) % MOD for c in C[1:L + 1]]

def signed(v):
    return [x if x <= MOD // 2 else x - MOD for x in v]

seq = tilings(4, 12)
print("4×n 타일링", seq)
for k in [6, 7, 8, 12]:
    print(f"앞 {k:>2}항으로 찾은 식", signed(berlekamp_massey(seq[:k])))
```
```text
4×n 타일링 [1, 1, 5, 11, 36, 95, 281, 781, 2245, 6336, 18061, 51205]
앞  6항으로 찾은 식 [-249561087, -374341628, -374341632]
앞  7항으로 찾은 식 [-249561087, 311951365, 93585408, 93585407]
앞  8항으로 찾은 식 [1, 5, 1, -1]
앞 12항으로 찾은 식 [1, 5, 1, -1]
```
6항, 7항만 주면 주어진 항을 다 맞추는 엉뚱한 식이 나오고, 8 = 2·4항부터 `aₙ = aₙ₋₁ + 5aₙ₋₂ + aₙ₋₃ − aₙ₋₄`로 고정된다. 검산하면 a₄ = 11 + 5·5 + 1 − 1 = 36이다. DP 상태는 16개였지만 점화식은 4차로, 행렬보다 훨씬 작다.

## 키타마사: xᴺ을 f(x)로 나눈 나머지
점화식은 "xⁿ을 r₁xⁿ⁻¹ + … + rₖxⁿ⁻ᵏ로 바꿔도 된다"는 말과 같다. 다항식 xⁱ에 수 aᵢ를 대응시키는 선형 함수 φ를 생각하면, `φ(xʲ·f(x)) = aⱼ₊ₖ − r₁aⱼ₊ₖ₋₁ − … − rₖaⱼ = 0`이다. 그래서 f의 배수는 φ에서 0이 되고, xᴺ 대신 그 나머지만 계산하면 된다.
```text
xᴺ = q(x)·f(x) + c(x), deg c < k
c(x) = c₀ + c₁x + … + cₖ₋₁xᵏ⁻¹
⇒ a_N = c₀a₀ + c₁a₁ + … + cₖ₋₁aₖ₋₁
```
xᴺ mod f는 빠른 거듭제곱으로 구한다. 곱셈 한 번이 다항식 곱 k²과 차수 낮추기 k²이고 log N번이라 O(k² log N)이다. 경시 프로그래밍에서는 흔히 키타마사(Kitamasa) 방법이라 부른다. 같은 a_N을 동반 행렬의 거듭제곱으로도 구해 곱셈 횟수를 센다. 앞 코드에 이어서 실행한다.
```python
import random

ops = {"kitamasa": 0, "matrix": 0}        # 곱셈 횟수

def kitamasa(rec, init, N):               # a_N = Σ cᵢ·aᵢ, x^N mod f(x)의 계수 cᵢ
    L = len(rec)
    def reduce(p):                        # x^k = Σ rec[j−1]·x^(k−j)로 차수 낮추기
        for k in range(len(p) - 1, L - 1, -1):
            if p[k]:
                for j in range(1, L + 1):
                    p[k - j] = (p[k - j] + p[k] * rec[j - 1]) % MOD
                ops["kitamasa"] += L
        return (p + [0] * L)[:L]
    def mul(p, q):
        prod = [0] * (2 * L - 1)
        for i in range(L):
            for j in range(L):
                prod[i + j] = (prod[i + j] + p[i] * q[j]) % MOD
        ops["kitamasa"] += L * L
        return reduce(prod)
    res, base = reduce([1]), reduce([0, 1])   # 1과 x (mod f)
    while N:                              # 빠른 거듭제곱
        if N & 1:
            res = mul(res, base)
        base, N = mul(base, base), N >> 1
    return sum(c * a for c, a in zip(res, init)) % MOD

def matrix_term(rec, init, N):            # 수학·기하 알고리즘 3편의 방법(비교용)
    L = len(rec)
    def mm(A, B):
        ops["matrix"] += L ** 3
        return [[sum(A[i][t] * B[t][j] for t in range(L)) % MOD
                 for j in range(L)] for i in range(L)]
    M = [rec[:]] + [[int(j == i) for j in range(L)] for i in range(L - 1)]
    R = [[int(i == j) for j in range(L)] for i in range(L)]
    while N:
        if N & 1:
            R = mm(R, M)
        M, N = mm(M, M), N >> 1
    v = init[::-1]                        # [a_(L−1), …, a_0]
    return sum(R[L - 1][j] * v[j] for j in range(L)) % MOD

rec = berlekamp_massey(seq)
print("a_11 =", kitamasa(rec, seq[:4], 11), "/ 직접 계산", seq[11])
N = 10**18
print("a_(10¹⁸) mod p:", kitamasa(rec, seq[:4], N),
      matrix_term(rec, seq[:4], N))
rng = random.Random(3)
for L in [4, 16, 64]:
    rec = [rng.randrange(MOD) for _ in range(L)]
    init = [rng.randrange(MOD) for _ in range(L)]
    ops["kitamasa"] = ops["matrix"] = 0
    assert kitamasa(rec, init, N) == matrix_term(rec, init, N)
    print(f"k={L:<3} 키타마사 {ops['kitamasa']:>11,}  행렬 {ops['matrix']:>13,}")
```
```text
a_11 = 51205 / 직접 계산 51205
a_(10¹⁸) mod p: 567476562 567476562
k=4   키타마사       2,320  행렬         5,376
k=16  키타마사      40,480  행렬       344,064
k=64  키타마사     654,592  행렬    22,020,096
```
두 방법의 a_(10¹⁸)이 같다. 곱셈 횟수 비는 k = 4, 16, 64에서 2.3배, 8.5배, 34배로 대략 k/2배다. 행렬 곱은 k³, 다항식 곱과 나머지는 합쳐 2k²이기 때문이다.

## 무작위 대조 검사
앞 코드에 이어서, 차수 1~6의 무작위 점화식 500개(절반은 0이 많은 퇴화 사례)로 60항을 직접 계산하고, 앞 2k항으로 찾은 식의 재현, 키타마사와 직접 계산, 큰 N에서 행렬 방법과의 일치를 본다.
```python
rng = random.Random(13)
shorter = 0
for _ in range(500):
    k = rng.randint(1, 6)
    small = rng.random() < 0.5            # 0이 많은 퇴화 사례도 섞는다
    pick = (lambda: rng.randrange(3)) if small else (lambda: rng.randrange(MOD))
    rec, s = [pick() for _ in range(k)], [pick() for _ in range(k)]
    while len(s) < 60:                    # 직접 계산(정의 그대로)
        s.append(sum(r * s[-j] for j, r in enumerate(rec, 1)) % MOD)
    found = berlekamp_massey(s[:2 * k])   # 앞 2k항만 보고 찾기
    L = len(found)
    assert L <= k and all(s[n] == sum(found[j - 1] * s[n - j]
                          for j in range(1, L + 1)) % MOD
                          for n in range(L, 60))
    shorter += L < k
    if L:
        n = rng.randrange(60)
        assert kitamasa(found, s[:L], n) == s[n]
        big = rng.randrange(10**18)
        assert kitamasa(rec, s[:k], big) == matrix_term(rec, s[:k], big)
print("무작위 500개: 찾은 식이 60항 모두 재현, 키타마사·행렬 일치")
print("원래보다 짧은 식이 나온 경우", shorter)
```
```text
무작위 500개: 찾은 식이 60항 모두 재현, 키타마사·행렬 일치
원래보다 짧은 식이 나온 경우 48
```
48개는 마지막 계수가 0이거나 초기항이 특별해 수열이 더 짧은 식을 따르는 경우이고, 벌레캄프-매시는 늘 가장 짧은 식을 준다.

## 자주 하는 실수와 변형
- 항을 2k개보다 적게 주면 틀린 식이 나온다. 차수 상한을 모르면 DP 상태 수의 두 배쯤 넉넉히 준다. 그래프 걸음 수라면 정점 수가 상한이다.
- 합성수 법에서는 불일치로 나눌 수 없어 그대로 쓸 수 없다. 소수 법으로 바꾸거나 다른 방법이 필요하다.
- 점화식이 없는 수열(n! 등)에 쓰면 식의 길이가 항 수의 절반씩 계속 자란다. 길이가 멈추지 않으면 점화식이 없다는 신호다.

## 복잡도
| 작업 | 시간 | 비고 |
|---|---|---|
| 직접 계산 | O(Nk) | N이 크면 불가 |
| 벌레캄프-매시 | O(k²) | 앞 2k항 |
| 행렬 거듭제곱 | O(k³ log N) | 동반 행렬 |
| 키타마사 | O(k² log N) | NTT면 O(k log k log N) |

벌레캄프-매시는 항 n개에 O(n·L)이다. 키타마사의 다항식 곱을 수학·기하 알고리즘 7편 「FFT와 NTT: 다항식 곱셈을 O(n log n)에」의 NTT로 바꾸면 표의 마지막 값이 된다. 공간은 키타마사가 O(k), 행렬 방법이 O(k²)다.

## 어디에 쓰이나
- 수학·기하 알고리즘 3편 「빠른 거듭제곱과 행렬 거듭제곱」: 그 글의 동반 행렬 대신 다항식 나머지를 거듭제곱해 곱셈을 k/2배쯤 줄인다.
- 선형대수 8편 「고유값과 고유벡터」: 동반 행렬의 특성 방정식 `det(A − λI) = 0`의 좌변이 f(λ)이고, 케일리-해밀턴 정리 때문에 행렬 거듭제곱의 어느 성분이든 행렬 크기 이하 차수의 선형 점화식을 따른다. 타일링 수에 점화식이 숨은 이유다.
- 오류 정정 부호: 벌레캄프-매시는 원래 BCH 부호와 리드-솔로몬 부호의 복호에서 오류 위치 다항식을 찾는 단계이고, 스트림 암호에서는 수열의 선형 복잡도(가장 짧은 LFSR 길이)를 재는 데 쓴다.

## 정리
- k차 선형 점화식은 소수 법에서 앞 2k항이면 벌레캄프-매시로 찾고, 그보다 적으면 틀린 식이 나올 수 있다.
- 불일치가 생기면 예전 실패 식을 밀어 빼서 지우고, 길이는 `max(L, i + 1 − L)`로 늘린다.
- a_N은 xᴺ mod f(x)의 계수와 초기항의 내적이라, 키타마사로 O(k² log N)에 구한다.
- 타일링 수열의 4차 점화식으로 a_(10¹⁸)을 구했고, 무작위 500개가 직접 계산·행렬 방법과 모두 일치했다.

## 더 알아보기
- 이전 글: 12편 「전역 최소 컷: 스토어-바그너와 카거의 무작위 축약」
- 다음 글: 14편 「선형 계획법과 심플렉스: 부등식 제약 아래 최적화」
- Berlekamp–Massey algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Berlekamp%E2%80%93Massey_algorithm
