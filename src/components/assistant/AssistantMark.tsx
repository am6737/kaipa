import React from 'react';
import { View } from 'react-native';

export function AssistantMark({ color, accentColor = color, size = 30 }: {
  color: string;
  accentColor?: string;
  size?: number;
}) {
  const scale = size / 30;
  const pill = (width: number, height: number, left: number, top: number, rotate: string, backgroundColor: string) => ({
    position: 'absolute' as const,
    width: width * scale,
    height: height * scale,
    left: left * scale,
    top: top * scale,
    borderRadius: size,
    backgroundColor,
    transform: [{ rotate }],
  });

  return (
    <View style={{ width: size, height: 22 * scale }}>
      <View style={pill(5, 11, 3, 8.5, '-12deg', color)} />
      <View style={pill(6, 20, 12, 1, '5deg', accentColor)} />
      <View style={pill(5, 13, 22, 6.5, '12deg', color)} />
    </View>
  );
}
