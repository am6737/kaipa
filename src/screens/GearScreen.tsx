// GearScreen.tsx — 装备首页及新版装备、清单页面的本地导航容器。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowUp, ChevronRight, JapaneseYen, Package, Tag, Weight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector, ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Press } from '../components/Press';
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
import { GearOverviewDetail } from '../components/gear/GearOverviewDetail';
import { usePinnedSets } from '../components/gear/usePinnedSets';
import { layout, motion, radius, space, type } from '../design-system';

type GearPage =
  | { type: 'item'; item: GearItem }
  | { type: 'set'; set: GearSet }
  | { type: 'overview' }
  | { type: 'setsList'; entry?: 'pull' }
  | { type: 'itemsList'; entry?: 'pull' };

// ── Derived theme tokens (mirror gxThemeFromKaipa) ──────────────────────────
const fieldBg = (t: Theme) => t.fieldSurface;
const homePageBg = (t: Theme) => t.groupedBg;
const homeCardBg = (t: Theme) => t.featureSurface;

// ── Metric-agnostic value + formatting (qty-free, matching the prototype) ───
const compactWan = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= 100000) return String(rounded);
  const wan = rounded / 10000;
  return `${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};
const yuan = (v: number) => '¥' + compactWan(v);
const yuanWithGap = (v: number) => '¥ ' + compactWan(v);

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
  const orderedSets = useMemo(
    () => sets.slice().sort((a, b) => Number(pinnedSetIds.has(b.id)) - Number(pinnedSetIds.has(a.id))),
    [pinnedSetIds, sets],
  );

  // Pushed detail and list pages, newest last.
  const [pageStack, setPageStack] = useState<GearPage[]>(() => initialItem ? [{ type: 'item', item: initialItem }] : []);
  const pushPage = (p: GearPage) => setPageStack((s) => [...s, p]);
  const popPage = () => {
    if (pageStack.length === 1 && onExit) {
      setPageStack([]);
      onExit();
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
  // The standalone Gear tab owns tab-bar visibility. Embedded full-screen entries
  // sit above an already-open journey detail and must not mutate its navigation chrome.
  useEffect(() => {
    if (!onExit) nav.setTabBarHidden(pageStack.length > 0);
  }, [onExit, pageStack.length, nav]);
  useEffect(() => {
    if (onExit) return;
    return () => nav.setTabBarHidden(false);
  }, [nav, onExit]);

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
      {!initialItem ? (
        <GearHome
          theme={theme}
          sets={orderedSets}
          items={allItems}
          catMap={catMap}
          weightUnit={weightUnit}
          onOpenOverview={() => pushPage({ type: 'overview' })}
          onOpenSets={() => pushPage({ type: 'setsList' })}
          onOpenItems={() => pushPage({ type: 'itemsList' })}
          onPullOpenSets={() => pushPage({ type: 'setsList', entry: 'pull' })}
          onPullOpenItems={() => pushPage({ type: 'itemsList', entry: 'pull' })}
          onOpenSet={(set) => pushPage({ type: 'set', set })}
          onOpenItem={(item) => pushPage({ type: 'item', item })}
        />
      ) : null}

      {/* ── Pushed detail and list pages ── */}
      {pageStack.map((pg, i) => (
        <View key={i + '-' + pg.type} style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}>
          {pg.type === 'overview' ? (
            <GearOverviewDetail
              theme={theme}
              items={allItems}
              sets={sets}
              catMap={catMap}
              weightUnit={weightUnit}
              onBack={popPage}
              onOpenItem={(item) => pushPage({ type: 'item', item })}
            />
          ) : pg.type === 'item' ? (
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
              pinnedSetIds={pinnedSetIds}
              onSetPinned={setSetsPinned}
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

function GearHomeView({ theme, sets, items, catMap, weightUnit, onOpenOverview, onOpenSets, onOpenItems, onPullOpenSets, onPullOpenItems, onOpenSet, onOpenItem }: { theme: Theme; sets: GearSet[]; items: GearItem[]; catMap: Record<string, GearCat>; weightUnit: WeightUnit; onOpenOverview: () => void; onOpenSets: () => void; onOpenItems: () => void; onPullOpenSets: () => void; onPullOpenItems: () => void; onOpenSet: (set: GearSet) => void; onOpenItem: (item: GearItem) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const totalWeight = items.reduce((sum, it) => sum + itemWeight(it), 0);
  const previewItems = items.slice().sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, HOME_PREVIEW_LIMIT);
  const previewSets = sets.slice(0, HOME_PREVIEW_LIMIT);
  const hasMoreItems = items.length > HOME_PREVIEW_LIMIT;
  const hasMoreSets = sets.length > HOME_PREVIEW_LIMIT;
  const totalValue = items.reduce((sum, item) => sum + itemPrice(item), 0);

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
            <SectionHeader theme={theme} title={t('gear.home.overview')} first />
            <Press onPress={onOpenOverview} accessibilityRole="button" accessibilityLabel={t('gear.overview.open')} style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.feature, padding: 6, backgroundColor: homeCardBg(theme) }}>
              <OverviewFact theme={theme} label={t('gear.stat.itemCount')} value={String(items.length)} />
              <OverviewFact theme={theme} label={t('gear.home.setCount')} value={String(sets.length)} />
              <OverviewFact theme={theme} label={t('gear.home.libraryWeight')} value={fmtWeight(totalWeight, weightUnit)} />
              <OverviewFact theme={theme} label={t('gear.stat.totalValue')} value={yuanWithGap(totalValue)} />
            </Press>

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
            ) : <EmptyText theme={theme} text={t('gear.empty.noSetsYet')} />}

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
              }) : <EmptyText theme={theme} text={t('gear.empty.noItems')} />}
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

function OverviewFact({ theme, label, value }: { theme: Theme; label: string; value: string }) { return <View style={{ width: '50%', minWidth: 0, minHeight: 94, paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ fontSize: 12.5, color: theme.text2 }}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 23, fontWeight: '800', color: theme.text }}>{value}</Text></View>; }
function SectionHeader({ theme, title, action, onPress, first = false }: { theme: Theme; title: string; action?: string; onPress?: () => void; first?: boolean }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: first ? 0 : space.xxl, marginBottom: first ? 18 : space.sm }}><Text style={[first ? type.pageTitle : type.sectionTitle, { color: theme.text }]}>{title}</Text>{action && onPress ? <Press onPress={onPress} style={{ paddingVertical: 5 }}><Text style={[type.eyebrow, { color: theme.text2 }]}>{action} ›</Text></Press> : null}</View>; }

function EmptyText({ theme, text }: { theme: Theme; text: string }) {
  return <Text style={{ paddingVertical: 40, textAlign: 'center', fontSize: 14, color: theme.text3 }}>{text}</Text>;
}
