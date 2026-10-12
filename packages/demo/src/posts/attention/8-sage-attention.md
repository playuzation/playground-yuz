# [어텐션 8/9] 세이지 어텐션: 양자화로 더 빠르게

> **한 줄 요약** — 세이지 어텐션은 플래시 어텐션의 블록 구조 위에서 QKᵀ를 INT8 같은 저정밀 정수로 계산해 텐서 코어 처리량을 높이며, K에서 토큰 방향 평균을 빼는 smoothing은 softmax 결과를 전혀 바꾸지 않으면서 양자화 오차를 크게 줄인다.

## 이 글에서 다루는 것
- 저정밀 텐서 코어가 빠른 이유와 블록별 INT8 양자화
- K smoothing: softmax가 변하지 않는 이유와 오차 감소 확인
- PV는 FP16, 그다음은 FP8
- SageAttention2(INT4, FP8)와 SageAttention3(FP4) 요약
- 정확도 주의점

## 저정밀 연산이 빠른 이유
텐서 코어는 숫자의 비트 수가 작을수록 같은 시간에 더 많은 곱셈을 한다. SageAttention 논문(Zhang 등, 2024)은 RTX 4090에서 INT8 행렬 곱이 FP16 행렬 곱보다 약 4배 빠르다고 적는다. 7편의 플래시 어텐션으로 메모리 이동을 줄였으니, 다음 단계는 연산 자체를 빠른 형식으로 바꾸는 것이다. 문제는 어텐션이 양자화에 예민하다는 점이다. 점수의 작은 오차도 exp를 거치면 가중치의 큰 비율 오차가 된다.

## 블록별 INT8 양자화
대칭 INT8 양자화는 블록 안의 최대 절댓값이 127이 되도록 스케일 s를 정하고, 각 값을 `round(x/s)`의 정수로 저장한다. 행렬 곱은 정수끼리 하고(INT32로 누적) 마지막에 두 스케일을 곱해 되돌린다.
```text
s_Q = max∣Q_블록∣ / 127,   Q̂ = round(Q / s_Q)
S ≈ s_Q · s_K · (Q̂ · K̂ᵀ)   정수 행렬 곱 + 스케일
```

SageAttention은 Q와 K를 플래시 어텐션의 타일에 맞춘 블록으로 나눠 블록마다 스케일을 하나씩 둔다. 블록이 작을수록 스케일이 그 블록의 값 범위에 잘 맞아 오차가 줄고, 타일 단위라 커널 안에서 처리하기도 쉽다.

## K smoothing: softmax는 그대로, 오차는 줄이기
실제 모델의 K에는 모든 토큰에 공통으로 깔린 채널별 치우침이 큰 경우가 많다. 이 치우침이 블록의 최대 절댓값을 키워 스케일이 커지고, 정작 토큰끼리의 차이를 표현할 정수 눈금은 거칠어진다. SageAttention은 K에서 토큰 방향 평균 k̄를 뺀다. 이렇게 해도 softmax 결과는 변하지 않는다.
```text
qᵢ·(kⱼ − k̄) = qᵢ·kⱼ − qᵢ·k̄
```

빼는 항 qᵢ·k̄는 j와 무관해서 i행의 모든 점수에서 같은 상수가 빠질 뿐이고, softmax는 행마다 상수를 더하거나 빼도 결과가 같다. 1편 코드에서 넘침을 막으려고 최댓값을 뺀 것과 같은 성질이다.
```python
import numpy as np

def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

rng = np.random.default_rng(0)
n, d = 256, 64
Q = rng.normal(size=(n, d))
bias = 8.0 * rng.normal(size=d)            # 모든 토큰에 공통인 채널별 치우침
K = rng.normal(size=(n, d)) + bias
V = rng.normal(size=(n, d))

K_s = K - K.mean(axis=0)                   # 토큰 방향 평균 빼기(smoothing)
P = softmax(Q @ K.T / np.sqrt(d))
P_s = softmax(Q @ K_s.T / np.sqrt(d))
print(np.abs(P - P_s).max())
print(np.abs(K).max().round(1), np.abs(K_s).max().round(1))
```
```text
6.38378239159465e-16
26.7 4.5
```

smoothing 전후 softmax의 차이는 6 × 10⁻¹⁶으로 사실상 0이고, K의 최대 절댓값은 26.7에서 4.5로 줄었다. 같은 127칸짜리 눈금으로 약 6배 좁은 범위를 표현하게 된 것이다. 이제 블록별 INT8 양자화를 흉내 내어 오차를 비교해 보자. `fake_int8`은 정수로 반올림한 뒤 스케일을 곱해 되돌린 값을 돌려주며, 정수 행렬 곱의 결과에 스케일을 곱하는 것과 수학적으로 같다.
```python
def fake_int8(x, block=64):                # 토큰 block개마다 스케일 하나
    xb = x.reshape(-1, block, x.shape[-1])
    s = np.abs(xb).max(axis=(1, 2), keepdims=True) / 127
    q = np.clip(np.round(xb / s), -127, 127)   # 정수 −127~127
    return (q * s).reshape(x.shape)            # 정수 × 스케일로 복원

def rel_err(a, b):
    return np.linalg.norm(a - b) / np.linalg.norm(b)

ref = P @ V                                # FP64 기준값
for name, k in [("그대로", K), ("smoothing", K_s)]:
    S = Q @ k.T / np.sqrt(d)
    S8 = fake_int8(Q) @ fake_int8(k).T / np.sqrt(d)
    rms = np.sqrt(np.mean((S8 - S) ** 2))  # 점수의 절대 오차
    O8 = softmax(S8) @ V
    P16 = softmax(S8).astype(np.float16)   # P·V는 FP16으로
    O16 = (P16 @ V.astype(np.float16)).astype(np.float64)
    print(f"{name:9s} 점수 오차 {rms:.3f}  출력 오차 {rel_err(O8, ref):.4f}"
          f"  FP16 PV까지 {rel_err(O16, ref):.4f}")
```
```text
그대로       점수 오차 0.095  출력 오차 0.0573  FP16 PV까지 0.0573
smoothing 점수 오차 0.012  출력 오차 0.0119  FP16 PV까지 0.0119
```

smoothing을 하면 점수의 절대 오차가 0.095에서 0.012로, 어텐션 출력의 상대 오차가 5.7%에서 1.2%로 준다. 평균을 한 번 빼는 것뿐이라 논문은 smoothing의 시간 부담이 0.2% 미만이라고 보고했다. P·V를 FP16으로 바꿔서 생긴 오차는 이 예에서 드러나지 않을 만큼 작다.

## PV는 FP16, 그다음은 FP8
두 번째 행렬 곱 PV는 P가 0~1 사이 값이라 Q·K와 분포가 다르다. SageAttention은 PV를 FP16으로 계산하되 누적도 FP16으로 해서 속도를 높였다. 논문은 이 커널이 RTX 4090에서 FlashAttention2보다 약 2.1배, xformers보다 약 2.7배 빠르다고 보고했다.

## SageAttention2와 SageAttention3
- **SageAttention2**(2024): Q·K를 INT4로 더 줄이고, 스레드 단위로 더 잘게 나눈 스케일을 쓴다. Q에도 smoothing을 하는데, Q의 평균 q̄를 빼면 행마다 같은 상수가 아니라 열마다 다른 항 q̄·kⱼ가 생기므로 이 항을 따로 계산해 더해 준다. PV는 FP8(E4M3)로 계산하고, 텐서 코어의 FP32 누적이 실제로는 정밀도가 더 낮다(FP22)는 문제를 2단계 누적으로 보완한다. 논문은 RTX 4090에서 FlashAttention2 대비 약 3배, xformers 대비 약 4.5배의 연산 처리량을 보고했다.
- **SageAttention3**(2025): 블랙웰(Blackwell) GPU의 FP4 텐서 코어를 쓴다. 값 16개마다 스케일을 두는 마이크로스케일링 FP4로 QKᵀ와 PV를 모두 계산하며, 논문은 RTX 5090에서 1038TOPS로 FlashAttention2의 약 5배를 보고했다. 8비트 어텐션 학습도 시험해, 미세 조정에서는 손실이 없었지만 사전 학습에서는 수렴이 느렸다고 밝혔다.

## 정확도 주의점
- 오차는 입력 분포에 달려 있다. 위 실험에서도 치우침이 큰 K를 그대로 양자화하면 출력 오차가 약 5배였다. 전처리 없이 비트만 내리면 품질이 눈에 띄게 떨어질 수 있다.
- 비트를 줄일수록 위험이 커진다. 개발자들은 정밀도에 민감한 용도에는 FP4인 SageAttention3보다 SageAttention2를 권한다. 어느 경우든 모델별로 결과 품질을 확인해야 한다.
- 논문들이 보고한 결과는 주로 추론(이미지·영상 생성, 언어 모델)이다. 학습에 쓰는 것은 아직 탐색 단계다.
- 속도 이득은 GPU마다 다르다. 정수·FP8·FP4 텐서 코어의 상대 처리량이 세대마다 달라서, 위 배율들은 각 논문이 측정한 RTX 4090·5090 기준이다.

## 어디에 쓰이나
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: 그 글에서 가중치에 적용한 정밀도와 양자화 이야기를 어텐션 계산의 중간값(Q, K, P, V)에 적용한 것이 이 글이다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: INT8이 2의 보수로 −128~127을 표현하는 8비트 정수라서, 대칭 양자화는 최대 절댓값을 127에 맞춘다.
- 7편 「플래시 어텐션: 메모리 계층을 아는 정확한 어텐션」: 세이지 어텐션은 플래시 어텐션의 타일링과 온라인 소프트맥스를 그대로 두고 타일 안의 행렬 곱만 저정밀로 바꾼다.

## 정리
- 세이지 어텐션은 플래시 어텐션의 블록 구조를 유지하면서 QKᵀ를 INT8(블록별 스케일)로 계산해 빠른 정수 텐서 코어를 쓴다.
- K에서 토큰 방향 평균을 빼면 각 행의 점수에서 같은 상수가 빠질 뿐이라 softmax는 그대로이고, 값 범위가 줄어 양자화 오차가 크게 준다.
- PV는 FP16(SageAttention), FP8(SageAttention2), FP4(SageAttention3)로 점점 낮아졌다.
- 비트를 줄일수록 이상치 처리와 모델별 품질 확인이 중요하다.

## 더 알아보기
- 이전 글: 7편 「플래시 어텐션: 메모리 계층을 아는 정확한 어텐션」
- 다음 글: 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」
- SageAttention 논문: https://arxiv.org/abs/2410.02367
- SageAttention2 논문: https://arxiv.org/abs/2411.10958
