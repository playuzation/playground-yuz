# [GPU와 CUDA 9/14] 병렬 리덕션과 워프 셔플: 수백만 개를 합 하나로

> **한 줄 요약** — 리덕션은 log₂n 단계의 트리로 합치되, 활성 스레드를 앞쪽에 몰아 워프 갈림과 뱅크 충돌을 없애고, 마지막 32개는 공유 메모리 대신 `__shfl_down_sync`로 레지스터끼리 주고받으며, 블록 결과는 원자적 덧셈이나 두 번째 커널로 모은다.

## 이 글에서 다루는 것
- 리덕션이 대역폭 문제인 이유
- 블록 안 트리의 세 가지 주소 방식: 활성 레인, 갈린 워프, 공유 메모리 처리 횟수 세기
- 워프 셔플로 워프 합 구하기(시뮬레이션과 무작위 대조)
- 블록 결과 모으기: 원자적 덧셈과 FP32 순서 문제

## 리덕션은 대역폭 문제다
배열 n개의 합은 덧셈 n − 1번이면 끝나지만 원소마다 4바이트를 읽어야 한다. FP32 기준 1바이트당 0.25 FLOP이라 연산 장치는 거의 놀고, 성능은 HBM에서 얼마나 빨리 읽느냐로 정해진다(13편 「루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가」). 목표는 덧셈을 빨리 하는 것이 아니라 읽기 대역폭을 다 쓰는 것이다.

병렬 합은 결합 법칙을 이용해 짝끼리 더하는 트리로 바꾼다. 각 블록이 원소 수백 개를 공유 메모리에 올려 log₂ 단계 만에 합 하나로 줄이고, 블록 합들을 다시 합친다.
```text
8 values, sequential addressing
s=4: x[t] += x[t+4]  (t = 0..3)
s=2: x[t] += x[t+2]  (t = 0..1)
s=1: x[0] += x[1]    -> total
```

## 같은 트리, 세 가지 주소 방식
마크 해리스(Mark Harris)의 엔비디아 자료 「Optimizing Parallel Reduction in CUDA」는 커널 7개를 차례로 고쳐 가며 이 문제를 다룬다. 앞의 세 커널은 트리는 같고 "어느 스레드가 어느 칸을 더하느냐"만 다르다.
- 갈림(커널 1): `if (tid % (2*s) == 0) sm[tid] += sm[tid + s];` s = 1, 2, 4, …
- 보폭(커널 2): `index = 2*s*tid`인 스레드가 `sm[index] += sm[index + s]`
- 순차(커널 3): s = 128, 64, …, 1에서 `if (tid < s) sm[tid] += sm[tid + s];`

256스레드 블록 하나로 단계마다 워프 8개를 살펴, 활성 레인이 있어 명령을 발행하는 워프 수(발행), 그중 일부 레인만 활성인 갈린 워프 수, 공유 메모리 처리 횟수(처리)를 센다. 처리 횟수는 7편 「공유 메모리와 뱅크 충돌: 32개 뱅크를 동시에 쓰기」의 규칙대로, 워프 접근마다 같은 뱅크에 몰린 서로 다른 주소 수의 최댓값을 더한다.
```python
import random

def steps(kind, B):
    """단계마다 {활성 스레드: (쓸 주소 a, 읽을 주소 b)}"""
    strides = [1 << k for k in range(B.bit_length() - 1)]
    if kind == "순차":
        strides = strides[::-1]
    for s in strides:
        if kind == "갈림":            # tid % (2*s) == 0
            yield {t: (t, t + s) for t in range(B) if t % (2 * s) == 0}
        elif kind == "보폭":          # index = 2*s*tid
            yield {t: (2 * s * t, 2 * s * t + s) for t in range(B)
                   if 2 * s * t < B}
        else:                         # tid < s
            yield {t: (t, t + s) for t in range(s)}

def wavefronts(addrs):                # 뱅크별 서로 다른 주소 수의 최댓값
    banks = {}
    for a in addrs:
        banks.setdefault(a % 32, set()).add(a)
    return max(len(v) for v in banks.values())

def run(kind, data):
    sm, B = list(data), len(data)
    issued = diverged = waves = 0
    for act in steps(kind, B):
        for w in range(B // 32):
            lanes = [act[t] for t in range(32 * w, 32 * w + 32) if t in act]
            if not lanes:
                continue              # 워프 전체가 쉬면 발행하지 않는다
            issued += 1
            diverged += len(lanes) < 32
            for k in (0, 1, 0):       # a 읽기, b 읽기, a 쓰기
                waves += wavefronts([l[k] for l in lanes])
        for a, b in act.values():
            sm[a] += sm[b]
    return sm[0], issued, diverged, waves

rng = random.Random(9)
data = [rng.randrange(1000) for _ in range(256)]
print("정답", sum(data))
for kind in ("갈림", "보폭", "순차"):
    total, iss, div, wav = run(kind, data)
    print(f"{kind}: 합 {total}, 발행 {iss}, 갈린 워프 {div}, 처리 {wav}")
```
```text
정답 123830
갈림: 합 123830, 발행 47, 갈린 워프 47, 처리 141
보폭: 합 123830, 발행 12, 갈린 워프 5, 처리 141
순차: 합 123830, 발행 12, 갈린 워프 5, 처리 36
```

세 방식 모두 합은 정답과 같다. 갈림 방식은 첫 단계부터 짝수 스레드만 일해 워프 8개가 모두 반쪽으로 발행되고, 활성 레인이 여러 워프에 흩어져 발행이 47번이다. 보폭 방식은 활성 스레드를 앞쪽 워프에 몰아 발행을 12번으로 줄였지만, 주소 간격이 2s라 같은 뱅크에 여러 주소가 몰려(첫 단계 2-way, 셋째 단계 8-way) 공유 메모리 처리가 여전히 141번이다. 순차 방식은 연속한 스레드가 연속한 주소를 읽어 충돌이 없으므로 발행 12번에 처리 36번(= 12 × 3)이다. 그래도 마지막 다섯 단계(s ≤ 16)는 갈린 워프다.

아래 CUDA 코드는 순차 방식에 해리스의 커널 4(읽으면서 첫 덧셈을 해 블록 수를 절반으로)를 더한 것이다. GPU와 nvcc가 없는 컨테이너라 직접 실행하지 않은 읽기용이다.
```cuda
__global__ void reduce_seq(const float* in, float* partial, int n) {
    extern __shared__ float sm[];              // blockDim.x개
    unsigned t = threadIdx.x;
    unsigned i = blockIdx.x * blockDim.x * 2 + t;
    float v = (i < n) ? in[i] : 0.0f;          // 읽으면서 첫 덧셈
    if (i + blockDim.x < n) v += in[i + blockDim.x];
    sm[t] = v;
    __syncthreads();
    for (unsigned s = blockDim.x / 2; s > 0; s >>= 1) {
        if (t < s) sm[t] += sm[t + s];         // 앞쪽 스레드만 일한다
        __syncthreads();
    }
    if (t == 0) partial[blockIdx.x] = sm[0];   // 블록 합
}
// reduce_seq<<<blocks, 256, 256 * sizeof(float)>>>(d_in, d_partial, n);
```

## 워프 셔플: 공유 메모리를 거치지 않는 합
워프의 32개 레인은 한 명령으로 함께 움직이므로, 마지막 다섯 단계는 공유 메모리와 `__syncthreads()` 없이 레지스터끼리 값을 주고받으면 된다. `__shfl_down_sync(mask, v, off)`는 레인 i가 레인 i + off의 `v`를 받아 오는 명령이다. i + off가 32 이상이면 자기 값을 그대로 받는다. `mask`는 참여하는 레인의 비트 집합이고, 워프 전체가 참여하면 `0xffffffff`다.
```cuda
__inline__ __device__ float warp_sum(float v) {
    for (int off = 16; off > 0; off /= 2)
        v += __shfl_down_sync(0xffffffff, v, off);
    return v;                                  // 레인 0에 워프 합
}
```

앞 코드에 이어서, 셔플의 의미를 그대로 파이썬으로 옮겨 레인 0에 합이 모이는지 확인한다.
```python
def shfl_down(v, off):               # __shfl_down_sync(0xffffffff, v, off)
    return [v[i + off] if i + off < 32 else v[i] for i in range(32)]

def warp_sum(v):
    for off in (16, 8, 4, 2, 1):
        v = [a + b for a, b in zip(v, shfl_down(v, off))]
    return v                         # 레인 0에 워프 합

lanes = warp_sum(list(range(32)))
print("레인 0:", lanes[0], "/ 정답", sum(range(32)), "/ 레인 31:", lanes[31])
ok = all(warp_sum(w)[0] == sum(w) for w in
         ([rng.randrange(-10**6, 10**6) for _ in range(32)]
          for _ in range(300)))
print("무작위 워프 300개, 레인 0 = 합:", ok)
```
```text
레인 0: 496 / 정답 496 / 레인 31: 992
무작위 워프 300개, 레인 0 = 합: True
```

레인 0만 정답이고 나머지 레인에는 쓸모없는 값이 남는다(레인 31은 자기 값을 다섯 번 두 배로 만들어 992). 정수라면 계산 능력 8.0 이상에서 `__reduce_add_sync`가 워프 합을 명령 하나로 구한다.

## 블록 결과 모으기
블록 전체를 셔플로 합치면, 각 워프가 셔플로 합을 내고 레인 0이 그 합을 공유 메모리에 쓰며, 첫 워프가 이를 다시 셔플로 합쳐 `atomicAdd`로 전역 합에 더한다. 스레드마다 그리드 보폭 루프로 원소 여러 개를 먼저 더해 두면(해리스의 커널 7) 블록 수를 SM 수의 몇 배 정도로 줄일 수 있다.
```cuda
// blockDim.x는 32의 배수라고 가정한다
__global__ void reduce_sum(const float* x, float* out, int n) {
    __shared__ float warp_sums[32];            // 블록당 워프 최대 32개
    float v = 0.0f;
    for (int i = blockIdx.x * blockDim.x + threadIdx.x; i < n;
         i += gridDim.x * blockDim.x)          // 그리드 보폭 루프
        v += x[i];
    v = warp_sum(v);
    int lane = threadIdx.x % 32, warp = threadIdx.x / 32;
    if (lane == 0) warp_sums[warp] = v;
    __syncthreads();                           // 장벽은 이것 하나
    if (warp == 0) {
        v = (lane < blockDim.x / 32) ? warp_sums[lane] : 0.0f;
        v = warp_sum(v);
        if (lane == 0) atomicAdd(out, v);      // *out은 0으로 시작
    }
}
```

256스레드 블록이면 공유 메모리 접근은 워프 합 8개 쓰기와 한 번 읽기뿐이다. 앞 코드에 이어서, 이 커널을 옮겨 정수 합을 대조하고 FP32 원자적 덧셈의 순서 문제를 본다.
```python
import struct
from math import fsum

def reduce_grid(x, grid, block):     # 위 CUDA 커널을 옮긴 모델
    partials = []
    for b in range(grid):
        v = [0] * block
        for t in range(block):       # 그리드 보폭 루프
            for i in range(b * block + t, len(x), grid * block):
                v[t] += x[i]
        sums = [warp_sum(v[w:w + 32])[0] for w in range(0, block, 32)]
        partials.append(warp_sum(sums + [0] * (32 - len(sums)))[0])
    return sum(partials), partials   # atomicAdd를 블록 수만큼

x = [rng.randrange(-1000, 1000) for _ in range(100_000)]
tot, parts = reduce_grid(x, grid=8, block=256)
print("합:", tot, "/ 정답:", sum(x), "/ atomicAdd", len(parts), "번")

f32 = lambda v: struct.unpack("f", struct.pack("f", v))[0]
blocks = [f32(rng.uniform(0, 1000)) for _ in range(512)]  # 블록 합 512개
results = set()
for _ in range(100):                 # 블록이 끝나는 순서는 실행마다 다르다
    acc = 0.0
    for p in rng.sample(blocks, len(blocks)):
        acc = f32(acc + p)           # FP32 atomicAdd
    results.add(acc)
print(f"순서 100가지 → 다른 결과 {len(results)}개,",
      f"폭 {max(results) - min(results):g}, 정확한 합 {fsum(blocks):.3f}")
```
```text
합: 41904 / 정답: 41904 / atomicAdd 8 번
순서 100가지 → 다른 결과 18개, 폭 0.3125, 정확한 합 251564.104
```

정수 합은 정답과 같다. 부동소수점 덧셈은 결합 법칙이 성립하지 않으므로, 블록이 끝나는 순서에 따라 원자적 덧셈의 결과가 마지막 몇 비트씩 달라진다. 매번 같은 결과가 필요하면 블록 합을 배열에 쓰고 두 번째 커널(블록 하나)이 고정된 순서로 합친다. 직접 짜기보다 CUB의 `cub::DeviceReduce::Sum`이나 `thrust::reduce`를 먼저 쓰는 것이 보통이다.

## 숫자로 보기
해리스 자료의 측정은 G80(지포스 8800 GTX, 이론 대역폭 86.4GB/s)에서 정수 4M개(2²²)를 합한 것이다.

| 커널 | 대역폭 | 바뀐 점 |
|---|---|---|
| 1 | 약 2.1GB/s | 갈림 |
| 2 | 4.854GB/s | 보폭 주소 |
| 3 | 9.741GB/s | 순차 주소 |
| 5 | 31.289GB/s | 마지막 워프 펼치기 |

- 커널 1의 값은 커널 5의 누적 속도 향상 15.01배에서 거꾸로 계산했다. 마지막 커널 7은 첫 커널보다 약 30배 빠르다.
- H100 SXM5(HBM3 3.35TB/s)에서 FP32 2²⁸개(1.07GB)의 합은 읽기만으로 최소 약 0.32ms다.

## 어디에 쓰이나
- 신경망 레이어 7편 「정규화 층: LayerNorm에서 RMSNorm까지」: 행마다 평균과 분산(RMSNorm은 제곱 평균)을 구하는 리덕션이 들어 있고, 한 행을 블록 하나가 워프 셔플로 합치는 구현이 흔하다.
- 어텐션 7편 「플래시 어텐션: 메모리 계층을 아는 정확한 어텐션」: softmax의 행 최댓값과 지수 합이 리덕션이고, 온라인 소프트맥스의 (m, ℓ) 병합도 결합 법칙을 만족해 같은 트리로 합칠 수 있다.
- 고급 자료 구조 3편 「세그먼트 트리: 구간 질의와 점 갱신」: 리덕션 트리의 단계별 부분합을 버리지 않고 저장하면 세그먼트 트리가 된다.

## 정리
- 리덕션은 FP32 기준 0.25 FLOP/바이트라 메모리 대역폭이 한계이고, 목표는 읽기 대역폭을 다 쓰는 것이다.
- 같은 트리라도 갈림 방식은 워프 발행 47번, 보폭 방식은 뱅크 충돌로 공유 메모리 처리 141번, 순차 방식은 12번·36번이었다.
- `__shfl_down_sync`로 워프 안 다섯 단계를 레지스터끼리 끝내면 공유 메모리 접근과 장벽이 거의 사라진다.
- FP32 원자적 덧셈은 순서에 따라 결과가 달라지므로, 재현성이 필요하면 두 번째 커널로 고정된 순서로 합친다.

## 더 알아보기
- 이전 글: 8편 「점유율과 지연 숨기기: 레지스터와 공유 메모리가 동시 워프 수를 정한다」
- 다음 글: 10편 「행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지」
- 해리스의 리덕션 자료: https://developer.download.nvidia.com/compute/cuda/1.1-Beta/x86_website/projects/reduction/doc/reduction.pdf
