# [GPU와 CUDA 12/14] 스트림과 비동기 실행: 복사와 계산을 겹치기

> **한 줄 요약** — PCIe는 HBM보다 수십 배 느려서 복사하고 계산하고 다시 복사하면 GPU가 대부분 기다리는데, 데이터를 조각내 여러 스트림에 나눠 고정 메모리에서 `cudaMemcpyAsync`로 보내면 복사 엔진과 SM이 서로 다른 조각을 동시에 처리해 전체 시간이 가장 느린 단계 쪽으로 줄어든다.

## 이 글에서 다루는 것
- PCIe 대역폭(세대 명시)과 복사가 병목이 되는 이유
- 스트림·이벤트, `cudaMemcpyAsync`와 고정(pinned) 메모리, 복사 엔진
- 조각 단위 파이프라인을 파이썬 타임라인 시뮬레이션으로(복사 엔진 수와 발행 순서의 영향)
- CUDA 그래프로 실행 요청 비용 줄이기

## 복사가 계산보다 느리다
GPU 메모리에 없는 데이터는 호스트(CPU 쪽 DRAM)에서 PCIe로 가져와야 한다. PCIe x16의 한 방향 대역폭은 레인당 전송률 × 16레인에, 3.0 세대부터 쓰는 128b/130b 부호화 효율을 곱해 구한다.
```python
for gen, gt in (("3.0", 8), ("4.0", 16), ("5.0", 32)):   # 레인당 GT/s
    raw = gt * 16 / 8                        # x16, 8비트 = 1바이트
    print(f"PCIe {gen} x16 한 방향: 원시 {raw:.0f}GB/s,",
          f"부호화 뒤 {raw * 128 / 130:.1f}GB/s")
print(f"H100 SXM5 HBM3(3,350GB/s) 대비 {3350 / (64 * 128 / 130):.0f}배 느리다")
```
```text
PCIe 3.0 x16 한 방향: 원시 16GB/s, 부호화 뒤 15.8GB/s
PCIe 4.0 x16 한 방향: 원시 32GB/s, 부호화 뒤 31.5GB/s
PCIe 5.0 x16 한 방향: 원시 64GB/s, 부호화 뒤 63.0GB/s
H100 SXM5 HBM3(3,350GB/s) 대비 53배 느리다
```

H100 사양의 "PCIe 5.0 128GB/s"는 원시 64GB/s를 양방향으로 더한 값이다. 실제로는 패킷 머리 비용 때문에 이보다 조금 낮다. 원소마다 몇 번 계산하고 끝나는 커널이라면 HBM에서 1ms에 읽을 양을 PCIe로 가져오는 데 50ms 넘게 걸리니, 복사를 계산 뒤에 숨기지 않으면 GPU는 거의 논다.

## 스트림, 복사 엔진, 고정 메모리
```text
 host DRAM (pinned)
     │ PCIe
┌────┴─────────────────────┐
│ copy engine H2D          │
│ copy engine D2H          │
│ SMs (kernels)            │
│ HBM                      │
└──────────────────────────┘
```
- **스트림**(stream)은 GPU 작업의 줄이다. 같은 스트림의 작업은 낸 순서대로 하나씩 실행되고, 다른 스트림의 작업끼리는 겹칠 수 있다. 스트림을 지정하지 않은 작업은 기본 스트림으로 가는데, 기존 방식의 기본 스트림은 다른 스트림과 서로 기다리므로 겹치기를 원하면 스트림을 직접 만든다.
- **복사 엔진**(copy engine)은 SM과 따로 도는 DMA 장치다. 장치 속성 `asyncEngineCount`가 2면 호스트→장치와 장치→호스트 복사가 계산과 동시에 진행될 수 있다.
- **고정 메모리**(pinned, page-locked memory)는 운영체제가 내보내거나 옮기지 않기로 약속한 호스트 페이지다. DMA는 물리 주소로 일하므로 일반(페이지 가능) 메모리에서 복사하면 드라이버가 고정된 중간 버퍼로 한 번 더 복사하고, 겹치기도 기대할 수 없다. `cudaMallocHost`로 받는다. 너무 많이 잡으면 운영체제가 쓸 메모리가 준다(가상 메모리는 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」 참조).

아래 코드는 배열을 NS개 조각으로 나눠 조각마다 스트림 하나에 복사·커널·복사를 낸다. GPU와 nvcc가 없는 컨테이너라 직접 실행하지 않은 읽기용이고, n은 NS의 배수라고 가정했다.
```cuda
const int NS = 4;
cudaStream_t s[NS];
for (int i = 0; i < NS; ++i) cudaStreamCreate(&s[i]);
float *h, *d;
cudaMallocHost(&h, n * sizeof(float));       // 고정 메모리
cudaMalloc(&d, n * sizeof(float));
int chunk = n / NS;
size_t bytes = chunk * sizeof(float);
for (int i = 0; i < NS; ++i) {               // 호출은 바로 돌아온다
    int off = i * chunk;
    cudaMemcpyAsync(d + off, h + off, bytes, cudaMemcpyHostToDevice, s[i]);
    work<<<(chunk + 255) / 256, 256, 0, s[i]>>>(d + off, chunk);
    cudaMemcpyAsync(h + off, d + off, bytes, cudaMemcpyDeviceToHost, s[i]);
}
cudaDeviceSynchronize();                     // 여기서 모두 기다린다
```

스트림 사이의 순서는 **이벤트**(event)로 건다. `cudaEventRecord(ev, s[0])`로 s[0]의 한 지점을 표시하고 `cudaStreamWaitEvent(s[1], ev, 0)`을 내면 s[1]은 그 지점까지 기다린다. 두 이벤트 사이의 GPU 시간은 `cudaEventElapsedTime`으로 잰다.

## 타임라인 시뮬레이션
엔진마다 작업을 낸 순서대로 처리하고(FIFO), 같은 스트림의 작업은 앞 작업이 끝나야 시작한다는 두 규칙만으로 타임라인을 만든다. 시간 단위는 임의이고, 전체 복사가 방향마다 8, 계산이 4인 작업을 조각 4개로 나눈다. 앞 코드에 이어서 실행한다.
```python
import random

def timeline(ops, engines):
    """ops: 호스트가 낸 순서의 (스트림, 엔진, 시간)"""
    prev, last = {}, {}
    for i, (s, e, d) in enumerate(ops):      # 같은 스트림의 바로 앞 작업
        prev[i], last[s] = last.get(s), i
    queue = {e: [i for i, op in enumerate(ops) if op[1] == e] for e in engines}
    end, free = {}, dict.fromkeys(engines, 0)
    while len(end) < len(ops):
        for e in engines:                    # 엔진마다 줄의 맨 앞만 본다
            if queue[e] and prev[queue[e][0]] in end.keys() | {None}:
                i = queue[e].pop(0)
                ready = end[prev[i]] if prev[i] is not None else 0
                end[i] = free[e] = max(free[e], ready) + ops[i][2]
    return max(end.values()), end

def chunks(n, a, b, c, copy=("H2D", "D2H"), order="스트림별"):
    jobs = [[(i, copy[0], a), (i, "SM", b), (i, copy[1], c)] for i in range(n)]
    if order == "스트림별":                  # 위 CUDA 코드의 발행 순서
        return [op for job in jobs for op in job]
    return [job[k] for k in range(3) for job in jobs]   # 종류별로 묶어 발행

def draw(ops, end, engines, T):
    for e in engines:
        row = ["."] * T
        for i, (s, en, d) in enumerate(ops):
            if en == e:
                row[end[i] - d:end[i]] = str(s + 1) * d
        print(f"{e:4}", "".join(row))

E2 = ["H2D", "SM", "D2H"]
print("나누지 않음:", timeline(chunks(1, 8, 4, 8), E2)[0])
ops = chunks(4, 2, 1, 2)
T, end = timeline(ops, E2)
print("조각 4개, 복사 엔진 2개:", T)
draw(ops, end, E2, T)
for order in ("스트림별", "종류별"):
    T = timeline(chunks(4, 2, 1, 2, ("CE", "CE"), order), ["CE", "SM"])[0]
    print(f"복사 엔진 1개, {order} 발행: {T}")
```
```text
나누지 않음: 20
조각 4개, 복사 엔진 2개: 11
H2D  11223344...
SM   ..1.2.3.4..
D2H  ...11223344
복사 엔진 1개, 스트림별 발행: 20
복사 엔진 1개, 종류별 발행: 16
```

나누지 않으면 20이 걸리던 일이 조각 4개로 11이 된다. 그림의 숫자는 조각 번호이고, 2번 조각을 올리는 동안 1번 조각을 계산하고 내린다. 복사 엔진이 하나뿐인 GPU에서는 발행 순서가 결과를 바꾼다. 스트림별로 내면 엔진의 줄에서 1번 조각 내리기가 2번 조각 올리기를 막아(1번 계산이 끝날 때까지 기다리므로) 하나도 겹치지 못하고 20이 걸린다. 같은 종류끼리 묶어 내면 16이다. 엔비디아 블로그 「How to Overlap Data Transfers in CUDA C/C++」(2012)가 복사 엔진 수에 따른 이 차이를 다뤘다.

복사 엔진이 둘이고 조각 크기가 같으면 세 단계 파이프라인의 완료 시간은 `a + b + c + (n − 1)·max(a, b, c)`다(a·b·c는 조각 하나의 단계별 시간). 앞 코드에 이어서, 무작위 조각 수와 시간으로 시뮬레이터를 이 공식과 맞춰 본다.
```python
rng, ok = random.Random(12), 0
for _ in range(300):
    n, a, b, c = rng.randint(1, 8), *(rng.randint(1, 9) for _ in range(3))
    T = timeline(chunks(n, a, b, c), E2)[0]
    ok += T == a + b + c + (n - 1) * max(a, b, c)
print(f"무작위 300개, 공식과 비교: {ok}개 일치")
```
```text
무작위 300개, 공식과 비교: 300개 일치
```

공식에서 보듯 조각을 늘릴수록 전체 시간은 가장 느린 단계의 총량(여기서는 복사 8)에 다가간다. 그 이상은 겹치기로 줄일 수 없고, 조각이 너무 작으면 복사와 커널 실행마다 붙는 고정 비용이 커진다. 실제 타임라인은 Nsight Systems(`nsys profile`)로 이런 그림 그대로 볼 수 있다.

## CUDA 그래프: 실행 요청을 한 번에
커널 하나를 실행하려면 CPU가 드라이버를 거쳐 요청을 만들어 보내야 한다. 커널이 아주 짧으면 GPU가 다음 요청을 기다리며 논다. **CUDA 그래프**(CUDA Graphs, CUDA 10에서 도입)는 작업들과 그 의존 관계를 한 번 기록해 두고, 이후에는 그래프 전체를 요청 하나로 실행한다. 기존 스트림 코드를 캡처하는 방법이 가장 간단하다.
```cuda
cudaGraph_t graph;
cudaGraphExec_t exec;
cudaStreamBeginCapture(s[0], cudaStreamCaptureModeGlobal);
for (int i = 0; i < 100; ++i)                // 실행하지 않고 기록만
    small_kernel<<<grid, 256, 0, s[0]>>>(d, i);
cudaStreamEndCapture(s[0], &graph);
cudaGraphInstantiate(&exec, graph, 0);       // CUDA 12의 형식
for (int step = 0; step < 1000; ++step)
    cudaGraphLaunch(exec, s[0]);             // 커널 100개를 요청 하나로
```

그래프는 모양이 고정되어야 한다. 매번 텐서 크기가 바뀌면 크기별로 따로 캡처하거나 `cudaGraphExecUpdate`로 인자를 고친다.

## 숫자로 보기
| 연결 | 한 방향 대역폭 | 비고 |
|---|---|---|
| PCIe 3.0 x16 | 약 15.8GB/s | 8GT/s |
| PCIe 4.0 x16 | 약 31.5GB/s | A100 |
| PCIe 5.0 x16 | 약 63.0GB/s | H100 |
| H100 SXM5 HBM3 | 3,350GB/s | 비교용 |

- 위 대역폭은 부호화만 뺀 값이다. H100 데이터시트의 PCIe 5.0 128GB/s는 원시 대역폭의 양방향 합이다.
- 시뮬레이션(복사 8 + 계산 4 + 복사 8): 나누지 않음 20, 조각 4개·복사 엔진 2개 11, 복사 엔진 1개는 발행 순서에 따라 20 또는 16.

## 어디에 쓰이나
- 양자화 15편 「CPU 오프로드: GPU 메모리보다 큰 모델 돌리기」: 가중치를 PCIe로 흘려보내는 방식은 다음 층의 가중치를 올리는 동안 현재 층을 계산하는 이 파이프라인이고, 그 속도의 상한은 PCIe 대역폭이다.
- 게임 자원 관리 6편 「에셋 스트리밍: 예산 안에서 우선순위대로 불러오기」: 느린 저장 장치에서 불러오는 일과 그리는 일을 겹친다는 같은 생각을 프레임 예산 안에서 푼다.
- 14편 「멀티 GPU와 집합 통신: NVLink, NCCL, 링 올리듀스」: 집합 통신도 스트림에 올라가, 데이터 병렬 학습에서 기울기 통신을 역전파 계산과 겹친다.

## 정리
- PCIe 5.0 x16은 한 방향 약 63GB/s로 H100 HBM3보다 53배 느려서, 복사를 숨기지 않으면 GPU가 기다린다.
- 고정 메모리와 `cudaMemcpyAsync`, 여러 스트림이 있어야 복사 엔진과 SM이 서로 다른 조각을 동시에 처리한다.
- 조각 n개 파이프라인의 시간은 `a + b + c + (n − 1)·max(a, b, c)`이고 시뮬레이터가 무작위 300개에서 일치했다. 복사 엔진이 하나면 발행 순서까지 맞춰야 한다.
- CUDA 그래프는 짧은 커널 여러 개의 실행 요청 비용을 요청 하나로 줄인다.

## 더 알아보기
- 이전 글: 11편 「텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을」
- 다음 글: 13편 「루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가」
