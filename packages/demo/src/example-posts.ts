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
import attn1 from './posts/attention/1-query-key-value.md';
import attn2 from './posts/attention/2-multi-head-attention-and-masks.md';
import attn3 from './posts/attention/3-positional-encoding-and-rope.md';
import attn4 from './posts/attention/4-kv-cache-mqa-gqa-mla.md';
import attn5 from './posts/attention/5-sliding-window-and-sparse-attention.md';
import attn6 from './posts/attention/6-linear-attention.md';
import attn7 from './posts/attention/7-flash-attention.md';
import attn8 from './posts/attention/8-sage-attention.md';
import attn9 from './posts/attention/9-paged-attention-and-flash-decoding.md';
import layer1 from './posts/layers/1-linear-layer.md';
import layer2 from './posts/layers/2-convolution-layer.md';
import layer3 from './posts/layers/3-recurrent-layer.md';
import layer4 from './posts/layers/4-lstm.md';
import layer5 from './posts/layers/5-gru.md';
import layer6 from './posts/layers/6-transformer-encoder-decoder.md';
import layer7 from './posts/layers/7-normalization-layers.md';
import layer8 from './posts/layers/8-feed-forward-swiglu.md';
import layer9 from './posts/layers/9-mixture-of-experts.md';
import layer10 from './posts/layers/10-state-space-models-mamba.md';
import layer11 from './posts/layers/11-delta-rule-gated-deltanet.md';
import ow1 from './posts/openweight/1-llama-3-anatomy.md';
import ow2 from './posts/openweight/2-long-context-attention-layouts.md';
import ow3 from './posts/openweight/3-moe-models.md';
import ow4 from './posts/openweight/4-hybrid-models.md';
import ow5 from './posts/openweight/5-reading-config-json.md';
import quant1 from './posts/quantization/1-quantization-basics.md';
import quant2 from './posts/quantization/2-number-formats.md';
import quant3 from './posts/quantization/3-weight-activation-distributions.md';
import quant4 from './posts/quantization/4-error-propagation.md';
import quant5 from './posts/quantization/5-embedding-space.md';
import quant6 from './posts/quantization/6-latent-space-superposition.md';
import quant7 from './posts/quantization/7-knowledge-capacity-bits.md';
import quant8 from './posts/quantization/8-long-tail-knowledge.md';
import quant9 from './posts/quantization/9-post-training-quantization.md';
import quant10 from './posts/quantization/10-outlier-handling.md';
import quant11 from './posts/quantization/11-gptq-awq.md';
import quant12 from './posts/quantization/12-kv-cache-activation-fp8.md';
import quant13 from './posts/quantization/13-qat-qlora-bitnet.md';
import quant14 from './posts/quantization/14-gguf.md';
import quant15 from './posts/quantization/15-cpu-offload.md';
import abs1 from './posts/abstraction/1-transistor.md';
import abs2 from './posts/abstraction/2-logic-gates.md';
import abs3 from './posts/abstraction/3-combinational-circuits.md';
import abs4 from './posts/abstraction/4-sequential-circuits.md';
import abs5 from './posts/abstraction/5-cpu.md';
import abs6 from './posts/abstraction/6-instruction-set.md';
import abs7 from './posts/abstraction/7-performance.md';
import abs8 from './posts/abstraction/8-assembler.md';
import abs9 from './posts/abstraction/9-compiler.md';
import abs10 from './posts/abstraction/10-operating-system.md';
import abs11 from './posts/abstraction/11-language-evolution.md';
import abs12 from './posts/abstraction/12-code-language-models.md';
import abs13 from './posts/abstraction/13-ai-agents.md';
import tech1 from './posts/techniques/1-choosing-by-input-size.md';
import tech2 from './posts/techniques/2-brute-force-backtracking.md';
import tech3 from './posts/techniques/3-binary-search-parametric.md';
import tech4 from './posts/techniques/4-two-pointers.md';
import tech5 from './posts/techniques/5-sliding-window-monotonic-deque.md';
import tech6 from './posts/techniques/6-prefix-sum-difference-array.md';
import tech7 from './posts/techniques/7-greedy.md';
import tech8 from './posts/techniques/8-divide-and-conquer.md';
import tech9 from './posts/techniques/9-monotonic-stack.md';
import tech10 from './posts/techniques/10-coordinate-compression-and-sweeping.md';
import tech11 from './posts/techniques/11-bitmasking.md';
import tech12 from './posts/techniques/12-meet-in-the-middle.md';
import tech13 from './posts/techniques/13-sqrt-decomposition-and-mo.md';
import tech14 from './posts/techniques/14-randomized-algorithms.md';
import dp1 from './posts/dp/1-dp-basics.md';
import dp2 from './posts/dp/2-knapsack.md';
import dp3 from './posts/dp/3-lis.md';
import dp4 from './posts/dp/4-lcs-edit-distance.md';
import dp5 from './posts/dp/5-interval-dp.md';
import dp6 from './posts/dp/6-bitmask-dp-tsp.md';
import dp7 from './posts/dp/7-tree-dp.md';
import dp8 from './posts/dp/8-digit-dp.md';
import dp9 from './posts/dp/9-expectation-dp.md';
import dp10 from './posts/dp/10-convex-hull-trick.md';
import dp11 from './posts/dp/11-divide-conquer-and-knuth-optimization.md';
import dp12 from './posts/dp/12-sum-over-subsets-dp.md';
import ds1 from './posts/datastructures/1-heap-priority-queue.md';
import ds2 from './posts/datastructures/2-union-find.md';
import ds3 from './posts/datastructures/3-segment-tree.md';
import ds4 from './posts/datastructures/4-lazy-segment-tree.md';
import ds5 from './posts/datastructures/5-fenwick-tree.md';
import ds6 from './posts/datastructures/6-sparse-table.md';
import ds7 from './posts/datastructures/7-trie.md';
import ds8 from './posts/datastructures/8-treap.md';
import ds9 from './posts/datastructures/9-persistent-segment-tree.md';
import ds10 from './posts/datastructures/10-lowest-common-ancestor.md';
import ds11 from './posts/datastructures/11-euler-tour-hld.md';
import ds12 from './posts/datastructures/12-centroid-decomposition.md';
import graph1 from './posts/graph/1-bfs-applications.md';
import graph2 from './posts/graph/2-dijkstra.md';
import graph3 from './posts/graph/3-bellman-ford.md';
import graph4 from './posts/graph/4-floyd-warshall.md';
import graph5 from './posts/graph/5-minimum-spanning-tree.md';
import graph6 from './posts/graph/6-strongly-connected-components.md';
import graph7 from './posts/graph/7-2-sat.md';
import graph8 from './posts/graph/8-articulation-points-and-bridges.md';
import graph9 from './posts/graph/9-euler-path.md';
import graph10 from './posts/graph/10-network-flow-ford-fulkerson.md';
import graph11 from './posts/graph/11-dinic-and-max-flow-min-cut.md';
import graph12 from './posts/graph/12-bipartite-matching.md';
import graph13 from './posts/graph/13-min-cost-max-flow.md';
import graph14 from './posts/graph/14-flow-modeling.md';
import str1 from './posts/strings/1-string-hashing-rabin-karp.md';
import str2 from './posts/strings/2-kmp.md';
import str3 from './posts/strings/3-z-algorithm.md';
import str4 from './posts/strings/4-aho-corasick.md';
import str5 from './posts/strings/5-suffix-array-lcp.md';
import str6 from './posts/strings/6-manacher.md';
import mg1 from './posts/mathgeo/1-euclid-and-modular-inverse.md';
import mg2 from './posts/mathgeo/2-prime-sieves-and-euler-phi.md';
import mg3 from './posts/mathgeo/3-fast-and-matrix-exponentiation.md';
import mg4 from './posts/mathgeo/4-chinese-remainder-theorem.md';
import mg5 from './posts/mathgeo/5-binomial-mod-fermat-lucas.md';
import mg6 from './posts/mathgeo/6-miller-rabin-and-pollard-rho.md';
import mg7 from './posts/mathgeo/7-fft-and-ntt.md';
import mg8 from './posts/mathgeo/8-gaussian-elimination.md';
import mg9 from './posts/mathgeo/9-ccw-and-segment-intersection.md';
import mg10 from './posts/mathgeo/10-convex-hull.md';
import mg11 from './posts/mathgeo/11-polygon-area-and-rotating-calipers.md';
import mg12 from './posts/mathgeo/12-nim-and-sprague-grundy.md';
import game1 from './posts/gameres/1-frame-budget.md';
import game2 from './posts/gameres/2-object-pooling.md';
import game3 from './posts/gameres/3-memory-allocators.md';
import game4 from './posts/gameres/4-buddy-and-slab.md';
import game5 from './posts/gameres/5-cache-replacement.md';
import game6 from './posts/gameres/6-asset-streaming.md';
import game7 from './posts/gameres/7-uniform-grid-spatial-hashing.md';
import game8 from './posts/gameres/8-quadtree-and-bvh.md';
import game9 from './posts/gameres/9-culling-and-lod.md';
import game10 from './posts/gameres/10-time-slicing.md';
import game11 from './posts/gameres/11-efficient-pathfinding.md';
import game12 from './posts/gameres/12-texture-atlas-bin-packing.md';
import game13 from './posts/gameres/13-flyweight-and-dirty-flag.md';
import game14 from './posts/gameres/14-network-bandwidth.md';
import adv1 from './posts/advanced/1-splay-tree.md';
import adv2 from './posts/advanced/2-link-cut-tree.md';
import adv3 from './posts/advanced/3-wavelet-tree.md';
import adv4 from './posts/advanced/4-parallel-binary-search-cdq.md';
import adv5 from './posts/advanced/5-offline-dynamic-connectivity.md';
import adv6 from './posts/advanced/6-slope-trick.md';
import adv7 from './posts/advanced/7-aliens-trick.md';
import adv8 from './posts/advanced/8-suffix-automaton.md';
import adv9 from './posts/advanced/9-hungarian-algorithm.md';
import adv10 from './posts/advanced/10-blossom-algorithm.md';
import adv11 from './posts/advanced/11-dominator-tree.md';
import adv12 from './posts/advanced/12-global-min-cut.md';
import adv13 from './posts/advanced/13-linear-recurrence.md';
import adv14 from './posts/advanced/14-linear-programming-simplex.md';
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
  attn1,
  attn2,
  attn3,
  attn4,
  attn5,
  attn6,
  attn7,
  attn8,
  attn9,
  layer1,
  layer2,
  layer3,
  layer4,
  layer5,
  layer6,
  layer7,
  layer8,
  layer9,
  layer10,
  layer11,
  ow1,
  ow2,
  ow3,
  ow4,
  ow5,
  quant1,
  quant2,
  quant3,
  quant4,
  quant5,
  quant6,
  quant7,
  quant8,
  quant9,
  quant10,
  quant11,
  quant12,
  quant13,
  quant14,
  quant15,
  abs1,
  abs2,
  abs3,
  abs4,
  abs5,
  abs6,
  abs7,
  abs8,
  abs9,
  abs10,
  abs11,
  abs12,
  abs13,
  tech1,
  tech2,
  tech3,
  tech4,
  tech5,
  tech6,
  tech7,
  tech8,
  tech9,
  tech10,
  tech11,
  tech12,
  tech13,
  tech14,
  dp1,
  dp2,
  dp3,
  dp4,
  dp5,
  dp6,
  dp7,
  dp8,
  dp9,
  dp10,
  dp11,
  dp12,
  ds1,
  ds2,
  ds3,
  ds4,
  ds5,
  ds6,
  ds7,
  ds8,
  ds9,
  ds10,
  ds11,
  ds12,
  graph1,
  graph2,
  graph3,
  graph4,
  graph5,
  graph6,
  graph7,
  graph8,
  graph9,
  graph10,
  graph11,
  graph12,
  graph13,
  graph14,
  str1,
  str2,
  str3,
  str4,
  str5,
  str6,
  mg1,
  mg2,
  mg3,
  mg4,
  mg5,
  mg6,
  mg7,
  mg8,
  mg9,
  mg10,
  mg11,
  mg12,
  game1,
  game2,
  game3,
  game4,
  game5,
  game6,
  game7,
  game8,
  game9,
  game10,
  game11,
  game12,
  game13,
  game14,
  adv1,
  adv2,
  adv3,
  adv4,
  adv5,
  adv6,
  adv7,
  adv8,
  adv9,
  adv10,
  adv11,
  adv12,
  adv13,
  adv14,
].map(parsePost);
