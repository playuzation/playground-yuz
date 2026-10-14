# [양자화 14/15] GGUF: 양자화 모델을 담는 파일과 k-quant

> **한 줄 요약** — GGUF는 타입 붙은 키-값 메타데이터와 텐서 정보 뒤에 정렬된 텐서 데이터를 둔 llama.cpp의 단일 파일이라 mmap으로 바로 올라가고, 그 안의 k-quant는 256값 슈퍼블록의 하위 블록 스케일까지 6비트로 양자화해 Q4_0과 같은 4.5비트로 영점까지 저장한다.

## 이 글에서 다루는 것
- GGUF의 바이트 구조와 mmap
- Q8_0·Q4_0과 k-quant의 블록 구조, 값당 비트
- 같은 4.5비트에서 Q4_0과 k-quant 비교
- Q4_K_M의 텐서별 형식 섞기, imatrix, i-quant

## GGUF 파일의 구조
**GGUF**는 llama.cpp(텐서 라이브러리 ggml)의 모델 파일 형식으로, 2023년 8월 GGJT 등 이전 형식을 대체했다. 명세(docs/gguf.md)의 배치는 이렇다. 기본은 리틀 엔디언이고 필드는 정렬 없이 이어 붙는다.
```text
┌────────────────────────────┐
│ magic, version (u32)       │
│ tensor_count, kv_count     │
│ kv × kv_count              │
│ tensor info × tensor_count │
│ 0x00 padding, tensor data  │
└────────────────────────────┘
```

- 매직은 바이트 47 47 55 46("GGUF"), 버전은 3, 두 개수는 uint64다.
- 키-값은 키(문자열: uint64 길이 + UTF-8), 값 타입(uint32), 값 순이다. 값 타입 0~12번은 UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT32, BOOL, STRING, ARRAY, UINT64, INT64, FLOAT64이고, ARRAY는 원소 타입·개수·값을 잇는다.
- 텐서 정보는 이름, 차원 수(uint32), 차원(uint64, 빠른 축부터), 형식 번호(Q4_0 = 2, Q8_0 = 8, Q2_K~Q6_K = 10~14 등), 오프셋(uint64)이다. 오프셋은 데이터 영역 기준이고 ALIGNMENT(`general.alignment`, 없으면 32)의 배수다.

`struct`로 작은 GGUF를 쓰고 다시 읽는다. 이 글의 코드는 차례로 이어서 실행한다.
```python
import io, struct
import numpy as np

S = lambda t: struct.pack("<Q", len(t)) + t.encode()
A = 32
kv = [("general.architecture", 8, S("llama")),        # 8 = STRING
      ("general.alignment", 4, struct.pack("<I", A))] # 4 = UINT32
ts = [("output_norm.weight", 0, np.ones(5, np.float32)),        # 0 = F32
      ("token_embd.weight", 1, np.arange(24, dtype=np.float16)  # 1 = F16
       .reshape(3, 8))]

head = b"GGUF" + struct.pack("<IQQ", 3, len(ts), len(kv))
head += b"".join(S(k) + struct.pack("<I", t) + v for k, t, v in kv)
data = b""
for name, typ, a in ts:
    data += bytes(-len(data) % A)           # 텐서 사이도 정렬
    head += S(name) + struct.pack(f"<I{a.ndim}QIQ", a.ndim,
                                  *a.shape[::-1], typ, len(data))
    data += a.tobytes()
f = head + bytes(-len(head) % A) + data

def parse(f):                               # 값은 STRING·UINT32만
    r = io.BytesIO(f)
    rd = lambda fm: struct.unpack("<" + fm, r.read(struct.calcsize("<" + fm)))
    rs = lambda: r.read(rd("Q")[0]).decode()
    magic, ver, nt, nkv = rd("4sIQQ")
    meta = {rs(): rs() if rd("I")[0] == 8 else rd("I")[0] for _ in range(nkv)}
    info = [(rs(), rd(f"{rd('I')[0]}Q"), *rd("IQ")) for _ in range(nt)]
    p = r.tell()
    return magic, ver, meta, info, p + (-p % meta["general.alignment"])

magic, ver, meta, info, base = parse(f)
print(magic, ver, meta, len(head), base)
for (name, dims, typ, off), (*_, a) in zip(info, ts):
    dt = [np.float32, np.float16][typ]
    v = np.frombuffer(f, dt, np.prod(dims), base + off)  # 복사 없이 보기
    print(name, dims, typ, base + off, np.array_equal(v, a.ravel()))
```
```text
b'GGUF' 3 {'general.architecture': 'llama', 'general.alignment': 32} 209 224
output_norm.weight (5,) 0 224 True
token_embd.weight (8, 3) 1 256 True
```

209바이트인 헤더·텐서 정보 뒤와 20바이트인 첫 텐서 뒤를 0으로 채워, 두 텐서가 32의 배수 위치(224, 256)에서 시작한다.

## 한 파일, 그리고 mmap
명세의 목표는 단일 파일, 확장성, mmap 호환, 외부 정보가 필요 없는 완결성이다. GGJT는 하이퍼파라미터를 타입 없는 값의 목록으로 저장해 값을 하나 더해도 호환이 깨졌다. GGUF는 `llama.block_count` 같은 키로 config.json의 내용을, `tokenizer.ggml.tokens`(문자열 배열) 등으로 어휘·병합 규칙·채팅 템플릿을 담는다. 텐서는 디스크에서도 메모리 안의 블록 배치 그대로 정렬돼 있어, 로더는 파일을 **mmap**(메모리 매핑)하고 텐서 포인터가 그 영역을 가리키게만 하면 된다(위 `np.frombuffer`처럼 복사 없음). llama.cpp는 mmap이 기본이고(`--no-mmap`으로 끈다), 페이지 캐시와 GPU·CPU 분할은 15편에서 다룬다.

## Q8_0과 Q4_0: 값 32개 + FP16 스케일
양자화 텐서는 ggml-common.h의 블록 구조체를 이어 붙인 바이트열이다(3편의 그룹 스케일).
- `block_q8_0`: FP16 d + int8 32개. `d = max∣x∣/127`, `q = round(x/d)`.
- `block_q4_0`: d + 4비트 32개. 절댓값이 가장 큰 값 x_m을 부호째 써서 `d = x_m/(−8)`, `x̂ = d·q`(q는 −8~7, 저장은 q + 8)로 −8 끝까지 쓴다. 바이트 j의 아래 4비트에 j번째, 위 4비트에 j+16번째 값이 들어간다.
- `block_q4_1`: FP16 최솟값을 더한 비대칭 `x̂ = d·q + m`.

## k-quant: 스케일도 양자화한다
Q4_0의 0.5비트는 FP16 스케일 몫이다. **k-quant**는 값 256개(QK_K)를 **슈퍼블록**으로 묶고, 하위 블록 스케일(과 최솟값)을 작은 정수로 양자화해 슈퍼블록에 FP16 d(와 dmin)만 둔다. Q4_K는 32값 하위 블록 8개에 `x̂ = d·sc_j·q − dmin·m_j`(q 4비트, sc_j·m_j 6비트)다. 1편의 비대칭 양자화를 하위 블록마다 하면서 스케일 비용은 12비트/32값 + 32비트/256값 = 0.5비트로 Q4_0과 같다. Q2_K는 16값 블록(스케일·최솟값 4비트), Q3_K·Q6_K는 최솟값 없는 16값 블록(스케일 6비트·int8), Q5_K는 Q4_K에 다섯째 비트를 더한 것이다. 구조체 크기 검사(static_assert)의 필드 합으로 값당 비트를 센다.
```python
QK = 256                                    # 슈퍼블록 크기 QK_K
B = {"F32": (1, 4), "BF16": (1, 2),         # 형식: (블록 값 수, 바이트)
     "Q8_0": (32, 2 + 32),
     "Q4_0": (32, 2 + 16),
     "Q4_1": (32, 2 + 2 + 16),              # d, m, qs
     "Q2_K": (QK, QK // 16 + QK // 4 + 2 + 2),       # scales, qs, d, dmin
     "Q3_K": (QK, QK // 8 + QK // 4 + 12 + 2),       # hmask, qs, scales, d
     "Q4_K": (QK, 2 + 2 + 12 + QK // 2),             # d, dmin, scales, qs
     "Q5_K": (QK, 2 + 2 + 12 + QK // 8 + QK // 2),  # Q4_K + qh
     "Q6_K": (QK, QK // 2 + QK // 4 + QK // 16 + 2), # ql, qh, scales, d
     "IQ2_XXS": (QK, 2 + QK // 8 * 2)}               # d, uint16 qs
for k, (n, b) in list(B.items())[2:]:
    print(f"{k}: {n}개 {b}바이트 → {8 * b / n}비트")
```
```text
Q8_0: 32개 34바이트 → 8.5비트
Q4_0: 32개 18바이트 → 4.5비트
Q4_1: 32개 20바이트 → 5.0비트
Q2_K: 256개 84바이트 → 2.625비트
Q3_K: 256개 110바이트 → 3.4375비트
Q4_K: 256개 144바이트 → 4.5비트
Q5_K: 256개 176바이트 → 5.5비트
Q6_K: 256개 210바이트 → 6.5625비트
IQ2_XXS: 256개 66바이트 → 2.0625비트
```

FP16 스케일·최솟값을 그대로 두는 Q4_1(5.0비트)까지 가상의 가중치로 비교한다. llama.cpp는 후보 스케일 여러 개를 가중 제곱 오차로 고르지만 여기서는 단순 반올림이다.
```python
f16 = lambda a: a.astype(np.float16).astype(float)    # FP16로 저장
db = lambda x, y: 10 * np.log10(np.mean(x**2) / np.mean((y - x) ** 2))

def q4_0(w):                                # d = 최대∣x∣인 값/(−8)
    b = w.reshape(-1, 32)
    d = f16(b[np.arange(len(b)), np.abs(b).argmax(1)] / -8)[:, None]
    return (np.clip(np.round(b / d), -8, 7) * d).reshape(w.shape)

def q6(v):                                  # 6비트 정수 × FP16 슈퍼블록 스케일
    d = f16(v.max(1, keepdims=True) / 63)
    return d * np.round(v / d)

def affine(w, k):                           # x̂ = s·q − m, q ∈ 0~15
    b = w.reshape(-1, 8, 32)                # 슈퍼블록 × 하위 블록 8개
    m = -np.minimum(b.min(2, keepdims=True), 0)
    s = (b.max(2, keepdims=True) + m) / 15
    s, m = (q6(s), q6(m)) if k else (f16(s), f16(m))  # Q4_K식 / Q4_1
    return (s * np.clip(np.round((b + m) / s), 0, 15) - m).reshape(w.shape)

rng = np.random.default_rng(0)
for nm, x in [("정규", rng.normal(size=(1024, 4096))),
              ("t(5)", rng.standard_t(5, size=(1024, 4096)))]:
    W = x * 0.02                            # 가상의 가중치
    print(f"{nm}: Q4_0 {db(W, q4_0(W)):.2f}  Q4_1 {db(W, affine(W, 0)):.2f}"
          f"  Q4_K식 {db(W, affine(W, 1)):.2f}dB")
```
```text
정규: Q4_0 21.32  Q4_1 22.13  Q4_K식 22.12dB
t(5): Q4_0 19.37  Q4_1 20.93  Q4_K식 20.90dB
```

Q4_K식이 같은 비트의 Q4_0보다 0.8~1.5dB 높고 Q4_1과는 0.01~0.03dB 차이다. 대칭인 Q4_0은 최솟값·최댓값이 비대칭인 블록에서 칸을 버리고, 슈퍼블록 안 스케일들의 크기가 이처럼 비슷하면 6비트로 충분하다.

## Q4_K_M: 텐서마다 형식 섞기
`llama-quantize`의 Q4_K_M은 파일 전체의 조합이다. 소스(src/llama-quant.cpp)의 밀집 모델 규칙은 이렇다.
- 기본은 Q4_K, 노름 같은 1차원 텐서는 양자화하지 않는다.
- 출력 층 `output.weight`는 Q6_K(Q4_0 등도 같은 규칙).
- `attn_v`·`ffn_down`은 층 i가 앞 1/8, 뒤 1/8이거나 `(i − L/8) % 3 == 2`이면 Q6_K(32층 중 16층).

라마 3 8B로 크기를 계산해 이 도구의 도움말(형식 목록)에 적힌 값과 맞춰 본다.
```python
d, L, V, ff, kv = 4096, 32, 128256, 14336, 1024   # 라마 3 8B 설정
more = lambda i: i < L // 8 or i >= 7 * L // 8 or (i - L // 8) % 3 == 2
def size(base, out="Q6_K", up=None):
    t = [(2 * L * d + d, "F32"), (V * d, base), (V * d, out)]  # 노름·임베딩·출력
    for i in range(L):
        t += [(2 * d * d + kv * d + 2 * ff * d, base),  # q, o, k, gate, up
              (kv * d + ff * d, up if up and more(i) else base)]  # v, down
    return sum(n for n, _ in t), sum(n // B[y][0] * B[y][1] for n, y in t)

for name, args, ref in [("Q8_0", ("Q8_0", "Q8_0"), 7.96),
                        ("Q4_K_M", ("Q4_K", "Q6_K", "Q6_K"), 4.58),
                        ("Q4_0", ("Q4_0",), 4.34)]:
    n, by = size(*args)
    print(f"{name:6s} {by / 2**30:.2f}GiB ({by / 1e9:.2f}GB),"
          f" 값당 {8 * by / n:.3f}비트, 도움말 {ref}G")
```
```text
Q8_0   7.95GiB (8.53GB), 값당 8.501비트, 도움말 7.96G
Q4_K_M 4.58GiB (4.91GB), 값당 4.894비트, 도움말 4.58G
Q4_0   4.33GiB (4.65GB), 값당 4.636비트, 도움말 4.34G
```

계산이 0.01 안에서 맞으니 도움말의 G는 GiB다(남는 차이는 메타데이터로 보인다). Q4_K_M은 이름과 달리 값당 4.89비트다. 도움말의 라마 3 8B 퍼플렉서티 증가는 Q4_0 +0.4685, Q4_K_S(4.37G) +0.2689, Q4_K_M +0.1754, Q8_0 +0.0026이다. 크기가 거의 같은 Q4_0과 Q4_K_S 사이에서 절반 남짓으로 준다.

## imatrix와 i-quant
**중요도 행렬**(imatrix)은 `llama-imatrix`가 보정 텍스트를 흘려 행렬 곱마다 입력 채널 j의 x_j²을 평균한 값으로, 11편 H = 2XXᵀ의 대각에 비례하고 AWQ가 본 활성값 크기다. 양자화할 때 가중치 w_j의 제곱 오차에 이 값을 곱해(Q4_K는 `imatrix_j·√(σ² + w_j²)`, σ²는 슈퍼블록 w² 평균의 2배) 많이 쓰이는 채널을 정확히 맞춘다. IQ1_S·IQ1_M·IQ2_XXS·IQ2_XS·IQ2_S·IQ3_XXS 텐서는 imatrix가 없으면 `llama-quantize`가 오류로 멈춘다(임베딩·출력 층 제외).

**i-quant**는 9편의 벡터 양자화다. IQ2_XXS는 값 8개를, E8 격자 점 중 여러 모델에서 자주 쓰인 256개로 만든 코드북의 인덱스 8비트와 부호 7비트(여덟째는 짝수 규칙)로 적고, 32값마다 4비트 스케일, 256값마다 FP16 d를 둔다. 위 계산의 2.0625비트다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 매직 바이트가 uint32 0x46554747로 읽히는 것이 그 글의 리틀 엔디언이다.
- 오픈 웨이트 모델 5편 「config.json으로 모델 구조 읽기」: config.json 필드가 GGUF의 `llama.embedding_length` 같은 키가 되고, 8B 크기 계산도 그 설정을 쓴다.

## 정리
- GGUF는 헤더, 타입 붙은 키-값, 텐서 정보, 정렬된 데이터 순이고, 토크나이저까지 담아 mmap으로 바로 쓴다.
- Q8_0·Q4_0은 32값 + FP16 스케일, k-quant는 슈퍼블록 안의 하위 블록 스케일을 다시 양자화한다(Q2_K~Q6_K: 2.625~6.5625비트).
- 같은 4.5비트에서 Q4_K식은 영점까지 저장해 Q4_0보다 오차가 작았다.
- Q4_K_M은 출력 층과 attn_v·ffn_down 절반을 Q6_K로 올린 조합(8B에서 4.89비트)이다.

## 더 알아보기
- 이전 글: 13편 「양자화 인식 학습과 극단적 저비트: QAT, QLoRA, BitNet」
- 다음 글: 15편 「CPU 오프로드: GPU 메모리보다 큰 모델 돌리기」
- GGUF 명세: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
