# [Nginx 웹 서버 3/10] 정적 파일 서빙: root, alias, try_files

> **한 줄 요약** — Nginx는 URL 경로를 `root`(경로 전체를 뒤에 붙임)나 `alias`(location 부분을 바꿔 끼움)로 디스크 경로로 바꾸고, `try_files`로 "이 파일, 없으면 저 파일" 순서를 정해 싱글 페이지 앱의 대체 경로를 만들며, 파일마다 Content-Type·ETag·범위 요청을 알아서 처리한다.

## 이 글에서 다루는 것
- URL을 파일 경로로: `root`와 `alias`의 차이
- `index`, MIME 타입, `default_type`
- `try_files`: 파일이 없을 때의 순서, SPA 대체 경로
- 자동으로 붙는 ETag·Last-Modified와 304, 범위 요청
- 숨김 파일 막기

## URL을 파일 경로로
정적 파일 서빙은 결국 "요청 URL의 경로를 디스크의 파일 경로로 바꾸는 일"이다. 이 변환을 정하는 지시어가 둘 있다.
- `root /srv/site;`: URL 경로를 **통째로** 뒤에 붙인다. `/images/cat.png` → `/srv/site/images/cat.png`.
- `alias /srv/assets/;`: location이 맞춘 부분을 **바꿔 끼운다**. `location /images/`에서 `/images/cat.png` → `/srv/assets/cat.png`.

실습용 폴더와 파일을 만든다.
```bash
mkdir -p logs site/images assets app/assets
printf '<h1>home</h1>\n' > site/index.html
printf 'cat-from-site\n' > site/images/cat.txt
printf 'cat-from-assets\n' > assets/cat.txt
printf '<div id="app"></div>\n' > app/index.html
printf 'console.log(1)\n' > app/assets/app.3f9a1c.js
printf 'secret=1\n' > site/.env
```
설정은 세 가지 방식을 한 server에 모았다. `$document_root`는 지금 쓰이는 root 값이다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    include /etc/nginx/mime.types;          # 확장자 → Content-Type 표
    default_type application/octet-stream;
    access_log logs/access.log;

    server {
        listen 127.0.0.1:8080;
        root site;                          # 기준 폴더(-p) 아래의 site
        index index.html;

        location /images/ {
            # root를 상속받으므로 /images/cat.txt → site/images/cat.txt
        }

        location /assets-alias/ {
            alias assets/;                  # /assets-alias/cat.txt → assets/cat.txt
        }

        location /app/ {
            alias app/;
            try_files $uri $uri/ /app/index.html;   # 없는 경로는 SPA의 index.html로
        }

        location ~ /\. {                    # .env, .git 같은 숨김 파일
            deny all;
        }
    }
}
```
```bash
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
U=http://127.0.0.1:8080
curl -s $U/
curl -s $U/images/cat.txt
curl -s $U/assets-alias/cat.txt
curl -s -o /dev/null -w '%{http_code}\n' $U/images/dog.txt
curl -s -o /dev/null -w '%{http_code}\n' $U/.env
```
```text
<h1>home</h1>
cat-from-site
cat-from-assets
404
403
```
`/`는 `index` 지시어 때문에 `site/index.html`이 되었다. `/images/`는 root를 상속받아 경로가 그대로 붙었고, `/assets-alias/`는 alias가 location 부분을 `assets/`로 바꿔 끼웠다. 없는 파일은 404, 숨김 파일은 403이다. `.env`나 `.git` 폴더를 실수로 웹 루트에 두는 일은 생각보다 흔해서, 숨김 파일을 막는 location은 습관처럼 넣어 둘 만하다.

`alias`에서 가장 흔한 실수는 슬래시다. `location /images/`에 `alias /srv/assets;`(끝 슬래시 없음)라고 쓰면 `/images/cat.png`가 `/srv/assetscat.png`가 된다. location과 alias의 끝 슬래시는 짝을 맞추자. 둘 중 고민되면, 경로를 그대로 붙여도 되는 경우는 `root`를 쓰는 편이 단순하다.

## Content-Type과 MIME 타입
브라우저는 받은 바이트를 `Content-Type` 헤더를 보고 해석한다(웹 앱의 원리 1편). Nginx는 `mime.types` 파일의 "확장자 → 타입" 표로 이 헤더를 붙이고, 표에 없으면 `default_type`을 쓴다.
```bash
curl -sI $U/ | grep -i '^content-type'
curl -sI $U/app/assets/app.3f9a1c.js | grep -i '^content-type'
curl -sI $U/images/cat.txt | grep -i '^content-type'
```
```text
Content-Type: text/html
Content-Type: application/javascript
Content-Type: text/plain
```
`mime.types`를 `include`하지 않으면 모든 파일이 `default_type`으로 나가서, 브라우저가 스크립트나 스타일시트를 거부하는 일이 생긴다.

## try_files: 없으면 다음 후보
`try_files`는 후보를 왼쪽부터 확인해 처음으로 존재하는 것을 쓰고, 모두 없으면 마지막 항목으로 넘어간다. 싱글 페이지 앱(웹 앱의 원리 4편)은 `/app/orders/42` 같은 주소를 브라우저의 자바스크립트가 처리하므로, 서버에 그런 파일이 없어도 `index.html`을 줘야 한다.
```bash
curl -s $U/app/orders/42
curl -s $U/app/assets/app.3f9a1c.js
curl -s -o /dev/null -w '%{http_code}\n' $U/app/assets/missing.js
```
```text
<div id="app"></div>
console.log(1)
200
```
진짜 파일(`app.3f9a1c.js`)은 그대로 나갔고, 없는 경로 `/app/orders/42`는 `index.html`로 대체되어 앱이 열린다. 문제는 세 번째 줄이다. 없는 스크립트 파일도 HTML로 대체되어 200이 나갔다. 브라우저는 스크립트 자리에 HTML을 받아 이해하기 어려운 오류를 낸다. 그래서 정적 자원 폴더에는 대체를 하지 않도록 location을 따로 나누고 `try_files $uri =404;`를 주는 것이 좋다. `=404`는 "후보가 모두 없으면 404로 답하라"는 뜻이다.

## 알아서 붙는 것들: ETag, 304, 범위 요청
정적 파일에는 Nginx가 파일의 수정 시각과 크기로 만든 `ETag`와 `Last-Modified`를 붙이고, 조건부 요청(웹 앱의 원리 16편)이 오면 304로 답한다. 동영상처럼 큰 파일의 일부만 달라는 **범위 요청**(`Range`)에는 206과 그 조각만 보낸다.
```bash
TAG=$(curl -sI $U/images/cat.txt | grep -i '^etag' | cut -d' ' -f2 | tr -d '\r')
curl -s -o /dev/null -w '조건부 요청: %{http_code}\n' -H "If-None-Match: $TAG" $U/images/cat.txt
curl -s -w '\n범위 요청: %{http_code}\n' -H 'Range: bytes=0-2' $U/images/cat.txt
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
조건부 요청: 304
cat
범위 요청: 206
```
캐시 수명(`Cache-Control`, `expires`)은 자동으로 붙지 않는다. 지문 넣은 파일 이름(`app.3f9a1c.js`)에 긴 수명을 주는 설정은 8편에서 한다. 큰 파일을 효율적으로 보내는 `sendfile on;`(커널이 파일을 소켓으로 바로 복사)은 우분투 기본 설정에 이미 켜져 있다.

## 흔한 오해
- "`alias`와 `root`는 같은 것이다": root는 경로 전체를 붙이고, alias는 location 부분을 바꿔 끼운다. 같은 설정에서 결과 경로가 다르다.
- "SPA 대체는 `try_files … /index.html` 한 줄이면 된다": 없는 정적 자원까지 HTML로 대체된다. 자원 폴더는 `=404`로 따로 처리한다.
- "웹 루트에 둔 파일은 링크가 없으면 아무도 못 본다": 이름만 알면 누구나 요청한다. `.env`, 백업 파일, `.git`은 웹 루트 밖에 두고, 숨김 파일 차단을 함께 건다.

## 어디에 쓰이나
- 웹 앱의 원리 4편 「문서에서 앱으로: AJAX, fetch, 싱글 페이지 앱」: 브라우저가 화면 이동을 맡는 SPA가 왜 서버의 대체 경로를 필요로 하는지 그 배경이다.
- 웹 앱의 원리 16편 「다시 받지 않기: 브라우저 캐시, ETag, CDN」: Nginx가 자동으로 붙인 ETag와 304가 브라우저 캐시와 어떻게 맞물리는지 이어진다.
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 빌드한 정적 파일을 올려 두는 호스팅이 안쪽에서 하는 일이 이 글의 정적 서빙이다.

## 정리
- `root`는 URL 경로를 통째로 붙이고, `alias`는 location 부분을 바꿔 끼운다. alias의 끝 슬래시를 location과 맞춘다.
- `include mime.types`로 확장자별 Content-Type을 붙인다.
- `try_files`는 후보를 차례로 확인한다. SPA는 마지막 후보로 index.html을 주되, 정적 자원은 `=404`로 분리한다.
- ETag·Last-Modified·304와 범위 요청은 자동으로 처리된다. 숨김 파일은 막는다.

## 더 알아보기
- 이전 글: 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」
- 다음 글: 4편 「location 매칭: 접두사, 정확히, 정규식의 우선순위」
