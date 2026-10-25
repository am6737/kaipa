// TrailSummary.tsx — the panel once a recording is finished: what was walked,
// a name, and the three ways out (save, keep going, throw away). Finishing
// never deletes; only 放弃 does, and it asks first.
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppActionDialog, radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { useNav } from '../../nav/NavContext';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useTrail } from '../../trail/TrailContext';
import { formatClock, splitDistance } from '../../lib/trailGeo';
import { clearTrail, reopenTrail, type TrailSession } from '../../lib/trailRecorder';
import { Icon } from '../Icon';
import { Press } from '../Press';

export function TrailSummary({ theme, session }: { theme: Theme; session: TrailSession }) {
  const { t } = useI18n();
  const nav = useNav();
  const trail = useTrail();
  const [name, setName] = useState(() => session.route?.name ?? defaultName(t, session.startedAt));
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pointCount = session.segments.reduce((sum, segment) => sum + segment.length, 0);
  const tooShort = pointCount < 2;
  const distance = splitDistance(session.totals.distM);

  const save = async () => {
    if (saving || tooShort) return;
    setSaving(true);
    try {
      const result = await trail.saveTrail(name.trim() || defaultName(t, session.startedAt));
      nav.showToast(result.status === 'saved' ? t('trail.summary.saved') : t('trail.summary.queued'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={[type.readoutLabel, { color: theme.text2 }]}>{t('trail.summary.title')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xxs }}>
        <Text style={[type.display, { fontSize: 56, lineHeight: 64, letterSpacing: -2, color: theme.text }]}>{distance.value}</Text>
        <Text style={[type.displayUnit, { color: theme.text2 }]}>{distance.unit}</Text>
      </View>
      <View style={{ flexDirection: 'row', marginTop: space.sm }}>
        <SummaryStat theme={theme} label={t('trail.stat.time')} value={formatClock(session.activeMs)} />
        <SummaryStat theme={theme} label={t('trail.stat.ascent')} value={`+${Math.round(session.totals.ascM)}`} unit="m" />
        <SummaryStat theme={theme} label={t('trail.stat.descent')} value={`-${Math.round(session.totals.descM)}`} unit="m" />
        <SummaryStat theme={theme} label={t('trail.stat.points')} value={pointCount.toLocaleString('en-US')} />
      </View>

      {tooShort ? (
        <Text style={[type.hint, { color: theme.text2, marginTop: space.md }]}>{t('trail.summary.tooShort')}</Text>
      ) : (
        <View style={{ marginTop: space.md }}>
          <Text style={[type.caption, { color: theme.text2, marginBottom: space.xxs }]}>{t('trail.summary.nameLabel')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="done"
            selectTextOnFocus
            placeholderTextColor={theme.text3}
            style={[type.textInput, { color: theme.text, height: 44, paddingHorizontal: space.md, borderRadius: radius.control, backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }]}
          />
        </View>
      )}

      {!tooShort ? (
        <Press
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: saving }}
          style={{ marginTop: space.md, height: 56, borderRadius: radius.pill, backgroundColor: theme.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, opacity: saving ? 0.6 : 1 }}
        >
          <Icon name="check" color="#FFFFFF" size={20} />
          <Text style={[type.quickReply, { color: '#FFFFFF' }]}>{saving ? t('trail.summary.saving') : t('trail.summary.save')}</Text>
        </Press>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
        <Press
          onPress={() => void reopenTrail()}
          disabled={saving}
          accessibilityRole="button"
          style={{ flex: 1, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
        >
          <Text style={[type.chip, { color: theme.text }]}>{t('trail.summary.resume')}</Text>
        </Press>
        <Press
          onPress={() => setDiscardOpen(true)}
          disabled={saving}
          accessibilityRole="button"
          style={{ flex: 1, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={[type.chip, { color: theme.danger }]}>{t('trail.summary.discard')}</Text>
        </Press>
      </View>

      <AppActionDialog
        theme={theme}
        visible={discardOpen}
        destructive
        title={t('trail.summary.discardTitle')}
        message={t('trail.summary.discardMessage')}
        confirmLabel={t('trail.summary.discard')}
        cancelLabel={t('common.cancel')}
        confirmIcon="trash"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          void clearTrail().then(trail.closeTrail);
        }}
      />
    </View>
  );
}

function defaultName(t: ReturnType<typeof useI18n>['t'], startedAt: number): string {
  const date = new Date(startedAt);
  return t('trail.summary.defaultName', { date: t('trail.summary.dateFormat', { m: date.getMonth() + 1, d: date.getDate() }) });
}

function SummaryStat({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { fontFamily: MONO, color: theme.text }]}>{value}</Text>
        {unit ? <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}
