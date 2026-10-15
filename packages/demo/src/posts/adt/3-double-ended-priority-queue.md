# [추상 데이터 타입 심화 3/21] 이중 우선순위 큐: 최소-최대 힙과 구간 힙

> **한 줄 요약** — 양 끝을 꺼내는 이중 우선순위 큐는 힙 두 개와 지연 삭제로도 되지만, 층마다 최소·최대를 번갈아 맡는 최소-최대 힙이나 노드마다 [최소, 최대] 쌍을 두는 구간 힙은 배열 하나에 원소를 한 번씩만 담고 양 끝을 O(log n)에 꺼낸다.

## 이 글에서 다루는 것
- 이중 우선순위 큐 ADT와 힙 두 개 + 지연 삭제
- 최소-최대 힙: 최소층과 최대층이 번갈아 나온다
- 구간 힙: 노드마다 [최소, 최대] 쌍
- 모델 기반 대조와 비교 횟수·저장 칸 실험

## 예제 문제: 양쪽에서 꺼내는 대기열
"x 넣기", "최댓값 꺼내기", "최솟값 꺼내기" 명령이 10⁶개 섞여 들어온다. 5, 1, 9, 3을 넣고 최댓값과 최솟값을 하나씩 꺼내면 9와 1이 나오고 3과 5가 남는다. 넣기와 양 끝 보기·꺼내기를 묶은 ADT가 **이중 우선순위 큐**(double-ended priority queue, DEPQ)다. 정렬 리스트는 넣기가 O(n)이고, 고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」의 이진 힙은 한쪽 끝만 안다.

## 단순한 방법: 힙 두 개와 지연 삭제
원소를 최소 힙과 최대 힙에 모두 넣는다. 최솟값을 꺼내면 최대 힙에 남은 같은 원소는 "지웠다"고 표시만 해 두고 꼭대기에 올라왔을 때 버린다(**지연 삭제**). 같은 값을 구별하려면 넣은 순번으로 표시한다. 연산은 분할 상환 O(log n)이지만 원소를 두 번 저장하고 쓰레기가 쌓인다. 균형 탐색 트리(7편)도 되지만 노드마다 포인터가 붙는다.

## 최소-최대 힙
1986년 앳킨슨(M. D. Atkinson) 등 네 사람이 발표한 **최소-최대 힙**(min-max heap)은 완전 이진 트리의 깊이 0, 2, 4, …를 **최소층**, 1, 3, 5, …를 **최대층**으로 정한다. 최소층 노드는 자기 서브트리에서 가장 작고, 최대층 노드는 가장 크다.
```text
          5          ← 최소층
      90      70     ← 최대층
    8   12  20  15   ← 최소층
  80 60 30           ← 최대층
```
최솟값은 루트, 최댓값은 루트의 두 자식 중 큰 쪽이다. 넣을 때는 맨 끝에 붙여 먼저 부모와 비교한다. 최소층에 붙었는데 최대층 부모보다 크면 부모와 바꾼 뒤 최대층끼리, 아니면 최소층끼리 **조부모**와 비교하며 올라간다. 꺼낼 때는 맨 끝 원소를 빈자리에 놓고 자식·손자 중 가장 작은(최대층이면 큰) 것과 바꾸며 내려간다. 손자와 바꿨다면 사이의 부모와도 비교해 순서가 틀렸으면 바꾼다.
```python
import heapq, random, bisect

def is_min_level(i): return (i + 1).bit_length() % 2 == 1
def lt(x, y, mn): return x < y if mn else y < x  # 그 층 기준으로 앞서나

class ArrayHeap:
    def __init__(self): self.a = []
    def __len__(self): return len(self.a)

class MinMaxHeap(ArrayHeap):
    def push(self, x):
        a = self.a; a.append(x); i = len(a) - 1
        if i == 0: return
        p, mn = (i - 1) // 2, is_min_level(i)
        if lt(a[p], a[i], mn):  # 반대 종류인 부모 쪽에 속한다
            a[i], a[p] = a[p], a[i]
            i, mn = p, not mn
        while i > 2:  # 같은 종류 층(조부모)끼리 올라간다
            g = ((i - 1) // 2 - 1) // 2
            if not lt(a[i], a[g], mn): break
            a[i], a[g] = a[g], a[i]; i = g
    def _down(self, i, mn):
        a, n = self.a, len(self.a)
        while 2 * i + 1 < n:
            kids = [c for c in (2*i + 1, 2*i + 2) if c < n]
            cand = kids + [g for c in kids for g in (2*c + 1, 2*c + 2) if g < n]
            m = i
            for j in cand:  # 자식·손자 중 그 층 기준 으뜸
                if lt(a[j], a[m], mn): m = j
            if m == i: return
            a[i], a[m] = a[m], a[i]
            if m in kids: return
            p = (m - 1) // 2  # 손자로 내려왔으면 그 부모와도 비교
            if lt(a[p], a[m], mn): a[m], a[p] = a[p], a[m]
            i = m
    def pop_min(self):
        a = self.a; x = a.pop()
        if not a: return x
        top, a[0] = a[0], x
        self._down(0, True)
        return top
    def pop_max(self):
        a = self.a
        if len(a) <= 2: return a.pop()
        m = 2 if a[1] < a[2] else 1
        top, x = a[m], a.pop()
        if m < len(a):
            a[m] = x
            self._down(m, False)
        return top

h = MinMaxHeap()
for x in [5, 1, 9, 3]: h.push(x)
print(h.pop_max(), h.pop_min(), sorted(h.a))
```
```text
9 1 [3, 5]
```

## 구간 힙
**구간 힙**(interval heap, 반 레이우엔·우드 1993)은 노드마다 [lo, hi] 두 원소를 담는다. lo들은 최소 힙, hi들은 최대 힙이고 자식 구간이 부모 구간 안에 들어가므로 루트가 [최솟값, 최댓값]이다. 마지막 노드만 원소가 하나일 수 있다. 넣을 때는 끝 노드에 붙여 lo ≤ hi를 맞추고, 부모 구간보다 작으면 lo 쪽, 크면 hi 쪽으로 올린다. 꺼낼 때는 마지막 원소를 루트의 빈 끝에 놓고 한쪽 힙을 따라 내려가며, 노드마다 lo > hi면 둘을 바꾼다.
```python
class IntervalHeap(ArrayHeap):  # 노드 k = [a[2k], a[2k+1]]
    def push(self, x):
        a = self.a; a.append(x); i = len(a) - 1
        if i % 2 and a[i] < a[i - 1]:
            a[i - 1], a[i] = a[i], a[i - 1]; i -= 1
        while i > 1:  # 부모 구간 밖이면 lo 쪽·hi 쪽으로
            p = (i // 2 - 1) // 2
            if i % 2 == 0 and a[i] < a[2 * p]: j = 2 * p
            elif a[2 * p + 1] < a[i]: j = 2 * p + 1
            else: break
            a[i], a[j] = a[j], a[i]; i = j
    def pop_min(self):
        a = self.a
        if len(a) <= 2: return a.pop(0)
        top, a[0] = a[0], a.pop()
        n, i = len(a), 0
        while True:  # i = 지금 노드의 lo 칸
            if i + 1 < n and a[i + 1] < a[i]: a[i], a[i + 1] = a[i + 1], a[i]
            j = 2 * i + 2  # 왼쪽 자식의 lo
            if j >= n: return top
            if j + 2 < n and a[j + 2] < a[j]: j += 2
            if not a[j] < a[i]: return top
            a[i], a[j] = a[j], a[i]; i = j
    def pop_max(self):
        a = self.a
        if len(a) <= 2: return a.pop()
        top, a[1] = a[1], a.pop()
        n, i = len(a), 1
        while True:  # i = 지금 노드의 hi 칸
            if a[i] < a[i - 1]: a[i], a[i - 1] = a[i - 1], a[i]
            if 2 * i >= n: return top
            j = min(2 * i + 1, n - 1)  # 왼쪽 자식의 hi
            if 2 * i + 2 < n and a[j] < a[min(2 * i + 3, n - 1)]:
                j = min(2 * i + 3, n - 1)
            if not a[i] < a[j]: return top
            a[i], a[j] = a[j], a[i]
            if j % 2 == 0: return top  # 원소 하나뿐인 끝 노드
            i = j

h = IntervalHeap()
for x in [5, 1, 9, 3, 7]: h.push(x)
print(h.a[:2], h.pop_max(), h.pop_min(), h.a)
```
```text
[1, 9] 9 1 [3, 7, 5]
```

## 모델 기반 무작위 검사
앞 코드에 이어서, 지연 삭제 방식도 만들어 세 구현을 정렬 리스트와 같은 연산열로 비교한다. 값을 0~29로 좁혀 중복을 만들고, 매 연산 뒤 최소-최대 힙의 층 조건과 구간 힙의 "lo ≤ hi, 자식 구간 ⊂ 부모 구간"을 검사한다.
```python
class K:  # 비교 횟수를 센다
    __slots__ = ("v",); n = 0
    def __init__(self, v): self.v = v
    def __lt__(self, o): K.n += 1; return self.v < o.v

class LazyDEPQ:
    def __init__(self): self.lo, self.hi, self.dead, self.t = [], [], set(), 0
    def __len__(self): return len(self.lo) + len(self.hi)  # 저장 칸 수
    def push(self, x):
        self.t += 1
        heapq.heappush(self.lo, K((x, self.t)))
        heapq.heappush(self.hi, K((-x, self.t)))
    def _pop(self, h):
        while h[0].v[1] in self.dead:  # 지운 표시면 버림
            self.dead.discard(heapq.heappop(h).v[1])
        x, t = heapq.heappop(h).v
        self.dead.add(t)
        return x
    def pop_min(self): return self._pop(self.lo)
    def pop_max(self): return -self._pop(self.hi)

def check_mm(a, i=0):  # 서브트리 (최솟값, 최댓값)
    if i >= len(a): return []
    vals = [a[i]] + check_mm(a, 2 * i + 1) + check_mm(a, 2 * i + 2)
    assert a[i] == (min(vals) if is_min_level(i) else max(vals))
    return [min(vals), max(vals)]

def check_iv(a):
    for i in range(1, len(a), 2): assert not a[i] < a[i - 1]
    for i in range(2, len(a)):
        p = (i // 2 - 1) // 2
        assert not a[i] < a[2 * p] and not a[2 * p + 1] < a[i]

rng, ok = random.Random(3), 0
for case in range(500):
    hs, ref, same = [MinMaxHeap(), IntervalHeap(), LazyDEPQ()], [], True
    for _ in range(80):
        r = rng.random()
        if r < 0.5 or not ref:
            x = rng.randrange(30)
            for h in hs: h.push(x)
            bisect.insort(ref, x)
        else:
            mx = r >= 0.75
            want = ref.pop() if mx else ref.pop(0)
            same &= all((h.pop_max() if mx else h.pop_min()) == want
                        for h in hs)
        check_mm(hs[0].a); check_iv(hs[1].a)
        same &= len(hs[0]) == len(hs[1]) == len(ref)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 비교 횟수와 저장 칸 세기
앞 코드에 이어서, 2¹⁴개를 넣은 뒤 넣기 50%, 양 끝 꺼내기 각 25%로 3만 번 돌리며 연산당 비교 횟수와 최대 저장 칸을 센다.
```python
def workload(h, wrap):
    rng, peak = random.Random(4), 0
    for _ in range(2**14): h.push(K(rng.random()) if wrap else rng.random())
    K.n = 0
    for _ in range(30000):
        r = rng.random()
        if r < 0.5: h.push(K(r) if wrap else r)
        elif r < 0.75: h.pop_min()
        else: h.pop_max()
        peak = max(peak, len(h))
    return K.n / 30000, peak

print("비교/연산  저장 칸")
for name, h, wrap in [("최소-최대 힙", MinMaxHeap(), True),
                      ("구간 힙", IntervalHeap(), True),
                      ("힙 두 개 + 지연 삭제", LazyDEPQ(), False)]:
    c, peak = workload(h, wrap)
    print(f"{c:9.1f} {peak:8}  {name}")
```
```text
비교/연산  저장 칸
     23.2    16432  최소-최대 힙
     20.6    16432  구간 힙
     10.6    47774  힙 두 개 + 지연 삭제
```
비교 횟수는 뜻밖에 지연 삭제 쪽이 가장 적다. `heapq`는 꺼낼 때 작은 자식만 따라 바닥까지 내려갔다 올라와서 층마다 비교가 한 번인데, 위의 두 구현은 빈자리 원소와도 비교하고 최소-최대 힙은 손자까지 본다. 대신 저장 칸은 살아 있는 원소 16,432개에 47,774개로 2.9배였다. 최솟값으로 빠진 원소가 최대 힙 바닥에 가라앉아 좀처럼 올라오지 않기 때문이다.

## 자주 하는 실수와 변형
- 넣은 원소를 부모와 먼저 비교하지 않기: 최소층에 붙은 큰 값이 최대층으로 못 간다.
- 손자와 바꾼 뒤 부모와의 비교를 빼먹기: 한동안 맞아 보여 불변식 검사로만 잡힌다.
- 지연 삭제에서 값으로 표시하기: 같은 값이 여럿이면 살아 있는 것까지 버린다.
- 변형 유형: 상위 k개와 하위 k개 동시 유지, 크기 제한 버퍼에서 가장 덜 중요한 것 버리기.

## 복잡도
| 연산 | 최소-최대·구간 힙 | 힙 두 개 + 지연 | 정렬 리스트 |
|---|---|---|---|
| 넣기 | O(log n) | O(log n) | O(n) |
| 최소·최대 보기 | O(1) | 상각 O(1) | O(1) |
| 최소·최대 꺼내기 | O(log n) | 상각 O(log n) | O(1)·O(n) |
| 저장 칸 | n | 2n + 쓰레기 | n |

- 높이가 log₂ n, log₂(n/2) 남짓인 완전 이진 트리의 한 경로만 오르내린다. 상각은 분할 상환 비용이다.

## 어디에 쓰이나
- 고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」: 그 글의 "낡은 항목은 꺼낼 때 건너뛴다"가 이 글의 지연 삭제이고, 이중 우선순위 큐는 그 쓰레기를 없앤다.
- 외부 정렬: 메모리만큼의 원소를 이중 우선순위 큐에 두고 최솟값보다 작은 입력은 왼쪽 파일로, 최댓값보다 큰 입력은 오른쪽 파일로 보내는 외부 퀵정렬의 분할 단계가 대표적인 쓰임이다.

## 정리
- 이중 우선순위 큐는 넣기와 양 끝 꺼내기를 지원하는 ADT다.
- 힙 두 개 + 지연 삭제는 쉽고 비교도 적지만 원소를 두 번 담고 쓰레기가 쌓여 저장 칸이 2.9배였다.
- 최소-최대 힙은 층마다 최소·최대 역할을 번갈아 맡기고 조부모·손자와 비교한다.
- 구간 힙은 노드마다 [lo, hi]를 담아 높이가 한 층 낮고, 최소-최대 힙보다 비교가 적었다.

## 더 알아보기
- 이전 글: 2편 「스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계」
- 다음 글: 4편 「병합 가능한 힙: 레프티스트 힙과 스큐 힙」
- 위키백과 Min-max heap: https://en.wikipedia.org/wiki/Min-max_heap
