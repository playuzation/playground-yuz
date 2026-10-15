# [동적 계획법 5/12] 구간 DP: 행렬 곱셈 순서와 파일 합치기

> **한 줄 요약** — 구간 DP는 "구간 [l, r]을 처리하는 최소 비용"을 상태로 두고, 그 구간에서 마지막에 일어나는 일의 경계 k를 모두 시도해 짧은 구간부터 채우는 방법으로, 행렬 곱셈 순서·파일 합치기·회문 분할을 O(n³) 안에 푼다.

## 이 글에서 다루는 것
- 예제: 이웃한 파일 합치기와 탐욕이 틀리는 예
- dp[l][r]과 "마지막 분할 지점 k", 길이 순서로 채우는 이유
- 행렬 곱셈 순서와 괄호 복원
- 회문 분할: 구간 표 + 1차원 DP
- 이웃 합치기 완전 탐색과의 무작위 대조

## 예제 문제: 파일 합치기
크기가 20, 50, 10, 50인 파일 네 개가 이 순서로 있다. 한 번에 **이웃한** 두 파일을 하나로 합치고, 합칠 때마다 두 파일 크기의 합만큼 비용이 든다. 전부 하나로 합치는 최소 비용은? 합이 가장 작은 이웃 쌍부터 합치는 탐욕은 50 + 10 = 60, 20 + 60 = 80, 80 + 50 = 130으로 270이다. 하지만 (20 + 50)과 (10 + 50)을 따로 만든 뒤 합치면 70 + 60 + 130 = 260이다. 지금 싼 합치기가 나중에 큰 덩어리를 만들어 비용을 키운 것이다. 합치는 순서는 괄호를 치는 방법과 같아서 그 수가 카탈랑 수로 늘어나고, 파일 20개면 약 17억 가지다.

## 구간을 상태로: dp[l][r]
합치기를 거꾸로 보자. 마지막 합치기는 언제나 "왼쪽 덩어리 [l, k]"와 "오른쪽 덩어리 [k + 1, r]"을 합친다. 두 덩어리는 서로 독립이라 각자 최소로 만들면 되고(최적 부분 구조), 마지막 합치기 비용은 경계와 상관없이 구간 전체의 크기 합이다.
```text
dp[l][r] = sum(l..r)
         + min(dp[l][k] + dp[k+1][r])
           (k = l, …, r−1 중 최소)
dp[i][i] = 0  (파일 하나는 공짜)
```
상태가 O(n²)개, 상태마다 k가 O(n)개라 O(n³)이다. 채우는 순서가 중요하다. `dp[l][r]`은 자기보다 **짧은** 구간들만 보므로, l이나 r 순서가 아니라 **구간 길이** 순서로 채워야 필요한 칸이 미리 차 있다. 구간 합은 누적 합(알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」)으로 O(1)에 구한다. 고른 k를 `cut`에 적어 두면 합치는 순서를 괄호로 복원할 수 있다.
```python
def merge_files(sizes):
    n = len(sizes)
    pre = [0]                        # 누적 합: 구간 합을 O(1)에
    for s in sizes:
        pre.append(pre[-1] + s)
    dp = [[0] * n for _ in range(n)]
    cut = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):   # 짧은 구간부터
        for l in range(n - length + 1):
            r = l + length - 1
            k = min(range(l, r), key=lambda k: dp[l][k] + dp[k + 1][r])
            dp[l][r] = dp[l][k] + dp[k + 1][r] + pre[r + 1] - pre[l]
            cut[l][r] = k            # 마지막 합치기의 경계
    def show(l, r):
        if l == r:
            return str(sizes[l])
        k = cut[l][r]
        return f"({show(l, k)} {show(k + 1, r)})"
    return dp[0][n - 1], show(0, n - 1)

def greedy(sizes):                   # 합이 가장 작은 이웃 쌍부터
    a, total = list(sizes), 0
    while len(a) > 1:
        i = min(range(len(a) - 1), key=lambda i: a[i] + a[i + 1])
        total += a[i] + a[i + 1]
        a[i:i + 2] = [a[i] + a[i + 1]]
    return total

print(merge_files([20, 50, 10, 50]), "탐욕:", greedy([20, 50, 10, 50]))
```
```text
(260, '((20 50) (10 50))') 탐욕: 270
```
"이웃한" 조건이 없어 아무 두 파일이나 합칠 수 있다면 가장 작은 두 개를 합치는 탐욕이 최적이다. 허프만 부호를 만드는 방법과 같다(알고리즘 기법 7편 「그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건」). 이웃 조건 하나가 문제를 구간 DP로 바꾼다.

## 행렬 곱셈 순서
(p × q) 행렬과 (q × r) 행렬을 곱하면 결과 칸 p·r개마다 곱셈 q번, 모두 p·q·r번의 곱셈이 든다(선형대수 3편 「행렬과 행렬 곱」). 행렬 곱은 결합 법칙이 성립해서 `(AB)C = A(BC)`이지만 비용은 다르다. A가 10 × 30, B가 30 × 5, C가 5 × 60이면 `(AB)C`는 1,500 + 3,000 = 4,500번, `A(BC)`는 9,000 + 18,000 = 27,000번이다.

구조는 파일 합치기와 똑같다. 마지막 곱셈이 `(A_l … A_k)(A_{k+1} … A_r)`이면 비용은 두 쪽을 만드는 최소 비용에 `dims[l]·dims[k+1]·dims[r+1]`을 더한 것이다. 행렬 i의 크기를 `dims[i] × dims[i+1]`로 적는다.
```python
def matrix_chain(dims):              # 행렬 i는 dims[i] × dims[i+1]
    n = len(dims) - 1
    dp = [[0] * n for _ in range(n)]
    cut = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            dp[l][r] = float("inf")
            for k in range(l, r):    # (l..k)·(k+1..r)이 마지막 곱셈
                c = (dp[l][k] + dp[k + 1][r]
                     + dims[l] * dims[k + 1] * dims[r + 1])
                if c < dp[l][r]:
                    dp[l][r], cut[l][r] = c, k
    def show(l, r):
        if l == r:
            return "ABCDEFGH"[l]
        return f"({show(l, cut[l][r])}{show(cut[l][r] + 1, r)})"
    return dp[0][n - 1], show(0, n - 1)

def left_to_right(dims):             # 순서 생각 없이 왼쪽부터
    return sum(dims[0] * dims[k] * dims[k + 1]
               for k in range(1, len(dims) - 1))

for dims in ([10, 30, 5, 60], [40, 20, 30, 10, 30], [64, 64, 64, 1]):
    print(dims, matrix_chain(dims), "왼쪽부터:", left_to_right(dims))
```
```text
[10, 30, 5, 60] (4500, '((AB)C)') 왼쪽부터: 4500
[40, 20, 30, 10, 30] (26000, '((A(BC))D)') 왼쪽부터: 48000
[64, 64, 64, 1] (8192, '(A(BC))') 왼쪽부터: 266240
```
마지막 줄은 행렬 둘에 벡터 하나(64 × 1)를 곱하는 경우다. 왼쪽부터 곱하면 64 × 64 행렬끼리의 곱(26만 번)이 생기지만, 벡터 쪽부터 곱하면 행렬-벡터 곱 두 번(8,192번)으로 32배 넘게 싸다. 벡터 하나에 층을 차례로 적용할 때 `(W₂W₁)x`가 아니라 `W₂(W₁x)` 순서로 계산하는 이유다.

## 회문 분할
문자열을 잘라 모든 조각이 회문(앞뒤가 같은 문자열)이 되게 하는 최소 자르기 횟수를 구하자. `aabbaxyx`는 두 번 잘라 `a`, `abba`, `xyx`로 나누는 것이 최소다. 여기서 구간 DP는 "구간이 회문인가"를 미리 채우는 데 쓴다. `pal[l][r]`은 양 끝이 같고 안쪽 `pal[l+1][r−1]`이 회문이면 참이므로, 역시 길이 순서로 채운다. 그다음 `cuts[i]` = "앞 i글자를 회문 조각으로 나누는 최소 조각 수"를 마지막 조각 `s[j:i]`를 고르는 1차원 DP로 구한다. 구간 표 O(n²) + 1차원 DP O(n²)이라 전체 O(n²)이다. 구간 DP 모양 그대로 `dp[l][r]`에 k를 시도하면 O(n³)이 된다.
```python
def min_pal_cuts(s):
    n = len(s)
    pal = [[False] * n for _ in range(n)]   # pal[l][r]: s[l..r]가 회문
    for length in range(1, n + 1):
        for l in range(n - length + 1):
            r = l + length - 1
            pal[l][r] = s[l] == s[r] and (length <= 2 or pal[l + 1][r - 1])
    cuts = [0] * (n + 1)             # cuts[i]: s[:i]를 나누는 최소 조각 수
    for i in range(1, n + 1):
        cuts[i] = min(cuts[j] + 1 for j in range(i) if pal[j][i - 1])
    return cuts[n] - 1               # 조각 수 − 1 = 자르는 횟수

print(min_pal_cuts("aabbaxyx"), min_pal_cuts("abcba"))
```
```text
2 0
```

## 무작위 대조 검사
앞 코드에 이어서 실행한다. 파일 합치기와 행렬 곱셈은 "이웃한 둘을 합치는" 같은 게임이라 완전 탐색 함수 하나로 확인한다. 매번 어느 이웃 쌍을 합칠지 모든 순서를 시도하므로 구간 분할을 전혀 가정하지 않는다. 회문 분할은 자를 위치 집합 2ⁿ⁻¹개를 모두 시도한다.
```python
import random

def brute_merge(items, merge):       # 이웃한 두 개를 합치는 모든 순서
    if len(items) == 1:
        return 0
    best = float("inf")
    for i in range(len(items) - 1):
        cost, new = merge(items[i], items[i + 1])
        rest = items[:i] + [new] + items[i + 2:]
        best = min(best, cost + brute_merge(rest, merge))
    return best

files = lambda a, b: (a + b, a + b)
mats = lambda a, b: (a[0] * a[1] * b[1], (a[0], b[1]))

def pal_brute(s):                    # 자를 위치 집합 2ⁿ⁻¹개
    best = len(s)
    for mask in range(1 << max(len(s) - 1, 0)):
        bounds = [0] + [i + 1 for i in range(len(s) - 1)
                        if mask >> i & 1] + [len(s)]
        parts = [s[p:q] for p, q in zip(bounds, bounds[1:])]
        if all(t == t[::-1] for t in parts):
            best = min(best, len(parts) - 1)
    return best

rng = random.Random(5)
for _ in range(500):
    n = rng.randint(1, 7)
    sizes = [rng.randint(1, 50) for _ in range(n)]
    assert merge_files(sizes)[0] == brute_merge(sizes, files)
    dims = [rng.randint(1, 30) for _ in range(n + 1)]
    pairs = [(dims[i], dims[i + 1]) for i in range(n)]
    assert matrix_chain(dims)[0] == brute_merge(pairs, mats)
    s = "".join(rng.choice("ab") for _ in range(rng.randint(1, 12)))
    assert min_pal_cuts(s) == pal_brute(s)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 자주 하는 실수와 변형
- l을 바깥, r을 안쪽 반복으로 오름차순 채우기. `dp[k+1][r]`(k + 1 > l)이 아직 비어 있다. 길이 순서로 채우거나, l을 큰 쪽부터 돌린다.
- k의 범위를 `l ≤ k ≤ r`로 잡아 빈 구간을 만들기. 분할은 `l ≤ k < r`이다.
- **마지막에 일어나는 일로 나누기**: 풍선 터뜨리기처럼 "구간에서 마지막에 처리할 원소 k"를 고르면 양쪽이 독립이 되는 문제가 많다. 처음에 할 일로 나누면 양쪽이 서로 영향을 주어 구간으로 쪼개지지 않는다.
- 원형으로 놓인 파일은 배열을 두 번 이어 붙이고 길이 n 구간 중 최솟값을 고른다.

## 복잡도
| 문제 | 시간 | 공간 |
|---|---|---|
| 합치는 순서 완전 탐색 | 카탈랑 수 이상 | O(n) |
| 파일 합치기·행렬 순서 | O(n³) | O(n²) |
| 회문 분할 | O(n²) | O(n²) |

파일 합치기는 최적 k가 구간이 커질수록 한쪽으로만 움직이는 성질이 있어 크누스 최적화로 O(n²)까지 줄일 수 있다(11편).

## 어디에 쓰이나
- 어텐션 4편 「KV 캐시와 MQA·GQA·MLA」: MLA의 행렬 흡수는 결합 법칙으로 `q·(c·W_UK)ᵀ`를 `(q·W_UKᵀ)·cᵀ`로 바꿔 곱하는 순서를 고른 것이고, 이 글의 행렬 곱셈 순서 DP는 그 선택을 행렬 여러 개에 대해 체계적으로 한다.
- 선형대수 12편 「텐서와 브로드캐스팅: 코드 속의 선형대수」: 피연산자가 여럿인 `np.einsum`은 어느 쌍부터 축약할지에 따라 비용이 달라서, NumPy의 `einsum_path`가 순서를 고른다. 'optimal'은 모든 순서를 보고 'greedy'는 매 단계 가장 좋은 쌍을 고르는데, 행렬 사슬이라면 이 글의 DP가 O(n³)에 최적을 준다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 괄호 치는 방법 하나가 이진 구문 트리 하나이고, 문맥 자유 문법으로 문자열을 파싱하는 CYK 알고리즘은 "부분 문자열 [l, r]을 만들 수 있는 비단말 기호"를 길이 순서로 채우는 O(n³) 구간 DP다.

## 정리
- 구간 DP의 상태는 `dp[l][r]`, 전이는 "마지막 분할 지점 k"를 모두 시도하는 것이다.
- 짧은 구간에만 기대므로 구간 길이 순서로 채우고, k를 기록하면 괄호(합치는 순서)를 복원할 수 있다.
- 파일 합치기와 행렬 곱셈 순서는 같은 구조이며, 이웃 조건이 없으면 허프만식 탐욕으로 충분하다.
- 상태 n² × 전이 n이라 O(n³)이고, 특별한 구조가 있으면 더 줄어든다.

## 더 알아보기
- 이전 글: 4편 「LCS와 편집 거리: 두 문자열을 맞추는 DP」
- 다음 글: 6편 「비트마스크 DP: 외판원 순회 문제」
