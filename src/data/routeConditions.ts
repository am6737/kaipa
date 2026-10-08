import type { Poi } from './pois';
import { photoUrlFor } from './tones';
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
  verification?: { by: GuideText; at: string };
}
const text = (zh: string, en: string): GuideText => ({ zh, en });

/** Local fixtures requested for UI review, not live reports or real verification.
 * Fixed visit times intentionally do not roll forward with the current date.
 * Scenery assets are illustrative, not photos captured by these authors. */
export function getRouteConditionFixtures(route: Pick<Poi, 'id' | 'tone'>): RouteCondition[] {
  const photo = (seed: string) => photoUrlFor(route.tone, `${route.id}-${seed}`, 900);
  const reports: RouteCondition[] = [
    { id: `${route.id}-observation-1`, routeId: route.id, author: text('小满', 'Xiaoman'), source: 'user', visitedAt: '2026-10-06 15:20', publishedAt: '2026-10-06 19:10', section: text('沿线观景段', 'Scenic trail section'), body: text('下午云层散开了一会儿，沿线的秋色很漂亮。停下来拍了几张照片，休息时加了一件外套。', 'The clouds briefly cleared in the afternoon, revealing autumn colors along the trail. Stopped for photos and added a layer during the break.'), photos: [photo('autumn-view'), photo('afternoon-view')], verification: { by: text('Kaipa 路线团队', 'Kaipa route team'), at: '2026-10-07 09:00' } },
    { id: `${route.id}-observation-2`, routeId: route.id, author: text('Kaipa 路线团队', 'Kaipa route team'), source: 'official', visitedAt: '2026-10-06 10:30', publishedAt: '2026-10-06 16:00', section: text('路线起点附近', 'Near the trailhead'), body: text('上午到访时拍下的起点周边景观。把入口附近的环境整理在这条记录里，方便出发前了解现场。', 'Views near the trailhead during a morning visit. This record collects the surroundings at the entrance.'), photos: [photo('trailhead')] },
    { id: `${route.id}-observation-3`, routeId: route.id, author: text('阿川', 'Achuan'), source: 'user', visitedAt: '2026-10-05 14:40', publishedAt: '2026-10-05 20:15', section: text('中途休息点', 'Mid-route rest stop'), body: text('这次走得比较慢，中途休息时整理了一下背包。手套放在外侧口袋会方便很多，下次还会这样收纳。', 'Took a slower pace this time and reorganized the pack during a break. Keeping gloves in an outer pocket made them easier to reach.'), photos: [] },
    { id: `${route.id}-observation-4`, routeId: route.id, author: text('北北', 'Beibei'), source: 'user', visitedAt: '2026-10-03 09:10', publishedAt: '2026-10-03 18:30', section: text('沿线步道', 'Along the trail'), body: text('早上拍下的步道和周围景色，光线比下午柔和。一路边走边拍，给这次徒步留个记录。', 'Morning views of the trail and its surroundings, with softer light than in the afternoon. Took photos along the way to remember the hike.'), photos: [photo('morning-trail')] },
  ];
  return reports.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}
