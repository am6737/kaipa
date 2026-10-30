// ElevationStats.tsx — the three heights that sit under an elevation chart:
// where the line tops out, where it bottoms out, and how steep it ever gets.
// The same 3-column grid reads under the curve on the route sheet and on a
// track page; the columns are separated by whitespace only.
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { climbValueMeters, elevationSummary, type ElevationPoint } from '../../lib/routePreview';
import type { Theme } from '../../theme/theme';

export function ElevationStats({ theme, elevation }: { theme: Theme; elevation: ElevationPoint[] | undefined }) {
  const { t } = useI18n();
  const summary = useMemo(() => elevationSummary(elevation), [elevation]);
  if (!summary) return null;
  const stats = [
    { key: 'highest', label: t('route.preview.statHighest'), value: climbValueMeters(summary.maxEle) ?? '--', unit: ' m' },
    { key: 'lowest', label: t('route.preview.statLowest'), value: climbValueMeters(summary.minEle) ?? '--', unit: ' m' },
    // A descent reads as steep too, which is why the figure carries no sign.
    { key: 'steepest', label: t('route.preview.statSteepest'), value: String(Math.round(summary.maxGrade)), unit: '%' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {stats.map((stat) => (
        <View key={stat.key} style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.statValue, { color: theme.text }]}>
            {stat.value}
            <Text style={[type.liveUnit, { color: theme.text2 }]}>{stat.unit}</Text>
          </Text>
          <Text numberOfLines={1} style={[type.statLabel, { color: theme.text2, marginTop: 2 }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}
