// PickDialog.tsx — a single-choice list in a modal card.
//
// Both directions of the journey↔track link need the same thing (pick one journey,
// pick one track) and a journey list outgrows ActionSheet, which does not scroll.
// So the list is generic and each caller supplies the rows.
import React from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { Theme } from '../../theme/theme';
import { motion, radius, space, type } from '../../design-system';
import { MONO } from '../../theme/fonts';

export interface PickOption<T> {
  item: T;
  title: string;
  /** A plain string, or the parts of a subtitle shown as separate MONO groups. */
  subtitle?: string | string[];
  /** Marked rather than filtered out, so a re-pick reads as a move. */
  selected?: boolean;
}

export function PickDialog<T extends { id: string }>({
  theme,
  visible,
  title,
  emptyLabel,
  cancelLabel,
  options,
  onSelect,
  onCancel,
}: {
  theme: Theme;
  visible: boolean;
  title: string;
  emptyLabel: string;
  cancelLabel: string;
  options: PickOption<T>[];
  onSelect: (item: T) => void;
  onCancel: () => void;
}) {
  const { width, height } = useWindowDimensions();
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
          style={{
            width: Math.min(356, width - space.xl * 2),
            maxHeight: height * 0.7,
            borderRadius: radius.feature + 4,
            paddingTop: space.xl,
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
            overflow: 'hidden',
          }}
        >
          <Text style={[type.pageTitle, { color: theme.text, lineHeight: 31, paddingHorizontal: space.xl }]}>{title}</Text>

          {options.length ? (
            <ScrollView style={{ marginTop: space.md }} contentContainerStyle={{ paddingBottom: space.md }}>
              {options.map((option) => (
                <Press
                  key={option.item.id}
                  accessibilityRole="button"
                  accessibilityLabel={option.title}
                  accessibilityState={{ selected: !!option.selected }}
                  onPress={() => onSelect(option.item)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingVertical: space.sm + 2,
                    paddingHorizontal: space.xl,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{option.title}</Text>
                    {typeof option.subtitle === 'string' ? (
                      <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text3, marginTop: 2 }}>
                        {option.subtitle}
                      </Text>
                    ) : option.subtitle?.length ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, minWidth: 0 }}>
                        {option.subtitle.map((part, index) => (
                          <Text key={`${index}-${part}`} numberOfLines={1} style={{ flexShrink: 1, fontFamily: MONO, fontSize: 11.5, color: theme.text3 }}>
                            {part}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {option.selected ? <Icon name="check" color={theme.accent} size={18} strokeWidth={2.4} /> : null}
                </Press>
              ))}
            </ScrollView>
          ) : (
            <Text style={[type.body, { color: theme.text2, paddingHorizontal: space.xl, marginTop: space.sm }]}>{emptyLabel}</Text>
          )}

          <View style={{ padding: space.lg, paddingTop: space.sm }}>
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

