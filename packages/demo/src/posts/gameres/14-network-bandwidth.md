# [게임 자원 관리 14/14] 네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화

> **한 줄 요약** — 서버가 틱마다 보내는 바이트는 "보일 만한 것만(관심 영역), 필요한 정밀도만(양자화), 클라이언트가 확인한 상태에서 바뀐 것만(델타)" 보내면 36분의 1로 줄고, 그래도 예산을 넘으면 우선순위를 누적해 아무도 굶지 않게 나눠 보낸다.

## 이 글에서 다루는 것
- 틱당 바이트 예산 계산
- 위치·방향 양자화와 오차 한계
- 관심 영역(AOI) 필터링과, 확인된 스냅숏 대비 델타 압축(패킷 손실 포함)
- 우선순위 누적으로 예산을 공정하게 나누기

## 예제: 틱마다 10KB
서버가 초당 20번(틱) 세계 상태를 클라이언트에게 보낸다. 물체는 500개이고, 하나의 상태는 id 2바이트, 위치 x·y·z와 방향을 float32로 16바이트, 체력 2바이트, 애니메이션 1바이트를 합친 21바이트다. 전부 보내면 틱당 10,500바이트, 초당 210KB(약 1.7Mbps)이고, 접속자가 100명이면 서버는 초당 21MB를 올려 보내야 한다. 모바일 회선과 서버 비용을 생각하면 클라이언트당 수십 kbps가 목표다. 줄이는 방법은 세 가지 질문에서 나온다. 이 클라이언트에게 필요한가(관심 영역), 그 정밀도가 필요한가(양자화), 이미 알고 있지 않은가(델타).

## 양자화: 필요한 만큼의 비트만
맵이 1024×1024라면 위치를 float32(유효 숫자 약 7자리)로 보낼 필요가 없다. [0, 1024] 구간을 16비트 정수 격자에 올리면 한 칸이 약 1/64이고, 반올림 오차는 칸의 절반을 넘지 않는다. 양자화 1편의 균일 양자화 `q = round(x / s)`를 그대로 쓴다. 방향은 한 바퀴가 이어지는 값이라 8비트(256등분)로 나눈 뒤 256으로 나머지를 취한다.
```python
import math, random

def quantize(v, lo, hi, bits):                    # [lo, hi] → 0 ~ 2^bits − 1
    return round((v - lo) / (hi - lo) * ((1 << bits) - 1))

def dequantize(n, lo, hi, bits):
    return lo + n * (hi - lo) / ((1 << bits) - 1)

rng, worst = random.Random(14), 0.0
for _ in range(100000):
    x = rng.uniform(0, 1024)
    back = dequantize(quantize(x, 0, 1024, 16), 0, 1024, 16)
    worst = max(worst, abs(back - x))
step = 1024 / (2**16 - 1)
print(f"위치 16비트 최대 오차 {worst:.5f}")
print(f"한계(칸/2) {step / 2:.5f}, 지킴", worst <= step / 2 + 1e-12)
worst = 0.0
for _ in range(100000):
    a = rng.uniform(0, 2 * math.pi)
    n = round(a / (2 * math.pi) * 256) % 256      # 한 바퀴 돌면 0
    d = abs(n * 2 * math.pi / 256 - a)
    worst = max(worst, min(d, 2 * math.pi - d))
print(f"방향 8비트 최대 오차 {math.degrees(worst):.3f}°, 지킴",
      worst <= math.pi / 256)
```
```text
위치 16비트 최대 오차 0.00781
한계(칸/2) 0.00781, 지킴 True
방향 8비트 최대 오차 0.703°, 지킴 True
```
위치 12바이트가 6바이트로, 방향 4바이트가 1바이트로 줄어 물체 하나가 12바이트가 된다. 오차 1/128 단위, 방향 0.7도는 화면에서 보이지 않는다. 3D 회전(쿼터니언)은 가장 큰 성분을 빼고 나머지 세 성분과 빠진 성분을 가리키는 2비트만 보내는 smallest three 방식이 흔히 쓰인다.

## 관심 영역과 델타 압축
**관심 영역**(area of interest, AOI)은 클라이언트 근처(여기서는 반경 200)의 물체만 보내는 필터다. 7편의 공간 해시를 그대로 쓰면 근처 물체를 싸게 찾을 수 있다. **델타 압축**은 직전에 보낸 상태와 비교해 바뀐 필드만 보낸다. 함정은 "직전에 보낸" 상태다. UDP 패킷은 잃어버릴 수 있으므로, 클라이언트가 받았다고 **확인(ACK)한 마지막 스냅숏**을 기준으로 삼아야 한다. 퀘이크 3의 네트워크 모델이 이렇게 동작한다. 서버는 클라이언트마다 최근 스냅숏 32개를 보관하고, 확인된 상태가 없으면 모든 필드가 0인 가짜 상태를 기준으로 쓴다. 잃어버린 패킷은 다시 보내지 않는다. 다음 패킷이 더 오래된(확인된) 기준에서 출발할 뿐이다.

아래는 물체마다 `id + 변경 비트마스크 + 바뀐 필드`를 실제 바이트로 직렬화하고, 패킷 10%를 잃는 동안 클라이언트가 받은 패킷만으로 상태를 복원하는지 확인한다. 클라이언트는 패킷에 적힌 기준 틱을 자기 쪽 기록에서 찾아 그 위에 델타를 덮는다. 앞 코드에 이어서 실행한다.
```python
import struct
W, R, NONE = 1024, 200, 0xFFFF                    # 맵, 관심 반경, 기준 없음
FIELDS = [("<3H", slice(0, 3)), ("<B", slice(3, 4)),   # 위치, 방향
          ("<H", slice(4, 5)), ("<B", slice(5, 6))]    # 체력, 애니메이션
GONE = 16                                         # 관심 영역을 벗어남

def quant(e):
    return (quantize(e["x"], 0, W, 16), quantize(e["y"], 0, W, 16),
            quantize(e["z"], 0, 64, 16), round(e["yaw"] * 128 / math.pi) % 256,
            e["hp"], e["anim"])

def encode(cur, base):                            # 기준 대비 바뀐 필드만
    out = bytearray()
    for i, f in cur.items():
        old = base.get(i, (0,) * 6)               # 처음 보면 0으로 채운 기준
        mask = sum(1 << k for k, (_, s) in enumerate(FIELDS) if f[s] != old[s])
        if mask or i not in base:
            out += struct.pack("<HB", i, mask)
            for k, (fmt, s) in enumerate(FIELDS):
                if mask >> k & 1:
                    out += struct.pack(fmt, *f[s])
    for i in base.keys() - cur.keys():
        out += struct.pack("<HB", i, GONE)
    return bytes(out)

def decode(data, base):
    cur, pos = dict(base), 0
    while pos < len(data):
        i, mask = struct.unpack_from("<HB", data, pos)
        pos += 3
        if mask & GONE:
            del cur[i]
            continue
        f = list(cur.get(i, (0,) * 6))
        for k, (fmt, s) in enumerate(FIELDS):
            if mask >> k & 1:
                f[s] = struct.unpack_from(fmt, data, pos)
                pos += struct.calcsize(fmt)
        cur[i] = tuple(f)
    return cur

rng = random.Random(14)
ents = [dict(x=rng.uniform(0, W), y=rng.uniform(0, W), z=rng.uniform(0, 64),
             yaw=rng.uniform(0, 6.28), hp=100, anim=0,
             moving=rng.random() < 0.4) for _ in range(500)]
sent, recv, acked = {}, {NONE: {}}, NONE          # 서버 기록, 클라이언트 기록
total = {"전체": 0, "관심 영역": 0, "+양자화": 0, "+델타": 0}
ok = got = 0
for t in range(300):
    for e in ents:                                # 세계 한 틱
        if e["moving"]:
            e["yaw"] = (e["yaw"] + rng.uniform(-0.2, 0.2)) % (2 * math.pi)
            e["x"] = min(W, max(0, e["x"] + 2 * math.cos(e["yaw"])))
            e["y"] = min(W, max(0, e["y"] + 2 * math.sin(e["yaw"])))
        e["anim"] = int(e["moving"])
        if rng.random() < 0.01:
            e["hp"] = max(0, e["hp"] - rng.randint(1, 30))
    vis = [i for i, e in enumerate(ents)
           if math.hypot(e["x"] - 512, e["y"] - 512) <= R]
    cur = {i: quant(ents[i]) for i in vis}
    pkt = struct.pack("<HH", t, acked) + encode(cur, sent.get(acked, {}))
    sent[t] = cur
    total["전체"] += 500 * 21
    total["관심 영역"] += len(vis) * 21
    total["+양자화"] += len(vis) * 12             # 2+6+1+2+1바이트
    total["+델타"] += len(pkt)
    if rng.random() < 0.1:
        continue                                  # 패킷 손실: ACK도 없다
    tick, base = struct.unpack_from("<HH", pkt)
    recv[tick] = decode(pkt[4:], recv[base])      # 클라이언트 쪽 기준으로
    ok, got, acked = ok + (recv[tick] == cur), got + 1, tick
print(f"받은 패킷 {got}/300, 복원 일치 {ok}")
for k, v in total.items():
    print(f"{k}: 틱당 {v // 300}바이트")
```
```text
받은 패킷 271/300, 복원 일치 271
전체: 틱당 10500바이트
관심 영역: 틱당 1257바이트
+양자화: 틱당 718바이트
+델타: 틱당 295바이트
```
잃어버린 패킷 29개가 있었지만 받은 271개는 모두 서버 상태와 정확히 같게 복원됐다. 바이트는 관심 영역으로 8분의 1, 양자화로 다시 절반 가까이, 델타로 또 절반 아래로 줄어 처음의 36분의 1이 됐다. 틱당 295바이트면 초당 약 5.9KB(47kbps)다. 델타가 더 줄이지 못하는 것은 움직이는 물체 40%의 위치와 방향이 매 틱 바뀌기 때문이다. 이 실험은 ACK가 다음 틱 전에 도착한다고 가정했다. 실제로는 왕복 시간만큼 기준이 오래되어 델타가 조금 커진다.

## 우선순위 누적: 예산을 공정하게
전투가 벌어져 바뀐 것이 많으면 델타도 예산을 넘는다. 틱당 120바이트(12바이트 기록 10개)만 쓸 수 있는데 관심 영역에 물체가 60개라고 하자. 가까울수록 중요하니 중요도 순으로 정렬해 위에서 10개만 보내면, 나머지 50개는 영영 갱신되지 않는다. 글렌 피들러의 「State Synchronization」 글이 소개하는 **우선순위 누적**(priority accumulator)은 물체마다 누적값을 프레임 사이에 기억해 두고 매 틱 중요도를 더한 뒤, 누적값이 큰 순서로 보낸다. 아래 구현은 보낸 물체의 누적값을 0으로 되돌린다.
```python
import random
rng = random.Random(15)
dist = [rng.uniform(0, 200) for _ in range(60)]  # 관심 영역 안 60개
weight = [1 + 9 * (1 - d / 200) for d in dist]    # 가까울수록 1~10
BUDGET, REC = 120, 12                             # 틱당 예산, 기록 크기

def run(policy, ticks=600):
    acc, last, worst = [0.0] * 60, [0] * 60, [0] * 60
    for t in range(1, ticks + 1):
        for i in range(60):
            acc[i] += weight[i]                   # 못 보낸 만큼 쌓인다
        key = acc if policy == "누적" else weight
        order = sorted(range(60), key=lambda i: -key[i])
        for i in order[:BUDGET // REC]:           # 예산이 허락하는 만큼
            acc[i], last[i] = 0.0, t
        for i in range(60):
            worst[i] = max(worst[i], t - last[i])
    never = sum(x == 0 for x in last)
    near = max(w for w, d in zip(worst, dist) if d < 50)
    far = max(w for w, d in zip(worst, dist) if d > 150)
    return never, near, far

for p in ("정렬만", "누적"):
    never, near, far = run(p)
    print(f"{p}: 굶음 {never}개, 지연 {near}/{far}틱")
```
```text
정렬만: 굶음 50개, 지연 600/600틱
누적: 굶음 0개, 지연 4/30틱
```
"굶음"은 한 번도 못 보낸 물체 수, "지연"은 가까운 물체/먼 물체의 최대 갱신 간격이다. 누적을 쓰면 아무도 굶지 않는다. 오래 못 보낸 물체는 중요도가 낮아도 누적값이 계속 커져 언젠가 위로 올라오기 때문이다. 대략 중요도에 반비례하는 간격으로 갱신되어, 가까운 물체(거리 50 미만)는 최대 4틱, 먼 물체(150 초과)는 최대 30틱(1.5초)마다 소식이 간다. 10편의 에이징과 같은 생각이다.

## 자주 하는 실수와 변형
- 확인되지 않은 "마지막으로 보낸" 상태를 기준으로 델타를 만들면, 패킷 하나만 잃어도 클라이언트 상태가 영원히 어긋난다.
- 기준 스냅숏 기록은 고리 버퍼로 개수를 제한하고, 확인이 너무 오래 없어 기준이 지워졌다면 전체 상태를 보낸다.
- 관심 영역 경계에서 물체가 들락날락하면 등장·퇴장 기록이 반복된다. 6편처럼 들어오는 반경보다 나가는 반경을 크게 잡는다.
- 위치도 기준과의 작은 차이만 적은 비트로 보내고, 엔트로피 부호화로 자주 나오는 값을 짧게 하면 더 줄어든다.

## 복잡도
| 단계 | 시간 | 바이트 |
|---|---|---|
| 관심 영역 | 근처 칸 수 + 후보 | 보이는 물체만 |
| 양자화 | 물체당 O(1) | 21 → 12 |
| 델타 | O(관심 + 기준) | 바뀐 필드만 |
| 우선순위 누적 | O(m log m) | 예산 이하 |

- m은 보낼 후보 수다. 정렬 대신 상위 k개 선택(`heapq.nlargest`)을 쓰면 O(m log k)다. 서버 메모리는 클라이언트마다 스냅숏 기록 개수만큼 든다.

## 어디에 쓰이나
- 양자화 1편 「양자화의 기본: 실수를 정수 격자에 올리기」: 위치를 16비트로 바꾸는 것은 그 글의 균일 양자화와 같은 식이고, 반올림 오차가 칸의 절반 이하라는 성질도 같다.
- 정보 이론 1편 「정보량과 엔트로피」: 바뀌지 않은 필드는 새 정보가 0에 가까우므로 보내지 않는 것이 델타 압축이고, 남은 차이를 엔트로피에 가깝게 부호화하는 것이 다음 단계다.
- 7편 「공간 분할 1: 균일 격자와 공간 해싱」: 관심 영역 질의는 클라이언트 주변 칸만 보는 공간 해시 질의다.

## 정리
- 대역폭은 관심 영역(보일 것만), 양자화(필요한 정밀도만), 델타(바뀐 것만)로 줄이며, 실험에서 틱당 10,500바이트가 295바이트가 됐다.
- 델타의 기준은 클라이언트가 확인한 스냅숏이어야 패킷 손실에도 재전송 없이 정확히 복원된다.
- 양자화 오차는 칸의 절반 이하로 보장되므로, 비트 수는 화면에서 허용되는 오차로 거꾸로 정한다.
- 예산이 모자라면 우선순위를 누적해, 중요한 것은 자주 덜 중요한 것도 언젠가 보낸다.

## 더 알아보기
- 이전 글: 13편 「플라이웨이트와 더티 플래그: 공유하고, 바뀐 것만 다시 계산하기」
- 처음 글: 1편 「프레임 예산: 16.67ms 안에 모든 일을 끝내기」
- Glenn Fiedler, "State Synchronization": https://gafferongames.com/post/state_synchronization/
