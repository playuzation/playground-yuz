# [CPU 마이크로아키텍처 10/12] 메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다

> **한 줄 요약** — 코어는 저장을 저장 버퍼에 넣어 두고 뒤의 적재를 먼저 실행하므로 다른 코어에는 저장 → 적재 순서가 뒤집혀 보이고(x86-TSO), ARM·POWER는 더 많은 순서를 바꾸므로, 필요한 순서는 펜스·acquire/release·CAS로 명시해야 한다.

## 이 글에서 다루는 것
- 순차적 일관성(램포트 1979)과 저장 버퍼가 그것을 깨는 이유
- x86-TSO(수얼 외 2010)와 ARM·POWER의 약한 순서
- 리트머스 테스트 SB·MP의 가능한 결과를 모든 실행 순서로 나열하고 두 방법으로 대조
- 펜스, CAS·LL/SC, C11 `memory_order`와 x86 명령어의 대응(gcc 출력)

## 주소 하나의 문제에서 주소 여럿의 문제로
9편의 캐시 일관성은 주소 하나에 대한 약속이었다. 그런데 멀티스레드 코드는 "데이터를 쓰고, 다 썼다는 깃발을 세운다"처럼 주소 여러 개로 대화하고, 다른 코어가 깃발을 봤다면 데이터도 보여야 한다. 서로 다른 주소들의 접근이 다른 코어에 어떤 순서로 보이는지를 정한 규칙이 **메모리 일관성 모델**(memory consistency model)이다.

가장 직관적인 모델은 램포트가 1979년에 정의한 **순차적 일관성**(sequential consistency, SC)이다. 모든 스레드의 접근을 하나의 줄로 섞되, 각 스레드 안의 순서는 프로그램 순서 그대로인 실행만 허용한다.

## 저장 버퍼
SC를 그대로 지키면 느리다. 저장이 캐시 미스면 9편의 BusRdX처럼 다른 코어의 사본을 무효화하고 응답을 받을 때까지 오래 걸린다. 그래서 코어는 저장을 **저장 버퍼**(store buffer)에 넣어 두고 다음 명령으로 넘어간다. 뒤의 적재는 캐시에서 먼저 값을 읽고, 버퍼의 저장은 나중에 캐시에 반영된다. 자기 적재는 버퍼를 먼저 뒤져 자기가 쓴 값을 받는다(저장 전달).
```text
core 0             core 1
st x=1 → buffer    st y=1 → buffer
ld y   → cache     ld x   → cache
         (y=0)              (x=0)

buffers drain to the cache later
```
두 코어가 동시에 이렇게 하면 각자의 저장이 아직 버퍼에 있어 둘 다 상대 변수에서 0을 읽는다. 어떤 SC 순서로도 나올 수 없는 결과다. 인텔 SDM도 "적재는 다른 주소에 대한 앞선 저장과 순서가 바뀔 수 있다"고 명시한다. 수얼(Sewell) 등은 2010년 CACM 논문에서 이 동작을 "스레드마다 FIFO 저장 버퍼가 붙은 추상 기계"로 정식화했고, 이것이 **x86-TSO**다. x86은 저장 → 적재 하나만 바꾸고, ARM·POWER는 서로 다른 주소면 네 가지(적재-적재, 적재-저장, 저장-저장, 저장-적재)를 모두 바꿀 수 있다.

## 리트머스 테스트를 전부 나열하기
**리트머스 테스트**(litmus test)는 모델의 차이를 드러내는 작은 프로그램이다. 처음에 x = y = 0이다.
- **SB**(store buffering): 스레드 0은 `x=1; r0=y`, 스레드 1은 `y=1; r1=x`. 이상한 결과는 (r0, r1) = (0, 0).
- **MP**(message passing): 스레드 0은 `x=1; y=1`(데이터, 깃발), 스레드 1은 `r0=y; r1=x`. 이상한 결과는 깃발은 봤는데 데이터가 옛 값인 (1, 0).

모델을 "스레드 안에서 어떤 명령이 앞 명령을 앞지를 수 있나"로 정의하고 가능한 실행 순서를 모두 따라간다. SC는 앞지르기 없음, TSO는 적재가 다른 주소에 대한 앞선 저장을 앞지름, "약한" 모델(ARM·POWER의 단순화)은 펜스가 없고 주소가 다르면 무엇이든 앞지름이다. 출력의 O는 이상한 결과가 나올 수 있다는 뜻이다.
```python
def run_reorder(prog, may_pass):
    """may_pass(앞, 뒤)가 참이면 뒤 명령이 앞지른다. 모든 순서를 나열."""
    res, leaves = set(), [0]
    def go(done, mem, regs):
        if all(len(d) == len(t) for d, t in zip(done, prog)):
            res.add(tuple(sorted(regs.items())))
            leaves[0] += 1
            return
        for t, ops in enumerate(prog):
            for i, op in enumerate(ops):
                if i in done[t] or not all(
                        j in done[t] or may_pass(ops[j], op)
                        for j in range(i)):
                    continue
                d = done[:t] + (done[t] | {i},) + done[t + 1:]
                if op[0] == "st":
                    go(d, {**mem, op[1]: op[2]}, regs)
                elif op[0] == "ld":
                    go(d, mem, {**regs, op[2]: mem.get(op[1], 0)})
                else:
                    go(d, mem, regs)
    go(tuple(frozenset() for _ in prog), {}, {})
    return res, leaves[0]

SC = lambda a, b: False                            # 순서 그대로
TSO = lambda a, b: a[0] == "st" and b[0] == "ld" and a[1] != b[1]
WEAK = lambda a, b: "f" not in (a[0], b[0]) and a[1] != b[1]

F = ("f",)                                         # 펜스
tests = {
    "SB": ([("st", "x", 1), ("ld", "y", "r0")],
           [("st", "y", 1), ("ld", "x", "r1")]),
    "MP": ([("st", "x", 1), ("st", "y", 1)],
           [("ld", "y", "r0"), ("ld", "x", "r1")]),
}
odd = {"SB": (0, 0), "MP": (1, 0)}                 # 이상한 결과
tests["SB+fence"] = tuple([t[0], F, t[1]] for t in tests["SB"])
tests["MP+fence"] = tuple([t[0], F, t[1]] for t in tests["MP"])
for name, prog in tests.items():
    want = odd[name.split("+")[0]]
    row = []
    for mname, m in (("SC", SC), ("TSO", TSO), ("약한", WEAK)):
        outs, _ = run_reorder(prog, m)
        seen = any((dict(o)["r0"], dict(o)["r1"]) == want for o in outs)
        row.append(f"{mname} {'O' if seen else 'X'}")
    print(f"{name:8} {want}: " + "  ".join(row))
```
```text
SB       (0, 0): SC X  TSO O  약한 O
MP       (1, 0): SC X  TSO X  약한 O
SB+fence (0, 0): SC X  TSO X  약한 X
MP+fence (1, 0): SC X  TSO X  약한 X
```

SB의 (0, 0)은 TSO에서 나오고 x86에서 실제로 관찰된다. MP의 (1, 0)은 TSO에서는 안 나온다. x86은 저장끼리, 적재끼리 순서를 지키므로 "데이터 쓰고 깃발 세우기"가 펜스 없이 동작하지만, 같은 코드가 ARM에서는 깃발만 보고 옛 데이터를 읽을 수 있다. 펜스를 넣으면 세 모델 모두 이상한 결과가 사라진다.

앞 코드에 이어서, 수얼 등의 정의대로 FIFO 저장 버퍼와 메모리 하나로 된 추상 기계를 만들어 같은 테스트를 돌리고, SC의 실행 순서 수를 조합 공식과 비교한다.
```python
def run_store_buffer(prog):
    """x86-TSO 추상 기계: 스레드마다 FIFO 저장 버퍼, 메모리 하나."""
    res = set()
    def go(pc, bufs, mem, regs):
        if all(p == len(t) for p, t in zip(pc, prog)) and not any(bufs):
            res.add(tuple(sorted(regs.items())))
        for t, ops in enumerate(prog):
            if bufs[t]:                            # 가장 오래된 저장 반영
                (a, v), rest = bufs[t][0], bufs[t][1:]
                go(pc, bufs[:t] + (rest,) + bufs[t + 1:],
                   {**mem, a: v}, regs)
            if pc[t] == len(ops):
                continue
            op, p = ops[pc[t]], pc[:t] + (pc[t] + 1,) + pc[t + 1:]
            if op[0] == "st":                      # 버퍼에만 넣는다
                b = bufs[:t] + (bufs[t] + ((op[1], op[2]),),) + bufs[t + 1:]
                go(p, b, mem, regs)
            elif op[0] == "ld":                    # 내 버퍼 먼저 본다
                mine = [v for a, v in bufs[t] if a == op[1]]
                v = mine[-1] if mine else mem.get(op[1], 0)
                go(p, bufs, mem, {**regs, op[2]: v})
            elif not bufs[t]:                      # 펜스: 버퍼가 비어야
                go(p, bufs, mem, regs)
    go((0,) * len(prog), ((),) * len(prog), {}, {})
    return res

same = all(run_store_buffer(p) == run_reorder(p, TSO)[0]
           for p in tests.values())
print("저장 버퍼 기계 = 저장→적재만 앞지르기:", same)
print("SB의 SC 실행 순서:", run_reorder(tests["SB"], SC)[1],
      "= 4!/(2!·2!) =", 24 // 4)
```
```text
저장 버퍼 기계 = 저장→적재만 앞지르기: True
SB의 SC 실행 순서: 6 = 4!/(2!·2!) = 6
```
네 테스트 모두 두 방법의 결과 집합이 같다. 다만 스레드가 자기 저장을 다시 읽는 테스트에서는 저장 전달 때문에 버퍼 기계에서만 나오는 결과가 있어(직접 돌려 확인했다), 정식 x86-TSO는 버퍼 기계로 정의된다.

## 펜스와 원자적 연산
**펜스**(fence)는 앞의 접근이 다 보이기 전에 뒤의 접근을 시작하지 못하게 한다. x86의 `mfence`와 `lock` 접두사 명령, ARM의 `dmb`가 그것이다. 전체 펜스보다 가벼운 것이 **acquire/release**다. release 저장은 앞의 접근이 그 뒤로 내려가지 못하게, acquire 적재는 뒤의 접근이 그 앞으로 올라오지 못하게 막는다. MP의 깃발 쓰기를 release로, 깃발 읽기를 acquire로 하면 충분하다. ARMv8은 이를 `stlr`, `ldar` 명령으로 직접 제공한다.

여러 스레드가 같은 값을 읽고-고치고-쓰려면 끼어들 수 없는 **원자적 연산**이 필요하다. x86은 `lock cmpxchg`로 **비교 후 교환**(CAS, compare-and-swap)을 한다. 값이 기대한 값일 때만 새 값을 쓰고 성공 여부를 돌려준다. ARM·RISC-V·POWER는 **LL/SC**(load-linked/store-conditional)를 쓴다. 적재 때 라인에 예약을 걸고, 그사이 다른 코어가 그 라인을 써서 9편의 무효화가 오면 조건부 저장이 실패한다. ARMv8.1은 CAS와 원자적 덧셈 명령도 더했다.
```c
#include <stdio.h>
#include <stdatomic.h>
#include <pthread.h>

#define THREADS 4
#define ITERS 100000

static atomic_long count;

static void *work(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERS; i++) {
        long old = atomic_load_explicit(&count, memory_order_relaxed);
        /* 실패하면 old가 현재 값으로 바뀌므로 그대로 다시 시도 */
        while (!atomic_compare_exchange_weak(&count, &old, old + 1))
            ;
    }
    return NULL;
}

int main(void) {
    pthread_t t[THREADS];
    for (int i = 0; i < THREADS; i++)
        pthread_create(&t[i], NULL, work, NULL);
    for (int i = 0; i < THREADS; i++)
        pthread_join(t[i], NULL);
    printf("CAS loop: %ld (expected %d)\n", (long)count, THREADS * ITERS);
    return 0;
}
```
```text
CAS loop: 400000 (expected 400000)
```
일반 `long`에 `++`를 하면 컨테이너에서 실행할 때마다 40만보다 한참 작은 다른 값이 나왔다. 읽기와 쓰기 사이에 다른 코어의 쓰기가 끼어 갱신이 사라진다. `atomic_fetch_add`는 x86에서 `lock xadd` 한 명령으로 같은 일을 한다.

C11의 `memory_order`(C++의 `std::memory_order`도 같다)는 이 하드웨어 차이를 감추는 층이다. gcc 13.3 `-O2`(x86-64)로 원자적 연산 함수들을 컴파일해 핵심 명령만 발췌했다.
```text
store release: movl %edi, x(%rip)
store seq_cst: xchgl x(%rip), %edi
load acquire: movl x(%rip), %eax
fetch_add: lock xaddl %eax, x(%rip)
CAS: lock cmpxchgl %esi, x(%rip)
fence seq_cst: lock orq $0, (%rsp)
```
x86은 TSO라서 acquire 적재와 release 저장이 평범한 `mov`다. 비용이 드는 것은 저장 → 적재 순서까지 막는 seq_cst 저장과 펜스뿐이고, gcc는 `mfence` 대신 `xchg`와 `lock or`를 쓴다(`lock` 명령은 저장 버퍼를 비우는 완전한 펜스다). 같은 C 코드가 ARMv8에서는 `ldar`·`stlr`·`dmb`가 된다. x86에서 우연히 돌아가는 코드가 ARM에서 깨지지 않게 하려면 필요한 순서를 `memory_order`로 정확히 적어야 한다.

## 숫자로 보기
| 아키텍처 | 허용 재정렬 | 순서 명령 |
|---|---|---|
| x86-64(TSO) | 저장 → 적재만 | mfence, lock 접두사 |
| ARMv8 | 네 가지 모두 | dmb, ldar/stlr |
| POWER | 네 가지 모두 | sync, lwsync |
| RISC-V(RVWMO) | 네 가지 모두 | fence |

- "네 가지 모두"도 같은 주소끼리의 순서, 주소·데이터 의존이 있는 순서는 지킨다. 독립인 접근만 바뀐다.

## 어디에 쓰이나
- 언어 기초 8편 「자바와 JVM: 한 번 작성하면 어디서나 실행」: 자바의 `volatile` 접근은 순차적 일관성으로 보여야 해서, JVM은 x86에서 `volatile` 쓰기 뒤에 펜스를 넣는다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 운영체제의 스핀락과 뮤텍스는 CAS·xchg와 acquire/release로 만들며, x86-TSO 논문도 리눅스 스핀락을 이 모델로 따졌다.

## 정리
- 일관성 모델은 서로 다른 주소들의 접근이 다른 코어에 보이는 순서를 정하며, 가장 엄격한 것은 순차적 일관성이다.
- 저장 버퍼 때문에 x86에서도 저장 → 적재가 뒤집혀 보이고(SB의 0, 0), ARM·POWER는 MP의 (1, 0)까지 허용한다.
- 리트머스 테스트의 모든 실행 순서를 나열하면 모델별 허용 결과를 정확히 셀 수 있다.
- 순서는 펜스·acquire/release로, 읽고-고치고-쓰기는 CAS·LL/SC로 명시하고, C11 `memory_order`가 이를 ISA별 명령으로 옮긴다.

## 더 알아보기
- 이전 글: 9편 「캐시 일관성: MESI 프로토콜과 거짓 공유」
- 다음 글: 11편 「멀티코어와 SMT: 하이퍼스레딩, 코어 연결망, NUMA」
- x86-TSO 논문(Sewell 외, CACM 2010): https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf
