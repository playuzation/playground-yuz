# [Terraform 인프라 코드 8/10] 원격 상태와 잠금: 여럿이 같은 인프라를 다룰 때

> **한 줄 요약** — 여러 사람과 CI가 같은 인프라를 다루려면 상태 파일을 각자의 컴퓨터가 아니라 공유 저장소(백엔드)에 두고, 적용하는 동안 상태를 잠가 두 사람이 동시에 쓰지 못하게 해야 하며, 환경이나 팀마다 상태를 나눈 뒤 필요한 값만 `terraform_remote_state`나 데이터 소스로 읽어 온다.

## 이 글에서 다루는 것
- 로컬 상태의 한계: 각자의 상태, 동시 적용
- 백엔드가 하는 두 가지 일: 상태 저장과 잠금
- 직접 해 보기: 작은 상태 서버로 두 사람이 상태 나누기, 잠금에 막히기
- 상태 나누기: 환경별 폴더, 워크스페이스, `terraform_remote_state`
- 실무의 백엔드: S3, GCS, Azure, HCP Terraform

## 로컬 상태의 한계
지금까지 상태는 작업 폴더의 `terraform.tfstate`였다. 혼자서는 괜찮지만, 팀에서는 곧 문제가 된다.
- **각자의 상태**: 민지가 서버를 만들면 상태는 민지의 컴퓨터에만 있다. 소라가 같은 설정으로 계획하면 상태가 없으니 서버를 또 만들려 한다(3편의 "상태를 잃어버리면"과 같다).
- **동시 적용**: 상태를 Git으로 나눈다고 해도, 두 사람이 동시에 적용하면 서로의 변경을 덮어쓴다. 상태에는 비밀 값도 들어 있어 Git에 넣으면 안 된다(3편).

해결책은 상태를 **백엔드**(backend)라는 공유 저장소에 두는 것이다. 백엔드가 하는 일은 둘이다.
1. **상태 저장**: 모두가 같은 상태를 읽고 쓴다.
2. **잠금**(locking): 상태를 바꾸는 명령(`apply`, `destroy` 등)이 도는 동안 다른 사람이 상태를 쓰지 못하게 막는다.

## 직접 해 보기: 작은 상태 서버
Terraform의 `http` 백엔드는 HTTP로 상태를 읽고(GET) 쓰고(POST), `LOCK`·`UNLOCK` 요청으로 잠근다. 이 규칙대로 상태를 메모리에 들고 있는 서버를 30줄로 만들어, 백엔드가 하는 일을 눈으로 본다. 실무에서는 이 자리에 S3 같은 저장소가 온다.
```python
# 파일: state_server.py
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

states, locks = {}, {}            # 경로마다 상태 하나, 잠금 하나

class Handler(BaseHTTPRequestHandler):
    def key(self):
        return urlsplit(self.path).path
    def body(self):
        return self.rfile.read(int(self.headers.get('Content-Length', 0)))
    def reply(self, code, data=b''):
        self.send_response(code)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):              # 상태 읽기. 없으면 404
        if self.key() in states: self.reply(200, states[self.key()])
        else: self.reply(404)
    def do_POST(self):             # 상태 쓰기
        states[self.key()] = self.body(); self.reply(200)
    def do_LOCK(self):             # 이미 잠겨 있으면 423과 함께 잠근 사람의 정보를 돌려준다
        if self.key() in locks: self.reply(423, locks[self.key()])
        else: locks[self.key()] = self.body(); self.reply(200)
    def do_UNLOCK(self):
        locks.pop(self.key(), None); self.reply(200)
    def log_message(self, fmt, *args):
        print(self.command, flush=True)

ThreadingHTTPServer(('127.0.0.1', 8500), Handler).serve_forever()
```
민지(`minji`)와 소라(`sora`)가 같은 설정을 각자의 폴더에서 쓴다. 설정의 `backend` 블록이 상태를 어디에 둘지 정한다. 리소스는 `release`가 바뀌면 교체되고, 만들어질 때 `wait`초 동안 걸리는 작업을 흉내 낸다.
```hcl
# 파일: minji/main.tf
terraform {
  backend "http" {
    address        = "http://127.0.0.1:8500/state/shop"
    lock_address   = "http://127.0.0.1:8500/state/shop"
    unlock_address = "http://127.0.0.1:8500/state/shop"
  }
}

variable "release" {
  type    = string
  default = "v1"
}

variable "wait" {
  type    = number
  default = 0
}

resource "terraform_data" "server" {
  triggers_replace = var.release
  provisioner "local-exec" {
    command = "sleep ${var.wait}"
  }
}
```
```bash
python3 state_server.py > server.log 2>&1 &
until curl -s -o /dev/null 127.0.0.1:8500/; do sleep 0.2; done
mkdir sora && cp minji/main.tf sora/
for who in minji sora; do (cd $who && terraform init -no-color > /dev/null); done
n=$(wc -l < server.log)                  # 지금까지의 요청 수
(cd minji && terraform apply -auto-approve -no-color | tail -1)
echo "민지의 적용이 보낸 요청: $(tail -n +$((n + 1)) server.log | uniq | paste -sd' ')"
(cd sora && terraform plan -no-color | grep 'No changes')
ls minji sora
```
```text
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
민지의 적용이 보낸 요청: GET LOCK GET POST UNLOCK
No changes. Your infrastructure matches the configuration.
minji:
main.tf

sora:
main.tf
```
- 민지의 적용은 상태를 읽고(GET), 잠그고(LOCK), 다시 읽은 뒤, 새 상태를 쓰고(POST), 잠금을 풀었다(UNLOCK).
- 소라는 민지가 만든 서버를 알고 있다. 같은 백엔드에서 상태를 읽었기 때문이다. 두 폴더 모두에 `terraform.tfstate` 파일이 없다.

## 잠금에 막히기
민지가 시간이 오래 걸리는 적용(6초)을 하는 사이에 소라도 적용을 시도한다.
```bash
(cd minji && terraform apply -auto-approve -no-color -var release=v2 -var wait=6 > ../minji.log 2>&1 &)
sleep 3
(cd sora && terraform apply -auto-approve -no-color -var release=v2 2>&1 | grep -E '^Error:|Operation:|Who:')
(cd sora && terraform plan -no-color -lock-timeout=30s -var release=v2 | grep 'No changes')
tail -1 minji.log
```
```text
Error: Error acquiring the state lock
  Operation: OperationTypeApply
  Who:       …
No changes. Your infrastructure matches the configuration.
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
```
- 소라의 적용은 상태를 잠그지 못해 **아무것도 하지 않고** 멈췄다. 오류에는 누가(`Who`), 무슨 일(`Operation`)로 잠갔는지가 나온다.
- `-lock-timeout=30s`를 주면 잠금이 풀릴 때까지 기다린다. 민지의 적용이 끝난 뒤 소라의 계획은 민지가 바꾼 상태(`v2`)를 보고 "바꿀 것 없음"이라고 했다. CI에서는 보통 이렇게 기다리게 한다.

적용 도중 프로세스가 죽으면 잠금이 남을 수 있다. 그때는 아무도 적용 중이 아닌지 확인한 뒤 오류에 나온 잠금 ID로 `terraform force-unlock <ID>`를 쓴다. 잠금을 끄는 `-lock=false`는 쓰지 않는다. 로컬 상태도 적용하는 동안 파일을 잠근다(`.terraform.tfstate.lock.info`). 다만 한 컴퓨터 안에서만 통한다.

## 상태 나누기
상태 하나에 모든 것을 넣으면 계획이 느려지고, 작은 변경에도 모든 리소스가 위험해지며, 권한을 나눌 수 없다. 그래서 상태를 나눈다.
- **환경별**: dev와 prod는 상태를 따로 둔다. 4편 끝에서 본 "dev가 prod로 바뀌는" 사고를 막는다. 환경마다 폴더(`envs/dev`, `envs/prod`)를 두고 같은 모듈(7편)을 부르는 방식이 흔하다.
- **수명과 담당별**: 잘 바뀌지 않는 네트워크, 자주 바뀌는 앱을 나누고, 담당 팀마다 나눈다.

나눈 상태 사이에서 값을 넘길 때는 `terraform_remote_state` 데이터 소스로 다른 상태의 **출력**을 읽는다. 네트워크 상태가 내보낸 서브넷 이름을 앱 쪽이 읽어 본다.
```bash
mkdir network app
cat > network/main.tf <<'EOF'
terraform {
  backend "http" {
    address = "http://127.0.0.1:8500/state/network"
  }
}
output "subnet" {
  value = "subnet-private-a"
}
EOF
cat > app/main.tf <<'EOF'
data "terraform_remote_state" "network" {
  backend = "http"
  config  = { address = "http://127.0.0.1:8500/state/network" }
}
output "app_subnet" {
  value = data.terraform_remote_state.network.outputs.subnet
}
EOF
(cd network && terraform init -no-color > /dev/null && terraform apply -auto-approve -no-color | grep '^Apply')
(cd app && terraform init -no-color > /dev/null && terraform apply -auto-approve -no-color > /dev/null && terraform output app_subnet)
kill %1; wait %1 2>/dev/null || true   # 상태 서버를 끈다
```
```text
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
"subnet-private-a"
```
네트워크 쪽은 잠금 주소를 적지 않았다. `http` 백엔드에서 잠금은 주소를 줄 때만 쓰인다. `terraform_remote_state`는 편하지만, 읽는 쪽이 상대 상태 **전체**(비밀 값 포함)를 읽을 권한이 있어야 한다. 그래서 공유할 값만 따로 저장소(클라우드의 파라미터 저장소 등)에 써 두고 데이터 소스로 읽거나, 클라우드 리소스를 이름과 태그로 직접 찾는 방법도 많이 쓴다.

## 워크스페이스
같은 설정 폴더에서 상태를 여럿 두는 **워크스페이스**도 있다. `terraform workspace new prod`로 만들고 `select`로 바꾸며, 설정 안에서는 `terraform.workspace`로 지금 이름을 안다(`http` 백엔드는 워크스페이스를 지원하지 않아 로컬 백엔드로 본다).
```bash
mkdir ws && cd ws
echo 'output "env" { value = terraform.workspace }' > main.tf
terraform init -no-color > /dev/null
terraform workspace new prod -no-color > /dev/null
terraform apply -auto-approve -no-color > /dev/null && terraform output env
terraform workspace list
ls terraform.tfstate.d
cd ..
```
```text
"prod"
  default
* prod

prod
```
워크스페이스는 설정이 완전히 같고 상태만 다른 경우(같은 실험 환경 여러 벌)에 알맞다. 환경마다 설정이 조금씩 다르고 권한도 나눠야 한다면 폴더를 나누는 편이 명확하다. 지금 어느 워크스페이스인지 착각해 prod에 적용하는 사고도 흔하다.

## 실무의 백엔드
- **S3**(AWS): 버킷에 상태를 두고, 버킷의 버전 관리와 암호화를 켠다. 잠금은 예전에는 DynamoDB 테이블을 썼고, 최근 버전은 S3 자체의 잠금 파일(`use_lockfile = true`)을 쓴다.
- **GCS**(Google Cloud), **azurerm**(Azure Blob Storage): 저장과 잠금을 함께 제공한다.
- **HCP Terraform**(옛 Terraform Cloud)과 비슷한 서비스들: 상태 저장, 잠금에 더해 원격 실행, 권한, 기록을 함께 준다.
- 백엔드 설정에는 변수를 쓸 수 없다. 환경마다 다른 값은 `terraform init -backend-config=...`으로 넣는다.
- 로컬 상태를 원격으로 옮길 때는 `backend` 블록을 추가하고 `terraform init -migrate-state`를 한다.

## 흔한 오해
- "상태를 Git에 넣으면 공유가 된다": 동시 적용을 막지 못하고 비밀 값이 저장소에 남는다.
- "잠금이 걸리면 `-lock=false`로 풀면 된다": 두 적용이 같은 상태를 덮어써 리소스를 잃을 수 있다. 정말 아무도 적용 중이 아닐 때만 `force-unlock`한다.
- "워크스페이스가 곧 환경 분리다": 같은 설정과 같은 백엔드 권한을 공유한다. 운영 환경의 권한을 따로 막으려면 상태를 다른 곳에 둔다.

## 어디에 쓰이나
- Redis 실무 5편 「원자적 연산과 레이트 리밋: INCR, 트랜잭션, Lua」: "이미 있으면 실패"로 잠그는 방법(`SET NX`)이 백엔드 잠금과 같은 생각이다.
- Git 버전 관리 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」: 각자의 사본과 공유 원격 저장소의 관계를, 잠금 대신 병합으로 푸는 Git의 방식과 비교해 본다.
- 웹 앱의 원리 9편 「HTTP 요청과 응답 해부: 메서드, 상태 코드, 헤더」: 상태 서버가 쓴 GET, POST와 직접 만든 LOCK 메서드, 423 상태 코드를 HTTP 쪽에서 본다.

## 정리
- 팀에서는 상태를 백엔드에 둔다. 백엔드는 상태를 저장하고, 적용하는 동안 잠근다.
- 잠금에 막히면 기다리거나(`-lock-timeout`), 정말 남은 잠금일 때만 `force-unlock`한다.
- 상태는 환경과 담당별로 나누고, 필요한 값만 출력과 `terraform_remote_state`나 데이터 소스로 넘긴다.
- 실무에서는 S3, GCS, Azure, HCP Terraform 같은 백엔드를 버전 관리와 암호화와 함께 쓴다.

## 더 알아보기
- 이전 글: 7편 「모듈: 묶어서 다시 쓰기」
- 다음 글: 9편 「변경을 안전하게: lifecycle, moved, import, replace」
