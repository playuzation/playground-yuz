# [추상 데이터 타입 심화 14/21] 기수 트리와 패트리샤 트리: 갈림길만 남긴 트라이

> **한 줄 요약** — 기수 트리는 트라이에서 자식이 하나뿐인 외길 사슬을 문자열 라벨 간선 하나로 압축해 노드 수를 키 수의 두 배 이하로 줄이고, 패트리샤 트리는 이진 키에서 라벨마저 버리고 "몇 번째 비트로 가르는가"만 저장해 안쪽 노드를 정확히 n − 1개로 만들며, 둘 다 가장 긴 접두사 일치와 접두사 범위 질의를 키 길이에 비례하는 시간에 한다.

## 이 글에서 다루는 것
- 트라이의 외길 사슬을 압축하는 기수 트리와 노드 수 상한
- 가장 긴 접두사 일치(IP 라우팅)와 접두사 범위 질의
- 패트리샤·크릿비트 트리의 비트 위치 분기
- 영어식 단어와 무작위 비트 문자열에서 노드 수 실험, 모델 기반 대조

## 예제 문제: 라우팅 표
라우터는 "10.0.0.0/8은 A로, 10.1.0.0/16은 B로, 나머지는 기본 경로로" 같은 접두사 규칙을 수십만 개 갖고, 패킷이 올 때마다 목적지 주소와 맞는 규칙 중 **가장 긴 접두사**를 골라야 한다. 해시 테이블은 정확히 같은 키만 찾으므로 접두사 길이 33가지를 하나씩 해시해 봐야 한다. 고급 자료 구조 7편 「트라이: 접두사 검색과 XOR 최댓값」의 트라이는 비트를 따라 내려가며 마지막으로 만난 규칙을 기억하면 되지만, 글자(비트) 하나에 노드 하나라 메모리가 크다. 트라이의 핵심은 "공통 접두사를 한 경로로 공유한다"는 것인데, 갈림길이 없는 구간까지 노드를 하나씩 둘 필요는 없다.

## 기수 트리: 외길을 간선 하나로
**기수 트리**(radix tree, 압축 트라이)는 자식이 하나뿐이고 키의 끝도 아닌 노드를 없애고, 그 사슬을 문자열 라벨이 붙은 간선 하나로 합친다. 그러면 뿌리를 뺀 모든 노드는 "갈림길(자식 2개 이상)"이거나 "키의 끝"이다. 잎은 키 n개 이하이고 갈림길은 잎보다 적으므로 노드 수는 키 길이와 상관없이 약 2n 이하다.

삽입은 간선 라벨을 따라 내려가다 라벨 중간에서 갈라지면 그 자리에서 간선을 쪼개 갈림길 노드를 만든다. 삭제는 거꾸로 키 끝 표시를 지운 뒤, 빈 잎을 떼고 외길이 된 노드를 위 간선과 다시 합친다(아래 코드에서는 생략). **가장 긴 접두사 일치**는 라벨이 맞는 동안 내려가며 마지막으로 지난 키 끝을 기억하면 되고, **접두사 범위 질의**는 접두사가 끝나는 지점(간선 중간이어도 된다) 아래 서브트리를 모두 훑으면 된다.
```python
import random

class RNode:
    __slots__ = ("kids", "end")          # kids: 첫 글자 → (간선 라벨, 자식)
    def __init__(self, end=False): self.kids, self.end = {}, end

class Radix:
    def __init__(self): self.root = RNode()

    def insert(self, s):
        x = self.root
        while s:
            if s[0] not in x.kids:       # 남은 글자를 간선 하나로
                x.kids[s[0]] = (s, RNode(True)); return
            lab, y = x.kids[s[0]]
            i = 0
            while i < min(len(lab), len(s)) and lab[i] == s[i]: i += 1
            if i < len(lab):             # 간선 중간에서 갈라지면 쪼갠다
                mid = RNode(); mid.kids[lab[i]] = (lab[i:], y)
                x.kids[s[0]] = (lab[:i], mid); y = mid
            x, s = y, s[i:]
        x.end = True

    def _walk(self, s, part=False):      # s를 따라간 끝 노드와 지나온 글자
        x, acc = self.root, ""
        while len(acc) < len(s):
            rest = s[len(acc):]
            lab, y = x.kids.get(rest[0], ("", None))
            if y is None or not (rest.startswith(lab)
                                 or part and lab.startswith(rest)):
                return None, acc         # part: 간선 중간에서 끝나도 된다
            x, acc = y, acc + lab
        return x, acc

    def __contains__(self, s):
        x = self._walk(s)[0]
        return x is not None and x.end

    def longest_prefix(self, s):         # s의 접두사인 가장 긴 키
        x, i, best = self.root, 0, (0 if self.root.end else None)
        while i < len(s) and s[i] in x.kids:
            lab, y = x.kids[s[i]]
            if not s.startswith(lab, i): break
            x, i = y, i + len(lab)
            if x.end: best = i
        return None if best is None else s[:best]

    def with_prefix(self, p):            # p로 시작하는 키 모두
        x, acc = self._walk(p, part=True)
        out, st = [], [(x, acc)] if x else []
        while st:
            v, w = st.pop()
            if v.end: out.append(w)
            st += [(c, w + lab) for lab, c in v.kids.values()]
        return sorted(out)

def bits(ip, n=32):                      # "10.1.2.0" → 앞 n비트 0/1 문자열
    v = 0
    for part in ip.split("."): v = v * 256 + int(part)
    return format(v, "032b")[:n]

rt, hop = Radix(), {}                   # 라우팅 표: 접두사 → 다음 홉
for ip, n, name in [("0.0.0.0", 0, "기본"), ("10.0.0.0", 8, "A"),
                    ("10.1.0.0", 16, "B"), ("10.1.2.0", 24, "C")]:
    rt.insert(bits(ip, n)); hop[bits(ip, n)] = name
for ip in ["10.1.2.3", "10.1.9.9", "10.9.9.9", "8.8.8.8"]:
    print(ip, "→", hop[rt.longest_prefix(bits(ip))])
print("10.0.0.0/8 안의 접두사", len(rt.with_prefix(bits("10.0.0.0", 8))))
```
```text
10.1.2.3 → C
10.1.9.9 → B
10.9.9.9 → A
8.8.8.8 → 기본
10.0.0.0/8 안의 접두사 3
```
IP 주소를 32비트 문자열로 바꿔 넣으면 10.1.2.3은 /24 규칙 C, 10.1.9.9는 /16 규칙 B와 맞는다. 0.0.0.0/0은 빈 문자열 키라 뿌리에 표시되어 어떤 주소에도 맞는 기본 경로가 된다.

## 모델 기반 대조
앞 코드에 이어서, 알파벳 {a, b}로 길이 0~6인 문자열을 뽑아 공통 접두사가 아주 많게 하고, 삽입·포함·가장 긴 접두사·접두사 범위 질의를 파이썬 `set`을 훑는 결과와 비교한다. 매번 외길 노드가 없는지도 검사한다.
```python
def check(x, root=True):                 # 외길(비종단·자식 1개) 노드 금지
    assert root or x.end or len(x.kids) >= 2
    for c, (lab, y) in x.kids.items():
        assert lab[:1] == c; check(y, False)

rng, ok = random.Random(14), 0
for _ in range(500):
    t, ref, same = Radix(), set(), True
    for _ in range(60):
        s = "".join(rng.choice("ab") for _ in range(rng.randrange(7)))
        op = rng.randrange(4)
        if op == 0: t.insert(s); ref.add(s)
        elif op == 1: same &= (s in t) == (s in ref)
        elif op == 2:
            pre = [w for w in ref if s.startswith(w)]
            same &= t.longest_prefix(s) == max(pre, key=len, default=None)
        else:
            same &= t.with_prefix(s) == sorted(w for w in ref
                                               if w.startswith(s))
        check(t.root)
    ok += same
print(f"무작위 500개 비교: {ok}개 일치, 외길 노드 없음")
```
```text
무작위 500개 비교: 500개 일치, 외길 노드 없음
```

## 패트리샤 트리: 비트 위치만 남긴다
키가 비트열이면 더 줄일 수 있다. 모리슨(Donald Morrison)이 1968년 발표한 **패트리샤**(PATRICIA, Practical Algorithm To Retrieve Information Coded in Alphanumeric)는 간선 라벨을 저장하지 않고 안쪽 노드에 "몇 번째 비트로 가르는가"만 적는다. 찾기는 그 비트들만 보고 잎까지 내려간 뒤, 건너뛴 비트가 맞는지 키 전체를 **딱 한 번** 비교한다. 안쪽 노드는 모두 자식이 둘이라 키 n개에 정확히 n − 1개다.

아래는 번스타인(D. J. Bernstein)이 정리한 **크릿비트 트리**(crit-bit tree) 방식이다. 키는 잎에만 두고, 삽입할 때는 먼저 찾기로 가장 비슷한 잎을 얻어 새 키와 처음 달라지는 비트(critical bit)를 구한 뒤, 뿌리에서 다시 내려가 그 비트보다 위쪽 비트를 검사하는 노드들 아래에 새 갈림길을 끼운다. 원래 패트리샤는 키를 안쪽 노드에 두고 위로 가는 포인터를 쓰지만 생각은 같다. 앞 코드에 이어서, 노드 수 실험과 함께 실행한다.
```python
class CritBit:                           # 안쪽 노드 = [비트 위치, 0쪽, 1쪽]
    def __init__(self): self.root, self.inner = None, 0

    def _leaf(self, k):                  # 검사 비트만 보고 잎까지
        x = self.root
        while isinstance(x, list): x = x[1 + (k >> x[0] & 1)]
        return x

    def __contains__(self, k):           # 마지막에 키 전체를 한 번 비교
        return self.root is not None and self._leaf(k) == k

    def insert(self, k):
        if self.root is None: self.root = k; return
        diff = self._leaf(k) ^ k
        if diff == 0: return
        crit = diff.bit_length() - 1     # 처음 달라지는 비트(위에서부터)
        parent, side, x = None, 0, self.root
        while isinstance(x, list) and x[0] > crit:
            parent, side = x, 1 + (k >> x[0] & 1); x = x[side]
        node = [crit, x, k] if k >> crit & 1 else [crit, k, x]
        if parent is None: self.root = node
        else: parent[side] = node
        self.inner += 1

def count(x): return 1 + sum(count(c) for _, c in x.kids.values())

roots = "play work read test load sort find build count match talk walk"
words = [p + r + s for r in roots.split()
         for p in ("", "re", "un", "pre", "over")
         for s in ("", "s", "ed", "er", "ing", "able")]
rng = random.Random(1)
nums = [rng.getrandbits(32) for _ in range(1000)]
for name, ws in [("접사 조합 단어", words),
                 ("무작위 32비트", [format(v, "032b") for v in nums])]:
    t = Radix()
    for w in ws: t.insert(w)
    trie = len({w[:i] for w in ws for i in range(len(w) + 1)})  # 접두사 수
    print(f"{name} {len(ws)}개: 트라이 {trie}, 기수 트리 {count(t.root)}")
cb = CritBit()
for v in nums: cb.insert(v)
ref = set(nums)                          # 끝 비트·첫 비트만 다른 이웃도 질의
qs = nums + [v ^ 1 for v in nums] + [v ^ 1 << 31 for v in nums]
ok = all((q in cb) == (q in ref) for q in qs)
print(f"패트리샤: 잎 {len(ref)}, 안쪽 노드 {cb.inner}, "
      f"질의 {len(qs)}개 일치 {ok}")
```
```text
접사 조합 단어 360개: 트라이 914, 기수 트리 436
무작위 32비트 1000개: 트라이 23123, 기수 트리 1999
패트리샤: 잎 1000, 안쪽 노드 999, 질의 3000개 일치 True
```
접두사를 많이 공유하는 단어 360개에서 기수 트리는 트라이 노드의 절반 이하다. 무작위 32비트 1,000개에서는 차이가 훨씬 커서, 트라이는 위쪽 10비트 남짓만 공유하고 나머지 22비트가 키마다 외길이라 23,123개, 기수 트리는 정확히 2n − 1 = 1,999개다. 패트리샤는 같은 모양(안쪽 999 + 잎 1,000)이면서 간선 라벨 대신 비트 위치 정수 하나만 저장한다. 끝 비트나 첫 비트만 다른 이웃 키 2,000개도 포함 여부가 모두 맞았다.

## 자주 하는 실수와 변형
- 라벨 중간에서 끝나는 접두사를 "없음"으로 처리하는 실수: "rou"는 노드가 없어도 "route"의 접두사다. 범위 질의는 간선 중간 끝을 허용해야 한다.
- 패트리샤에서 마지막 키 전체 비교를 빼면 건너뛴 비트가 다른 키를 "있다"고 답한다. 끝 비트만 다른 이웃 질의가 이를 잡는다.
- 변형: 노드마다 2ᵏ갈래 배열을 두고 여러 비트를 한 번에 보는 다중 비트 트라이, 갈림이 촘촘한 층을 넓은 배열로 묶는 레벨 압축(LC-trie), 메모리 안 데이터베이스 인덱스용 적응형 기수 트리(노드 크기를 자식 수에 맞춰 바꿈).

## 복잡도
| 연산 | 기수·패트리샤 트리 | 트라이 |
|---|---|---|
| 찾기·삽입·삭제 | O(L) | O(L) |
| 가장 긴 접두사 | O(L) | O(L) |
| 접두사 범위 k개 | O(L + 출력 크기) | O(L + 출력 크기) |
| 노드 수 | 2n 이하 | 서로 다른 접두사 수 |

- 근거: 키 길이가 L이면 내려가는 동안 글자를 L개 넘게 비교하지 않는다. 기수 트리는 갈림길·키 끝만 노드로 남기므로 노드가 2n 이하이고, 라벨을 원래 키 안의 (시작, 길이)로 저장하면 키 저장분 외에 공간 O(n)이다. 키 수 n과 무관한 시간이 해시·정렬 맵과 다른 점이다.

## 어디에 쓰이나
- 고급 자료 구조 7편 「트라이: 접두사 검색과 XOR 최댓값」: 그 글의 트라이에 외길 압축을 더한 것이 이 글이고, 비트 트라이의 XOR 최댓값 질의도 패트리샤 위에서 같은 방식으로 한다.
- 라우터와 커널: BSD 계열은 4.3BSD Reno부터 경로 표에 패트리샤의 변형인 기수 트리를 썼고(스클로어 1991), 리눅스는 IPv4 경로 표를 경로·레벨 압축 트라이(`fib_trie`)로 관리한다.
- 문자열 알고리즘 5편 「접미사 배열과 LCP 배열」: 모든 접미사를 기수 트리에 넣은 것이 접미사 트리이고, 접미사 배열 + LCP 배열은 그 트리를 배열로 펼친 것이다.

## 정리
- 기수 트리는 트라이의 외길을 라벨 간선으로 압축해 노드를 2n 이하로 줄이고, 시간은 키 길이 O(L) 그대로다.
- 가장 긴 접두사 일치는 내려가며 마지막 키 끝을 기억하고, 접두사 범위는 간선 중간까지 내려가 서브트리를 훑는다.
- 패트리샤는 비트 위치만 저장해 안쪽 노드가 정확히 n − 1개이고, 마지막에 키 전체를 한 번 비교한다.
- 무작위 32비트 1,000개에서 노드는 트라이 23,123개, 기수 트리 1,999개였다.

## 더 알아보기
- 이전 글: 13편 「k-d 트리: 다차원 범위 검색과 최근접 이웃」
- 다음 글: 15편 「반 엠데 보아스 트리: 정수 키를 O(log log U)에」
- 위키백과 Radix tree: https://en.wikipedia.org/wiki/Radix_tree
