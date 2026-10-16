export type RouteCommentMedia = { uri: string; kind: 'image' | 'video' | 'livePhoto'; thumbnail?: string; pairedVideoUri?: string };

export type RouteCommentSort = 'hot' | 'latest';

export type RouteCommentReportReason = 'spam' | 'false_info' | 'abuse' | 'other';

export interface RouteComment {
  id: string;
  routeId: string;
  /** Top-level comment this reply belongs to; null for top-level comments. */
  parentId: string | null;
  userId: string;
  author: string;
  authorAvatarUrl?: string | null;
  replyTo?: { userId: string; name: string } | null;
  body: string;
  /** Top-level comments only; replies are text-only. */
  media: RouteCommentMedia[];
  /** `deleted` is a placeholder for a removed top-level comment that still has replies. */
  status: 'visible' | 'deleted';
  likeCount: number;
  liked: boolean;
  replyCount: number;
  createdAt: string;
  /** Replies in chronological order; only filled on top-level comments. */
  replies: RouteComment[];
}
