// 정적 읽기 사이트의 시리즈 정보. name은 포스트 제목의 "[시리즈 이름 n/N]"과 같아야 한다(다르면 빌드가 실패한다).
export interface SeriesInfo {
  name: string;
  slug: string;
  description: string;
}

export const SERIES: SeriesInfo[] = [
  { name: '언어 기초', slug: 'lang', description: '프로그래밍 언어가 실행되는 방식: 파이썬, 러스트, 자바스크립트, 자바, 컴파일과 링크' },
  { name: 'AI 기초', slug: 'ai', description: '딥러닝과 강화학습, 데이터 분포와 컴퓨터 사이언스로 보는 AI 모델' },
  { name: '이산수학', slug: 'discrete', description: '집합, 논리, 그래프, 점근 표기법: 프로그래밍의 바탕이 되는 수학' },
  { name: '확률과 분포', slug: 'probability', description: '확률의 기초부터 정규 분포, 중심 극한 정리, 마르코프 연쇄까지' },
  { name: '통계학', slug: 'statistics', description: '추정, 검정, 회귀, 베이즈 추론, 모델 평가' },
  { name: '선형대수', slug: 'linalg', description: '벡터와 행렬, 고유값, SVD, PCA, 텐서' },
  { name: '미적분', slug: 'calculus', description: '극한과 미분, 연쇄 법칙, 그래디언트, 경사 하강법' },
  { name: '정보 이론', slug: 'infotheory', description: '엔트로피, 교차 엔트로피, KL 발산, 상호 정보량' },
  { name: '어텐션', slug: 'attention', description: '어텐션의 기본부터 RoPE, KV 캐시, 리니어·플래시·세이지 어텐션까지' },
  { name: '신경망 레이어', slug: 'layers', description: '선형·합성곱·순환 층에서 트랜스포머, MoE, 맘바, Gated DeltaNet까지' },
  { name: '오픈 웨이트 모델', slug: 'openweight', description: '라마, 젬마, 딥시크, Qwen 같은 공개 모델이 레이어를 조합하는 방식' },
  { name: '양자화', slug: 'quantization', description: '수 형식과 분포, 임베딩·잠재 공간, 양자화로 지식이 사라지는 이유, GPTQ·AWQ부터 QAT까지' },
  { name: '트랜지스터에서 자연어까지', slug: 'abstraction', description: '트랜지스터와 논리 회로, CPU와 기계어, 어셈블러·컴파일러·운영체제, 고수준 언어를 지나 자연어 프로그래밍까지 층마다 일어나는 변환' },
  { name: '알고리즘 기법', slug: 'techniques', description: '복잡도 어림, 백트래킹, 매개 변수 탐색, 투 포인터, 슬라이딩 윈도우, 누적 합, 그리디, 분할 정복, 단조 스택, 스위핑, 비트마스킹, 중간에서 만나기, Mo\'s, 무작위 알고리즘' },
  { name: '동적 계획법', slug: 'dp', description: '배낭, LIS, LCS·편집 거리, 구간·비트마스크·트리·자릿수·기댓값 DP, 볼록 껍질 트릭, 분할 정복·크누스 최적화, SOS DP' },
  { name: '고급 자료 구조', slug: 'datastructures', description: '힙, 유니온 파인드, 세그먼트 트리와 레이지 전파, 펜윅 트리, 희소 테이블, 트라이, 트립, 퍼시스턴트 세그먼트 트리, LCA, HLD, 센트로이드 분할' },
  { name: '그래프 알고리즘', slug: 'graph', description: '0-1 BFS, 최단 경로, 최소 신장 트리, SCC와 2-SAT, 단절점, 오일러 경로, 네트워크 플로우·이분 매칭·최소 비용 유량' },
  { name: '문자열 알고리즘', slug: 'strings', description: '문자열 해싱, KMP, Z 알고리즘, 아호-코라식, 접미사 배열, Manacher' },
  { name: '수학·기하 알고리즘', slug: 'mathgeo', description: '확장 유클리드, 체, 행렬 거듭제곱, 중국인의 나머지 정리, 뤼카, 밀러-라빈, FFT, 가우스 소거, CCW, 볼록 껍질, 스프라그-그런디' },
  { name: '게임 자원 관리', slug: 'gameres', description: '프레임 예산, 오브젝트 풀링, 메모리 할당자, 캐시 교체, 에셋 스트리밍, 공간 분할, 컬링·LOD, 시간 분할, 경로 탐색, 아틀라스 패킹, 대역폭 절약' },
  { name: '심화 알고리즘', slug: 'advanced', description: '스플레이·링크-컷 트리, 웨이블릿 트리, 병렬 이분 탐색·CDQ, 오프라인 동적 연결성, 슬로프 트릭, Aliens 트릭, 접미사 오토마톤, 헝가리안, 꽃 알고리즘, 지배자 트리, 전역 최소 컷, 벌레캄프-매시, 심플렉스' },
  { name: '추상 데이터 타입 심화', slug: 'adt', description: '스택 두 개 큐, 이중·병합 가능·피보나치 힙, AVL·레드-블랙·B-트리, 스킵 리스트, 희생양 트리, 순위 통계·구간 트리, k-d 트리, 기수 트리, 반 엠데 보아스, 해시 테이블, 블룸 필터, 스트림 요약, 퍼시스턴트 구조, 로프·핑거 트리, LSM 트리' },
  { name: 'CPU 마이크로아키텍처', slug: 'cpu', description: '파이프라인 해저드, 분기 예측, 비순차 실행과 재정렬 버퍼, 마이크로 연산 해독, 실행 포트, SIMD, 캐시 일관성, 메모리 일관성 모델, SMT·NUMA, 전력과 클록' },
  { name: '메모리 시스템', slug: 'memory', description: '메모리 계층, SRAM 캐시 구조와 미스, 캐시를 아는 코드, DRAM 뱅크와 행 버퍼, DDR과 메모리 컨트롤러, TLB와 페이지 테이블 워크, HBM·GDDR, 플래시와 FTL, ECC' },
  { name: 'GPU와 CUDA', slug: 'gpu', description: 'GPU 구조(SM·워프·텐서 코어), SIMT, CUDA 프로그래밍 모델과 메모리 계층, 병합 접근, 뱅크 충돌, 점유율, 리덕션, 행렬 곱 최적화, 스트림, 루프라인, 멀티 GPU 통신' },
  { name: '게임 셰이더', slug: 'shader', description: '렌더링 파이프라인, 좌표 변환, 래스터화와 보간, GLSL과 절차적 패턴, 텍스처 샘플링, 조명 모델, 법선 맵, PBR, 이미지 기반 조명, 감마와 톤 매핑, 그림자, 투명도, 정점 애니메이션, 포스트 프로세싱, 디퍼드·포워드+, 셰이더 성능' },
  { name: '레벨 디자인과 콘텐츠 제공', slug: 'leveldesign', description: '플레이어 메트릭, 동선과 시야, 레벨 그래프, 열쇠와 자물쇠, 페이싱, 온보딩, 전투 공간, 동적 난이도, 절차적 생성(BSP·셀룰러 오토마타·WFC), 진행과 보상, 확률형 보상, 게임 경제, 라이브 서비스, 텔레메트리, 콘텐츠 파이프라인' },
];
