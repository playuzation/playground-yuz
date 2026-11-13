# [Terraform 인프라 코드 10/10] 팀으로 쓰기: CI의 plan, 테스트, 드리프트 감지

> **한 줄 요약** — 팀에서는 인프라 변경을 풀 리퀘스트로 올리면 CI가 포맷·검증·테스트를 돌리고 계획을 남겨 사람이 리뷰하며, 병합된 뒤에만 정해진 곳에서 적용하고, 계획의 종료 코드와 JSON으로 위험한 변경을 자동으로 걸러 내며, 정기적으로 계획을 돌려 코드 밖에서 바뀐 것(드리프트)을 찾아낸다.

## 이 글에서 다루는 것
- 인프라 변경의 흐름: 풀 리퀘스트, 계획 리뷰, 병합 뒤 적용
- CI가 돌리는 검사: `fmt -check`, `validate`, `terraform test`
- 기계가 읽는 계획: `-detailed-exitcode`와 `show -json`
- `check` 블록: 멈추지 않는 경고
- 드리프트 감지와 팀의 규칙

## 인프라 변경의 흐름
1~9편의 명령을 사람이 각자의 컴퓨터에서 실행하면, 누가 무엇을 적용했는지 남지 않고 자격 증명도 여기저기 흩어진다. 그래서 팀에서는 보통 이렇게 한다.
1. 설정을 바꾼 브랜치로 **풀 리퀘스트**를 연다.
2. CI가 포맷·검증·테스트를 돌리고, `terraform plan` 결과를 풀 리퀘스트에 남긴다.
3. 리뷰어는 코드와 함께 **계획**을 읽는다. 코드 한 줄이 교체 열 개를 낳을 수 있으므로, 계획이 리뷰의 중심이다.
4. 병합되면 CI가 **같은 설정으로** 적용한다. 운영 환경은 승인 단계를 하나 더 둔다.

적용은 CI만 한다. 사람에게는 운영 환경을 바꿀 권한을 주지 않고, CI는 장기 키 대신 클라우드의 OIDC 연동으로 그때그때 짧은 자격 증명을 받는다.

## 직접 해 보기: 검사할 설정
환경에 따라 복제본 수를 정하고 설정 파일을 만드는 작은 설정이다. 운영 환경이 아니면 복제본이 1개라 배포 중에 멈출 수 있다는 것을 `check` 블록으로 알린다.
```hcl
# 파일: main.tf
variable "env" {
  type = string
  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env는 dev나 prod여야 한다."
  }
}

locals {
  replicas = var.env == "prod" ? 3 : 1
}

resource "local_file" "config" {
  filename = "${path.module}/${var.env}.conf"
  content  = "replicas = ${local.replicas}\n"
}

output "replicas" {
  value = local.replicas
}

check "zero_downtime" {
  assert {
    condition     = local.replicas >= 2
    error_message = "복제본이 ${local.replicas}개라 배포 중에 서비스가 멈출 수 있다."
  }
}
```

## terraform test
`terraform test`는 `tests/` 폴더의 `.tftest.hcl` 파일을 읽어, `run` 블록마다 변수를 주고 계획(또는 적용)한 뒤 `assert`로 결과를 검사한다. 계획만 하는 테스트는 실제로 아무것도 만들지 않아 빠르다. 실패해야 하는 경우는 `expect_failures`로 적는다. 테스트 안에서는 `check` 블록의 경고도 실패로 세므로, dev처럼 경고가 나오는 것이 맞는 경우에도 `expect_failures`에 적는다.
```hcl
# 파일: tests/config.tftest.hcl
run "dev_has_one_replica" {
  command         = plan
  expect_failures = [check.zero_downtime] # dev에서는 이 경고가 나와야 맞다
  variables {
    env = "dev"
  }
  assert {
    condition     = output.replicas == 1
    error_message = "dev는 복제본이 1개여야 한다."
  }
}

run "prod_has_three_replicas" {
  command = plan
  variables {
    env = "prod"
  }
  assert {
    condition     = local_file.config.content == "replicas = 3\n"
    error_message = "prod 설정 파일에 복제본 3이 들어가야 한다."
  }
}

run "rejects_unknown_env" {
  command = plan
  variables {
    env = "qa"
  }
  expect_failures = [var.env] # 검증 규칙이 막아야 통과
}
```
CI가 풀 리퀘스트마다 돌리는 검사를 차례로 실행한다.
```bash
terraform init > /dev/null
terraform fmt -check -recursive; echo "fmt 종료 코드: $?"
terraform validate -no-color
terraform test -no-color
```
```text
fmt 종료 코드: 0
Success! The configuration is valid.

tests/config.tftest.hcl... in progress
  run "dev_has_one_replica"... pass
  run "prod_has_three_replicas"... pass
  run "rejects_unknown_env"... pass
tests/config.tftest.hcl... tearing down
tests/config.tftest.hcl... pass

Success! 3 passed, 0 failed.
```
`fmt -check`는 고치지 않고 검사만 한다. 모양이 표준과 다른 파일이 있으면 그 이름을 출력하고 0이 아닌 코드로 끝나 CI를 실패시킨다. 모듈(7편)을 여러 팀이 쓴다면 이런 테스트가 모듈의 약속을 지킨다.

## 기계가 읽는 계획
CI가 계획을 사람에게만 보여 주면, 바쁜 날에는 아무도 읽지 않는다. 계획을 기계가 읽어 판단하게 하는 두 도구가 있다.
- `plan -detailed-exitcode`: 종료 코드가 0이면 바꿀 것 없음, 1이면 오류, 2면 바꿀 것 있음이다.
- `terraform show -json 계획파일`: 계획을 JSON으로 내보낸다. 리소스마다 할 일(`create`, `update`, `delete`)이 들어 있어, "지우는 것이 있으면 사람의 승인을 따로 받는다" 같은 규칙을 걸 수 있다.
```bash
terraform plan -no-color -detailed-exitcode -var env=dev -out=tfplan > /dev/null; echo "계획 종료 코드: $?"
terraform show -json tfplan | jq -c '[.resource_changes[] | {address, actions: .change.actions}]'
deletes=$(terraform show -json tfplan | jq '[.resource_changes[] | select(.change.actions | index("delete"))] | length')
echo "지우는 리소스: $deletes개"
terraform apply -no-color tfplan 2>&1 | grep -E '^Warning|멈출 수|^Apply'
terraform plan -no-color -detailed-exitcode -var env=dev > /dev/null; echo "적용 뒤 계획 종료 코드: $?"
```
```text
계획 종료 코드: 2
[{"address":"local_file.config","actions":["create"]}]
지우는 리소스: 0개
Warning: Check block assertion failed
복제본이 1개라 배포 중에 서비스가 멈출 수 있다.
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
적용 뒤 계획 종료 코드: 0
```
- 처음 계획은 만들 것이 있어 2로 끝났고, 적용한 뒤에는 0이 되었다.
- 교체는 JSON에서 `["delete", "create"]`(또는 `create_before_destroy`면 그 반대)로 나오므로, 같은 규칙에 걸린다.
- `check` 블록은 조건을 어겨도 **경고**만 하고 적용을 멈추지 않는다. 4편의 `validation`이나 9편의 `precondition`이 "잘못된 것은 막는다"라면, `check`는 "알고는 있어라"다. 서비스의 상태 확인 주소가 응답하는지 같은 운영 점검에도 쓴다.

정책을 더 많이 걸고 싶다면 계획 JSON을 OPA(conftest) 같은 정책 도구로 검사하거나, HCP Terraform의 Sentinel 같은 기능을 쓴다. "공개 버킷 금지", "운영 환경의 데이터베이스는 지울 수 없음", "태그에 담당 팀 필수" 같은 규칙을 코드로 둔다.

## 드리프트 감지
누군가 콘솔에서 고친 것(3편의 드리프트)은 다음 적용 때 조용히 되돌려지거나, 적용을 놀라게 한다. 그래서 정해진 시간마다 CI가 계획만 돌려, 바꿀 것이 생겼는지 본다. 코드는 그대로인데 계획이 2로 끝나면 바깥에서 무언가 바뀐 것이다.
```bash
echo "replicas = 9" > dev.conf          # 누군가 서버에서 손으로 고쳤다
terraform plan -no-color -detailed-exitcode -var env=dev > /dev/null; echo "드리프트 점검 종료 코드: $?"
terraform plan -no-color -refresh-only -var env=dev | grep -E '^  # '
```
```text
드리프트 점검 종료 코드: 2
  # local_file.config has been deleted
```
점검이 2를 내면 알림을 보내고, 사람이 판단한다. 바깥의 변경이 맞다면 코드를 고치고, 틀렸다면 적용해 되돌린다.

## GitHub Actions로 옮기면
위의 검사를 풀 리퀘스트와 `main` 병합, 정기 점검에 거는 워크플로의 뼈대다.
```yaml
name: terraform
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 0 * * *"            # 매일 한 번 드리프트 점검
concurrency: terraform-prod          # 같은 상태에 동시 실행 금지
permissions:
  id-token: write                    # 클라우드 OIDC 자격 증명
  contents: read
  pull-requests: write
jobs:
  plan:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -input=false
      - run: terraform fmt -check -recursive
      - run: terraform validate
      - run: terraform test
      - run: terraform plan -input=false -detailed-exitcode -out=tfplan || [ $? -eq 2 ]   # 2(바꿀 것 있음)는 성공으로 본다
  apply:
    if: github.event_name == 'push'
    needs: plan
    environment: production          # 승인한 사람이 있어야 실행
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -input=false
      - run: terraform apply -input=false -auto-approve
```
실제로는 계획을 풀 리퀘스트 댓글로 남기는 단계, 계획 파일을 아티팩트로 넘겨 리뷰한 계획 그대로 적용하는 단계를 더한다. 이런 흐름을 묶어 제공하는 도구(Atlantis, HCP Terraform 등)도 있다.

## 팀의 규칙
- **코드로 관리하는 리소스는 콘솔에서 고치지 않는다.** 급할 때 고쳤다면 바로 코드에 반영한다.
- **상태는 작게 나눈다**(8편). 계획이 빨라지고, 실수의 범위와 권한도 나뉜다.
- **버전을 고정한다.** Terraform(`required_version`), 프로바이더(잠금 파일, 2편), 모듈(태그, 7편)을 고정하고 올릴 때는 일부러 올린다.
- **계획을 읽는다.** 교체(`-/+`)와 지우기(`-`)는 이유를 확인하고, 이름 바꾸기는 `moved`로 한다(9편).

## 흔한 오해
- "CI에서 apply까지 자동이면 위험하다": 사람이 각자 적용하는 쪽이 더 위험하다. 자동화하되, 리뷰한 계획만, 승인 뒤에, 한 번에 하나씩 적용하게 만든다.
- "테스트는 실제로 만들어 봐야 의미가 있다": 계획만 하는 테스트로 논리(조건, 이름 규칙, 검증)를 빠르게 잡고, 실제로 만드는 테스트는 별도 계정에서 가끔 돌린다.
- "드리프트는 다음 적용 때 알아서 고쳐진다": 고쳐지는 게 아니라 되돌려진다. 그 바깥 변경이 장애 대응이었다면 다시 장애가 난다.

## 어디에 쓰이나
- GitHub 협업과 자동화 5편 「브랜치 보호와 규칙 세트: main을 지키는 장치」: 검사가 통과하고 리뷰를 받아야 병합되게 하는 장치가 인프라 변경 흐름의 바탕이다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: CI가 장기 키 없이 클라우드 자격 증명을 받는 OIDC를 자세히 본다.
- Prometheus와 Grafana 모니터링 8편 「기록 규칙과 경보: 규칙 파일과 Alertmanager」: 드리프트 점검 결과를 경보로 보내는 쪽을 본다.

## 정리
- 인프라 변경은 풀 리퀘스트 → CI 검사와 계획 → 리뷰 → 병합 뒤 CI 적용으로 흐른다. 계획이 리뷰의 중심이다.
- CI는 `fmt -check`, `validate`, `terraform test`를 돌린다. 계획만 하는 테스트는 빠르다.
- `plan -detailed-exitcode`와 `show -json`으로 기계가 계획을 판단하게 하고, `check` 블록은 멈추지 않는 경고를 낸다.
- 정기적인 계획으로 드리프트를 찾고, 버전 고정과 작은 상태, 콘솔 수정 금지를 팀의 규칙으로 둔다.

## 더 알아보기
- 이전 글: 9편 「변경을 안전하게: lifecycle, moved, import, replace」
- 처음 글: 1편 「인프라를 코드로: Terraform이란」
