# [게임 셰이더 7/16] 법선 맵과 탄젠트 공간: 평평한 면에 굴곡 그리기

> **한 줄 요약** — 조명은 법선만 보므로 삼각형 두 장짜리 벽에도 텍셀마다 기운 법선을 주면 굴곡이 보이고, 그 법선을 면에 붙은 탄젠트·바이탄젠트·법선(TBN) 좌표로 저장해야 회전·반복·변형된 면에서 재사용되며, 베이커와 엔진이 같은 탄젠트(MikkTSpace)를 써야 이음매가 생기지 않는다.

## 이 글에서 다루는 것
- 높이 맵에서 유한 차분으로 법선 만들기(해석적 법선과 오차 대조)
- 법선 맵 인코딩, 두 채널(BC5)에서 z 복원과 그 오차
- UV 미분에서 TBN 기저 구하기, 그람-슈미트, 손잡이 부호
- MikkTSpace와 GLSL 벽돌 벽 렌더링

## 문제: 굴곡마다 삼각형을 쓸 수는 없다
벽돌 벽을 삼각형 2개로 그리면 줄눈이 그림처럼 납작하고, 홈을 모델링하면 삼각형이 수만 개로 는다. 6편의 조명 식은 위치가 아니라 법선 N만 보므로, 면은 평평하게 두고 픽셀마다 N만 기울이면 굴곡처럼 보인다. 이것이 **범프 매핑**(bump mapping, 블린 1978)이고, 텍셀마다 법선을 저장한 텍스처를 **법선 맵**(normal map)이라 한다. 기하는 그대로라 실루엣과 드리우는 그림자는 여전히 평평하다(시차 매핑이나 테셀레이션 변위가 이를 보완한다).

## 높이 맵에서 법선으로
높이 h(x, y)인 면의 법선은 기울기의 반대 방향으로 기운 `(−∂h/∂x, −∂h/∂y, 1)`을 정규화한 것이다(미적분 7편의 그래디언트). 높이 맵에서는 미분 대신 중앙 차분 `(h(x+e) − h(x−e)) / 2e`를 쓰고, 그 오차는 e²에 비례한다. 해석적 높이 함수로 확인하고, 법선을 8비트로 저장할 때의 오차도 잰다. 저장은 [−1, 1]을 [0, 1]로 옮기는 `n × 0.5 + 0.5`이고, 법선 대부분이 (0, 0, 1) 근처라 법선 맵은 (128, 128, 255) 언저리의 파란색이다.
```python
import math, random

def dot(a, b): return sum(x * y for x, y in zip(a, b))
def norm(v): return tuple(x / math.sqrt(dot(v, v)) for x in v)
def angle(a, b):
    return math.degrees(math.acos(min(1, dot(norm(a), norm(b)))))

h = lambda x, y: 0.3 * math.sin(3 * x) * math.cos(2 * y)   # 높이 함수
def n_exact(x, y):                     # (-∂h/∂x, -∂h/∂y, 1)
    return (-0.9 * math.cos(3 * x) * math.cos(2 * y),
            0.6 * math.sin(3 * x) * math.sin(2 * y), 1.0)
def n_diff(x, y, e):                   # 중앙 차분
    return (-(h(x + e, y) - h(x - e, y)) / (2 * e),
            -(h(x, y + e) - h(x, y - e)) / (2 * e), 1.0)

rng = random.Random(7)
pts = [(rng.uniform(0, 6), rng.uniform(0, 6)) for _ in range(300)]
for e in (0.1, 0.05, 0.025):
    err = max(angle(n_diff(x, y, e), n_exact(x, y)) for x, y in pts)
    print(f"차분 간격 {e:<5}: 해석적 법선과 최대 {err:.4f}도")

q8 = lambda c: round((c * 0.5 + 0.5) * 255) / 255 * 2 - 1  # 8비트 저장·복원
e3, e2 = 0.0, {"z < 0.5": 0.0, "z ≥ 0.5": 0.0}
for _ in range(300):
    n = norm((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.05, 1)))
    x, y = q8(n[0]), q8(n[1])
    e3 = max(e3, angle((x, y, q8(n[2])), n))           # RGB 세 채널
    z = math.sqrt(max(0, 1 - x * x - y * y))           # 두 채널 + z 복원
    k = "z < 0.5" if n[2] < 0.5 else "z ≥ 0.5"
    e2[k] = max(e2[k], angle((x, y, z), n))
print(f"8비트 세 채널: 최대 {e3:.2f}도")
print("두 채널 + z 복원:",
      ", ".join(f"{k} 최대 {v:.2f}도" for k, v in e2.items()))
```
```text
차분 간격 0.1  : 해석적 법선과 최대 0.4281도
차분 간격 0.05 : 해석적 법선과 최대 0.1069도
차분 간격 0.025: 해석적 법선과 최대 0.0267도
8비트 세 채널: 최대 0.33도
두 채널 + z 복원: z < 0.5 최대 3.98도, z ≥ 0.5 최대 0.52도
```
간격을 반으로 줄일 때마다 오차가 4분의 1씩 준다. 탄젠트 공간 법선은 늘 z > 0인 단위 벡터라 z를 `√(1 − x² − y²)`로 되살릴 수 있어서, 두 채널만 담는 BC5(텍셀당 8비트)로 압축하는 일이 많다. 대가는 누운 법선(z < 0.5)에서 x, y 오차가 z로 증폭되는 것이다(최대 3.98도, BC5 블록 압축 오차는 별도). 초록 채널 방향도 도구마다 달라 블렌더는 OpenGL식(Y+), 언리얼 엔진은 DirectX식(Y−)이며, 맞지 않으면 굴곡이 뒤집혀 보인다.

## 탄젠트 공간: 면에 붙은 좌표계
법선을 물체 공간 좌표로 저장하면 그 자리에서만 맞는다. 회전한 벽, 반복한 바닥, 대칭으로 펼친 캐릭터, 13편의 스키닝으로 굽는 팔에 같은 텍스처를 쓰려면 **면 기준**으로 저장해야 한다. 면 위에서 u가 커지는 방향 T(탄젠트), v가 커지는 방향 B(바이탄젠트), 면의 법선 N이 이루는 기저가 **탄젠트 공간**(tangent space)이고, 셰이더는 `mat3(T, B, N) * n_ts`로 월드 법선을 얻는다. T와 B는 삼각형 변과 UV 차이에서 나온다.
```text
e1 = Δu1·T + Δv1·B
e2 = Δu2·T + Δv2·B
det = Δu1·Δv2 - Δu2·Δv1
T = (Δv2·e1 - Δv1·e2) / det
B = (Δu1·e2 - Δu2·e1) / det
```
T는 삼각형 면 위에 있지만 셰이더가 쓰는 N은 부드러운 셰이딩용 정점 법선이라 둘이 정확히 수직이 아니다. 그래서 **그람-슈미트**(Gram-Schmidt) 직교화로 T에서 N 성분을 빼고 정규화한다. B는 저장하지 않고 `cross(N, T) · w`로 다시 만든다. UV를 거울처럼 뒤집어 펼친 면은 det < 0이라 B가 반대를 향하므로, 그 부호 w(손잡이)를 탄젠트의 네 번째 성분에 담는다(glTF 2.0의 TANGENT가 w = ±1인 vec4인 이유). 면 법선을 흔든 정점 법선과 무작위 삼각형 300개로 확인한다(앞 코드에 이어서).
```python
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])

def tbn(e1, e2, d1, d2, N):
    """두 변 e1, e2, 그 UV 차 d1, d2, 정점 법선 N → T, B, 직교화한 T, w"""
    det = d1[0] * d2[1] - d2[0] * d1[1]
    T = tuple((d2[1] * a - d1[1] * b) / det for a, b in zip(e1, e2))
    B = tuple((d1[0] * b - d2[0] * a) / det for a, b in zip(e1, e2))
    To = norm(sub(T, tuple(dot(N, T) * c for c in N)))   # 그람-슈미트
    w = 1 if dot(cross(N, To), B) > 0 else -1             # 거울 UV면 -1
    return T, B, To, w, det

rec = hand = 0
before = after = 0.0
for _ in range(300):
    p = [[rng.uniform(-1, 1) for _ in range(3)] for _ in range(3)]
    uv = [(rng.random(), rng.random()) for _ in range(3)]
    e1, e2 = sub(p[1], p[0]), sub(p[2], p[0])
    d1, d2 = sub(uv[1], uv[0]), sub(uv[2], uv[0])
    N = norm([c + rng.uniform(-.3, .3) for c in norm(cross(e1, e2))])
    T, B, To, w, det = tbn(e1, e2, d1, d2, N)        # N: 부드러운 정점 법선
    for e, d in ((e1, d1), (e2, d2)):  # 정의: e = Δu·T + Δv·B
        rec += all(abs(c - d[0] * t - d[1] * b) < 1e-9
                   for c, t, b in zip(e, T, B))
    before = max(before, abs(dot(norm(T), N)))
    after = max(after, abs(dot(To, N)))
    hand += w == (1 if det > 0 else -1)
print(f"변 복원 e = Δu·T + Δv·B: {rec}/600, w = UV 행렬식 부호: {hand}/300")
print(f"최대 ∣T·N∣: 직교화 전 {before:.3f}, 후 {after:.1e}")
```
```text
변 복원 e = Δu·T + Δv·B: 600/600, w = UV 행렬식 부호: 300/300
최대 ∣T·N∣: 직교화 전 0.413, 후 1.7e-16
```
정점 탄젠트가 없으면 픽셀 셰이더에서 3편의 쿼드 미분(`dFdx`, `dFdy`)으로 위치와 UV의 변화를 구해 같은 식을 풀기도 한다.

## MikkTSpace: 굽는 쪽과 그리는 쪽이 같아야 한다
법선 맵은 보통 고해상도 모델의 법선을 저해상도 메시의 탄젠트 공간으로 옮겨 굽는다(bake). 이때의 T, B와 엔진의 T, B가 조금만 달라도 같은 텍셀이 다른 법선으로 풀려 UV 이음매에서 조명이 끊긴다. 삼각형 탄젠트를 정점에서 어떤 가중치로 평균하는지, B를 보간하는지 픽셀에서 다시 구하는지까지 맞아야 한다. 미켈센(2008)의 **MikkTSpace**는 이 계산을 순서에 무관하게 정한 구현으로, 블렌더가 쓰고 glTF 2.0이 권장하며, 언리얼 엔진 4.7(스태틱 메시)과 유니티 5.3부터 메시 탄젠트의 기본값이 됐다.

## 벽돌 벽 렌더링
법선이 +x를 향한 벽에 벽돌 높이 함수를 두고, 셰이더 안에서 중앙 차분으로 탄젠트 공간 법선을 만든 뒤 TBN으로 월드로 옮겨 램버트 조명을 한다. 하네스(WebGL2의 GLSL ES 3.00)의 출력이다.
```glsl
#version 300 es
precision highp float;
// render 36x12
in vec2 vUV;
out vec4 fragColor;
const vec3 T = vec3(0, 0, -1), B = vec3(0, 1, 0), N = vec3(1, 0, 0);
const vec3 L = vec3(0.53, 0.6, -0.6);  // 월드 빛 방향(벽은 +x를 향함)
float height(vec2 uv) {                // 벽돌 높이 맵: 줄눈 0, 벽돌 1
    vec2 q = uv * vec2(3.0, 3.0);
    q.x += 0.5 * mod(floor(q.y), 2.0); // 줄마다 반 칸 어긋나게
    vec2 f = min(fract(q), 1.0 - fract(q)) / 3.0;
    return smoothstep(0.0, 0.07, min(f.x, f.y));
}
void main() {
    const float E = 0.02, S = 0.05;    // 차분 간격, 높이 세기
    float hx = height(vUV + vec2(E, 0)) - height(vUV - vec2(E, 0));
    float hy = height(vUV + vec2(0, E)) - height(vUV - vec2(0, E));
    vec3 nt = normalize(vec3(-S * hx, -S * hy, 2.0 * E));  // 탄젠트 공간
    vec3 n = mat3(T, B, N) * nt;       // TBN: 탄젠트 공간 → 월드
    float c = 0.1 + 0.8 * max(dot(n, L), 0.0);
    fragColor = vec4(vec3(c), 1.0);
}
```
```text
:=########%#:=########%#:=########%#
:.-++++++*##:.-++++++*##:.-++++++*##
:.-++++++*##:.-++++++*##:.-++++++*##
:.........=#:.........=#:.........=#
####%#:=########%#:=########%#:=####
+++*##:.-++++++*##:.-++++++*##:.-+++
+++*##:.-++++++*##:.-++++++*##:.-+++
....=#:.........=#:.........=#:.....
:=########%#:=########%#:=########%#
:.-++++++*##:.-++++++*##:.-++++++*##
:.-++++++*##:.-++++++*##:.-++++++*##
:.........=#:.........=#:.........=#
```
빛이 탄젠트 공간의 오른쪽 위에서 오므로 벽돌의 윗변과 오른쪽 변(`#`)은 밝고 왼쪽·아랫변(`.`)은 어둡다. 평평한 곳(`+`)은 법선 맵이 없을 때와 같다. 위쪽 벽돌 한 줄을 파이썬으로 계산하면 GPU 출력과 같다(앞 코드에 이어서).
```python
def fract(x): return x - math.floor(x)
def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0), 1)
    return t * t * (3 - 2 * t)
def height(u, v):                      # 셰이더의 height()와 같은 식
    qx, qy = u * 3 + 0.5 * (math.floor(v * 3) % 2), v * 3
    f = min(fract(qx), 1 - fract(qx), fract(qy), 1 - fract(qy)) / 3
    return smoothstep(0, 0.07, f)

Tw, Bw, Nw, Lw = (0, 0, -1), (0, 1, 0), (1, 0, 0), (0.53, 0.6, -0.6)
E, S, RAMP = 0.02, 0.05, " .:-=+*#%@"
for y in range(11, 7, -1):             # 위쪽 4행(벽돌 한 줄)
    row = ""
    for x in range(36):
        u, v = (x + 0.5) / 36, (y + 0.5) / 12
        nt = norm((-S * (height(u + E, v) - height(u - E, v)),
                   -S * (height(u, v + E) - height(u, v - E)), 2 * E))
        n = [nt[0] * t + nt[1] * b + nt[2] * c for t, b, c in zip(Tw, Bw, Nw)]
        c8 = round(min(max(0.1 + 0.8 * max(dot(n, Lw), 0), 0), 1) * 255)
        row += RAMP[min(9, c8 * 10 // 256)]
    print(row.rstrip())
```
```text
:=########%#:=########%#:=########%#
:.-++++++*##:.-++++++*##:.-++++++*##
:.-++++++*##:.-++++++*##:.-++++++*##
:.........=#:.........=#:.........=#
```

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 범프 매핑 | 1978 | 블린 |
| BC5 (두 채널) | 8비트/텍셀 | 128비트/4×4 |
| 2048² BC5 + 밉 | 약 5.3MiB | 4MiB × 4/3 |
| 8비트 세 채널 오차 | 최대 0.33도 | 위 계산 |
| 두 채널 복원(z ≥ 0.5) | 최대 0.52도 | 위 계산 |
| MikkTSpace 기본값 | UE 4.7, Unity 5.3 | 엔진 문서 |

## 어디에 쓰이나
- 미적분 7편 「편미분과 그래디언트」: 높이 맵의 법선 `(−∂h/∂x, −∂h/∂y, 1)`은 그래디언트를 뒤집어 z 성분 1을 붙인 것이다.
- 선형대수 9편 「직교성과 사영」: 그람-슈미트는 T에서 N 방향 사영을 빼는 계산이다.
- 13편 「정점 애니메이션: 스키닝, 파도, 바람」: 스키닝은 법선과 함께 탄젠트도 뼈 행렬로 돌리므로, 굽은 팔에서도 같은 탄젠트 공간 법선 맵이 맞는다.

## 정리
- 조명은 법선만 보므로 픽셀마다 법선을 기울이면 평평한 면에 굴곡이 보인다(범프 매핑). 실루엣은 그대로다.
- 높이 맵 법선은 `(−∂h/∂x, −∂h/∂y, 1)`의 중앙 차분이고, 간격을 반으로 줄이면 오차가 4분의 1이 됐다.
- 탄젠트 공간 법선은 z > 0이라 두 채널(BC5)에 담고 z를 복원한다. 누운 법선에서는 오차가 커진다(최대 3.98도).
- TBN은 변과 UV 차이의 2×2 연립방정식에서 나오고, 그람-슈미트와 손잡이 w로 마무리한다. 베이커와 엔진은 같은 규칙(MikkTSpace)을 써야 한다.

## 더 알아보기
- 이전 글: 6편 「고전 조명 모델: 램버트, 퐁, 블린-퐁, 툰 셰이딩」
- 다음 글: 8편 「물리 기반 렌더링: 마이크로패싯 BRDF와 GGX」
- 위키백과 "Normal mapping": https://en.wikipedia.org/wiki/Normal_mapping
