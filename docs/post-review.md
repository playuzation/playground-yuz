# 포스트 1차 검토 기록

## 범위와 기준

`main`의 `83dfff8`에서 `docs/renewal`을 만들었다. 사용자 요청에 따라 이번 분기점은 저장소의 일반적인 dev 분기 규칙보다 main을 우선했다. [전체 목록](series-inventory.md)은 27개 시리즈, 313편이다.

전체 파일의 제목·편수·번호와 시리즈 구성을 대조하고, 요약과 정리를 중심으로 설명의 범위를 살폈다. 조건 누락이나 과도한 일반화가 보인 대목은 관련 본문까지 확인해 고쳤다. 이번에 수정한 포스트는 57편이다. 수정하지 않은 글의 사실관계를 모두 보증하는 전수 감수는 아니다.

문체는 AI 작성 여부를 판정하지 않고 편집했다. 여러 주장을 쉼표로 이어 붙인 긴 요약을 나누고, ‘반드시’, ‘모든’, ‘정의상’ 같은 단정은 근거가 있는 범위로 좁혔다. 기술 용어와 교육용 예제는 유지하면서 가정·측정·추측을 구분했다. 글마다 개인 경험을 꾸며 넣거나 구어체를 일괄 적용하지 않았다.

## 주요 수정과 근거

| 주제 | 발견한 문제 | 수정 방향과 참고 자료 |
|---|---|---|
| 신뢰 구간 | z 근사식을 정확한 95% 구간처럼 소개하고, 두 구간의 겹침으로 모델 차이를 판단 | 큰 표본 근사와 정규 모집단의 t 구간을 구분. 차이의 신뢰 구간·짝지은 비교 설명. [NIST 평균 구간](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm), [두 평균의 차이](https://www.itl.nist.gov/div898/handbook/prc/section3/prc312.htm) |
| 확률 | 독립을 분산 가산의 필요조건으로 표현하고, 요약에서 CLT의 조건 누락 | 무상관과 독립을 구분. 독립·동일 분포, 유한한 양의 분산을 명시 |
| Rust | Result를 무시하면 컴파일되지 않는다고 설명. GC가 데이터 경쟁도 해결하는 듯한 서술 | 기본값은 경고임을 명시. unsafe, 공유 소유권, 런타임 검사와 panic의 범위 보완. [rustc 문서](https://doc.rust-lang.org/rustc/lints/listing/warn-by-default.html#unused-must-use) |
| 접미사 오토마톤 | endpos로 묶은 구조가 모든 부분 문자열 언어의 최소 DFA라고 설명 | 접미사 언어의 최소 부분 DFA와 부분 문자열의 경로 판정을 구분. 단순 last 초기화로 일반화할 수 있다는 안내도 수정. [cp-algorithms](https://cp-algorithms.com/string/suffix-automaton.html) |
| 웨이블릿 트리 | 방향 비트의 이론상 크기를 Python 구현의 실제 메모리처럼 표현 | 누적 정수 리스트, rank 보조 구조, 값 사전의 비용 구분 |
| 양자화 용량 | 합성 데이터의 파라미터당 2비트를 보편적 용량 법칙처럼 전개 | 논문 설정의 관측값, 비트 패턴 상한, 퍼셉트론 모형을 구분. [Physics of Language Models 3.3](https://arxiv.org/html/2404.05405v1) |
| 롱테일 | 빈도가 마진을 결정하고 모든 사실에 같은 잡음이 더해진다고 단정 | 비용·잡음 모형의 가정과 고정 경쟁자 근사 명시. 실제 모델에 대한 필연적 결론 제거 |
| QLoRA | QAT·STE와 같은 학습 원리로 읽히는 요약 | 고정한 양자화 기반 가중치와 학습하는 LoRA 어댑터를 구분. [원 논문](https://arxiv.org/abs/2305.14314) |
| 선형대수·최적화 | 직사각 행렬의 유일해, 음수 고유값, 거듭제곱법 수렴, 경계 극값 누락 | 정사각성·지배 고유값·초기 성분·내부점 조건 보완. SVD의 직교 변환에는 반사도 포함 |
| 알고리즘 | 최적화 배낭을 NP-완전으로 분류. 허프만 탐욕의 적용 대상 불명확. 초기 음수 사이클 조건 누락 | 판정과 최적화 분류, 파일 합치기 비용 모형, 최소 비용 유량의 초기 조건 구분 |
| CPU·GPU | 특정 교육용 모형이나 GPU 세대의 값을 일반 사양처럼 요약 | 5단 파이프라인·A100 예제의 범위와 명령어별 정밀도 차이 명시. [NVIDIA 텐서 코어](https://www.nvidia.com/en-us/data-center/tensor-cores/) |
| PBR | GGX 정규화 적분의 가중치를 생략한 요약. 단순 확산+정반사의 에너지 보존 한계 누락 | 코사인 가중 정규화와 예제의 단순화 구분. [PBRT](https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory) |
| 게임 설계 | 시간 분할이 실제 프레임 상한을 보장하고 통화량 증가가 물가 상승을 보장하는 듯한 표현 | 작업 단위 모형과 실제 시간, 장부 항등식과 가격 결정 조건을 구분. 가상 온보딩 실험과 실제 이탈률도 구분 |

## 검증 결과

- 시리즈 목록·포스트 제목의 시리즈명·1부터 시작하는 연속 번호·전체 편수: 27개 시리즈, 313편 대조.
- `npm run verify`: 의존 규칙 검사, 타입 검사, 테스트 350개, 정적 사이트와 앱 빌드 통과.
- 기존 Playwright E2E: 35개 통과, 4개 건너뜀. 저장소의 프로젝트별 skip 조건에 따른 것으로 실패는 없다. 이 환경의 `/usr/bin/chromium`을 쓰는 임시 설정으로 실행했고, 배포용 설정은 수정하지 않았다. 비디오는 끄고 기존 테스트의 스크린샷과 trace 설정을 유지했다.
- `git diff --check`: 공백 오류 없음.

위 검사는 사이트와 앱의 회귀 및 문서 구조를 확인한다. 테스트 통과를 글 내용의 수학적·과학적 정확성 증거로 사용하지 않는다. 문서의 수치 예제 전체를 재실행한 것은 아니며, CUDA 커널이나 GPU 성능을 실제 하드웨어로 측정하지 않았다. 이번 변경에서 예제의 계산 알고리즘은 바꾸지 않았고 퍼셉트론 출력의 설명 문구만 함께 고쳤다.

## 추가 확인이 필요한 범위

- 수정하지 않은 본문·증명·코드 예제의 세부 감수와 전 실행 재현.
- 모델별 최신 config·모델 카드·논문 표의 버전별 대조. 이번에는 공개 구조의 범용성에 대한 단정을 고쳤으며, 모든 수치를 최신 버전으로 재검증하지 않았다.
- 하드웨어 세대별 지연·대역폭·오류 대책과 성능 측정값의 출처별 대조.
- 확률형 보상 관련 법령·시행령·고시의 최신 적용 범위. 법률 설명을 별도로 확정하거나 변경하지 않았다.

## 파일별 수정 내역

### [[트랜지스터에서 자연어까지 13/13] AI 에이전트와 자연어 프로그래밍: 명세와 검증의 시대](../packages/demo/src/posts/abstraction/13-ai-agents.md)

- 타입 검사 대신 테스트가 맡는다는 잘못된 대립 수정

### [[추상 데이터 타입 심화 17/21] 블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합](../packages/demo/src/posts/adt/17-bloom-and-cuckoo-filters.md)

- 거짓 양성률과 모든 응답의 오류율 구분

### [[추상 데이터 타입 심화 8/21] 레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기](../packages/demo/src/posts/adt/8-red-black-tree.md)

- 복잡도·회전 수와 실측 성능 구분

### [[심화 알고리즘 1/14] 스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리](../packages/demo/src/posts/advanced/1-splay-tree.md)

- 바뀐 8편 제목을 시리즈 안내와 이전·다음 글에 반영

### [[심화 알고리즘 14/14] 선형 계획법과 심플렉스: 부등식 제약 아래 최적화](../packages/demo/src/posts/advanced/14-linear-programming-simplex.md)

- 피벗마다 꼭짓점 이동과 목적값 증가가 발생한다는 요약 수정
- 강쌍대성의 존재·유한성 조건 명시

### [[심화 알고리즘 3/14] 웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에](../packages/demo/src/posts/advanced/3-wavelet-tree.md)

- 이론적 비트 공간과 Python 누적 정수 구현 구분
- 산술 비트 수를 실제 측정 메모리로 읽는 오해 수정
- rank 보조 공간 주장 조건 수정
- 정리에서도 이론상 공간과 구현 비용 구분

### [[심화 알고리즘 7/14] Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화](../packages/demo/src/posts/advanced/7-aliens-trick.md)

- 바뀐 8편 제목을 시리즈 안내와 이전·다음 글에 반영

### [[심화 알고리즘 8/14] 접미사 오토마톤: 끝 위치로 부분 문자열 묶기](../packages/demo/src/posts/advanced/8-suffix-automaton.md)

- 최소성의 대상 언어를 잘못 설명한 제목 수정
- 접미사 언어의 최소성과 부분 문자열 경로 판정 구분
- endpos 동치가 접미사 언어의 최소 DFA를 이룸
- 문장 연결 정리
- 정리의 최소성 주장 수정
- 잘못된 단순 일반화 안내 수정

### [[심화 알고리즘 9/14] 헝가리안 알고리즘: 할당 문제를 O(n³)에](../packages/demo/src/posts/advanced/9-hungarian-algorithm.md)

- 바뀐 8편 제목을 시리즈 안내와 이전·다음 글에 반영

### [[AI 기초 3/4] 데이터 분포로 보는 AI 모델](../packages/demo/src/posts/ai/3-data-distribution.md)

- 모델 실패 대부분을 두 원인으로 환원하는 단정 완화
- 실패 원인의 범위 보완

### [[어텐션 1/9] 어텐션의 기본: 쿼리, 키, 값](../packages/demo/src/posts/attention/1-query-key-value.md)

- 정확히 분산 1을 보장한다는 오해 완화

### [[어텐션 3/9] 위치 정보: 사인 위치 인코딩에서 RoPE까지](../packages/demo/src/posts/attention/3-positional-encoding-and-rope.md)

- RoPE 내적은 내용에도 의존함을 반영

### [[어텐션 9/9] 서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩](../packages/demo/src/posts/attention/9-paged-attention-and-flash-decoding.md)

- 단편화가 완전히 사라진다는 단정 수정

### [[미적분 9/10] 최적화: 극값과 볼록 함수](../packages/demo/src/posts/calculus/9-optimization-and-convexity.md)

- 경계와 비미분점 누락 수정
- 본문 1차 조건의 내부점 가정 명시

### [[CPU 마이크로아키텍처 11/12] 멀티코어와 SMT: 하이퍼스레딩, 코어 연결망, NUMA](../packages/demo/src/posts/cpu/11-multicore-smt-numa.md)

- SMT에서 단일 스레드가 반드시 느려진다는 단정 완화

### [[CPU 마이크로아키텍처 2/12] 파이프라인 해저드: 포워딩과 스톨을 사이클 단위로](../packages/demo/src/posts/cpu/2-pipeline-hazards.md)

- 로드 1·분기 2사이클을 모든 CPU의 값으로 일반화하는 문제 수정

### [[고급 자료 구조 3/12] 세그먼트 트리: 구간 질의와 점 갱신](../packages/demo/src/posts/datastructures/3-segment-tree.md)

- 평균 질의 자체가 불가능하다는 오해 수정

### [[이산수학 12/12] 수 체계와 모듈러 연산: 2진수에서 해시까지](../packages/demo/src/posts/discrete/12-number-systems-and-modular-arithmetic.md)

- 모든 정수가 고정 폭이고 순환한다는 단정 수정
- 본문의 오버플로 동작 범위 명시

### [[동적 계획법 2/12] 배낭 문제: 0-1 배낭, 무한 배낭, 메모리 줄이기](../packages/demo/src/posts/dp/2-knapsack.md)

- 판정과 최적화의 복잡도 분류 구분

### [[동적 계획법 5/12] 구간 DP: 행렬 곱셈 순서와 파일 합치기](../packages/demo/src/posts/dp/5-interval-dp.md)

- 허프만 탐욕을 행렬 곱셈에도 적용하는 오해 수정

### [[게임 자원 관리 10/14] 시간 분할: 무거운 일을 여러 프레임에 나누기](../packages/demo/src/posts/gameres/10-time-slicing.md)

- 제너레이터 사용만으로 프레임 시간 상한을 보장한다는 오해 수정
- 협력적 스케줄링의 선점 불가능성과 실측 필요 설명

### [[게임 자원 관리 7/14] 공간 분할 1: 균일 격자와 공간 해싱](../packages/demo/src/posts/gameres/7-uniform-grid-spatial-hashing.md)

- 무한 세계를 고정 메모리로 다룬다는 과장 수정

### [[GPU와 CUDA 11/14] 텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을](../packages/demo/src/posts/gpu/11-tensor-cores.md)

- 모든 텐서 연산이 FP32 누적이라는 인상 수정

### [[GPU와 CUDA 2/14] GPU 하드웨어 구조: GPC, SM, 워프 스케줄러, 텐서 코어](../packages/demo/src/posts/gpu/2-gpu-hardware.md)

- A100 구조를 모든 GPU에 일반화하는 문제 수정

### [[그래프 알고리즘 13/14] 최소 비용 최대 유량: 유량에 가격 붙이기](../packages/demo/src/posts/graph/13-min-cost-max-flow.md)

- 초기 음수 사이클 부재 조건 명시

### [[정보 이론 1/4] 정보량과 엔트로피](../packages/demo/src/posts/infotheory/1-information-and-entropy.md)

- 긴 요약 정리와 압축 모형의 가정 명시
- 부호화 정리에서 독립성과 엔트로피율 구분

### [[언어 기초 3/8] 인터프리터 언어: 실행하면서 번역하기](../packages/demo/src/posts/lang/3-interpreted-languages.md)

- CPython 등 JIT가 필수가 아닌 구현을 포함
- 바이트코드와 JIT 혼동 수정

### [[언어 기초 4/8] 러스트: 가비지 컬렉터 없이 메모리 안전하게](../packages/demo/src/posts/lang/4-rust.md)

- 안전성 보장 범위 명시
- GC와 데이터 경쟁, 정적 검사와 런타임 검사 구분
- 공유 소유권 예외 명시
- Result 미사용은 기본적으로 경고
- panic의 스레드와 프로세스 동작 구분
- 정리의 잘못된 컴파일 오류 주장 수정

### [[언어 기초 5/8] 컴파일 언어: 실행 전에 번역하기](../packages/demo/src/posts/lang/5-compiled-languages.md)

- 컴파일 결과와 시점의 과도한 일반화 수정

### [[신경망 레이어 4/11] LSTM: 게이트로 기억을 관리하기](../packages/demo/src/posts/layers/4-lstm.md)

- 셀 상태가 덧셈만으로 갱신된다는 부정확한 요약 수정

### [[신경망 레이어 6/11] 트랜스포머의 인코더와 디코더](../packages/demo/src/posts/layers/6-transformer-encoder-decoder.md)

- 요약의 인코더·디코더 파라미터 수 구분

### [[신경망 레이어 7/11] 정규화 층: LayerNorm에서 RMSNorm까지](../packages/demo/src/posts/layers/7-normalization-layers.md)

- 모든 트랜스포머가 RMSNorm으로 이전했다는 인상 완화

### [[레벨 디자인과 콘텐츠 제공 13/16] 게임 경제: 재화의 원천과 소모처, 인플레이션](../packages/demo/src/posts/leveldesign/13-game-economy.md)

- 통화 증가와 인플레이션의 필연성 구분
- 물가 설명의 고정 조건 명시

### [[레벨 디자인과 콘텐츠 제공 6/16] 튜토리얼과 온보딩: 레벨이 가르치게 하기](../packages/demo/src/posts/leveldesign/6-tutorial-and-onboarding.md)

- 가상 학습 모형을 실제 이탈 감소의 증거처럼 쓰는 문제 수정

### [[레벨 디자인과 콘텐츠 제공 7/16] 전투 공간 설계: 엄폐, 고저차, 스폰 배치](../packages/demo/src/posts/leveldesign/7-combat-space-design.md)

- 전투 공간의 질을 노출도 하나로 환원하는 문제 수정

### [[선형대수 10/12] 특이값 분해(SVD)](../packages/demo/src/posts/linalg/10-singular-value-decomposition.md)

- 반사도 가능한 직교 변환과 최적성의 노름 명시
- 직교 변환을 회전으로만 설명한 부분 수정

### [[선형대수 5/12] 연립일차방정식과 역행렬](../packages/demo/src/posts/linalg/5-linear-systems-and-inverse.md)

- 가역성 조건 범위 명시와 문장 간결화
- 직사각 행렬도 유일해 가능

### [[선형대수 8/12] 고유값과 고유벡터](../packages/demo/src/posts/linalg/8-eigenvalues-and-eigenvectors.md)

- 음수 고유값에서 방향과 길이 설명 수정
- 거듭제곱법 수렴 조건 보완
- 정리에서도 수렴 조건 유지

### [[수학·기하 알고리즘 12/12] 게임 이론: 님 게임과 스프라그-그런디 정리](../packages/demo/src/posts/mathgeo/12-nim-and-sprague-grundy.md)

- SG 정리의 유한성·공평성·정상 규칙 명시
- 정리에서도 적용 조건 유지

### [[메모리 시스템 5/10] DRAM의 구조: 1T1C 셀, 뱅크, 행 버퍼, 리프레시](../packages/demo/src/posts/memory/5-dram-structure.md)

- 경제성과 물리적 불가능성 구분

### [[메모리 시스템 7/10] 가상 메모리 하드웨어: 페이지 테이블 워크와 TLB](../packages/demo/src/posts/memory/7-page-table-walk-and-tlb.md)

- 48비트 4단계를 x86-64 전체의 고정 사양처럼 설명하는 문제 수정

### [[오픈 웨이트 모델 5/5] config.json으로 모델 구조 읽기](../packages/demo/src/posts/openweight/5-reading-config-json.md)

- 범용 계산기라는 단정 수정
- 지원 구조와 메모리 산정 범위 명시

### [[확률과 분포 10/12] 큰 수의 법칙과 중심 극한 정리](../packages/demo/src/posts/probability/10-law-of-large-numbers-and-clt.md)

- 큰 수의 법칙과 중심 극한 정리의 가정 명시
- 정리의 가정과 표준화 명시

### [[확률과 분포 11/12] 표본 추출과 몬테카를로 방법](../packages/demo/src/posts/probability/11-sampling-and-monte-carlo.md)

- 장황한 도입 요약을 핵심 두 문장으로 수정
- 몬테카를로가 고차원 비용까지 없앤다는 오해 수정

### [[확률과 분포 5/12] 분산, 공분산, 상관계수](../packages/demo/src/posts/probability/5-variance-covariance-correlation.md)

- 독립은 필요조건이 아닌 충분조건
- 무상관과 독립 구분
- 정리의 필요충분조건 수정

### [[양자화 1/15] 양자화의 기본: 실수를 정수 격자에 올리기](../packages/demo/src/posts/quantization/1-quantization-basics.md)

- 균등 잡음이 정확한 분포라는 오해 수정

### [[양자화 13/15] 양자화 인식 학습과 극단적 저비트: QAT, QLoRA, BitNet](../packages/demo/src/posts/quantization/13-qat-qlora-bitnet.md)

- QLoRA를 기반 가중치 QAT와 구분
- 얼린이라는 직역을 고치고 학습 대상 구분
- 비트와 파라미터 수 사이의 필연적 비례 관계 주장 수정

### [[양자화 4/15] 양자화 오차의 전파: 잡음은 층을 지나며 어떻게 커지나](../packages/demo/src/posts/quantization/4-error-propagation.md)

- 3dB 누적과 헤시안 공식을 일반 법칙으로 읽는 문제 수정
- 잡음 모델의 근사 조건 유지
- 기울기 1차 항 생략 조건 명시

### [[양자화 6/15] 잠재 공간과 중첩: 표현에 남은 여유가 줄어들 때](../packages/demo/src/posts/quantization/6-latent-space-superposition.md)

- 중첩된 드문 특징부터 반드시 소실된다는 단정 완화
- 방향별 오차가 같다는 일반화 수정

### [[양자화 7/15] 지식은 몇 비트에 저장되나: 용량과 압축의 한계](../packages/demo/src/posts/quantization/7-knowledge-capacity-bits.md)

- 합성 실험의 2비트 결과를 보편 법칙과 구분
- 논문 결과의 적용 범위 제목에 반영
- 측정 지식량과 보편 용량 구분
- 물리적인 지식 비트 배치로 읽는 오해 수정
- 정보 상한과 성능 예측 구분
- Gardner 결과의 모형·점근적 성격과 보장 구분
- 모형의 직관을 보편적 정의로 쓰는 문제 수정
- 가우시안 율-왜곡 한계의 적용 범위 수정
- 유한 학습 실패로 용량 한계를 확정하는 오류 수정
- 상관과 기제에 대한 설명 구분
- 정리에서도 모형 범위 유지
- 코드 출력과 설명의 보장 표현 일치
- 본문에서도 유한 데이터의 보장과 점근적 경계 구분
- 정보 상한에서 학습법의 필연성을 도출하는 문제 수정

### [[양자화 8/15] 왜 드문 지식이 먼저 사라지나: 데이터 분포와 롱테일](../packages/demo/src/posts/quantization/8-long-tail-knowledge.md)

- 롱테일 손실의 필연성과 동일 잡음 가정 수정
- 인과 법칙처럼 보이는 제목 수정
- 유도식의 가정 명시
- 최대 경쟁자 변경과 다중 후보를 무시한 근사임을 명시
- 동일 잡음과 비트당 배율의 근사 조건 명시
- 잡음 모형의 확률과 원본 정확도 혼동 수정
- 불필요한 필연성 표현 제거
- 장난감 실험의 결론을 보편 법칙으로 쓰는 문제 수정
- 정리에서도 가정 유지
- 결론의 과도한 단정 수정
- 마진 도함수 계산에서 고정하는 변수 명시
- 정보 상한과 잡음 모델의 구분
- 요약 논리에서도 가정 보존
- 한 경쟁자 근사의 조건 및 과장 표현 수정
- 평균 지표의 가중 방식 구분
- 관련 글 설명에 남은 보편적 주장 수정

### [[게임 셰이더 13/16] 정점 애니메이션: 스키닝, 파도, 바람](../packages/demo/src/posts/shader/13-vertex-animation.md)

- 듀얼 쿼터니언의 부피 보존을 일반 보장으로 쓰는 문제 수정

### [[게임 셰이더 8/16] 물리 기반 렌더링: 마이크로패싯 BRDF와 GGX](../packages/demo/src/posts/shader/8-pbr-microfacet-ggx.md)

- GGX 정규화 적분의 코사인 가중 누락 및 시각적 동일성 과장 수정
- 단순 확산+정반사 예제의 에너지 보존 한계 명시

### [[통계학 3/11] 추정량의 성질: 편향과 분산](../packages/demo/src/posts/statistics/3-bias-and-variance.md)

- 편향과 분산이 반드시 반대로 움직인다는 인상을 줄이는 요약

### [[통계학 5/11] 신뢰 구간: 추정의 불확실성 표현하기](../packages/demo/src/posts/statistics/5-confidence-intervals.md)

- 긴 요약을 줄이고 빈도주의 해석을 명확히 함
- 정규 근사의 확률 등호를 근사로 수정
- z 근사와 정규 모집단 t 구간을 구분
- 표본 평균 근사의 가정 명시
- 신뢰 구간 겹침을 차이 검정으로 쓰는 오류 수정
- 성능 비교에서 차이의 불확실성으로 수정
- 정리에서도 근사임을 유지
- t 구간이 모든 작은 표본에서 정확하다는 오해 수정

### [[통계학 7/11] A/B 테스트: 실험으로 결정하기](../packages/demo/src/posts/statistics/7-ab-testing.md)

- 순차 검정까지 금지하는 듯한 표현과 긴 요약 수정

### [[알고리즘 기법 7/14] 그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건](../packages/demo/src/posts/techniques/7-greedy.md)

- 교환 논증만이 유일한 정확성 증명 방법이라는 오해 수정
- 정리에서도 증명 방법의 범위 수정

