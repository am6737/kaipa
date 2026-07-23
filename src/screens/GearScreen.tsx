// GearScreen.tsx — 装备首页及新版装备、清单页面的本地导航容器。
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { JapaneseYen, Package, Tag, Weight } from 'lucide-react-native';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';
import { Press } from '../components/Press';
import { useNav } from '../nav/NavContext';
import { useI18n } from '../i18n';
import { UNCAT, GearCat, GearItem, GearSet, GearSetOverride, itemWeight, itemPrice, WeightUnit, fmtWeight, splitWeight } from '../data/gear';
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
import { radius, space, type } from '../design-system';

type GearPage = { type: 'item'; item: GearItem } | { type: 'set'; set: GearSet } | { type: 'overview' } | { type: 'setsList' } | { type: 'itemsList' };

// ── Derived theme tokens (mirror gxThemeFromKaipa) ──────────────────────────
const fieldBg = (t: Theme) => t.fieldSurface;
const homePageBg = (t: Theme) => t.groupedBg;
const homeCardBg = (t: Theme) => t.featureSurface;

// ── Metric-agnostic value + formatting (qty-free, matching the prototype) ───
const yuan = (v: number) => '¥' + Math.round(v).toLocaleString('en-US');
const yuanWithGap = (v: number) => '¥ ' + Math.round(v).toLocaleString('en-US');

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

export function GearScreen({ theme }: { theme: Theme }) {
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
  const [pageStack, setPageStack] = useState<GearPage[]>([]);
  const pushPage = (p: GearPage) => setPageStack((s) => [...s, p]);
  const popPage = () => setPageStack((s) => s.slice(0, -1));
  // 新建 / 编辑清单 bottom sheet.
  const [setEditor, setSetEditor] = useState<{ mode: 'new' | 'edit'; set?: GearSet } | null>(null);
  // 新建 / 编辑装备 full-screen form (holds the item being edited / a blank draft).
  const [itemEditor, setItemEditor] = useState<{ mode: 'new' | 'edit'; item: GearItem } | null>(null);
  // 新建 / 编辑分类 bottom sheet.
  const [catEditor, setCatEditor] = useState<{ mode: 'new' | 'edit'; cat?: GearCat } | null>(null);
  // 添加装备入口选择（链接 / 拍照 / 手动）
  const [addChoose, setAddChoose] = useState(false);
  // Hide the floating tab bar whenever a detail page is open (matches MeScreen).
  useEffect(() => { nav.setTabBarHidden(pageStack.length > 0); }, [pageStack.length, nav]);
  useEffect(() => () => nav.setTabBarHidden(false), [nav]);

  const updateItem = (oldName: string, ni: GearItem) => {
    const oldItem = allItems.find(it => it.name === oldName);
    if (oldItem && sameGearItem(oldItem, ni)) {
      setItemEditor(null);
      return;
    }
    if (oldItem?.id) data.updateItem(oldItem.id, ni);
    setPageStack((stk) =>
      stk.map((pg) => {
        if (pg.type === 'item' && pg.item.name === oldName) return { type: 'item', item: ni };
        if (pg.type === 'set' && ni.name !== oldName) return { type: 'set', set: { ...pg.set, items: pg.set.items.map((n) => (n === oldName ? ni.name : n)) } };
        return pg;
      })
    );
    setItemEditor(null);
    nav.showToast(t('gear.toast.itemUpdated'), 'top');
  };

  const addItem = (ni: GearItem) => {
    data.addItem(ni);
    setItemEditor(null);
    nav.showToast(t('gear.toast.itemAdded'));
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
    await data.addSet(name, itemIds, { ...set.overrides });
    nav.showToast(t('gear.toast.setCopied'), 'top');
  };
  const saveSet = (name: string, itemNames: string[], overrides: Record<string, GearSetOverride>) => {
    const itemIds = itemNames.map(n => allItems.find(i => i.name === n)?.id).filter(Boolean) as number[];
    if (setEditor?.mode === 'edit' && setEditor.set) {
      const id = setEditor.set.id;
      data.updateSet(id, name, itemIds, overrides);
      setPageStack((stk) => stk.map((p) => (p.type === 'set' && p.set.id === id ? { type: 'set', set: { ...p.set, name, items: itemNames, overrides } } : p)));
      nav.showToast(t('gear.toast.setUpdated'));
    } else {
      data.addSet(name, itemIds, overrides);
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
  const onAddResult = (item: GearItem) => {
    setAddChoose(false);
    setItemEditor({ mode: 'new', item });
  };

  return (
    <View style={{ flex: 1, backgroundColor: homePageBg(theme) }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <GearHome
          theme={theme}
          sets={orderedSets}
          items={allItems}
          catMap={catMap}
          weightUnit={weightUnit}
          onOpenOverview={() => pushPage({ type: 'overview' })}
          onOpenSets={() => pushPage({ type: 'setsList' })}
          onOpenItems={() => pushPage({ type: 'itemsList' })}
          onOpenSet={(set) => pushPage({ type: 'set', set })}
          onOpenItem={(item) => pushPage({ type: 'item', item })}
        />
      </ScrollView>

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
              cat={catMap[pg.item.cat] || UNCAT}
              weightUnit={weightUnit}
              allItems={allItems}
              sets={sets}
              onBack={popPage}
              onOpenSet={(s) => pushPage({ type: 'set', set: s })}
              onEdit={() => setItemEditor({ mode: 'edit', item: pg.item })}
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
          />
        </View>
      )}

      {/* ── 添加装备入口选择 ── */}
      {addChoose && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 205 }]}>
          <AddGearChoose theme={theme} cats={cats} onResult={onAddResult} onCancel={() => setAddChoose(false)} />
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
            existingNames={allItems.map((i) => i.name)}
            onCancel={() => setItemEditor(null)}
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

function GearHomeView({ theme, sets, items, catMap, weightUnit, onOpenOverview, onOpenSets, onOpenItems, onOpenSet, onOpenItem }: { theme: Theme; sets: GearSet[]; items: GearItem[]; catMap: Record<string, GearCat>; weightUnit: WeightUnit; onOpenOverview: () => void; onOpenSets: () => void; onOpenItems: () => void; onOpenSet: (set: GearSet) => void; onOpenItem: (item: GearItem) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const totalWeight = items.reduce((sum, it) => sum + itemWeight(it), 0);
  const recent = items.slice().sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 3);
  const totalValue = items.reduce((sum, item) => sum + itemPrice(item), 0);
  return <View style={{ paddingHorizontal: space.xl, paddingTop: insets.top + space.md }}>
    <SectionHeader theme={theme} title={t('gear.home.overview')} first />
    <Press onPress={onOpenOverview} accessibilityRole="button" accessibilityLabel={t('gear.overview.open')} style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.feature, padding: 6, backgroundColor: homeCardBg(theme) }}>
      <OverviewFact theme={theme} label={t('gear.stat.itemCount')} value={String(items.length)} />
      <OverviewFact theme={theme} label={t('gear.home.setCount')} value={String(sets.length)} />
      <OverviewFact theme={theme} label={t('gear.home.libraryWeight')} value={fmtWeight(totalWeight, weightUnit)} />
      <OverviewFact theme={theme} label={t('gear.stat.totalValue')} value={yuanWithGap(totalValue)} />
    </Press>
    <SectionHeader theme={theme} title={t('gear.home.mySets')} action={t('gear.home.viewAll')} onPress={onOpenSets} />
    {sets.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={256} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingRight: 24 }}>{sets.map((set) => { const setItems = items.filter((item) => set.items.includes(item.name)); const setWeight = setItems.reduce((sum, item) => sum + itemWeight(item), 0); const weightParts = splitWeight(setWeight, weightUnit, true); return <Press key={set.id} onPress={() => onOpenSet(set)} style={{ width: 244, height: 142, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 17, backgroundColor: homeCardBg(theme), justifyContent: 'space-between' }}><Text numberOfLines={2} style={{ fontSize: 15.5, lineHeight: 21, fontWeight: '700', color: theme.text }}>{set.name}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}><View accessible accessibilityLabel={`${t('gear.stat.totalWeight')} ${weightParts.value} ${weightParts.unit}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Weight color={theme.text2} size={18} strokeWidth={1.8} /><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}><Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '800', color: theme.text }}>{weightParts.value}</Text><Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}>{weightParts.unit}</Text></View></View><View accessible accessibilityLabel={`${t('gear.stat.itemCount')} ${set.items.length}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Package color={theme.text2} size={18} strokeWidth={1.8} /><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}><Text style={{ fontFamily: MONO, fontSize: 16, fontWeight: '800', color: theme.text }}>{set.items.length}</Text><Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}>{t('gear.unit.items')}</Text></View></View></View></Press>; })}</ScrollView> : <EmptyText theme={theme} text={t('gear.empty.noSetsYet')} />}
    <SectionHeader theme={theme} title={t('gear.home.myGear')} action={t('gear.home.viewAll')} onPress={onOpenItems} />
    <View style={{ gap: 10 }}>
      {recent.length ? recent.map((item) => {
        const photo = item.photos?.[0];
        const category = catMap[item.cat];
        const categoryName = category?.name || t('gear.uncategorized');
        const weight = fmtWeight(itemWeight(item), weightUnit);
        const value = yuan(itemPrice(item));
        return (
          <Press key={item.name} onPress={() => onOpenItem(item)} style={{ minHeight: 112, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: homeCardBg(theme) }}>
            <View style={{ width: 84, height: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: fieldBg(theme) }}>
              <Package color={category?.color || theme.text3} size={25} strokeWidth={1.6} opacity={0.6} />
              {photo ? <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.text }}>{item.name}</Text>
              <View accessible accessibilityLabel={`${categoryName}, ${weight}, ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <View style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Tag color={category?.color || '#8E8E93'} size={15} strokeWidth={1.8} />
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
  </View>;
}
const GearHome = React.memo(GearHomeView, (previous, next) => (
  previous.theme === next.theme
  && previous.sets === next.sets
  && previous.items === next.items
  && previous.catMap === next.catMap
  && previous.weightUnit === next.weightUnit
));
function OverviewFact({ theme, label, value }: { theme: Theme; label: string; value: string }) { return <View style={{ width: '50%', minWidth: 0, minHeight: 94, paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ fontSize: 12.5, color: theme.text2 }}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 23, fontWeight: '800', color: theme.text }}>{value}</Text></View>; }
function SectionHeader({ theme, title, action, onPress, first = false }: { theme: Theme; title: string; action?: string; onPress?: () => void; first?: boolean }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: first ? 0 : space.xxl, marginBottom: first ? 18 : space.sm }}><Text style={[first ? type.pageTitle : type.sectionTitle, { color: theme.text }]}>{title}</Text>{action && onPress ? <Press onPress={onPress} style={{ paddingVertical: 5 }}><Text style={[type.eyebrow, { color: theme.text2 }]}>{action} ›</Text></Press> : null}</View>; }

function EmptyText({ theme, text }: { theme: Theme; text: string }) {
  return <Text style={{ paddingVertical: 40, textAlign: 'center', fontSize: 14, color: theme.text3 }}>{text}</Text>;
}
