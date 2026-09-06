import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { Theme } from '../../theme/theme';

const MARKER_SIZE = 52;

export function CurrentLocationMarker({ theme, heading }: { theme: Theme; heading?: number }) {
  const hasHeading = Number.isFinite(heading);

  return (
    <View
      pointerEvents="none"
      style={{
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${hasHeading ? heading : 0}deg` }],
      }}
    >
      {hasHeading ? (
        <Svg width={MARKER_SIZE} height={MARKER_SIZE} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="location-heading" x1="26" y1="26" x2="26" y2="1" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={theme.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={theme.accent} stopOpacity={0.06} />
            </LinearGradient>
          </Defs>
          <Path d="M26 26 L11 5 Q26 -2 41 5 Z" fill="url(#location-heading)" />
        </Svg>
      ) : null}
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: theme.dotRing,
          borderWidth: 3,
          borderColor: theme.dotCore,
          boxShadow: '0px 1px 4px rgba(0,0,0,0.24)',
        }}
      />
    </View>
  );
}
