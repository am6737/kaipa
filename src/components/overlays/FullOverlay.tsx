// FullOverlay.tsx — full-screen overlay scaffold (slide-up + grabber header +
// close). Used by elevation / photo-wall / journey-card overlays.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, ScrollView } from 'react-native';
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
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  const Body: any = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? { showsVerticalScrollIndicator: false, contentContainerStyle: { paddingBottom: insets.bottom + 30 } }
    : { style: { flex: 1 } };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY }], zIndex }]}
    >
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: 12, color: theme.text2, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {rightAction}
          <Press
            onPress={onClose}
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? '#2C2C2E' : '#fff', marginLeft: 10 }}
          >
            <Icon name="close" color={theme.text} size={18} />
          </Press>
        </View>
      </View>
      <Body {...bodyProps}>{children}</Body>
    </Animated.View>
  );
}
