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
import { parsePost } from './parse-post.ts';

export const examplePosts = [lang1, lang2, lang3, lang4, lang5, lang6, lang7, lang8, ai1, ai2, ai3, ai4].map(parsePost);
