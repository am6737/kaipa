// Toast.tsx — transient confirmation pill (auto-dismissed by NavContext).
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon } from './Icon';

export function Toast({ message, dark }: { message: string; dark: boolean }) {
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(op, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 18 }).start();
  }, [op, message]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center', zIndex: 500 }}>
      <Animated.View
        style={{
          opacity: op,
          transform: [{ translateY: op.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          borderRadius: 22,
          overflow: 'hidden',
        }}
      >
        <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 18,
            paddingVertical: 11,
            backgroundColor: dark ? 'rgba(20,20,22,0.72)' : 'rgba(255,255,255,0.72)',
          }}
        >
          <Icon name="check" color={dark ? '#fff' : '#000'} size={16} />
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: dark ? '#fff' : '#000' }}>{message}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
