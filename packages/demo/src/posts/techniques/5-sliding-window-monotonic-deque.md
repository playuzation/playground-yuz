# [알고리즘 기법 5/14] 슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에

> **한 줄 요약** — 길이가 고정된 창(윈도우)을 한 칸씩 밀 때는 들어오는 원소와 나가는 원소만 반영하면 되고, 최솟값처럼 빼기가 안 되는 값은 "앞으로도 최솟값이 될 수 없는 원소"를 바로 버리는 단조 덱으로 원소당 분할 상환 O(1)에 구한다.

## 이 글에서 다루는 것
- 고정 길이 창의 합: 들어온 것 더하고 나간 것 빼기
- 단조 덱으로 창 최솟값을 O(n)에
- 최댓값 − 최솟값 ≤ K인 가장 긴 구간: 투 포인터 + 덱 두 개
- 덱으로 DP 가속하기 맛보기

## 고정 길이 창의 합
"길이 k인 연속 구간마다 합을 구하라"를 정의대로 하면 창마다 k개를 더해 O(nk)다. 창을 한 칸 밀면 바뀌는 원소는 들어오는 하나와 나가는 하나뿐이니, 이전 합에 그 둘만 반영하면 창 하나에 O(1)이다. 4편의 투 포인터에서 두 포인터 사이 거리를 k로 고정한 경우다.
```python
import random

def window_sums(a, k):                    # 길이 k 창마다 합, O(n)
    s = sum(a[:k])
    out = [s]
    for i in range(k, len(a)):
        s += a[i] - a[i - k]              # 들어온 것 더하고 나간 것 뺀다
        out.append(s)
    return out

rng = random.Random(13)
for _ in range(500):
    a = [rng.randint(-9, 9) for _ in range(rng.randint(1, 15))]
    k = rng.randint(1, len(a))
    assert window_sums(a, k) == [sum(a[i:i + k])
                                 for i in range(len(a) - k + 1)]
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
합은 빼기가 되므로 쉽다. 최솟값은 다르다. 나가는 원소가 최솟값이었다면 남은 원소 중 다음 최솟값이 무엇인지 알 수 없다. 힙에 넣고 창 밖으로 나간 원소를 나중에 지우는 방법은 O(n log n)이고, 임의의 구간 최솟값이 필요하면 고급 자료 구조 6편 「희소 테이블: O(1) 구간 최솟값 질의」를 쓴다. 창이 한 방향으로만 미끄러질 때는 더 단순한 O(n) 방법이 있다.

## 단조 덱: 쓸모없는 후보 버리기
관찰은 하나다. 창 안에 i < j이고 `a[i] ≥ a[j]`인 두 원소가 있으면 a[i]는 **다시는 최솟값이 될 수 없다**. a[j]가 더 늦게 들어왔으니 더 늦게 나가고, 그동안 늘 a[i]보다 작거나 같기 때문이다. 이런 원소를 바로 버리면 남은 후보는 인덱스 순서대로 값이 증가하고, 최솟값은 늘 맨 앞에 있다. 양쪽 끝에서 넣고 뺄 수 있는 **덱**(deque)에 인덱스를 담아 이 불변식을 지킨다.
1. 새 원소 x가 오면, 뒤에서부터 x 이상인 원소를 모두 뺀 뒤 x를 넣는다.
2. 맨 앞 인덱스가 창 밖이면 뺀다.
3. 맨 앞이 창의 최솟값이다.

[3, 1, 4, 1, 5, 9, 2, 6], k = 3에서 덱에 남은 값은 이렇게 변한다.
```text
i  a[i]  덱(값)    창 최솟값
0   3    [3]
1   1    [1]
2   4    [1 4]     1
3   1    [1]       1
4   5    [1 5]     1
5   9    [1 5 9]   1
6   2    [2]       2
7   6    [2 6]     2
```
i = 1에서 1이 들어오자 3은 영원히 버려진다. i = 6에서는 2가 9와 5를 뒤에서 밀어내고, 맨 앞의 1(i = 3)은 창 밖으로 나가 빠진다.
```python
import random
from collections import deque

def window_min(a, k):                     # 길이 k 창마다 최솟값, O(n)
    dq, out, ops = deque(), [], 0         # dq: 인덱스, 값은 앞→뒤로 증가
    for i, x in enumerate(a):
        while dq and a[dq[-1]] >= x:      # 나보다 크거나 같은 옛 원소는
            dq.pop()                      # 다시는 최솟값이 될 수 없다
            ops += 1
        dq.append(i)
        ops += 1
        if dq[0] <= i - k:                # 창 밖으로 나간 맨 앞 원소
            dq.popleft()
            ops += 1
        if i >= k - 1:
            out.append(a[dq[0]])          # 맨 앞이 창의 최솟값
    return out, ops

def window_min_brute(a, k):               # 창마다 min을 새로 계산, O(nk)
    return [min(a[i:i + k]) for i in range(len(a) - k + 1)]

rng = random.Random(12)
for _ in range(500):
    a = [rng.randint(0, 9) for _ in range(rng.randint(1, 15))]
    k = rng.randint(1, len(a))
    assert window_min(a, k)[0] == window_min_brute(a, k)
print("무작위 500개 비교: 모두 일치")
print(window_min([3, 1, 4, 1, 5, 9, 2, 6], 3)[0])
big = [rng.randint(0, 10**9) for _ in range(100_000)]
print("n=100,000 덱 연산:", window_min(big, 1000)[1])
```
```text
무작위 500개 비교: 모두 일치
[1, 1, 1, 1, 2, 2]
n=100,000 덱 연산: 199992
```
원소 하나는 덱에 한 번 들어가고 많아야 한 번 나온다. 그래서 n = 100,000에서 넣기와 빼기를 모두 센 덱 연산이 2n = 200,000번을 넘지 않는다. 안쪽 `while`이 있어도 4편과 같은 분할 상환으로 O(n)이다. 최댓값은 부등호만 뒤집으면 된다.

## 투 포인터와 합치기: 최댓값 − 최솟값 ≤ K
"구간의 최댓값과 최솟값의 차이가 K 이하인 가장 긴 구간"은 4편의 단조성을 가진다. 구간을 줄이면 차이가 줄어들 뿐이다. 그래서 r을 늘리다 조건이 깨지면 l을 당기면 되는데, 그때마다 구간의 최댓값과 최솟값이 필요하다. 창 길이가 일정하지 않아도 왼쪽 끝이 한 방향으로만 움직이므로 덱이 그대로 통한다. 앞 코드에 이어서:
```python
def longest_within(a, lim):               # 최댓값 - 최솟값 ≤ lim인 최장 구간
    mx, mn = deque(), deque()             # 값이 감소하는 덱, 증가하는 덱
    l = best = 0
    for r, x in enumerate(a):
        while mx and a[mx[-1]] <= x:
            mx.pop()
        mx.append(r)
        while mn and a[mn[-1]] >= x:
            mn.pop()
        mn.append(r)
        while a[mx[0]] - a[mn[0]] > lim:  # 깨지면 왼쪽을 당긴다(4편)
            l += 1
            if mx[0] < l:
                mx.popleft()
            if mn[0] < l:
                mn.popleft()
        best = max(best, r - l + 1)
    return best

def longest_brute(a, lim):
    n = len(a)
    return max(r - l + 1 for l in range(n) for r in range(l, n)
               if max(a[l:r + 1]) - min(a[l:r + 1]) <= lim)

for _ in range(500):
    a = [rng.randint(0, 9) for _ in range(rng.randint(1, 15))]
    lim = rng.randint(0, 5)
    assert longest_within(a, lim) == longest_brute(a, lim)
print("무작위 500개 비교: 모두 일치")
print(longest_within([8, 2, 4, 7, 5, 6, 1], 3))
```
```text
무작위 500개 비교: 모두 일치
4
```
예에서는 `[4, 7, 5, 6]`이 차이 3으로 가장 길다. 덱 두 개와 두 포인터가 모두 한 방향으로만 움직이므로 전체가 O(n)이다.

## 덱 DP 최적화 맛보기
DP 점화식이 `dp[i] = c[i] + min(dp[i−k], …, dp[i−1])` 꼴이면, 최솟값을 구하는 범위가 i와 함께 한 칸씩 미끄러지는 창이다. 예로 칸마다 비용 c[i]가 있고 한 번에 1~k칸 앞으로 뛸 때, 0번 칸에서 마지막 칸까지 밟은 칸 비용 합의 최솟값을 구하자. 그대로 계산하면 O(nk)지만, dp 값들 위에 단조 덱을 두면 O(n)이다. 앞 코드에 이어서, 밟을 칸 집합을 모두 시도하는 완전 탐색과 대조한다.
```python
from itertools import combinations

def min_cost_jump(c, k):                  # 0에서 n-1까지, 한 번에 1~k칸
    dp, dq = [0] * len(c), deque()        # dq: dp 값이 증가하는 인덱스
    for i in range(len(c)):
        if dq and dq[0] < i - k:          # 한 번에 닿지 않는 후보는 버린다
            dq.popleft()
        dp[i] = c[i] + (dp[dq[0]] if dq else 0)
        while dq and dp[dq[-1]] >= dp[i]:
            dq.pop()
        dq.append(i)
    return dp[-1]

def jump_brute(c, k):                     # 밟을 중간 칸 집합을 모두 시도
    n, best = len(c), None
    for m in range(n - 1):
        for mid in combinations(range(1, n - 1), m):
            path = (0, *mid, n - 1)
            if all(b - a <= k for a, b in zip(path, path[1:])):
                cost = sum(c[i] for i in path)
                best = cost if best is None else min(best, cost)
    return best

for _ in range(300):
    c = [rng.randint(0, 9) for _ in range(rng.randint(2, 10))]
    k = rng.randint(1, len(c) - 1)
    assert min_cost_jump(c, k) == jump_brute(c, k)
print("무작위 300개 비교: 모두 일치")
print(min_cost_jump([1, 9, 9, 2, 9, 9, 3, 1], 3))
```
```text
무작위 300개 비교: 모두 일치
7
```
예에서는 0 → 3 → 6 → 7번 칸을 밟아 1 + 2 + 3 + 1 = 7이다. 창이 한 칸씩 움직이므로 앞에서 빠지는 인덱스는 한 단계에 많아야 하나다. 점화식 세우기는 동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」에서, 덱에 값 대신 직선을 넣는 확장은 동적 계획법 10편 「볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기」에서 다룬다.

## 자주 하는 실수
- 덱에 값을 넣는다: 창 밖으로 나갔는지 판단하려면 인덱스가 있어야 한다.
- 창 밖 판정의 경계: 창이 `[i − k + 1, i]`이면 밖은 인덱스 `≤ i − k`다. 하나 차이로 틀리기 쉬운 곳이라 완전 탐색과 대조한다.
- 창이 다 차기 전(i < k − 1)에 답을 기록한다.
- 앞에서 빼는 일이 없다면 덱 대신 스택으로 충분하다. 그 경우는 9편 「단조 스택: 가장 가까운 큰 수와 히스토그램」에서 다룬다.

## 복잡도
| 문제 | 단순한 방법 | 이 글의 방법 |
|---|---|---|
| 창마다 합 | O(nk) | O(n) |
| 창마다 최솟값 | O(nk) | O(n) |
| 차이 ≤ K 최장 구간 | O(n²) | O(n) |
| 1~k칸 점프 DP | O(nk) | O(n) |

- 덱 연산은 원소당 넣기 한 번, 빼기 많아야 한 번이라 전체 2n번 이하다. 덱이 차지하는 공간은 O(k)다.
- 힙으로 창 최솟값을 구하면 O(n log n), 희소 테이블은 전처리 O(n log n)에 질의 O(1)이다.

## 어디에 쓰이나
- 어텐션 5편 「슬라이딩 윈도와 희소 어텐션」: 각 토큰이 최근 w개만 보는 로컬 윈도 어텐션은 고정 길이 창이 토큰마다 한 칸씩 미끄러지는 구조이고, 비용이 n²에서 n·w로 주는 것도 같은 이유다.
- 게임 자원 관리 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」: 최근 N프레임 중 가장 오래 걸린 프레임(스파이크)을 매 프레임 갱신하는 일은 창 최댓값이라, 단조 덱으로 프레임당 분할 상환 O(1)에 유지할 수 있다.
- 동적 계획법 10편 「볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기」: "다시는 최솟값이 될 수 없는 후보를 버린다"는 같은 원리를 직선 집합에 적용한다.

## 정리
- 고정 길이 창은 들어오는 원소와 나가는 원소만 반영해 창 하나에 O(1)로 민다.
- 단조 덱은 "더 늦게 와서 더 작은 원소"에 밀린 후보를 버려, 값이 증가하는 인덱스만 남기고 맨 앞을 최솟값으로 쓴다.
- 원소마다 넣기·빼기가 한 번씩이라 전체 O(n)이고, 투 포인터나 DP의 슬라이딩 최솟값에도 그대로 붙는다.
- 덱에는 인덱스를 넣고, 창 경계는 완전 탐색과 대조해 확인한다.

## 더 알아보기
- 이전 글: 4편 「투 포인터: 두 끝을 움직여 O(n)에 구간 찾기」
- 다음 글: 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」
