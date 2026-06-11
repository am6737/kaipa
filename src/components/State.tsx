// State.tsx — empty / loading primitives (condensed from state-kit.jsx):
// KPState (empty or error), KPSpinner, KPSkeleton.
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ViewStyle, StyleProp, Easing } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { Press } from './Press';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export function KPSpinner({ theme, size = 22, color, label }: { theme: Theme; size?: number; color?: string; label?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const c = color || theme.accent;
  const track = theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const stroke = Math.max(2, Math.round(size / 9));
  const ring = (
    <AnimatedSvg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate }] }}>
      <Circle cx={12} cy={12} r={9} fill="none" stroke={track} strokeWidth={stroke} />
      <Path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round" />
    </AnimatedSvg>
  );
  if (!label) return ring;
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      {ring}
      <Text style={{ fontSize: 13.5, color: theme.text2 }}>{label}</Text>
    </View>
  );
}

interface KPStateProps {
  theme: Theme;
  icon?: IconName;
  title?: string;
  body?: string;
  tone?: 'neutral' | 'danger';
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function KPState({ theme, icon, title, body, tone = 'neutral', action, style }: KPStateProps) {
  const danger = tone === 'danger';
  const iconColor = danger ? theme.danger : theme.text3;
  const iconBg = danger ? theme.dangerSoft : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={[{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 28, gap: 10 }, style]}>
      {icon && (
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 22,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
          }}
        >
          <Icon name={icon} color={iconColor} size={30} strokeWidth={1.7} />
        </View>
      )}
      {title ? <Text style={{ fontSize: 15.5, fontWeight: '600', color: theme.text }}>{title}</Text> : null}
      {body ? (
        <Text style={{ fontSize: 13, color: theme.text2, lineHeight: 20, textAlign: 'center', maxWidth: 250 }}>{body}</Text>
      ) : null}
      {action && (
        <Press
          onPress={action.onPress}
          style={{
            marginTop: 6,
            backgroundColor: danger ? (theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)') : theme.accent,
            paddingHorizontal: 20,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: danger ? theme.text : '#fff', fontWeight: '600', fontSize: 14 }}>{action.label}</Text>
        </Press>
      )}
    </View>
  );
}

export function KPSkeletonLine({ theme, width, height = 12, radius = 6, style }: { theme: Theme; width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] });
  return (
    <Animated.View
      style={[
        {
          width: (width as any) ?? '100%',
          height,
          borderRadius: radius,
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          opacity,
        },
        style,
      ]}
    />
  );
}
