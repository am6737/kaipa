// GearSetDetail.tsx — 套装详情. Tap a packing set to see its composition: the
// same metric-driven leader-line donut as the 装备 tab (tap a segment to focus,
// the readout strip narrows to that category), then the hand-picked gear grouped
// by category. Tap any row to drill
// into the item. The ··· menu offers 编辑 / 删除套装 (delete only removes the set,
// the gear stays in the library), confirmed through the shared action sheet.
import React, { useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, Metric, METRICS, itemWeight, itemPrice, itemQty, packStats, WeightUnit, fmtWeight } from '../../data/gear';
import { GearPushPage, GearCard, GearItemRow, CircleBtn } from './parts';
import { LabeledDonut, Row } from './LabeledDonut';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');

function MetricStepper({ theme, metric, setMetric }: { theme: Theme; metric: Metric; setMetric: (m: Metric) => void }) {
  const idx = METRICS.findIndex((m) => m.id === metric);
  const go = (d: number) => setMetric(METRICS[(idx + d + METRICS.length) % METRICS.length].id);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 13, gap: 2, backgroundColor: fieldBg(theme) }}>
      <Press onPress={() => go(-1)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevronL" color={theme.text2} size={16} />
      </Press>
      <Text style={{ minWidth: 40, textAlign: 'center', fontSize: 14, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>{METRICS[idx].label}</Text>
      <Press onPress={() => go(1)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevronR" color={theme.text2} size={16} />
      </Press>
    </View>
  );
}

interface Group {
  cat: GearCat;
  its: GearItem[];
  w: number;
  p: number;
  count: number;
}

export function GearSetDetail({
  theme,
  set,
  allItems,
  catMap,
  weightUnit = 'kg',
  onBack,
  onOpenItem,
  onDelete,
  onEdit,
}: {
  theme: Theme;
  set: GearSet;
  allItems: GearItem[];
  catMap: Record<string, GearCat>;
  weightUnit?: WeightUnit;
  onBack: () => void;
  onOpenItem: (it: GearItem) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const { width: winW } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>('weight');
  const [sel, setSel] = useState<string | null>(null);

  const applyOverride = (it: GearItem): GearItem => {
    const override = (it.id != null ? set.overrides?.[String(it.id)] : undefined) || set.overrides?.[it.name];
    return override ? { ...it, ...override } : it;
  };

  // Group the set's hand-picked items by category (order of first appearance).
  const groups: Group[] = [];
  const gmap: Record<string, Group> = {};
  set.items.forEach((name) => {
    const base = allItems.find((x) => x.name === name);
    if (!base) return;
    const it = applyOverride(base);
    let g = gmap[it.cat];
    if (!g) {
      const cat = catMap[it.cat] || { id: it.cat, name: t('gear.uncategorized'), color: theme.text3, builtin: true };
      g = gmap[it.cat] = { cat, its: [], w: 0, p: 0, count: 0 };
      groups.push(g);
    }
    g.its.push(it);
    g.w += itemWeight(it);
    g.p += itemPrice(it);
    g.count += itemQty(it);
  });

  // Same logic as the 装备 tab: qty-free per-category aggregation for the current
  // metric, fed to the shared LabeledDonut (which renders its own readout strip).
  const setItems = groups.flatMap((g) => g.its);
  const valFor = (g: Group) => (metric === 'price' ? g.its.reduce((a, it) => a + itemPrice(it), 0) : metric === 'weight' ? g.its.reduce((a, it) => a + itemWeight(it), 0) : g.its.reduce((a, it) => a + itemQty(it), 0));
  const agg: Row[] = groups
    .map((g) => ({ ...g.cat, value: valFor(g), count: g.its.length }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = agg.reduce((a, r) => a + r.value, 0);
  const totN = groups.reduce((a, g) => a + g.count, 0);
  const setPack = packStats(setItems);

  const confirmDelete = () =>
    nav.openActionSheet({
      title: t('gear.setDetail.deleteConfirmTitle', { name: set.name }),
      message: t('gear.setDetail.deleteConfirmMessage'),
      items: [{ label: t('gear.setDetail.deleteSet'), icon: 'trash', destructive: true, onPress: onDelete }],
    });
  const openMenu = () =>
    nav.openActionSheet({
      title: set.name,
      items: [
        { label: t('gear.setDetail.editSet'), icon: 'edit', onPress: onEdit },
        { label: t('gear.setDetail.deleteSet'), icon: 'trash', destructive: true, onPress: confirmDelete },
      ],
    });

  return (
    <GearPushPage theme={theme} onBack={onBack} title={set.name} right={<CircleBtn theme={theme} name="more" onPress={openMenu} />}>
      <View style={{ paddingHorizontal: 20 }}>
        {totN === 0 ? (
          <GearCard theme={theme} style={{ paddingVertical: 30, paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text2, textAlign: 'center' }}>{t('gear.setDetail.emptyTitle')}</Text>
            <Text style={{ fontSize: 12.5, color: theme.text3, textAlign: 'center', marginTop: 5 }}>{t('gear.setDetail.emptyBody')}</Text>
          </GearCard>
        ) : (
          <>
            {/* composition hero — same leader-line donut + readout strip as 装备 */}
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <MetricStepper theme={theme} metric={metric} setMetric={setMetric} />
            </View>
            <LabeledDonut theme={theme} agg={agg} total={total} metric={metric} items={setItems} width={winW - 40} sel={sel} onSel={setSel} weightUnit={weightUnit} />
            <GearCard theme={theme} style={{ paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2, marginBottom: 8 }}>{t('gear.pack.title')}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: MONO, fontSize: 12.5, color: theme.text }}>{t('gear.pack.base')} {fmtWeight(setPack.base, weightUnit, true)}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12.5, color: theme.text }}>{t('gear.pack.pack')} {fmtWeight(setPack.pack, weightUnit, true)}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 12.5, color: theme.text }}>{t('gear.pack.worn')} {fmtWeight(setPack.worn, weightUnit, true)}</Text>
              </View>
            </GearCard>

            {/* grouped gear list */}
            {groups.map((g, gi) => (
              <View key={g.cat.id} style={{ marginTop: gi === 0 ? 24 : 0, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7, paddingHorizontal: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: g.cat.color }} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.text2 }}>{g.cat.name}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{g.its.length}</Text>
                </View>
                <GearCard theme={theme}>
                  {g.its.map((it, i) => (
                    <GearItemRow key={it.name} theme={theme} item={it} last={i === g.its.length - 1} onPress={() => onOpenItem(it)} weightUnit={weightUnit} />
                  ))}
                </GearCard>
              </View>
            ))}
          </>
        )}
      </View>
    </GearPushPage>
  );
}
