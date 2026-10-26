// TrailSummary.tsx — the panel once a recording is finished: what was walked,
// under its name and when, and one way on (save). 继续记录 stays in sight
// because 结束 no longer asks first, so it is the way back from a mis-tap.
// There is no 放弃, after Komoot and AllTrails: a walk is always kept, and an
// unwanted one is deleted from the track page that saving opens. A recording
// too short to save has nothing to lose, so 关闭 there just clears it.
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useTrail } from '../../trail/TrailContext';
import { elevationProfile, formatClock, splitDistance } from '../../lib/trailGeo';
import { clearTrail, reopenTrail, type TrailSession } from '../../lib/trailRecorder';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { RenameTrackDialog } from '../tracks/RenameTrackDialog';
import { TrailControlButton } from './TrailControlButton';
import { TrailProfile } from './TrailProfile';

type T = ReturnType<typeof useI18n>['t'];

export function TrailSummary({ theme, session, arrived }: { theme: Theme; session: TrailSession; arrived: boolean }) {
  const { t } = useI18n();
  const nav = useNav();
  const trail = useTrail();
  const [name, setName] = useState(() => session.route?.name ?? defaultName(t, session.startedAt));
  const [saving, setSaving] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const pointCount = session.segments.reduce((sum, segment) => sum + segment.length, 0);
  const tooShort = pointCount < 2;
  const distance = splitDistance(session.totals.distM);
  const profile = useMemo(() => elevationProfile(session.segments), [session.segments]);
  const maxAltitude = useMemo(() => {
    let max: number | null = null;
    for (const segment of session.segments) for (const point of segment) if (point[2] != null) max = Math.max(max ?? -Infinity, point[2]);
    return max;
  }, [session.segments]);

  const { distM } = session.totals;
  const movingMs = session.activeMs;
  const avgSpeed = distM >= 50 && movingMs >= 60_000 ? (distM / 1000 / (movingMs / 3_600_000)).toFixed(1) : '--';
  const endedAt = session.endedAt ?? Date.now();
  const pausedMs = Math.max(0, endedAt - session.startedAt - movingMs);
  const paused = pausedMs >= 3_600_000
    ? { value: (pausedMs / 3_600_000).toFixed(1), unit: t('trail.summary.hours') }
    : { value: String(Math.floor(pausedMs / 60_000)), unit: t('trail.summary.minutes') };

  const save = async () => {
    if (saving || tooShort) return;
    setSaving(true);
    try {
      const result = await trail.saveTrail(name.trim() || defaultName(t, session.startedAt));
      if (result.status === 'saved') {
        nav.showToast(t('trail.summary.saved'));
        nav.openTrackPage(result.track.id);
      } else {
        nav.showToast(t('trail.summary.queued'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {tooShort ? (
            <Text numberOfLines={2} style={[type.sectionTitle, { color: theme.text }]}>{name}</Text>
          ) : (
            <Press
              onPress={() => setRenameOpen(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`${name} ${t('trail.summary.rename')}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', maxWidth: '100%' }}
            >
              <Text numberOfLines={2} style={[type.sectionTitle, { color: theme.text, flexShrink: 1 }]}>{name}</Text>
              <Icon name="edit" color={theme.text2} size={16} />
            </Press>
          )}
          <Text style={[type.small, { color: theme.text2, marginTop: 2 }]}>
            {t('trail.summary.when', { date: formatDate(t, session.startedAt), start: formatTime(session.startedAt), end: formatTime(endedAt) })}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xxs, marginTop: space.xs }}>
        <Text style={[type.display, { fontSize: 56, lineHeight: 64, letterSpacing: -2, color: theme.text }]}>{distance.value}</Text>
        <Text style={[type.displayUnit, { color: theme.text2 }]}>{distance.unit}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm, marginTop: space.sm }}>
        <SummaryStat theme={theme} label={t('trail.stat.time')} value={formatClock(movingMs)} />
        <SummaryStat theme={theme} label={t('trail.stat.ascent')} value={`+${Math.round(session.totals.ascM)}`} unit="m" />
        <SummaryStat theme={theme} label={t('trail.stat.descent')} value={`-${Math.round(session.totals.descM)}`} unit="m" />
        <SummaryStat theme={theme} label={t('trail.stat.avgSpeed')} value={avgSpeed} unit={avgSpeed !== '--' ? 'km/h' : undefined} />
        <SummaryStat theme={theme} label={t('trail.stat.maxAltitude')} value={maxAltitude != null ? String(Math.round(maxAltitude)) : '--'} unit={maxAltitude != null ? 'm' : undefined} />
        <SummaryStat theme={theme} label={t('trail.stat.paused')} value={paused.value} unit={paused.unit} />
      </View>
      {profile ? (
        <View style={{ marginTop: space.md }}>
          <TrailProfile theme={theme} profile={profile} fraction={1} />
        </View>
      ) : null}
      {/* Said only when the route's end was reached; a share of it would read
          as a mark against a walker who took another way down on purpose. */}
      {arrived && session.route ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start', marginTop: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: theme.accentSoft }}>
          <Icon name="check" color={theme.accent} size={14} />
          <Text style={[type.labelStrong, { color: theme.accent }]}>{t('trail.summary.arrived')}</Text>
        </View>
      ) : null}

      {tooShort ? <Text style={[type.hint, { color: theme.text2, marginTop: space.md }]}>{t('trail.summary.tooShort')}</Text> : null}
      {/* Laid out like the paused footer's 结束/继续: the way back on the left,
          the way on filling the rest. */}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        {tooShort ? (
          <>
            <TrailControlButton theme={theme} label={t('common.close')} muted onPress={() => void clearTrail().then(trail.closeTrail)} />
            <TrailControlButton theme={theme} icon="play" label={t('trail.summary.resume')} primary grow={2} onPress={() => void reopenTrail()} />
          </>
        ) : (
          <>
            <TrailControlButton theme={theme} icon="play" label={t('trail.summary.resume')} disabled={saving} onPress={() => void reopenTrail()} />
            <TrailControlButton theme={theme} icon="check" label={saving ? t('trail.summary.saving') : t('trail.summary.save')} primary grow={2} disabled={saving} busy={saving} onPress={() => void save()} />
          </>
        )}
      </View>

      <RenameTrackDialog
        theme={theme}
        visible={renameOpen}
        title={t('tracks.rename.title')}
        placeholder={t('tracks.rename.placeholder')}
        initialValue={name}
        confirmLabel={t('tracks.rename.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setRenameOpen(false)}
        onConfirm={(next) => {
          setRenameOpen(false);
          if (next.trim()) setName(next.trim());
        }}
      />
    </View>
  );
}

function formatDate(t: T, at: number): string {
  const date = new Date(at);
  return t('trail.summary.dateFormat', { m: date.getMonth() + 1, d: date.getDate() });
}

function formatTime(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function defaultName(t: T, startedAt: number): string {
  return t('trail.summary.defaultName', { date: formatDate(t, startedAt) });
}

function SummaryStat({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ width: '33.333%', minWidth: 0, paddingRight: space.xs }} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { fontFamily: MONO, color: theme.text, flexShrink: 1 }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}
