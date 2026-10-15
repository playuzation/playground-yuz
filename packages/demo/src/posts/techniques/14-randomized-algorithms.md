# [알고리즘 기법 14/14] 무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기

> **한 줄 요약** — 무작위 알고리즘은 계산에 동전 던지기를 섞어 어떤 입력도 늘 최악이 되지 못하게 하고(퀵셀렉트, 무작위 해시) 끝을 모르는 흐름에서도 공평하게 뽑게(저수지 표집) 하며, 답이 언제나 맞는 라스베이거스형과 작은 확률로 틀릴 수 있는 몬테카를로형으로 나뉜다.

## 이 글에서 다루는 것
- 퀵셀렉트: 무작위 피벗으로 기대 O(n)에 k번째 원소 찾기
- 라스베이거스와 몬테카를로
- 저수지 표집: 길이를 모르는 흐름에서 k개를 균등하게 뽑기
- 무작위 해시: 충돌을 노린 입력(안티 해시 테스트) 막기
- 시드 고정: 재현성과 예측 불가능성 사이

## 예제 문제: 중앙값 하나만 필요할 때
점수 n = 10⁶개에서 중앙값, 일반적으로 k번째로 작은 값을 구하자. 정렬하면 O(n log n)이지만 순서 전체가 필요한 것은 아니다. 1961년 호어(Hoare)가 "Find"라는 이름으로 발표한 **퀵셀렉트**(quickselect)는 피벗 하나를 골라 작은 쪽·같은 쪽·큰 쪽으로 나누고, k번째가 들어 있는 쪽만 계속 판다. 피벗이 매번 반을 가르면 n + n/2 + n/4 + … ≈ 2n이다. 그런데 피벗을 늘 첫 원소로 잡으면 이미 정렬된 입력에서 한 번에 하나씩만 줄어 n²/2 근처가 된다. 정렬된 입력은 실전에서 흔하고, 고정된 규칙은 누군가 일부러 최악을 만들 수도 있다. 피벗을 무작위로 고르면 특정 입력이 늘 나쁜 일은 사라진다.

왜 기대 O(n)인가. 피벗이 순위상 가운데 절반(n/4~3n/4)에 떨어질 확률은 1/2이고, 그러면 남는 쪽은 3n/4 이하다. 그런 피벗이 나올 때까지 기대 2번이면 되므로(기하 분포), 기대 작업량은 `2n + 2·(3/4)n + 2·(3/4)²n + … = 8n` 이하다. 실제 상수는 더 작다.
```python
import random

def quickselect(a, k, rng=None):          # k번째(0부터)로 작은 값, 일한 양
    work = 0
    while True:
        pivot = a[rng.randrange(len(a))] if rng else a[0]
        work += len(a)                    # 모든 원소를 피벗과 비교
        lo = [x for x in a if x < pivot]
        hi = [x for x in a if x > pivot]
        eq = len(a) - len(lo) - len(hi)
        if k < len(lo):
            a = lo
        elif k < len(lo) + eq:
            return pivot, work
        else:
            k, a = k - len(lo) - eq, hi

rng = random.Random(14)
for _ in range(500):
    a = [rng.randint(0, 9) for _ in range(rng.randint(1, 30))]
    k = rng.randrange(len(a))
    assert quickselect(a, k, rng)[0] == sorted(a)[k]
print("무작위 500개 비교: 모두 일치")
for n in [4000, 100000]:
    a = list(range(n))                    # 이미 정렬된 입력
    w = [quickselect(a, n // 2, rng)[1] / n for _ in range(20)]
    print(f"n={n} 무작위 피벗: 평균 {sum(w) / 20:.2f}n, 최대 {max(w):.2f}n")
print(f"n=4000 첫 원소 피벗: {quickselect(list(range(4000)), 2000)[1] / 4000:.0f}n")
```
```text
무작위 500개 비교: 모두 일치
n=4000 무작위 피벗: 평균 3.53n, 최대 5.02n
n=100000 무작위 피벗: 평균 3.44n, 최대 5.62n
n=4000 첫 원소 피벗: 1501n
```
무작위 피벗은 n이 25배가 되어도 약 3.5n으로 선형이고, 20번 중 가장 나쁜 경우도 6n을 넘지 않았다. 첫 원소 피벗은 정렬된 입력 4,000개에서 이미 1,501n, 곧 600만 번이다. 같은 값을 `eq`로 따로 모으지 않고 둘로만 나누면 모든 값이 같은 배열에서 다시 n²이 된다. 반복문으로 쓴 것도 이유가 있다. 재귀로 쓰면 첫 원소 피벗의 깊이가 2,000이 되어 파이썬 재귀 한도(기본 1,000)에 걸린다. 최악까지 O(n)이 필요하면 1973년 블룸·플로이드·프랫·리베스트·타잔의 중앙값의 중앙값(median of medians) 방법이 있지만 상수가 커서 실전에서는 무작위 피벗을 더 많이 쓴다.

## 라스베이거스와 몬테카를로
| 종류 | 답 | 실행 시간 |
|---|---|---|
| 라스베이거스 | 언제나 맞음 | 무작위(기대값) |
| 몬테카를로 | 작은 확률로 틀림 | 정해져 있음 |

퀵셀렉트는 답이 늘 맞고 시간만 운에 달린 **라스베이거스**(Las Vegas) 알고리즘이다. 1979년 바바이(Babai)가 **몬테카를로**(Monte Carlo) 알고리즘의 짝으로 이 이름을 붙였다. 몬테카를로형은 정해진 시간에 끝나지만 작은 확률로 틀린다. 수학·기하 알고리즘 6편 「밀러-라빈과 폴라드 로: 큰 수 소인수분해」의 소수 판정, 문자열 알고리즘 1편 「문자열 해싱과 라빈-카프」의 해시 비교가 그 예다. 한 번 틀릴 확률이 1/2 이하인 검사를 독립적으로 k번 되풀이하면 틀릴 확률은 (1/2)ᵏ 이하로 지수적으로 준다.

## 저수지 표집
로그가 끝없이 흘러들어와 전체 길이를 모르고 메모리에 다 담을 수도 없는데, 그중 k개를 균등하게 뽑고 싶다. **저수지 표집**(reservoir sampling)은 처음 k개를 저수지에 담고, i번째(0부터) 원소는 확률 k/(i + 1)로 저수지의 무작위 칸 하나를 대체한다. i개를 본 뒤 각 원소가 저수지에 있을 확률이 k/i라고 가정하고 귀납법으로 보이자.
```text
새 원소가 남을 확률: k/(i+1)
기존 원소가 쫓겨날 확률:
  k/(i+1) · 1/k = 1/(i+1)
기존 원소가 남을 확률:
  k/i · i/(i+1) = k/(i+1)
```
이 방법은 크누스가 워터먼(Waterman)의 것으로 소개한 알고리즘 R이고, 1985년 비터(Vitter)의 논문이 이를 정리하며 난수를 덜 쓰는 변형을 더했다. 원소마다의 확률뿐 아니라 k개 묶음 전체가 균등한지도 확인하자. n = 5, k = 2에서 쓰이는 난수는 `rand(3)`, `rand(4)`, `rand(5)` 셋이므로 가능한 난수열 60가지를 모두 따라가면 정확한 분포가 나온다.
```python
import random
from collections import Counter
from itertools import product

def reservoir(stream, k, rand):           # rand(m): 0..m-1 중 하나
    res = []
    for i, x in enumerate(stream):
        if i < k:
            res.append(x)                 # 처음 k개는 그대로 담는다
        else:
            j = rand(i + 1)               # x를 확률 k/(i+1)로 남긴다
            if j < k:
                res[j] = x
    return res

# 정확한 검증: n=5, k=2에서 가능한 난수열 3·4·5 = 60가지를 모두 따라간다
paths = list(product(range(3), range(4), range(5)))
sets = Counter()
for path in paths:
    it = iter(path)
    sets[frozenset(reservoir(range(5), 2, lambda m: next(it)))] += 1
print(len(sets), "가지 부분집합, 경로 수", set(sets.values()))

rng = random.Random(14)
hits = Counter()
for _ in range(30000):
    hits.update(reservoir(range(10), 3, rng.randrange))
freq = [hits[x] / 30000 for x in range(10)]
print(f"n=10, k=3: 뽑힌 비율 {min(freq):.3f}~{max(freq):.3f} (기대 0.300)")
```
```text
10 가지 부분집합, 경로 수 {6}
n=10, k=3: 뽑힌 비율 0.296~0.304 (기대 0.300)
```
C(5, 2) = 10가지 부분집합이 모두 정확히 6가지 경로에서 나오므로 완전히 균등하다. 이렇게 난수를 함수로 주입하면 확률 알고리즘도 모든 경우를 열거해 정확히 검증할 수 있다. `rand(i + 1)`을 `rand(i)`로 쓰는 한 칸 실수는 이 검사에서 바로 드러난다.

## 무작위 해시: 안티 해시 테스트 막기
해시 테이블이 평균 O(1)인 것은 키가 칸에 고르게 퍼진다는 가정 덕분이다. 해시 함수가 고정되어 있고 알려져 있으면, 공격자는 모두 같은 칸에 떨어지는 키를 골라 넣을 수 있다. 그러면 삽입마다 같은 칸의 키를 모두 비교해 전체가 n²/2가 된다. 온라인 저지의 **안티 해시 테스트**(anti-hash test)가 이것이고, 웹 서버에서는 서비스 거부 공격이 된다. 방어는 프로그램이 시작할 때 해시 함수를 미리 정한 함수 묶음(family)에서 무작위로 고르는 것이다. 1979년 카터(Carter)와 웨그먼(Wegman)의 **유니버설 해싱**(universal hashing)은 소수 p와 무작위 a, b로 `h(x) = ((a·x + b) mod p) mod m`을 쓴다. 공격자가 a, b를 모르는 한 서로 다른 두 키가 충돌할 확률은 입력과 상관없이 대략 1/m이다.
```python
import random

P = (1 << 61) - 1                         # 소수

class ChainSet:                           # 체이닝 해시 집합, 비교 횟수를 센다
    def __init__(self, m, rng=None):
        self.m, self.buckets, self.cmp = m, [[] for _ in range(m)], 0
        self.a = rng.randrange(1, P) if rng else None
        self.b = rng.randrange(P) if rng else 0
    def _h(self, x):
        if self.a is None:
            return x % self.m             # 값을 거의 그대로 쓰는 해시
        return (self.a * x + self.b) % P % self.m   # 무작위로 고른 해시
    def add(self, x):
        bucket = self.buckets[self._h(x)]
        for y in bucket:
            self.cmp += 1
            if y == x:
                return
        bucket.append(x)
    def __contains__(self, x):
        return x in self.buckets[self._h(x)]

rng = random.Random(14)
for _ in range(300):
    s, ref = ChainSet(rng.randint(1, 8), rng), set()
    for _ in range(40):
        x = rng.randint(-20, 20)
        s.add(x); ref.add(x)
    assert all((x in s) == (x in ref) for x in range(-25, 26))
print("무작위 300개 비교: 모두 일치")
m, n = 1024, 5000
evil = [i * m for i in range(n)]          # m의 배수만 골라 넣는 공격 입력
for name, s in [("x mod m", ChainSet(m)), ("무작위 해시", ChainSet(m, rng))]:
    for x in evil:
        s.add(x)
    print(f"{name}: 비교 {s.cmp}번, 가장 긴 사슬 {max(map(len, s.buckets))}")
print(hash(P), hash(10**18) == 10**18 % P)
```
```text
무작위 300개 비교: 모두 일치
x mod m: 비교 12497500번, 가장 긴 사슬 5000
무작위 해시: 비교 10079번, 가장 긴 사슬 7
0 True
```
고정 해시는 5,000개가 한 사슬에 몰려 정확히 n(n − 1)/2번 비교했고, 무작위 해시는 1,200배 넘게 적다. 마지막 줄은 파이썬 자신의 정수 해시가 2⁶¹ − 1로 나눈 나머지라는 고정된 식임을 보여 준다. 파이썬 3.3부터 문자열·바이트 해시는 프로세스마다 다른 무작위 값을 섞지만(PYTHONHASHSEED), 정수 해시는 그렇지 않다. 정수 키를 쓰는 해시 테이블이 공격 입력에 취약할 수 있는 이유다.

## 시드 고정
- 대조 검사와 디버깅에서는 `random.Random(시드)`로 시드를 고정한다. 실패한 입력을 그대로 다시 만들 수 있어야 고칠 수 있다. 전역 `random` 대신 객체를 따로 두면 다른 코드가 난수를 꺼내 가도 순서가 흔들리지 않는다. 이 시리즈의 모든 코드가 그렇게 돌았다.
- 상대가 내 코드를 보고 입력을 고를 수 있을 때(해킹이 있는 대회, 공개 서버)는 시드를 예측할 수 없어야 한다. `os.urandom`이나 `secrets`로 시드를 만들되 값을 기록해 두면, 예측 불가능성과 재현성을 함께 얻는다.

## 자주 하는 실수와 변형
- 무작위 값을 소스에 상수로 박아 두면 코드가 공개되는 순간 고정 해시와 같아진다.
- 무작위성에 기대는 코드를 시드 하나로만 시험하면 운 좋은 경우만 본다. 시드를 바꿔 가며 최대값도 본다(위의 "최대 5.62n").
- 변형: 무작위 퀵정렬, 피셔-예이츠 섞기, 가중치 저수지 표집, 무작위 우선순위로 균형을 잡는 고급 자료 구조 8편 「트립: 무작위로 균형을 잡는 이진 탐색 트리」.

## 복잡도
| 알고리즘 | 기대 | 최악 |
|---|---|---|
| 퀵셀렉트(무작위 피벗) | O(n) | O(n²), 확률 극히 작음 |
| 저수지 표집 | O(n) 시간, O(k) 공간 | 같음 |
| 무작위 해시 연산 | O(1) | O(n) |
- 비교 대상: 정렬 후 선택은 O(n log n), 고정 해시는 공격 입력에서 연산당 O(n)이다.

## 어디에 쓰이나
- 확률과 분포 4편 「확률 변수와 기댓값」: 퀵셀렉트의 기대 O(n)은 그 글의 기댓값 선형성으로 단계마다의 기대 작업량을 더한 것이다.
- 확률과 분포 11편 「표본 추출과 몬테카를로 방법」: 그 글의 의사 난수와 시드가 이 글의 재현성 문제이고, 몬테카를로 알고리즘이라는 이름도 그 방법에서 왔다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 그 글의 해시 테이블 인덱스 `h mod m`은 h가 고정이면 공격받을 수 있고, 무작위 a, b를 섞는 `(a·x + b) mod p mod m`이 그 방어다.

## 정리
- 무작위 피벗은 어떤 입력도 늘 최악이 되지 못하게 해 퀵셀렉트를 기대 O(n)으로 만든다.
- 라스베이거스형은 답이 늘 맞고 시간이 무작위, 몬테카를로형은 시간이 정해지고 작은 확률로 틀린다.
- 저수지 표집은 i번째 원소를 확률 k/(i + 1)로 남겨 길이를 모르는 흐름에서도 균등한 k개를 O(k) 메모리로 뽑는다.
- 해시 함수를 실행 때 무작위로 고르면 충돌 공격을 막고, 시드는 시험할 때 고정하고 상대가 있을 때 숨기되 기록한다.

## 더 알아보기
- 이전 글: 13편 「제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게」
- 처음 글: 1편 「입력 크기로 알고리즘 고르기: 복잡도 어림과 문제 읽기」
- [Reservoir sampling (Wikipedia)](https://en.wikipedia.org/wiki/Reservoir_sampling)
