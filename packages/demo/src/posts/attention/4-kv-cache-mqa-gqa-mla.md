# [어텐션 4/9] KV 캐시와 MQA·GQA·MLA

> **한 줄 요약** — 자기회귀 디코딩은 지난 토큰의 키와 값을 KV 캐시에 저장해 재사용하는데, 이 캐시는 층 × KV 헤드 × 헤드 차원 × 토큰 수에 비례해 커지므로 MQA·GQA는 KV 헤드를 공유하고 MLA는 저차원 잠재 벡터로 압축해 메모리를 줄인다.

## 이 글에서 다루는 것
- 자기회귀 디코딩에서 K·V를 재사용하는 이유와 수치 확인
- KV 캐시 크기 공식과 라마 3 8B의 토큰당 128KiB
- MQA와 GQA: 여러 쿼리 헤드가 KV 헤드를 나눠 쓰기
- MLA: 잠재 벡터로 압축하고 행렬을 흡수하기
- 품질과 메모리의 절충

## 생성할 때 같은 계산이 반복된다
언어 모델은 토큰을 하나씩 만든다. t번째 토큰을 만들려면 새 쿼리 q_t가 지금까지의 키 k₁…k_t, 값 v₁…v_t 전부와 어텐션을 해야 한다. 인과 마스크(2편) 때문에 지난 토큰의 k, v는 뒤에 토큰이 붙어도 바뀌지 않는다. 그러니 매번 처음부터 다시 계산할 필요 없이 새 토큰의 k, v만 계산해 저장소에 붙이면 된다. 이 저장소가 **KV 캐시**다.
```python
import numpy as np

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

rng = np.random.default_rng(0)
n, d = 6, 16
Q, K, V = (rng.normal(size=(n, d)) for _ in range(3))

# 한꺼번에: 인과 마스크를 씌운 전체 어텐션
s = Q @ K.T / np.sqrt(d)
s[np.triu_indices(n, 1)] = -np.inf
full = softmax(s) @ V

# 한 토큰씩: 새 k, v를 캐시에 붙이고 새 q 하나만 계산
k_cache, v_cache, steps = [], [], []
for t in range(n):
    k_cache.append(K[t])
    v_cache.append(V[t])
    Kc, Vc = np.array(k_cache), np.array(v_cache)
    steps.append(softmax(Q[t] @ Kc.T / np.sqrt(d)) @ Vc)
print(np.abs(np.array(steps) - full).max())
```
```text
2.220446049250313e-16
```

한 토큰씩 캐시를 쌓으며 계산한 결과가 전체를 한꺼번에 계산한 결과와 반올림 오차 수준(2.2 × 10⁻¹⁶)으로 같다. 캐시가 없으면 스텝마다 앞 토큰 전부의 K·V를 모든 층에서 다시 계산해야 하지만, 캐시가 있으면 새 토큰 하나만 계산하면 된다. 그 대가로 메모리를 쓴다. 지난 쿼리는 다시 쓰이지 않으므로 쿼리는 캐시하지 않는다.

## KV 캐시 크기 계산
토큰 하나마다, 층마다 K와 V를 각각 KV 헤드 수 × 헤드 차원만큼 저장한다.
```text
KV 캐시 = 2 × 층 × KV 헤드 × 헤드 차원 × 바이트 × 토큰
         (2는 K와 V)
```

라마 3 8B(32층, 쿼리 헤드 32개, KV 헤드 8개, 헤드 차원 128)를 BF16(2바이트)으로 계산해 보자.
```python
def kv_bytes(layers, kv_heads, head_dim, tokens, bytes_per=2):
    return 2 * layers * kv_heads * head_dim * bytes_per * tokens  # K와 V

per_tok = kv_bytes(32, 8, 128, 1)        # 라마 3 8B, BF16
print(per_tok, per_tok / 2**10, "KiB/토큰")
for T in [8192, 131072]:
    print(T, kv_bytes(32, 8, 128, T) / 2**30, "GiB")
for name, h_kv in [("MHA", 32), ("GQA", 8), ("MQA", 1)]:
    print(name, kv_bytes(32, h_kv, 128, 1) // 2**10, "KiB/토큰")
```
```text
131072 128.0 KiB/토큰
8192 1.0 GiB
131072 16.0 GiB
MHA 512 KiB/토큰
GQA 128 KiB/토큰
MQA 16 KiB/토큰
```

토큰 하나에 128KiB, 8K 토큰이면 1GiB, 128K 토큰이면 16GiB다. 128K 문맥이면 요청 하나의 캐시가 가중치(BF16 약 16GB)만큼 커진다. 동시에 처리하는 요청 수만큼 곱해지므로 서빙에서는 KV 캐시가 배치 크기를 정하는 경우가 많다(9편). 쿼리 헤드마다 KV 헤드를 따로 두었다면(MHA) 토큰당 512KiB였을 것이다.

## MQA와 GQA: KV 헤드 나눠 쓰기
캐시 크기는 KV 헤드 수에 비례하므로 KV 헤드를 줄이면 된다.
- **MQA**(multi-query attention, Shazeer, 2019): 모든 쿼리 헤드가 K·V 헤드 하나를 공유한다. 캐시가 1/h로 줄지만 품질이 떨어질 수 있다.
- **GQA**(grouped-query attention, Ainslie 등, 2023): 쿼리 헤드를 g개 그룹으로 나누고 그룹마다 K·V 헤드를 하나씩 둔다. g = h이면 MHA, g = 1이면 MQA다. 라마 3 8B는 쿼리 헤드 32개를 4개씩 묶어 KV 헤드 8개를 쓴다.
```python
def gqa(Q, K, V):                         # Q: (h, n, dh), K·V: (g, n, dh)
    rep = Q.shape[0] // K.shape[0]        # KV 헤드 하나를 쓰는 쿼리 헤드 수
    K, V = np.repeat(K, rep, axis=0), np.repeat(V, rep, axis=0)
    s = Q @ K.transpose(0, 2, 1) / np.sqrt(Q.shape[-1])
    return softmax(s) @ V

h, dh = 8, 16
Qh = rng.normal(size=(h, n, dh))
for g in [8, 2, 1]:                       # MHA, GQA(4개씩 공유), MQA
    Kg, Vg = rng.normal(size=(2, g, n, dh))
    print(g, gqa(Qh, Kg, Vg).shape, "캐시 비율", g / h)
```
```text
8 (8, 6, 16) 캐시 비율 1.0
2 (8, 6, 16) 캐시 비율 0.25
1 (8, 6, 16) 캐시 비율 0.125
```

`np.repeat`로 KV 헤드를 복제해 쿼리 헤드 수에 맞추면 나머지 계산은 MHA와 똑같다. 실제 커널은 복제하지 않고 같은 K·V를 여러 쿼리 헤드가 읽게 한다. 출력 모양은 그대로이고 저장할 캐시만 1/4, 1/8로 준다. GQA 논문은 MHA 체크포인트를 원래 사전 학습 연산의 약 5%만 더 들여 바꾸는(uptraining) 방법을 제시했고, 이렇게 만든 GQA가 MHA에 가까운 품질과 MQA에 가까운 속도를 낸다고 보고했다.

## MLA: 잠재 벡터로 압축하기
**MLA**(multi-head latent attention)는 딥시크-V2(2024)가 제안했다. 헤드를 공유하는 대신, 토큰의 은닉 벡터 x를 작은 **잠재 벡터** `c = x·W_DKV`로 압축해 c만 캐시하고, 키와 값은 필요할 때 c에서 복원한다(`k = c·W_UK`, `v = c·W_UV`).

그런데 매번 키를 복원하면 계산이 늘어난다. 여기서 **행렬 흡수**라는 아이디어가 나온다. 점수 `q·k = q·(c·W_UK)`는 결합 법칙으로 `(q·W_UKᵀ)·c`로 바꿔 쓸 수 있다. W_UK를 쿼리 쪽에 흡수하면 캐시의 c와 바로 내적하면 되고, 값 쪽 W_UV도 같은 방식으로 출력 투영 W_O에 흡수된다.
```python
dm, dc, h, dh = 64, 16, 4, 8              # 모델 폭, 잠재 차원, 헤드
W_dkv = rng.normal(size=(dm, dc))         # 압축: x → c (캐시할 것)
W_uk = rng.normal(size=(h, dc, dh))       # 복원: c → 헤드별 k
x_past = rng.normal(size=(10, dm))        # 지난 토큰 10개
q = rng.normal(size=(h, dh))              # 현재 토큰의 헤드별 쿼리

c = x_past @ W_dkv                        # (10, dc) 캐시는 이것뿐
k = np.einsum("tc,hcd->htd", c, W_uk)     # 키를 복원해서 내적
s1 = np.einsum("hd,htd->ht", q, k)
q_abs = np.einsum("hd,hcd->hc", q, W_uk)  # W_uk를 쿼리 쪽에 흡수
s2 = q_abs @ c.T                          # 복원 없이 c와 바로 내적
print(np.abs(s1 - s2).max())
```
```text
5.684341886080802e-14
```

두 방식의 점수가 부동소수점 오차 수준으로 같다. 걸림돌은 RoPE(3편)다. 키에 위치마다 다른 회전이 끼어들면 W_UK를 쿼리 쪽으로 넘길 수 없다. 그래서 MLA는 RoPE를 적용할 작은 키를 따로 두고(모든 헤드가 공유) 이것도 함께 캐시한다. 딥시크-V3의 공개 설정(헤드 128개 × 128차원, 잠재 차원 512, RoPE용 키 64차원, 61층)으로 계산해 보자.
```python
mha_elems = 2 * 128 * 128                 # 같은 헤드 구성(128×128)의 MHA
mla_elems = 512 + 64                      # 잠재 벡터 + RoPE용 키
print(mha_elems, mla_elems, round(mha_elems / mla_elems, 1))
print(61 * mla_elems * 2, "바이트/토큰")   # 딥시크-V3 61층, BF16
```
```text
32768 576 56.9
70272 바이트/토큰
```

같은 헤드 구성의 MHA라면 층마다 토큰당 32,768개를 저장해야 하지만 MLA는 576개로 약 57분의 1이다. 61층을 합쳐도 토큰당 70,272바이트(약 68.6KiB)라서, 파라미터가 6,710억 개인 모델의 토큰당 캐시가 라마 3 8B(128KiB)보다 작다. 딥시크-V2 논문은 MLA로 이전 모델 DeepSeek 67B 대비 KV 캐시를 93.3% 줄이고 최대 생성 처리량을 5.76배 높였다고 보고했다.

## 품질과 메모리의 절충
| 방식 | 토큰·층당 저장 | 품질 경향 |
|---|---|---|
| MHA | `2·h·d_h` | 기준 |
| GQA | `2·g·d_h` | MHA에 가까움 |
| MQA | `2·d_h` | 떨어질 수 있음 |
| MLA | `d_c + d_rope` | MHA 이상(논문 보고) |

캐시가 작으면 같은 GPU에 더 긴 문맥과 더 많은 요청을 담을 수 있다. 디코딩은 메모리 대역폭에 묶여 있어서(9편) 읽을 캐시가 줄면 속도도 빨라진다. 대신 헤드끼리 공유하거나 압축하는 만큼 표현력이 줄 수 있으므로, 모델마다 이 절충점을 다르게 고른다. 딥시크-V2 논문의 비교 실험에서는 MLA가 MHA보다 적은 캐시로 더 좋은 성능을 냈다. 실제 모델들의 선택은 오픈 웨이트 모델 시리즈에서 비교한다.

## 어디에 쓰이나
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: 그 글에서 언급한 KV 캐시의 크기를 이 글의 공식으로 정확히 계산할 수 있고, 캐시를 줄이는 것이 메모리 대역폭 병목을 줄이는 직접적인 수단이다.
- 선형대수 10편 「특이값 분해(SVD)」: MLA의 압축 W_DKV와 복원 W_UK는 K·V 투영을 저랭크 행렬 두 개의 곱으로 쓰는 것으로, SVD의 저랭크 근사와 같은 발상이다.
- 오픈 웨이트 모델 1편 「오픈 웨이트 모델의 표준 블록: 라마 3 해부」: 라마 3의 GQA 설정(쿼리 헤드 32, KV 헤드 8)이 이 글의 128KiB 계산에 그대로 쓰인다.
- 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: 이 글에서 크기를 계산한 KV 캐시를 단편화 없이 관리하고 빠르게 읽는 방법을 다룬다.

## 정리
- KV 캐시는 지난 토큰의 K·V를 저장해, 디코딩 스텝마다 새 토큰 하나만 계산하게 한다.
- 크기는 2 × 층 × KV 헤드 × 헤드 차원 × 바이트 × 토큰이며, 라마 3 8B는 BF16 기준 토큰당 128KiB다.
- MQA·GQA는 KV 헤드를 공유해 캐시를 1/h, g/h로 줄인다.
- MLA는 잠재 벡터만 캐시하고 행렬 흡수로 복원 비용을 피하며, RoPE용 키는 따로 둔다.

## 더 알아보기
- 이전 글: 3편 「위치 정보: 사인 위치 인코딩에서 RoPE까지」
- 다음 글: 5편 「슬라이딩 윈도와 희소 어텐션」
- GQA 논문: https://arxiv.org/abs/2305.13245
- MLA를 제안한 DeepSeek-V2 논문: https://arxiv.org/abs/2405.04434
