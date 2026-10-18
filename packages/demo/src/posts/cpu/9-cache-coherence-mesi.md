# [CPU 마이크로아키텍처 9/12] 캐시 일관성: MESI 프로토콜과 거짓 공유

> **한 줄 요약** — 코어마다 캐시가 있으면 같은 주소의 사본이 여럿 생기므로, 하드웨어는 라인마다 M·E·S·I 상태를 두고 버스를 엿들어 "쓰는 코어는 하나, 읽는 코어는 여럿"을 지키며, 그 대가로 서로 다른 변수라도 같은 64바이트 라인에 있으면 쓰기마다 라인이 코어 사이를 오가는 거짓 공유가 생긴다.

## 이 글에서 다루는 것
- 사본 문제와 일관성의 두 조건, 스누핑과 디렉터리
- MESI 네 상태와 전이(파파마르코스·파텔 1984)
- 파이썬 MESI 시뮬레이터: 상태 변화와 버스 메시지, 무작위 트레이스로 불변식 검사
- 거짓 공유: 메시지 수를 공식과 대조, C의 `_Alignas(64)` 패딩

## 사본이 여럿이면 생기는 문제
코어마다 L1·L2를 두면 같은 메모리 라인이 여러 캐시에 복사된다. 캐시는 쓰기를 바로 메모리로 보내지 않는 되돌려 쓰기(write-back) 방식이라, 코어 0이 `x = 1`을 자기 L1에만 써 두면 코어 1은 자기 캐시나 메모리에서 옛 값 0을 읽는다. 하드웨어가 이것을 막는 규칙이 **캐시 일관성**(cache coherence)이고, 한 주소에 대해 두 가지를 보장한다.

- **단일 쓰기 또는 다중 읽기**: 어느 순간이든 그 라인을 쓸 수 있는 코어는 하나뿐이거나, 아무도 쓰지 않고 여럿이 읽기만 한다.
- **값의 전파**: 읽기는 그 주소에 마지막으로 쓴 값을 돌려준다.

일관성은 주소 하나에 대한 약속이다. 서로 다른 주소들의 쓰기가 다른 코어에 어떤 순서로 보이는지는 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」에서 다루는 별개의 문제다.

## 스누핑과 디렉터리
```text
┌──────┐ ┌──────┐ ┌──────┐
│  P0  │ │  P1  │ │  P2  │
│  L1  │ │  L1  │ │  L1  │
└──┬───┘ └──┬───┘ └──┬───┘
───┴────────┴────────┴──── bus
            │
        ┌───┴────┐
        │ memory │
        └────────┘
```
**스누핑**(snooping)은 모든 캐시가 공유 버스를 엿듣는 방식이다. 미스나 쓰기 의도가 버스에 방송되면 각 캐시가 자기 사본의 상태를 고친다. 단순하지만 코어가 늘면 방송이 버스를 메운다. **디렉터리**(directory) 방식은 라인마다 "어느 코어가 사본을 가졌나"를 기록해 두고 필요한 코어에만 메시지를 보낸다. 코어가 수십 개인 서버 칩은 L3 옆에 이런 기록(스누프 필터, 디렉터리)을 두어 방송을 줄인다. 연결망은 11편에서 본다.

## MESI 네 상태
라인마다 상태 비트 2개를 태그 옆에 둔다. 일리노이 대학의 파파마르코스와 파텔이 1984년 ISCA에서 발표한, 공유 버스 하나에 개인 캐시를 단 다중 프로세서의 버스 트래픽을 줄이는 프로토콜이 이 계열의 출발점이라 **일리노이 프로토콜**이라고도 부른다.

| 상태 | 뜻 | 이 코어가 쓰면 |
|---|---|---|
| M(수정) | 나만 가짐, 메모리와 다름 | 그냥 쓴다 |
| E(배타) | 나만 가짐, 메모리와 같음 | 조용히 M으로 |
| S(공유) | 여럿이 가짐, 깨끗함 | BusUpgr로 남의 사본 무효화 |
| I(무효) | 없음 | BusRdX로 읽으며 소유권 |

다른 코어의 메시지를 엿들었을 때는 이렇게 반응한다. 읽기(BusRd)를 들으면 M은 값을 내놓고(Flush) S가 되며, E도 S가 된다. 소유권 요청(BusRdX, BusUpgr)을 들으면 누구든 I가 된다. **E 상태**가 MSI보다 나은 점은, 아무도 안 가진 라인을 읽어 온 코어가 나중에 쓸 때 버스 메시지가 하나도 없다는 것이다. 한 스레드만 쓰는 개인 데이터는 대부분 이 경로를 탄다.

## 파이썬 MESI 시뮬레이터
용량이 무한한 캐시와 버스 하나를 두고, 메시지를 기록한다.
```python
import random

class Bus:
    """코어마다 캐시가 있고 버스 하나를 엿듣는 MESI 모델(용량 무한)."""
    def __init__(self, ncores):
        self.st = [{} for _ in range(ncores)]   # 코어별 {라인: 상태}
        self.val = [{} for _ in range(ncores)]  # 코어별 {라인: 값}
        self.mem, self.log = {}, []             # 메모리, 버스 메시지

    def holders(self, c, line):
        return [o for o in range(len(self.st))
                if o != c and self.st[o].get(line, "I") != "I"]

    def snoop(self, line, msg, c, new_state):
        self.log.append(msg)
        for o in self.holders(c, line):
            if self.st[o][line] == "M":         # 더러운 사본은 내놓는다
                self.log.append("Flush")
                self.mem[line] = self.val[o][line]
            self.st[o][line] = new_state

    def read(self, c, line):
        if self.st[c].get(line, "I") == "I":    # 읽기 미스
            shared = bool(self.holders(c, line))
            self.snoop(line, "BusRd", c, "S")
            self.st[c][line] = "S" if shared else "E"
            self.val[c][line] = self.mem.get(line, 0)
        return self.val[c][line]

    def write(self, c, line, v):
        s = self.st[c].get(line, "I")
        if s == "S":                            # 사본들을 무효화
            self.snoop(line, "BusUpgr", c, "I")
        elif s == "I":                          # 읽으며 소유권 얻기
            self.snoop(line, "BusRdX", c, "I")
        self.st[c][line], self.val[c][line] = "M", v  # E·M은 조용히

bus = Bus(3)
trace = [(0, "R"), (1, "R"), (0, "W"), (2, "R"), (2, "W"), (0, "R")]
for k, (c, op) in enumerate(trace):
    n = len(bus.log)
    bus.read(c, 0) if op == "R" else bus.write(c, 0, k)
    st = " ".join(bus.st[i].get(0, "I") for i in range(3))
    print(f"P{c} {op} -> {st}  {'+'.join(bus.log[n:]) or '-'}")
```
```text
P0 R -> E I I  BusRd
P1 R -> S S I  BusRd
P0 W -> M I I  BusUpgr
P2 R -> S I S  BusRd+Flush
P2 W -> I I M  BusUpgr
P0 R -> S I S  BusRd+Flush
```

P0이 처음 읽을 때는 아무도 없으니 E다. P1이 읽으면 둘 다 S가 되고, P0이 쓰려면 BusUpgr로 P1의 사본을 지워야 한다. P2가 읽을 때 M인 P0이 값을 내놓고(Flush) 둘 다 S가 된다. 상태 열을 보면 어느 줄에서도 M이나 E는 혼자다.

시뮬레이터가 일관성을 지키는지는 무작위로 확인한다. 앞 코드에 이어서, 코어 4개·라인 3개에 읽기·쓰기 40개짜리 트레이스 300개를 돌리며, 읽은 값이 "캐시가 없는 메모리 하나"에서 읽었을 값과 같은지, 매 순간 M·E가 혼자인지 검사한다.
```python
def check(seed, ncores=4, nlines=3, nops=40):
    rng, bus, ref = random.Random(seed), Bus(ncores), {}
    bad = 0
    for k in range(nops):
        c, line = rng.randrange(ncores), rng.randrange(nlines)
        if rng.random() < 0.5:
            bad += bus.read(c, line) != ref.get(line, 0)
        else:
            bus.write(c, line, k + 1)
            ref[line] = k + 1
        for ln in range(nlines):                # 단일 쓰기 또는 다중 읽기
            sts = [bus.st[i].get(ln, "I") for i in range(ncores)]
            excl = sum(s in "ME" for s in sts)
            bad += excl > 1 or (excl == 1 and sts.count("S") > 0)
    return bad

print("무작위 트레이스 300개, 값 불일치·불변식 위반:",
      sum(check(s) for s in range(300)))
```
```text
무작위 트레이스 300개, 값 불일치·불변식 위반: 0
```
무효화 한 줄(`self.st[o][line] = new_state`)을 지워 보면 이 검사는 위반을 수만 건 찾아낸다. 사본을 지우지 않으면 옛 값을 읽게 된다는 뜻이다.

## 거짓 공유
일관성은 **라인 단위**로 동작한다. 그래서 두 스레드가 서로 다른 변수 `a`, `b`를 고쳐도 둘이 같은 64바이트 라인에 있으면, 하드웨어 입장에서는 같은 라인을 두 코어가 번갈아 쓰는 것이다. 이것이 **거짓 공유**(false sharing)다. 앞 코드에 이어서, 두 코어가 각자 카운터를 1,000번 `++`(읽고 쓰기)할 때의 메시지를 센다(값은 세지 않는다).
```python
def counters(line_of, n=1000):
    """코어 0과 1이 각자 변수 a, b를 n번씩 ++, 번갈아 실행."""
    bus = Bus(2)
    for _ in range(n):
        for c, var in ((0, "a"), (1, "b")):
            bus.read(c, line_of[var])           # 읽고
            bus.write(c, line_of[var], 0)       # 쓴다
    return len(bus.log), bus.log.count("Flush")

n = 1000
same = counters({"a": 0, "b": 0})     # 같은 64바이트 라인(거짓 공유)
padded = counters({"a": 0, "b": 1})   # 패딩으로 다른 라인
print(f"같은 라인: 버스 메시지 {same[0]}, 그중 Flush {same[1]}")
print(f"다른 라인: 버스 메시지 {padded[0]}, 그중 Flush {padded[1]}")
print("공식 1 + 3(2n - 1)과 일치:", same[0] == 1 + 3 * (2 * n - 1))
```
```text
같은 라인: 버스 메시지 5998, 그중 Flush 1999
다른 라인: 버스 메시지 2, 그중 Flush 0
공식 1 + 3(2n - 1)과 일치: True
```

같은 라인이면 첫 `++` 하나(BusRd 1개, E에서 조용히 M)를 빼고 매번 BusRd, Flush, BusUpgr 세 메시지가 오가서 1 + 3(2n − 1) = 5,998개다. 다른 라인이면 각자 처음 한 번 읽어 E가 된 뒤 끝까지 조용하다. 실제 칩에서 이 메시지 하나하나가 코어 사이 왕복이라, 거짓 공유는 스레드를 늘릴수록 느려지는 프로그램의 단골 원인이다.

처방은 둘이다. 스레드마다 고치는 변수를 라인 경계로 띄우거나(패딩), 지역 변수에 모았다가 끝에 한 번만 공유 변수에 더한다. C11에서는 `_Alignas`로 띄운다.
```c
#include <stdio.h>
#include <stddef.h>

struct packed {                 /* 두 스레드가 a, b를 따로 고친다 */
    long a;
    long b;
};

struct padded {                 /* 각자 64바이트 라인 하나씩 */
    _Alignas(64) long a;
    _Alignas(64) long b;
};

int main(void) {
    printf("packed: b at %zu, size %zu, same line: %s\n",
           offsetof(struct packed, b), sizeof(struct packed),
           offsetof(struct packed, b) / 64 == 0 ? "yes" : "no");
    printf("padded: b at %zu, size %zu, same line: %s\n",
           offsetof(struct padded, b), sizeof(struct padded),
           offsetof(struct padded, b) / 64 == 0 ? "yes" : "no");
    return 0;
}
```
```text
packed: b at 8, size 16, same line: yes
padded: b at 64, size 128, same line: no
```
(구조체가 라인 경계에서 시작한다고 볼 때의 판정이다. `padded`는 정렬이 64라 늘 그렇다.) 메모리는 8배를 쓰지만 메시지는 수천 개에서 2개로 준다. 인텔 코어의 L2 공간 프리페처는 인접한 라인을 128바이트 짝으로 함께 가져오므로, 러스트 crossbeam의 `CachePadded`처럼 x86-64에서 128바이트로 띄우는 라이브러리도 있다.

흔한 오해 하나는 `volatile`이 캐시를 우회한다는 생각이다. 일반 메모리에 대한 일관성은 하드웨어가 늘 보장하고, `volatile`은 컴파일러가 접근을 없애거나 합치지 못하게 할 뿐이다. 멀티스레드에서 정말 필요한 것은 순서 보장이고, 그것은 10편의 원자적 연산과 펜스가 한다.

## 숫자로 보기
| 항목 | 값 | 기준 |
|---|---|---|
| 캐시 라인 | 64바이트 | x86-64(인텔·AMD) |
| 상태 비트 | 라인당 2비트 | MESI 4상태 |
| 공간 프리페처 단위 | 128바이트(라인 2개) | 인텔 코어 L2 |
| 카운터 2,000번 메시지 | 5,998 대 2 | 위 시뮬레이션 |

- 변형이 많다. AMD는 더러운 사본을 공유 상태로 남겨 메모리에 쓰지 않고 넘겨주는 O(Owned)를 더한 MOESI를, 인텔은 공유 사본 중 하나만 응답하게 하는 F(Forward)를 더한 MESIF를 쓴다. 상태 이름은 달라도 "쓰는 코어는 하나"라는 원칙은 같다.

## 어디에 쓰이나
- 메모리 시스템 2편 「SRAM과 캐시의 구조: 6T 셀, 태그·인덱스·오프셋」: MESI 상태 비트는 그 글의 태그 배열 옆에 라인마다 붙고, 엿듣기는 태그 비교 회로를 한 번 더 쓰는 일이다.
- 언어 기초 4편 「러스트: 가비지 컬렉터 없이 메모리 안전하게」: 러스트의 타입 시스템은 데이터 경쟁은 막지만 거짓 공유는 막지 못해서, 성능을 위한 패딩은 `CachePadded` 같은 도구로 따로 한다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 리눅스 커널은 CPU별(per-CPU) 변수와 라인 정렬 표시(`____cacheline_aligned`)로 코어 사이 라인 왕복을 줄인다.

## 정리
- 개인 캐시가 여럿이면 같은 라인의 사본이 생기고, 일관성은 "쓰는 코어 하나 또는 읽는 코어 여럿"과 "마지막 쓰기 값 읽기"를 보장한다.
- MESI는 라인마다 2비트로 M·E·S·I를 두고, 버스를 엿들어 읽기에는 공유로, 소유권 요청에는 무효로 바꾼다. E 상태 덕분에 개인 데이터의 쓰기는 메시지가 없다.
- 일관성은 라인 단위라서, 다른 변수라도 같은 라인이면 쓰기마다 라인이 오간다(시뮬레이션에서 5,998 대 2).
- 스레드별로 고치는 데이터는 라인 경계로 띄우거나 지역에 모았다가 한 번에 합친다.

## 더 알아보기
- 이전 글: 8편 「SIMD와 벡터 명령어: SSE에서 AVX-512, NEON, SVE까지」
- 다음 글: 10편 「메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다」
