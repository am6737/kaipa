// Press.tsx — Pressable with the prototype's "kp-press" feedback (scale 0.97 +
// fade on press). Use anywhere a tap target needs that tactile response.
import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';

interface Props extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
}

export function Press({ children, style, scaleTo = 0.97, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animate = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(opacity, { toValue: toOpacity, duration: 90, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      onPressIn={() => animate(scaleTo, 0.82)}
      onPressOut={() => animate(1, 1)}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
