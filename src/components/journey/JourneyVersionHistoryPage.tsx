import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, History, UserRound } from 'lucide-react-native';
import { DetailPage, radius, space, type } from '../../design-system';
import type { Poi } from '../../data/pois';
import { useData } from '../../data/DataContext';
import { useI18n } from '../../i18n';
import { type JourneyVersion, useJourneyVersions } from '../../hooks/useJourneyVersions';
import { toJourneyPoi } from '../../lib/mappers';
import { useNav } from '../../nav/NavContext';
import type { Theme } from '../../theme/theme';
import { Press } from '../Press';
import { formatJourneyVersionRelativeTime, journeyVersionSummary } from './journeyVersionPresentation';

export function JourneyVersionHistoryPage({ theme, poi, onBack }: { theme: Theme; poi: Poi; onBack: () => void }) {
  const { t, resolved } = useI18n();
  const data = useData();
  const nav = useNav();
  const { versions, loading, error, refetch } = useJourneyVersions(poi.id);
  const latestVersion = versions[0]?.versionNumber;

  const openPreview = (version: JourneyVersion) => {
    const previewPoi = toJourneyPoi(
      { ...version.snapshot.journey, mine: false },
      version.snapshot.companions,
      data.userId,
    );
    nav.openJourneyVersionPreview(previewPoi, poi, version);
  };

  return (
    <DetailPage
      theme={theme}
      title={t('journey.version.title')}
      onBack={onBack}
      left={<HistoryBackButton theme={theme} onPress={onBack} />}
      backgroundColor={theme.groupedBg}
    >
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
            <View style={styles.intro}>
              <Text style={[type.body, { color: theme.text3 }]}>{t('journey.version.autoSaveHint')}</Text>
            </View>
            <View style={styles.list}>
              {versions.map((version) => {
                const isCurrent = version.versionNumber === latestVersion;
                const editor = version.changedByName || t('journey.version.unknownEditor');
                return (
                  <Press
                    key={version.id}
                    onPress={isCurrent ? undefined : () => openPreview(version)}
                    accessibilityRole={isCurrent ? undefined : 'button'}
                    accessibilityLabel={isCurrent ? undefined : t('journey.version.previewLabel')}
                    style={[styles.versionRow, { backgroundColor: theme.featureSurface }]}
                  >
                    <View style={styles.rowContent}>
                      <View style={styles.titleRow}>
                        <Text numberOfLines={2} style={[styles.changeSummary, { color: theme.text }]}>
                          {journeyVersionSummary(version, resolved, t)}
                        </Text>
                        {isCurrent ? (
                          <Text style={[type.caption, styles.current, { color: theme.accent, backgroundColor: theme.accentSofter }]}>
                            {t('journey.version.current')}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.metadataRow}>
                        <UserRound color={theme.text3} size={14} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={[type.body, styles.editorName, { color: theme.text2 }]}>{editor}</Text>
                      </View>
                      <Text style={[type.caption, styles.versionTime, { color: theme.text3 }]}>
                        {formatJourneyVersionRelativeTime(version.changedAt, resolved)}
                      </Text>
                    </View>
                    <View style={styles.accessory}>
                      {!isCurrent ? <ChevronRight color={theme.text3} size={18} strokeWidth={1.8} /> : null}
                    </View>
                  </Press>
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

    </DetailPage>
  );
}

function HistoryBackButton({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      style={styles.backButton}
    >
      <ChevronLeft color={theme.text} size={30} strokeWidth={2} />
    </Press>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingBottom: space.xxxl },
  intro: { marginTop: space.md, marginBottom: space.lg },
  list: { gap: space.sm },
  versionRow: { minHeight: 104, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.md, borderRadius: radius.feature, flexDirection: 'row', alignItems: 'center' },
  rowContent: { flex: 1, minWidth: 0, paddingRight: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  changeSummary: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  current: { flexShrink: 0, minHeight: 24, paddingHorizontal: space.xs, borderRadius: radius.pill, fontWeight: '700', lineHeight: 24, overflow: 'hidden' },
  metadataRow: { minHeight: 22, marginTop: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  editorName: { flex: 1, minWidth: 0 },
  versionTime: { marginTop: space.xs },
  accessory: { width: 18, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  state: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  retry: { minHeight: 42, marginTop: space.xs, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
