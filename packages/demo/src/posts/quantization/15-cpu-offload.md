# [양자화 15/15] CPU 오프로드: GPU 메모리보다 큰 모델 돌리기

> **한 줄 요약** — 배치 1 디코드의 토큰 시간은 각 메모리에서 읽는 바이트 ÷ 대역폭의 합이고 열 배 넘게 느린 CPU 쪽이 거의 전부를 차지하므로, 오프로드의 요령은 토큰마다 CPU 쪽에서 읽는 바이트를 줄이는 것(양자화, 자주 읽는 텐서부터 GPU에, MoE 전문가만 CPU에)이다.

## 이 글에서 다루는 것
- 대역폭 지도와 토큰 시간 모델 `t = Σ 바이트 / 대역폭`
- 층 분할(`-ngl`): 느린 쪽이 지배한다
- 가중치를 PCIe로 흘려보내기: 배치 크기와 프리필
- MoE 전문가만 CPU에 두기, KV 캐시 위치와 문맥 길이
- mmap, 페이지 캐시, `--mlock`

## 대역폭 지도
배치 1 디코드는 토큰마다 가중치를 한 번씩 읽고 값마다 곱셈-덧셈 한 번만 한다(1편, 어텐션 9편). 가중치가 여러 메모리에 나뉘면 토큰 시간은 메모리마다 읽는 바이트를 그 대역폭으로 나눠 더한 값이다.
```text
t_token ≈ B_gpu / BW_gpu + B_cpu / BW_cpu   (토큰/초 = 1/t)
```

대역폭은 이론값이다. DDR 채널 하나는 8바이트 폭이라 DDR5-5600 2채널은 5600M × 8 × 2 = 89.6GB/s다.

| 경로 | 이론 대역폭 | 비고 |
|---|---|---|
| RTX 4090 | 약 1,008GB/s | GDDR6X 24GB |
| M2 Ultra | 약 800GB/s | 통합 메모리 |
| M4 Max | 약 546GB/s | 통합 메모리 |
| DDR5-5600 | 약 89.6GB/s | 2채널 |
| PCIe 5.0 x16 | 약 64GB/s | 한 방향 |
| PCIe 4.0 x16 | 약 32GB/s | 한 방향 |
| NVMe SSD | 약 7.45GB/s | 990 PRO 읽기 |

데스크톱 CPU 메모리는 4090의 약 1/11이고, PCIe 4.0은 그보다도 느리다. 실측은 모두 이보다 낮다. 애플 실리콘은 CPU와 GPU가 한 메모리를 함께 써서 그 용량 안에서는 나눌 필요가 없다.

## 층 분할: 느린 쪽이 지배한다
llama.cpp는 `-ngl`(`--n-gpu-layers`)로 GPU에 올릴 층 수를 정하고, 나머지 층은 CPU가 자기 메모리에서 읽어 계산한다. 라마 3 70B(80층)의 Q4_K_M GGUF 파일(형식은 14편 「GGUF: 양자화 모델을 담는 파일과 k-quant」)은 공개된 크기가 약 42.5GB라 24GB GPU에 다 안 들어간다. 층마다 크기가 같다고 근사하고 4090 + DDR5-5600 2채널에서 이론 대역폭으로 상한을 계산한다.
```python
GB = 1e9
gpu, cpu = 1008 * GB, 5600e6 * 8 * 2        # RTX 4090, DDR5-5600 2채널
size, n_layer = 42.5 * GB, 80               # 70B Q4_K_M 파일, 층 수
L = size / n_layer                          # 층당 바이트(근사)
fit = int((24 * GB - 3 * GB) // L)          # KV 캐시·버퍼로 3GB를 남긴다

def split(n_gpu):                           # 토큰 시간 = Σ 바이트 / 대역폭
    t_g, t_c = n_gpu * L / gpu, (n_layer - n_gpu) * L / cpu
    return 1 / (t_g + t_c), t_c / (t_g + t_c)

print(f"CPU {cpu / GB:.1f}GB/s, 층당 {L / GB:.3f}GB, 24GB에 {fit}층")
for n in [0, fit, 60, 80]:
    r, share = split(n)
    print(f"-ngl {n:2d}: {r:5.2f}토큰/초, 시간의 {share:.0%}가 CPU 쪽")
```
```text
CPU 89.6GB/s, 층당 0.531GB, 24GB에 39층
-ngl  0:  2.11토큰/초, 시간의 100%가 CPU 쪽
-ngl 39:  3.79토큰/초, 시간의 92%가 CPU 쪽
-ngl 60:  6.66토큰/초, 시간의 79%가 CPU 쪽
-ngl 80: 23.72토큰/초, 시간의 0%가 CPU 쪽
```

절반 가까운 39층을 GPU에 올려도 2.11 → 3.79토큰/초로 1.8배다. GPU 쪽 20.7GB는 21ms, CPU 쪽 21.8GB는 243ms가 걸린다. GPU에 둔 바이트 비율을 f, 대역폭 비를 r = 1008/89.6 ≈ 11.25라 하면 속도 향상은 `1 / ((1 − f) + f/r)`로 언제나 `1/(1 − f)`보다 작다(암달의 법칙). 60층·80층은 GPU가 더 크다고 친 가상의 값으로, 마지막 층들을 올릴 때 속도가 급히 뛴다. 통합 메모리라면 전부 800GB/s로 읽어 상한이 800 ÷ 42.5 ≈ 18.8토큰/초다.

## 가중치를 PCIe로 흘려보내기
다른 길은 계산을 전부 GPU에서 하고 없는 가중치를 쓸 차례마다 PCIe로 옮겨 오는 것이다. Hugging Face Accelerate의 `device_map="auto"`는 GPU, CPU, 디스크 순으로 가중치를 채우고, CPU에 둔 가중치는 순전파 직전에 GPU로 올렸다가 치운다. FlexGen(Sheng 등, 2023)은 텐서를 GPU·CPU·디스크 중 어디에 둘지 선형 계획법으로 정하고 가중치와 KV 캐시를 4비트로 압축해 큰 배치로 돌린다. 학습에서는 ZeRO-Offload가 데이터와 계산을 CPU로 넘겨 GPU 한 장으로 13B 넘게 학습했고, ZeRO-Infinity는 NVMe까지 썼다. 위 코드에 이어서 배치 크기별로 비교한다.
```python
P, pcie = 70.6e9, 32 * GB                   # 파라미터 수, PCIe 4.0 x16
F_gpu, F_cpu = 165e12, 1e12                 # 4090 FP16 텐서 코어, CPU(가정)
fg = fit / n_layer                          # GPU에 상주하는 비율

def step(B, stream):                        # 토큰 B개를 한 스텝에 처리
    t = max(fg * size / gpu, 2 * fg * P * B / F_gpu)
    rest, flops = (1 - fg) * size, 2 * (1 - fg) * P * B
    if stream:                              # GPU로 옮겨 계산(전송과 겹침)
        return t + max(rest / pcie, flops / F_gpu)
    return t + max(rest / cpu, flops / F_cpu)   # CPU가 제자리에서 계산

for B in [1, 8, 64, 512]:
    a, b = B / step(B, False), B / step(B, True)
    print(f"배치 {B:3d}: CPU 계산 {a:5.1f}, PCIe 전송 {b:5.1f}토큰/초")
print(f"프리필 4096토큰: CPU 계산 {step(4096, False):.0f}초,"
      f" PCIe 전송 {step(4096, True):.1f}초")
```
```text
배치   1: CPU 계산   3.8, PCIe 전송   1.4토큰/초
배치   8: CPU 계산  13.3, PCIe 전송  11.4토큰/초
배치  64: CPU 계산  13.7, PCIe 전송  90.5토큰/초
배치 512: CPU 계산  13.7, PCIe 전송 572.5토큰/초
프리필 4096토큰: CPU 계산 298초, PCIe 전송 3.5초
```

배치 1에서 흘려보내기는 1.4토큰/초로 층 분할(3.8)보다 나쁘다. PCIe 4.0(32GB/s)이 DDR5(89.6GB/s)보다 느리니 가중치를 옮기기보다 있는 곳에서 계산하는 편이 낫다. 배치가 커지면 뒤집힌다. 옮긴 가중치를 배치의 모든 토큰이 함께 쓰므로 전송 시간은 그대로이고 처리량은 배치에 비례해 오르지만, CPU는 연산 바운드가 되어 13.7토큰/초에서 멈춘다(CPU 1 TFLOPS는 가정값). 연산 바운드인 프리필(어텐션 9편)도 같아서 4096토큰 프롬프트가 CPU로는 약 5분, GPU로 옮기면 3.5초다. 큰 배치의 KV 캐시는 GPU에 안 들어가는데, FlexGen은 KV 캐시의 위치도 함께 정하고 압축해 16GB GPU 한 장으로 OPT-175B를 유효 배치 144로 돌려 1토큰/초의 처리량을 처음 냈다고 보고했다. 대화형에는 층 분할, 일괄 처리에는 흘려보내기다.

## MoE: 전문가만 CPU에
MoE는 토큰마다 전문가 일부만 읽는다(오픈 웨이트 모델 3편). GPU 메모리 1바이트의 가치는 "토큰마다 그 바이트를 몇 번 읽나"다. 어텐션·라우터·출력 헤드는 매번 전부, 전문가는 평균 8/128 = 1/16, 임베딩 표는 한 행만 읽는다. Qwen3-30B-A3B의 공개 설정(48층, d = 2048, 어텐션 헤드 32 : 4, 헤드 차원 128, 전문가 128개 중 8개, 전문가 은닉 768, 어휘 151,936)과 Q4_K_M 파일 크기 약 18.6GB로, 바이트당 읽기가 큰 텐서부터 GPU를 채우는 탐욕 계산을 한다.
```python
GB = 1e9
gpu, cpu = 1008 * GB, 89.6 * GB
d, nl, E, k, h, V = 2048, 48, 128, 8, 768, 151936   # Qwen3-30B-A3B
attn = 2 * d * 32 * 128 + 2 * d * 4 * 128 + d * E   # 어텐션(32 : 4) + 라우터
ex = 3 * d * h                              # SwiGLU 전문가 하나
total = nl * (attn + E * ex) + 2 * V * d
active = nl * (attn + k * ex) + 2 * V * d
b = 18.6 * GB / total                       # 파라미터당 평균 바이트
print(f"전체 {total / 1e9:.1f}B, 활성 {active / 1e9:.2f}B, {b:.2f}바이트")

items = [(V * d, d), (V * d, V * d)]        # 임베딩(한 행만 읽음), 출력 헤드
items += [(attn, attn)] * nl + [(E * ex, k * ex)] * nl  # (크기, 토큰당 읽기)
items.sort(key=lambda x: -x[1] / x[0])      # 읽기/크기가 큰 것부터 GPU로

def moe(budget):
    used = t = 0.0
    for size, read in items:
        on = (used + size) * b <= budget
        used += size * on
        t += read * b / (gpu if on else cpu)
    return 1 / t

for budget in [0, 4, 8, 12, 20]:
    print(f"GPU {budget:2d}GB: {moe(budget * GB):5.1f}토큰/초")
print(f"같은 크기 밀집 모델, CPU만: {cpu / (18.6 * GB):.1f}토큰/초")
```
```text
전체 30.5B, 활성 3.35B, 0.61바이트
GPU  0GB:  48.4토큰/초
GPU  4GB:  89.3토큰/초
GPU  8GB: 116.0토큰/초
GPU 12GB: 165.4토큰/초
GPU 20GB: 544.0토큰/초
같은 크기 밀집 모델, CPU만: 4.8토큰/초
```

설정으로 센 전체 30.5B·활성 3.35B는 발표치(30.5B, 3.3B)와 맞는다. 토큰당 1.85GB만 읽어 GPU 없이도 상한이 같은 크기 밀집 모델의 10배다. GPU 4GB면 매번 전부 읽히는 어텐션·출력 헤드(0.75GB)가 먼저, 남은 자리에 전문가 8개 층이 올라가 89토큰/초, 8GB면 19개 층으로 116토큰/초다(KV 캐시 몫은 따로 남겼다고 친다). llama.cpp에서는 모든 층을 GPU에 올린 뒤 `-ot "exps=CPU"`(`--override-tensor`: 이름에 exps가 든 텐서를 CPU로)로 전문가만 내리거나, 같은 일을 하는 `--cpu-moe`, 처음 N개 층의 전문가만 CPU에 두는 `--n-cpu-moe N`을 쓴다. N을 메모리가 허락하는 만큼 줄이는 것이 위 탐욕 계산이다. 배치가 커지면 결국 대부분의 전문가를 읽으므로 이득이 준다.

밀집 모델에서는 뉴런 단위로 같은 일을 한다. PowerInfer(Song 등, 2023)는 자주 활성화되는 뉴런을 GPU에, 나머지를 CPU에 두고 활성화될 뉴런을 예측해 RTX 4090에서 llama.cpp보다 최대 11.69배 빨랐다고 보고했다.

## KV 캐시와 문맥 길이
디코드 한 스텝은 그 요청의 KV 캐시 전체도 읽는다. 라마 3 70B는 토큰당 2 × 80층 × KV 헤드 8 × 128 × 2바이트 = 320KiB다(어텐션 4편의 식). llama.cpp는 KV 캐시를 기본으로 오프로드하고, `-nkvo`(`--no-kv-offload`)로 끄면 CPU 메모리에 둔다. 첫 코드에 이어서 실행한다.
```python
kv_tok = 2 * 80 * 8 * 128 * 2               # 라마 3 70B FP16: 바이트/토큰
room = 23 * GB                              # 버퍼 1GB를 뺀 GPU 메모리

def with_kv(kv, on_gpu):
    n = int((room - kv * on_gpu) // L)      # KV를 넣고 남는 층 수
    if n < 0:
        return "  -  "
    t = n * L / gpu + (n_layer - n) * L / cpu + kv / (gpu if on_gpu else cpu)
    return f"{1 / t:.2f}"

for T in [4096, 32768, 131072]:
    kv = kv_tok * T
    print(f"{T // 1024:3d}K (KV {kv / GB:4.1f}GB): GPU {with_kv(kv, 1)},"
          f" CPU {with_kv(kv, 0)}, GPU·8비트 {with_kv(kv / 2, 1)}")
```
```text
  4K (KV  1.3GB): GPU 3.85, CPU 3.89, GPU·8비트 4.03
 32K (KV 10.7GB): GPU 2.77, CPU 2.76, GPU·8비트 3.32
128K (KV 42.9GB): GPU   -  , CPU 1.39, GPU·8비트 2.06
```

KV 캐시를 GPU에 두든 CPU에 두든 거의 같다. KV를 GPU에 올리면 그만큼 가중치 층이 CPU로 밀려나고, 토큰마다 한 번 읽는 바이트는 가중치든 KV든 비용이 같기 때문이다(MoE 탐욕 계산과 같은 원리). 문제는 총량이다. 128K 문맥이면 KV(42.9GB)가 가중치만큼 커져 4K 때의 약 3분의 1 속도가 되고, 12편처럼 KV를 8비트로 줄이면 1.5배 회복된다.

## mmap, 페이지 캐시, --mlock
llama.cpp는 기본으로 GGUF 파일을 mmap으로 매핑한다(`--no-mmap`으로 끈다). 매핑은 주소만 잡고, 실제 읽기는 페이지를 처음 건드릴 때 일어난다. 4GiB 파일에서 한 층만 읽어 확인한다.
```python
import numpy as np

path, L = "model.bin", 64 * 2**20           # 64MiB 층 64개 = 4GiB
with open(path, "wb") as f:
    f.truncate(64 * L)                      # 내용이 0인 4GiB 파일

def rss_mib():                              # 이 매핑의 물리 메모리(리눅스)
    s = open("/proc/self/smaps").read().split("\n")
    i = next(j for j, l in enumerate(s) if l.endswith(path))
    r = next(l for l in s[i:] if l.startswith("Rss:"))
    return int(r.split()[1]) // 1024

w = np.memmap(path, dtype=np.uint8, mode="r")
print(f"{w.nbytes >> 30}GiB 매핑 직후 {rss_mib()}MiB")
w[10 * L:11 * L].sum()                      # 10번 층만 읽기
print(f"10번 층을 읽은 뒤 {rss_mib()}MiB")
```
```text
4GiB 매핑 직후 0MiB
10번 층을 읽은 뒤 64MiB
```

매핑 직후 상주 메모리는 0이고, 10번 층을 읽은 뒤에도 그 64MiB만 올라왔다. 읽은 페이지는 운영체제의 페이지 캐시에 남아 다시 띄울 때는 디스크를 거치지 않으니 처음 한 번만 느리다. 메모리가 모자라면 페이지가 버려졌다가 다음 토큰에서 디스크로 다시 읽히는데, 7.45GB/s로 42.5GB면 토큰당 5.7초다. `--mlock`은 모델을 RAM에 붙잡아 스왑이나 압축으로 밀려나지 않게 한다. LLM in a flash(애플, 2023)는 가중치를 플래시에 두고 필요할 때 DRAM으로 가져오되 최근 활성화된 뉴런을 재사용해 읽는 양을 줄여, DRAM의 2배 크기 모델까지 돌렸다.

## 어디에 쓰이나
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: "생성 속도 ≈ 대역폭 ÷ 모델 크기"를 메모리가 여럿인 경우로 넓힌 것이 `t = Σ 바이트 / 대역폭`이다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: 프리필과 디코드의 산술 강도 차이가 흘려보내기가 큰 배치에서만 이득인 이유다.
- 오픈 웨이트 모델 3편 「MoE 모델: 믹스트랄, 딥시크-V3, Qwen3」: 토큰당 활성 파라미터만 읽는다는 그 글의 계산이 전문가를 CPU에 두는 근거다.

## 정리
- 토큰 시간은 `B_gpu/BW_gpu + B_cpu/BW_cpu`이고 11배 느린 CPU 쪽이 거의 전부라, 70B의 층 절반을 GPU에 올려도 1.8배다.
- 배치 1에서는 CPU가 제자리에서 계산하는 편이 PCIe 전송보다 낫고, 큰 배치와 프리필에서는 옮겨서 GPU로 계산하는 쪽이 압도적이다.
- GPU 메모리는 바이트당 토큰당 읽기가 큰 텐서부터 채운다. MoE는 전문가만 CPU에 두면 CPU가 활성 전문가만 읽는다.
- KV 캐시는 위치보다 총량이 문제다. mmap은 읽은 페이지만 올리고, 페이지 캐시와 `--mlock`이 디스크 재읽기를 막는다.

## 더 알아보기
- 이전 글: 14편 「GGUF: 양자화 모델을 담는 파일과 k-quant」
- 처음 글: 1편 「양자화의 기본: 실수를 정수 격자에 올리기」
- llama.cpp: https://github.com/ggml-org/llama.cpp
- FlexGen 논문: https://arxiv.org/abs/2303.06865
