# [고급 자료 구조 2/12] 유니온 파인드: 경로 압축과 랭크

> **한 줄 요약** — 유니온 파인드는 집합마다 "대표를 향해 부모를 가리키는 트리"를 두어 합치기와 같은 집합인지 묻기를 처리하며, 낮은 트리를 높은 트리 밑에 다는 랭크와 지나온 길을 루트에 바로 잇는 경로 압축을 함께 쓰면 연산 하나가 사실상 상수 시간이 된다.

## 이 글에서 다루는 것
- 합치기와 "같은 집합인가" 질의가 섞인 문제
- 서로소 집합 숲: 부모 포인터와 대표
- 랭크로 높이를 log n 이하로, 경로 압축으로 길을 줄이기
- 연결 요소·사이클 판정과 무작위 대조 검사
- 롤백 가능한 유니온 파인드와 변형 유형

## 문제: 친구의 친구는 같은 무리
n명이 있고 "a와 b가 친구가 됐다"(합치기)와 "a와 b가 같은 무리인가"(질의)가 섞여 들어온다. 친구의 친구도 같은 무리다. 그래프로 보면 간선 추가와 연결성 질의다(이산수학 8편 「그래프의 기초: 정점과 간선」의 연결 요소). 단순한 방법은 두 가지다. 질의마다 BFS를 하면 질의 하나에 O(n + m)이고, 사람마다 무리 번호를 적어 두면 질의는 O(1)이지만 합칠 때 한쪽 번호를 전부 고쳐야 해서 O(n)이다. n과 연산 수가 10⁵이면 둘 다 10¹⁰ 근처다. 무리는 수학으로 말하면 동치류이고, 동치류를 합치고 찾는 자료 구조를 **유니온 파인드**(union-find) 또는 서로소 집합(disjoint set) 자료 구조라고 한다.

## 서로소 집합 숲
집합마다 트리를 하나 두고, 각 원소는 부모 하나만 기억한다. 루트가 그 집합의 대표다. `find(x)`는 부모를 따라 루트까지 올라가고, `union(a, b)`는 두 루트 중 하나를 다른 쪽 밑에 단다. 두 원소가 같은 집합인지는 `find` 결과가 같은지로 안다. 1964년 버나드 갤러(Bernard Galler)와 마이클 피셔(Michael Fischer)가 포트란 컴파일러의 EQUIVALENCE 선언(여러 변수가 같은 기억 장소를 쓰게 하는 선언)에서 동치류를 찾으려고 내놓은 트리 구조가 이것이다. 문제는 높이다. 아무렇게나 달면 트리가 사슬이 되어 `find`가 O(n)이 된다.
```text
union(0,1), union(0,2), union(0,3) …

아무렇게나: 0 → 1 → 2 → 3 → …
랭크 사용:  0 → 1 ← 2
                ↑
                3 …
```

## 두 가지 개선: 랭크와 경로 압축
- **랭크**(rank)에 의한 합치기: 루트마다 높이의 상한 rank를 두고 낮은 쪽을 높은 쪽 밑에 단다. 같으면 아무 쪽이나 달고 rank를 1 올린다. rank가 r + 1이 되는 것은 rank r 트리 둘이 합쳐질 때뿐이므로, 귀납법으로 rank r 루트의 트리에는 원소가 2ʳ개 이상 있다. 따라서 rank ≤ log₂ n이고 `find`는 O(log n)이다. 크기(size)로 비교해도 같은 보장이 나온다.
- **경로 압축**(path compression): `find`가 지나온 모든 칸의 부모를 루트로 바꾼다. 다음에 같은 길을 가면 한 번에 도착한다.

둘을 함께 쓰면 연산 m번이 `O(m·α(n))`이다. α는 아커만 함수의 역함수로, 현실에서 쓸 수 있는 어떤 n에서도 5보다 작다. 1973년 홉크로프트와 울먼이 `log* n` 상한을 보였고, 1975년 로버트 타잔(Robert Tarjan)이 α 상한을 증명하고 이 방법으로는 그보다 나을 수 없음도 보였다. 경로 압축 뒤 rank는 정확한 높이가 아니라 상한일 뿐이지만 증명에는 상한이면 충분하다. 재귀 `find`는 짧지만 파이썬 재귀 한도(기본 1,000)에 걸릴 수 있어서, 아래 코드는 루트를 찾는 반복과 다시 걸으며 잇는 반복 두 번으로 짰다.
```python
import random
from collections import deque

class DSU:
    def __init__(self, n):
        self.parent = list(range(n))      # 처음엔 모두 자기 자신이 대표
        self.rank = [0] * n               # 높이의 상한
        self.size = [1] * n
        self.groups = n

    def find(self, x):
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:     # 경로 압축: 지나온 칸을 루트에 직결
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return False                  # 이미 같은 집합: 이 간선은 사이클
        if self.rank[a] < self.rank[b]:
            a, b = b, a                   # 낮은 트리를 높은 트리 밑에
        self.parent[b] = a
        self.size[a] += self.size[b]
        if self.rank[a] == self.rank[b]:
            self.rank[a] += 1
        self.groups -= 1
        return True

def connected(adj, s, t):                 # 정의 그대로: BFS로 도달 확인
    seen, q = {s}, deque([s])
    while q:
        v = q.popleft()
        for w in adj[v]:
            if w not in seen:
                seen.add(w)
                q.append(w)
    return t in seen

rng = random.Random(5)
for _ in range(500):
    n = rng.randint(1, 15)
    d, adj = DSU(n), [[] for _ in range(n)]
    for _ in range(30):
        a, b = rng.randrange(n), rng.randrange(n)
        if rng.random() < 0.5:
            assert d.union(a, b) == (not connected(adj, a, b))
            adj[a].append(b)
            adj[b].append(a)
        else:
            assert (d.find(a) == d.find(b)) == connected(adj, a, b)
    assert d.size[d.find(0)] == sum(connected(adj, 0, v) for v in range(n))
    reps = {min(w for w in range(n) if connected(adj, v, w)) for v in range(n)}
    assert d.groups == len(reps)          # 연결 요소 개수
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
질의마다 BFS를 하는 정의 그대로의 방법과 비교했다. `union`의 반환값(새로 합쳐졌는가), 같은 집합 여부, 집합 크기, 연결 요소 수가 무작위 500개 경우에서 모두 같다.

## 실험: 개선이 얼마나 듣나
두 개선을 켜고 끄며 부모 포인터를 따라간 횟수를 센다. n = 2,000이고, 사슬형은 `union(0, i)`를 차례로 한 뒤 모든 원소를 질의하고, 무작위형은 무작위 쌍 4,000개를 합친다.
```python
import random

def total_steps(n, ops, by_rank, compress):
    parent, rank, steps = list(range(n)), [0] * n, 0

    def find(x):
        nonlocal steps
        root = x
        while parent[root] != root:
            root = parent[root]
            steps += 1                    # 부모 포인터를 한 번 따라감
        while compress and parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    for a, b in ops:
        a, b = find(a), find(b)
        if a == b:
            continue
        if by_rank and rank[a] > rank[b]:
            a, b = b, a
        parent[a] = b                     # a의 트리를 b 밑에 단다
        if by_rank and rank[a] == rank[b]:
            rank[b] += 1
    return steps

n, rng = 2000, random.Random(6)
chain = [(0, i) for i in range(1, n)] + [(i, 0) for i in range(n)]
rand = [(rng.randrange(n), rng.randrange(n)) for _ in range(2 * n)]
print("   사슬형   무작위  방식")
for name, r, c in [("아무렇게나", 0, 0), ("랭크만", 1, 0),
                   ("압축만", 0, 1), ("랭크+압축", 1, 1)]:
    a, b = total_steps(n, chain, r, c), total_steps(n, rand, r, c)
    print(f"{a:9} {b:8}  {name}")
```
```text
   사슬형   무작위  방식
  7994001   857172  아무렇게나
     5997    11096  랭크만
     9992    16260  압축만
     5997     6974  랭크+압축
```
아무렇게나 달면 사슬형에서 약 800만 번으로 n²에 비례한다. 랭크만 써도 사슬이 생기지 않고, 압축만 써도 한 번 걸은 길은 짧아진다. 둘을 함께 쓰면 무작위형에서 연산당 2번이 채 안 된다(6,974 / 4,000 ≈ 1.7).

## 연결 요소와 사이클 판정
`union`이 `False`를 돌려주면 두 끝점이 이미 연결되어 있으므로 그 간선은 사이클을 닫는다. 무방향 그래프의 사이클 판정, 간선을 더하며 연결 요소 수 세기가 이것으로 끝난다. 앞 코드의 `DSU`에 이어서 작은 예를 본다.
```python
d = DSU(6)
for a, b in [(0, 1), (1, 2), (3, 4), (2, 0), (4, 5), (5, 3)]:
    if not d.union(a, b):
        print("사이클을 만드는 간선:", (a, b))
print("연결 요소:", d.groups, " 0이 속한 집합 크기:", d.size[d.find(0)])
```
```text
사이클을 만드는 간선: (2, 0)
사이클을 만드는 간선: (5, 3)
연결 요소: 2  0이 속한 집합 크기: 3
```
크루스칼 알고리즘은 간선을 가벼운 순서로 보며 이 판정을 통과하는 간선만 고른다(그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」).

## 롤백과 변형 유형
- 롤백 가능한 유니온 파인드: 경로 압축을 빼고 랭크만 쓰면 `union` 한 번이 바꾸는 칸은 parent 하나와 rank 하나뿐이다. 바꾼 내용을 스택에 쌓아 두면 최근 `union`부터 되돌릴 수 있고 `find`는 O(log n)이다. 간선이 추가·삭제되는 연결성 질의를 오프라인으로 풀 때 쓴다. 경로 압축은 바꾸는 칸이 많아 함께 쓰지 않는다.
- 가중치 유니온 파인드: 칸마다 "부모와의 차이"를 저장하면 "b는 a보다 w 무겁다" 같은 상대 정보를 합치고 모순을 찾는다. 차이를 2로 나눈 나머지로 두면 이분 그래프 판정이 된다.
- 삭제만 있는 문제: 질의를 거꾸로 처리하면 삭제가 추가가 된다.
- 흔한 실수: 루트를 찾지 않고 `parent[a] = b`로 잇기, 같은 집합인지를 `parent[a] == parent[b]`로 비교하기. 둘 다 루트가 아닌 칸에서 틀린다.

## 복잡도
| 방식 | find 한 번 |
|---|---|
| 아무렇게나 | O(n) |
| 랭크(크기)만 | O(log n) |
| 경로 압축만 | 분할 상환 O(log n) |
| 랭크 + 압축 | 분할 상환 O(α(n)) |

- 공간은 배열 두세 개로 O(n)이다. 질의마다 BFS는 O(n + m), 무리 번호 다시 쓰기는 합칠 때마다 O(n)이다.

## 어디에 쓰이나
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: 유니온 파인드가 유지하는 집합들은 합친 쌍들이 만드는 동치 관계의 동치류이고, 추이성 때문에 친구의 친구가 저절로 같은 무리가 된다.
- 트랜지스터에서 자연어까지 11편 「프로그래밍 언어의 진화: 포트란에서 파이썬까지」: 이 자료 구조의 출발점이 포트란 컴파일러가 EQUIVALENCE 선언으로 묶인 변수들에 기억 장소를 배정하는 문제였다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 크루스칼은 정렬한 간선마다 `union`이 성공하는지만 보면 되므로 정렬 비용 O(E log E)가 전체를 지배한다.

## 정리
- 유니온 파인드는 집합마다 부모 포인터 트리를 두고 루트를 대표로 삼아 합치기와 같은 집합 질의를 처리한다.
- 랭크로 낮은 트리를 높은 트리 밑에 달면 높이가 log₂ n 이하로 묶인다.
- 경로 압축까지 더하면 연산당 분할 상환 O(α(n)), 실험에서도 연산당 포인터 이동이 2번 미만이었다.
- `union`이 실패하면 사이클이고, 압축을 빼면 되돌리기도 가능하다.

## 더 알아보기
- 이전 글: 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」
- 다음 글: 3편 「세그먼트 트리: 구간 질의와 점 갱신」
- 위키백과(영어) Disjoint-set data structure: https://en.wikipedia.org/wiki/Disjoint-set_data_structure
