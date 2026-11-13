# [Terraform 인프라 코드 4/10] 변수, 출력, locals: 값을 바깥에서 받고 밖으로 내보내기

> **한 줄 요약** — 입력 변수(`variable`)는 같은 설정을 환경마다 다른 값으로 쓰게 해 주고 타입과 검증 규칙으로 잘못된 값을 막으며, `locals`는 설정 안에서 반복되는 계산에 이름을 붙이고, 출력(`output`)은 만든 결과를 사람이나 다른 설정, 스크립트에 내보낸다.

## 이 글에서 다루는 것
- 입력 변수: 타입, 기본값, 검증, 필수 변수
- 값을 넣는 방법과 우선순위: tfvars, 환경 변수, `-var`
- locals: 설정 안의 이름 붙은 계산
- 출력: `terraform output`, JSON, 민감한 값
- 직접 해 보기: 같은 설정으로 dev와 prod 만들기

## 왜 변수인가
2편까지는 값을 설정에 직접 적었다. 그런데 개발 환경과 운영 환경은 대부분 같고 몇 가지만 다르다. 서버 수, 이름 앞에 붙는 환경 이름, 담당자 같은 것이다. 설정을 복사해 고치면 둘이 조금씩 어긋난다. **입력 변수**로 다른 부분만 바깥에서 받으면 같은 설정을 환경마다 다시 쓸 수 있다. 함수에 매개변수가 있는 것과 같다. 출력은 그 함수의 반환값이고, locals는 함수 안의 지역 변수다.

## 입력 변수
변수는 `variable` 블록으로 선언하고 `var.이름`으로 쓴다.
```hcl
# 파일: variables.tf
variable "env" {
  type        = string
  description = "배포 환경"
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env는 dev, staging, prod 중 하나여야 한다."
  }
}

variable "replicas" {
  type    = number
  default = 1
}

variable "owner" {
  type = string                    # 기본값이 없으면 반드시 넣어야 한다
}
```
- `type`: `string`, `number`, `bool`과 `list(string)`, `map(number)`, `object({ ... })` 같은 묶음 타입이 있다. 타입이 맞지 않는 값은 계획 전에 거절된다.
- `default`: 값을 넣지 않았을 때 쓰는 값. 없으면 **필수** 변수다.
- `validation`: 조건을 어기면 `error_message`를 보여 주고 멈춘다.

## locals와 출력
`locals`는 여러 곳에서 쓰는 계산에 이름을 붙인다. 바깥에서 바꿀 수 없다는 점이 변수와 다르다. 여기서는 환경 이름으로 서비스 이름을 만들고, 설정 파일에 들어갈 내용을 한데 모은다.
```hcl
# 파일: main.tf
locals {
  name = "shop-${var.env}"
  settings = {
    name     = local.name
    replicas = var.replicas
    owner    = var.owner
  }
}

resource "random_password" "api_key" {
  length  = 20
  special = false
}

resource "local_file" "config" {
  filename = "${path.module}/${local.name}.json"
  content  = jsonencode(local.settings)
}
```
```hcl
# 파일: outputs.tf
output "config_file" {
  value = local_file.config.filename
}

output "settings" {
  value = local.settings
}

output "api_key" {
  value     = random_password.api_key.result
  sensitive = true
}
```

## 직접 해 보기: 필수 변수와 검증
`owner`를 넣지 않고 계획하면 어떻게 될까. `-input=false`는 값을 물어보지 말라는 뜻이다(CI처럼 사람이 없는 곳의 동작).
```bash
terraform init > /dev/null
terraform plan -no-color -input=false 2>&1 | grep -E '^Error|is not set'
terraform plan -no-color -var owner=minji -var env=qa 2>&1 | grep -E '^Error|is "qa"|env는'
```
```text
Error: No value for required variable
The root module input variable "owner" is not set, and has no default value.
Error: Invalid value for variable
    │ var.env is "qa"
env는 dev, staging, prod 중 하나여야 한다.
```
필수 변수가 빠지면 멈추고, 허용하지 않는 환경 이름은 검증 규칙이 막았다. 오타 하나로 엉뚱한 환경이 만들어지는 일을 계획 단계에서 막을 수 있다.

## 직접 해 보기: 출력 읽기
```bash
terraform apply -auto-approve -no-color -var owner=minji | sed -n '/^Outputs:/,$p'
cat shop-dev.json; echo
terraform output -raw config_file; echo
terraform output -json settings
echo "api_key 길이: $(terraform output -raw api_key | wc -c)"
```
```text
Outputs:

api_key = <sensitive>
config_file = "./shop-dev.json"
settings = {
  "name" = "shop-dev"
  "owner" = "minji"
  "replicas" = 1
}
{"name":"shop-dev","owner":"minji","replicas":1}
./shop-dev.json
{"name":"shop-dev","owner":"minji","replicas":1}
api_key 길이: 20
```
- 적용이 끝나면 출력이 한꺼번에 보인다. `sensitive = true`인 `api_key`는 `<sensitive>`로 가려졌다.
- `terraform output -raw`는 따옴표 없이 값만, `-json`은 JSON으로 내보낸다. 스크립트나 CI가 결과를 이어받을 때 쓴다.
- 그런데 이름을 콕 집어 `terraform output -raw api_key`로 물으면 **가리지 않고** 값을 준다. 일부러 꺼내 쓰라는 설계다. 그래서 CI 로그에 이 명령의 결과를 그대로 찍지 않도록 조심한다. 3편에서 본 것처럼 상태 파일에도 평문으로 들어 있다.

## 값을 넣는 방법과 우선순위
값은 여러 곳에서 들어올 수 있고, 나중 것이 앞의 것을 이긴다.
1. 변수의 `default`
2. 환경 변수 `TF_VAR_이름`
3. 작업 폴더의 `terraform.tfvars` (자동으로 읽는다)
4. `*.auto.tfvars` 파일들 (자동으로 읽는다)
5. 명령줄의 `-var-file`과 `-var` (적은 순서대로, 뒤가 이긴다)

환경 변수, 자동으로 읽는 파일, 명령줄을 차례로 겹쳐 본다.
```bash
echo 'owner = "sora"' > terraform.tfvars
printf 'env      = "prod"\nreplicas = 3\n' > prod.tfvars
export TF_VAR_replicas=2
terraform apply -auto-approve -no-color > /dev/null && terraform output -json settings
terraform apply -auto-approve -no-color -var-file=prod.tfvars > /dev/null && terraform output -json settings
terraform apply -auto-approve -no-color -var-file=prod.tfvars -var replicas=5 > /dev/null && terraform output -json settings
unset TF_VAR_replicas
```
```text
{"name":"shop-dev","owner":"sora","replicas":2}
{"name":"shop-prod","owner":"sora","replicas":3}
{"name":"shop-prod","owner":"sora","replicas":5}
```
- `owner`는 `terraform.tfvars`에서, `replicas`는 환경 변수에서 왔다.
- `prod.tfvars`를 주자 환경과 서버 수가 바뀌었고, 그 뒤에 적은 `-var replicas=5`가 다시 이겼다.

실무에서는 환경마다 `dev.tfvars`, `prod.tfvars`를 두고 CI가 맞는 파일을 넘기는 방식이 흔하다. 비밀번호 같은 비밀 값은 파일에 적어 커밋하지 않고, CI의 비밀 저장소에서 `TF_VAR_` 환경 변수로 넣는다. 다만 같은 상태로 dev와 prod를 번갈아 적용하면 위처럼 dev가 prod로 **바뀌어 버린다**. 환경마다 상태를 따로 두는 방법은 8편에서 본다.

## 흔한 오해
- "locals도 바깥에서 바꿀 수 있다": 설정 안의 계산일 뿐이다. 바깥에서 받을 값은 변수로 만든다.
- "sensitive면 어디서도 보이지 않는다": 계획과 적용의 화면에서만 가린다. 이름을 지정한 `terraform output`과 상태 파일에는 값이 있다.
- "변수가 많을수록 유연하다": 바꿀 일이 없는 값까지 변수로 빼면 읽기 어렵고 실수할 곳만 는다. 정말 환경마다 다른 것만 변수로 둔다.

## 어디에 쓰이나
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 값을 바깥에서 넣는 여러 길과 비밀 값의 위험이 같은 문제다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: CI의 비밀을 `TF_VAR_` 환경 변수로 넘길 때 로그에 새지 않게 하는 방법을 본다.
- Prometheus와 Grafana 모니터링 9편 「Grafana 대시보드: 데이터 소스, 패널, 변수, 프로비저닝」: 같은 대시보드를 변수로 환경마다 다시 쓰는 생각이 같다.

## 정리
- 입력 변수는 타입, 기본값, 검증 규칙을 가진다. 기본값이 없으면 필수다.
- 값은 기본값 < `TF_VAR_` < `terraform.tfvars` < `*.auto.tfvars` < 명령줄 순으로 이긴다.
- locals는 설정 안의 이름 붙은 계산이고, 출력은 결과를 사람과 스크립트에 내보낸다.
- `sensitive`는 화면을 가릴 뿐이다. 비밀 값의 실제 보호는 상태와 CI 비밀 관리에서 한다.

## 더 알아보기
- 이전 글: 3편 「상태 파일: Terraform이 기억하는 세상」
- 다음 글: 5편 「의존성과 그래프: 순서를 정하는 방법」
