# [AI 시대의 소프트웨어 부채 7/10] 인지 부채 3: 팀에서 진단하고 갚는 법

> **한 줄 요약** — 인지 부채는 코드 지표로 보이지 않으므로 "누가 이것을 설명할 수 있나"를 사람에게 직접 묻고 워크스루·회고·짝 프로그래밍으로 이해를 나눠 갚아야 하며, AI는 이해를 대신할 때가 아니라 비계로 쓸 때 상환을 돕고, 커밋 작성자에 기댄 트럭 팩터 같은 지표는 에이전트 시대에 이해를 과대평가할 수 있다.

## 이 글에서 다루는 것
- 진단: 코드 대신 사람에게 묻는 세 가지 질문
- Storey가 권하는 실천: 워크스루, 회고·사후 분석, 리뷰와 짝 프로그래밍, TDD
- AI를 이해의 비계로: 윌리슨의 대화형 설명, 리트의 "참여하기 위해 이해한다"
- 실행 예: git 이력으로 트럭 팩터를 계산하고 에이전트 커밋이 가리는 것 보기
- 이해를 재려는 시도와 그 한계

## 진단: 코드 대신 사람에게 묻는다
5편의 사고 실험에서 보았듯 인지 부채는 정적 분석 도구에 잡히지 않는다. Storey(2026)는 각 주요 하위 시스템을 팀에서 누가 이해하는지 명시적으로 물어보라고 권한다. 아래 세 질문은 Storey 논문의 체크리스트를 옮긴 것이 아니라 그 취지를 팀 회의에서 쓸 수 있게 바꾼 것이다.
- **설명**: 각 하위 시스템을 누가 설명할 수 있나? 이름이 하나뿐이거나 비어 있는 칸이 위험 신호다.
- **이유**: 지난주 병합된 변경 하나를 무작위로 골랐을 때, 작성자가 아닌 사람이 그 변경의 이유를 말할 수 있나?
- **복구**: 이 모듈에서 장애가 나면 누가 고칠 수 있나? 당번이 이 코드를 디버깅해 본 적이 있나?

답은 하위 시스템, 설명할 수 있는 사람, 마지막으로 확인한 날을 적은 표 한 장이면 된다. 자기 보고는 부풀려지기 쉬우므로(6편에서 본 체감과 측정의 차이) "설명할 수 있다"는 칸은 실제로 남에게 설명해 본 사람만 채운다.

## 갚는 실천
Storey가 논문과 블로그에서 권하는 실천은 새롭지 않다. 새로운 것은 그 실천을 하는 이유다.
- **워크스루**: 개발자가 자기가 쓰지 않은 코드를 설명하는 시스템 워크스루. 목적은 문서 작성이나 리팩터링이 아니라 지식 공유와 이론 짓기다(5편의 나우르). 에이전트가 쓴 코드라면 더욱 그렇다.
- **회고와 사후 분석**: 무언가 깨지거나 막혔을 때 낡은 정신 모델을 다시 세우는 기회로 쓴다. "무엇이 고장 났나"와 함께 "우리의 어떤 이해가 틀렸나"를 묻는다.
- **리뷰와 짝 프로그래밍**: 리뷰는 결함을 잡는 일만이 아니라 이해를 퍼뜨리는 일이다. 두 사람이 에이전트 하나와 함께 일하면 적어도 두 사람이 같은 이론을 갖는다.
- **TDD**: Storey는 블로그에서 속도를 늦추고 짝 프로그래밍, 리팩터링, TDD 같은 실천으로 기술 부채와 인지 부채를 함께 다뤄야 한다고 쓴다. 사람이 먼저 쓴 테스트에는 그 사람의 이해가 남는다.

논문은 에이전트에게 다른 테스트나 설계로 기능을 다시 구현하게 해서 이해를 되살리는 방법도 제안한 것으로 소개된다. 이 실천들은 대부분 한 연구자와 실무자들의 권고이고, 인지 부채를 얼마나 줄이는지 측정된 결과는 아니다.

## AI를 이해의 비계로
사이먼 윌리슨(Simon Willison)은 「Agentic Engineering Patterns」 가이드의 「Interactive explanations」 장(2026년 2월)에서 에이전트가 쓴 코드가 어떻게 동작하는지 놓치는 것을 인지 부채로 본다. 애플리케이션의 핵심이 블랙박스가 되면 그 위에서 자신 있게 추론할 수 없다. 갚는 방법은 코드에 대한 이해를 높이는 것이고, 그가 즐겨 쓰는 방법은 에이전트에게 대화형 설명(작은 시각화나 설명 도구)을 만들게 하는 것이다. 제프리 리트(Geoffrey Litt)는 2026년 7월 AI Engineer 발표를 글로 옮긴 「Understanding is the new bottleneck」에서 "참여하기 위해 이해한다"는 관점을 내놓는다. 프로젝트는 에이전트와 도는 수많은 고리이고, 시스템에 대한 내 이해가 다음 아이디어를 정한다. 이해를 잃으면 승인은 할 수 있어도 방향은 정할 수 없다. 그가 소개한 방법에는 코드 설명 문서, 퀴즈, 작은 실험 세계(micro-worlds)가 있다. 팀의 사용법으로 옮기면 다음과 같다.
- **설명을 먼저 요구하기**: 코드보다 계획과 이유를 먼저 받고, 변경 뒤에는 "이 PR을 처음 보는 동료에게 설명하는 글"을 받는다.
- **예측하고 확인하기**: 테스트를 돌리기 전에 결과를 먼저 예측해 적고, 틀린 곳에서 멈춰 이유를 묻는다.
- **퀴즈 받기**: 방금 바뀐 코드에 대한 질문을 에이전트에게 내게 하고 답해 본다.

6편의 Anthropic 실험에서 설명과 개념 질문을 구한 참가자가 학습을 더 잘 지켰고, Ahmad의 일지 연구에서 AI를 비계로 쓴 학생이 더 깊이 이해했다는 결과와 같은 방향이다. 다만 이 사용법이 팀의 인지 부채를 줄인다는 직접 측정은 아직 없다.

## 실행 예: 트럭 팩터와 그 함정
**트럭 팩터**(truck factor)는 몇 명이 갑자기 떠나면 프로젝트가 곤란해지는지를 나타내는 수다. Avelino 외(2016)의 널리 쓰이는 알고리즘은 저자 기여도 모델로 파일마다 전문가를 정하고, 가장 많은 파일의 전문가를 한 명씩 빼다가 전문가 없는 파일이 절반을 넘으면 멈춰 뺀 사람 수를 트럭 팩터로 낸다. 아래 장난감 예는 기여도 모델 대신 "그 파일에 커밋을 가장 많이 한 사람"을 전문가로 단순화했다.
```python
# 파일: tf.py
import subprocess, sys
from collections import Counter, defaultdict

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout

human_only = "--human" in sys.argv
counts = defaultdict(Counter)                 # 파일 → 작성자별 커밋 수
log = git("log", "--name-only", "--format=%x00%an|%(trailers:key=Co-authored-by,valueonly)")
for entry in log.split("\0")[1:]:
    head, *files = entry.strip().split("\n")
    author, coauthor = head.split("|")
    if human_only and coauthor.startswith("Agent"):
        continue                              # 에이전트와 함께 쓴 커밋은 이해의 증거로 치지 않는다
    for f in filter(None, files):
        counts[f][author] += 1
files = git("ls-files").split()
experts = {f: {a for a, n in counts[f].items() if n == max(counts[f].values())} for f in files}
gone = []
orphans = lambda: sum(not (e - set(gone)) for e in experts.values())
print("에이전트 공동 작성 제외" if human_only else "작성자 기록 그대로")
print(f"  처음부터 아는 사람이 없는 파일: {orphans()}/{len(files)}")
while orphans() <= len(files) / 2:            # 절반 넘게 주인을 잃을 때까지
    load = Counter(a for e in experts.values() for a in e - set(gone))
    gone.append(max(sorted(load), key=load.get))   # 가장 많은 파일의 전문가부터
print(f"  트럭 팩터 {len(gone)}: {', '.join(gone)}")
```
저장소에는 alice와 bob이 직접 쓴 파일과 dana가 에이전트와 함께 만든 파일이 있다. dana의 커밋에는 일부 에이전트 도구가 붙이는 것과 같은 공동 작성자 트레일러가 달려 있다.
```bash
git init -q shop && cd shop
c() {  # c <작성자> <파일> [agent]: 한 줄 추가하고 그 사람 이름으로 커밋
  echo "$1" >> "$2" && git add "$2"
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$1@example.com" git commit -q -m "update $2" \
    ${3:+--trailer "Co-authored-by: Agent <agent@example.com>"}
}
for f in cart pay auth; do c alice $f.py; c alice $f.py; done
for f in db api; do c bob $f.py; c bob $f.py; done
c alice api.py
for f in ui report search; do c dana $f.py agent; c dana $f.py agent; done
git shortlog -sn HEAD
git log -1 --format='%an: %s%n%(trailers)'
```
```text
     7	alice
     6	dana
     4	bob
dana: update search.py
Co-authored-by: Agent <agent@example.com>
```
```bash
python3 ../tf.py
python3 ../tf.py --human
```
```text
작성자 기록 그대로
  처음부터 아는 사람이 없는 파일: 0/8
  트럭 팩터 2: alice, dana
에이전트 공동 작성 제외
  처음부터 아는 사람이 없는 파일: 3/8
  트럭 팩터 1: alice
```
작성자 기록대로 세면 트럭 팩터는 2다. alice와 dana가 함께 떠나야 곤란해진다. 에이전트와 함께 쓴 커밋을 이해의 증거로 치지 않으면 세 파일은 처음부터 아는 사람이 없고, alice 한 명만 떠나도 절반 넘는 파일이 주인을 잃는다. 어느 쪽이 맞는지는 git 이력이 알려 주지 않는다. dana가 에이전트의 코드를 읽고 고치며 이론을 지었다면 첫 숫자가, 받아들이기만 했다면 둘째 숫자가 현실에 가깝다. 답은 첫 번째 진단 질문, 곧 dana에게 설명을 청해 보는 것으로만 얻는다. 반대 방향의 착시도 있다. 커밋은 적지만 모든 PR을 꼼꼼히 리뷰하는 사람의 이해는 이력에 남지 않는다. 트레일러가 없으면 둘째 계산은 아예 할 수 없으니, 에이전트의 참여를 커밋에 남기는 습관은 적어도 이 숫자를 의심할 근거를 남긴다.

연구도 같은 방향을 가리킨다. Cury & Avelino(SBES 2025)는 GitHub 프로젝트에 나타난 ChatGPT 생성 코드 자료를 바탕으로 AI 기여 비율을 바꾼 시나리오를 시뮬레이션해, 대부분의 시나리오에서 전문성 모델 기반 트럭 팩터가 측정 가능하게 달라짐을 보였다. 2026년 6월 arXiv 프리프린트 「The Substrate Collapse」는 더 나아가, AI가 생성한 코드베이스에서 계산한 트럭 팩터는 숫자는 나오지만 그 숫자가 재는 것(작성자 흔적의 분포)이 추정하려던 것(머릿속에 남은 이론의 분포)과 더 이상 상관되지 않는다고 주장한다.

## 이해를 재려는 시도
작성자 기록 대신 이해를 직접 재려는 시도는 아직 초기다. 「The Substrate Collapse」도 2차 요약에 따르면 이해에 기반한 측정 틀을 요구하고, 리트의 퀴즈나 Anthropic 실험의 이해도 퀴즈도 그런 도구의 후보다. 팀이 지금 해 볼 수 있는 가장 단순한 것은 진단 표에서 "설명할 수 있는 사람이 두 명 이상인 하위 시스템의 비율"을 분기마다 다시 확인하는 것이다. 이 숫자도 자기 보고이고, 숫자 자체가 목표가 되면 형식적인 설명 회의로 변질될 수 있다. 10편에서 세 부채의 선행 지표를 함께 다루며 이 한계를 다시 본다.

## 어디에 쓰이나
- Git 버전 관리 9편 「이력 탐색과 디버깅: log 필터, blame, bisect」: blame이 보여 주는 것은 마지막으로 줄을 바꾼 사람이지 그 줄을 이해하는 사람이 아니며, 트럭 팩터도 같은 한계를 물려받는다.
- GitHub 협업과 자동화 3편 「코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법」: CODEOWNERS를 첫 번째 진단 질문의 답으로 관리하면 리뷰 요청이 이해를 나누는 경로가 된다.
- 6편 「인지 부채 2: 연구가 보여 주는 것과 보여 주지 않는 것」: 비계로 쓰는 사용법의 근거와 체감의 함정을 다룬다.
- 10편 「세 부채를 함께 관리하기: 상호작용, 지표, 그리고 열린 질문」: 설명 가능한 사람 수 같은 선행 지표와 측정의 한계를 이어서 본다.

## 정리
- 인지 부채는 사람에게 살므로 코드 지표가 아니라 "누가 설명할 수 있나, 이유를 말할 수 있나, 장애 때 고칠 수 있나"로 진단한다.
- 워크스루, 회고·사후 분석, 리뷰와 짝 프로그래밍, TDD는 이론을 팀에 다시 퍼뜨리는 실천이다.
- AI는 설명을 먼저 요구하고 예측하고 확인하는 비계로 쓸 때 이해를 도울 수 있지만, 그 효과를 팀 수준에서 잰 연구는 아직 없다.
- 트럭 팩터 같은 작성자 기반 지표는 에이전트와 함께 쓴 커밋을 이해로 세어 버릴 수 있으니, 숫자보다 그 숫자를 확인하는 질문이 중요하다.

## 더 알아보기
- 이전 글: 6편 「인지 부채 2: 연구가 보여 주는 것과 보여 주지 않는 것」
- 다음 글: 8편 「의도 부채 1: 코드는 무엇을 하는지 말하지만 왜 하는지는 말하지 않는다」

## 참고 자료
- Margaret-Anne Storey, 「From Technical Debt to Cognitive and Intent Debt: Rethinking Software Health in the Age of AI」, arXiv:2603.22106, 2026-03. https://arxiv.org/abs/2603.22106
- Simon Willison, 「Interactive explanations」, Agentic Engineering Patterns, simonwillison.net, 2026-02-28. https://simonwillison.net/guides/agentic-engineering-patterns/interactive-explanations/
- Geoffrey Litt, 「Understanding is the new bottleneck」, geoffreylitt.com, 2026-07-02. https://geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck
- Guilherme Avelino 외, 「A Novel Approach for Estimating Truck Factors」, ICPC 2016, arXiv:1604.06766. https://arxiv.org/abs/1604.06766
- Cury, Avelino, 「The Impact of Generative AI on Code Expertise Models: An Exploratory Study」, SBES 2025, arXiv:2507.08160. https://arxiv.org/abs/2507.08160
- 「The Substrate Collapse: AI Code Generation Invalidates Authorship-Based Knowledge Metrics」, arXiv:2606.20882, 2026-06. https://arxiv.org/abs/2606.20882
