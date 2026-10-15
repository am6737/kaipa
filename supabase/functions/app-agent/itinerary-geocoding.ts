const MUNICIPALITIES = ['北京', '天津', '上海', '重庆'];
const AUTONOMOUS = ['内蒙古', '广西', '西藏', '宁夏', '新疆'];
const SPECIAL_REGIONS = ['香港', '澳门'];
const PROVINCE_SHORTS = ['河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '四川', '贵州', '云南', '陕西', '甘肃', '青海'];
const PROVINCE_ORDER = [...MUNICIPALITIES, ...AUTONOMOUS, ...SPECIAL_REGIONS, ...PROVINCE_SHORTS];

/** Journey regions are free text ("四川甘孜·党岭"), while the map provider only
 * scopes a search to a full administrative name. */
export function journeyProvince(region?: string | null): string | undefined {
  const text = region?.trim();
  if (!text) return undefined;
  const full = text.match(/^(.+?(?:省|自治区|特别行政区))/)?.[1];
  if (full) return full;
  const short = PROVINCE_ORDER.find(name => text.startsWith(name));
  if (!short) return undefined;
  if (MUNICIPALITIES.includes(short)) return `${short}市`;
  if (AUTONOMOUS.includes(short)) return `${short}自治区`;
  if (SPECIAL_REGIONS.includes(short)) return `${short}特别行政区`;
  return `${short}省`;
}

/** Bare rural names are ambiguous nationally, and the pattern is not only a
 * suffix — 卡尔杂村通铺 is a lodging in a hamlet. Scope any name that reads as a
 * rural place to the destination province; explicit city/station names still
 * resolve independently for travel. */
export function ruralLocationProvince(name: string, region?: string | null): string | undefined {
  if (!/(?:村|乡|镇|营地|牧场|垭口)/.test(name)) return undefined;
  if (/省|自治区|特别行政区|市|县/.test(name)) return undefined;
  return journeyProvince(region);
}

/** A provider has no POI for many hamlets under their full name, the same way
 * typing 卡尔杂村 in 高德 lands on 甲玉拉措山庄: the match is on the place stem.
 * Keep the full name first so an exact POI always wins. */
export function geocodeKeywordLadder(name: string): string[] {
  const trimmed = name.trim();
  const stem = trimmed.match(/^(.{2,}?)(?:村|寨|乡|镇|营地|驿站|垭口|牧场)$/)?.[1];
  return stem && stem !== trimmed ? [trimmed, stem] : [trimmed];
}
