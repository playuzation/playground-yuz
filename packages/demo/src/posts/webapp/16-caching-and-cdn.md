# [웹 앱의 원리 16/20] 다시 받지 않기: 브라우저 캐시, ETag, CDN

> **한 줄 요약** — 가장 빠른 요청은 보내지 않는 요청이므로, 서버는 `Cache-Control`로 "얼마 동안 다시 묻지 말라"를, `ETag`로 "바뀌었는지만 확인하라"를 알려 주고, CDN은 그 규칙을 지키는 캐시를 사용자 가까이 세계 곳곳에 두어 왕복 거리와 원본 서버의 부담을 함께 줄인다.

## 이 글에서 다루는 것
- 신선도와 검증: 캐시의 두 가지 질문
- `Cache-Control`의 주요 지시어
- 조건부 요청과 304 Not Modified
- 파일 이름에 지문을 넣는 캐시 무효화
- 공유 캐시와 CDN, `Vary`
- 직접 해 보기: ETag로 304 받기, CDN의 효과 시뮬레이션

## 캐시의 두 가지 질문
6편의 서비스 워커 캐시, 8편의 DNS 캐시처럼 웹은 곳곳에서 사본을 쓴다. HTTP 캐시는 사본을 쓰기 전에 두 가지를 묻는다.
- **아직 신선한가**(freshness): 정해진 유효 기간 안이면 서버에 묻지도 않고 사본을 쓴다. 요청 자체가 없으니 가장 빠르다.
- **바뀌었는가**(validation): 기간이 지났으면 서버에 "내가 가진 이 버전이 아직 맞나?"라고 짧게 묻는다. 맞으면 서버는 본문 없이 "그대로 써라"(304)라고만 답한다. 왕복은 들지만 본문 전송이 없다.

## Cache-Control
서버는 응답의 `Cache-Control` 헤더로 이 규칙을 정한다.
- `max-age=3600`: 3600초 동안 신선하다. 그동안은 묻지 말고 써라.
- `no-cache`: 저장은 해도 되지만, 쓰기 전에 **매번** 서버에 확인하라. "캐시하지 말라"는 뜻이 아니다.
- `no-store`: 아예 저장하지 마라. 은행 거래 내역처럼 민감한 응답에 쓴다.
- `private`: 그 사용자의 브라우저만 저장하라. 중간의 공유 캐시는 저장하면 안 된다. `public`은 반대다.
- `immutable`: 유효 기간 동안 절대 바뀌지 않으니 새로 고침 때도 확인하지 마라.

## 조건부 요청과 ETag
"바뀌었는가"를 확인하려면 버전의 이름이 필요하다. 서버는 응답에 **ETag**(entity tag)라는 버전 표식(보통 내용의 해시)을 붙이고, 캐시는 다음 확인 때 그 값을 `If-None-Match` 헤더에 실어 보낸다. 같으면 304, 다르면 새 본문과 함께 200이다. 수정 시각을 쓰는 `Last-Modified`와 `If-Modified-Since`도 같은 일을 하지만 1초보다 짧은 변경이나 여러 서버의 시각 차이에 약하다.

## 직접 해 보기 1: 304 받기
CSS 파일 하나를 주면서 내용의 해시로 ETag를 만드는 서버다. 코드는 훑어만 보자.
```python
# 파일: cache_server.py
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = open('style.css', 'rb').read()
        etag = '"' + hashlib.sha256(body).hexdigest()[:12] + '"'   # 내용의 지문
        if self.headers.get('If-None-Match') == etag:
            self.send_response_only(304)         # 바뀌지 않았다: 본문 없이 답한다
            self.send_header('ETag', etag)
            self.end_headers()
            return
        self.send_response_only(200)
        self.send_header('Cache-Control', 'no-cache')   # 쓸 때마다 확인하라
        self.send_header('ETag', etag)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 8018), Handler).serve_forever()
```
첫 요청에서 ETag를 받아 두었다가, 다음 요청에 실어 보낸다. 그다음 파일을 고치고 같은 ETag로 다시 묻는다.
```bash
printf 'body { color: navy; }\n' > style.css
python3 cache_server.py &
sleep 1
U=http://127.0.0.1:8018/style.css
curl -s -D head.txt -o /dev/null -w '첫 요청: %{http_code}, 본문 %{size_download}바이트\n' $U
grep -iE '^(cache-control|etag)' head.txt
TAG=$(grep -i '^etag' head.txt | cut -d' ' -f2 | tr -d '\r')
curl -s -o /dev/null -H "If-None-Match: $TAG" -w '확인 요청: %{http_code}, 본문 %{size_download}바이트\n' $U
printf 'body { color: teal; }\n' > style.css
curl -s -o /dev/null -H "If-None-Match: $TAG" -w '파일을 바꾼 뒤: %{http_code}, 본문 %{size_download}바이트\n' $U
```
```text
첫 요청: 200, 본문 22바이트
Cache-Control: no-cache
ETag: "b697f4074f38"
확인 요청: 304, 본문 0바이트
파일을 바꾼 뒤: 200, 본문 22바이트
```
두 번째 요청은 304에 본문 0바이트였다. 브라우저는 304를 받으면 가진 사본을 그대로 쓴다. 파일 하나가 22바이트라 아낀 것이 작아 보이지만, 수백 KB의 스크립트나 이미지라면 차이가 크다. 파일을 고치자 지문이 달라져 새 본문이 왔다. 왕복은 여전히 들었다는 점도 기억하자. 왕복까지 없애는 것은 `max-age`의 몫이다.

## 지문 넣은 파일 이름: 영원히 캐시하기
그렇다면 모든 파일에 긴 `max-age`를 주면 될까. 문제는 그 사이에 파일을 고치면 사용자가 옛 사본을 계속 쓴다는 것이다. 그래서 흔히 쓰는 방법은 **내용이 바뀌면 이름이 바뀌게** 하는 것이다. 빌드 도구가 `app.js`를 `app.3f9a1c.js`처럼 내용의 해시를 넣은 이름으로 만들고, 이런 파일에는 `max-age=31536000, immutable`(1년, 절대 안 바뀜)을 준다. 대신 그 파일 이름들을 담은 HTML에는 `no-cache`를 주어 매번 확인하게 한다. HTML만 확인하면 새 배포가 바로 퍼지고, 바뀌지 않은 스크립트와 이미지는 한 번도 다시 받지 않는다.
```text
index.html      no-cache
app.3f9a1c.js   1 year, immutable
logo.81bd2e.png 1 year, immutable
```

## 공유 캐시와 CDN
캐시는 브라우저에만 있지 않다. 회사의 프록시나 통신사 장비처럼 여러 사용자가 함께 쓰는 **공유 캐시**도 있다. 그 대표가 **CDN**(content delivery network)이다. CDN 업체는 세계 여러 도시에 **엣지**(edge) 서버를 두고, 내 도메인을 CNAME(8편)으로 연결하면 사용자의 요청이 가장 가까운 엣지로 간다. 엣지에 사본이 있으면 거기서 바로 답하고(캐시 적중), 없으면 원본 서버에서 받아 저장한 뒤 답한다.

CDN이 주는 것은 캐시만이 아니다. TCP·TLS 핸드셰이크(7편, 10편)를 가까운 엣지와 하므로 왕복이 짧아지고, 엣지에서 원본까지는 미리 열어 둔 연결을 재사용한다. 대량의 공격 트래픽도 원본에 닿기 전에 여러 엣지가 나눠 받는다. 공유 캐시이므로 조심할 것도 있다. 사용자마다 다른 응답(내 장바구니)에는 `private`이나 `no-store`를 붙여야 남의 화면이 캐시되지 않는다. 같은 주소라도 요청 헤더에 따라 응답이 달라지면 `Vary` 헤더로 알린다. 압축 방식(17편)에 따라 다르면 `Vary: Accept-Encoding`, 3편의 CORS처럼 출처에 따라 다르면 `Vary: Origin`이다. 원본에서 급히 내용을 고쳤다면 CDN에 해당 주소의 사본을 지우라고(purge) 요청한다.

## 직접 해 보기 2: CDN이 바꾸는 것
이미지 50개를 1만 번 요청하는 서비스를 흉내 낸다. 인기 있는 이미지일수록 훨씬 자주 요청되고, 사용자는 서울·도쿄·싱가포르 세 엣지 중 가까운 곳에 붙는다. 원본까지 왕복은 180ms, 엣지까지는 20ms로 정한 가상의 값이다.
```python
import random

rng = random.Random(7)
ORIGIN_RTT, EDGE_RTT = 180, 20
files = [f'/img/{i}.jpg' for i in range(50)]
popularity = [1 / (rank + 1) for rank in range(50)]     # 1위가 2위의 두 배쯤 인기
requests = rng.choices(files, popularity, k=10_000)

edges = {'서울': set(), '도쿄': set(), '싱가포르': set()}
origin_calls, total_ms = 0, 0
for f in requests:
    cache = edges[rng.choice(list(edges))]
    if f in cache:
        total_ms += EDGE_RTT                             # 엣지에서 바로 답함
    else:
        cache.add(f)
        origin_calls += 1
        total_ms += EDGE_RTT + ORIGIN_RTT                # 엣지가 원본에서 받아 옴
print(f'CDN 없이: 원본 요청 {len(requests):,}번, 평균 {ORIGIN_RTT}ms')
print(f'CDN 사용: 원본 요청 {origin_calls}번, 평균 {total_ms / len(requests):.1f}ms')
print(f'캐시 적중률: {1 - origin_calls / len(requests):.1%}')
```
```text
CDN 없이: 원본 요청 10,000번, 평균 180ms
CDN 사용: 원본 요청 150번, 평균 22.7ms
캐시 적중률: 98.5%
```
원본 서버가 받는 요청은 1만 번에서 150번(파일 50개 × 엣지 3곳의 첫 요청)으로 줄었고, 사용자가 기다리는 평균 왕복은 180ms에서 23ms 가까이로 줄었다. 실제 CDN은 사본의 유효 기간이 지나면 원본에 다시 확인하므로 원본 요청이 이보다 많지만, 인기 있는 소수의 파일이 트래픽 대부분을 차지하는 웹에서는 적중률이 높게 나오는 경우가 많다. 트래픽 관리의 첫 원칙이 여기 있다. 가장 싼 요청은 원본에 오지 않는 요청이다.

## 흔한 오해
- "`no-cache`는 캐시하지 말라는 뜻이다": 저장은 하되 쓰기 전에 확인하라는 뜻이다. 저장 자체를 막는 것은 `no-store`다.
- "새로 배포했는데 사용자에게 옛 화면이 보이는 건 브라우저 탓이다": 대개 긴 `max-age`를 받은 파일 이름이 그대로였기 때문이다. 이름에 지문을 넣으면 생기지 않는다.
- "CDN은 정적 파일에만 쓴다": API 응답도 `Cache-Control`을 잘 주면 짧게라도 엣지에서 캐시할 수 있고, 캐시하지 않더라도 가까운 엣지에서 연결을 끝내는 것만으로 왕복이 준다.

## 어디에 쓰이나
- 메모리 시스템 3편 「캐시 미스의 종류와 정책: 3C, 교체, 쓰기」: 처음이라 없는 미스, 공간이 모자라 버린 미스 같은 분류가 CDN 캐시에도 그대로 들어맞는다.
- 게임 자원 관리 5편 「캐시 교체 알고리즘: LRU, LFU, CLOCK」: 엣지의 공간이 모자랄 때 무엇을 버릴지 고르는 알고리즘이다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 정적 사이트 호스팅은 대개 CDN 뒤에서 제공되어, 배포 직후 옛 사본이 잠시 보이기도 한다.

## 정리
- 캐시는 "아직 신선한가"(물을 필요 없음)와 "바뀌었는가"(짧게 확인, 304)를 묻는다.
- `Cache-Control`의 `max-age`, `no-cache`, `no-store`, `private`, `immutable`로 서버가 규칙을 정한다.
- ETag와 `If-None-Match`로 확인하면 바뀌지 않은 본문을 다시 받지 않는다. 지문 넣은 파일 이름으로 바뀌지 않는 파일은 1년씩 캐시한다.
- CDN은 사용자 가까운 엣지에 공유 캐시를 두어 왕복과 원본 부담을 함께 줄인다. 사용자별 응답과 `Vary`를 조심한다.

## 더 알아보기
- 이전 글: 15편 「연결을 아끼는 HTTP의 진화: keep-alive, HTTP/2, HTTP/3」
- 다음 글: 17편 「작게 보내기: 압축, 코드 분할, 페이지네이션」
