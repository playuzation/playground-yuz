# [메모리 시스템 7/10] 가상 메모리 하드웨어: 페이지 테이블 워크와 TLB

> **한 줄 요약** — x86-64는 48비트 가상 주소를 9비트씩 네 번 잘라 4단계 페이지 테이블을 하드웨어로 걷고, 이 비용을 숨기는 TLB의 도달 범위(항목 수 × 페이지 크기)를 넘으면 적재마다 메모리 읽기가 몇 번씩 붙으므로, 큰 메모리를 무작위로 쓰는 프로그램은 2MiB 큰 페이지로 도달 범위를 512배 늘린다.

## 이 글에서 다루는 것
- 48비트 가상 주소를 9·9·9·9·12비트로 나누는 4단계 페이지 테이블
- 하드웨어 페이지 테이블 워커(평평한 사전 조회와 대조)
- TLB 계층과 적중률 시뮬레이션(공식 1 − E/N과 대조)
- 큰 페이지(2MiB·1GiB), 5단계 페이징, PCID

## 병목: 모든 적재에 번역이 붙는다
트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」에서 본 대로 프로세스는 가상 주소를 쓰고, MMU가 모든 적재·저장마다 페이지 테이블에서 물리 주소를 찾는다. 그런데 테이블도 메모리에 있다. 번역에 메모리 읽기가 4번 필요하다면 적재 하나가 메모리 접근 5번이 된다. 이 글은 그 비용을 하드웨어가 어떻게 줄이는지 본다(페이지 폴트 처리는 그 글로 넘긴다).

## 4단계 페이지 테이블
x86-64는 64비트 주소 중 아래 48비트만 쓴다. 위 16비트는 47번 비트를 그대로 복사한 **정규형**(canonical) 주소여야 한다. 4KiB 페이지라면 아래 12비트가 페이지 안 오프셋이고, 남은 36비트를 9비트씩 네 조각으로 나눠 테이블 네 단계를 차례로 찾는다. 테이블 하나는 8바이트 항목 512개로 정확히 4KiB, 페이지 하나에 들어간다. 9라는 숫자가 여기서 나온다.
```text
 47-39  38-30  29-21  20-12  11-0
┌─────┬──────┬──────┬──────┬──────┐
│PML4 │ PDPT │  PD  │  PT  │offset│
└─────┴──────┴──────┴──────┴──────┘
CR3 → PML4[i0] → PDPT[i1]
    → PD[i2] → PT[i3] → frame
```
CR3 레지스터가 최상위 테이블(PML4)의 물리 주소를 가리키고, 각 항목은 다음 단계 테이블(마지막 단계는 데이터 페이지)의 물리 프레임 번호와 플래그를 담는다. 플래그에는 존재(P), 쓰기 허용(R/W), 사용자 접근(U/S), 접근됨(A), 더러움(D), 실행 금지(NX)가 있고, PD 항목의 **PS** 비트가 켜져 있으면 PT를 건너뛰고 그 자리에서 2MiB 페이지로 끝난다.

물리 메모리를 "프레임 번호 → 512칸 테이블" 사전으로 흉내 내고, 4KiB와 2MiB 페이지를 섞어 사상한 뒤, 워커가 낸 물리 주소를 정의 그대로의 평평한 사전 조회와 비교해 보자.
```python
import random

mem = {}                          # 물리 프레임 번호 → 512칸 테이블

def new_table():
    f = len(mem) + 1
    mem[f] = [None] * 512         # 항목 8바이트 × 512 = 4KiB
    return f

def split(va):
    """48비트 가상 주소 → [PML4, PDPT, PD, PT] 인덱스, 오프셋"""
    return [(va >> s) & 511 for s in (39, 30, 21, 12)], va & 0xFFF

cr3 = new_table()                 # CR3: 최상위 테이블의 물리 위치

def map_page(va, pfn, huge=False):
    """4KiB는 PT에, 2MiB는 PD에 항목을 둔다(PS 비트 = 1)"""
    idx, _ = split(va)
    t = cr3
    for i in idx[:2 if huge else 3]:
        if mem[t][i] is None:
            mem[t][i] = (new_table(), 0)
        t = mem[t][i][0]
    mem[t][idx[2 if huge else 3]] = (pfn, 1 if huge else 0)

def walk(va):
    """하드웨어 워커: (물리 주소 또는 None, 메모리 읽기 수)"""
    idx, off = split(va)
    t = cr3
    for level, i in enumerate(idx):
        e = mem[t][i]             # 메모리 읽기 한 번
        if e is None:
            return None, level + 1            # 페이지 폴트
        pfn, ps = e
        if ps:                                # PD에서 멈춘 2MiB 페이지
            return (pfn << 12) + (va & 0x1FFFFF), level + 1
        if level == 3:
            return (pfn << 12) + off, 4
        t = pfn

va = 0x7F3A_1234_5678
print("인덱스", split(va)[0], "오프셋", hex(split(va)[1]))

rng = random.Random(7)
ref4k, ref2m = {}, {}             # 정답: 페이지 번호 → 프레임 번호
for _ in range(200):
    vpn, pfn = rng.randrange(1 << 36), rng.randrange(1 << 28)
    if vpn >> 9 not in ref2m:
        ref4k[vpn] = pfn
        map_page(vpn << 12, pfn)
for _ in range(5):
    vpn2, base = rng.randrange(1 << 27), rng.randrange(1 << 19) << 9
    if all(v >> 9 != vpn2 for v in ref4k):
        ref2m[vpn2] = base
        map_page(vpn2 << 21, base, huge=True)

def translate(va):                # 정의 그대로의 평평한 사전 조회
    if va >> 12 in ref4k:
        return (ref4k[va >> 12] << 12) + (va & 0xFFF)
    if va >> 21 in ref2m:
        return (ref2m[va >> 21] << 12) + (va & 0x1FFFFF)
    return None

keys = [v << 12 for v in ref4k] + [v << 21 for v in ref2m]
tests = [rng.choice(keys) + rng.randrange(1 << 12) for _ in range(200)]
tests += [rng.randrange(1 << 48) for _ in range(100)]   # 대부분 미사상
ok = all(walk(v)[0] == translate(v) for v in tests)
refs = {walk(v)[1] for v in tests if translate(v) is not None}
print("무작위 300개 비교:", "모두 일치" if ok else "불일치")
print("성공한 워크의 메모리 읽기 수:", sorted(refs))
print(f"페이지 {len(ref4k) + len(ref2m)}개에 테이블 {len(mem)}개")
```
```text
인덱스 [254, 232, 145, 325] 오프셋 0x678
무작위 300개 비교: 모두 일치
성공한 워크의 메모리 읽기 수: [3, 4]
페이지 205개에 테이블 574개
```
4KiB 페이지는 메모리를 4번, 2MiB 페이지는 PD에서 멈춰 3번 읽는다. 48비트 공간에 흩어진 페이지 205개에 테이블이 574개(약 2.2MiB)나 든 것은 페이지마다 중간 테이블이 따로 필요해서다. 실제 프로그램은 주소가 몰려 있어 테이블 하나를 많은 페이지가 나눠 쓴다.

## 페이지 테이블 워커
x86에서는 TLB를 놓치면 **페이지 테이블 워커**(page table walker)라는 하드웨어가 위 과정을 직접 수행하고, 항목이 비어 있을 때만 페이지 폴트로 커널을 부른다(MIPS처럼 TLB 미스를 소프트웨어가 처리하던 ISA도 있었다). 워커의 읽기는 일반 데이터처럼 L1·L2 캐시를 거치고, 인텔 칩은 위쪽 단계 항목을 따로 담는 **페이징 구조 캐시**(paging-structure cache)를 두어 PD 항목이 남아 있으면 PT 하나만 읽는다. 그래서 실제 워크는 "DRAM 4번"보다 훨씬 싸지만, 그래도 TLB 적중보다 훨씬 느리고 캐시를 놓치면 DRAM 지연이 그대로 붙는다.

## TLB 계층과 도달 범위
**TLB**(translation lookaside buffer)는 최근 번역 결과(가상 페이지 → 물리 프레임)를 담는 작은 캐시다. 코어마다 명령용·데이터용 L1 TLB가 있고 그 뒤에 더 큰 L2 TLB(STLB)가 있다. 인텔 스카이레이크(클라이언트) 기준 L1 데이터 TLB는 4KiB용 64항목, 2MiB용 32항목, 1GiB용 4항목이고, STLB는 4KiB·2MiB 공용 1,536항목이다. TLB가 덮는 메모리 양을 **도달 범위**(TLB reach)라 하고, 항목 수 × 페이지 크기다. 1,536항목 × 4KiB = 6MiB다.

앞 코드에 이어서, STLB를 1,536항목 완전 연관 LRU로 단순화해 워크 수를 센다. 두 가지로 대조한다. 순차로 훑으면 워크 수가 건드린 페이지 수와 같아야 한다. N개 페이지를 고르게 무작위로 건드리면 정상 상태의 TLB에는 서로 다른 페이지 E개가 있으므로 적중 확률이 E/N, 놓침은 1 − E/N이어야 한다.
```python
from collections import OrderedDict

def tlb_walks(addrs, page_bits, entries=1536, warm=0):
    """완전 연관 LRU TLB: 놓친 횟수 = 워크 수(앞 warm번은 안 셈)"""
    tlb, walks = OrderedDict(), 0
    for k, a in enumerate(addrs):
        p = a >> page_bits
        if p in tlb:
            tlb.move_to_end(p)
        else:
            walks += k >= warm
            tlb[p] = True
            if len(tlb) > entries:
                tlb.popitem(last=False)
    return walks

rng = random.Random(3)
seq = range(0, 64 << 20, 64)                  # 64MiB를 64바이트씩
print("순차 64MiB: 워크", tlb_walks(seq, 12), "= 페이지 수", (64 << 20) >> 12)
for pages in (2048, 4096, 16384):
    addrs = [rng.randrange(pages << 12) for _ in range(200_000)]
    w = tlb_walks(addrs, 12, warm=100_000) / 100_000
    print(f"무작위 {pages}쪽: 놓침 {w:.3f}, 1 − E/N = {1 - 1536 / pages:.3f}")

N = 300_000                                   # 1GiB 무작위 8바이트 읽기
addrs = [rng.randrange(1 << 30) & ~7 for _ in range(N)]
for name, bits, depth in (("4KiB", 12, 4), ("2MiB", 21, 3)):
    w = tlb_walks(addrs, bits)
    print(f"1GiB 무작위 {name}: 도달 범위 {1536 << bits >> 20}MiB,",
          f"워크 {w / N:.1%}, 접근당 추가 읽기 {w * depth / N:.2f}")
```
```text
순차 64MiB: 워크 16384 = 페이지 수 16384
무작위 2048쪽: 놓침 0.251, 1 − E/N = 0.250
무작위 4096쪽: 놓침 0.624, 1 − E/N = 0.625
무작위 16384쪽: 놓침 0.905, 1 − E/N = 0.906
1GiB 무작위 4KiB: 도달 범위 6MiB, 워크 99.4%, 접근당 추가 읽기 3.98
1GiB 무작위 2MiB: 도달 범위 3072MiB, 워크 0.2%, 접근당 추가 읽기 0.01
```
순차 64MiB는 페이지마다 한 번, 16,384번만 걷는다. 64바이트 접근 64번이 한 페이지에 들어 놓침률이 1/64다. 무작위 접근은 공식과 소수 셋째 자리에서 맞는다. 1GiB를 무작위로 읽으면 4KiB 페이지에서는 99.4%가 워크이고, 워커가 메모리를 네 번 읽는다고 치면 적재 하나에 읽기 4번이 더 붙는다. 같은 접근을 2MiB 페이지로 하면 512페이지가 STLB에 다 들어가 처음 512번만 걷는다.

## 큰 페이지
2MiB 페이지는 PD 항목에 PS 비트를 켜서 PT 단계를 건너뛰고, 1GiB 페이지는 PDPT에서 멈춘다. 도달 범위가 512배(2MiB), 26만 배(1GiB)로 늘고 워크도 짧아진다. 리눅스는 미리 잡아 두는 `hugetlbfs`와, 커널이 알아서 2MiB로 묶는 **투명 큰 페이지**(THP)를 제공한다. 데이터베이스, JVM 힙, 큰 텐서처럼 GB 단위를 무작위로 건드리는 프로그램이 이득을 본다. 대가도 있다. 일부만 써도 2MiB가 통째로 잡히고(내부 단편화), 연속된 2MiB 물리 공간을 만들려고 커널이 페이지를 옮기는 압축(compaction)이 지연을 튀게 할 수 있다. 일부 데이터베이스가 THP를 끄라고 권하는 이유다.

## 5단계 페이징, PCID, 가상화
48비트는 256TiB다. 메모리가 테라바이트 단위인 서버에서는 이것도 빠듯해져, 인텔은 한 단계(PML5)를 더 얹은 **5단계 페이징**을 아이스레이크 세대 프로세서에서 처음 구현했다. 가상 주소가 57비트(128PiB)로 늘고 CR4의 LA57 비트로 켠다. 대가는 TLB를 놓쳤을 때 한 번 더 읽는 것이다.

문맥 교환으로 CR3가 바뀌면 이전 프로세스의 번역은 쓸모가 없어 예전에는 TLB를 통째로 비웠다. **PCID**(process-context identifier)는 CR3 아래 12비트에 번호를 두어 TLB 항목에 꼬리표를 단다. 꼬리표가 다른 항목은 무시하면 되니 비우지 않아도 된다(ARM의 ASID가 같은 장치다). 2018년 멜트다운 대응으로 커널과 사용자 페이지 테이블을 나눈 뒤(KPTI) 시스템 호출마다 CR3가 바뀌게 되면서, PCID는 그 비용을 줄이는 핵심이 되었다. 멜트다운의 원리는 CPU 마이크로아키텍처 5편 「재정렬 버퍼와 추측 실행: 틀린 미래를 되돌리는 법」에서 다룬다.

가상 머신에서는 게스트 테이블 항목의 주소마저 게스트 물리 주소라 호스트 테이블로 다시 번역해야 한다. 4단계 위에 4단계를 겹친 중첩 워크는 최악 `(4 + 1) × (4 + 1) − 1 = 24`번 메모리를 읽는다. 가상 머신에서 큰 페이지의 효과가 더 큰 이유다.

## 코드에 주는 의미
- 작업 집합을 바이트뿐 아니라 페이지 수로도 센다. 데이터가 캐시에 들어갈 만큼 작아도 페이지가 흩어져 있으면 TLB가 먼저 넘친다.
- GB 단위 해시 테이블·그래프를 무작위로 도는 프로그램은 큰 페이지를 먼저 시도한다(리눅스 `madvise(MADV_HUGEPAGE)`, JVM `-XX:+UseTransparentHugePages`).
- 작은 객체를 수많은 페이지에 흩지 말고 풀(pool)에 모은다.
- `perf stat -e dTLB-load-misses`로 TLB 놓침을 직접 잴 수 있다.

## 숫자로 보기
| 항목 | 값 |
|---|---|
| 가상 주소(4단계) | 48비트, 256TiB |
| 가상 주소(5단계) | 57비트, 128PiB |
| 테이블 하나 | 8바이트 × 512 = 4KiB |
| L1 DTLB(스카이레이크) | 4KiB 64 · 2MiB 32 · 1GiB 4 |
| STLB(스카이레이크) | 1,536항목(4KiB·2MiB 공용) |
| STLB 도달 범위 | 6MiB(4KiB) · 3GiB(2MiB) |
| 중첩 워크 최악 | 메모리 읽기 24번 |
| PCID | 12비트, 4,096개 |

- TLB 항목 수와 구성은 세대마다 다르다. 최근 코어일수록 L2 TLB가 수천 항목으로 커지는 추세다.

## 어디에 쓰이나
- 트랜지스터에서 자연어까지 10편 「운영체제: 기계를 나눠 쓰게 하는 층」: 그 글의 페이지 테이블과 페이지 폴트를 하드웨어가 실제로 어떻게 걷고 캐시하는지가 이 글이다.
- 어텐션 9편 「서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩」: KV 캐시를 블록 표로 찾는 설계는 페이지 테이블을 소프트웨어로 옮긴 것이고, 블록 크기 고르기는 이 글의 페이지 크기 맞바꿈과 같은 고민이다.
- 4편 「캐시를 아는 코드: 접근 순서, 블로킹, 프리페치」: 블로킹으로 작업 집합을 줄이면 캐시 미스와 함께 TLB 미스도 준다.
- 데이터베이스: PostgreSQL의 `huge_pages` 설정처럼 큰 공유 버퍼를 큰 페이지에 올리는 설정이 흔하다.

## 정리
- x86-64 4단계 페이징은 48비트 주소를 9·9·9·9·12비트로 나누고, 512항목짜리 4KiB 테이블을 하드웨어 워커가 차례로 읽는다.
- TLB가 워크를 숨기지만 도달 범위(1,536항목 × 4KiB = 6MiB)를 넘으면 무작위 접근의 놓침률은 1 − E/N으로 1에 다가간다.
- 1GiB 무작위 읽기에서 4KiB 페이지는 99.4%가 워크였고, 2MiB 페이지는 처음 512번뿐이었다.
- 5단계 페이징은 주소 공간을 넓히고, PCID는 문맥 교환 뒤의 TLB를 살리며, 가상화는 중첩 워크(최악 24번)라는 비용을 더한다.

## 더 알아보기
- 이전 글: 6편 「DDR 메모리와 메모리 컨트롤러: 채널, 버스트, 스케줄링」
- 다음 글: 8편 「HBM과 GDDR: 넓게 쌓은 메모리와 빠르게 달리는 메모리」
- [Intel 5-level paging (Wikipedia)](https://en.wikipedia.org/wiki/Intel_5-level_paging): 57비트 주소와 LA57 비트를 정리한 문서다.
