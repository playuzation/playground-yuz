# [동적 계획법 3/12] 최장 증가 부분 수열: O(n²)에서 O(n log n)으로

> **한 줄 요약** — 최장 증가 부분 수열(LIS)은 "a[i]로 끝나는 가장 긴 길이"를 앞의 모든 원소에서 구하는 O(n²) DP로 풀 수 있고, "길이별로 가장 작은 끝값"을 담은 정렬된 배열 tails를 이분 탐색으로 고치면 O(n log n)이 된다.

## 이 글에서 다루는 것
- 기본 DP: dp[i] = a[i]로 끝나는 LIS 길이, O(n²)
- tails 배열의 의미와 불변식, 이분 탐색으로 O(n log n)
- tails는 답이 아니다: 위치를 기억해 실제 수열 복원하기
- 순증가와 비감소의 차이(bisect_left와 bisect_right)
- 무작위 대조 검사와 변형 문제

## 예제 문제
수열 `3 1 4 1 5 9 2 6 5 3 5`에서 몇 개를 골라 순서를 유지한 채 이어 붙인 것이 **부분 수열**(subsequence)이다. 연속일 필요는 없다. 그중 값이 계속 커지는 가장 긴 것이 **최장 증가 부분 수열**(longest increasing subsequence, LIS)이다. 이 수열의 LIS 길이는 4이고, `3 4 5 9`, `1 2 3 5` 등 여러 개가 있다. 부분 수열은 2ⁿ개라서 모두 보면 n = 40에서 이미 1조 개를 넘는다.

## 기본 DP: O(n²)
1편의 4단계로 설계한다. 상태 `dp[i]`는 "a[i]로 끝나는 증가 부분 수열의 최대 길이"다. 끝 원소를 상태에 넣는 것이 요령이다. 그래야 다음 원소를 붙일 수 있는지(끝값보다 큰지) 알 수 있다. 전이는 `dp[i] = 1 + max(dp[j])`(j < i이고 a[j] < a[i]인 j, 없으면 0)이고, 초기값은 모두 1(자기 자신만), 답은 `max(dp)`다. 어느 j에서 왔는지 `prev`에 적으면 수열도 복원된다.
```python
def lis_n2(a):
    n = len(a)
    dp, prev = [1] * n, [-1] * n     # dp[i]: a[i]로 끝나는 LIS 길이
    for i in range(n):
        for j in range(i):
            if a[j] < a[i] and dp[j] + 1 > dp[i]:
                dp[i], prev[i] = dp[j] + 1, j
    i = max(range(n), key=dp.__getitem__) if a else -1
    seq = []
    while i != -1:                   # prev를 따라 거꾸로 복원
        seq.append(a[i])
        i = prev[i]
    return seq[::-1], dp

a = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]
seq, dp = lis_n2(a)
print("dp =", dp)
print("LIS =", seq)
```
```text
dp = [1, 1, 2, 1, 3, 4, 2, 4, 3, 3, 4]
LIS = [3, 4, 5, 9]
```
원소마다 앞의 모든 원소를 보므로 비교가 `n(n−1)/2`번이다. n = 10만이면 약 50억 번이라 파이썬으로는 어림도 없다.

## tails 배열: 길이별 가장 작은 끝값
O(n²) DP는 "끝값이 a[i]보다 작은 것 중 가장 긴 것"을 매번 처음부터 찾는다. 같은 길이라면 끝값이 작을수록 나중에 붙일 수 있는 원소가 많으니, 길이마다 가장 작은 끝값 하나만 기억해도 된다. 이것이 **tails** 배열이다.
```text
tails[k] = 지금까지 본 원소로 만든
           길이 k+1 증가 부분 수열의
           끝값 중 가장 작은 값
```
**불변식**: tails는 항상 순증가한다. 길이 k + 2인 수열에서 마지막 원소를 빼면 더 작은 값으로 끝나는 길이 k + 1 수열이 생기기 때문이다. 그래서 새 원소 x가 오면 이분 탐색으로 `tails[k] ≥ x`인 첫 k를 찾는다.
- `tails[k−1] < x`이므로 길이 k 수열 뒤에 x를 붙여 길이 k + 1을 만들 수 있고, 그 끝값 x는 기존 `tails[k]` 이하다. 그래서 `tails[k] = x`로 고친다.
- 길이 k + 1 이상인 수열은 끝값이 모두 x 이상이라 x를 붙일 수 없고, 더 짧은 길이에는 이미 x보다 작은 끝값이 있다. 그러니 다른 칸은 바뀌지 않는다.
- k가 tails 길이와 같으면(모든 끝값보다 크면) 맨 뒤에 붙어 LIS가 1 늘어난다.

tails의 길이가 곧 LIS 길이다. 실제 수열을 얻으려면 tails의 각 칸이 수열의 어느 위치(`at`)인지 함께 적고, 원소를 넣을 때 한 칸 앞 길이의 끝 위치를 `prev`로 남긴다.
```python
from bisect import bisect_left, bisect_right

def lis_fast(a, strict=True, trace=False):
    find = bisect_left if strict else bisect_right
    tails, at = [], []               # 길이 k+1의 가장 작은 끝값, 그 위치
    prev = [-1] * len(a)
    for i, x in enumerate(a):
        k = find(tails, x)           # x가 들어갈 자리
        if k == len(tails):
            tails.append(x)
            at.append(i)
        else:
            tails[k], at[k] = x, i   # 같은 길이를 더 작은 끝값으로
        prev[i] = at[k - 1] if k > 0 else -1
        if trace:
            print(f"x={x} tails={tails}")
    idx, i = [], at[-1] if at else -1
    while i != -1:
        idx.append(i)
        i = prev[i]
    return idx[::-1], tails

a = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]
idx, _ = lis_fast(a, trace=True)
print("복원", [a[i] for i in idx], "위치", idx)
b = [2, 5, 3, 7, 1]
idx, tails = lis_fast(b)
print("tails", tails, "/ 실제 LIS", [b[i] for i in idx])
```
```text
x=3 tails=[3]
x=1 tails=[1]
x=4 tails=[1, 4]
x=1 tails=[1, 4]
x=5 tails=[1, 4, 5]
x=9 tails=[1, 4, 5, 9]
x=2 tails=[1, 2, 5, 9]
x=6 tails=[1, 2, 5, 6]
x=5 tails=[1, 2, 5, 6]
x=3 tails=[1, 2, 3, 6]
x=5 tails=[1, 2, 3, 5]
복원 [1, 2, 3, 5] 위치 [3, 6, 9, 10]
tails [1, 3, 7] / 실제 LIS [2, 3, 7]
```
`x=2`에서 `[1, 4, 5, 9]`가 `[1, 2, 5, 9]`로 바뀐 것을 보자. 길이 2 수열의 가장 작은 끝값이 4에서 2로 내려갔을 뿐, 길이 4인 `1 4 5 9`는 여전히 있다. 그래서 **tails 자체는 LIS가 아니다**. 두 번째 예에서 tails `[1, 3, 7]`은 1이 7보다 뒤에 있어 부분 수열조차 아니다. 위치와 `prev`로 복원한 `[2, 3, 7]`이 진짜 답이다. 마지막 칸의 위치에서 `prev`를 따라가면 되는 이유는, 원소를 넣는 순간의 `at[k−1]`이 그보다 앞에 있고 값이 더 작은 길이 k 수열의 끝이기 때문이다.

**비감소**(같은 값 허용) 부분 수열을 원하면 `bisect_right`로 바꾼다. 같은 값 x가 오면 기존 x 뒤에 들어가 길이를 늘릴 수 있게 된다. 순증가인데 `bisect_right`를 쓰거나 그 반대로 쓰는 것이 가장 흔한 실수다. 각 원소가 이분 탐색 한 번이므로 전체 O(n log n)이고, n = 10만이어도 비교가 많아야 약 170만 번이다.

## 무작위 대조 검사
앞 코드에 이어서, 모든 부분 수열을 보는 완전 탐색과 비교한다. 길이뿐 아니라 복원한 위치가 실제로 증가하는 부분 수열인지도 확인한다. 같은 값이 많이 나오도록 0~9의 작은 수를 쓴다.
```python
import random

def lis_brute(a, strict):            # 모든 부분 수열 2ⁿ개
    best = 0
    for mask in range(1 << len(a)):
        s = [x for i, x in enumerate(a) if mask >> i & 1]
        if all(p < q if strict else p <= q for p, q in zip(s, s[1:])):
            best = max(best, len(s))
    return best

rng = random.Random(3)
for _ in range(500):
    a = [rng.randint(0, 9) for _ in range(rng.randint(0, 12))]
    for strict in (True, False):
        want = lis_brute(a, strict)
        idx, tails = lis_fast(a, strict)
        s = [a[i] for i in idx]
        ok = all(p < q if strict else p <= q for p, q in zip(s, s[1:]))
        assert ok and idx == sorted(set(idx)) and len(idx) == want
        assert len(tails) == want
    assert len(lis_n2(a)[0]) == lis_brute(a, True)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 변형 문제
- **가장 긴 감소 부분 수열**: 부호를 바꾸거나(−a) 수열을 뒤집어 LIS를 구한다.
- **상자 넣기**(가로·세로가 모두 커야 들어감): 가로 오름차순, 가로가 같으면 세로 내림차순으로 정렬한 뒤 세로의 LIS를 구한다. 세로 내림차순은 가로가 같은 상자끼리 이어지는 것을 막는다.
- **두 순열의 LCS**: 두 번째 순열의 원소를 첫 번째 순열에서의 위치로 바꾸면 LCS가 그 위치 수열의 LIS가 된다. 일반 문자열의 LCS는 4편에서 다룬다.
- **수열을 덮는 최소 개수**: 수열 전체를 비증가 부분 수열 몇 개로 나눌 수 있는가의 최솟값은 LIS 길이와 같다. 카드를 더미에 쌓는 카드 게임 페이션스의 이름을 딴 **페이션스 정렬**(patience sorting)에서 더미 수가 LIS 길이라는 사실과 같은 이야기다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 부분 수열 완전 탐색 | O(n·2ⁿ) | O(n) |
| 기본 DP | O(n²) | O(n) |
| tails + 이분 탐색 | O(n log n) | O(n) |

tails 방법의 공간 O(n)은 복원용 `prev` 때문이고, 길이만 필요하면 tails 하나(LIS 길이만큼)로 충분하다.

## 어디에 쓰이나
- 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」: 서로 다른 수 n² + 1개로 된 수열에는 길이 n + 1인 증가 또는 감소 부분 수열이 있다는 에르되시-세케레시 정리(1935)는, 각 원소에 "여기서 끝나는 LIS 길이, LDS 길이" 쌍을 붙이고 비둘기집 원리를 쓴다. 그 쌍이 바로 이 글의 dp 값이다.
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: "i < j이고 a[i] < a[j]"는 부분 순서이고, LIS는 가장 긴 사슬이다. 위의 "비증가 부분 수열로 덮는 최소 개수 = LIS 길이"는 사슬과 반사슬 사이의 정리(미르스키 정리)의 한 예다.
- git의 `--diff-algorithm=patience`: 브램 코언(Bram Cohen)이 제안한 페이션스 diff는 두 파일에 한 번씩만 나오는 줄을 짝지은 뒤, 첫 파일 순서로 늘어놓은 짝들의 둘째 파일 위치에서 LIS를 구해 기준 줄로 삼는다. git의 기본값은 마이어스 알고리즘이고, histogram 알고리즘은 페이션스를 확장한 것이다.

## 정리
- `dp[i]` = a[i]로 끝나는 LIS 길이로 두면 O(n²) DP가 되고, 끝 원소를 상태에 넣는 것이 핵심이다.
- tails[k]는 길이 k + 1 증가 부분 수열의 가장 작은 끝값이며 항상 정렬되어 있어 이분 탐색으로 고칠 수 있다.
- tails는 실제 수열이 아니므로 위치와 `prev`를 남겨 복원한다.
- 순증가는 `bisect_left`, 비감소는 `bisect_right`다.

## 더 알아보기
- 이전 글: 2편 「배낭 문제: 0-1 배낭, 무한 배낭, 메모리 줄이기」
- 다음 글: 4편 「LCS와 편집 거리: 두 문자열을 맞추는 DP」
- Patience sorting(위키백과 영어판): https://en.wikipedia.org/wiki/Patience_sorting
