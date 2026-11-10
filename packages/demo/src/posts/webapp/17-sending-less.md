# [웹 앱의 원리 17/20] 작게 보내기: 압축, 코드 분할, 페이지네이션

> **한 줄 요약** — 보내야 하는 바이트는 줄일 수 있다. 글자로 된 HTML·JSON·자바스크립트는 gzip이나 Brotli로 몇 분의 일로 압축하고, 지금 화면에 필요한 코드와 이미지만 먼저 보내며, 긴 목록은 커서로 잘라 조금씩 준다.

## 이 글에서 다루는 것
- 바이트의 값: 대역폭, 요금, 그리고 해석 시간
- 압축 협상: `Accept-Encoding`과 `Content-Encoding`
- 무엇이 잘 압축되고 무엇이 안 되나
- 코드 분할과 이미지: 지금 필요한 것만
- 페이지네이션: 오프셋과 커서
- 직접 해 보기: 종류별 압축률, gzip으로 답하는 서버, 새 글이 올라올 때 오프셋 페이지가 틀리는 장면

## 바이트의 값
16편이 "보내지 않기"였다면 이 글은 "보내야 한다면 작게"다. 바이트는 세 번 비용을 치른다. 느린 모바일 망에서는 전송 시간이 되고, 데이터 요금제에서는 사용자의 돈이 되며, 도착한 뒤에도 자바스크립트는 내려받은 만큼 해석하고 컴파일해야 해서 느린 휴대폰의 CPU 시간이 된다. 같은 화면을 더 적은 바이트로 만드는 기술은 서버 비용(대역폭 요금)까지 함께 줄인다.

## 압축 협상
클라이언트는 요청에 `Accept-Encoding: gzip, br, zstd`처럼 풀 수 있는 압축 방식을 적는다. 서버는 그중 하나로 본문을 압축하고 `Content-Encoding: gzip`으로 무엇을 썼는지 알린다. 브라우저는 받는 대로 풀어서 쓴다. 같은 주소의 응답이 요청 헤더에 따라 달라지므로 서버는 `Vary: Accept-Encoding`을 붙여 공유 캐시(16편)가 압축본과 원본을 섞지 않게 한다.
- **gzip**: 1996년에 명세된 DEFLATE 압축을 감싼 형식. 거의 모든 클라이언트가 지원한다.
- **Brotli**(br): 구글이 만들어 2016년 7월 RFC 7932로 공개한 형식. 웹 글자에 자주 나오는 낱말 사전을 미리 품고 있어 gzip보다 대개 더 작다.
- **zstd**: 압축과 해제가 매우 빠른 형식으로, 최근 브라우저들이 지원하기 시작했다.

정적 파일은 빌드할 때 가장 높은 압축 수준으로 미리 압축해 두고, 요청마다 만드는 응답은 CPU를 덜 쓰는 중간 수준으로 압축하는 것이 보통이다.

## 직접 해 보기 1: 무엇이 잘 줄어드나
같은 압축기로 JSON 목록, HTML 목록, 무작위 바이트를 줄여 본다. 무작위 바이트는 이미 압축된 사진이나 동영상을 흉내 낸 것이다. 코드를 몰라도 출력의 백분율만 보자.
```python
import gzip, json, random

items = [{'id': i, 'title': f'할 일 {i}', 'done': i % 3 == 0, 'tags': ['집', '오늘']}
         for i in range(200)]
html = ''.join(f'<li class="item"><a href="/items/{i}">할 일 {i}</a></li>' for i in range(200))
samples = {
    'JSON 목록': json.dumps(items, ensure_ascii=False).encode(),
    'HTML 목록': html.encode(),
    '무작위 바이트': random.Random(1).randbytes(20000),
}
for name, data in samples.items():
    packed = gzip.compress(data, compresslevel=6, mtime=0)
    print(f'{name}: {len(data):,} → {len(packed):,}바이트 ({len(packed) / len(data):.0%})')
```
```text
JSON 목록: 15,513 → 1,205바이트 (8%)
HTML 목록: 11,380 → 1,076바이트 (9%)
무작위 바이트: 20,000 → 20,028바이트 (100%)
```
글자로 된 데이터는 같은 무늬(`"title": "할 일`, `<li class="item">`)가 반복되어 10% 아래로 줄었다. 무작위 바이트는 줄지 않았고 오히려 머리말만큼 28바이트 늘었다. 컴퓨터와 AI의 첫걸음 3편의 이야기 그대로다. 예측할 수 있는 데이터는 짧게 적을 수 있고, 이미 무작위처럼 보이는 데이터는 더 줄일 수 없다. 그래서 JPEG·PNG·동영상에는 HTTP 압축을 다시 걸지 않는다. 이미지는 형식(AVIF, WebP)과 크기 선택으로 줄인다.

## 직접 해 보기 2: gzip으로 답하는 서버
요청의 `Accept-Encoding`을 보고 압축 여부를 고르는 서버다. 코드는 훑어만 보자.
```python
# 파일: gzip_server.py
import gzip, json
from http.server import BaseHTTPRequestHandler, HTTPServer

DATA = json.dumps([{'id': i, 'title': f'할 일 {i}', 'done': i % 3 == 0} for i in range(500)],
                  ensure_ascii=False).encode()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body, encoding = DATA, None
        if 'gzip' in self.headers.get('Accept-Encoding', ''):
            body, encoding = gzip.compress(DATA, mtime=0), 'gzip'
        self.send_response_only(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Vary', 'Accept-Encoding')
        if encoding:
            self.send_header('Content-Encoding', encoding)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

HTTPServer(('127.0.0.1', 8019), Handler).serve_forever()
```
curl은 기본으로 압축을 요청하지 않고, `--compressed`를 주면 요청하고 받은 것을 풀어 준다.
```bash
python3 gzip_server.py &
sleep 1
U=http://127.0.0.1:8019/items
curl -s -o /dev/null -w '압축 없이: %{size_download}바이트\n' $U
curl -s --compressed -o /dev/null -w 'gzip으로: %{size_download}바이트\n' $U
curl -s --compressed -D - -o /dev/null $U | grep -i '^content-encoding'
curl -s --compressed $U | python3 -c 'import json, sys; print("풀어서 읽은 항목 수:", len(json.load(sys.stdin)))'
```
```text
압축 없이: 25613바이트
gzip으로: 2761바이트
Content-Encoding: gzip
풀어서 읽은 항목 수: 500
```
네트워크로 오간 것은 약 2.8KB인데 받은 쪽은 원래의 500개 항목을 그대로 읽었다. 압축은 서버와 클라이언트에 CPU를 조금 쓰게 하는 대신 전송 바이트를 크게 줄인다. 대부분의 웹 서버와 CDN은 설정 한 줄로 이것을 켠다.

## 지금 필요한 것만: 코드 분할과 이미지
압축 전의 크기 자체를 줄이는 방법도 있다.
- **줄이기**(minify): 공백, 주석, 긴 변수 이름을 빼서 자바스크립트와 CSS를 작게 만든다.
- **안 쓰는 코드 빼기**(tree shaking): 라이브러리에서 실제로 부르는 함수만 묶음에 넣는다.
- **코드 분할**(code splitting): 4편의 SPA처럼 모든 화면의 코드를 한 묶음으로 보내지 않고, 첫 화면에 필요한 것만 먼저 보내고 나머지는 그 화면으로 갈 때 `import()`로 받는다. 15편의 HTTP/2 덕분에 작은 파일 여러 개를 받는 비용이 줄어 가능해진 방식이다.
- **이미지**: 화면 크기에 맞는 해상도를 고르고(`srcset`), 화면 아래쪽의 이미지는 스크롤해서 가까워질 때 받는다(`loading="lazy"`).

## 긴 목록은 잘라서: 페이지네이션
상품 1만 개를 한 응답에 담으면 압축해도 크고, 서버는 다 읽느라 느리고, 사용자는 앞의 20개만 본다. 그래서 목록 API는 **페이지네이션**(pagination)으로 조금씩 준다. 흔한 방식이 두 가지다.
- **오프셋**: `?offset=20&limit=20`. 앞의 20개를 건너뛰고 20개를 준다. 쉽지만, 데이터베이스는 건너뛸 행도 다 세어야 해서 뒤쪽 페이지일수록 느려지고, 그사이 새 항목이 들어오면 경계가 밀린다.
- **커서**: `?after=글16&limit=20`. "마지막으로 본 것 다음부터"를 달라고 한다. 정렬 기준 칸에 인덱스가 있으면 몇 쪽이든 같은 속도로 찾고, 새 항목이 들어와도 경계가 밀리지 않는다. 대신 "37쪽으로 바로 가기"는 어렵다.

## 직접 해 보기 3: 새 글이 올라오면
최신순 피드를 다섯 개씩 읽는다. 1쪽을 읽은 사이에 새 글 두 개가 올라왔다.
```python
posts = [f'글{n}' for n in range(20, 0, -1)]          # 최신순: 글20, 글19, ...

def offset_page(data, page, size=5):
    return data[page * size:(page + 1) * size]

def cursor_page(data, after=None, size=5):           # 실제로는 WHERE id < 마지막 id
    start = 0 if after is None else data.index(after) + 1
    return data[start:start + size]

first = offset_page(posts, 0)
print('1쪽:', first)
posts = ['글22', '글21'] + posts                      # 그사이 새 글 두 개
print('오프셋 2쪽:', offset_page(posts, 1))
print('커서 2쪽: ', cursor_page(posts, after=first[-1]))
```
```text
1쪽: ['글20', '글19', '글18', '글17', '글16']
오프셋 2쪽: ['글17', '글16', '글15', '글14', '글13']
커서 2쪽:  ['글15', '글14', '글13', '글12', '글11']
```
오프셋 방식의 2쪽에는 이미 본 글17과 글16이 다시 나왔다. 새 글 두 개가 앞에 끼어 모든 글이 두 칸씩 밀렸기 때문이다(반대로 글이 지워지면 몇 개를 건너뛴다). 커서 방식은 "글16 다음"을 달라고 했으므로 정확히 이어진다. 무한 스크롤 피드가 대부분 커서를 쓰는 이유다.

## 흔한 오해
- "압축은 무조건 좋다": 이미 압축된 이미지·동영상·zip에는 효과가 없고 CPU만 쓴다. 아주 작은 응답(수백 바이트)도 이득이 거의 없다.
- "번들을 하나로 합치면 요청이 줄어 빠르다": HTTP/1.1 시대의 요령이다. 지금은 첫 화면에 필요 없는 코드까지 받아 해석하느라 늦어지는 경우가 많다. 자주 바뀌는 코드와 거의 안 바뀌는 라이브러리를 나누면 캐시(16편)에도 유리하다.
- "페이지 크기는 클수록 요청이 줄어 좋다": 한 번의 응답이 커지면 첫 화면이 늦고 서버의 쿼리도 무거워진다. 화면에 보이는 만큼에 조금 여유를 두는 정도가 보통이다.

## 어디에 쓰이나
- 컴퓨터와 AI의 첫걸음 3편 「정보 이론이란 무엇인가: 놀라움을 비트로 재기」: 반복되는 글자는 줄고 무작위 바이트는 줄지 않는 이유를 엔트로피로 설명한다.
- PostgreSQL 실무 6편 「인덱스 1: B-트리와 실행 계획 읽기」: 커서 페이지네이션이 몇 쪽이든 빠른 것은 정렬 칸의 B-트리 인덱스를 따라가기 때문이다.
- 게임 자원 관리 14편 「네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화」: 바뀐 부분만, 필요한 정밀도로만 보내는 더 공격적인 줄이기 기법이다.

## 정리
- 바이트는 전송 시간, 사용자의 요금, 기기의 해석 시간으로 세 번 비용을 치른다.
- `Accept-Encoding`과 `Content-Encoding`으로 압축을 협상한다. 글자 데이터는 10% 안팎까지 줄고, 이미 압축된 데이터는 줄지 않는다.
- 코드 분할, 안 쓰는 코드 빼기, 알맞은 이미지 크기와 지연 로딩으로 지금 필요한 것만 먼저 보낸다.
- 긴 목록은 페이지네이션한다. 오프셋은 쉽지만 밀리고 느려지며, 커서는 경계가 정확하고 빠르다.

## 더 알아보기
- 이전 글: 16편 「다시 받지 않기: 브라우저 캐시, ETag, CDN」
- 다음 글: 18편 「트래픽을 나누는 장치: 리버스 프록시와 로드 밸런서」
- Brotli 명세 RFC 7932: https://www.rfc-editor.org/rfc/rfc7932
