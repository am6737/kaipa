import React from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Theme } from '../../theme/theme';
import { radius, space, type } from '../../design-system';
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
  confirming?: boolean;
  /** When set, the confirm button stays locked until the user types this text. */
  confirmPhrase?: string;
};

export function AccountActionDialog({
  theme,
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirming = false,
  confirmPhrase,
}: Props) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(visible);
  const [phrase, setPhrase] = React.useState('');
  const progress = React.useRef(new Animated.Value(0)).current;

  // Every opening starts from an empty field so the gate can't be satisfied by stale input.
  React.useEffect(() => {
    if (visible) setPhrase('');
  }, [visible]);

  const requiresPhrase = !!confirmPhrase;
  // Case-insensitive so an English phrase typed in lowercase still counts as deliberate.
  const phraseMatched = !requiresPhrase || phrase.trim().toLocaleLowerCase() === (confirmPhrase ?? '').toLocaleLowerCase();
  const locked = confirming || !phraseMatched;
  // Greyed out only while the phrase is unmet — running the action keeps the solid red look.
  const dimmed = !phraseMatched;

  React.useLayoutEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 140,
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

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.fill, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={confirming ? undefined : onCancel}
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
          <Text style={[type.body, { marginTop: space.sm, color: theme.text2, lineHeight: 22 }]}>{message}</Text>

          {requiresPhrase ? (
            // The field's placeholder and the confirm button label both spell out the
            // phrase, so no separate instruction line is needed.
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              editable={!confirming}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              accessibilityLabel={confirmPhrase}
              placeholder={confirmPhrase}
              placeholderTextColor={theme.text3}
              style={{
                marginTop: space.lg,
                height: 50,
                borderRadius: radius.card,
                backgroundColor: theme.fieldSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.fieldBorder,
                paddingHorizontal: space.md,
                fontSize: 16,
                color: theme.text,
              }}
            />
          ) : null}

          <View style={{ marginTop: space.xl, gap: space.sm }}>
            <Press
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ busy: confirming }}
              disabled={locked}
              onPress={onConfirm}
              opacityTo={1}
              style={{ height: 52, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: dimmed ? theme.fieldSurface : theme.danger }}
            >
              {confirming
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={{ fontSize: 16, fontWeight: '800', color: dimmed ? theme.text3 : '#FFFFFF' }}>{confirmLabel}</Text>}
            </Press>
            <Press
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={confirming ? undefined : onCancel}
              opacityTo={1}
              style={{ height: 50, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.fieldSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.fieldBorder }}
            >
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{cancelLabel}</Text>
            </Press>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
