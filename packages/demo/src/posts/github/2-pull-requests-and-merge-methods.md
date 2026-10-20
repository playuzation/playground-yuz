# [GitHub 협업과 자동화 2/12] 풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식

> **한 줄 요약** — 풀 리퀘스트는 head 브랜치를 base 브랜치에 넣자는 제안이고, 병합 버튼의 세 방식(merge commit, squash and merge, rebase and merge)은 최종 파일 내용은 같게 만들지만 기준 브랜치에 남는 커밋과 해시가 달라서, 브랜치의 수명에 맞춰 골라야 뒤탈이 없다.

## 이 글에서 다루는 것
- PR의 구성: base와 head, 초안, 리뷰어, 연결된 이슈, 포크 모델과 공유 저장소 모델
- 세 가지 병합 방식을 로컬 Git으로 재현해 그래프와 트리 해시 비교하기
- squash 뒤에 생기는 문제: 지워지지 않는 브랜치, 다시 나타나는 커밋과 충돌
- 이 사이트 저장소처럼 브랜치마다 방식을 다르게 쓰는 이유와 고르는 기준

## 문제: 같은 PR, 다른 이력
PR 화면의 초록 버튼 옆 화살표를 누르면 병합 방식을 고를 수 있다. 무엇을 고르든 PR은 "Merged"가 되지만, 어떤 팀은 squash 뒤에 로컬 브랜치가 안 지워진다고 하고, 어떤 팀은 다음 PR에 이미 넣은 커밋이 또 보인다고 한다. 원인은 방식마다 기준 브랜치에 만들어지는 커밋 객체가 다르기 때문이다. Git의 병합 자체(merge base, 3-way 병합, 충돌)는 Git 버전 관리 5편에서 다뤘으니 여기서는 GitHub 버튼이 어떤 Git 동작에 해당하는지를 본다.

## PR의 구성
**풀 리퀘스트**(pull request)는 "head 브랜치의 변경을 base 브랜치에 병합하자"는 제안에 토론·리뷰·검사 결과를 묶은 것이다. 구성 요소는 다음과 같다.
- base와 head: 병합될 쪽과 변경이 있는 쪽. 포크에서 보낸 PR이면 head는 다른 저장소의 브랜치다.
- 제목과 설명: 무엇을 왜 바꿨는지. 설명에 `Closes #12`를 쓰면 병합 때 이슈가 닫히는데, PR이 기본 브랜치를 향할 때만 동작한다(4편).
- **초안**(draft): 병합할 수 없고 코드 소유자에게 리뷰 요청이 가지 않는다. 작업 중인 내용을 공유할 때 쓴다.
- 리뷰어, 담당자, 라벨, 그리고 CI 검사 결과(3편, 6편).

협업 방식은 두 가지다. **포크 모델**(fork and pull)은 원본 저장소를 내 계정으로 복제(fork)해 거기에 push하고 원본으로 PR을 보낸다. 쓰기 권한 없이 기여할 수 있어 오픈 소스에서 흔하다. 포크와 원본은 Git 데이터를 공유하므로 포크에 올린 내용은 원본 쪽에서도 접근할 수 있다는 점을 기억한다. **공유 저장소 모델**은 팀원 모두가 한 저장소에 쓰기 권한을 갖고 주제 브랜치를 만들어 PR을 연다. 사내 팀은 대부분 이쪽이다. 흐름을 명령으로 쓰면 다음과 같다(GitHub에 쓰는 명령이라 실행하지 않은 예시다).
```sh
git switch -c feat/like-button
git push -u origin feat/like-button
gh pr create --base main --title "좋아요 버튼" --body "Closes #12"
gh pr merge --squash --delete-branch
```
GitHub는 PR마다 읽기 전용 참조 `refs/pull/<번호>/head`를 만들어 둔다. 리뷰어는 `git fetch origin pull/12/head:pr-12`로 남의 PR을 로컬 브랜치로 받아 실행해 볼 수 있다.

## 원리: 버튼 셋, Git 동작 셋
| 방식 | 기준 브랜치에 생기는 것 | 원래 커밋 |
|---|---|---|
| Create a merge commit | PR 커밋 전부 + 병합 커밋 | 그대로 남음 |
| Squash and merge | 변경을 합친 커밋 하나 | 남지 않음 |
| Rebase and merge | PR 커밋을 하나씩 다시 만듦 | 새 해시 |

공식 문서에 따르면 기본 병합은 `git merge --no-ff`처럼 fast-forward가 가능해도 병합 커밋을 만들고, 나머지 둘은 결과를 fast-forward로 붙인다. GitHub의 rebase and merge는 로컬 `git rebase`와 조금 다르다. 항상 커미터 정보를 바꿔 새 해시를 만들고, 원래부터 빈 커밋은 버리며, GitHub가 남의 서명 키를 갖고 있지 않으므로 커밋 서명 검증이 사라진다. squash 커밋의 기본 메시지는 PR 커밋이 하나면 그 커밋의 메시지, 둘 이상이면 PR 제목과 커밋 목록이고 저장소 설정에서 바꿀 수 있다.

## 따라 하기: 세 방식을 로컬에서 재현
PR 브랜치에 커밋 셋을 쌓는 동안 main에도 다른 커밋이 들어온 흔한 상황을 만든다(해시와 시각은 여러분의 환경에서 다르게 나온다).
```bash
git init -q demo && cd demo
echo "title" > post.txt
git add post.txt && git commit -qm "글 본문"
git switch -qc feat/like-button
echo "like: 0" > like.txt
git add like.txt && git commit -qm "좋아요 수 저장"
echo "buton" >> like.txt && git commit -qam "좋아요 버튼"
sed -i 's/buton/button/' like.txt && git commit -qam "오타 수정"
git switch -q main
echo "comments" > comment.txt
git add comment.txt && git commit -qm "댓글 기능"
git log --oneline --graph --decorate --all
```
```text
* 33169ba (HEAD -> main) 댓글 기능
| * 24996fc (feat/like-button) 오타 수정
| * 6e6e1ec 좋아요 버튼
| * 2eecc1e 좋아요 수 저장
|/
* b5a9156 글 본문
```
이제 main을 세 갈래로 복사해 각 버튼과 같은 Git 명령을 실행한다. 병합 커밋 메시지는 예시다.
```bash
git branch via-merge main && git branch via-squash main
git branch via-rebase feat/like-button
git switch -q via-merge
git merge -q --no-ff feat/like-button -m "Merge pull request #12"
git switch -q via-squash
git merge -q --squash feat/like-button
git commit -qm "좋아요 버튼 (#12)"
git switch -q via-rebase
git rebase -q main
for b in via-merge via-squash via-rebase; do
  echo "== $b"; git log --oneline --graph $b
done
```
```text
Automatic merge went well; stopped before committing as requested
Squash commit -- not updating HEAD
== via-merge
*   361edda Merge pull request #12
|\
| * 24996fc 오타 수정
| * 6e6e1ec 좋아요 버튼
| * 2eecc1e 좋아요 수 저장
* | 33169ba 댓글 기능
|/
* b5a9156 글 본문
== via-squash
* ffb7ca2 좋아요 버튼 (#12)
* 33169ba 댓글 기능
* b5a9156 글 본문
== via-rebase
* 01e92b8 오타 수정
* 9a34e6d 좋아요 버튼
* 8da7b22 좋아요 수 저장
* 33169ba 댓글 기능
* b5a9156 글 본문
```

## 검증: 내용은 같고 이력만 다르다
세 브랜치의 최종 트리 해시와, main 뒤에 붙은 커밋 수, 원래 PR 커밋이 이력에 남았는지를 확인한다.
```bash
git rev-parse via-merge^{tree} via-squash^{tree} via-rebase^{tree} \
  | cut -c1-7
for b in via-merge via-squash via-rebase; do
  n=$(git rev-list --count main..$b)
  git merge-base --is-ancestor feat/like-button $b && k=예 || k=아니오
  echo "$b: 추가 커밋 $n개, 원래 커밋 보존 $k"
done
```
```text
7e8a142
7e8a142
7e8a142
via-merge: 추가 커밋 4개, 원래 커밋 보존 예
via-squash: 추가 커밋 1개, 원래 커밋 보존 아니오
via-rebase: 추가 커밋 3개, 원래 커밋 보존 아니오
```
트리 해시가 셋 다 같으니 파일 내용은 완전히 같다. 다른 것은 이력이다. squash와 rebase는 원래 커밋을 이력에 남기지 않으므로 Git은 PR 브랜치가 병합되었는지 알 수 없다. 그래서 다음 오류가 난다.
```bash
git switch -q via-squash
git branch -d feat/like-button
```
```text
error: the branch 'feat/like-button' is not fully merged.
If you are sure you want to delete it, run 'git branch -D feat/like-button'
```
PR이 병합된 것을 화면에서 확인했다면 `git branch -D`로 지우고, `git fetch --prune`으로 사라진 원격 브랜치의 추적 참조도 정리한다. 저장소 설정의 **Automatically delete head branches**를 켜면 병합 직후 GitHub 쪽 head 브랜치가 지워진다(PR 화면에서 복구 가능). 로컬 브랜치는 여전히 직접 지워야 한다.

## 이 사이트 저장소의 예: 브랜치마다 다른 방식
이 사이트를 만드는 저장소는 작업 브랜치 `feat/*`·`docs/*`를 통합 브랜치 `dev`에 squash로 넣고, `dev`를 배포 브랜치 `main`에 넣을 때는 merge commit을 쓴다. 짧게 사는 작업 브랜치는 한 커밋으로 줄여도 잃을 것이 없지만, 계속 사는 `dev`를 squash로 넣으면 문제가 생긴다. 두 경우를 나란히 재현한다.
```bash
cd .. && git init -q site && cd site
echo "v1" > version.txt && git add . && git commit -qm "초기"
git switch -qc dev
echo "a" > a.txt && git add a.txt && git commit -qm "feat A (#1)"
echo "v2" > version.txt && git commit -qam "feat B (#2)"
git switch -qc main-squash main
git merge -q --squash dev && git commit -qm "release (#3)"
git switch -qc main-merge main
git merge -q --no-ff dev -m "Merge dev (#3)"
git switch -q dev
echo "v3" > version.txt && git commit -qam "feat C (#4)"
echo "== squash로 받은 main에 보낼 PR"
git log --oneline main-squash..dev
echo "== merge commit으로 받은 main에 보낼 PR"
git log --oneline main-merge..dev
```
```text
Squash commit -- not updating HEAD
== squash로 받은 main에 보낼 PR
647b0dd feat C (#4)
1345bc1 feat B (#2)
4889bda feat A (#1)
== merge commit으로 받은 main에 보낼 PR
647b0dd feat C (#4)
```
squash로 받은 쪽은 이미 들어간 A와 B가 다음 PR에 또 나타난다. 병합 기준이 여전히 "초기" 커밋이기 때문이다. 실제로 병합해 보면 같은 줄을 두 번 고친 것으로 보여 충돌한다.
```bash
git switch -q main-squash && git merge dev
```
```text
Auto-merging version.txt
CONFLICT (content): Merge conflict in version.txt
Automatic merge failed; fix conflicts and then commit the result.
```
```bash
git merge --abort
git switch -q main-merge && git merge -q dev && git log --oneline -1
```
```text
6dd07b0 Merge branch 'dev' into main-merge
```
merge commit으로 받은 쪽은 병합 기준이 B로 옮겨졌기 때문에 C만 깔끔하게 들어간다. 공식 문서도 squash 후 같은 head 브랜치로 계속 작업하면 이미 넣은 커밋이 새 PR에 보이고 같은 충돌을 반복해서 풀어야 할 수 있다고 경고한다.

## 고르는 기준과 흔한 실수
| 상황 | 고를 방식 |
|---|---|
| PR 하나가 기능 하나, 중간 커밋이 지저분함 | squash |
| 커밋마다 의미가 있고 선형 이력을 원함 | rebase |
| 오래 사는 브랜치를 넣거나 이력을 보존 | merge commit |

- squash 뒤 같은 브랜치에 커밋을 더해 새 PR을 연다: 병합된 브랜치는 버리고 최신 base에서 새 브랜치를 만든다.
- rebase and merge 버튼이 비활성: 자동으로 리베이스할 수 없는 충돌이 있다. 로컬에서 리베이스하고 강제 push한다(Git 버전 관리 6편).
- 서명된 커밋이 필수인 저장소에서 rebase and merge를 쓰면 서명이 사라진다. squash나 merge commit을 고르거나 로컬에서 병합한다.

## 권장 설정과 한계
- 저장소 설정에서 팀이 쓰는 방식만 허용하고 나머지는 끈다. 기본 squash 메시지를 "PR 제목과 설명"으로 두면 설명이 이력에 남는다.
- 작업 브랜치는 짧게 살리고 병합 후 자동 삭제를 켠다. 직접 push와 병합 조건은 5편의 브랜치 보호로 강제한다.
- 머지 큐를 쓰면 병합 방식은 큐 설정이 정한다(5편). 이 글의 실행 결과는 Git 2.43 기준이고, GitHub 서버의 실제 병합 구현과 해시는 다르다.

## 어디에 쓰이나
- Git 버전 관리 5편 「병합: fast-forward, 3-way 병합, 충돌 해결」: 마지막 실습의 충돌은 병합 기준이 옮겨 가지 않아 생긴 전형적인 3-way 충돌이다.
- Git 버전 관리 11편 「브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발」: 작업·통합·배포 브랜치를 어떻게 나누느냐가 여기서 고른 병합 방식과 맞물린다.
- 이산수학 8편 「그래프의 기초: 정점과 간선」: 커밋 이력은 각 커밋이 부모를 가리키는 방향 비순환 그래프이고, 부모가 둘인 정점(병합 커밋)이 없으면 squash·rebase 이력처럼 한 줄 경로가 된다.

## 정리
- PR은 base와 head, 설명, 리뷰, 검사를 묶은 병합 제안이다. 초안은 병합할 수 없고 연결 키워드는 기본 브랜치 대상일 때만 동작한다.
- merge commit은 원래 커밋을 보존하고, squash는 하나로 합치고, rebase는 새 해시로 다시 쌓는다. 최종 트리는 셋 다 같다.
- squash·rebase 뒤에는 Git이 병합 여부를 모르므로 `branch -d`가 거부되고, 같은 브랜치를 계속 쓰면 커밋이 다시 나타나 충돌한다.
- 짧은 작업 브랜치는 squash, 오래 사는 브랜치끼리는 merge commit이 안전하다.

## 더 알아보기
- 이전 글: 1편 「GitHub란: 원격 저장소에서 개발 플랫폼까지」
- 다음 글: 3편 「코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법」
- 병합 방식 설명: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github
