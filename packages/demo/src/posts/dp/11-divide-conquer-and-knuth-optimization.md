# [동적 계획법 11/12] 분할 정복 최적화와 크누스 최적화

> **한 줄 요약** — 비용 함수가 사각 부등식을 만족하면 최적 분할점 opt가 i(또는 구간)를 따라 단조롭게 움직이므로, 후보를 모두 보지 않고 범위를 좁혀 k개 묶음 나누기는 O(k·n²)에서 O(k·n log n)으로(분할 정복 최적화), 구간 DP는 O(n³)에서 O(n²)으로(크누스 최적화) 줄어든다.

## 이 글에서 다루는 것
- 최적 분할점 opt와 그 단조성
- 분할 정복 최적화: 가운데의 opt를 구해 양쪽 범위를 반으로 자르기
- 사각 부등식(quadrangle inequality)의 의미와 단조성 증명 스케치
- 크누스 최적화: 파일 합치기를 O(n²)에
- 조건을 만족하지 않는 행렬 곱셈 순서에 적용하면 틀리는 반례

## 예제 문제: k개 묶음으로 나누기
음이 아닌 수 n개를 연속된 정확히 k개의 묶음으로 나눈다. 묶음 비용은 (묶음 합)²이고 총비용을 최소로 하고 싶다. 10편의 문제와 비슷하지만 묶음 수가 정해져 있어 층(t)이 하나 더 생긴다.
```text
dp[t][i] = min dp[t−1][j] + C(j, i)
           j<i
C(j, i) = (S[i] − S[j])²
```
층 k개, 칸 n개, 칸마다 후보 j가 최대 n개라 O(k·n²)이다. 이 비용은 10편처럼 직선으로도 풀 수 있지만, 여기서는 비용의 모양을 덜 따지는 더 일반적인 방법을 본다. `opt[t][i]`를 최소를 주는 j 중 가장 작은 것이라 하자. 아래 출력처럼 opt는 i가 커질 때 줄어들지 않는다. 마지막 묶음의 시작점은 끝점이 오른쪽으로 갈수록 따라서 오른쪽으로 간다는 직관과 맞는다.

## 분할 정복 최적화
opt가 단조라면 가운데 칸 mid의 opt를 먼저 구하자. 그러면 mid보다 왼쪽 칸들의 opt는 `opt[mid]` 이하, 오른쪽 칸들은 이상이다. 왼쪽 절반은 후보 범위 [olo, opt(mid)], 오른쪽 절반은 [opt(mid), ohi]로 재귀한다. 재귀의 한 깊이에서 후보 범위들은 끝점만 겹치며 이어지므로 합이 O(n)이고, 깊이는 log n이라 층 하나에 O(n log n)이다.
```python
INF = float("inf")

def prefix(a):
    S = [0]
    for x in a:
        S.append(S[-1] + x)
    return S

def split_naive(a, k):                 # O(k·n²), 가장 작은 opt도 기록
    S, n = prefix(a), len(a)
    prev, opts = [0] + [INF] * n, []
    for t in range(k):
        cur, opt = [INF] * (n + 1), [0] * (n + 1)
        for i in range(1, n + 1):
            for j in range(i):         # 마지막 묶음 = a[j:i]
                v = prev[j] + (S[i] - S[j]) ** 2
                if v < cur[i]:
                    cur[i], opt[i] = v, j
        prev = cur
        opts.append(opt)
    return prev[n], opts

def split_dc(a, k):                    # 분할 정복 최적화 O(k·n log n)
    S, n = prefix(a), len(a)
    prev, evals = [0] + [INF] * n, 0
    for t in range(k):
        cur = [INF] * (n + 1)

        def solve(lo, hi, olo, ohi):   # cur[lo..hi], 답의 j는 olo..ohi
            nonlocal evals
            if lo > hi:
                return
            mid = (lo + hi) // 2
            bj = olo
            for j in range(olo, min(mid - 1, ohi) + 1):
                evals += 1
                v = prev[j] + (S[mid] - S[j]) ** 2
                if v < cur[mid]:
                    cur[mid], bj = v, j
            solve(lo, mid - 1, olo, bj)   # 왼쪽 절반의 opt ≤ bj
            solve(mid + 1, hi, bj, ohi)   # 오른쪽 절반의 opt ≥ bj
        solve(1, n, 0, n - 1)
        prev = cur
    return prev[n], evals

a = [4, 1, 3, 9, 2, 2, 7, 5]
best, opts = split_naive(a, 3)
print(best, split_dc(a, 3)[0], "opt:", opts[2][3:])
```
```text
377 377 opt: [2, 3, 4, 4, 4, 6]
```
3개 묶음일 때 i = 3~8의 opt가 2, 3, 4, 4, 4, 6으로 줄지 않는다. 답 377은 [4, 1, 3], [9, 2, 2], [7, 5]의 8² + 13² + 12²이다.

## 왜 opt가 단조인가: 사각 부등식
a ≤ b ≤ c ≤ d인 모든 경우에 다음이 성립하면 비용 C가 **사각 부등식**을 만족한다고 한다. "엇갈린 두 구간의 비용 합 ≤ 포갠 두 구간의 비용 합"이라는 뜻이다.
```text
C(a,c) + C(b,d) ≤ C(a,d) + C(b,c)
```
합의 제곱은 이를 만족한다. 세 조각의 합을 x, y, z(모두 0 이상)라 하면 확인이 한 줄이다.
```text
x = S[b]−S[a], y = S[c]−S[b]
z = S[d]−S[c]
(x+y+z)² + y² − (x+y)² − (y+z)²
  = 2xz ≥ 0
```
이 조건에서 opt가 단조인 이유는 교환 논증이다. f를 앞 층의 dp라 하자.
```text
i < i', opt(i) = j라 하자.
j' < j가 i'에서 j보다 낫다고 가정.
j가 i의 가장 작은 최적이므로
  f(j) + C(j,i) < f(j') + C(j',i)
사각 부등식(j' < j ≤ i < i')
  C(j',i)+C(j,i') ≤ C(j',i')+C(j,i)
두 식을 더하면
  f(j) + C(j,i') < f(j') + C(j',i')
⇒ 가정과 모순, 즉 opt(i') ≥ j
```

## 무작위 대조 검사
앞 코드에 이어서, 무작위 입력 500개에서 두 방법의 답을 비교하고, 느린 버전이 기록한 opt가 정말 단조인지도 확인한다. 그다음 n = 2,000, k = 10에서 전이 횟수를 센다(O(k·n²) 쪽은 돌리지 않고 공식으로 계산).
```python
import random

rng = random.Random(11)
for t in range(500):
    n = rng.randint(1, 40)
    k = rng.randint(1, n)
    a = [rng.randint(0, 20) for _ in range(n)]
    best, opts = split_naive(a, k)
    assert split_dc(a, k)[0] == best
    for g, opt in enumerate(opts):     # 묶음 g+1개: i ≥ g+1부터 가능
        o = opt[g + 1:]
        assert all(x <= y for x, y in zip(o, o[1:]))  # opt 단조
print("무작위 500개 비교: 모두 일치")

n, k = 2000, 10
a = [rng.randint(0, 1000) for _ in range(n)]
print("O(k·n²) 전이(공식):", k * n * (n + 1) // 2)
print("분할 정복 전이     :", split_dc(a, k)[1])
```
```text
무작위 500개 비교: 모두 일치
O(k·n²) 전이(공식): 20010000
분할 정복 전이     : 212323
```
2천만 번이 21만 번으로 줄었다. k·n·log₂ n ≈ 10 × 2000 × 11 = 22만과 거의 같다.

## 크누스 최적화: 구간 DP를 O(n²)에
5편의 파일 합치기는 이웃한 두 덩어리를 합칠 때마다 두 크기의 합만큼 비용이 드는 문제였다.
```text
dp[l][r] = min (dp[l][m]+dp[m+1][r])
          l≤m<r
         + W(l, r)
```
W(l, r)는 구간 합이다. W가 사각 부등식을 만족하고, 구간이 커지면 줄지 않으면(a ≤ b ≤ c ≤ d일 때 `W(b,c) ≤ W(a,d)`) 최적 분할점이 이웃 구간의 분할점 사이에 끼인다.
```text
opt[l][r−1] ≤ opt[l][r] ≤ opt[l+1][r]
```
같은 길이의 구간들을 l 순서로 보면, 각 구간이 보는 후보 수 `opt[l+1][r] − opt[l][r−1] + 1`을 모두 더할 때 가운데 항들이 서로 지워져(망원 합) 길이마다 O(n)이 남는다. 길이가 n가지이므로 전체 O(n²)이다. 도널드 크누스가 1971년 최적 이진 탐색 트리 논문에서 이 성질로 O(n³)을 O(n²)으로 줄였고, 프랜시스 야오(F. Frances Yao)가 1980년에 사각 부등식이라는 일반 조건으로 정리했다. 앞 코드에 이어서 쓴다.
```python
def merge_naive(a):                    # 파일 합치기 O(n³)
    S, n, ops = prefix(a), len(a), 0
    dp = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            best = INF
            for m in range(l, r):      # [l..m] + [m+1..r]
                ops += 1
                best = min(best, dp[l][m] + dp[m + 1][r])
            dp[l][r] = best + S[r + 1] - S[l]
    return dp[0][n - 1], ops

def merge_knuth(a):                    # 크누스 최적화 O(n²)
    S, n, ops = prefix(a), len(a), 0
    dp = [[0] * n for _ in range(n)]
    opt = [[i] * n for i in range(n)]  # opt[i][i] = i
    for length in range(2, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            best = INF
            lo, hi = opt[l][r - 1], min(opt[l + 1][r], r - 1)
            for m in range(lo, hi + 1):   # 이 범위만 본다
                ops += 1
                v = dp[l][m] + dp[m + 1][r]
                if v < best:
                    best, opt[l][r] = v, m
            dp[l][r] = best + S[r + 1] - S[l]
    return dp[0][n - 1], ops

print(merge_naive([40, 30, 30, 50])[0], merge_knuth([40, 30, 30, 50])[0])
rng = random.Random(111)
for t in range(500):
    a = [rng.randint(0, 50) for _ in range(rng.randint(1, 30))]
    assert merge_naive(a)[0] == merge_knuth(a)[0]
print("무작위 500개 비교: 모두 일치")
a = [rng.randint(1, 1000) for _ in range(200)]
print("O(n³) 전이:", merge_naive(a)[1], " 크누스:", merge_knuth(a)[1])
```
```text
300 300
무작위 500개 비교: 모두 일치
O(n³) 전이: 1333300  크누스: 39200
```
n = 200에서 n³/6 ≈ 133만 번이 n² ≈ 4만 번으로 줄었다.

## 조건을 확인하지 않으면: 행렬 곱셈 순서
5편의 행렬 곱셈 순서도 `dp[l][m] + dp[m+1][r] + 비용` 꼴이라 크누스 최적화를 그대로 붙이고 싶어진다. 하지만 비용 `p[l]·p[m+1]·p[r+1]`이 분할점 m에 따라 달라져 W(l, r) 꼴이 아니므로 조건 밖이다. 앞 코드에 이어서, 크기 1~6인 행렬 4개를 모두 시험해 첫 반례를 찾는다.
```python
def chain(p, knuth):                   # 행렬 i는 p[i] × p[i+1]
    n = len(p) - 1
    dp = [[0] * n for _ in range(n)]
    opt = [[i] * n for i in range(n)]
    for length in range(2, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            lo, hi = l, r - 1
            if knuth:
                lo, hi = opt[l][r - 1], min(opt[l + 1][r], r - 1)
            dp[l][r] = INF
            for m in range(lo, hi + 1):
                v = dp[l][m] + dp[m + 1][r] + p[l] * p[m + 1] * p[r + 1]
                if v < dp[l][r]:
                    dp[l][r], opt[l][r] = v, m
    return dp[0][n - 1]

from itertools import product
for p in product(range(1, 7), repeat=5):   # 행렬 4개, 변 길이 1~6
    p = list(p)
    if chain(p, False) != chain(p, True):
        print("반례:", p, "정답", chain(p, False), "크누스", chain(p, True))
        break
```
```text
반례: [1, 1, 2, 3, 1] 정답 9 크누스 10
```
앞 세 행렬만 볼 때의 최적 분할점은 1인데 네 행렬 전체의 최적 분할점은 0이라, 범위 [1, …]만 본 크누스 버전이 정답을 놓친다. 붙이기 전에 사각 부등식을 확인하거나 작은 입력에서 느린 버전과 대조해야 이런 실수를 잡는다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| k개 나누기 기본 | O(k·n²) | O(n) |
| 분할 정복 최적화 | O(k·n log n) | O(n) |
| 구간 DP 기본 | O(n³) | O(n²) |
| 크누스 최적화 | O(n²) | O(n²) |

- 분할 정복: 깊이마다 후보 합 O(n) × 깊이 log n. 크누스: 길이마다 망원 합 O(n) × 길이 n가지.

## 어디에 쓰이나
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 키마다 검색 빈도가 주어질 때 평균 비교 횟수가 가장 작은 이진 탐색 트리를 만드는 것이 크누스 최적화가 처음 쓰인 문제로, 구간 [l, r]의 루트를 고르는 구간 DP다.
- 통계학 1편 「기술 통계: 데이터를 숫자 몇 개로 요약하기」: 정렬된 값을 k개 구간으로 나눠 구간별 제곱 편차 합을 최소화하는 1차원 k-평균은, 구간 비용을 누적 합 두 개(x와 x²)로 O(1)에 구할 수 있고 사각 부등식도 만족해 분할 정복 최적화가 그대로 들어간다.
- 5편 「구간 DP: 행렬 곱셈 순서와 파일 합치기」: 파일 합치기는 크누스 최적화로 O(n²)이 되지만 행렬 곱셈 순서는 조건 밖이다.

## 정리
- 최적 분할점 opt가 단조이면 후보 범위를 좁혀 DP를 가속할 수 있고, 그 충분조건이 사각 부등식이다.
- 분할 정복 최적화는 가운데 칸의 opt로 양쪽 후보 범위를 나눠 층마다 O(n log n)이다.
- 크누스 최적화는 `opt[l][r−1] ≤ opt[l][r] ≤ opt[l+1][r]`로 구간 DP를 O(n²)으로 줄인다.
- 조건 밖의 문제(행렬 곱셈 순서)에 붙이면 조용히 틀리므로, 느린 버전과의 대조가 필수다.

## 더 알아보기
- 이전 글: 10편 「볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기」
- 다음 글: 12편 「부분집합 합 DP(SOS DP): 모든 부분집합에 대한 합을 빠르게」
- 크누스의 O(n²) 최적 이진 탐색 트리 알고리즘(위키백과 영어판): https://en.wikipedia.org/wiki/Optimal_binary_search_tree
