# [추상 데이터 타입 심화 8/21] 레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기

> **한 줄 요약** — 레드-블랙 트리는 2-3-4 트리의 큰 노드를 "검은 노드 + 빨간 자식"으로 풀어 쓴 이진 탐색 트리라서 "모든 잎이 같은 깊이"가 "모든 경로의 검은 노드 수가 같다"로 바뀌어 높이 ≤ 2·log₂(n + 1)이 되고, 좌편향 판은 이를 회전 둘과 색 뒤집기 하나로 구현한다.

## 이 글에서 다루는 것
- 2-3-4 트리의 분할과 레드-블랙 색의 일대일 대응
- 다섯 가지 성질과 높이 상한 2·log₂(n + 1)
- 좌편향 레드-블랙 트리(LLRB)의 삽입·삭제와 불변식 검사
- AVL 트리와 높이·회전 수 비교

## 예제 문제: 최악에도 로그 시간인 정렬 맵
**정렬 맵**(sorted map)에 삽입·삭제·찾기와 "x 이하에서 가장 큰 키" 같은 순서 연산이 필요하다. 해시 테이블은 순서를 모르고, 정렬 리스트는 삽입·삭제가 O(n)이며, 트립은 기대 O(log n)일 뿐이다. 7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」의 AVL 트리는 최악을 보장하지만 균형 조건이 빡빡해 삭제 한 번에 회전이 O(log n)번까지 일어난다.

**레드-블랙 트리**(red-black tree)는 균형을 조금 느슨하게 두는 대신 회전 수를 상수로 묶는다. 1972년 바이어(Rudolf Bayer)의 "대칭 이진 B-트리"를 1978년 기바스(Leonidas Guibas)와 세지윅(Robert Sedgewick)이 빨강·검정 색으로 다시 정리했다.

## 2-3-4 트리: 모든 잎이 같은 깊이
**2-3-4 트리**는 노드 하나에 키를 1~3개 담고 자식이 2~4개인 탐색 트리다. 새 키는 잎에 넣고, 꽉 찬 4-노드(키 3개)는 가운데 키를 부모로 올려 둘로 쪼갠다.
```text
   [E]                [E M]
  /   \      →       /  |  \
[A] [H M P]        [A] [H] [P]
```
트리는 뿌리가 쪼개질 때만 위로 자라므로 **모든 잎이 같은 깊이**에 있고, 층 수는 log₂(n + 1) 이하다. 다만 노드 종류가 셋이라 코드가 번거롭다는 것이 흠이다.

## 색으로 옮기기: 다섯 가지 성질
3·4-노드를 이진 노드로 풀고, 한 노드 안의 키끼리 잇는 링크를 **빨강**, 원래 간선을 **검정**으로 칠한다. 노드의 색은 부모에서 내려오는 링크의 색이고, 아래에서 괄호가 빨간 노드다.
```text
[A B]  →    B      [A B C]  →    B
           /                    / \
         (A)                  (A) (C)
```
이렇게 얻은 트리의 성질이 곧 정의다.
1. 노드는 빨강 아니면 검정이다.
2. 뿌리는 검정이다.
3. 빈 자리(NIL 잎)는 검정으로 본다.
4. 빨간 노드의 자식은 검정이다(= 한 노드의 키는 3개 이하).
5. 어느 노드에서든 아래 NIL까지 가는 모든 경로의 검은 노드 수(**검은 높이**)가 같다(= 모든 잎이 같은 깊이).

빨강은 연속하지 않으니 어떤 경로든 검정이 절반 이상이고, 검은 높이가 b인 서브트리에는 노드가 2ᵇ − 1개 이상 있다(귀납법).
```text
h = 가장 긴 경로의 노드 수
b ≥ h/2,  n ≥ 2ᵇ − 1 ≥ 2^(h/2) − 1
⇒ h ≤ 2·log₂(n + 1)
```

## 좌편향 레드-블랙 트리
세지윅은 2008년 **좌편향 레드-블랙 트리**(left-leaning red-black tree, LLRB)를 발표했다. 빨간 링크를 왼쪽으로만 허용하면 3-노드 모양이 하나로 정해져 경우가 크게 준다. 여기서는 4-노드를 바로 쪼개는 2-3 트리 판을 쓴다(색 뒤집기를 재귀 호출 앞으로 옮기면 2-3-4 판). 삽입은 빨간 새 노드를 잎에 달고, 올라오며 세 규칙을 차례로 적용한다(`fix_up`).
- 오른쪽 자식만 빨강: 왼쪽 회전으로 빨간 링크를 왼쪽으로 기울인다.
- 왼쪽과 왼쪽의 왼쪽이 빨강: 오른쪽 회전으로 4-노드를 가운데가 위로 오게 편다.
- 두 자식이 빨강: 색 뒤집기로 4-노드를 쪼개고 가운데 키를 부모 노드에 합친다.
```python
ROT = [0]                        # 회전 횟수

class Node:
    __slots__ = ("key", "left", "right", "red")
    def __init__(self, key):     # 새 노드는 빨강
        self.key, self.left, self.right, self.red = key, None, None, True

def red(h): return h is not None and h.red

def rot_left(h):                 # 오른쪽 빨간 링크를 왼쪽으로
    x = h.right; h.right, x.left = x.left, h
    x.red, h.red = h.red, True; ROT[0] += 1; return x

def rot_right(h):                # 왼쪽 빨간 링크를 오른쪽으로
    x = h.left; h.left, x.right = x.right, h
    x.red, h.red = h.red, True; ROT[0] += 1; return x

def flip(h):                     # 4-노드 쪼개기(삽입)·만들기(삭제)
    for v in (h, h.left, h.right): v.red = not v.red

def fix_up(h):
    if red(h.right) and not red(h.left): h = rot_left(h)
    if red(h.left) and red(h.left.left): h = rot_right(h)
    if red(h.left) and red(h.right): flip(h)
    return h

def insert(h, key):
    if h is None: return Node(key)
    if key < h.key: h.left = insert(h.left, key)
    elif key > h.key: h.right = insert(h.right, key)
    return fix_up(h)

class LLRB:
    def __init__(self): self.root = None
    def add(self, key):
        self.root = insert(self.root, key)
        self.root.red = False    # 뿌리는 늘 검정
    def __contains__(self, key):
        h = self.root
        while h and h.key != key: h = h.left if key < h.key else h.right
        return h is not None

def show(h):                     # 빨간 왼쪽 자식을 접어 2-3 트리로
    l = h.left if red(h.left) else None   # 3-노드의 왼쪽 키
    kids = ([l.left, l.right] if l else [h.left]) + [h.right]
    sub = " ".join(show(c) for c in kids if c)
    keys = (l.key if l else "") + h.key
    return f"({keys} {sub})" if sub else keys

t = LLRB()
for c in "SEARCHXMPL": t.add(c)
print(show(t.root))
```
```text
(M (E AC HL) (R P SX))
```
빨간 링크를 접으면 잎 AC·HL·P·SX가 모두 셋째 층에 있는 2-3 트리다.

## 삭제: 내려가며 2-노드를 피한다
2-노드에서 키를 빼면 빈 노드가 생겨 검은 높이가 깨진다. 그래서 내려가며 다음 자식이 2-노드면 형제에게 빌리거나 부모 키와 합쳐 3·4-노드로 만들어 두고(`move_red_left`, `move_red_right`), 올라오며 `fix_up`으로 정리한다. B-트리 삭제의 빌리기·합치기를 색으로 하는 셈이다. 앞 코드에 이어서 실행한다.
```python
def move_red_left(h):            # 왼쪽 자식을 3·4-노드로 만들어 둔다
    flip(h)
    if red(h.right.left):        # 형제에게서 키 하나 빌리기
        h.right = rot_right(h.right); h = rot_left(h); flip(h)
    return h

def move_red_right(h):
    flip(h)
    if red(h.left.left): h = rot_right(h); flip(h)
    return h

def delete(h, key):              # key가 트리에 있을 때만 부른다
    if key < h.key:
        if not red(h.left) and not red(h.left.left): h = move_red_left(h)
        h.left = delete(h.left, key)
    else:
        if red(h.left): h = rot_right(h)
        if key == h.key and h.right is None: return None
        if not red(h.right) and not red(h.right.left):
            h = move_red_right(h)
        if key == h.key:         # 오른쪽 최솟값으로 바꿔 끼운다
            m = h.right
            while m.left: m = m.left
            h.key, key = m.key, m.key
        h.right = delete(h.right, key)
    return fix_up(h)

def discard(self, key):
    if key not in self: return
    if not red(self.root.left) and not red(self.root.right):
        self.root.red = True     # 뿌리를 잠시 3-노드처럼
    self.root = delete(self.root, key)
    if self.root: self.root.red = False
LLRB.discard = discard

for c in "EMS": t.discard(c)
print(show(t.root))
```
```text
(HP AC L RX)
```
E·M·S를 지운 뒤에도 잎 AC·L·RX가 모두 둘째 층에 있다.

## 불변식 검사와 무작위 대조
앞 코드에 이어서, 매 연산 뒤에 BST 순서·좌편향·빨강 연속 금지·검은 높이를 검사하고 파이썬 `set`과 결과를 비교한다. 키를 0~29로 좁혀 중복 삽입과 없는 키 삭제를 자주 일으킨다.
```python
import random

def check(h, lo=None, hi=None):  # 검은 높이를 돌려준다
    if h is None: return 0
    assert (lo is None or lo < h.key) and (hi is None or h.key < hi)
    assert not red(h.right)              # 빨간 링크는 왼쪽으로만
    assert not (h.red and red(h.left))   # 빨강 두 개 연속 금지
    bl = check(h.left, lo, h.key)
    assert bl == check(h.right, h.key, hi)   # 검은 높이가 모두 같다
    return bl + (not h.red)

def inorder(h):
    return inorder(h.left) + [h.key] + inorder(h.right) if h else []

rng, ok = random.Random(8), 0
for _ in range(500):
    t, ref, same = LLRB(), set(), True
    for _ in range(80):
        op, x = rng.randrange(3), rng.randrange(30)
        if op == 0: t.add(x); ref.add(x)
        elif op == 1: t.discard(x); ref.discard(x)
        else: same &= (x in t) == (x in ref)
        assert not red(t.root)
        check(t.root)
    ok += same and inorder(t.root) == sorted(ref)
print(f"무작위 500개 비교: {ok}개 일치, 불변식 검사 통과")
```
```text
무작위 500개 비교: 500개 일치, 불변식 검사 통과
```

## AVL과 비교: 높이와 회전 수
앞 코드에 이어서, AVL 삽입을 짧게 다시 짜고 키 10만 개를 무작위 순서로 넣어 높이(가장 긴 경로의 노드 수)와 삽입당 회전 수(이중 회전은 2번)를 센다. 높이 상한은 레드-블랙 2·log₂(n + 1) ≈ 33.2, AVL 약 23.6이다.
```python
class A:                         # AVL 노드
    __slots__ = ("key", "left", "right", "h")
    def __init__(s, key): s.key, s.left, s.right, s.h = key, None, None, 1

def ht(t): return t.h if t else 0
def upd(t): t.h = 1 + max(ht(t.left), ht(t.right)); return t

def a_right(t):
    x = t.left; t.left = x.right; x.right = upd(t); ROT[0] += 1; return upd(x)

def a_left(t):
    x = t.right; t.right = x.left; x.left = upd(t); ROT[0] += 1; return upd(x)

def avl_insert(t, key):
    if t is None: return A(key)
    if key < t.key: t.left = avl_insert(t.left, key)
    elif key > t.key: t.right = avl_insert(t.right, key)
    b = ht(upd(t).left) - ht(t.right)
    if b > 1:
        if ht(t.left.left) < ht(t.left.right): t.left = a_left(t.left)
        return a_right(t)
    if b < -1:
        if ht(t.right.right) < ht(t.right.left): t.right = a_right(t.right)
        return a_left(t)
    return t

def height(t): return 1 + max(height(t.left), height(t.right)) if t else 0

n = 100000
seq = random.Random(1).sample(range(n), n)
ROT[0], t = 0, LLRB()
for x in seq: t.add(x)
print(f"LLRB: 높이 {height(t.root)}, 검은 높이 {check(t.root)}, "
      f"회전 {ROT[0] / n:.2f}/삽입")
ROT[0], r = 0, None
for x in seq: r = avl_insert(r, x)
print(f"AVL: 높이 {height(r)}, 회전 {ROT[0] / n:.2f}/삽입")
```
```text
LLRB: 높이 24, 검은 높이 14, 회전 1.19/삽입
AVL: 높이 20, 회전 0.70/삽입
```
LLRB는 AVL보다 네 층 깊지만 상한보다 한참 낮고, 둘 다 log₂ n ≈ 16.6의 1.5배 안쪽이다. 회전은 오히려 LLRB가 많다. 왼쪽으로 기울이는 규칙이 회전을 더하기 때문이다. "레드-블랙은 회전이 적다"는 고전 구현, 특히 삭제의 이야기이고 LLRB의 장점은 코드 길이다.

## 자주 하는 실수와 변형
- `fix_up`의 세 조건을 `elif`로 묶으면 틀린다. 회전한 결과에 다음 조건을 다시 검사해야 한다.
- 뿌리 색을 고치는 두 줄(삽입 뒤 검정, 삭제 전 빨강)을 빠뜨리기 쉽다. 답은 한동안 맞다가 불변식 검사에서 걸린다.
- 고전 구현은 부모 포인터와 "삼촌의 색"으로 경우를 나눈다. 성능이 중요한 라이브러리는 이쪽을 쓴다.

## 복잡도
| 항목 | 레드-블랙 | AVL |
|---|---|---|
| 높이 상한 | 2·log₂(n + 1) | 약 1.44·log₂ n |
| 찾기·삽입·삭제 | O(log n) | O(log n) |
| 삽입당 회전 | 최대 2번 | 최대 2번 |
| 삭제당 회전 | 최대 3번 | O(log n)번 |
| 노드당 추가 정보 | 색 1비트 | 높이 |

- 높이가 O(log n)이고 연산은 한 경로를 오르내린다. 회전 수는 고전 구현 기준이다. 공간 O(n). 정렬 리스트는 삽입·삭제가 O(n)이다.

## 어디에 쓰이나
- 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」: 2-3-4 트리는 최소 차수 2인 B-트리이고, 노드 하나에 키를 수백 개 담으면 디스크용 B-트리가 된다.
- 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」: 같은 정렬 맵을 트립은 짧은 코드와 기대 O(log n)으로, 레드-블랙은 최악 보장으로 구현한다.
- 표준 라이브러리: 자바 `TreeMap`은 문서에 레드-블랙 트리 기반이라고 밝히고, GCC의 libstdc++는 `std::map`·`std::set`을 `_Rb_tree`로 구현한다.
- 리눅스 커널: `lib/rbtree.c`에 범용 구현을 두고, 커널 문서는 epoll의 파일 디스크립터와 패킷 스케줄러(HTB) 등을 사용처로 든다.

## 정리
- 레드-블랙 트리는 2-3-4 트리를 이진 노드로 펼친 것이다(빨강 = 한 노드 안, 검정 = 원래 간선).
- "모든 잎이 같은 깊이"가 "검은 높이가 같다"로, "키 3개 이하"가 "빨강 연속 금지"로 바뀌어 높이 ≤ 2·log₂(n + 1)이 된다.
- LLRB 삽입은 회전 둘과 색 뒤집기 하나, 삭제는 내려가며 2-노드를 피하는 B-트리 삭제다.
- 무작위 10만 개에서 높이는 LLRB 24, AVL 20이었다. 찾기 위주면 AVL, 갱신 위주면 고전 레드-블랙이 낫다.

## 더 알아보기
- 이전 글: 7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」
- 다음 글: 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」
