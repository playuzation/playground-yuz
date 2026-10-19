# [게임 셰이더 8/16] 물리 기반 렌더링: 마이크로패싯 BRDF와 GGX

> **한 줄 요약** — 표면을 작은 거울의 집합으로 보면 반사는 D·F·G / (4(n·l)(n·v))가 되고, GGX 분포 D는 거칠기와 무관하게 적분이 1이라 거칠수록 넓고 어두워지며, 에너지를 만들지 않는 이 BRDF 덕에 기본색·금속성·거칠기 세 값이 어떤 조명에서도 같은 재질로 보인다.

## 이 글에서 다루는 것
- BRDF의 뜻과 조건(에너지 보존, 상반성), 램버트의 1/π
- 쿡-토런스 모델: GGX 법선 분포, 슐릭 프레넬, 스미스 가림 함수
- 파이썬 수치 적분으로 ∫D(h)(n·h)dω = 1과 화이트 퍼니스 테스트
- 금속성·거칠기 워크플로와 거칠기별 GGX 구 렌더링

## 문제: 조명이 바뀌면 재질이 무너진다
6편의 블린-퐁에서 지수 n을 올리면 하이라이트는 좁아지는데 꼭대기 밝기는 그대로라 반사광 총량이 준다. 그래서 장면마다 ks와 n을 다시 맞춰야 하고, 다른 조명으로 옮기면 재질이 플라스틱처럼 보이거나 스스로 빛난다. **물리 기반 렌더링**(physically based rendering, PBR)은 반사 모델에 물리적 제약을 걸어 한 번 정한 재질 값이 어떤 조명에서도 맞게 한다.

## BRDF: 들어온 빛과 나간 빛의 비
**BRDF**(bidirectional reflectance distribution function) f(l, v)는 방향 l에서 들어온 빛이 v로 나가는 비이고, 나가는 빛은 모든 입사 방향의 적분이다.
```text
Lo(v) = ∫ f(l, v) · Li(l) · (n·l) dω
```
물리적인 BRDF는 음수가 아니고, l과 v를 바꿔도 같으며(**상반성**, reciprocity), 받은 것보다 많이 내보내지 않는다(**에너지 보존**: 모든 v에서 `∫ f·(n·l) dω ≤ 1`). 반구에서 `∫(n·l)dω = π`이므로 램버트 BRDF는 `albedo / π`여야 흰 표면이 받은 빛을 정확히 다 돌려준다.

## 마이크로패싯과 쿡-토런스 모델
거친 표면도 확대하면 방향이 제각각인 작은 거울(**마이크로패싯**, microfacet, 이하 미세면)들이고, l에서 온 빛을 v로 보내는 것은 법선이 하프 벡터 h = normalize(l + v)인 거울뿐이다. 쿡과 토런스(1982)의 모델은 그런 거울의 비율, 거울의 반사율, 가려지지 않는 비율을 곱한다.
```text
f = D(h)·F(v·h)·G(l, v)
    / (4 (n·l)(n·v))
```
분모는 미세면 법선의 입체각을 반사 방향의 입체각으로 바꾸는 야코비안 1/(4(v·h))과 넓이 투영에서 나온다.

**D: 법선 분포.** 미세면 법선이 h 근처에 얼마나 몰려 있는지다. 실시간 렌더링의 표준인 **GGX**(트로브리지·라이츠 1975, 월터 외 2007)는 `D = α² / (π((n·h)²(α² − 1) + 1)²)`이다. 블린-퐁의 (N·H)ⁿ 자리지만, 미세면 넓이를 거시 면에 투영하면 원래 넓이가 돼야 하므로 `∫D(h)(n·h)dω = 1`이 α와 무관하게 성립한다. 거칠수록 넓어지는 만큼 낮아진다. 꼬리가 길어 하이라이트 둘레가 은은하게 번진다. 디즈니(벌리 2012)는 아티스트의 거칠기 r을 `α = r²`으로 바꾸면 지각적으로 고르게 변한다고 보고했다.

**F: 프레넬.** 표면은 비스듬히 볼수록 더 많이 반사한다. **슐릭 근사**(슐릭 1994)는 `F = F0 + (1 − F0)(1 − v·h)⁵`이고, 수직으로 볼 때의 반사율 F0은 굴절률 η에서 `((η − 1)/(η + 1))²`이다.

**G: 가림 함수.** 미세면이 서로 빛이나 반사광을 가리는 비율이다. 스미스(1967)의 방식으로 한 방향씩 `G1(x) = 2(n·x) / ((n·x) + √(α² + (1 − α²)(n·x)²))`을 구해 `G = G1(l)·G1(v)`로 곱한다. 언리얼 엔진 4(카리스 2013)는 이를 슐릭식 근사와 `k = (r + 1)² / 8`로 줄여 쓴다.

## 파이썬으로 확인: 정규화, 프레넬, 화이트 퍼니스
반구 적분을 θ 방향 중점 적분(dω = sin θ dθ dφ)으로 계산해 램버트와 GGX의 정규화를 확인한다.
```python
import math

def D_ggx(nh, a):                      # GGX(트로브리지-라이츠) 법선 분포
    a2 = a * a
    return a2 / (math.pi * (nh * nh * (a2 - 1) + 1) ** 2)
def G1(nx, a):                         # 스미스 가림 함수(GGX), 한 방향
    return 2 * nx / (nx + math.sqrt(a * a + (1 - a * a) * nx * nx))
def F_schlick(vh, f0):
    return f0 + (1 - f0) * (1 - vh) ** 5

def hemi(f, K=100000):                 # ∫ f(cosθ) dω, dω = sinθ dθ dφ
    d = math.pi / 2 / K
    return 2 * math.pi * d * sum(f(math.cos((i + .5) * d))
                                 * math.sin((i + .5) * d) for i in range(K))

print(f"램버트 ∫(1/π)(n·l)dω = {hemi(lambda c: c / math.pi):.6f}")
for r in (0.1, 0.3, 0.6, 1.0):
    a = r * r                          # 디즈니식 α = 거칠기²
    print(f"거칠기 {r}: ∫D(h)(n·h)dω = {hemi(lambda c: D_ggx(c, a) * c):.6f}")
```
```text
램버트 ∫(1/π)(n·l)dω = 1.000000
거칠기 0.1: ∫D(h)(n·h)dω = 1.000000
거칠기 0.3: ∫D(h)(n·h)dω = 1.000000
거칠기 0.6: ∫D(h)(n·h)dω = 1.000000
거칠기 1.0: ∫D(h)(n·h)dω = 1.000000
```
이어서 슐릭 근사를 정확한 프레넬 식과 비교하고 **화이트 퍼니스 테스트**(white furnace test)를 한다. 사방이 고르게 밝은 환경에서 F = 1인 물체는 받은 빛을 다 돌려줘야 배경과 구별되지 않는다. 방향 반사율 `E(v) = ∫ f·(n·l) dω`를 h를 D(h)(n·h)에 비례하게 뽑는 중요도 표집으로 구하고, 해석적 정답(α = 1, 수직 시선에서 1 − ln 2)으로 적분기를 검사한다(앞 코드에 이어서).
```python
def fresnel(c, eta):                   # 공기 → 유전체, 편광 평균(정확한 식)
    t = math.sqrt(1 - (1 - c * c) / eta ** 2)
    rs = ((c - eta * t) / (c + eta * t)) ** 2
    rp = ((t - eta * c) / (t + eta * c)) ** 2
    return (rs + rp) / 2

f0 = ((1.5 - 1) / (1.5 + 1)) ** 2      # 유리·플라스틱, η = 1.5
err = max(abs(F_schlick(math.cos(math.radians(d)), f0)
              - fresnel(math.cos(math.radians(d)), 1.5)) for d in range(90))
print(f"F0 = {f0:.4f}, 슐릭 근사의 최대 오차(0~89도) {err:.4f}")

def furnace(nv, a, n=200):
    """F = 1인 방향 반사율 ∫f·(n·l)dω. GGX 중요도 표집(n×n 격자)."""
    v, tot = (math.sqrt(1 - nv * nv), 0.0, nv), 0.0
    for i in range(n):
        x = (i + .5) / n
        ch = math.sqrt((1 - x) / (1 + (a * a - 1) * x))  # h ~ D(h)(n·h)
        sh = math.sqrt(1 - ch * ch)
        for j in range(n):
            p = 2 * math.pi * (j + .5) / n
            vh = v[0] * sh * math.cos(p) + nv * ch
            nl = 2 * vh * ch - nv                        # l = reflect(-v, h)
            if vh > 0 and nl > 0:
                tot += G1(nl, a) * G1(nv, a) * vh / (nv * ch)
    return tot / n / n

print(f"α = 1, n·v = 1: {furnace(1.0, 1.0):.4f}"
      f" (정답 1 - ln 2 = {1 - math.log(2):.4f})")
for r in (0.2, 0.5, 1.0):
    e = [furnace(nv, r * r) for nv in (1.0, 0.5, 0.1)]
    print(f"거칠기 {r}: n·v = 1, 0.5, 0.1 →", " ".join(f"{x:.3f}" for x in e))
```
```text
F0 = 0.0400, 슐릭 근사의 최대 오차(0~89도) 0.0357
α = 1, n·v = 1: 0.3069 (정답 1 - ln 2 = 0.3069)
거칠기 0.2: n·v = 1, 0.5, 0.1 → 1.000 0.995 0.923
거칠기 0.5: n·v = 1, 0.5, 0.1 → 0.916 0.855 0.857
거칠기 1.0: n·v = 1, 0.5, 0.1 → 0.307 0.409 0.558
```
F0 식으로 계산하면 물(η = 1.33)은 0.020, 다이아몬드(2.42)는 0.172이고, 흔한 비금속이 0.02~0.05라 엔진은 0.04를 기본값으로 쓴다. 퍼니스 결과는 모두 1 이하지만 거칠수록 빛이 빠진다. 미세면 사이에서 여러 번 튄 빛을 G가 가린 것으로 버리기 때문이며, 그 몫을 표로 되돌리는 다중 산란 보정을 쓰는 엔진도 있다.

## 금속성·거칠기 워크플로
디즈니(2012)와 언리얼 엔진 4(2013) 이후 실시간 엔진은 재질을 주로 기본색, **금속성**(metallic), **거칠기**(roughness) 셋으로 받는다. 비금속은 F0 = 0.04에 기본색만큼 확산을 더하고, 금속은 확산 없이 기본색이 곧 색 있는 F0이다. 셰이더에서는 `F0 = mix(vec3(0.04), base, metallic)`, 확산은 `(1 − metallic)·base/π`다. 중간값은 녹이나 먼지 경계를 섞을 때만 쓴다. 거칠기 0.25, 0.5, 0.75인 금속 구(F0 = 0.9)를 하네스(WebGL2의 GLSL ES 3.00)로 렌더링한다.
```glsl
#version 300 es
precision highp float;
// render 36x7
in vec2 vUV;
out vec4 fragColor;
const float PI = 3.14159265;
const vec3 L = vec3(-0.48, 0.6, 0.64), V = vec3(0.0, 0.0, 1.0);
const vec3 BASE = vec3(0.9);           // 기본색
const float METAL = 1.0, LIGHT = 2.0;  // 금속성, 빛의 세기
float D(float nh, float a) {           // GGX 법선 분포
    float d = nh * nh * (a * a - 1.0) + 1.0;
    return a * a / (PI * d * d);
}
float G1(float nx, float a) {          // 스미스 가림(GGX)
    return 2.0 * nx / (nx + sqrt(a * a + (1.0 - a * a) * nx * nx));
}
void main() {
    float rough = 0.25 + 0.25 * floor(vUV.x * 3.0);  // 0.25, 0.5, 0.75
    vec2 p = vec2(fract(vUV.x * 3.0) * 2.0 - 1.0,
                  (vUV.y * 2.0 - 1.0) * 1.1);
    if (dot(p, p) > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 N = vec3(p, sqrt(1.0 - dot(p, p))), H = normalize(L + V);
    float nl = max(dot(N, L), 0.0), nv = max(dot(N, V), 1e-4);
    float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
    float a = rough * rough;           // α = 거칠기²
    vec3 F0 = mix(vec3(0.04), BASE, METAL);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - vh, 5.0);  // 슐릭 프레넬
    vec3 spec = D(nh, a) * F * G1(nl, a) * G1(nv, a) / (4.0 * nl * nv + 1e-4);
    vec3 diff = (1.0 - METAL) * BASE / PI;           // 금속은 확산 없음
    fragColor = vec4((diff + spec) * LIGHT * nl + 0.12, 1.0);  // + 주변광
}
```
```text
    ....        ....        -:::
 ..........  .:-+=:....  --===-:::.
...%@+.......:=@@@=:....:-=+++=-:...
..............:==-:.....:--==--::...
........................:::::::.....
 ..........  ..........  ..........
    ....        ....        ....
```
거칠기 0.25의 하이라이트는 작고 눈부시며(`%@+`), 0.5는 넓어지고, 0.75는 위쪽 절반에 퍼지는 대신 어둡다(`+`). D의 적분이 1이라 넓어진 만큼 낮아진다. 하이라이트가 있는 가운데 세 행을 파이썬으로 계산하면 GPU 출력과 같다(앞 코드에 이어서).
```python
def dot(a, b): return sum(x * y for x, y in zip(a, b))
Lt, RAMP = (-0.48, 0.6, 0.64), " .:-=+*#%@"
Ht = (Lt[0], Lt[1], Lt[2] + 1)         # H = normalize(L + V), V = (0,0,1)
Ht = tuple(c / math.sqrt(dot(Ht, Ht)) for c in Ht)

def pbr(x, y):                         # 셰이더와 같은 식, 픽셀 (x, y)
    u, v = (x + .5) / 36, (y + .5) / 7
    rough = 0.25 + 0.25 * math.floor(u * 3)
    p = ((u * 3 - math.floor(u * 3)) * 2 - 1, (v * 2 - 1) * 1.1)
    if dot(p, p) > 1: return 0.0
    n = (*p, math.sqrt(1 - dot(p, p)))
    nl, nv, nh = max(dot(n, Lt), 0), max(n[2], 1e-4), max(dot(n, Ht), 0)
    a, F = rough * rough, F_schlick(Ht[2], 0.9)      # 금속: F0 = 기본색
    spec = D_ggx(nh, a) * F * G1(nl, a) * G1(nv, a) / (4 * nl * nv + 1e-4)
    return spec * 2.0 * nl + 0.12

for y in range(5, 2, -1):              # 위에서 2~4번째 행
    c8 = [round(min(max(pbr(x, y), 0), 1) * 255) for x in range(36)]
    print("".join(RAMP[min(9, c * 10 // 256)] for c in c8).rstrip())
```
```text
 ..........  .:-+=:....  --===-:::.
...%@+.......:=@@@=:....:-=+++=-:...
..............:==-:.....:--==--::...
```

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 비금속 F0 | 0.04 | η = 1.5, 위 계산 |
| 물 / 다이아몬드 F0 | 0.020 / 0.172 | η = 1.33 / 2.42 |
| 슐릭 최대 오차(유리) | 0.036 | 위 계산 |
| 퍼니스, 거칠기 1 | 0.307 (수직) | 1 − ln 2 |
| 스미스 / 트로브리지·라이츠 | 1967 / 1975 | 원 논문 |
| 쿡-토런스 / 슐릭 | 1982 / 1994 | 원 논문 |
| GGX(월터 외) | 2007 | EGSR |
| 디즈니 / UE4 | 2012 / 2013 | SIGGRAPH 강좌 |

## 어디에 쓰이나
- 확률과 분포 11편 「표본 추출과 몬테카를로 방법」: 퍼니스 테스트의 GGX 중요도 표집은 피적분 함수에 비례하게 표본을 뽑는 몬테카를로 방법이다.
- 9편 「이미지 기반 조명: 큐브맵, 구면 조화 함수, 분할 합 근사」: 이 BRDF를 환경 전체에 대해 적분하는 일을 사전 필터링한 환경 맵과 BRDF 적분 표로 나눠 미리 계산한다.

## 정리
- BRDF는 음수가 아니고 상반적이며 에너지를 만들지 않아야 한다. 램버트의 1/π가 그 예다.
- 쿡-토런스 BRDF는 D·F·G / (4(n·l)(n·v))이고, GGX의 `∫D(h)(n·h)dω`는 거칠기와 무관하게 1이었다.
- 슐릭 근사는 유리에서 최대 0.036 차이였다. 퍼니스 반사율은 1 이하였고 거칠수록 줄었다(거칠기 1에서 1 − ln 2).
- 금속성·거칠기 워크플로는 `F0 = mix(0.04, base, metallic)`와 `α = r²`로 셰이더에 들어간다.

## 더 알아보기
- 이전 글: 7편 「법선 맵과 탄젠트 공간: 평평한 면에 굴곡 그리기」
- 다음 글: 9편 「이미지 기반 조명: 큐브맵, 구면 조화 함수, 분할 합 근사」
- 월터 외 2007, "Microfacet Models for Refraction through Rough Surfaces": https://www.graphics.cornell.edu/~bjw/microfacetbsdf.pdf
