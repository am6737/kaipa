// Avatar.tsx — initials avatar (colored circle). Mirrors the prototype's Avatar.
import React from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { paletteFor } from '../data/tones';

interface Props {
  ini: string;
  size?: number;
  color?: string;
  tone?: string;
  ring?: boolean;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ ini, size = 32, color, tone, ring, ringColor = '#fff', style }: Props) {
  const useGradient = !color && tone;
  const p = paletteFor(tone);
  const inner = (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color || p[1],
          overflow: 'hidden',
        },
        ring
          ? {
              borderWidth: 2,
              borderColor: ringColor,
            }
          : null,
        style,
      ]}
    >
      {useGradient && (
        <LinearGradient
          colors={[p[0], p[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', inset: 0 as any, width: '100%', height: '100%' }}
        />
      )}
      <Text
        style={{
          color: '#fff',
          fontWeight: '700',
          fontSize: size * 0.42,
        }}
      >
        {ini}
      </Text>
    </View>
  );
  return inner;
}

export function AvatarStack({
  people,
  size = 26,
  max = 5,
  ringColor = '#fff',
}: {
  people: { ini: string; color?: string; tone?: string }[];
  size?: number;
  max?: number;
  ringColor?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((c, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.34 }}>
          <Avatar ini={c.ini} color={c.color} tone={c.tone} size={size} ring ringColor={ringColor} />
        </View>
      ))}
    </View>
  );
}
