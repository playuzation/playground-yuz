# [고급 자료 구조 11/12] 오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기

> **한 줄 요약** — DFS 방문 순서로 정점을 일렬로 세우면 서브트리가 연속 구간이 되고, 무거운 자식을 먼저 방문해 사슬을 이어 붙이면(heavy-light 분해) 어떤 경로도 O(log n)개 구간으로 쪼개지므로, 트리 질의를 펜윅·세그먼트 트리의 구간 질의로 바꿔 풀 수 있다.

## 이 글에서 다루는 것
- 진입·완료 시각(tin/tout)으로 서브트리를 구간으로 바꾸기
- 무거운 자식, 사슬, 가벼운 간선이 log₂ n개 이하인 이유
- 경로 합 질의를 O(log² n)에 답하는 HLD 구현
- 무작위 트리 대조와 가벼운 간선 수 실험

## 예제 문제: 서브트리 합과 경로 합
정점마다 값이 있는 트리에 정점 값 바꾸기, "v의 서브트리 합", "u–v 경로 위의 합"이 섞여 들어온다. 단순하게 하면 서브트리를 다 돌거나 LCA까지 한 칸씩 올라가므로 질의마다 O(n), 정점과 질의가 10⁵개씩이면 10¹⁰번이다. 배열이었다면 5편의 펜윅 트리로 O(log n)에 끝날 일이니, 트리를 배열로 펴자.

## 오일러 투어: 서브트리를 구간으로
DFS에서 정점에 처음 들어갈 때 번호 `tin[v]`를 0, 1, 2, … 차례로 붙이고, v의 서브트리를 다 돌고 나올 때 다음에 붙일 번호를 `tout[v]`로 적는다. DFS는 v에 들어가면 v의 자손을 모두 방문한 뒤에야 나오므로, v의 서브트리는 정확히 번호 `[tin[v], tout[v])` 구간이다. 정점 v의 값을 펜윅 트리의 `tin[v]` 위치에 두면 서브트리 합이 구간 합이 된다.
```python
class BIT:                                 # 5편의 펜윅 트리, 0부터 센 위치
    def __init__(self, n):
        self.n, self.t = n, [0] * (n + 1)
    def add(self, i, x):
        i += 1
        while i <= self.n:
            self.t[i] += x
            i += i & -i
    def prefix(self, i):                   # [0, i) 합
        s = 0
        while i > 0:
            s += self.t[i]
            i -= i & -i
        return s
    def range(self, l, r):                 # [l, r) 합
        return self.prefix(r) - self.prefix(l)

def euler_tour(n, adj, root=0):
    tin, tout, timer = [0] * n, [0] * n, 0
    stack = [(root, -1, False)]
    while stack:                           # 재귀 없는 DFS
        v, p, done = stack.pop()
        if done:
            tout[v] = timer                # 서브트리 = [tin[v], tout[v])
            continue
        tin[v], timer = timer, timer + 1
        stack.append((v, p, True))         # 자식을 다 본 뒤에 다시 꺼낸다
        for w in adj[v]:
            if w != p:
                stack.append((w, v, False))
    return tin, tout

edges = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (5, 6)]
vals = [5, 3, 2, 1, 4, 6, 7]
adj = [[] for _ in vals]
for u, v in edges:
    adj[u].append(v)
    adj[v].append(u)
tin, tout = euler_tour(len(vals), adj)
bit = BIT(len(vals))
for v, x in enumerate(vals):
    bit.add(tin[v], x)
print("tin ", tin)
print("tout", tout)
print(bit.range(tin[1], tout[1]), bit.range(tin[2], tout[2]))
```
```text
tin  [0, 4, 1, 6, 5, 2, 3]
tout [7, 7, 4, 7, 6, 4, 4]
8 15
```
정점 1의 서브트리 {1, 3, 4}는 번호 4~6에 모여 합이 3 + 1 + 4 = 8이다. 서브트리 전체에 더하고 한 정점을 묻는 반대 방향도 차분으로 똑같이 된다.

## 경로를 사슬로 쪼개기: heavy-light 분해
경로는 DFS 순서에서 연속이 아니라 이 방법이 통하지 않는다. 대신 경로를 "연속 구간 몇 개"로 쪼개자. 정점마다 서브트리가 가장 큰 자식 하나를 **무거운 자식**으로 고르고, 그쪽 간선을 무거운 간선, 나머지를 가벼운 간선이라 한다. 무거운 간선을 이으면 트리가 서로 겹치지 않는 **사슬**(heavy path)들로 나뉜다. DFS에서 무거운 자식을 항상 먼저 방문하면 사슬 하나가 번호상 연속 구간이 되고, DFS 순서이므로 서브트리도 여전히 연속이다.
```text
        0                사슬
       / \               A: 0─2─5─6
      1   2              B: 1─4
     / \   \             C: 3
    3   4   5
            │
            6
```
핵심 성질은 **가벼운 간선을 따라 내려가면 서브트리 크기가 절반 이하로 준다**는 것이다. c가 가벼운 자식이면 c보다 작지 않은 무거운 형제가 있으므로 `2·size(c) ≤ size(부모)`다. 크기 n에서 시작해 절반씩 줄면 log₂ n번 안에 1이 되므로, 루트에서 어느 정점까지 가는 길에도 가벼운 간선은 log₂ n개 이하이고, 따라서 지나는 사슬도 log₂ n + 1개 이하다.

경로 u–v 질의는 두 정점의 사슬 머리가 다르면, 머리가 더 깊은 쪽의 "머리부터 그 정점까지" 토막을 구간으로 더하고 머리의 부모로 건너뛴다. 머리가 더 깊은 쪽 토막은 LCA보다 아래에 있어서 통째로 더해도 안전하다. 같은 사슬에 오면 둘 사이 구간을 더하고 끝낸다. 예제의 3–6 경로는 {3}, {1}, {0, 2, 5, 6} 세 토막이다. 이 아이디어는 슬리터(Sleator)와 타잔(Tarjan)이 1980년대 초 동적 트리(링크-컷 트리)를 분석하며 처음 썼다.

## 구현
앞 코드에 이어서 쓴다. BFS로 부모와 깊이, 역순으로 크기와 무거운 자식을 구하고, 스택 DFS로 번호를 붙인다. 무거운 자식을 스택에 마지막에 넣어 바로 다음에 꺼내는 것이 요령이다.
```python
class HLD:
    def __init__(self, n, adj, vals, root=0):
        parent, depth, order = [-1] * n, [0] * n, [root]
        for v in order:                    # BFS(순회하며 order를 늘린다)
            for w in adj[v]:
                if w != parent[v]:
                    parent[w], depth[w] = v, depth[v] + 1
                    order.append(w)
        size, heavy = [1] * n, [-1] * n
        for v in reversed(order):          # 잎부터: 크기와 무거운 자식
            p = parent[v]
            if p >= 0:
                size[p] += size[v]
                if heavy[p] < 0 or size[v] > size[heavy[p]]:
                    heavy[p] = v
        head, pos, cur, stack = [root] * n, [0] * n, 0, [root]
        while stack:                       # 무거운 자식을 바로 다음에 방문
            v = stack.pop()
            pos[v], cur = cur, cur + 1
            for w in adj[v]:
                if w != parent[v] and w != heavy[v]:
                    head[w] = w            # 가벼운 자식은 새 사슬의 머리
                    stack.append(w)
            if heavy[v] >= 0:
                head[heavy[v]] = head[v]   # 무거운 자식은 사슬을 잇는다
                stack.append(heavy[v])
        self.parent, self.depth, self.size = parent, depth, size
        self.heavy, self.head, self.pos = heavy, head, pos
        self.vals, self.bit = vals[:], BIT(n)
        for v in range(n):
            self.bit.add(pos[v], vals[v])

    def set(self, v, x):
        self.bit.add(self.pos[v], x - self.vals[v])
        self.vals[v] = x

    def subtree_sum(self, v):              # DFS 순서라 서브트리도 한 구간
        return self.bit.range(self.pos[v], self.pos[v] + self.size[v])

    def path_sum(self, u, v):
        hd, dp, pos, s = self.head, self.depth, self.pos, 0
        while hd[u] != hd[v]:
            if dp[hd[u]] < dp[hd[v]]:
                u, v = v, u
            s += self.bit.range(pos[hd[u]], pos[u] + 1)  # 사슬 한 토막
            u = self.parent[hd[u]]
        if dp[u] > dp[v]:
            u, v = v, u
        return s + self.bit.range(pos[u], pos[v] + 1)

h = HLD(len(vals), adj, vals)
print(h.path_sum(3, 6), h.path_sum(4, 3), h.subtree_sum(2))
```
```text
24 8 15
```

## 무작위 대조 검사
앞 코드에 이어서, 무작위 트리에서 값 바꾸기·경로 합·서브트리 합을 섞어 정의대로 계산한 값과 비교한다. 정답 쪽은 생성할 때의 부모 배열로 경로와 서브트리를 직접 모은다.
```python
import random

def tree_adj(n, par):
    adj = [[] for _ in range(n)]
    for v in range(1, n):
        adj[v].append(par[v])
        adj[par[v]].append(v)
    return adj

def ancestors(par, v):                     # v에서 루트까지(자기 포함)
    out = []
    while v != -1:
        out.append(v)
        v = par[v]
    return out

rng = random.Random(11)
ok = 0
for _ in range(500):
    n = rng.randint(1, 40)
    par = [-1] + [rng.randrange(i) for i in range(1, n)]
    a = [rng.randint(-9, 9) for _ in range(n)]
    h, same = HLD(n, tree_adj(n, par), a), True
    for _ in range(30):
        u, v = rng.randrange(n), rng.randrange(n)
        op = rng.randrange(3)
        if op == 0:
            x = rng.randint(-9, 9)
            h.set(u, x)
            a[u] = x
        elif op == 1:                      # 경로 = u쪽 + v쪽 − 겹친 부분
            au, av = ancestors(par, u), ancestors(par, v)
            common = set(au) & set(av)
            lca = next(w for w in au if w in common)
            path = [w for w in au + av if w not in common] + [lca]
            same &= h.path_sum(u, v) == sum(a[w] for w in path)
        else:
            sub = [w for w in range(n) if u in ancestors(par, w)]
            same &= h.subtree_sum(u) == sum(a[w] for w in sub)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 가벼운 간선은 정말 log₂ n개 이하인가
앞 코드에 이어서, 정점 65,535개짜리 트리 두 종류에서 루트-정점 경로의 가벼운 간선 수 최댓값을 센다.
```python
import math

def max_light(n, par):                     # 루트-정점 경로의 가벼운 간선 최대 개수
    h = HLD(n, tree_adj(n, par), [0] * n)
    light = [0] * n
    for v in range(1, n):                  # par[v] < v라 앞에서부터 채워진다
        light[v] = light[par[v]] + (h.heavy[par[v]] != v)
    return max(light)

n = 2 ** 16 - 1
kinds = {"완전 이진": [-1] + [(v - 1) // 2 for v in range(1, n)],
         "무작위": [-1] + [rng.randrange(v) for v in range(1, n)]}
for name, par in kinds.items():
    print(f"{name}: 가벼운 간선 최대 {max_light(n, par)}개",
          f"(log₂ n ≈ {math.log2(n):.1f})")
```
```text
완전 이진: 가벼운 간선 최대 15개 (log₂ n ≈ 16.0)
무작위: 가벼운 간선 최대 8개 (log₂ n ≈ 16.0)
```
완전 이진 트리는 자식 둘의 크기가 같아 매번 가벼운 쪽으로만 가는 길이 깊이(15)만큼 가벼운 간선을 지나므로, 상한이 거의 꽉 찬다.

## 자주 하는 실수와 변형
- 간선에 값이 있으면 간선 값을 아래쪽 정점에 두고, 마지막 같은 사슬 구간에서 LCA 자신을 빼고 `pos[u] + 1`부터 더한다.
- 경로에 더하기 + 경로 합은 펜윅 대신 4편의 레이지 세그먼트 트리를 쓰면 된다. 경로 최댓값도 구간 최댓값으로 바뀐다.
- 사슬 머리를 따라 오르는 같은 루프로 LCA도 O(log n)에 구할 수 있다(머리가 같아지면 더 얕은 쪽이 LCA).

## 복잡도
| 질의 | 펴기 + 펜윅 | 단순한 방법 |
|---|---|---|
| 정점 값 바꾸기 | O(log n) | O(1) |
| 서브트리 합 | O(log n) | O(n) |
| 경로 합 | O(log² n) | O(n) |
| 전처리 | O(n) + O(n log n) | - |

경로 하나가 사슬 토막 O(log n)개로 쪼개지고 토막마다 펜윅 질의가 O(log n)이라 O(log² n)이다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 그 글의 DFS에 들어가고 나오는 시각만 적으면 서브트리가 구간이 된다는 것이 오일러 투어의 전부다.
- 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」: HLD의 경로 질의는 LCA를 따로 구하지 않고도 사슬을 오르며 LCA에서 멈춘다.
- 파일 시스템의 디렉터리 크기: 디렉터리 크기는 서브트리 합이라, 파일 크기가 계속 바뀌어도 오일러 투어 + 펜윅으로 O(log n)에 갱신·조회할 수 있다.

## 정리
- DFS 진입 순서로 펴면 서브트리가 `[tin, tout)` 구간이 되어 서브트리 질의가 구간 질의가 된다.
- 무거운 자식을 먼저 방문하면 사슬이 연속 구간이 되고, 가벼운 간선은 서브트리를 절반 이하로 줄이므로 경로마다 log₂ n개 이하다.
- 경로 질의는 사슬 토막 O(log n)개의 구간 질의로 O(log² n)이다.

## 더 알아보기
- 이전 글: 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」
- 다음 글: 12편 「센트로이드 분할: 트리를 반씩 쪼개는 분할 정복」
- 위키백과 Heavy-light decomposition: https://en.wikipedia.org/wiki/Heavy-light_decomposition
