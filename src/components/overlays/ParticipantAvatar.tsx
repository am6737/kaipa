import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';

export function ParticipantAvatar({
  theme,
  uri,
  size = 44,
  ring = false,
  ringColor,
  ringWidth = 2,
  backgroundColor,
}: {
  theme: Theme;
  uri?: string;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  ringWidth?: number;
  backgroundColor?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: backgroundColor || theme.fieldSurface,
        borderWidth: ring ? ringWidth : 0,
        borderColor: ringColor || theme.featureSurface,
      }}
    >
      {uri ? (
        <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <Icon name="user" color={theme.text3} size={size * 0.48} strokeWidth={1.65} />
      )}
    </View>
  );
}
