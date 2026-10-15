# [심화 알고리즘 6/14] 슬로프 트릭: 볼록 조각 선형 함수를 힙으로 다루기

> **한 줄 요약** — DP의 상태 함수 f(x)가 볼록 조각 선형이면 표 전체 대신 기울기가 꺾이는 점들만 힙에 들고 있으면 되고, ∣x − a∣ 더하기·접두 최솟값·평행 이동이 모두 힙 연산 몇 번이 되어 "수열을 비감소로 만드는 최소 비용"이 값 범위와 무관하게 O(n log n)에 풀린다.

## 이 글에서 다루는 것
- 예제: 수열을 비감소로 만드는 최소 비용 Σ ∣aᵢ − bᵢ∣
- DP 함수가 볼록 조각 선형이라는 관찰과 꺾이는 점의 최대 힙
- ∣x − a∣ 더하기, 접두 최솟값, 답과 최적 수열 읽기
- 일반형: 두 힙과 미룬 평행 이동, 이동 범위 제한 변형
- 값 범위 전체 DP와의 무작위 대조, 엄격 증가 변형

## 예제 문제: 비감소로 만드는 최소 비용
정수 수열 a₁, …, aₙ을 비감소 수열 b₁ ≤ b₂ ≤ … ≤ bₙ으로 바꾸는데, 비용은 Σ ∣aᵢ − bᵢ∣다. a = [2, 5, 1]이면 b = [2, 2, 2]로 바꿔 0 + 3 + 1 = 4가 최소다. 통계에서는 L1 등위 회귀(isotonic regression)라고 부르는 문제다.

동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」식으로 쓰면 fᵢ(x)는 "앞 i개를 정했고 bᵢ = x일 때의 최소 비용"이다.
```text
fᵢ(x) = ∣x − aᵢ∣ + gᵢ₋₁(x)
gᵢ(x) = min fᵢ(y)   (y ≤ x)
답 = min gₙ
```
gᵢ는 fᵢ의 접두 최솟값이다. x를 값 범위 V 전체에서 돌리면 O(n·V)다. 최적해의 bᵢ가 a의 값 중 하나라는 성질로 V를 n으로 줄여도 O(n²)이다. aᵢ가 10⁹까지, n이 10⁵이면 둘 다 안 된다.

## 관찰: 함수가 볼록 조각 선형이다
∣x − a∣는 a에서 기울기가 −1에서 +1로 꺾이는 볼록 조각 선형 함수다. 볼록 함수의 합은 볼록이고, 볼록 함수의 접두 최솟값도 볼록이다(최솟점 오른쪽을 평평하게 펼 뿐이다). 그래서 모든 fᵢ, gᵢ가 정수 기울기의 볼록 조각 선형이다. 이런 함수는 "기울기가 1씩 커지는 점들"의 중복 집합과 최솟값 하나로 완전히 정해진다. 기울기가 2만큼 꺾이는 점은 두 번 넣는다.

gᵢ₋₁은 비증가이므로 꺾이는 점은 모두 최솟점 왼쪽에 있고, 그 집합을 L이라 하자. 맨 왼쪽 기울기는 −∣L∣이고 L의 최댓값부터는 기울기 0이다. 이제 aᵢ = a를 처리한다.
```text
fᵢ = gᵢ₋₁ + ∣x − a∣
 → a에서 기울기 +2, 맨 오른쪽 기울기 +1
gᵢ = fᵢ의 접두 최솟값
 → 맨 오른쪽 꺾임 하나(L ∪ {a, a}의
   최댓값)가 사라진다
a ≥ max L: 최솟값 그대로, L에 a 하나
a < max L: 최솟값 += max L − a,
           max L을 빼고 a를 두 번
```
a < max L일 때 최솟값이 max L − a만큼 오르는 이유는 이렇다. a와 max L 사이에서 gᵢ₋₁의 기울기는 −1 이하이고 ∣x − a∣의 기울기는 +1이라 합의 기울기가 0 이하다. a 왼쪽은 더 가파르게 내려가고 max L 오른쪽은 +1로 오르니, fᵢ의 최솟값은 max L에서의 값 (gᵢ₋₁의 최솟값) + (max L − a)다. 결국 필요한 연산은 "최댓값 보기, 빼기, 넣기"뿐이라 L을 고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」의 최대 힙으로 들면 된다. 이렇게 함수를 꺾이는 점의 힙으로 다루는 방법을 경시 프로그래밍에서 흔히 **슬로프 트릭**(slope trick)이라고 부른다.

## 구현과 함수 들여다보기
최적 수열도 읽을 수 있다. 각 단계의 max L(= gᵢ가 최솟값이 되기 시작하는 점)을 topᵢ라 하면, 뒤에서부터 bₙ = topₙ, bᵢ = min(topᵢ, bᵢ₊₁)로 정하면 된다. 아래 코드는 a = [2, 5, 1]에서 표로 계산한 gᵢ와 힙의 꺾이는 점을 나란히 보여 준다.
```python
import heapq, random

def nondecreasing_cost(a):          # 비감소 b로 만드는 최소 Σ∣aᵢ − bᵢ∣
    L, ans, tops = [], 0, []        # L = 꺾이는 점의 최대 힙(부호 반전)
    for x in a:
        heapq.heappush(L, -x)
        if -L[0] > x:               # 최솟점이 x보다 오른쪽이면
            ans += -L[0] - x        # 최솟값이 max L − x만큼 오르고
            heapq.heapreplace(L, -x)  # max L을 빼고 x를 하나 더
        tops.append(-L[0])
    b = tops[:]                     # 뒤에서부터 bᵢ = min(topᵢ, bᵢ₊₁)
    for i in range(len(b) - 2, -1, -1): b[i] = min(b[i], b[i + 1])
    return ans, b

def dp_cost(a):                     # 값 범위 전체 DP
    lo, hi = min(a), max(a)
    g = [0] * (hi - lo + 1)
    for x in a:
        f = [g[v] + abs(lo + v - x) for v in range(len(g))]
        g = [min(f[:v + 1]) for v in range(len(f))]   # 접두 최솟값
    return g[-1]

a = [2, 5, 1]
L, g = [], [0] * 7
for x in a:                         # x = 0..6에서 gᵢ를 표로 계산
    g = [g[v] + abs(v - x) for v in range(7)]
    g = [min(g[:v + 1]) for v in range(7)]
    heapq.heappush(L, -x)
    if -L[0] > x: heapq.heapreplace(L, -x)
    print(f"a={x} g={g} 꺾이는 점 {sorted(-y for y in L)}")
print(nondecreasing_cost(a), dp_cost(a))
```
```text
a=2 g=[2, 1, 0, 0, 0, 0, 0] 꺾이는 점 [2]
a=5 g=[7, 5, 3, 2, 1, 0, 0] 꺾이는 점 [2, 5]
a=1 g=[8, 5, 4, 4, 4, 4, 4] 꺾이는 점 [1, 1, 2]
(4, [2, 2, 2]) 4
```
마지막 줄의 g를 보면 기울기가 −3, −1, 0, 0…으로, x = 1에서 2만큼, x = 2에서 1만큼 꺾인다. 힙의 [1, 1, 2]와 정확히 같고, 맨 왼쪽 기울기 −3은 힙 크기다. 힙은 표 7칸 대신 점 3개만 들고 있다.

## 무작위 대조 검사와 엄격 증가 변형
앞 코드에 이어서, 값 범위 DP와 비교하고 복원한 b가 비감소이며 비용이 답과 같은지도 확인한다. **엄격 증가**(b₁ < b₂ < …, 정수)는 bᵢ − i가 비감소인 것과 같으므로 aᵢ − i에 같은 함수를 쓰면 된다. 이것은 엄격 증가 조건을 직접 넣은 DP와 비교한다.
```python
def dp_strict(a):                   # 엄격 증가 정수 b, 값 범위를 넉넉히
    vals = range(min(a) - len(a), max(a) + len(a) + 1)
    f = [abs(v - a[0]) for v in vals]
    for x in a[1:]:
        best, g = float("inf"), []
        for i, v in enumerate(vals):
            g.append(best + abs(v - x))     # best = min f(u), u ≤ v − 1
            best = min(best, f[i])
        f = g
    return min(f)

rng, ok = random.Random(6), 0
for _ in range(500):
    m = rng.choice([3, 10, 30])
    a = [rng.randrange(m) for _ in range(rng.randint(1, 12))]
    ans, b = nondecreasing_cost(a)
    strict = nondecreasing_cost([x - i for i, x in enumerate(a)])[0]
    ok += (ans == dp_cost(a) == sum(abs(x - y) for x, y in zip(a, b))
           and b == sorted(b) and strict == dp_strict(a))
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 일반형: 두 힙과 미룬 평행 이동
접두 최솟값을 매번 취하지 않는 문제에서는 최솟점 오른쪽의 꺾이는 점도 필요하다. 그래서 최솟점 왼쪽의 점은 최대 힙 L, 오른쪽의 점은 최소 힙 R에 두고 최솟값 min_f를 함께 든다. 함수는 `f(x) = min_f + Σ max(0, l − x) + Σ max(0, x − r)`이다.
- `max(0, x − a)` 더하기: min_f에 max(0, max L − a)를 더하고, a를 L에 넣은 뒤 L의 최댓값을 R로 옮긴다. `max(0, a − x)`는 좌우 대칭이다. ∣x − a∣는 둘 다 더하면 된다.
- 접두 최솟값은 R 비우기, 접미 최솟값은 L 비우기다.
- `g(x) = min f(y), x − hi ≤ y ≤ x − lo`(창 최솟값): 왼쪽 점은 lo만큼, 오른쪽 점은 hi만큼 평행 이동한다. 힙의 원소를 다 고치지 않고 힙마다 더할 값 하나(`addL`, `addR`)만 미뤄 둔다.

**이동 범위 제한** 변형 "∣bᵢ − bᵢ₋₁∣ ≤ d이면서 Σ ∣aᵢ − bᵢ∣ 최소"는 매 단계 창 최솟값(lo = −d, hi = d)을 취한 뒤 ∣x − aᵢ∣를 더하면 된다. 앞 코드에 이어서, 같은 클래스로 비감소 문제도 다시 풀어 함께 대조한다.
```python
INF = float("inf")

class SlopeTrick:   # f(x) = min_f + Σ max(0, l − x) + Σ max(0, x − r)
    def __init__(self):
        self.min_f, self.L, self.R = 0, [], []  # L 최대 힙(부호 반전)
        self.addL = self.addR = 0               # 힙마다 미룬 평행 이동
    def push_l(self, v): heapq.heappush(self.L, -(v - self.addL))
    def push_r(self, v): heapq.heappush(self.R, v - self.addR)
    def top_l(self): return -self.L[0] + self.addL if self.L else -INF
    def top_r(self): return self.R[0] + self.addR if self.R else INF

    def add_x_minus_a(self, a):     # f += max(0, x − a)
        self.min_f += max(0, self.top_l() - a)
        self.push_l(a)
        self.push_r(-heapq.heappop(self.L) + self.addL)

    def add_a_minus_x(self, a):     # f += max(0, a − x)
        self.min_f += max(0, a - self.top_r())
        self.push_r(a)
        self.push_l(heapq.heappop(self.R) + self.addR)

    def add_abs(self, a):
        self.add_x_minus_a(a); self.add_a_minus_x(a)
    def prefix_min(self): self.R = []
    def slide(self, lo, hi):        # f(x) ← min f(y), x − hi ≤ y ≤ x − lo
        self.addL += lo; self.addR += hi

def bounded_cost(a, d):             # ∣bᵢ − bᵢ₋₁∣ ≤ d
    st = SlopeTrick()
    for x in a:
        st.slide(-d, d); st.add_abs(x)
    return st.min_f

def dp_bounded(a, d):               # 값 범위 [min a, max a]면 충분하다
    lo = min(a)
    f = [abs(v - a[0]) for v in range(lo, max(a) + 1)]
    for x in a[1:]:
        f = [min(f[max(0, v - d):v + d + 1]) + abs(lo + v - x)
             for v in range(len(f))]
    return min(f)

rng, ok = random.Random(7), 0
for _ in range(500):
    a = [rng.randrange(20) for _ in range(rng.randint(1, 12))]
    d = rng.randrange(4)
    st = SlopeTrick()
    for x in a: st.prefix_min(); st.add_abs(x)
    ok += bounded_cost(a, d) == dp_bounded(a, d) and st.min_f == dp_cost(a)
print(f"무작위 500개 비교: {ok}개 일치")
print(bounded_cost([0, 10, 0, 10], 3), bounded_cost([0, 10, 0, 10], 10))
```
```text
무작위 500개 비교: 500개 일치
14 0
```
[0, 10, 0, 10]에서 한 번에 3까지만 움직일 수 있으면 b = [2, 5, 2, 5]처럼 가운데로 모여 비용 14가 되고, 10까지 움직일 수 있으면 그대로 두어 0이다. 값 범위를 [min a, max a]로 잘라도 되는 이유는, b를 그 범위로 잘라 붙이면 ∣aᵢ − bᵢ∣도 이웃 차이도 커지지 않기 때문이다.

## 자주 하는 실수와 변형
- 최대 힙을 파이썬 `heapq`로 만들 때 부호를 한쪽에서만 뒤집는 실수. 넣을 때와 꺼낼 때 모두 뒤집는다. 미룬 이동 `addL`도 넣을 때 빼고 꺼낼 때 더한다.
- 엄격 증가를 비감소 코드로 그대로 풀면 같은 값이 연속해 답이 작게 나온다. aᵢ − i로 바꾼다.
- 비용이 가중치 wᵢ∣x − aᵢ∣면 꺾이는 점을 wᵢ번 넣는 대신 (점, 개수) 쌍으로 힙에 넣는다.
- 비용이 제곱 (x − aᵢ)²이면 조각 선형이 아니라 이 방법이 그대로는 안 된다. 기울기가 연속으로 바뀌기 때문이다.
- "최소 비용으로 모든 원소를 같은 값으로" 같은 단순 문제는 중앙값으로 끝난다. 슬로프 트릭은 b에 순서 제약이 있을 때 쓴다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| 값 범위 DP | O(n·V) | O(V) |
| a의 값만 쓰는 DP | O(n²) | O(n) |
| 슬로프 트릭 | O(n log n) | O(n) |

- 단계마다 힙 연산이 상수 번이고 힙 크기는 O(n)이라 O(n log n)이다. 값 범위 V와 무관하다. 평행 이동은 O(1)이다.

## 어디에 쓰이나
- 미적분 9편 「최적화: 극값과 볼록 함수」: 볼록 함수의 합과 접두 최솟값이 다시 볼록이라는 성질이 이 방법 전체를 떠받친다.
- 통계학 8편 「선형 회귀와 최소제곱법」: 회귀에 "예측값이 단조 증가해야 한다"는 제약을 건 것이 등위 회귀이고, 이 글의 예제는 그 L1 버전이다.
- 7편 「Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화」: 다음 글도 DP 값이 볼록이라는 성질 하나로 차원을 줄인다. 이번에는 x가 아니라 개수 k에 대해 볼록이다.

## 정리
- DP 함수 f(x)가 볼록 조각 선형이면 꺾이는 점들의 힙과 최솟값만으로 함수 전체를 나타낼 수 있다.
- ∣x − a∣ 더하기는 점 두 개 넣기, 접두 최솟값은 오른쪽 점 버리기, 창 최솟값은 미룬 평행 이동이다.
- 비감소 비용 문제는 최대 힙 하나로 O(n log n)이고, 엄격 증가는 aᵢ − i로 바꾼다.
- 값 범위 DP와의 대조가 기본형·엄격 증가·이동 범위 제한에서 모두 일치했다.

## 더 알아보기
- 이전 글: 5편 「오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드」
- 다음 글: 7편 「Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화」
- 위키백과 Isotonic regression: https://en.wikipedia.org/wiki/Isotonic_regression
