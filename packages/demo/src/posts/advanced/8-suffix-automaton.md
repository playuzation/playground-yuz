# [심화 알고리즘 8/14] 접미사 오토마톤: 모든 부분 문자열을 받아들이는 가장 작은 자동자

> **한 줄 요약** — 끝나는 위치의 집합(endpos)이 같은 부분 문자열들을 상태 하나로 묶으면 모든 부분 문자열을 받아들이는 가장 작은 결정적 자동자가 되고, 한 글자씩 붙이며 O(n)에 만들 수 있어 부분 문자열 판정·개수·등장 횟수·최장 공통 부분 문자열을 선형 시간에 푼다.

## 이 글에서 다루는 것
- endpos 동치류: 상태 하나가 묶는 문자열들과 접미사 링크 트리
- 한 글자씩 붙이는 온라인 구성과 상태 복제(clone)
- 상태 수 ≤ 2n − 1, 전이 수 ≤ 3n − 4를 실험으로 확인
- 응용 네 가지와 집합으로 모으는 느린 방법과의 대조, 접미사 배열과의 비교

## 예제 문제: 부분 문자열 질문 여러 개
문자열 s = "abcbc"에 대해 묻는다. "cb"는 부분 문자열인가? 서로 다른 부분 문자열은 몇 개인가? "bc"는 몇 번 나오나? t와의 최장 공통 부분 문자열은? 단순한 방법은 모든 `s[i:j]`를 집합에 넣는 것인데, 글자 수 합이 O(n³)이라 n = 10⁵이면 불가능하다.

모든 부분 문자열을 받아들이는 결정적 유한 자동자(DFA)가 있으면 질문은 "자동자 위를 걷기"가 된다. 접미사를 모두 넣은 트라이도 그런 자동자지만 노드가 O(n²)개다. **접미사 오토마톤**(suffix automaton)은 같은 언어를 받아들이는 가장 작은 DFA이고, 상태가 2n − 1개를 넘지 않는다(n ≥ 2). 블루머(Blumer) 등이 1985년 논문 「The smallest automaton recognizing the subwords of a text」에서 정리했고 DAWG(directed acyclic word graph)라고도 부른다.

## endpos 동치류와 접미사 링크
부분 문자열 t의 **endpos**(t)는 s에서 t가 끝나는 위치의 집합이다. "abcbc"에서 endpos("bc") = endpos("c") = {2, 4}다. 뒤에 무엇을 붙여야 부분 문자열로 남는지는 끝 위치만으로 정해지므로, endpos가 같은 문자열은 같은 상태로 보내도 된다(같은 미래를 갖는 문자열은 한 상태라는 최소 DFA의 원리).
- 한 상태의 문자열들은 가장 긴 것의 접미사들이고, 길이가 `len(link(v)) + 1`부터 `len(v)`까지 연속이다.
- 접미사를 한 글자씩 줄이다 endpos가 커지는 순간 다른 상태로 넘어간다. 그 상태가 **접미사 링크**(suffix link) `link(v)`다. 링크를 따라가면 빈 문자열 상태(뿌리)에 닿으므로 링크들은 트리를 이룬다.
- 두 endpos는 한쪽이 다른 쪽을 포함하거나 서로소다. 그래서 링크 트리는 끝 위치 n개를 잎 쪽에서 묶어 가는 트리이고 상태 수가 O(n)이다.

## 온라인 구성: 한 글자씩 붙이기
s 뒤에 글자 c를 붙이면 새로 생기는 부분 문자열은 sc의 접미사들뿐이다.
1. sc 전체를 위한 상태 cur(len = 이전 길이 + 1)를 만든다.
2. 이전 마지막 상태에서 링크를 타고 오르며, c 전이가 없는 상태마다 cur로 가는 전이를 단다.
3. c 전이가 있는 상태 p를 만나면 q = next(p, c)다. `len(p) + 1 = len(q)`이면 q의 문자열이 모두 sc의 접미사이므로 link(cur) = q다.
4. 아니면 q에 sc의 접미사가 아닌 더 긴 문자열이 섞여 있다. q를 복제해 길이 `len(p) + 1`까지의 짧은 쪽을 떼어 내고, p부터 링크를 타며 q로 가던 c 전이를 복제본으로 돌린다.

아래 코드는 구성한 뒤 모든 부분 문자열을 걸어 보며 상태별로 묶어 출력한다. 각 줄은 상태 번호, len, link, endpos, 묶인 문자열이다.
```python
class SAM:
    def __init__(self, s=""):
        self.nxt, self.link, self.len = [{}], [-1], [0]
        self.cnt, self.last = [0], 0        # cnt: 끝 위치를 처음 만든 상태면 1
        for c in s:
            self.extend(c)

    def new(self, length, link, nxt, cnt):
        self.len.append(length); self.link.append(link)
        self.nxt.append(nxt); self.cnt.append(cnt)
        return len(self.len) - 1

    def extend(self, c):                    # 글자 c를 뒤에 붙인다
        cur = self.new(self.len[self.last] + 1, 0, {}, 1)
        p = self.last
        while p != -1 and c not in self.nxt[p]:
            self.nxt[p][c] = cur            # 새 끝 위치로 가는 전이
            p = self.link[p]
        if p != -1:
            q = self.nxt[p][c]
            if self.len[p] + 1 == self.len[q]:
                self.link[cur] = q
            else:                           # q를 둘로 쪼갠다
                cl = self.new(self.len[p] + 1, self.link[q],
                              dict(self.nxt[q]), 0)
                while p != -1 and self.nxt[p].get(c) == q:
                    self.nxt[p][c] = cl
                    p = self.link[p]
                self.link[q] = self.link[cur] = cl
        self.last = cur

    def state(self, t):                     # t를 읽고 도착한 상태(없으면 -1)
        v = 0
        for c in t:
            v = self.nxt[v].get(c, -1)
            if v == -1:
                break
        return v

s = "abcbc"
sam = SAM(s)
groups = {}
for i in range(len(s)):
    for j in range(i + 1, len(s) + 1):
        groups.setdefault(sam.state(s[i:j]), set()).add(s[i:j])
for v in sorted(groups):
    ts = sorted(groups[v], key=len, reverse=True)
    ends = [j - 1 for j in range(1, len(s) + 1) if s[:j].endswith(ts[0])]
    print(v, sam.len[v], sam.link[v], ends, ts)
print("상태", len(sam.len), "전이", sum(map(len, sam.nxt)))
```
```text
1 1 0 [0] ['a']
2 2 5 [1] ['ab']
3 3 7 [2] ['abc']
4 4 5 [3] ['abcb', 'bcb', 'cb']
5 1 0 [1, 3] ['b']
6 5 7 [4] ['abcbc', 'bcbc', 'cbc']
7 2 0 [2, 4] ['bc', 'c']
상태 8 전이 9
```
상태 4는 "abcb", "bcb", "cb"를 묶고 길이가 2~4로 연속이며, 링크는 그보다 짧은 접미사 "b"의 상태 5다. 상태 5와 7은 복제로 생겼다. 4번째 글자 b를 붙일 때 "ab"와 함께 끝 위치 {1}을 쓰던 "b"가 끝 위치 {1, 3}이 되어 떨어져 나왔다. 서로 다른 부분 문자열 12개가 빈 문자열 상태까지 상태 8개에 담겼다.

## 상태와 전이가 선형인지 세어 보기
앞 코드에 이어서, 길이 3~30의 무작위 문자열 2,000개에서 상태 수와 전이 수가 경계를 넘는지 보고(전이 경계는 n ≥ 3에서 성립), 경계에 닿는 문자열과 긴 DNA 문자열도 센다.
```python
import random

def size(s):
    a = SAM(s)
    return len(a.len), sum(map(len, a.nxt))

rng = random.Random(8)
gap_s = gap_t = -10**9
for _ in range(2000):
    n = rng.randint(3, 30)
    s = "".join(rng.choice("abc"[:rng.randint(1, 3)]) for _ in range(n))
    st, tr = size(s)
    gap_s = max(gap_s, st - (2 * n - 1))
    gap_t = max(gap_t, tr - (3 * n - 4))
print("상태−(2n−1) 최대", gap_s, "/ 전이−(3n−4) 최대", gap_t)
for s in ["a" + "b" * 9, "a" + "b" * 8 + "c"]:
    print(s, "n", len(s), "상태·전이", size(s))
s = "".join(rng.choice("acgt") for _ in range(10**5))
st, tr = size(s)
print("n=10⁵ DNA: 상태/n", round(st / 1e5, 2), "전이/n", round(tr / 1e5, 2))
```
```text
상태−(2n−1) 최대 0 / 전이−(3n−4) 최대 0
abbbbbbbbb n 10 상태·전이 (19, 19)
abbbbbbbbc n 10 상태·전이 (18, 26)
n=10⁵ DNA: 상태/n 1.62 전이/n 2.54
```
차이의 최댓값이 0이라 경계에 닿을 뿐 넘지 않았다. "abbbbbbbbb"는 상태 19 = 2·10 − 1, "abbbbbbbbc"는 전이 26 = 3·10 − 4로 두 경계를 정확히 채운다. 무작위 문자열에서는 상태가 1.6n, 전이가 2.5n 정도다. 구성 시간도 알파벳 크기를 상수로 보면 O(n)이다. 링크를 타는 반복의 총횟수가 분할 상환으로 O(n)임이 알려져 있다.

## 응용 네 가지와 무작위 대조
- **판정**: t를 따라 걸어 전이가 끊기지 않으면 부분 문자열이다. O(∣t∣).
- **서로 다른 부분 문자열 수**: 상태 v는 길이 `len(link(v)) + 1`~`len(v)`의 문자열을 하나씩 묶으므로 `Σ (len(v) − len(link(v)))`다.
- **등장 횟수**: t의 등장 횟수는 ∣endpos∣이고, 링크 트리에서 v의 서브트리에 있는 "끝 위치를 처음 만든 상태"(복제가 아닌 상태) 수다. len이 긴 상태부터 cnt를 링크 쪽으로 더한다.
- **최장 공통 부분 문자열**: t를 한 글자씩 읽으며 걷다가 전이가 없으면 링크로 물러나 일치 길이를 `len(link)`로 줄인다.

앞 코드에 이어서, 모든 부분 문자열을 모은 집합 subs로 구한 답(겹침을 허용해 센 횟수, t에 들어 있는 가장 긴 원소)과 비교한다. 접미사 배열의 공식 `n(n + 1)/2 − Σlcp`도 같은 값을 내는지 본다.
```python
def occurrences(a):
    cnt = a.cnt[:]
    for v in sorted(range(1, len(cnt)), key=lambda v: -a.len[v]):
        cnt[a.link[v]] += cnt[v]            # 자식(긴 쪽)부터 부모로
    return cnt

def lcs(a, t):
    v = l = best = 0
    for c in t:
        while v and c not in a.nxt[v]:
            v = a.link[v]; l = a.len[v]     # 더 짧은 접미사로 물러나기
        if c in a.nxt[v]:
            v, l = a.nxt[v][c], l + 1
        best = max(best, l)
    return best

from os.path import commonprefix

rng = random.Random(5)
for _ in range(500):
    s = "".join(rng.choice("abc") for _ in range(rng.randint(1, 25)))
    t = "".join(rng.choice("abc") for _ in range(rng.randint(1, 25)))
    a, n = SAM(s), len(s)
    subs = {s[i:j] for i in range(n) for j in range(i + 1, n + 1)}
    distinct = sum(a.len[v] - a.len[a.link[v]] for v in range(1, len(a.len)))
    suf = sorted(s[i:] for i in range(n))
    lcp = [len(commonprefix(p)) for p in zip(suf, suf[1:])]
    sa_formula = n * (n + 1) // 2 - sum(lcp)
    assert distinct == len(subs) == sa_formula
    cnt = occurrences(a)
    for u in subs:
        brute = sum(s.startswith(u, i) for i in range(n))
        assert cnt[a.state(u)] == brute
    for i in range(len(t)):
        assert (a.state(t[i:]) != -1) == (t[i:] in s)
    assert lcs(a, t) == max((len(u) for u in subs if u in t), default=0)
print("무작위 500개: 개수·등장 횟수·판정·LCS 모두 일치")
a = SAM("abcbc")
print("cb" in "abcbc", a.state("cb") != -1, occurrences(a)[a.state("bc")])
```
```text
무작위 500개: 개수·등장 횟수·판정·LCS 모두 일치
True True 2
```
모든 부분 문자열의 등장 횟수가 맞았고, 서로 다른 부분 문자열 수는 집합 크기·접미사 배열 공식과 셋 다 같았다. 예제의 "bc"는 2번 나온다.

## 접미사 배열과 비교
문자열 알고리즘 5편 「접미사 배열과 LCP 배열」의 접미사 배열도 같은 질문에 답한다.

| 항목 | 접미사 배열 | 접미사 오토마톤 |
|---|---|---|
| 만들기 | O(n log n) | O(n), 온라인 |
| 메모리 | 정수 배열 2개 | 상태 2n·전이 3n |
| 글자 추가 | 다시 만들기 | 분할 상환 O(1) |
| 사전순 질문 | 바로 됨 | 경로 수 DP 필요 |

글자가 계속 들어오는 스트림이나 "t를 걸으며 일치를 유지하는" 질문은 오토마톤이, 메모리가 빠듯하거나 사전순 k번째 접미사 같은 질문은 접미사 배열이 편하다.

## 자주 하는 실수와 변형
- 복제할 때 전이를 `dict(...)`로 복사하지 않고 같은 객체를 쓰면, 나중에 한쪽을 고칠 때 다른 쪽도 바뀐다.
- 복제본의 cnt를 1로 두면 등장 횟수가 부풀려진다. 복제본은 새 끝 위치를 만들지 않는다.
- cnt 합산은 len 내림차순이어야 한다. 정렬 대신 len으로 계수 정렬하면 O(n)이다.
- **사전순 k번째 부분 문자열**: 상태마다 "여기서 출발하는 경로 수"를 DAG DP로 세고, 전이를 글자 순으로 보며 내려간다.
- **여러 문자열**: 구분 문자를 넣어 이어 붙이거나, 문자열마다 마지막 상태를 뿌리로 되돌리며 넣는 일반화 접미사 오토마톤을 쓴다.

## 복잡도
| 작업 | 오토마톤 | 집합 방법 |
|---|---|---|
| 구성 | O(n) | O(n³) 글자 |
| 판정 | O(m) | O(m) 해시 |
| 서로 다른 개수 | O(n) | O(n³) |
| 등장 횟수 전처리 | O(n log n) | O(n³) |
| LCS | O(n + m) | O(nm) DP |

공간은 상태 2n − 1개, 전이 3n − 4개 이하로 O(n)이다. 전이를 해시 대신 크기 σ 배열로 두면 판정이 빨라지지만 공간이 O(nσ)가 된다.

## 어디에 쓰이나
- 문자열 알고리즘 4편 「아호-코라식: 여러 패턴을 한 번에 찾기」: 일치가 끊기면 "가장 긴 접미사 상태"로 물러나는 LCS 걷기는 아호-코라식의 실패 링크 검색과 같은 움직임이다.
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: "endpos가 같다"는 동치 관계이고 상태는 그 동치류이며, 링크 트리는 endpos의 포함 관계(부분 순서)를 그린 것이다.
- 문자열 알고리즘 5편 「접미사 배열과 LCP 배열」: 서로 다른 부분 문자열 수를 그 글은 LCP로, 이 글은 상태별 길이 범위로 세며 두 값이 늘 같다.

## 정리
- endpos가 같은 부분 문자열을 묶은 상태들이 모든 부분 문자열을 받아들이는 최소 DFA를 이룬다.
- 한 상태의 문자열은 길이가 연속인 접미사들이고, 접미사 링크가 더 짧은 쪽 상태를 가리켜 트리를 만든다.
- 한 글자씩 붙이며 필요할 때만 상태를 복제하면 O(n)에 만들어지고, 상태 ≤ 2n − 1·전이 ≤ 3n − 4가 실험에서도 성립했다.
- 판정·서로 다른 개수·등장 횟수·LCS가 무작위 500개에서 느린 방법과 모두 일치했다.

## 더 알아보기
- 이전 글: 7편 「Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화」
- 다음 글: 9편 「헝가리안 알고리즘: 할당 문제를 O(n³)에」
- Suffix automaton(위키백과 영어판): https://en.wikipedia.org/wiki/Suffix_automaton
