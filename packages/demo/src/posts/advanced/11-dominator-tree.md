# [심화 알고리즘 11/14] 지배자 트리: 반드시 거쳐 가는 정점 찾기

> **한 줄 요약** — 시작점에서 v로 가는 모든 경로가 지나는 정점(지배자)들은 사슬을 이루어 직접 지배자를 부모로 하는 트리가 되고, 역후위 순서로 선행자들의 직접 지배자를 트리 위에서 "교집합"하는 쿠퍼-하비-케네디 반복이나 반지배자를 쓰는 렝가우어-타잔으로 구하며, 컴파일러의 SSA 변환과 힙 분석의 회수 가능 메모리 계산에 쓰인다.

## 이 글에서 다루는 것
- 지배자, 직접 지배자, 지배자 트리와 지워 보는 단순한 방법
- 쿠퍼-하비-케네디 반복 알고리즘: 역후위 순서와 두 손가락 교집합
- 렝가우어-타잔의 반지배자 개요
- 무작위 대조와 반복 바퀴 수 실험
- 지배 경계로 φ 함수 위치 정하기, 반복문 찾기

## 예제 문제: 반드시 지나는 블록
함수 하나의 제어 흐름 그래프다. 정점은 기본 블록, 간선은 실행이 넘어갈 수 있는 방향이다.
```text
0 → 1        함수 시작
1 → 2, 3     if
2 → 4
3 → 4, 5     안쪽 if
4 → 6
5 → 6
6 → 1, 7     반복문 끝, 7은 종료
```
시작점 s에서 v로 가는 **모든** 경로가 d를 지나면 d가 v를 **지배한다**(dominate)고 한다. 4로 가는 길은 0─1─2─4와 0─1─3─4가 있으니 4의 지배자는 0, 1, 4다. v의 지배자 중 v가 아닌 것들은 한 경로 위에 늘어선 사슬이 된다. d₁, d₂가 둘 다 v를 지배하면 둘 중 하나가 다른 하나를 지배하기 때문이다(아니라면 각각을 피해 가는 경로를 이어 붙여 v에 닿을 수 있다). 그래서 v에 가장 가까운 **직접 지배자** idom(v)가 하나로 정해지고, idom을 부모로 이으면 **지배자 트리**(dominator tree)가 된다. 이 개념은 1959년 프로서(Prosser)가 흐름도 분석에 처음 썼다.

## 단순한 방법: 하나씩 지워 보기
d를 지웠을 때 s에서 닿지 않게 되는 정점이 d가 지배하는 정점이다. 정점마다 탐색 한 번이라 O(V(V + E))다. 지배자들은 사슬이므로, 그중 자기 지배자가 가장 많은(트리에서 가장 깊은) 것이 직접 지배자다.
```python
def reach(n, succ, s, banned=-1):         # banned를 지운 그래프에서 s의 도달 집합
    seen, st = {s}, [s]
    while st:
        v = st.pop()
        for w in succ[v]:
            if w != banned and w not in seen:
                seen.add(w); st.append(w)
    return seen

def dominators_slow(n, succ, s=0):        # 정의 그대로: 지워 보고 끊기면 지배
    full = reach(n, succ, s)
    dom = {v: {s, v} for v in full}
    for d in full - {s}:
        for v in full - reach(n, succ, s, d):
            dom[v].add(d)                 # d를 지우면 v에 못 간다
    idom = [-1] * n
    for v in full - {s}:                  # 지배자들은 사슬: 가장 깊은 것이 직접 지배자
        idom[v] = max(dom[v] - {v}, key=lambda d: len(dom[d]))
    idom[s] = s
    return idom

succ = [[1], [2, 3], [4], [4, 5], [6], [6], [1, 7], []]
print("직접 지배자", dominators_slow(8, succ))
```
```text
직접 지배자 [0, 0, 1, 1, 1, 3, 1, 6]
```
4·6의 직접 지배자는 1이다. 2를 거치든 3을 거치든 1은 꼭 지난다. 5는 3을 거쳐야만 닿으므로 3이 지배한다.

## 쿠퍼-하비-케네디: 선행자들의 공통 조상
지배자 집합은 데이터 흐름 방정식 `Dom(v) = {v} ∪ (모든 선행자 p의 Dom(p)의 교집합)`을 만족한다. v에 오려면 어느 선행자를 거치든 공통으로 지나는 정점을 지나야 하기 때문이다. 쿠퍼(Cooper)·하비(Harvey)·케네디(Kennedy)가 2001년 「A Simple, Fast Dominance Algorithm」에서 낸 방법은 이 방정식을 반복해 고정점을 찾되, 집합을 따로 들지 않는다.
- Dom(p)는 지금까지 만든 지배자 트리에서 p부터 뿌리까지의 경로다. 그러면 두 집합의 교집합은 두 정점의 **가장 가까운 공통 조상**이다.
- 정점에 역후위 순서(reverse postorder) 번호를 매기면 조상이 늘 더 작은 번호를 갖는다. 두 손가락 중 번호가 큰 쪽을 idom으로 올리기를 반복하면 만나는 곳이 공통 조상이다.
- 역후위 순서로 돌면 선행자가 대부분 먼저 처리되어 몇 바퀴 만에 값이 더 바뀌지 않는다.

앞 코드에 이어서 실행한다.
```python
def chk(n, succ, s=0):                    # 쿠퍼-하비-케네디 반복 알고리즘
    post, seen, st = [], [False] * n, [(s, iter(succ[s]))]
    seen[s] = True
    while st:                             # 반복 DFS로 후위 순서
        v, it = st[-1]
        for w in it:
            if not seen[w]:
                seen[w] = True; st.append((w, iter(succ[w]))); break
        else:
            st.pop(); post.append(v)
    rpo = post[::-1]                      # 역후위 순서: 대체로 위에서 아래로
    num = {v: i for i, v in enumerate(rpo)}
    pred = [[] for _ in range(n)]
    for v in range(n):
        for w in succ[v]:
            pred[w].append(v)
    idom = [-1] * n
    idom[s] = s

    def intersect(a, b):                  # 지배자 트리에서 두 손가락 올리기
        while a != b:
            while num[a] > num[b]:
                a = idom[a]
            while num[b] > num[a]:
                b = idom[b]
        return a

    passes, changed = 0, True
    while changed:
        changed, passes = False, passes + 1
        for v in rpo[1:]:
            new = -1
            for p in pred[v]:
                if idom[p] != -1:         # 아직 값이 없는 선행자는 건너뛴다
                    new = p if new == -1 else intersect(p, new)
            if idom[v] != new:
                idom[v], changed = new, True
    return idom, passes

idom, passes = chk(8, succ)
print("직접 지배자", idom, "/", passes, "바퀴")
```
```text
직접 지배자 [0, 0, 1, 1, 1, 3, 1, 6] / 2 바퀴
```
첫 바퀴에 값이 다 정해지고, 둘째 바퀴는 바뀐 것이 없음을 확인만 했다. 저자들은 이 단순한 방법이 실제 프로그램의 흐름 그래프에서 렝가우어-타잔 알고리즘보다 빠르다고 보고했다.

## 렝가우어-타잔: 반지배자로 한 번에
렝가우어(Lengauer)와 타잔(Tarjan)의 1979년 논문 「A Fast Algorithm for Finding Dominators in a Flowgraph」은 DFS 한 번과 트리 위 경로 질의로 반복 없이 구한다. 정점을 DFS 방문 순서로 번호 매긴 뒤 **반지배자**(semidominator)를 정의한다.
```text
sdom(w): v → … → w 경로의 중간 정점이
  모두 w보다 DFS 번호가 큰 v 중
  번호가 가장 작은 v
u: 트리 경로 (sdom(w), w]에서
  sdom이 가장 작은 정점
idom(w) = sdom(w)  sdom(u)=sdom(w)이면
        = idom(u)  아니면
```
sdom은 DFS 번호의 역순으로 정점을 처리하며, 이미 처리한 정점들의 숲에서 "경로 위 최솟값"을 경로 압축으로 구한다. 단순한 연결이면 O(E log V), 균형 잡힌 연결이면 O(E·α(E, V))다(α는 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」의 역아커만 함수). 구현이 길어 이 글에서는 개요만 다룬다.

## 무작위 대조 검사
앞 코드에 이어서, 앞쪽 정점에서 들어오는 간선(가끔 빠뜨려 닿지 않는 정점도 만든다)에 아무 방향 간선을 섞은 무작위 그래프 500개에서 지워 보기 방법과 비교하고, 반복 바퀴 수를 센다.
```python
import random
from collections import Counter

rng = random.Random(11)
hist = Counter()
for _ in range(500):
    n = rng.randint(2, 12)
    succ = [[] for _ in range(n)]
    for v in range(1, n):                 # 앞 정점에서 들어오는 간선(가끔 빠짐)
        if rng.random() < 0.9:
            succ[rng.randrange(v)].append(v)
    for _ in range(rng.randint(0, 2 * n)):  # 아무 방향 간선(뒤로 가는 간선 포함)
        succ[rng.randrange(n)].append(rng.randrange(n))
    idom, passes = chk(n, succ)
    assert idom == dominators_slow(n, succ)
    hist[passes] += 1
print("무작위 500개: 지워 보기 방법과 모두 일치")
print("반복 바퀴 수 분포", sorted(hist.items()))
```
```text
무작위 500개: 지워 보기 방법과 모두 일치
반복 바퀴 수 분포 [(1, 9), (2, 415), (3, 70), (4, 6)]
```
닿지 않는 정점(-1)까지 모두 같았다. 대부분 2바퀴(정하기 1 + 확인 1)에 끝났고, 뒤로 가는 간선이 얽힌 그래프에서만 한두 바퀴 더 돌았다. 1바퀴는 시작점밖에 닿지 않는 그래프다.

## 지배 경계와 SSA, 반복문 찾기
컴파일러 최적화의 중심 표현인 SSA(static single assignment) 형식은 변수마다 대입을 한 번만 하도록 이름을 나누고, 흐름이 합쳐지는 곳에 `x₃ = φ(x₁, x₂)`를 넣는다. 사이트론(Cytron) 등의 1991년 논문은 φ를 넣을 곳을 **지배 경계**(dominance frontier)로 정했다. b의 지배 경계는 "b가 그 선행자 하나를 지배하지만 그 블록 자체는 엄격히 지배하지 않는" 블록들, 곧 b의 지배가 끝나는 경계다. 합류점에서 선행자부터 idom까지 올라가며 기록하면 구해진다. 또 간선 u → h에서 h가 u를 지배하면 그 간선이 반복문을 닫는 뒤로 가는 간선이고 h가 반복문의 머리다. 앞 코드에 이어서 예제에 적용한다(대조 검사가 바꾼 변수를 다시 만든다).
```python
succ = [[1], [2, 3], [4], [4, 5], [6], [6], [1, 7], []]
idom, _ = chk(8, succ)
pred = [[u for u in range(8) if v in succ[u]] for v in range(8)]
df = {v: set() for v in range(8)}         # 지배 경계
for b in range(8):
    if len(pred[b]) >= 2:                 # 합류점에서 위로 올라가며 기록
        for p in pred[b]:
            r = p
            while r != idom[b]:
                df[r].add(b); r = idom[r]
print("지배 경계", {v: sorted(d) for v, d in df.items() if d})
need, work = set(), [3]                   # 지배 경계를 반복 적용
while work:
    for y in df[work.pop()]:
        if y not in need:
            need.add(y); work.append(y)
print("블록 3에서 x를 고치면 φ가 필요한 블록", sorted(need))

def dominates(d, v):
    while v != d and v != idom[v]:
        v = idom[v]
    return v == d

print("뒤로 가는 간선", [(u, h) for u in range(8) for h in succ[u]
                       if dominates(h, u)])
```
```text
지배 경계 {1: [1], 2: [4], 3: [4, 6], 4: [6], 5: [6], 6: [1]}
블록 3에서 x를 고치면 φ가 필요한 블록 [1, 4, 6]
뒤로 가는 간선 [(6, 1)]
```
블록 3에서 x를 바꾸면 4와 6에서 "3을 지나온 값"과 "아닌 값"이 합쳐지고, 6에서 1로 돌아가므로 1에도 φ가 필요하다. 반복문은 머리가 1인 6 → 1 하나다.

## 자주 하는 실수와 변형
- 닿지 않는 정점은 지배자가 정의되지 않는다. 교집합에 넣으면 번호가 없어 오류가 나거나 틀린다(`idom[p] != -1` 검사).
- 아무 순서로 돌아도 답은 맞지만 바퀴 수가 늘어난다. 역후위 순서가 핵심이다.
- **후지배자**(post-dominator): 간선을 뒤집고 종료 블록에서 출발하면 "종료까지 반드시 지나는 블록"이다. 제어 의존성 계산에 쓰인다.
- 시작점이 여럿이면 모두에 간선을 잇는 가상 뿌리를 둔다. 힙 분석의 GC 루트들이 그렇다.
- **반드시 지나는 간선**: 간선마다 가운데 정점을 끼워 넣고 그 정점의 지배를 본다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 지워 보기 | O(V(V + E)) | 정의 그대로 |
| 쿠퍼-하비-케네디 | 바퀴당 O(E·h) | h = 트리 높이 |
| 렝가우어-타잔 단순판 | O(E log V) | 경로 압축 |
| 렝가우어-타잔 | O(E·α(E, V)) | 균형 연결 |

쿠퍼-하비-케네디는 교집합 한 번이 트리 높이만큼 걸리고, 실험처럼 바퀴 수가 작아 실제로 빠르다. 공간은 모두 O(V + E)다.

## 어디에 쓰이나
- 언어 기초 8편 「자바와 JVM: 한 번 작성하면 어디서나 실행」: 그 글의 가비지 컬렉터는 GC 루트에서 닿지 않는 객체를 회수한다. Eclipse Memory Analyzer는 객체 그래프의 지배자 트리를 만들어, 객체 하나가 사라지면 함께 회수될 메모리(retained heap)를 지배자 서브트리로 계산한다.
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: 그 글의 루프 뒤집기 같은 반복문 최적화는 반복문을 먼저 찾아야 하고, 실제 컴파일러는 그 일과 SSA 변환을 지배자 트리와 지배 경계로 한다.
- 그래프 알고리즘 8편 「단절점과 단절선: 끊으면 갈라지는 곳 찾기」: 무방향 그래프의 "지우면 갈라지는 정점"을 방향 그래프와 고정된 시작점으로 옮긴 것이 지배자이고, 하나씩 지워 보는 단순한 방법도 같다.

## 정리
- d가 s에서 v로 가는 모든 경로 위에 있으면 d가 v를 지배하고, 지배자들은 사슬이라 직접 지배자로 트리가 된다.
- 쿠퍼-하비-케네디는 역후위 순서로 선행자들의 공통 조상을 반복해 구하며, 무작위 500개 대부분이 2바퀴에 끝났다.
- 렝가우어-타잔은 반지배자와 경로 압축으로 O(E·α)에 구한다.
- 지배 경계는 SSA의 φ 위치를, 지배 관계는 반복문의 머리를, 지배자 서브트리는 회수 가능 메모리를 알려 준다.

## 더 알아보기
- 이전 글: 10편 「일반 그래프 매칭: 에드몬즈의 꽃 알고리즘」
- 다음 글: 12편 「전역 최소 컷: 스토어-바그너와 카거의 무작위 축약」
- Dominator(위키백과 영어판): https://en.wikipedia.org/wiki/Dominator_%28graph_theory%29
