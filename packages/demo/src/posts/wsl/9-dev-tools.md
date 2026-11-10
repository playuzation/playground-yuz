# [WSL 개발 환경 9/10] WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱

> **한 줄 요약** — WSL에서 쓰는 개발 도구는 대부분 "화면과 드라이버는 윈도우, 실행은 리눅스"로 나뉜다. VS Code는 윈도우 UI와 리눅스 쪽 서버로, 도커 데스크톱은 전용 배포판으로, GPU는 윈도우 드라이버를 리눅스에 비추는 방식으로, GUI 앱은 RDP로 화면을 넘기는 WSLg로 동작한다. 이 구분을 알면 어디에 무엇을 설치할지가 정해진다.

## 이 글에서 다루는 것
- VS Code WSL 확장: `code .`이 하는 일과 확장이 설치되는 위치
- 도커 데스크톱의 WSL 2 백엔드와 WSL 안 Docker Engine 비교
- GPU 연산: 드라이버는 윈도우에만, `/usr/lib/wsl/lib`의 역할
- WSLg로 리눅스 GUI 앱 실행하기
- 새 배포판을 몇 분 안에 내 환경으로 만드는 dotfiles 초기화 스크립트

## 원칙: 무엇이 어느 쪽에 사는가
3편에서 "프로젝트는 리눅스 파일 시스템에" 두기로 했다. 그러면 그 파일을 읽고 빌드하는 도구(컴파일러, 언어 서버, git, 테스트 러너)도 리눅스에서 돌아야 빠르고 정확하다. 반대로 창을 그리는 일과 하드웨어 드라이버는 윈도우가 맡는다. 아래 도구들은 모두 이 경계를 어떻게 나누느냐의 변형이다.

## VS Code: 화면은 윈도우, 서버는 리눅스
VS Code는 윈도우에 설치하고(공식 문서는 WSL 파일 시스템이 아니라 윈도우에 설치하라고 한다) WSL 확장(Remote Development 확장 팩에 포함)을 더한다. 배포판 터미널의 프로젝트 폴더에서 `code .`을 치면, 처음 한 번은 리눅스 쪽에 필요한 구성 요소를 내려받는다. 이것이 `~/.vscode-server`에 설치되는 VS Code 서버다.
```text
┌ Windows ───────────────────┐
│ VS Code UI (client)        │
│ themes, keymaps            │
└─────────────┬──────────────┘
              │ WSL extension
┌ WSL distro ─┴──────────────┐
│ ~/.vscode-server           │
│ language servers, git,     │
│ debugger, terminal, tasks  │
└────────────────────────────┘
```
문서는 이것을 클라이언트-서버 구조라고 부른다. 테마 같은 UI 확장은 윈도우에 한 번만 설치하면 되지만, 파이썬 확장처럼 코드를 분석하고 디버깅하는 확장은 배포판마다 따로 설치해야 하고, 빠져 있으면 "Install in WSL" 버튼이 뜬다. 함정 하나는 VS Code 서버가 셸 시작 스크립트(`.bashrc` 등)를 실행하지 않는다는 점이다. 환경 변수가 필요하면 `~/.vscode-server/server-env-setup` 스크립트에 둔다. `code` 명령이 안 보이면 윈도우 경로가 `PATH`에 붙는지(5편, 6편의 `appendWindowsPath`)부터 본다. JetBrains IDE 같은 다른 도구도 원격 개발 방식으로 같은 구조를 쓴다.

## 도커: 데스크톱 백엔드 대 WSL 안의 엔진
컨테이너가 무엇인지는 도커와 컨테이너 1편에서 다루고, 여기서는 WSL에서 엔진을 어디에 둘지만 본다.

| 항목 | 도커 데스크톱 | WSL 안 엔진 |
| --- | --- | --- |
| 엔진 위치 | 전용 배포판 | 내 배포판 |
| 윈도우에서 `docker` | 됨 | `wsl`을 거쳐서만 |
| 시작 | 데스크톱 앱 | systemd(8편) |
| 데이터 | 윈도우 AppData 아래 | 배포판 가상 디스크 |

도커 문서 기준으로 데스크톱은 WSL 2.1.5 이상이 필요하고, 설정의 Resources > WSL Integration에서 고른 배포판에 `docker` CLI를 연결해 준다. 엔진은 자기 배포판에서 돌고 다른 배포판과는 일반 WSL 배포판끼리처럼 격리된다. 문서는 데스크톱을 설치하기 전에 WSL 배포판 안에 직접 설치한 Docker Engine과 CLI를 지우라고 한다. 둘을 함께 돌리면 충돌할 수 있다. 비용도 고려 대상이다. 도커 데스크톱은 직원 250명 미만이고 연 매출 1천만 달러 미만인 소규모 기업, 개인, 교육, 비상업 오픈 소스에는 무료지만 그보다 큰 조직의 업무용에는 유료 구독이 필요하다. WSL 안에 엔진을 직접 설치하면 이 제약 없이 리눅스 서버와 같은 방식으로 운영하되, 업데이트·자동 시작·GUI는 직접 챙긴다.

어느 쪽이든 바인드 마운트할 소스는 리눅스 파일 시스템에 둔다. 도커 문서는 `/mnt/c`에서 마운트하면 느리고, 파일 변경 이벤트(inotify)가 원본이 리눅스 파일 시스템에 있을 때만 컨테이너에 전달된다고 설명한다(3편과 같은 이유, 볼륨은 도커와 컨테이너 7편). 2026년 문서에는 WSL 2.9.3 이상에 내장된 컨테이너 CLI `wslc.exe`도 소개되어 있다.

## GPU: 드라이버는 윈도우에만
WSL 2의 GPU 지원은 반가상화(para-virtualization)다. 리눅스는 GPU 장치를 직접 잡지 않고, 윈도우 드라이버가 제공하는 라이브러리를 통해 GPU를 쓴다. 그래서 설치 순서가 일반 리눅스와 반대다.
- 윈도우에 GPU 제조사의 최신 드라이버를 설치한다(문서상 윈도우 11 또는 윈도우 10 21H2 이상).
- 리눅스 쪽에는 GPU 드라이버를 설치하지 않는다. NVIDIA 문서는 윈도우의 CUDA 드라이버가 WSL 2 안에 `libcuda.so`로 연결(stub)되므로 리눅스용 NVIDIA 드라이버를 설치하면 안 된다고 하고, 드라이버를 덮어쓰지 않는 WSL-Ubuntu용 CUDA 툴킷을 따로 제공한다.
- 윈도우가 넣어 주는 라이브러리는 `/usr/lib/wsl/lib`에 있다. `wsl.conf`의 `[gpu] appendLibPath`가 이 폴더를 `PATH`에, `[automount] ldconfig`가 동적 링커 검색 경로에 넣는다.

```sh
ls /usr/lib/wsl/lib            # 윈도우 드라이버가 제공한 라이브러리
ldconfig -p | grep libcuda     # 링커가 찾는 libcuda가 위 폴더의 것인지
```
리눅스용 드라이버를 깔아 이 연결이 깨지는 것이 가장 흔한 사고다. 컨테이너에서 GPU를 쓰려면 문서의 예처럼 `docker run --gpus all …`을 쓰고, WSL 안 엔진이라면 NVIDIA Container Toolkit을 더한다. AMD·인텔 GPU는 DirectML 기반 TensorFlow·PyTorch 패키지로 쓸 수 있다. GPU가 여럿이면 한 번에 하나만 쓸 수 있고 `MESA_D3D12_DEFAULT_ADAPTER_NAME` 환경 변수로 고른다.

## WSLg: 리눅스 GUI 앱
WSLg는 X11과 Wayland 앱을 윈도우 창으로 띄운다. 윈도우 10 빌드 19044 이상 또는 윈도우 11의 WSL 2에서 동작한다. 구조는 이렇다. 배포판마다 짝지어진 "시스템 배포판"(Azure Linux 3.0 기반, 읽기 전용)에서 Wayland 컴포지터 Weston(XWayland 포함)과 PulseAudio가 돌고, Weston이 RDP로 각 앱의 화면만 윈도우의 `mstsc.exe`에 넘긴다(같은 기계 안이라 픽셀을 공유 메모리로 넘기는 VAIL 방식). 사용자 배포판에는 `DISPLAY`, `WAYLAND_DISPLAY`, `PULSE_SERVER` 환경 변수가 미리 설정되어 앱이 그 서버를 찾는다. 설치한 GUI 앱은 시작 메뉴에도 등록된다.
```sh
sudo apt install x11-apps -y && xeyes &    # 창이 뜨면 WSLg가 동작하는 것
```
GUI가 필요 없으면 `.wslconfig`의 `guiApplications=false`로 끈다. 렌더링 가속에도 위 GPU 드라이버가 쓰인다.

## dotfiles: 새 배포판을 몇 분 안에
배포판은 언제든 새로 만들 수 있다(2편의 `--import`, 10편의 복구). 그때마다 별칭·git 설정을 손으로 다시 하지 않으려면 설정 파일을 저장소(dotfiles)에 모으고 초기화 스크립트로 홈 폴더에 연결한다. 핵심은 몇 번을 돌려도 결과가 같은 멱등성(idempotency)과, 기존 파일을 지우지 않고 백업하는 것이다. WSL 판별은 1편처럼 커널 릴리스 문자열의 `microsoft`로 한다.
```bash
# 파일: dotfiles/bootstrap.sh
set -euo pipefail
DOT=$(cd "$(dirname "$0")" && pwd)

link() {  # link <dotfiles 안 파일> <홈 기준 경로>
  local src="$DOT/$1" dst="$HOME/$2"
  if [ "$(readlink "$dst" || true)" = "$src" ]; then
    echo "그대로  ~/$2"; return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mv "$dst" "$dst.bak"; echo "백업    ~/$2 -> ~/$2.bak"
  fi
  mkdir -p "$(dirname "$dst")" && ln -s "$src" "$dst"
  echo "연결    ~/$2"
}
link bash_aliases .bash_aliases
link gitignore .config/git/ignore
link editorconfig .editorconfig
git config --global init.defaultBranch main
git config --global pull.ff only

if grep -qi microsoft /proc/sys/kernel/osrelease; then
  echo "환경    WSL"
  if [ -d /usr/lib/wsl/lib ]; then echo "GPU     /usr/lib/wsl/lib 있음"; fi
  if [ -n "${WAYLAND_DISPLAY:-}" ]; then echo "WSLg    켜짐"; fi
  if command -v code >/dev/null; then
    git config --global core.editor "code --wait"
  fi
else
  echo "환경    WSL 아님: WSL 전용 단계는 건너뜀"
fi
```
연결할 파일 세 개를 만들고, 이미 손으로 만든 `.bash_aliases`가 있는 홈 폴더(실습용 임시 폴더)에서 두 번 돌린다.
```bash
printf "alias ll='ls -alF'\nalias gs='git status -s'\n" > dotfiles/bash_aliases
printf '.env\n__pycache__/\n' > dotfiles/gitignore
printf 'root = true\n\n[*]\nend_of_line = lf\n' > dotfiles/editorconfig
export HOME=$PWD/home && mkdir -p home       # 실습용 홈 폴더
echo "alias ll='ls -l'" > home/.bash_aliases  # 손으로 만든 기존 파일
bash dotfiles/bootstrap.sh; echo "---"; bash dotfiles/bootstrap.sh
```
```text
백업    ~/.bash_aliases -> ~/.bash_aliases.bak
연결    ~/.bash_aliases
연결    ~/.config/git/ignore
연결    ~/.editorconfig
환경    WSL 아님: WSL 전용 단계는 건너뜀
---
그대로  ~/.bash_aliases
그대로  ~/.config/git/ignore
그대로  ~/.editorconfig
환경    WSL 아님: WSL 전용 단계는 건너뜀
```
두 번째 실행은 아무것도 바꾸지 않았다. 결과도 확인한다.
```bash
readlink home/.editorconfig | sed "s#$PWD/##"
git config --global --list
```
```text
dotfiles/editorconfig
init.defaultbranch=main
pull.ff=only
```
홈의 파일은 저장소를 가리키는 심볼릭 링크라서 저장소를 고치면 바로 반영되고, 이력도 Git에 남는다. `~/.config/git/ignore`는 Git이 따로 설정하지 않아도 읽는 전역 무시 파일이고, `.editorconfig`의 `end_of_line = lf`는 4편의 줄바꿈 사고를 편집기 단계에서 막는다. 이 컨테이너는 WSL이 아니어서 WSL 전용 단계를 건너뛰었다. HTTPS 인증은 윈도우에 Git for Windows를 설치하면 함께 오는 Git Credential Manager가 WSL의 Git에서도 쓰이며 토큰을 윈도우 자격 증명 관리자에 저장한다고 공식 문서는 설명한다. 비밀 값(토큰, 키)은 dotfiles 저장소에 넣지 않는다.

## 흔한 실수와 문제 해결
- 리눅스 쪽에 GPU 드라이버 설치: `libcuda.so` 연결이 깨진다. 지우고 윈도우 드라이버만 둔다.
- 도커 데스크톱과 WSL 안 엔진을 함께 설치: 어느 `docker`가 어느 엔진에 붙는지 헷갈리고 충돌한다. 하나만 쓴다.
- `/mnt/c`의 프로젝트를 VS Code로 열기: 동작은 하지만 느리고 파일 감시가 빠진다(3편).
- GUI 앱이 안 뜸: 배포판이 WSL 1이거나(`wsl -l -v`) `guiApplications=false`다.

## 어디에 쓰이나
- 도커와 컨테이너 1편 「컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이」: 도커 데스크톱의 엔진도 결국 WSL 2 VM의 리눅스 커널 위에서 네임스페이스로 격리된 프로세스다.
- GPU와 CUDA 4편 「CUDA 프로그래밍 모델: 커널, 그리드, 블록, 스레드」: WSL에서 돌린 CUDA 프로그램도 같은 모델로 실행되고, 차이는 드라이버가 윈도우에 있다는 것뿐이다.
- Git 버전 관리 14편 「설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응」: dotfiles에 넣을 별칭과 `includeIf` 조건부 설정을 거기서 다룬다.

## 정리
- VS Code는 윈도우 UI와 리눅스의 VS Code 서버로 나뉘고, 코드를 다루는 확장은 배포판마다 설치한다.
- 도커는 데스크톱(전용 배포판, 큰 조직은 유료)과 WSL 안 엔진(systemd로 직접 운영) 중 하나만 고른다.
- GPU 드라이버는 윈도우에만 설치하고, 리눅스는 `/usr/lib/wsl/lib`로 그것을 쓴다. GUI는 WSLg가 RDP로 넘긴다.
- dotfiles 스크립트는 멱등하게, 백업하면서 연결하고, 비밀 값은 넣지 않는다.

## 더 알아보기
- 이전 글: 8편 「systemd와 백그라운드 서비스: WSL에서 데몬 운영하기」
- 다음 글: 10편 「문제 해결과 관리: 디스크 회수, 메모리, 흔한 오류」
- Get started using VS Code with WSL: https://learn.microsoft.com/windows/wsl/tutorials/wsl-vscode
