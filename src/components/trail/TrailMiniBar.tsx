// TrailMiniBar.tsx — the pill at the top of every screen while a recording
// exists and its page is minimised. One tap goes back to the map.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { useTrail, useTrailSnapshot } from '../../trail/TrailContext';
import { formatClock, splitDistance } from '../../lib/trailGeo';
import { trailMovingMs } from '../../lib/trailRecorder';
import { Press } from '../Press';

export function TrailMiniBar({ theme }: { theme: Theme }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const trail = useTrail();
  const { session } = useTrailSnapshot();
  const [, setTick] = useState(0);
  const recording = session?.status === 'recording';

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  if (!session || trail.open) return null;
  const distance = splitDistance(session.totals.distM);
  const dot = recording ? theme.trailMine : theme.text3;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space.xs, left: 0, right: 0, alignItems: 'center', zIndex: 310 }}>
      <Press
        onPress={() => trail.openTrail()}
        accessibilityRole="button"
        accessibilityLabel={t('trail.mini.open')}
        hitSlop={8}
        style={{ height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: theme.controlSurface, boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)' }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        <Text style={[type.labelStrong, { color: theme.text }]}>{t(`trail.status.${session.status}`)}</Text>
        <Text style={[type.small, { fontFamily: MONO, color: theme.text2 }]}>{formatClock(trailMovingMs(session))}</Text>
        <Text style={[type.small, { fontFamily: MONO, color: theme.text2 }]}>{`${distance.value} ${distance.unit}`}</Text>
      </Press>
    </View>
  );
}
