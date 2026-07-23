import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { motion, radius, space, type } from '../../design-system';
import { Icon } from '../Icon';
import { Press } from '../Press';

type Props = {
  theme: Theme;
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GearDeleteDialog({
  theme,
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.setValue(0);
      requestAnimationFrame(() => {
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 3,
          speed: 18,
        }).start();
      });
      return;
    }

    if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.quick,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [mounted, progress, visible]);

  if (!mounted) return null;

  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const cardTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onCancel}>
      <View style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.fill, { opacity: backdropOpacity }]}>
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
          <View style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dangerSoft }}>
            <Icon name="trash" color={theme.danger} size={25} strokeWidth={1.9} />
          </View>

          <Text style={[type.pageTitle, { marginTop: space.lg, color: theme.text, lineHeight: 31 }]}>{title}</Text>
          <Text style={[type.body, { marginTop: space.sm, color: theme.text2, lineHeight: 22 }]}>{message}</Text>

          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={{ height: 52, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, backgroundColor: theme.danger }}
            >
              <Icon name="trash" color="#FFFFFF" size={18} strokeWidth={2.1} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{confirmLabel}</Text>
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              style={{ height: 50, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
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
