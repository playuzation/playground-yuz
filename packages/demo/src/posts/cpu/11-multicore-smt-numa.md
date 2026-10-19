# [CPU 마이크로아키텍처 11/12] 멀티코어와 SMT: 하이퍼스레딩, 코어 연결망, NUMA

> **한 줄 요약** — 스레드 하나는 넓은 코어의 발행 슬롯을 다 채우지 못하므로 SMT는 하드웨어 스레드 여럿이 슬롯을 나눠 써 코어 처리량을 올리고(스레드 하나는 느려진다), 코어가 늘면 연결망이 링에서 메시·칩렛으로 바뀌며, 소켓이 여럿이면 가까운 메모리와 먼 메모리가 갈리는 NUMA가 되어 스레드 고정과 first-touch 배치가 성능을 정한다.

## 이 글에서 다루는 것
- SMT(하이퍼스레딩): 빈 발행 슬롯을 다른 스레드로 채우기, 슬롯 모델을 정확한 기댓값과 대조
- 코어 연결망: 링, 메시, 칩렛
- NUMA: 로컬·원격 메모리, first-touch 정책과 스레드 배치를 모델로 세기
- 운영체제와 코드가 할 일: 스레드 고정, 병렬 초기화, 인터리브

## 빈 슬롯을 채우는 SMT
7편의 코어는 사이클마다 μop 4개 이상을 시작할 수 있지만, 실제 프로그램은 의존 사슬 때문에 한 사이클에 몇 칸만 쓰고(수평 낭비), 캐시 미스를 기다리는 동안은 한 칸도 못 쓴다(수직 낭비). 툴슨·에거스·레비는 1995년 ISCA 논문 「Simultaneous Multithreading」에서 서로 독립인 여러 스레드가 같은 사이클에 같은 실행 유닛들로 명령을 내게 하자고 제안했다. 이것이 **동시 멀티스레딩**(SMT)이다.
```text
cycle  A alone    A + B (SMT)
  1    A A . .    A A B B
  2    . . . .    B B B .
  3    A . . .    A B B B
  4    . . . .    . . . .
```
SMT 코어는 스레드마다 PC, 아키텍처 레지스터의 이름 바꾸기 표, 반환 주소 스택 같은 "상태"만 따로 두고, 실행 유닛·캐시·분기 예측기·ROB는 나눠 쓴다. 그래서 운영체제에는 논리 CPU 두 개로 보이지만 추가 면적은 작다. 인텔은 2002년 Xeon에서 **하이퍼스레딩**(Hyper-Threading)이라는 이름으로 코어당 2스레드를 넣었고, AMD는 Zen(2017)부터 SMT를 쓴다.

사이클마다 각 스레드가 확률 r(코드의 `ready`)로 명령 1~4개를 내고 4칸의 슬롯을 나눠 쓰는 모델로 효과를 세어 본다. 시뮬레이션한 코어 IPC를 모든 경우를 나열해 구한 정확한 기댓값과 나란히 찍고, 스레드 하나의 IPC("각")도 보인다.
```python
import random
from itertools import product

W, OFFER = 4, [1, 2, 3, 4]        # 발행 폭, 준비됐을 때 낼 수 있는 명령 수

def smt(nthreads, ready, cycles=200_000, seed=11):
    """사이클마다 각 스레드는 확률 ready로 명령 1~4개를 내고, 슬롯 W개를
    나눠 쓴다(우선순위는 사이클마다 돌아간다)."""
    rng, done = random.Random(seed), [0] * nthreads
    for c in range(cycles):
        slots = W
        for k in range(nthreads):
            t = (c + k) % nthreads
            want = rng.choice(OFFER) if rng.random() < ready else 0
            got = min(want, slots)
            done[t], slots = done[t] + got, slots - got
    return [d / cycles for d in done]

def exact(nthreads, ready):       # 모든 경우를 나열한 기댓값
    dist = [(0, 1 - ready)] + [(a, ready / len(OFFER)) for a in OFFER]
    total = 0.0
    for combo in product(dist, repeat=nthreads):
        p = 1.0
        for _, q in combo:
            p *= q
        total += p * min(W, sum(a for a, _ in combo))
    return total

for n, ready in ((1, 0.6), (2, 0.6), (2, 0.45)):
    ipc = smt(n, ready)
    print(f"{n}스레드 r={ready}: 코어 {sum(ipc):.3f}/정확"
          f" {exact(n, ready):.3f}, 각 {ipc[0]:.2f}")
```
```text
1스레드 r=0.6: 코어 1.501/정확 1.500, 각 1.50
2스레드 r=0.6: 코어 2.553/정확 2.550, 각 1.28
2스레드 r=0.45: 코어 1.999/정확 1.997, 각 1.00
```

시뮬레이션이 정확한 기댓값과 소수 둘째 자리까지 맞는다. 혼자서는 4칸 중 1.5칸을 쓰던 코어가 스레드 둘로 2.55칸을 쓴다. 코어 처리량은 1.7배지만 스레드 하나는 1.50에서 1.28로 느려진다. 실제로는 두 스레드가 캐시를 나눠 써서 서로의 미스를 늘린다. 그 효과를 r = 0.45로 흉내 내면 코어 이득은 1.33배로 줄고 스레드 하나는 3분의 1이 느려진다. SMT는 "처리량을 위해 지연을 내주는" 장치이고, 지연이 중요한 스레드나 캐시를 꽉 채우는 작업에서는 끄는 편이 나을 때도 있다. 자원을 나눠 쓰는 만큼 부채널 위험도 있어, 신뢰 영역이 다른 스레드를 한 코어에 같이 두지 않도록 스케줄링하기도 한다.

## 코어 연결망: 링, 메시, 칩렛
코어끼리, 그리고 L3 조각·메모리 컨트롤러·I/O 사이를 잇는 망이 9편의 일관성 메시지를 나른다. 코어가 몇 개일 때는 **링**(ring)이 단순하다. 정류장마다 코어와 L3 조각이 붙고 메시지가 한 방향이나 양방향으로 돈다. 그러나 정류장 수에 비례해 홉이 늘어 지연과 대역폭이 나빠진다. 인텔은 Xeon에 링을 쓰다가 Skylake-SP(Xeon Scalable, 2017)에서 2차원 **메시**(mesh)로 바꿨다. 인텔의 기술 개요는 코어 수와 메모리·I/O 대역폭이 늘면서 링이 성능을 제한할 수 있게 되었다고 그 이유를 밝혔다.

AMD는 다이를 쪼갰다. EPYC Rome(Zen 2, 2019)은 7nm 코어 다이(CCD, 8코어) 8개를 14nm I/O 다이 하나에 Infinity Fabric으로 연결해 64코어를 만들었다. I/O 회로는 미세 공정으로 줄여도 별로 작아지지 않아서 옛 공정에 남기고, 작은 다이를 여러 개 쓰면 수율도 좋아진다.
```text
┌─────┐ ┌─────┐   ┌─────┐ ┌─────┐
│ CCD │ │ CCD │   │ CCD │ │ CCD │
└──┬──┘ └──┬──┘   └──┬──┘ └──┬──┘
┌──┴───────┴─────────┴───────┴──┐
│ I/O die: DDR4 x8, PCIe 4.0    │
└──┬───────┬─────────┬───────┬──┘
┌──┴──┐ ┌──┴──┐   ┌──┴──┐ ┌──┴──┐
│ CCD │ │ CCD │   │ CCD │ │ CCD │
└─────┘ └─────┘   └─────┘ └─────┘
```
대가는 거리의 차이다. Rome에서는 코어 4개 묶음(CCX)이 L3 하나를 공유하고, 다른 묶음의 코어와 라인을 주고받으려면 I/O 다이를 거친다(Zen 3부터는 CCD의 8코어가 L3 하나를 공유한다). 한 소켓 안에서도 "어느 코어와 어느 코어가 가까운가"가 생긴 것이다.

## NUMA: 메모리에도 거리가 있다
소켓이 둘인 서버는 소켓마다 메모리 컨트롤러와 DIMM이 따로 있다. 다른 소켓에 붙은 메모리는 소켓 사이 링크를 건너야 해서 더 느리고 대역폭도 적다. 이렇게 접근 지연이 위치에 따라 다른 구조가 **NUMA**(non-uniform memory access)다. 운영체제는 소켓(또는 그 안의 구역)을 **노드**로 보이고, `numactl --hardware`는 노드 사이 거리를 로컬을 10으로 둔 상대값(ACPI SLIT)으로 보여 준다.

리눅스의 기본 정책은 페이지를 **처음 건드린 CPU의 노드**에 할당하는 것이다(first-touch). 그래서 누가 초기화했는지가 끝까지 남는다. 두 노드에 스레드 8개를 고루 고정하고, 페이지 4,096개를 나눠 쓰는 경우를 세어 본다. 지연값은 설명용 가정이다.
```python
LOCAL, REMOTE = 80, 140           # ns, 설명용 가정값
PAGES, THREADS = 4096, 8          # 페이지 4,096개를 스레드 8개가 나눠 쓴다

def numa(place, init, pattern):
    """place[t]: 스레드 t의 노드. 페이지는 처음 쓴 스레드의 노드에 놓인다."""
    chunk = PAGES // THREADS
    if init == "serial":               # 메인 스레드(노드 0)가 전부 초기화
        home = [0] * PAGES
    elif init == "parallel":           # 각 스레드가 자기 몫을 초기화
        home = [place[p // chunk] for p in range(PAGES)]
    else:                              # interleave: 노드에 번갈아 배치
        home = [p % 2 for p in range(PAGES)]
    lat, node0 = [], 0
    for t in range(THREADS):
        mine = (range(t * chunk, (t + 1) * chunk) if pattern == "own"
                else range(PAGES))     # own: 자기 몫만, all: 전체 공유
        for p in mine:
            lat.append(LOCAL if home[p] == place[t] else REMOTE)
            node0 += home[p] == 0
    return sum(lat) / len(lat), node0 / len(lat)

spread = [t % 2 for t in range(THREADS)]          # 두 노드에 고루
ok = True
for init, pat, remote in [("serial", "own", 0.5), ("parallel", "own", 0),
                          ("interleave", "own", 0.5),
                          ("parallel", "all", 0.5)]:
    avg, share = numa(spread, init, pat)
    ok &= avg == LOCAL + remote * (REMOTE - LOCAL)  # 원격 비율로 낸 공식
    print(f"{init} {pat}: 평균 {avg:.0f}ns, 노드 0 메모리 몫 {share:.0%}")
print("원격 비율 공식과 모두 일치:", ok)
```
```text
serial own: 평균 110ns, 노드 0 메모리 몫 100%
parallel own: 평균 80ns, 노드 0 메모리 몫 50%
interleave own: 평균 110ns, 노드 0 메모리 몫 50%
parallel all: 평균 110ns, 노드 0 메모리 몫 50%
원격 비율 공식과 모두 일치: True
```

- **serial**: 메인 스레드가 배열을 다 초기화하면 모든 페이지가 노드 0에 놓인다. 노드 1의 스레드는 늘 원격이고, 모든 접근이 노드 0의 메모리 컨트롤러에 몰려 대역폭도 반만 쓴다. 흔하고 눈에 잘 안 띄는 실수다.
- **parallel**: 계산할 스레드가 자기 몫을 직접 초기화하면 전부 로컬이다. 단, 스레드가 다른 노드로 옮겨지면 페이지는 따라가지 않으므로 스레드를 고정해야 한다.
- **interleave**: 페이지를 노드에 번갈아 두면 지연은 serial과 같지만 대역폭이 두 노드로 나뉜다. 모두가 전체를 읽는 공유 데이터(`all`)는 어떻게 두어도 절반이 원격이므로 인터리브가 무난하다.

코드에서 할 일은 정해져 있다. `taskset`, `numactl --cpunodebind --membind`, `pthread_setaffinity_np`, OpenMP의 `OMP_PROC_BIND`로 스레드를 노드에 고정하고(affinity), 데이터는 그것을 쓸 스레드가 초기화하며, 모두가 공유하는 큰 데이터는 `numactl --interleave`로 펼친다. 리눅스의 자동 NUMA 밸런싱은 접근을 관찰해 페이지를 옮겨 주기도 하지만, 처음부터 맞게 두는 편이 싸다.

## 숫자로 보기
| 항목 | 값 | 기준 |
|---|---|---|
| 코어당 SMT 스레드 | 2 | 인텔 HT(2002~), AMD Zen(2017~) |
| 코어당 SMT 스레드 | 8 | IBM POWER8 |
| 코어 연결망 | 링 → 메시 | 인텔 Skylake-SP(2017) |
| 칩렛 | 8코어 CCD × 8 + I/O 다이 | AMD EPYC Rome(2019) |
| NUMA 거리 | 로컬 = 10인 상대값 | ACPI SLIT |

- 원격 메모리가 로컬보다 얼마나 느린지는 소켓 수, 링크 세대, 부하에 따라 크게 다르다. 위 시뮬레이션의 80ns·140ns는 비율을 보이기 위한 가정이다.

## 어디에 쓰이나
- 양자화 15편 「CPU 오프로드: GPU 메모리보다 큰 모델 돌리기」: CPU에서 큰 가중치를 읽는 추론은 메모리 대역폭이 한계라, 2소켓 서버에서는 스레드를 노드별로 고정하고 가중치를 노드에 맞게 두는지가 속도를 좌우한다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 스케줄러는 SMT 형제와 NUMA 노드를 알고 스레드를 배치하고, first-touch 할당은 페이지 폴트 처리기 안에서 일어난다.
- 메모리 시스템 6편 「DDR 메모리와 메모리 컨트롤러: 채널, 버스트, 스케줄링」: NUMA 노드는 메모리 컨트롤러와 채널의 묶음이고, 노드 인터리브는 채널 인터리빙을 한 단계 위에서 하는 것이다.

## 정리
- SMT는 스레드별 상태만 복제하고 실행 자원을 나눠 써서 빈 발행 슬롯을 채운다. 코어 처리량은 오르고 스레드 하나는 느려진다(모델에서 1.7배 대 0.85배).
- 코어가 늘면 연결망은 링에서 메시로, 다이는 칩렛으로 바뀌고, 한 소켓 안에서도 코어 사이 거리가 생긴다.
- NUMA에서는 페이지가 처음 건드린 CPU의 노드에 놓이므로, 직렬 초기화 한 번이 원격 접근과 한쪽 메모리 쏠림을 만든다.
- 스레드를 고정하고, 쓸 스레드가 초기화하고, 공유 데이터는 인터리브한다.

## 더 알아보기
- 이전 글: 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」
- 다음 글: 12편 「전력과 클록: 동적 전력, DVFS, 터보, 이종 코어」
- Simultaneous Multithreading(Tullsen 외, ISCA 1995): https://dada.cs.washington.edu/smt/papers/isca95abstract.html
