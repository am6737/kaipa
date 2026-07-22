import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { Theme } from '../../theme/theme';
import { GearCat, GearItem, Metric, WeightUnit, fmtWeight, itemPrice, itemQty, itemWeight, packStats, splitWeight } from '../../data/gear';
import { MONO } from '../../theme/fonts';
import { LabeledDonut, Row } from './LabeledDonut';
import { GearItemImage } from './parts';

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

export type GearSetExportDisplaySettings = { images: boolean; weight: boolean; value: boolean; groupStats: boolean };

const money = (value: number) => `¥${Math.round(value).toLocaleString('en-US')}`;
const compactMoney = (value: number) => {
  if (value < 10000) return money(value);
  const wan = value / 10000;
  return `¥${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};

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
  const { stats, weight, value } = totalsFor(data.groups);
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

const fieldBg = (theme: Theme) => (theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
const fieldBorder = (theme: Theme) => (theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.035)');

function ExportStatTile({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={[styles.matchStatTile, { backgroundColor: fieldBg(theme), borderColor: fieldBorder(theme) }]}>
      <Text style={[styles.matchStatLabel, { color: theme.text2 }]}>{label}</Text>
      <View style={styles.matchStatValueRow}>
        <Text numberOfLines={1} style={[styles.matchStatValue, { color: theme.text }]}>{value}</Text>
        {unit ? <Text style={[styles.matchStatUnit, { color: theme.text }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ExportFact({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={styles.matchFact}>
      <Text style={[styles.matchFactLabel, { color: theme.text2 }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.matchFactValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export const GearSetPoster = React.forwardRef<any, { data: GearSetExportData; theme: Theme; width: number; metric: Metric; agg: Row[]; total: number; items: GearItem[]; selected: string | null; displaySettings: GearSetExportDisplaySettings }>(({ data, theme, width, metric, agg, total, items, selected, displaySettings }, ref) => {
  const restCatIds = agg.slice(5).map((row) => row.id);
  const focusedItems = !selected
    ? items
    : selected === '__rest'
      ? items.filter((item) => restCatIds.includes(item.cat))
      : items.filter((item) => item.cat === selected);
  const focusedStats = packStats(focusedItems);
  const focusedWeight = focusedItems.reduce((sum, item) => sum + itemWeight(item), 0);
  const focusedValue = focusedItems.reduce((sum, item) => sum + itemPrice(item), 0);
  const focusedCatCount = new Set(focusedItems.map((item) => item.cat)).size;
  const weightMain = splitWeight(focusedWeight, data.weightUnit);
  const posterWidth = Math.max(320, Math.min(width, 520));
  return (
    <ViewShot ref={ref} style={[styles.matchPoster, { width: posterWidth, backgroundColor: theme.dark ? theme.bg : '#FFFFFF' }]} options={{ format: 'png', quality: 1 }}>
      <View style={styles.matchContent}>
        <View style={styles.matchHeader}>
          <Text style={[styles.matchTitle, { color: theme.text }]} numberOfLines={3}>{data.name}</Text>
        </View>

        {items.length > 0 ? (
          <>
            <View style={styles.matchDonutWrap}>
              <LabeledDonut theme={theme} agg={agg} total={total} metric={metric} items={items} width={Math.min(420, posterWidth - 56)} sel={selected} onSel={() => {}} weightUnit={data.weightUnit} showStats={false} animated={false} />
            </View>

            <View style={styles.matchStatGrid}>
              <ExportStatTile theme={theme} label={data.copy.totalWeight} value={weightMain.value} unit={weightMain.unit} />
              <ExportStatTile theme={theme} label={data.copy.totalValue} value={compactMoney(focusedValue)} />
            </View>

            <View style={styles.matchFacts}>
              <ExportFact theme={theme} label={data.copy.itemCount} value={`${focusedStats.count}`} />
              <ExportFact theme={theme} label={data.copy.categories} value={`${focusedCatCount}`} />
              <ExportFact theme={theme} label={data.copy.base} value={fmtWeight(focusedStats.base, data.weightUnit, true)} />
              <ExportFact theme={theme} label={data.copy.pack} value={fmtWeight(focusedStats.pack, data.weightUnit, true)} />
              <ExportFact theme={theme} label={data.copy.worn} value={fmtWeight(focusedStats.worn, data.weightUnit, true)} />
              <ExportFact theme={theme} label={data.copy.consumable} value={fmtWeight(focusedStats.consumable, data.weightUnit, true)} />
            </View>

            {data.groups.map((group, gi) => {
              const groupWeight = group.items.reduce((sum, item) => sum + itemWeight(item), 0);
              return (
                <View key={group.cat.id} style={[styles.matchSection, { marginTop: gi === 0 ? 30 : 18 }]}>
                  <View style={styles.matchCategoryHeader}>
                    <Text style={[styles.matchCategoryName, { color: theme.text2 }]}>{group.cat.name}</Text>
                    {displaySettings.groupStats ? <Text style={[styles.matchCategoryMeta, { color: theme.text3 }]}>{group.items.length} · {fmtWeight(groupWeight, data.weightUnit, true)}</Text> : null}
                  </View>
                  {group.items.map((item) => {
                    const meta = [displaySettings.weight ? fmtWeight(itemWeight(item), data.weightUnit) : null, displaySettings.value ? money(itemPrice(item)) : null, itemQty(item) > 1 ? `×${itemQty(item)}` : null].filter(Boolean).join(' · ');
                    return (
                      <View key={`${group.cat.id}-${item.name}`} style={styles.matchRow}>
                        {displaySettings.images ? <GearItemImage theme={theme} item={item} radius={12} style={styles.matchThumb} /> : null}
                        <View style={styles.matchRowText}>
                          <Text numberOfLines={1} style={[styles.matchItemName, { color: theme.text }]}>{item.name}</Text>
                          {meta ? <Text style={[styles.matchItemMeta, { color: theme.text2 }]}>{meta}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        ) : null}
      </View>
    </ViewShot>
  );
});

GearSetPoster.displayName = 'GearSetPoster';

const styles = StyleSheet.create({
  matchPoster: { paddingBottom: 56 },
  matchContent: { paddingHorizontal: 32, paddingTop: 18 },
  matchHeader: { paddingTop: 10, paddingBottom: 18 },
  matchTitle: { fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  matchDonutWrap: { alignItems: 'center', marginHorizontal: -4, marginTop: 14 },
  matchStatGrid: { flexDirection: 'row', gap: 12, marginTop: 26 },
  matchStatTile: { flex: 1, minHeight: 110, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 17, justifyContent: 'space-between' },
  matchStatLabel: { fontSize: 15, letterSpacing: -0.1 },
  matchStatValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  matchStatValue: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  matchStatUnit: { fontSize: 17, fontWeight: '700' },
  matchFacts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 28 },
  matchFact: { width: '50%', paddingVertical: 14, paddingRight: 18 },
  matchFactLabel: { fontSize: 15.5 },
  matchFactValue: { marginTop: 3, fontSize: 13, fontWeight: '700' },
  matchSection: {},
  matchCategoryHeader: { flexDirection: 'row', alignItems: 'center' },
  matchCategoryName: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  matchCategoryMeta: { fontFamily: MONO, fontSize: 10.5 },
  matchRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  matchThumb: { width: 50, height: 50 },
  matchRowText: { flex: 1, minWidth: 0 },
  matchItemName: { fontSize: 14, fontWeight: '600' },
  matchItemMeta: { marginTop: 3, fontFamily: MONO, fontSize: 10.5 },
});
