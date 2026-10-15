# [추상 데이터 타입 심화 11/21] 희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기

> **한 줄 요약** — 희생양 트리는 노드에 균형 정보를 하나도 두지 않고 평범한 BST처럼 넣다가, 새 노드가 log_{1/α} n보다 깊어지면 한쪽으로 쏠린 조상 하나(희생양)의 서브트리를 통째로 완전 균형으로 다시 지어서 분할 상환 O(log n)을 얻고, 노드마다 크기를 두는 무게 균형 트리는 같은 α-균형을 회전으로 지킨다.

## 이 글에서 다루는 것
- α-무게 균형과 α-높이 균형의 정의
- 너무 깊은 삽입에서 희생양을 찾아 다시 짓기, 많이 줄면 통째로 다시 짓기
- 퍼텐셜로 보는 분할 상환 O(log n)과 α에 따른 재구성 비용 실험
- 무게 균형 트리와 함수형 언어의 맵

## 예제 문제: 회전할 수 없는 트리
7편 「AVL 트리: 높이 차를 1 이하로 유지하는 회전」과 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」는 회전으로 균형을 고친다. 그런데 회전이 비싸거나 불가능한 트리가 있다. 13편 「k-d 트리: 다차원 범위 검색과 최근접 이웃」처럼 깊이마다 나누는 축이 다른 트리는 회전하면 축 규칙이 깨지고, 노드마다 서브트리 전체에 대한 보조 구조를 단 트리는 회전 한 번에 보조 구조를 새로 만들어야 한다. 노드 구조체에 높이나 색을 넣을 자리가 없는 경우도 있다.

이럴 때 쓰는 일반 전략이 **부분 재구성**(partial rebuilding)이다. 평소에는 아무것도 하지 않다가, 어딘가 너무 기울면 그 부분을 통째로 완전 균형으로 다시 짓는다. 다시 짓기는 크기에 비례해 비싸지만, 한 번 지은 부분이 다시 크게 기울려면 그만큼 많은 삽입이 필요하므로 비용을 나눠 내면 싸다. 안데르손(Arne Andersson)이 1989년 "일반 균형 트리"로 처음 내놓았고, 1993년 갈페린(Igal Galperin)과 리베스트(Ronald Rivest)가 다시 발견해 **희생양 트리**(scapegoat tree)라는 이름을 붙였다.

## α-무게 균형과 α-높이 균형
1/2 ≤ α < 1인 상수 α를 하나 정한다. 노드 x의 두 서브트리 크기가 모두 α·size(x) 이하이면 x는 **α-무게 균형**(α-weight-balanced)이다. α = 1/2이면 완전 균형, α가 1에 가까울수록 느슨하다. 모든 노드가 α-무게 균형이면 한 층 내려갈 때마다 크기가 α배 이하로 줄어 깊이가 log_{1/α} n을 넘지 못한다. 희생양 트리는 이 결론 쪽, 즉 **α-높이 균형**만 지킨다.
```text
h_α(n) = ⌊log_{1/α} n⌋
삽입한 노드 깊이 > h_α(n)이면
  경로 위에 다음을 만족하는
  조상(희생양)이 반드시 있다
  size(자식) > α·size(조상)
```
깊이가 h_α(n)을 넘었다면 경로의 모든 조상이 α-무게 균형일 수는 없다. 균형이었다면 깊이가 h_α(n) 이하였을 것이기 때문이다. 그래서 새 노드에서 위로 올라가며 크기를 세다가 처음 만나는 불균형 조상을 희생양으로 삼아 그 서브트리를 중위 순회로 펼친 뒤 가운데부터 다시 짓는다. 크기는 노드에 저장하지 않으므로 올라가면서 형제 서브트리를 세어 구한다. 삭제는 평범한 BST 삭제를 하고, 노드 수가 최근 최대 크기 `max_n`의 α배 아래로 떨어지면 트리 전체를 다시 짓는다.
```python
import math, random

class Node:
    __slots__ = ("key", "left", "right")     # 균형 정보가 없다
    def __init__(self, key): self.key, self.left, self.right = key, None, None

def size(t): return 1 + size(t.left) + size(t.right) if t else 0

def flatten(t, out):                         # 중위 순회로 노드를 모은다
    if t: flatten(t.left, out); out.append(t); flatten(t.right, out)
    return out

def build(nodes, lo, hi):                    # 완전 균형 트리로 다시 짓기
    if lo >= hi: return None
    m = (lo + hi) // 2
    t = nodes[m]
    t.left, t.right = build(nodes, lo, m), build(nodes, m + 1, hi)
    return t

class Scapegoat:
    def __init__(self, alpha):
        self.a, self.root, self.n, self.max_n = alpha, None, 0, 0
        self.work = 0                        # 다시 지은 노드 수의 합

    def h_alpha(self, n):                    # 허용 깊이 ⌊log_{1/α} n⌋
        return math.floor(math.log(n) / math.log(1 / self.a) + 1e-9)

    def rebuild(self, t):
        nodes = flatten(t, [])
        self.work += len(nodes)
        return build(nodes, 0, len(nodes))

    def insert(self, key):
        path, t = [], self.root
        while t:
            if key == t.key: return
            path.append(t)
            t = t.left if key < t.key else t.right
        x = Node(key)
        if not path: self.root = x
        elif key < path[-1].key: path[-1].left = x
        else: path[-1].right = x
        self.n += 1; self.max_n = max(self.max_n, self.n)
        if len(path) <= self.h_alpha(self.n): return
        sz, child = 1, x                     # 너무 깊다: 희생양 찾기
        for i in range(len(path) - 1, -1, -1):
            p = path[i]
            sib = p.right if p.left is child else p.left
            total = sz + size(sib) + 1
            if sz > self.a * total: break    # p가 희생양
            sz, child = total, p
        new = self.rebuild(p)
        if i == 0: self.root = new
        elif path[i - 1].left is p: path[i - 1].left = new
        else: path[i - 1].right = new

    def delete(self, key):
        parent, t = None, self.root
        while t and t.key != key:
            parent, t = t, (t.left if key < t.key else t.right)
        if t is None: return
        if t.left and t.right:               # 다음 키와 바꿔서 지운다
            parent, s = t, t.right
            while s.left: parent, s = s, s.left
            t.key, t = s.key, s
        child = t.left or t.right
        if parent is None: self.root = child
        elif parent.left is t: parent.left = child
        else: parent.right = child
        self.n -= 1
        if self.n < self.a * self.max_n:     # 많이 줄었으면 통째로
            self.root = self.rebuild(self.root) if self.root else None
            self.max_n = self.n

    def __contains__(self, key):
        t = self.root
        while t and t.key != key: t = t.left if key < t.key else t.right
        return t is not None

def height(t): return 1 + max(height(t.left), height(t.right)) if t else -1

sg, log = Scapegoat(0.6), []
for k in range(1, 11):
    w = sg.work; sg.insert(k)
    if sg.work > w: log.append(f"{k}:{sg.work - w}")
print("다시 짓기(키:노드 수)", *log)
print("높이", height(sg.root), "허용", sg.h_alpha(sg.n))
```
```text
다시 짓기(키:노드 수) 4:3 6:3 7:6 10:3
높이 4 허용 4
```
1~10을 차례로 넣으면 일반 BST는 사슬이 되지만, 희생양 트리는 네 번만 다시 지어 높이를 허용치 4에 묶는다. 트리가 저장하는 균형 정보는 `n`과 `max_n` 두 정수뿐이다.

## 왜 분할 상환 O(log n)인가
노드마다 두 서브트리 크기 차를 재고, 그 합을 퍼텐셜로 둔다(분할 상환과 퍼텐셜은 심화 알고리즘 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」 참고).
```text
Φ = c·Σ max(0, ∣size(L)−size(R)∣−1)
삽입: 경로 위 조상의 차가 1씩 변함
  ⇒ ΔΦ ≤ c·O(log n)
희생양 x에서
  크기 차 > (2α − 1)·size(x) + 1
다시 지은 뒤 x 아래 Φ = 0
c = 1/(2α − 1)이면 Φ 감소분이
재구성 비용 size(x)를 갚는다
```
완전 균형으로 지은 서브트리는 퍼텐셜이 0이고, 그것이 다시 희생양이 될 만큼 기울려면 크기에 비례하는 삽입이 그 안에 쌓여야 한다. 상수 1/(2α − 1)은 α가 1/2에 다가갈수록 커진다. 균형을 빡빡하게 요구할수록 자주 다시 짓는다는 뜻이다. 삭제 쪽의 통째 재구성은 그 사이에 (1 − α)·max_n개 넘는 삭제가 있었으므로 그 삭제들이 나눠 낸다.

## 모델 기반 대조
앞 코드에 이어서, α를 바꿔 가며 삽입·삭제·찾기를 섞고 파이썬 `set`과 비교한다. 매 연산 뒤에 중위 순회가 정렬된 키 목록과 같은지, 높이가 ⌊log_{1/α} max_n⌋ 이하인지 검사한다.
```python
rng, ok = random.Random(11), 0
for case in range(500):
    sg, ref, same = Scapegoat(rng.choice([0.55, 0.7, 0.9])), set(), True
    for _ in range(100):
        op, x = rng.randrange(3), rng.randrange(40)
        if op == 0: sg.insert(x); ref.add(x)
        elif op == 1: sg.delete(x); ref.discard(x)
        else: same &= (x in sg) == (x in ref)
        keys = [v.key for v in flatten(sg.root, [])]
        same &= keys == sorted(ref) and sg.n == len(ref)
        if sg.n: assert height(sg.root) <= sg.h_alpha(sg.max_n)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치, 높이 ≤ ⌊log_(1/α) max_n⌋ 통과")
```
```text
무작위 500개 비교: 500개 일치, 높이 ≤ ⌊log_(1/α) max_n⌋ 통과
```

## α에 따른 재구성 비용
앞 코드에 이어서, 키 2¹⁴ = 16,384개를 정렬 순서와 무작위 순서로 넣는다. 각 항목은 "삽입당 다시 지은 노드 수·최종 높이"다.
```python
n = 1 << 14
orders = [("정렬", range(n)), ("무작위", random.Random(3).sample(range(n), n))]
for a in (0.55, 0.6, 0.7, 0.8, 0.9):
    row = []
    for name, keys in orders:
        sg = Scapegoat(a)
        for k in keys: sg.insert(k)
        row.append(f"{name} {sg.work / n:.2f}·{height(sg.root)}")
    print(f"α={a} 허용 {sg.h_alpha(n)}:", ", ".join(row))
```
```text
α=0.55 허용 16: 정렬 38.62·16, 무작위 1.96·16
α=0.6 허용 18: 정렬 23.91·18, 무작위 0.77·18
α=0.7 허용 27: 정렬 14.37·27, 무작위 0.02·27
α=0.8 허용 43: 정렬 10.23·41, 무작위 0.00·34
α=0.9 허용 92: 정렬 7.93·88, 무작위 0.00·34
```
정렬 순서는 일반 BST라면 높이 16,383이 되는 최악 입력이다. 희생양 트리는 모든 α에서 높이를 허용치 안에 묶고, 그 대가인 재구성 비용은 α = 0.9의 삽입당 7.9개에서 α = 0.55의 38.6개로 α가 1/2에 가까울수록 빠르게 는다. 무작위 순서에서는 BST가 원래 깊이 34 안팎으로 꽤 고르므로, α ≥ 0.7이면 재구성이 삽입당 0.02개 이하로 거의 없다. 찾기가 많으면 α를 작게(낮은 트리), 삽입이 많으면 크게 잡는 손잡이가 생긴다.

## 무게 균형 트리와 함수형 언어의 맵
노드마다 서브트리 크기를 저장해도 된다면, α-무게 균형을 회전으로 직접 지킬 수 있다. 니버겔트(Jürg Nievergelt)와 라인골드(Edward Reingold)가 1972년 발표한 **무게 균형 트리**(weight-balanced tree, BB[α])가 그것이다. 삽입·삭제 뒤 올라오며 한쪽 크기가 다른 쪽의 상수배를 넘으면 단일 또는 이중 회전을 한다.

크기 필드는 덤 이상이다. 12편 「정보를 덧붙인 트리: 순위 통계 트리와 구간 트리」의 서브트리 크기와 같은 값이라 k번째 원소와 순위가 O(log n)이고 전체 크기는 O(1)이다. 또 두 트리의 합집합·교집합을 분할 정복으로 할 때 양쪽 크기를 바로 알 수 있어 편하다. 하스켈 `containers` 패키지의 `Data.Map`은 문서에 "크기 균형 이진 트리"로 구현했다고 밝히고, 애덤스(Stephen Adams)의 1993년 논문과 니버겔트·라인골드를 근거로 든다. 바뀌지 않는 값을 쓰는 함수형 언어에서는 갱신이 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」의 경로 복사가 되는데, 크기만 고치면 되는 무게 균형이 잘 맞는다.

## 자주 하는 실수와 변형
- 희생양을 찾을 때 매번 크기를 처음부터 세면 비싸 보이지만, 세는 서브트리는 곧 다시 지을 서브트리 안이라 재구성 비용에 묻힌다. 다만 재귀 `size`는 깊이가 깊으면 재귀 한도에 걸리니 실무에서는 반복문으로 쓴다.
- `h_alpha`를 부동소수 로그로 구할 때 경계(예: n = α⁻ᵏ)에서 내림이 틀릴 수 있다. 작은 여유(1e-9)를 더하거나 정수 비교로 바꾼다.
- 변형: 삭제를 "지움 표시"로만 하고 표시가 절반을 넘으면 다시 짓는 게으른 삭제, 다차원에서 축 규칙을 지키며 다시 짓는 동적 k-d 트리.

## 복잡도
| 연산 | 희생양 트리 | 무게 균형 트리 |
|---|---|---|
| 찾기 | 최악 O(log n) | 최악 O(log n) |
| 삽입·삭제 | 분할 상환 O(log n) | 최악 O(log n) |
| 노드당 추가 정보 | 없음 | 서브트리 크기 |
| 순위·k번째 | O(n) | O(log n) |

- 근거: 높이가 늘 h_α(max_n) ≤ log_{1/α} n + 1 이하라 찾기는 최악 O(log n)이다. 재구성 비용은 퍼텐셜로 삽입마다 O(log n)씩 미리 낸다. 한 번의 삽입은 최악 O(n)일 수 있다.

## 어디에 쓰이나
- 13편 「k-d 트리: 다차원 범위 검색과 최근접 이웃」: 회전할 수 없는 k-d 트리에 삽입을 허용할 때, 기울어진 서브트리를 다시 짓는 이 글의 방식을 쓸 수 있다.
- 게임 자원 관리 8편 「공간 분할 2: 쿼드트리와 BVH」: BVH를 매 프레임 다시 짓지 않고 상자만 고치는(refit) 것도 다시 짓기를 미뤄 비용을 나누는 같은 계열의 선택이다.
- 하스켈 `Data.Map`·`Data.Set`: 크기 균형(무게 균형) 트리로 구현된 표준 정렬 맵·집합이다.

## 정리
- α-무게 균형이면 깊이가 log_{1/α} n 이하다. 희생양 트리는 깊이만 감시하다가 넘치면 불균형 조상을 찾아 다시 짓는다.
- 노드에 정보를 두지 않고도 찾기는 최악 O(log n), 갱신은 퍼텐셜 c·Σ(크기 차)로 분할 상환 O(log n)이다.
- 정렬 입력 16,384개에서 삽입당 재구성 비용은 α = 0.9일 때 7.9, 0.55일 때 38.6이었다. α는 높이와 갱신 비용 사이의 손잡이다.
- 크기를 저장하는 무게 균형 트리는 같은 균형을 회전으로 지키고, 순위 질의와 함수형 맵에 잘 맞는다.

## 더 알아보기
- 이전 글: 10편 「스킵 리스트: 동전 던지기로 만드는 균형」
- 다음 글: 12편 「정보를 덧붙인 트리: 순위 통계 트리와 구간 트리」
- 위키백과 Scapegoat tree: https://en.wikipedia.org/wiki/Scapegoat_tree
