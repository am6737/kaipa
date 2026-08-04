import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
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
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const translateX = useRef(new Animated.Value(width)).current;
  const onEnterCompleteRef = useRef(onEnterComplete);

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
