# [추상 데이터 타입 심화 7/21] AVL 트리: 높이 차를 1 이하로 유지하는 회전

> **한 줄 요약** — AVL 트리는 모든 노드에서 두 서브트리의 높이 차를 1 이하로 지키고 깨지면 네 가지 경우에 맞춰 단일·이중 회전으로 고쳐서, 가장 비뚤어진 경우인 피보나치 트리조차 높이가 약 1.44·log₂ n이라 찾기·넣기·지우기가 최악에도 O(log n)이다.

## 이 글에서 다루는 것
- 균형 인수와 네 가지 경우(LL·LR·RL·RR), 단일·이중 회전
- 높이 ≤ 약 1.44·log₂ n: 가장 비뚤어진 AVL 트리는 피보나치 트리
- 삽입·삭제 구현과 정렬 리스트 모델 대조 + 균형 불변식 검사
- 정렬된 입력에서 일반 BST·트립과 높이 비교

## 예제 문제: 증가 순서로 들어오는 키
회원 번호가 1, 2, 3, …처럼 증가 순서로 들어오는데 넣기·빼기·찾기·"x 이상인 가장 작은 키"를 계속 처리해야 한다. 1편 「추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기」의 정렬 집합 ADT다. 균형을 잡지 않는 이진 탐색 트리(BST)는 매번 오른쪽 끝에 붙어 높이가 n인 사슬이 된다. 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」는 기대 높이가 O(log n)이지만 보장은 확률적이다. 최악에도 O(log n)을 원하면 모양을 규칙으로 묶어야 한다. 1962년 아델손-벨스키(Georgy Adelson-Velsky)와 란디스(Evgenii Landis)가 발표한 **AVL 트리**가 최초의 자가 균형 탐색 트리다.

## 균형 인수와 네 가지 경우
노드마다 높이를 저장하고 **균형 인수** `bf = 높이(왼쪽) − 높이(오른쪽)`가 −1, 0, 1 중 하나이게 한다. 넣거나 지우면 높이가 바뀌는 곳은 루트까지의 경로뿐이므로, 돌아 올라오며 ∣bf∣ = 2가 된 노드 z를 고친다. 회전은 심화 알고리즘 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」에서 본 것처럼 부모와 자식의 위아래를 바꾸면서 중위 순서를 지키는 O(1) 연산이다. z의 어느 손자 쪽이 높아졌는지에 따라 네 경우가 있다.
- LL: 왼쪽 자식의 왼쪽이 높다 → z를 오른쪽으로 한 번 회전
- LR: 왼쪽 자식의 오른쪽이 높다 → 왼쪽 자식을 왼쪽으로 돌려 LL로 만든 뒤 z를 오른쪽으로(이중 회전)
- RR, RL은 좌우 대칭이다.
```text
LR 경우
      z             x
     /             / \
    y      →      y   z
     \
      x
y를 왼쪽으로, z를 오른쪽으로
```
넣기에서는 회전(단일이든 이중이든) 한 번이면 그 서브트리 높이가 넣기 전으로 돌아가 위쪽은 더 볼 필요가 없다. 지우기에서는 회전 뒤 높이가 1 줄 수 있어 루트까지 회전이 이어질 수 있다.

## 높이가 1.44·log₂ n 이하인 이유
높이 h인 AVL 트리의 최소 노드 수를 N(h)라 하자. 가장 아끼려면 한쪽 서브트리는 높이 h − 1, 다른 쪽은 h − 2여야 하므로 점화식이 피보나치와 같다. 이 모양이 **피보나치 트리**이고 가장 비뚤어진 AVL 트리다.
```text
N(0) = 0, N(1) = 1
N(h) = N(h−1) + N(h−2) + 1
     = F(h + 2) − 1 ≥ φʰ − 1
⇒ h < 1.4405·log₂(n + 2) − 0.328
```
완전 이진 트리의 높이가 log₂(n + 1)이니 AVL 트리는 최악에도 44% 정도만 더 높다.
```python
import random, bisect

class Node:
    __slots__ = ("key", "left", "right", "h")
    def __init__(self, key):
        self.key, self.left, self.right, self.h = key, None, None, 1

ROT = [0]
def ht(t): return t.h if t else 0
def fix(t): t.h = 1 + max(ht(t.left), ht(t.right))
def bf(t): return ht(t.left) - ht(t.right)

def rot_right(t):                    # 왼쪽 자식을 위로
    l = t.left
    t.left, l.right = l.right, t
    fix(t); fix(l); ROT[0] += 1
    return l

def rot_left(t):                     # 오른쪽 자식을 위로
    r = t.right
    t.right, r.left = r.left, t
    fix(t); fix(r); ROT[0] += 1
    return r

def balance(t):
    fix(t)
    if bf(t) > 1:                    # 왼쪽이 높다
        if bf(t.left) < 0: t.left = rot_left(t.left)     # LR → LL
        return rot_right(t)
    if bf(t) < -1:                   # 오른쪽이 높다
        if bf(t.right) > 0: t.right = rot_right(t.right) # RL → RR
        return rot_left(t)
    return t

def insert(t, key):
    if t is None: return Node(key)
    if key == t.key: return t
    if key < t.key: t.left = insert(t.left, key)
    else: t.right = insert(t.right, key)
    return balance(t)

def delete(t, key):
    if t is None: return None
    if key < t.key: t.left = delete(t.left, key)
    elif t.key < key: t.right = delete(t.right, key)
    else:
        if t.left is None or t.right is None: return t.left or t.right
        m = t.right
        while m.left: m = m.left     # 바로 다음 키로 바꾸고 그것을 지운다
        t.key = m.key
        t.right = delete(t.right, m.key)
    return balance(t)

def ceiling(t, x):                   # x 이상인 가장 작은 키
    best = None
    while t:
        if t.key < x: t = t.right
        else: best, t = t.key, t.left
    return best

def preorder(t):
    return [t.key] + preorder(t.left) + preorder(t.right) if t else []

root = None
for x in range(1, 8): root = insert(root, x)
print(preorder(root), "높이", root.h, "회전", ROT[0])
```
```text
[4, 2, 1, 3, 6, 5, 7] 높이 3 회전 4
```

## 모델 기반 무작위 검사
앞 코드에 이어서, 키를 0~39로 좁혀 중복 삽입과 없는 키 삭제를 섞고 정렬 리스트와 비교한다. 매 연산 뒤 BST 순서, 저장된 높이가 실제 높이와 같은지, 모든 노드의 ∣bf∣ ≤ 1인지 검사한다.
```python
def check(t, lo=None, hi=None):      # 불변식 검사 후 높이를 돌려준다
    if t is None: return 0
    assert (lo is None or lo < t.key) and (hi is None or t.key < hi)
    a, b = check(t.left, lo, t.key), check(t.right, t.key, hi)
    assert t.h == 1 + max(a, b) and abs(a - b) <= 1
    return t.h

def inorder(t): return inorder(t.left) + [t.key] + inorder(t.right) if t else []

rng, ok = random.Random(7), 0
for case in range(500):
    t, ref, same = None, [], True
    for _ in range(100):
        op, x = rng.randrange(3), rng.randrange(40)
        i = bisect.bisect_left(ref, x)
        if op == 0:
            t = insert(t, x)
            if i == len(ref) or ref[i] != x: ref.insert(i, x)
        elif op == 1:
            t = delete(t, x)
            if i < len(ref) and ref[i] == x: ref.pop(i)
        else:
            same &= ceiling(t, x) == (ref[i] if i < len(ref) else None)
        check(t)
    ok += same and inorder(t) == ref
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```

## 피보나치 트리와 정렬된 입력
앞 코드에 이어서, 먼저 높이 h인 피보나치 트리를 직접 만들어 AVL 조건을 통과하는지, 노드 수가 F(h + 2) − 1인지 확인하고, 가장 큰 키 하나를 지울 때 회전이 몇 번 일어나는지 센다.
```python
import math

def fib_tree(h, start=0):            # 키는 start부터 중위 순서로
    if h <= 0: return None, start
    left, k = fib_tree(h - 1, start)
    t = Node(k); t.left = left
    t.right, k = fib_tree(h - 2, k + 1)
    fix(t)
    return t, k

F = [0, 1]
while len(F) < 40: F.append(F[-1] + F[-2])
print(" h    노드  =F(h+2)−1    상한  삭제 회전")
for h in (5, 10, 15, 20, 25):
    t, n = fib_tree(h)
    check(t)
    bound = 1.4405 * math.log2(n + 2) - 0.328
    ROT[0] = 0
    t = delete(t, n - 1)             # 가장 큰 키
    check(t)
    print(f"{h:2} {n:7} {str(n == F[h + 2] - 1):>9} {bound:7.3f}"
          f" {ROT[0]:9}")
```
```text
 h    노드  =F(h+2)−1    상한  삭제 회전
 5      12      True   5.156         2
10     143      True  10.015         4
15    1596      True  15.002         7
20   17710      True  20.001         9
25  196417      True  25.001        12
```
피보나치 트리는 높이 상한식에 거의 딱 맞는다. 가장 큰 키 하나를 지우자 높이가 준 오른쪽 경로를 따라 올라가며 회전이 h/2번 안팎 일어났다. 넣기가 회전 한 번으로 끝나는 것과 대조적이다.

다음은 0부터 n − 1까지 증가 순서로 넣을 때의 높이다. 트립은 회전으로 넣는 짧은 구현을 쓴다. 일반 BST는 높이가 n이다.
```python
class TNode:
    __slots__ = ("key", "pri", "left", "right")
    def __init__(self, key, pri):
        self.key, self.pri, self.left, self.right = key, pri, None, None

def treap_insert(t, key, pri):       # BST로 넣고 우선순위가 크면 위로 회전
    if t is None: return TNode(key, pri)
    if key < t.key:
        t.left = treap_insert(t.left, key, pri)
        if t.left.pri > t.pri:
            l = t.left; t.left, l.right = l.right, t; return l
    else:
        t.right = treap_insert(t.right, key, pri)
        if t.right.pri > t.pri:
            r = t.right; t.right, r.left = r.left, t; return r
    return t

def height(t):
    best, st = 0, [(t, 1)]
    while st:
        x, d = st.pop()
        if x: best = max(best, d); st += [(x.left, d + 1), (x.right, d + 1)]
    return best

rng = random.Random(1)
print("     n  AVL  트립  log₂(n+1)  회전/삽입")
for n in (1000, 10000, 100000):
    t = tr = None
    ROT[0] = 0
    for x in range(n):
        t = insert(t, x)
        tr = treap_insert(tr, x, rng.random())
    print(f"{n:6} {t.h:4} {height(tr):5} {math.log2(n + 1):10.2f}"
          f" {ROT[0] / n:10.3f}")
```
```text
     n  AVL  트립  log₂(n+1)  회전/삽입
  1000   10    21       9.97      0.990
 10000   14    29      13.29      0.999
100000   17    41      16.61      1.000
```
증가 순서로 넣어도 AVL 높이는 ⌈log₂(n + 1)⌉과 같아 완전 이진 트리 수준이고, 거의 모든 삽입이 회전 한 번을 일으킨다. 트립은 기대 높이가 O(log n)이지만 AVL의 2배 남짓이고, 일반 BST라면 높이가 100,000이다.

## 자주 하는 실수와 변형
- 회전 뒤 높이를 고치는 순서: 내려간 노드(t)를 먼저, 올라간 노드를 나중에 고친다. 거꾸로 하면 낡은 자식 높이로 계산한다.
- 지우기에서 자식의 bf가 0인 경우를 이중 회전으로 보내기: 이때는 단일 회전이 맞다. 위 코드는 `bf < 0`, `bf > 0`으로 엄격하게 비교해 0이면 단일 회전으로 간다. 넣기에서는 0이 나오지 않아 드러나지 않고, 삭제를 섞은 대조 검사에서야 잡힌다.
- 지우기 뒤 경로 전체에서 균형을 다시 보지 않기: 넣기와 달리 회전 한 번으로 끝나지 않는다.
- 변형: 높이 대신 bf 2비트만 저장해도 된다. 서브트리 크기를 덧붙이면 k번째 원소와 순위 질의가 된다(12편).

## 복잡도
| 연산 | AVL 트리 | 일반 BST | 트립(기대) |
|---|---|---|---|
| 찾기 | O(log n) | O(n) | O(log n) |
| 넣기 | O(log n), 회전 ≤ 1 | O(n) | O(log n) |
| 지우기 | O(log n), 회전 O(log n) | O(n) | O(log n) |
| 최악 높이 | ≈ 1.44·log₂ n | n | n(확률 극소) |

- 높이 상한 1.4405·log₂(n + 2) − 0.328이 근거다. 넣기의 회전은 단일·이중을 한 번으로 셀 때 많아야 한 번이다. 공간은 O(n), 노드마다 높이 하나를 더 둔다.

## 어디에 쓰이나
- 심화 알고리즘 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」: 같은 회전을 쓰지만 스플레이 트리는 분할 상환 O(log n)과 자주 찾는 키의 이득을, AVL 트리는 연산마다 최악 O(log n)을 준다.
- 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」: 실험처럼 정렬 입력에서 트립의 높이는 AVL보다 2배 남짓 높지만 split·merge가 쉽다. 보장이 확률적이냐 결정적이냐의 차이다.
- 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」: 균형을 더 느슨하게 잡아 높이 상한은 2·log₂ n으로 높지만 고치는 횟수가 적다. 찾기가 많으면 AVL, 갱신이 많으면 레드-블랙이 흔히 권해진다.
- 12편 「정보를 덧붙인 트리: 순위 통계 트리와 구간 트리」: 이 글의 `fix`에서 높이와 함께 서브트리 크기·최대 끝점을 다시 계산하면 그대로 순위 통계 트리와 구간 트리가 된다.

## 정리
- AVL 트리는 모든 노드에서 높이 차를 1 이하로 지키고, 깨지면 LL·LR·RL·RR 네 경우에 맞춰 회전한다.
- 가장 비뚤어진 AVL 트리는 노드 F(h + 2) − 1개의 피보나치 트리이고, 높이는 1.4405·log₂(n + 2) − 0.328 미만이다.
- 넣기는 회전 한 번으로 끝나지만, 지우기는 피보나치 트리에서처럼 경로를 따라 여러 번 회전할 수 있다.
- 증가 순서로 넣어도 높이가 log₂ n 근처에 머물러, 사슬이 되는 일반 BST와 확률적인 트립보다 낮았다.

## 더 알아보기
- 이전 글: 6편 「피보나치 힙: 키 줄이기 O(1)과 다익스트라」
- 다음 글: 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」
- 위키백과 AVL tree: https://en.wikipedia.org/wiki/AVL_tree
