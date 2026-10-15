# [그래프 알고리즘 5/14] 최소 신장 트리: 크루스칼과 프림

> **한 줄 요약** — 최소 신장 트리는 모든 정점을 잇는 간선 V − 1개의 무게 합을 최소로 고르는 문제로, "컷을 건너는 가장 가벼운 간선은 안전하다"는 컷 성질 하나에서 정렬과 유니온 파인드의 크루스칼, 힙의 프림이 모두 나온다.

## 이 글에서 다루는 것
- 신장 트리와 완전 탐색의 비용
- 컷 성질과 교환 논증
- 크루스칼(정렬 + 유니온 파인드)과 프림(힙)
- 두 결과 비교와 두 번째 최소 신장 트리

## 예제: 마을을 가장 싸게 잇기
마을 7개와 도로 후보 11개(공사비)가 있다. 모든 마을이 오갈 수 있도록 도로를 골라 공사비 합을 최소로 하라. 사이클이 있으면 그중 한 간선을 빼도 연결은 그대로이므로 답은 트리이고, 정점 V개짜리 트리는 간선이 V − 1개다(이산수학 9편 「트리: 계층 구조와 구문 트리」). 모든 정점을 잇는 트리를 **신장 트리**(spanning tree), 무게 합이 최소인 것을 **최소 신장 트리**(MST)라 한다. 간선 V − 1개 조합을 모두 보면 C(E, V − 1)가지라 금방 불가능해진다.

보루프카(Otakar Borůvka)가 1926년 전력망을 가장 싸게 잇는 문제로 처음 발표했고, 야르니크(Vojtěch Jarník, 1930), 크루스칼(Joseph Kruskal, 1956), 프림(Robert Prim, 1957)이 뒤를 이었다. 프림의 방법은 야르니크의 방법을 다시 찾은 것이고, 2편의 1959년 다익스트라 논문도 이 문제를 함께 다뤘다.

## 컷 성질
정점을 두 묶음으로 나눈 것을 **컷**(cut)이라 한다. 컷 성질은 "컷을 건너는 간선 중 가장 가벼운 e는 어떤 MST에 들어 있다"이다. 교환 논증으로 보이자. e가 없는 MST T가 있다고 하면, T에 e를 더할 때 사이클이 정확히 하나 생긴다. 그 사이클은 컷을 건너갔다 돌아와야 하므로 컷을 건너는 다른 간선 f가 있고, `w(f) ≥ w(e)`이다. 그러면 T + e − f는 무게가 늘지 않은 신장 트리, 즉 e를 포함한 MST다.
```text
 한쪽 묶음      다른 묶음
   u ──── e ──── v
   ┊             ┊
   x ──── f ──── y
```
두 알고리즘은 이 성질로 간선을 하나씩 확정한다.
- **크루스칼**: 간선을 가벼운 순으로 보며 서로 다른 덩어리를 잇는 간선이면 고른다. 더 가벼운 간선은 이미 처리되었으니, 이 간선은 "한 덩어리 대 나머지" 컷을 건너는 가장 가벼운 간선이다. 덩어리 판정은 유니온 파인드로 한다.
- **프림**: 한 정점에서 시작해, 지금 트리와 바깥을 가르는 컷을 건너는 가장 가벼운 간선을 힙에서 꺼내 붙인다. 2편의 다익스트라와 모양이 같고 힙의 키가 "시작점까지 거리" 대신 "간선 하나의 무게"일 뿐이다.

```python
import heapq
import random

def kruskal(n, edges):                   # edges: (가중치, u, v)
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # 경로 절반 압축
            x = parent[x]
        return x
    tree = []
    for w, u, v in sorted(edges):        # 가벼운 간선부터
        ru, rv = find(u), find(v)
        if ru != rv:                     # 다른 덩어리를 잇는 간선만
            parent[ru] = rv
            tree.append((w, u, v))
    return tree if len(tree) == n - 1 else None

def prim(n, edges):
    adj = [[] for _ in range(n)]
    for w, u, v in edges:
        adj[u].append((w, u, v))
        adj[v].append((w, v, u))
    seen, tree, pq = [False] * n, [], [(0, -1, 0)]
    while pq:
        w, p, u = heapq.heappop(pq)      # 트리 밖으로 가는 가장 싼 간선
        if seen[u]:
            continue
        seen[u] = True
        if p >= 0:
            tree.append((w, p, u))
        for e in adj[u]:
            if not seen[e[2]]:
                heapq.heappush(pq, e)
    return tree if len(tree) == n - 1 else None

roads = [(7, 0, 1), (5, 0, 3), (8, 1, 2), (9, 1, 3), (7, 1, 4),
         (5, 2, 4), (15, 3, 4), (6, 3, 5), (8, 4, 5), (11, 5, 6),
         (9, 4, 6)]
for f in (kruskal, prim):
    t = f(7, roads)
    print(f.__name__, sum(w for w, _, _ in t),
          " ".join(f"{u}-{v}" for _, u, v in t))
```
```text
kruskal 39 0-3 2-4 3-5 0-1 1-4 4-6
prim 39 0-3 3-5 0-1 1-4 4-2 4-6
```
두 방법 모두 무게 39다. 유니온 파인드는 경로 절반 압축만 넣은 간단한 버전이고, 랭크와 거의 상수 시간의 근거는 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」에서 다룬다. 그래프가 연결되어 있지 않으면 둘 다 None을 돌려준다.

## 무작위 대조 검사
느린 답은 간선 V − 1개 조합을 모두 골라 연결되는지 확인하고, 신장 트리의 무게를 모두 모아 정렬한다.
```python
# 앞 코드에 이어서
from itertools import combinations

def all_trees(n, edges):                 # 간선 n−1개 조합을 모두 본다
    out = []
    for comb in combinations(edges, n - 1):
        adj = [[] for _ in range(n)]
        for w, u, v in comb:
            adj[u].append(v)
            adj[v].append(u)
        seen, st = {0}, [0]
        while st:
            for v in adj[st.pop()]:
                if v not in seen:
                    seen.add(v)
                    st.append(v)
        if len(seen) == n:               # n−1개로 연결 = 신장 트리
            out.append(sum(w for w, _, _ in comb))
    return sorted(out)                   # 모든 신장 트리의 무게

def total(t):
    return None if t is None else sum(w for w, _, _ in t)

def key(t):                              # 방향을 무시한 간선 집합
    return sorted((w, min(u, v), max(u, v)) for w, u, v in t)

rng, ok, cnt = random.Random(5), 0, [0, 0, 0, 0]
for _ in range(500):
    n = rng.randint(1, 7)
    edges = [(rng.randint(1, 15), rng.randrange(n), rng.randrange(n))
             for _ in range(rng.randint(0, 12))]
    k, p = kruskal(n, edges), prim(n, edges)
    ts = all_trees(n, edges)
    ok += total(k) == total(p) == (ts[0] if ts else None)
    if k:                                # 가중치가 모두 다르면 MST는 유일
        tie = len({w for w, _, _ in edges}) < len(edges)
        cnt[2 * tie] += 1
        cnt[2 * tie + 1] += key(k) == key(p)
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
print(f"가중치가 모두 다름: {cnt[1]}/{cnt[0]} 간선 일치")
print(f"같은 가중치 있음: {cnt[3]}/{cnt[2]} 간선 일치")
```
```text
무작위 500개 비교: 모두 일치
가중치가 모두 다름: 44/44 간선 일치
같은 가중치 있음: 172/177 간선 일치
```
가중치가 모두 다르면 MST가 하나뿐이라 두 방법의 간선 집합이 늘 같았다. 같은 가중치가 있으면 177개 중 5개에서 무게는 같지만 고른 간선이 달랐다. "MST를 출력하라"는 문제의 답이 여러 개일 수 있는 이유다.

## 두 번째 최소 신장 트리
MST가 아닌 신장 트리 중 가장 가벼운 것은 MST에서 간선 하나만 바꿔 얻을 수 있다. 트리 밖 간선 (u, v, w)를 넣으면 트리 경로 u…v와 함께 사이클이 생기고, 그 경로에서 가장 무거운 간선을 빼는 것이 최선이다. 모든 쌍의 경로 최댓값을 정점마다 DFS로 구해 두면 O(V²)다. 대조 검사는 앞에서 모은 신장 트리 무게 목록의 두 번째 값과 비교한다.
```python
# 앞 코드에 이어서
from collections import Counter

def second_mst(n, edges):                # 트리 밖 간선 하나를 바꿔 끼운다
    tree = kruskal(n, edges)
    if tree is None:
        return None
    adj = [[] for _ in range(n)]
    for w, u, v in tree:
        adj[u].append((v, w))
        adj[v].append((u, w))
    mx = [[0] * n for _ in range(n)]     # mx[a][b]: 트리 경로의 최대 간선
    for a in range(n):
        st = [(a, -1, 0)]
        while st:
            u, p, m = st.pop()
            mx[a][u] = m
            st += [(v, u, max(m, w)) for v, w in adj[u] if v != p]
    base = sum(w for w, _, _ in tree)
    rest = Counter(edges) - Counter(tree)
    return min((base - mx[u][v] + w for w, u, v in rest.elements()
                if u != v), default=None)

print("두 번째:", second_mst(7, roads))
ok = 0
for _ in range(500):
    n = rng.randint(1, 7)
    edges = [(rng.randint(1, 15), rng.randrange(n), rng.randrange(n))
             for _ in range(rng.randint(0, 12))]
    ts = all_trees(n, edges)
    ok += second_mst(n, edges) == (ts[1] if len(ts) > 1 else None)
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
두 번째: 40
무작위 500개 비교: 모두 일치
```
예제에서는 트리 밖 간선 1–2(8)를 넣고 경로 1–4–2의 7을 빼서 40이다. 정점이 많으면 경로 최댓값을 고급 자료 구조 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」의 방식으로 O(log V)에 구해 O(E log V)로 줄인다.

## 복잡도
| 방법 | 시간 | 잘 맞는 그래프 |
|---|---|---|
| 완전 탐색 | C(E, V − 1)·O(V) | 아주 작을 때 |
| 크루스칼 | O(E log E) | 희소 |
| 프림(이진 힙) | O(E log V) | 희소~중간 |
| 프림(배열) | O(V²) | 밀집 |

크루스칼은 정렬이 지배하고 유니온 파인드 연산은 거의 상수다. 프림에서는 간선마다 먼저 방문한 쪽 끝에서만 힙에 넣으므로 많아야 한 번 들어간다. 공간은 O(V + E)다.

## 변형 문제 유형
- 이미 깔린 도로가 있으면 그 간선들을 먼저 합친 뒤 크루스칼을 이어 간다.
- k개 묶음으로 나누기: 크루스칼을 덩어리가 k개 남을 때 멈추면 묶음 사이의 가장 가까운 거리가 최대가 된다(단일 연결 군집화).
- 최소 병목 경로: MST 위의 두 정점 사이 경로는 "경로에서 가장 무거운 간선"을 최소로 하는 경로이기도 하다.

## 어디에 쓰이나
- 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」: 크루스칼의 "다른 덩어리인가" 판정이 find이고, 간선을 고르는 순간이 union이다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 트리의 간선이 V − 1개이고 간선 하나를 더하면 사이클이 정확히 하나 생긴다는 성질이 컷 성질 증명과 두 번째 MST의 바탕이다.
- 망 설계: 전력망·통신망·배관처럼 모든 지점을 최소 비용으로 잇는 일이 MST이며, 보루프카의 출발점도 전력망이었다.
- 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: 프림은 다익스트라에서 힙의 키만 바꾼 것이다. 단, MST는 두 정점 사이의 최단 경로를 보장하지 않는다.

## 정리
- MST는 모든 정점을 잇는 간선 V − 1개의 무게 합을 최소로 고르는 문제다.
- 컷을 건너는 가장 가벼운 간선은 어떤 MST에 들어 있고(교환 논증), 크루스칼과 프림은 이 성질로 간선을 하나씩 확정한다.
- 크루스칼은 정렬 + 유니온 파인드로 O(E log E), 프림은 힙으로 O(E log V)이며, 가중치가 같으면 고른 간선이 다를 수 있다.
- 두 번째 MST는 트리 밖 간선 하나를 넣고 경로의 최대 간선을 빼서 얻는다.

## 더 알아보기
- 이전 글: 4편 「플로이드-워셜: 모든 쌍 최단 경로」
- 다음 글: 6편 「강한 연결 요소: 타잔과 코사라주」
- 위키백과 영어판 Minimum spanning tree: https://en.wikipedia.org/wiki/Minimum_spanning_tree
