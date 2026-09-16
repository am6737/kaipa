import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { Theme } from '../../theme/theme';
import { Poi } from '../../data/pois';
import type { TLRow } from '../../data/timeline';
import type { JourneyPackingItem, JourneyPackingListView } from '../../data/journeyPacking';
import { fmtWeight, itemStatus, type GearItem, type WeightUnit } from '../../data/gear';
import { useData } from '../../data/DataContext';
import { radius, space, type } from '../../design-system';
import { createMediaLibraryAsset, requestMediaLibraryPermissions } from '../../lib/mediaLibrary';
import { useTimeline } from '../../hooks/useTimeline';
import { useJourneyPacking } from '../../hooks/useJourneyPacking';
import { useI18n, TKey } from '../../i18n';
import { Press } from '../Press';

const formatTime = (minutes?: number) => {
  if (minutes == null) return '';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
};

const formatTimeRange = (row: TLRow) => {
  const start = formatTime(row.timeStart);
  if (!start) return '';
  const end = formatTime(row.timeEnd);
  return end && end !== start ? `${start}–${end}` : start;
};

const formatPackingWeight = (weightKg?: number) => {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return '';
  if (weightKg < 1) return `${Math.round(weightKg * 1000)} g`;
  return `${weightKg >= 10 ? weightKg.toFixed(1) : weightKg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} kg`;
};

type PosterPackingItem = JourneyPackingItem & {
  resolvedWeightKg?: number;
  carryStatus: ReturnType<typeof itemStatus>;
};

function packingWeightStats(items: PosterPackingItem[]) {
  let base = 0;
  let worn = 0;
  let consumable = 0;
  items.forEach((item) => {
    const weight = Math.max(0, item.resolvedWeightKg ?? 0) * Math.max(1, item.quantity);
    if (!weight) return;
    if (item.carryStatus === 'worn') worn += weight;
    else if (item.carryStatus === 'consumable') consumable += weight;
    else if (item.carryStatus !== 'optional') base += weight;
  });
  return { pack: base + consumable, base, consumable, worn };
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.68}
      style={styles.metricItem}
    >
      <Text style={styles.metricLabel}>{label} </Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Text>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function EmptySection({ children }: { children: React.ReactNode }) {
  return <Text style={styles.emptyText}>{children}</Text>;
}

function ItinerarySection({
  groups,
  loading,
  t,
}: {
  groups: { key: string; label: string; rows: TLRow[] }[];
  loading: boolean;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title={t('poster.document.itinerary')} />
      {loading ? (
        <EmptySection>{t('poster.document.loading')}</EmptySection>
      ) : groups.length ? groups.map((group) => (
        <View key={group.key} style={styles.documentGroup}>
          <Text style={styles.groupTitle}>{group.label}</Text>
          {group.rows.map((row) => {
            const time = formatTimeRange(row);
            return (
              <View key={row.id} style={styles.documentRow}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, row.checked && styles.completedText]}>{row.title}</Text>
                </View>
                {time ? <Text style={styles.rowTime}>{time}</Text> : null}
              </View>
            );
          })}
        </View>
      )) : (
        <EmptySection>{t('journey.empty.timeline')}</EmptySection>
      )}
    </View>
  );
}

function ChecklistSection({
  views,
  gearItems,
  weightUnit,
  loading,
  t,
}: {
  views: JourneyPackingListView[];
  gearItems: GearItem[];
  weightUnit: WeightUnit;
  loading: boolean;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}) {
  const gearItemsById = new Map(gearItems.map((item) => [item.id, item]));
  const gearItemsByName = new Map(gearItems.map((item) => [item.name.trim().toLocaleLowerCase(), item]));
  const categoryMap = new Map<string, PosterPackingItem[]>();
  const allItems: PosterPackingItem[] = [];
  const seenItemIds = new Set<string>();
  views.forEach((view) => {
    view.items.forEach((item) => {
      if (seenItemIds.has(item.id)) return;
      seenItemIds.add(item.id);
      const linkedGearItem = (item.sourceGearItemId != null ? gearItemsById.get(item.sourceGearItemId) : undefined)
        ?? gearItemsByName.get(item.name.trim().toLocaleLowerCase());
      const displayItem: PosterPackingItem = {
        ...item,
        resolvedWeightKg: item.weightKg ?? linkedGearItem?.w,
        carryStatus: item.carryStatus ?? (linkedGearItem ? itemStatus(linkedGearItem) : 'packed'),
      };
      allItems.push(displayItem);
      const category = item.categoryName?.trim() || t('gear.uncategorized');
      const items = categoryMap.get(category) ?? [];
      items.push(displayItem);
      categoryMap.set(category, items);
    });
  });
  const stats = packingWeightStats(allItems);
  const weightSummary = [
    stats.pack > 0 ? { label: t('gear.pack.pack'), value: fmtWeight(stats.pack, weightUnit, true) } : null,
    stats.base > 0 ? { label: t('gear.pack.base'), value: fmtWeight(stats.base, weightUnit, true) } : null,
    stats.consumable > 0 ? { label: t('gear.pack.consumable'), value: fmtWeight(stats.consumable, weightUnit, true) } : null,
    stats.worn > 0 ? { label: t('gear.pack.worn'), value: fmtWeight(stats.worn, weightUnit, true) } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const categoryGroups = [...categoryMap.entries()].map(([category, items]) => ({ category, items }));
  const checklistColumns = categoryGroups.reduce<{
    groups: typeof categoryGroups;
    score: number;
  }[]>((columns, group) => {
    const score = 2 + group.items.reduce(
      (sum, item) => sum + Math.max(1, Math.ceil(item.name.length / 12)),
      0,
    );
    const target = columns[0].score <= columns[1].score ? columns[0] : columns[1];
    target.groups.push(group);
    target.score += score;
    return columns;
  }, [
    { groups: [], score: 0 },
    { groups: [], score: 0 },
  ]);

  const renderCategory = (group: (typeof categoryGroups)[number]) => {
    const quantity = group.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
    const weightedItems = group.items.filter((item) => item.resolvedWeightKg != null && item.resolvedWeightKg > 0);
    const totalWeight = weightedItems.reduce(
      (sum, item) => sum + (item.resolvedWeightKg ?? 0) * Math.max(1, item.quantity),
      0,
    );
    return (
      <View key={group.category} style={styles.checklistGroup}>
        <View style={styles.categoryHeading}>
          <Text numberOfLines={1} style={styles.groupTitle}>{group.category}</Text>
          <Text numberOfLines={1} style={styles.categorySummary}>
            {weightedItems.length
              ? t('poster.document.categorySummary', { count: quantity, weight: formatPackingWeight(totalWeight) })
              : t('poster.document.categoryCount', { count: quantity })}
          </Text>
        </View>
        {group.items.map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <Text style={styles.checklistName}>{item.name}</Text>
            <Text style={styles.checklistWeight}>{formatPackingWeight(item.resolvedWeightKg)}</Text>
            <Text style={styles.checklistQuantity}>{Math.max(1, item.quantity)}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <SectionTitle title={t('poster.document.checklist')} />
      {weightSummary.length ? (
        <View style={styles.weightSummary}>
          {weightSummary.map((item) => (
            <Text key={item.label} numberOfLines={1} style={styles.weightSummaryItem}>
              {item.label} {item.value}
            </Text>
          ))}
        </View>
      ) : null}
      {loading ? (
        <EmptySection>{t('poster.document.loading')}</EmptySection>
      ) : categoryGroups.length ? (
        <View style={styles.checklistGrid}>
          {checklistColumns.map((column, index) => (
            <View key={index} style={styles.checklistColumn}>
              {column.groups.map(renderCategory)}
            </View>
          ))}
        </View>
      ) : (
        <EmptySection>{t('poster.document.emptyChecklist')}</EmptySection>
      )}
    </View>
  );
}

function JourneyDocument({
  poi,
  timelineGroups,
  timelineLoading,
  packingViews,
  gearItems,
  weightUnit,
  packingLoading,
  minimumHeight,
  topInset = 0,
  onLayout,
  t,
}: {
  poi: Poi;
  timelineGroups: { key: string; label: string; rows: TLRow[] }[];
  timelineLoading: boolean;
  packingViews: JourneyPackingListView[];
  gearItems: GearItem[];
  weightUnit: WeightUnit;
  packingLoading: boolean;
  minimumHeight?: number;
  topInset?: number;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}) {
  const elevations = poi.trackElevation?.map((point) => point.ele).filter(Number.isFinite) ?? [];
  const highestElevation = elevations.length ? `${Math.round(Math.max(...elevations))} m` : '—';
  const journeyDate = poi.plannedDate || poi.date;
  const journeyDuration = poi.days
    || (poi.totalDays ? t('journeyEdit.meta.days', { count: poi.totalDays }) : '—');

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.document,
        minimumHeight ? { minHeight: minimumHeight } : null,
        topInset > 0 ? { paddingTop: Math.max(styles.document.paddingTop, topInset) } : null,
      ]}
    >
      <View style={styles.documentBrand}>
        <Text style={styles.documentBrandText}>KAIPA</Text>
      </View>
      <View style={styles.documentHeader}>
        <Text style={styles.documentTitle}>{poi.name}</Text>
      </View>

      <View style={styles.metricsBlock}>
        <OverviewMetric
          label={t(journeyDate ? 'journey.stat.date' : 'journey.stat.days')}
          value={journeyDate || journeyDuration}
        />
        <OverviewMetric label={t('journey.stat.distance')} value={poi.dist || '—'} />
        <OverviewMetric label={t('journey.stat.highest')} value={highestElevation} />
      </View>
      {poi.desc ? <Text style={styles.summaryText}>{poi.desc}</Text> : null}

      <ItinerarySection groups={timelineGroups} loading={timelineLoading} t={t} />
      <ChecklistSection views={packingViews} gearItems={gearItems} weightUnit={weightUnit} loading={packingLoading} t={t} />
    </View>
  );
}

export function SharePoster({
  theme,
  poi,
  userId,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  userId: string;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const { items: gearItems, profile } = useData();
  const insets = useSafeAreaInsets();
  const screenDimensions = Dimensions.get('screen');
  const viewShotRef = useRef<any>(null);
  const timeline = useTimeline(poi.kind === 'journey' ? poi.id : undefined, userId);
  const packing = useJourneyPacking({ journey: poi, userId });

  const timelineGroups = useMemo(() => {
    const orderedNames = [...timeline.knownGroups];
    timeline.rows.forEach((row) => {
      const name = row.day.trim() || t('journey.timeline.ungrouped');
      if (!orderedNames.includes(name)) orderedNames.push(name);
    });
    return orderedNames
      .map((name, index) => ({
        key: `${name}:${index}`,
        label: name || t('journey.timeline.ungrouped'),
        rows: timeline.rows.filter((row) => (row.day.trim() || t('journey.timeline.ungrouped')) === name),
      }))
      .filter((group) => group.rows.length > 0);
  }, [t, timeline.knownGroups, timeline.rows]);

  const visiblePackingViews = useMemo(
    () => packing.views.filter((view) => (
      view.kind === 'shared' || view.ownerCompanionId === packing.currentCompanionId
    )),
    [packing.currentCompanionId, packing.views],
  );
  const contentLoading = timeline.loading || packing.loading;
  const [documentWidth, setDocumentWidth] = useState(0);
  const [exportReady, setExportReady] = useState(false);
  const exportWidth = Math.ceil(screenDimensions.width);
  const minimumDocumentHeight = screenDimensions.width > 0
    ? Math.ceil(exportWidth * (screenDimensions.height / screenDimensions.width))
    : undefined;


  const captureDocument = useCallback(async () => {
    if (!exportReady || !viewShotRef.current) throw new Error('Export view is not ready');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return captureRef(viewShotRef, { format: 'png', quality: 1 });
  }, [exportReady]);

  const doShare = useCallback(async () => {
    try {
      const uri = await captureDocument();
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `${poi.name || 'kaipa'}.png`;
        link.click();
        onToast(t('poster.saved'));
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: poi.name });
      } else {
        await Share.share({ url: uri });
      }
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.warn('[SharePoster] share error:', error);
        onToast(t('poster.exportFailed'));
      }
    }
  }, [captureDocument, onToast, poi.name, t]);

  const doSave = useCallback(async () => {
    try {
      const uri = await captureDocument();
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `${poi.name || 'kaipa'}.png`;
        link.click();
      } else {
        const { status } = await requestMediaLibraryPermissions(true);
        if (status !== 'granted') {
          onToast(t('poster.permissionRequired'));
          return;
        }
        await createMediaLibraryAsset(uri);
      }
      onToast(t('poster.saved'));
    } catch (error) {
      console.warn('[SharePoster] save error:', error);
      onToast(t('poster.exportFailed'));
    }
  }, [captureDocument, onToast, poi.name, t]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.page, { backgroundColor: theme.groupedBg }]}>
      {!contentLoading && documentWidth > 0 && exportWidth > 0 && minimumDocumentHeight != null ? (
        <View pointerEvents="none" style={styles.exportLayer}>
          <ViewShot
            ref={viewShotRef}
            style={[styles.captureSurface, { width: exportWidth }]}
            options={{ format: 'png', quality: 1 }}
          >
            <JourneyDocument
              poi={poi}
              timelineGroups={timelineGroups}
              timelineLoading={false}
              packingViews={visiblePackingViews}
              gearItems={gearItems}
              weightUnit={profile.gearWeightUnit || 'kg'}
              packingLoading={false}
              minimumHeight={minimumDocumentHeight}
              topInset={Platform.OS === 'ios' ? insets.top : 0}
              onLayout={() => setExportReady(true)}
              t={t}
            />
          </ViewShot>
        </View>
      ) : null}

      <View style={[StyleSheet.absoluteFill, styles.foreground, { backgroundColor: theme.groupedBg }]}>
      <SafeAreaView edges={['top']} style={styles.topSafeArea}>
        <View style={styles.topBar}>
          <Press
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.topAction}
          >
            <Text style={[styles.topActionText, { color: theme.text }]}>{t('common.cancel')}</Text>
          </Press>
        </View>
      </SafeAreaView>

      {contentLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.accent} size="small" />
          <Text style={[type.body, styles.loadingText, { color: theme.text2 }]}>{t('poster.document.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={[
            styles.previewContent,
            { paddingBottom: Math.max(insets.bottom, space.md) + 94 },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View
            style={styles.previewFrame}
            onLayout={(event) => setDocumentWidth(Math.round(event.nativeEvent.layout.width))}
          >
            <JourneyDocument
              poi={poi}
              timelineGroups={timelineGroups}
              timelineLoading={false}
              packingViews={visiblePackingViews}
              gearItems={gearItems}
              weightUnit={profile.gearWeightUnit || 'kg'}
              packingLoading={false}
              t={t}
            />
          </View>
        </ScrollView>
      )}

      {!contentLoading ? (
        <View pointerEvents="box-none" style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={styles.actionGroup}>
            <Press
              onPress={() => void doShare()}
              accessibilityRole="button"
              accessibilityLabel={t('poster.share')}
              style={styles.shareButton}
            >
              <Text style={styles.shareButtonText}>{t('poster.share')}</Text>
            </Press>
            <Press
              onPress={() => void doSave()}
              accessibilityRole="button"
              accessibilityLabel={t('poster.saveToAlbum')}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>{t('poster.saveToAlbum')}</Text>
            </Press>
          </View>
        </View>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    zIndex: 60,
  },
  foreground: {
    zIndex: 1,
  },
  topSafeArea: {
    flexShrink: 0,
  },
  topBar: {
    height: 58,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  topAction: {
    alignSelf: 'flex-start',
    minWidth: 54,
    height: 44,
    justifyContent: 'center',
  },
  topActionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
  },
  loadingText: {
    marginTop: space.sm,
  },
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  previewFrame: {
    overflow: 'hidden',
    borderRadius: radius.feature,
    backgroundColor: '#FFFFFF',
  },
  exportLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  captureSurface: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  actionGroup: {
    flexDirection: 'row',
    gap: space.xs,
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  shareButton: {
    minWidth: 92,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    minWidth: 154,
    height: 46,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },

  document: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
  },
  documentBrand: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 1,
  },
  documentBrandText: {
    color: '#999999',
    fontSize: 7.5,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  documentHeader: {
    paddingHorizontal: 48,
    paddingBottom: 2,
    alignItems: 'center',
  },
  documentTitle: {
    color: '#111111',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  metricsBlock: {
    flexDirection: 'row',
    paddingTop: 10,
  },
  metricItem: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 3,
    color: '#111111',
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: 'center',
  },
  metricValue: {
    color: '#555555',
    fontWeight: '400',
  },
  metricLabel: {
    color: '#555555',
    fontWeight: '400',
  },
  summaryText: {
    color: '#333333',
    fontSize: 12.5,
    lineHeight: 20,
    marginTop: 12,
  },
  section: {
    paddingTop: 20,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#111111',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  documentGroup: {
    marginBottom: 14,
  },
  weightSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
    marginBottom: 10,
  },
  weightSummaryItem: {
    color: '#555555',
    fontSize: 9,
    lineHeight: 14,
  },
  checklistGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  checklistColumn: {
    flex: 1,
    minWidth: 0,
  },
  checklistGroup: {
    marginBottom: 12,
  },
  categoryHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 5,
    marginBottom: 4,
  },
  groupTitle: {
    flex: 1,
    minWidth: 0,
    color: '#111111',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
  },
  categorySummary: {
    flexShrink: 0,
    color: '#777777',
    fontSize: 8,
    lineHeight: 13,
    textAlign: 'right',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 1,
  },
  checklistName: {
    flex: 1,
    minWidth: 0,
    color: '#292929',
    fontSize: 9.5,
    lineHeight: 14,
  },
  checklistWeight: {
    width: 40,
    marginLeft: 4,
    color: '#666666',
    fontSize: 8,
    lineHeight: 14,
    textAlign: 'right',
  },
  checklistQuantity: {
    width: 14,
    marginLeft: 3,
    color: '#666666',
    fontSize: 8,
    lineHeight: 14,
    textAlign: 'right',
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: '#292929',
    fontSize: 12,
    lineHeight: 19,
  },
  completedText: {
    color: '#888888',
  },
  rowTime: {
    color: '#777777',
    fontSize: 10.5,
    lineHeight: 19,
    marginLeft: 10,
  },
  emptyText: {
    color: '#888888',
    fontSize: 11.5,
    lineHeight: 19,
  },
});
