# [알고리즘 기법 4/14] 투 포인터: 두 끝을 움직여 O(n)에 구간 찾기

> **한 줄 요약** — 투 포인터는 구간의 두 끝(또는 배열의 양 끝)을 가리키는 인덱스 두 개를 한 방향으로만 움직여 모든 후보 구간을 O(n)에 훑는 기법이고, "구간을 늘리면 조건이 한쪽으로만 변한다"는 단조성이 있을 때만 맞다.

## 이 글에서 다루는 것
- 합이 S 이상인 가장 짧은 구간: 같은 방향으로 움직이는 두 포인터
- 정렬된 배열에서 합이 X인 쌍: 양 끝에서 좁혀 오는 두 포인터
- 서로 다른 문자 k개 이하인 가장 긴 구간
- 왜 O(n)인가, 언제 쓸 수 있는가(단조성)

## 예제: 합이 S 이상인 가장 짧은 구간
양의 정수 배열에서 합이 S 이상인 연속 구간 중 가장 짧은 것의 길이를 구하자. 모든 (시작, 끝) 쌍을 보면 구간이 n(n + 1)/2개라 O(n²)이고, 합까지 매번 새로 더하면 O(n³)이다. n = 10⁵이면 1편의 기준으로 둘 다 시간 초과다.

핵심 관찰은 이렇다. 오른쪽 끝이 r일 때 합이 S 이상이 되는 가장 늦은 시작점은, r이 오른쪽으로 가도 왼쪽으로 돌아오지 않는다. 원소가 모두 양수라서 구간을 늘리면 합이 커지고 줄이면 작아지기 때문이다. 그래서 r을 한 칸 늘릴 때마다, 합이 S 이상인 동안 l을 오른쪽으로 당기며 길이를 기록하면 된다.
```text
a = 2 3 1 2 4 3,  S = 7
[2 3 1 2]4 3   합 8  → 길이 4
 2[3 1 2 4]3   합 10 → 길이 4
 2 3[1 2 4]3   합 7  → 길이 3
 2 3 1[2 4 3]  합 9  → 길이 3
 2 3 1 2[4 3]  합 7  → 길이 2
```
```python
import random

def shortest_at_least(a, s):              # 합이 s 이상인 가장 짧은 구간(없으면 0)
    best = total = l = l_moves = 0
    for r, x in enumerate(a):             # 오른쪽 끝 r을 한 칸씩 늘린다
        total += x
        while total >= s:                 # 만족하는 동안 왼쪽을 줄여 본다
            if best == 0 or r - l + 1 < best:
                best = r - l + 1
            total -= a[l]
            l += 1
            l_moves += 1
    return best, l_moves

def shortest_brute(a, s):                 # 모든 구간의 합을 직접 계산
    n = len(a)
    return min((r - l for l in range(n) for r in range(l + 1, n + 1)
                if sum(a[l:r]) >= s), default=0)

def stress(low, trials=500, seed=8):
    rng = random.Random(seed)
    for t in range(trials):
        a = [rng.randint(low, 9) for _ in range(rng.randint(1, 2 + t // 50))]
        s = rng.randint(1, 20)
        if shortest_at_least(a, s)[0] != shortest_brute(a, s):
            return f"반례 a={a}, S={s}"
    return f"무작위 {trials}개 비교: 모두 일치"

print("양수만:", stress(1))
print("음수도:", stress(-5))
big = [random.Random(9).randint(1, 100) for _ in range(100_000)]
print("n=100,000 왼쪽 이동:", shortest_at_least(big, 5_000)[1])
```
```text
양수만: 무작위 500개 비교: 모두 일치
음수도: 반례 a=[-4, 4], S=3
n=100,000 왼쪽 이동: 99917
```
`while`이 `for` 안에 있어 이중 반복문처럼 보이지만, l은 0에서 n까지 한 방향으로만 움직이므로 안쪽 반복은 **전체를 통틀어** n번 이하로 돈다. n = 100,000에서 왼쪽 이동이 99,917번인 것이 그 증거다. r의 이동 n번과 합쳐 2n번 이하, 곧 O(n)이다. 이렇게 반복 한 번의 비용이 아니라 전체 합으로 세는 것을 **분할 상환 분석**(amortized analysis)이라 한다.

음수가 섞이면 같은 코드가 `[-4, 4]`, S = 3에서 틀린다. 답은 `[4]` 하나짜리 구간인데, 전체 합이 0이라 l을 당길 기회가 오지 않는다. "왼쪽 원소를 빼면 합이 줄어든다"는 가정이 깨진 것이다. 이때는 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」의 누적 합을 기준으로 다시 생각해야 한다.

## 양 끝에서 좁혀 오기: 합이 X인 쌍
정렬된 배열에서 `a[i] + a[j] = X`(i < j)인 쌍의 수를 세자. i를 맨 앞, j를 맨 뒤에 두고, 합이 X보다 작으면 i를, 크면 j를 안쪽으로 옮긴다. 합이 작을 때 i를 버려도 되는 이유는, a[i]와 짝지을 수 있는 남은 원소가 모두 a[j] 이하라서 어떤 짝도 X에 못 미치기 때문이다. 큰 쪽도 마찬가지다. 같은 값이 여러 번 나오면 값 묶음의 크기를 곱해야 한다.
```python
import random

def count_pairs(a, x):                    # 정렬된 a에서 a[i] + a[j] == x인 i < j
    i, j, cnt = 0, len(a) - 1, 0
    while i < j:
        t = a[i] + a[j]
        if t < x:
            i += 1                        # a[i]는 남은 누구와도 x가 안 된다
        elif t > x:
            j -= 1                        # a[j]도 마찬가지
        elif a[i] == a[j]:                # 남은 구간이 모두 같은 값
            k = j - i + 1
            cnt += k * (k - 1) // 2
            break
        else:                             # 같은 값 묶음끼리 곱한다
            ci = cj = 1
            while a[i + ci] == a[i]:
                ci += 1
            while a[j - cj] == a[j]:
                cj += 1
            cnt += ci * cj
            i, j = i + ci, j - cj
    return cnt

rng = random.Random(10)
for _ in range(500):
    a = sorted(rng.randint(-4, 4) for _ in range(rng.randint(0, 10)))
    x = rng.randint(-5, 5)
    n = len(a)
    assert count_pairs(a, x) == sum(a[i] + a[j] == x for i in range(n)
                                    for j in range(i + 1, n))
print("무작위 500개 비교: 모두 일치")
print("1편 예제:", count_pairs(sorted([-1, 1, 0, 0, 1]), 0))
```
```text
무작위 500개 비교: 모두 일치
1편 예제: 3
```
1편의 "합이 0인 쌍의 개수"도 정렬 + 투 포인터로 O(N log N)에 풀린다. 해시 풀이보다 느리지만 일부러 만든 해시 충돌 입력에 흔들리지 않는다. 중복 처리를 빼먹는 것이 이 유형의 가장 흔한 실수인데, 값 범위를 −4~4로 좁힌 무작위 입력은 중복을 많이 만들어 그런 실수를 금방 드러낸다.

## 서로 다른 문자 k개 이하인 가장 긴 구간
조건이 "합"이 아니어도 단조성만 있으면 된다. "구간 안의 서로 다른 문자가 k개 이하"는 구간을 줄여도 계속 성립하고, 늘리면 깨질 수 있다. 그래서 r을 늘리다 조건이 깨지면 다시 성립할 때까지 l을 당긴다. 구간 안 문자별 개수는 `Counter`로 관리한다.
```python
import random
from collections import Counter

def longest_k_distinct(s, k):             # 서로 다른 문자 k개 이하인 최장 구간
    cnt, l, best = Counter(), 0, 0
    for r, ch in enumerate(s):
        cnt[ch] += 1
        while len(cnt) > k:               # 조건이 깨지면 왼쪽을 줄인다
            cnt[s[l]] -= 1
            if cnt[s[l]] == 0:
                del cnt[s[l]]
            l += 1
        best = max(best, r - l + 1)
    return best

def longest_brute(s, k):
    n = len(s)
    return max((r - l for l in range(n) for r in range(l, n + 1)
                if len(set(s[l:r])) <= k), default=0)

rng = random.Random(11)
for _ in range(500):
    s = "".join(rng.choice("abc") for _ in range(rng.randint(0, 12)))
    k = rng.randint(0, 3)
    assert longest_k_distinct(s, k) == longest_brute(s, k)
print("무작위 500개 비교: 모두 일치")
print(longest_k_distinct("abcbbbbcccbdddadacb", 2))
```
```text
무작위 500개 비교: 모두 일치
10
```
예시 문자열에서는 b와 c만 쓰는 `bcbbbbcccb`가 길이 10으로 가장 길다.

## 언제 쓸 수 있나
같은 방향 투 포인터의 조건을 정리하면 이렇다. 구간 `[l, r]`이 조건을 만족할 때 그 안의 구간도 모두 만족하거나(최장 구간 유형), 그것을 품은 구간도 모두 만족해야(최단 구간 유형) 한다. 그래야 "l은 뒤로 가지 않는다"가 성립한다. 판단이 어려우면 완전 탐색과 대조해 본다. 위의 음수 반례처럼 단조성이 깨지는 입력이 바로 나온다.

변형 유형도 같은 틀이다.
- 합이 정확히 S인 구간 개수: 양수면 투 포인터, 음수가 있으면 누적 합 + 해시(6편)
- 세 수의 합이 X: 하나를 고정하고 나머지 둘을 양 끝 투 포인터로 찾아 O(n²)
- 정렬된 두 배열의 병합, 두 배열에서 하나씩 골라 합 맞추기: 배열마다 포인터 하나씩

## 복잡도
| 문제 | 단순한 방법 | 투 포인터 |
|---|---|---|
| 합 ≥ S 최단 구간 | O(n²) | O(n) |
| 정렬 배열 쌍 세기 | O(n²) | O(n) |
| k개 이하 최장 구간 | O(n²) | O(n) |

- 두 포인터가 각각 한 방향으로 최대 n번 움직이므로 전체 이동이 2n번 이하다(분할 상환). 정렬이 필요하면 O(n log n)이 더해진다.
- 추가 공간은 O(1)이고, 문자 개수를 세는 경우만 서로 다른 문자 수만큼 더 든다.

## 어디에 쓰이나
- 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」: 그 글의 "이중 반복문은 Θ(n²)" 규칙에 대한 중요한 예외로, 안쪽 반복이 전체를 통틀어 n번만 도는 경우는 분할 상환으로 세어야 O(n)이 보인다.
- 8편 「분할 정복: 나누고 풀고 합치기」: 병합 정렬의 병합 단계는 정렬된 두 배열에 포인터를 하나씩 두고 작은 쪽을 앞으로 옮기는 투 포인터다.
- 데이터베이스의 정렬 병합 조인(sort-merge join): 두 테이블을 조인 키로 정렬한 뒤 포인터 두 개를 앞으로만 움직이며 키가 같은 행끼리 짝짓는다.

## 정리
- 투 포인터는 두 인덱스를 한 방향으로만 움직여 후보 구간을 O(n)에 훑는다. 같은 방향형과 양 끝형이 있다.
- 안쪽 while이 있어도 포인터의 총 이동이 2n번 이하라 O(n)이다(분할 상환).
- 쓸 수 있는 조건은 단조성이다. 양수 배열의 합은 되고, 음수가 섞이면 깨진다.
- 단조성이 의심스러우면 완전 탐색과 무작위로 대조해 반례를 찾는다.

## 더 알아보기
- 이전 글: 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」
- 다음 글: 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」
