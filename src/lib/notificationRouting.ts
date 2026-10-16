import type { NavValue } from '../nav/NavContext';
import type { Poi } from '../data/pois';
import type { NotifKind } from '../data/notifications';
import { fetchJourneyPoiById } from './journeyInvite';
import { fetchGuideRouteId } from '../hooks/useRouteGuides';

// 通知 target_id → 页面路由。消息中心与推送点击共用（原 MeScreen.openNotificationTarget）。
// kind 提供上下文：点赞类通知的 target_id 分别是 route_id / guide_id，需要打开对应页面。
// 返回 false 表示目标不可用，由调用方提示。
export async function openNotificationTargetById(
  targetId: string | null | undefined,
  ctx: { nav: NavValue; journeys: Poi[]; routes: Poi[]; kind?: NotifKind },
): Promise<boolean> {
  const { nav, journeys, routes, kind } = ctx;
  if (!targetId) return false;

  if (kind === 'guide_like') {
    const routeId = await fetchGuideRouteId(targetId);
    const route = routeId ? routes.find((candidate) => candidate.id === routeId) : undefined;
    if (route) {
      nav.openRouteGuide({ route, view: 'guide', guideId: targetId });
      return true;
    }
    return false;
  }

  if (kind === 'observation_like' || kind === 'comment_like' || kind === 'comment_reply') {
    const route = routes.find((candidate) => candidate.id === targetId);
    if (route) {
      nav.openPoint(route);
      nav.openRouteGuide({ route, view: 'comments' });
      return true;
    }
    return false;
  }

  const journey = journeys.find((candidate) => candidate.id === targetId);
  if (journey) {
    nav.openPoint(journey);
    return true;
  }

  const route = routes.find((candidate) => candidate.id === targetId);
  if (route) {
    nav.openPoint(route);
    return true;
  }

  const gearId = Number(targetId);
  if (Number.isInteger(gearId) && gearId > 0) {
    nav.openGearItem(gearId);
    return true;
  }

  // 冷启动点开推送时，目标旅程可能不在本地缓存：单独取一次再兜底提示。
  if (targetId.startsWith('j_')) {
    try {
      const poi = await fetchJourneyPoiById(targetId);
      nav.openPoint(poi);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
