import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { AppIconButton } from '../components/AppIconButton';
import { layout, motion, type } from '../tokens';

const DetailPageScrollContext = React.createContext<{ scrollBy: (dy: number) => void } | null>(null);

export function useDetailPageScroll() {
  return React.useContext(DetailPageScrollContext);
}

// Shared full-screen detail shell used across product domains. It owns only
// visual chrome and scrolling; domain content remains with the feature.
export function DetailPage({
  theme,
  onBack,
  backgroundColor,
  title,
  right,
  overlay,
  hero,
  flatChrome,
  onContentTouchStart,
  onEnterComplete,
  children,
}: {
  theme: Theme;
  onBack: () => void;
  backgroundColor?: string;
  title?: string;
  right?: React.ReactNode;
  overlay?: React.ReactNode;
  hero?: React.ReactNode;
  flatChrome?: boolean;
  onContentTouchStart?: () => void;
  onEnterComplete?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(width)).current;
  const onEnterCompleteRef = useRef(onEnterComplete);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  useEffect(() => {
    onEnterCompleteRef.current = onEnterComplete;
  }, [onEnterComplete]);

  useEffect(() => {
    const animation = Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      ...motion.pageSpring,
    });
    animation.start(({ finished }) => {
      if (finished) onEnterCompleteRef.current?.();
    });
    return () => animation.stop();
  }, [translateX]);

  const navHeight = insets.top + layout.topBarHeight;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: backgroundColor || theme.featureSurface,
          transform: [{ translateX }],
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        {hero}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            onTouchStart={onContentTouchStart}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{
              paddingTop: hero ? 6 : navHeight + 4,
              paddingBottom: insets.bottom + 120,
            }}
          >
            <DetailPageScrollContext.Provider
              value={{
                scrollBy: (dy: number) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: true }),
              }}
            >
              {children}
            </DetailPageScrollContext.Provider>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navHeight }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
          <AppIconButton theme={theme} name="arrowL" onPress={onBack} noShadow={flatChrome} softShadow={!flatChrome} />
        </View>
        {title && !hero ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 64, right: 64, top: insets.top + 12, height: 26, justifyContent: 'center' }}>
            <Text style={[type.navTitle, { color: theme.text, textAlign: 'center' }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        {right ? <View style={{ position: 'absolute', right: 14, top: insets.top + 5 }}>{right}</View> : null}
      </View>
      {overlay}
    </Animated.View>
  );
}
