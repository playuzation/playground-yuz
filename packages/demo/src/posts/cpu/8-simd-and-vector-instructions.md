# [CPU 마이크로아키텍처 8/12] SIMD와 벡터 명령어: SSE에서 AVX-512, NEON, SVE까지

> **한 줄 요약** — 해독·스케줄·포트가 사이클당 처리할 수 있는 명령어 수는 늘리기 어려우므로, 레지스터 하나에 값 여러 개(레인)를 담아 명령어 하나로 함께 계산하는 SIMD가 같은 프런트엔드로 몇 배의 일을 하며, 남는 원소는 꼬리 루프나 마스크로 처리하고, 별칭과 루프 간 의존이 있으면 컴파일러가 벡터화를 포기한다.

## 이 글에서 다루는 것
- 레인과 벡터 레지스터: SSE·AVX·AVX-512의 폭, ARM NEON과 길이 가변 SVE
- 꼬리 처리: 스칼라 꼬리 대 마스크, 레인 실행 모델로 명령 수 세기
- C의 SSE2 인트린직 예제(컨테이너에서 실행): 벡터 루프, 꼬리, 비교 마스크
- 정렬, 그리고 gcc 자동 벡터화가 실패하는 경우(별칭, 의존)

## 명령어 하나에 값 여러 개
7편에서 본 백엔드는 포트가 8개 남짓이고, 앞단의 해독(6편)과 이름 바꾸기도 사이클당 몇 개 수준이다. 이 폭을 두 배로 늘리려면 해독기, 이름 바꾸기, 스케줄러, 포트가 모두 커져야 해서 비싸다. 대신 명령어 하나가 다루는 데이터를 늘리면 된다. 128비트 레지스터에 32비트 실수 4개를 담고 덧셈 하나로 네 쌍을 더하는 것이 **SIMD**(single instruction, multiple data)다. 값 하나가 들어가는 칸을 **레인**(lane)이라 부른다. 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」에서 개요로 본 내용을 여기서는 명령어와 코드 수준에서 본다.
```text
       lane0 lane1 lane2 lane3
xmm0    1.0   2.0   3.0   4.0
xmm1   10.0  20.0  30.0  40.0
         +     +     +     +
xmm0   11.0  22.0  33.0  44.0

addps %xmm1, %xmm0   (1 instr)
```
레인 사이에는 자리올림 같은 연결이 없다. ALU를 4벌 나란히 놓고 제어를 하나로 묶은 셈이라, 해독·스케줄 비용은 명령어 하나분인데 계산은 네 배다.

## x86과 ARM의 벡터 확장
x86은 폭을 두 배씩 늘려 왔다. **SSE**(1999, 펜티엄 III)는 128비트 XMM 레지스터를, SSE2는 같은 레지스터에 double과 정수를 넣었고, x86-64는 SSE2를 기본으로 포함해 XMM이 16개다. **AVX**(2011, Sandy Bridge)는 256비트 YMM, AVX2(2013, Haswell)는 정수 연산까지 256비트로 넓혔다. **AVX-512**는 2016년 Xeon Phi(Knights Landing), 일반 CPU로는 2017년 Skylake 서버에서 시작했고 512비트 ZMM을 32개로 늘리면서 **마스크 레지스터** k0~k7을 더했다. 마스크의 비트 하나가 레인 하나의 실행 여부를 정한다.

ARM의 **NEON**(Advanced SIMD)은 128비트 고정이고 AArch64에서 레지스터가 32개다. **SVE**(Scalable Vector Extension)는 폭을 ISA에 박지 않았다. 구현이 128비트의 배수로 최대 2048비트까지 고를 수 있고, 코드는 "이번에 몇 레인인가"를 실행 중에 묻는 **길이 가변**(vector-length agnostic) 방식으로 짠다. 그래서 같은 바이너리가 512비트인 후지쯔 A64FX, 256비트인 AWS Graviton3, 128비트인 엔비디아 Grace에서 다시 컴파일 없이 돈다. 레인 단위의 술어(predicate) 레지스터가 AVX-512의 마스크와 같은 역할을 한다.

x86은 폭을 늘릴 때마다 새 명령어가 필요했고, 그래서 라이브러리는 SSE2·AVX2·AVX-512용 함수를 따로 두고 실행 중에 CPU를 확인해 고른다.

## 꼬리와 마스크
원소 수가 레인 수의 배수가 아니면 끝에 **꼬리**(tail)가 남는다. SSE처럼 마스크가 없으면 꼬리를 스칼라 루프로 하나씩 처리하고, AVX-512·SVE처럼 마스크가 있으면 마지막 한 번을 "앞쪽 레인만 켜고" 실행한다. `y = a·x + y`(saxpy)를 레인 단위 모델로 돌려 명령 수를 세어 본다.
```python
import random

def saxpy(a, x, y, W, masked):
    """W레인 벡터 기계로 y = a*x + y. 실행한 명령 횟수도 센다."""
    y, n, i, vec, scalar = y[:], len(x), 0, 0, 0
    while i + W <= n or (masked and i < n):
        mask = [i + l < n for l in range(W)]   # SVE whilelt 같은 술어
        for l in range(W):                     # W레인이 한꺼번에
            if mask[l]:
                y[i + l] = a * x[i + l] + y[i + l]
        i, vec = i + W, vec + 1
    while i < n:                               # 마스크 없으면 꼬리
        y[i] = a * x[i] + y[i]
        i, scalar = i + 1, scalar + 1
    return y, vec, scalar

n = 1003
x = [float(i % 7) for i in range(n)]
y = [1.0] * n
for W, name, masked in ((4, "SSE", False), (8, "AVX", False),
                        (16, "AVX-512", False), (16, "AVX-512", True)):
    _, v, s = saxpy(2.0, x, y, W, masked)
    used = n / ((v + s) * W)                   # 명령 슬롯 중 쓴 레인
    kind = "마스크" if masked else "꼬리"
    print(f"{name} {kind}: 벡터 {v} + 스칼라 {s}, 레인 {used:.1%}")
```
```text
SSE 꼬리: 벡터 250 + 스칼라 3, 레인 99.1%
AVX 꼬리: 벡터 125 + 스칼라 3, 레인 97.9%
AVX-512 꼬리: 벡터 62 + 스칼라 11, 레인 85.9%
AVX-512 마스크: 벡터 63 + 스칼라 0, 레인 99.5%
```

레인이 넓을수록 꼬리가 길어져(최대 W − 1개) 스칼라 꼬리의 손해가 커진다. 16레인에서 꼬리 11개를 스칼라로 돌리면 명령 73번 중 11번이 레인 하나만 쓴다. 마스크가 AVX-512와 SVE에 들어간 이유다. 앞 코드에 이어서, 무작위 입력으로 결과와 명령 수 공식(마스크는 `⌈n/W⌉`, 꼬리는 `n // W + n % W`)을 확인한다.
```python
rng = random.Random(8)
ok = 0
for _ in range(300):
    n, W = rng.randint(0, 200), rng.choice([4, 8, 16, 32, 64])
    masked = rng.random() < 0.5
    x = [rng.uniform(-9, 9) for _ in range(n)]
    y = [rng.uniform(-9, 9) for _ in range(n)]
    out, v, s = saxpy(1.5, x, y, W, masked)
    ref = [1.5 * a + b for a, b in zip(x, y)]
    want = (-(-n // W), 0) if masked else (n // W, n % W)
    ok += out == ref and (v, s) == want
print(f"무작위 300개(W = 4~64): 결과·명령 수 모두 맞음 {ok}개")
```
```text
무작위 300개(W = 4~64): 결과·명령 수 모두 맞음 300개
```
W를 4(128비트)에서 64(2048비트)까지 바꿔도 같은 함수가 같은 답을 낸다. SVE의 길이 가변 코드가 하는 일이 이것이다.

## C로 쓰는 SSE2 인트린직
**인트린직**(intrinsic)은 벡터 명령어 하나에 대응하는 C 함수다. `__m128`은 float 4개짜리 XMM 레지스터, `_mm_add_ps`는 `addps`다. 아래는 원소 10개의 saxpy를 벡터 두 번과 스칼라 꼬리 2개로 처리하고, 비교가 만든 마스크로 분기 없이 값을 고른다.
```c
#include <stdio.h>
#include <string.h>
#include <emmintrin.h>   /* SSE2: x86-64이면 늘 있다 */

#define N 10

int main(void) {
    float x[N], y[N], ref[N], a = 2.0f;
    for (int i = 0; i < N; i++) {
        x[i] = i - 4.5f;
        y[i] = 0.25f * i;
        ref[i] = a * x[i] + y[i];          /* 스칼라 기준 */
    }

    __m128 va = _mm_set1_ps(a);            /* 4레인 모두 a */
    int i = 0, vec = 0, tail = 0;
    for (; i + 4 <= N; i += 4, vec++) {    /* 한 번에 4개 */
        __m128 vx = _mm_loadu_ps(x + i);
        __m128 vy = _mm_loadu_ps(y + i);
        _mm_storeu_ps(y + i, _mm_add_ps(_mm_mul_ps(va, vx), vy));
    }
    for (; i < N; i++, tail++)             /* 꼬리는 스칼라로 */
        y[i] = a * x[i] + y[i];
    printf("vector iters %d, scalar tail %d\n", vec, tail);
    printf("same as scalar: %s\n",
           memcmp(y, ref, sizeof y) == 0 ? "yes" : "no");

    /* 마스크로 분기 없이: x > 0 ? x : 0.1x */
    __m128 vx = _mm_loadu_ps(x + 3);       /* -1.5 -0.5 0.5 1.5 */
    __m128 m = _mm_cmpgt_ps(vx, _mm_setzero_ps());
    __m128 small = _mm_mul_ps(vx, _mm_set1_ps(0.1f));
    __m128 r = _mm_or_ps(_mm_and_ps(m, vx), _mm_andnot_ps(m, small));
    unsigned mb[4];
    float rf[4];
    _mm_storeu_si128((__m128i *)mb, _mm_castps_si128(m));
    _mm_storeu_ps(rf, r);
    for (int k = 0; k < 4; k++)
        printf("lane %d: mask %08x -> %g\n", k, mb[k], rf[k]);
    return 0;
}
```
```text
vector iters 2, scalar tail 2
same as scalar: yes
lane 0: mask 00000000 -> -0.15
lane 1: mask 00000000 -> -0.05
lane 2: mask ffffffff -> 0.5
lane 3: mask ffffffff -> 1.5
```

비교 명령 `cmpps`는 참인 레인을 모든 비트 1(`ffffffff`)로, 거짓인 레인을 0으로 채운다. 이 마스크와 AND, AND-NOT, OR를 하면 레인마다 다른 쪽을 고를 수 있다. 레인들이 서로 다른 방향으로 분기할 수 없으니 양쪽을 다 계산하고 고르는 것이다. 3편의 조건부 이동과 같은 생각을 레인 단위로 한 셈이다.

**정렬**도 신경 쓸 부분이다. `_mm_load_ps`는 주소가 16바이트의 배수가 아니면 예외를 내고, `_mm_loadu_ps`는 아무 주소나 받는다. 최근 x86 코어에서 정렬되지 않은 적재는 캐시 라인(64바이트) 안이면 거의 같은 속도지만, 라인을 걸치면 두 줄을 읽어 느리다. 64바이트 벡터인 AVX-512는 정렬이 어긋나면 거의 매번 라인을 걸치므로 배열을 64바이트에 맞춰 할당한다.

## 자동 벡터화가 실패하는 경우
인트린직 없이 평범한 루프를 써도 컴파일러가 벡터화한다. 세 함수를 gcc 13.3 `-O3 -fopt-info-vec-all`(x86-64)로 컴파일한 보고에서 발췌했다(꼬리를 8바이트 벡터로 한 번 더 처리했다는 줄은 뺐다).
```c
void add(float *a, const float *b, const float *c, int n) {
    for (int i = 0; i < n; i++)
        a[i] = b[i] + c[i];
}
void add_r(float *restrict a, const float *restrict b,
           const float *restrict c, int n) {
    for (int i = 0; i < n; i++)
        a[i] = b[i] + c[i];
}
void prefix(float *a, int n) {
    for (int i = 1; i < n; i++)
        a[i] = a[i - 1] + a[i];
}
```
```console
vec.c:2:23: optimized: loop vectorized using 16 byte vectors
vec.c:2:23: optimized:  loop versioned for vectorization because of possible aliasing
vec.c:7:23: optimized: loop vectorized using 16 byte vectors
vec.c:11:23: missed: couldn't vectorize loop
```
- `add`: `a`가 `b`나 `c`와 겹칠 수 있다(**별칭**, aliasing). 겹치면 4개씩 한꺼번에 읽고 쓰는 것이 원래 순서와 다른 답을 낼 수 있어, gcc는 실행 중에 주소 범위를 검사해 벡터판과 스칼라판 중 하나를 고르는 코드를 만든다(loop versioning).
- `add_r`: `restrict`로 겹치지 않는다고 약속하면 검사 없이 바로 벡터화한다.
- `prefix`: `a[i]`가 바로 앞 반복의 결과 `a[i - 1]`을 쓴다. 자세한 덤프(`-fdump-tree-vect-details`)에는 "dependence distance = 1"과 "bad data dependence"가 찍힌다. 레인 4개를 동시에 계산할 수 없는 진짜 의존이라, 누적 합은 다른 알고리즘(로그 단계 스캔)으로 바꿔야 벡터화된다.

7편의 부동소수 합도 레인별 부분합이 더하는 순서를 바꾸므로 `-ffast-math` 없이는 벡터화되지 않는다. 벡터화를 원하면 `restrict`를 붙이고, 반복 사이 의존을 없애고, 필드별 배열로 연속 메모리를 만들고, 컴파일러 보고로 확인한다.

## 숫자로 보기
| 확장 | 레지스터(비트 × 개수) | 처음 나온 칩 |
|---|---|---|
| SSE | 128 × 16 | 펜티엄 III(1999) |
| AVX | 256 × 16 | Sandy Bridge(2011) |
| AVX-512 | 512 × 32 | Xeon Phi(2016) |
| NEON | 128 × 32 | Cortex-A8(ARMv7) |
| SVE | 128~2048 × 32 | A64FX(512비트) |

- 레지스터 개수는 x86-64·AArch64 기준이다. 32비트 x86의 SSE는 XMM이 8개, ARMv7의 NEON은 128비트 레지스터가 16개였다.
- 폭이 넓다고 늘 그만큼 빠르지는 않다. Skylake 서버 세대는 무거운 AVX-512 명령을 쓰면 코어 클록을 낮췄고, 인텔 Alder Lake 같은 소비자용 칩은 AVX-512를 끄고 냈다. 반대로 AMD Zen 4(2022)는 AVX-512를 지원한다. 같은 ISA 확장이라도 세대마다 지원과 속도가 다르다.

## 어디에 쓰이나
- GPU와 CUDA 3편 「SIMT와 워프: 32개 스레드가 함께 걷는 법」: 워프의 활성 마스크는 이 글의 레인 마스크와 같은 장치이고, 분기 갈림 때 양쪽을 모두 실행하는 것도 SSE의 비교·선택과 같다.
- 양자화 14편 「GGUF: 양자화 모델을 담는 파일과 k-quant」: llama.cpp 같은 CPU 추론 엔진은 양자화된 블록의 내적을 AVX2·AVX-512·NEON 인트린직으로 ISA마다 따로 구현해 둔다.
- 선형대수 12편 「텐서와 브로드캐스팅: 코드 속의 선형대수」: numpy의 원소별 연산은 연속 메모리 위의 SIMD 루프로 돌아가므로, 파이썬 반복문 대신 배열 연산을 쓰는 것이 레인을 채우는 방법이다.

## 정리
- SIMD는 레지스터 하나에 레인 여러 개를 담아, 해독·스케줄 비용 하나로 계산을 W배 한다.
- x86은 폭을 128→256→512비트로 늘리며 새 명령어를 더했고, ARM SVE는 폭을 구현에 맡기고 길이 가변 코드로 같은 바이너리를 돌린다.
- 레인 수의 배수가 아닌 꼬리는 스칼라 루프나 마스크로 처리하며, 레인이 넓을수록 마스크가 중요하다.
- 별칭과 반복 사이 의존은 자동 벡터화를 막는다. `restrict`, 의존 제거, 연속 배치, 컴파일러 보고 확인이 처방이다.

## 더 알아보기
- 이전 글: 7편 「실행 유닛과 포트: 지연 시간과 처리량은 다르다」
- 다음 글: 9편 「캐시 일관성: MESI 프로토콜과 거짓 공유」
- The ARM Scalable Vector Extension(Stephens 외, IEEE Micro 2017): https://arxiv.org/abs/1803.06185
