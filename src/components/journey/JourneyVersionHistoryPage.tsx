import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { History, RotateCcw } from 'lucide-react-native';
import { AppActionDialog, DetailPage, radius, space, type } from '../../design-system';
import type { Poi } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { useI18n, type TKey } from '../../i18n';
import { restoreJourneyVersion, type JourneyVersion, useJourneyVersions } from '../../hooks/useJourneyVersions';
import { refetchJourneyTimeline } from '../../hooks/useTimeline';
import { refetchJourneyInspo } from '../../hooks/useInspo';
import { refetchJourneyPacking } from '../../hooks/useJourneyPacking';
import { useNav } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';

const FIELD_KEYS: Record<string, TKey> = {
  name: 'journey.version.field.name',
  region: 'journey.version.field.location',
  coord: 'journey.version.field.location',
  lng: 'journey.version.field.location',
  lat: 'journey.version.field.location',
  desc: 'journey.version.field.description',
  date: 'journey.version.field.date',
  days: 'journey.version.field.date',
  planned_date: 'journey.version.field.date',
  countdown: 'journey.version.field.date',
  day_index: 'journey.version.field.date',
  total_days: 'journey.version.field.date',
  dist: 'journey.version.field.track',
  asc_: 'journey.version.field.track',
  track_coords: 'journey.version.field.track',
  track_elevation: 'journey.version.field.track',
  track_duration_ms: 'journey.version.field.track',
  track_waypoints: 'journey.version.field.track',
  track_file_url: 'journey.version.field.track',
  track_file_name: 'journey.version.field.track',
  photo_uris: 'journey.version.field.cover',
  hero_mode: 'journey.version.field.cover',
  track_public: 'journey.version.field.visibility',
  route_show_photos: 'journey.version.field.visibility',
  route_show_timeline: 'journey.version.field.visibility',
  participant_permissions: 'journey.version.field.permissions',
  fav: 'journey.version.field.favorite',
  companions: 'journey.version.field.companions',
  timeline: 'journey.version.field.timeline',
  moments: 'journey.version.field.moments',
  checklist: 'journey.version.field.checklist',
  restore: 'journey.version.field.restore',
};

function uniqueFieldLabels(version: JourneyVersion, t: (key: TKey, vars?: Record<string, string | number>) => string) {
  return [...new Set(version.changedFields.map((key) => t(FIELD_KEYS[key] || 'journey.version.field.other')))];
}

function formatVersionTime(value: string, locale: 'zh' | 'en') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function versionSummary(
  version: JourneyVersion,
  editor: string,
  resolved: 'zh' | 'en',
  t: (key: TKey, vars?: Record<string, string | number>) => string,
) {
  if (version.changeKind === 'create') return t('journey.version.createdBy', { name: editor });
  if (version.changeKind === 'restore') return t('journey.version.restoredBy', { name: editor });
  const labels = uniqueFieldLabels(version, t);
  return t('journey.version.changedSummary', {
    name: editor,
    fields: labels.length ? labels.join(resolved === 'zh' ? '、' : ', ') : t('journey.version.field.other'),
  });
}

export function JourneyVersionHistoryPage({ theme, poi, onBack }: { theme: Theme; poi: Poi; onBack: () => void }) {
  const { t, resolved } = useI18n();
  const data = useData();
  const nav = useNav();
  const { versions, loading, error, refetch } = useJourneyVersions(poi.id);
  const [restoreCandidate, setRestoreCandidate] = useState<JourneyVersion>();
  const [restoring, setRestoring] = useState(false);
  const latestVersion = versions[0]?.versionNumber;
  const canRestore = poi.mine !== false;
  const currentName = useMemo(() => poi.name, [poi.name]);

  const restore = async () => {
    if (!restoreCandidate || restoring) return;
    setRestoring(true);
    try {
      await restoreJourneyVersion(restoreCandidate.id);
      const [journeys] = await Promise.all([
        data.refetchJourneys(),
        refetchJourneyTimeline(poi.id),
        refetchJourneyInspo(poi.id),
        refetchJourneyPacking(poi.id),
      ]);
      const restored = journeys.find((journey) => journey.id === poi.id);
      if (restored) nav.syncJourney(restored);
      setRestoreCandidate(undefined);
      await refetch();
      nav.showToast(t('journey.version.restoreSuccess'));
    } catch {
      nav.showToast(t('journey.version.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <DetailPage theme={theme} title={t('journey.version.title')} onBack={onBack} backgroundColor={theme.groupedBg}>
      <View style={styles.content}>
        {loading ? (
          <View style={styles.state}><ActivityIndicator color={theme.accent} /></View>
        ) : error ? (
          <View style={styles.state}>
            <History color={theme.text3} size={30} strokeWidth={1.7} />
            <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.version.loadFailed')}</Text>
            <Press onPress={() => void refetch()} style={[styles.retry, { backgroundColor: theme.controlSurface, borderColor: theme.fieldBorder }]}>
              <Text style={[type.body, { color: theme.accent, fontWeight: '700' }]}>{t('journey.version.retry')}</Text>
            </Press>
          </View>
        ) : versions.length ? (
          <>
            <View style={styles.summaryHeader}>
              <Text numberOfLines={2} style={[type.sectionTitle, styles.journeyName, { color: theme.text }]}>{poi.name}</Text>
              <Text style={[type.caption, { color: theme.text3 }]}>{t('journey.version.count', { count: versions.length })}</Text>
            </View>
            <View style={[styles.list, { backgroundColor: theme.surfaceTop, borderColor: theme.fieldBorder }]}>
              {versions.map((version, index) => {
                const isCurrent = version.versionNumber === latestVersion;
                const editor = version.changedByName || t('journey.version.unknownEditor');
                return (
                  <View key={version.id} style={styles.versionRow}>
                    {index > 0 ? <View style={[styles.timelineTop, { backgroundColor: theme.hairline }]} /> : null}
                    {index < versions.length - 1 ? <View style={[styles.timelineBottom, { backgroundColor: theme.hairline }]} /> : null}
                    <View
                      style={[
                        styles.timelineDot,
                        isCurrent
                          ? { backgroundColor: theme.accent, borderColor: theme.accent }
                          : { backgroundColor: theme.surfaceTop, borderColor: theme.text3 },
                      ]}
                    />
                    <View style={styles.rowContent}>
                      <View style={styles.titleRow}>
                        <Text style={[type.cardTitle, { color: theme.text }]}>{t('journey.version.number', { number: version.versionNumber })}</Text>
                        {isCurrent ? <Text style={[styles.current, { color: theme.accent }]}>{t('journey.version.current')}</Text> : null}
                      </View>
                      <Text style={[type.caption, styles.time, { color: theme.text3 }]}>{formatVersionTime(version.changedAt, resolved)}</Text>
                      <Text style={[type.body, styles.changeSummary, { color: theme.text2 }]}>
                        {versionSummary(version, editor, resolved, t)}
                      </Text>
                    </View>
                    {canRestore && !isCurrent ? (
                      <Press
                        onPress={() => setRestoreCandidate(version)}
                        accessibilityRole="button"
                        accessibilityLabel={t('journey.version.restore')}
                        hitSlop={4}
                        style={styles.restore}
                      >
                        <RotateCcw color={theme.text3} size={18} strokeWidth={1.9} />
                      </Press>
                    ) : null}
                    {index < versions.length - 1 ? <View style={[styles.divider, { backgroundColor: theme.hairline }]} /> : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.state}>
            <History color={theme.text3} size={30} strokeWidth={1.7} />
            <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.version.empty')}</Text>
          </View>
        )}
      </View>

      <AppActionDialog
        theme={theme}
        visible={Boolean(restoreCandidate)}
        title={t('journey.version.restoreTitle', { number: restoreCandidate?.versionNumber || 0 })}
        message={t('journey.version.restoreMessage', { name: currentName })}
        confirmLabel={t('journey.version.restore')}
        cancelLabel={t('common.cancel')}
        confirming={restoring}
        onCancel={() => setRestoreCandidate(undefined)}
        onConfirm={() => void restore()}
      />
    </DetailPage>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingBottom: space.xxxl },
  summaryHeader: { marginTop: space.lg, marginBottom: space.md, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  journeyName: { flex: 1, minWidth: 0 },
  list: { overflow: 'hidden', borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  versionRow: { minHeight: 106, paddingLeft: 48, paddingRight: 8, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center' },
  rowContent: { flex: 1, minWidth: 0, paddingRight: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  current: { fontSize: 12, lineHeight: 17, fontWeight: '700', letterSpacing: 0 },
  time: { marginTop: 3 },
  changeSummary: { marginTop: space.xs, lineHeight: 20 },
  restore: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  divider: { position: 'absolute', left: 48, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  timelineTop: { position: 'absolute', left: 25, top: 0, width: StyleSheet.hairlineWidth, height: 20 },
  timelineBottom: { position: 'absolute', left: 25, top: 29, bottom: 0, width: StyleSheet.hairlineWidth },
  timelineDot: { position: 'absolute', left: 21, top: 20, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  state: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  retry: { minHeight: 42, marginTop: space.xs, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
