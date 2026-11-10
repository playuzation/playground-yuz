# [Git 버전 관리 8/14] 되돌리기: restore, reset, revert, reflog

> **한 줄 요약** — 되돌리기 명령은 "작업 트리, 스테이징 영역, 브랜치 포인터 중 어디를 어디로 돌리는가"로 갈리고, 공유하지 않은 커밋은 reset으로 포인터를 옮기며 공유한 커밋은 revert로 반대 커밋을 쌓되, reset으로 잃은 커밋도 reflog에 기록이 남아 되찾을 수 있다.

## 이 글에서 다루는 것
- 상황별 되돌리기 명령과 각각이 바꾸는 영역
- `reset --soft`·`--mixed`·`--hard`를 세 영역 상태로 비교하기
- reflog와 `ORIG_HEAD`로 "잃어버린" 커밋 되찾기
- 병합 커밋 되돌리기(`revert -m 1`)와 다시 병합할 때의 함정

## 문제: "되돌려 줘"에는 뜻이 여러 개다
파일 하나의 실수를 버리고 싶은지, `git add`만 취소하고 싶은지, 커밋을 없애고 싶은지, 이미 push한 커밋의 효과만 지우고 싶은지에 따라 맞는 명령이 다르다. 잘못 고르면 커밋하지 않은 작업이 영영 사라지거나(reset `--hard`), 공유한 이력을 고쳐 동료와 갈라진다(7편). 판단 기준은 두 가지다. 어느 영역을 바꾸는가, 그리고 그 커밋을 남이 이미 가졌는가.

## 원리: 세 영역과 브랜치 포인터
2편의 세 영역(작업 트리, 스테이징 영역, 저장소)과 4편의 "브랜치는 커밋을 가리키는 포인터"를 떠올리면 명령들이 정리된다.

| 상황 | 명령 | 바뀌는 곳 |
| --- | --- | --- |
| 수정한 파일 버리기 | `restore 파일` | 작업 트리 |
| `add` 취소 | `restore --staged` | 스테이징 영역 |
| 마지막 커밋 고치기 | `commit --amend` | 새 커밋으로 교체 |
| 로컬 커밋 없애기 | `reset` | 브랜치 포인터(+영역) |
| 공유한 커밋 취소 | `revert` | 반대 커밋 추가 |

reset은 브랜치 포인터를 옮기는 명령이고, 모드에 따라 나머지 두 영역을 어디까지 따라 맞출지가 다르다.

| 모드 | 바뀌는 곳 | 그대로 남는 것 |
| --- | --- | --- |
| `--soft` | 브랜치 | 스테이징·작업 트리 |
| `--mixed`(기본) | 브랜치·스테이징 | 작업 트리 |
| `--hard` | 셋 모두 | 없음 |

## 따라 하기: restore와 amend
파일별로 커밋 네 개를 만들고 시작한다. 해시와 시각은 여러분의 환경에서 다르게 나온다.
```bash
git init -q shop && cd shop
for f in readme login pay search; do
  echo "$f" > $f.txt && git add $f.txt && git commit -qm "$f 추가"
done
echo "실수" >> pay.txt
git status -s
git restore pay.txt
git status -s && cat pay.txt
```
```text
 M pay.txt
pay
```
`git status -s`의 두 칸 중 앞 칸은 스테이징 영역, 뒤 칸은 작업 트리의 상태다. `restore`가 작업 트리의 pay.txt를 스테이징 영역의 내용으로 덮어써 수정이 사라졌다. 이 수정은 커밋된 적이 없으므로 어디에도 남지 않는다. 이번에는 스테이징까지 한 뒤 취소한다.
```bash
echo "할인" >> pay.txt && git add pay.txt
git status -s
git restore --staged pay.txt
git status -s
git restore pay.txt
```
```text
M  pay.txt
 M pay.txt
```
`M `(스테이징됨)이 ` M`(작업 트리에만 있음)으로 바뀌었다. `--staged`는 스테이징 영역만 HEAD 내용으로 돌리고 작업 트리의 수정은 남긴다. `git restore --source=HEAD~2 pay.txt`처럼 출처를 주면 옛 커밋의 파일을 꺼내 올 수도 있다.

마지막 커밋의 메시지를 고치거나 빠뜨린 파일을 넣을 때는 `--amend`다. 커밋을 수정하는 것이 아니라 새 커밋으로 바꿔 끼우므로 해시가 바뀐다(6편과 같은 원리).
```bash
git log --oneline -1
git commit -q --amend -m "검색 기능 추가"
git log --oneline -1
```
```text
b1cd108 search 추가
63876d1 검색 기능 추가
```

## 따라 하기: reset의 세 모드
마지막 커밋을 세 모드로 각각 되돌려 보고, 매번 `ORIG_HEAD`로 원상 복구한다. reset은 옮기기 전의 HEAD를 `ORIG_HEAD`에 적어 둔다.
```bash
state() { echo "[$1] HEAD: $(git log -1 --format=%s)"; git status -s; }
git reset --soft HEAD~1 && state soft
git reset -q --hard ORIG_HEAD
git reset -q --mixed HEAD~1 && state mixed
git reset -q --hard ORIG_HEAD
git reset --hard HEAD~1 && state hard
ls
```
```text
[soft] HEAD: pay 추가
A  search.txt
[mixed] HEAD: pay 추가
?? search.txt
HEAD is now at 43b70a6 pay 추가
[hard] HEAD: pay 추가
login.txt
pay.txt
readme.txt
```
세 경우 모두 HEAD는 "pay 추가"로 돌아갔다. `--soft`는 커밋만 취소해 search.txt가 스테이징된 채(`A `) 남았다. 커밋 여러 개를 하나로 다시 커밋할 때 쓴다. `--mixed`는 스테이징도 비워 search.txt가 추적되지 않는 파일(`??`)이 되었다. `--hard`는 작업 트리까지 맞춰서 search.txt가 사라졌다.

## reflog: 잃어버린 커밋 되찾기
`--hard`로 없앤 "검색 기능 추가" 커밋은 어떤 브랜치에서도 닿지 않지만 객체는 남아 있다. **reflog**는 HEAD와 브랜치가 언제 어디로 움직였는지 적은 로컬 기록이다.
```bash
git reflog -3
```
```text
43b70a6 HEAD@{0}: reset: moving to HEAD~1
63876d1 HEAD@{1}: reset: moving to ORIG_HEAD
43b70a6 HEAD@{2}: reset: moving to HEAD~1
```
reset과 복구를 오가며 HEAD가 움직인 순간이 모두 적혔다. `HEAD@{1}`이 마지막 reset 직전, 즉 "검색 기능 추가"다. 정말로 reflog만 이 커밋을 붙잡고 있는지 확인해 보자. `git fsck --unreachable --no-reflogs`는 reflog를 빼고 볼 때 닿지 않는 객체를 보여 준다.
```bash
git fsck --unreachable --no-reflogs 2>/dev/null | grep commit
git reset --hard HEAD@{1}
```
```text
unreachable commit 63876d16e9613f26bf2e75e81f9c63ed53f7d7da
unreachable commit b1cd1080eb4a76c774ed6436e4854124c05a5d27
HEAD is now at 63876d1 검색 기능 추가
```
amend 전의 "search 추가"까지 함께 보인다. 둘 다 reflog를 빼면 고아인 커밋이다. reflog 항목은 기본적으로 닿을 수 있는 것은 90일(`gc.reflogExpire`), 닿을 수 없는 것은 30일(`gc.reflogExpireUnreachable`)이 지나면 정리되고, 그 뒤 `git gc`가 객체를 지운다. 기간 안이라면 `git branch rescue <해시>`로 이름을 붙여 살려 둘 수 있다. 반면 한 번도 커밋하지 않은 작업 트리의 수정은 reflog에도 없다. `reset --hard` 전에는 `git status`를 보고, 아까운 변경은 커밋하거나 stash(10편)한다.

## revert: 공유한 커밋은 반대 커밋으로
이미 push한 "pay 추가"를 없애야 한다면 reset으로 이력을 고치는 대신, 그 변경을 거꾸로 적용한 새 커밋을 쌓는다. 이력은 그대로이므로 동료는 평소처럼 pull하면 된다.
```bash
git revert --no-edit HEAD~1 >/dev/null
git log --oneline -3 && ls
```
```text
c81c0c0 Revert "pay 추가"
63876d1 검색 기능 추가
43b70a6 pay 추가
login.txt
readme.txt
search.txt
```

### 병합 커밋 되돌리기와 함정
병합 커밋은 부모가 둘이라 "어느 쪽 기준으로 되돌릴지"를 `-m`으로 알려 줘야 한다. 쿠폰 기능을 병합했다가 문제가 생겼다고 하자.
```bash
git switch -qc coupon
echo "RATE=10" > coupon.txt && git add coupon.txt && git commit -qm "쿠폰 추가"
git switch -q main && git merge -q --no-ff --no-edit coupon
git revert HEAD
```
```text
error: commit 9802fafb7b793cf65af3afa56305eb2f82454504 is a merge but no -m option was given.
fatal: revert failed
```
`-m 1`은 첫째 부모(병합할 때 서 있던 main) 쪽을 기준선으로 삼아, 둘째 부모 쪽에서 들어온 변경을 취소하라는 뜻이다.
```bash
git revert -m 1 --no-edit HEAD >/dev/null
git log --oneline -1 && ls
```
```text
80972fd Revert "Merge branch 'coupon'"
login.txt
readme.txt
search.txt
```
함정은 그다음이다. coupon 브랜치에서 버그를 고치고 다시 병합하면, Git은 "쿠폰 추가"는 이미 병합된 커밋으로 보고 새 수정만 가져온다. 되돌린 쿠폰 기능은 돌아오지 않는다.
```bash
git switch -q coupon
echo "test" > coupon_test.txt && git add coupon_test.txt
git commit -qm "쿠폰 테스트 추가"
git switch -q main && git merge -q --no-edit coupon && ls
```
```text
coupon_test.txt
login.txt
readme.txt
search.txt
```
coupon_test.txt만 들어오고 coupon.txt는 없다. 기능을 되살리려면 "되돌리기를 되돌린다".
```bash
git revert --no-edit HEAD^1 >/dev/null && ls
```
```text
coupon.txt
coupon_test.txt
login.txt
readme.txt
search.txt
```
`HEAD^1`은 방금 병합의 첫째 부모, 즉 앞서 만든 Revert 커밋이다. 병합 커밋을 되돌렸다면 그 사실을 팀에 알리고, 다시 병합할 때 이 순서를 지켜야 한다.

## 흔한 실수와 문제 해결
- push한 커밋을 reset·amend했다: 다시 올리려면 강제 push가 필요하다(7편). 공유 브랜치라면 reset을 무르고(`git reset --hard ORIG_HEAD` 또는 reflog) revert로 바꾼다.
- `error: commit … is a merge but no -m option was given.`: 병합 커밋이다. 대개 `-m 1`이 맞다.
- reset `--hard`는 추적되지 않는 파일을 지우지 않는다. 그것까지 지우려면 `git clean -n`으로 목록을 먼저 보고 `git clean -f`.
- 예전 글의 `git checkout -- 파일`은 `git restore 파일`과 같다. 브랜치 전환과 파일 복원이 한 명령에 섞여 있던 것을 2.23에서 `switch`와 `restore`로 나눴다.

## 권장 설정과 체크리스트
- 위험한 작업 전에 `git branch backup`으로 현재 위치에 이름을 붙여 두면 reflog를 뒤질 필요가 없다.
- reflog는 작업 트리가 있는 저장소에서 기본으로 켜져 있다(`core.logAllRefUpdates`). 오래 보관하려면 `gc.reflogExpire`를 늘린다.
- 공유한 커밋은 revert, 나만 가진 커밋은 reset·amend. 헷갈리면 revert가 안전하다.

## 한계와 버전별 차이
- 이 글의 실행 결과는 Git 2.43 기준이다. `restore`와 `switch`는 2.23에 실험적 명령으로 들어왔다.
- reflog는 로컬에만 있다. push되지 않고 clone한 저장소에는 없으므로, 다른 사람이 잃은 커밋은 그 사람의 reflog에서 찾아야 한다.
- revert는 효과만 지울 뿐 이력에서 내용을 지우지 않는다. 비밀 값을 커밋했다면 키 폐기와 이력 재작성이 필요하다(14편).

## 어디에 쓰이나
- 언어 기초 8편 「자바와 JVM: 한 번 작성하면 어디서나 실행」: `git gc`는 브랜치·태그·reflog라는 루트에서 닿지 않는 객체를 지우므로, 참조되지 않는 객체를 회수하는 가비지 컬렉터와 원리가 같다.
- 6편 「리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙」: 잘못된 리베이스도 `ORIG_HEAD`와 reflog로 리베이스 전 커밋으로 돌아간다.
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 병합된 PR을 되돌리는 것은 이 글의 병합 커밋 revert와 같고, 다시 병합할 때의 함정도 같다.

## 정리
- 작업 트리는 `restore`, 스테이징 영역은 `restore --staged`, 마지막 커밋은 `--amend`로 고친다.
- reset은 브랜치 포인터를 옮긴다. `--soft`는 스테이징을, `--mixed`는 작업 트리를 남기고, `--hard`는 모두 맞춘다.
- 커밋은 reflog에 남아 기간 안이라면 되찾을 수 있지만, 커밋하지 않은 수정은 남지 않는다.
- 공유한 커밋은 revert로 되돌리고, 병합 커밋은 `-m 1`로 되돌린 뒤 다시 병합할 때 revert를 되돌린다.

## 더 알아보기
- 이전 글: 7편 「원격 저장소: clone, fetch, pull, push와 추적 브랜치」
- 다음 글: 9편 「이력 탐색과 디버깅: log 필터, blame, bisect」
- Git 공식 문서 git-reset: https://git-scm.com/docs/git-reset
