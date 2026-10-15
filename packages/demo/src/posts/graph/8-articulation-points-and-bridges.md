# [그래프 알고리즘 8/14] 단절점과 단절선: 끊으면 갈라지는 곳 찾기

> **한 줄 요약** — DFS 한 번으로 정점마다 "서브트리에서 역방향 간선 하나로 올라갈 수 있는 가장 높은 곳(low)"을 구하면, 지우면 그래프가 갈라지는 정점(단절점)과 간선(단절선), 그리고 그 사이의 이중 연결 요소를 모두 O(V + E)에 찾을 수 있다.

## 이 글에서 다루는 것
- 단절점·단절선의 정의와 "하나씩 지워 보기"가 느린 이유
- DFS 트리, 발견 순서 disc와 low 값, 단절 조건과 그 이유
- 반복 DFS 하나로 단절점·단절선·이중 연결 요소(블록) 구하기
- 지워 보기·사이클 열거와의 무작위 대조 검사, 자주 하는 실수

## 예제 문제: 하나만 고장 나도 끊기는 곳
라우터 8대가 케이블로 이어진 사내망이 있다. 라우터 한 대가 꺼지면 나머지가 서로 통신하지 못하게 되는 라우터는 어느 것인가? 케이블 한 가닥이 끊기면 망이 둘로 갈리는 케이블은?
```text
0 ─── 1 ─── 3 ─── 4 ─── 7
 \   /      │     │
  \ /       │     │
   2        5 ─── 6
```
무방향 그래프에서 지우면 연결 요소 수가 늘어나는 정점을 **단절점**(articulation point, cut vertex), 간선을 **단절선**(bridge)이라 한다. 위 그림의 답은 단절점 1, 3, 4와 단절선 1–3, 4–7이다. 그래프 용어는 이산수학 8편 「그래프의 기초: 정점과 간선」, DFS 자체는 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」을 참조한다.

## 단순한 방법: 하나씩 지워 보기
정의를 그대로 따르면 정점을 하나씩 빼고 BFS로 연결 요소를 세면 된다. 한 번에 O(V + E)이므로 단절점 전체는 O(V(V + E)), 단절선 전체는 O(E(V + E))다. V = E = 10⁵이면 10¹⁰번 가까운 연산이라 쓸 수 없다. 필요한 것은 DFS를 한 번만 하면서 "이 정점이 없으면 아래쪽이 위쪽과 끊기는가"를 판정하는 방법이다.

## DFS 트리와 low 값
무방향 그래프에서 DFS를 하면 간선은 두 종류뿐이다. 새 정점으로 내려가는 **트리 간선**, 그리고 이미 방문한 **조상**으로 올라가는 **역방향 간선**(back edge)이다. 서로 다른 가지를 잇는 간선은 생기지 않는다. v를 방문하는 동안 아직 안 간 이웃 w가 있었다면 DFS는 w를 v의 서브트리 안에서 방문했을 것이기 때문이다.

정점을 처음 방문한 순서를 disc[v]라 하고, low[v]를 "v의 서브트리에서 역방향 간선을 하나 타고 닿을 수 있는 가장 작은 disc"로 정한다. 점화식은 low[v] = min(disc[v], 역방향 간선 끝 w의 disc[w], 자식 c의 low[c])이다. 0에서 시작한 예제의 값은 다음과 같다.
```text
정점  0 1 2 3 4 5 6 7
disc  0 1 2 3 4 6 5 7
low   0 0 0 3 3 3 3 7
```
이제 판정은 부모 u와 자식 v의 값 비교로 끝난다.
- **루트가 아닌 u가 단절점** ⇔ low[v] ≥ disc[u]인 자식 v가 있다. v의 서브트리는 u보다 위로 가는 간선이 없으므로 u가 사라지면 위쪽과 끊긴다. 위 표에서 low[4] = 3 ≥ disc[3]이라 3이 단절점이다.
- **루트가 단절점** ⇔ DFS 자식이 2개 이상이다. 가지 사이를 잇는 간선이 없기 때문이다.
- **트리 간선 u–v가 단절선** ⇔ low[v] > disc[u]. 등호까지 빠지는 이유는 v 쪽이 u 자신에게도 돌아오지 못해야 하기 때문이다. 역방향 간선은 언제나 사이클 위에 있어 단절선이 아니다.

## 구현: 반복 DFS 하나로 셋 다
**이중 연결 요소**(biconnected component, 블록)는 정점 하나를 지워도 끊기지 않는 최대 부분 그래프다. DFS 중 지나간 간선을 스택에 쌓아 두었다가 low[v] ≥ disc[u]가 성립하는 순간 간선 u–v까지 꺼내면 그것이 블록 하나다. 재귀 깊이 문제는 6편 「강한 연결 요소: 타잔과 코사라주」에서 본 대로 명시적 스택으로 피한다.
```python
def lowlink(n, edges):
    adj = [[] for _ in range(n)]
    for i, (u, v) in enumerate(edges):
        adj[u].append((v, i))
        adj[v].append((u, i))
    disc, low = [-1] * n, [0] * n
    cut, bridges, blocks, estack, t = set(), [], [], [], 0
    for r in range(n):
        if disc[r] != -1:
            continue
        disc[r] = low[r] = t; t += 1
        stack, kids = [(r, -1, 0)], 0     # (정점, 들어온 간선, 다음 이웃 위치)
        while stack:
            v, pe, k = stack[-1]
            if k < len(adj[v]):
                stack[-1] = (v, pe, k + 1)
                w, i = adj[v][k]
                if i == pe:               # 들어온 "간선"만 건너뛴다
                    continue
                if disc[w] == -1:         # 트리 간선: 내려간다
                    disc[w] = low[w] = t; t += 1
                    estack.append(i)
                    stack.append((w, i, 0))
                elif disc[w] < disc[v]:   # 역방향 간선: 조상으로
                    low[v] = min(low[v], disc[w])
                    estack.append(i)
                continue
            stack.pop()                   # v의 서브트리를 다 봤다
            if not stack:
                break
            u = stack[-1][0]
            low[u] = min(low[u], low[v])
            kids += u == r
            if low[v] >= disc[u]:         # v 쪽은 u를 거쳐야만 위로 간다
                if u != r:
                    cut.add(u)
                block = []
                while not block or block[-1] != pe:
                    block.append(estack.pop())
                blocks.append(sorted(block))
            if low[v] > disc[u]:          # u 자신에게도 못 돌아온다
                bridges.append(pe)
        if kids >= 2:
            cut.add(r)
    return sorted(cut), sorted(bridges), blocks

E = [(0, 1), (1, 2), (2, 0), (1, 3), (3, 4), (4, 6), (6, 5), (5, 3), (4, 7)]
cut, br, blocks = lowlink(8, E)
print("단절점", cut)
print("단절선", [E[i] for i in br])
for b in blocks:
    print("블록", [E[i] for i in b])
print("평행 간선", lowlink(2, [(0, 1), (0, 1)])[1])
```
```text
단절점 [1, 3, 4]
단절선 [(1, 3), (4, 7)]
블록 [(4, 7)]
블록 [(3, 4), (4, 6), (6, 5), (5, 3)]
블록 [(1, 3)]
블록 [(0, 1), (1, 2), (2, 0)]
평행 간선 []
```
블록은 넷이고, 단절점 1·3·4는 두 블록에 동시에 속한다. 단절선은 간선 하나짜리 블록이 된다. 마지막 줄처럼 같은 두 정점을 잇는 간선이 둘이면 하나가 끊겨도 다른 하나가 남으므로 단절선이 아니다. 들어온 간선을 정점이 아니라 **간선 번호**로 건너뛰어야 두 번째 간선이 역방향 간선으로 잡혀 이 답이 나온다.

## 무작위 대조 검사
느린 쪽은 정의 그대로다. 정점·간선을 하나씩 빼고 유니온 파인드로 연결 요소를 센다. 블록은 "두 간선이 같은 단순 사이클 위에 있으면 같은 블록"이라는 성질을 써서, 간선 a–b마다 그 간선을 빼고 a에서 b로 가는 단순 경로를 모두 열거한다. 앞 코드에 이어서 실행한다.
```python
import random

def n_comp(n, edges, skip_v=-1, skip_e=-1):
    root = list(range(n))
    def find(x):
        while root[x] != x:
            x = root[x]
        return x
    c = n - (skip_v >= 0)
    for i, (u, v) in enumerate(edges):
        if i != skip_e and skip_v not in (u, v) and find(u) != find(v):
            root[find(u)] = find(v); c -= 1
    return c

def brute(n, edges):
    base = n_comp(n, edges)
    cut = [x for x in range(n) if n_comp(n, edges, skip_v=x) > base]
    br = [i for i in range(len(edges)) if n_comp(n, edges, skip_e=i) > base]
    grp = [{i} for i in range(len(edges))]  # 간선 i와 한 사이클에 있는 간선
    def walk(v, goal, seen, path, i):
        if v == goal:
            grp[i].update(path); return
        for j, (a, b) in enumerate(edges):
            w = b if a == v else a if b == v else None
            if j != i and w is not None and w not in seen:
                walk(w, goal, seen | {w}, path + [j], i)
    for i, (a, b) in enumerate(edges):
        walk(a, b, {a}, [], i)
    return cut, br, {frozenset(g) for g in grp}

rng = random.Random(8)
for _ in range(500):
    n = rng.randint(1, 7)
    E = [(u, v) for u in range(n) for v in range(u + 1, n) for _ in range(2)
         if rng.random() < 0.3]
    cut, br, blocks = lowlink(n, E)
    assert (cut, br, {frozenset(b) for b in blocks}) == brute(n, E), E
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
정점 쌍마다 간선을 두 번 뽑을 기회를 주어 평행 간선과 끊긴 그래프도 섞었다. 500개 중 단절점이 있는 그래프가 198개, 단절선이 있는 그래프가 247개, 평행 간선이 있는 그래프가 248개였다.

## 이중 연결 요소 두 가지와 변형
- **정점 기준 블록**: 위 코드의 블록이다. 블록과 단절점을 정점으로 놓고 소속 관계를 이으면 트리가 되는데, 이를 **블록-단절점 트리**(block-cut tree)라 한다. "a에서 b로 가려면 반드시 지나야 하는 정점"은 이 트리 위 경로에 있는 단절점이다.
- **간선 기준 2-간선 연결 요소**: 단절선만 지우고 남은 연결 요소다. 요소를 점으로 줄이면 단절선이 간선인 트리가 된다. "간선을 최소 몇 개 더해야 단절선이 없어지나"는 이 트리의 잎이 L개일 때 ⌈L/2⌉로 알려진 유형이다.
- 9편의 플뢰리 알고리즘처럼 "다리를 마지막에 건너라"는 규칙도 단절선 판정에 기댄다.

## 자주 하는 실수
- 들어온 간선을 부모 **정점**으로 건너뛰면 평행 간선이 있을 때 단절선을 잘못 보고한다.
- 루트에 "low[v] ≥ disc[u]" 규칙을 그대로 쓰면 자식이 하나뿐인 루트도 단절점이 된다. 루트는 자식 수로 따로 판정한다.
- 역방향 간선에서 disc[w] 대신 low[w]를 쓰면 단절선은 맞아도 단절점이 틀릴 수 있다. 두 삼각형이 꼭짓점 하나를 공유하는 나비넥타이 모양에서 가운데 정점을 놓치는 것을 대조 검사로 확인했다.
- 끊긴 그래프에서 정점 0 하나만 루트로 DFS하면 다른 요소를 빠뜨린다.

역사적으로는 타잔(Robert Tarjan)이 1972년 DFS 기반 선형 시간 그래프 알고리즘들을 발표했고, 호프크로프트(John Hopcroft)와 함께 1973년 이중 연결 요소 알고리즘을, 1974년에는 단절선을 선형 시간에 찾는 짧은 논문을 냈다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 정점 하나씩 지우기 | O(V(V + E)) | O(V + E) |
| 간선 하나씩 지우기 | O(E(V + E)) | O(V + E) |
| low 값 DFS | O(V + E) | O(V + E) |

DFS는 간선마다 양쪽 끝에서 한 번씩 보고, 간선 스택에는 각 간선이 한 번만 들어갔다 나온다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 그 글의 DFS에 방문 순서와 low 값 두 배열만 더하면 이 글의 알고리즘이 된다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 블록-단절점 트리와 2-간선 연결 요소 트리는 일반 그래프를 트리로 줄여 트리 알고리즘을 쓸 수 있게 한다.
- 네트워크 설계: 단절점·단절선은 망의 단일 장애점(single point of failure)이다. 이중화할 장비와 회선을 고르는 첫 단계가 이 계산이다.
- 6편 「강한 연결 요소: 타잔과 코사라주」: 같은 disc·low 아이디어를 방향 그래프에 쓴 것이 타잔의 SCC 알고리즘이다.

## 정리
- 무방향 DFS에는 트리 간선과 조상으로 가는 역방향 간선만 있다.
- low[v]는 v의 서브트리가 역방향 간선 하나로 닿는 가장 높은 곳이고, low[v] ≥ disc[u]면 u가 단절점, low[v] > disc[u]면 u–v가 단절선이다.
- 간선 스택을 함께 쓰면 같은 DFS에서 이중 연결 요소까지 O(V + E)에 나온다.
- 들어온 간선은 간선 번호로 건너뛰고, 루트는 자식 수로 따로 판정한다.

## 더 알아보기
- 이전 글: 7편 「2-SAT: 논리식을 그래프로 풀기」
- 다음 글: 9편 「오일러 경로: 모든 간선을 한 번씩 지나기」
- 이중 연결 요소(위키백과 영어판): https://en.wikipedia.org/wiki/Biconnected_component
