# [고급 자료 구조 4/12] 느리게 갱신되는 세그먼트 트리: 구간 갱신

> **한 줄 요약** — 레이지 전파는 구간 갱신을 통째로 덮이는 노드에서 멈추고 "자식에게 나중에 전할 갱신"을 메모해 두었다가 그 아래로 내려갈 일이 생길 때만 넘기는 기법으로, 구간 더하기·대입과 구간 합을 모두 O(log n)에 처리하며, 갱신이 여러 종류면 메모를 함수로 보고 합성 순서를 지켜야 한다.

## 이 글에서 다루는 것
- 구간 갱신을 점 갱신으로 쪼개면 느린 이유
- 레이지 전파: 덮는 노드에 메모를 남기고 필요할 때 내리기
- 구간 더하기 + 구간 합 구현과 대조 검사
- 구간 대입과 더하기를 함께: 갱신을 일차 함수로 보고 합성하기
- 합성 순서를 뒤집으면 틀린다는 것을 실험으로 확인

## 문제: 구간에 한꺼번에 더하기
"l~r번째에 모두 x 더하기"와 "l~r번째 합 구하기"가 섞여 들어온다. 3편 「세그먼트 트리: 구간 질의와 점 갱신」의 점 갱신을 원소마다 하면 길이 L인 구간에 O(L log n)이라 최악에는 O(n log n)이다. 알고리즘 기법 6편 「누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로」의 차분 배열은 갱신을 O(1)로 만들지만, 합 질의가 중간중간 끼면 매번 다시 누적해야 해서 O(n)이다. 갱신과 질의가 섞인 채로 둘 다 O(log n)이 되게 하는 것이 **레이지 전파**(lazy propagation)다.

## 아이디어: 덮는 노드에서 멈추고 메모하기
3편의 질의는 구간을 O(log n)개의 "통째로 덮이는 노드"로 쪼갰다. 갱신도 똑같이 쪼개서 그 노드들에서 멈춘다. 멈춘 노드는 자기 합을 `길이 × x`만큼 바로 고치고(그래서 이 노드를 쓰는 질의는 곧바로 맞는 답을 얻는다), 자식들에게는 "x를 더해야 함"이라는 메모(lazy 태그)만 남긴다. 나중에 어떤 갱신이나 질의가 그 노드 아래로 내려가야 할 때만 메모를 두 자식에게 넘긴다(push).
```text
update [0,5] += 1   (n = 8)

            [0,7]
        ┌─────┴─────┐
     [0,3]*       [4,7]
                 ┌──┴──┐
              [4,5]*  [6,7]

* 합을 고치고 메모를 남긴 노드
```
지키는 불변식은 두 가지다.
- 내려갈 때마다 push하므로, 어떤 노드에 도착했을 때 조상의 메모는 모두 내려와 있고 그 노드의 합은 정확하다.
- 메모 `lz[v]`는 "v의 자식들에게 아직 반영하지 않은 갱신"이다.

갱신이 방문하는 노드는 3편의 질의가 방문하는 노드와 똑같고, push는 방문한 노드에서 상수 시간 일만 한다. 그래서 갱신도 질의도 O(log n)이다.
```python
import random

class LazySum:                             # 구간 더하기 + 구간 합
    ID = 0                                 # "아무것도 안 함" 태그

    def __init__(self, n):
        self.n, self.visits = n, 0
        self.t = [0] * (4 * n)             # 노드 구간의 합
        self.lz = [self.ID] * (4 * n)      # 자식에게 아직 안 내린 갱신

    def _apply(self, v, l, r, x):          # 노드 구간 전체에 x를 더한다
        self.t[v] += x * (r - l + 1)
        self.lz[v] += x

    def _push(self, v, l, r):              # 내려가기 전에 태그를 넘긴다
        if self.lz[v] != self.ID:
            m = (l + r) // 2
            self._apply(2 * v, l, m, self.lz[v])
            self._apply(2 * v + 1, m + 1, r, self.lz[v])
            self.lz[v] = self.ID

    def update(self, ql, qr, x, v=1, l=0, r=None):
        r = self.n - 1 if r is None else r
        self.visits += 1
        if qr < l or r < ql:
            return
        if ql <= l and r <= qr:
            self._apply(v, l, r, x)        # 여기서 멈추고 메모만 남긴다
            return
        self._push(v, l, r)
        m = (l + r) // 2
        self.update(ql, qr, x, 2 * v, l, m)
        self.update(ql, qr, x, 2 * v + 1, m + 1, r)
        self.t[v] = self.t[2 * v] + self.t[2 * v + 1]

    def query(self, ql, qr, v=1, l=0, r=None):
        r = self.n - 1 if r is None else r
        if qr < l or r < ql:
            return 0
        if ql <= l and r <= qr:
            return self.t[v]
        self._push(v, l, r)
        m = (l + r) // 2
        return (self.query(ql, qr, 2 * v, l, m)
                + self.query(ql, qr, 2 * v + 1, m + 1, r))

rng = random.Random(9)
for _ in range(500):
    n = rng.randint(1, 30)
    a, st = [0] * n, LazySum(n)
    for _ in range(30):
        l, r = sorted(rng.randrange(n) for _ in range(2))
        if rng.random() < 0.5:
            x = rng.randint(-5, 5)
            for i in range(l, r + 1):      # 정의 그대로: 하나씩 더하기
                a[i] += x
            st.update(l, r, x)
        else:
            assert st.query(l, r) == sum(a[l:r + 1])
print("무작위 500개 비교: 모두 일치")

n = 100_000
st, total_len = LazySum(n), 0
for _ in range(1000):
    l, r = sorted(rng.randrange(n) for _ in range(2))
    total_len += r - l + 1
    st.update(l, r, 1)
print("구간 길이 평균:", total_len // 1000)
print("갱신당 방문 노드 평균:", st.visits // 1000)
```
```text
무작위 500개 비교: 모두 일치
구간 길이 평균: 33709
갱신당 방문 노드 평균: 59
```
원소를 하나씩 더하는 정의 그대로의 방법과 무작위 500개 경우에서 같다. n = 10만에서 평균 길이 3만 칸이 넘는 구간 갱신이 노드 59개 방문으로 끝난다.

## 갱신이 두 종류면: 일차 함수로 합성
구간 대입("l~r을 모두 c로")까지 섞이면 메모가 두 종류가 되고 순서가 문제다. "3 더하고 5로 대입"은 5지만 "5로 대입하고 3 더하기"는 8이다. 깔끔한 해결은 모든 갱신을 일차 함수 `x → a·x + b`로 보는 것이다. 더하기 v는 (1, v), 대입 c는 (0, c), 아무것도 안 함은 (1, 0)이다. 원소 L개의 합에는 `a·합 + b·L`로 한 번에 적용된다. 이미 메모 g = (a₀, b₀)가 있는 노드에 새 갱신 f = (a, b)가 오면 g를 먼저, f를 나중에 적용한 것이므로 새 메모는 `f∘g`다.
```text
(f∘g)(x) = a·(a₀·x + b₀) + b
         = (a·a₀)·x + (a·b₀ + b)
```
앞 코드에 이어서, `LazySum`의 push·갱신·질의는 그대로 두고 태그만 바꾼다. 비교를 위해 합성 순서를 뒤집은 `g∘f` 버전도 만든다.
```python
class AffineTree(LazySum):                 # 태그 = x → a·x + b
    ID = (1, 0)

    def __init__(self, n, right_order=True):
        super().__init__(n)
        self.right_order = right_order

    def _apply(self, v, l, r, f):
        a, b = f
        self.t[v] = a * self.t[v] + b * (r - l + 1)
        a0, b0 = self.lz[v]                # 먼저 와 있던 태그 g
        if self.right_order:               # g 다음에 f: f∘g
            self.lz[v] = (a * a0, a * b0 + b)
        else:                              # 순서를 뒤집은 잘못된 합성
            self.lz[v] = (a0 * a, a0 * b + b0)

def run(right_order, seed=10):
    rng, bad, total = random.Random(seed), 0, 0
    for _ in range(500):
        n = rng.randint(1, 30)
        a, st = [0] * n, AffineTree(n, right_order)
        for _ in range(30):
            l, r = sorted(rng.randrange(n) for _ in range(2))
            k, x = rng.random(), rng.randint(-5, 5)
            if k < 0.35:                   # 구간 더하기
                a[l:r + 1] = [y + x for y in a[l:r + 1]]
                st.update(l, r, (1, x))
            elif k < 0.7:                  # 구간 대입
                a[l:r + 1] = [x] * (r - l + 1)
                st.update(l, r, (0, x))
            else:
                bad += st.query(l, r) != sum(a[l:r + 1])
                total += 1
    return f"질의 {total}개 중 틀린 답 {bad}개"

print("올바른 합성:", run(True))
print("뒤집은 합성:", run(False))
```
```text
올바른 합성: 질의 4451개 중 틀린 답 0개
뒤집은 합성: 질의 4451개 중 틀린 답 1982개
```
올바른 합성은 한 번도 틀리지 않지만, 순서를 뒤집으면 질의의 약 45%가 틀린다. 더하기끼리 이어질 때는 순서를 바꿔도 같아서 일부 질의만 우연히 맞는다. 이런 버그는 작은 손 예제로는 잘 안 드러나므로 무작위 대조 검사가 특히 필요하다. 덤으로, 대입 태그의 "없음"을 0으로 표현하면 "0으로 대입"과 구분이 안 되는 흔한 버그가 있는데, 항등 함수 (1, 0)과 0 대입 (0, 0)은 저절로 구분된다.

## 레이지 전파가 되는 조건과 변형
노드 값이 3편의 모노이드이고 갱신이 함수일 때 다음 세 가지가 성립하면 레이지 전파를 쓸 수 있다.
- 함수를 노드 값에 바로 적용할 수 있다(합이라면 구간 길이도 필요하다).
- 두 함수의 합성이 다시 같은 꼴의 작은 표현이다(일차 함수의 합성은 일차 함수).
- 함수가 노드 합치기와 맞물린다: `f(x ∘ y) = f(x) ∘ f(y)`.

이 틀에 맞는 변형 유형으로 구간 더하기 + 구간 최솟값(최솟값에도 x를 더하면 된다), 구간 뒤집기(0과 1 반전) + 1의 개수(길이 − 개수), 구간 곱하기와 더하기를 소수 p로 나눈 나머지에서 섞기가 있다. 흔한 실수는 질의에서 push 빠뜨리기, 자식을 고친 뒤 부모 합을 다시 계산하지 않기, 합에 태그를 적용할 때 길이를 곱하지 않기다.

## 복잡도
| 방법 | 구간 갱신 | 구간 합 |
|---|---|---|
| 그냥 배열 | O(L) | O(L) |
| 점 갱신 트리 | O(L log n) | O(log n) |
| 차분 배열 | O(1) | O(n) |
| 레이지 트리 | O(log n) | O(log n) |

- L은 구간 길이다. 공간은 값 배열과 태그 배열 각 4n칸으로 O(n)이다. 연산 q개는 O(n + q log n)이다.

## 어디에 쓰이나
- 선형대수 4편 「선형 변환으로서의 행렬」: 태그 (a, b)는 2×2 행렬 `[[a, b], [0, 1]]`이고 태그 합성은 그 행렬들의 곱이라, 순서를 뒤집으면 틀리는 것이 "합성은 행렬 곱이고 순서가 중요하다"는 내용 그대로다.
- 이산수학 1편 「집합과 함수: 수학의 기본 언어」: `g∘f`는 f를 먼저 적용한다는 합성의 약속을 메모 갱신에 정확히 지켜야 한다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: 공유 블록을 누군가 쓰려 할 때만 복사하는 copy-on-write처럼, 레이지 전파도 일을 미뤄 두었다가 그 아래를 건드릴 때만 처리해 비용을 아낀다.

## 정리
- 구간 갱신을 통째로 덮이는 O(log n)개 노드에서 멈추고, 자식에게 줄 갱신은 메모로 남긴다.
- 노드에 내려갈 때마다 메모를 push하므로 방문한 노드의 값은 항상 정확하다.
- 갱신이 여러 종류면 일차 함수 (a, b)로 통일하고 `f∘g` 순서로 합성한다. 뒤집으면 무작위 검사에서 약 45%가 틀렸다.
- 함수 적용·합성이 작은 표현으로 닫히면 최솟값, 반전, 곱하기 같은 변형에도 그대로 쓴다.

## 더 알아보기
- 이전 글: 3편 「세그먼트 트리: 구간 질의와 점 갱신」
- 다음 글: 5편 「펜윅 트리: 비트 하나로 만드는 누적 합 트리」
