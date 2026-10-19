# [메모리 시스템 4/10] 캐시를 아는 코드: 접근 순서, 블로킹, 프리페치

> **한 줄 요약** — 같은 계산도 메모리를 걷는 순서에 따라 미스가 몇십 배 달라지므로, 안쪽 루프가 연속 주소를 걷게 루프를 바꾸고, 재사용이 많은 계산은 캐시에 들어가는 타일로 쪼개고(블로킹), 함께 쓰는 값끼리 모아 두며(SoA), 보폭이 일정한 접근은 하드웨어 프리페처에, 미리 아는 불규칙한 주소는 소프트웨어 프리페치에 맡긴다.

## 이 글에서 다루는 것
- 가져온 64바이트 중 몇 바이트를 쓰나: 공간 지역성의 효율
- 행렬 곱 루프 순서(ijk·ikj·jki)와 타일링의 미스 수, 결과 대조
- 구조체의 배열(AoS)과 배열의 구조체(SoA)
- 보폭 프리페처 모델과 소프트웨어 프리페치(`__builtin_prefetch`)

## 병목: 가져온 줄을 얼마나 쓰나
캐시는 8바이트를 원해도 64바이트 줄을 통째로 가져온다(2편). 그 줄에서 몇 바이트를 쓰고 버리는지가 **공간 지역성의 효율**이고, 쫓겨나기 전에 몇 번 다시 쓰는지가 **시간 지역성의 효율**이다. 행렬을 행 우선으로 훑으면 미스가 원소 8개에 1번, 열 우선으로 훑으면 원소마다 1번이라는 것은 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」에서 시뮬레이션했다. 이 글은 계산의 결과를 바꾸지 않고 순서만 바꿔 두 효율을 올리는 방법을 센다. 3편의 분류로 말하면 순서 바꾸기와 SoA는 공간 지역성을, 블로킹은 용량 미스를, 프리페치는 강제 미스의 대기를 겨냥한다.

## 행렬 곱: 루프 순서와 타일링
`C = A·B`의 세 겹 루프는 `C[i][j] += A[i][k] × B[k][j]`를 (i, k, j) 조합마다 한 번씩 하면 되므로 루프 여섯 가지 순서 모두 같은 답을 낸다. 그러나 안쪽 루프가 무엇이냐에 따라 걷는 방향이 다르다.
- **ijk**(안쪽 k): A는 행으로, B는 열로 걷는다.
- **ikj**(안쪽 j): B와 C를 모두 행으로 걷고 A[i][k]는 고정이다.
- **jki**(안쪽 i): A와 C를 모두 열로 걷는다.

**블로킹**(blocking, 타일링)은 여기서 한 걸음 더 간다. 행렬을 T×T 타일로 잘라 타일 세 개(A, B, C 하나씩)가 캐시에 함께 들어가게 하면, 타일 안에서는 원소마다 T번 재사용한다. 48×48 double 행렬(각 18KiB)을 2KiB 완전 연관 LRU 캐시로 돌려 미스를 세고, 곱 결과도 정의대로 계산한 값과 비교한다. 캐시를 실제 L1보다 훨씬 작게 잡아 작은 행렬로도 큰 행렬과 같은 현상이 나오게 했고, 충돌 미스는 빼고 용량만 보려고 완전 연관으로 두었다.
```python
import random
from collections import OrderedDict

class LRU:
    """완전 연관 LRU 캐시(64바이트 줄). 충돌을 빼고 용량만 본다"""
    def __init__(self, lines):
        self.c, self.cap = OrderedDict(), lines
        self.miss = self.fills = 0           # 요구 미스, 가져온 줄

    def load(self, addr, demand=True):
        b = addr >> 6
        if b in self.c:
            self.c.move_to_end(b)
            return
        self.miss += demand
        self.fills += 1
        self.c[b] = True
        if len(self.c) > self.cap:
            self.c.popitem(last=False)

n, T = 48, 8                              # double 48×48, 행 우선 저장
R, tiles = range(n), range(0, n, T)
A, B, C = 0, 8 * n * n, 16 * n * n        # 각 행렬의 시작 주소
at = lambda base, i, j: base + 8 * (i * n + j)
orders = {                                # 모두 (i, k, j)를 한 번씩
    "ijk": lambda: ((i, k, j) for i in R for j in R for k in R),
    "ikj": lambda: ((i, k, j) for i in R for k in R for j in R),
    "jki": lambda: ((i, k, j) for j in R for k in R for i in R),
    "타일": lambda: ((i, k, j) for ii in tiles for kk in tiles
                   for jj in tiles for i in range(ii, ii + T)
                   for k in range(kk, kk + T) for j in range(jj, jj + T)),
}
rng = random.Random(4)
Am = [[rng.randrange(10) for _ in R] for _ in R]
Bm = [[rng.randrange(10) for _ in R] for _ in R]
ref = [[sum(Am[i][k] * Bm[k][j] for k in R) for j in R] for i in R]
for name, it in orders.items():
    cache, Cm = LRU(32), [[0] * n for _ in R]   # 2KiB 캐시
    for i, k, j in it():
        cache.load(at(A, i, k))
        cache.load(at(B, k, j))
        cache.load(at(C, i, j))
        Cm[i][j] += Am[i][k] * Bm[k][j]
    print(f"{name}: 미스 {cache.miss:6}, 곱 결과 일치 {Cm == ref}")

for name, want in (("행 우선", n * n // 8), ("열 우선", n * n)):
    cache = LRU(32)
    for x in R:
        for y in R:
            i, j = (x, y) if name == "행 우선" else (y, x)
            cache.load(at(A, i, j))
    print(f"{name} 훑기 미스 {cache.miss}, 공식과 일치 {cache.miss == want}")
```
```text
ijk: 미스 124704, 곱 결과 일치 True
ikj: 미스  14400, 곱 결과 일치 True
jki: 미스 223488, 곱 결과 일치 True
타일: 미스   3744, 곱 결과 일치 True
행 우선 훑기 미스 288, 공식과 일치 True
열 우선 훑기 미스 2304, 공식과 일치 True
```
접근은 모두 3 × 48³ = 331,776번으로 같고 결과도 같다. 그런데 미스는 jki 223,488번, ijk 124,704번, ikj 14,400번, 8×8 타일 3,744번으로 60배 차이 난다. jki는 안쪽 루프가 A와 C 두 행렬을 열로 걸어 접근의 3분의 2가 미스이고, ijk는 B의 열 하나(48줄)가 캐시(32줄)에 안 들어가 B 접근이 매번 미스다. ikj는 B·C를 행으로 걸어 줄 하나를 8번 쓴다. 타일은 타일 세 개(24줄)가 캐시에 머무는 동안 원소마다 8번씩 재사용해 ikj보다 4배 적다. 마지막 두 줄은 시뮬레이터가 단순한 경우에 공식(n²/8과 n²)과 맞는지 본 것이다.

타일 크기는 `3 × T² × 원소 크기 ≤ 캐시 크기`로 어림하고, 실제로는 L1·L2용으로 두 단계 타일을 두거나 레지스터까지 쓰는 세 번째 단계를 더한다. OpenBLAS 같은 BLAS 라이브러리의 행렬 곱이 이 구조이고, GPU에서 공유 메모리 타일로 같은 일을 하는 것은 GPU와 CUDA 10편 「행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지」에서 다룬다.

## AoS와 SoA, 그리고 프리페치
입자 10만 개의 위치·속도·질량을 담는다고 하자. 구조체 하나에 double 8개(64바이트)를 담아 배열로 늘어놓는 것이 **AoS**(array of structures), 필드마다 배열 하나를 두는 것이 **SoA**(structure of arrays)다. x 좌표만 더하면 AoS는 줄 하나에서 8바이트만 쓰고 56바이트를 버린다.

**하드웨어 프리페처**(hardware prefetcher)는 요구가 오기 전에 줄을 가져온다. 아래 모델은 줄 간격이 두 번 연속 같으면 그 간격으로 4줄 앞까지 가져오되, 실제 인텔 프리페처처럼 4KiB 페이지를 넘지 않는다. 가상 주소의 다음 페이지가 물리적으로 어디인지 모르기 때문이다(7편). **소프트웨어 프리페치**는 프로그래머가 16번 뒤에 쓸 주소를 미리 요청하는 경우다. 프리페치가 제때 도착한다고 가정하고 **요구 미스**(코어가 기다린 미스)를 센다. 앞 코드에 이어서 실행한다.
```python
def run(addrs, hw=False, sw=0):
    """hw: 줄 간격이 두 번 같으면 그 간격으로 4줄 앞까지 미리 가져온다
    (4KiB 페이지를 넘지 않는다). sw: sw번 뒤의 주소를 미리 가져온다"""
    cache, last, delta, conf = LRU(64), None, 0, 0
    for t, a in enumerate(addrs):
        if sw and t + sw < len(addrs):
            cache.load(addrs[t + sw], demand=False)
        cache.load(a)
        L = a >> 6
        if hw and L != last:
            if last is not None:
                d = L - last
                conf, delta = (conf + 1 if d == delta else 0), d
                if conf:
                    for s in range(1, 5):
                        if (L + s * d) >> 6 == L >> 6:   # 같은 페이지만
                            cache.load((L + s * d) << 6, demand=False)
            last = L
    return cache

N = 16384
gen = random.Random(5)
pats = {
    "SoA x 합": [8 * i for i in range(N)],
    "AoS x 합": [64 * i for i in range(N)],    # 64바이트 구조체의 x
    "a[idx[i]]": [8 * gen.randrange(1 << 20) for _ in range(N)],
}
hw = {}
for name, tr in pats.items():
    hw[name] = run(tr, hw=True)
    print(f"{name}: 미스 {run(tr).miss}, HW {hw[name].miss},",
          f"SW {run(tr, sw=16).miss}")
soa, aos = hw["SoA x 합"], hw["AoS x 합"]
print("가져온 줄 = N/8, N:", [soa.fills, aos.fills] == [N // 8, N])
print("HW 미스 = 페이지 수 + 2:",                 # 페이지 = 줄 64개
      [soa.miss, aos.miss] == [N // 8 // 64 + 2, N // 64 + 2])
```
```text
SoA x 합: 미스 2048, HW 34, SW 2
AoS x 합: 미스 16384, HW 258, SW 16
a[idx[i]]: 미스 16378, HW 16378, SW 16
가져온 줄 = N/8, N: True
HW 미스 = 페이지 수 + 2: True
```
보폭이 일정한 SoA·AoS는 하드웨어 프리페처가 미스를 98% 지운다. 남는 미스는 새 페이지의 첫 줄(페이지마다 1번)과 간격을 배우는 처음 2번으로, 공식과 정확히 맞는다. 그러나 프리페처가 지연을 숨겨도 **가져오는 양**은 그대로다. AoS는 x 하나를 위해 SoA의 8배인 16,384줄을 옮기므로, 대역폭이 한계인 루프에서는 여전히 8배 느리다. 무작위 모으기 `a[idx[i]]`는 간격이 없어 하드웨어 프리페처가 아무것도 못 하지만, 인덱스 배열은 미리 읽을 수 있으므로 소프트웨어 프리페치가 첫 16번만 남기고 지운다.

GCC·Clang에서는 `__builtin_prefetch(주소, 읽기0/쓰기1, 지역성0~3)`로 쓴다.
```c
#include <stddef.h>

double gather(const double *a, const int *idx, size_t n)
{
    double sum = 0.0;
    for (size_t i = 0; i < n; i++) {
        if (i + 16 < n)
            __builtin_prefetch(&a[idx[i + 16]], 0, 3);
        sum += a[idx[i]];
    }
    return sum;
}
```
gcc 13.3, `-O2`, x86-64로 컴파일한 루프 본체다. 프리페치가 `prefetcht0` 명령 하나가 된다.
```asm
.L4:
    cmpq    %rdx, %rax
    jnb     .L3
    movslq  (%rsi,%rax,4), %rcx
    prefetcht0      (%rdi,%rcx,8)
.L3:
    movslq  -64(%rsi,%rax,4), %rcx
    addq    $1, %rax
    addsd   (%rdi,%rcx,8), %xmm0
    cmpq    %r8, %rax
    jne     .L4
```
프리페치 거리(여기서 16)는 `메모리 지연 ÷ 반복 한 번의 시간`보다 커야 제때 도착한다. 70ns 지연에 반복이 2ns라면 35번 이상 앞서야 한다. 너무 멀면 쓰기 전에 쫓겨나고, 순차 접근에 넣으면 하드웨어가 이미 하는 일에 명령만 늘린다. 연결 리스트처럼 다음 주소를 지금 줄을 읽어야 아는 구조는 하드웨어도 소프트웨어도 미리 가져올 수 없다. 그래서 성능이 중요한 곳에서는 노드를 배열에 모으거나 B-트리처럼 노드를 키운다.

## 코드에 주는 의미
- 다차원 배열은 저장 순서(C는 행 우선, 포트란·넘파이 `order="F"`는 열 우선)대로 안쪽 루프를 돌린다. 행렬 곱이라면 ikj 순서만으로 미스가 ijk의 약 9분의 1이었다.
- 재사용이 많은 계산은 `3 × T² × 원소 크기`가 캐시에 들어가게 타일로 자른다.
- 뜨거운 루프가 쓰는 필드만 모은다(SoA, 또는 자주 쓰는 필드와 드문 필드를 나눈 구조체).
- 보폭이 일정하면 프리페처를 믿고, 인덱스로 흩어진 접근에만 소프트웨어 프리페치를 거리까지 재 가며 넣는다.

## 숫자로 보기
인텔 최적화 설명서(샌디브리지 세대 기술)에 적힌 하드웨어 프리페처다. 세대마다 종류와 동작이 바뀐다.

| 위치 | 프리페처 | 동작 |
|---|---|---|
| L1D | DCU(스트리밍) | 오름차순 접근에 다음 줄 |
| L1D | IP 기반 보폭 | 명령어별 보폭, 2KB까지 |
| L2 | 공간(spatial) | 128바이트 쌍의 짝 줄 |
| L2 | 스트리머 | 최대 20줄 앞, 4KiB 페이지 안 |

- 위 시뮬레이션: 48×48 행렬 곱, 2KiB 캐시에서 미스 jki 223,488 · ijk 124,704 · ikj 14,400 · 8×8 타일 3,744.

## 어디에 쓰이나
- 어텐션 7편 「플래시 어텐션: 메모리 계층을 아는 정확한 어텐션」: Q·K·V를 SRAM에 들어가는 블록으로 자르는 것이 이 글의 블로킹을 GPU 메모리 계층에 적용한 것이다.
- 알고리즘 기법 13편 「제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게」: 답은 그대로 두고 질의 순서만 바꿔 방금 쓴 구간 근처를 이어 쓰게 하는 것이 이 글의 루프 순서 바꾸기·타일링과 같은 발상이다.
- GPU와 CUDA 6편 「메모리 병합: 전역 메모리를 32바이트 섹터로 읽기」: 워프의 32개 주소가 몇 섹터로 묶이는지가 GPU판 공간 지역성이고, 거기서도 AoS 대 SoA가 같은 결론을 낸다.

## 정리
- 같은 행렬 곱(접근 331,776번)이 루프 순서와 타일링에 따라 미스 223,488번에서 3,744번까지 60배 갈렸고, 네 버전의 곱 결과는 모두 같았다.
- 안쪽 루프는 연속 주소를 걷게, 재사용이 많은 계산은 타일 세 개가 캐시에 들어가게 자른다.
- SoA는 쓰는 바이트만 가져온다. AoS는 프리페처로 지연을 숨겨도 옮기는 양이 8배다.
- 하드웨어 프리페처는 일정한 보폭을 페이지 안에서만 따라가고, 흩어진 접근은 소프트웨어 프리페치가 거리만큼 앞서 요청해야 숨는다.

## 더 알아보기
- 이전 글: 3편 「캐시 미스의 종류와 정책: 3C, 교체, 쓰기」
- 다음 글: 5편 「DRAM의 구조: 1T1C 셀, 뱅크, 행 버퍼, 리프레시」
- Ulrich Drepper, "What every programmer should know about memory"(LWN.net 연재, 2007): https://lwn.net/Articles/250967/
