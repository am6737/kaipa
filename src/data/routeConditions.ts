import type { GuideText } from './routeGuides';

export interface RouteCondition {
  id: string;
  routeId: string;
  author: GuideText;
  source: 'user' | 'official';
  visitedAt: string;
  publishedAt: string;
  section: GuideText;
  body: GuideText;
  photos: string[];
  media?: { uri: string; kind: 'image' | 'video' | 'livePhoto'; thumbnail?: string; pairedVideoUri?: string }[];
  helpful?: number;
  verification?: { by: GuideText; at: string };
}
