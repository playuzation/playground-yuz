# [추상 데이터 타입 심화 2/21] 스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계

> **한 줄 요약** — 스택에 "바닥부터 지금까지의 집계"를 함께 쌓으면 최솟값 스택이 되고, 그런 스택 두 개를 등지게 붙이면 결합 법칙만 있는 아무 연산의 구간 집계를 분할 상환 O(1)에 내주는 큐가 되며, 같은 발상으로 반씩 나눠 옮기는 덱도 만든다.

## 이 글에서 다루는 것
- 최솟값 스택: 원소마다 집계를 함께 쌓기
- 스택 두 개로 큐: 분할 상환 O(1)과 퍼텐셜
- 결합 법칙만 있으면 되는 슬라이딩 윈도 집계(gcd, 행렬 곱)와 단조 덱 비교
- 스택 두 개로 덱: 한쪽이 비면 반씩 나눠 옮기기

## 예제 문제: 길이 k 구간마다 gcd
수열과 창 길이 k가 주어지면 길이 k인 모든 구간의 최대공약수를 구한다. `a = [12, 18, 24, 9, 27, 36]`, k = 3이면 답은 `[6, 3, 3, 9]`다. 구간마다 다시 계산하면 O(nk)다. 구간 합이라면 누적 합의 차로 O(1)이지만 gcd에는 빼기(역원)가 없다. 알고리즘 기법 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」의 단조 덱은 "뒤에 온 작은 값이 앞의 큰 값을 영원히 가린다"는 최솟값·최댓값만의 성질에 기댄다. gcd는 겹쳐 세도 되는 연산이라 희소 테이블도 쓸 수 있지만, 2×2 행렬 곱처럼 교환도 안 되고 겹쳐 세면 안 되는 연산이면 그것도 막힌다. 필요한 것은 앞에서 빼고 뒤에 넣으면서 전체 집계를 묻는 **집계 큐**(aggregate queue)다.

## 최솟값 스택
스택이라면 쉽다. 원소마다 "바닥부터 여기까지의 집계"를 함께 쌓으면, 꼭대기를 빼도 아래 원소들의 집계가 그대로 남아 있다. 연산이 `min`이면 **최솟값 스택**(min stack)이고 push·pop·min이 모두 O(1)이다. 이때 연산 ⊕에 필요한 것은 결합 법칙 `(a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)` 하나다.

## 스택 두 개를 등지게 붙이기
큐는 앞에서 빼고 뒤에 넣는다. 뒤에 넣는 스택 `in`과 앞에서 빼는 스택 `out`을 두고, `out`이 비었을 때만 `in`을 통째로 뒤집어 `out`에 옮긴다.
```text
큐 순서: a b c d e
out: [c b a  ← 꼭대기가 맨 앞
in:  [d e    ← 꼭대기가 맨 뒤
```
두 스택이 각자 집계를 쌓되 방향이 다르다. `in`에서는 새 값이 가장 뒤이므로 `집계 = 아래 집계 ⊕ x`, `out`에서는 새 값이 가장 앞이므로 `집계 = x ⊕ 아래 집계`다. 큐 전체 집계는 `out 집계 ⊕ in 집계`다. 교환 법칙이 없는 연산에서는 이 방향이 정답을 가른다.
```python
from math import gcd

class AggStack:                      # 원소마다 (값, 바닥~여기 집계)
    def __init__(self, op, front=False):
        self.op, self.front, self.a = op, front, []
    def push(self, x):
        g = x
        if self.a:
            y = self.a[-1][1]
            g = self.op(x, y) if self.front else self.op(y, x)
        self.a.append((x, g))
    def pop(self): return self.a.pop()[0]
    def agg(self): return self.a[-1][1]

class AggQueue:
    def __init__(self, op):
        self.op, self.moves = op, 0
        self.inb, self.out = AggStack(op), AggStack(op, front=True)
    def push(self, x): self.inb.push(x)
    def pop(self):
        if not self.out.a:           # out이 빌 때만 통째로 옮긴다
            while self.inb.a:
                self.out.push(self.inb.pop())
                self.moves += 1
        return self.out.pop()
    def agg(self):
        parts = [s.agg() for s in (self.out, self.inb) if s.a]
        return parts[0] if len(parts) == 1 else self.op(*parts)

st = AggStack(min)                   # 최솟값 스택
for x in [5, 3, 7, 2]: st.push(x)
mins = [st.agg()]
st.pop(); mins.append(st.agg())

def window(a, k, op):
    q, out = AggQueue(op), []
    for i, x in enumerate(a):
        q.push(x)
        if i >= k: q.pop()
        if i >= k - 1: out.append(q.agg())
    return out

print(mins, window([12, 18, 24, 9, 27, 36], 3, gcd))
```
```text
[2, 3] [6, 3, 3, 9]
```

## 왜 분할 상환 O(1)인가
비용을 스택 push·pop 횟수로 세면 원소 하나는 `in`에 들어가고(1), 옮겨지고(2), `out`에서 나온다(1). 그래서 n번의 총비용은 4n 이하다. 다만 옮기는 그 한 번은 `in`의 크기만큼 걸린다. 퍼텐셜을 `Φ = 2·len(in)`으로 두면 상각 비용이 모두 상수다.
```text
push: 1 + 2 = 3
pop, 옮기기 없음: 1 + 0 = 1
pop, m개 옮김: (2m + 1) − 2m = 1
```
집계 연산 ⊕도 같다. 원소당 `in`에 넣을 때 한 번, 옮길 때 한 번이고, 질의마다 한 번 더 쓴다.

## 무작위 대조 검사
앞 코드에 이어서, gcd·min과 함께 교환 법칙이 없는 2×2 행렬 곱(mod 7)으로 창 집계를 구간마다 다시 접은 값과 비교한다. 꺼낸 값의 순서도 `collections.deque`와 비교한다.
```python
import random
from collections import deque
from functools import reduce

def matmul(A, B):                    # 2×2 행렬 (a, b, c, d), mod 7
    a, b, c, d = A; e, f, g, h = B
    return ((a*e + b*g) % 7, (a*f + b*h) % 7,
            (c*e + d*g) % 7, (c*f + d*h) % 7)

rng, ok = random.Random(2), 0
for case in range(500):
    n, k = rng.randint(1, 40), rng.randint(1, 10)
    a = [rng.randint(1, 60) for _ in range(n)]
    m = [tuple(rng.randrange(7) for _ in range(4)) for _ in range(n)]
    same = all(window(xs, k, op) == [reduce(op, xs[i:i + k])
                                     for i in range(n - k + 1)]
               for xs, op in ((a, gcd), (a, min), (m, matmul)))
    q, ref = AggQueue(min), deque()
    for _ in range(60):
        if ref and rng.random() < 0.45:
            same &= q.pop() == ref.popleft()
        else:
            x = rng.randint(1, 99); q.push(x); ref.append(x)
        same &= (not ref) or q.agg() == min(ref)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```
min과 gcd는 교환 법칙이 있어서 `in`·`out`의 집계 방향을 뒤바꿔도 통과한다. 행렬 곱을 함께 넣어야 그 실수가 잡힌다.

## 연산 수 세기
앞 코드에 이어서, n = 3000, k = 300에서 ⊕ 호출 수와 원소 이동 수를 센다.
```python
calls = [0]
def counted_gcd(x, y):
    calls[0] += 1
    return gcd(x, y)

rng = random.Random(5)
a = [rng.randint(1, 10**6) for _ in range(3000)]
k = 300
q = AggQueue(counted_gcd)
for i, x in enumerate(a):
    q.push(x)
    if i >= k: q.pop()
    if i >= k - 1: q.agg()
slides = len(a) - k + 1
print(f"두 스택: 창당 ⊕ {calls[0] / slides:.2f}회, "
      f"원소당 이동 {q.moves / len(a):.2f}회")
print(f"매번 다시 접기: 창당 ⊕ {k - 1}회")
```
```text
두 스택: 창당 ⊕ 3.10회, 원소당 이동 0.90회
매번 다시 접기: 창당 ⊕ 299회
```
창당 ⊕가 3회 안팎으로 k와 무관하다. 단조 덱은 최솟값·최댓값 전용인 대신 가려진 원소를 버려 더 가볍고, 두 스택 방법은 아무 결합 연산에나 쓰는 대신 원소마다 집계를 하나씩 더 저장한다. 옮기는 순간 한 번은 O(k)로 튀므로, 매 단계 최악 O(1)이 필요하면 옮기기를 조금씩 나눠 하는 실시간 변형을 쓴다(19편의 함수형 큐와 같은 발상).

## 스택 두 개로 덱 만들기
양 끝에서 넣고 빼는 덱도 스택 두 개 `f`(꼭대기 = 맨 앞)와 `b`(꼭대기 = 맨 뒤)로 만든다. 문제는 한쪽이 비었을 때다. 다른 쪽을 **전부** 옮기면 앞·뒤에서 번갈아 빼는 입력에서 매번 전부를 오가며 O(n)이 된다. **바닥 쪽 절반만** 옮기면 두 스택 크기가 비슷해진다. `Φ = ∣len(f) − len(b)∣`로 두면 넣기·빼기는 Φ를 1만 바꾸고, m개짜리 스택을 나누는 비용 m은 Φ가 m에서 1 이하로 떨어지며 갚는다.
```python
class TwoStackDeque:
    def __init__(self, half=True):
        self.f, self.b, self.half, self.moves = [], [], half, 0
    def push_front(self, x): self.f.append(x)
    def push_back(self, x): self.b.append(x)
    def _refill(self, src, dst):     # dst가 비었을 때 src 바닥 쪽을 옮긴다
        k = (len(src) + 1) // 2 if self.half else len(src)
        dst.extend(reversed(src[:k]))
        src[:] = src[k:]
        self.moves += len(src) + k   # 스택 조작으로 치면 원소 수만큼
    def pop_front(self):
        if not self.f:
            if not self.b: raise IndexError
            self._refill(self.b, self.f)
        return self.f.pop()
    def pop_back(self):
        if not self.b:
            if not self.f: raise IndexError
            self._refill(self.f, self.b)
        return self.b.pop()

for half in (True, False):           # 뒤로 n개 넣고 앞·뒤 번갈아 빼기
    d = TwoStackDeque(half)
    for x in range(2000): d.push_back(x)
    got = [d.pop_front() if i % 2 == 0 else d.pop_back()
           for i in range(2000)]
    print("반씩" if half else "전부", d.moves / 2000)

rng, ok = random.Random(9), 0
for _ in range(500):
    d, ref, same = TwoStackDeque(), deque(), True
    for _ in range(80):
        op = rng.randrange(4)
        if op < 2:
            x = rng.randrange(100)
            (d.push_front, d.push_back)[op](x)
            (ref.appendleft, ref.append)[op](x)
        elif ref:
            same &= (d.pop_front() if op == 2 else d.pop_back()) == \
                    (ref.popleft() if op == 2 else ref.pop())
    ok += same and d.f[::-1] + d.b == list(ref)
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
반씩 1.0
전부 1000.5
무작위 500개 비교: 500개 일치
```
반씩 옮기면 빼기당 이동이 1.0번이고, 전부 옮기면 1000.5번으로 n/2에 비례한다. 반씩 옮긴 덱은 첫 빼기에서 2000개를 한 번 나눈 뒤 양쪽이 동시에 바닥날 때까지 다시 옮길 일이 없다.

## 자주 하는 실수와 변형
- `out`이 비지 않았는데 옮기기: 앞쪽 순서가 뒤섞인다. 옮기는 조건은 "`out`이 비었을 때"뿐이다.
- 비가환 연산에서 두 스택의 집계 방향 혼동: min·gcd 테스트로는 안 잡히므로 행렬 곱 같은 비가환 연산으로 검사한다.
- 덱에서 전부 옮기기: 위 실험처럼 빼기 한 번에 평균 1000번을 옮긴다.
- 변형 유형: 길이 k 구간마다 곱 mod p(0이 섞여 역원이 없을 때), 구간 OR·AND, 함수 합성(일차 함수 `ax + b`를 이어 붙이기)의 구간 결과.

## 복잡도
| 연산 | 두 스택 집계 큐 | 매번 다시 접기 |
|---|---|---|
| push | O(1) | O(1) |
| pop | 분할 상환 O(1) | O(1) |
| 전체 집계 | O(1) | O(k) |
| 공간 | O(k) | O(k) |

- 원소마다 스택 조작 4번, ⊕ 2번에 질의당 ⊕ 1번이라 창 n개에 O(n)이다. 스택 두 개 덱도 Φ = ∣len(f) − len(b)∣로 연산당 분할 상환 O(1)이다.

## 어디에 쓰이나
- 알고리즘 기법 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」: 최솟값·최댓값이면 그 글의 단조 덱이 더 가볍고, gcd·행렬 곱·함수 합성처럼 결합 법칙만 있는 연산이면 이 글의 집계 큐로 바꾼다.
- 고급 자료 구조 6편 「희소 테이블: O(1) 구간 최솟값 질의」: 겹쳐 세도 되는 연산의 정적 배열에는 희소 테이블이 질의마다 O(1)이지만, 스트림이나 비멱등 연산에는 집계 큐가 맞다.
- 선형대수 3편 「행렬과 행렬 곱」: 행렬 곱은 결합 법칙만 있고 교환 법칙은 없어서 집계 큐가 요구하는 최소 조건만 갖춘 대표 예이고, 집계 방향 실수를 잡는 시험 연산이 된다.
- 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 옛 버전을 여러 번 다시 쓰면 같은 "옮기기"가 되풀이되어 이 글의 분할 상환이 깨진다.

## 정리
- 원소마다 바닥부터의 집계를 함께 쌓으면 스택의 집계가 O(1)이다.
- `out`이 빌 때만 `in`을 뒤집어 옮기는 큐는 Φ = 2·len(in)으로 연산당 분할 상환 O(1)이다.
- 두 스택의 집계 방향만 지키면 결합 법칙 하나로 구간 집계가 되고, 창당 ⊕가 약 3회였다.
- 덱은 한쪽이 비면 반만 옮겨야 하고, 전부 옮기면 번갈아 빼기에서 O(n)이 된다.

## 더 알아보기
- 이전 글: 1편 「추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기」
- 다음 글: 3편 「이중 우선순위 큐: 최소-최대 힙과 구간 힙」
