# [심화 알고리즘 5/14] 오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드

> **한 줄 요약** — 간선 추가·삭제와 연결 질의를 미리 다 알면, 간선마다 살아 있는 시간 구간을 시간 축 세그먼트 트리의 노드 O(log q)개에 걸어 두고 DFS로 내려가며 유니온 파인드에 합치고 올라오며 되돌리는 것만으로, 삭제 없는 유니온 파인드로 전체를 O(q log q log n)에 푼다.

## 이 글에서 다루는 것
- 유니온 파인드가 삭제를 못 하는 이유와 오프라인으로 돌아가기
- 간선의 생존 구간을 시간 축 세그먼트 트리에 걸기
- 경로 압축 없는 롤백 유니온 파인드와 DFS 되돌리기
- 확장: 각 시점의 이분 그래프 판정(색 차이 저장)
- 매 질의 BFS와의 무작위 대조와 연산 수

## 예제 문제: 간선이 생기고 사라지는 그래프
정점 n개, 처음에는 간선이 없다. 연산 q개가 들어온다: 간선 u–v 추가, 간선 u–v 삭제, "지금 u와 v가 연결되어 있나". 추가만 있다면 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」의 유니온 파인드로 끝이다. 문제는 삭제다. 유니온 파인드는 두 집합을 합치기만 하고 다시 쪼개는 방법이 없다. 질의마다 BFS를 돌리면 O(n + m)씩, 전체 O(q(n + m))이다.

삭제까지 온라인으로 처리하는 구조는 있다. 홈(Holm)·드 리히텐베르크(de Lichtenberg)·토룹(Thorup)의 2001년 알고리즘은 연산당 분할 상환 O(log² n)이지만 구현이 매우 복잡하다. 연산 목록을 미리 다 받을 수 있다면(오프라인) 훨씬 단순한 길이 있다.

## 아이디어 1: 간선마다 살아 있는 시간 구간
시각 t = 0, 1, …, q − 1을 연산 번호로 두면, 간선 하나는 추가된 시각부터 삭제된 시각 직전까지 [s, e) 동안 살아 있다(끝까지 남으면 e = q). 시각 t의 그래프는 "구간이 t를 덮는 간선들"이다. 이 구간을 시간 축 위 세그먼트 트리에 고급 자료 구조 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」의 구간 갱신처럼 건다. 구간은 그것을 완전히 덮는 노드 O(log q)개(층마다 많아야 2개)로 쪼개진다.
```text
[         0~7          ]
[   0~3    ][   4~7    ]
[0~1 ][2~3 ][4~5 ][6~7 ]
[0][1][2][3][4][5][6][7]
간선이 [1, 6) 동안 살아 있으면
→ 노드 [1], [2~3], [4~5]에 건다
```
그러면 잎 t에서 뿌리까지 경로 위 노드들에 걸린 간선이 정확히 시각 t에 살아 있는 간선이다. 덮는 노드는 반드시 t의 조상이고, 조상에 걸린 간선의 구간은 t를 덮기 때문이다.

## 아이디어 2: 내려가며 합치고 올라오며 되돌리기
세그먼트 트리를 DFS로 돈다. 노드에 들어가면 걸린 간선을 모두 유니온 파인드에 합치고, 잎에 닿으면 그 시각의 질의에 답하고, 노드를 나올 때 그 노드에서 합친 것을 되돌린다. 그러면 잎 t에 있을 때 유니온 파인드에는 뿌리~t 경로의 간선, 곧 시각 t의 그래프만 들어 있다. 삭제가 "가장 최근 합치기 되돌리기"로 바뀐 것이다. 되돌리기는 스택 순서(마지막에 한 것부터)라서 기록을 스택에 쌓아 두면 된다.

되돌리기 때문에 **경로 압축을 쓰지 않는다**. 경로 압축은 find 한 번에 칸을 여러 개 바꾸고, 그 분할 상환 보장은 되돌리기와 섞이면 깨진다. 대신 **크기 기준 합치기**만 쓰면 트리 깊이가 log₂ n 이하라 find가 최악 O(log n)이고, 합치기 한 번이 바꾸는 칸은 부모 하나와 크기 하나뿐이라 되돌리기가 O(1)이다.

## 확장: 각 시점의 이분 그래프 판정
고급 자료 구조 2편의 가중치 유니온 파인드처럼 정점마다 "부모와 색이 다른가"를 비트로 저장한다. 간선 a–b를 합칠 때 두 뿌리가 다르면 a와 b의 색이 다르도록 붙이고, 이미 같은 집합인데 a와 b의 색이 같으면 홀수 사이클이 생긴 것이다. DFS로 내려갈수록 간선은 늘기만 하므로, 한 노드에서 홀수 사이클이 생기면 그 아래 모든 잎(시각)은 이분 그래프가 아니다. 이 사실을 인자로 넘겨 내려보낸다.

## 구현
질의 결과는 (연결 여부, 그 시각 그래프 전체가 이분 그래프인지)의 쌍이다.
```python
import random, math
from collections import deque

class RollbackDSU:                  # 경로 압축 없음, 크기 기준 합치기
    def __init__(self, n):
        self.p, self.sz, self.c = list(range(n)), [1] * n, [0] * n
        self.hist = []              # 합칠 때 아래로 붙은 뿌리

    def find(self, x):              # (뿌리, 뿌리와의 색 차이)
        col = 0
        while self.p[x] != x:
            col ^= self.c[x]; x = self.p[x]
        return x, col

    def union(self, a, b):          # 간선 a–b. 홀수 사이클이면 True
        (ra, ca), (rb, cb) = self.find(a), self.find(b)
        if ra == rb: return ca == cb
        if self.sz[ra] < self.sz[rb]: ra, rb = rb, ra
        self.p[rb], self.c[rb] = ra, ca ^ cb ^ 1    # a, b 색이 다르게
        self.sz[ra] += self.sz[rb]
        self.hist.append(rb)
        return False

    def rollback(self, mark):       # 합치기를 mark개만 남기고 되돌리기
        while len(self.hist) > mark:
            rb = self.hist.pop(); ra = self.p[rb]
            self.sz[ra] -= self.sz[rb]; self.p[rb], self.c[rb] = rb, 0

def offline(n, ops):                # ops[t] = ("+"/"-"/"?", u, v)
    q = len(ops)
    seg, start, ans = [[] for _ in range(4 * q)], {}, {}
    def put(k, lo, hi, l, r, e):    # [l, r)를 덮는 노드들에 e를 건다
        if r <= lo or hi <= l: return
        if l <= lo and hi <= r: seg[k].append(e); return
        mid = (lo + hi) // 2
        put(2 * k, lo, mid, l, r, e); put(2 * k + 1, mid, hi, l, r, e)
    for t, (op, u, v) in enumerate(ops):
        e = (min(u, v), max(u, v))
        if op == "+": start[e] = t
        elif op == "-": put(1, 0, q, start.pop(e), t, e)
    for e, s in start.items(): put(1, 0, q, s, q, e)  # 끝까지 산 간선
    d = RollbackDSU(n)
    def dfs(k, lo, hi, odd):
        mark = len(d.hist)
        for u, v in seg[k]: odd |= d.union(u, v)       # 내려가며 합치기
        if hi - lo == 1:
            op, u, v = ops[lo]
            if op == "?": ans[lo] = (d.find(u)[0] == d.find(v)[0], not odd)
        else:
            mid = (lo + hi) // 2
            dfs(2 * k, lo, mid, odd); dfs(2 * k + 1, mid, hi, odd)
        d.rollback(mark)                                # 올라오며 되돌리기
    dfs(1, 0, q, False)
    return [ans[t] for t in sorted(ans)], sum(map(len, seg))

ops = [("+", 0, 1), ("+", 1, 2), ("?", 0, 2), ("+", 2, 0), ("?", 0, 2),
       ("-", 1, 2), ("?", 1, 2), ("-", 0, 1), ("?", 0, 1)]
print(offline(3, ops)[0])
```
```text
[(True, True), (True, False), (True, True), (False, True)]
```
경로 0–1–2일 때는 연결·이분, 간선 2–0이 더해져 삼각형이 되자 이분이 깨지고, 1–2를 지우자 다시 이분, 0–1까지 지우자 0과 1이 끊겼다.

## 무작위 대조 검사
앞 코드에 이어서, 정점 7개 이하에서 있는 간선만 지우고 없는 간선만 넣는 무작위 연산을 만들고, 질의마다 현재 그래프 전체를 BFS로 2-색칠하는 느린 방법과 비교한다.
```python
def brute(n, ops):                  # 질의마다 현재 그래프를 BFS로 2-색칠
    edges, out = set(), []
    for op, u, v in ops:
        e = (min(u, v), max(u, v))
        if op == "+": edges.add(e)
        elif op == "-": edges.remove(e)
        else:
            adj = [[] for _ in range(n)]
            for a, b in edges: adj[a].append(b); adj[b].append(a)
            comp, col, bip = [-1] * n, [0] * n, True
            for s in range(n):
                if comp[s] >= 0: continue
                comp[s], dq = s, deque([s])
                while dq:
                    x = dq.popleft()
                    for y in adj[x]:
                        if comp[y] < 0:
                            comp[y], col[y] = s, col[x] ^ 1; dq.append(y)
                        elif col[y] == col[x]: bip = False
            out.append((comp[u] == comp[v], bip))
    return out

def random_ops(rng, n, q):
    ops, alive = [], set()
    for _ in range(q):
        u, v = rng.sample(range(n), 2)
        e, r = (min(u, v), max(u, v)), rng.random()
        if r < 0.4 and e not in alive: ops.append(("+", u, v)); alive.add(e)
        elif r < 0.7 and alive:
            e = rng.choice(sorted(alive))
            alive.remove(e); ops.append(("-", *e))
        else: ops.append(("?", u, v))
    return ops

rng, ok, asked = random.Random(5), 0, 0
for _ in range(500):
    n = rng.randint(2, 7)
    ops = random_ops(rng, n, rng.randint(1, 40))
    got = offline(n, ops)[0]
    ok += got == brute(n, ops); asked += len(got)
print(f"무작위 500개(질의 {asked}개) 비교: {ok}개 일치")
```
```text
무작위 500개(질의 4280개) 비교: 500개 일치
```

## 연산 수 세기
앞 코드에 이어서, 정점 1,000개에 연산 2만 개를 만들어 간선이 세그먼트 트리 노드에 몇 번 걸리는지 세고, 매 질의 BFS가 보는 정점·간선 수와 견준다.
```python
n, q = 1000, 20000
ops = random_ops(random.Random(1), n, q)
placed = offline(n, ops)[1]
alive = m = bfs = 0
for op, _, _ in ops:
    m += op == "+"; alive += (op == "+") - (op == "-")
    if op == "?": bfs += n + alive  # BFS 한 번이 보는 정점 + 간선
print(f"간선 {m}, 노드에 건 횟수 {placed}, 간선당 {placed / m:.1f}")
print(f"상한 2·log₂ q = {2 * math.log2(q):.1f}, find 깊이 ≤ {math.log2(n):.1f}")
print("매 질의 BFS라면 방문", bfs)
```
```text
간선 8115, 노드에 건 횟수 72575, 간선당 8.9
상한 2·log₂ q = 28.6, find 깊이 ≤ 10.0
매 질의 BFS라면 방문 12405843
```
간선 하나가 평균 8.9개 노드에 걸렸고, 각각이 합치기 한 번(find 두 번, 깊이 10 이하)과 되돌리기 한 번이라 많아야 150만 단계 안팎이다. BFS는 1,240만 번을 방문한다. n과 q가 커질수록 차이는 더 벌어진다.

## 자주 하는 실수와 변형
- 경로 압축을 켜 두면 되돌리기가 기록하지 않은 칸까지 바뀌어 답이 틀린다. 크기(또는 랭크) 기준 합치기만 쓴다.
- 같은 간선이 여러 번 추가·삭제되면 생존 구간이 여러 개다. 위 코드는 삭제 때마다 구간을 닫으므로 그대로 된다. 같은 간선이 동시에 두 개 있을 수 있다면 개수를 세어 0 ↔ 1이 바뀔 때만 구간을 연다.
- 루프 안에서 `odd`를 노드에서 되돌리지 않아도 되는 이유는 인자로 넘겼기 때문이다. 전역 변수로 두면 올라올 때 직접 복구해야 한다.
- 연결 요소 개수, 요소 크기 합 같은 값도 합치기·되돌리기 때 함께 갱신하면 각 시각마다 읽을 수 있다.
- 온라인이 꼭 필요하고 그래프가 늘 숲이면 2편의 링크-컷 트리로 된다. 일반 그래프의 오프라인 판정은 "삭제 시각이 늦은 간선을 우선하는 최대 신장 숲"을 링크-컷 트리로 유지하는 방법도 있다.

## 복잡도
| 방법 | 전체 시간 | 공간 |
|---|---|---|
| 매 질의 BFS | O(q(n + m)) | O(n + m) |
| 시간 축 분할 + 롤백 | O(q log q log n) | O(n + q log q) |
| 온라인 HDT(2001) | 분할 상환 O(q log² n) | O(n + m) |

- 간선마다 걸리는 노드가 2·log₂ q개 이하이고, 거기서 합치기 한 번이 find 때문에 O(log n), 되돌리기가 O(1)이다. 잎에서의 질의도 find 두 번이라 O(log n)이다.

## 어디에 쓰이나
- 4편 「병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기」: 둘 다 시간 축을 분할 정복하는 오프라인 기법이고, 삭제가 있으면 CDQ의 "왼쪽이 오른쪽에 주는 몫" 대신 되돌리기가 필요하다.
- 고급 자료 구조 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」: 구간을 노드 O(log n)개로 쪼개 거는 방식이 같고, 값 대신 간선을 건다.
- 2편 「링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의」: 숲이면 온라인으로 같은 질의를 처리한다. 오프라인이면 유니온 파인드만으로 일반 그래프까지 된다.

## 정리
- 유니온 파인드는 삭제를 못 하지만, 오프라인이면 삭제를 "가장 최근 합치기 되돌리기"로 바꿀 수 있다.
- 간선의 생존 구간을 시간 축 세그먼트 트리의 노드 O(log q)개에 걸고, DFS로 내려가며 합치고 올라오며 되돌린다.
- 되돌리기 때문에 경로 압축 없이 크기 기준 합치기만 써서 find가 O(log n)이고, 전체 O(q log q log n)이다.
- 색 차이 비트를 더하면 각 시각의 이분 그래프 판정도 같은 틀에서 된다. BFS 대조 500개가 모두 맞았다.

## 더 알아보기
- 이전 글: 4편 「병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기」
- 다음 글: 6편 「슬로프 트릭: 볼록 조각 선형 함수를 힙으로 다루기」
