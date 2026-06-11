// Donut.tsx — segmented ring chart (react-native-svg) with a center readout.
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { MONO } from '../theme/fonts';

export interface DonutSeg {
  value: number;
  color: string;
}

export function Donut({
  theme,
  size = 188,
  thickness = 26,
  segments,
  centerTop,
  centerValue,
  centerSub,
}: {
  theme: Theme;
  size?: number;
  thickness?: number;
  segments: DonutSeg[];
  centerTop?: string;
  centerValue?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const gap = 0.012 * C; // small gap between segments
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'} strokeWidth={thickness} fill="none" />
          {segments.map((seg, i) => {
            const len = (seg.value / total) * C;
            const dash = Math.max(0, len - gap);
            const circle = (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={seg.color}
                strokeWidth={thickness}
                fill="none"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return circle;
          })}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        {centerTop ? <Text style={{ fontSize: 11, color: theme.text2 }}>{centerTop}</Text> : null}
        {centerValue ? <Text style={{ fontFamily: MONO, fontSize: 24, fontWeight: '800', color: theme.text }}>{centerValue}</Text> : null}
        {centerSub ? <Text style={{ fontFamily: MONO, fontSize: 9.5, color: theme.text3, marginTop: 2 }}>{centerSub}</Text> : null}
      </View>
    </View>
  );
}
