# [그래프 알고리즘 13/14] 최소 비용 최대 유량: 유량에 가격 붙이기

> **한 줄 요약** — 간선마다 단위 비용이 있을 때 최대 유량 중 총비용이 가장 작은 것은, 역간선에 음수 비용(환불)을 붙인 잔여 그래프에서 가장 싼 증가 경로를 벨만-포드 계열로 찾아 흘리기를 반복해 구하며, 할당 문제는 이 틀에 그대로 들어간다.

## 이 글에서 다루는 것
- 최소 비용 최대 유량 문제와 할당 문제
- 최단 경로 반복(successive shortest path)과 음수 비용 역간선
- 재배정이 일어나는 과정을 경로 출력으로 보기
- 왜 최적인가: 음수 사이클이 없다는 불변식
- 순열 완전 탐색·유량 전수 조사와의 대조, 포텐셜과 헝가리안 알고리즘

## 예제 문제: 세 사람, 세 가지 일
사람 W0~W2가 일 J0~J2를 하나씩 맡는다. 비용이 다음과 같을 때 총비용을 최소로 하는 배정은?
```text
      J0  J1  J2
W0     1   2   8
W1     2   6   8
W2     9   9   4
```
사람 순서대로 가장 싼 일을 고르면 W0–J0(1), W1–J1(6), W2–J2(4)로 11이다. 하지만 W0–J1(2), W1–J0(2), W2–J2(4)는 8이다. W0이 J0을 양보해야 전체가 싸진다. 모든 순열을 보면 n!가지라 n = 12만 되어도 4억 7천만 가지가 넘는다.

이를 일반화한 것이 **최소 비용 최대 유량**(min-cost max-flow, MCMF)이다. 간선마다 용량과 함께 한 단위를 보낼 때 드는 비용 w가 있고, 최대 유량 가운데 Σ(유량 × 비용)이 가장 작은 것을 찾는다. 할당 문제는 s → 사람(용량 1, 비용 0), 사람 → 일(용량 1, 비용 c[i][j]), 일 → t(용량 1, 비용 0)로 놓으면 된다.

## 아이디어: 가장 싼 증가 경로부터
10편 「네트워크 플로우: 포드-풀커슨과 에드몬즈-카프」의 포드-풀커슨에서 증가 경로를 아무것이나 고르지 않고, **비용 합이 가장 작은** 경로를 고른다. 이때 역간선의 비용은 −w다. u → v로 보낸 한 단위를 되돌리면 그 비용을 돌려받기 때문이다. 잔여 그래프에 음수 간선이 생기므로 다익스트라는 그대로 쓸 수 없고, 3편 「벨만-포드: 음수 간선과 음수 사이클」의 벨만-포드나 그 큐 버전인 SPFA를 쓴다.
```python
from collections import deque

def mcmf(n, edges, s, t, names=None):
    g, to, cap, cost = [[] for _ in range(n)], [], [], []
    for u, v, c, w in edges:              # 역간선은 비용도 반대 부호
        g[u].append(len(to)); to += [v]; cap += [c]; cost += [w]
        g[v].append(len(to)); to += [u]; cap += [0]; cost += [-w]
    flow = total = 0
    while True:
        dist, prev = [float("inf")] * n, [-1] * n
        dist[s], inq, q = 0, [False] * n, deque([s])
        while q:                          # SPFA: 줄어든 정점만 다시 완화
            v = q.popleft(); inq[v] = False
            for i in g[v]:
                w = to[i]
                if cap[i] > 0 and dist[v] + cost[i] < dist[w]:
                    dist[w], prev[w] = dist[v] + cost[i], i
                    if not inq[w]:
                        inq[w] = True; q.append(w)
        if dist[t] == float("inf"):
            return flow, total
        path, v = [], t
        while v != s:
            path.append(prev[v]); v = to[prev[v] ^ 1]
        b = min(cap[i] for i in path)
        for i in path:
            cap[i] -= b; cap[i ^ 1] += b
        flow += b; total += b * dist[t]
        if names:
            hops = [names[s]] + [names[to[i]] for i in reversed(path)]
            print("→".join(hops), "비용", dist[t])

def assignment(c):                        # 사람 i가 일 j를 맡는 비용 c[i][j]
    k = len(c); s, t = 2 * k, 2 * k + 1
    edges = [(s, i, 1, 0) for i in range(k)]
    edges += [(k + j, t, 1, 0) for j in range(k)]
    edges += [(i, k + j, 1, c[i][j]) for i in range(k) for j in range(k)]
    return edges, s, t

c = [[1, 2, 8],
     [2, 6, 8],
     [9, 9, 4]]
edges, s, t = assignment(c)
names = ["W0", "W1", "W2", "J0", "J1", "J2", "s", "t"]
print("결과", mcmf(8, edges, s, t, names))
```
```text
s→W0→J0→t 비용 1
s→W1→J0→W0→J1→t 비용 3
s→W2→J2→t 비용 4
결과 (3, 8)
```
두 번째 경로가 핵심이다. J0 → W0은 W0–J0 배정의 역간선이라 비용이 −1이다. 경로 비용 2 − 1 + 2 = 3은 "W1이 J0을 맡고(2), W0은 J0을 내려놓고(−1) J1로 옮긴다(2)"는 재배정의 비용이고, W1이 J1을 직접 맡는 6보다 싸다. 역간선 덕분에 앞의 탐욕스러운 선택이 저절로 고쳐져 총비용 8이 나왔다.

## 왜 최적인가
**최적 조건**: 유량 값이 같은 흐름들 중에서 f가 최소 비용인 것은 f의 잔여 그래프에 비용 합이 음수인 사이클이 없는 것과 같다. 음수 사이클이 있으면 그 둘레로 한 단위를 돌려 값은 그대로 두고 비용만 줄일 수 있다. 반대로 더 싼 흐름 f′이 있으면 f′ − f는 잔여 그래프의 사이클들로 쪼개지고, 그중 하나는 음수여야 한다.

**불변식**: 처음(유량 0, 모든 비용 ≥ 0)에는 음수 사이클이 없다. 음수 사이클이 없는 상태에서 최단 경로로 흘리면 다음 상태에도 음수 사이클이 없다. 최단 거리 d를 쓰면 모든 잔여 간선이 `d(u) + w ≥ d(v)`를 만족하고, 경로 위 간선은 등호라 새로 생기는 역간선도 `d(v) − w = d(u)`로 등호를 지킨다. 이 부등식을 사이클을 따라 더하면 비용 합이 0 이상이다. 그래서 매 단계의 흐름은 "그 값에서 최소 비용"이고, 마지막 흐름은 최소 비용의 최대 유량이다.

## 무작위 대조 검사
두 가지와 비교한다. 할당 문제는 모든 순열의 최소 비용, 일반 그래프는 간선마다 0부터 용량까지의 정수 유량을 전부 시도해 보존 법칙을 지키는 것 중 (유량 최대, 비용 최소)를 고르는 전수 조사다. 앞 코드에 이어서 실행한다.
```python
import random
from itertools import permutations, product

def brute_flow(n, edges, s, t):           # 간선마다 0..용량을 전부 시도
    best = (0, 0)                         # (유량, −비용) 최대
    for f in product(*[range(c + 1) for _, _, c, _ in edges]):
        net = [0] * n
        for (u, v, _, _), x in zip(edges, f):
            net[u] -= x; net[v] += x
        if all(net[v] == 0 for v in range(n) if v not in (s, t)):
            cost = sum(x * w for (*_, w), x in zip(edges, f))
            best = max(best, (net[t], -cost))
    return best[0], -best[1]

rng = random.Random(13)
for _ in range(300):
    k = rng.randint(1, 6)
    c = [[rng.randint(0, 20) for _ in range(k)] for _ in range(k)]
    edges, s, t = assignment(c)
    best = min(sum(c[i][p[i]] for i in range(k))
               for p in permutations(range(k)))
    assert mcmf(2 * k + 2, edges, s, t) == (k, best), c
moved = 0
for _ in range(300):
    n = rng.randint(2, 4)
    E = [(rng.randrange(n), rng.randrange(n),
          rng.randint(1, 2), rng.randint(0, 5))
         for _ in range(rng.randint(3, 7))]
    E = [e for e in E if e[0] != e[1]]
    got = mcmf(n, E, 0, n - 1)
    assert got == brute_flow(n, E, 0, n - 1), E
    moved += got[0] > 0
print("할당 300개, 일반 300개 비교: 모두 일치")
print("일반 중 유량이 있던 입력:", moved)
```
```text
할당 300개, 일반 300개 비교: 모두 일치
일반 중 유량이 있던 입력: 170
```
평행 간선과 역방향 간선이 섞인 작은 그래프에서도 유량과 최소 비용이 모두 맞았다.

## 더 빠르게: 포텐셜과 헝가리안 알고리즘
SPFA는 평균적으로 빠르지만 최악은 벨만-포드와 같은 O(VE)다. 위 불변식의 d를 정점의 **포텐셜**(potential) π로 두고 간선 비용을 `w + π(u) − π(v)`로 바꾸면 모든 잔여 간선의 비용이 0 이상이 되어, 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」를 쓸 수 있다. 다익스트라로 구한 거리를 π에 더해 다음 단계로 넘기면 된다. 이 포텐셜 기법은 에드몬즈와 카프(1972년 논문), 도미자와 노부아키(1971년)가 독립적으로 제안했다.

할당 문제 전용으로는 **헝가리안 알고리즘**(Hungarian algorithm)이 있다. 쿤(Harold Kuhn)이 1955년 발표하면서 쾨니그와 에게르바리(Jenő Egerváry)의 1931년 연구에 기댔다고 해서 이 이름을 붙였고, 먼크레스(James Munkres)가 1957년에 다듬었다. 처음 형태는 O(n⁴)였고 이후 O(n³) 구현이 나왔다. 본질은 위의 포텐셜 + 최단 증가 경로와 같은 쌍대 변수 조정이다.

## 자주 하는 실수와 변형
- 역간선 비용을 +w로 두면 되돌리기가 공짜가 아니라 비용을 또 내는 셈이 되어 답이 틀린다.
- 음수 간선이 있는 잔여 그래프에 포텐셜 없이 다익스트라를 쓰면 틀린다. 3편의 반례와 같은 이유다.
- 원래 그래프에 음수 사이클이 있으면 출발 상태부터 불변식이 깨진다. 음수 사이클을 찾아 돌리는 사이클 소거(cycle canceling) 방법이 필요하다.
- **정해진 양 K만 보내기**: 누적 유량이 K에 닿으면 마지막 증가량을 잘라 멈춘다.
- **최대 이익**: 비용 부호를 뒤집어 최소 비용으로 푼다. 유량을 꼭 최대로 할 필요가 없으면 경로 비용이 0 이상이 되는 순간 멈춘다.
- **수송 문제**: 공급지 → 수요지 운송비 최소화는 s → 공급지(공급량), 수요지 → t(수요량) 용량을 주면 된다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 순열 완전 탐색 | O(n!·n) | 할당 문제 |
| 최단 경로 반복 + SPFA | O(F·VE) | F = 최대 유량 값 |
| 포텐셜 + 다익스트라 | O(F·E log V) | 첫 거리만 벨만-포드 |
| 헝가리안 | O(n³) | 할당 문제 전용 |

증가 한 번에 유량이 1 이상 늘어 증가는 F번 이하다. 할당 문제는 F = n이고, 정점 2n + 2개, 간선 n² + 2n개다. 공간은 O(V + E)다.

## 어디에 쓰이나
- 신경망 레이어 9편 「전문가 혼합(MoE) 층」: 전문가마다 용량이 있는 토큰 배정은 용량 있는 할당 문제이고, BASE 층(2021년)은 라우팅을 전문가마다 같은 수의 토큰을 받는 선형 할당 문제로 풀어 균형을 강제했다.
- 정보 이론 3편 「KL 발산」: 두 분포의 차이를 재는 또 다른 방법인 바서슈타인 거리(earth mover's distance)는 이산 분포에서 한쪽 질량을 다른 쪽으로 옮기는 최소 비용 수송 문제, 곧 최소 비용 유량이다.
- 물체 검출 DETR(2020년): 예측한 상자들과 정답 상자들을 일대일로 짝짓는 이분 매칭 손실을 쓰며, 그 짝짓기가 할당 문제다.
- 3편 「벨만-포드: 음수 간선과 음수 사이클」: 음수 비용 역간선 때문에 그 글의 최단 경로 알고리즘과 음수 사이클 개념이 그대로 필요하다.

## 정리
- 최소 비용 최대 유량은 역간선에 −w를 붙인 잔여 그래프에서 가장 싼 증가 경로를 반복해 흘려 구한다.
- 음수 비용 역간선이 "배정을 내려놓고 옮기기"를 표현해, 탐욕의 실수가 저절로 고쳐진다.
- 최단 경로로만 흘리면 잔여 그래프에 음수 사이클이 생기지 않아 매 단계가 그 유량 값에서 최소 비용이다.
- 순열 완전 탐색과 유량 전수 조사 600개에서 모두 일치했고, 포텐셜을 쓰면 다익스트라로 빨라진다.

## 더 알아보기
- 이전 글: 12편 「이분 매칭: 증가 경로와 쾨니그 정리」
- 다음 글: 14편 「플로우로 모델링하기: 정점 분할, 프로젝트 선택, 하한 있는 유량」
- 헝가리안 알고리즘(위키백과 영어판): https://en.wikipedia.org/wiki/Hungarian_algorithm
