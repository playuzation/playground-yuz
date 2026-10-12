# [신경망 레이어 11/11] 델타 규칙과 Gated DeltaNet

> **한 줄 요약** — 리니어 어텐션의 상태는 키→값 쌍을 더해 쌓는 연상 메모리 `S = Σ v kᵀ`라서 키가 겹치면 기억이 서로 섞이는데, 델타 규칙은 읽어 본 값이 틀린 만큼만 고쳐 쓰고 게이트 α는 필요할 때 기억을 한꺼번에 지워서, 둘을 합친 Gated DeltaNet `S_t = α_t·S_(t−1)·(I − β_t k_t k_tᵀ) + β_t v_t k_tᵀ`가 고정 크기 상태로 훨씬 정확한 기억을 만든다.

## 이 글에서 다루는 것
- 리니어 어텐션 상태 = 연상 메모리, 키 간섭 문제
- 델타 규칙: 오차를 고쳐 쓰는 갱신과 경사 하강법 해석
- 게이트 감쇠 α와 Gated DeltaNet 식
- NumPy 기억 회상 실험: 덧셈형 vs 델타형 vs 게이트 델타형
- 청크 단위 병렬 학습과 블록 구성

## 표기
이 글에서는 q, k, v를 열벡터로, 상태 S를 d_v × d_k 행렬로 둔다. 쓰기는 바깥곱 `v kᵀ`를 더하는 것이고, 읽기는 `o = S q`다. 행벡터 관례를 쓰는 구현은 S를 전치해 `kᵀv`로 쓴다. 코드도 모두 이 방향을 따른다.

## 리니어 어텐션 상태는 연상 메모리다
어텐션 6편의 인과 리니어 어텐션은 상태 `S_t = S_(t−1) + v_t k_tᵀ`를 누적하고 `o_t = S_t q_t`로 읽는다. 이 S는 키를 넣으면 값을 돌려주는 **연상 메모리**(associative memory)다. 저장된 키 k_j로 읽으면 이렇게 된다.
```text
S k_j = v_j (k_jᵀ k_j) + Σ_(i≠j) v_i (k_iᵀ k_j)
```

앞 항은 원하는 값이고, 뒤 항은 다른 기억이 섞여 드는 간섭이다. 키들이 서로 직교하는 단위 벡터면 간섭 항이 0이라 정확히 v_j가 나온다. 하지만 d_k차원에서 서로 직교하는 벡터는 최대 d_k개뿐이고(선형대수 6편), 실제 키들은 비슷한 방향을 공유하기도 한다. 그러면 읽을 때마다 다른 값들이 섞여 나온다. 덧셈만 하니 같은 키에 새 값을 쓰면 옛 값과 새 값의 합이 남고, 한 번 쓴 내용은 지울 방법도 없다. 맘바-2(10편)처럼 감쇠 게이트 `S_t = α_t S_(t−1) + v_t k_tᵀ`를 붙이면 오래된 기억을 지울 수는 있지만, 모든 기억을 똑같은 비율로 줄일 뿐 특정 키의 내용만 고치지는 못한다.

## 델타 규칙: 틀린 만큼 고쳐 쓴다
**델타 규칙**(delta rule)은 쓰기 전에 지금 기억이 키 k_t에 대해 무엇을 돌려주는지 읽어 보고, 원하는 값 v_t와의 차이만큼만 고친다. 1960년 위드로(Widrow)와 호프(Hoff)의 적응 필터 학습 규칙에서 온 이름이다. 2021년 슐라크(Schlag)·이리에(Irie)·슈미트후버가 이를 리니어 트랜스포머의 상태 갱신에 적용했고, 이 모델을 보통 DeltaNet이라 부른다.
```text
S_t = S_(t−1) + β_t (v_t − S_(t−1) k_t) k_tᵀ
    = S_(t−1) (I − β_t k_t k_tᵀ) + β_t v_t k_tᵀ
```

β_t ∈ (0, 1)는 쓰기 강도다. 이 갱신은 손실 `½‖S k_t − v_t‖²`에 대한 경사 하강법 한 스텝이기도 하다. 기울기가 `(S k_t − v_t) k_tᵀ`이고 학습률이 β_t다. 즉 토큰이 들어올 때마다 상태를 "키 → 값" 회귀 문제에 맞춰 조금씩 학습시키는 것이다. ‖k_t‖ = 1이고 β_t = 1이면 `I − k_t k_tᵀ`는 k_t 방향 성분을 정확히 지우는 사영이라, 옛 값을 지우고 새 값으로 바꿔 쓴 뒤 `S_t k_t = v_t`가 된다. 키를 L2 정규화하는 이유도 여기 있다. 키가 길면 `1 − β‖k‖²`가 −1보다 작아져 상태가 폭발할 수 있다. 키-값 16쌍을, 키가 무작위 방향인 경우와 서로 비슷한 방향인 경우로 나눠 저장해 보자.
```python
import numpy as np

rng = np.random.default_rng(0)
d, n = 64, 16
unit = lambda x: x / np.linalg.norm(x, axis=-1, keepdims=True)
V = rng.normal(size=(n, d))

def recall_error(S, K, V):                        # ‖S k − v‖ / ‖v‖ 평균
    err = np.linalg.norm(K @ S.T - V, axis=1)
    return (err / np.linalg.norm(V, axis=1)).mean()

for name, K in [("무작위 키", unit(rng.normal(size=(n, d)))),
                ("비슷한 키", unit(rng.normal(size=d) + rng.normal(size=(n, d))))]:
    S_add = V.T @ K                               # 덧셈형: Σ v kᵀ
    S_del = np.zeros((d, d))
    for k, v in zip(K, V):                        # 델타 규칙(β = 1)
        S_del += np.outer(v - S_del @ k, k)       # 틀린 만큼만 고쳐 쓴다
    cos = np.abs(K @ K.T)[~np.eye(n, dtype=bool)].mean()
    print(f"{name} (평균 |cos| {cos:.2f}): 덧셈 {recall_error(S_add, K, V):.2f},",
          f"델타 {recall_error(S_del, K, V):.2f}")
```
```text
무작위 키 (평균 |cos| 0.09): 덧셈 0.44, 델타 0.30
비슷한 키 (평균 |cos| 0.50): 덧셈 2.06, 델타 0.81
```

무작위 키도 64차원에서는 완전히 직교하지 않아서 덧셈형의 회상 오차가 44%다. 키들이 비슷하면(평균 코사인 0.5) 덧셈형은 간섭 항이 원래 값보다 커져 오차가 206%로, 사실상 모든 값을 뒤섞은 것을 돌려준다. 델타 규칙은 같은 상황에서 81%로 절반 이하다. 한 번 훑어 쓰는 동안 나중의 쓰기가 앞선 키의 읽기를 조금씩 흔들어서 0은 아니지만, 쓸 때마다 겹치는 부분을 빼고 쓰기 때문에 간섭이 훨씬 작다.

## 게이트 감쇠 α와 Gated DeltaNet
델타 규칙은 쓰는 키 방향만 고친다. 문서가 바뀌어 지난 내용 전체가 쓸모없어졌을 때 그것을 한꺼번에 비우지는 못한다. **Gated DeltaNet**(Yang·Kautz·Hatamizadeh, 2024)은 맘바-2의 감쇠 게이트 α_t ∈ (0, 1)를 델타 규칙에 곱했다.
```text
S_t = α_t · S_(t−1) · (I − β_t k_t k_tᵀ) + β_t v_t k_tᵀ
o_t = S_t q_t
```

α_t → 0이면 기억을 통째로 지우고(빠른 소거), β_t는 특정 키의 내용을 골라 고친다(정밀한 갱신). 지우는 항 `I − β_t k_t k_tᵀ`를 I로 바꾸면(더하기만 하면) 맘바-2식 감쇠 갱신이고, α_t = 1이면 DeltaNet이다. 두 값 모두 입력에서 매 토큰 계산된다. 지난 문서 256쌍을 쓴 뒤 새 문서에서 키 4개를 쓰는 경우와, 같은 키에 값을 한 번 더 바꿔 쓰는 경우를 네 가지 규칙으로 비교한다. 게이트가 있는 쪽은 문서 경계에서 α = 0이 되었다고 둔다.
```python
import numpy as np

rng = np.random.default_rng(0)
d, m = 64, 4
unit = lambda x: x / np.linalg.norm(x, axis=-1, keepdims=True)
old = list(zip(unit(rng.normal(size=(256, d))), rng.normal(size=(256, d))))
K = unit(rng.normal(size=(m, d)))                 # 새 문서의 키 4개
V1, V2 = rng.normal(size=(2, m, d))               # 처음 값, 바뀐 값

def memory(stream, delta, beta=1.0):
    S, I = np.zeros((d, d)), np.eye(d)
    for k, v, alpha in stream:
        if delta:   # S_t = α_t·S_(t−1)·(I − β_t·k_t·k_tᵀ) + β_t·v_t·k_tᵀ
            S = alpha * S @ (I - beta * np.outer(k, k)) + beta * np.outer(v, k)
        else:       # 덧셈형(리니어 어텐션): S_t = α_t·S_(t−1) + v_t·k_tᵀ
            S = alpha * S + np.outer(v, k)
    return S

for task, writes in [("새로 쓰기", [V1]), ("값 바꾸기", [V1, V2])]:
    new = [(k, v) for Vs in writes for k, v in zip(K, Vs)]
    row = []
    for gated in [False, True]:                   # 게이트: 문서 경계에서 α = 0
        stream = [(k, v, 1.0) for k, v in old]
        stream += [(k, v, 0.0 if gated and i == 0 else 1.0)
                   for i, (k, v) in enumerate(new)]
        for delta in [False, True]:
            S, target = memory(stream, delta), writes[-1]
            err = np.linalg.norm(K @ S.T - target, axis=1).mean()
            row.append(f"{err / np.linalg.norm(target, axis=1).mean():.2f}")
    print(task, "덧셈·델타·게이트 덧셈·게이트 델타 =", " / ".join(row))
```
```text
새로 쓰기 덧셈·델타·게이트 덧셈·게이트 델타 = 2.00 / 0.09 / 0.12 / 0.06
값 바꾸기 덧셈·델타·게이트 덧셈·게이트 델타 = 2.19 / 0.08 / 1.00 / 0.08
```

숫자는 마지막에 쓴 값에 대한 평균 상대 오차다. 게이트 없는 덧셈형은 지난 문서 256쌍이 그대로 남아 오차가 200%를 넘는다. 게이트를 달면 새로 쓰기는 12%로 좋아지지만, 값을 바꾸면 옛 값과 새 값이 더해져 100%가 된다. 델타형은 두 과제 모두 8~9%로 잘 버틴다. 키 방향을 덮어쓰며 지난 내용과 옛 값을 함께 밀어내기 때문이다. 게이트 델타형은 경계에서 지난 내용을 비운 덕분에 새로 쓰기에서 6%로 가장 낮고, 값 바꾸기에서도 델타형만큼 정확하다. 지우기는 게이트가, 고쳐 쓰기는 델타 규칙이 맡는 분업이다.

## 청크 단위 병렬 학습
상태 전이가 맘바-2처럼 스칼라 a_t가 아니라 행렬 `I − β_t k_t k_tᵀ`라서, 10편의 누적 곱 마스크를 그대로 쓸 수 없다. 2024년 Yang 등의 DeltaNet 병렬화 논문은 이 행렬들의 곱을 "단위 행렬 − 저랭크 행렬" 꼴로 압축하는 표현(WY 표현)을 써서, 시퀀스를 청크로 나누고 청크 안의 계산을 행렬 곱으로 바꿨다. 청크 하나의 상태 변화는 키끼리의 내적으로 만든 작은 삼각 행렬을 푼 다음, 행렬 곱 몇 번으로 끝난다.
```python
import numpy as np

rng = np.random.default_rng(0)
d, C = 16, 8                                      # 상태 차원, 청크 길이
unit = lambda x: x / np.linalg.norm(x, axis=-1, keepdims=True)
K, V = unit(rng.normal(size=(C, d))), rng.normal(size=(C, d))
beta = 1 / (1 + np.exp(-rng.normal(size=C)))      # β_t ∈ (0, 1)
S0 = rng.normal(size=(d, d))                      # 이전 청크가 넘겨준 상태

S = S0.copy()                                     # ① 한 스텝씩 델타 규칙
for k, v, b in zip(K, V, beta):
    S = S @ (np.eye(d) - b * np.outer(k, k)) + b * np.outer(v, k)

G = np.tril(K @ K.T, -1)                          # ② 청크 단위: 키끼리 내적만으로
A = np.linalg.inv(np.eye(C) + beta[:, None] * G)  # (UT 변환: 삼각 행렬 풀기)
W, U = A @ (beta[:, None] * K), A @ (beta[:, None] * V)
S_chunk = S0 - (S0 @ W.T) @ K + U.T @ K           # 행렬 곱 몇 번으로 끝
print(np.abs(S - S_chunk).max())
```
```text
2.220446049250313e-15
```

8스텝을 하나씩 갱신한 상태와 청크 공식으로 한 번에 구한 상태가 10⁻¹⁵ 이내로 같다. 청크 안은 텐서 코어가 잘하는 행렬 곱이고, 청크 사이로만 상태를 넘기면 된다. Gated DeltaNet은 여기에 청크 안 α의 누적 곱을 더해 같은 방식으로 학습한다.

## 블록 구성
Gated DeltaNet 층은 라마식 블록에서 셀프 어텐션 자리에 들어가고, SwiGLU FFN(8편)과 번갈아 쌓인다. 층 안의 흐름은 다음과 같다.
- q, k, v: 선형 투영 → 짧은 인과 합성곱(2편) → SiLU. q와 k는 L2 정규화한다.
- α, β: 입력의 선형 투영에서 계산한다. β는 시그모이드로 (0, 1), α는 맘바-2와 같은 방식으로 (0, 1) 사이에 둔다.
- 출력: `o_t = S_t q_t`를 헤드마다 정규화하고, 입력에서 만든 SiLU 출력 게이트를 곱한 뒤 출력 투영을 거친다.

고정 크기 상태는 정확한 검색에서 여전히 어텐션보다 약하다. 그래서 실제 모델은 섞어 쓴다. Qwen3-Next는 48층을 "Gated DeltaNet 3층 + 게이트 어텐션 1층" 묶음 12개로 구성했다. 이런 하이브리드 설계는 오픈 웨이트 모델 4편에서 다룬다.

## 어디에 쓰이나
- 미적분 10편 「경사 하강법의 수학」: 델타 규칙은 손실 `½‖S k − v‖²`에 대해 학습률 β로 한 스텝 내려가는 경사 하강법이다.
- 통계학 8편 「선형 회귀와 최소제곱법」: 상태 S는 토큰이 들어올 때마다 "키 → 값" 선형 회귀를 온라인으로 푸는 계수 행렬이다.
- 선형대수 6편 「일차 독립, 기저, 차원, 랭크」: d_k차원에서 직교하는 키는 최대 d_k개라, 그보다 많이 저장하면 간섭이 피할 수 없고 랭크가 기억 용량의 한계가 된다.
- 오픈 웨이트 모델 4편 「하이브리드 모델: 리니어 어텐션과 어텐션 섞기」: Qwen3-Next가 Gated DeltaNet 3층마다 어텐션 1층을 섞는 구성과 그 메모리 이점을 다룬다.

## 정리
- 리니어 어텐션 상태 `S = Σ v kᵀ`는 연상 메모리이고, 키가 겹치면 간섭으로 회상 오차가 커진다(비슷한 키 16개에서 206%).
- 델타 규칙 `S ← S + β(v − Sk)kᵀ`는 틀린 만큼만 고쳐 쓰며, 같은 실험에서 오차를 81%로 줄인다.
- Gated DeltaNet `S_t = α_t·S_(t−1)·(I − β_t k_t k_tᵀ) + β_t v_t k_tᵀ`는 α로 한꺼번에 지우고 β로 골라 고친다.
- WY 표현으로 청크 안을 행렬 곱으로 계산해 병렬 학습하며, 실제 모델은 어텐션 층과 섞어 쓴다.

## 더 알아보기
- 이전 글: 10편 「상태 공간 모델과 맘바」
- 처음 글: 1편 「선형 층: 모든 신경망의 기본 부품」
- Gated DeltaNet 논문(Yang 등, 2024): https://arxiv.org/abs/2412.06464
- DeltaNet 병렬화 논문(Yang 등, 2024): https://arxiv.org/abs/2406.06484
