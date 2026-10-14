# [트랜지스터에서 자연어까지 8/13] 어셈블러: 기호를 기계어로 바꾸기

> **한 줄 요약** — 어셈블러는 니모닉·레지스터 이름·레이블을 ISA의 인코딩 규칙대로 숫자로 바꾸는 프로그램이고, 레이블이 쓰인 뒤에 정의될 수 있어서 1패스에서 레이블 주소 표를 만들고 2패스에서 인코딩한다.

## 이 글에서 다루는 것
- 기계어를 손으로 쓰면 무엇이 괴로운가
- 토이 어셈블리 문법과 두 번 훑는(two-pass) 어셈블러 구현
- 앞으로 참조, 오류 메시지, 역어셈블러
- 의사 명령과 매크로
- 최초의 어셈블러들

## 손으로 쓰는 기계어
5편에서는 `1000 140A 2100 44FF 9002 A000 0000`을 손으로 메모리에 넣었다. 이렇게 쓰면 세 가지가 괴롭다. opcode 번호와 비트 위치를 외워야 한다(`ADDI`는 4, rd는 11~10번 비트). 점프 주소를 손으로 세야 한다(`9002`의 02는 `ADD`가 놓인 주소다). 앞쪽에 명령 하나를 끼워 넣으면 뒤의 주소가 밀려 점프 숫자를 전부 고쳐야 한다. **어셈블러**(assembler)는 이 일을 대신하는, 기계어를 출력하는 프로그램이다.

## 토이 어셈블리 문법
- 한 줄에 명령 하나: `LOADI R1, 10`, `ADD R0, R1`, 메모리 주소는 대괄호로 `LOAD R2, [16]`
- 레지스터는 `R0`~`R3`, 즉치는 −128~255의 10진수(음수는 8비트 2의 보수로)
- 레이블은 `loop:`처럼 쓰고 점프에서 이름으로 부른다(`JNZ loop`). `;`부터 줄 끝까지는 주석

## 두 번 훑는 어셈블러
`JZ done`처럼 레이블이 정의되기 전에 쓰일 수 있다. 이것을 **앞으로 참조**(forward reference)라고 한다. 한 번만 훑으면 그 줄을 인코딩하는 순간 `done`의 주소를 모른다. 그래서 1패스는 명령 수를 세며 레이블마다 주소를 적어 **기호 표**(symbol table)를 만들고, 2패스는 완성된 표를 보며 각 줄을 인코딩한다.
```python
OPS = {"HALT": 0, "LOADI": 1, "ADD": 2, "SUB": 3, "ADDI": 4, "LOAD": 5,
       "STORE": 6, "JMP": 7, "JZ": 8, "JNZ": 9, "OUT": 10}
FORM = {"HALT": "", "LOADI": "di", "ADD": "ds", "SUB": "ds", "ADDI": "di",
        "LOAD": "dm", "STORE": "dm", "JMP": "i", "JZ": "i", "JNZ": "i",
        "OUT": "d"}            # d: rd, s: rs, i: 수나 레이블, m: [주소]

def lines(src):                # (행 번호, 레이블, 명령 텍스트)
    for no, line in enumerate(src.splitlines(), 1):
        label, _, text = line.split(";")[0].rpartition(":")
        yield no, label.strip(), text.strip()

def number(tok, symbols, no):
    if tok in symbols:
        return symbols[tok]
    if tok.lstrip("-").isdigit() and -128 <= int(tok) <= 255:
        return int(tok) & 0xFF                 # −1은 255로
    raise SyntaxError(f"{no}행: 알 수 없는 값 '{tok}'")

def encode(text, symbols, no):
    op, *args = text.replace(",", " ").split()
    if op not in OPS or len(args) != len(FORM[op]):
        raise SyntaxError(f"{no}행: 형식 오류 '{text}'")
    f = {"d": 0, "s": 0, "i": 0}
    for kind, tok in zip(FORM[op], args):
        if kind in "ds":
            if tok not in ("R0", "R1", "R2", "R3"):
                raise SyntaxError(f"{no}행: 레지스터가 아님 '{tok}'")
            f[kind] = int(tok[1])
        else:
            f["i"] = number(tok.strip("[]"), symbols, no)
    return OPS[op] << 12 | f["d"] << 10 | f["s"] << 8 | f["i"]

def assemble(src):
    symbols, addr = {}, 0
    for no, label, text in lines(src):         # 1패스: 레이블 → 주소
        if label:
            symbols[label] = addr
        addr += bool(text)
    return [encode(text, symbols, no)          # 2패스: 인코딩
            for no, label, text in lines(src) if text], symbols

SRC = """
; 1부터 10까지 더하기
        LOADI R0, 0      ; sum = 0
        LOADI R1, 10     ; i = 10
loop:   ADD   R0, R1     ; sum += i
        ADDI  R1, 255    ; i -= 1 (255 = −1)
        JNZ   loop       ; i ≠ 0이면 반복
        OUT   R0
        HALT
"""
words, symbols = assemble(SRC)
print(symbols, " ".join(f"{w:04X}" for w in words))
```
```text
{'loop': 2} 1000 140A 2100 44FF 9002 A000 0000
```

기호 표에 `loop`이 주소 2로 적혀 있으므로 2패스는 `JNZ loop`을 `9002`로 바꾼다. 5편에서 손으로 넣었던 기계어와 한 글자도 다르지 않다.

## CPU에서 실행하고, 앞으로 참조와 오류 확인하기
5편 방식의 CPU를 짧게 다시 정의한다. 이 글의 코드는 모두 앞 블록에 이어서 실행한다.
```python
def run(prog):                  # 5편 방식의 토이 CPU(짧게 다시 정의)
    R, mem, pc, z, out, steps = [0] * 4, [0] * 256, 0, False, [], 0
    while True:
        w = prog[pc]; pc += 1; steps += 1
        op, rd, rs, imm = w >> 12, (w >> 10) & 3, (w >> 8) & 3, w & 0xFF
        if op == 0: return out, steps
        if op == 1: R[rd] = imm
        if op in (2, 3, 4):
            b = imm if op == 4 else R[rs]
            R[rd] = (R[rd] + (-b if op == 3 else b)) & 0xFF
            z = R[rd] == 0
        if op == 5: R[rd] = mem[imm]
        if op == 6: mem[imm] = R[rd]
        if op == 7 or (op == 8 and z) or (op == 9 and not z): pc = imm
        if op == 10: out.append(R[rd])

print(run(words))

SRC2 = """
        LOADI R2, 3
again:  ADDI  R2, 255
        JZ    done       ; 아직 나오지 않은 레이블(앞으로 참조)
        OUT   R2
        JMP   again
done:   HALT
"""
w2, s2 = assemble(SRC2)
print(s2, " ".join(f"{w:04X}" for w in w2))
print(run(w2))
for bad in ("JNZ lop", "ADD R0, R7", "LOADI R1, 300"):
    try:
        assemble(bad)
    except SyntaxError as e:
        print(e)
```
```text
([55], 34)
{'again': 1, 'done': 5} 1803 48FF 8005 A800 7001 0000
([2, 1], 12)
1행: 알 수 없는 값 'lop'
1행: 레지스터가 아님 'R7'
1행: 알 수 없는 값 '300'
```

기준 프로그램은 34개 명령으로 55를 출력한다. 두 번째 프로그램의 `JZ done`은 1패스가 `done`을 5로 적어 두어 `8005`가 된다. 아래 세 줄은 오타, 없는 레지스터, 8비트를 넘는 수를 실행 전에 잡아낸 것이다. 손으로 쓴 점프 주소가 틀리면 실행해 봐야 드러나지만, 틀린 이름은 어셈블할 때 걸린다.

## 역어셈블러
**역어셈블러**(disassembler)는 반대 방향으로 기계어를 어셈블리로 돌린다. 이름은 기계어에 남아 있지 않으므로, 점프 대상이 되는 주소에 `L2` 같은 이름을 새로 붙인다.
```python
NAMES = {v: k for k, v in OPS.items()}

def disassemble(prog):
    jumps = {w & 0xFF for w in prog if w >> 12 in (7, 8, 9)}  # 점프 대상
    out = []
    for addr, w in enumerate(prog):
        op, imm = NAMES[w >> 12], w & 0xFF
        rd, rs = (w >> 10) & 3, (w >> 8) & 3
        args = {"": "", "di": f"R{rd}, {imm}", "ds": f"R{rd}, R{rs}",
                "dm": f"R{rd}, [{imm}]", "i": f"L{imm}", "d": f"R{rd}"}
        label = f"L{addr}:" if addr in jumps else ""
        out.append(f"{label:<6}{op:<6}{args[FORM[op]]}".rstrip())
    return "\n".join(out)

text = disassemble(words)
print(text)
print(assemble(text)[0] == words)              # 다시 어셈블하면 같은 기계어
```
```text
      LOADI R0, 0
      LOADI R1, 10
L2:   ADD   R0, R1
      ADDI  R1, 255
      JNZ   L2
      OUT   R0
      HALT
True
```

명령은 정확히 돌아오고 다시 어셈블해도 같은 기계어다(`True`). 하지만 `loop`이라는 이름, 주석, 255가 사실 −1이라는 의도는 사라졌다. 언어 기초 6편의 `objdump`가 보여 주는 모습이 이렇다.

## 의사 명령과 매크로
**의사 명령**(pseudo-instruction)은 한 줄을 실제 명령 하나로 바꾸는 별명이다. 6편의 RISC-V `nop`과 `li`가 `addi`의 별명이었던 것처럼, 아래의 `CLR`은 `LOADI rd, 0`, `DEC`는 `ADDI rd, 255`다. **매크로**(macro)는 한 줄을 여러 명령으로 펼치는 틀이다.
```python
MACROS = {"CLR": ["LOADI {0}, 0"],              # 의사 명령: 한 줄 → 한 줄
          "DEC": ["ADDI {0}, 255"],
          "MOV": ["LOADI {0}, 0", "ADD {0}, {1}"]}  # 매크로: 두 줄, Z도 바뀜

def expand(src):
    out = []
    for no, label, text in lines(src):
        op, *args = text.replace(",", " ").split() or [""]
        body = ([m.format(*args) for m in MACROS[op]]
                if op in MACROS else [text])
        out += [(f"{label}: " if label and k == 0 else "") + b
                for k, b in enumerate(body)]
    return "\n".join(out)

SRC3 = """
        CLR   R0
        LOADI R1, 10
loop:   ADD   R0, R1
        DEC   R1
        JNZ   loop
        MOV   R3, R0
        OUT   R3
        HALT
"""
w3, _ = assemble(expand(SRC3))
print(" ".join(f"{w:04X}" for w in w3), run(w3))
```
```text
1000 140A 2100 44FF 9002 1C00 2C00 AC00 0000 ([55], 36)
```

앞 다섯 워드는 기준 프로그램과 같고, `MOV R3, R0` 한 줄이 `1C00 2C00` 두 명령으로 펼쳐져 실행 명령이 36개로 늘었다. 매크로는 편하지만 비용과 부작용을 숨긴다. 이 `MOV`는 `ADD`를 쓰므로 Z 플래그를 바꾼다. `ADDI`와 `JNZ` 사이에 `MOV`를 넣으면 반복 조건이 조용히 바뀐다.

## 최초의 어셈블러들
영국의 캐슬린 부스가 1940년대 후반 ARC2 컴퓨터를 위해 만든 기호 표기 "Contracted Notation"은 흔히 최초의 어셈블리어로 꼽힌다. EDSAC에서는 대학원생 데이비드 휠러가 1949년 "초기 명령"(initial orders)을 만들었다. 31워드짜리 이 프로그램은 니모닉 문자와 10진수 주소로 천공된 테이프를 읽어 기계어로 바꿔 올렸고, 흔히 최초의 어셈블러로 불린다. 같은 해 나온 두 번째 판은 재배치 기능까지 갖췄다. 1951년 윌크스·휠러·길의 책은 재사용할 서브루틴 라이브러리를 처음 체계적으로 기술했다. 1955년 IBM의 스탠 폴리가 만든 IBM 650용 SOAP(Symbolic Optimal Assembly Program)의 "Optimal"은 회전하는 드럼 메모리에서 기다림이 가장 짧도록 명령의 위치를 골라 준다는 뜻이다.

이 글의 어셈블러는 프로그램 전체를 주소 0부터 한 덩어리로 만든다. 다른 파일의 이름을 비워 둔 목적 파일과 링커의 재배치는 언어 기초 6편에서 다뤘다.

## 이 층의 변환
```text
입력: 니모닉·레지스터 이름·레이블
출력: 16비트 기계어 워드 목록
보존: 명령의 의미와 순서(거의 1:1)
숨김: opcode 번호, 비트 위치, 점프 주소
```
어셈블리와 기계어가 거의 1:1로 대응하므로 변환은 표 찾기(opcode 표, 기호 표)와 비트 조립이 전부다. 1패스가 모든 레이블을 확정한 뒤 2패스가 인코딩하므로 레이블이 어디에 정의되든 같은 결과가 나온다. 역어셈블한 뒤 다시 어셈블하면 같은 기계어가 나오는 것이 의미가 보존된다는 확인이고, 이름과 주석은 사람을 위한 정보라 기계어에 남지 않는다.

## 어디에 쓰이나
- 언어 기초 6편 「어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지」: `gcc -c`의 어셈블 단계가 이 글의 어셈블러이고, 목적 파일의 심볼 테이블과 재배치는 이 글의 기호 표를 여러 파일로 넓힌 것이다.
- 6편 「명령어 집합: 하드웨어와 소프트웨어의 약속」: 이 글의 `encode`는 6편의 비트 필드 규칙을 그대로 코드로 옮긴 것이다.
- 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: 컴파일러는 이 글의 어셈블리 문법으로 출력하고, 숫자로 바꾸는 일은 어셈블러에 맡긴다.

## 정리
- 어셈블러는 니모닉·레지스터 이름·레이블을 ISA의 인코딩 규칙대로 숫자로 바꾼다.
- 1패스에서 기호 표를, 2패스에서 인코딩을 한다. 기준 프로그램은 `1000 140A 2100 44FF 9002 A000 0000`이 되어 34개 명령 만에 55를 출력했다.
- 역어셈블러는 명령을 정확히 되돌리지만 이름·주석·의도는 되돌리지 못한다.
- 의사 명령과 매크로는 한 줄로 여러 명령을 쓰게 해 주는 대신 비용과 부작용(여기서는 Z 플래그)을 숨긴다.

## 더 알아보기
- 이전 글: 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」
- 다음 글: 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」
- [Nand2Tetris](https://www.nand2tetris.org/): 직접 만든 CPU용 어셈블러를 작성하는 과제가 들어 있는 공개 강좌다.
