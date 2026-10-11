import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius } from '../tokens';

// Raised, thick-rimmed panel that hosts a ruler or wheel picker.
export function AppMeasurementPanel({ theme, style, ...props }: ViewProps & { theme: Theme }) {
  return (
    <View
      {...props}
      style={[styles.panel, { backgroundColor: theme.measureSurface, borderColor: theme.measureBorder, boxShadow: theme.measureShadow }, style]}
    />
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.showcase, borderWidth: 2 },
});
