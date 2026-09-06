import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Copy, CornerDownLeft, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReAnimated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { hexToRgb, Theme } from '../theme/theme';
import { useI18n } from '../i18n';
import { useNav } from '../nav/NavContext';
import { useData } from '../data/DataContext';
import type { Poi } from '../data/pois';
import { Press } from '../components/Press';
import { AssistantMark } from '../components/assistant/AssistantMark';
import { JourneyCreateMenu } from '../components/journey/JourneyCreateMenu';
import { JourneyPlanCard, journeyStartDate, journeyStatus, type JourneyStatus } from '../components/journey/JourneyPlanCard';
import { usePinnedJourneys } from '../components/journey/usePinnedJourneys';
import { AppActionDialog, layout, radius, space, type } from '../design-system';

type JourneyFilter = 'all' | 'planned' | 'active' | 'completed';
const JOURNEY_SWIPE_SPRING = { mass: 0.7, damping: 22, stiffness: 240, overshootClamping: true } as const;

function accentTint(theme: Theme, strength: number) {
  const [r, g, b] = hexToRgb(theme.accent);
  const base = theme.dark ? 0 : 255;
  const mix = (channel: number) => Math.round(base + (channel - base) * strength);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function JourneySwipeActions({
  progress,
  theme,
  pinned,
  deleting,
  disabled,
  onPin,
  onCopy,
  onDelete,
}: {
  progress: SharedValue<number>;
  theme: Theme;
  pinned: boolean;
  deleting: boolean;
  disabled: boolean;
  onPin: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [0, 0.62, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [32, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <ReAnimated.View style={[styles.swipeActions, animatedStyle]}>
      <Press disabled={disabled} accessibilityRole="button" accessibilityLabel={t('journeyHome.action.copy')} onPress={onCopy} style={styles.swipeAction}>
        <View style={[styles.swipeIconCircle, { backgroundColor: theme.controlSurface }]}>
          <Copy size={23} color={theme.text} strokeWidth={2.1} />
        </View>
        <Text numberOfLines={1} style={[styles.swipeActionLabel, { color: theme.text }]}>{t('journeyHome.action.copy')}</Text>
      </Press>
      <Press accessibilityRole="button" accessibilityLabel={t(pinned ? 'journeyHome.action.unpin' : 'journeyHome.action.pin')} onPress={onPin} style={styles.swipeAction}>
        <View style={[styles.swipeIconCircle, { backgroundColor: theme.controlSurface }]}>
          {pinned ? <PinOff size={23} color={theme.text} strokeWidth={2.1} /> : <Pin size={23} color={theme.text} strokeWidth={2.1} />}
        </View>
        <Text numberOfLines={1} style={[styles.swipeActionLabel, { color: theme.text }]}>
          {t(pinned ? 'journeyHome.action.unpin' : 'journeyHome.action.pin')}
        </Text>
      </Press>
      <Press disabled={disabled} accessibilityRole="button" accessibilityLabel={t('journeyHome.action.delete')} onPress={onDelete} style={styles.swipeAction}>
        <View style={styles.swipeIconCircle}>
          {deleting ? <ActivityIndicator color={theme.danger} /> : <Trash2 size={23} color={theme.danger} strokeWidth={2.1} />}
        </View>
        <Text numberOfLines={1} style={[styles.swipeActionLabel, { color: theme.danger }]}>{t('journeyHome.action.delete')}</Text>
      </Press>
    </ReAnimated.View>
  );
}

export function JourneyScreen({ theme }: { theme: Theme }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const journeys = data.journeys;
  const [filter, setFilter] = useState<JourneyFilter>('all');
  const [deleteCandidate, setDeleteCandidate] = useState<Poi | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const [duplicatingId, setDuplicatingId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [heroVersion, setHeroVersion] = useState(0);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const suppressedCardIdsRef = useRef<Set<string>>(new Set());
  const pressResetTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const swipeableMethodsRef = useRef<Map<string, SwipeableMethods>>(new Map());
  const openSwipeableRef = useRef<{ id: string; methods: SwipeableMethods } | null>(null);
  const { pinnedIds, setPinned } = usePinnedJourneys();

  useEffect(() => () => {
    pressResetTimersRef.current.forEach(clearTimeout);
    pressResetTimersRef.current.clear();
    swipeableMethodsRef.current.clear();
    openSwipeableRef.current = null;
  }, []);

  const orderedJourneys = useMemo(() => journeys.slice().sort((a, b) => {
    const now = new Date();
    const rank: Record<JourneyStatus, number> = { active: 0, planned: 1, unscheduled: 2, completed: 3 };
    const pinnedDelta = Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id));
    if (pinnedDelta) return pinnedDelta;
    const delta = rank[journeyStatus(a, now)] - rank[journeyStatus(b, now)];
    if (delta) return delta;
    const aStart = journeyStartDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bStart = journeyStartDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  }), [journeys, pinnedIds]);
  const visibleJourneys = filter === 'all'
    ? orderedJourneys
    : orderedJourneys.filter((journey) => journeyStatus(journey) === filter);
  const nextJourney = orderedJourneys.find((journey) => ['active', 'planned'].includes(journeyStatus(journey)));
  const heroContents = nextJourney
    ? [
        {
          title: t('journeyHome.hero.upcomingTitle', { name: nextJourney.name }),
          suggestions: [
            { label: t('journeyHome.hero.upcomingItinerary'), prompt: t('journeyHome.hero.upcomingItineraryPrompt', { name: nextJourney.name }) },
            { label: t('journeyHome.hero.upcomingPacking'), prompt: t('journeyHome.hero.upcomingPackingPrompt', { name: nextJourney.name }) },
          ],
        },
        {
          title: t('journeyHome.hero.upcomingCheckTitle', { name: nextJourney.name }),
          suggestions: [
            { label: t('journeyHome.hero.upcomingGaps'), prompt: t('journeyHome.hero.upcomingGapsPrompt', { name: nextJourney.name }) },
            { label: t('journeyHome.hero.upcomingGearReview'), prompt: t('journeyHome.hero.upcomingGearReviewPrompt', { name: nextJourney.name }) },
          ],
        },
        {
          title: t('journeyHome.hero.upcomingRouteTitle', { name: nextJourney.name }),
          suggestions: [
            { label: t('journeyHome.hero.upcomingStops'), prompt: t('journeyHome.hero.upcomingStopsPrompt', { name: nextJourney.name }) },
            { label: t('journeyHome.hero.upcomingTodos'), prompt: t('journeyHome.hero.upcomingTodosPrompt', { name: nextJourney.name }) },
          ],
        },
      ]
    : [
        {
          title: t('journeyHome.hero.returnTitle'),
          suggestions: [
            { label: t('journeyHome.hero.createJourney'), prompt: t('journeyHome.hero.createJourneyPrompt') },
            { label: t('journeyHome.hero.startFromRoute'), prompt: t('journeyHome.hero.startFromRoutePrompt') },
          ],
        },
        {
          title: t('journeyHome.hero.seasonTitle'),
          suggestions: [
            { label: t('journeyHome.hero.weekendPlan'), prompt: t('journeyHome.hero.weekendPlanPrompt') },
            { label: t('journeyHome.hero.packingPlan'), prompt: t('journeyHome.hero.packingPlanPrompt') },
          ],
        },
        {
          title: t('journeyHome.hero.easyStartTitle'),
          suggestions: [
            { label: t('journeyHome.hero.uploadTrack'), prompt: t('journeyHome.hero.uploadTrackPrompt') },
            { label: t('journeyHome.hero.organizeGear'), prompt: t('journeyHome.hero.organizeGearPrompt') },
          ],
        },
      ];
  const heroContent = heroContents[heroVersion % heroContents.length];

  const refreshJourneys = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await data.refetchJourneys();
    } finally {
      setHeroVersion((current) => current + 1);
      setRefreshing(false);
    }
  };

  const openFilters = () => nav.openActionSheet({
    title: t('journeyHome.filterTitle'),
    items: (['all', 'planned', 'active', 'completed'] as JourneyFilter[]).map((value) => ({
      label: t(`journeyHome.filter.${value}`),
      onPress: () => setFilter(value),
    })),
  });

  const duplicateJourney = async (journey: Poi) => {
    if (duplicatingId) return;
    setDuplicatingId(journey.id);
    const existingNames = new Set(journeys.map((item) => item.name));
    const baseName = t('journeyHome.action.copyName', { name: journey.name });
    let name = baseName;
    let suffix = 2;
    while (existingNames.has(name)) name = `${baseName} ${suffix++}`;
    const { id: _id, ...copy } = journey;
    try {
      const created = await data.createJourney({ ...copy, name });
      nav.showToast(created ? t('journeyHome.action.copied') : t('journeyHome.action.copyFailed'));
    } catch {
      nav.showToast(t('journeyHome.action.copyFailed'));
    } finally {
      setDuplicatingId(undefined);
    }
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.featureSurface }]}>
      <LinearGradient
        colors={[accentTint(theme, 0.12), accentTint(theme, 0.045), theme.featureSurface]}
        locations={[0, 0.32, 0.46]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ScrollView
        style={{ marginTop: insets.top }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: space.sm }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshJourneys()}
            tintColor={theme.accent}
            colors={[theme.accent]}
            progressBackgroundColor={theme.controlSurface}
            progressViewOffset={space.xs}
          />
        )}
      >
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <AssistantMark color={theme.accent} accentColor={theme.accent} size={29} />
          </View>
          <View style={styles.headerActions}>
            <Press accessibilityRole="button" accessibilityLabel={t('search.placeholder')} onPress={() => nav.openSearch()} style={styles.headerButton}>
              <Search color={theme.text} size={25} strokeWidth={2.2} />
            </Press>
            <Press accessibilityRole="button" accessibilityLabel={t('journeyHome.create')} accessibilityState={{ expanded: createMenuOpen }} onPress={() => setCreateMenuOpen(true)} style={styles.headerButton}>
              {createMenuOpen ? null : <Plus color={theme.text} size={28} strokeWidth={2} />}
            </Press>
          </View>
        </View>

        <View style={styles.hero}>
          <Text numberOfLines={2} style={[styles.heroTitle, { color: theme.text }]}>
            {heroContent.title}
          </Text>
          <View style={styles.quickActions}>
            {heroContent.suggestions.map(({ label, prompt }) => (
              <Press
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => nav.openAssistant(prompt, nextJourney?.id)}
                scaleTo={0.985}
                style={[
                  styles.quickAction,
                  { backgroundColor: theme.controlSurface },
                ]}
              >
                <Text numberOfLines={2} style={[styles.quickActionText, { color: theme.text }]}>{label}</Text>
                <CornerDownLeft color={theme.text3} size={17} strokeWidth={2} />
              </Press>
            ))}
          </View>
        </View>

        <View style={[styles.listSection, { paddingBottom: insets.bottom + 116 }]}>
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: theme.text }]}>{t('me.myJourneys')}</Text>
            <Press accessibilityRole="button" onPress={openFilters} style={styles.filterButton}>
              <SlidersHorizontal color={theme.text} size={18} strokeWidth={2.2} />
              <Text style={[styles.filterLabel, { color: theme.text }]}>{t(`journeyHome.filter.${filter}`)}</Text>
            </Press>
          </View>

          <View style={styles.cards}>
            {nav.mainTab !== 'journey' ? null : visibleJourneys.length ? visibleJourneys.map((journey) => (
              <ReanimatedSwipeable
                key={journey.id}
                ref={(methods) => {
                  if (methods) swipeableMethodsRef.current.set(journey.id, methods);
                  else swipeableMethodsRef.current.delete(journey.id);
                }}
                friction={1}
                rightThreshold={32}
                dragOffsetFromRightEdge={3}
                overshootRight={false}
                animationOptions={JOURNEY_SWIPE_SPRING}
                onSwipeableWillOpen={() => {
                  const methods = swipeableMethodsRef.current.get(journey.id);
                  const previous = openSwipeableRef.current;
                  if (previous && previous.id !== journey.id) previous.methods.close();
                  if (methods) openSwipeableRef.current = { id: journey.id, methods };
                  suppressedCardIdsRef.current.add(journey.id);
                  const timer = pressResetTimersRef.current.get(journey.id);
                  if (timer) clearTimeout(timer);
                }}
                onSwipeableClose={() => {
                  if (openSwipeableRef.current?.id === journey.id) openSwipeableRef.current = null;
                  const currentTimer = pressResetTimersRef.current.get(journey.id);
                  if (currentTimer) clearTimeout(currentTimer);
                  const timer = setTimeout(() => {
                    suppressedCardIdsRef.current.delete(journey.id);
                    pressResetTimersRef.current.delete(journey.id);
                  }, 120);
                  pressResetTimersRef.current.set(journey.id, timer);
                }}
                containerStyle={styles.swipeContainer}
                renderRightActions={(progress, _translation, methods) => (
                  <JourneySwipeActions
                    progress={progress}
                    theme={theme}
                    pinned={pinnedIds.has(journey.id)}
                    deleting={deletingId === journey.id}
                    disabled={Boolean(deletingId || duplicatingId)}
                    onPin={() => {
                      methods.close();
                      const nextPinned = !pinnedIds.has(journey.id);
                      setPinned([journey.id], nextPinned);
                      nav.showToast(t(nextPinned ? 'journeyHome.action.pinned' : 'journeyHome.action.unpinned'));
                    }}
                    onCopy={() => {
                      methods.close();
                      void duplicateJourney(journey);
                    }}
                    onDelete={() => {
                      methods.close();
                      setDeleteCandidate(journey);
                    }}
                  />
                )}
              >
                <JourneyPlanCard
                  theme={theme}
                  journey={journey}
                  pinned={pinnedIds.has(journey.id)}
                  onPress={() => {
                    if (suppressedCardIdsRef.current.has(journey.id)) return;
                    nav.openPoint(journey);
                  }}
                />
              </ReanimatedSwipeable>
            )) : (
              <View style={styles.emptyState}>
                <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journeyHome.emptyTitle')}</Text>
                <Text style={[type.body, styles.emptyBody, { color: theme.text2 }]}>{t('journeyHome.emptyBody')}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title={t('journeyHome.action.deleteTitle')}
        message={t('journeyHome.action.deleteMessage', { name: deleteCandidate?.name || '' })}
        confirmLabel={t('journeyHome.action.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={deletingId === deleteCandidate?.id}
        confirmIcon="trash"
        onCancel={() => {
          setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (!deleteCandidate || deletingId) return;
          const candidate = deleteCandidate;
          setDeletingId(candidate.id);
          void data.deleteJourney(candidate.id).then(() => {
            setPinned([candidate.id], false);
            nav.showToast(t('journeyHome.action.deleted'));
            setDeleteCandidate(null);
          }).catch(() => nav.showToast(t('journeyHome.action.deleteFailed'))).finally(() => setDeletingId(undefined));
        }}
      />
      <JourneyCreateMenu
        theme={theme}
        visible={createMenuOpen}
        onClose={() => setCreateMenuOpen(false)}
        onCreate={() => nav.openNewJourney()}
        onParse={() => nav.openAssistant(t('journeyHome.createMenu.parsePrompt'))}
        onUseCode={() => nav.openJourneyInviteScanner()}
        labels={{
          close: t('journeyHome.createMenu.close'),
          create: t('journeyHome.createMenu.create'),
          parse: t('journeyHome.createMenu.parse'),
          useCode: t('journeyHome.createMenu.useCode'),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { height: 56, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandMark: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerButton: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingHorizontal: layout.pagePadding, paddingTop: space.xxl, paddingBottom: space.xxl },
  heroTitle: { maxWidth: '92%', fontSize: 21, lineHeight: 29, fontWeight: '800', letterSpacing: 0 },
  quickActions: { marginTop: space.lg, alignItems: 'flex-start', gap: space.sm },
  quickAction: { minHeight: 48, maxWidth: '94%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  quickActionText: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  listSection: { minHeight: 560, paddingTop: 2 },
  listHeader: { paddingHorizontal: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: 21, lineHeight: 28, fontWeight: '800', letterSpacing: 0 },
  filterButton: { minHeight: layout.iconButton, paddingLeft: space.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterLabel: { fontSize: 14.5, fontWeight: '600', letterSpacing: 0 },
  cards: { paddingHorizontal: 17, gap: 11 },
  swipeContainer: { height: 166, borderRadius: 26, overflow: 'hidden' },
  swipeActions: { width: 192, height: 166, flexDirection: 'row', alignItems: 'center' },
  swipeAction: { width: 64, height: 166, alignItems: 'center', justifyContent: 'center', gap: 8 },
  swipeIconCircle: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  swipeActionLabel: { maxWidth: 66, fontSize: 12.5, lineHeight: 17, fontWeight: '600', textAlign: 'center', letterSpacing: 0 },
  emptyState: { paddingHorizontal: space.xxxl, paddingVertical: 70, alignItems: 'center' },
  emptyBody: { marginTop: space.xs, lineHeight: 21, textAlign: 'center' },
});
