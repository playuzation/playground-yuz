# [그래프 알고리즘 7/14] 2-SAT: 논리식을 그래프로 풀기

> **한 줄 요약** — 리터럴 두 개짜리 절들의 논리곱(2-SAT)은 각 절을 함의 간선 두 개로 바꾼 그래프에서 x와 ¬x가 같은 강한 연결 요소에 있는지만 보면 선형 시간에 판정되고, SCC의 위상 순서로 해까지 만들 수 있다.

## 이 글에서 다루는 것
- 2-SAT 문제와 2ⁿ 완전 탐색
- 절 (a ∨ b)를 함의 그래프로 바꾸기
- SCC로 판정하고 위상 순서로 해 만들기
- 완전 탐색 대조와 조건을 절로 옮기는 표

## 예제: 오전·오후 발표 배정
발표자 A, B, C, D를 오전이나 오후에 배정한다. 각자 희망 두 개를 냈고, 둘 중 하나는 들어줘야 한다. "A 오전 또는 B 오후", "A 오후 또는 C 오후", "B 오전 또는 C 오전", "C 오후 또는 D 오전", "B 오후 또는 D 오후". 변수 x를 "오전이면 참"으로 두면 각 희망은 리터럴 두 개의 논리합(절)이고, 전체는 절들의 논리곱이다. 이렇게 모든 절의 리터럴이 두 개인 식의 만족 가능성 문제를 **2-SAT**이라 한다. 변수 n개의 참·거짓을 모두 대입하면 2ⁿ가지다. 절에 리터럴이 세 개만 되어도(3-SAT) NP-완전 문제가 되어 다항 시간 알고리즘이 알려져 있지 않지만, 두 개면 그래프 문제로 바뀐다.

## 함의 그래프
이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」에서 본 동치 `p → q ≡ ¬p ∨ q`를 거꾸로 쓰면 절 (a ∨ b)는 "a가 거짓이면 b는 참"이자 "b가 거짓이면 a는 참"이다.
```text
(a ∨ b)  ≡  (¬a → b) ∧ (¬b → a)
```
리터럴 2n개(x와 ¬x)를 정점으로, 절마다 이 두 간선을 넣은 것이 **함의 그래프**(implication graph)다. 두 간선은 서로의 대우라서, 간선 u → v가 있으면 언제나 ¬v → ¬u도 있다.

## SCC로 판정하고 해 만들기
간선을 따라가면 "u가 참이면 v도 참"이 이어진다. 그래서 x와 ¬x가 6편의 같은 SCC에 있으면 x → … → ¬x와 ¬x → … → x가 모두 있어, x를 무엇으로 정해도 반대 값이 강제된다. 해가 없다. 그렇지 않으면 해가 있고, 각 변수마다 **위상 순서에서 더 뒤에 있는 SCC의 리터럴을 참**으로 고르면 된다. 절 (a ∨ b)가 거짓이 되려면 ¬a가 참, b가 거짓이어야 하는데 간선 ¬a → b가 있으므로, "참에서 거짓으로 가는 간선이 없다"만 보이면 된다. 귀류법으로 간선 a → b가 있는데 a는 참, b는 거짓으로 골랐다고 하면, 간선은 위상 순서를 거스르지 않으므로 a → b와 그 대우 ¬b → ¬a에서 다음이 나온다(comp는 위상 순서 번호).
```text
comp[a] ≤ comp[b] < comp[¬b]
        ≤ comp[¬a] < comp[a]
```
가운데 두 `<`는 "b는 거짓, a는 참으로 골랐다"는 선택 규칙이고, 결국 `comp[a] < comp[a]`라는 모순이다. 아래 구현은 6편의 반복문 코사라주를 그대로 써서 SCC 번호가 곧 위상 순서다. 리터럴은 xᵢ를 `2i`, ¬xᵢ를 `2i + 1`로 두어 부정이 `l ^ 1` 한 번이다.
```python
def scc(n, adj):                         # 코사라주(6편), 번호 = 위상 순서
    order, seen = [], [False] * n
    for s in range(n):
        if seen[s]:
            continue
        seen[s], st = True, [(s, iter(adj[s]))]
        while st:
            u, it = st[-1]
            for v in it:
                if not seen[v]:
                    seen[v] = True
                    st.append((v, iter(adj[v])))
                    break
            else:
                st.pop()
                order.append(u)
    radj = [[] for _ in range(n)]
    for u in range(n):
        for v in adj[u]:
            radj[v].append(u)
    comp, c = [-1] * n, 0
    for s in reversed(order):
        if comp[s] < 0:
            comp[s], st = c, [s]
            while st:
                for v in radj[st.pop()]:
                    if comp[v] < 0:
                        comp[v] = c
                        st.append(v)
            c += 1
    return comp

def two_sat(n, clauses):                 # 리터럴: x_i = 2i, ¬x_i = 2i + 1
    adj = [[] for _ in range(2 * n)]
    for a, b in clauses:                 # (a ∨ b) = (¬a → b) ∧ (¬b → a)
        adj[a ^ 1].append(b)
        adj[b ^ 1].append(a)
    comp = scc(2 * n, adj)
    if any(comp[2 * i] == comp[2 * i + 1] for i in range(n)):
        return None                      # x와 ¬x가 서로 닿는다: 모순
    return [comp[2 * i] > comp[2 * i + 1] for i in range(n)]

def lit(i, am):                          # i번 사람이 오전(am=True)/오후
    return 2 * i if am else 2 * i + 1

A, B, C, D = range(4)
wish = [(lit(A, 1), lit(B, 0)), (lit(A, 0), lit(C, 0)),
        (lit(B, 1), lit(C, 1)), (lit(C, 0), lit(D, 1)),
        (lit(B, 0), lit(D, 0))]
def show(r):
    return r and " ".join(f"{p}:{'오전' if x else '오후'}"
                          for p, x in zip("ABCD", r))

print(show(two_sat(4, wish)))
force = [(lit(A, 1), lit(A, 1)), (lit(C, 1), lit(C, 1))]  # (x ∨ x) = x
print(show(two_sat(4, wish + force)))
```
```text
A:오전 B:오전 C:오후 D:오후
None
```
다섯 희망을 모두 들어준 배정이다. 여기에 "A는 반드시 오전", "C는 반드시 오전"을 절 (x ∨ x)로 더하면 "A 오후 또는 C 오후"를 들어줄 수 없어 None이 나온다.

## 무작위 대조 검사
느린 답은 2ⁿ가지 대입을 모두 해 보는 것이다. 만족 가능 여부가 같은지, 그리고 찾은 해가 실제로 모든 절을 만족하는지 확인한다. 위상 순서 비교를 거꾸로 한(앞쪽 리터럴을 참으로 고른) 실수도 함께 센다.
```python
# 앞 코드에 이어서
import random
from itertools import product

def holds(r, clauses):                   # 리터럴 l의 값 = r[l // 2] ^ (l & 1)
    return all(r[a // 2] ^ (a & 1) or r[b // 2] ^ (b & 1)
               for a, b in clauses)

rng, ok, sat, bad = random.Random(7), 0, 0, 0
for _ in range(500):
    n = rng.randint(1, 8)
    cl = [(rng.randrange(2 * n), rng.randrange(2 * n))
          for _ in range(rng.randint(1, 3 * n))]
    r = two_sat(n, cl)
    brute = any(holds(x, cl) for x in product((False, True), repeat=n))
    sat += brute
    ok += (r is not None) == brute and (r is None or holds(r, cl))
    bad += r is not None and not holds([not x for x in r], cl)
print("무작위 500개 비교:", "모두 일치" if ok == 500 else ok)
print("만족 가능:", sat)
print("비교를 거꾸로 하면 틀림:", bad)
```
```text
무작위 500개 비교: 모두 일치
만족 가능: 398
비교를 거꾸로 하면 틀림: 340
```
만족 가능한 398개 중 340개에서 거꾸로 고른 해가 틀렸다. SCC를 찾는 방향(코사라주는 위상 순서, 타잔은 그 역순)에 따라 비교 부등호가 바뀌므로, 쓰는 SCC 알고리즘의 번호 의미를 확인해야 한다.

## 조건을 절로 옮기기
| 조건 | 절 |
|---|---|
| a 또는 b | (a ∨ b) |
| a와 b를 함께 고를 수 없음 | (¬a ∨ ¬b) |
| a이면 b | (¬a ∨ b) |
| a와 b 중 정확히 하나 | (a ∨ b), (¬a ∨ ¬b) |
| a와 b가 같은 값 | (¬a ∨ b), (a ∨ ¬b) |
| a는 반드시 참 | (a ∨ a) |

"k개 중 많아야 하나"는 쌍마다 (¬a ∨ ¬b)를 넣으면 절이 k²/2개쯤 되는데, 앞에서부터 "여기까지 하나라도 골랐다"는 보조 변수를 두면 O(k)개로 줄일 수 있다. 셋 이상의 리터럴이 한 절에 필요해지면 더는 2-SAT이 아니다.

## 복잡도
| 방법 | 시간 |
|---|---|
| 모든 대입 | O(2ⁿ · m) |
| 함의 그래프 + SCC | O(n + m) |

정점 2n개, 간선 2m개(m은 절 수)인 그래프에서 SCC를 한 번 구하고 변수마다 비교 한 번을 하므로 선형이다. 크롬(Melven Krom)이 1967년에 다항 시간 판정법을 보였고, 이븐·이타이·샤미르(1976)를 거쳐 아스프발·플래스·타잔(1979)이 이 SCC 방식의 선형 알고리즘을 발표했다.

## 어디에 쓰이나
- 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」: 절 하나가 만드는 두 간선 ¬a → b와 ¬b → a는 서로의 대우이고, 그래서 함의 그래프는 간선을 뒤집고 부정을 붙이면 자기 자신이 되는 대칭 구조를 갖는다.
- 이산수학 3편 「술어 논리와 증명: '모든'과 '어떤'을 다루기」: 위상 순서로 고른 해가 모순 없다는 증명은 "모순을 가정하면 `comp[a] < comp[a]`"라는 귀류법이다.
- 6편 「강한 연결 요소: 타잔과 코사라주」: 판정은 SCC 하나로 끝나고, 해 구성은 응축 그래프의 위상 순서를 그대로 쓴다.

## 정리
- 2-SAT은 리터럴 두 개짜리 절들의 논리곱이고, 각 절은 함의 간선 두 개 (¬a → b), (¬b → a)가 된다.
- x와 ¬x가 같은 SCC에 있으면 해가 없다.
- 그렇지 않으면 위상 순서에서 더 뒤에 있는 리터럴을 참으로 고르면 해가 되고, 비교 방향을 틀리면 대부분 틀린다.
- 전체 O(n + m)이며, 여러 실무 조건을 표의 절 패턴으로 옮겨 쓴다.

## 더 알아보기
- 이전 글: 6편 「강한 연결 요소: 타잔과 코사라주」
- 다음 글: 8편 「단절점과 단절선: 끊으면 갈라지는 곳 찾기」
- 위키백과 영어판 2-satisfiability: https://en.wikipedia.org/wiki/2-satisfiability
