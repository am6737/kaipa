import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { GearCarryStatus, GearCat, GearItem, GearSet, WeightUnit } from '../../data/gear';
import { fmtWeight, itemStatus, splitWeight } from '../../data/gear';
import type { JourneyPackingItem, JourneyPackingItemInput } from '../../data/journeyPacking';
import { RECOMMENDED_PACKING_TEMPLATES, type RecommendedPackingTemplate } from '../../data/recommendedPackingTemplates';
import type { Poi } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { AppHeaderSearch, AppIconButton, AppProgressBar, DetailPage, layout, motion, radius, space, type } from '../../design-system';
import { useJourneyPacking, type JourneyPackingController } from '../../hooks/useJourneyPacking';
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
import { GearSetDetail } from '../gear/GearSetDetail';
import { usePinnedSets } from '../gear/usePinnedSets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Weight } from 'lucide-react-native';

export type JourneyChecklistFilterMenuOption = {
  key: string;
  kind: 'mine' | 'shared' | 'companion';
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
  toggleAllActionRef,
  onFilterStateChange,
  onFilterMenuOpenChange,
  selectionMode = false,
  selectedItemIds,
  onSelectedItemIdsChange,
  onVisibleItemIdsChange,
  onCanEditChange,
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
  toggleAllActionRef?: React.MutableRefObject<(() => void) | null>;
  onFilterStateChange?: (label: string, active: boolean) => void;
  onFilterMenuOpenChange?: (open: boolean, anchor?: { x: number; y: number; width: number; height: number }) => void;
  selectionMode?: boolean;
  selectedItemIds: Set<string>;
  onSelectedItemIdsChange: (ids: Set<string>) => void;
  onVisibleItemIdsChange?: (ids: string[]) => void;
  onCanEditChange?: (canEdit: boolean) => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const controller = useJourneyPacking({ journey, userId });
  const [selectedKey, setSelectedKey] = useState<string>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<'gear' | 'sets' | 'templates' | null>(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<JourneyPackingItem | null>(null);
  const filterAnchorRef = useRef<View>(null);
  const [gearDetailItem, setGearDetailItem] = useState<GearItem | null>(null);
  const gearItemsById = useMemo(() => new Map(gearItems.map((item) => [item.id, item])), [gearItems]);
  const gearItemsByName = useMemo(() => new Map(gearItems.map((item) => [item.name.trim().toLocaleLowerCase(), item])), [gearItems]);

  const findGearItem = (item: JourneyPackingItem) => (item.sourceGearItemId != null ? gearItemsById.get(item.sourceGearItemId) : undefined) ?? gearItemsByName.get(item.name.trim().toLocaleLowerCase());

  const openItem = (item: JourneyPackingItem) => {
    setSelectedItem(item);
  };

  const myView = controller.views.find((view) => view.kind === 'personal' && view.ownerCompanionId === controller.currentCompanionId);
  useEffect(() => {
    if (!selectedKey && myView) setSelectedKey(myView.key);
  }, [myView, selectedKey]);

  const activeView = controller.views.find((view) => view.key === selectedKey) ?? myView ?? controller.views[0];
  const isMine = activeView?.kind === 'personal' && activeView.ownerCompanionId === controller.currentCompanionId;
  const isShared = activeView?.kind === 'shared';
  const isHost = Boolean(journey.mine || controller.currentCompanion.host);
  const canEdit = Boolean(isMine || isHost || (isShared && journey.participantPermissions?.editChecklist));
  const canCheck = Boolean(isMine || isHost || (isShared && journey.participantPermissions?.checkChecklistItems));
  const orderedViews = useMemo(
    () =>
      [...controller.views].sort((a, b) => {
        const rank = (view: typeof a) => (view.kind === 'personal' && view.ownerCompanionId === controller.currentCompanionId ? 0 : view.kind === 'shared' ? 1 : 2);
        return rank(a) - rank(b);
      }),
    [controller.currentCompanionId, controller.views],
  );

  if (filterMenuRef) {
    filterMenuRef.current = activeView
      ? {
          activeKey: activeView.key,
          options: orderedViews.map((view) => {
            const mine = view.kind === 'personal' && view.ownerCompanionId === controller.currentCompanionId;
            return {
              key: view.key,
              kind: view.kind === 'shared' ? ('shared' as const) : mine ? ('mine' as const) : ('companion' as const),
              label: view.kind === 'shared' ? t('journey.packing.sharedShort') : mine ? t('journey.packing.me') : (view.companion?.name ?? ''),
              avatarUrl: view.companion?.avatarUrl,
              ready: view.packedCount,
              total: view.items.length,
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

  const scopeLabel = activeView?.kind === 'shared' ? t('journey.packing.sharedShort') : activeView?.ownerCompanionId === controller.currentCompanionId ? t('journey.packing.me') : (activeView?.companion?.name ?? '');

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

  const displayItems = useMemo<PackingDisplayItem[]>(
    () =>
      (activeView?.items ?? [])
        .map((item) => {
          const linkedGearItem = findGearItem(item);
          return {
            ...item,
            weightKg: item.weightKg ?? linkedGearItem?.w,
            carryStatus: item.carryStatus ?? (linkedGearItem ? itemStatus(linkedGearItem) : 'packed'),
            inGearLibrary: linkedGearItem != null,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [activeView?.items, gearItemsById, gearItemsByName],
  );
  const visibleItemIdsKey = displayItems.map((item) => item.id).join(',');

  if (toggleAllActionRef) {
    toggleAllActionRef.current =
      canEdit && displayItems.length > 0
        ? () => {
            const allSelected = displayItems.every((item) => selectedItemIds.has(item.id));
            onSelectedItemIdsChange(allSelected ? new Set() : new Set(displayItems.map((item) => item.id)));
          }
        : null;
  }

  useEffect(() => {
    onVisibleItemIdsChange?.(visibleItemIdsKey ? visibleItemIdsKey.split(',') : []);
  }, [onVisibleItemIdsChange, visibleItemIdsKey]);

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
        <View style={{ minHeight: 36, marginBottom: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text numberOfLines={1} style={[type.caption, { flex: 1, color: theme.text2, fontWeight: '700' }]}>
            {scopeLabel}
          </Text>
          {!selectionMode ? (
            <View ref={filterAnchorRef} collapsable={false}>
              <AppIconButton
                theme={theme}
                name="filter"
                size={36}
                noShadow
                active={!isMine}
                onPress={() => {
                  const anchor = filterAnchorRef.current;
                  if (!anchor) {
                    onFilterMenuOpenChange?.(true);
                    return;
                  }
                  anchor.measureInWindow((x, y, width, height) => {
                    onFilterMenuOpenChange?.(true, { x, y, width, height });
                  });
                }}
                accessibilityLabel={`${t('journey.packing.title')} ${scopeLabel}`}
              />
            </View>
          ) : null}
        </View>
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
        <PackingWeightOverviewCard theme={theme} items={displayItems} weightUnit={weightUnit} emptyBody={canEdit ? t('journey.packing.emptyBody') : t('journey.packing.emptyTeammate')} />
        {displayItems.length ? (
          <View style={{ marginTop: layout.sectionGap }}>
            <PackingGroups theme={theme} items={displayItems} weightUnit={weightUnit} isShared={isShared} canCheck={canCheck} canEdit={canEdit} currentCompanionId={controller.currentCompanionId} companions={controller.companions} onToggle={(item) => void controller.updateItem(item.id, { packed: !item.packed })} onSetPacked={(itemIds, packed) => void controller.setItemsPacked(itemIds, packed)} onOpen={openItem} selectionMode={selectionMode} selectedItemIds={selectedItemIds} onSelectedItemIdsChange={onSelectedItemIdsChange} />
          </View>
        ) : null}

        {!isMine && !isShared && activeView.pendingCount > 0 ? (
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

type PackingDisplayItem = JourneyPackingItem & {
  carryStatus: GearCarryStatus;
  inGearLibrary: boolean;
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

function PackingWeightOverviewCard({ theme, items, weightUnit, emptyBody }: { theme: Theme; items: PackingDisplayItem[]; weightUnit: WeightUnit; emptyBody: string }) {
  const { t } = useI18n();
  const stats = buildPackingWeightStats(items);
  const readyCount = Math.max(0, stats.itemCount - stats.pendingCount);
  const readyPercent = stats.itemCount ? (readyCount / stats.itemCount) * 100 : 0;

  return (
    <View
      style={{
        marginTop: space.sm,
        padding: space.md,
        borderRadius: radius.feature,
        backgroundColor: theme.surfaceTop,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        boxShadow: theme.dark ? '0px 2px 8px rgba(0,0,0,0.18)' : '0px 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      {!items.length ? (
        <View
          style={{
            minHeight: 92,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Package color={theme.text2} size={18} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, { color: theme.text, fontWeight: '700' }]}>{t('journey.packing.empty')}</Text>
            <Text style={[type.caption, { marginTop: space.xs, color: theme.text3, lineHeight: 18 }]}>{emptyBody}</Text>
          </View>
        </View>
      ) : (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package color={theme.text2} size={18} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.body, { color: theme.text2, fontWeight: '600' }]}>
                {t('journey.packing.progress', {
                  ready: readyCount,
                  total: stats.itemCount,
                })}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 21,
                fontWeight: '800',
                letterSpacing: -0.6,
                color: stats.pendingCount ? theme.text : theme.accent,
              }}
            >
              {Math.round(readyPercent)}%
            </Text>
          </View>

          <View style={{ marginTop: space.md }}>
            <AppProgressBar theme={theme} value={readyPercent} height={6} />
          </View>

          <View
            style={{
              marginTop: space.lg,
              paddingTop: space.md,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.fieldBorder,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: space.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.caption, { color: theme.text2, fontWeight: '700' }]}>{t('gear.pack.pack')}</Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={{
                    marginTop: space.xxs,
                    fontFamily: MONO,
                    fontSize: 30,
                    fontWeight: '800',
                    letterSpacing: -1,
                    color: theme.text,
                  }}
                >
                  {fmtWeight(stats.packWeight, weightUnit)}
                </Text>
              </View>
              <Text style={[type.caption, { paddingBottom: space.xs, color: theme.text3 }]}>
                {t('gear.pack.base')} + {t('gear.pack.consumable')}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                gap: space.xs,
                marginTop: space.md,
              }}
            >
              <PackingWeightMetric theme={theme} label={t('gear.pack.base')} value={fmtWeight(stats.baseWeight, weightUnit)} />
              <PackingWeightMetric theme={theme} label={t('gear.pack.consumable')} value={fmtWeight(stats.consumableWeight, weightUnit)} />
              <PackingWeightMetric theme={theme} label={t('gear.pack.worn')} value={fmtWeight(stats.wornWeight, weightUnit)} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function PackingWeightMetric({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        paddingHorizontal: space.sm,
        paddingVertical: space.sm,
        borderRadius: radius.control,
        backgroundColor: theme.fieldSurface,
      }}
    >
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2, fontWeight: '600' }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{
          marginTop: space.xs,
          fontFamily: MONO,
          fontSize: 15,
          fontWeight: '800',
          letterSpacing: -0.35,
          color: theme.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function PackingCheckCircle({ theme, checked, mixed = false, accent = false, dotted = false }: { theme: Theme; checked: boolean; mixed?: boolean; accent?: boolean; dotted?: boolean }) {
  const activeColor = accent ? theme.accent : theme.text2;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: radius.pill,
        borderWidth: checked ? 0 : 1.7,
        borderStyle: dotted && !checked && !mixed ? 'dotted' : 'solid',
        borderColor: mixed ? activeColor : accent ? theme.accent : theme.text3,
        backgroundColor: checked ? activeColor : mixed ? (accent ? theme.accentSoft : theme.fieldSurface) : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? (
        <Icon name="check" color="#FFF" size={13} strokeWidth={2.5} />
      ) : mixed ? (
        <Text
          style={{
            color: activeColor,
            fontSize: 15,
            lineHeight: 15,
            fontWeight: '800',
          }}
        >
          −
        </Text>
      ) : null}
    </View>
  );
}

function PackingGroupChevron({ theme, collapsed }: { theme: Theme; collapsed: boolean }) {
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: collapsed ? 0 : 1,
      duration: motion.standard,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [collapsed, progress]);

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <Animated.View
      style={{
        width: 32,
        height: 32,
        marginLeft: space.xxs,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate }],
      }}
    >
      <Icon name="chevronDown" color={theme.text3} size={16} />
    </Animated.View>
  );
}

function PackingGroups({ theme, items, weightUnit, isShared, canCheck, canEdit, currentCompanionId, companions, onToggle, onSetPacked, onOpen, selectionMode, selectedItemIds, onSelectedItemIdsChange }: { theme: Theme; items: PackingDisplayItem[]; weightUnit: WeightUnit; isShared: boolean; canCheck: boolean; canEdit: boolean; currentCompanionId: number; companions: JourneyPackingController['companions']; onToggle: (item: JourneyPackingItem) => void; onSetPacked: (itemIds: string[], packed: boolean) => void; onOpen: (item: JourneyPackingItem) => void; selectionMode: boolean; selectedItemIds: Set<string>; onSelectedItemIdsChange: (ids: Set<string>) => void }) {
  const { t } = useI18n();
  const groups = useMemo(() => {
    const map = new Map<string, PackingDisplayItem[]>();
    items.forEach((item) => {
      const key = item.categoryName || '';
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [items]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleCollapsed = (groupKey: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  return (
    <View>
      {groups.map(([category, rows], groupIndex) => {
        const groupKey = category ? `category:${category}` : 'category:uncategorized';
        const collapsed = collapsedGroups.has(groupKey);
        const categoryLabel = category || t('gear.uncategorized');
        const hasGroupWeight = rows.some((item) => item.weightKg != null && item.weightKg > 0);
        const groupWeight = rows.reduce((total, item) => total + packingItemTotalWeight(item), 0);
        const checkableRows = rows.filter((item) => !isShared || canEdit || item.carrierCompanionId === currentCompanionId);
        const completedCount = selectionMode ? rows.filter((item) => selectedItemIds.has(item.id)).length : rows.filter((item) => item.packed).length;
        const allChecked = rows.length > 0 && completedCount === rows.length;
        const partiallyChecked = completedCount > 0 && !allChecked;
        const allCheckablePacked = checkableRows.length > 0 && checkableRows.every((item) => item.packed);
        const groupDisabled = selectionMode ? rows.length === 0 : !canCheck || checkableRows.length === 0;
        const toggleGroup = () => {
          if (selectionMode) {
            const next = new Set(selectedItemIds);
            rows.forEach((item) => {
              if (allChecked) next.delete(item.id);
              else next.add(item.id);
            });
            onSelectedItemIdsChange(next);
            return;
          }
          onSetPacked(
            checkableRows.map((item) => item.id),
            !allCheckablePacked,
          );
        };
        return (
          <View key={groupKey} style={{ marginTop: groupIndex ? space.xxs : 0 }}>
            <View
              style={{
                minHeight: 28,
                paddingHorizontal: space.xxs,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Press
                disabled={groupDisabled}
                onPress={toggleGroup}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: partiallyChecked ? 'mixed' : allChecked,
                  disabled: groupDisabled,
                }}
                style={{
                  width: 42,
                  alignSelf: 'stretch',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  opacity: groupDisabled ? 0.4 : 1,
                }}
              >
                <PackingCheckCircle theme={theme} checked={allChecked} mixed={partiallyChecked} accent={selectionMode} dotted />
              </Press>
              <Pressable
                onPress={() => toggleCollapsed(groupKey)}
                accessibilityRole="button"
                accessibilityLabel={categoryLabel}
                accessibilityState={{ expanded: !collapsed }}
                style={{
                  flex: 1,
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    type.cardTitle,
                    {
                      flex: 1,
                      fontSize: 13,
                      color: allChecked && !selectionMode ? theme.text2 : theme.text,
                    },
                  ]}
                >
                  {categoryLabel}
                </Text>
                <View
                  style={{
                    marginLeft: space.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                  }}
                >
                  {hasGroupWeight ? <Text style={[type.caption, { color: theme.text2 }]}>{fmtWeight(groupWeight, weightUnit, true)}</Text> : null}
                  <Text style={[type.caption, { color: theme.text3 }]}>
                    {completedCount}/{rows.length}
                  </Text>
                </View>
                <PackingGroupChevron theme={theme} collapsed={collapsed} />
              </Pressable>
            </View>
            {collapsed ? null : (
              <View style={{ paddingLeft: space.xxxl, paddingRight: space.xxs }}>
                {rows.map((item) => (
                  <PackingRow
                    key={item.id}
                    theme={theme}
                    item={item}
                    weightUnit={weightUnit}
                    isShared={isShared}
                    canCheck={canCheck && (!isShared || canEdit || item.carrierCompanionId === currentCompanionId)}
                    companions={companions}
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
            )}
          </View>
        );
      })}
    </View>
  );
}

function PackingRow({ theme, item, weightUnit, isShared, canCheck, companions, onToggle, onOpen, selectionMode, selected, onToggleSelection }: { theme: Theme; item: PackingDisplayItem; weightUnit: WeightUnit; isShared: boolean; canCheck: boolean; companions: JourneyPackingController['companions']; onToggle: () => void; onOpen: () => void; selectionMode: boolean; selected: boolean; onToggleSelection: () => void }) {
  const { t } = useI18n();
  const carrier = companions.find((companion, index) => (companion.id ?? -(index + 1)) === item.carrierCompanionId);
  const checked = selectionMode ? selected : item.packed;
  return (
    <Press onPress={selectionMode ? onToggleSelection : onOpen} scaleTo={1} accessibilityRole={selectionMode ? 'checkbox' : 'button'} accessibilityState={selectionMode ? { checked: selected } : undefined} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center' }}>
      <Press
        disabled={!selectionMode && !canCheck}
        scaleTo={1}
        onPress={(event) => {
          event.stopPropagation();
          if (selectionMode) onToggleSelection();
          else onToggle();
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !selectionMode && !canCheck }}
        style={{
          width: 42,
          alignSelf: 'stretch',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <PackingCheckCircle theme={theme} checked={checked} accent={selectionMode} dotted />
      </Press>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          alignSelf: 'stretch',
          paddingVertical: space.xxs,
          justifyContent: 'center',
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            fontSize: 12.5,
            lineHeight: 18,
            fontWeight: '600',
            color: item.packed ? theme.text2 : theme.text,
          }}
        >
          {item.name}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: space.sm,
            marginTop: space.xs,
          }}
        >
          <Text style={[type.caption, { color: theme.text2 }]}>{item.quantity > 1 ? `×${item.quantity}` : t('journey.packing.oneItem')}</Text>
          {item.attrs?.slice(0, 2).map(([key, value]) => (
            <Text key={`${key}:${value}`} numberOfLines={1} style={[type.caption, { maxWidth: 140, color: theme.text2 }]}>{`${key} ${value}`}</Text>
          ))}
          {item.weightKg != null ? <Text style={[type.caption, { color: theme.text2 }]}>{fmtWeight(item.weightKg * item.quantity, weightUnit, true)}</Text> : null}
          {isShared && carrier ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xxs,
              }}
            >
              <ParticipantAvatar theme={theme} uri={carrier.avatarUrl} size={16} />
              <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>
                {carrier.name}
              </Text>
            </View>
          ) : null}
          {isShared && !carrier ? <Text style={[type.caption, { color: theme.text3 }]}>{t('journey.packing.noCarrier')}</Text> : null}
        </View>
      </View>
      {!item.inGearLibrary ? (
        <View
          accessibilityLabel={t('journey.packing.notInGearLibrary')}
          style={{
            minHeight: 20,
            marginLeft: space.sm,
            paddingHorizontal: space.xs,
            borderRadius: radius.pill,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xxs,
            backgroundColor: theme.dangerSoft,
          }}
        >
          <Package color={theme.danger} size={12} strokeWidth={1.9} />
          <Text style={[type.caption, { color: theme.danger, fontWeight: '700' }]}>
            {t('journey.packing.notInGearLibrary')}
          </Text>
        </View>
      ) : null}
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

function SheetFrame({ theme, onClose, expanded = false, keyboardAvoiding = false, edgeToEdge = false, children }: { theme: Theme; onClose: () => void; expanded?: boolean; keyboardAvoiding?: boolean; edgeToEdge?: boolean; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const slide = useRef(new Animated.Value(keyboardAvoiding ? 600 : 0)).current;
  const backdropOpacity = useRef(new Animated.Value(keyboardAvoiding ? 0 : 1)).current;
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  onCloseRef.current = onClose;

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
          paddingHorizontal: space.xxl,
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
            marginHorizontal: -space.xxl,
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

function AddSourceSheet({ theme, onClose, onSelect }: { theme: Theme; onClose: () => void; onSelect: (mode: 'gear' | 'sets' | 'templates' | 'custom') => void }) {
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
    id: 'gear' | 'sets' | 'templates' | 'custom';
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
      id: 'templates',
      label: t('journey.packing.fromTemplate'),
      sub: t('journey.packing.fromTemplateSub'),
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

  const close = (mode?: 'gear' | 'sets' | 'templates' | 'custom') => {
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

function PackingSourcePicker({ theme, mode, sets, gearItems, categories, weightUnit, existingNames, saving, onBack, onAdd }: { theme: Theme; mode: 'gear' | 'sets' | 'templates'; sets: GearSet[]; gearItems: GearItem[]; categories: GearCat[]; weightUnit: WeightUnit; existingNames: Set<string>; saving: boolean; onBack: () => void; onAdd: (items: JourneyPackingItemInput[]) => Promise<void> }) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [selectedTemplate, setSelectedTemplate] = useState<RecommendedPackingTemplate | null>(null);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [plazaSearchOpen, setPlazaSearchOpen] = useState(false);
  const catMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const catRecord = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])) as Record<string, GearCat>, [categories]);
  const availableGearItems = useMemo(() => gearItems.filter((item) => !existingNames.has(item.name)), [existingNames, gearItems]);
  const { pinnedIds, setPinned } = usePinnedSets();
  const communityDetail = useMemo(() => {
    if (!selectedTemplate) return null;
    const fallbackColors = ['#4F8EF7', '#5BAF7B', '#E09A4A', '#A477D4', '#D46A78', '#4FA9A6'];
    const categoryNames = [...new Set(selectedTemplate.items.map((item) => item.categoryName || t('gear.uncategorized')))];
    const detailCategories = categoryNames.map((name, index) => {
      const existing = categories.find((category) => category.name === name);
      return (
        existing ?? {
          id: `community-category-${index}`,
          name,
          color: fallbackColors[index % fallbackColors.length],
          builtin: true,
        }
      );
    });
    const categoriesByName = new Map(detailCategories.map((category) => [category.name, category]));
    const detailItems: GearItem[] = selectedTemplate.items.map((item, index) => ({
      id: -(index + 1),
      name: item.name,
      cat: categoriesByName.get(item.categoryName || t('gear.uncategorized'))?.id ?? detailCategories[0]?.id ?? 'community-category-0',
      w: item.weightKg ?? 0,
      p: 0,
      qty: item.quantity ?? 1,
      note: item.note,
    }));
    return {
      set: {
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        description: selectedTemplate.description,
        items: detailItems.map((item) => item.name),
      } satisfies GearSet,
      items: detailItems,
      catMap: Object.fromEntries(detailCategories.map((category) => [category.id, category])) as Record<string, GearCat>,
    };
  }, [categories, selectedTemplate, t]);
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

  const sourceItems: JourneyPackingItemInput[] =
    mode === 'gear'
      ? gearItems.map((item) => ({
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
        }))
      : (selectedTemplate?.items ?? []);
  if (mode === 'gear') {
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

  if (mode === 'sets') {
    return (
      <GearSetsList
        theme={theme}
        sets={sets}
        allItems={gearItems}
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

  if (mode === 'templates' && selectedTemplate && communityDetail) {
    const itemsToApply = selectedTemplate.items.filter((item) => !existingNames.has(item.name));
    return (
      <GearSetDetail
        theme={theme}
        set={communityDetail.set}
        allItems={communityDetail.items}
        catMap={communityDetail.catMap}
        weightUnit={weightUnit}
        onBack={() => {
          setSelectedTemplate(null);
          setQuery('');
        }}
        onOpenItem={() => {}}
        onDelete={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        applicationAction={{
          label: itemsToApply.length ? t('journey.packing.applyList') : t('journey.packing.listApplied'),
          disabled: !itemsToApply.length,
          pending: saving,
          onPress: () => void onAdd(itemsToApply),
        }}
      />
    );
  }

  const plazaGridGap = space.sm;
  const plazaCardWidth = (width - layout.pagePadding * 2 - plazaGridGap) / 2;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredTemplates = RECOMMENDED_PACKING_TEMPLATES.filter((template) => !normalizedQuery || template.name.toLocaleLowerCase().includes(normalizedQuery) || template.description.toLocaleLowerCase().includes(normalizedQuery) || template.items.some((item) => item.name.toLocaleLowerCase().includes(normalizedQuery) || item.categoryName?.toLocaleLowerCase().includes(normalizedQuery)));

  return (
    <DetailPage theme={theme} onBack={onBack} title={t('journey.packing.plazaTitle')} backgroundColor={theme.groupedBg} right={<AppHeaderSearch theme={theme} open={plazaSearchOpen} value={query} placeholder={t('journey.packing.plazaSearch')} onChangeText={setQuery} onClose={() => setPlazaSearchOpen(false)} actions={<AppIconButton theme={theme} name="search" onPress={() => setPlazaSearchOpen(true)} noShadow />} />}>
      <View style={{ paddingHorizontal: layout.pagePadding, marginTop: space.md }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: plazaGridGap,
          }}
        >
          {filteredTemplates.map((template) => (
            <CommunityPackingListCard
              key={template.id}
              theme={theme}
              template={template}
              weightUnit={weightUnit}
              width={plazaCardWidth}
              onPress={() => {
                setSelectedTemplate(template);
                setQuery('');
                setPlazaSearchOpen(false);
              }}
            />
          ))}
        </View>
        {!filteredTemplates.length ? (
          <View
            style={{
              minHeight: 300,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.sm,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.accentSofter,
              }}
            >
              <Icon name="search" color={theme.accent} size={25} />
            </View>
            <Text style={[type.body, { color: theme.text2 }]}>{t('journey.packing.plazaEmpty')}</Text>
          </View>
        ) : null}
      </View>
    </DetailPage>
  );
}

function CommunityPackingListCard({ theme, template, weightUnit, width, onPress }: { theme: Theme; template: RecommendedPackingTemplate; weightUnit: WeightUnit; width: number; onPress: () => void }) {
  const { t } = useI18n();
  const categoryCount = new Set(template.items.map((item) => item.categoryName).filter(Boolean)).size;
  const totalWeight = template.items.reduce((sum, item) => sum + (item.weightKg ?? 0) * (item.quantity ?? 1), 0);

  return (
    <Press
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      style={{
        width,
        height: 218,
        padding: space.md,
        borderRadius: radius.feature,
        justifyContent: 'space-between',
        backgroundColor: theme.surfaceTop,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.xs,
        }}
      >
        <Text
          numberOfLines={3}
          style={{
            flex: 1,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: '800',
            letterSpacing: -0.45,
            color: theme.text,
          }}
        >
          {template.name}
        </Text>
        <View
          style={{
            height: 22,
            paddingHorizontal: 7,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.fieldSurface,
          }}
        >
          <Text
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              fontWeight: '700',
              color: theme.text2,
            }}
          >
            {template.items.length} {t('gear.unit.items')}
          </Text>
        </View>
      </View>

      <View>
        <Text numberOfLines={2} style={[type.caption, { color: theme.text3, lineHeight: 17 }]}>
          {template.description}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            marginTop: space.sm,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xxs,
              flexShrink: 0,
            }}
          >
            <Package color={theme.text2} size={12.5} strokeWidth={1.7} />
            <Text
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: '700',
                color: theme.text2,
              }}
            >
              {categoryCount} {t('gear.unit.cats')}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xxs,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <Weight color={theme.text2} size={12.5} strokeWidth={1.7} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={{
                flexShrink: 1,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: '700',
                color: theme.text2,
              }}
            >
              {fmtWeight(totalWeight, weightUnit, true)}
            </Text>
          </View>
        </View>
      </View>
    </Press>
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
  const displayWeight = parsedTotalWeight == null ? undefined : splitWeight(parsedTotalWeight, weightUnit, true);
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
