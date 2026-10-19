# [레벨 디자인과 콘텐츠 제공 3/16] 레벨을 그래프로 보기: 임계 경로, 루프, 되돌아가기

> **한 줄 요약** — 방을 정점, 통로를 간선으로 보면 임계 경로와 필수 방은 최단 거리와 단절점으로, 되돌아가기는 이미 본 방을 다시 지나는 걸음으로 셀 수 있고, 지름길 하나의 효과는 BFS를 다시 돌리지 않고 거리 식 한 줄로 평가할 수 있다.

## 이 글에서 다루는 것
- 레벨 그래프: 방은 정점, 통로는 간선, 일방통행은 방향 간선
- 임계 경로, 선택 경로, 반드시 지나는 방
- 지름길이 되돌아가기를 줄이는 효과를 세고 BFS 다시 계산과 대조하기
- 단절점과 돌아올 수 없는 길을 찾고 무차별 계산과 비교하기

## 문제: 방은 같아도 흐름은 다르다
같은 방 열 개라도 한 줄로 이으면 복도이고, 허브에서 가지를 뻗으면 별 모양이며, 고리로 이으면 돌아다니는 공간이 된다. 플레이어가 겪는 것은 방의 생김새보다 방을 지나는 순서다. 지도 그림만 보고 판단하면 "열쇠를 얻고 나면 방 여섯 개를 되짚어 와야 한다" 같은 문제를 놓친다. 그래서 방을 점, 통로를 선으로 그린 **레벨 그래프**(level graph)로 흐름을 본다.

연결 구조로 자주 거론되는 예가 다크 소울(프롬소프트웨어, 2011)이다. 공략 위키와 분석 글들은 허브인 파이어링크 슈라인(Firelink Shrine)에서 뻗은 지역들이 나중에 여는 지름길로 다시 허브에 이어진다는 점을 짚는다. 언데드 패리시(Undead Parish)의 엘리베이터를 타면 허브로 바로 내려오고, 처음에는 잠긴 문을 반대편에서 열어 길이 이어지며, 순간 이동은 게임 후반에야 생긴다. 걸어서 다녀야 하니 연결 구조가 곧 되돌아가기의 양을 정한다.

## 레벨 그래프와 임계 경로
**임계 경로**(critical path)는 시작에서 목표까지 진행하려면 밟아야 하는 줄기이고, **선택 경로**(optional path)는 보상이나 이야기를 위해 갈라지는 가지다. **되돌아가기**(backtracking)는 이미 본 방을 다시 지나는 걸음이다. 아래 레벨에서 S는 입구이자 허브(세이브 지점), X와 Y는 보상이 있는 옆방, K는 열쇠가 있는 방, G는 그 열쇠로 여는 보스 문이다.
```text
     X         Y
     │         │
S ── A ── B ── C ── D
│                   │
G              K ── E
```
플레이어는 X와 Y를 들르고 K에서 열쇠를 얻어 G로 간다. 구간마다 BFS 최단 경로로 걷는다고 보고(BFS는 그래프 알고리즘 1편 참조), 걸음 수와 그중 이미 본 방을 다시 밟은 수를 센다.
```python
from collections import deque
from itertools import combinations
import random

EDGES = "SA AX AB BC CY CD DE EK SG"     # 방 사이 통로(양방향)

def graph(edges, extra=()):
    adj = {}
    for u, v in [tuple(e) for e in edges.split()] + list(extra):
        adj.setdefault(u, set()).add(v)
        adj.setdefault(v, set()).add(u)
    return adj

def bfs(adj, s):                         # 거리와 부모
    dist, par, q = {s: 0}, {s: None}, deque([s])
    while q:
        u = q.popleft()
        for v in sorted(adj[u]):
            if v not in dist:
                dist[v], par[v] = dist[u] + 1, u
                q.append(v)
    return dist, par

def walk(adj, route):                    # 목표를 차례로, 최단 경로로 걷기
    seen, steps, back = {route[0]}, 0, 0
    for s, t in zip(route, route[1:]):
        _, par = bfs(adj, s)
        path = []
        while t != s:
            path.append(t)
            t = par[t]
        for room in reversed(path):
            steps += 1
            back += room in seen         # 이미 본 방을 다시 지남
            seen.add(room)
    return steps, back

ROUTE = "SXYKG"                          # 옆방 X, Y와 열쇠 K를 거쳐 문 G로
adj = graph(EDGES)
print("걸음, 되돌아가기:", walk(adj, ROUTE))
```
```text
걸음, 되돌아가기: (17, 8)
```
17걸음 중 8걸음이 되돌아가기다. 열쇠는 맨 끝에 있고 문은 허브 옆에 있어서, K에서 G까지 7걸음 중 6걸음을 왔던 길로 되짚는다. 이 레벨은 고리가 없는 트리라서 어느 가지든 들어간 길로 나와야 한다.

## 지름길 하나의 값
통로 a–b를 하나 더하면 새 최단 경로는 그 통로를 많아야 한 번 지난다. 그래서 새 거리는 `d′(s,t) = min(d(s,t), d(s,a) + 1 + d(b,t), d(s,b) + 1 + d(a,t))`이고, 모든 쌍 거리를 한 번 구해 두면 후보마다 BFS를 다시 돌릴 필요가 없다. 앞 코드에 이어서, 아직 이어지지 않은 방 쌍 36개를 모두 평가하고 실제로 통로를 넣어 다시 걸은 결과와 비교한다. 무작위 그래프 300개에서도 모든 쌍의 거리를 대조한다.
```python
# 앞 코드에 이어서
D = {u: bfs(adj, u)[0] for u in adj}     # 모든 쌍 거리(방마다 BFS)

def with_edge(D, s, t, a, b):            # 통로 a–b를 더한 뒤 s→t 거리
    return min(D[s][t], D[s][a] + 1 + D[b][t], D[s][b] + 1 + D[a][t])

def route_len(D, route, a, b):
    return sum(with_edge(D, s, t, a, b) for s, t in zip(route, route[1:]))

cands = [(a, b) for a, b in combinations(sorted(adj), 2) if b not in adj[a]]
same = True
for r in (ROUTE, "SXYKSKG"):             # 둘째: K에서 한 번 죽고 S에서 다시
    same &= all(route_len(D, r, a, b) == walk(graph(EDGES, [(a, b)]), r)[0]
                for a, b in cands)
    print(r, sorted((route_len(D, r, a, b), a + b) for a, b in cands)[:3])
print(f"후보 {len(cands)}개, 공식 = 다시 걸은 걸음: {same}")
print("KS를 열면 (걸음, 되돌아가기):", walk(graph(EDGES, ["KS"]), ROUTE))

rng, ok = random.Random(3), 0
for _ in range(300):                     # 무작위 연결 그래프에 통로 하나 추가
    names = [chr(97 + i) for i in range(rng.randint(3, 12))]
    es = [(v, rng.choice(names[:i])) for i, v in enumerate(names) if i]
    es += [tuple(rng.sample(names, 2)) for _ in range(rng.randint(0, 6))]
    a, b = rng.sample(names, 2)
    D0 = {u: bfs(graph("", es), u)[0] for u in names}
    g1 = graph("", es + [(a, b)])
    ok += all(bfs(g1, s)[0][t] == with_edge(D0, s, t, a, b)
              for s in names for t in names)
print("무작위 300개 그래프, 공식 = BFS 다시 계산:", ok == 300)
```
```text
SXYKG [(11, 'GK'), (12, 'EG'), (12, 'KS')]
SXYKSKG [(14, 'KS'), (15, 'GK'), (17, 'AK')]
후보 36개, 공식 = 다시 걸은 걸음: True
KS를 열면 (걸음, 되돌아가기): (12, 3)
무작위 300개 그래프, 공식 = BFS 다시 계산: True
```
한 번 지나가는 경로만 세면 열쇠 방과 보스 문을 잇는 GK가 가장 좋다. 그런데 K에서 한 번 죽고 허브 S에서 다시 시작하는 경우를 넣으면 순위가 바뀌어 KS가 1등이 된다. 허브로 돌아오는 지름길은 죽음과 재도전, 보급처럼 허브를 오가는 모든 반복에서 이득을 주기 때문이다. 모델의 답은 무엇을 세느냐에 달려 있고, 그 선택은 디자이너의 몫이다. KS를 열면 걸음은 17에서 12로, 되돌아가기는 8에서 3으로 준다. 다크 소울처럼 지름길을 먼 쪽에서만 열게 하면 첫 여정은 길게(탐험), 돌아오는 길은 짧게(반복) 만들 수 있고, 그 순간 레벨에 S–A–B–C–D–E–K–S 고리가 생긴다.

## 단절점: 고리가 없앤 병목
지우면 레벨이 둘로 갈라지는 방이 **단절점**(articulation point)이다. 단절점은 한쪽에서 다른 쪽으로 가려면 반드시 지나는 병목이라 보스 방, 세이브 지점, 이야기 장면을 두기 좋고, 돌아올 수 없는 지점이 생길 수 있는 곳이기도 하다. 앞 코드에 이어서, 타잔의 low 값(그래프 알고리즘 8편)으로 구한 단절점을 방을 하나씩 지워 보는 무차별 계산과 비교하고, S에서 K로 갈 때 반드시 지나는 방도 센다.
```python
# 앞 코드에 이어서
def cut_brute(adj):                      # 방을 하나씩 지우고 연결 요소 세기
    def comps(skip):
        seen, n = {skip}, 0
        for s in adj:
            if s not in seen:
                n, stack = n + 1, [s]
                seen.add(s)
                while stack:
                    for v in adj[stack.pop()] - seen:
                        seen.add(v)
                        stack.append(v)
        return n
    return {v for v in adj if comps(v) > comps(None)}

def cut_tarjan(adj):                     # 그래프 알고리즘 8편의 low 값
    disc, low, cut = {}, {}, set()
    def dfs(u, parent):
        disc[u] = low[u] = len(disc)
        kids = 0
        for v in adj[u]:
            if v not in disc:
                kids += 1
                dfs(v, u)
                low[u] = min(low[u], low[v])
                if parent and low[v] >= disc[u]:
                    cut.add(u)
            elif v != parent:
                low[u] = min(low[u], disc[v])
        if not parent and kids > 1:
            cut.add(u)
    for s in adj:
        if s not in disc:
            dfs(s, None)
    return cut

def must_pass(adj, s, t):                # 지우면 s에서 t로 못 가는 방
    return sorted(v for v in adj if v not in (s, t) and t not in
                  bfs({u: adj[u] - {v} for u in adj if u != v}, s)[0])

for name, g in (("원래", adj), ("KS 추가", graph(EDGES, ["KS"]))):
    print(name, "단절점:", "".join(sorted(cut_tarjan(g))),
          "/ S→K 필수 방:", "".join(must_pass(g, "S", "K")) or "없음")

rng, ok = random.Random(4), 0
for _ in range(300):
    names = [chr(97 + i) for i in range(rng.randint(1, 10))]
    es = [tuple(rng.sample(names, 2)) for _ in range(rng.randint(0, 12))
          if len(names) > 1]
    g = graph("", es)
    ok += cut_brute(g) == cut_tarjan(g)
print("무작위 300개: 타잔 = 하나씩 지우기:", ok == 300)
```
```text
원래 단절점: ABCDES / S→K 필수 방: ABCDE
KS 추가 단절점: ACS / S→K 필수 방: 없음
무작위 300개: 타잔 = 하나씩 지우기: True
```
원래 레벨은 트리라서 끝방을 뺀 모든 방이 단절점이고, K까지 A·B·C·D·E를 모두 지나야 하는 외길이다. KS 하나로 B, D, E가 단절점에서 빠지고 K로 가는 필수 방이 사라진다. K까지 가는 길이 두 갈래가 되어 플레이어에게 선택이 생긴 것이다. 거꾸로 어떤 방(예를 들어 이야기 장면)을 꼭 지나게 하려면 그 방이 시작과 목표 사이의 필수 방으로 남는지 확인해야 한다.

## 돌아올 수 없는 길
뛰어내리는 낭떠러지나 등 뒤에서 닫히는 문은 한쪽으로만 지나는 방향 간선이다. 일방통행 u→v를 지난 뒤 v에서 u로 돌아갈 길이 없으면 그곳이 돌아올 수 없는 지점이다(방향 그래프 전체 구조는 그래프 알고리즘 6편의 강한 연결 요소로 본다). 앞 코드에 이어서, 통로 BC를 B에서 C로 뛰어내리는 길로 바꿔 본다.
```python
# 앞 코드에 이어서
def no_return(two_way, one_way):         # 일방통행 u→v 뒤에 u로 돌아올 수 있나
    adj = graph(two_way)
    for u, v in one_way:
        adj.setdefault(u, set()).add(v)
        adj.setdefault(v, set())
    return [u + "→" + v for u, v in one_way if u not in bfs(adj, v)[0]]

DROP = [("B", "C")]                      # 통로 BC를 B에서 C로 뛰어내리는 길로
print("돌아올 수 없는 길:", no_return(EDGES.replace("BC", ""), DROP))
print("KS를 연 뒤:", no_return(EDGES.replace("BC", "") + " KS", DROP))
```
```text
돌아올 수 없는 길: ['B→C']
KS를 연 뒤: []
```
지름길이 없으면 B→C는 돌아올 수 없는 길이고, 보스 문 G가 허브 옆에 있으니 뛰어내리는 순간 클리어할 수 없게 된다. 4편에서 다룰 막힘이다. 돌아올 수 없는 길은 긴장과 장의 전환을 만드는 장치로 쓸 수 있지만, 의도한 것이어야 하고 그 너머에 목표가 있어야 한다. KS를 열면 낙하가 고리의 일부가 되어 다시 돌아올 수 있다. 반대편에서 여는 문과 일방통행 낙하는 고리와 함께 쓸 때 앞으로 끌어당기면서도 가두지 않는다.

## 모델이 말해 주지 않는 것
- 방마다 크기와 위험이 다르다. 걸음 대신 시간이나 위험을 간선 가중치로 두면 다익스트라(그래프 알고리즘 2편)로 같은 분석을 한다.
- 되돌아가기가 늘 나쁘지는 않다. 새 능력을 얻고 돌아가면 같은 방이 다르게 보이고(4편), 익숙한 길을 빠르게 지나는 것도 즐거움이다. 문제는 새것이 없는 되짚기다.
- 플레이어는 최단 경로로 걷지 않는다. 이 모델의 걸음은 하한이고, 실제 동선은 텔레메트리(15편)와 플레이테스트로 본다.

## 어디에 쓰이나
- 그래프 알고리즘 8편 「단절점과 단절선: 끊으면 갈라지는 곳 찾기」: DFS 한 번의 low 값으로 레벨의 병목과 돌아올 수 없는 지점 후보를 모두 찾는다.
- 심화 알고리즘 11편 「지배자 트리: 반드시 거쳐 가는 정점 찾기」: 일방통행이 섞인 레벨에서 "S에서 G로 가려면 반드시 지나는 방"은 지배자 트리로 한 번에 구한다.
- 4편 「열쇠와 자물쇠: 게이팅과 막힘 없는 진행 구조」: 간선에 자물쇠를 달면 그래프에 "가진 열쇠"라는 상태가 붙는다.

## 정리
- 레벨 그래프는 방을 정점, 통로를 간선, 일방통행을 방향 간선으로 두고 흐름을 숫자로 본다.
- 트리 모양 레벨은 들어간 길로 나와야 해서 되돌아가기가 많다. 예제에서는 17걸음 중 8걸음이었다.
- 통로 하나를 더한 거리는 `min(d(s,t), d(s,a) + 1 + d(b,t), d(s,b) + 1 + d(a,t))`로 구하고, 다시 걸은 결과와 무작위 300개 그래프에서 일치했다.
- 고리는 단절점과 필수 방을 없애 선택을 만들고, 일방통행 길을 안전하게 만든다. 단절점은 타잔과 하나씩 지우기가 300개 모두 일치했다.

## 더 알아보기
- 이전 글: 2편 「동선과 시선 유도: 랜드마크, 시야, 공간의 문법」
- 다음 글: 4편 「열쇠와 자물쇠: 게이팅과 막힘 없는 진행 구조」
