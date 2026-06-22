// MePushPage.tsx — full-screen page pushed from a 我 row (iOS Settings style).
// Slides in from the right with a transparent floating nav bar: a solid circular
// back button on the left, a centered title, and an optional right action.
// Mirrors the prototype's PushPage.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { CircleBtn } from '../CircleBtn';

interface Props {
  theme: Theme;
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
}

export function MePushPage({ theme, title, onBack, right, children, scroll = true }: Props) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const tx = useRef(new Animated.Value(width)).current;
  useEffect(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
  }, [tx]);

  const navH = insets.top + 50;
  const Body: any = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled' as const,
        contentContainerStyle: { paddingTop: navH + 4, paddingBottom: insets.bottom + 48 },
      }
    : { style: { flex: 1, paddingTop: navH + 4 } };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateX: tx }] }]}
    >
      <Body {...bodyProps}>{children}</Body>

      {/* floating, transparent nav bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navH }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
          <CircleBtn theme={theme} name="arrowL" onPress={onBack} />
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 64, right: 64, top: insets.top + 12, height: 26, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center' }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ? (
          <View style={{ position: 'absolute', right: 8, top: insets.top + 8, height: 36, justifyContent: 'center' }}>
            {right}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
