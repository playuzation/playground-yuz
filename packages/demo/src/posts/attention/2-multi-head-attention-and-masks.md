# [어텐션 2/9] 멀티헤드 어텐션과 마스크

> **한 줄 요약** — 멀티헤드 어텐션은 d차원을 h개의 작은 헤드로 나눠 헤드마다 다른 관계를 보게 한 뒤 W_O로 다시 섞는 구조이고, 마스크는 softmax 전에 볼 수 없는 칸에 −∞를 넣어 미래 토큰이나 패딩의 가중치를 정확히 0으로 만드는 장치다.

## 이 글에서 다루는 것
- 헤드 분할: reshape와 transpose로 d를 h × d_head로 나누기
- 출력 투영 W_O와 파라미터 4d²
- 셀프 어텐션과 크로스 어텐션
- 인과 마스크(−∞)와 패딩 마스크
- 마스크까지 넣은 NumPy 구현과 검증

## 왜 헤드가 여러 개인가
1편의 어텐션은 쿼리마다 가중치 분포를 하나만 만든다. 그런데 한 토큰에 필요한 정보는 여러 종류다. "그가 어제 산 책을 읽었다"의 '읽었다'는 주어(그)도, 목적어(책)도 봐야 한다. 분포 하나로 둘을 섞으면 평균이 되어 흐려진다. **멀티헤드 어텐션**(multi-head attention)은 d차원을 h개의 작은 공간으로 나눠 헤드마다 독립된 어텐션을 계산한다. 학습된 모델을 들여다보면 바로 앞 토큰만 보는 헤드, 구문상 관련된 단어를 보는 헤드, 문장 첫 토큰에 가중치를 몰아두는 헤드처럼 헤드마다 다른 패턴이 나타난다.

## 헤드 분할: reshape와 transpose
d = h × d_head로 정한다. 원 논문은 d = 512, h = 8이라 d_head = 64다.
```text
X (n, d) → Q, K, V 각각 (n, d)
  reshape   → (n, h, d_head)
  transpose → (h, n, d_head)  헤드 = 배치 축
헤드마다 softmax(QKᵀ/√d_head)V
  transpose, reshape → (n, d)  이어 붙이기
  × W_O → (n, d)
```

헤드 h개가 각자 d_head 차원으로 계산하므로 연산량은 h × 2·n²·d_head = 2·n²·d로, 헤드 하나짜리와 같다. 나누기만 할 뿐 비용은 늘지 않는다.
```python
import numpy as np

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

def split_heads(x, h):                  # (n, d) → (h, n, d/h)
    n, d = x.shape
    return x.reshape(n, h, d // h).transpose(1, 0, 2)

def merge_heads(x):                     # (h, n, dh) → (n, h·dh)
    h, n, dh = x.shape
    return x.transpose(1, 0, 2).reshape(n, h * dh)

def mha(X, W, h, mask=None, Y=None):
    Y = X if Y is None else Y           # Y를 주면 크로스 어텐션
    Q = split_heads(X @ W["q"], h)
    K = split_heads(Y @ W["k"], h)
    V = split_heads(Y @ W["v"], h)
    s = Q @ K.transpose(0, 2, 1) / np.sqrt(Q.shape[-1])  # (h, n, m)
    if mask is not None:
        s = np.where(mask, s, -np.inf)  # 볼 수 없는 칸은 −∞
    w = softmax(s)
    return merge_heads(w @ V) @ W["o"], w

rng = np.random.default_rng(0)
d, h, n = 8, 2, 4
W = {k: rng.normal(size=(d, d)) / np.sqrt(d) for k in "qkvo"}
X = rng.normal(size=(n, d))
out, w = mha(X, W, h)
print(out.shape, w.shape)
print(np.allclose(merge_heads(split_heads(X, h)), X))
```
```text
(4, 8) (2, 4, 4)
True
```

가중치의 모양 (2, 4, 4)는 (헤드, 쿼리, 키)다. `split_heads` 뒤에 `merge_heads`를 하면 원래 X가 그대로 돌아온다(True). 데이터를 옮기지 않고 보는 방식만 바꾸는 연산이라 비용도 거의 없다.

## 출력 투영 W_O와 파라미터 4d²
헤드들의 결과를 이어 붙이기만 하면 각 헤드의 정보가 자기 칸에만 머문다. 마지막에 d × d 행렬 W_O를 곱해 헤드들의 출력을 섞고 다음 층이 쓸 공간으로 되돌린다. 그래서 어텐션 층의 가중치는 W_Q, W_K, W_V, W_O 네 개이고, 편향을 빼면 파라미터는 4d²다.
```python
for dm in [512, 4096]:                  # 원 논문, 라마 3 8B의 d_model
    print(dm, f"{4 * dm * dm:,}")       # W_Q, W_K, W_V, W_O 각 d×d
```
```text
512 1,048,576
4096 67,108,864
```

원 논문 크기면 층마다 약 105만 개, d = 4096이면 약 6,711만 개다. 실제 라마 3 8B는 4편의 GQA로 W_K와 W_V를 4096 × 1024로 줄여 층마다 약 4,194만 개를 쓴다.

## 셀프 어텐션과 크로스 어텐션
쿼리와 키·값이 같은 시퀀스에서 나오면 **셀프 어텐션**이다. 쿼리는 한 시퀀스(디코더)에서, 키·값은 다른 시퀀스(인코더 출력)에서 나오면 **크로스 어텐션**이다. 번역 모델의 디코더가 원문을 참조할 때가 크로스 어텐션이고, 점수 행렬은 n × m 직사각형이 된다. 위의 `mha`는 Y를 넘기면 크로스 어텐션이 된다.
```python
Y = rng.normal(size=(6, d))             # 인코더 출력 6개
out_x, w_x = mha(X, W, h, Y=Y)          # 쿼리는 X, 키·값은 Y
print(out_x.shape, w_x.shape)
```
```text
(4, 8) (2, 4, 6)
```

쿼리 4개가 인코더 출력 6개를 보므로 가중치는 헤드마다 4 × 6이다. 인코더·디코더 블록의 전체 구성은 신경망 레이어 6편에서 다룬다.

## 인과 마스크: 미래를 −∞로 가리기
언어 모델은 앞 토큰만 보고 다음 토큰을 예측해야 한다. 학습할 때는 문장 전체를 한 번에 넣어 모든 위치를 병렬로 계산하므로, i번 쿼리가 i보다 뒤에 있는 키를 보지 못하게 막아야 한다. softmax 전에 그 칸의 점수를 −∞로 바꾸면 된다. e^(−∞) = 0이라 가중치가 정확히 0이 되고, 남은 칸끼리 합이 1이 되도록 저절로 다시 정규화된다.
```python
causal = np.tril(np.ones((n, n), dtype=bool))  # i행: 0..i번 키만 True
out, w = mha(X, W, h, mask=causal)
print(w[0].round(2))                    # 0번 헤드의 가중치

X2 = X.copy()
X2[-1] += 100.0                         # 마지막 토큰만 크게 바꾼다
out2, _ = mha(X2, W, h, mask=causal)
print(np.abs(out2[:-1] - out[:-1]).max())   # 앞 토큰들의 출력 변화
```
```text
[[1.   0.   0.   0.  ]
 [0.05 0.95 0.   0.  ]
 [0.24 0.12 0.64 0.  ]
 [0.18 0.15 0.1  0.57]]
0.0
```

가중치가 아래 삼각 행렬이 되었다. 마지막 토큰을 크게 바꿔도 앞 토큰들의 출력은 비트 하나 달라지지 않는다(0.0). 그래서 학습 때 n개 위치의 예측을 한 번의 계산으로 동시에 얻고, 생성할 때는 앞 토큰의 K·V를 다시 계산하지 않고 재사용할 수 있다(4편 KV 캐시). 한 가지 주의할 점은 한 행 전체가 가려지면 −∞ − (−∞)가 NaN이 된다는 것이다. 그래서 실제 구현은 −∞ 대신 아주 큰 음수를 쓰거나 그런 행을 따로 처리한다.

## 패딩 마스크: 길이가 다른 문장 묶기
배치로 처리하려면 길이가 다른 문장을 같은 길이로 맞춰야 해서 짧은 문장 뒤에 패딩 토큰을 채운다. 패딩은 내용이 없으므로 **키 방향**으로 가린다. 모양 (1, 1, m)짜리 마스크가 브로드캐스팅으로 모든 헤드와 모든 쿼리에 적용된다.
```python
real = 3                                # 진짜 토큰 3개 + 패딩 1개
pad = np.zeros(n, dtype=bool)
pad[:real] = True                       # 키 방향 마스크
Xp = X.copy()
Xp[real:] = rng.normal(size=(n - real, d))    # 패딩 자리는 아무 값
out_p, _ = mha(Xp, W, h, mask=pad[None, None, :])
out_r, _ = mha(X[:real], W, h)          # 패딩 없이 3개만
print(np.abs(out_p[:real] - out_r).max())
```
```text
0.0
```

패딩 자리에 어떤 값이 들어 있어도 진짜 토큰 3개의 출력은 패딩 없이 계산한 것과 정확히 같다. 패딩 위치의 쿼리가 내는 출력은 의미 없는 값이지만 손실 계산에서 빼면 된다. 디코더에서는 인과 마스크와 패딩 마스크를 논리곱(and)으로 합쳐 쓴다.

## 어디에 쓰이나
- 선형대수 12편 「텐서와 브로드캐스팅: 코드 속의 선형대수」: reshape·transpose로 헤드 축을 만들고, (1, 1, m) 마스크를 (h, n, m) 점수에 브로드캐스팅하는 것이 이 글 구현의 핵심이다.
- AI 기초 3편 「데이터 분포로 보는 AI 모델」: 언어 모델의 확률 연쇄 법칙 p(x₁)·p(x₂∣x₁)⋯에서 각 조건부 확률이 앞 토큰만 보도록 강제하는 장치가 인과 마스크다.
- 신경망 레이어 6편 「트랜스포머의 인코더와 디코더」: 인코더 블록은 패딩 마스크만 쓰는 셀프 어텐션을, 디코더 블록은 인과 셀프 어텐션과 크로스 어텐션을 쓴다.
- 4편 「KV 캐시와 MQA·GQA·MLA」: 인과 마스크 덕분에 지난 토큰의 K·V가 바뀌지 않아 캐시로 재사용할 수 있고, 헤드끼리 K·V를 공유해 그 캐시를 줄인다.

## 정리
- 멀티헤드 어텐션은 d를 h × d_head로 나눠 헤드마다 독립된 어텐션을 계산하고, 결과를 이어 붙인 뒤 W_O로 섞는다. 연산량은 헤드 하나짜리와 같다.
- 어텐션 층의 파라미터는 W_Q, W_K, W_V, W_O를 합한 4d²다(편향 제외).
- 크로스 어텐션은 쿼리와 키·값의 출처가 다를 뿐 계산은 같고, 점수 행렬이 n × m이 된다.
- 마스크는 softmax 전 점수에 −∞를 넣어 가중치를 정확히 0으로 만든다. 인과 마스크는 미래를, 패딩 마스크는 빈 자리를 가린다.

## 더 알아보기
- 이전 글: 1편 「어텐션의 기본: 쿼리, 키, 값」
- 다음 글: 3편 「위치 정보: 사인 위치 인코딩에서 RoPE까지」
- 트랜스포머를 그림으로 설명한 「The Illustrated Transformer」: https://jalammar.github.io/illustrated-transformer/
