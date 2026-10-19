# [게임 셰이더 2/16] 정점 셰이더와 좌표 변환: 모델·뷰·투영 행렬과 동차 좌표

> **한 줄 요약** — 정점 셰이더는 물체 좌표를 모델·뷰·투영 4×4 행렬로 클립 좌표까지 옮기고, 넷째 성분 w 덕분에 이동과 원근이 모두 행렬 곱이 되지만, w로 나눈 깊이는 1/거리의 일차식이라 먼 곳의 정밀도를 잃어 24비트 깊이 버퍼는 500m에서 15cm 단위밖에 구분하지 못하고, float32 리버스 Z는 이를 0.02mm로 줄인다.

## 이 글에서 다루는 것
- 물체 → 월드 → 뷰 → 클립 → NDC → 화면으로 이어지는 좌표계
- 동차 좌표: 4×4 행렬이 이동을 곱셈으로 만드는 이유
- 원근 투영 행렬의 유도와 원근 나눗셈을 파이썬으로 대조하기
- 깊이의 비선형성, z-파이팅, 리버스 Z를 정밀도로 세기
- 행 우선·열 우선과 곱하는 순서(GLSL과 HLSL)

## 문제: 모델링 툴의 좌표를 화면 픽셀로
메시의 정점은 모델링 툴에서 정한 **물체 공간**(object space) 좌표로 저장된다. 이 물체를 맵에 세우고, 카메라에 보이는 대로 원근을 주어 화면 픽셀로 옮기는 것이 정점 셰이더의 주된 일이다. 정확히는 정점 셰이더가 **클립 공간**(clip space) 좌표 `gl_Position`까지 만들고, 나머지는 1편의 고정 하드웨어가 한다.
```text
object space
  ↓ Model matrix      vertex shader
world space
  ↓ View matrix       vertex shader
view space (camera at 0, looks -z)
  ↓ Projection        vertex shader
clip space (x, y, z, w)
  ↓ divide by w       hardware
NDC: x, y, z in [-1, 1]  (OpenGL)
  ↓ viewport          hardware
window: pixels, depth in [0, 1]
```
모델 행렬은 물체의 크기·회전·위치, 뷰 행렬은 카메라 배치의 역행렬이다. 셋을 곱한 MVP 하나를 유니폼으로 넘기는 경우가 많다.

## 동차 좌표: 이동을 곱셈으로
3×3 행렬은 원점을 원점으로 보내는 선형 변환이라(선형대수 4편 「선형 변환으로서의 행렬」) 이동을 표현하지 못한다. 점에 넷째 성분 w = 1을 붙인 **동차 좌표**(homogeneous coordinates)로 쓰고 4×4 행렬의 넷째 열에 이동량을 두면 이동이 곱셈 하나로 된다. 방향(법선, 속도)은 w = 0이라 이동의 영향을 받지 않는다. 곱하는 순서도 중요해서 `T·R·v`는 오른쪽부터 읽어 "돌린 다음 옮긴다"이다.
```python
import math, random

def mat(rows):  return [list(r) for r in rows]
def mul(A, B):  return [[sum(A[i][k] * B[k][j] for k in range(4))
                         for j in range(4)] for i in range(4)]
def apply(M, v): return [sum(M[i][k] * v[k] for k in range(4)) for i in range(4)]

def translate(tx, ty, tz):
    return mat([[1, 0, 0, tx], [0, 1, 0, ty], [0, 0, 1, tz], [0, 0, 0, 1]])

T = translate(5, 0, 0)
R = mat([[0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 1]])  # y축 90°
print("점 이동:", apply(T, [1, 0, 0, 1]), "/ 방향 이동:", apply(T, [1, 0, 0, 0]))
print("T·R (돌리고 옮김):", apply(mul(T, R), [1, 0, 0, 1]))
print("R·T (옮기고 돌림):", apply(mul(R, T), [1, 0, 0, 1]))
```
```text
점 이동: [6, 0, 0, 1] / 방향 이동: [1, 0, 0, 0]
T·R (돌리고 옮김): [5, 0, -1, 1]
R·T (옮기고 돌림): [0, 0, -6, 1]
```

## 원근 투영: 거리를 w에 담는다
뷰 공간에서 카메라는 −z 방향을 본다. 닮은 삼각형으로 화면 위치는 `x / d`(d = −z, 거리)에 비례하는데, 행렬 곱으로는 나눗셈을 할 수 없다. 그래서 투영 행렬은 거리 d를 w에 담아 두기만 하고, 하드웨어가 클리핑 뒤에 x, y, z를 w로 나눈다. 이것이 **원근 나눗셈**(perspective divide)이다.
```text
t = 1 / tan(fovy / 2)
x_ndc = (t / aspect) · x / d
y_ndc = t · y / d
w_clip = -z = d
z_ndc = (A·z + B) / d
  z = -n  →  -1,   z = -f  →  +1
  A = (f+n)/(n-f),  B = 2fn/(n-f)
```
깊이도 같은 w로 나뉘므로 `z_ndc = −A − B/z`, 즉 1/거리의 일차식이 된다. 행렬로 계산한 결과를 닮은 삼각형으로 직접 계산한 값과 무작위 점 300개에서 비교한다(앞 코드에 이어서, OpenGL 관례).
```python
def perspective(fovy, aspect, n, f):        # OpenGL 관례, NDC z ∈ [-1, 1]
    t = 1 / math.tan(fovy / 2)
    return mat([[t / aspect, 0, 0, 0], [0, t, 0, 0],
                [0, 0, (f + n) / (n - f), 2 * f * n / (n - f)], [0, 0, -1, 0]])

fovy, aspect, n, f = math.radians(60), 16 / 9, 0.1, 1000.0
P, t = perspective(fovy, aspect, n, f), 1 / math.tan(fovy / 2)
rng, worst = random.Random(2), 0.0
for _ in range(300):
    x, y, z = rng.uniform(-50, 50), rng.uniform(-50, 50), -rng.uniform(n, f)
    c = apply(P, [x, y, z, 1])
    ndc = [c[i] / c[3] for i in range(3)]       # 원근 나눗셈
    direct = [t / aspect * x / -z, t * y / -z,  # 닮은 삼각형으로 직접 계산
              (f + n) / (f - n) + 2 * f * n / ((f - n) * z)]
    worst = max(worst, max(abs(a - b) for a, b in zip(ndc, direct)))
print(f"무작위 300개: 행렬 대 직접 계산 최대 차이 {worst:.1e}")
zs = [apply(P, [0, 0, -d, 1]) for d in (n, 1, 10, f)]
print("거리 0.1, 1, 10, 1000m의 NDC z:", [round(c[2] / c[3], 4) for c in zs])
```
```text
무작위 300개: 행렬 대 직접 계산 최대 차이 1.1e-16
거리 0.1, 1, 10, 1000m의 NDC z: [-1.0, 0.8002, 0.9802, 1.0]
```
0.1m에서 1m까지가 깊이 범위의 90%를 쓰고, 10m에서 1000m까지는 1%를 나눠 쓴다. Direct3D·Vulkan·Metal은 NDC z가 [0, 1]이라 셋째 행이 다르다(OpenGL은 4.5의 `glClipControl`로 바꾼다).

## 깊이 정밀도와 z-파이팅
깊이 버퍼에 저장되는 창 깊이 `f(d − n) / (d(f − n))`를 미분하면 거리 1m당 변화가 `fn / (d²(f − n))`이므로, 24비트 버퍼의 한 칸(1/(2²⁴ − 1))에 해당하는 거리는 **거리의 제곱**에 비례해 커진다. 한 칸보다 가까운 두 면은 같은 깊이 값이 되어 픽셀마다 앞뒤가 바뀌며 깜박이는데, 이것이 **z-파이팅**(z-fighting)이다. 형식별로 같은 값으로 뭉개지는 구간의 폭을 이분 탐색으로 재고 공식과 비교한다(앞 코드에 이어서, n = 0.1m, f = 1000m, 거리 1·10·100·500m).
```python
import struct

def f32(x):                                  # float32로 반올림
    return struct.unpack("f", struct.pack("f", x))[0]

def depth(d, n=0.1, f=1000.0):               # 창 깊이 [0, 1]: 가까움 0
    return f * (d - n) / (d * (f - n))

fmts = {"24비트 정수": lambda d: round(depth(d) * (2**24 - 1)),
        "float32": lambda d: f32(depth(d)),
        "float32 리버스 Z": lambda d: f32(1 - depth(d))}

def next_change(store, d):                   # 저장값이 바뀌는 다음 거리
    lo, hi = d, 2 * d
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if store(mid) == store(d) else (lo, mid)
    return hi

def bucket(store, d):                        # 같은 값으로 저장되는 구간 폭
    a = next_change(store, d)
    return next_change(store, a) - a

D = (1, 10, 100, 500)                        # 거리(m)
for name, store in fmts.items():
    print(f"{name}:", " ".join(f"{bucket(store, d):.1e}" for d in D))
print("24비트 공식:", " ".join(
    f"{d * d * (1000 - 0.1) / (1000 * 0.1 * (2**24 - 1)):.1e}" for d in D))
```
```text
24비트 정수: 6.0e-07 6.0e-05 6.0e-03 1.5e-01
float32: 6.0e-07 6.0e-05 6.0e-03 1.5e-01
float32 리버스 Z: 7.4e-08 9.3e-07 5.8e-06 1.8e-05
24비트 공식: 6.0e-07 6.0e-05 6.0e-03 1.5e-01
```
24비트 버퍼는 공식대로 100m에서 6mm, 500m에서 15cm 단위로 뭉갠다. 간격이 `1/n`에 비례하므로 가까운 평면을 0.1m에서 1m로 밀면 열 배 좋아진다. float32에 그대로 저장해도 나아지지 않는데, 먼 곳의 깊이가 1 근처에 몰리고 float32는 1 근처 간격이 2⁻²⁴로 24비트 정수와 같기 때문이다.

## 리버스 Z
**리버스 Z**(reverse Z)는 가까운 평면을 1, 먼 평면을 0으로 뒤집어 float32에 저장한다. 먼 곳의 깊이가 0 근처로 가고, 부동소수는 0에 가까울수록 촘촘해서 1/거리의 몰림을 거의 상쇄한다. 위 실험에서 500m의 간격이 15cm에서 0.018mm로 8천 배 줄었다. 간격이 균일한 정수 버퍼는 뒤집어도 이득이 없다. 쓰려면 NDC z가 [0, 1]이어야 하고, 깊이 비교를 "더 크면 통과"로 바꾸고 깊이 버퍼를 0으로 지운다.

## 행 우선·열 우선과 곱하는 순서
두 가지가 섞여 혼란스럽다. 하나는 **수학 관례**로, 열 벡터면 `P·V·M·v`, 행 벡터면 `v·M·V·P`이고 두 관례의 행렬은 서로의 전치다. 다른 하나는 16개 값을 행부터(행 우선) 또는 열부터(열 우선) 늘어놓는 **메모리 배치**다. GLSL은 열 벡터 관례에 열 우선 저장이고, `mat4(...)` 생성자도 열부터 채워 이동량이 마지막 네 값에 들어간다. 같은 점에 행렬을 앞과 뒤에서 곱해 렌더링한다(`rgba`는 픽셀마다 RGBA 바이트를 출력).
```glsl
#version 300 es
precision highp float;
// render 2x1 rgba
in vec2 vUV;
out vec4 fragColor;
void main() {
    // mat4(...)의 값 16개는 1열, 2열, 3열, 4열 순서로 채워진다
    mat4 T = mat4(1.0, 0.0, 0.0, 0.0,
                  0.0, 1.0, 0.0, 0.0,
                  0.0, 0.0, 1.0, 0.0,
                  0.45, 0.35, 0.0, 1.0);   // 넷째 열 = 이동량
    vec4 p = vec4(0.15, 0.25, 0.0, 1.0);
    vec4 a = T * p;                         // 열 벡터로 곱하기
    vec4 b = p * T;                         // 행 벡터로 곱하기 = transpose(T) * p
    vec4 v = vUV.x < 0.5 ? a : b;           // 왼쪽 픽셀 a, 오른쪽 픽셀 b
    fragColor = vec4(v.x, v.y, v.w / 4.0, 1.0);
}
```
```text
(0,0) 153 153 64 255
(1,0) 38 64 74 255
```
왼쪽은 (0.6, 0.6)으로 옮겨졌고 w = 1이다. 오른쪽은 위치가 그대로이고 이동량이 w로 새어 w = 1.155가 됐다. 파이썬으로 같은 값을 계산하고, 두 관례의 관계를 무작위 행렬 300개로 확인한다(앞 코드에 이어서).
```python
def transpose(M): return [list(r) for r in zip(*M)]
def row_vec(v, M): return [sum(v[k] * M[k][j] for k in range(4)) for j in range(4)]
def col_major(M): return [M[i][j] for j in range(4) for i in range(4)]
def row_major(M): return [x for row in M for x in row]

T, p = translate(0.45, 0.35, 0.0), [0.15, 0.25, 0, 1]
to8 = lambda v: [round(v[0] * 255), round(v[1] * 255), round(v[3] / 4 * 255)]
print("T·p 일치:", to8(apply(T, p)) == [153, 153, 64],
      "/ p·T 일치:", to8(row_vec(p, T)) == [38, 64, 74])
rng, ok = random.Random(5), 0
for _ in range(300):
    M = [[rng.uniform(-9, 9) for _ in range(4)] for _ in range(4)]
    v = [rng.uniform(-9, 9) for _ in range(4)]
    ok += (apply(M, v) == row_vec(v, transpose(M))
           and col_major(M) == row_major(transpose(M)))
print(f"무작위 300개: M·v = v·Mᵀ, 열 우선(M) = 행 우선(Mᵀ) {ok}/300")
```
```text
T·p 일치: True / p·T 일치: True
무작위 300개: M·v = v·Mᵀ, 열 우선(M) = 행 우선(Mᵀ) 300/300
```
마지막 줄이 혼란의 정체다. 행 벡터 관례의 행렬을 행 우선으로 저장한 바이트와 열 벡터 관례의 행렬을 열 우선으로 저장한 바이트는 똑같다. HLSL의 `mul(x, y)`는 벡터가 앞 인자면 행 벡터, 뒤 인자면 열 벡터로 다루고, `cbuffer`의 행렬은 기본이 열 우선 배치다(`row_major`나 `/Zpr`로 바꾼다). 그래서 같은 바이트를 올리면 HLSL의 `mul(M, v)`가 GLSL의 `M * v`와 같다.

## 정점 셰이더
실제 정점 셰이더는 이 행렬들을 차례로 곱할 뿐이고 원근 나눗셈은 하지 않는다. 셰이더가 w로 나눠 버리면 카메라 뒤의 점을 클리핑할 수 없고, 3편의 원근 보정에 필요한 w도 사라진다. 법선을 이 행렬로 옮기면 틀리는 이유는 6편에서 다룬다.
```glsl
#version 300 es
layout(location = 0) in vec3 aPos;      // 물체 공간 위치
uniform mat4 uModel, uView, uProj;      // 물체→월드, 월드→뷰, 뷰→클립
void main() {
    // 열 벡터 관례: 오른쪽 행렬부터 적용된다. w로 나누지 않는다
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}
```

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 24비트 깊이 간격, 100m | 6mm | n=0.1, f=1000 |
| 24비트 깊이 간격, 500m | 15cm | 같은 설정 |
| float32 리버스 Z, 500m | 0.018mm | 같은 설정 |
| 깊이 범위의 90% | 0.1~1m | 창 깊이 0.9 |
| NDC z 범위 | [−1, 1] / [0, 1] | GL / D3D·Vulkan |

## 어디에 쓰이나
- 선형대수 5편 「연립일차방정식과 역행렬」: 뷰 행렬은 카메라 배치의 역행렬이고, 회전과 이동뿐이라 전치와 부호 반전으로 싸게 구한다.
- 게임 자원 관리 9편 「컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기」: 절두체 평면 여섯 장은 투영·뷰 행렬을 곱한 행렬의 행을 더하고 빼서 바로 얻는다.
- 양자화 2편 「수 형식의 지도: FP32에서 FP4까지」: 리버스 Z는 부동소수의 간격이 0 근처에서 촘촘해지는 성질을 그대로 이용한다.

## 정리
- 동차 좌표의 w = 1이 이동을, w = 0이 방향을 만들고, 모델·뷰·투영은 모두 4×4 행렬 곱이다.
- 투영 행렬은 거리를 w에 넣고 하드웨어가 w로 나눈다. 닮은 삼각형 계산과 무작위 300개에서 일치했다.
- 깊이는 1/거리의 일차식이라 24비트 버퍼의 간격이 거리 제곱으로 커져 500m에서 15cm가 되고, float32 리버스 Z는 0.018mm다.
- GLSL은 열 벡터·열 우선이고, HLSL 기본 배치에서는 `mul(M, v)`가 GLSL의 `M * v`다.

## 더 알아보기
- 이전 글: 1편 「셰이더와 렌더링 파이프라인: GPU가 삼각형을 픽셀로 바꾸는 길」
- 다음 글: 3편 「래스터화와 보간: 무게중심 좌표와 원근 보정」
