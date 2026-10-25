// ItineraryImportPage.tsx — 导入行程，检查硬伤. The user pastes text, adds
// screenshots; the itinerary-import function transcribes them into
// days, itineraryCheck judges them, and nothing is saved until 创建旅程.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImagePlus, X } from 'lucide-react-native';
import { AppQuestionHeader, AppTextArea, DetailPage, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useData } from '../../data/DataContext';
import { supabase } from '../../lib/supabase';
import { chooseItinerary, fromPublishedRow, type PublishedItinerary, type PublishedItineraryRow } from '../../lib/officialItinerary';
import { checkItinerary, countIssues, type ImportedItinerary, type ItineraryIssue, type IssueSeverity } from '../../lib/itineraryCheck';
import { IMPORT_MAX_IMAGES, ItineraryImportError, newImportRequestId, readItinerary, saveImportedItinerary, type ImportImage } from '../../lib/itineraryImport';
import { Theme } from '../../theme/theme';
import { Press } from '../Press';

type Phase = 'input' | 'reading' | 'report';
type Report = { itinerary: ImportedItinerary; issues: ItineraryIssue[]; official: PublishedItinerary | null; routeName: string | null };

async function officialPlanFor(routeId: string, hikeDays: number): Promise<PublishedItinerary | null> {
  const result = await supabase.rpc('route_itineraries_published', { p_route_id: routeId });
  if (result.error) return null;
  return chooseItinerary(((result.data ?? []) as PublishedItineraryRow[]).map(fromPublishedRow), hikeDays || undefined) ?? null;
}

export function ItineraryImportPage({
  theme,
  onClose,
  onCreated,
}: {
  theme: Theme;
  onClose: () => void;
  onCreated: (journeyId: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const data = useData();
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImportImage[]>([]);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  // One request id per report, so a retried save never creates a second journey.
  const requestIdRef = useRef(newImportRequestId());

  const hasSource = Boolean(text.trim() || images.length);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'report' && !creating) setPhase('input');
      else if (phase === 'input') onClose();
      return true;
    });
    return () => subscription.remove();
  }, [creating, onClose, phase]);

  const pickImages = async () => {
    const remaining = IMPORT_MAX_IMAGES - images.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 1,
      base64: Platform.OS === 'web',
    });
    if (result.canceled) return;
    setImages((current) => [...current, ...result.assets.map((asset) => ({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType }))].slice(0, IMPORT_MAX_IMAGES));
    setError('');
  };

  const analyze = async () => {
    if (!hasSource || phase === 'reading') return;
    setPhase('reading');
    setError('');
    try {
      const itinerary = await readItinerary({ text, images });
      const route = itinerary.routeId ? data.routes.find((item) => item.id === itinerary.routeId) : undefined;
      const hikeDays = itinerary.days.filter((day) => day.kind === 'hike').length;
      const official = itinerary.routeId ? await officialPlanFor(itinerary.routeId, hikeDays) : null;
      const issues = checkItinerary(itinerary, {
        today: new Date(),
        official: official?.payload,
        routeBestMonths: route?.bestMonths,
      });
      requestIdRef.current = newImportRequestId();
      setReport({ itinerary, issues, official, routeName: route?.name ?? null });
      setPhase('report');
    } catch (cause) {
      setError(cause instanceof ItineraryImportError ? cause.message : t('itineraryImport.readFailed'));
      setPhase('input');
    }
  };

  const create = async () => {
    if (!report || creating) return;
    setCreating(true);
    try {
      const journeyId = await saveImportedItinerary({
        itinerary: report.itinerary,
        requestId: requestIdRef.current,
        sources: [text.trim() ? 'text' : null, images.length ? 'image' : null].filter(Boolean) as Array<'text' | 'image'>,
        issueCounts: countIssues(report.issues),
        noteLabels: { km: t('itineraryImport.km'), ascent: t('itineraryImport.ascent'), descent: t('itineraryImport.descent') },
      });
      await onCreated(journeyId);
    } catch (cause) {
      console.warn('[ItineraryImportPage] create failed:', cause);
      setError(t('itineraryImport.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const footer = phase === 'reading' ? null : (
    <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.footerRow}>
        {phase === 'report' ? (
          <Press accessibilityRole="button" disabled={creating} onPress={() => setPhase('input')} style={[styles.pill, { backgroundColor: theme.controlSurface, borderColor: theme.hairline }]}>
            <Text numberOfLines={1} style={[type.labelStrong, { color: theme.text2 }]}>{t('itineraryImport.reimport')}</Text>
          </Press>
        ) : null}
        <Press
          accessibilityRole="button"
          accessibilityState={{ disabled: phase === 'input' ? !hasSource : creating }}
          disabled={phase === 'input' ? !hasSource : creating}
          onPress={() => void (phase === 'input' ? analyze() : create())}
          style={[styles.pill, phase === 'report' && styles.pillPrimary, { backgroundColor: theme.controlSurface, borderColor: theme.hairline, opacity: phase === 'input' && !hasSource ? 0.45 : 1 }]}
        >
          <Text numberOfLines={1} style={[type.labelStrong, { color: theme.text }]}>
            {phase === 'input' ? t('itineraryImport.start') : creating ? t('itineraryImport.creating') : t('itineraryImport.create')}
          </Text>
        </Press>
      </View>
    </View>
  );

  return (
    <DetailPage theme={theme} title={t('itineraryImport.title')} onBack={phase === 'report' && !creating ? () => setPhase('input') : onClose} scrollable={false} flatChrome overlay={footer}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        {phase === 'input' ? (
          <>
            <AppQuestionHeader theme={theme} question={t('itineraryImport.question')} description={t('itineraryImport.lead')} />
            <AppTextArea
              theme={theme}
              value={text}
              onChangeText={(value) => { setText(value); setError(''); }}
              placeholder={t('itineraryImport.textPlaceholder')}
              maxLength={20_000}
              style={styles.textArea}
            />
            <View style={styles.attachments}>
              {images.map((image, index) => (
                <View key={image.uri} style={styles.thumb}>
                  <Image source={{ uri: image.uri }} contentFit="cover" style={[styles.thumb, { backgroundColor: theme.fieldSurface }]} />
                  <Press accessibilityRole="button" accessibilityLabel={t('itineraryImport.removeImage')} hitSlop={12} onPress={() => setImages((current) => current.filter((_, i) => i !== index))} style={[styles.thumbRemove, { backgroundColor: theme.text }]}>
                    <X color={theme.featureSurface} size={12} strokeWidth={3} />
                  </Press>
                </View>
              ))}
              {images.length < IMPORT_MAX_IMAGES ? (
                <Press accessibilityRole="button" accessibilityLabel={t('itineraryImport.addImages')} onPress={() => void pickImages()} style={[styles.thumb, styles.addTile, { backgroundColor: theme.fieldSurface }]}>
                  <ImagePlus color={theme.text3} size={22} strokeWidth={2} />
                </Press>
              ) : null}
            </View>
            <Text style={[type.hint, styles.hint, { color: theme.text3 }]}>{t('itineraryImport.imagesHint', { max: IMPORT_MAX_IMAGES })}</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={[type.hint, styles.error, { color: theme.danger }]}>{error}</Text> : null}
          </>
        ) : phase === 'reading' ? (
          <View accessibilityLiveRegion="polite" style={styles.steps}>
            <View style={styles.stepRow}>
              <ActivityIndicator size="small" color={theme.text2} />
              <Text style={[type.researchLineTitle, { color: theme.text }]}>{t('itineraryImport.stepRead')}</Text>
            </View>
            <View style={styles.stepRow}>
              <View style={[styles.stepDot, { backgroundColor: theme.text3 }]} />
              <Text style={[type.researchLineTitle, { color: theme.text3 }]}>{t('itineraryImport.stepCheck')}</Text>
            </View>
          </View>
        ) : report ? (
          <ImportReport theme={theme} report={report} error={error} />
        ) : null}
      </ScrollView>
    </DetailPage>
  );
}

function ImportReport({ theme, report, error }: { theme: Theme; report: Report; error: string }) {
  const { t } = useI18n();
  const { itinerary, issues, official, routeName } = report;
  const counts = countIssues(issues);
  const meta = [
    t('itineraryImport.dayCount', { count: itinerary.days.length }),
    itinerary.startDate ? t('itineraryImport.startOn', { date: itinerary.startDate }) : '',
    official ? '' : routeName ?? '',
  ].filter(Boolean).join('  ');
  const headline = counts.serious
    ? t('itineraryImport.summarySerious', { count: counts.serious })
    : counts.warning ? t('itineraryImport.summaryWarning', { count: counts.warning }) : t('itineraryImport.clear');
  const detail = issues.length
    ? [
      counts.serious && counts.warning ? t('itineraryImport.summaryWarning', { count: counts.warning }) : '',
      counts.info ? t('itineraryImport.summaryInfo', { count: counts.info }) : '',
    ].filter(Boolean).join('，')
    : t('itineraryImport.clearBody');
  const severityColor = (severity: IssueSeverity) => severity === 'serious' ? theme.danger : severity === 'warning' ? theme.text : theme.text3;

  return (
    <>
      <Text style={[type.planHeading, { color: theme.text }]}>{itinerary.name || t('itineraryImport.title')}</Text>
      <Text style={[type.meta, styles.meta, { color: theme.text3 }]}>{meta}</Text>
      {official ? <Text style={[type.byline, { color: theme.text2 }]}>{t('itineraryImport.comparedWith', { name: official.payload.name })}</Text> : null}

      <View accessibilityLiveRegion="polite" style={styles.summary}>
        <Text style={[type.planTitle, { color: counts.serious ? theme.danger : theme.text }]}>{headline}</Text>
        {detail ? <Text style={[type.byline, { color: theme.text2 }]}>{detail}</Text> : null}
      </View>

      {issues.length ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[type.sectionTitle, { color: theme.text }]}>{t('itineraryImport.issuesTitle')}</Text>
          {issues.map((issue, index) => (
            <View key={`${issue.code}-${index}`} accessible style={[styles.issueRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }]}>
              <Text style={[type.chatLabel, styles.severity, { color: severityColor(issue.severity) }]}>{t(`itineraryImport.severity.${issue.severity}`)}</Text>
              <Text style={[type.message, styles.flex, { color: theme.text }]}>{t(`itineraryImport.issue.${issue.code}`, issue.vars)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={[type.sectionTitle, { color: theme.text }]}>{t('itineraryImport.daysTitle')}</Text>
        {itinerary.days.map((day, index) => {
          const stats = [
            day.date ?? '',
            day.distanceKm != null ? `${day.distanceKm} km` : '',
            day.ascentM != null ? `${t('itineraryImport.ascent')} ${day.ascentM} m` : '',
          ].filter(Boolean).join('  ');
          const serious = issues.some((issue) => issue.day === index + 1 && issue.severity === 'serious');
          return (
            <View key={index} style={styles.day}>
              <Text style={[type.planDay, styles.dayLabel, { color: serious ? theme.danger : theme.text3 }]}>{t('itineraryImport.dayLabel', { count: index + 1 })}</Text>
              <View style={[styles.flex, styles.dayBody]}>
                <Text style={[type.planRowTitle, { color: theme.text }]}>{day.title || day.items[0]?.title || t('itineraryImport.dayLabel', { count: index + 1 })}</Text>
                {stats ? <Text style={[type.meta, { color: theme.text3 }]}>{stats}</Text> : null}
                {day.stay ? <Text style={[type.planItem, { color: theme.text2 }]}>{t('itineraryImport.stay', { name: day.stay })}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={[type.hint, styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.md },
  textArea: { marginTop: space.xl, minHeight: 180 },
  attachments: { marginTop: space.md, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.control },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  addTile: { alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: space.md },
  hint: { marginTop: space.xs },
  steps: { paddingTop: space.xl, gap: space.md },
  stepRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepDot: { width: 6, height: 6, borderRadius: radius.pill, marginHorizontal: 7 },
  meta: { marginTop: space.xs, marginBottom: space.xxs },
  summary: { marginTop: space.xl, gap: space.xxs },
  section: { marginTop: space.xxl, gap: space.xs },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  severity: { minWidth: 32, marginTop: 2 },
  flex: { flex: 1 },
  dayBody: { gap: space.xxs },
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm },
  dayLabel: { width: 48 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pill: { flex: 1, minHeight: 44, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  pillPrimary: { flex: 1.45 },
});
