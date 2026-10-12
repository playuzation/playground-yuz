# [신경망 레이어 8/11] 피드포워드 층의 진화: GELU에서 SwiGLU까지

> **한 줄 요약** — 트랜스포머의 피드포워드 층(FFN)은 토큰마다 따로 적용하는 2층 MLP(d → 4d → d)로 모델 파라미터의 대부분을 차지하며, 활성화 함수가 ReLU에서 GELU·SiLU로 부드러워진 뒤 게이트 곱을 넣은 SwiGLU가 표준이 되었고, 행렬이 3개라 은닉 크기를 약 8d/3로 줄여 파라미터를 맞춘다.

## 이 글에서 다루는 것
- FFN = 토큰별 2층 MLP, 파라미터 8d²
- 활성화 함수 ReLU·GELU·SiLU 비교
- GLU 계열: 게이트 곱으로 섞기
- SwiGLU의 은닉 크기 8d/3과 라마 3 8B의 14336
- NumPy 구현과 파라미터 계산

## FFN: 토큰마다 따로 도는 MLP
6편의 트랜스포머 블록에서 어텐션은 토큰끼리 정보를 섞고, **피드포워드 층**(feed-forward network, FFN)은 각 토큰의 벡터를 혼자서 변환한다. 모든 토큰에 같은 가중치를 쓰는 2층 MLP다.
```text
FFN(x) = act(x W₁ + b₁) W₂ + b₂        W₁: d × 4d,  W₂: 4d × d
```

은닉 크기를 4d로 넓혔다가 다시 d로 줄이는 것이 관례이고, 파라미터는 `2·d·4d = 8d²`다. 어텐션의 4d²보다 두 배 많아서 블록 파라미터 12d² 중 3분의 2가 FFN이다. 어텐션이 "어디서 정보를 가져올지"를 정한다면, FFN은 가져온 정보를 가공하고 학습한 지식을 꺼내는 곳으로 해석되곤 한다. 1편에서 본 대로 사이의 활성화 함수가 없으면 두 선형 층은 하나로 접히므로, 활성화 함수가 FFN의 성격을 결정한다.

## ReLU에서 GELU·SiLU로
- **ReLU** `max(0, x)`: 원 트랜스포머가 썼다. 계산이 싸지만 x = 0에서 꺾이고, 음수 입력의 기울기가 정확히 0이다.
- **GELU** `x·Φ(x)`(Hendrycks·Gimpel, 2016): Φ는 표준 정규 분포의 누적 분포 함수다. 입력을 "자신이 정규 분포에서 얼마나 큰 편인지"의 확률로 가중한다고 볼 수 있다. BERT와 GPT-2가 썼다. 계산을 줄이려 tanh 근사식도 널리 쓴다.
- **SiLU** `x·σ(x)`(Swish라고도 한다): 시그모이드로 자기 자신을 가중한다. GELU와 모양이 거의 같다.

세 함수 모두 큰 양수에서는 x, 큰 음수에서는 0에 가까워지지만, GELU와 SiLU는 0 근처에서 매끄럽고 음수 쪽에 살짝 내려가는 구간이 있다.
```python
import numpy as np
from math import erf

relu = lambda x: np.maximum(x, 0)
gelu = np.vectorize(lambda x: 0.5 * x * (1 + erf(x / np.sqrt(2))))   # x·Φ(x)
gelu_tanh = lambda x: 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi)
                                             * (x + 0.044715 * x**3)))
silu = lambda x: x / (1 + np.exp(-x))                                # x·σ(x)

x = np.array([-3, -1, -0.5, 0, 0.5, 1, 3])
for name, f in [("ReLU", relu), ("GELU", gelu), ("SiLU", silu)]:
    print(f"{name:5s}", np.round(f(x), 3))
grid = np.linspace(-6, 6, 10001)
print("GELU tanh 근사 최대 오차:", np.abs(gelu(grid) - gelu_tanh(grid)).max())
print("최솟값 GELU, SiLU:", gelu(grid).min().round(4), silu(grid).min().round(4))
```
```text
ReLU  [0.  0.  0.  0.  0.5 1.  3. ]
GELU  [-0.004 -0.159 -0.154  0.     0.346  0.841  2.996]
SiLU  [-0.142 -0.269 -0.189  0.     0.311  0.731  2.858]
GELU tanh 근사 최대 오차: 0.00047323550476940923
최솟값 GELU, SiLU: -0.17 -0.2785
```

GELU의 tanh 근사는 −6~6 구간에서 최대 오차가 약 5 × 10⁻⁴로 충분히 정확하다. GELU는 최솟값 약 −0.17, SiLU는 약 −0.28까지 내려간다. 이 매끄러움이 ReLU보다 최적화를 조금 쉽게 만든다고 여겨지지만, 결정적인 차이는 다음의 게이트 구조에서 나왔다.

## GLU: 게이트 곱으로 섞기
**GLU**(gated linear unit, Dauphin 등, 2016)는 활성화 함수를 하나의 벡터에 거는 대신, 두 갈래를 만들어 한쪽을 게이트로 다른 쪽에 원소별로 곱한다. 4편 LSTM의 게이트처럼 "이 값을 얼마나 통과시킬지"를 입력이 정하는 구조다. 샤지어(Shazeer)의 2020년 논문 「GLU Variants Improve Transformer」는 게이트 함수만 바꾼 변형들을 트랜스포머 FFN에 넣어 비교했다.
```text
GLU    FFN(x) = (σ(x W_gate)    ⊙ x W_up) W_down
GeGLU  FFN(x) = (GELU(x W_gate) ⊙ x W_up) W_down
SwiGLU FFN(x) = (SiLU(x W_gate) ⊙ x W_up) W_down
```

SwiGLU와 GeGLU가 기존 ReLU·GELU FFN보다 낮은 퍼플렉서티를 보였고, 이후 PaLM과 라마가 SwiGLU를, 젬마가 GeGLU를 채택하면서 표준이 되었다. 게이트 곱은 두 선형 변환의 곱이라 입력에 대한 2차 항을 만든다. 같은 크기에서 표현할 수 있는 함수가 풍부해지는 것이 성능 향상의 직관적 설명이지만, 논문 스스로도 왜 잘 되는지는 설명하지 않는다고 적었다.

## 행렬 3개를 8d²에 맞추기
SwiGLU FFN은 W_gate, W_up(d × h)과 W_down(h × d) 세 행렬이라 파라미터가 `3·d·h`다. h = 4d로 두면 12d²가 되어 기존 FFN보다 1.5배 크다. 그래서 같은 파라미터로 공정하게 비교하려고 h를 `8d/3`으로 줄인다. `3·d·(8d/3) = 8d²`다. 샤지어의 논문도 T5 기본 설정의 은닉 크기 3072를 GLU 변형에서는 2048로 줄였다.

라마는 여기에 하드웨어 친화적인 반올림을 더한다. 참조 구현은 `int(2·4d/3)`을 계산한 뒤 필요하면 배율을 곱하고, 정해진 수의 배수로 올림한다. d = 4096인 라마 2 7B(256의 배수)와 라마 3 8B(배율 1.3, 1024의 배수)로 계산해 보자.
```python
import numpy as np

def silu(x):
    return x / (1 + np.exp(-x))

def swiglu_ffn(x, W_gate, W_up, W_down):
    return (silu(x @ W_gate) * (x @ W_up)) @ W_down   # 게이트 ⊙ 값 → 아래로

rng = np.random.default_rng(0)
d, h = 64, 172                                    # h ≈ 8d/3
Wg, Wu = rng.normal(0, d**-0.5, (2, d, h))
Wd = rng.normal(0, h**-0.5, (h, d))
print(swiglu_ffn(rng.normal(size=(5, d)), Wg, Wu, Wd).shape)

def llama_hidden(d, multiple_of, multiplier=None):  # 라마 참조 구현의 규칙
    h = int(2 * (4 * d) / 3)
    if multiplier:
        h = int(multiplier * h)
    return multiple_of * ((h + multiple_of - 1) // multiple_of)

d = 4096
print(f"기존 FFN 8d²          = {8 * d * d:,}")
print(f"SwiGLU h={int(8 * d / 3)} 3dh = {3 * d * int(8 * d / 3):,}")
for name, h in [("라마 2 7B", llama_hidden(d, 256)),
                ("라마 3 8B", llama_hidden(d, 1024, 1.3))]:
    print(f"{name}: h = {h}, FFN 하나 {3 * d * h:,}, 32층 {32 * 3 * d * h:,}")
```
```text
(5, 64)
기존 FFN 8d²          = 134,217,728
SwiGLU h=10922 3dh = 134,209,536
라마 2 7B: h = 11008, FFN 하나 135,266,304, 32층 4,328,521,728
라마 3 8B: h = 14336, FFN 하나 176,160,768, 32층 5,637,144,576
```

8d/3 ≈ 10922로 두면 SwiGLU의 파라미터가 기존 FFN과 0.006% 차이로 같다. 라마 2 7B는 이를 256의 배수로 올려 11008을 썼고, 라마 3 8B는 배율 1.3을 곱한 14198을 1024의 배수로 올린 14336을 쓴다. 공개된 설정의 intermediate_size가 바로 이 값이다. 라마 3 8B의 FFN은 층당 약 1.76억 개, 32층이면 약 56억 개로, 모델 전체 약 80억 개의 70% 정도가 FFN에 있다. 9편의 전문가 혼합(MoE)이 바로 이 FFN을 여러 개로 나누는 이유다.

## 어디에 쓰이나
- 확률과 분포 7편 「연속 분포와 확률 밀도 함수」: GELU의 Φ(x)는 표준 정규 분포의 누적 분포 함수 `F(x) = P(X ≤ x)`이므로, GELU는 입력 x에 "표준 정규 확률 변수가 x 이하일 확률"을 곱한 값이다.
- AI 기초 1편 「딥러닝: 특징까지 스스로 배우는 머신러닝」: ReLU·시그모이드 같은 활성화 함수가 FFN 안에서는 GELU·SiLU로, 게이트 곱 구조로 발전했다.
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: 라마 3 8B 파라미터의 약 70%가 FFN이라, 모델 메모리와 토큰당 FLOPs의 대부분도 FFN에서 나온다.
- 9편 「전문가 혼합(MoE) 층」: MoE는 SwiGLU FFN을 여러 개(전문가) 두고 토큰마다 일부만 계산해, 파라미터는 늘리고 계산은 유지한다.

## 정리
- FFN은 토큰마다 같은 가중치로 도는 2층 MLP(d → 4d → d)이고, 파라미터 8d²로 블록의 3분의 2를 차지한다.
- 활성화는 ReLU에서 매끄러운 GELU(`x·Φ(x)`)·SiLU(`x·σ(x)`)로 바뀌었다.
- SwiGLU는 `(SiLU(xW_gate) ⊙ xW_up)W_down`이며, 행렬이 3개라 은닉 크기를 약 8d/3로 줄여 8d²에 맞춘다.
- 라마 3 8B는 8d/3에 배율 1.3을 곱하고 1024 배수로 올린 14336을 쓰며, FFN이 전체 파라미터의 약 70%다.

## 더 알아보기
- 이전 글: 7편 「정규화 층: LayerNorm에서 RMSNorm까지」
- 다음 글: 9편 「전문가 혼합(MoE) 층」
- SwiGLU를 제안한 논문(Shazeer, 2020): https://arxiv.org/abs/2002.05202
- GELU 논문(Hendrycks·Gimpel, 2016): https://arxiv.org/abs/1606.08415
