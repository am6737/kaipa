// GearSetsList.tsx — “我的清单 / 查看全部” pushed page.
//
// The gallery borrows the tall, photographic two-column rhythm from the
// reference while keeping Kaipa's floating chrome, quiet surfaces and the
// weight/value vocabulary used by the redesigned gear detail pages.
import React, { useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, useWindowDimensions, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Weight, JapaneseYen } from 'lucide-react-native';
import { Theme, rgba } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { GearItem, GearSet, WeightUnit, fmtWeight, itemPrice, itemWeight } from '../../data/gear';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Press } from '../Press';
import { Glass } from '../Glass';
import { AppHeaderSearch, AppIconButton, DetailPage } from '../../design-system';
import { usePersistedSort } from './usePersistedSort';

type LayoutMode = 'grid' | 'list';
const SORT_STORAGE_KEY = '@kaipa/gear/sets-sort-v1';

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
  weightUnit,
  onBack,
  onOpenSet,
  onAdd,
  onDeleteSets,
  pinnedSetIds,
  onSetPinned,
}: {
  theme: Theme;
  sets: GearSet[];
  allItems: GearItem[];
  weightUnit: WeightUnit;
  onBack: () => void;
  onOpenSet: (set: GearSet) => void;
  onAdd: () => void;
  onDeleteSets: (ids: string[]) => void;
  pinnedSetIds: Set<string>;
  onSetPinned: (ids: string[], pinned: boolean) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>('grid');
  const [query, setQuery] = useState('');
  const [sort, setSort] = usePersistedSort(SORT_STORAGE_KEY);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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
      .filter(({ set }) => !q || set.name.toLocaleLowerCase().includes(q) || set.items.some((name) => name.toLocaleLowerCase().includes(q)));
    next.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'weight') return b.weight - a.weight;
      if (sort === 'value') return b.value - a.value;
      if (sort === 'name') return a.set.name.localeCompare(b.set.name, 'zh-CN');
      return b.index - a.index;
    });
    return next;
  }, [allItems, pinnedSetIds, query, sets, sort]);

  const columns = [rows.filter((_, i) => i % 2 === 0), rows.filter((_, i) => i % 2 === 1)];
  const cardWidth = (width - 48) / 2;
  const allSelected = sets.length > 0 && sets.every((set) => selectedIds.has(set.id));
  const allSelectedPinned = selectedIds.size > 0 && [...selectedIds].every((id) => pinnedSetIds.has(id));
  const bottomControlBg = theme.controlSurface;
  const sortLabel = sort === 'created'
    ? t('gear.setList.created')
    : sort === 'weight'
      ? t('gear.setList.weight')
      : sort === 'value'
        ? t('gear.setList.value')
        : t('gear.setList.name');
  const runFromMenu = (action: () => void) => {
    setMoreOpen(false);
    setTimeout(action, 140);
  };
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
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(sets.map((set) => set.id)));
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
      onBack={selectMode ? exitSelect : onBack}
      backgroundColor={theme.groupedBg}
      flatChrome
      onContentTouchStart={searchOpen ? closeSearch : undefined}
      right={selectMode ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AppIconButton theme={theme} name="checkAll" onPress={toggleAll} active={allSelected} noShadow />
          <AppIconButton theme={theme} name="close" onPress={exitSelect} noShadow />
        </View>
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
              <AppIconButton theme={theme} name="search" onPress={() => setSearchOpen(true)} noShadow />
              <AppIconButton theme={theme} name="more" onPress={() => setMoreOpen(true)} noShadow />
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
                  <Press onPress={selectedIds.size ? togglePinned : undefined} style={{ flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bottomControlBg }}>
                    <Icon name="pin" color={selectedIds.size ? theme.accent : theme.text3} size={18} strokeWidth={2} />
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: selectedIds.size ? theme.text : theme.text3 }}>{allSelectedPinned ? t('gear.setSelect.unpin') : t('gear.setSelect.pin')}</Text>
                  </Press>
                  <Press onPress={selectedIds.size ? confirmDelete : undefined} style={{ flex: 1.35, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedIds.size ? theme.danger : bottomControlBg }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', color: selectedIds.size ? '#FFFFFF' : theme.text3 }}>{selectedIds.size ? t('gear.setSelect.deleteConfirm', { count: selectedIds.size }) : t('gear.setSelect.deletePrompt')}</Text>
                  </Press>
                </View>
              ) : (
                <>
                  <Press onPress={onAdd} style={{ height: 52, minWidth: 126, paddingHorizontal: 24, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: bottomControlBg }}>
                    <Icon name="plus" color={theme.text} size={19} strokeWidth={2.1} />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t('gear.setList.add')}</Text>
                  </Press>
                  <Press onPress={() => setSortOpen(true)} style={{ height: 52, minWidth: 150, paddingHorizontal: 22, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: bottomControlBg }}>
                    <Icon name="arrowDown" color={theme.text} size={19} strokeWidth={2.1} />
                    <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{sortLabel}</Text>
                  </Press>
                </>
              )}
            </View>
          </View>
          <SetsFloatingMenu theme={theme} visible={moreOpen} top={insets.top + 66} width={Math.min(216, width - 28)} onClose={() => setMoreOpen(false)}>
            <Text style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 7, fontSize: 12, fontWeight: '600', color: theme.text2 }}>{t('gear.setList.display')}</Text>
            <SetsMenuRow theme={theme} icon="grid" label={t('gear.setList.grid')} selected={layout === 'grid'} onPress={() => runFromMenu(() => setLayout('grid'))} />
            <SetsMenuRow theme={theme} icon="list" label={t('gear.setList.list')} selected={layout === 'list'} onPress={() => runFromMenu(() => setLayout('list'))} />
          </SetsFloatingMenu>
          <SetsSortMenu theme={theme} visible={sortOpen} title={t('gear.setList.sort')} onClose={() => setSortOpen(false)}>
            <SetsCompactMenuRow theme={theme} icon="clock" label={t('gear.setList.created')} selected={sort === 'created'} onPress={() => { setSort('created'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="arrowDown" label={t('gear.setList.weight')} selected={sort === 'weight'} onPress={() => { setSort('weight'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="arrowDown" label={t('gear.setList.value')} selected={sort === 'value'} onPress={() => { setSort('value'); setSortOpen(false); }} />
            <SetsCompactMenuRow theme={theme} icon="list" label={t('gear.setList.name')} selected={sort === 'name'} onPress={() => { setSort('name'); setSortOpen(false); }} />
          </SetsSortMenu>
        </>
      )}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 5, marginTop: 10, marginBottom: 20 }}>
            <Text style={{ fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: theme.text }}>{selectMode ? t('gear.setSelect.title', { count: selectedIds.size }) : t('gear.setList.gallery')}</Text>
            <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text3 }}>{sets.length} {t('gear.unit.sets')}</Text>
        </View>

        {rows.length && layout === 'grid' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            {columns.map((column, columnIndex) => (
              <View key={columnIndex} style={{ width: cardWidth, gap: 16 }}>
                {column.map((row, localIndex) => (
                  <SetGalleryCard
                    key={row.set.id}
                    theme={theme}
                    width={cardWidth}
                    tall={(localIndex + columnIndex) % 3 === 1}
                    row={row}
                    weightUnit={weightUnit}
                    selectMode={selectMode}
                    selected={selectedIds.has(row.set.id)}
                    onPress={() => selectMode ? toggleSelected(row.set.id) : onOpenSet(row.set)}
                    onLongPress={() => enterSelect(row.set.id)}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : rows.length ? (
          <View style={{ gap: 12 }}>
            {rows.map((row) => (
              <SetListCard key={row.set.id} theme={theme} row={row} weightUnit={weightUnit} selectMode={selectMode} selected={selectedIds.has(row.set.id)} onPress={() => selectMode ? toggleSelected(row.set.id) : onOpenSet(row.set)} onLongPress={() => enterSelect(row.set.id)} />
            ))}
          </View>
        ) : (
          <View style={{ minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentSofter }}><Package color={theme.accent} size={27} strokeWidth={1.5} /></View>
            <Text style={{ fontSize: 15, color: theme.text2 }}>{query ? t('gear.empty.noSets') : t('gear.empty.noSetsYet')}</Text>
          </View>
        )}
      </View>
    </DetailPage>
  );
}

function SetListCard({ theme, row, weightUnit, onPress, onLongPress, selectMode, selected }: { theme: Theme; row: GalleryRow; weightUnit: WeightUnit; onPress: () => void; onLongPress: () => void; selectMode: boolean; selected: boolean }) {
  const { t } = useI18n();
  const handlers = useLongPressGuard(onPress, onLongPress);
  return (
    <Press {...handlers} style={{ minHeight: 96, paddingHorizontal: 18, paddingVertical: 16, borderRadius: 22, justifyContent: 'space-between', backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: -0.25, color: theme.text }}>{row.set.name}</Text>
        {selectMode ? <SelectionMark theme={theme} selected={selected} /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{row.pinned ? <Icon name="pin" color={theme.accent} size={15} strokeWidth={2.1} /> : null}<View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }}><Text style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text2 }}>{row.items.length} {t('gear.unit.items')}</Text></View></View>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 15 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Package color={theme.text2} size={13} strokeWidth={1.7} /><Text style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text2 }}>{row.cats} {t('gear.unit.cats')}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}><Weight color={theme.text2} size={13} strokeWidth={1.7} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text2 }}>{fmtWeight(row.weight, weightUnit, true)}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 }}><JapaneseYen color={theme.text2} size={12.5} strokeWidth={1.7} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text2 }}>{Math.round(row.value)}</Text></View>
      </View>
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 22, borderWidth: 1.5, borderColor: theme.accent }]} /> : null}
    </Press>
  );
}

function SetsMenuRow({ theme, icon, label, onPress, selected = false }: { theme: Theme; icon: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Press onPress={onPress} scaleTo={0.985} style={{ height: 58, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 28, alignItems: 'center' }}><Icon name={icon} color={theme.text} size={22} strokeWidth={1.9} /></View>
      <Text style={{ marginLeft: 18, fontSize: 15, fontWeight: '400', color: theme.text }}>{label}</Text>
      {selected ? <View style={{ marginLeft: 'auto' }}><Icon name="check" color={theme.accent} size={17} strokeWidth={2.2} /></View> : null}
    </Press>
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

function SetsFloatingMenu({ theme, visible, top, width, onClose, children }: { theme: Theme; visible: boolean; top: number; width: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.055)' }]} />
        <View style={{ position: 'absolute', top, right: 14, width, borderRadius: 26, boxShadow: theme.dark ? '0px 18px 46px rgba(0,0,0,0.52)' : '0px 18px 46px rgba(0,0,0,0.18)' }}>
          <Glass theme={theme} radius={26} intensity={76}>
            <View style={{ backgroundColor: theme.dark ? 'rgba(32,32,35,0.58)' : 'rgba(255,255,255,0.64)', paddingVertical: 13 }}>{children}</View>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}

function SetsSortMenu({ theme, visible, title, onClose, children }: { theme: Theme; visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', right: 22, bottom: Math.max(insets.bottom, 14) + 70, width: 210, borderRadius: 24, boxShadow: theme.dark ? '0px 14px 38px rgba(0,0,0,0.50)' : '0px 14px 38px rgba(0,0,0,0.16)' }}>
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

type GalleryRow = {
  set: GearSet;
  items: GearItem[];
  weight: number;
  value: number;
  cats: number;
  pinned: boolean;
};

function SetGalleryCard({ theme, width, tall, row, weightUnit, onPress, onLongPress, selectMode, selected }: { theme: Theme; width: number; tall: boolean; row: GalleryRow; weightUnit: WeightUnit; onPress: () => void; onLongPress: () => void; selectMode: boolean; selected: boolean }) {
  const { t } = useI18n();
  const handlers = useLongPressGuard(onPress, onLongPress);
  const height = tall ? 236 : 204;
  const foreground = theme.text;
  const secondary = theme.text2;
  return (
    <Press {...handlers} style={{ width, height, padding: 16, borderRadius: 24, justifyContent: 'space-between', backgroundColor: theme.dark ? '#000000' : '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: row.pinned && !selectMode ? 'space-between' : 'flex-end' }}>
        {row.pinned && !selectMode ? <Icon name="pin" color={theme.accent} size={16} strokeWidth={2.1} /> : null}
        {selectMode ? <SelectionMark theme={theme} selected={selected} /> : <View style={{ paddingHorizontal: 9, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : '#F2F2F3' }}><Text style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: '700', color: theme.text }}>{row.items.length} {t('gear.unit.items')}</Text></View>}
      </View>
      <View>
        <Text numberOfLines={3} style={{ fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.45, color: foreground }}>{row.set.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 }}><Package color={secondary} size={12.5} strokeWidth={1.7} /><Text style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: secondary }}>{row.cats} {t('gear.unit.cats')}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 }}><Weight color={secondary} size={12.5} strokeWidth={1.7} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: secondary }}>{fmtWeight(row.weight, weightUnit, true)}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1, minWidth: 0 }}><JapaneseYen color={secondary} size={12} strokeWidth={1.7} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 10, fontWeight: '700', color: secondary }}>{Math.round(row.value)}</Text></View>
        </View>
      </View>
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: theme.accent }]} /> : null}
    </Press>
  );
}
