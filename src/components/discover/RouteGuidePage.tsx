import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { CalendarDays, Heart, ImagePlus, Plus, Share2, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { DetailPage, radius, space, type } from '../../design-system';
import { getRouteGuidePlans, guideText, sortRouteGuides, toRouteGuideTemplate, type GuideStay } from '../../data/routeGuides';
import { buildGuideDocument } from '../../lib/routeGuideExport';
import { useI18n } from '../../i18n';
import { useRouteWeather } from '../../hooks/useRouteWeather';
import { useNav, type RouteGuideRequest } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Avatar } from '../Avatar';
import { Press } from '../Press';
import { RouteGuideEquipment, RouteGuideItinerary, RouteGuideRow, RouteGuideTabs, RouteWeatherDetails } from './RouteGuideContent';
import { routeGuideCopy } from './routeGuideCopy';
import { submitRouteCondition, useRouteConditions } from '../../hooks/useRouteConditions';
import { RouteConditionCard } from './RouteConditionCard';
import { GuideDocument, RouteGuideExportSheet } from './RouteGuideExportSheet';
import { RouteGuideShareSheet } from './RouteGuideShareSheet';
import { useRouteGuides } from '../../hooks/useRouteGuides';

type Page = { view: RouteGuideRequest['view'] | 'condition-compose'; planId?: string; guideId?: string };

export function RouteGuidePage({ theme, request, onClose }: { theme: Theme; request: RouteGuideRequest; onClose: () => void }) {
  const nav = useNav(); const { resolved } = useI18n(); const c = routeGuideCopy[resolved];
  const insets = useSafeAreaInsets();
  const plans = useMemo(() => getRouteGuidePlans(request.route), [request.route.id, request.route.name]);
  const { reports, loading: reportsLoading, refresh: refreshReports } = useRouteConditions(request.route.id);
  const { guides, loading: guidesLoading } = useRouteGuides(request.route.id);
  const [stack, setStack] = useState<Page[]>([{ view: request.view, planId: request.planId, guideId: request.guideId }]);
  const page = stack[stack.length - 1];
  const [stay, setStay] = useState<GuideStay | undefined>();
  const [helpful, setHelpful] = useState<Set<string>>(() => new Set());
  const [conditionDraft, setConditionDraft] = useState('');
  const [conditionMedia, setConditionMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [conditionMediaPreview, setConditionMediaPreview] = useState<Record<string, string>>({});
  const [conditionModerationEnabled, setConditionModerationEnabled] = useState(true);
  const [publishingCondition, setPublishingCondition] = useState(false);
  const [conditionPublishError, setConditionPublishError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const canPublishCondition = Boolean(conditionDraft.trim()) || conditionMedia.length > 0;
  const guide = guides.find((item) => item.id === page.guideId) ?? guides[0] ?? {
    id: 'missing-guide', title: { zh: '攻略暂不可用', en: 'Guide unavailable' }, author: { zh: 'Kaipa', en: 'Kaipa' },
    season: 'autumn' as const, travelDate: '', publishedDate: '', updatedDate: '', helpful: 0, plan: plans[0], review: { zh: '这篇攻略已下架或尚未通过审核。', en: 'This guide is unavailable or is still under review.' },
  };
  const plan = page.view === 'guide' ? guide.plan : plans.find((item) => item.id === page.planId) ?? plans[0];
  const exportShot = useRef<any>(null);
  const [exportReady, setExportReady] = useState(false);
  const exportWidth = Math.ceil(Dimensions.get('screen').width);
  const exportElevation = request.route.trackElevation?.length ? `${Math.round(Math.max(...request.route.trackElevation.map((point) => point.ele)))} m` : '—';
  const exportDoc = useMemo(() => exportOpen && page.view === 'guide' ? buildGuideDocument(request.route.name, guide, resolved, { distance: request.route.dist, highestElevation: exportElevation }) : null, [exportOpen, page.view, request.route, guide, resolved, exportElevation]);
  const weather = useRouteWeather(request.route.lng, request.route.lat, page.view === 'weather');
  useEffect(() => {
    void supabase.rpc('feature_control_state', { p_key: 'route_condition_moderation' }).then(({ data }) => {
      if (data === 'enabled' || data === 'disabled') setConditionModerationEnabled(data === 'enabled');
    });
  }, []);
  const goBack = () => { if (stack.length > 1) setStack((old) => old.slice(0, -1)); else onClose(); };
  const openGuide = (guideId: string) => { setStack((old) => [...old, { view: 'guide', guideId }]); };
  const pickConditionMedia = async () => {
    if (conditionMedia.length >= 9) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos', 'livePhotos'], allowsMultipleSelection: true, selectionLimit: 9 - conditionMedia.length, quality: 0.8 });
    if (result.canceled) return;
    const accepted = result.assets.filter((asset) => {
      if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) return false;
      if (asset.type === 'video' && asset.duration && asset.duration > 15_000) return false;
      return true;
    });
    if (accepted.length !== result.assets.length) Alert.alert(resolved === 'zh' ? '部分文件未添加' : 'Some files were skipped', resolved === 'zh' ? '单个文件不能超过 50 MB，视频不能超过 15 秒。' : 'Each file must be under 50 MB and videos under 15 seconds.');
    const previews = await Promise.all(accepted.map(async (asset) => {
      if (asset.type !== 'video') return [asset.uri, asset.uri] as const;
      try { return [asset.uri, (await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500 })).uri] as const; } catch { return [asset.uri, asset.uri] as const; }
    }));
    setConditionMediaPreview((old) => ({ ...old, ...Object.fromEntries(previews) }));
    setConditionMedia((old) => [...old, ...accepted].slice(0, 9));
  };
  const create = () => {
    const preset = { ...request.route, planningTemplate: toRouteGuideTemplate(plan, resolved) };
    onClose(); nav.openNewJourney(preset);
  };
  const title = page.view === 'guides' ? `${request.route.name}${resolved === 'zh' ? '攻略' : ' guides'}` : page.view === 'guide' ? c.guideDetail : page.view === 'weather' ? c.weatherDetail : page.view === 'conditions' ? `${request.route.name}${c.conditions}` : page.view === 'condition-compose' ? c.shareCondition : c.referencePlan;
  const hasCreate = page.view === 'guide' || page.view === 'plan';
  return <>
  <Modal visible={!exportOpen} presentationStyle="fullScreen" animationType="slide" onRequestClose={goBack}>
    <View style={{ flex: 1, backgroundColor: theme.groupedBg }}>
      <DetailPage scrollable={false} theme={theme} backgroundColor={theme.groupedBg} title={title} onBack={goBack} right={page.view === 'conditions' ? <Press accessibilityRole="button" onPress={() => setStack((old) => [...old, { view: 'condition-compose' }])} style={styles.headerAdd} accessibilityLabel={c.shareCondition}><Plus color={theme.text} size={22} /></Press> : page.view === 'guide' ? <Press accessibilityRole="button" onPress={() => setShareOpen(true)} style={styles.headerAdd} accessibilityLabel={c.shareGuide}><Share2 color={theme.text} size={20} /></Press> : undefined} flatChrome entryVariant="continuationX" overlay={hasCreate ? <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.footerRow}>
          {page.view === 'guide' ? <Press accessibilityRole="button" accessibilityState={{ selected: helpful.has(guide.id) }} onPress={() => { setHelpful((old) => { const next = new Set(old); if (next.has(guide.id)) next.delete(guide.id); else next.add(guide.id); return next; }); }} style={[styles.footerHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><Heart color={helpful.has(guide.id) ? '#E5484D' : theme.text2} fill={helpful.has(guide.id) ? '#E5484D' : 'transparent'} size={18} /><Text numberOfLines={1} style={{ fontSize: 12, color: theme.text2 }}>{guide.helpful + Number(helpful.has(guide.id))}</Text></Press> : null}
          <Press onPress={create} accessibilityRole="button" style={[styles.create, page.view === 'guide' && styles.createWithHelpful, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}><CalendarDays color={theme.text} size={18} /><Text numberOfLines={1} style={{ flexShrink: 1, textAlign: 'center', color: theme.text, fontSize: 13, fontWeight: '700' }}>{page.view === 'guide' ? c.createGuide : c.createPlan}</Text></Press>
        </View>
      </View> : undefined}>
        <ScrollView key={`${page.view}:${plan.id}`} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.content}>
          {page.view === 'guides' ? <>
            <View style={styles.filters}>{([{ id: undefined, label: c.all }, { id: 'camp', label: c.camp }, { id: 'stay', label: c.stay }, { id: 'day', label: c.day }] as { id: GuideStay | undefined; label: string }[]).map((filter) => <Press key={filter.id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: stay === filter.id }} onPress={() => setStay(filter.id)} style={[styles.filter, { backgroundColor: stay === filter.id ? theme.featureSurface : theme.fieldSurface }]}><Text style={{ color: stay === filter.id ? theme.text : theme.text2, fontSize: 12 }}>{filter.label}</Text></Press>)}</View>
            <View style={{ marginTop: space.xs }}>{guidesLoading ? <ActivityIndicator color={theme.accent} /> : sortRouteGuides(guides, 'recommended', stay).map((item, index, all) => <View key={item.id} style={{ borderBottomWidth: index < all.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: theme.hairline }}><RouteGuideRow theme={theme} guide={item} helpful={item.helpful + Number(helpful.has(item.id))} onPress={() => openGuide(item.id)} photoUri={request.route.photoUris?.[0]} /></View>)}{!guidesLoading && sortRouteGuides(guides, 'recommended', stay).length === 0 ? <Text style={[styles.body, { color: theme.text2, paddingVertical: space.xxxl }]}>{resolved === 'zh' ? '这个走法还没有审核通过的攻略' : 'No approved guides for this style yet.'}</Text> : null}</View>
          </> : page.view === 'condition-compose' ? <>
            <View style={{ marginTop: space.xl }}>
              <TextInput autoFocus value={conditionDraft} onChangeText={setConditionDraft} placeholder={c.shareConditionPlaceholder} placeholderTextColor={theme.text3} multiline maxLength={200} style={[styles.composerInput, styles.composerPageInput, { color: theme.text, backgroundColor: theme.surfaceTop, borderColor: theme.hairline }]} />
              <Text style={[styles.counter, { color: theme.text3 }]}>{conditionDraft.length}/200</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.mediaGrid, { height: conditionMedia.length ? 84 : 0 }, conditionMedia.length === 0 && { marginTop: 0 }]} contentContainerStyle={styles.mediaGridContent}>{conditionMedia.map((asset, index) => <View key={`${asset.assetId ?? asset.uri}-${index}`} style={styles.mediaTile}><ExpoImage source={{ uri: conditionMediaPreview[asset.uri] ?? asset.uri }} contentFit="cover" style={StyleSheet.absoluteFill} /><View style={styles.mediaBadge}><Text style={styles.mediaBadgeText}>{asset.type === 'video' ? '视频' : asset.type === 'livePhoto' ? '实况' : '图片'}</Text></View><Press onPress={() => setConditionMedia((old) => old.filter((_, i) => i !== index))} style={styles.mediaRemove}><Trash2 color="#fff" size={13} /></Press></View>)}</ScrollView>
              <View style={styles.composerActions}>
                <View style={styles.addMediaGroup}><Press accessibilityRole="button" accessibilityLabel={c.addMedia} accessibilityState={{ disabled: conditionMedia.length >= 9 }} disabled={conditionMedia.length >= 9} onPress={() => void pickConditionMedia()} style={styles.addMediaAction}><ImagePlus color={conditionMedia.length >= 9 ? theme.text3 : theme.text2} size={18} /><Text style={{ color: conditionMedia.length >= 9 ? theme.text3 : theme.text2, fontSize: 13 }}>{c.addMedia}</Text></Press><Text style={[styles.mediaHintInline, { color: theme.text3 }]}>{c.mediaLimitShort}</Text></View>
                <Press accessibilityRole="button" disabled={!canPublishCondition || publishingCondition} onPress={async () => {
                if (!canPublishCondition || publishingCondition) return;
                const now = new Date();
                setPublishingCondition(true);
                setConditionPublishError(null);
                try {
                  await submitRouteCondition({ routeId: request.route.id, body: conditionDraft, visitedAt: now, authorName: resolved === 'zh' ? '我' : 'Me', media: conditionMedia.map((asset) => ({ uri: asset.uri, kind: asset.type === 'video' ? 'video' as const : asset.type === 'livePhoto' ? 'livePhoto' as const : 'image' as const, thumbnail: conditionMediaPreview[asset.uri], pairedVideoUri: asset.pairedVideoAsset?.uri })) });
                  if (conditionModerationEnabled) nav.showToast(c.pendingCondition);
                  setConditionDraft(''); setConditionMedia([]); setConditionMediaPreview({}); setStack((old) => old.slice(0, -1));
                } catch (error) {
                  const message = error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message) : '发布失败，请稍后重试');
                  setConditionPublishError(message);
                  Alert.alert(resolved === 'zh' ? '发布失败' : 'Publish failed', message);
                } finally { setPublishingCondition(false); }
              }} style={[styles.publishButton, { backgroundColor: canPublishCondition && !publishingCondition ? theme.accent : theme.fieldSurface }]}><Text style={{ color: canPublishCondition && !publishingCondition ? '#fff' : theme.text3, fontSize: 13, fontWeight: '700' }}>{publishingCondition ? (resolved === 'zh' ? '发布中…' : 'Publishing…') : c.publishCondition}</Text></Press>
              {conditionPublishError ? <Text style={[styles.publishError, { color: theme.danger }]}>{conditionPublishError}</Text> : null}
              </View>
            </View>
          </> : page.view === 'conditions' ? <>
            <View style={{ marginTop: space.sm }}>{reportsLoading ? <ActivityIndicator color={theme.accent} /> : reports.map((report) => <RouteConditionCard key={report.id} theme={theme} report={report} />)}{!reportsLoading && reports.length === 0 ? <View style={styles.emptyConditions}><Press accessibilityRole="button" accessibilityLabel={c.shareCondition} onPress={() => setStack((old) => [...old, { view: 'condition-compose' }])}><Text style={[styles.body, { color: theme.text, textAlign: 'center' }]}>{c.noReports}</Text></Press></View> : null}</View>
          </> : page.view === 'weather' ? <>
            {weather.loading ? <View style={styles.weatherState}><ActivityIndicator color={theme.accent} /><Text style={[styles.caption, { color: theme.text2 }]}>{c.weather}</Text></View> : weather.forecast ? <RouteWeatherDetails theme={theme} forecast={weather.forecast} routeName={request.route.name} /> : <View style={styles.weatherState}><Text style={{ color: theme.text2 }}>{c.weatherUnavailable}</Text><Press accessibilityRole="button" onPress={weather.retry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.accent }}>{c.retry}</Text></Press></View>}
          </> : <>
            {page.view === 'plan' ? <Text style={[styles.caption, { color: theme.text2, marginBottom: space.md }]}>{c.draft}</Text> : null}
            <Text style={[type.pageTitle, { color: theme.text, lineHeight: 36 }]}>{guideText(page.view === 'guide' ? guide.title : plan.title, resolved)}</Text>
            {page.view === 'guide' ? <>
              <View style={styles.authorRow}><Avatar size={28} uri={guide.authorAvatarUrl || undefined} /><Text style={[styles.author, { color: theme.text2 }]}>{guideText(guide.author, resolved)}</Text></View>
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
        </View>
        </ScrollView>
      </DetailPage>
    </View>
    {shareOpen && page.view === 'guide' ? <RouteGuideShareSheet theme={theme} routeName={request.route.name} guide={guide} onClose={() => setShareOpen(false)} onExport={() => { setShareOpen(false); setExportOpen(true); }} onToast={nav.showToast} /> : null}
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
  body: { fontSize: 14.5, lineHeight: 27 }, caption: { fontSize: 11.5, lineHeight: 20 },
  guideDescription: { marginTop: space.xl, fontSize: 14.5, lineHeight: 25 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  author: { fontSize: 13, lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footerHelpful: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, minHeight: 44, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  create: { flex: 1, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: 44, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  createWithHelpful: { flex: 1.45 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.lg },
  filter: { borderRadius: radius.pill, minHeight: 36, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  headerAdd: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  composerInput: { minHeight: 96, padding: space.md, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, fontSize: 14, lineHeight: 22, textAlignVertical: 'top' },
  composerPageInput: { minHeight: 180 },
  counter: { textAlign: 'right', fontSize: 11, marginTop: space.xs },
  mediaGrid: { width: '100%', alignSelf: 'stretch', marginTop: space.md },
  mediaGridContent: { flexDirection: 'row', gap: space.sm },
  composerActions: { width: '100%', minHeight: 48, marginTop: space.xs, paddingTop: space.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, position: 'relative', zIndex: 2 },
  addMediaGroup: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  addMediaAction: { minHeight: 40, paddingHorizontal: space.xs, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  mediaHintInline: { fontSize: 10, flexShrink: 1 },
  mediaTile: { width: 76, height: 76, borderRadius: radius.control, overflow: 'hidden', backgroundColor: '#222' },
  mediaBadge: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.65)' },
  mediaBadgeText: { color: '#fff', fontSize: 10 },
  mediaRemove: { position: 'absolute', right: 3, top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  publishButton: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  weatherState: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: space.md },
  emptyConditions: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.xl },
  publishError: { marginTop: space.xs, maxWidth: 240, fontSize: 11, lineHeight: 16, textAlign: 'right' },
});
