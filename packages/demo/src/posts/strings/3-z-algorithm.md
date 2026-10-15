# [문자열 알고리즘 3/6] Z 알고리즘: 모든 위치의 최장 공통 접두사

> **한 줄 요약** — Z 배열은 각 위치에서 시작하는 접미사가 문자열 전체와 몇 글자나 같게 시작하는지를 담고, 지금까지 찾은 가장 오른쪽 일치 구간 [l, r)을 거울처럼 재사용하면 O(n)에 모두 구해져 패턴 검색, 주기, 한 글자 틀린 검색까지 푼다.

## 이 글에서 다루는 것
- Z 배열의 정의와 O(n²) 단순 계산
- [l, r) 상자를 재사용하는 O(n) 알고리즘과 그 이유
- 구분자를 끼운 패턴 검색, 한 글자 틀린 위치 찾기
- KMP의 실패 함수와 비교, 서로 변환하기

## 예제 문제: 모든 위치의 최장 공통 접두사
문자열 s의 각 위치 i에 대해 "s[i:]가 s와 앞에서부터 몇 글자 같은가", 즉 최장 공통 접두사(LCP, longest common prefix)의 길이를 구하자. 이 값을 모은 것이 **Z 배열**이다. 관례상 `z[0]`은 n으로 둔다. "aabxaab"에서 위치 4의 "aab"는 전체와 3글자가 같으므로 `z[4] = 3`이다.
```text
i : 0 1 2 3 4 5 6
s : a a b x a a b
z : 7 1 0 0 3 1 0
```
위치마다 직접 비교하면 O(n²)이다. "aaaa…a"에서는 위치 i에서 n − i글자를 다 맞춰야 한다.
```python
def z_naive(s):
    n, comps = len(s), 0
    z = [0] * n
    for i in range(1, n):
        while i + z[i] < n:
            comps += 1
            if s[z[i]] != s[i + z[i]]:
                break
            z[i] += 1
    if n:
        z[0] = n
    return z, comps

print(z_naive("aabxaab")[0])
print("최악 입력 비교 횟수", z_naive("a" * 2000)[1])
```
```text
[7, 1, 0, 0, 3, 1, 0]
최악 입력 비교 횟수 1999000
```

## [l, r) 상자를 재사용하기
지금까지 찾은 일치 구간 중 오른쪽 끝이 가장 먼 것을 [l, r)이라 하자. `s[l:r]`은 접두사 `s[0:r−l]`과 같다(이것이 `z[l]`의 뜻이다). 이제 i가 상자 안(l < i < r)에 있으면, i는 접두사 쪽의 거울 위치 i − l에 대응한다.
```text
s  ├──A──┤ … ├──A──┤
   0    r−l  l     r
      ↑         ↑
      i−l       i
```
두 A가 같으므로 `s[i:r] = s[i−l:r−l]`이다. 그래서 `z[i]`는 적어도 `min(z[i−l], r − i)`이다.
- `z[i−l] < r − i`이면 일치가 상자 안에서 끝나므로 `z[i] = z[i−l]`로 확정된다. 비교가 필요 없다.
- 그렇지 않으면 r − i까지는 맞다는 것을 알고, r부터 새로 비교해 늘린다. 늘어난 만큼 r도 오른쪽으로 간다.

새로 성공하는 비교는 언제나 r을 1씩 밀고 r은 줄지 않으므로, 성공한 비교는 전체 n번 이하다. 실패한 비교는 위치마다 한 번이다. 그래서 O(n)이다. 단순한 방법과 무작위로 대조한다(앞 코드에 이어서).
```python
import random

def z_function(s):
    n = len(s)
    z, l, r, comps = [0] * n, 0, 0, 0
    for i in range(1, n):
        if i < r:
            z[i] = min(r - i, z[i - l])   # 상자 안: 거울 위치 값을 빌린다
        while i + z[i] < n:
            comps += 1
            if s[z[i]] != s[i + z[i]]:
                break
            z[i] += 1
        if i + z[i] > r:
            l, r = i, i + z[i]            # 상자를 오른쪽으로 옮긴다
    if n:
        z[0] = n
    return z, comps

print("최악 입력 비교 횟수", z_function("a" * 2000)[1])
rng = random.Random(3)
for _ in range(500):
    s = "".join(rng.choice("abc"[:rng.randint(1, 3)])
                for _ in range(rng.randint(0, 40)))
    assert z_function(s)[0] == z_naive(s)[0]
print("무작위 500개 비교: 모두 일치")
```
```text
최악 입력 비교 횟수 1999
무작위 500개 비교: 모두 일치
```

## 패턴 검색: 구분자를 끼워 이어 붙이기
패턴 P(길이 m)와 텍스트 T를 두 문자열에 없는 구분자로 이어 `P + "\0" + T`의 Z 배열을 구하면, T 쪽 위치에서 `z == m`인 곳이 정확히 P가 나오는 곳이다. 구분자 덕분에 z 값이 m을 넘지 못한다. 전체 O(n + m)이다(앞 코드에 이어서).
```python
def z_search(text, pat):
    m = len(pat)
    z = z_function(pat + "\0" + text)[0]
    return [i - m - 1 for i in range(m + 1, len(z)) if z[i] == m]

def naive(text, pat):
    m = len(pat)
    return [i for i in range(len(text) - m + 1) if text[i:i + m] == pat]

print(z_search("abababcabab", "abab"))
for _ in range(500):
    t = "".join(rng.choice("ab") for _ in range(rng.randint(0, 50)))
    p = "".join(rng.choice("ab") for _ in range(rng.randint(1, 6)))
    assert z_search(t, p) == naive(t, p)
print("무작위 500개 비교: 모두 일치")
```
```text
[0, 2, 7]
무작위 500개 비교: 모두 일치
```

## 변형: 한 글자까지 틀려도 되는 검색
"패턴과 최대 한 글자만 다른 구간을 모두 찾아라"는 KMP로는 바로 풀리지 않지만, Z 배열 두 개면 된다. 앞에서 맞는 길이 `pre[i]`(정방향 Z)와 뒤에서 맞는 길이 `suf[i]`(둘 다 뒤집은 문자열의 Z)를 구하면, 구간 [i, i+m)이 한 글자 이하로 다른 것은 `pre + suf ≥ m − 1`과 같다. 앞에서 처음 어긋난 자리 하나를 빼고 나머지가 뒤에서부터 다 맞는다는 뜻이기 때문이다. 해밍 거리를 직접 세는 방법과 대조한다(앞 코드에 이어서).
```python
def one_mismatch(text, pat):
    n, m = len(text), len(pat)
    zf = z_function(pat + "\0" + text)[0]
    zb = z_function(pat[::-1] + "\0" + text[::-1])[0]
    res = []
    for i in range(n - m + 1):
        pre = zf[m + 1 + i]               # 앞에서부터 맞는 길이
        suf = zb[m + 1 + (n - i - m)]     # 뒤에서부터 맞는 길이
        if pre + suf >= m - 1:
            res.append(i)
    return res

def brute(text, pat):
    m = len(pat)
    return [i for i in range(len(text) - m + 1)
            if sum(a != b for a, b in zip(text[i:i + m], pat)) <= 1]

print(one_mismatch("abcabdabe", "abc"))
for _ in range(500):
    t = "".join(rng.choice("abc") for _ in range(rng.randint(0, 40)))
    p = "".join(rng.choice("abc") for _ in range(rng.randint(1, 6)))
    assert one_mismatch(t, p) == brute(t, p)
print("무작위 500개 비교: 모두 일치")
```
```text
[0, 3, 6]
무작위 500개 비교: 모두 일치
```
같은 방식으로 최소 주기도 구한다. `i + z[i] == n`인 가장 작은 i가 최소 주기다(2편의 `m − pi[m−1]`과 같은 값).

## KMP와 비교
| 항목 | KMP 실패 함수 | Z 배열 |
|---|---|---|
| 담는 값 | 끝나는 경계 길이 | 시작하는 LCP |
| 검색 | 텍스트를 한 글자씩 | 이어 붙여 한 번에 |
| 스트리밍 | 가능 | 전체가 필요 |
| 시간 | O(n + m) | O(n + m) |

둘은 같은 정보를 다른 방향에서 본다. 위치 i에서 길이 `z[i]`인 일치가 시작되면, 그 안의 각 위치 i + k에서 끝나는 경계가 적어도 k + 1이다. 각 끝 위치에 대해 가장 왼쪽에서 시작한 일치가 가장 긴 경계를 주므로, i를 왼쪽부터 보며 아직 값이 없는 칸만 채우면 Z 배열에서 실패 함수를 O(n)에 얻는다. 정의대로 구한 실패 함수와 대조한다(앞 코드에 이어서).
```python
def z_to_pi(s):
    z, pi = z_function(s)[0], [0] * len(s)
    for i in range(1, len(s)):
        for k in range(z[i] - 1, -1, -1):  # 끝 i+k, 경계 k+1
            if pi[i + k]:
                break                      # 더 왼쪽 i가 이미 채웠다
            pi[i + k] = k + 1
    return pi

def pi_brute(p):
    return [max(k for k in range(i + 1) if p[:k] == p[i + 1 - k:i + 1])
            for i in range(len(p))]

for _ in range(500):
    s = "".join(rng.choice("ab") for _ in range(rng.randint(1, 30)))
    assert z_to_pi(s) == pi_brute(s)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```
안쪽 반복문이 이미 채운 칸에서 멈추므로 칸마다 한 번만 쓰여 전체 O(n)이다. 실무에서는 텍스트가 스트림으로 들어오면 KMP, 문자열 전체가 주어지고 "모든 위치의 LCP"가 바로 필요하면 Z가 편하다.

## 자주 하는 실수
- 상자 밖(i ≥ r)인데 `z[i−l]`을 빌리거나, `min(r − i, …)`을 빼먹어 상자 밖까지 맞다고 가정하는 것.
- 구분자를 빼먹어 z 값이 m을 넘는 경우를 놓치는 것. `z[i] >= m`으로 비교해도 되지만 구분자가 더 안전하다.
- `z[0]`의 관례(0 또는 n)를 섞어 쓰는 것.

## 복잡도
| 작업 | 시간 | 공간 |
|---|---|---|
| 단순 Z | O(n²) | O(n) |
| Z 알고리즘 | O(n) | O(n) |
| 패턴 검색 | O(n + m) | O(n + m) |
| 한 글자 틀린 검색 | O(n + m) | O(n + m) |

## 어디에 쓰이나
- 이산수학 11편 「점근 표기법: 알고리즘의 비용 세기」: 바깥 for와 안쪽 while이 겹쳐 있어도 "r은 줄지 않는다"는 하나의 사실로 전체 비교가 2n 이하임을 세는 분할 상환 분석이다.
- 동적 계획법 4편 「LCS와 편집 거리: 두 문자열을 맞추는 DP」: 일반적인 차이는 편집 거리 표가 O(nm)에 다루지만, 차이를 한 글자로 제한하면 정방향·역방향 Z 두 개로 선형에 끝난다.
- 생물정보학 교과서: 구스필드(Gusfield)의 『Algorithms on Strings, Trees, and Sequences』(1997)는 첫 장을 이 Z 값 계산을 뜻하는 "기본 전처리"(fundamental preprocessing)로 시작하고, 다른 정확한 매칭 알고리즘의 전처리를 이 위에서 유도한다.

## 정리
- `z[i]`는 s[i:]와 s의 최장 공통 접두사 길이다.
- 가장 오른쪽 일치 구간 [l, r) 안에서는 거울 위치 값 `min(z[i−l], r − i)`을 빌리고, r 밖만 새로 비교하므로 O(n)이다.
- `P + 구분자 + T`의 Z 배열에서 `z == m`인 곳이 일치이고, 역방향 Z와 합치면 한 글자 틀린 위치도 찾는다.
- 실패 함수와 Z 배열은 서로 O(n)에 변환되는 같은 정보다.

## 더 알아보기
- 이전 글: 2편 「KMP: 실패 함수로 되돌아가지 않는 검색」
- 다음 글: 4편 「아호-코라식: 여러 패턴을 한 번에 찾기」
