# [고급 자료 구조 12/12] 센트로이드 분할: 트리를 반씩 쪼개는 분할 정복

> **한 줄 요약** — 지웠을 때 남는 조각이 모두 절반 이하인 정점(센트로이드)을 골라 "그 정점을 지나는 경로"만 세고 조각마다 재귀하면, 분할 깊이가 log₂ n 이하라 모든 정점이 O(log n)번만 처리되어 거리가 k인 정점 쌍 세기 같은 경로 문제를 O(n²)에서 O(n log n)으로 줄인다.

## 이 글에서 다루는 것
- 센트로이드의 정의와 항상 존재하는 이유
- 센트로이드 분할의 깊이가 log₂ n 이하인 이유
- 거리가 k인 정점 쌍 세기: "먼저 묻고 나중에 더하기"
- 무작위 대조와 사슬·무작위·별 트리에서 깊이와 일의 양 측정

## 예제 문제: 거리가 정확히 k인 정점 쌍
정점 n개짜리 트리에서 거리(간선 수)가 정확히 k인 정점 쌍 (u, v)의 개수를 센다. 가장 단순한 방법은 정점마다 BFS를 돌려 거리를 모두 구하는 것으로 O(n²)이다. n = 10⁵이면 10¹⁰번이다. 배열이라면 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」처럼 반으로 나눠 "가운데를 걸치는 것"만 세고 양쪽에 재귀하겠지만, 트리에서는 어디를 잘라야 반이 될까?

## 센트로이드: 지우면 모든 조각이 절반 이하인 정점
정점 c를 지우면 트리는 c에 붙어 있던 가지 수만큼의 조각으로 갈라진다. 모든 조각의 크기가 n/2 이하인 정점을 **센트로이드**(centroid)라 한다. 1869년 카미유 조르당(Camille Jordan)이 모든 트리에 센트로이드가 1개, 또는 서로 이웃한 2개 있음을 보였다.
```text
        0  ← 센트로이드
      / | \
     1  2  3
    / \     \
   4   5     6
  /         / \
 7         8   9

0을 지우면 조각 크기 4, 1, 4 (≤ 5)
```
존재는 걸어가며 보일 수 있다. 아무 정점에서 시작해, 크기가 n/2를 넘는 조각이 있으면 그 조각 쪽 이웃으로 한 칸 옮긴다. 옮긴 뒤 "뒤쪽" 조각은 큰 조각 바깥 전부라 크기가 n/2 미만이므로 되돌아갈 일이 없고, 큰 조각은 매번 1씩 줄어들므로 언젠가 멈춘다. 멈춘 곳이 센트로이드다. 구현에서는 한 번의 BFS로 서브트리 크기를 구한 뒤, 정점마다 "부모 쪽 조각 = m − size[v]"와 자식 조각들의 최댓값이 m/2 이하인지 보면 된다.

## 센트로이드 분할
트리의 모든 경로는 센트로이드 c를 지나거나, c를 지운 뒤 한 조각 안에 통째로 들어 있다. 그래서 문제를 이렇게 나눈다.
1. 지금 덩어리의 센트로이드 c를 찾는다.
2. c를 지나는 경로만 센다.
3. c를 지우고, 남은 조각마다 같은 일을 재귀로 한다.

조각은 언제나 절반 이하이므로 log₂ n단계 안에 크기가 1이 된다. 같은 단계의 덩어리들은 서로 겹치지 않으므로 단계마다 총 O(n)의 일을 하고, 전체는 O(n log n)이다. 센트로이드 대신 아무 정점이나 고르면 사슬 트리에서 조각이 하나씩만 줄어 깊이가 n − 1이 된다.

## 센트로이드를 지나는 경로 세기
c를 지나는 경로 u–v의 길이는 `d(u) + d(v)`다(d는 c에서의 거리). 단, u와 v가 같은 가지에 있으면 실제 경로는 c를 지나지 않으니 세면 안 된다. 그래서 가지를 하나씩 처리하며 **먼저 묻고 나중에 더한다**. `cnt[d]`를 "이미 처리한 가지들(과 c 자신)에서 거리가 d인 정점 수"라 하면, 새 가지의 정점마다 `cnt[k − d]`를 더한 뒤에야 그 가지의 거리들을 `cnt`에 넣는다. 끝나면 쓴 칸만 0으로 지운다. 배열 전체를 지우면 센트로이드마다 O(n)이 들어 전체가 O(n²)이 된다.

## 구현
재귀 대신 스택에 (덩어리의 아무 정점, 분할 깊이)를 넣어 돌린다. 실험을 위해 분할 깊이, 방문한 정점 수 합계, 센트로이드를 쓰지 않는 선택지도 함께 둔다.
```python
def centroid_pairs(n, adj, k, use_centroid=True):
    removed, size, cnt = [False] * n, [0] * n, [0] * (max(n, k) + 1)
    total = work = depth = 0
    stack = [(0, 0)] if n else []            # (덩어리의 아무 정점, 분할 깊이)
    while stack:
        start, level = stack.pop()
        order, par = [start], {start: -1}    # 덩어리를 BFS로 모은다
        for v in order:
            for w in adj[v]:
                if w != par[v] and not removed[w]:
                    par[w] = v
                    order.append(w)
        m, c = len(order), start
        work, depth = work + m, max(depth, level)
        for v in order:
            size[v] = 1
        for v in reversed(order):            # 잎부터 서브트리 크기
            if par[v] >= 0:
                size[par[v]] += size[v]
        for v in (order if use_centroid else []):
            big = m - size[v]                # 부모 쪽 덩어리
            for w in adj[v]:
                if w != par[v] and not removed[w]:
                    big = max(big, size[w])
            if 2 * big <= m:                 # 모든 덩어리가 절반 이하
                c = v
                break
        removed[c], cnt[0], maxd = True, 1, 0
        for w in adj[c]:                     # c를 지나는 경로만 센다
            if removed[w]:
                continue
            ds, st = [], [(w, c, 1)]
            while st:
                v, p, d = st.pop()
                ds.append(d)
                for x in adj[v]:
                    if x != p and not removed[x]:
                        st.append((x, v, d + 1))
            total += sum(cnt[k - d] for d in ds if d <= k)  # 먼저 묻고
            for d in ds:                                    # 나중에 더한다
                cnt[d] += 1
            maxd = max(maxd, max(ds))
            stack.append((w, level + 1))
        for d in range(maxd + 1):            # 쓴 칸만 지운다
            cnt[d] = 0
    return total, depth, work

edges = [(0, 1), (0, 2), (0, 3), (1, 4), (1, 5),
         (3, 6), (4, 7), (6, 8), (6, 9)]
adj = [[] for _ in range(10)]
for u, v in edges:
    adj[u].append(v)
    adj[v].append(u)
print([centroid_pairs(10, adj, k)[0] for k in range(1, 7)])
```
```text
[9, 11, 10, 8, 5, 2]
```
거리 1인 쌍은 간선 수 9와 같고, 여섯 값의 합 45는 전체 쌍 수 10·9/2와 같다. 가장 먼 쌍은 7과 8, 7과 9로 거리 6이다.

## 무작위 대조 검사
앞 코드에 이어서, 정점마다 BFS를 돌리는 O(n²) 방법과 비교한다. 부모를 무작위로 고르면 트리가 얕아지므로 30% 확률로 직전 정점에 붙여 긴 사슬도 섞는다. k가 지름보다 큰 경우(답 0)도 들어가게 k를 n + 1까지 뽑는다.
```python
import random
from collections import deque

def pairs_brute(n, adj, k):                  # 정점마다 BFS: O(n²)
    total = 0
    for s in range(n):
        dist, q = {s: 0}, deque([s])
        while q:
            v = q.popleft()
            for w in adj[v]:
                if w not in dist:
                    dist[w] = dist[v] + 1
                    q.append(w)
        total += sum(1 for v, d in dist.items() if v > s and d == k)
    return total

rng = random.Random(12)
ok = 0
for _ in range(500):
    n = rng.randint(1, 40)
    adj = [[] for _ in range(n)]
    for v in range(1, n):
        p = rng.randrange(v) if rng.random() < 0.7 else v - 1   # 긴 사슬도 섞기
        adj[v].append(p)
        adj[p].append(v)
    k = rng.randint(1, n + 1)
    ok += centroid_pairs(n, adj, k)[0] == pairs_brute(n, adj, k)
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 분할 깊이와 일의 양
앞 코드에 이어서, 정점 32,767개짜리 사슬·무작위·별 트리에서 분할 깊이와 방문한 정점 수 합계(모든 단계의 덩어리 크기 합)를 잰다. 마지막 줄은 센트로이드 대신 덩어리의 첫 정점으로 쪼갠 경우다.
```python
import math

def build(n, parent_of):
    adj = [[] for _ in range(n)]
    for v in range(1, n):
        p = parent_of(v)
        adj[v].append(p)
        adj[p].append(v)
    return adj

n = 2 ** 15 - 1
trees = {"사슬": build(n, lambda v: v - 1),
         "무작위": build(n, lambda v: rng.randrange(v)),
         "별": build(n, lambda v: 0)}
print(f"n = {n}, log₂ n ≈ {math.log2(n):.1f}")
for name, adj in trees.items():
    _, depth, work = centroid_pairs(n, adj, 5)
    print(f"{name}: 분할 깊이 {depth}, 방문 정점 {work / n:.1f}·n")
m = 3000
_, depth, work = centroid_pairs(m, build(m, lambda v: v - 1), 5, False)
print(f"첫 정점 분할(사슬 {m}): 깊이 {depth}, 방문 {work / m:.0f}·n")
```
```text
n = 32767, log₂ n ≈ 15.0
사슬: 분할 깊이 14, 방문 정점 14.0·n
무작위: 분할 깊이 13, 방문 정점 8.3·n
별: 분할 깊이 1, 방문 정점 2.0·n
첫 정점 분할(사슬 3000): 깊이 2999, 방문 1500·n
```
사슬은 정확히 반씩 쪼개져 깊이가 log₂ n에 꽉 차고, 방문 정점 합도 약 n·log₂ n이다. 별은 가운데를 지우면 모두 크기 1이라 두 단계로 끝난다. 반면 아무 정점으로 쪼개면 사슬에서 깊이가 n − 1, 일이 n²/2가 되어 단순한 방법과 다를 바 없다.

## 자주 하는 실수와 변형
- 같은 가지 안의 쌍을 세는 실수: 가지마다 "묻기 → 더하기" 순서를 지키지 않으면 c를 지나지 않는 경로가 섞인다.
- 서브트리 크기를 덩어리마다 새로 구하지 않는 실수: 지워진 정점을 빼고 다시 세야 한다.
- 거리 k 이하 쌍 세기: 센트로이드마다 거리를 정렬해 투 포인터로 합이 k 이하인 쌍을 세고, 같은 가지 안 쌍을 같은 방법으로 세어 뺀다. 전체 O(n log² n)이다.
- 가중치 간선이면 거리가 커지므로 `cnt` 배열 대신 딕셔너리나 정렬을 쓴다.
- 센트로이드 트리로 온라인 질의: 정점마다 센트로이드 조상이 log₂ n + 1개 이하라, "칠해진 정점 중 가장 가까운 것" 같은 질의를 조상마다 저장한 최솟값과 거리로 O(log n)번 비교해 답한다.

## 복잡도
| 항목 | 센트로이드 분할 | 단순한 방법 |
|---|---|---|
| 거리 k 쌍 세기 | O(n log n) | O(n²) |
| 분할 깊이 | ≤ log₂ n | n − 1(아무 정점) |
| 추가 메모리 | O(n) | O(n) |

단계마다 덩어리들이 겹치지 않아 O(n), 단계 수가 log₂ n + 1 이하라 O(n log n)이다. 센트로이드 찾기도 덩어리 크기에 비례해 이 안에 들어간다.

## 어디에 쓰이나
- 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」: 배열을 반으로 자르고 가운데를 걸치는 것만 세는 병합 정렬식 분할 정복을, 센트로이드라는 "트리의 가운데"로 옮긴 것이다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 정점 하나를 지우면 가지 수만큼 조각이 나고 경로가 유일하다는 트리의 성질이, "모든 경로는 c를 지나거나 한 조각 안에 있다"는 분할의 근거다.
- 알고리즘 기법 4편 「투 포인터: 두 끝을 움직여 O(n)에 구간 찾기」: 거리 k 이하 변형은 센트로이드마다 정렬한 거리 목록에서 투 포인터로 쌍을 센다.
- 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」: 센트로이드 트리로 온라인 질의를 할 때 정점과 센트로이드 조상 사이 거리를 LCA로 구한다.

## 정리
- 센트로이드는 지웠을 때 모든 조각이 절반 이하인 정점으로, 모든 트리에 1개 또는 이웃한 2개 있다.
- 센트로이드로 쪼개면 깊이가 log₂ n 이하이고, 단계마다 O(n)이라 전체 O(n log n)이다.
- 센트로이드를 지나는 경로는 가지마다 "먼저 묻고 나중에 더하기"로 같은 가지 쌍을 빼고 센다.
- 32,767개 정점의 사슬에서 분할 깊이는 14였고, 아무 정점으로 쪼개면 2,999(n = 3,000)까지 깊어졌다.

## 더 알아보기
- 이전 글: 11편 「오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기」
- 처음 글: 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」
