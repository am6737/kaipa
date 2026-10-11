import React from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius, space } from '../tokens';

// Free-text field that sits inside a card, on the recessed field surface.
export function AppTextArea({ theme, style, ...props }: TextInputProps & { theme: Theme }) {
  return (
    <TextInput
      placeholderTextColor={theme.text2}
      selectionColor={theme.accent}
      multiline
      textAlignVertical="top"
      {...props}
      style={[styles.input, { backgroundColor: theme.fieldSurface, color: theme.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 92, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.card, fontSize: 14, lineHeight: 22 },
});
