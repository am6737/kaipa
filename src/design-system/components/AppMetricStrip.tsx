import React from 'react';
import { Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { type } from '../tokens';

export type AppMetric = { label: string; value: string };

export function AppMetricStrip({ theme, stats }: { theme: Theme; stats: AppMetric[] }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
      {stats.map((stat) => (
        <View key={stat.label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 2 }}>
          <Text style={[type.metric, { letterSpacing: -0.4, color: theme.text }]}>{stat.value}</Text>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2, marginTop: 4 }}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}
