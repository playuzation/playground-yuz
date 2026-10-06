// 포스트를 어떤 품질·정보·형식으로 쓰면 좋은지 보여 주는 예시 시리즈(보여 줄 순서대로).
import lang1 from './posts/lang/1-programming-languages.md';
import lang2 from './posts/lang/2-python.md';
import lang3 from './posts/lang/3-interpreted-languages.md';
import lang4 from './posts/lang/4-rust.md';
import lang5 from './posts/lang/5-compiled-languages.md';
import lang6 from './posts/lang/6-assembly-and-linking.md';
import lang7 from './posts/lang/7-javascript.md';
import lang8 from './posts/lang/8-java-and-jvm.md';
import ai1 from './posts/ai/1-deep-learning.md';
import ai2 from './posts/ai/2-reinforcement-learning.md';
import ai3 from './posts/ai/3-data-distribution.md';
import ai4 from './posts/ai/4-computer-science.md';
import disc1 from './posts/discrete/1-sets-and-functions.md';
import disc2 from './posts/discrete/2-propositional-logic.md';
import disc3 from './posts/discrete/3-predicate-logic-and-proof.md';
import disc4 from './posts/discrete/4-induction-and-recursion.md';
import disc5 from './posts/discrete/5-relations.md';
import disc6 from './posts/discrete/6-permutations-and-combinations.md';
import disc7 from './posts/discrete/7-pigeonhole-and-inclusion-exclusion.md';
import disc8 from './posts/discrete/8-graph-basics.md';
import disc9 from './posts/discrete/9-trees.md';
import disc10 from './posts/discrete/10-graph-search.md';
import disc11 from './posts/discrete/11-asymptotic-notation.md';
import disc12 from './posts/discrete/12-number-systems-and-modular-arithmetic.md';
import prob1 from './posts/probability/1-probability-basics.md';
import prob2 from './posts/probability/2-conditional-probability.md';
import prob3 from './posts/probability/3-bayes-theorem.md';
import prob4 from './posts/probability/4-random-variables-and-expectation.md';
import prob5 from './posts/probability/5-variance-covariance-correlation.md';
import prob6 from './posts/probability/6-discrete-distributions.md';
import prob7 from './posts/probability/7-continuous-distributions.md';
import prob8 from './posts/probability/8-normal-distribution.md';
import prob9 from './posts/probability/9-joint-marginal-conditional.md';
import prob10 from './posts/probability/10-law-of-large-numbers-and-clt.md';
import prob11 from './posts/probability/11-sampling-and-monte-carlo.md';
import prob12 from './posts/probability/12-markov-chains.md';
import stat1 from './posts/statistics/1-descriptive-statistics.md';
import stat2 from './posts/statistics/2-population-and-sampling.md';
import stat3 from './posts/statistics/3-bias-and-variance.md';
import stat4 from './posts/statistics/4-maximum-likelihood.md';
import stat5 from './posts/statistics/5-confidence-intervals.md';
import stat6 from './posts/statistics/6-hypothesis-testing.md';
import stat7 from './posts/statistics/7-ab-testing.md';
import stat8 from './posts/statistics/8-linear-regression.md';
import stat9 from './posts/statistics/9-logistic-regression.md';
import stat10 from './posts/statistics/10-bayesian-inference.md';
import stat11 from './posts/statistics/11-model-evaluation.md';
import linalg1 from './posts/linalg/1-vectors.md';
import linalg2 from './posts/linalg/2-dot-product-and-cosine-similarity.md';
import linalg3 from './posts/linalg/3-matrices-and-matrix-multiplication.md';
import linalg4 from './posts/linalg/4-matrices-as-linear-transformations.md';
import linalg5 from './posts/linalg/5-linear-systems-and-inverse.md';
import linalg6 from './posts/linalg/6-independence-basis-dimension-rank.md';
import linalg7 from './posts/linalg/7-determinant.md';
import linalg8 from './posts/linalg/8-eigenvalues-and-eigenvectors.md';
import linalg9 from './posts/linalg/9-orthogonality-and-projection.md';
import linalg10 from './posts/linalg/10-singular-value-decomposition.md';
import linalg11 from './posts/linalg/11-principal-component-analysis.md';
import linalg12 from './posts/linalg/12-tensors-and-broadcasting.md';
import calc1 from './posts/calculus/1-functions-and-limits.md';
import calc2 from './posts/calculus/2-derivatives.md';
import calc3 from './posts/calculus/3-differentiation-rules-and-chain-rule.md';
import calc4 from './posts/calculus/4-exponential-and-logarithm.md';
import calc5 from './posts/calculus/5-integrals.md';
import calc6 from './posts/calculus/6-taylor-series.md';
import calc7 from './posts/calculus/7-partial-derivatives-and-gradient.md';
import calc8 from './posts/calculus/8-multivariable-chain-rule-and-jacobian.md';
import calc9 from './posts/calculus/9-optimization-and-convexity.md';
import calc10 from './posts/calculus/10-gradient-descent.md';
import info1 from './posts/infotheory/1-information-and-entropy.md';
import info2 from './posts/infotheory/2-cross-entropy.md';
import info3 from './posts/infotheory/3-kl-divergence.md';
import info4 from './posts/infotheory/4-mutual-information.md';
import { parsePost } from './parse-post.ts';

export const examplePosts = [
  lang1,
  lang2,
  lang3,
  lang4,
  lang5,
  lang6,
  lang7,
  lang8,
  ai1,
  ai2,
  ai3,
  ai4,
  disc1,
  disc2,
  disc3,
  disc4,
  disc5,
  disc6,
  disc7,
  disc8,
  disc9,
  disc10,
  disc11,
  disc12,
  prob1,
  prob2,
  prob3,
  prob4,
  prob5,
  prob6,
  prob7,
  prob8,
  prob9,
  prob10,
  prob11,
  prob12,
  stat1,
  stat2,
  stat3,
  stat4,
  stat5,
  stat6,
  stat7,
  stat8,
  stat9,
  stat10,
  stat11,
  linalg1,
  linalg2,
  linalg3,
  linalg4,
  linalg5,
  linalg6,
  linalg7,
  linalg8,
  linalg9,
  linalg10,
  linalg11,
  linalg12,
  calc1,
  calc2,
  calc3,
  calc4,
  calc5,
  calc6,
  calc7,
  calc8,
  calc9,
  calc10,
  info1,
  info2,
  info3,
  info4,
].map(parsePost);
