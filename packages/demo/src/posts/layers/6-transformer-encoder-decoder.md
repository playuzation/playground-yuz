# [신경망 레이어 6/11] 트랜스포머의 인코더와 디코더

> **한 줄 요약** — 트랜스포머는 RNN 인코더-디코더에서 순환을 걷어 내고 어텐션과 토큰별 FFN을 잔차 연결·정규화로 감싼 블록만 쌓은 구조로, 인코더 블록은 셀프 어텐션 + FFN, 디코더 블록은 인과 셀프 어텐션 + 크로스 어텐션 + FFN이며, 블록 하나의 파라미터는 약 12d²다.

## 이 글에서 다루는 것
- RNN 인코더-디코더와 바다나우 어텐션에서 트랜스포머까지
- 인코더 블록과 디코더 블록의 구성
- 원 논문 설정과 블록당 파라미터 ≈ 12d²
- 인코더 전용(BERT)·디코더 전용(GPT)·인코더-디코더(T5)
- NumPy 블록 순전파와 인과성 확인

## 순환에서 어텐션으로
2014년의 신경망 번역은 5편에서 본 RNN 인코더-디코더였다. 인코더 RNN이 원문을 끝까지 읽어 마지막 상태 벡터 하나에 요약하고, 디코더 RNN이 그 벡터에서 번역문을 한 단어씩 만든다. 문장이 길어질수록 고정 크기 벡터 하나에 모든 것을 담기 어려워 성능이 떨어졌다. 같은 해 바다나우(Bahdanau)·조경현·벤지오는 디코더가 단어를 만들 때마다 인코더의 모든 스텝 상태를 다시 보고, 지금 필요한 위치에 가중치를 주어 섞는 **어텐션**을 붙여 이 병목을 풀었다.

그래도 인코더와 디코더는 여전히 RNN이라 순서대로만 계산할 수 있었다(3편). 2017년 바스와니(Vaswani) 등의 「Attention Is All You Need」는 순환을 아예 없애고 어텐션만으로 토큰끼리 정보를 주고받게 했다. 그것이 **트랜스포머**(Transformer)다. 모든 토큰을 한 번에 처리하므로 학습을 GPU에서 크게 병렬화할 수 있다. 어텐션 자체의 계산(쿼리·키·값, 멀티헤드, 마스크, 위치 정보)은 어텐션 시리즈에서 다루고, 이 글은 그 부품들이 블록으로 조립되는 방식에 집중한다.

## 인코더 블록과 디코더 블록
두 블록 모두 "토큰끼리 섞는 층"과 "토큰마다 따로 계산하는 층(FFN)"을 번갈아 두고, 각각을 **잔차 연결**(입력을 출력에 더하기)과 LayerNorm으로 감싼다. 원 논문은 더한 뒤에 정규화하는 Post-LN 배치를 썼다.
```text
[인코더 블록]  x → x′
  a  = LN(x + 셀프어텐션(x))
  x′ = LN(a + FFN(a))

[디코더 블록]  y, 인코더 출력 m → y′
  a  = LN(y + 인과 셀프어텐션(y))
  b  = LN(a + 크로스어텐션(a, m))
  y′ = LN(b + FFN(b))
```

- **셀프 어텐션**: Q·K·V를 모두 같은 시퀀스에서 만든다. 인코더에서는 모든 토큰이 앞뒤 모든 토큰을 본다.
- **인과 셀프 어텐션**: 디코더는 다음 토큰을 예측해야 하므로, 마스크로 미래 위치를 가려 자기 자신과 과거만 보게 한다.
- **크로스 어텐션**: Q는 디코더에서, K·V는 인코더 출력에서 만든다. 바다나우 어텐션의 역할을 그대로 이어받은 층이다.
- **FFN**: 토큰마다 독립적으로 `d → 4d → d` 2층 MLP를 적용한다(8편).

잔차 연결 덕분에 블록은 입력을 통째로 바꾸는 대신 "고칠 부분"만 더하면 되고, 기울기도 덧셈 경로를 따라 깊은 층까지 내려간다. 4편 LSTM의 셀 상태가 시간 방향으로 했던 일을 깊이 방향으로 하는 셈이다. 정규화 위치에 따른 학습 안정성 차이는 7편에서 다룬다.

## 원 논문 설정과 12d²
기본 모델은 d = 512, 헤드 8개(헤드당 64차원), FFN 은닉 크기 2048(= 4d), 인코더 6층 + 디코더 6층이다. 블록의 파라미터를 세 보면 어텐션은 W_Q, W_K, W_V, W_O 네 개라 4d², FFN은 d × 4d 행렬 두 개라 8d²이다.
```text
인코더 블록 ≈ 4d² + 8d² = 12d²
디코더 블록 ≈ 4d² + 4d²(크로스) + 8d² = 16d²
```

편향과 LayerNorm은 d에 비례해서 무시할 만하다. 디코더 전용 모델에는 크로스 어텐션이 없으므로 층마다 12d²이고, 모델 전체는 임베딩을 빼면 약 `12·L·d²`이다. 블록 두 개를 NumPy로 만들어 순전파하고, 디코더의 인과성과 파라미터 수를 확인해 보자.
```python
import numpy as np

rng = np.random.default_rng(0)
d, n_head, d_ff = 512, 8, 2048                    # 원 논문 기본 모델

def lin(n_in, n_out):
    return rng.normal(0, n_in ** -0.5, (n_in, n_out)), np.zeros(n_out)

def layer_norm(x, eps=1e-5):                      # 게인 1, 편향 0인 초기 상태
    mu, var = x.mean(-1, keepdims=True), x.var(-1, keepdims=True)
    return (x - mu) / np.sqrt(var + eps)

def attention(xq, xkv, P, mask=None):
    (Wq, bq), (Wk, bk), (Wv, bv), (Wo, bo) = P
    def heads(t):                                 # (n, d) → (헤드, n, d/헤드)
        return t.reshape(len(t), n_head, -1).transpose(1, 0, 2)
    q, k, v = heads(xq @ Wq + bq), heads(xkv @ Wk + bk), heads(xkv @ Wv + bv)
    s = q @ k.transpose(0, 2, 1) / np.sqrt(d // n_head)
    if mask is not None:
        s = np.where(mask, s, -np.inf)
    a = np.exp(s - s.max(-1, keepdims=True))
    a /= a.sum(-1, keepdims=True)
    return (a @ v).transpose(1, 0, 2).reshape(len(xq), d) @ Wo + bo

def ffn(x, P):
    (W1, b1), (W2, b2) = P
    return np.maximum(x @ W1 + b1, 0) @ W2 + b2

def encoder_block(x, P):                          # 원 논문의 Post-LN 배치
    x = layer_norm(x + attention(x, x, P["self"]))
    return layer_norm(x + ffn(x, P["ffn"]))

def decoder_block(y, memory, P):
    causal = np.tril(np.ones((len(y), len(y)), dtype=bool))
    y = layer_norm(y + attention(y, y, P["self"], causal))
    # 크로스 어텐션: Q는 디코더 쪽 y, K·V는 인코더 출력 memory
    y = layer_norm(y + attention(y, memory, P["cross"]))
    return layer_norm(y + ffn(y, P["ffn"]))

attn = lambda: [lin(d, d) for _ in range(4)]      # W_Q, W_K, W_V, W_O
enc = {"self": attn(), "ffn": [lin(d, d_ff), lin(d_ff, d)]}
dec = {"self": attn(), "cross": attn(), "ffn": [lin(d, d_ff), lin(d_ff, d)]}

src, tgt = rng.normal(size=(10, d)), rng.normal(size=(7, d))
memory = encoder_block(src, enc)
out = decoder_block(tgt, memory, dec)
tgt2 = tgt.copy()
tgt2[5:] += 1.0                                   # 6번째 이후 토큰만 바꾼다
print(memory.shape, out.shape)
print(np.abs(decoder_block(tgt2, memory, dec) - out).max(axis=1).round(3))

def count(P, n_norm):                             # LayerNorm마다 게인·편향 2d
    linear = sum(W.size + b.size for g in P.values() for W, b in g)
    return linear + n_norm * 2 * d
e, r = count(enc, 2), count(dec, 3)
print(f"인코더 블록 {e:,} (12d² = {12 * d * d:,})")
print(f"디코더 블록 {r:,} (16d² = {16 * d * d:,})")
print(f"6층 + 6층 + 공유 임베딩 37000×512 = {6*e + 6*r + 37000*d:,}")
print(f"GPT-3 (96층, d=12288)의 12·L·d² = {12 * 96 * 12288**2:,}")
```
```text
(10, 512) (7, 512)
[0.    0.    0.    0.    0.    1.39  1.177]
인코더 블록 3,152,384 (12d² = 3,145,728)
디코더 블록 4,204,032 (16d² = 4,194,304)
6층 + 6층 + 공유 임베딩 37000×512 = 63,082,496
GPT-3 (96층, d=12288)의 12·L·d² = 173,946,175,488
```

디코더 입력의 6번째 이후 토큰(위치 5, 6)만 바꿨더니 출력도 위치 5, 6만 바뀌고 0~4는 정확히 그대로다. 인과 마스크 덕분에 각 위치는 과거만 보므로, 학습 때 한 번의 순전파로 모든 위치의 "다음 토큰 예측"을 동시에 학습할 수 있다. RNN이 T번 순차 계산하던 일을 행렬 곱 몇 번으로 끝내는 것이 트랜스포머의 핵심 이점이다.

파라미터는 인코더 블록 3,152,384개로 12d²(3,145,728)와 0.2% 차이이고, 디코더 블록도 16d²와 거의 같다. 6 + 6층에 원 논문처럼 약 37,000개 어휘의 임베딩을 입력·출력이 공유한다고 하면 약 6,300만 개로, 논문이 밝힌 기본 모델 크기 6,500만 개와 거의 맞는다(어휘 크기 같은 세부 설정에 따라 조금 다르다). 같은 어림을 GPT-3(96층, d = 12288)에 쓰면 약 1,740억 개로, 발표된 1,750억 개에 가깝다.

## 세 가지 갈래
원 논문 이후 트랜스포머는 블록 종류에 따라 세 갈래로 나뉘었다.

| 갈래 | 대표 | 블록 | 주 용도 |
|---|---|---|---|
| 인코더 전용 | BERT(2018) | 인코더 | 분류, 검색 임베딩 |
| 디코더 전용 | GPT(2018) | 인과 디코더 | 텍스트 생성, LLM |
| 인코더-디코더 | T5(2019) | 둘 다 | 번역, 요약 |

- **인코더 전용**은 양방향으로 문맥을 보며, 가린 단어를 맞히는 식으로 학습해 문장의 표현을 얻는 데 강하다. 생성에는 맞지 않는다.
- **디코더 전용**은 크로스 어텐션 없는 인과 디코더 블록만 쌓아 다음 토큰을 예측한다. 구조가 가장 단순하고 규모를 키우기 쉬워 오늘날 LLM의 기본이 되었다.
- **인코더-디코더**는 입력을 양방향으로 이해한 뒤 출력을 생성해야 하는 과제에 자연스럽다. T5는 모든 과제를 "텍스트 입력 → 텍스트 출력"으로 통일했고, 음성 인식 모델 Whisper도 이 구조다.

오늘날의 디코더 전용 LLM은 같은 뼈대에 부품만 바꾼 것이다. Post-LN 대신 Pre-RMSNorm(7편), ReLU FFN 대신 SwiGLU(8편), 일부 층을 MoE(9편)로 바꾸고, 어텐션 쪽은 RoPE와 GQA를 쓴다. 이 변화를 실제 모델 하나로 정리한 것이 오픈 웨이트 모델 1편이다.

## 어디에 쓰이나
- AI 기초 3편 「데이터 분포로 보는 AI 모델」: 디코더 전용 모델은 확률의 연쇄 법칙 `p(x₁…x_n) = Π p(x_t∣x_<t)`를 인과 마스크로 구현해, 한 번의 순전파로 모든 조건부 확률을 계산한다.
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: 층당 12d²라는 어림으로 파라미터 수와 메모리, 토큰당 약 2N FLOPs를 바로 계산할 수 있다.
- 어텐션 2편 「멀티헤드 어텐션과 마스크」: 블록 안의 셀프·크로스 어텐션과 인과 마스크, W_O를 포함한 4d² 파라미터의 세부를 다룬다.
- 5편 「GRU: 더 단순한 게이트 순환 층」: 트랜스포머가 대체한 RNN 인코더-디코더가 바로 GRU를 처음 쓴 구조다.

## 정리
- 트랜스포머는 RNN 인코더-디코더의 순환을 없애고 어텐션과 FFN 블록만 쌓아 학습을 병렬화했다.
- 인코더 블록은 셀프 어텐션 + FFN, 디코더 블록은 인과 셀프 어텐션 + 크로스 어텐션 + FFN이며, 각 층을 잔차 연결과 LayerNorm으로 감싼다.
- 블록당 파라미터는 어텐션 4d² + FFN 8d² ≈ 12d²(디코더 블록은 16d²)이고, 기본 모델(d = 512, 6 + 6층)은 약 6,500만 개다.
- 인코더 전용(BERT), 디코더 전용(GPT), 인코더-디코더(T5)로 갈라졌고, LLM은 디코더 전용이다.

## 더 알아보기
- 이전 글: 5편 「GRU: 더 단순한 게이트 순환 층」
- 다음 글: 7편 「정규화 층: LayerNorm에서 RMSNorm까지」
- 원 논문 「Attention Is All You Need」: https://arxiv.org/abs/1706.03762
- 블록 구조를 그림으로 설명하는 글: https://jalammar.github.io/illustrated-transformer/
