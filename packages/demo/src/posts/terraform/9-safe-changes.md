# [Terraform 인프라 코드 9/10] 변경을 안전하게: lifecycle, moved, import, replace

> **한 줄 요약** — `lifecycle`은 교체 순서를 "새로 만들고 나서 지우기"로 바꾸거나 실수로 지우는 것을 막고, `moved`는 리소스 이름이나 위치를 바꿀 때 교체 대신 상태의 주소만 옮기며, `import`는 Terraform 밖에서 만든 객체를 상태로 들여오고, `removed`는 지우지 않고 관리에서만 빼며, `-replace`는 멀쩡해 보이는 리소스를 일부러 다시 만든다.

## 이 글에서 다루는 것
- 교체의 순서: `create_before_destroy`
- 지우기 막기: `prevent_destroy`, 그 밖의 `lifecycle` 설정
- 일부러 다시 만들기: `-replace`
- 이름 바꾸기: `moved` 블록
- 들여오기와 내보내기: `import` 블록, `removed` 블록

## 위험한 변경은 계획에 보인다
운영 중인 인프라에서 사고가 나는 변경은 대개 계획에 이미 드러나 있다. 2편의 `-/+`(교체)와 `-`(지우기)다. 이 글의 도구들은 그 줄이 생기지 않게 하거나, 생겨도 피해가 없게 하거나, 아예 실행되지 않게 막는다.

## 교체의 순서: create_before_destroy
교체는 기본적으로 **지우고 나서 만든다**. 서버라면 그 사이에 서비스가 멈춘다. `create_before_destroy`를 켜면 순서가 뒤집혀 **새것을 만든 뒤 옛것을 지운다**. 같은 리소스 둘을 만들어 비교한다. 둘 다 `release`가 바뀌면 교체된다.
```hcl
# 파일: main.tf
variable "release" {
  type    = string
  default = "v1"
}

resource "terraform_data" "plain" {
  triggers_replace = var.release
}

resource "terraform_data" "safe" {
  triggers_replace = var.release
  lifecycle {
    create_before_destroy = true
  }
}
```
```bash
terraform init > /dev/null
terraform apply -auto-approve -no-color > /dev/null
terraform plan -no-color -var release=v2 | grep -E '^[-+/]+ resource'
terraform apply -auto-approve -no-color -var release=v2 > apply.log
for r in plain safe; do      # 리소스마다 만들기와 지우기가 시작된 순서
  echo "$r: $(grep "terraform_data.$r" apply.log | grep -oE 'Creating|Destroying' \
    | sed 's/Creating/만들기/; s/Destroying/지우기/' | paste -sd' ')"
done
export TF_VAR_release=v2              # 이제부터는 v2를 기본으로 쓴다
```
```text
-/+ resource "terraform_data" "plain" {
+/- resource "terraform_data" "safe" {
plain: 지우기 만들기
safe: 만들기 지우기
```
계획의 기호부터 다르다. `-/+`는 지우고 만들기, `+/-`는 만들고 지우기다. 적용 기록에서 본 실제 순서도 그대로였다. `safe`의 옛것은 새것이 만들어지는 동안 "물러난 객체"(deposed object)로 상태에 남아 있다가 지워진다. 새것과 옛것이 잠깐 함께 있어야 하므로, 이름이 겹치면 안 되는 리소스(고정된 이름의 버킷 등)는 이름에 임의의 값을 붙여야 쓸 수 있다.

## 지우기 막기와 그 밖의 lifecycle
데이터베이스처럼 지워지면 끝인 리소스에는 `prevent_destroy`를 건다. 이 리소스를 지우는 계획이 나오면 실행 전에 오류로 멈춘다.
```bash
cat > db.tf <<'EOF'
resource "random_password" "db" {
  length = 16
  lifecycle {
    prevent_destroy = true
  }
}
EOF
terraform init > /dev/null                # 새 프로바이더(random)를 쓰므로 다시 init
terraform apply -auto-approve -no-color > /dev/null
terraform destroy -auto-approve -no-color 2>&1 | grep -E '^Error|has lifecycle.prevent_destroy'
```
```text
Error: Instance cannot be destroyed
Resource random_password.db has lifecycle.prevent_destroy set, but the plan
```
`destroy`만이 아니라 교체로 지워지는 경우도 막는다. 다만 설정에서 리소스 블록째 지우면 이 설정도 함께 사라지므로 막지 못한다. 그 밖의 설정은 이렇다.
- `ignore_changes = [tags]`: 그 속성이 바깥에서 바뀌어도 되돌리지 않는다. 다른 시스템이 관리하는 태그나, 오토스케일러가 바꾸는 서버 수에 쓴다.
- `replace_triggered_by = [terraform_data.config]`: 다른 리소스가 바뀌면 이 리소스를 교체한다. 설정이 바뀌면 서버를 새로 띄우고 싶을 때 쓴다.
- `precondition`·`postcondition`: 적용 전후에 조건을 검사해 어기면 멈춘다(10편의 `check`와 비교).

## 일부러 다시 만들기: -replace
설정은 그대로인데 리소스가 망가졌다면(서버 안이 꼬였다든지) 그것만 새로 만들고 싶다. `-replace`가 그 일을 한다. 예전의 `terraform taint`를 대신한다.
```bash
terraform plan -no-color -replace=terraform_data.plain | grep -E '^  # |^Plan:'
```
```text
  # terraform_data.plain will be replaced, as requested
Plan: 1 to add, 0 to change, 1 to destroy.
```

## 이름 바꾸기: moved
`plain`이라는 이름이 마음에 들지 않아 `web`으로 바꾸고 싶다. 이름만 바꾸면 Terraform은 "plain은 설정에서 사라졌으니 지우고, web은 새로 생겼으니 만든다"고 계획한다. 이름을 바꾸는 것뿐인데 교체가 일어나는 것이다. `moved` 블록으로 "같은 것인데 주소만 바뀌었다"고 알려 준다.
```bash
sed -i 's/resource "terraform_data" "plain"/resource "terraform_data" "web"/' main.tf
terraform plan -no-color | grep -E '^  # |^Plan:'
cat >> main.tf <<'EOF'

moved {
  from = terraform_data.plain
  to   = terraform_data.web
}
EOF
terraform plan -no-color | grep -E '^  # |^Plan:'
terraform apply -auto-approve -no-color > /dev/null && terraform state list | grep web
```
```text
  # terraform_data.plain will be destroyed
  # (because terraform_data.plain is not in configuration)
  # terraform_data.web will be created
Plan: 1 to add, 0 to change, 1 to destroy.
  # terraform_data.plain has moved to terraform_data.web
Plan: 0 to add, 0 to change, 0 to destroy.
terraform_data.web
```
`moved`가 있으면 아무것도 만들거나 지우지 않고 상태의 주소만 옮긴다. 6편의 `count`를 `for_each`로 바꿀 때(`from = local_file.x[0]`, `to = local_file.x["minji"]`), 7편의 리소스를 모듈 안으로 옮길 때(`to = module.site.local_file.x`)도 같은 방법을 쓴다. `moved` 블록은 모든 사람과 환경의 상태가 옮겨진 뒤에 지워도 된다. 공유 모듈이라면 오래 남겨 둔다.

## 들여오기: import
콘솔에서 손으로 만든 리소스를 Terraform으로 관리하고 싶다면, 다시 만들지 말고 **들여온다**. `import` 블록에 들여올 주소와 실제 객체의 ID를 적는다. 여기서는 이미 발급된 테넌트 ID를 `random_uuid`로 들여온다(클라우드라면 서버 ID, 버킷 이름 같은 것이 ID다). `-generate-config-out`을 주면 그 객체에 맞는 리소스 블록도 만들어 준다.
```bash
cat > import.tf <<'EOF'
import {
  to = random_uuid.tenant
  id = "2f0be6c2-8d7a-4a51-9b3e-6c1d2f4a8e90"
}
EOF
terraform plan -no-color -generate-config-out=generated.tf | grep -E '^  # |^Plan:'
grep -v '^#' generated.tf
terraform apply -auto-approve -no-color | grep '^Apply'
terraform state show -no-color random_uuid.tenant | grep result
```
```text
  # random_uuid.tenant will be imported
  # (config will be generated)
Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.

resource "random_uuid" "tenant" {
  keepers = null
}
Apply complete! Resources: 1 imported, 0 added, 0 changed, 0 destroyed.
    result = "2f0be6c2-8d7a-4a51-9b3e-6c1d2f4a8e90"
```
- 계획에 "가져오기 1"이 나오고, 만들기는 0이다. 적용하자 기존 ID가 그대로 상태에 들어왔다.
- 생성된 설정은 출발점일 뿐이다. 읽기 좋게 다듬어 `main.tf`로 옮기고, 들여온 뒤 계획이 "바꿀 것 없음"이 되는지 확인한다. 설정이 실제와 다르면 다음 적용 때 실제가 설정대로 바뀐다.
- 들여오기를 지원하지 않는 리소스도 있다(이 시리즈의 `local_file`이 그렇다). 프로바이더 문서의 Import 항목을 먼저 본다.

## 내보내기: removed
반대로 리소스를 **지우지 않고** Terraform의 관리에서만 빼고 싶을 때가 있다. 다른 팀의 설정으로 넘기거나, 수동 관리로 돌릴 때다. 리소스 블록을 지우고 `removed` 블록을 둔다.
```bash
cat > db.tf <<'EOF'
removed {
  from = random_password.db
  lifecycle {
    destroy = false
  }
}
EOF
terraform plan -no-color | grep -E '^ # |^Plan:'
```
```text
 # random_password.db will no longer be managed by Terraform, but will not be destroyed
 # (destroy = false is set in the configuration)
Plan: 0 to add, 0 to change, 0 to destroy.
```
`prevent_destroy`가 걸려 있던 리소스인데도 지우지 않으므로 막히지 않았다. 적용하면 상태에서만 빠진다. 예전의 `terraform state rm`을 계획과 리뷰를 거치는 방식으로 바꾼 것이다. `import`, `moved`, `removed` 블록은 모두 설정에 남으므로 풀 리퀘스트로 리뷰할 수 있다는 것이 명령 방식(`terraform import`, `state mv`, `state rm`)보다 나은 점이다.

## 흔한 오해
- "`prevent_destroy`면 절대 지워지지 않는다": 설정에서 리소스 블록을 지우면 보호도 함께 사라진다. 콘솔에서 지우는 것도 막지 못한다. 클라우드 쪽의 삭제 보호 기능과 함께 쓴다.
- "이름 바꾸기는 무해하다": `moved` 없이 바꾸면 교체다. 계획에서 `destroyed`와 `created`가 같은 종류로 짝지어 나오면 이름 변경을 의심한다.
- "import하면 설정도 자동으로 맞춰진다": 상태만 들어온다. 설정은 직접(또는 생성된 것을 다듬어) 맞춰야 한다.

## 어디에 쓰이나
- Git 버전 관리 8편 「되돌리기: restore, reset, revert, reflog」: 기록을 남기며 되돌리는 방법과 기록을 바꾸는 방법의 차이가, 블록 방식과 명령 방식의 차이와 닮았다.
- Nginx 웹 서버 10편 「로그와 문제 해결: 접근 로그, 오류 로그, 502와 504」: 새 설정을 검사한 뒤 무중단으로 바꾸는 습관을 웹 서버 쪽에서 본다.
- 도커와 컨테이너 3편 「컨테이너 생명 주기: run, exec, logs, stop과 시그널」: 새 컨테이너를 띄운 뒤 옛것을 내리는 순서가 `create_before_destroy`와 같다.

## 정리
- 교체는 기본이 "지우고 만들기"다. `create_before_destroy`로 "만들고 지우기"(`+/-`)로 바꾼다.
- `prevent_destroy`는 지우는 계획을 막는다. `ignore_changes`, `replace_triggered_by`로 변경의 범위를 조절한다.
- `-replace`는 일부러 다시 만들고, `moved`는 교체 없이 주소만 옮긴다.
- `import` 블록은 밖에서 만든 것을 들여오고, `removed` 블록은 지우지 않고 관리에서 뺀다. 모두 설정에 남아 리뷰할 수 있다.

## 더 알아보기
- 이전 글: 8편 「원격 상태와 잠금: 여럿이 같은 인프라를 다룰 때」
- 다음 글: 10편 「팀으로 쓰기: CI의 plan, 테스트, 드리프트 감지」
