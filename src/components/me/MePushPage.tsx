// Shared pushed-page shell for the settings hierarchy.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { ChevronLeft } from 'lucide-react-native';
import { layout, motion, space, type } from '../../design-system';
import { Press } from '../Press';

interface Props {
  theme: Theme;
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  showBack?: boolean;
  showTitle?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
}

export function MePushPage({ theme, title, onBack, right, showBack = true, showTitle = true, footer, children, scroll = true }: Props) {
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
        automaticallyAdjustKeyboardInsets: true,
        keyboardDismissMode: 'interactive' as const,
        contentContainerStyle: { paddingTop: navH + space.md, paddingBottom: insets.bottom + space.xxxl + (footer ? 64 : 0) },
      }
    : { style: { flex: 1, paddingTop: navH + space.md } };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.groupedBg, transform: [{ translateX: tx }] }]}
    >
      <Body {...bodyProps}>{children}</Body>

      {/* floating, transparent nav bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navH }} pointerEvents="box-none">
        {showBack ? (
          <View style={{ position: 'absolute', left: space.md, top: insets.top + 3 }}>
            <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ width: layout.iconButton, height: layout.iconButton, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft color={theme.text} size={25} strokeWidth={2.2} />
            </Press>
          </View>
        ) : null}
        {showTitle ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 72, right: 72, top: insets.top + 10, height: 30, justifyContent: 'center' }}
          >
            <Text style={[type.navTitle, { color: theme.text, textAlign: 'center' }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {right ? (
          <View style={{ position: 'absolute', right: space.md, top: insets.top + 7, height: 36, justifyContent: 'center' }}>
            {right}
          </View>
        ) : null}
      </View>
      {footer ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.pagePadding, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, backgroundColor: theme.groupedBg }}>
          {footer}
        </View>
      ) : null}
    </Animated.View>
  );
}
