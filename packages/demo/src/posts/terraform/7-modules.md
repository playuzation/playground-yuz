# [Terraform 인프라 코드 7/10] 모듈: 묶어서 다시 쓰기

> **한 줄 요약** — 모듈은 `.tf` 파일이 든 폴더 하나로, 입력 변수를 받아 리소스 묶음을 만들고 출력으로 결과를 돌려주는 재사용 단위이며, 같은 모듈을 다른 값으로 여러 번 부르고, 한 모듈의 출력을 다른 모듈의 입력으로 이어 큰 인프라를 조립한다.

## 이 글에서 다루는 것
- 루트 모듈과 자식 모듈
- 모듈 만들기: 입력, 리소스, 출력
- 모듈 부르기: `source`, 인자, `module.이름.출력`
- 상태 안의 모듈 주소
- 모듈의 출처와 버전, 좋은 모듈의 조건

## 모든 설정은 이미 모듈이다
지금까지 작업한 폴더도 사실 모듈이다. 명령을 실행하는 폴더를 **루트 모듈**이라고 한다. 루트 모듈은 다른 폴더의 모듈(**자식 모듈**)을 `module` 블록으로 불러 쓸 수 있다. 모듈은 함수와 비슷하다. 4편의 입력 변수가 매개변수, 출력이 반환값이다.

웹 서비스를 하나 띄우려면 서버, 로드 밸런서, DNS 레코드, 경보가 늘 함께 필요하다고 하자. 서비스마다 이 묶음을 복사하면, 경보 기준을 고칠 때 모든 복사본을 찾아 고쳐야 한다. 묶음을 모듈로 만들면 한 곳만 고치면 된다.

## 직접 해 보기: 정적 사이트 모듈
작은 정적 사이트를 만드는 모듈을 만든다. 사이트 이름과 페이지 목록을 받아, 사이트 폴더에 페이지 파일과 목차 파일을 만들고, 폴더 경로와 페이지 수를 돌려준다.
```hcl
# 파일: modules/site/variables.tf
variable "name" {
  type        = string
  description = "사이트 이름(폴더 이름)"
}

variable "pages" {
  type        = map(string)
  description = "페이지 이름 → 본문"
}
```
```hcl
# 파일: modules/site/main.tf
resource "local_file" "page" {
  for_each = var.pages
  filename = "${path.root}/public/${var.name}/${each.key}.html"
  content  = "<h1>${each.key}</h1><p>${each.value}</p>\n"
}

resource "local_file" "index" {
  filename = "${path.root}/public/${var.name}/index.txt"
  content  = join("\n", sort(keys(var.pages)))
}
```
```hcl
# 파일: modules/site/outputs.tf
output "dir" {
  value = "public/${var.name}"
}

output "page_count" {
  value = length(var.pages)
}
```
모듈 안의 `path.root`는 루트 모듈의 폴더다. 모듈 폴더(`path.module`)가 아니라 루트 아래 `public`에 결과를 모으기 위해 썼다. 이제 루트 모듈에서 같은 모듈을 두 번 부른다. 두 번째 사이트는 첫 번째 사이트의 출력(폴더 경로)을 받아 링크를 건다.
```hcl
# 파일: main.tf
module "blog" {
  source = "./modules/site"
  name   = "blog"
  pages = {
    hello = "첫 글"
    infra = "인프라를 코드로"
  }
}

module "docs" {
  source = "./modules/site"
  name   = "docs"
  pages = {
    start = "시작하기"
    links = "블로그: ${module.blog.dir}"
  }
}

output "sites" {
  value = {
    blog = module.blog.page_count
    docs = module.docs.page_count
  }
}
```
모듈을 처음 쓰거나 `source`를 바꾸면 `init`을 다시 해야 한다. `init`이 모듈을 찾아 `.terraform/modules`에 등록한다.
```bash
terraform init -no-color | grep -E '^- .* in ' | sort      # 모듈을 찾는 순서는 매번 달라 정렬한다
terraform apply -auto-approve -no-color | sed -n '/^Apply/,$p'
terraform state list
cat public/docs/links.html
```
```text
- blog in modules/site
- docs in modules/site
Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:

sites = {
  "blog" = 2
  "docs" = 2
}
module.blog.local_file.index
module.blog.local_file.page["hello"]
module.blog.local_file.page["infra"]
module.docs.local_file.index
module.docs.local_file.page["links"]
module.docs.local_file.page["start"]
<h1>links</h1><p>블로그: public/blog</p>
```
- 같은 모듈이 서로 다른 값으로 두 번 쓰였다. 상태의 주소 앞에 `module.blog.`, `module.docs.`가 붙어 서로 구별된다.
- `docs`는 `module.blog.dir`을 참조하므로 5편의 그래프에서 `blog` 다음에 만들어진다. 모듈의 출력으로 모듈을 잇는 것이 큰 인프라를 조립하는 방법이다. 예를 들어 네트워크 모듈의 서브넷 ID 출력을 서버 모듈의 입력으로 넘긴다.
- 루트 모듈의 출력은 모듈 출력을 다시 내보낸 것이다. 자식 모듈의 출력은 루트에서 다시 내보내야 `terraform output`에 보인다.

## 모듈을 고치면
모듈 안을 고치면 그 모듈을 쓰는 모든 곳에 반영된다. 목차 파일에 제목 줄을 더해 본다.
```bash
sed -i 's/content  = join("\\n", sort(keys(var.pages)))/content  = "목차\\n${join("\\n", sort(keys(var.pages)))}"/' modules/site/main.tf
terraform plan -no-color | grep -E '^  # |^Plan:'
```
```text
  # module.blog.local_file.index must be replaced
  # module.docs.local_file.index must be replaced
Plan: 2 to add, 0 to change, 2 to destroy.
```
한 곳을 고쳤는데 두 사이트의 목차가 모두 바뀌었다. 장점이자 위험이다. 여러 팀이 쓰는 모듈을 고치면 모두의 인프라가 바뀌므로, 공유 모듈은 **버전**을 붙여 배포하고 쓰는 쪽이 원할 때 올리게 한다.

## 모듈의 출처와 버전
`source`는 로컬 폴더만이 아니다.
```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"      # 공개 레지스트리
  version = "~> 6.0"
  name    = "main"
  cidr    = "10.0.0.0/16"
}

module "alarms" {
  source = "git::https://github.com/example-org/tf-alarms.git?ref=v1.4.0"   # Git 태그
}
```
- **레지스트리**의 모듈은 `version`으로 범위를 정한다. 클라우드 업체별로 많이 쓰는 모듈이 공개되어 있다.
- **Git** 주소는 `?ref=`로 태그나 커밋을 고정한다. 브랜치 이름으로 걸면 언제 무엇이 바뀔지 모른다.
- 사내 모듈은 사내 레지스트리나 Git 저장소에 두고 태그로 배포하는 경우가 많다.

## 좋은 모듈의 조건
- **한 가지 일**: "웹 서비스 하나", "네트워크 하나"처럼 함께 만들고 함께 지우는 것을 묶는다. 모든 것을 하는 거대한 모듈은 아무도 고치지 못한다.
- **입력은 적게, 기본값은 안전하게**: 대부분의 사용자가 바꿀 필요가 없는 값은 모듈 안에 둔다.
- **출력은 넉넉하게**: 다른 모듈이 이어 쓸 ID, 주소, 이름은 내보낸다.
- **프로바이더 설정은 루트에**: 자격 증명과 지역 같은 프로바이더 설정은 루트 모듈이 정하고 자식 모듈은 물려받는다. 그래야 같은 모듈을 다른 계정과 지역에 쓸 수 있다.
- **얇은 감싸기는 피한다**: 리소스 하나를 이름만 바꿔 감싼 모듈은 읽을 곳만 늘린다.

## 흔한 오해
- "모듈을 고치면 `apply`만 하면 된다": 모듈을 추가하거나 `source`·`version`을 바꾸면 먼저 `init`을 해야 한다.
- "모듈 안의 리소스는 바깥에서 바로 참조할 수 있다": 모듈의 출력으로 내보낸 것만 `module.이름.출력`으로 쓸 수 있다.
- "모듈 안으로 리소스를 옮겨도 상태는 알아서 따라온다": 주소가 `local_file.x`에서 `module.a.local_file.x`로 바뀌므로 교체가 계획된다. 9편의 `moved` 블록으로 알려 준다.

## 어디에 쓰이나
- 도커와 컨테이너 6편 「멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기」: 단계를 이름 붙여 나누고 앞 단계의 결과를 뒤 단계가 받아 쓰는 조립 방식이 닮았다.
- GitHub 협업과 자동화 7편 「GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로」: 재사용 워크플로를 입력과 출력으로 부르고 태그로 버전을 고정하는 것이 모듈과 같다.
- Nginx 웹 서버 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」: `include`로 설정 조각을 나눠 다시 쓰는 방법과 비교해 본다.

## 정리
- 모듈은 `.tf` 파일이 든 폴더다. 입력 변수로 받고, 리소스를 만들고, 출력으로 돌려준다.
- `module` 블록으로 같은 모듈을 여러 번 부르고, 출력을 다른 모듈의 입력으로 이어 조립한다.
- 상태의 주소에는 `module.이름.`이 붙는다. 모듈을 바꾸면 `init`부터 한다.
- 공유 모듈은 레지스트리 버전이나 Git 태그로 고정하고, 한 가지 일을 하도록 작게 만든다.

## 더 알아보기
- 이전 글: 6편 「count와 for_each: 같은 리소스를 여러 개」
- 다음 글: 8편 「원격 상태와 잠금: 여럿이 같은 인프라를 다룰 때」
