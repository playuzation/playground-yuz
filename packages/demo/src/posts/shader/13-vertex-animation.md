# [게임 셰이더 13/16] 정점 애니메이션: 스키닝, 파도, 바람

> **한 줄 요약** — 모양이 바뀌는 메시는 정점을 GPU에 둔 채 정점 셰이더가 뼈 행렬이나 파동 식으로 위치와 법선을 다시 계산하는데, 행렬을 그냥 섞는 선형 블렌드 스키닝은 원기둥을 180° 비틀면 부피가 74%로 줄고 듀얼 쿼터니언은 부피를 지킨다.

## 이 글에서 다루는 것
- 뼈 행렬 팔레트로 정점을 섞는 선형 블렌드 스키닝(LBS)
- 비틀면 쪼그라드는 사탕 포장지 문제와 듀얼 쿼터니언 스키닝(DQS)
- 게르스트너 파도의 뾰족한 마루와 해석적 법선
- 정점 색으로 칠해 두는 바람 흔들림

## 선형 블렌드 스키닝
정점 2만 개짜리 캐릭터를 CPU에서 변형하면 프레임마다 480KB(위치·법선)를 올려야 하지만, 바뀌는 것은 뼈 60개의 행렬 3.84KB뿐이다. 그래서 정점 셰이더가 2편의 모델·뷰·투영 변환 앞에서 변형한다. 메시는 **바인드 포즈**(bind pose, T자 같은 기준 자세)로 만들고 정점마다 뼈 번호와 **가중치**(weight)를 붙인다. 뼈 j의 현재 행렬 Cⱼ와 바인드 포즈 행렬 Bⱼ로 만든 `Mⱼ = Cⱼ·Bⱼ⁻¹`의 배열이 **뼈 행렬 팔레트**(matrix palette)이고, **선형 블렌드 스키닝**(linear blend skinning, LBS)은 `v' = Σ wⱼ·Mⱼ·v`(Σ wⱼ = 1), 곧 행렬을 가중 평균해 한 번 곱한다. 정점당 뼈는 vec4에 맞춰 4개까지가 보통이다. glTF 2.0의 `JOINTS_0`·`WEIGHTS_0`이 4성분이고, Unity의 Skin Weights 설정은 1·2·4개와 제한 없음 중에서 고르며 4개를 넘으면 컴퓨트 셰이더가 필요하다. OpenGL ES 3.0이 보장하는 정점 유니폼은 vec4 256개라 mat4 팔레트는 60개 남짓이 한계다.
```glsl
#version 300 es
const int MAX_BONES = 60;         // 60 × 4 + 4 ≤ 256 벡터
uniform mat4 uBones[MAX_BONES];   // Mⱼ = Cⱼ·Bⱼ⁻¹
uniform mat4 uViewProj;
in vec3 aPos;
in vec3 aNormal;
in uvec4 aJoints;                 // 뼈 번호 4개
in vec4 aWeights;                 // 가중치 4개, 합 1
out vec3 vNormal;
void main() {
    mat4 skin = aWeights.x * uBones[aJoints.x]
              + aWeights.y * uBones[aJoints.y]
              + aWeights.z * uBones[aJoints.z]
              + aWeights.w * uBones[aJoints.w];
    vNormal = normalize(mat3(skin) * aNormal);
    gl_Position = uViewProj * (skin * vec4(aPos, 1.0));
}
```
WebGL2에서 컴파일을 확인했다. 법선을 3×3 부분으로 돌린 것은 균일 스케일 가정이고, 아니면 6편의 역전치 행렬이 필요하다.

## 사탕 포장지 문제와 듀얼 쿼터니언
회전 행렬의 평균은 회전이 아니다. 손목을 팔 축 둘레로 180° 비틀면 가중치가 반반인 정점에서 항등 행렬과 180° 회전의 평균이 축 성분만 남겨, 사탕 포장지처럼 가운데가 잘록해진다(candy-wrapper artifact). 단면을 복소평면으로 보면 반지름이 `∣(1 − w) + w·e^(iθ)∣`배, w = 0.5에서 `cos(θ/2)`배다.

**듀얼 쿼터니언 스키닝**(dual quaternion skinning, DQS, 카반 외 2007)은 뼈의 강체 변환을 듀얼 쿼터니언(회전 qr, 이동 t를 담은 이중부 qd = ½·t·qr)으로 바꿔 가중 평균하고 정규화한다. 정규화한 결과는 언제나 회전과 이동뿐이라 쪼그라들지 않는다. 원기둥 가운데 구간에서 가중치를 뼈 0에서 뼈 1로 넘기고 뼈 1을 축 둘레로 비튼다(이동이 없어 이중부는 0). 단면이 원으로 남으므로 반지름을 적분해 부피를 구한다. 고리를 정확히 w·θ만큼 돌리는 이상적인 비틀기라면 부피는 그대로다.
```python
import math

def qmul(a, b):                       # 쿼터니언 곱, (w, x, y, z)
    aw, ax, ay, az = a; bw, bx, by, bz = b
    return (aw*bw - ax*bx - ay*by - az*bz, aw*bx + ax*bw + ay*bz - az*by,
            aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw)

def lbs(p, w, t):                     # 행렬 (1-w)·I + w·Rx(t)를 곱한다
    c, s = math.cos(t), math.sin(t)
    return [p[0], (1-w)*p[1] + w*(c*p[1] - s*p[2]),
            (1-w)*p[2] + w*(s*p[1] + c*p[2])]

def dqs(p, w, t):                     # 실수부만 섞는다(이중부 0)
    r = [(1-w) + w*math.cos(t/2), w*math.sin(t/2), 0, 0]
    n = math.hypot(*r); r = [c/n for c in r]        # 정규화 → 순수 회전
    return qmul(qmul(r, (0, *p)), (r[0], -r[1], -r[2], -r[3]))[1:]

def twist(f, th, n=2001):
    """길이 2, 반지름 0.5. x=0.5~1.5에서 뼈 1 가중치 0→1. (부피, 가운데 반지름)"""
    r = []
    for i in range(n):
        u = min(max(2*i/(n-1) - 0.5, 0), 1)
        p = f((0, 0.5, 0), u*u*(3 - 2*u), th)      # smoothstep 가중치
        r.append(math.hypot(p[1], p[2]))
    vol = sum(math.pi*x*x for x in r) - math.pi*(r[0]**2 + r[-1]**2)/2
    return vol * 2/(n-1), r[n//2]

v0 = twist(lbs, 0)[0]                               # 비틀기 전 부피
for deg in (90, 180):
    th = math.radians(deg)
    res = {"LBS": twist(lbs, th), "DQS": twist(dqs, th)}
    print(f"{deg}° 부피:", ", ".join(f"{k} {v/v0:.1%}" for k, (v, r) in res.items()))
    print(f"  가운데 반지름 LBS {res['LBS'][1]:.3f}, 0.5·cos(θ/2) = "
          f"{0.5*math.cos(th/2):.3f}, DQS {res['DQS'][1]:.3f}")
```
```text
90° 부피: LBS 87.1%, DQS 100.0%
  가운데 반지름 LBS 0.354, 0.5·cos(θ/2) = 0.354, DQS 0.500
180° 부피: LBS 74.3%, DQS 100.0%
  가운데 반지름 LBS 0.000, 0.5·cos(θ/2) = 0.000, DQS 0.500
```

180°에서 LBS의 가운데 고리는 공식대로 한 점으로 모이고 부피의 4분의 1이 사라진다. DQS는 이상적인 비틀기처럼 100%다. 실제 구현은 섞기 전에 첫 뼈와 내적이 음수인 쿼터니언의 부호를 뒤집는다(q와 −q는 같은 회전). DQS는 굽힘에서 관절 바깥이 부푸는 경향이 있어 블렌더의 Preserve Volume처럼 선택 옵션으로 두는 도구가 많다.

## 게르스트너 파도
사인파를 더해 높이만 올린 바다는 마루가 둥글다. **게르스트너 파도**(Gerstner wave)는 정점을 마루 쪽으로 수평으로도 모아 마루를 뾰족하게, 골을 넓게 만든다. 방향 D인 파동 하나는 `P = (x + q·A·Dx·cos θ, A·sin θ, z + q·A·Dz·cos θ)`, `θ = k·(D·(x, z)) − ω·t`다(GPU Gems 1권 1장의 꼴). k = 2π/파장, A는 진폭, `ω = √(g·k)`는 깊은 물의 분산 관계, q는 날카로움이다. 단면의 수평 위치 `X(a) = a + q·A·cos(k·a)`의 기울기 `1 − q·k·A·sin(k·a)` 때문에 q·k·A > 1이면 마루에 고리가 생긴다. 아래 셰이더는 X(a) = x를 이분법으로 풀어 단면을 그린다. 위 띠는 사인파(q = 0), 아래는 q·k·A = 0.9다.
```glsl
#version 300 es
precision highp float;
// render 36x10
in vec2 vUV;
out vec4 fragColor;
const float K = 6.2831853 / 18.0, A = 2.0;   // 파장 18픽셀, 진폭 2픽셀
float height(float x, float q) {      // 수평 위치 x의 높이
    float lo = x - q * A, hi = x + q * A;
    for (int i = 0; i < 30; i++) {    // X(a) = a + q·A·cos(K·a) = x 풀기
        float m = 0.5 * (lo + hi);
        if (m + q * A * cos(K * m) < x) lo = m; else hi = m;
    }
    return A * sin(K * 0.5 * (lo + hi));
}
void main() {
    vec2 p = vUV * vec2(36.0, 10.0);  // 픽셀 단위
    bool top = p.y > 5.0;             // 위: 사인파, 아래: q·K·A = 0.9
    float h = (top ? 7.5 : 2.5) + height(p.x, top ? 0.0 : 0.9 / (K * A));
    fragColor = vec4(vec3(clamp(h - p.y + 0.5, 0.0, 1.0)), 1.0);
}
```
```text
   -+-               -+-
 +@@@@@+           +@@@@@+
%@@@@@@@%.       .%@@@@@@@%.       .
@@@@@@@@@@=     +@@@@@@@@@@@=     =@
@@@@@@@@@@@@*+*@@@@@@@@@@@@@@@*+*@@@
    +                 +
   :@:               :@:
  =@@@=             =@@@=
=%@@@@@%=         =%@@@@@%=
@@@@@@@@@@%*+++*%@@@@@@@@@@@%*+++*%@
```
같은 진폭인데 아래 띠는 마루가 뾰족하고 골이 평평하다. 3D 정점 셰이더는 파동 3개를 더하며 편미분 ∂P/∂x, ∂P/∂z를 누적해 외적으로 법선을 낸다(qᵢ = Q/(kᵢ·Aᵢ·3)이면 Σ qᵢ·kᵢ·Aᵢ = Q).
```glsl
#version 300 es
uniform mat4 uViewProj;
uniform float uTime;
in vec3 aPos;                    // 평평한 격자
out vec3 vNormal;
const vec3 W[3] = vec3[3](       // (방향 x, 방향 z, 파장 m)
    vec3(1, 0, 20), vec3(0.6, 0.8, 9), vec3(-0.7, 0.71, 5));
const float AMP[3] = float[3](0.5, 0.25, 0.15);
const float Q = 0.8;             // Σ qᵢ·kᵢ·Aᵢ = Q ≤ 1
void main() {
    vec3 p = aPos, dx = vec3(1, 0, 0), dz = vec3(0, 0, 1);
    for (int i = 0; i < 3; i++) {
        vec2 d = normalize(W[i].xy);
        float k = 6.2831853 / W[i].z, A = AMP[i], q = Q / (k * A * 3.0);
        float th = k * dot(d, aPos.xz) - sqrt(9.8 * k) * uTime;
        float c = cos(th), s = sin(th);
        p += A * vec3(q * d.x * c, s, q * d.y * c);
        dx += k * A * d.x * vec3(-q * d.x * s, c, -q * d.y * s);
        dz += k * A * d.y * vec3(-q * d.x * s, c, -q * d.y * s);
    }
    vNormal = normalize(cross(dz, dx));   // ∂P/∂z × ∂P/∂x
    gl_Position = uViewProj * vec4(p, 1.0);
}
```
파이썬으로 해석적 법선을 중앙 차분과 비교하고, 높이장 기울기로 구한 법선도 잰다.
```python
import math, random
W = [(1, 0, 20), (0.6, 0.8, 9), (-0.7, 0.71, 5)]; AMP = [0.5, 0.25, 0.15]

def wave(x, z, t, Q=0.8):
    """정점 셰이더와 같은 식. 위치, ∂P/∂x, ∂P/∂z, 높이장 기울기"""
    p, dx, dz, g = [x, 0, z], [1, 0, 0], [0, 0, 1], [0, 0]
    for (ux, uz, L), A in zip(W, AMP):
        n = math.hypot(ux, uz); ux, uz = ux/n, uz/n
        k = 2*math.pi/L; q = Q/(k*A*3)
        th = k*(ux*x + uz*z) - math.sqrt(9.8*k)*t
        c, s = math.cos(th), math.sin(th)
        p = [p[0] + A*q*ux*c, p[1] + A*s, p[2] + A*q*uz*c]
        for d, u in ((dx, ux), (dz, uz)):
            for i, v in enumerate((-q*ux*s, c, -q*uz*s)): d[i] += k*A*u*v
        g = [g[0] + k*A*ux*c, g[1] + k*A*uz*c]
    return p, dx, dz, g

cross = lambda a, b: [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2],
                      a[0]*b[1] - a[1]*b[0]]
def ang(a, b):
    c = sum(i*j for i, j in zip(a, b)) / math.hypot(*a) / math.hypot(*b)
    return math.degrees(math.acos(min(1.0, c)))

rng, h, e1, e2 = random.Random(3), 1e-5, 0.0, 0.0
for _ in range(300):
    x, z, t = rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(0, 100)
    _, dx, dz, g = wave(x, z, t)
    n = cross(dz, dx)
    d = lambda a, b: [(i - j)/(2*h) for i, j in zip(wave(*a, t)[0], wave(*b, t)[0])]
    fd = cross(d((x, z+h), (x, z-h)), d((x+h, z), (x-h, z)))  # 중앙 차분
    e1, e2 = max(e1, ang(n, fd)), max(e2, ang(n, [-g[0], 1, -g[1]]))
print(f"무작위 300점, 해석적 법선 대 유한 차분: 최대 {e1:.6f}°")
print(f"수평 이동을 무시한 높이장 법선: 최대 {e2:.1f}° 어긋남")
```
```text
무작위 300점, 해석적 법선 대 유한 차분: 최대 0.000001°
수평 이동을 무시한 높이장 법선: 최대 7.4° 어긋남
```

높이장 기울기만 쓰면 수평 이동을 무시해 7.4°까지 어긋나 하이라이트가 엉뚱한 곳에 생긴다. 넓은 바다는 FFT로 수많은 파동을 합한 변위 텍스처를 쓴다(테센도르프의 강좌 노트 「Simulating Ocean Water」).

## 바람: 정점 색으로 흔들림 칠하기
풀과 나무는 뼈 없이 흔든다. 정점 색 한 채널(c.r)에 흔들림 세기(뿌리 0, 끝 1)를 칠해 두고 `offset = windDir·strength·c.r·sin(ω·t + dot(instancePos, k))`처럼 변위에 곱하며, 위상은 인스턴스의 월드 위치에서 만든다. 크라이시스의 식생 셰이더(GPU Gems 3 16장, 2007)는 식물 전체가 휘는 큰 굽힘과 잎이 떠는 세부 굽힘을 겹쳤다. 이 변위는 GPU 안에서만 일어나므로 컬링용 경계 상자는 흔들림 폭만큼 넉넉해야 한다.

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 정점당 뼈 | 4개 | glTF 2.0 vec4 |
| 뼈 60개 팔레트 | 3.84KB/프레임 | 64B × 60 |
| 정점 유니폼 최소 | vec4 256개 | OpenGL ES 3.0 |
| LBS 180° 비틀기 | 부피 74.3% | 위 실험 |

## 어디에 쓰이나
- 선형대수 4편 「선형 변환으로서의 행렬」: 회전 행렬의 가중 평균이 회전이 아니라는 점이 사탕 포장지 문제의 원인이다.
- 미적분 7편 「편미분과 그래디언트」: 게르스트너 법선은 곡면의 두 편미분 벡터의 외적이다.
- 게임 자원 관리 13편 「플라이웨이트와 더티 플래그: 공유하고, 바뀐 것만 다시 계산하기」: 메시를 공유하고 위상만 인스턴스마다 다른 바람 셰이더는 플라이웨이트다.

## 정리
- 스키닝은 뼈 행렬만 넘겨 정점 셰이더에서 가중 평균한다.
- 행렬을 섞는 LBS는 비틀면 반지름이 cos(θ/2)배로 줄어 180°에서 부피 74%, 듀얼 쿼터니언을 섞는 DQS는 100%다.
- 게르스트너 파도는 정점을 마루로 모아 뾰족하게 만들고, 법선은 두 편미분의 외적으로 정확히 구한다.
- 바람은 정점 색의 세기와 인스턴스 위치의 위상으로 흔든다.

## 더 알아보기
- 이전 글: 12편 「투명도와 블렌딩: 알파 블렌딩, 그리는 순서, 프리멀티플라이드 알파」
- 다음 글: 14편 「포스트 프로세싱: 분리 가능한 블러, 블룸, 외곽선」
- Kavan 외, "Skinning with Dual Quaternions"(I3D 2007): https://users.cs.utah.edu/~ladislav/kavan07skinning/kavan07skinning.html
