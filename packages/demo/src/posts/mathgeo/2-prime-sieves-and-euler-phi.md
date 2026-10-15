# [수학·기하 알고리즘 2/12] 소수와 체: 에라토스테네스, 선형 체, 오일러 피 함수

> **한 줄 요약** — 수마다 나눠 보는 대신 소수의 배수를 한꺼번에 지우는 체(sieve)는 n 이하 소수를 O(n log log n)에 구하고, 최소 소인수를 기록하는 선형 체는 모든 수의 소인수분해와 오일러 피 함수까지 표 하나로 바꿔 준다.

## 이 글에서 다루는 것
- 시행 나눗셈이 느린 이유와 에라토스테네스의 체(p²부터 지우는 이유)
- 선형 체: 합성수를 정확히 한 번씩 지우고 최소 소인수 표 만들기
- 오일러 피 함수 φ(n)과 피 체
- 구간 체: 10¹² 근처의 소수 찾기, 무작위 대조 검사

## 예제 문제: 수십만 개의 수를 소인수분해하기
"N 이하의 소수는 몇 개인가", "10⁶ 이하의 수 x가 Q = 10⁵개 주어질 때 각각을 소인수분해하라" 같은 문제를 생각하자. 단순한 방법은 **시행 나눗셈**(trial division)이다. n이 합성수라면 √n 이하의 약수가 반드시 있으므로 2부터 √n까지 나눠 보면 된다. 수 하나에 O(√n)이라 n 이하 전부를 판정하면 O(n√n)이고, 소인수분해 질의 10⁵개도 질의마다 최대 1,000번씩 나눗셈을 한다. 수마다 같은 작은 소수로 처음부터 다시 나누는 것이 낭비다.

## 에라토스테네스의 체
발상을 뒤집어 "수마다 약수를 찾는" 대신 "소수마다 배수를 지운다". 2부터 차례로 보면서 아직 지워지지 않은 수 p를 만나면 p는 소수이고, p의 배수를 모두 지운다. 기원전 3세기 그리스의 에라토스테네스에게 돌려지는 방법으로, 그의 글은 남아 있지 않고 기원후 100년 무렵 니코마코스의 『산술 입문』에 실린 설명으로 전해진다.

지우기는 2p가 아니라 **p²부터** 시작한다. p보다 작은 소인수 q를 가진 배수 `kp`(k < p)는 q를 처리할 때 이미 지워졌기 때문이다. 같은 이유로 p는 √n까지만 보면 된다. 시행 나눗셈과 연산 수를 비교해 보자.
```python
import math

def is_prime_trial(n, ops):
    d = 2
    while d * d <= n:                      # √n까지만 나눠 보면 된다
        ops[0] += 1
        if n % d == 0:
            return False
        d += 1
    return n >= 2

def eratosthenes(n, ops):
    is_p = [True] * (n + 1)
    is_p[0] = is_p[1] = False
    for p in range(2, math.isqrt(n) + 1):
        if is_p[p]:
            for m in range(p * p, n + 1, p):   # p²부터 지운다
                is_p[m] = False
                ops[0] += 1
    return is_p

for n in (10**3, 10**4, 10**5):
    t, e = [0], [0]
    cnt = sum(is_prime_trial(k, t) for k in range(n + 1))
    assert cnt == sum(eratosthenes(n, e))
    lnln = n * math.log(math.log(n))
    print(f"n={n:<6} 소수 {cnt:<5} 나눗셈 {t[0]:<7} 체 {e[0]:<6}"
          f" nlnln {lnln:.0f}")
```
```text
n=1000   소수 168   나눗셈 5288    체 1411   nlnln 1933
n=10000  소수 1229  나눗셈 117527  체 16981  nlnln 22203
n=100000 소수 9592  나눗셈 2745694 체 193078 nlnln 244347
```
n이 10배가 될 때 나눗셈은 22~23배씩 늘지만 체의 지우기 횟수는 11~12배씩만 는다. 지우기 횟수는 소수 p마다 약 n/p번이므로 `n × (1/2 + 1/3 + 1/5 + …)`이고, 소수의 역수 합이 ln ln n처럼 아주 느리게 자라기 때문에(메르텐스 정리) 전체가 O(n log log n)이다. 실측값이 `n·ln ln n`보다 조금 작으면서 같은 속도로 자라는 것이 보인다. ln ln n은 n = 10⁹에서도 3.03에 불과하니 사실상 선형이다.

## 선형 체와 최소 소인수 표
에라토스테네스의 체는 12처럼 소인수가 여럿인 수를 2와 3에서 두 번 지운다. **선형 체**(linear sieve)는 모든 합성수 x를 "x의 최소 소인수 p × 나머지 i"로 단 한 번만 지운다. 1978년 데이비드 그리스(David Gries)와 자야데브 미스라(Jayadev Misra)가 발표한 선형 시간 체가 이 계열이다.

규칙은 이렇다. i를 2부터 키우면서, 지금까지 찾은 소수 p를 작은 것부터 곱해 `i·p`의 최소 소인수(smallest prime factor, spf)를 p로 기록한다. 단 p가 i의 최소 소인수를 넘으면 멈춘다. 그 뒤의 `i·p`는 최소 소인수가 p가 아니라 spf(i)이므로, 나중에 다른 i에서 지워질 몫이기 때문이다. 이 표가 있으면 x를 spf[x]로 계속 나누는 것만으로 O(log x)에 소인수분해가 끝난다.
```python
import random

def linear_sieve(n):
    spf = [0] * (n + 1)                # spf[x] = x의 최소 소인수
    primes, ops = [], 0
    for i in range(2, n + 1):
        if spf[i] == 0:
            spf[i] = i
            primes.append(i)
        for p in primes:               # i·p의 최소 소인수가 p인 것만 표시
            if p > spf[i] or i * p > n:
                break
            spf[i * p] = p
            ops += 1
    return spf, primes, ops

def factorize(x, spf):
    fs = []
    while x > 1:
        fs.append(spf[x])
        x //= spf[x]
    return fs

def factorize_trial(x):
    fs, d = [], 2
    while d * d <= x:
        while x % d == 0:
            fs.append(d)
            x //= d
        d += 1
    return fs + ([x] if x > 1 else [])

N = 10**6
spf, primes, ops = linear_sieve(N)
print("소수", len(primes), "표시", ops, "합성수", N - 1 - len(primes))
print(360, factorize(360, spf), 999983, factorize(999983, spf))
rng = random.Random(2)
for _ in range(500):
    x = rng.randint(2, N)
    assert factorize(x, spf) == factorize_trial(x)
print("무작위 500개 비교: 모두 일치")
```
```text
소수 78498 표시 921501 합성수 921501
360 [2, 2, 2, 3, 3, 5] 999983 [999983]
무작위 500개 비교: 모두 일치
```
표시 횟수가 합성수의 개수와 정확히 같다. 합성수마다 한 번씩이니 O(n)이다. 실전에서는 에라토스테네스의 체도 충분히 빠르고 상수가 작아서, 선형 체의 진짜 가치는 속도보다 **spf 표**와 아래의 곱셈적 함수 계산에 있다.

## 오일러 피 함수
**오일러 피 함수** φ(n)은 1부터 n까지에서 n과 서로소인 수의 개수다. 오일러가 1763년에 도입했고, φ라는 기호는 1801년 가우스의 『산술 연구』에서 왔다. n의 서로 다른 소인수가 p₁, …, pₖ이면 다음과 같다.
```text
φ(n) = n·(1 − 1/p₁)·…·(1 − 1/pₖ)
φ(36) = 36 · (1/2) · (2/3) = 12
```
"p₁의 배수를 빼고, p₂의 배수를 빼고, 둘 다의 배수는 다시 더하고…"를 정리한 것이므로 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」의 포함·배제 그대로다. 체로 계산하려면 φ[m] = m에서 출발해 소수 p의 배수마다 `phi[m] -= phi[m] // p`로 (1 − 1/p)를 곱해 나간다. 정의 그대로 gcd를 세는 방법과 n ≤ 2000 전부를 비교한다.
```python
from math import gcd

def phi_sieve(n):
    phi = list(range(n + 1))
    for p in range(2, n + 1):
        if phi[p] == p:                    # 아직 손대지 않았다 = 소수
            for m in range(p, n + 1, p):
                phi[m] -= phi[m] // p      # φ에 (1 − 1/p)를 곱한다
    return phi

phi = phi_sieve(2000)
print([phi[k] for k in (1, 9, 10, 12, 36, 97)])
brute = [sum(gcd(k, n) == 1 for k in range(1, n + 1)) for n in range(2001)]
print("n ≤ 2000 전부 비교:", phi[1:] == brute[1:])
```
```text
[1, 6, 4, 4, 12, 96]
n ≤ 2000 전부 비교: True
```
소수 p는 φ(p) = p − 1이다. 선형 체 안에서 계산하려면 p가 i를 나누면 `φ(i·p) = φ(i)·p`, 아니면 `φ(i)·(p − 1)`을 쓴다. φ는 **오일러 정리** `a^φ(m) ≡ 1 (mod m)`(gcd(a, m) = 1)로 이어지는데, m이 소수인 경우가 5편에서 쓰는 페르마 소정리다.

## 구간 체: 큰 수 근처의 소수
"10¹²부터 10¹² + 10⁶ 사이의 소수"는 10¹² 크기의 배열을 만들 수 없어 보통의 체로는 안 된다. 하지만 이 구간의 합성수는 모두 √(10¹²) = 10⁶ 이하의 소인수를 가진다. 그래서 10⁶ 이하의 소수만 보통 체로 구한 뒤, 각 소수의 배수를 구간 안에서만 지운다. 이것이 **구간 체**(segmented sieve)이고, 메모리는 구간 길이와 √hi에만 비례한다.
```python
import math, random

def simple_sieve(n):
    is_p = [True] * (n + 1)
    is_p[0] = is_p[1] = False
    for p in range(2, math.isqrt(n) + 1):
        if is_p[p]:
            is_p[p * p::p] = [False] * len(range(p * p, n + 1, p))
    return [p for p in range(n + 1) if is_p[p]]

def segmented_primes(lo, hi):
    """[lo, hi] 구간의 소수. 구간 길이만 작으면 hi가 커도 된다."""
    mark = [True] * (hi - lo + 1)
    for p in simple_sieve(math.isqrt(hi)):          # √hi 이하 소수만 필요
        start = max(p * p, (lo + p - 1) // p * p)   # lo 이상 첫 배수
        for m in range(start, hi + 1, p):
            mark[m - lo] = False
    return [lo + i for i, ok in enumerate(mark) if ok and lo + i >= 2]

def is_prime(n):
    return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))

B = 10**12
print("10**12 +", [p - B for p in segmented_primes(B, B + 100)])
rng = random.Random(3)
for _ in range(500):
    lo = rng.randint(1, 10**5)
    hi = lo + rng.randint(0, 200)
    want = [x for x in range(lo, hi + 1) if is_prime(x)]
    assert segmented_primes(lo, hi) == want
print("무작위 500개 비교: 모두 일치")
```
```text
10**12 + [39, 61, 63, 91]
무작위 500개 비교: 모두 일치
```
`max(p * p, …)`가 중요하다. 이것이 없으면 구간 안에 들어 있는 작은 소수 p 자신까지 지워 버린다.

## 자주 하는 실수와 변형
- **0과 1**: 둘 다 소수가 아니다. 체를 만들 때 따로 False로 둔다.
- **메모리**: 10⁸ 크기의 체는 파이썬 리스트로는 수백 MB다. `bytearray`나 홀수만 저장하기로 줄인다.
- **누적 개수 질의**: "구간 [a, b]의 소수 개수"가 많이 오면 체 위에 누적 합을 만들어 O(1)에 답한다.
- **다른 곱셈적 함수**: 약수 개수·약수 합·뫼비우스 함수도 spf 표나 선형 체에서 φ와 같은 방식으로 구한다.
- **한 개의 큰 수**: 10¹⁸급 수 하나의 소수 판정·소인수분해는 체가 아니라 6편의 밀러-라빈과 폴라드 로가 맡는다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 시행 나눗셈(전부) | O(n√n) | O(1) |
| 에라토스테네스 | O(n log log n) | O(n) |
| 선형 체 + spf | O(n), 분해 O(log x) | O(n) |
| 구간 체 | O(L log log hi + √hi) | O(L + √hi) |

L은 구간 길이다. 피 체는 에라토스테네스와 같은 O(n log log n)이고, 선형 체에 얹으면 O(n)이다.

## 어디에 쓰이나
- 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」: φ(n)의 곱 공식은 소인수별 배수를 빼고 더하는 그 글의 포함·배제를 정리한 결과다.
- RSA 암호: n = pq일 때 `φ(n) = (p − 1)(q − 1)`이고, 1편의 확장 유클리드로 e의 역원을 이 법에서 구한다. 소인수를 모르면 φ(n)을 계산할 수 없다는 점이 안전성의 바탕이다.
- 6편 「밀러-라빈과 폴라드 로: 큰 수 소인수분해」: 큰 수의 판정기를 검증할 때 이 글의 체가 정답표가 되고, 실제 판정기도 작은 소수로 먼저 나눠 보는 단계를 둔다.

## 정리
- 시행 나눗셈은 수마다 O(√n)이라 범위 전체에 쓰면 느리고, 체는 소수의 배수를 p²부터 지워 O(n log log n)에 끝낸다.
- 선형 체는 합성수를 최소 소인수로 한 번씩만 지우며, 그 부산물인 spf 표로 소인수분해가 O(log x)가 된다.
- φ(n)은 소인수마다 (1 − 1/p)를 곱한 값이고, 체 위에서 한꺼번에 구한다.
- 구간 체는 √hi 이하 소수만으로 큰 수 근처의 짧은 구간을 체로 거른다.

## 더 알아보기
- 이전 글: 1편 「유클리드 호제법과 확장 유클리드: 모듈러 역원 구하기」
- 다음 글: 3편 「빠른 거듭제곱과 행렬 거듭제곱」
- 에라토스테네스의 체(위키백과 영어판): https://en.wikipedia.org/wiki/Sieve_of_Eratosthenes
