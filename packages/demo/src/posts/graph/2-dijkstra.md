# [그래프 알고리즘 2/14] 다익스트라 알고리즘: 음수 없는 최단 경로

> **한 줄 요약** — 다익스트라 알고리즘은 아직 확정되지 않은 정점 중 가장 가까운 것을 힙에서 꺼내 확정하기를 반복해 음수 없는 가중치 그래프의 최단 경로를 O((V + E) log V)에 구하며, 음수 간선 하나가 이 "꺼내면 확정" 논리를 깨뜨린다.

## 이 글에서 다루는 것
- 가중치가 있으면 BFS가 틀리는 이유
- 가장 가까운 정점부터 확정해도 되는 이유(불변식)
- heapq 구현: 지연 삭제와 경로 복원
- 음수 간선 반례와 벨만-포드 대조 검사

## 예제: 도로망의 최단 거리
도시 A~F와 양방향 도로의 길이가 주어진다. A에서 각 도시까지의 최단 거리와 F까지의 경로를 구하자. 1편의 BFS는 간선 수만 세므로 간선 3개짜리 경로(A → C → E → F, 길이 10 등)를 고르지만, 실제 최단은 간선 5개짜리 A → C → B → D → E → F(길이 8)다. 가능한 경로를 모두 따지면 경로 수가 지수적으로 늘어난다.

## 아이디어: 가장 가까운 정점부터 확정
에츠허르 다익스트라(Edsger W. Dijkstra)는 2001년 인터뷰에서 1956년 암스테르담의 카페 테라스에서 이 알고리즘을 20분쯤 만에 설계했다고 회고했고, 논문은 1959년에 나왔다. 방법은 이렇다. 시작점의 거리를 0, 나머지를 ∞로 두고, 아직 확정되지 않은 정점 중 거리가 가장 작은 u를 골라 확정한 뒤, u에서 나가는 간선으로 이웃의 거리를 줄인다(**완화**, relaxation: `dist[v] = min(dist[v], dist[u] + w)`).

불변식은 "확정된 정점의 거리는 진짜 최단 거리"다. u가 미확정 중 가장 가깝다고 하자. 시작점에서 u로 가는 어떤 경로든 확정 집합을 처음 벗어나는 간선 x → y가 있다.
```text
s ─(확정 집합)→ x → y ─(나머지)→ u
경로 길이 ≥ dist[y] ≥ dist[u]
```
x를 확정할 때 x → y를 완화했으므로 y까지의 앞부분은 `dist[y]` 이상이고, u를 골랐으니 `dist[y] ≥ dist[u]`이며, 나머지 부분은 **음수가 아니므로** 길이를 줄이지 못한다. 그래서 `dist[u]`보다 짧은 경로는 없다.

## 구현: 힙과 지연 삭제
"미확정 중 가장 작은 것"은 힙(우선순위 큐)으로 꺼낸다. 파이썬 heapq에는 값을 줄이는 연산이 없어서, 거리가 줄 때마다 새 항목을 넣고 꺼낼 때 낡은 항목(`d > dist[u]`)은 버린다(**지연 삭제**). 경로는 마지막으로 거리를 줄여 준 정점 `prev`를 거꾸로 따라가 복원한다.
```python
import heapq
import random

ops = {"push": 1, "pop": 0}               # 힙 연산 횟수

def dijkstra(adj, s, t=None):
    dist, prev = {s: 0}, {s: None}
    pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        ops["pop"] += 1
        if d > dist[u]:                  # 이미 더 짧게 꺼낸 정점
            continue
        if u == t:                       # 꺼내는 순간 확정된다
            break
        for v, w in adj[u]:
            if d + w < dist.get(v, float("inf")):
                dist[v], prev[v] = d + w, u
                heapq.heappush(pq, (d + w, v))
                ops["push"] += 1
    return dist, prev

def path(prev, v):                       # prev를 거꾸로 따라간다
    p = []
    while v is not None:
        p.append(v)
        v = prev[v]
    return p[::-1]

roads = [("A", "B", 4), ("A", "C", 1), ("C", "B", 2), ("B", "D", 1),
         ("C", "D", 5), ("D", "E", 3), ("C", "E", 8), ("E", "F", 1),
         ("D", "F", 6)]
adj = {v: [] for v in "ABCDEF"}
for u, v, w in roads:                    # 양방향 도로
    adj[u].append((v, w))
    adj[v].append((u, w))
dist, prev = dijkstra(adj, "A")
print(" ".join(f"{v}={dist[v]}" for v in "ABCDEF"))
print(" → ".join(path(prev, "F")), dist["F"])
```
```text
A=0 B=3 C=1 D=4 E=7 F=8
A → C → B → D → E → F 8
```
도착점이 하나면 그 정점을 **꺼낼 때** 멈춰도 된다. 힙에 넣을 때는 아직 확정이 아니다.

## 음수 간선이면 틀리는 이유
```python
# 앞 코드에 이어서
def bellman_ford(adj, s):                # 느리지만 음수 간선도 맞다
    dist = {v: float("inf") for v in adj}
    dist[s] = 0
    for _ in range(len(adj) - 1):
        for u in adj:
            for v, w in adj[u]:
                dist[v] = min(dist[v], dist[u] + w)
    return dist

neg = {"S": [("A", 2), ("B", 5)], "A": [("C", 1)],
       "B": [("A", -4)], "C": []}
print("A에서 멈춤:", dijkstra(neg, "S", "A")[0]["A"])
ops["pop"] = 0
print("끝까지:", dijkstra(neg, "S")[0]["A"], "/ 꺼낸 횟수", ops["pop"])
print("벨만-포드:", bellman_ford(neg, "S")["A"])
```
```text
A에서 멈춤: 2
끝까지: 1 / 꺼낸 횟수 6
벨만-포드: 1
```
S에서 A(2)가 B(5)보다 가까워 먼저 확정되지만, 실제로는 S → B → A가 5 − 4 = 1이다. 증명의 "나머지 부분은 음수가 아니다"가 깨진 것이다. A에서 멈추면 2를 답한다. 끝까지 돌리면 지연 삭제 구현은 A를 다시 넣어 1로 고치지만, 정점 4개에서 6번 꺼냈다. "꺼내면 확정"이 무너졌으니 한 정점을 몇 번 꺼낼지 보장이 없다. 모든 간선에 같은 수를 더해 음수를 없애는 것도 틀린다. 간선이 많은 경로일수록 더 많이 더해져 최단 경로가 바뀌기 때문이다. 음수 간선은 3편의 벨만-포드로 푼다.

## 무작위 대조 검사
모든 간선을 V − 1번 완화하는 벨만-포드(3편)를 느린 답으로 쓴다. 거리뿐 아니라 복원한 경로의 길이가 거리와 같은지도 본다.
```python
# 앞 코드에 이어서
rng, ok = random.Random(7), 0
for _ in range(500):
    n = rng.randint(1, 8)
    g = {v: [] for v in range(n)}
    for _ in range(rng.randint(0, 3 * n)):
        g[rng.randrange(n)].append((rng.randrange(n), rng.randint(0, 9)))
    dist, prev = dijkstra(g, 0)
    slow = bellman_ford(g, 0)
    good = all(dist.get(v, float("inf")) == slow[v] for v in g)
    for v in dist:                       # 복원한 경로의 길이도 확인
        p = path(prev, v)
        good &= sum(min(w for x, w in g[a] if x == b)
                    for a, b in zip(p, p[1:])) == dist[v]
    ok += good
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
무작위 500개 비교: 모두 일치
```

## 연산 횟수
```python
# 앞 코드에 이어서
n, m = 100_000, 400_000
big = {v: [] for v in range(n)}
for _ in range(m):
    big[rng.randrange(n)].append((rng.randrange(n), rng.randint(1, 100)))
ops.update(push=1, pop=0)
dijkstra(big, 0)
print(f"V={n}, E={m}")
print(f"push {ops['push']}, pop {ops['pop']}")
```
```text
V=100000, E=400000
push 128768, pop 128768
```
push는 "거리를 줄인 횟수 + 1"이라 최악이 E + 1이지만, 무작위 가중치에서는 정점당 1.3번 정도였다. 힙 연산 하나가 O(log V)이므로 전체는 O((V + E) log V)다.

## 복잡도
| 방법 | 시간 | 언제 |
|---|---|---|
| 벨만-포드 | O(VE) | 음수 간선 |
| 배열 다익스트라 | O(V²) | 밀집 그래프 |
| 이진 힙 | O((V + E) log V) | 희소 그래프 |
| 피보나치 힙 | O(E + V log V) | 주로 이론 |

배열 버전은 매번 V개를 훑어 최솟값을 찾으므로 간선이 V²에 가까우면 힙보다 낫다. 피보나치 힙(프레드먼·타잔, 1984년 발표)은 점근적으로 가장 빠르지만 상수가 커서 실제로는 이진 힙을 주로 쓴다. 공간은 O(V + E)다.

## 변형: 할인권 k장
예제: 도로 하나의 비용을 0으로 만드는 할인권이 k장 있을 때 최소 비용은? 1편의 상태 공간처럼 정점을 (도시, 쓴 할인권 수)로 늘리면 그래프가 k + 1층이 되고, 할인권을 쓰는 간선은 비용 0으로 다음 층에 내려간다. 늘린 그래프에서 다익스트라를 한 번 돌리면 된다. 느린 답은 공짜로 만들 간선 조합을 모두 골라 매번 다익스트라를 돌린다.
```python
# 앞 코드에 이어서
from itertools import combinations

def coupon(adj, s, t, k):                # 상태 = (정점, 쓴 할인권 수)
    lay = {(v, j): [] for v in adj for j in range(k + 1)}
    for v in adj:
        for x, w in adj[v]:
            for j in range(k + 1):
                lay[(v, j)].append(((x, j), w))
                if j < k:                # 할인권을 쓰면 비용 0, 층 + 1
                    lay[(v, j)].append(((x, j + 1), 0))
    dist = dijkstra(lay, (s, 0))[0]
    return min(dist.get((t, j), float("inf")) for j in range(k + 1))

def coupon_slow(adj, s, t, k):           # 공짜로 만들 간선을 직접 고른다
    edges = [(v, i) for v in adj for i in range(len(adj[v]))]
    best = float("inf")
    for r in range(k + 1):
        for free in combinations(edges, r):
            g = {v: [(x, 0 if (v, i) in free else w)
                     for i, (x, w) in enumerate(adj[v])] for v in adj}
            best = min(best, dijkstra(g, s)[0].get(t, float("inf")))
    return best

print("할인권 1장으로 F까지:", coupon(adj, "A", "F", 1))
ok = 0
for _ in range(300):
    n, k = rng.randint(3, 6), rng.randint(0, 2)
    g = {v: [] for v in range(n)}
    for _ in range(rng.randint(n, 4 * n)):
        g[rng.randrange(n)].append((rng.randrange(n), rng.randint(1, 9)))
    ok += coupon(g, 0, n - 1, k) == coupon_slow(g, 0, n - 1, k)
print("무작위 300개 비교:", "모두 일치" if ok == 300 else ok)
```
```text
할인권 1장으로 F까지: 2
무작위 300개 비교: 모두 일치
```
C–E 도로(8)를 공짜로 만들면 A → C → E → F가 1 + 0 + 1 = 2다. 상태 수가 V(k + 1)로 늘 뿐이라 O(k(V + E) log(kV))다.

## 그 밖의 변형
- 여러 시작점: 모두 거리 0으로 힙에 넣는다(1편과 같은 가상 시작점).
- 최단 경로 개수: 거리가 같아질 때 개수를 더하고, 줄어들 때 덮어쓴다.
- 도착점에서 거꾸로: 모든 정점에서 한 도착점까지의 거리는 간선을 뒤집은 그래프에서 한 번 돌린다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 그 글이 "가중치가 있으면 BFS 대신 다익스트라 같은 방법이 필요하다"고 남긴 방법이 이것이고, 가중치가 모두 1이면 힙이 큐처럼 동작해 BFS와 같아진다.
- 인터넷 라우팅(OSPF): 각 라우터가 링크 상태를 모아 자신을 뿌리로 한 최단 경로 트리를 다익스트라로 계산한다.
- 게임 자원 관리 11편 「경로 탐색 아끼기: `A*`, 계층적 탐색, 플로우 필드」: `A*`는 힙의 키를 "지금까지 거리 + 목표까지 추정 거리"로 바꾼 다익스트라다.
- 고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」: heapq가 push와 pop을 O(log n)에 하는 원리를 다룬다.

## 정리
- 다익스트라는 미확정 정점 중 가장 가까운 것을 꺼내 확정하고 이웃을 완화한다.
- 정확성은 "나머지 경로는 음수가 아니다"에 기대므로 음수 간선이 하나라도 있으면 보장이 깨진다.
- heapq에는 값 줄이기가 없으니 새로 넣고 낡은 항목을 꺼낼 때 버리며, prev로 경로를 복원한다.
- 이진 힙으로 O((V + E) log V), 밀집 그래프는 배열로 O(V²)다.

## 더 알아보기
- 이전 글: 1편 「BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색」
- 다음 글: 3편 「벨만-포드: 음수 간선과 음수 사이클」
- 위키백과 영어판 Dijkstra's algorithm: https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm
