# [그래프 알고리즘 14/14] 플로우로 모델링하기: 정점 분할, 프로젝트 선택, 하한 있는 유량

> **한 줄 요약** — 플로우 문제의 어려움은 그래프 만들기에 있으며, 정점 용량은 입구·출구 분할로, "고르면 이익이나 비용, 고르려면 저것도"는 무한 용량 간선과 최소 컷으로, "최소 이만큼은 흘러야 한다"는 미리 흘린 빚으로 바꾸면 모두 최대 유량 한 번으로 풀린다.

## 이 글에서 다루는 것
- 정점 분할: 정점이 겹치지 않는 경로와 멩거 정리
- 프로젝트 선택: 이익 − 비용 최대화를 최소 컷으로
- 하한 있는 순환: 하한을 빚으로 바꾸는 변환
- 세 모델 모두 완전 탐색과 무작위 대조, 모델링 체크리스트

## 정점 분할: 중계 정점을 한 번만 쓸 수 있을 때
링크가 아니라 중계 정점이 한 경로에만 쓰일 수 있다면, 서로 정점을 공유하지 않는 경로는 몇 개일까? 최대 유량은 간선 용량만 다루므로 정점 v를 입구 `v_in`과 출구 `v_out`으로 쪼개고 그 사이에 용량 1 간선을 둔다. v로 들어오는 간선은 `v_in`으로, 나가는 간선은 `v_out`에서 출발시키면 v를 지나는 유량이 1로 묶인다. 출발점과 도착점 자신은 무한 용량으로 둔다.
```text
   ┌── 1 ──┐   ┌── 4 ──┐
 0─┤       ├ 3 ┤       ├─6
   └── 2 ──┘   └── 5 ──┘
```
0에서 6까지 링크 기준과 정점 기준으로 경로 수를 세어 보자.
```python
from collections import deque
INF = float("inf")

def max_flow(n, edges, s, t):             # 에드몬즈-카프
    g, to, cap = [[] for _ in range(n)], [], []
    for u, v, c in edges:
        g[u].append(len(to)); to.append(v); cap.append(c)
        g[v].append(len(to)); to.append(u); cap.append(0)
    flow = 0
    while True:
        prev = [-1] * n; prev[s] = -2
        q = deque([s])
        while q:
            v = q.popleft()
            for i in g[v]:
                if cap[i] > 0 and prev[to[i]] == -1:
                    prev[to[i]] = i; q.append(to[i])
        if prev[t] == -1:                 # 닿은 곳 = 최소 컷의 s 쪽
            return flow, [p != -1 for p in prev], cap
        path, v = [], t
        while v != s:
            path.append(prev[v]); v = to[prev[v] ^ 1]
        b = min(cap[i] for i in path)
        for i in path:
            cap[i] -= b; cap[i ^ 1] += b
        flow += b

def disjoint_paths(n, links, s, t, split=True):
    E = []                                # 정점 v → 입구 2v, 출구 2v+1
    for v in range(n):
        E.append((2 * v, 2 * v + 1, INF if v in (s, t) or not split else 1))
    for u, v in links:                    # 무방향 링크 = 양방향 간선
        E += [(2 * u + 1, 2 * v, 1), (2 * v + 1, 2 * u, 1)]
    return max_flow(2 * n, E, 2 * s + 1, 2 * t)[0]

links = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4), (3, 5), (4, 6), (5, 6)]
print("간선이 겹치지 않는 경로", disjoint_paths(7, links, 0, 6, split=False))
print("정점이 겹치지 않는 경로", disjoint_paths(7, links, 0, 6))
```
```text
간선이 겹치지 않는 경로 2
정점이 겹치지 않는 경로 1
```
링크만 따지면 0-1-3-4-6과 0-2-3-5-6 두 길이지만, 둘 다 정점 3을 지나므로 정점 기준으로는 1이다. 1927년 멩거(Karl Menger)의 정리대로 이웃하지 않은 두 정점 사이의 "정점이 겹치지 않는 경로의 최대 개수"는 "둘을 끊기 위해 지워야 하는 정점의 최소 개수"와 같다. 분할한 그래프의 최소 컷이 바로 그 정점들의 입구–출구 간선이다.

## 프로젝트 선택: 이익과 의존성
게임 스튜디오가 기능(이익)과 기반 작업(비용)을 고른다. 어떤 기능은 기반 작업을 요구한다. 순이익을 최대로 하는 닫힌 집합(고른 것의 요구도 모두 고른 집합)을 2ⁿ개 다 볼 수는 없다.

최소 컷으로 바꾼다. 이익 p > 0인 항목은 s → i(용량 p), 비용인 항목은 i → t(용량 −p), "i를 고르면 j도"는 i → j(용량 ∞)로 둔다. 컷의 s 쪽이 고른 집합이다. 컷 용량은 (고르지 않아 놓친 이익) + (골라서 낸 비용)이고, ∞ 간선 때문에 i는 s 쪽, j는 t 쪽인 컷은 생기지 않는다. 그래서 `순이익 = 양수 이익 합 − 최소 컷`이다. 앞 코드에 이어서 실행한다.
```python
def best_projects(items, needs):          # items: (이름, 이익), needs: (i, j)
    n = len(items); s, t = n, n + 1
    E = [(s, i, p) if p > 0 else (i, t, -p) for i, (_, p) in enumerate(items)]
    E += [(i, j, INF) for i, j in needs]  # i를 고르면 j도 골라야 한다
    cut, side, _ = max_flow(n + 2, E, s, t)
    pos = sum(p for _, p in items if p > 0)
    return pos - cut, [items[i][0] for i in range(n) if side[i]]

items = [("퀘스트", 8), ("멀티플레이", 10), ("스크립트", -5),
         ("서버", -14), ("업적", 3)]
needs = [(0, 2), (1, 2), (1, 3), (4, 3)]
print(best_projects(items, needs))
```
```text
(3, ['퀘스트', '스크립트'])
```
멀티플레이(10)와 업적(3)을 더해도 서버(−14)를 감당하지 못하므로, 퀘스트와 스크립트만 골라 3을 버는 것이 최선이다. 이 구성은 그래프의 **최대 가중 닫힘**(maximum closure) 문제로, 1970년 리스(J. M. W. Rhys)와 발린스키(Michel Balinski)가 각각 다뤘고 1976년 피카드(Picard)가 일반화하며 최대 유량으로 푸는 환원을 보였다. 노천 광산에서 어떤 블록을 캘지(위 블록을 먼저 캐야 아래 블록에 닿는다) 정하는 문제가 대표적인 쓰임이다.

## 하한 있는 순환: 최소 이만큼은 흘러야 할 때
간선마다 [하한, 상한]이 있고, 모든 정점에서 들어온 합 = 나간 합인 흐름(순환)이 있는지 묻는다. s → t 유량이라면 t → s에 [0, ∞] 간선을 더해 순환으로 만든다. 요령은 하한만큼은 **이미 흘렸다고 치는** 것이다. 간선 u → v의 용량을 (상한 − 하한)으로 줄이고, v에는 하한만큼 남는 물(+), u에는 모자란 물(−)이 생긴다. 새 출발점 S에서 남는 정점으로, 모자란 정점에서 새 도착점 T로 그 양만큼 간선을 두고 최대 유량을 구해 S의 간선이 모두 꽉 차면 가능하다. 앞 코드에 이어서 실행한다.
```python
def circulation(n, edges):                # edges: (u, v, 하한, 상한)
    S, T = n, n + 1
    E, ex = [], [0] * n
    for u, v, lo, hi in edges:            # 하한만큼은 미리 흘렸다고 친다
        E.append((u, v, hi - lo)); ex[v] += lo; ex[u] -= lo
    E += [(S, v, ex[v]) for v in range(n) if ex[v] > 0]
    E += [(v, T, -ex[v]) for v in range(n) if ex[v] < 0]
    f, _, cap = max_flow(n + 2, E, S, T)
    if f < sum(x for x in ex if x > 0):
        return None                       # 빚을 다 갚지 못했다
    return [lo + cap[2 * k + 1] for k, (_, _, lo, _) in enumerate(edges)]

s, a, b, t = range(4)
net = [(s, a, 2, 4), (s, b, 0, 3), (a, b, 1, 2), (a, t, 0, 2),
       (b, t, 3, 5), (t, s, 0, INF)]      # t → s로 닫아 순환으로
print(circulation(4, net))
net[1], net[4] = (s, b, 0, 1), (b, t, 4, 5)  # b에는 최대 1 + 2만 온다
print(circulation(4, net))
```
```text
[2, 1, 2, 0, 3, 3]
None
```
첫 망의 답은 모든 하한·상한과 보존 법칙을 지킨다. 둘째 망은 b → t가 4 이상 흘러야 하는데 b로 들어올 수 있는 양이 3뿐이라 불가능하다. 존재 조건을 정점 집합마다의 부등식으로 쓴 것이 호프먼(Alan Hoffman)의 순환 정리다. 하한 있는 최대 유량은 이렇게 실행 가능한 흐름을 하나 얻은 뒤 t → s 간선을 빼고 남은 잔여 그래프에서 s → t 최대 유량을 더 구하면 된다.

## 무작위 대조 검사
정점 분할은 지울 정점 집합을 모두 시도한 최소 분리 집합, 프로젝트 선택은 닫힌 부분집합 전체, 순환은 간선마다 하한~상한의 정수를 모두 시도한 결과와 비교한다. 앞 코드에 이어서 실행한다.
```python
import random
from itertools import product

def cut_off(n, links, s, t, gone):        # gone을 지우면 s와 t가 끊기나
    seen, stack = {s}, [s]
    while stack:
        v = stack.pop()
        for x, y in links + [(b, a) for a, b in links]:
            if x == v and y not in seen and y not in gone:
                seen.add(y); stack.append(y)
    return t not in seen

def ok(n, E, f):                          # 하한·상한과 보존 법칙
    net = [0] * n
    for (u, v, lo, hi), x in zip(E, f):
        net[u] -= x; net[v] += x
        if not lo <= x <= hi:
            return False
    return not any(net)

rng = random.Random(14)
for _ in range(500):
    n = rng.randint(2, 8)                 # 1) 정점 분할 = 최소 분리 집합
    L = [(u, v) for u in range(n) for v in range(u + 1, n)
         if rng.random() < 0.5 and (u, v) != (0, n - 1)]
    sep = min(bin(m).count("1") for m in range(1 << max(n - 2, 0))
              if cut_off(n, L, 0, n - 1,
                         {v for v in range(1, n - 1) if m >> v - 1 & 1}))
    assert disjoint_paths(n, L, 0, n - 1) == sep
    k = rng.randint(1, 8)                 # 2) 프로젝트 선택
    items = [(i, rng.randint(-9, 9)) for i in range(k)]
    nd = [(i, j) for i in range(k) for j in range(k)
          if i != j and rng.random() < 0.2]
    best = max(sum(items[i][1] for i in range(k) if m >> i & 1)
               for m in range(1 << k)
               if all(m >> j & 1 for i, j in nd if m >> i & 1))
    assert best_projects(items, nd)[0] == best
    n = rng.randint(2, 4)                 # 3) 하한 있는 순환
    E = []
    for _ in range(rng.randint(1, 5)):
        u, v, lo = rng.randrange(n), rng.randrange(n), rng.randint(0, 2)
        if u != v:
            E.append((u, v, lo, lo + rng.randint(0, 2)))
    any_ok = any(ok(n, E, f) for f in product(
        *[range(lo, hi + 1) for *_, lo, hi in E]))
    got = circulation(n, E)
    assert (got is not None) == any_ok and (got is None or ok(n, E, got))
print("세 모델 각 500개 비교: 모두 일치")
```
```text
세 모델 각 500개 비교: 모두 일치
```

## 모델링 체크리스트
1. **한 단위의 유량이 무엇인가**: 사람 한 명, 패킷 하나, "경로 하나"처럼 세는 대상을 먼저 정한다.
2. **제약이 어디에 붙는가**: 간선이면 용량, 정점이면 분할, "최소 이만큼"이면 하한 변환이다.
3. **고르기·버리기 결정인가**: 둘 중 하나를 고르는 항목과 "고르려면 저것도"라는 규칙은 s 쪽·t 쪽 컷과 ∞ 간선으로 바꾼다.
4. **출발점·도착점이 여럿인가**: 슈퍼 소스와 슈퍼 싱크를 붙인다. 무방향 간선은 양방향 간선 한 쌍이다.
5. **비용이 있는가**: 13편 「최소 비용 최대 유량: 유량에 가격 붙이기」로 간다.
6. **크기는 얼마인가**: 분할하면 정점이 두 배다. V, E를 보고 10편 「네트워크 플로우: 포드-풀커슨과 에드몬즈-카프」와 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」 중에서 고른다.
7. **답은 정수인가**: 용량이 정수면 정수 최대 유량이 있어 "몇 명", "몇 개"가 그대로 나온다.

## 복잡도
| 모델 | 그래프 크기 | 완전 탐색 |
|---|---|---|
| 정점 분할 | 2V 정점, V + 2E 간선 | 2ⱽ 분리 집합 |
| 프로젝트 선택 | n + 2 정점 | 2ⁿ 부분집합 |
| 하한 있는 순환 | V + 2 정점, E + V 간선 | 흐름 전수 조사 |

변환은 모두 O(V + E)이고, 시간은 그 그래프에 쓴 최대 유량 알고리즘(에드몬즈-카프 O(VE²), 디닉 O(V²E))을 따른다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 프로젝트 선택의 "고르려면 저것도"는 그 글의 패키지 의존성 그래프와 같은 구조이고, 고른 집합은 의존성을 따라 닫혀 있어야 한다.
- 노천 광산 설계: 블록을 캐는 순서 제약 아래 이익을 최대로 하는 문제는 최대 닫힘 문제로 풀리며, 피카드의 최소 컷 환원이 이 계산을 네트워크 플로우로 바꿨다.
- 8편 「단절점과 단절선: 끊으면 갈라지는 곳 찾기」: 정점 분할 최대 유량이 1이면 두 정점 사이에 단절점이 있고, 멩거 정리는 이를 k개 정점으로 일반화한다.

## 정리
- 정점 용량은 입구·출구 분할로 간선 용량이 되고, 정점이 겹치지 않는 경로 수는 멩거 정리대로 최소 분리 집합과 같다.
- 이익과 비용, 의존성은 s·t 간선과 ∞ 간선으로 표현하고, 순이익은 양수 이익 합에서 최소 컷을 뺀 값이다.
- 하한은 미리 흘렸다고 치고 남는 물·모자란 물을 새 출발·도착점으로 갚아, S의 간선이 모두 차는지로 판정한다.
- 세 모델 모두 완전 탐색과 500개씩 일치했다. 그래프만 잘 만들면 알고리즘은 10~13편에 있다.

## 더 알아보기
- 이전 글: 13편 「최소 비용 최대 유량: 유량에 가격 붙이기」
- 처음 글: 1편 「BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색」
- 닫힘 문제(위키백과 영어판): https://en.wikipedia.org/wiki/Closure_problem
