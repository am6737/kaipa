import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { GearCat, GearItem, GearSet, WeightUnit } from '../../data/gear';
import { fmtWeight } from '../../data/gear';
import type { JourneyPackingItem, JourneyPackingItemInput, JourneyPackingListView } from '../../data/journeyPacking';
import { RECOMMENDED_PACKING_TEMPLATES, type RecommendedPackingTemplate } from '../../data/recommendedPackingTemplates';
import type { Poi } from '../../data/pois';
import {
  AppCard,
  AppProgressBar,
  AppSectionHeader,
  DetailPage,
  layout,
  motion,
  radius,
  space,
  type,
} from '../../design-system';
import { useJourneyPacking, type JourneyPackingController } from '../../hooks/useJourneyPacking';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { ParticipantAvatar } from '../overlays/ParticipantAvatar';
import { Glass } from '../Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function JourneyChecklistTab({
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
  onFilterStateChange,
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
  onFilterStateChange?: (label: string, active: boolean) => void;
  selectionMode?: boolean;
  selectedItemIds: Set<string>;
  onSelectedItemIdsChange: (ids: Set<string>) => void;
  onVisibleItemIdsChange?: (ids: string[]) => void;
  onCanEditChange?: (canEdit: boolean) => void;
}) {
  const { t } = useI18n();
  const nav = useNav();
  const controller = useJourneyPacking({ journey, userId });
  const [selectedKey, setSelectedKey] = useState<string>();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<'gear' | 'sets' | 'templates' | 'custom' | null>(null);
  const [selectedItem, setSelectedItem] = useState<JourneyPackingItem | null>(null);
  const [weightAnalysisOpen, setWeightAnalysisOpen] = useState(false);

  const openItem = (item: JourneyPackingItem) => {
    const isGearSource = item.sourceType === 'gear' || item.sourceType === 'gearSet';
    const gearItem = (item.sourceGearItemId != null
      ? gearItems.find((candidate) => candidate.id === item.sourceGearItemId)
      : undefined) ?? (isGearSource ? gearItems.find((candidate) => candidate.name === item.name) : undefined);
    if (gearItem?.id != null) {
      nav.openGearItem(gearItem.id);
      return;
    }
    setSelectedItem(item);
  };

  const myView = controller.views.find((view) => view.kind === 'personal' && view.ownerCompanionId === controller.currentCompanionId);
  useEffect(() => {
    if (!selectedKey && myView) setSelectedKey(myView.key);
  }, [myView, selectedKey]);

  const activeView = controller.views.find((view) => view.key === selectedKey) ?? myView ?? controller.views[0];
  const isMine = activeView?.kind === 'personal' && activeView.ownerCompanionId === controller.currentCompanionId;
  const isShared = activeView?.kind === 'shared';
  const isHost = Boolean(controller.currentCompanion.host);
  const canEdit = Boolean(isMine || (isShared && (isHost || journey.participantPermissions?.editChecklist)));
  const canCheck = Boolean(isMine || (isShared && (isHost || journey.participantPermissions?.checkChecklistItems)));

  useEffect(() => {
    onCanEditChange?.(canEdit);
  }, [canEdit, onCanEditChange]);

  if (addActionRef) addActionRef.current = canEdit ? () => setSourceOpen(true) : null;
  if (deleteActionRef) {
    deleteActionRef.current = canEdit
      ? async () => {
          const ids = [...selectedItemIds];
          await Promise.all(ids.map((id) => controller.deleteItem(id)));
          onSelectedItemIdsChange(new Set());
        }
      : null;
  }

  const scopeLabel = activeView?.kind === 'shared'
    ? t('journey.packing.sharedShort')
    : activeView?.ownerCompanionId === controller.currentCompanionId
      ? t('journey.packing.me')
      : activeView?.companion?.name ?? '';

  useEffect(() => {
    if (scopeLabel) onFilterStateChange?.(scopeLabel, !isMine);
  }, [isMine, onFilterStateChange, scopeLabel]);

  const displayItems = useMemo(
    () => [...(activeView?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [activeView?.items],
  );
  const visibleItemIdsKey = displayItems.map((item) => item.id).join(',');

  useEffect(() => {
    onVisibleItemIdsChange?.(visibleItemIdsKey ? visibleItemIdsKey.split(',') : []);
  }, [onVisibleItemIdsChange, visibleItemIdsKey]);

  if (controller.loading || !activeView) {
    return <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <>
      <View>
        <PackingScopeMenu
          theme={theme}
          views={controller.views}
          activeView={activeView}
          currentCompanionId={controller.currentCompanionId}
          filterActionRef={filterActionRef}
          onSelect={(key) => {
            setSelectedKey(key);
            onSelectedItemIdsChange(new Set());
          }}
        />

        {displayItems.length ? (
          <>
            <PackingWeightOverviewCard
              theme={theme}
              items={displayItems}
              weightUnit={weightUnit}
              onPress={() => setWeightAnalysisOpen(true)}
            />
            <View style={{ marginTop: layout.sectionGap }}>
              <PackingGroups
                theme={theme}
                items={displayItems}
                isShared={isShared}
                canCheck={canCheck}
                canEdit={canEdit}
                currentCompanionId={controller.currentCompanionId}
                companions={controller.companions}
                onToggle={(item) => void controller.updateItem(item.id, { packed: !item.packed })}
                onClaim={(item) => void controller.updateItem(item.id, { carrierCompanionId: controller.currentCompanionId })}
                onOpen={openItem}
                selectionMode={selectionMode}
                selectedItemIds={selectedItemIds}
                onSelectedItemIdsChange={onSelectedItemIdsChange}
              />
            </View>
          </>
        ) : (
          <PackingEmpty theme={theme} editable={canEdit} />
        )}

        {!isMine && !isShared && activeView.pendingCount > 0 ? (
          <Press
            onPress={() => {
              if (activeView.ownerCompanionId != null) void controller.remindCompanion(activeView.ownerCompanionId, activeView.pendingCount);
              nav.showToast(t('journey.packing.reminded', { name: activeView.companion?.name ?? '', count: activeView.pendingCount }));
            }}
            style={{ alignSelf: 'center', minHeight: 44, marginTop: layout.sectionGap, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}
          >
            <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>{t('journey.packing.remind', { name: activeView.companion?.name ?? '', count: activeView.pendingCount })}</Text>
          </Press>
        ) : null}
      </View>

      <Modal visible={weightAnalysisOpen} animationType="none" presentationStyle="fullScreen" onRequestClose={() => setWeightAnalysisOpen(false)}>
        <PackingWeightAnalysisPage
          theme={theme}
          items={displayItems}
          weightUnit={weightUnit}
          onBack={() => setWeightAnalysisOpen(false)}
        />
      </Modal>

      <Modal visible={sourceOpen} transparent statusBarTranslucent animationType="none" onRequestClose={() => setSourceOpen(false)}>
        <AddSourceSheet theme={theme} onClose={() => setSourceOpen(false)} onSelect={(mode) => { setSourceOpen(false); setSourceMode(mode); }} />
      </Modal>

      <Modal visible={sourceMode != null} animationType="none" presentationStyle="fullScreen" onRequestClose={() => setSourceMode(null)}>
        {sourceMode ? (
          <PackingSourcePicker
            theme={theme}
            mode={sourceMode}
            sets={sets}
            gearItems={gearItems}
            categories={categories}
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

      <Modal visible={selectedItem != null} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
        {selectedItem ? (
          <PackingItemSheet
            theme={theme}
            item={controller.items.find((item) => item.id === selectedItem.id) ?? selectedItem}
            isShared={isShared}
            editable={canEdit}
            canCheck={canCheck}
            companions={controller.companions}
            currentCompanionId={controller.currentCompanionId}
            onClose={() => setSelectedItem(null)}
            onSave={(patch) => controller.updateItem(selectedItem.id, patch)}
            onDelete={async () => { await controller.deleteItem(selectedItem.id); setSelectedItem(null); }}
          />
        ) : null}
      </Modal>
    </>
  );
}

type PackingWeightCategory = {
  key: string;
  name: string;
  color?: string;
  weight: number;
};

type PackingWeightStats = {
  totalWeight: number;
  pendingWeight: number;
  itemCount: number;
  pendingCount: number;
  averageWeight: number;
  categories: PackingWeightCategory[];
  heaviestItems: JourneyPackingItem[];
};

function packingItemTotalWeight(item: JourneyPackingItem) {
  return Math.max(0, item.weightKg ?? 0) * Math.max(1, item.quantity);
}

function buildPackingWeightStats(items: JourneyPackingItem[], uncategorized: string): PackingWeightStats {
  let totalWeight = 0;
  let pendingWeight = 0;
  let itemCount = 0;
  let pendingCount = 0;
  const categories = new Map<string, PackingWeightCategory>();

  items.forEach((item) => {
    const quantity = Math.max(1, item.quantity);
    const weight = packingItemTotalWeight(item);
    const categoryName = item.categoryName || uncategorized;
    const current = categories.get(categoryName) || { key: categoryName, name: categoryName, color: item.categoryColor, weight: 0 };
    current.weight += weight;
    if (!current.color && item.categoryColor) current.color = item.categoryColor;
    categories.set(categoryName, current);
    totalWeight += weight;
    itemCount += quantity;
    if (!item.packed) {
      pendingWeight += weight;
      pendingCount += quantity;
    }
  });

  return {
    totalWeight,
    pendingWeight,
    itemCount,
    pendingCount,
    averageWeight: itemCount ? totalWeight / itemCount : 0,
    categories: [...categories.values()].filter((category) => category.weight > 0).sort((a, b) => b.weight - a.weight),
    heaviestItems: [...items].filter((item) => packingItemTotalWeight(item) > 0).sort((a, b) => packingItemTotalWeight(b) - packingItemTotalWeight(a)).slice(0, 5),
  };
}

function PackingWeightOverviewCard({ theme, items, weightUnit, onPress }: {
  theme: Theme;
  items: JourneyPackingItem[];
  weightUnit: WeightUnit;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const stats = buildPackingWeightStats(items, t('gear.uncategorized'));
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('journey.packing.weightAnalysis')}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: space.xs,
        padding: space.xxs,
        borderRadius: radius.feature,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.fieldSurface,
      }}
    >
      <PackingOverviewFact theme={theme} label={t('journey.packing.totalWeight')} value={fmtWeight(stats.totalWeight, weightUnit)} />
      <PackingOverviewFact theme={theme} label={t('gear.stat.itemCount')} value={`${stats.itemCount} ${t('gear.unit.items')}`} />
      <PackingOverviewFact theme={theme} label={t('journey.packing.pendingWeight')} value={fmtWeight(stats.pendingWeight, weightUnit)} />
      <PackingOverviewFact theme={theme} label={t('journey.packing.pendingItems')} value={`${stats.pendingCount} ${t('gear.unit.items')}`} accent={stats.pendingCount > 0} />
    </Press>
  );
}

function PackingOverviewFact({ theme, label, value, accent = false }: { theme: Theme; label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ width: '50%', minWidth: 0, minHeight: 94, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: 'space-between' }}>
      <Text numberOfLines={1} style={{ fontSize: 12.5, color: theme.text2 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 23, fontWeight: '800', color: accent ? theme.accent : theme.text }}>{value}</Text>
    </View>
  );
}

function PackingWeightAnalysisPage({ theme, items, weightUnit, onBack }: {
  theme: Theme;
  items: JourneyPackingItem[];
  weightUnit: WeightUnit;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const stats = useMemo(() => buildPackingWeightStats(items, t('gear.uncategorized')), [items, t]);
  const maxCategoryWeight = stats.categories[0]?.weight || 0;
  const topThreeWeight = stats.heaviestItems.slice(0, 3).reduce((sum, item) => sum + packingItemTotalWeight(item), 0);
  const topThreeShare = stats.totalWeight ? Math.round((topThreeWeight / stats.totalWeight) * 100) : 0;
  const heaviestCategory = stats.categories[0];
  const heaviestCategoryShare = stats.totalWeight && heaviestCategory ? Math.round((heaviestCategory.weight / stats.totalWeight) * 100) : 0;

  return (
    <DetailPage theme={theme} title={t('journey.packing.weightAnalysis')} onBack={onBack} backgroundColor={theme.featureSurface}>
      <View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md }}>
        <AppCard theme={theme} radius={radius.feature} style={{ padding: space.lg, backgroundColor: theme.fieldSurface }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            <PackingSummaryFact theme={theme} label={t('journey.packing.totalWeight')} value={fmtWeight(stats.totalWeight, weightUnit)} />
            <PackingSummaryFact theme={theme} label={t('journey.packing.averageItemWeight')} value={fmtWeight(stats.averageWeight, weightUnit)} />
            <PackingSummaryFact theme={theme} label={t('journey.packing.heaviestItem')} value={stats.heaviestItems[0] ? fmtWeight(packingItemTotalWeight(stats.heaviestItems[0]), weightUnit) : fmtWeight(0, weightUnit)} />
            <PackingSummaryFact theme={theme} label={t('journey.packing.pendingWeight')} value={fmtWeight(stats.pendingWeight, weightUnit)} accent={stats.pendingWeight > 0} />
          </View>
        </AppCard>

        {stats.categories.length ? (
          <>
            <AppSectionHeader theme={theme} text={t('journey.packing.categoryWeight')} variant="title" marginTop={space.xxl} />
            <View style={{ gap: space.xs }}>
              {stats.categories.map((category) => {
                const totalShare = stats.totalWeight ? (category.weight / stats.totalWeight) * 100 : 0;
                const relativeShare = maxCategoryWeight ? (category.weight / maxCategoryWeight) * 100 : 0;
                return (
                  <View key={category.key} style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.feature, backgroundColor: theme.surfaceTop }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }}>
                      <View style={{ width: 8, height: 8, borderRadius: 3, marginRight: space.xs, backgroundColor: category.color || theme.accent }} />
                      <Text numberOfLines={1} style={[type.body, { flex: 1, color: theme.text, fontWeight: '600' }]}>{category.name}</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{fmtWeight(category.weight, weightUnit)}</Text>
                      <Text style={{ width: 48, textAlign: 'right', fontFamily: MONO, fontSize: 10.5, color: theme.text3 }}>{totalShare.toFixed(1)}%</Text>
                    </View>
                    <AppProgressBar theme={theme} value={relativeShare} color={category.color || theme.accent} />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {stats.heaviestItems.length ? (
          <>
            <AppSectionHeader
              theme={theme}
              text={t('journey.packing.heaviestGear')}
              trailing={<Text style={[type.caption, { color: theme.text3 }]}>{t('journey.packing.topWeightShare', { share: topThreeShare })}</Text>}
              variant="title"
              marginTop={space.xxl}
            />
            <View style={{ borderRadius: radius.feature, paddingHorizontal: space.md, backgroundColor: theme.surfaceTop }}>
              {stats.heaviestItems.map((item, index) => (
                <View key={item.id} style={[{ minHeight: 68, flexDirection: 'row', alignItems: 'center' }, index < stats.heaviestItems.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline } : null]}>
                  <Text style={{ width: 28, fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{item.name}</Text>
                    <Text numberOfLines={1} style={[type.caption, { color: theme.text2, marginTop: 3 }]}>{item.categoryName || t('gear.uncategorized')}</Text>
                  </View>
                  <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: theme.text }}>{fmtWeight(packingItemTotalWeight(item), weightUnit)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {heaviestCategory ? (
          <>
            <AppSectionHeader theme={theme} text={t('journey.packing.lightweightTip')} variant="title" marginTop={space.xxl} />
            <AppCard theme={theme} radius={radius.feature} style={{ padding: space.lg, backgroundColor: theme.surfaceTop }}>
              <Text style={[type.cardTitle, { color: theme.text }]}>{t('journey.packing.lightweightTipTitle')}</Text>
              <Text style={[type.body, { color: theme.text2, lineHeight: 21, marginTop: space.xs }]}>
                {t('journey.packing.lightweightTipBody', { name: heaviestCategory.name, share: heaviestCategoryShare })}
              </Text>
            </AppCard>
          </>
        ) : null}
      </View>
    </DetailPage>
  );
}

function PackingSummaryFact({ theme, label, value, accent = false }: { theme: Theme; label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ width: '48.5%', minWidth: 0, minHeight: 62, paddingVertical: space.xs, justifyContent: 'space-between' }}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text3 }]}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ fontFamily: MONO, fontSize: 19, fontWeight: '800', color: accent ? theme.accent : theme.text, marginTop: space.xs }}>{value}</Text>
    </View>
  );
}

function PackingScopeMenu({ theme, views, activeView, currentCompanionId, filterActionRef, onSelect }: {
  theme: Theme;
  views: JourneyPackingListView[];
  activeView: JourneyPackingListView;
  currentCompanionId: number;
  filterActionRef?: React.MutableRefObject<(() => void) | null>;
  onSelect: (key: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const ordered = [...views].sort((a, b) => {
    const rank = (view: JourneyPackingListView) => view.kind === 'personal' && view.ownerCompanionId === currentCompanionId ? 0 : view.kind === 'shared' ? 1 : 2;
    return rank(a) - rank(b);
  });

  useEffect(() => {
    if (!filterActionRef) return;
    filterActionRef.current = () => setOpen(true);
    return () => {
      filterActionRef.current = null;
    };
  }, [filterActionRef]);

  return (
    <>
      <Modal visible={open} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View
            style={{
              position: 'absolute',
              right: space.lg,
              bottom: Math.max(insets.bottom, space.md) + 68,
              width: 240,
              maxHeight: 380,
              borderRadius: radius.feature,
              shadowColor: '#000000',
              shadowOpacity: theme.dark ? 0.42 : 0.16,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <Glass theme={theme} radius={radius.feature} intensity={78}>
              <View style={{ maxHeight: '100%', paddingVertical: space.sm, backgroundColor: theme.dark ? 'rgba(32,32,35,0.64)' : 'rgba(255,255,255,0.74)' }}>
                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {ordered.map((view) => {
                    const selected = view.key === activeView.key;
                    const mine = view.kind === 'personal' && view.ownerCompanionId === currentCompanionId;
                    const optionLabel = view.kind === 'shared' ? t('journey.packing.sharedShort') : mine ? t('journey.packing.me') : view.companion?.name ?? '';
                    return (
                      <Press
                        key={view.key}
                        onPress={() => {
                          onSelect(view.key);
                          setOpen(false);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={{ minHeight: 58, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                      >
                        {view.kind === 'shared' ? (
                          <View style={{ width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
                            <Icon name="people" color={theme.text2} size={16} />
                          </View>
                        ) : (
                          <ParticipantAvatar theme={theme} uri={view.companion?.avatarUrl} size={32} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={[type.body, { color: theme.text, fontWeight: selected ? '700' : '500' }]}>{optionLabel}</Text>
                          <Text style={[type.caption, { color: theme.text3, marginTop: 2 }]}>{t('journey.packing.progress', { ready: view.packedCount, total: view.items.length })}</Text>
                        </View>
                        {selected ? <Icon name="check" color={theme.accent} size={16} strokeWidth={2.4} /> : null}
                      </Press>
                    );
                  })}
                </ScrollView>
              </View>
            </Glass>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PackingEmpty({ theme, editable }: { theme: Theme; editable: boolean }) {
  const { t } = useI18n();
  return (
    <View style={{ minHeight: 230, marginTop: space.xl, paddingHorizontal: space.xl, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceTop }}>
        <Icon name="bag" color={theme.text2} size={22} />
      </View>
      <Text style={[type.cardTitle, { color: theme.text, marginTop: space.md }]}>{t('journey.packing.empty')}</Text>
      <Text style={[type.body, { color: theme.text3, textAlign: 'center', lineHeight: 20, marginTop: space.xs }]}>{editable ? t('journey.packing.emptyBody') : t('journey.packing.emptyTeammate')}</Text>
    </View>
  );
}

function PackingGroups({ theme, items, isShared, canCheck, canEdit, currentCompanionId, companions, onToggle, onClaim, onOpen, selectionMode, selectedItemIds, onSelectedItemIdsChange }: {
  theme: Theme;
  items: JourneyPackingItem[];
  isShared: boolean;
  canCheck: boolean;
  canEdit: boolean;
  currentCompanionId: number;
  companions: JourneyPackingController['companions'];
  onToggle: (item: JourneyPackingItem) => void;
  onClaim: (item: JourneyPackingItem) => void;
  onOpen: (item: JourneyPackingItem) => void;
  selectionMode: boolean;
  selectedItemIds: Set<string>;
  onSelectedItemIdsChange: (ids: Set<string>) => void;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => {
    const map = new Map<string, JourneyPackingItem[]>();
    items.forEach((item) => {
      const key = item.categoryName || '';
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [items]);
  return (
    <View>
      {groups.map(([category, rows], groupIndex) => {
        const groupWeight = rows.reduce((sum, item) => sum + (item.weightKg ?? 0) * item.quantity, 0);
        return (
          <View key={category || 'other'} style={{ marginTop: groupIndex ? space.lg : 0 }}>
            {category ? (
              <View style={{ minHeight: 28, paddingHorizontal: space.xxs, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 7, height: 7, borderRadius: 2, marginRight: space.xs, backgroundColor: rows[0]?.categoryColor || theme.accent }} />
                <Text style={[type.cardTitle, { flex: 1, color: theme.text2, fontSize: 12.5 }]}>{category}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={[type.caption, { color: theme.text3 }]}>{t('journey.checklist.itemCount', { count: rows.length })}</Text>
                  {groupWeight > 0 ? <Text style={[type.caption, { color: theme.text3 }]}>{fmtWeight(groupWeight, 'kg', true)}</Text> : null}
                </View>
              </View>
            ) : null}
            <View style={{ marginTop: category ? space.xs : 0, paddingHorizontal: space.md, borderRadius: radius.feature, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, backgroundColor: theme.fieldSurface }}>
              {rows.map((item, index) => (
                <PackingRow
                  key={item.id}
                  theme={theme}
                  item={item}
                  isShared={isShared}
                  canCheck={canCheck && (!isShared || canEdit || item.carrierCompanionId === currentCompanionId)}
                  currentCompanionId={currentCompanionId}
                  companions={companions}
                  onToggle={() => onToggle(item)}
                  onClaim={() => onClaim(item)}
                  onOpen={() => onOpen(item)}
                  selectionMode={selectionMode}
                  selected={selectedItemIds.has(item.id)}
                  onToggleSelection={() => {
                    const next = new Set(selectedItemIds);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    onSelectedItemIdsChange(next);
                  }}
                  divider={index < rows.length - 1}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PackingRow({ theme, item, isShared, canCheck, currentCompanionId, companions, onToggle, onClaim, onOpen, selectionMode, selected, onToggleSelection, divider }: {
  theme: Theme;
  item: JourneyPackingItem;
  isShared: boolean;
  canCheck: boolean;
  currentCompanionId: number;
  companions: JourneyPackingController['companions'];
  onToggle: () => void;
  onClaim: () => void;
  onOpen: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection: () => void;
  divider?: boolean;
}) {
  const { t } = useI18n();
  const carrier = companions.find((companion, index) => (companion.id ?? -(index + 1)) === item.carrierCompanionId);
  const checked = selectionMode ? selected : item.packed;
  return (
    <Press
      onPress={selectionMode ? onToggleSelection : onOpen}
      accessibilityRole={selectionMode ? 'checkbox' : 'button'}
      accessibilityState={selectionMode ? { checked: selected } : undefined}
      style={{ minHeight: 82, flexDirection: 'row', alignItems: 'center' }}
    >
      <Press
        disabled={!selectionMode && !canCheck}
        onPress={(event) => {
          event.stopPropagation();
          if (selectionMode) onToggleSelection();
          else onToggle();
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !selectionMode && !canCheck }}
        style={{ width: 42, alignSelf: 'stretch', alignItems: 'flex-start', justifyContent: 'center' }}
      >
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.7, borderColor: checked ? theme.accent : theme.text3, backgroundColor: checked ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {checked ? <Icon name="check" color="#FFF" size={14} strokeWidth={2.5} /> : null}
        </View>
      </Press>
      <View style={[{ flex: 1, minWidth: 0, alignSelf: 'stretch', paddingVertical: space.sm, justifyContent: 'center' }, divider ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline } : null]}>
        <Text numberOfLines={2} style={[type.cardTitle, { color: item.packed ? theme.text2 : theme.text }]}>{item.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
          <Text style={[type.caption, { color: theme.text2 }]}>{item.quantity > 1 ? `×${item.quantity}` : t('journey.packing.oneItem')}</Text>
          {item.weightKg != null ? <Text style={[type.caption, { color: theme.text2 }]}>{fmtWeight(item.weightKg * item.quantity, 'kg', true)}</Text> : null}
          {isShared && carrier ? (
            <Text style={[type.caption, { color: theme.text2 }]}>{item.carrierCompanionId === currentCompanionId ? t('journey.packing.carriedByMe') : t('journey.packing.carriedBy', { name: carrier.name })}</Text>
          ) : null}
          {isShared && !carrier ? <Text style={[type.caption, { color: theme.danger }]}>{t('journey.packing.noCarrier')}</Text> : null}
        </View>
      </View>
      {selectionMode ? null : isShared && !carrier && !item.packed && canCheck ? (
        <Press onPress={(event) => { event.stopPropagation(); onClaim(); }} style={{ minHeight: 34, marginLeft: space.sm, paddingHorizontal: space.sm, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceTop }}>
          <Text style={[type.caption, { color: theme.accent, fontWeight: '700' }]}>{t('journey.packing.iCarry')}</Text>
        </Press>
      ) : (
        <View style={{ width: 24, marginLeft: space.xs, alignItems: 'flex-end' }}><Icon name="chevronR" color={theme.text3} size={14} /></View>
      )}
    </Press>
  );
}

function SheetFrame({ theme, onClose, children }: { theme: Theme; onClose: () => void; children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' }}><Press onPress={onClose} style={StyleSheet.absoluteFill}><View /></Press><View style={{ maxHeight: '90%', paddingHorizontal: layout.pagePadding, paddingTop: space.sm, paddingBottom: space.xxl, borderTopLeftRadius: radius.feature, borderTopRightRadius: radius.feature, backgroundColor: theme.featureSurface }}><View style={{ width: 36, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: theme.text3, marginBottom: space.lg }} />{children}</View></View>;
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

  const rows: { id: 'gear' | 'sets' | 'templates' | 'custom'; label: string; sub: string }[] = [
    { id: 'gear', label: t('journey.packing.fromGear'), sub: t('journey.packing.fromGearSub') },
    { id: 'sets', label: t('journey.packing.fromSet'), sub: t('journey.packing.fromSetSub') },
    { id: 'templates', label: t('journey.packing.fromTemplate'), sub: t('journey.packing.fromTemplateSub') },
    { id: 'custom', label: t('journey.packing.custom'), sub: t('journey.packing.customSub') },
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

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.34)', opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>
      <Animated.View
        style={{
          transform: [{ translateY }],
          paddingTop: space.sm,
          paddingHorizontal: space.lg,
          paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          backgroundColor: theme.groupedBg,
        }}
      >
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: radius.pill, backgroundColor: theme.text3, opacity: 0.34 }} />
        <Text style={[type.pageTitle, { color: theme.text, marginTop: space.lg }]}>{t('journey.packing.add')}</Text>

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
              <Text numberOfLines={2} style={[type.body, { color: theme.text3, lineHeight: 20, marginTop: space.xs }]}>{row.sub}</Text>
            </Press>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function PackingSourcePicker({ theme, mode, sets, gearItems, categories, existingNames, saving, onBack, onAdd }: {
  theme: Theme;
  mode: 'gear' | 'sets' | 'templates' | 'custom';
  sets: GearSet[];
  gearItems: GearItem[];
  categories: GearCat[];
  existingNames: Set<string>;
  saving: boolean;
  onBack: () => void;
  onAdd: (items: JourneyPackingItemInput[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selectedSet, setSelectedSet] = useState<GearSet | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<RecommendedPackingTemplate | null>(null);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const catMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  if (mode === 'custom') return <CustomPackingItemPage theme={theme} saving={saving} onBack={onBack} onAdd={onAdd} />;

  const sourceItems: JourneyPackingItemInput[] = mode === 'gear'
    ? gearItems.map((item) => ({ sourceType: 'gear', sourceGearItemId: item.id, name: item.name, categoryName: catMap.get(item.cat)?.name, categoryColor: catMap.get(item.cat)?.color, quantity: item.qty ?? 1, weightKg: item.w, note: item.note }))
    : selectedSet
      ? selectedSet.items.map((name) => {
          const item = gearItems.find((candidate) => candidate.name === name);
          const override = item?.id != null ? selectedSet.overrides?.[String(item.id)] : selectedSet.overrides?.[name];
          return { sourceType: 'gearSet' as const, sourceGearItemId: item?.id, name, categoryName: item ? catMap.get(item.cat)?.name : undefined, categoryColor: item ? catMap.get(item.cat)?.color : undefined, quantity: override?.qty ?? item?.qty ?? 1, weightKg: item?.w, note: item?.note };
        })
      : selectedTemplate?.items ?? [];
  const filtered = sourceItems.filter((item) => !query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || item.categoryName?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectingItems = mode === 'gear' || selectedSet != null || selectedTemplate != null;
  const back = selectingItems && mode !== 'gear' ? () => { setSelectedSet(null); setSelectedTemplate(null); setSelectedNames(new Set()); } : onBack;
  const title = mode === 'gear' ? t('journey.packing.fromGear') : mode === 'sets' ? t('journey.packing.fromSet') : t('journey.packing.fromTemplate');

  return (
    <DetailPage
      theme={theme}
      onBack={back}
      title={title}
      backgroundColor={theme.groupedBg}
      right={selectingItems ? <Press disabled={!selectedNames.size || saving} onPress={() => void onAdd(sourceItems.filter((item) => selectedNames.has(item.name)))} style={{ height: 44, paddingHorizontal: space.sm, justifyContent: 'center' }}><Text style={[type.body, { color: selectedNames.size ? theme.accent : theme.text3, fontWeight: '700' }]}>{saving ? '…' : t('journey.packing.addSelected', { count: selectedNames.size })}</Text></Press> : undefined}
    >
      <View style={{ paddingHorizontal: layout.pagePadding }}>
        {selectingItems ? (
          <>
            <View style={{ height: 44, marginTop: space.md, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.featureSurface }}><Icon name="search" color={theme.text3} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder={t('journey.packing.search')} placeholderTextColor={theme.text3} style={[type.body, { flex: 1, color: theme.text }]} /></View>
            <View style={{ marginTop: space.lg, borderRadius: radius.card, overflow: 'hidden', backgroundColor: theme.featureSurface }}>
              {filtered.map((item, index) => {
                const exists = existingNames.has(item.name);
                const selected = selectedNames.has(item.name);
                return <Press key={`${item.name}:${index}`} disabled={exists} onPress={() => setSelectedNames((current) => { const next = new Set(current); if (next.has(item.name)) next.delete(item.name); else next.add(item.name); return next; })} style={[{ minHeight: 64, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' }, index < filtered.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline } : null]}><View style={{ width: 38 }}><View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.7, borderColor: selected ? theme.accent : theme.text3, backgroundColor: selected ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{selected ? <Icon name="check" color="#FFF" size={14} strokeWidth={2.5} /> : null}</View></View><View style={{ flex: 1 }}><Text style={[type.cardTitle, { color: exists ? theme.text3 : theme.text }]}>{item.name}</Text>{item.categoryName ? <Text style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{item.categoryName}</Text> : null}</View>{exists ? <Text style={[type.caption, { color: theme.text3 }]}>{t('journey.packing.added')}</Text> : null}</Press>;
              })}
            </View>
          </>
        ) : mode === 'sets' ? (
          <View style={{ marginTop: space.md }}>{sets.map((set) => <Press key={set.id} onPress={() => { setSelectedSet(set); setSelectedNames(new Set()); }} style={{ minHeight: 76, paddingHorizontal: space.md, marginBottom: space.sm, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.featureSurface }}><View style={{ flex: 1 }}><Text style={[type.cardTitle, { color: theme.text }]}>{set.name}</Text><Text style={[type.caption, { color: theme.text2, marginTop: space.xxs }]}>{t('journey.checklist.itemCount', { count: set.items.length })}</Text></View><Icon name="chevronR" color={theme.text3} size={16} /></Press>)}</View>
        ) : (
          <View style={{ marginTop: space.md }}>{RECOMMENDED_PACKING_TEMPLATES.map((template) => <Press key={template.id} onPress={() => { setSelectedTemplate(template); setSelectedNames(new Set()); }} style={{ minHeight: 92, padding: space.md, marginBottom: space.sm, borderRadius: radius.feature, backgroundColor: theme.featureSurface }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[type.sectionTitle, { flex: 1, color: theme.text }]}>{template.name}</Text><Icon name="chevronR" color={theme.text3} size={16} /></View><Text style={[type.body, { color: theme.text2, lineHeight: 21, marginTop: space.xs }]}>{template.description}</Text><Text style={[type.caption, { color: theme.text3, marginTop: space.sm }]}>{t('journey.checklist.itemCount', { count: template.items.length })}</Text></Press>)}</View>
        )}
      </View>
    </DetailPage>
  );
}

function CustomPackingItemPage({ theme, saving, onBack, onAdd }: { theme: Theme; saving: boolean; onBack: () => void; onAdd: (items: JourneyPackingItemInput[]) => Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  return <DetailPage theme={theme} onBack={onBack} title={t('journey.packing.custom')} backgroundColor={theme.groupedBg} right={<Press disabled={!name.trim() || saving} onPress={() => void onAdd([{ sourceType: 'custom', name: name.trim(), categoryName: categoryName.trim() || undefined, quantity, weightKg: weight.trim() && Number.isFinite(Number(weight)) ? Number(weight) : undefined, note: note.trim() || undefined }])} style={{ height: 44, paddingHorizontal: space.sm, justifyContent: 'center' }}><Text style={[type.body, { color: name.trim() ? theme.accent : theme.text3, fontWeight: '700' }]}>{saving ? '…' : t('common.add')}</Text></Press>}><View style={{ paddingHorizontal: layout.pagePadding, paddingTop: space.md }}><FormLabel theme={theme} text={t('journey.packing.name')} /><FormInput theme={theme} value={name} onChangeText={setName} placeholder={t('journey.packing.namePlaceholder')} /><FormLabel theme={theme} text={t('journey.packing.category')} /><FormInput theme={theme} value={categoryName} onChangeText={setCategoryName} placeholder={t('journey.packing.categoryPlaceholder')} /><View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center' }}><Text style={[type.body, { flex: 1, color: theme.text }]}>{t('journey.packing.quantity')}</Text><Press onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={circleControl(theme)}><Text style={[type.sectionTitle, { color: theme.text }]}>−</Text></Press><Text style={[type.metric, { width: 48, color: theme.text, textAlign: 'center' }]}>{quantity}</Text><Press onPress={() => setQuantity((value) => value + 1)} style={circleControl(theme)}><Icon name="plus" color={theme.text} size={16} /></Press></View><FormLabel theme={theme} text={t('journey.packing.weight')} /><FormInput theme={theme} value={weight} onChangeText={setWeight} placeholder="0.0 kg" keyboardType="decimal-pad" /><FormLabel theme={theme} text={t('journey.packing.note')} /><TextInput value={note} onChangeText={setNote} multiline placeholder={t('journey.packing.notePlaceholder')} placeholderTextColor={theme.text3} style={[type.body, { minHeight: 96, padding: space.md, borderRadius: radius.control, color: theme.text, backgroundColor: theme.featureSurface, textAlignVertical: 'top' }]} /></View></DetailPage>;
}

function FormLabel({ theme, text }: { theme: Theme; text: string }) { return <Text style={[type.eyebrow, { color: theme.text3, marginTop: space.lg, marginBottom: space.xs }]}>{text}</Text>; }
function FormInput({ theme, ...props }: { theme: Theme } & React.ComponentProps<typeof TextInput>) { return <TextInput placeholderTextColor={theme.text3} {...props} style={[type.body, { height: 46, paddingHorizontal: space.md, borderRadius: radius.control, color: theme.text, backgroundColor: theme.featureSurface }, props.style]} />; }
function circleControl(theme: Theme) { return { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: theme.fieldSurface }; }

function PackingItemSheet({ theme, item, isShared, editable, canCheck, companions, currentCompanionId, onClose, onSave, onDelete }: {
  theme: Theme;
  item: JourneyPackingItem;
  isShared: boolean;
  editable: boolean;
  canCheck: boolean;
  companions: JourneyPackingController['companions'];
  currentCompanionId: number;
  onClose: () => void;
  onSave: (patch: Partial<Pick<JourneyPackingItem, 'name' | 'quantity' | 'weightKg' | 'note' | 'packed' | 'carrierCompanionId'>>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [weight, setWeight] = useState(item.weightKg == null ? '' : String(item.weightKg));
  const [note, setNote] = useState(item.note ?? '');
  const [carrierOpen, setCarrierOpen] = useState(false);
  const carrier = companions.find((companion, index) => (companion.id ?? -(index + 1)) === item.carrierCompanionId);
  const canToggle = canCheck && (!isShared || editable || item.carrierCompanionId === currentCompanionId);
  const saveDetails = async () => {
    await onSave({ name: name.trim() || item.name, quantity, weightKg: weight.trim() && Number.isFinite(Number(weight)) ? Number(weight) : undefined, note: note.trim() || undefined });
    onClose();
  };
  return <SheetFrame theme={theme} onClose={onClose}><ScrollView showsVerticalScrollIndicator={false}><Text style={[type.pageTitle, { color: theme.text }]}>{item.name}</Text><Press disabled={!canToggle} onPress={() => void onSave({ packed: !item.packed })} style={{ minHeight: 58, marginTop: space.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}><Text style={[type.body, { flex: 1, color: theme.text2 }]}>{t('journey.packing.status')}</Text><Text style={[type.body, { color: item.packed ? theme.accent : theme.text, fontWeight: '600' }]}>{item.packed ? t('journey.packing.packed') : t('journey.packing.notPacked')}</Text></Press>{isShared ? <View><Press disabled={!editable && item.carrierCompanionId !== currentCompanionId && item.carrierCompanionId != null} onPress={() => setCarrierOpen((open) => !open)} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.hairline }}><Text style={[type.body, { flex: 1, color: theme.text2 }]}>{t('journey.packing.carrier')}</Text><Text style={[type.body, { color: carrier ? theme.text : theme.danger, fontWeight: '600' }]}>{carrier?.name ?? t('journey.packing.noCarrier')}</Text><Icon name="chevronDown" color={theme.text3} size={15} /></Press>{carrierOpen ? <View style={{ paddingHorizontal: space.md, borderRadius: radius.card, backgroundColor: theme.fieldSurface }}><PackingChoice theme={theme} label={t('journey.packing.noCarrier')} selected={!carrier} onPress={() => { void onSave({ carrierCompanionId: undefined }); setCarrierOpen(false); }} />{companions.filter((companion, index) => editable || (companion.id ?? -(index + 1)) === currentCompanionId).map((companion, index) => { const originalIndex = companions.indexOf(companion); const id = companion.id ?? -(originalIndex + 1); return <PackingChoice key={id} theme={theme} label={companion.name} selected={item.carrierCompanionId === id} onPress={() => { void onSave({ carrierCompanionId: id }); setCarrierOpen(false); }} />; })}</View> : null}</View> : null}{editable ? <><FormLabel theme={theme} text={t('journey.packing.name')} /><FormInput theme={theme} value={name} onChangeText={setName} /><View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center' }}><Text style={[type.body, { flex: 1, color: theme.text }]}>{t('journey.packing.quantity')}</Text><Press onPress={() => setQuantity((value) => Math.max(1, value - 1))} style={circleControl(theme)}><Text style={[type.sectionTitle, { color: theme.text }]}>−</Text></Press><Text style={[type.metric, { width: 48, color: theme.text, textAlign: 'center' }]}>{quantity}</Text><Press onPress={() => setQuantity((value) => value + 1)} style={circleControl(theme)}><Icon name="plus" color={theme.text} size={16} /></Press></View><FormLabel theme={theme} text={t('journey.packing.weight')} /><FormInput theme={theme} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /><FormLabel theme={theme} text={t('journey.packing.note')} /><TextInput value={note} onChangeText={setNote} multiline placeholder={t('journey.packing.notePlaceholder')} placeholderTextColor={theme.text3} style={[type.body, { minHeight: 76, padding: space.md, borderRadius: radius.control, color: theme.text, backgroundColor: theme.fieldSurface, textAlignVertical: 'top' }]} /><Press onPress={() => void saveDetails()} style={{ height: 44, marginTop: space.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}><Text style={[type.body, { color: '#FFF', fontWeight: '700' }]}>{t('common.save')}</Text></Press><Press onPress={() => Alert.alert(t('journey.packing.deleteTitle', { name: item.name }), t('journey.packing.deleteBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => void onDelete() }])} style={{ height: 48, marginTop: space.sm, alignItems: 'center', justifyContent: 'center' }}><Text style={[type.body, { color: theme.danger, fontWeight: '600' }]}>{t('journey.packing.delete')}</Text></Press></> : item.note ? <Text style={[type.body, { color: theme.text2, lineHeight: 21, marginTop: space.lg }]}>{item.note}</Text> : null}</ScrollView></SheetFrame>;
}

function PackingChoice({ theme, label, selected, onPress }: { theme: Theme; label: string; selected: boolean; onPress: () => void }) { return <Press onPress={onPress} style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center' }}><Text style={[type.body, { flex: 1, color: theme.text }]}>{label}</Text>{selected ? <Icon name="check" color={theme.accent} size={18} strokeWidth={2.3} /> : null}</Press>; }
