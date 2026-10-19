# [게임 셰이더 12/16] 투명도와 블렌딩: 알파 블렌딩, 그리는 순서, 프리멀티플라이드 알파

> **한 줄 요약** — 알파 블렌딩은 순서에 따라 결과가 달라 반투명 물체를 뒤에서 앞으로 정렬해 깊이 쓰기 없이 그려야 하고, 색에 알파를 미리 곱해 두는 프리멀티플라이드 알파는 미리 합치기와 필터링에서 정확하며, 정렬할 수 없으면 가중 블렌딩 OIT로 근사한다.

## 이 글에서 다루는 것
- 블렌딩 식이 순서에 의존하는 이유, 정렬과 깊이 쓰기 끄기
- 프리멀티플라이드 알파(포터·더프 1984): 미리 합치기와 필터링 테두리를 GLSL 렌더링과 파이썬으로 확인
- 더하기 블렌딩, 알파 테스트, 알파 투 커버리지
- 순서 무관 투명도(가중 블렌딩 OIT)의 오차

## 블렌딩 식과 그리는 순서
유리, 연기, 파티클처럼 뒤가 비치는 물체는 셰이더가 낸 색 Cs와 알파 αs를 프레임 버퍼의 색 Cd와 섞는다. 이 일은 출력 단계의 고정 기능 블렌딩 유닛(1편)이 하고, 가장 흔한 설정은 다음과 같다(OpenGL의 `glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`, Direct3D 11의 `D3D11_BLEND_SRC_ALPHA`와 `D3D11_BLEND_INV_SRC_ALPHA`).
```text
C = Cs · αs + Cd · (1 − αs)
```
이 식은 교환 법칙이 성립하지 않는다. 같은 두 장을 순서만 바꿔 그려 본다.
```python
import random

def blend(src, a, dst):              # 스트레이트: src·α + dst·(1 − α)
    return [s * a + d * (1 - a) for s, d in zip(src, dst)]
to8 = lambda c: tuple(round(255 * v) for v in c)
R, G, B = (1, 0, 0), (0, 1, 0), (0, 0, 1)
print("파랑 위에 빨강 → 초록(각 50%):", to8(blend(G, .5, blend(R, .5, B))))
print("파랑 위에 초록 → 빨강(각 50%):", to8(blend(R, .5, blend(G, .5, B))))
```
```text
파랑 위에 빨강 → 초록(각 50%): (64, 128, 64)
파랑 위에 초록 → 빨강(각 50%): (128, 64, 64)
```
앞의 것이 나중에 그려져야 맞으므로, 엔진은 불투명 물체를 다 그린 뒤 반투명 물체를 먼 것부터 정렬해 그린다(Unity의 Transparent 렌더 큐 3000). 깊이 테스트는 켜서 불투명 물체 뒤의 것은 버리되 깊이 쓰기는 끈다(ShaderLab의 `ZWrite Off`). 반투명 물체가 깊이를 쓰면 나중에 그릴 그 뒤의 반투명 물체가 통째로 버려지기 때문이다. 정렬은 보통 물체의 중심 거리로 하므로, 서로 관통하거나 큰 물체는 픽셀마다 앞뒤가 달라 한 순서로 맞출 수 없다.

## 프리멀티플라이드 알파
포터와 더프(1984)는 색에 알파를 미리 곱한 (αC, α)로 이미지를 다루면 합성이 깔끔해짐을 보였다. 이 **프리멀티플라이드 알파**(premultiplied alpha)에서 A를 B 위에 얹는 over 연산은 네 채널 모두 `A + B × (1 − αA)`이고 블렌딩 설정은 `glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA)`다. over는 결합 법칙이 성립해, 반투명 두 장을 투명한 버퍼에 먼저 합쳐 두었다가 배경에 얹어도 차례로 그린 것과 같다. UI나 파티클을 오프스크린 버퍼에 그려 합성하는 상황이다. 앞 코드에 이어서 무작위 300쌍으로 확인한다.
```python
def over(s, d):                      # 프리멀티플라이드 (r, g, b, α)의 over
    return [x + y * (1 - s[3]) for x, y in zip(s, d)]

rng, ok_p, ok_s, worst = random.Random(12), 0, 0, 0
for _ in range(300):
    (ca, aa), (cb, ab) = [([rng.random() for _ in range(3)], rng.random())
                          for _ in range(2)]
    bg = [rng.random() for _ in range(3)]
    direct = blend(ca, aa, blend(cb, ab, bg))   # 배경에 차례로 그린 정답
    # 프리멀티플라이드: 투명 버퍼에 B, A를 그린 뒤 배경에 over
    pa, pb = [c * aa for c in ca] + [aa], [c * ab for c in cb] + [ab]
    buf = over(pa, over(pb, [0, 0, 0, 0]))
    out = over(buf, bg + [1])[:3]
    ok_p += max(abs(x - y) for x, y in zip(out, direct)) < 1e-9
    # 스트레이트: 같은 블렌딩 식(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)을 알파에도
    buf = blend(ca + [aa], aa, blend(cb + [ab], ab, [0, 0, 0, 0]))
    err = max(abs(x - y) for x, y in
              zip(to8(blend(buf[:3], buf[3], bg)), to8(direct)))
    ok_s, worst = ok_s + (err == 0), max(worst, err)
print(f"300개 일치: 프리멀티플라이드 {ok_p}, 스트레이트 {ok_s}"
      f"(최대 {worst}코드 차이)")
```
```text
300개 일치: 프리멀티플라이드 300, 스트레이트 0(최대 108코드 차이)
```
스트레이트 알파로 같은 블렌딩 식을 알파에도 쓰면 버퍼의 알파가 α²처럼 틀어져 최대 108코드까지 어긋난다. 셰이더로도 계산해 본다. 픽셀 2는 미리 합친 결과를 그대로 출력한 프리멀티플라이드 값으로 색이 알파보다 크지 않다(WebGL 캔버스도 기본값 `premultipliedAlpha: true`로 이런 값을 기대한다).
```glsl
#version 300 es
precision highp float;
// render 4x1 rgba
out vec4 fragColor;
const vec4 A = vec4(1.0, 0.2, 0.1, 0.6);     // 앞 장(스트레이트: 색, α)
const vec4 B = vec4(0.1, 0.8, 0.4, 0.5);     // 뒤 장
const vec3 BG = vec3(0.2, 0.3, 0.9);         // 불투명 배경

vec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }
vec4 over(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }  // 프리멀티플라이드
vec3 blend(vec4 s, vec3 d) { return s.rgb * s.a + d * (1.0 - s.a); }

void main() {
    int i = int(gl_FragCoord.x);
    vec4 ab = over(premul(A), premul(B));    // 두 장을 미리 합친 결과
    if (i == 0) fragColor = vec4(blend(A, blend(B, BG)), 1.0);  // 뒤→앞
    if (i == 1) fragColor = vec4(blend(B, blend(A, BG)), 1.0);  // 순서 틀림
    if (i == 2) fragColor = ab;                                 // 출력 그대로
    if (i == 3) fragColor = over(ab, vec4(BG, 1.0));            // 배경에 얹기
}
```
```text
(0,0) 168 87 82 255
(1,0) 99 133 105 255
(2,0) 158 71 36 204
(3,0) 168 87 82 255
```
```python
la, lb, bg = ([1, .2, .1], .6), ([.1, .8, .4], .5), [.2, .3, .9]  # 셰이더와 같은 값
pm = lambda c, a: [x * a for x in c] + [a]
print(to8(blend(*la, blend(*lb, bg))), to8(blend(*lb, blend(*la, bg))),
      to8(over(pm(*la), pm(*lb))))
```
```text
(168, 87, 82) (99, 133, 105) (158, 71, 36, 204)
```
파이썬 값도 GPU의 픽셀 0~2와 같고, 미리 합친 픽셀 3은 차례로 그린 픽셀 0과 같다. 둘째 이점은 필터링이다. 이미지 편집기는 투명한 픽셀의 색을 흔히 검정으로 저장한다. 불투명한 흰 텍셀과 투명한 검은 텍셀 사이를 쌍선형 필터링(5편)하면 색과 알파가 함께 섞이는데, 스트레이트 식은 섞인 색에 알파를 **한 번 더** 곱한다. 흰 배경에 흰 스프라이트를 그려 본다(위쪽 절반 스트레이트, 아래쪽 절반 프리멀티플라이드).
```glsl
#version 300 es
precision highp float;
// render 36x10
in vec2 vUV;
out vec4 fragColor;
// 8×4 텍셀: 가운데 4×2는 불투명한 흰색, 나머지는 투명한 검정(0, 0, 0, 0)
vec4 texel(ivec2 p) {
    p = clamp(p, ivec2(0), ivec2(7, 3));
    bool inside = p.x >= 2 && p.x <= 5 && p.y >= 1 && p.y <= 2;
    return inside ? vec4(1.0) : vec4(0.0);
}
vec4 bilinear(vec2 uv) {             // 하드웨어 쌍선형 필터링 흉내
    vec2 t = uv * vec2(8.0, 4.0) - 0.5;
    ivec2 i = ivec2(floor(t));
    vec2 f = fract(t);
    return mix(mix(texel(i), texel(i + ivec2(1, 0)), f.x),
               mix(texel(i + ivec2(0, 1)), texel(i + 1), f.x), f.y);
}
void main() {
    vec2 uv = vec2(vUV.x, fract(vUV.y * 2.0));   // 위·아래에 같은 그림
    vec4 s = bilinear(uv);
    vec3 bg = vec3(1.0);                         // 흰 배경
    vec3 straight = s.rgb * s.a + bg * (1.0 - s.a);  // 스트레이트 알파 식
    vec3 premul = s.rgb + bg * (1.0 - s.a);          // 프리멀티플라이드 식
    fragColor = vec4(vUV.y > 0.5 ? straight : premul, 1.0);
}
```
```text
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@%####################%@@@@@@@
@@@@@@@%##%@@@@@@@@@@@@@@%##%@@@@@@@
@@@@@@@%####################%@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```
보이지 않아야 할 스프라이트가 스트레이트 알파에서는 검은 테두리로 드러난다. 색과 알파가 모두 α로 섞인 경계에서 스트레이트 결과는 `α × α + (1 − α)`라 α = 0.5에서 0.75까지 떨어지고(`#`), 프리멀티플라이드는 `α + (1 − α) = 1`로 정확하다. 밉맵을 만들 때도 같은 일이 생기므로 알파 텍스처는 프리멀티플라이드로 필터링하는 것이 안전하다. 셋째로, 알파를 0으로 두고 색만 남기면 같은 블렌딩 설정이 더하기 블렌딩이 되어 불꽃(더하기)과 연기(알파)를 한 번에 그릴 수 있다.

## 더하기 블렌딩, 알파 테스트, 알파 투 커버리지
**더하기 블렌딩**(`GL_ONE, GL_ONE`)은 덧셈이라 순서와 무관해 불꽃·빛 파티클을 정렬 없이 그린다. 8비트 버퍼에서는 금방 1에서 잘리므로 HDR 버퍼(10편)가 좋다. **알파 테스트**는 셰이더에서 `if (a < 0.5) discard;`로 픽셀을 버리는 것이다. 남은 픽셀은 불투명이라 깊이를 쓰고 정렬이 필요 없어 나뭇잎·철조망에 쓰지만, 가장자리가 계단처럼 깨지고 `discard`가 일부 GPU에서 이른 깊이 테스트를 막는다(16편). **알파 투 커버리지**(alpha to coverage)는 MSAA(3편)에서 알파를 표본 마스크로 바꾼다. 4× MSAA면 알파 0.5가 표본 4개 중 2개를 덮어 다섯 단계의 부드러운 가장자리를 정렬 없이 얻는다(Unity ShaderLab의 `AlphaToMask On`).

## 순서 무관 투명도: 가중 블렌딩 OIT
정렬할 수 없는 경우(관통하는 물체, 수많은 파티클)에 쓰는 맥과이어와 바부알(2013)의 **가중 블렌딩 OIT**(weighted blended order-independent transparency)는 블렌딩을 순서와 무관한 합과 곱으로 바꾼다. 누적 타깃에는 `w·α·C`와 `w·α`를 더하고(더하기 블렌딩), 투과율 타깃에는 `(1 − α)`를 곱해 둔 뒤 마지막 패스에서 합친다.
```text
C = Σ(w·α·C) / Σ(w·α)
    × (1 − Π(1 − α))
  + 배경 × Π(1 − α)
```
덮는 양 `1 − Π(1 − α)`는 정확하고, 색만 가중 평균으로 근사한다. 가중치 w는 깊이 z가 가까울수록 크게 준다. 앞 코드에 이어서, 무작위 4겹 300개를 정렬한 정답과 비교한다.
```python
def wboit(layers, bg, w):            # 가중 블렌딩 OIT: 순서와 무관한 누적
    acc, acc_a, reveal = [0.0] * 3, 0.0, 1.0
    for c, a, z in layers:
        acc = [s + w(z) * a * x for s, x in zip(acc, c)]
        acc_a += w(z) * a
        reveal *= 1 - a
    return [s / acc_a * (1 - reveal) + b * reveal for s, b in zip(acc, bg)]

def exact(layers, bg):               # 먼 것부터 정렬해 차례로 블렌딩
    out = bg
    for c, a, z in sorted(layers, key=lambda l: -l[2]):
        out = blend(c, a, out)
    return out

rng = random.Random(5)
for name, w in (("w = 1", lambda z: 1.0), ("w = 1/z", lambda z: 1 / z)):
    errs = []
    for _ in range(300):
        layers = [([rng.random() for _ in range(3)], rng.uniform(0.2, 0.8),
                   rng.uniform(1, 10)) for _ in range(4)]
        bg = [rng.random() for _ in range(3)]
        errs.append(max(abs(p - q) for p, q in
                        zip(to8(wboit(layers, bg, w)), to8(exact(layers, bg)))))
    print(f"{name}: 평균 {sum(errs) / 300:.1f}코드, 최대 {max(errs)}코드")
```
```text
w = 1: 평균 35.8코드, 최대 96코드
w = 1/z: 평균 18.1코드, 최대 69코드
```
가까운 겹에 가중치를 주면 평균 오차가 절반쯤으로 준다. 그래도 색이 크게 다른 겹이 섞이면 수십 코드가 틀리므로 연기·유리처럼 색이 비슷하고 알파가 낮은 것에 알맞다. 정확한 순서가 필요하면 깊이 벗기기(depth peeling)나 픽셀별 조각 목록을 쓰지만 메모리와 패스가 더 든다.

## 숫자로 보기
| 항목 | 값 | 비고 |
|---|---|---|
| 포터·더프 | 1984 | 프리멀티플라이드, over |
| 미리 합치기 오차 | 0 / 최대 108코드 | 프리멀티 / 스트레이트 |
| 흰-투명 경계 최저 밝기 | 0.75 | 스트레이트, α = 0.5 |
| 4× MSAA 알파 투 커버리지 | 5단계 | 표본 0~4개 |
| WBOIT 평균 오차(4겹) | 36 → 18코드 | w = 1 → 1/z |
| 1080p OIT 타깃 | 17.8MiB | 예: RGBA16F + R8 |

## 어디에 쓰이나
- 10편 「감마와 선형 공간, HDR과 톤 매핑」: 블렌딩도 선형 값으로 해야 맞고, 더하기 블렌딩한 파티클은 HDR 버퍼에서 잘리지 않는다.
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: 물체 셋이 서로 관통해 A가 B 앞, B가 C 앞, C가 A 앞이 되면 앞뒤 관계가 추이성을 잃어 어떤 정렬로도 맞출 수 없다.
- 16편 「셰이더 성능: 분기, 정밀도, 오버드로, 셰이더 변형」: 반투명 물체는 깊이 쓰기 없이 겹쳐 그리므로 오버드로의 주범이고, 파티클 크기와 수가 곧 비용이다.

## 정리
- 알파 블렌딩은 순서에 의존하므로 반투명 물체는 불투명 다음에 먼 것부터, 깊이 쓰기 없이 그린다.
- 프리멀티플라이드 알파의 over는 결합 법칙이 성립해 미리 합쳐도 정확하고(300/300), 필터링한 경계에 검은 테두리가 생기지 않는다.
- 더하기 블렌딩과 알파 투 커버리지는 순서와 무관하고, 알파 테스트는 불투명처럼 다룰 수 있다.
- 가중 블렌딩 OIT는 덮는 양은 정확하고 색은 근사하며, 깊이 가중치로 오차를 줄인다.

## 더 알아보기
- 이전 글: 11편 「그림자: 섀도 맵, 깊이 바이어스, PCF, 캐스케이드」
- 다음 글: 13편 「정점 애니메이션: 스키닝, 파도, 바람」
- 맥과이어·바부알, Weighted Blended Order-Independent Transparency(JCGT, 2013): https://www.jcgt.org/published/0002/02/09/paper.pdf
