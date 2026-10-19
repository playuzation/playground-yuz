# [레벨 디자인과 콘텐츠 제공 4/16] 열쇠와 자물쇠: 게이팅과 막힘 없는 진행 구조

> **한 줄 요약** — 열쇠·스위치·능력으로 길을 여는 게이팅은 진행 순서를 만들지만 쓰면 사라지는 열쇠나 되돌아갈 수 없는 길이 끼면 클리어할 수 없는 상태(막힘)가 생기고, 이는 (방, 주운 아이템, 연 문)의 상태 공간을 앞으로 한 번, 뒤로 한 번 탐색해 가장 짧은 재현 순서까지 빠짐없이 찾을 수 있다.

## 이 글에서 다루는 것
- 열쇠·스위치·능력 게이팅과 메트로배니아의 능력 게이팅
- 소모성 열쇠와 일방통행이 만드는 막힘, 열쇠 개수 세기가 틀리는 이유
- 상태 공간 탐색으로 클리어 가능성과 막힘을 자동 검증하고 무차별 계산과 대조하기
- 순서 강제와 시퀀스 브레이킹

## 문제: 순서를 정하고 싶다
3편의 그래프에서는 이어진 곳이면 어디든 갈 수 있지만, 디자이너는 순서를 원한다. 규칙을 배운 뒤에 보스를 만나고 이야기는 정해진 차례로 펼쳐져야 한다. 길을 조건부로 여는 **게이팅**(gating)이 그 도구다.
- 열쇠: 특정 문을 여는 아이템. 가장 직접적이다.
- 스위치: 다른 곳의 상태를 바꾼다(수위를 낮춰 길을 드러내기, 다리 내리기).
- 능력: 2단 점프처럼 한 번 얻으면 잃지 않는다. 메트로이드와 캐슬바니아에서 이름을 딴 **메트로배니아**(metroidvania) 장르의 중심 장치로, 슈퍼 메트로이드(1994)가 대표 예로 자주 거론된다. 새 능력을 얻으면 이미 본 장애물이 길로 바뀌어, 3편의 되돌아가기가 발견이 된다.

순진한 검증은 직접 한 번 깨 보는 것이다. 그러나 한 번 깼다는 것은 그 순서 하나가 통한다는 뜻일 뿐, 플레이어가 고를 수 있는 다른 순서가 모두 안전하다는 뜻은 아니다.

## 막힘: 되돌릴 수 없는 것이 만든다
**막힘**(softlock)은 게임이 끝나지 않았는데 더는 진행할 방법이 없어 불러오기밖에 할 수 없는 상태다. 대표 원인은 소모성 열쇠다. 젤다의 전설 시리즈 던전의 작은 열쇠처럼 어느 문에나 쓸 수 있지만 쓰면 사라지는 열쇠가 있을 때, 꼭 필요한 문보다 옆방 문을 먼저 열면 열쇠가 모자랄 수 있다. 3편의 일방통행 낙하도 같은 일을 한다.

여기에는 간단한 원리가 있다. 모든 자원이 **단조적**(monotone)이면, 곧 능력은 잃지 않고 연 문은 계속 열려 있고 통로가 모두 양방향이면, 클리어 가능한 레벨에서 막힘은 생길 수 없다. 어느 상태든 처음보다 가진 것이 적지 않고 지나온 길은 되짚을 수 있으니, 처음에 통하던 순서를 다시 밟으면 된다. 막힘에는 되돌릴 수 없는 무언가(쓰면 사라지는 열쇠, 일방통행, 놓치면 끝나는 이벤트)가 필요하다. "열쇠 수 ≥ 열쇠 문 수"를 세는 검사는 틀린다. 안 열어도 되는 문이 있으면 열쇠가 적어도 되고(아래 예제는 열쇠 2개, 열쇠 문 3개인데 클리어할 수 있다), 열쇠가 충분해도 일방통행 뒤에 있으면 소용없다.

## 상태 공간 탐색으로 검증하기
그래프 알고리즘 1편의 상태 공간 탐색처럼 정점을 상태로 바꾼다. 상태는 (방, 주운 아이템, 연 문)이고, 집합은 비트로 담는다. 가진 열쇠 수는 주운 열쇠 수에서 연 문 수를 빼면 나온다. 탐색은 두 번이다.
1. 시작 상태에서 앞으로 BFS를 해 도달 가능한 상태를 모두 모은다.
2. 목표 방에 있는 상태들에서 거꾸로(전이를 뒤집어) BFS를 해 아직 이길 수 있는 상태를 모은다.

도달 가능하지만 이길 수 없는 상태가 막힘이다. 시작 상태가 이길 수 있으면 클리어 가능이고, 앞으로 탐색의 부모를 따라가면 막히는 가장 짧은 순서, 곧 버그 재현 절차가 나온다.
```text
      B
      │k
S ─k─ A ─k─ D ─h─ G
│
C
```
`─k─`는 작은 열쇠 하나를 쓰면 계속 열리는 문, `─h─`는 능력 h가 있어야 지나는 길이다. 열쇠는 S와 A에 하나씩, 능력 h는 C에 있고 B는 보물 방이다.
```python
from collections import deque
import random

def pick(L, room, got):                  # 방에 들어가면 아이템을 줍는다
    return got | sum(1 << i for i, (r, _) in enumerate(L["items"])
                     if r == room)

def moves(L, state):                     # 한 걸음 뒤의 상태들
    room, got, opened = state            # 주운 아이템 비트, 연 문 비트
    have = [t for i, (_, t) in enumerate(L["items"]) if got >> i & 1]
    keys = have.count("k") - bin(opened).count("1")
    for j, (u, v, kind) in enumerate(L["edges"]):
        for a, b in ((u, v), (v, u)):
            op = opened | (kind == "k") << j   # 연 열쇠 문은 계속 열림
            if (a != room or kind == ">" and a == v  # 일방통행은 u→v만
                    or op != opened and keys == 0    # 새 문엔 열쇠 하나
                    or kind in ("h", "H") and "h" not in have
                    and not (kind == "H" and L.get("trick"))):
                continue                 # h 필요(H는 기술로도 통과)
            yield b, pick(L, b, got), op

def analyze(L):                          # 앞으로 한 번, 뒤로 한 번
    start = (L["start"], pick(L, L["start"], 0), 0)
    par, rev, q = {start: None}, {}, deque([start])
    while q:
        s = q.popleft()
        for t in set(moves(L, s)):
            rev.setdefault(t, set()).add(s)
            if t not in par:
                par[t] = s
                q.append(t)
    good = {s for s in par if s[0] == L["goal"]}
    q = deque(good)
    while q:                             # 목표에 닿을 수 있는 상태를 거꾸로
        for p in rev.get(q.popleft(), set()) - good:
            good.add(p)
            q.append(p)
    stuck = [s for s in par if s not in good]   # BFS 순서 = 가까운 순
    path, s = [], stuck[0] if stuck else None
    while s:
        path.append(s[0])
        s = par[s]
    return start in good, len(par), stuck, " → ".join(path[::-1])

L = {"start": "S", "goal": "G",
     "items": [("S", "k"), ("A", "k"), ("C", "h")],
     "edges": [("S", "A", "k"), ("A", "B", "k"), ("A", "D", "k"),
               ("D", "G", "h"), ("S", "C", "")]}
ok, n, stuck, path = analyze(L)
print(f"클리어 가능 {ok}, 상태 {n}개 중 막힘 {len(stuck)}개")
print("막히는 가장 짧은 순서:", path)
L["items"].append(("B", "k"))            # 보물 방에 열쇠 하나 더
ok, n, stuck, path = analyze(L)
print(f"B에 열쇠 추가: 클리어 가능 {ok}, 상태 {n}개 중 막힘 {len(stuck)}개")
```
```text
클리어 가능 True, 상태 23개 중 막힘 7개
막히는 가장 짧은 순서: S → A → B
B에 열쇠 추가: 클리어 가능 True, 상태 33개 중 막힘 0개
```
상태 23개 중 7개가 막힘이고, 가장 짧은 막힘은 두 걸음이다. 입구 문을 열고 A에서 열쇠를 주운 뒤 보물 방 B부터 열면 D로 가는 문을 열 열쇠가 없다. 막다른 길에는 보상을 두라고 했으니(2편), 호기심 많은 플레이어일수록 이 순서를 밟는다. 보물 방에 열쇠를 하나 더 두면 막힘이 0개가 된다. 문마다 맞는 열쇠를 따로 두거나(색깔 열쇠), 꼭 필요한 문을 능력으로 막아도 되고, 어느 쪽이든 같은 탐색으로 0개를 확인한다.

## 무작위 레벨 300개로 대조하기
앞 코드에 이어서, 탐색기의 막힘 목록을 정의 그대로의 계산(도달 가능한 상태마다 따로 탐색해 목표에 닿는지 보기)과 비교한다. 단조적 레벨의 막힘과, 아무렇게나 걷는 플레이어 100명 중 막히는 비율도 센다.
```python
# 앞 코드에 이어서
def reach(L, s):                         # s에서 갈 수 있는 상태 전체
    seen, q = {s}, deque([s])
    while q:
        for t in set(moves(L, q.popleft())) - seen:
            seen.add(t)
            q.append(t)
    return seen

def stuck_brute(L):                      # 정의 그대로: 상태마다 따로 탐색
    start = (L["start"], pick(L, L["start"], 0), 0)
    return {s for s in reach(L, start)
            if all(t[0] != L["goal"] for t in reach(L, s))}

def rand_level(rng):                     # 트리로 잇고 여분 통로 0~2개
    rooms = list("SABCDEF"[:rng.randint(3, 7)]) + ["G"]
    edges = [(*rng.sample([r, rng.choice(rooms[:i])], 2),
              rng.choices(["", "k", "h", ">"], [5, 3, 1, 1])[0])
             for i, r in enumerate(rooms) if i]
    edges += [(*rng.sample(rooms, 2), rng.choice(["", "k"]))
              for _ in range(rng.randint(0, 2))]
    items = [(r, "k") for r in rooms[:-1] if rng.random() < 0.35]
    return {"start": "S", "goal": "G", "edges": edges,
            "items": items + [(rng.choice(rooms[:-1]), "h")]}

def stuck_rate(L, bad, rng, players=100):    # 아무렇게나 걷는 플레이어
    n = 0
    for _ in range(players):
        s = (L["start"], pick(L, L["start"], 0), 0)
        for _ in range(40):
            if s in bad or s[0] == L["goal"]:
                break
            s = rng.choice(list(moves(L, s)))
        n += s in bad
    return n / players

rng, walk = random.Random(5), random.Random(6)
same, clear, mono, rates = 0, 0, [], []
for _ in range(300):
    L = rand_level(rng)
    ok, n, stuck, _ = analyze(L)
    same += set(stuck) == stuck_brute(L)
    clear += ok
    soft = ok and bool(stuck)            # 클리어 가능한데 막힐 수 있다
    if not {k for *_, k in L["edges"]} & {"k", ">"}:
        mono.append(soft)                # 되돌릴 수 없는 것이 없는 레벨
    if soft:
        rates.append(stuck_rate(L, set(stuck), walk))
print("무작위 300개 레벨, 탐색기 = 상태마다 따로:", same == 300)
print(f"클리어 가능 {clear}개, 그중 막힘이 있는 레벨 {len(rates)}개")
print(f"열쇠 문·일방통행 없는 레벨 {len(mono)}개 중 막힘 {sum(mono)}개")
print(f"막힌 플레이어 비율: 최소 {min(rates):.0%},",
      f"중앙값 {sorted(rates)[len(rates) // 2]:.0%}")
```
```text
무작위 300개 레벨, 탐색기 = 상태마다 따로: True
클리어 가능 197개, 그중 막힘이 있는 레벨 40개
열쇠 문·일방통행 없는 레벨 13개 중 막힘 0개
막힌 플레이어 비율: 최소 19%, 중앙값 61%
```
탐색기는 300개 모두 정의대로의 계산과 같았고, 열쇠 문과 일방통행이 없는 레벨에서는 원리대로 막힘이 하나도 없었다. 이 작은 레벨들에서는 무작위 플레이어의 19% 이상이 막혔지만, 큰 게임의 막힘은 더 드물 수 있다. 플레이어의 1%만 막히는 경우라면 테스터 20명이 모두 놓칠 확률은 0.99²⁰ ≈ 82%인데, 플레이어 10만 명 중에는 1,000명쯤이 막힌다. 탐색은 운에 기대지 않는다. 대신 상태 수가 방 수 × 2^(아이템 수 + 문 수)로 늘어나므로, 실무에서는 던전이나 구역 단위로 나누고 방을 3편처럼 추상화해서 돌린다.

## 순서 강제와 시퀀스 브레이킹
숙련된 플레이어가 이동 기술이나 버그로 의도한 순서를 건너뛰는 것을 **시퀀스 브레이킹**(sequence breaking)이라 하고, 슈퍼 메트로이드는 이것으로도 유명하다. 허용하면 숙련에 대한 보상이 되고, 막으려면 기술로도 못 넘는 벽을 세운다. 위험한 것은 "여기 오는 사람은 이미 h를 가졌다"는 가정이 깨질 때다. 아래 레벨은 B에서 구덩이 P로 뛰어내리고(일방통행), P를 빠져나가려면 h가 필요하다. 정상 경로로는 B에 가려면 h가 필요하니 안전하지만, A–B 사이를 기술로 넘을 수 있다면 어떨까. 앞 코드에 이어서, 기술로 넘을 수 있는 길(`H`)을 허용하고 다시 탐색한다.
```python
# 앞 코드에 이어서
L = {"start": "S", "goal": "G", "items": [("C", "h")],
     "edges": [("S", "A", ""), ("S", "C", ""), ("A", "B", "H"),
               ("B", "P", ">"), ("P", "G", "h")]}
for trick in (False, True):              # B로 가는 문을 기술로 넘을 수 있나
    L["trick"] = trick
    ok, n, stuck, path = analyze(L)
    print(f"기술 {'허용' if trick else '없음'}: 막힘 {len(stuck)}개"
          + (f", {path}" if stuck else ""))
L["edges"].append(("P", "S", ">"))       # 구덩이에서 입구로 오르는 사다리
print(f"사다리 추가, 기술 허용: 막힘 {len(analyze(L)[2])}개")
```
```text
기술 없음: 막힘 0개
기술 허용: 막힘 1개, S → A → B → P
사다리 추가, 기술 허용: 막힘 0개
```
기술을 허용하면 h 없이 구덩이에 떨어지는 순서가 나온다. 입구로 오르는 사다리 하나로 막힘이 사라지고, 시퀀스 브레이킹은 안전한 지름길로 남는다.

## 모델이 말해 주지 않는 것
- 논리적으로 갈 수 있어도 플레이어가 길을 모르면 실제로는 막힌다. 발견 가능성은 2편의 시선 유도와 플레이테스트로 본다.
- 상태에 되돌릴 수 없는 것(시간 제한 이벤트, 죽을 수 있는 NPC, 팔 수 있는 아이템, 한 번뿐인 스위치)을 하나라도 빠뜨리면 모델은 틀린 안심을 준다.
- 돌아올 수 없는 지점이 의도라면 막힘이 아니라 연출이다. 그때는 넘기 전에 분명히 알려 준다(3편).

## 어디에 쓰이나
- 그래프 알고리즘 1편 「BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색」: (위치, 열쇠) 상태 BFS를 그대로 쓰되, 소모성 열쇠 때문에 연 문까지 상태에 넣고 거꾸로 탐색을 더했다.
- 알고리즘 기법 11편 「비트마스킹: 정수 하나로 집합 다루기」: 주운 아이템과 연 문의 집합을 정수 비트로 담는다.
- 10편 「절차적 생성 2: 웨이브 함수 붕괴와 생성 문법」: 열쇠와 자물쇠 구조를 자동으로 만들 때, 만든 결과를 이 탐색기로 검증한다.

## 정리
- 게이팅은 열쇠·스위치·능력으로 순서를 만들고, 메트로배니아는 능력 게이팅으로 되돌아가기를 발견으로 바꾼다.
- 자원이 모두 단조적이면 막힘은 생길 수 없다. 막힘은 소모성 열쇠, 일방통행처럼 되돌릴 수 없는 것에서 나온다.
- (방, 주운 아이템, 연 문)의 상태 공간을 앞뒤로 한 번씩 탐색하면 막힘 전체와 가장 짧은 재현 순서가 나오고, 무작위 300개 레벨에서 정의대로의 계산과 일치했다.
- 시퀀스 브레이킹은 "이미 가졌을 것"이라는 가정을 깬다. 기술 간선을 넣고 다시 검사한다.

## 더 알아보기
- 이전 글: 3편 「레벨을 그래프로 보기: 임계 경로, 루프, 되돌아가기」
- 다음 글: 5편 「페이싱과 난이도 곡선: 긴장과 이완의 리듬」
