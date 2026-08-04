// Avatar.tsx — shared user avatar. Real images are shown when available;
// otherwise every surface uses the same neutral gray person placeholder.
import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from './Icon';

interface Props {
  ini?: string;
  uri?: string;
  size?: number;
  color?: string;
  tone?: string;
  ring?: boolean;
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ uri, size = 32, ring, ringColor = '#fff', style }: Props) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(142,142,147,0.24)',
          overflow: 'hidden',
        },
        ring ? { borderWidth: 2, borderColor: ringColor } : null,
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <Icon name="user" color="#8E8E93" size={size * 0.5} strokeWidth={1.7} />
      )}
    </View>
  );
}

export function AvatarStack({
  people,
  size = 26,
  max = 5,
  ringColor = '#fff',
}: {
  people: { ini?: string; color?: string; tone?: string; avatarUrl?: string }[];
  size?: number;
  max?: number;
  ringColor?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((c, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.34 }}>
          <Avatar uri={c.avatarUrl} size={size} ring ringColor={ringColor} />
        </View>
      ))}
    </View>
  );
}
