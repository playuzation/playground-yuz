# [GitHub 협업과 자동화 5/12] 브랜치 보호와 규칙 세트: main을 지키는 장치

> **한 줄 요약** — Git은 쓰기 권한만 있으면 무엇이든 push하게 두므로, main을 지키려면 서버가 ref 갱신 요청마다 "PR을 거쳤나, 이 커밋 SHA에 검사 통과 기록이 있나, 이력을 덮어쓰나"를 판정해야 하고, GitHub의 브랜치 보호 규칙과 규칙 세트가 바로 그 판정 목록이다.

## 이 글에서 다루는 것
- 직접 push가 위험한 이유와 서버 쪽 판정의 위치
- 브랜치 보호 규칙과 규칙 세트(rulesets)의 차이
- 로컬 bare 저장소의 pre-receive 훅으로 규칙 다섯 개를 흉내 내 효과 확인
- 따로는 통과하고 합치면 깨지는 PR과 머지 큐
- 이 사이트 저장소에 규칙을 건다면

## 문제: 쓰기 권한은 전부 아니면 전무
Git 자체에는 "main에는 이런 커밋만"이라는 개념이 없다. 쓰기 권한이 있는 사람은 리뷰 안 받은 커밋을 main에 올릴 수 있고, `git push --force`로 남의 커밋을 이력에서 지울 수 있고, 실수로 브랜치를 삭제할 수도 있다. 커밋 전에 검사하는 클라이언트 훅은 `--no-verify` 한 번이면 건너뛴다(Git 버전 관리 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」). 그래서 마지막 관문은 서버에 있어야 한다.

push는 결국 서버에 보내는 "ref를 옛 SHA에서 새 SHA로 바꿔 달라"는 요청이다. 서버는 바꾸기 전에 요청 한 줄마다 판정할 수 있다. Git에서는 이 자리가 pre-receive 훅이고, GitHub에서는 규칙이 이 자리에 앉는다.
```text
git push
 → 요청 한 줄
   <옛 SHA> <새 SHA> <ref 이름>
 → 서버가 규칙으로 판정
   · 삭제? (새 SHA = 0000…)
   · 덮어쓰기? (옛 SHA가 조상 아님)
   · 병합 커밋 포함?
   · 새 SHA에 검사 성공 기록?
 → 모두 통과하면 ref 갱신
```

## 브랜치 보호 규칙과 규칙 세트
GitHub에는 같은 일을 하는 장치가 두 세대 있다. 오래된 **브랜치 보호 규칙**(branch protection rule)과 그 뒤에 나온 **규칙 세트**(ruleset)다. 가장 큰 차이는 겹치는 방식이다. 한 브랜치에는 보호 규칙이 하나만 적용되지만, 규칙 세트는 여러 개가 동시에 적용된다. 규칙 세트에는 우선순위가 없고, 같은 브랜치를 겨냥한 규칙들은 모두 모이며(aggregate), 같은 규칙이 다르게 정의되면 가장 엄격한 쪽이 적용된다. 규칙 세트는 보호 규칙과도 겹쳐 함께 적용된다.

| 항목 | 보호 규칙 | 규칙 세트 |
| --- | --- | --- |
| 한 브랜치에 | 하나만 | 여러 개 집계 |
| 상태 | 켜기, 끄기 | Active, Evaluate, Disabled |
| 우회 | 제한적 | 역할·팀·앱 우회 목록 |
| 범위 | 저장소 | 저장소·조직, 태그도 |

Evaluate 상태는 규칙을 강제하지 않고 "Rule Insights" 화면에 위반이었을 push만 기록하므로 새 규칙을 시험할 때 쓴다(제공 범위는 요금제에 따라 다르다). 공식 문서 기준으로 규칙 세트는 GitHub Free에서는 공개 저장소에, Pro·Team·Enterprise Cloud에서는 비공개 저장소에도 쓸 수 있다. 새로 설정한다면 규칙 세트가 낫다.

주요 규칙과 막는 사고는 이렇다.
- **PR 필수**: 직접 push 금지. 필수 승인 수, 새 커밋이 오면 기존 승인 무효화, 코드 소유자 리뷰(3편), 마지막 push를 다른 사람이 승인 같은 하위 옵션이 있다.
- **필수 상태 검사**: 지정한 검사(CI 잡 이름)가 성공해야 병합. "최신 브랜치로 검사" 옵션은 base의 최신 커밋을 포함한 상태로 다시 검사하게 한다.
- **선형 이력 요구**: 병합 커밋 금지. squash나 rebase 병합만 남는다(2편).
- **강제 push 금지·삭제 금지**: 이력 덮어쓰기와 브랜치 삭제를 막는다.
- **서명된 커밋 요구**, **머지 큐 요구**(아래).

## 따라 하기: pre-receive 훅으로 규칙 흉내 내기
GitHub 서버를 띄울 수는 없으니, 로컬 bare 저장소에 같은 판정을 하는 pre-receive 훅을 건다(실제 GitHub 구현이 훅이라는 뜻은 아니고, 판정 논리를 보기 위한 모형이다). 해시와 시각은 여러분의 환경에서 다르게 나온다. 먼저 서버와 개발자 저장소를 만들고 첫 커밋을 올린다.
```bash
git init -q --bare server.git
git clone -q server.git dev && cd dev
echo v1 > app.txt && git add app.txt
git commit -qm "첫 커밋" && git push -q origin main
```
훅은 main을 향한 요청만 본다. 판정 순서는 우회 → 삭제 → 강제 push → 병합 커밋 → 검사 기록이다. GitHub는 검사 결과를 커밋 SHA에 붙여 저장하므로, 여기서도 서버의 `checks-passed` 파일에 "CI가 성공한 SHA"를 한 줄씩 적는 것으로 흉내 낸다. 우회 권한은 환경 변수 `PUSHER=admin`으로 대신한다.
```bash
cat > ../server.git/hooks/pre-receive <<'EOF'
#!/bin/sh
z=0000000000000000000000000000000000000000; rc=0
while read old new ref; do
  [ "$ref" = refs/heads/main ] || continue
  if [ "$PUSHER" = admin ]; then echo "우회: admin"; continue; fi
  if [ "$new" = $z ]; then echo "✗ 삭제 금지"; rc=1; continue; fi
  if ! git merge-base --is-ancestor $old $new; then
    echo "✗ 강제 push 금지"; rc=1; continue; fi
  if [ -n "$(git rev-list --min-parents=2 $old..$new)" ]; then
    echo "✗ 선형 이력: 병합 커밋 포함"; rc=1; continue; fi
  if ! grep -qx $new checks-passed 2>/dev/null; then
    echo "✗ 필수 검사 ci: $(echo $new | cut -c1-7) 기록 없음"; rc=1; fi
done
exit $rc
EOF
chmod +x ../server.git/hooks/pre-receive
```
이제 main에 바로 push해 본다. 거부 메시지를 그대로 읽어 두자.
```bash
echo v2 > app.txt && git commit -qam "직접 수정"
git push origin main
```
```text
remote: ✗ 필수 검사 ci: cd670f3 기록 없음
To …/server.git
 ! [remote rejected] main -> main (pre-receive hook declined)
error: failed to push some refs to '…/server.git'
```
`remote:`로 시작하는 줄이 서버 판정이고, `[remote rejected]`는 서버가 ref 갱신을 거절했다는 뜻이다. GitHub에서도 같은 자리에 `remote: error: GH006: Protected branch update failed for refs/heads/main.`(보호 규칙)이나 `GH013: Repository rule violations found`(규칙 세트) 같은 줄과 위반한 규칙이 나온다. 정상 경로는 보호되지 않은 브랜치에 올려 CI를 돌리고, 성공한 바로 그 SHA를 main에 올리는 것이다. 이후 시나리오는 결과만 한 줄씩 보이는 함수로 돌린다.
```bash
try() {
  if git push -q origin "$@" 2>err.txt; then echo "허용: $*"
  else echo "거부: $*"; fi
  sed -n 's/^remote: /  /p' err.txt
}
ci_pass() { git rev-parse HEAD >> ../server.git/checks-passed; }
try HEAD:feat/edit
ci_pass && try main
```
```text
허용: HEAD:feat/edit
허용: main
```

## 검증: 규칙마다 일부러 어겨 보기
검사 기록이 있어도 다른 규칙에 걸리는지 하나씩 확인한다. 병합 커밋, 강제 push, 삭제, 그리고 관리자 우회다.
```bash
git switch -qc side && git commit -q --allow-empty -m "곁가지"
git switch -q main && git commit -q --allow-empty -m "본줄기"
git merge -q --no-ff side -m "병합" && ci_pass && try main
git reset -q --hard origin/main
git commit -q --amend -m "고쳐 쓴 커밋" && ci_pass && try --force main
try --delete main
PUSHER=admin try --force main
```
```text
거부: main
  ✗ 선형 이력: 병합 커밋 포함
거부: --force main
  ✗ 강제 push 금지
거부: --delete main
  ✗ 삭제 금지
허용: --force main
  우회: admin
```
둘째 시나리오가 중요하다. `--amend`로 만든 커밋은 검사 기록이 있었지만, 옛 SHA가 새 SHA의 조상이 아니라서(이력 덮어쓰기) 거부되었다. `--force` 없이 보냈다면 서버에 닿기도 전에 클라이언트가 non-fast-forward로 거절했을 것이다(Git 버전 관리 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」). 강제 push 금지는 그 `--force`를 서버에서 막는 규칙이다. 마지막 줄처럼 우회 권한은 모든 규칙을 건너뛰므로 우회 목록은 짧게 둔다. 또 검사 결과가 SHA에 붙으므로, PR 브랜치를 리베이스하거나 amend하면 이전 성공 기록이 따라오지 않아 검사를 다시 기다려야 한다.

## 따로는 통과, 합치면 실패: 머지 큐가 푸는 문제
필수 검사는 PR 브랜치에서 돌았다. 그런데 그 사이 main이 앞으로 갔다면? 텍스트 충돌이 없어도 의미가 충돌할 수 있다. PR A는 함수 이름을 바꾸고, PR B는 옛 이름을 부르는 새 파일을 더한다.
```bash
cd .. && git init -q mq && cd mq
echo 'greet() { echo "hi $1"; }' > lib.sh
printf '. ./lib.sh\ngreet kim\n' > app-main.sh
echo 'for f in app-*.sh; do bash "$f" || exit 1; done' > test.sh
git add . && git commit -qm base
git switch -qc pr-a && sed -i 's/greet/hello/' lib.sh app-main.sh
git commit -qam "greet → hello" && bash test.sh
git switch -q main && git switch -qc pr-b
printf '. ./lib.sh\ngreet lee\n' > app-extra.sh
git add . && git commit -qm "extra" && bash test.sh
git switch -q main && git merge -q pr-a && git merge -q pr-b -m m
bash test.sh
```
```text
hi kim
hi lee
hi kim
app-extra.sh: line 2: greet: command not found
```
첫 줄은 PR A, 다음 두 줄은 PR B의 검사 결과다. 두 PR은 각자 검사를 통과했고 Git도 충돌 없이 합쳤지만, 합친 main은 깨졌다. "최신 브랜치로 검사" 옵션을 켜면 B는 A가 들어간 main을 합친 뒤 다시 검사받아야 해서 이 문제를 잡는다. 대신 PR이 많은 저장소에서는 하나가 병합될 때마다 나머지가 모두 갱신·재검사를 기다리는 줄 서기가 된다.

**머지 큐**(merge queue)는 이 줄 서기를 자동화한다. 병합하려는 PR을 큐에 넣으면 GitHub가 `gh-readonly-queue/main/…` 접두사의 임시 브랜치에 "main + 앞선 PR들 + 이 PR"을 만들어 검사하고, 통과하면 병합하고 실패하면 그 PR을 큐에서 뺀다. Actions로 필수 검사를 돌린다면 워크플로에 `merge_group` 이벤트를 추가해야 큐의 임시 브랜치에서도 검사가 보고된다(6편). 머지 큐는 2023년 7월 정식 출시되었고, 조직이 소유한 공개 저장소와 GitHub Enterprise Cloud를 쓰는 조직의 비공개 저장소에서 쓸 수 있다.

## 이 사이트 저장소에 규칙을 건다면
이 사이트를 만드는 저장소는 "main·dev에 직접 push하지 않는다"를 약속으로만 지킨다. 규칙 세트로 강제한다면 대상은 main과 dev, 규칙은 PR 필수(혼자 쓰는 저장소라면 승인 수 0), 필수 상태 검사(CI의 verify·e2e 잡), 강제 push 금지 정도가 된다. 두 가지는 기존 흐름과 부딪힌다. dev→main은 merge commit으로 합치므로 main에는 선형 이력 요구를 걸 수 없다. 또 병합 후 dev를 지웠다가 main에서 다시 만드는 절차를 쓰므로, dev에 삭제 금지를 걸려면 그 절차부터 바꿔야 한다. 규칙은 팀의 병합 방식과 함께 설계해야 한다는 예다. 웹에서는 Settings → Rules → Rulesets에서 만들고, API로는 JSON을 보낸다(형태만 보이는 예시).
```sh
gh api repos/example-org/example-app/rulesets --input ruleset.json
```
```json
{
  "name": "protect-main-dev",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/heads/main", "refs/heads/dev"], "exclude": []}},
  "rules": [
    {"type": "non_fast_forward"},
    {"type": "pull_request", "parameters": {"required_approving_review_count": 0,
      "dismiss_stale_reviews_on_push": true, "require_code_owner_review": false,
      "require_last_push_approval": false, "required_review_thread_resolution": false}},
    {"type": "required_status_checks", "parameters": {"strict_required_status_checks_policy": false,
      "required_status_checks": [{"context": "verify (deps · typecheck · unit · build)"},
        {"context": "e2e (Playwright · Chromium)"}]}}
  ]
}
```
`context`에는 검사 이름, 즉 워크플로 잡의 `name:` 값이 그대로 들어간다(이 저장소의 잡 이름을 넣었다). 그래서 잡 `name:`을 바꾸면 필수 검사가 영원히 "대기 중"으로 남는 사고가 난다. 잡 이름은 규칙과 한 묶음으로 바꾼다.

## 흔한 실수와 문제 해결
- **필수 검사가 대기 중(Pending)에서 멈춤**: 검사 이름이 바뀌었거나, 워크플로의 `paths` 필터 때문에 그 PR에서는 워크플로 자체가 돌지 않은 경우다(건너뛴 워크플로의 검사는 대기 상태로 남는다). 이름을 맞추거나 필터 대신 잡 안에서 건너뛰게 한다.
- **승인 후 커밋을 더했더니 승인이 사라짐**: "새 커밋 시 승인 무효화"가 켜진 정상 동작이다.
- **머지 큐에서 검사가 안 돎**: 워크플로에 `merge_group` 트리거가 없다.
- **관리자는 되는데 나는 안 됨**: 우회 목록 차이다. 관리자도 규칙을 따르게 하는 편이 사고를 줄인다.

## 어디에 쓰이나
- Git 버전 관리 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」: 이 글의 모형은 그 글의 서버 훅을 GitHub 규칙의 판정 순서대로 확장한 것이다.
- 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 선형 이력 요구는 허용되는 병합 방식을 squash·rebase로 좁힌다.
- 레벨 디자인과 콘텐츠 제공 16편 「콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포」: 데이터 검증기를 빌드마다 돌리는 원칙을 저장소 차원에서 강제하는 장치가 필수 상태 검사다.

## 정리
- push는 ref 갱신 요청이고, 서버가 요청마다 규칙을 판정해야 main을 지킬 수 있다.
- 규칙 세트는 여러 개가 겹쳐 가장 엄격한 쪽이 적용되고, Evaluate로 먼저 시험할 수 있다.
- 검사 결과는 커밋 SHA에 붙으므로 리베이스·amend 뒤에는 다시 검사받아야 한다.
- 따로 통과한 PR도 합치면 깨질 수 있고, "최신 브랜치로 검사"와 머지 큐가 이를 막는다.

## 더 알아보기
- 이전 글: 4편 「이슈와 프로젝트: 할 일을 추적하고 계획하기」
- 다음 글: 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」
- GitHub Docs, About rulesets: docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
