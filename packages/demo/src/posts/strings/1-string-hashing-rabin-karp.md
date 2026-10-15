# [문자열 알고리즘 1/6] 문자열 해싱과 라빈-카프

> **한 줄 요약** — 문자열을 B진법 수로 보고 소수 M으로 나눈 나머지를 지문으로 쓰면, 접두사 해시 표 하나로 아무 구간이나 O(1)에 비교할 수 있고, 창을 한 칸씩 미는 롤링 해시로 패턴 검색(라빈-카프)과 "가장 긴 반복 부분 문자열" 같은 문제를 빠르게 푼다.

## 이 글에서 다루는 것
- 다항 해시와 접두사 해시: 구간 해시를 O(1)에
- 충돌 확률: 소수 모듈러, 무작위 밑, 생일 문제, 이중 해시
- 라빈-카프 검색과 가짜 일치 확인
- 이분 탐색 + 해시로 가장 긴 반복 부분 문자열

## 예제 문제: 두 구간이 같은가
길이 n인 문자열에서 "구간 [a, b)와 [c, d)가 같은가?"라는 질의가 q개 들어온다. 문자를 하나씩 비교하면 질의마다 최대 O(n)이라 전체 O(nq)이고, n과 q가 10만이면 100억 번이다. 비교할 문자열을 미리 **수 하나**로 요약해 두면 수 두 개만 비교하면 된다. 이 요약이 **해시**(hash)이고, 이 시리즈의 첫 글은 이 아이디어가 문자열 문제 전체에서 얼마나 멀리 가는지 본다. 이 시리즈의 모든 구현은 알고리즘 기법 1편 「입력 크기로 알고리즘 고르기: 복잡도 어림과 문제 읽기」에서 소개한 대로, 느리지만 확실한 방법과 무작위 입력에서 비교하는 **무작위 대조 검사**로 확인한다.

## 다항 해시와 접두사 해시
문자열 s₀s₁…sₘ₋₁을 B진법 수로 읽고 M으로 나눈 나머지를 해시로 쓴다. 이것이 **다항 롤링 해시**(polynomial rolling hash)다.
```text
H(s) = (s₀·Bᵐ⁻¹ + s₁·Bᵐ⁻² + … + sₘ₋₁)
       mod M
```
접두사 해시 `P[i] = H(s[0:i])`를 `P[i+1] = P[i]·B + sᵢ`로 미리 구해 두면, 구간 해시는 앞부분을 Bʳ⁻ˡ만큼 밀어서 빼면 된다. 10진수 12345에서 345를 꺼낼 때 `12345 − 12·10³`을 하는 것과 같다.
```text
H(s[l:r]) = P[r] − P[l]·Bʳ⁻ˡ  (mod M)
```
모듈러 연산 중간에 언제든 나머지를 취해도 된다는 성질(이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」) 덕분에 수가 커지지 않는다.
```python
import random

class StrHash:
    def __init__(self, s, mod=(1 << 61) - 1, base=None):
        self.mod = mod
        self.base = base or random.Random(7).randrange(1000, mod - 1)
        self.pre = [0] * (len(s) + 1)     # pre[i] = s[:i]의 해시
        self.pw = [1] * (len(s) + 1)      # pw[i] = base^i mod M
        for i, c in enumerate(s):
            self.pre[i + 1] = (self.pre[i] * self.base + ord(c)) % mod
            self.pw[i + 1] = self.pw[i] * self.base % mod

    def get(self, l, r):                  # s[l:r]의 해시를 O(1)에
        return (self.pre[r] - self.pre[l] * self.pw[r - l]) % self.mod

s = "abracadabra"
h = StrHash(s)
print(h.get(0, 4) == h.get(7, 11), s[0:4], s[7:11])
print(h.get(0, 4) == h.get(1, 5), s[0:4], s[1:5])
```
```text
True abra abra
False abra brac
```
문자 값으로 `ord(c)`를 그대로 쓴 데 주의하자. 'a'를 0으로 두면 "b"와 "ab"가 `1`과 `0·B + 1`로 같은 해시가 된다. 모든 문자 값은 1 이상이어야 한다.

## 충돌 확률: 무엇을 M과 B로 고르나
해시가 같아도 문자열이 다를 수 있다(**충돌**). 길이 L인 서로 다른 두 문자열의 해시 차이는 B에 대한 L−1차 다항식이고, M이 소수면 이 다항식의 근은 L−1개 이하다. 그래서 B를 무작위로 고르면 두 문자열이 충돌할 확률은 `(L−1)/M` 이하다. 문제는 비교가 한 번이 아닐 때다. 서로 다른 문자열 k개의 해시를 집합에 넣으면 쌍이 `k²/2`개라, 확률과 분포 2편 「조건부 확률과 독립」의 생일 문제처럼 기대 충돌 수가 `k²/(2M)`로 커진다. M = 10⁹ + 7에서 부분 문자열 10만 개를 넣으면 약 5쌍이 충돌한다. 작은 M으로 실험해 보자(앞 코드에 이어서).
```python
rng = random.Random(1)
k, trials = 300, 30
single = double = 0
for _ in range(trials):
    words = set()
    while len(words) < k:
        words.add("".join(rng.choice("abc") for _ in range(10)))
    h1 = [StrHash(w, 10007, 131).get(0, 10) for w in words]
    h2 = [StrHash(w, 10009, 137).get(0, 10) for w in words]
    single += k - len(set(h1))
    double += k - len(set(zip(h1, h2)))
print("기대 충돌(생일 근사)", round(k * (k - 1) / 2 / 10007, 2))
print("M=10007 평균 충돌", round(single / trials, 2))
print("이중 해시 평균 충돌", round(double / trials, 2))
```
```text
기대 충돌(생일 근사) 4.48
M=10007 평균 충돌 4.33
이중 해시 평균 충돌 0.0
```
M을 두 개 써서 해시를 쌍으로 비교하는 **이중 해시**(double hashing)는 충돌 확률을 대략 `1/(M₁M₂)`로 줄인다. 64비트 정수만 쓰는 C++·자바에서는 곱이 넘치지 않는 10⁹ 근처의 소수 두 개를 쓰는 것이 보통이다. 파이썬은 정수 크기 제한이 없으므로 메르센 소수 `2⁶¹ − 1` 하나로도 충분하다(위 `StrHash`의 기본값).

반대로 **오버플로에 맡기는 mod 2⁶⁴**는 소수가 아니라서 밑을 무엇으로 골라도 깨진다. 밑이 짝수면 `B⁶⁴ ≡ 0`이라 앞쪽 문자가 해시에서 사라지고, 홀수면 길이 2¹¹ = 2048인 투에-모스(Thue–Morse) 수열과 그 a·b를 뒤바꾼 문자열이 항상 충돌한다(이 두 문자열의 해시 차이는 홀수 B에 대해 언제나 2⁶⁴의 배수다).
```python
def h64(s, b):
    v = 0
    for c in s:
        v = (v * b + ord(c)) % 2**64
    return v

t = "a"
for _ in range(11):                       # 투에-모스 수열, 길이 2048
    t += t.translate(str.maketrans("ab", "ba"))
u = t.translate(str.maketrans("ab", "ba"))
odd = [rng.randrange(1, 2**64, 2) for _ in range(5)]
print("홀수 밑:", all(h64(t, b) == h64(u, b) for b in odd))
v, w = "x" + t[:99], "y" + t[:99]         # 첫 글자만 다르다
print("짝수 밑:", all(h64(v, b) == h64(w, b) for b in [2, 1 << 20]))
```
```text
홀수 밑: True
짝수 밑: True
```
그래서 소수 M과 **실행할 때 무작위로 고른 B**를 쓴다. 고정된 B와 M은 반례를 미리 만들어 둘 수 있다(알고리즘 기법 14편 「무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기」).

## 라빈-카프 검색
텍스트에서 길이 m인 패턴을 찾을 때, 길이 m짜리 창의 해시를 한 칸 밀 때마다 맨 앞 문자를 빼고 새 문자를 더해 O(1)에 갱신한다. 해시가 같을 때만 실제 문자열을 비교해 확인하므로, 충돌이 나도 답은 틀리지 않고 시간만 조금 더 든다. 카프(Karp)와 라빈(Rabin)이 1987년 IBM 저널 논문에서 이렇게 긴 문자열 대신 짧은 지문(fingerprint)을 비교하는 무작위 검색을 정리했다. 일부러 작은 M = 97로 가짜 일치가 생기게 하고 단순 검색과 대조한다(앞 코드에 이어서).
```python
def rabin_karp(text, pat, mod, base):
    n, m = len(text), len(pat)
    if m > n:
        return [], 0
    top = pow(base, m - 1, mod)           # 맨 앞 문자의 자리값
    hp = ht = 0
    for i in range(m):
        hp = (hp * base + ord(pat[i])) % mod
        ht = (ht * base + ord(text[i])) % mod
    found, fake = [], 0
    for i in range(n - m + 1):
        if hp == ht:
            if text[i:i + m] == pat:      # 해시가 같을 때만 직접 확인
                found.append(i)
            else:
                fake += 1
        if i + m < n:                     # 창을 한 칸 민다
            ht = ((ht - ord(text[i]) * top) * base + ord(text[i + m])) % mod
    return found, fake

def naive(text, pat):
    m = len(pat)
    return [i for i in range(len(text) - m + 1) if text[i:i + m] == pat]

total_fake = 0
for _ in range(500):
    text = "".join(rng.choice("ab") for _ in range(rng.randint(0, 40)))
    pat = "".join(rng.choice("ab") for _ in range(rng.randint(1, 5)))
    found, fake = rabin_karp(text, pat, 97, rng.randrange(2, 96))
    assert found == naive(text, pat)
    total_fake += fake
print(f"무작위 500개 비교: 모두 일치, 가짜 일치 {total_fake}번 걸러냄")
```
```text
무작위 500개 비교: 모두 일치, 가짜 일치 64번 걸러냄
```

## 이분 탐색과 결합: 가장 긴 반복 부분 문자열
"두 번 이상 나오는(겹쳐도 되는) 가장 긴 부분 문자열"을 찾아 보자. 길이 L짜리가 두 번 나오면 그 앞 L−1글자도 두 번 나오므로, "길이 L이 가능한가"는 L에 대해 단조다. 그러니 L을 이분 탐색하고(알고리즘 기법 3편 「이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기」), 판정은 길이 L인 모든 구간의 해시를 집합에 넣어 O(n)에 한다. 전체 O(n log n)이다. 부분 문자열을 모두 만들어 세는 O(n³) 완전 탐색과 대조한다(앞 코드에 이어서).
```python
def longest_repeat(s):
    h = StrHash(s)

    def where(L):                         # 길이 L이 두 번 나오면 시작 위치
        seen = set()
        for i in range(len(s) - L + 1):
            key = h.get(i, i + L)
            if key in seen:
                return i
            seen.add(key)
        return -1

    lo, hi = 0, max(len(s) - 1, 0)        # 답은 lo 이상 hi 이하
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if where(mid) >= 0:
            lo = mid
        else:
            hi = mid - 1
    i = where(lo) if lo else 0
    return s[i:i + lo]

def brute(s):
    best = 0
    for L in range(1, len(s)):
        subs = [s[i:i + L] for i in range(len(s) - L + 1)]
        if len(set(subs)) < len(subs):
            best = L
    return best

print(longest_repeat("banana"), longest_repeat("abracadabra"))
for _ in range(500):
    s = "".join(rng.choice("abc"[:rng.randint(1, 3)])
                for _ in range(rng.randint(0, 30)))
    assert len(longest_repeat(s)) == brute(s)
print("무작위 500개 비교: 모두 일치")
```
```text
ana abra
무작위 500개 비교: 모두 일치
```
같은 문제를 확률 없이 푸는 방법은 5편의 접미사 배열이다.

## 자주 하는 실수와 변형
- C++·자바에서 `P[r] − P[l]·Bʳ⁻ˡ`이 음수가 되면 M을 더해야 한다. 파이썬의 `%`는 항상 0 이상이다.
- 길이가 다른 구간의 해시를 비교하거나, 문자 값에 0을 쓰는 실수.
- 고정된 B와 M은 "안티 해시" 입력에 걸린다. 실행마다 무작위 B를 고르고, 필요하면 이중 해시를 쓴다.
- 변형: 회문 판정(뒤집은 문자열의 해시와 비교), 두 접미사의 최장 공통 접두사(LCP)를 이분 탐색으로 O(log n), 2차원 격자 패턴 검색(행 해시를 다시 해시).

## 복잡도
| 작업 | 해시 | 단순한 방법 |
|---|---|---|
| 전처리 | O(n) | 없음 |
| 구간 비교 | O(1) | O(n) |
| 패턴 검색 | 기대 O(n + m) | O(nm) |
| 가장 긴 반복 | O(n log n) | O(n³) |

라빈-카프에서 실제 일치가 많으면(예: "aaa…"에서 "aa") 확인 비교 때문에 O(nm)까지 갈 수 있다. 위치만 세고 확인을 생략하면 O(n + m)이지만, 그때는 답이 확률적으로만 맞는다. 공간은 접두사 해시와 거듭제곱 표로 O(n)이다.

## 어디에 쓰이나
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 해시 테이블의 `h mod m`과 같은 모듈러 성질 덕분에 창을 밀 때 빼고 곱하고 더하는 갱신이 나머지 위에서 그대로 성립한다.
- 확률과 분포 2편 「조건부 확률과 독립」: 해시를 집합에 많이 넣을수록 충돌이 `k²/(2M)`로 늘어나는 것이 생일 문제와 같은 계산이다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: vLLM의 접두사 캐싱은 KV 블록마다 "이전 블록의 해시 + 이 블록의 토큰"으로 해시를 매겨, 접두사 해시 `P[i+1] = f(P[i], sᵢ)`처럼 앞부분 전체가 같은 블록을 수 하나로 찾는다.
- rsync: 트리젤(Tridgell)과 매커라스(Mackerras)의 1996년 보고서가 설명하는 rsync는 바이트 단위로 미는 롤링 체크섬으로 모든 위치에서 일치하는 블록을 찾고, 변하지 않은 부분은 보내지 않는다.

## 정리
- 다항 해시는 문자열을 B진법 수의 나머지로 요약하고, 접두사 해시로 아무 구간의 해시나 O(1)에 구한다.
- M은 소수, B는 실행할 때 무작위로 고른다. 비교가 많으면 생일 문제로 충돌이 늘어나므로 큰 M이나 이중 해시를 쓴다.
- 라빈-카프는 해시가 같을 때만 직접 확인해 답이 틀리지 않게 하고, 해시 판정은 이분 탐색과 결합해 반복 부분 문자열 같은 문제를 푼다.

## 더 알아보기
- 다음 글: 2편 「KMP: 실패 함수로 되돌아가지 않는 검색」
- Rabin–Karp algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Rabin%E2%80%93Karp_algorithm

## 시리즈 안내
1. **문자열 해싱과 라빈-카프** ← 지금 읽는 글
2. KMP: 실패 함수로 되돌아가지 않는 검색
3. Z 알고리즘: 모든 위치의 최장 공통 접두사
4. 아호-코라식: 여러 패턴을 한 번에 찾기
5. 접미사 배열과 LCP 배열
6. Manacher 알고리즘: 회문을 선형 시간에 찾기
