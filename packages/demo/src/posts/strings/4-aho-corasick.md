# [문자열 알고리즘 4/6] 아호-코라식: 여러 패턴을 한 번에 찾기

> **한 줄 요약** — 아호-코라식은 패턴들을 트라이로 묶고, 각 노드에 KMP의 실패 함수를 일반화한 실패 링크와 출력 링크를 BFS로 달아, 텍스트를 한 번만 읽으면서 모든 패턴의 모든 등장을 O(n + 패턴 총길이 + 일치 수)에 찾는다.

## 이 글에서 다루는 것
- 패턴마다 따로 검색하면 패턴 수에 비례해 느려지는 이유
- 트라이 + 실패 링크 + 출력 링크로 오토마톤 만들기
- 단순 검색과 무작위 대조, 비교 횟수 측정
- 금칙어 필터 예제

## 예제 문제: 금칙어 찾기
금칙어 목록이 k개 있고, 들어오는 글에서 금칙어가 나오는 위치를 모두 찾아 가려야 한다. 고전 예제는 패턴 {he, she, his, hers}와 텍스트 "ushers"다. 답은 위치 1의 she, 위치 2의 he와 hers다. "she" 안에 "he"가 들어 있는 것처럼 패턴끼리 겹치는 것이 핵심 난점이다.

패턴마다 2편의 KMP를 돌리면 O(k·n + 패턴 총길이)다. 금칙어가 수천 개면 글 하나를 수천 번 읽는다. 텍스트는 한 번만 읽고 싶다.
```python
from collections import deque
import random

def naive_multi(text, pats):
    res = []
    for k, p in enumerate(pats):
        for i in range(len(text) - len(p) + 1):
            if text[i:i + len(p)] == p:
                res.append((i, k))
    return sorted(res)

PATS = ["he", "she", "his", "hers"]
print([(i, PATS[k]) for i, k in naive_multi("ushers", PATS)])
```
```text
[(1, 'she'), (2, 'he'), (2, 'hers')]
```

## 트라이에 실패 링크 달기
먼저 패턴들을 트라이(고급 자료 구조 7편 「트라이: 접두사 검색과 XOR 최댓값」)에 넣는다. 노드 하나는 "어떤 패턴의 접두사"이고, 텍스트를 읽으며 트라이를 따라 내려가면 지금 맞춰 가는 접두사를 추적할 수 있다.
```text
(0)─h─(1)─e─(2)─r─(8)─s─(9)
 │     └─i─(6)─s─(7)
 └─s─(3)─h─(4)─e─(5)
끝나는 패턴: 2 he, 5 she
             7 his, 9 hers
```
막히면 어떻게 할까? KMP는 "가장 긴 경계"로 물러났다. 여기서는 **실패 링크**(failure link)가 그 역할을 한다. 노드 v의 실패 링크는 "v가 나타내는 문자열의 진짜 접미사 중 트라이에 있는 가장 긴 것"이다. "sh"(4)에서 다음 글자가 e가 아니면 "h"(1)로 물러나 이어 맞춘다. 2편의 실패 함수가 한 패턴 안의 경계였다면, 실패 링크는 여러 패턴을 넘나드는 경계다.

실패 링크가 가리키는 노드는 언제나 더 얕다. 그래서 깊이 순서, 즉 **BFS 순서**로 계산하면 필요한 값이 항상 먼저 준비된다. 부모 v에서 글자 c로 내려간 자식 u의 실패 링크는, v의 실패 링크에서 시작해 c로 내려갈 수 있을 때까지 실패 링크를 따라 올라간 곳에서 c로 한 칸 내려간 노드다. KMP의 `while j > 0 and p[i] != p[j]: j = pi[j−1]`과 같은 모양이다.

## 출력 링크: 겹친 패턴 놓치지 않기
"she"(5)에 도착했을 때 "he"도 끝났다는 것을 알아야 한다. "he"는 "she"의 접미사이므로 실패 링크 사슬 위에 있다. 매번 사슬 끝까지 올라가면 느리므로, 각 노드에 "실패 링크 사슬에서 가장 가까운, 패턴이 끝나는 노드"를 **출력 링크**(output link, 사전 접미사 링크라고도 한다)로 저장한다. 출력 링크만 따라가면 일치 하나에 한 단계씩만 쓴다(앞 코드에 이어서).
```python
class AhoCorasick:
    def __init__(self, pats):
        self.pats, self.goto, self.out = pats, [{}], [[]]
        for k, p in enumerate(pats):          # 1) 트라이
            v = 0
            for c in p:
                if c not in self.goto[v]:
                    self.goto[v][c] = len(self.goto)
                    self.goto.append({})
                    self.out.append([])
                v = self.goto[v][c]
            self.out[v].append(k)
        n = len(self.goto)
        self.fail, self.link = [0] * n, [-1] * n
        q = deque(self.goto[0].values())      # 2) BFS로 링크 계산
        while q:
            v = q.popleft()
            for c, u in self.goto[v].items():
                f = self.fail[v]
                while f and c not in self.goto[f]:
                    f = self.fail[f]
                self.fail[u] = self.goto[f].get(c, 0)
                g = self.fail[u]
                self.link[u] = g if self.out[g] else self.link[g]
                q.append(u)

    def search(self, text):
        res, v, steps = [], 0, 0
        for i, c in enumerate(text):
            while v and c not in self.goto[v]:
                v, steps = self.fail[v], steps + 1
            v, steps = self.goto[v].get(c, 0), steps + 1
            u = v if self.out[v] else self.link[v]
            while u != -1:                    # 출력 링크로 겹친 패턴까지
                for k in self.out[u]:
                    res.append((i - len(self.pats[k]) + 1, k))
                u = self.link[u]
        return sorted(res), steps

ac = AhoCorasick(PATS)
print([(i, PATS[k]) for i, k in ac.search("ushers")[0]])
print("fail", {v: f for v, f in enumerate(ac.fail) if f})
print("link", {v: g for v, g in enumerate(ac.link) if g != -1})
```
```text
[(1, 'she'), (2, 'he'), (2, 'hers')]
fail {4: 1, 5: 2, 7: 3, 9: 3}
link {5: 2}
```
그림의 번호로 읽으면 sh(4)→h(1), she(5)→he(2), his(7)와 hers(9)→s(3)로 물러나고(나머지는 루트 0), 출력 링크는 she(5)→he(2) 하나뿐이다. 같은 패턴이 두 번 들어오면 한 노드에 패턴 번호가 둘 쌓이므로 `out`을 리스트로 둔다.

## 무작위 대조 검사
패턴 수, 길이, 중복을 모두 무작위로 섞어 패턴별 단순 검색과 비교한다. 알파벳을 "ab"처럼 작게 하면 겹침과 실패 링크 사슬이 많이 생겨 검사가 엄격해진다(앞 코드에 이어서).
```python
rng = random.Random(4)
for _ in range(500):
    abc = "abc"[:rng.randint(1, 3)]
    pats = ["".join(rng.choice(abc) for _ in range(rng.randint(1, 4)))
            for _ in range(rng.randint(1, 8))]
    text = "".join(rng.choice(abc) for _ in range(rng.randint(0, 40)))
    assert AhoCorasick(pats).search(text)[0] == naive_multi(text, pats)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 금칙어 필터와 비용 측정
찾은 구간을 차분 배열(알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」)로 표시하면, 겹친 금칙어도 한 번에 가릴 수 있다. 그리고 패턴 100개, 텍스트 5,000글자에서 패턴별로 글자를 비교하는 단순한 방법과 오토마톤의 상태 이동 횟수를 센다(앞 코드에 이어서).
```python
def mask(text, words):
    diff = [0] * (len(text) + 1)
    for i, k in AhoCorasick(words).search(text)[0]:
        diff[i] += 1
        diff[i + len(words[k])] -= 1
    out, cover = [], 0
    for i, ch in enumerate(text):
        cover += diff[i]
        out.append("*" if cover else ch)
    return "".join(out)

print(mask("무료광고와 도박 광고를 거른다", ["광고", "도박", "무료광고"]))

def naive_comps(text, pats):
    comps = 0
    for p in pats:
        for i in range(len(text) - len(p) + 1):
            for j in range(len(p)):
                comps += 1
                if text[i + j] != p[j]:
                    break
    return comps

text = "".join(rng.choice("abcd") for _ in range(5000))
pats = ["".join(rng.choice("abcd") for _ in range(rng.randint(3, 8)))
        for _ in range(100)]
found, steps = AhoCorasick(pats).search(text)
print("패턴별 단순 비교:", naive_comps(text, pats))
print("아호-코라식 상태 이동:", steps, "/ 일치", len(found))
```
```text
****와 ** **를 거른다
패턴별 단순 비교: 663948
아호-코라식 상태 이동: 9465 / 일치 1330
```
단순한 방법은 패턴 수에 비례해 비교가 늘지만, 오토마톤은 글자당 상태 이동이 평균 2번 안쪽이고 패턴 수와 거의 무관하다. 텍스트의 각 글자에서 내려가는 이동은 한 번이고, 실패 링크로 올라가는 이동은 깊이를 줄이므로 KMP와 같은 분할 상환으로 전체 2n 이하다.

## 자주 하는 실수와 변형
- 출력 링크(또는 실패 사슬 확인)를 빼먹어 "she" 안의 "he"를 놓친다.
- 실패 링크를 DFS 순서로 계산해 아직 구하지 않은 얕은 노드 값을 읽는다.
- 일치가 많을 수 있다. "a"…"aaaa"를 "aaaa…"에서 찾으면 일치 수 z가 nk에 가깝고, 출력 시간이 그만큼 든다. 개수만 필요하면 노드별 개수를 실패 링크 방향으로 누적해 O(n + 노드 수)로 센다.
- 변형: 모든 글자에 대한 전이를 표로 펼치면(DFA) 검색에서 while이 사라진다. "금칙어를 하나도 포함하지 않는 길이 L 문자열의 개수"는 이 DFA 위의 DP(동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」)로 센다.

## 복잡도
| 단계 | 시간 | 비고 |
|---|---|---|
| 트라이 | O(L) | L = 패턴 총길이 |
| 링크 계산 | O(L) | 분할 상환 |
| 검색 | O(n + z) | z = 일치 수 |
| 패턴별 KMP | O(kn + L) | k = 패턴 수 |

공간은 노드 수 O(L)이다. 자식을 딕셔너리로 두었으므로 글자 조회는 평균 O(1)이고, 전이 표로 펼치면 O(L·σ) 메모리를 쓴다(σ는 알파벳 크기).

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 실패 링크는 항상 더 얕은 노드를 가리키므로, 거리 순으로 방문하는 BFS 순서가 "필요한 값이 먼저 계산된다"를 보장한다.
- 트랜지스터에서 자연어까지 4편 「순차 회로: 클록, 플립플롭, 메모리」: 아호-코라식은 원 논문 표현으로도 "패턴 매칭 기계"라는 유한 상태 기계이고, 글자 하나에 상태 전이 한 번이라는 점이 그 글의 상태 기계와 같다.
- 실제 도구: 아호(Aho)와 코라식(Corasick)은 1975년 CACM 논문에서 벨 연구소의 서지 검색 프로그램을 5~10배 빠르게 만들었다고 보고했고, 이 방법은 초기 유닉스 `fgrep`의 바탕이 되었다. 네트워크 침입 탐지 시스템 Snort도 패킷 내용 검사에 최적화한 아호-코라식 오토마톤을 쓴다.

## 정리
- 아호-코라식은 트라이 위에 실패 링크(가장 긴 접미사 노드)와 출력 링크(가장 가까운 패턴 끝 노드)를 단 오토마톤이다.
- 실패 링크는 KMP 실패 함수의 일반화이고, 더 얕은 노드를 가리키므로 BFS 순서로 계산한다.
- 텍스트를 한 번만 읽어 O(n + L + z)에 모든 패턴의 모든 등장을 찾으며, 패턴 수가 늘어도 검색 비용은 거의 그대로다.

## 더 알아보기
- 이전 글: 3편 「Z 알고리즘: 모든 위치의 최장 공통 접두사」
- 다음 글: 5편 「접미사 배열과 LCP 배열」
- Aho–Corasick algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Aho%E2%80%93Corasick_algorithm
