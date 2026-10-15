# [추상 데이터 타입 심화 15/21] 반 엠데 보아스 트리: 정수 키를 O(log log U)에

> **한 줄 요약** — 키가 0~U−1 정수면 비트를 반으로 잘라 우주를 √U개 덩어리와 요약 구조로 재귀 분할하고, min을 덩어리 밖에 두어 재귀를 한 번만 하게 하면 삽입·삭제·successor가 모두 O(log log U)다.

## 이 글에서 다루는 것
- 정렬 집합 ADT와 비교 기반 하한 Ω(log n)
- √U 분할과 요약 구조, O(log log U)가 되는 이유
- min을 덩어리 밖에 두는 이유, 구현과 불변식 검사 대조
- 재귀 호출 수 실험, 공간 O(U) 문제와 x-fast·y-fast 트라이

## 예제 문제: 다음 예약 시각
초 단위 시각 0~86,399에 예약이 들고 나는 동안 "시각 t 다음의 첫 예약"을 계속 묻는다. 필요한 ADT는 **정렬 집합**(ordered set)의 insert, delete, member, successor(x보다 큰 가장 작은 키), predecessor다.

비트 배열은 삽입·삭제가 O(1)이지만 successor가 다음 1까지 훑어 O(U)다. 7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」 같은 균형 트리는 O(log n)이고, 비교만 쓰는 구조는 이보다 나을 수 없다. 답이 n + 1가지 중 하나라 비교 한 번에 1비트씩 알아내면 log₂(n + 1)번은 물어야 한다. **반 엠데 보아스 트리**(van Emde Boas tree, vEB)는 키의 비트를 잘라 배열 인덱스로 써서 이 하한을 피한다. 페터 반 엠데 보아스(Peter van Emde Boas)가 1975년에 발표했다.

## 아이디어: 비트를 반으로 자르기
U = 2ᵏ이면 키 x를 위 절반 비트 h와 아래 절반 비트 l로 나눈다. 같은 h의 키는 크기 √U의 **덩어리**(cluster)에 l로 들어가고, 비어 있지 않은 덩어리 번호들은 크기 √U의 **요약**(summary)에 들어간다. 둘 다 같은 구조의 작은 판이라 재귀가 된다.
```text
U = 16, x = 4·h + l
키 {2, 3, 5, 7, 14}
min = 2 (덩어리에 넣지 않음)
max = 14
덩어리 0 = {3}
덩어리 1 = {1, 3}  (5와 7)
덩어리 3 = {2}  (14)
요약 = {0, 1, 3}
```
successor(x)는 한 갈래만 재귀한다. x의 덩어리에 더 큰 키가 있는지는 그 덩어리의 max와 비교해 O(1)에 안다. 있으면 그 덩어리로 재귀하고, 없으면 요약에서 다음 덩어리 h′를 재귀로 찾은 뒤 덩어리 h′의 min을 O(1)에 읽는다.
```text
T(U) = T(√U) + O(1)
k = log₂ U로 두면
S(k) = S(k/2) + O(1)
S(k) = O(log k) = O(log log U)
```
삽입이 같은 점화식을 따르려면 **min을 덩어리에 넣지 않는다**. 그러면 빈 구조에 넣기가 min = max = x로 끝나는 O(1)이라, 새 덩어리가 생길 때 "요약에 h 넣기"만 재귀다. min까지 덩어리에 넣으면 두 번 재귀해 `T(U) = 2T(√U) + O(1) = O(log U)`로 떨어진다. 삭제도 덩어리가 빌 때만 요약을 재귀로 고치는데, 그때의 덩어리 삭제는 키 하나짜리라 O(1)이다.

## 구현
덩어리는 비어 있지 않은 것만 dict에 만들고, `CALLS`로 호출 수를 센다. predecessor는 successor와 대칭이고, 앞 덩어리가 없을 때 덩어리 밖의 min을 확인하는 줄만 더 붙는다.
```python
CALLS = [0]  # 재귀 호출 수

class VEB:
    def __init__(self, bits):  # 우주 U = 2^bits
        self.bits, self.min, self.max = bits, None, None
        if bits > 1:
            self.lo = bits // 2  # 아래 절반 비트 수
            self.summary = None  # 비어 있지 않은 덩어리 번호
            self.cluster = {}  # 덩어리 번호 → VEB(lo)

    def member(self, x):
        CALLS[0] += 1
        if x == self.min or x == self.max:
            return True
        if self.bits == 1:
            return False
        c = self.cluster.get(x >> self.lo)
        return c is not None and c.member(x & ((1 << self.lo) - 1))

    def insert(self, x):  # x가 없을 때만 부른다
        CALLS[0] += 1
        if self.min is None:  # 빈 구조: O(1)
            self.min = self.max = x
            return
        if x < self.min:  # min은 덩어리에 넣지 않는다
            x, self.min = self.min, x
        if self.bits > 1:
            h, l = x >> self.lo, x & ((1 << self.lo) - 1)
            c = self.cluster.get(h)
            if c is None:  # 새 덩어리: 요약만 재귀
                if self.summary is None:
                    self.summary = VEB(self.bits - self.lo)
                self.summary.insert(h)
                c = self.cluster[h] = VEB(self.lo)
                c.min = c.max = l
            else:  # 기존 덩어리만 재귀
                c.insert(l)
        self.max = max(self.max, x)

    def successor(self, x):  # x보다 큰 가장 작은 키
        CALLS[0] += 1
        if self.bits == 1:
            return 1 if x == 0 and self.max == 1 else None
        if self.min is not None and x < self.min:
            return self.min
        h, l = x >> self.lo, x & ((1 << self.lo) - 1)
        c = self.cluster.get(h)
        if c is not None and l < c.max:  # 같은 덩어리 안
            return (h << self.lo) | c.successor(l)
        nh = self.summary.successor(h) if self.summary else None
        if nh is None:
            return None
        return (nh << self.lo) | self.cluster[nh].min  # O(1)

    def delete(self, x):  # x가 있을 때만 부른다
        CALLS[0] += 1
        if self.min == self.max:
            self.min = self.max = None
            return
        if self.bits == 1:
            self.min = self.max = 1 - x
            return
        if x == self.min:  # 덩어리의 첫 키를 새 min으로
            h = self.summary.min
            x = self.min = (h << self.lo) | self.cluster[h].min
        h, l = x >> self.lo, x & ((1 << self.lo) - 1)
        c = self.cluster[h]
        c.delete(l)
        if c.min is None:  # 덩어리가 비었다(방금 O(1))
            del self.cluster[h]
            self.summary.delete(h)
            if x == self.max:
                s = self.summary.max
                self.max = self.min if s is None else \
                    (s << self.lo) | self.cluster[s].max
        elif x == self.max:
            self.max = (h << self.lo) | c.max

def add(t, x):  # 중복 삽입을 걸러 준다
    if not t.member(x):
        t.insert(x)

t = VEB(16)
for x in [3, 100, 7, 65535, 4096, 4100]:
    add(t, x)
t.delete(100)
print(t.successor(7), t.successor(4096), t.successor(65535))
print(t.min, t.max, t.member(100), t.member(4100))
```
```text
4096 4100 None
3 65535 False True
```

## 모델 기반 무작위 대조
앞 코드에 이어서, 홀수 비트를 포함한 작은 우주에서 무작위 연산열을 정렬 리스트와 함께 돌리고, 매번 불변식(min은 덩어리의 모든 키보다 작다, max가 맞다, 요약 = 비어 있지 않은 덩어리 번호)도 검사한다.
```python
import random, bisect

def keys(v):  # 구조에 든 키 전부(검사용)
    out = set() if v.min is None else {v.min, v.max}
    if v.bits > 1:
        for h, c in v.cluster.items():
            out |= {(h << v.lo) | y for y in keys(c)}
    return out

def check(v):  # 불변식 검사
    if v.min is None:
        return v.max is None and (v.bits == 1 or not v.cluster)
    if v.bits == 1:
        return v.min <= v.max
    inner = {(h << v.lo) | y for h, c in v.cluster.items() for y in keys(c)}
    ok = all(y > v.min for y in inner) and v.max == max(inner | {v.min})
    ok &= set(v.cluster) == (keys(v.summary) if v.summary else set())
    return ok and all(c.min is not None and check(c)
                      for c in v.cluster.values())

rng, ok = random.Random(15), 0
for case in range(300):
    bits = rng.choice([1, 2, 3, 5, 7])
    t, ref, same = VEB(bits), [], True
    for _ in range(80):
        op, x = rng.randrange(3), rng.randrange(1 << bits)
        i = bisect.bisect_left(ref, x)
        has = i < len(ref) and ref[i] == x
        if op == 0 and not has:
            t.insert(x); ref.insert(i, x)
        elif op == 1 and has:
            t.delete(x); ref.pop(i)
        j = bisect.bisect_right(ref, x)
        same &= t.successor(x) == (ref[j] if j < len(ref) else None)
        same &= t.member(x) == (x in ref)
        same &= check(t) and keys(t) == set(ref)
    ok += same
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 재귀 호출 수와 공간 실험
앞 코드에 이어서, 비트 수 4~64의 우주에 무작위 키 2,000개를 넣고 successor 2,000번의 호출 수와 키당 만들어진 노드 수를 센다.
```python
import math

def nodes(v):  # 만들어진 VEB 객체 수
    if v.bits == 1:
        return 1
    sub = sum(nodes(c) for c in v.cluster.values())
    return 1 + sub + (nodes(v.summary) if v.summary else 0)

print("bits log2(bits) 평균 최대 노드/키")
for bits in [4, 8, 16, 32, 64]:
    rng, t = random.Random(bits), VEB(bits)
    for _ in range(2000):
        add(t, rng.randrange(1 << bits))
    tot = mx = 0
    for _ in range(2000):
        CALLS[0] = 0
        t.successor(rng.randrange(1 << bits))
        tot, mx = tot + CALLS[0], max(mx, CALLS[0])
    per = nodes(t) / len(keys(t))
    print(f"{bits:4} {math.log2(bits):10.0f} {tot / 2000:5.2f}"
          f" {mx:4} {per:7.2f}")
```
```text
bits log2(bits) 평균 최대 노드/키
   4          2  2.94    3    1.25
   8          3  3.93    4    1.33
  16          4  3.87    5    2.59
  32          5  4.88    6    3.57
  64          6  5.84    7    4.55
```
successor의 최대 호출 수는 정확히 log₂(bits) + 1이다. 비트 수가 반씩 줄어 1비트에서 멈춘다. 64비트 키에서도 7번이고, 같은 2,000개를 이분 탐색하면 비교가 약 11번이다. 다만 호출 한 번이 비교보다 무거워 n이 작으면 균형 트리가 빠를 수 있다.

## 공간 O(U)와 x-fast·y-fast 트라이
교과서의 배열판은 덩어리를 미리 다 만들어 공간이 O(U)라 64비트 키에는 못 쓴다. 위처럼 빈 덩어리를 만들지 않고 해시 테이블(16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」)에 두면 키당 노드가 log₂(bits)보다 조금 적어(64비트에서 4.55개) 공간이 O(n log log U)로 준다(시간은 기대값이 된다). O(n)까지 줄인 것이 댄 윌라드(Dan Willard)의 1983년 구조다.
- **x-fast 트라이**: 키를 깊이 log U의 이진 트라이(14편)에 넣고 깊이마다 접두사를 해시 테이블에 둔다. 가장 긴 접두사를 깊이에 대한 이분 탐색으로 찾아 successor가 O(log log U), 공간은 O(n log U)다.
- **y-fast 트라이**: 정렬된 키를 크기 Θ(log U) 묶음으로 나눠 묶음마다 균형 트리에 두고 대표만 x-fast 트라이에 넣는다. 공간 O(n), 질의 O(log log U), 갱신은 분할 상환 기대 O(log log U)다.

## 자주 하는 실수와 변형
- min을 덩어리에도 넣으면 답은 맞아 대조로는 안 잡히고, 호출 수를 세야 O(log U)로 느려진 것이 보인다.
- 비트 수가 홀수일 때 위 절반을 `bits − lo`로 두지 않으면 키가 덩어리 범위를 넘는다. 대조에 홀수 비트를 넣은 이유다.
- 우선순위 큐로 쓰면 extract-min이 O(log log U)라 정수 n개 정렬이 O(n log log U)다.
- 실무형 변형: 바닥 몇 층을 64비트 워드로 바꾸고 다음 1비트를 비트 연산으로 찾으면 상수가 크게 준다.

## 복잡도
| 연산 | vEB 트리 | 균형 BST |
|---|---|---|
| member | O(log log U) | O(log n) |
| insert·delete | O(log log U) | O(log n) |
| successor | O(log log U) | O(log n) |
| 공간 | O(U) | O(n) |

- 근거: 비트 수가 절반인 구조로 한 번만 재귀하고 나머지는 O(1)이다. min·max는 O(1)이다.
- 덩어리를 해시로 두면 공간 O(n log log U), y-fast 트라이는 O(n)이다.

## 어디에 쓰이나
- 그래프 알고리즘 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: 가중치가 정수면 꺼내는 거리가 줄지 않으므로 우선순위 큐를 vEB로 바꿔 힙 연산을 O(log log U)로 만들 수 있다(U는 거리 범위).
- 알고리즘 기법 13편 「제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게」: √U 덩어리와 요약이 그 글의 제곱근 분할이고, vEB는 이를 재귀로 반복한다.
- 알고리즘 기법 11편 「비트마스킹: 정수 하나로 집합 다루기」: 키를 `x >> lo`와 마스크로 위아래 비트로 자르는 것이 그 글의 비트 연산이다.

## 정리
- 키가 정수면 비트를 잘라 인덱스로 써서 비교 기반 하한 Ω(log n)을 피한다.
- 우주를 √U 덩어리 + 요약으로 나누고 한쪽만 재귀하면 O(log log U)다.
- min을 덩어리 밖에 두는 것이 핵심이며, 64비트 키에서도 successor 호출이 최대 7번이었다.
- 배열판의 공간 O(U)는 해시 덩어리나 y-fast 트라이로 줄인다.

## 더 알아보기
- 이전 글: 14편 「기수 트리와 패트리샤 트리: 갈림길만 남긴 트라이」
- 다음 글: 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」
- 위키백과 Van Emde Boas tree: https://en.wikipedia.org/wiki/Van_Emde_Boas_tree
