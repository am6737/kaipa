import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { GearCarryStatus, GearCat, GearItem, GearSet, WeightUnit } from '../../data/gear';
import { itemStatus, splitItemWeight, splitWeight } from '../../data/gear';
import type { JourneyPackingItem, JourneyPackingItemInput } from '../../data/journeyPacking';
import type { Poi } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { AppIconButton, layout, motion, radius, space, type } from '../../design-system';
import { refetchJourneyPacking, useJourneyPacking, type JourneyPackingController } from '../../hooks/useJourneyPacking';
import { supabase } from '../../lib/supabase';
import * as Crypto from 'expo-crypto';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { GearScreen } from '../../screens/GearScreen';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { ParticipantAvatar } from '../overlays/ParticipantAvatar';
import { GearItemsList } from '../gear/GearItemsList';
import { GearSetsList } from '../gear/GearSetsList';
import { usePinnedSets } from '../gear/usePinnedSets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type JourneyChecklistFilterMenuOption = {
  key: string;
  kind: 'mine' | 'companion';
  label: string;
  avatarUrl?: string;
  ready: number;
  total: number;
};

export type JourneyChecklistFilterMenuController = {
  activeKey: string;
  options: JourneyChecklistFilterMenuOption[];
  select: (key: string) => void;
};

function JourneyChecklistTabComponent({
  theme,
  journey,
  userId,
  sets,
  gearItems,
  categories,
  weightUnit,
  addActionRef,
  deleteActionRef,
  filterActionRef,
  filterMenuRef,
  filterMenuOpen = false,
  pickerProgress,
  onFilterStateChange,
  onFilterMenuOpenChange,
  selectionMode = false,
  selectedItemIds,
  onSelectedItemIdsChange,
  onCanEditChange,
  readOnly = false,
  preview,
}: {
  theme: Theme;
  journey: Poi;
  userId: string;
  sets: GearSet[];
  gearItems: GearItem[];
  categories: GearCat[];
  weightUnit: WeightUnit;
  addActionRef?: React.MutableRefObject<(() => void) | null>;
  deleteActionRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  filterActionRef?: React.MutableRefObject<(() => void) | null>;
  filterMenuRef?: React.MutableRefObject<JourneyChecklistFilterMenuController | null>;
  filterMenuOpen?: boolean;
  pickerProgress?: Animated.Value;
  onFilterStateChange?: (label: string, active: boolean) => void;
  onFilterMenuOpenChange?: (open: boolean, anchor?: { x: number; y: number; width: number; height: number }) => void;
  selectionMode?: boolean;
  selectedItemIds: Set<string>;
  onSelectedItemIdsChange: (ids: Set<string>) => void;
  onCanEditChange?: (canEdit: boolean) => void;
  readOnly?: boolean;
  preview?: { lists: Record<string, unknown>[]; items: Record<string, unknown>[] };
}) {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const controller = useJourneyPacking({ journey, userId, preview });
  const [selectedKey, setSelectedKey] = useState<string>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<'gear' | 'sets' | null>(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [guideGearCount, setGuideGearCount] = useState(0);
  const [importingGuideGear, setImportingGuideGear] = useState(false);
  const importingGuideGearRef = useRef(false);
  const [selectedItem, setSelectedItem] = useState<JourneyPackingItem | null>(null);
  const [gearDetailItem, setGearDetailItem] = useState<GearItem | null>(null);
  const gearItemsById = useMemo(() => new Map(gearItems.map((item) => [item.id, item])), [gearItems]);
  const gearItemsByName = useMemo(() => new Map(gearItems.map((item) => [item.name.trim().toLocaleLowerCase(), item])), [gearItems]);

  const findGearItem = (item: JourneyPackingItem) => (item.sourceGearItemId != null ? gearItemsById.get(item.sourceGearItemId) : undefined) ?? gearItemsByName.get(item.name.trim().toLocaleLowerCase());

  const openItem = (item: JourneyPackingItem) => {
    setSelectedItem(item);
  };

  const memberViews = useMemo(() => controller.views.filter((view) => view.kind === 'personal'), [controller.views]);
  const myView = memberViews.find((view) => view.ownerCompanionId === controller.currentCompanionId);
  const initialView = readOnly && !myView?.items.length
    ? memberViews.find((view) => view.items.length > 0) ?? myView
    : myView;
  useEffect(() => {
    if (!selectedKey && initialView) setSelectedKey(initialView.key);
  }, [initialView, selectedKey]);

  const activeView = memberViews.find((view) => view.key === selectedKey) ?? initialView ?? memberViews[0];
  const isMine = activeView?.kind === 'personal' && activeView.ownerCompanionId === controller.currentCompanionId;
  const isShared = false;
  const isHost = Boolean(journey.mine || controller.currentCompanion.host);
  const canEdit = !readOnly && Boolean(isMine || isHost);
  const canCheck = canEdit;
  useEffect(() => {
    if (!canEdit || preview || controller.items.length) { setGuideGearCount(0); return; }
    let active = true;
    void (async () => {
      const receipt = await supabase.from('journey_guide_imports').select('template_id').eq('journey_id', journey.id).maybeSingle();
      const guideId = receipt.data?.template_id;
      if (receipt.error || !guideId || guideId.includes('@')) { if (active) setGuideGearCount(0); return; }
      const guide = await supabase.from('route_guides').select('plan').eq('id', guideId).eq('status', 'approved').maybeSingle();
      const gear = (guide.data?.plan as { gear?: unknown } | null)?.gear;
      if (active) setGuideGearCount(!guide.error && Array.isArray(gear) ? gear.length : 0);
    })();
    return () => { active = false; };
  }, [canEdit, preview, controller.items.length, journey.id]);

  const importGuideGear = async () => {
    if (importingGuideGearRef.current) return;
    importingGuideGearRef.current = true;
    setImportingGuideGear(true);
    try {
      const { error } = await supabase.rpc('journey_import_route_guide_gear', { p_journey_id: journey.id, p_request_id: Crypto.randomUUID() });
      if (error) throw error;
      await refetchJourneyPacking(journey.id);
    } catch (error) {
      Alert.alert(t('journey.packing.importFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      importingGuideGearRef.current = false;
      setImportingGuideGear(false);
    }
  };
  const orderedViews = useMemo(
    () =>
      [...memberViews].sort((a, b) => {
        const rank = (view: typeof a) => (view.ownerCompanionId === controller.currentCompanionId ? 0 : 1);
        return rank(a) - rank(b);
      }),
    [controller.currentCompanionId, memberViews],
  );

  if (filterMenuRef) {
    filterMenuRef.current = activeView
      ? {
          activeKey: activeView.key,
          options: orderedViews.map((view) => {
            const mine = view.kind === 'personal' && view.ownerCompanionId === controller.currentCompanionId;
            return {
              key: view.key,
              kind: mine ? ('mine' as const) : ('companion' as const),
              label: mine ? (data.profile.nick.trim() || view.companion?.name || t('journey.packing.me')) : (view.companion?.name ?? ''),
              avatarUrl: view.companion?.avatarUrl,
              ready: view.items.reduce((total, item) => total + (item.packed ? Math.max(1, item.quantity) : 0), 0),
              total: view.items.reduce((total, item) => total + Math.max(1, item.quantity), 0),
            };
          }),
          select: (key) => {
            setSelectedKey(key);
            onSelectedItemIdsChange(new Set());
          },
        }
      : null;
  }

  useEffect(
    () => () => {
      if (filterMenuRef) filterMenuRef.current = null;
    },
    [filterMenuRef],
  );

  useEffect(() => {
    onCanEditChange?.(canEdit);
  }, [canEdit, onCanEditChange]);

  if (addActionRef) addActionRef.current = canEdit ? () => setSourceOpen(true) : null;
  if (deleteActionRef) {
    deleteActionRef.current = canEdit
      ? async () => {
          const ids = [...selectedItemIds];
          await controller.deleteItems(ids);
          onSelectedItemIdsChange(new Set());
        }
      : null;
  }

  const scopeLabel = isMine ? t('journey.packing.myChecklist') : t('journey.packing.memberChecklist', { name: activeView?.companion?.name ?? '' });

  useEffect(() => {
    if (scopeLabel) onFilterStateChange?.(scopeLabel, !isMine);
  }, [isMine, onFilterStateChange, scopeLabel]);

  useEffect(() => {
    if (!filterActionRef) return;
    filterActionRef.current = () => onFilterMenuOpenChange?.(true);
    return () => {
      filterActionRef.current = null;
      onFilterMenuOpenChange?.(false);
    };
  }, [filterActionRef, onFilterMenuOpenChange]);

  const decorateItems = (items: JourneyPackingItem[]): PackingDisplayItem[] =>
    items
      .map((item) => {
        const linkedGearItem = findGearItem(item);
        return {
          ...item,
          weightKg: item.weightKg ?? linkedGearItem?.w,
          carryStatus: item.carryStatus ?? (linkedGearItem ? itemStatus(linkedGearItem) : 'packed'),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const displayItems = useMemo<PackingDisplayItem[]>(() => decorateItems(activeView?.items ?? []), [activeView?.items, gearItemsById, gearItemsByName]);

  const sharedRows = useMemo<PackingDisplayItem[]>(() => {
    if (!isMine) return [];
    const sharedView = controller.views.find((view) => view.kind === 'shared');
    if (!sharedView) return [];
    return decorateItems(sharedView.items.filter((item) => item.carrierCompanionId === controller.currentCompanionId));
  }, [controller.currentCompanionId, controller.views, gearItemsById, gearItemsByName, isMine]);

  if (controller.loading || !activeView) {
    return (
      <View
        style={{
          minHeight: 280,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <View>
        {controller.localMode ? (
          <View
            style={{
              marginBottom: space.md,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.card,
              backgroundColor: theme.dangerSoft,
            }}
          >
            <Text style={[type.body, { color: theme.danger, fontWeight: '700' }]}>{t('journey.packing.localMode')}</Text>
          </View>
        ) : null}
        <PackingOverview
          theme={theme}
          items={displayItems}
          weightUnit={weightUnit}
          title={scopeLabel}
          listPickerOpen={filterMenuOpen}
          pickerProgress={pickerProgress}
          onSelectList={onFilterMenuOpenChange && !selectionMode ? () => onFilterMenuOpenChange(true) : undefined}
          emptyBody={canEdit ? t('journey.packing.emptyBody') : t('journey.packing.emptyTeammate')}
        />
        {canEdit && !preview && !controller.items.length ? (
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {guideGearCount > 0 ? <Press onPress={() => void importGuideGear()} disabled={importingGuideGear} style={{ minHeight: layout.fieldHeight, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface }}><Text style={[type.body, { color: theme.accent }]}>{t('journey.packing.importGuideGear', { count: guideGearCount })}</Text></Press> : null}
            <Press onPress={() => setSourceMode('gear')} style={{ minHeight: layout.fieldHeight, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface }}><Text style={[type.body, { color: theme.accent }]}>{t('journey.packing.pickFromLibrary')}</Text></Press>
            <Press onPress={() => nav.openAssistant(t('journeyHome.hero.packingPlanPrompt'), journey.id)} style={{ minHeight: layout.fieldHeight, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface }}><Text style={[type.body, { color: theme.accent }]}>{t('journey.packing.generateWithAi')}</Text></Press>
          </View>
        ) : null}
        {!canEdit ? <Text style={[type.caption, { color: theme.text2, marginTop: space.sm }]}>{t('journey.packing.viewOnly')}</Text> : null}
        {displayItems.length || sharedRows.length ? (
          <PackingGroups theme={theme} items={displayItems} sharedRows={sharedRows} weightUnit={weightUnit} canCheck={canCheck} onToggle={(item) => void controller.updateItem(item.id, { packed: !item.packed })} onOpen={openItem} selectionMode={selectionMode} selectedItemIds={selectedItemIds} onSelectedItemIdsChange={onSelectedItemIdsChange} />
        ) : null}

        {!readOnly && !isMine && !isShared && activeView.pendingCount > 0 ? (
          <Press
            onPress={() => {
              if (activeView.ownerCompanionId != null) void controller.remindCompanion(activeView.ownerCompanionId, activeView.pendingCount);
              nav.showToast(
                t('journey.packing.reminded', {
                  name: activeView.companion?.name ?? '',
                  count: activeView.pendingCount,
                }),
              );
            }}
            style={{
              alignSelf: 'center',
              minHeight: 44,
              marginTop: layout.sectionGap,
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.fieldSurface,
            }}
          >
            <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>
              {t('journey.packing.remind', {
                name: activeView.companion?.name ?? '',
                count: activeView.pendingCount,
              })}
            </Text>
          </Press>
        ) : null}
      </View>

      <Modal visible={sourceOpen} transparent statusBarTranslucent animationType="none" onRequestClose={() => setSourceOpen(false)}>
        <AddSourceSheet
          theme={theme}
          onClose={() => setSourceOpen(false)}
          onSelect={(mode) => {
            setSourceOpen(false);
            if (mode === 'custom') setCustomItemOpen(true);
            else setSourceMode(mode);
          }}
        />
      </Modal>

      <Modal visible={sourceMode != null} animationType="none" presentationStyle="fullScreen" onRequestClose={() => setSourceMode(null)}>
        {sourceMode ? (
          <PackingSourcePicker
            theme={theme}
            mode={sourceMode}
            sets={sets}
            gearItems={gearItems}
            categories={categories}
            weightUnit={weightUnit}
            existingNames={new Set(activeView.items.map((item) => item.name))}
            saving={controller.saving}
            onBack={() => setSourceMode(null)}
            onAdd={async (inputs) => {
              await controller.addItems(activeView.kind, activeView.ownerCompanionId, inputs);
              setSourceMode(null);
            }}
          />
        ) : null}
      </Modal>

      <Modal visible={customItemOpen} transparent statusBarTranslucent animationType="none" onRequestClose={() => setCustomItemOpen(false)}>
        <CustomPackingItemSheet
          theme={theme}
          categories={categories}
          saving={controller.saving}
          onClose={() => setCustomItemOpen(false)}
          onAdd={async (inputs) => {
            await controller.addItems(activeView.kind, activeView.ownerCompanionId, inputs);
            setCustomItemOpen(false);
          }}
        />
      </Modal>

      <Modal visible={selectedItem != null} transparent statusBarTranslucent animationType="none" onRequestClose={() => setSelectedItem(null)}>
        {selectedItem ? (
          <PackingItemSheet
            theme={theme}
            item={controller.items.find((item) => item.id === selectedItem.id) ?? selectedItem}
            categories={categories}
            isShared={isShared}
            editable={canEdit}
            companions={controller.companions}
            currentCompanionId={controller.currentCompanionId}
            weightUnit={weightUnit}
            gearItem={findGearItem(controller.items.find((item) => item.id === selectedItem.id) ?? selectedItem)}
            onClose={() => setSelectedItem(null)}
            onOpenGearDetail={(gearItemId) => {
              const gearItem = gearItems.find((candidate) => candidate.id === gearItemId);
              if (!gearItem) return;
              setSelectedItem(null);
              setGearDetailItem(gearItem);
            }}
            onSave={(patch) => controller.updateItem(selectedItem.id, patch)}
            onAddToGearLibrary={async (journeyItem) => {
              try {
                const exactMatch = gearItems.find((gearItem) => gearItem.name.trim().toLocaleLowerCase() === journeyItem.name.trim().toLocaleLowerCase());
                const category = categories.find((candidate) => candidate.name === journeyItem.categoryName);
                const saved =
                  exactMatch ??
                  (await data.addItem({
                    name: journeyItem.name,
                    cat: category?.id ?? 'uncat',
                    w: journeyItem.weightKg ?? 0,
                    p: 0,
                    qty: journeyItem.quantity,
                    attrs: journeyItem.attrs,
                    note: journeyItem.note,
                    status: journeyItem.carryStatus ?? 'packed',
                  }));
                if (saved?.id == null) return;
                await controller.updateItem(journeyItem.id, {
                  sourceType: 'gear',
                  sourceGearItemId: saved.id,
                  name: saved.name,
                  categoryName: categories.find((candidate) => candidate.id === saved.cat)?.name ?? journeyItem.categoryName,
                  categoryColor: categories.find((candidate) => candidate.id === saved.cat)?.color ?? journeyItem.categoryColor,
                  weightKg: saved.w,
                  weightEstimated: false,
                  carryStatus: itemStatus(saved),
                  attrs: saved.attrs,
                });
                setSelectedItem(null);
                nav.showToast(t(exactMatch ? 'journey.packing.gearLinked' : 'journey.packing.gearAdded'));
              } catch (error) {
                console.warn('[JourneyPacking] add temporary gear failed:', error);
                nav.showToast(t('journey.packing.gearActionFailed'));
              }
            }}
            onDelete={async () => {
              await controller.deleteItem(selectedItem.id);
              setSelectedItem(null);
            }}
          />
        ) : null}
      </Modal>

      <Modal visible={gearDetailItem != null} animationType="slide" onRequestClose={() => setGearDetailItem(null)}>
        {gearDetailItem ? <GearScreen theme={theme} initialItem={gearDetailItem} onExit={() => setGearDetailItem(null)} /> : null}
      </Modal>
    </>
  );
}

// Opening the filter menu updates state in DiscoverScreen. Keep the sizeable
// checklist tree from rendering again when all of its own inputs are unchanged.
export const JourneyChecklistTab = React.memo(JourneyChecklistTabComponent);

export function JourneyChecklistPickerSheet({ theme, controller, visible, onClose, onDismissStart }: {
  theme: Theme;
  controller: JourneyChecklistFilterMenuController;
  visible: boolean;
  onClose: () => void;
  onDismissStart?: () => void;
}) {
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      {visible ? <JourneyChecklistPickerContent theme={theme} controller={controller} onClose={onClose} onDismissStart={onDismissStart} /> : null}
    </Modal>
  );
}

const CHECKLIST_SEARCH_THRESHOLD = 10;

function JourneyChecklistPickerContent({ theme, controller, onClose, onDismissStart }: {
  theme: Theme;
  controller: JourneyChecklistFilterMenuController;
  onClose: () => void;
  onDismissStart?: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  // Past this many entries scrolling alone gets slow, so the search box appears.
  const showSearch = controller.options.length > CHECKLIST_SEARCH_THRESHOLD;
  const search = showSearch ? query.trim().toLocaleLowerCase() : '';
  const options = controller.options.filter((option) => option.label.toLocaleLowerCase().includes(search));
  return (
    <SheetFrame theme={theme} onClose={onClose} onDismissStart={onDismissStart} keyboardAvoiding edgeToEdge contentPadding={space.lg}>
      <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.packing.selectChecklist')}</Text>
      {showSearch ? (
        <View style={{ minHeight: layout.fieldHeight, marginTop: space.md, marginBottom: space.sm, paddingHorizontal: space.sm, borderRadius: radius.control, backgroundColor: theme.fieldSurface, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name="search" color={theme.text2} size={18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('journey.packing.searchMembers')}
            placeholderTextColor={theme.text2}
            accessibilityLabel={t('journey.packing.searchMembers')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[type.body, { flex: 1, minWidth: 0, height: layout.fieldHeight, color: theme.text, padding: 0, lineHeight: undefined, textAlignVertical: 'center', includeFontPadding: false }]}
          />
          {query ? <AppIconButton theme={theme} name="close" size={32} noShadow onPress={() => setQuery('')} accessibilityLabel={t('search.clear')} /> : null}
        </View>
      ) : <View style={{ height: space.sm }} />}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
        {options.map((option) => {
          const selected = option.key === controller.activeKey;
          return (
            <Press
              key={option.key}
              scaleTo={1}
              onPress={() => { Keyboard.dismiss(); controller.select(option.key); onClose(); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.label}${option.kind === 'mine' ? `，${t('journey.packing.me')}` : ''}，${t('journey.packing.progress', { ready: option.ready, total: option.total })}`}
              style={{ minHeight: layout.listRowMinHeight, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
            >
              <ParticipantAvatar theme={theme} uri={option.avatarUrl} size={40} />
              <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Text numberOfLines={2} style={[type.body, { flexShrink: 1, color: theme.text, fontWeight: '600' }]}>{option.label}</Text>
                  {option.kind === 'mine' ? (
                    <Text style={[type.caption, { flexShrink: 0, color: theme.text2, backgroundColor: theme.fieldSurface, borderRadius: radius.pill, paddingHorizontal: space.xs, paddingVertical: space.xxs }]}>{t('journey.packing.me')}</Text>
                  ) : null}
                </View>
                <Text style={[type.caption, { color: theme.text2 }]}>{option.total ? t('journey.packing.progress', { ready: option.ready, total: option.total }) : t('journey.packing.noItems')}</Text>
              </View>
              <View style={{ width: space.xl, height: space.xl, alignItems: 'center', justifyContent: 'center' }}>{selected ? <Icon name="check" color={theme.accent} size={20} /> : null}</View>
            </Press>
          );
        })}
        {!options.length ? <Text style={[type.body, { color: theme.text2, textAlign: 'center', paddingVertical: space.xxl }]}>{t('journey.packing.noMembers')}</Text> : null}
      </ScrollView>
    </SheetFrame>
  );
}

type PackingDisplayItem = JourneyPackingItem & {
  carryStatus: GearCarryStatus;
};

type PackingWeightStats = {
  baseWeight: number;
  packWeight: number;
  wornWeight: number;
  consumableWeight: number;
  itemCount: number;
  pendingCount: number;
};

function packingItemTotalWeight(item: JourneyPackingItem) {
  return Math.max(0, item.weightKg ?? 0) * Math.max(1, item.quantity);
}

function buildPackingWeightStats(items: PackingDisplayItem[]): PackingWeightStats {
  let baseWeight = 0;
  let wornWeight = 0;
  let consumableWeight = 0;
  let itemCount = 0;
  let pendingCount = 0;

  items.forEach((item) => {
    const quantity = Math.max(1, item.quantity);
    const weight = packingItemTotalWeight(item);
    itemCount += quantity;
    if (!item.packed) pendingCount += quantity;

    if (item.carryStatus === 'worn') wornWeight += weight;
    else if (item.carryStatus === 'consumable') consumableWeight += weight;
    else if (item.carryStatus !== 'optional') baseWeight += weight;
  });

  return {
    baseWeight,
    packWeight: baseWeight + consumableWeight,
    wornWeight,
    consumableWeight,
    itemCount,
    pendingCount,
  };
}

function PackingOverview({ theme, items, weightUnit, title, onSelectList, listPickerOpen = false, pickerProgress: controlledPickerProgress, emptyBody }: {
  theme: Theme;
  items: PackingDisplayItem[];
  weightUnit: WeightUnit;
  title: string;
  onSelectList?: () => void;
  listPickerOpen?: boolean;
  pickerProgress?: Animated.Value;
  emptyBody: string;
}) {
  const { t } = useI18n();
  const stats = buildPackingWeightStats(items);
  const readyCount = Math.max(0, stats.itemCount - stats.pendingCount);
  const packWeight = splitWeight(stats.packWeight, weightUnit, true);
  const localPickerProgress = useRef(new Animated.Value(listPickerOpen ? 1 : 0)).current;
  const pickerProgress = controlledPickerProgress ?? localPickerProgress;

  useEffect(() => {
    // The main page starts its animation before mounting the picker.
    if (controlledPickerProgress) return;
    const animation = Animated.timing(pickerProgress, {
      toValue: listPickerOpen ? 1 : 0,
      duration: motion.standard,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [controlledPickerProgress, listPickerOpen, pickerProgress]);

  return (
    <View style={{ marginTop: onSelectList ? 0 : space.md }}>
      {onSelectList ? (
        <Press
          onPress={onSelectList}
          scaleTo={1}
          accessibilityRole="button"
          accessibilityLabel={`${t('journey.packing.selectChecklist')}，${title}`}
          accessibilityState={{ expanded: listPickerOpen }}
          style={{ minHeight: layout.iconButton, flexDirection: 'row', alignItems: 'center', gap: space.xs }}
        >
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: '600', color: theme.text }}>{title}</Text>
          <Animated.View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: pickerProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Icon name="chevronDown" color={theme.text3} size={16} />
          </Animated.View>
        </Press>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 32, marginTop: onSelectList ? space.xs : 0 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5, color: theme.text }}>{readyCount}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', marginLeft: 3, color: theme.text2 }}>/ {stats.itemCount}</Text>
          </View>
          <Text style={{ fontSize: 12.5, color: theme.text2, marginTop: 3 }}>{t('journey.packing.statReady')}</Text>
        </View>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5, color: theme.text }}>{packWeight.value}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', marginLeft: 3, color: theme.text2 }}>{packWeight.unit}</Text>
          </View>
          <Text style={{ fontSize: 12.5, color: theme.text2, marginTop: 3 }}>
            {t('gear.pack.pack')}<Text style={{ color: theme.text3 }}>  {t('gear.pack.base')} + {t('gear.pack.consumable')}</Text>
          </Text>
        </View>
      </View>
      {items.length ? (
        // 包重 = 基础 + 消耗; 穿戴 is on the body, not in the pack.
        <View style={{ flexDirection: 'row', gap: 32, marginTop: space.md }}>
          <PackingWeightFigure theme={theme} label={t('gear.pack.base')} kg={stats.baseWeight} weightUnit={weightUnit} />
          <PackingWeightFigure theme={theme} label={t('gear.pack.consumable')} kg={stats.consumableWeight} weightUnit={weightUnit} />
          <PackingWeightFigure theme={theme} label={t('gear.pack.worn')} kg={stats.wornWeight} weightUnit={weightUnit} />
        </View>
      ) : null}
      {!items.length ? <Text style={{ fontSize: 12.5, color: theme.text2, lineHeight: 18, marginTop: space.md }}>{emptyBody}</Text> : null}
    </View>
  );
}

function PackingWeightFigure({ theme, label, kg, weightUnit }: { theme: Theme; label: string; kg: number; weightUnit: WeightUnit }) {
  const weight = splitWeight(kg, weightUnit, true);
  return (
    <View>
      <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.text }}>
        {weight.value}<Text style={{ fontSize: 12, fontWeight: '500', color: theme.text2 }}> {weight.unit}</Text>
      </Text>
      <Text style={{ fontSize: 12.5, color: theme.text2, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function PackingCheckCircle({ theme, checked }: { theme: Theme; checked: boolean }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: radius.pill,
        borderWidth: checked ? 0 : 1.5,
        borderColor: theme.text3,
        backgroundColor: checked ? theme.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Icon name="check" color="#FFF" size={12} strokeWidth={2.5} /> : null}
    </View>
  );
}

function PackingGroups({ theme, items, sharedRows, weightUnit, canCheck, onToggle, onOpen, selectionMode, selectedItemIds, onSelectedItemIdsChange }: { theme: Theme; items: PackingDisplayItem[]; sharedRows: PackingDisplayItem[]; weightUnit: WeightUnit; canCheck: boolean; onToggle: (item: JourneyPackingItem) => void; onOpen: (item: JourneyPackingItem) => void; selectionMode: boolean; selectedItemIds: Set<string>; onSelectedItemIdsChange: (ids: Set<string>) => void }) {
  const { t } = useI18n();
  const groups = useMemo(() => {
    // One list, grouped by category in list order. Ticking an item checks it in
    // place; nothing moves between groups.
    const result: { key: string; label: string; rows: PackingDisplayItem[]; showWeight: boolean }[] = [];
    if (sharedRows.length) result.push({ key: 'sharedYours', label: t('journey.packing.groupSharedYours'), rows: sharedRows, showWeight: false });
    const byCategory = new Map<string, PackingDisplayItem[]>();
    items.forEach((item) => {
      const key = item.categoryName || '';
      byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
    });
    [...byCategory.entries()].forEach(([category, rows]) => {
      result.push({ key: category ? `category:${category}` : 'category:uncategorized', label: category || t('gear.uncategorized'), rows, showWeight: true });
    });
    return result;
  }, [items, sharedRows, t]);

  return (
    <View>
      {groups.map((group, index) => (
        <View key={group.key}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: index === 0 ? space.lg : 26 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '600', color: theme.text3 }}>{group.label}</Text>
            {group.showWeight ? <PackingGroupWeight theme={theme} rows={group.rows} weightUnit={weightUnit} /> : null}
          </View>
          <View style={{ marginTop: space.xs }}>
            {group.rows.map((item) => (
              <PackingRow
                key={item.id}
                theme={theme}
                item={item}
                weightUnit={weightUnit}
                canCheck={canCheck}
                onToggle={() => onToggle(item)}
                onOpen={() => onOpen(item)}
                selectionMode={selectionMode}
                selected={selectedItemIds.has(item.id)}
                onToggleSelection={() => {
                  const next = new Set(selectedItemIds);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  onSelectedItemIdsChange(next);
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// Same basis as the overview's pack weight (base + consumable; worn and
// optional excluded), so the category subtotals add up to the headline figure.
function PackingGroupWeight({ theme, rows, weightUnit }: { theme: Theme; rows: PackingDisplayItem[]; weightUnit: WeightUnit }) {
  const { t } = useI18n();
  const stats = buildPackingWeightStats(rows);
  const missing = rows.filter((item) => item.weightKg == null && item.carryStatus !== 'optional').length;
  if (stats.packWeight <= 0 && !missing) return null;
  const weight = splitWeight(stats.packWeight, weightUnit, true);
  return (
    <Text numberOfLines={1} style={{ marginLeft: space.sm, fontSize: 12, fontWeight: '500', color: theme.text3 }}>
      {missing ? `${t('journey.packing.groupWeightMissing', { count: missing })} ` : ''}
      {stats.packWeight > 0 ? `${weight.value} ${weight.unit}` : ''}
    </Text>
  );
}

function PackingRow({ theme, item, weightUnit, canCheck, onToggle, onOpen, selectionMode, selected, onToggleSelection }: { theme: Theme; item: PackingDisplayItem; weightUnit: WeightUnit; canCheck: boolean; onToggle: () => void; onOpen: () => void; selectionMode: boolean; selected: boolean; onToggleSelection: () => void }) {
  const checked = selectionMode ? selected : item.packed;
  const quantity = Math.max(1, item.quantity);
  const weight = item.weightKg != null ? splitItemWeight(packingItemTotalWeight(item), weightUnit, true) : null;
  return (
    // Tapping the row ticks the item; its details open on long press. Without
    // check permission the tap opens the details instead.
    <Press
      onPress={selectionMode ? onToggleSelection : canCheck ? onToggle : onOpen}
      onLongPress={selectionMode ? undefined : onOpen}
      scaleTo={1}
      accessibilityRole={selectionMode || canCheck ? 'checkbox' : 'button'}
      accessibilityLabel={item.name}
      accessibilityState={selectionMode || canCheck ? { checked } : undefined}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <PackingCheckCircle theme={theme} checked={checked} />
      <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, fontSize: 15, color: theme.text }}>
        {item.name}{quantity > 1 ? <Text style={{ color: theme.text3 }}> ×{quantity}</Text> : null}
      </Text>
      {weight ? <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 12.5, color: theme.text3 }}>{weight.value} {weight.unit}</Text> : null}
    </Press>
  );
}

function CarrierPickerModal({ visible, theme, companions, currentCompanionId, selectedCompanionId, canEdit, onClose, onSelect }: { visible: boolean; theme: Theme; companions: JourneyPackingController['companions']; currentCompanionId: number; selectedCompanionId?: number; canEdit: boolean; onClose: () => void; onSelect: (carrierCompanionId: number | undefined) => void }) {
  const { t } = useI18n();
  const choices = companions.filter((companion, index) => canEdit || (companion.id ?? -(index + 1)) === currentCompanionId);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <SheetFrame theme={theme} onClose={onClose}>
        <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.packing.carrier')}</Text>
        <View style={{ marginTop: space.md }}>
          <Press
            scaleTo={1}
            onPress={() => onSelect(undefined)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedCompanionId == null }}
            style={{
              minHeight: 54,
              marginBottom: space.xs,
              paddingHorizontal: space.sm,
              borderRadius: radius.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: theme.fieldSurface,
            }}
          >
            <Text style={[type.body, { flex: 1, color: theme.text2, fontWeight: '600' }]}>{t('journey.packing.noCarrier')}</Text>
            {selectedCompanionId == null ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
          </Press>
          {choices.map((companion) => {
            const originalIndex = companions.indexOf(companion);
            const companionId = companion.id ?? -(originalIndex + 1);
            const selected = selectedCompanionId === companionId;
            return (
              <Press
                key={companionId}
                scaleTo={1}
                onPress={() => onSelect(companionId)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  minHeight: 54,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                }}
              >
                <ParticipantAvatar theme={theme} uri={companion.avatarUrl} size={32} />
                <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text }]}>
                  {companion.name}
                </Text>
                {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
              </Press>
            );
          })}
        </View>
      </SheetFrame>
    </Modal>
  );
}

function CategoryPickerModal({ visible, theme, categories, selectedName, onClose, onSelect }: { visible: boolean; theme: Theme; categories: GearCat[]; selectedName?: string; onClose: () => void; onSelect: (category: GearCat | undefined) => void }) {
  const { t } = useI18n();
  const options = categories.filter((category) => category.id !== 'uncat');
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <SheetFrame theme={theme} onClose={onClose}>
        <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.packing.category')}</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: space.sm }}>
          <Press
            scaleTo={1}
            onPress={() => onSelect(undefined)}
            accessibilityRole="radio"
            accessibilityState={{ selected: !selectedName }}
            style={{
              minHeight: 54,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderStyle: 'dotted',
                borderColor: theme.text3,
              }}
            />
            <Text style={[type.body, { flex: 1, color: theme.text }]}>{t('gear.uncategorized')}</Text>
            {!selectedName ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
          </Press>
          {options.map((category) => {
            const selected = selectedName === category.name;
            return (
              <Press
                key={category.id}
                scaleTo={1}
                onPress={() => onSelect(category)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  minHeight: 54,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                }}
              >
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: category.color,
                  }}
                />
                <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text }]}>
                  {category.name}
                </Text>
                {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
              </Press>
            );
          })}
        </ScrollView>
      </SheetFrame>
    </Modal>
  );
}

function useDismissibleSheetDrag({ translateY, backdropOpacity, onDismiss }: { translateY: Animated.Value; backdropOpacity: Animated.Value; onDismiss: () => void }) {
  const onDismissRef = useRef(onDismiss);
  const screenHeightRef = useRef(Dimensions.get('screen').height);
  onDismissRef.current = onDismiss;
  screenHeightRef.current = Dimensions.get('screen').height;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        translateY.stopAnimation();
        backdropOpacity.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const distance = Math.max(0, gesture.dy);
        translateY.setValue(distance);
        backdropOpacity.setValue(Math.max(0.35, 1 - distance / Math.max(1, screenHeightRef.current * 0.7)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 96 || gesture.vy > 0.75) {
          onDismissRef.current();
          return;
        }
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: motion.quick,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: motion.quick,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return panResponder.panHandlers;
}

function SheetFrame({ theme, onClose, onDismissStart, expanded = false, keyboardAvoiding = false, edgeToEdge = false, contentPadding = space.xxl, children }: { theme: Theme; onClose: () => void; onDismissStart?: () => void; expanded?: boolean; keyboardAvoiding?: boolean; edgeToEdge?: boolean; contentPadding?: number; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const slide = useRef(new Animated.Value(keyboardAvoiding ? 600 : 0)).current;
  const backdropOpacity = useRef(new Animated.Value(keyboardAvoiding ? 0 : 1)).current;
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  onCloseRef.current = onClose;
  const onDismissStartRef = useRef(onDismissStart);
  onDismissStartRef.current = onDismissStart;

  useEffect(() => {
    if (!keyboardAvoiding) return undefined;
    Animated.parallel([
      Animated.spring(slide, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 3,
        speed: 16,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      slide.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, [backdropOpacity, keyboardAvoiding, slide]);

  useEffect(() => {
    if (!keyboardAvoiding) {
      setKeyboardVisible(false);
      return undefined;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscriptions = [Keyboard.addListener(showEvent, () => setKeyboardVisible(true)), Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))];
    if (Platform.OS === 'ios') subscriptions.push(Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false)));
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [keyboardAvoiding]);

  const translateY = slide;
  const sheetBackgroundColor = edgeToEdge ? theme.featureSurface : keyboardAvoiding ? (theme.dark ? theme.surfaceTop : '#FFFFFF') : theme.featureSurface;

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onDismissStartRef.current?.();
    if (keyboardAvoiding) Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slide, {
        toValue: windowHeight,
        duration: motion.standard,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: motion.quick,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onCloseRef.current());
  };
  const dragHandlers = useDismissibleSheetDrag({
    translateY: slide,
    backdropOpacity,
    onDismiss: requestClose,
  });

  return (
    <KeyboardAvoidingView enabled={keyboardAvoiding} behavior={keyboardAvoiding && Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <Pressable
          onPress={requestClose}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: keyboardAvoiding ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.24)',
            },
          ]}
        />
      </Animated.View>
      <Animated.View
        style={{
          ...(expanded ? { height: '82%' } : { maxHeight: '82%' }),
          transform: [{ translateY }],
          marginHorizontal: keyboardAvoiding && !edgeToEdge ? space.md : 0,
          marginBottom: keyboardAvoiding && !edgeToEdge ? Math.max(insets.bottom, space.md) : 0,
          paddingHorizontal: contentPadding,
          paddingTop: space.xxs,
          paddingBottom: keyboardAvoiding && keyboardVisible ? 0 : Math.max(insets.bottom, space.xxl),
          borderTopLeftRadius: radius.feature,
          borderTopRightRadius: radius.feature,
          borderBottomLeftRadius: keyboardAvoiding && !edgeToEdge ? radius.feature : 0,
          borderBottomRightRadius: keyboardAvoiding && !edgeToEdge ? radius.feature : 0,
          backgroundColor: sheetBackgroundColor,
          overflow: keyboardAvoiding && edgeToEdge ? 'visible' : 'hidden',
        }}
      >
        {keyboardAvoiding && edgeToEdge ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: windowHeight,
              borderTopLeftRadius: radius.feature,
              borderTopRightRadius: radius.feature,
              backgroundColor: sheetBackgroundColor,
            }}
          />
        ) : null}
        <View
          {...dragHandlers}
          hitSlop={{ top: 8, bottom: 8 }}
          style={{
            height: 16,
            marginHorizontal: -contentPadding,
            marginBottom: space.lg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 32,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.text3,
            }}
          />
        </View>
        {children}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function AddSourceSheet({ theme, onClose, onSelect }: { theme: Theme; onClose: () => void; onSelect: (mode: 'gear' | 'sets' | 'custom') => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  onCloseRef.current = onClose;
  onSelectRef.current = onSelect;

  const rows: {
    id: 'gear' | 'sets' | 'custom';
    label: string;
    sub: string;
  }[] = [
    {
      id: 'gear',
      label: t('journey.packing.fromGear'),
      sub: t('journey.packing.fromGearSub'),
    },
    {
      id: 'sets',
      label: t('journey.packing.fromSet'),
      sub: t('journey.packing.fromSetSub'),
    },
    {
      id: 'custom',
      label: t('journey.packing.custom'),
      sub: t('journey.packing.customSub'),
    },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: motion.standard,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        bounciness: 0,
        speed: 18,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const close = (mode?: 'gear' | 'sets' | 'custom') => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: motion.quick,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: windowHeight,
        duration: motion.standard,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (mode) onSelectRef.current(mode);
      else onCloseRef.current();
    });
  };
  const dragHandlers = useDismissibleSheetDrag({
    translateY,
    backdropOpacity,
    onDismiss: () => close(),
  });

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.34)', opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>
      <Animated.View
        style={{
          transform: [{ translateY }],
          paddingTop: space.xxs,
          paddingHorizontal: space.lg,
          paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          backgroundColor: theme.groupedBg,
        }}
      >
        <View
          {...dragHandlers}
          hitSlop={{ top: 8, bottom: 8 }}
          style={{
            height: 16,
            marginHorizontal: -space.lg,
            marginBottom: space.lg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 38,
              height: 5,
              borderRadius: radius.pill,
              backgroundColor: theme.text3,
              opacity: 0.34,
            }}
          />
        </View>
        <Text style={[type.pageTitle, { color: theme.text }]}>{t('journey.packing.add')}</Text>

        <View style={{ marginTop: space.xl, gap: space.sm }}>
          {rows.map((row) => (
            <Press
              key={row.id}
              onPress={() => close(row.id)}
              accessibilityRole="button"
              style={{
                minHeight: 92,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                borderRadius: radius.feature,
                justifyContent: 'center',
                backgroundColor: theme.surfaceTop,
              }}
            >
              <Text style={[type.cardTitle, { color: theme.text }]}>{row.label}</Text>
              <Text numberOfLines={2} style={[type.body, { color: theme.text3, lineHeight: 20, marginTop: space.xs }]}>
                {row.sub}
              </Text>
            </Press>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function PackingSourcePicker({ theme, mode, sets, gearItems, categories, weightUnit, existingNames, saving, onBack, onAdd }: { theme: Theme; mode: 'gear' | 'sets'; sets: GearSet[]; gearItems: GearItem[]; categories: GearCat[]; weightUnit: WeightUnit; existingNames: Set<string>; saving: boolean; onBack: () => void; onAdd: (items: JourneyPackingItemInput[]) => Promise<void> }) {
  const { t } = useI18n();
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const catMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const catRecord = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])) as Record<string, GearCat>, [categories]);
  const availableGearItems = useMemo(() => gearItems.filter((item) => !existingNames.has(item.name)), [existingNames, gearItems]);
  const { pinnedIds, setPinned } = usePinnedSets();
  const inputsFromSet = (set: GearSet): JourneyPackingItemInput[] =>
    set.items.map((name) => {
      const item = gearItems.find((candidate) => candidate.name === name);
      const override = item?.id != null ? set.overrides?.[String(item.id)] : set.overrides?.[name];
      return {
        sourceType: 'gearSet',
        sourceGearItemId: item?.id,
        name,
        categoryName: item ? catMap.get(item.cat)?.name : undefined,
        categoryColor: item ? catMap.get(item.cat)?.color : undefined,
        quantity: override?.qty ?? item?.qty ?? 1,
        weightKg: item?.w,
        carryStatus: override?.status ?? (item ? itemStatus(item) : 'packed'),
        attrs: item?.attrs,
        note: item?.note,
      };
    });

  if (mode === 'gear') {
    const sourceItems: JourneyPackingItemInput[] = gearItems.map((item) => ({
      sourceType: 'gear',
      sourceGearItemId: item.id,
      name: item.name,
      categoryName: catMap.get(item.cat)?.name,
      categoryColor: catMap.get(item.cat)?.color,
      quantity: item.qty ?? 1,
      weightKg: item.w,
      carryStatus: itemStatus(item),
      attrs: item.attrs,
      note: item.note,
    }));
    return (
      <GearItemsList
        theme={theme}
        items={availableGearItems}
        catMap={catRecord}
        weightUnit={weightUnit}
        onBack={onBack}
        onOpenItem={() => {}}
        onAdd={() => {}}
        onAddCategory={() => {}}
        onEditCategory={() => {}}
        onDeleteCategory={() => {}}
        onDeleteItems={() => {}}
        picker={{
          selectedNames,
          onDone: (names) => {
            if (saving) return;
            const selected = sourceItems.filter((item) => names.has(item.name));
            if (!selected.length) {
              onBack();
              return;
            }
            void onAdd(selected);
          },
        }}
      />
    );
  }

  return (
    <GearSetsList
      theme={theme}
      sets={sets}
      allItems={gearItems}
      catMap={catRecord}
      weightUnit={weightUnit}
      onBack={onBack}
      onOpenSet={() => {}}
      onAdd={() => {}}
      onDeleteSets={() => {}}
      pinnedSetIds={pinnedIds}
      onSetPinned={setPinned}
      picker={{
        title: t('journey.packing.selectSet'),
        selectedIds: selectedSetIds,
        onDone: (ids) => {
          if (saving) return;
          setSelectedSetIds(ids);
          const names = new Set(existingNames);
          const selected: JourneyPackingItemInput[] = [];
          sets
            .filter((set) => ids.has(set.id))
            .forEach((set) => {
              inputsFromSet(set).forEach((item) => {
                if (names.has(item.name)) return;
                names.add(item.name);
                selected.push(item);
              });
            });
          if (!selected.length) {
            onBack();
            return;
          }
          void onAdd(selected);
        },
      }}
    />
  );
}

function CustomPackingItemSheet({ theme, categories, saving, onClose, onAdd }: { theme: Theme; categories: GearCat[]; saving: boolean; onClose: () => void; onAdd: (items: JourneyPackingItemInput[]) => Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState<string>();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const canSubmit = Boolean(name.trim()) && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    const parsedWeight = Number(weight);
    await onAdd([
      {
        sourceType: 'custom',
        name: name.trim(),
        categoryName: categoryName.trim() || undefined,
        categoryColor,
        quantity,
        weightKg: weight.trim() && Number.isFinite(parsedWeight) ? parsedWeight : undefined,
        note: note.trim() || undefined,
      },
    ]);
  };

  return (
    <>
      <SheetFrame theme={theme} onClose={onClose} expanded keyboardAvoiding>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.pageTitle, { color: theme.text }]}>{t('journey.packing.custom')}</Text>
            <Text style={[type.body, { marginTop: space.xs, color: theme.text3 }]}>{t('journey.packing.customSub')}</Text>
          </View>
          <Press
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.fieldSurface,
            }}
          >
            <Icon name="close" color={theme.text2} size={17} />
          </Press>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: space.xl,
            paddingBottom: space.lg,
          }}
        >
          <Text style={[type.eyebrow, { marginBottom: space.xs, color: theme.text3 }]}>{t('journey.packing.name')}</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={t('journey.packing.namePlaceholder')}
            placeholderTextColor={theme.text3}
            returnKeyType="next"
            style={[
              type.cardTitle,
              {
                minHeight: 58,
                paddingHorizontal: space.md,
                borderRadius: radius.control,
                color: theme.text,
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              },
            ]}
          />

          <Text
            style={[
              type.eyebrow,
              {
                marginTop: space.lg,
                marginBottom: space.xs,
                color: theme.text3,
              },
            ]}
          >
            {t('journey.packing.category')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
            }}
          >
            <View
              style={{
                flex: 1,
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space.md,
                borderRadius: radius.control,
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              {categoryColor ? (
                <View
                  style={{
                    width: 12,
                    height: 12,
                    marginRight: space.sm,
                    borderRadius: 4,
                    backgroundColor: categoryColor,
                  }}
                />
              ) : null}
              <TextInput
                value={categoryName}
                onChangeText={(value) => {
                  setCategoryName(value);
                  setCategoryColor(undefined);
                }}
                placeholder={t('journey.packing.categoryPlaceholder')}
                placeholderTextColor={theme.text3}
                style={[
                  type.body,
                  {
                    flex: 1,
                    minWidth: 0,
                    height: 50,
                    padding: 0,
                    color: theme.text,
                  },
                ]}
              />
            </View>
            <Press
              onPress={() => {
                Keyboard.dismiss();
                setCategoryOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('journey.packing.category')}
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.control,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              <Icon name="chevronDown" color={theme.text2} size={16} />
            </Press>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
            <View
              style={{
                flex: 1,
                minHeight: 96,
                padding: space.md,
                borderRadius: radius.feature,
                justifyContent: 'space-between',
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              <Text style={[type.body, { color: theme.text2 }]}>{t('journey.packing.quantity')}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Press onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={circleControl(theme)}>
                  <Text style={{ fontSize: 20, lineHeight: 22, color: theme.text2 }}>−</Text>
                </Press>
                <Text style={[type.metric, { color: theme.text }]}>{quantity}</Text>
                <Press onPress={() => setQuantity((value) => value + 1)} style={circleControl(theme)}>
                  <Icon name="plus" color={theme.text2} size={15} />
                </Press>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                minHeight: 96,
                padding: space.md,
                borderRadius: radius.feature,
                justifyContent: 'space-between',
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              <Text style={[type.body, { color: theme.text2 }]}>{t('journey.packing.weight')}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: space.xs,
                }}
              >
                <TextInput
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="0.0"
                  placeholderTextColor={theme.text3}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 36,
                    padding: 0,
                    fontFamily: MONO,
                    fontSize: 24,
                    lineHeight: 30,
                    fontWeight: '800',
                    color: theme.text,
                    letterSpacing: -0.6,
                  }}
                />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '700',
                    color: theme.text2,
                  }}
                >
                  kg
                </Text>
              </View>
            </View>
          </View>

          <Text
            style={[
              type.eyebrow,
              {
                marginTop: space.lg,
                marginBottom: space.xs,
                color: theme.text3,
              },
            ]}
          >
            {t('journey.packing.note')}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t('journey.packing.notePlaceholder')}
            placeholderTextColor={theme.text3}
            textAlignVertical="top"
            style={[
              type.body,
              {
                minHeight: 92,
                padding: space.md,
                borderRadius: radius.control,
                color: theme.text,
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              },
            ]}
          />
        </ScrollView>

        <Press
          disabled={!canSubmit}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          style={{
            height: 52,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSubmit ? theme.accent : theme.fieldSurface,
          }}
        >
          {saving ? (
            <ActivityIndicator color={theme.featureSurface} size="small" />
          ) : (
            <Text
              style={[
                type.body,
                {
                  color: canSubmit ? theme.featureSurface : theme.text3,
                  fontWeight: '800',
                },
              ]}
            >
              {t('common.add')}
            </Text>
          )}
        </Press>
      </SheetFrame>

      <CategoryPickerModal
        visible={categoryOpen}
        theme={theme}
        categories={categories}
        selectedName={categoryName.trim() || undefined}
        onClose={() => setCategoryOpen(false)}
        onSelect={(category) => {
          setCategoryName(category?.name ?? '');
          setCategoryColor(category?.color);
          setCategoryOpen(false);
        }}
      />
    </>
  );
}

function circleControl(theme: Theme) {
  return {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.surfaceTop,
  };
}

function PackingItemSheet({ theme, item, gearItem, categories, isShared, editable, companions, currentCompanionId, weightUnit, onClose, onOpenGearDetail, onSave, onAddToGearLibrary, onDelete }: { theme: Theme; item: JourneyPackingItem; gearItem?: GearItem; categories: GearCat[]; isShared: boolean; editable: boolean; companions: JourneyPackingController['companions']; currentCompanionId: number; weightUnit: WeightUnit; onClose: () => void; onOpenGearDetail: (gearItemId: number) => void; onSave: (patch: Partial<Pick<JourneyPackingItem, 'name' | 'categoryName' | 'categoryColor' | 'quantity' | 'weightKg' | 'weightEstimated' | 'attrs' | 'note' | 'packed' | 'carrierCompanionId'>>) => Promise<void>; onAddToGearLibrary: (item: JourneyPackingItem) => Promise<void>; onDelete: () => Promise<void> }) {
  const { t } = useI18n();
  const [carrierOpen, setCarrierOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [gearActionSaving, setGearActionSaving] = useState(false);
  const [name, setName] = useState(item.name);
  const [categoryName, setCategoryName] = useState(item.categoryName ?? '');
  const [categoryColor, setCategoryColor] = useState(item.categoryColor);
  const [quantity, setQuantity] = useState(item.quantity);
  const [totalWeight, setTotalWeight] = useState(item.weightKg == null ? '' : String(Number((item.weightKg * item.quantity).toFixed(4))));
  const [weightEstimated, setWeightEstimated] = useState(item.weightEstimated);
  const [attrs, setAttrs] = useState<[string, string][]>((item.attrs || []).map(([key, value]) => [key, value]));
  const [note, setNote] = useState(item.note ?? '');
  const carrier = companions.find((companion, index) => (companion.id ?? -(index + 1)) === item.carrierCompanionId);
  const parsedTotalWeight = totalWeight.trim() && Number.isFinite(Number(totalWeight)) ? Math.max(0, Number(totalWeight)) : undefined;
  const displayWeight = parsedTotalWeight == null ? undefined : splitItemWeight(parsedTotalWeight, weightUnit, true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lastSavedSignatureRef = useRef(
    JSON.stringify({
      name: item.name.trim(),
      categoryName: item.categoryName?.trim() || undefined,
      categoryColor: item.categoryColor,
      quantity: item.quantity,
      weightKg: item.weightKg,
      weightEstimated: item.weightEstimated,
      attrs: item.attrs,
      note: item.note,
    }),
  );

  const persistDraft = async (override: Partial<Pick<JourneyPackingItem, 'name' | 'categoryName' | 'categoryColor' | 'quantity' | 'weightKg' | 'weightEstimated' | 'attrs' | 'note'>> = {}) => {
    const nextQuantity = override.quantity ?? quantity;
    const nextCategoryName = Object.prototype.hasOwnProperty.call(override, 'categoryName') ? override.categoryName : categoryName.trim() || undefined;
    const nextAttrs = (override.attrs ?? attrs).map(([key, value]) => [key.trim(), value.trim()] as [string, string]).filter(([key, value]) => key && value);
    const patch = {
      name: override.name ?? name.trim(),
      categoryName: nextCategoryName,
      categoryColor: nextCategoryName ? (Object.prototype.hasOwnProperty.call(override, 'categoryColor') ? override.categoryColor : categoryColor) : undefined,
      quantity: nextQuantity,
      weightKg: Object.prototype.hasOwnProperty.call(override, 'weightKg') ? override.weightKg : parsedTotalWeight == null ? undefined : parsedTotalWeight / Math.max(1, nextQuantity),
      weightEstimated: Object.prototype.hasOwnProperty.call(override, 'weightEstimated') ? override.weightEstimated : weightEstimated,
      attrs: nextAttrs,
      note: Object.prototype.hasOwnProperty.call(override, 'note') ? override.note : note.trim(),
    };
    if (!editable || !patch.name) return;
    const signature = JSON.stringify(patch);
    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;
    try {
      await onSaveRef.current(patch);
    } catch (error) {
      lastSavedSignatureRef.current = '';
      console.warn('[JourneyPacking] auto-save item failed:', error);
    }
  };

  useEffect(() => {
    if (!editable) return undefined;
    const timer = setTimeout(() => {
      void persistDraft();
    }, 280);
    return () => clearTimeout(timer);
  }, [editable, name, categoryName, categoryColor, quantity, totalWeight, weightEstimated, attrs, note]);

  const closeWithFlush = () => {
    void persistDraft();
    onClose();
  };

  const addToGearLibrary = async () => {
    if (gearActionSaving) return;
    setGearActionSaving(true);
    try {
      await onAddToGearLibrary({
        ...item,
        name: name.trim() || item.name,
        categoryName: categoryName.trim() || undefined,
        categoryColor,
        quantity,
        weightKg: parsedTotalWeight == null ? undefined : parsedTotalWeight / Math.max(1, quantity),
        weightEstimated,
        attrs: attrs.map(([key, value]) => [key.trim(), value.trim()] as [string, string]).filter(([key, value]) => key && value),
        note: note.trim() || undefined,
      });
    } finally {
      setGearActionSaving(false);
    }
  };

  return (
    <>
      <SheetFrame theme={theme} onClose={closeWithFlush} keyboardAvoiding={editable} edgeToEdge>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: space.xxs }}>
          {editable ? (
            <TextInput
              value={name}
              onChangeText={setName}
              multiline
              scrollEnabled={false}
              placeholder={t('journey.packing.namePlaceholder')}
              placeholderTextColor={theme.text3}
              style={{
                minHeight: 54,
                maxHeight: 72,
                padding: 0,
                fontSize: 25,
                fontWeight: '800',
                color: theme.text,
                letterSpacing: -0.6,
                lineHeight: 32,
                textAlignVertical: 'top',
              }}
            />
          ) : (
            <Text
              numberOfLines={2}
              style={{
                fontSize: 25,
                fontWeight: '800',
                color: theme.text,
                letterSpacing: -0.6,
                lineHeight: 32,
              }}
            >
              {item.name}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <PackingMetricTile theme={theme} label={`${t('gear.spec.totalWeight')}${weightEstimated ? ` · ${t('journey.packing.estimated')}` : ''}`}>
              {editable ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: space.xs,
                  }}
                >
                  <TextInput
                    value={totalWeight}
                    onChangeText={(value) => {
                      setTotalWeight(value);
                      setWeightEstimated(false);
                    }}
                    placeholder="0.0"
                    placeholderTextColor={theme.text3}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 36,
                      padding: 0,
                      fontFamily: MONO,
                      fontSize: 25,
                      lineHeight: 30,
                      fontWeight: '800',
                      color: theme.text,
                      letterSpacing: -0.7,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: theme.text,
                    }}
                  >
                    kg
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: space.xs,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      fontFamily: MONO,
                      fontSize: 25,
                      lineHeight: 30,
                      fontWeight: '800',
                      color: theme.text,
                      letterSpacing: -0.7,
                    }}
                  >
                    {displayWeight?.value ?? '—'}
                  </Text>
                  {displayWeight?.unit ? (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: theme.text,
                      }}
                    >
                      {displayWeight.unit}
                    </Text>
                  ) : null}
                </View>
              )}
            </PackingMetricTile>

            <PackingMetricTile theme={theme} label={t('gear.spec.qty')}>
              {editable ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Press
                    onPress={() => {
                      const next = Math.max(1, quantity - 1);
                      setQuantity(next);
                      void persistDraft({ quantity: next });
                    }}
                    hitSlop={6}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.surfaceTop,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        lineHeight: 22,
                        color: theme.text2,
                      }}
                    >
                      −
                    </Text>
                  </Press>
                  <Text
                    style={{
                      fontFamily: MONO,
                      fontSize: 25,
                      lineHeight: 30,
                      fontWeight: '800',
                      color: theme.text,
                      letterSpacing: -0.7,
                    }}
                  >
                    {quantity}
                  </Text>
                  <Press
                    onPress={() => {
                      const next = quantity + 1;
                      setQuantity(next);
                      void persistDraft({ quantity: next });
                    }}
                    hitSlop={6}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.surfaceTop,
                    }}
                  >
                    <Icon name="plus" color={theme.text2} size={14} />
                  </Press>
                </View>
              ) : (
                <Text
                  style={{
                    fontFamily: MONO,
                    fontSize: 25,
                    lineHeight: 30,
                    fontWeight: '800',
                    color: theme.text,
                    letterSpacing: -0.7,
                  }}
                >
                  {item.quantity}
                </Text>
              )}
            </PackingMetricTile>
          </View>

          <View style={{ marginTop: space.xl }}>
            <Text style={[type.body, { color: theme.text2 }]}>{t('journey.packing.category')}</Text>
            {editable ? (
              <View
                style={{
                  minHeight: 44,
                  marginTop: space.xs,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                }}
              >
                <TextInput
                  value={categoryName}
                  onChangeText={(value) => {
                    setCategoryName(value);
                    setCategoryColor(undefined);
                  }}
                  placeholder={t('journey.packing.categoryPlaceholder')}
                  placeholderTextColor={theme.text3}
                  style={[
                    type.cardTitle,
                    {
                      flex: 1,
                      minWidth: 0,
                      minHeight: 44,
                      padding: 0,
                      color: theme.text,
                    },
                  ]}
                />
                <Press
                  scaleTo={1}
                  onPress={() => {
                    Keyboard.dismiss();
                    setCategoryOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('journey.packing.category')}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.fieldSurface,
                  }}
                >
                  <Icon name="chevronDown" color={theme.text2} size={16} />
                </Press>
              </View>
            ) : (
              <Text style={[type.cardTitle, { marginTop: space.sm, color: theme.text }]}>{item.categoryName ?? t('gear.uncategorized')}</Text>
            )}
          </View>

          {isShared ? (
            <View style={{ marginTop: space.sm }}>
              <Press
                disabled={!editable && item.carrierCompanionId !== currentCompanionId && item.carrierCompanionId != null}
                scaleTo={1}
                onPress={() => setCarrierOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('journey.packing.carrier')}
                style={{
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={[type.body, { flex: 1, color: theme.text2 }]}>{t('journey.packing.carrier')}</Text>
                {carrier ? <ParticipantAvatar theme={theme} uri={carrier.avatarUrl} size={22} /> : null}
                <Text
                  style={[
                    type.body,
                    {
                      marginLeft: carrier ? space.xs : 0,
                      color: carrier ? theme.text : theme.text3,
                      fontWeight: '600',
                    },
                  ]}
                >
                  {carrier?.name ?? t('journey.packing.noCarrier')}
                </Text>
                <View style={{ marginLeft: space.md }}>
                  <Icon name="chevronR" color={theme.text3} size={15} />
                </View>
              </Press>
            </View>
          ) : null}

          <View style={{ marginTop: space.xl }}>
            <View style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.body, { flex: 1, color: theme.text2 }]}>{t('gear.section.customAttrs')}</Text>
              {editable ? (
                <Press
                  onPress={() => setAttrs((current) => [...current, ['', '']])}
                  accessibilityRole="button"
                  accessibilityLabel={t('gear.editor.addAttr')}
                  style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
                >
                  <Icon name="plus" color={theme.accent} size={15} />
                </Press>
              ) : null}
            </View>
            {attrs.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
                {attrs.map(([key, value], index) => (
                  <View key={index} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 140, minHeight: 76, padding: space.md, paddingRight: editable ? space.xl : space.md, borderRadius: radius.card, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}>
                    {editable ? (
                      <>
                        <Press onPress={() => setAttrs((current) => current.filter((_, attrIndex) => attrIndex !== index))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.delete')} style={{ position: 'absolute', right: space.xs, top: space.xs, zIndex: 1, padding: space.xxs }}>
                          <Icon name="close" color={theme.text3} size={13} />
                        </Press>
                        <TextInput value={key} onChangeText={(nextKey) => setAttrs((current) => current.map((entry, attrIndex) => attrIndex === index ? [nextKey, entry[1]] : entry))} placeholder={t('gear.editor.attrNamePlaceholder')} placeholderTextColor={theme.text3} style={[type.body, { padding: 0, color: theme.text2 }]} />
                        <TextInput value={value} onChangeText={(nextValue) => setAttrs((current) => current.map((entry, attrIndex) => attrIndex === index ? [entry[0], nextValue] : entry))} placeholder={t('gear.editor.attrValuePlaceholder')} placeholderTextColor={theme.text3} multiline style={[type.cardTitle, { marginTop: space.xs, padding: 0, color: theme.text }]} />
                      </>
                    ) : (
                      <>
                        <Text style={[type.body, { color: theme.text2 }]}>{key}</Text>
                        <Text style={[type.cardTitle, { marginTop: space.xs, color: theme.text }]}>{value}</Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            ) : !editable ? (
              <Text style={[type.body, { marginTop: space.xs, color: theme.text3 }]}>{t('journey.packing.noDetails')}</Text>
            ) : null}
          </View>

          <View style={{ marginTop: space.xl }}>
            <Text style={[type.body, { color: theme.text2 }]}>{t('journey.packing.note')}</Text>
            {editable ? (
              <TextInput value={note} onChangeText={setNote} placeholder={t('journey.packing.notePlaceholder')} placeholderTextColor={theme.text3} multiline textAlignVertical="top" style={[type.body, { minHeight: 84, marginTop: space.xs, padding: space.md, borderRadius: radius.control, color: theme.text, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }]} />
            ) : (
              <Text style={[type.body, { marginTop: space.xs, color: note ? theme.text : theme.text3 }]}>{note || t('journey.packing.noNote')}</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
            {gearItem?.id != null ? (
              <Press
                onPress={() => {
                  void persistDraft();
                  onOpenGearDetail(gearItem.id as number);
                }}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.fieldSurface,
                }}
              >
                <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '700' }]}>
                  {t('journey.packing.viewGearDetail')}
                </Text>
              </Press>
            ) : editable ? (
              <Press
                disabled={gearActionSaving}
                onPress={() => void addToGearLibrary()}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.fieldSurface,
                }}
              >
                {gearActionSaving ? (
                  <ActivityIndicator color={theme.text2} size="small" />
                ) : (
                  <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: '700' }]}>
                    {t('journey.packing.addToGear')}
                  </Text>
                )}
              </Press>
            ) : null}
            {editable ? (
              <Press
                onPress={() =>
                  Alert.alert(t('journey.packing.deleteTitle', { name: item.name }), t('journey.packing.deleteBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: () => void onDelete(),
                    },
                  ])
                }
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.fieldSurface,
                }}
              >
                <Text numberOfLines={1} style={[type.body, { color: theme.danger, fontWeight: '700' }]}>
                  {t('journey.packing.delete')}
                </Text>
              </Press>
            ) : null}
          </View>
        </ScrollView>
      </SheetFrame>

      <CategoryPickerModal
        visible={categoryOpen}
        theme={theme}
        categories={categories}
        selectedName={categoryName.trim() || undefined}
        onClose={() => setCategoryOpen(false)}
        onSelect={(category) => {
          const nextName = category?.name ?? '';
          const nextColor = category?.color;
          setCategoryName(nextName);
          setCategoryColor(nextColor);
          void persistDraft({
            categoryName: nextName || undefined,
            categoryColor: nextColor,
          });
          setCategoryOpen(false);
        }}
      />

      <CarrierPickerModal
        visible={carrierOpen}
        theme={theme}
        companions={companions}
        currentCompanionId={currentCompanionId}
        selectedCompanionId={item.carrierCompanionId}
        canEdit={editable}
        onClose={() => setCarrierOpen(false)}
        onSelect={(carrierCompanionId) => {
          void onSave({ carrierCompanionId });
          setCarrierOpen(false);
        }}
      />
    </>
  );
}

function PackingMetricTile({ theme, label, children }: { theme: Theme; label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 92,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.feature,
        justifyContent: 'space-between',
        backgroundColor: theme.fieldSurface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
      }}
    >
      <Text style={[type.body, { color: theme.text2 }]}>{label}</Text>
      {children}
    </View>
  );
}
