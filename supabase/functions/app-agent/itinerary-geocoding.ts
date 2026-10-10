/** Bare rural names are ambiguous nationally. Scope them to the destination's
 * province; explicit city/station names still resolve independently for travel. */
export function ruralLocationProvince(name: string, region?: string | null): string | undefined {
  if (!/(?:村|乡|镇|营地)$/.test(name.trim())) return undefined;
  const province = region?.match(/^(.+?(?:省|自治区|特别行政区))/)?.[1];
  if (!province || /省|自治区|特别行政区|市|县/.test(name)) return undefined;
  return province;
}
