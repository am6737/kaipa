// Press.tsx — Pressable with the prototype's "kp-press" feedback (scale 0.97 +
// fade on press). Use anywhere a tap target needs that tactile response.
import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';

// The style (flex/layout/background) must land on the Pressable itself so it
// participates in its parent's layout — otherwise a `flex: 1` caller can't
// stretch. Animate the Pressable directly so the whole box scales on press.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  opacityTo?: number;
  haptic?: boolean;
}

export function Press({ children, style, scaleTo = 0.97, opacityTo = 0.82, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animate = (toScale: number, toOpacity: number) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.timing(opacity, { toValue: toOpacity, duration: 90, useNativeDriver: true }),
    ]).start();
  };

  return (
    <AnimatedPressable
      onPressIn={() => animate(scaleTo, opacityTo)}
      onPressOut={() => animate(1, 1)}
      style={[style, { transform: [{ scale }], opacity }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
