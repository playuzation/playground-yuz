# [게임 자원 관리 13/14] 플라이웨이트와 더티 플래그: 공유하고, 바뀐 것만 다시 계산하기

> **한 줄 요약** — 똑같은 데이터를 물체마다 복사하지 말고 한 벌을 공유하며 물체마다 다른 몇 바이트만 따로 두는 플라이웨이트로 메모리를 줄이고, 바뀐 값에 표시만 해 두었다가 필요할 때 표시된 부분만 다시 계산하는 더티 플래그로 CPU 시간을 줄인다.

## 이 글에서 다루는 것
- 나무 1만 그루: 공유 상태와 개별 상태를 나눠 메모리 계산하기
- 인스턴싱: GPU에서의 플라이웨이트
- 문자열 인터닝: 같은 문자열을 객체 하나로
- 더티 플래그: 변환 계층에서 바뀐 서브트리만 다시 계산하고 횟수 세기

## 플라이웨이트: 나무 1만 그루
숲에 나무 1만 그루를 심는다. 나무 하나에는 정점 수천 개짜리 메시와 512×512 텍스처가 있고, 그 밖에 위치·회전·크기·색조가 있다. 앞의 둘은 같은 종이면 모두 같고, 뒤의 넷만 나무마다 다르다. GoF의 『디자인 패턴』(1994)은 앞의 것을 **내재 상태**(intrinsic state, 공유 가능), 뒤의 것을 **외재 상태**(extrinsic state, 물체마다 다름)라 부르고, 내재 상태를 한 객체로 공유하는 구조를 **플라이웨이트**(flyweight)라 했다. 아래는 종마다 모델을 한 번만 만드는 팩토리와, 나무마다 24바이트만 따로 두는 숲이다.
```python
import random, struct
from array import array

class TreeModel:                                  # 내재 상태: 같은 종이면 같다
    def __init__(self, verts, tex):
        self.mesh = array("f", bytes(verts * 8 * 4))  # 정점마다 float 8개
        self.texture = bytearray(tex * tex * 4)       # RGBA 텍스처

    def nbytes(self):
        return self.mesh.itemsize * len(self.mesh) + len(self.texture)

_models = {}
def get_model(kind):                              # 플라이웨이트 팩토리
    if kind not in _models:
        verts, tex = {"소나무": (5000, 512), "참나무": (8000, 512),
                      "덤불": (1200, 256)}[kind]
        _models[kind] = TreeModel(verts, tex)
    return _models[kind]

INST = struct.Struct("<3f2f4B")                   # 위치·회전·크기·색조
rng = random.Random(13)
forest = []
for _ in range(10000):                            # (공유 모델, 개별 상태)
    kind = rng.choice(["소나무", "참나무", "덤불"])
    data = INST.pack(rng.uniform(0, 1000), 0, rng.uniform(0, 1000),
                     rng.uniform(0, 6.28), rng.uniform(0.8, 1.2), 0, 90, 0, 255)
    forest.append((get_model(kind), data))

naive = sum(m.nbytes() for m, _ in forest)        # 나무마다 복사했다면
shared = sum({id(m): m.nbytes() for m, _ in forest}.values())
inst = sum(len(d) for _, d in forest)
print(f"개별 상태 {INST.size}바이트 × 1만 = {inst:,}")
print(f"복사: {naive / 2**30:.1f} GiB")
print(f"공유: 모델 {len(_models)}개 {shared / 2**20:.2f} MiB")
print(f"     + 개별 {inst / 2**10:.0f} KiB")
```
```text
개별 상태 24바이트 × 1만 = 240,000
복사: 8.6 GiB
공유: 모델 3개 2.68 MiB
     + 개별 234 KiB
```
나무마다 모델을 복사하면 8.6GiB로 게임 하나가 못 버티지만, 공유하면 3MiB도 안 된다. 핵심은 "무엇이 정말 물체마다 다른가"를 가려내는 일이다. 색조를 나무마다 바꾸고 싶다고 텍스처를 복사하지 말고, 색조 4바이트를 외재 상태에 두고 그릴 때 곱한다.

## 인스턴싱: GPU 쪽 플라이웨이트
메모리만이 아니다. 나무를 하나씩 그리면 그리기 호출이 1만 번이다(12편). Direct3D와 OpenGL이 지원하는 **인스턴스 렌더링**(instanced rendering)은 공유 메시를 한 번 올리고, 나무마다 다른 24바이트를 배열(인스턴스 버퍼)로 함께 넘겨 호출 한 번에 1만 그루를 그린다. 니스트롬의 『Game Programming Patterns』가 플라이웨이트 장에서 바로 이 숲 예를 든다. 위 코드의 `forest`에서 같은 모델을 쓰는 `data`를 이어 붙인 것이 그대로 인스턴스 버퍼다.

## 문자열 인터닝: 같은 문자열은 하나만
레벨 파일에서 읽은 태그 "enemy"가 9만 번 나오면 문자열 객체도 9만 개가 생긴다. **인터닝**(interning)은 문자열 표를 두고 같은 내용이면 같은 객체를 돌려주는 문자열용 플라이웨이트다.
```python
import sys
tags = ("enemy,pickup,prop," * 30000).split(",")[:-1]  # 파일에서 읽은 태그
print("태그", len(tags), "개, 서로 다른 객체", len({id(t) for t in tags}))
tags = [sys.intern(t) for t in tags]
print("인터닝 후 서로 다른 객체", len({id(t) for t in tags}))
print(tags[0] is tags[3], tags[0] == "enemy")
```
```text
태그 90000 개, 서로 다른 객체 90000
인터닝 후 서로 다른 객체 3
True True
```
파이썬 문서는 딕셔너리 키와 찾는 키가 모두 인터닝되어 있으면 해시가 같을 때 문자열 내용 대신 포인터만 비교하면 된다는 점을 `sys.intern`의 장점으로 든다. 단, 인터닝된 문자열은 영원히 살지 않으므로 돌려받은 객체의 참조를 유지해야 이득을 본다. 자바도 모든 문자열 리터럴을 인터닝한다.

## 더티 플래그: 바뀐 것만 다시 계산
배 위의 선원이 든 깃발처럼, 게임 물체는 부모-자식 계층(장면 그래프)을 이룬다. 각 노드는 부모 기준 **지역 변환**을 갖고, 화면에 그리려면 `월드 = 부모의 월드 × 지역`인 **월드 변환**이 필요하다. 매 프레임 모든 노드의 월드를 다시 곱하면 노드 수만큼 행렬 곱이 든다. 그런데 대부분의 노드는 이번 프레임에 움직이지 않았다. **더티 플래그**(dirty flag)는 지역 변환이 바뀔 때 계산하지 않고 "더러움" 표시만 해 둔다. 그리기 직전 위에서부터 내려가며, 자기나 조상 중 하나가 더러운 노드만 다시 곱한다. 한 프레임에 같은 노드가 여러 번 바뀌어도 계산은 한 번이다.
```python
import math, random

def mat(x, y, ang, s):                            # 2D 아핀 (a, b, c, d, tx, ty)
    co, si = math.cos(ang) * s, math.sin(ang) * s
    return (co, -si, si, co, x, y)

def mul(p, q):                                    # 부모 p 다음에 지역 q
    a, b, c, d, tx, ty = p
    e, f, g, h, ux, uy = q
    return (a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h,
            a * ux + b * uy + tx, c * ux + d * uy + ty)

IDENT = (1, 0, 0, 1, 0, 0)

class Node:
    def __init__(self, parent=None):
        self.parent, self.kids = parent, []
        self.local, self.world, self.dirty = IDENT, IDENT, True
        if parent:
            parent.kids.append(self)

    def set_local(self, m):
        self.local, self.dirty = m, True          # 표시만, 계산은 미룬다

def update(root, cnt):                            # 그리기 직전 한 번
    stack = [(root, IDENT, False)]
    while stack:
        node, pw, parent_dirty = stack.pop()
        dirty = node.dirty or parent_dirty        # 나나 조상이 바뀌었나
        if dirty:
            node.world, node.dirty = mul(pw, node.local), False
            cnt[0] += 1
        stack += [(k, node.world, dirty) for k in node.kids]

def recompute_all(nodes):                         # 단순한 방법: 전부
    for n in nodes:                               # 부모가 항상 앞에 있다
        n.world = mul(n.parent.world if n.parent else IDENT, n.local)

def rand_mat(rng):
    return mat(rng.uniform(-9, 9), rng.uniform(-9, 9),
               rng.uniform(0, 6.3), rng.uniform(0.5, 2))

rng, ok = random.Random(13), 0
for _ in range(200):
    nodes = [Node()]
    for i in range(1, rng.randint(1, 60)):
        nodes.append(Node(rng.choice(nodes)))
    for _ in range(rng.randint(1, 30)):
        rng.choice(nodes).set_local(rand_mat(rng))
        if rng.random() < 0.3:
            update(nodes[0], [0])                 # 중간중간 그리기
    update(nodes[0], [0])
    lazy = [n.world for n in nodes]
    recompute_all(nodes)
    ok += lazy == [n.world for n in nodes]
print(f"무작위 200개 비교: {ok}개 일치")
```
```text
무작위 200개 비교: 200개 일치
```
불변식은 "더럽지 않은 노드의 월드는, 조상이 모두 더럽지 않다면 정확하다"이다. 노드의 지역 변환이 바뀌면 그 노드가 더러워지고, 순회는 더러운 노드 아래 서브트리 전체에 `parent_dirty`를 물려주므로 낡은 값이 남지 않는다. 앞 코드에 이어서, 월드 아래 배 10척과 배마다 부품 98개가 달린 991개 노드를 100프레임 돌리며 행렬 곱 횟수를 센다.
```python
def scene(rng):                                   # 월드 → 배 10척 → 98개씩
    root = Node()
    nodes, ships = [root], []
    for _ in range(10):
        part = [Node(root)]
        ships.append(part[0])
        for _ in range(98):
            part.append(Node(rng.choice(part)))
        nodes += part
    return nodes, ships

rng = random.Random(1)
print("프레임당 곱셈: 전부, 더티")
for name in ("1%만 움직임", "배 한 척 + 1%", "월드 전체 이동"):
    nodes, ships = scene(rng)
    update(nodes[0], [0])
    lazy = [0]
    for f in range(100):
        for n in rng.sample(nodes, 10):
            n.set_local(rand_mat(rng))
        if name.startswith("배"):
            rng.choice(ships).set_local(rand_mat(rng))
        if name.startswith("월드"):
            nodes[0].set_local(mat(f, 0, 0, 1))
        update(nodes[0], lazy)
    print(f"{name}: {len(nodes)}, {lazy[0] // 100}")
```
```text
프레임당 곱셈: 전부, 더티
1%만 움직임: 991, 51
배 한 척 + 1%: 991, 148
월드 전체 이동: 991, 991
```
노드 1%가 움직이면 곱셈이 약 20분의 1로 준다. 움직인 노드의 서브트리만 다시 계산하기 때문이다. 배 한 척이 통째로 움직이면 그 배의 부품 전부가 따라 바뀌어 늘어나지만 여전히 7분의 1 수준이다. 월드 전체가 움직이면 모든 노드가 더러워져 이득이 없고, 플래그 검사만큼 손해다. 더티 플래그는 "대부분은 안 바뀐다"는 가정 위에서만 이긴다.

## 자주 하는 실수와 변형
- 플래그를 지역 변환만 바꾸고 자식에게 알리지 않으면 자식이 낡은 월드로 그려진다. 순회에서 물려주거나, 바꿀 때 서브트리에 표시를 내려보낸다.
- 공유 상태를 실수로 고치면 모든 나무가 바뀐다. 플라이웨이트 객체는 읽기 전용으로 다룬다.
- 같은 생각이 곳곳에 있다: 바뀐 칸만 다시 그리는 UI, 바뀐 파일만 다시 컴파일하는 빌드 도구, 8편 BVH의 상자 다시 계산(refit)도 바뀐 잎에서 위로만 올라간다.

## 복잡도
| 항목 | 단순한 방법 | 이 글의 방법 |
|---|---|---|
| 숲 메모리 | n × 모델 | 종 수 × 모델 + n × 24B |
| 같은 문자열 n개 | 객체 n개 | 내용별 객체 1개 |
| 프레임당 곱셈 | O(N) | O(더러운 서브트리 합) |

- 더티 플래그 순회는 모든 노드를 방문하므로 O(N)번의 플래그 검사는 남지만, 비싼 행렬 곱이 바뀐 부분으로 줄어든다.

## 어디에 쓰이나
- 선형대수 4편 「선형 변환으로서의 행렬」: 변환의 합성은 행렬 곱이고 순서를 바꾸면 결과가 달라지므로, 월드 변환은 반드시 `부모 × 지역` 순서로 곱한다.
- 이산수학 12편 「수 체계와 모듈러 연산: 2진수에서 해시까지」: 인터닝 표는 해시 테이블이고, 인터닝된 키끼리는 해시가 같을 때 내용 대신 주소만 비교하면 된다.
- 2편 「오브젝트 풀링: 만들지 말고 빌려 쓰기」: 풀링이 객체를 시간에 걸쳐 재사용한다면, 플라이웨이트는 같은 순간의 여러 물체가 데이터를 함께 쓴다.

## 정리
- 플라이웨이트는 물체마다 같은 내재 상태를 한 벌만 두고, 다른 부분(외재 상태)만 물체마다 저장한다. 숲 예에서 8.6GiB가 3MiB 아래로 줄었다.
- 인스턴싱은 GPU에서의 플라이웨이트이고, 인터닝은 문자열의 플라이웨이트다.
- 더티 플래그는 바뀔 때 표시만 하고 필요할 때 표시된 서브트리만 다시 계산해, 1%가 움직이는 장면에서 곱셈을 약 20분의 1로 줄였다.
- 둘 다 "대부분은 같다", "대부분은 안 바뀐다"는 가정에 기대므로, 가정이 깨지는 경우를 측정으로 확인해야 한다.

## 더 알아보기
- 이전 글: 12편 「텍스처 아틀라스와 사각형 빈 패킹」
- 다음 글: 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」
- Robert Nystrom, Game Programming Patterns "Dirty Flag": https://gameprogrammingpatterns.com/dirty-flag.html
