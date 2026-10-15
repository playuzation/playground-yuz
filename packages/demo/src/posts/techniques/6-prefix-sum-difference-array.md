# [알고리즘 기법 6/14] 누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로

> **한 줄 요약** — 앞에서부터의 합을 미리 저장한 누적 합은 구간 합을 두 값의 차 하나로 바꾸고, 그 역연산인 차분 배열은 구간 전체에 더하기를 양 끝 두 칸의 표시로 바꾸며, 둘 다 2차원으로 그대로 확장된다.

## 이 글에서 다루는 것
- 1차원 누적 합과 반열린 구간
- 2차원 누적 합과 포함·배제
- 차분 배열과 2차원 차분(imos법): 구간 더하기를 오프라인으로
- 나머지가 같은 누적 합 쌍 세기

## 구간 합 질의
배열 a에 "l번부터 r번 앞까지의 합은?"이라는 질문이 q번 온다. 매번 더하면 질문당 O(n), 전체 O(nq)다. n과 q가 10⁵이면 100억 번이라 1편의 기준으로 어림도 없다. **누적 합**(prefix sum) `P[i] = a[0] + … + a[i−1]`을 한 번 만들어 두면 `[l, r)`의 합은 `P[r] − P[l]`, 질문당 O(1)이다. P를 길이 n + 1로 두고 `P[0] = 0`에서 시작하면 l = 0일 때도 예외가 없다. 3편에서 반열린 구간을 쓴 것과 같은 이유다.

2차원 격자에서 `S[i][j]`를 위 i행 × 왼쪽 j열 직사각형의 합으로 두면, 임의의 직사각형 합도 네 값으로 구한다. 아래 그림에서 D의 합이 필요하면 전체에서 위쪽(A+B)과 왼쪽(A+C)을 빼고, 두 번 빠진 A를 한 번 더한다. 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」의 포함·배제다. S를 만드는 점화식도 같은 모양이다.
```text
 ┌───────┬───────┐
 │   A   │   B   │
 ├───────┼───────┤
 │   C   │   D   │
 └───────┴───────┘
 D = S(전체) − S(A+B)
     − S(A+C) + S(A)
```
```python
import random

def prefix(a):                            # P[i] = a[0] + … + a[i-1]
    p = [0]
    for x in a:
        p.append(p[-1] + x)
    return p                              # [l, r) 구간 합 = P[r] - P[l]

def prefix2d(g):                          # S[i][j] = 위 i행 × 왼쪽 j열의 합
    n, m = len(g), len(g[0])
    s = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            s[i + 1][j + 1] = g[i][j] + s[i][j + 1] + s[i + 1][j] - s[i][j]
    return s

def rect(s, r1, c1, r2, c2):              # [r1, r2) × [c1, c2)의 합
    return s[r2][c2] - s[r1][c2] - s[r2][c1] + s[r1][c1]

rng = random.Random(14)
for _ in range(500):
    a = [rng.randint(-9, 9) for _ in range(rng.randint(1, 12))]
    l = rng.randint(0, len(a))
    r = rng.randint(l, len(a))
    assert prefix(a)[r] - prefix(a)[l] == sum(a[l:r])
    n, m = rng.randint(1, 6), rng.randint(1, 6)
    g = [[rng.randint(-9, 9) for _ in range(m)] for _ in range(n)]
    r1, c1 = rng.randint(0, n), rng.randint(0, m)
    r2, c2 = rng.randint(r1, n), rng.randint(c1, m)
    assert rect(prefix2d(g), r1, c1, r2, c2) == sum(
        g[i][j] for i in range(r1, r2) for j in range(c1, c2))
print("무작위 500개씩 비교: 모두 일치")
```
```text
무작위 500개씩 비교: 모두 일치
```
이 표는 1984년 프랭크 크로(Frank Crow)가 컴퓨터 그래픽스의 텍스처 매핑용 **합 영역 테이블**(summed-area table)로 소개했고, 2001년 비올라와 존스(Viola, Jones)의 얼굴 검출에서는 **적분 영상**(integral image)이라는 이름으로 직사각형 특징을 크기와 상관없이 O(1)에 계산하는 데 쓰였다.

## 차분 배열: 구간에 더하기
반대 방향의 문제도 있다. "l번부터 r번 앞까지 모두 v를 더하라"는 갱신이 q번 오고, 모든 갱신이 끝난 뒤 배열을 한 번 보면 된다(오프라인). 칸마다 더하면 O(nq)다. 누적 합의 역연산인 **차분 배열**(difference array) `D[i] = a[i] − a[i−1]`을 쓰면, 구간 더하기는 "l에서 v만큼 올라가고 r에서 v만큼 내려온다"는 두 칸의 표시가 된다. 모든 표시를 마친 뒤 D의 누적 합을 한 번 구하면 결과 배열이 나온다.

2차원도 같다. 직사각형 `[r1, r2) × [c1, c2)`에 v를 더하려면 네 모서리에 +v, −v, −v, +v를 표시하고, 가로로 한 번, 세로로 한 번 누적 합을 구한다. 일본의 경쟁 프로그래밍 커뮤니티에서는 이 기법을 imos법(いもす法)이라고 부른다.
```python
import random

def range_add(n, ops):                    # ops: (l, r, v) = [l, r)에 v 더하기
    d = [0] * (n + 1)
    for l, r, v in ops:
        d[l] += v                         # l부터 v가 시작되고
        d[r] -= v                         # r부터 v가 끝난다
    out, run = [], 0
    for i in range(n):                    # 누적 합으로 한 번에 펼친다
        run += d[i]
        out.append(run)
    return out

def rect_add(n, m, ops):                  # (r1, c1, r2, c2, v): 직사각형에 v
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for r1, c1, r2, c2, v in ops:         # 네 모서리에만 표시한다
        d[r1][c1] += v
        d[r1][c2] -= v
        d[r2][c1] -= v
        d[r2][c2] += v
    for i in range(n + 1):                # 가로 누적 합
        for j in range(1, m + 1):
            d[i][j] += d[i][j - 1]
    for i in range(1, n + 1):             # 세로 누적 합
        for j in range(m + 1):
            d[i][j] += d[i - 1][j]
    return [row[:m] for row in d[:n]]

rng = random.Random(15)
for _ in range(300):
    n, m = rng.randint(1, 8), rng.randint(1, 8)
    ops1, ops2 = [], []
    want1, want2 = [0] * n, [[0] * m for _ in range(n)]
    for _ in range(rng.randint(0, 6)):
        l = rng.randint(0, n - 1)
        r, v = rng.randint(l + 1, n), rng.randint(-5, 5)
        ops1.append((l, r, v))
        for i in range(l, r):
            want1[i] += v                 # 정의 그대로 칸마다 더한다
        r1, c1 = rng.randint(0, n - 1), rng.randint(0, m - 1)
        r2, c2 = rng.randint(r1 + 1, n), rng.randint(c1 + 1, m)
        ops2.append((r1, c1, r2, c2, v))
        for i in range(r1, r2):
            for j in range(c1, c2):
                want2[i][j] += v
    assert range_add(n, ops1) == want1 and rect_add(n, m, ops2) == want2
print("무작위 300개 비교: 모두 일치")
print(range_add(6, [(1, 4, 2), (3, 6, 5)]))
```
```text
무작위 300개 비교: 모두 일치
[0, 2, 2, 7, 5, 5]
```
예에서 `[1, 4)`에 2, `[3, 6)`에 5를 더하면 둘이 겹치는 3번 칸만 7이 된다. 갱신 q개를 O(1)씩 표시하고 마지막에 O(n)(2차원은 O(nm))으로 펼치므로 전체 O(n + q)다. 단, 값을 묻는 질의가 갱신 사이사이에 섞이면 매번 펼쳐야 해서 이 방법은 무너진다. 그때는 고급 자료 구조 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」나 고급 자료 구조 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」을 쓴다.

## 누적 합 쌍 세기
구간 `[l, r)`의 합이 조건을 만족하는지는 `P[l]`과 `P[r]` 두 값의 관계다. 그래서 "조건을 만족하는 구간의 수"는 "조건을 만족하는 누적 합 쌍의 수"로 바뀐다.
- 합이 k의 배수인 구간: `P[r] ≡ P[l] (mod k)`이므로 나머지가 같은 누적 합끼리 짝짓는다.
- 합이 정확히 S인 구간: `P[l] = P[r] − S`인 앞쪽 누적 합의 개수를 사전으로 센다. 음수가 있어도 되므로, 4편의 투 포인터가 음수에서 무너지던 문제가 여기서 풀린다.

```python
import random
from collections import Counter

def count_divisible(a, k):                # 합이 k의 배수인 구간 개수
    seen, p, ans = Counter([0]), 0, 0     # 누적 합 P[0] = 0부터 센다
    for x in a:
        p = (p + x) % k
        ans += seen[p]                    # 나머지가 같은 앞쪽 누적 합의 수
        seen[p] += 1
    return ans

def count_sum(a, s):                      # 합이 정확히 s인 구간 개수
    seen, p, ans = Counter([0]), 0, 0
    for x in a:
        p += x
        ans += seen[p - s]                # P[l] = P[r] - s인 l의 수
        seen[p] += 1
    return ans

rng = random.Random(16)
for _ in range(500):
    a = [rng.randint(-5, 5) for _ in range(rng.randint(0, 12))]
    k, s, n = rng.randint(1, 6), rng.randint(-5, 5), len(a)
    sums = [sum(a[l:r]) for l in range(n) for r in range(l + 1, n + 1)]
    assert count_divisible(a, k) == sum(t % k == 0 for t in sums)
    assert count_sum(a, s) == sums.count(s)
print("무작위 500개 비교: 모두 일치")
print(count_divisible([4, 5, 0, -2, -3, 1], 5), count_sum([1, -1, 1, -1], 0))
```
```text
무작위 500개 비교: 모두 일치
7 4
```
`Counter([0])`로 `P[0] = 0`을 미리 넣어 두지 않으면 맨 앞에서 시작하는 구간을 놓친다. 파이썬의 `%`는 음수에도 0 이상의 나머지를 주지만 C++·자바에서는 `-7 % 5`가 −2라서, `(p % k + k) % k`로 고쳐야 같은 나머지끼리 모인다. 덧붙여 수 n개의 누적 합 n + 1개를 n으로 나눈 나머지 중에는 비둘기집 원리에 따라 같은 것이 둘 있으므로, 합이 n의 배수인 구간은 늘 하나 이상 있다.

## 복잡도
| 작업 | 단순한 방법 | 누적 합·차분 |
|---|---|---|
| 구간 합 q개 | O(nq) | O(n + q) |
| 직사각형 합 q개 | O(nmq) | O(nm + q) |
| 구간 더하기 q개 | O(nq) | O(n + q) |
| 조건 구간 개수 | O(n²) | 기대 O(n) |

- 누적 합 배열은 O(n)(2차원은 O(nm)) 공간을 쓰고, 쌍 세기는 사전 크기만큼 더 든다.
- 질의와 갱신이 섞이면 둘 다 O(log n)에 하는 펜윅 트리로 넘어간다.

## 어디에 쓰이나
- 미적분 5편 「적분: 넓이와 누적」: 누적 합은 적분의 이산판이고 차분은 미분의 이산판이라, `P[r] − P[l]`로 구간 합을 얻는 것은 미적분학의 기본 정리 `F(b) − F(a)`와 같은 구조다.
- 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」: 2차원 직사각형 합 공식이 포함·배제이고, 합이 n의 배수인 구간이 늘 있다는 사실은 비둘기집 원리로 보인다.
- 컴퓨터 비전과 그래픽스: 합 영역 테이블(적분 영상)로 상자 필터 흐림이나 직사각형 특징을 창 크기와 상관없이 픽셀당 O(1)에 계산한다.

## 정리
- 누적 합은 구간 합을 `P[r] − P[l]` 하나로, 2차원 직사각형 합을 포함·배제로 네 값의 계산으로 만든다.
- 차분 배열은 구간 더하기를 양 끝 표시 두 개로 바꾸고, 모든 갱신 뒤 누적 합 한 번으로 펼친다. 2차원은 네 모서리다.
- 구간 조건은 누적 합 두 값의 조건이라, 구간 개수 세기는 사전으로 쌍을 세는 문제가 된다.
- 갱신과 질의가 섞이면 펜윅 트리나 세그먼트 트리가 필요하다.

## 더 알아보기
- 이전 글: 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」
- 다음 글: 7편 「그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건」
- 합 영역 테이블(위키백과 영어판): https://en.wikipedia.org/wiki/Summed-area_table
