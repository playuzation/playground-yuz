# [추상 데이터 타입 심화 20/21] 로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스

> **한 줄 요약** — 덱을 넓혀 이어 붙이기와 k번째 위치에서 자르기까지 지원하는 시퀀스 ADT는, 짧은 문자열을 잎에 두고 왼쪽 길이를 무게로 삼는 균형 로프로 편집 한 번에 O(log n) 노드만 만들어 구현하고, 핑거 트리는 양 끝 손가락과 재귀하는 가운데로 양 끝 연산을 분할 상환 O(1)에, 측정값 하나로 인덱스 시퀀스부터 우선순위 큐까지 만든다.

## 이 글에서 다루는 것
- 시퀀스 ADT: 양 끝 추가, 이어 붙이기, 위치에서 자르기, k번째 원소
- 로프: 무게로 찾기, AVL식 이어 붙이기로 균형, 자르기
- 문자열 통째 복사와 노드·복사 글자 수 비교, 모델 기반 대조
- 2-3 핑거 트리의 구조와 모노이드 측정값

## 문제: 100만 자 문서의 중간 편집
텍스트 편집기에서 100만 자 문서의 아무 곳에 글자를 넣고 지우기를 반복한다. 파이썬 `str`은 불변이라 `s[:i] + t + s[i:]`가 매번 약 100만 자를 복사하고, 글자 리스트도 삽입 지점 뒤를 모두 민다. 필요한 것은 **시퀀스**(sequence) ADT다. 덱(1편 「추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기」)의 양 끝 추가·삭제에 더해, 두 시퀀스 이어 붙이기(concat), i번째 위치에서 둘로 자르기(split), k번째 원소 읽기가 모두 빨라야 한다. 삽입은 split + concat 두 번, 삭제는 split 두 번 + concat이다.

## 로프: 잎은 문자열, 안쪽은 이어 붙이기
보엠(Hans Boehm)·앳킨슨·플래스가 1995년 발표한 **로프**(rope)는 잎에 짧은 문자열을, 안쪽 노드에 "왼쪽과 오른쪽을 이어 붙인 것"을 두는 이진 트리다. 안쪽 노드마다 왼쪽 서브트리의 길이를 **무게**(weight)로 기억하면, i번째 글자는 i < 무게면 왼쪽으로, 아니면 i에서 무게를 빼고 오른쪽으로 내려가 찾는다.
```text
       Cat (무게 7)
      /           \
 "Hello, "      "world"
i = 9 → 9 ≥ 7 → 오른쪽 9−7=2 → 'r'
```
균형이 없으면 끝에 한 글자씩 붙이기만 해도 사슬이 된다. 원 논문은 깊이 d인 로프가 길이 F(d+2)(피보나치 수) 이상일 때 균형이라 보고 기준을 벗어나면 다시 균형을 잡는다. 여기서는 7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」의 높이 조건을 쓴다. 이어 붙일 때 높이 차가 1 이하면 새 노드 하나로 끝내고, 아니면 높은 쪽의 안쪽 가장자리를 따라 내려가 붙인 뒤 회전으로 고친다. 비용은 O(높이 차 + 1)이다. 자르기는 경로를 따라 내려가며 잘린 조각들을 이어 붙이는데, 그 비용의 합이 망원 합이 되어 O(log n)이다. 노드를 고치지 않고 새로 만들기만 하므로 옛 버전이 그대로 남는다(19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」).
```python
import random

NODES, COPY = [0], [0]  # 만든 안쪽 노드 수, 복사한 글자 수

class Leaf:
    __slots__ = ("s", "n", "h")
    def __init__(self, s):
        self.s, self.n, self.h = s, len(s), 0
        COPY[0] += len(s)

class Cat:  # 이어 붙이기 노드, 무게(왼쪽 길이) = l.n
    __slots__ = ("l", "r", "n", "h")
    def __init__(self, l, r):
        self.l, self.r = l, r
        self.n, self.h = l.n + r.n, 1 + max(l.h, r.h)
        NODES[0] += 1

def concat(a, b):  # AVL식 이어 붙이기, O(높이 차 + 1)
    if a is None or b is None:
        return a or b
    if a.h == b.h == 0 and a.n + b.n <= 64:  # 짧은 잎은 합친다
        return Leaf(a.s + b.s)
    if abs(a.h - b.h) <= 1:
        return Cat(a, b)
    if a.h > b.h:
        r = concat(a.r, b)
        if r.h <= a.l.h + 1:
            return Cat(a.l, r)
        if r.l.h > r.r.h:  # 이중 회전
            return Cat(Cat(a.l, r.l.l), Cat(r.l.r, r.r))
        return Cat(Cat(a.l, r.l), r.r)
    l = concat(a, b.l)
    if l.h <= b.r.h + 1:
        return Cat(l, b.r)
    if l.r.h > l.l.h:
        return Cat(Cat(l.l, l.r.l), Cat(l.r.r, b.r))
    return Cat(l.l, Cat(l.r, b.r))

def split(t, i):  # (앞 i글자, 나머지), t는 그대로 남는다
    if t is None or i <= 0:
        return None, t
    if i >= t.n:
        return t, None
    if t.h == 0:
        return Leaf(t.s[:i]), Leaf(t.s[i:])
    if i <= t.l.n:
        a, b = split(t.l, i)
        return a, concat(b, t.r)
    a, b = split(t.r, i - t.l.n)
    return concat(t.l, a), b

def build(parts):  # 잎 목록으로 완전 균형 로프
    if len(parts) == 1:
        return Leaf(parts[0])
    m = len(parts) // 2
    return Cat(build(parts[:m]), build(parts[m:]))

def text(t):
    out, st = [], [t] if t else []
    while st:
        x = st.pop()
        if x.h == 0:
            out.append(x.s)
        else:
            st += [x.r, x.l]
    return "".join(out)

def char_at(t, i):  # 무게를 보고 내려간다
    while t.h:
        if i < t.l.n:
            t = t.l
        else:
            i, t = i - t.l.n, t.r
    return t.s[i]

def insert(t, i, s):
    a, b = split(t, i)
    return concat(concat(a, Leaf(s)), b)

def erase(t, i, j):  # [i, j) 지우기
    a, b = split(t, i)
    return concat(a, split(b, j - i)[1])

r = build(["Hello, ", "world"])
r2 = insert(r, 7, "big ")
r3 = erase(r2, 0, 7)
print(text(r), "/", text(r2), "/", text(r3), "/", char_at(r, 9))
```
```text
Hello, world / Hello, big world / big world / r
```

## 통째 복사와 비교
앞 코드에 이어서, 100만 자 문서를 64자 잎으로 쌓고 무작위 위치에 5글자 넣기·지우기를 1,000번 섞는다.
```python
rng = random.Random(20)
doc = "".join(rng.choice("abcdefgh ") for _ in range(10**6))
t = build([doc[i:i + 64] for i in range(0, len(doc), 64)])
NODES[0] = COPY[0] = 0
for _ in range(1000):
    i = rng.randrange(t.n - 5)
    if rng.random() < 0.5:
        t = insert(t, i, "XXXXX")
    else:
        t = erase(t, i, i + 5)
print("편집당 새 노드", NODES[0] / 1000, "/ 복사 글자", COPY[0] / 1000)
print("높이", t.h, "/ 길이", t.n, "/ str이면 편집당 약", len(doc), "글자 복사")
```
```text
편집당 새 노드 38.759 / 복사 글자 91.861
높이 17 / 길이 999990 / str이면 편집당 약 1000000 글자 복사
```
잎 약 15,600개인 로프의 높이는 AVL 상한 1.44·log₂ n 안쪽이고, 편집 한 번에 새 노드 약 39개와 잎 조각 복사 약 92글자로 끝난다. 통째 복사의 1만분의 1 수준이다.

## 모델 기반 무작위 대조
앞 코드에 이어서, 짧은 문자열에 넣기·지우기·글자 읽기·부분 문자열(자르기 두 번)을 섞어 파이썬 `str`과 비교한다. 매번 AVL 불변식(높이 차 1 이하, 높이·길이 필드)을 검사하고, 끝에서 **모든 옛 버전**이 그대로인지 확인한다.
```python
def ok(t):
    if t is None or t.h == 0:
        return t is None or t.n == len(t.s) > 0
    return (abs(t.l.h - t.r.h) <= 1 and t.h == 1 + max(t.l.h, t.r.h)
            and t.n == t.l.n + t.r.n and ok(t.l) and ok(t.r))

rng, good = random.Random(7), 0
for case in range(300):
    t, ref, vers, same = None, "", [], True
    for _ in range(50):
        i = rng.randint(0, len(ref))
        if rng.random() < 0.6 or not ref:
            s = "".join(rng.choice("abc") for _ in range(rng.randint(1, 30)))
            t, ref = insert(t, i, s), ref[:i] + s + ref[i:]
        else:
            j = rng.randint(i, len(ref))
            t, ref = erase(t, i, j), ref[:i] + ref[j:]
        vers.append((t, ref))
        if ref:
            k, j = rng.randrange(len(ref)), rng.randint(0, len(ref))
            mid = split(split(t, min(k, j))[1], abs(j - k))[0]
            same &= char_at(t, k) == ref[k]
            same &= text(mid) == ref[min(k, j):max(k, j)]
        same &= ok(t) and text(t) == ref
    good += same and all(text(v) == s for v, s in vers)
print(f"무작위 300개 비교: {good}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```

## 핑거 트리: 양 끝에 손가락, 가운데는 재귀
힌제(Ralf Hinze)와 패터슨(Ross Paterson)이 2006년 발표한 **2-3 핑거 트리**(finger tree)는 양 끝을 손가락으로 쥐고 있는 구조다.
```text
Deep
├ 왼손가락: 원소 1~4개
├ 가운데: 핑거 트리
│  (원소 = 2~3개 묶음 노드)
└ 오른손가락: 원소 1~4개
```
왼쪽에 넣을 때 손가락이 4개 미만이면 바로 넣고, 꽉 차면 3개를 노드 하나로 묶어 한 층 아래(가운데)로 넘긴다. 넘김이 연쇄되는 일은 드물어 양 끝 연산이 분할 상환 O(1)이고, 층 k의 원소는 맨 아래 원소를 2ᵏ~3ᵏ개 담아 깊이가 O(log n)이다. 이어 붙이기는 O(log min(n₁, n₂)), 자르기는 O(log min(i, n − i))다.

강력한 점은 **측정값**(measure)이다. 노드마다 서브트리의 측정값을 결합 법칙이 있는 연산(모노이드)으로 합쳐 기억해 두고, "누적 측정값이 처음으로 조건을 만족하는 곳"에서 자른다. 측정값이 크기(+, 0)면 i번째 위치에서 자르는 인덱스 시퀀스, 최댓값이면 가장 큰 원소를 찾아 꺼내는 우선순위 큐, 키의 최댓값이면 정렬된 시퀀스가 된다. 같은 코드에 모노이드만 바꾸는 셈이다. 아래는 왼쪽 넣기만 남긴 단순화판으로, 크기를 측정값으로 쓴다. 앞 코드에 이어서 실행한다.
```python
STEPS = [0]

class N3:  # 아래층 원소 3개를 묶은 노드(크기를 기억)
    __slots__ = ("xs", "size")
    def __init__(self, *xs):
        self.xs, self.size = xs, sum(map(size, xs))

def size(x):  # 측정값: 맨 아래 원소는 1
    return x.size if isinstance(x, (N3, Deep)) else 1

class Deep:  # 왼손가락, 가운데(한 층 위 트리), 오른손가락
    __slots__ = ("pre", "mid", "suf", "size")
    def __init__(self, pre, mid, suf):
        self.pre, self.mid, self.suf = pre, mid, suf
        self.size = sum(map(size, pre + suf)) + (size(mid) if mid else 0)

def push_left(t, x):  # 손가락이 넘칠 때만 한 층 아래로
    STEPS[0] += 1
    if t is None:
        return Deep((x,), None, ())
    if len(t.pre) < 4:
        return Deep((x,) + t.pre, t.mid, t.suf)
    a, b, c, d = t.pre
    return Deep((x, a), push_left(t.mid, N3(b, c, d)), t.suf)

for n in [1000, 100000]:
    t, m = None, 0
    STEPS[0] = 0
    for x in range(n):
        before = STEPS[0]
        t = push_left(t, x)
        m = max(m, STEPS[0] - before)
    d, z = 0, t
    while z:
        d, z = d + 1, z.mid
    print(n, "평균", f"{STEPS[0] / n:.2f}", "최대", m, "층", d, "크기", size(t))
```
```text
1000 평균 1.49 최대 6 층 6 크기 1000
100000 평균 1.50 최대 10 층 10 크기 100000
```
넣기 한 번의 평균 일은 1.5층으로 n과 무관하고, 최악은 층 수만큼이다. 하스켈 `Data.Sequence`가 크기를 측정값으로 단 2-3 핑거 트리이고, 원소 하나를 넣어도 바뀌는 노드만 새로 만들어 옛 시퀀스를 공유한다.

## 자주 하는 실수와 변형
- 균형 없이 이어 붙이기만 하면 끝에 덧붙이는 편집이 사슬을 만든다. 높이나 피보나치 기준으로 다시 균형을 잡는다.
- 짧은 잎이 쌓이면 노드가 글자 수만큼 늘어난다. 위 `concat`처럼 이웃한 짧은 잎을 합친다.
- 편집기용 구현은 흔히 글자 수와 함께 줄 수도 측정값으로 달아 "k번째 줄"을 같은 방식으로 찾는다. UTF-8 바이트와 글자 위치를 혼동하지 않는다.
- 변형: 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」의 암시적 트립이나 심화 알고리즘 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」의 위치 스플레이도 같은 시퀀스 ADT를 준다.

## 복잡도
| 연산 | str 통째 복사 | 균형 로프 |
|---|---|---|
| i번째 글자 | O(1) | O(log n) |
| 이어 붙이기 | O(n₁ + n₂) | O(log n) |
| 자르기·삽입·삭제 | O(n) | O(log n) |
| 전체 읽기 | O(n) | O(n) |

- 로프의 근거: 높이가 AVL 조건으로 O(log n)이고, 자르기의 이어 붙이기 비용은 망원 합이다.
- 2-3 핑거 트리: 양 끝 분할 상환 O(1), 이어 붙이기 O(log min(n₁, n₂)), 자르기·인덱스 O(log min(i, n − i)).

## 어디에 쓰이나
- GCC libstdc++에는 SGI STL에서 온 비표준 확장 `<ext/rope>`가 있고, 하스켈 `containers`의 `Data.Sequence`는 크기 측정값 2-3 핑거 트리다(힌제·패터슨 논문 4.2절을 따른다고 문서에 밝힌다).
- 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 로프와 핑거 트리 모두 노드를 고치지 않아 편집 전 버전이 그대로 남고, 실행 취소가 옛 뿌리를 다시 쥐는 것으로 끝난다.
- 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」: 측정값을 결합 법칙으로 합쳐 올리는 것은 분할 정복의 합치기 단계를 트리 노드에 저장해 두는 것과 같다.

## 정리
- 시퀀스 ADT는 덱에 이어 붙이기·자르기·인덱스를 더한 것이고, 삽입·삭제는 자르기와 이어 붙이기로 만든다.
- 로프는 무게(왼쪽 길이)로 위치를 찾고 AVL식 이어 붙이기로 높이를 지켜, 100만 자 문서에서 편집당 새 노드 약 39개로 끝났다.
- 핑거 트리는 양 끝 손가락과 재귀하는 가운데로 양 끝 연산이 분할 상환 O(1)이고, 모노이드 측정값만 바꿔 여러 ADT가 된다.

## 더 알아보기
- 이전 글: 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」
- 다음 글: 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」
- 위키백과 Rope (data structure): https://en.wikipedia.org/wiki/Rope_(data_structure)
