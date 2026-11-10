# [AI 시대의 소프트웨어 부채 9/10] 의도 부채 2: 의도를 기록하는 도구들

> **한 줄 요약** — 의도를 담는 ADR·명세·에이전트 지침 파일·인수 테스트·커밋 메시지는 그릇마다 담기 좋은 것과 낡는 방식이 다르므로, 무엇을 어디에 적을지 고르고 기록과 테스트를 ID로 이어 끊어지거나 낡은 고리를 기계가 찾게 해야 한다.

## 이 글에서 다루는 것
- 의도를 담는 그릇의 지도: 무엇을 담고 어떻게 낡나
- ADR: 맥락·결정·결과, 대체된 결정도 남기기
- 명세 주도 개발(Kiro, Spec Kit)과 명세가 코드와 어긋나는 문제
- 에이전트 지침 파일, 인수 테스트, 커밋 메시지
- 실행 예: 결정 ID와 테스트를 잇는 추적성 검사기, 기록할 것과 안 할 것

## 그릇의 지도
Storey(2026)가 꼽은 의도의 그릇(요구사항, ADR, 구현 계획, 인수 테스트, 명세, 도메인 모델, AI용 맥락 산출물)은 담기 좋은 것도, 낡는 방식도 다르다. 아래 표는 이 글의 정리다.

| 그릇 | 담기 좋은 것 | 낡는 방식 |
|---|---|---|
| ADR | 결정, 버린 대안, 결과 | 새 기록으로 대체 |
| 명세 | 한 기능의 목표·요구 | 코드가 바뀌면 어긋남 |
| 지침 파일 | 관례, 금지, 그 이유 | 낡아도 매 세션 읽힘 |
| 인수 테스트 | 지켜야 할 동작 | 실행할 때마다 확인됨 |
| 커밋·PR | 변경 하나의 이유 | 고정됨, 이력에 묶임 |

## ADR: 결정 하나를 한 장에
**아키텍처 결정 기록**(architecture decision record, ADR)은 Michael Nygard가 2011년 11월 15일 블로그 글 「Documenting Architecture Decisions」에서 제안한 형식이다. 짧은 문서 하나에 결정 하나를 담고 제목, 상태, 맥락, 결정, 결과로 나눈다. 맥락에는 결정을 압박한 힘(기술적·정치적·사회적인 것 등)을, 결과에는 나쁜 결과까지 모두 적는다. 상태는 제안이나 승인으로 시작해, 나중에 폐기되거나 다른 결정으로 대체되면 그렇게 표시하고 새 기록을 가리킨다. 대체된 ADR을 지우지 않는 것이 핵심이다. "그 대안은 왜 버렸지?"에 답하는 것이 바로 그 옛 기록이다.

ADR이 의도 부채에 잘 맞는 이유는 Storey가 코드에서 되찾을 수 없다고 한 것(버린 대안, 가정, 제약)을 정면으로 겨냥하기 때문이다. 저장소 안에 번호를 붙여 두고 코드와 같은 PR에서 리뷰하면 기록과 코드가 함께 움직인다. 아래는 8편의 4시간 규칙을 적은 ADR이다.
```markdown
# 파일: decisions/D-12.md
# D-12 영업일은 04:00에 바뀐다
상태: 승인 (D-07을 대체)
## 맥락
정산 시스템이 04:00에 하루를 끊고, 새벽 배송 마감은 03:59다.
검토한 대안: 정산을 자정 기준으로 바꾸기(외부 시스템이라 불가).
## 결정
주문의 영업일은 주문 시각에서 4시간을 뺀 날짜로 정한다.
## 결과
자정~03:59 주문은 전날 매출이 된다. 화면의 날짜와 다를 수 있다.
```

## 명세 주도 개발과 어긋남
**명세 주도 개발**(spec-driven development)은 코딩 에이전트에게 바로 코드를 시키지 않고 명세, 계획, 작업 목록을 먼저 만든 뒤 그것을 따라 구현하게 하는 방식이다. 대표 도구가 둘 있다.
- AWS의 Kiro: 2025년 7월 14일 공개 프리뷰로 나온 에이전트 IDE다. 기능마다 `requirements.md`(EARS(Easy Approach to Requirements Syntax) 표기의 요구사항), `design.md`(설계), `tasks.md`(구현 작업 목록)를 만들어 차례로 승인한 뒤 작업 단위로 구현한다. 코딩 관례를 담는 steering 파일도 있다.
- GitHub의 Spec Kit: 2025년 9월 2일 GitHub 블로그로 공개된 오픈 소스(MIT 라이선스) 도구다. `specify` CLI를 설치하고 에이전트 안에서 `/specify`, `/plan`, `/tasks` 같은 명령으로 명세, 기술 계획, 작업을 차례로 만든 뒤 구현한다. 프로젝트가 양보하지 않을 원칙을 담는 constitution 파일도 둔다. 명령 이름은 버전에 따라 바뀌었다.

명세는 의도를 코드보다 먼저 쓰게 하므로 의도 부채를 줄이는 방향이다. 문제는 그다음이다. Birgitta Böckeler는 2025년 10월 15일 글에서 명세 주도 개발을 세 수준으로 나눴다. 작업 전에 명세를 쓰는 spec-first, 작업 뒤에도 명세를 유지하며 기능을 발전시키는 spec-anchored, 사람은 명세만 고치고 코드는 거기서 만들어지는 spec-as-source다. 그가 살펴본 방식은 모두 spec-first였고, 모두가 그 너머를 목표로 하지는 않았다. 명세가 변경 하나를 위해 쓰이고 그 뒤로 관리되지 않으면 코드가 바뀔 때마다 명세와 코드가 어긋난다(drift). Storey의 정의에서 "침식"이 이것이고, 낡은 명세는 다음 에이전트에게 틀린 의도를 건넨다. 그래서 오래 살아야 할 부분(왜 필요한지, 지킬 제약)은 ADR이나 인수 테스트로 옮기고, 한 번 쓰고 끝낼 작업 목록과 구분하는 편이 낫다.

## 에이전트 지침 파일: 매 세션 읽히는 의도
에이전트는 세션을 시작할 때 저장소의 정해진 파일을 읽는다. AGENTS.md는 OpenAI가 2025년 8월에 내놓은 관례로, 스키마나 필수 항목이 없는 마크다운 파일이다. 2025년 12월 9일 리눅스 재단이 Agentic AI Foundation(AAIF)을 출범시킬 때 MCP, goose와 함께 창립 프로젝트가 되었고, 재단 발표로는 6만 개 넘는 오픈 소스 프로젝트와 에이전트 프레임워크가 채택했다. Claude Code의 CLAUDE.md, Kiro의 steering 파일도 같은 자리를 차지한다. 채택이 곧 효과는 아니라는 점은 재단 쪽 글도 짚는다.

Osmani(2026)의 말대로 에이전트가 매 세션 맥락 없이 출근한다면, 지침 파일은 에이전트가 매일 아침 읽는 인수인계서다. 그래서 규칙만이 아니라 이유를 적어야 한다. 이유가 있으면 규칙이 예상하지 못한 상황에서도 무엇이 맞는지 추론할 수 있다(논리적 주장이고 실험으로 확인된 것은 아니다). 예로 이 글이 실린 사이트를 만드는 저장소의 지침 파일을 구조만 옮겨 보자.
- 맨 앞에 진짜 목적: 사용자에게 로컬 브라우저나 터미널이 없으니 에이전트가 스크린샷, CI 결과 같은 증거를 만들어 보내야 한다. 검증 규칙 대부분이 여기서 나온다.
- 규칙 옆에 이유: 테스트 도구 버전 고정에 "컨테이너의 브라우저와 맞는 버전"이라는 이유와 올릴 때 함께 바꿀 설정을 붙인다.
- 이유가 다른 곳에 있으면 가리킨다: 인증 방식을 정한 이유는 해당 코드의 주석을 보라고 적는다.
- 누가 정했는지: 일부 절차에 "사용자가 승인한 절차"라고 적어 임의로 바꾸지 않게 한다.
- 모를 때 할 일: 계층 규칙을 넘는 공유가 불가피해 보이면 구현 전에 사용자에게 먼저 경고하라고 적는다. 8편의 "지우기 전에 묻기"를 에이전트에게 맡긴 셈이다.

## 인수 테스트와 커밋 메시지
문서는 읽혀야 효과가 있지만 테스트는 실행될 때마다 확인된다. **행위 주도 개발**(behaviour-driven development, BDD)은 Dan North가 2006년 글 「Introducing BDD」로 널리 알린 방식으로, 테스트를 함수가 아니라 행동의 문장으로 쓰게 한다. 그 중심인 Given-When-Then(이런 상황에서, 이것을 하면, 이렇게 되어야 한다)은 사용자 스토리의 인수 조건을 실행 가능한 형태로 담는 틀이다. 8편의 의도 테스트는 "03:59에 들어온 주문이 있을 때, 영업일을 계산하면, 전날이어야 한다"로 읽힌다. 다만 테스트는 결과만 지키므로 결정 기록으로 가는 고리가 필요하다.

diff는 무엇이 바뀌었는지 이미 보여 준다. 커밋 메시지와 PR 설명이 할 일은 diff에 없는 것, 즉 왜 바꿨는지, 어떤 대안을 버렸는지, 무엇을 가정했는지를 적는 것이다. 에이전트가 쓴 커밋 메시지는 이유를 그럴듯하게 지어낼 수 있으므로(8편의 "의도에 대한 추측"), 사람이 정한 이유와 에이전트가 추론한 이유를 구분해 적게 한다.

## 직접 확인: 추적성 검사기
**요구사항 추적성**(requirements traceability)은 Gotel과 Finkelstein(1994)의 정의로, 요구사항의 삶을 기원부터 명세, 구현, 이후의 다듬기까지 앞뒤 양방향으로 따라갈 수 있는 능력이다. 결정 기록과 테스트에 아주 작게 적용해 보자(장난감 예다). D-12에 결정 둘을 더한다. D-07은 D-12로 대체된 옛 결정이고, D-15는 결과 절을 빠뜨렸다.
```markdown
# 파일: decisions/D-07.md
# D-07 영업일은 자정에 바뀐다
상태: 대체됨 (→ D-12)
## 맥락
초기 정산은 자정 기준이었다.
## 결정
영업일은 주문 시각의 날짜다.
## 결과
D-12로 대체.
```
```markdown
# 파일: decisions/D-15.md
# D-15 환불은 원래 결제 수단으로만 한다
상태: 승인
## 맥락
상품권으로 결제하고 현금으로 돌려받는 우회를 막는다.
## 결정
환불은 결제에 쓴 수단으로만 돌려준다.
```
테스트는 함수 바로 위의 `# 의도: D-xx` 주석으로 결정을 가리킨다. 검사기는 테스트를 실행하지 않고 읽기만 한다.
```python
# 파일: tests/test_orders.py
from datetime import datetime as dt
from orders import business_date

# 의도: D-12
def test_dawn_order_is_previous_day():
    assert str(business_date(dt(2026, 3, 3, 3, 59))) == "2026-03-02"

# 의도: D-07
def test_midnight_new_day():
    assert str(business_date(dt(2026, 3, 3, 0, 10))) == "2026-03-03"
```
```python
# 파일: trace.py
import pathlib, re, sys

NEED = ["## 맥락", "## 결정", "## 결과"]
status, errors = {}, []
for p in sorted(pathlib.Path("decisions").glob("D-*.md")):
    text = p.read_text()
    status[p.stem] = re.search(r"^상태: (\S+)", text, re.M)[1]
    errors += [f"{p.stem}: '{h}' 절 없음" for h in NEED if h not in text]

refs = {}
for p in sorted(pathlib.Path("tests").glob("test_*.py")):
    for d, t in re.findall(r"# 의도: (D-\d+)\ndef (\w+)", p.read_text()):
        refs.setdefault(d, []).append(t)

for d, tests in sorted(refs.items()):
    if d not in status:
        errors.append(f"{d}: 없는 결정을 가리킴 {tests}")
    elif status[d] != "승인":
        errors.append(f"{d}: '{status[d]}' 결정을 아직 검사함 {tests}")
for d in sorted(status):
    if status[d] == "승인" and d not in refs:
        print(f"경고 {d}: 이 결정을 지키는 테스트 없음")
for e in errors:
    print("오류", e)
print(f"결정 {len(status)}개, 테스트와 이어진 결정 {len(refs)}개")
sys.exit(1 if errors else 0)
```
```bash
python3 trace.py; echo "종료 코드 $?"
```
```text
경고 D-15: 이 결정을 지키는 테스트 없음
오류 D-15: '## 결과' 절 없음
오류 D-07: '대체됨' 결정을 아직 검사함 ['test_midnight_new_day']
결정 3개, 테스트와 이어진 결정 2개
종료 코드 1
```
세 가지가 잡혔다. 형식(결과 절이 빠진 D-15), 낡은 의도(이미 대체된 D-07을 지키는 테스트), 실행 검사로 묶이지 않은 결정(D-15)이다. 두 번째가 가장 위험하다. 그 테스트는 D-12를 따르는 코드에서 실패하고, 이유를 모르는 사람이나 에이전트는 테스트를 통과시키려고 코드를 옛 규칙으로 "고칠" 수 있다. 경고는 실패로 치지 않았다. 여러 서비스에 걸친 환불 정책처럼 테스트로 바꾸기 어려운 결정도 있어, 목록이 보이는 것으로 충분할 때가 많다. 이 검사기를 CI에 걸면 결정을 대체할 때 그 결정을 가리키는 테스트도 함께 정리하게 된다.

## 무엇을 기록하고 무엇은 기록하지 않을까
모든 것을 적으면 아무것도 읽히지 않고, 적은 것은 모두 낡는다. 아래는 이 글이 권하는 경험칙이지 연구로 검증된 기준은 아니다.
- 적는다: 되돌리기 비싼 결정, 코드만 보면 이상해 보이는 제약(체스터턴의 울타리 후보), 팀이나 시스템의 경계를 넘는 약속, 에이전트나 새 사람이 다시 제안할 법한 버린 대안.
- 적지 않는다: 코드와 테스트가 이미 정확히 말하는 것, 곧 바뀔 구현 세부, 도구가 자동으로 남기는 정보.
- 신선도를 지킨다: 기록을 코드와 같은 저장소에 두고 같은 PR에서 고친다. 상태와 대체 표시를 쓰고, 지침 파일은 짧게 유지하며 주기적으로 낡은 항목을 지운다.

## 어디에 쓰이나
- GitHub 협업과 자동화 2편 「풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식」: 스쿼시 병합은 여러 커밋을 하나로 합치므로, 개별 커밋 메시지에 적었던 이유가 병합 커밋에 남는지 확인해야 한다.
- Git 버전 관리 13편 「Git 훅: 커밋과 푸시 전에 자동으로 검사하기」: 추적성 검사기는 그 글의 pre-commit 훅이나 CI에 그대로 걸 수 있는 종류의 검사다.
- 트랜지스터에서 자연어까지 13편 「AI 에이전트와 자연어 프로그래밍: 명세와 검증의 시대」: 그 글이 자연어 명세로 소개한 이 플랫폼의 CLAUDE.md가 "왜"를 담는 방식을 이 글에서 봤다.

## 정리
- ADR은 결정 하나를 맥락·결정·결과로 적고 대체된 결정도 지우지 않아 "왜 그때 그랬나"에 답한다.
- 명세 주도 개발은 의도를 코드보다 먼저 쓰게 하지만, 명세가 유지되지 않으면 코드와 어긋나 틀린 의도가 된다.
- 지침 파일은 에이전트가 매 세션 읽는 의도이므로 규칙과 함께 이유와 "모를 때 할 일"을 적는다.
- 테스트는 실행되는 의도이고, ID로 결정 기록과 이으면 끊어진 고리와 낡은 의도를 기계가 찾는다.

## 더 알아보기
- 이전 글: 8편 「의도 부채 1: 코드는 무엇을 하는지 말하지만 왜 하는지는 말하지 않는다」
- 다음 글: 10편 「세 부채를 함께 관리하기: 상호작용, 지표, 그리고 열린 질문」

## 참고 자료
- Michael Nygard, 「Documenting Architecture Decisions」, Cognitect 블로그, 2011-11-15. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Margaret-Anne Storey, 「From Technical Debt to Cognitive and Intent Debt: Rethinking Software Health in the Age of AI」, arXiv:2603.22106, 2026-03. https://arxiv.org/abs/2603.22106
- GitHub, 「Spec-driven development with AI: Get started with a new open source toolkit」, GitHub 블로그, 2025-09-02. https://github.blog/2025-09-02-spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- Birgitta Böckeler, 「Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl」, martinfowler.com, 2025-10-15. https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- Linux Foundation, 「Linux Foundation Announces the Formation of the Agentic AI Foundation」, 보도 자료, 2025-12-09. https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- Gotel, Finkelstein, 「An Analysis of the Requirements Traceability Problem」, IEEE International Conference on Requirements Engineering, 1994. https://discovery.ucl.ac.uk/749/
