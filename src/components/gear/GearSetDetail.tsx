// GearSetDetail.tsx — 套装详情. Uses the same calm, airy visual language as the
// redesigned 装备详情: floating chrome, a strong typographic header, generous
// whitespace, soft stat tiles, lightweight metadata and an unboxed item list.
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Modal, Pressable, Animated, Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet, Metric, METRICS, itemWeight, itemPrice, itemQty, packStats, WeightUnit, fmtWeight, splitWeight } from '../../data/gear';
import { GearPushPage, GearItemRow, CircleBtn, yuan } from './parts';
import { LabeledDonut, Row } from './LabeledDonut';
import { buildGearSetHtml, buildGearSetText, GearSetExportData, GearSetPoster } from './GearSetExport';

const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
const fieldBorder = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.035)');
const compactYuan = (value: number) => {
  if (value < 10000) return yuan(value);
  const wan = value / 10000;
  return `¥${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};

function MetricMenu({ theme, metric, setMetric }: { theme: Theme; metric: Metric; setMetric: (m: Metric) => void }) {
  const anchorRef = useRef<View>(null);
  const { width: winW } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const arrowRotation = useRef(new Animated.Value(0)).current;
  const active = METRICS.find((option) => option.id === metric) || METRICS[0];
  const panelWidth = 184;

  React.useEffect(() => {
    Animated.timing(arrowRotation, {
      toValue: anchor ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [anchor, arrowRotation]);

  const open = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Press onPress={open} style={{ width: 106, height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: fieldBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: fieldBorder(theme) }}>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: theme.text }}>{active.label}</Text>
          <Animated.View style={{ transform: [{ rotate: arrowRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Icon name="chevronDown" color={theme.text2} size={13} strokeWidth={2.1} />
          </Animated.View>
        </Press>
      </View>

      <Modal visible={!!anchor} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable onPress={() => setAnchor(null)} style={StyleSheet.absoluteFill} />
          {anchor ? (
            <View
              style={{
                position: 'absolute',
                top: anchor.y + anchor.height + 8,
                left: Math.max(16, Math.min(anchor.x + anchor.width / 2 - panelWidth / 2, winW - panelWidth - 16)),
                width: panelWidth,
                padding: 9,
                borderRadius: 24,
                backgroundColor: theme.dark ? theme.surfaceStrong : '#FFFFFF',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.hairline,
                boxShadow: theme.dark ? '0px 14px 34px rgba(0,0,0,0.48)' : '0px 14px 34px rgba(0,0,0,0.16)',
              }}
            >
              {METRICS.map((option) => {
                const selected = option.id === metric;
                return (
                  <Press
                    key={option.id}
                    onPress={() => {
                      setAnchor(null);
                      setMetric(option.id);
                    }}
                    style={{ height: 52, paddingHorizontal: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: selected ? fieldBg(theme) : 'transparent' }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: selected ? '700' : '500', color: theme.text }}>{option.label}</Text>
                    {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.text2} size={17} strokeWidth={2.4} /></View> : null}
                  </Press>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function StatTile({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, minHeight: 110, borderRadius: 24, backgroundColor: fieldBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: fieldBorder(theme), paddingHorizontal: 16, paddingVertical: 17, justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 15, color: theme.text2, letterSpacing: -0.1 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Text numberOfLines={1} style={{ fontSize: 30, lineHeight: 36, fontWeight: '800', color: theme.text, letterSpacing: -1 }}>{value}</Text>
        {unit ? <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function Fact({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 14, paddingRight: 18 }}>
      <Text style={{ fontSize: 15.5, color: theme.text2 }}>{label}</Text>
      <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 13, fontWeight: '700', color: theme.text }}>{value}</Text>
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
  const posterRef = useRef<any>(null);
  const exportingRef = useRef(false);

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
  const restCatIds = agg.slice(5).map((row) => row.id);
  const focusedItems = !sel
    ? setItems
    : sel === '__rest'
      ? setItems.filter((item) => restCatIds.includes(item.cat))
      : setItems.filter((item) => item.cat === sel);
  const focusedPack = packStats(focusedItems);
  const focusedWeight = focusedItems.reduce((sum, item) => sum + itemWeight(item), 0);
  const focusedValue = focusedItems.reduce((sum, item) => sum + itemPrice(item), 0);
  const focusedCatCount = new Set(focusedItems.map((item) => item.cat)).size;
  const weightMain = splitWeight(focusedWeight, weightUnit);
  const exportData: GearSetExportData = {
    name: set.name,
    groups: groups.map((group) => ({ cat: group.cat, items: group.its })),
    weightUnit,
    copy: {
      totalWeight: t('gear.stat.totalWeight'),
      totalValue: t('gear.stat.totalValue'),
      itemCount: t('gear.stat.itemCount'),
      categories: t('gear.stat.cats'),
      base: t('gear.pack.base'),
      pack: t('gear.pack.pack'),
      worn: t('gear.pack.worn'),
      consumable: t('gear.pack.consumable'),
      generatedBy: t('gear.setDetail.generatedBy'),
    },
  };

  const safeFilename = (extension: string) => `${set.name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'kaipa-gear-set'}.${extension}`;
  const downloadWeb = (uri: string, filename: string) => {
    const link = document.createElement('a');
    link.href = uri;
    link.download = filename;
    link.click();
  };
  const shareFile = async (uri: string, mimeType: string, filename: string) => {
    if (Platform.OS === 'web') {
      downloadWeb(uri, filename);
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType, dialogTitle: set.name });
    } else {
      await Share.share({ title: set.name, url: uri });
    }
  };
  const runExport = async (action: () => Promise<void>) => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    try {
      await action();
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.warn('[GearSetExport] export failed:', error);
        nav.showToast(t('gear.setDetail.exportFailed'));
      }
    } finally {
      exportingRef.current = false;
    }
  };
  const exportImage = () => runExport(async () => {
    const uri = await captureRef(posterRef, { format: 'png', quality: 1 });
    await shareFile(uri, 'image/png', safeFilename('png'));
  });
  const exportText = () => runExport(async () => {
    const content = buildGearSetText(exportData);
    if (Platform.OS === 'web') {
      const uri = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
      downloadWeb(uri, safeFilename('txt'));
      URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(Paths.cache, safeFilename('txt'));
    file.create({ overwrite: true });
    file.write(content);
    await shareFile(file.uri, 'text/plain', file.name);
  });
  const exportPdf = () => runExport(async () => {
    const html = buildGearSetHtml(exportData);
    if (Platform.OS === 'web') {
      const popup = window.open('', '_blank');
      if (!popup) throw new Error('Unable to open print window');
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      return;
    }
    const result = await Print.printToFileAsync({ html });
    await shareFile(result.uri, 'application/pdf', safeFilename('pdf'));
  });
  const systemShare = () => runExport(async () => {
    await Share.share({ title: set.name, message: buildGearSetText(exportData) });
  });

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
  const openExportMenu = () =>
    nav.openActionSheet({
      title: t('gear.setDetail.exportTitle'),
      message: t('gear.setDetail.exportMessage'),
      items: [
        { label: t('gear.setDetail.exportImage'), icon: 'photo', onPress: exportImage },
        { label: t('gear.setDetail.exportText'), icon: 'list', onPress: exportText },
        { label: t('gear.setDetail.exportPdf'), icon: 'download', onPress: exportPdf },
        { label: t('gear.setDetail.systemShare'), icon: 'share', onPress: systemShare },
      ],
    });

  return (
    <GearPushPage
      theme={theme}
      onBack={onBack}
      right={(
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <CircleBtn theme={theme} name="share" onPress={openExportMenu} softShadow size={44} />
          <CircleBtn theme={theme} name="more" onPress={openMenu} softShadow size={44} />
        </View>
      )}
      overlay={(
        <View pointerEvents="none" style={{ position: 'absolute', left: -500, top: 0 }}>
          <GearSetPoster ref={posterRef} data={exportData} />
        </View>
      )}
    >
      <View style={{ paddingHorizontal: 32, paddingTop: 8 }}>
        <View style={{ paddingTop: 10, paddingBottom: 18 }}>
          <Text style={{ fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8, color: theme.text }} numberOfLines={3}>{set.name}</Text>
        </View>

        {totN === 0 ? (
          <View style={{ marginTop: 22, paddingVertical: 34, paddingHorizontal: 24, borderRadius: 24, backgroundColor: fieldBg(theme), borderWidth: StyleSheet.hairlineWidth, borderColor: fieldBorder(theme), alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceTop }}>
              <Icon name="bag" color={theme.text2} size={23} />
            </View>
            <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: theme.text }}>{t('gear.setDetail.emptyTitle')}</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: theme.text3, textAlign: 'center', marginTop: 6 }}>{t('gear.setDetail.emptyBody')}</Text>
            <Press onPress={onEdit} style={{ marginTop: 20, paddingHorizontal: 18, height: 40, borderRadius: 20, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' }}>{t('gear.setDetail.addGear')}</Text>
            </Press>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', marginTop: 2, zIndex: 2 }}>
              <MetricMenu theme={theme} metric={metric} setMetric={(next) => { setMetric(next); setSel(null); }} />
            </View>
            <View style={{ alignItems: 'center', marginHorizontal: -4, marginTop: 14 }}>
              <LabeledDonut theme={theme} agg={agg} total={total} metric={metric} items={setItems} width={Math.min(420, winW - 56)} sel={sel} onSel={setSel} weightUnit={weightUnit} showStats={false} />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 26 }}>
              <StatTile theme={theme} label={t(sel ? 'gear.stat.weight' : 'gear.stat.totalWeight')} value={weightMain.value} unit={weightMain.unit} />
              <StatTile theme={theme} label={t(sel ? 'gear.stat.value' : 'gear.stat.totalValue')} value={compactYuan(focusedValue)} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 28 }}>
              <Fact theme={theme} label={t('gear.stat.itemCount')} value={`${focusedPack.count} ${t('gear.unit.items')}`} />
              <Fact theme={theme} label={t('gear.stat.cats')} value={`${focusedCatCount} ${t('gear.unit.cats')}`} />
              <Fact theme={theme} label={t('gear.pack.base')} value={fmtWeight(focusedPack.base, weightUnit, true)} />
              <Fact theme={theme} label={t('gear.pack.pack')} value={fmtWeight(focusedPack.pack, weightUnit, true)} />
              <Fact theme={theme} label={t('gear.pack.worn')} value={fmtWeight(focusedPack.worn, weightUnit, true)} />
              <Fact theme={theme} label={t('gear.pack.consumable')} value={fmtWeight(focusedPack.consumable, weightUnit, true)} />
            </View>

            {groups.map((g, gi) => (
              <View key={g.cat.id} style={{ marginTop: gi === 0 ? 30 : 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: theme.text2 }}>{g.cat.name}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{g.its.length} · {fmtWeight(g.w, weightUnit, true)}</Text>
                </View>
                {g.its.map((it, i) => (
                  <GearItemRow key={it.name} theme={theme} item={it} last={i === g.its.length - 1} onPress={() => onOpenItem(it)} weightUnit={weightUnit} flush />
                ))}
              </View>
            ))}
          </>
        )}
      </View>
    </GearPushPage>
  );
}
