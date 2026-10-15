# [수학·기하 알고리즘 12/12] 게임 이론: 님 게임과 스프라그-그런디 정리

> **한 줄 요약** — 두 사람이 번갈아 같은 규칙으로 두는 게임은 상태마다 필승·필패를 DP로 정할 수 있고, 님에서는 더미 크기의 XOR이 0인지가 곧 승패이며, 스프라그-그런디 정리는 어떤 게임이든 상태를 그런디 수(mex) 하나로 바꿔 여러 게임의 합을 XOR로 계산하게 해 준다.

## 이 글에서 다루는 것
- 필승·필패 상태와 DP
- 님 게임과 XOR 법칙(증명 스케치와 이기는 수 찾기)
- 그런디 수와 mex
- 게임의 합과 스프라그-그런디 정리
- 모든 상태 완전 탐색과의 대조

## 예제 문제: 돌 가져가기
돌이 n개 있고 두 사람이 번갈아 1~3개를 가져간다. 마지막 돌을 가져가는 사람이 이긴다. 둘 다 최선을 다할 때 먼저 두는 사람이 이길까? 이런 게임은 우연이 없고, 정보가 모두 공개되어 있으며, 두 사람이 둘 수 있는 수가 같다(**공평 게임**, impartial game). 그리고 더 둘 수 없는 사람이 진다(**정상 규칙**). 모든 수순을 펼쳐 보면 깊이 n인 게임 트리라 지수 시간이지만, 같은 상태(남은 돌 수)가 수없이 반복되므로 동적 계획법으로 줄일 수 있다.

## 필승·필패 상태 DP
지금 둘 차례인 사람이 최선을 다하면 이기는 상태를 **필승**(W), 무엇을 해도 지는 상태를 **필패**(L)라 하자. 정의는 재귀적이다.
```text
L: 둘 수 없거나, 모든 수가 W로 간다
W: L로 가는 수가 하나라도 있다
```
돌 0개는 둘 수 없으니 L이고, 작은 상태부터 채우면 된다. 이기는 전략은 "상대에게 항상 L 상태를 넘겨주는 것"이다.
```python
def win_table(n, moves):              # win[k]: 돌 k개에서 둘 차례가 이기나
    win = [False] * (n + 1)           # 돌 0개: 둘 수 없으니 진다
    for k in range(1, n + 1):
        win[k] = any(not win[k - m] for m in moves if m <= k)
    return win

w = win_table(16, [1, 2, 3])
print("".join("W" if x else "L" for x in w))
print([k for k in range(17) if not w[k]])
```
```text
LWWWLWWWLWWWLWWWL
[0, 4, 8, 12, 16]
```
4의 배수만 필패다. 4의 배수에서 x개를 가져가면 상대는 `4 − x`개를 가져가 다시 4의 배수를 넘겨줄 수 있기 때문이다. 일반적으로 1~k개를 가져가는 게임은 `n mod (k + 1) = 0`일 때 필패다. 상태 수 × 수의 종류만큼만 계산하면 된다.

## 님과 XOR 법칙
**님**(Nim)은 돌 더미가 여러 개이고, 자기 차례에 더미 하나를 골라 1개 이상 원하는 만큼 가져가는 게임이다. 상태가 더미 크기의 조합이라 DP 표가 금방 커진다. 1901년 부턴(Charles Bouton)은 놀랍도록 간단한 답을 증명했다. **더미 크기를 모두 XOR한 값(님 합)이 0이면 필패, 아니면 필승**이다.
1. 둘 수 없는 상태(모두 0)는 XOR이 0이다.
2. XOR이 0인 상태에서 더미 하나를 바꾸면 그 더미의 비트가 달라지므로 XOR이 0이 될 수 없다.
3. XOR이 `s ≠ 0`이면 s의 최고 비트가 켜진 더미 a가 있다. `a ⊕ s`는 그 비트가 꺼지고 더 높은 비트는 그대로라 a보다 작으므로, a를 `a ⊕ s`로 줄이면 전체 XOR이 0이 된다.

2와 3이 앞 절의 L·W 정의를 그대로 만족하므로(귀납법), XOR 0인 상태가 정확히 필패 상태다. 앞 코드에 이어서, 더미 3개(각 0~7개)의 모든 상태에서 XOR 법칙과 완전 탐색을 비교하고, 법칙이 고른 수를 둔 뒤 상대가 정말 필패인지도 확인한다.
```python
from functools import lru_cache, reduce
from itertools import product
from operator import xor

@lru_cache(maxsize=None)
def wins(state):                      # 완전 탐색: 이기는 수가 하나라도 있나
    for i, a in enumerate(state):
        for take in range(1, a + 1):
            nxt = state[:i] + (a - take,) + state[i + 1:]
            if not wins(tuple(sorted(nxt))):
                return True
    return False

def nim_move(piles):                  # XOR 법칙: 이기는 수 (더미, 개수)
    s = reduce(xor, piles, 0)
    if s == 0:
        return None                   # 필패: 상대에게 XOR 0을 넘길 수 없다
    for i, a in enumerate(piles):
        if a ^ s < a:                 # s의 최고 비트를 가진 더미
            return i, a - (a ^ s)

print(nim_move([3, 4, 5]), nim_move([1, 2, 3]))
ok = total = 0
for piles in product(range(8), repeat=3):
    total += 1
    mv = nim_move(list(piles))
    good = mv is None
    if mv:
        i, t = mv
        nxt = list(piles)
        nxt[i] -= t
        good = not wins(tuple(sorted(nxt)))   # 그 수 뒤에 상대가 필패인가
    ok += (mv is not None) == wins(tuple(sorted(piles))) and good
print(f"더미 3개, 크기 0~7의 모든 상태 {total}개 중 {ok}개 일치")
```
```text
(0, 2) None
더미 3개, 크기 0~7의 모든 상태 512개 중 512개 일치
```
(3, 4, 5)는 XOR이 2라 필승이고, 첫 더미에서 2개를 가져가 (1, 4, 5)를 넘기면 된다. (1, 2, 3)은 XOR이 0이라 무엇을 해도 진다.

## 그런디 수와 mex
님이 특별한 이유는 반드시 끝나는 다른 모든 공평 게임(정상 규칙)이 님으로 바뀌기 때문이다. 집합 S에 없는 가장 작은 0 이상의 정수를 **mex**(minimum excludant)라 하고, 상태 x의 **그런디 수**를 `g(x) = mex{ g(y) : x에서 한 수로 가는 y }`로 정의한다. 둘 수 없는 상태는 `mex{} = 0`이다. 크기 n인 님 더미는 0~n−1로 갈 수 있으므로 g = n이다. 그리고 `g(x) = 0`이면 필패, 아니면 필승이다. g = 0인 상태에서는 g = 0인 곳으로 갈 수 없고, g > 0이면 mex의 정의상 g = 0인 곳으로 가는 수가 있기 때문이다. 그런디 수가 g인 상태는 "크기 g인 님 더미"처럼 행동한다. g보다 작은 모든 값으로 갈 수 있고, 더 큰 값으로 가는 수가 있더라도 상대가 그 수를 되돌려 원래 값으로 맞출 수 있다.

## 게임의 합: 스프라그-그런디 정리
여러 게임을 나란히 놓고, 자기 차례에 그중 하나를 골라 한 수 두는 것을 **게임의 합**이라 한다. 님은 더미 하나짜리 님 여러 개의 합이다. 1935년 스프라그(Roland Sprague)와 1939년 그런디(Patrick Grundy)가 각자 증명한 **스프라그-그런디 정리**에 따르면, 합의 그런디 수는 각 게임 그런디 수의 XOR이다. 그래서 더미마다 그런디 수를 따로 구하고 XOR이 0인지 보면 된다. 수 하나가 더미를 둘로 나누는 게임도 같은 원리로, 나눈 결과의 그런디 수는 두 더미의 XOR이다.

앞 코드에 이어서 두 게임을 본다. 하나는 한 번에 1, 3, 4개를 가져가는 빼기 게임이고, 다른 하나는 더미 하나를 크기가 서로 다른 두 더미로 나누는 게임(더 나눌 수 없으면 진다)이다. 더미 3개(각 0~12)인 모든 상태에서, 상태 전체를 완전 탐색한 승패와 더미별 그런디 수의 XOR을 비교한다.
```python
def mex(s):                           # s에 없는 가장 작은 0 이상 정수
    m = 0
    while m in s:
        m += 1
    return m

def grundy_sub(n, moves):             # 한 더미 빼기 게임의 그런디 수
    g = [0] * (n + 1)
    for k in range(1, n + 1):
        g[k] = mex({g[k - m] for m in moves if m <= k})
    return g

@lru_cache(maxsize=None)
def grundy_split(n):                  # 더미를 크기가 다른 두 더미로 나눈다
    return mex({grundy_split(a) ^ grundy_split(n - a)
                for a in range(1, (n + 1) // 2)})

def game_wins(moves_of):              # 여러 더미 합 게임의 완전 탐색
    @lru_cache(maxsize=None)
    def wins(state):
        for i, a in enumerate(state):
            for parts in moves_of(a):     # 더미 a를 parts(더미 묶음)로 바꾼다
                nxt = state[:i] + parts + state[i + 1:]
                if not wins(tuple(sorted(nxt))):
                    return True
        return False
    return wins

g1 = grundy_sub(30, [1, 3, 4])
g2 = [grundy_split(k) for k in range(31)]
print("빼기 {1,3,4}:", *g1[:16])
print("나누기 게임:", *g2[:16])
sub_wins = game_wins(lambda a: [(a - m,) for m in (1, 3, 4) if m <= a])
split_wins = game_wins(lambda a: [(b, a - b) for b in range(1, (a + 1) // 2)])
ok = total = 0
for piles in product(range(13), repeat=3):
    total += 2
    st = tuple(sorted(piles))
    ok += sub_wins(st) == (g1[piles[0]] ^ g1[piles[1]] ^ g1[piles[2]] != 0)
    ok += split_wins(st) == (g2[piles[0]] ^ g2[piles[1]] ^ g2[piles[2]] != 0)
print(f"더미 3개(크기 0~12) 상태 {total}개 중 {ok}개 일치")
```
```text
빼기 {1,3,4}: 0 1 0 1 2 3 2 0 1 0 1 2 3 2 0 1
나누기 게임: 0 0 0 1 0 2 1 0 2 1 0 2 1 3 2 1
더미 3개(크기 0~12) 상태 4394개 중 4394개 일치
```
빼기 {1, 3, 4}의 그런디 수는 `0, 1, 0, 1, 2, 3, 2`가 주기 7로 반복된다. 이렇게 작은 n까지 표를 만들어 주기를 찾는 것이 큰 n을 다루는 흔한 방법이다(찾은 주기는 더 긴 표로 확인한다). 나누기 게임은 한 수가 더미 둘을 만들므로 mex 안에 XOR이 들어간다.

## 자주 하는 실수와 변형
- 마지막에 두는 사람이 **지는** 규칙(미제르, misère)에서는 법칙이 바뀐다. 님은 모든 더미가 1 이하일 때만 예외로 뒤집히지만, 일반 게임은 따로 분석해야 한다.
- 두 사람의 수가 다른 게임(체스, 바둑처럼 자기 돌만 움직이는 게임)에는 스프라그-그런디 정리를 쓸 수 없다. 공평 게임에만 성립한다.
- mex 집합에 일부 수만 넣거나, 나누기처럼 결과가 여러 게임이면 XOR을 빼먹는다.
- 변형 유형: 계단 님(홀수 칸만 님), 격자 위 말 여러 개 옮기기(말마다 그런디 수), 한 번에 k개 더미까지 건드리는 님(자리마다 1인 더미 수가 모두 k + 1의 배수면 필패).

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 상태 DP | O(상태 수 × 수 종류) | 상태 수가 곱으로 커짐 |
| 님 XOR | O(더미 수) | 이기는 수도 O(더미 수) |
| 그런디 합 | O(N·수 종류) + XOR | 더미별 표 하나 |

- 더미 k개(각 최대 N)의 전체 상태는 `(N + 1)ᵏ`개라 완전 탐색은 k가 늘면 곧 불가능해진다. 그런디 수는 더미 하나의 표(길이 N)만 있으면 되므로 k에 대해 선형이다.
- 공간은 그런디 표 O(N), 님은 O(1)이다.

## 어디에 쓰이나
- 동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」: 필승·필패 표는 그 글의 상태(남은 돌)·전이(가능한 수)·초기값(둘 수 없으면 L)·답 4단계 설계 그대로다.
- 트랜지스터에서 자연어까지 3편 「조합 회로: 덧셈기에서 ALU까지」: 님 합 XOR은 올림을 버린 2진 덧셈, 즉 그 글의 반가산기가 내는 합 비트 `a ⊕ b`를 자리마다 계산한 것이다.
- AI 기초 2편 「강화학습: 보상으로 배우는 머신러닝」: 다음 상태들의 값으로 지금 상태의 값을 정하는 필승·필패 DP는 상태 가치 V(s)의 가장 단순한 경우(결정적 전이, 승패 보상, 할인 없음)이고, 바둑처럼 상태가 너무 많아 표를 못 만들면 신경망 근사가 필요해진다.

## 정리
- 공평 게임의 상태는 "L로 가는 수가 있으면 W, 없으면 L"이라는 정의로 DP를 채워 승패를 정한다.
- 님은 더미 크기의 XOR이 0이면 필패이고, 이기는 수는 최고 비트를 가진 더미를 `a ⊕ s`로 줄이는 것이다.
- 그런디 수 `mex{다음 상태의 그런디 수}`는 모든 공평 게임을 님 더미 하나로 바꾸고, 게임의 합은 그 XOR이다.
- 님 512개 상태, 빼기·나누기 게임의 합 4,394개 상태가 모두 완전 탐색과 일치했다.

## 더 알아보기
- 이전 글: 11편 「다각형 넓이와 회전하는 캘리퍼스」
- 처음 글: 1편 「유클리드 호제법과 확장 유클리드: 모듈러 역원 구하기」
- 위키백과(영어) Nim: https://en.wikipedia.org/wiki/Nim
