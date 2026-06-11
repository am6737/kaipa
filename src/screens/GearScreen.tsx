// GearScreen.tsx — the 装备 tab: a value/weight/count breakdown of your gear
// library as a donut, plus 装备 / 分类 / 套装 views.
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Donut } from '../components/Donut';
import { useNav } from '../nav/NavContext';
import {
  GX_CATS,
  GX_ITEMS,
  GX_SETS,
  Metric,
  METRICS,
  aggregateByCat,
  metricTotals,
  metricValue,
  fmtMetric,
  catById,
} from '../data/gear';

type Tab = 'items' | 'cats' | 'sets';

export function GearScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>('items');
  const [metric, setMetric] = useState<Metric>('price');
  const [query, setQuery] = useState('');

  const items = GX_ITEMS;
  const totals = useMemo(() => metricTotals(items), [items]);
  const agg = useMemo(() => aggregateByCat(items, metric), [items, metric]);
  const totalForMetric = agg.reduce((s, a) => s + a.value, 0);

  const filteredItems = items.filter(
    (it) => !query || it.name.toLowerCase().includes(query.toLowerCase()) || catById(it.cat).name.includes(query)
  );

  const metricIndex = METRICS.findIndex((m) => m.id === metric);
  const cycleMetric = (dir: number) => setMetric(METRICS[(metricIndex + dir + METRICS.length) % METRICS.length].id);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 110 }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: theme.text, letterSpacing: 0.2 }}>装备</Text>
          <Press onPress={() => nav.showToast('添加装备')} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" color="#fff" size={20} />
          </Press>
        </View>

        {/* segmented */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, padding: 3, borderRadius: 14, gap: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }}>
          {([
            { id: 'items', label: '装备', count: items.length },
            { id: 'cats', label: '分类', count: GX_CATS.length },
            { id: 'sets', label: '套装', count: GX_SETS.length },
          ] as { id: Tab; label: string; count: number }[]).map((t) => {
            const active = tab === t.id;
            return (
              <Press
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{
                  flex: 1,
                  paddingVertical: 7,
                  borderRadius: 11,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  backgroundColor: active ? (theme.dark ? '#1C1C1E' : '#fff') : 'transparent',
                  ...(active ? (theme.dark ? { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }) : {}),
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? theme.text : theme.text2 }}>{t.label}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{t.count}</Text>
              </Press>
            );
          })}
        </View>

        {tab === 'items' && (
          <ItemsTab
            theme={theme}
            metric={metric}
            metricLabel={METRICS[metricIndex].label}
            cycleMetric={cycleMetric}
            agg={agg}
            totalForMetric={totalForMetric}
            totals={totals}
            query={query}
            setQuery={setQuery}
            items={filteredItems}
            onItem={(name: string) => nav.showToast(name)}
          />
        )}
        {tab === 'cats' && <CatsTab theme={theme} metric={metric} agg={agg} totalForMetric={totalForMetric} onCat={(n: string) => nav.showToast(n)} />}
        {tab === 'sets' && <SetsTab theme={theme} onSet={(n) => nav.showToast(n)} />}
      </ScrollView>
    </View>
  );
}

function MetricStepper({ theme, label, onLeft, onRight }: { theme: Theme; label: string; onLeft: () => void; onRight: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', padding: 3, borderRadius: 13, gap: 2, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', marginTop: 16 }}>
      <Press onPress={onLeft} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevronL" color={theme.text2} size={16} />
      </Press>
      <Text style={{ minWidth: 44, textAlign: 'center', fontSize: 14, fontWeight: '700', color: theme.text }}>{label}</Text>
      <Press onPress={onRight} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chevronR" color={theme.text2} size={16} />
      </Press>
    </View>
  );
}

function StatTiny({ theme, value, label }: { theme: Theme; value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '800', color: theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: theme.text2, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ItemsTab({ theme, metric, metricLabel, cycleMetric, agg, totalForMetric, totals, query, setQuery, items, onItem }: any) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <MetricStepper theme={theme} label={metricLabel} onLeft={() => cycleMetric(-1)} onRight={() => cycleMetric(1)} />
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Donut
          theme={theme}
          size={208}
          thickness={28}
          segments={agg.map((a: any) => ({ value: a.value, color: a.cat.color }))}
          centerTop={metricLabel}
          centerValue={fmtMetric(totalForMetric, metric)}
          centerSub={`${items.length} 件 · ${agg.length} 类`}
        />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 16, marginBottom: 6 }}>
        <StatTiny theme={theme} value={'¥' + Math.round(totals.price).toLocaleString('en-US')} label="装备总值" />
        <StatTiny theme={theme} value={totals.weight.toFixed(1) + 'kg'} label="总重量" />
        <StatTiny theme={theme} value={String(totals.count)} label="数量" />
        <StatTiny theme={theme} value={String(agg.length)} label="分类" />
      </View>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginVertical: 14 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 40, borderRadius: 11, backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }}>
          <Icon name="search" color={theme.text3} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索装备、分类"
            placeholderTextColor={theme.text3}
            style={{ flex: 1, fontSize: 15, color: theme.text, padding: 0 }}
          />
        </View>
      </View>

      {items.map((it: any, idx: number) => {
        const cat = catById(it.cat);
        return (
          <Press key={it.name} onPress={() => onItem(it.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: idx === items.length - 1 ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cat.color + (theme.dark ? '52' : '26'), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: cat.color }}>{cat.name.slice(0, 2)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: theme.text }}>{it.name}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>
                {cat.name} · <Text style={{ fontFamily: MONO }}>{it.w}kg · ¥{it.p}</Text>
              </Text>
            </View>
            <Icon name="chevronR" color={theme.text3} size={15} />
          </Press>
        );
      })}
    </View>
  );
}

function CatsTab({ theme, metric, agg, totalForMetric, onCat }: any) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
      {agg.map((a: any) => {
        const pct = Math.round((a.value / (totalForMetric || 1)) * 100);
        return (
          <Press key={a.cat.id} onPress={() => onCat(a.cat.name)} style={{ padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: a.cat.color }} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text }}>{a.cat.name}</Text>
              <Text style={{ fontFamily: MONO, fontSize: 13, fontWeight: '700', color: theme.text }}>{fmtMetric(a.value, metric)}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
              <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: a.cat.color }} />
            </View>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, marginTop: 6 }}>{pct}% of total</Text>
          </Press>
        );
      })}
    </View>
  );
}

function SetsTab({ theme, onSet }: { theme: Theme; onSet: (n: string) => void }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 10 }}>
      {GX_SETS.map((set) => {
        const setItems = GX_ITEMS.filter((it) => set.items.includes(it.name));
        const agg = aggregateByCat(setItems, 'weight');
        const weight = setItems.reduce((s, it) => s + metricValue(it, 'weight'), 0);
        const price = setItems.reduce((s, it) => s + metricValue(it, 'price'), 0);
        return (
          <Press key={set.id} onPress={() => onSet(set.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.022)' }}>
            <Donut theme={theme} size={64} thickness={9} segments={agg.map((a) => ({ value: a.value, color: a.cat.color }))} centerValue={weight.toFixed(1)} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{set.name}</Text>
              <Text style={{ fontSize: 12, color: theme.text2, marginTop: 3 }}>{setItems.length} 件 · <Text style={{ fontFamily: MONO }}>{weight.toFixed(1)}kg · ¥{Math.round(price).toLocaleString('en-US')}</Text></Text>
            </View>
            <Icon name="chevronR" color={theme.text3} size={16} />
          </Press>
        );
      })}
    </View>
  );
}
