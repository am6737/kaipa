// FullOverlay.tsx — full-screen overlay scaffold (slide-up + grabber header +
// close). Used by elevation / photo-wall / journey-card overlays.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, ScrollView, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { CircleBtn } from '../CircleBtn';

interface Props {
  theme: Theme;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
  rightAction?: React.ReactNode;
  zIndex?: number;
}

export function FullOverlay({ theme, title, subtitle, onClose, children, scroll = true, rightAction, zIndex = 130 }: Props) {
  const insets = useSafeAreaInsets();
  // entrance + drag-to-dismiss share one translateY (px). Pull the grabber/header
  // down past a threshold (or flick) to close — matches the prototype.
  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
        }
      },
    })
  ).current;

  const Body: any = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? { showsVerticalScrollIndicator: false, contentContainerStyle: { paddingBottom: insets.bottom + 30 } }
    : { style: { flex: 1 } };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY }], zIndex }]}
    >
      <View {...pan.panHandlers} style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        <View style={{ height: 40, justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <CircleBtn theme={theme} name="arrowL" onPress={onClose} />
          </View>
          {/* centered title + subtitle */}
          <View pointerEvents="none" style={{ alignItems: 'center', paddingHorizontal: 52 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: 12, color: theme.text2, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {/* optional right action */}
          {rightAction ? (
            <View style={{ position: 'absolute', right: 0, top: 0, height: 40, justifyContent: 'center' }}>{rightAction}</View>
          ) : null}
        </View>
      </View>
      <Body {...bodyProps}>{children}</Body>
    </Animated.View>
  );
}
