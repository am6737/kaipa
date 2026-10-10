import type { Poi } from './pois';
import type { JourneyPackingItemInput } from './journeyPacking';

export type GuideText = { zh: string; en: string };
export type GuideStay = 'day' | 'stay' | 'camp';
export interface RouteGuideDay {
  title: GuideText;
  summary: GuideText;
  detail: GuideText;
  items: GuideText[];
}
export interface RouteGuideGear {
  name: GuideText;
  category: GuideText;
  note: GuideText;
  quantity: number;
  weightKg?: number;
  carryStatus?: 'packed' | 'worn' | 'consumable' | 'optional';
}
export interface RouteGuidePlan {
  id: string;
  routeId: string;
  title: GuideText;
  shortTitle: GuideText;
  description: GuideText;
  stay: GuideStay;
  days: RouteGuideDay[];
  gear: RouteGuideGear[];
  /** These are planning scaffolds, not reviewed route-specific instructions. */
  draft: true;
}
export interface RouteCommunityGuide {
  id: string;
  title: GuideText;
  author: GuideText;
  authorAvatarUrl?: string | null;
  description?: GuideText;
  season: 'autumn' | 'spring';
  travelDate: string;
  publishedDate: string;
  updatedDate: string;
  helpful: number;
  plan: RouteGuidePlan;
  review: GuideText;
}
/** Ephemeral creation payload; it is not stored in the route catalog. */
export interface RouteGuideJourneyTemplate {
  id: string;
  routeId: string;
  title: string;
  days: { title: string; items: string[] }[];
  gear: JourneyPackingItemInput[];
}

const text = (zh: string, en: string): GuideText => ({ zh, en });
export const guideText = (value: GuideText, lang: 'zh' | 'en') => value[lang];
const gear = (name: string, en: string, category: string, categoryEn: string, note: string, noteEn: string): RouteGuideGear => ({
  name: text(name, en), category: text(category, categoryEn), note: text(note, noteEn), quantity: 1,
});
const basics: RouteGuideGear[] = [
  gear('徒步背包', 'Hiking backpack', '背负与穿着', 'Carry & clothing', '按行程天数与实际携带量选择容量', 'Choose capacity for the trip and actual load.'),
  gear('徒步鞋', 'Hiking footwear', '背负与穿着', 'Carry & clothing', '根据路面选择，并提前磨合', 'Choose for the terrain and break in beforehand.'),
  gear('保暖层', 'Warm layer', '背负与穿着', 'Carry & clothing', '按实际夜间低温准备，休息时也可能需要', 'Choose for nighttime temperatures and breaks.'),
  gear('防风雨外层', 'Windproof rain layer', '背负与穿着', 'Carry & clothing', '结合季节、降水与风速调整', 'Adapt to season, rain and wind.'),
  gear('饮水与容器', 'Water & containers', '饮水与食物', 'Water & food', '按耗时与已确认的补水条件准备，不设通用水量', 'Plan for duration and verified refills; there is no universal volume.'),
  gear('路餐', 'Trail food', '饮水与食物', 'Water & food', '按天数与个人需要准备', 'Plan for trip length and personal needs.'),
  gear('头灯', 'Headlamp', '照明与应急', 'Light & emergency', '为夜间活动和行程延误预留照明', 'Carry lighting for evening activity and delays.'),
  gear('手机与离线地图', 'Phone & offline map', '照明与应急', 'Light & emergency', '出发前保存路线，核实地图能离线使用', 'Save the route and check offline access before departure.'),
  gear('备用电源', 'Backup power', '照明与应急', 'Light & emergency', '按设备和行程天数准备', 'Plan for your devices and trip length.'),
  gear('急救用品与应急保温', 'First aid & emergency warmth', '照明与应急', 'Light & emergency', '按个人情况准备，出发前了解使用方法', 'Adapt to personal needs and learn how to use them.'),
  gear('防晒用品', 'Sun protection', '防护与其他', 'Protection & other', '按暴露路段和季节选择', 'Choose for exposure and season.'),
  gear('垃圾袋', 'Waste bag', '防护与其他', 'Protection & other', '带走自己产生的垃圾', 'Pack out your waste.'),
];
const camping: RouteGuideGear[] = [
  gear('帐篷', 'Tent', '露营与睡眠', 'Camp & sleep', '确认营地允许露营后，按天气与人数准备', 'Confirm camping is allowed; choose for weather and group size.'),
  gear('睡袋', 'Sleeping bag', '露营与睡眠', 'Camp & sleep', '按营地实际夜间低温选择温标', 'Choose the rating for actual overnight temperatures.'),
  gear('防潮垫', 'Sleeping pad', '露营与睡眠', 'Camp & sleep', '结合地面与保温需要选择', 'Choose for the ground and insulation needed.'),
];
const day = (title: GuideText, summary: GuideText, detail: GuideText, items: GuideText[]): RouteGuideDay => ({ title, summary, detail, items });

/** All catalog routes get editable scaffolds. No named campsite, water source,
 * distance split, or duration is inferred from the route's total distance. */
export function getRouteGuidePlans(route: Pick<Poi, 'id' | 'name'>): RouteGuidePlan[] {
  const first = text('确认起点接驳与到达时间', 'Confirm trailhead access and arrival time');
  const last = text('确认终点接驳与返程安排', 'Confirm exit transport and return arrangements');
  const departure = text('出发前核实路线起终点、通行情况与天气。交通安排放在当天行程中，具体地点和时间由你补充。', 'Verify endpoints, access and weather before departure. Add actual locations and times to the day’s itinerary.');
  const finish = text('预留下山和返程余量。确认终点接驳方式与班次，不为赶车压缩行程。', 'Allow time for descent and the return trip. Verify connections rather than rushing to catch transport.');
  return [
    { id: 'day-hike', routeId: route.id, title: text('一日徒步 · 轻装版', 'One-day hike · day pack'), shortTitle: text('1天 · 轻装', '1 day · day pack'), description: text('单日行程参考，是否适用需结合路线与体能判断', 'A one-day reference plan; assess suitability for the route and your fitness.'), stay: 'day', draft: true,
      days: [day(text('起点 → 路线终点', 'Trailhead → route exit'), text('预留休息与返程时间', 'Allow time for breaks and transport'), departure, [first, text('徒步与途中休息（走法待确认）', 'Hike and breaks (route variant to confirm)'), last])], gear: basics },
    { id: 'two-day-stay', routeId: route.id, title: text('两日慢走 · 住宿版', 'Two-day hike · lodging'), shortTitle: text('2天 · 住宿', '2 days · lodging'), description: text('住宿行程参考，先确认沿线有可用住宿', 'A lodging reference plan; first verify suitable accommodation exists.'), stay: 'stay', draft: true,
      days: [day(text('起点 → 沿线住宿点（待确认）', 'Trailhead → lodging (to confirm)'), text('确认住宿位置与营业情况', 'Verify location and availability'), departure, [first, text('徒步与途中休息（走法待确认）', 'Hike and breaks (route variant to confirm)'), text('入住住宿点（需提前确认）', 'Check in to lodging (verify beforehand)')]), day(text('住宿点 → 路线终点', 'Lodging → route exit'), text('按体能调整，留足下山时间', 'Adjust to fitness and allow descent time'), finish, [text('整理装备并出发', 'Pack and depart'), text('继续徒步至终点（走法待确认）', 'Continue to the exit (route variant to confirm)'), last])], gear: basics },
    { id: 'three-day-camp', routeId: route.id, title: text('三天慢走 · 露营版', 'Three-day hike · camping'), shortTitle: text('3天 · 露营', '3 days · camping'), description: text('多日露营参考，先确认营地开放与通行条件', 'A multi-day reference plan; verify camping and route access first.'), stay: 'camp', draft: true,
      days: [day(text('起点 → 第一晚营地（待确认）', 'Trailhead → first camp (to confirm)'), text('留出适应与扎营时间', 'Allow time to settle in and pitch camp'), departure, [first, text('徒步至营地（位置待确认）', 'Hike to camp (location to confirm)'), text('扎营与晚间休息', 'Pitch camp and rest')]), day(text('沿线行进 → 第二晚营地（待确认）', 'Continue → second camp (to confirm)'), text('安排休息，核实补给与下撤选择', 'Plan breaks; verify supplies and exit options'), text('按实际路线补充每日路段与营地。水源、补给与下撤点需重新核实，不将历史记录视为当前保证。', 'Add daily sections and camps for the actual route. Recheck water, supplies and escape options.'), [text('整理营地并出发', 'Break camp and depart'), text('沿线徒步与休息（路段待确认）', 'Hike and breaks (section to confirm)'), text('抵达下一营地（位置待确认）', 'Arrive at next camp (location to confirm)')]), day(text('营地 → 路线终点', 'Camp → route exit'), text('留足下山与接驳时间', 'Allow time for descent and transport'), finish, [text('撤营并带走垃圾', 'Break camp and pack out waste'), text('下撤至终点（走法待确认）', 'Descend to exit (route variant to confirm)'), last])], gear: [...camping, ...basics] },
  ];
}

export type RouteGuideSort = 'recommended' | 'helpful' | 'updated';
export function sortRouteGuides(guides: RouteCommunityGuide[], sort: RouteGuideSort, stay?: GuideStay): RouteCommunityGuide[] {
  return guides.filter((guide) => !stay || guide.plan.stay === stay).sort((a, b) => {
    if (sort === 'updated') return b.updatedDate.localeCompare(a.updatedDate);
    if (sort === 'helpful') return b.helpful - a.helpful;
    return Number(b.season === 'autumn') - Number(a.season === 'autumn') || b.helpful - a.helpful;
  });
}

export function toRouteGuideTemplate(plan: RouteGuidePlan, lang: 'zh' | 'en'): RouteGuideJourneyTemplate {
  return {
    id: plan.id, routeId: plan.routeId, title: guideText(plan.title, lang),
    days: plan.days.map((day) => ({ title: guideText(day.title, lang), items: day.items.map((item) => guideText(item, lang)) })),
    gear: plan.gear.map((item) => ({ sourceType: 'recommendedTemplate', name: guideText(item.name, lang), categoryName: guideText(item.category, lang), note: guideText(item.note, lang), quantity: item.quantity, weightKg: item.weightKg })),
  };
}
