// GearSetEditor.tsx — 新建 / 编辑清单. A bottom sheet (reusing NJBottomSheet) that
// names a packing set and picks its gear: a fixed header (取消 / 标题 / 保存, name
// field, search + 已选 count) over a scrollable gear list grouped by category, each
// group with a 全选 / 取消全选 shortcut and per-row checkboxes. Mirrors the
// prototype's GxSetEditorSheet; saving hands back (name, itemNames) to GearScreen.
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneySheet';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, GearSetOverride, GEAR_STATUS, GearCarryStatus, WeightUnit } from '../../data/gear';
import { GearItemImage, yuan, fmtKg } from './parts';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');

export function GearSetEditor({
  theme,
  mode,
  weightUnit = 'kg',
  initial,
  cats,
  allItems,
  catMap,
  onCancel,
  onSave,
}: {
  theme: Theme;
  mode: 'new' | 'edit';
  weightUnit?: WeightUnit;
  initial?: GearSet | null;
  cats: GearCat[];
  allItems: GearItem[];
  catMap: Record<string, GearCat>;
  onCancel: () => void;
  onSave: (name: string, items: string[], overrides: Record<string, GearSetOverride>) => void;
}) {
  const { t } = useI18n();
  const { height: winH } = useWindowDimensions();
  const [name, setName] = useState(initial ? initial.name : '');
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial ? initial.items : []));
  const [overrides, setOverrides] = useState<Record<string, GearSetOverride>>(() => {
    const out: Record<string, GearSetOverride> = {};
    (initial?.items || []).forEach((name) => {
      const it = allItems.find((x) => x.name === name);
      const source = (it?.id != null ? initial?.overrides?.[String(it.id)] : undefined) || initial?.overrides?.[name];
      if (source) out[it?.id != null ? String(it.id) : name] = source;
    });
    return out;
  });
  const [q, setQ] = useState('');
  const qq = q.trim();
  const valid = name.trim().length > 0 && sel.size > 0;

  const toggle = (n: string) =>
    setSel((s) => {
      const x = new Set(s);
      x.has(n) ? x.delete(n) : x.add(n);
      return x;
    });
  const toggleCat = (names: string[]) =>
    setSel((s) => {
      const x = new Set(s);
      const all = names.every((n) => x.has(n));
      names.forEach((n) => (all ? x.delete(n) : x.add(n)));
      return x;
    });
  const save = () => {
    if (!valid) return;
    const selected = allItems.filter((it) => sel.has(it.name));
    const cleanOverrides: Record<string, GearSetOverride> = {};
    selected.forEach((it) => {
      const key = it.id != null ? String(it.id) : it.name;
      if (overrides[key]) cleanOverrides[key] = overrides[key];
    });
    onSave(name.trim(), selected.map((it) => it.name), cleanOverrides);
  };

  // Group items by category, honoring the category list's order; filter by query.
  const byCat: Record<string, GearItem[]> = {};
  allItems.forEach((it) => {
    if (!qq || it.name.includes(qq)) (byCat[it.cat] = byCat[it.cat] || []).push(it);
  });
  const order = [...cats.map((c) => c.id), ...Object.keys(byCat)].filter((id, i, a) => a.indexOf(id) === i && byCat[id]);

  const keyFor = (it: GearItem) => it.id != null ? String(it.id) : it.name;
  const getOverride = (it: GearItem) => overrides[keyFor(it)] || {};
  const patchOverride = (it: GearItem, patch: GearSetOverride) => {
    const key = keyFor(it);
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const cycleStatus = (it: GearItem) => {
    const current = getOverride(it).status || it.status || 'packed';
    const idx = GEAR_STATUS.findIndex((s) => s.id === current);
    patchOverride(it, { status: GEAR_STATUS[(idx + 1) % GEAR_STATUS.length].id as GearCarryStatus });
  };

  return (
    <NJBottomSheet theme={theme} onClose={onCancel} full bodyScrolls>
      {/* fixed header */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Press onPress={onCancel} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{mode === 'edit' ? t('gear.setEditor.titleEdit') : t('gear.setEditor.titleNew')}</Text>
          <Press onPress={save} disabled={!valid} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>{t('common.save')}</Text>
          </Press>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('gear.setEditor.namePlaceholder')}
          placeholderTextColor={theme.text3}
          maxLength={24}
          style={{
            marginTop: 14,
            paddingHorizontal: 14,
            height: 44,
            borderRadius: 12,
            backgroundColor: fieldBg(theme),
            fontSize: 15.5,
            fontWeight: '600',
            color: theme.text,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 40, borderRadius: 11, backgroundColor: fieldBg(theme) }}>
            <Icon name="search" color={theme.text2} size={16} />
            <TextInput value={q} onChangeText={setQ} placeholder={t('gear.search.items')} placeholderTextColor={theme.text3} style={{ flex: 1, fontSize: 15, color: theme.text, padding: 0 }} />
            {q ? (
              <Press onPress={() => setQ('')} style={{ padding: 2 }}>
                <Icon name="close" color={theme.text2} size={14} />
              </Press>
            ) : null}
          </View>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{t('gear.setEditor.selectedCount', { count: sel.size })}</Text>
        </View>
      </View>

      {/* scrolling gear list */}
      <ScrollView style={{ maxHeight: winH * 0.5 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {order.length === 0 ? (
          <Text style={{ paddingVertical: 40, textAlign: 'center', fontSize: 14, color: theme.text3 }}>{t('gear.empty.noItems')}</Text>
        ) : (
          order.map((id) => {
            const cat = catMap[id] || { id, name: t('gear.uncategorized'), color: theme.text3, builtin: true };
            const its = byCat[id];
            const names = its.map((it) => it.name);
            const allOn = names.every((n) => sel.has(n));
            return (
              <View key={id} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7, paddingHorizontal: 2 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cat.color }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: theme.text2 }}>{cat.name}</Text>
                  <Press onPress={() => toggleCat(names)} hitSlop={6}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.accent }}>{allOn ? t('gear.setEditor.deselectAll') : t('gear.setEditor.selectAll')}</Text>
                  </Press>
                </View>
                <View style={{ backgroundColor: theme.surfaceTop, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, overflow: 'hidden' }}>
                  {its.map((it, i) => {
                    const on = sel.has(it.name);
                    return (
                      <React.Fragment key={it.name}>
                        {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 55 }} />}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 8 }}>
                          <Press onPress={() => toggle(it.name)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <GearItemImage theme={theme} item={it} radius={9} style={{ width: 30, height: 30 }} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{it.name}</Text>
                              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 2 }}>{fmtKg(it.w * (it.qty || 1), weightUnit)} · {yuan(it.p * (it.qty || 1))}</Text>
                            </View>
                            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: theme.hairline }}>
                              {on ? <Icon name="check" color="#fff" size={13} strokeWidth={3} /> : null}
                            </View>
                          </Press>
                          {on ? (
                            <View style={{ alignItems: 'flex-end', gap: 5 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Press onPress={() => patchOverride(it, { qty: Math.max(1, (getOverride(it).qty || it.qty || 1) - 1) })} style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Text style={{ color: theme.text2, fontWeight: '800' }}>−</Text></Press>
                                <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '800', color: theme.text, minWidth: 18, textAlign: 'center' }}>×{getOverride(it).qty || it.qty || 1}</Text>
                                <Press onPress={() => patchOverride(it, { qty: (getOverride(it).qty || it.qty || 1) + 1 })} style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: fieldBg(theme) }}><Text style={{ color: theme.text2, fontWeight: '800' }}>+</Text></Press>
                              </View>
                              <Press onPress={() => cycleStatus(it)} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: fieldBg(theme) }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.text2 }}>{t(`gear.status.${getOverride(it).status || it.status || 'packed'}` as any)}</Text>
                              </Press>
                            </View>
                          ) : null}
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </NJBottomSheet>
  );
}
