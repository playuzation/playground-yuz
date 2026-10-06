// 포스트를 어떤 품질·정보·형식으로 쓰면 좋은지 보여 주는 예시 시리즈(시리즈 순서).
import p1 from './posts/1-programming-languages.md';
import p2 from './posts/2-python.md';
import p3 from './posts/3-interpreted-languages.md';
import p4 from './posts/4-rust.md';
import p5 from './posts/5-compiled-languages.md';
import p6 from './posts/6-assembly-and-linking.md';
import { parsePost } from './parse-post.ts';

export const examplePosts = [p1, p2, p3, p4, p5, p6].map(parsePost);
