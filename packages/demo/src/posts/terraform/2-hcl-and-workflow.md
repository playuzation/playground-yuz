# [Terraform 인프라 코드 2/10] HCL과 첫 리소스: init, plan, apply, destroy

> **한 줄 요약** — Terraform 설정은 블록과 인자로 이루어진 HCL로 쓰고, `init`이 프로바이더를 받아 버전을 잠그며, `plan`이 만들기(+)·고치기(~)·교체(-/+)·지우기(-)를 보여 주고, 저장한 계획을 `apply`로 그대로 실행한 뒤, 필요 없어지면 `destroy`로 모두 지운다.

## 이 글에서 다루는 것
- HCL의 생김새: 블록, 인자, 표현식
- `terraform` 블록과 프로바이더 버전 잠금
- 기본 흐름: init, fmt, validate, plan, apply, destroy
- 계획의 기호 읽기
- 직접 해 보기: 리소스 셋을 만들고, 고치고, 지우기

## HCL의 생김새
HCL(HashiCorp Configuration Language)은 사람이 읽기 좋게 만든 설정 언어다. 두 가지만 알면 대부분을 읽을 수 있다.
- **블록**: `종류 "라벨" "라벨" { ... }`. `resource "local_file" "inventory" { }`는 "local_file 종류의 리소스, 이름은 inventory"라는 뜻이다. 종류와 이름을 이은 `local_file.inventory`가 이 리소스의 주소다.
- **인자**: 블록 안의 `이름 = 표현식`. 표현식에는 문자열, 숫자, 불리언, 리스트(`["a", "b"]`), 맵(`{ name = "web" }`), 다른 리소스의 속성 참조, 함수 호출이 올 수 있다.

표현식은 `terraform console`로 바로 계산해 볼 수 있다. 문자열 안의 `${ }`는 값을 끼워 넣는 템플릿이다.
```bash
ev() { echo "$1" | terraform console; }
ev 'upper("seoul")'
ev 'join(", ", ["web", "db"])'
ev '{ name = "web", port = 8080 }.port'
ev '"서버 ${1 + 2}대"'
ev 'jsonencode([for n in [1, 2, 3] : n * 10])'
ev 'true ? "yes" : "no"'
```
```text
"SEOUL"
"web, db"
8080
"서버 3대"
"[10,20,30]"
"yes"
```
함수는 Terraform에 들어 있는 것만 쓸 수 있다(직접 정의할 수 없다). `for` 표현식과 조건식은 6편에서 다시 쓴다.

## 설정 쓰기
이름을 임의로 지어 주는 `random_pet`, 그 이름을 적은 파일 `local_file`, 그리고 Terraform에 들어 있는 값 보관용 리소스 `terraform_data`를 만든다. 맨 위의 `terraform` 블록은 이 설정이 요구하는 Terraform 버전과 프로바이더의 출처·버전을 적는다.
```hcl
# 파일: main.tf
terraform {
  required_version = ">= 1.6"
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.9" }
    local  = { source = "hashicorp/local", version = "~> 2.9" }
  }
}

resource "random_pet" "server" {
  length = 2
}

resource "local_file" "inventory" {
  filename = "${path.module}/inventory.txt"
  content  = "server: ${random_pet.server.id}\n"
}

resource "terraform_data" "note" {
  input = "v1"
}
```
`~> 3.9`는 "3.9 이상, 4.0 미만"이라는 뜻이다. 큰 버전이 바뀌면 설정이 깨질 수 있으므로 위쪽을 막아 둔다. `local_file.inventory`의 내용은 `random_pet.server.id`를 참조한다. 이 참조 때문에 Terraform은 이름을 먼저 만들고 파일을 나중에 만든다(5편).

## init: 준비와 잠금
```bash
terraform init -no-color > init.log
grep '^- Installed' init.log | sort        # 받는 순서는 매번 달라 정렬한다
grep 'success' init.log
grep -E '^provider|  version' .terraform.lock.hcl
```
```text
- Installed hashicorp/local v2.9.1 (…)
- Installed hashicorp/random v3.9.1 (…)
Terraform has been successfully initialized!
provider "registry.terraform.io/hashicorp/local" {
  version     = "2.9.1"
provider "registry.terraform.io/hashicorp/random" {
  version     = "3.9.1"
```
`init`은 조건에 맞는 프로바이더를 받아 숨은 폴더 `.terraform`에 넣고, 고른 버전과 파일 해시를 **잠금 파일** `.terraform.lock.hcl`에 적는다. 잠금 파일은 Git에 넣는다. 그래야 팀원과 CI가 모두 같은 프로바이더 버전을 쓴다. 버전을 올릴 때는 `terraform init -upgrade`로 일부러 바꾼다.

## fmt와 validate
`terraform fmt`는 들여쓰기와 `=` 정렬을 표준 모양으로 고치고, 고친 파일 이름을 출력한다. `terraform validate`는 문법과 참조가 맞는지 검사한다. 실제 시스템에 묻지 않으므로 빠르다.
```bash
printf 'resource "terraform_data" "tmp" {\ninput="x"\n    triggers_replace = [1]\n}\n' > messy.tf
terraform fmt
cat messy.tf
printf 'resource "terraform_data" "bad" {\n  input = terraform_data.missing.id\n}\n' > bad.tf
terraform validate -no-color
rm messy.tf bad.tf
```
```text
messy.tf
resource "terraform_data" "tmp" {
  input            = "x"
  triggers_replace = [1]
}

Error: Reference to undeclared resource

  on bad.tf line 2, in resource "terraform_data" "bad":
   2:   input = terraform_data.missing.id

A managed resource "terraform_data" "missing" has not been declared in the
root module.
```
없는 리소스를 참조하자 적용해 보기 전에 오류가 났다. 폴더 안의 모든 `.tf` 파일은 하나의 설정으로 합쳐지므로 파일을 어떻게 나눌지는 자유다(보통 `main.tf`, `variables.tf`, `outputs.tf`).

## plan과 apply
`plan -out`으로 계획을 파일에 저장하고, 그 파일을 `apply`에 넘기면 **본 계획 그대로만** 실행된다. 계획을 본 사이에 설정이나 실제가 바뀌어도 다른 일을 하지 않는다.
```bash
terraform plan -no-color -out=tfplan | grep -E '^  # |^Plan:|^Saved'
terraform apply -no-color tfplan | tail -1
cat inventory.txt
```
```text
  # local_file.inventory will be created
  # random_pet.server will be created
  # terraform_data.note will be created
Plan: 3 to add, 0 to change, 0 to destroy.
Saved the plan to: tfplan
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.
server: …
```
지어진 이름은 실행할 때마다 달라 가렸다. 이제 `terraform_data.note`의 값을 바꿔 계획 전체를 본다.
```bash
sed -i 's/"v1"/"v2"/' main.tf
terraform plan -no-color | sed -n '/^  # /,/^Plan/p'
```
```text
  # terraform_data.note will be updated in-place
  ~ resource "terraform_data" "note" {
        id     = "…"
      ~ input  = "v1" -> "v2"
      ~ output = "v1" -> (known after apply)
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```
계획의 기호는 넷이다.
- `+` 만들기, `-` 지우기.
- `~` 제자리에서 고치기(update in-place). 리소스는 그대로이고 속성만 바뀐다.
- `-/+` 교체. 지우고 다시 만든다. 계획에 `forces replacement`라는 표시로 어떤 속성 때문인지 알려 준다(1편의 파일 내용 변경이 그 예다).

`(known after apply)`는 적용해 봐야 알 수 있는 값이다. 클라우드 서버의 IP 주소처럼 만들어진 뒤에야 정해지는 값이 여기에 해당한다.

## destroy
연습용 환경이나 끝난 실험은 `destroy`로 모두 지운다. 설정에 있는 리소스 중 상태에 기록된 것을 전부 지우는 계획을 세우고 실행한다.
```bash
terraform destroy -auto-approve -no-color | tail -1
ls inventory.txt 2>&1 | sed 's/.*: //'
```
```text
Destroy complete! Resources: 3 destroyed.
No such file or directory
```
설정 파일에서 리소스 블록을 지우고 `apply`해도 그 리소스는 지워진다. "설정에 없는 것은 없어야 한다"는 것이 선언형의 뜻이기 때문이다. 그래서 블록 하나를 지우는 변경도 계획을 확인해야 한다.

## 흔한 오해
- "`plan`이 깨끗하면 `apply`도 성공한다": 계획은 예측이다. 권한, 할당량, 이름 충돌 같은 문제는 실제로 만들 때 드러날 수 있다.
- "잠금 파일은 자동으로 생기니 Git에 넣지 않아도 된다": 넣지 않으면 사람마다 다른 프로바이더 버전을 받아 계획이 달라질 수 있다.
- "`validate`가 통과하면 클라우드 설정도 맞다": 문법과 참조만 본다. 존재하지 않는 서버 이미지 ID 같은 것은 `plan`이나 `apply`에서야 드러난다.

## 어디에 쓰이나
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: 원하는 모습을 파일로 적고 `up`·`down`으로 맞추는 흐름이 `apply`·`destroy`와 닮았다.
- Git 버전 관리 2편 「커밋의 기본: 작업 트리, 스테이징 영역, 저장소」: `.tf` 파일과 잠금 파일은 커밋하고, `.terraform` 폴더와 계획 파일은 커밋하지 않는다.
- Nginx 웹 서버 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」: 블록과 지시어로 된 설정, 적용 전 문법 검사(`nginx -t`)가 HCL과 `validate`에 해당한다.

## 정리
- HCL은 블록과 인자로 이루어지고, 리소스는 `종류.이름`으로 가리킨다. `terraform console`로 표현식을 시험한다.
- `init`은 프로바이더를 받고 잠금 파일에 버전을 고정한다. 잠금 파일은 커밋한다.
- `fmt`와 `validate`로 빠르게 다듬고 검사한 뒤, `plan -out`으로 저장한 계획을 `apply`한다.
- 계획의 `+`, `~`, `-/+`, `-`를 읽는 것이 Terraform을 안전하게 쓰는 첫걸음이다.

## 더 알아보기
- 이전 글: 1편 「인프라를 코드로: Terraform이란」
- 다음 글: 3편 「상태 파일: Terraform이 기억하는 세상」
