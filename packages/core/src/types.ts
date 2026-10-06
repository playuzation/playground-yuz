export interface User {
  id: number;
  username: string;
}

export interface PostSummary {
  id: number;
  title: string;
  author: User;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface Post extends PostSummary {
  body: string;
}

export interface Comment {
  id: number;
  postId: number;
  author: User;
  body: string;
  createdAt: string;
}
