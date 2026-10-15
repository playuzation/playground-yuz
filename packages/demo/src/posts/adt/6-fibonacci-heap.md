# [추상 데이터 타입 심화 6/21] 피보나치 힙: 키 줄이기 O(1)과 다익스트라

> **한 줄 요약** — 피보나치 힙은 넣기·합치기를 루트 목록에 미루고, 키 줄이기는 노드를 잘라 루트로 올리되 자식을 둘 잃은 노드도 잘라 내는 연쇄 잘라내기로 차수를 피보나치 수로 묶어, 키 줄이기 분할 상환 O(1)로 다익스트라를 O(m + n log n)에 돌린다.

## 이 글에서 다루는 것
- 키 줄이기가 중요한 이유: 다익스트라와 프림
- 게으른 합치기, 표시(mark)와 연쇄 잘라내기
- 차수가 피보나치 수로 묶이는 이유와 분할 상환 스케치
- 다익스트라에서 이진 힙과 비교 횟수 비교

## 예제 문제: 다익스트라의 키 줄이기
그래프 알고리즘 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」는 정점을 n번 꺼내고, 간선을 완화할 때마다 대기 중인 정점의 거리를 줄인다(최대 m번). 우선순위 큐 ADT에 **키 줄이기**(decrease-key)를 더하면 이진 힙으로는 둘 다 O(log n)이라 O((n + m) log n)이고, 밀집 그래프에서는 힙 없이 배열을 훑는 O(n²)보다 느려진다. 키 줄이기가 O(1)이면 O(m + n log n)으로 두 경우 모두 최선에 가깝다. 1984년 프레드먼(Michael Fredman)과 타잔(Robert Tarjan)이 발표하고 1987년 학술지에 실은 **피보나치 힙**(Fibonacci heap)이 이것을 해냈다.

## 구조: 미뤄 두고, 잘라 내고, 정리한다
5편 「이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐」처럼 힙 순서 트리의 숲을 두되 정리를 최대한 미룬다.
- 넣기·합치기: 루트 목록에 붙이고 최솟값 포인터만 고친다. O(1)이다.
- 최솟값 꺼내기: 최소 루트를 떼고 자식을 모두 루트로 올린 뒤, 차수가 같은 루트끼리 연결해 차수를 모두 다르게 만든다(이항 힙의 올림). 미뤄 둔 일을 여기서 한다.
- 키 줄이기: 부모보다 작아지면 서브트리째 잘라 루트로 올린다. 부모가 표시되어 있지 않으면 **표시**(mark)만 하고, 이미 표시되어 있으면(둘째 자식을 잃었으면) 부모도 잘라 올리고 위로 이어 간다. 이것이 **연쇄 잘라내기**(cascading cut)다.

표시 규칙은 "루트가 아닌 노드는 자식을 많아야 하나만 잃는다"를 지킨다. 그래야 차수가 큰 노드는 서브트리도 크다.
```text
yᵢ: x에 i번째로 붙은 자식
붙을 때 deg(yᵢ) = deg(x) ≥ i − 1
그 뒤 하나만 잃음: deg(yᵢ) ≥ i − 2
s(k) ≥ 2 + s(0) + s(1) + … + s(k−2)
     = F(k + 2) ≥ φᵏ, φ ≈ 1.618
⇒ 최대 차수 ≤ log_φ n ≈ 1.44·log₂ n
```
s(k)는 차수 k인 노드의 서브트리 크기 최솟값이고, 이 점화식이 피보나치 수를 만들어 이름이 붙었다. 분할 상환은 `Φ = (루트 수) + 2·(표시 수)`로 본다. 키 줄이기에서 잘라내기가 c번이면 루트가 c개 늘고 표시는 c − 1개 풀리고 많아야 하나 생기므로 ΔΦ ≤ c + 2(2 − c), 상각 비용은 4 이하다. 꺼내기는 실제 O(최대 차수 + 루트 수)지만 정리 뒤 루트가 최대 차수 + 1개 이하로 줄어 그 차이를 Φ가 갚으므로 O(log n)이다.
```python
import heapq, random

CMP = [0]  # 키 비교 횟수
def less(a, b):
    CMP[0] += 1
    return a.key < b.key

class Node:
    __slots__ = ("key", "item", "parent", "kids", "mark")
    def __init__(self, key, item):
        self.key, self.item, self.parent = key, item, None
        self.kids, self.mark = {}, False  # dict = 순서 있는 집합

class FibHeap:
    def __init__(self):
        self.roots, self.min, self.n = {}, None, 0
        self.links = self.cuts = 0
    def push(self, key, item=None):
        x = Node(key, item)
        self.roots[x] = None; self.n += 1
        if self.min is None or less(x, self.min): self.min = x
        return x
    def meld(self, other):  # 게으른 합치기: 루트 목록만 잇는다
        self.roots.update(other.roots); self.n += other.n
        if other.min and (self.min is None or less(other.min, self.min)):
            self.min = other.min
    def pop(self):
        z = self.min
        for c in z.kids:  # 자식을 모두 루트로
            c.parent, c.mark = None, False
            self.roots[c] = None
        del self.roots[z]; self.n -= 1
        by_deg = {}  # 차수가 같은 루트끼리 연결
        for x in list(self.roots):
            d = len(x.kids)
            while d in by_deg:
                y = by_deg.pop(d)
                if less(y, x): x, y = y, x
                del self.roots[y]; x.kids[y] = None
                y.parent, y.mark = x, False
                self.links += 1; d += 1
            by_deg[d] = x
        self.min = None
        for x in self.roots:
            if self.min is None or less(x, self.min): self.min = x
        return z.key, z.item
    def decrease(self, x, key):
        x.key, p = key, x.parent
        if p is not None and less(x, p):
            self._cut(x)
            while p.parent is not None:  # 연쇄 잘라내기
                if not p.mark:
                    p.mark = True; break
                q = p.parent; self._cut(p); p = q
        if less(x, self.min): self.min = x
    def _cut(self, x):
        del x.parent.kids[x]
        x.parent, x.mark = None, False
        self.roots[x] = None; self.cuts += 1

h = FibHeap()
nodes = [h.push(k, ch) for k, ch in zip([7, 3, 9, 5, 8], "abcde")]
print(h.pop(), end=" ")  # 정리가 일어난다
h.decrease(nodes[2], 1)  # c: 9 → 1
print(h.pop(), h.pop(), h.n)
```
```text
(3, 'b') (1, 'c') (5, 'd') 2
```

## 모델 기반 무작위 검사
앞 코드에 이어서, 힙 두 개에 네 연산을 섞고 항목 → 키 사전(꺼낼 때 `min`)과 비교한다. 매 연산 뒤 힙 순서, 루트에 표시 없음, 노드 수, 그리고 차수 d인 노드의 서브트리 크기 ≥ F(d + 2)를 검사한다.
```python
FIB = [1, 1]  # FIB[i] = F(i + 1)
while len(FIB) < 64: FIB.append(FIB[-1] + FIB[-2])

def check(h):
    def walk(x):
        size = 1
        for c in x.kids:
            assert c.parent is x and not c.key < x.key
            size += walk(c)
        assert size >= FIB[len(x.kids) + 1]  # F(d + 2)
        return size
    assert all(not r.mark for r in h.roots)
    assert sum(walk(r) for r in h.roots) == h.n
    assert h.n == 0 or all(not r.key < h.min.key for r in h.roots)

rng, ok, maxdeg = random.Random(6), 0, 0
for case in range(300):
    hs, refs, node, same = [FibHeap(), FibHeap()], [{}, {}], {}, True
    for t in range(150):
        i, r = rng.randrange(2), rng.random()
        h, ref = hs[i], refs[i]
        if r < 0.45 or not ref:
            k = rng.randrange(1000)
            node[t] = h.push(k, t); ref[t] = k
        elif r < 0.7:
            k, item = h.pop()
            same &= k == min(ref.values()) and ref.pop(item) == k
        elif r < 0.97:
            item = rng.choice(list(ref))
            ref[item] -= rng.randrange(1, 300)
            h.decrease(node[item], ref[item])
        else:
            h.meld(hs[1 - i]); ref.update(refs[1 - i])
            hs[1 - i], refs[1 - i] = FibHeap(), {}
        for g in hs: check(g)
        maxdeg = max([maxdeg] + [len(x.kids) for g in hs for x in g.roots])
    ok += same
print(f"무작위 300개 비교: {ok}개 일치, 루트 최대 차수 {maxdeg}")
```
```text
무작위 300개 비교: 300개 일치, 루트 최대 차수 5
```

## 다익스트라에서 비교 횟수 세기
앞 코드에 이어서, `heapq`에 같은 정점을 여러 번 넣고 낡은 항목은 꺼낼 때 버리는 흔한 방식과 피보나치 힙을 비교한다. 그래프는 무작위 밀집 그래프와, 정점 i를 꺼낼 때마다 뒤쪽 정점 전부의 거리가 줄도록 가중치를 고른 그래프다. 거리는 힙 없는 O(n²) 방법과 맞춰 본다.
```python
INF = float("inf")

def dijkstra_ref(n, adj):  # 정의 그대로 O(n²)
    dist, done = [INF] * n, [False] * n
    dist[0] = 0
    while True:
        u = min((u for u in range(n) if not done[u]),
                key=dist.__getitem__, default=None)
        if u is None or dist[u] == INF: return dist
        done[u] = True
        for v, w in adj[u]: dist[v] = min(dist[v], dist[u] + w)

class K:  # heapq 항목, 비교 횟수를 센다
    __slots__ = ("d", "v")
    def __init__(self, d, v): self.d, self.v = d, v
    def __lt__(self, o): CMP[0] += 1; return self.d < o.d

def dijkstra_bin(n, adj):
    dist, q, pushes = [INF] * n, [K(0, 0)], 1
    dist[0] = 0
    while q:
        e = heapq.heappop(q)
        if e.d != dist[e.v]: continue  # 낡은 항목
        for v, w in adj[e.v]:
            if e.d + w < dist[v]:
                dist[v] = e.d + w
                heapq.heappush(q, K(dist[v], v)); pushes += 1
    return dist, pushes

def dijkstra_fib(n, adj):
    dist, node, h, dec = [INF] * n, {}, FibHeap(), 0
    dist[0] = 0; node[0] = h.push(0, 0)
    while h.n:
        d, u = h.pop()
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                if v in node: h.decrease(node[v], dist[v]); dec += 1
                else: node[v] = h.push(dist[v], v)
    return dist, dec

rng = random.Random(7)
n1 = 400
dense = [[(v, rng.randint(1, 1000)) for v in range(n1)
          if v != u and rng.random() < 0.2] for u in range(n1)]
n2 = 300  # i를 꺼내면 j > i + 1의 거리가 준다
worst = [[(j, 1 if j == i + 1 else 2 * n2 - 2 * i) for j in range(i + 1, n2)]
         for i in range(n2)]
print("     비교    넣기·줄이기  그래프, 힙")
for gname, n, adj in (("밀집", n1, dense), ("최악", n2, worst)):
    ref = dijkstra_ref(n, adj)
    for hname, run in (("이진", dijkstra_bin), ("피보나치", dijkstra_fib)):
        CMP[0] = 0
        dist, ops = run(n, adj)
        assert dist == ref
        print(f"{CMP[0]:9,} {ops:10,}  {gname}, {hname}")
```
```text
     비교    넣기·줄이기  그래프, 힙
   19,593      1,605  밀집, 이진
    6,922      1,198  밀집, 피보나치
  783,445     44,851  최악, 이진
   93,144     44,551  최악, 피보나치
```
비교 횟수만 보면 두 그래프 모두 피보나치 힙이 적다. 밀집 그래프에서 이진 힙은 같은 정점을 여러 번 넣어 꺼내기가 정점 수의 4배인 1,605번이고, 최악 그래프에서는 항목이 44,851개 쌓여 비교가 78만 번을 넘는다. 피보나치 힙은 키 줄이기를 번당 비교 두 번으로 끝내 8배 넘게 적다. 그래도 실무에서 이진 힙 + 중복 삽입이 흔한 것은 이 실험이 세지 않은 비용 때문이다. 피보나치 힙의 노드는 부모·자식 목록·표시를 들고 메모리에 흩어져 있어 포인터를 따라갈 때마다 캐시를 놓치고, 연결·잘라내기마다 포인터 여러 개를 고친다. 배열 이진 힙은 붙어 있는 배열에서 인덱스 계산만 한다.

## 자주 하는 실수와 변형
- 연결할 때 표시를 지우지 않기: 연쇄 잘라내기가 엉뚱하게 이어지거나 멈춰 차수 보장이 깨진다. 차수 하한 검사가 잡는다.
- 차수 표 크기를 log₂ n으로 잡기: 최대 차수는 1.44·log₂ n까지 간다.
- 노드 핸들 없이 키로 찾아 줄이기: 찾는 데만 O(n)이다.
- 변형: 임의 노드 삭제는 키를 −∞로 줄이고 꺼내기(O(log n))다.

## 복잡도
| 연산 | 피보나치 힙(분할 상환) | 이진 힙 |
|---|---|---|
| 넣기 | O(1) | O(log n) |
| 최솟값 꺼내기 | O(log n) | O(log n) |
| 키 줄이기 | O(1) | O(log n), 위치 표 필요 |
| 합치기 | O(1) | O(n) |
| 다익스트라 | O(m + n log n) | O((n + m) log n) |

- 근거는 Φ = (루트 수) + 2·(표시 수)와 최대 차수 ≤ log_φ n이다. 공간은 O(n)이지만 노드당 상수가 배열 힙보다 크다.

## 어디에 쓰이나
- 그래프 알고리즘 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: 그 글의 "새 항목을 넣고 낡은 항목은 건너뛰기"가 실험의 이진 힙 방식이고, 피보나치 힙은 그 중복 항목을 키 줄이기로 바꾼다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 프림도 정점 n번 꺼내기와 간선 m번 키 줄이기라 같은 O(m + n log n)이 된다.
- 5편 「이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐」: 꺼내기의 정리가 이항 힙의 올림이고, 상수가 작은 대안이 페어링 힙이다.

## 정리
- 피보나치 힙은 넣기·합치기를 미루고, 꺼낼 때 같은 차수 루트끼리 연결해 한꺼번에 정리한다.
- 연쇄 잘라내기로 차수 d인 노드의 서브트리가 F(d + 2) 이상이 되어 최대 차수가 log_φ n이다.
- Φ = 루트 수 + 2·표시 수로 키 줄이기 상각 O(1), 꺼내기 상각 O(log n)이다.
- 비교 횟수는 피보나치 힙이 적었고 키 줄이기가 쏟아지면 8배 넘게 차이 났지만, 노드가 무겁고 흩어져 있어 실무에서는 이진 힙 + 중복 삽입이 흔하다.

## 더 알아보기
- 이전 글: 5편 「이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐」
- 다음 글: 7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」
- 위키백과 Fibonacci heap: https://en.wikipedia.org/wiki/Fibonacci_heap
