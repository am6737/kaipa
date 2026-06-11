// ElevationStrip.tsx — small area-chart of an elevation series (react-native-svg).
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme } from '../theme/theme';
import { ElevSeries } from '../data/elevation';

interface Props {
  theme: Theme;
  series: ElevSeries;
  width: number;
  height?: number;
  color?: string;
  gradId?: string;
}

export function ElevationStrip({ theme, series, width, height = 62, color, gradId = 'elevStrip' }: Props) {
  const stroke = color || theme.accent;
  const { pts, minEle, maxEle } = series;
  const range = Math.max(1, maxEle - minEle);
  const padTop = 6;
  const padBot = 4;
  const xOf = (km: number) => (km / series.totalKm) * width;
  const yOf = (ele: number) => padTop + (1 - (ele - minEle) / range) * (height - padTop - padBot);
  let line = '';
  pts.forEach((p, i) => {
    line += `${i === 0 ? 'M' : 'L'}${xOf(p.km).toFixed(1)},${yOf(p.ele).toFixed(1)} `;
  });
  const area = `${line}L${width},${height} L0,${height} Z`;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.3} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill={`url(#${gradId})`} />
        <Path d={line} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
