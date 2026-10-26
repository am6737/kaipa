import React from 'react';
import { StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../../components/Press';
import { layout, space, type } from '../tokens';

// Trailing filter control of a list header. The label names the current state
// (全部, or 筛选 N); `active` turns it accent once anything narrows the list.
// It carries no fill, so it sits on whatever surface the header uses.
export function AppFilterButton({
  theme,
  label,
  active,
  expanded,
  onPress,
  accessibilityLabel,
  style,
}: {
  theme: Theme;
  label: string;
  active?: boolean;
  expanded?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const color = active ? theme.accent : theme.text;
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded }} onPress={onPress} style={[styles.button, style]}>
      <SlidersHorizontal color={color} size={18} strokeWidth={2.2} />
      <Text style={[type.chip, { color }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.iconButton, paddingLeft: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});
