import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Copy, LogOut, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReAnimated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { hexToRgb, Theme } from '../theme/theme';
import { useI18n } from '../i18n';
import { useNav } from '../nav/NavContext';
import { countRender } from '../lib/tabSwitchProbe';
import { useData } from '../data/DataContext';
import type { Poi } from '../data/pois';
import { useMembership } from '../membership/MembershipContext';
import { topicRoutes } from '../components/discover/RouteTopicPage';
import type { RouteTopic } from '../nav/NavContext';
import { Press } from '../components/Press';
import { PhotoTile } from '../components/PhotoTile';
import { JourneyCreateMenu } from '../components/journey/JourneyCreateMenu';
import { JourneyPlanCard, journeyStartDate, journeyStatus, type JourneyStatus } from '../components/journey/JourneyPlanCard';
import { JourneyFeatureDeck, type FeatureDeckCard } from '../components/journey/JourneyFeatureDeck';
import { usePinnedJourneys } from '../components/journey/usePinnedJourneys';
import { AppActionDialog, AppFilterButton, AppFilterOption, AppFilterPopover, AppFilterSegmented, layout, radius, space, type, type AppFilterAnchor } from '../design-system';

type JourneyDateFilter = 'all' | 'dated' | 'undated';
type JourneySort = 'recent' | 'date';
// The 开爬 Plus starter card and its poster page are built but held back for now.
const SHOW_PLUS_CARD = false;
type StarterCard = FeatureDeckCard;
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
  mine,
  deleting,
  disabled,
  onPin,
  onCopy,
  onDelete,
}: {
  progress: SharedValue<number>;
  theme: Theme;
  pinned: boolean;
  mine: boolean;
  deleting: boolean;
  disabled: boolean;
  onPin: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const dangerLabel = t(mine ? 'journeyHome.action.delete' : 'journey.manage.leaveAction');
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
      <Press disabled={disabled} accessibilityRole="button" accessibilityLabel={dangerLabel} onPress={onDelete} style={styles.swipeAction}>
        <View style={styles.swipeIconCircle}>
          {deleting ? <ActivityIndicator color={theme.danger} /> : mine ? <Trash2 size={23} color={theme.danger} strokeWidth={2.1} /> : <LogOut size={23} color={theme.danger} strokeWidth={2.1} />}
        </View>
        <Text numberOfLines={1} style={[styles.swipeActionLabel, { color: theme.danger }]}>{dangerLabel}</Text>
      </Press>
    </ReAnimated.View>
  );
}

function JourneyScreenView({ theme }: { theme: Theme }) {
  countRender('Journey');
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useI18n();
  const nav = useNav();
  const data = useData();
  const journeys = data.journeys;
  const [dateFilter, setDateFilter] = useState<JourneyDateFilter>('all');
  const [sortMode, setSortMode] = useState<JourneySort>('recent');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filterAnchorRef = useRef<View>(null);
  const [filterAnchor, setFilterAnchor] = useState<AppFilterAnchor>();
  const [deleteCandidate, setDeleteCandidate] = useState<Poi | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const [duplicatingId, setDuplicatingId] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const pageScrollRef = useRef<React.ElementRef<typeof GestureScrollView>>(null);
  const [deckHeld, setDeckHeld] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const suppressedCardIdsRef = useRef<Set<string>>(new Set());
  const pressResetTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const swipeableMethodsRef = useRef<Map<string, SwipeableMethods>>(new Map());
  const openSwipeableRef = useRef<{ id: string; methods: SwipeableMethods } | null>(null);
  const { pinnedIds, setPinned } = usePinnedJourneys();
  const homeContent = data.journeyHomeContent;
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
    if (sortMode === 'recent') {
      const aUpdated = Date.parse(a.updatedAt ?? '') || 0;
      const bUpdated = Date.parse(b.updatedAt ?? '') || 0;
      return bUpdated - aUpdated;
    }
    const delta = rank[journeyStatus(a, now)] - rank[journeyStatus(b, now)];
    if (delta) return delta;
    const aStart = journeyStartDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bStart = journeyStartDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  }), [journeys, pinnedIds, sortMode]);
  const homeVisibleJourneys = orderedJourneys.filter((journey) => {
      const hasDate = Boolean(journeyStartDate(journey));
      return dateFilter === 'all' || (dateFilter === 'dated' ? hasDate : !hasDate);
    });

  // With no journeys at all (not just filtered out) the page becomes a starter
  // screen: tilted feature cards plus two big entry buttons.
  const showStarter = !journeys.length && !data.journeysLoading;
  // Starter cards: anything operations publishes in journey_home_content comes
  // first, then built-in cards. Route cards open a curated topic page whose
  // poster reuses the topic's lead route, so they change with the season.
  const { status: membership } = useMembership();
  const starterCards = useMemo<StarterCard[]>(() => {
    const month = new Date().getMonth() + 1;
    const topicCard = (topic: RouteTopic): StarterCard[] => {
      const lead = topicRoutes(data.routes, topic, month)[0];
      if (!lead) return [];
      return [{
        id: `topic-${topic}`,
        tag: t(`journeyHome.topic.${topic}.tag`, { month }),
        title: t(`journeyHome.topic.${topic}.title`, { month }),
        tone: lead.tone,
        seed: lead.id,
        imageUrl: lead.photoUris?.[0],
        onPress: () => nav.openRouteTopic(topic),
      }];
    };
    const k = 'journeyHome.emptyStart.cards';
    return [
      ...homeContent.cards.map((card): StarterCard => ({
        id: card.id,
        tag: card.subtitle,
        title: card.title,
        seed: card.id,
        imageUrl: card.imageUrl,
        onPress: () => {
          const route = card.routeId ? data.routes.find((item) => item.id === card.routeId) : undefined;
          if (route) nav.openPoint(route);
          else if (card.prompt) nav.openAssistant(card.prompt);
        },
      })),
      ...(SHOW_PLUS_CARD && membership?.accessSource === 'campaign' ? [{
        id: 'open-access', tag: t(`${k}.openAccessTag`), title: t(`${k}.openAccessTitle`), tone: 'dusk', seed: 'open-access',
        onPress: () => nav.openPlusPoster(),
      }] : []),
      ...topicCard('season'),
      ...topicCard('easy'),
      { id: 'ai', tag: t(`${k}.aiTag`), title: t(`${k}.aiTitle`), tone: 'snow', seed: 'ai', onPress: () => nav.openAssistant(t(`${k}.aiPrompt`)) },
      ...topicCard('hard'),
      { id: 'gear', tag: t(`${k}.gearTag`), title: t(`${k}.gearTitle`), tone: 'forest', seed: 'gear', onPress: () => nav.openGearPage('sets') },
      { id: 'request', tag: t(`${k}.requestTag`), title: t(`${k}.requestTitle`), tone: 'river', seed: 'request', onPress: () => nav.openRouteRequest() },
    ];
  }, [homeContent.cards, data.routes, membership?.accessSource, nav, t]);

  const refreshJourneys = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await data.refetchJourneys();
    } finally {
      setRefreshing(false);
    }
  };

  const openFilters = () => {
    filterAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setFilterAnchor({ x, y, width, height });
      setFilterSheetOpen(true);
    });
  };

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
      {/* Gesture-handler scroll view so the feature deck's vertical swipe can hold it. */}
      <GestureScrollView
        ref={pageScrollRef}
        scrollEnabled={!deckHeld}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + layout.iconButton + space.lg }}
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
        {showStarter ? (
          <View style={[styles.starter, { paddingBottom: insets.bottom + 116 }]}>
            {starterCards.length ? (
              <>
                <Text style={[styles.starterTitle, { color: theme.text }]}>{t('journeyHome.emptyStart.title')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starterCards}>
                  {starterCards.map((card, index) => (
                    <Press
                      key={card.id}
                      accessibilityRole="button"
                      accessibilityLabel={card.title}
                      onPress={card.onPress}
                      style={[styles.starterCard, { backgroundColor: theme.controlSurface, transform: [{ rotate: index % 2 ? '3deg' : '-4deg' }] }]}
                    >
                      <PhotoTile tone={card.tone} seed={card.seed} resWidth={360} style={StyleSheet.absoluteFill}>
                        {card.imageUrl ? <Image source={{ uri: card.imageUrl }} style={StyleSheet.absoluteFill} /> : null}
                      </PhotoTile>
                      {card.tag ? (
                        <View style={styles.starterCardTag}>
                          <Text numberOfLines={1} style={styles.starterCardTagText}>{card.tag}</Text>
                        </View>
                      ) : null}
                      <LinearGradient colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.5)']} style={styles.starterCardCopy}>
                        <Text numberOfLines={2} style={[styles.starterCardTitle, { color: '#FFFFFF' }]}>{card.title}</Text>
                        <View style={styles.starterCardAction}>
                          <Text style={[styles.starterCardActionText, { color: 'rgba(255, 255, 255, 0.82)' }]}>{t('journeyHome.emptyStart.cardAction')}</Text>
                          <ArrowRight color="rgba(255, 255, 255, 0.82)" size={16} strokeWidth={2.4} />
                        </View>
                      </LinearGradient>
                    </Press>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <View style={styles.starterButtons}>
              <Press
                accessibilityRole="button"
                onPress={() => nav.openNewJourney()}
                style={[styles.starterButton, { backgroundColor: theme.text }]}
              >
                <Text style={[styles.starterButtonText, { color: theme.featureSurface }]}>{t('journeyHome.emptyStart.create')}</Text>
              </Press>
              <Press
                accessibilityRole="button"
                onPress={() => nav.openItineraryImport()}
                style={[styles.starterButton, { backgroundColor: theme.controlSurface }]}
              >
                <Text style={[styles.starterButtonText, { color: theme.text }]}>{t('journeyHome.emptyStart.check')}</Text>
              </Press>
            </View>
          </View>
        ) : (
        <>
        <JourneyFeatureDeck cards={starterCards} theme={theme} autoAdvance={nav.mainTab === 'journey'} pageScrollRef={pageScrollRef} onHoldChange={setDeckHeld} />

        <View style={[styles.listSection, { paddingBottom: insets.bottom + 116 }]}>
          <View style={styles.listHeader}>
            <Text style={[styles.listTitle, { color: theme.text }]}>{homeContent.title}</Text>
            <View ref={filterAnchorRef} collapsable={false}>
              <AppFilterButton
                theme={theme}
                label={dateFilter === 'all' ? '全部' : dateFilter === 'dated' ? '有日期' : '无日期'}
                active={dateFilter !== 'all'}
                expanded={filterSheetOpen}
                onPress={openFilters}
              />
            </View>
          </View>

          <View style={styles.cards}>
            {homeVisibleJourneys.length ? homeVisibleJourneys.map((journey) => (
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
                    mine={journey.mine !== false}
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
                  onInvite={() => nav.openManageCompanions(journey, 'invite')}
                  inviteAccessibilityLabel={t('journey.manage.inviteParticipant')}
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
        </>
        )}
      </GestureScrollView>
      <View pointerEvents="box-none" style={styles.headerOverlay}>
        <View style={[styles.header, { marginTop: insets.top + space.xs }]}>
          <View style={styles.headerActions}>
            <Press accessibilityRole="button" accessibilityLabel={t('search.placeholder')} onPress={() => nav.openSearch()} style={styles.headerButton}>
              <Search color={theme.text} size={25} strokeWidth={2.2} />
            </Press>
            <Press accessibilityRole="button" accessibilityLabel={t('journeyHome.create')} accessibilityState={{ expanded: createMenuOpen }} onPress={() => setCreateMenuOpen(true)} style={styles.headerButton}>
              {createMenuOpen ? null : <Plus color={theme.text} size={28} strokeWidth={2} />}
            </Press>
          </View>
        </View>
      </View>
      <AppFilterPopover theme={theme} visible={filterSheetOpen} anchor={filterAnchor} width={Math.min(374, windowWidth * 0.48)} onClose={() => setFilterSheetOpen(false)} closeLabel={t('common.cancel')}>
        <AppFilterSegmented
          theme={theme}
          options={[['all', '全部'], ['dated', '有日期'], ['undated', '无日期']] as const}
          value={dateFilter}
          onChange={setDateFilter}
        />
        <AppFilterOption theme={theme} label="按最近编辑排序" selected={sortMode === 'recent'} onPress={() => { setSortMode('recent'); setFilterSheetOpen(false); }} />
        <AppFilterOption theme={theme} label="按计划日期排序" selected={sortMode === 'date'} onPress={() => { setSortMode('date'); setFilterSheetOpen(false); }} />
      </AppFilterPopover>
      <AppActionDialog
        theme={theme}
        visible={Boolean(deleteCandidate)}
        title={t(deleteCandidate?.mine === false ? 'journey.manage.leaveTitle' : 'journeyHome.action.deleteTitle')}
        message={deleteCandidate?.mine === false
          ? t('journey.manage.leaveBody')
          : t('journeyHome.action.deleteMessage', { name: deleteCandidate?.name || '' })}
        confirmLabel={t(deleteCandidate?.mine === false ? 'journey.manage.leaveAction' : 'journeyHome.action.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={deletingId === deleteCandidate?.id}
        confirmIcon={deleteCandidate?.mine === false ? undefined : 'trash'}
        onCancel={() => {
          setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (!deleteCandidate || deletingId) return;
          const candidate = deleteCandidate;
          const joined = candidate.mine === false;
          setDeletingId(candidate.id);
          const task = joined
            ? data.leaveJourney(candidate.id).then(() => data.refetchJourneys())
            : data.deleteJourney(candidate.id);
          void task.then(() => {
            setPinned([candidate.id], false);
            setDeleteCandidate(null);
            if (joined) nav.showToast(t('journey.manage.leaveSuccess'));
          }).catch(() => nav.showToast(t(joined ? 'journey.manage.leaveFailed' : 'journeyHome.action.deleteFailed'))).finally(() => setDeletingId(undefined));
        }}
      />
      <JourneyCreateMenu
        theme={theme}
        visible={createMenuOpen}
        onClose={() => setCreateMenuOpen(false)}
        onCreate={() => nav.openNewJourney()}
        onUseCode={() => nav.openJourneyCodeEntry()}
        labels={{
          close: t('journeyHome.createMenu.close'),
          create: t('journeyHome.createMenu.create'),
          useCode: t('journeyHome.createMenu.useCode'),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { height: layout.iconButton, paddingHorizontal: layout.pagePadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerButton: { width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' },
  listSection: { minHeight: 560, paddingTop: 2 },
  listHeader: { paddingHorizontal: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: 21, lineHeight: 28, fontWeight: '800', letterSpacing: 0 },
  cards: { paddingHorizontal: 17, gap: 11 },
  swipeContainer: { height: 166, borderRadius: 26, overflow: 'hidden' },
  swipeActions: { width: 192, height: 166, flexDirection: 'row', alignItems: 'center' },
  swipeAction: { width: 64, height: 166, alignItems: 'center', justifyContent: 'center', gap: 8 },
  swipeIconCircle: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  swipeActionLabel: { maxWidth: 66, fontSize: 12.5, lineHeight: 17, fontWeight: '600', textAlign: 'center', letterSpacing: 0 },
  emptyState: { paddingHorizontal: space.xxxl, paddingVertical: 70, alignItems: 'center' },
  emptyBody: { marginTop: space.xs, lineHeight: 21, textAlign: 'center' },
  starter: { paddingTop: space.lg },
  starterTitle: { paddingHorizontal: layout.pagePadding + space.xxs, fontSize: 25, lineHeight: 34, fontWeight: '700', letterSpacing: 0 },
  starterCards: { gap: space.md, paddingHorizontal: layout.pagePadding + space.xs, paddingTop: space.xxl, paddingBottom: space.xxl },
  starterCard: { width: 168, height: 208, borderRadius: radius.feature, overflow: 'hidden', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  starterCardTag: { alignSelf: 'flex-start', marginTop: space.sm, marginLeft: space.sm, maxWidth: '86%', paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.88)' },
  starterCardTagText: { fontSize: 12, fontWeight: '600', color: '#4A4A4A' },
  starterCardCopy: { marginTop: 'auto', paddingHorizontal: space.sm, paddingTop: space.xl, paddingBottom: space.sm },
  starterCardTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: 0 },
  starterCardAction: { marginTop: space.xxs, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  starterCardActionText: { fontSize: 13, fontWeight: '700' },
  starterButtons: { marginTop: space.sm, paddingHorizontal: space.xxxl + space.md, gap: space.sm },
  starterButton: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  starterButtonText: { fontSize: 16, fontWeight: '600', letterSpacing: 0 },
});

// Kept mounted under AppShell for every tab; skip re-renders the shell makes
// for its own state. Context changes (useNav/useData) still reach it.
export const JourneyScreen = React.memo(JourneyScreenView);
