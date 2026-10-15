# [고급 자료 구조 10/12] 최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기

> **한 줄 요약** — 정점마다 2ᵏ번째 조상을 미리 적어 두면 깊이 차를 2진수로 쪼개 O(log n)번 만에 깊이를 맞추고, 큰 점프부터 "아직 갈라져 있으면 오른다"를 반복해 최소 공통 조상을 O(log n)에 찾으며, 오일러 투어로 바꾸면 희소 테이블로 O(1) 질의도 된다.

## 이 글에서 다루는 것
- 최소 공통 조상(LCA)과 한 칸씩 오르는 방법이 느린 이유
- 이진 올리기(binary lifting): `up[k][v]` 표, 깊이 맞추기, 함께 오르기
- 두 정점 사이 거리와 k번째 조상
- 오일러 투어 + 희소 테이블 방식과 비교

## 예제 문제: 가장 가까운 공통 조상
루트가 있는 트리(이산수학 9편)에서 u와 v의 **최소 공통 조상**(LCA, lowest common ancestor)은 둘 모두의 조상(자기 자신 포함)인 정점 중 가장 깊은 것이다. 아래 트리에서 LCA(7, 5) = 1, LCA(7, 9) = 0, LCA(8, 9) = 6, LCA(4, 7) = 4다.
```text
        0
      / | \
     1  2  3
    / \     \
   4   5     6
  /         / \
 7         8   9
```
LCA를 알면 두 정점 사이 거리가 `depth[u] + depth[v] − 2·depth[LCA]`로 바로 나온다. 7에서 9까지는 3 + 3 − 0 = 6이다.

## 단순한 방법: 한 칸씩 오르기
깊은 쪽을 부모로 한 칸씩 올려 깊이를 맞춘 뒤, 둘이 만날 때까지 함께 한 칸씩 오르면 된다. 맞는 방법이지만 질의 하나에 O(깊이)다. 트리가 사슬처럼 길면 깊이가 n에 가까워, 정점 10⁵개에 질의 10⁵개면 10¹⁰번 오르게 된다.

## 이진 올리기: 2ᵏ번째 조상 표
한 칸씩 대신 1, 2, 4, 8, … 칸씩 뛰면 된다. `up[k][v]`를 v의 2ᵏ번째 조상이라 하면, 2ᵏ칸은 2ᵏ⁻¹칸을 두 번 간 것이므로 표를 아래에서 위로 채울 수 있다.
```text
up[0][v] = parent(v)
up[k][v] = up[k−1][ up[k−1][v] ]
```
- **깊이 맞추기**: 깊이 차 d를 2진수로 쓰면 켜진 비트마다 그 크기만큼 뛰면 된다. d = 13 = 8 + 4 + 1이면 세 번이다. k번째 조상 질의도 같은 방법이다.
- **함께 오르기**: 깊이가 같고 u ≠ v인 상태에서, k를 큰 것부터 내려가며 `up[k][u] ≠ up[k][v]`일 때만 둘을 함께 2ᵏ칸 올린다. 끝나면 `up[0][u]`가 LCA다.

함께 오르기가 맞는 이유는 이분 탐색(알고리즘 기법 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」)으로 보면 분명하다. u에서 LCA까지 거리가 d라면, j칸 올린 뒤에도 둘이 갈라져 있을 조건은 j < d로 단조다. 큰 비트부터 "올려도 여전히 갈라져 있나"를 판정해 붙여 가면 정확히 d − 1칸을 오르게 되고, 그 바로 위가 LCA다. 불변식은 "u와 v는 깊이가 같고 서로 다르다"이며 매 점프가 이를 지킨다.

## 구현
부모와 깊이는 재귀 대신 BFS로 구한다(정점 10⁵개짜리 사슬이면 재귀 DFS는 파이썬 재귀 한도에 걸린다). 표의 높이 `LOG`는 2^LOG가 최대 깊이보다 크도록 잡는다.
```python
from collections import deque

class LCA:
    def __init__(self, n, edges, root=0):
        adj = [[] for _ in range(n)]
        for u, v in edges:
            adj[u].append(v)
            adj[v].append(u)
        parent, depth = [root] * n, [0] * n   # 루트의 부모 = 루트 자신
        seen, q = [False] * n, deque([root])
        seen[root] = True
        while q:                              # BFS로 부모와 깊이(재귀 없음)
            u = q.popleft()
            for w in adj[u]:
                if not seen[w]:
                    seen[w] = True
                    parent[w], depth[w] = u, depth[u] + 1
                    q.append(w)
        self.LOG = max(1, (n - 1).bit_length())  # 2^LOG > 최대 깊이
        self.up, self.depth = [parent], depth    # up[k][v] = 2ᵏ번째 조상
        for k in range(1, self.LOG):
            prev = self.up[-1]
            self.up.append([prev[prev[v]] for v in range(n)])

    def ancestor(self, v, k):                 # k번째 조상: k를 2진수로 쪼갠다
        for j in range(self.LOG):
            if k >> j & 1:
                v = self.up[j][v]
        return v

    def lca(self, u, v):
        if self.depth[u] < self.depth[v]:
            u, v = v, u
        u = self.ancestor(u, self.depth[u] - self.depth[v])   # 깊이 맞추기
        if u == v:
            return u
        for k in range(self.LOG - 1, -1, -1):
            if self.up[k][u] != self.up[k][v]:  # 아직 갈라져 있으면 오른다
                u, v = self.up[k][u], self.up[k][v]
        return self.up[0][u]

    def dist(self, u, v):
        return self.depth[u] + self.depth[v] - 2 * self.depth[self.lca(u, v)]

edges = [(0, 1), (0, 2), (0, 3), (1, 4), (1, 5),
         (3, 6), (4, 7), (6, 8), (6, 9)]
t = LCA(10, edges)
print(t.lca(7, 5), t.lca(7, 9), t.lca(8, 9), t.lca(4, 7))
print("dist(7, 9) =", t.dist(7, 9), " 7의 2번째 조상 =", t.ancestor(7, 2))
```
```text
1 0 6 4
dist(7, 9) = 6  7의 2번째 조상 = 1
```

## 무작위 대조 검사와 오르는 횟수
앞 코드에 이어서, 정점 번호를 섞은 무작위 트리에서 정의 그대로의 방법과 비교한다. 정답 쪽은 생성할 때의 부모 배열을 직접 쓰므로 BFS가 틀려도 잡힌다. 끝으로 사슬 두 개짜리 트리에서 두 잎의 LCA를 구할 때 오르는 횟수를 센다.
```python
import random

def random_tree(n, rng):                  # 부모 배열과 섞인 간선 목록
    label = list(range(n))
    rng.shuffle(label)
    par = [-1] * n
    for i in range(1, n):
        par[label[i]] = label[rng.randrange(i)]
    edges = [(v, par[v]) for v in range(n) if par[v] >= 0]
    rng.shuffle(edges)
    return label[0], par, edges

def lca_brute(par, u, v):                 # 정의대로: u의 조상 집합에 처음 닿는 곳
    anc = set()
    while u != -1:
        anc.add(u)
        u = par[u]
    while v not in anc:
        v = par[v]
    return v

rng = random.Random(10)
ok = 0
for _ in range(500):
    n = rng.randint(1, 60)
    root, par, edges = random_tree(n, rng)
    t = LCA(n, edges, root)
    qs = [(rng.randrange(n), rng.randrange(n)) for _ in range(20)]
    ok += all(t.lca(u, v) == lca_brute(par, u, v) for u, v in qs)
print(f"무작위 500개 비교: {ok}개 일치")

def climb_steps(par, depth, u, v):        # 한 칸씩 오르는 단순한 방법
    steps = 0
    while u != v:
        if depth[u] < depth[v]:
            u, v = v, u
        u, steps = par[u], steps + 1
    return steps

n = 100001                                # 루트 0에 길이 5만인 사슬 두 개
edges = [(0, 1), (0, 2)] + [(i, i + 2) for i in range(1, n - 2)]
t = LCA(n, edges)
print("한 칸씩:", climb_steps(t.up[0], t.depth, n - 1, n - 2),
      "번 / 이진 올리기: 최대", 2 * t.LOG, "번")
```
```text
무작위 500개 비교: 500개 일치
한 칸씩: 100000 번 / 이진 올리기: 최대 34 번
```
깊이 맞추기 최대 17번, 함께 오르기 17번이다. 대신 표가 정점마다 17칸, 모두 약 170만 칸을 차지한다.

## 오일러 투어 + 희소 테이블
다른 길도 있다. DFS로 트리를 돌며 정점에 들어갈 때와 자식에서 돌아올 때마다 그 정점을 기록하면 길이 2n − 1인 **오일러 투어**(Euler tour)가 된다. u와 v가 처음 나온 위치 사이의 구간에는 u에서 v로 가는 DFS의 길이 그대로 담기고, 그 길에서 가장 얕은 정점이 LCA다. 그러니 LCA는 "구간에서 깊이가 최소인 정점"이라는 구간 최솟값 질의(RMQ)가 되고, 6편의 희소 테이블로 O(1)에 답한다. 최솟값은 겹쳐 세도 되는 멱등 연산이라 길이 2ᵏ 구간 두 개로 덮으면 된다. 1984년 하렐(Harel)과 타잔(Tarjan)이 선형 전처리 후 O(1) 질의를 처음 보였지만 구현이 복잡했고, 2000년 벤더(Bender)와 파라크-콜턴(Farach-Colton)이 이 환원으로 단순한 방법을 정리했다. 앞 코드에 이어서 구현하고 세 방법을 맞춰 본다.
```python
class EulerLCA:
    def __init__(self, n, edges, root=0):
        adj = [[] for _ in range(n)]
        for u, v in edges:
            adj[u].append(v)
            adj[v].append(u)
        depth, parent, it = [0] * n, [-1] * n, [0] * n
        self.first, tour, stack = [0] * n, [root], [root]
        while stack:                          # 반복형 DFS로 오일러 투어 기록
            u = stack[-1]
            if it[u] < len(adj[u]):
                w = adj[u][it[u]]
                it[u] += 1
                if w != parent[u]:
                    parent[w], depth[w] = u, depth[u] + 1
                    self.first[w] = len(tour)
                    tour.append(w)
                    stack.append(w)
            else:
                stack.pop()
                if stack:
                    tour.append(stack[-1])    # 부모로 돌아오며 다시 기록
        key = lambda v: depth[v]
        self.sp = [tour]                      # sp[k][i] = tour[i:i+2ᵏ]의 최소
        while 2 ** len(self.sp) <= len(tour):
            prev, h = self.sp[-1], 2 ** (len(self.sp) - 1)
            self.sp.append([min(prev[i], prev[i + h], key=key)
                            for i in range(len(prev) - h)])
        self.key = key

    def lca(self, u, v):                      # 두 첫 등장 사이에서 가장 얕은 정점
        l, r = sorted((self.first[u], self.first[v]))
        k = (r - l + 1).bit_length() - 1
        return min(self.sp[k][l], self.sp[k][r - 2 ** k + 1], key=self.key)

ok = 0
for _ in range(500):
    n = rng.randint(1, 60)
    root, par, edges = random_tree(n, rng)
    a, b = LCA(n, edges, root), EulerLCA(n, edges, root)
    qs = [(rng.randrange(n), rng.randrange(n)) for _ in range(20)]
    ok += all(a.lca(u, v) == b.lca(u, v) == lca_brute(par, u, v)
              for u, v in qs)
print(f"세 방법 무작위 500개 비교: {ok}개 일치")
```
```text
세 방법 무작위 500개 비교: 500개 일치
```
투어 길이가 2n − 1이라 표는 이진 올리기의 2배쯤 되지만, 질의는 비교 한 번이다.

## 자주 하는 실수와 변형
- 루트의 부모를 −1로 두는 실수: 파이썬에서 `up[k][-1]`은 오류 없이 마지막 정점을 가리켜 틀린 답을 조용히 낸다. 루트 자신으로 두면 루트를 넘는 점프가 루트에 머물러 표의 모든 칸이 유효하다.
- `LOG` 부족: 2^LOG가 최대 깊이 이하이면 깊이 맞추기가 덜 오른다. 사슬 트리로 시험한다.
- 가중치 거리: 루트에서의 가중치 합 `W[v]`를 두면 `W[u] + W[v] − 2·W[LCA]`다.
- 경로 위 최대 간선: `up[k][v]`와 함께 그 2ᵏ칸 구간의 최대 간선을 저장해 오르며 합친다. 두 번째 최소 신장 트리에 쓰인다.
- 질의를 모두 미리 안다면 유니온 파인드(2편)로 DFS 한 번에 답하는 타잔의 오프라인 방법도 있다.

## 복잡도
| 항목 | 이진 올리기 | 오일러 투어 + 희소 |
|---|---|---|
| 전처리 | O(n log n) | O(n log n) |
| 질의 | O(log n) | O(1) |
| k번째 조상 | O(log n) | 어렵다 |
| 경로 집계(최대 등) | 가능 | 어렵다 |

한 칸씩 오르기는 전처리 O(n)이지만 질의가 최악 O(n)이다. 질의가 아주 많으면 O(1) 쪽이, k번째 조상이나 경로 집계가 필요하면 이진 올리기가 낫다.

## 어디에 쓰이나
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 그 글의 루트·부모·깊이 위에서 두 정점의 가장 깊은 공통 조상을 찾는 것이 LCA이고, 파일 시스템의 두 경로가 갈라지는 디렉터리가 그 예다.
- 6편 「희소 테이블: O(1) 구간 최솟값 질의」: 오일러 투어로 LCA를 RMQ로 바꾸면 그 글의 표를 그대로 쓴다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 두 번째 최소 신장 트리는 트리 경로 위 최대 간선을 이진 올리기로 구한다.
- Git: `git merge-base`는 두 커밋의 가장 좋은 공통 조상을 찾아 3-way 병합의 기준으로 삼는다. 커밋 그래프는 트리가 아니라 DAG라 후보가 여럿일 수 있다는 점이 다르다.

## 정리
- `up[k][v] = up[k−1][up[k−1][v]]`로 2ᵏ번째 조상 표를 O(n log n)에 채운다.
- 깊이 차를 2진수로 쪼개 깊이를 맞추고, 큰 점프부터 "갈라져 있으면 오른다"를 하면 LCA 바로 아래에 멈춘다.
- 사슬 두 개짜리 트리에서 한 칸씩은 10만 번, 이진 올리기는 34번 이하였다.
- 오일러 투어로 바꾸면 RMQ가 되어 O(1) 질의가 되지만, k번째 조상과 경로 집계는 이진 올리기가 편하다.

## 더 알아보기
- 이전 글: 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」
- 다음 글: 11편 「오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기」
