// PhotoTile.tsx — deterministic "photo" surface: a palette gradient with a
// layered mountain-ridge silhouette (ported from the prototype's Tile fallback).
// No network images — the tone + seed fully determine the look.
import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { paletteFor, hashStr } from '../data/tones';

interface Props {
  tone?: string;
  seed?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  darken?: boolean; // dark gradient overlay for legible text on top
}

export function PhotoTile({ tone, seed = '', radius = 0, style, children, darken }: Props) {
  const p = paletteFor(tone);
  const h = hashStr((tone || 'ridge') + seed);
  // vary the ridge heights a little per-seed for visual variety
  const v = (n: number) => 0.78 + ((h >> n) & 7) * 0.02;

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: p[1] }, style]}>
      <LinearGradient
        colors={[p[0], p[1], p[2]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: '64%' }}
      >
        <Path
          d={`M0,120 L0,${70 * v(0)} L26,44 L44,60 L70,28 L96,58 L124,36 L152,64 L176,46 L200,70 L200,120 Z`}
          fill={p[0]}
          opacity={0.78}
        />
        <Path
          d={`M0,120 L0,86 L20,74 L44,84 L74,68 L104,82 L140,72 L170,84 L200,76 L200,120 Z`}
          fill={p[1]}
          opacity={0.85}
        />
      </Svg>
      {darken && (
        <LinearGradient
          colors={['rgba(0,0,0,0.30)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}
