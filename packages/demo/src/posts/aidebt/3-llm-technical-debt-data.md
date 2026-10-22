# [AI 시대의 소프트웨어 부채 3/10] LLM이 만드는 기술 부채: 중복, 변동, 결함에 관한 데이터

> **한 줄 요약** — 2025~2026년 자료들은 AI 보조 개발과 함께 중복 코드가 늘고 옮긴(리팩터링한) 코드가 줄며, AI가 함께 쓴 PR에 지적 사항이, 생성 코드에 보안 결함이 많고, 도입이 늘수록 전달이 불안정해지는 경향을 보이지만, 대부분 이해관계가 있는 곳의 상관 자료라서 방향은 참고하되 크기는 조심해서 읽어야 한다.

## 이 글에서 다루는 것
- GitClear: 복사·붙여넣기는 늘고 옮기기는 줄었다
- CodeRabbit과 Veracode: PR의 지적 사항과 생성 코드의 보안 결함
- DORA 2024·2025와 다성 문헌 검토: 불안정성, 증폭기, 새 부채의 범주
- 데이터를 읽는 법과 LLM이 이런 부채를 만들기 쉬운 이유
- 작은 클론 탐지기로 "복사 대 옮기기" 지표 직접 재 보기

## 문제: 빨라졌다는데 무엇이 쌓이나
2편의 대리 지표(변동, 중복, 결함)를 AI 보조 개발에 대 보자. 아래 수치는 대부분 보고서 전문이 아니라 공식 페이지, 보도 자료, 기사의 요약에서 확인한 것이다.

## GitClear: 복사는 늘고 옮기기는 줄었다
코드 분석 도구 회사 GitClear는 2025년 보고서 「AI Copilot Code Quality」에서 2020~2024년에 바뀐 코드 2억 1,100만 줄을 분석했다. 다른 곳으로 옮긴 줄(moved, 리팩터링의 신호)과 복사·붙여넣은 줄을 구분해 센다. 2024년에 5줄 이상 중복된 블록이 크게 늘었고(기사들은 8배라고 전하고, 보고서 제목은 클론의 4배 증가를 말한다), 옮긴 줄은 줄었으며(감소 폭은 전하는 곳마다 다르다), 2024년은 복사·붙여넣은 줄이 옮긴 줄보다 많아진 첫해였다. GitClear는 탭 키 하나로 새 블록을 넣게 해 주는 어시스턴트를 원인으로 든다. 2026년 후속 보고서 「The Maintainability Gap」은 2023~2026년의 코드 변경 6억 2,300만 건을 보고, 리팩터링성 옮기기는 70% 줄고(GitClear 페이지는 2022년 대비라고 적는다) 코드 블록 중복은 81% 늘었다고 요약한다. 2차 요약에 따르면 전체 변경 중 옮긴 코드의 비율은 2026년 3.8%까지 내려갔다. AI 도구 확산과 겹치는 연도별 상관이지 인과가 아니다.

## CodeRabbit: AI가 함께 쓴 PR의 지적 사항
AI 코드 리뷰 회사 CodeRabbit은 2025년 12월 17일 보고서에서 오픈 소스 PR 470개(AI 공동 작성 320개, 사람만 150개)를 100 PR당 지적 수로 정규화해 비교했다. PR당 지적은 AI 쪽 10.83개, 사람 쪽 6.45개로 약 1.7배였고, 논리·정확성 문제는 약 75%, 가독성 문제는 3배 넘게 많았다. 치명적 지적은 1.4배, 주요 지적은 1.7배였다. 회사 스스로 어떤 PR을 AI가 썼는지 가려내기 어려웠다고 밝힌다.

## Veracode: 생성 코드의 보안
애플리케이션 보안 회사 Veracode는 2025년 7월 30일 「2025 GenAI Code Security Report」에서 100개 넘는 LLM에 엄선한 코딩 과제 80개를 주었다. 테스트 사례의 약 45%에서 OWASP Top 10에 속하는 취약점이 들어갔다. 자바가 70%를 넘어 가장 높았고 파이썬·C#·자바스크립트는 38~45%였다. 크로스 사이트 스크립팅(CWE-80)은 86%, 로그 주입(CWE-117)은 88%의 경우에 막지 못했다. 큰 모델이 작은 모델보다 보안 면에서 유의하게 낫지 않았고, 문법적 정확도가 오르는 동안 보안 성능은 제자리였다고 한다. 프로젝트 맥락도 사람의 검토도 없는 실험실 과제다.

## DORA와 다성 문헌 검토
구글 DORA 팀의 2024년 설문 보고서는 AI 도입이 25% 늘 때 전달 처리량은 약 1.5%, 전달 안정성은 약 7.2% 떨어진다고 추정했다. 같은 증가는 문서 품질(7.5%), 코드 품질(3.4%), 리뷰 속도(3.1%) 향상과도 연결되었다. 연구진은 AI로 변경 묶음이 커져 리뷰가 어려워진 것을 한 원인으로 추정했다. 약 5,000명이 응답한 2025년 보고서에서는 AI 도입률이 구글 발표에 따르면 전년보다 14% 늘어 약 90%였고, 처리량과의 관계는 양으로 돌아섰지만 불안정성(변경 실패, 재작업)과의 연관은 남았다. 보고서는 AI를 조직의 강점과 약점을 함께 키우는 **증폭기**(amplifier)로 본다(10편). 둘 다 설문 기반의 상관 추정이다.

Ehsani, Rawal, Cai, Chatterjee의 다성 문헌 검토(ACM TOSEM 게재 예정)는 정식 문헌 31개와 회색 문헌 73개, 모두 104개 자료를 정리했다. 초록에 따르면 LLM은 기존의 코드·설계·문서 부채를 키우고, 속도를 앞세워 통합한 코드가 거버넌스 부채로 번지는 **빠른 통합 부채**(fast-integration debt)를 새로 만든다. 프롬프트·윤리·데이터·출처(provenance) 부채도 새 범주로 꼽는다. 실무에서는 SonarQube 같은 도구로 징후를 잡지만 LLM에 특화된 표준 지표나 벤치마크는 아직 없다. 자료의 약 70%가 회색 문헌이라는 점은 이 분야가 아직 젊다는 신호다.

## 숫자로 보기
| 출처 | 수치 | 성격 |
|---|---|---|
| GitClear 2025 | 중복 블록 급증(지표마다 4배·8배) | 벤더, 연도별 상관 |
| CodeRabbit 2025 | PR당 지적 10.83 대 6.45 | 벤더, PR 470개 |
| Veracode 2025 | 사례의 약 45%에 취약점 | 벤더, 실험실 과제 |
| DORA 2024 | 안정성 약 −7.2% | 설문 추정 |
| DORA 2025 | 도입률 약 90% | 설문, 약 5,000명 |

## 데이터를 읽는 법
- 이해관계: GitClear, CodeRabbit, Veracode는 자기가 잰 문제를 푸는 도구를 팔고, DORA를 운영하는 구글도 AI 도구를 만든다. 무시할 이유가 아니라 방법을 확인할 이유다.
- 상관과 인과: 연도별 추세는 같은 시기의 다른 변화(팀 구성, 언어, 프로젝트 성격)와 겹친다. 무작위 배정 없이는 원인을 말하기 어렵다.
- 라벨링과 표본: 누가 썼는지는 대부분 자기 표시나 추정이고(에이전트가 쓰고 사람이 커밋하면 기록상 사람 코드다, 7편), 실험실 과제 80개나 PR 470개가 현장 전체를 대표하지는 않는다.
- 방향과 크기: 방향은 일관되지만 같은 보고서의 수치도 전하는 곳마다 다르다.

## 왜 LLM은 이런 부채를 만들기 쉬운가
위 자료와 잘 맞는 메커니즘이지만, 검증된 법칙이 아니라 설명 가설로 읽자.
- 지역적 최적화: 모델은 지금 받은 요청(이 함수, 이 테스트)을 만족시키는 코드를 쓴다. 시스템 전체 구조는 요청에 없다.
- 기존 추상화 대신 새 코드: 비슷한 함수를 찾아 고치기보다 새로 쓰기가 쉽다. GitClear의 경향과 같은 방향이다.
- 맥락 창 밖의 관례: 모델은 입력에 들어온 코드만 본다(트랜지스터에서 자연어까지 12편 「자연어에서 코드로: 언어 모델이 프로그램을 쓰는 원리」). 입력 밖의 관례와 도우미 함수는 없는 것과 같다.
- 검토보다 빠른 생성: 변경이 커지고 잦아지면 리뷰가 승인 도장이 된다. DORA 2024의 "커진 변경 묶음" 추정과 같은 이야기이고, 여기서 인지 부채가 시작된다(5편).

## 직접 재 보기: 복사 대 옮기기
"옮긴 코드가 줄었다"는 지표가 무엇을 재는지 장난감 클론 탐지기로 확인해 보자. 주문 검증 함수 `check`가 있는 저장소에 환불 기능을 더하는 세 가지 변경을 함수 단위로 비교한다. 공통 모듈로 옮겨 함께 쓰기, 그대로 복사하기, 복사하고 이름만 바꾸기다. 더한 줄을 새 코드, 복제(다른 곳에 그대로 남음), 옮김(원래 자리에서 사라짐)으로 센다. 실제 도구의 알고리즘이 아닌 장난감이다.
```python
import keyword, re

CHECK = '''def check(order):
    if order.amount <= 0:
        raise ValueError("amount")
    if order.currency not in ("KRW", "USD"):
        raise ValueError("currency")
'''
PLACE = "def place(order):\n    check(order)\n    save(order)\n"
REFUND = "def refund(r):\n    check(r)\n    pay_back(r)\n"
RENAMED = CHECK.replace("check(order)", "check_refund(req)").replace("order.", "req.")

old = {"orders.py": CHECK + PLACE}
changes = {
    "옮기기": {"orders.py": "from common import check\n" + PLACE,
            "common.py": CHECK, "refunds.py": REFUND},
    "복붙": {"orders.py": CHECK + PLACE, "refunds.py": CHECK + REFUND},
    "복붙+이름 바꿈": {"orders.py": CHECK + PLACE,
                 "refunds.py": RENAMED + REFUND.replace("check(", "check_refund(")},
}

def funcs(src, rename):                    # 함수 단위로 자르고 정규화
    out = []
    for line in src.splitlines():
        if line.startswith("def "): out.append([])
        if out and line.strip():
            s = line.strip()
            if rename:                     # 키워드가 아닌 이름은 모두 v로
                s = re.sub(r"[A-Za-z_]\w*",
                           lambda m: m[0] if keyword.iskeyword(m[0]) else "v", s)
            out[-1].append(s)
    return [tuple(f) for f in out]

def classify(old, new, rename, min_lines):
    n = {"새 코드": 0, "복제": 0, "옮김": 0}
    for path, src in new.items():
        for f in set(funcs(src, rename)) - set(funcs(old.get(path, ""), rename)):
            was = {p for p in old if p != path and f in funcs(old[p], rename)}
            now = {p for p in new if p != path and f in funcs(new[p], rename)}
            if len(f) < min_lines: was = now = set()   # 짧은 함수는 비교 안 함
            kind = "옮김" if was and not was & now else "복제" if now else "새 코드"
            n[kind] += len(f)                          # 줄 수로 센다
    return n

for label, rename, min_lines in [("정확히 같은 줄", False, 1),
                                 ("이름 정규화", True, 1),
                                 ("이름 정규화, 4줄 이상", True, 4)]:
    print(label)
    for name, new in changes.items():
        c = classify(old, new, rename, min_lines)
        print(f"  {c['새 코드']} {c['복제']} {c['옮김']}  {name}")
```
```text
정확히 같은 줄
  3 0 5  옮기기
  3 5 0  복붙
  8 0 0  복붙+이름 바꿈
이름 정규화
  0 3 5  옮기기
  0 8 0  복붙
  0 8 0  복붙+이름 바꿈
이름 정규화, 4줄 이상
  3 0 5  옮기기
  3 5 0  복붙
  3 5 0  복붙+이름 바꿈
```
숫자는 차례로 새 코드, 복제, 옮김의 줄 수다. 정확히 같은 줄만 비교하면 리팩터링은 5줄 옮김, 그대로 복사는 5줄 복제로 잘 갈린다. 그런데 이름만 바꾼 복사는 8줄 모두 새 코드로 보여 중복이 숨는다. 클론 탐지 연구에서 널리 쓰는 Roy·Cordy의 분류가 식별자만 다른 복제를 Type-2로 따로 두는 이유다. 이름을 정규화하면 그 복제는 잡히지만, 이번에는 3줄짜리 `refund`가 `place`와 모양이 같아져 리팩터링에서도 복제로 잘못 잡힌다. 최소 길이(여기서는 4줄)를 두면 셋 다 맞게 갈린다. GitClear의 "5줄 이상" 블록처럼 실제 지표도 문턱을 둔다. 결국 "중복 몇 배"는 정규화 방식, 최소 길이, 비교 단위라는 정의에 달린 숫자다. 보고서끼리 숫자를 비교하기보다 자기 저장소에서 같은 정의로 변화를 보는 편이 낫다. 복제의 이자도 보인다. 허용 통화를 하나 추가하려면 복사한 쪽은 두 곳을 고쳐야 하고, 한 곳을 빠뜨리면 주문과 환불의 규칙이 어긋난다.

## 팀의 실천
- 중복, 옮기기, 2주 안의 재수정 같은 지표를 AI 도입 전후로 같은 정의로 잰다. 남의 보고서보다 자기 기준선이 낫다.
- 에이전트에게 새 코드를 쓰기 전에 기존 함수를 찾게 하고, 팀의 관례와 공용 모듈 위치를 지침 파일에 적는다(9편).
- AI가 만든 변경도 작게 나눠 리뷰한다. 큰 변경 묶음이 불안정성과 함께 간다는 추정이 있다.
- 정적 분석과 코드 스캐닝을 CI에 걸어, 생성 코드의 보안 기본값을 믿지 않는다.

## 어디에 쓰이나
- 통계학 7편 「A/B 테스트: 실험으로 결정하기」: 연도별 추세의 상관과 무작위 배정 실험의 차이가 이 글의 "상관과 인과" 경고의 뿌리다.
- 문자열 알고리즘 1편 「문자열 해싱과 라빈-카프」: 탐지기가 함수를 집합에 넣어 찾는 것은 코드 조각을 해시 지문으로 비교하는 일이고, 긴 파일의 모든 위치를 비교하려면 그 글의 롤링 해시가 필요해진다.
- GitHub 협업과 자동화 10편 「의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝」: Veracode가 보인 종류의 취약점을 병합 전에 잡는 장치가 그 글의 코드 스캐닝이다.

## 정리
- GitClear 자료에서 AI 확산기에 중복 블록은 늘고 옮긴 코드는 줄었으며, 2024년에 처음으로 복사·붙여넣기가 옮기기를 앞섰다.
- CodeRabbit은 AI가 함께 쓴 PR에서 지적이 약 1.7배, Veracode는 테스트 사례의 약 45%에서 OWASP Top 10 취약점을 보고했고, DORA는 AI 도입과 불안정성의 연관을 2년 연속 보았다.
- 대부분 이해관계가 있는 곳의 상관 자료이고 수치는 정의에 달려 있으니, 크기는 자기 저장소에서 다시 잰다.
- 지역적 최적화, 새 코드 선호, 맥락 창 밖의 관례, 검토보다 빠른 생성이 이런 부채를 설명하는 유력한 가설이다.

## 더 알아보기
- 이전 글: 2편 「기술 부채 다시 읽기: 커닝햄의 비유와 이자의 정체」
- 다음 글: 4편 「AI는 기술 부채를 갚을 수도 있다: 리팩터링, 테스트, 그리고 에이전트 기술 부채」

## 참고 자료
- GitClear, 「AI Copilot Code Quality: 2025 Data Suggests 4x Growth in Code Clones」, 2025(후속 「The Maintainability Gap: AI Code Quality in 2026」, 2026). https://www.gitclear.com/ai_assistant_code_quality_2025_research
- CodeRabbit, 「State of AI vs Human Code Generation Report」, 2025-12-17. https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report
- Veracode, 「2025 GenAI Code Security Report」, 2025-07-30. https://www.veracode.com/genai-code-security-report
- DORA(Google), 「2024 Accelerate State of DevOps Report」, 2024. https://services.google.com/fh/files/misc/2024_final_dora_report.pdf
- DORA(Google), 「DORA 2025 State of AI-assisted Software Development Report」, 2025. https://research.google/pubs/dora-2025-state-of-ai-assisted-software-development-report/
- Ramtin Ehsani, Shriya Rawal, Yuanfang Cai, Preetha Chatterjee, 「Faster Code, Deeper Debt? A Multivocal Literature Review on Technical Debt and Its Early Signs in LLM-Assisted Software Development」, arXiv:2606.14796(ACM TOSEM 게재 예정), 2026-06. https://arxiv.org/abs/2606.14796
