# [게임 자원 관리 6/14] 에셋 스트리밍: 예산 안에서 우선순위대로 불러오기

> **한 줄 요약** — 오픈 월드는 전부를 메모리에 올릴 수 없으므로, 플레이어 주변 칸에 거리와 시선으로 우선순위를 매겨 메모리 예산이 찰 때까지 급한 순서로 올리고, 내리는 반경을 올리는 반경보다 넓혀(히스테리시스) 경계에서의 반복 로딩을 막으며, 프레임당 불러오기 양에 상한을 두어 스파이크와 늦게 뜨는 물체 사이에서 균형을 잡는다.

## 이 글에서 다루는 것
- 메모리 예산과 거리·시선 기반 우선순위
- 우선순위 큐로 예산 안에서 올릴 목록 고르기
- 히스테리시스: 경계에서 서성일 때 로드·언로드 반복 막기
- 프레임당 불러오기 예산: 스파이크 대 늦게 뜨는 물체
- 이동 시뮬레이션과 무작위 대조 검사

## 문제: 1,600칸 세계, 메모리 400MB
세계를 40×40칸으로 나누고 칸마다 지형·건물·텍스처 묶음이 4~24MB 있다고 하자. 전부 합치면 2만 MB가 넘으니 플레이어 주변만 올린다. 디스크와 압축 해제가 한 프레임에 처리할 수 있는 양도 정해져 있어서, 너무 많이 한꺼번에 읽으면 1편의 스파이크가 되고, 너무 적게 읽으면 코앞의 건물이 늦게 뜨는 **팝인**(pop-in)이 생긴다. 5편의 캐시가 "요청이 온 뒤 무엇을 버릴까"였다면, 스트리밍은 **요청이 오기 전에** 무엇을 미리 올릴지 고르는 문제다.

## 우선순위와 예산
우선순위는 "얼마나 곧 필요할까"의 추정이다. 가까울수록, 바라보는 방향일수록 급하다. 여기서는 거리 d에 시선 보정을 곱한다.
```text
우선순위 = d × (1.25 − 0.25 × cosθ)
  θ = 시선과 칸 방향 사이 각
  정면 → 1.0 d, 옆 → 1.25 d,
  등 뒤 → 1.5 d   (작을수록 급함)
```
반경 4칸 안의 칸을 힙에 넣고 급한 것부터 꺼내 예산이 찰 때까지 담는다. 더 급한 칸이 안 들어가면 거기서 멈춘다. 덜 급한 작은 칸으로 빈틈을 메우지 않는 이유는 "더 급한 것이 빠졌는데 덜 급한 것이 올라와 있는" 상태를 만들지 않기 위해서다. 힙을 만드는 데 O(m), 꺼내는 데 k번 × O(log m)이라 후보를 전부 정렬하는 것보다 싸다.

매 프레임 스트리밍 단계는 다음과 같다.
1. 올릴 목록(want)을 고른다.
2. 올라와 있는 칸 중 **내리는 반경** `r_out` 밖의 것을 내린다.
3. want에서 아직 없는 칸을 급한 순서로 불러온다. 예산이 모자라면 want에 없는 칸을 덜 급한 것부터 내려 자리를 만든다.
4. 이번 프레임 불러오기 양이 `per_frame`MB에 닿으면 멈추고, 읽다 만 칸은 다음 프레임에 이어 읽는다.

```python
import heapq, math, random

rng = random.Random(4)
W = 40                                     # 40×40칸 세계
SIZE = {(x, y): rng.randint(4, 24) for x in range(W) for y in range(W)}  # MB
R_IN = 4.0                                 # 불러오기 반경(칸)

def dist(c, px, py):
    return math.hypot(c[0] + 0.5 - px, c[1] + 0.5 - py)

def priority(c, px, py, fx, fy):           # 작을수록 급하다
    d = dist(c, px, py)
    if d == 0: return 0.0
    facing = ((c[0] + .5 - px) * fx + (c[1] + .5 - py) * fy) / d
    return d * (1.25 - 0.25 * facing)      # 등 뒤는 1.5배 멀게 친다

def select(px, py, fx, fy, budget):        # 예산 안에서 우선순위 순으로
    near = [(priority(c, px, py, fx, fy), c) for c in SIZE
            if dist(c, px, py) <= R_IN]
    heapq.heapify(near)
    want, used = [], 0
    while near:
        _, c = heapq.heappop(near)
        if used + SIZE[c] > budget:
            break                          # 더 급한 것이 안 들어가면 멈춘다
        want.append(c); used += SIZE[c]
    return want

def stream(path, budget, r_out, per_frame):
    res, prog = set(), {}                  # 올라온 칸, 불러오는 중 진행 MB
    loads = unloads = mb = pop = 0
    for px, py, fx, fy in path:
        want = select(px, py, fx, fy, budget)
        wset = set(want)
        for c in [c for c in res if dist(c, px, py) > r_out]:
            res.discard(c); unloads += 1   # 히스테리시스: r_out 밖에서만 내린다
        extra = sorted((c for c in res if c not in wset),
                       key=lambda c: -priority(c, px, py, fx, fy))
        used = sum(SIZE[c] for c in res)
        left = per_frame                   # 이번 프레임 불러오기 예산
        for c in want:
            if c in res: continue
            while used + SIZE[c] > budget and extra:
                x = extra.pop(0); res.discard(x); used -= SIZE[x]; unloads += 1
            if used + SIZE[c] > budget: break
            step = min(left, SIZE[c] - prog.get(c, 0))
            prog[c] = prog.get(c, 0) + step; left -= step; mb += step
            if prog[c] == SIZE[c]:
                res.add(c); used += SIZE[c]; del prog[c]; loads += 1
            if left == 0: break
        assert used <= budget              # 예산을 넘은 적이 없다
        pop += sum(1 for c in SIZE if dist(c, px, py) <= 1.5 and c not in res)
    return loads, unloads, mb, pop, res

def walk(frames=600):                      # 걷다가 한자리에서 서성인다
    path, x = [], 5.0
    for f in range(frames):
        fx = 1.0 if f < 300 or (f // 15) % 2 else -1.0
        x += 0.05 * fx
        path.append((x, 20.0, fx, 0.0))
    return path

path = walk()
print("r_out 프레임당  로드 언로드 MB  늦게뜸")
for r_out, per in ((4.0, 16), (5.5, 16), (5.5, 4)):
    loads, unloads, mb, pop, _ = stream(path, 2000, r_out, per)
    print(f"{r_out:5} {per:4}MB {loads:5} {unloads:5} {mb:5} {pop:4}")
print("예산 400MB:", stream(path, 400, 5.5, 16)[:4])
```
```text
r_out 프레임당  로드 언로드 MB  늦게뜸
  4.0   16MB   295   243  4052   11
  5.5   16MB   155    91  2242   11
  5.5    4MB   104    42  1521   68
예산 400MB: (346, 323, 5254, 11)
```
플레이어는 300프레임 동안 오른쪽으로 걷고, 나머지 300프레임은 15프레임마다 앞뒤로 돌아서며 제자리에서 서성인다. `늦게뜸`은 1.5칸 안에 있는데 아직 안 올라온 칸을 프레임마다 센 합이다.

## 히스테리시스: 경계에서 깜박이지 않게
첫 줄은 올리는 반경과 내리는 반경이 같다(4칸). 반경 경계에 걸친 칸은 플레이어가 반 칸만 물러서도 내려가고, 다시 다가서면 또 올라온다. 서성이는 동안 같은 칸을 몇 번이고 읽어 4,052MB를 읽었다. 내리는 반경을 5.5칸으로 넓히면(둘째 줄) 서성이는 폭보다 여유가 커서 한 번 올라온 칸이 그대로 남는다. 로드는 295번에서 155번으로, 읽은 양은 4,052MB에서 2,242MB로 줄었고 늦게 뜬 칸 수는 그대로다. 온도 조절기가 켜는 온도와 끄는 온도를 다르게 두는 것과 같은 **히스테리시스**(hysteresis)다. 대가는 메모리다. 여유 폭만큼 더 많은 칸이 올라와 있다.

## 프레임당 불러오기 예산
셋째 줄은 프레임당 16MB 대신 4MB만 읽는다. 한 프레임의 입출력과 압축 해제가 4분의 1로 줄어 스파이크 위험이 작아지지만, 플레이어 속도를 따라가지 못해 늦게 뜬 칸이 11에서 68로 늘었다. 이 값은 플레이어 이동 속도와 칸 크기에서 정해진다. 1초에 새로 들어오는 칸의 MB를 초당 처리량이 넘어야 하고, 그보다 크면 클수록 앞쪽 칸을 미리 읽어 둘 여유가 생긴다. 그래서 빠르게 움직일수록 불러오기 반경이나 프레임당 예산을 키워야 한다.

마지막 줄은 예산을 400MB로 조인 경우다. `assert`가 통과했으니 예산은 한 번도 넘지 않았다. 하지만 돌아설 때마다 앞뒤 칸의 우선순위가 뒤바뀌어 서로를 쫓아내므로 로드가 346번으로 늘었다. 거리 반경처럼 우선순위에도 여유 폭을 두어 "새 칸이 기존 칸보다 확실히 급할 때만" 교체하는 것이 처방이다.

## 무작위 대조 검사
앞 코드에 이어서, 작은 무작위 세계(3×3~9×9칸)에서 아무렇게나 돌아다니다가 한자리에 100프레임 멈춰 선다. 그때 (1) 힙으로 고른 want가 전부 정렬해 앞에서부터 담은 정의대로의 목록과 같은지, (2) want가 모두 올라왔는지, (3) 올라온 칸이 모두 `r_out` 안인지, (4) 예산을 넘지 않는지 본다.
```python
def check(rng):
    global SIZE
    n = rng.randint(3, 9)
    SIZE = {(x, y): rng.randint(1, 9) for x in range(n) for y in range(n)}
    budget, per = rng.randint(5, 80), rng.randint(1, 12)
    r_out = R_IN + rng.choice([0, 1.5])
    px, py, path = rng.uniform(0, n), rng.uniform(0, n), []
    for _ in range(rng.randint(1, 40)):    # 마구 돌아다니다가
        px = min(max(px + rng.uniform(-1, 1), 0), n)
        py = min(max(py + rng.uniform(-1, 1), 0), n)
        a = rng.uniform(0, 2 * math.pi)
        path.append((px, py, math.cos(a), math.sin(a)))
    path += [path[-1]] * 100               # 한자리에 멈춰 선다
    end = path[-1]
    ref, used = [], 0                      # 정의: 전부 정렬해 앞에서부터
    for _, c in sorted((priority(c, *end), c) for c in SIZE
                       if dist(c, *end[:2]) <= R_IN):
        if used + SIZE[c] > budget: break
        ref.append(c); used += SIZE[c]
    res = stream(path, budget, r_out, per)[4]
    return (select(*end, budget) == ref and set(ref) <= res
            and all(dist(c, *end[:2]) <= r_out for c in res)
            and sum(SIZE[c] for c in res) <= budget)

rng = random.Random(8)
print("무작위 500개 비교:",
      "모두 일치" if all(check(rng) for _ in range(500)) else "불일치")
```
```text
무작위 500개 비교: 모두 일치
```
`r_out` 밖 칸을 내리는 조건을 늦추거나 자리 만들기(내리기)를 빼면 "불일치"가 나온다.

## 복잡도
| 단계 | 프레임당 시간 | 근거 |
|---|---|---|
| 후보 모으기 | O(m) | 반경 안 칸 m개 |
| 목록 고르기 | O(m + k log m) | heapify + k번 꺼내기 |
| 불러오기 | O(k) | per_frame에서 멈춘다 |

위 코드는 짧게 쓰려고 칸 전체를 훑지만, 실제로는 7편의 격자로 반경 안 칸만 찾는다. 메모리는 예산 B와 여유 폭이 만드는 추가 칸으로 정해진다.

## 어디에 쓰이나
- 언리얼 엔진의 월드 파티션(World Partition): 세계를 격자 칸으로 나누고, 플레이어 같은 스트리밍 소스에서의 거리에 따라 실행 중에 칸을 올리고 내린다. 텍스처는 `r.Streaming.PoolSize`(MB)라는 풀 예산 안에서 스트리밍된다.
- 유니티 밉맵 스트리밍: `QualitySettings.streamingMipmapsMemoryBudget`(MB)을 맞추려고 스트리밍 텍스처가 가능한 한 작은 밉맵 단계를 고른다. 예산 안에서 해상도를 낮추는 같은 문제다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 페이지 폴트는 필요해진 뒤 읽는 요구 페이징이고, 스트리밍은 쓰기 전에 예측해서 읽어 폴트(팝인)를 미리 없앤다.
- 양자화 15편 「CPU 오프로드: GPU 메모리보다 큰 모델 돌리기」: 빠른 메모리 예산 안에 자주 읽는 텐서부터 두는 것도 우선순위대로 예산을 채우는 일이다.

## 정리
- 스트리밍은 요청 전에 무엇을 올릴지 고르는 문제로, 거리와 시선으로 우선순위를 매겨 예산이 찰 때까지 힙에서 급한 순서로 꺼낸다.
- 내리는 반경을 올리는 반경보다 넓히면, 경계에서 서성일 때 읽은 양이 4,052MB에서 2,242MB로 줄었다.
- 프레임당 불러오기 예산은 스파이크와 팝인의 교환이며(16MB: 늦게뜸 11, 4MB: 68), 이동 속도에 맞춰 정한다.
- 예산이 빠듯하면 우선순위에도 여유 폭이 필요하다.

## 더 알아보기
- 이전 글: 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」
- 다음 글: 7편 「공간 분할 1: 균일 격자와 공간 해싱」
