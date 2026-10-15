# [알고리즘 기법 8/14] 분할 정복: 나누고 풀고 합치기

> **한 줄 요약** — 분할 정복은 문제를 같은 모양의 작은 문제로 나눠 재귀로 풀고 답을 합치는 기법으로, 합치는 단계를 싸게 만들면 O(n²) 문제가 O(n log n)이 되며, 그 비용은 재귀 트리의 층별 합(마스터 정리)으로 어림한다.

## 이 글에서 다루는 것
- 나누기·풀기·합치기 세 단계와 거듭제곱 O(log n)
- 병합 정렬에 얹어 역순 쌍 세기
- 가장 가까운 두 점을 O(n log n)에 찾는 띠 검사
- 마스터 정리를 재귀 트리로 직관하기
- 카라추바 곱셈: 곱셈 4번을 3번으로

## 세 단계와 거듭제곱
**분할 정복**(divide and conquer)은 ① 문제를 같은 모양의 작은 문제로 나누고 ② 각각을 재귀로 풀고 ③ 두 답을 합친다. 작은 문제의 답이 맞으면 합친 답도 맞다는 것이 이산수학 4편 「수학적 귀납법과 재귀」의 강한 귀납법 그대로다. 가장 단순한 예가 거듭제곱이다. aⁿ을 a를 n번 곱해 구하면 곱셈이 n번이지만, `aⁿ = (a^(n/2))²`(n이 홀수면 a를 한 번 더)로 나누면 문제 크기가 매번 절반이 된다.
```python
def power(a, n, mod):
    if n == 0:
        return 1, 0
    half, m = power(a, n // 2, mod)       # a^(n//2)을 한 번만 구한다
    r, m = half * half % mod, m + 1
    if n % 2:
        r, m = r * a % mod, m + 1
    return r, m

MOD = 1_000_000_007
for e in [1, 3, 18]:
    r, mults = power(3, 10**e, MOD)
    assert r == pow(3, 10**e, MOD)
    print(f"n=10^{e}: 곱셈 {mults}번")
```
```text
n=10^1: 곱셈 6번
n=10^3: 곱셈 16번
n=10^18: 곱셈 84번
```
10¹⁸제곱도 곱셈 84번이면 끝난다. 흔한 실수는 `power(a, n // 2) * power(a, n // 2)`처럼 같은 부분 문제를 두 번 부르는 것이다. 그러면 호출이 매 층 두 배로 늘어 다시 O(n)이 된다. 행렬로 넓힌 이야기는 수학·기하 알고리즘 3편 「빠른 거듭제곱과 행렬 거듭제곱」에서 다룬다.

## 예제 문제: 역순 쌍 세기
두 사람이 영화 n편에 매긴 순위가 얼마나 다른지 재는 한 가지 방법은, i < j인데 a[i] > a[j]인 **역순 쌍**(inversion)의 수를 세는 것이다. 모든 쌍을 보면 n(n − 1)/2번이라 n = 10⁵에서 약 5 × 10⁹번이다. 배열을 반으로 나누면 역순 쌍은 왼쪽 안, 오른쪽 안, 그리고 양쪽에 걸친 쌍으로 나뉜다. 걸친 쌍의 수는 각 절반 안의 순서와 무관하므로 두 절반을 정렬해 두어도 된다. 그러면 병합할 때 오른쪽 원소 `right[j]`가 먼저 나가는 순간, 그 원소는 왼쪽에 남은 `len(left) − i`개 전부보다 작다. 1945년 폰 노이만이 고안한 병합 정렬에 몇 줄만 더하면 된다.
```python
import random

def sort_count(a):
    if len(a) <= 1:
        return a, 0
    mid = len(a) // 2
    left, x = sort_count(a[:mid])
    right, y = sort_count(a[mid:])
    merged, cross, i, j = [], 0, 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i]); i += 1
        else:                             # right[j]가 left[i:] 전부보다 작다
            merged.append(right[j]); j += 1
            cross += len(left) - i
    merged += left[i:] + right[j:]
    return merged, x + y + cross

def brute(a):
    n = len(a)
    return sum(a[i] > a[j] for i in range(n) for j in range(i + 1, n))

rng = random.Random(8)
for _ in range(500):
    a = [rng.randint(0, 9) for _ in range(rng.randint(0, 30))]
    assert sort_count(a)[1] == brute(a)
print("무작위 500개 비교: 모두 일치")
print(sort_count([3, 1, 4, 1, 5, 9, 2, 6])[1])
```
```text
무작위 500개 비교: 모두 일치
8
```
값을 0~9로 좁혀 같은 값이 많이 나오게 했다. 비교를 `<`로 쓰면 같은 값끼리도 역순으로 세어 대조 검사에서 바로 걸린다.

## 가장 가까운 두 점
평면의 점 n개 중 가장 가까운 두 점도 모든 쌍을 보면 O(n²)이다. 1975년 샤모스(Shamos)와 호이(Hoey)가 O(n log n) 분할 정복을 보였다. x로 정렬해 가운데 세로선으로 나누고, 양쪽 답 중 작은 거리를 δ라 하자. 선을 가로지르는 쌍이 δ보다 가까우려면 두 점 모두 선에서 δ 안쪽 띠에 있어야 한다. 띠의 점을 y 순으로 보면 각 점은 y 차이가 δ 미만인 위쪽 점만 보면 되는데, 한 변 δ인 칸에는 서로 δ 이상 떨어진 점이 몇 개밖에 못 들어가므로 이웃은 상수 개다. y 정렬은 병합 정렬처럼 재귀에서 합쳐 오면 층마다 O(n)이다.
```python
import random
from heapq import merge

calls = 0
def d2(p, q):                             # 거리의 제곱(정수로 비교)
    global calls
    calls += 1
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2

def closest(px):                          # x순 점 → (최소 d², y순 점)
    n = len(px)
    if n <= 3:
        best = min((d2(px[i], px[j]) for i in range(n)
                    for j in range(i + 1, n)), default=float("inf"))
        return best, sorted(px, key=lambda p: p[1])
    mid = n // 2
    midx = px[mid][0]
    dl, ly = closest(px[:mid])
    dr, ry = closest(px[mid:])
    best = min(dl, dr)
    py = list(merge(ly, ry, key=lambda p: p[1]))
    strip = [p for p in py if (p[0] - midx) ** 2 < best]
    for i, p in enumerate(strip):         # y로 정렬된 띠에서 위쪽 이웃만
        for q in strip[i + 1:]:
            if (q[1] - p[1]) ** 2 >= best:
                break
            best = min(best, d2(p, q))
    return best, py

def brute(pts):
    return min(d2(p, q) for i, p in enumerate(pts) for q in pts[i + 1:])

rng = random.Random(8)
for _ in range(300):
    pts = [(rng.randint(0, 50), rng.randint(0, 50))
           for _ in range(rng.randint(2, 40))]
    assert closest(sorted(pts))[0] == brute(pts)
print("무작위 300개 비교: 모두 일치")
for n in [1000, 4000]:
    pts = [(rng.randint(0, 10**6), rng.randint(0, 10**6)) for _ in range(n)]
    calls = 0
    closest(sorted(pts))
    print(f"n={n}: 거리 계산 {calls}번, 모든 쌍 {n * (n - 1) // 2}번")
```
```text
무작위 300개 비교: 모두 일치
n=1000: 거리 계산 1154번, 모든 쌍 499500번
n=4000: 거리 계산 4635번, 모든 쌍 7998000번
```
n이 4배가 될 때 모든 쌍은 16배, 분할 정복의 거리 계산은 약 4배다. 제곱근을 피하려고 거리의 제곱을 정수로 비교한 것도 실수 오차를 없애는 습관이다.

## 마스터 정리: 재귀 트리로 어림하기
크기 n 문제를 크기 n/b 문제 a개로 나누고 합치는 데 f(n)이 들면 다음처럼 층을 쌓을 수 있다.
```text
T(n) = a·T(n/b) + f(n)
깊이 k층: 문제 aᵏ개, 크기 n/bᵏ
k층 비용: aᵏ · f(n/bᵏ)
층 수: log_b n
```
층 비용이 아래로 갈수록 커지면 맨 아래 잎 `n^(log_b a)`개가, 층마다 같으면 `f(n) × 층 수`가, 위로 갈수록 커지면 맨 위 f(n)이 전체를 지배한다. 이 세 경우를 묶은 것이 1980년 벤틀리(Bentley)·하켄(Haken)·색스(Saxe)의 방법이고, "마스터 정리"라는 이름은 교과서 『Introduction to Algorithms』로 널리 퍼졌다.

| 점화식 | 예 | 결과 |
|---|---|---|
| T(n/2) + 1 | 거듭제곱 | O(log n) |
| 2T(n/2) + 1 | 반씩 최댓값 | O(n) |
| 2T(n/2) + n | 병합 정렬 | O(n log n) |
| 4T(n/2) + n | 곱셈 4번 | O(n²) |
| 3T(n/2) + n | 카라추바 | O(n^1.585) |

## 카라추바 곱셈 맛보기
n자리 수를 `x = a·10ᵐ + b`, `y = c·10ᵐ + d`로 나누면 `xy = ac·10²ᵐ + (ad + bc)·10ᵐ + bd`이다. 곱셈 4번이면 표의 넷째 줄이라 학교식과 같은 O(n²)이다. 1960년 카라추바는 `(a + b)(c + d) − ac − bd = ad + bc`로 곱셈을 3번으로 줄였다. 이 결과는 1962년 콜모고로프가 쓴 논문으로 발표되었다.
```python
import random

mults = 0
def karatsuba(x, y):
    global mults
    if x < 10 or y < 10:
        mults += 1                        # 한 자리 곱셈(기본 단계)
        return x * y
    m = max(len(str(x)), len(str(y))) // 2
    a, b = divmod(x, 10**m)               # x = a·10^m + b
    c, d = divmod(y, 10**m)               # y = c·10^m + d
    ac = karatsuba(a, c)
    bd = karatsuba(b, d)
    mid = karatsuba(a + b, c + d) - ac - bd   # ad + bc를 곱셈 한 번으로
    return ac * 10**(2 * m) + mid * 10**m + bd

rng = random.Random(8)
for _ in range(300):
    x, y = rng.randint(0, 10**40), rng.randint(0, 10**40)
    assert karatsuba(x, y) == x * y
print("무작위 300개 비교: 모두 일치")
for n in [64, 256, 1024]:
    lo, hi = 10**(n - 1), 10**n - 1
    mults = 0
    karatsuba(rng.randint(lo, hi), rng.randint(lo, hi))
    print(f"{n}자리: 기본 곱셈 {mults}번, 학교식 {n * n}번")
```
```text
무작위 300개 비교: 모두 일치
64자리: 기본 곱셈 1057번, 학교식 4096번
256자리: 기본 곱셈 9405번, 학교식 65536번
1024자리: 기본 곱셈 85925번, 학교식 1048576번
```
자릿수가 4배일 때 학교식은 16배, 카라추바는 약 9배(3²)다. `a + b`에서 받아올림이 생겨 정확히 3ᵏ번보다는 조금 많다. 작은 수에서는 덧셈과 나눗셈 부담이 커서, 실제 구현은 일정 크기 아래에서 학교식으로 바꾼다.

## 자주 하는 실수와 변형
- 한쪽으로 치우치게 나누면(크기 1과 n − 1) 깊이가 n이 되어 O(n²)과 재귀 한도 초과가 함께 온다. 퀵정렬의 최악이 이것이고 14편의 무작위 피벗이 해법이다.
- 슬라이싱 `a[:mid]`는 복사라 층마다 O(n)이 더 든다. 점근 복잡도는 같지만 상수가 커서, 큰 입력에서는 인덱스 범위로 넘긴다.
- 변형: 역순 쌍은 고급 자료 구조 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」로도 세고, 트리 위의 분할 정복은 고급 자료 구조 12편 「센트로이드 분할: 트리를 반씩 쪼개는 분할 정복」이다.

## 복잡도
| 문제 | 단순한 방법 | 분할 정복 |
|---|---|---|
| 거듭제곱 | 곱셈 n번 | O(log n) |
| 역순 쌍 | O(n²) | O(n log n) |
| 가장 가까운 두 점 | O(n²) | O(n log n) |
| n자리 곱셈 | O(n²) | O(n^1.585) |
- 공간: 병합에 O(n) 보조 배열, 재귀 깊이는 반씩 나누므로 O(log n)이다.

## 어디에 쓰이나
- 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」: 그 글의 "절반씩 줄이면 log n번"이 재귀 트리의 층 수이고, 마스터 정리는 그 층들의 비용을 더하는 규칙이다.
- 수학·기하 알고리즘 7편 「FFT와 NTT: 다항식 곱셈을 O(n log n)에」: 카라추바가 곱셈 4번을 3번으로 줄였다면, FFT는 짝수·홀수 항으로 나누는 분할 정복으로 다항식 곱셈을 O(n log n)에 한다.
- 언어 기초 2편 「파이썬: 읽기 쉬운 코드를 위한 언어」: 그 글의 공식 구현 CPython에서 큰 정수 곱셈은 두 수가 모두 내부 자릿수 70개를 넘으면 카라추바로 바뀌고, `sorted`는 병합 정렬에서 출발한 팀소트(Timsort, 2002) 계열이다.

## 정리
- 분할 정복은 나누기·풀기·합치기이고, 정확성은 강한 귀납법으로 보인다.
- 합치는 단계가 핵심이다. 정렬된 두 절반을 병합하며 걸친 역순 쌍을 세고, 띠 안의 상수 개 이웃만 보며 가까운 쌍을 찾는다.
- `T(n) = a·T(n/b) + f(n)`은 층 비용이 커지는지·같은지·줄어드는지로 어림한다.
- 부분 문제 수 a를 줄이는 것(카라추바의 4 → 3)이 지수를 바꾼다.

## 더 알아보기
- 이전 글: 7편 「그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건」
- 다음 글: 9편 「단조 스택: 가장 가까운 큰 수와 히스토그램」
- [Karatsuba algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Karatsuba_algorithm)
