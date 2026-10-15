# [추상 데이터 타입 심화 10/21] 스킵 리스트: 동전 던지기로 만드는 균형

> **한 줄 요약** — 스킵 리스트는 정렬 연결 리스트의 노드마다 동전을 던져 확률 p로 한 층씩 올린 "급행 노선"을 깔아, 회전도 균형 조건도 없이 기대 O(log n)에 찾기·삽입·삭제를 하고, 간선마다 건너뛰는 칸 수를 적어 두면 순위 질의까지 된다.

## 이 글에서 다루는 것
- 정렬 연결 리스트에 층을 쌓는 아이디어와 기대 높이·검색 경로 길이
- 폭(width)을 저장해 k번째 원소와 순위를 O(log n)에
- 정렬 리스트와의 모델 기반 대조, p에 따른 높이·걸음 수·공간 실험
- 균형 트리보다 동시성 구현이 쉬운 이유

## 예제 문제: 실시간 순위표
게임 점수판에 점수가 계속 바뀐다. 점수 넣기·빼기와 함께 "7등은 누구인가", "이 점수는 몇 등인가"를 바로 답해야 한다. 정렬 맵에 순위 연산을 더한 ADT다. 정렬 배열은 이분 탐색으로 위치를 O(log n)에 찾지만 끼워 넣느라 O(n)이고, 정렬 연결 리스트는 끼우기는 O(1)인데 위치를 찾으려면 처음부터 걸어야 해서 O(n)이다. 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」 같은 균형 트리는 답이지만 회전 규칙이 복잡하다.

## 아이디어: 급행 노선을 동전으로 깐다
연결 리스트 위에 노드를 하나 걸러 한 번씩 잇는 2층을 깔면 2층으로 달리다 내려와 한두 칸만 걸으면 되니 걸음이 절반이 된다. 2층 위에 다시 하나 걸러 3층을 깔기를 반복하면 층이 log₂ n개, 검색은 이분 탐색처럼 O(log n)이다. 문제는 삽입·삭제 뒤에 "정확히 하나 걸러"를 유지하는 일이다.

퓨(William Pugh)가 1990년 발표한 **스킵 리스트**(skip list)는 정확한 모양을 포기한다. 새 노드를 넣을 때 동전을 던져 앞면(확률 p)이 나오는 동안 한 층씩 올린다. 그러면 k층 이상인 노드의 비율이 평균 pᵏ⁻¹이 되어, 평균적으로 위의 이상적인 모양을 닮는다. 모양이 입력 순서가 아닌 동전에 달려 있다는 점은 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」의 무작위 우선순위와 같은 발상이다.

검색 경로를 거꾸로 따라가면 비용을 셀 수 있다. 찾은 노드에서 거꾸로 걸을 때 각 노드에서 "위층이 있으면 올라가고(확률 p), 없으면 왼쪽으로 간다(1 − p)". 한 층 올라가는 데 평균 1/p걸음이고, 노드가 n개면 층은 log_{1/p} n개 남짓이다.
```text
L(n) = log_{1/p} n   (기대 층 수)
걸음 ≈ L(n)/p + 1/(1 − p)
노드당 포인터 = 1/(1 − p)
```

## 구현: 폭을 적은 스킵 리스트
노드는 층마다 다음 노드 포인터 `next[i]`와, 그 간선이 바닥층에서 건너뛰는 칸 수 **폭**(width) `width[i]`를 가진다. 검색은 맨 위층에서 다음 키가 목표보다 작은 동안 옆으로 가고, 아니면 한 층 내려간다. 내려가며 지난 간선의 폭을 더하면 그 위치의 **순위**가 나온다. 삽입은 층마다 마지막으로 멈춘 노드(`upd`) 뒤에 끼우고, 끼운 층에서는 간선 폭을 둘로 나누고 그 위층 간선은 1 늘린다. 삭제는 거꾸로 한다.
```python
import random, bisect, math

class SNode:
    __slots__ = ("key", "next", "width")
    def __init__(self, key, h):          # width[i] = next[i]까지 몇 칸
        self.key, self.next, self.width = key, [None] * h, [1] * h

class SkipList:
    MAX = 32
    def __init__(self, p=0.5, seed=0):
        self.p, self.rng = p, random.Random(seed)
        self.head, self.level, self.n, self.steps = SNode(None, 32), 1, 0, 0

    def _path(self, key):                # 층마다 key 앞 마지막 노드와 순위
        x, pos = self.head, 0
        upd, rank = [None] * self.MAX, [0] * self.MAX
        for i in range(self.level - 1, -1, -1):
            while x.next[i] and x.next[i].key < key:
                pos += x.width[i]; x = x.next[i]; self.steps += 1
            upd[i], rank[i] = x, pos
            self.steps += 1              # 한 층 내려가기
        return upd, rank

    def __contains__(self, key):
        x = self._path(key)[0][0].next[0]
        return x is not None and x.key == key

    def insert(self, key):
        upd, rank = self._path(key)
        if upd[0].next[0] and upd[0].next[0].key == key: return
        h = 1
        while h < self.MAX and self.rng.random() < self.p: h += 1
        for i in range(self.level, h):   # 새로 생긴 층은 머리에서 끝까지
            upd[i], rank[i], self.head.width[i] = self.head, 0, self.n + 1
        self.level = max(self.level, h)
        x, pos = SNode(key, h), rank[0] + 1
        for i in range(self.level):
            if i < h:                    # 이 층에 끼워 넣고 폭을 나눈다
                x.next[i], upd[i].next[i] = upd[i].next[i], x
                x.width[i] = upd[i].width[i] - (pos - rank[i]) + 1
                upd[i].width[i] = pos - rank[i]
            else:
                upd[i].width[i] += 1     # 위층 간선은 한 칸 길어진다
        self.n += 1

    def delete(self, key):
        upd, _ = self._path(key)
        x = upd[0].next[0]
        if x is None or x.key != key: return
        for i in range(self.level):
            if upd[i].next[i] is x:
                upd[i].width[i] += x.width[i] - 1
                upd[i].next[i] = x.next[i]
            else:
                upd[i].width[i] -= 1
        while self.level > 1 and self.head.next[self.level - 1] is None:
            self.level -= 1
        self.n -= 1

    def kth(self, k):                    # 0부터 센 k번째 키
        x, pos = self.head, 0
        for i in range(self.level - 1, -1, -1):
            while x.next[i] and pos + x.width[i] <= k + 1:
                pos += x.width[i]; x = x.next[i]
        return x.key

    def rank(self, key):                 # key 미만 원소 수
        return self._path(key)[1][0]

s = SkipList(seed=15)
for k in range(1, 11): s.insert(k)
for i in range(s.level - 1, -1, -1):
    row, x = [], s.head.next[i]
    for k in range(1, 11):
        on = x is not None and x.key == k
        row.append(f"{k:2}" if on else " .")
        if on: x = x.next[i]
    print(f"L{i + 1}", *row)
print("kth(6) =", s.kth(6), " rank(7.5) =", s.rank(7.5))
```
```text
L4  .  .  .  .  .  .  .  .  9  .
L3  .  .  .  .  .  .  .  8  9  .
L2  .  2  3  4  .  .  .  8  9  .
L1  1  2  3  4  5  6  7  8  9 10
kth(6) = 7  rank(7.5) = 7
```
9는 4층까지 올라간 노드다. 위층일수록 듬성듬성한 급행 노선이 된다. `kth(6)`은 0부터 세어 일곱째 키 7이고, 7.5 미만인 키는 7개다.

## 모델 기반 대조
앞 코드에 이어서, p = 1/4과 1/2에서 삽입·삭제·찾기·순위·k번째를 섞어 정렬 리스트(`bisect`)와 비교한다. 매 연산 뒤에 층마다 키가 오름차순인지, 모든 간선의 폭이 바닥층에서 센 실제 칸 수와 같은지 검사한다.
```python
def check(s):                            # 층마다 정렬 + 폭 = 실제 칸 수
    pos, x = {}, s.head.next[0]
    while x: pos[id(x)] = len(pos) + 1; x = x.next[0]
    assert len(pos) == s.n
    for i in range(s.level):
        x, p = s.head, 0
        while x:
            nx = x.next[i]
            q = pos[id(nx)] if nx else s.n + 1
            assert q > p and x.width[i] == q - p
            assert nx is None or x is s.head or x.key < nx.key
            x, p = nx, q

rng, ok = random.Random(10), 0
for case in range(500):
    s, ref, same = SkipList(p=rng.choice([0.25, 0.5]), seed=case), [], True
    for _ in range(80):
        op, x = rng.randrange(5), rng.randrange(30)
        i = bisect.bisect_left(ref, x)
        has = i < len(ref) and ref[i] == x
        if op == 0:
            s.insert(x)
            if not has: ref.insert(i, x)
        elif op == 1:
            s.delete(x)
            if has: ref.pop(i)
        elif op == 2: same &= (x in s) == has
        elif op == 3: same &= s.rank(x) == i
        elif ref:
            k = rng.randrange(len(ref)); same &= s.kth(k) == ref[k]
        check(s)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치, 불변식 검사 통과")
```
```text
무작위 500개 비교: 500개 일치, 불변식 검사 통과
```

## p에 따라 높이와 걸음 수가 어떻게 바뀌나
앞 코드에 이어서, 키 2¹⁶ = 65,536개를 넣고 있는 키 5,000개를 찾으며 걸음 수(옆으로 + 아래로)를 센다. 최고층은 log_{1/p} n과, 걸음은 앞의 이론값과, 노드당 포인터 수는 1/(1 − p)와 비교한다.
```python
n = 1 << 16
keys = random.Random(5).sample(range(10 * n), n)
for p in (1 / 2, 1 / math.e, 1 / 4, 1 / 8):
    s = SkipList(p, seed=1)
    for k in keys: s.insert(k)
    s.steps = 0
    for k in keys[:5000]: k in s
    L = math.log(n, 1 / p)               # log_{1/p} n
    ptr, x = 0, s.head.next[0]
    while x: ptr += len(x.next); x = x.next[0]
    print(f"p={p:.3f}: 층 {s.level}(log {L:.1f}) 걸음 {s.steps / 5000:.1f}"
          f"(이론 {L / p + 1 / (1 - p):.1f}) 포인터 {ptr / n:.2f}")
```
```text
p=0.500: 층 18(log 16.0) 걸음 32.5(이론 34.0) 포인터 2.00
p=0.368: 층 11(log 11.1) 걸음 31.3(이론 31.7) 포인터 1.58
p=0.250: 층 10(log 8.0) 걸음 31.4(이론 33.3) 포인터 1.33
p=0.125: 층 6(log 5.3) 걸음 35.2(이론 43.8) 포인터 1.14
```
최고층은 log_{1/p} n보다 많아야 두 층 높고, 노드당 포인터는 1/(1 − p)와 소수 둘째 자리까지 맞는다. 걸음 수는 이론값 근처에서 p = 1/e ≈ 0.37일 때 가장 적고 1/4도 거의 같다. p를 1/4로 낮추면 걸음은 그대로인데 포인터가 2개에서 1.33개로 준다. 퓨도 논문에서 1/4을 권했고, 실무 구현도 즐겨 쓴다. p = 1/8처럼 너무 낮추면 한 층에서 옆으로 걷는 길이가 길어져 걸음이 늘어난다.

## 동시성: 고칠 곳이 이웃뿐이다
균형 트리의 회전은 조상 쪽으로 번질 수 있어서, 여러 스레드가 동시에 고치려면 넓은 범위를 잠가야 한다. 스킵 리스트의 삽입은 층마다 바로 앞 노드의 포인터 하나씩만 바꾸고, 바닥층부터 하나씩 이어 붙이면 중간 상태도 "몇몇 급행 노선이 아직 없는" 올바른 스킵 리스트다. 그래서 포인터 하나를 원자적으로 바꾸는 비교 후 교환(CAS)만으로 잠금 없는 구현을 만들기 쉽다. 자바의 `ConcurrentSkipListMap`이 이런 동시 스킵 리스트다.

## 자주 하는 실수와 변형
- 새로 생긴 층의 머리 폭을 n + 1(끝까지 거리)로 초기화하지 않으면 순위가 어긋난다. 폭 검사가 바로 잡는다.
- 삭제 뒤 빈 위층을 줄이지 않으면 검색이 빈 층을 매번 헛걸음한다.
- 층 수에 상한(여기서는 32)을 두되 log_{1/p} n보다 넉넉하게 잡는다. 난수 시드가 노출되면 공격자가 높이를 예측할 수 있다는 점은 트립과 같다.
- 변형: 위층 간선마다 합·최댓값을 적으면 구간 집계가 되고, 키 대신 폭만 쓰면 위치로 접근하는 리스트가 된다.

## 복잡도
| 연산 | 스킵 리스트 | 정렬 배열 |
|---|---|---|
| 찾기·순위·k번째 | 기대 O(log n) | O(log n) |
| 삽입·삭제 | 기대 O(log n) | O(n) |
| 공간(포인터) | 기대 n/(1 − p) | n |

- 근거: 기대 층 수가 log_{1/p} n이고 층마다 옆으로 평균 1/p걸음 안쪽이다. 최악은 O(n)이지만 확률이 무시할 만큼 작고, 입력이 아니라 동전에 달려 있다.

## 어디에 쓰이나
- Redis 정렬 집합: 원소가 많아지면 스킵 리스트 + 해시 테이블로 저장하고, 층을 올릴 확률로 1/4을 쓴다. 간선마다 건너뛰는 칸 수(span)를 적어 순위 질의(ZRANK)를 처리하는 것이 이 글의 폭과 같다.
- 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: LevelDB의 멤테이블(db/skiplist.h)이 스킵 리스트이고, 소스 주석에 따르면 쓰기는 외부 잠금으로 하나씩 하되 읽기는 잠금 없이 진행된다.
- 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」: 둘 다 무작위로 모양을 정해 기대 O(log n)을 얻는 라스베이거스형 구조다. 트립은 split·merge가, 스킵 리스트는 순차 순회와 동시성이 편하다.

## 정리
- 노드마다 동전을 던져 층을 정하면 기대 층 수 log_{1/p} n, 기대 걸음 O(log n)인 급행 노선이 생긴다.
- 간선마다 폭을 적으면 검색 경로에서 순위가 저절로 나오고, k번째 원소도 같은 방식으로 찾는다.
- 2¹⁶개 실험에서 노드당 포인터는 정확히 1/(1 − p)였고, p = 1/4은 1/2과 걸음이 비슷하면서 포인터가 3분의 1 적었다.
- 고칠 곳이 이웃 포인터뿐이라 동시 구현이 쉽고, 그래서 저장소와 동시 컬렉션에 많이 쓰인다.

## 더 알아보기
- 이전 글: 9편 「B-트리와 B+트리: 디스크 블록 하나에 키 수백 개」
- 다음 글: 11편 「희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기」
- 위키백과 Skip list: https://en.wikipedia.org/wiki/Skip_list
