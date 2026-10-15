# [트랜지스터에서 자연어까지 3/13] 조합 회로: 덧셈기에서 ALU까지

> **한 줄 요약** — 조합 회로는 지금의 입력만으로 출력이 정해지는 게이트 묶음이고, NAND 9개짜리 전가산기를 이어 붙이면 덧셈기가, 2의 보수와 멀티플렉서를 더하면 연산 코드로 ADD·SUB·AND·OR을 고르는 ALU가 되며, 그 속도는 게이트 깊이가 정한다.

## 이 글에서 다루는 것
- 반가산기와 전가산기, 리플 캐리 덧셈기
- 게이트 깊이로 보는 덧셈기의 속도와 캐리 룩어헤드
- 2의 보수로 뺄셈을 덧셈기로 하기
- 멀티플렉서와 연산 코드로 고르는 8비트 ALU, Z 플래그
- 전부 NAND 수준에서 조립해 전수·무작위 검사하기

## 조합 회로: 입력이 출력을 정한다
**조합 회로**(combinational circuit)는 출력이 지금 들어온 입력만으로 정해지는 회로다. 이전 값을 기억하지 않으므로, 입력이 같으면 언제나 출력이 같다. 수학의 함수와 같다. 2편에서 본 대로 어떤 진리표든 NAND로 만들 수 있지만, 8비트 두 수를 더하는 회로의 진리표는 입력이 16비트라 2¹⁶ = 65,536행이다. 그래서 진리표를 통째로 만들지 않고 작은 회로를 반복해 이어 붙인다. 기억하는 회로는 4편의 순차 회로에서 다룬다.

## 반가산기와 전가산기
한 자리 2진수 둘을 더하는 **반가산기**(half adder)는 합 `a ⊕ b`와 올림 `a ∧ b`를 낸다(이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」에서 본 그 회로). 여러 자리를 더하려면 아랫자리의 올림까지 세 입력을 더해야 한다. 이것이 **전가산기**(full adder)다.
```text
s    = a ⊕ b ⊕ c
cout = a·b + (a ⊕ b)·c
```

`cout`은 "a와 b가 둘 다 1이면 올림이 생기고(generate), 둘 중 하나만 1이면 아래에서 온 올림을 그대로 넘긴다(propagate)"로 읽는다. 이 두 말이 아래 캐리 룩어헤드의 g와 p다. 전가산기를 n개 이어 각 자리의 `cout`을 윗자리의 `c`로 넘기면 n비트 **리플 캐리 덧셈기**(ripple-carry adder)가 된다.

## 덧셈기의 속도: 게이트 깊이
리플 캐리 덧셈기는 맨 윗자리가 아래 모든 자리의 올림을 기다려야 한다. **캐리 룩어헤드**(carry lookahead)는 올림 식을 펼쳐서 기다리지 않는다.
```text
c₁ = g₀ + p₀·c₀
c₂ = g₁ + p₁·g₀ + p₁·p₀·c₀
cᵢ₊₁ = gᵢ + pᵢ·gᵢ₋₁ + … + pᵢ…p₀·c₀
```

모든 올림이 g와 p만으로 두 단(곱의 합)에 계산된다. 두 방식을 NAND만으로 조립해 8비트를 전수 검사하고, 폭을 늘리며 NAND 수, 트랜지스터 수, 깊이를 비교하자. 신호는 2편처럼 (값, 깊이) 쌍이다. 전수 검사 때문에 실행에 20초쯤 걸린다.
```python
import random

def nand(*xs):          # 신호 = (값, 깊이). 입력 k개 NAND = 트랜지스터 2k개
    st["nand"] += 1
    st["tr"] += 2 * len(xs)
    st["fanin"] = max(st["fanin"], len(xs))
    vs, ds = zip(*xs)
    return (0 if all(vs) else 1, 1 + max(ds))

NOT = lambda a: nand(a)
AND = lambda a, b: nand(nand(a, b))
def XOR(a, b):
    m = nand(a, b)
    return nand(nand(a, m), nand(b, m))

def full_adder(a, b, c):            # NAND 9개
    m1 = nand(a, b)
    p = nand(nand(a, m1), nand(b, m1))          # a ⊕ b
    m4 = nand(p, c)
    s = nand(nand(p, m4), nand(c, m4))          # a ⊕ b ⊕ c
    return s, nand(m1, m4)                      # 올림 = ab + (a⊕b)c

def ripple(A, B, c):                # 리플 캐리: 올림이 한 자리씩 전달된다
    S = []
    for a, b in zip(A, B):          # 가장 낮은 자리부터
        s, c = full_adder(a, b, c)
        S.append(s)
    return S, c

def lookahead(A, B, c0):    # cᵢ₊₁ = gᵢ + pᵢ·gᵢ₋₁ + … + pᵢ…p₀·c₀
    P = [XOR(a, b) for a, b in zip(A, B)]
    G = [AND(a, b) for a, b in zip(A, B)]
    C = [c0]
    for i in range(len(A)):
        terms = [nand(*P[j + 1:i + 1], G[j]) for j in range(i + 1)]
        C.append(nand(*terms, nand(*P[:i + 1], c0)))
    return [XOR(p, c) for p, c in zip(P, C)], C[-1]

bits = lambda x, n: [((x >> i) & 1, 0) for i in range(n)]
num = lambda S: sum(v << i for i, (v, _) in enumerate(S))
st = {"nand": 0, "tr": 0, "fanin": 0}

for f in (ripple, lookahead):       # 8비트 전수 검사: 256 × 256 × 올림 2
    bad = sum(num(S) + (c[0] << 8) != x + y + ci
              for x in range(256) for y in range(256) for ci in (0, 1)
              for S, c in [f(bits(x, 8), bits(y, 8), (ci, 0))])
    print(f"{f.__name__}: 8비트 131,072가지 중 오답 {bad}")

rng = random.Random(0)
print(" n  방식        NAND  트랜지스터  깊이  최대 입력 수")
for n in (4, 8, 16, 32):
    for f in (ripple, lookahead):
        st = {"nand": 0, "tr": 0, "fanin": 0}
        x, y = rng.getrandbits(n), rng.getrandbits(n)
        S, c = f(bits(x, n), bits(y, n), (0, 0))
        assert num(S) + (c[0] << n) == x + y
        depth = max(d for _, d in S + [c])
        print(f"{n:2d}  {f.__name__:10} {st['nand']:5d}  {st['tr']:9d}"
              f"  {depth:4d}  {st['fanin']:4d}")
```
```text
ripple: 8비트 131,072가지 중 오답 0
lookahead: 8비트 131,072가지 중 오답 0
 n  방식        NAND  트랜지스터  깊이  최대 입력 수
 4  ripple        36        144    12     2
 4  lookahead     58        248     8     5
 8  ripple        72        288    20     2
 8  lookahead    132        720     8     9
16  ripple       144        576    36     2
16  lookahead    328       2848     8    17
32  ripple       288       1152    68     2
32  lookahead    912      15424     8    33
```

두 덧셈기 모두 13만 가지 입력에서 오답이 없다. 리플 캐리의 깊이는 `2n + 4`로 비트 수에 비례해 늘어 32비트에서 68이다. 캐리 룩어헤드는 폭과 무관하게 깊이 8이지만, 올림 하나를 만드는 NAND의 입력 수가 n + 1로 늘고 트랜지스터는 32비트에서 13배가 된다. 2편에서 본 대로 입력이 많은 게이트는 그 자체로 느려서, 입력 33개짜리 NAND는 현실적이지 않다. 그래서 실제 덧셈기는 4비트쯤의 묶음마다 룩어헤드를 하고 묶음끼리 다시 같은 방법을 적용해, 깊이를 log n에 비례하게 줄인다. 면적(트랜지스터 수)과 속도(깊이)를 맞바꾸는 이 선택이 하드웨어 설계의 기본 거래다.

## 뺄셈은 덧셈기로
2의 보수(이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」)에서 `−b`는 `¬b + 1`이다. 그러므로 `a − b = a + ¬b + 1`이고, 덧셈기에 b를 뒤집어 넣고 첫 올림 c₀을 1로 주면 뺄셈기가 된다. b를 뒤집는 일은 XOR가 맡는다. `b ⊕ 0 = b`, `b ⊕ 1 = ¬b`이므로 제어 신호 하나로 "그대로/뒤집기"를 고를 수 있다. 같은 신호를 c₀에도 넣으면 덧셈기 하나가 덧셈과 뺄셈을 모두 한다.

## 멀티플렉서와 ALU
**멀티플렉서**(multiplexer, MUX)는 선택 신호로 입력 중 하나를 고르는 조합 회로다. 2:1 MUX는 `s = 0`이면 x₀, `s = 1`이면 x₁을 낸다. 식으로는 `x₀·¬s + x₁·s`이고 NAND 4개(NOT 포함)다.

이제 부품이 다 모였다. 2비트 연산 코드 op로 네 연산을 고르는 8비트 **ALU**(arithmetic logic unit)를 만든다. 결과가 0이면 1이 되는 **Z 플래그**(zero flag)도 단다.
```text
op = 0 ADD, 1 SUB, 2 AND, 3 OR

       A, B
  ┌──────┴───────┐
  │ B ⊕ op0      │
  │ cin = op0    │
  ↓              ↓
[ADDER]      [AND/OR] ← op0
  │              │
  └──[MUX op1]───┘
         ↓
      result → Z = NOR(bits)
```

op의 아랫비트 op0은 덧셈기 쪽에서는 "뺄셈인가", 논리 쪽에서는 "OR인가"를 정하고, 윗비트 op1은 산술과 논리 중 어느 결과를 내보낼지 정한다. 앞 코드에 이어서 실행한다. 8비트 두 수의 조합은 65,536가지라 이번에는 경계값 25쌍과 무작위 5,000쌍으로 검사한다.
```python
OR = lambda a, b: nand(NOT(a), NOT(b))
def mux(s, x0, x1):                 # s가 0이면 x0, 1이면 x1
    return nand(nand(x0, NOT(s)), nand(x1, s))

def alu(op, A, B):                  # op: 0 ADD, 1 SUB, 2 AND, 3 OR
    op1, op0 = (op >> 1, 0), (op & 1, 0)
    S, _ = ripple(A, [XOR(b, op0) for b in B], op0)   # SUB: a + ~b + 1
    out = [mux(op1, s, mux(op0, AND(a, b), OR(a, b)))
           for s, a, b in zip(S, A, B)]
    z = NOT(nand(*[NOT(r) for r in out]))             # 모든 비트가 0이면 1
    return out, z

ref = [lambda x, y: (x + y) % 256, lambda x, y: (x - y) % 256,
       lambda x, y: x & y, lambda x, y: x | y]
rng = random.Random(1)
edge = (0, 1, 127, 128, 255)
pairs = [(x, y) for x in edge for y in edge]
pairs += [(rng.randrange(256), rng.randrange(256)) for _ in range(5000)]
bad = 0
for op in range(4):
    for x, y in pairs:
        out, z = alu(op, bits(x, 8), bits(y, 8))
        r = ref[op](x, y)
        bad += num(out) != r or z[0] != (r == 0)
print(f"연산 4개 × {len(pairs)}쌍: 오답 {bad}")

for op, x, y, sym in ((0, 1, 255, "+"), (1, 5, 7, "−"), (2, 12, 10, "AND")):
    st = {"nand": 0, "tr": 0, "fanin": 0}
    out, z = alu(op, bits(x, 8), bits(y, 8))
    print(f"{x} {sym} {y} = {num(out)} (Z={z[0]})")
depth = max(d for _, d in out + [z])
print(f"ALU 전체: NAND {st['nand']}개, 트랜지스터 {st['tr']}개, 깊이 {depth}")
```
```text
연산 4개 × 5025쌍: 오답 0
1 + 255 = 0 (Z=1)
5 − 7 = 254 (Z=0)
12 AND 10 = 8 (Z=0)
ALU 전체: NAND 218개, 트랜지스터 786개, 깊이 28
```

네 연산 모두 2만 건 넘는 검사에서 오답이 없다. `1 + 255 = 0`은 8비트에서 255가 −1이라 1 − 1 = 0이 된 것이고, 결과가 0이니 Z = 1이다. 5편부터 쓰는 토이 CPU의 반복문이 바로 이 동작으로 끝난다. 카운터에 255를 더해(1을 빼서) 0이 되면 Z가 1이 되고, "Z가 0이면 뛰어라"(JNZ)가 더는 뛰지 않는다. `5 − 7 = 254`는 −2의 2의 보수다. ALU 전체는 NAND 218개, 트랜지스터 786개, 깊이 28이고, 깊이의 대부분은 리플 캐리의 올림 전달이다.

실제 역사에서도 이런 ALU가 부품이 됐다. 텍사스 인스트루먼트가 1970년에 내놓은 74181은 4비트 ALU를 칩 하나에 담았고, 여러 미니컴퓨터의 연산부로 쓰였다.

## 이 층의 변환
```text
입력: NAND 게이트와 배선
출력: n비트 연산 장치(덧셈기, ALU)
보존: 2ⁿ을 법으로 한 정수 덧셈·뺄셈
숨김: 개별 게이트, 올림 전달, 비트 조작
```
비트마다의 진리표를 이어 붙인 결과가 정수 덧셈과 같다는 것은 자리올림이 있는 2진 덧셈의 정의 그 자체이고, 이 글에서는 8비트 전수 검사로 확인했다. 그래서 위 층은 "ADD 연산 코드를 주면 a + b mod 256이 나온다"만 알면 된다. 리플 캐리인지 룩어헤드인지는 결과를 바꾸지 않고, 결과가 나오기까지의 시간(깊이)만 바꾼다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 그 글의 2의 보수와 mod 2ⁿ 산술이 이 글에서 XOR 한 줄과 c₀ = 1로 하드웨어가 됐다.
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: `add eax, ebx` 한 줄은 CPU 안에서 이런 덧셈기를 한 번 지나는 일이고, 조건 분기는 ALU가 남긴 Z 같은 플래그를 본다.
- 5편 「CPU의 구조: 명령어를 실행하는 기계」: 제어 장치가 명령어의 opcode를 이 글의 ALU 연산 코드로 바꿔 준다.

## 정리
- 조합 회로는 기억 없이 지금 입력만으로 출력이 정해지는 회로이고, 전가산기(NAND 9개)를 이어 n비트 덧셈기를 만든다.
- 리플 캐리는 깊이가 `2n + 4`로 늘고, 캐리 룩어헤드는 깊이를 상수로 줄이는 대신 게이트 입력 수와 트랜지스터 수가 크게 는다. 실제로는 묶음 단위로 섞는다.
- 뺄셈은 `a + ¬b + 1`이라 XOR와 첫 올림만 추가하면 덧셈기가 그대로 쓰인다.
- 멀티플렉서로 결과를 고르면 연산 코드로 ADD·SUB·AND·OR을 하는 ALU가 되고, 모든 비트의 NOR가 Z 플래그다.

## 더 알아보기
- 이전 글: 2편 「논리 게이트: 스위치로 불 대수를 만들기」
- 다음 글: 4편 「순차 회로: 클록, 플립플롭, 메모리」
- Nand2Tetris 2장(불 산술과 ALU): https://www.nand2tetris.org/
