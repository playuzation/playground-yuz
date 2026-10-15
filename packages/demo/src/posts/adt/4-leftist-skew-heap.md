# [추상 데이터 타입 심화 4/21] 병합 가능한 힙: 레프티스트 힙과 스큐 힙

> **한 줄 요약** — 두 우선순위 큐를 합치는 meld가 필요하면 배열 힙은 O(n)이 들지만, 오른쪽 척추를 짧게 유지하는 레프티스트 힙이나 무조건 좌우를 바꾸는 스큐 힙은 오른쪽 경로끼리만 합쳐 O(log n)(스큐 힙은 분할 상환)에 끝낸다.

## 이 글에서 다루는 것
- meld가 필요한 문제와 배열 이진 힙의 한계
- 레프티스트 힙: 널 경로 길이와 짧은 오른쪽 척추
- 스큐 힙: 무조건 바꾸기와 분할 상환 O(log n)
- 무작위 대조와 오른쪽 척추 길이·합치기 단계 실험

## 예제 문제: 서브트리마다 예산 안에서 최대 인원
회사 조직도가 트리로 주어지고 사람마다 비용이 있다. 정점마다 "그 서브트리에서 비용 합이 B 이하가 되게 가장 많이 뽑으면 몇 명인가"를 구한다. 한 서브트리만 보면 싼 사람부터 담으면 되지만 정점마다 정렬하면 O(n² log n)이다. 아래에서 위로 올라가며 자식 서브트리의 후보들을 **최대 힙**으로 들고 있다가, 부모에서 자식들의 힙을 합치고 합이 B를 넘는 동안 가장 비싼 사람을 빼면 된다. 한 번 빠진 사람은 위에서도 다시 뽑힐 일이 없다. 필요한 연산은 넣기, 최댓값 꺼내기, 그리고 두 힙을 합치는 **meld**다. 이 셋을 지원하는 ADT가 **병합 가능한 힙**(mergeable heap)이다.

## 배열 힙은 왜 느린가
고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」의 배열 힙은 모양이 완전 이진 트리로 고정되어 있어서, 두 힙을 합치려면 배열을 이어 붙이고 heapify를 다시 해야 한다. 크기 n, m이면 O(n + m)이다. 작은 쪽 원소를 큰 쪽에 하나씩 넣으면 원소마다 "작은 쪽"에 속하는 횟수가 log n 이하라 전체 O(n log² n)까지 줄지만, 힙 하나의 meld는 여전히 작은 쪽 크기에 비례한다.

## 아이디어: 오른쪽 경로끼리만 합치기
포인터로 연결한 힙 순서 이진 트리(부모 ≤ 자식)라면 모양이 자유롭다. 두 트리 a, b를 합칠 때 루트가 작은 쪽(a라 하자)이 새 루트가 되고, a의 왼쪽 서브트리는 그대로 두고 **a의 오른쪽 서브트리와 b를 재귀로 합친다**. 비용은 두 트리의 **오른쪽 척추**(루트에서 오른쪽으로만 내려간 경로) 길이의 합이다. 넣기는 노드 하나와의 meld, 최솟값 꺼내기는 루트의 두 자식끼리의 meld다. 남은 일은 오른쪽 척추를 짧게 유지하는 것이다.

**레프티스트 힙**(leftist heap)은 1972년 크레인(Clark A. Crane)의 박사 논문에서 나왔다. 노드마다 **널 경로 길이** `s(x)`(가장 가까운 빈자리까지 내려가는 노드 수)를 두고 모든 노드에서 `s(왼쪽) ≥ s(오른쪽)`을 지킨다. 그러면 s(x)가 곧 x의 오른쪽 척추 길이이고, s(x) = r인 서브트리는 위쪽 r층이 꽉 차 있어 노드가 2ʳ − 1개 이상이다. 따라서 **오른쪽 척추**가 log₂(n + 1) 이하이고 meld가 최악 O(log n)이다. 합친 뒤 경로를 되짚으며 s가 뒤집힌 노드만 좌우를 바꾼다.

**스큐 힙**(skew heap, 슬리터·타잔 1986)은 s를 버리고 합치기 경로의 모든 노드에서 **무조건** 좌우를 바꾼다. 한 번의 meld는 O(n)일 수 있지만 분할 상환 O(log n)이다. 오른쪽 서브트리가 왼쪽보다 큰 노드를 "무거운" 노드라 하고 퍼텐셜을 그 개수로 둔다. 경로 위의 가벼운 노드는 내려갈 때마다 크기가 절반 이하로 줄어 log₂ n개 이하이고(그래서 새로 무거워지는 노드도 그만큼뿐이다), 무거운 노드는 바꾸고 나면 가벼워져 퍼텐셜이 하나씩 줄면서 자기 비용을 갚는다.
```python
import random

class Node:
    __slots__ = ("key", "left", "right", "s")
    def __init__(self, key):
        self.key, self.left, self.right, self.s = key, None, None, 1

STEPS = [0]                          # 합치기 경로에서 거친 노드 수
def s(t): return t.s if t else 0

def leftist_merge(a, b):
    if not a or not b: return a or b
    STEPS[0] += 1
    if b.key < a.key: a, b = b, a
    a.right = leftist_merge(a.right, b)
    if s(a.left) < s(a.right): a.left, a.right = a.right, a.left
    a.s = s(a.right) + 1
    return a

def skew_merge(a, b):                # 재귀 대신 반복문(경로가 길 수 있다)
    if not a or not b: return a or b
    if b.key < a.key: a, b = b, a
    root = a
    while True:
        STEPS[0] += 1
        a.left, a.right = a.right, a.left        # 무조건 바꾼다
        if a.left is None:
            a.left = b; return root
        if b.key < a.left.key: a.left, b = b, a.left
        a = a.left

def team_sizes(parent, cost, budget, merge):   # parent[v] < v
    n = len(parent)
    heap, total, cnt = [None] * n, [0] * n, [0] * n
    for v in reversed(range(n)):     # 자식이 먼저 끝난다
        heap[v] = merge(heap[v], Node(-cost[v]))  # 키를 음수로: 최대 힙
        total[v] += cost[v]; cnt[v] += 1
        while total[v] > budget:     # 가장 비싼 사람을 뺀다
            h = heap[v]
            total[v] += h.key; cnt[v] -= 1
            heap[v] = merge(h.left, h.right)
        p = parent[v]
        if p >= 0:                   # 부모에 합친다
            heap[p] = merge(heap[p], heap[v])
            total[p] += total[v]; cnt[p] += cnt[v]
    return cnt

def brute(parent, cost, budget):     # 서브트리를 모아 싼 순서로 담기
    n, ans = len(parent), []
    for v in range(n):
        sub = []
        for u in range(n):
            w = u
            while w > v: w = parent[w]
            if w == v: sub.append(cost[u])
        t = c = 0
        for x in sorted(sub):
            if t + x > budget: break
            t, c = t + x, c + 1
        ans.append(c)
    return ans

par, cost = [-1, 0, 0, 1, 1, 2], [4, 3, 5, 2, 6, 1]
print(team_sizes(par, cost, 9, leftist_merge))
rng, ok = random.Random(1), 0
for _ in range(300):
    n = rng.randint(1, 30)
    par = [-1] + [rng.randrange(v) for v in range(1, n)]
    cost = [rng.randint(1, 20) for _ in range(n)]
    B = rng.randint(1, 60)
    want = brute(par, cost, B)
    ok += all(team_sizes(par, cost, B, m) == want
              for m in (leftist_merge, skew_merge))
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
[3, 2, 2, 1, 1, 1]
무작위 300개 비교: 300개 일치
```
루트 0의 서브트리는 비용이 4, 3, 5, 2, 6, 1이고 B = 9 안에 1 + 2 + 3을 담아 3명이다.

## 모델 기반 무작위 검사
앞 코드에 이어서, 힙 네 개에 넣기·꺼내기·합치기를 섞어 넣고 파이썬 리스트(꺼낼 때 `min`)와 비교한다. 매 연산 뒤 힙 순서, 레프티스트 힙이면 s 값과 `s(왼쪽) ≥ s(오른쪽)`, 노드 수를 검사한다.
```python
class MeldHeap:
    def __init__(self, merge): self.merge, self.root, self.n = merge, None, 0
    def push(self, x):
        self.root = self.merge(self.root, Node(x)); self.n += 1
    def pop(self):
        t = self.root
        self.root = self.merge(t.left, t.right); self.n -= 1
        return t.key
    def meld(self, other):           # other는 빈 힙이 된다
        self.root = self.merge(self.root, other.root)
        self.n += other.n
        other.root, other.n = None, 0

def check(t, leftist):               # 불변식 검사 후 노드 수를 돌려준다
    if t is None: return 0
    for c in (t.left, t.right):
        assert c is None or not c.key < t.key
    if leftist:
        assert s(t.left) >= s(t.right) and t.s == s(t.right) + 1
    return 1 + check(t.left, leftist) + check(t.right, leftist)

rng, ok = random.Random(4), 0
for case in range(500):
    for merge, lf in ((leftist_merge, True), (skew_merge, False)):
        hs = [MeldHeap(merge) for _ in range(4)]
        ref, same = [[] for _ in range(4)], True
        for _ in range(100):
            i, j, r = rng.randrange(4), rng.randrange(4), rng.random()
            if r < 0.5:
                x = rng.randrange(50); hs[i].push(x); ref[i].append(x)
            elif r < 0.8 and ref[i]:
                m = min(ref[i]); ref[i].remove(m)
                same &= hs[i].pop() == m
            elif i != j:
                hs[i].meld(hs[j]); ref[i] += ref[j]; ref[j] = []
            same &= all(check(h.root, lf) == h.n == len(q)
                        for h, q in zip(hs, ref))
        ok += same
print(f"무작위 500×2개 비교: {ok}개 일치")
```
```text
무작위 500×2개 비교: 1000개 일치
```

## 척추 길이와 합치기 단계 세기
앞 코드에 이어서, 키 2¹⁶ − 1개를 증가·교대(마지막에 큰 값 하나)·무작위 순서로 넣은 뒤 전부 꺼내며 오른쪽 척추 길이, 연산당 합치기 단계, 한 연산의 최대 단계를 센다.
```python
def spine(t):
    k = 0
    while t: k, t = k + 1, t.right
    return k

def run(merge, keys):
    h, worst, avg = MeldHeap(merge), 0, []
    for phase in (0, 1):
        STEPS[0] = 0
        for x in keys:
            before = STEPS[0]
            h.push(x) if phase == 0 else h.pop()
            worst = max(worst, STEPS[0] - before)
        avg.append(STEPS[0] / len(keys))
        if phase == 0: sp = spine(h.root)
    return sp, avg[0], avg[1], worst

n = 2**16 - 1
orders = [("증가", list(range(n))),
          ("교대", [x if x % 2 else -x for x in range(n - 1)] + [n]),
          ("무작위", random.Random(7).sample(range(n), n))]
print("척추  넣기  꺼내기  최대  힙, 순서")
for name, keys in orders:
    for merge, hn in ((leftist_merge, "레프티스트"), (skew_merge, "스큐")):
        sp, a, b, w = run(merge, keys)
        print(f"{sp:4} {a:5.1f} {b:7.1f} {w:5}  {hn}, {name}")
```
```text
척추  넣기  꺼내기  최대  힙, 순서
  16  14.0    16.6    29  레프티스트, 증가
  16  14.0    16.6    29  스큐, 증가
   2   1.0     1.0     2  레프티스트, 교대
   2   1.5     1.5 32767  스큐, 교대
   9   8.7    16.5    22  레프티스트, 무작위
  13  10.0    16.3    30  스큐, 무작위
```
레프티스트 힙은 세 순서 모두 척추가 log₂(n + 1) = 16 이하이고 한 연산이 29단계를 넘지 않았다(이론상 한도는 두 척추의 합 32). 스큐 힙은 0, 1, −2, 3, −4, …처럼 교대로 넣으면 오른쪽 척추가 n/2까지 길어지고, 그 뒤 큰 값 하나를 넣는 연산이 그 척추 32,767단계를 다 걷는다(걷고 나면 척추가 왼쪽으로 넘어가 표에는 2로 나온다). 그래도 넣기 평균은 1.5단계다. 척추를 늘리는 동안 연산마다 아낀 비용을 한 번에 쓰는 것이 분할 상환이다. 무작위 순서에서는 둘 다 꺼내기가 16단계 남짓이다.

## 자주 하는 실수와 변형
- 레프티스트 힙에서 합친 뒤 s를 다시 계산하지 않기: 순서는 맞아 대조 검사를 통과하지만 척추가 길어져 O(n)이 된다. 불변식 검사가 잡는다.
- 스큐 힙을 재귀로 짜기: 한 번의 경로가 O(n)일 수 있어 재귀 한도를 넘는다.
- 최대 힙이 필요하면 키를 음수로 넣는다. 예제의 `t += h.key`가 그 흔적이다.
- 변형: 루트에 "서브트리 전체에 c를 더하라"는 지연 표시를 두면 합치기 전에 내려보내며 트리 DP의 일괄 갱신을 처리한다. 경로 복사로 퍼시스턴트하게 만들면 옛 힙을 그대로 두고 새 힙을 O(log n) 노드로 만든다(19편).

## 복잡도
| 연산 | 레프티스트 힙 | 스큐 힙 | 배열 이진 힙 |
|---|---|---|---|
| meld | O(log n) | 상각 O(log n) | O(n + m) |
| 넣기 | O(log n) | 상각 O(log n) | O(log n) |
| 최솟값 꺼내기 | O(log n) | 상각 O(log n) | O(log n) |
| 노드당 추가 정보 | s 값 | 없음 | 없음(배열) |

- 레프티스트 힙은 오른쪽 척추 ≤ log₂(n + 1)이 근거이고, 스큐 힙은 무거운 노드 수를 퍼텐셜로 한 분할 상환(상각) 비용이다. 공간은 모두 O(n)이다.

## 어디에 쓰이나
- 동적 계획법 7편 「트리 DP: 독립 집합과 리루팅」: 자식 서브트리의 결과가 값 하나가 아니라 원소 집합일 때, 이 글의 예제처럼 자식들의 힙을 meld로 합치며 올라간다.
- 심화 알고리즘 6편 「슬로프 트릭: 볼록 조각 선형 함수를 힙으로 다루기」: 그 글의 꺾는 점 힙을 트리 위로 옮기면 자식 함수마다 생긴 힙을 부모에서 더해야 하므로, 힙 합치기가 곧 함수 더하기가 된다.
- 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」: 집합을 합치며 집합별 최솟값을 꺼내야 하면, 소속은 유니온 파인드가, 우선순위는 병합 가능한 힙이 맡는다.
- C++ Boost.Heap 라이브러리에는 스큐 힙(`skew_heap`)이 구현되어 있다.

## 정리
- meld가 필요하면 모양이 고정된 배열 힙 대신 포인터 힙으로 오른쪽 경로끼리만 합친다.
- 레프티스트 힙은 s(왼쪽) ≥ s(오른쪽)으로 오른쪽 척추를 log₂(n + 1) 이하로 묶는다.
- 스큐 힙은 정보 없이 무조건 바꾸고, 무거운 노드 퍼텐셜로 분할 상환 O(log n)이다.
- 조직도 예산 문제처럼 자식들의 후보를 합치며 올라가는 트리 문제가 대표적인 쓰임이다.

## 더 알아보기
- 이전 글: 3편 「이중 우선순위 큐: 최소-최대 힙과 구간 힙」
- 다음 글: 5편 「이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐」
- 위키백과 Skew heap: https://en.wikipedia.org/wiki/Skew_heap
