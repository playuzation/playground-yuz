# [심화 알고리즘 3/14] 웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에

> **한 줄 요약** — 웨이블릿 트리는 값의 범위를 반씩 나누며 층마다 "이 원소가 작은 절반으로 갔나"를 비트 하나로 적고 그 누적 개수(rank)만 들고 있어서, 구간 k번째 수·x 미만 개수·x의 등장 횟수를 모두 O(log σ)에 답하면서 공간은 n log σ 비트에 그친다.

## 이 글에서 다루는 것
- 값 범위를 반씩 나누는 트리와 층마다의 비트 벡터, 누적 개수
- 구간 k번째 작은 수, 구간에서 x 미만인 수 개수, x의 등장 횟수
- 비트만으로 원래 수열 복원하기와 무작위 대조
- 퍼시스턴트 세그먼트 트리와의 비교, FM-인덱스에서의 쓰임

## 예제 문제: 구간 통계를 계속 묻기
길이 n인 정수 배열이 고정되어 있고 "a[l:r]에서 k번째로 작은 수는?", "a[l:r]에서 x 미만인 수는 몇 개?", "a[l:r]에 x가 몇 번 나오나?"가 q번 들어온다. 구간을 잘라 정렬하면 질의마다 O(len·log len)이다. 고급 자료 구조 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」는 접두사 버전 두 개의 차로 O(log n)에 답하지만 노드가 n(log n + 1)개쯤 필요하고 노드마다 포인터 두 개와 개수를 든다. **웨이블릿 트리**(wavelet tree)는 같은 질의를 비트 n log σ개(σ = 서로 다른 값의 수)로 답한다. 2003년 그로시(Roberto Grossi)·굽타(Ankur Gupta)·비터(Jeffrey Vitter)가 압축 접미사 배열 논문에서 도입했다.

## 구조: 값 범위를 반으로, 원소마다 비트 하나
값을 좌표 압축해 순위 0~σ−1로 바꾼다. 뿌리는 순위 [0, σ)를 맡고, 가운데 mid를 기준으로 작은 절반 [0, mid)는 왼쪽 자식, 나머지는 오른쪽 자식이 맡는다. 노드에는 자기에게 온 원소들을 **원래 순서 그대로** 두고, 원소마다 "왼쪽으로 가면 0, 오른쪽이면 1"인 비트를 적는다. 자식은 그 원소들을 순서를 지킨 채 나눠 받는다. 배열 [5, 1, 4, 1, 3, 9, 2, 6]의 위 두 층은 이렇다.
```text
[5 1 4 1 3 9 2 6]  {1,2,3} 왼쪽
 1 0 1 0 0 1 0 1
     ↙         ↘
[1 1 3 2]      [5 4 9 6]
{1} 왼쪽       {4,5} 왼쪽
 0 0 1 1        0 0 1 1
```
질의의 열쇠는 **rank**, 곧 "비트 열의 앞 i칸 중 0의 개수"다. 이것을 누적 배열 `c`로 들고 있으면 구간 [l, r) 중 왼쪽으로 간 원소 수가 `c[r] − c[l]`이고, 그 원소들은 왼쪽 자식에서 정확히 [c[l], c[r]) 자리에 모여 있다. 순서를 지키며 나눴기 때문이다. 오른쪽 자식에서는 [l − c[l], r − c[r])이다. 그래서 구간을 들고 한 층 내려갈 때마다 O(1)이고, 층은 ⌈log₂ σ⌉개다.

- **k번째 작은 수**: 구간에서 왼쪽으로 간 수가 k보다 많으면 답은 작은 절반에 있으니 왼쪽으로, 아니면 그만큼 k에서 빼고 오른쪽으로 간다. 잎에 닿으면 그 값이 답이다.
- **x 미만 개수**: x의 순위 q가 mid보다 크면 왼쪽으로 간 수는 모두 q 미만이라 한꺼번에 더하고 오른쪽으로, 아니면 왼쪽으로 내려간다.
- **x의 등장 횟수**: (x + 1 미만 개수) − (x 미만 개수). x의 잎까지 구간을 따라 내려가 남은 길이를 읽어도 된다.
- **a[i] 복원**: 위치 하나를 같은 규칙으로 따라 내려가면 잎이 a[i]다. 트리가 원래 배열을 대신한다.

## 구현
여기서는 읽기 쉽게 비트 대신 누적 개수 리스트를 노드마다 둔다. 노드는 맡은 순위 범위 (lo, hi)로 찾는다.
```python
import bisect, random

class WaveletTree:
    def __init__(self, a):
        self.vals = sorted(set(a))                  # 좌표 압축
        rank = {x: i for i, x in enumerate(self.vals)}
        self.cnt = {}                       # (lo, hi) → 누적 0의 개수
        self.build([rank[x] for x in a], 0, len(self.vals))

    def build(self, seq, lo, hi):           # 순위 [lo, hi)를 맡은 노드
        if hi - lo <= 1: return
        mid, c = (lo + hi) // 2, [0]
        for x in seq: c.append(c[-1] + (x < mid))  # 작은 절반이면 0
        self.cnt[lo, hi] = c
        self.build([x for x in seq if x < mid], lo, mid)
        self.build([x for x in seq if x >= mid], mid, hi)

    def kth(self, l, r, k):                 # a[l:r]에서 k번째(0부터)
        lo, hi = 0, len(self.vals)
        while hi - lo > 1:
            c, mid = self.cnt[lo, hi], (lo + hi) // 2
            left = c[r] - c[l]              # 구간에서 왼쪽으로 간 수
            if k < left: l, r, hi = c[l], c[r], mid
            else: k, l, r, lo = k - left, l - c[l], r - c[r], mid
        return self.vals[lo]

    def count_less(self, l, r, x):          # a[l:r]에서 x 미만 개수
        q = bisect.bisect_left(self.vals, x)        # 순위 q 미만
        lo, hi, res = 0, len(self.vals), 0
        while l < r and lo < q < hi:
            c, mid = self.cnt[lo, hi], (lo + hi) // 2
            if q <= mid: l, r, hi = c[l], c[r], mid
            else:
                res += c[r] - c[l]          # 왼쪽은 모두 q 미만
                l, r, lo = l - c[l], r - c[r], mid
        return res + (r - l if q >= hi else 0)

    def count(self, l, r, x):               # a[l:r]에서 x의 등장 횟수
        return self.count_less(l, r, x + 1) - self.count_less(l, r, x)

    def access(self, i):                    # a[i]를 비트만으로 복원
        lo, hi = 0, len(self.vals)
        while hi - lo > 1:
            c, mid = self.cnt[lo, hi], (lo + hi) // 2
            if c[i + 1] - c[i]: i, hi = c[i], mid
            else: i, lo = i - c[i], mid
        return self.vals[lo]

a = [5, 1, 4, 1, 3, 9, 2, 6]
wt = WaveletTree(a)
c = wt.cnt[0, 7]
print("뿌리 비트", [1 - (c[i + 1] - c[i]) for i in range(8)])
print(wt.kth(1, 5, 2), wt.count_less(0, 8, 4), wt.count(0, 4, 1))
print([wt.access(i) for i in range(8)])
```
```text
뿌리 비트 [1, 0, 1, 0, 0, 1, 0, 1]
3 4 2
[5, 1, 4, 1, 3, 9, 2, 6]
```
a[1:5] = [1, 4, 1, 3]에서 0부터 센 2번째는 3이다. 뿌리에서 구간의 왼쪽 개수가 c[5] − c[1] = 3 − 0 = 3 > 2라 왼쪽으로 가고, 거기서 {1}의 개수 2를 빼 k = 0으로 오른쪽, 마지막에 다시 오른쪽으로 가 3에 닿는다. 원래 배열을 버려도 `access`로 전부 되살아난다.

## 무작위 대조 검사
앞 코드에 이어서, 값 범위를 2·5·50 중에서 골라 중복이 많은 경우와 적은 경우를 섞고, 세 질의를 정렬한 구간과 비교한다. 배열에 없는 값(−1, 51)도 x로 묻는다.
```python
rng, ok, total, acc = random.Random(3), 0, 0, 0
for _ in range(500):
    m = rng.choice([2, 5, 50])
    a = [rng.randrange(m) for _ in range(rng.randint(1, 40))]
    wt = WaveletTree(a)
    acc += all(wt.access(i) == a[i] for i in range(len(a)))
    for _ in range(10):
        l = rng.randrange(len(a)); r = rng.randint(l + 1, len(a))
        k, x, s = rng.randrange(r - l), rng.randrange(-1, 52), sorted(a[l:r])
        ok += (wt.kth(l, r, k) == s[k]
               and wt.count_less(l, r, x) == sum(v < x for v in s)
               and wt.count(l, r, x) == s.count(x))
        total += 1
print(f"무작위 {total}개 질의 비교: {ok}개 일치, 복원 {acc}/500")
```
```text
무작위 5000개 질의 비교: 5000개 일치, 복원 500/500
```

## 공간: 비트 n log σ개
앞 코드에 이어서, 0~255의 수 1만 개로 만든 트리가 몇 비트를 쓰는지 센다.
```python
n = 10000
a = [rng.randrange(256) for _ in range(n)]
wt = WaveletTree(a)
levels = (len(wt.vals) - 1).bit_length()
bits = sum(len(c) - 1 for c in wt.cnt.values())
print("값 종류", len(wt.vals), "층", levels, "비트", bits)
print("퍼시스턴트 세그먼트 트리 노드 약", n * (levels + 1))
```
```text
값 종류 256 층 8 비트 80000
퍼시스턴트 세그먼트 트리 노드 약 90000
```
층마다 원소가 한 번씩 나타나므로 비트는 정확히 n × 8 = 8만 개, 1만 바이트다. 퍼시스턴트 세그먼트 트리는 노드 9만 개에 노드마다 정수 3칸이라 수십 배 크다. 실제 구현은 리스트 대신 비트 벡터를 쓰고, 64비트 블록마다 누적 개수를 조금 적어 두어 rank를 O(1)에 계산한다. 이 보조 정보는 o(n) 비트라 전체가 n log σ + o(n log σ) 비트다. 노드마다 비트 벡터를 따로 두지 않고 층마다 하나로 이어 붙인 **웨이블릿 행렬**(wavelet matrix)은 노드 포인터가 없어 구현이 더 간단하다.

## 퍼시스턴트 세그먼트 트리와 비교
두 구조는 같은 일을 다른 축으로 한다. 퍼시스턴트 세그먼트 트리는 **위치**를 따라 버전을 쌓고 값 트리를 내려가며, 웨이블릿 트리는 **값**을 따라 나누고 위치 구간을 rank로 옮긴다. 정적 배열의 구간 통계라면 웨이블릿 트리가 공간에서 크게 이긴다. 반면 퍼시스턴트 세그먼트 트리는 과거 버전에서 분기하는 갱신, 트리 경로 위 k번째 수 같은 변형에 자연스럽고, 웨이블릿 트리는 원소 변경을 지원하려면 동적 비트 벡터가 필요해 훨씬 복잡해진다.

## 자주 하는 실수와 변형
- 오른쪽으로 갈 때 구간을 `[c[l], c[r])`로 그대로 쓰는 실수: 오른쪽 자식에서의 위치는 `l − c[l]`, `r − c[r]`이다.
- 비트를 "1 = 왼쪽"으로 정했다가 rank를 0의 개수로 세면 방향이 뒤집힌다. 한쪽으로 통일한다.
- 구간에서 [x, y) 범위의 개수는 `count_less(y) − count_less(x)`다. 점 (i, aᵢ)들에 대한 2차원 직사각형 개수 세기와 같다.
- 구간에서 x 이하인 가장 큰 수, 구간 중앙값도 같은 내려가기로 O(log σ)에 답한다.

## 복잡도
| 항목 | 웨이블릿 트리 | 정렬 |
|---|---|---|
| 만들기 | O(n log σ) | - |
| k번째·개수 질의 | O(log σ) | O(len·log len) |
| 공간 | n log σ 비트 + o(·) | O(n) |

- 질의는 층마다 rank 두 번(O(1))이고 층이 ⌈log₂ σ⌉개다. 만들 때는 층마다 원소를 한 번씩 나눈다.
- 퍼시스턴트 세그먼트 트리도 질의는 O(log σ)지만 공간이 O(n log n) 워드다.

## 어디에 쓰이나
- 문자열 알고리즘 5편 「접미사 배열과 LCP 배열」: 텍스트의 BWT(접미사 배열 순서로 바로 앞 글자를 늘어놓은 문자열) 위에 웨이블릿 트리를 만들면 "앞 i칸에 글자 c가 몇 개인가"가 O(log σ)라, 패턴 등장 횟수를 뒤에서부터 글자당 rank 두 번으로 센다. 이것이 FM-인덱스로, 텍스트를 압축한 채 검색하는 압축 인덱스의 핵심이고 유전체 서열 정렬 도구에도 쓰인다.
- 고급 자료 구조 9편 「퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기」: 같은 구간 k번째 수 문제를 버전의 차 대신 rank로 구간을 옮겨 풀며, 노드 포인터를 비트로 바꾼 것이다.
- 정보 이론 1편 「정보량과 엔트로피」: 값 분포가 치우치면 허프만 모양의 웨이블릿 트리로 비트 수를 n·H₀(엔트로피) 근처까지 줄일 수 있다.

## 정리
- 값 범위를 반씩 나누며 층마다 원소의 방향을 비트로 적고, 누적 개수로 구간을 자식 쪽으로 옮긴다.
- 구간 k번째 수, x 미만 개수, 등장 횟수가 모두 O(log σ)이고 대조 5,000개가 모두 맞았다.
- 비트는 n⌈log₂ σ⌉개뿐이고 원래 배열까지 복원되어, 수 1만 개에 1만 바이트였다.
- 정적 구간 통계는 웨이블릿 트리, 버전 분기와 갱신은 퍼시스턴트 세그먼트 트리가 맞다.

## 더 알아보기
- 이전 글: 2편 「링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의」
- 다음 글: 4편 「병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기」
- 위키백과 Wavelet Tree: https://en.wikipedia.org/wiki/Wavelet_Tree
