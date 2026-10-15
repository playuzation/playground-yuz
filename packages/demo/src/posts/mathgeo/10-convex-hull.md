# [수학·기하 알고리즘 10/12] 볼록 껍질: 모노톤 체인과 그레이엄 스캔

> **한 줄 요약** — 볼록 껍질은 점들을 정렬한 뒤 스택에 쌓으면서 "왼쪽으로 꺾이지 않는 점"을 빼는 것만으로 O(n log n)에 구할 수 있고, 일직선 점을 남길지 뺄지는 외적 비교의 등호 하나로 갈리며, 모든 점이 일직선인 경우를 따로 챙겨야 한다.

## 이 글에서 다루는 것
- 볼록 껍질의 정의와 O(n³) 완전 탐색
- 앤드루의 모노톤 체인: 아래 껍질과 위 껍질
- 그레이엄 스캔: 각도 정렬과 스택
- 일직선 점을 남기는 변형과 함정
- 정의 그대로의 완전 탐색과 무작위 대조

## 예제 문제: 고무줄로 점 감싸기
평면에 점 n개가 있을 때, 모든 점을 포함하는 가장 작은 볼록 다각형을 **볼록 껍질**(convex hull)이라 한다. 점마다 못을 박고 커다란 고무줄을 놓았을 때 고무줄이 만드는 모양이다. 아래 9개 점이라면 껍질은 네 모서리 (0, 0), (4, 0), (4, 4), (0, 4)이고, (2, 4)는 윗변 위에 놓인 점이다.
```text
y
4  ●  ·  ●  ·  ●
3  ·  ●  ·  ·  ·
2  ·  ·  ●  ·  ·
1  ·  ·  ●  ●  ·
0  ●  ·  ·  ·  ●
   0  1  2  3  4  x
```

## 단순한 방법: 받침 직선 찾기
정의에서 바로 나오는 방법이 있다. 두 점 a, b를 지나는 직선에 대해 **모든 점이 한쪽**(또는 직선 위)에 있으면 이 직선은 점들을 받치는 **받침 직선**이고, 선분 ab는 껍질의 변(의 일부)이다. 한쪽에 있는지는 9편의 외적 부호로 판정한다. 점 쌍이 O(n²)개이고 쌍마다 n개 점을 보므로 O(n³)이다. n = 10⁵이면 10¹⁵번이라 쓸 수 없지만, 아래 대조 검사의 기준으로는 안성맞춤이다.

## 모노톤 체인
1979년 앤드루(A. M. Andrew)가 발표한 **모노톤 체인**은 점을 x(같으면 y) 순으로 정렬한 뒤, 왼쪽에서 오른쪽으로 훑으며 **아래 껍질**을, 오른쪽에서 왼쪽으로 훑으며 **위 껍질**을 만든다. 훑는 동안 스택을 유지하는데, 새 점 p를 넣기 전에 스택 맨 위 두 점 a, b와 p가 왼쪽으로 꺾지 않으면(`cross(a, b, p) ≤ 0`) b를 뺀다. b가 선분 ap의 위쪽이나 그 선 위에 있어 아래 껍질의 꼭짓점이 될 수 없기 때문이다.
```text
     b            a→b→p가
    ╱ ╲           오른쪽으로 꺾임
   a   ╲          → b를 뺀다
        p
```
불변식은 "스택은 지금까지 본 점들의 아래 껍질이고 항상 왼쪽으로만 꺾인다"이다. 새 점은 지금까지 본 점 중 가장 오른쪽이므로 반드시 껍질에 들어가고, 이 점 때문에 오목해진 꼭짓점만 빠진다. 각 점은 한 번 들어가고 많아야 한 번 빠지므로 정렬 뒤의 훑기는 분할 상환 O(n)이다.
```python
def cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def monotone_chain(points, keep_collinear=False):
    pts = sorted(set(points))         # x, 같으면 y 순
    if len(pts) <= 2:
        return pts
    def half(seq):                    # 왼쪽으로 꺾이지 않는 점은 뺀다
        st = []
        for p in seq:
            while len(st) >= 2:
                c = cross(st[-2], st[-1], p)
                if c > 0 or (keep_collinear and c == 0):
                    break
                st.pop()
            st.append(p)
        return st
    lower = half(pts)
    if len(lower) == len(pts):        # 모든 점이 아래 껍질 위(일직선 등)
        return lower                  # 위 껍질로 되돌아오지 않는다
    upper = half(reversed(pts))
    return lower[:-1] + upper[:-1]    # 양 끝점이 두 번 들어가지 않게

pts = [(0, 0), (2, 1), (4, 0), (4, 4), (2, 2), (0, 4), (1, 3), (2, 4), (3, 1)]
print(monotone_chain(pts))
print(monotone_chain(pts, keep_collinear=True))
line = [(0, 0), (1, 1), (2, 2), (3, 3)]
print(monotone_chain(line), monotone_chain(line, keep_collinear=True))
```
```text
[(0, 0), (4, 0), (4, 4), (0, 4)]
[(0, 0), (4, 0), (4, 4), (2, 4), (0, 4)]
[(0, 0), (3, 3)] [(0, 0), (1, 1), (2, 2), (3, 3)]
```
결과는 반시계 방향 순서다. 기본은 일직선 점을 빼서 꼭짓점만 남기고, `keep_collinear=True`면 같은 직선 위로 이어지는 경우(`c == 0`)는 빼지 않아 변 위의 점 (2, 4)까지 남긴다. 함정은 **모든 점이 일직선**일 때다. 일직선 점을 남기면 아래 껍질과 위 껍질이 같은 점들을 반대 방향으로 담아 (0, 0), (1, 1), (2, 2), (3, 3), (2, 2), (1, 1)처럼 갔다가 되돌아온다. 그래서 아래 껍질이 모든 점을 담았으면 그대로 돌려준다.

## 그레이엄 스캔
1972년 그레이엄(Ronald Graham)이 발표한 **그레이엄 스캔**은 가장 아래(같으면 가장 왼쪽) 점 o를 기준으로 나머지 점을 **각도순**으로 정렬한 뒤, 같은 스택 훑기를 한 바퀴 돈다. o가 가장 아래 점이라 다른 점은 모두 o의 위쪽 반평면(각도 0 이상 π 미만)에 있으므로, 각도를 `atan2`로 구할 필요 없이 `cross(o, a, b) > 0`이면 a가 먼저라고 비교하면 된다. 같은 각도면 가까운 점을 먼저 둔다. 모노톤 체인은 이 각도 정렬을 좌표 정렬로 바꾼 변형이라 할 수 있고, 각도 비교 함수가 필요 없어 구현이 더 단순하다. 앞 코드에 이어서 쓴다.
```python
from functools import cmp_to_key

def graham(points):
    pts = list(set(points))
    if len(pts) <= 2:
        return sorted(pts)
    o = min(pts, key=lambda p: (p[1], p[0]))       # 가장 아래, 같으면 왼쪽
    dist = lambda p: (p[0] - o[0]) ** 2 + (p[1] - o[1]) ** 2
    def by_angle(a, b):               # 외적으로 각도 비교, 같으면 가까운 쪽
        c = cross(o, a, b)
        return -1 if c > 0 else 1 if c < 0 else dist(a) - dist(b)
    st = [o]
    for p in sorted((p for p in pts if p != o), key=cmp_to_key(by_angle)):
        while len(st) >= 2 and cross(st[-2], st[-1], p) <= 0:
            st.pop()
        st.append(p)
    return st

print(graham(pts))
```
```text
[(0, 0), (4, 0), (4, 4), (0, 4)]
```

## 무작위 대조 검사
앞 코드에 이어서, 받침 직선 완전 탐색과 비교한다. 받침 직선 위에 놓인 점은 모두 **경계 점**이고, 그 직선 위의 점 중 양 끝 두 점이 **꼭짓점**이다. 두 구현의 꼭짓점 집합이 정의와 같은지, 결과가 반시계 방향으로 왼쪽으로만 꺾이는지, 일직선 점을 남긴 버전이 경계 점을 중복 없이 모두 담는지 확인한다. 좌표를 0~5로 좁혀 일직선과 중복 점이 자주 나오게 했다.
```python
import random
from itertools import combinations

def on_seg(p, a, b):
    return (cross(a, b, p) == 0 and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))

def brute(points):                    # 받침 직선마다 그 위의 점을 모은다
    pts = list(set(points))
    if len(pts) <= 2:
        return set(pts), set(pts)
    corner, boundary = set(), set()
    for a, b in combinations(pts, 2):
        side = [cross(a, b, r) for r in pts]
        if min(side) >= 0 or max(side) <= 0:     # 모든 점이 한쪽
            on = [p for p in pts if on_seg(p, a, b)]
            boundary.update(on)
            if len(on) == side.count(0):         # a, b가 직선 위 양 끝
                corner.update((a, b))
    return corner, boundary

def turns_left(h, strict=True):       # 이웃한 세 점이 모두 왼쪽으로 꺾이나
    if len(h) < 3:
        return True
    cs = [cross(h[i - 2], h[i - 1], h[i]) for i in range(len(h))]
    return all(c > 0 or (c == 0 and not strict) for c in cs)

rng, ok, extra = random.Random(10), 0, 0
for _ in range(500):
    pts = [(rng.randint(0, 5), rng.randint(0, 5))
           for _ in range(rng.randint(1, 15))]
    corner, boundary = brute(pts)
    mc, gr = monotone_chain(pts), graham(pts)
    mk = monotone_chain(pts, keep_collinear=True)
    ok += (set(mc) == set(gr) == corner and turns_left(mc) and turns_left(gr)
           and sorted(mk) == sorted(boundary) and turns_left(mk, False))
    extra += len(boundary) > len(corner)
print(f"무작위 500개(변 위의 점이 있는 경우 {extra}개): {ok}개 일치")
```
```text
무작위 500개(변 위의 점이 있는 경우 234개): 500개 일치
```

## 자주 하는 실수와 변형
- 비교의 등호를 섞어 쓴다. 꼭짓점만 원하면 `≤ 0`에서 빼고, 변 위 점까지 원하면 `< 0`에서만 뺀다. 후자는 모든 점이 일직선인 경우를 따로 처리한다.
- 중복 점을 지우지 않으면 외적이 0인 경우가 생겨 같은 점이 두 번 나올 수 있다. `set`으로 먼저 지운다.
- 그레이엄 스캔에서 각도를 `atan2` 실수로 비교해 일직선 점의 순서가 뒤섞인다. 외적 비교를 쓴다.
- 변형 유형: 껍질의 둘레·넓이(11편), 가장 먼 두 점(11편), 점이 하나씩 추가될 때 껍질 유지, 직선 집합의 아래 포락선(동적 계획법 10편).

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 받침 직선 탐색 | O(n³) | 정의 그대로 |
| 모노톤 체인 | O(n log n) | 정렬 + O(n) |
| 그레이엄 스캔 | O(n log n) | 각도 정렬 + O(n) |

- 공간은 스택과 정렬 배열 O(n)이다. 점이 이미 정렬되어 있으면 모노톤 체인은 O(n)이다.
- 비교 기반으로는 O(n log n)보다 빠를 수 없다. 수 x들을 점 (x, x²)로 바꾸면 모두 포물선 위에 있어 껍질의 꼭짓점이 되고, 껍질을 반시계로 읽으면 x가 정렬되어 나오므로 껍질을 구하는 것은 정렬보다 쉬울 수 없다. 껍질 꼭짓점 수 h가 작으면 O(nh)인 선물 포장(자비스 행진) 같은 출력 민감 알고리즘이 유리할 수 있다.

## 어디에 쓰이나
- 미적분 9편 「최적화: 극값과 볼록 함수」: 아래 껍질은 점들을 아래에서 받치는 가장 큰 볼록 함수의 그래프이며, "왼쪽으로만 꺾인다"는 스택 조건이 그 글의 정의(두 점을 이은 선분이 그래프 아래로 내려가지 않음)를 보장한다.
- 동적 계획법 10편 「볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기」: 직선들의 최솟값 포락선을 덱에 유지할 때, 쓸모없어진 직선을 빼는 판정이 이 글의 스택 빼기와 같은 꼴이다.
- 물리 엔진: Box2D(v3)는 점 배열에서 `b2ComputeHull`로 볼록 껍질을 구한 뒤 그것으로 볼록 다각형 충돌 모양을 만든다.
- 11편 「다각형 넓이와 회전하는 캘리퍼스」: 가장 먼 두 점은 껍질 꼭짓점 중에 있으므로, 껍질을 먼저 구하고 캘리퍼스를 돌린다.

## 정리
- 볼록 껍질은 정렬 + 스택으로 O(n log n)에 구하며, 왼쪽으로 꺾이지 않는 점을 빼는 것이 핵심이다.
- 모노톤 체인은 좌표 정렬로 아래·위 껍질을 따로 만들고, 그레이엄 스캔은 가장 아래 점 기준 각도 정렬로 한 바퀴 돈다.
- 일직선 점 처리는 외적 비교의 등호로 정하고, 모든 점이 일직선인 경우를 따로 처리한다.
- 받침 직선 완전 탐색과 무작위 500개에서 꼭짓점·경계 점·방향이 모두 일치했다.

## 더 알아보기
- 이전 글: 9편 「계산 기하 기초: CCW와 선분 교차」
- 다음 글: 11편 「다각형 넓이와 회전하는 캘리퍼스」
- 위키백과(영어) Convex hull algorithms: https://en.wikipedia.org/wiki/Convex_hull_algorithms
