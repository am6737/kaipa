import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Package, Weight, JapaneseYen } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { useI18n } from '../../i18n';
import {
  GearCat,
  GearItem,
  GearSet,
  Metric,
  WeightUnit,
  fmtMetric,
  fmtWeight,
  itemPrice,
  itemQty,
  itemWeight,
  metricValue,
} from '../../data/gear';
import { Press } from '../Press';
import { AppCard, AppProgressBar, AppSectionHeader, DetailPage, layout, radius, space, type } from '../../design-system';
import { LabeledDonut, Row } from './LabeledDonut';
import { yuan } from './parts';

type Props = {
  theme: Theme;
  items: GearItem[];
  sets: GearSet[];
  catMap: Record<string, GearCat>;
  weightUnit: WeightUnit;
  onBack: () => void;
  onOpenItem: (item: GearItem) => void;
};

const metricIcon = (metric: Metric, color: string) => {
  if (metric === 'price') return <JapaneseYen color={color} size={15} strokeWidth={1.9} />;
  if (metric === 'count') return <Package color={color} size={15} strokeWidth={1.9} />;
  return <Weight color={color} size={15} strokeWidth={1.9} />;
};

export function GearOverviewDetail({ theme, items, sets, catMap, weightUnit, onBack, onOpenItem }: Props) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>('weight');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const totals = useMemo(() => items.reduce(
    (sum, item) => ({
      weight: sum.weight + itemWeight(item),
      price: sum.price + itemPrice(item),
      count: sum.count + itemQty(item),
    }),
    { weight: 0, price: 0, count: 0 },
  ), [items]);

  const categoryRows = useMemo<Row[]>(() => {
    const grouped = new Map<string, { value: number; count: number }>();
    items.forEach((item) => {
      const current = grouped.get(item.cat) || { value: 0, count: 0 };
      current.value += metricValue(item, metric);
      current.count += itemQty(item);
      grouped.set(item.cat, current);
    });
    return [...grouped.entries()].map(([id, value]) => ({
      ...(catMap[id] || { id, name: t('gear.uncategorized'), color: theme.text3, builtin: false }),
      ...value,
    })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  }, [catMap, items, metric, t, theme.text3]);

  const metricTotal = categoryRows.reduce((sum, row) => sum + row.value, 0);
  const selectedRow = selectedCategory ? categoryRows.find((row) => row.id === selectedCategory) : undefined;
  const topItems = useMemo(() => items.slice().sort((a, b) => metricValue(b, metric) - metricValue(a, metric)).slice(0, 3), [items, metric]);
  const usedCategoryCount = useMemo(() => new Set(items.map((item) => item.cat)).size, [items]);

  const setRows = useMemo(() => sets.map((set) => {
    const setItems = set.items
      .map((name) => items.find((item) => item.name === name))
      .filter(Boolean)
      .map((item) => {
        const gear = item as GearItem;
        const override = (gear.id != null ? set.overrides?.[String(gear.id)] : undefined) || set.overrides?.[gear.name];
        return override ? { ...gear, ...override } : gear;
      });
    return {
      set,
      weight: setItems.reduce((sum, item) => sum + itemWeight(item), 0),
    };
  }), [items, sets]);

  const setWeightRows = useMemo(() => setRows
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.weight - a.weight), [setRows]);
  const maxSetWeight = setWeightRows[0]?.weight || 0;
  const chartWidth = Math.max(280, Math.min(width - layout.pagePadding * 2 - space.md * 2, 420));
  const metricOptions: { id: Metric; label: string }[] = [
    { id: 'weight', label: t('gear.stat.weight') },
    { id: 'price', label: t('gear.stat.value') },
    { id: 'count', label: t('gear.stat.count') },
  ];

  return (
    <DetailPage theme={theme} title={t('gear.overview.title')} onBack={onBack} backgroundColor={theme.featureSurface}>
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md }}>
        <AppCard theme={theme} radius={radius.feature} style={{ padding: space.lg, backgroundColor: theme.fieldSurface }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            <SummaryFact theme={theme} label={t('gear.stat.totalItems')} value={`${totals.count} ${t('gear.unit.items')}`} />
            <SummaryFact theme={theme} label={t('gear.stat.totalWeight')} value={fmtWeight(totals.weight, weightUnit)} />
            <SummaryFact theme={theme} label={t('gear.stat.totalValue')} value={yuan(totals.price)} />
            <SummaryFact theme={theme} label={t('gear.stat.categoryCount')} value={`${usedCategoryCount} ${t('gear.unit.cats')}`} />
          </View>
        </AppCard>

        <AppSectionHeader theme={theme} text={t('gear.overview.distribution')} variant="title" marginTop={space.xxl} />
        <View style={{ flexDirection: 'row', gap: space.xs, padding: space.xxs, borderRadius: radius.pill, backgroundColor: theme.fieldSurface, marginBottom: space.md }}>
          {metricOptions.map((option) => {
            const active = option.id === metric;
            return (
              <Press key={option.id} onPress={() => { setMetric(option.id); setSelectedCategory(null); }} style={{ flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.surfaceTop : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? theme.text : theme.text2 }}>{option.label}</Text>
              </Press>
            );
          })}
        </View>

        {items.length ? (
          <AppCard theme={theme} style={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.lg, alignItems: 'center' }}>
            <LabeledDonut theme={theme} agg={categoryRows} total={metricTotal} metric={metric} items={items} width={chartWidth} sel={selectedCategory} onSel={setSelectedCategory} weightUnit={weightUnit} showStats={false} />
            {selectedRow ? (
              <Text style={[type.caption, { color: theme.text3, marginTop: space.xs }]}>
                {t('gear.overview.selectedCategory', { name: selectedRow.name, value: fmtMetric(selectedRow.value, metric, weightUnit) })}
              </Text>
            ) : null}
          </AppCard>
        ) : <EmptyState theme={theme} text={t('gear.overview.empty')} />}


        {setWeightRows.length ? (
          <>
            <AppSectionHeader theme={theme} text={t('gear.overview.setWeightRanking')} variant="title" marginTop={space.xxl} />
            <View style={{ gap: space.xs }}>
              {setWeightRows.slice(0, 5).map((row) => {
                const share = maxSetWeight ? row.weight / maxSetWeight : 0;
                return (
                  <View key={row.set.id} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }}>
                      <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: '600' }]}>{row.set.name}</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{fmtWeight(row.weight, weightUnit)}</Text>
                    </View>
                    <AppProgressBar theme={theme} value={share * 100} color={theme.accent} />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {categoryRows.length ? (
          <>
            <AppSectionHeader theme={theme} text={t('gear.overview.categoryRanking')} variant="title" marginTop={space.xxl} />
            <View style={{ gap: space.xs }}>
              {categoryRows.slice(0, 6).map((row) => {
                const share = metricTotal ? row.value / metricTotal : 0;
                return (
                  <View key={row.id} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }}>
                      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: row.color, marginRight: space.xs }} />
                      <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: '600' }]}>{row.name}</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{fmtMetric(row.value, metric, weightUnit)}</Text>
                      <Text style={{ width: 44, textAlign: 'right', fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{(share * 100).toFixed(1)}%</Text>
                    </View>
                    <AppProgressBar theme={theme} value={share * 100} color={row.color} />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {topItems.length ? (
          <>
            <AppSectionHeader theme={theme} text={t('gear.overview.topGear')} variant="title" marginTop={space.xxl} />
            <View style={{ gap: space.xs }}>
              {topItems.map((item) => (
                <Press key={`${item.id || item.name}-${metric}`} onPress={() => onOpenItem(item)} style={{ minHeight: 70, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', borderRadius: radius.feature, backgroundColor: theme.surfaceTop }}>
                  <View style={{ width: 34, height: 34, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                    {metricIcon(metric, catMap[item.cat]?.color || theme.text2)}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
                    <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
                    <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{catMap[item.cat]?.name || t('gear.uncategorized')}</Text>
                  </View>
                  <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{fmtMetric(metricValue(item, metric), metric, weightUnit)}</Text>
                </Press>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </DetailPage>
  );
}

function SummaryFact({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={{ width: '48.5%', minWidth: 0, minHeight: 62, paddingVertical: space.xs, justifyContent: 'space-between' }}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text3 }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 19, fontWeight: '800', color: theme.text, marginTop: 6 }}>{value}</Text>
    </View>
  );
}

function EmptyState({ theme, text }: { theme: Theme; text: string }) {
  return <Text style={[type.body, { color: theme.text3, textAlign: 'center', paddingVertical: space.xxxl }]}>{text}</Text>;
}
