import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CalendarDays, Pin, Route, TrendingUp, UserRound } from 'lucide-react-native';
import type { Poi } from '../../data/pois';
import { radius, space } from '../../design-system';
import { useI18n } from '../../i18n';
import { Theme } from '../../theme/theme';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';

export type JourneyStatus = 'planned' | 'active' | 'completed' | 'unscheduled';

export function journeyStartDate(journey: Poi): Date | null {
  const value = journey.plannedDate?.trim();
  if (!value) return null;

  const iso = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const localized = value.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  const yearFromMeta = journey.date?.match(/(20\d{2})/)?.[1];
  const year = Number(iso?.[1] || localized?.[1] || yearFromMeta || new Date().getFullYear());
  const month = Number(iso?.[2] || localized?.[2]);
  const day = Number(iso?.[3] || localized?.[3]);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function journeyStatus(journey: Poi, now = new Date()): JourneyStatus {
  const start = journeyStartDate(journey);
  if (start) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, journey.totalDays || 1) - 1);
    if (today < start) return 'planned';
    if (today <= end) return 'active';
    return 'completed';
  }
  if (journey.date) return 'completed';
  return 'unscheduled';
}

function journeyCardBackground(theme: Theme, status: JourneyStatus) {
  if (theme.dark) return status === 'planned' || status === 'active' ? theme.accentSoft : theme.fieldSurface;
  if (status === 'planned' || status === 'active') return '#DDF8F1';
  if (status === 'completed') return '#EEF0F2';
  return '#E3F1FD';
}

export function JourneyPlanCard({
  theme,
  journey,
  pinned = false,
  onPress,
  pressFeedback = true,
  showStatus = true,
}: {
  theme: Theme;
  journey: Poi;
  pinned?: boolean;
  onPress?: () => void;
  pressFeedback?: boolean;
  showStatus?: boolean;
}) {
  const { t } = useI18n();
  const status = journeyStatus(journey);
  const coverUri = journey.photoUris?.[0];
  const companion = journey.companionList?.[0];
  const date = journey.plannedDate || journey.date || t('journeyHome.dateUnset');
  const duration = journey.totalDays ? t('journeyEdit.meta.days', { count: journey.totalDays }) : undefined;
  const statusVisible = showStatus && (status === 'planned' || status === 'active');
  const distanceValue = Number.parseFloat(journey.dist || '');
  const ascentValue = Number.parseFloat(journey.asc || '');
  const hasDistance = Number.isFinite(distanceValue) && distanceValue > 0;
  const hasAscent = hasDistance && Number.isFinite(ascentValue) && ascentValue >= 0;
  const routeFacts: { type: 'distance' | 'ascent' | 'pending'; value: string }[] = [];
  if (hasDistance) routeFacts.push({ type: 'distance', value: journey.dist });
  if (hasAscent) routeFacts.push({ type: 'ascent', value: journey.asc });
  if (!routeFacts.length) routeFacts.push({ type: 'pending', value: t('journeyHome.routePending') });
  const cardStyle = [styles.planCard, { backgroundColor: journeyCardBackground(theme, status) }];

  const content = (
    <>
      {pinned || statusVisible ? (
        <View style={styles.cardBadges}>
          {pinned ? (
            <View style={[styles.pinnedBadge, { backgroundColor: theme.controlSurface }]}>
              <Pin color={theme.accent} fill={theme.accent} size={11} strokeWidth={2} />
              <Text style={[styles.pinnedLabel, { color: theme.text2 }]}>{t('journeyHome.action.pinned')}</Text>
            </View>
          ) : null}
          {statusVisible ? (
            <View style={[styles.statusPill, { backgroundColor: theme.controlSurface }]}>
              <CalendarDays color={theme.accent} size={13} />
              <Text style={[styles.statusLabel, { color: theme.text }]}>{t(`journeyHome.filter.${status}`)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.cardCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.cardTitle,
            (pinned || statusVisible) && styles.cardTitleWithStatus,
            pinned && statusVisible && styles.cardTitleWithTwoBadges,
            { color: theme.text },
          ]}
        >
          {journey.name}
        </Text>
        <View style={[styles.cardMeta, { borderLeftColor: theme.text3 }]}>
          <Text numberOfLines={1} style={[styles.metaPrimary, { color: theme.text2 }]}>
            {duration ? `${date}  ${duration}` : date}
          </Text>
          <View style={styles.routeMetrics}>
            {routeFacts.slice(0, 2).map((fact) => (
              <View key={fact.type} style={styles.routeMetric}>
                {fact.type === 'ascent'
                  ? <TrendingUp color={theme.text3} size={13} />
                  : <Route color={theme.text3} size={13} />}
                <Text numberOfLines={1} style={[styles.metaSecondary, { color: theme.text2 }]}>{fact.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={[styles.avatar, { backgroundColor: theme.controlSurface }]}>
        {companion?.avatarUrl ? (
          <Image source={{ uri: companion.avatarUrl }} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <UserRound color={theme.text3} size={18} />
        )}
      </View>
      {coverUri ? (
        <Image source={{ uri: coverUri }} contentFit="cover" transition={180} style={styles.cover} />
      ) : (
        <PhotoTile tone={journey.tone} seed={journey.id} radius={17} resWidth={360} style={styles.cover} />
      )}
    </>
  );

  return onPress ? (
    <Press
      accessibilityRole="button"
      accessibilityLabel={journey.name}
      onPress={onPress}
      scaleTo={pressFeedback ? 0.985 : 1}
      opacityTo={pressFeedback ? 0.82 : 1}
      style={cardStyle}
    >
      {content}
    </Press>
  ) : (
    <View style={cardStyle}>{content}</View>
  );
}

const styles = StyleSheet.create({
  planCard: { height: 166, borderRadius: 26, overflow: 'hidden' },
  cardCopy: { width: '100%', height: '100%', paddingHorizontal: 18, paddingVertical: 17, zIndex: 2 },
  cardBadges: { position: 'absolute', top: 14, right: 15, zIndex: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: { height: 26, paddingHorizontal: 9, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusLabel: { fontSize: 11.5, lineHeight: 15, fontWeight: '700', letterSpacing: 0 },
  pinnedBadge: { alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinnedLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 0 },
  cardTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: 0 },
  cardTitleWithStatus: { maxWidth: '66%' },
  cardTitleWithTwoBadges: { maxWidth: '52%' },
  cardMeta: { width: '62%', marginTop: 5, paddingLeft: 9, borderLeftWidth: 1.5, gap: 2 },
  metaPrimary: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', letterSpacing: 0 },
  metaSecondary: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', letterSpacing: 0 },
  routeMetrics: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  routeMetric: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { position: 'absolute', left: 18, bottom: 16, width: 29, height: 29, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  cover: { position: 'absolute', width: 120, height: 82, right: -7, bottom: -4, borderRadius: 17, transform: [{ rotate: '-8deg' }] },
});
