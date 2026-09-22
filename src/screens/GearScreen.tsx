// GearScreen.tsx — 装备详情、装备列表和清单列表的本地导航容器。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowUp, ChevronRight, Compass, JapaneseYen, Package, Tag, Weight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Press } from '../components/Press';
import { Icon } from '../components/Icon';
import { useNav } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { GearCat, GearItem, GearSet, GearSetOverride, itemWeight, itemPrice, WeightUnit, fmtWeight, splitWeight } from '../data/gear';
import { useData } from '../data/DataContext';
import { GearItemDetail } from '../components/gear/GearItemDetail';
import { GearSetDetail } from '../components/gear/GearSetDetail';
import { GearSetEditor } from '../components/gear/GearSetEditor';
import { GearItemEditor } from '../components/gear/GearItemEditor';
import { GearCatEditor } from '../components/gear/GearCatEditor';
import { AddGearChoose } from '../components/gear/AddGearChoose';
import { GearSetsList } from '../components/gear/GearSetsList';
import { GearItemsList } from '../components/gear/GearItemsList';
import { GearEmptyState } from '../components/gear/GearEmptyState';
import { usePinnedSets } from '../components/gear/usePinnedSets';
import { AppIconButton, DetailPage, layout, motion, radius, space, type } from '../design-system';

type GearPage =
  | { type: 'item'; item: GearItem }
  | { type: 'set'; set: GearSet }
  | { type: 'setsList'; entry?: 'pull' }
  | { type: 'itemsList'; entry?: 'pull' }
  | { type: 'squareItems' }
  | { type: 'squareSets' };

// ── Derived theme tokens (mirror gxThemeFromKaipa) ──────────────────────────
const fieldBg = (t: Theme) => t.fieldSurface;
const homePageBg = (t: Theme) => t.groupedBg;
const homeCardBg = (t: Theme) => t.featureSurface;

function GearSquarePage({ theme, kind, items, sets, onBack, onOpenItems, onOpenSets }: { theme: Theme; kind: 'items' | 'sets'; items: GearItem[]; sets: GearSet[]; onBack: () => void; onOpenItems: () => void; onOpenSets: () => void }) {
  const isItems = kind === 'items';
  const previewItems = items.length ? items : [
    { name: 'HMG 2400 Southwest', cat: 'pack', w: 0.78, p: 2980, attrs: [['容量', '40 L']] },
    { name: 'Nemo Disco 15 羽绒睡袋', cat: 'sleep', w: 0.96, p: 2200, attrs: [['温标', '-9°C']] },
    { name: 'MSR PocketRocket 2 炉头', cat: 'cook', w: 0.073, p: 360 },
    { name: 'Garmin inReach Mini 2', cat: 'elec', w: 0.1, p: 3280 },
    { name: 'Big Agnes Copper Spur HV UL2', cat: 'shelter', w: 1.32, p: 3380 },
    { name: 'Arc’teryx Beta AR 冲锋衣', cat: 'cloth', w: 0.44, p: 4200 },
  ] as GearItem[];
  const previewSets = sets.length ? sets : [
    { id: 'preview-high', name: '高海拔三天两夜', items: ['HMG 2400 Southwest', 'Nemo Disco 15 羽绒睡袋', 'Big Agnes Copper Spur HV UL2', 'Garmin inReach Mini 2'] },
    { id: 'preview-light', name: '周末轻量徒步', items: ['HMG 2400 Southwest', 'MSR PocketRocket 2 炉头', 'Arc’teryx Beta AR 冲锋衣'] },
    { id: 'preview-camp', name: '摄影露营基础清单', items: ['Big Agnes Copper Spur HV UL2', 'Nemo Disco 15 羽绒睡袋', 'MSR PocketRocket 2 炉头'] },
  ] as GearSet[];
  const entries = isItems
    ? previewItems.slice(0, 6).map((item, index) => ({ title: item.name, meta: `${index % 2 ? '睡眠系统' : '背负系统'}  ·  ${fmtWeight(itemWeight(item), 'kg')}`, photo: item.photos?.[0] }))
    : previewSets.slice(0, 6).map((set) => ({ title: set.name, meta: fmtWeight(set.items.reduce((sum, name) => sum + itemWeight(previewItems.find((item) => item.name === name) || { w: 0, qty: 1 } as GearItem), 0), 'kg'), photo: set.items.map((name) => previewItems.find((item) => item.name === name)?.photos?.[0]).find(Boolean) }));
  const fallback = entries.length ? entries[0] : { title: isItems ? '轻量化背包系统' : '周末轻徒步', meta: isItems ? '背负系统  ·  0.78 kg' : '4.2 kg', photo: undefined };
  const rest = entries.slice(1);

  return (
    <DetailPage theme={theme} title={isItems ? '装备广场' : '广场清单'} onBack={onBack} right={<AppIconButton theme={theme} name="search" onPress={() => {}} noShadow accessibilityLabel="搜索" />} backgroundColor={theme.groupedBg}>
      <View style={{ paddingHorizontal: layout.pagePadding, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, height: 42, marginBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}>
          <Press onPress={onOpenItems} style={{ height: 42, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 15, fontWeight: isItems ? '800' : '600', color: isItems ? theme.text : theme.text3 }}>装备</Text>{isItems ? <View style={{ position: 'absolute', left: 4, right: 4, bottom: -1, height: 3, borderRadius: 2, backgroundColor: theme.accent }} /> : null}</Press>
          <Press onPress={onOpenSets} style={{ height: 42, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 15, fontWeight: !isItems ? '800' : '600', color: !isItems ? theme.text : theme.text3 }}>清单</Text>{!isItems ? <View style={{ position: 'absolute', left: 4, right: 4, bottom: -1, height: 3, borderRadius: 2, backgroundColor: theme.accent }} /> : null}</Press>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.lg }}>
          {['推荐', '最新', isItems ? '轻量化' : '高海拔', '露营'].map((label, index) => <View key={label} style={{ paddingHorizontal: 13, height: 32, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: index === 0 ? theme.text : theme.fieldSurface }}><Text style={{ fontSize: 12.5, fontWeight: '700', color: index === 0 ? theme.bg : theme.text2 }}>{label}</Text></View>)}
        </View>
        <Press style={{ height: 178, borderRadius: radius.feature, overflow: 'hidden', backgroundColor: theme.featureSurface }} onPress={() => {}}>
          {fallback.photo ? <Image source={{ uri: fallback.photo }} contentFit="cover" style={[StyleSheet.absoluteFill, { opacity: theme.dark ? 0.58 : 0.82 }]} /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 28 }]}><Compass color={theme.dark ? '#FFFFFF' : theme.text} size={86} strokeWidth={0.8} opacity={0.16} /></View>}
          <View style={{ flex: 1, justifyContent: 'space-between', padding: 20, backgroundColor: theme.dark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.18)' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.dark ? '#FFFFFF' : theme.text, opacity: 0.72 }}>本周精选</Text>
            <View><Text numberOfLines={2} style={{ maxWidth: '72%', fontSize: 22, lineHeight: 27, fontWeight: '800', color: theme.dark ? '#FFFFFF' : theme.text }}>{fallback.title}</Text><Text style={{ marginTop: 6, fontFamily: MONO, fontSize: 12.5, color: theme.dark ? '#FFFFFF' : theme.text, opacity: 0.8 }}>{fallback.meta}</Text></View>
          </View>
        </Press>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }}><Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>正在被收藏</Text><Text style={{ fontSize: 12.5, color: theme.text3 }}>公开内容</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {rest.map((card) => <Press key={card.title} onPress={() => {}} style={{ width: '48%', minHeight: isItems ? 246 : 204, borderRadius: 24, padding: 14, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
            {isItems ? <View style={{ height: 116, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)' }}>{card.photo ? <Image source={{ uri: card.photo }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Compass color={theme.accent} size={28} strokeWidth={1.5} opacity={0.6} />}</View> : null}
            <View style={{ marginTop: isItems ? 13 : 0, flex: 1 }}>
              <Text numberOfLines={3} style={{ fontSize: isItems ? 15 : 18, lineHeight: isItems ? 20 : 24, fontWeight: '800', color: theme.text }}>{card.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto' }}>
                <Weight color={theme.text2} size={13} strokeWidth={1.7} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>{card.meta}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 5 }}><Icon name="heart" color={theme.text2} size={13} /><Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>128</Text></View>
              </View>
            </View>
          </Press>)}
        </View>
      </View>
    </DetailPage>
  );
}

// ── Metric-agnostic value + formatting (qty-free, matching the prototype) ───
const compactWan = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= 100000) return String(rounded);
  const wan = rounded / 10000;
  return `${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};
const yuan = (v: number) => '¥' + compactWan(v);

const normItem = (it: GearItem) => ({
  name: it.name,
  cat: it.cat,
  w: Number(it.w) || 0,
  p: Number(it.p) || 0,
  qty: it.qty || 1,
  status: it.status || 'packed',
  photos: it.photos ?? [],
  attrs: it.attrs ?? [],
  note: it.note ?? '',
});

const sameStringPairs = (a: [string, string][], b: [string, string][]) =>
  a.length === b.length && a.every(([ak, av], i) => ak === b[i]?.[0] && av === b[i]?.[1]);

const sameGearItem = (a: GearItem, b: GearItem) => {
  const na = normItem(a);
  const nb = normItem(b);
  return (
    na.name === nb.name &&
    na.cat === nb.cat &&
    na.w === nb.w &&
    na.p === nb.p &&
    na.qty === nb.qty &&
    na.status === nb.status &&
    na.note === nb.note &&
    na.photos.length === nb.photos.length &&
    na.photos.every((p, i) => p === nb.photos[i]) &&
    sameStringPairs(na.attrs, nb.attrs)
  );
};

export function GearScreen({ theme, initialItem, onExit }: { theme: Theme; initialItem?: GearItem; onExit?: () => void }) {
  const nav = useNav();
  const { t } = useI18n();
  const data = useData();
  const weightUnit: WeightUnit = data.profile.gearWeightUnit || 'kg';

  const cats = data.cats;
  const allItems = data.items;
  const sets = data.sets;
  const { pinnedIds: pinnedSetIds, setPinned: setSetsPinned } = usePinnedSets();

  // Pushed detail and list pages, newest last.
  const [pageStack, setPageStack] = useState<GearPage[]>(() => initialItem ? [{ type: 'item', item: initialItem }] : []);
  const pushPage = (p: GearPage) => setPageStack((s) => [...s, p]);
  // Render a requested collection immediately; the effect below then commits it
  // to the local stack and clears the cross-feature request.
  const visiblePageStack = pageStack.length > 0
    ? pageStack
    : nav.gearPageRequest
      ? [{ type: nav.gearPageRequest === 'sets' ? 'setsList' : 'itemsList' } as GearPage]
      : [];
  const popPage = () => {
    const stackLength = pageStack.length || (nav.gearPageRequest ? 1 : 0);
    if (stackLength === 1) {
      setPageStack([]);
      if (nav.gearPageRequest) nav.clearGearPageRequest();
      if (onExit) onExit();
      else nav.setMainTab('me');
      return;
    }
    setPageStack((s) => s.slice(0, -1));
  };
  // 新建 / 编辑清单 bottom sheet.
  const [setEditor, setSetEditor] = useState<{ mode: 'new' | 'edit'; set?: GearSet } | null>(null);
  // 新建 / 编辑装备 full-screen form (holds the item being edited / a blank draft).
  const [itemEditor, setItemEditor] = useState<{
    mode: 'new' | 'edit';
    item: GearItem;
    recognitionSource?: { label: string; url?: string };
  } | null>(null);
  // 新建 / 编辑分类 bottom sheet.
  const [catEditor, setCatEditor] = useState<{ mode: 'new' | 'edit'; cat?: GearCat } | null>(null);
  // 添加装备入口选择（链接 / 拍照 / 手动）
  const [addChoose, setAddChoose] = useState(false);
  const pendingSetItemAdded = useRef<((item: GearItem) => void) | null>(null);
  // Standalone gear pages own tab-bar visibility. Embedded full-screen entries
  // sit above an already-open journey detail and must not mutate its navigation chrome.
  const fullScreenPageOpen = visiblePageStack.length > 0 || setEditor != null || itemEditor != null || catEditor != null || addChoose;
  const setTabBarHidden = nav.setTabBarHidden;
  useEffect(() => {
    if (!onExit) setTabBarHidden('gear', fullScreenPageOpen);
  }, [fullScreenPageOpen, onExit, setTabBarHidden]);
  useEffect(() => {
    if (onExit) return;
    return () => setTabBarHidden('gear', false);
  }, [onExit, setTabBarHidden]);

  useEffect(() => {
    if (nav.gearItemRequestId == null) return;
    const item = allItems.find((candidate) => candidate.id === nav.gearItemRequestId);
    if (!item) {
      if (!data.gearLoading) nav.clearGearItemRequest();
      return;
    }
    setPageStack([{ type: 'item', item }]);
    nav.clearGearItemRequest();
  }, [allItems, data.gearLoading, nav.gearItemRequestId]);

  useEffect(() => {
    if (!nav.gearPageRequest) return;
    setPageStack([{ type: nav.gearPageRequest === 'sets' ? 'setsList' : 'itemsList' }]);
    nav.clearGearPageRequest();
  }, [nav.gearPageRequest]);

  const updateItem = async (oldName: string, ni: GearItem) => {
    const oldItem = allItems.find(it => it.name === oldName);
    if (oldItem && sameGearItem(oldItem, ni)) {
      setItemEditor(null);
      return;
    }
    try {
      const saved = oldItem?.id ? await data.updateItem(oldItem.id, ni) : undefined;
      const nextItem = saved ?? ni;
      setPageStack((stk) =>
        stk.map((pg) => {
          if (pg.type === 'item' && pg.item.name === oldName) return { type: 'item', item: nextItem };
          if (pg.type === 'set' && nextItem.name !== oldName) return { type: 'set', set: { ...pg.set, items: pg.set.items.map((n) => (n === oldName ? nextItem.name : n)) } };
          return pg;
        })
      );
      setItemEditor(null);
      nav.showToast(t('gear.toast.itemUpdated'), 'top');
    } catch (error) {
      console.warn('[Gear] item update failed:', error);
      nav.showToast(t('gear.toast.saveFailed'), 'top');
    }
  };

  const addItem = async (ni: GearItem) => {
    try {
      const saved = await data.addItem(ni);
      if (!saved) return;
      pendingSetItemAdded.current?.(saved);
      pendingSetItemAdded.current = null;
      setItemEditor(null);
      nav.showToast(t('gear.toast.itemAdded'));
    } catch (error) {
      console.warn('[Gear] item add failed:', error);
      nav.showToast(t('gear.toast.saveFailed'));
    }
  };

  const deleteItem = (name: string) => {
    const item = allItems.find(i => i.name === name);
    if (item?.id) data.deleteItem(item.id);
    popPage();
    nav.showToast(t('gear.toast.itemDeleted'));
  };
  const deleteSet = (id: string) => {
    data.deleteSet(id);
    popPage();
    nav.showToast(t('gear.toast.setDeleted'));
  };
  const duplicateSet = async (set: GearSet) => {
    const baseName = t('gear.setDetail.copyName', { name: set.name });
    const existingNames = new Set(sets.map((existing) => existing.name));
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name)) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    const itemIds = set.items.map((itemName) => allItems.find((item) => item.name === itemName)?.id).filter(Boolean) as number[];
    await data.addSet(name, itemIds, { ...set.overrides }, set.description);
    nav.showToast(t('gear.toast.setCopied'), 'top');
  };
  const saveSet = (name: string, description: string | undefined, itemNames: string[], overrides: Record<string, GearSetOverride>) => {
    const itemIds = itemNames.map(n => allItems.find(i => i.name === n)?.id).filter(Boolean) as number[];
    if (setEditor?.mode === 'edit' && setEditor.set) {
      const id = setEditor.set.id;
      data.updateSet(id, name, itemIds, overrides, description);
      setPageStack((stk) => stk.map((p) => (p.type === 'set' && p.set.id === id ? { type: 'set', set: { ...p.set, name, description, items: itemNames, overrides } } : p)));
      nav.showToast(t('gear.toast.setUpdated'));
    } else {
      data.addSet(name, itemIds, overrides, description);
      nav.showToast(t('gear.toast.setCreated'));
    }
    setSetEditor(null);
  };
  const saveCat = (name: string, color: string) => {
    if (catEditor?.mode === 'edit' && catEditor.cat) {
      const id = catEditor.cat.id;
      data.updateCat(id, { name, color });
      nav.showToast(t('gear.toast.catUpdated'));
    } else {
      data.addCat({ name, color });
      nav.showToast(t('gear.toast.catCreated'));
    }
    setCatEditor(null);
  };

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])) as Record<string, GearCat>, [cats]);
  const onAddResult = (item: GearItem, recognitionSource?: { label: string; url?: string }) => {
    setAddChoose(false);
    setItemEditor({ mode: 'new', item, recognitionSource });
  };
  const addGearFromSetEditor = (onAdded: (item: GearItem) => void) => {
    pendingSetItemAdded.current = onAdded;
    setAddChoose(true);
  };
  const cancelAddChoose = () => {
    pendingSetItemAdded.current = null;
    setAddChoose(false);
  };
  const cancelItemEditor = () => {
    if (itemEditor?.mode === 'new') pendingSetItemAdded.current = null;
    setItemEditor(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: homePageBg(theme) }}>
      {/* ── Pushed detail and list pages ── */}
      {visiblePageStack.map((pg, i) => (
        <View key={i + '-' + pg.type} style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}>
          {pg.type === 'item' ? (
            <GearItemDetail
              theme={theme}
              item={pg.item}
              cats={cats}
              weightUnit={weightUnit}
              allItems={allItems}
              sets={sets}
              onBack={popPage}
              onOpenSet={(s) => pushPage({ type: 'set', set: s })}
              onSave={(next) => updateItem(pg.item.name, next)}
              onDelete={() => deleteItem(pg.item.name)}
            />
          ) : pg.type === 'set' ? (
            <GearSetDetail
              theme={theme}
              set={pg.set}
              allItems={allItems}
              catMap={catMap}
              weightUnit={weightUnit}
              onBack={popPage}
              onOpenItem={(it) => pushPage({ type: 'item', item: it })}
              onDelete={() => deleteSet(pg.set.id)}
              onEdit={() => setSetEditor({ mode: 'edit', set: pg.set })}
              onDuplicate={() => duplicateSet(pg.set)}
            />
          ) : pg.type === 'squareItems' ? (
            <GearSquarePage theme={theme} kind="items" items={allItems} sets={sets} onBack={popPage} onOpenItems={() => {}} onOpenSets={() => pushPage({ type: 'squareSets' })} />
          ) : pg.type === 'squareSets' ? (
            <GearSquarePage theme={theme} kind="sets" items={allItems} sets={sets} onBack={popPage} onOpenItems={() => pushPage({ type: 'squareItems' })} onOpenSets={() => {}} />
          ) : pg.type === 'setsList' ? (
            <GearSetsList
              theme={theme}
              sets={sets}
              allItems={allItems}
              weightUnit={weightUnit}
              onBack={popPage}
              entryVariant={pg.entry === 'pull' ? 'continuationX' : 'push'}
              onOpenSet={(set) => pushPage({ type: 'set', set })}
              onAdd={() => setSetEditor({ mode: 'new' })}
              onOpenAssistant={() => nav.openAssistant('我还没有装备清单，请先询问我出行场景、天数、季节和携带偏好，再帮我创建一份合适的装备清单。', undefined, true, undefined, true)}
              pinnedSetIds={pinnedSetIds}
              onSetPinned={setSetsPinned}
              onOpenSquare={() => pushPage({ type: 'squareSets' })}
              onDeleteSets={(ids) => {
                ids.forEach((id) => data.deleteSet(id));
                nav.showToast(t('gear.toast.setsDeleted', { count: ids.length }));
              }}
            />
          ) : (
            <GearItemsList
              theme={theme}
              items={allItems}
              catMap={catMap}
              weightUnit={weightUnit}
              onBack={popPage}
              entryVariant={pg.entry === 'pull' ? 'continuationY' : 'push'}
              onOpenItem={(item) => pushPage({ type: 'item', item })}
              onAdd={() => setAddChoose(true)}
              onOpenAssistant={() => nav.openAssistant('我还没有装备，请先询问我常见的出行场景、预算和偏好，再帮我创建适合我的装备。', undefined, true, undefined, true)}
              onAddCategory={() => setCatEditor({ mode: 'new' })}
              onEditCategory={(cat) => setCatEditor({ mode: 'edit', cat })}
              onDeleteCategory={(cat) => {
                data.deleteCat(cat.id);
                nav.showToast(t('gear.toast.catDeleted'));
              }}
              onDeleteItems={(ids) => {
                ids.forEach((id) => data.deleteItem(id));
                nav.showToast(t('gear.toast.itemsDeleted', { count: ids.length }));
              }}
              onOpenSquare={() => pushPage({ type: 'squareItems' })}
            />
          )}
        </View>
      ))}

      {/* ── 新建 / 编辑清单 ── */}
      {setEditor && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
          <GearSetEditor
            theme={theme}
            weightUnit={weightUnit}
            mode={setEditor.mode}
            initial={setEditor.set}
            allItems={allItems}
            catMap={catMap}
            onCancel={() => setSetEditor(null)}
            onSave={saveSet}
            onAddGear={addGearFromSetEditor}
          />
        </View>
      )}

      {/* ── 添加装备入口选择 ── */}
      {addChoose && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 205 }]}>
          <AddGearChoose theme={theme} cats={cats} onResult={onAddResult} onCancel={cancelAddChoose} />
        </View>
      )}

      {/* ── 编辑装备 ── */}
      {itemEditor && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 210 }]}>
          <GearItemEditor
            theme={theme}
            item={itemEditor.item}
            cats={cats}
            mode={itemEditor.mode}
            recognitionSource={itemEditor.recognitionSource}
            existingNames={allItems.map((i) => i.name)}
            onCancel={cancelItemEditor}
            onSave={(ni) => (itemEditor.mode === 'new' ? addItem(ni) : updateItem(itemEditor.item.name, ni))}
          />
        </View>
      )}

      {/* ── 新建 / 编辑分类 ── */}
      {catEditor && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
          <GearCatEditor
            theme={theme}
            mode={catEditor.mode}
            initial={catEditor.cat}
            existing={cats.map((c) => c.name)}
            onCancel={() => setCatEditor(null)}
            onSave={saveCat}
          />
        </View>
      )}
    </View>
  );
}

const HOME_PREVIEW_LIMIT = 5;
// Mirrors the mature SwipeRefreshLayout gesture model: ignore a small touch
// slop, consume drag at half speed, and delay visible ring progress until 40%.
const EDGE_TOUCH_SLOP = 12;
const EDGE_DRAG_RATE = 0.5;
const EDGE_PULL_THRESHOLD = 96;
const EDGE_PULL_MAX = 136;
const EDGE_PROGRESS_START = EDGE_PULL_THRESHOLD * 0.4;
const EDGE_PROGRESS_SIZE = 48;
const EDGE_PROGRESS_RADIUS = 18;
const EDGE_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * EDGE_PROGRESS_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function edgePullHaptic() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

function GearHomeView({ theme, sets, items, catMap, weightUnit, onOpenSets, onOpenItems, onPullOpenSets, onPullOpenItems, onOpenSet, onOpenItem, onAddSet, onAddItem }: { theme: Theme; sets: GearSet[]; items: GearItem[]; catMap: Record<string, GearCat>; weightUnit: WeightUnit; onOpenSets: () => void; onOpenItems: () => void; onPullOpenSets: () => void; onPullOpenItems: () => void; onOpenSet: (set: GearSet) => void; onOpenItem: (item: GearItem) => void; onAddSet: () => void; onAddItem: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const previewItems = items.slice().sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, HOME_PREVIEW_LIMIT);
  const previewSets = sets.slice(0, HOME_PREVIEW_LIMIT);
  const hasMoreItems = items.length > HOME_PREVIEW_LIMIT;
  const hasMoreSets = sets.length > HOME_PREVIEW_LIMIT;

  const setScrollRef = useRef<any>(null);
  const itemScrollRef = useRef<any>(null);
  const setAtEnd = useRef(false);
  const itemAtEnd = useRef(false);
  const setPullStartedAtEnd = useRef(false);
  const itemPullStartedAtEnd = useRef(false);
  const setPullDistance = useRef(0);
  const itemPullDistance = useRef(0);
  const setDidHaptic = useRef(false);
  const itemDidHaptic = useRef(false);
  const setPull = useRef(new Animated.Value(0)).current;
  const itemPull = useRef(new Animated.Value(0)).current;
  const onPullOpenSetsRef = useRef(onPullOpenSets);
  const onPullOpenItemsRef = useRef(onPullOpenItems);
  onPullOpenSetsRef.current = onPullOpenSets;
  onPullOpenItemsRef.current = onPullOpenItems;

  const setGestureCallbacks = useRef({
    begin: () => {},
    update: (_translationX: number) => {},
    finalize: () => {},
  });
  setGestureCallbacks.current.begin = () => {
    setPullStartedAtEnd.current = hasMoreSets && setAtEnd.current;
    setPullDistance.current = 0;
    setDidHaptic.current = false;
  };
  setGestureCallbacks.current.update = (translationX) => {
    if (!setPullStartedAtEnd.current || translationX >= 0) return;
    const distance = Math.min(EDGE_PULL_MAX, Math.max(0, -translationX - EDGE_TOUCH_SLOP) * EDGE_DRAG_RATE);
    setPullDistance.current = distance;
    setPull.setValue(distance);
    if (distance >= EDGE_PULL_THRESHOLD && !setDidHaptic.current) {
      setDidHaptic.current = true;
      edgePullHaptic();
    }
  };
  setGestureCallbacks.current.finalize = () => {
    const shouldOpen = setPullStartedAtEnd.current && setPullDistance.current >= EDGE_PULL_THRESHOLD;
    setPullStartedAtEnd.current = false;
    setPullDistance.current = 0;
    if (shouldOpen) {
      Animated.timing(setPull, {
        toValue: EDGE_PULL_MAX,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        onPullOpenSetsRef.current();
        Animated.timing(setPull, { toValue: 0, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      });
      return;
    }
    Animated.spring(setPull, { toValue: 0, useNativeDriver: false, ...motion.pageSpring }).start();
  };

  const itemGestureCallbacks = useRef({
    begin: () => {},
    update: (_translationY: number) => {},
    finalize: () => {},
  });
  itemGestureCallbacks.current.begin = () => {
    itemPullStartedAtEnd.current = hasMoreItems && itemAtEnd.current;
    itemPullDistance.current = 0;
    itemDidHaptic.current = false;
  };
  itemGestureCallbacks.current.update = (translationY) => {
    if (!itemPullStartedAtEnd.current || translationY >= 0) return;
    const distance = Math.min(EDGE_PULL_MAX, Math.max(0, -translationY - EDGE_TOUCH_SLOP) * EDGE_DRAG_RATE);
    itemPullDistance.current = distance;
    itemPull.setValue(distance);
    if (distance >= EDGE_PULL_THRESHOLD && !itemDidHaptic.current) {
      itemDidHaptic.current = true;
      edgePullHaptic();
    }
  };
  itemGestureCallbacks.current.finalize = () => {
    const shouldOpen = itemPullStartedAtEnd.current && itemPullDistance.current >= EDGE_PULL_THRESHOLD;
    itemPullStartedAtEnd.current = false;
    itemPullDistance.current = 0;
    if (shouldOpen) {
      Animated.timing(itemPull, {
        toValue: EDGE_PULL_MAX,
        duration: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        onPullOpenItemsRef.current();
        Animated.timing(itemPull, { toValue: 0, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      });
      return;
    }
    Animated.spring(itemPull, { toValue: 0, useNativeDriver: false, ...motion.pageSpring }).start();
  };

  const setEdgeGesture = useMemo(
    () => Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .simultaneousWithExternalGesture(setScrollRef)
      .onBegin(() => setGestureCallbacks.current.begin())
      .onUpdate((event) => setGestureCallbacks.current.update(event.translationX))
      .onFinalize(() => setGestureCallbacks.current.finalize()),
    [],
  );
  const itemEdgeGesture = useMemo(
    () => Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-8, 8])
      .failOffsetX([-18, 18])
      .simultaneousWithExternalGesture(itemScrollRef)
      .onBegin(() => itemGestureCallbacks.current.begin())
      .onUpdate((event) => itemGestureCallbacks.current.update(event.translationY))
      .onFinalize(() => itemGestureCallbacks.current.finalize()),
    [],
  );

  const setRailStyle = {
    transform: [{ translateX: setPull.interpolate({ inputRange: [0, EDGE_PULL_MAX], outputRange: [0, -18], extrapolate: 'clamp' }) }],
  };
  const setIndicatorStyle = {
    opacity: setPull.interpolate({ inputRange: [0, 18, EDGE_PULL_THRESHOLD], outputRange: [0, 0.35, 1], extrapolate: 'clamp' }),
    transform: [
      { translateX: setPull.interpolate({ inputRange: [0, EDGE_PULL_MAX], outputRange: [20, 0], extrapolate: 'clamp' }) },
      { scale: setPull.interpolate({ inputRange: [0, EDGE_PULL_THRESHOLD], outputRange: [0.82, 1], extrapolate: 'clamp' }) },
    ],
  };
  const pageStyle = {
    transform: [{ translateY: itemPull.interpolate({ inputRange: [0, EDGE_PULL_MAX], outputRange: [0, -18], extrapolate: 'clamp' }) }],
  };
  const itemIndicatorStyle = {
    opacity: itemPull.interpolate({ inputRange: [0, 18, EDGE_PULL_THRESHOLD], outputRange: [0, 0.35, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: itemPull.interpolate({ inputRange: [0, EDGE_PULL_MAX], outputRange: [18, 0], extrapolate: 'clamp' }) },
      { scale: itemPull.interpolate({ inputRange: [0, EDGE_PULL_THRESHOLD], outputRange: [0.96, 1], extrapolate: 'clamp' }) },
    ],
  };

  return (
    <GestureDetector gesture={itemEdgeGesture}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {hasMoreItems ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.itemEdgeIndicator, { bottom: insets.bottom + 70 }, itemIndicatorStyle]}
          >
            <CircularEdgeProgress theme={theme} progress={itemPull}>
              <ArrowUp color={theme.accent} size={17} strokeWidth={2.3} />
            </CircularEdgeProgress>
          </Animated.View>
        ) : null}
        <Animated.View style={[{ flex: 1, backgroundColor: homePageBg(theme) }, pageStyle]}>
          <GestureScrollView
            ref={itemScrollRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              itemAtEnd.current = hasMoreItems && contentOffset.y + layoutMeasurement.height >= contentSize.height - 3;
            }}
            contentContainerStyle={{ paddingHorizontal: layout.pagePadding, paddingTop: insets.top + space.md, paddingBottom: 110 }}
          >
            <SectionHeader theme={theme} title={t('gear.home.mySets')} action={t('gear.home.viewAll')} onPress={onOpenSets} />
            {previewSets.length ? (
              <GestureDetector gesture={setEdgeGesture}>
                <View style={{ overflow: 'hidden' }}>
                  {hasMoreSets ? (
                    <Animated.View pointerEvents="none" style={[styles.setEdgeIndicator, setIndicatorStyle]}>
                      <CircularEdgeProgress theme={theme} progress={setPull}>
                        <ChevronRight color={theme.accent} size={18} strokeWidth={2.3} />
                      </CircularEdgeProgress>
                    </Animated.View>
                  ) : null}
                  <Animated.View style={setRailStyle}>
                    <GestureScrollView
                      ref={setScrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      snapToInterval={256}
                      decelerationRate="fast"
                      scrollEventThrottle={16}
                      onScroll={(event) => {
                        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                        setAtEnd.current = hasMoreSets && contentOffset.x + layoutMeasurement.width >= contentSize.width - 3;
                      }}
                      contentContainerStyle={{ gap: space.sm, paddingRight: space.xl }}
                    >
                      {previewSets.map((set) => {
                        const setItems = items.filter((item) => set.items.includes(item.name));
                        const setWeight = setItems.reduce((sum, item) => sum + itemWeight(item), 0);
                        const weightParts = splitWeight(setWeight, weightUnit, true);
                        return (
                          <Press key={set.id} onPress={() => onOpenSet(set)} style={{ width: 244, height: 142, borderRadius: radius.feature, paddingHorizontal: 18, paddingVertical: 17, backgroundColor: homeCardBg(theme), justifyContent: 'space-between' }}>
                            <Text numberOfLines={2} style={{ fontSize: 15.5, lineHeight: 21, fontWeight: '700', color: theme.text }}>{set.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                              <View accessible accessibilityLabel={`${t('gear.stat.totalWeight')} ${weightParts.value} ${weightParts.unit}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <Weight color={theme.text2} size={18} strokeWidth={1.8} />
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                                  <Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '800', color: theme.text }}>{weightParts.value}</Text>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}>{weightParts.unit}</Text>
                                </View>
                              </View>
                              <View accessible accessibilityLabel={`${t('gear.stat.itemCount')} ${set.items.length}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <Package color={theme.text2} size={18} strokeWidth={1.8} />
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                                  <Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '800', color: theme.text }}>{set.items.length}</Text>
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}>{t('gear.unit.items')}</Text>
                                </View>
                              </View>
                            </View>
                          </Press>
                        );
                      })}
                    </GestureScrollView>
                  </Animated.View>
                </View>
              </GestureDetector>
            ) : (
              <GearEmptyState
                theme={theme}
                compact
                icon="layers"
                title={t('gear.empty.noSetsYet')}
                actionLabel={t('gear.empty.createFirstSet')}
                onAction={onAddSet}
              />
            )}

            <SectionHeader theme={theme} title={t('gear.home.myGear')} action={t('gear.home.viewAll')} onPress={onOpenItems} />
            <View style={{ gap: 10 }}>
              {previewItems.length ? previewItems.map((item) => {
                const photo = item.photos?.[0];
                const category = catMap[item.cat];
                const categoryName = category?.name || t('gear.uncategorized');
                const weight = fmtWeight(itemWeight(item), weightUnit);
                const value = yuan(itemPrice(item));
                return (
                  <Press key={item.id || item.name} onPress={() => onOpenItem(item)} style={{ minHeight: 112, borderRadius: radius.feature, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: homeCardBg(theme) }}>
                    <View style={{ width: 84, height: 84, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: fieldBg(theme) }}>
                      <Package color={category?.color || theme.text3} size={25} strokeWidth={1.6} opacity={0.6} />
                      {photo ? <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
                      <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.text }}>{item.name}</Text>
                      <View accessible accessibilityLabel={`${categoryName}, ${weight}, ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
                        <View style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Tag color={category?.color || theme.text3} size={15} strokeWidth={1.8} />
                          <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontSize: 11.5, color: theme.text2 }}>{categoryName}</Text>
                        </View>
                        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Weight color={theme.text2} size={15} strokeWidth={1.8} />
                          <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{weight}</Text>
                        </View>
                        <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <JapaneseYen color={theme.text2} size={15} strokeWidth={1.8} />
                          <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{value}</Text>
                        </View>
                      </View>
                    </View>
                  </Press>
                );
              }) : (
                <GearEmptyState
                  theme={theme}
                  compact
                  icon="bag"
                  title={t('gear.empty.noItemsYet')}
                  actionLabel={t('gear.empty.addFirstItem')}
                  onAction={onAddItem}
                />
              )}
            </View>
          </GestureScrollView>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
const GearHome = React.memo(GearHomeView, (previous, next) => (
  previous.theme === next.theme
  && previous.sets === next.sets
  && previous.items === next.items
  && previous.catMap === next.catMap
  && previous.weightUnit === next.weightUnit
));
function CircularEdgeProgress({ theme, progress, children }: { theme: Theme; progress: Animated.Value; children: React.ReactNode }) {
  const dashOffset = progress.interpolate({
    inputRange: [0, EDGE_PROGRESS_START, EDGE_PULL_THRESHOLD],
    outputRange: [EDGE_PROGRESS_CIRCUMFERENCE, EDGE_PROGRESS_CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.edgeProgress, { backgroundColor: theme.controlSurface }]}>
      <Svg width={EDGE_PROGRESS_SIZE} height={EDGE_PROGRESS_SIZE} viewBox={`0 0 ${EDGE_PROGRESS_SIZE} ${EDGE_PROGRESS_SIZE}`}>
        <Circle
          cx={EDGE_PROGRESS_SIZE / 2}
          cy={EDGE_PROGRESS_SIZE / 2}
          r={EDGE_PROGRESS_RADIUS}
          fill="none"
          stroke={theme.progressTrack}
          strokeWidth={3}
        />
        <AnimatedCircle
          cx={EDGE_PROGRESS_SIZE / 2}
          cy={EDGE_PROGRESS_SIZE / 2}
          r={EDGE_PROGRESS_RADIUS}
          fill="none"
          stroke={theme.accent}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${EDGE_PROGRESS_CIRCUMFERENCE} ${EDGE_PROGRESS_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${EDGE_PROGRESS_SIZE / 2} ${EDGE_PROGRESS_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.edgeProgressIcon}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  setEdgeIndicator: {
    position: 'absolute',
    right: space.xxs,
    top: 0,
    bottom: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemEdgeIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
  },
  edgeProgress: {
    width: EDGE_PROGRESS_SIZE,
    height: EDGE_PROGRESS_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeProgressIcon: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function SectionHeader({ theme, title, action, onPress, first = false }: { theme: Theme; title: string; action?: string; onPress?: () => void; first?: boolean }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: first ? 0 : space.xxl, marginBottom: first ? 18 : space.sm }}><Text style={[first ? type.pageTitle : type.sectionTitle, { color: theme.text }]}>{title}</Text>{action && onPress ? <Press onPress={onPress} style={{ paddingVertical: 5 }}><Text style={[type.eyebrow, { color: theme.text2 }]}>{action} ›</Text></Press> : null}</View>; }
