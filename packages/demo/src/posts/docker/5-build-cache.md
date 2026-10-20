# [도커와 컨테이너 5/14] 빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기

> **한 줄 요약** — BuildKit은 빌드 단계마다 "앞 단계 + 명령 문자열 + (COPY라면) 파일 내용"으로 캐시 키를 만들어 같은 것이 있으면 재사용하고 한 단계가 바뀌면 뒤는 모두 다시 실행하므로, 잘 바뀌지 않는 의존성 설치를 앞에, 자주 바뀌는 소스 복사를 뒤에 두고, 패키지 다운로드는 캐시 마운트로 따로 아낀다.

## 이 글에서 다루는 것
- 캐시가 무효화되는 규칙: 명령 문자열, COPY 파일 내용(mtime은 제외), 앞 단계
- 의존성 목록을 먼저 COPY하는 패턴을 `CACHED` 표시로 확인하기
- `RUN --mount=type=cache`로 다운로드를 재사용하기
- `--no-cache`, CI에서 캐시 재사용(`--cache-to`·`--cache-from`), 재현 가능한 빌드

## 문제: 코드 한 줄 고쳤는데 의존성 설치를 처음부터
파이썬 서비스의 흔한 첫 Dockerfile은 이렇다.
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["python", "main.py"]
```
`main.py`의 오타 하나를 고쳐도 `pip install`이 처음부터 다시 돈다. 의존성이 많으면 매 빌드가 몇 분이다. 줄 순서만 바꿔도 이 시간이 사라지는데, 그 이유가 캐시 키 규칙에 있다.

## 원리: 캐시 키는 사슬이다
BuildKit은 Dockerfile을 단계의 그래프로 바꾸고, 단계마다 캐시 키를 계산한다. 같은 키의 결과가 빌더에 있으면 실행하지 않고 가져다 쓰며, 진행 출력에 `CACHED`라고 찍는다.
| 단계 | 캐시 키의 재료 |
|---|---|
| `FROM python:3.12-slim` | 베이스 이미지 다이제스트 |
| `COPY requirements.txt …` | 앞 단계 키 + 파일 내용 |
| `RUN …(설치)` | 앞 단계 키 + 명령 문자열 |
| `COPY app/ …` | 앞 단계 키 + 파일 내용 |

- `RUN`: 명령 문자열만 본다. 명령이 인터넷에서 무엇을 받아 오는지는 모른다. 그래서 `RUN apt-get update` 한 줄은 한번 캐시되면 몇 달 지난 패키지 목록을 계속 재사용한다.
- `COPY`·`ADD`: 원본 파일의 내용과 메타데이터로 체크섬을 만든다. 공식 문서대로 수정 시각(mtime)은 넣지 않는다.
- 사슬: 각 키에 앞 단계의 키가 들어가므로 한 단계가 바뀌면 그 뒤는 내용과 상관없이 모두 다시 실행된다.

따라서 원칙은 하나다. **자주 바뀌는 것을 뒤로** 보낸다. 의존성 목록 파일만 먼저 복사해 설치하고, 소스 코드는 그다음에 복사한다.

## 따라 하기: 순서에 따라 달라지는 캐시
이 글의 실행 환경은 컨테이너 안에서 인터넷이 안 되어 `pip install`을 돌릴 수 없다. 그래서 설치 단계를 "목록 파일을 읽고 3초 걸리는 단계"로 흉내 낸다. 캐시 규칙은 단계가 무엇을 하는지와 상관이 없으므로 결과는 실제 `pip install`과 같다.
```txt
# 파일: requirements.txt
flask==3.1.0
requests==2.32.3
```
```python
# 파일: app/main.py
print("hello")
```
```dockerfile
# 파일: Dockerfile
FROM python:3.12-slim
COPY requirements.txt /app/
RUN sleep 3 && grep -v '^#' /app/requirements.txt > /app/installed.txt
COPY app/ /app/app/
CMD ["python", "/app/app/main.py"]
```
빌드 출력에서 단계마다 캐시를 썼는지만 뽑아 보는 함수와, 파일 내용을 실제로 바꾸는 함수를 만든다. `edit`가 시각을 덧붙이는 것은 이 실습을 여러 번 반복해도 매번 새로운 내용이 되게 하려는 것이다.
```bash
steps() {
  docker build --progress=plain -t cachedemo "$@" . 2>&1 | awk '
    $2 ~ /^\[[0-9]+\/[0-9]+\]$/ && $3 != "FROM" { step[$1] = $2 " " $3 }
    $2 == "CACHED" { hit[$1] = 1 }
    END { for (id in step) print step[id], (id in hit ? "CACHED" : "실행") }' | sort
}
edit() { echo "# 수정 $(date +%s%N)" >> "$1"; }
steps --no-cache
```
```text
[2/4] COPY 실행
[3/4] RUN 실행
[4/4] COPY 실행
```
`--no-cache`로 캐시 없이 처음부터 빌드했다. 아무것도 바꾸지 않고 다시 빌드하면 전부 캐시에서 온다. 파일의 수정 시각만 바꿔도 마찬가지다.
```bash
steps
touch requirements.txt app/main.py && steps
```
```text
[2/4] COPY CACHED
[3/4] RUN CACHED
[4/4] COPY CACHED
[2/4] COPY CACHED
[3/4] RUN CACHED
[4/4] COPY CACHED
```
`touch`로 mtime이 바뀌었지만 내용이 같으므로 캐시가 유지되었다. 이제 소스 코드를 고친다.
```bash
edit app/main.py && steps
```
```text
[2/4] COPY CACHED
[3/4] RUN CACHED
[4/4] COPY 실행
```
3초짜리 설치 단계는 캐시에서 오고 마지막 복사만 다시 했다. 의존성 목록을 고치면 그 단계부터 끝까지 다시 실행된다.
```bash
edit requirements.txt && steps
```
```text
[2/4] COPY 실행
[3/4] RUN 실행
[4/4] COPY 실행
```
`app/`는 바뀌지 않았지만 앞 단계의 키가 바뀌었으니 [4/4]도 다시 실행되었다. 사슬 규칙이다. 처음 본 나쁜 순서와 비교해 보자.
```dockerfile
# 파일: Dockerfile.bad
FROM python:3.12-slim
COPY . /app/
RUN sleep 3 && grep -v '^#' /app/requirements.txt > /app/installed.txt
CMD ["python", "/app/app/main.py"]
```
```bash
steps -f Dockerfile.bad --no-cache > /dev/null
edit app/main.py && steps -f Dockerfile.bad
```
```text
[2/3] COPY 실행
[3/3] RUN 실행
```
소스 한 줄 때문에 설치 단계가 다시 돌았다. 실무 Dockerfile로 옮기면 이렇다(이 블록은 인터넷이 필요해 여기서 실행하지 않았지만, 여러분의 환경에서는 그대로 동작한다).
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```
Node라면 `COPY package.json package-lock.json ./` → `RUN npm ci` → `COPY . .`, Go라면 `COPY go.mod go.sum ./` → `RUN go mod download` → `COPY . .`로 같은 모양이다.

## 캐시 마운트: 다시 실행되는 단계에서도 다운로드는 재사용
레이어 캐시는 전부 아니면 전무다. 패키지 하나만 추가해도 설치 단계는 처음부터 돌고, 이미 받았던 패키지도 다시 내려받는다. `RUN --mount=type=cache`는 빌드 사이에 유지되는 폴더를 그 단계에만 붙여 준다. 이 폴더는 이미지 레이어에 들어가지 않는다. 다운로드를 흉내 내는 단계로 확인한다.
```dockerfile
# 파일: Dockerfile.mount
FROM busybox:1.37
COPY requirements.txt /app/
RUN --mount=type=cache,id=pkg-demo,target=/cache \
    for p in $(grep -v '^#' /app/requirements.txt); do \
      if [ -f "/cache/$p" ]; then echo "재사용 $p"; \
      else echo "다운로드 $p"; sleep 1; touch "/cache/$p"; fi; \
    done
```
```bash
mbuild() {
  docker build --progress=plain -f Dockerfile.mount -t mountdemo "$@" . 2>&1 \
    | grep -E '^#[0-9]+ [0-9.]+ (재사용|다운로드) ' | cut -d' ' -f3-
}
mbuild --no-cache
edit requirements.txt && mbuild
docker run --rm mountdemo ls /cache
```
```text
다운로드 flask==3.1.0
다운로드 requests==2.32.3
재사용 flask==3.1.0
재사용 requests==2.32.3
ls: /cache: No such file or directory
```
두 번째 빌드는 목록 파일이 바뀌어 레이어 캐시는 놓쳤지만, 캐시 마운트에 남은 파일 덕분에 다운로드를 건너뛰었다. 결과 이미지에는 `/cache`가 없다. 이 환경(Docker 29.6)에서는 `--no-cache` 빌드가 캐시 마운트도 빈 상태로 시작했다. 실무에서는 `--mount=type=cache,target=/root/.cache/pip`(pip), `target=/root/.npm`(npm), `target=/root/.cache/go-build`(Go)처럼 도구의 캐시 폴더에 붙인다. 이때는 위 예처럼 `--no-cache-dir`을 주지 않는다.

## CI에서 캐시 재사용하기
캐시는 빌더(데몬) 안에 있다. CI 러너는 매번 새 기계라 캐시가 비어 있으므로, 캐시를 밖으로 내보냈다가 다음 빌드에서 들여와야 한다. `--cache-to`·`--cache-from`이 그 일을 하고, 저장소로 로컬 폴더(`local`), 레지스트리(`registry`), 이미지 안(`inline`), GitHub Actions 캐시(`gha`) 등을 쓴다.
```bash
docker build -q --cache-to type=local,dest=buildcache,mode=max -t cachedemo . > /dev/null
ls buildcache
docker build --progress=plain --cache-from type=local,src=buildcache -t cachedemo . 2>&1 \
  | grep -o 'importing cache manifest from local'
```
```text
blobs
index.json
ingest
oci-layout
importing cache manifest from local
```
내보낸 캐시는 2편에서 본 OCI 레이아웃(인덱스 + 블롭)이다. `mode=max`는 중간 단계까지 모두 담는다. 기본 docker 드라이버에서 이 기능은 containerd 이미지 저장소를 켰을 때만 되고, 아니면 `docker buildx create`로 만든 docker-container 드라이버 빌더가 필요하다. GitHub Actions에서는 보통 `docker/build-push-action`의 `cache-from: type=gha`, `cache-to: type=gha,mode=max`로 쓴다(GitHub 협업과 자동화 7편).

## 흔한 실수와 문제 해결
- `.dockerignore`가 없으면 `COPY . .`가 `.git`이나 로그 파일의 변화에도 무효화된다(4편).
- 빌드 시각이나 커밋 해시를 넣는 `ARG`를 앞쪽에 두면, 그 값을 쓰는 `RUN`부터 매번 캐시를 놓친다. 이런 값은 `LABEL`처럼 맨 뒤에서 쓴다.
- `RUN apt-get update`와 `RUN apt-get install …`을 나누면 앞줄이 캐시되어 오래된 목록으로 설치하다 실패한다. 한 `RUN`에 `apt-get update && apt-get install -y …`로 묶는다.
- 캐시가 이상하다 싶으면 `--progress=plain`으로 어느 단계부터 `CACHED`가 사라지는지 본다. 일부러 처음부터 빌드하려면 `--no-cache`, 베이스 이미지를 새로 확인하려면 `--pull`(레지스트리 접속 필요)을 쓴다.
- 같은 태그로 다시 빌드하면 옛 이미지는 이름 없는(dangling) 이미지로 남고, 빌드 캐시도 계속 쌓인다. `docker image prune`, `docker builder prune`으로 정리한다(14편).

```bash
docker image rm cachedemo mountdemo | grep -c Untagged
```
```text
2
```

## 재현 가능한 빌드
캐시는 빠르게 해 주지만 "같은 Dockerfile이면 같은 이미지"를 보장하지는 않는다. 캐시가 없는 새 기계에서는 그날의 태그와 패키지 저장소 상태로 빌드된다. 베이스는 `FROM python:3.12-slim@sha256:…`처럼 다이제스트로 고정하고(2편), 의존성은 정확한 버전을 담은 잠금 파일(`requirements.txt`의 `==` 고정, `package-lock.json`, `go.sum`)로 고정하며, 갱신은 Dependabot 같은 도구로 PR을 받아 의식적으로 한다(GitHub 협업과 자동화 10편). BuildKit은 Docker Engine 23.0부터 리눅스의 기본 빌더이고, 이 글의 출력은 Docker 29.6(BuildKit 0.31) 기준이다.

## 숫자로 보기
| 빌드 상황 | 이 환경 측정 |
|---|---|
| 처음 빌드(`--no-cache`) | 약 3.8초 |
| 소스만 수정, 좋은 순서 | 약 0.5초 |
| 소스만 수정, 나쁜 순서 | 약 3.8초 |

## 어디에 쓰이나
- 동적 계획법 1편 「동적 계획법의 기본: 부분 문제와 점화식」: 빌드 캐시는 단계의 입력을 키로 결과를 저장해 두는 메모이제이션이다. 다만 `RUN apt-get update`처럼 키에 드러나지 않는 외부 상태가 있으면 "같은 입력이면 같은 결과"라는 전제가 깨진다.
- GitHub 협업과 자동화 7편 「GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로」: `actions/cache`의 key·restore-keys도 "입력 파일의 해시로 키를 만든다"는 같은 설계다.
- 6편 「멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기」: 단계가 여럿이면 서로 의존하지 않는 단계를 BuildKit이 병렬로 빌드하고 단계별로 캐시한다.

## 정리
- 캐시 키는 앞 단계 키 + 명령 문자열(RUN) 또는 파일 내용(COPY·ADD)이고 mtime은 보지 않는다. 한 단계가 바뀌면 뒤는 모두 다시 실행된다.
- 의존성 목록 → 설치 → 소스 복사 순서로 쓰면 소스 수정 때 설치 단계가 `CACHED`로 남는다.
- 캐시 마운트는 레이어 캐시를 놓친 단계에서도 다운로드를 재사용하고, 이미지에는 들어가지 않는다.
- CI에서는 `--cache-to`·`--cache-from`으로 캐시를 옮기고, 재현성은 다이제스트와 잠금 파일로 따로 챙긴다.

## 더 알아보기
- 이전 글: 4편 「Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT」
- 다음 글: 6편 「멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기」
- Build cache invalidation: https://docs.docker.com/build/cache/invalidation/
