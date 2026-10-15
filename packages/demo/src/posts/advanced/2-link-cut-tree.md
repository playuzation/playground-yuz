# [심화 알고리즘 2/14] 링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의

> **한 줄 요약** — 링크-컷 트리는 숲을 "선호 경로"들로 쪼개 경로마다 깊이 순서의 스플레이 트리에 담고, 뿌리에서 v까지를 한 경로로 만드는 access 연산 하나로 간선 잇기·끊기·뿌리 바꾸기·경로 합을 모두 분할 상환 O(log n)에 처리한다.

## 이 글에서 다루는 것
- 동적 숲 문제와, 정적 트리용인 HLD로는 안 되는 이유
- 선호 경로 분해와 경로 부모 포인터, access 연산
- 뿌리 바꾸기(evert)를 1편의 뒤집기 플래그로 하기
- BFS로 경로를 찾는 느린 구현과 무작위 대조, 회전 수 실험

## 예제 문제: 붙고 끊기는 숲
정점 n개에 값이 있고 처음에는 간선이 없다. 다음 연산이 섞여 들어온다.
- `link(u, v)`: 서로 다른 트리에 있는 u와 v를 간선으로 잇는다.
- `cut(u, v)`: 간선 u–v를 끊는다.
- `path_sum(u, v)`: u에서 v까지 경로 위 정점 값의 합. 다른 트리면 "연결 안 됨".
- `set_val(x, w)`: 정점 값 바꾸기.

단순한 방법은 인접 리스트를 들고 질의마다 BFS로 경로를 찾는 것으로, 질의 하나가 O(n)이다. 고급 자료 구조 11편 「오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기」의 HLD는 경로 질의를 O(log² n)에 하지만 무거운 자식과 사슬을 미리 정해 두는 **정적** 트리용이다. 간선이 하나 끊기면 사슬 구조를 O(n)에 다시 만들어야 한다. 1983년 슬리터와 타잔이 「A Data Structure for Dynamic Trees」에서 내놓은 **링크-컷 트리**(link-cut tree)는 사슬을 고정하지 않고 질의에 맞춰 계속 바꾼다.

## 아이디어: 선호 경로마다 스플레이 트리 하나
각 정점은 자식 중 많아야 하나를 **선호 자식**(preferred child)으로 고른다. 선호 간선만 남기면 숲이 수직 경로들로 쪼개진다. 경로 하나를 1편의 스플레이 트리에 깊이 순서로(중위 순서 = 위에서 아래) 담는다. 그리고 각 스플레이 트리의 뿌리에 그 경로 맨 위 정점의 실제 부모를 **경로 부모**(path-parent)로 적는다. 코드에서는 경로 부모도 `p[x]`에 넣되, 부모의 자식 칸에는 x가 없다. 그래서 "x가 스플레이 트리의 뿌리인가"는 부모의 두 자식 칸에 x가 없는지로 판정한다(`isroot`).
```text
    1      선호 경로 3개
   / \     1─2─4
  2   3    3 (경로 부모 1)
 / \       5 (경로 부모 2)
4   5
access(5) 뒤
  1─2─5, 4 (부모 2), 3 (부모 1)
```
**access** 연산 `access(x)`는 뿌리부터 x까지를 한 선호 경로로 만들고 x 아래의 선호 간선은 끊는다. x를 자기 스플레이 트리에서 스플레이하고 오른쪽(더 깊은 쪽)을 떼어 낸 뒤, 경로 부모 y로 올라가 y를 스플레이하고 y의 오른쪽 자식을 방금 올라온 트리로 바꾸기를 뿌리까지 반복한다. 끝나면 x의 스플레이 트리가 정확히 뿌리~x 경로이고, x의 집계값이 그 경로의 합이다.

나머지는 모두 access로 만든다.
- `evert(x)`: access(x) 뒤 그 경로를 뒤집으면 깊이 순서가 반대가 되어 x가 맨 위, 곧 트리의 뿌리가 된다. 1편의 느리게 뒤집기 플래그를 x에 켜기만 하면 된다.
- `path_sum(u, v)`: evert(u), access(v) 하면 v의 스플레이 트리가 u–v 경로다.
- `link(u, v)`: evert(u)로 u를 뿌리로 만든 뒤 경로 부모를 v로 둔다.
- `cut(u, v)`: evert(u), access(v) 하면 경로가 u, v 두 정점뿐이라 u는 v의 왼쪽 자식이다. 그 칸을 비운다.
- `find_root(x)`: access(x) 뒤 가장 왼쪽(가장 얕은) 정점이 뿌리다.

## 구현
정점은 1..n, 0은 빈 자리이고 `sum[0] = 0`이라 경계 검사가 필요 없다. `splay`는 위에서부터 뒤집기 플래그를 먼저 내린 뒤 1편과 같은 zig·zig-zig·zig-zag를 한다.
```python
import random
from collections import deque

class LinkCut:
    def __init__(self, vals):              # 정점 1..n
        n = len(vals)
        self.ch = [[0, 0] for _ in range(n + 1)]
        self.p = [0] * (n + 1)              # 스플레이 부모 또는 경로 부모
        self.rev = [False] * (n + 1)
        self.val = [0] + list(vals)
        self.sum = self.val[:]              # 경로 토막의 합
        self.rot = 0

    def isroot(self, x):
        q = self.p[x]
        return q == 0 or x not in self.ch[q]

    def pull(self, x):
        l, r = self.ch[x]
        self.sum[x] = self.sum[l] + self.val[x] + self.sum[r]

    def push(self, x):
        if self.rev[x]:
            c = self.ch[x]
            c[0], c[1] = c[1], c[0]
            for y in c:
                if y: self.rev[y] = not self.rev[y]
            self.rev[x] = False

    def rotate(self, x):
        p, ch = self.p, self.ch
        y = p[x]; z = p[y]; d = int(ch[y][1] == x)
        if not self.isroot(y): ch[z][ch[z][1] == y] = x
        p[x] = z
        b = ch[x][1 - d]; ch[y][d] = b
        if b: p[b] = y
        ch[x][1 - d] = y; p[y] = x
        self.pull(y); self.pull(x); self.rot += 1

    def splay(self, x):
        st = [x]                            # 위에서부터 플래그를 내린다
        while not self.isroot(st[-1]): st.append(self.p[st[-1]])
        for y in reversed(st): self.push(y)
        ch, p = self.ch, self.p
        while not self.isroot(x):
            y = p[x]; z = p[y]
            if not self.isroot(y):
                same = (ch[y][0] == x) == (ch[z][0] == y)
                self.rotate(y if same else x)
            self.rotate(x)

    def access(self, x):                    # 뿌리~x를 한 선호 경로로
        last, y = 0, x
        while y:
            self.splay(y)
            self.ch[y][1] = last            # 선호 자식 교체
            self.pull(y)
            last, y = y, self.p[y]
        self.splay(x)

    def evert(self, x):                     # x를 트리의 뿌리로
        self.access(x)
        self.rev[x] = not self.rev[x]

    def find_root(self, x):
        self.access(x)
        while True:
            self.push(x)
            if not self.ch[x][0]: break
            x = self.ch[x][0]
        self.splay(x)
        return x

    def link(self, u, v):                   # 다른 트리의 u, v를 잇기
        self.evert(u); self.p[u] = v

    def cut(self, u, v):                    # 간선 u–v 끊기
        self.evert(u); self.access(v)       # u = v의 왼쪽 자식
        self.ch[v][0] = self.p[u] = 0
        self.pull(v)

    def path_sum(self, u, v):
        self.evert(u); self.access(v)
        return self.sum[v]

    def set_val(self, x, w):
        self.access(x); self.val[x] = w; self.pull(x)

t = LinkCut([5, 1, 4, 2, 3])
for u, v in [(1, 2), (2, 3), (3, 4), (2, 5)]:
    t.link(u, v)
print(t.path_sum(4, 5), t.find_root(1) == t.find_root(4))
t.cut(2, 3)
print(t.find_root(1) == t.find_root(4), t.path_sum(1, 5))
```
```text
10 True
False 9
```
경로 4–3–2–5의 값은 2 + 4 + 1 + 3 = 10이고, 간선 2–3을 끊은 뒤 1과 4는 갈라졌으며 1–2–5의 합은 9다.

## 무작위 대조 검사
앞 코드에 이어서, 정점 10개 이하의 숲에서 잇기·끊기·값 바꾸기·경로 합 질의를 무작위로 섞는다. 정답은 인접 집합을 들고 매번 BFS로 경로를 찾는 느린 구현이다. 잇기는 다른 트리일 때만, 끊기는 실제 간선일 때만 한다.
```python
def slow_path(adj, u, v):                   # BFS로 u→v 경로, 없으면 None
    prev, q = {u: 0}, deque([u])
    while q:
        x = q.popleft()
        for y in adj[x]:
            if y not in prev:
                prev[y] = x; q.append(y)
    if v not in prev: return None
    path = [v]
    while path[-1] != u: path.append(prev[path[-1]])
    return path

rng, ok, asked = random.Random(2), 0, 0
for _ in range(400):
    n = rng.randint(1, 10)
    vals = [rng.randint(-5, 9) for _ in range(n)]
    t, adj, same = LinkCut(vals), {i: set() for i in range(1, n + 1)}, True
    for _ in range(50):
        op, u, v = rng.randrange(4), rng.randint(1, n), rng.randint(1, n)
        path = slow_path(adj, u, v)
        if op == 0 and path is None:
            t.link(u, v); adj[u].add(v); adj[v].add(u)
        elif op == 1 and path and len(path) == 2:
            t.cut(u, v); adj[u].remove(v); adj[v].remove(u)
        elif op == 2:
            w = rng.randint(-5, 9); t.set_val(u, w); vals[u - 1] = w
        else:
            asked += 1
            want = path and sum(vals[x - 1] for x in path)
            linked = t.find_root(u) == t.find_root(v)
            same &= (t.path_sum(u, v) if linked else None) == want
    ok += same
print(f"무작위 400개(질의 {asked}개) 비교: {ok}개 일치")
```
```text
무작위 400개(질의 11967개) 비교: 400개 일치
```
뿌리를 매번 바꾸는 evert와 끊었다 다시 잇기가 섞여도 경로 합과 연결 여부가 모두 맞았다.

## 왜 분할 상환 O(log n)인가
access 한 번의 비용은 (선호 자식 교체 횟수) × (스플레이 비용)처럼 보이지만 두 겹으로 갚는다.
- 교체 횟수: 서브트리가 부모 서브트리의 절반 이하인 간선을 **가벼운 간선**이라 하면, 뿌리~x 경로에 가벼운 간선은 log₂ n개 이하다(HLD와 같은 논리). 무거운 간선이 선호가 되려면 먼저 선호에서 빠져야 하고, 빠지는 것은 같은 부모의 가벼운 간선이 선호가 될 때(또는 access마다 한 번)뿐이다. 그래서 교체는 분할 상환 O(log n)번이다.
- 스플레이 비용: 모든 스플레이 트리를 경로 부모로 이은 큰 트리 하나에 1편의 퍼텐셜 Σ log(서브트리 크기)를 매기면, access 안의 스플레이들의 상각 비용이 망원 합으로 이어져 합이 3·log₂ n + (교체 횟수) 정도로 묶인다.

둘을 합치면 access, 따라서 모든 연산이 분할 상환 O(log n)이다. 앞 코드에 이어서, 길이 n인 경로에서 무작위 두 정점의 경로 합을 1만 번 묻고 질의당 회전 수를 센다.
```python
print("     n  회전/질의  경로 길이/질의")
for n in [1000, 4000, 16000]:
    rng, t = random.Random(n), LinkCut([1] * n)
    for i in range(1, n): t.link(i, i + 1)      # 길이 n인 경로
    t.rot, walk = 0, 0
    for _ in range(10000):
        u, v = rng.randint(1, n), rng.randint(1, n)
        assert t.path_sum(u, v) == abs(u - v) + 1
        walk += abs(u - v) + 1                  # 느린 방법이 걷는 정점 수
    print(f"{n:6} {t.rot / 10000:10.1f} {walk / 10000:14.1f}")
```
```text
     n  회전/질의  경로 길이/질의
  1000       23.3          333.3
  4000       29.5         1333.9
 16000       37.3         5285.5
```
n이 4배가 될 때 느린 방법이 걷는 경로는 4배로 늘지만 회전 수는 6~8회씩만 는다. 로그 증가다.

## 자주 하는 실수와 변형
- `isroot`를 "부모가 0인가"로 판정하면 경로 부모와 스플레이 부모가 섞여 트리가 망가진다.
- `splay` 전에 위에서부터 `push`하지 않으면 뒤집기 플래그가 남은 채로 회전해 좌우가 꼬인다.
- 간선 값: 간선마다 정점을 하나 새로 만들어 u–e–v로 이으면 정점 값 질의가 그대로 간선 질의가 된다.
- 경로 최댓값: `sum`을 (최댓값, 그 정점)으로 바꾸면 된다. 간선이 하나씩 추가될 때 최소 신장 숲을 유지하는 문제에서 "새 간선이 만드는 사이클의 가장 무거운 간선"을 찾는 데 쓴다.
- 서브트리 질의는 기본형으로 어렵다. 경로 부모로 매달린 가상 자식들의 합을 따로 들어야 한다.

## 복잡도
| 방법 | 경로 질의 | link·cut |
|---|---|---|
| BFS | O(n) | O(1) |
| HLD | O(log² n) | O(n) 재구성 |
| 링크-컷 트리 | O(log n) 분할 상환 | O(log n) 분할 상환 |

- 근거: access 한 번의 선호 자식 교체가 분할 상환 O(log n)번이고, 그 안의 스플레이들의 합도 퍼텐셜로 O(log n)이다. 공간은 정점당 몇 칸으로 O(n)이다.
- HLD는 트리가 고정이면 상수가 작고 최악 보장도 있어 정적 문제에는 여전히 좋은 선택이다.

## 어디에 쓰이나
- 그래프 알고리즘 11편 「디닉 알고리즘과 최대 유량 최소 컷 정리」: 슬리터와 타잔이 논문에서 꼽은 가장 중요한 응용이 블로킹 유량 찾기 가속이었고, 이로써 최대 유량을 O(nm log n)에 구했다.
- 그래프 알고리즘 5편 「최소 신장 트리: 크루스칼과 프림」: 간선이 계속 추가될 때 경로 최댓값 질의로 사이클의 가장 무거운 간선을 바꿔 끼우면 최소 신장 숲이 연산당 O(log n)에 유지된다.
- 5편 「오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드」: 질의를 미리 다 알 수 있으면 링크-컷 트리 없이 유니온 파인드만으로 간선 삭제를 다룰 수 있다.

## 정리
- 숲을 선호 경로로 쪼개고 경로마다 깊이 순서의 스플레이 트리를 두며, 스플레이 트리의 뿌리는 경로 부모를 가리킨다.
- access(x)가 뿌리~x를 한 경로로 만들고, evert는 그 경로를 뒤집는 플래그 하나다.
- link, cut, 경로 합, 뿌리 찾기가 모두 access 몇 번이고 분할 상환 O(log n)이다.
- BFS 대조 400개가 모두 일치했고, n이 16배가 될 때 회전 수는 1.6배였다.

## 더 알아보기
- 이전 글: 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」
- 다음 글: 3편 「웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에」
- 위키백과 Link/cut tree: https://en.wikipedia.org/wiki/Link/cut_tree
