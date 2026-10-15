# [고급 자료 구조 8/12] 트립: 무작위로 균형을 잡는 이진 탐색 트리

> **한 줄 요약** — 트립은 키로는 이진 탐색 트리, 무작위 우선순위로는 힙인 트리라서 모양이 "키를 무작위 순서로 넣은 BST"와 같아지고, 그 덕에 입력 순서와 무관하게 기대 깊이가 O(log n)이며, split과 merge 두 연산만으로 삽입·삭제·k번째 원소를 구현한다.

## 이 글에서 다루는 것
- 균형을 잡지 않는 BST가 정렬된 입력에서 무너지는 이유
- 키는 BST, 우선순위는 힙: 트립의 정의와 모양이 유일한 이유
- split·merge로 삽입, 삭제, k번째 원소, 순위 질의
- 기대 깊이를 지표 변수로 계산하고 실험으로 확인하기

## 예제 문제: 정렬 상태를 유지하며 넣고 빼기
수가 하나씩 들어오고 나가는 동안 "지금 k번째로 작은 수"나 "x보다 작은 수의 개수"를 계속 묻는다. 정렬된 파이썬 리스트에 `bisect.insort`로 넣으면 위치는 O(log n)에 찾지만 뒤 원소를 한 칸씩 미느라 삽입·삭제가 O(n)이다. 연산이 10⁵번이면 원소 이동이 10¹⁰번 규모가 된다.

**이진 탐색 트리**(BST)는 왼쪽 서브트리의 키 ≤ 노드 키 ≤ 오른쪽 서브트리의 키를 지켜 중위 순회가 정렬 순서가 되는 트리로, 연산 비용이 깊이에 비례한다. 문제는 균형이다. 1, 2, 3, …을 차례로 넣으면 매번 오른쪽 끝에 붙어 깊이 n − 1인 사슬이 되고, 그러면 정렬 리스트보다 나을 것이 없다. 레드-블랙 트리나 AVL 트리는 회전 규칙으로 깊이를 보장하지만 경우 나누기가 많다. **트립**(treap)은 균형을 운에 맡기되, 그 운이 입력과 무관하게 만든다. 1989년 라이문트 자이델(Raimund Seidel)과 세실리아 아라곤(Cecilia R. Aragon)이 발표했고, 이름은 tree + heap이다.

## 아이디어: 키는 BST, 우선순위는 힙
노드마다 키와 함께 무작위 **우선순위**를 하나 뽑아 둔다. 키에 대해서는 BST 순서를, 우선순위에 대해서는 부모가 자식보다 큰 최대 힙 성질(1편)을 동시에 지킨다.
```text
         (50, 9)
        /       \
   (20, 7)     (80, 6)
   /           /
(10, 3)     (65, 1)
```
우선순위가 모두 다르면 이 두 조건을 만족하는 트리는 하나뿐이다. 루트는 우선순위가 가장 큰 노드여야 하고, 키가 그보다 작은 노드는 왼쪽, 큰 노드는 오른쪽으로 갈 수밖에 없으며, 양쪽에 같은 논리를 재귀적으로 쓰면 모양이 다 정해진다. 이 유일한 모양은 "우선순위가 큰 순서로 키를 일반 BST에 넣은 결과"와 같다. 우선순위가 무작위이므로 트립은 **키를 무작위 순서로 넣은 BST**와 같은 분포를 갖는다. 사용자가 정렬된 순서로 넣든 어떻게 넣든, 모양을 정하는 것은 사용자가 모르는 우선순위다.

## split과 merge
모든 연산은 두 함수로 만든다.
- `split(t, k)`: 트립 t를 키 k 미만과 k 이상 두 트립으로 가른다. 루트 키가 k 미만이면 루트와 그 왼쪽 서브트리는 통째로 왼쪽 몫이고, 오른쪽 서브트리만 재귀로 가른 뒤 앞부분을 루트의 오른쪽 자식으로 붙인다. 반대도 대칭이다.
- `merge(a, b)`: a의 키가 모두 b의 키 이하일 때 하나로 합친다. 두 루트 중 우선순위가 큰 쪽이 새 루트가 되고, 나머지와 그쪽의 안쪽 서브트리를 재귀로 합친다.

두 함수 모두 재귀 한 번에 한 층씩 내려가므로 비용은 깊이에 비례한다. 자식을 바꿔 붙일 때 원래 자손이던 노드만 붙이므로 힙 성질도 깨지지 않는다. 삽입은 `split`으로 가르고 새 노드를 가운데 끼워 `merge` 두 번, 삭제는 키 x만 남도록 두 번 가른 뒤 그 루트를 버리고 다시 합친다. 서브트리 크기 `size`를 유지하면 k번째 원소와 순위 질의는 세그먼트 트리(3편)에서 하듯 크기를 보며 내려가면 된다.
```python
import random

class Node:
    __slots__ = ("key", "pri", "left", "right", "size")
    def __init__(self, key, pri):
        self.key, self.pri, self.size = key, pri, 1
        self.left = self.right = None

def size(t):
    return t.size if t else 0

def pull(t):
    t.size = 1 + size(t.left) + size(t.right)

def split(t, key):                   # (key 미만, key 이상) 두 트립으로
    if t is None:
        return None, None
    if t.key < key:
        a, b = split(t.right, key)
        t.right = a
        pull(t)
        return t, b
    a, b = split(t.left, key)
    t.left = b
    pull(t)
    return a, t

def merge(a, b):                     # a의 키가 모두 b의 키 이하일 때
    if a is None or b is None:
        return a or b
    if a.pri > b.pri:                # 우선순위가 큰 쪽이 루트
        a.right = merge(a.right, b)
        pull(a)
        return a
    b.left = merge(a, b.left)
    pull(b)
    return b

class Treap:
    def __init__(self, seed=0):
        self.root, self.rng = None, random.Random(seed)

    def insert(self, key):
        a, b = split(self.root, key)
        node = Node(key, self.rng.random())
        self.root = merge(merge(a, node), b)

    def erase(self, key):            # 정수 key 하나만 지운다
        a, b = split(self.root, key)
        mid, c = split(b, key + 1)   # mid = key와 같은 노드들
        if mid:
            mid = merge(mid.left, mid.right)
        self.root = merge(merge(a, mid), c)

    def kth(self, k):                # 0부터 센 k번째로 작은 키
        t = self.root
        while True:
            ls = size(t.left)
            if k == ls:
                return t.key
            if k < ls:
                t = t.left
            else:
                k, t = k - ls - 1, t.right

    def count_less(self, key):       # key 미만인 원소 수
        t, cnt = self.root, 0
        while t:
            if t.key < key:
                cnt, t = cnt + size(t.left) + 1, t.right
            else:
                t = t.left
        return cnt

tr = Treap(seed=1)
for x in [50, 20, 80, 20, 65, 10]:
    tr.insert(x)
tr.erase(20)
print([tr.kth(i) for i in range(size(tr.root))])
print(tr.kth(2), tr.count_less(65), size(tr.root))
```
```text
[10, 20, 50, 65, 80]
50 3 5
```
20을 두 번 넣고 한 번 지웠으므로 하나가 남는다. 중복 키는 `split`이 "미만 / 이상"으로 일관되게 가르기 때문에 문제없다.

## 무작위 대조 검사
앞 코드에 이어서, 키 범위를 0~19로 좁혀 중복이 자주 생기게 하고 삽입·삭제·k번째·순위 질의를 섞어 정렬 리스트(`bisect`)와 비교한다.
```python
import bisect

rng = random.Random(8)
ok = 0
for case in range(500):
    tr, ref = Treap(seed=case), []           # ref = 정렬된 리스트(정답)
    same = True
    for _ in range(60):
        op, x = rng.randrange(4), rng.randrange(20)
        if op == 0:
            tr.insert(x)
            bisect.insort(ref, x)
        elif op == 1 and x in ref:
            tr.erase(x)
            ref.remove(x)
        elif op == 2 and ref:
            k = rng.randrange(len(ref))
            same &= tr.kth(k) == ref[k]
        else:
            same &= tr.count_less(x) == bisect.bisect_left(ref, x)
    ok += same and size(tr.root) == len(ref)
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 기대 깊이가 O(log n)인 이유
키를 정렬해 x₁ < x₂ < … < xₙ이라 하자. xⱼ가 xᵢ의 조상일 필요충분조건은 "xᵢ와 xⱼ 사이(양 끝 포함)의 키 중 xⱼ의 우선순위가 가장 크다"는 것이다. 그 구간에서 가장 먼저(우선순위 순으로) 들어간 키가 사이에 있는 다른 키라면 xᵢ와 xⱼ는 그 키의 서로 다른 쪽으로 갈라지고, xⱼ라면 xᵢ는 xⱼ 아래로 들어가기 때문이다. 우선순위는 독립이고 같은 분포이므로 구간의 ∣i − j∣ + 1개 키가 최대일 확률은 모두 같아, 그 확률은 1/(∣i − j∣ + 1)이다. 깊이는 "xⱼ가 조상이면 1"인 지표 변수들의 합이므로 선형성으로 바로 계산된다.
```text
E[깊이(xᵢ)] = Σ_{j≠i} 1/(∣i−j∣+1)
            = (Hᵢ − 1) + (Hₙ₋ᵢ₊₁ − 1)
            < 2·ln n
```
Hₙ = 1 + 1/2 + … + 1/n은 조화수로 ln n + 0.58 안팎이다. 노드 전체의 평균을 내면 `2(1 + 1/n)Hₙ − 4`가 된다. 앞 코드에 이어서, 일반 BST가 사슬이 되는 정렬 순서로 넣고 실제 깊이를 재 보자.
```python
def depths(t):                               # 모든 노드의 깊이(루트 = 0)
    out, stack = [], [(t, 0)]
    while stack:
        node, d = stack.pop()
        if node:
            out.append(d)
            stack += [(node.left, d + 1), (node.right, d + 1)]
    return out

print("     n   평균  기댓값  최대")
for n in [1000, 10000, 100000]:
    tr = Treap(seed=n)
    for x in range(n):                       # 일반 BST가 무너지는 정렬 순서
        tr.insert(x)
    d = depths(tr.root)
    h = sum(1 / i for i in range(1, n + 1))  # 조화수 Hₙ
    expect = 2 * (1 + 1 / n) * h - 4         # 지표 변수로 구한 평균 깊이
    print(f"{n:6} {sum(d) / n:6.1f} {expect:7.1f} {max(d):5}")
```
```text
     n   평균  기댓값  최대
  1000   11.0    11.0    22
 10000   14.8    15.6    27
100000   20.8    20.2    43
```
같은 입력에서 일반 BST의 최대 깊이는 n − 1, 10만 개면 99,999다. 트립은 평균 깊이가 계산한 기댓값과 잘 맞고, 가장 깊은 노드도 평균의 2배 안팎이다. 깊이가 c·ln n(c는 충분히 큰 상수)을 넘을 확률은 n이 커질수록 빠르게 0에 가까워지므로, 최악 O(n)은 이론상 가능할 뿐 실제로는 나오지 않는다.

## 자주 하는 실수와 변형
- `merge`의 전제를 어기는 실수: a의 키가 모두 b 이하여야 한다. 순서를 거꾸로 넘기면 BST 순서가 조용히 깨진다. 대조 검사가 이를 잡는다.
- `pull`을 빠뜨리면 `size`가 틀려 k번째 원소가 어긋난다. 자식을 바꾼 노드는 반드시 다시 계산한다.
- 우선순위 시드를 공개하면 공격자가 우선순위를 예측해 나쁜 순서로 넣을 수 있다. 안티 해시 테스트와 같은 문제다.
- **암시적 트립**(implicit treap): 키를 저장하지 않고 왼쪽 서브트리 크기로 위치를 정하면, 수열 중간 삽입·구간 잘라 붙이기·구간 뒤집기(레이지 플래그)를 O(log n)에 하는 시퀀스 자료 구조가 된다.
- 원 논문의 삽입은 일반 BST처럼 넣은 뒤 힙 성질이 맞을 때까지 회전하는 방식이다. split·merge 방식은 같은 트리를 만들고 코드가 짧다.

## 복잡도
| 연산 | 트립(기대) | 정렬 리스트 |
|---|---|---|
| 삽입·삭제 | O(log n) | O(n) 원소 이동 |
| k번째 원소 | O(log n) | O(1) |
| 순위(x 미만 개수) | O(log n) | O(log n) |
| split·merge | O(log n) | O(n) |
| 공간 | O(n) | O(n) |

트립의 비용은 모두 깊이에 비례하고 기대 깊이가 2·ln n 미만이라 O(log n)이다. 사슬 같은 최악 O(n)이 나올 확률은 무시할 만큼 작다.

## 어디에 쓰이나
- 확률과 분포 4편 「확률 변수와 기댓값」: 깊이를 "xⱼ가 조상인가"라는 지표 변수의 합으로 쪼개고 선형성을 쓰는 것이 그 글의 모자 문제와 같은 기법이다.
- 알고리즘 기법 14편 「무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기」: 트립은 답은 항상 맞고 시간만 무작위인 라스베이거스형이며, 모양의 분포가 무작위 피벗 퀵정렬의 재귀 트리와 같다.
- 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」: 우선순위 쪽 조건이 바로 그 글의 힙 성질이고, 트립은 이것을 키 순서와 한 트리에 겹쳐 놓는다.
- 4편 「느리게 갱신되는 세그먼트 트리: 구간 갱신」: 암시적 트립의 구간 더하기·뒤집기는 그 글의 레이지 전파를 split·merge 직전에 내려보내는 방식으로 그대로 쓴다.

## 정리
- 키는 BST, 무작위 우선순위는 힙이라는 두 조건이 트리 모양을 하나로 정하고, 그 모양은 키를 무작위 순서로 넣은 BST와 같다.
- 모든 연산은 split과 merge로 만들고 비용은 깊이에 비례한다.
- 지표 변수와 선형성으로 기대 깊이가 2·ln n 미만임을 보일 수 있고, 정렬된 입력 10만 개에서도 평균 깊이는 약 21이었다.
- 서브트리 크기를 두면 k번째 원소와 순위가, 키 대신 위치를 쓰면 수열 편집이 O(log n)이 된다.

## 더 알아보기
- 이전 글: 7편 「트라이: 접두사 검색과 XOR 최댓값」
- 다음 글: 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」
- 위키백과 Treap: https://en.wikipedia.org/wiki/Treap
