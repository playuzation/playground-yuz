# [게임 셰이더 15/16] 많은 광원 다루기: 디퍼드 렌더링, G-버퍼, 포워드+

> **한 줄 요약** — 광원 수백 개를 픽셀마다 모두 계산하면 실제로 닿는 경우의 20배 넘게 일하므로, 디퍼드 렌더링은 표면 정보를 G-버퍼에 써 두고 화면 공간에서 조명하고, 포워드+와 클러스터드 셰이딩은 화면을 타일(과 깊이 조각)로 나눈 광원 목록으로 닿을 수 있는 광원만 계산한다.

## 이 글에서 다루는 것
- 포워드 렌더링이 광원 수에 비례해 비싸지는 이유
- 디퍼드 셰이딩과 G-버퍼 구성, 대역폭·MSAA·투명도의 약점
- 컴퓨트 셰이더 타일 광원 컬링, 포워드+, 클러스터드 셰이딩
- 방식별 셰이딩 연산 수를 정의대로 센 값과 비교하기

## 포워드 렌더링의 비용
6편과 8편의 조명 식은 광원 하나에 대한 것이고, 광원이 여럿이면 기여를 더한다. 가장 단순한 **포워드 렌더링**(forward rendering)은 물체를 그릴 때 프래그먼트 셰이더가 모든 광원을 돈다. 비용은 (셰이딩한 프래그먼트 수) × (광원 수)이고, 오버드로(16편)가 있으면 가려질 픽셀까지 값을 치른다. 그런데 점광원은 대개 화면 일부에만 닿아서, 총구 섬광·횃불·네온 간판이 수백 개인 장면에서는 이 계산의 대부분이 0을 더하는 일이다.

## 디퍼드 셰이딩과 G-버퍼
**디퍼드 셰이딩**(deferred shading)은 두 패스로 나눈다. 기하 패스는 물체를 그리며 조명 대신 표면 정보(알베도, 법선, 거칠기·금속성, 깊이)를 여러 렌더 타깃에 동시에(MRT) 쓴다. 이 버퍼 묶음이 **G-버퍼**(geometry buffer)이고, 이름은 사이토·다카하시(1990)에서 왔다. 조명 패스는 광원마다 그 광원이 닿는 화면 영역만 그려 G-버퍼를 읽고 조명을 더한다. 셰이딩이 보이는 픽셀에서만 일어나므로 오버드로와 광원 비용이 분리된다. 배치의 한 예는 이렇다.

| 타깃 | 형식 | 내용 |
|---|---|---|
| RT0 | RGBA8 | 알베도, AO |
| RT1 | RGB10A2 | 법선 |
| RT2 | RGBA8 | 금속성, 거칠기, 재질 |
| RT3 | R11G11B10F | 방출광, 조명 누적 |
| 깊이 | D24S8 | 깊이, 스텐실 |

Unity URP의 디퍼드 경로도 기본으로 알베도·재질 플래그, 스페큘러·차폐, 법선·매끄러움, 방출광·GI의 네 타깃에 깊이·스텐실을 쓰며, 법선은 기본 8비트 × 3이고 Accurate G-buffer normals를 켜면 팔면체 인코딩(2 × 12비트)을 쓴다.

단위 법선은 자유도가 2라 채널 두 개면 된다. **팔면체 인코딩**(octahedral encoding)은 법선을 `∣x∣ + ∣y∣ + ∣z∣ = 1`인 팔면체로 투영한 뒤 아래 반쪽을 네 귀퉁이로 접어 정사각형 [−1, 1]²에 펼친다. 셰이더로 법선 4개를 8비트 두 채널에 써 본다.
```glsl
#version 300 es
precision highp float;
// render 4x1 rgba
in vec2 vUV;
out vec4 fragColor;
vec2 octEncode(vec3 n) {                 // 단위 법선 → 팔면체 → [-1, 1]²
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    vec2 s = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
    return n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * s;  // 아래쪽은 접어 올림
}
const vec3 N[4] = vec3[4](vec3(0.36, 0.48, 0.8), vec3(0.8, 0, -0.6),
                          vec3(-0.48, 0.64, -0.6), vec3(0.6, -0.8, 0));
void main() {
    vec2 e = octEncode(N[int(vUV.x * 4.0)]) * 0.5 + 0.5;
    fragColor = vec4(e, 0, 1);           // RG 두 채널(8비트)에 저장
}
```
```text
(0,0) 155 165 0 255
(1,0) 255 182 0 255
(2,0) 47 219 0 255
(3,0) 182 55 0 255
```
파이썬으로 같은 인코딩과 디코딩을 구현해 바이트를 맞춰 보고, 무작위 법선 300개를 저장했다 되읽은 각도 오차를 방식별로 잰다.
```python
import math, random
def fold(x, y):                          # 아래 반구를 접거나 펴는 같은 변환
    return (1 - abs(y)) * math.copysign(1, x), (1 - abs(x)) * math.copysign(1, y)

def enc(n):                              # 셰이더의 octEncode와 같은 식
    s = sum(map(abs, n)); x, y, z = (c / s for c in n)
    return fold(x, y) if z < 0 else (x, y)

def dec(x, y):
    z = 1 - abs(x) - abs(y)
    if z < 0: x, y = fold(x, y)
    m = math.sqrt(x*x + y*y + z*z); return x / m, y / m, z / m

q = lambda v, b: round((v + 1) / 2 * (2**b - 1)) / (2**b - 1) * 2 - 1  # b비트 저장
N = [(0.36, 0.48, 0.8), (0.8, 0, -0.6), (-0.48, 0.64, -0.6), (0.6, -0.8, 0)]
print("8비트 (R, G):", [tuple(int((c + 1) / 2 * 255 + 0.5) for c in enc(n)) for n in N])

def worst(code):                         # 무작위 단위 법선 300개의 최대 각도 오차
    rng, e = random.Random(4), 0.0
    for _ in range(300):
        v = [rng.gauss(0, 1) for _ in range(3)]; n = [c / math.hypot(*v) for c in v]
        d = code(n); c = sum(a*b for a, b in zip(n, d)) / math.hypot(*d)
        e = max(e, math.degrees(math.acos(min(1.0, c))))
    return e
print(f"xyz 8비트 × 3 (24비트): {worst(lambda n: [q(c, 8) for c in n]):.3f}°")
for b in (8, 12):
    print(f"팔면체 {b}비트 × 2 ({2*b}비트): "
          f"{worst(lambda n: dec(*(q(c, b) for c in enc(n)))):.3f}°")
```
```text
8비트 (R, G): [(155, 165), (255, 182), (47, 219), (182, 55)]
xyz 8비트 × 3 (24비트): 0.328°
팔면체 8비트 × 2 (16비트): 0.774°
팔면체 12비트 × 2 (24비트): 0.050°
```

바이트가 GPU 출력과 같다. 같은 24비트라도 팔면체 12비트 × 2는 xyz 8비트 × 3보다 오차가 6배 넘게 작은데, xyz는 단위 구 밖의 코드값까지 쓰느라 비트를 낭비하기 때문이다.

약점은 셋이다. ① 대역폭: 위 배치는 픽셀당 20바이트라 1080p에서 39.6MiB, 4K에서 158.2MiB이고, 고전 방식은 이것을 광원마다 다시 읽는다. ② MSAA: 샘플마다 G-버퍼를 저장해야 해 4×면 메모리가 4배라, 디퍼드 엔진은 주로 FXAA·TAA 같은 후처리 안티에일리어싱을 쓴다. ③ 투명도: 픽셀당 표면 하나만 담으므로 반투명 물체(12편)는 따로 포워드로 그린다. 재질마다 다른 조명 모델도 G-버퍼의 재질 번호로 분기해야 한다.

## 타일 컬링, 포워드+, 클러스터
광원마다 G-버퍼를 다시 읽는 대신, 화면을 16×16 픽셀 **타일**로 나누고 타일마다 닿을 수 있는 광원 목록을 먼저 만들면 픽셀은 G-버퍼를 한 번 읽고 목록의 광원만 돈다(타일 디퍼드). 목록은 컴퓨트 셰이더가 만든다. 스레드 그룹 하나가 타일 하나를 맡아 깊이의 최솟값·최댓값을 공유 메모리에서 원자 연산으로 구하고, 그 깊이 범위로 좁힌 타일 절두체와 광원 구를 256개 스레드가 나눠 판정해 목록에 붙인다. WebGL2에는 컴퓨트 셰이더가 없어 직접 컴파일하지 않은 읽기용 HLSL(DirectX 11 이상)로 보인다. 광원 버퍼·상수와 판정 함수 `SphereVsTile`은 생략했다.
```hlsl
#define TILE 16
#define MAX_LIGHTS 256
Texture2D<float> gDepth : register(t0);          // 선형 뷰 깊이
RWStructuredBuffer<uint> gTileLights : register(u0);
groupshared uint sMinZ, sMaxZ, sCount;
groupshared uint sList[MAX_LIGHTS];

[numthreads(TILE, TILE, 1)]
void CullLights(uint3 gid : SV_GroupID, uint3 tid : SV_DispatchThreadID,
                uint idx : SV_GroupIndex)
{
    if (idx == 0) { sMinZ = 0x7F7FFFFF; sMaxZ = 0; sCount = 0; }
    GroupMemoryBarrierWithGroupSync();
    float z = gDepth.Load(int3(tid.xy, 0));
    InterlockedMin(sMinZ, asuint(z));  // 양수 float는 비트 순서 = 크기 순서
    InterlockedMax(sMaxZ, asuint(z));
    GroupMemoryBarrierWithGroupSync();
    for (uint i = idx; i < gLightCount; i += 256) {  // 256개 스레드가 나눠 판정
        if (SphereVsTile(i, gid.xy, asfloat(sMinZ), asfloat(sMaxZ))) {
            uint slot;
            InterlockedAdd(sCount, 1, slot);   // 목록에 자리 잡기
            if (slot < MAX_LIGHTS) sList[slot] = i;
        }
    }
    GroupMemoryBarrierWithGroupSync();
    uint n = min(sCount, MAX_LIGHTS), base = (gid.y * gTilesX + gid.x) * 257;
    if (idx == 0) gTileLights[base] = n;     // 타일마다 [개수, 번호...]
    for (uint j = idx; j < n; j += 256) gTileLights[base + 1 + j] = sList[j];
}
```
**포워드+**(Forward+, 하라다 외 2012)는 이 목록을 포워드 렌더링에 쓴다. 깊이 프리패스로 깊이만 먼저 그리고, 타일 광원 컬링을 한 뒤, 물체를 다시 그리며 프래그먼트 셰이더가 자기 타일의 목록만 돈다. G-버퍼가 없으니 MSAA, 다양한 재질, 반투명 물체에도 같은 목록을 쓸 수 있다. 약점은 깊이 범위다. 타일 안에 가까운 물체와 먼 배경이 함께 있으면 범위가 길어져 그 사이 광원이 모두 목록에 들어간다. **클러스터드 셰이딩**(clustered shading, 올손 외 2012)은 깊이 방향도 먼 곳일수록 두껍게(로그 간격) 잘라 3차원 클러스터마다 목록을 만든다.

## 파이썬으로 세기
1080p의 1/10 해상도(192×108)에서 바닥, 뒷벽, 구 두 개로 픽셀마다 뷰 공간 위치(G-버퍼 깊이에서 복원하는 값)를 만들고, 표면 근처에 반지름 1~3인 점광원 256개를 뿌린다. 정의대로 센 값은 거리가 반지름보다 작은 (픽셀, 광원) 쌍의 수다. 타일과 클러스터는 묶음 픽셀들을 감싸는 상자와 광원 구가 겹치면 목록에 넣고, 닿는 광원을 놓치는지도 센다. numpy를 쓴다.
```python
import numpy as np
W, H, T = 192, 108, 16                     # 1080p의 1/10, 타일 16×16
f = 1 / np.tan(np.radians(30))             # 세로 시야각 60°
ys, xs = np.mgrid[0:H, 0:W] + 0.5
d = np.stack([(2*xs/W - 1) * W/H / f, (1 - 2*ys/H) / f, -np.ones_like(xs)], -1)
t = np.full((H, W), 40.0)                  # 뒷벽 z = -40
t = np.where(d[..., 1] < 0, np.minimum(t, -1.5 / d[..., 1]), t)  # 바닥 y = -1.5
for c, r in (((-2, -0.5, -6), 1.0), ((3, 0, -10), 1.5)):        # 구 두 개
    c = np.array(c, float); b = (d * c).sum(-1); a = (d * d).sum(-1)
    disc = b*b - a * ((c*c).sum() - r*r)
    hit = (disc > 0) & (b > 0)
    t = np.where(hit, np.minimum(t, (b - np.sqrt(np.abs(disc))) / a), t)
P = (d * t[..., None]).reshape(-1, 3)      # 픽셀마다 뷰 공간 위치
rng = np.random.default_rng(1)
L = 256                                    # 광원은 표면 근처에 무작위로
lp = P[rng.integers(0, len(P), L)] + rng.uniform(-0.5, 0.5, (L, 3))
lr = rng.uniform(1.0, 3.0, L)
hit = ((P[:, None] - lp[None]) ** 2).sum(-1) < lr ** 2   # 정의대로: 닿는 쌍

def cull(key):
    """key가 같은 픽셀 묶음마다 감싸는 상자와 광원 구를 비교"""
    work = miss = 0
    for k in np.unique(key):
        m = key == k
        q = np.clip(lp, P[m].min(0), P[m].max(0))  # 상자에서 가장 가까운 점
        lst = ((q - lp) ** 2).sum(1) < lr ** 2    # 묶음의 광원 목록
        work += m.sum() * lst.sum()
        miss += (hit[m] & ~lst).sum()              # 목록에 없는데 닿는 쌍
    return work, miss

tile = ((ys // T) * 100 + xs // T).astype(int).ravel()
sl = np.clip(np.log(-P[:, 2] / 0.5) / np.log(100) * 16, 0, 15).astype(int)
n = hit.sum()
print(f"픽셀 {W*H:,}, 광원 {L}, 정의대로 센 닿는 쌍 {n:,}")
print(f"포워드(모든 광원): {W*H*L:,} = {W*H*L/n:.1f}배")
for name, key in (("타일 16×16", tile), ("클러스터 16×16×16", tile*16 + sl)):
    w, miss = cull(key)
    print(f"{name}: {w:,} = {w/n:.2f}배, 놓친 쌍 {miss}")
```
```text
픽셀 20,736, 광원 256, 정의대로 센 닿는 쌍 233,243
포워드(모든 광원): 5,308,416 = 22.8배
타일 16×16: 551,808 = 2.37배, 놓친 쌍 0
클러스터 16×16×16: 381,180 = 1.63배, 놓친 쌍 0
```

포워드는 실제로 닿는 쌍의 22.8배를 계산하고, 타일 목록은 2.37배, 클러스터는 1.63배다. 놓친 쌍이 0이므로 세 방식이 그리는 화면은 같다. 타일이 손해를 보는 곳은 바닥이 수평선까지 이어지거나 구 가장자리 뒤로 뒷벽이 보여 깊이 범위가 긴 타일이다. 고전 디퍼드가 닿는 쌍만큼만 G-버퍼를 다시 읽는다고 쳐도 픽셀당 평균 11.2번(233,243 ÷ 20,736)이라 1080p에서 프레임당 39.6MiB × 11.2 ≈ 0.43GiB, 60fps면 초당 26GiB다. 타일 방식은 픽셀마다 한 번만 읽는다.

## 숫자로 보기
| 항목 | 값 | 근거 |
|---|---|---|
| 예시 G-버퍼 | 20바이트/픽셀 | 4 × 5 |
| 1080p G-버퍼 | 39.6MiB | 계산 |
| 4K G-버퍼 | 158.2MiB | 계산 |
| 1080p MSAA 4× | 158.2MiB | 계산 |
| 법선 팔면체 2×12비트 | 최대 0.05° | 위 실험 |
| 1080p 16×16 타일 | 8,160개 | 120 × 68 |
| 일한 양(닿는 쌍 대비) | 22.8 / 2.37 / 1.63배 | 포워드 / 타일 / 클러스터 |

## 어디에 쓰이나
- GPU와 CUDA 7편 「공유 메모리와 뱅크 충돌: 32개 뱅크를 동시에 쓰기」: 타일 광원 목록은 그룹 공유 메모리(groupshared)에 모으고 원자적 덧셈으로 자리를 잡는다.
- GPU와 CUDA 9편 「병렬 리덕션과 워프 셔플: 수백만 개를 합 하나로」: 타일의 최소·최대 깊이는 256개 픽셀에 대한 리덕션이다.
- 게임 자원 관리 7편 「공간 분할 1: 균일 격자와 공간 해싱」: 클러스터는 시야 절두체를 격자(깊이는 로그 간격)로 나눠 칸마다 광원을 등록하는 공간 분할이다.

## 정리
- 포워드 렌더링은 프래그먼트 × 광원만큼 일해 실제로 닿는 쌍의 22.8배를 계산했다.
- 디퍼드 셰이딩은 G-버퍼(1080p 39.6MiB)로 셰이딩을 보이는 픽셀에 한정하지만 대역폭·MSAA·투명도에 약하고, 법선은 팔면체 인코딩으로 두 채널에 담는다.
- 타일 광원 목록은 2.37배, 깊이까지 나누는 클러스터는 1.63배로 줄였고 놓친 광원은 없었다.
- 포워드+는 같은 목록을 포워드 렌더링에 써서 MSAA와 반투명 물체를 지킨다.

## 더 알아보기
- 이전 글: 14편 「포스트 프로세싱: 분리 가능한 블러, 블룸, 외곽선」
- 다음 글: 16편 「셰이더 성능: 분기, 정밀도, 오버드로, 셰이더 변형」
- Harada 외, "Forward+: Bringing Deferred Lighting to the Next Level"(Eurographics 2012): https://diglib.eg.org/handle/10.2312/conf.EG2012.short.005-008
