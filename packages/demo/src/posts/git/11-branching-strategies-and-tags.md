# [Git 버전 관리 11/14] 브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발

> **한 줄 요약** — 브랜치 전략은 "무엇이 오래 살고 얼마나 자주 합치는가"를 팀이 약속하는 일이고, 그 약속의 끝에서 릴리스를 가리키는 것은 움직이지 않는 주석 태그(annotated tag)와 시맨틱 버전이다.

## 이 글에서 다루는 것
- Git Flow, GitHub Flow, 트렁크 기반 개발의 구조와 맞는 팀
- 기능 플래그와 짧게 사는 브랜치, 이 사이트 저장소의 흐름
- Conventional Commits로 다음 버전 정하기
- 가벼운 태그와 주석 태그, `git describe`, 버전 정렬, 태그 push와 태그를 옮기면 생기는 일

## 문제: 브랜치를 마음대로 만들면
브랜치는 41바이트 파일이라 공짜다(4편). 그래서 규칙 없이 쓰면 몇 주씩 사는 기능 브랜치, 누가 언제 배포했는지 모르는 main, "지금 운영에 나간 코드가 어느 커밋인가"에 답하지 못하는 상태가 금방 온다. 브랜치가 오래 살수록 병합 기준(merge base)이 뒤처지고 서로 같은 곳을 고칠 확률이 커져 충돌이 커진다(5편). **브랜치 전략**(branching strategy)은 어떤 브랜치가 오래 살고, 작업 브랜치는 어디서 갈라져 어디로 합쳐지며, 릴리스는 무엇으로 표시하는지를 정한 약속이다.

## 세 가지 전략
**Git Flow**는 빈센트 드리센(Vincent Driessen)이 2010년 글 "A successful Git branching model"로 소개했다. 오래 사는 브랜치가 둘이다. main(원문은 master)에는 릴리스된 버전만 태그와 함께 쌓이고, develop이 통합 브랜치다. 기능은 `feature/*`에서 develop으로, 릴리스 준비는 develop에서 딴 `release/*`에서 안정화한 뒤 main과 develop 양쪽에 합치고, 운영 긴급 수정은 main에서 딴 `hotfix/*`를 다시 양쪽에 합친다. 여러 버전을 동시에 지원해야 하는 설치형 제품에 맞는다. 드리센 자신도 2020년에 글머리에 덧붙인 메모에서, 지속적으로 배포하는 웹 앱이라면 GitHub Flow 같은 더 단순한 방식이 낫다고 적었다.

**GitHub Flow**는 GitHub 문서가 "자주 배포하는 팀을 위한 가벼운 브랜치 기반 워크플로"라고 소개하는 방식이다. 오래 사는 브랜치는 main 하나이고 main은 언제나 배포할 수 있는 상태다. 브랜치를 따서 커밋하고, 풀 리퀘스트로 리뷰와 CI를 거쳐 main에 합친 뒤 브랜치를 지운다.

**트렁크 기반 개발**(trunk-based development)은 모두가 트렁크(main)에 최소 하루 한 번은 합친다. 작업 브랜치는 몇 시간에서 하루이틀만 산다. 덜 끝난 기능도 합치되 **기능 플래그**(feature flag)로 꺼 둔다. 코드에는 `if flags.enabled("new-checkout", user)` 같은 분기가 들어가고, 배포(코드를 내보냄)와 출시(사용자에게 켬)가 분리된다. 대신 탄탄한 자동 테스트와 다 쓴 플래그를 지우는 습관이 필요하다. 릴리스는 트렁크에 태그를 붙이거나, 필요하면 트렁크에서 짧은 릴리스 브랜치를 딴다.

| 전략 | 오래 사는 브랜치 | 잘 맞는 경우 |
| --- | --- | --- |
| Git Flow | main, develop | 여러 버전을 지원하는 제품 |
| GitHub Flow | main | 자주 배포하는 웹 서비스 |
| 트렁크 기반 | main(트렁크) | 테스트가 탄탄하고 하루 여러 번 통합 |

이 사이트를 만드는 저장소는 Git Flow와 GitHub Flow를 섞었다. 작업은 `feat/*`(코드)·`docs/*`(글) 브랜치에서 하고, PR로 통합 브랜치 `dev`에 squash 병합한다. 모인 변경은 PR로 배포 브랜치 `main`에 merge commit으로 합치고, CI를 통과한 main이 GitHub Pages로 배포된다. 작업 브랜치가 짧게 사는 점은 GitHub Flow, 통합과 배포 브랜치를 나눈 점은 Git Flow를 닮았다. dev→main을 squash하지 않는 이유는 squash 커밋이 원래 커밋과 다른 객체라서 dev의 커밋이 main의 조상이 되지 않고, 다음 dev→main 병합에서 이미 들어간 변경이 다시 차이로 잡히기 때문이다(병합 방식 비교는 GitHub 협업과 자동화 2편).

## 커밋 규칙: Conventional Commits
**Conventional Commits** 1.0.0은 커밋 제목을 `<type>[optional scope]: <description>` 형식으로 쓰자는 규약이다. 명세가 의미를 정한 타입은 둘이다. `fix`는 시맨틱 버전의 PATCH, `feat`는 MINOR에 대응하고, 타입 뒤의 `!`나 `BREAKING CHANGE:` 꼬리말은 MAJOR에 대응한다. `docs`, `refactor`, `chore` 등도 쓸 수 있지만 `!`나 `BREAKING CHANGE:`가 없으면 버전에 영향이 없다. 형식이 기계로 읽히니 지난 태그 이후 커밋을 보고 다음 버전을 정할 수 있다. 실습 저장소부터 만든다(해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q shop && cd shop
echo "v1" > app.txt && git add app.txt
git commit -q -m "feat: first release"
git tag v0.9.0                          # 가벼운 태그
git tag -a v1.0.0 -m "Release 1.0.0"    # 주석 태그
echo "v2" > app.txt && git commit -q -am "fix: typo in title"
git tag nightly                         # 가벼운 태그
git commit -q --allow-empty -m "feat(search): add search box"
log=$(git log --format=%B v1.0.0..HEAD)
if grep -qE '^[a-z]+(\(.+\))?!:|^BREAKING CHANGE:' <<<"$log"; then
  echo major
elif grep -qE '^feat(\(.+\))?:' <<<"$log"; then echo minor
else echo patch; fi
```
```text
minor
```
`fix` 하나와 `feat` 하나가 있으니 v1.0.0 다음은 v1.1.0이다. 릴리스 도구(semantic-release 등)가 이 규칙으로 버전과 변경 기록을 만든다. 형식 검사는 13편의 commit-msg 훅으로 자동화한다.

## 태그: 움직이지 않는 이름
브랜치는 커밋하면 앞으로 가지만 **태그**(tag)는 한 커밋에 고정된 이름이다. 종류가 둘이다. **가벼운 태그**(lightweight tag)는 커밋 해시를 적은 참조 파일일 뿐이고, **주석 태그**(annotated tag)는 태그한 사람·시각·메시지를 담은 태그 객체를 따로 만든다.
```bash
git cat-file -t v0.9.0
git cat-file -t v1.0.0
git cat-file -p v1.0.0
```
```text
commit
tag
object 22d3382734ffd6d42cba2148c32d1f5cf3561918
type commit
tag v1.0.0
tagger Dev Kim <dev@example.com> 1772409900 +0900

Release 1.0.0
```
`v0.9.0`은 커밋을 바로 가리키지만 `v1.0.0`은 태그 객체를 가리키고, 그 객체가 `object` 줄로 커밋을 가리킨다. 태그 객체도 3편의 블롭·트리·커밋처럼 내용 주소로 저장되는지 확인하자. 내용을 다시 해시한 값이 참조와 같아야 하고, `^{commit}`으로 벗기면 가벼운 태그와 같은 커밋이 나와야 한다.
```bash
git cat-file tag v1.0.0 | git hash-object -t tag --stdin
git rev-parse v1.0.0
git rev-parse v1.0.0^{commit} v0.9.0
```
```text
263c503680a6653fc6fc198c585120d3af3ca75d
263c503680a6653fc6fc198c585120d3af3ca75d
22d3382734ffd6d42cba2148c32d1f5cf3561918
22d3382734ffd6d42cba2148c32d1f5cf3561918
```
두 종류의 차이는 도구에서 드러난다. `git describe`는 가장 가까운 태그와 거기서 몇 커밋 왔는지를 이름으로 만드는데, 기본으로 주석 태그만 본다.
```bash
git describe
git describe --tags
```
```text
v1.0.0-2-g69d2973
nightly-1-g69d2973
```
`v1.0.0-2-g69d2973`는 "v1.0.0에서 2커밋 뒤, 커밋 `69d2973`"라는 뜻이다. 빌드 결과물에 버전을 박을 때 쓴다. `--tags`를 주어야 가벼운 태그 `nightly`가 보인다. 릴리스에는 주석 태그, 개인 표시용으로는 가벼운 태그를 쓰는 관례가 여기서 나온다.

## 시맨틱 버전과 정렬
**시맨틱 버저닝**(Semantic Versioning) 2.0.0은 `MAJOR.MINOR.PATCH`로, 호환되지 않는 API 변경이면 MAJOR, 호환되는 기능 추가면 MINOR, 버그 수정이면 PATCH를 올린다. `1.10.0-rc.1` 같은 사전 릴리스는 `1.10.0`보다 앞선다. 태그 앞의 `v`는 SemVer의 일부가 아니라 흔한 관례다. 그런데 태그 목록은 기본이 사전순이다.
```bash
for t in v1.2.0 v1.10.0-rc.1 v1.10.0; do git tag -a $t -m $t; done
git tag -l 'v1.*' | paste -sd' '
git tag -l 'v1.*' --sort=v:refname | paste -sd' '
git -c versionsort.suffix=- tag -l 'v1.*' --sort=v:refname | paste -sd' '
```
```text
v1.0.0 v1.10.0 v1.10.0-rc.1 v1.2.0
v1.0.0 v1.2.0 v1.10.0 v1.10.0-rc.1
v1.0.0 v1.2.0 v1.10.0-rc.1 v1.10.0
```
사전순에서는 1.10이 1.2보다 앞선다. `--sort=v:refname`이 숫자를 숫자로 비교하지만 rc가 정식 버전 뒤로 가고, `versionsort.suffix=-`로 "하이픈 꼬리는 앞에"를 알려 줘야 SemVer 순서가 된다.

## 태그 push와 태그를 옮기면 생기는 일
`git push`는 태그를 보내지 않는다. `--follow-tags`는 보내는 커밋에 닿는 **주석 태그만** 함께 보낸다. 로컬 bare 저장소로 확인한다.
```bash
git init -q --bare ../origin.git
git remote add origin ../origin.git
git push -q --follow-tags origin main
git ls-remote --tags --refs origin | cut -f2
```
```text
refs/tags/v1.0.0
refs/tags/v1.10.0
refs/tags/v1.10.0-rc.1
refs/tags/v1.2.0
```
가벼운 태그 `v0.9.0`과 `nightly`는 가지 않았다. 필요한 태그는 `git push origin v0.9.0`처럼 이름으로 보낸다. `git push --tags`는 개인 표시용까지 모두 보내므로 피한다. 이제 이미 공개한 v1.0.0을 다른 커밋으로 옮겨 보자.
```bash
git push -q origin v0.9.0
git clone -q ../origin.git ../teammate
git tag -f -a v1.0.0 -m "Release 1.0.0 (moved)" HEAD
git push -q -f origin v1.0.0
cd ../teammate && git fetch
git rev-parse --short v1.0.0
git fetch --tags
```
```text
Updated tag 'v1.0.0' (was 263c503)
263c503
From …
 ! [rejected]        v1.0.0     -> v1.0.0  (would clobber existing tag)
```
동료의 평범한 `git fetch`는 아무 말 없이 옛 v1.0.0을 그대로 둔다. `--tags`로 받으려 해야 거부가 보이고, `--force`를 주어야 바뀐다. 같은 이름이 사람마다 다른 커밋을 가리키게 되므로, 공개한 태그는 옮기지 말고 고친 릴리스는 v1.0.1로 낸다.

## 권장 설정과 체크리스트
- 릴리스는 주석 태그(`git tag -a`)로, 이름은 `vMAJOR.MINOR.PATCH`로 통일한다. 서명한 태그는 14편.
- `git config --global push.followTags true`로 주석 태그를 커밋과 함께 보내고, 태그 정렬에는 `versionsort.suffix=-`를 둔다.
- 작업 브랜치는 짧게, 덜 끝난 기능은 플래그 뒤에 두고, 다 쓴 플래그는 지운다.
- 공개한 태그를 옮기거나 지우지 않는다. 태그 push를 릴리스 워크플로의 시작으로 쓰면 태그가 곧 배포 기록이 된다.

## 한계와 버전별 차이
전략 이름은 팀마다 뜻이 조금씩 다르고, 정답은 배포 주기와 지원하는 버전 수가 정한다. 자동 테스트가 약한 팀이 트렁크 기반을 흉내 내면 main이 자주 깨지고, 지우지 않은 플래그가 쌓이면 분기가 코드를 뒤덮는다. 이 글의 실행 결과는 Git 2.43 기준이며, 이미 있는 태그를 `--force` 없이 덮어쓰지 않는 fetch 동작은 최근 Git의 동작이다.

## 어디에 쓰이나
- GitHub 협업과 자동화 9편 「배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스」: 태그 push를 받아 릴리스와 릴리스 노트를 만드는 워크플로가 이 글의 시맨틱 버전 태그 위에서 돈다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 이 사이트가 작업 브랜치는 squash로, 배포 브랜치로는 merge commit으로 합치는 이유를 그래프로 비교한다.
- 레벨 디자인과 콘텐츠 제공 16편 「콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포」: 기능 플래그를 일부 사용자에게만 켜는 단계적 출시가 트렁크 기반 개발에서 덜 끝난 기능을 숨기는 장치와 같다.
- 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」: commit-msg 훅이 Conventional Commits 형식을 커밋 순간에 검사한다.

## 정리
- Git Flow는 main·develop과 release·hotfix 브랜치로 여러 버전을, GitHub Flow는 main 하나와 짧은 PR로 잦은 배포를, 트렁크 기반은 하루 단위 통합과 기능 플래그로 빠른 통합을 노린다.
- Conventional Commits의 `fix`·`feat`·`!`는 PATCH·MINOR·MAJOR에 대응해 다음 버전을 기계로 정하게 한다.
- 주석 태그는 내용 주소로 저장되는 태그 객체이고, `describe`와 `--follow-tags`는 주석 태그만 본다.
- 공개한 태그를 옮기면 동료의 fetch는 조용히 옛 커밋을 유지하므로, 고친 릴리스는 새 버전으로 낸다.

## 더 알아보기
- 이전 글: 10편 「stash, worktree, cherry-pick: 작업을 잠시 두고, 나누고, 옮기기」
- 다음 글: 12편 「큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS」
- Git 문서 git-tag: https://git-scm.com/docs/git-tag
