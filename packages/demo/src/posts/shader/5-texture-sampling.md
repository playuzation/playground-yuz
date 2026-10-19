# [게임 셰이더 5/16] 텍스처 샘플링: 필터링, 밉맵, 이방성 필터링

> **한 줄 요약** — 텍스처를 픽셀 중심의 점 하나로 읽으면 멀리 있는 바닥에 무아레가 생기므로, GPU는 2×2 평균으로 미리 줄인 밉맵(메모리 4/3배)에서 화면 미분으로 고른 레벨 λ = log₂(발자국)를 읽고, 비스듬한 면에서는 길쭉한 발자국을 따라 탭을 최대 16개 더 읽는다.

## 이 글에서 다루는 것
- UV와 텍셀, 감싸기 모드, 최근접·쌍선형 필터링(파이썬 구현과 대조)
- 축소할 때의 앨리어싱을 GLSL 바닥 렌더링으로 보기
- 밉맵 체인의 메모리, 미분으로 고르는 밉 레벨, 삼선형 필터링
- 이방성 필터링과 블록 압축 형식(BC1·BC5·BC7·ASTC)

## 문제: 멀어질수록 반짝이는 바닥
먼 바닥 타일이나 철망이 카메라가 움직일 때마다 반짝이고 물결무늬가 생기는 것은 텍스처를 읽는 방식 때문이다. 텍스처(texture)는 셰이더가 UV로 읽는 2차원 배열이고, 원소 하나가 **텍셀**(texel)이다. 폭 w인 텍스처에서 텍셀 i의 중심은 u = (i + 0.5)/w다. 4편의 함수 무늬와 달리 텍스처는 텍셀 사이 값을 모르므로 메우는 법(필터링)과 0~1 밖 UV를 접는 법(감싸기 모드: `repeat`, `clamp`, `mirror`)을 정해야 한다. 필터링은 가장 가까운 텍셀 하나를 쓰는 **최근접**(nearest)과 둘러싼 텍셀 4개를 거리로 섞는 **쌍선형**(bilinear)이 기본이다.
```python
import math, random

def wrap(i, n, mode):                  # 텍셀 번호 → 0..n-1
    if mode == "repeat": return i % n
    if mode == "clamp": return min(max(i, 0), n - 1)
    m = i % (2 * n)                    # mirror: 0..n-1, n-1..0
    return m if m < n else 2 * n - 1 - m

def nearest(tex, u, v, mode="repeat"):
    h, w = len(tex), len(tex[0])
    i, j = math.floor(u * w), math.floor(v * h)
    return tex[wrap(j, h, mode)][wrap(i, w, mode)]

def bilinear(tex, u, v, mode="repeat"):
    h, w = len(tex), len(tex[0])
    x, y = u * w - 0.5, v * h - 0.5    # 텍셀 중심이 (i + 0.5)/w
    i, j = math.floor(x), math.floor(y)
    fx, fy = x - i, y - j
    t = lambda a, b: tex[wrap(b, h, mode)][wrap(a, w, mode)]
    lo = t(i, j) * (1 - fx) + t(i + 1, j) * fx
    hi = t(i, j + 1) * (1 - fx) + t(i + 1, j + 1) * fx
    return lo * (1 - fy) + hi * fy

g = lambda x, y: 3 * x - 2 * y + 5     # 텍셀 값이 선형 함수인 텍스처
tex = [[g(i, j) for i in range(8)] for j in range(8)]
rng = random.Random(1)
ok = mir = 0
for _ in range(300):
    u, v = rng.uniform(0.0625, 0.9375), rng.uniform(0.0625, 0.9375)
    ok += abs(bilinear(tex, u, v, "clamp") - g(u * 8 - .5, v * 8 - .5)) < 1e-9
    mir += nearest(tex, u, v, "mirror") == nearest(tex, -u, v, "mirror")
print(f"쌍선형 = 선형 함수(무작위 300개): {ok}/300")
print(f"mirror 대칭 nearest(u) = nearest(-u): {mir}/300")
```
```text
쌍선형 = 선형 함수(무작위 300개): 300/300
mirror 대칭 nearest(u) = nearest(-u): 300/300
```
쌍선형은 텍셀 중심 사이를 선형으로 이으므로 텍셀 값이 선형 함수면 정확히 그 함수를 돌려준다. 확대할 때는 이것으로 충분하다. 문제는 **축소**할 때다. 한 픽셀이 텍셀 수십 개를 덮으면 픽셀 중심의 점 하나가 그중 아무거나 하나를 고르는 셈이 된다.

## 축소의 앨리어싱을 렌더링으로 보기
높이 1의 카메라가 체커보드 바닥을 보는 장면을 하네스(WebGL2의 GLSL ES 3.00)로 렌더링한다. 왼쪽 절반은 칸을 점 하나로 읽고, 오른쪽 절반은 픽셀 발자국(UV 미분 폭) 안의 체커를 해석적으로 적분한 정답이다. 미분 `dFdx`·`dFdy`는 3편의 2×2 쿼드에서 이웃 픽셀과의 차이다.
```glsl
#version 300 es
precision highp float;
// render 36x12
in vec2 vUV;
out vec4 fragColor;
const float HORIZON = 0.92;          // 지평선 높이(화면 비율)
void main() {
    float sy = HORIZON - vUV.y;      // 지평선까지의 화면 거리
    vec2 uv = vec2((vUV.x - 0.5) * 3.0, 1.0) / sy;  // 바닥의 UV
    float c;
    if (vUV.x < 0.5) {               // 왼쪽: 점 하나만 읽는다
        c = mod(floor(uv.x) + floor(uv.y), 2.0);
    } else {                         // 오른쪽: 발자국 평균(정답)
        vec2 w = max(abs(dFdx(uv)), abs(dFdy(uv)));
        vec2 a = abs(fract((uv - 0.5 * w) * 0.5) - 0.5);
        vec2 b = abs(fract((uv + 0.5 * w) * 0.5) - 0.5);
        vec2 i = 2.0 * (a - b) / w;  // 칸 함수를 w 폭으로 적분
        c = 0.5 - 0.5 * i.x * i.y;
    }
    fragColor = vec4(vec3(c), 1.0);
}
```
```text
@      @@@@@      ======++++++=====+
@@@@@      @@@@@@@+++++++======+++++
@  @  @  @  @  @  ==+==+===++=++=+=+
@@@  @@@  @@@  @@@+++==+++++===++=++
    @@@    @@@    @@@+   #@@+. :*@%+
    @@@@@    @@@@@    =@@@#-  .=#@%*
 @@@@@@     @@@@@@     =@@@@%:    =%
     @@@@@@       @@@@@@+     :*@@@@
   @@@@@@@        @@@@@@@+      .#@@
 @@@@@@@@         @@@@@@@@+       :*
@@@@@@@@          @@@@@@@@@+
@@@@@@@           @@@@@@@@@@+
```
가까운 아래쪽은 둘 다 칸이 보인다. 위쪽 네 줄에서 왼쪽은 `@  @  @`처럼 바닥에 없는 규칙적인 줄무늬, 곧 **무아레**(moiré)가 생기고 카메라가 움직이면 반짝인다. 오른쪽은 정답인 회색(`=`, `+`)으로 수렴한다. 왼쪽 절반의 위쪽 네 줄을 파이썬으로 같은 식으로 계산하면 GPU 출력과 글자 하나까지 같다(앞 코드에 이어서).
```python
for y in range(11, 7, -1):             # 위쪽 4행, 왼쪽 18열
    row = ""
    for x in range(18):
        px, py = (x + 0.5) / 36, (y + 0.5) / 12
        sy = 0.92 - py
        u, v = (px - 0.5) * 3.0 / sy, 1.0 / sy
        row += "@" if (math.floor(u) + math.floor(v)) % 2 else " "
    print(row.rstrip())
```
```text
@      @@@@@
@@@@@      @@@@@@@
@  @  @  @  @  @
@@@  @@@  @@@  @@@
```

## 밉맵: 미리 줄여 두기
텍스처는 배열이라 픽셀마다 텍셀 수십 개를 더할 수는 없다. 그래서 **밉맵**(mipmap, 윌리엄스 1983)은 2×2 평균으로 반씩 줄인 사본을 1×1까지 미리 만들어 두고, 발자국 크기에 맞는 레벨을 읽는다. 레벨 k의 텍셀 하나는 원본 2ᵏ×2ᵏ 블록의 평균이다. 텍셀 수는 1 + 1/4 + 1/16 + … → 4/3배다. 레벨은 미분으로 고른다. OpenGL ES 3.0 명세의 식은 텍셀 단위 UV 미분으로 `ρ = max(√((∂u/∂x)² + (∂v/∂x)²), √((∂u/∂y)² + (∂v/∂y)²))`, `λ = log₂ ρ`이다. 한 픽셀이 텍셀 8개를 덮으면 λ = 3이다. λ가 정수가 아니면 위아래 두 레벨에서 각각 쌍선형으로 읽어 섞는데, 이것이 **삼선형**(trilinear) 필터링이다. 무작위 텍스처에서 발자국 s×s(s는 2~24 무작위) 안을 16×16점으로 평균한 정답과 대조한다(앞 코드에 이어서).
```python
def down(t):                           # 2×2 평균 → 한 단계 아래 밉
    n = len(t) // 2
    return [[(t[2*j][2*i] + t[2*j][2*i+1] + t[2*j+1][2*i]
              + t[2*j+1][2*i+1]) / 4 for i in range(n)] for j in range(n)]

N = 256
base = [[rng.random() for _ in range(N)] for _ in range(N)]
chain = [base]
while len(chain[-1]) > 1:
    chain.append(down(chain[-1]))
L = len(chain)
ratio = sum(len(m) ** 2 for m in chain) / N ** 2
print(f"레벨 {L}개, 텍셀 비율 {ratio:.6f}")
print("공식 (4/3)(1 - 4^-L)과 일치:", ratio == 4 / 3 * (1 - 4 ** -L))

def trilinear(u, v, lam):
    lam = min(max(lam, 0), L - 1)
    k = min(int(lam), L - 2)
    a, b = bilinear(chain[k], u, v), bilinear(chain[k + 1], u, v)
    return a + (b - a) * (lam - k)

e_near = e_tri = 0.0
for _ in range(300):                   # 화면 한 픽셀 = 텍셀 s×s 발자국
    s = rng.uniform(2, 24)
    u, v = rng.random(), rng.random()
    d = s / N                          # 발자국 한 변(UV)
    ideal = sum(nearest(base, u + d * ((a + .5) / 16 - .5),
                        v + d * ((b + .5) / 16 - .5))
                for a in range(16) for b in range(16)) / 256
    e_near += (nearest(base, u, v) - ideal) ** 2
    e_tri += (trilinear(u, v, math.log2(s)) - ideal) ** 2
print(f"정답과의 RMS 오차: 최근접 {math.sqrt(e_near / 300):.3f},"
      f" 삼선형 {math.sqrt(e_tri / 300):.3f}")
```
```text
레벨 9개, 텍셀 비율 1.333328
공식 (4/3)(1 - 4^-L)과 일치: True
정답과의 RMS 오차: 최근접 0.281, 삼선형 0.025
```
256×256 텍스처는 레벨이 9개이고 메모리가 33% 늘어나는 대신 오차가 11분의 1로 준다. 먼 물체는 작은 레벨만 읽으므로 캐시 적중이 좋아지고 대역폭도 준다.

## 이방성 필터링: 길쭉한 발자국
`ρ`는 두 방향 중 **큰 쪽**을 고른다. 바닥처럼 시선과 거의 나란한 면에서는 픽셀 발자국이 깊이 방향으로만 길게 늘어나는데, 큰 쪽에 맞춰 λ를 올리면 가로 방향까지 뭉개진다(먼 도로가 흐릿한 이유). **이방성 필터링**(anisotropic filtering)은 긴 축을 따라 탭 N개를 읽어 평균하고, 레벨은 `λ = log₂(Pmax / N)`로 낮춘다. `EXT_texture_filter_anisotropic` 확장 명세가 예로 드는 방식이 `N = min(⌈Pmax / Pmin⌉, 최대 비)`이며, 실제 하드웨어의 탭 배치는 제조사마다 다르다. 법선이 시선과 θ만큼 기운 평면에서 미분을 수치로 구해 발자국 비가 1/cos θ인지 확인한다(앞 코드에 이어서).
```python
def texcoord(sx, sy, th, dist=1.0):
    # 시선 (sx, sy, 1)이 맞히는 평면 위 좌표. 법선이 z축과 th만큼 기움
    n = (0, math.sin(th), math.cos(th))
    t = dist * n[2] / (n[1] * sy + n[2])
    p = (t * sx, t * sy, t)
    return p[0], p[1] * math.cos(th) - p[2] * math.sin(th)

h = 1e-6                               # 한 픽셀 = 텍셀 1개가 되게 h로 나눈다
for deg in (0, 60, 80, 85, 89):
    th = math.radians(deg)
    c = texcoord(0, 0, th)
    px = math.dist(texcoord(h, 0, th), c) / h      # Px
    py = math.dist(texcoord(0, h, th), c) / h      # Py
    pmax, pmin = max(px, py), min(px, py)
    n = min(math.ceil(round(pmax / pmin, 6)), 16)
    iso, ani = math.log2(pmax), max(math.log2(pmax / n), 0)
    print(f"{deg:2d}도: 비 {pmax/pmin:5.2f} (1/cos {1/math.cos(th):5.2f})"
          f" 탭 {n:2d}, λ 등방 {iso:.2f} 이방 {ani:.2f}")
```
```text
 0도: 비  1.00 (1/cos  1.00) 탭  1, λ 등방 0.00 이방 0.00
60도: 비  2.00 (1/cos  2.00) 탭  2, λ 등방 1.00 이방 0.00
80도: 비  5.76 (1/cos  5.76) 탭  6, λ 등방 2.53 이방 0.00
85도: 비 11.47 (1/cos 11.47) 탭 12, λ 등방 3.52 이방 0.00
89도: 비 57.30 (1/cos 57.30) 탭 16, λ 등방 5.84 이방 1.84
```
85도로 기운 바닥에서 등방 필터는 텍셀 11개 폭을 뭉개는 레벨 3.5를 읽지만, 이방성 필터는 레벨 0에서 12탭을 읽는다. 89도에서는 16탭에 막혀 레벨 1.84로 올라간다. 탭 수만큼 읽기가 늘어나므로 게임 옵션의 "이방성 ×16"은 비스듬한 면에서만 비싸지는 설정이다.

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| RGBA8 비압축 | 32비트/텍셀 | 정의 |
| BC1 (DXT1) | 4비트/텍셀 | 64비트/4×4 |
| BC5 두 채널 | 8비트/텍셀 | 128비트/4×4 |
| BC7 (D3D11부터) | 8비트/텍셀 | 128비트/4×4 |
| ASTC 4×4 ~ 12×12 | 8 ~ 0.89비트 | 128비트/블록 |
| 밉맵 메모리 | 4/3배 | 위 계산 |
| 4096² RGBA8 + 밉 | 약 85.3MiB | 64MiB × 4/3 |
| 4096² BC7 + 밉 | 약 21.3MiB | 16MiB × 4/3 |
| D3D11 최대 이방성 | 16 | 샘플러 한도 |

GPU 텍스처 압축은 4×4 같은 블록마다 **고정된 비트 수**를 써서 텍셀 주소로 블록 위치를 바로 계산하고 텍스처 유닛이 읽을 때 푼다. 앞에서부터 풀어야 하는 PNG·JPEG와 달리 임의 접근이 되는 이유다. 밉맵 생성과 압축은 보통 에셋 빌드 때 한다.

## 어디에 쓰이나
- 게임 자원 관리 9편 「컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기」: 밉맵은 텍스처의 LOD이고, 화면에서 작아진 물체가 작은 레벨만 읽는다는 점에서 메시 LOD와 같은 원리다.
- 게임 자원 관리 12편 「텍스처 아틀라스와 사각형 빈 패킹」: 아틀라스는 낮은 밉 레벨에서 이웃 그림과 2×2 평균이 섞이므로 그림 사이에 여백(패딩)을 둬야 한다.
- 7편 「법선 맵과 탄젠트 공간: 평평한 면에 굴곡 그리기」: 법선 맵은 두 채널만 BC5로 압축하고 z는 셰이더에서 복원한다.
- 10편 「감마와 선형 공간, HDR과 톤 매핑」: sRGB 텍스처는 필터링 전에 선형 값으로 바뀌어야 평균이 맞다.

## 정리
- 쌍선형은 텍셀 중심 사이를 선형으로 이으며, 텍셀 값이 선형 함수면 정확히 그 값을 돌려준다(300/300).
- 축소할 때 점 하나로 읽으면 무아레가 생긴다. 정답은 발자국 평균이고, 밉맵과 삼선형 필터링이 4/3배 메모리로 오차를 0.281에서 0.025로 줄였다.
- 밉 레벨은 화면 미분으로 고른 `λ = log₂ ρ`이고, 비스듬한 면에서는 발자국 비 1/cos θ만큼 탭을 늘리는 이방성 필터링(최대 16)이 선명함을 지킨다.
- 블록 압축은 고정 비율이라 임의 접근이 된다(BC1 4비트, BC5·BC7 8비트, ASTC 8~0.89비트/텍셀).

## 더 알아보기
- 이전 글: 4편 「셰이더 언어와 첫 프래그먼트 셰이더: GLSL, 유니폼, 절차적 패턴」
- 다음 글: 6편 「고전 조명 모델: 램버트, 퐁, 블린-퐁, 툰 셰이딩」
- 위키백과 "Mipmap": https://en.wikipedia.org/wiki/Mipmap
