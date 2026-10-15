# [고급 자료 구조 9/12] 퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기

> **한 줄 요약** — 점 갱신은 루트에서 잎까지 한 경로의 노드만 바꾸므로 그 경로만 새로 만들고 나머지는 이전 버전과 공유하면 갱신마다 O(log n)개 노드로 모든 과거 버전을 남길 수 있고, 접두사 버전 두 개의 차로 "구간 k번째로 작은 수"를 O(log n)에 답한다.

## 이 글에서 다루는 것
- 경로 복사(path copying): 바뀐 경로만 새로 만들고 나머지는 공유하기
- 과거 아무 버전에서나 갱신해 분기하기와 무작위 대조
- 구간 k번째 수: 접두사 버전의 차를 따라 내려가기
- 메모리 O(n + q log n)과 함수형 자료 구조와의 연결

## 예제 문제: 지난 버전에 묻기
배열에 점 갱신이 계속 일어나는데, 질의는 "3번째 갱신 직후의 구간 [l, r) 합은?"처럼 과거 시점을 가리킨다. 3편의 세그먼트 트리는 갱신하면 이전 상태가 사라진다. 가장 단순한 방법은 갱신마다 트리(또는 배열)를 통째로 복사하는 것인데, 갱신 하나에 O(n) 시간과 메모리가 들어 n = q = 10⁵이면 10¹⁰칸이 필요하다.

과거 상태를 그대로 남기면서 갱신하는 자료 구조를 **퍼시스턴트**(persistent, 영속) 자료 구조라고 한다. 1986년 드리스콜(Driscoll)·사르낙(Sarnak)·슬리터(Sleator)·타잔(Tarjan)의 논문 「Making data structures persistent」가 이 용어와 체계적인 기법을 정리했다.

## 경로 복사: 바뀌는 것은 한 줄뿐
세그먼트 트리에서 `a[i]` 하나를 바꾸면 값이 달라지는 노드는 잎 i와 그 조상들, 즉 루트에서 잎까지 한 경로의 ⌈log₂ n⌉ + 1개뿐이다. 그 노드들만 새로 만들고, 새 노드의 자식 중 경로 밖에 있는 쪽은 옛 노드를 그대로 가리키게 한다.
```text
버전 0           버전 1 (a2 갱신)
    A                A'
   / \              / \
  B   C           (B)  C'
 / \ / \              / \
a0 a1 a2 a3         a2' (a3)

괄호 = 버전 0의 노드를 공유
```
새 루트 A'에서 내려가면 버전 1이, 옛 루트 A에서 내려가면 버전 0이 그대로 보인다. 이것이 맞으려면 **노드를 만든 뒤에는 절대 고치지 않아야** 한다. 공유된 노드를 고치면 그 노드를 가리키는 모든 버전이 함께 바뀐다. 갱신은 "고치기"가 아니라 "새로 만들기"다.

## 구현: 버전을 남기는 구간 합 트리
노드를 객체 대신 리스트 세 개(왼쪽 자식, 오른쪽 자식, 합)의 같은 칸으로 표현한다. 버전은 루트 번호 하나다.
```python
L, R, S = [], [], []          # 노드 풀: 왼쪽 자식, 오른쪽 자식, 구간 합

def node(l, r, s):            # 노드는 만든 뒤 절대 고치지 않는다
    L.append(l); R.append(r); S.append(s)
    return len(S) - 1

def build(a, lo, hi):
    if hi - lo == 1:
        return node(-1, -1, a[lo])
    mid = (lo + hi) // 2
    l, r = build(a, lo, mid), build(a, mid, hi)
    return node(l, r, S[l] + S[r])

def update(v, lo, hi, i, x):  # 버전 v에서 a[i] = x인 새 버전의 루트
    if hi - lo == 1:
        return node(-1, -1, x)
    mid = (lo + hi) // 2
    if i < mid:
        l, r = update(L[v], lo, mid, i, x), R[v]   # 오른쪽은 공유
    else:
        l, r = L[v], update(R[v], mid, hi, i, x)   # 왼쪽은 공유
    return node(l, r, S[l] + S[r])

def query(v, lo, hi, ql, qr): # [ql, qr) 구간 합
    if qr <= lo or hi <= ql:
        return 0
    if ql <= lo and hi <= qr:
        return S[v]
    mid = (lo + hi) // 2
    return query(L[v], lo, mid, ql, qr) + query(R[v], mid, hi, ql, qr)

a = [5, 3, 8, 6, 1, 4, 7, 2]
n = len(a)
roots = [build(a, 0, n)]                       # 버전 0
print("버전 0 노드 수", len(S))
roots.append(update(roots[0], 0, n, 2, 100))   # 버전 1: a[2] = 100
roots.append(update(roots[0], 0, n, 5, 0))     # 버전 2: 버전 0에서 a[5] = 0
for ver, rt in enumerate(roots):
    print(ver, [query(rt, 0, n, i, i + 1) for i in range(n)],
          query(rt, 0, n, 0, n))
print("전체 노드 수", len(S))
```
```text
버전 0 노드 수 15
0 [5, 3, 8, 6, 1, 4, 7, 2] 36
1 [5, 3, 100, 6, 1, 4, 7, 2] 128
2 [5, 3, 8, 6, 1, 0, 7, 2] 32
전체 노드 수 23
```
버전 2는 버전 1이 아니라 버전 0에서 갈라졌는데도 세 버전이 모두 온전하다. 갱신 한 번에 노드가 log₂ 8 + 1 = 4개씩 늘었다.

## 무작위 대조 검사: 과거 버전에서 분기하기
앞 코드에 이어서, 매번 아무 과거 버전이나 골라 갱신하고(버전이 트리 모양으로 갈라진다), 아무 버전에나 구간 합을 묻는다. 정답은 버전마다 리스트를 통째로 복사해 둔 느린 방법이다.
```python
import random

rng = random.Random(9)
ok = 0
for _ in range(500):
    n = rng.randint(1, 20)
    base = [rng.randrange(10) for _ in range(n)]
    roots, copies = [build(base, 0, n)], [base[:]]   # copies = 통째 복사(정답)
    same = True
    for _ in range(30):
        v = rng.randrange(len(roots))                 # 아무 과거 버전에서 분기
        i, x = rng.randrange(n), rng.randrange(10)
        roots.append(update(roots[v], 0, n, i, x))
        copies.append(copies[v][:])
        copies[-1][i] = x
        w = rng.randrange(len(roots))
        l = rng.randrange(n)
        r = rng.randint(l + 1, n)
        same &= query(roots[w], 0, n, l, r) == sum(copies[w][l:r])
    ok += same
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 구간 k번째 수: 버전의 차로 구간 만들기
퍼시스턴트 세그먼트 트리의 대표 응용은 "배열 `a[l..r]`에서 k번째로 작은 수"를 매번 다른 구간에 대해 묻는 문제다. 단순한 방법은 구간을 잘라 정렬하는 O(len·log len)이다. 아이디어는 이렇다.
- 값을 좌표 압축해 0~m−1의 순위로 바꾸고, 인덱스가 아니라 **값 순위 위의 개수 트리**를 만든다. 노드는 "그 값 범위의 수가 몇 개인가"를 센다.
- `a[0]`, `a[1]`, …을 차례로 하나씩 더하며 버전을 남긴다. 버전 i는 `a[:i]`의 개수 트리다.
- 모든 버전은 모양이 같으므로, 버전 r + 1에서 버전 l을 노드별로 빼면 정확히 `a[l..r]`의 개수 트리다. 누적 합으로 구간 합을 구하는 것과 같은 원리를 트리에 쓴 것이다. 차를 실제로 만들 필요는 없고, 두 버전을 나란히 내려가며 그때그때 뺀다.
- 왼쪽 자식의 개수 차가 k 이상이면 답은 왼쪽 값 범위에 있고, 아니면 그만큼 k에서 빼고 오른쪽으로 간다.

빈 트리를 "자식이 자기 자신이고 개수가 0인 노드 0"으로 두면 `None` 검사 없이 어떤 버전과도 뺄셈이 된다.
```python
import random

class RangeKth:
    def __init__(self, a):
        self.vals = sorted(set(a))               # 좌표 압축
        rank = {x: i for i, x in enumerate(self.vals)}
        self.m = len(self.vals)
        self.L, self.R, self.C = [0], [0], [0]   # 노드 0 = 빈 트리
        self.roots = [0]                         # roots[i] = a[:i]의 개수 트리
        for x in a:
            self.roots.append(self.add(self.roots[-1], 0, self.m, rank[x]))

    def new(self, l, r, c):
        self.L.append(l); self.R.append(r); self.C.append(c)
        return len(self.C) - 1

    def add(self, v, lo, hi, pos):               # 값 pos를 하나 더한 새 버전
        if hi - lo == 1:
            return self.new(0, 0, self.C[v] + 1)
        mid = (lo + hi) // 2
        if pos < mid:
            return self.new(self.add(self.L[v], lo, mid, pos),
                            self.R[v], self.C[v] + 1)
        return self.new(self.L[v], self.add(self.R[v], mid, hi, pos),
                        self.C[v] + 1)

    def kth(self, l, r, k):                      # a[l..r]에서 k번째(1부터) 작은 수
        u, v = self.roots[r + 1], self.roots[l]  # 두 버전의 차 = 구간의 개수
        lo, hi = 0, self.m
        while hi - lo > 1:
            mid = (lo + hi) // 2
            left = self.C[self.L[u]] - self.C[self.L[v]]
            if k <= left:
                u, v, hi = self.L[u], self.L[v], mid
            else:
                u, v, lo, k = self.R[u], self.R[v], mid, k - left
        return self.vals[lo]

rk = RangeKth([5, 1, 4, 1, 3, 9, 2, 6])
print(rk.kth(0, 7, 1), rk.kth(2, 5, 2), rk.kth(1, 6, 4))

rng = random.Random(99)
ok = total = 0
for _ in range(500):
    a = [rng.randrange(10) for _ in range(rng.randint(1, 40))]
    rk = RangeKth(a)
    for _ in range(10):
        l = rng.randrange(len(a))
        r = rng.randrange(l, len(a))
        k = rng.randint(1, r - l + 1)
        ok += rk.kth(l, r, k) == sorted(a[l:r + 1])[k - 1]
        total += 1
print(f"무작위 {total}개 질의 비교: {ok}개 일치")

n = 1000
a = [rng.randrange(10**9) for _ in range(n)]
rk = RangeKth(a)
print("만든 노드", len(rk.C), "통째 복사라면", n * (2 * rk.m - 1))
```
```text
1 3 3
무작위 5000개 질의 비교: 5000개 일치
만든 노드 10977 통째 복사라면 1999000
```
`a[2..5] = [4, 1, 3, 9]`의 2번째는 3이다. 값 0~9로 중복을 일부러 많이 만든 질의 5,000개가 정렬 결과와 모두 같았다. 수 1,000개에 노드는 약 1.1만 개로, 한 번 더할 때마다 경로 길이(⌈log₂ m⌉ + 1 = 11)만큼 늘었다. 버전마다 트리를 복사했다면 약 200만 개가 필요하다.

## 함수형 자료 구조와의 연결
"만든 노드는 고치지 않는다"는 규칙은 함수형 프로그래밍의 불변(immutable) 데이터 그 자체다. 하스켈처럼 값을 고치지 않는 순수 함수형 언어에서는 갱신이 늘 새 값을 돌려주므로 자료 구조가 저절로 퍼시스턴트가 되고, 바뀌지 않은 부분은 이 글처럼 공유된다(구조 공유). 오카사키(Okasaki)의 1998년 책 「Purely Functional Data Structures」가 이런 자료 구조를 정리한 고전이다. 되돌리기(undo) 스택은 마지막 상태로만 돌아가지만, 퍼시스턴트 구조는 모든 버전을 언제든 동시에 읽을 수 있다는 점이 다르다.

## 자주 하는 실수와 변형
- 제자리 수정: `L[v] = ...`처럼 옛 노드를 고치면 과거 버전이 조용히 깨진다. 분기하는 대조 검사가 이를 바로 잡는다.
- 노드 수 어림: 최대 `2n + q·(⌈log₂ n⌉ + 1)`개다. C++이라면 배열을 미리 잡아 둔다.
- 구간 안 x 이하인 수의 개수, 구간 중앙값도 같은 나란히 내려가기로 푼다.
- 트리 경로 위 k번째 수: 정점마다 부모 버전에 자기 값을 더한 버전을 두고, `C[u] + C[v] − C[lca] − C[부모(lca)]`로 경로의 개수를 만든다(10편의 LCA 필요).
- 구간 갱신까지 퍼시스턴트로 하려면 레이지 값을 내려보낼 때도 자식을 복사해야 한다. 레이지 값을 내려보내지 않고 노드에 둔 채 질의 때 더해 가는 방식이 더 단순하다.

## 복잡도
| 항목 | 퍼시스턴트 | 단순한 방법 |
|---|---|---|
| 갱신 1번 | O(log n) | O(n) 통째 복사 |
| 버전 v 질의 | O(log n) | O(log n) |
| 메모리 | O(n + q log n) | O(q·n) |
| 구간 k번째 | O(log m) | O(len·log len) 정렬 |

갱신마다 경로 하나(log n + 1개 노드)만 새로 만드는 것이 시간과 메모리 모두의 근거다. 구간 k번째 수는 버전을 만드는 데 O(n log m), 질의마다 O(log m)이다.

## 어디에 쓰이나
- 3편 「세그먼트 트리: 구간 질의와 점 갱신」: 노드 구조와 질의는 그대로이고, 갱신만 "고치기"에서 "경로를 새로 만들기"로 바꾼 것이다.
- 알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」: 구간 = 접두사 두 개의 차라는 원리를 수 대신 개수 트리에 쓴 것이 구간 k번째 수다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 프로세스를 복제할 때 페이지는 공유하고 쓰기가 일어난 페이지만 복사하는 쓰기 시 복사(copy-on-write)가 같은 발상이다.

## 정리
- 점 갱신은 루트-잎 경로 하나만 바꾸므로, 그 경로만 새로 만들고 나머지를 공유하면 모든 버전이 남는다.
- 노드를 절대 고치지 않는다는 불변 규칙이 공유를 안전하게 만든다.
- 접두사 버전 두 개를 나란히 내려가며 개수를 빼면 구간 k번째 수가 O(log n)이다.
- 메모리는 O(n + q log n)으로, 수 1,000개에서 통째 복사의 약 0.5%였다.

## 더 알아보기
- 이전 글: 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」
- 다음 글: 10편 「최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기」
- 위키백과 Persistent data structure: https://en.wikipedia.org/wiki/Persistent_data_structure
