# [게임 자원 관리 8/14] 공간 분할 2: 쿼드트리와 BVH

> **한 줄 요약** — 물체가 한곳에 몰리면 균일 격자는 어떤 셀 크기를 골라도 어딘가에서 손해를 보므로, 붐비는 곳만 잘게 쪼개는 쿼드트리와 물체를 상자로 묶어 올리는 BVH로 "볼 필요 없는 곳"을 가지째 건너뛴다.

## 이 글에서 다루는 것
- 몰린 분포에서 균일 격자가 겪는 셀 크기 딜레마
- 쿼드트리: 넘친 칸만 넷으로 쪼개기와 범위 질의
- BVH: 물체를 묶는 경계 상자 계층과 레이 질의
- 격자·쿼드트리·전수 검사의 비용 비교 실험

## 격자가 약한 곳: 한곳에 몰린 물체
7편의 균일 격자는 셀 크기 하나로 맵 전체를 자른다. 1000×1000 맵의 물체 5,000개 중 90%가 50×50 마을 하나에 몰려 있다고 하자. 셀을 25로 잡으면 마을 칸 하나에 물체가 천 개 넘게 들어가고, 마을에 맞춰 4로 잡으면 들판을 훑는 큰 질의가 빈 칸 수천 개를 들여다본다. 붐비는 곳은 잘게, 한산한 곳은 크게 나누면 되고, 그 대표가 공간을 나누는 쿼드트리와 물체를 묶는 BVH다.

## 쿼드트리: 넘친 칸만 넷으로
**쿼드트리**(quadtree)는 정사각형 노드가 물체를 CAP개까지 담다가 넘치면 네 자식 정사각형으로 쪼개는 트리다. 핀켈과 벤틀리가 1974년 논문에서 이름을 붙였다. 질의 범위와 겹치지 않는 노드는 그 아래 전체를 한 번에 버린다.
```python
import random

def make_points(n, seed, clustered):
    rng, pts = random.Random(seed), []
    for _ in range(n):
        if clustered and rng.random() < 0.9:      # 90%는 50×50 마을 안
            pts.append((rng.uniform(100, 150), rng.uniform(100, 150)))
        else:
            pts.append((rng.uniform(0, 1000), rng.uniform(0, 1000)))
    return pts

class QuadTree:
    CAP, MAX_DEPTH = 8, 16

    def __init__(self, x, y, size, depth=0):
        self.x, self.y, self.size, self.depth = x, y, size, depth
        self.items, self.kids = [], None

    def child(self, p):
        h = self.size / 2
        return self.kids[(p[0] >= self.x + h) + 2 * (p[1] >= self.y + h)]

    def insert(self, p):
        if self.kids:
            return self.child(p).insert(p)
        self.items.append(p)
        if len(self.items) > self.CAP and self.depth < self.MAX_DEPTH:
            h, d = self.size / 2, self.depth + 1
            self.kids = [QuadTree(self.x + dx * h, self.y + dy * h, h, d)
                         for dy in (0, 1) for dx in (0, 1)]
            for q in self.items:                  # 넘친 칸만 넷으로 쪼갠다
                self.child(q).insert(q)
            self.items = []

    def query(self, x0, y0, x1, y1, out, cost):
        if (x1 < self.x or x0 > self.x + self.size or
                y1 < self.y or y0 > self.y + self.size):
            return                                # 겹치지 않으면 가지째 버린다
        cost[0] += 1                              # 방문한 노드
        for p in self.items:
            cost[0] += 1                          # 검사한 점
            if x0 <= p[0] <= x1 and y0 <= p[1] <= y1:
                out.append(p)
        for k in self.kids or ():
            k.query(x0, y0, x1, y1, out, cost)

def brute(pts, x0, y0, x1, y1):
    return [p for p in pts if x0 <= p[0] <= x1 and y0 <= p[1] <= y1]

rng, ok = random.Random(8), 0
for t in range(500):
    pts = make_points(rng.randint(1, 300), t, rng.random() < 0.5)
    tree = QuadTree(0, 0, 1000)
    for p in pts:
        tree.insert(p)
    cx, cy, r = rng.uniform(0, 1000), rng.uniform(0, 1000), rng.uniform(1, 300)
    box, got = (cx - r, cy - r, cx + r, cy + r), []
    tree.query(*box, got, [0])
    ok += sorted(got) == sorted(brute(pts, *box))
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```
불변식은 "모든 점은 자기 좌표를 담는 잎 하나에만 있다"이고, 질의는 범위와 겹치는 잎을 모두 방문하므로 빠뜨리는 점이 없다. `MAX_DEPTH`가 없으면 같은 좌표의 점이 CAP개를 넘을 때 끝없이 쪼갠다.

## 격자와 비교 실험
앞 코드에 이어서, 비용을 "들여다본 칸·노드 수 + 검사한 점 수"로 센다. 질의는 물체 위치를 중심으로 반지름 2(클릭)와 100(폭발)을 200번씩 던진다.
```python
def grid_cost(pts, cell, queries):
    grid = {}
    for p in pts:
        grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)
    cost = 0
    for x0, y0, x1, y1 in queries:
        for gx in range(int(x0 // cell), int(x1 // cell) + 1):
            for gy in range(int(y0 // cell), int(y1 // cell) + 1):
                cost += 1 + len(grid.get((gx, gy), ()))  # 칸 1 + 점 수
    return cost

def tree_cost(pts, queries):
    tree, cost = QuadTree(0, 0, 1000), [0]
    for p in pts:
        tree.insert(p)
    for q in queries:
        tree.query(*q, [], cost)
    return cost[0]

rng = random.Random(1)
print("분포 질의 결과 셀4 셀25 셀100 쿼드")
for clustered in (False, True):
    pts = make_points(5000, 7, clustered)
    for r in (2, 100):
        qs = []
        for _ in range(200):
            cx, cy = rng.choice(pts)
            qs.append((cx - r, cy - r, cx + r, cy + r))
        hits = sum(len(brute(pts, *q)) for q in qs) // len(qs)
        g = [grid_cost(pts, c, qs) // len(qs) for c in (4, 25, 100)]
        print("몰림" if clustered else "고름", "작은" if r == 2 else "큰  ",
              hits, *g, tree_cost(pts, qs) // len(qs))
```
```text
분포 질의 결과 셀4 셀25 셀100 쿼드
고름 작은 1 5 7 56 13
고름 큰   184 2792 311 407 320
몰림 작은 25 99 1167 3891 75
몰림 큰   4147 6748 4232 4202 5712
```
행마다 이기는 셀 크기가 다르다. 셀 4는 고른 맵의 큰 질의에서 2,792로 무너지고, 셀 25는 마을 안 작은 질의에서 1,167로 쿼드트리(75)의 15배다. 쿼드트리는 튜닝 없이 모든 행에서 최선의 3배 안쪽에 든다. 마지막 행은 결과만 4,147개라 누구든 그만큼은 만져야 한다.

## BVH: 공간 대신 물체를 나눈다
쿼드트리는 공간을 자르므로 크기 있는 물체가 경계에 걸치면 곤란하다. **경계 볼륨 계층**(Bounding Volume Hierarchy, BVH)은 거꾸로 물체 집합을 둘로 나누고 각 묶음을 감싸는 축 정렬 상자(AABB)를 노드로 둔다. 물체는 한 잎에만 들어가고 형제 상자끼리는 겹쳐도 된다. 앞 코드에 이어서, 상자 중심을 긴 축으로 정렬해 절반씩 가르는 구성과 총알 같은 레이의 가장 가까운 충돌 찾기를 구현한다. 지금까지 찾은 거리보다 먼 노드는 열지 않는다.
```python
import math

def ray_box(b, ox, oy, dx, dy):                   # 슬랩 검사: 진입 t 또는 None
    t0, t1 = 0.0, math.inf
    for o, d, lo, hi in ((ox, dx, b[0], b[2]), (oy, dy, b[1], b[3])):
        if d == 0:
            if not lo <= o <= hi:
                return None
            continue
        a, c = (lo - o) / d, (hi - o) / d
        t0, t1 = max(t0, min(a, c)), min(t1, max(a, c))
        if t0 > t1:
            return None
    return t0

def build(ids, boxes, nodes):
    bb = [min(boxes[i][0] for i in ids), min(boxes[i][1] for i in ids),
          max(boxes[i][2] for i in ids), max(boxes[i][3] for i in ids)]
    me = len(nodes)
    nodes.append([bb, None, None, ids])
    if len(ids) > 4:                              # 긴 축으로 정렬해 반으로
        ax = 0 if bb[2] - bb[0] >= bb[3] - bb[1] else 1
        ids = sorted(ids, key=lambda i: boxes[i][ax] + boxes[i][ax + 2])
        m = len(ids) // 2
        nodes[me][1:] = [build(ids[:m], boxes, nodes),
                         build(ids[m:], boxes, nodes), None]
    return me

def nearest(nodes, boxes, ray, cost):
    best, who, stack = math.inf, -1, [0]
    while stack:
        bb, left, right, ids = nodes[stack.pop()]
        cost[0] += 1
        t = ray_box(bb, *ray)
        if t is None or t >= best:                # 더 가까운 답이 없는 가지
            continue
        if ids is None:
            stack += [left, right]
            continue
        for i in ids:
            cost[0] += 1
            t = ray_box(boxes[i], *ray)
            if t is not None and t < best:
                best, who = t, i
    return best, who

def make_boxes(n, rng):
    out = []
    for p in make_points(n, rng.random(), True):
        w, h = rng.uniform(0.5, 3), rng.uniform(0.5, 3)
        out.append((p[0], p[1], p[0] + w, p[1] + h))
    return out

def make_ray(rng):
    a = rng.uniform(0, 2 * math.pi)
    return rng.uniform(0, 300), rng.uniform(0, 300), math.cos(a), math.sin(a)

rng, ok = random.Random(8), 0
for _ in range(500):
    boxes, nodes, ray = make_boxes(rng.randint(1, 200), rng), [], make_ray(rng)
    build(list(range(len(boxes))), boxes, nodes)
    ts = [t for b in boxes if (t := ray_box(b, *ray)) is not None]
    ok += nearest(nodes, boxes, ray, [0])[0] == min(ts, default=math.inf)
print(f"무작위 500개 비교: {ok}개 일치")

boxes, nodes, cost = make_boxes(5000, rng), [], [0]
build(list(range(5000)), boxes, nodes)
hit = sum(nearest(nodes, boxes, make_ray(rng), cost)[1] >= 0
          for _ in range(1000))
print("노드", len(nodes), "맞은 레이", hit, "/ 1000")
print("레이당 상자 검사: 전수 5000, BVH", cost[0] // 1000)
```
```text
무작위 500개 비교: 500개 일치
노드 3855 맞은 레이 390 / 1000
레이당 상자 검사: 전수 5000, BVH 72
```
슬랩 검사는 축마다 레이가 상자 두 벽 사이에 있는 t 구간을 구해 교집합을 본다. 노드 상자는 자손을 모두 감싸므로, 노드에 맞지 않으면 자손에도 맞지 않고 노드 진입 t가 최선보다 크면 자손도 그렇다. 이 두 성질이 가지치기를 정당화한다.

## 자주 하는 실수와 변형
- 움직이는 물체: 매 프레임 다시 짓지 말고 상자만 다시 계산(refit)하거나 상자를 넉넉히 키워 둔다. Box2D의 동적 AABB 트리는 키운 상자 덕에 작은 움직임에는 트리를 고치지 않는다.
- 분할 기준: 중앙값 분할 대신 자식 상자의 표면적으로 비용을 어림하는 SAH(surface area heuristic)를 쓰면 레이 질의가 더 빨라지는 트리를 얻는다.
- 3차원에서는 자식이 8개인 옥트리(octree)를 쓴다. 크기 있는 물체를 여러 칸에 등록했다면 결과에서 중복을 지운다.

## 복잡도
| 구조 | 구성 | 질의 |
|---|---|---|
| 전수 검사 | 없음 | O(n) |
| 균일 격자 | O(n) | 칸 수 + 칸 안 물체 수 |
| 쿼드트리 | O(n·깊이) | 대략 O(깊이 + k) |
| BVH(중앙값) | O(n log² n) | 평균 O(log n)급 |

- k는 결과 개수다. 쿼드트리 깊이는 고른 분포에서 O(log n)이지만 몰릴수록 깊어진다. 공간은 모두 O(n)이다(BVH 노드 수 = 잎 수 × 2 − 1).
- BVH는 단계마다 정렬해 O(n log² n)이고, 레이 질의는 최악에 모든 노드를 연다.

## 어디에 쓰이나
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 쿼드트리와 BVH는 루트 있는 트리이고, 두 질의는 겹치지 않는 서브트리를 통째로 건너뛰는 전위 순회다.
- 물리 엔진: Box2D의 넓은 단계(broad phase)는 동적 AABB 트리, 곧 움직이는 물체를 위한 BVH로 겹칠 수 있는 쌍을 고른다.
- 9편 「컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기」: 시야 밖 판정도 노드 상자 하나로 자손 전체를 한 번에 버리는 같은 가지치기다.

## 정리
- 균일 격자는 셀 크기 하나로 버티므로 분포가 몰리면 어느 질의에선가 손해를 본다.
- 쿼드트리는 넘친 칸만 쪼개 붐비는 곳을 깊게, 한산한 곳을 얕게 나누고, 겹치지 않는 가지를 통째로 버린다.
- BVH는 공간 대신 물체를 나누고 감싸는 상자로 가지를 치며, 레이 질의에서는 지금 최선보다 먼 가지도 버린다.
- 실험에서 쿼드트리는 튜닝 없이 모든 경우에 최선 가까이 들었고, BVH는 레이당 검사를 5,000번에서 72번으로 줄였다.

## 더 알아보기
- 이전 글: 7편 「공간 분할 1: 균일 격자와 공간 해싱」
- 다음 글: 9편 「컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기」
- Finkel, Bentley, "Quad Trees: A Data Structure for Retrieval on Composite Keys" (1974): https://doi.org/10.1007/BF00288933
