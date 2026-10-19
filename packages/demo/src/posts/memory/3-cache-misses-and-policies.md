# [메모리 시스템 3/10] 캐시 미스의 종류와 정책: 3C, 교체, 쓰기

> **한 줄 요약** — 미스는 처음 보는 줄(강제), 작은 용량(용량), 한 집합 쏠림(충돌)에서 생기고 무한 캐시·완전 연관 캐시와 비교해 나눠 셀 수 있으며, 교체는 LRU를 값싸게 흉내 낸 의사 LRU, 쓰기는 되돌림과 쓰기 할당이 표준이고, 계층 사이의 포함 관계가 실효 용량을 바꾼다.

## 이 글에서 다루는 것
- 3C 분류: 강제·용량·충돌 미스를 시뮬레이터로 나눠 세기, 충돌 미스가 음수가 되는 경우
- LRU, 트리 의사 LRU, 무작위 교체의 미스율과 상태 비트 수
- 쓰기 되돌림·즉시 쓰기와 쓰기 할당: 메모리 트래픽 세기
- 포함·배타·비포함 캐시 계층

## 미스를 줄이려면 먼저 원인을 나눈다
2편에서 웨이를 늘리자 미스가 100%에서 12.5%로 떨어졌지만, 웨이를 늘려도 용량을 늘려도 줄지 않는 미스도 있다. 처방이 원인마다 다르므로 먼저 원인을 나눈다. 마크 힐(Mark Hill)이 정리한 **3C** 분류가 표준이고, 힐과 스미스의 1989년 논문 「Evaluating Associativity in CPU Caches」가 이 틀로 연관도의 효과를 정량화했다.
- **강제 미스**(compulsory): 처음 보는 줄. 무한히 큰 캐시에서도 생긴다. 처방은 프리페치(4편)나 더 큰 줄.
- **용량 미스**(capacity): 같은 크기의 완전 연관 캐시에서도 생기는 나머지. 작업 집합이 캐시보다 크다. 처방은 용량이나 블로킹(4편).
- **충돌 미스**(conflict): 실제 캐시의 미스 중 완전 연관 캐시라면 피했을 것. 한 집합에 몰렸다. 처방은 웨이 증가나 배치 변경.

## 시뮬레이터로 3C 나눠 세기
교체 정책을 바꿔 끼울 수 있는 집합 연관 캐시를 만들고, 무한 캐시(서로 다른 줄 수)와 완전 연관 LRU 캐시를 함께 돌려 미스를 나눈다. 트레이스는 줄 번호 열이다.
```python
import random

class Cache:
    """줄 번호를 받는 집합 연관 캐시. policy: lru, plru, rand"""
    def __init__(self, lines, ways, policy="lru", seed=0):
        self.ways, self.nsets = ways, lines // ways
        self.tag = [[None] * ways for _ in range(self.nsets)]
        self.age = [[0] * ways for _ in range(self.nsets)]
        self.bit = [[0] * ways for _ in range(self.nsets)]  # 트리 w−1개
        self.policy, self.rng = policy, random.Random(seed)
        self.t = self.miss = 0

    def walk(self, s, w=None):
        """트리 PLRU: w가 있으면 갱신, 없으면 희생 웨이를 찾는다"""
        node, lo, hi = 0, 0, self.ways
        while hi - lo > 1:
            mid = (lo + hi) // 2
            right = w >= mid if w is not None else self.bit[s][node]
            if w is not None:
                self.bit[s][node] = int(not right)  # 반대쪽을 가리킴
            node, lo, hi = (2 * node + 2, mid, hi) if right else \
                           (2 * node + 1, lo, mid)
        return lo

    def access(self, x):
        s, t = x % self.nsets, x // self.nsets
        row = self.tag[s]
        if t in row:
            w = row.index(t)
        else:
            self.miss += 1
            if None in row:
                w = row.index(None)
            elif self.policy == "lru":
                w = self.age[s].index(min(self.age[s]))
            elif self.policy == "plru":
                w = self.walk(s)
            else:
                w = self.rng.randrange(self.ways)
            row[w] = t
        self.t += 1
        self.age[s][w] = self.t
        self.walk(s, w)

def three_c(trace, lines, ways):
    comp = len(set(trace))                # 무한 캐시의 미스
    fa, sa = Cache(lines, lines), Cache(lines, ways)
    for x in trace:
        fa.access(x)
        sa.access(x)
    return sa.miss, comp, fa.miss - comp, sa.miss - fa.miss

traces = {                                # 64줄(4KiB), 4웨이 = 집합 16개
    "256줄 한 번": list(range(256)),
    "128줄 4번": list(range(128)) * 4,
    "보폭 16줄 8개 8번": [16 * k for k in range(8)] * 8,
    "65줄 4번": list(range(65)) * 4,
}
for name, tr in traces.items():
    m, comp, cap, conf = three_c(tr, 64, 4)
    print(f"{name}: 미스 {m}")
    print(f"  강제 {comp}, 용량 {cap}, 충돌 {conf}")
print("공식 대조:", three_c(traces["128줄 4번"], 64, 4)[2] == 3 * 128,
      three_c(traces["65줄 4번"], 64, 4)[0] == 65 + 3 * 5)
```
```text
256줄 한 번: 미스 256
  강제 256, 용량 0, 충돌 0
128줄 4번: 미스 512
  강제 128, 용량 384, 충돌 0
보폭 16줄 8개 8번: 미스 64
  강제 8, 용량 0, 충돌 56
65줄 4번: 미스 80
  강제 65, 용량 195, 충돌 -180
공식 대조: True True
```
한 번 훑기는 전부 강제 미스다. 128줄을 네 번 돌면 64줄 LRU는 매번 다음에 쓸 줄을 쫓아내 처음 이후 3 × 128번이 모두 용량 미스다. 보폭 16줄(= 집합 수) 여덟 줄은 모두 0번 집합에 떨어져, 완전 연관이면 다 들어갈 것을 4웨이가 56번 놓친다. 전형적인 충돌 미스다.

마지막 줄이 3C 모델의 함정이다. 65줄 반복은 완전 연관 LRU에서는 늘 방금 쫓아낸 줄을 찾아 전부 미스지만, 4웨이 캐시에서는 0번 집합에 다섯 줄(0, 16, 32, 48, 64)만 몰리고 나머지 집합은 네 줄씩 딱 맞아 65 + 3 × 5 = 80번만 놓친다. "충돌"이 −180이 된다. 기준으로 삼은 완전 연관 LRU가 최선이 아니기 때문이다. 3C는 원인을 어림하는 도구이지 정확한 분해가 아니다.

## 교체 정책: LRU, 의사 LRU, 무작위
집합이 꽉 찼을 때 어느 웨이를 내보낼까. 가장 오래 안 쓴 것을 버리는 **LRU**는 8웨이에서 순서 8! = 40,320가지를 구분해야 해 집합마다 최소 16비트가 들고 접근마다 순위를 고쳐야 한다. **트리 의사 LRU**(tree pseudo-LRU)는 웨이를 이진 트리의 잎에 놓고 마디마다 비트 하나(8웨이면 7비트)를 두어, 접근할 때 경로의 비트가 반대쪽을 가리키게 하고 희생자는 비트를 따라 내려가 고른다. **무작위**는 상태가 없다. 실제 CPU가 어떤 변형을 쓰는지는 대개 공개되지 않지만, 하드웨어 비용 때문에 큰 연관도에서 정확한 LRU는 드물다. 앞 코드에 이어서, 64줄 8웨이 캐시로 비교한다.
```python
rng = random.Random(3)
tests = {                                 # 64줄, 8웨이 = 집합 8개
    "무작위 96줄": [rng.randrange(96) for _ in range(20000)],
    "72줄 반복": list(range(72)) * 200,
}
for name, tr in tests.items():
    row = []
    for pol in ("lru", "plru", "rand"):
        c = Cache(64, 8, pol, seed=1)
        for x in tr:
            c.access(x)
        row.append(f"{pol} {c.miss / len(tr):.1%}")
    print(f"{name}\n  " + ", ".join(row))

same = 0                                  # 2웨이에서는 PLRU = LRU
for _ in range(300):
    tr = [rng.randrange(40) for _ in range(300)]
    a, b = Cache(16, 2, "lru"), Cache(16, 2, "plru")
    for x in tr:
        a.access(x)
        b.access(x)
    same += a.miss == b.miss
print(f"2웨이 PLRU = LRU, 무작위 300개: {same}개 일치")
```
```text
무작위 96줄
  lru 32.7%, plru 33.2%, rand 33.3%
72줄 반복
  lru 100.0%, plru 99.6%, rand 22.8%
2웨이 PLRU = LRU, 무작위 300개: 300개 일치
```
무작위 접근에서는 정책이 거의 상관없다(캐시가 96줄 중 64줄을 담으니 이론값 1 − 64/96 ≈ 33%). 반복 순회가 캐시보다 조금 크면 LRU는 100% 미스로 무너지고 무작위가 오히려 22.8%로 이긴다. 2웨이 트리는 비트 하나가 정확히 "덜 최근 쪽"을 가리키므로 PLRU가 LRU와 같아야 하고, 무작위 300개로 확인된다. 미래를 아는 최적 정책(벨라디의 OPT)과 LFU·CLOCK 같은 소프트웨어 정책은 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」에서 다룬다. LRU의 이 약점을 피하려고 새 줄을 "곧 버릴 자리"에 넣었다가 다시 쓰일 때만 올려 주는 삽입 정책 같은 변형도 연구되어 왔다.

## 쓰기 정책: 되돌림과 할당
쓰기는 두 가지를 정해야 한다. 적중했을 때 메모리에도 바로 쓰는 **즉시 쓰기**(write-through)냐, 캐시에만 쓰고 더티 비트를 세웠다가 쫓겨날 때 줄째 쓰는 **쓰기 되돌림**(write-back)이냐. 그리고 미스였을 때 줄을 가져와 캐시에 쓰는 **쓰기 할당**(write-allocate)이냐, 캐시를 건너뛰고 메모리에 쓰는 **쓰기 비할당**이냐. 앞 코드에 이어서, 8바이트 쓰기만 하는 두 작업의 메모리 트래픽을 32KiB 캐시로 센다.
```python
from collections import OrderedDict

def traffic(ops, lines, wb, alloc):
    """ops: 8바이트 쓰기의 줄 번호 열. 메모리로 읽고 쓴 바이트"""
    c, rd, wr = OrderedDict(), 0, 0          # 값: 더티 여부
    for x in ops:
        if x not in c:
            if not alloc:
                wr += 8                      # 캐시를 거치지 않고 씀
                continue
            rd += 64                         # 쓰기 미스도 줄을 먼저 읽음
            c[x] = False
            if len(c) > lines:
                wr += 64 * c.popitem(last=False)[1]
        c.move_to_end(x)
        if wb:
            c[x] = True
        else:
            wr += 8                          # 즉시 쓰기
    return rd, wr + 64 * sum(c.values())     # 끝에 더티 줄 비우기

init = [k // 8 for k in range(8192)]         # 64KiB 배열 초기화
count = [k % 128 // 8 for k in range(12800)] # 1KiB 카운터를 100번
for name, ops in (("64KiB 초기화", init), ("1KiB 100번", count)):
    print(name)
    for wb, alloc in ((True, True), (False, False)):
        rd, wr = traffic(ops, 512, wb, alloc)
        kind = "되돌림+할당" if wb else "즉시+비할당"
        print(f"  {kind}: 읽기 {rd // 1024}KiB, 쓰기 {wr // 1024}KiB")
print("공식 대조:", traffic(init, 512, True, True) == (65536, 65536),
      traffic(count, 512, False, False) == (0, 12800 * 8))
```
```text
64KiB 초기화
  되돌림+할당: 읽기 64KiB, 쓰기 64KiB
  즉시+비할당: 읽기 0KiB, 쓰기 64KiB
1KiB 100번
  되돌림+할당: 읽기 1KiB, 쓰기 1KiB
  즉시+비할당: 읽기 0KiB, 쓰기 100KiB
공식 대조: True True
```
같은 자리를 여러 번 고치는 카운터에서는 쓰기 되돌림이 트래픽을 100분의 1로 줄인다. 오늘날 CPU 캐시가 대부분 되돌림 + 할당인 이유다. 대신 한 번 쓰고 다시 안 읽는 대량 초기화에서는 덮어쓸 줄을 먼저 읽어 와 트래픽이 두 배다. x86의 비시간적 저장(`movnti`, `_mm_stream_si128` 같은 non-temporal store)은 캐시를 건너뛰고 쓰기 결합 버퍼로 줄을 모아 내보내 이 읽기를 피한다. 여러 코어가 같은 줄을 쓸 때의 일관성 처리는 CPU 마이크로아키텍처 9편 「캐시 일관성: MESI 프로토콜과 거짓 공유」에서 다룬다.

## 포함, 배타, 비포함
L1·L2·L3가 같은 줄을 어떻게 나눠 갖는지도 정책이다.
- **포함**(inclusive): L3가 위층의 모든 줄을 갖는다. L3만 보면 칩 안에 어느 줄이 있는지 알 수 있지만, L3에서 내보낸 줄은 위층 사본도 지워야 하고(역무효화) 실효 용량은 L3 크기뿐이다.
- **배타**(exclusive): 줄이 한 층에만 있다. L3는 L2에서 쫓겨난 줄을 받는 **희생 캐시**(victim cache)가 되고 실효 용량은 L2 + L3다.
- **비포함**(non-inclusive): 어느 쪽도 보장하지 않는다. 대신 위층에 무엇이 있는지 따로 추적하는 스누프 필터가 필요하다.

인텔 제온은 스카이레이크-SP부터 L2를 키우면서 L3를 포함에서 비포함으로 바꿨고, AMD 젠의 L3는 L2의 희생 캐시로 "대부분 배타적"이다. 젠 4 CCD라면 L2 1MiB × 8코어와 L3 32MiB가 겹치지 않아 최대 40MiB를 따로 담는다.

## 코드에 주는 의미
- 용량 미스가 많으면 작업 집합을 줄이고(블로킹), 충돌 미스가 많으면 배치를 바꾼다(2편의 덧대기). 원인을 모르고 고치면 효과가 없다.
- 캐시보다 조금 큰 배열을 반복 순회하면 LRU 계열 캐시에서 거의 모든 접근이 미스다. 데이터를 쪼개 캐시 안에서 여러 번 쓰는 편이 낫다.

## 숫자로 보기
| 항목 | 값 | 비고 |
|---|---|---|
| LRU 상태(8웨이) | 집합당 16비트 이상 | ⌈log₂ 8!⌉ |
| 트리 PLRU(8웨이) | 집합당 7비트 | 마디 w − 1개 |
| 제온 SP L3 | 코어당 1.375MB, 11웨이 | 비포함 |
| AMD 젠 L3 | L2의 희생 캐시 | 대부분 배타 |

- 제온 SP는 스카이레이크-SP·캐스케이드 레이크 세대를 말한다. 그 전 세대 제온의 L3는 코어당 2.5MB 20웨이 포함 캐시였다.

## 어디에 쓰이나
- 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」: 같은 교체 문제를 소프트웨어에서 푸는 글이고, 이 글의 72줄 반복이 그 글의 "순차 반복에서 LRU 0% 적중"과 같은 현상이다.
- 추상 데이터 타입 심화 21편 「LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기」: 쓰기를 모아 한꺼번에 내려보내는 생각이 쓰기 되돌림 캐시와 같다.

## 정리
- 미스는 무한 캐시·완전 연관 LRU 캐시와 비교해 강제·용량·충돌로 나눈다. 충돌 미스는 음수도 될 수 있는 어림이다.
- 8웨이 정확한 LRU는 집합당 16비트 이상이 들어 트리 PLRU(7비트) 같은 근사를 쓰고, 2웨이에서는 둘이 같다.
- 캐시보다 조금 큰 반복 순회에서 LRU는 100% 미스, 무작위 교체는 22.8%였다.
- 되돌림 + 할당은 반복 쓰기의 트래픽을 1/100로 줄였지만, 한 번만 쓰는 출력에는 읽기가 덧붙는다.

## 더 알아보기
- 이전 글: 2편 「SRAM과 캐시의 구조: 6T 셀, 태그·인덱스·오프셋」
- 다음 글: 4편 「캐시를 아는 코드: 접근 순서, 블로킹, 프리페치」
- Cache performance measurement and metric(위키백과 영어판, 3C 설명): https://en.wikipedia.org/wiki/Cache_performance_measurement_and_metric
