# [알고리즘 기법 3/14] 이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기

> **한 줄 요약** — 이분 탐색은 "거짓 … 거짓 참 … 참"으로 한 번만 바뀌는 조건의 경계를 매번 절반씩 좁혀 찾는 방법이고, 최적화 문제를 "답이 x여도 되는가"라는 판정 문제로 바꾸면 배열이 없어도 답 자체를 이분 탐색할 수 있다.

## 이 글에서 다루는 것
- lower bound·upper bound와 반열린 구간 불변식
- 경계 실수를 무작위 대조로 잡기
- 매개 변수 탐색: 나무 자르기·공유기 배치 유형
- 실수 이분 탐색은 반복 횟수로 끝낸다

## 값 찾기보다 경계 찾기
정렬된 배열에서 값 하나를 찾는 이분 탐색과 그것이 O(log n)인 이유는 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」에서 봤다. 실전에서 더 자주 묻는 것은 "x 이상인 첫 위치"(lower bound)와 "x 초과인 첫 위치"(upper bound)다. 둘의 차이가 x의 개수이고, 어떤 범위에 든 원소 수도 이 둘로 센다. 두 질문은 하나로 묶인다. 정렬된 배열에서 조건 `a[i] ≥ x`는 앞쪽에서 거짓이다가 어느 지점부터 끝까지 참이다. 이렇게 **거짓 … 거짓 참 … 참**으로 한 번만 바뀌는(단조인) 조건이면 처음 참이 되는 위치를 이분 탐색으로 찾을 수 있다.

이분 탐색이 처음 언급된 것은 1946년 존 모클리(John Mauchly)의 무어 스쿨 강의지만, 배열 길이가 2의 거듭제곱 꼴이 아니어도 동작하는 버전은 1960년에야 D. H. 레머(2편에서 백트래킹이라는 이름을 붙인 그 사람)가 발표했다. 아이디어는 단순해도 경계 처리는 그만큼 까다롭다. 실수를 막는 가장 좋은 방법은 **불변식**을 정하고 지키는 것이다. 아래 코드는 반열린 구간 `[lo, hi)`를 쓰고 "lo 앞은 모두 거짓, hi부터는 모두 참"을 유지한다.
```python
import bisect
import random

def first_true(lo, hi, pred):
    """[lo, hi)에서 pred가 처음 참이 되는 위치(없으면 hi).
    pred는 거짓 … 거짓 참 … 참 꼴이어야 한다."""
    while lo < hi:                        # 불변식: lo 앞은 거짓, hi부터 참
        mid = (lo + hi) // 2
        if pred(mid):
            hi = mid                      # mid도 후보로 남긴다
        else:
            lo = mid + 1                  # mid는 확실히 답이 아니다
    return lo

def lower_bound(a, x):                    # x 이상인 첫 위치
    return first_true(0, len(a), lambda i: a[i] >= x)

def upper_bound(a, x):                    # x 초과인 첫 위치
    return first_true(0, len(a), lambda i: a[i] > x)

rng = random.Random(3)
for _ in range(500):
    a = sorted(rng.randint(0, 9) for _ in range(rng.randint(0, 10)))
    x = rng.randint(-1, 10)
    assert lower_bound(a, x) == bisect.bisect_left(a, x) \
        == sum(v < x for v in a)          # 정렬돼 있으니 x 미만의 개수
    assert upper_bound(a, x) == bisect.bisect_right(a, x) \
        == sum(v <= x for v in a)
print("무작위 500개 비교: 모두 일치")
a = [1, 3, 3, 3, 5, 8]
lo, hi = lower_bound(a, 3), upper_bound(a, 3)
print(f"lower={lo} upper={hi} 3의 개수={hi - lo}")
```
```text
무작위 500개 비교: 모두 일치
lower=1 upper=4 3의 개수=3
```
`pred(mid)`가 참이면 mid가 답일 수도 있으니 `hi = mid`로 남기고, 거짓이면 mid는 확실히 답이 아니니 `lo = mid + 1`로 버린다. 어느 쪽이든 구간이 적어도 1 줄어들어 반드시 끝나고, 끝나면 `lo == hi`가 불변식에 따라 처음 참인 위치다. 참인 곳이 없으면 `hi`(배열 길이)를 돌려주므로 "x 이상인 원소가 없다"도 따로 처리할 필요가 없다. 검사에는 표준 라이브러리 `bisect`와, 정의 그대로인 "x 미만 원소 개수"를 함께 썼다.

## 경계 실수 잡기
닫힌 구간 `[lo, hi]`로 시작해 `lo = mid`를 쓰는 흔한 실수를 일부러 넣고 대조해 보자.
```python
import random

def buggy_lower(a, x):                    # 흔한 실수 두 가지가 섞인 버전
    lo, hi = 0, len(a) - 1                # 실수 1: 답이 len(a)일 수 있다
    for _ in range(100):                  # 무한 루프 감지용 상한
        if lo >= hi:
            return lo
        mid = (lo + hi) // 2
        if a[mid] < x:
            lo = mid                      # 실수 2: mid + 1이어야 한다
        else:
            hi = mid
    return "무한 루프"

rng = random.Random(4)
found = set()
for t in range(500):
    a = sorted(rng.randint(0, 5) for _ in range(rng.randint(1, 2 + t // 50)))
    x = rng.randint(0, 6)
    got, want = buggy_lower(a, x), sum(v < x for v in a)
    kind = "무한 루프" if got == "무한 루프" else "틀린 값"
    if got != want and kind not in found:
        found.add(kind)
        print(f"{kind}: a={a}, x={x}, 정답 {want}")
```
```text
틀린 값: a=[0], x=3, 정답 1
무한 루프: a=[0, 1], x=4, 정답 2
```
`hi = len(a) − 1`로 시작하면 "모든 원소가 x보다 작다"는 답 `len(a)`를 낼 수 없다. `lo = mid`는 `lo + 1 == hi`일 때 mid가 lo와 같아져 구간이 줄지 않으니 영원히 돈다. 둘 다 원소 한두 개짜리 입력에서 드러난다. 파이썬에는 없는 문제지만 C·자바에서는 `(lo + hi) / 2`의 덧셈이 넘칠 수도 있다. 2006년 조슈아 블로크(Joshua Bloch)는 자바 표준 라이브러리의 이분 탐색에 이 버그가 9년쯤 숨어 있었다고 보고했다. `lo + (hi − lo) / 2`처럼 쓰면 피할 수 있다.

## 매개 변수 탐색: 답을 이분 탐색하기
"조건을 만족하는 최대(최소) 값"을 묻는 최적화 문제는 "값이 x여도 조건을 만족하는가"라는 판정 문제로 바꿀 수 있다. 판정 결과가 x에 대해 단조이면 x를 이분 탐색한다. 이것이 **매개 변수 탐색**(parametric search)이다.
- 나무 자르기 유형: 높이가 hᵢ인 나무들을 높이 H에서 한꺼번에 자르면 `Σ max(0, hᵢ − H)`만큼 얻는다. M 이상 얻는 최대 H는? H를 높일수록 얻는 양이 줄어드니 "M 이상 얻는가"는 참 … 참 거짓 … 거짓이다.
- 공유기 배치 유형: 수직선 위 집 N채 중 C채에 공유기를 놓아, 가장 가까운 두 공유기 사이 거리를 최대로 한다. "최소 간격 d 이상으로 C개를 놓을 수 있는가"는 d가 작을수록 쉽다. 판정은 왼쪽 집부터 직전 공유기와 d 이상 떨어져 있으면 바로 놓는 그리디로 한다. 일찍 놓을수록 뒤에 남는 자리가 많아지므로 손해가 없다(7편의 교환 논증).

첫 코드에 이어서 `first_true`와 `random`을 그대로 쓴다.
```python
from itertools import combinations

def max_cut_height(h, m):                 # 얻는 나무가 m 이상인 최대 H
    enough = lambda H: sum(max(0, x - H) for x in h) >= m
    # H를 키우면 enough는 참 … 참 거짓 … 거짓: 처음 거짓 - 1이 답
    return first_true(0, max(h) + 1, lambda H: not enough(H)) - 1

def max_min_gap(xs, c):                   # 공유기 c개(c ≥ 2), 최소 간격 최대화
    xs = sorted(xs)
    def can(d):                           # 왼쪽부터 간격이 d 이상이면 설치
        cnt, last = 1, xs[0]
        for x in xs[1:]:
            if x - last >= d:
                cnt, last = cnt + 1, x
        return cnt >= c
    return first_true(1, xs[-1] - xs[0] + 1, lambda d: not can(d)) - 1

def cut_brute(h, m):
    return max(H for H in range(max(h) + 1)
               if sum(max(0, x - H) for x in h) >= m)

def gap_brute(xs, c):
    return max(min(b - a for a, b in zip(p, p[1:]))
               for p in combinations(sorted(xs), c))

rng = random.Random(5)
for _ in range(300):
    h = [rng.randint(1, 30) for _ in range(rng.randint(1, 8))]
    m = rng.randint(1, sum(h))
    assert max_cut_height(h, m) == cut_brute(h, m)
    xs = rng.sample(range(40), rng.randint(2, 9))
    c = rng.randint(2, len(xs))
    assert max_min_gap(xs, c) == gap_brute(xs, c)
print("무작위 300개씩 비교: 모두 일치")
print(max_cut_height([20, 15, 10, 17], 7), max_min_gap([1, 2, 8, 4, 9], 3))
```
```text
무작위 300개씩 비교: 모두 일치
15 3
```
최적화 문제를 직접 풀려면 "어떤 높이가 최선인가"를 고민해야 하지만, 판정은 반복문 하나면 된다. 비용은 판정 한 번의 비용 × log(답의 범위)라서, 높이가 10⁹까지여도 판정 30번이면 끝난다. 두 판정 모두 완전 탐색(모든 H, 모든 C채 조합)과 대조했다. 같은 틀의 변형으로는 "배열을 k개 구간으로 나눌 때 구간 합 최댓값의 최소"(합 상한 x를 정하고 그리디로 구간 수를 센다)와 "k번째로 작은 값"(x 이하인 원소가 k개 이상인 최소 x)이 있다.

## 실수 이분 탐색
답이 실수이면 `lo`와 `hi`를 실수로 두고 같은 일을 한다. 끝내는 조건은 "간격이 ε 이하"보다 **반복 횟수**로 정하는 편이 안전하다. 100번이면 처음 간격이 2¹⁰⁰분의 1로 줄어 double의 정밀도보다 훨씬 작다. 예는 길이가 aᵢ인 줄들에서 같은 길이 L의 조각을 k개 이상 잘라 낼 때의 최대 L이다.
```python
import random
from fractions import Fraction

def max_piece(a, k, iters=100):           # 길이 L 조각 k개 이상, 최대 L
    lo, hi = 0.0, float(max(a))
    for _ in range(iters):                # 오차 대신 반복 횟수로 끝낸다
        mid = (lo + hi) / 2
        if sum(int(x // mid) for x in a) >= k:
            lo = mid
        else:
            hi = mid
    return lo

def piece_brute(a, k):                    # 최적 L은 어떤 a[i]/j 꼴이다
    cands = {Fraction(x, j) for x in a for j in range(1, k + 1)}
    return max(L for L in cands if sum(x // L for x in a) >= k)

rng = random.Random(6)
for _ in range(300):
    a = [rng.randint(1, 100) for _ in range(rng.randint(1, 6))]
    k = rng.randint(1, 10)
    assert abs(max_piece(a, k) - piece_brute(a, k)) < 1e-9
print("무작위 300개 비교: 모두 일치")

lo, hi, steps = 123456.7, 123457.7, 0
while hi - lo > 1e-12 and steps < 1000:   # 상한이 없으면 끝나지 않는다
    lo = (lo + hi) / 2                    # 답이 늘 오른쪽에 있다고 하자
    steps += 1
print(f"{steps}번 뒤에도 간격 {hi - lo:.2e}")
```
```text
무작위 300개 비교: 모두 일치
1000번 뒤에도 간격 1.46e-11
```
완전 탐색 쪽은 "최적의 L에서는 어떤 줄이 딱 나누어떨어진다"는 성질로 후보 `aᵢ/j`를 모두 만들고, 실수 오차가 없게 `Fraction`으로 계산했고, 두 답의 차이가 10⁻⁹ 미만이면 일치로 본다. 아래쪽 실험은 ε 조건의 함정이다. 123,456 근처에서 이웃한 두 double의 간격은 약 1.46 × 10⁻¹¹이라 `hi − lo`가 10⁻¹²보다 작아질 수 없고, mid는 lo나 hi로 반올림되어 루프가 끝나지 않는다.

## 복잡도
| 대상 | 시간 | 공간 |
|---|---|---|
| lower/upper bound | O(log n) | O(1) |
| 나무 자르기 | O(N log max h) | O(1) |
| 공유기 배치 | O(N log N + N log D) | O(N) |
| 실수 탐색 100회 | 100 × 판정 비용 | O(1) |

- D는 집 좌표의 범위다. 정렬 O(N log N) 뒤 O(N) 판정을 log D번 한다.
- 모든 후보를 시도하는 단순한 방법은 나무 자르기에서 O(N × max h), 공유기 배치에서 조합 수 C(N, C)만큼 든다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 1편 「트랜지스터: 전기로 만든 스위치와 0·1의 탄생」: 인버터 출력 전압을 "NMOS 전류가 더 큰가"라는 단조 판정으로 40번 반씩 좁혀 찾는 코드가 이 글의 실수 이분 탐색이다.
- 동적 계획법 3편 「최장 증가 부분 수열: O(n²)에서 O(n log n)으로」: 꼬리 배열에서 lower bound로 바꿀 자리를 찾는 것이 O(n log n)의 핵심이다.
- git bisect: 커밋 이력에서 "버그가 있다"가 거짓 … 참 꼴이라는 점을 이용해, 버그가 처음 생긴 커밋을 log₂(커밋 수) 번 정도의 빌드·검사로 찾는다.

## 정리
- 이분 탐색은 거짓 … 참으로 한 번만 바뀌는 조건의 경계를 찾고, lower/upper bound는 그 특수한 경우다.
- 반열린 구간 `[lo, hi)`와 "lo 앞은 거짓, hi부터 참" 불변식을 지키면 무한 루프와 하나 차이 실수가 사라진다.
- 최적화 문제는 "x여도 되는가" 판정으로 바꾸고, 판정이 단조이면 답을 이분 탐색한다.
- 실수 이분 탐색은 ε 대신 반복 횟수로 끝낸다.

## 더 알아보기
- 이전 글: 2편 「완전 탐색과 백트래킹: 모든 경우를 보되 가지를 친다」
- 다음 글: 4편 「투 포인터: 두 끝을 움직여 O(n)에 구간 찾기」
- 블로크의 2006년 글 「Nearly All Binary Searches and Mergesorts are Broken」: https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/
