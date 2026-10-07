import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ThumbsUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailPage, radius, space, type } from '../../design-system';
import { getRouteDemoGuides, getRouteGuidePlans, guideText, sortRouteGuides, toRouteGuideTemplate, type GuideStay, type RouteGuideSort } from '../../data/routeGuides';
import { useI18n } from '../../i18n';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { useNav, type RouteGuideRequest } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { RouteGuideEquipment, RouteGuideItinerary, RouteGuideRow, RouteGuideTabs, RouteWeatherDetails } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';

type Page = { view: RouteGuideRequest['view']; planId?: string; guideId?: string };
type ContentTab = 'itinerary' | 'equipment' | 'review';

export function RouteGuidePage({ theme, request, onClose }: { theme: Theme; request: RouteGuideRequest; onClose: () => void }) {
  const nav = useNav(); const { resolved } = useI18n(); const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const plans = useMemo(() => getRouteGuidePlans(request.route), [request.route.id, request.route.name]);
  const guides = useMemo(() => getRouteDemoGuides(plans), [plans]);
  const [stack, setStack] = useState<Page[]>([{ view: request.view, planId: request.planId, guideId: request.guideId }]);
  const page = stack[stack.length - 1];
  const [contentTab, setContentTab] = useState<ContentTab>('itinerary');
  const [sort, setSort] = useState<RouteGuideSort>('recommended');
  const [stay, setStay] = useState<GuideStay | undefined>();
  const [helpful, setHelpful] = useState<Set<string>>(() => new Set());
  const guide = guides.find((item) => item.id === page.guideId) ?? guides[0];
  const plan = page.view === 'guide' ? guide.plan : plans.find((item) => item.id === page.planId) ?? plans[0];
  const weather = useRouteWeather(request.route.lng, request.route.lat, page.view === 'weather');
  const goBack = () => { if (stack.length > 1) { setStack((old) => old.slice(0, -1)); setContentTab('itinerary'); } else onClose(); };
  const openGuide = (guideId: string) => { setStack((old) => [...old, { view: 'guide', guideId }]); setContentTab('itinerary'); };
  const create = () => {
    const preset = { ...request.route, planningTemplate: toRouteGuideTemplate(plan, resolved) };
    onClose(); nav.openNewJourney(preset);
  };
  const title = page.view === 'guides' ? c.guides : page.view === 'guide' ? c.guideDetail : page.view === 'weather' ? c.weatherDetail : c.referencePlan;
  const hasCreate = page.view === 'guide' || page.view === 'plan';
  return <Modal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={goBack}>
    <View style={{ flex: 1, backgroundColor: theme.featureSurface }}>
      <DetailPage scrollable={false} theme={theme} title={title} onBack={goBack} flatChrome entryVariant="continuationX" overlay={hasCreate ? <View style={[styles.footer, { backgroundColor: theme.featureSurface, borderTopColor: theme.hairline, paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Press onPress={create} accessibilityRole="button" style={[styles.create, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><CalendarDays color={theme.accent} size={18} /><Text style={{ flexShrink: 1, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '700' }}>{page.view === 'guide' ? c.createGuide : c.createPlan}</Text></Press>
      </View> : undefined}>
        <ScrollView key={`${page.view}:${plan.id}:${contentTab}`} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.content}>
          {page.view === 'guides' ? <>
            <Text style={[type.pageTitle, { color: theme.text }]}>{c.guides}</Text><Text style={[styles.caption, { color: theme.text2, marginTop: space.sm }]}>{request.route.name}</Text>
            <View style={{ marginTop: space.xxl }}><RouteGuideTabs theme={theme} value={sort} options={[{ id: 'recommended', label: c.recommended }, { id: 'helpful', label: c.helpfulSort }, { id: 'updated', label: c.updatedSort }]} onChange={setSort} /></View>
            <View style={styles.filters}>{([{ id: undefined, label: c.all }, { id: 'camp', label: c.camp }, { id: 'stay', label: c.stay }, { id: 'day', label: c.day }] as { id: GuideStay | undefined; label: string }[]).map((filter) => <Press key={filter.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: stay === filter.id }} onPress={() => setStay(filter.id)} style={[styles.filter, { backgroundColor: stay === filter.id ? theme.progressTrack : theme.groupedBg }]}><Text style={{ color: stay === filter.id ? theme.text : theme.text2, fontSize: 12 }}>{filter.label}</Text></Press>)}</View>
            <View style={{ marginTop: space.xs }}>{sortRouteGuides(guides, sort, stay).map((item, index, all) => <View key={item.id} style={{ borderBottomWidth: index < all.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: theme.hairline }}><RouteGuideRow theme={theme} guide={item} helpful={item.helpful + Number(helpful.has(item.id))} onPress={() => openGuide(item.id)} photoUri={request.route.photoUris?.[0]} /></View>)}{sortRouteGuides(guides, sort, stay).length === 0 ? <Text style={[styles.body, { color: theme.text2, paddingVertical: space.xxxl }]}>{resolved === 'zh' ? '这个走法还没有攻略' : 'No guides for this style yet.'}</Text> : null}</View>
          </> : page.view === 'weather' ? <>
            <Text style={[type.pageTitle, { color: theme.text, marginBottom: space.xl }]}>{c.weather}</Text><Text style={[styles.caption, { color: theme.text2, marginBottom: space.xl }]}>{request.route.name}</Text>
            {weather.loading ? <ActivityIndicator color={theme.accent} /> : weather.forecast ? <RouteWeatherDetails theme={theme} forecast={weather.forecast} /> : <View style={{ gap: space.lg }}><Text style={{ color: theme.text2 }}>{c.weatherUnavailable}</Text><Press onPress={weather.retry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.accent }}>{c.retry}</Text></Press></View>}
          </> : <>
            <Text style={[styles.caption, { color: theme.text2, marginBottom: space.md }]}>{page.view === 'guide' ? guideText(guide.author, resolved) : c.draft}</Text>
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 36 }]}>{guideText(page.view === 'guide' ? guide.title : plan.title, resolved)}</Text>
            <Text style={[styles.caption, { color: theme.text2, marginTop: space.md }]}>{page.view === 'guide' ? `${c.travelDate} ${guide.travelDate}\n${c.updatedDate} ${guide.updatedDate}` : guideText(plan.description, resolved)}</Text>
            {page.view === 'plan' ? <Text style={[styles.caption, { color: theme.text2, marginTop: space.lg }]}>{c.draftDetail}</Text> : null}
            {page.view === 'plan' ? <View style={{ marginTop: space.xl }}><RouteGuideTabs theme={theme} value={plan.id} options={plans.map((p) => ({ id: p.id, label: guideText(p.shortTitle, resolved) }))} onChange={(id) => { setStack((old) => [...old.slice(0, -1), { view: 'plan', planId: id }]); setContentTab('itinerary'); }} /></View> : null}
            <View style={{ marginTop: space.xl, marginBottom: space.xl }}><RouteGuideTabs theme={theme} value={contentTab} options={page.view === 'guide' ? [{ id: 'itinerary', label: c.itinerary }, { id: 'equipment', label: c.equipment }, { id: 'review', label: c.review }] : [{ id: 'itinerary', label: c.itinerary }, { id: 'equipment', label: c.equipment }]} onChange={setContentTab} /></View>
            {contentTab === 'equipment' ? <RouteGuideEquipment theme={theme} plan={plan} community={page.view === 'guide'} /> : contentTab === 'review' ? <View><Text style={[type.sectionTitle, { color: theme.text, marginBottom: space.lg }]}>{c.reviewTitle}</Text><Text style={[styles.body, { color: theme.text2 }]}>{guideText(guide.review, resolved)}</Text></View> : <RouteGuideItinerary theme={theme} plan={plan} />}
            {page.view === 'guide' ? <Press accessibilityRole="button" accessibilityState={{ selected: helpful.has(guide.id) }} onPress={() => { setHelpful((old) => { const next = new Set(old); if (next.has(guide.id)) next.delete(guide.id); else next.add(guide.id); return next; }); }} style={[styles.helpful, { borderColor: theme.hairline }]}><ThumbsUp color={helpful.has(guide.id) ? theme.accent : theme.text2} size={17} /><Text style={{ fontSize: 12, color: theme.text2 }}>{helpful.has(guide.id) ? c.helpfulMarked : c.helpful} · {guide.helpful + Number(helpful.has(guide.id))}</Text></Press> : null}
          </>}
        </View>
        </ScrollView>
      </DetailPage>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.xxl },
  body: { fontSize: 14.5, lineHeight: 27 }, caption: { fontSize: 11.5, lineHeight: 20 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  create: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 44, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.lg },
  filter: { borderRadius: radius.pill, minHeight: 36, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  helpful: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xs, marginTop: space.xxl, minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill },
});
