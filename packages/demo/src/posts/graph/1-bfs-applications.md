# [그래프 알고리즘 1/14] BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색

> **한 줄 요약** — BFS는 큐에 무엇을 어떻게 넣느냐만 바꾸면 여러 시작점의 거리, 가중치가 0과 1뿐인 최단 경로, 열쇠 같은 상태가 붙은 탐색까지 모두 선형 시간에 풀어 준다.

## 이 글에서 다루는 것
- 시작점을 한꺼번에 넣는 다중 시작점 BFS
- 덱으로 푸는 0-1 BFS와 흔한 실수
- (위치, 열쇠)를 정점으로 삼는 상태 공간 탐색
- 양쪽에서 퍼지는 양방향 BFS

## 출발점: 큐 안의 거리는 줄지 않는다
BFS가 간선 수 기준 최단 거리를 준다는 것은 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」에서 다뤘다. 증명의 핵심은 **큐 안의 거리가 줄지 않고 많아야 d와 d + 1 두 값**이라는 불변식이다. 이 글의 기법은 모두 이 불변식을 지키며 그래프를 바꿔 끼운다. 격자에서는 칸이 정점, 상하좌우 이웃이 간선이다.

## 다중 시작점 BFS
예제: 격자에 상점 S가 여러 개 있다. 빈칸마다 가장 가까운 상점까지의 거리는? 상점마다 BFS를 돌리면 상점 K개에 O(K·RC)다. 대신 모든 상점을 거리 0으로 큐에 한꺼번에 넣고 BFS를 한 번 돌린다. 모든 상점과 이어진 **가상의 시작점**에서 BFS를 하고 1을 뺀 것과 같으므로 맞고, O(RC)다. 여러 곳에서 동시에 번지는 불 같은 유형이 모두 이것이다. 느린 답은 시작점마다 따로 돌린 BFS의 칸별 최솟값이다.
```python
from collections import deque
import random

def nbrs(grid, r, c):                    # 격자 안의 이웃 칸
    for nr, nc in ((r+1, c), (r-1, c), (r, c+1), (r, c-1)):
        if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]):
            yield nr, nc

def multi_bfs(grid, sources):
    dist = [[-1] * len(grid[0]) for _ in grid]
    for r, c in sources:                 # 시작점을 모두 거리 0으로
        dist[r][c] = 0
    q = deque(sources)
    while q:
        r, c = q.popleft()
        for nr, nc in nbrs(grid, r, c):
            if grid[nr][nc] != "#" and dist[nr][nc] < 0:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist

grid = ["S..#...",
        ".#.#.#.",
        "...#..S",
        ".##..#.",
        "S...#.."]
src = [(r, c) for r in range(5) for c in range(7) if grid[r][c] == "S"]
for row in multi_bfs(grid, src):
    print(" ".join("#" if d < 0 else str(d) for d in row))

rng, ok = random.Random(1), 0
for _ in range(500):
    R, C = rng.randint(1, 6), rng.randint(1, 6)
    g = [rng.choices("..#", k=C) for _ in range(R)]
    e = [(r, c) for r in range(R) for c in range(C) if g[r][c] == "."]
    s = rng.sample(e, min(3, len(e)))
    each = [multi_bfs(g, [p]) for p in s]   # 시작점마다 따로 BFS
    slow = [[min([d[r][c] for d in each if d[r][c] >= 0], default=-1)
             for c in range(C)] for r in range(R)]
    ok += multi_bfs(g, s) == slow
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
0 1 2 # 4 3 2
1 # 3 # 3 # 1
2 3 4 # 2 1 0
1 # # 4 3 # 1
0 1 2 3 # 3 2
무작위 500개 비교: 모두 일치
```

## 0-1 BFS: 가중치가 0과 1뿐일 때
예제: 벽(#)을 최소 몇 개 부숴야 왼쪽 위에서 오른쪽 아래로 갈 수 있나? 빈칸으로 가는 간선은 비용 0, 벽 칸으로 가는 간선은 비용 1인 그래프의 최단 경로다. 2편의 다익스트라로도 풀리지만 log가 붙는다. **0-1 BFS**는 큐 대신 **덱**(deque)을 쓴다. 비용 0 간선으로 거리가 준 정점은 덱 앞에, 비용 1이면 뒤에 넣는다. 그러면 덱은 "앞에 d, 뒤에 d + 1" 모양을 유지하고, 앞에서 꺼낸 정점이 늘 가장 가깝다. 힙이 하던 일을 덱이 O(1)에 한다.
```python
# 앞 코드에 이어서
def bfs01(adj, s):                       # adj[u] = [(v, 0 또는 1), ...]
    dist = [float("inf")] * len(adj)
    dist[s] = 0
    dq = deque([s])
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:    # 방문 표시 대신 거리 비교
                dist[v] = dist[u] + w
                if w:
                    dq.append(v)         # 거리 + 1: 뒤에
                else:
                    dq.appendleft(v)     # 같은 거리: 앞에
    return dist

def wrong(adj, s):                       # 흔한 실수: 처음 발견 때 확정
    dist, dq = {s: 0}, deque([s])
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if v not in dist:
                dist[v] = dist[u] + w
                (dq.append if w else dq.appendleft)(v)
    return [dist.get(v, float("inf")) for v in range(len(adj))]

def slow(adj, s):                        # n번 완화(벨만-포드)
    dist = [float("inf")] * len(adj)
    dist[s] = 0
    for _ in adj:
        for u in range(len(adj)):
            for v, w in adj[u]:
                dist[v] = min(dist[v], dist[u] + w)
    return dist

rng, ok, bad = random.Random(2), 0, 0
for _ in range(500):
    n = rng.randint(1, 8)
    adj = [[(rng.randrange(n), rng.randint(0, 1))
            for _ in range(rng.randint(0, 3))] for _ in range(n)]
    ok += bfs01(adj, 0) == slow(adj, 0)
    bad += wrong(adj, 0) != slow(adj, 0)
print(f"0-1 BFS {ok}개 일치, 실수 버전 {bad}개 틀림")
```
```text
0-1 BFS 500개 일치, 실수 버전 35개 틀림
```
`wrong`은 보통 BFS처럼 처음 발견할 때 거리를 확정한다. 비용 1 간선으로 먼저 발견된 정점이 뒤늦게 비용 0 경로로 더 가까워지는 경우를 놓쳐 35개가 틀렸다. 그래서 방문 표시 대신 거리가 줄 때만 갱신하고, 한 정점이 덱에 두 번 들어갈 수 있다. 벽 부수기처럼 비용이 들어가는 칸에만 달린 격자에서는 이 실수가 우연히 맞아서(격자 500개로 바꾸면 모두 맞았다) 발견이 늦어진다.

## 상태 공간 탐색: (위치, 열쇠)
예제: 소문자 a, b는 열쇠, 대문자 A, B는 그 열쇠가 있어야 지나는 문이다. 왼쪽 위에서 E까지 최소 몇 번 움직이나? 칸만 정점으로 보면 틀린다. 열쇠를 줍기 전과 뒤의 같은 칸은 갈 수 있는 곳이 다르기 때문이다. 그래서 정점을 **상태** (행, 열, 가진 열쇠)로 바꾸고, 열쇠 집합은 알고리즘 기법 11편 「비트마스킹: 정수 하나로 집합 다루기」처럼 비트로 담는다. 상태는 RC·2ᴷ개다.
```python
# 앞 코드에 이어서
def step(grid, r, c, k):                 # 한 번 움직인 뒤의 상태들
    for nr, nc in nbrs(grid, r, c):
        ch = grid[nr][nc]
        if ch == "#" or ch in "AB" and not k >> "AB".index(ch) & 1:
            continue                     # 벽, 또는 열쇠 없는 문
        yield nr, nc, k | 1 << "ab".index(ch) if ch in "ab" else k

def key_bfs(grid):                       # 상태 = (행, 열, 열쇠 비트)
    dist = {(0, 0, 0): 0}                # 시작은 왼쪽 위
    q = deque(dist)
    while q:
        s = q.popleft()
        if grid[s[0]][s[1]] == "E":
            return dist[s]
        for nx in step(grid, *s):
            if nx not in dist:
                dist[nx] = dist[s] + 1
                q.append(nx)
    return -1

def slow(grid):                          # t번 움직인 뒤 가능한 상태 집합
    now = {(0, 0, 0)}
    for t in range(4 * len(grid) * len(grid[0]) + 1):
        if any(grid[r][c] == "E" for r, c, _ in now):
            return t
        now = {nx for s in now for nx in step(grid, *s)}
    return -1

print("최소 이동:", key_bfs(["..A.b",
                            ".####",
                            "a.B.E"]))
rng, ok = random.Random(3), 0
for _ in range(500):
    R, C = rng.randint(3, 5), rng.randint(3, 5)
    cells = rng.choices("..#AB", k=R * C)
    cells[0] = "."
    for i, ch in zip(rng.sample(range(1, R * C), 3), "Eab"):
        cells[i] = ch
    g = [cells[r * C:(r + 1) * C] for r in range(R)]
    ok += key_bfs(g) == slow(g)
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
최소 이동: 18
무작위 500개 비교: 모두 일치
```
a를 줍고(2번) 돌아와 문 A를 지나 b를 줍고(8번), 다시 돌아와 문 B를 지나야 해서 18번이다. 왼쪽 위 칸을 열쇠 없이, a만, a와 b를 들고 세 번 지나는데, 칸만 방문 표시했다면 두 번째부터 막혀 답을 못 찾는다. 느린 답은 방문 기록 없이 "t번 움직인 뒤 있을 수 있는 상태 전체"를 정의대로 한 걸음씩 굴린다. (칸, 방향), (칸, 남은 부수기 횟수), 퍼즐 판 배치도 같은 방식이다. 비용이 상태 수에 비례하므로 다음 이동을 정하는 데 필요한 정보만 상태에 넣는다.

## 양방향 BFS
시작점과 도착점이 하나씩인 무방향 그래프라면 양쪽에서 한 층씩 넓히다 만나면 멈춘다. 분기 수 b, 거리 d일 때 한쪽 BFS는 bᵈ개쯤, 양방향은 2·b^(d/2)개쯤 본다. 층 단위로 넓혀야 한다. 만나기 직전까지 두 반경의 합보다 짧은 경로가 없었으므로 처음 만난 거리가 최단이다.
```python
from collections import deque
import random

def bfs(adj, s, t):                      # (거리, 본 정점 수)
    dist, q = {s: 0}, deque([s])
    while q:
        u = q.popleft()
        if u == t:
            return dist[u], len(dist)
        for v in adj[u]:
            if v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)
    return -1, len(dist)

def bibfs(adj, s, t):
    if s == t:
        return 0, 1
    da, db, fa, fb = {s: 0}, {t: 0}, [s], [t]
    while fa and fb:
        if len(fa) > len(fb):            # 작은 쪽 경계를 한 층 넓힌다
            da, db, fa, fb = db, da, fb, fa
        nxt = []
        for u in fa:
            for v in adj[u]:
                if v in db:              # 반대쪽과 만났다
                    return da[u] + 1 + db[v], len(da) + len(db)
                if v not in da:
                    da[v] = da[u] + 1
                    nxt.append(v)
        fa = nxt
    return -1, len(da) + len(db)

def rand_graph(rng, n, m):               # 무방향
    adj = [[] for _ in range(n)]
    for _ in range(m):
        u, v = rng.randrange(n), rng.randrange(n)
        adj[u].append(v)
        adj[v].append(u)
    return adj

rng = random.Random(4)
big = rand_graph(rng, 200_000, 300_000)  # 평균 차수 3
print("한쪽:", bfs(big, 0, 1), "양방향:", bibfs(big, 0, 1))
ok = 0
for _ in range(500):
    n = rng.randint(1, 12)
    g = rand_graph(rng, n, rng.randint(0, 2 * n))
    s, t = rng.randrange(n), rng.randrange(n)
    ok += bfs(g, s, t)[0] == bibfs(g, s, t)[0]
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
```
```text
한쪽: (11, 160368) 양방향: (11, 416)
무작위 500개 비교: 모두 일치
```
거리 11인 두 정점을 찾는 데 한쪽 BFS는 16만 개, 양방향은 416개를 봤다. 같은 발상이 알고리즘 기법 12편 「중간에서 만나기: 지수를 절반으로 줄이는 기법」이다.

## 복잡도
| 방법 | 시간 |
|---|---|
| 시작점마다 BFS | O(K(V + E)) |
| 다중 시작점 BFS | O(V + E) |
| 0-1 BFS | O(V + E) |
| 상태 공간 BFS | O(상태 수 × 이동 종류) |

0-1 BFS의 정점은 d + 1로 들어갔다가 d로 한 번 더 줄 수 있을 뿐이라 많아야 두 번 들어간다. 공간은 모두 O(V)(상태 공간은 상태 수)다.

## 어디에 쓰이나
- 게임 자원 관리 11편 「경로 탐색 아끼기: `A*`, 계층적 탐색, 플로우 필드」: 목표에서 BFS를 한 번 돌린 거리 지도가 플로우 필드이고, 유닛들은 거리가 줄어드는 이웃으로만 움직인다.
- AI 기초 2편 「강화학습: 보상으로 배우는 머신러닝」: 다음 상태가 지금 상태와 행동에만 달려 있다는 마르코프 가정이 이 글의 상태 설계 원칙이다. 열쇠를 빼면 칸만으로 다음 이동이 정해지지 않는다.
- 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: 0-1 BFS는 힙을 덱으로 바꾼 다익스트라이고, 가중치가 일반적이면 2편으로 넘어간다.

## 정리
- BFS의 핵심 불변식은 큐 안의 거리가 줄지 않는다는 것이고, 이 글의 기법은 모두 이를 지키며 그래프를 바꾼다.
- 다중 시작점 BFS는 가상의 시작점에서 하는 BFS 한 번이다.
- 0-1 BFS는 비용 0이면 덱 앞, 1이면 뒤에 넣고, 방문 표시가 아니라 거리 비교로 갱신한다.
- 상태 공간 BFS는 다음 이동을 바꾸는 정보를 정점에 담고, 양방향 BFS는 지수를 절반으로 줄인다.

## 더 알아보기
- 다음 글: 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」

## 시리즈 안내
1. **BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색** ← 지금 읽는 글
2. 다익스트라 알고리즘: 음수 없는 최단 경로
3. 벨만-포드: 음수 간선과 음수 사이클
4. 플로이드-워셜: 모든 쌍 최단 경로
5. 최소 신장 트리: 크루스칼과 프림
6. 강한 연결 요소: 타잔과 코사라주
7. 2-SAT: 논리식을 그래프로 풀기
8. 단절점과 단절선: 끊으면 갈라지는 곳 찾기
9. 오일러 경로: 모든 간선을 한 번씩 지나기
10. 네트워크 플로우: 포드-풀커슨과 에드몬즈-카프
11. 디닉 알고리즘과 최대 유량 최소 컷 정리
12. 이분 매칭: 증가 경로와 쾨니그 정리
13. 최소 비용 최대 유량: 유량에 가격 붙이기
14. 플로우로 모델링하기: 정점 분할, 프로젝트 선택, 하한 있는 유량
