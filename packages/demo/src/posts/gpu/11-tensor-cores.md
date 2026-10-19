# [GPU와 CUDA 11/14] 텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을

> **한 줄 요약** — 텐서 코어는 명령 하나로 작은 행렬 곱-누적(MMA)을 통째로 처리해 FMA 하나마다 드는 발행·레지스터 읽기 비용을 수십 개의 FMA에 나눠 내는 장치이고, 입력은 FP16·BF16·TF32·FP8처럼 좁게 받되 누적은 FP32로 해서 속도와 정확도를 함께 얻는다.

## 이 글에서 다루는 것
- FP32 코어로 행렬 곱을 하면 무엇이 낭비되나
- 텐서 코어의 MMA 연산과 WMMA API(읽기용 예제)
- 입력 형식(FP16·BF16·TF32·FP8)과 FP32 누적
- numpy로 FP16 입력·FP32 누적의 오차를 FP32 계산과 비교

## FMA 하나에 명령 하나는 비싸다
10편 「행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지」의 레지스터 블로킹으로 메모리 병목을 치우면, 남는 한계는 FMA 명령 자체다. FP32 코어로는 FMA 하나마다 명령을 하나 발행하고 레지스터 세 개를 읽고 하나를 쓴다. 행렬 곱의 연산은 규칙적이라 이 제어 비용은 대부분 반복이다. **텐서 코어**(tensor core)는 `D = A × B + C`를 작은 타일 단위로 한 번에 계산하는 전용 회로다. 2017년 볼타(V100)에서 처음 나왔고, 텐서 코어 하나가 클록마다 4×4×4 FP16 행렬 곱-누적, 즉 FMA 64개를 했다. A100의 텐서 코어는 클록당 FP16 FMA 256개다.
```text
one MMA (warp-wide, 16x16x16)
 A 16x16    B 16x16    C 16x16
 FP16   x   FP16   +   FP32
            -> D 16x16 FP32
 = 4096 FMA, one instruction
```

SM당 처리량을 사양과 맞춰 보자. 부스트 클록, SM 수, SM당 클록당 FMA 수만으로 공식 사양의 TFLOPS가 나오는지 확인한다(파이썬 코드는 numpy를 쓰며 venv에서 실행했다).
```python
import numpy as np

# 이름: (SM 수, 부스트 GHz, SM당 FP32 FMA, SM당 텐서 FP16 FMA, 사양 둘)
gpus = {"V100": (80, 1.53, 64, 8 * 64, 15.7, 125),
        "A100": (108, 1.41, 64, 4 * 256, 19.5, 312)}
for name, (sm, ghz, f32, tc, s32, s16) in gpus.items():
    t32, t16 = (sm * x * 2 * ghz / 1e3 for x in (f32, tc))
    print(f"{name}: FP32 {t32:.1f}(사양 {s32}),",
          f"텐서 FP16 {t16:.1f}(사양 {s16}) TFLOPS, {tc // f32}배")
```
```text
V100: FP32 15.7(사양 15.7), 텐서 FP16 125.3(사양 125) TFLOPS, 8배
A100: FP32 19.5(사양 19.5), 텐서 FP16 311.9(사양 312) TFLOPS, 16배
```

계산이 사양과 맞는다. A100은 같은 SM에서 텐서 코어가 FP32 코어보다 클록당 16배 많은 곱셈-덧셈을 한다. 행렬 곱이 텐서 코어로 가느냐 마느냐가 성능을 한 자릿수 이상 가르는 이유다.

## WMMA API: 워프가 함께 부르는 행렬 곱
CUDA C++에서 텐서 코어를 직접 쓰는 가장 쉬운 길은 `<mma.h>`의 WMMA API다. **조각**(fragment)은 16×16 타일을 워프의 32개 스레드 레지스터에 나눠 담은 객체이고, 어느 원소가 어느 스레드에 있는지는 정해져 있지 않다. 모든 함수 이름에 `_sync`가 붙은 이유는 워프의 32개 스레드가 모두 함께 불러야 하기 때문이다. 아래 코드는 GPU와 nvcc가 없는 컨테이너라 직접 실행하지 않은 읽기용이고, M·N·K는 16의 배수라고 가정했다.
```cuda
#include <mma.h>
using namespace nvcuda;

// 워프 하나가 C의 16×16 타일 하나. A는 행 우선 M×K, B는 열 우선 K×N
__global__ void wmma_gemm(const half* A, const half* B, float* C,
                          int M, int N, int K) {
    int tm = (blockIdx.x * blockDim.x + threadIdx.x) / 32;   // 타일 행
    int tn = blockIdx.y * blockDim.y + threadIdx.y;          // 타일 열
    wmma::fragment<wmma::matrix_a, 16, 16, 16, half, wmma::row_major> a;
    wmma::fragment<wmma::matrix_b, 16, 16, 16, half, wmma::col_major> b;
    wmma::fragment<wmma::accumulator, 16, 16, 16, float> c;
    wmma::fill_fragment(c, 0.0f);
    for (int k = 0; k < K; k += 16) {
        wmma::load_matrix_sync(a, A + tm * 16 * K + k, K);   // 선행 차원 K
        wmma::load_matrix_sync(b, B + tn * 16 * K + k, K);
        wmma::mma_sync(c, a, b, c);          // c = a × b + c (FP32 누적)
    }
    wmma::store_matrix_sync(C + tm * 16 * N + tn * 16, c, N,
                            wmma::mem_row_major);
}
```

실전 커널은 여기에 10편의 공유 메모리 타일링과 이중 버퍼링을 얹는다. 호퍼(H100)는 워프 4개(128스레드)가 함께 내는 비동기 MMA(PTX의 `wgmma`)를 추가했는데, WMMA로는 이를 쓸 수 없어 cuBLAS·CUTLASS(그 위에 지은 FlashAttention-3 포함) 같은 라이브러리가 PTX 수준에서 쓴다.

## 입력은 좁게, 누적은 넓게
텐서 코어가 받는 입력 형식은 세대마다 늘었다. 비트 배치와 범위는 양자화 2편 「수 형식의 지도: FP32에서 FP4까지」에서 다뤘으니 핵심만 표로 옮긴다.

| 형식 | 지수·가수 비트 | 텐서 코어 도입 |
|---|---|---|
| FP16 | 5·10 | 볼타(2017) |
| BF16 | 8·7 | 암페어(2020) |
| TF32 | 8·10 | 암페어(2020) |
| FP8 E4M3·E5M2 | 4·3, 5·2 | 호퍼(2022) |

공통 원리는 **혼합 정밀도**(mixed precision)다. 좁은 입력끼리의 곱은 FP32로 정확히 표현되고(FP16의 유효 숫자는 숨은 비트까지 11비트라 곱이 22비트로, FP32의 24비트 안에 든다), 오차가 쌓이는 덧셈은 FP32 누산기에서 한다. 누산기까지 FP16이면 무슨 일이 생기는지 보자. 앞 코드에 이어서, 먼저 FP32 값을 가수 p비트로 반올림하는 함수를 비트 연산으로 만들고 numpy의 `float16` 변환과 대조한다. 이 함수로 numpy에 없는 BF16과 TF32도 흉내 낸다.
```python
def round_mant(x, p):
    """FP32 값을 가수 p비트로 반올림(최근접 짝수)"""
    u = np.asarray(x, np.float32).view(np.uint32).astype(np.uint64)
    drop = 23 - p
    if drop == 0:
        return np.asarray(x, np.float32)
    half = (1 << (drop - 1)) - 1 + ((u >> drop) & 1)   # 동률이면 짝수로
    u = ((u + half) >> drop) << drop
    return u.astype(np.uint32).view(np.float32)

rng = np.random.default_rng(11)
v = rng.normal(0, 100, 300).astype(np.float32)
same = np.array_equal(round_mant(v, 10), v.astype(np.float16).astype(np.float32))
print("가수 10비트 반올림 = np.float16 변환(무작위 300개):", same)

acc16, acc32 = np.float16(0), np.float32(0)
for _ in range(4096):
    acc16 = np.float16(acc16 + np.float16(1))
    acc32 = np.float32(acc32 + np.float32(1))
print("1을 4096번 더하기: FP16 누적", float(acc16), "/ FP32 누적", float(acc32))
```
```text
가수 10비트 반올림 = np.float16 변환(무작위 300개): True
1을 4096번 더하기: FP16 누적 2048.0 / FP32 누적 4096.0
```

FP16 누산기는 2048에서 멈춘다. 2048 근처에서 FP16의 간격이 2라서 2048 + 1이 짝수 쪽인 2048로 반올림되기 때문이다. 내적 길이 K가 수천인 행렬 곱에서 누적을 FP16으로 하면 이런 정체와 반올림 오차가 쌓인다. 앞 코드에 이어서, 입력 형식과 누산기 형식을 바꿔 64×64 결과의 상대 오차를 FP64 정답과 비교하고, FP32 누적 오차가 표준 상한 `K·u·Σ∣a∣∣b∣`(u = 2⁻²⁴) 안에 드는지도 확인한다.
```python
def matmul(A, B, p, acc):
    """입력은 가수 p비트, 곱은 정확히, 누적은 acc 형식으로 k 순서대로"""
    a, b = round_mant(A, p), round_mant(B, p)
    C = np.zeros((A.shape[0], B.shape[1]), acc)
    for k in range(A.shape[1]):
        prod = np.outer(a[:, k], b[k]).astype(np.float32)
        C = (C + prod.astype(acc)).astype(acc)
    return C.astype(np.float64)

def rel(C, ref):
    return np.linalg.norm(C - ref) / np.linalg.norm(ref)

for K in (256, 4096):
    A = rng.normal(size=(64, K)).astype(np.float32)
    B = rng.normal(size=(K, 64)).astype(np.float32)
    ref = A.astype(np.float64) @ B.astype(np.float64)
    runs = {"FP32": (23, np.float32), "TF32": (10, np.float32),
            "BF16": (7, np.float32), "FP16": (10, np.float32),
            "FP16(16)": (10, np.float16)}
    print(f"K={K}:", ", ".join(f"{k} {rel(matmul(A, B, *v), ref):.1e}"
                               for k, v in runs.items()))

a, b = (round_mant(X, 10).astype(np.float64) for X in (A, B))
bound = K * 2.0**-24 * (np.abs(a) @ np.abs(b))
print("FP32 누적 오차 ≤ 상한:", bool(np.all(
    np.abs(matmul(A, B, 10, np.float32) - a @ b) <= bound)))
```
```text
K=256: FP32 2.8e-07, TF32 3.0e-04, BF16 2.4e-03, FP16 3.0e-04, FP16(16) 2.4e-03
K=4096: FP32 1.1e-06, TF32 2.9e-04, BF16 2.3e-03, FP16 2.9e-04, FP16(16) 9.4e-03
FP32 누적 오차 ≤ 상한: True
```

괄호 없는 이름은 누산기가 FP32이고, `FP16(16)`만 누산기도 FP16이다. FP16·TF32 입력은 가수가 10비트로 같아 오차도 같다(차이는 지수 범위다). 오차는 대부분 입력 반올림에서 오고, K가 16배 커져도 3 × 10⁻⁴ 안팎에 머문다. BF16 입력은 가수가 7비트라 8배쯤 크다. 누산기까지 FP16이면 K = 4096에서 오차가 9.4 × 10⁻³으로, 같은 입력의 FP32 누적보다 30배 넘게 크고 K와 함께 자란다. 학습용 행렬 곱이 FP32 누적을 쓰는 이유다. 실제 하드웨어의 덧셈 순서와 내부 정밀도는 세대마다 다르므로 이 모델은 경향만 보여 준다.

## 소프트웨어에서 쓰는 법
- FP16으로 학습하면 작은 기울기가 0으로 사라지기 쉬워 손실에 큰 수를 곱했다가 되돌리는 손실 스케일링이 필요하다(미치키베시우스 외, 「Mixed Precision Training」, 2018). BF16은 FP32와 지수 범위가 같아 대개 필요 없다.
- PyTorch에서는 `torch.autocast`가 행렬 곱을 FP16·BF16으로 돌리고, FP32 텐서의 행렬 곱도 `torch.set_float32_matmul_precision("high")`로 TF32 텐서 코어에 보낼 수 있다.
- 텐서 코어 효율은 모양을 탄다. 행렬 차원이 8이나 16의 배수가 아니면 라이브러리가 패딩하거나 느린 경로로 간다.

## 숫자로 보기
| 제품 | FP32(일반) | FP16 텐서(밀집) |
|---|---|---|
| V100 | 15.7TFLOPS | 125TFLOPS |
| A100 | 19.5TFLOPS | 312TFLOPS |
| H100 SXM5 | 67TFLOPS | 989TFLOPS |

- H100 SXM5의 다른 텐서 형식(밀집, 희소성 미포함): TF32 495TFLOPS, FP8 1,979TFLOPS. 데이터시트의 더 큰 숫자는 2:4 희소성을 가정한 값이다.
- 텐서 코어 하나의 클록당 FP16 FMA: V100 64개(4×4×4), A100 256개. SM당 텐서 코어는 V100 8개, A100 4개.

## 어디에 쓰이나
- 양자화 12편 「KV 캐시·활성값·FP8: 추론과 학습의 저정밀화」: FP8 학습·추론은 호퍼 텐서 코어의 FP8 입력·넓은 누적 위에서 텐서별·블록별 스케일을 곱해 범위를 맞춘다.
- 어텐션 8편 「세이지 어텐션: 양자화로 더 빠르게」: QKᵀ를 INT8로(SageAttention2는 PV도 FP8로) 텐서 코어에 보내는 것이 속도의 원천이고, FP8 텐서 코어의 누적 정밀도가 표기보다 낮은 문제를 2단계 누적으로 보완한다.
- 13편 「루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가」: 텐서 코어는 계산 지붕을 15배쯤 높여, 같은 커널도 메모리 쪽으로 밀려나게 만든다.

## 정리
- 텐서 코어는 작은 행렬 곱-누적을 명령 하나로 처리해, A100에서 SM당 클록당 FP32 코어보다 16배 많은 FMA를 한다.
- WMMA API는 워프 단위 조각을 불러 `mma_sync`로 곱하고, 실전 라이브러리는 호퍼의 `wgmma` 같은 더 낮은 수준을 쓴다.
- 혼합 정밀도는 입력을 좁게, 누적을 FP32로 한다. FP16 누산기는 1을 4096번 더해도 2048에서 멈췄다.
- 64×64, K = 4096에서 FP16 입력·FP32 누적 오차는 2.9 × 10⁻⁴, 누산기까지 FP16이면 9.4 × 10⁻³이었다.

## 더 알아보기
- 이전 글: 10편 「행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지」
- 다음 글: 12편 「스트림과 비동기 실행: 복사와 계산을 겹치기」
