# [그래프 알고리즘 10/14] 네트워크 플로우: 포드-풀커슨과 에드몬즈-카프

> **한 줄 요약** — 최대 유량은 잔여 그래프에서 s에서 t로 가는 증가 경로를 찾아 병목만큼 흘려 보내기를 반복해 구하며, 보낸 양을 되돌릴 수 있게 하는 역방향 간선이 탐욕의 실수를 고쳐 주고, 증가 경로를 BFS로 고르면(에드몬즈-카프) 용량과 무관하게 O(VE²)에 끝난다.

## 이 글에서 다루는 것
- 용량·유량·보존 법칙과 최대 유량 문제
- 역방향 간선이 필요한 이유를 탐욕이 실패하는 예제로 보기
- 포드-풀커슨 방법과, 경로를 잘못 고르면 2,000번 도는 예
- 에드몬즈-카프가 O(VE²)인 이유와 증가 횟수 비교, 완전 탐색 최소 컷 대조

## 예제 문제: 초당 몇 개까지 보낼 수 있나
데이터 센터 S에서 T로 패킷을 보낸다. 링크마다 초당 보낼 수 있는 상한이 있다. 동시에 최대 얼마를 흘려 보낼 수 있을까? 링크 u → v의 상한을 **용량**(capacity) c(u, v), 실제로 흘리는 양을 **유량**(flow) f(u, v)라 하면 조건은 두 가지다.
```text
용량 제한: 0 ≤ f(u,v) ≤ c(u,v)
보존 법칙: S, T 말고는
           들어온 합 = 나간 합
유량의 값: S에서 나간 합
```
이 값을 최대로 하는 것이 **최대 유량**(maximum flow) 문제다. 해리스(T. E. Harris)와 로스(F. S. Ross)는 소련 철도망의 수송 능력을 단순화한 모델로 이 문제를 정식화했는데, 그 1955년 미 공군 보고서는 1999년에야 기밀이 해제되었다. 포드(L. R. Ford Jr.)와 풀커슨(D. R. Fulkerson)은 1954년 RAND 보고서를 거쳐 1956년 논문에서 최대 유량 최소 컷 정리를 증명했고, 아래의 증가 경로 반복 방법은 두 사람의 이름으로 불린다.

## 탐욕으로 보내면 막힌다
모든 용량이 1인 다이아몬드 그래프를 보자.
```text
S ──1──→ A ──1──→ T
│        │        ↑
│        1        │
│        ↓        │
└──1───→ B ───1───┘
```
답은 2(S → A → T, S → B → T)다. 그런데 처음에 S → A → B → T로 1을 보내면 S → A와 B → T가 꽉 차서 더 갈 길이 없다. 탐욕은 1에서 멈춘다.

해결책은 "보낸 것을 취소할 권리"를 간선으로 만드는 것이다. u → v로 f를 보냈다면 v → u 방향에 용량 f짜리 **역방향 간선**을 둔다. 남은 용량 c − f인 정방향 간선과 이 역방향 간선을 모은 것이 **잔여 그래프**(residual graph)이고, 그 위의 s → t 경로를 **증가 경로**(augmenting path)라 한다. 위 예에서는 S → B → A → T가 증가 경로다. B → A는 A → B로 보낸 1을 되돌리는 간선이므로, 결과적으로 A로 들어온 1은 T로, B로 들어온 1도 T로 가게 흐름이 다시 짜인다.
```python
from collections import deque

def build(n, edges):
    g, to, cap = [[] for _ in range(n)], [], []
    for u, v, c in edges:                 # 간선 2k와 역간선 2k+1이 짝
        g[u].append(len(to)); to.append(v); cap.append(c)
        g[v].append(len(to)); to.append(u); cap.append(0)
    return g, to, cap

def bfs_path(g, to, cap, s, t):           # 간선 수가 가장 적은 증가 경로
    prev = [-1] * len(g); prev[s] = -2
    q = deque([s])
    while q and prev[t] == -1:
        v = q.popleft()
        for i in g[v]:
            if cap[i] > 0 and prev[to[i]] == -1:
                prev[to[i]] = i; q.append(to[i])
    if prev[t] == -1:
        return None
    path, v = [], t
    while v != s:
        path.append(prev[v]); v = to[prev[v] ^ 1]
    return path

def dfs_path(g, to, cap, s, t, back=True):  # 먼저 보이는 길로 깊이
    seen = {s}
    def go(v):
        if v == t:
            return []
        for i in g[v]:
            if cap[i] > 0 and to[i] not in seen and (back or i % 2 == 0):
                seen.add(to[i])
                rest = go(to[i])
                if rest is not None:
                    return [i] + rest
        return None
    return go(s)

def max_flow(n, edges, s, t, find=bfs_path):
    g, to, cap = build(n, edges)
    flow = rounds = 0
    while (path := find(g, to, cap, s, t)) is not None:
        b = min(cap[i] for i in path)     # 병목 용량
        for i in path:
            cap[i] -= b; cap[i ^ 1] += b  # 보낸 만큼 되돌릴 여지가 생긴다
        flow += b; rounds += 1
    return flow, rounds

S, A, B, T = range(4)
diamond = [(S, A, 1), (S, B, 1), (A, B, 1), (A, T, 1), (B, T, 1)]
no_back = lambda *a: dfs_path(*a, back=False)
print("역간선 없이 DFS", max_flow(4, diamond, S, T, no_back))
print("역간선 쓰는 DFS", max_flow(4, diamond, S, T, dfs_path))
print("에드몬즈-카프  ", max_flow(4, diamond, S, T))
```
```text
역간선 없이 DFS (1, 1)
역간선 쓰는 DFS (2, 2)
에드몬즈-카프   (2, 2)
```
괄호 안은 (유량, 증가 횟수)다. 같은 DFS라도 역간선을 막으면 첫 경로 S → A → B → T에 갇혀 1에서 멈추고, 열어 두면 두 번째 경로 S → B → A → T를 찾아 2가 된다. 간선을 짝수 번호 2k, 역간선을 2k + 1로 저장하면 짝은 `i ^ 1` 한 번으로 찾는다. 원래 간선에 실제로 흐르는 양은 역간선의 `cap`이다.

## 포드-풀커슨 방법과 나쁜 경로 선택
증가 경로가 없을 때까지 "경로 찾기 → 병목만큼 보내기"를 반복하는 것이 **포드-풀커슨 방법**(Ford-Fulkerson method)이다. 증가 경로가 없으면 최대라는 사실은 다음 글의 최대 유량 최소 컷 정리가 보장한다. 용량이 정수면 매번 1 이상 늘므로 최대 유량 값 F번 안에 끝나고, 한 번에 O(E)라 O(E·F)다. 이 한계는 실제로 닿는다. 가운데 간선만 1이고 나머지가 1,000인 다이아몬드에서, 매번 병목이 가장 작은 경로를 고르게 해 보자. 앞 코드에 이어서 실행한다.
```python
import random

def worst_path(g, to, cap, s, t):         # 병목이 가장 작은 단순 경로
    best = []
    def go(v, seen, path):
        if v == t:
            b = min(cap[i] for i in path)
            if not best or b < best[0]:
                best[:] = [b, path[:]]
            return
        for i in g[v]:
            if cap[i] > 0 and to[i] not in seen:
                path.append(i); go(to[i], seen | {to[i]}, path); path.pop()
    go(s, {s}, [])
    return best[1] if best else None

M = 1000
big = [(S, A, M), (S, B, M), (A, B, 1), (A, T, M), (B, T, M)]
print("나쁜 경로 선택", max_flow(4, big, S, T, worst_path))
print("에드몬즈-카프 ", max_flow(4, big, S, T))

rng = random.Random(1)
n = 100
E = [(u, v, rng.randint(1, 10**5)) for u in range(n) for v in range(n)
     if u != v and rng.random() < 0.1]
print("V", n, "E", len(E))
print("에드몬즈-카프", max_flow(n, E, 0, n - 1))
print("DFS         ", max_flow(n, E, 0, n - 1, dfs_path))
```
```text
나쁜 경로 선택 (2000, 2000)
에드몬즈-카프  (2000, 2)
V 100 E 997
에드몬즈-카프 (333825, 19)
DFS          (333825, 8319)
```
나쁜 선택은 S → A → B → T와 S → B → A → T를 번갈아 타며 매번 1씩, 2,000번 보낸다. 용량을 10⁹로 바꾸면 20억 번이다. 무작위 그래프에서도 DFS는 긴 경로를 고르다 작은 병목에 걸려 증가를 8,319번 했고, BFS는 19번이었다. 용량이 무리수면 증가가 끝없이 이어질 수도 있다.

## 에드몬즈-카프: 가장 짧은 경로부터
증가 경로를 BFS로, 즉 간선 수가 가장 적은 것으로 고르면 증가 횟수가 용량과 무관해진다. 1972년 에드몬즈(Jack Edmonds)와 카프(Richard Karp)의 논문이 이를 보였고, 디니츠(Yefim Dinitz)도 1970년에 독립적으로 같은 사실을 발표했다. 증명의 뼈대는 두 단계다.
- 잔여 그래프에서 s로부터의 BFS 거리 d(v)는 증가를 거듭해도 줄지 않는다. 증가로 새로 생기는 간선은 경로를 거꾸로 가는 역간선뿐이고, 이들은 거리가 1 큰 곳에서 1 작은 곳으로 향해 지름길을 만들지 못한다.
- 병목이 되어 꽉 찬 간선 u → v는 d(v) = d(u) + 1이었다. 이 간선이 다시 쓰이려면 먼저 v → u로 흘러야 하고, 그때 d(u) = d(v) + 1이므로 d(u)는 2 이상 커진다. 거리는 V를 넘지 못하니 간선 하나가 병목이 되는 횟수는 V/2번 이하다.

간선이 E개이므로 증가는 O(VE)번이고, BFS 한 번이 O(E)라 전체는 O(VE²)다.

## 무작위 대조 검사
느린 쪽은 다음 글에서 증명할 "최대 유량 = 최소 컷"을 빌린다. s를 포함하고 t를 포함하지 않는 정점 집합을 모두 시도해 그 집합에서 밖으로 나가는 간선 용량 합의 최솟값을 구한다. 앞 코드에 이어서 실행한다.
```python
def brute_min_cut(n, edges, s, t):        # s 쪽 집합을 모두 시도
    best = float("inf")
    for mask in range(1 << n):
        if mask >> s & 1 and not mask >> t & 1:
            best = min(best, sum(c for u, v, c in edges
                                 if mask >> u & 1 and not mask >> v & 1))
    return best

rng = random.Random(10)
for _ in range(500):
    n = rng.randint(2, 7)
    E = [(u, v, rng.randint(1, 20)) for u in range(n) for v in range(n)
         if u != v and rng.random() < 0.4]
    f1, _ = max_flow(n, E, 0, n - 1)
    f2, _ = max_flow(n, E, 0, n - 1, dfs_path)
    assert f1 == f2 == brute_min_cut(n, E, 0, n - 1), E
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 자주 하는 실수와 변형
- 역간선을 만들지 않거나 `cap[i ^ 1] += b`를 빠뜨리면 위의 탐욕과 같아진다.
- 무방향 링크는 정방향 c, 역방향 c인 간선 한 쌍으로 넣는다. 용량 0인 역간선을 따로 또 만들 필요는 없다.
- 재귀 DFS는 경로 길이만큼 깊어지므로 정점이 많으면 BFS 쪽이 안전하다.
- 출발점이나 도착점이 여럿이면 가상의 슈퍼 소스·싱크를 붙인다. 정점 용량, 하한 같은 다른 제약은 14편 「플로우로 모델링하기: 정점 분할, 프로젝트 선택, 하한 있는 유량」에서 다룬다.
- 간선을 공유하지 않는 경로의 최대 개수는 모든 용량을 1로 둔 최대 유량이고, 12편의 이분 매칭도 같은 방식으로 환원된다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 포드-풀커슨(임의 경로) | O(E·F) | 정수 용량일 때 |
| 에드몬즈-카프(BFS) | O(VE²) | 용량과 무관 |
| 공간 | O(V + E) | 역간선 포함 2E |

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 에드몬즈-카프의 핵심은 그 글의 BFS를 잔여 용량이 남은 간선에만 돌리는 것이다.
- 이산수학 8편 「그래프의 기초: 정점과 간선」: 짝 간선 번호를 쓰는 위 구현은 그 글의 인접 리스트에 간선 배열을 더한 형태다.
- 수송·통신 용량 계획: 철도망 수송 능력 추정이 이 문제의 출발점이었고, 망의 두 지점 사이에 동시에 보낼 수 있는 양을 계산하는 데 쓴다.
- 12편 「이분 매칭: 증가 경로와 쾨니그 정리」: 같은 증가 경로 아이디어를 매칭에 적용한다.

## 정리
- 최대 유량은 용량 제한과 보존 법칙을 지키며 s에서 t로 흘리는 양의 최댓값이다.
- 역방향 간선은 이미 보낸 유량을 되돌릴 권리이고, 이것이 있어야 탐욕의 잘못된 선택이 고쳐진다.
- 포드-풀커슨은 경로 선택에 따라 최대 유량 값 F번까지 돌아 O(E·F)가 될 수 있고, BFS로 가장 짧은 경로를 고르면 O(VE²)로 용량과 무관해진다.
- 결과는 완전 탐색 최소 컷과 500개 입력에서 모두 일치했다.

## 더 알아보기
- 이전 글: 9편 「오일러 경로: 모든 간선을 한 번씩 지나기」
- 다음 글: 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」
- 에드몬즈-카프 알고리즘(위키백과 영어판): https://en.wikipedia.org/wiki/Edmonds%E2%80%93Karp_algorithm
