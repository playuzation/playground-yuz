# [심화 알고리즘 12/14] 전역 최소 컷: 스토어-바그너와 카거의 무작위 축약

> **한 줄 요약** — 무방향 그래프를 두 덩어리로 가르는 가장 가벼운 간선 묶음은 s-t 최소 컷을 V − 1번 구하지 않아도, 최대 인접 순서의 마지막 두 정점을 합치기를 반복하는 스토어-바그너로 O(V³)에 정확히 구하거나, 무작위 간선 축약을 성공 확률 2/(n(n − 1)) 이상인 시도로 보고 충분히 반복하는 카거 알고리즘으로 높은 확률로 구한다.

## 이 글에서 다루는 것
- 전역 최소 컷 문제와 s-t 최소 컷을 여러 번 푸는 단순한 방법
- 스토어-바그너: 최대 인접 순서와 "단계의 컷"
- 카거의 무작위 축약: 성공 확률 하한을 실험으로 재고 반복 횟수 정하기
- 모든 정점 분할 전수와의 대조, 카거-스타인

## 예제 문제: 가장 약한 곳 찾기
정점은 서버, 간선은 회선, 가중치는 회선 수다. 네트워크를 두 덩어리로 끊으려면 최소 몇 회선을 끊어야 할까?
```text
덩어리 A:
  0─1:3 0─2:2 1─2:2
  1─3:2 2─3:3 0─3:1
덩어리 B:
  4─5:3 4─6:2 5─6:2
  5─7:2 6─7:3 4─7:1
다리:
  3─4:1 2─5:1
```
정점 집합을 S와 나머지로 나눌 때 사이를 잇는 간선 가중치의 합이 가장 작은 것을 **전역 최소 컷**(global minimum cut)이라 한다. 여기서는 A와 B 사이의 다리 두 개, 값 2다. 정점 분할은 2ⁿ⁻¹ − 1가지다. 다른 방법은 그래프 알고리즘 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」를 쓰는 것이다. 정점 s를 하나 고정하면 전역 최소 컷은 s와 어떤 t를 가르므로, t를 바꿔 가며 s-t 최대 유량을 V − 1번 구해 최솟값을 고르면 된다. 맞지만 유량 계산이 V − 1번이다.

## 스토어-바그너: 최대 인접 순서
스토어(Mechthild Stoer)와 바그너(Frank Wagner)가 1997년 J. ACM 논문 「A Simple Min-Cut Algorithm」에서 낸 방법은 유량을 전혀 쓰지 않는다. 한 **단계**(phase)는 이렇다.
1. 아무 정점 하나로 집합 A를 시작한다.
2. A 밖에서 A와의 연결 가중치 합이 가장 큰 정점을 A에 넣기를 반복한다(최대 인접 순서).
3. 마지막에 들어간 두 정점을 s, t라 하면, t 혼자와 나머지 사이의 컷이 **단계의 컷**이다. 그 값은 t가 들어갈 때의 연결 세기다.
4. s와 t를 한 정점으로 합친다(간선 가중치를 더한다).

핵심 보조정리는 **단계의 컷이 s-t 최소 컷**이라는 것이다. 순서를 따라가며 임의의 s-t 컷 C의 양쪽이 바뀌는 정점마다 그 정점의 연결 세기가 C의 일부로 덮인다는 것을 귀납으로 보이면, 마지막 정점 t에서 단계의 컷 ≤ C가 된다. 그러면 전역 최소 컷은 s와 t를 가르거나(이번 단계의 컷이 그것) 가르지 않는다(s, t를 합쳐도 사라지지 않음). V − 1단계의 단계 컷 중 최솟값이 답이다.
```python
INF = float("inf")

def stoer_wagner(n, w):                   # w: n×n 대칭 가중치 행렬
    w = [row[:] for row in w]
    group = [[v] for v in range(n)]       # 정점 v에 합쳐진 원래 정점들
    alive, best, best_side, cuts = list(range(n)), INF, None, []
    while len(alive) > 1:                 # 단계 한 번 = 정점 하나 줄이기
        conn = {v: 0 for v in alive}      # 지금까지 고른 집합 A와의 연결 세기
        order, inA = [], set()
        while len(order) < len(alive):    # 최대 인접 순서
            v = max((u for u in alive if u not in inA),
                    key=lambda u: conn[u])
            order.append(v); inA.add(v)
            for u in alive:
                conn[u] += w[v][u]
        s, t = order[-2], order[-1]
        cuts.append(conn[t])              # 이 단계의 컷: t 혼자 대 나머지
        if conn[t] < best:
            best, best_side = conn[t], sorted(group[t])
        for u in alive:                   # t를 s에 합친다
            if u not in (s, t):
                w[s][u] += w[t][u]; w[u][s] = w[s][u]
        group[s] += group[t]
        alive.remove(t)
    return best, best_side, cuts

def brute_cut(n, w):                      # 0이 들어간 쪽 S를 모두 본다
    best = INF
    for mask in range(1 << (n - 1)):
        S = {0} | {v for v in range(1, n) if mask >> (v - 1) & 1}
        if len(S) < n:
            best = min(best, sum(w[a][b] for a in S
                                 for b in range(n) if b not in S))
    return best

edges = [(0, 1, 3), (0, 2, 2), (1, 2, 2), (1, 3, 2), (2, 3, 3), (0, 3, 1),
         (4, 5, 3), (4, 6, 2), (5, 6, 2), (5, 7, 2), (6, 7, 3), (4, 7, 1),
         (3, 4, 1), (2, 5, 1)]
n = 8
w = [[0] * n for _ in range(n)]
for a, b, c in edges:
    w[a][b] += c; w[b][a] += c
best, side, cuts = stoer_wagner(n, w)
print("최소 컷", best, "한쪽", side, "/ 전수", brute_cut(n, w))
print("단계별 컷", cuts)
```
```text
최소 컷 2 한쪽 [4, 5, 6, 7] / 전수 2
단계별 컷 [6, 7, 7, 2, 7, 7, 6]
```
4번째 단계에서 덩어리 B 전체가 합쳐진 정점이 t가 되어 값 2가 나왔다. 한 단계는 정점마다 최댓값 찾기 O(V)와 연결 세기 갱신 O(V)라 O(V²)이고, 단계가 V − 1번이라 O(V³)이다.

## 카거: 아무 간선이나 합치기
카거(David Karger)의 1993년 알고리즘은 더 단순하다. 무작위로 고른 간선의 두 끝을 한 정점으로 합치고(평행 간선은 남기고 자기 고리는 버린다), 정점이 2개 남으면 남은 간선을 컷으로 낸다. 최소 컷 값을 k라 하면 모든 정점의 차수가 k 이상이라 정점 i개일 때 간선이 ik/2개 이상이고, 특정 최소 컷의 간선을 고를 확률은 2/i 이하다. 그 컷이 끝까지 살아남을 확률은 다음과 같다.
```text
P(특정 최소 컷이 살아남음)
 ≥ (1 − 2/n)(1 − 2/(n−1))…(1 − 2/3)
 = (n−2)/n · (n−3)/(n−1) ⋯ 1/3
 = 2/(n(n−1))
```
한 번의 성공 확률은 작지만, T번 반복해 최솟값을 고르면 실패 확률이 `(1 − p)ᵀ ≤ e^(−pT)`다. `T = n(n − 1)/2 · ln(1/δ)`번이면 실패 확률이 δ 이하다. 구현은 간선을 무작위 순서로 섞어 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」로 합치는 것이다. 이미 합쳐진 쌍을 건너뛰면 매번 남은 간선 중 하나를 고르게 고르는 것과 같다. 가중치는 그 수만큼 겹친 간선으로 바꾼다. 앞 코드에 이어서 실행한다.
```python
import math, random

def karger_once(n, multi, rng):           # 무작위 간선 축약을 정점 2개까지
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    groups = n
    for a, b in rng.sample(multi, len(multi)):   # 무작위 순서 = 무작위 축약
        if groups == 2:
            break
        ra, rb = find(a), find(b)
        if ra != rb:                      # 이미 합쳐진 쌍(자기 고리)은 건너뜀
            parent[ra] = rb; groups -= 1
    cut = sum(find(a) != find(b) for a, b in multi)
    return cut, frozenset(v for v in range(n) if find(v) == find(0))

multi = [(a, b) for a, b, c in edges for _ in range(c)]  # 가중치만큼 겹친 간선
rng, trials = random.Random(12), 20000
bound = 2 / (n * (n - 1))
hit = sum(karger_once(n, multi, rng)[0] == best for _ in range(trials))
print(f"예제 성공률 {hit / trials:.4f}, 하한 2/(n(n−1)) = {bound:.4f}")
cycle = [(v, (v + 1) % n) for v in range(n)]     # 원형: 최소 컷이 28개
want = frozenset({0, 1, 2, 3})
hit = sum(karger_once(n, cycle, rng)[1] == want
          for _ in range(trials))
print(f"원형에서 특정 컷 하나가 나올 확률 {hit / trials:.4f}")
T = math.ceil(math.log(100) / bound)     # 실패 확률 1% 이하가 되는 반복 수
fail = sum(min(karger_once(n, multi, rng)[0] for _ in range(T)) != best
           for _ in range(500))
print("반복", T, "번씩 500회 중 실패", fail)
```
```text
예제 성공률 0.4543, 하한 2/(n(n−1)) = 0.0357
원형에서 특정 컷 하나가 나올 확률 0.0347
반복 129 번씩 500회 중 실패 0
```
예제의 성공률은 0.45로 하한 0.036보다 훨씬 높다. 덩어리 안 간선이 많아 다리가 뽑힐 일이 적기 때문이다. 반면 원형 그래프에서는 특정 컷 하나가 나올 확률이 0.035로 하한 1/28 ≈ 0.0357에 거의 붙는다. 원형 그래프는 간선 두 개를 고르는 28가지가 모두 최소 컷이라, 하한이 정확한 경우다. 여기서 따름정리도 나온다. 서로 다른 최소 컷이 나오는 사건은 서로 배타적이므로 최소 컷은 많아야 n(n − 1)/2개다. 1%를 목표로 129번씩 반복하니 500회 모두 성공했다.

## 무작위 대조 검사
앞 코드에 이어서, 연결된 무작위 가중치 그래프 300개(정점 2~10개)에서 모든 분할을 본 값과 비교한다. 카거는 실패 확률 1% 이하가 되는 T번씩 반복한다.
```python
rng = random.Random(7)
ok_sw = ok_k = 0
for _ in range(300):
    n = rng.randint(2, 10)
    w = [[0] * n for _ in range(n)]
    for v in range(1, n):                 # 연결되게 무작위 트리부터
        u, c = rng.randrange(v), rng.randint(1, 3)
        w[u][v] += c; w[v][u] += c
    for _ in range(rng.randint(0, 2 * n)):
        a, b = rng.sample(range(n), 2)
        c = rng.randint(1, 3)
        w[a][b] += c; w[b][a] += c
    exact = brute_cut(n, w)
    ok_sw += stoer_wagner(n, w)[0] == exact
    multi = [(a, b) for a in range(n) for b in range(a + 1, n)
             for _ in range(w[a][b])]
    T = math.ceil(math.log(100) * n * (n - 1) / 2)
    ok_k += min(karger_once(n, multi, rng)[0] for _ in range(T)) == exact
print(f"무작위 300개: 스토어-바그너 {ok_sw}개, 카거(T회 반복) {ok_k}개 일치")
```
```text
무작위 300개: 스토어-바그너 300개, 카거(T회 반복) 300개 일치
```
처음 짠 카거는 "정점 2개면 멈춤" 검사를 합친 직후에만 해서, 정점이 처음부터 2개인 그래프에서 둘을 합쳐 컷 0을 냈다. 300개 중 38개가 틀렸고, 검사를 축약 전으로 옮겨 모두 맞았다. 작은 경계 입력이 섞인 대조 검사가 이런 실수를 잡는다.

## 카거-스타인과 변형
- **카거-스타인**(1996): 축약 초반에는 최소 컷이 거의 깨지지 않고 끝에 가서 위험해진다. 그래서 n/√2 정도까지만 축약한 그래프를 두 번 독립적으로 재귀해 좋은 쪽을 고른다. 한 번에 O(n² log n), 성공 확률 Ω(1/log n)이다.
- 가중치가 크면 겹친 간선으로 펼칠 수 없다. 간선을 가중치에 비례하는 확률로 고르면 된다.
- 스토어-바그너에서 합친 가중치를 행과 열 양쪽에 반영하지 않으면 비대칭이 되어 틀린다.
- 방향 그래프에는 스토어-바그너를 그대로 쓸 수 없다. 대칭성을 쓰는 증명이기 때문이다.
- 최소 컷에 실제 정점 분할이 필요하면, 합칠 때마다 원래 정점 목록을 따라 합쳐 둔다(`group`).

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 분할 전수 | O(2ⁿ·E) | n ≤ 20 |
| s-t 컷 V − 1번 | 유량 V − 1번 | 디닉 등 |
| 스토어-바그너 | O(V³) | 배열 구현 |
| 카거 1번 | O(E·α) | 성공 ≥ 2/(n(n−1)) |
| 카거 T번 | O(n²·E·log(1/δ)) | 실패 ≤ δ |

스토어-바그너는 우선순위 큐를 쓰면 O(VE + V² log V)다. 공간은 배열 구현이 O(V²), 카거가 O(V + E)다.

## 어디에 쓰이나
- 그래프 알고리즘 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」: s-t 최소 컷은 최대 유량과 같고, 전역 최소 컷은 그것을 V − 1번 부르는 대신 합치기만으로 같은 답을 낸다.
- 그래프 알고리즘 8편 「단절점과 단절선: 끊으면 갈라지는 곳 찾기」: 단절선이 있는 것은 가중치 1인 그래프의 최소 컷이 1인 것과 같고, 최소 컷 값은 "몇 개를 끊어야 갈라지나"(간선 연결도)로 이를 일반화한다.
- 알고리즘 기법 14편 「무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기」: 카거 알고리즘은 틀릴 수 있는 몬테카를로 알고리즘이고, 독립 반복으로 실패 확률을 지수적으로 줄이는 전형이다.

## 정리
- 전역 최소 컷은 s를 고정하고 s-t 컷을 V − 1번 구해도 되지만, 스토어-바그너는 유량 없이 O(V³)에 구한다.
- 최대 인접 순서의 마지막 두 정점 사이에서는 단계의 컷이 s-t 최소 컷이라, 기록하고 합쳐도 안전하다.
- 카거 축약 한 번은 성공 확률이 2/(n(n − 1)) 이상이고, 원형 그래프에서 실험값이 이 하한에 붙었다.
- 분할 전수와 300개를 비교해 두 알고리즘이 모두 맞았고, 그 과정에서 멈춤 조건 실수를 잡았다.

## 더 알아보기
- 이전 글: 11편 「지배자 트리: 반드시 거쳐 가는 정점 찾기」
- 다음 글: 13편 「선형 점화식: 벌레캄프-매시와 키타마사」
- Karger's algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Karger%27s_algorithm
