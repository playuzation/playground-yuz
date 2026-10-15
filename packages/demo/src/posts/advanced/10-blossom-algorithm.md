# [심화 알고리즘 10/14] 일반 그래프 매칭: 에드몬즈의 꽃 알고리즘

> **한 줄 요약** — 이분 그래프가 아니면 홀수 사이클 때문에 교대 BFS가 있는 증가 경로를 놓치는데, 바깥 정점끼리 이어진 홀수 사이클(꽃)을 정점 하나로 줄여 탐색을 계속하고 경로를 찾으면 꽃을 알맞은 방향으로 펴는 에드몬즈의 알고리즘은 일반 그래프의 최대 매칭을 O(V³)에 구한다.

## 이 글에서 다루는 것
- 홀수 사이클 때문에 이분 매칭식 탐색이 실패하는 예
- 꽃(blossom): 바깥 정점끼리의 간선이 만드는 홀수 사이클과 그 밑동
- 꽃을 줄였다가 펴기, 줄여도 증가 경로가 보존되는 이유
- 밑동 배열로 꽃을 표현하는 BFS 기반 O(V³) 구현과 비트마스크 DP 대조
- 터트 정리와 가중치 매칭으로 가는 길

## 예제 문제: 짝이 없는 두 사람
친구 관계 그래프에서 서로 친구인 두 사람씩 짝을 지어 최대한 많은 쌍을 만든다. 사람 사이에 "왼쪽·오른쪽" 구분이 없으므로 그래프가 이분이 아니다. 지금 매칭이 4쌍이고 0과 9가 짝이 없다.
```text
매칭(═): 1═2, 3═4, 5═6, 7═8
보통(─): 0─1, 2─3, 2─4, 3─6,
         6─7, 5─7, 8─9
삼각형: 2·3·4, 5·6·7
```
그래프 알고리즘 12편 「이분 매칭: 증가 경로와 쾨니그 정리」의 베르주 정리는 일반 그래프에서도 성립한다. 짝 없는 두 정점을 잇고 보통 간선과 매칭 간선이 번갈아 나오는 증가 경로가 없으면 최대다. 여기서는 0─1═2─4═3─6═5─7═8─9가 증가 경로라 5쌍이 가능하다. 그런데 이분 매칭에서 하듯 짝 없는 정점에서 BFS로 정점마다 바깥(짝수 거리)·안(홀수 거리) 이름표를 한 번씩 붙여 가면 이 경로를 못 찾는다.

## 단순한 교대 BFS가 실패하는 이유
```python
from functools import lru_cache

def naive_augment(adj, mate, root):       # 이분 그래프용 교대 BFS 그대로
    label, par, q = {root: 0}, {}, [root]   # 0 = 바깥(짝수), 1 = 안(홀수)
    for x in q:
        for y in adj[x]:
            if y in label:                # 한 번 이름표 붙은 정점은 끝
                continue
            label[y], par[y] = 1, x
            if mate[y] == -1:             # 증가 경로: 짝을 뒤집는다
                while y != -1:
                    x = par[y]; nx = mate[x]
                    mate[x], mate[y] = y, x
                    y = nx
                return True
            label[mate[y]] = 0; q.append(mate[y])
    return False

def best_matching(n, edges):              # 비트마스크 DP, O(2ⁿ·n)
    nb = [0] * n
    for a, b in edges:
        nb[a] |= 1 << b; nb[b] |= 1 << a
    @lru_cache(None)
    def f(mask):
        if mask == 0:
            return 0
        i = (mask & -mask).bit_length() - 1   # 가장 작은 정점 i
        rest = mask & ~(1 << i)
        best, m = f(rest), nb[i] & rest       # i를 비우거나 j와 짝짓기
        while m:
            j = (m & -m).bit_length() - 1
            best = max(best, 1 + f(rest & ~(1 << j)))
            m &= m - 1
        return best
    return f((1 << n) - 1)

edges = [(0, 1), (1, 2), (2, 3), (2, 4), (3, 4), (3, 6),
         (5, 6), (6, 7), (5, 7), (7, 8), (8, 9)]
adj = [[] for _ in range(10)]
for a, b in edges:
    adj[a].append(b); adj[b].append(a)
mate = [-1, 2, 1, 4, 3, 6, 5, 8, 7, -1]  # 매칭 {1═2, 3═4, 5═6, 7═8}
print("0에서 출발:", naive_augment(adj, mate, 0))
print("9에서 출발:", naive_augment(adj, mate, 9))
print("매칭 크기 4 / 실제 최대", best_matching(10, edges))
```
```text
0에서 출발: False
9에서 출발: False
매칭 크기 4 / 실제 최대 5
```
0에서 출발하면 2가 바깥이 되고, 2의 이웃 3이 먼저 안 이름표를 받는다. 3의 짝 4가 바깥이 되지만 4의 이웃은 이미 모두 이름표가 있다. 증가 경로는 3을 바깥으로(2─4═3 순서로) 지나야 하는데, 3은 이미 안으로 굳었다. 9에서 출발해도 삼각형 5·6·7에서 같은 일이 생긴다. 이분 그래프에서는 정점의 거리 홀짝이 경로와 무관하게 하나로 정해지지만, 홀수 사이클이 있으면 같은 정점에 짝수 길이와 홀수 길이 경로가 둘 다 있어서 이름표 하나로는 부족하다.

## 꽃: 줄였다가 펴기
탐색 중 **바깥 정점 두 개가 간선으로 이어지면** 홀수 사이클이 생긴다. 두 정점의 탐색 트리 경로가 처음 만나는 바깥 정점 b를 **밑동**(base)이라 하고, b에서 출발해 그 간선을 지나 b로 돌아오는 길이 2k + 1의 사이클을 **꽃**(blossom)이라 한다. 꽃 안에는 매칭 간선이 k개 있고 b만 꽃 밖과 짝을 이룬다(또는 뿌리다).
```text
뿌리 … ═ b
        / \
       x   y    x═v, y═to: 매칭
       ║   ║    v─to: 바깥끼리 연결
       v ─ to
```
x는 b─x로 닿으면 안이지만, 반대 방향 b─y═to─v═x로 돌면 짝수 길이에 매칭 간선으로 끝나 바깥이 된다. 꽃 안의 모든 정점이 어느 한쪽으로 돌면 바깥이 되므로, 꽃 전체를 바깥 정점 하나로 줄여(contract) 탐색을 이어 가도 된다. 1965년 에드몬즈(Jack Edmonds)의 논문 「Paths, Trees, and Flowers」의 핵심 정리가 이것이다. **꽃 B를 줄인 그래프 G/B에 증가 경로가 있는 것과 G에 증가 경로가 있는 것은 같다.** 줄인 그래프에서 찾은 경로가 꽃을 지나면, 꽃을 펴서 매칭 간선이 번갈아 나오는 쪽 방향으로 돌면 된다. 이 논문은 일반 그래프 최대 매칭을 다항 시간에 푼 첫 알고리즘이었다.

## 구현: 밑동 배열로 꽃 표현하기
실제로 그래프를 줄이지 않고 `base[v]`(v가 속한 꽃의 밑동)만 바꾼다.
- BFS는 바깥 정점에서만 뻗는다. 짝 없는 이웃을 만나면 증가 경로이고, 짝 있는 이웃이면 그 짝을 바깥으로 큐에 넣는다.
- 바깥끼리의 간선(또는 뿌리로 돌아오는 간선)을 만나면 `lca`로 밑동을 찾고, `mark`가 꽃의 두 갈래를 따라가며 안 정점의 `par`를 "반대 방향으로 도는 길"로 고쳐 둔다. 그다음 꽃의 정점을 모두 밑동으로 합치고 바깥으로 큐에 넣는다.
- 경로를 찾으면 `par`와 `mate`를 번갈아 따라가며 짝을 뒤집는다. `mark`가 고쳐 둔 `par` 덕분에 꽃은 저절로 올바른 방향으로 펴진다.

앞 코드에 이어서 실행한다.
```python
from collections import deque

def blossom(n, adj, mate=None):
    mate = mate[:] if mate else [-1] * n
    par, base, stat = [-1] * n, list(range(n)), {"꽃": 0}

    def lca(a, b):                        # 두 바깥 정점이 만나는 꽃의 밑동
        seen = [False] * n
        while True:
            a = base[a]; seen[a] = True
            if mate[a] == -1:
                break                     # 뿌리에 닿았다
            a = par[mate[a]]
        while not seen[base[b]]:
            b = par[mate[base[b]]]
        return base[b]

    def mark(v, b, child, inb):           # v에서 밑동 b까지를 꽃에 넣는다
        while base[v] != b:
            inb[base[v]] = inb[base[mate[v]]] = True
            par[v] = child                # 꽃을 반대로 도는 길을 기록
            child = mate[v]
            v = par[mate[v]]

    def augment(root):
        par[:], base[:] = [-1] * n, range(n)
        used = [False] * n                # 바깥(짝수 거리) 정점
        used[root], q = True, deque([root])
        while q:
            v = q.popleft()
            for to in adj[v]:
                if base[v] == base[to] or mate[v] == to:
                    continue
                if to == root or mate[to] != -1 and par[mate[to]] != -1:
                    b, inb = lca(v, to), [False] * n   # 바깥끼리 = 꽃
                    mark(v, b, to, inb); mark(to, b, v, inb)
                    stat["꽃"] += 1
                    for i in range(n):    # 꽃 전체를 밑동 b 하나로 줄인다
                        if inb[base[i]]:
                            base[i] = b
                            if not used[i]:
                                used[i] = True; q.append(i)
                elif par[to] == -1:
                    par[to] = v
                    if mate[to] == -1:    # 증가 경로: par를 따라 뒤집는다
                        while to != -1:
                            pv = par[to]; nxt = mate[pv]
                            mate[to], mate[pv] = pv, to
                            to = nxt
                        return True
                    used[mate[to]] = True; q.append(mate[to])
        return False

    for r in range(n):
        if mate[r] == -1:
            augment(r)
    return mate, stat["꽃"]

m2, k = blossom(10, adj, mate)
print("꽃 알고리즘:", sum(x != -1 for x in m2) // 2, "쌍, 줄인 꽃", k)
print("짝:", [(v, m2[v]) for v in range(10) if v < m2[v]])
```
```text
꽃 알고리즘: 5 쌍, 줄인 꽃 1
짝: [(0, 1), (2, 4), (3, 6), (5, 7), (8, 9)]
```
0에서 출발한 탐색이 삼각형 2·3·4를 꽃으로 줄이자 3이 바깥이 되어 3─6═5─7═8─9로 이어졌고, 한 번에 5쌍이 되었다. 짝 (2, 4), (3, 6)을 보면 꽃이 2─4═3 방향으로 펴졌다.

## 무작위 대조 검사
앞 코드에 이어서, 정점 14개 이하의 무작위 그래프 500개(간선 밀도 세 가지, 인접 리스트 순서도 섞음)에서 비트마스크 DP와 크기를 비교하고, 결과가 실제 간선으로 된 올바른 매칭인지도 확인한다. DP는 가장 작은 정점을 비워 두거나 이웃 하나와 짝짓는 두 경우로 나누는 O(2ⁿ·n)이다.
```python
import random
rng = random.Random(10)
with_blossom = 0
for _ in range(500):
    n = rng.randint(1, 14)
    p = rng.choice([0.15, 0.3, 0.6])
    edges = [(a, b) for a in range(n) for b in range(a + 1, n)
             if rng.random() < p]
    adj = [[] for _ in range(n)]
    for a, b in rng.sample(edges, len(edges)):   # 간선 순서도 섞는다
        adj[a].append(b); adj[b].append(a)
    m, k = blossom(n, adj)
    assert all(m[m[v]] == v and v in adj[m[v]] for v in range(n) if m[v] != -1)
    assert sum(x != -1 for x in m) // 2 == best_matching(n, edges)
    with_blossom += k > 0
print("무작위 500개: 비트마스크 DP와 모두 일치")
print("꽃을 한 번 이상 줄인 그래프:", with_blossom)
```
```text
무작위 500개: 비트마스크 DP와 모두 일치
꽃을 한 번 이상 줄인 그래프: 174
```
500개 모두 최대 매칭 크기가 같았고, 그중 174개에서 꽃 줄이기가 실제로 일어났다. 탐색을 짝 없는 정점마다 한 번씩만 하는 이유는, 한 번 증가 경로가 없던 정점은 이후에도 계속 없다는 성질이 있어서다.

## 터트 정리와 변형
- **터트 정리**(Tutte, 1947): 완전 매칭이 있는 것은 어떤 정점 집합 U를 지워도 남은 그래프의 홀수 크기 연결 요소가 ∣U∣개 이하인 것과 같다. 홀수 요소마다 한 정점은 U와 짝지어야 하기 때문이고, 최대 매칭 크기를 주는 터트-베르주 공식으로 일반화된다.
- **가중치 매칭**: 꽃 줄이기에 9편 「헝가리안 알고리즘: 할당 문제를 O(n³)에」의 쌍대 변수를 합치면 가중치 일반 그래프 매칭도 다항 시간에 풀린다. 구현이 길어 경시 프로그래밍에서도 손꼽히는 난도다.
- **더 빠르게**: 미칼리-바지라니 알고리즘은 O(E√V)로, 이분 그래프의 호프크로프트-카프와 같은 상한이다.
- 흔한 실수: 뿌리로 돌아오는 간선(`to == root`)을 꽃으로 처리하지 않거나, 꽃을 합칠 때 안 정점을 큐에 넣지 않으면 꽃 안 정점에서 뻗는 경로를 놓친다.
- 이분 그래프라고 확신할 수 없는 "짝짓기" 문제(룸메이트 배정, 2인 1조 편성)는 이 글의 알고리즘이 필요하다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 비트마스크 DP | O(2ⁿ·n) | n ≤ 20 정도 |
| 단순 교대 BFS | O(VE) | 틀린 답 가능 |
| 꽃 알고리즘 | O(V³) | 이 글의 구현 |
| 미칼리-바지라니 | O(E√V) | 구현이 복잡 |

뿌리 하나의 탐색에서 꽃은 정점 수를 2 이상 줄이므로 O(V)번, 한 번에 O(V)라 O(V² + E)이고, 뿌리가 V개라 O(V³)이다. 공간은 O(V + E)다.

## 어디에 쓰이나
- 그래프 알고리즘 9편 「오일러 경로: 모든 간선을 한 번씩 지나기」: 모든 길을 지나 돌아오는 최단 순회(중국 우체부 문제)는 홀수 차수 정점들을 최단 거리 합이 최소가 되게 짝지어 간선을 덧붙이면 되고, 이 짝짓기가 일반 그래프의 최소 가중치 완전 매칭이다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 크리스토피데스(Christofides)의 외판원 근사 알고리즘(1976)은 최소 신장 트리의 홀수 차수 정점에 최소 가중치 완전 매칭을 더해, 거리가 삼각 부등식을 만족할 때 최적의 1.5배 이내 순회를 만든다.
- 그래프 알고리즘 12편 「이분 매칭: 증가 경로와 쾨니그 정리」: 그 글의 쿤 알고리즘은 꽃이 생기지 않는 이분 그래프에서 이 알고리즘이 줄어든 모습이다.

## 정리
- 일반 그래프에서도 증가 경로가 없으면 최대 매칭이지만, 홀수 사이클 때문에 이름표 하나짜리 교대 탐색은 경로를 놓친다.
- 바깥 정점끼리의 간선이 만드는 홀수 사이클(꽃)은 전체가 바깥이 되므로 정점 하나로 줄여 탐색을 이어 가도 된다.
- `base` 배열로 꽃을 표현하고 `par`를 반대 방향으로 고쳐 두면 경로를 뒤집을 때 꽃이 저절로 펴지며, 전체 O(V³)이다.
- 비트마스크 DP와 500개 모두 일치했고, 그중 174개에서 꽃 줄이기가 쓰였다.

## 더 알아보기
- 이전 글: 9편 「헝가리안 알고리즘: 할당 문제를 O(n³)에」
- 다음 글: 11편 「지배자 트리: 반드시 거쳐 가는 정점 찾기」
- Blossom algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Blossom_algorithm
