# [트랜지스터에서 자연어까지 2/13] 논리 게이트: 스위치로 불 대수를 만들기

> **한 줄 요약** — 스위치를 직렬로 이으면 AND, 병렬로 이으면 OR라는 관찰 위에서 CMOS 게이트는 NMOS 망과 그 쌍대인 PMOS 망을 짝지어 불 함수를 만들고, NAND 하나만 있으면 어떤 진리표든 회로로 옮길 수 있다.

## 이 글에서 다루는 것
- 스위치 회로와 불 대수: 클로드 섀넌의 1937년 석사 논문
- CMOS NAND·NOR의 트랜지스터 구성(직렬·병렬)을 스위치 수준에서 시뮬레이션하기
- NAND 하나로 모든 게이트 만들기: 함수적 완전성과 전수 검사
- 트랜지스터 수와 게이트 지연

## 스위치 회로는 불 대수다
1편에서 트랜지스터를 전압으로 여닫는 스위치로 보았다. 스위치를 여럿 이으면 무엇을 계산할 수 있을까. 1937년 MIT 대학원생이던 클로드 섀넌(Claude Shannon)은 석사 논문 「A Symbolic Analysis of Relay and Switching Circuits」에서 계전기와 스위치로 된 회로를 불 대수로 분석하고 단순하게 만들 수 있음을 보였다(1938년 AIEE 논문지에 실림). 핵심은 두 줄이다.

- 스위치 두 개를 **직렬**로 이으면 둘 다 닫혀야 전류가 흐른다: AND
- **병렬**로 이으면 하나만 닫혀도 흐른다: OR

이 대응 덕분에 회로 설계가 식 계산이 됐다. 식을 불 대수 법칙으로 줄이면 스위치 수가 줄고, 거꾸로 원하는 논리식을 회로로 옮길 수 있다. 불 대수 자체(진리표, 드모르간 법칙, 흡수 법칙)는 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」에서 다뤘으니 여기서는 회로 쪽에 집중한다.

## CMOS NAND와 NOR: 직렬과 병렬
CMOS 게이트는 출력을 VDD(1)에 잇는 **풀업**(pull-up) 망과 GND(0)에 잇는 **풀다운**(pull-down) 망으로 되어 있다. 풀다운은 NMOS로, 풀업은 PMOS로 만든다. 입력이 2개인 NAND는 이렇게 생겼다.

```text
          VDD
       ┌───┴───┐
   a ─[P]     [P]─ b
       └───┬───┘
           ├────── out
   a ─────[N]
           │
   b ─────[N]
           │
          GND
```

풀다운은 NMOS 둘의 직렬이라 a와 b가 모두 1일 때만 출력이 0이 된다. 풀업은 PMOS 둘의 병렬이라 a나 b 중 하나라도 0이면 출력이 1이 된다. 출력은 ¬(a ∧ b), 곧 NAND다. NOR는 정확히 반대로 NMOS를 병렬, PMOS를 직렬로 잇는다.

조건이 하나 있다. 어떤 입력에서든 두 망 중 **정확히 하나**만 통해야 한다. 둘 다 통하면 VDD와 GND가 곧장 이어지는 단락이고, 둘 다 막히면 출력이 어디에도 이어지지 않아 떠 있다(floating). 스위치 수준에서 시뮬레이션해 확인하자.
```python
from itertools import product

def on(net, x):
    """스위치 망이 전류를 통하나. N: 게이트 1이면 켜짐, P: 0이면 켜짐."""
    op, *args = net
    if op == "N":
        return x[args[0]] == 1
    if op == "P":
        return x[args[0]] == 0
    paths = [on(n, x) for n in args]
    return all(paths) if op == "직렬" else any(paths)

def gate(up, down, x):
    u, d = on(up, x), on(down, x)        # VDD 쪽 망, GND 쪽 망
    if u == d:
        return "단락" if u else "떠 있음"
    return 1 if u else 0

def count(net):
    return 1 if net[0] in "NP" else sum(count(n) for n in net[1:])

P, N = lambda x: ("P", x), lambda x: ("N", x)
designs = {
    "NAND": (("병렬", P("a"), P("b")), ("직렬", N("a"), N("b"))),
    "NOR":  (("직렬", P("a"), P("b")), ("병렬", N("a"), N("b"))),
    "잘못": (("직렬", P("a"), P("b")), ("직렬", N("a"), N("b"))),
}
for name, (up, down) in designs.items():      # 입력 ab = 00, 01, 10, 11
    outs = [gate(up, down, {"a": a, "b": b})
            for a, b in product([0, 1], repeat=2)]
    print(f"{name}: 트랜지스터 {count(up) + count(down)}개, 출력 {outs}")
```
```text
NAND: 트랜지스터 4개, 출력 [1, 1, 1, 0]
NOR: 트랜지스터 4개, 출력 [1, 0, 0, 0]
잘못: 트랜지스터 4개, 출력 [1, '떠 있음', '떠 있음', 0]
```

NAND와 NOR는 모든 입력에서 0이나 1을 확실히 낸다. 세 번째 설계는 풀업도 직렬로 이어서 a와 b가 다를 때 두 망이 모두 막혀 출력이 떠 버린다. 올바른 짝을 정해 주는 것이 드모르간 법칙이다. 풀다운이 통하는 조건이 `a ∧ b`이면 풀업이 통하는 조건은 그 부정 `¬(a ∧ b) = ¬a ∨ ¬b`여야 하고, `¬a`는 PMOS 하나, `∨`는 병렬이다. 직렬과 병렬을 맞바꾸고 NMOS를 PMOS로 바꾸면 늘 보완하는 망이 나온다.

이 구조에서 하나 더 알 수 있다. NMOS는 입력이 1일 때 출력을 0으로 끌어내리므로, CMOS 한 단은 언제나 **반전하는** 게이트다. NOT, NAND, NOR는 한 단이면 되지만 AND는 NAND 뒤에 NOT을 붙여야 한다.

## NAND 하나로 모든 게이트
NAND만으로 NOT, AND, OR, XOR를 만들고 진리표 전체를 검사해 보자. 신호를 (값, 깊이) 쌍으로 들고 다니며 NAND 수, 트랜지스터 수, 입력에서 출력까지 거치는 게이트 수(깊이)를 함께 센다. 마지막에는 입력이 2개인 불 함수 16개를 전부 NAND만으로 만든다.
```python
from itertools import product

def nand(*xs):      # 신호 = (값, 깊이). 입력 k개 NAND = 트랜지스터 2k개
    stats["nand"] += 1
    stats["tr"] += 2 * len(xs)
    return (0 if all(v for v, _ in xs) else 1,
            1 + max((d for _, d in xs), default=0))

NOT = lambda a: nand(a)
AND = lambda a, b: nand(nand(a, b))
OR = lambda a, b: nand(nand(a), nand(b))
def XOR(a, b):
    m = nand(a, b)
    return nand(nand(a, m), nand(b, m))

tests = {"NOT": (lambda a, b: NOT(a), lambda a, b: 1 - a),
         "AND": (AND, lambda a, b: a & b),
         "OR": (OR, lambda a, b: a | b),
         "XOR": (XOR, lambda a, b: a ^ b)}
for name, (g, ref) in tests.items():
    ok = True
    for a, b in product([0, 1], repeat=2):
        stats = {"nand": 0, "tr": 0}
        v, depth = g((a, 0), (b, 0))
        ok &= v == ref(a, b)
    print(f"{name:3}: {'일치' if ok else '불일치'}, NAND {stats['nand']}개, "
          f"트랜지스터 {stats['tr']:2d}개, 깊이 {depth}")

def from_table(f):      # 진리표 → 곱의 합 → NAND-NAND 두 단
    def circuit(a, b):
        terms = [nand(a if ra else NOT(a), b if rb else NOT(b))
                 for ra, rb in product([0, 1], repeat=2) if f(ra, rb)]
        return nand(*terms)
    return circuit

good = 0
for k in range(16):     # 입력 2개짜리 불 함수는 2⁴ = 16개
    f = lambda a, b, k=k: (k >> (2 * a + b)) & 1
    c = from_table(f)
    good += all(c((a, 0), (b, 0))[0] == f(a, b)
                for a, b in product([0, 1], repeat=2))
print(f"입력 2개짜리 함수 16개 중 {good}개를 NAND만으로 구현")
```
```text
NOT: 일치, NAND 1개, 트랜지스터  2개, 깊이 1
AND: 일치, NAND 2개, 트랜지스터  6개, 깊이 2
OR : 일치, NAND 3개, 트랜지스터  8개, 깊이 2
XOR: 일치, NAND 4개, 트랜지스터 16개, 깊이 3
입력 2개짜리 함수 16개 중 16개를 NAND만으로 구현
```

`from_table`이 **함수적 완전성**(functional completeness)의 증명 그 자체다. 진리표에서 1이 나오는 행마다 그 행에서만 0이 되는 NAND를 하나 만들고(곱 항), 그 NAND들을 다시 NAND로 묶는다. 드모르간 법칙으로 `NAND(¬t₁, ¬t₂, …) = t₁ ∨ t₂ ∨ …`이므로 이것은 곱의 합(sum of products)이다. 입력이 몇 개든 같은 방법이 통하므로 NAND만 있으면 어떤 불 함수든 만들 수 있다. 1이 하나도 없는 함수는 항이 없어 출력이 늘 0이 되는 것까지 코드가 그대로 처리한다.

NOR도 같은 성질을 가진다. 아폴로 유도 컴퓨터(Apollo Guidance Computer)의 논리 회로는 입력 3개짜리 NOR 게이트만으로 만들어졌다. 함수적 완전성 덕분에 부품 한 종류로 컴퓨터 전체를 만들 수 있다.

## 트랜지스터 수와 게이트 지연
NAND만 쓰면 편하지만 공짜는 아니다. 같은 기능을 CMOS로 직접 만든 것과 비교하면 이렇다.

| 게이트 | NAND로 조립 | CMOS로 직접 |
|---|---|---|
| NOT | 2개 | 2개 |
| AND | 6개 | 6개(NAND + NOT) |
| OR | 8개 | 6개(NOR + NOT) |

실제 칩은 NAND 한 종류가 아니라 NOT, NAND, NOR, XOR, 여러 복합 게이트를 크기별로 갖춘 **표준 셀 라이브러리**를 쓰고, 논리 합성(logic synthesis) 도구가 식을 이 셀들로 바꾼다. NAND로 충분하다는 것은 "만들 수 있다"는 보장이고, 무엇이 가장 싸고 빠른지는 따로 최적화한다.

게이트에는 **게이트 지연**(propagation delay)이 있다. 출력이 바뀌려면 트랜지스터 전류로 출력 전선과 다음 게이트 입력의 정전용량을 충전하거나 방전해야 하기 때문이다. 그래서 다음 세 가지가 속도를 정한다.

- 깊이: 입력에서 출력까지 거치는 게이트 수. 위의 XOR는 깊이 3이라 NAND 하나보다 약 3배 늦게 답이 나온다. 가장 깊은 경로를 **임계 경로**(critical path)라 한다.
- 직렬 트랜지스터: 직렬로 쌓을수록 저항이 커져 느려진다. 입력이 많은 게이트가 느린 이유다. PMOS가 쓰는 정공은 NMOS가 쓰는 전자보다 느려서, PMOS가 직렬인 NOR는 같은 크기의 NAND보다 느린 편이다.
- 팬아웃(fan-out): 출력 하나가 이어진 입력 수. 많을수록 충전할 정전용량이 커진다.

깊이는 3편에서 덧셈기의 속도를 비교하는 기준이 되고, 4편에서는 클록 주기의 하한을 정한다.

## 이 층의 변환
```text
입력: 전압으로 여닫는 트랜지스터
출력: NAND·NOR·NOT 같은 불 함수
보존: 모든 입력 조합의 출력(진리표)
숨김: 직렬·병렬 배치, 트랜지스터 크기
```
섀넌이 보인 직렬 = AND, 병렬 = OR 대응과, 풀업을 풀다운의 드모르간 쌍대로 만드는 규칙이 이 변환을 보장한다. 두 망이 늘 정확히 하나만 통하므로 출력은 1편의 두 구간 중 하나에 확실히 들어가고, 위 층은 트랜지스터 대신 진리표만 보면 된다. 남는 물리적 흔적은 게이트 지연과 트랜지스터 수, 곧 속도와 면적이다.

## 어디에 쓰이나
- 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」: 그 글의 드모르간 법칙이 CMOS 풀업 망을 풀다운 망에서 기계적으로 만드는 규칙이 된다.
- 언어 기초 5편 「컴파일 언어: 실행 전에 번역하기」: 컴파일러가 식을 몇 가지 기계어 명령으로 바꾸듯, 논리 합성 도구는 논리식을 표준 셀 게이트로 바꾸고 최적화한다.
- 3편 「조합 회로: 덧셈기에서 ALU까지」: 이 글의 NAND로 반가산기·전가산기·멀티플렉서를 조립해 ALU까지 간다.

## 정리
- 스위치의 직렬은 AND, 병렬은 OR이고, 섀넌은 1937년 석사 논문에서 스위치 회로를 불 대수로 다룰 수 있음을 보였다.
- CMOS NAND는 NMOS 직렬 풀다운과 PMOS 병렬 풀업으로 트랜지스터 4개, NOR는 그 반대다. 두 망은 드모르간 쌍대라 늘 정확히 하나만 통한다.
- NAND(또는 NOR) 하나로 어떤 불 함수든 곱의 합 형태로 만들 수 있고, 입력 2개짜리 함수 16개 전부를 코드로 확인했다.
- 게이트마다 지연이 있어 회로의 속도는 가장 깊은 경로가 정한다.

## 더 알아보기
- 이전 글: 1편 「트랜지스터: 전기로 만든 스위치와 0·1의 탄생」
- 다음 글: 3편 「조합 회로: 덧셈기에서 ALU까지」
- Nand2Tetris(NAND 게이트에서 출발해 컴퓨터까지 직접 만드는 과정): https://www.nand2tetris.org/
