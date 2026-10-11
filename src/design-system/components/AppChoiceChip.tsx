import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../../components/Press';
import { layout, radius, space, type } from '../tokens';

// Multi-select option. Selected chips fill with the accent; lay them out in a
// wrapping row with `gap: space.xs` and they grow to fill each line.
export function AppChoiceChip({
  theme,
  label,
  selected,
  onPress,
}: {
  theme: Theme;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Press onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.fieldSurface, borderColor: selected ? theme.accent : 'transparent' }]}>
      <Text style={[type.chip, { color: selected ? '#FFFFFF' : theme.text2 }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, minHeight: layout.fieldHeight, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
});
