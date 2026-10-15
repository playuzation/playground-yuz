# [심화 알고리즘 14/14] 선형 계획법과 심플렉스: 부등식 제약 아래 최적화

> **한 줄 요약** — 일차 부등식으로 둘러싸인 볼록 다면체 위에서 일차 함수를 최대화하는 선형 계획은 최적해가 꼭짓점에 있으므로, 목적값이 오르는 이웃 꼭짓점으로 옮겨 가는 심플렉스(피벗 한 번 = 이웃 꼭짓점 이동)로 풀고, 블랜드 규칙으로 순환을 막고 보조 문제로 시작 꼭짓점을 찾으며, 쌍대 문제의 최적값이 같다는 사실이 최적성의 증명서가 된다.

## 이 글에서 다루는 것
- 선형 계획의 표준형과 가능 영역의 꼭짓점
- 피벗 = 이웃 꼭짓점으로 이동, 블랜드 규칙
- 원점이 가능해가 아닐 때의 보조 문제(2단계법)
- 쌍대성과 최대 유량 최소 컷 정리, 꼭짓점 전수와의 대조
- 최악의 경우(클리-민티)와 다항 시간 방법

## 예제 문제: 두 제품의 생산 계획
공장이 제품 x, y를 만든다. 개당 이익은 3과 5다. 공정 1은 x만 쓰며 4시간, 공정 2는 y 하나에 2시간씩 12시간, 공정 3은 x에 3시간·y에 2시간씩 18시간까지 쓸 수 있다.
```text
최대화
  3x + 5y
제약
   x       ≤ 4
       2y  ≤ 12
  3x + 2y  ≤ 18
  x, y ≥ 0
```
목적 함수와 제약이 모두 일차인 이런 문제가 **선형 계획**(linear programming)이다. 표준형은 `max cᵀx, Ax ≤ b, x ≥ 0`이다. 최소화는 부호를 뒤집고, ≥는 −1을 곱하고, 등식은 부등식 두 개로, 부호 없는 변수는 `x⁺ − x⁻`로 바꿔 넣는다.

제약 하나는 반평면이고 그 교집합(가능 영역)은 볼록 다각형이다. 목적값이 같은 점들은 평행한 직선이라, 직선을 이익이 커지는 쪽으로 밀면 마지막에 닿는 곳이 **꼭짓점**이다. 꼭짓점은 제약 n개가 등호인 점이라 선형대수 5편 「연립일차방정식과 역행렬」의 연립방정식으로 구하지만, 조합이 C(m + n, n)개다. 1947년 단치그(George Dantzig)의 **심플렉스**(simplex) 방법은 꼭짓점을 다 보지 않고 좋아지는 쪽으로만 걷는다.

## 심플렉스: 이웃 꼭짓점으로 오르기
제약마다 여유 변수 sᵢ ≥ 0을 붙여 `x + s₁ = 4`처럼 등식으로 만든다. 변수 n + m개 중 n개(비기저)를 0으로 두면 그 제약들이 등호인 꼭짓점이고, 나머지 m개(기저)는 표에서 읽힌다.
- **들어올 변수**: 늘리면 목적값이 오르는(줄인 비용 > 0) 비기저 변수다. 없으면 최적이다. 가능 영역이 볼록이라 이웃 어디로도 오르지 않는 꼭짓점이 전체 최적이다.
- **나갈 변수**: 들어올 변수를 늘릴 때 가장 먼저 0에 닿는 기저 변수다(최소 비율 검사). 아무도 닿지 않으면 목적값이 무한히 커진다.
- 이 교환 한 번(**피벗**)이 다면체의 모서리 하나를 따라 이웃 꼭짓점으로 옮기는 것이다.

비율이 0인 퇴화 피벗에서는 꼭짓점은 그대로인 채 기저만 바뀌다 같은 기저로 돌아오는 **순환**(cycling)이 생길 수 있다. 블랜드(Robert Bland)의 1977년 **블랜드 규칙**은 들어올 변수와 (비율이 같을 때) 나갈 변수를 모두 번호가 가장 작은 것으로 골라 순환을 막는다. 계산은 분수(`Fraction`)로 해서 비교에 오차가 없게 한다.
```python
from fractions import Fraction as F

def pivot(T, basis, r, e):                # e열 변수가 r행 기저로 들어간다
    p = T[r][e]
    T[r] = [v / p for v in T[r]]
    for i in range(len(T)):
        if i != r and T[i][e]:
            f = T[i][e]
            T[i] = [a - f * b for a, b in zip(T[i], T[r])]
    basis[r] = e

def point(T, basis, n):                   # 지금 꼭짓점의 원래 변수 값
    x = [F(0)] * n
    for i, v in enumerate(basis):
        if v < n:
            x[v] = T[i][-1]
    return tuple(x)

def optimize(T, basis, cost, path, n):    # 블랜드 규칙으로 cost·x 최대화
    while True:
        red = [cost[j] - sum(cost[v] * T[i][j] for i, v in enumerate(basis))
               for j in range(len(cost))] # 늘리면 목적값이 오르는 정도
        e = next((j for j in range(len(cost)) if red[j] > 0), None)
        if e is None:                     # 들어올 변수: 번호가 가장 작은 것
            return "최적"
        rows = [i for i in range(len(T)) if T[i][e] > 0]
        if not rows:
            return "무한"
        r = min(rows, key=lambda i: (T[i][-1] / T[i][e], basis[i]))
        pivot(T, basis, r, e)             # 비율 최소, 동률이면 번호 작은 기저
        path.append(point(T, basis, n))

def simplex(A, b, c):                     # max c·x, Ax ≤ b, x ≥ 0
    m, n = len(A), len(c)
    x0 = n + m                            # 열: 원래 n, 여유 m, 보조 1, 우변
    T = [[F(v) for v in A[i]] + [F(int(i == j)) for j in range(m)]
         + [F(-1), F(b[i])] for i in range(m)]
    basis, path = list(range(n, n + m)), []
    if min(b) < 0:                        # 원점이 가능해가 아니면 1단계
        pivot(T, basis, min(range(m), key=lambda i: b[i]), x0)
        optimize(T, basis, [F(0)] * x0 + [F(-1)], [], n)   # x0 → 0
        if x0 in basis:
            r = basis.index(x0)
            if T[r][-1] > 0:
                return "불능", None, path
            e = next((j for j in range(x0) if T[r][j]), None)
            if e is not None:
                pivot(T, basis, r, e)
    for row in T:
        row[x0] = F(0)                    # 보조 변수를 지운다
    path.append(point(T, basis, n))
    cost = [F(v) for v in c] + [F(0)] * (m + 1)
    if optimize(T, basis, cost, path, n) == "무한":
        return "무한", None, path
    x = point(T, basis, n)
    return "최적", sum(ci * xi for ci, xi in zip(c, x)), path

A, b, c = [[1, 0], [0, 2], [3, 2]], [4, 12, 18], [3, 5]
status, val, path = simplex(A, b, c)
print(status, val, " → ".join(f"({x},{y})" for x, y in path))
At = [[-A[i][j] for i in range(3)] for j in range(2)]   # 쌍대를 최대화 꼴로
s2, v2, ypath = simplex(At, [-v for v in c], [-v for v in b])
print("쌍대 min b·y =", -v2, " y =", tuple(map(str, ypath[-1])))
```
```text
최적 36 (0,0) → (4,0) → (4,3) → (2,6)
쌍대 min b·y = 36  y = ('0', '3/2', '1')
```
원점에서 (4, 0), (4, 3)을 거쳐 (2, 6)에 닿았다. 피벗 세 번이 다각형의 변을 따라 이익 0, 12, 27, 36으로 오른 길이다. 둘째 줄의 쌍대는 아래에서 다룬다.

## 원점이 가능해가 아닐 때: 보조 문제
b에 음수가 있으면 원점이 제약을 어겨 출발할 꼭짓점이 없다. 그때는 보조 변수 x₀ ≥ 0을 넣은 `Ax − x₀ ≤ b`에서 `−x₀`를 최대화한다. 가장 음수인 행에서 x₀를 들이는 피벗 한 번이면 시작 꼭짓점이 생긴다. 보조 문제의 최적에서 x₀ > 0이면 원래 문제는 **불능**(가능해 없음)이고, x₀ = 0이면 그 기저가 원래 문제의 꼭짓점이라 x₀를 지우고 원래 목적으로 이어 간다(2단계법). x₀가 값 0으로 기저에 남으면 피벗해 내보낸다. 위 `simplex`의 `if min(b) < 0` 부분이다.

## 쌍대성: 최적성의 증명서
최대화 문제마다 짝이 되는 **쌍대**(dual) 문제 `min bᵀy, Aᵀy ≥ c, y ≥ 0`이 있다. 가능해 x, y가 있으면 `cᵀx ≤ (Aᵀy)ᵀx = yᵀ(Ax) ≤ yᵀb`라 쌍대의 어떤 값도 원래 문제의 상한이다(약쌍대성). 그리고 최적값은 같다(강쌍대성). 예제의 y = (0, 3/2, 1)은 공정 시간 1시간의 가치로 읽히며 `4·0 + 12·1.5 + 18·1 = 36`이 정확히 최대 이익과 같아, 36이 최적이라는 증명서가 된다. 쌍대를 풀 때 c를 뒤집은 `−Aᵀy ≤ −c`에는 음수 우변이 생겨 보조 문제가 실제로 쓰였다.

그래프 알고리즘 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」의 최대 유량을 선형 계획으로 쓰면, 그 쌍대는 정점마다 s 쪽·t 쪽을 고르는 컷 문제의 완화가 된다. 제약 행렬이 완전 단모듈러(totally unimodular)라 정수 최적해가 있어서, 최대 유량 최소 컷 정리는 강쌍대성의 한 경우다.

## 무작위 대조 검사: 꼭짓점 전수
앞 코드에 이어서, 변수 1~3개·제약 1~4개의 무작위 문제 300개를 푼다. 모든 변수에 `x ≤ 6`을 붙여 유계로 만들고 우변에 음수를 섞는다. 정답은 제약(부호 제약 포함) n개를 고르는 조합마다 수학·기하 알고리즘 8편 「가우스 소거법: 연립방정식과 XOR 기저」의 소거로 점을 구해 가능한 점 중 최대를 고르는 방법이다. 최적이면 쌍대도 풀어 비교한다.
```python
import random
from itertools import combinations

def solve(M, v):                          # 분수 가우스 소거, 해가 하나가 아니면 None
    k = len(M)
    M = [row[:] + [vi] for row, vi in zip(M, v)]
    for col in range(k):
        piv = next((r for r in range(col, k) if M[r][col] != 0), None)
        if piv is None:
            return None
        M[col], M[piv] = M[piv], M[col]
        for r in range(k):
            if r != col and M[r][col] != 0:
                f = M[r][col] / M[col][col]
                M[r] = [a - f * b for a, b in zip(M[r], M[col])]
    return [M[i][k] / M[i][i] for i in range(k)]

def by_vertices(A, b, c):                 # 제약 n개를 등호로 놓은 모든 조합
    n = len(c)
    rows = [list(map(F, a)) for a in A]
    rows += [[F(-int(i == j)) for j in range(n)] for i in range(n)]  # −x ≤ 0
    rhs = list(map(F, b)) + [F(0)] * n
    best = None
    for idx in combinations(range(len(rows)), n):
        x = solve([rows[i] for i in idx], [rhs[i] for i in idx])
        if x is not None and all(sum(p * q for p, q in zip(r, x)) <= h
                                 for r, h in zip(rows, rhs)):
            val = sum(F(ci) * xi for ci, xi in zip(c, x))
            best = val if best is None else max(best, val)
    return best

rng = random.Random(14)
count = {"최적": 0, "불능": 0}
for _ in range(300):
    n, m = rng.randint(1, 3), rng.randint(1, 4)
    A = [[rng.randint(-3, 5) for _ in range(n)] for _ in range(m)]
    b = [rng.randint(-5, 10) for _ in range(m)]
    A += [[int(i == j) for j in range(n)] for i in range(n)]  # x ≤ 6: 유계로
    b += [6] * n
    c = [rng.randint(-3, 5) for _ in range(n)]
    status, val, _ = simplex(A, b, c)
    assert val == by_vertices(A, b, c)
    count[status] += 1
    if status == "최적":                  # 쌍대: min b·y, Aᵀy ≥ c, y ≥ 0
        At = [[-A[i][j] for i in range(len(A))] for j in range(n)]
        s2, v2, _ = simplex(At, [-v for v in c], [-v for v in b])
        assert s2 == "최적" and -v2 == val
print("무작위 300개: 꼭짓점 전수와 모두 일치, 쌍대 최적값도 같음", count)
```
```text
무작위 300개: 꼭짓점 전수와 모두 일치, 쌍대 최적값도 같음 {'최적': 183, '불능': 117}
```
불능 117개를 포함해 모두 일치했고, 최적인 183개 모두 쌍대 최적값이 원래 최적값과 같았다.

## 최악의 경우와 다항 시간 방법
심플렉스는 실무에서 빠르지만 최악은 지수다. 클리(Victor Klee)와 민티(George Minty)는 1972년, 정육면체를 살짝 찌그러뜨려 "가장 가파른 변수를 고르는" 단치그 규칙이 꼭짓점 2ⁿ개를 모두 지나게 하는 예를 만들었다. 블랜드 규칙도 지수 시간이 되는 예가 알려져 있고, 어떤 피벗 규칙이 다항 시간인지는 아직 모른다. 다항 시간 방법은 하치얀(Khachiyan)의 1979년 타원체법이 처음이고, 1984년 카르마르카르(Karmarkar)의 내부점법은 다면체 안쪽을 가로질러 가는 방식으로 실용적인 다항 시간 방법의 길을 열었다.

## 자주 하는 실수와 변형
- 부동소수로 짜면 `> 0` 비교가 오차에 흔들려 순환하거나 틀린다. 작은 ε을 쓰거나 이 글처럼 분수를 쓴다.
- **정수 계획**: 변수가 정수여야 하면 NP-난해다. 분기 한정법이 선형 계획 완화를 반복해 풀며 범위를 좁힌다. 할당 문제처럼 제약 구조 덕분에 완화의 최적해가 저절로 정수인 경우도 있다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 꼭짓점 전수 | C(m+n, n)·n³ | 작은 문제만 |
| 심플렉스 | 피벗당 O(m(n + m)) | 최악 지수 |
| 타원체법 | 다항 | 실무에선 느림 |
| 내부점법 | 다항 | 큰 문제에 실용 |

피벗 한 번은 표의 m행 × (n + m)열을 한 번 고치는 일이다. 피벗 수는 실무 문제에서 대개 작지만 클리-민티처럼 지수가 되는 입력이 있다.

## 어디에 쓰이나
- 9편 「헝가리안 알고리즘: 할당 문제를 O(n³)에」: 그 글의 퍼텐셜 (u, v)는 할당 문제를 선형 계획으로 쓴 것의 쌍대 변수이고, 헝가리안은 쌍대 해를 고치며 원래 해를 키우는 방법이다.
- 미적분 9편 「최적화: 극값과 볼록 함수」: 선형 계획은 볼록 최적화의 가장 단순한 경우라 국소 최적이 곧 전역 최적이고, 목적이 일차라 최적값은 경계의 꼭짓점에서 얻을 수 있다.
- 운영 연구: 생산 계획, 수송, 배합, 일정 계획이 선형 계획으로 표현되고, 정수 계획 풀이기의 핵심도 반복되는 선형 계획 풀이다.

## 정리
- 선형 계획의 가능 영역은 볼록 다면체이고, 유계이고 가능하면 최적해가 꼭짓점에 있다.
- 심플렉스의 피벗은 이웃 꼭짓점으로의 이동이며, 블랜드 규칙이 퇴화에서의 순환을 막고 보조 문제가 시작 꼭짓점을 찾는다.
- 쌍대 최적값이 원래 최적값과 같아 증명서가 되고, 최대 유량 최소 컷 정리도 그 한 경우다.
- 꼭짓점 전수와 300개 모두 일치했다. 최악은 지수(클리-민티)이고, 다항 시간 방법으로 타원체법과 내부점법이 있다.

## 더 알아보기
- 이전 글: 13편 「선형 점화식: 벌레캄프-매시와 키타마사」
- 처음 글: 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」
- Simplex algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Simplex_algorithm
