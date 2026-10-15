# [게임 자원 관리 3/14] 메모리 할당자: 선형·스택·풀 할당자와 단편화

> **한 줄 요약** — 크기와 수명이 제각각인 요청을 받는 범용 할당자는 빈 구간을 찾아 헤매고 단편화로 실패하지만, 게임은 수명이 같은 것끼리 묶어 포인터만 미는 선형 할당자, 표시까지 되감는 스택 할당자, 같은 크기만 받는 풀 할당자에 맡겨 할당과 해제를 O(1)로 만들고 외부 단편화를 없앤다.

## 이 글에서 다루는 것
- 범용 할당자를 바이트 배열로 흉내 내 외부·내부 단편화 재기
- 선형(아레나) 할당자: 프레임마다 통째로 비우기
- 스택(마커) 할당자: 레벨 데이터와 로딩 임시 버퍼
- 고정 크기 풀 할당자: 빈 블록 안에 다음 번호 적기
- 겹침을 잡는 무작위 대조 검사

## 범용 할당자는 왜 비싼가
`malloc`이나 `new` 같은 범용 할당자는 언제 어떤 크기의 요청이 와서 언제 풀려날지 모른다. 그래서 요청마다 맞는 빈 구간을 찾아야 하고, 블록마다 크기를 적은 머리(header)를 두며, 여러 스레드가 함께 쓰면 잠금도 필요하다. 가장 큰 문제는 **외부 단편화**(external fragmentation)다. 빈 공간의 총량은 충분한데 연속된 구간이 없어서 큰 요청이 실패한다. 반대로 정렬이나 블록 크기 때문에 요청보다 더 잡아 주는 낭비는 **내부 단편화**(internal fragmentation)다.

64KiB짜리 바이트 배열을 힙으로 삼아, 처음 맞는 빈 구간을 쓰는 **최초 적합**(first fit) 할당자를 만든다. 0은 빈 바이트, 1은 쓰는 바이트다. `bytearray.find(bytes(n))`이 "0이 n개 이어진 첫 위치"를 찾아 주므로 최초 적합 탐색 그 자체다. 작은 요청(16~128B)과 큰 요청(512~2048B)을 섞어 할당과 해제를 2만 번 반복한다.
```python
import random, re

class FirstFitHeap:                       # 바이트 배열 위의 범용 할당자
    def __init__(self, size):
        self.mem = bytearray(size)        # 0 = 빈 바이트, 1 = 쓰는 중
    def alloc(self, n):
        n = (n + 15) // 16 * 16           # 16바이트 정렬로 올림
        at = self.mem.find(bytes(n))      # 처음 맞는 빈 구간
        if at < 0:
            return None
        self.mem[at:at + n] = b"\x01" * n
        return (at, n)
    def free(self, blk):
        at, n = blk
        self.mem[at:at + n] = bytes(n)
    def holes(self):                      # 빈 구간 길이 목록
        return [m.end() - m.start() for m in re.finditer(b"\x00+", self.mem)]

rng = random.Random(1)
heap, live = FirstFitHeap(64 * 1024), []
fails = enough = asked = got = 0
for _ in range(20000):
    if rng.random() < 0.5 or not live:
        n = rng.choice([rng.randint(16, 128), rng.randint(512, 2048)])
        b = heap.alloc(n)
        if b:
            live.append(b); asked += n; got += b[1]
        else:
            fails += 1
            enough += sum(heap.holes()) >= n   # 총량은 충분했나
    else:
        heap.free(live.pop(rng.randrange(len(live))))
h = heap.holes()
print(f"할당 실패 {fails}번, 그중 빈 공간 총량은 충분 {enough}번")
print(f"빈 공간 {sum(h)}B, 가장 큰 구간 {max(h)}B, 구간 {len(h)}개")
print(f"외부 단편화 {1 - max(h) / sum(h):.2f}, "
      f"내부 단편화 {1 - asked / got:.3f}")
```
```text
할당 실패 292번, 그중 빈 공간 총량은 충분 292번
빈 공간 43296B, 가장 큰 구간 25456B, 구간 14개
외부 단편화 0.41, 내부 단편화 0.011
```
실패 292번이 모두 "공간은 있는데 한 덩어리가 아니라서"였다(외부 단편화 = `1 − 가장 큰 빈 구간 ÷ 빈 공간 총량`). 16바이트 정렬이 만든 내부 단편화는 1.1%로 작다. 범용 할당자는 크기와 수명을 모르니 이를 피할 수 없다. 게임은 반대로 **수명과 크기를 미리 안다**는 점을 이용한다.

## 선형·스택·풀 할당자
- **선형 할당자**(linear allocator, 아레나): 버퍼 하나와 "어디까지 썼나" 포인터 하나다. 할당은 정렬을 맞추고 포인터를 미는 것이 전부이고, 프레임이 끝나면 포인터를 0으로 되돌려 한꺼번에 비운다. 충돌 접점 목록, 그리기 명령처럼 한 프레임만 사는 데이터용이다.
- **스택 할당자**(stack allocator): 선형 할당자에 **표시**(marker)를 더한다. 표시까지 되감으면 그 뒤에 잡은 것이 한꺼번에 풀리므로, 해제가 할당의 역순(LIFO)이어야 한다. 레벨 데이터 위에 로딩용 임시 버퍼를 쌓았다가 먼저 버리는 식이다.
- **풀 할당자**(pool allocator): 같은 크기 블록만 다룬다. 빈 블록은 어차피 안 쓰는 메모리이므로 그 앞 4바이트에 "다음 빈 블록 번호"를 적는다. 2편의 프리 리스트를 메모리 안에 넣은 것이다.

```python
import random

class Arena:                              # 선형(아레나) 할당자
    def __init__(self, size):
        self.mem, self.top = bytearray(size), 0
    def alloc(self, n, align=16):
        at = (self.top + align - 1) // align * align   # 정렬 맞춰 올림
        if at + n > len(self.mem):
            return None
        self.top = at + n                 # 포인터를 밀기만 한다
        return at
    def reset(self):                      # 프레임 끝: 통째로 비우기 O(1)
        self.top = 0

class StackAlloc(Arena):                  # 스택 할당자 = 아레나 + 표시
    def marker(self):
        return self.top
    def free_to(self, m):                 # 표시 뒤의 것을 한꺼번에 해제
        assert m <= self.top
        self.top = m

class PoolAlloc:                          # 고정 크기 풀 할당자
    END = 0xFFFFFFFF
    def __init__(self, block, count):
        self.block, self.mem = block, bytearray(block * count)
        for i in range(count):            # 빈 블록 앞 4바이트 = 다음 빈 블록
            self._put(i, i + 1 if i + 1 < count else self.END)
        self.head = 0
    def _put(self, i, v):
        self.mem[i * self.block:i * self.block + 4] = v.to_bytes(4, "little")
    def _next(self, i):
        return int.from_bytes(self.mem[i * self.block:i * self.block + 4],
                              "little")
    def alloc(self):
        if self.head == self.END:
            return None
        i, self.head = self.head, self._next(self.head)
        return i * self.block
    def free(self, at):
        i = at // self.block
        self._put(i, self.head)           # 반납한 블록이 새 머리
        self.head = i

rng = random.Random(1)
frame = Arena(64 * 1024)
for f in range(3):
    offs = [frame.alloc(rng.randint(1, 40)) for _ in range(5)]
    print(f"프레임 {f}: {offs} 사용 {frame.top}B")
    frame.reset()

level = StackAlloc(1 << 20)
m0 = level.marker()
geo = level.alloc(300_000)                # 레벨 지오메트리
m1 = level.marker()
tmp = level.alloc(50_000)                 # 로딩 중에만 쓰는 버퍼
level.free_to(m1)
print("임시 버퍼 해제 후", level.top, end=", ")
level.free_to(m0)
print("레벨 해제 후", level.top)

pool = PoolAlloc(64, 4)
a, b, c = pool.alloc(), pool.alloc(), pool.alloc()
pool.free(a); pool.free(c)
print("반납 후 다시:", pool.alloc(), pool.alloc(), pool.alloc(), pool.alloc())
sizes = [rng.randint(20, 64) for _ in range(1000)]
print(f"64B 블록에 20~64B 객체: 내부 단편화 "
      f"{1 - sum(sizes) / (64 * len(sizes)):.2f}")
```
```text
프레임 0: [0, 16, 64, 80, 112] 사용 120B
프레임 1: [0, 32, 64, 96, 128] 사용 142B
프레임 2: [0, 16, 48, 64, 96] 사용 124B
임시 버퍼 해제 후 300000, 레벨 해제 후 0
반납 후 다시: 128 0 192 None
64B 블록에 20~64B 객체: 내부 단편화 0.34
```
아레나는 매 프레임 0번지부터 다시 쓰고, 빈 구간을 찾는 일이 아예 없다. 스택은 m1까지 되감아 임시 버퍼만, m0까지 되감아 레벨 전체를 버린다. 풀은 마지막에 반납한 c(128), a(0), 안 쓴 192 순으로 주고, b가 아직 쓰는 중이라 네 번째는 None이다.

세 할당자 모두 외부 단편화가 없다. 아레나와 스택은 빈 공간이 늘 꼭대기 위 한 덩어리이고, 풀은 모든 블록이 같은 크기라 어느 빈 블록이든 다음 요청에 맞는다. 대신 대가가 있다. 아레나는 낱개 해제가 안 되고, 스택은 순서를 지켜야 하며, 풀은 크기가 다른 객체를 담으면 내부 단편화가 생긴다. 20~64B 객체를 64B 블록에 담으면 34%가 낭비다. 크기 등급을 여러 개 두는 해법은 4편의 슬랩 할당자에서 다룬다.

## 무작위 대조 검사
할당자 버그의 대부분은 두 블록이 겹치는 것이다. 앞 코드에 이어서, 할당할 때마다 블록에 고유한 무늬 바이트를 칠하고, 매 단계 살아 있는 모든 블록의 무늬가 그대로인지 본다. 누군가 겹쳐 쓰면 다른 블록의 무늬가 지워진다. 할당 성공 여부도 참조 모델(아레나·스택은 정렬한 꼭대기 + n ≤ 크기, 풀은 대여 수 < 블록 수)과 비교한다.
```python
def check(kind, rng):
    size = rng.randint(64, 2048)
    A = (Arena(size) if kind == "arena" else StackAlloc(size)
         if kind == "stack"
         else PoolAlloc(rng.choice([8, 16, 48]), rng.randint(1, 30)))
    live, marks, tag = {}, [], 0          # 모델: 시작 주소 → (길이, 무늬)
    for _ in range(300):
        r = rng.random()
        if r < 0.6:
            n = A.block if kind == "pool" else rng.randint(1, 200)
            if kind == "pool":            # 모델이 예상하는 성공 여부
                room = len(live) < len(A.mem) // A.block
            else:
                room = (A.top + 15) // 16 * 16 + n <= len(A.mem)
            at = A.alloc() if kind == "pool" else A.alloc(n)
            if (at is not None) != room: return False
            if at is None: continue
            if at < 0 or at + n > len(A.mem): return False
            tag = tag % 255 + 1
            A.mem[at:at + n] = bytes([tag]) * n   # 고유 무늬 칠하기
            live[at] = (n, tag)
        elif kind == "arena" and r < 0.65:
            A.reset(); live.clear()
        elif kind == "stack" and r < 0.8:
            marks.append(A.marker())
        elif kind == "stack" and marks:
            m = marks.pop(rng.randrange(len(marks)))
            marks = [x for x in marks if x <= m]
            A.free_to(m)
            live = {a: v for a, v in live.items() if a < m}
        elif kind == "pool" and live:
            at = rng.choice(list(live)); A.free(at); del live[at]
        for at, (n, t) in live.items():   # 겹치면 무늬가 지워진다
            if A.mem[at:at + n] != bytes([t]) * n: return False
    return True

rng = random.Random(7)
for kind in ("arena", "stack", "pool"):
    ok = all(check(kind, rng) for _ in range(500))
    print(f"{kind:5} 무작위 500개 비교:", "모두 일치" if ok else "불일치")
```
```text
arena 무작위 500개 비교: 모두 일치
stack 무작위 500개 비교: 모두 일치
pool  무작위 500개 비교: 모두 일치
```
풀의 `free`에서 머리 갱신을 빼거나 스택의 되감기를 8바이트 더 내리면 각각 "불일치"가 나온다.

### 자주 하는 실수
- 아레나 데이터를 다음 프레임에도 쓴다: 이미 덮어써졌다. 두 프레임을 살아야 하면 아레나 두 개를 번갈아 쓴다.
- 스택에서 아래 표시로 되감아 위의 것까지 잃는다.
- 정렬을 잊는다: SIMD 데이터는 16바이트 정렬이 필요하다.

## 복잡도
| 할당자 | 할당·해제 | 단편화 |
|---|---|---|
| 최초 적합 범용 | O(빈 구간 수) 탐색 | 외부·내부 모두 |
| 선형(아레나) | O(1), 해제는 일괄 O(1) | 없음 |
| 스택 | O(1), 표시까지 일괄 | 없음(LIFO 조건) |
| 고정 크기 풀 | O(1) | 외부 없음, 내부 있음 |

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 운영체제는 페이지 단위로 메모리를 주고, 할당자는 그 페이지를 다시 잘게 나눈다. 가상 메모리가 물리 메모리의 흩어짐은 감춰도 한 주소 공간 안의 외부 단편화는 감추지 못한다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: KV 캐시를 고정 크기 블록으로 나눠 빈 블록 목록에서 받는 것은 이 글의 풀 할당자이고, 외부 단편화가 사라지는 이유도 같다.
- 언어 기초 4편 「러스트: 가비지 컬렉터 없이 메모리 안전하게」: 해제 시점을 컴파일 때 정하는 언어에서는 수명이 같은 값들을 아레나 하나에 모아 한꺼번에 버리는 설계가 자연스럽다.

## 정리
- 범용 할당자는 크기와 수명을 몰라 탐색 비용과 외부 단편화를 피할 수 없다.
- 수명이 같은 것끼리 묶는다: 한 프레임은 아레나, 순서가 있는 수명은 스택, 같은 크기 객체는 풀.
- 세 할당자 모두 할당·해제가 O(1)이고 외부 단편화가 없지만, 각각 낱개 해제 불가·LIFO 순서·내부 단편화라는 대가가 있다.
- 무늬를 칠해 두고 지워졌는지 보는 검사로 겹침 버그를 잡는다.

## 더 알아보기
- 이전 글: 2편 「오브젝트 풀링: 만들지 말고 빌려 쓰기」
- 다음 글: 4편 「버디 할당자와 슬랩 할당자」
