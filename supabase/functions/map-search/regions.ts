// Departure answers are city level: a station or a mall says nothing a city
// does not, and the useful part of a suggestion list is telling 北京朝阳区
// from 辽宁朝阳市. AMap input tips restricted to these place-name typecodes
// match while the user is still typing and carry the full 省市区 path.
export const REGION_TYPECODES = ['190102', '190103', '190104', '190105'];
export const REGION_LIMIT = 5;

type AmapTip = { name?: unknown; district?: unknown; typecode?: unknown };

export type RegionSuggestion = {
  // The area itself, e.g. 朝阳区.
  name: string;
  // Where it sits, e.g. 北京市; empty for a province or municipality.
  parent: string;
  // What the departure answer carries, e.g. 北京市朝阳区.
  place: string;
};

export function parseRegionTips(tips: unknown, query: string): RegionSuggestion[] {
  if (!Array.isArray(tips)) return [];
  const results: RegionSuggestion[] = [];
  for (const tip of tips as AmapTip[]) {
    const name = typeof tip?.name === 'string' ? tip.name.trim() : '';
    const district = typeof tip?.district === 'string' ? tip.district.trim() : '';
    if (!name || typeof tip.typecode !== 'string' || !REGION_TYPECODES.includes(tip.typecode)) continue;
    const place = district.endsWith(name) ? district : `${district}${name}`;
    // Tips pad the list with nearby areas; keep the ones the user typed.
    if (!place.includes(query)) continue;
    if (results.some((result) => result.place === place)) continue;
    results.push({ name, parent: place.slice(0, place.length - name.length), place });
    if (results.length >= REGION_LIMIT) break;
  }
  return results;
}
