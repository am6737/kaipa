import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, useWindowDimensions, Share, Alert } from 'react-native';
import { GestureDetector, Gesture, ScrollView } from 'react-native-gesture-handler';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, ClipPath, Rect } from 'react-native-svg';
import Mapbox, { MapView, Camera, ShapeSource, LineLayer, MarkerView, StyleImport } from '@rnmapbox/maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { useNav } from '../../nav/NavContext';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { CircleBtn } from '../CircleBtn';
import { useI18n } from '../../i18n';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');


const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let _mbTokenSet = false;
function ensureMapboxToken() {
  if (!_mbTokenSet && MAPBOX_TOKEN) { Mapbox.setAccessToken(MAPBOX_TOKEN); _mbTokenSet = true; }
}
const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

function TrackMap({ coords, theme, height, scrubPt, accent }: {
  coords: [number, number][]; theme: Theme; height: number;
  scrubPt?: [number, number]; accent: string;
}) {
  const { t } = useI18n();
  ensureMapboxToken();
  if (!coords.length) return null;

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
  };

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  const padDeg = Math.max(maxLat - minLat, maxLon - minLon) * 0.15;
  const bounds = {
    ne: [maxLon + padDeg, maxLat + padDeg] as [number, number],
    sw: [minLon - padDeg, minLat - padDeg] as [number, number],
  };
  const s = coords[0], e = coords[coords.length - 1];

  if (!MAPBOX_TOKEN) {
    return (
      <View style={{ height, borderRadius: 18, overflow: 'hidden', backgroundColor: theme.dark ? '#16181a' : '#e8edee', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, color: theme.text3 }}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', height, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <MapView
        style={{ flex: 1 }}
        styleURL={STANDARD_STYLE}
        scrollEnabled={false} zoomEnabled={false} rotateEnabled={false}
        pitchEnabled={false} scaleBarEnabled={false} logoEnabled={false}
        attributionEnabled={false} compassEnabled={false}
      >
        <Camera defaultSettings={{ bounds: { ...bounds, paddingLeft: 28, paddingRight: 28, paddingTop: 28, paddingBottom: 28 } }} />
        <StyleImport id="basemap" existing config={{ lightPreset: theme.dark ? 'dusk' : 'day', showPlaceLabels: true, showRoadLabels: true, showPointOfInterestLabels: false, showTransitLabels: false } as any} />
        <ShapeSource id="elev-route" shape={routeGeoJSON}>
          <LineLayer id="elev-route-shadow" style={{ lineColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)', lineWidth: 6, lineBlur: 3, lineCap: 'round', lineJoin: 'round', lineTranslate: [0, 1.5] } as any} />
          <LineLayer id="elev-route-line" style={{ lineColor: accent, lineWidth: 3.5, lineCap: 'round', lineJoin: 'round' } as any} />
        </ShapeSource>
        <MarkerView coordinate={s} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#fff' }} />
        </MarkerView>
        <MarkerView coordinate={e} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2.5, borderColor: '#fff' }} />
        </MarkerView>
        {scrubPt && (
          <MarkerView coordinate={scrubPt} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: accent, borderWidth: 2.5, borderColor: '#fff', opacity: 0.9 }} />
          </MarkerView>
        )}
      </MapView>
      <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
          <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('journey.elevation.waypointStart')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
          <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('journey.elevation.waypointEnd')}</Text>
        </View>
      </View>
    </View>
  );
}

function Stat({ theme, value, unit, label, color }: { theme: Theme; value: string; unit?: string; label: string; color?: string }) {
  return (
    <View style={{
      flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14,
      backgroundColor: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)',
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
    }}>
      <Text style={{ fontFamily: MONO, fontSize: 18, fontWeight: '800', color: color || theme.text, letterSpacing: -0.3 }}>
        {value}
        {unit ? <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2 }}> {unit}</Text> : null}
      </Text>
      <Text style={{ fontSize: 10, color: theme.text2, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

export function ElevationFull({ theme, info, isMine, onClose }: { theme: Theme; info: Poi; isMine?: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const series = useMemo(() => buildElevation(info), [info.id, info.trackElevation]);

  const coords = info.trackCoords || [];
  const hasMap = coords.length >= 2;
  const [mapFull, setMapFull] = useState(false);

  const waypoints = useMemo(() => {
    const pts = series.pts;
    const totalKm = series.totalKm;
    const base: { name: string; km: number; ele: number; i: number }[] = [];
    if (info.trackWaypoints?.length) {
      for (const w of info.trackWaypoints) {
        const wi = Math.max(0, Math.min(pts.length - 1, Math.round((w.km / (totalKm || 1)) * (pts.length - 1))));
        base.push({ name: w.name, km: w.km, ele: pts[wi]?.ele ?? 0, i: wi });
      }
    }
    const startWp = { name: t('journey.elevation.waypointStart'), km: 0, ele: pts[0]?.ele ?? 0, i: 0 };
    const endWp = { name: t('journey.elevation.waypointEnd'), km: totalKm, ele: pts[pts.length - 1]?.ele ?? 0, i: pts.length - 1 };
    return [startWp, ...base, endWp];
  }, [info.trackWaypoints, series.pts, series.totalKm, t]);

  const N = series.pts.length;
  const [idx, setIdx] = useState(Math.round(series.peakIdx));
  const [activeWpIdx, setActiveWpIdx] = useState<number | null>(null);
  const [hasScrubbed, setHasScrubbed] = useState(false);
  const cur = series.pts[Math.max(0, Math.min(N - 1, idx))];
  const showScrub = hasScrubbed || activeWpIdx != null;
  const snapThreshold = Math.max(3, Math.round(N * 0.015));
  const nearestWpIdx = useMemo(() => {
    let bi = 0;
    for (let ci = 1; ci < waypoints.length; ci++) {
      if (Math.abs(waypoints[ci].i - idx) < Math.abs(waypoints[bi].i - idx)) bi = ci;
    }
    return Math.abs(waypoints[bi].i - idx) <= snapThreshold ? bi : null;
  }, [idx, waypoints, snapThreshold]);
  const highlightWpIdx = activeWpIdx ?? nearestWpIdx;
  const ac = theme.accent;
  const totalKm = series.totalKm;

  const W = width - 36;
  const PLOT_H = 218;
  const TOP = 16, BOT = 12;
  const { minEle, maxEle } = series;
  const range = Math.max(maxEle - minEle, 1);
  const minP = minEle - range * 0.14, maxP = maxEle + range * 0.14;
  const xOf = (km: number) => (km / (totalKm || 1)) * W;
  const yOf = (ele: number) => TOP + (1 - (ele - minP) / (maxP - minP)) * (PLOT_H - TOP - BOT);

  let line = '';
  series.pts.forEach((p, i) => (line += `${i === 0 ? 'M' : 'L'}${xOf(p.km).toFixed(1)},${yOf(p.ele).toFixed(1)} `));
  const area = `${line}L${W},${PLOT_H} L0,${PLOT_H} Z`;
  const scrubX = xOf(cur.km), scrubY = yOf(cur.ele);
  const gradeColor = (g: number) => (g >= 4 ? '#FF9F0A' : g <= -4 ? (theme.dark ? '#64D2FF' : '#0A84FF') : theme.text2);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: TOP + f * (PLOT_H - TOP - BOT), ele: minP + (1 - f) * (maxP - minP) }));
  const tipBelow = scrubY < 70;

  const scrubCoord = useMemo((): [number, number] | undefined => {
    if (!coords.length) return undefined;
    const ci = Math.max(0, Math.min(coords.length - 1, Math.round((idx / Math.max(1, N - 1)) * (coords.length - 1))));
    return coords[ci];
  }, [idx, coords, N]);

  const plotW = useRef(W);
  const scrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / plotW.current));
        setIdx(Math.round(frac * (N - 1)));
        setActiveWpIdx(null);
        setHasScrubbed(true);
      },
      onPanResponderMove: (e) => {
        const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / plotW.current));
        setIdx(Math.round(frac * (N - 1)));
      },
    })
  ).current;

  const translateY = useRef(new Animated.Value(600)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [translateY]);

  const scrollY = useRef(0);
  const scrollRef = useRef<any>(null);
  const dragging = useRef(false);
  const dragBase = useRef(0);
  const dragOffset = useRef(0);
  const currentY = useRef(0);
  React.useEffect(() => {
    const id = translateY.addListener(({ value }) => { currentY.current = value; });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const onDragMove = (ty: number) => {
    if (!dragging.current) {
      if (ty > 0 && scrollY.current <= 0) {
        dragging.current = true;
        dragBase.current = currentY.current;
        dragOffset.current = ty;
      } else return;
    }
    let next = dragBase.current + (ty - dragOffset.current);
    next = Math.max(-30, next);
    translateY.setValue(next);
  };
  const onDragEnd = (vy: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (currentY.current > 110 || vy > 0.6) {
      Animated.timing(translateY, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => onCloseRef.current());
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
    }
  };
  const dragMoveRef = useRef(onDragMove);
  const dragEndRef = useRef(onDragEnd);
  dragMoveRef.current = onDragMove;
  dragEndRef.current = onDragEnd;

  const dismissGesture = useMemo(
    () => Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-8, 8])
      .simultaneousWithExternalGesture(scrollRef)
      .onBegin(() => { dragging.current = false; })
      .onUpdate((e) => dragMoveRef.current(e.translationY))
      .onEnd((e) => dragEndRef.current(e.velocityY / 1000))
      .onFinalize(() => { if (dragging.current) dragEndRef.current(0); }),
    [],
  );

  const exportGpx = () => {
    if (!coords.length) return;
    const trkpts = coords.map(([lon, lat], i) => {
      const ele = info.trackElevation?.[i]?.ele;
      return `  <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ''}</trkpt>`;
    }).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Kaipa">\n<trk><name>${info.name}</name>\n<trkseg>\n${trkpts}\n</trkseg></trk>\n</gpx>`;
    Share.share({ message: gpx, title: `${info.name}.gpx` });
  };

  const onMore = () => {
    nav.openActionSheet({
      items: [
        { label: t('journey.elevation.actionExport'), onPress: exportGpx },
        { label: t('journey.elevation.actionReupload'), onPress: () => { onClose(); nav.openAddRoute(); } },
        {
          label: t('journey.elevation.actionDelete'), destructive: true,
          onPress: () => {
            Alert.alert(t('journey.elevation.deleteTitle'), t('journey.elevation.deleteMessage'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.confirm'), style: 'destructive', onPress: () => {
                nav.patchCurrent({ trackCoords: undefined, trackElevation: undefined, trackDurationMs: undefined, trackWaypoints: undefined });
                onClose();
              }},
            ]);
          },
        },
      ],
    });
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, transform: [{ translateY }], zIndex: 130, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }]}>
    <GestureDetector gesture={dismissGesture}>
      <View style={{ flex: 1 }}>
      {/* header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 12 }}>
        <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: theme.text3, marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('journey.elevation.trackTitle')}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: theme.text2, marginTop: 2 }}>
              {info.name} · {totalKm.toFixed(1)} km{info.region ? ` · ${info.region}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Press
              onPress={onMore}
              style={{
                width: 34, height: 34, borderRadius: 17,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
                boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)',
                borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
                borderColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="more" color={theme.text} size={18} />
            </Press>
            <Press
              onPress={onClose}
              style={{
                width: 34, height: 34, borderRadius: 17,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: theme.dark ? '#2C2C2E' : '#fff',
                boxShadow: theme.dark ? '0px 2px 10px rgba(0,0,0,0.5)' : '0px 2px 10px rgba(0,0,0,0.14)',
                borderWidth: theme.dark ? StyleSheet.hairlineWidth : 0,
                borderColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="close" color={theme.text} size={14} />
            </Press>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        onScroll={(e: any) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      >
        {/* track map — tap to open full screen */}
        {hasMap && (
          <Press onPress={() => setMapFull(true)} style={{ paddingHorizontal: 18 }}>
            <TrackMap coords={coords} theme={theme} height={232} scrubPt={showScrub ? scrubCoord : undefined} accent={ac} />
          </Press>
        )}

        {/* elevation chart */}
        <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
          <View
            onLayout={(e) => { plotW.current = e.nativeEvent.layout.width; }}
            {...scrubPan.panHandlers}
            style={{ position: 'relative', width: W, height: PLOT_H }}
          >
            <Svg width={W} height={PLOT_H} viewBox={`0 0 ${W} ${PLOT_H}`}>
              <Defs>
                <LinearGradient id="rtElevFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={ac} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={ac} stopOpacity={0.02} />
                </LinearGradient>
                <ClipPath id="rtDone">
                  <Rect x="0" y="0" width={scrubX} height={PLOT_H} />
                </ClipPath>
              </Defs>
              {yTicks.map((tk, i) => (
                <Line key={i} x1={0} y1={tk.y} x2={W} y2={tk.y} stroke={theme.hairline} strokeWidth={1} strokeDasharray={i === yTicks.length - 1 ? '0' : '2 4'} />
              ))}
              <Path d={area} fill="url(#rtElevFill)" opacity={0.5} />
              {showScrub && <Path d={area} fill="url(#rtElevFill)" clipPath="url(#rtDone)" />}
              <Path d={line} fill="none" stroke={ac} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
              {waypoints.map((w, i) => (
                <Circle key={i} cx={xOf(w.km)} cy={yOf(w.ele)} r={4.5} fill={theme.bg} stroke={ac} strokeWidth={2} />
              ))}
              {showScrub && <>
                <Line x1={scrubX} y1={TOP - 4} x2={scrubX} y2={PLOT_H} stroke={ac} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
                <Circle cx={scrubX} cy={scrubY} r={7} fill={ac} />
                <Circle cx={scrubX} cy={scrubY} r={7} fill="none" stroke={theme.bg} strokeWidth={2.5} />
              </>}
            </Svg>
            {yTicks.slice(0, 4).map((tk, i) => (
              <View key={i} style={{ position: 'absolute', left: 0, top: tk.y - 14 }}>
                <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3, backgroundColor: theme.bg, paddingRight: 4 }}>{fmt(tk.ele)}</Text>
              </View>
            ))}
            {showScrub && (
              <View pointerEvents="none" style={{
                position: 'absolute',
                left: Math.max(12, Math.min(W - 104, scrubX - 46)),
                top: tipBelow ? scrubY + 16 : scrubY - 66,
                minWidth: 92, alignItems: 'center',
                backgroundColor: theme.dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
                borderRadius: 13, paddingVertical: 7, paddingHorizontal: 12,
                borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
                boxShadow: theme.dark ? '0px 6px 20px rgba(0,0,0,0.5)' : '0px 6px 20px rgba(0,0,0,0.14)',
              }}>
                <Text style={{ fontWeight: '800', fontSize: 19, color: theme.text, letterSpacing: -0.4 }}>
                  {fmt(cur.ele)}<Text style={{ fontSize: 11, fontWeight: '600', color: theme.text2 }}> m</Text>
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2, marginTop: 4 }}>
                  {cur.km.toFixed(1)} km · <Text style={{ color: gradeColor(cur.grade), fontWeight: '700' }}>
                    {cur.grade >= 0 ? '+' : ''}{cur.grade.toFixed(1)}%
                  </Text>
                </Text>
              </View>
            )}
          </View>
          {/* x axis */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>0 km</Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>{(totalKm / 2).toFixed(1)} km</Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>{totalKm.toFixed(1)} km</Text>
          </View>
          <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 12, textAlign: 'center' }}>
            {t('journey.elevation.scrubHint')}
          </Text>
        </View>

        {/* stats */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 18 }}>
          <Stat theme={theme} value={fmt(maxEle)} unit="m" label={t('journey.elevation.max')} />
          <Stat theme={theme} value={fmt(minEle)} unit="m" label={t('journey.elevation.min')} />
          <Stat theme={theme} value={`+${fmt(series.ascent)}`} unit="m" label={t('journey.elevation.ascent')} color={ac} />
          <Stat theme={theme} value={`−${fmt(series.descent)}`} unit="m" label={t('journey.elevation.descent')} />
        </View>

        {/* 标注点 vertical list */}
        {waypoints.length > 0 && (
          <View style={{ marginTop: 20, paddingHorizontal: 18, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2, letterSpacing: 0.8 }}>
                {t('journey.elevation.markers')}
              </Text>
              <View style={{
                minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
                backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text3 }}>{waypoints.length}</Text>
              </View>
            </View>
            <View style={{
              borderRadius: 14, overflow: 'hidden',
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
              borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
            }}>
              {waypoints.map((w, i) => {
                const active = i === highlightWpIdx;
                return (
                  <View key={i}>
                    <Press
                      onPress={() => { const deselect = activeWpIdx === i; setActiveWpIdx(deselect ? null : i); setIdx(w.i); setHasScrubbed(!deselect); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14,
                        backgroundColor: active ? theme.accentSoft : 'transparent',
                      }}
                    >
                      <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: active ? ac : (theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: active ? '#fff' : theme.text2 }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{w.name}</Text>
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2, marginTop: 3 }}>
                          {w.km.toFixed(1)} km · {fmt(w.ele)} m
                        </Text>
                      </View>
                    </Press>
                    {i < waypoints.length - 1 && (
                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 54 }} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
      </View>
    </GestureDetector>

      {/* full-screen map overlay */}
      {mapFull && hasMap && (() => {
        let mnLat = Infinity, mxLat = -Infinity, mnLon = Infinity, mxLon = -Infinity;
        for (const [lon, lat] of coords) {
          mnLat = Math.min(mnLat, lat); mxLat = Math.max(mxLat, lat);
          mnLon = Math.min(mnLon, lon); mxLon = Math.max(mxLon, lon);
        }
        const pd = Math.max(mxLat - mnLat, mxLon - mnLon) * 0.12;
        const fullBounds = { ne: [mxLon + pd, mxLat + pd] as [number, number], sw: [mnLon - pd, mnLat - pd] as [number, number] };
        const fullGeo: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] };
        const s = coords[0], e = coords[coords.length - 1];
        return (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 300 }]}>
            <MapView
              style={StyleSheet.absoluteFill}
              styleURL={STANDARD_STYLE}
              scaleBarEnabled={false} logoEnabled={false} attributionEnabled={false} compassEnabled={false}
              rotateEnabled zoomEnabled scrollEnabled pitchEnabled
            >
              <Camera defaultSettings={{ bounds: { ...fullBounds, paddingLeft: 40, paddingRight: 40, paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100 } }} />
              <StyleImport id="basemap" existing config={{ lightPreset: theme.dark ? 'dusk' : 'day', showPlaceLabels: true, showRoadLabels: true, showPointOfInterestLabels: true, showTransitLabels: true } as any} />
              <ShapeSource id="full-elev-route" shape={fullGeo}>
                <LineLayer id="full-elev-shadow" style={{ lineColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)', lineWidth: 7, lineBlur: 3, lineCap: 'round', lineJoin: 'round', lineTranslate: [0, 2] } as any} />
                <LineLayer id="full-elev-line" style={{ lineColor: ac, lineWidth: 4, lineCap: 'round', lineJoin: 'round' } as any} />
              </ShapeSource>
              <MarkerView coordinate={s} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#34C759', borderWidth: 3, borderColor: '#fff' }} />
              </MarkerView>
              <MarkerView coordinate={e} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: theme.danger, borderWidth: 3, borderColor: '#fff' }} />
              </MarkerView>
            </MapView>

            <View style={{ position: 'absolute', top: insets.top + 8, left: 12 }}>
              <CircleBtn theme={theme} name="arrowL" onPress={() => setMapFull(false)} />
            </View>

            <View style={{ position: 'absolute', bottom: insets.bottom + 12, left: 12, right: 12, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: ac }}>{info.dist}</Text>
                <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{t('journey.elevation.totalDistance')}</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{info.asc}</Text>
                <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{t('journey.elevation.ascent')}</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{fmt(maxEle)} m</Text>
                <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{t('journey.elevation.max')}</Text>
              </View>
            </View>

            <View style={{ position: 'absolute', bottom: insets.bottom + 88, left: 12, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
                <Text style={{ fontSize: 11, color: theme.text2 }}>{t('journey.elevation.waypointStart')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
                <Text style={{ fontSize: 11, color: theme.text2 }}>{t('journey.elevation.waypointEnd')}</Text>
              </View>
            </View>
          </View>
        );
      })()}
    </Animated.View>
  );
}
