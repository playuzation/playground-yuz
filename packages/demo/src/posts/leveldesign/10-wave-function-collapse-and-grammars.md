# [레벨 디자인과 콘텐츠 제공 10/16] 절차적 생성 2: 웨이브 함수 붕괴와 생성 문법

> **한 줄 요약** — 웨이브 함수 붕괴는 칸마다 가능한 타일 집합을 두고 후보가 가장 적은 칸부터 정하며 인접 제약을 전파해 이웃 규칙을 지키는 맵을 만들고, 생성 문법은 "열쇠가 문보다 먼저" 같은 순서를 규칙 자체에 담으며, 둘 다 생성기와 따로 짠 검사기로 위반 0개를 확인해야 한다.

## 이 글에서 다루는 것
- 타일 인접 규칙과, 차례로 놓는 순진한 방법이 막히는 이유
- 웨이브 함수 붕괴(WFC): 후보가 가장 적은 칸 관측, 전파, 모순과 재시작
- 독립 검사기로 위반 0개를 확인하고 모순 발생률 세기
- 생성 문법으로 열쇠와 문의 순서가 보장된 미션 만들기
- 손으로 만든 조각과 절차적 조합 섞기

## 이웃 규칙이 있는 맵
9편의 던전과 동굴은 벽과 바닥 두 가지였다. 실제 타일맵에는 "길은 길과 이어진다", "물과 풀 사이에는 모래" 같은 이웃 규칙이 있다. 여기서는 길 타일 12종(빈칸, 직선 2, 모서리 4, T자 4, 십자 1)을 쓴다. 타일은 북·동·남·서 네 변에 길이 났는지(1/0)로 정의하고, 맞닿은 두 변은 값이 같아야 하며, 맵 밖으로 길이 나가면 안 된다. 막다른 타일은 일부러 뺐다.

순진한 방법은 왼쪽 위부터 차례로, 위·왼쪽 이웃과 맞는 타일을 무작위로 고르는 것이다. 아래 실험에서 300번 중 150번이 막혔고, 막힌 칸은 모두 오른쪽 아래 마지막 칸이었다. 위와 왼쪽 중 한쪽에서만 길이 들어오면 막다른 타일이 없으니 놓을 것이 없다. 앞의 선택이 뒤 칸의 후보를 없앤다는 것을 미리 알아야 한다.

## 웨이브 함수 붕괴
**웨이브 함수 붕괴**(WFC, wave function collapse)는 막심 구민이 2016년 GitHub 저장소로 공개해 널리 퍼진 알고리즘이고, 뿌리는 폴 메럴의 모델 합성(model synthesis, 2007)이다. 저장소에는 예시 그림에서 패턴을 뽑는 겹침 모델과 타일·인접 규칙을 직접 주는 단순 타일 모델이 있는데, 여기서 만드는 것은 뒤쪽이다.
```text
1) 모든 칸 = 가능한 타일 전체
2) 관측: 후보가 가장 적은 칸 하나를
   가중치대로 한 타일로 확정
3) 전파: 이웃 후보 중 짝이 없는 것을
   지우고, 바뀐 칸에서 다시 번진다
4) 후보가 0개인 칸 = 모순 → 재시작
5) 모든 칸이 확정될 때까지 2~4 반복
```
후보 수로 고르는 것은 단순판이고, 원래 구현은 가중치로 계산한 섀넌 엔트로피가 가장 낮은 칸을 관측한다. 어느 쪽이든 선택지가 좁은 칸을 먼저 정해, 좁은 칸이 나중에 막히지 않게 한다. 검사기는 전파 코드를 쓰지 않고 규칙표에서 맞닿은 변을 직접 대조한다. 범례: `.` 빈칸, 나머지는 길 타일.
```python
import random

TILES = {".": "0000", "─": "0101", "│": "1010", "┌": "0110", "┐": "0011",
         "└": "1100", "┘": "1001", "├": "1110", "┤": "1011", "┬": "0111",
         "┴": "1101", "┼": "1111"}         # 변 순서 북 동 남 서, 1 = 길
WEIGHT = {".": 8, "─": 3, "│": 3}          # 나머지 타일은 1
STEP = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # 북 동 남 서 (d ^ 2 = 반대쪽)

def inside(r, c, W, H):
    return 0 <= r < H and 0 <= c < W

def wfc(rng, W, H, tiles):
    cells = [[{t for t in tiles if all(    # 맵 밖으로 난 길은 처음부터 금지
        TILES[t][d] == "0" for d, (dr, dc) in enumerate(STEP)
        if not inside(r + dr, c + dc, W, H))} for c in range(W)]
        for r in range(H)]
    stack = [(r, c) for r in range(H) for c in range(W)]
    while True:
        while stack:                       # 전파: 짝이 없는 후보를 지운다
            r, c = stack.pop()
            for d, (dr, dc) in enumerate(STEP):
                nr, nc = r + dr, c + dc
                if not inside(nr, nc, W, H):
                    continue
                ok = {TILES[t][d] for t in cells[r][c]}
                new = {t for t in cells[nr][nc] if TILES[t][d ^ 2] in ok}
                if not new:
                    return None            # 모순: 후보가 하나도 없다
                if new != cells[nr][nc]:
                    cells[nr][nc] = new
                    stack.append((nr, nc))
        left = [(len(cells[r][c]), rng.random(), r, c) for r in range(H)
                for c in range(W) if len(cells[r][c]) > 1]
        if not left:                       # 모든 칸이 하나로 정해졌다
            return ["".join(min(cells[r][c]) for c in range(W))
                    for r in range(H)]
        _, _, r, c = min(left)             # 후보가 가장 적은 칸을 관측
        opts = sorted(cells[r][c])
        cells[r][c] = {rng.choices(opts, [WEIGHT.get(t, 1) for t in opts])[0]}
        stack.append((r, c))

def greedy(rng, W, H, tiles):              # 비교: 전파 없이 차례로 놓기
    g = []
    for r in range(H):
        row = ""
        for c in range(W):
            n = TILES[g[r - 1][c]][2] if r else "0"
            w = TILES[row[-1]][1] if c else "0"
            opts = [t for t in tiles if TILES[t][0] == n and TILES[t][3] == w
                    and (c < W - 1 or TILES[t][1] == "0")
                    and (r < H - 1 or TILES[t][2] == "0")]
            if not opts:
                return (r, c)              # 놓을 타일이 없는 칸
            row += rng.choices(opts, [WEIGHT.get(t, 1) for t in opts])[0]
        g.append(row)
    return g

def violations(g):                         # 독립 검사: 규칙표와 직접 대조
    H, W, bad = len(g), len(g[0]), 0
    for r in range(H):
        for c in range(W):
            n, e, s, w = TILES[g[r][c]]
            east = TILES[g[r][c + 1]][3] if c + 1 < W else "0"
            south = TILES[g[r + 1][c]][0] if r + 1 < H else "0"
            bad += (e != east) + (s != south)
            bad += (r == 0 and n != "0") + (c == 0 and w != "0")
    return bad

def run(seed, tiles, W=20, H=8):           # 모순이면 같은 rng로 다시
    rng, fails = random.Random(seed), 0
    while (g := wfc(rng, W, H, tiles)) is None:
        fails += 1
    return g, fails

print("\n".join(run(1, list(TILES))[0]))
gs = [greedy(random.Random(s), 20, 8, list(TILES)) for s in range(300)]
stuck = [g for g in gs if isinstance(g, tuple)]
print("차례로 놓기: 300번 중 막힘", len(stuck), "막힌 칸", set(stuck))
for name, ts in (("12종", list(TILES)), ("빈칸 없는 6종", list("─│┌┐└┘"))):
    rs = [run(s, ts) for s in range(300)]
    print(f"WFC {name}: 모순 {sum(f for _, f in rs)},",
          "규칙 위반", sum(violations(g) for g, _ in rs))
```
```text
......┌──┬─┬─┐......
┌─┐...│..│.│.│......
├─┴─┬┬┘..└┐│┌┤......
│...││....│││└┬┬┐...
├───┴┤....└┼┼┬┘││┌┐.
└┐┌──┼┬───┐│└┼┬┘├┴┘.
.││..└┤┌─┐└┘┌┘└─┤...
.└┴───┴┴─┴──┴───┘...
차례로 놓기: 300번 중 막힘 150 막힌 칸 {(7, 19)}
WFC 12종: 모순 0, 규칙 위반 0
WFC 빈칸 없는 6종: 모순 10, 규칙 위반 0
```
차례로 놓으면 절반이 마지막 칸에서 막히지만, WFC는 같은 타일로 300번 모두 모순 없이 끝났다. 한 칸을 정하면 그 영향이 이웃의 후보로 번져서, 나중에 놓을 타일이 없어질 조합이 미리 지워지기 때문이다. 빈칸을 뺀 6종(모든 칸이 닫힌 고리의 일부)에서는 300개를 만드는 동안 모순이 10번 나서 그만큼 다시 했다. 전파는 맞닿은 이웃의 짝만 보는 국소 일관성이라, 떨어진 두 결정이 나중에 부딪치는 것은 미리 못 본다. 그래서 재시작이 필요하고, 모순이 잦으면 마지막 관측만 되돌리는 백트래킹이 낫다. 어느 경우든 독립 검사기가 센 규칙 위반은 0이다. 위키백과의 "Model synthesis" 항목은 배드 노스(Bad North), 타운스케이퍼(Townscaper), 케이브스 오브 쿼드(Caves of Qud)를 이 알고리즘의 변형을 쓴 게임으로 든다.

## 생성 문법: 순서를 규칙에 담기
WFC는 이웃끼리의 규칙만 안다. "열쇠는 그 문보다 먼저"처럼 레벨 전체에 걸친 순서는 이웃 규칙으로 쓰기 어렵다. **생성 문법**(generative grammar)은 기호를 규칙에 따라 다시 써 가며 구조를 키운다. 조리스 도르만스의 2010년 PCG 워크숍 논문은 레벨을 미션(해야 할 일의 순서)과 공간(실제 배치) 두 구조로 나눠 따로 생성하고, 단계마다 알맞은 문법을 쓰자고 제안했다. 아래는 미션 쪽의 작은 문자열 문법이다. 핵심은 열쇠와 문을 **한 규칙에서 함께** 만드는 것이다. 그러면 어떤 유도에서도 문이 열쇠보다 앞에 올 수 없다. 검사기는 문법을 모른 채 앞에서부터 훑는다. 비교로 같은 칸들을 무작위로 섞으면, 열쇠 k쌍이 모두 순서를 지킬 확률은 쌍마다 1/2씩 독립이라 `2⁻ᵏ`이다.
```python
import random
from itertools import count

def chain(rng, ids, depth=0):              # C → 방 C ∣ 열쇠ᵢ C 문ᵢ C ∣ 방
    x = rng.random() if depth < 3 else 1.0
    if x < 0.3:
        return ["방"] + chain(rng, ids, depth + 1)
    if x < 0.8:                            # 열쇠와 문을 한 규칙에서 함께
        i = next(ids)
        return ([f"열쇠{i}"] + chain(rng, ids, depth + 1) + [f"문{i}"]
                + chain(rng, ids, depth + 1))
    return ["방"]

def mission(seed):                         # D → 입구 C 보스 출구
    return ["입구"] + chain(random.Random(seed), count(1)) + ["보스", "출구"]

def ok(m):                                 # 독립 검사: 앞에서부터 훑기
    keys, used = set(), set()
    for t in m:
        if t.startswith("열쇠"):
            keys.add(t[2:])
        elif t.startswith("문"):
            if t[1:] not in keys or t[1:] in used:
                return False
            used.add(t[1:])
    return m[0] == "입구" and m[-2:] == ["보스", "출구"] and used == keys

ms = [mission(s) for s in range(300)]
print(" ".join(ms[3]))
ks = [sum(t.startswith("열쇠") for t in m) for m in ms]
print("문법 300개: 규칙 지킴", sum(map(ok, ms)), "열쇠 수", min(ks), "~", max(ks))
rng, hit = random.Random(0), 0
for m in ms:                               # 순진한 방법: 가운데를 섞기
    mid = m[1:-2]
    for _ in range(100):
        rng.shuffle(mid)
        hit += ok(m[:1] + mid + m[-2:])
expect = sum(0.5 ** k for k in ks) / len(ms)   # 쌍마다 1/2, 서로 독립
print(f"섞기: 규칙 지킴 {hit / 30000:.3f}, 공식 {expect:.3f}")
```
```text
입구 방 열쇠1 열쇠2 방 문2 방 문1 열쇠3 방 문3 방 보스 출구
문법 300개: 규칙 지킴 300 열쇠 수 0 ~ 7
섞기: 규칙 지킴 0.422, 공식 0.422
```
문법으로 만든 300개는 모두 검사를 통과했고, 섞은 것은 42%만 통과해 공식과 맞는다. 열쇠가 7쌍이면 섞어서 맞을 확률은 1/128이다. 순서를 "만든 뒤 검사해서 버리기"로 얻으면 대부분을 버리지만, 문법은 처음부터 올바른 것만 만든다. 열쇠2·문2가 열쇠1·문1 안에 들어간 것처럼 중첩도 자연스럽게 나온다. 다만 미션을 공간에 옮기면서 지름길이 생기면 열쇠 없이 문 뒤로 갈 수도 있으니, 배치된 레벨은 4편의 상태 공간 탐색으로 다시 검증한다.

## 손으로 만든 조각과 섞기
절차적 생성이 사람의 손을 대체하는 것은 아니다. Game Maker's Toolkit의 영상 「How (and Why) Spelunky Makes its Own Levels」가 정리한 스펠렁키(Spelunky)의 방식은 4×4 방 격자에서 위에서 아래로 내려가는 길을 먼저 정하고, 각 방에는 역할(통로, 떨어지는 방 등)에 맞는 손으로 만든 템플릿을 넣는 것이다. 큰 구조와 "반드시 깰 수 있음"은 절차가, 방 안의 손맛은 사람이 맡는다. WFC의 타일도, 문법의 규칙도 사람이 만든 재료다.

## 실무에서의 의미와 한계
- 위반 0개는 필요조건일 뿐이다. 길이 어디로도 이어지지 않는 고리처럼 규칙은 지켜도 의미 없는 구조가 나온다. 재미는 플레이테스트로 본다.
- 가중치는 디자이너의 손잡이다. 빈칸 가중치 8이 길의 밀도를 정하듯, 가중치를 바꾸면 결과 분포가 바뀐다.
- 모순률과 생성 시간은 시드 수백 개로 재서 로딩 예산 안에 드는지 확인한다.

## 어디에 쓰이나
- 알고리즘 기법 2편 「완전 탐색과 백트래킹: 모든 경우를 보되 가지를 친다」: 모순 때 처음부터 다시 하는 대신 마지막 관측을 되돌리면 백트래킹 탐색이 된다.
- 정보 이론 1편 「정보량과 엔트로피」: 원래 WFC는 가중치로 계산한 섀넌 엔트로피가 가장 낮은 칸을 관측한다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 문법의 유도 과정은 구문 트리이고, 열쇠와 문은 한 노드의 자식으로 함께 생긴다.
- 4편 「열쇠와 자물쇠: 게이팅과 막힘 없는 진행 구조」: 미션을 공간에 배치한 뒤 우회로나 막힘이 없는지 그 글의 방법으로 검증한다.

## 정리
- WFC는 칸마다 후보 집합을 두고, 후보가 가장 적은 칸을 확정하고, 제약을 전파하며, 모순이면 다시 한다.
- 전파가 없으면 앞의 선택이 뒤를 막고(300번 중 150번), 전파가 있어도 국소 일관성이라 모순이 남을 수 있다.
- 생성 문법은 열쇠와 문을 한 규칙에서 만들어 순서 위반을 원천적으로 없앤다.
- 어떤 생성기든 생성 코드와 독립된 검사기로 시드 수백 개의 위반을 센다.

## 더 알아보기
- 이전 글: 9편 「절차적 생성 1: 던전과 동굴 만들기」
- 다음 글: 11편 「진행 시스템: 경험치 곡선, 해금, 보상 일정」
- 위키백과 "Model synthesis": https://en.wikipedia.org/wiki/Model_synthesis
