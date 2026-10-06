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
  info1,
  info2,
  info3,
  info4,
].map(parsePost);
