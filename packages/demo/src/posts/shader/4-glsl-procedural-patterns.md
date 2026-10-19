# [게임 셰이더 4/16] 셰이더 언어와 첫 프래그먼트 셰이더: GLSL, 유니폼, 절차적 패턴

> **한 줄 요약** — GLSL은 vec·mat 타입과 스위즐, in·out·uniform, mix·smoothstep 같은 내장 함수를 가진 작은 C 방언이고, 텍스처 없이 픽셀 좌표의 함수만으로 체커보드, 거리 함수 원, 노이즈 디졸브를 그릴 수 있으며, smoothstep으로 경계를 두 픽셀에 걸쳐 섞으면 계단이 사라지고, 값 노이즈는 가운데에 몰려 있어 디졸브 임계값을 선형으로 올리면 진행이 S자가 된다.

## 이 글에서 다루는 것
- GLSL ES 3.00의 타입, 스위즐, 한정자, 정밀도와 HLSL 대응
- 체커보드: `floor`와 `mod`로 칸 나누기
- 부호 있는 거리 함수(SDF)로 원 그리기와 smoothstep 안티에일리어싱
- 정수 해시와 값 노이즈로 만드는 디졸브 효과
- 세 셰이더를 GPU에서 렌더링하고 파이썬으로 같은 그림 재현하기

## 문제: 텍스처 없이 무늬 그리기
바닥 타일, 체력 바의 둥근 모서리, 적이 타들어 가며 사라지는 효과는 텍스처로도 되지만, 픽셀 좌표의 함수로 계산하면 메모리를 쓰지 않고 해상도와 상관없이 선명하며 유니폼 하나로 모양을 바꿀 수 있다. 이런 **절차적 패턴**(procedural pattern)은 대역폭 대신 연산을 쓰는 거래다. 먼저 언어부터 본다.

## GLSL ES 3.00 한 장 요약
- 타입: `float`, `int`, `uint`, `bool`, 벡터 `vec2`~`vec4`(`ivec`, `uvec`), 행렬 `mat2`~`mat4`(열 우선, 2편), `sampler2D`. 벡터 연산은 성분별이다.
- **스위즐**(swizzle): `v.xy`, `c.bgr`, `v.xxyy`처럼 성분을 골라 순서를 바꾸거나 반복한다.
- 한정자: `in`은 앞 단계에서 온 값, `out`은 다음 단계로 보낼 값, `uniform`은 드로 콜 동안 모든 호출이 같이 보는 상수다.
- 정밀도: `highp`·`mediump`·`lowp`. 프래그먼트 셰이더는 float 기본 정밀도가 없어 `precision mediump float;`처럼 선언해야 한다. `mediump`는 범위 ±2¹⁴, 상대 정밀도 2⁻¹⁰만 보장해 FP16으로 구현될 수 있다(양자화 2편 「수 형식의 지도: FP32에서 FP4까지」).

자주 쓰는 내장 함수의 정의다(벡터에는 성분별로).
```text
mix(a, b, t)   = a·(1 - t) + b·t
step(e, x)     = x < e ? 0 : 1
smoothstep(e0, e1, x):
  t = clamp((x - e0)/(e1 - e0), 0, 1)
  result = t·t·(3 - 2t)
fract(x)       = x - floor(x)
clamp(x, a, b) = min(max(x, a), b)
```
HLSL과는 이렇게 대응한다.

| GLSL ES 3.00 | HLSL |
|---|---|
| `vec4`, `mat4` | `float4`, `float4x4` |
| `M * v` | `mul(M, v)` |
| `mix`, `fract` | `lerp`, `frac` |
| `clamp(x, 0.0, 1.0)` | `saturate(x)` |
| `out vec4 fragColor` | 반환값의 `SV_Target` |
| `uniform` 블록 | `cbuffer` |

## 체커보드: floor와 mod
`vUV`(0~1)에 칸 수를 곱해 `floor`하면 칸 번호가 나오고, 번호 합의 홀짝으로 두 색을 고른다. 렌더링은 1편처럼 픽셀 밝기를 문자 ` .:-=+*#%@`로 바꿔 보인다.
```glsl
#version 300 es
precision mediump float;
// render 16x4
in vec2 vUV;
out vec4 fragColor;
void main() {
    vec2 cell = floor(vUV * vec2(4.0, 2.0));          // 칸 번호 (가로 4, 세로 2)
    float c = mod(cell.x + cell.y, 2.0);               // 0, 1이 번갈아
    vec3 dark = vec3(0.1), light = vec3(0.9, 0.8, 0.3);
    fragColor = vec4(mix(dark, light, c), 1.0);
}
```
```text
####....####....
####....####....
....####....####
....####....####
```

## 거리 함수로 원 그리기
**부호 있는 거리 함수**(signed distance function, SDF)는 도형 경계까지의 거리를 안쪽이면 음수로 돌려준다. 원은 `length(p) − r`이다. `d < 0`인 곳만 칠하면 경계가 계단이 지므로 `1 − smoothstep(−px, px, d)`로 경계 앞뒤 한 픽셀씩에 걸쳐 0에서 1로 넘긴다. 픽셀 크기 `px`는 유니폼 `uResolution`으로, 위치는 픽셀 중심의 창 좌표 `gl_FragCoord`로 구한다.
```glsl
#version 300 es
precision highp float;
// render 20x10
uniform vec2 uResolution;           // 렌더링 크기(픽셀), CPU가 넣는다
out vec4 fragColor;
float sdCircle(vec2 p, float r) { return length(p) - r; }   // 안쪽이 음수
void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    p.x *= 0.5;                     // 글자 칸이 세로로 길어서 가로를 절반으로
    float d = sdCircle(p, 0.45);
    float px = 1.0 / uResolution.y; // 픽셀 하나의 크기(거리 단위)
    float a = 1.0 - smoothstep(-px, px, d);    // 경계 두 픽셀에 걸쳐 0→1
    fragColor = vec4(vec3(a), 1.0);
}
```
```text
     .:-====-:.
   :+#%@@@@@@%#+:
 .=#@@@@@@@@@@@@#=.
.=%@@@@@@@@@@@@@@%=.
:*@@@@@@@@@@@@@@@@*:
:*@@@@@@@@@@@@@@@@*:
.=%@@@@@@@@@@@@@@%=.
 .=#@@@@@@@@@@@@#=.
   :+#%@@@@@@%#+:
     .:-====-:.
```
경계의 `.:-=+`가 중간 밝기 픽셀이다. 크기가 변하는 실제 화면에서는 고정된 `px` 대신 `fwidth(d)`(`dFdx`·`dFdy` 절댓값의 합, 3편)로 경계 폭을 맞춘다. SDF 글꼴 렌더링도 이 원리다.

## 해시와 값 노이즈로 디졸브
**디졸브**(dissolve)는 노이즈가 임계값보다 작은 픽셀을 `discard`(색과 깊이를 쓰지 않고 버림)하고, 임계값 바로 위 띠를 밝게 칠해 타는 테두리를 만든다. 노이즈는 정수 격자점마다 해시로 난수를 만들고 사이를 보간한 **값 노이즈**(value noise)다. 흔한 `fract(sin(x) × 43758.5453)` 해시는 `sin` 정밀도가 GPU마다 달라, 어디서나 같은 비트를 내는 `uint` 곱셈과 시프트(GLSL ES 3.00부터)로 만들었다.
```glsl
#version 300 es
precision highp float;
// render 28x10
in vec2 vUV;
out vec4 fragColor;
float hash(uvec2 p) {                   // 정수 해시 → [0, 1]
    uint h = p.x * 374761393u + p.y * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    return float((h ^ (h >> 16u)) >> 8u) / 16777215.0;
}
float valueNoise(vec2 p) {              // 격자점 난수를 smoothstep 곡선으로 보간
    vec2 f = fract(p), u = f * f * (3.0 - 2.0 * f);
    uvec2 c = uvec2(floor(p));
    return mix(mix(hash(c), hash(c + uvec2(1, 0)), u.x),
               mix(hash(c + uvec2(0, 1)), hash(c + uvec2(1, 1)), u.x), u.y);
}
void main() {
    const float threshold = 0.4;        // 게임에서는 uniform으로 0→1
    float n = valueNoise(vUV * vec2(9.0, 3.0));
    if (n < threshold) discard;         // 녹아 없어진 부분
    float glow = 1.0 - smoothstep(0.0, 0.15, n - threshold);
    fragColor = vec4(mix(vec3(0.35), vec3(1.0, 0.9, 0.5), glow), 1.0);
}
```
```text
-*%%----    %-------------%
--------     %=-----------*
--------%        ----------%
--------#%       =---------#
----------=#%    %--==-----
--------------#       %---*
---------------#       ---%
--------------=%       ---#
 #--=#%*--=%    %=--%  #--*
  *=            %----    %+-
```
`-`는 남은 표면, 빈칸은 구멍, `#%*`는 타는 띠다. `discard`는 이른 깊이 테스트를 막을 수 있다(16편).

## 파이썬으로 세 그림 재현하기
세 셰이더의 식을 파이썬으로 옮겨 8비트 반올림과 문자 변환까지 흉내 내고 GPU 출력과 비교한다. 해시는 `& 0xFFFFFFFF`로 32비트 `uint`의 넘침을 재현한다.
```python
import math
RAMP = " .:-=+*#%@"
mix = lambda a, b, t: a * (1 - t) + b * t

def smoothstep(e0, e1, x):
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)

def render(shade, W, H):     # 픽셀 중심마다 shade → 8비트 → 밝기 → 문자
    rows = []
    for y in reversed(range(H)):
        s = ""
        for x in range(W):
            c = shade(x + 0.5, y + 0.5, W, H)     # gl_FragCoord.xy
            r, g, b = (round(v * 255) for v in c) if c else (0, 0, 0)
            s += RAMP[min(9, int((0.2126 * r + 0.7152 * g + 0.0722 * b) * 10 / 256))]
        rows.append(s.rstrip())
    return rows

def checker(x, y, W, H):
    c = (math.floor(x / W * 4) + math.floor(y / H * 2)) % 2
    return mix(0.1, 0.9, c), mix(0.1, 0.8, c), mix(0.1, 0.3, c)

def circle(x, y, W, H, hard=False):
    px, py = (x - W / 2) / H * 0.5, (y - H / 2) / H
    d = math.hypot(px, py) - 0.45
    a = float(d < 0) if hard else 1 - smoothstep(-1 / H, 1 / H, d)
    return a, a, a

M32 = 0xFFFFFFFF
def hash2(ix, iy):           # GLSL의 uint 곱셈·시프트를 32비트로 흉내
    h = (ix * 374761393 + iy * 668265263) & M32
    h = ((h ^ (h >> 13)) * 1274126177) & M32
    return ((h ^ (h >> 16)) >> 8) / 16777215.0

def value_noise(px, py):
    ix, iy = math.floor(px), math.floor(py)
    ux, uy = smoothstep(0, 1, px - ix), smoothstep(0, 1, py - iy)
    return mix(mix(hash2(ix, iy), hash2(ix + 1, iy), ux),
               mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy)

def dissolve(x, y, W, H, t=0.4):
    n = value_noise(x / W * 9, y / H * 3)
    if n < t: return None                         # discard
    g = 1 - smoothstep(0.0, 0.15, n - t)
    return mix(0.35, 1.0, g), mix(0.35, 0.9, g), mix(0.35, 0.5, g)

gpu_circle = """\
     .:-====-:.
   :+#%@@@@@@%#+:
 .=#@@@@@@@@@@@@#=.
.=%@@@@@@@@@@@@@@%=.
:*@@@@@@@@@@@@@@@@*:
:*@@@@@@@@@@@@@@@@*:
.=%@@@@@@@@@@@@@@%=.
 .=#@@@@@@@@@@@@#=.
   :+#%@@@@@@%#+:
     .:-====-:."""
gpu_dissolve = """\
-*%%----    %-------------%
--------     %=-----------*
--------%        ----------%
--------#%       =---------#
----------=#%    %--==-----
--------------#       %---*
---------------#       ---%
--------------=%       ---#
 #--=#%*--=%    %=--%  #--*
  *=            %----    %+-"""
print("체커보드 일치:", render(checker, 16, 4) == ["####....####...."] * 2
      + ["....####....####"] * 2)
print("원 일치:", render(circle, 20, 10) == gpu_circle.split("\n"))
print("디졸브 일치:", render(dissolve, 28, 10) == gpu_dissolve.split("\n"))
mid = lambda f: sum(0 < f(x + 0.5, 5.5, 20, 10)[0] < 1 for x in range(20))
print("가운데 줄의 중간 밝기 픽셀: smoothstep", mid(circle),
      "/ 계단", mid(lambda *a: circle(*a, hard=True)))
```
```text
체커보드 일치: True
원 일치: True
디졸브 일치: True
가운데 줄의 중간 밝기 픽셀: smoothstep 6 / 계단 0
```
GPU는 float32, 파이썬은 float64지만 반올림 경계에 걸린 픽셀이 없어 세 그림이 글자 하나까지 같다. 원의 가운데 줄에서 0과 1 사이 픽셀이 smoothstep은 6개, 계단은 0개다.

## 디졸브 임계값의 함정
게임에서는 `threshold`를 유니폼으로 0에서 1로 올리는데, 값 노이즈는 네 난수의 가중 평균이라 가운데에 몰려 있다. 무작위 위치 2만 곳에서 녹은 비율을 세고, 균등해야 할 해시 값과 비교한다(앞 코드에 이어서).
```python
import random
rng = random.Random(4)
vn = [value_noise(rng.uniform(0, 64), rng.uniform(0, 64)) for _ in range(20000)]
wn = [hash2(rng.randrange(1 << 20), rng.randrange(1 << 20)) for _ in range(20000)]
for t in (0.1, 0.3, 0.5, 0.7, 0.9):              # wn: 보간 없는 해시 값
    fv, fw = (sum(v < t for v in vs) / len(vs) for vs in (vn, wn))
    print(f"임계값 {t}: 녹은 비율 값 노이즈 {fv:.3f}, 해시 {fw:.3f}")
```
```text
임계값 0.1: 녹은 비율 값 노이즈 0.019, 해시 0.101
임계값 0.3: 녹은 비율 값 노이즈 0.194, 해시 0.303
임계값 0.5: 녹은 비율 값 노이즈 0.498, 해시 0.505
임계값 0.7: 녹은 비율 값 노이즈 0.799, 해시 0.702
임계값 0.9: 녹은 비율 값 노이즈 0.976, 해시 0.900
```
해시는 임계값과 0.005 안에서 같아 고르다. 값 노이즈는 0.1에서 2%만 녹고 0.3~0.7에서 60%가 한꺼번에 녹는다. 고르게 녹이려면 잰 분포의 분위수로 임계값을 바꾸거나 분포를 다듬은 노이즈 텍스처를 쓴다.

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| mediump 최소 범위 | ±2¹⁴ | GLSL ES 3.00 |
| mediump 상대 정밀도 | 2⁻¹⁰ | GLSL ES 3.00 |
| 0.3~0.7에서 녹는 양 | 60.5% | 위 실험 |

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 셰이더의 정수 해시는 mod 2³² 곱셈과 XOR 시프트로 비트를 섞는다.
- 확률과 분포 10편 「큰 수의 법칙과 중심 극한 정리」: 값 노이즈가 가운데에 몰리는 것은 난수 여럿의 평균이 평균 쪽으로 모이는 현상이다.

## 정리
- GLSL ES 3.00은 벡터·행렬 타입, 스위즐, in·out·uniform, 정밀도 한정자를 갖고, 프래그먼트 셰이더는 float 정밀도를 선언해야 한다.
- SDF 원에 smoothstep을 씌우면 경계를 두 픽셀에 걸쳐 섞어 계단이 사라진다.
- 정수 해시와 값 노이즈로 디졸브를 만들고, 세 셰이더를 파이썬으로 재현해 GPU와 글자 하나까지 맞췄다.
- 값 노이즈는 가운데에 몰려 있어 임계값을 선형으로 올리면 녹는 속도가 고르지 않다.

## 더 알아보기
- 이전 글: 3편 「래스터화와 보간: 무게중심 좌표와 원근 보정」
- 다음 글: 5편 「텍스처 샘플링: 필터링, 밉맵, 이방성 필터링」
