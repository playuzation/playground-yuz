# [그래프 알고리즘 6/14] 강한 연결 요소: 타잔과 코사라주

> **한 줄 요약** — 방향 그래프에서 서로 오갈 수 있는 정점끼리 묶은 강한 연결 요소(SCC)는 DFS 한 번(타잔)이나 두 번(코사라주)으로 O(V + E)에 모두 찾을 수 있고, SCC를 정점 하나로 줄이면 사이클 없는 DAG가 남는다.

## 이 글에서 다루는 것
- SCC의 정의: "서로 닿는다"는 동치 관계
- 코사라주: 끝나는 순서와 뒤집은 그래프
- 타잔: low 값과 스택
- 응축 그래프와 위상 순서, 파이썬 재귀 깊이 대책

## 예제와 단순한 방법
방향 그래프에서 u에서 v로도, v에서 u로도 갈 수 있으면 "서로 닿는다"고 하자. 이 관계는 반사·대칭·추이를 만족하는 동치 관계라(이산수학 5편 「관계: 동치 관계와 순서 관계」) 정점들을 겹치지 않게 나누고, 그 묶음 하나하나를 **강한 연결 요소**(SCC, strongly connected component)라 한다. 웹 페이지 링크, 함수 호출, 모듈 import 그래프에서 서로 얽혀 있는 덩어리가 SCC다. 단순한 방법은 정점마다 탐색해 도달 집합을 구하고 서로 닿는 쌍을 묶는 것으로 O(V(V + E))다.

## 코사라주: 끝나는 순서와 뒤집은 그래프
1단계에서 DFS를 돌며 정점이 끝나는(이웃을 다 본) 순서를 기록한다. 2단계에서는 간선을 모두 뒤집은 그래프에서, 가장 늦게 끝난 정점부터 탐색을 시작한다. 탐색 한 번이 닿는 정점이 정확히 SCC 하나다. SCC를 정점으로 줄인 그래프(**응축 그래프**)는 DAG이고, SCC A에서 B로 가는 간선이 있으면 A의 가장 늦은 종료가 B의 것보다 늦다. 그래서 가장 늦게 끝난 정점은 들어오는 간선이 없는 SCC에 있다. 간선을 뒤집으면 그 SCC는 나가는 간선이 없는 막다른 곳이 되어 탐색이 밖으로 새지 않는다. 그 SCC를 빼고 반복하면 된다. 코사라주(S. Rao Kosaraju)가 1978년에 논문 없이 알렸고, 샤리르(Micha Sharir)가 1981년에 출판했다.

## 타잔: low 값과 스택
타잔(Robert Tarjan)의 1972년 알고리즘은 DFS 한 번으로 끝낸다. 정점마다 방문 순서 `idx`와, DFS 서브트리에서 간선 하나로 닿는 "아직 SCC가 정해지지 않은(스택에 있는) 정점"의 가장 작은 방문 순서 `low`를 구한다. `low[u] == idx[u]`이면 u보다 먼저 방문한 정점으로 올라갈 길이 없으므로 u가 SCC의 뿌리이고, 스택에서 u까지 꺼낸 정점들이 SCC 하나다. 이미 SCC가 정해진 정점으로 가는 간선은 무시해야 한다. 그 SCC는 u로 돌아올 수 없기 때문이다.
```python
def tarjan(n, adj):                      # 재귀 DFS 한 번
    idx, low, on = [-1] * n, [0] * n, [False] * n
    st, comps, clock = [], [], [0]
    def dfs(u):
        idx[u] = low[u] = clock[0]       # 방문 순서
        clock[0] += 1
        st.append(u)
        on[u] = True
        for v in adj[u]:
            if idx[v] < 0:
                dfs(v)
                low[u] = min(low[u], low[v])
            elif on[v]:                  # 아직 SCC가 정해지지 않은 정점
                low[u] = min(low[u], idx[v])
        if low[u] == idx[u]:             # u가 SCC의 뿌리: 스택에서 꺼낸다
            comp = []
            while not comp or comp[-1] != u:
                comp.append(st.pop())
                on[comp[-1]] = False
            comps.append(sorted(comp))
    for u in range(n):
        if idx[u] < 0:
            dfs(u)
    return comps                         # 위상 순서의 역순으로 나온다

def kosaraju(n, adj):                    # 반복문 DFS 두 번
    order, seen = [], [False] * n
    for s in range(n):                   # 1단계: 끝나는 순서 기록
        if seen[s]:
            continue
        seen[s] = True
        st = [(s, iter(adj[s]))]
        while st:
            u, it = st[-1]
            for v in it:
                if not seen[v]:
                    seen[v] = True
                    st.append((v, iter(adj[v])))
                    break
            else:                        # u의 이웃을 다 봤다
                st.pop()
                order.append(u)
    radj = [[] for _ in range(n)]
    for u in range(n):
        for v in adj[u]:
            radj[v].append(u)
    comp, comps = [-1] * n, []
    for s in reversed(order):            # 2단계: 늦게 끝난 정점부터
        if comp[s] < 0:                  # 뒤집은 그래프에서 퍼진다
            comp[s], group, st = len(comps), [s], [s]
            while st:
                for v in radj[st.pop()]:
                    if comp[v] < 0:
                        comp[v] = comp[s]
                        group.append(v)
                        st.append(v)
            comps.append(sorted(group))
    return comps                         # 위상 순서로 나온다

edges = [(0, 1), (1, 2), (2, 0), (2, 3), (3, 4), (4, 5), (5, 3),
         (5, 6), (6, 7), (7, 6), (4, 7), (1, 8), (8, 6)]
adj = [[] for _ in range(9)]
for u, v in edges:
    adj[u].append(v)
print("타잔", *tarjan(9, adj))
print("코사라주", *kosaraju(9, adj))
```
```text
타잔 [6, 7] [3, 4, 5] [8] [0, 1, 2]
코사라주 [0, 1, 2] [8] [3, 4, 5] [6, 7]
```
두 결과는 정확히 역순이다. 타잔에서는 더 아래쪽(나중에 도달하는) SCC가 먼저 끝나 먼저 꺼내지고, 코사라주는 들어오는 간선이 없는 SCC부터 찾는다.

## 응축 그래프와 재귀 깊이
```python
# 앞 코드에 이어서
def condense(n, adj, comps):             # SCC 하나를 정점 하나로
    cid = [0] * n
    for i, c in enumerate(comps):
        for v in c:
            cid[v] = i
    return sorted({(cid[u], cid[v]) for u in range(n) for v in adj[u]
                   if cid[u] != cid[v]})

print("응축:", condense(9, adj, kosaraju(9, adj)))
chain = [[i + 1] for i in range(4999)] + [[]]  # 0→1→…→4999
try:
    tarjan(5000, chain)
except RecursionError:
    print("재귀 타잔: RecursionError")
print(f"반복 코사라주: SCC {len(kosaraju(5000, chain))}개")
```
```text
응축: [(0, 1), (0, 2), (1, 3), (2, 3)]
재귀 타잔: RecursionError
반복 코사라주: SCC 5000개
```
응축 그래프의 간선이 모두 번호가 작은 SCC에서 큰 SCC로 향한다. 코사라주가 내놓은 순서가 그대로 위상 순서(이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」)라는 뜻이다. 그래서 SCC 문제는 흔히 "SCC로 줄인 뒤 DAG 위에서 DP"로 푼다. 예를 들어 같은 SCC 안의 점수는 돌아다니며 모두 모을 수 있으니, SCC마다 점수를 합친 뒤 위상 순서로 최대 경로 합을 구한다.

재귀 타잔은 정점 5000개짜리 사슬에서 파이썬의 기본 재귀 한도(1000)에 걸렸다. `sys.setrecursionlimit`만 올리면 실제 스택이 모자라 프로세스가 비정상 종료될 수 있으므로, `threading.stack_size`로 스택을 키운 스레드에서 돌리거나 코사라주처럼 반복문으로 짠다. 위 반복문 DFS는 정점마다 `iter(adj[u])`를 스택에 두고, 돌아올 때 다음 이웃부터 이어 본다.

## 무작위 대조 검사
느린 답은 정점마다 도달 집합을 구해 서로 닿는 정점끼리 묶는다. 두 알고리즘의 묶음이 느린 답과 같은지에 더해, 응축 그래프의 간선이 각자의 순서(코사라주는 위상 순서, 타잔은 그 역순)를 따르는지도 확인한다.
```python
# 앞 코드에 이어서
import random

def slow(n, adj):                        # 서로 닿는 정점끼리 묶는다
    reach = []
    for s in range(n):
        seen, st = {s}, [s]
        while st:
            for v in adj[st.pop()]:
                if v not in seen:
                    seen.add(v)
                    st.append(v)
        reach.append(seen)
    return {frozenset(v for v in range(n) if v in reach[u] and u in reach[v])
            for u in range(n)}

rng, ok = random.Random(6), 0
for _ in range(500):
    n = rng.randint(1, 9)
    adj = [[] for _ in range(n)]
    for _ in range(rng.randint(0, 2 * n)):
        adj[rng.randrange(n)].append(rng.randrange(n))
    t, k = tarjan(n, adj), kosaraju(n, adj)
    same = {frozenset(c) for c in t} == {frozenset(c) for c in k} \
        == slow(n, adj)
    topo = all(a < b for a, b in condense(n, adj, k)) and \
        all(a > b for a, b in condense(n, adj, t))  # 타잔은 역순
    ok += same and topo
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
무작위 500개 비교: 모두 일치
```

## 복잡도
| 방법 | 시간 | 추가 공간 |
|---|---|---|
| 정점마다 탐색 | O(V(V + E)) | O(V²) |
| 코사라주 | O(V + E) | O(V + E) |
| 타잔 | O(V + E) | O(V) |

두 알고리즘 모두 정점과 간선을 상수 번씩만 본다. 코사라주는 뒤집은 그래프를 따로 만들어야 하고, 타잔은 DFS 한 번에 끝나는 대신 low 계산이 조금 까다롭다.

## 어디에 쓰이나
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: "서로 닿는다"는 동치 관계이고 SCC는 그 동치류이며, 응축 그래프 위의 도달 관계는 부분 순서가 된다.
- 이 플랫폼의 `scripts/check-deps.mjs`: 파일 import 그래프에서 순환을 하나 찾으면 그 경로를 보고하는데, SCC를 구하면 서로 얽힌 파일 묶음 전체를 한 번에 보여 줄 수 있다. 크기가 2 이상인 SCC(또는 자기 자신을 import하는 파일)가 곧 순환이다.
- 7편 「2-SAT: 논리식을 그래프로 풀기」: 변수 x와 ¬x가 같은 SCC에 있는지로 만족 가능성을 판정하고, SCC의 위상 순서로 해를 만든다.

## 정리
- SCC는 서로 닿는 정점의 묶음, 즉 "서로 닿음" 동치 관계의 동치류다.
- 코사라주는 끝나는 순서를 기록한 뒤 뒤집은 그래프에서 늦게 끝난 정점부터 탐색한다.
- 타잔은 DFS 한 번으로 low를 계산해 `low == idx`인 뿌리에서 스택을 잘라 낸다.
- SCC를 줄인 응축 그래프는 DAG이고, 파이썬에서는 재귀 깊이 때문에 반복문 DFS가 안전하다.

## 더 알아보기
- 이전 글: 5편 「최소 신장 트리: 크루스칼과 프림」
- 다음 글: 7편 「2-SAT: 논리식을 그래프로 풀기」
- 위키백과 영어판 Strongly connected component: https://en.wikipedia.org/wiki/Strongly_connected_component
