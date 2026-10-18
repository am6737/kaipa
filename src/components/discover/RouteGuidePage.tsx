import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { CalendarDays, Heart, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, radius, space, type } from '../../design-system';
import { guideText } from '../../data/routeGuides';
import { useData } from '../../data/DataContext';
import { assembleItinerary, guideSeason } from '../../lib/officialItinerary';
import { createJourneyFromGuide } from '../../lib/routeGuideImport';
import { supabase } from '../../lib/supabase';
import * as Crypto from 'expo-crypto';
import { mergeGuideList } from '../../data/guideList';
import { buildGuideDocument } from '../../lib/routeGuideExport';
import { useI18n } from '../../i18n';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { useNav, type RouteGuideRequest } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { MeBadge, RouteGuideEquipment, RouteGuideItinerary, RouteGuideRow, RouteWeatherDetails } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';
import { RouteCommentsView } from './RouteCommentsView';
import { GuideDocument, RouteGuideExportSheet } from './RouteGuideExportSheet';
import { RouteGuideShareSheet } from './RouteGuideShareSheet';
import { useRouteGuides } from '../../hooks/useRouteGuides';
import { useOfficialItineraries } from '../../hooks/useOfficialItineraries';

type Page = { view: RouteGuideRequest['view']; guideId?: string; planId?: string; trekStartDate?: string | null };

export function RouteGuidePage({ theme, request, onClose }: { theme: Theme; request: RouteGuideRequest; onClose: () => void }) {
  const nav = useNav(); const { t, resolved } = useI18n(); const c = routeGuideCopy[resolved];
  const { userId, refetchJourneys } = useData();
  const insets = useSafeAreaInsets();
  const { plans: officialPlans, loading: officialLoading, error: officialError, refetch: refetchOfficial } = useOfficialItineraries(request.route.id);
  const { guides, loading: guidesLoading, toggleHelpful, currentUserId: currentGuideUserId } = useRouteGuides(request.route.id);
  const guideEntries = mergeGuideList(officialPlans, guides);
  const [stack, setStack] = useState<Page[]>([{ view: request.view, guideId: request.guideId, planId: request.planId, trekStartDate: request.trekStartDate }]);
  const page = stack[stack.length - 1];
  const official = officialPlans.find(item => item.id === page.planId);
  const assembled = official ? assembleItinerary(official, { name: request.route.name, bestMonths: request.route.bestMonths ?? null, seasonNote: request.route.seasonNote ?? null }, { trekStartDate: null, includeAccess: true }) : null;
  const season = official ? guideSeason(official, { bestMonths: request.route.bestMonths ?? null, seasonNote: request.route.seasonNote ?? null }) : null;
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const requestId = useRef(Crypto.randomUUID());
  const openedPlan = useRef<string | null>(null);
  useEffect(() => {
    if (!official || openedPlan.current === official.id) return;
    openedPlan.current = official.id;
    void supabase.from('itinerary_events').insert({ user_id: userId, event: 'preview_opened', itinerary_id: official.id, version: official.version, route_id: official.routeId, entry: request.entry ?? 'guide' });
  }, [official, request.entry, userId]);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const guide = (page.guideId ? guides.find((item) => item.id === page.guideId) : guides[0]) ?? {
    id: 'missing-guide', title: { zh: '攻略暂不可用', en: 'Guide unavailable' }, author: { zh: 'Kaipa', en: 'Kaipa' },
    season: 'autumn' as const, travelDate: '', publishedDate: '', updatedDate: '', helpful: 0, helpfulMarked: false, plan: { id: '', routeId: request.route.id, title: { zh: '', en: '' }, shortTitle: { zh: '', en: '' }, description: { zh: '', en: '' }, stay: 'day' as const, days: [], gear: [], draft: true as const }, review: { zh: '这篇攻略已下架或尚未通过审核。', en: 'This guide is unavailable or is still under review.' },
  };
  const plan = guide.plan;
  const exportShot = useRef<any>(null);
  const [exportReady, setExportReady] = useState(false);
  const exportWidth = Math.ceil(Dimensions.get('screen').width);
  const exportElevation = request.route.trackElevation?.length ? `${Math.round(Math.max(...request.route.trackElevation.map((point) => point.ele)))} m` : '—';
  const exportDoc = useMemo(() => exportOpen && page.view === 'guide' && !page.planId ? buildGuideDocument(request.route.name, guide, resolved, { distance: request.route.dist, highestElevation: exportElevation }) : null, [exportOpen, page.view, page.planId, request.route, guide, resolved, exportElevation]);
  const weather = useRouteWeather(request.route.lng, request.route.lat, page.view === 'weather');
  const goBack = () => { if (stack.length > 1) setStack((old) => old.slice(0, -1)); else onClose(); };
  const openGuide = (guideId?: string, planId?: string) => { requestId.current = Crypto.randomUUID(); setStack((old) => [...old, { view: 'guide', guideId, planId }]); };
  const create = async () => {
    if (creatingRef.current || (!official && guide.id === 'missing-guide')) return;
    creatingRef.current = true; setCreating(true);
    try {
      const id = await createJourneyFromGuide(official ? { kind: 'official', plan: official, trekStartDate: page.trekStartDate } : { kind: 'community', guideId: guide.id }, request.entry ?? 'guide', requestId.current);
      const journeys = await refetchJourneys();
      const saved = journeys.find(item => item.id === id);
      if (!saved) throw new Error(t('officialItinerary.saveError'));
      nav.showToast(c.created);
      onClose();
      if (request.entry === 'chat') nav.closeAssistant();
      nav.openPoint(saved);
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? error);
      if (message.includes('not_published')) Alert.alert(t('officialItinerary.updatedTitle'), t('officialItinerary.updatedMessage'));
      else Alert.alert(t('officialItinerary.saveError'), c.createRetry, [{ text: c.retry, onPress: () => void create() }, { text: c.cancel }]);
    } finally { creatingRef.current = false; setCreating(false); }
  };
  const title = page.view === 'guides' ? `${request.route.name}${resolved === 'zh' ? '攻略' : ' guides'}` : page.view === 'guide' ? c.guideDetail : page.view === 'weather' ? c.weatherDetail : c.allComments;
  const hasCreate = page.view === 'guide';
  const pageBackgroundColor = page.view === 'guide' || page.view === 'guides' ? theme.featureSurface : theme.groupedBg;
  return <>
  <Modal visible={!exportOpen} presentationStyle="fullScreen" animationType="slide" onRequestClose={goBack}>
    <View style={{ flex: 1, backgroundColor: pageBackgroundColor }}>
      <DetailPage scrollable={false} theme={theme} backgroundColor={pageBackgroundColor} title={title} onBack={goBack} right={page.view === 'guide' ? <Press accessibilityRole="button" onPress={() => { if (page.planId) { if (official) void Share.share({ message: `${official.payload.name}\n${request.route.name}\n${official.payload.summary}` }); } else setShareOpen(true); }} style={styles.headerAdd} accessibilityLabel={c.shareGuide}><Share2 color={theme.text} size={20} /></Press> : undefined} flatChrome entryVariant="continuationX" overlay={hasCreate ? <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        {page.trekStartDate ? <Text style={[type.meta, { color: theme.text2, textAlign: 'center', marginBottom: space.xs }]}>{t('officialItinerary.cardDate', { month: Number(page.trekStartDate.slice(5, 7)), day: Number(page.trekStartDate.slice(8, 10)) })}</Text> : null}
        <View style={styles.footerRow}>
          {page.view === 'guide' && !page.planId ? <Press accessibilityRole="button" accessibilityState={{ selected: guide.helpfulMarked }} onPress={() => { if (guide.id === 'missing-guide') return; void toggleHelpful(guide.id).catch((error: unknown) => { const authRequired = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase().includes('authentication'); nav.showToast(resolved === 'zh' ? (authRequired ? '请先登录后再点赞' : '点赞失败，请稍后重试') : (authRequired ? 'Sign in to like this guide' : 'Could not save your like')); }); }} style={[styles.footerHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><Heart color={guide.helpfulMarked ? theme.like : theme.text2} fill={guide.helpfulMarked ? theme.like : 'transparent'} size={18} /><Text numberOfLines={1} style={[type.note, { color: theme.text2 }]}>{guide.helpful}</Text></Press> : null}
          <Press disabled={creating || Boolean(page.planId && !official)} onPress={() => void create()} accessibilityRole="button" style={[styles.create, styles.createWithHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><CalendarDays color={theme.text} size={18} /><Text numberOfLines={1} style={[type.labelStrong, { flexShrink: 1, textAlign: 'center', color: theme.text }]}>{creating ? c.creating : c.createGuide}</Text></Press>
        </View>
      </View> : undefined}>
        {page.view === 'comments' ? <RouteCommentsView theme={theme} route={request.route} autoFocus={request.compose} /> : <ScrollView key={`${page.view}:${page.planId ?? plan.id}`} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.content}>
          {page.view === 'guides' ? <>
            <View style={{ marginTop: space.xs }}>{guidesLoading || officialLoading ? <ActivityIndicator color={theme.accent} /> : guideEntries.map((entry, index) => <View key={entry.id} style={{ borderBottomWidth: index < guideEntries.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: theme.hairline }}><RouteGuideRow theme={theme} guide={entry.kind === 'community' ? entry.guide : undefined} officialTitle={entry.kind === 'official' ? entry.plan.payload.name : undefined} showMeBadge={entry.kind === 'community' && Boolean(currentGuideUserId) && entry.guide.authorId === currentGuideUserId} onPress={() => entry.kind === 'official' ? openGuide(undefined, entry.plan.id) : openGuide(entry.guide.id)} /></View>)}{!guidesLoading && !officialLoading && guideEntries.length === 0 ? <Text style={[styles.body, { color: theme.text2, paddingVertical: space.xxxl }]}>{c.noGuides}</Text> : null}</View>
          </> : page.view === 'weather' ? <>
            {weather.loading ? <View style={styles.weatherState}><ActivityIndicator color={theme.accent} /><Text style={[styles.caption, { color: theme.text2 }]}>{c.weather}</Text></View> : weather.forecast ? <RouteWeatherDetails theme={theme} forecast={weather.forecast} routeName={request.route.name} /> : <View style={styles.weatherState}><Text style={{ color: theme.text2 }}>{c.weatherUnavailable}</Text><Press accessibilityRole="button" onPress={weather.retry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.accent }}>{c.retry}</Text></Press></View>}
          </> : official && assembled ? <>
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 36 }]}>{official.payload.name}</Text>
            <View style={styles.authorRow}><Text style={[styles.author, { color: theme.text2 }]}>{c.officialAuthor}</Text><Text style={[type.caption, { color: theme.accent }]}>{c.officialBadge}</Text></View>
            <Text style={[type.meta, { color: theme.text2, marginTop: space.md }]}>{assembled.header.countsLine}</Text>
            <Text style={[type.meta, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.difficulty')}：{official.payload.difficulty}  {t('officialItinerary.audience')}：{official.payload.audience}</Text>
            {official.payload.summary ? <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text }]}>{t('officialItinerary.summary')}</Text><Text style={[type.reading, { color: theme.text2, marginTop: space.md }]}>{official.payload.summary}</Text></View> : null}
            <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text }]}>{c.itinerary}</Text>{assembled.days.map(day => <View key={day.dayNumber} style={{ paddingVertical: space.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}><Text style={[type.dayLabel, { color: theme.text }]}>{t('officialItinerary.day', { count: day.dayNumber })}  {day.kindLabel}</Text><Text style={[type.readingSummary, { color: theme.text, marginTop: space.xs }]}>{day.title}</Text>{day.distanceKm != null || day.ascentM != null || day.descentM != null ? <Text style={[type.meta, { color: theme.text2, marginTop: space.xs }]}>{[day.distanceKm != null ? t('officialItinerary.distance', { count: day.distanceKm }) : null, day.ascentM != null ? t('officialItinerary.ascent', { count: day.ascentM }) : null, day.descentM != null ? t('officialItinerary.descent', { count: day.descentM }) : null].filter(Boolean).join('  ')}</Text> : null}{day.stay ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.stay', { name: day.stay.name })}</Text> : null}{day.tip ? <Text style={[type.step, { color: theme.text2, marginTop: space.xs }]}>{t('officialItinerary.tip', { text: day.tip })}</Text> : null}</View>)}</View>
            <Text style={[type.reading, { color: theme.text2, marginTop: space.xl }]}>{assembled.transportNote}</Text>
            {season?.months || season?.note ? <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text }]}>{t('officialItinerary.season')}</Text>{season.months ? <Text style={[type.reading, { color: theme.text2, marginTop: space.md }]}>{t('officialItinerary.recommendedMonths', { months: season.months })}</Text> : null}{season.note ? <Text style={[type.reading, { color: theme.text2 }]}>{season.note}</Text> : null}</View> : null}
            {assembled.notes.length ? <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text }]}>{t('officialItinerary.notes')}</Text>{assembled.notes.map((note, index) => <Text key={index} style={[type.reading, { color: theme.text2 }]}>{index + 1}. {note}</Text>)}</View> : null}
            <Text style={[type.meta, { color: theme.text3, marginTop: space.xxl }]}>{t('officialItinerary.source')}：{assembled.sourceLabel}</Text>
          </> : page.planId ? <View style={styles.weatherState}>{officialLoading ? <ActivityIndicator color={theme.accent} /> : <><Text style={[type.body, { color: theme.text2 }]}>{officialError ? t('officialItinerary.loadError') : t('officialItinerary.updatedMessage')}</Text><Press onPress={() => void refetchOfficial()} accessibilityRole="button"><Text style={[type.cardTitle, { color: theme.accent }]}>{c.retry}</Text></Press></>}</View> : <>
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 36 }]}>{guideText(guide.title, resolved)}</Text>
            <>
              <View style={styles.authorRow}><Avatar size={28} uri={guide.authorAvatarUrl || undefined} /><Text style={[styles.author, { color: theme.text2 }]}>{guideText(guide.author, resolved)}</Text>{Boolean(currentGuideUserId) && guide.authorId === currentGuideUserId ? <MeBadge theme={theme} /> : null}</View>
              <View style={styles.metaRow}><Text style={[styles.caption, { color: theme.text2 }]}>{c.publishedDate} {guide.publishedDate}</Text>{guide.updatedDate !== guide.publishedDate ? <Text style={[styles.caption, { color: theme.text2 }]}>{c.updatedDate} {guide.updatedDate}</Text> : null}</View>
            </>
            {guide.description && guideText(guide.description, resolved).trim() ? <Text style={[styles.guideDescription, { color: theme.text2 }]}>{guideText(guide.description, resolved)}</Text> : null}
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>{c.itinerary}</Text>
              <RouteGuideItinerary theme={theme} plan={plan} />
            </View>
            <View style={{ marginTop: space.xxl }}>
              <RouteGuideEquipment theme={theme} plan={plan} />
            </View>
            <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.lg }]}>{c.reviewTitle}</Text><Text style={[styles.body, { color: theme.text2 }]}>{guideText(guide.review, resolved)}</Text></View>
          </>}
        </View>
        </ScrollView>}
      </DetailPage>
    </View>
    {shareOpen && page.view === 'guide' && !page.planId ? <RouteGuideShareSheet theme={theme} routeName={request.route.name} guide={guide} onClose={() => setShareOpen(false)} onExport={() => { setShareOpen(false); setExportOpen(true); }} /> : null}
  </Modal>
  {exportOpen && exportDoc ? <View pointerEvents="none" style={styles.captureHost}>
    <ViewShot ref={exportShot} onLayout={() => setExportReady(true)} style={{ width: exportWidth }}>
      <View style={{ paddingHorizontal: space.lg }}><GuideDocument data={exportDoc} theme={theme} /></View>
    </ViewShot>
  </View> : null}
  {exportOpen && exportDoc ? <RouteGuideExportSheet theme={theme} doc={exportDoc} shotRef={exportShot} captureReady={exportReady} onClose={() => { setExportOpen(false); setExportReady(false); }} onToast={nav.showToast} /> : null}
  </>;
}

const styles = StyleSheet.create({
  // Keep the full-height capture surface separate from the scrollable preview.
  captureHost: { position: 'absolute', left: 0, top: 0, zIndex: 0 },
  content: { paddingHorizontal: space.xl, paddingTop: space.md },
  body: { ...type.reading }, caption: { ...type.meta, lineHeight: 20 },
  guideDescription: { marginTop: space.xl, ...type.readingLead },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  author: { ...type.byline },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footerHelpful: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, minHeight: 44, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  create: { flex: 1, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 44, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  createWithHelpful: { flex: 1.45 },
  headerAdd: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  weatherState: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: space.md },
});
