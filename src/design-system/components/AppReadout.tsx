import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../../theme/theme';
import { space, type } from '../tokens';

// The live value on a measurement page. `stacked` sits beside a vertical
// picker; `inline` centres over a horizontal ruler with the unit on the
// baseline and a slightly smaller number so both fit one line.
export function AppReadout({
  theme,
  label,
  value,
  unit,
  variant = 'stacked',
}: {
  theme: Theme;
  label: string;
  value: string | number;
  unit: string;
  variant?: 'stacked' | 'inline';
}) {
  const labelText = <Text style={[type.readoutLabel, { color: theme.text2 }]}>{label}</Text>;
  const unitText = <Text style={[type.displayUnit, { color: theme.text2 }, variant === 'stacked' && styles.stackedGap]}>{unit}</Text>;
  if (variant === 'inline') {
    return (
      <View style={styles.inlineWrap}>
        {labelText}
        <View style={styles.inlineRow}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[type.display, styles.inlineNumber, { color: theme.text }]}>{value}</Text>
          {unitText}
        </View>
      </View>
    );
  }
  return (
    <View>
      {labelText}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[type.display, styles.stackedGap, { color: theme.text }]}>{value}</Text>
      {unitText}
    </View>
  );
}

const styles = StyleSheet.create({
  stackedGap: { marginTop: space.xs },
  inlineWrap: { alignSelf: 'stretch', alignItems: 'center' },
  inlineRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.xs, paddingHorizontal: space.lg, marginTop: space.sm },
  inlineNumber: { fontSize: 76, flexShrink: 1 },
});
