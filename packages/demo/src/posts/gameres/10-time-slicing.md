# [게임 자원 관리 10/14] 시간 분할: 무거운 일을 여러 프레임에 나누기

> **한 줄 요약** — 한 프레임에 몰아서 하면 스파이크가 되는 무거운 일을 제너레이터로 잘게 끊어 프레임마다 남는 예산만큼만 진행하면 최악 프레임이 예산 안에 묶이고, 그 대가인 완료 지연은 우선순위와 라운드 로빈으로 급한 곳에 먼저 나눠 준다.

## 이 글에서 다루는 것
- 제너레이터(코루틴)로 일을 멈췄다가 다음 프레임에 이어 가기
- 프레임당 작업 예산을 지키는 스케줄러와 결과가 같다는 확인
- 즉시 실행·FIFO·우선순위 정책의 스파이크와 대기 시간 비교
- AI 업데이트를 라운드 로빈과 2단계로 나누기

## 예제: 다리가 무너진 프레임
전략 게임에서 다리가 무너지면 유닛들이 쓰는 거리 지도를 다시 계산해야 한다. 칸 2만 개를 BFS(이산수학 10편)로 훑는 일이 평소 한 프레임 일의 20배라고 하자. 이 일을 무너진 프레임에 다 해 버리면 그 프레임만 0.3초 넘게 멈춘다. 1편에서 본 대로 플레이어가 느끼는 것은 평균이 아니라 이런 최악 프레임이다. 그런데 거리 지도가 이번 프레임에 꼭 완성될 필요는 없다. 몇 프레임 늦게 나와도 되는 일이라면 여러 프레임에 나눠서 하면 된다. 이것이 **시간 분할**(time slicing)이다. 이 글에서는 실제 시간 대신 "작업 단위"를 세어 재현 가능하게 모델링한다.

## 제너레이터로 멈췄다 이어 가기
일을 나누려면 "어디까지 했는지"를 저장했다가 다음 프레임에 이어 가야 한다. 큐와 방문 표시를 직접 구조체에 담아도 되지만, 파이썬 **제너레이터**(generator)를 쓰면 `yield`에서 지역 변수를 그대로 둔 채 멈추고 `next()`로 이어 간다. 유니티의 코루틴도 C# 반복자 위에 만든 같은 장치로, `yield return null`에서 멈췄다가 다음 프레임에 이어 간다. 아래 스케줄러는 예산이 남는 동안 여러 작업을 한 걸음씩 번갈아 진행한다.
```python
import random
from collections import deque

def flood(grid, start, out):
    """격자 BFS. 칸 하나를 꺼낼 때마다 작업 단위 1을 쓰고 멈춘다."""
    dist, q = {start: 0}, deque([start])
    while q:
        r, c = q.popleft()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if (0 <= nr < len(grid) and 0 <= nc < len(grid[0])
                    and grid[nr][nc] == "." and (nr, nc) not in dist):
                dist[nr, nc] = dist[r, c] + 1
                q.append((nr, nc))
        yield 1                       # 지역 변수를 그대로 둔 채 멈춘다
    out.update(dist)

def run_frame(tasks, budget):         # 예산이 남는 동안 번갈아 진행
    spent = 0
    while tasks and spent < budget:
        t = tasks.popleft()
        try:
            spent += next(t)
            tasks.append(t)
        except StopIteration:
            pass                      # 끝난 작업은 다시 넣지 않는다
    return spent

rng, ok = random.Random(10), 0
for _ in range(300):
    n = rng.randint(1, 12)
    grid = ["".join(rng.choice("..#") for _ in range(n)) for _ in range(n)]
    starts = [(rng.randrange(n), rng.randrange(n)) for _ in range(3)]
    sliced = [{} for _ in starts]
    tasks = deque(flood(grid, s, o) for s, o in zip(starts, sliced))
    budget = rng.randint(1, 20)
    while tasks:
        run_frame(tasks, budget)
    whole = []
    for s in starts:
        o = {}
        for _ in flood(grid, s, o):   # 한 번에 끝까지
            pass
        whole.append(o)
    ok += sliced == whole
print(f"무작위 300개 비교: {ok}개 일치")
```
```text
무작위 300개 비교: 300개 일치
```
작업 세 개를 예산 1~20으로 쪼개 번갈아 돌려도 한 번에 끝까지 돌린 결과와 같다. 제너레이터 안의 상태(큐, 거리)는 스케줄러가 건드리지 않고, 스케줄러는 "언제" 진행할지만 정하기 때문이다. 단, 이 보장은 작업이 읽는 세계가 그 사이에 바뀌지 않을 때만 성립한다(아래 실수 목록).

## 스파이크 비교 실험
3,000프레임 동안 매 프레임 고정 일(500~700단위)이 있고, 가끔 배경 작업(저장·지형 생성, 3,000~20,000단위)과 급한 작업(플레이어가 시킨 길 찾기, 100~400단위)이 들어온다. 프레임 예산은 1,000단위다. 세 정책을 비교한다. 들어오자마자 끝내는 **즉시**, 시간 분할하되 들어온 순서대로 하는 **FIFO**, 급한 작업을 먼저 하는 **우선순위**(힙)다. 작업은 50단위씩 끊으므로, 남은 예산이 50 미만이면 다음 프레임으로 넘긴다.
```python
import heapq, random

def job(size):                        # 무거운 일: 50단위씩 끊어 진행
    while size > 0:
        step = min(50, size)
        size -= step
        yield step

BUDGET = 1000                         # 프레임 예산(16.67ms에 해당)

def simulate(policy, frames=3000, seed=5):
    rng = random.Random(seed)
    heap, order, costs, wait = [], 0, [], {0: [], 1: []}
    for f in range(frames):
        base = rng.randint(500, 700)  # 입력·물리·렌더링 등 고정 일
        if rng.random() < 0.02:       # 배경 작업
            heap.append([1, order, f, job(rng.randint(3000, 20000))])
            order += 1
        if rng.random() < 0.05:       # 급한 작업
            heap.append([0, order, f, job(rng.randint(100, 400))])
            order += 1
        if policy == "우선순위":
            heapq.heapify(heap)
        else:
            heap.sort(key=lambda t: t[1])  # 들어온 순서
        spent = base
        while heap:
            if policy != "즉시" and spent + 50 > BUDGET:
                break                 # 남은 일은 다음 프레임에
            pri, _, born, g = heap[0]
            try:
                spent += next(g)
            except StopIteration:
                wait[pri].append(f - born)
                heap.pop(0) if policy != "우선순위" else heapq.heappop(heap)
        costs.append(spent)
    over = sum(c > BUDGET for c in costs)
    avg = [round(sum(w) / len(w), 1) for w in (wait[0], wait[1])]
    return max(costs), over, avg

print("정책 최대비용 초과 대기[급함,배경]")
for p in ("즉시", "FIFO", "우선순위"):
    print(p, *simulate(p))
```
```text
정책 최대비용 초과 대기[급함,배경]
즉시 20444 61 [0.0, 0.0]
FIFO 1000 0 [16.2, 42.9]
우선순위 1000 0 [0.2, 44.3]
```
즉시 실행은 대기가 0이지만 최악 프레임이 예산의 20배이고, 예산을 넘는 프레임이 61개다. 60fps로 50초 동안 61번, 1초에 한 번꼴로 멈칫하는 셈이다. 시간 분할은 모든 프레임을 1,000단위 안에 묶는 대신 완료가 늦어진다. FIFO에서는 길 찾기 같은 급한 작업이 큰 저장 작업 뒤에 줄을 서서 평균 16프레임(약 0.27초)을 기다리고, 우선순위를 주면 0.2프레임으로 거의 즉시 끝나며 배경 작업의 대기는 조금 늘 뿐이다. 총 일의 양은 같고, 누가 기다릴지를 고르는 것이 스케줄링이다.

## AI 업데이트 라운드 로빈
AI 1,000개가 한 번 생각하는 데 3단위씩 들면 매 프레임 전부 하는 데 3,000단위가 든다. AI에 600단위만 준다면 프레임마다 200개씩 돌아가며 생각하게 하는 **라운드 로빈**(round robin)이 기본이다. 더 나아가 플레이어 근처 100개는 매 프레임, 나머지는 남은 예산으로 돌아가게 하는 2단계를 비교한다. "지연"은 마지막으로 생각한 뒤 지난 프레임 수의 최댓값이다.
```python
import random
rng = random.Random(7)
N, THINK = 1000, 3                    # AI 1,000개, 생각 한 번에 3단위
near = set(rng.sample(range(N), 100)) # 플레이어 근처 100개
far = [i for i in range(N) if i not in near]

def run(policy, frames=60, ai_budget=600):
    last, worst, costs, nxt = [0] * N, {"근처": 0, "먼": 0}, [], 0
    for f in range(1, frames + 1):
        if policy == "전부":
            todo = range(N)
        elif policy == "라운드로빈":
            k = ai_budget // THINK
            todo = [(nxt + j) % N for j in range(k)]
            nxt = (nxt + k) % N
        else:                         # 근처는 매번, 남은 예산은 돌아가며
            k = (ai_budget - len(near) * THINK) // THINK
            todo = list(near) + [far[(nxt + j) % len(far)] for j in range(k)]
            nxt = (nxt + k) % len(far)
        for i in todo:
            last[i] = f
        costs.append(len(todo) * THINK)
        for i in range(N):
            g = "근처" if i in near else "먼"
            worst[g] = max(worst[g], f - last[i])
    return max(costs), worst

for p in ("전부", "라운드로빈", "2단계"):
    print(p, *run(p))
```
```text
전부 3000 {'근처': 0, '먼': 0}
라운드로빈 600 {'근처': 4, '먼': 4}
2단계 600 {'근처': 0, '먼': 8}
```
라운드 로빈은 비용을 5분의 1로 줄이는 대신 모든 AI가 최대 4프레임 묵은 판단을 한다. 2단계는 같은 비용으로 근처 AI의 지연을 0으로 만들고, 화면 밖 먼 AI가 8프레임(약 0.13초) 묵은 판단을 떠안는다. 멀리 있는 적이 0.1초 늦게 반응하는 것은 거의 눈에 띄지 않는다.

## 자주 하는 실수와 변형
- 나눠 하는 동안 세계가 바뀐다: 거리 지도를 계산하는 사이 또 다른 다리가 무너질 수 있다. 시작할 때 입력을 복사해 두거나, 버전 번호를 붙여 바뀌면 다시 시작한다. 유니티의 점진적 GC도 조각 사이에 참조가 바뀐 객체를 다시 훑는다.
- 한 걸음이 너무 크면 예산을 넘는다: 걸음 크기의 상한을 정하고 "남은 예산 ≥ 상한"일 때만 진행한다.
- 엄격한 우선순위는 배경 작업을 굶길 수 있다: 기다린 시간만큼 우선순위를 올리는 에이징(aging)이나, 배경 작업에 최소 예산을 떼어 두는 방법을 쓴다. 14편의 우선순위 누적도 같은 생각이다.
- 실제 엔진은 작업 단위 대신 경과 시간으로 예산을 재기도 하는데, 시간 측정 자체에도 비용이 들고 재현이 안 되므로 테스트는 단위 수로 하는 편이 낫다.

## 복잡도
| 항목 | 값 | 근거 |
|---|---|---|
| 총 작업량 | O(W) | 나눠도 일은 같다 |
| 프레임 비용 | 예산 이하 | 걸음 상한 확인 |
| 완료 지연 | W ÷ 남는 예산 | 프레임 수 |
| 라운드 로빈 지연 | ⌈N/k⌉ − 1 | k개씩 순환 |

- 스케줄러 오버헤드는 걸음마다 덱 연산 O(1), 우선순위 힙이면 O(log m)이다(m은 대기 작업 수). 공간은 작업마다 멈춘 제너레이터의 지역 상태(BFS라면 큐와 거리 표)만큼 든다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 운영체제의 시분할은 타이머 인터럽트로 CPU를 빼앗는 선점형 라운드 로빈이고, 제너레이터 스케줄러는 작업이 스스로 `yield`해야 넘어가는 협력형이다.
- 언어 기초 7편 「자바스크립트: 브라우저에서 npm까지」: 이벤트 루프는 지금 작업이 끝나야 다음 작업을 꺼내므로, 긴 작업은 잘게 나눠야 화면이 멈추지 않는다는 이 글의 문제와 같다.
- 게임 엔진: 유니티의 점진적 가비지 컬렉션은 GC 작업을 여러 프레임에 나눠 GC 스파이크를 줄이며, 전체 수집이 빨라지는 것은 아니라고 문서에 밝힌다.
- 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」: 시간 분할은 1편의 분할 상환을 스케줄러로 구현해, 평균이 아닌 최악 프레임을 예산 안에 묶는다.

## 정리
- 시간 분할은 총 일의 양을 줄이지 않고, 최악 프레임 비용을 예산 안에 묶는 대신 완료를 늦춘다.
- 제너레이터는 진행 상태를 지역 변수에 둔 채 멈췄다 이어 가므로, 세계가 그대로라면 나눠도 결과가 같다.
- 늦어지는 몫은 스케줄링으로 나눈다. 우선순위는 급한 작업의 대기를 16프레임에서 0.2프레임으로 줄였다.
- AI는 라운드 로빈으로 돌리고, 중요한 것(근처)만 매 프레임 갱신하면 같은 비용으로 체감 품질을 지킨다.

## 더 알아보기
- 이전 글: 9편 「컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기」
- 다음 글: 11편 「경로 탐색 아끼기: `A*`, 계층적 탐색, 플로우 필드」
- 유니티 매뉴얼 "Incremental garbage collection": https://docs.unity3d.com/Manual/performance-incremental-garbage-collection.html
