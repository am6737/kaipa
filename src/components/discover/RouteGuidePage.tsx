import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { CalendarDays, Heart, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, layout, radius, space, type } from '../../design-system';
import { getRouteGuidePlans, guideText, sortRouteGuides, toRouteGuideTemplate } from '../../data/routeGuides';
import { buildGuideDocument } from '../../lib/routeGuideExport';
import { useI18n } from '../../i18n';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { useNav, type RouteGuideRequest } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { MeBadge, RouteGuideEquipment, RouteGuideItinerary, RouteGuideRow, RouteGuideTabs, RouteWeatherDetails } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';
import { RouteCommentsView } from './RouteCommentsView';
import { GuideDocument, RouteGuideExportSheet } from './RouteGuideExportSheet';
import { RouteGuideShareSheet } from './RouteGuideShareSheet';
import { useRouteGuides } from '../../hooks/useRouteGuides';
import { useOfficialItineraries } from '../../hooks/useOfficialItineraries';

type Page = { view: RouteGuideRequest['view']; planId?: string; guideId?: string };

export function RouteGuidePage({ theme, request, onClose }: { theme: Theme; request: RouteGuideRequest; onClose: () => void }) {
  const nav = useNav(); const { t, resolved } = useI18n(); const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const plans = useMemo(() => getRouteGuidePlans(request.route), [request.route.id, request.route.name]);
  const { plans: officialPlans, loading: officialLoading, error: officialError, refetch: refetchOfficial } = useOfficialItineraries(request.route.id);
  const { guides, loading: guidesLoading, toggleHelpful, currentUserId: currentGuideUserId } = useRouteGuides(request.route.id);
  const [stack, setStack] = useState<Page[]>([{ view: request.view, planId: request.planId, guideId: request.guideId }]);
  const page = stack[stack.length - 1];
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const guide = guides.find((item) => item.id === page.guideId) ?? guides[0] ?? {
    id: 'missing-guide', title: { zh: '攻略暂不可用', en: 'Guide unavailable' }, author: { zh: 'Kaipa', en: 'Kaipa' },
    season: 'autumn' as const, travelDate: '', publishedDate: '', updatedDate: '', helpful: 0, helpfulMarked: false, plan: plans[0], review: { zh: '这篇攻略已下架或尚未通过审核。', en: 'This guide is unavailable or is still under review.' },
  };
  const plan = page.view === 'guide' ? guide.plan : plans.find((item) => item.id === page.planId) ?? plans[0];
  const exportShot = useRef<any>(null);
  const [exportReady, setExportReady] = useState(false);
  const exportWidth = Math.ceil(Dimensions.get('screen').width);
  const exportElevation = request.route.trackElevation?.length ? `${Math.round(Math.max(...request.route.trackElevation.map((point) => point.ele)))} m` : '—';
  const exportDoc = useMemo(() => exportOpen && page.view === 'guide' ? buildGuideDocument(request.route.name, guide, resolved, { distance: request.route.dist, highestElevation: exportElevation }) : null, [exportOpen, page.view, request.route, guide, resolved, exportElevation]);
  const weather = useRouteWeather(request.route.lng, request.route.lat, page.view === 'weather');
  const goBack = () => { if (stack.length > 1) setStack((old) => old.slice(0, -1)); else onClose(); };
  const openGuide = (guideId: string) => { setStack((old) => [...old, { view: 'guide', guideId }]); };
  const create = () => {
    if (officialLoading || officialError) { if (officialError) void refetchOfficial(); return; }
    if (officialPlans.length) {
      nav.openItineraryPreview({ route: request.route, entry: 'guide', planId: officialPlans[0].id });
      return;
    }
    const preset = { ...request.route, planningTemplate: toRouteGuideTemplate(plan, resolved) };
    onClose(); nav.openNewJourney(preset);
  };
  const title = page.view === 'guides' ? `${request.route.name}${resolved === 'zh' ? '攻略' : ' guides'}` : page.view === 'guide' ? c.guideDetail : page.view === 'weather' ? c.weatherDetail : page.view === 'comments' ? c.allComments : c.referencePlan;
  const hasCreate = page.view === 'guide' || page.view === 'plan';
  const pageBackgroundColor = page.view === 'guide' || page.view === 'guides' ? theme.featureSurface : theme.groupedBg;
  return <>
  <Modal visible={!exportOpen} presentationStyle="fullScreen" animationType="slide" onRequestClose={goBack}>
    <View style={{ flex: 1, backgroundColor: pageBackgroundColor }}>
      <DetailPage scrollable={false} theme={theme} backgroundColor={pageBackgroundColor} title={title} onBack={goBack} right={page.view === 'guide' ? <Press accessibilityRole="button" onPress={() => setShareOpen(true)} style={styles.headerAdd} accessibilityLabel={c.shareGuide}><Share2 color={theme.text} size={20} /></Press> : undefined} flatChrome entryVariant="continuationX" overlay={hasCreate ? <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}> 
        <View style={styles.footerRow}>
          {page.view === 'guide' ? <Press accessibilityRole="button" accessibilityState={{ selected: guide.helpfulMarked }} onPress={() => { if (guide.id === 'missing-guide') return; void toggleHelpful(guide.id).catch((error: unknown) => { const authRequired = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase().includes('authentication'); nav.showToast(resolved === 'zh' ? (authRequired ? '请先登录后再点赞' : '点赞失败，请稍后重试') : (authRequired ? 'Sign in to like this guide' : 'Could not save your like')); }); }} style={[styles.footerHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><Heart color={guide.helpfulMarked ? theme.like : theme.text2} fill={guide.helpfulMarked ? theme.like : 'transparent'} size={18} /><Text numberOfLines={1} style={[type.note, { color: theme.text2 }]}>{guide.helpful}</Text></Press> : null}
          <Press onPress={create} accessibilityRole="button" style={[styles.create, page.view === 'guide' && styles.createWithHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><CalendarDays color={theme.text} size={18} /><Text numberOfLines={1} style={[type.labelStrong, { flexShrink: 1, textAlign: 'center', color: theme.text }]}>{page.view === 'guide' ? c.createGuide : c.createPlan}</Text></Press>
        </View>
      </View> : undefined}>
        {page.view === 'comments' ? <RouteCommentsView theme={theme} route={request.route} backgroundColor={pageBackgroundColor} autoFocus={request.compose} /> : <ScrollView key={`${page.view}:${plan.id}`} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.content}>
          {page.view === 'guides' ? <>
            <View style={{ marginTop: space.xs }}>{guidesLoading ? <ActivityIndicator color={theme.accent} /> : sortRouteGuides(guides, 'recommended').map((item, index, all) => <View key={item.id} style={{ borderBottomWidth: index < all.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: theme.hairline }}><RouteGuideRow theme={theme} guide={item} showMeBadge={Boolean(currentGuideUserId) && item.authorId === currentGuideUserId} onPress={() => openGuide(item.id)} /></View>)}{!guidesLoading && guides.length === 0 ? <Text style={[styles.body, { color: theme.text2, paddingVertical: space.xxxl }]}>{c.noGuides}</Text> : null}</View>
          </> : page.view === 'weather' ? <>
            {weather.loading ? <View style={styles.weatherState}><ActivityIndicator color={theme.accent} /><Text style={[styles.caption, { color: theme.text2 }]}>{c.weather}</Text></View> : weather.forecast ? <RouteWeatherDetails theme={theme} forecast={weather.forecast} routeName={request.route.name} /> : <View style={styles.weatherState}><Text style={{ color: theme.text2 }}>{c.weatherUnavailable}</Text><Press accessibilityRole="button" onPress={weather.retry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.accent }}>{c.retry}</Text></Press></View>}
          </> : <>
            {page.view === 'plan' && officialPlans.length ? <>
              <Text style={[type.pageTitle, { color: theme.text }]}>{request.route.name}</Text>
              <View style={{ marginTop: space.xxl }}>{officialPlans.map((item) => <Press key={item.id} accessibilityRole="button" onPress={() => nav.openItineraryPreview({ route: request.route, entry: 'guide', planId: item.id })} style={{ minHeight: layout.listRowMinHeight, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}><Text style={[type.planRowTitle, { color: theme.text }]}>{item.payload.name}</Text><Text style={[type.meta, { color: theme.text2, marginTop: space.xxs }]}>{t('officialItinerary.hikeDays', { count: item.payload.days.filter(day => day.kind === 'hike').length })}  {t('officialItinerary.accessDays', { count: item.payload.days.filter(day => day.kind === 'access_in' || day.kind === 'access_out').length })}  {t('officialItinerary.difficulty')}：{item.payload.difficulty}</Text></Press>)}</View>
            </> : null}
            {page.view === 'plan' && officialLoading ? <ActivityIndicator color={theme.accent} /> : null}
            {page.view === 'plan' && officialError ? <Press onPress={() => void refetchOfficial()}><Text style={[type.body, { color: theme.danger }]}>{t('officialItinerary.loadError')}  {t('officialItinerary.retry')}</Text></Press> : null}
            {page.view === 'plan' && !officialLoading && !officialError && !officialPlans.length ? <Text style={[styles.caption, { color: theme.text2, marginBottom: space.md }]}>{c.draft}</Text> : null}
            {page.view === 'plan' && (officialLoading || officialError || officialPlans.length) ? null : <>
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 36 }]}>{guideText(page.view === 'guide' ? guide.title : plan.title, resolved)}</Text>
            {page.view === 'guide' ? <>
              <View style={styles.authorRow}><Avatar size={28} uri={guide.authorAvatarUrl || undefined} /><Text style={[styles.author, { color: theme.text2 }]}>{guideText(guide.author, resolved)}</Text>{Boolean(currentGuideUserId) && guide.authorId === currentGuideUserId ? <MeBadge theme={theme} /> : null}</View>
              <View style={styles.metaRow}><Text style={[styles.caption, { color: theme.text2 }]}>{c.publishedDate} {guide.publishedDate}</Text>{guide.updatedDate !== guide.publishedDate ? <Text style={[styles.caption, { color: theme.text2 }]}>{c.updatedDate} {guide.updatedDate}</Text> : null}</View>
            </> : <Text style={[styles.caption, { color: theme.text2, marginTop: space.md }]}>{guideText(plan.description, resolved)}</Text>}
            {page.view === 'guide' && guide.description && guideText(guide.description, resolved).trim() ? <Text style={[styles.guideDescription, { color: theme.text2 }]}>{guideText(guide.description, resolved)}</Text> : null}
            {page.view === 'plan' ? <Text style={[styles.caption, { color: theme.text2, marginTop: space.lg }]}>{c.draftDetail}</Text> : null}
            {page.view === 'plan' ? <View style={{ marginTop: space.xl }}><RouteGuideTabs theme={theme} value={plan.id} options={plans.map((p) => ({ id: p.id, label: guideText(p.shortTitle, resolved) }))} onChange={(id) => { setStack((old) => [...old.slice(0, -1), { view: 'plan', planId: id }]); }} /></View> : null}
            <View style={{ marginTop: space.xl }}>
              <Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.md }]}>{c.itinerary}</Text>
              <RouteGuideItinerary theme={theme} plan={plan} />
            </View>
            <View style={{ marginTop: space.xxl }}>
              <RouteGuideEquipment theme={theme} plan={plan} />
            </View>
            {page.view === 'guide' ? <View style={{ marginTop: space.xxl }}><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.lg }]}>{c.reviewTitle}</Text><Text style={[styles.body, { color: theme.text2 }]}>{guideText(guide.review, resolved)}</Text></View> : null}
            </>}
          </>}
        </View>
        </ScrollView>}
      </DetailPage>
    </View>
    {shareOpen && page.view === 'guide' ? <RouteGuideShareSheet theme={theme} routeName={request.route.name} guide={guide} onClose={() => setShareOpen(false)} onExport={() => { setShareOpen(false); setExportOpen(true); }} /> : null}
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
