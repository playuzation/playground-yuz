# [오픈 웨이트 모델 5/5] config.json으로 모델 구조 읽기

> **한 줄 요약** — Hugging Face 모델 저장소의 config.json에는 층 수, 헤드 수, FFN 크기, 전문가 수 같은 구조 설정이 모두 들어 있어서, 필드 몇 개를 읽는 파이썬 함수 하나로 어떤 모델이든 파라미터 수와 KV 캐시 크기를 계산하고 비교할 수 있다.

## 이 글에서 다루는 것
- config.json의 주요 필드와 그 뜻
- 모델마다 다른 필드 이름 다루기
- 설정에서 파라미터 수와 KV 캐시를 계산하는 함수 하나
- 여섯 모델 비교와 세 시리즈 정리

## config.json 한 장
Hugging Face 허브의 모델 저장소에는 가중치 파일과 함께 config.json이 있다. transformers는 `model_type`으로, vLLM 같은 추론 엔진은 `architectures`로 어떤 모델 코드를 쓸지 고르고, 나머지 값으로 행렬 크기를 정한 뒤 가중치를 채운다. 1편 라마 3 8B의 설정에서 구조와 관련된 필드만 추리면 다음과 같다.
```json
{
  "architectures": ["LlamaForCausalLM"],
  "hidden_act": "silu",
  "hidden_size": 4096,
  "intermediate_size": 14336,
  "max_position_embeddings": 8192,
  "model_type": "llama",
  "num_attention_heads": 32,
  "num_hidden_layers": 32,
  "num_key_value_heads": 8,
  "rms_norm_eps": 1e-05,
  "rope_theta": 500000.0,
  "tie_word_embeddings": false,
  "vocab_size": 128256
}
```

## 필드 해설
- `hidden_size`: 잔차 스트림 폭 d (신경망 레이어 1편)
- `num_hidden_layers`: 블록 수 (이 시리즈 1편)
- `num_attention_heads`: 쿼리 헤드 수 (어텐션 2편)
- `num_key_value_heads`: GQA의 KV 헤드 수 (어텐션 4편)
- `head_dim`: 헤드 차원 (어텐션 2편)
- `intermediate_size`: FFN 은닉 크기 (신경망 레이어 8편)
- `rope_theta`: RoPE 기저 θ (어텐션 3편)
- `sliding_window`: 윈도 크기 (이 시리즈 2편)
- `layer_types`: 층별 어텐션 종류 (이 시리즈 2편)
- `num_experts` 등: 전문가 수 (신경망 레이어 9편)
- `num_experts_per_tok`: 토큰당 선택 수 k (이 시리즈 3편)
- `moe_intermediate_size`: 전문가 은닉 크기 (이 시리즈 3편)
- `kv_lora_rank`: MLA 잠재 차원 (어텐션 4편)
- `tie_word_embeddings`: 출력 헤드 공유 여부 (이 시리즈 1편)

읽을 때 주의할 점이 몇 가지 있다.
- `head_dim`이 없으면 `hidden_size ÷ num_attention_heads`다. 따로 적은 모델은 이 관계가 깨질 수 있다. Qwen3-235B는 64 × 128 = 8,192로 d = 4,096보다 크고, gpt-oss-120b는 64 × 64 = 4,096으로 d = 2,880보다 크다.
- 같은 뜻의 필드 이름이 모델마다 다르다. 전문가 수는 Qwen3의 `num_experts`, 믹스트랄·gpt-oss의 `num_local_experts`, 딥시크의 `n_routed_experts`다. 전문가 하나의 은닉 크기도 믹스트랄·gpt-oss는 `intermediate_size`, Qwen3·딥시크는 `moe_intermediate_size`에 적는다.
- `rope_scaling`이 있으면 문맥 확장 방식(어텐션 3편의 위치 보간, YaRN 등)을 함께 봐야 한다.

## 함수 하나로 계산하기
아래 함수는 1~4편에서 손으로 했던 계산을 모은 것이다. 어텐션(GQA 또는 MLA), FFN(밀집 SwiGLU 또는 MoE), 임베딩을 더해 전체·활성 파라미터를 세고, 층 종류에 따라 저장할 토큰 수를 달리해 KV 캐시를 계산한다. 정규화 게인, 편향, QK-Norm 같은 작은 항은 뺐다. 모델 설정은 실제 config.json의 필드 이름 그대로, 이 시리즈에서 확인한 값만 넣었다.
```python
def analyze(c, ctx=32768, nbytes=2):
    """config 딕셔너리 → (전체 B, 활성 B, KV 캐시 GiB)"""
    d, L, V = c["hidden_size"], c["num_hidden_layers"], c["vocab_size"]
    h = c["num_attention_heads"]
    kv = c.get("num_key_value_heads", h)
    hd = c.get("head_dim") or d // h
    if "kv_lora_rank" in c:                          # MLA (딥시크)
        rq, rk = c["q_lora_rank"], c["kv_lora_rank"]
        dn, dr = c["qk_nope_head_dim"], c["qk_rope_head_dim"]
        dv = c["v_head_dim"]
        attn = (d * rq + rq * h * (dn + dr) + d * (rk + dr)
                + rk * h * (dn + dv) + h * dv * d)
        kv_tok = rk + dr                             # 잠재 벡터만 캐시
    else:                                            # MHA·GQA
        attn = 2 * d * h * hd + 2 * d * kv * hd      # Wq·Wo + Wk·Wv
        kv_tok = 2 * kv * hd                         # K와 V
    f = c.get("intermediate_size", 0)
    E = (c.get("num_experts") or c.get("num_local_experts")
         or c.get("n_routed_experts") or 0)
    if E:
        k, S = c["num_experts_per_tok"], c.get("n_shared_experts", 0)
        e = 3 * d * c.get("moe_intermediate_size", f)    # 전문가 하나
        nd = c.get("first_k_dense_replace", 0)           # 앞쪽 밀집 층
        ffn_all = nd * 3 * d * f + (L - nd) * ((E + S) * e + d * E)
        ffn_act = nd * 3 * d * f + (L - nd) * ((k + S) * e + d * E)
    else:
        ffn_all = ffn_act = L * 3 * d * f                # SwiGLU
    emb = V * d * (1 if c.get("tie_word_embeddings") else 2)
    total, active = L * attn + ffn_all + emb, L * attn + ffn_act + emb
    w = c.get("sliding_window")
    use_w = w and c.get("use_sliding_window", True)
    types = c.get("layer_types") or (
        ["sliding_attention" if use_w else "full_attention"] * L)
    toks = sum(min(ctx, w) if t == "sliding_attention" else ctx
               for t in types)
    return total / 1e9, active / 1e9, kv_tok * toks * nbytes / 2**30

llama3_8b = dict(hidden_size=4096, num_hidden_layers=32,
    num_attention_heads=32, num_key_value_heads=8,
    intermediate_size=14336, vocab_size=128256)
mistral_7b = {**llama3_8b, "vocab_size": 32000, "sliding_window": 4096}
mixtral = {**mistral_7b, "sliding_window": None,
    "num_local_experts": 8, "num_experts_per_tok": 2}
qwen3_235b = dict(hidden_size=4096, num_hidden_layers=94,
    num_attention_heads=64, num_key_value_heads=4, head_dim=128,
    vocab_size=151936, num_experts=128, num_experts_per_tok=8,
    moe_intermediate_size=1536)
deepseek_v3 = dict(hidden_size=7168, num_hidden_layers=61,
    num_attention_heads=128, vocab_size=129280, q_lora_rank=1536,
    kv_lora_rank=512, qk_nope_head_dim=128, qk_rope_head_dim=64,
    v_head_dim=128, intermediate_size=18432, n_routed_experts=256,
    n_shared_experts=1, num_experts_per_tok=8,
    moe_intermediate_size=2048, first_k_dense_replace=3)
gpt_oss_120b = dict(hidden_size=2880, num_hidden_layers=36,
    num_attention_heads=64, num_key_value_heads=8, head_dim=64,
    vocab_size=201088, intermediate_size=2880, num_local_experts=128,
    num_experts_per_tok=4, sliding_window=128,
    layer_types=["sliding_attention", "full_attention"] * 18)

print(f"{'모델':<14}{'전체B':>8}{'활성B':>8}{'KV@32K GiB':>12}")
for name, c in [("Llama-3-8B", llama3_8b), ("Mistral-7B", mistral_7b),
                ("Mixtral-8x7B", mixtral), ("Qwen3-235B", qwen3_235b),
                ("DeepSeek-V3", deepseek_v3), ("gpt-oss-120b", gpt_oss_120b)]:
    t, a, g = analyze(c)
    print(f"{name:<14}{t:>8.2f}{a:>8.2f}{g:>12.2f}")
```
```text
모델                 전체B     활성B  KV@32K GiB
Llama-3-8B        8.03    8.03        4.00
Mistral-7B        7.24    7.24        0.50
Mixtral-8x7B     46.70   12.88        4.00
Qwen3-235B      235.09   22.19        5.88
DeepSeek-V3     671.03   37.55        2.14
gpt-oss-120b    116.79    5.71        1.13
```

## 결과 읽기
- 라마 3 8B는 1편의 8.03B와 같다. 믹스트랄은 46.7B·12.9B, Qwen3-235B-A22B는 235B·22B, 딥시크-V3는 671B·37B라는 발표값과 맞는다. 설정 몇 줄로 수천억 개의 파라미터를 거의 정확히 셀 수 있다.
- gpt-oss-120b는 전체 116.8B로 발표값(약 117B)과 맞지만, 활성은 5.71B로 발표된 5.1B보다 크다. 입력 임베딩(201,088 × 2,880 ≈ 0.58B)은 행렬 곱이 아니라 표에서 한 행을 꺼내는 조회이므로, 이를 활성에서 빼면 5.13B가 된다. 활성 파라미터에 임베딩을 넣는지는 발표마다 다르니 기준을 확인해야 한다.
- KV 캐시(32K 토큰, BF16)는 전체 크기와 따로 논다. 같은 GQA 8 × 128인 라마 3 8B와 믹스트랄은 4GiB로 같고, 윈도를 쓰는 미스트랄은 0.5GiB, MLA를 쓰는 딥시크-V3는 671B 모델인데도 2.14GiB(토큰당 576 × 61층)다. gpt-oss-120b는 절반의 층이 128토큰 윈도라 1.13GiB다.

## 세 시리즈 정리
| 구성 요소 | 배운 글 | 실제 모델 |
|---|---|---|
| 어텐션·멀티헤드 | 어텐션 1·2편 | 모든 모델 |
| 위치 정보 | 어텐션 3편 | RoPE, 라마 4의 NoPE |
| KV 캐시 절감 | 어텐션 4편 | GQA, MLA(딥시크·키미) |
| 윈도·싱크 | 어텐션 5편 | 미스트랄, 젬마, gpt-oss |
| 리니어·델타 규칙 | 어텐션 6편, 신경망 레이어 11편 | Qwen3-Next, 키미 리니어 |
| 상태 공간 모델 | 신경망 레이어 10편 | 잼바 |
| 정규화·FFN | 신경망 레이어 7·8편 | RMSNorm, SwiGLU |
| MoE | 신경망 레이어 9편 | 믹스트랄, 딥시크-V3, Qwen3 |
| 커널·서빙 | 어텐션 7~9편 | 추론 엔진 내부 |

결국 오픈 웨이트 모델은 1편의 라마형 블록을 기준으로, 어떤 어텐션을 어느 층에 둘지, FFN을 MoE로 바꿀지, 일부 층을 순환형으로 바꿀지를 고른 조합이다. config.json은 그 선택을 숫자로 적어 둔 설계도다.

## 어디에 쓰이나
- AI 기초 4편 「컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리」: 그 글의 메모리·연산 어림식에 넣을 파라미터 수와 KV 캐시 크기를 이 함수가 설정 파일에서 바로 만든다.
- 선형대수 3편 「행렬과 행렬 곱」: 파라미터 수는 각 가중치 행렬의 (입력 × 출력) 크기를 모두 더한 것이고, 설정 필드는 그 행과 열의 길이다.
- 어텐션 4편 「KV 캐시와 MQA·GQA·MLA」: `num_key_value_heads`, `head_dim`, `kv_lora_rank`가 그 글의 KV 캐시 공식에 들어가는 값이다.

## 정리
- config.json에는 은닉 크기, 층·헤드 수, FFN·전문가 크기, 윈도와 층 종류가 들어 있어 코드 없이도 구조를 읽을 수 있다.
- 필드 이름은 모델마다 달라서(전문가 수만 세 가지) 읽는 쪽에서 맞춰 줘야 한다.
- 함수 하나로 계산한 파라미터 수는 발표값과 맞고, 활성 파라미터는 임베딩을 넣는지에 따라 달라진다.
- KV 캐시는 전체 크기가 아니라 KV 헤드 수, 헤드 차원, 층 종류, MLA 여부가 정한다.

## 더 알아보기
- 이전 글: 4편 「하이브리드 모델: 리니어 어텐션과 어텐션 섞기」
- 처음 글: 1편 「오픈 웨이트 모델의 표준 블록: 라마 3 해부」
- Qwen3 기술 보고서: https://arxiv.org/abs/2505.09388
