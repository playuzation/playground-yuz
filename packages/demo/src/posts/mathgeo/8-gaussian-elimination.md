# [수학·기하 알고리즘 8/12] 가우스 소거법: 연립방정식과 XOR 기저

> **한 줄 요약** — 가우스 소거법은 피벗을 골라 아래위를 0으로 지우는 O(n³) 절차로, 실수에서는 절댓값이 가장 큰 피벗을 골라야 오차가 폭주하지 않고, 남은 행과 피벗 수로 해 없음·하나·무수히 많음을 판정하며, 같은 절차를 법 p와 GF(2)에서 돌리면 모듈러 연립방정식과 XOR 기저가 된다.

## 이 글에서 다루는 것
- 가우스-조르당 소거 구현과 해의 개수 판정
- 부분 피벗: 작은 피벗이 답을 망가뜨리는 예
- 소행렬식으로 구한 랭크(정의 그대로)와 대조
- 법 p 소거와 모든 대입을 세는 대조
- GF(2) XOR 기저와 부분집합 XOR 최댓값

## 소거의 뼈대
식을 빼서 미지수를 지우는 과정과 해의 세 경우는 선형대수 5편 「연립일차방정식과 역행렬」에서 손으로 따라가 보았다. 여기서는 그것을 코드로 만든다. 열을 왼쪽부터 보며 ① 아직 안 쓴 행 중에서 **피벗**(그 열의 0 아닌 기준값)을 고르고 ② 그 행을 위로 올린 뒤 ③ 다른 모든 행의 같은 열을 0으로 지운다. 위까지 지우는 것을 **가우스-조르당** 소거라 하며, 끝나면 피벗 열마다 값이 하나만 남아 해를 바로 읽는다. 피벗을 찾지 못한 열은 **자유 변수**다.

| 소거가 끝난 뒤 | 판정 |
|---|---|
| `0 = (0 아닌 수)` 행이 남음 | 해 없음 |
| 피벗 수 = 미지수 수 | 해 하나 |
| 피벗 수 < 미지수 수 | 무수히 많음 |

피벗 수가 곧 **랭크**(선형대수 6편)다. 이 방법은 가우스의 이름이 붙었지만, 중국의 『구장산술』 8장 「방정」에 계산 막대로 첨가 행렬을 놓고 소거하는 거의 같은 절차가 이미 실려 있다.

## 구현과 부분 피벗
실수에서는 피벗 고르기가 중요하다. 아래 `solve`는 기본으로 그 열에서 **절댓값이 가장 큰 행**을 피벗으로 고르고(**부분 피벗**), `pivot=False`면 교과서처럼 0이 아닌 첫 행을 쓴다. `eps`보다 작은 값은 0으로 본다.
```python
def solve(A, b, pivot=True, eps=1e-9):
    n, m = len(A), len(A[0])
    M = [row[:] + [bi] for row, bi in zip(A, b)]      # 첨가 행렬
    where = [-1] * m                                  # 열 c의 피벗 행
    r = 0
    for c in range(m):
        if r == n:
            break
        if pivot:                                     # 절댓값이 가장 큰 행
            p = max(range(r, n), key=lambda i: abs(M[i][c]))
        else:                                         # 0이 아닌 첫 행
            p = next((i for i in range(r, n) if M[i][c] != 0), r)
        if abs(M[p][c]) <= eps:
            continue                                  # 피벗 없음: 자유 변수
        M[r], M[p] = M[p], M[r]
        for i in range(n):
            if i != r:
                f = M[i][c] / M[r][c]
                for j in range(c, m + 1):
                    M[i][j] -= f * M[r][j]
        where[c] = r
        r += 1
    if any(abs(M[i][m]) > eps for i in range(r, n)):  # 0 = 0 아닌 수
        return "없음", None
    x = [M[w][m] / M[w][c] if w >= 0 else 0.0 for c, w in enumerate(where)]
    return ("유일" if r == m else "무수히 많음"), x

print(solve([[1, 1, 1], [2, 1, -1], [1, -1, 2]], [6, 1, 5]))
print(solve([[1, 2], [2, 4]], [3, 6]), solve([[1, 2], [2, 4]], [3, 7]))
A, b = [[1e-17, 1], [1, 1]], [1, 2]
print(solve(A, b, pivot=False), solve(A, b, pivot=False, eps=0))
print(solve(A, b))
```
```text
('유일', [1.0, 2.0000000000000013, 3.0000000000000004])
('무수히 많음', [3.0, 0.0]) ('없음', None)
('없음', None) ('유일', [0.0, 1.0])
('유일', [1.0, 1.0])
```
첫 줄은 5편의 예제(답 1, 2, 3)로 끝자리에 부동소수점 오차가 묻어 있다. 둘째 줄은 겹치는 직선(무수히 많음, 자유 변수는 0)과 평행한 직선(없음)이다. 셋째 줄이 핵심이다. `1e-17·x + y = 1`, `x + y = 2`의 답은 거의 (1, 1)인데, 피벗 없이 풀면 작은 피벗을 0으로 보아 "해 없음"이라 하거나, `1e-17`로 나눈 `1e17`배를 빼다가 `2 − 1e17`에서 2가 반올림으로 사라져 (0, 1)을 낸다. 부분 피벗은 절댓값 1인 둘째 행을 먼저 써서 곱하는 배수가 늘 1 이하이므로 한 단계에서 오차가 크게 불어나지 않는다.

## 대조 검사: 소행렬식으로 구한 랭크
앞 코드에 이어서, 소거를 전혀 쓰지 않는 정의 그대로의 방법과 비교한다. 행렬식은 모든 순열의 곱을 더하는 **라이프니츠 공식**으로, 랭크는 "0이 아닌 k×k 소행렬식이 있는 가장 큰 k"로 정수 그대로 정확히 구한다. `rank(A) < rank([A∣b])`이면 해 없음, 랭크가 미지수 수와 같으면 해 하나, 아니면 무수히 많음이다(루셰-카펠리 정리). 해가 있다고 답했으면 그 해를 식에 넣어 본다.
```python
import random
from itertools import combinations, permutations, product

def det(M):                       # 라이프니츠 공식: 순열마다 곱을 더한다
    n, total = len(M), 0
    for p in permutations(range(n)):
        t = (-1) ** sum(p[i] > p[j] for i in range(n) for j in range(i))
        for i in range(n):
            t *= M[i][p[i]]
        total += t
    return total

def rank(M):                      # 0 아닌 k×k 소행렬식이 있는 최대 k
    for k in range(min(len(M), len(M[0])), 0, -1):
        for rs in combinations(range(len(M)), k):
            for cs in combinations(range(len(M[0])), k):
                if det([[M[i][j] for j in cs] for i in rs]):
                    return k
    return 0

def check(A, b, st, x):
    r, r2 = rank(A), rank([row + [bi] for row, bi in zip(A, b)])
    want = "없음" if r2 > r else "유일" if r == len(A[0]) else "무수히 많음"
    return st == want and (st == "없음" or all(   # 해라면 식에 넣어 확인
        abs(sum(a * v for a, v in zip(row, x)) - bi) < 1e-9
        for row, bi in zip(A, b)))

rng = random.Random(8)
ok = cnt_s = 0
for _ in range(500):
    n = rng.randint(1, 4)
    A = [[rng.randint(-2, 2) for _ in range(n)] for _ in range(n)]
    b = [rng.randint(-3, 3) for _ in range(n)]
    st, x = solve(A, b)
    ok += check(A, b, st, x)
    cnt_s += st != "유일"
print(f"무작위 500개(해가 하나가 아닌 것 {cnt_s}개) 중 {ok}개 통과")
```
```text
무작위 500개(해가 하나가 아닌 것 91개) 중 500개 통과
```

## 모듈러 소거
법이 소수 p이면 나눗셈은 역원 곱하기다(1편, 5편). 실수와 달리 오차가 없으므로 0이 아니기만 하면 아무 피벗이나 써도 된다. 해가 있으면 자유 변수 `m − r`개가 각각 p가지 값을 가지므로 해는 정확히 `p^(m−r)`개다. 앞 코드에 이어서, p = 5에서 미지수의 모든 대입 `5^m`가지를 직접 대입해 센 해의 개수와 비교한다.
```python
def solve_mod(A, b, p):
    n, m = len(A), len(A[0])
    M = [[v % p for v in row] + [bi % p] for row, bi in zip(A, b)]
    where, r = [-1] * m, 0
    for c in range(m):
        q = next((i for i in range(r, n) if M[i][c]), None)  # 0 아니면 피벗
        if q is None:
            continue                  # 이 열은 자유 변수
        M[r], M[q] = M[q], M[r]
        inv = pow(M[r][c], p - 2, p)  # 페르마 소정리로 역원
        M[r] = [v * inv % p for v in M[r]]
        for i in range(n):
            if i != r and M[i][c]:
                f = M[i][c]
                M[i] = [(v - f * w) % p for v, w in zip(M[i], M[r])]
        where[c] = r
        r += 1
        if r == n:
            break
    if any(M[i][m] for i in range(r, n)):
        return 0, None
    x = [M[w][m] if w >= 0 else 0 for w in where]
    return p ** (m - r), x            # 자유 변수 m − r개

rng, P, ok = random.Random(5), 5, 0
for _ in range(500):
    n, m = rng.randint(1, 3), rng.randint(1, 3)
    A = [[rng.randrange(P) for _ in range(m)] for _ in range(n)]
    b = [rng.randrange(P) for _ in range(n)]
    sols = [x for x in product(range(P), repeat=m)
            if all(sum(a * v for a, v in zip(row, x)) % P == bi
                   for row, bi in zip(A, b))]
    cnt, x = solve_mod(A, b, P)
    ok += cnt == len(sols) and (cnt == 0 or tuple(x) in sols)
print(f"법 5, 무작위 500개: 해 개수와 해가 모두 맞은 것 {ok}개")
```
```text
법 5, 무작위 500개: 해 개수와 해가 모두 맞은 것 500개
```

## GF(2)와 XOR 기저
p = 2이면 덧셈이 XOR이다. 수를 비트 벡터로 보면 "몇 개를 골라 XOR한 값"은 일차 결합이고, 소거로 만든 **XOR 기저**가 그 값들을 모두 만든다. 수를 하나씩 넣으며 최고 비트가 k인 기저 원소가 있으면 XOR해 그 비트를 지우고, 없으면 그 자리에 저장한다. 기저 원소들의 최고 비트가 모두 다르므로, 높은 비트부터 "XOR해서 커지면 XOR"하는 탐욕법이 최댓값을 준다. 만들 수 있는 서로 다른 값은 정확히 `2^랭크`개다. 앞 코드에 이어서, 모든 부분집합의 XOR을 직접 모은 결과와 비교한다.
```python
def xor_basis(nums, bits=30):
    basis = [0] * bits                # basis[k]: 최고 비트가 k인 원소
    for v in nums:
        for k in reversed(range(bits)):
            if not v >> k & 1:
                continue
            if not basis[k]:
                basis[k] = v
                break
            v ^= basis[k]             # 최고 비트를 지운다
    return basis

def max_xor(basis):
    best = 0
    for v in reversed(basis):         # 높은 비트부터 탐욕적으로
        best = max(best, best ^ v)
    return best

print(max_xor(xor_basis([3, 10, 5, 25, 2, 8])))
rng, ok = random.Random(2), 0
for _ in range(500):
    nums = [rng.randrange(64) for _ in range(rng.randint(1, 10))]
    vals = {0}
    for v in nums:                    # 모든 부분집합의 XOR
        vals |= {u ^ v for u in vals}
    basis = xor_basis(nums, 6)
    r = sum(1 for v in basis if v)
    ok += max(vals) == max_xor(basis) and len(vals) == 2 ** r
print(f"XOR 기저 무작위 500개: {ok}개 일치")
```
```text
31
XOR 기저 무작위 500개: 500개 일치
```
`25 ⊕ 5 ⊕ 3 = 31`이다. 같은 방식으로 "전구를 누르면 이웃까지 켜짐·꺼짐이 바뀌는 퍼즐"도 칸마다 미지수 하나인 GF(2) 연립방정식으로 푼다.

## 자주 하는 실수와 변형
- 실수 소거에서 `== 0`으로 비교하면 1e-16 같은 찌꺼기를 피벗으로 쓴다. `eps`를 두고, 값의 크기가 제각각이면 행의 크기를 맞춘다.
- 해 없음 판정을 빼먹고 자유 변수를 0으로 둔 "해"를 그대로 낸다.
- 모듈러 소거에서 법이 소수가 아니면 역원이 없는 피벗이 생긴다. 이때는 유클리드 호제법 방식으로 두 행을 서로 빼 나가는 변형이 필요하다.
- 변형 유형: 행렬식(피벗의 곱, 행 교환마다 부호 반전), 역행렬(`[A∣I]`를 소거), k번째로 작은 부분집합 XOR(기저를 완전히 소거한 뒤 k의 비트로 고르기).

## 복잡도
| 대상 | 시간 | 근거 |
|---|---|---|
| n×n 소거 | O(n³) | 피벗 n개 × 행 n개 × 열 n개 |
| XOR 기저 | O(N·B) | 수 N개 × 비트 B개 |

- 대조에 쓴 라이프니츠 행렬식은 n = 10이면 항이 362만 개다. 소거는 행렬식을 O(n³)에 구하는 방법이기도 하다.
- 공간은 첨가 행렬 O(nm), XOR 기저는 O(B)다.

## 어디에 쓰이나
- 선형대수 5편 「연립일차방정식과 역행렬」: 그 글에서 권한 `np.linalg.solve`는 LAPACK의 `gesv` 루틴을 부르고, `gesv`는 이 글의 부분 피벗을 쓰는 LU 분해로 푼다.
- 선형대수 6편 「일차 독립, 기저, 차원, 랭크」: 소거 후 피벗 수가 랭크이고, XOR 기저의 크기는 GF(2)에서 본 랭크다.
- 알고리즘 기법 11편 「비트마스킹: 정수 하나로 집합 다루기」: GF(2)의 행은 비트마스크 하나이고, 행끼리 빼기는 XOR 한 번이다.

## 정리
- 가우스-조르당 소거는 피벗 열마다 다른 행을 모두 지우며 O(n³)에 해와 랭크를 함께 구한다.
- 실수에서는 부분 피벗이 필수다. 작은 피벗은 0으로 보든 나누든 답을 망가뜨린다.
- 법 p에서는 오차가 없고 해의 개수가 `p^(m−r)`로 정확히 나온다.
- GF(2) 소거가 XOR 기저이며, 최댓값은 높은 비트부터 탐욕적으로 고른다. 세 구현 모두 정의 그대로의 완전 탐색과 500개씩 일치했다.

## 더 알아보기
- 이전 글: 7편 「FFT와 NTT: 다항식 곱셈을 O(n log n)에」
- 다음 글: 9편 「계산 기하 기초: CCW와 선분 교차」
