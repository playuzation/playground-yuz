# [알고리즘 기법 10/14] 좌표 압축과 스위핑: 정렬해 놓고 한 방향으로 쓸기

> **한 줄 요약** — 좌표가 10⁹까지 흩어져 있어도 답이 바뀌는 곳은 입력에 나온 점들뿐이므로, 그 점들만 정렬해 순위로 바꾸고(좌표 압축) 왼쪽에서 오른쪽으로 사건을 차례로 처리하면(스위핑) 구간 합집합·최대 겹침 같은 문제가 정렬 비용 O(n log n)으로 풀린다.

## 이 글에서 다루는 것
- 좌표 압축: 큰 값을 0~k − 1 순위로
- 선분 합집합 길이: 시작점 순으로 쓸기
- 겹치는 구간의 최대 개수: 이벤트 정렬과 같은 좌표의 처리 순서
- 직사각형 합집합 넓이로 가는 길
- 정렬의 비교 하한 Ω(n log n)과 계수 정렬

## 예제 문제: 회의실 예약 기록
회의실 예약 n = 10⁵건이 [시작, 끝) 시각(0~10⁹초)으로 주어진다. ① 회의실이 한 번이라도 쓰인 총 시간과 ② 동시에 열린 회의가 가장 많았던 순간의 회의 수를 구하자. 단순한 방법은 시각마다 칸을 두고 칠하는 것인데, 10⁹칸은 칸당 4바이트만 잡아도 4GB라 메모리에 올릴 수 없다. 예약끼리 모두 비교하면 O(n²)이다. 관찰할 점은 답이 바뀌는 곳이 어떤 예약의 시작이나 끝뿐이라는 것이다. 의미 있는 좌표는 많아야 2n개다.

## 좌표 압축
**좌표 압축**(coordinate compression)은 나온 값들을 정렬해 0부터 순위를 매기고 원래 값을 순위로 바꾼다.
```python
from bisect import bisect_left

a = [10**9, -5, 42, 42, 7]
xs = sorted(set(a))                       # 서로 다른 값을 정렬
rank = {x: i for i, x in enumerate(xs)}
print([rank[x] for x in a])
print([bisect_left(xs, x) for x in a])    # 딕셔너리 대신 이분 탐색
```
```text
[3, 0, 2, 2, 1]
[3, 0, 2, 2, 1]
```
압축은 순서만 남기고 거리는 버린다. x < y이면 순위도 작으므로, 비교만 쓰는 계산은 압축 전후로 답이 같다. 길이가 필요하면 순위 차가 아니라 `xs[i + 1] − xs[i]`로 원래 좌표를 되찾는다. 6편의 차분 배열이나 고급 자료 구조 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」처럼 값을 배열 인덱스로 써야 하는 기법을 큰 값에 쓸 때 이 단계가 먼저 온다. 질의할 좌표도 미리 함께 넣어 압축해야 한다는 점에서 오프라인 기법이다.

## 스위핑: 합집합 길이와 최대 겹침
**스위핑**(sweeping)은 세로선 하나를 왼쪽에서 오른쪽으로 옮기며 선이 어떤 점을 지날 때(**사건**, event)만 상태를 고친다. 사건 사이에서는 아무것도 바뀌지 않으므로 사건만 정렬해 차례로 보면 된다.
- 합집합 길이: 구간을 시작점 순으로 보며 지금 덩어리 `[cur_l, cur_r)`를 유지한다. 다음 시작점이 `cur_r`보다 오른쪽이면 덩어리가 끊긴 것이니 길이를 확정하고, 아니면 오른쪽 끝만 늘린다. "처리한 구간들의 합집합 = 확정한 덩어리들 + 지금 덩어리"가 불변식이다. 1977년 클리(Klee)가 이 1차원 문제를 던지고 정렬 기반 O(n log n) 풀이를 보였다.
- 최대 겹침: 시작에서 +1, 끝에서 −1인 사건을 정렬하고 차례로 더한다. 누적값이 그 순간 열린 회의 수다. 6편의 차분 배열을 압축 좌표 위에서 누적하는 것과 같다.
```python
import random

def union_length(segs):                   # 반열린 구간 [l, r)들
    total, cur_l, cur_r = 0, None, None
    for l, r in sorted(segs):             # 시작점 순으로 쓸어 간다
        if cur_r is None or l > cur_r:    # 끊겼다: 지금까지 덩어리를 확정
            if cur_r is not None:
                total += cur_r - cur_l
            cur_l, cur_r = l, r
        else:
            cur_r = max(cur_r, r)         # 이어진다: 오른쪽 끝만 늘린다
    if cur_r is not None:
        total += cur_r - cur_l
    return total

def max_overlap(segs):
    events = [(l, +1) for l, r in segs] + [(r, -1) for l, r in segs]
    best = cur = 0
    for x, d in sorted(events):           # 같은 x에서는 -1(끝)이 먼저
        cur += d
        best = max(best, cur)
    return best

def brute(segs):
    cover = [0] * 40
    for l, r in segs:
        for x in range(l, r):
            cover[x] += 1
    return sum(c > 0 for c in cover), max(cover)

rng = random.Random(10)
for _ in range(500):
    segs = []
    for _ in range(rng.randint(1, 8)):
        l = rng.randint(0, 30)
        segs.append((l, l + rng.randint(1, 8)))
    assert (union_length(segs), max_overlap(segs)) == brute(segs)
print("무작위 500개 비교: 모두 일치")
meet = [(9, 12), (10, 11), (12, 15), (20, 22)]
print(union_length(meet), max_overlap(meet))
```
```text
무작위 500개 비교: 모두 일치
8 2
```
대조용 `brute`는 좌표를 0~39로 좁혀 칸을 직접 칠한다. 스위핑 쪽은 좌표 크기와 무관하게 정렬만 하므로 10⁹에서도 그대로 돈다. 같은 시각의 처리 순서가 함정이다. 반열린 구간에서 [9, 12)와 [12, 15)는 겹치지 않으므로 끝(−1)을 먼저 처리해야 하고, 튜플 정렬에서 `(12, -1) < (12, 1)`이라 저절로 그렇게 된다. 정렬 키를 바꿔 시작을 먼저 처리하게 하면 대조 검사가 AssertionError로 멈춘다. 닫힌 정수 구간 [l, r]은 [l, r + 1)로 바꿔 두면 규칙이 하나로 통일된다.

## 직사각형 합집합 넓이로
축에 평행한 직사각형 n개의 합집합 넓이는 x축으로 쓸며 "지금 세로선이 덮는 y 길이 × 다음 사건까지의 폭"을 더하면 된다. 세로선이 덮는 y 길이를 사건마다 위의 `union_length`로 새로 구하면 O(n² log n)이다. 1977년 벤틀리(Bentley)는 압축한 y좌표 위에 구간별 덮인 횟수를 담는 트리, 지금 말하는 세그먼트 트리를 두어 사건당 O(log n), 전체 O(n log n)으로 풀었다. 그 자료 구조는 고급 자료 구조 3편 「세그먼트 트리: 구간 질의와 점 갱신」에서 다룬다.

## 정렬의 비교 하한과 계수 정렬
스위핑 비용의 대부분은 정렬이다. 원소끼리 비교만 하는 정렬은 n! 가지 입력 순서를 모두 구별해야 하는데, 비교 한 번은 예·아니오 두 갈래뿐이다.
```text
비교 k번 → 갈래는 많아야 2ᵏ개
n! 가지 순서를 구별: 2ᵏ ≥ n!
k ≥ log₂(n!) ≈ n·log₂n − 1.44n
```
그래서 비교 정렬은 최악의 경우 Ω(n log n)번 비교한다. 파이썬 `sorted`의 실제 비교 횟수를 세어 이 하한과 견주고, 값의 범위가 작을 때 비교 없이 개수만 세는 **계수 정렬**(counting sort, 1954년 시워드(Seward))도 확인하자.
```python
import math, random

class Key:                                # 비교 횟수를 세는 래퍼
    count = 0
    def __init__(self, v): self.v = v
    def __lt__(self, other):
        Key.count += 1
        return self.v < other.v

def counting_sort(a, k):                  # 값이 0..k-1인 정수만
    cnt = [0] * k
    for x in a:
        cnt[x] += 1
    return [v for v in range(k) for _ in range(cnt[v])]

rng = random.Random(10)
for n in [10, 1000, 100000]:
    a = list(range(n)); rng.shuffle(a)
    Key.count = 0
    sorted(map(Key, a))
    bound = math.lgamma(n + 1) / math.log(2)      # log₂(n!)
    print(f"n={n}: sorted 비교 {Key.count}번, 하한 {math.ceil(bound)}번")
for _ in range(300):
    a = [rng.randrange(50) for _ in range(rng.randint(0, 30))]
    assert counting_sort(a, 50) == sorted(a)
print("계수 정렬 무작위 300개 비교: 모두 일치")
```
```text
n=10: sorted 비교 22번, 하한 22번
n=1000: sorted 비교 8661번, 하한 8530번
n=100000: sorted 비교 1528978번, 하한 1516705번
계수 정렬 무작위 300개 비교: 모두 일치
```
무작위 순열에서 파이썬 정렬은 하한보다 1% 남짓 더 비교할 뿐이다. 계수 정렬은 값을 인덱스로 쓰므로 비교 모델 밖에 있고, 값의 범위가 K일 때 O(n + K)이다. K가 n보다 훨씬 크면 오히려 손해라서, 그때는 좌표 압축 후 쓰거나 자릿수별로 나누는 기수 정렬로 넓힌다.

## 자주 하는 실수와 변형
- 닫힌 구간과 반열린 구간을 섞는다. 길이 계산(r − l과 r − l + 1)과 같은 좌표의 사건 순서가 함께 바뀐다.
- 압축한 순위의 차를 길이로 쓴다. 길이는 언제나 원래 좌표로 계산한다.
- 변형: 2차원 점 개수 질의(한 축으로 쓸고 다른 축은 펜윅 트리), 회의마다 방 번호까지 배정하기(시작 순으로 쓸며 가장 빨리 비는 방을 힙으로 고른다. 필요한 방 수는 최대 겹침과 같다), 각도로 정렬해 도는 회전 스위핑.

## 복잡도
| 작업 | 단순한 방법 | 정렬 + 스위핑 |
|---|---|---|
| 합집합 길이 | 좌표 범위만큼 칠하기 | O(n log n) |
| 최대 겹침 | 좌표 범위 또는 O(n²) | O(n log n) |
| 직사각형 넓이 | O(n² log n) | O(n log n) |
| 값 범위 K 정렬 | O(n log n) 비교 | O(n + K) |
- 정렬 뒤의 쓸기 자체는 O(n)이고, 공간은 사건 목록과 압축 배열 O(n)이다.

## 어디에 쓰이나
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: 좌표 압축은 그 글의 전순서를 그대로 보존하는 일대일 대응이라, 비교만 쓰는 알고리즘은 압축 전후로 같은 답을 낸다.
- 게임 자원 관리 7편 「공간 분할 1: 균일 격자와 공간 해싱」: 물리 엔진의 넓은 단계(broad phase)에서 격자와 함께 쓰이는 sweep and prune은 경계 상자의 양 끝을 축 위에 정렬해 쓸며 겹치는 쌍만 고르는 이 글의 사건 스위핑이다(Bullet 물리 엔진의 btAxisSweep3).
- 고급 자료 구조 3편 「세그먼트 트리: 구간 질의와 점 갱신」: 직사각형 합집합 넓이는 압축한 y좌표 위의 세그먼트 트리와 x축 스위핑을 합쳐 푼다.

## 정리
- 답이 바뀌는 좌표는 입력에 나온 점뿐이므로 정렬해 순위로 바꾸면 10⁹ 범위도 배열로 다룰 수 있다.
- 스위핑은 사건을 정렬해 한 방향으로 처리하며, 같은 좌표에서의 처리 순서를 구간 정의에 맞게 정해야 한다.
- 2차원 문제는 한 축을 쓸고 다른 축을 자료 구조로 관리한다.
- 비교 정렬은 log₂(n!) ≈ n log n번 비교가 하한이고, 값 범위가 작으면 계수 정렬이 그 하한을 비켜 간다.

## 더 알아보기
- 이전 글: 9편 「단조 스택: 가장 가까운 큰 수와 히스토그램」
- 다음 글: 11편 「비트마스킹: 정수 하나로 집합 다루기」
- [Klee's measure problem (Wikipedia)](https://en.wikipedia.org/wiki/Klee%27s_measure_problem)
