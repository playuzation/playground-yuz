# [게임 셰이더 9/16] 이미지 기반 조명: 큐브맵, 구면 조화 함수, 분할 합 근사

> **한 줄 요약** — 이미지 기반 조명은 환경 전체에서 오는 빛의 적분을 미리 해 두는 기법으로, 확산광은 구면 조화 함수 계수 9개로, 정반사는 사전 필터링한 큐브맵과 BRDF 표의 곱으로 근사하며, 강한 점광원이나 거친 면의 비스듬한 시선에서 틀린다.

## 이 글에서 다루는 것
- 환경광 적분이 실시간에 왜 비싼가
- 큐브맵의 방향 → 면·UV 변환(GLSL 렌더링, 파이썬 왕복 검사)
- 확산 조도를 구면 조화 함수 9개 계수로 줄이기와 그 오차
- 정반사의 분할 합 근사와 그것이 틀리는 곳

## 빛은 모든 방향에서 온다
방향광 하나로 조명하면(6편, 8편) 빛을 등진 쪽이 새까맣고 매끈한 금속 공은 비출 것이 없어 검다. 실제로는 하늘, 땅, 벽이 모두 빛을 보낸다. 시선 방향 v로 나가는 빛은 들어오는 모든 방향 l에 대한 적분이다.
```text
Lo(v) = ∫ f(l, v) · L(l) · (n·l) dl
f: 8편의 BRDF, 적분은 n 쪽 반구
```
L(l)을 주변을 찍은 HDR 사진(환경 맵)으로 주는 것이 **이미지 기반 조명**(image-based lighting, IBL)이다. 픽셀마다 방향 1,000개를 표집하면 1080p 60fps에서 초당 약 1,244억 번(1920×1080×60×1000) 환경 맵을 읽어야 하므로, 적분은 미리 해 두고 셰이더는 결과를 몇 번 읽는다. 확산 항은 법선만의 함수, 정반사 항은 반사 방향과 거칠기의 함수라는 점을 이용한다.

## 큐브맵: 방향으로 읽는 텍스처
환경 맵은 보통 **큐브맵**(cube map)에 담는다. 정육면체 여섯 면에 주변을 찍어 두고 방향 벡터 d로 읽는다. GPU는 d에서 절댓값이 가장 큰 성분(주축)으로 면을 고르고, 나머지 두 성분을 주축의 절댓값 ma로 나눠 `s = (sc/ma + 1)/2`, `t = (tc/ma + 1)/2`를 만든다. 면마다 성분과 부호는 OpenGL·OpenGL ES 명세의 표를 따르며(예: +X 면은 sc = −z, tc = −y), 아래 `cubeFace`가 그 표다. 화면 가로를 경도, 세로를 위도로 삼아 방향을 만들고 면 번호 0~5(+X, −X, +Y, −Y, +Z, −Z)를 밝기로 칠하면 각각 공백 `.` `-` `+` `#` `@`가 된다.
```glsl
#version 300 es
precision highp float;
// render 36x12
in vec2 vUV;
out vec4 fragColor;
vec3 cubeFace(vec3 d) {
    vec3 a = abs(d);
    float f, sc, tc, ma;
    if (a.x >= a.y && a.x >= a.z) {
        f = d.x > 0.0 ? 0.0 : 1.0; sc = -sign(d.x) * d.z; tc = -d.y; ma = a.x;
    } else if (a.y >= a.z) {
        f = d.y > 0.0 ? 2.0 : 3.0; sc = d.x; tc = sign(d.y) * d.z; ma = a.y;
    } else {
        f = d.z > 0.0 ? 4.0 : 5.0; sc = sign(d.z) * d.x; tc = -d.y; ma = a.z;
    }
    return vec3(f, 0.5 * (sc / ma + 1.0), 0.5 * (tc / ma + 1.0));
}
void main() {
    float lon = (vUV.x * 2.0 - 1.0) * 3.14159265;   // 경도
    float lat = (vUV.y - 0.5) * 3.14159265;         // 위도
    vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
    fragColor = vec4(vec3(cubeFace(d).x / 5.0), 1.0);
}
```
```text
------------------------------------
------------------------------------
------------------------------------
@@@@-........-########-        -@@@@
@@@@..........########          @@@@
@@@@..........########          @@@@
@@@@..........########          @@@@
@@@@..........########          @@@@
@@@@+........+########+        +@@@@
++++++++++++++++++++++++++++++++++++
++++++++++++++++++++++++++++++++++++
++++++++++++++++++++++++++++++++++++
```
옆면 넷이 경도 90°씩 나눠 갖고, 띠 끝의 `-`와 `+`는 위도·경도 지도에서 면 경계가 곡선이라 생긴다. 같은 표로 역변환을 만들어 왕복을 확인한다.
```python
import math, random

def to_face(d):                      # 방향 → (면, s, t)
    x, y, z = d
    ax, ay, az = abs(x), abs(y), abs(z)
    if ax >= ay and ax >= az:
        f, sc, tc, ma = (0, -z, -y, ax) if x > 0 else (1, z, -y, ax)
    elif ay >= az:
        f, sc, tc, ma = (2, x, z, ay) if y > 0 else (3, x, -z, ay)
    else:
        f, sc, tc, ma = (4, x, -y, az) if z > 0 else (5, -x, -y, az)
    return f, (sc / ma + 1) / 2, (tc / ma + 1) / 2

def from_face(f, s, t):              # 역변환
    a, b = 2 * s - 1, 2 * t - 1
    d = [(1, -b, -a), (-1, -b, a), (a, 1, b),
         (a, -1, -b), (a, -b, 1), (-a, -b, -1)][f]
    return [c / math.hypot(*d) for c in d]

rng, err = random.Random(9), 0.0
for _ in range(1000):
    v = [rng.gauss(0, 1) for _ in range(3)]
    d = [c / math.hypot(*v) for c in v]
    err = max(err, max(abs(p - q) for p, q in zip(d, from_face(*to_face(d)))))
print(f"무작위 1000개 왕복 최대 오차: {err:.1e}")
```
```text
무작위 1000개 왕복 최대 오차: 2.2e-16
```
이 표는 WebGL2 `samplerCube`에 면마다 다른 색을 올려 무작위 방향 485개로 읽은 결과와도 일치했다. OpenGL ES 3.0부터는 면 경계에서 이웃 면 텍셀까지 섞는 이음매 없는(seamless) 필터링이 필수다.

## 확산광: 조도를 숫자 9개로
램버트 확산(6편)은 `albedo / π × E(n)`이고, 조도 `E(n) = ∫ L(ω) max(n·ω, 0) dω`는 환경을 코사인으로 크게 흐린 것이라 아주 느리게 변한다. 그래서 큐브맵 대신 **구면 조화 함수**(spherical harmonics, SH)를 쓴다. SH는 구 위의 함수를 위한 푸리에 급수 같은 정규 직교 기저로, 차수 l마다 함수가 2l + 1개다. 라마무르티와 한라한(2001)은 코사인 커널이 차수마다 상수 Âₗ을 곱하는 필터임을 보였다. Â₀ = π, Â₁ = 2π/3, Â₂ = π/4이고 그 뒤는 빠르게 작아지므로(3 이상의 홀수 차수는 0) l ≤ 2의 계수 9개면 되고, 논문은 평균 오차를 약 1%로 보고했다.
```text
Llm  = ∫ L(ω)·Ylm(ω) dω  (미리 투영)
E(n) ≈ Σ Âl·Llm·Ylm(n)   (셰이더, 9항)
```
앞 코드에 이어서, 부드러운 하늘과 여기에 작고 강한 해를 더한 환경을 투영해 무작위 법선 60개의 조도를 정의대로 적분한 값과 비교한다.
```python
def sh9(x, y, z):                    # 실수 구면 조화 함수 l = 0, 1, 2
    return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x,
            1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
            1.092548 * x * z, 0.546274 * (x * x - y * y)]
A = [math.pi] + [2 * math.pi / 3] * 3 + [math.pi / 4] * 5   # Â_l
def dot(a, b): return sum(p * q for p, q in zip(a, b))

G, h = [], math.pi / 60              # 위도·경도 격자: (방향, 입체각)
for i in range(60):
    for k in range(120):
        th, ph = (i + 0.5) * h, (k + 0.5) * h
        G.append(((math.sin(th) * math.cos(ph), math.cos(th),
                   math.sin(th) * math.sin(ph)), math.sin(th) * h * h))

def soft(d): return 0.2 + 0.8 * max(d[1], 0.0)        # 위(+y)가 밝은 하늘
def sunny(d): return soft(d) + 40 * max(0, dot(d, (0.48, 0.8, 0.36))) ** 64

normals = [[c / math.hypot(*v) for c in v]
           for v in ([rng.gauss(0, 1) for _ in range(3)] for _ in range(60))]
for name, env in (("부드러운 하늘", soft), ("하늘 + 해", sunny)):
    c = [0.0] * 9                    # 투영: L_lm = Σ L(ω) Y_lm(ω) Δω
    for d, w in G:
        c = [ci + env(d) * w * yi for ci, yi in zip(c, sh9(*d))]
    errs = [abs(sum(a * ci * yi for a, ci, yi in zip(A, c, sh9(*n)))  # SH
                / sum(env(d) * w * max(0.0, dot(d, n)) for d, w in G)  # 정의
                - 1) for n in normals]
    print(f"{name}: 평균 오차 {sum(errs) / 60:.2%}, 최대 {max(errs):.2%}")
```
```text
부드러운 하늘: 평균 오차 0.24%, 최대 1.23%
하늘 + 해: 평균 오차 7.64%, 최대 29.38%
```
부드러운 하늘은 평균 0.24%로 논문 수치 안쪽이지만, 해를 넣으면 최대 29%까지 틀린다. 계수 9개로는 좁은 각도에 몰린 빛을 담지 못하므로, 엔진은 해를 그림자와 함께 방향광으로 따로 계산하고(11편) SH에는 나머지 하늘과 반사광만 담는다. 셰이더는 RGB마다 9개, 모두 27개 상수로 2차 다항식 하나를 계산하며, Unity의 라이트 프로브도 이런 L2 SH를 저장한다.

## 정반사: 분할 합 근사
정반사는 시선, 법선, 거칠기에 모두 의존한다. 카리스(2013, 언리얼 엔진 4)의 **분할 합 근사**(split sum approximation)는 몬테카를로 합을 두 합의 곱으로 쪼갠다.
```text
∫ L(l)·f·(n·l) dl
 ≈ [Σ L(lk)(n·lk) / Σ (n·lk)]  ①
 × [∫ f·(n·l) dl]              ②
```
①은 반사 방향 r 주위로 GGX 로브(8편)만큼 흐린 환경 맵이다. n = v = r이라고 가정해 시선 의존성을 없애고, 거칠기 단계마다 큐브맵 밉 레벨에 담는다(흐릴수록 작은 밉으로 충분하다, 5편). ②는 흰 환경에서의 BRDF 적분이고, 슐릭 프레넬 덕분에 `F0 × A + B`로 쪼개져 (n·v, 거칠기)를 입력으로 하는 2채널 표 하나를 모든 재질이 같이 쓴다. 셰이더는 `textureLod(envMap, r, 거칠기 × 최대 밉)`에 `F0 × A + B`를 곱한다. 앞 코드에 이어서, 해가 있는 하늘에서 정의대로의 적분과 비교한다.
```python
def ggx_h(a, rng):                   # GGX 분포를 따르는 하프 벡터(축 +y)
    u, ph = rng.random(), 2 * math.pi * rng.random()
    ct = math.sqrt((1 - u) / (1 + (a * a - 1) * u))
    st = math.sqrt(1 - ct * ct)
    return (st * math.cos(ph), ct, st * math.sin(ph))

def refl(v, h): return [2 * dot(v, h) * c - x for c, x in zip(h, v)]
def g1(a, x): return 2 * x / (x + math.sqrt(a * a + (1 - a * a) * x * x))

def full(env, v, a, N, f0=0.04):     # 정의대로(중요도 표집), n = +y
    s = 0.0
    for _ in range(N):
        h = ggx_h(a, rng); l = refl(v, h)
        nl, nv, nh, vh = l[1], v[1], h[1], dot(v, h)
        if nl > 0:                   # f·(n·l)/pdf = F·G·(v·h)/((n·h)(n·v))
            F = f0 + (1 - f0) * (1 - vh) ** 5
            s += env(l) * F * g1(a, nl) * g1(a, nv) * vh / (nh * nv)
    return s / N

def split(env, v, a, N, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    rot = lambda d: env((d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]))
    num = den = 0.0                  # ① 사전 필터링: n = v = r로 가정하고
    for _ in range(N):               #    r을 +y로 돌려 놓은 환경에서 표집
        l = refl((0, 1, 0), ggx_h(a, rng))
        if l[1] > 0: num, den = num + rot(l) * l[1], den + l[1]
    return num / den * full(lambda d: 1.0, v, a, N)   # × ② BRDF 표

rng = random.Random(5)
for rough, deg in ((0.3, 0), (0.3, 70), (0.6, 0), (0.6, 70)):
    v = (math.sin(math.radians(deg)), math.cos(math.radians(deg)), 0)
    a = rough ** 2                   # α = 거칠기²
    ref, sp = full(sunny, v, a, 30000), split(sunny, v, a, 30000, deg)
    print(f"거칠기 {rough}, 시선 {deg:2}°: 분할 합 오차 {sp / ref - 1:+.1%}")
```
```text
거칠기 0.3, 시선  0°: 분할 합 오차 -0.7%
거칠기 0.3, 시선 70°: 분할 합 오차 -1.5%
거칠기 0.6, 시선  0°: 분할 합 오차 +3.2%
거칠기 0.6, 시선 70°: 분할 합 오차 -35.3%
```
몬테카를로 잡음(시드에 따라 2~3%)을 감안하면 거칠기 0.3은 시선과 관계없이 잘 맞지만, 거칠기 0.6에서 비스듬히 보면 35% 어둡다. 실제 로브는 비스듬한 시선에서 길쭉해지고 법선 쪽(밝은 하늘 쪽)으로 기우는데 n = v = r 가정이 이를 무시해서다. 상수 환경에서는 ①이 정확히 1이라 오차가 없다.

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 정의대로 IBL | 1,244억 회/초 | 1000표집, 1080p60 |
| SH 조도 | 27개(108B) | RGB × 9 |
| 256² 큐브맵 RGBA16F | 3MiB(밉 4MiB) | 256²×6×8B |
| SH 최대 오차(실험) | 1.2% / 29% | 해 없음 / 있음 |

## 어디에 쓰이나
- 8편 「물리 기반 렌더링: 마이크로패싯 BRDF와 GGX」: 분할 합의 ②는 화이트 퍼니스 테스트의 적분을 (n·v, 거칠기) 격자에서 미리 해 둔 표다.
- 선형대수 9편 「직교성과 사영」: SH 투영은 정규 직교 기저에 대한 사영이라, 계수 9개가 그 차수 안에서 제곱 오차가 가장 작은 근사다.
- 확률과 분포 11편 「표본 추출과 몬테카를로 방법」: 정의대로의 적분도, 분할 합 표 만들기도 GGX 중요도 표집을 쓴 몬테카를로 추정이다.
- 게임 엔진: 큐브맵은 한 점에서 찍은 것이라 장면 곳곳의 **반사 프로브**(Unity Reflection Probe, 언리얼 Box·Sphere Reflection Capture)에 구워 가까운 것을 섞어 쓰고, 상자 프로브는 반사 광선을 상자 벽과 교차시켜 실내 반사를 바로잡는다.

## 정리
- IBL은 환경 전체에 대한 적분을 미리 해 두고, 셰이더는 큐브맵·SH·표를 몇 번 읽는다.
- 큐브맵은 주축으로 면을 고르고 나머지 두 성분을 나눠 (s, t)를 만든다.
- 확산 조도는 SH 9개 계수로 부드러운 하늘에서 평균 0.2%대로 맞지만, 해 같은 강한 광원은 따로 다뤄야 한다.
- 분할 합은 사전 필터링 맵과 BRDF 표의 곱이며, 거친 면을 비스듬히 볼 때 크게 틀린다.

## 더 알아보기
- 이전 글: 8편 「물리 기반 렌더링: 마이크로패싯 BRDF와 GGX」
- 다음 글: 10편 「감마와 선형 공간, HDR과 톤 매핑」
- 라마무르티·한라한, An Efficient Representation for Irradiance Environment Maps(2001): https://graphics.stanford.edu/papers/envmap/
