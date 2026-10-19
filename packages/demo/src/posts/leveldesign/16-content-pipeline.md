# [레벨 디자인과 콘텐츠 제공 16/16] 콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포

> **한 줄 요약** — 콘텐츠를 데이터 테이블로 빼면 빌드 없이 고칠 수 있지만 오타 하나가 라이브 장애가 되므로, 참조·범위·확률 합·도달 가능성을 보는 검증기를 빌드마다 돌리고 검증기 자체를 무작위로 심은 오류로 시험하며, 배포는 내용 기반 청킹으로 바뀐 조각만 보낸다.

## 이 글에서 다루는 것
- 데이터 주도 설계: 콘텐츠를 코드와 분리하기
- 데이터 검증기와, 무작위 표 300개로 검증기를 시험하기
- 자동 빌드·서버 설정·기능 플래그의 자리
- 패치 배포: 고정 크기 조각 대 내용 기반 청킹, 재조립 검증

## 문제: 콘텐츠가 코드 안에 있으면
몬스터 체력이나 드롭 확률이 코드에 상수로 박혀 있으면 숫자 하나를 바꿀 때마다 프로그래머가 고치고 빌드해야 한다. 13편의 소모처 비율, 14편의 패스 단계 수처럼 라이브에서 자주 손보는 값일수록 비용이 크다. 그래서 **데이터 주도 설계**(data-driven design)는 콘텐츠를 표로 빼고 코드는 표를 읽어 동작만 정의한다. 언리얼 엔진의 데이터 테이블이 대표적이다. 공식 문서에 따르면 프로그래머가 행 구조체를 정의해 두면 기획자가 스프레드시트를 CSV로 저장해 에디터로 가져오고, 첫 열이 행의 키가 된다.

대가는 컴파일러가 해 주던 검사가 사라진다는 것이다. 표에 없는 아이템 ID를 적어도 빌드는 통과하고, 플레이어가 그 몬스터를 잡는 순간 드롭이 비거나 클라이언트가 멈춘다.

## 데이터 검증기
검사는 다섯 가지다. 키가 하나뿐인가, 다른 표를 가리키는 값이 실제로 있는가(참조 무결성), 숫자가 범위 안인가, 드롭 확률의 합이 1을 넘지 않는가, 모든 퀘스트에 도달할 수 있는가. 마지막은 선행 조건이 없는 퀘스트부터 열리는 것을 반복해서 넓히고, 끝까지 안 열리는 것을 보고한다. 4편의 막힘 검사를 표에 적용한 셈이다. 오류 여섯 가지를 심은 표로 시험한다(서로를 요구하는 퀘스트 한 쌍은 항목이 둘이라 기대하는 항목은 일곱 개다).
```python
def validate(db):
    """db: 표 이름 → 행 목록. 오류를 (종류, 표, 키) 집합으로"""
    err = set()
    for t in ("items", "monsters", "quests"):  # 1) 키는 하나뿐
        keys = [r[0] for r in db[t]]
        err |= {("중복 키", t, k) for k in keys if keys.count(k) > 1}
    items, tabs = {r[0] for r in db["items"]}, {r[0] for r in db["drops"]}
    for m, level, table in db["monsters"]:
        if not 1 <= level <= 60:  # 2) 범위
            err.add(("범위", "monsters", m))
        if table not in tabs:  # 3) 참조 무결성
            err.add(("참조", "monsters", m))
    total = {}
    for t, item, p in db["drops"]:
        if item not in items:
            err.add(("참조", "drops", t))
        total[t] = total.get(t, 0) + p
    err |= {("확률 합", "drops", t) for t, s in total.items() if s > 1 + 1e-9}
    req, opened = dict(db["quests"]), set()  # 4) 도달 가능성
    while new := {q for q, r in req.items()
                  if q not in opened and (r is None or r in opened)}:
        opened |= new
    return err | {("도달 불가", "quests", q) for q in req if q not in opened}

db = {"items": [("potion", 10), ("ore", 4), ("ore", 5)],  # ① 키 중복
      "monsters": [("slime", 1, "t1"), ("golem", 75, "t2"),  # ② 레벨 75
                   ("bat", 3, "t9")],  # ③ 없는 드롭 표
      "drops": [("t1", "potion", 0.3), ("t1", "ore", 0.8),  # ④ 합 1.1
                ("t2", "gem", 0.1)],  # ⑤ 없는 아이템
      "quests": [("q1", None), ("q2", "q1"), ("q3", "q4"), ("q4", "q3")]}  # ⑥
planted = {("중복 키", "items", "ore"), ("범위", "monsters", "golem"),
           ("참조", "monsters", "bat"), ("확률 합", "drops", "t1"),
           ("참조", "drops", "t2"), ("도달 불가", "quests", "q3"),
           ("도달 불가", "quests", "q4")}
found = validate(db)
print("심은 오류", len(planted), "찾은 오류", len(found),
      "놓침", len(planted - found), "오탐", len(found - planted))
print(sorted(e[2] for e in found))
```
```text
심은 오류 7 찾은 오류 7 놓침 0 오탐 0
['bat', 'golem', 'ore', 'q3', 'q4', 't1', 't2']
```
서로를 요구하는 q3·q4가 둘 다 잡혀 일곱 항목이 되고 놓침과 오탐이 0이다. 예 하나로는 부족하므로 앞 코드에 이어서 오류 없는 무작위 표 300개가 통과하는지, 표마다 오류를 한 종류씩 심었을 때 그 종류를 찾고 다른 종류를 지어내지 않는지 센다.
```python
import random

def random_db(r):  # 오류 없는 무작위 표
    return {"items": [(f"i{k}", r.randint(0, 500)) for k in range(20)],
            "drops": [(f"t{k}", f"i{r.randrange(20)}", r.uniform(0.01, 0.3))
                      for k in range(8) for _ in range(r.randint(1, 3))],
            "monsters": [(f"m{k}", r.randint(1, 60), f"t{r.randrange(8)}")
                         for k in range(10)],
            "quests": [(f"q{k}", f"q{r.randrange(k)}" if k else None)
                       for k in range(12)]}

def plant(db, kind, r):  # 한 종류의 오류를 심는다
    k = r.randrange(10)
    if kind == "중복 키":
        db["items"].append(r.choice(db["items"]))
    elif kind == "범위":
        db["monsters"][k] = (f"m{k}", r.choice([0, 61]), "t0")
    elif kind == "참조":
        db["monsters"][k] = (f"m{k}", 1, "t_none")
    elif kind == "확률 합":
        db["drops"].append((f"t{k % 8}", "i0", ADD))
    else:  # q0이 자손을 요구: 순환
        db["quests"][0] = ("q0", f"q{k + 1}")

def trial(seed):
    rng, clean, hit, mixed = random.Random(seed), 0, 0, 0
    for _ in range(300):
        db = random_db(rng)
        clean += not validate(db)
        kind = rng.choice(["중복 키", "범위", "참조", "확률 합", "도달 불가"])
        plant(db, kind, rng)
        kinds = {e[0] for e in validate(db)}
        hit += kind in kinds
        mixed += bool(kinds - {kind})
    return f"깨끗한 표 통과 {clean}, 심은 오류 검출 {hit}, 다른 종류 {mixed}"

for ADD in (0.95, 1.0):  # 확률 합 오류로 더할 값
    print(f"더하는 값 {ADD}: {trial(16)}")
```
```text
더하는 값 0.95: 깨끗한 표 통과 300, 심은 오류 검출 299, 다른 종류 0
더하는 값 1.0: 깨끗한 표 통과 300, 심은 오류 검출 300, 다른 종류 0
```
확률 합 오류로 0.95를 더하면 하나를 놓친다. 틀린 쪽은 검증기가 아니라 시험이다. 원래 합이 0.05 미만인 표에 0.95를 더해도 1을 넘지 않는다. 1.0을 더하면 모두 잡힌다. 검사 도구를 검사하면 이런 착각이 드러난다.

## 자동 빌드와 서버 설정
CI(지속적 통합)가 커밋마다 검증기를 돌려 오류가 있으면 빌드를 멈추면 실수가 출시 전에 걸린다. 4편의 막힘 검사와 9편·10편의 생성 결과 검사도 같은 자리에서 돌고, 시드를 기록해 두면 실패한 맵을 재현할 수 있다. 서버에서 내려주는 설정(remote config)은 드롭 확률이나 이벤트 기간을 업데이트 없이 바꾸게 하고, **기능 플래그**(feature flag)를 사용자 ID 해시로 일부에게만 켜면 단계적 출시와 A/B 테스트(15편)가 된다. 서버 설정도 데이터이므로 같은 검증기를 통과해야 한다.

## 패치 배포: 바뀐 조각만 보내기
콘텐츠는 보통 에셋 묶음(pack file)으로 배포된다. 묶음 전체를 다시 받게 하지 않으려면 파일을 조각으로 나눠 해시를 비교하고 클라이언트에 없는 조각만 보낸다. 게임 자원 관리 14편의 델타 압축을 파일에 옮긴 셈이다. 고정 크기로 자르면 가운데에 몇 바이트만 끼워 넣어도 그 뒤의 경계가 모두 밀린다. **내용 기반 청킹**(content-defined chunking)은 최근 바이트들의 롤링 해시가 조건을 만족하는 곳을 경계로 삼아, 삽입 지점을 지나면 경계가 다시 맞는다. Muthitacharoen·Chen·Mazières의 LBFS(SOSP 2001 논문)가 라빈 지문으로 이 방식을 쓴 대표적인 초기 사례다.

아래는 에셋 1,000개와 목차(이름 해시와 위치)로 된 묶음에서 가운데 에셋이 40바이트 커졌을 때의 패치 크기를 잰다. 목차에 절대 위치 대신 크기를 적는 방식도 비교하고, 가진 조각과 받은 조각만으로 새 파일을 재조립해 원본과 맞춘다.
```python
import hashlib, random, struct
rng = random.Random(6)
GEAR = [rng.getrandbits(32) for _ in range(256)]

def cdc(data, lo=64, hi=4096):  # 내용 기반 청킹(기어 해시)
    out, start, h = [], 0, 0
    for i, b in enumerate(data):
        h = ((h << 1) + GEAR[b]) & 0xFFFFFFFF
        n = i + 1 - start
        if (n >= lo and h >> 22 == 0) or n >= hi:  # 상위 10비트가 0이면 경계
            out.append(data[start:i + 1])
            start, h = i + 1, 0
    return out + [data[start:]] * (start < len(data))

def fixed(data):  # 고정 1KB 조각
    return [data[i:i + 1024] for i in range(0, len(data), 1024)]

def pack(assets, offsets):  # 목차(이름 해시 + 위치나 크기) + 에셋
    pos, toc = 0, b""
    for name, a in assets:
        toc += struct.pack("<QQ", name, pos if offsets else len(a))
        pos += len(a)
    return toc + b"".join(a for _, a in assets)

def patch(old, new, chunker):
    key = lambda c: hashlib.sha256(c).digest()
    store = {key(c): c for c in chunker(old)}  # 클라이언트가 가진 조각
    manifest = [key(c) for c in chunker(new)]  # 새 파일 = 조각 해시 목록
    send = {k: c for k, c in zip(manifest, chunker(new)) if k not in store}
    store.update(send)  # 받은 조각
    rebuilt = b"".join(store[k] for k in manifest)  # 재조립
    return sum(map(len, send.values())), rebuilt == new

assets = [(rng.getrandbits(64), rng.randbytes(rng.randint(100, 500)))
          for _ in range(1000)]
name, data = assets[500]  # 가운데 에셋이 40B 커진다
edited = assets[:500] + [(name, data + rng.randbytes(40))] + assets[501:]
for label, chunker, offsets in (("고정 1KB, 위치 목차", fixed, True),
                                ("내용 기반, 위치 목차", cdc, True),
                                ("내용 기반, 크기 목차", cdc, False)):
    old, new = pack(assets, offsets), pack(edited, offsets)
    size, ok = patch(old, new, chunker)
    print(f"{label}: 패치 {size:,}B ({size / len(new):.1%}), 재조립 {ok}")
```
```text
고정 1KB, 위치 목차: 패치 158,337B (49.6%), 재조립 True
내용 기반, 위치 목차: 패치 12,070B (3.8%), 재조립 True
내용 기반, 크기 목차: 패치 4,152B (1.3%), 재조립 True
```
고정 크기 조각은 파일의 절반을 다시 보낸다. 내용 기반 청킹은 3.8%로 줄고, 그중 대부분은 목차다. 절대 위치를 적은 목차는 뒤쪽 에셋 499개의 위치가 모두 바뀌어 목차의 절반(약 8KB)이 새 조각이 되고, 크기를 적으면 바뀐 항목이 하나라 1.3%까지 준다. 세 경우 모두 재조립 결과가 새 파일과 바이트 단위로 같다. 밸브의 스팀파이프(SteamPipe) 공식 문서도 파일을 약 1MB 조각으로 나눠 이전 빌드와 맞는 조각을 재사용한다고 설명하며, 묶음 목차의 절대 바이트 위치나 미리 압축·암호화한 데이터가 패치를 키운다고 짚는다.

## 한계와 주의
- 검증기는 규칙으로 적은 것만 잡는다. 범위 안이지만 경제를 무너뜨릴 드롭 확률(13편)은 시뮬레이션과 라이브 데이터로 잡는다.
- 무엇이든 데이터로 빼면 표가 리뷰하기 어려운 코드가 된다. 바꾸는 빈도와 바꾸는 사람으로 경계를 정한다.
- 서버 설정은 잘못된 값도 즉시 퍼지므로 일부에게 먼저 켜고 되돌리는 길을 시험해 둔다. 패치 실험은 압축을 무시한 무작위 바이트이니 실제 에셋은 자기 데이터로 잰다.

## 어디에 쓰이나
- 게임 자원 관리 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」: 확인된 상태와의 차이만 보내는 생각을 파일 배포로 옮기면 조각 해시 비교가 된다.
- 문자열 알고리즘 1편 「문자열 해싱과 라빈-카프」: 경계 판정은 라빈-카프처럼 창을 한 칸씩 밀며 갱신하는 롤링 해시다.
- 이산수학 10편 「그래프 탐색: BFS, DFS, 위상 정렬」: 퀘스트 도달 가능성 검사는 위상 정렬처럼 선행 조건이 풀린 것부터 열어 순환에 걸린 것을 남긴다.

## 정리
- 콘텐츠를 데이터로 분리하면 빌드 없이 고칠 수 있지만, 컴파일러가 하던 검사를 검증기가 대신해야 한다.
- 검증기는 키·참조·범위·확률 합·도달 가능성을 보고, 심은 오류와 무작위 오류 수백 개로 검증기 자체를 시험한다.
- 서버 설정과 기능 플래그는 업데이트 없이 값을 바꾸게 하되, 단계적으로 켜고 되돌릴 길을 둔다.
- 내용 기반 청킹은 삽입이 있어도 경계가 다시 맞아 패치를 작게 하고, 목차에 위치 대신 크기를 적으면 더 작아진다.

## 더 알아보기
- 이전 글: 15편 「데이터로 판단하기: 텔레메트리, 퍼널, 히트맵, A/B 테스트」
- 처음 글: 1편 「레벨 디자인이란: 플레이어의 경험을 공간으로 설계하기」
- Steamworks 문서 "Uploading to Steam": https://partner.steamgames.com/doc/sdk/uploading
