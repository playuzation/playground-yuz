# [고급 자료 구조 1/12] 힙과 우선순위 큐: 가장 급한 것부터 꺼내기

> **한 줄 요약** — 힙은 완전 이진 트리를 배열에 담고 "부모 ≤ 자식" 하나만 지켜서 가장 작은 원소를 O(log n)에 넣고 꺼내게 해 주는 자료 구조이며, 상위 k개·이동 중앙값·사건 시뮬레이션이 모두 이 두 연산으로 풀린다.

## 이 글에서 다루는 것
- 우선순위 큐 문제와 리스트가 느린 이유
- 배열 위 이진 힙: 올리기(sift up)와 내리기(sift down)
- 한꺼번에 만드는 heapify가 O(n)인 이유
- heapq로 상위 k개와 이동 중앙값(힙 두 개) 구하기
- 사건 시뮬레이션: 시계 대신 사건으로 점프하기

## 문제: 가장 급한 일부터
응급실에는 환자가 계속 들어오고(넣기), 의사는 그때그때 가장 위급한 환자를 부른다(최솟값 꺼내기). 이 두 연산을 섞어 하는 자료 구조가 **우선순위 큐**(priority queue)다. 정렬 안 된 리스트는 꺼낼 때 전부 훑어야 하고, 정렬된 리스트는 넣을 때 뒤를 밀어야 해서 어느 쪽이든 한쪽 연산이 O(n), 연산 n번에 O(n²)이다. 힙은 "전부 정렬" 대신 "맨 앞만 정확히"를 지켜서 두 연산을 모두 O(log n)으로 만든다.

## 배열 위의 이진 힙
**이진 힙**(binary heap)은 완전 이진 트리(마지막 층만 빼고 꽉 차 있고 마지막 층은 왼쪽부터 채운 트리)라서 포인터 없이 층 순서대로 배열에 담는다. 0번부터 세면 i번 칸의 자식은 `2i + 1`, `2i + 2`, 부모는 `(i - 1) // 2`다. 지킬 불변식은 **힙 성질** 하나, 모든 부모가 자식보다 작거나 같다는 것이다. 그러면 루트 `a[0]`이 최솟값이다. 형제끼리는 순서가 없다.
```text
배열 [1, 3, 2, 7, 4, 5]

        1            a[0]
      /   \
     3     2         a[1] a[2]
    / \   /
   7   4 5           a[3] a[4] a[5]
```
- 넣기: 맨 끝에 붙이고 부모보다 작으면 바꾸며 올라간다. 성질이 깨질 수 있는 곳은 새 원소와 부모 사이뿐이라 많아야 높이 `⌊log₂ n⌋`번이다.
- 꺼내기: 루트를 꺼내고 맨 끝 원소를 루트로 옮긴 뒤, 작은 자식보다 크면 바꾸며 내려간다. 작은 자식과 바꿔야 새 부모가 다른 자식보다도 작다.

```python
import random

class MinHeap:
    def __init__(self, items=()):
        self.a, self.swaps = list(items), 0

    def push(self, x):
        a = self.a
        a.append(x)
        i = len(a) - 1
        while i > 0 and a[(i - 1) // 2] > a[i]:   # 부모보다 작으면
            p = (i - 1) // 2
            a[p], a[i] = a[i], a[p]               # 한 층 올라간다
            self.swaps += 1
            i = p

    def pop(self):
        a = self.a
        top, last = a[0], a.pop()
        if a:
            a[0] = last                    # 마지막 원소를 루트로
            self.sift_down(0)
        return top

    def sift_down(self, i):
        a, n = self.a, len(self.a)
        while 2 * i + 1 < n:
            c = 2 * i + 1
            if c + 1 < n and a[c + 1] < a[c]:
                c += 1                     # 더 작은 자식
            if a[i] <= a[c]:
                break
            a[i], a[c] = a[c], a[i]
            self.swaps += 1
            i = c

rng = random.Random(1)
for trial in range(500):
    h, plain = MinHeap(), []
    for _ in range(rng.randint(1, 60)):
        if plain and rng.random() < 0.4:
            m = min(plain)                 # 정의 그대로: 전부 훑기
            plain.remove(m)
            assert h.pop() == m
        else:
            x = rng.randint(-20, 20)
            h.push(x)
            plain.append(x)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
매번 `min`으로 전부 훑는 방법과 무작위 연산열 500개에서 결과가 같다. 높이가 약 `log₂ n`인 이유는 이산수학 9편 「트리: 계층 구조와 구문 트리」의 이진 트리 높이 계산 그대로다.

## heapify: 한꺼번에 만들면 O(n)
원소 n개가 이미 있다면 1964년 로버트 플로이드(Robert Floyd)가 쓴 방식이 낫다. 배열을 그대로 트리로 보고 잎이 아닌 마지막 칸 `n // 2 - 1`부터 루트까지 거꾸로 내리기를 한다. 앞 코드에 이어서 교환 횟수를 센다.
```python
def heapify(h):
    for i in range(len(h.a) // 2 - 1, -1, -1):
        h.sift_down(i)                     # 아래쪽 작은 힙부터 합친다

rng = random.Random(2)
for _ in range(500):
    xs = [rng.randint(0, 50) for _ in range(rng.randint(1, 40))]
    h = MinHeap(xs)
    heapify(h)
    assert [h.pop() for _ in xs] == sorted(xs)
print("heapify 후 꺼내기 500개: 정렬 결과와 일치")

print("n, push로 쌓기, heapify, heapify/n")
for n in [1_000, 10_000, 100_000]:
    data = list(range(n, 0, -1))           # 내림차순: 둘 다 최악
    h1 = MinHeap()
    for x in data:
        h1.push(x)
    h2 = MinHeap(data)
    heapify(h2)
    print(n, h1.swaps, h2.swaps, round(h2.swaps / n, 3))
```
```text
heapify 후 꺼내기 500개: 정렬 결과와 일치
n, push로 쌓기, heapify, heapify/n
1000 7987 992 0.992
10000 113631 9992 0.999
100000 1468946 99990 1.0
```
내림차순 입력에서 하나씩 넣으면 새 원소가 매번 루트까지 올라가 n = 10만에서 교환이 약 147만 번이지만, heapify는 원소당 1번을 넘지 않는다. 높이 h인 칸은 약 `n/2ʰ⁺¹`개이고 각자 많아야 h번 내려가기 때문이다.
```text
Σ h · n/2ʰ⁺¹
  = n · (1/4 + 2/8 + 3/16 + …)
  = n
```
heapify 뒤에 "루트를 꺼내 맨 끝에 두기"를 n번 하면 1964년 J. W. J. 윌리엄스(J. W. J. Williams)가 이진 힙과 함께 발표한 힙 정렬(heapsort)이다.

## heapq와 힙 두 개
파이썬 `heapq`는 같은 배열 최소 힙을 보통 리스트 위에서 다루는 함수 모음이다. 최대 힙은 부호를 뒤집어 넣고(3.14부터는 `heappush_max` 등도 있다), 원소끼리 비교하다 오류가 나지 않게 `(우선순위, 순번, 원소)` 튜플을 넣는다.
- 상위 k개: 크기 k 최소 힙의 루트가 "지금까지 k번째로 큰 값"이다. 새 값이 루트보다 크면 루트를 밀어낸다. 메모리가 O(k)라 스트림에도 쓴다.
- 이동 중앙값: 작은 절반을 최대 힙 `lo`에, 큰 절반을 최소 힙 `hi`에 둔다. "lo의 모든 값 ≤ hi의 모든 값"이고 lo가 hi와 같거나 1개 많으면 중앙값은 lo의 루트다.

```python
import heapq, random

class RunningMedian:
    def __init__(self):
        self.lo, self.hi = [], []          # lo는 부호를 뒤집은 최대 힙

    def add(self, x):
        if self.lo and x > -self.lo[0]:
            heapq.heappush(self.hi, x)
        else:
            heapq.heappush(self.lo, -x)
        if len(self.lo) > len(self.hi) + 1:      # 크기 차이를 맞춘다
            heapq.heappush(self.hi, -heapq.heappop(self.lo))
        elif len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))

    def median(self):                      # 짝수 개면 가운데 둘 중 작은 쪽
        return -self.lo[0]

def top_k(xs, k):
    h = []                                 # 크기 k 최소 힙
    for x in xs:
        if len(h) < k:
            heapq.heappush(h, x)
        elif x > h[0]:
            heapq.heapreplace(h, x)        # 루트를 밀어내고 x를 넣는다
    return sorted(h, reverse=True)

rng = random.Random(3)
for _ in range(500):
    xs = [rng.randint(-30, 30) for _ in range(rng.randint(1, 50))]
    m = RunningMedian()
    for i, x in enumerate(xs):
        m.add(x)
        assert m.median() == sorted(xs[:i + 1])[i // 2]
    k = rng.randint(1, len(xs))
    assert top_k(xs, k) == sorted(xs, reverse=True)[:k]
print("무작위 500개 비교(중앙값, 상위 k개): 모두 일치")
```
```text
무작위 500개 비교(중앙값, 상위 k개): 모두 일치
```

## 사건 시뮬레이션: 시계 대신 사건으로
창구 c개인 은행에 손님이 (도착 시각, 처리 시간)으로 오고 먼저 온 순서로 빈 창구에 간다. 총 대기 시간은? 시계를 1씩 돌리며 매 순간을 갱신해도 되지만, 상태가 바뀌는 것은 누가 도착하거나 일이 끝나는 순간뿐이다. 창구가 비는 시각들을 최소 힙에 넣으면 다음 손님은 루트(가장 먼저 비는 창구)로 가고, 빈 시간은 건너뛴다. 이것이 **이산 사건 시뮬레이션**(discrete-event simulation)의 뼈대다.
```python
import heapq, random
from collections import deque

def by_events(cs, c):                      # cs: (도착, 처리 시간), 도착순
    free, wait = [0] * c, 0                # 창구가 비는 시각들(최소 힙)
    for a, s in cs:
        start = max(a, heapq.heappop(free))   # 가장 먼저 비는 창구로
        wait += start - a
        heapq.heappush(free, start + s)
    return wait, len(cs)                   # (총 대기 시간, 반복 횟수)

def by_ticks(cs, c):                       # 시계를 1씩 돌리는 느린 방법
    busy, line, i, t, wait = [0] * c, deque(), 0, 0, 0
    while i < len(cs) or line or any(busy):
        while i < len(cs) and cs[i][0] == t:
            line.append(cs[i])
            i += 1
        for k in range(c):
            if busy[k] == 0 and line:
                a, s = line.popleft()
                wait, busy[k] = wait + t - a, s
        busy = [max(b - 1, 0) for b in busy]
        t += 1
    return wait, t

def make(n, span, longest):
    arr = sorted(rng.randint(0, span) for _ in range(n))
    return [(a, rng.randint(1, longest)) for a in arr]

rng = random.Random(4)
for _ in range(500):
    cs, c = make(rng.randint(1, 30), 60, 10), rng.randint(1, 3)
    assert by_events(cs, c)[0] == by_ticks(cs, c)[0]
print("무작위 500개 비교: 모두 일치")
cs = make(1000, 200_000, 400)              # 사건 사이가 듬성듬성하다
print("사건:", by_events(cs, 2), " 틱:", by_ticks(cs, 2))
```
```text
무작위 500개 비교: 모두 일치
사건: (49945, 1000)  틱: (49945, 199572)
```
답은 같지만 반복은 1,000번 대 약 20만 번이다. 틱 방식은 시간의 길이에, 사건 방식은 사건 수에 비례한다. 일반적인 시뮬레이터는 `(시각, 순번, 사건)`을 힙에 넣고 꺼낸 사건이 새 사건을 넣는다. 파이썬의 `sched` 모듈과 `asyncio` 이벤트 루프도 예약된 콜백을 `heapq`로 관리한다.

## 자주 하는 실수와 변형
- 내릴 때 아무 자식과 바꾸기: 반드시 작은 자식과 바꾼다.
- 힙 리스트를 정렬된 리스트로 착각하기: `h[0]`만 최솟값으로 보장되고 `h[1]`이 두 번째로 작다는 보장은 없다.
- 우선순위 바꾸기: heapq에는 없으니 새 항목을 넣고 낡은 항목은 꺼낼 때 건너뛴다.
- 변형 유형: 필요한 회의실 수(끝나는 시각 힙), k개 정렬 리스트 병합(`heapq.merge`), 마감 시간 있는 작업 고르기(알고리즘 기법 7편 「그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건」).

## 복잡도
| 연산 | 힙 | 정렬된 리스트 |
|---|---|---|
| 넣기 | O(log n) | O(n) |
| 최솟값 꺼내기 | O(log n) | O(1) |
| 최솟값 보기 | O(1) | O(1) |
| n개로 만들기 | O(n) | O(n log n) |

- 공간 O(n). 상위 k개 O(n log k), 이동 중앙값은 값마다 O(log n), 사건 시뮬레이션은 사건 m개에 O(m log m).

## 어디에 쓰이나
- 정보 이론 1편 「정보량과 엔트로피」: 허프만 부호는 확률이 가장 작은 두 묶음을 반복해 합치므로, 묶음을 최소 힙에 넣고 "두 번 꺼내 한 번 넣기"를 n − 1번 하면 O(n log n)에 만들어진다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 우선순위를 섞는 스케줄러가 다음 프로세스를 고르거나 가장 먼저 만료될 타이머를 찾는 일이 바로 "가장 급한 것 꺼내기"다.
- 그래프 알고리즘 2편 「다익스트라 알고리즘: 음수 없는 최단 경로」: 거리가 가장 짧은 미확정 정점을 고르는 단계가 최솟값 꺼내기이고, 힙 덕분에 O((V + E) log V)가 된다.

## 정리
- 힙은 완전 이진 트리를 배열에 담고 부모 ≤ 자식만 지키며, 넣기는 올리기, 꺼내기는 내리기로 O(log n)이다.
- 아래부터 내리기를 하는 heapify는 원소당 교환이 1번 남짓인 O(n)이다.
- 크기 k 힙으로 상위 k개를, 최대 힙과 최소 힙 한 쌍으로 이동 중앙값을 구한다.
- 사건 시각을 힙에 넣으면 시계를 1씩 돌리지 않고 다음 사건으로 바로 건너뛴다.

## 더 알아보기
- 다음 글: 2편 「유니온 파인드: 경로 압축과 랭크」

## 시리즈 안내
1. **힙과 우선순위 큐: 가장 급한 것부터 꺼내기** ← 지금 읽는 글
2. 유니온 파인드: 경로 압축과 랭크
3. 세그먼트 트리: 구간 질의와 점 갱신
4. 느리게 갱신되는 세그먼트 트리: 구간 갱신
5. 펜윅 트리: 비트 하나로 만드는 누적 합 트리
6. 희소 테이블: O(1) 구간 최솟값 질의
7. 트라이: 접두사 검색과 XOR 최댓값
8. 트립: 무작위로 균형을 잡는 이진 탐색 트리
9. 퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기
10. 최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기
11. 오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기
12. 센트로이드 분할: 트리를 반씩 쪼개는 분할 정복
