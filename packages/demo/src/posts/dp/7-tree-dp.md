# [동적 계획법 7/12] 트리 DP: 독립 집합과 리루팅

> **한 줄 요약** — 트리에서는 정점 하나를 루트로 잡으면 서브트리가 서로 겹치지 않는 부분 문제가 되므로 자식의 답을 모아 부모의 답을 만드는 DP가 O(n)에 돌고, 루트를 한 칸씩 옮기며 답을 고치는 리루팅을 더하면 모든 정점을 루트로 한 답도 O(n)에 얻는다.

## 이 글에서 다루는 것
- 트리의 부분 문제 = 서브트리, 계산 순서 = 자식 먼저
- 최대 가중치 독립 집합: 고른다/안 고른다 두 상태와 복원
- 재귀 깊이 문제와 반복 DFS로 바꾸기
- 서브트리 크기와 리루팅: 모든 정점의 거리 합을 O(n)에

## 예제 문제: 직속 상사와 부하를 함께 부르지 않는 파티
회사 조직도가 트리로 주어지고 사람마다 즐거움 점수가 있다. 직속 상사와 그 부하를 동시에 초대하면 분위기가 어색해지므로, 간선으로 이어진 두 사람을 함께 고르지 않으면서 점수 합을 최대로 하고 싶다. 그래프 용어로는 **최대 가중치 독립 집합**(maximum weight independent set)이다.
```text
        0 (3)
       /     \
    1 (9)    2 (4)
    /   \       \
 3 (2) 4 (6)    5 (7)
                  \
                  6 (1)
```
점수가 큰 사람부터 욕심껏 고르면 1(9)과 5(7)을 고른 뒤 더 고를 사람이 없어 16에 그친다. 정답은 {0, 3, 4, 5}의 18이다. 9점짜리 한 명보다 그 부하 둘(2 + 6)과 상사(3)를 함께 고르는 편이 낫다.

## 단순한 방법과 트리의 구조
모든 부분집합을 보면 2ⁿ가지다. 일반 그래프의 최대 독립 집합은 NP-어려운 문제라 이보다 크게 나은 방법이 알려져 있지 않다. 그런데 트리는 다르다. 루트를 정하면 정점 v의 서브트리들은 v를 통해서만 서로 이어져 있다(이산수학 9편 「트리: 계층 구조와 구문 트리」). 그래서 v를 고를지만 정해지면 자식 서브트리들은 서로 신경 쓰지 않고 따로 풀 수 있다. 이것이 1편에서 말한 최적 부분 구조이고, 상태는 "정점 v의 서브트리, v를 골랐는가" 두 가지면 된다.
```text
take[v] = w[v] + Σ skip[c]
skip[v] = Σ max(take[c], skip[c])
답 = max(take[root], skip[root])
```
v를 고르면 자식 c는 모두 빠져야 하고(`skip[c]`), v를 고르지 않으면 자식마다 더 나은 쪽을 고른다. 정점마다 자식 수만큼 일하므로 합은 간선 수, 즉 O(n)이다.

## 구현: 반복 DFS로 자식 먼저
재귀로 쓰면 간단하지만 아래에서 볼 이유로 반복문으로 쓴다. 스택 DFS로 "부모가 자식보다 먼저 나오는" 순서를 만든 뒤, 그 순서를 뒤집으면 자식이 부모보다 먼저 나온다. 뒤집은 순서대로 자식의 값을 부모에 더해 주면 된다.
```python
def tree_order(n, edges, root=0):
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    parent, order = [-1] * n, []
    seen = [False] * n
    seen[root], stack = True, [root]
    while stack:                       # 반복 DFS: 부모가 자식보다 먼저
        v = stack.pop()
        order.append(v)
        for c in adj[v]:
            if not seen[c]:
                seen[c], parent[c] = True, v
                stack.append(c)
    return order, parent

def max_independent_set(n, edges, w):
    order, parent = tree_order(n, edges)
    take, skip = [0] * n, [0] * n
    for v in reversed(order):          # 역순 = 자식을 먼저 끝낸다
        take[v] += w[v]
        p = parent[v]
        if p >= 0:
            take[p] += skip[v]         # 부모를 고르면 자식은 못 고른다
            skip[p] += max(take[v], skip[v])
    chosen = [False] * n               # 위에서 아래로 내려가며 복원
    for v in order:
        p = parent[v]
        if p < 0 or not chosen[p]:
            chosen[v] = take[v] >= skip[v]
    best = max(take[order[0]], skip[order[0]])
    return best, [v for v in range(n) if chosen[v]]

w = [3, 9, 4, 2, 6, 7, 1]
edges = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (5, 6)]
print(max_independent_set(7, edges, w))
```
```text
(18, [0, 3, 4, 5])
```
복원은 반대 방향이다. 부모가 골라졌으면 자식은 무조건 빠지고, 부모가 빠졌으면 `skip[p]`를 계산할 때 쓴 대로 `take[c]`와 `skip[c]` 중 큰 쪽을 따른다.

## 무작위 대조 검사
앞 코드에 이어서, 무작위 트리(정점 1~12개)마다 2ⁿ 완전 탐색과 답을 비교하고, 복원한 집합이 정말 독립 집합인지와 점수 합이 맞는지도 확인한다.
```python
import random

def brute(n, edges, w):
    best = 0
    for mask in range(1 << n):
        if all(not (mask >> a & 1 and mask >> b & 1) for a, b in edges):
            best = max(best, sum(w[v] for v in range(n) if mask >> v & 1))
    return best

def random_tree(rng, n):
    label = list(range(n))
    rng.shuffle(label)                 # 번호를 섞어 루트가 0이 아니게
    return [(label[i], label[rng.randrange(i)]) for i in range(1, n)]

rng = random.Random(7)
for t in range(500):
    n = rng.randint(1, 12)
    e = random_tree(rng, n)
    ws = [rng.randint(0, 20) for _ in range(n)]
    best, chosen = max_independent_set(n, e, ws)
    s = set(chosen)
    assert best == brute(n, e, ws) == sum(ws[v] for v in s)
    assert not any(a in s and b in s for a, b in e)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 재귀 깊이 문제
트리 DP를 재귀로 쓰면 재귀 깊이가 트리의 높이가 된다. 정점이 일렬로 늘어선 일자 트리는 높이가 n이라, 파이썬의 기본 재귀 한도에 바로 걸린다. 앞 코드에 이어서 실험해 보자.
```python
import sys

def size_rec(adj, v, p):
    s = 1
    for c in adj[v]:
        if c != p:
            s += size_rec(adj, c, v)
    return s

def path_edges(n):                     # 0-1-2-…-(n-1) 일자 트리
    return [(i - 1, i) for i in range(1, n)]

adj = [[] for _ in range(5000)]
for a, b in path_edges(5000):
    adj[a].append(b)
    adj[b].append(a)
print("재귀 한도:", sys.getrecursionlimit())
try:
    size_rec(adj, 0, -1)
except RecursionError as e:
    print("RecursionError:", e)

n = 200_000
order, parent = tree_order(n, path_edges(n))
size = [1] * n
for v in reversed(order):
    if parent[v] >= 0:
        size[parent[v]] += size[v]
print("반복 DFS 크기:", size[0], size[n // 2])
```
```text
재귀 한도: 1000
RecursionError: maximum recursion depth exceeded
반복 DFS 크기: 200000 100000
```
`sys.setrecursionlimit`으로 한도만 올리면 인터프리터가 쓰는 실제 스택이 먼저 넘쳐 프로그램이 오류 메시지도 없이 죽을 수 있다. 정점이 수십만 개인 입력이라면 처음부터 순서 배열을 만들어 반복문으로 도는 편이 안전하다. 위에서 구한 `size`가 **서브트리 크기**(`size[v] = 1 + Σ size[c]`)이고, 다음 절의 재료가 된다.

## 리루팅: 모든 정점을 루트로 한 답
이번에는 정점마다 "다른 모든 정점까지 거리의 합"을 구해 보자. 정점마다 BFS를 돌리면 O(n²)이다. 루트 하나에 대한 답은 트리 DP로 쉽다. `down[v]`를 v의 서브트리 정점들까지의 거리 합이라 하면, 자식 c 쪽 정점들은 c까지 거리에 1씩 더해지므로 `down[v] = Σ (down[c] + size[c])`다.

나머지 정점의 답은 **리루팅**(rerooting)으로 얻는다. 루트를 v에서 이웃한 자식 c로 옮기면 무엇이 바뀌는지만 계산하는 것이다.
```text
루트를 v에서 자식 c로 옮기면
  c 서브트리의 size[c]개: 1씩 가까워짐
  나머지 n − size[c]개: 1씩 멀어짐
ans[c] = ans[v] − size[c]
              + (n − size[c])
```
첫 단계는 아래에서 위로 `size`와 `down`을, 둘째 단계는 위에서 아래로 `ans`를 채운다. 앞 코드에 이어서 쓴다.
```python
from collections import deque

def distance_sums(n, edges):
    order, parent = tree_order(n, edges)
    size, down = [1] * n, [0] * n
    for v in reversed(order):          # 1단계: 루트 아래쪽 거리 합
        p = parent[v]
        if p >= 0:
            size[p] += size[v]
            down[p] += down[v] + size[v]
    ans = [0] * n
    ans[order[0]] = down[order[0]]
    for v in order[1:]:                # 2단계: 루트를 한 칸씩 옮긴다
        ans[v] = ans[parent[v]] - size[v] + (n - size[v])
    return ans

def brute_sums(n, edges):              # 정점마다 BFS: O(n²)
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    res = []
    for s in range(n):
        dist = [-1] * n
        dist[s], q = 0, deque([s])
        while q:
            v = q.popleft()
            for c in adj[v]:
                if dist[c] < 0:
                    dist[c] = dist[v] + 1
                    q.append(c)
        res.append(sum(dist))
    return res

print(distance_sums(7, edges))
rng = random.Random(77)
for t in range(500):
    n = rng.randint(1, 40)
    e = random_tree(rng, n)
    assert distance_sums(n, e) == brute_sums(n, e)
print("무작위 500개 비교: 모두 일치")
```
```text
[11, 12, 12, 17, 17, 15, 20]
무작위 500개 비교: 모두 일치
```
예제 트리에서 거리 합이 가장 작은 정점은 0(11)이다. 모든 사람이 모이기 가장 편한 곳을 고르는 "트리의 중앙값" 문제가 이렇게 풀린다.

## 변형과 자주 하는 실수
- 리루팅의 일반형: 자식들의 값을 합치는 연산이 덧셈처럼 되돌릴 수 있으면 위처럼 빼면 되지만, 최댓값처럼 되돌릴 수 없으면 "c를 뺀 나머지 자식들"의 값을 자식 목록의 접두사·접미사 최댓값으로 구한다. 정점마다 가장 먼 정점까지의 거리가 대표적인 예다.
- 최소 정점 덮개: 독립 집합의 여집합은 항상 정점 덮개이므로, 트리의 최소 가중치 정점 덮개는 전체 점수 합에서 최대 독립 집합을 뺀 값이다.
- 트리 위 배낭(정점 k개짜리 연결 부분 트리 등): 자식을 하나씩 합칠 때 두 쪽의 서브트리 크기만큼만 돌면 전체가 O(n²)으로 끝난다. 정점 쌍마다 두 번 이상 만나지 않기 때문이다.
- 무방향 간선을 따라가다 부모로 되돌아가는 실수, 일자 트리에서의 재귀 한도, 입력이 루트를 주지 않는데 0번을 루트로 가정하지 않았는지(아무 정점이나 루트로 잡아도 된다)를 확인한다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 독립 집합 완전 탐색 | O(2ⁿ·n) | O(n) |
| 트리 DP(독립 집합) | O(n) | O(n) |
| 정점마다 BFS(거리 합) | O(n²) | O(n) |
| 리루팅(거리 합) | O(n) | O(n) |

- 트리 DP는 정점마다 자식 수만큼 일하므로 간선 수 n − 1에 비례한다.
- 리루팅은 아래로 한 번, 위로 한 번 두 번 훑으므로 여전히 O(n)이다.

## 어디에 쓰이나
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 자식의 답을 모두 구한 뒤 부모를 계산하는 순서는 그 글의 후위 순회와 같은 "자식 먼저" 순서이고, 이 글은 그것을 스택 DFS 순서를 뒤집어 얻었다.
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: 구문 트리의 노드마다 "이 부분식에 필요한 레지스터 수"를 두 자식의 값으로 계산하는 세티-울먼 알고리즘(1970년)이 트리 DP이고, 그 글의 레지스터 4개 한계에서 계산 순서를 정하는 데 쓰인다.
- 고급 자료 구조 12편 「센트로이드 분할: 트리를 반씩 쪼개는 분할 정복」: "거리가 정확히 k인 쌍의 수"처럼 리루팅 한 번으로 모을 수 없는 질의는 센트로이드 분할로 푼다.

## 정리
- 루트를 정하면 서브트리가 겹치지 않는 부분 문제가 되고, 자식 먼저 순서로 채우면 트리 DP는 O(n)이다.
- 독립 집합은 "v를 골랐는가" 두 상태로 풀고, 위에서 아래로 내려가며 고른 정점을 복원한다.
- 파이썬에서는 일자 트리가 재귀 한도를 넘기므로 순서 배열을 만든 반복 DFS로 쓴다.
- 리루팅은 루트를 이웃으로 옮길 때 바뀌는 양만 고쳐 모든 정점의 답을 O(n)에 구한다.

## 더 알아보기
- 이전 글: 6편 「비트마스크 DP: 외판원 순회 문제」
- 다음 글: 8편 「자릿수 DP: 조건을 만족하는 수 세기」
