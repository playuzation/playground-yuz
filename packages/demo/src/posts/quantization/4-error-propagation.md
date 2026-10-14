# [양자화 4/13] 양자화 오차의 전파: 잡음은 층을 지나며 어떻게 커지나

> **한 줄 요약** — 양자화 잡음은 선형 층에서 `d·E[x²]·Var(ε_w)`의 출력 잡음이 되고, 층을 쌓으면 전력이 더해져 깊이가 두 배일 때마다 약 3dB씩 SNR을 깎지만 잔차와 정규화가 이를 늦추며, 끝에서는 `KL ≈ ½·Var_p(δz)`만큼 출력 분포를 바꾸고, 손실은 `ΔL ≈ ½·δᵀHδ`라 헤시안이 큰 방향과 층이 더 민감하다.

## 이 글에서 다루는 것
- 덧셈 잡음 모델과 선형 층의 출력 잡음 분산
- 가중치 잡음과 활성값 잡음의 합, 깊이에 따른 SNR
- 잔차 연결과 정규화가 잡음 누적을 늦추는 이유
- 로짓 잡음 → KL 발산 → 퍼플렉서티
- 손실의 2차 근사 ½δᵀHδ와 방향·층별 민감도

## 선형 층의 출력 잡음
1편에서 반올림 오차는 신호와 거의 무관한 균등 잡음이었다. 그래서 `Ŵ = W + E`, `x̂ = x + e`로 쓰고, E의 원소는 평균 0·분산 σ_ε²로 서로 독립이며 x와도 독립이라고 둔다. 선형 층 `y = Wx`(W는 d_out × d)에 넣으면 이렇다.
```text
ŷ − y = E·x                         (가중치만 양자화)
Var((E·x)_i) = Σ_k Var(E_ik)·x_k² = d·σ_ε²·E[x²]
Var(y_i)     = d·σ_w²·E[x²]          (σ_w²: W 원소의 분산)
SNR          = σ_w² / σ_ε²           (1차적으로 d와 무관)
```

출력 하나는 곱 d개의 합이라 독립인 잡음 분산이 d번 더해진다. 신호도 부호가 제각각인 d개 항의 합이라 똑같이 d에 비례하므로, SNR은 가중치 하나의 신호 대 잡음비로 정해진다. 가상의 층으로 확인한다.
```python
import numpy as np

def q_sym(x, bits, axis):                  # 대칭 absmax 양자화 → 역양자화
    qmax = 2 ** (bits - 1) - 1
    s = np.abs(x).max(axis=axis, keepdims=True) / qmax
    return np.clip(np.round(x / s), -qmax, qmax) * s

db = lambda sig, noise: 10 * np.log10(np.mean(sig**2) / np.mean(noise**2))
rng = np.random.default_rng(0)
for d in [256, 1024, 4096, 16384]:
    W = rng.normal(size=(512, d)) * 0.02   # 출력 512 × 입력 d
    X = rng.normal(size=(d, 256))          # 토큰 256개(열)
    E = q_sym(W, 4, axis=1) - W            # 가중치 잡음(채널별 INT4)
    Y, N = W @ X, E @ X                    # 신호와 출력 잡음
    pred = d * np.mean(X**2) * np.var(E)   # d·E[x²]·Var(ε_w)
    print(f"d={d:5d}: 잡음 분산 {np.var(N):.5f} (예측 {pred:.5f}), "
          f"SNR {db(Y, N):.2f}dB")
```
```text
d=  256: 잡음 분산 0.00168 (예측 0.00167), SNR 17.87dB
d= 1024: 잡음 분산 0.00834 (예측 0.00834), SNR 16.93dB
d= 4096: 잡음 분산 0.04063 (예측 0.04042), SNR 16.03dB
d=16384: 잡음 분산 0.19213 (예측 0.19170), SNR 15.32dB
```

출력 잡음 분산은 예측과 1% 안에서 맞고 d를 따라 커진다. d가 4배일 때 잡음이 4배보다 조금 더(4.7~5배) 커지고 SNR이 0.7~0.9dB씩 떨어지는 것은, 행이 길수록 행의 최댓값이 커져 absmax 격자 간격 Δ, 곧 σ_ε가 함께 커지기 때문이다(3편의 최대/σ). 활성값까지 양자화하면 잡음이 하나 더 생긴다.
```text
ŷ − y = E·x + W·e + E·e ≈ E·x + W·e
1/SNR ≈ 1/SNR_W + 1/SNR_X           (잡음 전력이 더해진다)
```

두 잡음은 서로 독립이라 전력이 더해진다. 크기가 같으면 SNR이 10·log₁₀2 ≈ 3dB 깎이고, 한쪽이 훨씬 정밀하면(예: 4비트 가중치에 8비트 활성값) 전체 SNR은 거의 거친 쪽이 정한다.

## 깊이에 따라 쌓이는 잡음
층마다 상대 전력 ρ인 독립 잡음이 더해지고, 앞에서 생긴 잡음이 신호와 같은 이득으로 전달된다면 L층 뒤의 상대 잡음은 약 L·ρ다. 즉 `SNR_L ≈ SNR_1 − 10·log₁₀ L`, 깊이가 두 배일 때마다 3dB씩 떨어진다. 선형 → ReLU → 선형 블록 32개를 INT4 가중치로 바꾸고, 세 가지 연결 방식에서 출력의 SNR을 1·2·4·8·16·32블록마다 잰다.
```python
d, L = 512, 32
blocks = []
for _ in range(L):                         # 블록 = 선형 → ReLU → 선형
    W1 = rng.normal(size=(d, d)) * np.sqrt(2 / d)   # He 초기화
    W2 = rng.normal(size=(d, d)) * np.sqrt(1 / d)
    blocks.append([(W1, W2), (q_sym(W1, 4, 1), q_sym(W2, 4, 1))])
f = lambda u, Ws: Ws[1] @ np.maximum(Ws[0] @ u, 0)
rms = lambda h: h / np.sqrt(np.mean(h**2, axis=0))  # 토큰별 RMSNorm
steps = {"쌓기만": lambda h, Ws: f(h, Ws),
         "잔차+norm": lambda h, Ws: h + f(rms(h), Ws),
         "잔차만": lambda h, Ws: h + f(h, Ws)}
h0 = rng.normal(size=(d, 128))
for name, step in steps.items():
    h, hq, out = h0, h0, []
    for l, (Ws, Qs) in enumerate(blocks, 1):
        h, hq = step(h, Ws), step(hq, Qs)  # 원래 가중치 vs INT4 가중치
        if l in (1, 2, 4, 8, 16, 32):
            out.append(f"{db(h, hq - h):5.1f}")
    rms_h = np.sqrt(np.mean(h**2))
    print(f"{name:7s}" + " ".join(out) + f"  (RMS {rms_h:.3g})")
```
```text
쌓기만     14.5  11.5   9.3   6.9   3.2  -1.3  (RMS 0.81)
잔차+norm 17.4  15.3  13.4  12.2  11.0  10.2  (RMS 5.73)
잔차만     17.4  14.4  11.6   8.9   7.3   2.8  (RMS 8.04e+04)
```

- 쌓기만: 8블록까지는 깊이가 두 배일 때마다 2.2~3dB씩 떨어져 L·ρ 예측과 비슷하고, 그 뒤로는 더 빨리 나빠져 32블록에서는 잡음이 신호보다 커진다(−1.3dB).
- 잔차 + 정규화(Pre-LN): 블록마다 정규화된 입력으로 크기가 일정한 출력을 흐름에 더한다. 흐름은 입력과 모든 블록 출력의 합이라 커지므로, 블록 하나의 잡음은 점점 작은 몫이 된다. 32블록 뒤에도 10.2dB다.
- 잔차만: 각 블록이 흐름 전체를 받아 비슷한 크기로 더하므로 흐름이 블록마다 약 √2배씩 커지고(RMS 8만) 잡음도 같이 증폭되어, 다시 두 배마다 약 3dB씩 떨어진다.

## 로짓에서 출력 분포로
마지막에는 로짓 z가 `p = softmax(z)`가 된다. 앞에서 쌓인 은닉 상태 잡음과 출력 헤드의 양자화 잡음이 로짓 잡음 δ가 되어 `q = softmax(z + δ)`를 만든다. KL 발산을 정리하면 깔끔한 식이 나온다.
```text
log pᵢ − log qᵢ = −δᵢ + log Σⱼ pⱼ·e^(δⱼ)
KL(p ‖ q) = log E_p[e^δ] − E_p[δ]
          ≈ ½·Var_p(δ)          (누적량 전개의 2차 항)
δᵢ가 독립 N(0, σ²)이면  E[KL] ≈ ½·σ²·(1 − Σ pᵢ²)
```

`log E_p[e^δ]`는 δ의 누적량 생성 함수라 `E_p[δ] + ½·Var_p(δ) + …`로 전개되고 1차 항이 상쇄된다. 실제 다음 토큰이 p를 따른다면 q의 기대 교차 엔트로피는 `H(p) + KL(p ‖ q)`이므로 퍼플렉서티는 `e^KL`배가 된다. 확신이 낮은 분포와 높은 분포에 가상의 로짓 잡음을 넣어 본다.
```python
import numpy as np
rng = np.random.default_rng(0)
def log_softmax(z):
    z = z - z.max(axis=-1, keepdims=True)
    return z - np.log(np.exp(z).sum(axis=-1, keepdims=True))

V, T = 8192, 1000                          # 어휘 8192, 위치 1000개
for name, tau in [("애매", 3.0), ("확신", 8.0)]:
    z = tau * rng.normal(size=(T, V))      # 가상의 로짓
    lp = log_softmax(z)
    p = np.exp(lp)
    print(f"{name}: top1 확률 {p.max(1).mean():.2f}, "
          f"1 − Σp² = {np.mean(1 - (p**2).sum(1)):.3f}")
    for sigma in [0.1, 0.3, 1.0]:
        lq = log_softmax(z + sigma * rng.normal(size=(T, V)))
        kl = np.sum(p * (lp - lq), axis=1).mean()     # KL(p ‖ q)
        approx = 0.5 * sigma**2 * np.mean(1 - (p**2).sum(1))
        flip = np.mean(lq.argmax(1) != lp.argmax(1))
        print(f"  σ={sigma}: KL {kl:.4f} (근사 {approx:.4f}), "
              f"PPL ×{np.exp(kl):.3f}, top1 바뀜 {flip:.1%}")
```
```text
애매: top1 확률 0.16, 1 − Σp² = 0.942
  σ=0.1: KL 0.0047 (근사 0.0047), PPL ×1.005, top1 바뀜 6.6%
  σ=0.3: KL 0.0422 (근사 0.0424), PPL ×1.043, top1 바뀜 18.2%
  σ=1.0: KL 0.4655 (근사 0.4708), PPL ×1.593, top1 바뀜 53.5%
확신: top1 확률 0.65, 1 − Σp² = 0.470
  σ=0.1: KL 0.0023 (근사 0.0023), PPL ×1.002, top1 바뀜 1.9%
  σ=0.3: KL 0.0204 (근사 0.0211), PPL ×1.021, top1 바뀜 7.5%
  σ=1.0: KL 0.2474 (근사 0.2348), PPL ×1.281, top1 바뀜 26.7%
```

근사가 σ = 1까지 잘 맞고 KL은 σ²에 비례한다(σ가 3배면 약 9배). 같은 σ에서 확신이 높은 분포는 1 − Σp²가 작아 KL이 절반이다. 그런데 top-1이 뒤집히는 비율은 확신이 낮은 쪽이 훨씬 크다. 1, 2위 로짓의 차이(마진)가 작으면 작은 잡음에도 답이 바뀐다. 퍼플렉서티는 몇 %만 올라도 개별 답은 꽤 바뀔 수 있다는 뜻이고, 마진 이야기는 8편 「왜 드문 지식이 먼저 사라지나: 데이터 분포와 롱테일」에서 이어진다.

## 손실의 2차 근사
이제 파라미터 전체 θ에 양자화 섭동 δ = θ̂ − θ가 더해질 때 손실이 얼마나 오르는지 본다. 테일러 전개로 이렇게 된다.
```text
ΔL = L(θ + δ) − L(θ) ≈ gᵀδ + ½·δᵀHδ
학습이 끝난 점(g ≈ 0):  ΔL ≈ ½·δᵀHδ = ½·Σᵢ λᵢ·(uᵢᵀδ)²
δ 원소가 독립, 분산 σ²:  E[ΔL] ≈ ½·σ²·tr(H)
```

g가 정확히 0이 아니어도 평균 0인 독립 잡음이면 `E[gᵀδ] = 0`이라 2차 항이 남는다. 같은 크기의 δ라도 헤시안 H의 고유값 λᵢ가 큰 고유 방향 uᵢ에 실리면 손실이 크게 오르고, 작은 방향이면 거의 오르지 않는다. 특징마다 크기가 다른 가상의 로지스틱 회귀로 확인한다.
```python
import numpy as np

rng = np.random.default_rng(0)
n, d = 20_000, 32
scale = np.logspace(0, -1, d)              # 특징마다 크기가 다르다
X = rng.normal(size=(n, d)) * scale
w_true = 2 * rng.normal(size=d)
y = (rng.random(n) < 1 / (1 + np.exp(-X @ w_true))).astype(float)

def loss(w):                               # 평균 로지스틱 손실
    z = X @ w
    return np.mean(np.logaddexp(0, z) - y * z)

def grad_hess(w):
    p = 1 / (1 + np.exp(-X @ w))
    return X.T @ (p - y) / n, (X * (p * (1 - p))[:, None]).T @ X / n

w = np.zeros(d)
for _ in range(25):                        # 뉴턴법으로 최소점까지
    g, H = grad_hess(w)
    w -= np.linalg.solve(H, g)
g, H = grad_hess(w)
lam, U = np.linalg.eigh(H)
print(f"‖g‖ {np.linalg.norm(g):.1e}, H 고유값 {lam[0]:.2e} ~ {lam[-1]:.2e}")

L0, r = loss(w), 0.1
for name, v in [("최대 고유 방향", U[:, -1]), ("최소 고유 방향", U[:, 0])]:
    print(f"{name}: ΔL {loss(w + r * v) - L0:.3e}, "
          f"½δᵀHδ {0.5 * r**2 * v @ H @ v:.3e}")

for name, idx in [("큰 특징 16개", slice(0, 16)), ("작은 특징 16개", slice(16, 32))]:
    dq = np.zeros(d)
    s = np.abs(w[idx]).max() / 7           # 이 16개만 INT4로
    dq[idx] = np.round(w[idx] / s) * s - w[idx]
    pred = 0.5 * s**2 / 12 * np.trace(H[idx, idx])
    print(f"{name} INT4: ΔL {loss(w + dq) - L0:.2e}, "
          f"½δᵀHδ {0.5 * dq @ H @ dq:.2e}, ½(Δ²/12)tr(H) {pred:.2e}")
```
```text
‖g‖ 1.5e-17, H 고유값 6.95e-04 ~ 6.56e-02
최대 고유 방향: ΔL 3.290e-04, ½δᵀHδ 3.279e-04
최소 고유 방향: ΔL 3.479e-06, ½δᵀHδ 3.477e-06
큰 특징 16개 INT4: ΔL 3.10e-03, ½δᵀHδ 3.03e-03, ½(Δ²/12)tr(H) 4.07e-03
작은 특징 16개 INT4: ΔL 2.86e-04, ½δᵀHδ 2.86e-04, ½(Δ²/12)tr(H) 3.14e-04
```

같은 길이 0.1을 움직여도 최대 고유 방향의 손실 증가가 최소 고유 방향의 약 95배로, 고유값 비(94배)와 맞고 ½δᵀHδ는 실제 ΔL과 1% 안에서 일치한다. 같은 INT4로 절반씩만 양자화하면 큰 특징에 붙은 가중치 쪽이 손실을 약 11배 더 올린다. 곱해지는 입력이 크면 헤시안 대각 성분이 커서 민감한 것이다. 반올림 한 번의 결과라 기댓값 ½(Δ²/12)tr(H)와는 수십 % 차이가 나지만 크기 차이는 그대로 드러난다.

## 층·모듈마다 다른 민감도
층(모듈)별 잡음이 독립이면 `E[ΔL] ≈ ½·Σ_l σ_l²·tr(H_l)`이라 tr(H_l)이 큰 층에 비트를 더 주는 것이 합리적이다. HAWQ(Dong 등, 2019)는 층별 헤시안의 최대 고유값을, HAWQ-V2(2020)는 헤시안의 평균 대각합(trace)을 민감도로 써서 층마다 비트 수를 다르게 배정했다. 선형 층 하나만 떼어 출력 재구성 오차 `‖WX − ŴX‖²`를 목표로 하면 각 행의 헤시안이 `H = 2XXᵀ`가 되어 입력 X만으로 계산된다. 3편의 이상치 채널처럼 큰 입력이 들어오는 열은 H의 대각 성분이 커서 민감하다. 반올림 방향을 H에 맞춰 고르는 GPTQ와, 큰 활성값 채널의 가중치를 보호하는 AWQ가 이 식에서 나온다(11편).

## 어디에 쓰이나
- 정보 이론 3편 「KL 발산」: 로짓 잡음이 만든 출력 분포의 차이를 KL로 재며, 그 값이 곧 교차 엔트로피의 증가량이다.
- 미적분 6편 「테일러 급수: 복잡한 함수를 다항식으로」: 손실을 최소점 근처에서 2차까지 전개한 것이 ½δᵀHδ다.
- 신경망 레이어 7편 「정규화 층: LayerNorm에서 RMSNorm까지」: Pre-LN의 `x ← x + F(LN(x))` 구조가 깊이에 따른 잡음 누적을 늦춘다.
- 11편 「오차를 보정하는 양자화: GPTQ와 AWQ」: 층별 헤시안 H = 2XXᵀ로 반올림 오차를 보정한다.

## 정리
- 선형 층의 출력 잡음 분산은 `d·E[x²]·Var(ε_w)`이고 신호도 d에 비례해 SNR은 거의 일정하다. 가중치·활성값 잡음은 전력이 더해진다.
- 층을 그냥 쌓으면 깊이가 두 배일 때마다 약 3dB씩 SNR이 떨어지고, 잔차 + 정규화가 이 누적을 크게 늦춘다.
- 로짓 잡음의 영향은 `KL ≈ ½·Var_p(δ)`이고 퍼플렉서티는 `e^KL`배가 되지만, 마진이 작은 위치에서는 답 자체가 쉽게 뒤집힌다.
- 손실 증가는 `½·δᵀHδ`라 헤시안이 큰 방향·층이 민감하며, 이것이 혼합 정밀도와 GPTQ·AWQ의 바탕이다.

## 더 알아보기
- 이전 글: 3편 「가중치와 활성값의 분포: 이상치가 비트를 낭비하는 이유」
- 다음 글: 5편 「임베딩 공간의 기하: 양자화가 이웃 관계를 흔드는 방식」
- GPTQ 논문: https://arxiv.org/abs/2210.17323
