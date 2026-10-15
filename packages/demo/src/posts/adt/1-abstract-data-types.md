# [추상 데이터 타입 심화 1/21] 추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기

> **한 줄 요약** — 추상 데이터 타입은 연산과 법칙만 정하고 구현은 비용표를 보고 고르는 것이며, 이 시리즈는 모든 구현을 느린 참조 구현과 같은 무작위 연산열로 비교하고 불변식을 매번 검사하는 모델 기반 무작위 검사로 확인한다.

## 이 글에서 다루는 것
- ADT = 연산 + 법칙: 스택과 큐를 등식으로 정의하기
- 파이썬 list·deque·heapq·dict·set은 어떤 ADT의 어떤 구현인가, 구현별 비용표
- 분할 상환 복습: 동적 배열 2배 늘리기를 회계 방법과 퍼텐셜로
- 원형 버퍼로 만든 덱과 모델 기반 무작위 검사

## 예제 문제: 리스트로 만든 대기열
요청을 순서대로 처리하는 대기열을 리스트로 짜면 흔히 `append(x)`로 넣고 `pop(0)`으로 꺼낸다. 답은 맞지만 `pop(0)`은 뒤의 원소를 모두 당기므로 O(n)이고, 10만 건이 쌓였다 빠지면 원소 이동이 약 5×10⁹번이다. `deque.popleft()`로 바꾸면 O(1)이고 코드는 한 줄만 바뀐다. 쓰는 쪽이 "넣은 순서대로 꺼낸다"는 약속에만 기대기 때문이다. 이 약속이 **추상 데이터 타입**(abstract data type, ADT)이다.

## ADT는 연산과 법칙이다
ADT는 연산의 목록과 연산들이 지켜야 할 **법칙**(공리)으로 정의한다. 1974년 리스코프(Barbara Liskov)와 질레스(Stephen Zilles)가 "객체는 정해진 연산으로만 다룬다"는 원칙으로 이 개념을 제안했다. 스택과 큐의 법칙을 등식으로 쓰면 다음과 같다. `pop`과 `deq`는 남은 구조와 꺼낸 값을 함께 돌려준다.
```text
스택
  top(push(s, x)) = x
  pop(push(s, x)) = (s, x)
  empty(new()) = True
큐 (아래 q는 빈 큐가 아니다)
  front(enq(new(), x)) = x
  front(enq(q, x)) = front(q)
  deq(enq(new(), x)) = (new(), x)
  deq(enq(q, x)) = (enq(q′, x), y)
    단, (q′, y) = deq(q)
```
스택의 둘째 법칙이 후입선출을, 큐의 마지막 법칙이 선입선출을 재귀적으로 말한다. 빈 구조에서 꺼내기는 오류로 약속한다. 법칙에는 배열도 포인터도 없으므로 법칙을 지키는 구현끼리는 바꿔 끼울 수 있고, 남는 차이는 **비용**뿐이다.

## 파이썬 내장 타입은 어떤 구현인가
| 파이썬 | ADT | 구현 |
|---|---|---|
| list | 스택, 인덱스 시퀀스 | 동적 배열 |
| collections.deque | 덱 | 64칸 블록의 이중 연결 리스트 |
| heapq + list | 우선순위 큐 | 배열 이진 힙 |
| dict, set | 맵, 집합 | 해시 테이블 |
| bisect + list | 정렬 집합 | 정렬 배열 |

`deque`는 양 끝이 O(1)이지만 가운데 인덱싱이 O(n)이고, `list`는 반대다. 구현별 차이는 정렬 집합(넣기·빼기·찾기와 "x 다음으로 큰 값")에서 가장 분명하다.

| 구현 | 넣기·빼기 | 찾기 | 다음 큰 값 |
|---|---|---|---|
| 정렬 배열 | O(n) | O(log n) | O(log n) |
| 균형 탐색 트리 | O(log n) | O(log n) | O(log n) |
| 해시 집합 | 기대 O(1) | 기대 O(1) | O(n) |

해시는 순서를 버려서 빠르고(16편), 정렬 배열은 갱신이 느리며, 균형 탐색 트리(7~12편)는 둘 다 로그로 맞춘다.

## 분할 상환 복습: 동적 배열 2배 늘리기
list의 `append`가 O(1)인 것은 **분할 상환**(amortized) 비용이다. 꽉 차면 더 큰 배열로 전부 복사하므로 그 한 번은 O(n)이지만, 크기를 **배수로** 늘리면 n번의 총 복사가 O(n)이다. 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」의 "연산 횟수 세기"를 연산열 전체에 적용하는 셈이다. CPython의 list는 소스 주석의 용량 0, 4, 8, 16, 24, 32, 40, 52, …처럼 약 1/8씩 여유를 더 잡는다. 10⁶개를 넣을 때의 복사 수를 세어 보자.
```python
def copies(n, grow):
    cap = size = moved = 0
    for _ in range(n):
        if size == cap:  # 꽉 참: 새 배열로 전부 복사
            moved, cap = moved + size, grow(cap)
        size += 1
    return moved

rules = [("2배", lambda c: max(1, 2 * c)),
         ("1.5배", lambda c: max(1, c + (c + 1) // 2)),
         ("CPython식", lambda c: (c + 1 + ((c + 1) >> 3) + 6) & ~3),
         ("1000칸씩", lambda c: c + 1000)]
n = 10**6
for name, grow in rules:
    print(f"{copies(n, grow) / n:7.2f}  {name}")
```
```text
   1.05  2배
   2.10  1.5배
   8.45  CPython식
 499.50  1000칸씩
```
배수로 늘리면 원소당 복사가 상수(1.05, 2.10, 8.45)에 머물고, 일정한 칸 수씩 늘리면 n/2000으로 n에 비례해 총 O(n²)이다. 2배 규칙의 총 복사는 1 + 2 + 4 + … < 2n이다. 실제 CPython은 `realloc`이 제자리에서 늘려 주면 복사를 피하기도 하므로 이 수는 상한이다.

**회계 방법**(accounting method)으로 보면 2배 규칙에서 `append`마다 3원을 낸다. 1원은 자기 자리에 쓰는 비용, 2원은 저금이다. 용량이 m/2에서 m으로 늘어난 뒤 다음 확장까지 m/2번 넣으므로 저금 m원이 쌓여 m개 복사를 갚는다. **퍼텐셜 함수**(potential function) `Φ = 2·size − cap`으로는 상각 비용 = 실제 비용 + ΔΦ를 계산한다.
```text
확장 없음: 1 + 2 = 3
size = cap = m에서 확장:
  실제 m + 1, Φ: m → 2
  (m + 1) + (2 − m) = 3
```
Φ는 처음에 0이고 늘 0 이상이라, 실제 총비용 ≤ 상각 총비용 ≤ 3n이다.

## 원형 버퍼로 만든 덱
**덱**(deque)은 양 끝에서 넣고 빼는 ADT다. 배열 하나를 고리처럼 쓰는 **원형 버퍼**(circular buffer)로 만들면 네 연산과 인덱싱이 모두 O(1)이다. 시작 위치 `head`와 개수 `size`만 두고 논리 위치 i를 물리 위치 `(head + i) % cap`으로 바꾼다.
```text
cap = 8, head = 6, size = 4
물리 [c][d][ ][ ][ ][ ][a][b]
논리 a b c d (6, 7, 0, 1번 칸)
```
꽉 차면 2배 배열로 옮기되 고리를 **논리 순서대로 펴서** 옮긴다. 확장은 앞 절과 같은 분할 상환 O(1)이다.
```python
class RingDeque:
    def __init__(self):
        self.buf, self.head, self.size = [None] * 4, 0, 0
    def __len__(self): return self.size
    def _at(self, i): return (self.head + i) % len(self.buf)
    def _grow(self):  # 논리 순서대로 펴서 2배로
        live = [self.buf[self._at(i)] for i in range(self.size)]
        self.buf, self.head = live + [None] * len(self.buf), 0
    def append(self, x):
        if self.size == len(self.buf): self._grow()
        self.buf[self._at(self.size)] = x
        self.size += 1
    def appendleft(self, x):
        if self.size == len(self.buf): self._grow()
        self.head = self._at(-1)
        self.buf[self.head] = x
        self.size += 1
    def _take(self, i):  # 칸 i를 비우고 값을 돌려준다
        if not self.size: raise IndexError
        x, self.buf[i] = self.buf[i], None
        self.size -= 1
        return x
    def pop(self): return self._take(self._at(self.size - 1))
    def popleft(self):
        x = self._take(self.head)
        self.head = self._at(1)
        return x
    def __getitem__(self, i):
        if not -self.size <= i < self.size: raise IndexError
        return self.buf[self._at(i % self.size)]

d = RingDeque()
for x in "cd": d.append(x)
for x in "ba": d.appendleft(x)
d.append("e")  # 꽉 찬 상태에서 확장
print([d[i] for i in range(len(d))], d.popleft(), d.pop(), d[-1])
```
```text
['a', 'b', 'c', 'd', 'e'] a e d
```

## 모델 기반 무작위 검사
이 시리즈는 모든 구현을 같은 틀로 확인한다. ① 느리지만 뻔히 맞는 **참조 구현**(모델)을 둔다. 여기서는 리스트에 `insert(0, x)`와 `pop(0)`을 쓰는 덱이다. ② 시드를 고정한 무작위 연산열을 두 구현에 똑같이 넣고 매 결과를 예외까지 비교한다. ③ 연산마다 **불변식**(용량이 2의 거듭제곱, head가 범위 안, 살아 있는 칸 밖은 빈칸)을 검사한다. 결과 비교는 법칙 위반을, 불변식 검사는 아직 드러나지 않은 내부 손상을 잡는다. 앞 코드에 이어서 실행한다.
```python
import random

class ListDeque:  # 참조 구현: 느리지만 뻔히 맞다
    def __init__(self): self.a = []
    def __len__(self): return len(self.a)
    def append(self, x): self.a.append(x)
    def appendleft(self, x): self.a.insert(0, x)
    def pop(self): return self.a.pop()
    def popleft(self): return self.a.pop(0)
    def __getitem__(self, i): return self.a[i]

def check(d):  # 불변식
    cap = len(d.buf)
    assert cap >= 4 and cap & (cap - 1) == 0
    assert 0 <= d.head < cap and 0 <= d.size <= cap
    live = {d._at(i) for i in range(d.size)}
    assert all(d.buf[j] is None for j in range(cap) if j not in live)

OPS = ["append", "appendleft", "pop", "popleft", "__getitem__", "__len__"]

def model_test(make, seed, steps=300):  # 어긋난 연산 번호, 없으면 0
    rng = random.Random(seed)
    d, ref = make(), ListDeque()
    for step in range(1, steps + 1):
        op, n = rng.choice(OPS), len(ref)
        args = ((rng.randrange(100),) if op.startswith("append") else
                (rng.randrange(-n - 1, n + 1),) if op == "__getitem__"
                else ())
        res = []
        for obj in (d, ref):
            try: res.append(getattr(obj, op)(*args))
            except IndexError: res.append("IndexError")
        try: check(d)
        except AssertionError: return step
        if res[0] != res[1]: return step
    return 0

fails = [s for s in range(500) if model_test(RingDeque, s)]
print("무작위 500개 연산열 비교:", "모두 일치" if not fails else fails)
```
```text
무작위 500개 연산열 비교: 모두 일치
```
검사가 정말 버그를 잡는지 보려고, 확장할 때 고리를 펴지 않고 뒤에 빈칸만 붙이는 흔한 실수를 심어 본다.
```python
class BuggyDeque(RingDeque):
    def _grow(self):  # 실수: 고리를 펴지 않는다
        self.buf = self.buf + [None] * len(self.buf)

bad = [b for b in (model_test(BuggyDeque, s) for s in range(500)) if b]
print(f"버그 판: 500개 중 {len(bad)}개 실패")
print(f"가장 빠른 실패: {min(bad)}번째 연산")
```
```text
버그 판: 500개 중 484개 실패
가장 빠른 실패: 5번째 연산
```
head가 0이 아닐 때 꽉 차면 고리가 끊긴다. 손으로 만든 예제는 head가 0인 채로 끝나기 쉬워 이 버그를 지나치지만, 무작위 연산열은 500개 중 484개가 잡았다. 놓친 16개는 대부분 꽉 찰 때마다 head가 마침 0이었다.

## 자주 하는 실수와 변형
- `pop(0)`으로 큐 만들기: 작은 입력에서는 안 보이다가 n이 커지면 O(n²)이 된다.
- 줄일 때의 함정: 절반이 비자마자 절반으로 줄이면 경계에서 넣기·빼기를 번갈아 할 때마다 O(n)이다. 1/4만 찼을 때 절반으로 줄여야 분할 상환 O(1)이 유지된다.
- 결과만 비교하면 꺼낸 칸에 남은 참조(누수)처럼 출력에 안 드러나는 손상을 놓친다.
- 변형: 꽉 차면 반대쪽 끝을 버리는 고정 크기 덱(`deque(maxlen=N)`)은 "최근 N개" 기록이다.

## 복잡도
| 연산 | 원형 버퍼 덱 | 리스트로 만든 덱 |
|---|---|---|
| 뒤에 넣기·빼기 | 분할 상환 O(1) | 분할 상환 O(1) |
| 앞에 넣기·빼기 | 분할 상환 O(1) | O(n) |
| 인덱싱 | O(1) | O(1) |
| 공간 | O(n) | O(n) |

- 2배씩 늘려 n번 넣기의 총 복사가 2n 미만이고, 나머지는 모듈러 계산 한 번이다.

## 어디에 쓰이나
- 게임 자원 관리 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」: 분할 상환 O(1)이어도 확장하는 그 한 프레임은 O(n)이라, 실시간 코드는 원형 버퍼 용량을 미리 잡아 확장을 없앤다.
- 알고리즘 기법 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」: 단조 덱이 덱 ADT의 대표적인 쓰임이고, 덱 연산이 O(1)이어야 전체가 O(n)이 된다.

## 정리
- ADT는 연산과 법칙으로 정의하고, 법칙을 지키는 구현끼리는 비용만 다르다.
- 파이썬 내장 타입도 같은 ADT를 서로 다른 구현으로 제공하므로, 연산 빈도와 비용표로 고른다.
- 배수로 늘리는 동적 배열은 Φ = 2·size − cap으로 append당 상각 3 이하다.
- 참조 구현과 같은 무작위 연산열을 돌리며 결과와 불변식을 매번 비교하는 것이 이 시리즈의 검증 방법이다.

## 더 알아보기
- 다음 글: 2편 「스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계」
- 리스코프·질레스(1974) 논문: https://doi.org/10.1145/942572.807045

## 시리즈 안내
1부 스택·큐·덱 1~2, 2부 우선순위 큐 3~6, 3부 균형 탐색 트리 7~12, 4부 특수한 키 13~15, 5부 해시와 확률적 구조 16~18, 6부 퍼시스턴트·시퀀스·저장소 19~21

1. **추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기** ← 지금 읽는 글
2. 스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계
3. 이중 우선순위 큐: 최소-최대 힙과 구간 힙
4. 병합 가능한 힙: 레프티스트 힙과 스큐 힙
5. 이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐
6. 피보나치 힙: 키 줄이기 O(1)과 다익스트라
7. AVL 트리: 높이 차를 1 이하로 유지하는 회전
8. 레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기
9. B-트리와 B+트리: 디스크 블록 하나에 키 수백 개
10. 스킵 리스트: 동전 던지기로 만드는 균형
11. 희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기
12. 정보를 덧붙인 트리: 순위 통계 트리와 구간 트리
13. k-d 트리: 다차원 범위 검색과 최근접 이웃
14. 기수 트리와 패트리샤 트리: 갈림길만 남긴 트라이
15. 반 엠데 보아스 트리: 정수 키를 O(log log U)에
16. 해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱
17. 블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합
18. 스트림 요약 구조: 카운트-민 스케치와 하이퍼로그로그
19. 퍼시스턴트 자료 구조: 경로 복사와 함수형 큐
20. 로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스
21. LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기

먼저 읽으면 좋은 글: 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」, 고급 자료 구조 1편 「힙과 우선순위 큐: 가장 급한 것부터 꺼내기」, 알고리즘 기법 5편 「슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에」, 심화 알고리즘 1편 「스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리」.
