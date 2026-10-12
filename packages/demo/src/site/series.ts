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
];
