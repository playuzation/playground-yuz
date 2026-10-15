# [추상 데이터 타입 심화 5/21] 이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐

> **한 줄 요약** — 이항 힙은 n의 이진 표현대로 크기 2ᵏ인 이항 트리를 하나씩 들고 있어 넣기와 합치기가 이진수 덧셈의 올림이 되고, 페어링 힙은 루트 밑에 자식을 쌓아 두었다가 꺼낼 때 두 단계로 짝지어, 정보 없이도 분할 상환 O(log n)에 꺼내고 넣기·합치기는 O(1)이다.

## 이 글에서 다루는 것
- 이항 트리 Bₖ의 성질과 이름의 유래
- 이항 힙 = 이진수: 넣기 분할 상환 O(1), 합치기 O(log n)
- 페어링 힙의 두 단계 짝짓기와 한 단계로 하면 무너지는 이유
- 무작위 대조와 연결(link) 횟수 실험

## 예제 문제: 넣기가 꺼내기보다 훨씬 많을 때
사건 시뮬레이션이나 다익스트라 알고리즘에서는 대기열에 넣는 횟수가 꺼내는 횟수보다 훨씬 많은 경우가 흔하다. 4편 「병합 가능한 힙: 레프티스트 힙과 스큐 힙」의 힙은 합치기가 O(log n)이지만 넣기도 O(log n)이다. 넣기를 O(1)로 만들고 합치기는 O(log n)으로 지키려면, 트리 하나 대신 **트리 여러 개의 숲**을 들고 있다가 필요할 때만 정리하면 된다. 두 트리를 잇는 기본 동작은 **연결**(link)이다. 두 루트를 비교해 큰 쪽을 작은 쪽의 자식으로 붙이며, 비교 한 번에 O(1)이다.

## 이항 트리와 이진수
**이항 트리**(binomial tree) B₀은 노드 하나이고, Bₖ는 Bₖ₋₁ 두 개를 연결한 것이다. 그래서 Bₖ는 노드가 2ᵏ개, 높이가 k, 루트의 자식이 Bₖ₋₁, …, B₁, B₀이고, 깊이 d에 노드가 C(k, d)개 있어 이항 계수에서 이름을 얻었다.
```text
        o
      / | \
     o  o  o
    /|  |
   o o  o
   |
   o
B₃: 깊이별 노드 1, 3, 3, 1개
루트의 자식: B₂, B₁, B₀
```
**이항 힙**(binomial heap, 뷔유맹 1978)은 힙 순서를 지키는 이항 트리를 차수마다 많아야 하나씩 둔다. 그러면 트리 구성이 n의 이진 표현과 똑같다. n = 13 = 1101₂이면 B₃, B₂, B₀이다. 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」의 이진수 덧셈이 그대로 연산이 된다.
- 넣기 = 1 더하기: B₀을 하나 만들고, 같은 차수가 이미 있으면 연결해 올림을 넘긴다. 올림 c번이면 실제 비용 c + 1, 트리 수는 1 − c만큼 변하므로 퍼텐셜을 트리 수로 두면 상각 비용 2, 즉 O(1)이다.
- 합치기 = 두 이진수 더하기: 트리가 log₂ n개 남짓이라 O(log n)이다.
- 최솟값 꺼내기: 루트 log₂ n개 남짓 중 최소를 찾아 떼면 그 자식 Bₖ₋₁, …, B₀이 그대로 하나의 이항 힙이므로 다시 더한다. O(log n)이다.
```python
import random

LINKS = [0]                          # 연결 횟수 = 키 비교 횟수

class Node:
    __slots__ = ("key", "kids")
    def __init__(self, key): self.key, self.kids = key, []

def link(a, b):                      # 큰 루트를 작은 루트의 자식으로
    if a is None or b is None: return a or b
    LINKS[0] += 1
    if b.key < a.key: a, b = b, a
    a.kids.append(b)
    return a

class BinomialHeap:
    def __init__(self): self.trees = []          # trees[k] = Bₖ 또는 None
    def _add(self, t):               # 이진수에 2ᵏ를 더하듯 올림 전파
        k = len(t.kids)
        while True:
            self.trees += [None] * (k + 1 - len(self.trees))
            if self.trees[k] is None:
                self.trees[k] = t; return
            t, self.trees[k] = link(self.trees[k], t), None
            k += 1
    def push(self, x): self._add(Node(x))
    def meld(self, other):
        for t in other.trees:
            if t: self._add(t)
        other.trees = []
    def pop(self):
        ks = [k for k, t in enumerate(self.trees) if t]
        LINKS[0] += len(ks) - 1      # 루트들 중 최소 찾기 비교
        k = min(ks, key=lambda k: self.trees[k].key)
        t, self.trees[k] = self.trees[k], None
        for c in t.kids: self._add(c)          # 자식들도 이항 힙
        while self.trees and self.trees[-1] is None: self.trees.pop()
        return t.key

h = BinomialHeap()
for x in random.Random(1).sample(range(100), 13): h.push(x)
print(bin(13), [k for k, t in enumerate(h.trees) if t])
for x in range(3): h.push(x)                 # 16개 = B₄ 하나
level, cnt = [h.trees[4]], []
while level:                                 # 깊이별 노드 수
    cnt.append(len(level)); level = [c for t in level for c in t.kids]
print(cnt)
LINKS[0] = 0
g = BinomialHeap()
for x in range(1000): g.push(x)
print("1000개 넣기 연결 수", LINKS[0], "= 1000 −", bin(1000).count("1"))
```
```text
0b1101 [0, 2, 3]
[1, 4, 6, 4, 1]
1000개 넣기 연결 수 994 = 1000 − 6
```
13개를 넣으면 B₀, B₂, B₃이 남고(1101₂), 3개를 더 넣어 16개가 되면 B₄ 하나로 합쳐져 깊이별 노드 수가 1, 4, 6, 4, 1이다. 1000개를 넣는 동안의 연결 수 994는 1000에서 1000의 이진 표현 속 1의 개수 6을 뺀 값으로, 이진 카운터를 1000번 올릴 때의 총 올림 수와 같다.

## 페어링 힙: 자식을 쌓아 두었다 두 번에 짝짓기
**페어링 힙**(pairing heap, 프레드먼·세지윅·슬리터·타잔 1986)은 이항 트리의 모양 규칙마저 버린다. 힙 순서를 지키는 트리 하나뿐이고, 넣기와 합치기는 루트끼리 연결 한 번이다. 일은 모두 최솟값 꺼내기에 몰린다. 루트를 떼면 자식 k개가 남는데, ① 왼쪽(최근에 붙은 쪽)부터 둘씩 짝지어 연결하고 ② 그 결과를 오른쪽 끝부터 하나씩 연결해 한 트리로 만든다. 그냥 왼쪽부터 차례로 하나씩 이으면 새 루트가 자식을 거의 그대로 물려받아, 넣기만 n번 한 뒤 꺼내기를 반복하면 매번 O(n)이 든다. 두 단계로 나누면 자식 수가 매번 대략 절반으로 줄어 분할 상환 O(log n)이 증명되어 있다.
```python
class PairingHeap:
    def __init__(self, two_pass=True): self.root, self.two = None, two_pass
    def push(self, x): self.root = link(self.root, Node(x))
    def meld(self, other):
        self.root, other.root = link(self.root, other.root), None
    def pop(self):
        r = self.root
        kids = r.kids[::-1]          # 최근에 붙은 자식부터
        if self.two:
            it = iter(kids)          # ① 왼쪽부터 둘씩 짝짓기
            kids = [link(a, next(it, None)) for a in it]
            kids.reverse()           # ② 오른쪽 끝부터 하나씩
        root = None
        for t in kids: root = link(root, t)
        self.root = root
        return r.key

def check_b(t, k):                   # 차수 k 이항 트리인지, 노드 수
    assert len(t.kids) == k and all(not c.key < t.key for c in t.kids)
    return 1 + sum(check_b(c, i) for i, c in enumerate(t.kids))

def check_p(t):                      # 힙 순서, 노드 수
    if t is None: return 0
    assert all(not c.key < t.key for c in t.kids)
    return 1 + sum(check_p(c) for c in t.kids)

def size(h):
    if isinstance(h, BinomialHeap):
        return sum(check_b(t, k) for k, t in enumerate(h.trees) if t)
    return check_p(h.root)

rng, ok = random.Random(5), 0
makes = [BinomialHeap, PairingHeap, lambda: PairingHeap(False)]
for case in range(300):
    for make in makes:
        hs, ref, same = [make() for _ in range(3)], [[], [], []], True
        for _ in range(100):
            i, j, r = rng.randrange(3), rng.randrange(3), rng.random()
            if r < 0.5:
                x = rng.randrange(50); hs[i].push(x); ref[i].append(x)
            elif r < 0.8 and ref[i]:
                m = min(ref[i]); ref[i].remove(m)
                same &= hs[i].pop() == m
            elif i != j:
                hs[i].meld(hs[j]); ref[i] += ref[j]; ref[j] = []
            same &= all(size(h) == len(q) for h, q in zip(hs, ref))
        ok += same
print(f"무작위 300×3개 비교: {ok}개 일치")
```
```text
무작위 300×3개 비교: 900개 일치
```

## 연결 횟수 세기
앞 코드에 이어서, 무작위 키 2¹²개를 넣은 뒤 전부 꺼내며 연산당 연결 횟수(이항 힙은 루트 중 최소를 찾는 비교 포함)를 센다.
```python
def count(make, n=2**12):
    h, keys = make(), random.Random(6).sample(range(10**6), n)
    LINKS[0] = 0
    for x in keys: h.push(x)
    ins, LINKS[0] = LINKS[0] / n, 0
    out = [h.pop() for _ in range(n)]
    assert out == sorted(keys)
    return ins, LINKS[0] / n

print("넣기  꺼내기  힙")
for name, make in [("이항 힙", BinomialHeap), ("페어링 힙", PairingHeap),
                   ("페어링, 한 단계", lambda: PairingHeap(False))]:
    a, b = count(make)
    print(f"{a:4.1f} {b:7.1f}  {name}")
```
```text
넣기  꺼내기  힙
 1.0    13.4  이항 힙
 1.0    13.7  페어링 힙
 1.0   663.0  페어링, 한 단계
```
이항 힙과 페어링 힙은 꺼내기당 연결이 13번 남짓으로 log₂ 4096 = 12 근처이고, 넣기는 둘 다 1번이다. 한 단계로 이으면 663번으로 n에 비례한다. 페어링 힙은 연결 수가 이항 힙과 비슷하면서 차수 배열도 올림 전파도 없어 코드가 짧고 노드가 가볍다. 스타스코·비터(1987)의 실험이 페어링 힙이 피보나치 힙(6편)과 같은 분할 상환 성능을 낸다는 추측을 뒷받침한 뒤로, 페어링 힙은 이론 보장이 더 강한 힙들을 제치고 실무 구현에서 자주 고르는 선택지가 되었다.

## 자주 하는 실수와 변형
- 이항 힙에서 최솟값을 뗀 뒤 자식들을 "차수 순서"로 다시 더하지 않고 아무 데나 붙이기: 차수마다 하나라는 규칙이 깨져 트리 수가 늘어난다. 차수 검사(`check_b`)가 잡는다.
- 페어링 힙의 짝짓기를 한 단계로 줄이기: 답은 맞아서 대조 검사를 통과하지만 연결 횟수가 폭증한다.
- 페어링 힙을 재귀로 순회하기: 넣기만 반복하면 루트 밑에 자식이 n개 붙고, 반대로 깊이가 n인 사슬도 생길 수 있다.
- 변형: 이항 힙에서 최솟값 루트를 따로 기억하면 최솟값 보기가 O(1)이다. 넣기 때 바로 합치지 않고 루트 목록에 미뤄 두면 6편의 피보나치 힙이 된다.

## 복잡도
| 연산 | 이항 힙 | 페어링 힙 |
|---|---|---|
| 넣기 | 분할 상환 O(1), 최악 O(log n) | O(1) |
| 합치기 | O(log n) | O(1) |
| 최솟값 꺼내기 | O(log n) | 분할 상환 O(log n) |
| 키 줄이기 | O(log n) | 정확한 비용 미해결 |

- 이항 힙은 트리 수 = n의 이진 표현 속 1의 개수가 근거다. 페어링 힙의 키 줄이기는 분할 상환 Ω(log log n) 하한(프레드먼)과 위쪽 경계 사이가 아직 다 좁혀지지 않았다. 공간은 둘 다 O(n)이다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 이항 힙의 넣기는 이진 카운터 올리기, 합치기는 이진수 덧셈이며, 넣기 n번의 연결 수가 n − (1의 개수)인 것도 카운터의 올림 수 그대로다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 프림처럼 "넣기와 키 줄이기는 많고 꺼내기는 정점 수만큼"인 알고리즘이 넣기가 싼 숲 기반 힙의 주 고객이다.
- C++ Boost.Heap은 이항 힙(`binomial_heap`)과 페어링 힙(`pairing_heap`)을 제공하며, 문서에도 페어링 힙의 복잡도 분석이 미해결이라고 적혀 있다.

## 정리
- Bₖ는 Bₖ₋₁ 두 개의 연결이고 노드 2ᵏ개, 깊이 d에 C(k, d)개다.
- 이항 힙의 트리 구성은 n의 이진 표현이고, 넣기는 카운터 올리기(분할 상환 O(1)), 합치기는 이진수 덧셈(O(log n))이다.
- 페어링 힙은 넣기·합치기를 연결 한 번으로 하고, 꺼낼 때 두 단계 짝짓기로 분할 상환 O(log n)을 얻는다.
- 짝짓기를 한 단계로 줄이면 꺼내기 한 번의 연결이 13번 남짓에서 663번으로 늘었다.

## 더 알아보기
- 이전 글: 4편 「병합 가능한 힙: 레프티스트 힙과 스큐 힙」
- 다음 글: 6편 「피보나치 힙: 키 줄이기 O(1)과 다익스트라」
- 위키백과 Binomial heap: https://en.wikipedia.org/wiki/Binomial_heap
