import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { Press } from '../../components/Press';
import { Theme } from '../../theme/theme';
import { motion, radius, space, type } from '../tokens';

type Props = {
  theme: Theme;
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  confirming?: boolean;
  confirmIcon?: IconName;
};

export function AppActionDialog({
  theme,
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  confirming = false,
  confirmIcon,
}: Props) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const progress = React.useRef(new Animated.Value(0)).current;

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

  const cardScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const cardTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const confirmColor = destructive ? theme.danger : theme.accent;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={confirming ? undefined : onCancel}>
      <View style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.fill, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={confirming ? undefined : onCancel}
            style={[
              styles.fill,
              { backgroundColor: theme.dark ? 'rgba(0,0,0,0.72)' : 'rgba(20,20,24,0.38)' },
            ]}
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
          <Text style={[type.body, { marginTop: space.sm, color: theme.text2, lineHeight: 22 }]}>{message}</Text>

          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy: confirming, disabled: confirming }}
              onPress={confirming ? undefined : onConfirm}
              opacityTo={1}
              style={{
                height: 52,
                borderRadius: radius.card,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
                backgroundColor: confirmColor,
              }}
            >
              {confirming ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  {confirmIcon ? <Icon name={confirmIcon} color="#FFFFFF" size={18} strokeWidth={2.1} /> : null}
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{confirmLabel}</Text>
                </>
              )}
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              accessibilityState={{ disabled: confirming }}
              onPress={confirming ? undefined : onCancel}
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
