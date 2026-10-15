# [수학·기하 알고리즘 3/12] 빠른 거듭제곱과 행렬 거듭제곱

> **한 줄 요약** — 지수를 2진수로 쪼개 "제곱하고, 비트가 1이면 곱한다"를 반복하면 aᵉ을 곱셈 2·log₂ e번 안에 구할 수 있고, 같은 방법을 행렬에 쓰면 피보나치 수·선형 점화식·그래프의 길이 k 경로 수를 n이 10¹⁸이어도 O(log n)번의 행렬 곱으로 구한다.

## 이 글에서 다루는 것
- 반복 제곱(binary exponentiation)과 그 불변식, 곱셈 횟수 세기
- 피보나치 행렬과 일반 선형 점화식의 동반 행렬
- 인접 행렬의 거듭제곱으로 길이 k 경로(걸음) 수 세기
- 지수에 나머지를 취하면 안 되는 이유 등 자주 하는 실수

## 예제 문제: 10¹⁸번 곱하기
"2의 10¹⁸제곱을 10⁹ + 7로 나눈 나머지", "피보나치 수 F(10¹⁸)을 10⁹ + 7로 나눈 나머지" 같은 문제를 보자. 모듈러 덧셈·곱셈은 중간에 나머지를 취해도 된다(이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」)는 덕분에 수가 커지는 문제는 없다. 남은 문제는 횟수다. 곱셈을 10¹⁸번 하면 1초에 10⁸번씩 해도 300년이 넘게 걸린다. 피보나치도 한 항씩 더하면 10¹⁸단계다.

## 반복 제곱
지수 13을 2진수로 쓰면 `1101₂ = 8 + 4 + 1`이다. 그래서 3¹³은 3⁸·3⁴·3¹이고, 3¹, 3², 3⁴, 3⁸은 직전 값을 제곱해서 차례로 만든다.
```text
13 = 1101₂ = 8 + 4 + 1
3 → 3² → 3⁴ → 3⁸   (제곱 3번)
3¹³ = 3⁸ · 3⁴ · 3¹  (곱 2번 더)
```
지수의 비트를 아래에서부터 보면서 base를 계속 제곱하고, 비트가 1이면 result에 base를 곱한다. 이것이 **반복 제곱**(binary exponentiation, exponentiation by squaring)이다. 맞는 이유는 불변식 `result · baseᵉ = 원래 aᵉ`이 매 단계 유지되기 때문이다. e가 홀수면 base 하나를 result로 옮기고, 그다음 `baseᵉ = (base²)^(e/2)`로 base를 제곱하고 e를 반으로 줄인다. e = 0이 되면 result가 답이다. 같은 일을 재귀로 `aᵉ = (a^(e/2))²`처럼 쓰면 분할 정복이다.
```python
import random

def power(a, e, m):
    """a^e mod m을 반복 제곱으로. 곱셈 횟수도 센다."""
    result, base, mults = 1 % m, a % m, 0
    while e > 0:                 # 불변식: result · base^e = 원래 a^e (mod m)
        if e & 1:
            result = result * base % m
            mults += 1
        base = base * base % m
        mults += 1
        e >>= 1
    return result, mults

def power_naive(a, e, m):
    r = 1 % m
    for _ in range(e):
        r = r * a % m
    return r

print(power(3, 13, 1000), power_naive(3, 13, 1000))
print(power(2, 10**18, 10**9 + 7), pow(2, 10**18, 10**9 + 7))
rng = random.Random(4)
for _ in range(500):
    a, e, m = rng.randint(0, 10**9), rng.randint(0, 300), rng.randint(1, 10**9)
    assert power(a, e, m)[0] == power_naive(a, e, m)
    E = rng.randint(0, 10**30)
    assert power(a, E, m)[0] == pow(a, E, m)
print("무작위 500개 비교: 모두 일치")
```
```text
(323, 7) 323
(719476260, 84) 719476260
무작위 500개 비교: 모두 일치
```
10¹⁸제곱이 곱셈 84번으로 끝났다. 10¹⁸은 2진수로 60자리이고 그중 1이 24개라 제곱 60번 + 곱 24번이다. 일반적으로 곱셈은 `⌊log₂ e⌋ + 1 + (1인 비트 수)`번, 많아야 약 2·log₂ e번이다. 작은 지수는 곱셈을 그대로 반복한 결과와, 10³⁰까지의 큰 지수는 파이썬 내장 `pow(a, e, m)`과 대조했다. 실전에서는 내장 `pow`를 쓰면 되고, 직접 구현이 필요한 것은 아래처럼 "곱셈"이 수가 아닐 때다.

## 행렬 거듭제곱과 피보나치
반복 제곱에 필요한 것은 곱셈의 **결합 법칙**뿐이다. `(AB)C = A(BC)`이므로 3⁸·3⁴·3¹을 어떤 순서로 묶어 계산해도 같다. 행렬 곱도 결합 법칙이 성립하므로(선형대수 3편 「행렬과 행렬 곱」) 같은 코드가 행렬에서도 돈다. 처음 result는 1 대신 단위 행렬이다.

피보나치 점화식 `F(n+1) = F(n) + F(n−1)`을 벡터로 쓰면 행렬 곱 하나가 된다.
```text
┌F(n+1)┐   ┌1 1┐ ┌F(n)  ┐
│      │ = │   │ │      │
└F(n)  ┘   └1 0┘ └F(n−1)┘
```
이를 n번 적용하면 귀납법으로 `Mⁿ = [[F(n+1), F(n)], [F(n), F(n−1)]]`이 되어, Mⁿ의 오른쪽 위 칸이 F(n)이다. 일반 k항 점화식 `a[i] = c₀·a[i−1] + … + c(k−1)·a[i−k]`도 같은 방식으로 k × k **동반 행렬**(companion matrix)을 만든다. 첫 행은 계수, 그 아래는 값을 한 칸씩 밀어 내리는 1들이다.
```text
┌a[i]  ┐   ┌c₀ c₁ c₂┐ ┌a[i−1]┐
│a[i−1]│ = │1  0  0 │ │a[i−2]│
└a[i−2]┘   └0  1  0 ┘ └a[i−3]┘
```
점화식을 한 항씩 계산한 결과와 무작위 계수·초기값으로 대조한다.
```python
import random
MOD = 10**9 + 7

def mat_mul(A, B, m):
    n, k, p = len(A), len(B), len(B[0])
    return [[sum(A[i][t] * B[t][j] for t in range(k)) % m
             for j in range(p)] for i in range(n)]

def mat_pow(M, e, m):
    R = [[int(i == j) for j in range(len(M))] for i in range(len(M))]
    while e > 0:                       # 수 대신 행렬로 같은 반복 제곱
        if e & 1:
            R = mat_mul(R, M, m)
        M = mat_mul(M, M, m)
        e >>= 1
    return R

def fib(n, m=MOD):
    return mat_pow([[1, 1], [1, 0]], n, m)[0][1]

def linear_rec(c, init, n, m=MOD):
    """a[i] = c[0]·a[i−1] + … + c[k−1]·a[i−k], a[0..k−1] = init."""
    k = len(c)
    if n < k:
        return init[n] % m
    T = [c] + [[int(j == i) for j in range(k)] for i in range(k - 1)]
    P = mat_pow(T, n - k + 1, m)
    return sum(P[0][j] * init[k - 1 - j] for j in range(k)) % m

print([fib(n) for n in range(10)], fib(10**18))
rng = random.Random(5)
for _ in range(500):
    k = rng.randint(1, 4)
    c = [rng.randint(0, 10**9) for _ in range(k)]
    init = [rng.randint(0, 10**9) for _ in range(k)]
    n = rng.randint(0, 60)
    a = init[:]
    while len(a) <= n:                 # 정의대로 한 항씩
        a.append(sum(c[j] * a[-1 - j] for j in range(k)) % MOD)
    assert linear_rec(c, init, n) == a[n] % MOD
print("무작위 500개 비교: 모두 일치")
```
```text
[0, 1, 1, 2, 3, 5, 8, 13, 21, 34] 209783453
무작위 500개 비교: 모두 일치
```
F(10¹⁸) mod (10⁹ + 7)이 2 × 2 행렬 곱 84번으로 나온다. "2 × n 칸을 1 × 2, 2 × 1 타일로 채우는 방법 수"처럼 동적 계획법의 점화식이 상수 개의 이전 항만 쓰는 선형 결합이면, n이 아무리 커도 이렇게 가속할 수 있다.

## 그래프에서 길이 k 경로 세기
인접 행렬 A(이산수학 8편 「그래프의 기초: 정점과 간선」)의 k제곱 `Aᵏ[s][t]`는 s에서 t로 가는 **길이 k인 걸음**(walk, 정점·간선 반복 허용)의 수다. `Aᵏ[s][t] = Σᵥ Aᵏ⁻¹[s][v] · A[v][t]`가 "길이 k − 1로 v까지 간 뒤 간선 v → t 하나 더"를 모든 v에 대해 더한 것이기 때문이다. 아래 그래프에서 확인하고, 정점 열을 모두 나열하는 완전 탐색과 대조한다.
```text
0 ── 1
│  ╱
│ ╱
2 ── 3
```
```python
import random
from itertools import product

def mat_mul(A, B, m):
    return [[sum(a * b for a, b in zip(row, col)) % m for col in zip(*B)]
            for row in A]

def mat_pow(M, e, m):
    R = [[int(i == j) for j in range(len(M))] for i in range(len(M))]
    while e > 0:
        if e & 1:
            R = mat_mul(R, M, m)
        M = mat_mul(M, M, m)
        e >>= 1
    return R

def walks_brute(adj, k, s, t):
    """길이 k 걸음(정점 열)을 모두 나열해 센다."""
    n = len(adj)
    return sum(all(adj[a][b] for a, b in zip((s,) + mid, mid + (t,)))
               for mid in product(range(n), repeat=k - 1))

A = [[0, 1, 1, 0], [1, 0, 1, 0], [1, 1, 0, 1], [0, 0, 1, 0]]
P = mat_pow(A, 4, 10**9 + 7)
print("0→3 길이 4:", P[0][3], walks_brute(A, 4, 0, 3))
print("0→0 길이 10**18 (mod):", mat_pow(A, 10**18, 10**9 + 7)[0][0])
rng = random.Random(6)
for _ in range(500):
    n, k = rng.randint(1, 4), rng.randint(1, 6)
    adj = [[rng.randint(0, 1) for _ in range(n)] for _ in range(n)]
    s, t = rng.randrange(n), rng.randrange(n)
    assert mat_pow(adj, k, 10**9 + 7)[s][t] == walks_brute(adj, k, s, t)
print("무작위 500개 비교: 모두 일치")
```
```text
0→3 길이 4: 4 4
0→0 길이 10**18 (mod): 623415143
무작위 500개 비교: 모두 일치
```
완전 탐색은 Vᵏ⁻¹개의 정점 열을 보지만 행렬 거듭제곱은 V × V 행렬 곱 O(log k)번이다. 덧셈과 곱셈을 각각 min과 +로 바꾼 "최소-덧셈 행렬 곱"도 결합 법칙이 성립해서, 같은 반복 제곱으로 "간선을 정확히 k개 쓰는 최단 걸음"을 구할 수 있다.

## 자주 하는 실수와 변형
- **지수에 나머지 취하기**: `a^(e mod m)`은 `aᵉ mod m`과 다르다. 지수를 줄이려면 2편의 오일러 정리로 φ(m)을 법으로 써야 하고, 그것도 gcd(a, m) = 1일 때만 바로 된다. 법이 소수 p이고 a가 p의 배수가 아니면 `a^(e mod (p − 1))`이다.
- **법이 1인 경우**: 답은 항상 0이다. 초기값을 `1`이 아니라 `1 % m`으로 두는 이유다.
- **오버플로**: 법이 10⁹ 근처면 곱이 10¹⁸ 안이라 64비트에 들어가지만, 법이 10¹⁸ 근처면 C++·자바에서는 128비트 곱이나 곱셈 분할이 필요하다. 6편의 밀러-라빈에서 다시 만난다.
- **큰 k**: 동반 행렬은 k³ log n이라 k가 수백을 넘으면 무겁다. 이때는 다항식 나머지로 k² log n에 줄이는 키타마사(Kitamasa) 방법 같은 기법을 쓴다.
- **행렬 곱의 순서**: 행렬 곱은 교환 법칙이 없지만, 같은 행렬의 거듭제곱끼리는 순서를 바꿔도 된다. 서로 다른 행렬을 섞을 때는 순서를 지켜야 한다.

## 복잡도
| 문제 | 단순한 방법 | 거듭제곱 |
|---|---|---|
| aᵉ mod m | O(e) | O(log e) |
| k항 점화식 n번째 | O(nk) | O(k³ log n) |
| 길이 k 걸음 수 | O(Vᵏ⁻¹) 나열 | O(V³ log k) |

공간은 수의 경우 O(1), 행렬의 경우 행렬 몇 개 분량인 O(k²) 또는 O(V²)이다. 근거는 모두 같다. 지수를 매번 절반으로 줄이므로 곱셈이 log 번만 필요하다.

## 어디에 쓰이나
- 확률과 분포 12편 「마르코프 연쇄: 현재만 기억하는 확률 과정」: n단계 전이 확률 Pⁿ을 n번 곱하지 않고 반복 제곱으로 log n번의 행렬 곱에 구할 수 있다.
- 이산수학 8편 「그래프의 기초: 정점과 간선」: 인접 행렬이 "행렬 연산과 바로 이어진다"는 장점의 구체적인 예가 Aᵏ로 걸음 수를 세는 것이다.
- RSA 암호: 암호화 `mᵉ mod n`과 복호화 `cᵈ mod n`이 모두 모듈러 거듭제곱이고, 개인 지수 d는 n과 비슷한 수천 비트 크기라 반복 제곱 없이는 계산 자체가 불가능하다.
- 6편 「밀러-라빈과 폴라드 로: 큰 수 소인수분해」: 소수 판정의 핵심 연산이 `pow(a, d, n)`이다.

## 정리
- 반복 제곱은 불변식 `result · baseᵉ = aᵉ`을 지키며 지수를 절반씩 줄여 곱셈 약 2·log₂ e번에 끝낸다.
- 결합 법칙만 있으면 되므로 행렬에도 그대로 쓰이고, 처음 값은 단위 행렬이다.
- 상수 개 이전 항의 선형 결합인 점화식은 동반 행렬의 거듭제곱으로 O(k³ log n)에 n번째 항을 구한다.
- 인접 행렬의 k제곱은 길이 k 걸음 수를 세고, (min, +)로 바꾸면 간선 k개 최단 걸음도 구한다.

## 더 알아보기
- 이전 글: 2편 「소수와 체: 에라토스테네스, 선형 체, 오일러 피 함수」
- 다음 글: 4편 「중국인의 나머지 정리」
- 반복 제곱(위키백과 영어판): https://en.wikipedia.org/wiki/Exponentiation_by_squaring
