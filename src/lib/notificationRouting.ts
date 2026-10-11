import type { NavValue } from '../nav/NavContext';
import type { Poi } from '../data/pois';
import { fetchJourneyPoiById } from './journeyInvite';

// 通知 target_id → 页面路由。消息中心与推送点击共用（原 MeScreen.openNotificationTarget）。
// 返回 false 表示目标不可用，由调用方提示。
export async function openNotificationTargetById(
  targetId: string | null | undefined,
  ctx: { nav: NavValue; journeys: Poi[]; routes: Poi[] },
): Promise<boolean> {
  const { nav, journeys, routes } = ctx;
  if (!targetId) return false;

  const journey = journeys.find((candidate) => candidate.id === targetId);
  if (journey) {
    nav.setSubTab('memory');
    nav.openPoint(journey);
    return true;
  }

  const route = routes.find((candidate) => candidate.id === targetId);
  if (route) {
    nav.setSubTab('explore');
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
      nav.setSubTab('memory');
      nav.openPoint(poi);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
