import React, { useEffect, useRef } from 'react';
import { TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Theme } from '../../theme/theme';
import { Icon } from '../../components/Icon';
import { Press } from '../../components/Press';
import { layout, motion } from '../tokens';

export function AppHeaderSearch({
  theme,
  open,
  value,
  placeholder,
  onChangeText,
  onClose,
  actions,
}: {
  theme: Theme;
  open: boolean;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  actions: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  // The pill's width tween runs on the UI thread so it stays smooth while the
  // page behind it re-renders for the search.
  const progress = useSharedValue(open ? 1 : 0);
  const inputRef = useRef<TextInput>(null);
  const expandedWidth = Math.max(180, width - 84);

  useEffect(() => {
    if (!open) inputRef.current?.blur();
    const focusInput = () => inputRef.current?.focus();
    progress.value = withTiming(open ? 1 : 0, {
      duration: open ? motion.emphasized : motion.standard,
      easing: open ? Easing.bezier(0.2, 0.8, 0.2, 1) : Easing.bezier(0.4, 0, 0.6, 1),
    }, (finished) => {
      if (finished && open) runOnJS(focusInput)();
    });
  }, [open, progress]);

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45, 1], [1, 0, 0]),
  }));
  const fieldStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [layout.iconButton, expandedWidth]),
    opacity: interpolate(progress.value, [0, 0.08, 1], [0, 1, 1]),
  }));

  return (
    <View pointerEvents="box-none" style={{ width: expandedWidth, height: layout.fieldHeight }}>
      <Animated.View
        pointerEvents={open ? 'none' : 'box-none'}
        style={[{
          position: 'absolute',
          right: 0,
          height: layout.fieldHeight,
        }, actionsStyle]}
      >
        {actions}
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[{
          position: 'absolute',
          right: 0,
          height: layout.fieldHeight,
          borderRadius: layout.fieldHeight / 2,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          overflow: 'hidden',
          backgroundColor: theme.featureSurface,
        }, fieldStyle]}
      >
        <Icon name="search" color={theme.text2} size={17} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onBlur={onClose}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          returnKeyType="search"
          editable={open}
          style={{ flex: 1, minWidth: 0, padding: 0, fontSize: 15, color: theme.text }}
        />
        <Press onPress={onClose} hitSlop={10}>
          <Icon name="close" color={theme.text2} size={15} />
        </Press>
      </Animated.View>
    </View>
  );
}
