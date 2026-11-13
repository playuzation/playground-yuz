# [Terraform 인프라 코드 6/10] count와 for_each: 같은 리소스를 여러 개

> **한 줄 요약** — `count`는 리소스를 번호(0, 1, 2…)로, `for_each`는 키(이름)로 여러 개 만드는데, 번호로 만든 목록의 가운데를 빼면 뒤의 것들이 한 칸씩 당겨져 엉뚱한 리소스가 교체되고 지워지므로, 하나하나가 이름을 가진 리소스라면 `for_each`를 쓰고 `count`는 "있다/없다"를 고르거나 똑같은 것 여러 개를 만들 때 쓴다.

## 이 글에서 다루는 것
- `count`와 `count.index`
- `for_each`와 `each.key`, `each.value`
- 가운데를 빼면 생기는 일: 번호와 키의 차이
- 맵으로 리소스마다 다른 설정 주기, 조건부 리소스
- `for` 표현식과 스플랫(`[*]`)으로 결과 모으기

## count: 번호로 여러 개
사용자마다 홈 폴더 설정 파일을 하나씩 만든다고 하자. 블록을 사용자 수만큼 복사하는 대신, 리소스 블록에 `count`를 주면 그 수만큼 만들어지고, 각자는 `count.index`(0부터)로 자기 번호를 안다. 주소는 `local_file.by_count[0]`처럼 번호가 붙는다.

## for_each: 키로 여러 개
`for_each`에는 집합(set)이나 맵을 준다. 원소마다 리소스가 하나씩 생기고, 각자는 `each.key`(와 맵이라면 `each.value`)로 자기 몫을 안다. 주소는 `local_file.by_each["minji"]`처럼 **키**가 붙는다. 리스트는 순서와 중복이 있어 바로 줄 수 없으므로 `toset()`으로 집합으로 바꾼다.

## 직접 해 보기: 같은 목록, 두 방식
같은 사용자 목록으로 두 방식의 리소스를 만든다.
```hcl
# 파일: main.tf
variable "users" {
  type    = list(string)
  default = ["minji", "sora", "jun"]
}

resource "local_file" "by_count" {
  count    = length(var.users)
  filename = "${path.module}/count/user-${count.index}.txt"
  content  = "${var.users[count.index]}\n"
}

resource "local_file" "by_each" {
  for_each = toset(var.users)
  filename = "${path.module}/each/${each.key}.txt"
  content  = "${each.value}\n"
}
```
```bash
terraform init > /dev/null
terraform apply -auto-approve -no-color | tail -1
terraform state list
```
```text
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.
local_file.by_count[0]
local_file.by_count[1]
local_file.by_count[2]
local_file.by_each["jun"]
local_file.by_each["minji"]
local_file.by_each["sora"]
```
`count`로 만든 것은 번호로, `for_each`로 만든 것은 이름으로 상태에 기록되었다. 이제 가운데 사용자 `sora`가 떠났다. 목록에서 빼고 계획을 본다.
```bash
terraform plan -no-color -var 'users=["minji", "jun"]' | grep -E '^  # |^Plan:'
```
```text
  # local_file.by_count[1] must be replaced
  # local_file.by_count[2] will be destroyed
  # (because index [2] is out of range for count)
  # local_file.by_each["sora"] will be destroyed
  # (because key ["sora"] is not in for_each map)
Plan: 1 to add, 0 to change, 3 to destroy.
```
- `for_each` 쪽은 정확히 `sora`의 것 하나만 지운다.
- `count` 쪽은 다르다. 목록이 `[minji, jun]`이 되자 1번이 `sora`에서 `jun`으로 바뀌어 **교체**되고, 이제 없는 2번(원래 `jun`)이 **지워진다**. 떠난 사람은 `sora`인데 `jun`의 리소스가 지워지고 다시 만들어지는 것이다.

파일이라면 별일 아니지만, 사용자마다 서버나 데이터베이스가 있었다면 `jun`의 데이터가 사라질 수 있다. 그래서 하나하나가 정체성을 가진 리소스는 `for_each`로 만든다. 이미 `count`로 만든 것을 `for_each`로 옮길 때는 9편의 `moved` 블록으로 주소만 바꿔 교체를 피한다.

## 맵으로 리소스마다 다른 설정
`for_each`에 맵을 주면 키마다 다른 값을 줄 수 있다. 값이 객체라면 `each.value.속성`으로 꺼낸다.
```bash
rm main.tf; rm -r count each
cat > users.tf <<'EOF'
variable "members" {
  type = map(object({ team = string, admin = bool }))
  default = {
    minji = { team = "data", admin = true }
    sora  = { team = "web", admin = false }
  }
}

resource "local_file" "member" {
  for_each = var.members
  filename = "${path.module}/members/${each.key}.txt"
  content  = "${each.key} (${each.value.team})${each.value.admin ? " admin" : ""}\n"
}

variable "audit_enabled" {
  type    = bool
  default = false
}

resource "local_file" "audit" {
  count    = var.audit_enabled ? 1 : 0          # 켜져 있을 때만 하나 만든다
  filename = "${path.module}/audit.log"
  content  = "audit on\n"
}

output "member_files" {
  value = [for name, f in local_file.member : f.filename]
}

output "admins" {
  value = [for name, m in var.members : name if m.admin]
}

output "audit_files" {
  value = local_file.audit[*].filename
}
EOF
terraform apply -auto-approve -no-color | sed -n '/^Outputs:/,$p'
cat members/*.txt
```
```text
Outputs:

admins = [
  "minji",
]
audit_files = []
member_files = [
  "./members/minji.txt",
  "./members/sora.txt",
]
minji (data) admin
sora (web)
```
- 사용자마다 팀과 관리자 여부가 다른 파일이 만들어졌다. 실무에서는 "팀마다 다른 권한", "환경마다 다른 서버 크기" 같은 표를 맵 하나로 적는다.
- `audit` 리소스는 `audit_enabled`가 거짓이라 0개다. `count = 조건 ? 1 : 0`은 리소스를 켜고 끄는 관용구다. 0개일 수 있으므로 참조할 때는 `[*]`(스플랫)로 "있으면 그 목록"을 받는다.
- `for` 표현식은 목록과 맵을 바꾸고 거른다. `[for name, m in var.members : name if m.admin]`은 "관리자인 이름만"이다.

블록 안의 반복되는 하위 블록(보안 그룹의 규칙 여러 개 등)은 `dynamic` 블록으로 만든다. 원리는 `for_each`와 같다.
```hcl
dynamic "ingress" {
  for_each = [80, 443]
  content {
    from_port   = ingress.value
    to_port     = ingress.value
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

## 언제 무엇을
- **`for_each`**: 이름이나 ID로 구별되는 것(사용자, 버킷, 서브넷, 환경). 목록에서 하나를 빼거나 더해도 나머지가 흔들리지 않는다.
- **`count`**: 켜고 끄기(`? 1 : 0`), 또는 정말 서로 구별할 필요가 없는 똑같은 것 N개.
- 둘을 한 리소스에 함께 쓸 수는 없다. `for_each`의 키는 계획할 때 알아야 하므로, 적용해 봐야 정해지는 값(다른 리소스의 ID 등)으로는 만들 수 없다.

## 흔한 오해
- "`count`와 `for_each`는 취향 차이다": 상태에 기록되는 주소가 다르다. 목록이 바뀔 때 무엇이 교체되는지가 완전히 달라진다.
- "리스트를 바로 `for_each`에 줄 수 있다": 집합이나 맵이어야 한다. `toset()`으로 바꾸면 순서가 사라지고 중복이 합쳐진다.
- "0개인 리소스는 `local_file.audit.filename`으로 참조하면 된다": `count`를 쓴 리소스는 늘 목록이다. `[0]`으로 직접 꺼내면 0개일 때 오류가 나므로 `[*]`나 `one()`을 쓴다.

## 어디에 쓰이나
- 추상 데이터 타입 심화 16편 「해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱」: 번호로 찾는 배열과 키로 찾는 맵의 차이가 `count`와 `for_each`의 차이다.
- 카프카 이벤트 스트리밍 3편 「토픽과 파티션: 순서는 파티션 안에서만 지켜진다」: "해시 % 개수"로 정한 자리가 개수가 바뀌면 옮겨 가는 문제가, 번호로 정한 리소스가 당겨지는 문제와 닮았다.
- GitHub 협업과 자동화 7편 「GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로」: 매트릭스로 같은 잡을 값마다 여러 개 만드는 같은 생각이다.

## 정리
- `count`는 번호로, `for_each`는 키로 같은 리소스를 여러 개 만든다. 상태의 주소도 번호와 키로 다르다.
- 번호로 만든 목록의 가운데를 빼면 뒤가 당겨져 다른 리소스가 교체·삭제된다. 정체성이 있는 리소스는 `for_each`로 만든다.
- `count = 조건 ? 1 : 0`으로 리소스를 켜고 끄고, 참조는 `[*]`로 받는다.
- `for` 표현식, 스플랫, `dynamic` 블록으로 목록과 하위 블록을 다룬다.

## 더 알아보기
- 이전 글: 5편 「의존성과 그래프: 순서를 정하는 방법」
- 다음 글: 7편 「모듈: 묶어서 다시 쓰기」
