# [GPU와 CUDA 4/14] CUDA 프로그래밍 모델: 커널, 그리드, 블록, 스레드

> **한 줄 요약** — CUDA 프로그램은 스레드 하나가 할 일을 커널 함수로 쓰고 `<<<그리드, 블록>>>`으로 수많은 스레드를 한꺼번에 띄우며, 각 스레드는 `blockIdx`·`blockDim`·`threadIdx`로 자기 몫을 계산하고, 블록은 서로 독립이라 빈 SM에 아무 순서로나 배정된다.

## 이 글에서 다루는 것
- 호스트와 디바이스, `__global__` 커널과 `<<<그리드, 블록>>>` 실행
- 전역 인덱스 계산, 경계 검사, 그리드 보폭 루프(파이썬으로 모든 원소를 한 번씩 처리하는지 확인)
- 벡터 덧셈 전체 예제(호스트 코드 포함)
- 블록이 SM에 배정되는 방식과 웨이브, 꼬리 효과(시뮬레이션)
- nvcc → PTX → SASS 컴파일 흐름

## 호스트, 디바이스, 커널
CUDA는 C++에 몇 가지 확장을 더한 언어다. CPU 쪽을 **호스트**(host), GPU 쪽을 **디바이스**(device)라 부르고, 메모리도 따로 있다. `__global__`을 붙인 함수가 **커널**(kernel)이다. 커널은 호스트에서 부르지만 디바이스에서 실행되고, 스레드 하나가 할 일을 스칼라 코드로 적는다. 3편에서 본 SIMT가 이 스칼라 코드를 워프로 묶어 실행한다.

커널을 부를 때는 `kernel<<<그리드, 블록>>>(인자)`로 스레드를 몇 개 띄울지 정한다. 전체 구조는 2단계다.
```text
grid  (gridDim.x blocks)
┌───────┬───────┬───────┐
│block 0│block 1│block 2│ ...
└───────┴───────┴───────┘
block (blockDim.x threads)
 thread 0..31  → warp 0
 thread 32..63 → warp 1
```
- **스레드 블록**(thread block): 같은 SM에서 실행되는 스레드 묶음이다. 블록 안 스레드끼리는 공유 메모리를 함께 쓰고 `__syncthreads()`로 기다릴 수 있다(7편). 블록당 최대 1,024 스레드다.
- **그리드**(grid): 같은 커널을 실행하는 블록 전체다. 블록끼리는 서로 기다릴 수 없고, 실행 순서도 정해져 있지 않다.

각 스레드는 내장 변수 `threadIdx`(블록 안 번호), `blockIdx`(그리드 안 블록 번호), `blockDim`(블록 크기), `gridDim`(그리드 크기)으로 자기 위치를 안다. 1차원이라면 전역 인덱스는 `i = blockIdx.x * blockDim.x + threadIdx.x`다. 셋 다 `x, y, z` 세 성분이 있어서 2차원 이미지나 3차원 격자도 자연스럽게 나눌 수 있다.

## 벡터 덧셈 전체 예제
아래는 원소 2²⁰개의 벡터 덧셈이다. 직접 실행하지 않은 읽기용 코드이며, 메모리 함수는 5편에서 자세히 본다.
```cuda
#include <cstdio>
#include <cstdlib>
#include <cuda_runtime.h>

__global__ void vecAdd(const float* a, const float* b, float* c, int n)
{
    int i = blockIdx.x * blockDim.x + threadIdx.x;   // 전역 인덱스
    if (i < n) c[i] = a[i] + b[i];                   // 경계 검사
}

int main()
{
    const int n = 1 << 20;
    size_t bytes = n * sizeof(float);
    float* ha = (float*)malloc(bytes);
    float* hb = (float*)malloc(bytes);
    float* hc = (float*)malloc(bytes);
    for (int i = 0; i < n; i++) { ha[i] = i; hb[i] = 2.0f * i; }

    float *da, *db, *dc;                             // 디바이스 메모리
    cudaMalloc(&da, bytes);
    cudaMalloc(&db, bytes);
    cudaMalloc(&dc, bytes);
    cudaMemcpy(da, ha, bytes, cudaMemcpyHostToDevice);
    cudaMemcpy(db, hb, bytes, cudaMemcpyHostToDevice);

    int block = 256;
    int grid = (n + block - 1) / block;              // 올림 나눗셈
    vecAdd<<<grid, block>>>(da, db, dc, n);
    cudaError_t err = cudaGetLastError();            // 실행 설정 오류
    cudaMemcpy(hc, dc, bytes, cudaMemcpyDeviceToHost); // 커널 완료 대기

    printf("%s, c[123] = %.1f\n", cudaGetErrorString(err), hc[123]);
    cudaFree(da); cudaFree(db); cudaFree(dc);
    free(ha); free(hb); free(hc);
    return 0;
}
```
커널 실행은 비동기다. `vecAdd<<<...>>>`는 일을 GPU 큐에 넣고 바로 돌아오며, 뒤따르는 `cudaMemcpy`가 커널이 끝나기를 기다린다(12편). 실행 설정이 잘못되면(블록 크기 2,048 같은) 커널은 돌지 않고 `cudaGetLastError()`만 오류를 알려 준다.

## 인덱스 계산을 파이썬으로
원소 수가 블록 크기의 배수가 아니면 그리드를 올림 나눗셈으로 잡고, 남는 스레드는 경계 검사로 아무것도 하지 않게 한다. 다른 방법은 **그리드 보폭 루프**(grid-stride loop)다. 스레드가 `blockDim.x * gridDim.x`씩 건너뛰며 여러 원소를 처리하므로 그리드 크기를 원소 수와 상관없이 정할 수 있다.
```cuda
__global__ void vecAddStride(const float* a, const float* b, float* c,
                             int n)
{
    for (int i = blockIdx.x * blockDim.x + threadIdx.x; i < n;
         i += blockDim.x * gridDim.x)
        c[i] = a[i] + b[i];
}
```
두 방식 모두 모든 원소를 빠짐없이, 겹치지 않게 처리하는지 모든 스레드의 계산을 흉내 내어 확인한다.
```python
def launch(n, block, grid, stride):
    """모든 스레드의 인덱스 계산을 흉내 내고, 원소마다 몇 번 처리됐는지 센다."""
    hits = [0] * n
    for bid in range(grid):                  # blockIdx.x
        for tid in range(block):             # threadIdx.x
            i = bid * block + tid            # 전역 인덱스
            while i < n:                     # 경계 검사
                hits[i] += 1
                if not stride:
                    break
                i += block * grid            # blockDim.x × gridDim.x
    return hits

n, block = 1000, 256
grid = (n + block - 1) // block              # 올림 나눗셈
h = launch(n, block, grid, stride=False)
print(f"그리드 {grid}, 스레드 {grid * block}, 노는 스레드 {grid * block - n}")
h2 = launch(n, block, 2, stride=True)
print("보폭 루프(그리드 2): 모두 한 번씩", all(x == 1 for x in h2))

import random
rng = random.Random(5)
ok = 0
for _ in range(300):
    n, block = rng.randint(1, 5000), rng.choice([32, 64, 128, 256, 1024])
    a = launch(n, block, (n + block - 1) // block, stride=False)
    b = launch(n, block, rng.randint(1, 8), stride=True)
    ok += all(x == 1 for x in a) and all(x == 1 for x in b)
print(f"무작위 300개: 모든 원소를 정확히 한 번 처리 {ok}/300")
```
```text
그리드 4, 스레드 1024, 노는 스레드 24
보폭 루프(그리드 2): 모두 한 번씩 True
무작위 300개: 모든 원소를 정확히 한 번 처리 300/300
```

2차원 블록이라면 워프가 어떻게 묶이는지도 알아야 한다. 블록 안 스레드의 선형 번호는 `x + y·blockDim.x`(3차원이면 `+ z·blockDim.x·blockDim.y`)이고, 이 번호를 32개씩 끊은 것이 워프다(앞 코드에 이어서).
```python
def warp_rows(bx, by):
    """2차원 블록에서 워프마다 어떤 (y, x)들이 묶이는지: 선형 번호 = x + y·bx"""
    rows = {}
    for y in range(by):
        for x in range(bx):
            w = (x + y * bx) // 32
            rows.setdefault(w, set()).add(y)
    return rows

for bx, by in [(16, 16), (32, 8), (8, 32)]:
    r = warp_rows(bx, by)
    print(f"{bx}×{by}: 워프 0의 행 {sorted(r[0])}, 행당 연속 {min(bx, 32)}개")
```
```text
16×16: 워프 0의 행 [0, 1], 행당 연속 16개
32×8: 워프 0의 행 [0], 행당 연속 32개
8×32: 워프 0의 행 [0, 1, 2, 3], 행당 연속 8개
```

세 블록 모두 256 스레드지만, `x`가 행 우선 배열의 열 방향이라면 8×32 블록의 워프는 서로 다른 네 행에서 8개씩 읽는다. 연속 주소가 짧게 끊기므로 메모리 트랜잭션이 늘어난다(6편). `blockDim.x`를 32의 배수로 잡는 습관이 여기서 나온다.

## 블록은 빈 SM으로 간다
GPU의 전역 스케줄러(엔비디아는 GigaThread 엔진이라 부른다)는 블록을 자원이 남은 SM에 배정한다. 블록 하나는 끝날 때까지 그 SM에 머물고, 한 SM에는 레지스터·공유 메모리·스레드 한도가 허락하는 만큼 여러 블록이 동시에 올라간다(8편). H100 SXM5에서 256스레드 블록은 SM당 스레드 한도 2,048 때문에 최대 8개다.

블록이 모두 같은 시간이 걸린다면 일은 **웨이브**(wave) 단위로 진행된다. 자리 1,056개(132 × 8)가 한꺼번에 차고 한꺼번에 빈다. 빈자리가 생기는 대로 다음 블록을 넣는 모델로 끝나는 시각을 재 보자(앞 코드에 이어서).
```python
import heapq, math

def makespan(n_blocks, slots, dur):
    """빈자리가 생기는 대로 다음 블록을 넣는다. 끝나는 시각을 돌려준다."""
    free = [0.0] * slots                     # 자리마다 비는 시각(힙)
    end = 0.0
    for b in range(n_blocks):
        t = heapq.heappop(free) + dur(b)
        end = max(end, t)
        heapq.heappush(free, t)
    return end

slots = 132 * 8          # H100 SXM5 SM 132개 × SM당 256스레드 블록 8개
for n in (1056, 1100, 2112, 10000):
    t = makespan(n, slots, lambda b: 1.0)
    print(f"블록 {n}개: {t:.0f}웨이브, 효율 {n / (t * slots):.0%}")

rng = random.Random(6)
ok = 0
for _ in range(300):
    n, s = rng.randint(1, 5000), rng.randint(1, 300)
    ok += makespan(n, s, lambda b: 1.0) == math.ceil(n / s)
print(f"무작위 300개: 웨이브 수 = ⌈블록 ÷ 자리⌉ 일치 {ok}/300")
```
```text
블록 1056개: 1웨이브, 효율 100%
블록 1100개: 2웨이브, 효율 52%
블록 2112개: 2웨이브, 효율 100%
블록 10000개: 10웨이브, 효율 95%
무작위 300개: 웨이브 수 = ⌈블록 ÷ 자리⌉ 일치 300/300
```

블록이 1,056개에서 1,100개로 4% 늘었을 뿐인데 시간은 두 배다. 두 번째 웨이브에 블록 44개만 남아 나머지 자리가 노는 **꼬리 효과**(tail effect)다. 웨이브가 많으면 마지막 웨이브의 낭비가 묽어지고(10웨이브면 95%), 블록을 더 잘게 나눠도 빈자리가 준다. 실제 GPU는 블록마다 시간이 다르고 배정 정책도 공개되지 않았으므로, 이 모델은 경향을 보는 용도다.

블록 실행 순서가 정해져 있지 않다는 것이 이 모델의 핵심 약속이다. 블록 7이 블록 3의 결과를 기다리면, 블록 3이 아직 배정되지 않은 경우 영원히 멈춘다. 블록이 독립이기 때문에 같은 바이너리가 SM 수가 다른 칩에서도 돈다.

## nvcc에서 SASS까지
`nvcc`는 여러 컴파일러를 부르는 드라이버다. 호스트 코드는 gcc 같은 호스트 컴파일러로 보내고, 디바이스 코드는 가상 명령어 집합인 **PTX**로 번역한 뒤 `ptxas`가 실제 GPU 기계어인 **SASS**로 바꾼다.
```text
vecadd.cu
 ├─ host code → gcc/clang
 └─ device code
     → PTX  (virtual ISA)
     → ptxas → SASS (sm_90)
 → fatbinary in the executable
```
`compute_90` 같은 가상 아키텍처는 PTX를, `sm_90` 같은 실제 아키텍처는 SASS를 만든다. 실행 파일에 둘 다 넣어 두면, 맞는 SASS가 없는 새 GPU에서도 드라이버가 PTX를 그 자리에서 컴파일(JIT)해 돌린다. SASS는 세대마다 바뀌고, PTX는 문서화된 안정된 중간 언어다.
```sh
nvcc -O3 -arch=sm_90 vecadd.cu -o vecadd    # H100용 SASS + PTX
nvcc -gencode arch=compute_80,code=sm_80 \
     -gencode arch=compute_90,code=sm_90 vecadd.cu -o vecadd
cuobjdump -sass vecadd                      # 들어 있는 SASS 보기
```

## 코드에 주는 의미
- 블록 크기는 32의 배수(보통 128~512)로 잡는다. 32의 배수가 아니면 마지막 워프의 레인이 처음부터 논다.
- 블록 수는 SM 수의 몇 배 이상으로 넉넉히 잡거나, 그리드 보폭 루프로 그리드를 SM 수에 맞춰 고정한다.
- 블록끼리 순서나 결과를 기다리지 않게 짠다. 블록 간 합치기가 필요하면 커널을 나누거나 원자적 연산을 쓴다(9편).
- 커널을 띄운 뒤 `cudaGetLastError()`로 실행 설정 오류를 확인한다.

## 숫자로 보기
| 항목 | 한도 | 근거 |
|---|---|---|
| 블록당 스레드 | 1,024 | CUDA 가이드 |
| 블록 차원 x, y, z | 1,024, 1,024, 64 | CUDA 가이드 |
| 그리드 차원 x | 2³¹ − 1 | CUDA 가이드 |
| 그리드 차원 y, z | 65,535 | CUDA 가이드 |
| SM당 상주 스레드 | 2,048(CC 8.0, 9.0) | CUDA 가이드 |
| H100 SXM5 SM | 132 | 백서 |

블록당 1,024 스레드는 계산 능력 2.0 이후 줄곧 같은 값이고, SM당 상주 스레드는 세대마다 다르다(예: 계산 능력 8.6은 1,536).

## 어디에 쓰이나
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: nvcc가 PTX와 SASS를 만들어 실행 파일에 묶는 과정은 그 글의 컴파일·어셈블·링크를 디바이스 코드에 한 번 더 하는 것이다.
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: PTX는 실제 기계어와 분리된 중간 표현이라, 컴파일러의 중간 표현처럼 여러 세대의 GPU를 한 번에 겨냥하게 해 준다.

## 정리
- 커널은 스레드 하나의 일을 적은 함수이고, `<<<그리드, 블록>>>`이 스레드 수를 정한다. 전역 인덱스는 `blockIdx.x * blockDim.x + threadIdx.x`다.
- 원소 수가 맞지 않으면 올림 나눗셈과 경계 검사, 또는 그리드 보폭 루프로 모든 원소를 정확히 한 번 처리한다.
- 블록은 빈 SM에 아무 순서로나 배정되므로 서로 독립이어야 하고, 블록 수가 자리 수를 조금 넘으면 꼬리 효과로 효율이 반 토막 날 수 있다.
- nvcc는 디바이스 코드를 PTX로, ptxas는 PTX를 세대별 SASS로 바꾸며, PTX를 함께 넣으면 새 GPU에서 드라이버가 JIT 컴파일한다.

## 더 알아보기
- 이전 글: 3편 「SIMT와 워프: 32개 스레드가 함께 걷는 법」
- 다음 글: 5편 「CUDA 메모리 계층: 레지스터, 공유, 전역, 상수, 로컬」
