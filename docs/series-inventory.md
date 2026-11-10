# 포스트와 시리즈 목록

> 최신 dev 통합 안내: 현재 사이트는 34개 시리즈·396편이다. 아래 목록은 최초 검토 당시의 27개 시리즈·313편을 기록한다. 추가된 7개 시리즈·83편도 시각화를 연결했으며, 원문 전체 감수를 했다는 뜻은 아니다.

검토 기준: `main`의 `83dfff8`에서 분기한 `docs/renewal`.

27개 시리즈, 총 313편. 시리즈 정의(`src/site/series.ts`)와 원문 제목의 시리즈명·순서·전체 편수를 대조했다. 아래의 ‘목록·요약 검토’는 주제와 요약·정리 중심으로 살펴봤다는 뜻이며, 본문 전체의 사실관계나 모든 예제 실행을 검증했다는 표시는 아니다. 수정 이유와 검증 범위는 [검토 기록](post-review.md)에 있다.

| 시리즈 | 편수 | 다루는 내용 |
|---|---|---|
| [언어 기초](#lang) | 8 | 프로그래밍 언어가 실행되는 방식: 파이썬, 러스트, 자바스크립트, 자바, 컴파일과 링크 |
| [AI 기초](#ai) | 4 | 딥러닝과 강화학습, 데이터 분포와 컴퓨터 사이언스로 보는 AI 모델 |
| [이산수학](#discrete) | 12 | 집합, 논리, 그래프, 점근 표기법: 프로그래밍의 바탕이 되는 수학 |
| [확률과 분포](#probability) | 12 | 확률의 기초부터 정규 분포, 중심 극한 정리, 마르코프 연쇄까지 |
| [통계학](#statistics) | 11 | 추정, 검정, 회귀, 베이즈 추론, 모델 평가 |
| [선형대수](#linalg) | 12 | 벡터와 행렬, 고유값, SVD, PCA, 텐서 |
| [미적분](#calculus) | 10 | 극한과 미분, 연쇄 법칙, 그래디언트, 경사 하강법 |
| [정보 이론](#infotheory) | 4 | 엔트로피, 교차 엔트로피, KL 발산, 상호 정보량 |
| [어텐션](#attention) | 9 | 어텐션의 기본부터 RoPE, KV 캐시, 리니어·플래시·세이지 어텐션까지 |
| [신경망 레이어](#layers) | 11 | 선형·합성곱·순환 층에서 트랜스포머, MoE, 맘바, Gated DeltaNet까지 |
| [오픈 웨이트 모델](#openweight) | 5 | 라마, 젬마, 딥시크, Qwen 같은 공개 모델이 레이어를 조합하는 방식 |
| [양자화](#quantization) | 15 | 수 형식과 분포, 임베딩·잠재 공간, 양자화로 지식이 사라지는 이유, GPTQ·AWQ부터 QAT까지 |
| [트랜지스터에서 자연어까지](#abstraction) | 13 | 트랜지스터와 논리 회로, CPU와 기계어, 어셈블러·컴파일러·운영체제, 고수준 언어를 지나 자연어 프로그래밍까지 층마다 일어나는 변환 |
| [알고리즘 기법](#techniques) | 14 | 복잡도 어림, 백트래킹, 매개 변수 탐색, 투 포인터, 슬라이딩 윈도우, 누적 합, 그리디, 분할 정복, 단조 스택, 스위핑, 비트마스킹, 중간에서 만나기, Mo's, 무작위 알고리즘 |
| [동적 계획법](#dp) | 12 | 배낭, LIS, LCS·편집 거리, 구간·비트마스크·트리·자릿수·기댓값 DP, 볼록 껍질 트릭, 분할 정복·크누스 최적화, SOS DP |
| [고급 자료 구조](#datastructures) | 12 | 힙, 유니온 파인드, 세그먼트 트리와 레이지 전파, 펜윅 트리, 희소 테이블, 트라이, 트립, 퍼시스턴트 세그먼트 트리, LCA, HLD, 센트로이드 분할 |
| [그래프 알고리즘](#graph) | 14 | 0-1 BFS, 최단 경로, 최소 신장 트리, SCC와 2-SAT, 단절점, 오일러 경로, 네트워크 플로우·이분 매칭·최소 비용 유량 |
| [문자열 알고리즘](#strings) | 6 | 문자열 해싱, KMP, Z 알고리즘, 아호-코라식, 접미사 배열, Manacher |
| [수학·기하 알고리즘](#mathgeo) | 12 | 확장 유클리드, 체, 행렬 거듭제곱, 중국인의 나머지 정리, 뤼카, 밀러-라빈, FFT, 가우스 소거, CCW, 볼록 껍질, 스프라그-그런디 |
| [게임 자원 관리](#gameres) | 14 | 프레임 예산, 오브젝트 풀링, 메모리 할당자, 캐시 교체, 에셋 스트리밍, 공간 분할, 컬링·LOD, 시간 분할, 경로 탐색, 아틀라스 패킹, 대역폭 절약 |
| [심화 알고리즘](#advanced) | 14 | 스플레이·링크-컷 트리, 웨이블릿 트리, 병렬 이분 탐색·CDQ, 오프라인 동적 연결성, 슬로프 트릭, Aliens 트릭, 접미사 오토마톤, 헝가리안, 꽃 알고리즘, 지배자 트리, 전역 최소 컷, 벌레캄프-매시, 심플렉스 |
| [추상 데이터 타입 심화](#adt) | 21 | 스택 두 개 큐, 이중·병합 가능·피보나치 힙, AVL·레드-블랙·B-트리, 스킵 리스트, 희생양 트리, 순위 통계·구간 트리, k-d 트리, 기수 트리, 반 엠데 보아스, 해시 테이블, 블룸 필터, 스트림 요약, 퍼시스턴트 구조, 로프·핑거 트리, LSM 트리 |
| [CPU 마이크로아키텍처](#cpu) | 12 | 파이프라인 해저드, 분기 예측, 비순차 실행과 재정렬 버퍼, 마이크로 연산 해독, 실행 포트, SIMD, 캐시 일관성, 메모리 일관성 모델, SMT·NUMA, 전력과 클록 |
| [메모리 시스템](#memory) | 10 | 메모리 계층, SRAM 캐시 구조와 미스, 캐시를 아는 코드, DRAM 뱅크와 행 버퍼, DDR과 메모리 컨트롤러, TLB와 페이지 테이블 워크, HBM·GDDR, 플래시와 FTL, ECC |
| [GPU와 CUDA](#gpu) | 14 | GPU 구조(SM·워프·텐서 코어), SIMT, CUDA 프로그래밍 모델과 메모리 계층, 병합 접근, 뱅크 충돌, 점유율, 리덕션, 행렬 곱 최적화, 스트림, 루프라인, 멀티 GPU 통신 |
| [게임 셰이더](#shader) | 16 | 렌더링 파이프라인, 좌표 변환, 래스터화와 보간, GLSL과 절차적 패턴, 텍스처 샘플링, 조명 모델, 법선 맵, PBR, 이미지 기반 조명, 감마와 톤 매핑, 그림자, 투명도, 정점 애니메이션, 포스트 프로세싱, 디퍼드·포워드+, 셰이더 성능 |
| [레벨 디자인과 콘텐츠 제공](#leveldesign) | 16 | 플레이어 메트릭, 동선과 시야, 레벨 그래프, 열쇠와 자물쇠, 페이싱, 온보딩, 전투 공간, 동적 난이도, 절차적 생성(BSP·셀룰러 오토마타·WFC), 진행과 보상, 확률형 보상, 게임 경제, 라이브 서비스, 텔레메트리, 콘텐츠 파이프라인 |

<a id="lang"></a>
## 언어 기초

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [프로그래밍 언어란 무엇인가](../packages/demo/src/posts/lang/1-programming-languages.md) | 목록·요약 검토 |
| 2 | [파이썬: 읽기 쉬운 코드를 위한 언어](../packages/demo/src/posts/lang/2-python.md) | 목록·요약 검토 |
| 3 | [인터프리터 언어: 실행하면서 번역하기](../packages/demo/src/posts/lang/3-interpreted-languages.md) | 수정 |
| 4 | [러스트: 가비지 컬렉터 없이 메모리 안전하게](../packages/demo/src/posts/lang/4-rust.md) | 수정 |
| 5 | [컴파일 언어: 실행 전에 번역하기](../packages/demo/src/posts/lang/5-compiled-languages.md) | 수정 |
| 6 | [어셈블리와 컴파일·링크: 소스 코드가 실행 파일이 되기까지](../packages/demo/src/posts/lang/6-assembly-and-linking.md) | 목록·요약 검토 |
| 7 | [자바스크립트: 브라우저에서 npm까지](../packages/demo/src/posts/lang/7-javascript.md) | 목록·요약 검토 |
| 8 | [자바와 JVM: 한 번 작성하면 어디서나 실행](../packages/demo/src/posts/lang/8-java-and-jvm.md) | 목록·요약 검토 |

<a id="ai"></a>
## AI 기초

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [딥러닝: 특징까지 스스로 배우는 머신러닝](../packages/demo/src/posts/ai/1-deep-learning.md) | 목록·요약 검토 |
| 2 | [강화학습: 보상으로 배우는 머신러닝](../packages/demo/src/posts/ai/2-reinforcement-learning.md) | 목록·요약 검토 |
| 3 | [데이터 분포로 보는 AI 모델](../packages/demo/src/posts/ai/3-data-distribution.md) | 수정 |
| 4 | [컴퓨터 사이언스로 보는 AI 모델: 텐서, 연산, 메모리](../packages/demo/src/posts/ai/4-computer-science.md) | 목록·요약 검토 |

<a id="discrete"></a>
## 이산수학

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [집합과 함수: 수학의 기본 언어](../packages/demo/src/posts/discrete/1-sets-and-functions.md) | 목록·요약 검토 |
| 2 | [명제 논리와 불 대수: 참과 거짓의 계산](../packages/demo/src/posts/discrete/2-propositional-logic.md) | 목록·요약 검토 |
| 3 | [술어 논리와 증명: '모든'과 '어떤'을 다루기](../packages/demo/src/posts/discrete/3-predicate-logic-and-proof.md) | 목록·요약 검토 |
| 4 | [수학적 귀납법과 재귀](../packages/demo/src/posts/discrete/4-induction-and-recursion.md) | 목록·요약 검토 |
| 5 | [관계: 동치 관계와 순서 관계](../packages/demo/src/posts/discrete/5-relations.md) | 목록·요약 검토 |
| 6 | [경우의 수: 순열과 조합](../packages/demo/src/posts/discrete/6-permutations-and-combinations.md) | 목록·요약 검토 |
| 7 | [비둘기집 원리와 포함·배제의 원리](../packages/demo/src/posts/discrete/7-pigeonhole-and-inclusion-exclusion.md) | 목록·요약 검토 |
| 8 | [그래프의 기초: 정점과 간선](../packages/demo/src/posts/discrete/8-graph-basics.md) | 목록·요약 검토 |
| 9 | [트리: 계층 구조와 구문 트리](../packages/demo/src/posts/discrete/9-trees.md) | 목록·요약 검토 |
| 10 | [그래프 탐색: BFS, DFS, 위상 정렬](../packages/demo/src/posts/discrete/10-graph-search.md) | 목록·요약 검토 |
| 11 | [점근 표기법: 알고리즘의 비용 세기](../packages/demo/src/posts/discrete/11-asymptotic-notation.md) | 목록·요약 검토 |
| 12 | [수 체계와 모듈러 연산: 2진수에서 해시까지](../packages/demo/src/posts/discrete/12-number-systems-and-modular-arithmetic.md) | 수정 |

<a id="probability"></a>
## 확률과 분포

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [확률의 기초: 표본 공간, 사건, 공리](../packages/demo/src/posts/probability/1-probability-basics.md) | 목록·요약 검토 |
| 2 | [조건부 확률과 독립](../packages/demo/src/posts/probability/2-conditional-probability.md) | 목록·요약 검토 |
| 3 | [베이즈 정리: 증거로 믿음을 고치기](../packages/demo/src/posts/probability/3-bayes-theorem.md) | 목록·요약 검토 |
| 4 | [확률 변수와 기댓값](../packages/demo/src/posts/probability/4-random-variables-and-expectation.md) | 목록·요약 검토 |
| 5 | [분산, 공분산, 상관계수](../packages/demo/src/posts/probability/5-variance-covariance-correlation.md) | 수정 |
| 6 | [이산 분포: 베르누이, 이항, 기하, 포아송](../packages/demo/src/posts/probability/6-discrete-distributions.md) | 목록·요약 검토 |
| 7 | [연속 분포와 확률 밀도 함수](../packages/demo/src/posts/probability/7-continuous-distributions.md) | 목록·요약 검토 |
| 8 | [정규 분포: 종 모양 곡선의 정체](../packages/demo/src/posts/probability/8-normal-distribution.md) | 목록·요약 검토 |
| 9 | [결합 분포, 주변 분포, 조건부 분포](../packages/demo/src/posts/probability/9-joint-marginal-conditional.md) | 목록·요약 검토 |
| 10 | [큰 수의 법칙과 중심 극한 정리](../packages/demo/src/posts/probability/10-law-of-large-numbers-and-clt.md) | 수정 |
| 11 | [표본 추출과 몬테카를로 방법](../packages/demo/src/posts/probability/11-sampling-and-monte-carlo.md) | 수정 |
| 12 | [마르코프 연쇄: 현재만 기억하는 확률 과정](../packages/demo/src/posts/probability/12-markov-chains.md) | 목록·요약 검토 |

<a id="statistics"></a>
## 통계학

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [기술 통계: 데이터를 숫자 몇 개로 요약하기](../packages/demo/src/posts/statistics/1-descriptive-statistics.md) | 목록·요약 검토 |
| 2 | [모집단, 표본, 표본 분포](../packages/demo/src/posts/statistics/2-population-and-sampling.md) | 목록·요약 검토 |
| 3 | [추정량의 성질: 편향과 분산](../packages/demo/src/posts/statistics/3-bias-and-variance.md) | 수정 |
| 4 | [최대 우도 추정](../packages/demo/src/posts/statistics/4-maximum-likelihood.md) | 목록·요약 검토 |
| 5 | [신뢰 구간: 추정의 불확실성 표현하기](../packages/demo/src/posts/statistics/5-confidence-intervals.md) | 수정 |
| 6 | [가설 검정과 p값](../packages/demo/src/posts/statistics/6-hypothesis-testing.md) | 목록·요약 검토 |
| 7 | [A/B 테스트: 실험으로 결정하기](../packages/demo/src/posts/statistics/7-ab-testing.md) | 수정 |
| 8 | [선형 회귀와 최소제곱법](../packages/demo/src/posts/statistics/8-linear-regression.md) | 목록·요약 검토 |
| 9 | [로지스틱 회귀: 확률을 예측하는 회귀](../packages/demo/src/posts/statistics/9-logistic-regression.md) | 목록·요약 검토 |
| 10 | [베이즈 추론: 사전 분포에서 사후 분포로](../packages/demo/src/posts/statistics/10-bayesian-inference.md) | 목록·요약 검토 |
| 11 | [모델 평가: 교차 검증과 평가 지표](../packages/demo/src/posts/statistics/11-model-evaluation.md) | 목록·요약 검토 |

<a id="linalg"></a>
## 선형대수

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [벡터: 숫자의 목록이자 공간의 화살표](../packages/demo/src/posts/linalg/1-vectors.md) | 목록·요약 검토 |
| 2 | [내적과 코사인 유사도](../packages/demo/src/posts/linalg/2-dot-product-and-cosine-similarity.md) | 목록·요약 검토 |
| 3 | [행렬과 행렬 곱](../packages/demo/src/posts/linalg/3-matrices-and-matrix-multiplication.md) | 목록·요약 검토 |
| 4 | [선형 변환으로서의 행렬](../packages/demo/src/posts/linalg/4-matrices-as-linear-transformations.md) | 목록·요약 검토 |
| 5 | [연립일차방정식과 역행렬](../packages/demo/src/posts/linalg/5-linear-systems-and-inverse.md) | 수정 |
| 6 | [일차 독립, 기저, 차원, 랭크](../packages/demo/src/posts/linalg/6-independence-basis-dimension-rank.md) | 목록·요약 검토 |
| 7 | [행렬식: 부피가 변하는 비율](../packages/demo/src/posts/linalg/7-determinant.md) | 목록·요약 검토 |
| 8 | [고유값과 고유벡터](../packages/demo/src/posts/linalg/8-eigenvalues-and-eigenvectors.md) | 수정 |
| 9 | [직교성과 사영](../packages/demo/src/posts/linalg/9-orthogonality-and-projection.md) | 목록·요약 검토 |
| 10 | [특이값 분해(SVD)](../packages/demo/src/posts/linalg/10-singular-value-decomposition.md) | 수정 |
| 11 | [주성분 분석(PCA): 차원 축소](../packages/demo/src/posts/linalg/11-principal-component-analysis.md) | 목록·요약 검토 |
| 12 | [텐서와 브로드캐스팅: 코드 속의 선형대수](../packages/demo/src/posts/linalg/12-tensors-and-broadcasting.md) | 목록·요약 검토 |

<a id="calculus"></a>
## 미적분

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [함수와 극한](../packages/demo/src/posts/calculus/1-functions-and-limits.md) | 목록·요약 검토 |
| 2 | [미분: 순간 변화율](../packages/demo/src/posts/calculus/2-derivatives.md) | 목록·요약 검토 |
| 3 | [미분 규칙과 연쇄 법칙](../packages/demo/src/posts/calculus/3-differentiation-rules-and-chain-rule.md) | 목록·요약 검토 |
| 4 | [지수 함수와 로그 함수](../packages/demo/src/posts/calculus/4-exponential-and-logarithm.md) | 목록·요약 검토 |
| 5 | [적분: 넓이와 누적](../packages/demo/src/posts/calculus/5-integrals.md) | 목록·요약 검토 |
| 6 | [테일러 급수: 복잡한 함수를 다항식으로](../packages/demo/src/posts/calculus/6-taylor-series.md) | 목록·요약 검토 |
| 7 | [편미분과 그래디언트](../packages/demo/src/posts/calculus/7-partial-derivatives-and-gradient.md) | 목록·요약 검토 |
| 8 | [다변수 연쇄 법칙과 야코비 행렬](../packages/demo/src/posts/calculus/8-multivariable-chain-rule-and-jacobian.md) | 목록·요약 검토 |
| 9 | [최적화: 극값과 볼록 함수](../packages/demo/src/posts/calculus/9-optimization-and-convexity.md) | 수정 |
| 10 | [경사 하강법의 수학](../packages/demo/src/posts/calculus/10-gradient-descent.md) | 목록·요약 검토 |

<a id="infotheory"></a>
## 정보 이론

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [정보량과 엔트로피](../packages/demo/src/posts/infotheory/1-information-and-entropy.md) | 수정 |
| 2 | [교차 엔트로피](../packages/demo/src/posts/infotheory/2-cross-entropy.md) | 목록·요약 검토 |
| 3 | [KL 발산](../packages/demo/src/posts/infotheory/3-kl-divergence.md) | 목록·요약 검토 |
| 4 | [상호 정보량](../packages/demo/src/posts/infotheory/4-mutual-information.md) | 목록·요약 검토 |

<a id="attention"></a>
## 어텐션

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [어텐션의 기본: 쿼리, 키, 값](../packages/demo/src/posts/attention/1-query-key-value.md) | 수정 |
| 2 | [멀티헤드 어텐션과 마스크](../packages/demo/src/posts/attention/2-multi-head-attention-and-masks.md) | 목록·요약 검토 |
| 3 | [위치 정보: 사인 위치 인코딩에서 RoPE까지](../packages/demo/src/posts/attention/3-positional-encoding-and-rope.md) | 수정 |
| 4 | [KV 캐시와 MQA·GQA·MLA](../packages/demo/src/posts/attention/4-kv-cache-mqa-gqa-mla.md) | 목록·요약 검토 |
| 5 | [슬라이딩 윈도와 희소 어텐션](../packages/demo/src/posts/attention/5-sliding-window-and-sparse-attention.md) | 목록·요약 검토 |
| 6 | [리니어 어텐션: 소프트맥스 없이 순서를 바꾸기](../packages/demo/src/posts/attention/6-linear-attention.md) | 목록·요약 검토 |
| 7 | [플래시 어텐션: 메모리 계층을 아는 정확한 어텐션](../packages/demo/src/posts/attention/7-flash-attention.md) | 목록·요약 검토 |
| 8 | [세이지 어텐션: 양자화로 더 빠르게](../packages/demo/src/posts/attention/8-sage-attention.md) | 목록·요약 검토 |
| 9 | [서빙을 위한 어텐션: 페이지드 어텐션과 플래시 디코딩](../packages/demo/src/posts/attention/9-paged-attention-and-flash-decoding.md) | 수정 |

<a id="layers"></a>
## 신경망 레이어

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [선형 층: 모든 신경망의 기본 부품](../packages/demo/src/posts/layers/1-linear-layer.md) | 목록·요약 검토 |
| 2 | [합성곱 층: 가까운 것끼리 보는 레이어](../packages/demo/src/posts/layers/2-convolution-layer.md) | 목록·요약 검토 |
| 3 | [순환 층(RNN): 상태를 이어 가는 레이어](../packages/demo/src/posts/layers/3-recurrent-layer.md) | 목록·요약 검토 |
| 4 | [LSTM: 게이트로 기억을 관리하기](../packages/demo/src/posts/layers/4-lstm.md) | 수정 |
| 5 | [GRU: 더 단순한 게이트 순환 층](../packages/demo/src/posts/layers/5-gru.md) | 목록·요약 검토 |
| 6 | [트랜스포머의 인코더와 디코더](../packages/demo/src/posts/layers/6-transformer-encoder-decoder.md) | 수정 |
| 7 | [정규화 층: LayerNorm에서 RMSNorm까지](../packages/demo/src/posts/layers/7-normalization-layers.md) | 수정 |
| 8 | [피드포워드 층의 진화: GELU에서 SwiGLU까지](../packages/demo/src/posts/layers/8-feed-forward-swiglu.md) | 목록·요약 검토 |
| 9 | [전문가 혼합(MoE) 층](../packages/demo/src/posts/layers/9-mixture-of-experts.md) | 목록·요약 검토 |
| 10 | [상태 공간 모델과 맘바](../packages/demo/src/posts/layers/10-state-space-models-mamba.md) | 목록·요약 검토 |
| 11 | [델타 규칙과 Gated DeltaNet](../packages/demo/src/posts/layers/11-delta-rule-gated-deltanet.md) | 목록·요약 검토 |

<a id="openweight"></a>
## 오픈 웨이트 모델

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [오픈 웨이트 모델의 표준 블록: 라마 3 해부](../packages/demo/src/posts/openweight/1-llama-3-anatomy.md) | 목록·요약 검토 |
| 2 | [긴 문맥을 위한 어텐션 배치: 미스트랄, 젬마, gpt-oss](../packages/demo/src/posts/openweight/2-long-context-attention-layouts.md) | 목록·요약 검토 |
| 3 | [MoE 모델: 믹스트랄, 딥시크-V3, Qwen3](../packages/demo/src/posts/openweight/3-moe-models.md) | 목록·요약 검토 |
| 4 | [하이브리드 모델: 리니어 어텐션과 어텐션 섞기](../packages/demo/src/posts/openweight/4-hybrid-models.md) | 목록·요약 검토 |
| 5 | [config.json으로 모델 구조 읽기](../packages/demo/src/posts/openweight/5-reading-config-json.md) | 수정 |

<a id="quantization"></a>
## 양자화

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [양자화의 기본: 실수를 정수 격자에 올리기](../packages/demo/src/posts/quantization/1-quantization-basics.md) | 수정 |
| 2 | [수 형식의 지도: FP32에서 FP4까지](../packages/demo/src/posts/quantization/2-number-formats.md) | 목록·요약 검토 |
| 3 | [가중치와 활성값의 분포: 이상치가 비트를 낭비하는 이유](../packages/demo/src/posts/quantization/3-weight-activation-distributions.md) | 목록·요약 검토 |
| 4 | [양자화 오차의 전파: 잡음은 층을 지나며 어떻게 커지나](../packages/demo/src/posts/quantization/4-error-propagation.md) | 수정 |
| 5 | [임베딩 공간의 기하: 양자화가 이웃 관계를 흔드는 방식](../packages/demo/src/posts/quantization/5-embedding-space.md) | 목록·요약 검토 |
| 6 | [잠재 공간과 중첩: 표현에 남은 여유가 줄어들 때](../packages/demo/src/posts/quantization/6-latent-space-superposition.md) | 수정 |
| 7 | [지식은 몇 비트에 저장되나: 용량과 압축의 한계](../packages/demo/src/posts/quantization/7-knowledge-capacity-bits.md) | 수정 |
| 8 | [왜 드문 지식이 먼저 사라지나: 데이터 분포와 롱테일](../packages/demo/src/posts/quantization/8-long-tail-knowledge.md) | 수정 |
| 9 | [학습 후 양자화의 기본: 반올림, 클리핑, 비균일 격자](../packages/demo/src/posts/quantization/9-post-training-quantization.md) | 목록·요약 검토 |
| 10 | [이상치 다루기: LLM.int8(), SmoothQuant, 회전](../packages/demo/src/posts/quantization/10-outlier-handling.md) | 목록·요약 검토 |
| 11 | [오차를 보정하는 양자화: GPTQ와 AWQ](../packages/demo/src/posts/quantization/11-gptq-awq.md) | 목록·요약 검토 |
| 12 | [KV 캐시·활성값·FP8: 추론과 학습의 저정밀화](../packages/demo/src/posts/quantization/12-kv-cache-activation-fp8.md) | 목록·요약 검토 |
| 13 | [양자화 인식 학습과 극단적 저비트: QAT, QLoRA, BitNet](../packages/demo/src/posts/quantization/13-qat-qlora-bitnet.md) | 수정 |
| 14 | [GGUF: 양자화 모델을 담는 파일과 k-quant](../packages/demo/src/posts/quantization/14-gguf.md) | 목록·요약 검토 |
| 15 | [CPU 오프로드: GPU 메모리보다 큰 모델 돌리기](../packages/demo/src/posts/quantization/15-cpu-offload.md) | 목록·요약 검토 |

<a id="abstraction"></a>
## 트랜지스터에서 자연어까지

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [트랜지스터: 전기로 만든 스위치와 0·1의 탄생](../packages/demo/src/posts/abstraction/1-transistor.md) | 목록·요약 검토 |
| 2 | [논리 게이트: 스위치로 불 대수를 만들기](../packages/demo/src/posts/abstraction/2-logic-gates.md) | 목록·요약 검토 |
| 3 | [조합 회로: 덧셈기에서 ALU까지](../packages/demo/src/posts/abstraction/3-combinational-circuits.md) | 목록·요약 검토 |
| 4 | [순차 회로: 클록, 플립플롭, 메모리](../packages/demo/src/posts/abstraction/4-sequential-circuits.md) | 목록·요약 검토 |
| 5 | [CPU의 구조: 명령어를 실행하는 기계](../packages/demo/src/posts/abstraction/5-cpu.md) | 목록·요약 검토 |
| 6 | [명령어 집합: 하드웨어와 소프트웨어의 약속](../packages/demo/src/posts/abstraction/6-instruction-set.md) | 목록·요약 검토 |
| 7 | [빠르게 만드는 기술: 파이프라인, 캐시, 병렬성](../packages/demo/src/posts/abstraction/7-performance.md) | 목록·요약 검토 |
| 8 | [어셈블러: 기호를 기계어로 바꾸기](../packages/demo/src/posts/abstraction/8-assembler.md) | 목록·요약 검토 |
| 9 | [컴파일러: 식과 문장을 명령어로 바꾸기](../packages/demo/src/posts/abstraction/9-compiler.md) | 목록·요약 검토 |
| 10 | [운영체제: 기계를 나눠 쓰게 하는 층](../packages/demo/src/posts/abstraction/10-operating-system.md) | 목록·요약 검토 |
| 11 | [프로그래밍 언어의 진화: 포트란에서 파이썬까지](../packages/demo/src/posts/abstraction/11-language-evolution.md) | 목록·요약 검토 |
| 12 | [자연어에서 코드로: 언어 모델이 프로그램을 쓰는 원리](../packages/demo/src/posts/abstraction/12-code-language-models.md) | 목록·요약 검토 |
| 13 | [AI 에이전트와 자연어 프로그래밍: 명세와 검증의 시대](../packages/demo/src/posts/abstraction/13-ai-agents.md) | 수정 |

<a id="techniques"></a>
## 알고리즘 기법

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [입력 크기로 알고리즘 고르기: 복잡도 어림과 문제 읽기](../packages/demo/src/posts/techniques/1-choosing-by-input-size.md) | 목록·요약 검토 |
| 2 | [완전 탐색과 백트래킹: 모든 경우를 보되 가지를 친다](../packages/demo/src/posts/techniques/2-brute-force-backtracking.md) | 목록·요약 검토 |
| 3 | [이분 탐색과 매개 변수 탐색: 답을 정해 놓고 판정하기](../packages/demo/src/posts/techniques/3-binary-search-parametric.md) | 목록·요약 검토 |
| 4 | [투 포인터: 두 끝을 움직여 O(n)에 구간 찾기](../packages/demo/src/posts/techniques/4-two-pointers.md) | 목록·요약 검토 |
| 5 | [슬라이딩 윈도우와 단조 덱: 구간 최솟값을 한 번에](../packages/demo/src/posts/techniques/5-sliding-window-monotonic-deque.md) | 목록·요약 검토 |
| 6 | [누적 합과 차분 배열: 구간 합과 구간 갱신을 O(1)로](../packages/demo/src/posts/techniques/6-prefix-sum-difference-array.md) | 목록·요약 검토 |
| 7 | [그리디 알고리즘: 지금 최선이 전체 최선이 되는 조건](../packages/demo/src/posts/techniques/7-greedy.md) | 수정 |
| 8 | [분할 정복: 나누고 풀고 합치기](../packages/demo/src/posts/techniques/8-divide-and-conquer.md) | 목록·요약 검토 |
| 9 | [단조 스택: 가장 가까운 큰 수와 히스토그램](../packages/demo/src/posts/techniques/9-monotonic-stack.md) | 목록·요약 검토 |
| 10 | [좌표 압축과 스위핑: 정렬해 놓고 한 방향으로 쓸기](../packages/demo/src/posts/techniques/10-coordinate-compression-and-sweeping.md) | 목록·요약 검토 |
| 11 | [비트마스킹: 정수 하나로 집합 다루기](../packages/demo/src/posts/techniques/11-bitmasking.md) | 목록·요약 검토 |
| 12 | [중간에서 만나기: 지수를 절반으로 줄이는 기법](../packages/demo/src/posts/techniques/12-meet-in-the-middle.md) | 목록·요약 검토 |
| 13 | [제곱근 분할과 Mo's 알고리즘: 질의 순서를 바꿔 빠르게](../packages/demo/src/posts/techniques/13-sqrt-decomposition-and-mo.md) | 목록·요약 검토 |
| 14 | [무작위 알고리즘: 퀵셀렉트, 저수지 표집, 해시 충돌 막기](../packages/demo/src/posts/techniques/14-randomized-algorithms.md) | 목록·요약 검토 |

<a id="dp"></a>
## 동적 계획법

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [동적 계획법의 기본: 부분 문제와 점화식](../packages/demo/src/posts/dp/1-dp-basics.md) | 목록·요약 검토 |
| 2 | [배낭 문제: 0-1 배낭, 무한 배낭, 메모리 줄이기](../packages/demo/src/posts/dp/2-knapsack.md) | 수정 |
| 3 | [최장 증가 부분 수열: O(n²)에서 O(n log n)으로](../packages/demo/src/posts/dp/3-lis.md) | 목록·요약 검토 |
| 4 | [LCS와 편집 거리: 두 문자열을 맞추는 DP](../packages/demo/src/posts/dp/4-lcs-edit-distance.md) | 목록·요약 검토 |
| 5 | [구간 DP: 행렬 곱셈 순서와 파일 합치기](../packages/demo/src/posts/dp/5-interval-dp.md) | 수정 |
| 6 | [비트마스크 DP: 외판원 순회 문제](../packages/demo/src/posts/dp/6-bitmask-dp-tsp.md) | 목록·요약 검토 |
| 7 | [트리 DP: 독립 집합과 리루팅](../packages/demo/src/posts/dp/7-tree-dp.md) | 목록·요약 검토 |
| 8 | [자릿수 DP: 조건을 만족하는 수 세기](../packages/demo/src/posts/dp/8-digit-dp.md) | 목록·요약 검토 |
| 9 | [확률과 기댓값 DP](../packages/demo/src/posts/dp/9-expectation-dp.md) | 목록·요약 검토 |
| 10 | [볼록 껍질 트릭: 직선들의 최솟값으로 DP 가속하기](../packages/demo/src/posts/dp/10-convex-hull-trick.md) | 목록·요약 검토 |
| 11 | [분할 정복 최적화와 크누스 최적화](../packages/demo/src/posts/dp/11-divide-conquer-and-knuth-optimization.md) | 목록·요약 검토 |
| 12 | [부분집합 합 DP(SOS DP): 모든 부분집합에 대한 합을 빠르게](../packages/demo/src/posts/dp/12-sum-over-subsets-dp.md) | 목록·요약 검토 |

<a id="datastructures"></a>
## 고급 자료 구조

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [힙과 우선순위 큐: 가장 급한 것부터 꺼내기](../packages/demo/src/posts/datastructures/1-heap-priority-queue.md) | 목록·요약 검토 |
| 2 | [유니온 파인드: 경로 압축과 랭크](../packages/demo/src/posts/datastructures/2-union-find.md) | 목록·요약 검토 |
| 3 | [세그먼트 트리: 구간 질의와 점 갱신](../packages/demo/src/posts/datastructures/3-segment-tree.md) | 수정 |
| 4 | [느리게 갱신되는 세그먼트 트리: 구간 갱신](../packages/demo/src/posts/datastructures/4-lazy-segment-tree.md) | 목록·요약 검토 |
| 5 | [펜윅 트리: 비트 하나로 만드는 누적 합 트리](../packages/demo/src/posts/datastructures/5-fenwick-tree.md) | 목록·요약 검토 |
| 6 | [희소 테이블: O(1) 구간 최솟값 질의](../packages/demo/src/posts/datastructures/6-sparse-table.md) | 목록·요약 검토 |
| 7 | [트라이: 접두사 검색과 XOR 최댓값](../packages/demo/src/posts/datastructures/7-trie.md) | 목록·요약 검토 |
| 8 | [트립: 무작위로 균형을 잡는 이진 탐색 트리](../packages/demo/src/posts/datastructures/8-treap.md) | 목록·요약 검토 |
| 9 | [퍼시스턴트 세그먼트 트리: 과거 버전을 모두 남기기](../packages/demo/src/posts/datastructures/9-persistent-segment-tree.md) | 목록·요약 검토 |
| 10 | [최소 공통 조상: 희소 배열로 2의 거듭제곱씩 오르기](../packages/demo/src/posts/datastructures/10-lowest-common-ancestor.md) | 목록·요약 검토 |
| 11 | [오일러 투어와 HLD: 트리 경로를 구간으로 바꾸기](../packages/demo/src/posts/datastructures/11-euler-tour-hld.md) | 목록·요약 검토 |
| 12 | [센트로이드 분할: 트리를 반씩 쪼개는 분할 정복](../packages/demo/src/posts/datastructures/12-centroid-decomposition.md) | 목록·요약 검토 |

<a id="graph"></a>
## 그래프 알고리즘

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [BFS 응용: 0-1 BFS, 다중 시작점, 상태 공간 탐색](../packages/demo/src/posts/graph/1-bfs-applications.md) | 목록·요약 검토 |
| 2 | [다익스트라 알고리즘: 음수 없는 최단 경로](../packages/demo/src/posts/graph/2-dijkstra.md) | 목록·요약 검토 |
| 3 | [벨만-포드: 음수 간선과 음수 사이클](../packages/demo/src/posts/graph/3-bellman-ford.md) | 목록·요약 검토 |
| 4 | [플로이드-워셜: 모든 쌍 최단 경로](../packages/demo/src/posts/graph/4-floyd-warshall.md) | 목록·요약 검토 |
| 5 | [최소 신장 트리: 크루스칼과 프림](../packages/demo/src/posts/graph/5-minimum-spanning-tree.md) | 목록·요약 검토 |
| 6 | [강한 연결 요소: 타잔과 코사라주](../packages/demo/src/posts/graph/6-strongly-connected-components.md) | 목록·요약 검토 |
| 7 | [2-SAT: 논리식을 그래프로 풀기](../packages/demo/src/posts/graph/7-2-sat.md) | 목록·요약 검토 |
| 8 | [단절점과 단절선: 끊으면 갈라지는 곳 찾기](../packages/demo/src/posts/graph/8-articulation-points-and-bridges.md) | 목록·요약 검토 |
| 9 | [오일러 경로: 모든 간선을 한 번씩 지나기](../packages/demo/src/posts/graph/9-euler-path.md) | 목록·요약 검토 |
| 10 | [네트워크 플로우: 포드-풀커슨과 에드몬즈-카프](../packages/demo/src/posts/graph/10-network-flow-ford-fulkerson.md) | 목록·요약 검토 |
| 11 | [디닉 알고리즘과 최대 유량 최소 컷 정리](../packages/demo/src/posts/graph/11-dinic-and-max-flow-min-cut.md) | 목록·요약 검토 |
| 12 | [이분 매칭: 증가 경로와 쾨니그 정리](../packages/demo/src/posts/graph/12-bipartite-matching.md) | 목록·요약 검토 |
| 13 | [최소 비용 최대 유량: 유량에 가격 붙이기](../packages/demo/src/posts/graph/13-min-cost-max-flow.md) | 수정 |
| 14 | [플로우로 모델링하기: 정점 분할, 프로젝트 선택, 하한 있는 유량](../packages/demo/src/posts/graph/14-flow-modeling.md) | 목록·요약 검토 |

<a id="strings"></a>
## 문자열 알고리즘

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [문자열 해싱과 라빈-카프](../packages/demo/src/posts/strings/1-string-hashing-rabin-karp.md) | 목록·요약 검토 |
| 2 | [KMP: 실패 함수로 되돌아가지 않는 검색](../packages/demo/src/posts/strings/2-kmp.md) | 목록·요약 검토 |
| 3 | [Z 알고리즘: 모든 위치의 최장 공통 접두사](../packages/demo/src/posts/strings/3-z-algorithm.md) | 목록·요약 검토 |
| 4 | [아호-코라식: 여러 패턴을 한 번에 찾기](../packages/demo/src/posts/strings/4-aho-corasick.md) | 목록·요약 검토 |
| 5 | [접미사 배열과 LCP 배열](../packages/demo/src/posts/strings/5-suffix-array-lcp.md) | 목록·요약 검토 |
| 6 | [Manacher 알고리즘: 회문을 선형 시간에 찾기](../packages/demo/src/posts/strings/6-manacher.md) | 목록·요약 검토 |

<a id="mathgeo"></a>
## 수학·기하 알고리즘

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [유클리드 호제법과 확장 유클리드: 모듈러 역원 구하기](../packages/demo/src/posts/mathgeo/1-euclid-and-modular-inverse.md) | 목록·요약 검토 |
| 2 | [소수와 체: 에라토스테네스, 선형 체, 오일러 피 함수](../packages/demo/src/posts/mathgeo/2-prime-sieves-and-euler-phi.md) | 목록·요약 검토 |
| 3 | [빠른 거듭제곱과 행렬 거듭제곱](../packages/demo/src/posts/mathgeo/3-fast-and-matrix-exponentiation.md) | 목록·요약 검토 |
| 4 | [중국인의 나머지 정리](../packages/demo/src/posts/mathgeo/4-chinese-remainder-theorem.md) | 목록·요약 검토 |
| 5 | [이항 계수 나머지: 페르마 역원과 뤼카 정리](../packages/demo/src/posts/mathgeo/5-binomial-mod-fermat-lucas.md) | 목록·요약 검토 |
| 6 | [밀러-라빈과 폴라드 로: 큰 수 소인수분해](../packages/demo/src/posts/mathgeo/6-miller-rabin-and-pollard-rho.md) | 목록·요약 검토 |
| 7 | [FFT와 NTT: 다항식 곱셈을 O(n log n)에](../packages/demo/src/posts/mathgeo/7-fft-and-ntt.md) | 목록·요약 검토 |
| 8 | [가우스 소거법: 연립방정식과 XOR 기저](../packages/demo/src/posts/mathgeo/8-gaussian-elimination.md) | 목록·요약 검토 |
| 9 | [계산 기하 기초: CCW와 선분 교차](../packages/demo/src/posts/mathgeo/9-ccw-and-segment-intersection.md) | 목록·요약 검토 |
| 10 | [볼록 껍질: 모노톤 체인과 그레이엄 스캔](../packages/demo/src/posts/mathgeo/10-convex-hull.md) | 목록·요약 검토 |
| 11 | [다각형 넓이와 회전하는 캘리퍼스](../packages/demo/src/posts/mathgeo/11-polygon-area-and-rotating-calipers.md) | 목록·요약 검토 |
| 12 | [게임 이론: 님 게임과 스프라그-그런디 정리](../packages/demo/src/posts/mathgeo/12-nim-and-sprague-grundy.md) | 수정 |

<a id="gameres"></a>
## 게임 자원 관리

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [프레임 예산: 16.67ms 안에 모든 일을 끝내기](../packages/demo/src/posts/gameres/1-frame-budget.md) | 목록·요약 검토 |
| 2 | [오브젝트 풀링: 만들지 말고 빌려 쓰기](../packages/demo/src/posts/gameres/2-object-pooling.md) | 목록·요약 검토 |
| 3 | [메모리 할당자: 선형·스택·풀 할당자와 단편화](../packages/demo/src/posts/gameres/3-memory-allocators.md) | 목록·요약 검토 |
| 4 | [버디 할당자와 슬랩 할당자](../packages/demo/src/posts/gameres/4-buddy-and-slab.md) | 목록·요약 검토 |
| 5 | [캐시 교체 알고리즘: LRU, LFU, CLOCK](../packages/demo/src/posts/gameres/5-cache-replacement.md) | 목록·요약 검토 |
| 6 | [에셋 스트리밍: 예산 안에서 우선순위대로 불러오기](../packages/demo/src/posts/gameres/6-asset-streaming.md) | 목록·요약 검토 |
| 7 | [공간 분할 1: 균일 격자와 공간 해싱](../packages/demo/src/posts/gameres/7-uniform-grid-spatial-hashing.md) | 수정 |
| 8 | [공간 분할 2: 쿼드트리와 BVH](../packages/demo/src/posts/gameres/8-quadtree-and-bvh.md) | 목록·요약 검토 |
| 9 | [컬링과 LOD: 안 보이는 것은 그리지 않고 먼 것은 덜 그리기](../packages/demo/src/posts/gameres/9-culling-and-lod.md) | 목록·요약 검토 |
| 10 | [시간 분할: 무거운 일을 여러 프레임에 나누기](../packages/demo/src/posts/gameres/10-time-slicing.md) | 수정 |
| 11 | [경로 탐색 아끼기: A*, 계층적 탐색, 플로우 필드](../packages/demo/src/posts/gameres/11-efficient-pathfinding.md) | 목록·요약 검토 |
| 12 | [텍스처 아틀라스와 사각형 빈 패킹](../packages/demo/src/posts/gameres/12-texture-atlas-bin-packing.md) | 목록·요약 검토 |
| 13 | [플라이웨이트와 더티 플래그: 공유하고, 바뀐 것만 다시 계산하기](../packages/demo/src/posts/gameres/13-flyweight-and-dirty-flag.md) | 목록·요약 검토 |
| 14 | [네트워크 대역폭 아끼기: 델타 압축, 관심 영역, 양자화](../packages/demo/src/posts/gameres/14-network-bandwidth.md) | 목록·요약 검토 |

<a id="advanced"></a>
## 심화 알고리즘

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [스플레이 트리: 접근한 노드를 뿌리로 올리는 자기 조정 트리](../packages/demo/src/posts/advanced/1-splay-tree.md) | 수정 |
| 2 | [링크-컷 트리: 간선이 붙고 끊기는 숲에서 경로 질의](../packages/demo/src/posts/advanced/2-link-cut-tree.md) | 목록·요약 검토 |
| 3 | [웨이블릿 트리: 구간 k번째 수와 빈도를 로그 시간에](../packages/demo/src/posts/advanced/3-wavelet-tree.md) | 수정 |
| 4 | [병렬 이분 탐색과 CDQ 분할 정복: 질의를 모아 한꺼번에 풀기](../packages/demo/src/posts/advanced/4-parallel-binary-search-cdq.md) | 목록·요약 검토 |
| 5 | [오프라인 동적 연결성: 시간 축 세그먼트 트리와 롤백 유니온 파인드](../packages/demo/src/posts/advanced/5-offline-dynamic-connectivity.md) | 목록·요약 검토 |
| 6 | [슬로프 트릭: 볼록 조각 선형 함수를 힙으로 다루기](../packages/demo/src/posts/advanced/6-slope-trick.md) | 목록·요약 검토 |
| 7 | [Aliens 트릭: 개수 제약을 벌점으로 바꾸는 라그랑주 완화](../packages/demo/src/posts/advanced/7-aliens-trick.md) | 수정 |
| 8 | [접미사 오토마톤: 끝 위치로 부분 문자열 묶기](../packages/demo/src/posts/advanced/8-suffix-automaton.md) | 수정 |
| 9 | [헝가리안 알고리즘: 할당 문제를 O(n³)에](../packages/demo/src/posts/advanced/9-hungarian-algorithm.md) | 수정 |
| 10 | [일반 그래프 매칭: 에드몬즈의 꽃 알고리즘](../packages/demo/src/posts/advanced/10-blossom-algorithm.md) | 목록·요약 검토 |
| 11 | [지배자 트리: 반드시 거쳐 가는 정점 찾기](../packages/demo/src/posts/advanced/11-dominator-tree.md) | 목록·요약 검토 |
| 12 | [전역 최소 컷: 스토어-바그너와 카거의 무작위 축약](../packages/demo/src/posts/advanced/12-global-min-cut.md) | 목록·요약 검토 |
| 13 | [선형 점화식: 벌레캄프-매시와 키타마사](../packages/demo/src/posts/advanced/13-linear-recurrence.md) | 목록·요약 검토 |
| 14 | [선형 계획법과 심플렉스: 부등식 제약 아래 최적화](../packages/demo/src/posts/advanced/14-linear-programming-simplex.md) | 수정 |

<a id="adt"></a>
## 추상 데이터 타입 심화

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [추상 데이터 타입: 연산과 법칙으로 정의하고 구현을 고르기](../packages/demo/src/posts/adt/1-abstract-data-types.md) | 목록·요약 검토 |
| 2 | [스택 두 개로 만드는 큐: 최솟값 스택과 슬라이딩 윈도 집계](../packages/demo/src/posts/adt/2-two-stack-queue.md) | 목록·요약 검토 |
| 3 | [이중 우선순위 큐: 최소-최대 힙과 구간 힙](../packages/demo/src/posts/adt/3-double-ended-priority-queue.md) | 목록·요약 검토 |
| 4 | [병합 가능한 힙: 레프티스트 힙과 스큐 힙](../packages/demo/src/posts/adt/4-leftist-skew-heap.md) | 목록·요약 검토 |
| 5 | [이항 힙과 페어링 힙: 숲으로 만드는 우선순위 큐](../packages/demo/src/posts/adt/5-binomial-pairing-heap.md) | 목록·요약 검토 |
| 6 | [피보나치 힙: 키 줄이기 O(1)과 다익스트라](../packages/demo/src/posts/adt/6-fibonacci-heap.md) | 목록·요약 검토 |
| 7 | [AVL 트리: 높이 차를 1 이하로 유지하는 회전](../packages/demo/src/posts/adt/7-avl-tree.md) | 목록·요약 검토 |
| 8 | [레드-블랙 트리: 2-3-4 트리를 이진 트리로 옮기기](../packages/demo/src/posts/adt/8-red-black-tree.md) | 수정 |
| 9 | [B-트리와 B+트리: 디스크 블록 하나에 키 수백 개](../packages/demo/src/posts/adt/9-b-tree.md) | 목록·요약 검토 |
| 10 | [스킵 리스트: 동전 던지기로 만드는 균형](../packages/demo/src/posts/adt/10-skip-list.md) | 목록·요약 검토 |
| 11 | [희생양 트리와 무게 균형 트리: 회전 대신 다시 짓기](../packages/demo/src/posts/adt/11-scapegoat-tree.md) | 목록·요약 검토 |
| 12 | [정보를 덧붙인 트리: 순위 통계 트리와 구간 트리](../packages/demo/src/posts/adt/12-augmented-tree.md) | 목록·요약 검토 |
| 13 | [k-d 트리: 다차원 범위 검색과 최근접 이웃](../packages/demo/src/posts/adt/13-kd-tree.md) | 목록·요약 검토 |
| 14 | [기수 트리와 패트리샤 트리: 갈림길만 남긴 트라이](../packages/demo/src/posts/adt/14-radix-patricia.md) | 목록·요약 검토 |
| 15 | [반 엠데 보아스 트리: 정수 키를 O(log log U)에](../packages/demo/src/posts/adt/15-van-emde-boas-tree.md) | 목록·요약 검토 |
| 16 | [해시 테이블 깊이 보기: 개방 주소법, 로빈 후드, 뻐꾸기 해싱](../packages/demo/src/posts/adt/16-hash-tables.md) | 목록·요약 검토 |
| 17 | [블룸 필터와 뻐꾸기 필터: 틀릴 수 있는 집합](../packages/demo/src/posts/adt/17-bloom-and-cuckoo-filters.md) | 수정 |
| 18 | [스트림 요약 구조: 카운트-민 스케치와 하이퍼로그로그](../packages/demo/src/posts/adt/18-stream-sketches.md) | 목록·요약 검토 |
| 19 | [퍼시스턴트 자료 구조: 경로 복사와 함수형 큐](../packages/demo/src/posts/adt/19-persistent-data-structures.md) | 목록·요약 검토 |
| 20 | [로프와 핑거 트리: 이어 붙이기와 자르기가 빠른 시퀀스](../packages/demo/src/posts/adt/20-rope-and-finger-tree.md) | 목록·요약 검토 |
| 21 | [LSM 트리: 쓰기를 모았다가 정렬해서 내려보내기](../packages/demo/src/posts/adt/21-lsm-tree.md) | 목록·요약 검토 |

<a id="cpu"></a>
## CPU 마이크로아키텍처

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [CPU 마이크로아키텍처 지도: 명령어 집합 아래에서 일어나는 일](../packages/demo/src/posts/cpu/1-microarchitecture-map.md) | 목록·요약 검토 |
| 2 | [파이프라인 해저드: 포워딩과 스톨을 사이클 단위로](../packages/demo/src/posts/cpu/2-pipeline-hazards.md) | 수정 |
| 3 | [분기 예측: 2비트 카운터에서 gshare와 TAGE까지](../packages/demo/src/posts/cpu/3-branch-prediction.md) | 목록·요약 검토 |
| 4 | [비순차 실행: 레지스터 이름 바꾸기와 토마술로 알고리즘](../packages/demo/src/posts/cpu/4-out-of-order-tomasulo.md) | 목록·요약 검토 |
| 5 | [재정렬 버퍼와 추측 실행: 틀린 미래를 되돌리는 법](../packages/demo/src/posts/cpu/5-reorder-buffer-speculation.md) | 목록·요약 검토 |
| 6 | [명령어 해독과 마이크로 연산: 가변 길이 x86을 고정 폭 내부 연산으로](../packages/demo/src/posts/cpu/6-decode-and-micro-ops.md) | 목록·요약 검토 |
| 7 | [실행 유닛과 포트: 지연 시간과 처리량은 다르다](../packages/demo/src/posts/cpu/7-execution-units-and-ports.md) | 목록·요약 검토 |
| 8 | [SIMD와 벡터 명령어: SSE에서 AVX-512, NEON, SVE까지](../packages/demo/src/posts/cpu/8-simd-and-vector-instructions.md) | 목록·요약 검토 |
| 9 | [캐시 일관성: MESI 프로토콜과 거짓 공유](../packages/demo/src/posts/cpu/9-cache-coherence-mesi.md) | 목록·요약 검토 |
| 10 | [메모리 일관성 모델과 원자적 연산: 저장 버퍼가 순서를 바꾼다](../packages/demo/src/posts/cpu/10-memory-consistency-and-atomics.md) | 목록·요약 검토 |
| 11 | [멀티코어와 SMT: 하이퍼스레딩, 코어 연결망, NUMA](../packages/demo/src/posts/cpu/11-multicore-smt-numa.md) | 수정 |
| 12 | [전력과 클록: 동적 전력, DVFS, 터보, 이종 코어](../packages/demo/src/posts/cpu/12-power-and-clock.md) | 목록·요약 검토 |

<a id="memory"></a>
## 메모리 시스템

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [메모리 계층 지도: 레지스터에서 SSD까지 지연과 대역폭](../packages/demo/src/posts/memory/1-memory-hierarchy.md) | 목록·요약 검토 |
| 2 | [SRAM과 캐시의 구조: 6T 셀, 태그·인덱스·오프셋](../packages/demo/src/posts/memory/2-sram-and-cache-structure.md) | 목록·요약 검토 |
| 3 | [캐시 미스의 종류와 정책: 3C, 교체, 쓰기](../packages/demo/src/posts/memory/3-cache-misses-and-policies.md) | 목록·요약 검토 |
| 4 | [캐시를 아는 코드: 접근 순서, 블로킹, 프리페치](../packages/demo/src/posts/memory/4-cache-aware-code.md) | 목록·요약 검토 |
| 5 | [DRAM의 구조: 1T1C 셀, 뱅크, 행 버퍼, 리프레시](../packages/demo/src/posts/memory/5-dram-structure.md) | 수정 |
| 6 | [DDR 메모리와 메모리 컨트롤러: 채널, 버스트, 스케줄링](../packages/demo/src/posts/memory/6-ddr-and-memory-controller.md) | 목록·요약 검토 |
| 7 | [가상 메모리 하드웨어: 페이지 테이블 워크와 TLB](../packages/demo/src/posts/memory/7-page-table-walk-and-tlb.md) | 수정 |
| 8 | [HBM과 GDDR: 넓게 쌓은 메모리와 빠르게 달리는 메모리](../packages/demo/src/posts/memory/8-hbm-and-gddr.md) | 목록·요약 검토 |
| 9 | [플래시 저장 장치: NAND 셀, FTL, 쓰기 증폭](../packages/demo/src/posts/memory/9-nand-flash-and-ftl.md) | 목록·요약 검토 |
| 10 | [메모리 오류와 신뢰성: ECC, 해밍 부호, 로우해머](../packages/demo/src/posts/memory/10-ecc-hamming-rowhammer.md) | 목록·요약 검토 |

<a id="gpu"></a>
## GPU와 CUDA

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [GPU는 왜 다르게 생겼나: 지연을 숨기는 처리량 기계](../packages/demo/src/posts/gpu/1-throughput-machine.md) | 목록·요약 검토 |
| 2 | [GPU 하드웨어 구조: GPC, SM, 워프 스케줄러, 텐서 코어](../packages/demo/src/posts/gpu/2-gpu-hardware.md) | 수정 |
| 3 | [SIMT와 워프: 32개 스레드가 함께 걷는 법](../packages/demo/src/posts/gpu/3-simt-and-warps.md) | 목록·요약 검토 |
| 4 | [CUDA 프로그래밍 모델: 커널, 그리드, 블록, 스레드](../packages/demo/src/posts/gpu/4-cuda-programming-model.md) | 목록·요약 검토 |
| 5 | [CUDA 메모리 계층: 레지스터, 공유, 전역, 상수, 로컬](../packages/demo/src/posts/gpu/5-cuda-memory-hierarchy.md) | 목록·요약 검토 |
| 6 | [메모리 병합: 전역 메모리를 32바이트 섹터로 읽기](../packages/demo/src/posts/gpu/6-memory-coalescing.md) | 목록·요약 검토 |
| 7 | [공유 메모리와 뱅크 충돌: 32개 뱅크를 동시에 쓰기](../packages/demo/src/posts/gpu/7-shared-memory-bank-conflicts.md) | 목록·요약 검토 |
| 8 | [점유율과 지연 숨기기: 레지스터와 공유 메모리가 동시 워프 수를 정한다](../packages/demo/src/posts/gpu/8-occupancy.md) | 목록·요약 검토 |
| 9 | [병렬 리덕션과 워프 셔플: 수백만 개를 합 하나로](../packages/demo/src/posts/gpu/9-parallel-reduction.md) | 목록·요약 검토 |
| 10 | [행렬 곱셈 커널 최적화: 타일링에서 레지스터 블로킹까지](../packages/demo/src/posts/gpu/10-matmul-kernel.md) | 목록·요약 검토 |
| 11 | [텐서 코어와 혼합 정밀도: 행렬 곱 한 번에 작은 타일을](../packages/demo/src/posts/gpu/11-tensor-cores.md) | 수정 |
| 12 | [스트림과 비동기 실행: 복사와 계산을 겹치기](../packages/demo/src/posts/gpu/12-streams-async.md) | 목록·요약 검토 |
| 13 | [루프라인 모델과 프로파일링: 계산이 한계인가 메모리가 한계인가](../packages/demo/src/posts/gpu/13-roofline-profiling.md) | 목록·요약 검토 |
| 14 | [멀티 GPU와 집합 통신: NVLink, NCCL, 링 올리듀스](../packages/demo/src/posts/gpu/14-multi-gpu-collectives.md) | 목록·요약 검토 |

<a id="shader"></a>
## 게임 셰이더

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [셰이더와 렌더링 파이프라인: GPU가 삼각형을 픽셀로 바꾸는 길](../packages/demo/src/posts/shader/1-rendering-pipeline.md) | 목록·요약 검토 |
| 2 | [정점 셰이더와 좌표 변환: 모델·뷰·투영 행렬과 동차 좌표](../packages/demo/src/posts/shader/2-vertex-transforms.md) | 목록·요약 검토 |
| 3 | [래스터화와 보간: 무게중심 좌표와 원근 보정](../packages/demo/src/posts/shader/3-rasterization-interpolation.md) | 목록·요약 검토 |
| 4 | [셰이더 언어와 첫 프래그먼트 셰이더: GLSL, 유니폼, 절차적 패턴](../packages/demo/src/posts/shader/4-glsl-procedural-patterns.md) | 목록·요약 검토 |
| 5 | [텍스처 샘플링: 필터링, 밉맵, 이방성 필터링](../packages/demo/src/posts/shader/5-texture-sampling.md) | 목록·요약 검토 |
| 6 | [고전 조명 모델: 램버트, 퐁, 블린-퐁, 툰 셰이딩](../packages/demo/src/posts/shader/6-classic-lighting.md) | 목록·요약 검토 |
| 7 | [법선 맵과 탄젠트 공간: 평평한 면에 굴곡 그리기](../packages/demo/src/posts/shader/7-normal-maps-tangent-space.md) | 목록·요약 검토 |
| 8 | [물리 기반 렌더링: 마이크로패싯 BRDF와 GGX](../packages/demo/src/posts/shader/8-pbr-microfacet-ggx.md) | 수정 |
| 9 | [이미지 기반 조명: 큐브맵, 구면 조화 함수, 분할 합 근사](../packages/demo/src/posts/shader/9-image-based-lighting.md) | 목록·요약 검토 |
| 10 | [감마와 선형 공간, HDR과 톤 매핑](../packages/demo/src/posts/shader/10-gamma-hdr-tone-mapping.md) | 목록·요약 검토 |
| 11 | [그림자: 섀도 맵, 깊이 바이어스, PCF, 캐스케이드](../packages/demo/src/posts/shader/11-shadow-mapping.md) | 목록·요약 검토 |
| 12 | [투명도와 블렌딩: 알파 블렌딩, 그리는 순서, 프리멀티플라이드 알파](../packages/demo/src/posts/shader/12-transparency-blending.md) | 목록·요약 검토 |
| 13 | [정점 애니메이션: 스키닝, 파도, 바람](../packages/demo/src/posts/shader/13-vertex-animation.md) | 수정 |
| 14 | [포스트 프로세싱: 분리 가능한 블러, 블룸, 외곽선](../packages/demo/src/posts/shader/14-post-processing.md) | 목록·요약 검토 |
| 15 | [많은 광원 다루기: 디퍼드 렌더링, G-버퍼, 포워드+](../packages/demo/src/posts/shader/15-many-lights.md) | 목록·요약 검토 |
| 16 | [셰이더 성능: 분기, 정밀도, 오버드로, 셰이더 변형](../packages/demo/src/posts/shader/16-shader-performance.md) | 목록·요약 검토 |

<a id="leveldesign"></a>
## 레벨 디자인과 콘텐츠 제공

| 순서 | 글 | 이번 검토 |
|---|---|---|
| 1 | [레벨 디자인이란: 플레이어의 경험을 공간으로 설계하기](../packages/demo/src/posts/leveldesign/1-what-is-level-design.md) | 목록·요약 검토 |
| 2 | [동선과 시선 유도: 랜드마크, 시야, 공간의 문법](../packages/demo/src/posts/leveldesign/2-guiding-the-player.md) | 목록·요약 검토 |
| 3 | [레벨을 그래프로 보기: 임계 경로, 루프, 되돌아가기](../packages/demo/src/posts/leveldesign/3-level-as-graph.md) | 목록·요약 검토 |
| 4 | [열쇠와 자물쇠: 게이팅과 막힘 없는 진행 구조](../packages/demo/src/posts/leveldesign/4-locks-and-keys.md) | 목록·요약 검토 |
| 5 | [페이싱과 난이도 곡선: 긴장과 이완의 리듬](../packages/demo/src/posts/leveldesign/5-pacing-and-difficulty-curve.md) | 목록·요약 검토 |
| 6 | [튜토리얼과 온보딩: 레벨이 가르치게 하기](../packages/demo/src/posts/leveldesign/6-tutorial-and-onboarding.md) | 수정 |
| 7 | [전투 공간 설계: 엄폐, 고저차, 스폰 배치](../packages/demo/src/posts/leveldesign/7-combat-space-design.md) | 수정 |
| 8 | [플레이어 모델과 난이도 조절: 동적 난이도와 실력 평가](../packages/demo/src/posts/leveldesign/8-player-model-and-dda.md) | 목록·요약 검토 |
| 9 | [절차적 생성 1: 던전과 동굴 만들기](../packages/demo/src/posts/leveldesign/9-dungeon-and-cave-generation.md) | 목록·요약 검토 |
| 10 | [절차적 생성 2: 웨이브 함수 붕괴와 생성 문법](../packages/demo/src/posts/leveldesign/10-wave-function-collapse-and-grammars.md) | 목록·요약 검토 |
| 11 | [진행 시스템: 경험치 곡선, 해금, 보상 일정](../packages/demo/src/posts/leveldesign/11-progression-systems.md) | 목록·요약 검토 |
| 12 | [확률형 보상: 기댓값, 천장, 확률 공개](../packages/demo/src/posts/leveldesign/12-probabilistic-rewards.md) | 목록·요약 검토 |
| 13 | [게임 경제: 재화의 원천과 소모처, 인플레이션](../packages/demo/src/posts/leveldesign/13-game-economy.md) | 수정 |
| 14 | [라이브 서비스: 시즌, 배틀 패스, 콘텐츠 소비 속도](../packages/demo/src/posts/leveldesign/14-live-service-battle-pass.md) | 목록·요약 검토 |
| 15 | [데이터로 판단하기: 텔레메트리, 퍼널, 히트맵, A/B 테스트](../packages/demo/src/posts/leveldesign/15-telemetry-funnel-ab.md) | 목록·요약 검토 |
| 16 | [콘텐츠 파이프라인: 데이터 주도 설계, 검증 도구, 패치 배포](../packages/demo/src/posts/leveldesign/16-content-pipeline.md) | 목록·요약 검토 |

## dev 통합으로 추가된 포스트

| 시리즈 | 글 |
|---|---|
| 컴퓨터와 AI의 첫걸음 | [컴퓨터란 무엇인가: 규칙대로 기호를 바꾸는 범용 기계](../packages/demo/src/posts/basics/1-what-is-a-computer.md) |
| 컴퓨터와 AI의 첫걸음 | [왜 0과 1인가: 비트와 이진법이 이긴 이유](../packages/demo/src/posts/basics/2-why-zero-and-one.md) |
| 컴퓨터와 AI의 첫걸음 | [정보 이론이란 무엇인가: 놀라움을 비트로 재기](../packages/demo/src/posts/basics/3-what-is-information-theory.md) |
| 컴퓨터와 AI의 첫걸음 | [유한상태기계란 무엇인가: 기억이 정해진 만큼인 기계](../packages/demo/src/posts/basics/4-finite-state-machines.md) |
| 컴퓨터와 AI의 첫걸음 | [현대 컴퓨터는 어떻게 복잡한 일을 하나: 층층이 쌓은 추상화와 속도](../packages/demo/src/posts/basics/5-layers-and-speed.md) |
| 컴퓨터와 AI의 첫걸음 | [AI는 어떻게 사람과 대화하게 되었나: 규칙에서 다음 단어 예측까지](../packages/demo/src/posts/basics/6-from-rules-to-next-word.md) |
| 컴퓨터와 AI의 첫걸음 | [AI 에이전트는 어떻게 일을 하나: 도구, 반복, 그리고 사람의 감독](../packages/demo/src/posts/basics/7-how-ai-agents-work.md) |
| WSL 개발 환경 | [WSL이란: 윈도우 안의 리눅스, WSL 1과 WSL 2의 구조](../packages/demo/src/posts/wsl/1-what-is-wsl.md) |
| WSL 개발 환경 | [설치와 배포판 관리: wsl 명령으로 설치, 전환, 백업, 이동하기](../packages/demo/src/posts/wsl/2-install-and-manage.md) |
| WSL 개발 환경 | [파일 시스템: 리눅스 쪽 ext4와 /mnt/c, 어디에 코드를 둘까](../packages/demo/src/posts/wsl/3-file-systems.md) |
| WSL 개발 환경 | [윈도우와 리눅스 사이의 파일 함정: 줄바꿈, 실행 권한, 대소문자](../packages/demo/src/posts/wsl/4-file-pitfalls.md) |
| WSL 개발 환경 | [상호 운용: 리눅스에서 윈도우 프로그램을, 윈도우에서 리눅스 명령을](../packages/demo/src/posts/wsl/5-interop.md) |
| WSL 개발 환경 | [wsl.conf와 .wslconfig: 배포판 설정과 가상 머신 설정](../packages/demo/src/posts/wsl/6-wsl-conf-and-wslconfig.md) |
| WSL 개발 환경 | [네트워크: NAT와 미러 모드, localhost 포워딩, 포트 열기](../packages/demo/src/posts/wsl/7-networking.md) |
| WSL 개발 환경 | [systemd와 백그라운드 서비스: WSL에서 데몬 운영하기](../packages/demo/src/posts/wsl/8-systemd-and-services.md) |
| WSL 개발 환경 | [WSL에서 개발 도구 쓰기: VS Code, 도커, GPU, GUI 앱](../packages/demo/src/posts/wsl/9-dev-tools.md) |
| WSL 개발 환경 | [문제 해결과 관리: 디스크 회수, 메모리, 흔한 오류](../packages/demo/src/posts/wsl/10-troubleshooting.md) |
| 도커와 컨테이너 | [컨테이너란: 격리된 프로세스, 이미지, 가상 머신과의 차이](../packages/demo/src/posts/docker/1-what-is-a-container.md) |
| 도커와 컨테이너 | [이미지와 레이어: 유니온 파일 시스템, 태그, 다이제스트](../packages/demo/src/posts/docker/2-images-and-layers.md) |
| 도커와 컨테이너 | [컨테이너 생명 주기: run, exec, logs, stop과 시그널](../packages/demo/src/posts/docker/3-container-lifecycle.md) |
| 도커와 컨테이너 | [Dockerfile 기초: 명령어, 빌드 컨텍스트, CMD와 ENTRYPOINT](../packages/demo/src/posts/docker/4-dockerfile-basics.md) |
| 도커와 컨테이너 | [빌드 캐시: 레이어 순서와 BuildKit으로 빠르게 빌드하기](../packages/demo/src/posts/docker/5-build-cache.md) |
| 도커와 컨테이너 | [멀티 스테이지 빌드: 작고 안전한 실행 이미지 만들기](../packages/demo/src/posts/docker/6-multi-stage-build.md) |
| 도커와 컨테이너 | [볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다](../packages/demo/src/posts/docker/7-volumes-and-bind-mounts.md) |
| 도커와 컨테이너 | [컨테이너 네트워크: 브리지, 포트 공개, 내장 DNS](../packages/demo/src/posts/docker/8-container-networking.md) |
| 도커와 컨테이너 | [Docker Compose: 여러 컨테이너를 한 파일로 정의하기](../packages/demo/src/posts/docker/9-docker-compose.md) |
| 도커와 컨테이너 | [설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법](../packages/demo/src/posts/docker/10-config-and-secrets.md) |
| 도커와 컨테이너 | [컨테이너 보안: 루트가 아닌 사용자, 권한 줄이기, 이미지 점검](../packages/demo/src/posts/docker/11-container-security.md) |
| 도커와 컨테이너 | [리소스 제한과 관찰: cgroups, OOM, 헬스 체크, 로그](../packages/demo/src/posts/docker/12-resources-observability.md) |
| 도커와 컨테이너 | [이미지 배포: 레지스트리, 태그 전략, 멀티 아키텍처 빌드](../packages/demo/src/posts/docker/13-image-distribution.md) |
| 도커와 컨테이너 | [컨테이너로 일하는 습관: 개발 환경, 디버깅, 정리, 그다음 단계](../packages/demo/src/posts/docker/14-working-habits.md) |
| PostgreSQL 실무 | [PostgreSQL 시작하기: 서버, psql, 데이터베이스와 스키마](../packages/demo/src/posts/postgres/1-getting-started.md) |
| PostgreSQL 실무 | [자료형 고르기: 숫자, 문자열, 시간, UUID, 배열](../packages/demo/src/posts/postgres/2-data-types.md) |
| PostgreSQL 실무 | [제약 조건: 기본 키, 외래 키, UNIQUE, CHECK, 배제 제약](../packages/demo/src/posts/postgres/3-constraints.md) |
| PostgreSQL 실무 | [조인과 집계: NULL을 조심하며 데이터를 엮고 요약하기](../packages/demo/src/posts/postgres/4-joins-and-aggregates.md) |
| PostgreSQL 실무 | [윈도 함수와 CTE: 순위, 누적 합, 재귀 쿼리](../packages/demo/src/posts/postgres/5-window-functions-cte.md) |
| PostgreSQL 실무 | [인덱스 1: B-트리와 실행 계획 읽기](../packages/demo/src/posts/postgres/6-btree-index-explain.md) |
| PostgreSQL 실무 | [인덱스 2: 복합·부분·표현식 인덱스와 GIN, GiST, BRIN](../packages/demo/src/posts/postgres/7-advanced-indexes.md) |
| PostgreSQL 실무 | [쿼리 튜닝: EXPLAIN ANALYZE, 통계, 느린 쿼리의 전형](../packages/demo/src/posts/postgres/8-query-tuning.md) |
| PostgreSQL 실무 | [트랜잭션과 격리 수준: 동시에 실행될 때 생기는 이상 현상](../packages/demo/src/posts/postgres/9-transactions-isolation.md) |
| PostgreSQL 실무 | [MVCC와 VACUUM: 행 버전, 팽창, 트랜잭션 ID 고갈](../packages/demo/src/posts/postgres/10-mvcc-vacuum.md) |
| PostgreSQL 실무 | [락과 동시성: 행 잠금, SKIP LOCKED 작업 큐, 교착 상태](../packages/demo/src/posts/postgres/11-locks-concurrency.md) |
| PostgreSQL 실무 | [JSONB와 전문 검색: 관계형 안에서 문서와 텍스트 다루기](../packages/demo/src/posts/postgres/12-jsonb-full-text-search.md) |
| PostgreSQL 실무 | [스키마 마이그레이션: 운영 중인 테이블을 안전하게 바꾸기](../packages/demo/src/posts/postgres/13-schema-migration.md) |
| PostgreSQL 실무 | [백업과 복구: pg_dump, WAL 아카이브, 시점 복구](../packages/demo/src/posts/postgres/14-backup-and-recovery.md) |
| PostgreSQL 실무 | [복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치](../packages/demo/src/posts/postgres/15-replication-and-ha.md) |
| PostgreSQL 실무 | [운영과 보안: 권한, 행 수준 보안, 연결 관리, 모니터링](../packages/demo/src/posts/postgres/16-operations-and-security.md) |
| Git 버전 관리 | [Git이란: 스냅숏으로 기록하는 분산 버전 관리](../packages/demo/src/posts/git/1-what-is-git.md) |
| Git 버전 관리 | [커밋의 기본: 작업 트리, 스테이징 영역, 저장소](../packages/demo/src/posts/git/2-commit-basics.md) |
| Git 버전 관리 | [Git 내부 구조: 블롭, 트리, 커밋 객체와 참조](../packages/demo/src/posts/git/3-git-objects.md) |
| Git 버전 관리 | [브랜치와 HEAD: 움직이는 포인터로 갈라지기](../packages/demo/src/posts/git/4-branches-and-head.md) |
| Git 버전 관리 | [병합: fast-forward, 3-way 병합, 충돌 해결](../packages/demo/src/posts/git/5-merge.md) |
| Git 버전 관리 | [리베이스: 커밋을 다시 쌓는 법과 지켜야 할 규칙](../packages/demo/src/posts/git/6-rebase.md) |
| Git 버전 관리 | [원격 저장소: clone, fetch, pull, push와 추적 브랜치](../packages/demo/src/posts/git/7-remote.md) |
| Git 버전 관리 | [되돌리기: restore, reset, revert, reflog](../packages/demo/src/posts/git/8-undo.md) |
| Git 버전 관리 | [이력 탐색과 디버깅: log 필터, blame, bisect](../packages/demo/src/posts/git/9-history.md) |
| Git 버전 관리 | [stash, worktree, cherry-pick: 작업을 잠시 두고, 나누고, 옮기기](../packages/demo/src/posts/git/10-stash-worktree-cherry-pick.md) |
| Git 버전 관리 | [브랜치 전략과 태그: Git Flow, GitHub Flow, 트렁크 기반 개발](../packages/demo/src/posts/git/11-branching-strategies-and-tags.md) |
| Git 버전 관리 | [큰 저장소 다루기: 얕은 클론, 부분 클론, 희소 체크아웃, Git LFS](../packages/demo/src/posts/git/12-large-repositories.md) |
| Git 버전 관리 | [Git 훅: 커밋과 푸시 전에 자동으로 검사하기](../packages/demo/src/posts/git/13-git-hooks.md) |
| Git 버전 관리 | [설정과 사고 복구: 별칭, 조건부 설정, 커밋 서명, 비밀 유출 대응](../packages/demo/src/posts/git/14-config-signing-and-recovery.md) |
| GitHub 협업과 자동화 | [GitHub란: 원격 저장소에서 개발 플랫폼까지](../packages/demo/src/posts/github/1-what-is-github.md) |
| GitHub 협업과 자동화 | [풀 리퀘스트: 브랜치에서 병합까지, 세 가지 병합 방식](../packages/demo/src/posts/github/2-pull-requests-and-merge-methods.md) |
| GitHub 협업과 자동화 | [코드 리뷰와 CODEOWNERS: 리뷰를 요청하고 주고받는 법](../packages/demo/src/posts/github/3-code-review-and-codeowners.md) |
| GitHub 협업과 자동화 | [이슈와 프로젝트: 할 일을 추적하고 계획하기](../packages/demo/src/posts/github/4-issues-and-projects.md) |
| GitHub 협업과 자동화 | [브랜치 보호와 규칙 세트: main을 지키는 장치](../packages/demo/src/posts/github/5-branch-protection-rulesets.md) |
| GitHub 협업과 자동화 | [GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝](../packages/demo/src/posts/github/6-actions-workflows-events-jobs-steps.md) |
| GitHub 협업과 자동화 | [GitHub Actions 2: 매트릭스, 캐시, 아티팩트, 재사용 워크플로](../packages/demo/src/posts/github/7-actions-matrix-cache-artifacts-reuse.md) |
| GitHub 협업과 자동화 | [GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험](../packages/demo/src/posts/github/8-actions-secrets-permissions-oidc.md) |
| GitHub 협업과 자동화 | [배포 자동화: GitHub Pages, 컨테이너 레지스트리, 릴리스](../packages/demo/src/posts/github/9-deployment-automation.md) |
| GitHub 협업과 자동화 | [의존성과 보안: Dependabot, 코드 스캐닝, 비밀 스캐닝](../packages/demo/src/posts/github/10-dependency-and-security.md) |
| GitHub 협업과 자동화 | [gh CLI와 API: 터미널과 스크립트로 GitHub 다루기](../packages/demo/src/posts/github/11-gh-cli-and-api.md) |
| GitHub 협업과 자동화 | [오픈 소스 운영: README, 라이선스, 기여 안내, 커뮤니티 파일](../packages/demo/src/posts/github/12-open-source-maintenance.md) |
| AI 시대의 소프트웨어 부채 | [세 가지 부채: AI가 바꾼 소프트웨어 건강의 지도](../packages/demo/src/posts/aidebt/1-three-debts-map.md) |
| AI 시대의 소프트웨어 부채 | [기술 부채 다시 읽기: 커닝햄의 비유와 이자의 정체](../packages/demo/src/posts/aidebt/2-technical-debt-revisited.md) |
| AI 시대의 소프트웨어 부채 | [LLM이 만드는 기술 부채: 중복, 변동, 결함에 관한 데이터](../packages/demo/src/posts/aidebt/3-llm-technical-debt-data.md) |
| AI 시대의 소프트웨어 부채 | [AI는 기술 부채를 갚을 수도 있다: 리팩터링, 테스트, 그리고 에이전트 기술 부채](../packages/demo/src/posts/aidebt/4-ai-repaying-technical-debt.md) |
| AI 시대의 소프트웨어 부채 | [인지 부채 1: 프로그램은 사람 머릿속의 이론이다](../packages/demo/src/posts/aidebt/5-programs-as-theories.md) |
| AI 시대의 소프트웨어 부채 | [인지 부채 2: 연구가 보여 주는 것과 보여 주지 않는 것](../packages/demo/src/posts/aidebt/6-what-the-research-shows.md) |
| AI 시대의 소프트웨어 부채 | [인지 부채 3: 팀에서 진단하고 갚는 법](../packages/demo/src/posts/aidebt/7-diagnosing-cognitive-debt.md) |
| AI 시대의 소프트웨어 부채 | [의도 부채 1: 코드는 무엇을 하는지 말하지만 왜 하는지는 말하지 않는다](../packages/demo/src/posts/aidebt/8-intent-debt-why.md) |
| AI 시대의 소프트웨어 부채 | [의도 부채 2: 의도를 기록하는 도구들](../packages/demo/src/posts/aidebt/9-recording-intent.md) |
| AI 시대의 소프트웨어 부채 | [세 부채를 함께 관리하기: 상호작용, 지표, 그리고 열린 질문](../packages/demo/src/posts/aidebt/10-managing-three-debts.md) |
