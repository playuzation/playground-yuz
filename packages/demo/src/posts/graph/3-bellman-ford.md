# [그래프 알고리즘 3/14] 벨만-포드: 음수 간선과 음수 사이클

> **한 줄 요약** — 벨만-포드 알고리즘은 모든 간선을 V − 1번 완화해 음수 간선이 있어도 최단 거리를 구하고, V번째에도 줄어드는 정점이 있으면 음수 사이클을 찾아내 그 영향을 받는 정점만 −∞로 표시한다.

## 이 글에서 다루는 것
- V − 1번 완화로 충분한 이유
- 음수 사이클 검출, 사이클 복원, −∞가 되는 정점
- 단순 경로·사이클을 모두 나열하는 대조 검사
- SPFA의 장점과 최악의 경우, 차분 제약 변형

## 예제: 보상이 있는 길
게임 지도에서 간선 비용이 시간이나 연료라면 보상 구간(음수 비용)이 생길 수 있다. 2편에서 본 것처럼 음수 간선이 있으면 다익스트라는 틀린다. 더 나쁜 것은 합이 음수인 **음수 사이클**이다. 그 사이클을 돌수록 비용이 끝없이 줄어 최단 거리가 존재하지 않는다(−∞). 이 문제의 해법은 1955년 심벨(Alfonso Shimbel)이 먼저 제안했고 포드(Lester Ford Jr., 1956)와 벨만(Richard Bellman, 1958)의 이름으로 불린다. 무어(Edward F. Moore)도 1959년에 변형을 발표해 벨만-포드-무어라고도 한다.

## 아이디어: 모든 간선을 V − 1번 완화
모든 간선을 한 번씩 완화하는 일(한 라운드)을 V − 1번 반복한다. 불변식은 "k 라운드 뒤 `dist[v]`는 간선 k개 이하인 경로 중 가장 짧은 것 이하"다. 이산수학 4편 「수학적 귀납법과 재귀」의 귀납법으로 보면, 그런 경로의 마지막 간선이 u → v일 때 u까지는 간선 k − 1개 이하라 k − 1 라운드 뒤 `dist[u]`가 이미 그 이하이고, k번째 라운드에서 u → v를 완화하면 된다. 음수 사이클이 없으면 최단 경로에서 사이클을 빼도 길어지지 않으므로 같은 정점을 두 번 지나지 않는 경로, 즉 간선 V − 1개 이하의 경로가 최단이다. 그래서 V − 1 라운드면 충분하고, 한 라운드에서 아무것도 줄지 않으면 일찍 끝내도 된다.

## 음수 사이클과 −∞
V번째 라운드에서도 줄어드는 정점이 있으면 모든 단순 경로보다 짧은 걸음이 생긴 것이므로, 그 걸음 안에 음수 사이클이 있다. 거꾸로 시작점에서 닿는 음수 사이클이 있으면, 사이클의 간선마다 `dist[u] + w − dist[v]`를 더한 값이 dist끼리 지워져 사이클 길이(음수)가 되므로 적어도 한 간선은 더 줄일 수 있다. 따라서 V번째 라운드에서 준 정점들에서 갈 수 있는 정점이 정확히 −∞인 정점이다. 사이클은 그런 정점에서 prev를 V번 따라가 사이클 안으로 들어간 뒤 한 바퀴 돌아 얻는다.
```python
INF = float("inf")

def bellman_ford(n, edges, s):
    dist, prev = [INF] * n, [-1] * n
    dist[s] = 0
    for _ in range(n):                   # n−1번이면 충분, n번째는 검사
        hot = []
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v], prev[v] = dist[u] + w, u
                hot.append(v)
        if not hot:                      # 더 줄지 않으면 끝
            return dist, None
    x = hot[0]
    for _ in range(n):                   # prev를 n번 따라가면 사이클 위
        x = prev[x]
    cyc = [x]
    while prev[cyc[-1]] != x:
        cyc.append(prev[cyc[-1]])
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append(v)
    while hot:                           # n번째에도 준 정점에서
        u = hot.pop()                    # 갈 수 있는 곳은 모두 −∞
        if dist[u] > -INF:
            dist[u] = -INF
            hot += adj[u]
    return dist, cyc[::-1]

edges = [(0, 1, 4), (0, 2, 2), (2, 1, -1), (1, 3, 2), (3, 2, 1),
         (3, 6, 1), (0, 4, 3), (4, 5, -2)]
print(bellman_ford(7, edges, 0))
edges[4] = (3, 2, -2)                    # 사이클 1→3→2→1 = −1
print(bellman_ford(7, edges, 0))
```
```text
([0, 1, 2, 3, 3, 1, 4], None)
([0, -inf, -inf, -inf, 3, 1, -inf], [1, 3, 2])
```
첫 줄은 음수 간선(2 → 1, 4 → 5)만 있어 모두 유한하다. 3 → 2를 −2로 바꾸면 1 → 3 → 2 → 1이 2 − 2 − 1 = −1인 사이클이 되어 1, 2, 3과 거기서 닿는 6이 −∞가 된다. 사이클에서 닿지 않는 4, 5는 그대로다. 음수 사이클이 하나 있다고 모든 거리를 버리면 안 되는 이유다.

## 무작위 대조 검사
느린 답은 정의를 그대로 옮긴다. 정점 7개 이하에서 단순 경로와 단순 사이클을 순열로 모두 나열해, 시작점 → 음수 사이클 → v가 가능하면 −∞, 아니면 단순 경로의 최솟값으로 둔다. 찾아낸 사이클이 정말 음수 사이클인지도 확인한다.
```python
# 앞 코드에 이어서
import random
from itertools import permutations

def slow(n, edges, s):                   # 단순 경로와 단순 사이클을 모두 나열
    w = {}
    for u, v, c in edges:
        w[u, v] = min(w.get((u, v), INF), c)
    best = [[INF] * n for _ in range(n)]  # best[a][b]: a→b 단순 경로 최소
    neg = []                             # 음수 사이클 위의 정점
    for k in range(1, n + 1):
        for p in permutations(range(n), k):
            if all(e in w for e in zip(p, p[1:])):
                c = sum(w[e] for e in zip(p, p[1:]))
                best[p[0]][p[-1]] = min(best[p[0]][p[-1]], c)
                if (p[-1], p[0]) in w and c + w[p[-1], p[0]] < 0:
                    neg.append(p[0])
    dist = best[s][:]
    for c in neg:                        # s → 음수 사이클 → v 이면 −∞
        if best[s][c] < INF:
            for v in range(n):
                if best[c][v] < INF:
                    dist[v] = -INF
    return dist

def cycle_ok(edges, cyc):                # 찾은 사이클이 진짜 음수 사이클인가
    w = {}
    for u, v, c in edges:
        w[u, v] = min(w.get((u, v), INF), c)
    loop = list(zip(cyc, cyc[1:] + cyc[:1]))
    return all(e in w for e in loop) and sum(w[e] for e in loop) < 0

rng, ok, cnt = random.Random(3), 0, 0
for _ in range(500):
    n = rng.randint(1, 7)
    edges = [(rng.randrange(n), rng.randrange(n), rng.randint(-3, 6))
             for _ in range(rng.randint(0, 2 * n))]
    dist, cyc = bellman_ford(n, edges, 0)
    cnt += cyc is not None
    ok += dist == slow(n, edges, 0) and (cyc is None or cycle_ok(edges, cyc))
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
print("그중 음수 사이클이 있던 경우:", cnt)
```
```text
무작위 500개 비교: 모두 일치
그중 음수 사이클이 있던 경우: 92
```

## SPFA: 줄어든 정점만 다시 보기
한 라운드에서 거리가 줄지 않은 정점의 간선은 다음 라운드에 다시 봐도 소용없다. 줄어든 정점만 큐에 넣고 그 간선만 다시 완화하는 변형이 **SPFA**(Shortest Path Faster Algorithm)다. 이 이름은 1994년 중국의 돤판딩(Duan Fanding)이 붙였지만 같은 생각은 그 전에도 있었다. 음수 사이클은 한 정점이 큐에 V번 이상 들어가는지로 검출한다.
```python
# 앞 코드에 이어서
from collections import deque

def spfa(n, edges, s):                   # 줄어든 정점의 간선만 다시 본다
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    dist, inq, checks = [INF] * n, [False] * n, 0
    dist[s] = 0
    q = deque([s])
    while q:
        u = q.popleft()
        inq[u] = False
        for v, w in adj[u]:
            checks += 1
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if not inq[v]:
                    inq[v] = True
                    q.append(v)
    return dist, checks

def bf_checks(n, edges, s):              # 일찍 끝내는 벨만-포드의 간선 검사 수
    dist, checks = [INF] * n, 0
    dist[s] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            checks += 1
            if dist[u] + w < dist[v]:
                dist[v], changed = dist[u] + w, True
        if not changed:
            break
    return dist, checks

n = 2000
rand = [(rng.randrange(n), rng.randrange(n), rng.randint(1, 100))
        for _ in range(4 * n)]
bad = [(0, k, 2 * k) for k in range(n - 1, 1, -1)] + \
      [(k, k + 1, 1) for k in range(n - 1)]  # 0→k 직행은 2k, 사슬은 k
for name, g in (("무작위", rand), ("사슬", bad)):
    (d1, c1), (d2, c2) = bf_checks(n, g, 0), spfa(n, g, 0)
    print(name, "벨만-포드", c1, "SPFA", c2, d1 == d2)
```
```text
무작위 벨만-포드 80000 SPFA 14078 True
사슬 벨만-포드 7994 SPFA 1999000 True
```
무작위 그래프에서 SPFA는 벨만-포드의 5분의 1도 안 되는 간선을 봤다. 그러나 직행 간선이 먼저 들어가고 사슬을 따라 조금씩 고쳐지는 그래프에서는 정점 k가 k번쯤 고쳐져 약 V²/2번을 봤다. 거꾸로 사슬 간선을 역순으로 주면 벨만-포드가 (V − 1)²번, SPFA가 V − 1번을 본다. 둘 다 최악은 O(VE)이므로, 음수 간선이 없으면 다익스트라가 안전하다.

## 변형: 차분 제약
`x[v] − x[u] ≤ c` 꼴 부등식 여러 개를 함께 만족하는 값을 찾는 문제는 간선 u → v(가중치 c)로 바꿀 수 있다. 완화가 끝난 최단 거리는 언제나 `dist[v] ≤ dist[u] + c`를 만족하기 때문이다. 모든 변수로 비용 0 간선을 잇는 가상 시작점에서 벨만-포드를 돌리면 dist가 곧 해이고, 음수 사이클이 있으면 제약끼리 모순이라 해가 없다.
```python
# 앞 코드에 이어서
from itertools import product

def solve(n, cons):                      # cons: x[v] − x[u] ≤ c 를 (u, v, c)로
    edges = cons + [(n, v, 0) for v in range(n)]  # n = 가상의 시작점
    dist, cyc = bellman_ford(n + 1, edges, n)
    return None if cyc else dist[:n]

# 작업 0, 1, 2의 시작 시각: 1은 0보다 3 이상 늦게, 2는 1보다 1 이내,
# 2는 0보다 5 이상 늦게
print(solve(3, [(1, 0, -3), (1, 2, 1), (2, 0, -5)]))
print(solve(3, [(1, 0, -3), (1, 2, 1), (2, 0, -5), (0, 2, 3)]))

ok = 0
for _ in range(300):
    n = rng.randint(1, 4)
    cons = [(rng.randrange(n), rng.randrange(n), rng.randint(-2, 2))
            for _ in range(rng.randint(0, 6))]
    x = solve(n, cons)
    sat = lambda y: all(y[v] - y[u] <= c for u, v, c in cons)
    exists = any(sat(y) for y in product(range(-2 * n, 1), repeat=n))
    ok += (x is not None) == exists and (x is None or sat(x))
print("무작위 300개 비교:", "모두 일치" if ok == 300 else ok)
```
```text
[-5, 0, 0]
None
무작위 300개 비교: 모두 일치
```
모든 변수에 같은 수를 더해도 차이는 그대로라 [−5, 0, 0]에 5를 더한 [0, 5, 5]도 해다. "2는 0보다 3 이하로 늦게"를 더하면 "5 이상"과 모순이라 음수 사이클이 생긴다. 느린 답은 범위 [−2n, 0]의 정수를 모두 대입한다. 가상 시작점에서의 최단 거리는 0 이하이고, 가중치 −2 이상인 간선을 n개 미만 지나므로 해가 있으면 이 범위에 하나가 반드시 있다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 벨만-포드 | O(VE) | 음수 사이클 검출 |
| SPFA | 최악 O(VE) | 대개 훨씬 적다 |
| 다익스트라 | O((V + E) log V) | 음수 간선 불가 |

벨만-포드는 라운드 V번 × 간선 E개이고, −∞ 전파와 사이클 복원은 O(V + E)다. 공간은 O(V + E)다.

## 어디에 쓰이나
- 인터넷 라우팅(RIP): 거리 벡터 프로토콜로, 각 라우터가 이웃이 알려 준 거리표로 자기 거리를 완화하는 분산 벨만-포드다.
- 미적분 4편 「지수 함수와 로그 함수」: 환율을 차례로 곱해 1보다 커지는 환전 사이클은 `−log(환율)`을 가중치로 두면 곱이 합으로 바뀌어 음수 사이클 검출 문제가 된다.
- 동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」: "간선 k개 이하 최단 거리"를 상태로 둔 점화식이 벨만-포드이고, 위 구현은 이를 1차원 배열 하나로 줄인 것이다.
- 4편 「플로이드-워셜: 모든 쌍 최단 경로」: 모든 쌍이 필요하면 벨만-포드를 V번(O(V²E)) 돌리는 대신 O(V³) 하나로 끝낸다.

## 정리
- 벨만-포드는 모든 간선을 V − 1번 완화하며, k 라운드 뒤에는 간선 k개 이하 경로가 모두 반영된다.
- V번째에도 줄면 음수 사이클이 있고, 그때 준 정점에서 닿는 정점만 −∞다.
- SPFA는 줄어든 정점만 다시 봐서 대개 빠르지만 최악은 똑같이 O(VE)다.
- `x[v] − x[u] ≤ c` 꼴 제약은 간선으로 바꿔 풀고, 음수 사이클이면 해가 없다.

## 더 알아보기
- 이전 글: 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」
- 다음 글: 4편 「플로이드-워셜: 모든 쌍 최단 경로」
- 위키백과 영어판 Bellman–Ford algorithm: https://en.wikipedia.org/wiki/Bellman%E2%80%93Ford_algorithm
