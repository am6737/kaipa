import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { space, type } from '../tokens';

export function AppPropertyRow({
  theme,
  label,
  value,
  leadingColor,
  first,
}: {
  theme: Theme;
  label: string;
  value: React.ReactNode;
  leadingColor?: string;
  first?: boolean;
}) {
  return (
    <>
      {!first && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: space.md }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.md, paddingVertical: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {leadingColor ? <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: leadingColor }} /> : null}
          <Text style={[type.body, { color: theme.text2 }]}>{label}</Text>
        </View>
        {typeof value === 'string' ? (
          <Text style={[type.body, { fontWeight: '600', color: theme.text, textAlign: 'right', flexShrink: 1 }]}>{value}</Text>
        ) : value}
      </View>
    </>
  );
}
