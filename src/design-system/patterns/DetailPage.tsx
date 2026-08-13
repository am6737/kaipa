import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
  left,
  right,
  overlay,
  hero,
  flatChrome,
  onContentTouchStart,
  onEnterComplete,
  entryVariant = 'push',
  scrollable = true,
  children,
}: {
  theme: Theme;
  onBack: () => void;
  backgroundColor?: string;
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  overlay?: React.ReactNode;
  hero?: React.ReactNode;
  flatChrome?: boolean;
  onContentTouchStart?: () => void;
  onEnterComplete?: () => void;
  entryVariant?: 'push' | 'continuationX' | 'continuationY';
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(entryVariant === 'push' ? width : entryVariant === 'continuationX' ? 52 : 0)).current;
  const translateY = useRef(new Animated.Value(entryVariant === 'continuationY' ? 44 : 0)).current;
  const opacity = useRef(new Animated.Value(entryVariant === 'push' ? 1 : 0.92)).current;
  const onEnterCompleteRef = useRef(onEnterComplete);

  useEffect(() => {
    onEnterCompleteRef.current = onEnterComplete;
  }, [onEnterComplete]);

  useEffect(() => {
    const animation = entryVariant === 'push'
      ? Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          ...motion.pageSpring,
        })
      : Animated.parallel([
          Animated.timing(translateX, {
            toValue: 0,
            duration: motion.standard,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: motion.standard,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: motion.quick,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);
    animation.start(({ finished }) => {
      if (finished) onEnterCompleteRef.current?.();
    });
    return () => animation.stop();
  }, [entryVariant, opacity, translateX, translateY]);


  const navHeight = insets.top + layout.topBarHeight;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: backgroundColor || theme.featureSurface,
          opacity,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        {hero}
        {scrollable ? (
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onTouchStart={onContentTouchStart}
            onScrollBeginDrag={Keyboard.dismiss}
            bottomOffset={insets.bottom + 24}
            extraKeyboardSpace={insets.bottom}
            contentContainerStyle={{
              paddingTop: hero ? 6 : navHeight + 4,
              paddingBottom: insets.bottom + 120,
            }}
          >
            {children}
          </KeyboardAwareScrollView>
        ) : (
          <View style={{ flex: 1, paddingTop: hero ? 0 : navHeight }}>
            {children}
          </View>
        )}
      </View>

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: navHeight }} pointerEvents="box-none">
        <View style={{ position: 'absolute', left: 14, top: insets.top + 5 }}>
          {left || <AppIconButton theme={theme} name="chevronL" onPress={onBack} noShadow={flatChrome} softShadow={!flatChrome} />}
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
