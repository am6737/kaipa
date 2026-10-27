// GearSetsList.tsx — “我的清单 / 查看全部” pushed page.
//
// Rows follow the gear library (GearItemsList): no card or divider, only a
// press or selection tints them. Each row ends in a strip of the set's
// heaviest items so a list can be recognised without opening it.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { InteractionManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Search, type LucideIcon } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { GearCat, GearItem, GearSet, WeightUnit, fmtWeight, itemPrice, itemWeight } from '../../data/gear';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { Glass } from '../Glass';
import { AppHeaderSearch, DetailPage, layout, radius, space, type } from '../../design-system';
import { usePersistedSort } from './usePersistedSort';
import { GearMenuTransition } from './GearMenuTransition';
import { GearEmptyState } from './GearEmptyState';
import { formatItemValue } from './GearItemsList';

const SORT_STORAGE_KEY = '@kaipa/gear/sets-sort-v1';
const INITIAL_RENDER_COUNT = 8;
const STRIP_THUMB = 40;
const STRIP_MAX = 6;
function GearHeaderButton({ icon: IconComponent, onPress, label, color }: { icon: LucideIcon; onPress: () => void; label: string; color: string }) {
  return <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><IconComponent color={color} size={25} strokeWidth={2.2} /></Press>;
}
function GearHeaderIconButton({ theme, icon, onPress, label, active = false }: { theme: Theme; icon: IconName; onPress: () => void; label: string; active?: boolean }) {
  return <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} color={active ? theme.accent : theme.text} size={25} strokeWidth={2.2} /></Press>;
}

function setItems(set: GearSet, allItems: GearItem[]) {
  return allItems
    .filter((item) => set.items.includes(item.name))
    .map((item) => {
      const override = (item.id != null ? set.overrides?.[String(item.id)] : undefined) || set.overrides?.[item.name];
      return override ? { ...item, ...override } : item;
    });
}

export function GearSetsList({
  theme,
  sets,
  allItems,
  catMap,
  weightUnit,
  onBack,
  onOpenSet,
  onAdd,
  onOpenAssistant,
  onDeleteSets,
  pinnedSetIds,
  onSetPinned,
  picker,
}: {
  theme: Theme;
  sets: GearSet[];
  allItems: GearItem[];
  catMap?: Record<string, GearCat>;
  weightUnit: WeightUnit;
  onBack: () => void;
  onOpenSet: (set: GearSet) => void;
  onAdd: () => void;
  onOpenAssistant?: () => void;
  onDeleteSets: (ids: string[]) => void;
  pinnedSetIds: Set<string>;
  onSetPinned: (ids: string[], pinned: boolean) => void;
  picker?: {
    title: string;
    selectedIds: Set<string>;
    onDone: (selectedIds: Set<string>) => void;
  };
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistedSort(SORT_STORAGE_KEY);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const pickerMode = Boolean(picker);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(() => new Set(picker?.selectedIds || []));

  React.useEffect(() => {
    if (picker) setPickerSelectedIds(new Set(picker.selectedIds));
  }, [picker?.selectedIds]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const next = sets
      .map((set, index) => {
        const items = setItems(set, allItems);
        return {
          set,
          index,
          items,
          weight: items.reduce((sum, item) => sum + itemWeight(item), 0),
          value: items.reduce((sum, item) => sum + itemPrice(item), 0),
          cats: new Set(items.map((item) => item.cat)).size,
          pinned: pinnedSetIds.has(set.id),
        };
      })
      .filter(({ set }) => !q || set.name.toLocaleLowerCase().includes(q) || set.description?.toLocaleLowerCase().includes(q) || set.items.some((name) => name.toLocaleLowerCase().includes(q)));
    next.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'weight') return b.weight - a.weight;
      if (sort === 'value') return b.value - a.value;
      if (sort === 'name') return a.set.name.localeCompare(b.set.name, 'zh-CN');
      return b.index - a.index;
    });
    return next;
  }, [allItems, pinnedSetIds, query, sets, sort]);

  const [visibleRowCount, setVisibleRowCount] = useState(INITIAL_RENDER_COUNT);
  const [loadingCards, setLoadingCards] = useState(true);
  React.useEffect(() => {
    setVisibleRowCount(Math.min(INITIAL_RENDER_COUNT, rows.length));
  }, [rows]);
  React.useEffect(() => {
    if (visibleRowCount >= rows.length) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setVisibleRowCount((count) => Math.min(count + INITIAL_RENDER_COUNT, rows.length));
    });
    return () => task.cancel();
  }, [rows.length, visibleRowCount]);
  React.useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setLoadingCards(false));
    return () => task.cancel();
  }, []);

  const renderedRows = rows.slice(0, visibleRowCount);
  const pinnedRows = renderedRows.filter((row) => row.pinned);
  const otherRows = renderedRows.filter((row) => !row.pinned);
  const grouped = pinnedRows.length > 0 && otherRows.length > 0;
  const selectableSetIds = rows.map((row) => row.set.id);
  const allSelected = picker
    ? selectableSetIds.length > 0 && selectableSetIds.every((id) => pickerSelectedIds.has(id))
    : sets.length > 0 && sets.every((set) => selectedIds.has(set.id));
  const allSelectedPinned = selectedIds.size > 0 && [...selectedIds].every((id) => pinnedSetIds.has(id));
  const bottomControlBg = theme.controlSurface;
  const sortLabel = sort === 'created'
    ? t('gear.setList.created')
    : sort === 'weight'
      ? t('gear.setList.weight')
      : sort === 'value'
        ? t('gear.setList.value')
        : t('gear.setList.name');
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const enterSelect = (id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (picker) {
      setPickerSelectedIds((current) => {
        const next = new Set(current);
        selectableSetIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
        return next;
      });
      return;
    }
    setSelectedIds(allSelected ? new Set() : new Set(sets.map((set) => set.id)));
  };
  const togglePickerSet = (id: string) => {
    setPickerSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const finishPicker = () => picker?.onDone(new Set(pickerSelectedIds));
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
  };
  const confirmDelete = () => {
    if (!selectedIds.size) return;
    Alert.alert(
      t('gear.setSelect.deleteTitle'),
      t('gear.setSelect.deleteMessage', { count: selectedIds.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('gear.setSelect.deleteConfirm', { count: selectedIds.size }), style: 'destructive', onPress: () => { onDeleteSets([...selectedIds]); exitSelect(); } },
      ],
    );
  };
  const togglePinned = () => {
    if (!selectedIds.size) return;
    onSetPinned([...selectedIds], !allSelectedPinned);
    exitSelect();
  };

  return (
    <DetailPage
      theme={theme}
      onBack={picker ? finishPicker : selectMode ? exitSelect : onBack}
      backgroundColor={theme.featureSurface}
      flatChrome
      onContentTouchStart={searchOpen ? closeSearch : undefined}
      right={selectMode ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GearHeaderIconButton theme={theme} icon="checkAll" onPress={toggleAll} active={allSelected} label={t('common.selectAll')} />
          <GearHeaderIconButton theme={theme} icon="close" onPress={exitSelect} label={t('common.close')} />
        </View>
      ) : pickerMode ? (
        <AppHeaderSearch
          theme={theme}
          open={searchOpen}
          value={query}
          placeholder={t('gear.search.sets')}
          onChangeText={setQuery}
          onClose={closeSearch}
          actions={(
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GearHeaderButton icon={Search} onPress={() => setSearchOpen(true)} label={t('common.search')} color={theme.text} />
              <GearHeaderIconButton theme={theme} icon="checkAll" onPress={toggleAll} active={allSelected} label={t('common.selectAll')} />
            </View>
          )}
        />
      ) : (
        <AppHeaderSearch
          theme={theme}
          open={searchOpen}
          value={query}
          placeholder={t('gear.search.sets')}
          onChangeText={setQuery}
          onClose={closeSearch}
          actions={(
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GearHeaderButton icon={Search} onPress={() => setSearchOpen(true)} label={t('common.search')} color={theme.text} />
            </View>
          )}
        />
      )}
      overlay={(
        <>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 24, paddingBottom: Math.max(insets.bottom, 14) + 4, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent' }}>
              {selectMode ? (
                <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
                  <Press onPress={selectedIds.size ? togglePinned : undefined} style={{ flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bottomControlBg, boxShadow: theme.controlShadow }}>
                    <Icon name="pin" color={selectedIds.size ? theme.accent : theme.text3} size={18} strokeWidth={2} />
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: selectedIds.size ? theme.text : theme.text3 }}>{allSelectedPinned ? t('gear.setSelect.unpin') : t('gear.setSelect.pin')}</Text>
                  </Press>
                  <Press onPress={selectedIds.size ? confirmDelete : undefined} style={{ flex: 1.35, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size ? theme.danger : bottomControlBg, boxShadow: theme.controlShadow }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: selectedIds.size ? '#FFFFFF' : theme.text3 }}>{selectedIds.size ? t('gear.setSelect.deleteConfirm', { count: selectedIds.size }) : t('gear.setSelect.deletePrompt')}</Text>
                  </Press>
                </View>
              ) : pickerMode ? (
                <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
                  <Press onPress={() => setSortOpen(true)} opacityTo={1} style={{ height: 52, minWidth: 122, paddingHorizontal: 20, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bottomControlBg, boxShadow: theme.controlShadow }}>
                    <Icon name="arrowDown" color={theme.text} size={19} strokeWidth={2.1} />
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>{sortLabel}</Text>
                  </Press>
                  <Press onPress={finishPicker} style={{ flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.accent }}>
                    <Icon name="check" color="#FFFFFF" size={18} strokeWidth={2.4} />
                    <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.setEditor.pickerDone', { count: pickerSelectedIds.size })}</Text>
                  </Press>
                </View>
              ) : (
                <>
                  <Press onPress={onAdd} style={{ height: 52, minWidth: 126, paddingHorizontal: 24, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: theme.accent }}>
                    <Icon name="plus" color="#FFFFFF" size={19} strokeWidth={2.1} />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.setList.add')}</Text>
                  </Press>
                  <Press onPress={() => setSortOpen(true)} opacityTo={1} style={{ height: 52, minWidth: 150, paddingHorizontal: 22, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: bottomControlBg, boxShadow: theme.controlShadow }}>
                    <Icon name="arrowDown" color={theme.text} size={19} strokeWidth={2.1} />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{sortLabel}</Text>
                  </Press>
                </>
              )}
            </View>
          </View>
          <SetsSortMenu theme={theme} visible={sortOpen} title={t('gear.setList.sort')} onClose={() => setSortOpen(false)}>
            <SetsCompactMenuRow theme={theme} icon="clock" label={t('gear.setList.created')} selected={sort === 'created'} onPress={() => { setSort('created'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="arrowDown" label={t('gear.setList.weight')} selected={sort === 'weight'} onPress={() => { setSort('weight'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="arrowDown" label={t('gear.setList.value')} selected={sort === 'value'} onPress={() => { setSort('value'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="list" label={t('gear.setList.name')} selected={sort === 'name'} onPress={() => { setSort('name'); setSortOpen(false); }} />
          </SetsSortMenu>
        </>
      )}
    >
      <View style={{ paddingHorizontal: layout.pagePadding }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs, marginBottom: grouped ? 0 : space.xs }}>
          <Text numberOfLines={1} style={[type.pageTitle, { flexShrink: 1, color: theme.text }]}>{selectMode ? t('gear.setSelect.title', { count: selectedIds.size }) : picker?.title ?? t('gear.setList.gallery')}</Text>
          <Text numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text3 }]}>{query.trim() ? t('gear.setList.filteredCount', { count: rows.length, total: sets.length }) : `${sets.length} ${t('gear.unit.sets')}`}</Text>
        </View>

        {rows.length ? (
          <>
            {(grouped ? [
              { key: 'pinned', label: t('gear.setList.pinned'), rows: pinnedRows },
              { key: 'all', label: t('gear.setList.all'), rows: otherRows },
            ] : [{ key: 'all', label: null, rows: renderedRows }]).map((group) => (
              <View key={group.key}>
                {group.label ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingTop: space.lg, paddingBottom: space.xxs }}>
                    {group.key === 'pinned' ? <Icon name="pin" color={theme.text2} size={13} strokeWidth={2.1} /> : null}
                    <Text style={[type.eyebrow, { color: theme.text2 }]}>{group.label}</Text>
                  </View>
                ) : null}
                {group.rows.map((row) => (
                  <SetRow
                    key={row.set.id}
                    theme={theme}
                    row={row}
                    catMap={catMap}
                    weightUnit={weightUnit}
                    selectMode={pickerMode || selectMode}
                    selected={picker ? pickerSelectedIds.has(row.set.id) : selectedIds.has(row.set.id)}
                    loading={loadingCards}
                    onPress={() => picker ? togglePickerSet(row.set.id) : selectMode ? toggleSelected(row.set.id) : onOpenSet(row.set)}
                    onLongPress={() => { if (!picker) enterSelect(row.set.id); }}
                  />
                ))}
              </View>
            ))}
          </>
        ) : query.trim() ? (
          <GearEmptyState
            theme={theme}
            icon="search"
            title={t('gear.empty.noSets')}
            actionLabel={t('gear.empty.clearSetSearch')}
            actionIcon="close"
            onAction={closeSearch}
          />
        ) : (
          <GearEmptyState
            theme={theme}
            icon="layers"
            title={t('gear.empty.noSetsYet')}
            actionLabel={!picker && onOpenAssistant ? t('gear.empty.askAiSet') : undefined}
            actionIcon="send"
            onAction={!picker ? onOpenAssistant : undefined}
          />
        )}
      </View>
    </DetailPage>
  );
}

function SetsCompactMenuRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 25, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={19} strokeWidth={1.8} /></View>
      <Text style={{ marginLeft: 13, fontSize: 14.5, color: theme.text }}>{label}</Text>
      {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /></View> : null}
    </Press>
  );
}

function SetsSortMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <GearMenuTransition
      theme={theme}
      visible={visible}
      onClose={onClose}
      placement="bottom"
      backdropColor="transparent"
      positionStyle={{ position: 'absolute', right: 22, bottom: Math.max(insets.bottom, 14) + 70, width: 210, borderRadius: 24, boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)' }}
    >
      <Glass solidOnAndroid theme={theme} radius={24} intensity={78}>
        <View style={{ paddingTop: 12, paddingBottom: 10, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
          <Text style={{ paddingHorizontal: 24, paddingTop: 2, paddingBottom: 5, fontSize: 11.5, fontWeight: '600', color: theme.text2 }}>{title}</Text>
          {children}
        </View>
      </Glass>
    </GearMenuTransition>
  );
}

function SelectionMark({ theme, selected }: { theme: Theme; selected: boolean }) {
  return (
    <View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? theme.accent : theme.text3, backgroundColor: selected ? theme.accent : 'transparent' }}>
      {selected ? <Icon name="check" color="#FFFFFF" size={16} strokeWidth={2.4} /> : null}
    </View>
  );
}

function useLongPressGuard(onPress: () => void, onLongPress: () => void) {
  const ignorePressAfterLongPress = React.useRef(false);
  return {
    onLongPress: () => {
      ignorePressAfterLongPress.current = true;
      onLongPress();
      setTimeout(() => { ignorePressAfterLongPress.current = false; }, 700);
    },
    onPress: () => {
      if (ignorePressAfterLongPress.current) {
        ignorePressAfterLongPress.current = false;
        return;
      }
      onPress();
    },
  };
}

type SetRowData = {
  set: GearSet;
  items: GearItem[];
  weight: number;
  value: number;
  cats: number;
  pinned: boolean;
};

function SetRow({ theme, row, catMap, weightUnit, onPress, onLongPress, selectMode, selected, loading }: { theme: Theme; row: SetRowData; catMap?: Record<string, GearCat>; weightUnit: WeightUnit; onPress: () => void; onLongPress: () => void; selectMode: boolean; selected: boolean; loading: boolean }) {
  const { t } = useI18n();
  const handlers = useLongPressGuard(onPress, onLongPress);
  const shell = { marginHorizontal: -space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm + 2, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', gap: space.sm } as const;
  const heaviest = useMemo(() => [...row.items].sort((a, b) => itemWeight(b) - itemWeight(a)), [row.items]);
  if (loading) {
    return (
      <View style={shell}>
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={{ width: '58%', height: 15, borderRadius: radius.control / 2, backgroundColor: theme.fieldSurface }} />
          <View style={{ width: '32%', height: 11, borderRadius: radius.control / 2, backgroundColor: theme.fieldSurface }} />
          <View style={{ width: STRIP_THUMB * 4, height: STRIP_THUMB, marginTop: space.xxs, borderRadius: radius.control, backgroundColor: theme.fieldSurface }} />
        </View>
      </View>
    );
  }
  const empty = row.items.length === 0;
  const overflow = heaviest.length > STRIP_MAX;
  const shown = overflow ? heaviest.slice(0, STRIP_MAX - 1) : heaviest;
  const weight = fmtWeight(row.weight, weightUnit);
  const value = `¥${formatItemValue(row.value)}`;
  const counts = row.cats ? `${row.items.length} ${t('gear.unit.items')}  ${row.cats} ${t('gear.unit.cats')}` : `${row.items.length} ${t('gear.unit.items')}`;
  const description = row.set.description?.trim();
  return (
    <Pressable
      {...handlers}
      accessibilityRole="button"
      accessibilityState={selectMode ? { selected } : undefined}
      accessibilityLabel={[row.set.name, counts, empty ? null : weight, empty ? null : value].filter(Boolean).join(', ')}
      style={({ pressed }) => [shell, { backgroundColor: selected ? theme.accentSofter : pressed ? theme.fieldSurface : 'transparent' }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.cardTitle, { lineHeight: 20, color: theme.text }]}>{row.set.name}</Text>
        {description ? <Text numberOfLines={1} style={[type.caption, { marginTop: space.xxs, color: theme.text3 }]}>{description}</Text> : null}
        {/* Weight sits in the right column (like ItemRow); value and counts share one caption line. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md + 2, marginTop: space.xs }}>
          {empty ? null : <Text numberOfLines={1} style={[type.caption, { fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{value}</Text>}
          <Text numberOfLines={1} style={[type.caption, { flexShrink: 1, fontFamily: MONO, fontVariant: ['tabular-nums'], color: theme.text2 }]}>{counts}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.xs - 2, marginTop: space.sm }}>
          {empty ? (
            <View style={{ height: STRIP_THUMB, paddingHorizontal: space.sm, borderRadius: radius.control, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border, justifyContent: 'center' }}>
              <Text style={[type.caption, { color: theme.text2 }]}>{t('gear.empty.noItemsYet')}</Text>
            </View>
          ) : (
            <>
              {shown.map((item, index) => (
                <View key={`${item.id ?? item.name}-${index}`} style={[{ width: STRIP_THUMB, height: STRIP_THUMB, borderRadius: radius.control, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }, item.photos?.[0] ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline } : null]}>
                  <Package color={catMap?.[item.cat]?.color || theme.text3} size={15} strokeWidth={1.7} opacity={0.6} />
                  {item.photos?.[0] ? <Image source={{ uri: item.photos[0] }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
                </View>
              ))}
              {overflow ? (
                <View style={{ width: STRIP_THUMB, height: STRIP_THUMB, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                  <Text style={[type.caption, { fontFamily: MONO, fontWeight: '700', color: theme.text2 }]}>+{heaviest.length - shown.length}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
      {empty ? null : <Text numberOfLines={1} style={[type.metric, { flexShrink: 0, fontVariant: ['tabular-nums'], color: theme.text }]}>{weight}</Text>}
      {selectMode ? <SelectionMark theme={theme} selected={selected} /> : null}
    </Pressable>
  );
}
