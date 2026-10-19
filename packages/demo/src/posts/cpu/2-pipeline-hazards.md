# [CPU 마이크로아키텍처 2/12] 파이프라인 해저드: 포워딩과 스톨을 사이클 단위로

> **한 줄 요약** — 5단 파이프라인은 명령어 다섯 개를 겹쳐 실행하지만, 앞 명령어의 결과를 뒤 명령어가 너무 일찍 읽으려 하거나(데이터 해저드) 분기 결과를 늦게 알거나(제어 해저드) 자원을 함께 쓰려 하면(구조 해저드) 멈춰야 하며, 포워딩 경로가 그 멈춤 대부분을 없애고 로드-사용 1사이클과 분기 2사이클만 남긴다.

## 이 글에서 다루는 것
- 5단 파이프라인(IF·ID·EX·MEM·WB)과 세 가지 해저드
- 포워딩 경로 두 개와 남는 로드-사용 스톨, 분기 지연
- 파이썬 파이프라인 시뮬레이터로 사이클 표를 그리고 스톨 세기(포워딩 있음/없음)
- 손으로 센 표, 닫힌 식, 무작위 300개 프로그램과 대조
- 컴파일러의 명령어 스케줄링이 스톨을 없애는 방식

## 겹쳐 실행하면 생기는 문제
트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」에서 본 **파이프라인**(pipeline)은 명령어 처리를 인출(IF)·해독과 레지스터 읽기(ID)·실행(EX)·메모리 접근(MEM)·레지스터 쓰기(WB)로 나누고, 단계 사이에 파이프라인 레지스터를 둬 매 사이클 명령어 하나씩 들인다. 이상적이면 명령어 n개가 n + 4사이클에 끝나 CPI가 1에 가까워진다. 이 글은 RISC-V 비슷한 명령어로 그 "이상적"이 깨지는 순간을 사이클 단위로 센다.

해저드(hazard)는 세 가지다.
- **데이터 해저드**: `add x3,x1,x4`가 바로 앞 `lw x1,0(x2)`의 결과를 읽어야 한다. 순서대로 실행할 때의 의미를 지키려면 값이 준비될 때까지 기다려야 한다.
- **제어 해저드**: 분기가 뛸지는 EX에서야 안다. 그동안 다음 주소의 명령어 두 개를 이미 인출했다.
- **구조 해저드**: 두 명령어가 같은 사이클에 같은 하드웨어를 쓰려 한다. 명령어와 데이터가 메모리 포트 하나를 나눠 쓰면 `lw`의 MEM과 뒤 명령어의 IF가 부딪친다. 그래서 L1 캐시를 명령어용(L1i)과 데이터용(L1d)으로 나눈다. 파이프라인화하지 않은 나눗셈기를 두 명령어가 연달아 쓰려 할 때도 생긴다.

## 포워딩 경로
결과는 EX 끝에서 이미 나오는데, 레지스터 파일에는 WB에서야 쓰인다. **포워딩**(forwarding, 바이패스라고도 한다. 트랜지스터에서 자연어까지 7편의 '전달')은 파이프라인 레지스터에 있는 결과를 레지스터 파일을 거치지 않고 다음 명령어의 ALU 입력으로 바로 넘긴다.
```text
┌──┐  ┌──┐  ┌──┐  ┌───┐  ┌──┐
│IF├─→│ID├─→│EX├─→│MEM├─→│WB│
└──┘  └──┘  └┬─┘  └─┬─┘  └┬─┘
             ↑ A    │     │
             ├──────┘     │
             ↑ B          │
             └────────────┘
```
- 경로 A(EX/MEM → EX): 바로 앞 명령어의 ALU 결과를 넘긴다.
- 경로 B(MEM/WB → EX): 두 칸 앞 명령어의 결과나, 적재가 메모리에서 읽어 온 값을 넘긴다.

ALU 결과는 경로 A로 다음 사이클에 바로 쓸 수 있지만, `lw`의 값은 MEM 끝에서야 나온다. 바로 뒤 명령어가 그 값을 EX에서 쓰려면 한 사이클 늦어야 하므로, 해저드 검출 장치가 뒤 명령어를 ID에 한 사이클 붙잡고 EX에 거품(bubble)을 넣는다. 이것이 **로드-사용 스톨**(load-use stall)이다. 포워딩이 없으면 값이 WB에서 레지스터 파일에 쓰일 때까지 기다려야 하므로, WB가 사이클 앞 절반에 쓰고 ID가 뒤 절반에 읽는다고 해도 바로 뒤 의존마다 2사이클을 잃는다.

분기는 EX에서 판명되므로, "안 뜀"으로 예측하고 다음 주소를 계속 인출하다가 뜀이 판명되면 IF·ID의 두 명령어를 버린다. 뜀마다 2사이클이다.

## 사이클 표를 그리는 시뮬레이터
아래 시뮬레이터는 다섯 단계의 파이프라인 레지스터를 사이클마다 한 칸씩 민다. 매 사이클 해저드 검출 장치처럼 판단한다. EX에 있는 분기가 뜀이면 IF·ID를 버리고, ID 명령어가 아직 준비되지 않은 값을 읽으면 ID에 붙잡는다. 명령어 열은 실제로 실행되는 순서(트레이스)이고, 끝의 `T`는 뜀으로 판명되는 분기다.
```python
import random, re

def parse(line):           # "add x3,x1,x4" → (연산, 쓰는 reg, 읽는 reg들)
    op, *a = re.split(r"[,\s()]+", line.strip())
    regs = [x for x in a if re.fullmatch(r"x\d+", x)]
    if op in ("sw", "beq"):            # 저장·분기는 읽기만 한다
        return op, None, [r for r in regs if r != "x0"]
    return op, regs[0], [r for r in regs[1:] if r != "x0"]

def simulate(prog, fwd):   # 5단 파이프라인을 사이클마다 한 칸씩 민다
    ins = [parse(l) for l in prog]
    taken = [l.endswith("T") for l in prog]
    F = D = X = M = W = None           # 단계별 명령어 번호, -1은 틀린 경로
    nxt, wrong, cyc, data, ctrl, table = 0, False, 0, 0, 0, {}
    def fetch():
        nonlocal nxt, wrong
        if wrong: return -1            # 안 뜀으로 예측하고 다음 주소 인출
        if nxt == len(ins): return None
        nxt += 1
        wrong = taken[nxt - 1]
        return nxt - 1
    def real(i): return i is not None and i >= 0
    while cyc == 0 or any(real(s) for s in (F, D, X, M)):
        need = ins[D][2] if real(D) else []
        busy = [X] if fwd else [X, M]  # 포워딩 없으면 WB까지 기다림
        hazard = any(real(s) and ins[s][1] in need and
                     (ins[s][0] == "lw" or not fwd) for s in busy)
        if real(X) and taken[X]:       # EX에서 뜀 판명 → IF·ID 버림
            wrong, ctrl = False, ctrl + 2
            W, M, X, D, F = M, X, None, None, fetch()
        elif hazard:                   # ID에 붙잡고 EX에 거품
            W, M, X, data = M, X, None, data + 1
        else:
            W, M, X, D, F = M, X, D, F, fetch()
        cyc += 1
        for s, i in zip("FDXMW", (F, D, X, M, W)):
            if real(i): table.setdefault(i, {})[cyc] = s
    return cyc, data, ctrl, table

prog = ["lw x1,0(x2)", "add x3,x1,x4", "lw x6,4(x2)", "sub x5,x3,x6",
        "sw x5,8(x2)", "beq x5,x0,L T", "addi x7,x7,1"]
cyc, data, ctrl, table = simulate(prog, fwd=True)
print(" " * 14 + " ".join(str(c % 10) for c in range(1, cyc + 1)))
for i, line in enumerate(prog):
    print((f"{line:14}" + " ".join(table[i].get(c, " ")
        for c in range(1, cyc + 1))).rstrip())
for fwd in (True, False):
    cyc, data, ctrl, _ = simulate(prog, fwd)
    print(f"포워딩 {'있음' if fwd else '없음'}: {cyc}사이클",
          f"= 이상적 {len(prog) + 4} + 데이터 스톨 {data} + 분기 {ctrl}")
```
```text
              1 2 3 4 5 6 7 8 9 0 1 2 3 4 5
lw x1,0(x2)   F D X M W
add x3,x1,x4    F D D X M W
lw x6,4(x2)       F F D X M W
sub x5,x3,x6          F D D X M W
sw x5,8(x2)             F F D X M W
beq x5,x0,L T               F D X M W
addi x7,x7,1                      F D X M W
포워딩 있음: 15사이클 = 이상적 11 + 데이터 스톨 2 + 분기 2
포워딩 없음: 19사이클 = 이상적 11 + 데이터 스톨 6 + 분기 2
```

표에서 `D D`는 ID에 붙잡힌 사이클이고, 그동안 뒤 명령어도 `F F`로 IF에 멈춘다(F·D·X·M·W는 다섯 단계의 머리글자다). `add`는 바로 앞 `lw`의 x1을, `sub`는 바로 앞 `lw`의 x6을 1사이클씩 기다린다. `sub`의 x3, `sw`의 x5, `beq`의 x5는 경로 A로 넘어와 멈추지 않는다. `beq`가 10번 사이클에 EX에서 뜀으로 판명되자, 그 뒤에 인출해 둔 두 명령어가 버려지고 `addi`는 11번 사이클에야 인출된다.

## 손으로 세고 식으로 확인하기
손으로 세면 이렇다. 해저드가 없으면 7개 명령어 + 파이프라인을 채우는 4사이클 = 11사이클이다. 포워딩이 있으면 로드-사용 두 번(1 + 1)과 뜀 분기(2)를 더해 15사이클이다. 포워딩이 없으면 `add`가 x1을, `sub`가 x6을, `sw`가 x5를 각각 2사이클씩 기다리고(6), `beq`는 `sw`가 기다리는 동안 x5가 이미 준비되어 멈추지 않으니 분기 2를 더해 19사이클이다.

같은 규칙을 닫힌 식으로도 쓸 수 있다. 명령어 i가 ID를 떠나는 사이클을 dᵢ라 하면 `dᵢ = max(dᵢ₋₁ + 1, 생산자 d + 간격)`이고, 간격은 포워딩이 있으면 ALU 1·적재 2, 없으면 3이다. 앞 명령어가 뜀 분기면 `dᵢ₋₁ + 3`이다. 사이클을 하나씩 미는 시뮬레이터와 이 식은 독립적으로 짠 두 구현이므로, 무작위 프로그램 300개에서 둘이 같은 사이클 수를 내는지 확인한다. 앞 코드에 이어서 실행한다.
```python
def by_formula(prog, fwd):  # 명령어 i가 ID를 떠나는 사이클 d를 식으로
    d, made, prev_taken = 1, {}, False
    for line in prog:
        op, dst, srcs = parse(line)
        nd = d + (3 if prev_taken else 1)   # 뜀이면 2사이클 버림
        for r in srcs:
            if r in made:                   # 가장 최근에 r을 쓴 명령어
                dj, load = made[r]
                nd = max(nd, dj + ((2 if load else 1) if fwd else 3))
        d = nd
        if dst: made[dst] = (d, op == "lw")
        prev_taken = line.endswith("T")
    return d + 3                            # 마지막 명령어의 WB

print("손으로 센 값과 일치:", [by_formula(prog, f) for f in (True, False)]
      == [simulate(prog, f)[0] for f in (True, False)] == [15, 19])
rng, R = random.Random(2), [f"x{i}" for i in range(1, 7)]
def rand_ins():
    a, b, c = (rng.choice(R) for _ in range(3))
    return rng.choice([f"add {a},{b},{c}", f"lw {a},0({b})",
                       f"sw {a},4({b})", f"beq {a},{b},L " +
                       rng.choice("TN")])
same = all(simulate(p, f)[0] == by_formula(p, f)
           for p in ([rand_ins() for _ in range(rng.randint(3, 12))]
                     for _ in range(300)) for f in (True, False))
print("무작위 300개 × 포워딩 있음/없음, 시뮬레이터 = 식:", same)
moved = [prog[0], prog[2], prog[1]] + prog[3:]  # 독립인 lw를 앞당긴다
cyc, data, ctrl, _ = simulate(moved, True)
print(f"lw를 앞당긴 순서: {cyc}사이클, 데이터 스톨 {data}")
```
```text
손으로 센 값과 일치: True
무작위 300개 × 포워딩 있음/없음, 시뮬레이터 = 식: True
lw를 앞당긴 순서: 13사이클, 데이터 스톨 0
```

## 코드에 주는 의미
마지막 줄이 컴파일러의 **명령어 스케줄링**(instruction scheduling)이다. 두 번째 `lw`는 `add`와 상관이 없으므로 앞으로 당기면, `add`가 x1을 기다리는 사이클에 `lw`가 들어가고 `sub`가 x6을 기다리는 사이클도 사라진다. 결과는 같고 15사이클이 13사이클이 된다. gcc의 `-O2`는 대상 마이크로아키텍처의 지연 모델(`-mtune`)로 이런 배치를 한다. 루프 펼치기도 같은 효과를 낸다. 펼친 몸체에 서로 독립인 적재가 여럿 생겨 사이사이를 채울 수 있다.

순서대로 실행하는 코어에서는 이 배치가 컴파일러의 몫이고, 비순차 코어는 같은 일을 하드웨어가 실행 중에 한다(4편 「비순차 실행: 레지스터 이름 바꾸기와 토마술로 알고리즘」). 그래도 의존 사슬 자체는 하드웨어도 줄이지 못하므로, 연결 리스트 따라가기처럼 앞 적재의 결과가 다음 적재의 주소가 되는 코드는 여전히 적재 지연을 그대로 맞는다.

흔한 오해와 변화도 짚어 두자.
- "포워딩이 있으면 데이터 해저드가 없다": 로드-사용 스톨은 남는다. 현대 코어는 L1 적중에도 몇 사이클이 걸려, 이 간격이 5단 교과서의 1사이클보다 길다.
- 분기 지연 슬롯: 초기 MIPS는 분기 바로 뒤 명령어를 늘 실행하도록 ISA에 못 박아 버리는 사이클을 메웠다. 파이프라인이 깊어지고 한 사이클에 여러 명령어를 내게 되자 슬롯 하나로는 모자라고 짐만 되어, RISC-V와 AArch64에는 없다. 대신 3편 「분기 예측: 2비트 카운터에서 gshare와 TAGE까지」의 예측기가 이 문제를 맡는다.

## 숫자로 보기
5단 교과서 파이프라인(분기는 EX에서 판명, 안 뜀 예측)에서 잃는 사이클이다.

| 상황 | 포워딩 있음 | 포워딩 없음 |
|---|---|---|
| ALU → 바로 뒤 ALU | 0 | 2 |
| 적재 → 바로 뒤 사용 | 1 | 2 |
| 뜀 분기 | 2 | 2 |

실제 고성능 코어는 단계가 훨씬 많다. 인텔은 Golden Cove(12세대 코어 P코어)의 분기 예측 실패 벌점이 최소 17사이클이라고 밝혔다. 5단에서 2사이클이던 제어 해저드가 8배 넘게 커진 셈이라, 예측기의 정확도가 성능을 좌우한다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」: 거기서 기준 프로그램으로 센 전달과 분기 예측의 효과를, 이 글은 단계별 사이클 표로 펼쳤다.
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: 컴파일러 뒷단의 명령어 스케줄링이 이 글의 로드-사용 스톨을 메우는 일이다.
- 추상 데이터 타입 심화 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」: 개방 주소법은 다음 탐사 주소를 계산으로 얻어 적재를 미리 낼 수 있지만, 체이닝은 적재 결과가 다음 주소라 적재 지연이 사슬로 이어진다.

## 정리
- 5단 파이프라인의 해저드는 데이터·제어·구조 세 가지이고, 구조 해저드는 L1i·L1d 분리처럼 자원을 늘려 없앤다.
- 포워딩 경로 두 개(EX/MEM → EX, MEM/WB → EX)가 ALU 의존의 스톨을 없애고, 적재 뒤 바로 사용 1사이클과 뜀 분기 2사이클이 남는다.
- 시뮬레이터는 예제에서 포워딩 있음 15사이클, 없음 19사이클을 냈고, 손으로 센 값·닫힌 식·무작위 300개 프로그램과 모두 일치했다.
- 독립인 적재를 앞당기는 스케줄링만으로 15사이클이 13사이클이 되었다. 깊은 실제 파이프라인에서는 분기 벌점이 17사이클 수준이라 예측이 중요해진다.

## 더 알아보기
- 이전 글: 1편 「CPU 마이크로아키텍처 지도: 명령어 집합 아래에서 일어나는 일」
- 다음 글: 3편 「분기 예측: 2비트 카운터에서 gshare와 TAGE까지」
