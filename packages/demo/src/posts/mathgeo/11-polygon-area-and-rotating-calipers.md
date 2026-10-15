# [수학·기하 알고리즘 11/12] 다각형 넓이와 회전하는 캘리퍼스

> **한 줄 요약** — 다각형의 넓이는 이웃한 꼭짓점 쌍의 외적을 더하는 신발끈 공식 한 줄로 정확히 구하고, 격자 다각형이면 픽의 정리로 내부 격자점 수까지 알 수 있으며, 볼록 다각형의 가장 먼 두 점은 평행한 받침선 두 개를 돌리는 회전하는 캘리퍼스로 O(n)에 찾는다.

## 이 글에서 다루는 것
- 신발끈 공식과 부호 있는 넓이
- 단면 길이를 적분하는 대조 방법
- 픽의 정리: 넓이 = 내부 점 + 경계 점/2 − 1
- 회전하는 캘리퍼스로 지름(가장 먼 두 점) 구하기
- 완전 탐색 대조와 계산 횟수 비교

## 예제 문제: 꼭짓점으로 넓이 구하기
측량한 땅의 꼭짓점 좌표가 차례로 (0, 0), (6, 0), (6, 4), (3, 2), (0, 4)라면 넓이는 얼마일까? 6 × 4 직사각형에서 위쪽 삼각형 홈(넓이 6)을 뺀 18이다. 손으로는 도형을 쪼개서 구하지만, 꼭짓점이 수천 개인 오목한 다각형이면 어떻게 쪼갤지부터 문제가 된다.

## 신발끈 공식
원점 O와 이웃한 두 꼭짓점 `pᵢ`, `pᵢ₊₁`이 만드는 삼각형의 넓이는 9편의 외적으로 `(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)/2`이고, 부호는 방향을 나타낸다. 다각형 둘레를 한 바퀴 돌며 이 값을 모두 더하면, 다각형 밖에 걸친 부분은 양수와 음수로 한 번씩 더해져 상쇄되고 안쪽만 남는다. 그래서 오목한 다각형에도 그대로 맞다.
```text
2A = Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)
     (i는 0..n−1, pₙ = p₀)
반시계 순서면 양수, 시계면 음수
```
x와 y를 엇갈려 곱하는 모양이 신발끈을 엮는 것 같아 **신발끈 공식**(shoelace formula)이라 부르며, 1769년 마이스터(Meister)가 기록했고 흔히 가우스의 넓이 공식이라고도 한다. 정수 좌표면 2A가 정수라서 오차가 없다. 변마다 x축까지 내린 사다리꼴 넓이 `(xᵢ₊₁ − xᵢ)(yᵢ + yᵢ₊₁)/2`를 부호 있게 더해도 부호만 반대인 같은 값이 나온다.

대조용으로는 넓이의 정의인 적분을 그대로 쓴다. 넓이는 세로 단면 길이를 x로 적분한 값이다. 꼭짓점이 정수 좌표면 이웃한 정수 x 사이의 띠 안에는 꼭짓점이 없어 단면 길이가 x의 1차식이므로, 띠 가운데(x = k + 1/2)에서 잰 길이가 그 띠의 넓이와 정확히 같다. 단면은 변과의 교점을 정렬해 두 개씩 짝지은 구간들의 합이다.
```python
from fractions import Fraction
from math import gcd

def area2(poly):                      # 신발끈: 부호 있는 넓이의 2배
    return sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1]
               for i in range(len(poly)))

def area_by_slices(poly):             # 대조용: 단면 길이를 x로 적분
    xs = [p[0] for p in poly]
    total = Fraction(0)
    for k in range(min(xs), max(xs)):
        x = Fraction(2 * k + 1, 2)    # 띠의 가운데: 단면 길이가 1차식
        ys = sorted(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
                    for a, b in zip(poly, poly[1:] + poly[:1])
                    if min(a[0], b[0]) < x < max(a[0], b[0]))
        total += sum(ys[i + 1] - ys[i] for i in range(0, len(ys), 2))
    return total

land = [(0, 0), (6, 0), (6, 4), (3, 2), (0, 4)]       # 오목한 오각형
print(area2(land) / 2, area2(land[::-1]) / 2, area_by_slices(land))
```
```text
18.0 -18.0 18
```
꼭짓점 순서를 뒤집으면 부호만 바뀐다. 이 부호로 다각형이 반시계인지 시계인지도 판정한다.

## 픽의 정리
꼭짓점이 모두 격자점인 단순 다각형에서, 내부 격자점 수를 I, 경계 위 격자점 수를 B라 하면 `A = I + B/2 − 1`이다. 1899년 픽(Georg Pick)이 발표한 **픽의 정리**다. 앞의 땅은 I = 11, B = 16이라 `11 + 8 − 1 = 18`이다. B는 변마다 `gcd(∣dx∣, ∣dy∣)`개씩이다(끝점 하나만 세는 셈, gcd는 1편). 그래서 넓이와 B를 알면 `I = A − B/2 + 1`로 내부 점 수를 셀 필요 없이 구한다. 앞 코드에 이어서, 무작위 단순 다각형(중심 둘레로 각도순 정렬)에서 신발끈 넓이를 적분과 비교하고, 상자 안 격자점을 하나씩 판정해 센 I, B로 픽의 정리를 확인한다.
```python
import math, random

def star_polygon(rng, k, c=10, size=20):   # 중심 둘레 각도순 = 단순 다각형
    while True:
        pts = {(rng.randint(0, size), rng.randint(0, size)) for _ in range(k)}
        ang = sorted((math.atan2(y - c, x - c), (x, y)) for x, y in pts
                     if (x, y) != (c, c))
        gaps = [b[0] - a[0] for a, b in zip(ang, ang[1:])]
        gaps.append(ang[0][0] + 2 * math.pi - ang[-1][0])
        if len(ang) >= 3 and min(gaps) > 1e-9 and max(gaps) < math.pi:
            return [p for _, p in ang]

def cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def lattice_count(poly):              # 대조용: 상자 안 격자점을 하나씩 판정
    inside = boundary = 0
    for x in range(min(p[0] for p in poly), max(p[0] for p in poly) + 1):
        for y in range(min(p[1] for p in poly), max(p[1] for p in poly) + 1):
            edge, odd = False, False
            for a, b in zip(poly, poly[1:] + poly[:1]):
                if cross(a, b, (x, y)) == 0 and \
                   min(a[0], b[0]) <= x <= max(a[0], b[0]) and \
                   min(a[1], b[1]) <= y <= max(a[1], b[1]):
                    edge = True
                if (a[1] > y) != (b[1] > y) and \
                   cross(a, b, (x, y)) * (b[1] - a[1]) > 0:
                    odd = not odd     # 9편의 반직선 교차
            boundary += edge
            inside += odd and not edge
    return inside, boundary

B = lambda poly: sum(gcd(b[0] - a[0], b[1] - a[1])   # 변 위 격자점 수
                     for a, b in zip(poly, poly[1:] + poly[:1]))
print(lattice_count(land), B(land))
rng, ok1, ok2 = random.Random(11), 0, 0
for _ in range(300):
    poly = star_polygon(rng, rng.randint(3, 10))
    A2 = abs(area2(poly))
    ok1 += Fraction(A2, 2) == area_by_slices(poly)
    I, Bc = lattice_count(poly)
    ok2 += Bc == B(poly) and A2 == 2 * I + Bc - 2      # 픽: A = I + B/2 − 1
print(f"다각형 300개: 넓이 일치 {ok1}개, 픽의 정리 성립 {ok2}개")
```
```text
(11, 16) 16
다각형 300개: 넓이 일치 300개, 픽의 정리 성립 300개
```

## 회전하는 캘리퍼스
이번에는 점 n개 중 **가장 먼 두 점**(점 집합의 지름)을 찾는다. 모든 쌍을 보면 O(n²)이다. 가장 먼 두 점은 반드시 볼록 껍질(10편)의 꼭짓점이므로 껍질부터 구한다. 그다음 관찰은 이렇다. 가장 먼 두 점 p, q에 각각 pq에 수직인 직선을 그으면, 두 직선 사이에 모든 점이 들어간다. 즉 지름은 **평행한 받침선 두 개**가 동시에 닿을 수 있는 꼭짓점 쌍(대척점 쌍) 중에 있다.
```text
  ───────●───────  받침선 1
       ╱   ╲
      ●     ●
       ╲   ╱
  ───────●───────  받침선 2
```
캘리퍼스(버니어 캘리퍼스)의 두 턱으로 껍질을 물고 한 바퀴 돌리는 그림이다. 껍질의 변 ab마다, ab에서 가장 먼 꼭짓점 `h[j]`가 반대편 받침선이 닿는 점이다. 변을 반시계로 하나씩 옮기면 가장 먼 꼭짓점도 반시계로만 움직이므로, j를 투 포인터처럼 앞으로만 옮기면 된다. ab에서의 거리는 삼각형 넓이 `cross(a, b, ·)`로 비교한다. 1978년 섀모스(Michael Shamos)가 박사 논문에서 지름을 구하는 데 처음 썼고, 1983년 투생(Godfried Toussaint)이 **회전하는 캘리퍼스**(rotating calipers)라는 이름을 붙여 여러 문제로 일반화했다. 앞 코드에 이어서 쓴다.
```python
def hull(points):                     # 10편의 모노톤 체인(꼭짓점만)
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    def half(seq):
        st = []
        for p in seq:
            while len(st) >= 2 and cross(st[-2], st[-1], p) <= 0:
                st.pop()
            st.append(p)
        return st[:-1]
    return half(pts) + half(pts[::-1])

d2 = lambda a, b: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

def diameter2(points):                # 가장 먼 거리의 제곱, 비교 횟수
    h = hull(points)
    n, j, best, checks = len(h), 1, 0, 0
    if n <= 2:
        return d2(h[0], h[-1]), 0
    for i in range(n):
        a, b = h[i], h[(i + 1) % n]   # 변 ab에서 가장 먼 꼭짓점 h[j]
        while cross(a, b, h[(j + 1) % n]) > cross(a, b, h[j]):
            j = (j + 1) % n
            checks += 1
        checks += 1
        best = max(best, d2(a, h[j]), d2(b, h[j]))
    return best, checks

pts = [(0, 0), (4, 1), (7, 3), (6, 7), (2, 6), (-1, 3), (3, 3)]
print(hull(pts), diameter2(pts))
rng, ok = random.Random(12), 0
for _ in range(500):
    pts = [(rng.randint(0, 20), rng.randint(0, 20))
           for _ in range(rng.randint(1, 40))]
    ok += diameter2(pts)[0] == max(d2(a, b) for a in pts for b in pts)
print(f"무작위 500개: 완전 탐색과 {ok}개 일치")
circle = {(round(1e7 * math.cos(2 * math.pi * t / 3000)),
           round(1e7 * math.sin(2 * math.pi * t / 3000))) for t in range(3000)}
n = len(circle)
print(f"원 위 {n}점, 껍질 {len(hull(circle))}점: "
      f"쌍 {n * (n - 1) // 2:,}개 vs 비교 {diameter2(circle)[1]:,}번")
```
```text
[(-1, 3), (0, 0), (4, 1), (7, 3), (6, 7), (2, 6)] (85, 14)
무작위 500개: 완전 탐색과 500개 일치
원 위 3000점, 껍질 3000점: 쌍 4,498,500개 vs 비교 7,498번
```
첫 줄의 (3, 3)은 안쪽 점이라 껍질에서 빠지고, 지름의 제곱은 (0, 0)과 (6, 7) 사이의 85다. 점이 모두 껍질 위에 있는 최악의 입력에서도 캘리퍼스는 꼭짓점 수의 몇 배만 비교한다.

## 자주 하는 실수와 변형
- 신발끈 결과의 절댓값을 잊거나, 정수 좌표인데 처음부터 실수로 나눠 오차를 들인다. 2A로 계산하고 마지막에 나눈다.
- 꼭짓점이 둘레 순서가 아니거나 변이 서로 교차하는 다각형에 신발끈 공식을 쓴다. 단순 다각형에서만 넓이다.
- 캘리퍼스를 껍질 없이 원래 점 순서에 돌리거나, 일직선 점이 남은 껍질에서 등호 처리를 잘못한다. 꼭짓점만 남긴 껍질을 쓴다.
- 변형 유형: 볼록 다각형의 폭(가장 좁은 평행선 간격), 최소 넓이 외접 직사각형(한 변이 껍질의 변 위에 놓인다는 성질), 두 볼록 다각형 사이의 최대·최소 거리, 다각형 둘레의 격자점 수.

## 복잡도
| 계산 | 시간 | 근거 |
|---|---|---|
| 신발끈 넓이 | O(n) | 변마다 외적 1번 |
| 지름(완전 탐색) | O(n²) | 모든 쌍 |
| 지름(캘리퍼스) | O(n log n) | 껍질 + O(h) |

- 캘리퍼스 단계는 i가 한 바퀴, j가 많아야 두 바퀴 돌아 O(h)이다(h는 껍질 꼭짓점 수). 전체는 껍질 정렬이 지배한다.
- 공간은 껍질 O(h)다. 대조용 적분은 띠마다 모든 변을 보므로 O(n·폭)이고, 격자점 판정은 O(n·넓이)다.

## 어디에 쓰이나
- 미적분 5편 「적분: 넓이와 누적」: 신발끈 공식은 변마다 사다리꼴 넓이를 부호 있게 더한 것으로, 그 글의 사다리꼴 공식이 직선 변에서는 오차 없이 정확해지는 경우다. 대조에 쓴 띠 나누기도 그 글의 "잘게 잘라 더하기"다.
- 선형대수 7편 「행렬식: 부피가 변하는 비율」: 신발끈의 각 항은 두 꼭짓점을 열로 둔 2×2 행렬식이며, 부호가 방향(반시계·시계)을 알려 준다.
- 게임 자원 관리 8편 「공간 분할 2: 쿼드트리와 BVH」: 캘리퍼스로 구하는 최소 넓이 외접 직사각형은 물체 방향에 맞춰 돌린 경계 상자로, 넓이가 축에 맞춘 상자보다 크지 않다.

## 정리
- 신발끈 공식 `2A = Σ (xᵢyᵢ₊₁ − xᵢ₊₁yᵢ)`는 오목한 단순 다각형에도 맞고, 부호로 방향을 알려 준다.
- 픽의 정리 `A = I + B/2 − 1`과 변마다 gcd로 센 B를 쓰면 내부 격자점 수를 바로 구한다.
- 가장 먼 두 점은 껍질 위 대척점 쌍 중에 있고, 회전하는 캘리퍼스는 투 포인터로 O(h)에 모두 훑는다.
- 적분 대조 300개, 격자점 대조 300개, 지름 완전 탐색 대조 500개가 모두 일치했다.

## 더 알아보기
- 이전 글: 10편 「볼록 껍질: 모노톤 체인과 그레이엄 스캔」
- 다음 글: 12편 「게임 이론: 님 게임과 스프라그-그런디 정리」
- 위키백과(영어) Rotating calipers: https://en.wikipedia.org/wiki/Rotating_calipers
