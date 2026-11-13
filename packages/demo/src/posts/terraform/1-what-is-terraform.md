# [Terraform 인프라 코드 1/10] 인프라를 코드로: Terraform이란

> **한 줄 요약** — Terraform은 서버, 네트워크, DNS 같은 인프라의 "있어야 할 모습"을 코드로 적어 두면, 지금 있는 것과 비교해 무엇을 만들고 바꾸고 지울지 계획을 보여 준 뒤 그대로 맞춰 주는 도구로, 같은 코드를 몇 번 적용해도 결과가 같고 변경을 리뷰와 기록으로 남길 수 있다.

## 이 글에서 다루는 것
- 콘솔을 클릭해 만든 인프라의 문제
- 선언형: 절차 대신 결과를 적기
- Terraform의 구성 요소: 설정, 프로바이더, 상태, 계획과 적용
- 직접 해 보기: 첫 리소스, 다시 적용하기, 손으로 지운 것 되돌리기
- 짧은 역사: MPL에서 BSL로, OpenTofu

## 클릭으로 만든 인프라
서비스를 처음 띄울 때는 클라우드 콘솔에서 서버를 만들고, 방화벽 규칙을 넣고, DNS를 연결하는 일을 손으로 한다. 금방 되지만 시간이 지나면 문제가 드러난다.
- **재현이 안 된다**: 운영 환경과 똑같은 테스트 환경을 만들려면 누군가 기억에 의존해 다시 클릭해야 한다. 조금씩 다른 "눈송이" 서버가 생긴다.
- **기록이 없다**: 누가 언제 왜 방화벽 규칙을 바꿨는지 알 수 없다. 사고가 나면 되돌릴 기준도 없다.
- **리뷰가 없다**: 코드는 풀 리퀘스트로 검토하는데, 그보다 위험한 인프라 변경은 한 사람의 클릭으로 끝난다.

**코드로 관리하는 인프라**(Infrastructure as Code, IaC)는 이것을 소프트웨어처럼 다루자는 생각이다. 인프라를 파일로 적고, Git에 넣고, 리뷰하고, 자동으로 적용한다.

## 선언형: 결과를 적는다
셸 스크립트로 인프라를 만들 수도 있다. "서버를 만든다, 규칙을 추가한다"처럼 **절차**를 적는 방식이다. 그런데 두 번 실행하면 서버가 둘 생기고, 중간에 실패하면 어디까지 되었는지 따로 따져야 한다.

Terraform은 **선언형**이다. "서버가 하나 있고, 이 규칙이 있어야 한다"는 **결과**를 적는다. 그러면 Terraform이 지금 상태와 비교해 필요한 것만 한다. 없으면 만들고, 다르면 고치고, 이미 같으면 아무것도 하지 않는다. 몇 번을 적용해도 결과가 같다(멱등).

## Terraform의 구성 요소
- **설정**(configuration): `.tf` 파일에 HCL이라는 언어로 원하는 리소스를 적는다(2편).
- **프로바이더**(provider): AWS, Google Cloud, Azure, 쿠버네티스, GitHub, Cloudflare 같은 각 시스템의 API를 Terraform이 다룰 수 있게 해 주는 플러그인이다. 수천 개가 공개 레지스트리에 있다.
- **상태**(state): Terraform이 만든 리소스와 실제 ID의 대응을 기억하는 파일이다(3편).
- **계획과 적용**: `terraform plan`이 설정과 상태, 실제를 비교해 할 일을 보여 주고, `terraform apply`가 그것을 실행한다.

이 시리즈는 클라우드 계정 없이 따라 할 수 있게, 컴퓨터의 파일을 리소스로 다루는 `local` 프로바이더와 임의의 값을 만드는 `random` 프로바이더를 쓴다. 클라우드 리소스도 흐름은 똑같다. 예를 들어 AWS의 서버는 이렇게 적는다(이 글에서 실행하지는 않는다).
```hcl
resource "aws_instance" "web" {
  ami           = "ami-0123456789abcdef0"
  instance_type = "t3.micro"
  tags          = { Name = "web" }
}
```

## 직접 해 보기: 첫 리소스
"이 내용의 파일이 있어야 한다"를 적는다. 리소스 종류는 `local_file`, 이름은 `greeting`이다.
```hcl
# 파일: main.tf
resource "local_file" "greeting" {
  filename = "${path.module}/hello.txt"
  content  = "안녕, Terraform\n"
}
```
`terraform init`은 필요한 프로바이더를 내려받아 작업 폴더를 준비한다. 그다음 계획을 보고 적용한다.
```bash
terraform init > /dev/null
terraform plan -no-color | grep -E '^  # |^Plan:'
terraform apply -auto-approve -no-color | tail -1
cat hello.txt
```
```text
  # local_file.greeting will be created
Plan: 1 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
안녕, Terraform
```
계획이 "만들 것 1개"라고 알려 주었고, 적용하자 파일이 생겼다. `-auto-approve`는 확인 질문(`yes` 입력)을 건너뛰는 옵션이다. 실무에서는 계획을 사람이 읽고 승인한다.

## 다시 적용하기, 손으로 바꾼 것 되돌리기
같은 설정을 한 번 더 적용하면 어떻게 될까. 그리고 누군가 파일을 손으로 지우면?
```bash
terraform apply -auto-approve -no-color | tail -1
rm hello.txt
terraform plan -no-color | grep -E '^  # |^Plan:'
terraform apply -auto-approve -no-color | tail -1
cat hello.txt
```
```text
Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
  # local_file.greeting will be created
Plan: 1 to add, 0 to change, 0 to destroy.
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
안녕, Terraform
```
- 이미 원하는 모습이므로 두 번째 적용은 아무것도 하지 않았다. 스크립트였다면 같은 일을 또 했을 것이다.
- 파일을 손으로 지우자, 계획이 "있어야 할 것이 없다"를 알아채 다시 만들겠다고 했다. 코드가 기준이고, 실제가 기준에서 벗어난 것(**드리프트**)을 계획이 드러낸다(3편, 10편).

설정에서 내용을 바꾸면 "고칠 것"이 된다. `sed`로 설정의 문장을 바꾸고 다시 계획한다.
```bash
sed -i 's/안녕, Terraform/안녕, 인프라 코드/' main.tf
terraform plan -no-color | grep -E '^  # |^Plan:'
```
```text
  # local_file.greeting must be replaced
Plan: 1 to add, 0 to change, 1 to destroy.
```
파일 내용은 그 자리에서 고칠 수 없는 속성이라, 지우고 다시 만드는 **교체**(replace)가 되었다. 어떤 속성은 제자리에서 바뀌고(update), 어떤 속성은 교체가 필요한지는 프로바이더가 정한다. 운영 중인 서버라면 교체는 곧 중단일 수 있으므로, 계획에서 이 한 줄을 놓치지 않는 것이 중요하다(9편).

## 짧은 역사
Terraform은 HashiCorp가 만들어 2014년 7월 0.1을 공개했다. 처음에는 오픈 소스 라이선스인 MPL 2.0이었다. 2023년 8월 10일 HashiCorp는 1.6부터 경쟁 서비스에 쓰는 것을 제한하는 BSL 1.1로 바꾼다고 발표했고, 1.5.7이 마지막 MPL 버전이 되었다. 이에 반발한 커뮤니티가 MPL 버전에서 갈라져 나와 **OpenTofu**를 만들었다. OpenTofu는 2023년 9월 20일 리눅스 재단 프로젝트가 되었고 2024년 1월 첫 안정판을 냈다. 명령 이름(`tofu`)만 다르고 설정 문법은 대부분 같다. IBM이 2024년 4월 24일 HashiCorp 인수를 발표해 2025년 2월 27일 마무리했다. 이 시리즈의 내용은 두 도구 모두에 대부분 그대로 통한다.

## 흔한 오해
- "Terraform은 서버 안의 설정까지 관리한다": 서버, 네트워크 같은 인프라를 만들고 바꾸는 데 쓴다. 서버 안의 패키지와 설정은 이미지(도커)나 설정 관리 도구의 몫이다.
- "선언형이니 순서를 신경 쓸 필요가 없다": 순서는 Terraform이 참조 관계에서 알아내지만(5편), 교체처럼 중단을 낳는 변경은 사람이 계획을 보고 판단해야 한다.
- "콘솔에서 고쳐도 다음 적용 때 맞춰진다": 맞춰지는 대신 그 수정이 **사라진다**. 코드로 관리하는 리소스는 코드로만 고친다.

## 어디에 쓰이나
- 도커와 컨테이너 4편 「Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT」: 서버 안의 내용은 이미지로 코드화하고, 서버 바깥의 인프라는 Terraform으로 코드화한다.
- Nginx 웹 서버 2편 「설정 파일 구조: 블록, 지시어, 상속, 다시 읽기」: 블록과 지시어로 원하는 모습을 적고 다시 읽혀 맞추는 선언형 설정의 다른 예다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 인프라 변경도 풀 리퀘스트로 리뷰하는 흐름의 바탕이다(10편).

## 정리
- 코드로 관리하는 인프라는 재현, 기록, 리뷰를 가능하게 한다.
- Terraform은 선언형이다. 결과를 적으면 지금 모습과 비교해 필요한 것만 한다.
- 설정, 프로바이더, 상태, 계획과 적용이 기본 구성이다. 계획에서 만들기·고치기·교체·지우기를 확인한다.
- 2023년 라이선스 변경 이후 오픈 소스 갈래인 OpenTofu도 함께 쓰인다.

## 더 알아보기
- 다음 글: 2편 「HCL과 첫 리소스: init, plan, apply, destroy」

## 시리즈 안내
1. **인프라를 코드로: Terraform이란** ← 지금 읽는 글
2. HCL과 첫 리소스: init, plan, apply, destroy
3. 상태 파일: Terraform이 기억하는 세상
4. 변수, 출력, locals: 값을 바깥에서 받고 밖으로 내보내기
5. 의존성과 그래프: 순서를 정하는 방법
6. count와 for_each: 같은 리소스를 여러 개
7. 모듈: 묶어서 다시 쓰기
8. 원격 상태와 잠금: 여럿이 같은 인프라를 다룰 때
9. 변경을 안전하게: lifecycle, moved, import, replace
10. 팀으로 쓰기: CI의 plan, 테스트, 드리프트 감지

이 시리즈 다음에 읽으면 좋은 글: 인프라 위에 올릴 것을 코드로 만드는 도커와 컨테이너 9편 「Docker Compose: 여러 컨테이너를 한 파일로 정의하기」, 인프라 변경을 자동으로 검사하는 GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」, 그리고 비밀 값을 다루는 GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」을 권한다.
