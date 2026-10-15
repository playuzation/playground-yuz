# [게임 자원 관리 9/14] 컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기

> **한 줄 요약** — 시야 밖의 물체는 평면 몇 장과의 내적으로 걸러 아예 GPU에 보내지 않고, 보이는 물체도 멀수록 삼각형이 적은 모델로 바꾸되 경계에서 깜박이지 않게 히스테리시스를 두면, 8천만 개였던 삼각형이 예산 40만 개 안으로 들어온다.

## 이 글에서 다루는 것
- 시야 절두체 컬링을 2D 삼각형으로 단순화해 구현하고, 보수적 판정이 물체를 놓치지 않음을 확인하기
- 청크 단위로 먼저 버리는 계층 컬링과 가림 컬링의 개념
- 거리 기반 LOD, 삼각형 예산에 맞추는 LOD 바이어스
- 히스테리시스로 LOD 경계의 깜박임 줄이기

## 예제: 나무 2만 그루의 숲
1000×1000 숲에 나무가 20,000그루 있고 나무 모델 하나가 삼각형 4,000개라면, 전부 그리는 데 8천만 개가 든다. 식생에 줄 수 있는 예산이 프레임당 40만 개라면 200분의 1로 줄여야 한다. 방법은 두 가지다. 카메라에 안 보이는 것은 그리지 않는 **컬링**(culling)과, 멀리 있어 화면에서 몇 픽셀밖에 안 되는 것은 거친 모델로 그리는 **LOD**(level of detail)다. LOD는 클라크가 1976년 논문에서 "멀리서는 십이면체도 구처럼 보인다"는 예로 제안한 생각이다.

## 시야 절두체 컬링: 평면 세 장으로 자르기
카메라가 볼 수 있는 공간은 3D에서 잘린 피라미드, 곧 **시야 절두체**(view frustum)이고 평면 6장으로 둘러싸인다. 위에서 내려다본 2D로 줄이면 카메라 위치를 꼭짓점으로 하는 삼각형(왼쪽 벽, 오른쪽 벽, 먼 평면)이 된다. 각 평면을 안쪽 법선 n과 상수 c로 두면 점 p의 부호 있는 거리는 `n·p + c`이고, 물체를 반지름 r인 원으로 감싸면 "모든 평면에서 거리 ≥ −r"일 때 그린다.
```python
import math, random

def frustum(cx, cy, ang, fov, far):
    """2D 절두체 = 삼각형. 안쪽 법선 n과 c: n·p + c ≥ 0이면 안쪽."""
    fx, fy = math.cos(ang), math.sin(ang)
    l, r = ang + fov / 2, ang - fov / 2
    ns = [(math.sin(l), -math.cos(l)), (-math.sin(r), math.cos(r)), (-fx, -fy)]
    cs = [-(nx * cx + ny * cy) for nx, ny in ns[:2]]
    cs.append(fx * cx + fy * cy + far)
    e = far / math.cos(fov / 2)
    tri = [(cx, cy), (cx + e * math.cos(l), cy + e * math.sin(l)),
           (cx + e * math.cos(r), cy + e * math.sin(r))]
    return list(zip(ns, cs)), tri

def visible(planes, x, y, rad):                   # 보수적 판정: 내적 3번
    return all(nx * x + ny * y + c >= -rad for (nx, ny), c in planes)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def exact(planes, tri, x, y, rad):                # 원과 삼각형이 정말 겹치나
    if all(nx * x + ny * y + c >= 0 for (nx, ny), c in planes):
        return True
    return any(seg_dist(x, y, *tri[i], *tri[(i + 1) % 3]) <= rad
               for i in range(3))

rng, missed, extra, total = random.Random(9), 0, 0, 0
for _ in range(500):
    pl, tri = frustum(rng.uniform(-50, 50), rng.uniform(-50, 50),
                      rng.uniform(0, 2 * math.pi), math.radians(90), 100)
    for _ in range(40):
        x, y = rng.uniform(-200, 200), rng.uniform(-200, 200)
        rad = rng.uniform(1, 20)
        v, e = visible(pl, x, y, rad), exact(pl, tri, x, y, rad)
        missed += e and not v
        extra += v and not e
        total += e
print("무작위 500 장면, 실제 보임", total)
print("놓친 물체", missed, "과잉 통과", extra)
```
```text
무작위 500 장면, 실제 보임 1967
놓친 물체 0 과잉 통과 44
```
판정이 물체를 놓치지 않는 이유는 간단하다. 원이 삼각형과 겹치면 겹친 점 q는 세 평면 모두의 안쪽에 있고, 중심은 q에서 r 이내이므로 각 평면에서 중심의 거리는 −r 이상이다. 반대는 성립하지 않는다. 삼각형 꼭짓점 바깥 모서리 근처의 원은 평면 하나하나와는 걸치지만 삼각형과는 겹치지 않는다. 이런 과잉 통과는 위에서 2% 남짓이고, GPU가 어차피 잘라 내므로 비용만 조금 더 들 뿐 화면은 틀리지 않는다. 컬링은 "확실히 안 보이는 것만 버린다"는 쪽으로 틀려야 한다.

## 청크로 먼저 버리고, LOD로 덜 그리기
나무 2만 그루를 하나씩 판정해도 내적 6만 번이라 싸지만, 더 줄일 수 있다. 8편의 계층처럼 50×50 청크를 감싸는 원을 먼저 판정해, 밖이면 청크째 버리고 완전히 안쪽(모든 평면에서 거리 ≥ r)이면 개별 판정 없이 모두 넣는다. 앞 코드에 이어서, 남은 나무에는 거리별 LOD를 붙이고, 그래도 예산을 넘으면 모든 거리를 k배로 보는 **LOD 바이어스**를 이분 탐색으로 찾는다(삼각형 수는 k가 커질수록 줄어드는 단조 함수다).
```python
TRIS = [4000, 1000, 250, 2]                       # LOD0~2, 3 = 임포스터
EDGE = [40, 120, 300]                             # 넘으면 한 단계 거칠게

def lod_of(d):
    return sum(d > e for e in EDGE)

rng = random.Random(1)
trees = [(rng.uniform(0, 1000), rng.uniform(0, 1000)) for _ in range(20000)]
chunks = {}
for t in trees:
    chunks.setdefault((int(t[0] // 50), int(t[1] // 50)), []).append(t)
cam = (500, 500, math.radians(30))
pl, _ = frustum(*cam, math.radians(90), 500)

tests, seen = 0, []
for (gx, gy), ts in chunks.items():
    cx, cy, cr = gx * 50 + 25, gy * 50 + 25, 25 * math.sqrt(2) + 2
    tests += 1
    if not visible(pl, cx, cy, cr):
        continue                                  # 청크째 버린다
    if all(nx * cx + ny * cy + c >= cr for (nx, ny), c in pl):
        seen += ts                                # 청크가 통째로 안쪽
        continue
    for x, y in ts:
        tests += 1
        if visible(pl, x, y, 2):
            seen.append((x, y))
dist = [math.hypot(x - cam[0], y - cam[1]) for x, y in seen]
print("판정: 나무마다", len(trees), "청크 먼저", tests)
print("삼각형: 컬링 없음", len(trees) * TRIS[0])
print("컬링만", len(seen) * TRIS[0], "보이는 나무", len(seen))

def tris(k):                                      # 거리를 k배로 보고 LOD 선택
    return sum(TRIS[lod_of(d * k)] for d in dist)

print("컬링+LOD", tris(1.0), "임포스터", sum(d > 300 for d in dist))
lo, hi = 1.0, 16.0
for _ in range(40):
    mid = (lo + hi) / 2
    lo, hi = (mid, hi) if tris(mid) > 400_000 else (lo, mid)
lods = [lod_of(d * hi) for d in dist]
print(f"바이어스 {hi:.3f}:", tris(hi))
print("LOD별 개수", [lods.count(k) for k in range(4)])
```
```text
판정: 나무마다 20000 청크 먼저 2547
삼각형: 컬링 없음 80000000
컬링만 17100000 보이는 나무 4275
컬링+LOD 657886 임포스터 2818
바이어스 1.304: 399810
LOD별 개수 [14, 164, 692, 3405]
```
보이는 나무 4,275그루를 모두 최고 모델로 그리면 1,710만 개지만, 3분의 2인 2,818그루는 300보다 멀어 삼각형 두 장짜리 **임포스터**(impostor, 미리 렌더링한 나무 그림을 카메라를 향한 판에 붙인 것)로 충분하다. LOD만으로 66만 개, 바이어스 1.3배로 예산 40만 개 안에 든다. 바이어스는 품질 설정의 "LOD 거리" 슬라이더가 하는 일이기도 하다.

## 가림 컬링: 앞에 가린 것은 버린다
절두체 안이라도 건물 뒤에 있으면 보이지 않는다. **가림 컬링**(occlusion culling)은 이런 물체를 버린다. 정적인 맵이면 공간을 칸으로 나눠 칸마다 보일 수 있는 칸 목록(PVS, potentially visible set)을 미리 계산해 두는 방식이 있고, 유니티의 가림 컬링도 에디터에서 장면을 미리 구워(bake) 둔 Umbra 데이터를 실행 중에 질의한다. 동적인 방식으로는 그린 깊이 버퍼를 점점 작은 해상도로 줄인 피라미드를 만들어, 물체의 경계 상자가 이미 그린 것보다 뒤에 있는지 몇 픽셀만 보고 판정하는 계층적 Z 버퍼(그린·카스·밀러, 1993)가 있다. 어느 쪽이든 원칙은 절두체 컬링과 같다. 확실히 가려진 것만 버린다.

## LOD 경계에서 깜박임 막기
거리 120에 선 나무는 카메라가 조금만 흔들려도 LOD1과 LOD2를 오가며 모양이 튄다(popping). 6편의 에셋 스트리밍에서처럼 **히스테리시스**(hysteresis)를 두면 된다. 거칠게 바꿀 때는 경계보다 5% 더 멀어져야, 세밀하게 되돌릴 때는 5% 더 가까워져야 바꾼다. 나무 3,000그루 사이를 카메라가 300프레임 걷는 동안 LOD 전환 횟수를 센다.
```python
import math, random
EDGE = [40, 120, 300]

def lod_of(d):
    return sum(d > e for e in EDGE)

def step_lod(cur, d, h):                          # 띠를 넘어야 바꾼다
    if cur < 3 and d > EDGE[cur] * (1 + h):
        return cur + 1
    if cur > 0 and d < EDGE[cur - 1] * (1 - h):
        return cur - 1
    return cur

rng = random.Random(3)
trees = [(rng.uniform(0, 600), rng.uniform(0, 600)) for _ in range(3000)]
for h, noise in ((0, 0), (0, 1.0), (0.05, 1.0)):
    jit, cur, switches = random.Random(4), None, 0
    for f in range(300):                          # 0.5씩 동쪽으로 걷기
        cx = 225 + 0.5 * f + jit.gauss(0, noise)  # 흔들림 잡음
        cy = 300 + jit.gauss(0, noise)
        ds = [math.hypot(x - cx, y - cy) for x, y in trees]
        new = [lod_of(d) if cur is None or not h else step_lod(c, d, h)
               for c, d in zip(cur or ds, ds)]
        if cur is not None:
            switches += sum(a != b for a, b in zip(cur, new))
        cur = new
    print(f"잡음 {noise}, 띠 ±{h:.0%}: LOD 전환 {switches}번")
```
```text
잡음 0, 띠 ±0%: LOD 전환 1955번
잡음 1.0, 띠 ±0%: LOD 전환 7653번
잡음 1.0, 띠 ±5%: LOD 전환 1721번
```
잡음이 없으면 꼭 필요한 전환만 일어난다. 흔들림이 생기면 경계 근처 나무들이 오락가락해 전환이 네 배 가까이 늘고, 띠 ±5%를 두면 잡음 없는 경우 수준으로 돌아온다. 띠 폭은 흔들림의 크기보다 넓어야 한다.

## 자주 하는 실수와 변형
- 거리 대신 화면에서 차지하는 크기(물체 크기 ÷ 거리, 시야각 반영)로 LOD를 고르면 큰 바위와 작은 꽃을 같은 기준으로 다룰 수 있다.
- 카메라 절두체 밖의 물체도 그림자를 드리울 수 있다. 그림자 패스는 광원 기준으로 따로 컬링해야 한다.
- 전환 순간을 감추려면 두 LOD를 짧게 겹쳐 그리며 섞는 크로스페이드를 쓴다.
- 판정 원이 물체를 다 감싸지 못하면 화면 가장자리에서 물체가 사라진다. 경계 볼륨은 반드시 넉넉해야 한다.

## 복잡도
| 방법 | 비용 | 근거 |
|---|---|---|
| 물체마다 판정 | O(n·평면 수) | 물체마다 내적 |
| 청크 먼저 | O(청크 + 경계 물체) | 안·밖 청크는 한 번 |
| LOD 선택 | O(보이는 물체) | 거리 비교 몇 번 |
| 바이어스 탐색 | O(보이는 물체·반복) | 이분 탐색 40번 |

- 실험에서 판정은 20,000번에서 2,547번으로, 삼각형은 8천만 개에서 40만 개로 줄었다.
- 공간 비용은 LOD 모델을 단계마다 한 벌씩 더 두는 것이다. 이 글의 LOD 사슬은 삼각형 5,252개로 원본 4,000개의 약 1.3배다.

## 어디에 쓰이나
- 선형대수 2편 「내적과 코사인 유사도」: 평면 판정은 법선과 위치의 내적 부호로 어느 쪽에 있는지 아는 것이고, 내적이 길이 × 길이 × cos θ라는 성질이 그대로 쓰인다.
- 8편 「공간 분할 2: 쿼드트리와 BVH」: 청크 대신 쿼드트리나 BVH 노드를 판정하면 밖인 가지를 통째로 버리는 계층 컬링이 된다.
- 알고리즘 기법 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」: LOD 바이어스는 "바이어스 k에서 예산 안인가"라는 단조 판정에 대한 매개 변수 탐색이다.
- 게임 엔진: 유니티는 카메라마다 절두체 컬링을 하고, 구워 둔 Umbra 데이터로 가림 컬링을 더한다.

## 정리
- 컬링은 확실히 안 보이는 것만 버리는 보수적 판정이어야 하고, 원과 평면의 내적 몇 번으로 충분하다.
- 청크나 트리 노드를 먼저 판정하면 판정 횟수 자체도 줄어든다.
- LOD는 먼 물체를 거친 모델로 바꾸고, 예산을 넘으면 거리 바이어스를 이분 탐색해 맞춘다.
- 히스테리시스 띠는 경계에서 LOD가 오락가락하는 깜박임을 잡음 없는 수준으로 줄인다.

## 더 알아보기
- 이전 글: 8편 「공간 분할 2: 쿼드트리와 BVH」
- 다음 글: 10편 「시간 분할: 무거운 일을 여러 프레임에 나누기」
- 위키백과 "Level of detail (computer graphics)": https://en.wikipedia.org/wiki/Level_of_detail_(computer_graphics)
