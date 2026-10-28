import React from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Press } from '../../components/Press';
import { space } from '../tokens';

export type AppFilterAnchor = { x: number; y: number; width: number; height: number };

// Card that drops over an AppFilterButton, right-aligned to it and covering the
// trigger like a native menu. `anchor` is the button's measureInWindow rect.
// Content is AppFilterSegmented rows (narrow the list) and AppFilterOption rows
// (sort, toggles). Choices apply at once; there is no confirm step.
export function AppFilterPopover({
  theme,
  visible,
  anchor,
  width,
  onClose,
  closeLabel,
  children,
}: {
  theme: Theme;
  visible: boolean;
  anchor: AppFilterAnchor | undefined;
  width: number;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = React.useState(0);
  React.useEffect(() => { if (!visible) setCardHeight(0); }, [visible]);
  if (!visible || !anchor) return null;
  const cardWidth = Math.min(width, window.width - 2 * space.sm);
  const right = Math.max(space.sm, window.width - (anchor.x + anchor.width));
  // Prefer covering the trigger; lift the card when it would run off the bottom.
  const lowest = window.height - Math.max(insets.bottom, space.md) - cardHeight;
  const top = Math.max(insets.top + space.xxs, Math.min(anchor.y - space.sm, lowest));
  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Press accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={StyleSheet.absoluteFill}>{null}</Press>
        <View
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          style={[styles.card, { top, right, width: cardWidth, opacity: cardHeight ? 1 : 0, backgroundColor: theme.featureSurface }]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function AppFilterSegmented<T extends string>({
  theme,
  options,
  value,
  onChange,
  caption,
}: {
  theme: Theme;
  options: readonly (readonly [T, string])[];
  /** null highlights no segment, e.g. when a batch mixes values. */
  value: T | null;
  onChange: (value: T) => void;
  caption?: string;
}) {
  return (
    <View>
      {caption ? <Text style={[styles.caption, { color: theme.text3 }]}>{caption}</Text> : null}
      <View style={[styles.segmented, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : '#F0F0F0' }]}>
        {options.map(([id, label]) => {
          const selected = id === value;
          return (
            <Press
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(id)}
              style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: theme.dark ? '#3A3A3C' : '#FFFFFF' }]]}
            >
              <Text numberOfLines={1} style={[styles.segmentText, { color: selected ? theme.text : theme.text2 }]}>{label}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export function AppFilterOption({
  theme,
  label,
  selected,
  onPress,
  role = 'radio',
}: {
  theme: Theme;
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox';
}) {
  return (
    <Press accessibilityRole={role} accessibilityState={role === 'radio' ? { selected } : { checked: selected }} onPress={onPress} style={styles.option}>
      <Text style={[styles.optionText, { color: theme.text }]}>{label}</Text>
      <View style={[styles.radio, { borderColor: selected ? theme.text : theme.dark ? 'rgba(255,255,255,0.28)' : '#D9D9D9', backgroundColor: selected ? theme.text : 'transparent' }]}>
        {selected ? <Check size={11} color={theme.featureSurface} strokeWidth={3} /> : null}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.12)' },
  card: { position: 'absolute', borderRadius: 23, paddingHorizontal: 11, paddingTop: 12, paddingBottom: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  caption: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, marginBottom: 6 },
  segmented: { flexDirection: 'row', borderRadius: 17, padding: 2, marginBottom: 9, minHeight: 34 },
  segment: { flex: 1, minHeight: 30, borderRadius: 15, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  option: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  optionText: { fontSize: 14, fontWeight: '600' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
