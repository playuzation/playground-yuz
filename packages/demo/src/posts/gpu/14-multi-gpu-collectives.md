# [GPU와 CUDA 14/14] 멀티 GPU와 집합 통신: NVLink, NCCL, 링 올리듀스

> **한 줄 요약** — 데이터 병렬 학습은 매 단계 모든 GPU의 기울기를 합쳐야 하는데, 한 GPU로 모으면 그 GPU의 링크가 병목이 되므로, 기울기를 GPU 수만큼 조각내 고리 모양으로 돌리는 링 올리듀스(리듀스-스캐터 + 올게더)로 GPU당 전송량을 GPU 수와 거의 무관한 2(N−1)/N·S로 줄이고, NCCL이 이를 NVLink·NVSwitch·PCIe·네트워크 위에서 실행한다.

## 이 글에서 다루는 것
- GPU 사이 연결: PCIe, NVLink, NVSwitch, 노드 사이 네트워크(세대 명시)
- 데이터 병렬 학습의 기울기 합치기와 올리듀스
- 링 올리듀스를 파이썬으로 시뮬레이션해 결과와 GPU당 전송량 2(N−1)/N 확인
- NCCL의 역할, 텐서 병렬과의 차이

## 기울기를 합쳐야 한다
모델 하나를 GPU 여러 대로 빨리 학습하는 가장 흔한 방법은 **데이터 병렬**(data parallel)이다. GPU마다 모델 전체를 두고 서로 다른 미니배치로 기울기를 구한 뒤, 모든 GPU의 기울기를 더해(또는 평균 내) 같은 갱신을 한다. 평균 손실의 기울기가 기울기의 평균이라서 결과는 큰 배치 하나로 학습한 것과 같다(미적분 10편 「경사 하강법의 수학」). 모든 GPU가 합을 받아야 하는 이 통신을 **올리듀스**(all-reduce)라 한다. 9편 「병렬 리덕션과 워프 셔플: 수백만 개를 합 하나로」의 합을 GPU 사이에서, 결과를 모두가 갖도록 하는 셈이다.

기울기는 매개변수 수만큼 크다. 매개변수 70억 개를 BF16으로 두면 14GB이고, 이것을 매 학습 단계마다 합쳐야 한다. 그래서 GPU 사이의 연결 대역폭이 학습 속도를 좌우한다.
```text
DGX H100 (one node)
 GPU0 GPU1 ... GPU7
   │    │        │   NVLink 4
┌──┴────┴────────┴──┐
│ 4 x NVSwitch      │
└─────────┬─────────┘
          │ InfiniBand
      other nodes
```
- **PCIe**: 12편 「스트림과 비동기 실행: 복사와 계산을 겹치기」에서 본 대로 5.0 x16이 한 방향 약 63GB/s다. GPU끼리 PCIe로 통신하면 CPU 쪽 스위치를 지나기도 한다.
- **NVLink**: GPU끼리 직접 잇는 엔비디아의 연결이다. H100은 4세대 NVLink 링크 18개로 GPU당 양방향 합 900GB/s(한 방향 450GB/s)를 낸다.
- **NVSwitch**: NVLink 스위치 칩이다. DGX H100은 GPU 8개를 3세대 NVSwitch 4개에 연결해, 어느 두 GPU 사이든 전체 NVLink 대역폭으로 통신한다.
- 노드 사이는 InfiniBand나 이더넷 네트워크다. InfiniBand NDR은 포트당 400Gb/s(50GB/s)로, 노드 안 NVLink의 한 방향 450GB/s보다 9배 느리다.

## 한 곳에 모으면 생기는 병목
가장 단순한 올리듀스는 GPU 0이 나머지 N − 1대의 기울기를 받아 더한 뒤 결과를 다시 보내는 것이다. GPU 0의 링크로 2(N − 1)·S가 지나가므로 GPU가 늘수록 선형으로 느려진다. 나머지 GPU의 링크는 대부분 논다.

**링 올리듀스**(ring all-reduce)는 GPU를 고리로 잇고 기울기를 N조각으로 나눈다. 대역폭 면에서 최적인 이 알고리즘은 파타라숙(Pitch Patarasuk)과 위안(Xin Yuan)이 2009년 논문에서 분석했고, 2017년 무렵 바이두가 딥러닝 학습에 도입하며 널리 알려졌다.
- **리듀스-스캐터**(reduce-scatter): N − 1단계 동안 GPU마다 조각 하나를 다음 GPU로 보내고, 받은 쪽은 자기 것에 더해 다음 단계에 넘긴다. 끝나면 GPU마다 서로 다른 조각 하나의 전체 합을 갖는다.
- **올게더**(all-gather): 다시 N − 1단계 동안 완성된 조각을 고리를 따라 돌려 모두가 모든 조각을 갖는다.

단계마다 모든 링크가 동시에 S/N씩 보내므로 GPU당 전송량은 2(N − 1)·S/N이다. N이 커져도 2S를 넘지 않는다.

## 링 올리듀스 시뮬레이션
GPU N대의 기울기를 정수 리스트로 두고, 조각을 고리로 주고받는 과정을 그대로 실행한다. 리듀스-스캐터 직후 GPU마다 어느 조각이 완성됐는지, 올게더 뒤 모든 GPU가 정답 합을 갖는지, GPU당 보낸 원소 수가 2(N − 1)·S/N인지 확인한다.
```python
import random

def ring_allreduce(data):
    """data[g]: GPU g의 기울기(길이 S, N의 배수). 링은 g → g+1"""
    N, S = len(data), len(data[0])
    m = S // N                                 # 조각 하나의 길이
    buf, sent = [list(x) for x in data], [0] * N
    part = lambda c: range(c * m, (c + 1) * m)

    def step(pick, combine):                   # 모든 GPU가 동시에 한 조각씩
        msgs = [(g, pick(g), [buf[g][i] for i in part(pick(g))])
                for g in range(N)]
        for g, c, vals in msgs:
            nxt = buf[(g + 1) % N]
            for i, v in zip(part(c), vals):
                nxt[i] = combine(nxt[i], v)
            sent[g] += m

    total = [sum(col) for col in zip(*data)]
    for t in range(N - 1):                     # 리듀스-스캐터: 받아서 더한다
        step(lambda g: (g - t) % N, lambda old, v: old + v)
    done = [[c for c in range(N) if all(buf[g][i] == total[i] for i in part(c))]
            for g in range(N)]
    for t in range(N - 1):                     # 올게더: 완성된 조각을 돌린다
        step(lambda g: (g + 1 - t) % N, lambda old, v: v)
    return buf, sent, done, total

rng = random.Random(14)
data = [[rng.randrange(100) for _ in range(8)] for _ in range(4)]
buf, sent, done, total = ring_allreduce(data)
print("리듀스-스캐터 뒤 GPU별 완성 조각:", [d[0] for d in done])
print("올게더 뒤 모두 정답:", all(b == total for b in buf))
print("GPU당 보낸 원소(S = 8, N = 4):", sent)

ok = 0
for _ in range(300):
    N, m = rng.randint(2, 8), rng.randint(1, 5)
    data = [[rng.randrange(-99, 100) for _ in range(N * m)] for _ in range(N)]
    buf, sent, _, total = ring_allreduce(data)
    ok += all(b == total for b in buf) and set(sent) == {2 * (N - 1) * m}
print(f"무작위 300개 중 합이 맞고 전송량이 2(N−1)S/N인 경우: {ok}개")
```
```text
리듀스-스캐터 뒤 GPU별 완성 조각: [1, 2, 3, 0]
올게더 뒤 모두 정답: True
GPU당 보낸 원소(S = 8, N = 4): [12, 12, 12, 12]
무작위 300개 중 합이 맞고 전송량이 2(N−1)S/N인 경우: 300개
```

GPU 4대, 길이 8에서 리듀스-스캐터가 끝나면 GPU g는 조각 (g + 1) mod 4의 합을 갖고, 올게더 뒤에는 모두가 정답을 갖는다. GPU당 보낸 원소는 2 × 3 × 8 / 4 = 12개다. 무작위 300개(N = 2~8)에서도 결과와 전송량 공식이 모두 맞았다. nccl-tests가 올리듀스 성능을 보고할 때 측정 대역폭에 2(N − 1)/N을 곱한 "버스 대역폭"을 따로 적는 것이 이 전송량 때문이다.

## 시간 모델: 대역폭 항과 지연 항
메시지 하나에 고정 지연 α가 들고 링크 대역폭이 B라면 링은 `2(N − 1)·(α + S/(N·B))`, 한 곳에 모으기는 `2(N − 1)·(α + S/B)`다. 앞 코드에 이어서, 기울기 14GB를 GPU 8대에서 합치는 시간을 계산한다. α = 10μs는 설명용 가정이다.
```python
def t_ring(S, N, B, alpha):                    # 단계 2(N−1)번, 한 번에 S/N
    return 2 * (N - 1) * (alpha + S / N / B)

def t_root(S, N, B, alpha):                    # 한 GPU로 모았다가 다시 보냄
    return 2 * (N - 1) * (alpha + S / B)

S, N, alpha = 14e9, 8, 10e-6                   # 7B 매개변수 BF16, 가정 α
for name, B in [("NVLink 4(H100)", 450e9), ("PCIe 5.0 x16", 63e9)]:
    print(f"{name}: 링 {t_ring(S, N, B, alpha) * 1e3:.1f}ms,",
          f"한 곳에 모으기 {t_root(S, N, B, alpha) * 1e3:.1f}ms")
small = t_ring(1e6, N, 450e9, alpha)
print(f"1MB 링: {small * 1e6:.0f}μs,",
      f"그중 지연 항 {2 * (N - 1) * alpha * 1e6:.0f}μs")
```
```text
NVLink 4(H100): 링 54.6ms, 한 곳에 모으기 435.7ms
PCIe 5.0 x16: 링 389.0ms, 한 곳에 모으기 3111.3ms
1MB 링: 144μs, 그중 지연 항 140μs
```

큰 기울기에서는 대역폭 항이 전부라 링이 한 곳에 모으기보다 N배(여기서 8배) 빠르고, NVLink가 PCIe보다 7배 빠르다. 반대로 1MB처럼 작은 메시지는 지연 항 2(N − 1)·α가 대부분이라, 단계 수가 log N에 비례하는 트리 알고리즘이 유리하다. 이 모델은 이상적인 상한이고, 실제 속도는 토폴로지와 구현에 따라 다르다.

## NCCL: 알고리즘과 연결을 고르는 라이브러리
NCCL(NVIDIA Collective Communications Library)은 올리듀스·올게더·리듀스-스캐터·브로드캐스트 같은 집합 통신을 GPU에서 실행한다. 시작할 때 GPU 사이의 연결(NVLink, NVSwitch, PCIe, InfiniBand)을 조사해, 메시지 크기에 따라 링이나 트리 같은 알고리즘과 경로를 고르고, 통신을 CUDA 커널로 실행해 스트림 위에서 계산과 겹칠 수 있게 한다. 아래 코드는 GPU가 없는 컨테이너라 직접 실행하지 않은 읽기용이다.
```cuda
#include <nccl.h>
// rank 0이 ncclGetUniqueId(&id)로 만든 id를 모든 프로세스에 나눠 준 뒤
ncclComm_t comm;
ncclCommInitRank(&comm, nranks, id, rank);
// 역전파가 만든 기울기를 모든 GPU에서 합친다(보내는 곳 = 받는 곳)
ncclAllReduce(grad, grad, count, ncclBfloat16, ncclSum, comm, stream);
cudaStreamSynchronize(stream);
```

PyTorch의 DistributedDataParallel은 기울기를 기본 25MB 크기의 버킷으로 묶어, 역전파가 한 버킷을 다 채우는 즉시 그 버킷의 올리듀스를 시작해 남은 역전파 계산과 통신을 겹친다. FSDP와 ZeRO는 매개변수까지 GPU마다 나눠 두고, 기울기는 리듀스-스캐터로 자기 몫만 받고 매개변수는 필요할 때 올게더로 모은다. 링 올리듀스의 두 절반을 따로 쓰는 셈이다.

**텐서 병렬**(tensor parallel)은 층 하나의 행렬을 GPU들에 나눈다. 메가트론-LM(쇼이비 외, 2019)은 MLP의 첫 행렬을 열로, 둘째 행렬을 행으로 나눠 각 GPU가 부분 결과를 만들고 블록마다 올리듀스로 합친다. 층마다 활성값을 통신하므로 대역폭이 큰 노드 안(NVLink 영역)에서 쓰고, 노드 사이는 데이터 병렬이나 파이프라인 병렬로 나누는 것이 보통이다.

## 숫자로 보기
| 연결 | GPU당 대역폭 | 기준 |
|---|---|---|
| NVLink 2 (V100) | 300GB/s | 양방향 합 |
| NVLink 3 (A100) | 600GB/s | 양방향 합 |
| NVLink 4 (H100) | 900GB/s | 양방향 합 |
| NVLink 5 (B200) | 1,800GB/s | 양방향 합 |
| PCIe 5.0 x16 | 약 63GB/s | 한 방향 |
| InfiniBand NDR | 50GB/s | 포트당 |

- H100의 NVLink 4는 링크 18개로 900GB/s를 낸다. DGX H100은 GPU 8개와 NVSwitch 4개로 이루어진다.
- 링 올리듀스의 GPU당 전송량: 2(N − 1)/N·S. 모델 계산(14GB, GPU 8대): NVLink 4에서 약 55ms, PCIe 5.0에서 약 389ms.

## 어디에 쓰이나
- 신경망 레이어 9편 「전문가 혼합(MoE) 층」: 전문가를 GPU들에 나눠 두면 토큰을 해당 전문가의 GPU로 보내고 돌려받는 올투올(all-to-all) 통신이 생기고, 이 역시 NCCL의 집합 통신이다.
- 오픈 웨이트 모델 3편 「MoE 모델: 믹스트랄, 딥시크-V3, Qwen3」: 딥시크-V3처럼 GPU 여러 대에 나눠 올리는 큰 MoE는 토큰을 전문가가 있는 GPU로 보내야 해서, 노드 안 NVLink와 노드 사이 네트워크의 대역폭 차이가 전문가 배치를 좌우한다.
- 12편 「스트림과 비동기 실행: 복사와 계산을 겹치기」: NCCL 통신도 스트림 위의 작업이라, 역전파와 통신을 겹치는 원리가 복사와 계산을 겹치는 것과 같다.

## 정리
- 데이터 병렬 학습은 매 단계 기울기 전체(7B·BF16이면 14GB)를 올리듀스해야 해서 GPU 사이 대역폭이 속도를 좌우한다.
- 한 곳에 모으면 그 GPU의 링크로 2(N − 1)·S가 지나가지만, 링 올리듀스는 GPU당 2(N − 1)/N·S만 보내고 모든 링크를 동시에 쓴다.
- 시뮬레이션에서 리듀스-스캐터 후 GPU마다 다른 조각이 완성되고, 올게더 후 모두가 정답을 가지며, 전송량 공식이 무작위 300개에서 맞았다.
- NCCL은 연결을 조사해 링·트리 등 알고리즘을 고르고, 큰 메시지는 대역폭 항, 작은 메시지는 지연 항이 시간을 정한다.

## 더 알아보기
- 이전 글: 13편 「루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가」
- 처음 글: 1편 「GPU는 왜 다르게 생겼나: 지연을 숨기는 처리량 기계」
