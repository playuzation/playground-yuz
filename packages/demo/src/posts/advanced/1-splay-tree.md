# [심화 알고리즘 1/14] 스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리

> **한 줄 요약** — 스플레이 트리는 균형 정보 없이 접근한 노드를 zig·zig-zig·zig-zag 회전으로 뿌리까지 올리기만 하는데도, 퍼텐셜 Σ log(서브트리 크기)로 따지면 연산마다 분할 상환 O(log n)이고 자주 찾는 키일수록 싸진다.

## 이 글에서 다루는 것
- 회전 복습과 스플레이의 세 경우: zig, zig-zig, zig-zag
- 찾기·삽입·삭제 구현과 정렬 리스트 대조
- 회전 수 세기: 단순히 뿌리로 올리기와 비교
- 분할 상환 O(log n)의 퍼텐셜 스케치와 구간 뒤집기 맛보기

## 예제 문제: 자주 찾는 키가 몰릴 때
정수 집합에 삽입·삭제·찾기가 섞여 들어오는데, 캐시 조회처럼 찾기가 몇몇 인기 키에 몰린다. 정렬 리스트는 삽입·삭제가 O(n)이고, 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」의 트립은 인기 키도 똑같이 깊은 곳에 둔다. 방금 찾은 키를 뿌리 근처로 옮겨 두면 다음 번은 더 싸다.

**스플레이 트리**(splay tree)가 그 생각이다. 1985년 슬리터(Daniel Sleator)와 타잔(Robert Tarjan)이 발표했고, 균형 정보 없이 접근한 노드를 **스플레이**(splay)해 뿌리로 올린다.

## 회전과 세 가지 경우
**회전**(rotation)은 부모와 자식의 위아래를 바꾸면서 중위 순서를 지키는 연산이다.
```text
      p                x
     / \              / \
    x   C     →      A   p
   / \                  / \
  A   B                B   C
중위 순서 A x B p C는 그대로
```
x를 올릴 때 부모 p와 조부모 g의 모양으로 세 경우를 나눈다. p가 뿌리면 x를 한 번 돌린다(zig). g, p, x가 꺾여 있으면 x를 두 번 돌린다(zig-zag). g, p, x가 같은 방향이면 **p를 먼저**, 그다음 x를 돌린다(zig-zig). 핵심은 zig-zig다. 같은 방향 사슬에서 부모를 먼저 돌리면 x가 올라가는 동안 경로 위 노드들의 깊이가 대략 절반으로 준다. x만 계속 돌리는 "단순히 뿌리로 올리기"(move-to-root)는 이 효과가 없다.

## 구현: 접근할 때마다 스플레이
찾기는 BST처럼 내려간 뒤 찾은 노드(없으면 마지막으로 본 노드)를 스플레이한다. 없는 키를 찾고 나면 뿌리가 그 키의 바로 앞이나 뒤 키라, 삽입은 새 노드를 그 위에 얹으면 된다. 삭제는 뿌리로 올린 뒤 왼쪽 서브트리의 최댓값을 스플레이해 빈 오른쪽에 오른쪽 서브트리를 붙인다. `rev`는 뒤의 구간 뒤집기용이다.
```python
import random

class Node:
    __slots__ = ("key", "l", "r", "p", "size", "rev")
    def __init__(self, key):
        self.key, self.l, self.r, self.p = key, None, None, None
        self.size, self.rev = 1, False

def sz(t): return t.size if t else 0
def pull(t): t.size = 1 + sz(t.l) + sz(t.r)

def push(t):                       # 미룬 뒤집기를 자식에게 넘긴다
    if t.rev:
        t.l, t.r, t.rev = t.r, t.l, False
        for c in (t.l, t.r):
            if c: c.rev = not c.rev

ROT = [0]                          # 회전 횟수

def rotate(x):                     # x를 부모 p 위로 올린다
    p, g = x.p, x.p.p
    if p.l is x: b, p.l, x.r = x.r, x.r, p
    else: b, p.r, x.l = x.l, x.l, p
    if b: b.p = p
    p.p, x.p = x, g
    if g:
        if g.l is p: g.l = x
        else: g.r = x
    pull(p); pull(x); ROT[0] += 1

def splay(x, goal=None, simple=False):   # x를 goal의 자식으로
    while x.p is not goal:
        p = x.p; g = p.p
        if g is not goal and not simple:   # zig-zig는 부모 먼저
            rotate(p if (g.l is p) == (p.l is x) else x)
        rotate(x)
    return x

def inorder(t):
    out, st = [], []
    while st or t:
        while t: push(t); st.append(t); t = t.l
        t = st.pop(); out.append(t.key); t = t.r
    return out

class SplaySet:
    def __init__(self, simple=False):
        self.root, self.simple = None, simple

    def contains(self, key):
        t = last = self.root
        while t and t.key != key:
            last = t
            t = t.l if key < t.key else t.r
        last = t or last
        if last: self.root = splay(last, None, self.simple)
        return t is not None

    def insert(self, key):
        if self.contains(key): return
        x, t = Node(key), self.root    # t = 바로 앞이나 뒤 키
        if t:
            if key < t.key: x.l, t.l, x.r = t.l, None, t
            else: x.r, t.r, x.l = t.r, None, t
            for c in (x.l, x.r):
                if c: c.p = x
            pull(t); pull(x)
        self.root = x

    def erase(self, key):
        if not self.contains(key): return
        L, R = self.root.l, self.root.r
        for c in (L, R):
            if c: c.p = None
        if L:
            while L.r: L = L.r
            L = splay(L)           # 오른쪽이 빈다
            L.r = R
            if R: R.p = L
            pull(L)
        self.root = L or R

s = SplaySet()
for x in [50, 20, 80, 10, 65, 30]: s.insert(x)
s.contains(65); print("65를 찾은 뒤 뿌리", s.root.key)
s.erase(50); print(inorder(s.root), "뿌리", s.root.key)
```
```text
65를 찾은 뒤 뿌리 65
[10, 20, 30, 65, 80] 뿌리 30
```
## 무작위 대조 검사
앞 코드에 이어서, 키를 0~19로 좁혀 중복 삽입과 없는 키 삭제를 자주 일으키며 정렬 리스트와 비교한다.
```python
import bisect

rng, ok = random.Random(1), 0
for _ in range(500):
    s, ref, same = SplaySet(), [], True
    for _ in range(60):
        op, x = rng.randrange(3), rng.randrange(20)
        i = bisect.bisect_left(ref, x)
        has = i < len(ref) and ref[i] == x
        if op == 0:
            s.insert(x)
            if not has: ref.insert(i, x)
        elif op == 1:
            s.erase(x)
            if has: ref.pop(i)
        else:
            same &= s.contains(x) == has
    ok += same and inorder(s.root) == ref and sz(s.root) == len(ref)
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 회전 수 세기
앞 코드에 이어서, 0~999를 순서대로 넣어 깊이 999인 왼쪽 사슬을 만든 뒤 차례로 세 바퀴, 무작위로, 키 7만 반복해 찾으며 단순히 올리기(`simple=True`)와 연산당 회전 수를 비교한다.
```python
def pattern(simple, n=1000):
    s, rng, out = SplaySet(simple), random.Random(7), []
    for x in range(n): s.insert(x)          # 왼쪽 사슬
    for keys in (list(range(n)) * 3,
                 [rng.randrange(n) for _ in range(3 * n)]):
        ROT[0] = 0
        for x in keys: s.contains(x)
        out.append(ROT[0] / len(keys))
    s.contains(7); ROT[0] = 0
    for _ in range(n): s.contains(7)
    return out + [ROT[0] / n]

print("스플레이    단순  패턴")
names = ["순차 접근 3바퀴", "무작위 접근", "같은 키 반복"]
for name, a, b in zip(names, pattern(False), pattern(True)):
    print(f"{a:8.1f}{b:8.1f}  {name}")
```
```text
스플레이    단순  패턴
     4.4   500.5  순차 접근 3바퀴
    11.8    12.3  무작위 접근
     0.0     0.0  같은 키 반복
```
단순한 방법은 순차 접근에서 키마다 평균 500번, 즉 Θ(n)을 돈다. 사슬이 줄지 않기 때문이다. 스플레이는 첫 바퀴에 사슬을 접어 평균 4.4번이다. 순차 접근 전체가 O(n)이라는 **순차 접근 정리**는 타잔이 1985년에 따로 증명했다. 무작위 접근은 둘 다 log₂ 1000 ≈ 10 근처이고, 같은 키를 반복하면 첫 접근 뒤로 회전이 없다.

## 분할 상환 O(log n): 퍼텐셜 스케치
한 번의 접근은 최악 O(n)이지만 m번의 합은 O((m + n) log n)이다. 서브트리 크기로 **랭크**(rank)를 정하고 그 합을 퍼텐셜로 둔다.
```text
r(v) = log₂ size(v),  Φ = Σ r(v)
상각 비용 = 실제 회전 수 + ΔΦ
zig-zig, zig-zag 한 단계
  ≤ 3(r′(x) − r(x))
zig(마지막 한 번)
  ≤ 3(r′(x) − r(x)) + 1
스플레이 전체 ≤ 3(r(뿌리) − r(x)) + 1
            ≤ 3·log₂ n + 1
```
단계별 증가분은 망원 합으로 지워지고 +1은 마지막 zig에서만 붙는다. 부모를 먼저 돌려야 회전 두 번의 비용을 x의 랭크 증가가 갚는다(핵심은 오목성 log a + log b ≤ 2·log(a + b) − 2). 단순히 올리기는 단계마다 +1이 남는다. 0 ≤ Φ ≤ n·log₂ n이라 실제 총비용은 상각 합 + n·log₂ n 이하다.

## 맛보기: 위치를 키로 삼아 구간 뒤집기
키 대신 왼쪽 서브트리 크기로 위치를 찾으면 스플레이 트리는 수열이 된다(8편의 암시적 트립과 같은 발상). 보초를 양 끝에 두고 a[l−1]을 뿌리로, a[r+1]을 그 오른쪽 자식으로 스플레이하면 남은 왼쪽 서브트리가 a[l..r]이다. 거기에 **느리게 뒤집기 플래그**만 켜고 실제 교환은 지나갈 때(`push`) 한다. 앞 코드에 이어서 실행한다.
```python
class SplaySeq:                    # 키 대신 위치로 찾는다
    def __init__(self, a):
        nodes = [Node(x) for x in [None, *a, None]]   # 양 끝 보초
        def build(lo, hi, par):
            if lo >= hi: return None
            m = (lo + hi) // 2; t = nodes[m]; t.p = par
            t.l, t.r = build(lo, m, t), build(m + 1, hi, t)
            pull(t); return t
        self.root = build(0, len(nodes), None)

    def kth(self, k):              # 보초 포함 k번째 노드(0부터)
        t = self.root
        while True:
            push(t)
            if k == sz(t.l): return t
            if k < sz(t.l): t = t.l
            else: k -= sz(t.l) + 1; t = t.r

    def reverse(self, l, r):       # a[l..r] 뒤집기
        self.root = splay(self.kth(l))     # a[l−1] 자리(보초 포함)
        splay(self.kth(r + 2), self.root)  # a[r+1]을 뿌리 오른쪽에
        mid = self.root.r.l                # 그 왼쪽 = a[l..r]
        mid.rev = not mid.rev

rng, ok = random.Random(3), 0
for _ in range(300):
    n = rng.randint(1, 30)
    ref = list(range(n)); sq = SplaySeq(ref)
    for _ in range(40):
        l = rng.randrange(n); r = rng.randrange(l, n)
        sq.reverse(l, r); ref[l:r + 1] = ref[l:r + 1][::-1]
    ok += inorder(sq.root)[1:-1] == ref
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```
뒤집기 한 번이 분할 상환 O(log n)이고, 구간 합 같은 레이지 값도 같은 틀에 얹는다.

## 자주 하는 실수와 변형
- 못 찾았을 때 스플레이를 빼먹으면 깊은 경로를 공짜로 반복해 걷게 되어 분할 상환 보장이 깨진다.
- zig-zig에서 x를 먼저 돌리면 답은 맞아 대조 검사로는 안 잡힌다. 회전 수를 세야 드러난다.
- 내려가며 `push`를 빼먹으면 좌우가 바뀐 채로 크기를 읽는다. 재귀로 짜면 사슬에서 재귀 한도를 넘는다.

## 복잡도
| 연산 | 스플레이 트리 | 정렬 리스트 |
|---|---|---|
| 찾기 | 분할 상환 O(log n) | O(log n) |
| 삽입·삭제 | 분할 상환 O(log n) | O(n) |
| 구간 뒤집기 | 분할 상환 O(log n) | O(n) |

- 근거는 스플레이 한 번의 상각 비용 3·log₂ n + 1이다(한 연산의 최악은 O(n)). 공간은 O(n)이다.
- 키 i의 접근 비율이 pᵢ면 총비용이 O(m·(1 + Σ pᵢ log(1/pᵢ)))로 최적 정적 BST와 상수배다(정적 최적성 정리). 모든 접근 순서에서 최선의 BST와 상수배라는 **동적 최적성 추측**은 아직 미해결이다.

## 어디에 쓰이나
- 2편 「링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의」: 트리의 경로 하나를 위치 순서로 든 스플레이 트리가 링크-컷 트리의 부품이고, 이 글의 `splay`와 뒤집기 플래그가 그대로 쓰인다.
- 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」: 최근에 쓴 것을 앞에 두는 LRU처럼, 스플레이 트리는 최근에 찾은 키를 뿌리 근처에 두는 탐색 트리 판 캐시다.

## 정리
- 접근한 노드를 zig·zig-zig·zig-zag로 뿌리까지 올리는 것이 전부다.
- zig-zig에서 부모를 먼저 돌려야 한다. 사슬의 순차 접근이 키당 4.4회로, 단순히 올리기의 500회와 달랐다.
- 퍼텐셜 Σ log₂ size로 스플레이 한 번의 상각 비용이 3·log₂ n + 1 이하다.
- 위치를 키로 삼고 뒤집기 플래그를 얹은 수열이 다음 글의 부품이다.

## 더 알아보기
- 다음 글: 2편 「링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의」
- 위키백과 Splay tree: https://en.wikipedia.org/wiki/Splay_tree

## 시리즈 안내
1. **스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리** ← 지금 읽는 글
2. 링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의
3. 웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에
4. 병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기
5. 오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드
6. 슬로프 트릭: 볼록 조각 선형 함수를 힙으로 다루기
7. Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화
8. 접미사 오토마톤: 모든 부분 문자열을 받아들이는 가장 작은 자동자
9. 헝가리안 알고리즘: 할당 문제를 O(n³)에
10. 일반 그래프 매칭: 에드몬즈의 꽃 알고리즘
11. 지배자 트리: 반드시 거쳐 가는 정점 찾기
12. 전역 최소 컷: 스토어-바그너와 카거의 무작위 축약
13. 선형 점화식: 벌레캄프-매시와 키타마사
14. 선형 계획법과 심플렉스: 부등식 제약 아래 최적화

먼저 읽으면 좋은 글: 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」, 고급 자료 구조 2편 「유니온 파인드: 경로 압축과 랭크」, 알고리즘 기법 8편 「분할 정복: 나누고 풀고 합치기」, 동적 계획법 10편 「볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기」.
