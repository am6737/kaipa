// gearSetFingerprint.ts — one short string for the contents of a 装备清单, so
// 清单判官 can tell whether the set changed since the review sitting in its
// conversation. It covers what the review reads (list_gear_sets' fields), not
// how the set is displayed.
import { itemQty, itemStatus, type GearItem, type GearSet } from '../data/gear';

/** FNV-1a over the sorted item rows plus the set's own text. */
export function gearSetFingerprint(set: GearSet, items: GearItem[]): string {
  const rows = items
    .map((item) => [
      item.id ?? item.name,
      item.name,
      item.cat,
      item.owned === false ? 0 : 1,
      (item.w || 0).toFixed(3),
      itemQty(item),
      itemStatus(item),
      item.note || '',
    ].join(':'))
    .sort();
  const text = [set.name, set.description?.trim() || '', rows.join('\n')].join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `gs1.${text.length}.${hash.toString(36)}`;
}
