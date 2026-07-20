import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { GearCat, GearItem, WeightUnit, fmtWeight, itemPrice, itemQty, itemWeight, packStats } from '../../data/gear';
import { MONO } from '../../theme/fonts';

export interface GearSetExportGroup {
  cat: GearCat;
  items: GearItem[];
}

interface ExportCopy {
  totalWeight: string;
  totalValue: string;
  itemCount: string;
  categories: string;
  base: string;
  pack: string;
  worn: string;
  consumable: string;
  generatedBy: string;
}

export interface GearSetExportData {
  name: string;
  groups: GearSetExportGroup[];
  weightUnit: WeightUnit;
  copy: ExportCopy;
}

const money = (value: number) => `¥${Math.round(value).toLocaleString('en-US')}`;

const totalsFor = (groups: GearSetExportGroup[]) => {
  const items = groups.flatMap((group) => group.items);
  return {
    items,
    stats: packStats(items),
    weight: items.reduce((sum, item) => sum + itemWeight(item), 0),
    value: items.reduce((sum, item) => sum + itemPrice(item), 0),
  };
};

export function buildGearSetText(data: GearSetExportData) {
  const { items, stats, weight, value } = totalsFor(data.groups);
  const lines = [
    data.name,
    '',
    `${data.copy.totalWeight}: ${fmtWeight(weight, data.weightUnit, true)}`,
    `${data.copy.totalValue}: ${money(value)}`,
    `${data.copy.itemCount}: ${stats.count}`,
    `${data.copy.categories}: ${data.groups.length}`,
    `${data.copy.base}: ${fmtWeight(stats.base, data.weightUnit, true)}`,
    `${data.copy.pack}: ${fmtWeight(stats.pack, data.weightUnit, true)}`,
    `${data.copy.worn}: ${fmtWeight(stats.worn, data.weightUnit, true)}`,
    `${data.copy.consumable}: ${fmtWeight(stats.consumable, data.weightUnit, true)}`,
  ];

  data.groups.forEach((group) => {
    const groupWeight = group.items.reduce((sum, item) => sum + itemWeight(item), 0);
    lines.push('', `${group.cat.name} · ${fmtWeight(groupWeight, data.weightUnit, true)}`);
    group.items.forEach((item) => {
      lines.push(`- ${item.name} x${itemQty(item)} · ${fmtWeight(itemWeight(item), data.weightUnit, true)} · ${money(itemPrice(item))}`);
    });
  });

  lines.push('', data.copy.generatedBy);
  return lines.join('\n');
}

const htmlEscape = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export function buildGearSetHtml(data: GearSetExportData) {
  const { stats, weight, value } = totalsFor(data.groups);
  const stat = (label: string, valueText: string) => `<div class="stat"><span>${htmlEscape(label)}</span><strong>${htmlEscape(valueText)}</strong></div>`;
  const sections = data.groups.map((group) => {
    const groupWeight = group.items.reduce((sum, item) => sum + itemWeight(item), 0);
    const rows = group.items.map((item) => `
      <tr>
        <td>${htmlEscape(item.name)}</td>
        <td>${itemQty(item)}</td>
        <td>${htmlEscape(fmtWeight(itemWeight(item), data.weightUnit, true))}</td>
        <td>${htmlEscape(money(itemPrice(item)))}</td>
      </tr>`).join('');
    return `<section>
      <h2><i style="background:${htmlEscape(group.cat.color)}"></i>${htmlEscape(group.cat.name)}<small>${htmlEscape(fmtWeight(groupWeight, data.weightUnit, true))}</small></h2>
      <table><tbody>${rows}</tbody></table>
    </section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 32px; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171719; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding: 12px 0 24px; border-bottom: 2px solid #171719; }
    h1 { margin: 0; font-size: 28px; line-height: 1.25; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0 26px; }
    .stat { padding: 12px; background: #f3f3f5; border-radius: 8px; }
    .stat span { display: block; color: #707078; font-size: 10px; margin-bottom: 5px; }
    .stat strong { font-size: 14px; }
    section { break-inside: avoid; margin-top: 22px; }
    h2 { display: flex; align-items: center; margin: 0 0 6px; font-size: 14px; }
    h2 i { width: 8px; height: 8px; border-radius: 2px; margin-right: 8px; }
    h2 small { margin-left: auto; color: #77777f; font: 11px ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 8px 4px; border-bottom: 1px solid #e5e5e8; text-align: right; }
    td:first-child { text-align: left; width: 58%; }
    footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #d9d9dd; color: #8a8a91; font-size: 10px; }
  </style></head><body>
    <header><h1>${htmlEscape(data.name)}</h1></header>
    <div class="summary">
      ${stat(data.copy.totalWeight, fmtWeight(weight, data.weightUnit, true))}
      ${stat(data.copy.totalValue, money(value))}
      ${stat(data.copy.itemCount, String(stats.count))}
      ${stat(data.copy.categories, String(data.groups.length))}
    </div>
    ${sections}
    <footer>${htmlEscape(data.copy.generatedBy)}</footer>
  </body></html>`;
}

export const GearSetPoster = React.forwardRef<any, { data: GearSetExportData }>(({ data }, ref) => {
  const { stats, weight, value } = totalsFor(data.groups);
  return (
    <ViewShot ref={ref} style={styles.poster} options={{ format: 'png', quality: 1 }}>
      <View style={styles.posterHeader}>
        <Text style={styles.kicker}>KAIPA · GEAR SET</Text>
        <Text style={styles.posterTitle}>{data.name}</Text>
      </View>
      <View style={styles.posterStats}>
        <PosterStat label={data.copy.totalWeight} value={fmtWeight(weight, data.weightUnit, true)} />
        <PosterStat label={data.copy.totalValue} value={money(value)} />
        <PosterStat label={data.copy.itemCount} value={String(stats.count)} />
        <PosterStat label={data.copy.categories} value={String(data.groups.length)} />
      </View>
      {data.groups.map((group) => {
        const groupWeight = group.items.reduce((sum, item) => sum + itemWeight(item), 0);
        return (
          <View key={group.cat.id} style={styles.posterSection}>
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryDot, { backgroundColor: group.cat.color }]} />
              <Text style={styles.categoryName}>{group.cat.name}</Text>
              <Text style={styles.categoryWeight}>{fmtWeight(groupWeight, data.weightUnit, true)}</Text>
            </View>
            {group.items.map((item) => (
              <View key={`${group.cat.id}-${item.name}`} style={styles.posterRow}>
                <Text numberOfLines={1} style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>x{itemQty(item)} · {fmtWeight(itemWeight(item), data.weightUnit, true)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <View style={styles.posterFooter}>
        <Text style={styles.footerBrand}>Kaipa</Text>
        <Text style={styles.footerCopy}>{data.copy.generatedBy}</Text>
      </View>
    </ViewShot>
  );
});

GearSetPoster.displayName = 'GearSetPoster';

function PosterStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.posterStat}>
      <Text style={styles.posterStatLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.posterStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { width: 380, padding: 28, backgroundColor: '#F7F7F5' },
  posterHeader: { paddingTop: 8, paddingBottom: 22, borderBottomWidth: 2, borderBottomColor: '#161618' },
  kicker: { fontFamily: MONO, fontSize: 10, color: '#77777D' },
  posterTitle: { marginTop: 10, fontSize: 27, lineHeight: 34, fontWeight: '800', color: '#161618' },
  posterStats: { flexDirection: 'row', gap: 6, marginTop: 18 },
  posterStat: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 6, backgroundColor: '#EDEDEB' },
  posterStatLabel: { fontSize: 8.5, color: '#747479' },
  posterStatValue: { marginTop: 5, fontFamily: MONO, fontSize: 11, fontWeight: '700', color: '#161618' },
  posterSection: { marginTop: 22 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CFCFD2' },
  categoryDot: { width: 8, height: 8, borderRadius: 2, marginRight: 8 },
  categoryName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#2A2A2D' },
  categoryWeight: { fontFamily: MONO, fontSize: 9, color: '#77777D' },
  posterRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E1E2' },
  itemName: { flex: 1, fontSize: 10.5, color: '#2A2A2D' },
  itemMeta: { fontFamily: MONO, fontSize: 8.5, color: '#77777D' },
  posterFooter: { marginTop: 28, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#CFCFD2', flexDirection: 'row', alignItems: 'center' },
  footerBrand: { fontSize: 13, fontWeight: '800', color: '#161618' },
  footerCopy: { marginLeft: 'auto', fontSize: 8.5, color: '#8A8A90' },
});
