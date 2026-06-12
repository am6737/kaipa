// FullOverlay.tsx — full-screen overlay scaffold (slide-up + grabber header +
// close). Used by elevation / photo-wall / journey-card overlays.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, ScrollView, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

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
          {/* back button — same style as the settings push-page nav bar:
              a solid circle with a drop shadow + long back arrow, top-left */}
          <Press
            onPress={onClose}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
              shadowColor: '#000',
              shadowOpacity: theme.dark ? 0.5 : 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
              borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Icon name="arrowL" color={theme.text} size={21} />
          </Press>
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
