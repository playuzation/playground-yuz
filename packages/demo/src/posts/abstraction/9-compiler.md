# [트랜지스터에서 자연어까지 9/13] 컴파일러: 식과 문장을 명령어로 바꾸기

> **한 줄 요약** — 컴파일러는 소스 코드를 토큰으로 자르고 문법에 따라 구문 트리로 묶은 뒤, 트리의 노드마다 정해진 명령어 틀을 이어 붙여 어셈블리를 만드는 결정적 번역기이고, 변수를 어디에 두는가 같은 선택이 같은 동작의 프로그램을 몇 배 빠르게 만든다.

## 이 글에서 다루는 것
- 어셈블리 위에 한 층을 더 쌓은 이유
- 토큰화 → 구문 트리 → 토이 어셈블리 컴파일러를 파이썬으로 구현
- 어셈블러와 토이 CPU로 끝까지 실행해 55 출력
- 레지스터 4개의 한계와 레지스터 할당
- 부트스트래핑: 컴파일러가 자기 자신을 컴파일하기

## 어셈블리 위의 한 층
어셈블리 한 줄은 여전히 기계어 한 워드라, 어느 레지스터에 무엇을 둘지와 반복문을 어떤 점프로 만들지는 사람이 정한다. `sum = sum + i` 같은 식과 문장을 받아 이 결정을 대신 내리는 프로그램이 **컴파일러**(compiler)다. 1957년 4월 IBM 704 사용자에게 처음 전달된 존 배커스 팀의 포트란 컴파일러는 손으로 짠 프로그램만큼 빠른 코드를 내는 것을 목표로 삼았다. 그래야 사람들이 쓸 것이기 때문이다. 언어의 역사는 11편, 단계의 이론은 언어 기초 5편 「컴파일 언어: 실행 전에 번역하기」에 있고, 여기서는 그 단계를 작은 언어로 직접 만든다.

## 작은 언어
```text
문장 := 이름 = 식 ;
      | while 식 != 식 { 문장… }
      | print 식 ;
식   := 원자 (+ 원자 또는 - 원자)…
원자 := 숫자 또는 이름
```
번역할 프로그램은 언어 기초 1편의 그 예제, 1부터 10까지의 합이다.

## 1단계: 토큰화
```python
import re

def tokenize(src):
    return [int(t) if t.isdigit() else t
            for t in re.findall(r"\d+|\w+|!=|\S", src)]

SRC = "sum = 0; i = 10; while i != 0 { sum = sum + i; i = i - 1; } print sum;"
print(tokenize("i = i - 1;"))
```
```text
['i', '=', 'i', '-', 1, ';']
```
정규식 하나가 숫자, 이름, `!=`, 기호 한 글자를 차례로 잘라 낸다. 공백은 여기서 사라지고 숫자는 정수가 된다.

## 2단계: 구문 트리
문법 규칙 하나를 함수 하나로 옮긴 **재귀 하강 파서**(recursive descent parser)다.
```python
def parse(src):
    toks, k = tokenize(src) + ["끝"], 0
    def eat(want=None):
        nonlocal k
        if want and toks[k] != want:
            raise SyntaxError(f"토큰 {k}: {want!r} 자리에 {toks[k]!r}")
        k += 1
        return toks[k - 1]
    def block(end):
        body = []
        while toks[k] != end: body.append(stmt())
        eat(end)
        return body
    def stmt():
        t = eat()
        if t == "while":
            a = expr(); eat("!="); b = expr(); eat("{")
            return ("while", a, b, block("}"))
        if t == "print": s = ("print", expr())
        else: eat("="); s = ("set", t, expr())
        eat(";")
        return s
    def expr():                          # a - b - c = (a - b) - c
        e = atom()
        while toks[k] in ("+", "-"): e = (eat(), e, atom())
        return e
    def atom():
        t = eat()
        if isinstance(t, int): return ("num", t)
        if t.isidentifier(): return ("var", t)
        raise SyntaxError(f"토큰 {k - 1}: 식 자리에 {t!r}")
    return block("끝")

print(parse(SRC)[2])
```
```text
('while', ('var', 'i'), ('num', 0), [('set', 'sum', ('+', ('var', 'sum'), ('var', 'i'))), ('set', 'i', ('-', ('var', 'i'), ('num', 1)))])
```
세 번째 문장이 튜플 트리가 되었다. `("while", 왼쪽, 오른쪽, 본문)` 안에 대입문 두 개가 있고, `sum + i`는 `+`가 뿌리인 작은 트리다(이산수학 9편 「트리: 계층 구조와 구문 트리」). `sum = sum + ;`처럼 문법에 맞지 않는 입력은 `atom`이나 `eat`가 SyntaxError로 거부한다.

## 3단계: 코드 생성
트리를 재귀로 내려가며 노드마다 정해진 명령어 틀을 낸다. 숫자는 `LOADI`, 메모리 변수는 `LOAD`, 대입은 `STORE`, 상수 더하기·빼기는 `ADDI`다(빼기 1은 255 더하기, 이산수학 12편). `while`은 머리에서 Z를 세워 `JZ`로 빠져나가고 끝의 `JMP`로 되돌아온다. 변수 자리는 `where`가 `var_regs`의 레지스터부터, 모자라면 메모리 16번지부터 정한다.
```python
def leaves(e):
    return [e] if e[0] in ("num", "var") else leaves(e[1]) + leaves(e[2])

def codegen(tree, var_regs=()):
    asm, home, free = [], {}, list(var_regs)
    emit = lambda s: asm.append(s if s.endswith(":") else "    " + s)
    def where(x):
        if x not in home:
            home[x] = free.pop(0) if free else f"[{16 + len(home)}]"
        return home[x]
    def val(e, r):                       # e를 계산해 r에 넣고 r을 돌려준다
        if e[0] == "num": emit(f"LOADI {r}, {e[1] & 255}")
        elif e[0] == "var":
            h = where(e[1])
            if h[0] == "[": emit(f"LOAD {r}, {h}")
            elif h != r: emit(f"LOADI {r}, 0"); emit(f"ADD {r}, {h}")
        elif e[2][0] == "num":
            val(e[1], r)
            emit(f"ADDI {r}, {(e[2][1] if e[0] == '+' else -e[2][1]) & 255}")
        else:
            val(e[1], r); op = "ADD" if e[0] == "+" else "SUB"
            emit(f"{op} {r}, {reg(e[2]) or val(e[2], 'R1')}")
        return r
    def reg(e):                          # 레지스터에 사는 변수면 그 이름
        return e[0] == "var" and where(e[1])[0] == "R" and where(e[1])
    def stmt(s):
        if s[0] == "set":
            h = where(s[1])
            if h[0] == "[": emit(f"STORE {val(s[2], 'R0')}, {h}")
            elif ("var", s[1]) not in leaves(s[2])[1:]:
                val(s[2], h)             # 제자리 계산: sum = sum + i
            else: val(s[2], "R0"); emit(f"LOADI {h}, 0"); emit(f"ADD {h}, R0")
        elif s[0] == "print": emit(f"OUT {reg(s[1]) or val(s[1], 'R0')}")
        else:                            # while a != b: a − b가 0이면 탈출
            n = len(asm); emit(f"loop{n}:")
            if s[2] == ("num", 0):       # ADDI r, 0은 값은 두고 Z만 세운다
                emit(f"ADDI {reg(s[1]) or val(s[1], 'R0')}, 0")
            else: val(("-", s[1], s[2]), "R0")
            emit(f"JZ done{n}")
            for t in s[3]: stmt(t)
            emit(f"JMP loop{n}"); emit(f"done{n}:")
    for s in tree: stmt(s)
    emit("HALT")
    return asm, home

asm, home = codegen(parse(SRC), var_regs=("R2", "R3"))
print(home); print("\n".join(asm))
```
```text
{'sum': 'R2', 'i': 'R3'}
    LOADI R2, 0
    LOADI R3, 10
loop2:
    ADDI R3, 0
    JZ done2
    ADD R2, R3
    ADDI R3, 255
    JMP loop2
done2:
    OUT R2
    HALT
```
`sum = sum + i`는 `sum`이 이미 R2에 있어 `ADD R2, R3` 한 줄이 된다. 가능한 명령어 조합 중 싼 쪽을 고르는 이런 일을 **명령어 선택**(instruction selection)이라 한다. `x = 1 - x`처럼 대입할 변수가 식 뒤쪽에도 나오면 제자리 계산이 값을 먼저 망가뜨리므로, `leaves` 검사로 가려 R0에서 계산한 뒤 옮긴다.

## 끝까지 실행하기
어셈블러는 8편의 2패스 방식, CPU는 5편의 인출-해독-실행을 공용 토이 ISA 그대로 짧게 다시 정의한다.
```python
OPS = "HALT LOADI ADD SUB ADDI LOAD STORE JMP JZ JNZ OUT".split()

def assemble(asm):
    labels, code = {}, []
    for l in asm:                        # 1패스: 레이블 주소 표
        if l.endswith(":"): labels[l[:-1]] = len(code)
        else: code.append(l)
    for i, l in enumerate(code):         # 2패스: 비트 필드 채우기
        op, *args = l.replace(",", " ").split()
        rd, rs = ([int(a[1]) for a in args if a[0] == "R"] + [0, 0])[:2]
        imm = [labels[a] if a in labels else int(a.strip("[]"))
               for a in args if a[0] != "R"] + [0]
        code[i] = OPS.index(op) << 12 | rd << 10 | rs << 8 | imm[0]
    return code

def run(code):
    R, mem, pc, z, out, n = [0] * 4, [0] * 256, 0, False, [], 1
    while code[pc] >> 12:                # opcode 0 = HALT
        w = code[pc]; pc += 1; n += 1
        op, d, s, imm = w >> 12, w >> 10 & 3, w >> 8 & 3, w & 255
        if op == 1: R[d] = imm
        if 2 <= op <= 4:
            R[d] = (R[d] + [R[s], -R[s], imm][op - 2]) & 255; z = R[d] == 0
        if op == 5: R[d] = mem[imm]
        if op == 6: mem[imm] = R[d]
        if op == 7 or op == 8 and z or op == 9 and not z: pc = imm
        if op == 10: out.append(R[d])
    return out, n                        # 출력, 실행한 명령 수

code = assemble(asm)
print("레지스터 배치:", len(code), "워드", run(code))
mem = assemble(codegen(parse(SRC))[0])
print("메모리 배치:", len(mem), "워드", run(mem))
hand = [0x1000, 0x140A, 0x2100, 0x44FF, 0x9002, 0xA000, 0x0000]
print("손으로 쓴 것:", len(hand), "워드", run(hand))
```
```text
레지스터 배치: 9 워드 ([55], 56)
메모리 배치: 18 워드 ([55], 120)
손으로 쓴 것: 7 워드 ([55], 34)
```
소스 한 줄이 기계어 아홉 워드가 되어 55를 출력했다. 세 프로그램 모두 55를 내고 실행한 명령 수만 다르다.

## 레지스터 4개의 한계와 레지스터 할당
변수를 전부 메모리에 두면 읽고 쓸 때마다 `LOAD`·`STORE`가 붙어 120개 명령을 실행하고, R2·R3에 두면 56개다. 그러나 레지스터는 넷뿐이고 R0·R1은 중간값에 써야 하므로 셋째 변수부터는 메모리로 밀려난다.
```python
asm3, home3 = codegen(parse("a = 7; b = 5; c = a - b; print c;"),
                      var_regs=("R2", "R3"))
print(home3, run(assemble(asm3)))
```
```text
{'a': 'R2', 'b': 'R3', 'c': '[18]'} ([2], 9)
```
레지스터에 못 들어간 값을 메모리로 내보내는 것을 **스필**(spill)이라 한다. 이 컴파일러는 먼저 나온 변수에 레지스터를 주지만, 실제 컴파일러는 동시에 살아 있는 값끼리 선을 그은 간섭 그래프를 레지스터 수만큼의 색으로 칠하고(그래프 색칠), 칠하지 못한 값을 스필한다. 범용 레지스터가 16개인 x86-64(언어 기초 6편)에서도 이 문제는 남는다.

남은 56 대 34의 차이도 최적화로 줄어든다. 손으로 쓴 쪽은 i가 10에서 시작함을 알고 첫 검사를 생략하고, `ADDI R1, 255`가 세운 Z를 바로 `JNZ`로 써서 검사를 루프 끝으로 옮겼다(루프 뒤집기). 반복마다 2개, 첫 검사 2개를 더해 정확히 22개 차이다. 언어 기초 5편에서 `gcc -O2`가 반복문을 상수 55로 접은 상수 접기는 같은 사다리의 더 높은 단이다.

## 부트스트래핑: 자기 자신을 컴파일하는 컴파일러
언어 X의 컴파일러를 X로 쓰면, 그 첫 컴파일러는 누가 컴파일할까. 1962년 MIT의 팀 하트와 마이크 레빈은 리스프로 리스프 컴파일러를 썼고, 처음에는 기존 리스프 인터프리터가 그 코드를 실행해 컴파일러 자신을 기계어로 바꿨다. 러스트의 첫 컴파일러는 OCaml로 쓰였고 2011년에 러스트로 쓴 컴파일러가 자기 자신을 컴파일했다. Go는 1.5(2015년)에서 컴파일러를 C에서 Go로 옮겨, 이제 Go를 빌드하려면 이전 버전의 Go가 필요하다. GCC는 빌드할 때 자신을 세 번 컴파일해 2단계와 3단계 결과물이 같은지 비교한다. 올바른 컴파일러라면 누가 컴파일했든 같은 출력을 내야 하기 때문이다.

이 고리는 신뢰의 문제를 남긴다. 켄 톰프슨은 1983년 튜링상 수상 강연(1984년 「Reflections on Trusting Trust」로 출판)에서, 컴파일러 바이너리에 심은 트로이 목마가 컴파일러를 컴파일할 때마다 자신을 다시 심게 하면 소스 어디에도 흔적이 남지 않음을 보였다. 아래 층의 변환을 믿는다는 것은 그 변환을 만든 도구까지 믿는다는 뜻이다.

## 이 층의 변환
```text
입력: 식·변수·반복문으로 쓴 소스 코드
출력: 레지스터·주소·점프로 된 어셈블리
보존: 관찰 가능한 동작(출력 55)
숨김: 레지스터 배정, 점프, 명령어 선택
```
문법이 토큰열을 하나의 트리로 묶고 노드마다 의미가 같은 명령어 틀이 정해져 있어, 부분의 번역을 이어 붙이면 전체의 번역이 된다. 틀 하나하나가 맞으면 조합도 맞는다. 변수 배치를 바꿔도 출력은 55 그대로였고 비용만 120에서 56으로 바뀌었다. 최적화는 동작은 건드리지 않고 숨겨진 선택만 바꾸는 일이다.

## 어디에 쓰이나
- 언어 기초 5편 「컴파일 언어: 실행 전에 번역하기」: 그 글의 어휘·구문 분석과 코드 생성을 이 글이 직접 만들었다.
- 이산수학 9편 「트리: 계층 구조와 구문 트리」: 자식을 먼저 번역하고 부모의 연산을 나중에 내는 코드 생성은 그 글의 후위 순회다.
- 12편 「자연어에서 코드로: 언어 모델이 프로그램을 쓰는 원리」: 같은 입력에 늘 같은 출력을 내는 이 결정적 변환이 언어 모델의 확률적 변환과 비교하는 기준이 된다.

## 정리
- 컴파일러는 토큰화 → 구문 트리 → 코드 생성으로 식과 문장을 명령어로 바꾸고, 문법 오류는 실행 전에 거른다.
- 노드마다 정해진 명령어 틀을 이어 붙이는 구성적 번역이라, 부분이 맞으면 전체가 맞는다.
- 레지스터는 넷뿐이라 변수 배치(레지스터 할당과 스필)가 성능을 바꾼다. 120개 명령이 56개로 줄었다.
- 컴파일러는 자기 자신을 컴파일하며 자라고(부트스트래핑), 그 고리는 도구에 대한 신뢰의 문제를 남긴다.

## 더 알아보기
- 이전 글: 8편 「어셈블러: 기호를 기계어로 바꾸기」
- 다음 글: 10편 「운영체제: 기계를 나눠 쓰게 하는 층」
- 게이트에서 컴파일러까지 직접 만드는 과정: https://www.nand2tetris.org/
