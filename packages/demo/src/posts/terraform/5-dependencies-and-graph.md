# [Terraform 인프라 코드 5/10] 의존성과 그래프: 순서를 정하는 방법

> **한 줄 요약** — Terraform은 리소스가 다른 리소스의 속성을 참조하는 관계를 모아 방향 그래프를 만들고, 참조되는 쪽을 먼저 만들면서 서로 관계없는 리소스는 동시에 만들며, 지울 때는 그 순서를 거꾸로 따르고, 참조로 드러나지 않는 숨은 의존은 `depends_on`으로 직접 알려 준다.

## 이 글에서 다루는 것
- 참조가 곧 의존: 암묵적 의존성
- 의존 그래프와 병렬 실행
- `terraform graph`로 그래프 보기
- 숨은 의존과 `depends_on`
- 직접 해 보기: 네트워크 → DB·캐시 → 앱 순서와 동시 실행, 지우는 순서

## 참조가 곧 의존
2편에서 파일 내용이 `random_pet.server.id`를 참조하자, Terraform은 이름을 먼저 만들고 파일을 나중에 만들었다. 순서를 따로 적지 않았는데도 그랬다. 참조하는 값이 있어야 리소스를 만들 수 있으니, **참조가 곧 의존**이다. 실제 인프라에서는 이런 식이다.
- 서브넷은 VPC의 ID를 참조하므로 VPC 다음에 만든다.
- 서버는 서브넷 ID와 보안 그룹 ID를 참조하므로 그 둘 다음에 만든다.
- DNS 레코드는 서버의 IP를 참조하므로 서버 다음에 만든다.

Terraform은 모든 참조를 모아 **방향 그래프**(DAG, 순환이 없는 방향 그래프)를 만들고, 그래프를 따라 걸으며 일을 한다. 앞선 것이 끝난 리소스부터, **서로 관계없는 리소스는 동시에** 만든다(기본 최대 10개, `-parallelism`으로 바꾼다). 순환 참조(A가 B를, B가 A를 참조)는 순서를 정할 수 없으므로 오류다.

## 직접 해 보기: 순서와 동시 실행
실제 인프라 대신, 만들어질 때 자기 이름과 시각을 기록하고 2초 기다리는 `terraform_data` 넷을 만든다. `local-exec` 프로비저너는 리소스를 만든 뒤 이 컴퓨터에서 명령을 실행한다. DB와 캐시는 네트워크를, 앱은 DB와 캐시를 참조한다.
```hcl
# 파일: main.tf
locals {
  step = "echo \"$NAME $(date +%s%3N)\" >> steps.log; sleep 2"   # 이름과 밀리초 시각을 남기고 2초 기다린다
}

resource "terraform_data" "network" {
  provisioner "local-exec" {
    command     = local.step
    environment = { NAME = "network" }
  }
}

resource "terraform_data" "db" {
  input = terraform_data.network.id
  provisioner "local-exec" {
    command     = local.step
    environment = { NAME = "db" }
  }
}

resource "terraform_data" "cache" {
  input = terraform_data.network.id
  provisioner "local-exec" {
    command     = local.step
    environment = { NAME = "cache" }
  }
}

resource "terraform_data" "app" {
  input = [terraform_data.db.id, terraform_data.cache.id]
  provisioner "local-exec" {
    command     = local.step
    environment = { NAME = "app" }
  }
}
```
먼저 그래프를 본다. `terraform graph`는 그래프를 Graphviz의 DOT 형식으로 내보낸다. 화살표만 골라, "앞의 것이 뒤의 것에 의존한다"로 읽는다.
```bash
terraform init > /dev/null
terraform graph | grep -- '->' | tr -d '";' | sed 's/terraform_data\.//g'
```
```text
  app -> cache
  app -> db
  cache -> network
  db -> network
```
`terraform graph | dot -Tsvg > graph.svg`처럼 Graphviz로 그림을 그릴 수도 있다. 이제 적용하고, 각 리소스가 시작된 시각을 2초 단위로 묶어 몇 번째 단계에 만들어졌는지 본다.
```bash
terraform apply -auto-approve -no-color > /dev/null
sort -k2 -n steps.log | awk 'NR == 1 { t0 = $2 } { print int(($2 - t0 + 1000) / 2000) "단계:", $1 }' | sort
```
```text
0단계: network
1단계: cache
1단계: db
2단계: app
```
- 네트워크가 먼저 만들어졌다. 아무것도 참조하지 않으니 바로 시작할 수 있다.
- DB와 캐시는 같은 단계에서 **동시에** 만들어졌다. 서로 관계가 없기 때문이다. 하나씩 만들었다면 2초가 더 걸렸을 것이다. 리소스가 수백 개인 실제 인프라에서는 이 동시 실행이 적용 시간을 크게 줄인다.
- 앱은 둘을 모두 기다렸다.

## 지우는 순서
지울 때는 거꾸로다. 앱을 먼저 지워야 앱이 쓰는 DB를 지울 수 있다. 실제로도 서브넷 안에 서버가 남아 있으면 서브넷을 지울 수 없다.
```bash
terraform destroy -auto-approve -no-color | grep 'Destruction complete' | sed 's/: .*//; s/terraform_data\.//' | paste -sd' '
```
```text
app … network
```
앱이 맨 먼저, 네트워크가 맨 나중에 지워졌다(가운데의 DB와 캐시는 동시에 지워져 끝나는 순서가 매번 다르므로 가렸다). 교체(`-/+`)도 기본은 "지우고 나서 만들기" 순서다. 이를 뒤집는 `create_before_destroy`는 9편에서 본다.

## 숨은 의존과 depends_on
참조가 없는데 순서가 필요한 경우가 있다. 예를 들어 앱 서버가 시작할 때 객체 저장소의 설정 파일을 읽는데, 설정에서는 서버가 그 파일을 참조하지 않는다. 또는 권한(IAM 정책)이 붙은 뒤에야 서버의 시작 스크립트가 동작한다. Terraform은 이런 관계를 알 수 없으므로 동시에 만들어 버릴 수 있다. 이럴 때 `depends_on`으로 직접 알려 준다.
```bash
cat >> main.tf <<'EOF'

resource "terraform_data" "migration" {
  depends_on = [terraform_data.db]   # 참조는 없지만 DB가 먼저 있어야 한다
}
EOF
terraform graph | grep -- '->' | tr -d '";' | sed 's/terraform_data\.//g' | grep migration
```
```text
  migration -> db
```
참조가 없어도 그래프에 화살표가 생겼다. 다만 `depends_on`은 마지막 수단이다. 리소스 전체에 대한 의존이라, 참조한 리소스가 조금만 바뀌어도 계획에서 값을 미리 알 수 없게 되어 계획이 덜 정확해진다. 가능하면 실제로 필요한 속성을 참조해 의존을 드러내는 편이 낫다.

## 데이터 소스도 그래프에 들어간다
`data` 블록(데이터 소스)은 Terraform이 만들지 않은 기존 객체를 **읽어 온다**. 이미 있는 VPC를 이름으로 찾거나, 최신 서버 이미지 ID를 조회하는 식이다. 데이터 소스도 그래프의 한 점이라, 다른 리소스의 값을 쓰면 그 리소스 다음에 읽힌다.
```hcl
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}
```

## 흔한 오해
- "파일에 적은 순서대로 만들어진다": 파일과 블록의 순서는 상관없다. 순서는 참조 그래프가 정한다.
- "순서가 걱정되면 depends_on을 넉넉히 단다": 계획이 덜 정확해지고 동시 실행도 줄어든다. 참조로 표현할 수 없는 경우에만 쓴다.
- "프로비저너로 서버 설정까지 하면 된다": 프로비저너는 실패해도 되돌리기 어렵고 계획에 드러나지 않아, 공식 문서도 마지막 수단으로 권한다. 서버 안의 설정은 이미지나 시작 스크립트로 한다.

## 어디에 쓰이나
- 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」: `depends_on`으로 컨테이너 시작 순서를 정하는 같은 문제와, "시작했다"와 "준비되었다"의 차이를 본다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 잡 사이의 `needs`로 그래프를 만들고 관계없는 잡을 동시에 돌리는 같은 생각이다.
- Git 버전 관리 3편 「Git 내부 구조: 블롭, 트리, 커밋 객체와 참조」: 커밋이 부모를 가리키며 이루는 방향 그래프(DAG)를 Git 쪽에서 본다.

## 정리
- 다른 리소스의 속성을 참조하면 의존이 생긴다. Terraform은 이것으로 방향 그래프를 만든다.
- 앞선 것이 끝난 리소스부터, 서로 관계없는 리소스는 동시에 만든다. 지울 때는 거꾸로다.
- `terraform graph`로 그래프를 볼 수 있다.
- 참조로 드러나지 않는 의존만 `depends_on`으로 알려 준다.

## 더 알아보기
- 이전 글: 4편 「변수, 출력, locals: 값을 바깥에서 받고 밖으로 내보내기」
- 다음 글: 6편 「count와 for_each: 같은 리소스를 여러 개」
