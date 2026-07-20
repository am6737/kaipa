// GearScreen.tsx — the 装备 tab, aligned to the converged gx-design prototype.
//
// Chrome: thin nav bar with a tap-to-switch title (装备 / 分类 / 套装 ▾ + count)
// and a contextual add button — NO large iOS title, NO segmented pill. Each tab
// has a list⇄grid toggle. 装备 leads with a leader-line labeled donut (thick
// ring, empty center, callouts per category) over a 4-stat readout strip.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, useWindowDimensions, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../theme/theme';
import { elevCard } from '../theme/shadow';
import { MONO } from '../theme/fonts';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Donut } from '../components/Donut';
import { PhotoTile } from '../components/PhotoTile';
import { useNav } from '../nav/NavContext';
import { useI18n, TKey } from '../i18n';
import { hashStr, TONES } from '../data/tones';
import { UNCAT, GearCat, GearItem, GearSet, GearSetOverride, Metric, METRICS, metricValue, itemWeight, itemPrice, WeightUnit, fmtWeight, splitWeight } from '../data/gear';
import { useData } from '../data/DataContext';
import { LabeledDonut } from '../components/gear/LabeledDonut';
import { GearItemDetail } from '../components/gear/GearItemDetail';
import { GearCatDetail } from '../components/gear/GearCatDetail';
import { GearSetDetail } from '../components/gear/GearSetDetail';
import { GearSetEditor } from '../components/gear/GearSetEditor';
import { GearItemEditor } from '../components/gear/GearItemEditor';
import { GearCatEditor } from '../components/gear/GearCatEditor';
import { AddGearChoose } from '../components/gear/AddGearChoose';

type Tab = 'items' | 'cats' | 'sets';
type Layout = 'list' | 'grid';

// A pushed gear detail page. Mirrors MeScreen's local page stack: tap a row/card
// to push, back to pop, and the floating tab bar hides while any page is open.
type GearPage = { type: 'item'; item: GearItem } | { type: 'cat'; cat: GearCat } | { type: 'set'; set: GearSet };

// ── Derived theme tokens (mirror gxThemeFromKaipa) ──────────────────────────
const fieldBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)');
const selBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)');
const trackBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)');
// Soft card shadow — shared with the 我 page via elevCard so the two tabs stay
// in sync. NOTE: never put `overflow:'hidden'` on a view that carries this — on
// iOS that clips the shadow.
const cardShadow = (t: Theme): ViewStyle => elevCard(t);
// The 0.5px ring from the prototype's glass elev — keeps card edges legible on
// near-white surfaces even where the soft shadow is faint.
const cardBorder = (t: Theme): ViewStyle => ({ borderWidth: StyleSheet.hairlineWidth, borderColor: t.hairline });
// The white/dark round affordance (add button, layout toggle) — its own shadow.
const iconBtnShadow = (t: Theme): ViewStyle =>
  t.dark
    ? { boxShadow: '0px 2px 10px rgba(0,0,0,0.5)' }
    : { boxShadow: '0px 2px 10px rgba(0,0,0,0.14)' };

// ── Metric-agnostic value + formatting (qty-free, matching the prototype) ───
const yuan = (v: number) => '¥' + Math.round(v).toLocaleString('en-US');
const toneFor = (name: string) => TONES[Math.abs(hashStr(name)) % TONES.length];

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

interface Row extends GearCat {
  value: number;
  count: number;
}

// Aggregate every category's value/count for a metric (sorted desc), with the total.
function designRows(cats: GearCat[], metric: Metric, items: GearItem[]): { rows: Row[]; total: number } {
  const m: Record<string, { v: number; c: number }> = {};
  items.forEach((it) => {
    const e = m[it.cat] || (m[it.cat] = { v: 0, c: 0 });
    e.v += metricValue(it, metric);
    e.c += it.qty || 1;
  });
  const rows = cats
    .map((c) => ({ ...c, value: m[c.id]?.v || 0, count: m[c.id]?.c || 0 }))
    .sort((a, b) => b.value - a.value);
  return { rows, total: rows.reduce((a, r) => a + r.value, 0) };
}

// Set composition: weight-by-category segments for the mini ring + totals.
function setComp(set: GearSet, catMap: Record<string, GearCat>, allItems: GearItem[]) {
  const items = allItems.filter((it) => set.items.includes(it.name)).map((it) => {
    const override = (it.id != null ? set.overrides?.[String(it.id)] : undefined) || set.overrides?.[it.name];
    return override ? { ...it, ...override } : it;
  });
  const byCat = new Map<string, number>();
  for (const it of items) byCat.set(it.cat, (byCat.get(it.cat) || 0) + itemWeight(it));
  const comp = [...byCat.entries()]
    .map(([id, w]) => ({ value: w, color: (catMap[id] || { color: '#8E8E93' }).color }))
    .sort((a, b) => b.value - a.value);
  const wt = items.reduce((a, it) => a + itemWeight(it), 0);
  const val = items.reduce((a, it) => a + itemPrice(it), 0);
  return { comp, wt, val, nItems: items.length, nCats: byCat.size };
}

export function GearScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { t } = useI18n();
  const data = useData();
  const { width: winW } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('items');
  const [metric, setMetric] = useState<Metric>('price');
  const weightUnit: WeightUnit = data.profile.gearWeightUnit || 'kg';
  const [query, setQuery] = useState('');
  const [setsQuery, setSetsQuery] = useState('');
  const [itemLayout, setItemLayout] = useState<Layout>('list');
  const [catLayout, setCatLayout] = useState<Layout>('grid');
  const [setsLayout, setSetsLayout] = useState<Layout>('list');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const cats = data.cats;
  const allItems = data.items;
  const sets = data.sets;

  // ── multi-select (long-press to enter, batch delete) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  const enterSelect = useCallback((id: number) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const allSelected = allItems.length > 0 && selectedIds.size === allItems.length;
  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(allItems.map((it) => it.id!).filter(Boolean)));
  }, [allSelected, allItems]);
  const deleteSelected = useCallback(() => {
    Alert.alert(
      t('gear.select.deleteTitle'),
      t('gear.select.deleteMessage', { count: selectedIds.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('gear.select.deleteConfirm', { count: selectedIds.size }),
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => data.deleteItem(id));
            nav.showToast(t('gear.toast.itemsDeleted', { count: selectedIds.size }));
            exitSelect();
          },
        },
      ],
    );
  }, [selectedIds, data, nav, t, exitSelect]);

  // Pushed detail pages (装备 / 分类 / 套装), newest last.
  const [pageStack, setPageStack] = useState<GearPage[]>([]);
  const pushPage = (p: GearPage) => setPageStack((s) => [...s, p]);
  const popPage = () => setPageStack((s) => s.slice(0, -1));
  // 新建 / 编辑套装 bottom sheet.
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
  useEffect(() => { exitSelect(); }, [tab, exitSelect]);

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

  const updateItemPhotos = (name: string, photos: string[]) => {
    const current = allItems.find((it) => it.name === name);
    if (current?.id) data.updateItem(current.id, { photos });
    setPageStack((stk) =>
      stk.map((pg) => (pg.type === 'item' && pg.item.name === name ? { type: 'item', item: { ...pg.item, photos } } : pg))
    );
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
  const deleteCat = (id: string) => {
    data.deleteCat(id);
    popPage();
    nav.showToast(t('gear.toast.catDeleted'));
  };
  const deleteSet = (id: string) => {
    data.deleteSet(id);
    popPage();
    nav.showToast(t('gear.toast.setDeleted'));
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
      setPageStack((stk) => stk.map((p) => (p.type === 'cat' && p.cat.id === id ? { type: 'cat', cat: { ...p.cat, name, color } } : p)));
      nav.showToast(t('gear.toast.catUpdated'));
    } else {
      data.addCat({ name, color });
      nav.showToast(t('gear.toast.catCreated'));
    }
    setCatEditor(null);
  };

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])) as Record<string, GearCat>, [cats]);
  const { rows, total } = useMemo(() => designRows(cats, metric, allItems), [cats, metric, allItems]);
  const agg = rows.filter((r) => r.value > 0);

  const q = query.trim();
  let items = allItems.slice().sort((a, b) => b.p - a.p);
  if (q) items = items.filter((it) => it.name.includes(q) || (catMap[it.cat] && catMap[it.cat].name.includes(q)));
  const catRows = q ? rows.filter((c) => c.name.includes(q) || allItems.some((it) => it.cat === c.id && it.name.includes(q))) : rows;
  const sq = setsQuery.trim();
  const setRows = sq ? sets.filter((s) => s.name.includes(sq) || s.items.some((n) => n.includes(sq))) : sets;

  const TABS: { id: Tab; label: string; n: number }[] = [
    { id: 'items', label: t('gear.tab.items'), n: allItems.length },
    { id: 'cats', label: t('gear.tab.cats'), n: cats.length },
    { id: 'sets', label: t('gear.tab.sets'), n: sets.length },
  ];
  const curTab = TABS.find((t) => t.id === tab) || TABS[0];

  const contentW = winW - 32;
  const onAdd = () => {
    if (tab === 'sets') { setSetEditor({ mode: 'new' }); return; }
    if (tab === 'cats') { setCatEditor({ mode: 'new' }); return; }
    setAddChoose(true);
  };
  const onAddResult = (item: GearItem) => {
    setAddChoose(false);
    setItemEditor({ mode: 'new', item });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* ── Nav bar: normal or select-mode header ── */}
      {selectMode ? (
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>
              {t('gear.select.title', { count: selectedIds.size })}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Press onPress={toggleAll}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text2 }}>
                  {allSelected ? t('gear.select.deselectAll') : t('gear.select.selectAll')}
                </Text>
              </Press>
              <Press onPress={exitSelect}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.accent }}>{t('gear.select.cancel')}</Text>
              </Press>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 }}>
            <Press onPress={() => setMenuOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} scaleTo={0.98}>
              <Text style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.5, color: theme.text }}>{curTab.label}</Text>
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '600', color: theme.text3 }}>{curTab.n}</Text>
              <View style={{ alignSelf: 'center', transform: [{ rotate: menuOpen ? '180deg' : '0deg' }] }}>
                <Icon name="chevronDown" color={theme.text2} size={14} />
              </View>
            </Press>
            <Press
              onPress={onAdd}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF', ...iconBtnShadow(theme) }}
            >
              <Icon name="plus" color={theme.text} size={18} />
            </Press>
          </View>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {tab === 'items' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 2 }}>
            <View style={{ alignItems: 'center' }}>
              <MetricStepper theme={theme} metric={metric} setMetric={setMetric} />
            </View>
            <LabeledDonut theme={theme} agg={agg} total={total} metric={metric} items={allItems} width={contentW} sel={sel} onSel={setSel} weightUnit={weightUnit} />
            <View style={{ height: 0.5, backgroundColor: theme.hairline, marginVertical: 14 }} />
            <ControlsRow theme={theme} value={query} onChange={setQuery} placeholder={t('gear.search.items')} layout={itemLayout} setLayout={setItemLayout} />
            {items.length === 0 ? (
              <EmptyText theme={theme} text={t('gear.empty.noItems')} />
            ) : itemLayout === 'grid' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {items.map((it) => (
                  <ItemGridCard key={it.name} theme={theme} item={it} cat={catMap[it.cat]} w={(contentW - 10) / 2}
                    selectMode={selectMode}
                    selected={it.id ? selectedIds.has(it.id) : false}
                    onPress={() => { if (selectMode && it.id) { toggleSelect(it.id); } else { pushPage({ type: 'item', item: it }); } }}
                    onLongPress={it.id ? () => enterSelect(it.id!) : undefined}
                    weightUnit={weightUnit}
                  />
                ))}
              </View>
            ) : (
              <Card theme={theme}>
                {items.map((it, i) => (
                  <ItemRow key={it.name} theme={theme} item={it} cat={catMap[it.cat]} last={i === items.length - 1}
                    selectMode={selectMode}
                    selected={it.id ? selectedIds.has(it.id) : false}
                    onPress={() => { if (selectMode && it.id) { toggleSelect(it.id); } else { pushPage({ type: 'item', item: it }); } }}
                    onLongPress={it.id ? () => enterSelect(it.id!) : undefined}
                    weightUnit={weightUnit}
                  />
                ))}
              </Card>
            )}
            <HintText theme={theme} text={t('gear.hint.items')} />
          </View>
        )}

        {tab === 'cats' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <ControlsRow theme={theme} value={query} onChange={setQuery} placeholder={t('gear.search.cats')} layout={catLayout} setLayout={setCatLayout} />
            {catLayout === 'grid' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {catRows.map((c) => (
                  <CatCard key={c.id} theme={theme} cat={c} total={total} metric={metric} items={allItems.filter((it) => it.cat === c.id)} w={(contentW - 10) / 2} onPress={() => pushPage({ type: 'cat', cat: c })} weightUnit={weightUnit} />
                ))}
              </View>
            ) : (
              <Card theme={theme}>
                {catRows.map((c, i) => (
                  <CatRow key={c.id} theme={theme} cat={c} total={total} metric={metric} items={allItems.filter((it) => it.cat === c.id)} last={i === catRows.length - 1} onPress={() => pushPage({ type: 'cat', cat: c })} weightUnit={weightUnit} />
                ))}
              </Card>
            )}
            <HintText theme={theme} text={t('gear.hint.cats')} />
          </View>
        )}

        {tab === 'sets' && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <ControlsRow theme={theme} value={setsQuery} onChange={setSetsQuery} placeholder={t('gear.search.sets')} layout={setsLayout} setLayout={setSetsLayout} />
            {setRows.length === 0 ? (
              <EmptyText theme={theme} text={sq ? t('gear.empty.noSets') : t('gear.empty.noSetsYet')} />
            ) : setsLayout === 'grid' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {setRows.map((s) => (
                  <SetGridCard key={s.id} theme={theme} set={s} g={setComp(s, catMap, allItems)} w={(contentW - 10) / 2} onPress={() => pushPage({ type: 'set', set: s })} weightUnit={weightUnit} />
                ))}
              </View>
            ) : (
              <Card theme={theme}>
                {setRows.map((s, i) => (
                  <SetRow key={s.id} theme={theme} set={s} g={setComp(s, catMap, allItems)} last={i === setRows.length - 1} onPress={() => pushPage({ type: 'set', set: s })} weightUnit={weightUnit} />
                ))}
              </Card>
            )}
            {setRows.length > 0 && <HintText theme={theme} text={t('gear.hint.sets')} />}
          </View>
        )}
      </ScrollView>

      {/* ── Bottom delete bar (select mode) ── */}
      {selectMode && (
        <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16) + 6 }}>
          <Press
            onPress={selectedIds.size ? deleteSelected : undefined}
            style={{
              paddingVertical: 15,
              borderRadius: 14,
              alignItems: 'center',
              backgroundColor: selectedIds.size ? theme.danger : (theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: selectedIds.size ? '#fff' : theme.text3 }}>
              {selectedIds.size ? t('gear.select.deleteConfirm', { count: selectedIds.size }) : t('gear.select.deletePrompt')}
            </Text>
          </Press>
        </View>
      )}

      {/* ── Title switcher dropdown ── */}
      {menuOpen && (
        <>
          <Press onPress={() => setMenuOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} scaleTo={1}>
            <View />
          </Press>
          <View style={{ position: 'absolute', top: insets.top + 50, left: 16, minWidth: 200, borderRadius: 16, padding: 6, backgroundColor: theme.surfaceStrong, ...cardShadow(theme) }}>
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <Press
                  key={t.id}
                  onPress={() => { setTab(t.id); setMenuOpen(false); setSel(null); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 11, backgroundColor: on ? selBg(theme) : 'transparent' }}
                >
                  <Text style={{ fontSize: 16, fontWeight: on ? '700' : '500', color: theme.text }}>{t.label}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{t.n}</Text>
                  {on && <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={16} /></View>}
                </Press>
              );
            })}
          </View>
        </>
      )}

      {/* ── Pushed detail pages (装备 / 分类 / 套装) ── */}
      {pageStack.map((pg, i) => (
        <View key={i + '-' + pg.type} style={[StyleSheet.absoluteFill, { zIndex: 60 + i }]}>
          {pg.type === 'item' ? (
            <GearItemDetail
              theme={theme}
              item={pg.item}
              cat={catMap[pg.item.cat] || UNCAT}
              cats={cats}
              weightUnit={weightUnit}
              allItems={allItems}
              sets={sets}
              onBack={popPage}
              onOpenSet={(s) => pushPage({ type: 'set', set: s })}
              onDelete={() => deleteItem(pg.item.name)}
              onPhotosChange={(photos) => updateItemPhotos(pg.item.name, photos)}
              onInlineChange={(patch) => updateItem(pg.item.name, { ...pg.item, ...patch })}
            />
          ) : pg.type === 'cat' ? (
            <GearCatDetail
              theme={theme}
              cat={pg.cat}
              allItems={allItems}
              weightUnit={weightUnit}
              onBack={popPage}
              onOpenItem={(it) => pushPage({ type: 'item', item: it })}
              onDelete={() => deleteCat(pg.cat.id)}
              onEdit={() => setCatEditor({ mode: 'edit', cat: pg.cat })}
            />
          ) : (
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
            />
          )}
        </View>
      ))}

      {/* ── 新建 / 编辑套装 ── */}
      {setEditor && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
          <GearSetEditor
            theme={theme}
            weightUnit={weightUnit}
            mode={setEditor.mode}
            initial={setEditor.set}
            cats={cats}
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

// ── Shared chrome ───────────────────────────────────────────────────────────
function Card({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  // No `overflow:'hidden'` (it would clip the shadow on iOS); rows carry no
  // background of their own, so nothing pokes past the rounded corners anyway.
  return (
    <View style={{ backgroundColor: theme.surfaceTop, borderRadius: 16, ...cardBorder(theme), ...cardShadow(theme) }}>{children}</View>
  );
}

function HintText({ theme, text }: { theme: Theme; text: string }) {
  return <Text style={{ fontSize: 11, color: theme.text3, paddingHorizontal: 4, paddingTop: 10 }}>{text}</Text>;
}
function EmptyText({ theme, text }: { theme: Theme; text: string }) {
  return <Text style={{ paddingVertical: 40, textAlign: 'center', fontSize: 14, color: theme.text3 }}>{text}</Text>;
}

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

function ControlsRow({ theme, value, onChange, placeholder, layout, setLayout }: { theme: Theme; value: string; onChange: (s: string) => void; placeholder: string; layout: Layout; setLayout: (l: Layout) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 40, borderRadius: 11, backgroundColor: fieldBg(theme) }}>
        <Icon name="search" color={theme.text2} size={16} />
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.text3} style={{ flex: 1, fontSize: 15, color: theme.text, padding: 0 }} />
        {value ? (
          <Press onPress={() => onChange('')} style={{ padding: 2 }}>
            <Icon name="close" color={theme.text2} size={14} />
          </Press>
        ) : null}
      </View>
      <Press onPress={() => setLayout(layout === 'list' ? 'grid' : 'list')} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF', ...iconBtnShadow(theme) }}>
        {/* show the view you'll switch TO */}
        <Icon name={layout === 'list' ? 'grid' : 'list'} color={theme.text} size={18} />
      </Press>
    </View>
  );
}


// ── 装备 rows / cards ───────────────────────────────────────────────────────
function ItemRow({ theme, item, cat, last, onPress, onLongPress, selectMode, selected, weightUnit }: {
  theme: Theme; item: GearItem; cat: GearCat; last: boolean; onPress: () => void; weightUnit: WeightUnit;
  onLongPress?: () => void; selectMode?: boolean; selected?: boolean;
}) {
  return (
    <>
      <Press onPress={onPress} onLongPress={onLongPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
        {selectMode && (
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? theme.accent : theme.text3, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.accent : 'transparent' }}>
            {selected && <Icon name="check" color="#fff" size={14} />}
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 3 }}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ fontSize: 11.5, color: theme.text2 }}>{cat.name}</Text>
            <View style={{ width: 0.5, height: 9, backgroundColor: theme.hairline }} />
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, letterSpacing: 0.2 }}>{fmtWeight(itemWeight(item), weightUnit)} · ¥{itemPrice(item).toLocaleString('en-US')}</Text>
          </View>
        </View>
        {!selectMode && <Icon name="chevronR" color={theme.text3} size={14} />}
      </Press>
      {!last && <View style={{ height: 0.5, backgroundColor: theme.hairline, marginHorizontal: 10 }} />}
    </>
  );
}

function ItemGridCard({ theme, item, cat, w, onPress, onLongPress, selectMode, selected, weightUnit }: {
  theme: Theme; item: GearItem; cat: GearCat; w: number; onPress: () => void; weightUnit: WeightUnit;
  onLongPress?: () => void; selectMode?: boolean; selected?: boolean;
}) {
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={{ width: w, borderRadius: 16, backgroundColor: theme.surfaceTop, ...cardBorder(theme), ...cardShadow(theme) }}>
      {/* PhotoTile clips its own top corners so the card itself needs no
          overflow:'hidden' (which would otherwise clip the card's shadow). */}
      <PhotoTile tone={toneFor(item.name)} seed={item.name} radius={0} style={{ height: 120, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <View style={{ position: 'absolute', top: 9, left: 9, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 9, backgroundColor: theme.dark ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.82)' }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: cat.color }} />
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text }}>{cat.name}</Text>
        </View>
        {selectMode && (
          <View style={{ position: 'absolute', top: 9, right: 9, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? '#fff' : 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.3)' }}>
            {selected && <Icon name="check" color="#fff" size={15} />}
          </View>
        )}
      </PhotoTile>
      <View style={{ paddingHorizontal: 12, paddingTop: 11, paddingBottom: 13 }}>
        <Text numberOfLines={2} style={{ fontSize: 14.5, fontWeight: '600', color: theme.text, lineHeight: 19, minHeight: 38 }}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{fmtWeight(itemWeight(item), weightUnit)}</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>¥{item.p.toLocaleString('en-US')}</Text>
        </View>
      </View>
    </Press>
  );
}

// ── 分类 rows / cards ───────────────────────────────────────────────────────
function CatCard({ theme, cat, total, metric, items, w, onPress, weightUnit }: { theme: Theme; cat: Row; total: number; metric: Metric; items: GearItem[]; w: number; onPress: () => void; weightUnit: WeightUnit }) {
  const { t } = useI18n();
  const pct = total ? (cat.value / total) * 100 : 0;
  const wt = items.reduce((a, it) => a + itemWeight(it), 0);
  const pr = items.reduce((a, it) => a + itemPrice(it), 0);
  const stats: [string, string, Metric][] = [[t('gear.stat.value'), yuan(pr), 'price'], [t('gear.stat.weight'), fmtWeight(wt, weightUnit), 'weight'], [t('gear.stat.count'), cat.count + ' ' + t('gear.unit.items'), 'count']];
  return (
    <Press onPress={onPress} style={{ width: w, borderRadius: 14, padding: 14, backgroundColor: theme.surfaceTop, ...cardBorder(theme), ...cardShadow(theme) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: cat.color }} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text }}>{cat.name}</Text>
      </View>
      <View style={{ marginTop: 10 }}>
        {stats.map(([k, v, id]) => {
          const on = id === metric;
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 3.5 }}>
              <Text style={{ fontSize: 12, fontWeight: on ? '600' : '500', color: on ? theme.text2 : theme.text3 }}>{k}</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: on ? theme.text : theme.text2 }}>{v}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ height: 4, borderRadius: 2, marginTop: 10, backgroundColor: trackBg(theme), overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: cat.color, borderRadius: 2 }} />
      </View>
    </Press>
  );
}

function CatRow({ theme, cat, total, metric, items, last, onPress, weightUnit }: { theme: Theme; cat: Row; total: number; metric: Metric; items: GearItem[]; last: boolean; onPress: () => void; weightUnit: WeightUnit }) {
  const { t } = useI18n();
  const pct = total ? (cat.value / total) * 100 : 0;
  const wt = items.reduce((a, it) => a + itemWeight(it), 0);
  const pr = items.reduce((a, it) => a + itemPrice(it), 0);
  const parts: [Metric, string][] = [['price', yuan(pr)], ['weight', fmtWeight(wt, weightUnit)], ['count', cat.count + ' ' + t('gear.unit.items')]];
  return (
    <>
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>{cat.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
            {parts.map(([id, v], i) => {
              const on = id === metric;
              return (
                <React.Fragment key={id}>
                  {i > 0 && <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>·</Text>}
                  <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: on ? '700' : '500', color: on ? theme.text : theme.text3 }}>{v}</Text>
                </React.Fragment>
              );
            })}
          </View>
          <View style={{ height: 4, borderRadius: 2, marginTop: 7, backgroundColor: trackBg(theme), overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: cat.color, borderRadius: 2 }} />
          </View>
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{pct.toFixed(0)}%</Text>
        <Icon name="chevronR" color={theme.text3} size={14} />
      </Press>
      {!last && <View style={{ height: 0.5, backgroundColor: theme.hairline, marginHorizontal: 14 }} />}
    </>
  );
}

// ── 套装 rows / cards ───────────────────────────────────────────────────────
type SetG = ReturnType<typeof setComp>;

function SetRow({ theme, set, g, last, onPress, weightUnit }: { theme: Theme; set: GearSet; g: SetG; last: boolean; onPress: () => void; weightUnit: WeightUnit }) {
  const { t } = useI18n();
  return (
    <>
      <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 2 }}>{set.name}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, marginTop: 1 }}>{g.nCats} {t('gear.unit.cats')} · {g.nItems} {t('gear.unit.items')} · {fmtWeight(g.wt, weightUnit, true)}</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text, letterSpacing: -0.2 }}>¥{Math.round(g.val).toLocaleString('en-US')}</Text>
        <Icon name="chevronR" color={theme.text3} size={15} />
      </Press>
      {!last && <View style={{ height: 0.5, backgroundColor: theme.hairline, marginHorizontal: 14 }} />}
    </>
  );
}

function SetGridCard({ theme, set, g, w, onPress, weightUnit }: { theme: Theme; set: GearSet; g: SetG; w: number; onPress: () => void; weightUnit: WeightUnit }) {
  const { t } = useI18n();
  return (
    <Press onPress={onPress} style={{ width: w, alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 14, backgroundColor: theme.surfaceTop, ...cardBorder(theme), ...cardShadow(theme) }}>
      <Donut theme={theme} size={80} thickness={11} segments={g.comp} centerValue={splitWeight(g.wt, weightUnit, true).value} centerSub={splitWeight(g.wt, weightUnit, true).unit} />
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 12, textAlign: 'center' }}>{set.name}</Text>
      <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text2, marginTop: 3 }}>{g.nCats} {t('gear.unit.cats')} · {g.nItems} {t('gear.unit.items')}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 6, letterSpacing: -0.2 }}>¥{Math.round(g.val).toLocaleString('en-US')}</Text>
    </Press>
  );
}
