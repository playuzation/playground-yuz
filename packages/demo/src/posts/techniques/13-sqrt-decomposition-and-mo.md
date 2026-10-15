# [알고리즘 기법 13/14] 제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게

> **한 줄 요약** — 배열을 √n 크기 블록으로 나누면 어떤 구간이든 통 블록 몇 개와 양끝 자투리 칸으로 덮여 갱신·질의가 O(√n)이 되고, 질의를 미리 다 알 때는 블록 기준으로 정렬해 구간 창을 조금씩만 움직이는 Mo's 알고리즘으로 O((n + q)√n)에 답한다.

## 이 글에서 다루는 것
- 제곱근 분할: 통 블록과 자투리 칸으로 구간 덮기
- 구간 더하기 + 구간 합을 O(√n)에
- Mo's 알고리즘: 오프라인 질의를 정렬해 창 이동 줄이기
- 구간 안 서로 다른 수의 개수
- 블록 크기 고르기: n/√q와 지그재그 순서

## 예제 문제
길이 n = 10⁵인 배열에 두 종류의 일이 주어진다. ① "구간 [l, r]에 v 더하기"와 "구간 [l, r]의 합"이 섞인 연산 10⁵개, ② "구간 [l, r] 안의 서로 다른 수의 개수" 질의 10⁵개. 매번 구간을 훑으면 연산당 O(n)이라 모두 10¹⁰ 근처다. 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」의 누적 합은 갱신이 끼어들 때마다 다시 만들어야 해서 ①에 맞지 않는다.

## 제곱근 분할
배열을 크기 B인 블록으로 자르면 구간 [l, r]은 왼쪽 자투리(B칸 미만) + 통 블록(n/B개 이하) + 오른쪽 자투리(B칸 미만)로 나뉜다.
```text
칸:   0 1 2 │ 3 4 5 │ 6 7 8 │ 9
블록:   0   │   1   │   2   │ 3
[1, 9] = 칸 1, 2 + 블록 1, 2 + 칸 9
```
블록마다 합 `sum`과 "블록 전체에 미뤄 둔 더하기" `add`를 두면 통 블록은 O(1)에 처리된다. 자투리 칸은 하나씩 고치되 블록 합도 함께 고친다. 연산 하나의 비용은 O(B + n/B)이고, 이 합은 B = √n일 때 가장 작아 O(√n)이다. 이 방식을 **제곱근 분할**(sqrt decomposition)이라 한다.
```python
import random

class SqrtArray:                          # 구간 더하기 + 구간 합
    def __init__(self, a):
        self.n, self.B = len(a), max(1, int(len(a) ** 0.5))
        self.a = a[:]
        nb = (self.n + self.B - 1) // self.B
        self.sum, self.add = [0] * nb, [0] * nb   # 블록 합, 블록 전체에 미룬 값
        for i, x in enumerate(a):
            self.sum[i // self.B] += x
        self.touch = 0                    # 건드린 칸·블록 수

    def _walk(self, l, r, one, block):    # [l, r]을 낱개 칸과 통 블록으로 나눈다
        B, i = self.B, l
        while i <= r:
            if i % B == 0 and i + B - 1 <= r:
                block(i // B); i += B
            else:
                one(i); i += 1
            self.touch += 1

    def update(self, l, r, v):
        def one(i): self.a[i] += v; self.sum[i // self.B] += v
        def block(k): self.add[k] += v
        self._walk(l, r, one, block)

    def query(self, l, r):
        res = 0
        def one(i):
            nonlocal res; res += self.a[i] + self.add[i // self.B]
        def block(k):
            nonlocal res
            size = min(self.B, self.n - k * self.B)
            res += self.sum[k] + self.add[k] * size
        self._walk(l, r, one, block)
        return res

rng = random.Random(13)
for _ in range(300):
    n = rng.randint(1, 40)
    a = [rng.randint(-9, 9) for _ in range(n)]
    s = SqrtArray(a)
    for _ in range(30):
        l = rng.randrange(n); r = rng.randrange(l, n)
        if rng.random() < 0.5:
            v = rng.randint(-9, 9); s.update(l, r, v)
            for i in range(l, r + 1): a[i] += v
        else:
            assert s.query(l, r) == sum(a[l:r + 1])
print("무작위 300개 × 연산 30번 비교: 모두 일치")
n = 100000
s, naive = SqrtArray([0] * n), 0
for _ in range(1000):
    l = rng.randrange(n); r = rng.randrange(l, n)
    s.update(l, r, 1); s.query(l, r)
    naive += 2 * (r - l + 1)
print(f"n={n}, 블록 {s.B}: 연산당 {s.touch / 2000:.0f}칸, 단순 {naive / 2000:.0f}칸")
```
```text
무작위 300개 × 연산 30번 비교: 모두 일치
n=100000, 블록 316: 연산당 395칸, 단순 25712칸
```
낱개 칸의 실제 값은 `a[i] + add[블록]`이라는 것, 마지막 블록은 B보다 짧을 수 있다는 것(`size`)이 흔히 틀리는 곳이다. 대조 검사는 갱신과 질의를 섞은 연산열을 단순 리스트와 나란히 돌린다. 같은 일을 고급 자료 구조 4편의 레이지 세그먼트 트리는 O(log n)에 하지만, 제곱근 분할은 "블록마다 정렬해 두고 구간에서 x보다 작은 수 세기"처럼 합치기 어색한 연산에도 쉽게 맞춰진다.

## Mo's 알고리즘
②의 "서로 다른 수의 개수"는 두 블록의 답을 더할 수 없어서 위 방식이 통하지 않는다. 대신 질의를 모두 미리 받아(**오프라인**) 순서를 바꿔 처리한다. 창 [cl, cr]과 값별 개수 `cnt`를 들고, 다음 질의 구간까지 창의 양끝을 한 칸씩 옮긴다. 칸을 넣을 때 개수가 0 → 1이 되면 서로 다른 수가 하나 늘고, 뺄 때 1 → 0이 되면 하나 준다. 한 칸 이동이 O(1)이니 비용은 전체 이동 거리다. 질의를 `(l // B, r)` 순으로 정렬하면, 같은 블록 안에서 r은 한 방향으로만 움직여 블록마다 많아야 n칸, l은 질의마다 많아야 B칸 움직인다.
```text
r 이동: (n/B 블록) × n
l 이동: q × B
합 O(qB + n²/B) → B = n/√q일 때 O(n√q)
```
q가 n과 비슷하면 O(n√n)이고, 질의 정렬 O(q log q)이 더해진다. 홀수 번째 블록에서는 r을 거꾸로 정렬하면(지그재그) 블록이 바뀔 때 r이 처음으로 되돌아가는 낭비가 준다. 이 이름은 2009년 무렵 중국 정보 올림피아드 캠프의 문제와 함께 이 기법을 널리 알린 모타오(莫涛)에게서 왔고, 비슷한 아이디어는 그 전에도 있었다.
```python
import random

def mo_distinct(a, queries):              # queries: (l, r) 닫힌 구간
    B = max(1, int(len(a) / len(queries) ** 0.5))
    def key(i):                           # 블록 순, 블록 안에서는 r을 지그재그로
        l, r = queries[i]
        return (l // B, r if l // B % 2 == 0 else -r)
    cnt, ans = {}, [0] * len(queries)
    distinct, moves, cl, cr = 0, 0, 0, -1     # 지금 창은 a[cl..cr]
    def add(i):
        nonlocal distinct, moves
        cnt[a[i]] = cnt.get(a[i], 0) + 1
        distinct += cnt[a[i]] == 1; moves += 1
    def remove(i):
        nonlocal distinct, moves
        cnt[a[i]] -= 1
        distinct -= cnt[a[i]] == 0; moves += 1
    for qi in sorted(range(len(queries)), key=key):
        l, r = queries[qi]
        while cr < r: cr += 1; add(cr)    # 넓히기를 먼저, 좁히기는 나중에
        while cl > l: cl -= 1; add(cl)
        while cr > r: remove(cr); cr -= 1
        while cl < l: remove(cl); cl += 1
        ans[qi] = distinct
    return ans, moves

def rand_queries(rng, n, q):
    return [tuple(sorted((rng.randrange(n), rng.randrange(n))))
            for _ in range(q)]

rng = random.Random(13)
for _ in range(300):
    n = rng.randint(1, 30)
    a = [rng.randint(0, 5) for _ in range(n)]
    qs = rand_queries(rng, n, rng.randint(1, 20))
    assert mo_distinct(a, qs)[0] == [len(set(a[l:r + 1])) for l, r in qs]
print("무작위 300개 비교: 모두 일치")
n = q = 10000
a = [rng.randint(1, 1000) for _ in range(n)]
qs = rand_queries(rng, n, q)
ans, moves = mo_distinct(a, qs)
assert ans == [len(set(a[l:r + 1])) for l, r in qs]
print(f"n=q={n}: 포인터 이동 {moves}번, 구간 길이 합 {sum(r - l + 1 for l, r in qs)}")
```
```text
무작위 300개 비교: 모두 일치
n=q=10000: 포인터 이동 844558번, 구간 길이 합 33469320
```
질의마다 구간을 새로 훑는 방법은 길이 합만큼, 약 3,300만 칸을 본다. Mo's는 84만 번 움직여 40배 가까이 적다. 넓히기를 먼저 하는 것은 좁히기를 먼저 하면 창이 잠시 뒤집혀(cl > cr + 1) 넣지도 않은 칸을 빼게 되기 때문이다.

## 블록 크기 고르기
블록 크기는 √n이 아니라 n/√q가 기준이다. n = 10⁵, q = 10⁴에서 정렬 순서만 바꿔 가며 이동 거리를 세어 보자(M은 백만).
```python
import random

def total_moves(queries, B=None, zigzag=True):
    if B:                                 # B가 없으면 들어온 순서 그대로
        def key(q):
            l, r = q
            return (l // B, -r if zigzag and l // B % 2 else r)
        queries = sorted(queries, key=key)
    moves, cl, cr = 0, 0, -1
    for l, r in queries:
        moves += abs(l - cl) + abs(r - cr)
        cl, cr = l, r
    return moves

rng = random.Random(13)
n, q = 100000, 10000
qs = [tuple(sorted((rng.randrange(n), rng.randrange(n)))) for _ in range(q)]
print(f"입력 순서: {total_moves(qs) / 1e6:.1f}M")
for B in [30, 100, 316, 1000, 3000, 10000]:
    print(f"B={B}: {total_moves(qs, B) / 1e6:.1f}M")
print(f"B=1000, 지그재그 없이: {total_moves(qs, 1000, False) / 1e6:.1f}M")
```
```text
입력 순서: 537.3M
B=30: 118.1M
B=100: 45.5M
B=316: 16.5M
B=1000: 8.4M
B=3000: 11.7M
B=10000: 33.1M
B=1000, 지그재그 없이: 13.1M
```
n/√q = 1,000에서 가장 적고, 습관처럼 쓰는 √n ≈ 316은 그 두 배다. 정렬하지 않으면 60배 넘게 움직이고, 지그재그는 같은 블록 크기에서 이동을 3분의 1 이상 줄인다.

## 자주 하는 실수와 변형
- 정렬 키의 r까지 블록 번호로 바꾸면 블록 안에서 r이 단조롭지 않아 이동이 늘어난다. r은 원래 값으로 정렬한다.
- 앞 질의의 답으로 다음 질의를 만드는 **온라인** 문제에는 순서를 바꿀 수 없어 쓸 수 없다. 그때는 고급 자료 구조 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」 같은 온라인 구조를 찾는다.
- 변형: 갱신이 섞이면 시간 축을 하나 더 둔 Mo's(블록 크기 n^(2/3)), 트리 경로 질의는 오일러 투어로 배열에 펴서 Mo's를 쓴다.

## 복잡도
| 작업 | 단순한 방법 | 이 글의 방법 |
|---|---|---|
| 구간 더하기·합 | 연산당 O(n) | 연산당 O(√n) |
| 서로 다른 수 개수 | 질의당 O(n) | 전체 O(n√q + q log q) |
- 공간: 원래 배열 O(n)에 블록 요약 O(√n)이 더해진다. Mo's의 개수표는 서로 다른 값의 수만큼이고, 값을 좌표 압축(10편)해 배열로 두면 딕셔너리보다 빠르다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」: Mo's 정렬은 그 글의 지역성, 곧 "방금 쓴 것 근처를 이어서 쓴다"를 질의 순서 수준에서 만들어 내는 것이고, 블록 단위의 연속 메모리 접근은 캐시 줄과도 잘 맞는다.
- 고급 자료 구조 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」: 블록마다 미뤄 둔 `add`는 레이지 전파의 한 층짜리 판이고, 세그먼트 트리는 이를 log n층으로 쌓아 O(log n)을 얻는다.
- 고급 자료 구조 11편 「오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기」: 서브트리를 배열 구간으로 바꾸면 트리 질의에도 제곱근 분할과 Mo's를 그대로 쓸 수 있다.

## 정리
- 블록 크기 B로 자르면 구간은 통 블록 n/B개와 자투리 2B칸이 되고, B = √n이면 연산당 O(√n)이다.
- 블록마다 요약값과 미뤄 둔 갱신을 두는 것이 핵심이며, 낱개 칸의 실제 값과 마지막 블록 크기를 조심한다.
- 질의를 미리 안다면 (l의 블록, r) 순으로 정렬해 창을 조금씩 옮기는 Mo's로, 합치기 어려운 질의도 O(n√q)에 답한다.
- 블록 크기는 n/√q, 지그재그 정렬, 넓히기 먼저가 실전의 세 가지 손질이다.

## 더 알아보기
- 이전 글: 12편 「중간에서 만나기: 지수를 절반으로 줄이는 기법」
- 다음 글: 14편 「무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기」
