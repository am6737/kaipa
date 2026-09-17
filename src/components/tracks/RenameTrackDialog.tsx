// RenameTrackDialog.tsx — names a library track. Renaming touches only the row's
// display name: the file, the geometry and every journey pointing at it stay put.
// The card mirrors AppActionDialog so the dialogs in this feature read as one family.
import React from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Press } from '../Press';
import { Theme } from '../../theme/theme';
import { motion, radius, space, type } from '../../design-system';

export function RenameTrackDialog({
  theme,
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  theme: Theme;
  visible: boolean;
  title: string;
  placeholder: string;
  initialValue: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const [value, setValue] = React.useState(initialValue);
  const progress = React.useRef(new Animated.Value(0)).current;

  // Every opening starts from the stored name, so a cancelled edit never leaks in.
  React.useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  React.useLayoutEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: motion.quick,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 90,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [mounted, progress, visible]);

  if (!mounted) return null;

  const trimmed = value.trim();
  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const cardTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onCancel}>
      <View style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.fill, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={onCancel}
            style={[styles.fill, { backgroundColor: theme.dark ? 'rgba(0,0,0,0.72)' : 'rgba(20,20,24,0.38)' }]}
          />
        </Animated.View>

        <Animated.View
          accessibilityRole="alert"
          style={{
            width: Math.min(356, width - space.xl * 2),
            borderRadius: radius.feature + 4,
            padding: space.xl,
            backgroundColor: theme.surfaceTop,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            opacity: progress,
            transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
            shadowColor: '#000000',
            shadowOpacity: theme.dark ? 0.42 : 0.18,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 16 },
            elevation: 18,
          }}
        >
          <Text style={[type.pageTitle, { color: theme.text, lineHeight: 31 }]}>{title}</Text>

          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={theme.text3}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (trimmed) onConfirm(trimmed); }}
            style={{
              marginTop: space.lg,
              height: 50,
              borderRadius: radius.card,
              paddingHorizontal: space.md,
              fontSize: 16,
              fontWeight: '600',
              color: theme.text,
              backgroundColor: theme.fieldSurface,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.fieldBorder,
            }}
          />

          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: !trimmed }}
              onPress={trimmed ? () => onConfirm(trimmed) : undefined}
              opacityTo={1}
              style={{
                height: 52,
                borderRadius: radius.card,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: trimmed ? theme.accent : theme.fieldSurface,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '800', color: trimmed ? '#FFFFFF' : theme.text3 }}>{confirmLabel}</Text>
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              opacityTo={1}
              style={{
                height: 50,
                borderRadius: radius.card,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
              }}
            >
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{cancelLabel}</Text>
            </Press>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
