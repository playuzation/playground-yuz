# [그래프 알고리즘 12/14] 이분 매칭: 증가 경로와 쾨니그 정리

> **한 줄 요약** — 이분 그래프의 최대 매칭은 짝 없는 왼쪽 정점에서 "비매칭 간선, 매칭 간선"을 번갈아 타고 짝 없는 오른쪽 정점에 닿는 증가 경로를 찾아 짝을 뒤집기를 반복해 O(VE)에 구하며, 그 결과에서 바로 같은 크기의 최소 정점 덮개(쾨니그 정리)를 만들 수 있다.

## 이 글에서 다루는 것
- 이분 매칭 문제와 증가 경로, 베르주 정리
- DFS로 짝을 밀어내는 쿤 알고리즘과 실행 과정
- 호프크로프트-카프 알고리즘의 아이디어(디닉과의 관계)
- 쾨니그 정리: 최소 정점 덮개 = 최대 매칭, 덮개 만들기
- 플로우 환원·완전 탐색과의 무작위 대조 검사

## 예제 문제: 사람과 일 짝짓기
사람 5명과 일 4개가 있고, 사람마다 할 수 있는 일이 정해져 있다. 한 사람은 일 하나만, 일 하나는 한 사람만 맡는다. 최대 몇 쌍을 만들 수 있을까?
```text
사람 0: T0, T1
사람 1: T0
사람 2: T1, T2, T3
사람 3: T2
사람 4: T2
```
정점이 두 무리로 나뉘고 간선이 무리 사이에만 있는 그래프를 **이분 그래프**(bipartite graph), 끝점을 공유하지 않는 간선 집합을 **매칭**(matching)이라 한다. 이산수학 1편 「집합과 함수: 수학의 기본 언어」의 말로 하면 왼쪽 일부에서 오른쪽으로 가는 단사 함수다. 모든 간선 부분집합을 보면 2ᴱ가지이고, 사람마다 일을 고르는 되추적도 최악에 지수 시간이다.

## 증가 경로와 베르주 정리
매칭 M에 대해 짝 없는 왼쪽 정점에서 출발해 비매칭 간선, 매칭 간선을 번갈아 타고 짝 없는 오른쪽 정점에서 끝나는 경로를 **증가 경로**라 한다. 경로 위 간선의 매칭 여부를 모두 뒤집으면 비매칭 간선이 하나 더 많으므로 매칭이 1 커진다. 위 예에서 사람 0이 T0을 맡고 있을 때, 사람 1 → T0 → 사람 0 → T1이 증가 경로다. 사람 1이 T0을 맡고 사람 0은 T1로 옮긴다.

**베르주 정리**(Berge, 1957): 증가 경로가 없으면 그 매칭이 최대다. 더 큰 매칭 M′이 있다면 M과 M′의 대칭차는 경로와 짝수 사이클로 나뉘고, 그중 M′ 간선이 더 많은 조각이 M의 증가 경로가 되기 때문이다. 10편 「네트워크 플로우: 포드-풀커슨과 에드몬즈-카프」의 증가 경로와 같은 생각이다. 실제로 s → 왼쪽 → 오른쪽 → t에 용량 1을 주면 이분 매칭은 최대 유량 문제와 똑같다.

## 쿤 알고리즘: 짝을 밀어내는 DFS
왼쪽 정점을 차례로 보며 증가 경로를 DFS로 찾는다. 사람 u가 일 v를 원할 때 v가 비어 있으면 맡고, 차 있으면 v의 현재 주인에게 "다른 일로 옮길 수 있나"를 재귀로 묻는다. 한 번의 탐색에서 이미 물어본 일은 `seen`으로 다시 묻지 않는다. 흔히 쿤(Kuhn) 알고리즘이라 부른다.
```python
def kuhn(nl, nr, adj, trace=False):
    match_r = [-1] * nr                   # 오른쪽 v의 짝(왼쪽 번호)
    def augment(u, seen):                 # u에서 시작하는 증가 경로 찾기
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                if match_r[v] == -1 or augment(match_r[v], seen):
                    match_r[v] = u        # 경로를 따라 짝을 뒤집는다
                    return True
        return False
    size = 0
    for u in range(nl):
        ok = augment(u, set())
        size += ok
        if trace:
            pairs = " ".join(f"T{v}:{w}" for v, w in enumerate(match_r)
                             if w != -1)
            print(f"사람 {u}", "성공" if ok else "실패", pairs)
    return size, match_r

def konig_cover(nl, nr, adj, match_r):
    match_l = [-1] * nl
    for v, u in enumerate(match_r):
        if u != -1:
            match_l[u] = v
    zl = {u for u in range(nl) if match_l[u] == -1}  # 짝 없는 왼쪽에서
    zr, stack = set(), list(zl)
    while stack:                          # 비매칭 → 매칭 간선 교대 탐색
        u = stack.pop()
        for v in adj[u]:
            if v not in zr:
                zr.add(v)
                w = match_r[v]
                if w != -1 and w not in zl:
                    zl.add(w); stack.append(w)
    return [u for u in range(nl) if u not in zl], sorted(zr)

adj = [[0, 1], [0], [1, 2, 3], [2], [2]]  # 사람 u가 할 수 있는 일
size, match_r = kuhn(5, 4, adj, trace=True)
left, right = konig_cover(5, 4, adj, match_r)
print("최대 매칭", size, "덮개: 사람", left, "일", right)
```
```text
사람 0 성공 T0:0
사람 1 성공 T0:1 T1:0
사람 2 성공 T0:1 T1:0 T2:2
사람 3 성공 T0:1 T1:0 T2:3 T3:2
사람 4 실패 T0:1 T1:0 T2:3 T3:2
최대 매칭 4 덮개: 사람 [0, 1, 2] 일 [2]
```
`T2:3`은 일 T2를 사람 3이 맡았다는 뜻이다. 사람 1 차례에 사람 0이 T0에서 T1로 밀려났고, 사람 3 차례에는 사람 2가 T2에서 T3으로 옮겼다. 사람 4는 T2만 할 수 있는데 T2의 주인(사람 3)이 갈 곳이 없어 실패했다. 한 번 실패한 왼쪽 정점은 나중에 다시 볼 필요가 없다. 어떤 정점에서 출발하는 증가 경로가 없으면, 다른 증가 경로로 매칭을 키운 뒤에도 그 정점에서 출발하는 증가 경로는 생기지 않기 때문이다. 그래서 왼쪽 정점마다 탐색 한 번이면 충분하고, 아래 대조 검사가 그 결과를 확인한다. 탐색 한 번이 O(E)이므로 전체는 O(VE)다.

## 호프크로프트-카프: 짧은 경로를 한꺼번에
쿤 알고리즘은 증가 경로를 하나씩 찾는다. 호프크로프트(John Hopcroft)와 카프(Richard Karp)의 1973년 알고리즘은 11편 디닉과 같은 구조를 쓴다. 짝 없는 왼쪽 정점 전체에서 BFS로 층을 매기고, 그 층 안에서 정점을 공유하지 않는 최단 증가 경로를 DFS로 최대한 많이 찾아 한꺼번에 뒤집는다. 단계마다 최단 증가 경로 길이가 늘어난다. √V단계가 지나면 남은 증가 경로는 모두 길이가 √V를 넘고, 최대 매칭과의 차이만큼 정점이 겹치지 않는 증가 경로가 있으므로 그 차이는 √V 이하다. 단계마다 매칭이 1 이상 크므로 남은 단계도 √V번 이하라 단계 수가 O(√V), 한 단계가 O(E)여서 전체가 O(E√V)다. 단위 용량 네트워크에서 디닉을 돌린 것과 같다.

## 쾨니그 정리: 최소 정점 덮개 = 최대 매칭
모든 간선의 적어도 한쪽 끝을 포함하는 정점 집합을 **정점 덮개**(vertex cover)라 한다. 매칭 간선들은 끝점을 공유하지 않으므로 덮개는 매칭 간선마다 서로 다른 정점을 하나씩 가져야 한다. 따라서 언제나 덮개 크기 ≥ 매칭 크기다. 1931년 쾨니그(Dénes Kőnig)는 이분 그래프에서 둘이 같다는 것을 보였다.

위 `konig_cover`가 그 구성이다. 짝 없는 왼쪽 정점에서 비매칭 간선으로 오른쪽에, 매칭 간선으로 왼쪽에 가는 교대 탐색을 하고, 닿은 집합을 Z라 할 때 덮개는 (왼쪽 − Z) ∪ (오른쪽 ∩ Z)다.
- 간선 u–v의 u가 Z 밖이면 왼쪽 − Z가 덮고, u가 Z 안이면 탐색이 v에도 닿았으므로 오른쪽 ∩ Z가 덮는다.
- 짝 없는 왼쪽은 모두 Z 안이므로 왼쪽 − Z는 모두 짝이 있다. Z 안의 오른쪽 정점도 모두 짝이 있다(없다면 증가 경로가 생긴다). 그리고 오른쪽 ∩ Z의 짝은 탐색으로 Z에 들어가므로 같은 매칭 간선의 두 끝이 동시에 뽑히지 않는다. 그래서 덮개 크기 = 매칭 크기다.

예제에서는 사람 0·1·2와 일 T2, 네 정점이 간선 8개를 모두 덮는다.

## 무작위 대조 검사
쿤 알고리즘을 세 가지와 비교한다. 사람마다 일을 고르는 되추적, 용량 1 네트워크의 최대 유량, 그리고 정점 부분집합을 모두 시도한 최소 정점 덮개다. 쾨니그 덮개가 실제로 모든 간선을 덮는지도 확인한다. 앞 코드에 이어서 실행한다.
```python
import random
from collections import defaultdict

def flow_matching(nl, nr, adj):           # s → 왼쪽 → 오른쪽 → t, 용량 1
    s, t = nl + nr, nl + nr + 1
    cap, g = defaultdict(int), defaultdict(set)
    def add(u, v):
        cap[u, v] += 1; g[u].add(v); g[v].add(u)
    for u in range(nl):
        add(s, u)
        for v in adj[u]:
            add(u, nl + v)
    for v in range(nr):
        add(nl + v, t)
    def push(v, seen):                    # 잔여 그래프에서 t까지 1 보내기
        if v == t:
            return True
        seen.add(v)
        for w in g[v]:
            if cap[v, w] > 0 and w not in seen and push(w, seen):
                cap[v, w] -= 1; cap[w, v] += 1
                return True
        return False
    total = 0
    while push(s, set()):
        total += 1
    return total

def brute_match(nl, adj, u=0, used=frozenset()):
    if u == nl:
        return 0
    best = brute_match(nl, adj, u + 1, used)          # u는 짝 없음
    for v in adj[u]:
        if v not in used:
            best = max(best, 1 + brute_match(nl, adj, u + 1, used | {v}))
    return best

def brute_cover(nl, nr, adj):             # 왼쪽+오른쪽 부분집합 전부
    edges = [(u, nl + v) for u in range(nl) for v in adj[u]]
    return min(bin(m).count("1") for m in range(1 << (nl + nr))
               if all(m >> a & 1 or m >> b & 1 for a, b in edges))

rng = random.Random(12)
for _ in range(500):
    nl, nr = rng.randint(1, 5), rng.randint(1, 5)
    p = rng.random()
    adj = [[v for v in range(nr) if rng.random() < p] for _ in range(nl)]
    size, match_r = kuhn(nl, nr, adj)
    left, right = konig_cover(nl, nr, adj, match_r)
    covered = all(u in left or v in right for u in range(nl) for v in adj[u])
    assert size == brute_match(nl, adj) == flow_matching(nl, nr, adj)
    assert covered and len(left) + len(right) == size
    assert size == brute_cover(nl, nr, adj)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 자주 하는 실수와 변형
- `seen`을 왼쪽 정점마다 새로 만들지 않으면 앞 탐색의 흔적 때문에 있는 증가 경로를 놓친다. 반대로 한 탐색 안에서 `seen`이 없으면 같은 일을 계속 물어 무한 재귀에 빠질 수 있다.
- 일반 그래프(홀수 사이클이 있는 그래프)에는 이 방법이 통하지 않는다. 에드몬즈의 꽃 알고리즘(blossom algorithm)이 필요하다.
- **최대 독립 집합**: 이분 그래프에서 서로 이웃하지 않는 정점의 최대 개수는 V − 최대 매칭이다. 최소 정점 덮개의 여집합이기 때문이다.
- **DAG의 최소 경로 덮개**: 정점을 "나가는 쪽"과 "들어오는 쪽"으로 복제한 이분 그래프의 최대 매칭을 M이라 하면 V − M이다.
- **행·열 지우기**: 격자의 돌을 "행 하나 전체" 또는 "열 하나 전체" 단위로 치울 때 최소 횟수는, 행·열을 정점으로 돌을 간선으로 본 최소 정점 덮개, 곧 최대 매칭이다.
- **홀의 조건**: 왼쪽이 모두 짝을 가지려면 왼쪽의 어떤 부분집합 X도 이웃 수가 ∣X∣ 이상이어야 한다. 비둘기집 원리의 역방향 같은 조건이다.
- 간선에 비용이 붙으면 13편의 최소 비용 유량이나 헝가리안 알고리즘으로 넘어간다.

## 복잡도
| 방법 | 시간 | 비고 |
|---|---|---|
| 되추적 | 지수 | 정의 그대로 |
| 쿤 | O(VE) | 짧고 실전에서 빠름 |
| 호프크로프트-카프 | O(E√V) | 단계 O(√V)번 |
| 쾨니그 덮개 | O(V + E) | 매칭 뒤 탐색 한 번 |

공간은 인접 리스트와 짝 배열로 O(V + E)다.

## 어디에 쓰이나
- 이산수학 1편 「집합과 함수: 수학의 기본 언어」: 매칭은 왼쪽의 부분집합에서 오른쪽으로 가는 단사 함수이고, 완전 매칭은 전단사 함수다.
- 이산수학 7편 「비둘기집 원리와 포함·배제의 원리」: 이웃 수가 ∣X∣보다 적으면 비둘기집 원리로 두 정점이 같은 짝을 원하게 되며, 홀의 조건은 이것이 유일한 장애임을 말한다.
- 배정 문제: 수강 신청 배정, 근무표 짜기, 작업자와 기계 배정처럼 "한 쪽 하나에 다른 쪽 하나"인 제약은 모두 이분 매칭이다.
- 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」: 쾨니그 정리는 단위 용량 네트워크에서 최대 유량 최소 컷 정리의 특수한 경우다.

## 정리
- 매칭은 증가 경로를 뒤집을 때마다 1 커지고, 증가 경로가 없으면 최대다(베르주 정리).
- 쿤 알고리즘은 짝을 재귀로 밀어내는 DFS로 왼쪽 정점마다 한 번 탐색해 O(VE)에 끝난다.
- 호프크로프트-카프는 최단 증가 경로를 단계마다 한꺼번에 뒤집어 O(E√V)다.
- 이분 그래프에서는 최소 정점 덮개 = 최대 매칭이고, 교대 탐색 한 번으로 덮개를 만든다.

## 더 알아보기
- 이전 글: 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」
- 다음 글: 13편 「최소 비용 최대 유량: 유량에 가격 붙이기」
- 베르주 정리(위키백과 영어판): https://en.wikipedia.org/wiki/Berge%27s_theorem
