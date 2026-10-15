# [추상 데이터 타입 심화 12/21] 정보를 덧붙인 트리: 순위 통계 트리와 구간 트리

> **한 줄 요약** — 균형 탐색 트리의 노드에 "자기와 두 자식만 보고 계산되는 값"을 덧붙이면 삽입·삭제·회전 뒤에도 바뀐 경로만 고쳐 O(log n)을 유지하므로, 서브트리 크기를 붙이면 k번째 원소와 순위를, 서브트리 최대 끝점을 붙이면 겹치는 구간 찾기를 로그 시간에 하는 동적 자료 구조가 된다.

## 이 글에서 다루는 것
- 덧붙인 정보가 회전 뒤에도 O(1)에 고쳐지는 조건
- 순위 통계 트리: 서브트리 크기로 k번째 원소와 순위
- 구간 트리: 서브트리 최대 끝점으로 겹치는 구간 찾기와 그 가지치기
- 세그먼트·펜윅 트리와 비교, 모델 기반 대조와 방문 노드 실험

## 예제 문제: 들어오고 나가는 값과 예약
두 가지 문제를 보자. ① 실수 점수가 들어오고 나가는 동안 "지금 k번째로 작은 점수"와 "점수 x는 몇 번째인가"를 묻는다. ② 회의실 예약 [시작, 끝]이 추가되고 취소되는 동안 "새 예약 [lo, hi]와 겹치는 예약이 있는가, 모두 무엇인가"를 묻는다. 둘 다 정렬 맵(7~11편)으로 키를 관리하는 것까지는 쉽다. 그런데 정렬 맵의 기본 연산만으로는 ①의 k번째를 찾으려면 앞에서부터 세야 하고, ②는 시작점으로 정렬해도 끝점이 제각각이라 모든 예약을 봐야 한다. 둘 다 O(n)이다.

## 덧붙이기의 조건
해결책은 노드마다 서브트리 전체를 요약한 값 하나를 덧붙이는 것이다. 어떤 값이든 되는 것은 아니다. 다음 조건을 만족해야 한다(CLRS의 "자료 구조 덧붙이기" 장에 나오는 정리).
```text
f(x)가 x 자신의 필드와
f(x.left), f(x.right)만으로 계산되면
⇒ 삽입·삭제 때 경로 위 노드만 다시 계산
⇒ 회전 한 번에 두 노드만 다시 계산
⇒ 균형 트리의 O(log n)이 그대로 유지
```
서브트리 크기(`1 + 왼쪽 크기 + 오른쪽 크기`)와 서브트리 최대 끝점(`max(자기 끝점, 왼쪽 최대, 오른쪽 최대)`)은 조건을 만족한다. 반대로 "노드의 순위"나 "노드의 깊이"를 노드에 직접 저장하면, 맨 앞에 하나만 넣어도 모든 노드의 순위가 바뀌고 회전 한 번에 서브트리 전체의 깊이가 바뀐다. 이런 값은 저장하지 않고 내려가면서 계산한다.

바탕 트리는 무엇이든 되지만, 여기서는 회전이 보이도록 회전식 트립을 쓴다(split·merge 판은 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」). 핵심은 `pull` 하나다. 회전하면 위치가 바뀐 두 노드만, 아래 노드부터 다시 계산한다.

## 순위 통계 트리
서브트리 크기 `size`가 있으면 k번째 원소는 왼쪽 크기와 k를 비교하며 한 경로만 내려가면 되고, 순위(key 미만 개수)는 오른쪽으로 갈 때마다 왼쪽 크기 + 1을 더하면 된다. 이렇게 크기를 덧붙인 트리를 **순위 통계 트리**(order statistic tree)라 한다.
```python
import random, bisect

class Node:
    __slots__ = ("key", "hi", "pri", "left", "right", "size", "mx")
    def __init__(self, key, hi, pri):    # hi = 구간 끝점
        self.key, self.hi, self.pri = key, hi, pri
        self.left = self.right = None
        self.size, self.mx = 1, hi

PULLS = [0]
def pull(t):                             # 자기와 두 자식만 본다
    PULLS[0] += 1
    t.size, t.mx = 1, t.hi
    for c in (t.left, t.right):
        if c: t.size += c.size; t.mx = max(t.mx, c.mx)

def rot_right(t):                        # 회전 뒤에는 두 노드만 고친다
    l = t.left; t.left, l.right = l.right, t
    pull(t); pull(l); return l

def rot_left(t):
    r = t.right; t.right, r.left = r.left, t
    pull(t); pull(r); return r

def insert(t, x):                        # 회전식 트립 삽입
    if t is None: return x
    if x.key < t.key:
        t.left = insert(t.left, x)
        if t.left.pri > t.pri: return rot_right(t)
    else:
        t.right = insert(t.right, x)
        if t.right.pri > t.pri: return rot_left(t)
    pull(t); return t

def erase(t, key):                       # 회전으로 내려 지운다
    if t is None: return None
    if key < t.key: t.left = erase(t.left, key)
    elif key > t.key: t.right = erase(t.right, key)
    elif not (t.left and t.right): return t.left or t.right
    elif t.left.pri > t.right.pri:
        t = rot_right(t); t.right = erase(t.right, key)
    else:
        t = rot_left(t); t.left = erase(t.left, key)
    pull(t); return t

def kth(t, k):                           # 0부터 센 k번째 키
    while True:
        ls = t.left.size if t.left else 0
        if k == ls: return t.key
        t, k = (t.left, k) if k < ls else (t.right, k - ls - 1)

def rank(t, key):                        # key 미만인 원소 수
    r = 0
    while t:
        if t.key < key: r += (t.left.size if t.left else 0) + 1; t = t.right
        else: t = t.left
    return r

rng, root = random.Random(1), None
for x in [50, 20, 80, 20, 65, 10]:
    root = insert(root, Node(x, x, rng.random()))
root = erase(root, 20)
print([kth(root, i) for i in range(root.size)], rank(root, 65))
```
```text
[10, 20, 50, 65, 80] 3
```
20을 두 번 넣고 한 번 지웠으므로 하나가 남고, 65 미만인 원소는 3개다.

## 구간 트리
구간을 시작점 순으로 트리에 넣고, 노드마다 서브트리 구간 끝점의 최댓값 `mx`를 덧붙인 것이 **구간 트리**(interval tree)다. 닫힌 구간 [a, b]와 [lo, hi]는 a ≤ hi이고 lo ≤ b일 때 겹친다. 두 가지 가지치기가 핵심이다.
- 서브트리의 `mx < lo`이면 그 안의 구간은 모두 lo 전에 끝나므로 통째로 건너뛴다.
- 노드의 시작점 a가 hi보다 크면 오른쪽 서브트리의 시작점도 모두 hi보다 커서 볼 필요가 없다.

겹치는 구간 **하나**만 찾을 때는 한 경로로 충분하다. 왼쪽 서브트리의 `mx ≥ lo`이면 왼쪽으로 간다. 왼쪽에 겹치는 구간이 없다면, 끝점이 lo 이상인 그 구간은 시작점이 hi보다 커야 하고, 시작점이 그보다 큰 오른쪽 구간들도 모두 겹칠 수 없다. 그래서 오른쪽을 버려도 된다. 앞 코드에 이어서 실행한다.
```python
VISIT = [0]
def overlaps(t, lo, hi, out):            # [lo, hi]와 겹치는 구간 모두
    if t is None or t.mx < lo: return out   # 끝점이 모두 lo 앞이면 건너뜀
    VISIT[0] += 1
    overlaps(t.left, lo, hi, out)
    a, b = t.key
    if a <= hi:                          # a > hi면 오른쪽도 모두 hi 뒤
        if lo <= b: out.append(t.key)
        overlaps(t.right, lo, hi, out)
    return out

def any_overlap(t, lo, hi):              # 겹치는 구간 하나, O(log n)
    while t and not (t.key[0] <= hi and lo <= t.hi):
        t = t.left if t.left and t.left.mx >= lo else t.right
    return t.key if t else None

iv = None
for a, b in [(1, 3), (5, 8), (6, 10), (15, 23), (17, 19), (25, 30)]:
    iv = insert(iv, Node((a, b), b, rng.random()))
print(overlaps(iv, 9, 16, []))
print(any_overlap(iv, 11, 14), any_overlap(iv, 24, 26))
```
```text
[(6, 10), (15, 23)]
None (25, 30)
```
[9, 16]과 겹치는 것은 [6, 10]과 [15, 23]이다. [11, 14]와 겹치는 예약은 없고, [24, 26]은 [25, 30]과 겹친다.

## 모델 기반 대조
앞 코드에 이어서, 구간을 키로 삼아 삽입·삭제·k번째·순위·겹침 질의를 섞고 정렬 리스트와 "전부 훑기"를 참조 구현으로 비교한다. 매 연산 뒤에 힙 순서와 모든 노드의 `size`·`mx`를 처음부터 다시 세어 저장된 값과 맞춘다.
```python
def check(t):                            # 크기·최대 끝점을 다시 세어 대조
    if t is None: return 0, -1
    assert all(c is None or c.pri <= t.pri for c in (t.left, t.right))
    (ls, lm), (rs, rm) = check(t.left), check(t.right)
    assert t.size == ls + rs + 1 and t.mx == max(t.hi, lm, rm)
    return t.size, t.mx

rng, ok = random.Random(12), 0
for _ in range(500):
    root, ref, same = None, [], True     # ref = 정렬된 구간 목록
    for _ in range(60):
        op, a = rng.randrange(4), rng.randrange(50)
        b = a + rng.randrange(10)
        if op == 0:
            root = insert(root, Node((a, b), b, rng.random()))
            bisect.insort(ref, (a, b))
        elif op == 1 and ref:
            k = rng.choice(ref); root = erase(root, k); ref.remove(k)
        elif op == 2 and ref:
            i = rng.randrange(len(ref))
            same &= kth(root, i) == ref[i]
            same &= rank(root, (a, b)) == bisect.bisect_left(ref, (a, b))
        else:
            want = [k for k in ref if k[0] <= b and a <= k[1]]
            same &= overlaps(root, a, b, []) == want
            one = any_overlap(root, a, b)
            same &= one in want if want else one is None
        same &= check(root)[0] == len(ref)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치, 불변식 검사 통과")
```
```text
무작위 500개 비교: 500개 일치, 불변식 검사 통과
```

## 실험: 고치는 비용과 방문 노드
앞 코드에 이어서, 길이 0~999인 구간 10만 개를 넣으며 삽입당 `pull` 횟수를 세고, 폭을 바꾼 질의 구간 200개에 대해 답의 개수와 방문한 노드 수를 잰다.
```python
import math

n, rng, root = 100000, random.Random(3), None
PULLS[0] = 0
for _ in range(n):                       # 길이 0~999인 구간 10만 개
    a = rng.randrange(10**6); b = a + rng.randrange(1000)
    root = insert(root, Node((a, b), b, rng.random()))
print(f"삽입당 pull {PULLS[0] / n:.1f}회 (log₂ n = {math.log2(n):.1f})")
for w in (0, 1000, 10000, 100000):       # 질의 구간 폭
    k = v = 0
    for _ in range(200):
        lo = rng.randrange(10**6)
        VISIT[0] = 0
        k += len(overlaps(root, lo, lo + w, [])); v += VISIT[0]
    print(f"폭 {w}: 답 {k / 200:.0f}개, 방문 노드 {v / 200:.0f}개")
```
```text
삽입당 pull 22.1회 (log₂ n = 16.6)
폭 0: 답 51개, 방문 노드 92개
폭 1000: 답 148개, 방문 노드 189개
폭 10000: 답 1043개, 방문 노드 1083개
폭 100000: 답 9579개, 방문 노드 9619개
```
삽입당 `pull` 22회는 삽입 경로 길이(트립의 기대 깊이 2·ln n ≈ 23)에 회전 몫이 더해진 값이다. 덧붙인 정보를 유지하는 비용이 O(log n)이라는 뜻이다. 질의는 답이 51개일 때 노드 92개, 9,579개일 때 9,619개를 방문해 대략 "답 + 40"이었다. 전부 훑으면 매번 10만 개다. 이 열거 방식의 최악 보장은 O(min(n, k·log n))이지만, 이처럼 구간이 고르게 퍼져 있으면 O(k + log n)에 가깝다.

## 세그먼트·펜윅 트리와 비교
고급 자료 구조 3편 「세그먼트 트리: 구간 질의와 점 갱신」과 고급 자료 구조 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」도 k번째 원소나 구간 겹침 개수를 O(log n)에 답한다. 다만 둘 다 좌표 범위가 미리 정해진 배열 위의 구조라, 키가 실수·문자열이거나 미리 알 수 없으면 질의를 모두 모아 좌표 압축을 해야 한다(오프라인). 덧붙인 균형 트리는 키가 무엇이든 들어오는 대로 처리하고, 공간도 좌표 범위가 아니라 원소 수에 비례한다. 반대로 좌표가 작고 고정이면 세그먼트·펜윅 트리가 코드가 짧고 상수가 작으며, 구간 일괄 갱신(레이지 전파)도 쉽다.

## 자주 하는 실수와 변형
- 회전에서 `pull` 순서를 거꾸로 하면 틀린다. 내려간 노드(원래 부모)를 먼저, 올라온 노드를 나중에 고친다.
- 삭제 경로에서 `pull`을 빠뜨리면 지운 구간의 끝점이 조상의 `mx`에 남아, 가지치기가 덜 될 뿐 답은 맞아서 오래 숨는다. 매번 다시 세는 검사가 잡는다.
- 변형: 합·최솟값을 덧붙이면 키 순서 구간의 합(동적 누적 합)이, 선분의 최소 높이를 덧붙이면 동적 스카이라인이 된다. 키 대신 위치를 쓰는 암시적 트립에 덧붙이면 수열 편집과 구간 질의를 함께 한다.

## 복잡도
| 연산 | 덧붙인 균형 트리 | 정렬 맵만 |
|---|---|---|
| 삽입·삭제 | O(log n) | O(log n) |
| k번째·순위 | O(log n) | O(n) |
| 겹치는 구간 하나 | O(log n) | O(n) |
| 겹치는 구간 k개 | O(min(n, k·log n)) | O(n) |

- 근거: 덧붙인 값은 자기와 두 자식으로 계산되므로 경로 길이 O(log n)만큼 고치고, 질의는 한 경로(또는 가지치기된 경로들)만 내려간다. 바탕 트리가 트립이면 모두 기대 시간이고, 레드-블랙이나 AVL이면 최악 시간이다. 공간 O(n).

## 어디에 쓰이나
- 고급 자료 구조 3편 「세그먼트 트리: 구간 질의와 점 갱신」: 세그먼트 트리의 노드 값도 "두 자식으로 계산되는 요약"이라는 같은 원리다. 모양이 고정이냐, 키에 따라 바뀌느냐가 다르다.
- 11편 「희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기」: 무게 균형 트리가 균형 유지를 위해 저장하는 서브트리 크기가 곧 이 글의 순위 통계 정보다.
- 리눅스 커널: rbtree 문서가 "덧붙인 레드-블랙 트리"(augmented rbtree)를 설명하며 구간 트리를 그 예로 든다.

## 정리
- 자기와 두 자식만으로 계산되는 값은 삽입·삭제·회전 뒤에 바뀐 노드만 고쳐 O(log n)에 유지된다.
- 서브트리 크기를 붙이면 k번째와 순위가, 서브트리 최대 끝점을 붙이면 겹치는 구간 찾기가 O(log n)이다.
- 구간 10만 개 실험에서 삽입당 `pull`은 22회, 겹침 열거의 방문 노드는 대략 답 + 40개였다.
- 키가 미리 정해지지 않은 동적·온라인 상황에서 세그먼트·펜윅 트리 대신 쓴다.

## 더 알아보기
- 이전 글: 11편 「희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기」
- 다음 글: 13편 「k-d 트리: 다차원 범위 검색과 최근접 이웃」
- 위키백과 Interval tree: https://en.wikipedia.org/wiki/Interval_tree
