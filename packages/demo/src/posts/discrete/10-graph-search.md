# [이산수학 10/12] 그래프 탐색: BFS, DFS, 위상 정렬

> **한 줄 요약** — 그래프 탐색은 시작점에서 갈 수 있는 정점을 빠짐없이 한 번씩 방문하는 일로, 큐를 쓰면 가까운 순서로 퍼지는 BFS, 스택(재귀)을 쓰면 깊이 파고드는 DFS가 되며, 이 둘로 최단 경로·순환 참조·설치 순서 문제를 푼다.

## 이 글에서 다루는 것
- 너비 우선 탐색(BFS): 큐와 최단 경로
- 깊이 우선 탐색(DFS): 재귀와 스택
- "방문 중" 상태로 사이클 찾기
- 위상 정렬: 칸 알고리즘

## 탐색의 기본 틀
그래프 탐색은 시작 정점에서 간선을 따라 도달할 수 있는 모든 정점을 방문한다. 사이클을 따라 영원히 돌지 않으려면 **방문 기록**이 필요하고, "다음에 방문할 후보"를 어떤 자료구조에 담느냐가 탐색의 성격을 정한다. 아래 그래프로 비교해 보자.
```text
A ─── B
│     │
│     D
│     │
C ─── E
```

## BFS와 DFS
**너비 우선 탐색**(BFS)은 후보를 **큐**(먼저 넣은 것을 먼저 꺼냄)에 담는다. 시작점의 이웃을 모두 방문한 뒤 그 이웃의 이웃으로 넘어가므로, 물결이 퍼지듯 거리 1, 거리 2, … 순서로 방문한다. **깊이 우선 탐색**(DFS)은 갈 수 있는 데까지 한 방향으로 깊이 들어갔다가 막히면 돌아와 다른 길을 찾는다. 재귀 호출로 쓰면 함수 호출 스택이 곧 후보 스택이다.
```python
from collections import deque

graph = {"A": ["B", "C"], "B": ["A", "D"], "C": ["A", "E"], "D": ["B", "E"], "E": ["C", "D"]}

def bfs(start):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        v = queue.popleft()               # 먼저 들어온 정점부터 꺼낸다
        for w in graph[v]:
            if w not in dist:
                dist[w] = dist[v] + 1
                queue.append(w)
    return dist

def dfs(v, seen):
    seen.append(v)
    for w in graph[v]:
        if w not in seen:
            dfs(w, seen)                  # 갈 수 있는 데까지 먼저 깊이 들어간다
    return seen

print("BFS", bfs("A"))
print("DFS", dfs("A", []))
```
```text
BFS {'A': 0, 'B': 1, 'C': 1, 'D': 2, 'E': 2}
DFS ['A', 'B', 'D', 'E', 'C']
```
BFS는 정점을 처음 발견할 때의 거리가 곧 **간선 수 기준 최단 거리**다. 거리 k인 정점을 모두 꺼낸 뒤에야 거리 k + 1인 정점을 꺼내기 때문이다. A에서 E까지는 A → C → E로 2다. 반면 DFS는 A → B → D → E 순서로 E에 먼저 도착했으므로, DFS가 찾은 경로는 최단이 아닐 수 있다. 두 탐색 모두 정점과 간선을 한 번씩만 살펴보므로 인접 리스트(8편)를 쓰면 시간이 V + E에 비례한다. 간선에 가중치가 있으면 BFS 대신 다익스트라 알고리즘 같은 방법이 필요하다.

## DFS로 사이클 찾기
방향 그래프에서 사이클을 찾으려면 정점에 세 가지 상태를 둔다. 아직 안 감, **방문 중**(이 정점에서 시작한 탐색이 아직 끝나지 않음), **완료**다. 탐색 도중 "방문 중"인 정점을 다시 만나면, 지금 걷고 있는 경로가 자기 자신으로 되돌아온 것이므로 사이클이다. "완료"인 정점을 만난 것은 이미 다 살펴본 곳에 다른 길로 도착한 것일 뿐이라 사이클이 아니다.
```python
imports = {"a.ts": ["b.ts"], "b.ts": ["c.ts"], "c.ts": ["a.ts"], "d.ts": ["a.ts"]}
VISITING, DONE = 1, 2                     # check-deps.mjs와 같은 상태 번호
state = {}

def visit(v, path):
    if state.get(v) == DONE:
        return
    if state.get(v) == VISITING:          # 아직 끝나지 않은 정점으로 돌아왔다 = 사이클
        print("순환:", " → ".join(path[path.index(v):] + [v]))
        return
    state[v] = VISITING
    for w in imports[v]:
        visit(w, path + [v])
    state[v] = DONE

for v in imports:
    visit(v, [])
```
```text
순환: a.ts → b.ts → c.ts → a.ts
```
`d.ts`도 `a.ts`를 import하지만, 그때 `a.ts`는 이미 "완료"라서 사이클로 잘못 보고되지 않는다. 방문 여부만 기록해서는 이 둘을 구별할 수 없다.

## 위상 정렬
"a가 b보다 먼저"라는 조건이 간선으로 주어진 DAG에서, 모든 간선이 앞에서 뒤로 향하도록 정점을 한 줄로 세우는 것을 **위상 정렬**이라고 한다. 5편의 말로 하면 부분 순서를 거스르지 않는 전순서 하나를 고르는 일이다. 패키지 설치 순서가 대표적인 예다. **칸 알고리즘**(Kahn's algorithm)은 이렇게 동작한다.
1. 아직 준비되지 않은 의존성이 0개인 정점을 큐에 넣는다.
2. 큐에서 하나를 꺼내 결과에 붙이고, 그 정점에 기대던 정점들의 남은 의존성 수를 1씩 줄인다. 0이 된 정점은 큐에 넣는다.
3. 큐가 빌 때까지 반복한다. 결과에 모든 정점이 들어가지 못했다면 사이클이 있는 것이다.

```python
from collections import deque

def topo_sort(deps):
    remaining = {v: len(ds) for v, ds in deps.items()}  # 아직 준비되지 않은 의존성 수
    users = {v: [] for v in deps}                       # v에 기대는 패키지들
    for v, ds in deps.items():
        for d in ds:
            users[d].append(v)
    queue = deque(v for v, n in remaining.items() if n == 0)
    order = []
    while queue:
        v = queue.popleft()
        order.append(v)
        for u in users[v]:
            remaining[u] -= 1
            if remaining[u] == 0:                       # 의존성이 모두 준비되었다
                queue.append(u)
    if len(order) < len(deps):
        raise ValueError("순환 의존성이 있다")
    return order

deps = {"server": ["api", "core", "web"], "demo": ["api", "core", "web"],
        "api": ["core"], "web": ["core"], "core": []}
print(topo_sort(deps))
try:
    topo_sort({"a": ["b"], "b": ["c"], "c": ["a"]})
except ValueError as e:
    print(e)
```
```text
['core', 'api', 'web', 'server', 'demo']
순환 의존성이 있다
```
8편의 패키지 그래프를 넣으면 core가 맨 앞에 온다. api와 web은 서로 비교할 수 없는 사이라 순서를 바꿔도 올바른 답이므로, 위상 정렬의 답은 보통 여러 개다. 사이클이 있으면 그 위의 정점들은 의존성이 0개가 되지 못해 남으므로, 칸 알고리즘은 사이클 검사도 함께 해 준다.

## 어디에 쓰이나
- 이 플랫폼의 `scripts/check-deps.mjs`: 패키지 안 파일들의 import 그래프를 위 코드와 같은 "1 = 방문 중, 2 = 완료" 상태의 DFS로 탐색해, 방문 중인 파일로 되돌아오면 순환 참조로 보고한다.
- 언어 기초 7편 「자바스크립트: 브라우저에서 npm까지」: 의존성이 먼저 준비되어야 하는 패키지 설치·빌드 순서는 위상 정렬 문제이고, 이벤트 루프의 작업 큐는 BFS의 큐처럼 먼저 들어온 작업을 먼저 꺼낸다.
- 언어 기초 8편 「자바와 JVM: 한 번 작성하면 어디서나 실행」: GC가 "더 이상 참조되지 않는 객체"를 찾는 것은 살아 있는 변수들에서 출발해 참조 간선을 따라 도달 가능한 객체에 표시하는 그래프 탐색이며, 표시되지 않은 객체가 회수 대상이다.

## 정리
- 그래프 탐색은 방문 기록과 후보 자료구조로 이루어지며, 큐를 쓰면 BFS, 스택(재귀)을 쓰면 DFS다.
- BFS는 간선 수 기준 최단 거리를 구하고, 두 탐색 모두 인접 리스트에서 V + E에 비례하는 시간이 든다.
- 방향 그래프의 사이클은 DFS 중 "방문 중"인 정점을 다시 만나는 것으로 찾는다.
- 위상 정렬은 의존 관계를 거스르지 않는 한 줄 순서를 만들고, 칸 알고리즘은 사이클이 있으면 이를 함께 알려 준다.

## 더 알아보기
- 이전 글: 9편 「트리: 계층 구조와 구문 트리」
- 다음 글: 11편 「점근 표기법: 알고리즘의 비용 세기」
