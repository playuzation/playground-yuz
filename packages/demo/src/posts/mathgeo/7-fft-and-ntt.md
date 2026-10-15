# [수학·기하 알고리즘 7/12] FFT와 NTT: 다항식 곱셈을 O(n log n)에

> **한 줄 요약** — 다항식 곱셈은 계수의 합성곱이라 그대로 하면 O(n²)이지만, 단위근에서의 값으로 바꾸면 점별 곱셈 한 번이 되고, 그 변환을 짝·홀 분할 정복(FFT)으로 O(n log n)에 할 수 있으며, 실수 오차가 걱정되면 모듈러 세계의 단위근을 쓰는 NTT로 정확하게 계산한다.

## 이 글에서 다루는 것
- 다항식 곱 = 계수 합성곱, 그리고 점 표현
- 단위근과 쿨리-튜키 분할: 재귀 FFT
- 반올림 오차가 답을 망가뜨리는 지점
- NTT(법 998244353)의 반복 구현과 큰 수 곱셈
- 단순 O(n²) 곱셈과 무작위 대조

## 예제 문제: 두 다항식 곱하기
`A(x) = 1 + 2x + 3x²`와 `B(x) = 4 + 5x`를 곱하면 `4 + 13x + 22x² + 15x³`이다. 결과의 k차 계수는 `Σ aᵢ·bₖ₋ᵢ`, 즉 i + j = k인 모든 쌍의 곱을 더한 값이다. 이 연산을 **합성곱**(convolution)이라 한다. "주사위 두 개 눈의 합 분포", "두 수의 합으로 만들 수 있는 값의 개수", "큰 수 곱셈"이 모두 이 꼴이다. 이중 반복문으로 하면 길이 n인 두 다항식에 곱셈이 n²번 필요하고, n = 10⁵이면 10¹⁰번이라 쓸 수 없다.

## 점 표현: 값으로 바꾸면 곱셈이 O(n)
차수가 n − 1 이하인 다항식은 서로 다른 점 n개에서의 값으로 유일하게 정해진다. 그리고 `C(x) = A(x)·B(x)`이므로 같은 점들에서 C의 값은 A와 B의 값을 **점별로 곱하기만** 하면 된다. 문제는 계수 → 값(평가)과 값 → 계수(보간)를 아무 점에서나 하면 각각 O(n²)이라는 것이다. FFT는 평가할 점을 **1의 n제곱근**(단위근)으로 골라 이 두 변환을 O(n log n)으로 만든다.

## 단위근과 쿨리-튜키 분할
`ω = e^(2πi/n)`이라 하면 `1, ω, ω², …, ωⁿ⁻¹`이 n개의 단위근이다. 다항식을 짝수 차 항과 홀수 차 항으로 나누면 이렇게 된다.
```text
A(x) = E(x²) + x·O(x²)
E: 짝수 차 계수, O: 홀수 차 계수

k < n/2, w = ωᵏ, z = w² 일 때
A(w)  = E(z) + w·O(z)
A(−w) = E(z) − w·O(z)
```
`ω^(k+n/2) = −ωᵏ`이므로 두 번째 줄은 나머지 절반 점의 값이다. 그리고 n개 단위근의 제곱은 n/2개 단위근이 되므로, E와 O는 크기 절반인 같은 문제다. 그래서 `T(n) = 2T(n/2) + O(n)`, 병합 정렬과 같은 O(n log n)이다. 이것이 1965년 쿨리(James Cooley)와 튜키(John Tukey)가 발표한 **고속 푸리에 변환**(FFT)이다(가우스가 1805년 무렵 발표하지 않은 원고에 같은 방법을 적어 두었다는 사실이 나중에 알려졌다). 역변환은 ω 대신 `ω⁻¹`을 쓰고 n으로 나누면 된다. ω 행렬과 `ω⁻¹` 행렬을 곱하면 대각선은 n이고, 대각선 밖은 `Σ ω^(jt)`(j ≠ 0) 꼴의 단위근 합이라 0이 되기 때문이다.
```python
import cmath

def naive_mul(a, b):
    c = [0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            c[i + j] += x * y
    return c

def fft(a, invert=False):              # len(a)는 2의 거듭제곱
    n = len(a)
    if n == 1:
        return a[:]
    even, odd = fft(a[0::2], invert), fft(a[1::2], invert)
    sign = -1 if invert else 1
    out = [0] * n
    for k in range(n // 2):
        w = cmath.exp(sign * 2j * cmath.pi * k / n)   # ωᵏ
        out[k] = even[k] + w * odd[k]
        out[k + n // 2] = even[k] - w * odd[k]
    return out

def fft_raw(a, b):
    m = len(a) + len(b) - 1
    n = 1
    while n < m:                       # 결과 길이 이상인 2의 거듭제곱
        n *= 2
    fa = fft(a + [0] * (n - len(a)))
    fb = fft(b + [0] * (n - len(b)))
    c = fft([x * y for x, y in zip(fa, fb)], invert=True)
    return [v.real / n for v in c[:m]]

def fft_mul(a, b):
    return [round(v) for v in fft_raw(a, b)]

print(naive_mul([1, 2, 3], [4, 5]), fft_mul([1, 2, 3], [4, 5]))
```
```text
[4, 13, 22, 15] [4, 13, 22, 15]
```

## 반올림 오차
FFT는 부동소수점으로 계산하므로 결과가 정수 근처의 실수로 나오고, `round`로 맞춘다. 계수가 커지면 이 오차가 0.5를 넘는다. 앞 코드에 이어서, 길이 1,000인 두 다항식을 계수 상한 V를 바꿔 가며 곱해 보자.
```python
import random

rng = random.Random(7)
for V in [10**3, 10**6, 10**7]:
    a = [rng.randint(0, V) for _ in range(1000)]
    b = [rng.randint(0, V) for _ in range(1000)]
    raw, exact = fft_raw(a, b), naive_mul(a, b)
    err = max(abs(x - y) for x, y in zip(raw, exact))
    wrong = sum(round(x) != y for x, y in zip(raw, exact))
    print(f"V={V:<9} 최대 오차 {err:.3g}, 틀린 계수 {wrong}개")
```
```text
V=1000      최대 오차 5.96e-08, 틀린 계수 0개
V=1000000   최대 오차 0.0781, 틀린 계수 0개
V=10000000  최대 오차 12, 틀린 계수 1764개
```
V = 10⁷이면 결과 계수가 약 `1000 × 10¹⁴ = 10¹⁷`로, double이 정수를 정확히 담을 수 있는 `2⁵³ ≈ 9 × 10¹⁵`을 넘는다. 이때는 계수를 상위·하위 자리로 쪼개 여러 번 곱하거나, 아예 오차가 없는 NTT를 쓴다.

## NTT: 모듈러 세계의 단위근
FFT가 쓰는 성질은 "ωⁿ = 1이고 `ω^(n/2) = −1`인 원소가 있다"는 것뿐이다. 소수 p를 법으로 하는 세계에서도 n이 `p − 1`을 나누면 그런 원소가 있다. `p = 998244353 = 119 × 2²³ + 1`은 `p − 1`이 2²³으로 나누어져 길이 2²³까지 쓸 수 있고, 3이 **원시근**(거듭제곱이 0 아닌 모든 나머지를 도는 수)이라 `w = 3^((p−1)/n)`이 정확히 n제곱근이 된다. 이것이 **수론적 변환**(NTT)이다. 정수만 쓰므로 오차가 없다. 아래는 재귀 대신 **비트 뒤집기** 순서로 미리 섞어 두고 길이 2, 4, 8, … 순으로 나비 연산을 하는 반복 구현이다. 거듭제곱은 3편, 역원 `pow(x, p − 2, p)`는 5편의 페르마 소정리를 쓴다.
```python
MOD, G = 998244353, 3
print(MOD == 119 * 2**23 + 1,
      [pow(G, (MOD - 1) // q, MOD) != 1 for q in (2, 7, 17)])

def ntt(a, invert=False):
    n = len(a)
    j = 0
    for i in range(1, n):              # 비트 뒤집기 순서로 재배치
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    length = 2
    while length <= n:
        w = pow(G, (MOD - 1) // length, MOD)        # 길이 length의 단위근
        if invert:
            w = pow(w, MOD - 2, MOD)
        half = length // 2
        for s in range(0, n, length):
            wk = 1
            for k in range(s, s + half):
                u, v = a[k], a[k + half] * wk % MOD
                a[k], a[k + half] = (u + v) % MOD, (u - v) % MOD
                wk = wk * w % MOD
        length *= 2
    if invert:
        inv_n = pow(n, MOD - 2, MOD)
        for i in range(n):
            a[i] = a[i] * inv_n % MOD

def ntt_mul(a, b):
    m = len(a) + len(b) - 1
    n = 1
    while n < m:
        n *= 2
    fa, fb = a + [0] * (n - len(a)), b + [0] * (n - len(b))
    ntt(fa)
    ntt(fb)
    c = [x * y % MOD for x, y in zip(fa, fb)]
    ntt(c, invert=True)
    return c[:m]

print(ntt_mul([1, 2, 3], [4, 5]))
```
```text
True [True, True, True]
[4, 13, 22, 15]
```
첫 줄은 p의 모양과, 3을 `(p − 1)/q` 제곱해도 1이 되지 않는다는 원시근 확인이다(`p − 1 = 2²³ × 7 × 17`).

## 무작위 대조와 큰 수 곱셈
앞 코드에 이어서, 길이와 값을 무작위로 정한 500쌍에서 FFT·NTT 결과를 정의 그대로의 이중 반복문과 비교한다. NTT는 결과도 p로 나눈 나머지로 비교한다. 이어서 10진수 각 자리를 계수로 보고 NTT로 곱한 뒤 올림을 처리해 큰 수 곱셈을 만든다. 300자리 수 곱셈에서 이중 반복문은 곱셈 9만 번, NTT는 길이 1,024에서 나비 연산 `3 × 512 × 10`번 남짓이다.
```python
rng = random.Random(2024)
ok_fft = ok_ntt = 0
for _ in range(500):
    a = [rng.randint(0, 1000) for _ in range(rng.randint(1, 40))]
    b = [rng.randint(0, 1000) for _ in range(rng.randint(1, 40))]
    ok_fft += fft_mul(a, b) == naive_mul(a, b)
    a = [rng.randrange(MOD) for _ in range(rng.randint(1, 40))]
    b = [rng.randrange(MOD) for _ in range(rng.randint(1, 40))]
    ok_ntt += ntt_mul(a, b) == [x % MOD for x in naive_mul(a, b)]
print(f"FFT 500개 중 {ok_fft}개 일치, NTT 500개 중 {ok_ntt}개 일치")

def big_mul(x, y):
    a = [int(d) for d in reversed(str(x))]
    b = [int(d) for d in reversed(str(y))]
    c, carry = ntt_mul(a, b), 0
    for i in range(len(c)):            # 계수 ≤ 81 × 길이 < MOD
        carry, c[i] = divmod(c[i] + carry, 10)
    while carry:
        carry, d = divmod(carry, 10)
        c.append(d)
    return int("".join(map(str, reversed(c))))

same = 0
for _ in range(200):
    x, y = rng.randrange(10**299, 10**300), rng.randrange(10**299, 10**300)
    same += big_mul(x, y) == x * y
print(f"300자리 곱셈 200개 중 {same}개가 파이썬 int 곱과 일치")
```
```text
FFT 500개 중 500개 일치, NTT 500개 중 500개 일치
300자리 곱셈 200개 중 200개가 파이썬 int 곱과 일치
```

## 자주 하는 실수와 변형
- 변환 길이를 `len(a) + len(b) − 1` 이상으로 잡지 않으면 넘친 계수가 앞으로 감겨 들어간다(순환 합성곱). 반대로 이 감김을 일부러 쓰는 문제도 있다.
- 역변환 뒤 n으로 나누는 것을 잊거나, `round` 대신 `int`로 잘라 2.9999가 2가 된다.
- NTT의 진짜 계수가 p 이상이면 나머지만 남는다. 이때는 소수 2~3개로 각각 NTT를 하고 4편의 중국인의 나머지 정리로 합친다.
- 변형 유형: 가능한 합의 개수 세기(빈도 다항식의 제곱), 와일드카드가 있는 패턴 매칭(문자를 수로 바꾼 합성곱), 모든 이동 거리에 대한 일치 개수.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 이중 반복문 | O(nm) | 정확 |
| FFT | O(n log n) | 실수 오차 |
| NTT | O(n log n) | 정확, 법 p |

- 변환 한 번이 단계 log n개 × 단계마다 나비 n/2개다. 정방향 2번, 역방향 1번이라 상수는 크지만 n이 커질수록 차이가 빠르게 벌어진다(위 300자리 예에서 곱셈 9만 번 대 나비 연산 약 1.5만 번).
- 공간은 길이 n(2의 거듭제곱으로 올림)의 배열 몇 개, O(n)이다.

## 어디에 쓰이나
- 신경망 레이어 2편 「합성곱 층: 가까운 것끼리 보는 레이어」: 이 글의 계수 합성곱이 곧 1D 합성곱이며, cuDNN 같은 GPU 라이브러리는 FFT 방식 합성곱을 고를 수 있는 알고리즘 후보로 둔다.
- 파이썬 `decimal` 모듈의 libmpdec: 1,024워드가 넘는 계수 곱셈에 NTT를 쓰고, 세 소수로 한 변환 결과를 중국인의 나머지 정리(4편)로 합친다.
- GMP 같은 큰 정수 라이브러리: 크기에 따라 카라추바·툼-쿡을 쓰다가 아주 큰 수에서는 쇤하게-슈트라센 방식의 FFT 곱셈으로 넘어간다.
- 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」: 짝·홀로 나누는 FFT의 점화식은 병합 정렬과 같고, 그 글의 카라추바 곱셈 O(n^1.585)가 중간 단계다.

## 정리
- 다항식 곱은 계수 합성곱이고, 값 표현에서는 점별 곱셈 O(n)이다.
- 단위근은 제곱하면 절반 크기의 단위근이 되므로 평가·보간을 짝·홀 분할로 O(n log n)에 할 수 있다.
- 실수 FFT는 결과가 2⁵³ 근처로 커지면 반올림이 틀린다. 정확한 답이 필요하면 NTT와 중국인의 나머지 정리를 쓴다.
- 무작위 대조 결과 FFT·NTT 모두 이중 반복문과 일치했고, NTT로 만든 큰 수 곱셈도 파이썬 int와 같았다.

## 더 알아보기
- 이전 글: 6편 「밀러-라빈과 폴라드 로: 큰 수 소인수분해」
- 다음 글: 8편 「가우스 소거법: 연립방정식과 XOR 기저」
- 위키백과(영어) Cooley–Tukey FFT algorithm: https://en.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
