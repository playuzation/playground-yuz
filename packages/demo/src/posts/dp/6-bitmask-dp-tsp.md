# [동적 계획법 6/12] 비트마스크 DP: 외판원 순회 문제

> **한 줄 요약** — 외판원 순회 문제는 "방문한 도시 집합(비트마스크)과 지금 있는 도시"를 상태로 두면 방문 순서를 잊어도 되므로, (n−1)!개의 순열 대신 2ⁿ·n개의 상태를 O(2ⁿ·n²)에 채워 풀 수 있다.

## 이 글에서 다루는 것
- 외판원 순회 문제(TSP)와 순열 완전 탐색 (n−1)!
- dp[mask][v]: 순서를 잊고 집합만 기억하기
- O(2ⁿ·n²) 구현과 경로 복원, 연산 수 비교
- 할당 문제를 dp[mask]로 O(2ⁿ·n)에
- n = 8 순열 완전 탐색과의 무작위 대조

## 예제 문제: 퀘스트 지점 다섯 곳
게임 속 NPC가 마을(0번)에서 출발해 퀘스트 지점 1~4를 한 번씩 들르고 마을로 돌아와야 한다. 지점 사이 이동 거리가 주어질 때 가장 짧은 순회 경로는? 이것이 **외판원 순회 문제**(traveling salesman problem, TSP)다. 출발점을 0으로 고정하면 나머지를 도는 순서가 (n−1)!가지라, 지점 5곳이면 24가지지만 16곳이면 1조 3천억 가지(15!)다. "지금 위치에서 가장 가까운 곳부터" 가는 탐욕은 쉽지만 아래 예에서 32 대신 38짜리 경로를 고른다. 탐욕은 처음 몇 걸음을 아끼고 마지막에 먼 길로 돌아오는 대가를 치르기 쉽다.

## 순서를 잊고 집합만 기억하기
위 예제의 거리(아래 코드의 D)로 두 경로를 비교해 보자.
```text
0→1→2→3  비용 12+3+6 = 21
0→2→1→3  비용 10+3+7 = 20
둘 다 "{0,1,2,3}을 들르고 3에 있음"
→ 남은 여정은 같으니 20만 남긴다
```
앞으로 남은 일은 "아직 안 간 도시를 돌고 0으로 돌아가기"뿐이라, 지금까지 들른 도시의 **집합**과 **현재 위치**만 같으면 들른 순서는 상관없다. 그래서 상태를 이렇게 잡는다.
- **상태**: `dp[mask][v]` = 0에서 출발해 집합 mask의 도시를 정확히 한 번씩 들르고 지금 v에 있을 때의 최소 비용. mask는 i번 비트가 1이면 도시 i를 들렀다는 정수다(알고리즘 기법 11편 「비트마스킹: 정수 하나로 집합 다루기」).
- **전이**: 아직 안 간 도시 w로 가면 `dp[mask | 1<<w][w] = min(…, dp[mask][v] + dist[v][w])`.
- **초기값**: `dp[1][0] = 0`(도시 0만 들르고 0에 있음).
- **답**: 모두 들른 `mask = 2ⁿ − 1`에서 `min(dp[full][v] + dist[v][0])`.

전이는 mask에 비트를 하나 켜므로 정수로 항상 커진다. 그래서 mask를 0부터 오름차순으로 돌면 필요한 칸이 미리 채워진다. 이 DP는 1962년 벨먼, 그리고 헬드와 카프가 각각 독립적으로 발표해 **헬드-카프 알고리즘**(Held–Karp algorithm)이라 부른다. TSP는 NP-어려운 문제라 다항 시간 알고리즘은 알려져 있지 않고, 이 방법도 지수 시간이지만 n!보다는 훨씬 작다.

## 구현과 경로 복원
`par[mask][v]`에 직전 도시를 적어 두고, 끝 상태에서 거꾸로 따라가며 mask에서 현재 도시의 비트를 끈다. 비교용으로 가장 가까운 곳부터 가는 탐욕도 함께 짠다.
```python
INF = float("inf")

def tsp(dist):                       # 0번에서 출발해 모두 돌고 돌아오기
    n, FULL = len(dist), 1 << len(dist)
    dp = [[INF] * n for _ in range(FULL)]   # dp[mask][v]
    par = [[-1] * n for _ in range(FULL)]   # 직전 도시(경로 복원용)
    dp[1][0] = 0                     # {0}을 방문하고 0에 있다
    for mask in range(FULL):         # 원소를 더하면 수가 커진다
        for v in range(n):
            if dp[mask][v] == INF:
                continue
            for w in range(n):
                if mask >> w & 1:    # 이미 간 도시
                    continue
                nm, c = mask | 1 << w, dp[mask][v] + dist[v][w]
                if c < dp[nm][w]:
                    dp[nm][w], par[nm][w] = c, v
    mask = FULL - 1
    best, v = min((dp[mask][v] + dist[v][0], v) for v in range(1, n))
    path = []
    while v != -1:                   # par를 따라 거꾸로
        path.append(v)
        mask, v = mask ^ 1 << v, par[mask][v]
    return best, path[::-1] + [0]

def nearest(dist):                   # 가장 가까운 도시부터 가는 탐욕
    n, path, total = len(dist), [0], 0
    while len(path) < n:
        v = path[-1]
        w = min((w for w in range(n) if w not in path),
                key=lambda w: dist[v][w])
        total += dist[v][w]
        path.append(w)
    return total + dist[path[-1]][0], path + [0]

D = [[0, 12, 10, 19, 8],
     [12, 0, 3, 7, 2],
     [10, 3, 0, 6, 20],
     [19, 7, 6, 0, 4],
     [8, 2, 20, 4, 0]]
print("DP  ", tsp(D))
print("탐욕", nearest(D))
```
```text
DP   (32, [0, 4, 3, 1, 2, 0])
탐욕 (38, [0, 4, 1, 2, 3, 0])
```
최적 경로는 8 + 4 + 7 + 3 + 10 = 32다. 탐욕은 4 → 1(거리 2), 1 → 2(거리 3)로 짧은 간선만 골랐지만 마지막에 3 → 0(거리 19)으로 돌아오느라 38이 되었다. 복원 루프의 `mask ^ 1 << v`는 파이썬에서 `<<`가 `^`보다 먼저 계산되어 `mask ^ (1 << v)`다.

## 왜 빨라지나: 연산 수
상태는 2ⁿ·n개, 상태마다 다음 도시 n개를 보므로 O(2ⁿ·n²)이다. 순열 완전 탐색은 (n−1)!개 순서마다 길이 n을 더한다.
```python
from math import factorial

for n in [8, 12, 16, 20]:
    perm = factorial(n - 1) * n      # 순열 (n−1)!개, 각각 길이 n 합
    dp = (1 << n) * n * n            # 상태 2ⁿ·n개, 전이 n개
    print(f"n={n:2} 순열 {perm:.1e}  DP {dp:.1e}  표 {(1 << n) * n:,}칸")
```
```text
n= 8 순열 4.0e+04  DP 1.6e+04  표 2,048칸
n=12 순열 4.8e+08  DP 5.9e+05  표 49,152칸
n=16 순열 2.1e+13  DP 1.7e+07  표 1,048,576칸
n=20 순열 2.4e+18  DP 4.2e+08  표 20,971,520칸
```
n = 8에서는 둘이 비슷하지만 n = 16이면 100만 배 넘게 차이 난다. 대신 표가 2ⁿ·n칸이라 메모리가 한계를 정한다. n = 20이면 2,100만 칸으로, 파이썬 리스트라면 칸마다 8바이트짜리 참조만 쳐도 160MB가 넘는다. 이것이 비트마스크 DP가 대개 n ≤ 20 안팎에서만 쓰이는 이유다.

## 할당 문제: dp[mask]
사람 n명에게 일 n개를 하나씩 맡기는데, 사람 i가 일 j를 맡는 비용이 `cost[i][j]`일 때 비용 합의 최솟값은? 사람을 0번부터 차례로 배정한다고 정하면, "지금까지 배정된 일의 집합" mask만으로 다음 차례가 정해진다. 배정된 일이 k개면 다음은 사람 k다. 그래서 현재 위치 같은 추가 정보 없이 `dp[mask]` 하나로 충분하고 O(2ⁿ·n)이다. 순열 n!개를 보는 완전 탐색과 비교하면 n = 15에서 약 1조 3천억 대 약 49만이다.
```python
def assign(cost):                    # cost[i][j]: 사람 i가 일 j를 맡는 비용
    n = len(cost)
    dp = [float("inf")] * (1 << n)   # dp[mask]: mask의 일이 이미 배정됨
    dp[0] = 0
    for mask in range(1 << n):
        i = mask.bit_count()         # 다음 차례 사람 = 배정된 일의 수
        if i == n:
            continue
        for j in range(n):
            if not mask >> j & 1:
                nm = mask | 1 << j
                dp[nm] = min(dp[nm], dp[mask] + cost[i][j])
    return dp[-1]

C = [[7, 3, 9, 6],
     [5, 8, 2, 7],
     [6, 4, 3, 9],
     [8, 6, 7, 2]]
print(assign(C))
```
```text
13
```
`int.bit_count()`는 파이썬 3.10부터 있는 popcount다. n이 수백이면 지수 시간은 쓸 수 없고, 헝가리안 알고리즘이나 최소 비용 유량으로 다항 시간에 푼다(그래프 알고리즘 13편 「최소 비용 최대 유량: 유량에 가격 붙이기」).

## 무작위 대조 검사
앞 코드에 이어서, 순열을 모두 시도하는 완전 탐색과 비교한다. n = 8인 경우 200개를 포함하고, 거리는 비대칭(가는 길과 오는 길이 다름)도 허용한다. 복원한 경로가 모든 도시를 한 번씩 도는 순회인지, 그 길이가 답과 같은지도 확인한다.
```python
import random
from itertools import permutations

def tour_cost(dist, path):
    return sum(dist[a][b] for a, b in zip(path, path[1:]))

rng = random.Random(6)
for t in range(500):
    n = 8 if t < 200 else rng.randint(2, 7)
    D = [[0 if i == j else rng.randint(1, 50) for j in range(n)]
         for i in range(n)]          # 비대칭 거리도 허용
    want = min(tour_cost(D, (0,) + p + (0,))
               for p in permutations(range(1, n)))
    best, path = tsp(D)
    assert best == want == tour_cost(D, path)
    assert path[0] == path[-1] == 0 and sorted(path[:-1]) == list(range(n))
    m = rng.randint(1, 7)
    C = [[rng.randint(1, 50) for _ in range(m)] for _ in range(m)]
    assert assign(C) == min(sum(C[i][p[i]] for i in range(m))
                            for p in permutations(range(m)))
print("무작위 500개 비교(n=8 200개 포함): 모두 일치")
```
```text
무작위 500개 비교(n=8 200개 포함): 모두 일치
```

## 자주 하는 실수와 변형
- 연산자 우선순위. 파이썬은 `<<`가 `&`보다, `&`가 `==`보다 먼저라 `mask & 1 << v == 0`이 의도대로 동작하지만, C·자바에서는 `==`가 `&`보다 먼저라 괄호 없이는 틀린다. 괄호를 습관처럼 친다.
- 출발점을 고정하지 않기. 순회는 어디서 시작해도 같은 고리이므로 0으로 고정하면 상태가 n배 준다.
- 돌아오지 않는 경로(시작점 자유)라면 모든 v에 `dp[1<<v][v] = 0`으로 시작하고 답은 `min(dp[full][v])`다.
- 도시 사이 "거리"가 일반 그래프의 최단 경로라면 먼저 그래프 알고리즘 4편 「플로이드-워셜: 모든 쌍 최단 경로」로 모든 쌍 거리를 구한 뒤 DP를 돌린다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| TSP 순열 완전 탐색 | O(n·(n−1)!) | O(n) |
| TSP 비트마스크 DP | O(2ⁿ·n²) | O(2ⁿ·n) |
| 할당 순열 완전 탐색 | O(n·n!) | O(n) |
| 할당 dp[mask] | O(2ⁿ·n) | O(2ⁿ) |

## 어디에 쓰이나
- 이산수학 6편 「경우의 수: 순열과 조합」: 순서를 세는 (n−1)!을 "집합 2ⁿ × 끝점 n"으로 바꾸는 것이 이 DP의 전부이며, 순서만 다른 경로들이 같은 (집합, 끝점) 상태로 합쳐진다.
- 이산수학 1편 「집합과 함수: 수학의 기본 언어」: mask는 집합의 특성 함수(원소면 1, 아니면 0)를 비트로 적은 것이라, 원소 확인과 원소 추가가 AND·OR 한 번이다.
- 데이터베이스 질의 최적화: System R(셀링거 등, 1979)은 조인할 릴레이션 집합마다 가장 싼 계획을 기억해 두 개, 세 개, …로 키워 가는 DP로 조인 순서를 정했고, 이 방식은 비용 기반 질의 최적화기의 기본 틀이 되었다.

## 정리
- 남은 일이 "어디를 들렀나"와 "지금 어디인가"에만 달려 있으면, 순서 대신 집합을 상태로 삼아 순서가 다른 경로를 합친다.
- TSP는 `dp[mask][v]`로 O(2ⁿ·n²) 시간, O(2ⁿ·n) 공간이고, `par`로 경로를 복원한다.
- 할당 문제는 배정 순서를 고정하면 `dp[mask]`만으로 O(2ⁿ·n)이다.
- 표가 2ⁿ칸 이상이라 n ≈ 20 안팎이 한계이고, 더 크면 문제 구조에 맞는 다른 알고리즘이 필요하다.

## 더 알아보기
- 이전 글: 5편 「구간 DP: 행렬 곱셈 순서와 파일 합치기」
- 다음 글: 7편 「트리 DP: 독립 집합과 리루팅」
- Held–Karp algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Held%E2%80%93Karp_algorithm
