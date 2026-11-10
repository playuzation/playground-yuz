# [웹 앱의 원리 12/20] API를 설계하는 방식: REST, GraphQL, gRPC

> **한 줄 요약** — API는 클라이언트와 서버 사이의 계약이고, HTTP의 메서드·URL·캐시를 그대로 쓰는 REST, 클라이언트가 필요한 필드를 질의로 골라 한 번에 받는 GraphQL, 스키마로 정한 함수를 바이너리로 부르는 gRPC는 "왕복 횟수, 보내는 양, 캐시, 도구"를 서로 다르게 교환한다.

## 이 글에서 다루는 것
- API는 계약이다: 원격 함수 호출(RPC)이라는 오래된 생각
- REST: 자원과 URL, HTTP 메서드, 캐시
- 너무 많이 받기와 너무 적게 받기, 그리고 왕복의 비용
- GraphQL: 필요한 모양을 클라이언트가 말한다
- gRPC: 스키마와 바이너리, 서버끼리의 대화
- 직접 해 보기: 같은 화면을 위한 왕복 횟수와 바이트 비교, JSON과 바이너리 인코딩 크기

## API는 계약이다
4편부터 브라우저는 서버에게 화면이 아닌 데이터를 받았다. 이때 "어떤 주소로 무엇을 보내면 무엇이 돌아오는가"를 정한 약속이 **API**(application programming interface)다. 앱과 서버는 따로 배포되므로(1편) 이 계약을 바꾸면 이미 깔린 클라이언트가 깨질 수 있다. 그래서 API 설계는 "지금 편한가"뿐 아니라 "앞으로 바꿀 수 있는가"의 문제다.

네트워크 너머의 함수를 내 함수처럼 부르자는 생각을 **RPC**(remote procedure call)라고 한다. 1980년대부터 여러 형태가 있었고, 2000년 무렵에는 XML로 감싼 SOAP 웹 서비스가 회사 시스템 사이에 많이 쓰였다. 그 반대편에서 "웹 자체의 규칙을 그대로 쓰자"는 흐름이 REST다.

## REST: 자원과 메서드
**REST**(Representational State Transfer)는 로이 필딩이 2000년 박사 논문에서 웹의 구조를 설명하며 붙인 이름이다. 실무에서는 대략 이런 뜻으로 쓴다.
- 다룰 대상을 **자원**(resource)으로 보고 URL로 이름을 붙인다: `/users/1`, `/users/1/orders`.
- 할 일은 9편의 HTTP 메서드로 표현한다: 읽기 GET, 만들기 POST, 바꾸기 PUT, 지우기 DELETE.
- 요청마다 필요한 정보를 다 싣는다(상태 없음, 11편).
- 응답에 캐시 여부를 적어 중간의 캐시가 재사용하게 한다(16편).

REST의 강점은 HTTP의 도구를 그대로 쓴다는 점이다. GET은 캐시되고, 상태 코드는 감시 도구가 이해하고, 멱등한 메서드는 프록시가 안심하고 다시 보낸다. 약점은 화면이 원하는 모양과 자원의 모양이 다를 때 드러난다. 사용자 이름 하나가 필요한데 `/users/1`이 자기소개 전문까지 통째로 주면 **너무 많이 받기**(over-fetching)이고, 사용자와 주문과 주문 품목을 보여 주려고 요청을 여러 번 차례로 보내야 하면 **너무 적게 받기**(under-fetching)다. 뒤의 요청이 앞 응답의 ID를 알아야 하므로 4편처럼 동시에 보낼 수도 없다.

## GraphQL: 필요한 모양을 말하기
**GraphQL**은 페이스북이 2012년 휴대폰 앱을 위해 사내에서 만들었고 2015년에 공개했다. 주소는 보통 하나(`/graphql`)이고, 클라이언트가 원하는 필드와 관계를 질의 언어로 적어 보낸다.
```text
{
  user(id: 1) {
    name
    orders { id total }
  }
}
```
서버는 질의를 해석해 정확히 그 모양의 JSON 하나를 돌려준다. 왕복 한 번에 필요한 것만 받는다. 대가도 있다. 모든 질의가 같은 주소의 POST라서 HTTP 캐시를 그대로 쓰기 어렵고, 클라이언트가 아주 깊은 질의를 보내 서버를 괴롭힐 수 있어 깊이와 비용 제한이 필요하며, 서버 안에서 관계마다 데이터베이스를 따로 부르면 그 안에서 왕복이 폭발하므로 묶어 읽는 장치를 둔다. 여러 화면과 여러 종류의 클라이언트가 한 데이터 그래프를 다양하게 쓰는 곳에서 빛난다.

## gRPC: 스키마와 바이너리
**gRPC**는 구글이 2015년에 공개한 RPC 프레임워크다. 함수와 메시지를 `.proto` 스키마 파일로 먼저 정의하고, 각 언어용 코드를 자동으로 만든다. 메시지는 **Protocol Buffers**라는 바이너리 형식으로, HTTP/2(15편) 위에서 오간다. 필드 이름 대신 번호를 쓰고 숫자를 압축해서 JSON보다 작고 빠르게 해석된다. 응답을 흘려보내는 스트리밍도 기본으로 된다. 스키마가 계약 그 자체라서 서버끼리(주문 서비스와 재고 서비스) 대화할 때 많이 쓴다. 브라우저는 gRPC가 쓰는 HTTP/2 기능을 페이지에서 직접 다룰 수 없어, 중간에 변환하는 프록시를 둔 gRPC-Web을 쓴다.

## 직접 해 보기 1: 같은 화면, 다른 왕복
"사용자 이름과 그 사람의 주문 번호·금액 목록"을 보여 주는 화면을 세 방식으로 채운다. 네트워크는 실제로 쓰지 않고, 요청 한 번을 왕복 100ms로 치는 가짜 네트워크로 왕복 횟수와 받은 바이트를 센다. 코드를 몰라도 마지막 세 줄만 보자.
```python
import json

USERS = {1: {'id': 1, 'name': 'minji', 'email': 'minji@example.com',
             'bio': '안녕하세요. ' * 40, 'order_ids': [10, 11, 12]}}
ORDERS = {i: {'id': i, 'total': t, 'address': '서울시 어딘가 ' * 5, 'memo': '문 앞에 두세요'}
          for i, t in [(10, 12000), (11, 5500), (12, 30000)]}
RTT = 100

class Net:
    def __init__(self):
        self.trips = self.bytes = 0
    def call(self, data):                    # 요청 한 번 = 왕복 한 번
        body = json.dumps(data, ensure_ascii=False).encode()
        self.trips += 1
        self.bytes += len(body)
        return data

def rest(net):                               # 자원마다 한 번씩
    user = net.call(USERS[1])
    orders = [net.call(ORDERS[i]) for i in user['order_ids']]
    return user['name'], [(o['id'], o['total']) for o in orders]

def rest_composite(net):                     # 화면용으로 묶은 REST 주소 하나
    u = USERS[1]
    data = net.call({'name': u['name'],
                     'orders': [{'id': i, 'total': ORDERS[i]['total']} for i in u['order_ids']]})
    return data['name'], [(o['id'], o['total']) for o in data['orders']]

def graphql(net, query={'name': None, 'orders': ['id', 'total']}):  # 질의한 필드만
    u = USERS[1]
    data = net.call({'name': u['name'],
                     'orders': [{f: ORDERS[i][f] for f in query['orders']} for i in u['order_ids']]})
    return data['name'], [(o['id'], o['total']) for o in data['orders']]

for name, fn in [('REST 자원별', rest), ('REST 묶음 주소', rest_composite), ('GraphQL식', graphql)]:
    net = Net()
    result = fn(net)
    print(f'{name}: 왕복 {net.trips}번, {net.bytes}바이트, 약 {net.trips * RTT}ms → {result}')
```
```text
REST 자원별: 왕복 4번, 1292바이트, 약 400ms → ('minji', [(10, 12000), (11, 5500), (12, 30000)])
REST 묶음 주소: 왕복 1번, 112바이트, 약 100ms → ('minji', [(10, 12000), (11, 5500), (12, 30000)])
GraphQL식: 왕복 1번, 112바이트, 약 100ms → ('minji', [(10, 12000), (11, 5500), (12, 30000)])
```
자원별 REST는 사용자 한 번, 주문 세 번으로 왕복 네 번에 자기소개와 주소까지 받아 바이트도 열한 배가 넘는다. GraphQL식 질의는 한 번에 필요한 필드만 받았다. 둘째 줄이 중요하다. REST도 화면에 맞춘 주소(`/users/1/summary` 같은)를 따로 만들면 같은 결과를 낸다. 차이는 그 맞춤을 **서버 개발자가 주소마다 미리 만드느냐**, **클라이언트가 질의로 그때그때 고르느냐**다.

## 직접 해 보기 2: JSON과 바이너리
Protocol Buffers가 메시지를 어떻게 줄이는지 핵심만 흉내 낸다. 필드 이름 대신 번호를 쓰고, 정수는 7비트씩 끊어 작은 수를 적은 바이트로 적는다(varint).
```python
import json

def varint(n):                           # 7비트씩, 이어지면 맨 위 비트를 1로
    out = bytearray()
    while True:
        low, n = n & 0x7F, n >> 7
        out.append(low | (0x80 if n else 0))
        if not n:
            return bytes(out)

def int_field(number, value):            # (필드 번호 << 3 | 형식 0) + 값
    return varint(number << 3 | 0) + varint(value)

def str_field(number, text):             # (필드 번호 << 3 | 형식 2) + 길이 + 바이트
    raw = text.encode()
    return varint(number << 3 | 2) + varint(len(raw)) + raw

binary = int_field(1, 150) + str_field(2, 'minji') + int_field(3, 3)
text = json.dumps({'id': 150, 'name': 'minji', 'orders': 3}, separators=(',', ':')).encode()
print('바이너리:', binary.hex(' '), f'({len(binary)}바이트)')
print('JSON:', text.decode(), f'({len(text)}바이트)')
```
```text
바이너리: 08 96 01 12 05 6d 69 6e 6a 69 18 03 (12바이트)
JSON: {"id":150,"name":"minji","orders":3} (36바이트)
```
`08 96 01`은 "1번 필드, 정수 150"이다. 150은 한 바이트(0~127)에 안 들어가 `96 01` 두 바이트가 되었다. 같은 정보가 36바이트에서 12바이트로 줄었다. 대신 사람이 읽을 수 없고, 양쪽이 같은 스키마(1번이 id라는 약속)를 알아야 해석할 수 있다. 사람이 디버깅하기 쉬운 JSON과 기계가 다루기 좋은 바이너리의 교환이다. 크기 차이는 압축(17편)을 하면 상당히 줄어든다.

## 무엇을 고를까
| 방식 | 잘 맞는 곳 | 주의할 점 |
| --- | --- | --- |
| REST | 공개 API, 캐시가 중요한 읽기 | 화면마다 왕복이 늘기 쉽다 |
| GraphQL | 화면이 많고 다양한 앱 | 캐시, 질의 비용 제한 |
| gRPC | 서버끼리의 내부 호출 | 브라우저는 변환이 필요 |

어느 방식이든 공통으로 챙길 것이 있다. 오류를 일관된 형식과 상태 코드로 알릴 것, 큰 목록은 나눠 줄 것(17편), 같은 요청을 다시 보내도 안전하게 할 것(14편), 계약을 바꿀 때는 필드를 지우기보다 추가하고 옛 클라이언트가 사라질 때까지 기다릴 것.

## 흔한 오해
- "REST는 JSON을 주는 HTTP API면 다 해당한다": 흔히 그렇게 부르지만, 원래 뜻은 자원·메서드·상태 없음·캐시 같은 제약의 묶음이다. 모든 요청을 POST 하나로 보내는 API는 이름만 REST다.
- "GraphQL이면 서버가 빨라진다": 왕복은 클라이언트 쪽에서 줄지만, 서버 안의 데이터 읽기는 그대로이거나 더 복잡해진다. 느린 쿼리는 어느 방식에서든 느리다.
- "바이너리 형식이면 무조건 빠르다": 작은 메시지에서는 차이가 미미하고, 대부분의 시간은 왕복과 데이터베이스에서 쓴다. 먼저 재 보고 고른다.

## 어디에 쓰이나
- PostgreSQL 실무 4편 「조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기」: 묶음 주소나 GraphQL 서버가 왕복 대신 하는 일은 결국 데이터베이스 안의 조인이다.
- PostgreSQL 실무 12편 「JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기」: API가 주고받는 JSON 문서를 데이터베이스에 그대로 저장하고 질의하는 방법이다.
- GitHub 협업과 자동화 11편 「gh CLI와 API: 터미널과 스크립트로 GitHub 다루기」: 한 서비스가 REST API와 GraphQL API를 함께 제공하는 실제 예를 볼 수 있다.

## 정리
- API는 따로 배포되는 클라이언트와 서버 사이의 계약이다. 바꾸기 쉬운 계약이 좋은 계약이다.
- REST는 URL로 자원을, HTTP 메서드로 동작을 나타내고 HTTP 캐시와 도구를 그대로 쓴다. 화면 모양과 자원 모양이 다르면 왕복과 낭비가 는다.
- GraphQL은 클라이언트가 필요한 필드를 질의로 골라 한 번에 받는다. 캐시와 서버 비용 관리가 과제다.
- gRPC는 스키마와 바이너리 메시지, HTTP/2로 서버끼리 빠르게 대화한다. 같은 정보가 JSON보다 훨씬 작다.

## 더 알아보기
- 이전 글: 11편 「상태 없는 HTTP 위의 로그인: 쿠키, 세션, 토큰」
- 다음 글: 13편 「실시간 통신: 폴링, 서버 전송 이벤트, 웹소켓」
