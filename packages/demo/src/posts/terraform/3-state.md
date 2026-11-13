# [Terraform 인프라 코드 3/10] 상태 파일: Terraform이 기억하는 세상

> **한 줄 요약** — Terraform은 설정의 리소스 주소와 실제로 만든 객체의 ID·속성을 상태 파일에 기록해 두고, 계획할 때마다 이 기록으로 실제를 다시 읽어 설정과 비교하므로, 상태를 잃으면 이미 있는 것을 또 만들려 하고, 상태에는 비밀번호 같은 값이 평문으로 들어 있어 소스 코드보다 조심해서 다뤄야 한다.

## 이 글에서 다루는 것
- 상태가 왜 필요한가: 설정의 이름과 실제 객체 잇기
- 상태 파일 안: 버전, serial, lineage, 리소스
- 새로 읽기(refresh)와 드리프트, `-refresh-only`
- 직접 해 보기: 상태 들여다보기, 바깥에서 바꾸기, 상태 잃어버리기
- 상태를 다루는 규칙

## 상태가 왜 필요한가
설정에는 `local_file.config`나 `aws_instance.web` 같은 **주소**만 있다. 실제 세계의 객체에는 파일 경로, 서버 ID(`i-0abc…`) 같은 **식별자**가 있다. 둘을 잇는 기록이 없으면 Terraform은 "설정의 web 서버가 실제의 어느 서버인가"를 알 수 없다. 클라우드 계정의 모든 서버를 뒤져 이름으로 짐작할 수도 없다. 같은 이름의 서버가 여럿일 수 있고, Terraform이 만들지 않은 것도 있기 때문이다.

그래서 Terraform은 적용할 때마다 만든 객체의 ID와 속성을 **상태**(state)에 적는다. 다음 계획에서는 이렇게 한다.
1. 상태에 적힌 ID로 실제 객체를 다시 읽는다(**refresh**).
2. 다시 읽은 실제 모습과 설정을 비교한다.
3. 차이를 없앨 계획을 세운다.

## 직접 해 보기: 상태 들여다보기
데이터베이스 비밀번호를 임의로 만드는 `random_password`와 설정 파일을 만든다.
```hcl
# 파일: main.tf
resource "random_password" "db" {
  length  = 16
  special = false
}

resource "local_file" "config" {
  filename = "${path.module}/app.conf"
  content  = "db_user = app\n"
}
```
```bash
terraform init > /dev/null
terraform apply -auto-approve -no-color | tail -1
terraform state list
jq '{version, terraform_version, serial, lineage}' terraform.tfstate
```
```text
Apply complete! Resources: 2 added, 0 changed, 0 destroyed.
local_file.config
random_password.db
{
  "version": 4,
  "terraform_version": "1.17.2",
  "serial": …,
  "lineage": "…"
}
```
상태는 작업 폴더의 `terraform.tfstate`라는 JSON 파일이다(8편에서 원격으로 옮긴다).
- `version`은 상태 파일 형식의 버전, `terraform_version`은 마지막으로 쓴 Terraform 버전이다.
- `serial`은 상태가 바뀔 때마다 커지는 번호, `lineage`는 이 상태가 처음 만들어질 때 정해지는 고유 ID다. 둘은 낡은 상태나 엉뚱한 상태로 덮어쓰는 사고를 막는 데 쓰인다.

리소스 하나의 기록은 `terraform state show`로 본다. 비밀번호는 화면에 `(sensitive value)`로 가려진다. 그런데 상태 파일 자체를 읽으면 어떨까.
```bash
terraform state show -no-color random_password.db | grep result
jq -r '.resources[] | select(.type == "random_password") | .instances[0].attributes.result | length' terraform.tfstate
```
```text
    result      = (sensitive value)
16
```
화면에서는 가렸지만, 상태 파일에는 16글자 비밀번호가 **평문으로** 들어 있다. 상태 파일을 읽을 수 있는 사람은 비밀번호도 읽을 수 있다. 그래서 상태 파일은 Git에 넣지 않고, 접근이 통제되고 암호화된 저장소에 둔다(8편).

## 바깥에서 바꾸면: 드리프트
누군가 서버에 들어가 설정 파일을 손으로 고쳤다고 하자. `plan -refresh-only`는 설정과의 비교 없이, 상태의 기록과 실제가 어떻게 달라졌는지만 보여 준다.
```bash
echo 'db_user = admin' > app.conf
terraform plan -refresh-only -no-color | grep -E '^Note: Objects|^  # '
terraform plan -no-color | grep -E '^  # |^Plan:'
terraform apply -auto-approve -no-color | tail -1
cat app.conf
```
```text
Note: Objects have changed outside of Terraform
  # local_file.config has been deleted
  # local_file.config will be created
Plan: 1 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
db_user = app
```
- `local_file` 프로바이더는 내용이 기록과 다르면 "그 파일은 사라졌다"고 보고한다(파일의 ID가 내용의 해시이기 때문이다). 클라우드 리소스라면 보통 "이 속성이 바뀌었다"로 나온다.
- 일반 계획은 설정과 비교해 원래 내용으로 다시 만들었다. 손으로 고친 내용은 사라졌다. 코드로 관리하는 리소스를 바깥에서 고치면 다음 적용 때 되돌려진다.
- 바깥의 변경을 받아들이려면 설정을 고치거나, 실제를 기준으로 상태만 갱신하는 `terraform apply -refresh-only`를 쓴다.

## 상태가 바뀌는 모습
설정을 바꿔 적용하면 상태가 새로 쓰이고, 바로 전 상태는 `terraform.tfstate.backup`으로 남는다.
```bash
before=$(jq .serial terraform.tfstate)
sed -i 's/db_user = app\\n/db_user = app\\nport = 5432\\n/' main.tf
terraform apply -auto-approve -no-color | tail -1
echo "serial이 커졌다: $(( $(jq .serial terraform.tfstate) > before ))"
echo "백업의 serial은 바꾸기 전 값: $(( $(jq .serial terraform.tfstate.backup) == before ))"
```
```text
Apply complete! Resources: 1 added, 0 changed, 1 destroyed.
serial이 커졌다: 1
백업의 serial은 바꾸기 전 값: 1
```

## 상태를 잃어버리면
상태 파일을 잃어버렸다고 하자(옮겨 두고 흉내 낸다).
```bash
mv terraform.tfstate lost.tfstate
terraform plan -no-color | grep -E '^  # |^Plan:'
mv lost.tfstate terraform.tfstate
terraform plan -no-color | grep -E 'No changes'
```
```text
  # local_file.config will be created
  # random_password.db will be created
Plan: 2 to add, 0 to change, 0 to destroy.
No changes. Your infrastructure matches the configuration.
```
상태가 없으면 Terraform은 아무것도 만든 적이 없다고 여기고 모두 새로 만들려 한다. 파일은 덮어쓰면 그만이지만, 비밀번호는 **새 값**이 만들어져 데이터베이스의 실제 비밀번호와 어긋난다. 클라우드라면 같은 서버가 두 대 생기거나, 이름이 겹쳐 만들기에 실패한다. 상태를 되돌리자 다시 "바꿀 것 없음"이 되었다. 잃은 상태를 되살릴 수 없다면 이미 있는 객체를 상태로 들여오는 `import`(9편)로 하나씩 다시 이어야 한다.

## 상태를 다루는 규칙
- **손으로 고치지 않는다**: 리소스를 상태에서만 빼는 `terraform state rm`, 주소를 바꾸는 `terraform state mv`(9편의 `moved` 블록이 더 안전하다) 같은 명령을 쓴다.
- **Git에 넣지 않는다**: 비밀 값이 들어 있고, 여러 사람이 각자 고치면 충돌한다. `.gitignore`에 `*.tfstate*`를 넣는다.
- **한곳에, 잠가서 쓴다**: 팀에서는 원격 저장소에 두고, 적용하는 동안 잠가 두 사람이 동시에 쓰지 못하게 한다(8편).
- **백업과 버전**: 원격 저장소의 버전 기능(객체 저장소의 버전 관리 등)을 켜 두면 잘못 쓴 상태를 되돌릴 수 있다.

## 흔한 오해
- "상태는 캐시라서 지워도 다시 만들어진다": 실제 객체의 ID를 다시 알아낼 방법이 없다. 지우면 Terraform은 관리하던 것을 잊는다.
- "sensitive로 표시하면 상태에서도 가려진다": 화면 출력만 가린다. 상태 파일에는 그대로 있다.
- "계획은 상태만 보고 세운다": 기본적으로 실제를 다시 읽은 뒤 세운다. 그래서 바깥에서 바뀐 것도 계획에 드러난다.

## 어디에 쓰이나
- Git 버전 관리 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」: 이름(참조)과 실제 객체(해시)를 잇는 기록이라는 점에서 상태와 닮았다.
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 비밀 값이 엉뚱한 곳(이미지 레이어, 상태 파일)에 남는 문제를 함께 본다.
- 카프카 이벤트 스트리밍 9편 「KRaft: ZooKeeper 없이 메타데이터 관리하기」: 클러스터의 "지금 모습"을 한곳에 기록하고 그것을 기준으로 맞추는 또 하나의 예다.

## 정리
- 상태는 설정의 주소와 실제 객체의 ID·속성을 잇는 기록이다. 계획은 상태로 실제를 다시 읽고 설정과 비교한다.
- `serial`과 `lineage`가 낡은 상태로 덮어쓰는 것을 막고, 적용할 때마다 백업이 남는다.
- 바깥에서 바꾼 것(드리프트)은 계획에 드러나고, 다음 적용 때 되돌려진다. `-refresh-only`로 따로 볼 수 있다.
- 상태에는 비밀 값이 평문으로 있다. Git에 넣지 말고, 원격에 잠가서 둔다.

## 더 알아보기
- 이전 글: 2편 「HCL과 첫 리소스: init, plan, apply, destroy」
- 다음 글: 4편 「변수, 출력, locals: 값을 바깥에서 받고 밖으로 내보내기」
