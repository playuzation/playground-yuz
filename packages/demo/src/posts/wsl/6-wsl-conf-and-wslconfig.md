# [WSL 개발 환경 6/10] wsl.conf와 .wslconfig: 배포판 설정과 가상 머신 설정

> **한 줄 요약** — 배포판 안의 `/etc/wsl.conf`는 그 배포판이 시작하는 방식을, 윈도우 사용자 폴더의 `.wslconfig`는 모든 배포판이 함께 쓰는 WSL 2 가상 머신을 정하고, 둘 다 시작할 때 한 번 읽히므로 고친 뒤에는 완전히 멈췄다 켜야 하며, 오타는 작은 검사 스크립트로 미리 잡는다.

## 이 글에서 다루는 것
- 두 설정 파일의 범위: 배포판 하나 대 가상 머신 하나
- wsl.conf의 섹션과 DrvFs 권한 마스크(`metadata`, `umask`, `fmask`) 계산
- .wslconfig의 메모리·CPU·네트워크·실험 기능 항목
- 설정이 적용되는 시점: 8초 규칙과 `wsl --shutdown`
- 파이썬 `configparser`로 만든 설정 검사기

## 두 파일, 두 층
1편에서 본 것처럼 WSL 2의 배포판들은 경량 가상 머신(VM) 하나 위에서 커널 하나를 나눠 쓴다. 설정도 이 구조를 따라 두 층으로 나뉜다.

| 구분 | wsl.conf | .wslconfig |
| --- | --- | --- |
| 위치 | 배포판의 `/etc` | 윈도우 사용자 폴더 |
| 범위 | 그 배포판 하나 | 모든 WSL 2 배포판 |
| 대상 | WSL 1과 WSL 2 | WSL 2만(VM 설정) |
| 다시 읽는 때 | 배포판 재시작 | VM 재시작 |

둘 다 INI 형식(`[섹션]` 아래 `키=값`)이고 기본으로는 파일이 없다. 문서는 파일이 없거나 형식이 깨져도 WSL이 설정 없이 그냥 뜬다고 하고, 최근 WSL 소스의 `Unknown key` 같은 경고도 시작할 때 한 줄 지나가고 만다. 틀린 줄은 조용히 "효과 없음"으로 남는다.

## wsl.conf: 배포판이 시작할 때 읽는 파일
자주 쓰는 항목을 모은 예다(배포판 안에서 `sudo`로 편집한다).
```ini
# 파일: good/wsl.conf
[boot]
systemd=true

[automount]
options = "metadata,umask=22,fmask=111"

[network]
hostname = devbox

[user]
default = dev
```
- `[boot]`: `systemd=true`는 systemd를 PID 1로 띄우고(8편), `command`는 시작할 때 root로 실행할 명령이다. 문서상 윈도우 11과 Server 2022에서만 쓸 수 있다.
- `[automount]`: `enabled`(기본 true)는 고정 드라이브를 DrvFs로 자동 마운트, `root`는 마운트 위치(기본 `/mnt/`), `mountFsTab`은 `/etc/fstab` 처리, `options`는 DrvFs 마운트 옵션이다.
- `[network]`: `generateHosts`, `generateResolvConf`(기본 true)는 `/etc/hosts`, `/etc/resolv.conf` 자동 생성 여부다(DNS는 10편). `hostname`의 기본값은 윈도우 컴퓨터 이름이다.
- `[interop]`: `enabled`는 윈도우 프로그램 실행, `appendWindowsPath`는 윈도우 경로를 `PATH`에 붙일지 정한다(5편).
- `[user]`의 `default`는 시작 사용자다. `[gpu]`(9편)와 `[time]`의 `useWindowsTimezone`(기본 true)도 있다.

### metadata와 권한 마스크
4편에서 본 대로 `/mnt/c`의 파일은 기본적으로 윈도우 권한을 rwx로 옮겨 보여 줄 뿐이라 `chmod`가 거의 듣지 않는다. `options`에 `metadata`를 넣으면 WSL이 NTFS 확장 특성(`$LXUID`, `$LXGID`, `$LXMOD`, `$LXDEV`)에 리눅스 소유자와 권한을 저장한다. 문서에 따르면 `umask`(파일·폴더), `fmask`(파일), `dmask`(폴더)도 metadata로 마운트했을 때 적용되고, 마스크들은 OR로 합쳐진 뒤 권한에서 빠진다. 문서의 예(`umask=023`과 `fmask=022` → 파일 마스크 023)와 위 예시의 조합을 계산해 보자.
```python
import stat

def show(umask, fmask=0, dmask=0):
    f = 0o777 & ~(umask | fmask)          # 파일: umask OR fmask를 뺀다
    d = 0o777 & ~(umask | dmask)          # 폴더: umask OR dmask를 뺀다
    print(f"umask={umask:03o} fmask={fmask:03o} 파일 마스크 {umask | fmask:03o}",
          stat.filemode(0o100000 | f), stat.filemode(0o040000 | d))

show(0o23, 0o22)     # 문서의 예
show(0o22)           # 기본값 umask=022
show(0o22, 0o111)    # 파일에서 실행 비트까지 뺀다
```
```text
umask=023 fmask=022 파일 마스크 023 -rwxr-xr-- drwxr-xr--
umask=022 fmask=000 파일 마스크 022 -rwxr-xr-x drwxr-xr-x
umask=022 fmask=111 파일 마스크 133 -rw-r--r-- drwxr-xr-x
```
첫 줄이 문서의 023과 맞는다. `fmask=111`을 더하면 윈도우 쪽 파일이 모두 실행 파일로 보이던 문제가 사라지고 폴더는 그대로 들어갈 수 있다. 마스크는 8진수라서 8이나 9가 들어가면 안 된다.

## .wslconfig: VM 하나를 정하는 파일
`.wslconfig`는 윈도우 쪽 파일이다. 공식 문서는 직접 편집보다 시작 메뉴의 WSL Settings 앱을 권한다.
```ini
# 파일: good/.wslconfig
[wsl2]
memory=8GB
processors=4
swap=0

[general]
instanceIdleTimeout=60000

[experimental]
autoMemoryReclaim=gradual
sparseVhd=true
```
`memory`, `processors`는 VM에 줄 메모리와 논리 프로세서 수, `swap`은 스왑 크기(0이면 없음)다. 크기는 단위가 없으면 바이트이고 `8GB`, `512MB`처럼 쓴다. `localhostForwarding`, `networkingMode`, `dnsTunneling`은 7편, 유휴 시간은 8편, `[experimental]`의 메모리 회수와 희소 VHD는 10편에서 다룬다. `kernel` 같은 경로 값은 `C:\\temp\\myCustomKernel`처럼 백슬래시를 두 번 쓴다. 일부 키는 윈도우 11 전용이고, `networkingMode`, `dnsTunneling` 등은 윈도우 11 22H2 이상이 필요하다.

## 언제 적용되나: 8초 규칙
설정은 시작할 때만 읽힌다. 터미널을 닫아도 배포판이 바로 멈추지 않으므로, 문서는 모든 셸을 닫고 약 8초 기다린 뒤 다시 열라고 한다. 확인하고 끄는 편이 확실하다.
```powershell
wsl --list --running     # "There are no running distributions."면 다 멈춘 것
wsl --terminate Ubuntu   # wsl.conf만 바꿨다면 그 배포판만 끈다
wsl --shutdown           # .wslconfig를 바꿨다면 VM까지 끈다(모든 배포판 정지)
```
다시 켠 뒤 WSL 안에서 반영 여부를 본다(WSL에서만 의미 있는 명령).
```sh
nproc; free -h            # processors, memory
mount | grep ' /mnt/c '   # metadata, umask 옵션
ps -p 1 -o comm=          # systemd를 켰다면 systemd
```

## 설정 검사기 만들기
틀린 설정은 오류 없이 지나가므로 미리 검사한다. 표준 라이브러리 `configparser`로 읽고, 문서 표에서 옮긴 키(일부)와 비교한다. 공식 예시에도 `localhostforwarding`처럼 소문자 키가 섞여 있어 대소문자는 구분하지 않는다.
```python
# 파일: wslcheck.py
import configparser, difflib, re, sys
B, SIZE, PATH = "bool", "size", "path"
SCHEMA = {
    "wsl.conf": {"boot": {"systemd": B, "command": str},
                 "automount": {"enabled": B, "options": "drvfs"},
                 "network": {"generateResolvConf": B, "hostname": str},
                 "user": {"default": str}},
    ".wslconfig": {"wsl2": {"memory": SIZE, "processors": int, "swap": SIZE,
                            "kernel": PATH, "localhostForwarding": B,
                            "networkingMode": ["nat", "mirrored", "none"]},
                   "general": {"instanceIdleTimeout": int},
                   "experimental": {"sparseVhd": B, "autoMemoryReclaim":
                                    ["gradual", "dropCache", "disabled"]}}}
RULES = {B: (r"true|false", "true나 false가 아님"),
         int: (r"-?\d+", "정수가 아님"),
         SIZE: (r"\d+([KMGT]?B)?", "크기 형식이 아님(예: 8GB)"),
         PATH: (r"([^\\]|\\\\)*", "백슬래시는 두 번 써야 함")}

def bad(kind, v):
    if isinstance(kind, list):
        ok = v.lower() in map(str.lower, kind)
        return None if ok else "허용 값이 아님: " + "/".join(kind)
    if kind == "drvfs":
        m = re.search(r'(\w+mask)=([0-7]*[^0-7,"]\w*)', v)
        return m and f"{m[1]}={m[2]}는 8진수가 아님"
    pat, msg = RULES.get(kind, (".*", ""))
    return None if re.fullmatch(pat, v, re.I) else msg

def check(path):
    name = path.rsplit("/", 1)[-1]
    schema, n, where, sec = SCHEMA[name], 0, {}, None
    for no, line in enumerate(open(path, encoding="utf-8"), 1):
        if m := re.match(r"\[(.+)\]", line): sec = m[1]
        elif m := re.match(r"(\w+)\s*=", line):
            where[sec, m[1].lower()] = f"{no} [{sec}] {m[1]}"
    cp = configparser.ConfigParser(interpolation=None)
    cp.read(path, encoding="utf-8")
    for sec in cp.sections():
        if sec not in schema:
            n += 1; print(f"{name}: [{sec}] 이 파일의 섹션이 아님"); continue
        keys = {k.lower(): k for k in schema[sec]}
        for key, v in cp.items(sec):
            home = [s for s in schema if key in map(str.lower, schema[s])]
            near = difflib.get_close_matches(key, keys, 1)
            if key not in keys:
                msg = "알 수 없는 키" + (f" → [{home[0]}]에 둘 키" if home
                                    else f" → {keys[near[0]]}?" if near else "")
            elif re.search(r"\s[#;]", v):
                msg = f"값 뒤에 주석이 붙음 {v!r}"
            else:
                msg = bad(schema[sec][keys[key]], v)
            if msg: n += 1; print(f"{name}:{where[sec, key]}: {msg}")
    print(f"{name}: 문제 {n}건" if n else f"{name}: 문제 없음")

for p in sys.argv[1:]: check(p)
```
흔한 실수 여덟 가지를 넣은 두 파일이다. 마지막 `networkingMode`는 실험 기능 시절의 블로그 글처럼 `[experimental]`에 둔 것이다(지금 문서에서는 `[wsl2]` 항목).
```ini
# 파일: bad/wsl.conf
[boot]
sytemd=true

[automount]
options = "metadata,umask=22,fmask=118"

[network]
generateResolvConf = no

[wsl2]
memory = 8GB
```
```ini
# 파일: bad/.wslconfig
[wsl2]
memory = 8 GB
kernel = C:\wsl\vmlinux
localhostForwarding = true  # 미러 모드에서는 무시

[experimental]
networkingMode = mirrored
```
```bash
python3 wslcheck.py good/wsl.conf good/.wslconfig \
                    bad/wsl.conf bad/.wslconfig
```
```text
wsl.conf: 문제 없음
.wslconfig: 문제 없음
wsl.conf:3 [boot] sytemd: 알 수 없는 키 → systemd?
wsl.conf:6 [automount] options: fmask=118는 8진수가 아님
wsl.conf:9 [network] generateResolvConf: true나 false가 아님
wsl.conf: [wsl2] 이 파일의 섹션이 아님
wsl.conf: 문제 4건
.wslconfig:3 [wsl2] memory: 크기 형식이 아님(예: 8GB)
.wslconfig:4 [wsl2] kernel: 백슬래시는 두 번 써야 함
.wslconfig:5 [wsl2] localhostForwarding: 값 뒤에 주석이 붙음 'true  # 미러 모드에서는 무시'
.wslconfig:8 [experimental] networkingMode: 알 수 없는 키 → [wsl2]에 둘 키
.wslconfig: 문제 4건
```
여덟 가지를 모두 줄 번호와 함께 잡았다. 값 뒤의 주석은 `configparser`도 기본 설정에서는 값의 일부로 읽고, WSL 파서의 처리는 문서에 없으니 주석은 따로 한 줄에 쓴다. 검사기는 문서의 키 일부만 담은 예시라서 쓰는 버전에 맞게 표를 채운다.

그 밖에 메모장으로 저장해 생기는 `.wslconfig.txt`(확장자 숨김 탓에 눈치채기 어렵다), 배포판 안에 만든 `.wslconfig`도 흔하다. 설정 파일은 dotfiles 저장소(9편)에 넣어 이력을 남기고, 바꾸기 전에 검사기를 돌린다.

## 숫자로 보기
| 항목 | 기본값(문서) |
| --- | --- |
| `memory` | 윈도우 메모리의 50% |
| `processors` | 윈도우의 논리 프로세서 수 |
| `swap` | 메모리의 25%(GB 단위 올림) |
| 적용 대기 | 셸을 모두 닫고 약 8초 |
| .wslconfig 지원 | 윈도우 빌드 19041 이상 |

## 어디에 쓰이나
- 이산수학 2편 「명제 논리와 불 대수: 참과 거짓의 계산」: 마스크를 OR로 합친 뒤 AND NOT으로 빼는 계산이 비트 단위 불 대수 그대로다.
- 4편 「윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자」: `/mnt/c`에서 실행 비트가 이상하게 보이던 문제를 `metadata`와 `fmask`로 푼다.
- 도커와 컨테이너 12편 「리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그」: `memory`, `processors`는 VM 전체의 한도이고, 그 안의 컨테이너 한도는 따로 건다.

## 정리
- wsl.conf는 배포판마다(`/etc/wsl.conf`), .wslconfig는 VM 전체(`%UserProfile%\.wslconfig`)를 정한다.
- `metadata`를 켜야 `/mnt/c`에 리눅스 권한이 저장되고, 마스크는 OR로 합쳐져 권한을 뺀다.
- 설정은 시작할 때만 읽히므로 `wsl --terminate`나 `wsl --shutdown`으로 완전히 멈춘 뒤 다시 켠다.
- 틀린 설정은 조용히 무시되기 쉬우므로 검사기로 키·값·섹션을 확인한다.

## 더 알아보기
- 이전 글: 5편 「상호 운용: 리눅스에서 윈도우 프로그램을, 윈도우에서 리눅스 명령을」
- 다음 글: 7편 「네트워크: NAT와 미러 모드, localhost 포워딩, 포트 열기」
- Advanced settings configuration in WSL: https://learn.microsoft.com/windows/wsl/wsl-config
