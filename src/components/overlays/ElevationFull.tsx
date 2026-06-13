// ElevationFull.tsx — full elevation profile: large chart + max/min/ascent/
// descent stats + waypoint chips.
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { FullOverlay } from './FullOverlay';
import { useWindowDimensions } from 'react-native';
import { useI18n } from '../../i18n';

function Stat({ theme, value, unit, label, color }: { theme: Theme; value: string; unit?: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
      <Text style={{ fontFamily: MONO, fontSize: 18, fontWeight: '800', color: color || theme.text }}>
        {value}
        {unit ? <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}> {unit}</Text> : null}
      </Text>
      <Text style={{ fontSize: 10.5, color: theme.text2, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

export function ElevationFull({ theme, info, isMine, onClose }: { theme: Theme; info: Poi; isMine?: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const series = useMemo(() => buildElevation(info), [info.id]);
  const [idx, setIdx] = useState(Math.round(series.peakIdx));

  const W = width - 32;
  const H = 240;
  const stroke = isMine ? theme.trailMine : theme.accent;
  const { pts, minEle, maxEle, totalKm } = series;
  const pad = (maxEle - minEle) * 0.14 || 50;
  const minP = minEle - pad;
  const maxP = maxEle + pad;
  const xOf = (km: number) => (km / totalKm) * W;
  const yOf = (ele: number) => 16 + (1 - (ele - minP) / (maxP - minP)) * (H - 26);

  let line = '';
  pts.forEach((p, i) => (line += `${i === 0 ? 'M' : 'L'}${xOf(p.km).toFixed(1)},${yOf(p.ele).toFixed(1)} `));
  const area = `${line}L${W},${H} L0,${H} Z`;
  const cur = pts[Math.max(0, Math.min(pts.length - 1, idx))];
  const grades = (g: number) => (g >= 4 ? '#FF9F0A' : g <= -4 ? (theme.dark ? '#64D2FF' : '#0A84FF') : theme.text2);

  // gridlines
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => 16 + f * (H - 26));

  const waypoints = [
    { name: t('journey.elevation.waypointStart'), km: 0 },
    { name: t('journey.elevation.waypointViewpoint'), km: totalKm * 0.32 },
    { name: t('journey.elevation.waypointPeak'), km: pts[series.peakIdx].km },
    { name: t('journey.elevation.waypointEnd'), km: totalKm },
  ];

  return (
    <FullOverlay theme={theme} title={t('journey.elevation.title')} subtitle={`${info.name} · ${info.dist}`} onClose={onClose}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="elevFull" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.3} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {gridYs.map((y, i) => (
            <Line key={i} x1={0} y1={y} x2={W} y2={y} stroke={theme.hairline} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          <Path d={area} fill="url(#elevFull)" />
          <Path d={line} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {/* scrubber */}
          <Line x1={xOf(cur.km)} y1={12} x2={xOf(cur.km)} y2={H} stroke={stroke} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
          <Circle cx={xOf(cur.km)} cy={yOf(cur.ele)} r={7} fill={stroke} stroke={theme.bg} strokeWidth={2.5} />
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>0 km</Text>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text }}>
            {cur.ele} m · {cur.km.toFixed(1)} km · <Text style={{ color: grades(cur.grade) }}>{cur.grade.toFixed(0)}%</Text>
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{totalKm.toFixed(1)} km</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          <Stat theme={theme} value={String(maxEle)} unit="m" label={t('journey.elevation.max')} />
          <Stat theme={theme} value={String(minEle)} unit="m" label={t('journey.elevation.min')} />
          <Stat theme={theme} value={'+' + series.ascent} unit="m" label={t('journey.elevation.ascent')} color={theme.accent} />
          <Stat theme={theme} value={'-' + series.descent} unit="m" label={t('journey.elevation.descent')} />
        </View>

        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text3, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>
          {t('journey.elevation.waypoints')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {waypoints.map((w, i) => {
            const wi = Math.round((w.km / totalKm) * (pts.length - 1));
            const active = Math.abs(wi - idx) < 3;
            return (
              <View key={i}>
                <Text
                  onPress={() => setIdx(wi)}
                  style={{
                    minWidth: 84,
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                    borderRadius: 13,
                    overflow: 'hidden',
                    fontSize: 13,
                    fontWeight: '600',
                    color: active ? theme.accent : theme.text,
                    backgroundColor: active ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  }}
                >
                  {w.name}
                  {'\n'}
                  <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2 }}>{w.km.toFixed(1)} km</Text>
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </FullOverlay>
  );
}
