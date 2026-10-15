# [고급 자료 구조 3/12] 세그먼트 트리: 구간 질의와 점 갱신

> **한 줄 요약** — 세그먼트 트리는 배열을 반씩 나눈 구간마다 답을 미리 합쳐 두는 이진 트리로, 어떤 구간이든 O(log n)개 노드로 쪼개 답하고 원소 하나가 바뀌면 루트까지 O(log n)개만 고치며, 연산이 결합 법칙만 만족하면 합·최솟값·최대 구간합 무엇이든 담는다.

## 이 글에서 다루는 것
- 점 갱신과 구간 질의가 섞이면 배열도 누적 합도 느린 이유
- 재귀형 구현과 질의가 O(log n)인 이유
- 바텀업 반복형 구현
- 결합 법칙과 항등원만 있으면 되는 이유: 최대 구간합과 실패하는 연산
- 변형 유형과 흔한 실수

## 문제: 바뀌는 배열의 구간 합
길이 n 배열에 "i번째를 x로 바꾸기"와 "l~r번째 합 구하기"가 q번 섞여 들어온다. 그냥 배열은 갱신이 O(1)이지만 질의가 O(n)이다. 알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」의 누적 합은 질의가 O(1)이지만 갱신 한 번에 뒤쪽 누적 합을 전부 고쳐야 해서 O(n)이다. n = q = 10⁵이면 어느 쪽이든 10¹⁰ 근처다. 게다가 최솟값은 빼기가 없어서 누적으로 구할 수도 없다. 두 연산을 모두 O(log n)으로 만드는 것이 **세그먼트 트리**(segment tree)다.

## 구조: 구간을 반씩 나눈 트리
루트는 배열 전체를 맡고, 각 노드는 자기 구간을 반으로 나눠 두 자식에게 준다. 잎은 원소 하나다. 노드마다 자기 구간의 합을 저장한다. `a = [5, 2, 7, 1, 3, 6, 4, 8]`이면 다음과 같다.
```text
            [0,7] 36
        ┌──────┴──────┐
     [0,3] 15      [4,7] 21
     ┌──┴──┐       ┌──┴──┐
   [0,1]  [2,3]  [4,5]  [6,7]
     7      8      9     12
```
질의 [1, 6]은 [1,1], [2,3], [4,5], [6,6] 네 조각의 합 2 + 8 + 9 + 4 = 23이다. 질의는 루트에서 시작해 노드 구간이 질의와 겹치지 않으면 0, 통째로 들어오면 저장된 값을 돌려주고, 일부만 겹칠 때만 두 자식으로 내려간다. 각 깊이에서 일부만 겹치는 노드는 질의의 왼쪽 끝이나 오른쪽 끝을 품은 것뿐이라 많아야 2개이고, 그 자식까지 쳐도 깊이마다 방문은 4개 이하다. 그래서 질의 하나가 `4⌈log₂ n⌉`개 노드 안에서 끝난다. 갱신은 잎에서 루트까지의 경로 하나만 다시 계산한다. 이름은 1977년 존 벤틀리(Jon Bentley)가 직사각형 합집합 넓이 문제를 풀며 도입한 구간 트리에서 왔고, 구간 질의에 쓰는 지금의 모습은 같은 뼈대를 다르게 쓴 것이다.

노드 v의 자식을 2v, 2v + 1로 번호 매기면 포인터가 필요 없다. n이 2의 거듭제곱이 아니면 번호가 2n을 넘을 수 있어서 배열은 4n칸을 잡는다.
```python
import random

class SumTree:                             # 재귀형: 노드 v가 a[l..r]의 합
    def __init__(self, a):
        self.n, self.visits = len(a), 0
        self.t = [0] * (4 * self.n)
        self._build(1, 0, self.n - 1, a)

    def _build(self, v, l, r, a):
        if l == r:
            self.t[v] = a[l]
            return
        m = (l + r) // 2
        self._build(2 * v, l, m, a)
        self._build(2 * v + 1, m + 1, r, a)
        self.t[v] = self.t[2 * v] + self.t[2 * v + 1]

    def update(self, i, x, v=1, l=0, r=None):
        r = self.n - 1 if r is None else r
        if l == r:
            self.t[v] = x
            return
        m = (l + r) // 2
        if i <= m:
            self.update(i, x, 2 * v, l, m)
        else:
            self.update(i, x, 2 * v + 1, m + 1, r)
        self.t[v] = self.t[2 * v] + self.t[2 * v + 1]

    def query(self, ql, qr, v=1, l=0, r=None):   # a[ql..qr]의 합
        r = self.n - 1 if r is None else r
        self.visits += 1
        if qr < l or r < ql:
            return 0                       # 겹치지 않음
        if ql <= l and r <= qr:
            return self.t[v]               # 통째로 들어옴
        m = (l + r) // 2
        return (self.query(ql, qr, 2 * v, l, m)
                + self.query(ql, qr, 2 * v + 1, m + 1, r))

rng = random.Random(7)
for _ in range(500):
    a = [rng.randint(-9, 9) for _ in range(rng.randint(1, 30))]
    st = SumTree(a)
    for _ in range(30):
        i, j = sorted(rng.randrange(len(a)) for _ in range(2))
        if rng.random() < 0.5:
            a[i] = rng.randint(-9, 9)
            st.update(i, a[i])
        else:
            assert st.query(i, j) == sum(a[i:j + 1])
print("무작위 500개 비교: 모두 일치")

n = 100_000
st, worst = SumTree([1] * n), 0
for _ in range(2000):
    i, j = sorted(rng.randrange(n) for _ in range(2))
    st.visits = 0
    st.query(i, j)
    worst = max(worst, st.visits)
print("n =", n, " 질의당 최대 방문 노드:", worst)
print("상한 4·⌈log₂ n⌉ =", 4 * (n - 1).bit_length())
```
```text
무작위 500개 비교: 모두 일치
n = 100000  질의당 최대 방문 노드: 67
상한 4·⌈log₂ n⌉ = 68
```
갱신과 질의를 섞은 무작위 500개 경우에서 정의대로 더한 값과 같고, n = 10만에서 질의 하나가 방문한 노드는 최대 67개로 상한 68 안에 든다.

## 바텀업 반복형
잎을 `t[n..2n−1]`에 두고 `t[i] = op(t[2i], t[2i+1])`로 아래에서부터 채우면 재귀 없이 짤 수 있다. 반열린 구간 [l, r)을 질의할 때는 양 끝에서 한 층씩 올라간다. l이 오른쪽 자식(홀수)이면 그 부모 구간에는 l 바깥 원소가 섞이므로 l 노드만 결과에 넣고 l을 한 칸 오른쪽으로 옮긴다. r 쪽도 대칭이다. 메모리는 2n이고 파이썬에서는 함수 호출이 없어서 더 빠르다. 결과를 왼쪽(`left`)과 오른쪽(`right`)에 따로 모으는 이유는 다음 절에서 나온다.

## 결합 법칙만 있으면 된다
세그먼트 트리가 하는 일은 구간을 조각으로 나눠 조각별 답을 미리 합쳐 두고, 질의 때 조각들을 왼쪽부터 차례로 합치는 것이다. 미리 합친 묶음과 질의 때의 묶음이 달라도 결과가 같으려면 `(a ∘ b) ∘ c = a ∘ (b ∘ c)`, 즉 **결합 법칙**이 필요하다. 빈 쪽을 채울 **항등원** e(`e ∘ x = x ∘ e = x`)도 있어야 한다. 이 둘을 갖춘 연산을 모노이드(monoid)라고 부른다. 교환 법칙은 필요 없지만, 그러면 왼쪽 결과와 오른쪽 결과를 따로 모아 순서대로 붙여야 한다. 역원(빼기)도 필요 없어서 누적 합으로 안 되는 최솟값이 된다.

교환 법칙이 없는 예로 **최대 구간합**을 담아 보자. 노드마다 (합, 최대 접두사 합, 최대 접미사 합, 최대 구간합)을 두면, 이어 붙인 구간의 최대 구간합은 "왼쪽 답, 오른쪽 답, 왼쪽 접미사 + 오른쪽 접두사" 중 최댓값이다.
```python
import random
from functools import reduce

class SegTree:                             # 바텀업: 잎이 t[n..2n-1]
    def __init__(self, a, op, e):          # e: 항등원 op(e, x) = x
        self.n, self.op, self.e = len(a), op, e
        self.t = [e] * self.n + list(a)
        for i in range(self.n - 1, 0, -1):
            self.t[i] = op(self.t[2 * i], self.t[2 * i + 1])

    def update(self, i, x):
        i += self.n
        self.t[i] = x
        while i > 1:
            i //= 2
            self.t[i] = self.op(self.t[2 * i], self.t[2 * i + 1])

    def query(self, l, r):                 # 반열린 구간 [l, r)
        left, right = self.e, self.e
        l, r = l + self.n, r + self.n
        while l < r:
            if l & 1:                      # l이 오른쪽 자식이면 따로 챙긴다
                left = self.op(left, self.t[l])
                l += 1
            if r & 1:
                r -= 1
                right = self.op(self.t[r], right)   # 순서를 지켜 붙인다
            l, r = l // 2, r // 2
        return self.op(left, right)

INF = float("inf")
def leaf(x):                     # (합, 최대 접두사, 최대 접미사, 답)
    return (x, x, x, x)

def best(p, q):                  # 결합 법칙 O, 교환 법칙 X
    if p is None or q is None:
        return q if p is None else p
    return (p[0] + q[0], max(p[1], p[0] + q[1]),
            max(q[2], q[0] + p[2]), max(p[3], q[3], p[2] + q[1]))

def avg(x, y):                   # 두 값의 평균(내림)
    if x is None or y is None:
        return y if x is None else x
    return (x + y) // 2

rng, bad = random.Random(8), 0
for _ in range(500):
    a = [rng.randint(-9, 9) for _ in range(rng.randint(1, 25))]
    mn = SegTree(a, min, INF)
    mx = SegTree([leaf(x) for x in a], best, None)
    av = SegTree(a, avg, None)             # 결합 법칙이 없는 연산
    for _ in range(20):
        i = rng.randrange(len(a))
        a[i] = rng.randint(-9, 9)
        mn.update(i, a[i]); mx.update(i, leaf(a[i])); av.update(i, a[i])
        l = rng.randrange(len(a)); r = rng.randint(l + 1, len(a))
        assert mn.query(l, r) == min(a[l:r])
        brute = max(sum(a[s:t]) for s in range(l, r)
                    for t in range(s + 1, r + 1))
        assert mx.query(l, r)[3] == brute
        bad += av.query(l, r) != reduce(avg, a[l:r])
print("무작위 500개 비교(최솟값, 최대 구간합): 모두 일치")
print("평균 연산: 질의 10000개 중 틀린 답", bad)
```
```text
무작위 500개 비교(최솟값, 최대 구간합): 모두 일치
평균 연산: 질의 10000개 중 틀린 답 3876
```
최솟값과 최대 구간합은 정의대로 구한 값과 모두 같다. 반면 내림 평균은 `avg(avg(1, 2), 3) = 2`이고 `avg(1, avg(2, 3)) = 1`이라 결합 법칙이 없고, 트리에 넣으면 왼쪽부터 차례로 계산한 값과 질의의 약 39%가 달라진다. 새 연산을 넣기 전에 결합 법칙과 항등원부터 확인해야 하는 이유다.

## 변형 유형과 흔한 실수
- 누적 합이 처음 x 이상이 되는 위치(k번째 원소): 루트에서 왼쪽 자식의 합과 비교하며 한쪽으로만 내려가면 O(log n)이다. 값을 인덱스로 쓰는 "개수 트리"에서 k번째로 작은 값 찾기가 이것이다.
- 구간 전체에 더하기·대입하기는 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」의 레이지 전파로 넘어간다.
- 직사각형 합집합 넓이는 알고리즘 기법 10편 「좌표 압축과 스위핑: 정렬해 놓고 한 방향으로 쓸기」의 스위핑과 함께 쓴다.
- 실수: 재귀형 배열을 2n만 잡기, 닫힌 구간과 반열린 구간 섞기, 최솟값 트리의 항등원을 0으로 두기(∞여야 한다).

## 복잡도
| 방법 | 점 갱신 | 구간 질의 |
|---|---|---|
| 그냥 배열 | O(1) | O(n) |
| 누적 합 | O(n) | O(1) |
| 세그먼트 트리 | O(log n) | O(log n) |

- 만들기는 노드마다 한 번 합치므로 O(n), 메모리는 재귀형 4n·바텀업 2n이다. 연산 q개는 O(n + q log n)이다.

## 어디에 쓰이나
- 선형대수 3편 「행렬과 행렬 곱」: 행렬 곱은 결합 법칙은 있고 교환 법칙은 없는 대표 연산이라, 노드에 행렬을 담으면 "l~r번째 변환을 차례로 적용한 결과"를 행렬 곱 O(log n)번으로 구한다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: 블록별 (m, ℓ, o)를 합치는 병합 공식이 결합 법칙을 만족하므로 조각을 따로 계산해 나중에 합칠 수 있다는 점이 세그먼트 트리의 원리와 같다.
- 동적 계획법 3편 「최장 증가 부분 수열: O(n²)에서 O(n log n)으로」: 값 순서로 최댓값 세그먼트 트리를 두면 "나보다 작은 값으로 끝나는 가장 긴 수열"을 O(log n)에 찾아 같은 시간에 LIS를 구할 수 있다.

## 정리
- 세그먼트 트리는 반씩 나눈 구간마다 답을 저장한 이진 트리로, 갱신은 경로 하나, 질의는 깊이마다 4개 이하의 노드를 본다.
- 재귀형은 읽기 쉽고 4n칸, 바텀업형은 짧고 빠르며 2n칸이다.
- 담을 연산은 결합 법칙과 항등원만 있으면 되고, 교환 법칙이 없으면 왼쪽·오른쪽 결과를 순서대로 붙인다.
- 결합 법칙이 없는 연산(평균)은 트리에 넣으면 틀린 답을 낸다.

## 더 알아보기
- 이전 글: 2편 「유니온 파인드: 경로 압축과 랭크」
- 다음 글: 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」
