# [추상 데이터 타입 심화 9/21] B-트리와 B+트리: 디스크 블록 하나에 키 수백 개

> **한 줄 요약** — 디스크에서는 읽은 블록 수가 비용이므로, 노드를 블록 크기로 키워 키를 수백 개 담는 B-트리는 높이가 log_t n으로 줄어 키 10⁶개도 블록 서너 개로 찾고, 잎을 사슬로 이은 B+트리는 범위 질의를 잎만 옆으로 훑어 끝낸다.

## 이 글에서 다루는 것
- 블록 접근 수라는 비용 모델
- 최소 차수 t인 B-트리: 분할로 하는 삽입, 빌리기·합치기로 하는 삭제
- 모델 기반 대조와 불변식(모든 잎이 같은 깊이) 검사
- B+트리의 잎 사슬과 범위 질의, 키 10⁶개에서 차수별 블록 접근 수

## 예제 문제: 메모리에 안 들어가는 정렬 맵
주문 10억 건의 정렬 인덱스가 디스크에 있고, 번호 하나를 찾거나 번호 구간을 순서대로 읽어야 한다. 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」에서 본 대로 느린 저장 장치는 데이터를 **블록** 단위로 옮기고, 블록 하나 읽기가 메모리 접근보다 몇 자릿수 느리다. 그래서 비용을 **읽은 블록 수**로 센다.

균형 이진 트리는 노드 하나가 블록 하나라 하면 10억 개에서 30층, 찾기 한 번에 블록 30개를 읽는다. 노드를 블록 크기로 키워 한 번 읽을 때 수백 갈래 중 하나를 고르면 층이 log₂ n에서 log₂₅₆ n 수준으로 준다. 이것이 **B-트리**(B-tree)다. 1970년 바이어(Rudolf Bayer)와 맥크라이트(Edward McCreight)가 보잉 연구소 보고서로 내고 1972년 논문으로 냈다.

## 정의: 최소 차수 t
최소 차수 t ≥ 2인 B-트리는 다음을 지킨다(CLRS의 표기).
- 뿌리가 아닌 노드는 키를 t − 1개 이상 2t − 1개 이하 담는다. 뿌리는 1개 이상.
- 키가 k개인 안쪽 노드는 자식이 k + 1개이고, 키들이 자식 사이의 범위를 가른다.
- 모든 잎이 같은 깊이에 있다.

t = 2면 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」의 2-3-4 트리다. 노드가 적어도 t갈래로 갈라지므로 층 수는 1 + log_t((n + 1)/2) 이하다.

**삽입**은 잎에 넣는다. 내려가다 꽉 찬 자식(키 2t − 1개)을 만나면 미리 가운데 키를 부모로 올려 쪼갠다. 부모는 꽉 차 있지 않음이 보장되니 한 번 내려가면 끝난다. 트리는 뿌리가 꽉 찼을 때만 새 뿌리를 얹어 위로 자란다.
```text
t = 2, [2 4 6]이 꽉 찼을 때 5 삽입
     [8]            [4 8]
    /   \    →     /  |  \
[2 4 6] [9]     [2] [5 6] [9]
```
**삭제**는 반대로 모자람을 고친다. 안쪽 노드의 키는 왼쪽 서브트리의 최댓값과 바꿔 잎에서 지운다. 지운 뒤 자식의 키가 t − 1개 미만이면, 형제가 넉넉할 때는 부모 키를 내리고 형제 키를 올려 **빌리고**, 아니면 형제·부모 키와 **합친다**.
```python
import bisect, random

class BNode:
    __slots__ = ("keys", "kids")         # kids가 비면 잎
    def __init__(self, keys, kids): self.keys, self.kids = keys, kids

class BTree:
    def __init__(self, t):               # t = 최소 차수
        self.t, self.root = t, BNode([], [])

    def search(self, key):
        x = self.root
        while True:
            i = bisect.bisect_left(x.keys, key)
            if i < len(x.keys) and x.keys[i] == key: return True
            if not x.kids: return False
            x = x.kids[i]

    def split(self, p, i):               # 꽉 찬 p.kids[i]를 둘로
        t, c = self.t, p.kids[i]
        p.keys.insert(i, c.keys[t - 1])  # 가운데 키는 부모로
        p.kids.insert(i + 1, BNode(c.keys[t:], c.kids[t:]))
        c.keys, c.kids = c.keys[:t - 1], c.kids[:t]

    def insert(self, key):
        if self.search(key): return
        full = 2 * self.t - 1
        if len(self.root.keys) == full:  # 뿌리가 차면 한 층 위로
            self.root = BNode([], [self.root]); self.split(self.root, 0)
        x = self.root
        while x.kids:                    # 꽉 찬 자식은 미리 쪼갠다
            i = bisect.bisect_left(x.keys, key)
            if len(x.kids[i].keys) == full:
                self.split(x, i); i += key > x.keys[i]
            x = x.kids[i]
        bisect.insort(x.keys, key)

    def delete(self, key):
        self._del(self.root, key)
        if not self.root.keys and self.root.kids:
            self.root = self.root.kids[0]   # 뿌리가 비면 한 층 아래로

    def _del(self, x, key):
        i = bisect.bisect_left(x.keys, key)
        hit = i < len(x.keys) and x.keys[i] == key
        if not x.kids:
            if hit: x.keys.pop(i)
            return
        if hit:                          # 왼쪽 서브트리 최댓값으로 대체
            y = x.kids[i]
            while y.kids: y = y.kids[-1]
            x.keys[i] = key = y.keys[-1]
        self._del(x.kids[i], key)
        if len(x.kids[i].keys) < self.t - 1: self.fix(x, i)

    def fix(self, x, i):                 # 모자란 x.kids[i]를 채운다
        c, k = x.kids[i], x.kids
        if i > 0 and len(k[i - 1].keys) >= self.t:   # 왼쪽에서 빌리기
            l = k[i - 1]
            c.keys.insert(0, x.keys[i - 1]); x.keys[i - 1] = l.keys.pop()
            if l.kids: c.kids.insert(0, l.kids.pop())
        elif i + 1 < len(k) and len(k[i + 1].keys) >= self.t:  # 오른쪽
            r = k[i + 1]
            c.keys.append(x.keys[i]); x.keys[i] = r.keys.pop(0)
            if r.kids: c.kids.append(r.kids.pop(0))
        else:                            # 형제 + 부모 키 하나로 합치기
            i -= i > 0
            r = k.pop(i + 1)
            k[i].keys += [x.keys.pop(i)] + r.keys
            k[i].kids += r.kids

def show(x):
    s = "[" + " ".join(map(str, x.keys)) + "]"
    return s + "(" + " ".join(map(show, x.kids)) + ")" if x.kids else s

tr = BTree(2)
for k in range(1, 11): tr.insert(k)
print(show(tr.root))
for k in (4, 5, 6): tr.delete(k)
print(show(tr.root))
```
```text
[4]([2]([1] [3]) [6 8]([5] [7] [9 10]))
[3 8]([1 2] [7] [9 10])
```
1~10을 넣으면 세 층이 되고, 4·5·6을 지우는 동안 빌리기와 합치기가 일어나 두 층으로 낮아진다.

## 모델 기반 대조와 불변식 검사
앞 코드에 이어서, t = 2~4에서 무작위 연산열을 파이썬 `set`과 비교하고, 매 연산 뒤에 키 개수 범위·키 순서·자식 수·잎 깊이를 검사한다.
```python
def check(tr, x, lo=-1, hi=10**9):       # (키 수, 잎까지 깊이)
    t, ks = tr.t, x.keys
    assert ks == sorted(ks) and all(lo < k < hi for k in ks)
    assert (x is tr.root or t - 1 <= len(ks)) and len(ks) <= 2 * t - 1
    if not x.kids: return len(ks), 0
    assert len(x.kids) == len(ks) + 1
    b = [lo] + ks + [hi]
    res = [check(tr, c, b[j], b[j + 1]) for j, c in enumerate(x.kids)]
    assert len({d for _, d in res}) == 1     # 모든 잎이 같은 깊이
    return len(ks) + sum(n for n, _ in res), res[0][1] + 1

rng, ok = random.Random(9), 0
for case in range(500):
    tr, ref, same = BTree(2 + case % 3), set(), True
    for _ in range(100):
        op, x = rng.randrange(3), rng.randrange(40)
        if op == 0: tr.insert(x); ref.add(x)
        elif op == 1: tr.delete(x); ref.discard(x)
        else: same &= tr.search(x) == (x in ref)
        same &= check(tr, tr.root)[0] == len(ref)
    ok += same
print(f"무작위 500개 비교(t = 2~4): {ok}개 일치, 불변식 검사 통과")
```
```text
무작위 500개 비교(t = 2~4): 500개 일치, 불변식 검사 통과
```

## B+트리: 키는 잎에, 잎은 사슬로
데이터베이스가 실제로 쓰는 것은 대개 **B+트리**다. B-트리와 다른 점은 셋이다.
- 키와 값은 모두 잎에 있고 안쪽 노드에는 길잡이 키만 있다. 값이 없으니 갈래 수가 커진다.
- 잎끼리 사슬로 이어져, 범위 질의는 시작 잎을 찾은 뒤 옆으로만 읽는다.
- 찾기는 늘 잎까지 내려간다. 잎이 쪼개질 때는 가운데 키를 부모로 "복사"하고 잎에도 남긴다.

정렬된 키가 한꺼번에 주어지면 잎을 꽉 채워 아래층부터 쌓는 **일괄 적재**(bulk loading)로 짓는다. 앞 코드에 이어서, 범위 질의를 정렬 리스트 필터링과 비교한다.
```python
class Page:                              # B+트리 노드
    __slots__ = ("keys", "kids", "next", "lo")
    def __init__(self, keys, kids):
        self.keys, self.kids, self.next = keys, kids, None
        self.lo = kids[0].lo if kids else keys[0]   # 서브트리 최솟값

def bulk_load(keys, b):                  # 노드당 최대 b개, 아래층부터
    lv = [Page(keys[i:i + b], []) for i in range(0, len(keys), b)]
    for a, c in zip(lv, lv[1:]): a.next = c          # 잎 사슬
    while len(lv) > 1:
        lv = [Page([c.lo for c in lv[i + 1:i + b]], lv[i:i + b])
              for i in range(0, len(lv), b)]
    return lv[0]

def range_query(x, lo, hi):              # lo ≤ 키 < hi, 읽은 블록 수
    reads, out = 0, []
    while x.kids:                        # 길잡이 키로 시작 잎 찾기
        reads += 1; x = x.kids[bisect.bisect_right(x.keys, lo)]
    while x:                             # 잎 사슬을 따라 옆으로
        reads += 1
        out += [k for k in x.keys if lo <= k < hi]
        x = x.next if x.keys[-1] < hi else None
    return out, reads

rng, ok = random.Random(4), 0
for _ in range(300):
    ref = sorted(rng.sample(range(500), rng.randint(1, 200)))
    root = bulk_load(ref, rng.randint(2, 6))
    lo = rng.randrange(-10, 510); hi = lo + rng.randrange(80)
    ok += range_query(root, lo, hi)[0] == [k for k in ref if lo <= k < hi]
print(f"범위 질의 무작위 300개 비교: {ok}개 일치")
```
```text
범위 질의 무작위 300개 비교: 300개 일치
```

## 키 10⁶개에서 블록 접근 수
앞 코드에 이어서, 키 10⁶개로 노드당 키 수 b를 바꿔 B+트리를 짓고 점 질의와 연속 키 1,000개 범위 질의가 읽는 블록 수를 센다. 점 질의 블록 수가 곧 층 수이고, 완전 이진 트리라면 ⌈log₂(10⁶ + 1)⌉ = 20층이다.
```python
keys = list(range(0, 2 * 10**6, 2))      # 키 10⁶개
for b in (4, 16, 128, 512):
    root = bulk_load(keys, b)
    one = range_query(root, 777776, 777777)[1]
    many = range_query(root, 500000, 502000)[1]
    print(f"b = {b}: 점 질의 {one}블록, 범위 1000개 {many}블록")
```
```text
b = 4: 점 질의 10블록, 범위 1000개 260블록
b = 16: 점 질의 5블록, 범위 1000개 67블록
b = 128: 점 질의 3블록, 범위 1000개 10블록
b = 512: 점 질의 3블록, 범위 1000개 5블록
```
b가 4에서 512로 커지면 점 질의는 10블록에서 3블록으로, 범위 질의는 260블록에서 5블록으로 준다. 범위 질의 비용이 대략 (층 수) + k/b이기 때문이다. 실제 인덱스는 위쪽 몇 층이 늘 메모리에 있어 디스크 읽기는 잎 근처 한두 번이다.

## 자주 하는 실수와 변형
- 차수 표기가 책마다 다르다. CLRS의 최소 차수 t는 "자식 t~2t개", 크누스식 차수 m은 "자식 최대 m개"다. 분할 위치의 off-by-one이 여기서 나온다.
- 합치기는 형제가 최소(t − 1개)일 때만 한다. 그래야 합친 노드가 2t − 1개를 넘지 않는다.
- 변형: 형제에게 넘겨 분할을 미루는 `B*` 트리, 경로만 새로 쓰는 copy-on-write B-트리, 키 앞부분을 공유하는 접두사 압축.

## 복잡도
| 연산 | B-트리·B+트리 | 균형 이진 트리 |
|---|---|---|
| 찾기 블록 수 | O(log_t n) | O(log₂ n) |
| 삽입·삭제 블록 수 | O(log_t n) | O(log₂ n) |
| 범위 k개 블록 수 | O(log_t n + k/t) | O(log₂ n + k) |
| 노드 안 비교 | O(log t) 이분 탐색 | 1번 |

- 근거: 노드가 t갈래 이상이라 높이가 log_t n이고, 연산은 경로 하나와 그 형제만 건드린다. 공간은 O(n)이다.

## 어디에 쓰이나
- 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」: t = 2인 B-트리를 이진 노드로 펼친 것이 레드-블랙 트리이고, 분할·빌리기·합치기가 그쪽에서는 색 뒤집기와 회전이 된다.
- 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: B-트리는 제자리 갱신이라 무작위 쓰기가 그대로 블록 쓰기가 된다. 쓰기가 많으면 LSM 트리가 대안이다.
- 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」: 메모리와 캐시 사이도 블록(캐시 라인) 단위라, 메모리 안의 정렬 맵도 노드를 키운 B-트리가 유리할 수 있다. 러스트 표준 라이브러리의 `BTreeMap`이 그 예다.
- 데이터베이스와 파일 시스템: SQLite는 테이블과 인덱스를 B-트리로 저장하고(행 데이터를 잎에만 두는 "table b-tree"가 B+트리 방식), MySQL InnoDB는 공간 인덱스를 뺀 인덱스가 B-트리이며 기본 페이지가 16KB다. Btrfs는 이름 그대로 B-트리 기반 파일 시스템이다.

## 정리
- 디스크에서는 읽은 블록 수가 비용이고, 노드를 블록 크기로 키우면 높이가 log_t n으로 준다.
- 삽입은 분할로 위로 자라고 삭제는 빌리기·합치기로 줄어, 모든 잎이 늘 같은 깊이다.
- B+트리는 키를 잎에만 두고 잎을 사슬로 이어 범위 질의를 (층 수) + k/b 블록에 끝낸다.
- 키 10⁶개, b = 512에서 점 질의 3블록, 연속 1,000개 범위 5블록이었다.

## 더 알아보기
- 이전 글: 8편 「레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기」
- 다음 글: 10편 「스킵 리스트: 동전 던지기로 만드는 균형」
