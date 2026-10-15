# [문자열 알고리즘 5/6] 접미사 배열과 LCP 배열

> **한 줄 요약** — 접미사 배열은 모든 접미사를 사전순으로 정렬한 시작 위치 목록이고, 이웃한 접미사의 공통 접두사 길이(LCP 배열)와 함께 쓰면 서로 다른 부분 문자열 개수, 가장 긴 반복 부분 문자열, 패턴 검색을 해시 없이 확정적으로 푼다.

## 이 글에서 다루는 것
- 접미사 배열과 LCP 배열의 정의, 단순 정렬이 느린 이유
- 배가(prefix doubling) 알고리즘 O(n log² n)
- 카사이 알고리즘으로 LCP를 O(n)에
- 응용: 서로 다른 부분 문자열 개수, 가장 긴 반복, 패턴 검색, BWT

## 예제 문제: 접미사를 정렬하기
"banana"의 접미사 6개를 사전순으로 정렬하면 시작 위치가 [5, 3, 1, 0, 4, 2]가 된다. 이것이 **접미사 배열**(suffix array, SA)이다. 정렬된 순서에서 이웃한 두 접미사가 앞에서부터 몇 글자 같은지를 모은 것이 **LCP 배열**이다. 모든 부분 문자열은 어떤 접미사의 접두사이므로, 접미사를 정렬해 두면 부분 문자열에 관한 질문 대부분이 "정렬된 목록에서 이웃 보기"로 바뀐다.
```python
def sa_naive(s):
    return sorted(range(len(s)), key=lambda i: s[i:])

def lcp_naive(s, sa):
    def common(a, b):
        k = 0
        while max(a, b) + k < len(s) and s[a + k] == s[b + k]:
            k += 1
        return k
    return [common(sa[r - 1], sa[r]) if r else 0 for r in range(len(sa))]

s = "banana"
sa = sa_naive(s)
for r, (i, h) in enumerate(zip(sa, lcp_naive(s, sa))):
    print(r, i, h, s[i:])
```
```text
0 5 0 a
1 3 1 ana
2 1 3 anana
3 0 0 banana
4 4 0 na
5 2 2 nana
```
열은 차례로 순위, 시작 위치, LCP, 접미사다. 단순 정렬은 접미사 문자열을 실제로 만들어 비교하므로 비교 한 번이 O(n)이고, 전체 O(n² log n) 시간과 O(n²) 메모리가 든다. "aaaa…a"처럼 접미사끼리 길게 같으면 그대로 최악이 된다.

## 배가 알고리즘: 2ᵏ글자씩 늘려 정렬하기
만버(Manber)와 마이어스(Myers)가 1990년 SODA 학회에서 접미사 트리보다 메모리를 덜 쓰는 대안으로 접미사 배열을 제안하면서 쓴 아이디어가 **배가**(prefix doubling)다. 각 접미사의 앞 k글자 순위 `rank[i]`를 알면, 앞 2k글자의 순위는 쌍 `(rank[i], rank[i+k])`의 순위와 같다. 앞 2k글자를 비교하는 것은 앞 k글자를 먼저 비교하고, 같으면 다음 k글자를 비교하는 것이기 때문이다.
```text
앞 1글자 순위: 글자 자체
앞 2글자: (r₁[i], r₁[i+1]) 정렬
앞 4글자: (r₂[i], r₂[i+2]) 정렬
앞 8글자: (r₄[i], r₄[i+4]) 정렬
…  순위가 모두 다르면 끝
```
rₖ는 앞 k글자 기준 순위다. 순위는 "앞 k글자가 같은 접미사끼리 같은 번호"이므로 라운드마다 같은 번호 묶음이 더 잘게 쪼개진다. 2ᵏ ≥ n이면 모든 순위가 달라지므로 라운드는 log n번 정도이고, 라운드마다 정수 쌍 정렬 O(n log n)이라 전체 O(n log² n)이다. 정렬을 기수 정렬로 바꾸면 O(n log n)이 된다(앞 코드에 이어서).
```python
import random

def suffix_array(s):
    n = len(s)
    sa, rank, k = list(range(n)), [ord(c) for c in s], 1
    while n > 1:
        key = [(rank[i], rank[i + k] if i + k < n else -1)
               for i in range(n)]
        sa.sort(key=key.__getitem__)
        new = [0] * n
        for r in range(1, n):             # 같은 쌍이면 같은 순위
            prev, cur = sa[r - 1], sa[r]
            new[cur] = new[prev] + (key[cur] != key[prev])
        rank = new
        if rank[sa[-1]] == n - 1:         # 순위가 모두 다르다
            break
        k *= 2
    return sa

print(suffix_array("banana"))
```
```text
[5, 3, 1, 0, 4, 2]
```
뒷부분이 없는 접미사(i + k ≥ n)는 −1로 두어 더 짧은 쪽이 앞에 오게 한다. 사전순에서 접두사가 더 앞이라는 규칙 그대로다.

## 카사이 알고리즘: LCP를 O(n)에
이웃 쌍마다 직접 비교하면 O(n²)이다. 카사이(Kasai) 등이 2001년 CPM 학회에서 발표한 방법은 접미사를 **텍스트 순서**(i = 0, 1, 2, …)로 처리한다. 접미사 i와 정렬 순서에서 바로 앞 접미사 j의 LCP가 h(> 0)라면, 둘의 첫 글자를 떼어 낸 i + 1과 j + 1은 h − 1글자가 같고 정렬 순서도 그대로다. 정렬된 목록에서 바로 앞 이웃은 앞쪽의 어떤 접미사보다도 공통 접두사가 길거나 같으므로, 접미사 i + 1의 LCP는 적어도 h − 1이다. 그래서 h를 0부터 다시 세지 않고 h − 1에서 이어 센다. h는 전체에서 최대 n번 줄고 n 이하로 유지되니 늘어나는 횟수도 2n 이하다.

단순 방법과 무작위로 대조한다. 알파벳 크기 1~3에 길이 0~40이면 "aaaa"처럼 LCP가 긴 경우도 자주 나온다(앞 코드에 이어서).
```python
def kasai(s, sa):
    n = len(s)
    rank = [0] * n
    for r, i in enumerate(sa):
        rank[i] = r
    lcp, h = [0] * n, 0
    for i in range(n):                    # 텍스트 순서로
        if rank[i] == 0:
            h = 0
            continue
        j = sa[rank[i] - 1]               # 정렬 순서에서 바로 앞
        while i + h < n and j + h < n and s[i + h] == s[j + h]:
            h += 1
        lcp[rank[i]] = h
        h = max(h - 1, 0)                 # 다음 접미사는 적어도 h − 1
    return lcp

rng = random.Random(5)
for _ in range(500):
    s = "".join(rng.choice("abc"[:rng.randint(1, 3)])
                for _ in range(rng.randint(0, 40)))
    sa = suffix_array(s)
    assert sa == sa_naive(s) and kasai(s, sa) == lcp_naive(s, sa)
print("무작위 500개 비교: 모두 일치")
```
```text
무작위 500개 비교: 모두 일치
```

## 응용: 부분 문자열 질문들
- **서로 다른 부분 문자열 개수**: 순위 r의 접미사는 길이 1~n−sa[r]의 접두사를 주는데, 그중 앞 `lcp[r]`개는 바로 앞 접미사에서 이미 셌다. 따라서 `n(n+1)/2 − Σ lcp`다.
- **가장 긴 반복 부분 문자열**: 두 번 나오는 부분 문자열은 두 접미사의 공통 접두사이고, 공통 접두사가 가장 긴 쌍은 정렬 순서에서 이웃이다. 그래서 `max(lcp)`다. 1편에서 해시와 이분 탐색으로 푼 문제를 확률 없이 푼다.
- **패턴 검색**: P로 시작하는 접미사들은 접미사 배열에서 연속 구간을 이루므로, 이분 탐색 두 번으로 등장 횟수를 O(m log n)에 센다.

부분 문자열을 모두 만드는 완전 탐색과 대조한다(앞 코드에 이어서).
```python
from bisect import bisect_left, bisect_right

def distinct_count(s):
    return len(s) * (len(s) + 1) // 2 - sum(kasai(s, suffix_array(s)))

def longest_repeat(s):
    sa = suffix_array(s)
    lcp = kasai(s, sa)
    r = max(range(len(s)), key=lambda r: lcp[r], default=0)
    return s[sa[r]:sa[r] + lcp[r]] if s else ""

def count(s, sa, p):                      # P로 시작하는 접미사 구간
    key = lambda i: s[i:i + len(p)]
    return bisect_right(sa, p, key=key) - bisect_left(sa, p, key=key)

print(distinct_count("banana"), longest_repeat("banana"))
for _ in range(500):
    s = "".join(rng.choice("ab") for _ in range(rng.randint(0, 25)))
    subs = {s[i:j] for i in range(len(s)) for j in range(i + 1, len(s) + 1)}
    assert distinct_count(s) == len(subs)
    rep = max((len(x) for x in subs
               if sum(s.startswith(x, i) for i in range(len(s))) > 1),
              default=0)
    assert len(longest_repeat(s)) == rep
    p = "".join(rng.choice("ab") for _ in range(rng.randint(1, 3)))
    assert count(s, suffix_array(s), p) == sum(
        s.startswith(p, i) for i in range(len(s)))
print("무작위 500개 비교: 모두 일치")
t = "banana$"
print("BWT:", "".join(t[i - 1] for i in suffix_array(t)))
```
```text
15 ana
무작위 500개 비교: 모두 일치
BWT: annb$aa
```
마지막 줄은 **버로우즈-휠러 변환**(BWT)이다. 끝 표시 `$`를 붙인 문자열의 접미사 배열 순서대로 "각 접미사 바로 앞 글자"를 모으면, 같은 문맥 앞에 오는 글자들이 모여 "annb$aa"처럼 같은 글자가 뭉친다. 이 변환은 되돌릴 수 있어서 압축 전처리로 쓰인다.

## 자주 하는 실수와 변형
- 뒷부분이 없는 접미사의 순위를 0으로 두면 실제 순위 0과 섞인다. 모든 실제 순위보다 작은 값(−1)을 쓴다.
- LCP 배열의 인덱스 관례(`lcp[r]`이 r−1과 r 사이인지, r과 r+1 사이인지)를 섞는다.
- 두 문자열의 최장 공통 부분 문자열은 `s + "#" + t`의 접미사 배열에서 서로 다른 쪽에서 온 이웃 쌍의 LCP 최댓값이다. 구분자가 없으면 경계를 넘는 일치가 섞인다.
- 임의의 두 접미사의 LCP는 LCP 배열 구간의 최솟값이라, 고급 자료 구조 6편 「희소 테이블: O(1) 구간 최솟값 질의」와 묶으면 O(1)에 답한다.

## 복잡도
| 작업 | 시간 | 공간 |
|---|---|---|
| 단순 정렬 | O(n² log n) | O(n²) |
| 배가 | O(n log² n) | O(n) |
| 배가 + 기수 정렬 | O(n log n) | O(n) |
| 카사이 LCP | O(n) | O(n) |
| 패턴 등장 횟수 | O(m log n) | O(1) 추가 |

SA-IS처럼 선형 시간에 접미사 배열을 만드는 방법도 있다. 접미사 트리와 같은 질문에 답하면서도 정수 배열 두 개만 쓴다는 것이 접미사 배열의 장점이다.

## 어디에 쓰이나
- 이산수학 5편 「관계: 동치 관계와 순서 관계」: 접미사 정렬은 사전순이라는 전순서 위의 정렬이고, 배가 알고리즘의 순위는 "앞 2ᵏ글자가 같다"는 동치 관계의 동치류 번호로, 라운드마다 동치류가 더 잘게 나뉜다.
- bzip2: 버로우즈(Burrows)와 휠러(Wheeler)가 1994년 DEC 연구소 보고서에서 제안한 블록 정렬 압축(BWT)이 bzip2의 핵심이고, BWT는 위 코드처럼 접미사 배열에서 바로 얻는다.
- 유전체 분석: 리(Li)와 더빈(Durbin)의 BWA(2009)는 참조 유전체의 BWT 위에서 거꾸로 검색(backward search)하는 방식으로, 짧은 염기 서열 조각이 유전체의 어디에서 왔는지 빠르게 찾는다.

## 정리
- 접미사 배열은 접미사들의 사전순 정렬이고, LCP 배열은 정렬 순서에서 이웃한 접미사의 공통 접두사 길이다.
- 배가 알고리즘은 앞 k글자 순위 쌍으로 앞 2k글자 순위를 만들어 O(n log² n)에 정렬한다.
- 카사이 알고리즘은 텍스트 순서로 처리해 LCP가 한 번에 1 이상 줄지 않는 성질로 O(n)에 LCP를 구한다.
- 서로 다른 부분 문자열 개수는 `n(n+1)/2 − Σlcp`, 가장 긴 반복은 `max(lcp)`다.

## 더 알아보기
- 이전 글: 4편 「아호-코라식: 여러 패턴을 한 번에 찾기」
- 다음 글: 6편 「Manacher 알고리즘: 회문을 선형 시간에 찾기」
- Suffix array(위키백과 영어판): https://en.wikipedia.org/wiki/Suffix_array
