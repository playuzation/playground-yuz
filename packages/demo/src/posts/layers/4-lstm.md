# [신경망 레이어 4/11] LSTM: 게이트로 기억을 관리하기

> **한 줄 요약** — LSTM은 은닉 상태 옆에 덧셈으로만 갱신되는 셀 상태를 두고, 시그모이드 게이트 세 개(망각·입력·출력)로 무엇을 지우고 쓰고 내보낼지 정해서, 기울기가 W_h 곱셈을 반복하지 않고 셀 상태를 따라 멀리까지 흐르게 만든 순환 층이다.

## 이 글에서 다루는 것
- 셀 상태와 망각·입력·출력 게이트
- 덧셈 갱신이 기울기 통로가 되는 이유와 NumPy 실험
- 파라미터 수 `4·((d_in + d_h)·d_h + d_h)`
- NumPy 한 스텝 구현과 LSTM의 역사

## 기억을 따로 보관한다
3편의 RNN은 매 스텝 상태 전체를 `tanh(… + h W_h)`로 새로 만든다. 기억을 유지하려면 W_h와 tanh를 수십 번 통과해야 하고, 그동안 신호와 기울기가 지수적으로 깎인다. 1997년 호흐라이터(Sepp Hochreiter)와 슈미트후버(Jürgen Schmidhuber)가 제안한 **LSTM**(Long Short-Term Memory)의 발상은 기억을 담는 별도의 통로를 두는 것이다. 이 통로가 **셀 상태**(cell state) c이고, 행렬 곱 없이 원소별 곱과 덧셈으로만 갱신된다.

무엇을 지우고 무엇을 쓸지는 **게이트**(gate)가 정한다. 게이트는 시그모이드 출력이라 원소마다 0~1 사이 값이고, 다른 벡터에 원소별로 곱해져 "얼마나 통과시킬지"를 조절하는 밸브 역할을 한다.
- **망각 게이트** f: 이전 셀 상태를 얼마나 남길지
- **입력 게이트** i: 새 후보 내용 g를 얼마나 쓸지
- **출력 게이트** o: 셀 상태를 은닉 상태로 얼마나 내보낼지

원래 1997년 LSTM에는 망각 게이트가 없었고 셀 상태가 그대로 유지되었다. 끝없이 들어오는 입력에서 셀이 스스로 초기화하도록 망각 게이트를 추가한 것은 거르스(Felix Gers) 등의 2000년 논문이며, 지금 LSTM이라 하면 보통 이 형태를 가리킨다.

## 식
행벡터 표기로 쓰면, 네 가지 값을 한 번의 행렬 곱으로 만든 뒤 나눈다.
```text
[f, i, o, g] = [x_t, h_(t−1)] W + b      W: (d_in + d_h) × 4·d_h
f, i, o = σ(·)        g = tanh(·)
c_t = f ⊙ c_(t−1) + i ⊙ g              ← 지우고(곱) 쓰기(덧셈)
h_t = o ⊙ tanh(c_t)                     ← 걸러서 내보내기
```

파라미터는 RNN 셀 네 개 분량, 즉 `4·((d_in + d_h)·d_h + d_h)`다. d_in = d_h = 256이면 525,312개로 같은 크기 RNN(131,328개)의 4배다. PyTorch처럼 입력 쪽과 은닉 쪽 편향을 따로 두는 구현은 편향이 4·d_h개 더 있다. 게이트를 나누는 순서도 구현마다 다르다.
```python
import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

def lstm_step(x, h, c, W, b):
    # W: (d_in + d_h, 4·d_h), b: (4·d_h,)  게이트 4개를 한 번의 행렬 곱으로
    z = np.concatenate([x, h], axis=-1) @ W + b
    f, i, o, g = np.split(z, 4, axis=-1)
    c = sigmoid(f) * c + sigmoid(i) * np.tanh(g)  # 셀 상태: 덧셈 갱신
    h = sigmoid(o) * np.tanh(c)                   # 은닉 상태: 셀을 걸러 내보냄
    return h, c

rng = np.random.default_rng(0)
d_in, d_h, B = 256, 256, 4
W = rng.normal(0, 1 / np.sqrt(d_in + d_h), (d_in + d_h, 4 * d_h))
b = np.zeros(4 * d_h)
h, c = lstm_step(rng.normal(size=(B, d_in)), np.zeros((B, d_h)),
                 np.zeros((B, d_h)), W, b)
print(h.shape, c.shape)
print(f"{W.size + b.size:,}", f"{4 * ((d_in + d_h) * d_h + d_h):,}")
```
```text
(4, 256) (4, 256)
525,312 525,312
```

## 덧셈 갱신이 기울기 통로가 되는 이유
`c_t = f ⊙ c_(t−1) + i ⊙ g`를 c_(t−1)로 미분하면, 게이트를 거치는 간접 경로를 빼고 직접 경로는 `diag(f_t)`다. W_h도 tanh의 미분도 없다. k 스텝을 거슬러 가면 이 경로의 기울기는 f들의 원소별 곱 `f_t ⊙ f_(t−1) ⊙ …`일 뿐이다. 망각 게이트가 1에 가까우면 기울기가 거의 깎이지 않고 흐른다. 원 논문은 이렇게 오차가 일정하게 순환하는 구조를 "constant error carousel"이라 불렀다.

게다가 f는 입력에 따라 매 스텝 달라진다. 기억해야 할 때는 f ≈ 1로 통로를 열어 두고, 문장이 끝나 지워야 할 때는 f ≈ 0으로 닫을 수 있다. RNN에서는 W_h라는 고정된 행렬이 모든 스텝의 배율을 정했지만, LSTM에서는 데이터가 배율을 고른다. 50스텝 뒤의 상태가 처음 상태에 얼마나 민감한지 재 보자. 망각 게이트의 편향을 바꿔 가며 f의 기본값을 조절한다.
```python
import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

rng = np.random.default_rng(0)
d, T, eps = 32, 50, 1e-6
xs = rng.normal(size=(T, d))
W = rng.normal(0, 1 / np.sqrt(2 * d), (2 * d, 4 * d))
W_x = rng.normal(0, 1 / np.sqrt(d), (d, d))
W_h = np.linalg.qr(rng.normal(size=(d, d)))[0]    # 특이값이 모두 1
u = rng.normal(size=d)
u /= np.linalg.norm(u)                            # 초기 상태를 흔들 방향

def rnn_last(h):
    for x in xs:
        h = np.tanh(x @ W_x + h @ W_h)
    return h

def lstm_last(c, forget_bias):
    h, b = np.zeros(d), np.zeros(4 * d)
    b[:d] = forget_bias                           # 망각 게이트 편향
    for x in xs:
        f, i, o, g = np.split(np.concatenate([x, h]) @ W + b, 4)
        c = sigmoid(f) * c + sigmoid(i) * np.tanh(g)
        h = sigmoid(o) * np.tanh(c)
    return c

z = np.zeros(d)                                   # 50스텝 뒤 상태의 민감도
print("RNN ∂h/∂h0:", np.linalg.norm(rnn_last(z + eps*u) - rnn_last(z)) / eps)
for fb in [0.0, 1.0, 2.0, 3.0]:
    diff = lstm_last(z + eps*u, fb) - lstm_last(z, fb)
    print(f"LSTM 편향 {fb} (σ={sigmoid(fb):.2f}):", np.linalg.norm(diff) / eps)
```
```text
RNN ∂h/∂h0: 5.159570394547647e-10
LSTM 편향 0.0 (σ=0.50): 2.1015228059012305e-10
LSTM 편향 1.0 (σ=0.73): 9.221845155888145e-05
LSTM 편향 2.0 (σ=0.88): 0.13024848843624953
LSTM 편향 3.0 (σ=0.95): 2.150686816711715
```

처음 상태를 ε만큼 흔들고 50스텝 뒤 상태가 얼마나 변하는지 나눈 값이 기울기의 크기다. RNN은 10⁻¹⁰으로 처음 상태를 완전히 잊었다. LSTM도 망각 게이트가 0.5 근처면(편향 0) 직접 경로만 0.5⁵⁰ ≈ 10⁻¹⁵이라 똑같이 잊는다(간접 경로까지 합친 실측은 10⁻¹⁰). 게이트 구조만으로 기억이 보장되는 것은 아니라는 뜻이다. 편향을 올려 f를 1 쪽으로 밀면 민감도가 10⁻⁴, 0.13, 2.2로 살아난다(1을 넘는 것은 은닉 상태와 게이트를 거쳐 되돌아오는 간접 경로까지 합친 값이라서다). 그래서 학습 초기에 기억 통로가 열려 있도록 망각 게이트 편향을 1 이상으로 초기화하는 요령이 널리 쓰인다. 이후로는 학습이 f를 데이터에 맞게 조절한다.

## LSTM이 남긴 것
LSTM은 2010년대 중반 시퀀스 처리의 표준이었다. 2014년 seq2seq 번역 모델, 음성 인식, 2016년 구글 신경망 번역 등이 LSTM 인코더-디코더 위에 만들어졌다. 그러나 스텝을 순서대로 계산해야 한다는 RNN의 한계(3편)는 그대로여서, 2017년 이후 트랜스포머(6편)에 자리를 내주었다. 그 뒤에도 아이디어는 살아남았다. 입력에 따라 값이 정해지는 망각 게이트는 맘바의 Δ(10편)와 Gated DeltaNet의 감쇠 α(11편)로 이어지고, 2024년 호흐라이터 그룹의 xLSTM 중 한 변형(mLSTM)은 셀 상태를 행렬로 키워 리니어 어텐션과 비슷한 연상 메모리로 바꾸었다.

## 어디에 쓰이나
- 미적분 3편 「미분 규칙과 연쇄 법칙」: `c_t = f ⊙ c_(t−1) + …`의 직접 경로 미분은 f이고, 연쇄 법칙으로 k 스텝을 이으면 f들의 곱만 남아 W_h나 tanh 미분이 끼어들지 않는다.
- AI 기초 1편 「딥러닝: 특징까지 스스로 배우는 머신러닝」: 시그모이드는 출력이 0~1이라 확률처럼 쓰였는데, LSTM에서는 같은 성질로 "얼마나 통과시킬지"를 정하는 밸브가 된다.
- 5편 「GRU: 더 단순한 게이트 순환 층」: 망각·입력 게이트를 업데이트 게이트 하나로 묶고 셀 상태를 없애 파라미터를 4분의 3으로 줄인다.
- 11편 「델타 규칙과 Gated DeltaNet」: 입력에 따라 기억을 얼마나 남길지 정하는 망각 게이트는 Gated DeltaNet의 감쇠 게이트 α로 이어진다.

## 정리
- LSTM은 덧셈으로만 갱신되는 셀 상태 `c_t = f ⊙ c_(t−1) + i ⊙ g`와 시그모이드 게이트 세 개로 기억을 관리한다.
- 셀 상태의 직접 경로 기울기는 f들의 곱이라, f ≈ 1이면 W_h 곱셈의 반복 없이 기울기가 멀리 흐른다.
- 파라미터는 `4·((d_in + d_h)·d_h + d_h)`로 같은 크기 RNN의 4배다.
- 1997년 호흐라이터·슈미트후버가 제안했고, 망각 게이트는 2000년 거르스 등이 추가했다.

## 더 알아보기
- 이전 글: 3편 「순환 층(RNN): 상태를 이어 가는 레이어」
- 다음 글: 5편 「GRU: 더 단순한 게이트 순환 층」
- 게이트를 그림으로 설명하는 Christopher Olah의 글: https://colah.github.io/posts/2015-08-Understanding-LSTMs/
