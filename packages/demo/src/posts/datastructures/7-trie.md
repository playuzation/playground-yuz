# [고급 자료 구조 7/12] 트라이: 접두사 검색과 XOR 최댓값

> **한 줄 요약** — 트라이는 문자열의 공통 접두사를 한 경로로 공유하는 트리라서 접두사 질의를 단어 개수와 무관하게 길이 L에 비례하는 시간에 답하고, 수를 고정 폭 2진수 문자열로 넣으면 최상위 비트부터 반대쪽으로 내려가는 탐욕법으로 두 수의 XOR 최댓값을 O(n·B)에 구한다.

## 이 글에서 다루는 것
- 트라이의 구조: 노드 하나가 접두사 하나
- 삽입, 접두사로 시작하는 단어 세기, 사전순 자동 완성
- 노드 수와 자식 표현(딕셔너리 vs 배열)에 따른 메모리
- 비트 트라이로 두 수·구간의 XOR 최댓값

## 예제 문제: 이 접두사로 시작하는 단어는 몇 개인가
검색창에 "ca"를 치면 `car`, `card`, `care`, `cat`을 보여 주고 싶다. 단어 N개, 질의 Q개일 때 가장 단순한 방법은 질의마다 모든 단어에 `startswith`를 부르는 것이다. 질의 하나에 O(N·L)이라 N = Q = 10⁵이면 글자 비교가 10¹⁰번 안팎이 된다. 정렬 + 이분 탐색으로 접두사 구간을 찾으면 O(L log N)이지만, 단어가 계속 추가되거나 글자를 칠 때마다 이어서 좁혀 가야 하면 불편하다.

**트라이**(trie)는 접두사 자체를 노드로 만든다. 루트는 빈 문자열이고, 간선 하나가 글자 하나다. 같은 접두사로 시작하는 단어는 그 접두사까지 같은 경로를 쓴다. 1959년 르네 드 라 브리앙데(René de la Briandais)가 컴퓨터에서 처음 설명했고, 1960년 에드워드 프레드킨(Edward Fredkin)이 독립적으로 제안하며 검색(retrieval)에서 따온 이름을 붙였다. 단어 `car`, `card`, `care`, `cat`, `do`, `dog`의 트라이는 이렇다(`*`는 단어가 끝나는 노드).
```text
(루트)
├─ c ─ a ─┬─ r* ─┬─ d*
│         │      └─ e*
│         └─ t*
└─ d ─ o* ─ g*
```
각 노드에 "이 노드를 지나간 단어 수" `cnt`를 두면 접두사 질의는 접두사를 따라 내려가서 `cnt`를 읽는 것으로 끝난다. 단어 `w`를 넣을 때 정확히 `w`의 접두사 노드들(빈 문자열 포함)만 `cnt`가 1 오르므로, 노드 p의 `cnt`는 항상 "p로 시작하는 단어 수"라는 불변식이 유지된다.

## 구현: 삽입, 접두사 세기, 자동 완성
자식은 딕셔너리로 둔다. 자동 완성은 접두사 노드에서 전위 순회를 하되 자식을 글자 순으로 방문한다. 단어는 자기 확장들보다 먼저 나오고 자식은 다음 글자 순이므로, 이 순서가 곧 사전순이다.
```python
class Node:
    __slots__ = ("kids", "cnt", "end")
    def __init__(self):
        self.kids = {}   # 글자 → 자식 노드
        self.cnt = 0     # 이 접두사로 시작하는 단어 수
        self.end = 0     # 여기서 끝나는 단어 수

class Trie:
    def __init__(self):
        self.root, self.nodes = Node(), 1

    def insert(self, word):
        node = self.root
        node.cnt += 1
        for ch in word:
            if ch not in node.kids:
                node.kids[ch] = Node()
                self.nodes += 1
            node = node.kids[ch]
            node.cnt += 1
        node.end += 1

    def find(self, prefix):
        node = self.root
        for ch in prefix:
            node = node.kids.get(ch)
            if node is None:
                return None
        return node

    def count_prefix(self, prefix):
        node = self.find(prefix)
        return node.cnt if node else 0

    def complete(self, prefix, k):
        out = []
        def dfs(node, path):          # 전위 순회 + 정렬된 자식 = 사전순
            if len(out) >= k:
                return
            out.extend([path] * min(node.end, k - len(out)))
            for ch in sorted(node.kids):
                dfs(node.kids[ch], path + ch)
        node = self.find(prefix)
        if node:
            dfs(node, prefix)
        return out

t = Trie()
for w in ["car", "card", "care", "cat", "do", "dog"]:
    t.insert(w)
print(t.count_prefix("ca"), t.count_prefix("do"), t.count_prefix("x"))
print(t.complete("ca", 3), t.complete("d", 5))
print("노드 수", t.nodes)
```
```text
4 2 0
['car', 'card', 'care'] ['do', 'dog']
노드 수 10
```
글자를 하나씩 칠 때는 직전 노드에서 한 칸만 내려가면 되므로 키 입력 하나가 O(1)이다. 이것이 정렬 + 이분 탐색보다 트라이가 자연스러운 경우다.

## 무작위 대조 검사
앞 코드에 이어서, 글자 `abc`로 만든 짧은 단어 목록과 접두사를 무작위로 뽑아 `startswith`로 거른 정답과 비교한다. 글자 종류를 줄여야 접두사가 자주 겹쳐 경계 경우가 많이 나온다.
```python
import random

rng = random.Random(7)
def rand_word(maxlen):
    return "".join(rng.choice("abc") for _ in range(rng.randint(1, maxlen)))

ok = 0
for _ in range(500):
    words = [rand_word(6) for _ in range(rng.randint(1, 30))]
    t = Trie()
    for w in words:
        t.insert(w)
    p, k = rand_word(3)[:rng.randint(0, 3)], rng.randint(1, 5)
    hits = sorted(w for w in words if w.startswith(p))
    ok += t.count_prefix(p) == len(hits) and t.complete(p, k) == hits[:k]
print(f"무작위 500개 비교: {ok}개 일치")
```
```text
무작위 500개 비교: 500개 일치
```
빈 접두사, 같은 단어 여러 번, 다른 단어의 접두사인 단어(`car`와 `card`)가 모두 섞여 있는데도 일치한다.

## 메모리: 노드 수와 자식 표현
노드 수는 서로 다른 접두사 수 + 1이라 총 글자 수를 넘지 않는다. 공유가 많을수록 줄어든다. 문제는 자식 표현이다. C·C++에서는 보통 노드마다 알파벳 크기 σ칸의 배열을 두는데, 실제로 몇 칸이 쓰이는지 앞 코드에 이어서 세어 보자.
```python
import random, string

def report(name, words, sigma):
    t = Trie()
    for w in words:
        t.insert(w)
    chars = sum(map(len, words))
    slots = t.nodes * sigma                  # 자식 배열을 σ칸씩 둘 때
    print(f"{name}: 글자 {chars}, 노드 {t.nodes}, "
          f"배열 칸 사용률 {(t.nodes - 1) / slots:.1%}")

report("숫자 0~9999", [str(i) for i in range(10000)], 10)
rng = random.Random(1)
words = ["".join(rng.choices(string.ascii_lowercase, k=rng.randint(3, 8)))
         for _ in range(2000)]
report("무작위 단어", words, 26)
```
```text
숫자 0~9999: 글자 38890, 노드 10001, 배열 칸 사용률 10.0%
무작위 단어: 글자 10981, 노드 7526, 배열 칸 사용률 3.8%
```
숫자 문자열은 공유 덕에 노드가 글자 수의 4분의 1이지만 배열 칸은 90%가 비고, 무작위 단어는 96%가 빈칸이다. 배열은 자식 찾기가 인덱스 한 번이라 빠르고, 딕셔너리는 메모리를 아끼지만 해시 비용이 든다. 자식이 하나뿐인 노드가 길게 이어지면 그 사슬을 간선 하나로 합친 **압축 트라이**(radix tree, Patricia)가 노드 수를 크게 줄인다.

## 비트 트라이: 두 수의 XOR 최댓값
수 n개 중 두 개를 골라 XOR한 값의 최댓값을 구하자. 모든 쌍을 보면 O(n²)이다. 핵심 관찰은 XOR 결과의 대소가 최상위 비트에서 정해진다는 것이다. b번 비트가 1이면 그 아래 비트가 모두 1인 값(2ᵇ − 1)보다 크다. 그러니 x의 짝을 고를 때는 위에서부터 비트마다 "x와 반대 비트인 수가 남아 있나"만 보고, 있으면 그쪽으로 내려가는 탐욕 선택이 정확하다. 수를 고정 폭 B비트 문자열로 보고 0·1 두 갈래 트라이에 넣으면 이 판단이 노드마다 한 번이다.
```python
import random

B = 30                                   # 다루는 비트 수(값 < 2³⁰)

class XorTrie:
    def __init__(self):
        self.ch = [[0, 0]]               # 노드별 [0쪽 자식, 1쪽 자식], 0 = 없음

    def insert(self, x):
        v = 0
        for b in range(B - 1, -1, -1):
            bit = x >> b & 1
            if not self.ch[v][bit]:
                self.ch[v][bit] = len(self.ch)
                self.ch.append([0, 0])
            v = self.ch[v][bit]

    def max_xor(self, x):                # 넣어 둔 수 y 중 x ^ y 최댓값
        v, res = 0, 0
        for b in range(B - 1, -1, -1):
            want = (x >> b & 1) ^ 1      # 반대 비트로 가야 이 자리가 1
            if self.ch[v][want]:
                res |= 1 << b
                v = self.ch[v][want]
            else:
                v = self.ch[v][want ^ 1]
        return res

def max_pair_xor(a):
    t, best = XorTrie(), 0
    t.insert(a[0])
    for x in a[1:]:
        best = max(best, t.max_xor(x))
        t.insert(x)
    return best

def max_subarray_xor(a):                 # 구간 XOR = 누적 XOR 두 개의 XOR
    t, px, best = XorTrie(), 0, 0
    t.insert(0)
    for x in a:
        px ^= x
        best = max(best, t.max_xor(px))
        t.insert(px)
    return best

print(max_pair_xor([3, 10, 5, 25, 2, 8]))

rng = random.Random(42)
ok = 0
for _ in range(500):
    bits = rng.choice([4, 10, 30])
    a = [rng.randrange(1 << bits) for _ in range(rng.randint(2, 30))]
    n = len(a)
    pair = max(a[i] ^ a[j] for i in range(n) for j in range(i + 1, n))
    sub = 0
    for i in range(n):
        acc = 0
        for j in range(i, n):
            acc ^= a[j]
            sub = max(sub, acc)
    ok += max_pair_xor(a) == pair and max_subarray_xor(a) == sub
print(f"무작위 500개 비교: {ok}개 일치")

t = XorTrie()
for _ in range(1000):
    t.insert(rng.randrange(1 << B))
print("노드", len(t.ch), "상한 1 + n·B =", 1 + 1000 * B)
```
```text
28
무작위 500개 비교: 500개 일치
노드 21067 상한 1 + n·B = 30001
```
예제의 답 28은 `5 ^ 25`(00101과 11001)다. 구간 XOR 최댓값은 `a[l..r]`의 XOR이 누적 XOR `P[r] ^ P[l−1]`이라는 점(알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」의 XOR판)을 써서 두 수 문제로 바꾼 것이다. `P[0] = 0`을 먼저 넣어야 맨 앞에서 시작하는 구간이 빠지지 않는다. 노드 수는 상한 1 + n·B보다 적은데, 위쪽 비트에서 경로가 공유되기 때문이다.

## 자주 하는 실수와 변형
- 폭을 고정하지 않는 실수: `bin(x)` 길이대로 넣으면 자릿수가 다른 수의 비트가 서로 다른 깊이에 놓여 비교가 어긋난다. 모든 수를 같은 B비트로, 앞자리 0까지 넣는다.
- 자기 자신과 짝짓기: 질의 뒤에 삽입하면 i < j인 쌍만 본다. 최댓값에는 상관없어도 개수를 셀 때는 중요하다.
- 삭제가 있는 경우: 노드마다 `cnt`를 두고 삭제 시 줄인 뒤, 질의는 `cnt > 0`인 자식으로만 내려간다.
- "x와 XOR한 값이 k 미만인 수의 개수": k의 비트를 따라 내려가며, k의 비트가 1인 자리에서 결과 비트를 0으로 만드는 쪽 서브트리의 `cnt`를 통째로 더한다.
- 단어 길이가 수만 자면 재귀 `dfs`가 파이썬 재귀 한도에 걸린다. 명시적 스택으로 바꾼다.

## 복잡도
L은 문자열 길이, N은 단어 수, B는 비트 폭이다.

| 연산 | 트라이 | 단순한 방법 |
|---|---|---|
| 삽입 | O(L) | O(1) 목록 추가 |
| 접두사 세기 | O(L) | O(N·L) |
| 자동 완성 k개 | O(L + 방문 노드) | O(N·L) + 정렬 |
| 쌍 XOR 최댓값 | O(n·B) | O(n²) |
| 노드 수 | ≤ 총 글자 수 + 1 | - |

질의 비용에 N이 없다. 대신 배열 자식이면 O(σ·노드 수) 메모리가 든다.

## 어디에 쓰이나
- 문자열 알고리즘 4편 「아호-코라식: 여러 패턴을 한 번에 찾기」: 패턴들로 이 글의 트라이를 만들고 실패 링크를 더하면 텍스트를 한 번 훑으며 모든 패턴을 찾는다.
- 수학·기하 알고리즘 8편 「가우스 소거법: 연립방정식과 XOR 기저」: 두 수가 아니라 여러 수를 마음대로 골라 XOR할 때의 최댓값은 트라이가 아니라 GF(2) 기저로 푼다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 비트 트라이는 수를 고정 폭 2진수로 보고, 상위 비트 하나가 하위 비트 전체보다 크다는 자릿값 성질이 탐욕 선택의 근거가 된다.
- 네트워크 라우팅: 리눅스 커널은 IPv4 라우팅 표를 압축 트라이(`fib_trie`)로 저장해 목적지 주소와 가장 길게 일치하는 접두사를 찾는다.

## 정리
- 트라이의 노드는 접두사 하나이고, 지나간 단어 수를 세어 두면 접두사 질의가 단어 수와 무관하게 O(L)이다.
- 정렬된 자식 순서의 전위 순회가 사전순이라 자동 완성이 자연스럽다.
- 배열 자식은 빠르지만 칸 대부분이 비고, 딕셔너리나 압축 트라이로 메모리를 아낀다.
- 수를 고정 폭 비트열로 넣으면 최상위 비트부터 반대쪽을 고르는 탐욕으로 XOR 최댓값을 O(B)에 찾는다.

## 더 알아보기
- 이전 글: 6편 「희소 테이블: O(1) 구간 최솟값 질의」
- 다음 글: 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」
- 위키백과 Trie: https://en.wikipedia.org/wiki/Trie
