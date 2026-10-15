# [게임 자원 관리 2/14] 오브젝트 풀링: 만들지 말고 빌려 쓰기

> **한 줄 요약** — 총알·파티클처럼 짧게 살고 많이 생기는 객체는 매번 만들고 버리는 대신 미리 만들어 둔 묶음에서 프리 리스트 스택으로 O(1)에 빌리고 돌려주면, 할당 횟수와 GC 압박이 최대 동시 개수 수준으로 줄고, 세대 번호를 붙인 핸들로 이중 반납과 반납 후 사용까지 잡을 수 있다.

## 이 글에서 다루는 것
- 매번 만들기 vs 풀: 30초 전투에서 할당 횟수 세기
- 프리 리스트 스택으로 O(1) 대여·반납, 세대 번호 핸들
- 풀 크기 정하기: 평균이 아니라 최대 동시 개수
- 풀이 비었을 때: 늘리기, 가장 오래된 것 회수, 거절
- 참조 모델과 무작위 대조 검사

## 문제: 1초에 72발, 0.5~1.5초 비행
슈팅 게임에서 매 프레임(60fps) 0~3발이 나가고, 총알은 30~90프레임 날다가 사라진다. 가장 쉬운 구현은 쏠 때 `Bullet()`을 만들고 사라질 때 버리는 것이다. 30초 동안 객체가 2천 개 넘게 만들어지고 버려진다. C#(유니티)·자바·자바스크립트처럼 **추적 가비지 컬렉터**를 쓰는 런타임은 할당한 양이 쌓이면 수집을 돌리므로, 할당이 많을수록 1편에서 본 GC 스파이크가 잦아진다. 생성자에서 큰 버퍼를 잡거나 엔진 쪽 리소스를 등록하는 객체라면 생성 자체도 비싸다.

## 프리 리스트 스택으로 빌리고 돌려주기
**오브젝트 풀**(object pool)은 객체를 미리 만들어 배열에 두고, 비어 있는 칸 번호를 스택에 쌓아 둔다. 빌리기는 스택에서 pop, 돌려주기는 push라서 둘 다 O(1)이다. 이 스택이 **프리 리스트**(free list)다. 빌려준 객체를 번호만으로 가리키면, 반납된 뒤 다른 총알이 그 자리를 받았을 때 옛 번호로 엉뚱한 총알을 건드리는 버그가 생긴다. 그래서 칸마다 **세대 번호**를 두고 빌려줄 때마다 1씩 올려, 핸들을 (번호, 세대)로 준다. 세대가 맞지 않는 핸들은 낡은 것이다.
```python
import random
from collections import deque

class Bullet:
    __slots__ = ("x", "vx", "life", "alive", "gen")
    made = 0                                  # 지금까지 만든 객체 수
    def __init__(self):
        Bullet.made += 1
        self.x = self.vx = 0.0
        self.life, self.alive, self.gen = 0, False, 0

class Pool:
    def __init__(self, size, policy="grow"):
        self.items = [Bullet() for _ in range(size)]
        self.free = list(range(size))         # 프리 리스트(스택)
        self.order = deque()                  # 빌려 간 순서 (번호, 세대)
        self.policy, self.extra = policy, 0   # 빈 풀 정책, 발동 횟수

    def acquire(self):
        if not self.free:
            self.extra += 1
            if self.policy == "reject":
                return None
            if self.policy == "grow":
                self.items.append(Bullet())
                self.free.append(len(self.items) - 1)
            else:                             # "oldest": 가장 오래된 것 회수
                while True:
                    i, g = self.order.popleft()
                    if self.items[i].alive and self.items[i].gen == g:
                        self.release((i, g))
                        break
        i = self.free.pop()                   # O(1) 대여
        b = self.items[i]
        b.alive, b.gen = True, b.gen + 1
        self.order.append((i, b.gen))
        return (i, b.gen)                     # 핸들 = (번호, 세대)

    def get(self, h):                         # 낡은 핸들이면 None
        b = self.items[h[0]]
        return b if b.alive and b.gen == h[1] else None

    def release(self, h):                     # O(1) 반납
        if self.get(h) is None:
            raise RuntimeError(f"이중 반납 또는 낡은 핸들 {h}")
        self.items[h[0]].alive = False
        self.free.append(h[0])

pool = Pool(4)
a, b = pool.acquire(), pool.acquire()
pool.release(a)
c = pool.acquire()                            # a가 쓰던 칸을 다시 받는다
print("a", a, "c", c, "a로 접근:", pool.get(a))
try:
    pool.release(a)
except RuntimeError as e:
    print(e)
print("돌려받지 못한 칸:", len(pool.items) - len(pool.free))
```
```text
a (3, 1) c (3, 2) a로 접근: None
이중 반납 또는 낡은 핸들 (3, 1)
돌려받지 못한 칸: 2
```
c는 a와 같은 3번 칸이지만 세대가 2라서, 낡은 핸들 a로는 접근도 반납도 막힌다. 마지막 줄은 **반납 누락**(leak) 검사다. 레벨이 끝나 모든 총알이 사라졌는데 이 값이 0이 아니면 어딘가에서 반납을 빼먹은 것이고, `order`에 남은 핸들로 범인을 찾는다. C나 C++의 풀은 다음 빈 칸 번호를 빈 객체의 메모리 안에 직접 적어 두어 스택 배열조차 따로 두지 않는데, 이 방식은 3편에서 바이트 배열로 구현한다.

## 30초 전투: 할당 횟수
앞 코드에 이어서, 같은 시드로 매번 만들기와 풀을 비교한다. 풀은 빈 채로 시작해 모자랄 때만 늘린다.
```python
import gc

runs = [0]                                    # 순환 GC가 돈 횟수
gc.callbacks.append(lambda ph, info: ph == "start" and
                    runs.__setitem__(0, runs[0] + 1))

def play(rng, pool=None, frames=1800):        # 60fps로 30초
    live, peak = [], 0
    for _ in range(frames):
        for _ in range(rng.choice([0, 0, 1, 2, 3])):
            life = rng.randint(30, 90)        # 0.5~1.5초 날아간다
            h = Bullet() if pool is None else pool.acquire()
            if h is None:
                continue                      # 거절 정책
            (h if pool is None else pool.get(h)).life = life
            live.append(h)
        peak = max(peak, len(live))
        keep = []
        for h in live:
            b = h if pool is None else pool.get(h)
            if b is None:
                continue                      # 회수 정책에 빼앗긴 총알
            b.life -= 1
            if b.life > 0:
                keep.append(h)
            elif pool is not None:
                pool.release(h)               # 수명이 다하면 반납
        live = keep
    return peak

gc.collect(); runs[0] = 0; Bullet.made = 0
play(random.Random(1))
print("매번 생성:", Bullet.made, "개 할당, 순환 GC", runs[0], "번")
Bullet.made = 0
peak = play(random.Random(1), Pool(0))
print("풀:", Bullet.made, "개 할당, 최대 동시", peak)
```
```text
매번 생성: 2195 개 할당, 순환 GC 0 번
풀: 97 개 할당, 최대 동시 97
```
풀은 최대 동시 개수만큼만 만들고 그 뒤로는 할당이 0이다. 2195번이 97번으로 줄었다. 순환 GC가 0번인 것은 CPython이 참조 카운트가 0이 되는 즉시 객체를 해제하기 때문이다. 그래도 객체를 만들고 지우는 비용은 매번 든다. 추적 GC 런타임에서는 이 2195번의 할당이 그대로 수집 압박이 된다.

## 풀 크기와 빈 풀 정책
평균 동시 개수는 리틀의 법칙(Little's law)으로 `발사율 × 평균 수명 = 1.2발/프레임 × 60프레임 = 72개`다. 하지만 풀은 평균이 아니라 최대에 맞춰야 한다. 앞 코드에 이어서, 서로 다른 판 200개의 최대 동시 개수를 재고, 크기 90인 풀에 세 정책을 걸어 본다.
```python
peaks = sorted(play(random.Random(s), Pool(0)) for s in range(200))
print("판 200개 최대 동시: 중앙값", peaks[100], "p99", peaks[198],
      "최대", peaks[-1])
for policy in ("grow", "oldest", "reject"):
    pool = Pool(90, policy)
    play(random.Random(5), pool)
    print(f"크기 90 {policy:6}: 발동 {pool.extra}번, 크기 {len(pool.items)}")
```
```text
판 200개 최대 동시: 중앙값 96 p99 115 최대 115
크기 90 grow  : 발동 3번, 크기 93
크기 90 oldest: 발동 6번, 크기 90
크기 90 reject: 발동 4번, 크기 90
```
평균은 72인데 판마다 최대는 96~115까지 오른다. 개발 중에는 늘리기 정책으로 돌려 최대 크기를 기록하고, 출시 때 그 값에 여유를 더해 고정하는 것이 흔한 방법이다. 정책마다 성격이 다르다.
- **늘리기**(grow): 아무것도 잃지 않지만 늘리는 순간 할당이 생긴다. 발동 횟수는 최대 기록을 깬 횟수다.
- **가장 오래된 것 회수**(oldest): 곧 사라질 총알·파티클·탄피에 알맞다. 화면에서 무언가 갑자기 사라진다.
- **거절**(reject): 새 효과음이나 파편을 그냥 생략한다. 게임 규칙에 영향이 없는 장식에만 쓴다.

## 무작위 대조 검사
앞 코드에 이어서, 크기와 정책을 무작위로 고르고 대여·반납(낡은 핸들 포함)을 200번 섞은 뒤, 살아 있는 핸들 목록만 들고 있는 단순한 참조 모델과 매 단계 비교한다. 같은 칸을 두 명에게 빌려주지 않는지, 반납 성공 여부가 모델과 같은지, `빈 칸 + 대여 중 = 전체`가 지켜지는지 본다.
```python
def check(rng):
    size = rng.randint(1, 8)
    policy = rng.choice(["grow", "oldest", "reject"])
    pool, alive, ever, cap = Pool(size, policy), [], [], size
    for _ in range(200):
        if rng.random() < 0.55:
            h = pool.acquire()
            if len(alive) == cap:             # 모델이 예상하는 정책 결과
                if policy == "grow": cap += 1
                elif policy == "oldest": alive.pop(0)
                elif h is not None: return False
            if h is not None:
                if any(h[0] == a[0] for a in alive): return False
                alive.append(h); ever.append(h)
        elif ever:
            h = rng.choice(ever)              # 낡은 핸들도 섞어 반납
            try:
                pool.release(h); ok = h in alive
            except RuntimeError:
                ok = h not in alive
            if not ok: return False
            if h in alive: alive.remove(h)
        if len(pool.free) + len(alive) != len(pool.items): return False
        if any(pool.get(h) is None for h in alive): return False
    return True

rng = random.Random(42)
print("무작위 500개 비교:",
      "모두 일치" if all(check(rng) for _ in range(500)) else "불일치")
```
```text
무작위 500개 비교: 모두 일치
```
`release`의 이중 반납 검사를 지우거나 회수 정책의 세대 비교를 빼 보면 이 검사가 바로 실패한다.

### 자주 하는 실수
- 빌릴 때 초기화를 빼먹는다: 지난 총알의 속도·색이 남는다. 대여 직후 모든 필드를 다시 설정한다.
- 반납한 객체를 계속 들고 있는다: 핸들 대신 객체 참조를 저장하면 세대 검사가 무력해진다.
- 풀을 너무 크게 잡는다: 메모리도 자원이다. 측정한 최대에 여유를 더한 만큼만 잡는다.

## 복잡도
| 연산 | 시간 | 근거 |
|---|---|---|
| 대여·반납 | O(1) | 스택 pop·push |
| 회수 정책 대여 | 분할 상환 O(1) | 순서 큐 항목은 한 번씩만 꺼낸다 |
| 메모리 | O(최대 동시 개수) | 매번 생성은 할당 O(전체 발사 수) |

## 어디에 쓰이나
- 유니티 `UnityEngine.Pool.ObjectPool<T>`: 스택 기반 풀로, `collectionCheck`를 켜면 이미 풀에 있는 객체를 또 반납할 때 예외를 던지고(에디터에서만), `maxSize`를 넘게 반납된 객체는 버려 GC에 맡긴다.
- 언어 기초 8편 「자바와 JVM: 한 번 작성하면 어디서나 실행」: 세대 가설대로 금방 죽는 객체를 젊은 세대에서 싸게 치우는 GC가 있어도, 할당 자체를 없애는 풀은 수집 횟수를 줄인다.
- 언어 기초 2편 「파이썬: 읽기 쉬운 코드를 위한 언어」: 참조 카운팅이 버린 총알을 바로 회수했기 때문에 위 실험에서 순환 GC가 0번이었다.
- 데이터베이스 연결 풀·스레드 풀: 만들기 비싼 자원을 미리 만들어 두고 빌려 쓰는 같은 구조다.

## 정리
- 짧게 살고 많이 생기는 객체는 미리 만들어 두고 프리 리스트 스택으로 O(1)에 빌리고 돌려준다.
- 풀 크기는 평균(리틀의 법칙)이 아니라 측정한 최대 동시 개수에 맞춘다.
- 빈 풀 정책은 늘리기·오래된 것 회수·거절 중 객체의 성격에 맞게 고른다.
- (번호, 세대) 핸들로 이중 반납과 반납 후 사용을 잡고, 끝날 때 대여 중 개수로 반납 누락을 잡는다.

## 더 알아보기
- 이전 글: 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」
- 다음 글: 3편 「메모리 할당자: 선형·스택·풀 할당자와 단편화」
- Unity 스크립팅 레퍼런스 ObjectPool 생성자: https://docs.unity3d.com/ScriptReference/Pool.ObjectPool_1-ctor.html
