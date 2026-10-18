# [GPU와 CUDA 10/14] 행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지

> **한 줄 요약** — 행렬 곱의 단순 커널은 같은 원소를 수천 번 다시 읽어 산술 강도가 0.25 FLOP/바이트에 머물고, 공유 메모리 타일링은 전역 메모리 읽기를 타일 폭만큼, 스레드당 여러 출력을 레지스터에 두는 레지스터 블로킹은 공유 메모리 읽기까지 줄여 커널을 메모리 한계에서 계산 한계로 옮긴다.

## 이 글에서 다루는 것
- 단순 커널의 전역 메모리 접근 수와 산술 강도
- 공유 메모리 타일링: 타일 하나를 블록 전체가 재사용
- 레지스터 블로킹: 스레드당 TM×TN 출력과 외적
- 파이썬으로 버전별 전역·공유 메모리 접근 수 세기와 결과 대조, 4096³의 HBM 트래픽

## 단순 커널: 원소 하나에 읽기 2K번
C = AB(M×K와 K×N)의 원소 C[i][j]는 A의 i행과 B의 j열의 내적이다(선형대수 3편 「행렬과 행렬 곱」). 가장 쉬운 CUDA 커널은 스레드 하나가 C 원소 하나를 맡아 A 원소 K개와 B 원소 K개를 읽는다. FMA 하나(2 FLOP)마다 FP32 두 개(8바이트)를 읽으니 **산술 강도**(arithmetic intensity)는 0.25 FLOP/바이트다. 그런데 A의 한 행은 C의 같은 행을 계산하는 N개 스레드가 모두 따로 읽는다. 전체 전역 메모리 읽기는 2·M·N·K번으로, 행렬마다 한 번씩만 읽으면 되는 양(M·K + K·N)보다 수천 배 많다. 캐시가 일부를 걸러 주지만, 재사용을 프로그래머가 설계해야 하는 이유가 여기 있다.

## 공유 메모리 타일링
블록 하나가 C의 T×T 타일을 맡는다. K 방향을 T씩 잘라, 단계마다 A의 T×T 타일과 B의 T×T 타일을 블록의 스레드들이 나눠 공유 메모리에 한 번 올리고, 스레드마다 그 타일로 부분 내적 T개를 더한다. 전역에서 읽은 원소 하나를 블록 안 T개 스레드가 쓰므로 전역 읽기가 2·M·N·K/T로 준다.
```text
      K tiles ->
    ┌────┬────┬────┐   ┌────┐
 A  │ a0 │ a1 │ a2 │ x │ b0 │
    └────┴────┴────┘   ├────┤
                       │ b1 │
 C tile = a0·b0        ├────┤
   + a1·b1 + a2·b2     │ b2 │ B
                       └────┘
```

아래 CUDA 코드는 GPU와 nvcc가 없는 컨테이너라 직접 실행하지 않은 읽기용이다. n은 T의 배수라고 가정했다.
```cuda
#define T 32
__global__ void sgemm_tiled(int n, const float* A, const float* B, float* C) {
    __shared__ float As[T][T], Bs[T][T];
    int row = blockIdx.y * T + threadIdx.y;
    int col = blockIdx.x * T + threadIdx.x;
    float acc = 0.0f;
    for (int kt = 0; kt < n; kt += T) {
        As[threadIdx.y][threadIdx.x] = A[row * n + kt + threadIdx.x];
        Bs[threadIdx.y][threadIdx.x] = B[(kt + threadIdx.y) * n + col];
        __syncthreads();                     // 타일이 다 올라올 때까지
        for (int k = 0; k < T; ++k)
            acc += As[threadIdx.y][k] * Bs[k][threadIdx.x];
        __syncthreads();                     // 다 쓰기 전에 덮어쓰지 않게
    }
    C[row * n + col] = acc;
}
// dim3 block(T, T), grid(n / T, n / T);
```

워프의 32개 스레드는 `threadIdx.x`만 다르므로 A·B 타일을 읽는 전역 접근이 연속 주소로 병합되고(6편 「메모리 병합: 전역 메모리를 32바이트 섹터로 읽기」), 내적 루프에서 `As[threadIdx.y][k]`는 워프 전체가 같은 주소라 방송, `Bs[k][threadIdx.x]`는 연속 주소라 뱅크 충돌이 없다(7편 「공유 메모리와 뱅크 충돌: 32개 뱅크를 동시에 쓰기」).

## 레지스터 블로킹: 공유 메모리도 아끼기
타일링 커널은 전역 읽기를 32분의 1로 줄였지만 FMA 하나마다 공유 메모리를 두 번 읽는다. H100 SM은 클록당 FP32 FMA 128개를 할 수 있는데, 공유 메모리는 클록당 128바이트(뱅크 32개 × 4바이트), 즉 워프 명령 하나 분량만 내준다. FMA 워프 명령 4개(128개)마다 공유 메모리 읽기 명령이 8개 필요하니 계산 장치의 8분의 1밖에 못 쓴다.

**레지스터 블로킹**(register blocking)은 블록 타일을 BM×BN으로 키우고, 스레드 하나가 C의 TM×TN개를 레지스터에 들고 계산한다. k마다 A 열에서 TM개, B 행에서 TN개를 레지스터로 올린 뒤 그 외적으로 FMA TM×TN개를 한다. TM = TN = 8이면 공유 메모리 읽기 16번으로 FMA 64번, FMA당 0.25번이다. 전역 읽기도 블록 타일이 커진 만큼 M·N·K·(1/BM + 1/BN)으로 준다. 8편 「점유율과 지연 숨기기: 레지스터와 공유 메모리가 동시 워프 수를 정한다」에서 본 대로 스레드당 레지스터가 늘어 점유율은 낮아지지만, 서로 독립인 FMA 64개가 지연을 숨긴다.
```cuda
float acc[TM][TN] = {};                      // 스레드당 출력은 레지스터에
for (int k = 0; k < BK; ++k) {
    float a[TM], b[TN];
    #pragma unroll
    for (int r = 0; r < TM; ++r) a[r] = As[k][ty * TM + r];  // As는 전치해 둠
    #pragma unroll
    for (int c = 0; c < TN; ++c) b[c] = Bs[k][tx * TN + c];
    #pragma unroll
    for (int r = 0; r < TM; ++r)
        #pragma unroll
        for (int c = 0; c < TN; ++c)
            acc[r][c] += a[r] * b[c];          // 외적: FMA TM×TN개
}
```

배열 인덱스가 컴파일 시간에 정해지도록 루프를 모두 펼쳐야 `acc`가 레지스터에 남는다. 펼쳐지지 않으면 배열이 로컬 메모리로 밀려난다.

## 파이썬으로 세어 보기
세 버전을 64×64×64 정수 행렬로 그대로 옮겨, 결과가 정의대로 계산한 정답과 같은지 확인하고 전역·공유 메모리 원소 접근 수를 세어 공식과 비교한다. 병렬 실행 순서는 개수에 영향이 없으므로 차례로 돈다.
```python
import random

rng = random.Random(10)
M = N = K = 64
A = [[rng.randrange(-9, 10) for _ in range(K)] for _ in range(M)]
B = [[rng.randrange(-9, 10) for _ in range(N)] for _ in range(K)]
REF = [[sum(A[i][k] * B[k][j] for k in range(K)) for j in range(N)]
       for i in range(M)]

def naive():                          # 스레드 하나 = C 원소 하나
    C, g = [[0] * N for _ in range(M)], 0
    for i in range(M):
        for j in range(N):
            for k in range(K):
                C[i][j] += A[i][k] * B[k][j]; g += 2   # 전역에서 둘
    return C, g, 0

def blocked(BM, BN, BK, TM, TN):      # 블록 BM×BN, 스레드 TM×TN
    C, g, s = [[0] * N for _ in range(M)], 0, 0
    for bi in range(0, M, BM):
        for bj in range(0, N, BN):
            for kt in range(0, K, BK):
                As = [A[bi + r][kt:kt + BK] for r in range(BM)]
                Bs = [B[kt + r][bj:bj + BN] for r in range(BK)]
                g += BM * BK + BK * BN             # 타일을 한 번씩
                for ti in range(0, BM, TM):        # 스레드마다
                    for tj in range(0, BN, TN):
                        for kk in range(BK):
                            a = [As[ti + r][kk] for r in range(TM)]
                            b = Bs[kk][tj:tj + TN]
                            s += TM + TN           # 공유 → 레지스터
                            for r in range(TM):
                                for c in range(TN):
                                    C[bi + ti + r][bj + tj + c] += a[r] * b[c]
    return C, g, s

V = M * N * K
runs = [("단순", naive(), 2 * V, 0),
        ("타일 16", blocked(16, 16, 16, 1, 1), 2 * V // 16, 2 * V),
        ("레지스터 32·4×4", blocked(32, 32, 8, 4, 4),
         V // 32 + V // 32, V // 4 + V // 4)]
for name, (C, g, s), g_f, s_f in runs:
    print(f"{name}: 정답 {C == REF}, 전역 {g}, 공유 {s},",
          f"공식 일치 {(g, s) == (g_f, s_f)}")
```
```text
단순: 정답 True, 전역 524288, 공유 0, 공식 일치 True
타일 16: 정답 True, 전역 32768, 공유 524288, 공식 일치 True
레지스터 32·4×4: 정답 True, 전역 16384, 공유 131072, 공식 일치 True
```

타일링은 스레드당 출력이 1×1인 블로킹이라 같은 함수로 센다. 세 버전 모두 정답과 같고, 전역 읽기는 524,288 → 32,768(1/16) → 16,384(1/32)로, 공유 메모리 읽기는 레지스터 블로킹에서 다시 4분의 1로 줄었다. 앞 코드에 이어서, 같은 공식으로 4096³ FP32 곱의 HBM 트래픽을 H100 SXM5 기준으로 계산한다. 캐시가 없다고 칠 때의 상한이다.
```python
n, peak, bw = 4096, 67e12, 3.35e12   # H100 SXM5: FP32 FLOP/s, HBM3 B/s
flops = 2 * n**3
for name, words in [("단순", 2 * n**3), ("타일 32", 2 * n**3 // 32),
                    ("블록 128×128", 2 * n**3 // 128)]:
    byte = 4 * words
    print(f"{name}: 강도 {flops / byte:g}, {byte / 1e9:.1f}GB,",
          f"메모리 {byte / bw * 1e3:.2f}ms / 계산 {flops / peak * 1e3:.2f}ms")
print(f"능선 {peak / bw:.1f} FLOP/B, 최소 트래픽 {12 * n * n / 1e9:.2f}GB")
```
```text
단순: 강도 0.25, 549.8GB, 메모리 164.11ms / 계산 2.05ms
타일 32: 강도 8, 17.2GB, 메모리 5.13ms / 계산 2.05ms
블록 128×128: 강도 32, 4.3GB, 메모리 1.28ms / 계산 2.05ms
능선 20.0 FLOP/B, 최소 트래픽 0.20GB
```

단순 커널은 계산에 2ms면 될 일을 메모리 때문에 164ms 걸린다. 타일 32로 강도가 8이 되어도 아직 메모리가 한계이고, 블록 타일 128×128에서 강도 32가 능선(약 20)을 넘어 계산이 한계가 된다. 실제로는 L2(H100은 50MB)가 재사용을 더 거르므로 HBM 트래픽은 이보다 적다.

## cuBLAS는 무엇을 더 하나
cuBLAS와 오픈 소스 CUTLASS는 여기서 몇 걸음 더 간다. 스레드 위에 워프 단위 타일을 한 층 더 두고, 다음 k 타일을 미리 불러오는 이중 버퍼링으로 복사와 계산을 겹치며(Ampere의 `cp.async`, Hopper의 TMA), 뱅크 충돌을 피하도록 공유 메모리 배치를 뒤섞고, 행렬 크기마다 타일 모양을 골라 둔다. 가장 큰 차이는 11편 「텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을」의 텐서 코어다. 직접 짠 FP32 커널이 cuBLAS를 이기기는 어렵고, 이 글의 목적은 그 안에서 무슨 일이 일어나는지 읽을 수 있게 되는 것이다.

## 숫자로 보기
| 버전 | 산술 강도 | 4096³ HBM 트래픽 |
|---|---|---|
| 단순 | 0.25 FLOP/B | 549.8GB |
| 타일 32 | 8 FLOP/B | 17.2GB |
| 블록 128×128 | 32 FLOP/B | 4.3GB |

- H100 SXM5 기준: FP32(텐서 코어 아님) 67TFLOPS, HBM3 3.35TB/s, 능선 약 20 FLOP/바이트, SM당 클록당 FP32 FMA 128개, 공유 메모리 대역폭 클록당 128바이트(뱅크 32개 × 4바이트).
- 최소 트래픽(세 행렬을 한 번씩): 4096³에서 0.20GB.

## 어디에 쓰이나
- 메모리 시스템 4편 「캐시를 아는 코드: 접근 순서, 블로킹, 프리페치」: CPU 캐시 블로킹과 같은 원리이고, GPU에서는 공유 메모리와 레지스터라는 층을 프로그래머가 직접 관리한다.
- 신경망 레이어 1편 「선형 층: 모든 신경망의 기본 부품」: 배치 입력에 대한 선형 층이 곧 행렬 곱이라, 학습·추론 시간 대부분이 이 커널에서 쓰인다.
- 13편 「루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가」: 버전마다 달라진 산술 강도가 루프라인 위의 위치를 정한다.

## 정리
- 단순 커널은 FMA마다 전역에서 두 번 읽어 산술 강도 0.25 FLOP/바이트, 4096³에서 HBM 트래픽 550GB였다.
- 공유 메모리 타일링은 전역 읽기를 타일 폭 T만큼 줄이고, 레지스터 블로킹은 공유 메모리 읽기까지 FMA당 0.25번으로 줄인다.
- 시뮬레이션의 접근 수는 2MNK, 2MNK/T, MNK(1/BM + 1/BN) 공식과 정확히 일치했고 결과도 정답과 같았다.
- 블록 타일 128×128의 강도 32가 H100 FP32 능선(약 20)을 넘으면서 커널이 계산 한계로 넘어간다.

## 더 알아보기
- 이전 글: 9편 「병렬 리덕션과 워프 셔플: 수백만 개를 합 하나로」
- 다음 글: 11편 「텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을」
