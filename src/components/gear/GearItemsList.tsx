// GearItemsList.tsx — “我的装备 / 查看全部” pushed page.
//
// The single-column cards borrow the calm, rounded rhythm of the reference
// while sharing the floating chrome and metadata language of the new gear and
// set detail pages.
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReAnimated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { JapaneseYen, Package, Tag, Weight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { GearCat, GearItem, WeightUnit, fmtWeight, itemPrice, itemWeight } from '../../data/gear';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { Glass } from '../Glass';
import { AppHeaderSearch, AppIconButton, DetailPage } from '../../design-system';
import { usePersistedSort } from './usePersistedSort';
import type { GearListSortMode } from './usePersistedSort';
import { GearDeleteDialog } from './GearDeleteDialog';

const SORT_STORAGE_KEY = '@kaipa/gear/items-sort-v1';
const DISPLAY_SETTINGS_KEY = '@kaipa/gear/items-display-v1';
type LayoutMode = 'list' | 'grid';
type ItemDisplaySettings = { images: boolean; weight: boolean; value: boolean };
type GearPickerConfig = {
  selectedNames: Set<string>;
  onDone: (selectedNames: Set<string>) => void;
};

function GearItemsListView({
  theme,
  items,
  catMap,
  weightUnit,
  onBack,
  onOpenItem,
  onAdd,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onDeleteItems,
  picker,
}: {
  theme: Theme;
  items: GearItem[];
  catMap: Record<string, GearCat>;
  weightUnit: WeightUnit;
  onBack: () => void;
  onOpenItem: (item: GearItem) => void;
  onAdd: () => void;
  onAddCategory: () => void;
  onEditCategory: (cat: GearCat) => void;
  onDeleteCategory: (cat: GearCat) => void;
  onDeleteItems: (ids: number[]) => void;
  picker?: GearPickerConfig;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>('list');
  const [category, setCategory] = useState<string | null>(null);
  const [displaySettings, setDisplaySettings] = useState<ItemDisplaySettings>({ images: true, weight: true, value: true });
  const displayProgress = useSharedValue(0);
  const [sort, setSort] = usePersistedSort(SORT_STORAGE_KEY);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const pickerMode = !!picker;
  const effectiveSelectMode = pickerMode || selectMode;
  const [pickerSelectedNames, setPickerSelectedNames] = useState<Set<string>>(() => new Set(picker?.selectedNames || []));

  const moreMenuStyle = useAnimatedStyle(() => ({
    height: interpolate(displayProgress.value, [0, 1], [373, 543]),
  }));
  const displayPanelStyle = useAnimatedStyle(() => ({
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
  const hasUncategorized = useMemo(() => items.some((item) => !catMap[item.cat]), [catMap, items]);

  React.useEffect(() => {
    if (category && category !== 'uncat' && !catMap[category]) setCategory(null);
  }, [catMap, category]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const next = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (category && item.cat !== category) return false;
        const catName = catMap[item.cat]?.name || t('gear.uncategorized');
        return !q || item.name.toLocaleLowerCase().includes(q) || catName.toLocaleLowerCase().includes(q) || item.note?.toLocaleLowerCase().includes(q);
      });
    if (sort === 'weight') next.sort((a, b) => itemWeight(b.item) - itemWeight(a.item));
    else if (sort === 'value') next.sort((a, b) => itemPrice(b.item) - itemPrice(a.item));
    else if (sort === 'name') next.sort((a, b) => a.item.name.localeCompare(b.item.name, 'zh-CN'));
    else next.sort((a, b) => (b.item.id || b.index) - (a.item.id || a.index));
    return next.map(({ item }) => item);
  }, [catMap, category, items, query, sort, t]);

  const totalWeight = items.reduce((sum, item) => sum + itemWeight(item), 0);
  const itemColumns = [rows.filter((_, index) => index % 2 === 0), rows.filter((_, index) => index % 2 === 1)];
  const gridCardWidth = (width - 48 - 12) / 2;
  const totalValue = items.reduce((sum, item) => sum + itemPrice(item), 0);
  const selectableIds = rows.map((item) => item.id).filter((id): id is number => id != null);
  const selectableNames = rows.map((item) => item.name);
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
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
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

  return (
    <DetailPage
      theme={theme}
      onBack={picker ? finishPicker : selectMode ? exitSelect : onBack}
      backgroundColor={theme.groupedBg}
      flatChrome
      onContentTouchStart={searchOpen ? closeSearch : undefined}
      right={pickerMode ? (
        <AppHeaderSearch
          theme={theme}
          open={searchOpen}
          value={query}
          placeholder={t('gear.search.items')}
          onChangeText={setQuery}
          onClose={closeSearch}
          actions={(
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AppIconButton theme={theme} name="filter" onPress={() => setFilterOpen(true)} noShadow />
              <AppIconButton theme={theme} name="search" onPress={() => setSearchOpen(true)} noShadow />
              <AppIconButton theme={theme} name="checkAll" onPress={toggleAll} active={allSelected} noShadow />
            </View>
          )}
        />
      ) : selectMode ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AppIconButton theme={theme} name="checkAll" onPress={toggleAll} active={allSelected} noShadow />
          <AppIconButton theme={theme} name="close" onPress={exitSelect} noShadow />
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
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AppIconButton theme={theme} name="filter" onPress={() => setFilterOpen(true)} noShadow />
              <AppIconButton theme={theme} name="search" onPress={() => setSearchOpen(true)} noShadow />
              <AppIconButton theme={theme} name="more" onPress={() => { setDisplayExpanded(false); displayProgress.value = 0; setMoreOpen(true); }} noShadow />
            </View>
          )}
        />
      )}
      overlay={(
        <>
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 24, paddingBottom: Math.max(insets.bottom, 14) + 4, flexDirection: 'row', justifyContent: 'space-between' }}>
              {picker ? (
                <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
                  <BottomControl theme={theme} icon="arrowDown" label={sortLabel} onPress={() => setSortOpen(true)} minWidth={122} />
                  <Press onPress={finishPicker} style={{ flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.accent }}>
                    <Icon name="check" color="#FFFFFF" size={18} strokeWidth={2.4} />
                    <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.setEditor.pickerDone', { count: pickerSelectedNames.size })}</Text>
                  </Press>
                </View>
              ) : selectMode ? (
                <Press onPress={selectedIds.size ? confirmDelete : undefined} style={{ flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size ? theme.danger : (theme.dark ? '#2C2C2E' : '#FFFFFF') }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: selectedIds.size ? '#FFFFFF' : theme.text3 }}>{selectedIds.size ? t('gear.select.deleteConfirm', { count: selectedIds.size }) : t('gear.select.deletePrompt')}</Text>
                </Press>
              ) : (
                <>
                  <BottomControl theme={theme} icon="plus" label={t('gear.itemList.newItem')} onPress={onAdd} minWidth={126} />
                  <BottomControl theme={theme} icon="arrowDown" label={sortLabel} onPress={() => setSortOpen(true)} minWidth={150} />
                </>
              )}
            </View>
          </View>

          <FloatingMenu theme={theme} visible={moreOpen} top={insets.top + 66} width={Math.min(232, width - 28)} animatedStyle={moreMenuStyle} onClose={closeMore}>
            <MenuCaption theme={theme} text={t('gear.itemList.manage')} />
            <MenuRow theme={theme} icon="checkAll" label={t('gear.itemList.batchManage')} onPress={() => closeMoreThen(beginSelect)} />
            <MenuRow theme={theme} icon="gearSettings" label={t('gear.category.manage')} onPress={() => closeMoreThen(() => setCategoryManagerOpen(true))} />
            <MenuCaption theme={theme} text={t('gear.setList.display')} spaced />
            <MenuRow theme={theme} icon="grid" label={t('gear.setList.grid')} selected={layout === 'grid'} onPress={() => closeMoreThen(() => setLayout('grid'))} />
            <MenuRow theme={theme} icon="list" label={t('gear.setList.list')} selected={layout === 'list'} onPress={() => closeMoreThen(() => setLayout('list'))} />
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
            <ReAnimated.View pointerEvents={displayExpanded ? 'auto' : 'none'} style={displayPanelStyle}>
              <View style={{ marginTop: -2, paddingBottom: 4 }}>
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayImages')} value={displaySettings.images} onChange={(images) => updateDisplaySettings({ images })} />
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayWeight')} value={displaySettings.weight} onChange={(weight) => updateDisplaySettings({ weight })} />
                <DisplaySettingRow theme={theme} label={t('gear.setDetail.displayValue')} value={displaySettings.value} onChange={(value) => updateDisplaySettings({ value })} last />
              </View>
            </ReAnimated.View>
          </FloatingMenu>

          <CompactFilterMenu theme={theme} visible={filterOpen} title={t('gear.itemList.category')} onClose={() => setFilterOpen(false)}>
            <ChoiceRow theme={theme} label={t('gear.itemList.all')} selected={!category} color={theme.text3} onPress={() => { setCategory(null); setFilterOpen(false); }} />
            {categories.map((cat) => (
              <ChoiceRow key={cat.id} theme={theme} label={cat.name} selected={category === cat.id} color={cat.color} onPress={() => { setCategory(cat.id); setFilterOpen(false); }} />
            ))}
            {hasUncategorized ? <ChoiceRow theme={theme} label={t('gear.uncategorized')} selected={category === 'uncat'} color={theme.text3} onPress={() => { setCategory('uncat'); setFilterOpen(false); }} /> : null}
          </CompactFilterMenu>

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
      <View style={{ paddingHorizontal: 24 }}>
        <View style={{ marginTop: 10, marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 27, fontWeight: '800', letterSpacing: -0.7, color: theme.text }}>{picker ? t('gear.setEditor.itemsTitle') : selectMode ? t('gear.select.title', { count: selectedIds.size }) : t('gear.home.myGear')}</Text>
              <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text3 }}>{items.length} {t('gear.unit.items')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 15 }}>
              <SummaryPill theme={theme} icon="weight" label={t('gear.stat.totalWeight')} value={fmtWeight(totalWeight, weightUnit, true)} />
              <SummaryPill theme={theme} icon="value" label={t('gear.stat.totalValue')} value={`¥ ${Math.round(totalValue).toLocaleString('en-US')}`} />
            </View>
        </View>

        {rows.length && layout === 'grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            {itemColumns.map((column, columnIndex) => (
              <View key={columnIndex} style={{ width: gridCardWidth, gap: 14 }}>
                {column.map((item) => (
                  <ItemGridCard
                    key={item.id || item.name}
                    theme={theme}
                    item={item}
                    cat={catMap[item.cat]}
                    weightUnit={weightUnit}
                    width={gridCardWidth}
                    selectMode={effectiveSelectMode}
                    selected={picker ? pickerSelectedNames.has(item.name) : item.id != null && selectedIds.has(item.id)}
                    showImage={displaySettings.images}
                    showWeight={displaySettings.weight}
                    showValue={displaySettings.value}
                    onPress={() => picker ? togglePickerItem(item.name) : item.id != null && selectMode ? toggleSelected(item.id) : onOpenItem(item)}
                    onLongPress={!picker && item.id != null ? () => enterSelect(item.id!) : undefined}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : rows.length ? (
          <View style={{ gap: 12 }}>
            {rows.map((item) => (
              <ItemCard
                key={item.id || item.name}
                theme={theme}
                item={item}
                cat={catMap[item.cat]}
                weightUnit={weightUnit}
                selectMode={effectiveSelectMode}
                selected={picker ? pickerSelectedNames.has(item.name) : item.id != null && selectedIds.has(item.id)}
                showImage={displaySettings.images}
                showWeight={displaySettings.weight}
                showValue={displaySettings.value}
                onPress={() => picker ? togglePickerItem(item.name) : item.id != null && selectMode ? toggleSelected(item.id) : onOpenItem(item)}
                onLongPress={!picker && item.id != null ? () => enterSelect(item.id!) : undefined}
              />
            ))}
          </View>
        ) : (
          <View style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <View style={{ width: 66, height: 66, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}><Package color={theme.accent} size={28} strokeWidth={1.5} /></View>
            <Text style={{ fontSize: 15, color: theme.text2 }}>{t('gear.empty.noItems')}</Text>
          </View>
        )}
      </View>
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
        <View style={{ maxHeight: '78%', paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16), borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: theme.dark ? '#1C1C1E' : '#F4F4F5' }}>
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, opacity: 0.45 }} />
          <View style={{ height: 62, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: theme.text }}>{t('gear.category.manage')}</Text>
            <AppIconButton theme={theme} name="close" onPress={onClose} size={36} noShadow />
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 10, gap: 8 }}>
            {categories.map((cat) => {
              const count = counts.get(cat.id) || 0;
              return (
                <Press key={cat.id} onPress={() => onEdit(cat)} style={{ minHeight: 58, paddingHorizontal: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
                  <View style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: cat.color }} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text }}>{cat.name}</Text>
                    <Text style={{ marginTop: 3, fontSize: 11.5, color: theme.text3 }}>{count} {t('gear.unit.items')}</Text>
                  </View>
                  <Press onPress={(event) => { event.stopPropagation(); confirmDelete(cat); }} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trash" color={theme.danger} size={17} strokeWidth={1.9} />
                  </Press>
                </Press>
              );
            })}
          </ScrollView>
          <View style={{ paddingHorizontal: 18, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}>
            <Press onPress={onAdd} style={{ height: 50, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.accent }}>
              <Icon name="plus" color="#FFFFFF" size={17} strokeWidth={2.3} />
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' }}>{t('gear.category.add')}</Text>
            </Press>
          </View>
        </View>
      </View>
  );
}

function ItemCard({ theme, item, cat, weightUnit, onPress, onLongPress, selectMode, selected, showImage, showWeight, showValue }: { theme: Theme; item: GearItem; cat?: GearCat; weightUnit: WeightUnit; onPress: () => void; onLongPress?: () => void; selectMode: boolean; selected: boolean; showImage: boolean; showWeight: boolean; showValue: boolean }) {
  const { t } = useI18n();
  const ignorePressAfterLongPress = React.useRef(false);
  const photo = item.photos?.[0];
  const category = cat?.name || t('gear.uncategorized');
  const accent = cat?.color || theme.accent;
  const weight = fmtWeight(itemWeight(item), weightUnit);
  const value = `¥${Math.round(itemPrice(item)).toLocaleString('en-US')}`;
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
  return (
    <Press onPress={handlePress} onLongPress={handleLongPress} style={{ minHeight: showImage ? 112 : 88, borderRadius: 24, padding: 14, flexDirection: 'row', alignItems: 'center', gap: showImage ? 15 : 0, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      {showImage ? <View style={{ width: 84, height: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)' }}>
        <Package color={accent} size={25} strokeWidth={1.6} opacity={0.6} />
        {photo ? <Image source={{ uri: photo }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
      </View> : null}
      <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: theme.text }}>{item.name}</Text>
        <View accessible accessibilityLabel={`${category}, ${weight}, ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <View style={{ flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Tag color={accent} size={15} strokeWidth={1.8} />
            <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontSize: 11.5, color: theme.text2 }}>{category}</Text>
          </View>
          {showWeight ? <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Weight color={theme.text2} size={15} strokeWidth={1.8} />
            <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{weight}</Text>
          </View> : null}
          {showValue ? <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <JapaneseYen color={theme.text2} size={15} strokeWidth={1.8} />
            <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2 }}>{value}</Text>
          </View> : null}
        </View>
      </View>
      {selectMode ? (
        <View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? theme.accent : theme.text3, backgroundColor: selected ? theme.accent : 'transparent' }}>
          {selected ? <Icon name="check" color="#FFFFFF" size={16} strokeWidth={2.4} /> : null}
        </View>
      ) : null}
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} /> : null}
    </Press>
  );
}


function ItemGridCard({ theme, item, cat, weightUnit, width, onPress, onLongPress, selectMode, selected, showImage, showWeight, showValue }: { theme: Theme; item: GearItem; cat?: GearCat; weightUnit: WeightUnit; width: number; onPress: () => void; onLongPress?: () => void; selectMode: boolean; selected: boolean; showImage: boolean; showWeight: boolean; showValue: boolean }) {
  const { t } = useI18n();
  const ignorePressAfterLongPress = React.useRef(false);
  const photo = item.photos?.[0];
  const category = cat?.name || t('gear.uncategorized');
  const accent = cat?.color || theme.accent;
  const weight = fmtWeight(itemWeight(item), weightUnit, true);
  const value = `¥${Math.round(itemPrice(item)).toLocaleString('en-US')}`;
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
  return (
    <Press onPress={handlePress} onLongPress={handleLongPress} style={{ width, minHeight: showImage ? 246 : 164, borderRadius: 24, padding: 14, backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      {showImage ? (
        <View style={{ height: Math.max(116, width - 28), borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)' }}>
          <Package color={accent} size={28} strokeWidth={1.6} opacity={0.6} />
          {photo ? <Image source={{ uri: photo }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : null}
        </View>
      ) : null}
      <View style={{ marginTop: showImage ? 14 : 0, gap: 10 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 21, fontWeight: '800', color: theme.text }}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Tag color={accent} size={14} strokeWidth={1.8} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: theme.text2 }}>{category}</Text>
        </View>
        {(showWeight || showValue) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 7, paddingTop: 1 }}>
            {showWeight ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Weight color={theme.text3} size={13} strokeWidth={1.8} />
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>{weight}</Text>
              </View>
            ) : null}
            {showValue ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <JapaneseYen color={theme.text3} size={13} strokeWidth={1.8} />
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: theme.text2 }}>{value}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {selectMode ? (
        <View style={{ position: 'absolute', top: 10, right: 10, width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? theme.accent : '#FFFFFF', backgroundColor: selected ? theme.accent : 'rgba(0,0,0,0.22)' }}>
          {selected ? <Icon name="check" color="#FFFFFF" size={16} strokeWidth={2.4} /> : null}
        </View>
      ) : null}
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} /> : null}
    </Press>
  );
}

function SummaryPill({ theme, icon, label, value }: { theme: Theme; icon: 'weight' | 'value'; label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, height: 82, paddingHorizontal: 17, paddingVertical: 13, borderRadius: 22, justifyContent: 'space-between', backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon === 'weight' ? <Weight color={theme.text3} size={15} /> : <JapaneseYen color={theme.text3} size={15} />}
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text2 }}>{label}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: MONO, fontSize: 20, fontWeight: '800', letterSpacing: -0.45, color: theme.text }}>{value}</Text>
    </View>
  );
}

function BottomControl({ theme, icon, label, onPress, minWidth }: { theme: Theme; icon: IconName; label: string; onPress: () => void; minWidth: number }) {
  return (
    <Press onPress={onPress} style={{ height: 52, minWidth, paddingHorizontal: 22, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: theme.dark ? '#2C2C2E' : '#FFFFFF' }}>
      <Icon name={icon} color={theme.text} size={19} strokeWidth={2.1} />
      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{label}</Text>
    </Press>
  );
}

function MenuCaption({ theme, text, spaced = false }: { theme: Theme; text: string; spaced?: boolean }) {
  return <Text style={{ paddingHorizontal: 24, paddingTop: spaced ? 20 : 4, paddingBottom: 7, fontSize: 12, fontWeight: '600', color: theme.text2 }}>{text}</Text>;
}

function MenuRow({ theme, icon, label, onPress, selected = false, trailing }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean; trailing?: React.ReactNode }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ minHeight: 56, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 28, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={21} strokeWidth={1.9} /></View>
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 18, fontSize: 15, color: theme.text }}>{label}</Text>
      {trailing || (selected ? <Icon name="check" color={theme.accent} size={17} strokeWidth={2.2} /> : null)}
    </Press>
  );
}

function CompactMenuRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 25, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={19} strokeWidth={1.8} /></View>
      <Text style={{ marginLeft: 13, fontSize: 14.5, color: theme.text }}>{label}</Text>
      {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /></View> : null}
    </Press>
  );
}

function ChoiceRow({ theme, label, selected, color, onPress }: { theme: Theme; label: string; selected: boolean; color: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 15, fontSize: 14.5, color: theme.text }}>{label}</Text>
      {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.2} /> : null}
    </Press>
  );
}

function DisplaySettingRow({ theme, label, value, onChange, last }: { theme: Theme; label: string; value: boolean; onChange: (value: boolean) => void; last?: boolean }) {
  return (
    <View style={{ minHeight: 56, paddingLeft: 70, paddingRight: 24, flexDirection: 'row', alignItems: 'center', borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}>
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 18, color: theme.text }}>{label}</Text>
      <View style={{ width: 42, height: 28, marginLeft: 6, alignItems: 'center', justifyContent: 'center' }}>
        <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.hairline, true: theme.accent }} thumbColor="#FFFFFF" style={{ transform: [{ scale: 0.78 }] }} />
      </View>
    </View>
  );
}

function FloatingMenu({ theme, visible, top, width, animatedStyle, onClose, children }: { theme: Theme; visible: boolean; top: number; width: number; animatedStyle?: any; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.055)' }]} />
        <ReAnimated.View style={[{ position: 'absolute', top, right: 14, width, borderRadius: 26, overflow: 'hidden', boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)' }, animatedStyle]}>
          <Glass theme={theme} radius={26} intensity={76}>
            <View style={{ paddingVertical: 13, backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)' }}>{children}</View>
          </Glass>
        </ReAnimated.View>
      </View>
    </Modal>
  );
}

function CompactFilterMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', top: insets.top + 62, right: 68, width: 220, maxHeight: '72%', borderRadius: 24, boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)' }}>
          <Glass theme={theme} radius={24} intensity={78}>
            <View style={{ maxHeight: '100%', paddingTop: 12, paddingBottom: 10, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
              <Text style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 5, fontSize: 11.5, fontWeight: '600', color: theme.text2 }}>{title}</Text>
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>{children}</ScrollView>
            </View>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}

function CompactChoiceMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={{
            position: 'absolute',
            right: 22,
            bottom: Math.max(insets.bottom, 14) + 70,
            width: 210,
            borderRadius: 24,
            boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)',
          }}
        >
          <Glass theme={theme} radius={24} intensity={78}>
            <View style={{ paddingTop: 12, paddingBottom: 10, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.72)' }}>
              <Text style={{ paddingHorizontal: 24, paddingTop: 2, paddingBottom: 5, fontSize: 11.5, fontWeight: '600', color: theme.text2 }}>{title}</Text>
              {children}
            </View>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}
