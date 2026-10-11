import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Theme } from '../../theme/theme';
import { Press } from '../../components/Press';
import { layout, radius, space, type } from '../tokens';

// One labelled value per card: label on the left, large tabular value + unit on
// the right, a hint underneath. With `onOpen` the card is a button into a
// dedicated picker page; without it the value is an inline numeric input.
// Focus paints the border with the accent, an error paints it red.
export function AppFieldCard({
  theme,
  label,
  value,
  unit,
  description,
  error,
  decimal,
  onChange,
  onOpen,
}: {
  theme: Theme;
  label: string;
  value: string;
  unit: string;
  description?: string;
  error?: string;
  decimal?: boolean;
  onChange?: (value: string) => void;
  onOpen?: () => void;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Press accessible={!!onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={onOpen ? `${label} ${value || '--'} ${unit}` : undefined} onPress={onOpen ?? (() => input.current?.focus())} style={[styles.card, {
      backgroundColor: theme.surfaceTop,
      borderColor: error ? theme.danger : focused ? theme.accent : 'transparent',
    }]}>
      <View style={styles.fieldRow}>
        <Text style={[type.fieldLabel, { color: theme.text, flex: 1 }]}>{label}</Text>
        <View style={styles.valueRow}>
          {onOpen ? <Text style={[type.fieldValue, styles.displayValue, { color: value ? theme.text : theme.text3 }]}>{value || '--'}</Text> : <TextInput
            ref={input}
            value={value}
            onChangeText={(text) => onChange?.(decimal ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
            maxLength={decimal ? 6 : 3}
            placeholder="--"
            placeholderTextColor={theme.text3}
            accessibilityLabel={`${label} (${unit})`}
            selectionColor={theme.accent}
            style={[type.fieldValue, styles.valueInput, { color: theme.text }]}
          />}
          <Text style={[type.fieldLabel, { color: theme.text }]}>{unit}</Text>
          <ChevronRight size={18} color={theme.text3} />
        </View>
      </View>
      {description ? <Text style={[type.hint, { color: theme.text2 }]}>{description}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[type.hint, { color: theme.danger }]}>{error}</Text> : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.showcase, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: 1 },
  fieldRow: { minHeight: layout.fieldHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, transform: [{ translateY: 6 }] },
  valueInput: { width: 78, minHeight: layout.fieldHeight, paddingVertical: 0, textAlign: 'right' },
  displayValue: { minHeight: layout.fieldHeight, lineHeight: layout.fieldHeight },
});
