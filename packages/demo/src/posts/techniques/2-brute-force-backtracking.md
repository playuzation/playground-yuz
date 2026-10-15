# [알고리즘 기법 2/14] 완전 탐색과 백트래킹: 모든 경우를 보되 가지를 친다

> **한 줄 요약** — 완전 탐색은 가능한 모든 경우를 재귀로 하나씩 만들어 보는 가장 확실한 방법이고, 백트래킹은 같은 "고르고, 들어가고, 되돌리는" 틀에서 답이 될 수 없는 가지를 일찍 잘라 탐색 노드 수를 수십~수천 배 줄인다.

## 이 글에서 다루는 것
- 순열·조합·부분집합을 재귀로 열거하는 틀
- N-Queen에서 가지치기로 줄어드는 노드 수 세기
- 부분집합 합의 가지치기와, 가정이 깨지면 틀리는 가지치기
- 파이썬의 재귀 깊이 한도

## 모든 경우를 만드는 틀
1편의 표에서 N이 10~25 정도로 작으면 모든 경우를 다 보는 **완전 탐색**(brute force)이 정답이다. 틀은 거의 늘 같다. 빈 선택에서 시작해 후보 하나를 고르고(choose), 재귀로 다음 칸에 들어가고(explore), 돌아오면 고른 것을 되돌린다(unchoose). 세 가지 기본 열거를 이 틀로 써 보자.
```python
from itertools import combinations, permutations

def perms(n, m):                          # 1..n에서 m개를 골라 나열
    out, cur, used = [], [], [False] * (n + 1)
    def go():
        if len(cur) == m:
            out.append(tuple(cur))
            return
        for x in range(1, n + 1):
            if not used[x]:
                used[x] = True
                cur.append(x)             # 고르고
                go()                      # 들어가고
                cur.pop()                 # 되돌린다
                used[x] = False
    go()
    return out

def combs(n, m):
    out, cur = [], []
    def go(start):
        if len(cur) == m:
            out.append(tuple(cur))
            return
        for x in range(start, n + 1):
            cur.append(x)
            go(x + 1)
            cur.pop()
    go(1)
    return out

def subsets(items):                       # 원소마다 넣는다/안 넣는다
    out, cur = [], []
    def go(i):
        if i == len(items):
            out.append(tuple(cur))
            return
        go(i + 1)
        cur.append(items[i])
        go(i + 1)
        cur.pop()
    go(0)
    return out

ok = True
for n in range(1, 7):
    r = range(1, n + 1)
    for m in range(n + 1):
        ok &= perms(n, m) == list(permutations(r, m))
        ok &= combs(n, m) == list(combinations(r, m))
    every = {c for m in range(n + 1) for c in combinations(r, m)}
    ok &= sorted(subsets(list(r))) == sorted(every)
print("itertools와 비교(n ≤ 6):", "모두 일치" if ok else "불일치")
print(len(perms(5, 3)), len(combs(5, 3)), len(subsets([1, 2, 3, 4, 5])))
```
```text
itertools와 비교(n ≤ 6): 모두 일치
60 10 32
```
순열은 아직 안 쓴 수를, 조합은 마지막에 고른 수보다 큰 수만 후보로 삼아 같은 묶음을 순서만 바꿔 다시 만들지 않는다. 부분집합은 원소마다 "안 넣는다/넣는다" 두 갈래다. 개수 60, 10, 32는 이산수학 6편 「경우의 수: 순열과 조합」의 `₅P₃`, `₅C₃`, `2⁵`이고, 이것이 재귀 트리의 잎 수, 곧 완전 탐색의 비용이다. 직접 짠 열거는 이렇게 `itertools`와 대조해 검사한다.

## 백트래킹: N-Queen
**백트래킹**(backtracking)은 위 틀에서 "이 선택으로는 답이 나올 수 없다"가 보이는 순간 그 아래를 탐색하지 않고 되돌아가는 방법이다. 이 이름은 1950년대에 미국 수학자 D. H. 레머(D. H. Lehmer)가 붙였다. 대표 예가 N×N 체스판에 퀸 N개를 서로 공격하지 않게 놓는 **N-Queen** 문제다. 8×8판의 여덟 퀸 퍼즐은 1848년 체스 문제 작가 막스 베첼(Max Bezzel)이 냈고, 1850년 프란츠 나우크(Franz Nauck)가 처음 해를 발표했다(해는 모두 92개).

같은 행에 두 퀸이 있을 수 없으니 행마다 하나씩 놓는다. 행마다 아무 열이나 골라 끝에서 검사하면 8⁸ = 16,777,216가지, 열이 겹치지 않게 순열로 만들면 8! = 40,320가지다. 백트래킹은 퀸을 놓을 때마다 열과 두 대각선이 이미 공격받는지 확인해, 공격받는 칸에는 아예 들어가지 않는다. 한 대각선 위의 칸은 `r + c`가 같고, 반대 방향 대각선 위의 칸은 `r − c`가 같다.
```python
from itertools import permutations
from math import factorial

def queens(n):
    col, d1, d2 = [False] * n, [False] * (2 * n), [False] * (2 * n)
    nodes = sols = 0
    def go(r):                            # r행에 퀸을 놓을 차례
        nonlocal nodes, sols
        nodes += 1
        if r == n:
            sols += 1
            return
        for c in range(n):
            if col[c] or d1[r + c] or d2[r - c + n]:
                continue                  # 공격받는 칸: 가지를 친다
            col[c] = d1[r + c] = d2[r - c + n] = True
            go(r + 1)
            col[c] = d1[r + c] = d2[r - c + n] = False
    go(0)
    return sols, nodes

def queens_brute(n):                      # 열 순열마다 대각선만 검사
    return sum(1 for p in permutations(range(n))
               if len({r + c for r, c in enumerate(p)}) == n
               and len({r - c for r, c in enumerate(p)}) == n)

for n in range(4, 11):
    sols, nodes = queens(n)
    ok = "" if n > 8 else "OK" if sols == queens_brute(n) else "X"
    print(f"n={n:<2} 해 {sols:>3} 노드 {nodes:>6,} n! {factorial(n):>9,} {ok}")
```
```text
n=4  해   2 노드     17 n!        24 OK
n=5  해  10 노드     54 n!       120 OK
n=6  해   4 노드    153 n!       720 OK
n=7  해  40 노드    552 n!     5,040 OK
n=8  해  92 노드  2,057 n!    40,320 OK
n=9  해 352 노드  8,394 n!   362,880 
n=10 해 724 노드 35,539 n! 3,628,800 
```
n = 8에서 백트래킹이 방문한 노드는 2,057개로 순열의 잎 40,320개의 약 1/20, 행마다 아무 열이나 고르는 방식의 약 1/8,000이다. `OK`는 순열을 모두 만드는 완전 탐색과 해의 개수가 같다는 뜻이다. 가지치기는 결과는 그대로 두고 탐색량만 줄여야 하므로, 넣을 때마다 가지치기 없는 버전과 대조한다.

## 부분집합 합: 남은 합으로 가지치기
"음이 아닌 정수 N개 중 합이 정확히 S인 부분집합(공집합 포함)의 개수"를 세어 보자. 원소를 큰 것부터 보면서 두 경우에 가지를 친다. 지금까지의 합이 S를 넘은 경우(음수가 없으니 더할수록 커지기만 한다)와, 남은 수를 모두 더해도 S에 못 미치는 경우다. 여기에 "합이 S가 되면 남은 원소는 볼 필요 없이 1을 돌려준다"는 지름길을 넣은 버전도 함께 대조해 보자.
```python
import random

def count_brute(a, s):                    # 2ⁿ개 부분집합을 모두 본다
    n = len(a)
    return sum(1 for mask in range(1 << n)
               if sum(a[i] for i in range(n) if mask >> i & 1) == s)

def count_pruned(a, s, early_stop=False):
    a = sorted(a, reverse=True)           # 큰 수부터 본다
    rest = [0] * (len(a) + 1)             # rest[i] = a[i:]의 합
    for i in range(len(a) - 1, -1, -1):
        rest[i] = rest[i + 1] + a[i]
    nodes = 0
    def go(i, cur):
        nonlocal nodes
        nodes += 1
        if cur > s or cur + rest[i] < s:  # 넘쳤거나, 다 더해도 모자란다
            return 0
        if early_stop and cur == s:       # 위험한 지름길: 0이 있으면 틀린다
            return 1
        if i == len(a):
            return 1                      # 여기 오면 cur == s다
        return go(i + 1, cur + a[i]) + go(i + 1, cur)
    return go(0, 0), nodes

def stress(early_stop, trials=300, seed=2):
    rng = random.Random(seed)
    for t in range(trials):
        n = rng.randint(1, 2 + t // 50)   # 작은 입력부터
        a = [rng.randint(0, 6) for _ in range(n)]
        s = rng.randint(0, 15)
        got, _ = count_pruned(a, s, early_stop)
        if got != count_brute(a, s):
            return f"반례 a={a}, S={s}: {got} ≠ {count_brute(a, s)}"
    return f"무작위 {trials}개 비교: 모두 일치"

print("지름길O", stress(True))
print("지름길X", stress(False))
a = random.Random(7).sample(range(1, 100), 20)
print("n=20 노드:", count_pruned(a, 100)[1], "/ 가지치기 없이", 2**21 - 1)
```
```text
지름길O 반례 a=[0], S=0: 1 ≠ 2
지름길X 무작위 300개 비교: 모두 일치
n=20 노드: 2643 / 가지치기 없이 2097151
```
지름길 버전은 반례 `[0]`, S = 0에서 틀린다. 공집합과 {0} 둘 다 합이 0인데 지름길은 공집합 하나만 센다. "남은 원소를 더하면 반드시 S를 넘는다"는 생각은 모든 수가 양수일 때만 맞다. 가지치기는 늘 어떤 가정에 기대고, 그 가정이 깨지는 0·음수·중복 입력은 무작위 대조 검사가 빨리 찾아 준다. 올바른 두 가지치기만으로도 n = 20에서 노드가 2,097,151개에서 2,643개로 줄었지만, 이 효과는 입력에 따라 다르고 최악은 여전히 지수 시간이다. N이 40 정도면 12편 「중간에서 만나기: 지수를 절반으로 줄이는 기법」, 값의 범위가 작으면 동적 계획법 2편 「배낭 문제: 0-1 배낭, 무한 배낭, 메모리 줄이기」의 방법을 쓴다.

## 재귀 깊이
백트래킹의 재귀 깊이는 보통 고르는 칸 수라 괜찮지만, 깊이가 입력 크기만큼 커지는 재귀는 파이썬에서 곧바로 문제가 된다.
```python
import sys

def depth(n):                             # 호출 하나가 스택 한 칸
    return 0 if n == 0 else 1 + depth(n - 1)

print("기본 한도:", sys.getrecursionlimit())
try:
    depth(5000)
except RecursionError as e:
    print(type(e).__name__)
sys.setrecursionlimit(10_000)
print("한도를 올린 뒤:", depth(5000))
```
```text
기본 한도: 1000
RecursionError
한도를 올린 뒤: 5000
```
CPython은 기본으로 호출 깊이 1,000에서 `RecursionError`를 낸다. `sys.setrecursionlimit`으로 한도를 올릴 수 있지만, 실제 C 스택이 넘치면 프로세스가 그대로 죽을 수 있다. 깊이가 수만을 넘으면 반복문과 명시적 스택으로 바꾸는 편이 안전하다(동적 계획법 7편 「트리 DP: 독립 집합과 리루팅」).

## 자주 하는 실수와 변형
- 되돌리기를 빠뜨린다: `append` 뒤에 `pop`, 표시 뒤에 해제가 짝으로 있어야 한다.
- 결과에 `cur`를 그대로 넣는다: 나중에 바뀌므로 `tuple(cur)`처럼 복사해 넣는다.
- 같은 값이 여러 번 있으면: 정렬한 뒤 "앞의 같은 값을 안 썼으면 건너뛴다"로 중복 결과를 막는다.
- 스도쿠·그래프 색칠도 "칸 하나 정하기 → 제약 검사 → 되돌리기"의 같은 틀이다.

## 복잡도
| 탐색 | 잎(경우) 수 | 시간 |
|---|---|---|
| n개 중 m개 순열 | n!/(n−m)! | 잎 수 × m |
| n개 중 m개 조합 | C(n, m) | 잎 수 × m |
| 부분집합 | 2ⁿ | 2ⁿ × n |
| N-Queen | n! 이하 | 가지치기로 훨씬 적음 |

- × m, × n은 결과를 복사하는 비용이다. 개수만 세면 방문 노드 수에 비례한다.
- 결과를 저장하지 않으면 공간은 재귀 깊이와 현재 선택만큼인 O(n)이다.

## 어디에 쓰이나
- 이산수학 6편 「경우의 수: 순열과 조합」: 그 글의 `ₙPᵣ`, `ₙCᵣ`, 2ⁿ이 재귀 트리의 잎 수라서, 완전 탐색이 시간 안에 끝날지를 그 공식으로 미리 계산한다.
- 이산수학 4편 「수학적 귀납법과 재귀」: "`go(i)`는 i번째 이후의 모든 선택을 빠짐없이 한 번씩 만든다"를 i에 대한 귀납법으로 보이는 것이 열거 코드의 정확성 증명이다.
- 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」: 진리표 전체를 보는 대신 변수에 값을 하나씩 정하고 모순이 나면 되돌아가는 DPLL 계열 SAT 풀이기가 백트래킹이다. 특수한 경우인 2-SAT는 그래프 알고리즘 7편 「2-SAT: 논리식을 그래프로 풀기」처럼 다항 시간에 풀린다.

## 정리
- 완전 탐색은 "고르고, 들어가고, 되돌리는" 재귀 하나로 순열·조합·부분집합을 만들고, 비용은 경우의 수다.
- 백트래킹은 답이 될 수 없는 가지를 일찍 잘라, 8-Queen에서 노드를 40,320개(순열)에서 2,057개로 줄인다.
- 가지치기는 양수·정렬 같은 가정에 기대므로, 가지치기 없는 완전 탐색과 무작위로 대조한다.
- 파이썬 재귀 깊이의 기본 한도는 1,000이다. 깊은 재귀는 한도를 올리거나 명시적 스택으로 바꾼다.

## 더 알아보기
- 이전 글: 1편 「입력 크기로 알고리즘 고르기: 복잡도 어림과 문제 읽기」
- 다음 글: 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」
- 여덟 퀸 퍼즐의 역사와 해의 개수(위키백과 영어판): https://en.wikipedia.org/wiki/Eight_queens_puzzle
