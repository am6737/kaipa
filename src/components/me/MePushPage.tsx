// Shared pushed-page shell for the settings hierarchy.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { AppIconButton, layout, motion, space, type } from '../../design-system';

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
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
  }, [tx]);

  const navH = insets.top + layout.topBarHeight;
  const Body: any = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? {
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled' as const,
        contentContainerStyle: { paddingTop: navH + space.md, paddingBottom: insets.bottom + space.xxxl },
      }
    : { style: { flex: 1, paddingTop: navH + space.md } };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg, transform: [{ translateX: tx }] }]}
    >
      <Body {...bodyProps}>{children}</Body>

      {/* floating, transparent nav bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navH }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: space.md, top: insets.top + 3 }}>
          <AppIconButton theme={theme} name="chevronL" onPress={onBack} noShadow />
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 72, right: 72, top: insets.top + 10, height: 30, justifyContent: 'center' }}
        >
          <Text style={[type.navTitle, { color: theme.text, textAlign: 'center' }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ? (
          <View style={{ position: 'absolute', right: space.md, top: insets.top + 7, height: 36, justifyContent: 'center' }}>
            {right}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
