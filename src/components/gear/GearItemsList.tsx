// GearItemsList.tsx — “我的装备 / 查看全部” pushed page.
//
// The single-column cards borrow the calm, rounded rhythm of the reference
// while sharing the floating chrome and metadata language of the new gear and
// set detail pages.
import React, { useMemo, useState } from 'react';
import { Alert, GestureResponderEvent, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReAnimated, { Easing, cancelAnimation, interpolate, interpolateColor, runOnJS, scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JapaneseYen, MoreHorizontal, Package, Plus, Search, Tag, type LucideIcon } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { GearCat, GearItem, WeightUnit, fmtWeight, itemPrice, itemQty, itemStatus, itemWeight } from '../../data/gear';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press, PressDragGuardContext, useDragCancelledPress } from '../Press';
import { Glass } from '../Glass';
import { AppHeaderSearch, AppIconButton, DetailPage, layout, radius, space, type } from '../../design-system';
import { usePersistedSort } from './usePersistedSort';
import type { GearListSortMode } from './usePersistedSort';
import { GearDeleteDialog } from './GearDeleteDialog';
import { GearMenuTransition } from './GearMenuTransition';
import { measureAnchor, type MenuAnchor } from './AddGearMenu';
import { GearEmptyState } from './GearEmptyState';

const SORT_STORAGE_KEY = '@kaipa/gear/items-sort-v1';
const DISPLAY_SETTINGS_KEY = '@kaipa/gear/items-display-v1';
const INITIAL_RENDER_COUNT = 12;
// Floating bottom pills and the sheet's primary button.
const PILL_HEIGHT = layout.iconButton + space.xs;
// Rows of the glass menus.
const MENU_ROW_HEIGHT = layout.fieldHeight + space.sm;
const COMPACT_ROW_HEIGHT = layout.fieldHeight + space.xxs;
// List-row thumbnail; the row and its empty placeholders share this geometry.
const THUMB_SIZE = 52;
const LIST_ROW_MIN_HEIGHT = THUMB_SIZE + space.xs * 2;
const headerButtonStyle = { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' } as const;
function GearHeaderButton({ icon: IconComponent, onPress, label, color, active }: { icon: LucideIcon; onPress: (event: GestureResponderEvent) => void; label: string; color: string; active?: boolean }) {
  return <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={active == null ? undefined : { selected: active }} onPress={onPress} style={headerButtonStyle}><IconComponent color={color} size={25} strokeWidth={2.2} /></Press>;
}
function GearHeaderIconButton({ theme, icon, onPress, label, active = false }: { theme: Theme; icon: IconName; onPress: () => void; label: string; active?: boolean }) {
  return <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={headerButtonStyle}><Icon name={icon} color={active ? theme.accent : theme.text} size={25} strokeWidth={2.2} /></Press>;
}
type LayoutMode = 'list' | 'grid';
type ItemDisplaySettings = { images: boolean; weight: boolean; value: boolean };
type GearPickerConfig = {
  selectedNames: Set<string>;
  onDone: (selectedNames: Set<string>) => void;
  onAdd?: (anchor: MenuAnchor) => void;
};

const formatItemValue = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= 100000) return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const wan = rounded / 10000;
  return `${wan >= 10 ? wan.toFixed(1) : wan.toFixed(2).replace(/0$/, '')}万`;
};

// One page of the category pager. `id` is null for 全部 and UNCAT_PAGE for
// items whose category no longer exists.
type GearPage = { key: string; id: string | null; name: string; tab: string; color: string };
const ALL_PAGE = 'all';
const UNCAT_PAGE = 'uncat';
const TAB_BAR_HEIGHT = layout.fieldHeight;
// Room the 全部分类 button takes at the end of the tab row, fade included.
const TAB_END_WIDTH = layout.iconButton + space.md;
const pageIncludes = (page: GearPage, item: GearItem, catMap: Record<string, GearCat>) => (
  page.id == null || (page.id === UNCAT_PAGE ? !catMap[item.cat] : item.cat === page.id)
);
// Tabs drop the shared 系统 suffix of the default categories (背负系统 → 背负).
const shortCategoryName = (name: string) => name.replace(/系统$/, '') || name;
// "9.84 kg" → { value: "9.84", unit: "kg" }, so the unit can be set smaller.
const splitUnit = (text: string) => {
  const at = text.lastIndexOf(' ');
  return at < 0 ? { value: text, unit: undefined } : { value: text.slice(0, at), unit: text.slice(at + 1) };
};

function GearItemsListView({
  theme,
  items,
  catMap,
  weightUnit,
  onBack,
  onOpenItem,
  onAdd,
  onOpenAssistant,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onDeleteItems,
  onOpenSquare,
  entryVariant,
  picker,
}: {
  theme: Theme;
  items: GearItem[];
  catMap: Record<string, GearCat>;
  weightUnit: WeightUnit;
  onBack: () => void;
  onOpenItem: (item: GearItem) => void;
  // Opens the 添加装备 menu next to the tapped control.
  onAdd: (anchor: MenuAnchor) => void;
  onOpenAssistant?: () => void;
  onAddCategory: () => void;
  onEditCategory: (cat: GearCat) => void;
  onDeleteCategory: (cat: GearCat) => void;
  onDeleteItems: (ids: number[]) => void;
  onOpenSquare?: () => void;
  entryVariant?: 'push' | 'continuationY';
  picker?: GearPickerConfig;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<LayoutMode>('list');
  const [displaySettings, setDisplaySettings] = useState<ItemDisplaySettings>({ images: true, weight: true, value: true });
  const displayProgress = useSharedValue(0);
  const [sort, setSort] = usePersistedSort(SORT_STORAGE_KEY);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const pickerMode = !!picker;
  const effectiveSelectMode = pickerMode || selectMode;
  const [pickerSelectedNames, setPickerSelectedNames] = useState<Set<string>>(() => new Set(picker?.selectedNames || []));

  React.useEffect(() => {
    if (picker) setPickerSelectedNames(new Set(picker.selectedNames));
  }, [picker?.selectedNames]);

  // The display panel is measured rather than hard-coded, so the menu still
  // fits when the copy, font scale or the rows above it change.
  const displayPanelHeight = useSharedValue(0);
  const displayPanelStyle = useAnimatedStyle(() => ({
    height: displayProgress.value * displayPanelHeight.value,
    opacity: displayProgress.value,
    transform: [{ translateY: interpolate(displayProgress.value, [0, 1], [-8, 0]) }],
  }));
  const displayChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(displayProgress.value, [0, 1], [0, 180])}deg` }],
  }));

  React.useEffect(() => {
    AsyncStorage.getItem(DISPLAY_SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setDisplaySettings((current) => ({ ...current, ...parsed }));
      } catch {}
    }).catch(() => {});
  }, []);

  const updateDisplaySettings = (patch: Partial<ItemDisplaySettings>) => {
    setDisplaySettings((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const categories = useMemo(() => {
    return Object.values(catMap);
  }, [catMap]);

  // One page per category that holds items, heaviest first, after 全部.
  const pages = useMemo<GearPage[]>(() => {
    const weights = new Map<string, number>();
    items.forEach((item) => {
      const key = catMap[item.cat] ? item.cat : UNCAT_PAGE;
      weights.set(key, (weights.get(key) || 0) + itemWeight(item));
    });
    const categoryPages = [...weights.keys()].map((key) => {
      const cat = catMap[key];
      const name = cat?.name || t('gear.uncategorized');
      return { key, id: key, name, tab: shortCategoryName(name), color: cat?.color || theme.text3 };
    }).sort((a, b) => (weights.get(b.key) || 0) - (weights.get(a.key) || 0));
    const all = t('gear.itemList.all');
    return [{ key: ALL_PAGE, id: null, name: all, tab: all, color: theme.accent }, ...categoryPages];
  }, [catMap, items, t, theme.accent, theme.text3]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const next = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const catName = catMap[item.cat]?.name || t('gear.uncategorized');
        return !q || item.name.toLocaleLowerCase().includes(q) || catName.toLocaleLowerCase().includes(q) || item.note?.toLocaleLowerCase().includes(q);
      });
    if (sort === 'weight') next.sort((a, b) => itemWeight(b.item) - itemWeight(a.item));
    else if (sort === 'value') next.sort((a, b) => itemPrice(b.item) - itemPrice(a.item));
    else if (sort === 'name') next.sort((a, b) => a.item.name.localeCompare(b.item.name, 'zh-CN'));
    else next.sort((a, b) => (b.item.id || b.index) - (a.item.id || a.index));
    return next.map(({ item }) => item);
  }, [catMap, items, query, sort, t]);
  const pageRows = useMemo(() => pages.map((page) => rows.filter((item) => pageIncludes(page, item, catMap))), [catMap, pages, rows]);
  const pageItems = useMemo(() => pages.map((page) => items.filter((item) => pageIncludes(page, item, catMap))), [catMap, items, pages]);

  // The list is hosted by a scroll view, so mounting every image card in the
  // same frame can stall Android's first navigation frame. Keep the first
  // viewport responsive, then complete the list after the entry interaction
  // has yielded.
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_RENDER_COUNT);
  const [imagesReady, setImagesReady] = useState(false);
  React.useEffect(() => {
    setVisibleItemCount(Math.min(INITIAL_RENDER_COUNT, rows.length));
  }, [rows]);
  React.useEffect(() => {
    if (visibleItemCount >= rows.length) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setVisibleItemCount((count) => Math.min(count + INITIAL_RENDER_COUNT, rows.length));
    });
    return () => task.cancel();
  }, [rows.length, visibleItemCount]);
  React.useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setImagesReady(true));
    return () => task.cancel();
  }, []);

  // Paging. The pager scrolls inside the page's vertical scroll view, under
  // the sticky tabs. `activeIndex` follows the nearest page while swiping;
  // `settledIndex` moves once a page comes to rest.
  const scrollRef = useAnimatedRef<ReAnimated.ScrollView>();
  const pagerRef = useAnimatedRef<ReAnimated.ScrollView>();
  const scrollY = useSharedValue(0);
  const headerHeight = useSharedValue(0);
  const pagerX = useSharedValue(0);
  const pageWidth = useSharedValue(width);
  const nearestPage = useSharedValue(0);
  const settledPage = useSharedValue(0);
  const pagerDragging = useSharedValue(false);
  const collapsedValue = useSharedValue(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settledIndex, setSettledIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [viewportHeight, setViewportHeight] = useState(0);
  const pagesRef = React.useRef(pages);
  pagesRef.current = pages;
  const settledKeyRef = React.useRef(ALL_PAGE);
  React.useEffect(() => { pageWidth.value = width; }, [pageWidth, width]);

  const handleSettled = (index: number) => {
    setSettledIndex(index);
    settledKeyRef.current = pagesRef.current[index]?.key ?? ALL_PAGE;
  };
  const settlePage = (index: number) => {
    'worklet';
    if (settledPage.value === index) return;
    // The page lands at its own top; the summary stays collapsed if it was.
    if (scrollY.value > headerHeight.value) scrollTo(scrollRef, 0, headerHeight.value, false);
    settledPage.value = index;
    runOnJS(handleSettled)(index);
  };
  const onPageScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
    const next = headerHeight.value > 0 && event.contentOffset.y > headerHeight.value - space.xs;
    if (next !== collapsedValue.value) {
      collapsedValue.value = next;
      runOnJS(setCollapsed)(next);
    }
  });
  const onPagerScroll = useAnimatedScrollHandler({
    onBeginDrag: () => { pagerDragging.value = true; },
    onEndDrag: () => { pagerDragging.value = false; },
    onScroll: (event) => {
      if (pageWidth.value <= 0) return;
      pagerX.value = event.contentOffset.x;
      const position = event.contentOffset.x / pageWidth.value;
      const index = Math.round(position);
      if (index !== nearestPage.value) {
        nearestPage.value = index;
        runOnJS(setActiveIndex)(index);
      }
      if (!pagerDragging.value && Math.abs(position - index) < 0.01) settlePage(index);
    },
    onMomentumEnd: (event) => {
      if (pageWidth.value > 0) settlePage(Math.round(event.contentOffset.x / pageWidth.value));
    },
  });
  const goToPage = (index: number) => {
    // Neighbours slide; longer jumps cut straight to the page.
    pagerRef.current?.scrollTo({ x: index * width, animated: Math.abs(index - activeIndex) <= 1 });
  };
  // Pages reorder as weights change; stay on the category that was open.
  React.useEffect(() => {
    const index = Math.max(0, pages.findIndex((page) => page.key === settledKeyRef.current));
    if (index !== settledIndex) pagerRef.current?.scrollTo({ x: index * width, animated: false });
  }, [pages]);

  const pageIndex = Math.min(activeIndex, pages.length - 1);
  const activePage = pages[pageIndex];
  const activeRows = pageRows[pageIndex] || [];
  const hasQuery = query.trim().length > 0;
  // A brand-new library keeps the page's shape: empty totals read `--`, and
  // placeholder cards stand where the first items will appear.
  const libraryEmpty = !picker && items.length === 0;
  const libraryWeight = items.reduce((sum, item) => sum + itemWeight(item), 0);
  const selectedItems = !picker && selectMode && selectedIds.size ? items.filter((item) => item.id != null && selectedIds.has(item.id)) : null;
  // Totals follow what is on screen: the current page, or the selection.
  const shownItems = selectedItems || activeRows;
  const totalWeight = shownItems.reduce((sum, item) => sum + itemWeight(item), 0);
  const totalValue = shownItems.reduce((sum, item) => sum + itemPrice(item), 0);
  const weightShare = (weight: number) => libraryWeight > 0 ? Math.round(weight / libraryWeight * 100) : 0;
  const countText = hasQuery
    ? t('gear.itemList.filteredCount', { count: activeRows.length, total: pageItems[pageIndex]?.length || 0 })
    : activePage?.id != null
      ? t('gear.itemList.pageCount', { count: activeRows.length, pct: weightShare(totalWeight) })
      : `${items.length} ${t('gear.unit.items')}`;
  const weightParts = splitUnit(fmtWeight(totalWeight, weightUnit));
  const gridCardWidth = (width - layout.pagePadding * 2 - space.sm) / 2;
  const pagerHeight = Math.max(pageHeights[pages[settledIndex]?.key ?? ALL_PAGE] || 0, viewportHeight - TAB_BAR_HEIGHT);
  const selectableIds = activeRows.map((item) => item.id).filter((id): id is number => id != null);
  const selectableNames = activeRows.map((item) => item.name);
  const allSelected = picker
    ? selectableNames.length > 0 && selectableNames.every((name) => pickerSelectedNames.has(name))
    : selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const sortLabel = sort === 'created'
    ? t('gear.itemList.created')
    : sort === 'weight'
      ? t('gear.itemList.weight')
      : sort === 'value'
        ? t('gear.itemList.value')
        : t('gear.itemList.name');
  const pageTitle = picker ? t('gear.setEditor.chooseGear') : selectMode ? t('gear.select.title', { count: selectedIds.size }) : t('gear.home.myGear');
  const closeMoreThen = (action: () => void) => {
    setMoreOpen(false);
    setTimeout(action, 140);
  };
  const toggleDisplayExpanded = () => {
    const next = !displayExpanded;
    setDisplayExpanded(next);
    displayProgress.value = withTiming(next ? 1 : 0, {
      duration: next ? 460 : 380,
      easing: next ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
    });
  };
  const closeMore = () => {
    setDisplayExpanded(false);
    cancelAnimation(displayProgress);
    displayProgress.value = 0;
    setMoreOpen(false);
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const enterSelect = (id: number) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };
  const toggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (picker) {
      setPickerSelectedNames((current) => {
        const next = new Set(current);
        selectableNames.forEach((name) => allSelected ? next.delete(name) : next.add(name));
        return next;
      });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      selectableIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };
  const togglePickerItem = (itemName: string) => {
    if (!picker) return;
    setPickerSelectedNames((current) => {
      const next = new Set(current);
      if (next.has(itemName)) next.delete(itemName);
      else next.add(itemName);
      return next;
    });
  };
  const finishPicker = () => {
    if (picker) picker.onDone(new Set(pickerSelectedNames));
  };
  const beginSelect = () => {
    setSelectedIds(new Set());
    setSelectMode(true);
  };
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };
  const confirmDelete = () => {
    if (!selectedIds.size) return;
    setDeleteDialogOpen(true);
  };
  const itemProps = (item: GearItem) => ({
    theme,
    item,
    cat: catMap[item.cat],
    weightUnit,
    selectMode: effectiveSelectMode,
    selected: picker ? pickerSelectedNames.has(item.name) : item.id != null && selectedIds.has(item.id),
    showImage: displaySettings.images,
    showPhoto: imagesReady,
    loading: !imagesReady,
    showWeight: displaySettings.weight,
    showValue: displaySettings.value,
    onPress: () => picker ? togglePickerItem(item.name) : item.id != null && selectMode ? toggleSelected(item.id) : onOpenItem(item),
    onLongPress: !picker && item.id != null ? () => enterSelect(item.id!) : undefined,
  });
  const renderPage = (index: number) => {
    const shown = pageRows[index] || [];
    const rendered = shown.slice(0, visibleItemCount);
    if (!shown.length) {
      return hasQuery ? (
        <GearEmptyState
          theme={theme}
          icon="search"
          title={t('gear.empty.noItems')}
          actionLabel={t('gear.empty.clearItemFilters')}
          actionIcon="close"
          onAction={closeSearch}
        />
      ) : <GearEmptyState theme={theme} icon="bag" title={t('gear.empty.noItemsYet')} />;
    }
    if (viewMode === 'grid') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          {[0, 1].map((column) => (
            <View key={column} style={{ width: gridCardWidth, gap: space.sm }}>
              {rendered.filter((_, row) => row % 2 === column).map((item) => (
                <ItemGridCard key={item.id || item.name} {...itemProps(item)} width={gridCardWidth} />
              ))}
            </View>
          ))}
        </View>
      );
    }
    return rendered.map((item) => <ItemRow key={item.id || item.name} {...itemProps(item)} showCategory={pages[index]?.id == null} />);
  };

  return (
    <DetailPage
      theme={theme}
      entryVariant={entryVariant}
      onBack={picker ? finishPicker : selectMode ? exitSelect : onBack}
      backgroundColor={theme.groupedBg}
      flatChrome
      scrollable={false}
      title={collapsed && !searchOpen ? (picker || selectMode ? pageTitle : activePage?.name) : undefined}
      right={pickerMode ? (
        <AppHeaderSearch
          theme={theme}
          open={searchOpen}
          value={query}
          placeholder={t('gear.search.items')}
          onChangeText={setQuery}
          onClose={closeSearch}
          actions={(
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {picker?.onAdd ? <GearHeaderButton icon={Plus} onPress={(event) => { const add = picker.onAdd; if (add) measureAnchor(event).then(add); }} label={t('gear.itemList.newItem')} color={theme.text} /> : null}
              <GearHeaderButton icon={Search} onPress={() => setSearchOpen(true)} label={t('common.search')} color={theme.text} />
              <GearHeaderIconButton theme={theme} icon="checkAll" onPress={toggleAll} active={allSelected} label={t('common.selectAll')} />
            </View>
          )}
        />
      ) : selectMode ? (
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <GearHeaderIconButton theme={theme} icon="checkAll" onPress={toggleAll} active={allSelected} label={t('common.selectAll')} />
          <GearHeaderIconButton theme={theme} icon="close" onPress={exitSelect} label={t('common.close')} />
        </View>
      ) : (
        <AppHeaderSearch
          theme={theme}
          open={searchOpen}
          value={query}
          placeholder={t('gear.search.items')}
          onChangeText={setQuery}
          onClose={closeSearch}
          actions={(
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <GearHeaderButton icon={Search} onPress={() => setSearchOpen(true)} label={t('common.search')} color={theme.text} />
              <GearHeaderButton icon={MoreHorizontal} onPress={() => { setDisplayExpanded(false); displayProgress.value = 0; setMoreOpen(true); }} label={t('gear.itemList.manage')} color={theme.text} />
            </View>
          )}
        />
      )}
      overlay={(
        <>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingTop: space.xl, paddingBottom: Math.max(insets.bottom, space.md) + space.xxs, flexDirection: 'row', justifyContent: 'space-between' }}>
              {picker ? (
                <View style={{ flex: 1, flexDirection: 'row', gap: space.sm }}>
                  <BottomControl theme={theme} icon="arrowDown" label={sortLabel} onPress={() => setSortOpen(true)} />
                  <BottomControl theme={theme} icon="check" label={t('gear.setEditor.pickerDone', { count: pickerSelectedNames.size })} onPress={finishPicker} primary style={{ flex: 1 }} />
                </View>
              ) : selectMode ? (
                <Press onPress={selectedIds.size ? confirmDelete : undefined} style={{ flex: 1, height: PILL_HEIGHT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size ? theme.danger : theme.controlSurface }}>
                  <Text style={[type.cardTitle, { color: selectedIds.size ? '#FFFFFF' : theme.text3 }]}>{selectedIds.size ? t('gear.select.deleteConfirm', { count: selectedIds.size }) : t('gear.select.deletePrompt')}</Text>
                </Press>
              ) : libraryEmpty ? (
                // The first placeholder card already adds an item, so only AI stays here.
                onOpenAssistant ? (
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <BottomControl theme={theme} label={t('gear.empty.askAiItems')} onPress={onOpenAssistant} />
                  </View>
                ) : null
              ) : (
                <>
                  <BottomControl theme={theme} icon="plus" label={t('gear.itemList.newItem')} onPress={(event) => measureAnchor(event).then(onAdd)} primary />
                  <BottomControl theme={theme} icon="arrowDown" label={sortLabel} onPress={() => setSortOpen(true)} />
                </>
              )}
            </View>
          </View>

          <FloatingMenu theme={theme} visible={moreOpen} top={insets.top + layout.topBarHeight + space.md} width={Math.min(232, width - space.sm * 2)} onClose={closeMore}>
            {onOpenSquare ? <>
              <MenuCaption theme={theme} text={t('gear.square.discover')} />
              <MenuRow theme={theme} icon="globe" label={t('gear.square.items')} onPress={() => closeMoreThen(onOpenSquare)} />
              <MenuCaption theme={theme} text={t('gear.itemList.manage')} spaced />
            </> : null}
            {!onOpenSquare ? <MenuCaption theme={theme} text={t('gear.itemList.manage')} /> : null}
            <MenuRow theme={theme} icon="checkAll" label={t('gear.itemList.batchManage')} onPress={() => closeMoreThen(beginSelect)} />
            <MenuRow theme={theme} icon="gearSettings" label={t('gear.category.manage')} onPress={() => closeMoreThen(() => setCategoryManagerOpen(true))} />
            <MenuCaption theme={theme} text={t('gear.setList.display')} spaced />
            <MenuRow theme={theme} icon="grid" label={t('gear.setList.grid')} selected={viewMode === 'grid'} onPress={() => closeMoreThen(() => setViewMode('grid'))} />
            <MenuRow theme={theme} icon="list" label={t('gear.setList.list')} selected={viewMode === 'list'} onPress={() => closeMoreThen(() => setViewMode('list'))} />
            <MenuRow
              theme={theme}
              icon="gearSettings"
              label={t('gear.setDetail.displaySettings')}
              onPress={toggleDisplayExpanded}
              trailing={(
                <ReAnimated.View style={displayChevronStyle}>
                  <Icon name="chevronDown" color={theme.text2} size={14} strokeWidth={2} />
                </ReAnimated.View>
              )}
            />
            <ReAnimated.View pointerEvents={displayExpanded ? 'auto' : 'none'} style={[{ overflow: 'hidden' }, displayPanelStyle]}>
              <View onLayout={(event) => { displayPanelHeight.value = event.nativeEvent.layout.height; }} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: space.xxs }}>
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayImages')} value={displaySettings.images} onChange={(images) => updateDisplaySettings({ images })} />
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayWeight')} value={displaySettings.weight} onChange={(weight) => updateDisplaySettings({ weight })} />
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayValue')} value={displaySettings.value} onChange={(value) => updateDisplaySettings({ value })} last />
              </View>
            </ReAnimated.View>
          </FloatingMenu>

          <CompactChoiceMenu theme={theme} visible={sortOpen} title={t('gear.itemList.sort')} onClose={() => setSortOpen(false)}>
            {([
              ['created', t('gear.itemList.created'), 'clock'],
              ['weight', t('gear.itemList.weight'), 'arrowDown'],
              ['value', t('gear.itemList.value'), 'arrowDown'],
              ['name', t('gear.itemList.name'), 'list'],
            ] as [GearListSortMode, string, IconName][]).map(([id, label, icon]) => (
              <CompactMenuRow key={id} theme={theme} icon={icon} label={label} selected={sort === id} onPress={() => { setSort(id); setSortOpen(false); }} />
            ))}
          </CompactChoiceMenu>

          <CategoryJumpSheet
            theme={theme}
            visible={jumpOpen}
            pages={pages}
            pageItems={pageItems}
            activeIndex={pageIndex}
            weightUnit={weightUnit}
            weightShare={weightShare}
            onClose={() => setJumpOpen(false)}
            onSelect={(index) => {
              setJumpOpen(false);
              goToPage(index);
            }}
          />

          <CategoryManager
            theme={theme}
            visible={categoryManagerOpen}
            categories={categories}
            items={items}
            onClose={() => setCategoryManagerOpen(false)}
            onAdd={onAddCategory}
            onEdit={onEditCategory}
            onDelete={onDeleteCategory}
          />

          <GearDeleteDialog
            theme={theme}
            visible={deleteDialogOpen}
            title={t('gear.select.deleteTitle')}
            message={t('gear.select.deleteMessage', { count: selectedIds.size })}
            confirmLabel={t('gear.select.deleteConfirm', { count: selectedIds.size })}
            cancelLabel={t('common.cancel')}
            onCancel={() => setDeleteDialogOpen(false)}
            onConfirm={() => {
              setDeleteDialogOpen(false);
              onDeleteItems([...selectedIds]);
              exitSelect();
            }}
          />
        </>
      )}
    >
      <ReAnimated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={onPageScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={libraryEmpty ? undefined : [1]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onTouchStart={searchOpen ? closeSearch : undefined}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <View onLayout={(event) => { headerHeight.value = event.nativeEvent.layout.height; }} style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
            <Text numberOfLines={1} style={[type.pageTitle, { flexShrink: 1, color: theme.text }]}>{pageTitle}</Text>
            <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text3 }]}>{libraryEmpty ? `0 ${t('gear.unit.items')}` : countText}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
            <SummaryStat
              theme={theme}
              label={selectedItems ? t('gear.itemList.selectedWeight') : activePage?.id != null ? t('gear.stat.weight') : t('gear.stat.totalWeight')}
              value={libraryEmpty ? '--' : weightParts.value}
              suffix={libraryEmpty ? undefined : weightParts.unit}
              empty={libraryEmpty}
            />
            <SummaryStat
              theme={theme}
              label={selectedItems ? t('gear.itemList.selectedValue') : activePage?.id != null ? t('gear.stat.value') : t('gear.stat.totalValue')}
              value={libraryEmpty ? '--' : formatItemValue(totalValue)}
              prefix={libraryEmpty ? undefined : '¥'}
              empty={libraryEmpty}
            />
          </View>
        </View>

        {libraryEmpty ? (
          <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.sm }}>
            <EmptyLibraryCards theme={theme} onAdd={onAdd} />
          </View>
        ) : (
          <CategoryTabs theme={theme} pages={pages} activeIndex={pageIndex} pagerX={pagerX} pageWidth={pageWidth} onSelect={goToPage} onOpenAll={() => setJumpOpen(true)} />
        )}

        {libraryEmpty ? null : (
          <ReAnimated.ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onPagerScroll}
            scrollEventThrottle={16}
            style={{ height: pagerHeight }}
          >
            {pages.map((page, index) => (
              <PagerPage
                key={page.key}
                index={index}
                width={width}
                settledPage={settledPage}
                scrollY={scrollY}
                headerHeight={headerHeight}
                onHeight={(height) => setPageHeights((current) => current[page.key] === height ? current : { ...current, [page.key]: height })}
              >
                {Math.abs(index - pageIndex) <= 1 || index === settledIndex ? renderPage(index) : null}
              </PagerPage>
            ))}
          </ReAnimated.ScrollView>
        )}
      </ReAnimated.ScrollView>
    </DetailPage>
  );
}

export const GearItemsList = React.memo(GearItemsListView, (previous, next) => (
  previous.theme === next.theme
  && previous.items === next.items
  && previous.catMap === next.catMap
  && previous.weightUnit === next.weightUnit
  && previous.picker?.selectedNames === next.picker?.selectedNames
  && previous.picker?.onDone === next.picker?.onDone
));

function CategoryManager({ theme, visible, categories, items, onClose, onAdd, onEdit, onDelete }: { theme: Theme; visible: boolean; categories: GearCat[]; items: GearItem[]; onClose: () => void; onAdd: () => void; onEdit: (cat: GearCat) => void; onDelete: (cat: GearCat) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    items.forEach((item) => next.set(item.cat, (next.get(item.cat) || 0) + 1));
    return next;
  }, [items]);
  const confirmDelete = (cat: GearCat) => {
    const count = counts.get(cat.id) || 0;
    Alert.alert(
      t('gear.category.deleteTitle', { name: cat.name }),
      count > 0 ? t('gear.category.deleteMessage', { count }) : t('gear.category.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('gear.category.delete'), style: 'destructive', onPress: () => onDelete(cat) },
      ],
    );
  };
  if (!visible) return null;
  return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 300, justifyContent: 'flex-end' }]}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
        <View style={{ maxHeight: '78%', paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.md), borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, backgroundColor: theme.groupedBg }}>
          <View style={{ alignSelf: 'center', width: space.xxl, height: space.xxs, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.45 }} />
          <View style={{ minHeight: layout.topBarHeight + space.sm, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[type.sectionTitle, { flex: 1, color: theme.text }]}>{t('gear.category.manage')}</Text>
            <AppIconButton theme={theme} name="close" onPress={onClose} size={36} noShadow />
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.xs, gap: space.xs }}>
            {categories.map((cat) => {
              const count = counts.get(cat.id) || 0;
              return (
                <Press key={cat.id} onPress={() => onEdit(cat)} style={{ minHeight: layout.listRowMinHeight, paddingLeft: space.md, paddingRight: space.xxs, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.featureSurface }}>
                  <View style={{ width: space.sm, height: space.sm, borderRadius: radius.pill, backgroundColor: cat.color }} />
                  <View style={{ flex: 1, marginLeft: space.sm }}>
                    <Text style={[type.cardTitle, { color: theme.text }]}>{cat.name}</Text>
                    <Text style={[type.caption, { marginTop: space.xxs, color: theme.text3 }]}>{count} {t('gear.unit.items')}</Text>
                  </View>
                  <Press accessibilityRole="button" accessibilityLabel={t('gear.category.delete')} onPress={(event) => { event.stopPropagation(); confirmDelete(cat); }} style={headerButtonStyle}>
                    <Icon name="trash" color={theme.danger} size={17} strokeWidth={1.9} />
                  </Press>
                </Press>
              );
            })}
          </ScrollView>
          <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}>
            <Press onPress={onAdd} style={{ height: PILL_HEIGHT, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: theme.accent }}>
              <Icon name="plus" color="#FFFFFF" size={17} strokeWidth={2.3} />
              <Text style={[type.cardTitle, { color: '#FFFFFF' }]}>{t('gear.category.add')}</Text>
            </Press>
          </View>
        </View>
      </View>
  );
}

type ItemCardProps = { theme: Theme; item: GearItem; cat?: GearCat; weightUnit: WeightUnit; onPress: () => void; onLongPress?: () => void; selectMode: boolean; selected: boolean; showImage: boolean; showPhoto: boolean; loading: boolean; showWeight: boolean; showValue: boolean };

// A long press enters selection; the tap that ends it must not also toggle or open.
function useCardPress(onPress: () => void, onLongPress?: () => void) {
  const ignorePressAfterLongPress = React.useRef(false);
  const handleLongPress = onLongPress ? () => {
    ignorePressAfterLongPress.current = true;
    onLongPress();
    setTimeout(() => { ignorePressAfterLongPress.current = false; }, 700);
  } : undefined;
  const handlePress = () => {
    if (ignorePressAfterLongPress.current) {
      ignorePressAfterLongPress.current = false;
      return;
    }
    onPress();
  };
  return { handlePress, handleLongPress };
}

function ItemThumb({ theme, photo, color, showPhoto, iconSize, style }: { theme: Theme; photo?: string; color: string; showPhoto: boolean; iconSize: number; style: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.fieldSurface }, style]}>
      <Package color={color} size={iconSize} strokeWidth={1.6} opacity={0.6} />
      {photo && showPhoto ? <Image source={{ uri: photo }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

function SkeletonBar({ theme, width, height }: { theme: Theme; width: `${number}%`; height: number }) {
  return <View style={{ width, height, borderRadius: radius.control / 2, backgroundColor: theme.fieldSurface }} />;
}

function SelectMark({ theme, selected, overImage = false }: { theme: Theme; selected: boolean; overImage?: boolean }) {
  return (
    <View style={{ width: space.xl, height: space.xl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? theme.accent : overImage ? '#FFFFFF' : theme.text3, backgroundColor: selected ? theme.accent : overImage ? 'rgba(0,0,0,0.22)' : 'transparent' }}>
      {selected ? <Icon name="check" color="#FFFFFF" size={15} strokeWidth={2.4} /> : null}
    </View>
  );
}

function SelectedOutline({ theme }: { theme: Theme }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.feature, borderWidth: 1.5, borderColor: theme.accent }]} />;
}

function ItemValue({ theme, value }: { theme: Theme; value: string }) {
  return (
    <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
      <JapaneseYen color={theme.text3} size={13} strokeWidth={1.8} />
      <Text numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{value}</Text>
    </View>
  );
}

// List row with no card behind it, so the page reads as one surface; only a
// press or a selection tints it. Weight over value on the right keeps both
// scannable down the column. The category shows only on 全部.
function ItemRow({ theme, item, cat, showCategory, weightUnit, onPress, onLongPress, selectMode, selected, showImage, showPhoto, loading, showWeight, showValue }: ItemCardProps & { showCategory: boolean }) {
  const { t } = useI18n();
  const { handlePress, handleLongPress } = useCardPress(onPress, onLongPress);
  const rowPress = useDragCancelledPress(handlePress, React.useContext(PressDragGuardContext));
  const category = cat?.name || t('gear.uncategorized');
  const accent = cat?.color || theme.text3;
  const toBuy = item.owned === false;
  const qty = itemQty(item);
  const status = itemStatus(item);
  const statusLabel = status === 'worn' ? t('gear.pack.worn') : status === 'consumable' ? t('gear.pack.consumable') : status === 'optional' ? t('gear.status.optional') : null;
  const weight = toBuy ? '—' : fmtWeight(itemWeight(item), weightUnit);
  const value = toBuy ? '—' : `¥${formatItemValue(itemPrice(item))}`;
  const shell = { minHeight: showImage ? LIST_ROW_MIN_HEIGHT : layout.listRowMinHeight, marginHorizontal: -space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', gap: space.sm } as const;
  if (loading) {
    return <View style={shell}>
      {showImage ? <View style={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: radius.card, backgroundColor: theme.fieldSurface }} /> : null}
      <View style={{ flex: 1, gap: space.sm }}>
        <SkeletonBar theme={theme} width="68%" height={15} />
        <SkeletonBar theme={theme} width="40%" height={11} />
      </View>
    </View>;
  }
  const tag = (label: string, color: string, backgroundColor: string) => (
    <View key={label} style={{ paddingHorizontal: space.xxs + 2, paddingVertical: 1, borderRadius: radius.control / 2, backgroundColor }}>
      <Text style={[type.micro, { fontWeight: '600', color }]}>{label}</Text>
    </View>
  );
  const meta = [
    showCategory ? (
      <View key="cat" style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        <View style={{ width: space.xs, height: space.xs, borderRadius: radius.pill, backgroundColor: accent }} />
        <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, color: theme.text2 }]}>{category}</Text>
      </View>
    ) : null,
    qty > 1 && !toBuy ? <Text key="qty" numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{t('gear.itemList.qtyEach', { qty, weight: fmtWeight(item.w, weightUnit) })}</Text> : null,
    statusLabel ? tag(statusLabel, theme.text2, theme.fieldSurface) : null,
    toBuy ? tag(t('gear.toBuy'), theme.accent, theme.accentSofter) : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPressIn={rowPress.onPressIn}
      onPress={rowPress.onPress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={[item.name, category, showWeight ? weight : null, showValue ? value : null].filter(Boolean).join(', ')}
      style={({ pressed }) => [shell, { backgroundColor: selected ? theme.accentSofter : pressed ? theme.fieldSurface : 'transparent' }]}
    >
      {showImage ? (
        <ItemThumb
          theme={theme}
          photo={item.photos?.[0]}
          color={toBuy ? theme.text3 : accent}
          showPhoto={showPhoto}
          iconSize={20}
          style={[{ width: THUMB_SIZE, height: THUMB_SIZE }, toBuy ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border, backgroundColor: 'transparent' } : null]}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Text numberOfLines={2} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>{item.name}</Text>
        {meta.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0 }}>{meta}</View> : null}
      </View>
      {showWeight || showValue ? (
        <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: space.xxs }}>
          {showWeight ? <Text numberOfLines={1} style={[type.metric, { fontVariant: ['tabular-nums'], color: toBuy ? theme.text3 : theme.text }]}>{weight}</Text> : null}
          {showValue ? <Text numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: toBuy ? theme.text3 : theme.text2 }]}>{value}</Text> : null}
        </View>
      ) : null}
      {selectMode ? <SelectMark theme={theme} selected={selected} /> : null}
    </Pressable>
  );
}

function ItemGridCard({ theme, item, cat, weightUnit, width, onPress, onLongPress, selectMode, selected, showImage, showPhoto, loading, showWeight, showValue }: ItemCardProps & { width: number }) {
  const { t } = useI18n();
  const { handlePress, handleLongPress } = useCardPress(onPress, onLongPress);
  const category = cat?.name || t('gear.uncategorized');
  const accent = cat?.color || theme.accent;
  const weight = fmtWeight(itemWeight(item), weightUnit, true);
  const value = `¥${formatItemValue(itemPrice(item))}`;
  const imageHeight = Math.max(116, width - space.sm * 2);
  const shell = { width, borderRadius: radius.feature, padding: space.sm, backgroundColor: theme.featureSurface } as const;
  if (loading) {
    return <View style={shell}>
      {showImage ? <View style={{ height: imageHeight, borderRadius: radius.card, backgroundColor: theme.fieldSurface }} /> : null}
      <View style={{ marginTop: showImage ? space.sm : 0, gap: space.xs }}>
        <SkeletonBar theme={theme} width="78%" height={16} />
        <SkeletonBar theme={theme} width="58%" height={11} />
      </View>
    </View>;
  }
  return (
    <Press onPress={handlePress} onLongPress={handleLongPress} accessibilityLabel={[item.name, category, showWeight ? weight : null, showValue ? value : null].filter(Boolean).join(', ')} style={shell}>
      {showImage ? <ItemThumb theme={theme} photo={item.photos?.[0]} color={accent} showPhoto={showPhoto} iconSize={28} style={{ height: imageHeight }} /> : null}
      <View style={{ marginTop: showImage ? space.sm : 0, gap: space.xs }}>
        <Text numberOfLines={2} style={[type.cardTitle, { lineHeight: 21, color: theme.text }]}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, minWidth: 0 }}>
          <Tag color={accent} size={13} strokeWidth={1.8} />
          <Text numberOfLines={1} style={[type.caption, { flex: 1, minWidth: 0, color: theme.text2 }]}>{category}</Text>
        </View>
        {(showWeight || showValue) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: space.xs, rowGap: space.xxs }}>
            {showWeight ? <Text numberOfLines={1} style={[type.metric, { fontVariant: ['tabular-nums'], color: theme.text }]}>{weight}</Text> : null}
            {showValue ? <ItemValue theme={theme} value={value} /> : null}
          </View>
        ) : null}
      </View>
      {selectMode ? <View style={{ position: 'absolute', top: space.lg, right: space.lg }}><SelectMark theme={theme} selected={selected} overImage={showImage} /></View> : null}
      {selected ? <SelectedOutline theme={theme} /> : null}
    </Press>
  );
}

// One of the two summary totals. Weight and value sit side by side at the
// same size; the unit is set smaller so the number leads.
function SummaryStat({ theme, label, value, prefix, suffix, empty = false }: { theme: Theme; label: string; value: string; prefix?: string; suffix?: string; empty?: boolean }) {
  const unit = [type.liveUnit, { letterSpacing: 0, color: theme.text2 }];
  return (
    <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
      <Text numberOfLines={1} style={[type.eyebrow, { letterSpacing: 0, color: theme.text2 }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[type.summaryValue, { color: empty ? theme.text3 : theme.text }]}>
        {prefix ? <Text style={unit}>{prefix} </Text> : null}
        {value}
        {suffix ? <Text style={unit}> {suffix}</Text> : null}
      </Text>
    </View>
  );
}

// Dashed stand-ins shaped like ItemRow: the first one adds an item, the
// fading ones behind it hint at the list that will fill in.
function EmptyLibraryCards({ theme, onAdd }: { theme: Theme; onAdd: (anchor: MenuAnchor) => void }) {
  const { t } = useI18n();
  const dashed = { minHeight: LIST_ROW_MIN_HEIGHT, borderRadius: radius.feature, padding: space.sm, flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.md, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: theme.border };
  const thumb = { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: radius.card, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ gap: space.sm }}>
      <Press accessibilityRole="button" accessibilityLabel={t('gear.empty.addFirstItem')} onPress={(event) => measureAnchor(event).then(onAdd)} style={dashed}>
        <View style={[thumb, { backgroundColor: theme.fieldSurface }]}>
          <Plus color={theme.text2} size={26} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Text numberOfLines={1} style={[type.cardTitle, { lineHeight: 21, color: theme.text }]}>{t('gear.empty.addFirstItem')}</Text>
          <Text numberOfLines={2} style={[type.hint, { color: theme.text2 }]}>{t('gear.empty.firstItemSub')}</Text>
        </View>
      </Press>
      {[0.55, 0.28].map((opacity) => (
        <View key={opacity} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[dashed, { opacity }]}>
          <View style={[thumb, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border }]} />
          <View style={{ flex: 1, gap: space.sm }}>
            <SkeletonBar theme={theme} width="64%" height={15} />
            <SkeletonBar theme={theme} width="42%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

// A page of the pager. While another page is settled, this one is shifted down
// by however far the summary has scrolled away, so swiping in from a scrolled
// list shows the top of this page under the tabs instead of its middle.
function PagerPage({ index, width, settledPage, scrollY, headerHeight, onHeight, children }: { index: number; width: number; settledPage: SharedValue<number>; scrollY: SharedValue<number>; headerHeight: SharedValue<number>; onHeight: (height: number) => void; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: settledPage.value === index ? 0 : Math.max(0, scrollY.value - headerHeight.value) }],
  }));
  return (
    <ReAnimated.View style={[{ width, alignSelf: 'flex-start' }, style]}>
      <View onLayout={(event) => onHeight(event.nativeEvent.layout.height)} style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.xs }}>
        {/* Rows are page-wide: see PressDragGuardContext. */}
        <PressDragGuardContext.Provider value>{children}</PressDragGuardContext.Provider>
      </View>
    </ReAnimated.View>
  );
}

// Sticky category tabs. The indicator tracks the pager's offset and blends
// between category colours; the end button opens every category at once.
function CategoryTabs({ theme, pages, activeIndex, pagerX, pageWidth, onSelect, onOpenAll }: { theme: Theme; pages: GearPage[]; activeIndex: number; pagerX: SharedValue<number>; pageWidth: SharedValue<number>; onSelect: (index: number) => void; onOpenAll: () => void }) {
  const { t } = useI18n();
  const scrollRef = React.useRef<ScrollView>(null);
  const layouts = React.useRef<{ x: number; width: number }[]>([]);
  const tabLayouts = useSharedValue<{ x: number; width: number }[]>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const colors = pages.map((page) => page.color);
  const indicatorStyle = useAnimatedStyle(() => {
    const list = tabLayouts.value;
    const count = Math.min(list.length, colors.length);
    if (!count || pageWidth.value <= 0) return { opacity: 0 };
    const position = Math.min(Math.max(pagerX.value / pageWidth.value, 0), count - 1);
    const from = Math.floor(position);
    const to = Math.min(count - 1, from + 1);
    const progress = position - from;
    const a = list[from];
    const b = list[to];
    if (!a || !b) return { opacity: 0 };
    return {
      opacity: 1,
      left: a.x + (b.x - a.x) * progress,
      width: a.width + (b.width - a.width) * progress,
      backgroundColor: count > 1 ? interpolateColor(position, colors.slice(0, count).map((_, i) => i), colors.slice(0, count)) : colors[0],
    };
  });
  React.useEffect(() => {
    layouts.current = layouts.current.slice(0, pages.length);
    tabLayouts.value = [...layouts.current];
  }, [pages, tabLayouts]);
  React.useEffect(() => {
    const tab = layouts.current[activeIndex];
    if (!tab || !viewportWidth) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, tab.x + tab.width / 2 - viewportWidth / 2), animated: true });
  }, [activeIndex, viewportWidth]);
  return (
    <View style={{ height: TAB_BAR_HEIGHT, backgroundColor: theme.groupedBg }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        contentContainerStyle={{ paddingLeft: layout.pagePadding, paddingRight: TAB_END_WIDTH, gap: space.lg }}
      >
        {pages.map((page, index) => (
          <Press
            key={page.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: index === activeIndex }}
            onPress={() => onSelect(index)}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              layouts.current[index] = { x, width };
              tabLayouts.value = [...layouts.current];
            }}
            style={{ height: TAB_BAR_HEIGHT, justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={[type.cardTitle, { color: index === activeIndex ? theme.text : theme.text3 }]}>{page.tab}</Text>
          </Press>
        ))}
        <ReAnimated.View pointerEvents="none" style={[{ position: 'absolute', bottom: space.xxs, height: 3, borderRadius: radius.pill }, indicatorStyle]} />
      </ScrollView>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: TAB_END_WIDTH, alignItems: 'flex-end', justifyContent: 'center' }}>
        <LinearGradient pointerEvents="none" colors={[`${theme.groupedBg}00`, theme.groupedBg]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 0 }} style={StyleSheet.absoluteFill} />
        <Press accessibilityRole="button" accessibilityLabel={t('gear.itemList.allCategories')} onPress={onOpenAll} style={[headerButtonStyle, { marginRight: space.xxs }]}>
          <Icon name="grid" color={theme.text2} size={20} strokeWidth={2} />
        </Press>
      </View>
    </View>
  );
}

// 全部分类: every page as a tile with its count, weight share and weight.
function CategoryJumpSheet({ theme, visible, pages, pageItems, activeIndex, weightUnit, weightShare, onClose, onSelect }: { theme: Theme; visible: boolean; pages: GearPage[]; pageItems: GearItem[][]; activeIndex: number; weightUnit: WeightUnit; weightShare: (weight: number) => number; onClose: () => void; onSelect: (index: number) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  if (!visible) return null;
  const tileWidth = (width - space.md * 2 - space.sm) / 2;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, justifyContent: 'flex-end' }]}>
      <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
      <View style={{ maxHeight: '78%', paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.md), borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, backgroundColor: theme.groupedBg }}>
        <View style={{ alignSelf: 'center', width: space.xxl, height: space.xxs, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.45 }} />
        <View style={{ minHeight: layout.topBarHeight + space.sm, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('gear.itemList.allCategories')}</Text>
          <Text style={[type.caption, { flex: 1, color: theme.text2 }]}>{t('gear.itemList.allCategoriesSummary', { cats: pages.length - 1, count: pageItems[0]?.length || 0 })}</Text>
          <AppIconButton theme={theme} name="close" onPress={onClose} size={36} noShadow />
        </View>
        <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.xs, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {pages.map((page, index) => {
            const list = pageItems[index] || [];
            const weight = list.reduce((sum, item) => sum + itemWeight(item), 0);
            return (
              <Press
                key={page.key}
                accessibilityRole="button"
                accessibilityState={{ selected: index === activeIndex }}
                onPress={() => onSelect(index)}
                style={{ width: tileWidth, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, borderWidth: 1.5, borderColor: index === activeIndex ? theme.accent : 'transparent', backgroundColor: theme.featureSurface }}
              >
                <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{page.id == null ? t('gear.itemList.allGear') : page.name}</Text>
                <View style={{ marginTop: space.xs, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.xs }}>
                  <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, color: theme.text2 }]}>{t('gear.itemList.tileCount', { count: list.length, pct: weightShare(weight) })}</Text>
                  <Text numberOfLines={1} style={[type.metric, { fontVariant: ['tabular-nums'], color: theme.text }]}>{fmtWeight(weight, weightUnit)}</Text>
                </View>
              </Press>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// Floating capsule of the bottom bar. `primary` marks the page's main action.
function BottomControl({ theme, icon, leading, label, onPress, primary = false, style }: { theme: Theme; icon?: IconName; leading?: React.ReactNode; label: string; onPress: (event: GestureResponderEvent) => void; primary?: boolean; style?: object }) {
  const color = primary ? '#FFFFFF' : theme.text;
  return (
    <Press onPress={onPress} opacityTo={1} style={[{ height: PILL_HEIGHT, paddingHorizontal: space.xl, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: primary ? theme.accent : theme.controlSurface }, style]}>
      {leading ?? (icon ? <Icon name={icon} color={color} size={19} strokeWidth={2.1} /> : null)}
      <Text numberOfLines={1} style={[type.cardTitle, { color }]}>{label}</Text>
    </Press>
  );
}

function MenuCaption({ theme, text, spaced = false }: { theme: Theme; text: string; spaced?: boolean }) {
  return <Text style={[type.eyebrow, { paddingHorizontal: space.xl, paddingTop: spaced ? space.lg : space.xxs, paddingBottom: space.xs, color: theme.text2 }]}>{text}</Text>;
}

function MenuRow({ theme, icon, label, onPress, selected = false, trailing }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean; trailing?: React.ReactNode }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ minHeight: MENU_ROW_HEIGHT, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: space.xl, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={21} strokeWidth={1.9} /></View>
      <Text numberOfLines={1} style={[type.body, { flex: 1, marginLeft: space.md, color: theme.text }]}>{label}</Text>
      {trailing || (selected ? <Icon name="check" color={theme.accent} size={17} strokeWidth={2.2} /> : null)}
    </Press>
  );
}

function CompactMenuRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ height: COMPACT_ROW_HEIGHT, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: space.xl, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={19} strokeWidth={1.8} /></View>
      <Text style={[type.body, { marginLeft: space.sm, color: theme.text }]}>{label}</Text>
      {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /></View> : null}
    </Press>
  );
}

function DisplaySettingRow({ theme, label, value, onChange, last }: { theme: Theme; label: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  // Indented to line up with the MenuRow labels above.
  return (
    <View style={{ minHeight: MENU_ROW_HEIGHT, paddingLeft: space.xl * 2 + space.md, paddingRight: space.xl, flexDirection: 'row', alignItems: 'center', borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}>
      <Text style={[type.small, { flex: 1, color: theme.text }]}>{label}</Text>
      <View style={{ width: 42, height: 28, marginLeft: space.xs, alignItems: 'center', justifyContent: 'center' }}>
        <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.hairline, true: theme.accent }} thumbColor="#FFFFFF" style={{ transform: [{ scale: 0.78 }] }} />
      </View>
    </View>
  );
}

function FloatingMenu({ theme, visible, top, width, onClose, children }: { theme: Theme; visible: boolean; top: number; width: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      positionStyle={{ position: 'absolute', top, right: space.sm, width, borderRadius: radius.feature, overflow: 'hidden', boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)' }}
    >
      <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={76}>
        <View style={{ paddingVertical: space.sm, backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)' }}>{children}</View>
      </Glass>
    </GearMenuTransition>
  );
}

function CompactChoiceMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement="bottom"
      backdropColor="transparent"
      positionStyle={{
        position: 'absolute',
        right: layout.pagePadding,
        // Just above the bottom pills.
        bottom: Math.max(insets.bottom, space.md) + space.xxs + PILL_HEIGHT + space.sm,
        width: 210,
        borderRadius: radius.feature,
        boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)',
      }}
    >
      <Glass solidOnAndroid theme={theme} radius={radius.feature} intensity={78}>
        <View style={{ paddingTop: space.sm, paddingBottom: space.xs, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={[type.eyebrow, { paddingHorizontal: space.xl, paddingBottom: space.xxs, color: theme.text2 }]}>{title}</Text>
          {children}
        </View>
      </Glass>
    </GearMenuTransition>
  );
}
