# [게임 자원 관리 11/14] 경로 탐색 아끼기: A*, 계층적 탐색, 플로우 필드

> **한 줄 요약** — 경로 탐색의 비용은 확장한 노드 수이므로, 목표 쪽으로 끌어당기는 허용 가능한 휴리스틱(`A*`)으로 한 번의 탐색을 줄이고, 지도를 묶은 추상 그래프(계층적 탐색)로 긴 탐색을 줄이고, 같은 목표로 가는 유닛 수백 개는 목표에서 한 번 계산한 플로우 필드를 나눠 쓴다.

## 이 글에서 다루는 것
- `A*`와 허용 가능한 휴리스틱: 다익스트라와 확장 노드 수 비교
- 가중 `A*`: 확장을 더 줄이는 대신 잃는 최적성
- 계층적 경로 탐색(`HPA*`)의 개념과 경로 캐시
- 플로우 필드: 유닛 300개가 한 번의 탐색을 나눠 쓰기

## 예제: 진흙과 벽이 있는 격자
120×120 격자에 평지(비용 1), 진흙(비용 3), 벽이 섞여 있고, 유닛이 한 칸에서 다른 칸으로 가야 한다. 그래프 알고리즘 2편의 다익스트라로 풀면 최단 경로는 정확하지만, 시작점에서 비용 순으로 모든 방향을 고르게 넓혀 가므로 목표 반대쪽 칸까지 잔뜩 확장한다. 유닛이 수백 개고 매 초 길을 다시 찾는다면 이 낭비가 CPU 예산을 잡아먹는다.

## `A*`: 목표 쪽으로 기울인 다익스트라
`A*`(하트·닐손·라파엘, 1968)는 힙에서 꺼내는 기준을 "지금까지 비용 g"에서 `f = g + h`로 바꾼다. h(n)은 n에서 목표까지 남은 비용의 어림값이다. h가 실제 남은 비용을 절대 넘지 않으면 **허용 가능**(admissible)하다고 하고, 이때 `A*`가 찾은 경로는 최적이다. 4방향 이동에서 칸 비용이 최소 1이면 맨해튼 거리가 허용 가능한 h다. 아래 `search`는 w로 h의 배율을 정해 w=0이면 다익스트라, w=1이면 `A*`, w>1이면 가중 `A*`가 된다.
```python
import heapq, random
COST = {".": 1, "~": 3}                           # 평지 1, 진흙 3, "#"는 벽

def make_map(n, rng):
    return ["".join(rng.choices(".~#", (70, 15, 15))[0] for _ in range(n))
            for _ in range(n)]

def neighbors(grid, r, c):                        # (칸, 그 칸에 들어가는 비용)
    for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
        if 0 <= nr < len(grid) and 0 <= nc < len(grid) and grid[nr][nc] != "#":
            yield nr, nc, COST[grid[nr][nc]]

def search(grid, s, g, w=0.0):
    """w=0 다익스트라, w=1 A*, w>1 가중 A*. (비용, 확장 노드 수)"""
    def h(p):                                     # 맨해튼 × 최소 칸 비용 1
        return w * (abs(p[0] - g[0]) + abs(p[1] - g[1]))
    best, done, heap = {s: 0}, set(), [(h(s), 0, s)]
    while heap:
        _, neg_d, p = heapq.heappop(heap)         # f가 같으면 g가 큰 쪽 먼저
        if p in done:
            continue
        done.add(p)                               # 확장
        if p == g:
            return -neg_d, len(done)
        for nr, nc, cost in neighbors(grid, *p):
            nd = -neg_d + cost
            if nd < best.get((nr, nc), 1e18):
                best[nr, nc] = nd
                heapq.heappush(heap, (nd + h((nr, nc)), -nd, (nr, nc)))
    return None, len(done)

def free(grid, rng):
    while True:
        p = (rng.randrange(len(grid)), rng.randrange(len(grid)))
        if grid[p[0]][p[1]] != "#":
            return p

rng, ok = random.Random(11), 0
for _ in range(300):
    grid = make_map(rng.randint(2, 15), rng)
    grid[0] = "." + grid[0][1:]                   # 빈칸 하나는 보장
    s, g = free(grid, rng), free(grid, rng)
    ok += search(grid, s, g, 0)[0] == search(grid, s, g, 1)[0]
print(f"무작위 300개 비교: {ok}개 일치")

grid = make_map(120, random.Random(1))
tot = {0: [0, 0], 1: [0, 0], 2: [0, 0]}
for _ in range(50):
    s, g = free(grid, rng), free(grid, rng)
    for w in tot:
        d, ex = search(grid, s, g, w)
        tot[w][0] += d or 0
        tot[w][1] += ex
for w, name in ((0, "다익스트라"), (1, "A*"), (2, "가중(w=2)")):
    print(f"{name}: 확장 {tot[w][1] // 50}, 비용 합 {tot[w][0]}")
```
```text
무작위 300개 비교: 300개 일치
다익스트라: 확장 5300, 비용 합 3921
A*: 확장 606, 비용 합 3921
가중(w=2): 확장 98, 비용 합 4589
```
최적성의 증명 스케치는 이렇다. 목표가 꺼내지는 순간 그 f는 실제 경로 비용이다. 더 싼 경로가 있었다면 그 경로 위의 어떤 노드 n이 아직 힙에 있고, h가 과소평가이므로 `f(n) ≤ 더 싼 경로 비용 < 목표의 f`라서 n이 먼저 꺼내졌어야 한다. 모순이다. 실험(질의 50개 평균)에서 `A*`는 300개 모두 다익스트라와 같은 비용을 냈고, 확장은 9분의 1로 줄었다. h를 2배로 부풀린 가중 `A*`는 확장이 다시 6분의 1로 줄지만 경로 비용이 17% 늘었다. 가중 `A*`의 비용은 최적의 w배를 넘지 않는다는 보장이 있어서, 정확도보다 반응 속도가 중요한 유닛에 쓴다.

## 계층적 탐색: 지도를 묶어서 먼저 대충
맵이 1000×1000이면 `A*`도 수만 칸을 확장한다. 사람은 "서울에서 부산"을 갈 때 골목부터 생각하지 않고 도시와 고속도로부터 정한다. **계층적 경로 탐색**은 이 생각을 그대로 쓴다. 보테아·뮐러·섀퍼의 `HPA*`(2004)는 이렇게 한다.
```text
1) 미리: 맵을 C×C 클러스터로 자르고
   이웃 클러스터 경계의 출입구를 찾는다
2) 미리: 클러스터 안 출입구 사이의
   거리를 작은 탐색으로 계산해 둔다
3) 질의: S, G를 각 클러스터 출입구에
   잇고 추상 그래프(수백 노드)를 탐색
4) 다듬기: 고른 추상 간선을 실제 칸
   경로로 펼친다(필요한 구간만)
```
논문은 고도로 최적화한 `A*`보다 최대 10배 빠르면서 경로 길이가 최적의 1% 안쪽이라고 보고했다. 경로는 출입구를 지나야 하므로 약간 길어질 수 있다. 벽이 바뀌면 그 클러스터의 출입구와 내부 거리만 다시 계산하면 된다.

**경로 캐시**도 같은 맥락이다. 한 부대가 같은 목적지로 가면 같은 질의가 반복되므로 (출발 클러스터, 목표)를 키로 결과를 저장해 두고, 지형이 바뀐 클러스터를 지나는 항목만 지운다. 5편의 캐시 교체 정책이 여기에도 그대로 쓰인다.

## 플로우 필드: 탐색 한 번을 모두가 나눠 쓴다
RTS에서 유닛 300개에게 같은 지점으로 가라고 명령하면 `A*`를 300번 돌리게 된다. 목표가 같다면 거꾸로 생각할 수 있다. 목표에서 다익스트라를 한 번 돌려 모든 칸에 "목표까지 남은 비용"을 적고(통합 필드), 각 칸에 남은 비용이 가장 작아지는 이웃을 가리키는 화살표를 둔다. 이것이 **플로우 필드**(flow field)다. 유닛은 탐색 없이 발밑 화살표만 따라간다. 앞 코드에 이어서 구현하고 확인한다.
```python
def flow_field(grid, g):
    """목표에서 거꾸로 다익스트라: dist[p] = p에서 목표까지 최소 비용."""
    dist, heap = {g: 0}, [(0, g)]
    while heap:
        d, q = heapq.heappop(heap)
        if d > dist[q]:
            continue
        enter = COST[grid[q[0]][q[1]]]            # p → q로 들어가는 비용
        for nr, nc, _ in neighbors(grid, *q):
            if d + enter < dist.get((nr, nc), 1e18):
                dist[nr, nc] = d + enter
                heapq.heappush(heap, (d + enter, (nr, nc)))
    arrow = {p: min(neighbors(grid, *p), key=lambda q: q[2] + dist[q[:2]])[:2]
             for p in dist if p != g}
    return dist, arrow

def follow(grid, arrow, s, g):
    cost, steps = 0, 0
    while s != g:
        s = arrow[s]                              # 화살표만 따라간다
        cost += COST[grid[s[0]][s[1]]]
        steps += 1
    return cost, steps

rng, ok = random.Random(12), 0
for _ in range(300):
    grid = make_map(rng.randint(2, 15), rng)
    grid[0] = "." + grid[0][1:]
    g = free(grid, rng)
    dist, arrow = flow_field(grid, g)
    for s in (free(grid, rng) for _ in range(5)):
        got = follow(grid, arrow, s, g)[0] if s in dist else None
        ok += search(grid, s, g, 1)[0] == got
print(f"무작위 1500개 비교: {ok}개 일치")

grid = make_map(120, random.Random(1))
g = free(grid, rng)
units = [free(grid, rng) for _ in range(300)]
dist, arrow = flow_field(grid, g)
print("유닛 300개, 같은 목표")
print("A* 따로: 확장 합", sum(search(grid, s, g, 1)[1] for s in units))
print("플로우 필드: 칸", len(dist), "한 번")
```
```text
무작위 1500개 비교: 1500개 일치
유닛 300개, 같은 목표
A* 따로: 확장 합 141627
플로우 필드: 칸 12216 한 번
```
화살표를 따라가면 매 걸음 `dist`가 정확히 그 칸에 들어가는 비용만큼 줄어든다. 화살표가 `칸 비용 + dist`를 최소로 하는 이웃을 고르고, 그 최솟값이 바로 현재 칸의 `dist`이기 때문이다(다익스트라가 만든 값의 성질). 그래서 따라간 경로의 비용은 최단 비용과 같다. 유닛 300개가 따로 `A*`를 돌리면 확장이 14만 번을 넘지만, 플로우 필드는 1만 2천 칸을 한 번 계산하면 끝이라 유닛 수와 무관하다. 대신 유닛이 몇 개 안 되고 목표가 제각각이면 맵 전체를 계산하는 플로우 필드가 오히려 손해다. 게임 AI 실무서 『Game AI Pro』에 실린 일라이자 에머슨의 「Crowd Pathfinding and Steering Using Flow Field Tiles」는 큰 맵에서 수백~수천 유닛을 움직이는 방법으로 이를 타일 단위로 나눠 쓴다.

## 자주 하는 실수와 변형
- 과대평가하는 h: 8방향 이동에서 맨해튼 거리는 대각선 비용을 넘겨 잡으므로 허용 가능하지 않다. 대각선 거리(octile)를 쓴다.
- 칸 비용의 최솟값이 1보다 작으면 h에도 그 최솟값을 곱해야 과소평가가 유지된다.
- `A*`가 길어지면 10편처럼 여러 프레임에 나눠 돌리고, 그동안 유닛은 대충 목표 방향으로 움직이게 한다.
- 목표가 여러 개(가장 가까운 자원)라면 모든 목표를 시작점으로 거꾸로 한 번 돌리면 된다.

## 복잡도
| 방법 | 탐색 비용 | 비고 |
|---|---|---|
| 다익스트라 | O((V+E) log V) | 사방으로 확장 |
| `A*` | 최악 같음 | 실험 9분의 1 |
| 가중 `A*` | 더 적음 | 비용 ≤ w × 최적 |
| `HPA*` | 추상 그래프 + 다듬기 | 전처리 필요 |
| 플로우 필드 | 한 번 O((V+E) log V) | 유닛당 걸음만 |

- 플로우 필드의 메모리는 칸마다 거리와 화살표 하나라 O(V)다. 유닛 k명이 같은 목표면 `A*` k번 대신 한 번이다.

## 어디에 쓰이나
- 그래프 알고리즘 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: `A*`는 다익스트라의 힙 키에 h를 더한 것이고 h=0이면 그대로 다익스트라이며, 플로우 필드는 목표에서 한 번 돌린 다익스트라다.
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 칸 비용이 모두 1이면 플로우 필드의 통합 필드는 목표에서 시작한 BFS 한 번이다.
- AI 기초 2편 「강화학습: 보상으로 배우는 머신러닝」: 통합 필드는 "목표까지 남은 비용"이라는 가치 함수이고, 화살표는 가장 좋은 이웃을 고르는 탐욕 정책이다.

## 정리
- 경로 탐색의 비용은 확장 노드 수이고, 허용 가능한 휴리스틱을 쓴 `A*`는 최적성을 지키면서 확장을 크게 줄인다.
- 가중 `A*`는 최적의 w배 이내라는 보장 아래 확장을 더 줄인다.
- 계층적 탐색은 클러스터와 출입구로 만든 작은 그래프에서 먼저 길을 정하고, 경로 캐시는 반복 질의를 없앤다.
- 같은 목표로 가는 유닛이 많으면 목표에서 한 번 계산한 플로우 필드를 모두가 따라가게 한다.

## 더 알아보기
- 이전 글: 10편 「시간 분할: 무거운 일을 여러 프레임에 나누기」
- 다음 글: 12편 「텍스처 아틀라스와 사각형 빈 패킹」
- Botea, Müller, Schaeffer, "Near Optimal Hierarchical Path-Finding" (2004): https://webdocs.cs.ualberta.ca/~mmueller/ps/hpastar.pdf
