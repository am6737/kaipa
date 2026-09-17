import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { Icon, IconName } from '../Icon';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';

export function RoutePreviewPanel({ theme, poi, onClose, showActions = true }: { theme: Theme; poi: Poi; onClose?: () => void; showActions?: boolean }) {
  const nav = useNav();
  const { t } = useI18n();
  const route = nav.merged(poi);
  const difficultyLabel = route.diff ? ({ 易: '轻松', 中: '适中', 中高: '进阶', 高: '挑战' } as const)[route.diff] : undefined;

  return (
    <View style={{ paddingTop: space.xxs, paddingBottom: showActions ? space.xl : 112 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Text numberOfLines={2} style={[type.pageTitle, { flex: 1, color: theme.text, fontSize: 28, lineHeight: 34 }]}>{route.name}</Text>
        {onClose ? (
          <Press onPress={onClose} accessibilityRole="button" style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={theme.text} size={23} />
          </Press>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: space.md }}>
        {difficultyLabel ? <InfoPill theme={theme} text={difficultyLabel} accent /> : null}
        <InfoPill theme={theme} icon="distance" text={route.dist} mono />
        <InfoPill theme={theme} icon="arrowUp" text={route.asc.replace('+', '')} mono />
        <InfoPill theme={theme} icon="pin" text={route.region.replace(/\s*·\s*/g, ' ')} />
      </View>

      {route.bestMonths?.length ? <SeasonStrip theme={theme} months={route.bestMonths} note={route.seasonNote} /> : null}

      <PhotoTile tone={route.tone} seed={route.id} radius={radius.feature} resWidth={900} style={{ height: 196, marginTop: space.xl }}>
        {route.photoUris?.[0] ? <Image source={{ uri: route.photoUris[0] }} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
      </PhotoTile>

      {route.desc ? (
        <View style={{ marginTop: space.xl }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.section.routeAbout')}</Text>
          <Text style={[type.body, { color: theme.text2, lineHeight: 23, marginTop: space.sm }]}>{route.desc}</Text>
        </View>
      ) : null}

      {showActions ? <RoutePreviewActions theme={theme} poi={route} style={{ marginTop: space.xl }} /> : null}
    </View>
  );
}

export function RoutePreviewActions({ theme, poi, style }: { theme: Theme; poi: Poi; style?: object }) {
  const nav = useNav();
  const { t } = useI18n();
  const route = nav.merged(poi);
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'flex-start', gap: space.xs, marginHorizontal: space.xs }, style]}>
      <ActionPill
        theme={theme}
        icon={route.fav ? 'heartFill' : 'heart'}
        label={route.fav ? t('journey.more.unfavorite') : t('journey.more.favorite')}
        active={!!route.fav}
        onPress={() => nav.toggleFav()}
      />
      <ActionPill theme={theme} icon="share" label={t('common.share')} onPress={() => nav.openSharePanel(route)} />
      <Press
        hitSlop={3}
        onPress={() => nav.openNewJourney(route)}
        accessibilityRole="button"
        style={{ flexShrink: 1, height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}
      >
        <Icon name="calendar" color={theme.text} size={16} />
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>{t('journey.cta.planRoute')}</Text>
      </Press>
    </View>
  );
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// "5-6月 · 9-10月" — collapse adjacent months into ranges.
function monthRanges(months: number[]) {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const m = sorted[i];
    if (m === prev + 1) {
      prev = m;
      continue;
    }
    ranges.push(start === prev ? `${start}月` : `${start}-${prev}月`);
    start = m;
    prev = m;
  }
  return ranges.join(' · ');
}

// A 12-cell month strip highlighting the route's best season, with the
// current month ringed and the free-form note (封山期, 雨季…) below.
function SeasonStrip({ theme, months, note }: { theme: Theme; months: number[]; note?: string }) {
  const { t } = useI18n();
  const best = new Set(months);
  const currentMonth = new Date().getMonth() + 1;
  return (
    <View style={{ marginTop: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>{t('route.seasonTitle')}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text2 }}>{monthRanges(months)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {MONTHS.map((m) => {
          const isBest = best.has(m);
          const isCurrent = m === currentMonth;
          return (
            <View
              key={m}
              style={{
                flex: 1,
                height: 30,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isBest ? theme.accent : theme.dark ? theme.fieldSurface : '#F3F3F4',
                borderWidth: isCurrent && !isBest ? StyleSheet.hairlineWidth : 0,
                borderColor: theme.accent,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: MONO, fontWeight: '700', color: isBest ? '#FFFFFF' : theme.text3 }}>{m}</Text>
            </View>
          );
        })}
      </View>
      {note ? (
        <Text style={{ fontSize: 12, color: theme.text3, lineHeight: 17, marginTop: 7 }}>{note}</Text>
      ) : null}
    </View>
  );
}

function InfoPill({ theme, icon, text, accent, mono }: { theme: Theme; icon?: IconName; text: string; accent?: boolean; mono?: boolean }) {
  return (
    <View style={{ height: 30, maxWidth: '100%', paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: accent ? theme.accent : theme.dark ? theme.fieldSurface : '#F3F3F4' }}>
      {icon ? <Icon name={icon} color={accent ? '#FFFFFF' : theme.text3} size={13} /> : null}
      <Text numberOfLines={1} style={{ fontFamily: mono ? MONO : undefined, fontSize: 11.5, fontWeight: '700', color: accent ? '#FFFFFF' : theme.text2, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

function ActionPill({ theme, icon, label, active, onPress }: { theme: Theme; icon: IconName; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Press hitSlop={3} onPress={onPress} accessibilityRole="button" style={{ flexShrink: 1, minWidth: 0, height: 38, paddingHorizontal: space.sm, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: active ? theme.accentSoft : theme.controlSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? theme.accent : theme.fieldBorder, boxShadow: theme.dark ? '0px 4px 12px rgba(0,0,0,0.38)' : '0px 4px 12px rgba(0,0,0,0.08)' }}>
      <Icon name={icon} color={active ? theme.accent : theme.text} size={16} />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: active ? theme.accent : theme.text }}>{label}</Text>
    </Press>
  );
}
