# [동적 계획법 4/12] LCS와 편집 거리: 두 문자열을 맞추는 DP

> **한 줄 요약** — 두 문자열의 접두사 쌍 (i, j)를 상태로 삼아 "마지막 글자끼리 짝짓거나 한쪽 글자를 버리는" 전이로 표를 채우면 최장 공통 부분 수열(LCS)과 편집 거리를 O(nm)에 구하고, 표를 거꾸로 읽으면 diff가 나온다.

## 이 글에서 다루는 것
- LCS 표 dp[i][j]와 역추적으로 diff 만들기
- 편집 거리(레벤슈타인 거리)의 세 연산과 점화식
- 두 줄만 남겨 메모리를 O(min(n, m))으로 줄이기
- diff 도구와의 관계: 삽입·삭제 거리 = n + m − 2·LCS
- 문자열 그래프 BFS와의 무작위 대조

## 예제 문제
두 가지 문제를 함께 본다. 첫째, `ABCBDAB`와 `BDCABA` 양쪽의 부분 수열(3편: 순서는 지키되 연속일 필요 없음)이 되는 가장 긴 문자열은? 길이 4인 `BDAB`, `BCBA` 등이다. 이것이 **최장 공통 부분 수열**(longest common subsequence, LCS)이다. 둘째, `kitten`을 `sitting`으로 바꾸려면 글자 하나 삽입·삭제·교체를 최소 몇 번 해야 하나? k → s, e → i 교체와 g 삽입으로 3번이다. 이것이 **편집 거리**(edit distance)다. 블라디미르 레벤슈타인이 1965년에 이 거리를 다뤄 **레벤슈타인 거리**라고도 한다.

완전 탐색은 막막하다. LCS는 한쪽의 부분 수열 2ⁿ개를 모두 시도해야 하고, 편집 거리는 연산을 어디에 어떤 글자로 할지 경우가 끝없이 갈라진다.

## LCS: 접두사 쌍을 상태로
두 문자열을 다루는 DP의 기본 상태는 **접두사 쌍**이다. `dp[i][j]`를 `a[:i]`와 `b[:j]`의 LCS 길이로 둔다. 전이는 두 접두사의 마지막 글자를 보고 정한다.
- `a[i−1] = b[j−1]`이면 `dp[i][j] = dp[i−1][j−1] + 1`. 어떤 최적 LCS가 이 두 글자를 안 쓰더라도, 그 마지막 짝을 이 짝으로 바꿔 끼우면 길이가 같은 LCS가 되므로 짝지어도 손해가 없다.
- 다르면 `dp[i][j] = max(dp[i−1][j], dp[i][j−1])`. 두 마지막 글자가 서로 짝일 수는 없으니 적어도 한쪽은 LCS에 안 쓰인다.

초기값은 한쪽이 빈 문자열인 `dp[0][j] = dp[i][0] = 0`, 답은 `dp[n][m]`이다. 칸마다 위·왼쪽·왼쪽 위만 보므로 행 순서로 채운다. 고른 글자는 표를 끝에서부터 거꾸로 읽어 찾는다. 끝 글자가 같으면 공통 글자로 내보내고 대각선으로, 다르면 값이 유지되는 쪽으로 간다. 왼쪽으로 가면 b의 글자가 추가된 것이고(`+`), 위로 가면 a의 글자가 삭제된 것이다(`-`). 이것이 diff다.
```python
def lcs_table(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:             # 끝이 같으면 짝짓는다
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:                                # 한쪽 끝을 버린다
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp

def diff(a, b):                      # 표를 거꾸로 읽어 diff 만들기
    dp, i, j, out = lcs_table(a, b), len(a), len(b), []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and a[i - 1] == b[j - 1]:
            out.append("  " + a[i - 1])
            i, j = i - 1, j - 1
        elif j > 0 and (i == 0 or dp[i][j - 1] >= dp[i - 1][j]):
            out.append("+ " + b[j - 1])
            j -= 1
        else:
            out.append("- " + a[i - 1])
            i -= 1
    return out[::-1]

common = [s[2:] for s in diff("ABCBDAB", "BDCABA") if s[0] == " "]
print("LCS:", "".join(common), len(common))
old = ["x = 1", "y = 2", "print(x)", "z = x + y", "print(z)"]
new = ["x = 1", "print(x)", "z = x * y", "print(z)", "done()"]
print("\n".join(diff(old, new)))
```
```text
LCS: BDAB 4
  x = 1
- y = 2
  print(x)
- z = x + y
+ z = x * y
  print(z)
+ done()
```
같은 함수가 글자 목록에도 줄 목록에도 그대로 동작한다. 원소가 같은지만 비교하기 때문이다. 바뀐 줄 하나가 "삭제 + 추가" 한 쌍으로 보이는 것도 실제 diff 도구와 같다. 동점일 때 거꾸로 읽으면서 `+`를 먼저 고르면, 뒤집은 결과에서는 `-`가 `+`보다 앞에 나온다.

## 편집 거리: 세 갈래 전이
상태는 똑같이 접두사 쌍이다. `d[i][j]`를 `a[:i]`를 `b[:j]`로 바꾸는 최소 연산 수로 두고, 최적 편집에서 마지막 글자들이 어떻게 처리되었는지로 나눈다.
```text
d[i][j] = min(d[i−1][j] + 1,   삭제
              d[i][j−1] + 1,   삽입
              d[i−1][j−1] + c) 교체
c = 0 (끝 글자가 같을 때), 아니면 1
d[i][0] = i, d[0][j] = j
```
a의 마지막 글자를 지우거나, b의 마지막 글자를 끝에 넣거나, 마지막 글자끼리 맞추는(다르면 교체) 세 경우다. 이 표 채우기는 1974년 와그너와 피셔의 논문으로 널리 알려져 **와그너-피셔 알고리즘**이라 부르며, 여러 사람이 독립적으로 찾았다. 행 i는 행 i − 1만 보므로 두 줄만 남기면 되고, 짧은 쪽을 열로 두면 메모리가 O(min(n, m))이다. 편집 거리는 대칭(삽입과 삭제를 맞바꾸면 거꾸로 가는 편집)이라 두 문자열을 바꿔도 된다.
```python
def edit_distance(a, b):
    if len(a) < len(b):
        a, b = b, a                  # 짧은 쪽을 열로: 메모리 O(min(n, m))
    prev = list(range(len(b) + 1))   # 빈 문자열 → b[:j]: j번 삽입
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)     # a[:i] → 빈 문자열: i번 삭제
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1,                # a[i-1] 삭제
                         cur[j - 1] + 1,             # b[j-1] 삽입
                         prev[j - 1] + (a[i - 1] != b[j - 1]))  # 교체
        prev = cur                   # 윗줄은 버린다
    return prev[-1]

for a, b in [("kitten", "sitting"), ("sunday", "saturday"),
             ("고양이", "고양잇과"), ("", "abc")]:
    print(a or "(빈)", "→", b, edit_distance(a, b))
```
```text
kitten → sitting 3
sunday → saturday 3
고양이 → 고양잇과 2
(빈) → abc 3
```
두 줄만 남기면 역추적에 필요한 표가 사라진다. 실제 편집 순서까지 선형 메모리로 얻으려면 히르슈베르크(1975)의 분할 정복을 쓴다. a를 반으로 자르고, 앞 절반은 앞에서부터, 뒤 절반은 뒤에서부터 두 줄 DP를 돌려 b를 자를 최적 지점을 찾은 뒤 양쪽을 재귀로 푼다. 시간은 O(nm) 그대로다.

## diff 도구와의 관계
교체 없이 삽입과 삭제만 허용하면 편집 거리는 `n + m − 2·LCS`다. LCS에 든 글자는 그대로 두고, a에만 있는 나머지 n − LCS개를 지우고 b의 나머지 m − LCS개를 넣으면 되며, 그보다 적게는 불가능하다. 그래서 "추가·삭제 줄 수가 가장 적은 diff"는 줄 단위 LCS 문제다. 유닉스 diff의 핵심 알고리즘(헌트와 매클로이, 1976년 벨 연구소 보고서)이 바로 LCS를 구해 바뀌지 않은 줄을 찾는다. git의 기본 diff는 마이어스(1986)의 O(ND) 알고리즘으로, D(삽입·삭제 거리)가 작을 때, 즉 두 파일이 조금만 다를 때 O(nm) 표보다 훨씬 빠르다.

## 무작위 대조 검사
앞 코드에 이어서 실행한다. LCS는 a의 부분 수열을 긴 것부터 모두 시도해 비교하고, diff는 적용했을 때 a와 b가 정확히 나오는지 확인한다. 편집 거리는 "문자열 = 정점, 연산 하나 = 간선"인 그래프의 BFS 최단 거리와 비교한다. 최적 편집은 삭제를 먼저, 삽입을 나중에 하도록 순서를 바꿀 수 있으므로 길이 max(n, m)을 넘는 문자열은 탐색하지 않아도 된다.
```python
import random
from collections import deque
from itertools import combinations

def lcs_brute(a, b):                 # a의 부분 수열을 긴 것부터 시도
    for r in range(len(a), -1, -1):
        for idx in combinations(range(len(a)), r):
            it = iter(b)             # b의 부분 수열인지 확인
            if all(a[i] in it for i in idx):
                return r

def dist_bfs(a, b, subst=True):      # 문자열 그래프의 BFS 최단 거리
    abc, top = set(a + b), max(len(a), len(b))
    dist, q = {a: 0}, deque([a])
    while q:
        s = q.popleft()
        if s == b:
            return dist[s]
        nxt = [s[:i] + s[i + 1:] for i in range(len(s))]
        if len(s) < top:
            nxt += [s[:i] + c + s[i:] for i in range(len(s) + 1)
                    for c in abc]
        if subst:
            nxt += [s[:i] + c + s[i + 1:] for i in range(len(s))
                    for c in abc]
        for t in nxt:
            if t not in dist:
                dist[t] = dist[s] + 1
                q.append(t)

rng = random.Random(4)
word = lambda k: "".join(rng.choice("abc") for _ in range(k))
for _ in range(500):
    a, b = word(rng.randint(0, 9)), word(rng.randint(0, 9))
    L = lcs_table(a, b)[-1][-1]
    assert L == lcs_brute(a, b)
    d = diff(a, b)                   # diff를 적용하면 a, b가 나와야 한다
    assert "".join(s[2:] for s in d if s[0] != "+") == a
    assert "".join(s[2:] for s in d if s[0] != "-") == b
    assert sum(s[0] == " " for s in d) == L
    a, b = a[:5], b[:5]
    assert edit_distance(a, b) == dist_bfs(a, b)
    L = lcs_table(a, b)[-1][-1]      # 삽입·삭제만 쓰면 n + m − 2·LCS
    assert len(a) + len(b) - 2 * L == dist_bfs(a, b, subst=False)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 자주 하는 실수와 변형
- 표 크기를 n × m으로 잡아 "빈 접두사" 행·열을 빠뜨리기. (n + 1) × (m + 1)이고 0행·0열이 초기값이다.
- **최장 공통 부분 문자열**(연속)과 헷갈리기. 연속이면 다를 때 0으로 끊어야 한다: `dp[i][j] = dp[i−1][j−1] + 1`(같을 때), `0`(다를 때), 답은 표 전체의 최댓값.
- 문자열 세 개의 LCS는 상태를 (i, j, k)로 늘려 O(nmk)다.
- 연산마다 비용이 다르면(교체 2, 삽입 1 등) 점화식의 +1을 그 비용으로 바꾸면 된다.

## 복잡도
| 방법 | 시간 | 공간 |
|---|---|---|
| LCS 완전 탐색 | O(m·2ⁿ) | O(n) |
| 표 전체(역추적 가능) | O(nm) | O(nm) |
| 두 줄만(값만) | O(nm) | O(min(n, m)) |
| 히르슈베르크(복원) | O(nm) | O(n + m) |

칸이 (n + 1)(m + 1)개이고 칸마다 이웃 세 칸만 보므로 O(nm)이다. 10만 줄짜리 두 파일이면 칸이 100억 개라, 실제 diff 도구는 마이어스 알고리즘이나 헌트-매클로이처럼 "같은 줄"이 드물다는 점을 이용한다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 13편 「AI 에이전트와 자연어 프로그래밍: 명세와 검증의 시대」: SWE-bench에서 모델이 내는 패치는 diff 형식이고, diff는 줄 단위 LCS(또는 같은 답을 더 빨리 내는 마이어스 알고리즘)로 바뀌지 않은 줄을 찾아 만든다.
- 통계학 11편 「모델 평가: 교차 검증과 평가 지표」: 출력이 문장인 음성 인식 모델은 분류 지표 대신, 단어 단위 편집 거리를 정답 단어 수로 나눈 단어 오류율(WER)로 평가한다.
- 생물정보학의 서열 정렬: 니들먼-분쉬 알고리즘(1970)은 생물 서열 비교에 DP를 처음 쓴 것으로 꼽히며, 편집 거리의 +1 대신 글자쌍별 점수와 틈(gap) 벌점을 넣은 같은 모양의 표다.

## 정리
- 두 문자열 DP의 기본 상태는 접두사 쌍 (i, j)이고, 마지막 글자들을 어떻게 처리했는지로 전이를 나눈다.
- LCS는 같으면 대각선 + 1, 다르면 위·왼쪽 중 큰 값이며, 표를 거꾸로 읽으면 diff가 나온다.
- 편집 거리는 삭제·삽입·교체 세 갈래의 최솟값이고, 두 줄만 남기면 메모리가 O(min(n, m))이다.
- 삽입·삭제만의 거리는 n + m − 2·LCS라서 diff 도구는 줄 단위 LCS를 구한다.

## 더 알아보기
- 이전 글: 3편 「최장 증가 부분 수열: O(n²)에서 O(n log n)으로」
- 다음 글: 5편 「구간 DP: 행렬 곱셈 순서와 파일 합치기」
- Wagner–Fischer algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Wagner%E2%80%93Fischer_algorithm
