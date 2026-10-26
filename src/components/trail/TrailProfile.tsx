// TrailProfile.tsx — the route's elevation profile with the walker on it. The
// part behind is filled in accent, so it doubles as the progress bar: one look
// says how far along and how much climbing is left.
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { space, type } from '../../design-system';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';

const HEIGHT = 56;
const TOP = 6;
const BOTTOM = 4;
const DOT = 5;

type Sample = { km: number; ele: number };

// `fraction` rather than metres: a stored profile's distances need not match the
// measured track's length exactly, and the dot must still end at the end.
export function TrailProfile({ theme, profile, fraction }: { theme: Theme; profile: Sample[]; fraction: number }) {
  const [width, setWidth] = useState(0);
  const { minEle, maxEle, totalKm } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const sample of profile) {
      min = Math.min(min, sample.ele);
      max = Math.max(max, sample.ele);
    }
    return { minEle: min, maxEle: max, totalKm: profile[profile.length - 1]?.km || 1 };
  }, [profile]);

  const span = Math.max(maxEle - minEle, 30);
  const plotW = Math.max(1, width - DOT * 2);
  const x = (km: number) => DOT + (km / totalKm) * plotW;
  const y = (ele: number) => TOP + (1 - (ele - minEle) / span) * (HEIGHT - TOP - BOTTOM);

  const alongKm = Math.max(0, Math.min(1, fraction)) * totalKm;
  const here = useMemo(() => eleAt(profile, alongKm), [profile, alongKm]);

  const paths = useMemo(() => {
    if (!width) return null;
    const line = (samples: Sample[]) => samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.km).toFixed(1)},${y(s.ele).toFixed(1)}`).join(' ');
    const area = (samples: Sample[]) => samples.length < 2 ? '' : `${line(samples)} L${x(samples[samples.length - 1].km).toFixed(1)},${HEIGHT} L${x(samples[0].km).toFixed(1)},${HEIGHT} Z`;
    const walked = [...profile.filter((s) => s.km < alongKm), { km: alongKm, ele: here }];
    return { full: line(profile), fullArea: area(profile), walkedArea: area(walked), walked: line(walked) };
    // x and y only change with these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, width, alongKm, here, minEle, span, totalKm]);

  return (
    <View>
      <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ height: HEIGHT }}>
        {paths ? (
          <Svg width={width} height={HEIGHT}>
            <Path d={paths.fullArea} fill={theme.progressTrack} />
            <Path d={paths.full} fill="none" stroke={theme.text3} strokeWidth={1.2} strokeLinejoin="round" />
            <Path d={paths.walkedArea} fill={theme.accent} fillOpacity={theme.dark ? 0.32 : 0.22} />
            <Path d={paths.walked} fill="none" stroke={theme.accent} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(alongKm)} cy={y(here)} r={DOT} fill={theme.accent} stroke={theme.controlSurface} strokeWidth={2} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xxs }}>
        <Text style={[type.micro, { fontFamily: MONO, color: theme.text3 }]}>{`${Math.round(minEle).toLocaleString('en-US')} m`}</Text>
        <Text style={[type.micro, { fontFamily: MONO, color: theme.text3 }]}>{`${Math.round(maxEle).toLocaleString('en-US')} m`}</Text>
      </View>
    </View>
  );
}

function eleAt(profile: Sample[], km: number): number {
  if (!profile.length) return 0;
  if (km <= profile[0].km) return profile[0].ele;
  for (let i = 1; i < profile.length; i += 1) {
    const b = profile[i];
    if (b.km >= km) {
      const a = profile[i - 1];
      const spanKm = b.km - a.km;
      return spanKm > 0 ? a.ele + ((b.ele - a.ele) * (km - a.km)) / spanKm : b.ele;
    }
  }
  return profile[profile.length - 1].ele;
}
