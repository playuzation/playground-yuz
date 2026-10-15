# [문자열 알고리즘 2/6] KMP: 실패 함수로 되돌아가지 않는 검색

> **한 줄 요약** — KMP는 패턴의 각 접두사에서 "접두사이면서 접미사인 가장 긴 부분"(실패 함수)을 미리 구해 두고, 불일치가 나면 텍스트를 되돌아가지 않고 패턴 안에서만 그 길이로 물러나 O(n + m)에 모든 일치를 찾으며, 같은 표로 문자열의 최소 주기도 구한다.

## 이 글에서 다루는 것
- 단순 검색이 O(nm)이 되는 입력
- 실패 함수(접두사 함수)의 의미와 O(m) 계산
- KMP 검색과 비교 횟수, 단순 검색과의 무작위 대조
- 실패 함수로 최소 주기 찾기, 상태 기계로 보기

## 예제 문제와 단순한 방법
텍스트 T(길이 n)에서 패턴 P(길이 m)가 나오는 시작 위치를 모두 찾는다. 단순한 방법은 시작 위치마다 P를 처음부터 맞춰 본다. 평범한 문장에서는 첫 글자에서 대개 어긋나 빠르지만, "aaaa…a"에서 "aa…ab"를 찾으면 매번 m − 1글자를 맞춘 뒤에야 실패해 약 nm번 비교한다.
```python
def naive_search(text, pat):
    found, comps = [], 0
    for i in range(len(text) - len(pat) + 1):
        j = 0
        while j < len(pat):
            comps += 1
            if text[i + j] != pat[j]:
                break
            j += 1
        if j == len(pat):
            found.append(i)
    return found, comps

print(naive_search("abababcabab", "abab"))
print("최악 입력 비교 횟수", naive_search("a" * 10000, "a" * 99 + "b")[1])
```
```text
([0, 2, 7], 19)
최악 입력 비교 횟수 990100
```
낭비는 이것이다. 99글자를 맞춘 뒤 실패하면 "텍스트의 그 99글자가 무엇인지" 이미 알고 있는데, 단순한 방법은 한 칸 옮겨 그 글자들을 다시 읽는다. **KMP**는 이미 아는 정보로 "다음에 어디서부터 맞춰 보면 되는지"를 미리 계산해 둔다. 모리스(Morris)와 프랫(Pratt)이 1970년 기술 보고서로 먼저 냈고, 크누스(Knuth)와 함께 1977년 SIAM 저널 논문 「Fast Pattern Matching in Strings」로 발표했다.

## 실패 함수: 접두사이면서 접미사인 것
문자열의 **경계**(border)는 자기 자신이 아니면서 접두사이자 접미사인 부분이다. "abacaba"의 경계는 "a"와 "aba"이고 가장 긴 것은 "aba"다. **실패 함수**(failure function, 접두사 함수라고도 한다) `pi[i]`는 `P[0..i]`의 가장 긴 경계의 길이다.
```text
P  : a b a c a b a b
pi : 0 0 1 0 1 2 3 2
```
검색 중 P의 앞 j글자가 맞고 다음 글자에서 어긋났다고 하자. 텍스트의 최근 j글자는 `P[:j]`와 같다. 패턴을 오른쪽으로 옮겨 다시 맞출 때, 새 위치에서 이미 겹쳐 있는 부분은 `P[:j]`의 접미사이면서 P의 접두사여야 한다. 즉 경계다. 가장 긴 경계 `pi[j−1]`만큼 겹치게 옮기는 것이 가장 작은 이동이므로, 그 사이에 있는 일치를 건너뛸 수 없다. 그리고 겹친 부분은 이미 맞다는 것을 알기에 텍스트를 되돌아가지 않고 `j = pi[j−1]`에서 비교를 이어 간다.
```text
T : … a b a c a b a c …
P :   a b a c a b a b
      7글자 맞고 c ≠ b
P :           a b a c a b a b
      경계 aba만큼 겹쳐 j = 3
```

## 실패 함수를 O(m)에 구하기
실패 함수 계산 자체가 "패턴을 자기 자신에서 검색"하는 일이다. `pi[i]`를 구할 때 `pi[i−1] = j`라면 `P[i] == P[j]`일 때 경계가 한 글자 늘어 j + 1이 된다. 다르면 다음으로 긴 경계 `pi[j−1]`로 물러나 다시 시도한다. 경계의 경계는 다시 경계이기 때문이다. 정의대로 모든 길이를 직접 확인하는 O(m³) 방법과 대조한다(앞 코드에 이어서).
```python
import random

def prefix_function(p):
    pi = [0] * len(p)
    j = 0                             # 직전 위치의 가장 긴 경계 길이
    for i in range(1, len(p)):
        while j > 0 and p[i] != p[j]:
            j = pi[j - 1]             # 다음으로 긴 경계로 물러난다
        if p[i] == p[j]:
            j += 1
        pi[i] = j
    return pi

def pi_brute(p):
    return [max(k for k in range(i + 1) if p[:k] == p[i + 1 - k:i + 1])
            for i in range(len(p))]

print(prefix_function("abacabab"))
rng = random.Random(2)
for _ in range(500):
    p = "".join(rng.choice("abc"[:rng.randint(1, 3)])
                for _ in range(rng.randint(1, 30)))
    assert prefix_function(p) == pi_brute(p)
print("무작위 500개 비교: 모두 일치")
```
```text
[0, 0, 1, 0, 1, 2, 3, 2]
무작위 500개 비교: 모두 일치
```
바깥 반복문 안에 while이 있지만 전체는 O(m)이다. j는 반복마다 최대 1 늘고, while은 돌 때마다 j를 1 이상 줄이며, j는 음수가 되지 않는다. 늘어난 총량이 m − 1 이하이니 줄어드는 횟수도 그 이하다. 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」의 반복문 세기를 전체 합으로 하는 **분할 상환**(amortized) 분석이다.

## KMP 검색
검색은 같은 일을 텍스트에 대해 한다. 패턴 전체가 맞으면 위치를 기록하고 `j = pi[m−1]`로 물러나 겹치는 다음 일치도 놓치지 않는다. 비교 횟수를 세어 단순한 방법과 견주고, 무작위 입력에서 결과를 대조한다(앞 코드에 이어서).
```python
def kmp_search(text, pat):
    pi, found, j, comps = prefix_function(pat), [], 0, 0
    for i, c in enumerate(text):
        while True:
            comps += 1
            if c == pat[j]:
                j += 1
                break
            if j == 0:
                break
            j = pi[j - 1]             # 텍스트는 그대로, 패턴만 물러난다
        if j == len(pat):
            found.append(i - j + 1)
            j = pi[j - 1]
    return found, comps

print(kmp_search("abababcabab", "abab"))
print("최악 입력 비교 횟수", kmp_search("a" * 10000, "a" * 99 + "b")[1])
for _ in range(500):
    t = "".join(rng.choice("ab") for _ in range(rng.randint(0, 50)))
    p = "".join(rng.choice("ab") for _ in range(rng.randint(1, 6)))
    assert kmp_search(t, p)[0] == naive_search(t, p)[0]
print("무작위 500개 비교: 모두 일치")
```
```text
([0, 2, 7], 12)
최악 입력 비교 횟수 19901
무작위 500개 비교: 모두 일치
```
같은 최악 입력에서 비교 횟수가 약 99만 번에서 2만 번 아래로 줄었다. 텍스트의 각 글자에서 성공한 비교는 한 번뿐이고, 실패한 비교는 j를 줄이므로 앞의 분할 상환 논리로 전체 2n 이하다.

## 응용: 최소 주기 찾기
p가 문자열 S(길이 m)의 **주기**라는 것은 모든 i에서 `S[i] == S[i+p]`라는 뜻이다. 이는 S를 p만큼 밀어도 겹친 부분이 같다는 것이므로, 길이 m − p인 경계가 있다는 것과 같다. 따라서 가장 긴 경계가 가장 짧은 주기를 준다.
```text
최소 주기 = m − pi[m−1]
m이 그 주기로 나누어떨어지면
S는 한 블록의 반복이다
```
정의대로 모든 p를 확인하는 방법과 대조한다(앞 코드에 이어서).
```python
def min_period(s):
    return len(s) - prefix_function(s)[-1]

def period_brute(s):
    return next(p for p in range(1, len(s) + 1)
                if all(s[i] == s[i + p] for i in range(len(s) - p)))

for s in ["abcabcabc", "abcabca", "aabaaba", "abcd"]:
    p = min_period(s)
    print(s, p, "반복" if len(s) % p == 0 and p < len(s) else "-")
for _ in range(500):
    s = "".join(rng.choice("ab") for _ in range(rng.randint(1, 30)))
    assert min_period(s) == period_brute(s)
print("무작위 500개 비교: 모두 일치")
```
```text
abcabcabc 3 반복
abcabca 3 -
aabaaba 3 -
abcd 4 -
무작위 500개 비교: 모두 일치
```
"abcabca"의 최소 주기는 3이지만 7이 3으로 나누어떨어지지 않아 "abc"를 정확히 반복한 문자열은 아니다. 이 판정은 "문자열을 가장 짧은 블록의 반복으로 압축" 같은 유형에 그대로 쓰인다.

## 상태 기계로 보기와 변형
j는 "지금까지 패턴의 몇 글자가 맞았나"라는 상태이고, 다음 글자를 읽으면 다음 상태가 정해진다. 상태 0~m과 글자별 전이를 표로 미리 펼쳐 두면 KMP는 한 글자에 표 조회 한 번인 **결정적 유한 오토마톤**(DFA)이 된다. 표는 O(m·σ) 메모리(σ는 알파벳 크기)를 쓰는 대신 while 루프가 사라진다.
- 패턴 + 구분자 + 텍스트를 이어 붙여 실패 함수를 구하면 값이 m인 곳이 일치다. 구분자는 두 문자열에 없는 글자여야 한다. 3편의 Z 알고리즘도 같은 기법을 쓴다.
- 자주 하는 실수: 일치 후 `j = 0`으로 되돌려 겹치는 일치(예: "aaa"에서 "aa")를 놓치거나, `pi[j]`와 `pi[j−1]`을 헷갈리는 것.
- 변형: 원형 문자열에서 회전 찾기(T + T에서 검색), 패턴이 여러 개면 4편 「아호-코라식: 여러 패턴을 한 번에 찾기」가 실패 함수를 트라이로 확장한다.

## 복잡도
| 방법 | 시간 | 추가 공간 |
|---|---|---|
| 단순 검색 | O(nm) 최악 | O(1) |
| 실패 함수 | O(m) | O(m) |
| KMP 검색 | O(n + m) | O(m) |
| DFA 표 | O(n + mσ) | O(mσ) |

실패 함수와 검색은 각각 비교 2m, 2n번 이하다. 1편의 라빈-카프도 기대 O(n + m)이지만 KMP는 확률 없이 최악에서도 선형이다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 4편 「순차 회로: 클록, 플립플롭, 메모리」: 전이 표로 펼친 KMP는 "현재 상태 + 입력 → 다음 상태"를 클록마다 계산하는 그 글의 상태 기계와 같은 구조라, 하드웨어 패턴 검출기로도 만들 수 있다.
- 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」: 이중 반복문처럼 보여도 j의 총 증감을 세면 선형이라는 것이 반복문 세기를 넘어선 분할 상환 분석의 대표 예다.
- CPython 문자열 검색: 2021년 CPython(3.10 개발 중)은 `str.find`의 최악 시간을 이차에서 선형으로 줄이려고, 패턴과 텍스트가 충분히 길 때 크로슈모르-페랭(Crochemore–Perrin)의 Two-Way 알고리즘 변형을 도입했다. KMP와 같은 목표를 추가 메모리 O(1)로 이룬다.

## 정리
- 실패 함수 `pi[i]`는 패턴 앞 i + 1글자의 가장 긴 경계(접두사 = 접미사) 길이다.
- 불일치가 나면 텍스트는 그대로 두고 패턴만 `pi[j−1]`로 물러나므로, 일치를 놓치지 않으면서 O(n + m)이다.
- 실패 함수 계산은 패턴의 자기 검색이고, 분할 상환으로 O(m)이다.
- 최소 주기는 `m − pi[m−1]`이고, 전이 표로 펼치면 KMP는 상태 기계가 된다.

## 더 알아보기
- 이전 글: 1편 「문자열 해싱과 라빈-카프」
- 다음 글: 3편 「Z 알고리즘: 모든 위치의 최장 공통 접두사」
- Knuth–Morris–Pratt algorithm(위키백과 영어판): https://en.wikipedia.org/wiki/Knuth%E2%80%93Morris%E2%80%93Pratt_algorithm
