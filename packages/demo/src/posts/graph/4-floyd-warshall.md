# [그래프 알고리즘 4/14] 플로이드-워셜: 모든 쌍 최단 경로

> **한 줄 요약** — 플로이드-워셜 알고리즘은 "중간에 거쳐도 되는 정점"을 하나씩 늘려 가는 세 겹 반복문으로 모든 정점 쌍의 최단 거리를 O(V³)에 구하며, k를 바깥 반복에 두어야 하는 이유가 곧 정확성의 근거다.

## 이 글에서 다루는 것
- 중간 정점 집합을 늘려 가는 점화식
- k를 바깥에 두는 이유와 잘못된 순서 실험
- 경로 복원과 음수 사이클 판정
- 비트셋으로 도달 가능성(추이 폐포) 구하기

## 예제와 단순한 방법
도시 몇 개 사이의 모든 쌍 거리표가 필요하고, 음수 간선도 있다. 시작점마다 3편의 벨만-포드를 돌리면 O(V²E), 간선이 빽빽하면 O(V⁴)다. 음수가 없다면 2편의 다익스트라를 V번 돌릴 수도 있지만, 정점이 수백 개 이하인 밀집 그래프라면 세 줄짜리 반복문 하나가 더 간단하다. 이 방법은 로이(Bernard Roy, 1959)와 워셜(Stephen Warshall, 1962)이 도달 가능성 버전으로, 플로이드(Robert Floyd, 1962)가 최단 거리 버전으로 발표했다.

## 점화식: 중간 정점을 하나씩 허용
`d(k)[i][j]`를 "중간에 정점 0..k−1만 거쳐도 될 때 i에서 j까지의 최단 거리"라고 하자. `d(0)`은 간선 그 자체다. 정점 k를 새로 허용하면 최단 경로는 k를 지나지 않거나, i → k → j로 한 번 지난다. 음수 사이클이 없으면 k를 두 번 지날 이유가 없다.
```text
d(k+1)[i][j] = min(d(k)[i][j],
      d(k)[i][k] + d(k)[k][j])
```
V단계 뒤의 `d(V)`가 답이다. 배열 하나로 덮어써도 되는 이유는 k단계에서 `d[i][k]`와 `d[k][j]`가 바뀌지 않기 때문이다. `d[k][k] = 0`이라 `d[i][k] + d[k][k]`가 `d[i][k]`보다 작을 수 없다. 경로는 `nxt[i][j]`(i에서 j로 갈 때의 첫 걸음)로 복원한다. k를 거치도록 갱신될 때 `nxt[i][k]`로 바꾸면 된다.
```python
INF = float("inf")

def floyd(n, edges):
    d = [[0 if i == j else INF for j in range(n)] for i in range(n)]
    nxt = [[j for j in range(n)] for _ in range(n)]  # i→j 첫 걸음
    for u, v, w in edges:
        d[u][v] = min(d[u][v], w)
    for k in range(n):                   # 중간 정점을 0..k로 넓힌다
        for i in range(n):
            for j in range(n):
                if d[i][k] + d[k][j] < d[i][j]:
                    d[i][j] = d[i][k] + d[k][j]
                    nxt[i][j] = nxt[i][k]
    return d, nxt

def path(nxt, i, j):
    p = [i]
    while i != j:
        i = nxt[i][j]
        p.append(i)
    return p

edges = [(0, 1, 3), (1, 2, -2), (2, 0, 4), (0, 3, 7), (2, 3, 1),
         (3, 1, 2)]
d, nxt = floyd(4, edges)
for row in d:
    print(" ".join(f"{x:>2}" for x in row))
print("0→3 경로:", path(nxt, 0, 3))
print("음수 사이클:", any(d[i][i] < 0 for i in range(4)))
```
```text
 0  3  1  2
 2  0 -2 -1
 4  3  0  1
 4  2  0  0
0→3 경로: [0, 1, 2, 3]
음수 사이클: False
```
0 → 3은 직행 간선(7)보다 0 → 1 → 2 → 3(3 − 2 + 1 = 2)이 짧다. 끝난 뒤 `d[i][i] < 0`인 i가 있으면 i에서 출발해 자기 자신으로 돌아오는 음수 길이 경로, 즉 음수 사이클이 있다.

## k를 바깥 반복에 두는 이유
k를 가장 안쪽에 두면(i, j, k 순서) `d[i][j]`를 확정하는 순간 `d[i][k]`나 `d[k][j]`가 아직 덜 계산되어 있을 수 있다. "k단계를 모두 끝낸 뒤 다음 k"라는 점화식의 구조가 깨진다.
```python
# 앞 코드에 이어서
import random

def floyd_ijk(n, edges, reps):           # 흔한 실수: k를 가장 안쪽에
    d = [[0 if i == j else INF for j in range(n)] for i in range(n)]
    for u, v, w in edges:
        d[u][v] = min(d[u][v], w)
    for _ in range(reps):
        for i in range(n):
            for j in range(n):
                for k in range(n):
                    d[i][j] = min(d[i][j], d[i][k] + d[k][j])
    return d

rng, bad = random.Random(4), [0, 0, 0]
for _ in range(1000):
    n = rng.randint(5, 10)
    edges = [(rng.randrange(n), rng.randrange(n), rng.randint(1, 20))
             for _ in range(rng.randint(n, 3 * n))]
    good = floyd(n, edges)[0]
    for r in range(3):
        bad[r] += floyd_ijk(n, edges, r + 1) != good
print("1000개 중 틀린 개수:", bad)  # 1·2·3번 반복
```
```text
1000개 중 틀린 개수: [579, 10, 0]
```
한 번만 돌리면 1000개 중 579개가 틀렸고, 두 번 돌려도 10개가 틀렸다. Hide, Kumabe, Maehara의 2019년 논문은 잘못된 순서라도 세 번 반복하면 항상 맞는다는 것을 증명했고, 이 실험에서도 세 번이면 모두 맞았다. 물론 답은 k를 바깥에 두는 것이다.

## 무작위 대조 검사
느린 답은 3편처럼 단순 경로와 단순 사이클을 모두 나열한다. 음수 간선을 섞고, 음수 사이클이 있으면 판정만, 없으면 거리 전체와 복원한 경로의 길이까지 비교한다.
```python
# 앞 코드에 이어서
from itertools import permutations

def slow(n, edges):                      # 단순 경로·사이클을 모두 나열
    w = {}
    for u, v, c in edges:
        w[u, v] = min(w.get((u, v), INF), c)
    d = [[INF] * n for _ in range(n)]
    neg = False
    for k in range(1, n + 1):
        for p in permutations(range(n), k):
            if all(e in w for e in zip(p, p[1:])):
                c = sum(w[e] for e in zip(p, p[1:]))
                d[p[0]][p[-1]] = min(d[p[0]][p[-1]], c)
                neg |= (p[-1], p[0]) in w and c + w[p[-1], p[0]] < 0
    return d, neg

ok = 0
for _ in range(500):
    n = rng.randint(1, 6)
    edges = [(rng.randrange(n), rng.randrange(n), rng.randint(-3, 9))
             for _ in range(rng.randint(0, 2 * n))]
    d, nxt = floyd(n, edges)
    sd, sneg = slow(n, edges)
    neg = any(d[i][i] < 0 for i in range(n))
    good = neg == sneg
    if not neg:                          # 음수 사이클이 없을 때만 거리 비교
        good &= d == sd
        for i in range(n):               # 복원한 경로의 길이도 확인
            for j in range(n):
                if d[i][j] < INF:
                    p = path(nxt, i, j)
                    good &= sum(min(c for a, b, c in edges if (a, b) == e)
                                for e in zip(p, p[1:])) == d[i][j]
    ok += good
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
무작위 500개 비교: 모두 일치
```

## 도달 가능성: 추이 폐포
가중치 없이 "갈 수 있나"만 알고 싶으면 min과 +를 OR와 AND로 바꾼다. 이것이 워셜의 원래 버전이다. 파이썬 정수를 비트셋으로 쓰면 i행 전체를 OR 한 번으로 갱신하므로, 비트 연산 하나가 n칸을 처리한다.
```python
# 앞 코드에 이어서
def closure(n, edges):                   # reach[i]의 j번 비트 = i에서 j로 감
    reach = [1 << i for i in range(n)]
    for u, v, _ in edges:
        reach[u] |= 1 << v
    for k in range(n):
        for i in range(n):
            if reach[i] >> k & 1:        # i가 k에 닿으면 k가 닿는 곳도
                reach[i] |= reach[k]     # 정수 OR 한 번에 n칸
    return reach

def bfs_reach(n, edges, s):
    seen, stack = {s}, [s]
    while stack:
        u = stack.pop()
        for a, b, _ in edges:
            if a == u and b not in seen:
                seen.add(b)
                stack.append(b)
    return sum(1 << v for v in seen)

g = [(0, 1, 0), (1, 2, 0), (2, 1, 0), (3, 0, 0)]
print([format(r, "04b")[::-1] for r in closure(4, g)])  # j번째 글자 = j
ok = 0
for _ in range(500):
    n = rng.randint(1, 10)
    edges = [(rng.randrange(n), rng.randrange(n), 0)
             for _ in range(rng.randint(0, 2 * n))]
    ok += closure(n, edges) == [bfs_reach(n, edges, s) for s in range(n)]
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
['1110', '0110', '0110', '1111']
무작위 500개 비교: 모두 일치
```
1 → 2 → 1 사이클이 있어 1과 2는 서로 닿고, 3은 0을 거쳐 모두에 닿는다. 느린 답은 정점마다 따로 탐색한 결과다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 벨만-포드 × V | O(V²E) | O(V + E) |
| 다익스트라 × V | O(V(V + E) log V) | O(V + E) |
| 플로이드-워셜 | O(V³) | O(V²) |
| 비트셋 추이 폐포 | O(V³/w) | O(V²/w) |

w는 한 워드의 비트 수다. V = 500이면 V³은 1.25억 번이라 파이썬으로는 무겁다. 희소 그래프에 음수 간선이 있으면, 벨만-포드로 구한 퍼텐셜로 가중치를 음수 없이 바꾼 뒤 다익스트라를 V번 돌리는 존슨 알고리즘(Johnson's algorithm)이 O(VE log V)다.

## 어디에 쓰이나
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: 관계를 방향 그래프로 보면 추이 폐포는 추이성을 만족하도록 쌍을 최소한으로 더한 관계이고, 위 비트셋 코드가 그것을 계산한다.
- 선형대수 3편 「행렬과 행렬 곱」: 행렬 곱의 (×, +)를 (+, min)으로 바꾼 min-plus 곱으로 거리 행렬을 제곱하면 간선 2개, 4개, … 이하 최단 거리가 되고, 플로이드-워셜은 같은 결과를 O(V³) 한 번에 낸다.
- 수학·기하 알고리즘 3편 「빠른 거듭제곱과 행렬 거듭제곱」: "간선을 정확히 k개 쓰는 최단 거리"처럼 간선 수가 정해진 문제는 min-plus 행렬 거듭제곱으로 푼다.

## 정리
- `d[i][j]`를 "중간 정점 0..k−1만 허용" 단계로 넓혀 가며, 새 정점 k는 거치거나 안 거치거나 둘 중 하나다.
- k가 바깥 반복이어야 점화식 그대로이고, 안쪽에 두면 한 번으로는 틀린다.
- `nxt`로 경로를 복원하고, 끝난 뒤 `d[i][i] < 0`이면 음수 사이클이 있다.
- min과 +를 OR와 AND로 바꾸면 추이 폐포가 되고, 비트셋으로 워드 크기만큼 빨라진다.

## 더 알아보기
- 이전 글: 3편 「벨만-포드: 음수 간선과 음수 사이클」
- 다음 글: 5편 「최소 신장 트리: 크루스칼과 프림」
- 잘못된 순서를 세 번 반복하면 맞는다는 논문(arXiv): https://arxiv.org/abs/1904.01210
