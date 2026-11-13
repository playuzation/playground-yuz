# [Nginx 웹 서버 4/10] location 매칭: 접두사, 정확히, 정규식의 우선순위

> **한 줄 요약** — Nginx는 요청 경로에 대해 정확히 일치(`=`)를 먼저 보고, 접두사 location 중 가장 긴 것을 기억해 두었다가, 그것에 `^~`가 없으면 정규식 location을 적힌 순서대로 검사해 처음 맞는 것을 쓰고, 정규식이 하나도 맞지 않을 때만 기억해 둔 접두사로 돌아간다.

## 이 글에서 다루는 것
- location의 네 가지 모양: 접두사, `=`, `^~`, 정규식(`~`, `~*`)
- 고르는 순서: 정확히 → 가장 긴 접두사 → 정규식 → 접두사
- 직접 해 보기: 경로 열 개가 어느 location으로 가는지
- 끝 슬래시 없는 접두사의 함정
- 이름 붙은 location과 설계 요령

## location의 네 가지 모양
3편까지 `location /images/ { … }` 같은 블록을 썼다. location은 경로(쿼리 문자열을 뺀 `$uri`)를 무엇과 비교하느냐에 따라 네 가지로 쓴다.
- `location /docs/`: **접두사**. 경로가 `/docs/`로 시작하면 후보가 된다.
- `location = /`: **정확히**. 경로가 정확히 `/`일 때만.
- `location ^~ /images/`: **접두사인데**, 가장 길게 맞으면 정규식 검사를 건너뛴다.
- `location ~ \.php$`, `location ~* \.(png|jpg)$`: **정규식**. `~`는 대소문자를 구분하고 `~*`는 구분하지 않는다.

## 고르는 순서
```text
1. "=" matches?   → done
2. longest prefix → remember
   has "^~"?      → done
3. regex in order → first wins
4. no regex       → use prefix
```
직관과 가장 다른 곳은 3단계다. 아무리 길게 맞는 접두사가 있어도, 정규식이 하나라도 맞으면 정규식이 이긴다. 그리고 정규식끼리는 "더 구체적인 것"이 아니라 **파일에 먼저 적힌 것**이 이긴다.

## 직접 해 보기: 경로 열 개
각 location이 자기 이름을 돌려주게 해 두고, 경로를 하나씩 보낸다.
```nginx
# 파일: nginx.conf
pid nginx.pid;
error_log logs/error.log;
events {}

http {
    access_log off;
    default_type text/plain;
    server {
        listen 127.0.0.1:8080;
        location = /                 { return 200 "A  = /\n"; }
        location /                   { return 200 "B  /\n"; }
        location /docs/              { return 200 "C  /docs/\n"; }
        location /docs/old/          { return 200 "D  /docs/old/\n"; }
        location ^~ /images/         { return 200 "E  ^~ /images/\n"; }
        location ~ ^/docs/.*\.pdf$   { return 200 "F  ~ docs pdf\n"; }
        location ~* \.(png|jpg)$     { return 200 "G  ~* png|jpg\n"; }
        location /api                { return 200 "H  /api\n"; }
    }
}
```
```bash
mkdir -p logs
nginx -p "$PWD" -c nginx.conf -g 'daemon off;' &
sleep 0.5
for path in / /index.html /docs/intro /docs/a.pdf /docs/old/x /docs/old/x.pdf \
            /images/cat.png /photos/cat.PNG /photos/cat.gif /api-internal/secret; do
  printf '%-22s ' "$path"; curl -s "http://127.0.0.1:8080$path"
done
nginx -p "$PWD" -c nginx.conf -s quit 2>/dev/null
```
```text
/                      A  = /
/index.html            B  /
/docs/intro            C  /docs/
/docs/a.pdf            F  ~ docs pdf
/docs/old/x            D  /docs/old/
/docs/old/x.pdf        F  ~ docs pdf
/images/cat.png        E  ^~ /images/
/photos/cat.PNG        G  ~* png|jpg
/photos/cat.gif        B  /
/api-internal/secret   H  /api
```
한 줄씩 순서에 대입해 보자.
- `/`: 정확히 일치하는 A가 바로 이겼다. 홈 화면처럼 자주 오는 경로에 `=`를 쓰면 검사가 가장 짧게 끝난다.
- `/index.html`: 맞는 접두사는 `/`뿐이고 정규식도 맞지 않아 B다.
- `/docs/intro`와 `/docs/old/x`: 가장 긴 접두사(C, D)가 쓰였다. 정규식이 맞지 않았기 때문이다.
- `/docs/a.pdf`와 `/docs/old/x.pdf`: 가장 긴 접두사는 각각 C와 D였지만, 정규식 F가 맞자 F가 이겼다. 오래된 문서 폴더에만 다른 설정을 주려고 D를 만들었는데 PDF는 그 설정을 받지 못하는 셈이다.
- `/images/cat.png`: 정규식 G도 맞지만, 가장 긴 접두사 E에 `^~`가 붙어 있어 정규식 검사 없이 E로 끝났다.
- `/photos/cat.PNG`: 대문자 확장자도 `~*`이라 G가 맞았다. `~`였다면 맞지 않았다.
- `/api-internal/secret`: `location /api`는 끝 슬래시가 없어서 `/api-internal`도 "`/api`로 시작"한다. API에만 걸려던 설정(인증, 프록시)이 엉뚱한 경로에 걸리는 흔한 실수다. `location /api/`처럼 슬래시까지 적거나, 정확히 `/api`도 받아야 하면 `location = /api`를 따로 둔다.

## 이름 붙은 location과 중첩
`location @fallback { … }`처럼 `@`로 시작하는 **이름 붙은 location**은 요청 경로와 비교되지 않고, `try_files … @fallback;`이나 `error_page 404 = @fallback;`처럼 다른 지시어가 내부적으로 넘길 때만 쓰인다. "파일이 없으면 애플리케이션 서버로" 같은 구성에 쓴다(5편). location 안에 location을 겹쳐 쓸 수도 있지만, 매칭 순서가 한 단계 더 복잡해지므로 꼭 필요할 때만 쓴다.

## 설계 요령
- 대부분은 접두사 location으로 쓰고, 끝 슬래시를 붙인다.
- 정규식은 정말 패턴이 필요할 때만, 그리고 더 구체적인 정규식을 위에 둔다. 정규식은 순서가 우선순위다.
- 특정 폴더가 정규식(확장자 규칙 등)에 가로채이지 않게 하려면 `^~`를 쓴다. 정적 파일 폴더에 흔히 쓴다.
- 자주 오는 정확한 경로(`/`, `/health`)는 `=`로 둔다.
- 바꾼 뒤에는 위처럼 경로 목록을 curl로 돌려 의도대로 가는지 확인한다. 이 목록을 스크립트로 남겨 두면 설정을 고칠 때마다 다시 확인할 수 있다.

## 흔한 오해
- "더 길게 맞는 location이 항상 이긴다": 접두사끼리만 그렇다. 정규식이 맞으면 짧아도 정규식이 이긴다.
- "정규식은 가장 구체적인 것이 이긴다": 파일에 먼저 적힌 것이 이긴다. 순서를 바꾸면 결과가 바뀐다.
- "`location /api`는 `/api`로 시작하는 API 경로만 받는다": `/api-internal`, `/apiary`처럼 글자가 이어지는 경로도 받는다. 끝 슬래시를 붙인다.

## 어디에 쓰이나
- 문자열 알고리즘 3편 「Z 알고리즘: 모든 위치의 최장 공통 접두사」: 가장 긴 접두사를 찾는 문제를 알고리즘 쪽에서 본다. Nginx는 접두사 location을 나무 구조로 정리해 빨리 찾는다.
- 웹 앱의 원리 12편 「API를 설계하는 방식: REST, GraphQL, gRPC」: `/api/`, `/static/`처럼 경로로 역할을 나누는 설계가 location 설계와 맞물린다.
- 컴퓨터와 AI의 첫걸음 4편 「유한상태기계란 무엇인가: 기억이 정해진 만큼인 기계」: 정규식이 문자열을 검사하는 원리는 유한상태기계다.

## 정리
- location은 접두사, `=`, `^~`, 정규식(`~`, `~*`) 네 모양이다.
- 순서: 정확히 일치 → 가장 긴 접두사 기억(`^~`면 끝) → 정규식을 적힌 순서대로 → 없으면 기억한 접두사.
- 정규식은 길이와 상관없이 접두사를 이기고, 정규식끼리는 먼저 적힌 것이 이긴다.
- 접두사에는 끝 슬래시를 붙이고, 바꾼 뒤에는 경로 목록으로 확인한다.

## 더 알아보기
- 이전 글: 3편 「정적 파일 서빙: root, alias, try_files」
- 다음 글: 5편 「리버스 프록시: proxy_pass와 헤더, 시간 제한」
