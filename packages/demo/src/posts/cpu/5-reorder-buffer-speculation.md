# [CPU 마이크로아키텍처 5/12] 재정렬 버퍼와 추측 실행: 틀린 미래를 되돌리는 법

> **한 줄 요약** — 재정렬 버퍼(ROB)는 순서 없이 끝난 명령어를 프로그램 순서대로만 은퇴시키고, 예측이 틀리면 젊은 명령어를 버리고 이름 바꾸기 표를 되돌려 코어가 예측을 믿고 앞질러 실행하게 하지만, 버린 명령어가 캐시에 남긴 흔적은 되돌리지 못해 스펙터·멜트다운(2018)이 생겼다.

## 이 글에서 다루는 것
- 비순차로 끝나는 명령어와 정밀한 예외 문제
- 재정렬 버퍼, 물리 레지스터 파일, 이름 바꾸기 표(RAT)와 빈 목록
- 추측 실행: 틀린 경로 비우기와 RAT 복구
- 파이썬 ROB 시뮬레이션: 은퇴 시점, ROB가 찰 때, 틀린 경로와 예외
- 스펙터·멜트다운의 원리(공격 코드 없음)

## 순서 없이 끝나면 생기는 문제
4편 「비순차 실행: 레지스터 이름 바꾸기와 토마술로 알고리즘」의 토마술로 방식은 결과가 나오는 즉시 레지스터 파일에 썼다. 그런데 앞의 적재가 페이지 폴트를 내면, 운영체제가 폴트를 처리하고 그 명령어부터 다시 실행하려 해도 뒤 명령어들이 이미 레지스터를 고쳐 놓았다. 예외가 났을 때 "그 앞 명령어는 모두 끝났고 그 뒤는 하나도 실행되지 않은" 상태를 보여 주는 것을 **정밀한 예외**(precise exception)라고 한다. 분기 예측도 같은 문제다. 예측을 믿고 실행한 명령어의 결과는 예측이 맞았다고 판명될 때까지 확정하면 안 된다.

## 재정렬 버퍼와 물리 레지스터
제임스 스미스와 앤드루 플레스쿤은 1985년 ISCA 논문에서 **재정렬 버퍼**(ROB, reorder buffer)를 제안했다. 명령어를 발행 순서대로 원형 버퍼 꼬리에 넣고, 실행은 순서 없이 끝나도 되지만, 머리부터 순서대로 끝난 것만 **은퇴**(retire, commit)시켜 구조적 상태를 고친다.

현대 코어는 여기에 **물리 레지스터 파일**(PRF)을 붙인다. ISA 레지스터보다 훨씬 많은 물리 레지스터를 두고, 이름 바꾸기 표(RAT, register alias table)가 "지금 r1의 최신 값은 p9에 있다"를 기록한다. MIPS R10000(1996)이 정수·실수 물리 레지스터를 각 64개 두고 이 방식을 썼다.
```text
     allocate          retire
        ↓                ↑
ROB: [ i8 i7 i6 i5 i4 i3 i2 i1 ]
      tail                head
entry: dst, new p, old p, done

RAT spec  : r1→p9   r3→p12
RAT retire: r1→p1   r3→p3
free list : p13 p14 p15 ...
```
- **할당**: 목적 레지스터마다 빈 목록에서 새 물리 레지스터를 받아 RAT에 적고, ROB 항목에 옛 번호도 적어 둔다.
- **은퇴**: 머리 항목이 끝났으면 은퇴 RAT(구조적 상태)를 새 번호로 고치고, 이제 아무도 읽지 않는 옛 물리 레지스터를 돌려준다.
- **틀린 예측**: ROB 꼬리부터 그 분기까지 거슬러 오며 RAT를 옛 번호로 되돌리고 새 번호를 돌려준다.
- **예외**: 머리의 명령어가 폴트를 내면 RAT를 은퇴 RAT로 통째로 되돌리고 나머지를 다 버린다.

## ROB 시뮬레이션
아래 시뮬레이터는 위 네 동작을 옮겼다. 사이클마다 분기 판명 → 은퇴 → 할당 순으로 처리하고, ROB는 6칸, 할당·은퇴 폭은 2개다. 실행 유닛은 넉넉하다고 보고, 할당 다음 사이클과 피연산자 준비 중 늦은 때 시작한다. `@20`은 지연 20사이클(캐시 미스), `miss`는 예측이 틀릴 분기, `fault`는 은퇴하면 예외를 내는 명령어다. 틀린 분기 뒤에는 판명될 때까지 `wrong`의 틀린 경로를 인출한다.
```python
import random

M, LAT = 0xFFFFFFFF, {"add": 1, "sub": 1, "mul": 3, "ld": 4, "br": 1}
def parse(line):      # "ld r1,r8 @20", "br r5 miss", "ld r4,r3 fault"
    t = line.replace(",", " ").split()
    regs = [x for x in t[1:] if x[0] == "r"]
    lat = next((int(x[1:]) for x in t if x[0] == "@"), LAT[t[0]])
    dst = None if t[0] == "br" else regs.pop(0)
    return t[0], dst, regs, lat, "miss" in t, "fault" in t

def alu(op, v):
    if op == "ld": return (v[0] * 2654435761 + 1) & M   # 가짜 메모리
    return {"add": sum(v), "sub": v[0] - v[-1], "mul": v[0] * v[-1],
            "br": 0}[op] & M

def run(prog, wrong, regs, rob_size=6, width=2, P=48):
    rat = {r: i for i, r in enumerate(regs)}  # 이름 바꾸기 표(추측 상태)
    rrat = dict(rat)                          # 은퇴 RAT(구조적 상태)
    val = list(regs.values()) + [0] * (P - len(regs))
    ready, free = [0] * P, list(range(len(regs), P))
    rob, pc, wi, cyc, log, full = [], 0, 0, 0, {}, 0
    while pc < len(prog) or rob:
        cyc += 1
        for k, e in enumerate(rob):     # 분기 판명: 틀렸으면 꼬리부터 되돌림
            if e["miss"] and e["done"] <= cyc:
                e["miss"] = False
                for y in reversed(rob[k + 1:]):
                    if y["dst"]:
                        rat[y["dst"]] = y["old"]
                        free.append(y["new"])
                    log[y["id"]][2] = "flush"
                del rob[k + 1:]
        for _ in range(width):          # 은퇴: 머리부터 순서대로
            if not rob or rob[0]["done"] >= cyc: break
            e = rob.pop(0)
            if e["fault"]:              # 정밀한 예외: 나머지는 모두 버림
                rat, rob = dict(rrat), []
                free = [p for p in range(P) if p not in rrat.values()]
                return ({r: val[p] for r, p in rrat.items()}, e["text"],
                        log, free, full)
            if e["dst"]:
                rrat[e["dst"]] = e["new"]
                free.append(e["old"])
            log[e["id"]][2] = cyc
        for _ in range(width):          # 할당: ROB에 자리가 있어야
            spec = any(e["miss"] for e in rob)
            if not spec and pc == len(prog): break
            if len(rob) == rob_size:
                full += 1
                break
            text = wrong[wi % len(wrong)] if spec else prog[pc]
            wi, pc = wi + spec, pc + (not spec)
            op, dst, src, lat, miss, fault = parse(text)
            ps = [rat[r] for r in src]
            e = dict(id=len(log), text=text, dst=dst, fault=fault,
                     miss=miss and not spec,
                     done=max([cyc + 1] + [ready[p] for p in ps]) + lat)
            if dst:                     # 새 물리 레지스터를 받는다
                e["old"], e["new"] = rat[dst], free.pop(0)
                rat[dst] = e["new"]
                val[e["new"]] = alu(op, [val[p] for p in ps])
                ready[e["new"]] = e["done"]
            log[e["id"]] = [text, cyc, None, e["done"]]
            rob.append(e)
    return {r: val[p] for r, p in rrat.items()}, None, log, free, full

regs = {f"r{k}": k for k in range(1, 9)}
prog = ["ld r1,r8 @20", "add r2,r3,r4", "mul r5,r2,r2", "br r5 miss",
        "add r6,r1,r2", "sub r7,r6,r3"]
wrong = ["add r3,r3,r3", "ld r4,r3 fault"]      # 틀린 경로
state, fault, log, free, full = run(prog, wrong, regs)
print("instr           alloc  done  retire")
for text, a, r, d in log.values():
    print(f"{text:15}{a:6}{d:6}{r:>8}")
print("ROB가 차서 할당을 멈춘 횟수:", full, " r3 =", state["r3"])
```
```text
instr           alloc  done  retire
ld r1,r8 @20        1    22      23
add r2,r3,r4        1     3      23
mul r5,r2,r2        2     6      24
br r5 miss          2     7      24
add r3,r3,r3        3     5   flush
ld r4,r3 fault      3     9   flush
add r6,r1,r2        7    23      25
sub r7,r6,r3        7    24      25
ROB가 차서 할당을 멈춘 횟수: 3  r3 = 3
```

캐시 미스 적재(`ld r1`)가 22번 사이클에야 끝나므로, 3번 사이클에 끝난 `add r2`도 23번 사이클까지 은퇴하지 못한다. 그사이 ROB 6칸이 차서 4~6번 사이클에는 할당이 멈췄다. ROB 크기가 4편에서 말한 "창"이다. 분기는 7번 사이클에 틀렸다고 판명된다. 틀린 경로의 `add r3,r3,r3`은 실제로 실행되어 새 물리 레지스터에 값을 썼지만, RAT가 되돌려져 `sub r7,r6,r3`은 원래 r3(=3)을 읽었다. 틀린 경로의 `ld r4,r3 fault`는 은퇴하지 않았으므로 예외도 일어나지 않은 일이 된다.

## 순차 실행과 대조하기
은퇴한 구조적 상태는 맞는 경로를 한 줄씩 실행한 결과와 같아야 하고, 예외가 나면 그 명령어 직전에서 멈춘 상태와 같아야 한다. 또 물리 레지스터가 새거나 두 번 돌려지면 안 된다. 무작위 프로그램 300개를 ROB 크기와 폭을 바꿔 가며 돌린다. 틀린 경로에는 폴트를 30% 확률로 섞었다. 앞 코드에 이어서 실행한다.
```python
def sequential(prog, regs):     # 맞는 경로를 순서대로, 예외에서 멈춤
    R = dict(regs)
    for text in prog:
        op, dst, src, lat, miss, fault = parse(text)
        if fault: return R, text
        if dst: R[dst] = alu(op, [R[r] for r in src])
    return R, None

prog2 = prog[:5] + ["ld r7,r6 fault", "add r2,r2,r2"]
state, fault, *_ = run(prog2, wrong, regs)
print("예외:", fault, "/ 상태 = 순차 실행:",
      (state, fault) == sequential(prog2, regs))

rng = random.Random(5)
def rand_ins(p_fault):
    a, b, c = (f"r{rng.randint(1, 8)}" for _ in range(3))
    op = rng.choice(["add", "sub", "mul", "ld", "br"])
    s = f"br {a}" if op == "br" else f"{op} {a},{b},{c}"
    if op == "ld": s += f" @{rng.choice([4, 4, 30])}"
    if op == "br" and rng.random() < 0.5: s += " miss"
    return s + (" fault" if rng.random() < p_fault else "")
ok = True
for _ in range(300):
    pr = [rand_ins(0.02) for _ in range(20)]
    wr = [rand_ins(0.3) for _ in range(5)]
    state, fault, log, free, full = run(pr, wr, regs,
                                        rng.randint(2, 16), rng.randint(1, 4))
    ok &= (state, fault) == sequential(pr, regs)
    ok &= len(set(free)) == len(free) == 48 - len(regs)  # 누수 없음
print("무작위 300개: 상태·예외 지점 = 순차 실행, 누수 없음:", ok)
```
```text
예외: ld r7,r6 fault / 상태 = 순차 실행: True
무작위 300개: 상태·예외 지점 = 순차 실행, 누수 없음: True
```

RAT 되돌리기를 빼거나 옛 물리 레지스터를 돌려주지 않게 바꾸면 이 검사가 `False`가 된다.

## 스펙터와 멜트다운: 버린 미래의 흔적
ROB는 구조적 상태를 완벽히 되돌리지만 마이크로아키텍처 상태까지 되돌리지는 않는다. 위의 틀린 경로 적재도 실제로 실행되었다. 실제 코어라면 이 적재가 캐시에 줄을 채우고, 그 줄은 비우기 뒤에도 남는다. 공격자는 나중에 어느 줄이 빨리 읽히는지 시간을 재어, 버려진 명령어가 무엇을 읽었는지 거꾸로 알아낸다. 2018년 1월 3일 함께 공개된 두 취약점이 이 원리다.
- **스펙터**(Spectre, 코허 외): 분기 예측기를 길들여 피해 프로그램이 경계 검사 분기를 잘못 예측하게 만들고, 그 틀린 경로에서 범위 밖 비밀을 읽어 캐시에 흔적을 남기게 한다.
- **멜트다운**(Meltdown, 립 외): 영향받는 코어에서는 권한 없는 커널 주소를 읽는 적재가 은퇴 때 폴트로 판명되기 전에, 그 값을 뒤의 추측 명령어에 넘겨 주었다. 위 시뮬레이션의 `ld r4,r3 fault`가 값을 만든 뒤 버려진 것과 같은 창이다.

대책은 층마다 있다. 리눅스 같은 운영체제는 사용자 모드에서 커널 페이지 테이블을 감추고(KPTI), 컴파일러는 간접 분기를 바꾸거나(retpoline) 경계 검사 뒤에 추측을 막는 명령어(x86 `lfence`)나 인덱스 마스킹을 넣는다. 이후 세대 코어는 하드웨어에서도 일부를 막는다. 모두 성능과 맞바꾸는 대책이다.

## 숫자로 보기
ROB 항목 수(제조사 발표·공식 자료 기준)는 세대마다 커졌다.

| 코어 | 연도 | ROB |
|---|---|---|
| Pentium Pro | 1995 | 40 |
| MIPS R10000 | 1996 | 32(활성 목록) |
| Skylake | 2015 | 224 |
| Sunny Cove | 2019 | 352 |
| Golden Cove | 2021 | 512 |
| Zen 4 | 2022 | 320 |

창이 크면 긴 미스 동안 더 많은 독립 명령어를 찾지만, 예측이 틀렸을 때 버리는 일도 많아진다. 그래서 창을 키울수록 3편 「분기 예측: 2비트 카운터에서 gshare와 TAGE까지」의 예측 정확도가 더 중요해진다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 페이지 폴트를 처리하고 같은 명령어부터 다시 실행할 수 있는 것은 하드웨어가 정밀한 예외를 보장하기 때문이다.
- 추상 데이터 타입 심화 19편 「퍼시스턴트 자료 구조: 경로 복사와 함수형 큐」: 은퇴 RAT를 확정된 버전으로 두고 추측 RAT에서 실험하다 버리는 구조가, 옛 버전을 남겨 두고 언제든 돌아가는 퍼시스턴트 자료 구조와 닮았다.

## 정리
- 정밀한 예외와 추측 실행을 위해, 결과는 순서 없이 내되 구조적 상태는 ROB 머리부터 순서대로만 고친다.
- 물리 레지스터와 RAT로 이름을 바꾸고, ROB에 옛 번호를 적어 두어 틀린 예측은 꼬리부터 되돌리고 예외는 은퇴 RAT로 되돌린다.
- 시뮬레이터에서 캐시 미스가 머리를 막자 ROB가 차서 할당이 멈췄고, 무작위 300개 프로그램의 구조적 상태와 예외 지점이 순차 실행과 모두 일치했다.
- 버린 명령어의 캐시 흔적은 남아서 스펙터·멜트다운이 생겼고, 대책은 운영체제·컴파일러·하드웨어에 나뉘어 있다.

## 더 알아보기
- 이전 글: 4편 「비순차 실행: 레지스터 이름 바꾸기와 토마술로 알고리즘」
- 다음 글: 6편 「명령어 해독과 마이크로 연산: 가변 길이 x86을 고정 폭 내부 연산으로」
- 스미스·플레스쿤의 정밀한 인터럽트 논문(1988년 저널판): https://www.cs.virginia.edu/~evans/greatworks/smith.pdf
