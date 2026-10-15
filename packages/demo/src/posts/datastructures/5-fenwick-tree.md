# [고급 자료 구조 5/12] 펜윅 트리: 비트 하나로 만드는 누적 합 트리

> **한 줄 요약** — 펜윅 트리는 `t[i]`에 "i의 맨 아래 1비트 길이만큼의 구간 합"을 저장해, 인덱스에서 그 비트를 지우거나 더하는 것만으로 점 갱신과 누적 합을 O(log n)에 처리하는 배열 하나짜리 자료 구조이고, 역순 쌍 세기·구간 갱신·2차원 합으로 쉽게 넓어진다.

## 이 글에서 다루는 것
- `i & -i`: 맨 아래 1비트와 각 칸이 맡는 구간
- 점 갱신과 누적 합을 하는 반복문 두 개
- 역순 쌍 세기, 구간 갱신·점 질의, 2차원 펜윅 트리
- 누적 합으로 위치 찾기를 O(log n)에
- 세그먼트 트리와 비교

## 문제와 아이디어
3편 「세그먼트 트리: 구간 질의와 점 갱신」과 같은 문제, 점 갱신과 구간 합이 섞인 경우를 다시 보자. 구간 합은 `prefix(r) − prefix(l − 1)`이므로 누적 합만 빨리 구하면 된다. 합처럼 빼기가 되는 연산이라면 4n칸과 재귀가 필요한 세그먼트 트리보다 훨씬 가벼운 구조가 있다. 1994년 피터 펜윅(Peter Fenwick)이 적응형 산술 부호화의 누적 빈도표를 위해 발표한 **펜윅 트리**(Fenwick tree)로, 이진 인덱스 트리(binary indexed tree, BIT)라고도 한다. 같은 구조를 1989년 보리스 랴브코(Boris Ryabko)가 먼저 제안했다.

인덱스는 1부터 쓴다. `t[i]`는 길이가 `i & -i`인 구간 `(i − (i & -i), i]`의 합을 맡는다. `-i`는 2의 보수라서 i의 비트를 뒤집고 1을 더한 값이고, 그러면 맨 아래 1비트보다 아래는 모두 0, 그 1비트만 i와 겹친다. 그래서 `i & -i`는 i의 맨 아래 1비트다(6 = `0110`이면 2).
- `prefix(i)`: `t[i]`를 더하고 i에서 맨 아래 1비트를 지운다. 7 → 6 → 4 → 0이므로 `t[7] + t[6] + t[4]`, 즉 [7, 7] + [5, 6] + [1, 4]다. 1비트가 하나씩 사라지니 많아야 `log₂ n + 1`번이다.
- `add(i, x)`: i를 품은 칸들만 고친다. i에 맨 아래 1비트를 더해 가면(3 → 4 → 8) 그 칸들을 차례로 만나고, 맨 아래 1비트가 매번 한 자리 이상 올라가므로 이것도 많아야 `log₂ n + 1`번이다.

```python
import random

class Fenwick:                             # 1번부터 n번까지
    def __init__(self, n):
        self.n, self.t = n, [0] * (n + 1)

    def add(self, i, x):                   # a[i] += x
        while i <= self.n:
            self.t[i] += x
            i += i & -i                    # 나를 덮는 다음 칸으로

    def prefix(self, i):                   # a[1] + … + a[i]
        s = 0
        while i > 0:
            s += self.t[i]
            i -= i & -i                    # 맨 아래 1비트를 지운다
        return s

    def range_sum(self, l, r):
        return self.prefix(r) - self.prefix(l - 1)

print(" i  2진수  i&-i  t[i]가 맡은 구간")
for i in range(1, 9):
    print(f"{i:2}  {i:04b}  {i & -i:4}   [{i - (i & -i) + 1}, {i}]")

rng = random.Random(11)
for _ in range(500):
    n = rng.randint(1, 30)
    a, fw = [0] * (n + 1), Fenwick(n)
    for _ in range(30):
        l, r = sorted(rng.randint(1, n) for _ in range(2))
        if rng.random() < 0.5:
            x = rng.randint(-9, 9)
            a[l] += x
            fw.add(l, x)
        else:
            assert fw.range_sum(l, r) == sum(a[l:r + 1])
print("무작위 500개 비교: 모두 일치")
```
```text
 i  2진수  i&-i  t[i]가 맡은 구간
 1  0001     1   [1, 1]
 2  0010     2   [1, 2]
 3  0011     1   [3, 3]
 4  0100     4   [1, 4]
 5  0101     1   [5, 5]
 6  0110     2   [5, 6]
 7  0111     1   [7, 7]
 8  1000     8   [1, 8]
무작위 500개 비교: 모두 일치
```
점 갱신과 구간 합을 섞은 무작위 500개 경우에서 정의대로 더한 값과 같다. 표에서 짝수 칸이 더 긴 구간을 맡고 8번 칸이 [1, 8] 전체를 맡는 모습이 트리 구조다.

## 역순 쌍 세기
"i < j인데 `xs[i] > xs[j]`인 쌍의 수"는 버블 정렬의 교환 횟수이자 두 순위의 어긋남 정도다. 완전 탐색은 O(n²)다. 왼쪽부터 보며 값마다 등장 횟수를 펜윅에 더해 가면, "앞에 나온 값 중 x보다 큰 것"은 지금까지 본 개수에서 `prefix(x의 순위)`를 뺀 값이다. 값의 범위가 크면 정렬한 순위로 바꾸는 좌표 압축을 먼저 한다. 앞 코드에 이어서 쓴다.
```python
def inversions(xs):                        # i < j인데 xs[i] > xs[j]인 쌍
    rank = {v: k + 1 for k, v in enumerate(sorted(set(xs)))}  # 좌표 압축
    fw, inv = Fenwick(len(rank)), 0
    for seen, x in enumerate(xs):
        inv += seen - fw.prefix(rank[x])   # 앞에 나온 값 중 x보다 큰 것
        fw.add(rank[x], 1)
    return inv

def inversions_brute(xs):
    n = len(xs)
    return sum(xs[i] > xs[j] for i in range(n) for j in range(i + 1, n))

rng = random.Random(12)
for _ in range(500):
    xs = [rng.randint(-10, 10) for _ in range(rng.randint(0, 40))]
    assert inversions(xs) == inversions_brute(xs)
print("역순 쌍 무작위 500개 비교: 모두 일치")
print(inversions([3, 1, 2, 5, 4]))
```
```text
역순 쌍 무작위 500개 비교: 모두 일치
3
```
[3, 1, 2, 5, 4]에서는 (3, 1), (3, 2), (5, 4)로 3쌍이다. 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」의 병합 정렬로 세는 방법과 같은 O(n log n)이지만 코드가 더 짧다.

## 구간 갱신·점 질의, 그리고 2차원
- 구간 갱신 + 점 질의: 차분 배열 `d[i] = a[i] − a[i − 1]`을 펜윅에 담으면 "a[l..r] += x"는 `d[l] += x`, `d[r + 1] -= x` 두 번의 점 갱신이고, a[i]는 d의 누적 합이다. 구간 갱신과 구간 합을 함께 하려면 펜윅 두 개를 쓰는 변형이 있다.
- 2차원: 행 방향 반복 안에 열 방향 반복을 넣으면 (1, 1)~(x, y) 직사각형의 합을 `O(log n · log m)`에 구하고, 임의의 직사각형은 포함·배제로 네 번 조합한다.

앞 코드의 `Fenwick`에 이어서 쓴다.
```python
class RangeAddPointGet:                    # 차분 배열 d 위의 펜윅
    def __init__(self, n):
        self.fw = Fenwick(n + 1)

    def add(self, l, r, x):                # a[l..r] += x
        self.fw.add(l, x)
        self.fw.add(r + 1, -x)

    def get(self, i):                      # a[i] = d[1] + … + d[i]
        return self.fw.prefix(i)

class Fenwick2D:
    def __init__(self, n, m):
        self.n, self.m = n, m
        self.t = [[0] * (m + 1) for _ in range(n + 1)]

    def add(self, x, y, v):
        i = x
        while i <= self.n:
            j = y
            while j <= self.m:
                self.t[i][j] += v
                j += j & -j
            i += i & -i

    def prefix(self, x, y):                # (1,1)~(x,y) 직사각형의 합
        s, i = 0, x
        while i > 0:
            j = y
            while j > 0:
                s += self.t[i][j]
                j -= j & -j
            i -= i & -i
        return s

    def rect(self, x1, y1, x2, y2):        # 포함·배제
        p = self.prefix
        return (p(x2, y2) - p(x1 - 1, y2)
                - p(x2, y1 - 1) + p(x1 - 1, y1 - 1))

rng = random.Random(13)
for _ in range(500):
    n, m = rng.randint(1, 12), rng.randint(1, 12)
    a, ra = [0] * (n + 1), RangeAddPointGet(n)
    g, f2 = [[0] * (m + 1) for _ in range(n + 1)], Fenwick2D(n, m)
    for _ in range(20):
        l, r = sorted(rng.randint(1, n) for _ in range(2))
        x = rng.randint(-9, 9)
        a[l:r + 1] = [v + x for v in a[l:r + 1]]
        ra.add(l, r, x)
        i = rng.randint(1, n)
        assert ra.get(i) == a[i]
        px, py = rng.randint(1, n), rng.randint(1, m)
        g[px][py] += x
        f2.add(px, py, x)
        y1, y2 = sorted(rng.randint(1, m) for _ in range(2))
        brute = sum(g[i][j] for i in range(l, r + 1)
                    for j in range(y1, y2 + 1))
        assert f2.rect(l, y1, r, y2) == brute
print("무작위 500개 비교(구간 갱신, 2차원): 모두 일치")
```
```text
무작위 500개 비교(구간 갱신, 2차원): 모두 일치
```

## 누적 합으로 위치 찾기
"누적 합이 처음 k 이상이 되는 칸"을 이분 탐색과 `prefix`로 찾으면 `O(log² n)`이지만, 펜윅의 구조를 따라 내려가면 O(log n)이다. 2의 거듭제곱 step을 큰 것부터 시도하는데, pos가 step보다 큰 비트만 갖고 있으므로 `t[pos + step]`은 정확히 `(pos, pos + step]`의 합이다. 그 합이 k보다 작으면 그 구간을 통째로 건너뛴다. 값이 모두 0 이상이어야 한다. 앞 코드에 이어서 쓴다.
```python
def lower_bound(fw, k):                    # prefix(i) ≥ k인 가장 작은 i
    pos, step = 0, 1 << fw.n.bit_length()  # 값은 모두 0 이상이어야 한다
    while step:
        if pos + step <= fw.n and fw.t[pos + step] < k:
            pos += step                    # [pos-step+1, pos]를 통째로 건너뜀
            k -= fw.t[pos]
        step //= 2
    return pos + 1

rng = random.Random(14)
for _ in range(500):
    w = [rng.randint(0, 5) for _ in range(rng.randint(1, 30))]
    w[rng.randrange(len(w))] += 1          # 합이 0이 되지 않게
    fw = Fenwick(len(w))
    for i, x in enumerate(w, 1):
        fw.add(i, x)
    k = rng.randint(1, sum(w))
    acc = 0
    for i, x in enumerate(w, 1):           # 정의 그대로: 앞에서부터 누적
        acc += x
        if acc >= k:
            break
    assert lower_bound(fw, k) == i
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
개수를 담은 펜윅에서 k번째로 작은 값을 찾거나, 가중치가 계속 바뀌는 무작위 추출에서 한 번 뽑는 일이 이것이다.

## 세그먼트 트리와 비교
| 항목 | 펜윅 트리 | 세그먼트 트리 |
|---|---|---|
| 메모리 | n + 1칸 | 2n~4n칸 |
| 구간 합 | 누적 합 둘의 차 | 바로 |
| 구간 최솟값 | 어렵다 | 된다 |
| 구간 갱신 | 차분으로 일부 | 레이지 전파 |
| 코드 | 반복문 두 개 | 수십 줄 |

펜윅은 구간을 누적 합 둘의 차로 만들기 때문에 연산에 역원(빼기)이 있어야 한다. 최솟값처럼 역원이 없으면 접두사 질의 정도만 가능하다. 반대로 합·개수·XOR처럼 역원이 있는 연산이라면 빠르고 짧은 펜윅이 먼저 손이 간다. 흔한 실수는 0번 칸을 쓰는 것(`0 & -0 = 0`이라 갱신 반복이 끝나지 않는다), 차분의 `r + 1`이 n을 넘는 경우를 잊는 것, 2차원에서 안쪽 반복 변수를 다시 초기화하지 않는 것이다.

## 복잡도
| 연산 | 펜윅 트리 | 단순한 방법 |
|---|---|---|
| 점 갱신 + 구간 합 | O(log n) | O(1) + O(n) |
| 역순 쌍 세기 | O(n log n) | O(n²) |
| 2차원 직사각형 합 | O(log n · log m) | O(nm) |
| 누적 합 위치 찾기 | O(log n) | O(n) |

- 공간은 n + 1칸(2차원은 (n + 1)(m + 1)칸)이다. 만들기는 `add`를 n번 하면 O(n log n)이고, 각 칸이 자기 값을 `i + (i & -i)` 칸에 한 번 더해 주는 방식이면 O(n)이다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: `i & -i`가 맨 아래 1비트가 되는 것은 −i를 "비트를 뒤집고 1을 더한" 2의 보수로 저장하기 때문이다.
- 확률과 분포 11편 「표본 추출과 몬테카를로 방법」: 누적합으로 범주를 뽑는 방법에서 가중치가 계속 바뀌면, 가중치를 펜윅에 담고 위치 찾기로 한 번에 O(log n)씩 뽑는다.
- 정보 이론 1편 「정보량과 엔트로피」: 엔트로피에 다가가는 적응형 산술 부호화는 기호별 누적 빈도를 계속 고치고 조회해야 하며, 펜윅의 1994년 논문이 바로 이 표를 위한 것이었다.

## 정리
- `t[i]`는 길이 `i & -i`인 구간의 합을 맡고, 누적 합은 맨 아래 1비트를 지우며, 갱신은 더하며 O(log n)에 끝난다.
- 좌표 압축과 함께 역순 쌍을 O(n log n)에 세고, 차분 배열에 쓰면 구간 갱신·점 질의가 된다.
- 반복문을 겹치면 2차원이 되고, 2의 거듭제곱으로 내려가면 누적 합 위치 찾기도 O(log n)이다.
- 역원이 있는 연산이면 세그먼트 트리보다 짧고 가볍지만, 구간 최솟값에는 세그먼트 트리나 6편의 희소 테이블을 쓴다.

## 더 알아보기
- 이전 글: 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」
- 다음 글: 6편 「희소 테이블: O(1) 구간 최솟값 질의」
- 위키백과(영어) Fenwick tree: https://en.wikipedia.org/wiki/Fenwick_tree
