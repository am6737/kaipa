// ElevationStrip — the elevation profile card shown inside the 总览 tab, right
// under the distance/ascent tiles. It does NOT repeat those numbers (they're in
// the tiles); instead it reads elevation off a proper Y axis. Dragging it reports
// an index/coord up so the map above can move its scrub marker in sync. Optional
// close/expand buttons (unused in the card; 更多 lives in the section header).
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { Press } from '../Press';
import { Icon } from '../Icon';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function ElevationStrip({
  theme, poi, onScrub, onClose, onExpand,
}: {
  theme: Theme;
  poi: Poi;
  onScrub: (index: number | null, coord?: [number, number]) => void;
  onClose?: () => void;
  onExpand?: () => void;
}) {
  const series = useMemo(() => buildElevation(poi), [poi.id, poi.trackElevation]);
  const coords = poi.trackCoords || [];
  const N = series.pts.length;
  const [w, setW] = useState(300);
  const [idx, setIdx] = useState<number | null>(null);
  const dragging = useRef(false);

  const H = 150, TOP = 14, BOT = 10, PAD_L = 34;
  const { minEle, maxEle, totalKm } = series;
  const span = Math.max(maxEle - minEle, 1);
  const minP = minEle, maxP = minEle + span;
  const plotW = Math.max(1, w - PAD_L);
  const xOf = (km: number) => PAD_L + (km / (totalKm || 1)) * plotW;
  const yOf = (e: number) => TOP + (1 - (e - minP) / span) * (H - TOP - BOT);

  const yTicks = useMemo(
    () => [0, 1 / 3, 2 / 3, 1].map((f) => ({ y: TOP + f * (H - TOP - BOT), ele: minP + (1 - f) * span })),
    [minP, span]
  );

  const line = useMemo(() => {
    let p = '';
    series.pts.forEach((pt, i) => (p += `${i === 0 ? 'M' : 'L'}${xOf(pt.km).toFixed(1)},${yOf(pt.ele).toFixed(1)} `));
    return p;
  }, [series.pts, w, minP, span, totalKm]);
  const area = `${line}L${w.toFixed(1)},${H} L${PAD_L},${H} Z`;

  const coordForIndex = (i: number): [number, number] | undefined => {
    if (!coords.length) return undefined;
    const ci = Math.max(0, Math.min(coords.length - 1, Math.round((i / Math.max(1, N - 1)) * (coords.length - 1))));
    return coords[ci];
  };

  // Stable refs so the PanResponder (created once) reads the latest width/handler.
  const wRef = useRef(w); wRef.current = w;
  const scrubTo = (locX: number) => {
    const frac = Math.max(0, Math.min(1, (locX - PAD_L) / Math.max(1, wRef.current - PAD_L)));
    const i = Math.max(0, Math.min(N - 1, Math.round(frac * (N - 1))));
    dragging.current = true;
    setIdx(i);
    onScrub(i, coordForIndex(i));
  };
  const scrubRef = useRef(scrubTo); scrubRef.current = scrubTo;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrubRef.current(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrubRef.current(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        dragging.current = false;
        setIdx(null);
        onScrub(null);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        setIdx(null);
        onScrub(null);
      },
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  const cur = idx != null && dragging.current ? series.pts[idx] : null;
  const cursorX = cur ? xOf(cur.km) : 0;
  const cursorY = cur ? yOf(cur.ele) : 0;
  const ac = theme.accent;
  const btnBg = theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const cursorColor = theme.dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.42)';

  return (
    <View
      style={{
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingTop: onExpand || onClose ? 10 : 12,
        paddingBottom: 10,
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
      }}
    >
      {onExpand || onClose ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
          {onExpand ? (
            <Press onPress={onExpand} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: btnBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrowUp" color={theme.text2} size={15} />
            </Press>
          ) : null}
          {onClose ? (
            <Press onPress={onClose} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: btnBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" color={theme.text2} size={14} />
            </Press>
          ) : null}
        </View>
      ) : null}

      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} style={{ height: H }}>
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id={`es-${poi.id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ac} stopOpacity={theme.dark ? 0.4 : 0.28} />
              <Stop offset="1" stopColor={ac} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {yTicks.map((tk, i) => (
            <Line key={i} x1={PAD_L} y1={tk.y} x2={w} y2={tk.y} stroke={theme.hairline} strokeWidth={1} strokeDasharray={i === yTicks.length - 1 ? '0' : '2 4'} />
          ))}
          <Path d={area} fill={`url(#es-${poi.id})`} />
          <Path d={line} fill="none" stroke={ac} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {cur ? (
            <>
              <Line x1={cursorX} y1={0} x2={cursorX} y2={H} stroke={cursorColor} strokeWidth={1.3} strokeDasharray="3 3" />
              <Circle cx={cursorX} cy={cursorY} r={5.5} fill={ac} stroke={theme.dark ? '#2f2f33' : '#fff'} strokeWidth={2.5} />
            </>
          ) : null}
        </Svg>

        {/* Y axis — elevation heights */}
        {yTicks.map((tk, i) => (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, top: tk.y - 7, width: PAD_L - 6, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: MONO, fontSize: 9, color: theme.text3 }}>{fmt(tk.ele)}</Text>
          </View>
        ))}

        {cur ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.max(PAD_L, Math.min(w - 108, cursorX - 54)),
              top: Math.max(-2, cursorY - 42),
              minWidth: 94,
              alignItems: 'center',
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: 10,
              backgroundColor: theme.dark ? '#3a3a3e' : '#16181a',
            }}
          >
            <Text style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: '800', color: '#fff' }}>
              {fmt(cur.ele)}<Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.65)' }}> m</Text>
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 9.5, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{cur.km.toFixed(1)} km</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingLeft: PAD_L }}>
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: theme.text3 }}>0 km</Text>
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: theme.text3 }}>{totalKm.toFixed(1)} km</Text>
      </View>
    </View>
  );
}
