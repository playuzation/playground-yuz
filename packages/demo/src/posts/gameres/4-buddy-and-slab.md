# [게임 자원 관리 4/14] 버디 할당자와 슬랩 할당자

> **한 줄 요약** — 버디 할당자는 메모리를 2의 거듭제곱 블록으로 쪼개고 짝(버디)의 주소를 XOR 한 번으로 찾아 즉시 합치므로 할당·해제가 O(log N)이고 외부 단편화가 적지만 반올림으로 평균 25% 안팎을 버리며, 슬랩 할당자는 그 위에서 페이지를 같은 크기 객체 칸으로 나눠 낭비와 생성 비용을 함께 줄인다.

## 이 글에서 다루는 것
- 쪼개기와 합치기: 버디 할당자 구현
- 버디 주소 = 주소 XOR 크기, 그리고 즉시 합치기의 불변식
- 내부 단편화 측정: 왜 평균 25% 안팎인가
- 슬랩 할당자: 크기별 객체 캐시와 생성 상태 보존
- 정렬된 빈 구간 지도와 비교하는 무작위 대조 검사

## 크기가 제각각인데 빨리 합치고 싶다
3편의 풀은 한 가지 크기만, 아레나와 스택은 정해진 순서만 다룬다. 물리 페이지나 큰 버퍼처럼 크기가 다양한 요청을 아무 순서로 받으면서도 빈 구간을 빨리 찾고, 풀려난 이웃끼리 빨리 합치고 싶다. 최초 적합은 빈 구간을 훑어야 하고 이웃을 찾기도 번거롭다.

**버디 할당자**(buddy allocator)는 블록 크기를 `최소 크기 × 2ᵏ`(k = 차수)로만 허용해서 이 둘을 해결한다. 크누스에 따르면 1963년 해리 마코위츠(Harry Markowitz)가 고안했고, 1965년 케네스 놀턴(Kenneth Knowlton)이 CACM 논문 "A fast storage allocator"로 처음 발표했다.
- **할당**: n바이트를 담는 가장 작은 차수 k를 구한다. 차수 k의 빈 목록이 비었으면 위 차수로 올라가 큰 블록을 꺼내고, 반으로 쪼개며 내려온다. 쪼갤 때마다 오른쪽 반은 그 차수의 빈 목록에 넣는다.
- **해제**: 블록은 늘 자기 크기의 배수 주소에 놓이므로 짝(buddy)의 주소는 `주소 XOR 크기`다(예: 0과 64는 64바이트 블록끼리 짝). 짝이 같은 차수 빈 목록에 있으면 합치고, 한 차수 위에서 다시 짝을 찾는다.

```python
import random

class Buddy:
    def __init__(self, min_block=16, top=10):     # 16B × 2¹⁰ = 16KiB
        self.min, self.top = min_block, top
        self.free = [set() for _ in range(top + 1)]  # 차수별 빈 블록 주소
        self.free[top].add(0)
    def order(self, n):                    # n바이트를 담는 가장 작은 차수
        k = 0
        while self.min << k < n:
            k += 1
        return k
    def alloc(self, n):
        k = need = self.order(n)
        while k <= self.top and not self.free[k]:
            k += 1                         # 더 큰 빈 블록을 찾아 올라간다
        if k > self.top:
            return None
        addr = self.free[k].pop()
        while k > need:                    # 반으로 쪼개며 내려온다
            k -= 1
            self.free[k].add(addr + (self.min << k))   # 오른쪽 반
        return addr, need
    def release(self, addr, k):
        while k < self.top:
            buddy = addr ^ (self.min << k) # 짝 주소 = 주소 XOR 크기
            if buddy not in self.free[k]:
                break
            self.free[k].remove(buddy)     # 짝도 비었으면 합친다
            addr, k = min(addr, buddy), k + 1
        self.free[k].add(addr)

b = Buddy()
x, y, z = b.alloc(100), b.alloc(30), b.alloc(16)
print("x", x, "y", y, "z", z, "z의 짝", z[0] ^ (16 << z[1]))
for blk in (y, x, z):
    b.release(*blk)
print("모두 해제 후:", [(k, sorted(s)) for k, s in enumerate(b.free) if s])

rng = random.Random(1)
for name, gen in (("균등 1~1024B", lambda: rng.randint(1, 1024)),
                  ("로그 균등   ", lambda: int(2 ** rng.uniform(4, 10)))):
    asked = got = 0
    for _ in range(10000):
        n = gen(); asked += n; got += 16 << b.order(n)
    print(f"{name}: 내부 단편화 {1 - asked / got:.3f}")
```
```text
x (0, 3) y (128, 1) z (160, 0) z의 짝 176
모두 해제 후: [(10, [0])]
균등 1~1024B: 내부 단편화 0.249
로그 균등   : 내부 단편화 0.276
```
100바이트는 128바이트(차수 3) 블록을 받았고, 조각들은 해제 순서와 상관없이 짝끼리 합쳐져 다시 차수 10 한 덩어리가 된다. 대가는 반올림이다. 요청 크기가 로그 척도로 고르게 퍼져 있으면 기댓값이 `1 − 1/(2 ln 2) ≈ 0.28`이고, 실측 0.276과 맞는다. 129바이트가 256바이트를 차지하는 최악에는 절반 가까이 버린다.

### 즉시 합치기의 불변식
"짝이 비면 바로 합친다"를 지키면 이런 성질이 생긴다. **완전히 비어 있는 정렬된 2ᵏ 구간은 언제나 차수 k 이상인 빈 블록 하나에 들어 있다.** 귀납으로 보인다. 그 구간의 두 반쪽은 정렬된 2ᵏ⁻¹ 빈 구간이니 각각 차수 k − 1 이상인 빈 블록에 들어 있다. 어느 쪽이든 차수 k 이상 블록에 들어 있으면 그 블록이 구간 전체를 덮는다. 아니라면 두 반쪽이 정확히 차수 k − 1 빈 블록이면서 서로 짝인데, 그러면 이미 합쳐졌어야 하므로 모순이다. 따라서 할당이 실패하는 것은 정렬된 빈 구간이 정말 없을 때뿐이다.

## 무작위 대조 검사
앞 코드에 이어서, 최소 단위 칸마다 쓰는 중인지만 적는 지도를 참조 모델로 둔다. 요청마다 "정렬된 2ᵏ칸 빈 구간이 있는가"를 지도에서 직접 찾아 버디의 성공·실패와 비교하고(위 불변식), 주소 정렬과 겹침도 본다. 끝에 모두 해제하면 한 덩어리로 돌아와야 한다.
```python
def check(rng):
    top = rng.randint(1, 6)
    b, used, live = Buddy(16, top), [False] * (1 << top), []
    for _ in range(200):
        if rng.random() < 0.6:
            n = rng.randint(1, 16 << top)
            w = 1 << b.order(n)            # 필요한 칸 수
            room = any(not any(used[s:s + w])
                       for s in range(0, len(used), w))
            got = b.alloc(n)
            if (got is not None) != room: return False
            if got is None: continue
            u = got[0] // 16
            if u % w or any(used[u:u + w]): return False   # 정렬·겹침
            used[u:u + w] = [True] * w
            live.append(got)
        elif live:
            a, k = live.pop(rng.randrange(len(live)))
            b.release(a, k)
            used[a // 16:a // 16 + (1 << k)] = [False] * (1 << k)
    for blk in live:
        b.release(*blk)
    return b.free[top] == {0} and not any(b.free[:top])

rng = random.Random(5)
print("무작위 500개 비교:",
      "모두 일치" if all(check(rng) for _ in range(500)) else "불일치")
```
```text
무작위 500개 비교: 모두 일치
```
합치기를 빼면(짝 검사를 늘 실패로 바꾸면) 지도에는 빈 구간이 있는데 버디는 실패하는 경우가 생겨 바로 "불일치"가 나온다.

## 슬랩 할당자: 같은 크기끼리 한 페이지에
게임 객체는 48바이트 파티클, 80바이트 사운드 핸들처럼 크기가 몇 가지로 정해져 있고 같은 크기가 수천 개씩 생긴다. 이것을 버디에 바로 맡기면 48바이트가 64바이트를 차지한다. **슬랩 할당자**(slab allocator)는 제프 본윅(Jeff Bonwick)이 1994년 USENIX 여름 학회 논문 "The Slab Allocator: An Object-Caching Kernel Memory Allocator"에서 SunOS 5.4 커널용으로 발표했다.
- 객체 크기마다 **캐시**를 두고, 캐시는 버디에서 받은 페이지를 그 크기 칸으로 나눈 **슬랩**들을 가진다. 4096바이트에 48바이트 칸 85개가 들어가고 16바이트만 남는다.
- 할당은 일부 찬 슬랩에서 하고, 다 빈 슬랩은 두었다가 메모리가 모자랄 때 버디에 반납한다.
- **객체 캐싱**: 해제된 칸의 객체를 생성된 상태로 두어 다음 할당 때 생성자를 다시 부르지 않는다. 크기별 풀을 페이지 단위로 늘리고 줄이는 셈이다.

앞의 `Buddy`에 이어서, 세 종류 객체를 3만 번 할당·해제하며 버디에 바로 맡길 때와 바이트·생성자 호출 수를 비교한다.
```python
PAGE = 4096

class Slab:                                # 페이지 하나 = 같은 크기 칸들
    def __init__(self, addr, per):
        self.addr, self.free, self.obj = addr, list(range(per)), [None] * per

class SlabCache:                           # 한 크기 객체 전용 캐시
    def __init__(self, size, buddy, ctor):
        self.size, self.buddy, self.ctor = size, buddy, ctor
        self.per = PAGE // size            # 슬랩당 객체 수
        self.partial, self.empty = {}, []  # 일부 찬 슬랩, 빈 슬랩
        self.slabs = self.ctor_calls = 0
    def alloc(self):
        if not self.partial:
            if self.empty:
                s = self.empty.pop()
            else:                          # 버디에서 페이지를 받는다
                s = Slab(self.buddy.alloc(PAGE)[0], self.per)
                self.slabs += 1
            self.partial[s.addr] = s
        s = next(iter(self.partial.values()))
        i = s.free.pop()
        if s.obj[i] is None:               # 처음 쓰는 칸만 생성자 호출
            s.obj[i] = self.ctor(); self.ctor_calls += 1
        if not s.free:
            del self.partial[s.addr]       # 꽉 찼다
        return s, i
    def release(self, s, i):               # 객체는 생성된 상태로 남긴다
        s.free.append(i)
        self.partial[s.addr] = s
        if len(s.free) == self.per:        # 다 비었다
            del self.partial[s.addr]; self.empty.append(s)
    def shrink(self):                      # 빈 슬랩의 페이지를 반납
        while self.empty:
            self.buddy.release(self.empty.pop().addr, self.buddy.order(PAGE))
            self.slabs -= 1

kinds = {"파티클": 48, "사운드": 80, "엔티티": 200}
buddy = Buddy(16, 20)                      # 16MiB
caches = {k: SlabCache(n, buddy, dict) for k, n in kinds.items()}
rng, live, allocs = random.Random(3), [], 0
for _ in range(30000):
    if rng.random() < 0.52 or not live:
        k = rng.choice(list(kinds))
        live.append((k, caches[k].alloc())); allocs += 1
    else:
        k, (s, i) = live.pop(rng.randrange(len(live)))
        caches[k].release(s, i)
for c in caches.values():
    c.shrink()
used = sum(kinds[k] for k, _ in live)
direct = sum(16 << buddy.order(kinds[k]) for k, _ in live)
slab = sum(c.slabs for c in caches.values()) * PAGE
print(f"살아 있는 객체 {len(live)}개, {used}B")
print(f"버디로 바로: {direct}B, 낭비 {1 - used / direct:.3f}")
print(f"슬랩 캐시:  {slab}B, 낭비 {1 - used / slab:.3f}")
print("할당", allocs, "번, 생성자 호출",
      sum(c.ctor_calls for c in caches.values()), "번")
ids = {(s.addr, i) for _, (s, i) in live}
for k, (s, i) in live:
    caches[k].release(s, i)
for c in caches.values():
    c.shrink()
print("검사: 칸 중복", len(live) - len(ids), "개, 모두 반납 후 한 덩어리:",
      buddy.free[20] == {0})
```
```text
살아 있는 객체 1310개, 141944B
버디로 바로: 193472B, 낭비 0.266
슬랩 캐시:  155648B, 낭비 0.088
할당 15655 번, 생성자 호출 1429 번
검사: 칸 중복 0 개, 모두 반납 후 한 덩어리: True
```
낭비가 26.6%에서 8.8%로 줄었다(페이지 끝 자투리와 덜 찬 슬랩의 빈칸). 할당 15655번 중 생성자는 1429번만 불렸고, 나머지 91%는 만들어 둔 객체를 다시 썼다. 마지막 줄은 같은 칸을 두 번 내주지 않았고, 모두 반납하면 페이지가 버디로 돌아가 한 덩어리가 된다는 확인이다.

## 복잡도
| 연산 | 시간 | 근거 |
|---|---|---|
| 버디 할당 | O(log N) | 차수를 올라갔다 쪼개며 내려옴 |
| 버디 해제 | O(log N) | 차수마다 짝 하나 확인 |
| 슬랩 할당·해제 | O(1) | 칸 스택 pop·push |
| 슬랩 새 페이지 | 버디 할당 1번 | 페이지마다 한 번 |

N은 전체 크기 ÷ 최소 블록이다.

## 어디에 쓰이나
- 리눅스 커널: 물리 페이지 할당자가 이진 버디 할당자이고, 그 위의 커널 객체 할당은 슬랩 계열이 맡는다. 구현은 SLAB, SLUB, SLOB 셋이 있다가 SLOB은 6.4에서, SLAB은 6.8에서 빠져 지금은 SLUB만 남았다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 페이지 폴트 때 커널이 마련하는 "빈 프레임"은 리눅스라면 이 버디 할당자에서 나온다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 크기의 배수 주소는 아래 k비트가 0이고, 짝 주소는 k번째 비트 하나만 다르므로 XOR 한 번으로 찾는다.

## 정리
- 버디 할당자는 2의 거듭제곱 블록만 쓰고, 짝 주소 `주소 XOR 크기`로 즉시 합쳐 O(log N)에 할당·해제한다.
- 즉시 합치기 덕분에 정렬된 빈 구간이 있으면 할당은 반드시 성공한다(지도 비교로 확인).
- 대가는 반올림 낭비로, 고른 분포에서 25% 안팎이다.
- 슬랩 할당자는 페이지를 같은 크기 칸으로 나눠 낭비를 줄이고, 생성된 객체를 재사용해 생성 비용까지 아낀다.

## 더 알아보기
- 이전 글: 3편 「메모리 할당자: 선형·스택·풀 할당자와 단편화」
- 다음 글: 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」
- Jeff Bonwick, "The Slab Allocator" (USENIX Summer 1994): https://www.usenix.org/publications/library/proceedings/bos94/bonwick.html
