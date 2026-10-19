# [레벨 디자인과 콘텐츠 제공 9/16] 절차적 생성 1: 던전과 동굴 만들기

> **한 줄 요약** — 절차적 생성은 맵 대신 규칙과 시드를 설계하는 일이고, BSP는 겹치지 않는 방과 복도를, 셀룰러 오토마타는 동굴을 만들지만, 어느 쪽이든 독립된 검사기로 연결성과 크기 제약을 확인해야 쓸 수 있는 레벨이 된다.

## 이 글에서 다루는 것
- 절차적 생성을 쓰는 이유와 칸마다 무작위로 정하는 방법이 실패하는 이유
- 시드와 결정론: 같은 시드 = 같은 맵, 레벨마다 시드를 파생하는 이유
- 이진 공간 분할(BSP)로 방과 복도 만들기
- 셀룰러 오토마타의 4-5 규칙으로 동굴을 만들고 고립 영역 메우기
- 시드 300개로 연결성과 크기 제약 검사하기

## 왜 절차적 생성인가
1~8편의 레벨은 사람이 설계했다. 품질은 높지만 한 번 깬 레벨은 외워지고 제작 시간은 레벨 수만큼 쌓인다. **절차적 생성**(procedural generation)은 레벨을 저장하지 않고 규칙과 난수로 그때그때 만든다. 판마다 맵이 달라지는 재플레이성, 방 대신 규칙을 다듬는 제작 방식, 맵 대신 시드 정수 하나만 두는 저장 공간을 얻는다. 출발점인 로그(Rogue, 1980)는 UC 산타크루즈 학생이던 마이클 토이와 글렌 위크먼이 만들었고, 던전 구조와 괴물·보물 배치가 판마다 바뀐다. 이 계열을 로그라이크라고 부른다.

가장 순진한 방법은 칸마다 동전을 던져 벽과 바닥을 정하는 것이다. 아래 실험에서 36×12 맵을 이렇게 채우면 바닥이 서로 닿지 않는 조각 19개로 쪼개진다. 쓸 만한 생성기는 **구조를 만드는 규칙**과 **결과를 검사하는 검사기**의 짝이다.

## 시드와 결정론
같은 시드는 같은 맵을 내야 버그를 재현하고 맵을 공유하며, 서버와 클라이언트가 맵 대신 시드만 주고받는다. 함정은 모든 레벨이 난수 스트림 하나를 이어 쓰는 구조다. 2레벨 생성기가 난수를 하나 더 쓰게 고치면 3레벨 이후가 전부 바뀐다. 레벨마다 (월드 시드, 레벨 번호)를 해시해 시드를 파생하면 고친 레벨만 바뀐다.
```python
import hashlib, random

def gen_level(rng, extra=False):          # 레벨 = 난수 4개라고 치자
    if extra:
        rng.random()                      # 생성기 수정: 난수 하나 더
    return [rng.randrange(100) for _ in range(4)]

def shared(seed, extra_at=None):          # 스트림 하나로 차례로
    rng = random.Random(seed)
    return [gen_level(rng, n == extra_at) for n in range(1, 6)]

def sub_seed(seed, n):                    # 레벨마다 해시로 파생
    h = hashlib.sha256(f"{seed}/{n}".encode()).digest()
    return int.from_bytes(h[:8], "big")

def derived(seed, extra_at=None):
    return [gen_level(random.Random(sub_seed(seed, n)), n == extra_at)
            for n in range(1, 6)]

for f in (shared, derived):
    a, b = f(2024), f(2024, extra_at=2)   # 2레벨만 고쳤다
    print(f"{f.__name__}: 재현 {f(2024) == a},",
          "바뀐 레벨", [n for n in range(1, 6) if a[n - 1] != b[n - 1]])
```
```text
shared: 재현 True, 바뀐 레벨 [2, 3, 4, 5]
derived: 재현 True, 바뀐 레벨 [2]
```
파생에 내장 `hash()`를 쓰면 안 된다(문자열 해시는 프로세스마다 무작위화된다). 또 파이썬 문서가 버전 간에 같은 수열을 보장하는 것은 `random()` 메서드뿐이라서, 기기와 버전이 달라도 같은 맵이 나와야 하면 난수 생성기를 직접 구현해 고정한다.

## BSP: 겹치지 않는 방과 복도
**이진 공간 분할**(BSP, binary space partitioning)은 맵 사각형을 긴 쪽 방향의 무작위 위치에서 둘로 자르고, 조각마다 더 못 자를 때까지(한 변 최소 6칸) 반복한다. 자른 기록은 이진 트리다. 잎마다 여백 1칸을 둔 방을 놓고, 재귀에서 돌아오며 형제 구역의 방끼리 ㄱ자 복도로 잇는다. 내부 노드마다 복도가 생기므로 방은 트리 모양으로 모두 이어진다. 설계상 보장이지만 홍수 채우기로 따로 확인한다. 범례는 `#` 벽, `.` 바닥이다.
```python
import random
from collections import deque

W, H, MIN = 36, 13, 6                     # 맵 크기, 구역의 최소 변

def carve(g, x0, y0, x1, y1):             # 사각형을 바닥으로
    for r in range(min(y0, y1), max(y0, y1) + 1):
        for c in range(min(x0, x1), max(x0, x1) + 1):
            g[r][c] = "."

def bsp(rng, x, y, w, h, g):              # 구역 안 방 중심들을 돌려준다
    vert = w >= 2 * MIN and (w >= h or h < 2 * MIN)
    if not vert and h < 2 * MIN:          # 잎: 여백 1칸을 두고 방 하나
        rw, rh = rng.randint(3, w - 2), rng.randint(3, h - 2)
        rx = x + rng.randint(1, w - rw - 1)
        ry = y + rng.randint(1, h - rh - 1)
        carve(g, rx, ry, rx + rw - 1, ry + rh - 1)
        return [(rx + rw // 2, ry + rh // 2)]
    k = rng.randint(MIN, (w if vert else h) - MIN)
    a, b = ((x, y, k, h), (x + k, y, w - k, h)) if vert else \
           ((x, y, w, k), (x, y + k, w, h - k))
    a, b = bsp(rng, *a, g), bsp(rng, *b, g)
    (ax, ay), (bx, by) = rng.choice(a), rng.choice(b)
    carve(g, ax, ay, bx, ay)              # 형제 구역의 방끼리
    carve(g, bx, ay, bx, by)              # ㄱ자 복도로 잇는다
    return a + b

def flood(g, start):                      # 홍수 채우기 = 격자 BFS
    seen, q = {start}, deque([start])
    while q:
        x, y = q.popleft()
        for n in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if g[n[1]][n[0]] == "." and n not in seen:
                seen.add(n); q.append(n)
    return seen

def dungeon(seed):
    g = [["#"] * W for _ in range(H)]
    return g, bsp(random.Random(seed), 0, 0, W, H, g)

print("\n".join("".join(row) for row in dungeon(7)[0]))
conn = 0
for seed in range(300):
    g, cs = dungeon(seed)
    conn += len(flood(g, cs[0])) == sum(row.count(".") for row in g)
print(f"시드 300개 중 모든 바닥이 이어진 맵: {conn}")
```
```text
####################################
########......#########.....###....#
########......####...##.....###....#
#.....##......####.................#
#.............####...####.#.###....#
#.....######.#####.######.#.#####.##
####.#######.#####.######.#.#####.##
####.######...###...#####.#.#####.##
###...#####...###...#####....####.##
###...#####...###...#####....###...#
###................................#
###...#####...###...#####....###...#
####################################
시드 300개 중 모든 바닥이 이어진 맵: 300
```
방이 고르게 퍼지고 겹치지 않는 대신, 연결 구조가 트리라서 막다른 방에서는 왔던 길을 되짚어야 한다. 3편의 분석대로 형제가 아닌 방 사이에 복도를 더 뚫어 루프를 만들면 되돌아가기가 준다. 시작에서 BFS 거리가 가장 먼 방에 목표를 두는 식의, 배치의 의미를 정하는 단계도 따로 필요하다.

## 셀룰러 오토마타: 동굴
동굴은 더 불규칙해야 한다. 순진한 방법의 잡음 맵에서 출발해, 모든 칸을 동시에 "자신을 포함한 3×3 안에 벽이 5개 이상이면 벽, 아니면 바닥"으로 바꾸기를 몇 번 반복한다. "벽은 이웃 8칸 중 4개 이상, 바닥은 5개 이상이 벽이면 벽"이라고도 써서 **4-5 규칙**이라 부른다(벽 칸은 자신이 하나를 보태므로 둘은 같다). 존슨·야나카키스·토겔리우스의 2010년 논문이 이 방식으로 동굴 레벨을 빠르게 만드는 법을 다뤘다. 아래 코드는 홍수 채우기가 유니온 파인드와 같은 영역을 내는지 무작위 격자 300개로 확인한 뒤, 잡음을 4번 다듬고 가장 큰 영역만 남긴다. 그 영역이 내부의 30%보다 작으면 시드를 버린다(기각).
```python
import random
from collections import deque

def noise(rng, w, h, p=0.45):             # 칸마다 동전, 테두리는 벽
    return [[1 if r in (0, h - 1) or c in (0, w - 1) or rng.random() < p
             else 0 for c in range(w)] for r in range(h)]

def step(g):                              # 4-5 규칙, 모든 칸을 동시에
    h, w = len(g), len(g[0])
    return [[int(r in (0, h - 1) or c in (0, w - 1) or
                 sum(g[i][j] for i in (r - 1, r, r + 1)
                     for j in (c - 1, c, c + 1)) >= 5)
             for c in range(w)] for r in range(h)]

def regions(g):                           # 홍수 채우기: 영역별 칸 목록
    seen, out = set(), []
    for r, row in enumerate(g):
        for c, v in enumerate(row):
            if v or (r, c) in seen:
                continue
            seen.add((r, c)); q, cells = deque([(r, c)]), []
            while q:
                y, x = q.popleft(); cells.append((y, x))
                for ny, nx in ((y+1, x), (y-1, x), (y, x+1), (y, x-1)):
                    if not g[ny][nx] and (ny, nx) not in seen:
                        seen.add((ny, nx)); q.append((ny, nx))
            out.append(cells)
    return out

def regions_uf(g):                        # 대조: 유니온 파인드
    par = {(r, c): (r, c) for r, row in enumerate(g)
           for c, v in enumerate(row) if not v}
    def find(a):
        while par[a] != a:
            a = par[a]
        return a
    for r, c in list(par):
        for b in ((r + 1, c), (r, c + 1)):
            if b in par:
                par[find(b)] = find((r, c))
    roots = [find(a) for a in par]
    return sorted(roots.count(x) for x in set(roots))

rng, uf = random.Random(1), 0
for _ in range(300):
    g = noise(rng, rng.randint(5, 30), rng.randint(5, 16))
    uf += sorted(map(len, regions(g))) == regions_uf(g)
print("홍수 채우기 대 유니온 파인드 300개:",
      "모두 일치" if uf == 300 else uf)

W, H = 36, 12

def cave(seed, steps=4, keep=0.3):
    g = noise(random.Random(seed), W, H)
    raw = len(regions(g))
    for _ in range(steps):
        g = step(g)
    rs = sorted(regions(g), key=len)
    if not rs or len(rs[-1]) < keep * (W - 2) * (H - 2):
        return None, raw, len(rs)         # 너무 작으면 버린다
    for cells in rs[:-1]:                 # 가장 큰 영역만 남기고 메운다
        for r, c in cells:
            g[r][c] = 1
    return g, raw, len(rs)

g, raw, after = cave(3)
print("\n".join("".join("#" if v else "." for v in row) for row in g))
print("영역 수: 잡음", raw, "→ 4번 다듬은 뒤", after, "→ 1")

ok = rej = conn = 0
for seed in range(300):
    g, _, _ = cave(seed)
    if g is None:
        rej += 1
        continue
    ok += 1
    conn += len(regions_uf(g)) == 1
print(f"시드 300개: 채택 {ok}, 기각 {rej}, 채택 중 연결 {conn}")
```
```text
홍수 채우기 대 유니온 파인드 300개: 모두 일치
####################################
##############......########...#####
##############.......###.........###
##############...................###
###############..................###
################.................###
#################................###
################...........##....###
############........###....###..####
############.......#####..##########
####################################
####################################
영역 수: 잡음 19 → 4번 다듬은 뒤 2 → 1
시드 300개: 채택 195, 기각 105, 채택 중 연결 195
```
규칙 한 줄로 조각 19개가 2개로 줄고, 메우면 채택한 195개가 모두 하나로 이어진다(검사는 유니온 파인드로). 다만 시드의 35%를 버렸다. 기각은 시간을 쓰고 분포도 바꾼다(작은 동굴이 덜 나온다). 영역 사이에 터널을 뚫는 수리(repair)도 많이 쓴다. 생성기는 **맵의 분포**를 설계하는 일이고, 분포는 시드 수백 개를 돌려 봐야 보인다.

## 실무에서의 의미와 한계
- 검사기는 생성기와 다른 코드로 짠다. "설계상 연결된다"는 생성기도 경계 조건 하나로 깨진다.
- 연결된 맵이 재미있는 맵은 아니다. 동굴에는 2편의 랜드마크도 5편의 페이싱도 없다. 손으로 만든 조각과 섞는 법은 10편, 열쇠·자물쇠 검사는 4편에서 본다.
- 검사는 제약을 지킨다는 것까지만 말해 준다. 맵이 어떻게 느껴지는지는 플레이테스트로 본다.

## 어디에 쓰이나
- 그래프 알고리즘 1편 「BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색」: 홍수 채우기도, 가장 먼 방 찾기도 격자 BFS다.
- 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」: 영역 나누기를 다른 방법으로 다시 계산해 대조했다.
- 게임 자원 관리 8편 「공간 분할 2: 쿼드트리와 BVH」: BSP도 공간을 재귀적으로 나누는 같은 계열의 트리다.

## 정리
- 절차적 생성은 규칙과 시드를 설계하고, 결과는 검사기로 걸러 쓴다.
- 레벨마다 시드를 해시로 파생하면 생성기 하나를 고쳐도 다른 레벨은 그대로다.
- BSP는 겹치지 않는 방을 트리로 잇고, 4-5 규칙은 잡음을 동굴로 다듬는다.
- 고립 영역은 메우거나 시드를 기각하고, 시드 수백 개로 분포 전체를 검사한다.

## 더 알아보기
- 이전 글: 8편 「플레이어 모델과 난이도 조절: 동적 난이도와 실력 평가」
- 다음 글: 10편 「절차적 생성 2: 웨이브 함수 붕괴와 생성 문법」
- 위키백과 "Rogue (video game)": https://en.wikipedia.org/wiki/Rogue_(video_game)
