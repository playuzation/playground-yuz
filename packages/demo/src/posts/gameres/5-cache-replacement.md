# [게임 자원 관리 5/14] 캐시 교체 알고리즘: LRU, LFU, CLOCK

> **한 줄 요약** — 캐시가 꽉 찼을 때 무엇을 버릴지 정하는 규칙은 접근 패턴에 따라 성적이 뒤집히므로(LRU는 순차 반복에서 0%, LFU는 주제가 바뀌면 무너진다), 미래를 아는 벨라디 최적을 기준선으로 두고 실제 패턴으로 적중률을 재서 고른다.

## 이 글에서 다루는 것
- 텍스처 캐시 예제와 적중률
- LRU(OrderedDict로 O(1)), LFU(횟수별 묶음으로 O(1)), CLOCK(참조 비트 하나)
- 벨라디 최적(OPT): 온라인 알고리즘의 상한
- 네 가지 접근 패턴에서 적중률 비교
- 정의대로 짠 느린 버전·완전 탐색과 대조

## 문제: VRAM에 텍스처 50장
오픈 월드에서 텍스처 수백 장 중 50장만 GPU 메모리에 둘 수 있다. 필요한 텍스처가 이미 있으면 **적중**(hit), 없으면 디스크에서 읽고 압축을 푸는 **실패**(miss)다. 실패는 로딩 시간이나 1편의 스파이크가 된다. 캐시가 꽉 찼을 때 무엇을 내보낼지 정하는 규칙이 **교체 정책**(replacement policy)이다. 사운드 버퍼, 셰이더, 경로 탐색 결과 캐시도 같은 문제다.

## 네 가지 정책
- **LRU**(Least Recently Used): 가장 오래 안 쓴 것을 버린다. 최근에 쓴 것은 곧 또 쓴다는 시간 지역성에 건다. `OrderedDict`의 `move_to_end`와 `popitem(last=False)`가 둘 다 O(1)이라 그대로 구현된다.
- **LFU**(Least Frequently Used): 가장 적게 쓴 것을 버린다. 사용 횟수별로 키 묶음을 두고 가장 작은 횟수(`low`)를 기억하면 O(1)이다. 횟수가 같으면 오래 안 쓴 것부터 버린다.
- **CLOCK**: 칸을 원형으로 놓고 칸마다 참조 비트 하나만 둔다. 적중하면 비트만 켠다. 버릴 때는 시곗바늘이 돌며 비트가 켜진 칸은 끄고 지나가고(두 번째 기회), 꺼진 칸을 버린다. 적중 때 목록을 옮기지 않아 싸고, LRU를 흉내 낸다. 페르난도 코르바토(Fernando Corbató)가 1968년 멀틱스(Multics) 페이징 실험 보고서에서 쓴 방법이다.
- **OPT**(벨라디 최적): 다음 사용이 가장 먼 것을 버린다. 미래를 알아야 하므로 실제로는 못 쓰지만, 같은 크기 캐시가 낼 수 있는 최고 적중률이라 기준선이 된다. 라슬로 벨라디(László Bélády)가 1966년 IBM Systems Journal에 발표했다.

```python
import random
from collections import OrderedDict, defaultdict

def lru(reqs, cap):
    cache, hits = OrderedDict(), 0
    for k in reqs:
        if k in cache:
            hits += 1
            cache.move_to_end(k)           # 방금 쓴 것을 맨 뒤로
        else:
            if len(cache) == cap:
                cache.popitem(last=False)  # 맨 앞 = 가장 오래 안 쓴 것
            cache[k] = True
    return hits

def lfu(reqs, cap):                        # 횟수가 같으면 오래 안 쓴 것부터
    freq, groups, low, hits = {}, defaultdict(OrderedDict), 0, 0
    for k in reqs:
        if k in freq:
            hits += 1
            f = freq[k]
            del groups[f][k]
            if not groups[f] and low == f:
                low += 1
            freq[k] = f + 1
            groups[f + 1][k] = True
        else:
            if len(freq) == cap:
                old, _ = groups[low].popitem(last=False)
                del freq[old]
            freq[k], low = 1, 1
            groups[1][k] = True
    return hits

def clock(reqs, cap):
    slots, ref, where, hand, hits = [None] * cap, [0] * cap, {}, 0, 0
    for k in reqs:
        if k in where:
            hits += 1
            ref[where[k]] = 1              # 썼다는 표시만 남긴다
            continue
        while ref[hand]:                   # 표시를 지우고 한 번 봐준다
            ref[hand] = 0
            hand = (hand + 1) % cap
        if slots[hand] is not None:
            del where[slots[hand]]
        slots[hand], where[k] = k, hand
        hand = (hand + 1) % cap
    return hits

def opt(reqs, cap):                        # 다음 사용이 가장 먼 것을 버림
    nxt, last = [0] * len(reqs), {}
    for i in range(len(reqs) - 1, -1, -1):
        nxt[i] = last.get(reqs[i], float("inf"))
        last[reqs[i]] = i
    cache, hits = {}, 0                    # 키 → 다음 사용 시점
    for i, k in enumerate(reqs):
        if k in cache:
            hits += 1
        elif len(cache) == cap:
            del cache[max(cache, key=cache.get)]
        cache[k] = nxt[i]
    return hits

rng, N, CAP = random.Random(1), 20000, 50
w = [1 / (r + 1) for r in range(500)]      # 지프 분포: r번째 인기 텍스처
loads = {
    "인기 편중": rng.choices(range(500), w, k=N),
    "순차 반복": [i % (CAP + 1) for i in range(N)],
    "주제 이동": [rng.randrange(40) + 100 * (i // 5000) for i in range(N)],
    "훑기 섞임": [rng.randrange(30) if rng.random() < 0.7
                 else 1000 + i for i in range(N)],
}
print("적중률    LRU   LFU   CLOCK OPT")
for name, reqs in loads.items():
    rates = [f(reqs, CAP) / N for f in (lru, lfu, clock, opt)]
    print(name, " ".join(f"{r:.3f}" for r in rates))
```
```text
적중률    LRU   LFU   CLOCK OPT
인기 편중 0.534 0.614 0.552 0.726
순차 반복 0.000 0.000 0.000 0.978
주제 이동 0.992 0.326 0.991 0.992
훑기 섞임 0.595 0.698 0.637 0.698
```

## 패턴마다 승자가 다르다
- **인기 편중**: 텍스처 500장의 인기가 지프 분포(r번째가 1/r에 비례)를 따른다. 오래 쌓인 횟수가 실제 인기를 잘 반영해 LFU가 가장 좋다. 실패율로 바꾸면 46.6% 대 38.6%라 디스크 읽기가 약 17% 준다.
- **순차 반복**: 51장을 차례로 계속 돈다. 50칸짜리 LRU는 늘 "곧 다시 쓸 것"을 버리므로 적중이 0이다. LFU도 횟수가 모두 같아 결국 오래된 것을 버리고, CLOCK은 적중이 없으니 비트가 켜질 일이 없어 FIFO가 된다. OPT는 97.8%다. 작업 집합이 캐시보다 조금만 커도 LRU 계열은 무너진다는 것이 이 패턴의 교훈이다. 캐시를 늘리거나, 반복 구간 일부를 고정해 두는 것이 실전 처방이다.
- **주제 이동**: 5천 번마다 쓰는 텍스처 40장이 통째로 바뀐다(레벨이나 지역 이동). LFU는 첫 지역 텍스처의 횟수가 너무 높아 내보내지 못하고, 새 텍스처끼리 남은 10칸을 다툰다. 그래서 32.6%로 무너진다. 횟수를 주기적으로 반으로 줄이는 **노화**(aging)가 필요한 이유다.
- **훑기 섞임**: 자주 쓰는 30장 사이에 한 번만 쓰고 다시 안 쓰는 요청(맵 전체를 훑는 미니맵 생성 같은)이 30% 섞인다. LRU는 한 번 쓴 것도 "최근"이라 자주 쓰는 텍스처를 밀어낸다. LFU는 횟수 1짜리끼리만 교체해 OPT와 같다.

CLOCK은 거의 모든 패턴에서 LRU와 비슷하거나 조금 낫다. 적중할 때 비트 하나만 켜면 되기 때문에, 하드웨어가 참조 비트를 세워 주는 페이지 교체처럼 접근마다 목록을 고칠 수 없는 곳에서 쓴다. 비트 대신 작은 계수기를 두는 GCLOCK, 스캔에 강한 CLOCK-Pro 같은 변형도 있다.

## 무작위 대조 검사
앞 코드에 이어서, 빠른 구현을 정의대로 짠 느린 버전과 비교한다. LRU는 "마지막 사용 시각이 가장 이른 것", LFU는 "(사용 횟수, 마지막 사용 시각)이 가장 작은 것"을 매번 전부 훑어 버린다. CLOCK은 큐로 쓴 두 번째 기회 FIFO와 비교한다. OPT는 짧은 요청열에서 모든 교체 선택을 다 해 보는 완전 탐색의 최소 실패 수와 같아야 한다. 벨라디가 정말 최적이라는 확인이다.
```python
from collections import deque
from functools import lru_cache

def naive(reqs, cap, key):                 # 점수가 가장 낮은 것을 버린다
    cache, hits = {}, 0                    # 키 → [사용 횟수, 마지막 시각]
    for t, k in enumerate(reqs):
        if k in cache:
            hits += 1; cache[k][0] += 1
        else:
            if len(cache) == cap:
                del cache[min(cache, key=lambda x: key(cache[x]))]
            cache[k] = [1, t]
        cache[k][1] = t
    return hits

def second_chance(reqs, cap):              # 큐로 쓴 두 번째 기회 FIFO
    q, ref, hits = deque(), {}, 0
    for k in reqs:
        if k in ref:
            hits += 1; ref[k] = 1; continue
        if len(q) == cap:
            while ref[q[0]]:
                ref[q[0]] = 0; q.rotate(-1)    # 맨 앞을 맨 뒤로
            del ref[q.popleft()]
        q.append(k); ref[k] = 0
    return hits

def best(reqs, cap):                       # 모든 교체 선택 중 최소 실패
    @lru_cache(None)
    def go(i, cache):
        if i == len(reqs): return 0
        k = reqs[i]
        if k in cache: return go(i + 1, cache)
        if len(cache) < cap: return 1 + go(i + 1, cache | {k})
        return 1 + min(go(i + 1, cache - {v} | {k}) for v in cache)
    return go(0, frozenset())

rng, ok = random.Random(2), True
for _ in range(500):
    cap = rng.randint(1, 4)
    reqs = [rng.randrange(6) for _ in range(rng.randint(1, 14))]
    ok &= lru(reqs, cap) == naive(reqs, cap, lambda s: s[1])
    ok &= lfu(reqs, cap) == naive(reqs, cap, lambda s: (s[0], s[1]))
    ok &= clock(reqs, cap) == second_chance(reqs, cap)
    ok &= len(reqs) - opt(reqs, cap) == best(reqs, cap)
print("무작위 500개 비교:", "모두 일치" if ok else "불일치")
```
```text
무작위 500개 비교: 모두 일치
```
LRU의 `move_to_end`를 빼거나, CLOCK의 참조 비트 켜기를 빼거나, OPT를 "다음 사용이 가장 가까운 것"으로 바꾸면 각각 "불일치"가 나온다. OPT가 최적인 이유는 교환 논증이다. 다른 선택을 한 최적해가 있으면, 그 해가 버린 것 대신 다음 사용이 가장 먼 것을 버리도록 바꿔도 실패 수가 늘지 않는다.

## 복잡도
| 정책 | 요청당 시간 | 추가 메모리 |
|---|---|---|
| LRU | O(1) | 연결 리스트 + 해시 |
| LFU | O(1) | 횟수별 묶음 + 해시 |
| CLOCK | 분할 상환 O(1) | 칸당 1비트 |
| OPT(위 구현) | O(C) | 다음 사용 배열 O(n) |

CLOCK의 바늘은 한 바퀴 안에 꺼진 비트를 만나므로 교체 한 번이 최악 O(C)지만, 켜진 비트는 적중 한 번에 하나만 생기므로 분할 상환 O(1)이다. OPT는 힙을 쓰면 O(log C)로 줄일 수 있다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 7편 「빠르게 만드는 기술: 파이프라인, 캐시, 병렬성」: CPU 캐시 시뮬레이터가 세트 안에서 LRU 교체를 했고, 열 우선 순회가 100% 실패한 것은 이 글의 순차 반복과 같은 현상이다.
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 프레임이 모자랄 때 어느 페이지를 디스크로 내보낼지가 이 문제이고, CLOCK은 하드웨어 참조 비트로 LRU를 흉내 내려고 멀틱스에서 쓰였다.
- Redis: 메모리 한도에 닿으면 키를 내보내는데, LRU는 키 몇 개(기본 5개)를 무작위로 뽑아 가장 오래된 것을 버리는 근사이고, 4.0부터 있는 LFU는 몇 비트짜리 확률적 계수기와 감쇠(노화)를 쓴다.

## 정리
- 교체 정책의 성적은 접근 패턴에 달렸다. 편중·스캔에는 LFU, 주제 이동에는 LRU·CLOCK이 강했다.
- LRU와 LFU는 해시와 순서 있는 묶음으로 O(1)에 구현되고, CLOCK은 비트 하나로 LRU를 흉내 낸다.
- 작업 집합이 캐시보다 조금만 커도 LRU 계열은 0%까지 떨어질 수 있다.
- 벨라디 최적은 실제로 못 쓰지만, 같은 요청 기록으로 재면 정책이 얼마나 개선될 여지가 있는지 알려 준다.

## 더 알아보기
- 이전 글: 4편 「버디 할당자와 슬랩 할당자」
- 다음 글: 6편 「에셋 스트리밍: 예산 안에서 우선순위대로 불러오기」
- Redis 키 내보내기 문서: https://redis.io/docs/latest/develop/reference/eviction/
