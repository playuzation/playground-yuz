# [심화 알고리즘 4/14] 병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기

> **한 줄 요약** — 질의를 미리 다 받을 수 있으면, 질의마다 따로 이분 탐색하지 않고 모든 질의의 mid를 정렬해 갱신을 한 번 훑으며 함께 판정하거나(병렬 이분 탐색), 시간 축을 반으로 나눠 앞 절반의 갱신이 뒤 절반의 질의에 주는 몫만 정적으로 계산하는(CDQ 분할 정복) 방식으로 훨씬 싸게 풀 수 있다.

## 이 글에서 다루는 것
- "언제 처음 조건을 만족하나"를 질의마다 묻는 문제와 병렬 이분 탐색
- 갱신 한 번 훑기로 여러 질의의 mid를 같이 판정하기
- CDQ 분할 정복: 3차원 지배 쌍 세기(정렬 + 분할 정복 + 펜윅 트리)
- 추가와 질의가 섞인 온라인 문제를 시간 축 분할 정복으로 오프라인화하기
- 각각의 무작위 대조와 연산 수 비교

## 예제 문제 1: 언제 처음 연결되나
정점 n개에 간선 m개가 순서대로 하나씩 추가된다. 질의 (u, v)마다 "앞에서부터 간선 몇 개를 넣었을 때 u와 v가 처음 연결되나"를 답한다(끝내 안 되면 −1). 한 번 연결되면 계속 연결되므로 답은 **단조**다. 알고리즘 기법 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」처럼 질의마다 t를 이분 탐색하면 되지만, "간선 t개를 넣은 상태"를 판정하려면 유니온 파인드(고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」)를 처음부터 다시 만들어야 해서 판정 한 번이 O(m)이다. 질의 q개면 O(q·m·log m)이다.

## 병렬 이분 탐색: 모든 질의를 한 단계씩 함께
판정의 비싼 부분, 즉 간선을 앞에서부터 넣어 가는 일은 모든 질의가 똑같이 한다. 그래서 질의마다 구간 [lo, hi]를 들고, 한 **단계**에서 모든 질의의 mid를 한꺼번에 처리한다.
- 아직 끝나지 않은 질의들을 mid 순서로 정렬한다.
- 유니온 파인드를 비우고 간선을 앞에서부터 넣다가, 다음 질의의 mid에 닿을 때마다 그 질의를 판정해 구간을 반으로 줄인다.
- 모든 질의의 구간이 한 점이 될 때까지 반복한다. 구간 길이가 매 단계 절반이라 단계는 ⌈log₂(m + 2)⌉개다.

단계마다 간선 m개를 한 번 훑고 질의 q개를 한 번 판정하므로 전체는 O((m + q)·log m·α(n))에 정렬 O(q log q·log m)이 더해진다. 일반화하면 O((갱신 수 + q)·log T·갱신 비용)이다(T는 답의 범위). 경시 프로그래밍에서 흔히 **병렬 이분 탐색**(parallel binary search)이라고 부른다.
```python
import random, bisect

class DSU:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)

def first_time_slow(n, edges, queries):     # 질의마다 간선을 하나씩 넣어 보기
    ans = []
    for u, v in queries:
        d, t = DSU(n), 0
        while d.find(u) != d.find(v) and t < len(edges):
            d.union(*edges[t]); t += 1
        ans.append(t if d.find(u) == d.find(v) else -1)
    return ans

def first_time_pbs(n, edges, queries):      # 병렬 이분 탐색
    m, q = len(edges), len(queries)
    lo, hi = [0] * q, [m + 1] * q           # 답 ∈ [lo, hi], m + 1 = 끝내 안 됨
    rounds = unions = 0
    while True:
        todo = sorted(((lo[i] + hi[i]) // 2, i)
                      for i in range(q) if lo[i] < hi[i])
        if not todo: break
        rounds += 1
        d, t = DSU(n), 0
        for mid, i in todo:                 # mid 순서로, 간선은 한 번만 훑는다
            while t < mid:
                d.union(*edges[t]); t += 1
            u, v = queries[i]
            if d.find(u) == d.find(v): hi[i] = mid
            else: lo[i] = mid + 1
        unions += t
    return [x if x <= m else -1 for x in lo], rounds, unions

edges = [(0, 1), (2, 3), (1, 2), (4, 5), (3, 4)]
queries = [(0, 3), (2, 3), (0, 5), (5, 6), (1, 1)]
print(first_time_slow(7, edges, queries))
print(first_time_pbs(7, edges, queries))
```
```text
[3, 2, 5, -1, 0]
([3, 2, 5, -1, 0], 3, 12)
```
0과 3은 간선 (1, 2)가 들어간 셋째에 처음 이어지고, 정점 6은 간선이 없어 −1이다. 질의 5개를 3단계, union 12번에 끝냈다.

## 대조 검사와 연산 수
앞 코드에 이어서, 작은 무작위 그래프 300개에서 느린 방법과 비교한다. 이어서 n = 2000, m = q = 4000에서 union 횟수를 센다. 질의마다 따로 이분 탐색하는 쪽은 실제로 돌리면 오래 걸리므로, 정답을 아는 상태에서 이분 탐색 경로만 흉내 내어 "간선 mid개를 처음부터 넣는" 비용을 더한다.
```python
rng = random.Random(4)
for _ in range(300):
    n, m, q = rng.randint(1, 8), rng.randint(0, 12), rng.randint(1, 10)
    E = [(rng.randrange(n), rng.randrange(n)) for _ in range(m)]
    Q = [(rng.randrange(n), rng.randrange(n)) for _ in range(q)]
    assert first_time_pbs(n, E, Q)[0] == first_time_slow(n, E, Q)
print("무작위 300개 비교: 모두 일치")

n, m, q = 2000, 4000, 4000
E = [(rng.randrange(n), rng.randrange(n)) for _ in range(m)]
Q = [(rng.randrange(n), rng.randrange(n)) for _ in range(q)]
ans, rounds, unions = first_time_pbs(n, E, Q)
naive = 0                                   # 질의마다 따로 이분 탐색했다면
for x in ans:
    a, lo, hi = (x if x >= 0 else m + 1), 0, m + 1
    while lo < hi:
        mid = (lo + hi) // 2; naive += mid  # 간선 mid개를 처음부터 넣기
        if mid >= a: hi = mid
        else: lo = mid + 1
print("단계", rounds, "병렬 이분 탐색 union", unions)
print("질의별 이분 탐색 union", naive)
```
```text
무작위 300개 비교: 모두 일치
단계 12 병렬 이분 탐색 union 43984
질의별 이분 탐색 union 92418881
```
단계 12번에 union 약 4.4만 번, 질의별로 하면 약 9,200만 번이다. 약 2,000배 차이다. 간선을 훑는 일을 질의 4,000개가 나눠 썼기 때문이다.

## 예제 문제 2: 추가와 질의가 섞인 2차원 개수
이번에는 "점 (x, y) 추가"와 "x′ ≤ x, y′ ≤ y인 점이 지금까지 몇 개인가"가 섞여 들어온다. 온라인으로 풀려면 2차원 펜윅 트리(좌표 범위의 제곱만큼 메모리)나 트리 안의 트리가 필요하다. 그런데 질의를 미리 다 받는다면 **시간**을 세 번째 좌표로 보면 된다. 질의 i의 답은 "시각 < i, x′ ≤ x, y′ ≤ y인 추가의 개수", 곧 **3차원 지배**(dominance) 쌍 세기다. 반대로 3차원 점 (a, b, c)에서 "a가 작고 b, c가 같거나 작은 점 수"를 세는 문제는 a로 정렬해 a를 시간으로 쓰면 이 문제가 된다.

## CDQ 분할 정복: 시간 축을 반으로
사건 열을 시간의 가운데에서 둘로 나눈다. 어떤 추가 j와 질의 i(j < i)의 쌍은 재귀의 어느 한 층에서 정확히 한 번 "j는 왼쪽 절반, i는 오른쪽 절반"으로 갈라진다. 그래서 각 층에서는 **왼쪽 절반의 추가가 오른쪽 절반의 질의에 주는 몫**만 더하면 된다. 이 몫을 셀 때는 시간 조건이 이미 만족되었으므로 남은 것은 정적인 2차원 문제다. 추가와 질의를 x로 정렬해 쓸면서(알고리즘 기법 10편 「좌표 압축과 스위핑: 정렬해 놓고 한 방향으로 쓸기」) y를 고급 자료 구조 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」에 넣고 빼면 된다. 층마다 O(n log n)이고 층이 log n개라 전체 O(n log² n)이다.

이 이름은 중국 경시 프로그래밍계에서 천단치(Danqi Chen)의 별명 CDQ를 따서 붙인 것이다. 앞 코드에 이어서 실행한다.
```python
def cdq(events):                    # (0, x, y) = 점 추가, (1, x, y) = 질의
    ys = sorted({y for _, _, y in events})
    yr = [bisect.bisect_left(ys, y) + 1 for _, _, y in events]
    bit, ans, ops = [0] * (len(ys) + 1), [0] * len(events), [0]
    def add(i, v):
        while i < len(bit): bit[i] += v; i += i & -i; ops[0] += 1
    def pre(i):
        s = 0
        while i: s += bit[i]; i -= i & -i; ops[0] += 1
        return s
    def solve(lo, hi):              # [lo, mid)의 추가 → [mid, hi)의 질의
        if hi - lo <= 1: return
        mid = (lo + hi) // 2
        solve(lo, mid); solve(mid, hi)
        adds = sorted((events[i][1], yr[i]) for i in range(lo, mid)
                      if events[i][0] == 0)
        asks = sorted((events[i][1], yr[i], i) for i in range(mid, hi)
                      if events[i][0] == 1)
        j = 0
        for x, y, i in asks:        # x 순서로 쓸며 y는 펜윅 트리로
            while j < len(adds) and adds[j][0] <= x:
                add(adds[j][1], 1); j += 1
            ans[i] += pre(y)
        for k in range(j): add(adds[k][1], -1)      # 넣은 것만 되돌리기
    solve(0, len(events))
    return ans, ops[0]

def brute(events):                  # 정의 그대로 O(n²)
    return [sum(k2 == 0 and x2 <= x and y2 <= y for k2, x2, y2 in events[:i])
            if k == 1 else 0 for i, (k, x, y) in enumerate(events)]

def dominance(points):              # 3차원 점, 첫 좌표는 모두 다르다
    ev = []
    for a, b, c in sorted(points):  # a를 시간으로: 먼저 묻고 그다음 추가
        ev += [(1, b, c), (0, b, c)]
    return cdq(ev)[0][::2]

rng = random.Random(5)
for _ in range(300):
    ev = [(rng.randrange(2), rng.randrange(6), rng.randrange(6))
          for _ in range(rng.randint(1, 40))]
    assert cdq(ev)[0] == brute(ev)
    P = sorted((a, rng.randrange(5), rng.randrange(5))
               for a in rng.sample(range(100), rng.randint(1, 30)))
    assert dominance(P) == [sum(q[0] < p[0] and q[1] <= p[1] and q[2] <= p[2]
                                for q in P) for p in P]
print("섞인 연산 300개, 3차원 점 300개 비교: 모두 일치")
n = 4000
ev = [(rng.randrange(2), rng.randrange(10**6), rng.randrange(10**6))
      for _ in range(n)]
print("펜윅 칸 접근", cdq(ev)[1], "모든 쌍 비교", n * (n - 1) // 2)
```
```text
섞인 연산 300개, 3차원 점 300개 비교: 모두 일치
펜윅 칸 접근 190509 모든 쌍 비교 7998000
```
좌표를 0~5로 좁혀 같은 x·y가 자주 겹치게 했는데도 모두 맞았다. 사건 4,000개에서 펜윅 트리 칸 접근은 약 19만 번으로(정렬 비용 제외), 모든 쌍을 보는 약 800만 번의 40분의 1쯤이다.

## 자주 하는 실수와 변형
- 병렬 이분 탐색은 판정이 단조여야 한다. "t개 넣었을 때 정확히 k개 요소" 같은 비단조 조건에는 쓸 수 없다.
- 단계마다 상태(유니온 파인드)를 처음부터 다시 만들어야 한다. 이전 단계 상태를 이어 쓰면 틀린다. 끝내 안 되는 경우를 위해 hi를 m + 1로 잡는다.
- CDQ에서 펜윅 트리를 통째로 0으로 초기화하면 층마다 O(좌표 수)가 들어 복잡도가 깨진다. 넣은 칸만 되돌린다.
- 같은 x에서는 추가가 질의보다 먼저 반영되어야 "≤"가 맞는다. 위 코드는 `adds[j][0] <= x`로 처리했다. 3차원에서 완전히 같은 점이 있으면 묶어서 개수로 다룬다.
- 답이 앞쪽 답에 의존하는 DP(예: 3차원 최장 증가 부분 수열)는 순서를 바꾼다. 왼쪽을 먼저 풀고, 왼쪽 → 오른쪽 기여를 반영한 다음 오른쪽을 푼다.

## 복잡도
| 문제 | 오프라인 기법 | 단순한 방법 |
|---|---|---|
| 처음 연결 시각 | O((m + q) log m·α) | O(q·m·log m) |
| 섞인 2차원 개수 | O(n log² n) | O(n²) |
| 3차원 지배 쌍 | O(n log² n) | O(n²) |

- 병렬 이분 탐색: 단계 ⌈log₂(m + 2)⌉개 × (간선 m개 + 질의 q개), 단계마다 질의 정렬 O(q log q). 공간 O(n + m + q).
- CDQ: 재귀 깊이 log n × 층마다 정렬과 펜윅 연산 O(n log n). 공간 O(n).

## 어디에 쓰이나
- 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」: 그 글의 역순 쌍 세기가 "왼쪽 절반이 오른쪽 절반에 주는 몫"을 세는 2차원 지배 쌍 세기이고, CDQ는 여기에 차원 하나를 펜윅 트리로 더한 것이다.
- 알고리즘 기법 13편 「제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게」: 질의를 미리 받아 처리 순서를 바꾼다는 오프라인 발상이 같다.
- 5편 「오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드」: 다음 글도 시간 축을 분할 정복하지만, 갱신이 삭제까지 있어 "되돌리기"가 필요하다.

## 정리
- 판정이 단조이고 질의를 미리 받을 수 있으면, 모든 질의의 mid를 정렬해 갱신을 단계마다 한 번 훑는다. union이 9,200만 번에서 4.4만 번으로 줄었다.
- CDQ는 시간 축을 반으로 나눠 왼쪽 갱신 → 오른쪽 질의 몫만 정적으로 세며, 섞인 온라인 문제를 차원 하나 높은 정적 문제로 바꾼다.
- 3차원 지배 쌍은 정렬 + 분할 정복 + 펜윅 트리로 O(n log² n)이다.
- 두 기법 모두 느린 정답과 무작위 대조로 확인했다.

## 더 알아보기
- 이전 글: 3편 「웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에」
- 다음 글: 5편 「오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드」
