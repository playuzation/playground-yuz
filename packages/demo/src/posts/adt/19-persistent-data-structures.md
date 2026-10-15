# [추상 데이터 타입 심화 19/21] 퍼시스턴트 자료 구조: 경로 복사와 함수형 큐

> **한 줄 요약** — 갱신할 때 바뀌는 경로의 노드만 새로 만들고 나머지를 옛 버전과 공유하면 모든 과거 버전이 살아 있는 퍼시스턴트 구조가 갱신당 O(log n) 노드로 되지만, 스택 두 개 큐처럼 분할 상환에 기대는 구조는 같은 버전을 재사용하면 깨지므로 오카사키의 게으른 평가와 일정표로 최악 O(1)을 되찾는다.

## 이 글에서 다루는 것
- 퍼시스턴트 ADT: 부분·완전 퍼시스턴스와 구조 공유
- 이진 탐색 트리의 경로 복사와 갱신당 새 노드 수 실험
- 스택 두 개 큐의 분할 상환이 버전 재사용에서 깨지는 예
- 오카사키의 실시간 큐: 게으른 회전과 메모이제이션, 모델 기반 대조

## 문제: 모든 과거 버전에 묻기
편집기의 실행 취소, 데이터베이스의 시점 조회, 백트래킹 탐색은 모두 "버전 v의 집합에서 x보다 작은 원소는 몇 개인가"처럼 과거 상태를 묻는다. 단순한 방법은 갱신마다 전체를 복사하는 것이라 버전 하나에 O(n) 시간과 공간이 든다.

**퍼시스턴트**(persistent) 구조는 갱신이 기존 버전을 바꾸지 않고 새 버전을 돌려준다. 과거 버전을 읽기만 하면 **부분 퍼시스턴스**, 과거 버전에서 갈라져 다시 고칠 수 있으면 **완전 퍼시스턴스**다. 드리스콜·사낙·슬리터·타잔이 1986년에 이를 체계적으로 정리했다. 핵심 기법은 **구조 공유**(structural sharing)다. 연결 리스트 스택의 push는 새 노드가 옛 머리를 가리키게 할 뿐이라 O(1)이고, 옛 스택은 그대로 남는다.

## 경로 복사
이진 탐색 트리에 키를 넣으면 바뀌는 것은 뿌리에서 그 자리까지의 경로뿐이다. 경로 위 노드만 새로 만들고 경로 밖의 서브트리는 옛 노드를 그대로 가리키면 새 뿌리 하나가 새 버전이다. 이를 **경로 복사**(path copying)라 한다. 고급 자료 구조 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」의 방법을 일반 탐색 트리로 옮긴 것이다.

균형은 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」의 트립으로 잡되, 우선순위를 난수 대신 키의 해시로 정한다. 그러면 같은 집합은 기록과 무관하게 같은 모양이 되어 함수형 구조와 잘 맞는다. 회전도 노드를 고치지 않고 새로 만든다.
```python
import math, random

M64 = (1 << 64) - 1
def pri(k):  # 키로 정해지는 우선순위(결정적 해시)
    x = (k * 0x9E3779B97F4A7C15 + 1) & M64
    x = ((x ^ (x >> 31)) * 0xBF58476D1CE4E5B9) & M64
    return x ^ (x >> 29)

NEW = [0]  # 만든 노드 수
class Node:  # 한 번 만들면 바꾸지 않는다
    __slots__ = ("k", "p", "l", "r", "size")
    def __init__(self, k, l, r):
        self.k, self.p, self.l, self.r = k, pri(k), l, r
        self.size = 1 + size(l) + size(r)
        NEW[0] += 1

def size(t):
    return t.size if t else 0

def insert(t, k):  # 새 버전의 뿌리(경로만 복사)
    if t is None:
        return Node(k, None, None)
    if k == t.k:
        return t
    if k < t.k:
        l = insert(t.l, k)
        if l.p > t.p:  # 회전도 새 노드로
            return Node(l.k, l.l, Node(t.k, l.r, t.r))
        return t if l is t.l else Node(t.k, l, t.r)
    r = insert(t.r, k)
    if r.p > t.p:
        return Node(r.k, Node(t.k, t.l, r.l), r.r)
    return t if r is t.r else Node(t.k, t.l, r)

def merge(a, b):  # a의 키가 모두 b보다 작을 때
    if not a or not b:
        return a or b
    if a.p > b.p:
        return Node(a.k, a.l, merge(a.r, b))
    return Node(b.k, merge(a, b.l), b.r)

def delete(t, k):
    if t is None:
        return None
    if k == t.k:
        return merge(t.l, t.r)
    if k < t.k:
        l = delete(t.l, k)
        return t if l is t.l else Node(t.k, l, t.r)
    r = delete(t.r, k)
    return t if r is t.r else Node(t.k, t.l, r)

def rank(t, k):  # 버전 t에서 k 미만 키 개수
    c = 0
    while t:
        if t.k < k:
            c, t = c + size(t.l) + 1, t.r
        else:
            t = t.l
    return c

def keys(t):
    return keys(t.l) + [t.k] + keys(t.r) if t else []

v = [None]
for k in [50, 20, 80, 65]:
    v.append(insert(v[-1], k))
v.append(delete(v[2], 50))  # 과거 버전 2에서 갈라지기
for i, t in enumerate(v):
    print(i, keys(t), rank(t, 60))
print("     n  삽입당 새 노드  2·ln n")
for n in [1000, 10000, 100000]:
    rng, t = random.Random(n), None
    NEW[0] = 0
    for _ in range(n):
        t = insert(t, rng.getrandbits(40))
    print(f"{n:6} {NEW[0] / n:13.1f} {2 * math.log(n):7.1f}")
```
```text
0 [] 0
1 [50] 1
2 [20, 50] 2
3 [20, 50, 80] 2
4 [20, 50, 65, 80] 2
5 [20] 1
     n  삽입당 새 노드  2·ln n
  1000          13.5    13.8
 10000          18.3    18.4
100000          22.8    23.0
```
버전 5는 버전 2에서 50을 지운 것이고, 그 뒤에 만든 버전 3·4는 영향을 받지 않는다. 삽입 한 번에 새 노드는 트립의 기대 깊이 2·ln n 안팎이다. 10만 번 삽입한 모든 버전을 통째 복사로 남기면 노드 약 50억 개가 필요하지만 경로 복사로는 약 230만 개다.

## 분할 상환이 깨지는 곳: 스택 두 개 큐
2편 「스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계」의 큐는 앞 스택이 비면 뒤 스택을 뒤집어 옮기고, 원소마다 한 번만 옮겨지니 분할 상환 O(1)이다. 불변 리스트로 만들면 그대로 퍼시스턴트가 되지만 분할 상환 논증은 깨진다. 논증은 "비싼 뒤집기는 한 번 하고 나면 다시 하지 않는다"인데, 뒤집기 직전 버전 q를 붙잡아 두고 q에서 pop을 거듭하면 매번 처음부터 뒤집기 때문이다. 퍼텐셜은 버전 하나에 한 번만 쓸 수 있는 저금이라, 갈라진 미래들이 같은 저금을 여러 번 찾아 쓰는 셈이다.

**오카사키**(Chris Okasaki)는 1995년에 두 도구로 이를 풀었다. 첫째, 뒤집기를 **게으르게**(lazy) 미뤄 결과 리스트의 칸을 필요할 때 한 칸씩 계산하고, 한 번 계산한 칸은 **기억**(memoization)해 같은 칸을 공유하는 모든 버전이 다시 계산하지 않게 한다. 둘째, 실시간 큐는 회전을 뒤 리스트가 앞보다 하나 길어지는 순간 시작하고, **일정표**(schedule)를 따라 연산마다 한 칸씩 미리 계산해 둔다. 앞 리스트를 다 쓰기 전에 회전이 끝나므로 연산마다 최악 O(1)이다. 앞 코드에 이어서, 0~999를 넣은 버전 q에서 200번 갈라져 각각 pop을 50번씩 하며 연산당 일(뒤집기 이동 또는 지연 칸 계산)을 센다.
```python
STEPS = [0]

def rev(s):  # cons 리스트 (머리, 꼬리) 뒤집기
    out = None
    while s:
        out, s = (s[0], out), s[1]
        STEPS[0] += 1
    return out

class BQ:  # 스택 두 개 큐: 앞이 비면 뒤를 뒤집는다
    def __init__(self, f=None, r=None):
        self.f, self.r = (rev(r), None) if f is None else (f, r)
    def push(self, x):
        return BQ(self.f, (x, self.r))
    def pop(self):
        return self.f[0], BQ(self.f[1], self.r)

class Lazy:  # 처음 한 번만 계산하고 기억하는 칸
    __slots__ = ("fn", "val")
    def __init__(self, fn=None, val=None):
        self.fn, self.val = fn, val
    def force(self):
        if self.fn:
            self.val, self.fn = self.fn(), None
            STEPS[0] += 1
        return self.val  # None(끝) 또는 (머리, 꼬리 Lazy)

EMPTY = Lazy()

def rotate(f, r, a):  # f ++ reverse(r) ++ a 를 한 칸씩 게으르게
    def step():
        fv = f.force()
        if fv is None:
            return (r[0], a)
        return (fv[0], rotate(fv[1], r[1], Lazy(val=(r[0], a))))
    return Lazy(step)

class RTQ:  # 실시간 큐: 앞(지연 리스트), 뒤(cons), 일정표
    def __init__(self, f=EMPTY, r=None, s=EMPTY):
        self.f, self.r, self.s = f, r, s
    def push(self, x):
        return settle(self.f, (x, self.r), self.s)
    def pop(self):
        x, rest = self.f.force()
        return x, settle(rest, self.r, self.s)

def settle(f, r, s):  # 연산마다 일정표 한 칸만 계산한다
    sv = s.force()
    if sv is not None:
        return RTQ(f, r, sv[1])
    g = rotate(f, r, EMPTY)  # 일정표가 비면 |뒤| = |앞| + 1
    return RTQ(g, None, g)

def reuse(q):  # 같은 버전 q에서 200번 갈라져 각각 50번 pop
    m = tot = 0
    for _ in range(200):
        p = q
        for _ in range(50):
            STEPS[0] = 0
            _, p = p.pop()
            m, tot = max(m, STEPS[0]), tot + STEPS[0]
    return m, tot / 10000

print("push최대  재사용 pop: 최대 평균  구현")
for name, Q in (("스택 두 개", BQ), ("실시간", RTQ)):
    q, m = Q(), 0
    for x in range(1000):
        STEPS[0] = 0
        q = q.push(x)
        m = max(m, STEPS[0])
    w, avg = reuse(q)
    print(f"{m:8} {w:12} {avg:6.2f}  {name}")
```
```text
push최대  재사용 pop: 최대 평균  구현
       1          999  19.98  스택 두 개
       1            1   0.54  실시간
```
스택 두 개 큐는 갈라질 때마다 첫 pop에서 999칸을 뒤집어 평균이 약 20이고, 갈라진 뒤 한 번씩만 pop하면 연산당 999로 큐 길이에 비례한다. 실시간 큐는 어떤 연산도 지연 칸을 1개 넘게 계산하지 않았다. 갈라진 버전들이 같은 회전 칸을 공유하고, 한 번 계산한 칸은 기억되기 때문이다.

## 모델 기반 무작위 대조
앞 코드에 이어서, 매번 **임의의 과거 버전**을 골라 갱신해 버전 트리를 만들고 파이썬 리스트로 만든 정답 버전들과 비교한다. 끝에서 모든 버전의 내용과 순위 질의, 트립의 힙 순서와 크기를 검사한다.
```python
def qlist(q):  # 앞 지연 리스트 + 뒤집은 뒤 리스트
    out, z, r, back = [], q.f, q.r, []
    while (c := z.force()) is not None:
        out.append(c[0]); z = c[1]
    while r:
        back.append(r[0]); r = r[1]
    return out + back[::-1]

def ok_tree(t):  # 힙 순서와 크기
    return t is None or (size(t) == 1 + size(t.l) + size(t.r) and
        all(c is None or c.p < t.p for c in (t.l, t.r)) and
        ok_tree(t.l) and ok_tree(t.r))

rng, ok = random.Random(19), 0
for case in range(300):
    tv, tr, qv, qr, good = [None], [[]], [RTQ()], [[]], True
    for _ in range(60):
        i, j = rng.randrange(len(tv)), rng.randrange(len(qv))
        k = rng.randrange(30)
        if rng.random() < 0.6:
            tv.append(insert(tv[i], k)); tr.append(sorted(set(tr[i]) | {k}))
        else:
            tv.append(delete(tv[i], k)); tr.append([x for x in tr[i] if x != k])
        if qr[j] and rng.random() < 0.4:
            x, q2 = qv[j].pop()
            good &= x == qr[j][0]; qv.append(q2); qr.append(qr[j][1:])
        else:
            qv.append(qv[j].push(k)); qr.append(qr[j] + [k])
    good &= all(keys(t) == r and ok_tree(t) and rank(t, 15) ==
                sum(x < 15 for x in r) for t, r in zip(tv, tr))
    ok += good and all(qlist(q) == r for q, r in zip(qv, qr))
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 자주 하는 실수와 변형
- 새 버전을 만들다 옛 노드의 필드를 한 줄이라도 고치면 공유하던 모든 버전이 함께 바뀐다. 위 대조처럼 옛 버전을 끝까지 다시 검사해야 잡힌다.
- 분할 상환 구조를 퍼시스턴트로 쓰고 복잡도를 그대로 믿는 실수. 버전을 재사용하는지 먼저 따진다.
- 변형: 노드에 여분 칸을 두어 경로 복사 없이 갱신당 분할 상환 O(1) 공간을 쓰는 **노드 복사**(드리스콜 외, 부분 퍼시스턴스)가 있다. 큐 말고 덱도 같은 방식으로 실시간이 된다.

## 복잡도
| 연산 | 경로 복사 트립 | 통째 복사 |
|---|---|---|
| 갱신 시간·새 공간 | 기대 O(log n) | O(n) |
| 과거 버전 질의 | 기대 O(log n) | O(log n) |

| 큐 | 일시적 사용 | 버전 재사용 |
|---|---|---|
| 스택 두 개 | 분할 상환 O(1) | 연산당 O(n) |
| 실시간 큐 | 최악 O(1) | 최악 O(1) |

- 실험의 근거: 삽입당 새 노드가 2·ln n 안팎이었고, 실시간 큐는 재사용해도 연산당 지연 칸 계산이 1개 이하였다.

## 어디에 쓰이나
- 고급 자료 구조 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」: 점 갱신마다 경로의 O(log n) 노드만 새로 만드는 것이 이 글의 경로 복사이고, 구간 k번째 수 같은 질의가 버전 두 개의 차이로 풀린다.
- 20편 「로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스」: 핑거 트리는 게으른 평가를 써서, 분할 상환 한계가 퍼시스턴트하게 써도 유지된다고 하스켈 `Data.Sequence` 문서가 밝힌다.
- 함수형 언어의 불변 컬렉션, 편집기의 실행 취소 기록, 버전 관리 시스템이 바뀌지 않은 파일·디렉터리 객체를 여러 커밋이 공유하는 것도 같은 구조 공유다.

## 정리
- 퍼시스턴트 구조는 갱신이 새 버전을 돌려주고, 바뀐 경로만 복사해 나머지를 공유한다.
- 해시 우선순위 트립의 경로 복사는 삽입당 새 노드가 약 2·ln n이었고, 임의 버전에서 갈라지는 대조에서도 모든 과거 버전이 온전했다.
- 분할 상환은 버전 재사용에 깨진다. 스택 두 개 큐는 갈라질 때마다 999칸을 다시 뒤집었다.
- 오카사키의 게으른 회전 + 기억 + 일정표로 실시간 큐는 재사용해도 연산당 최악 O(1)이다.

## 더 알아보기
- 이전 글: 18편 「스트림 요약 구조: 카운트-민 스케치와 하이퍼로그로그」
- 다음 글: 20편 「로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스」
- 위키백과 Persistent data structure: https://en.wikipedia.org/wiki/Persistent_data_structure
