// GearScreen.tsx — 装备详情、装备列表和清单列表的本地导航容器。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Theme } from '../theme/theme';
import { useNav } from '../nav/NavContext';
import { countRender } from '../lib/tabSwitchProbe';
import { useI18n } from '../i18n';
import { GearCat, GearItem, GearSet, GearSetOverride, WeightUnit } from '../data/gear';
import { useData } from '../data/DataContext';
import { GearItemDetail } from '../components/gear/GearItemDetail';
import { GearSetDetail } from '../components/gear/GearSetDetail';
import { GearSetEditor } from '../components/gear/GearSetEditor';
import { GearItemEditor, type GearAddStart } from '../components/gear/GearItemEditor';
import { blankGearItem } from '../components/gear/gearRecognition';
import { GearLinkPastePage } from '../components/gear/GearLinkPastePage';
import { AddGearMenu, type AddGearMethod, type MenuAnchor } from '../components/gear/AddGearMenu';
import { GearCatEditor } from '../components/gear/GearCatEditor';
import { GearSetsList } from '../components/gear/GearSetsList';
import { GearItemsList } from '../components/gear/GearItemsList';
import { usePinnedSets } from '../components/gear/usePinnedSets';
import type { GearSetSuggestion } from '../lib/gearSetCompose';

type GearPage =
  | { type: 'item'; item: GearItem }
  | { type: 'set'; set: GearSet }
  | { type: 'setsList' }
  | { type: 'itemsList' };

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
  owned: it.owned !== false,
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
    na.owned === nb.owned &&
    na.photos.length === nb.photos.length &&
    na.photos.every((p, i) => p === nb.photos[i]) &&
    sameStringPairs(na.attrs, nb.attrs)
  );
};

function GearScreenView({ theme, initialItem, onExit }: { theme: Theme; initialItem?: GearItem; onExit?: () => void }) {
  countRender('Gear');
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
  const [setEditor, setSetEditor] = useState<{ mode: 'new' | 'edit'; set?: GearSet; pick?: boolean } | null>(null);
  // 新建 / 编辑装备 full-screen form (holds the item being edited / a blank draft).
  const [itemEditor, setItemEditor] = useState<{
    mode: 'new' | 'edit';
    item: GearItem;
    // New items opened from 拍照识别 open the camera first; ones from 粘贴链接 arrive recognized.
    start?: GearAddStart;
    recognitionSource?: { label: string; url?: string };
  } | null>(null);
  // 粘贴链接 page from the 添加装备 menu.
  const [linkPageOpen, setLinkPageOpen] = useState(false);
  // 添加装备 popover, anchored to whichever control opened it.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // The set editor's picker can't wait on a chat, so AI stays out of its menu.
  const [addMenuForSet, setAddMenuForSet] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<MenuAnchor | null>(null);
  // 新建 / 编辑分类 bottom sheet.
  const [catEditor, setCatEditor] = useState<{ mode: 'new' | 'edit'; cat?: GearCat } | null>(null);
  const pendingSetItemAdded = useRef<((item: GearItem) => void) | null>(null);
  // Standalone gear pages own tab-bar visibility. Embedded full-screen entries
  // sit above an already-open journey detail and must not mutate its navigation chrome.
  const fullScreenPageOpen = visiblePageStack.length > 0 || setEditor != null || itemEditor != null || catEditor != null || linkPageOpen;
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
    if (nav.gearSetRequestId == null) return;
    const set = sets.find((candidate) => candidate.id === nav.gearSetRequestId);
    if (!set) {
      if (!data.gearLoading) {
        // The set may be gone; its collection is the closest useful page.
        setPageStack([{ type: 'setsList' }]);
        nav.clearGearSetRequest();
      }
      return;
    }
    setPageStack([{ type: 'setsList' }, { type: 'set', set }]);
    nav.clearGearSetRequest();
  }, [sets, data.gearLoading, nav.gearSetRequestId]);

  useEffect(() => {
    if (!nav.gearPageRequest) return;
    setPageStack([{ type: nav.gearPageRequest === 'sets' ? 'setsList' : 'itemsList' }]);
    nav.clearGearPageRequest();
  }, [nav.gearPageRequest]);

  // Rewrite the open pages when an item is renamed or edited; the same call
  // applied backwards is how a failed optimistic save is undone.
  const swapInStack = (fromName: string, to: GearItem) =>
    setPageStack((stk) =>
      stk.map((pg) => {
        if (pg.type === 'item' && pg.item.name === fromName) return { type: 'item', item: to };
        if (pg.type === 'set' && to.name !== fromName) return { type: 'set', set: { ...pg.set, items: pg.set.items.map((n) => (n === fromName ? to.name : n)) } };
        return pg;
      })
    );

  const updateItem = async (oldName: string, ni: GearItem) => {
    const oldItem = allItems.find(it => it.name === oldName);
    if (oldItem && sameGearItem(oldItem, ni)) {
      setItemEditor(null);
      return;
    }
    swapInStack(oldName, ni);
    setItemEditor(null);
    if (!oldItem?.id) return;
    try {
      const saved = await data.updateItem(oldItem.id, ni);
      if (saved) swapInStack(ni.name, saved);
    } catch (error) {
      console.warn('[Gear] item update failed:', error);
      swapInStack(ni.name, oldItem);
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
  const saveSet = async (name: string, description: string | undefined, itemNames: string[], overrides: Record<string, GearSetOverride>, toBuy: GearSetSuggestion[]) => {
    const editing = setEditor?.mode === 'edit' ? setEditor.set : null;
    setSetEditor(null);
    const itemIds = itemNames.map(n => allItems.find(i => i.name === n)?.id).filter(Boolean) as number[];
    const names = [...itemNames];
    // Gear the editor suggested and the user kept: library rows marked 待购,
    // reusing one with the same name if it appeared meanwhile.
    let added = 0;
    for (const suggestion of toBuy) {
      const key = suggestion.name.replace(/\s+/g, '').toLowerCase();
      const existing = allItems.find((item) => item.name.replace(/\s+/g, '').toLowerCase() === key);
      try {
        const item = existing ?? await data.addItem({ name: suggestion.name, cat: catMap[suggestion.categoryId] ? suggestion.categoryId : 'uncat', w: 0, p: 0, qty: 1, status: 'packed', owned: false });
        if (item?.id == null || itemIds.includes(item.id)) continue;
        itemIds.push(item.id);
        names.push(item.name);
        if (!existing) added += 1;
      } catch (error) {
        console.warn('[Gear] to-buy item add failed:', error);
      }
    }
    if (editing) {
      const id = editing.id;
      data.updateSet(id, name, itemIds, overrides, description);
      setPageStack((stk) => stk.map((p) => (p.type === 'set' && p.set.id === id ? { type: 'set', set: { ...p.set, name, description, items: names, overrides } } : p)));
      nav.showToast(t('gear.toast.setUpdated'));
    } else {
      data.addSet(name, itemIds, overrides, description);
      nav.showToast(added ? t('gear.toast.setCreatedWithToBuy', { count: added }) : t('gear.toast.setCreated'));
    }
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
  // The memoised lists keep their first callbacks, so these only touch setters and refs.
  const openAddMenu = (anchor: MenuAnchor, forSet = false) => {
    setAddMenuAnchor(anchor);
    setAddMenuForSet(forSet);
    setAddMenuOpen(true);
  };
  const addGearFromSetEditor = (onAdded: (item: GearItem) => void, anchor: MenuAnchor) => {
    pendingSetItemAdded.current = onAdded;
    openAddMenu(anchor, true);
  };
  const addGearWithAssistant = () => {
    setAddMenuOpen(false);
    nav.openAssistant(t('gear.empty.askAiItemsPrefill'), undefined, false, undefined, true);
  };
  const closeAddMenu = () => {
    setAddMenuOpen(false);
    pendingSetItemAdded.current = null;
  };
  const pickAddMethod = (method: AddGearMethod) => {
    setAddMenuOpen(false);
    if (method === 'link') setLinkPageOpen(true);
    else setItemEditor({ mode: 'new', item: blankGearItem(cats), start: method === 'photo' ? 'photo' : undefined });
  };
  const cancelLinkPage = () => {
    pendingSetItemAdded.current = null;
    setLinkPageOpen(false);
  };
  const onLinkRecognized = (item: GearItem, recognitionSource: { label: string; url?: string }) => {
    setLinkPageOpen(false);
    setItemEditor({ mode: 'new', item: { ...blankGearItem(cats), ...item }, start: 'recognized', recognitionSource });
  };
  const onLinkManual = () => {
    setLinkPageOpen(false);
    setItemEditor({ mode: 'new', item: blankGearItem(cats) });
  };
  const cancelItemEditor = () => {
    if (itemEditor?.mode === 'new') pendingSetItemAdded.current = null;
    setItemEditor(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.featureSurface }}>
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
              // Live copy: the assistant can add to the open set from another screen.
              set={sets.find((candidate) => candidate.id === pg.set.id) ?? pg.set}
              allItems={allItems}
              catMap={catMap}
              weightUnit={weightUnit}
              onBack={popPage}
              onOpenItem={(it) => pushPage({ type: 'item', item: it })}
              onDelete={() => deleteSet(pg.set.id)}
              onEdit={() => setSetEditor({ mode: 'edit', set: pg.set })}
              onAddGear={() => setSetEditor({ mode: 'edit', set: pg.set, pick: true })}
              onDuplicate={() => duplicateSet(pg.set)}
            />
          ) : pg.type === 'setsList' ? (
            <GearSetsList
              theme={theme}
              sets={sets}
              allItems={allItems}
              catMap={catMap}
              weightUnit={weightUnit}
              onBack={popPage}
              onOpenSet={(set) => pushPage({ type: 'set', set })}
              onAdd={() => setSetEditor({ mode: 'new' })}
              onOpenAssistant={() => nav.openAssistant('我还没有装备清单，请先询问我出行场景、天数、季节和携带偏好，再帮我创建一份合适的装备清单。', undefined, true, undefined, true)}
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
              onAdd={(anchor) => openAddMenu(anchor)}
              onOpenAssistant={() => nav.openAssistant(t('gear.empty.askAiItemsPrefill'), undefined, false, undefined, true)}
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
            openPicker={setEditor.pick}
            allItems={allItems}
            catMap={catMap}
            onCancel={() => setSetEditor(null)}
            onSave={saveSet}
            onAddGear={addGearFromSetEditor}
          />
        </View>
      )}

      <AddGearMenu theme={theme} visible={addMenuOpen} anchor={addMenuAnchor} onPick={pickAddMethod} onAssistant={addMenuForSet ? undefined : addGearWithAssistant} onClose={closeAddMenu} />

      {linkPageOpen && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 205 }]}>
          <GearLinkPastePage theme={theme} cats={cats} onCancel={cancelLinkPage} onRecognized={onLinkRecognized} onManual={onLinkManual} />
        </View>
      )}

      {/* ── 编辑装备 ── */}
      {itemEditor && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 210 }]}>
          <GearItemEditor
            theme={theme}
            item={itemEditor.item}
            cats={cats}
            weightUnit={weightUnit}
            start={itemEditor.start}
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

// Kept mounted under AppShell for every tab; skip re-renders the shell makes
// for its own state. Context changes (useNav/useData) still reach it.
export const GearScreen = React.memo(GearScreenView);
