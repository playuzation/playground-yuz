# [CPU 마이크로아키텍처 4/12] 비순차 실행: 레지스터 이름 바꾸기와 토마술로 알고리즘

> **한 줄 요약** — 순서대로 실행하는 코어에서는 지연이 긴 명령어 하나가 뒤의 독립 명령어까지 막지만, 토마술로 알고리즘(1967, IBM System/360 Model 91)은 레지스터 이름을 예약 스테이션의 태그로 바꿔 가짜 의존(WAR·WAW)을 지우고, 피연산자가 공통 데이터 버스로 도착하는 대로 실행해 진짜 의존(RAW)만 기다리게 한다.

## 이 글에서 다루는 것
- 순서대로 실행하면 긴 지연이 뒤를 막는 문제
- 진짜 의존(RAW)과 가짜 의존(WAR·WAW), 레지스터 이름 바꾸기
- 예약 스테이션·공통 데이터 버스·태그: 토마술로 알고리즘
- 파이썬 시뮬레이터의 발행·실행·쓰기 사이클 표, 순서대로 실행과 비교
- 순차 실행 결과·데이터 흐름 식과의 대조

## 순서대로 실행하면 막히는 곳
2편 「파이프라인 해저드: 포워딩과 스톨을 사이클 단위로」의 파이프라인은 명령어를 프로그램 순서대로 실행하므로, 앞 명령어가 피연산자를 기다리면 상관없는 뒤 명령어도 함께 멈춘다. 컴파일러가 독립인 명령어를 앞당기는 방법은 지연을 미리 알 때만 통하는데, 캐시 미스는 실행해 봐야 알고 수백 사이클이 걸린다. **비순차 실행**(out-of-order execution)은 이 배치를 실행 중에 하드웨어가 해서, 준비된 뒤 명령어를 먼저 실행한다.

## 진짜 의존과 가짜 의존
배열 원소에 상수를 곱해 더하는 반복문을 두 번 펼친 코드를 보자(RISC-V 비슷한 문법, `f`는 실수 레지스터).
```text
i1 fld  f0,0(x1)
i2 fmul f4,f0,f2   RAW f0 (i1)
i3 fadd f6,f6,f4   RAW f4 (i2)
i4 fld  f0,8(x1)   WAR f0 (i2)
i5 fmul f4,f0,f2   WAW f4 (i2)
i6 fadd f6,f6,f4   RAW f6 (i3)
```
- **RAW**(read after write, 진짜 의존): i2는 i1이 읽어 온 값이 있어야 한다. 데이터가 실제로 흐른다.
- **WAR**(write after read): i4가 f0을 먼저 덮어쓰면 i2가 엉뚱한 값을 읽는다.
- **WAW**(write after write): i2가 i5보다 늦게 f4를 쓰면 최종 값이 틀린다.

WAR과 WAW에서는 데이터가 흐르지 않는다. ISA의 레지스터가 몇 개 안 되어 2회차가 같은 "이름"을 다시 썼을 뿐이다. 쓰기마다 새 이름을 붙이면 이 가짜 의존이 사라지는데, 이것이 **레지스터 이름 바꾸기**(register renaming)다.

## 토마술로 알고리즘
로버트 토마술로는 1967년 1월 IBM Journal of Research and Development에 「An Efficient Algorithm for Exploiting Multiple Arithmetic Units」를 발표했다. IBM System/360 Model 91의 부동소수점 장치에 쓰인 방식으로, System/360 ISA의 부동소수점 레지스터가 4개뿐이라 이름 재사용이 특히 심했다.
```text
  instruction queue
        │ issue (in order)
        ↓
┌───────────────────┐
│ RS Load1-2        │
│ RS Add1-3 Mult1-2 │
└──┬──────┬──────┬──┘
   ↓      ↓      ↓
  load   add    mult
   │      │      │
═══╧══════╧══════╧═══ CDB
  → waiting RS
  → register file
```
- **발행**(issue): 명령어를 순서대로 빈 **예약 스테이션**(RS, reservation station)에 넣는다. 원본 레지스터가 준비돼 있으면 값을, 계산 중이면 그 값을 만들 RS의 이름(태그)을 복사한다. 목적 레지스터의 상태 표에는 자기 태그를 적는다. 이제 그 레지스터의 최신 값은 "Mult1이 만들 값"이고, 이것이 이름 바꾸기다. 빈 RS가 없으면 발행이 멈춘다.
- **실행**(execute): 피연산자가 다 모이면 프로그램 순서와 상관없이 실행을 시작한다.
- **결과 쓰기**(write result): 결과를 태그와 함께 **공통 데이터 버스**(CDB, common data bus)로 방송한다. 그 태그를 기다리던 RS가 모두 값을 받고, 레지스터 파일은 상태 표가 아직 그 태그일 때만 값을 쓴다.

WAR은 읽는 쪽이 발행 때 값이나 태그를 복사해 가므로 사라지고, WAW는 레지스터 파일이 가장 최근 태그의 결과만 받으므로 사라진다. 남는 것은 RAW뿐이다.

## 토마술로 시뮬레이터
아래 시뮬레이터는 사이클마다 쓰기 → 실행 시작 → 발행 순으로 처리한다. 지연은 적재 2, 덧셈·뺄셈 2, 곱셈 10사이클로 가정하고, RS는 Load 2·Add 3·Mult 2개, CDB는 하나다. 결과를 확인할 수 있게 값도 실제로 계산한다(메모리에는 주소값이 있다고 친다). `in_order`는 실행 시작만 순서대로 하는 비교 대상이다.
```python
import random, re
from operator import add, sub, mul

LAT = {"fld": 2, "fadd": 2, "fsub": 2, "fmul": 10}       # 가정한 지연
UNIT = {"fld": "Load", "fadd": "Add", "fsub": "Add", "fmul": "Mult"}
FN = {"fadd": add, "fsub": sub, "fmul": mul}

def parse(line):          # "fmul f0,f2,f4" → ("fmul", "f0", ["f2", "f4"])
    op, dst, *a = [x for x in re.split(r"[,\s()]+", line) if x]
    return op, dst, ([int(a[0])] if op == "fld" else a)

def tomasulo(prog, regs, n_rs, cdb=1):
    R, Q = dict(regs), {}      # 레지스터 값, 이름 바꾸기 표(reg → 태그)
    rs, t, nxt, cyc = [], [{} for _ in prog], 0, 0
    while nxt < len(prog) or rs:
        cyc += 1
        fin = sorted((e for e in rs if e["end"] and e["end"] < cyc),
                     key=lambda e: e["i"])[:cdb]
        for e in fin:          # 공통 데이터 버스(CDB)로 결과 방송
            t[e["i"]]["write"] = cyc
            for w in rs:
                w["src"] = [(e["val"], cyc) if s == e["tag"] else s
                            for s in w["src"]]
            if Q.get(e["dst"]) == e["tag"]:
                R[e["dst"]] = e["val"]
                del Q[e["dst"]]
            rs.remove(e)
        for e in rs:           # 피연산자가 모두 오면 실행 시작
            if not e["end"] and all(type(s) is tuple and s[1] < cyc
                                    for s in e["src"]):
                v = [s[0] for s in e["src"]]
                e["val"] = v[0] if e["op"] == "fld" else FN[e["op"]](*v)
                e["end"] = cyc + LAT[e["op"]] - 1
                t[e["i"]]["exec"] = (cyc, e["end"])
        if nxt < len(prog):    # 순서대로 발행: 빈 예약 스테이션이 있어야
            op, dst, src = parse(prog[nxt])
            u = UNIT[op]
            used = {e["tag"] for e in rs}
            free = [f"{u}{k}" for k in range(1, n_rs[u] + 1)
                    if f"{u}{k}" not in used]
            if free:
                src = [(s, cyc) if op == "fld" else
                       Q.get(s, (R[s], cyc)) for s in src]
                rs.append(dict(i=nxt, op=op, dst=dst, tag=free[0],
                               src=src, end=None))
                Q[dst] = free[0]  # 이제 dst의 최신 값은 이 태그가 만든다
                t[nxt]["issue"] = cyc
                nxt += 1
    return R, t

def in_order(prog):        # 비교: 실행 시작만 순서대로
    ready, s, end = {}, 1, 0
    for op, dst, src in map(parse, prog):
        s = max([s + 1] + [ready[r] + 1 for r in src if r in ready])
        ready[dst] = s + LAT[op]
        end = max(end, ready[dst])
    return end

prog = ["fld f0,0(x1)", "fmul f4,f0,f2", "fadd f6,f6,f4",   # 1회차
        "fld f0,8(x1)", "fmul f4,f0,f2", "fadd f6,f6,f4"]   # 2회차
regs = {f"f{k}": k + 1 for k in range(11)}
R, t = tomasulo(prog, regs, {"Load": 2, "Add": 3, "Mult": 2})
print("instr          issue  exec   write")
for line, e in zip(prog, t):
    x = "{}-{}".format(*e["exec"])
    print(f"{line:15}{e['issue']:4}  {x:>6}{e['write']:6}")
print("토마술로:", max(e["write"] for e in t), "사이클,",
      "순서대로:", in_order(prog), "사이클")
```
```text
instr          issue  exec   write
fld f0,0(x1)      1     2-3     4
fmul f4,f0,f2     2    5-14    15
fadd f6,f6,f4     3   16-17    18
fld f0,8(x1)      4     5-6     7
fmul f4,f0,f2     5    8-17    19
fadd f6,f6,f4     6   20-21    22
토마술로: 22 사이클, 순서대로: 33 사이클
```

i4는 i2가 도는 동안 5~6번 사이클에 실행된다. f0을 덮어썼지만 i2는 발행 때 태그 Load1을 받아 두었다. i5도 8번 사이클부터 i2와 겹쳐 돈다. i5는 17번 사이클에 끝났지만 18번 사이클의 CDB를 더 오래된 i3이 써서 19번 사이클에야 결과를 낸다. CDB도 나눠 쓰는 자원이다. 순서대로 실행하면 i4가 i3의 시작(16번 사이클)을 기다려 두 회차가 줄지어 33사이클, 토마술로는 22사이클이다.

## 결과와 시간을 대조하기
첫째, 순서를 바꿔 실행해도 최종 레지스터는 한 줄씩 순서대로 실행한 결과와 같아야 한다. 레지스터를 6개만 써서 WAR·WAW가 잦은 무작위 프로그램 300개로 본다. 둘째, RS와 CDB를 사실상 무한히 주면 쓰기 사이클은 "발행 다음 사이클과 모든 생산자의 쓰기 다음 사이클 중 늦은 때 시작해 지연만큼 걸린다"는 데이터 흐름 식과 같아야 한다. 앞 코드에 이어서 실행한다.
```python
def sequential(prog, regs):  # 정의 그대로: 한 줄씩 순서대로
    R = dict(regs)
    for line in prog:
        op, dst, src = parse(line)
        R[dst] = src[0] if op == "fld" else FN[op](*(R[s] for s in src))
    return R

def dataflow(prog):        # 자원이 무한할 때 각 명령어의 쓰기 사이클
    ready, w = {}, []
    for i, line in enumerate(prog):
        op, dst, src = parse(line)
        s = max([i + 2] + [ready[r] + 1 for r in src if r in ready])
        ready[dst] = s + LAT[op]
        w.append(ready[dst])
    return w

rng, F = random.Random(4), [f"f{k}" for k in range(6)]  # WAR·WAW가 잦다
big = {"Load": 99, "Add": 99, "Mult": 99}
ok_val = ok_time = True
for _ in range(300):
    prog = []
    for _ in range(12):
        op, d, a, b = rng.choice(["fld", "fadd", "fsub", "fmul"]), \
            *(rng.choice(F) for _ in range(3))
        prog.append(f"fld {d},{rng.randrange(64)}(x1)" if op == "fld"
                    else f"{op} {d},{a},{b}")
    R, _ = tomasulo(prog, regs, {"Load": 2, "Add": 3, "Mult": 2})
    ok_val &= R == sequential(prog, regs)
    _, t = tomasulo(prog, regs, big, cdb=99)
    ok_time &= [e["write"] for e in t] == dataflow(prog)
print("무작위 300개, 최종 레지스터 = 순차 실행:", ok_val)
print("자원 무한일 때 쓰기 사이클 = 데이터 흐름 식:", ok_time)
```
```text
무작위 300개, 최종 레지스터 = 순차 실행: True
자원 무한일 때 쓰기 사이클 = 데이터 흐름 식: True
```

이름 바꾸기를 일부러 망가뜨려 원본을 늘 레지스터 파일에서 읽게 하면 첫 검사가 바로 `False`가 된다. 두 번째 검사는 한계도 알려 준다. 자원이 무한해도 시간은 RAW 사슬, 즉 의존 그래프의 최장 경로보다 줄지 않는다.

## 코드에 주는 의미
- 이름 재사용은 하드웨어가 지워 주지만 진짜 의존 사슬은 직접 끊어야 한다. 위 예에서는 합을 f6 하나에 모으는 `fadd` 사슬이 끝까지 남았다. 누산기를 여러 개 두면 사슬이 갈라진다(7편 「실행 유닛과 포트: 지연 시간과 처리량은 다르다」).
- 비순차 실행은 동시에 들고 있는 명령어(창) 안에서만 순서를 바꾼다. 수백 사이클짜리 DRAM 미스를 다 숨기기에는 창이 모자라는 일이 많다. 창을 정하는 재정렬 버퍼는 5편 「재정렬 버퍼와 추측 실행: 틀린 미래를 되돌리는 법」에서 다룬다.
- 메모리를 통한 의존은 주소를 계산해야 알 수 있어 적재·저장 큐가 따로 맡는다. 저장 버퍼의 효과는 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」에서 다룬다.

세대별 변화도 있다. 원래 방식은 값을 RS에 직접 담았지만, 현대 코어는 대부분 큰 물리 레지스터 파일과 이름 바꾸기 표를 두고 RS에는 레지스터 번호만 적는다. 원리는 같고 구조는 5편에서 본다.

## 숫자로 보기
| 항목 | 값 | 기준 |
|---|---|---|
| System/360 실수 레지스터 | 4개 | ISA 정의 |
| Pentium Pro 예약 스테이션 | 20개 | 1995, P6 |
| Golden Cove ROB | μop 512개 | 2021, 인텔 발표 |
| 250사이클을 4폭으로 숨기기 | μop 1,000개 | 계산(가정) |

토마술로 알고리즘은 Pentium Pro(1995) 같은 1990년대 마이크로프로세서로 돌아왔다. 마지막 줄은 DRAM 미스 250사이클 동안 4폭 코어를 채우려면 μop 1,000개를 들고 있어야 한다는 계산으로, 오늘날 큰 축에 드는 창(512개)보다 크다.

## 어디에 쓰이나
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 토마술로는 명령어 의존 그래프를 실행 중에 위상 순서로 풀어 가는 장치이고, 데이터 흐름 식은 그 DAG의 최장 경로다.
- 트랜지스터에서 자연어까지 9편 「컴파일러: 식과 문장을 명령어로 바꾸기」: 컴파일러의 레지스터 할당이 이름을 재사용해 만든 가짜 의존을 하드웨어가 다시 지운다.
- GPU와 CUDA 1편 「GPU는 왜 다르게 생겼나: 지연을 숨기는 처리량 기계」: GPU는 한 스레드 안에서 순서를 바꾸는 대신 수많은 스레드를 번갈아 실행해 같은 지연을 숨긴다.

## 정리
- 순서대로 실행하면 긴 지연이 독립 명령어까지 막는다. 비순차 실행은 준비된 명령어부터 실행한다.
- WAR·WAW는 이름 재사용이 만든 가짜 의존이고, 토마술로 알고리즘은 RS 태그로 이름을 바꿔 이를 지운다. CDB가 결과를 방송해 기다리던 RS를 깨운다.
- 시뮬레이터에서 두 번 펼친 반복문은 순서대로 33사이클, 토마술로 22사이클이었고, 무작위 300개 프로그램에서 결과는 순차 실행과, 시간은 데이터 흐름 식과 일치했다.
- 남는 한계는 RAW 사슬(최장 경로)과 창의 크기다.

## 더 알아보기
- 이전 글: 3편 「분기 예측: 2비트 카운터에서 gshare와 TAGE까지」
- 다음 글: 5편 「재정렬 버퍼와 추측 실행: 틀린 미래를 되돌리는 법」
