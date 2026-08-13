import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, Share, Alert, InteractionManager } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, ClipPath, Rect, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi } from '../../data/pois';
import { buildElevation } from '../../data/elevation';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { Press } from '../Press';
import { CircleBtn } from '../CircleBtn';
import { Icon } from '../Icon';
import { radius, space, type } from '../../design-system';
import { MapStylePickerSheet } from '../MapStylePickerSheet';
import { MapStyleId, TrackMap, TrackMapHandle, TrackMapWaypoint, ensureMapboxToken } from './TrackMap';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const INITIAL_WAYPOINT_RENDER_COUNT = 32;
const WAYPOINT_RENDER_BATCH_SIZE = 48;

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

// The waypoint dots are the one SVG subtree that scales with the marker count.
// Memoized on their (scrub-invariant) positions/colors so a scrub drag — which
// re-renders TrackDetailContent every frame — skips reconciling all N circles.
const WaypointDots = React.memo(function WaypointDots({
  positions, fill, stroke,
}: { positions: { cx: number; cy: number }[]; fill: string; stroke: string }) {
  return (
    <G>
      {positions.map((p, i) => (
        <Circle key={i} cx={p.cx} cy={p.cy} r={4.5} fill={fill} stroke={stroke} strokeWidth={2} />
      ))}
    </G>
  );
});

// One marker-list row, memoized so a scrub only re-renders the ~2 rows whose
// `active` highlight flips instead of the whole list. `onPress` must be a stable
// reference (see handleMarkerPress) for the memo to hold.
const MarkerRow = React.memo(function MarkerRow({
  theme, label, name, km, ele, active, index, waypointIndex, onPress, showDivider,
}: {
  theme: Theme; label: number; name: string; km: number; ele: number;
  active: boolean; index: number; waypointIndex: number;
  onPress: (index: number, waypointIndex: number) => void; showDivider: boolean;
}) {
  const ac = theme.accent;
  return (
    <View>
      <Press
        onPress={() => onPress(index, waypointIndex)}
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
          <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '700', color: active ? '#fff' : theme.text2 }}>{label}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text }}>{name}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2, marginTop: 3 }}>
            {km.toFixed(1)} km · {fmt(ele)} m
          </Text>
        </View>
      </Press>
      {showDivider && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 54 }} />
      )}
    </View>
  );
});

type FullMapPanel = 'layers' | null;

function FullscreenTrackMap({
  theme,
  info,
  coords,
  totalKm,
  maxEle,
  accent,
  onClose,
}: {
  theme: Theme;
  info: Poi;
  coords: [number, number][];
  totalKm: number;
  maxEle: number;
  accent: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const mapRef = useRef<TrackMapHandle>(null);
  const routePadding = useMemo<[number, number, number, number]>(
    () => [insets.top + 72, 64, insets.bottom + 116, 52],
    [insets.bottom, insets.top],
  );
  const [mapStyle, setMapStyle] = useState<MapStyleId>('standard');
  const [panel, setPanel] = useState<FullMapPanel>(null);
  const [showWaypoints, setShowWaypoints] = useState(Boolean(info.trackWaypoints?.length));
  const [showMapLabels, setShowMapLabels] = useState(true);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [cameraOrientation, setCameraOrientation] = useState({ heading: 0, pitch: 0 });

  const mapWaypoints = useMemo<TrackMapWaypoint[]>(() => {
    if (!info.trackWaypoints?.length || coords.length < 2) return [];
    const divisor = Math.max(totalKm, 0.001);
    return info.trackWaypoints.map((waypoint) => {
      const index = Math.max(0, Math.min(coords.length - 1, Math.round((waypoint.km / divisor) * (coords.length - 1))));
      return { name: waypoint.name, km: waypoint.km, coord: coords[index] };
    });
  }, [coords, info.trackWaypoints, totalKm]);

  const compassVisible = Math.abs(cameraOrientation.heading) > 2 || cameraOrientation.pitch > 2;
  const summarySurface = theme.dark ? 'rgba(20,20,22,0.90)' : 'rgba(255,255,255,0.94)';
  const layerOptions: { id: MapStyleId; label: string }[] = [
    { id: 'standard', label: t('journey.map.layerStandard') },
    { id: 'terrain', label: t('journey.map.layerTerrain') },
    { id: 'satellite', label: t('journey.map.layerSatellite') },
  ];

  const togglePanel = (next: 'layers') => {
    setPanel((current) => current === next ? null : next);
  };

  const resetNorth = () => {
    mapRef.current?.resetNorth();
    setCameraOrientation({ heading: 0, pitch: 0 });
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 300 }]}>
      <TrackMap
        ref={mapRef}
        coords={coords}
        theme={theme}
        accent={accent}
        fill
        rounded={false}
        showLegend={false}
        interactive
        mapStyle={mapStyle}
        waypoints={mapWaypoints}
        showWaypoints={showWaypoints}
        showMapLabels={showMapLabels}
        routePadding={routePadding}
        onCameraOrientationChange={(heading, pitch) => {
          setCameraOrientation((current) => {
            if (Math.abs(current.heading - heading) < 1 && Math.abs(current.pitch - pitch) < 1) return current;
            return { heading, pitch };
          });
        }}
      />

      <View style={{ position: 'absolute', top: insets.top + space.sm, left: space.sm }}>
        <CircleBtn theme={theme} name="chevronL" onPress={onClose} />
      </View>

      <View style={{ position: 'absolute', top: insets.top + space.sm, right: space.sm, gap: space.sm }}>
        <CircleBtn theme={theme} name="layers" active={panel === 'layers'} onPress={() => togglePanel('layers')} />
        <CircleBtn theme={theme} name="route" onPress={() => { setPanel(null); mapRef.current?.fitRoute(); }} />
        {compassVisible ? <CircleBtn theme={theme} name="compassN" onPress={resetNorth} /> : null}
      </View>

      {panel === 'layers' ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          options={layerOptions}
          value={mapStyle}
          detailsTitle={t('journey.map.displayTitle')}
          details={[
            {
              id: 'waypoints',
              label: t('journey.map.showWaypoints'),
              value: showWaypoints,
              disabled: !mapWaypoints.length,
              onChange: setShowWaypoints,
            },
            {
              id: 'map-labels',
              label: t('journey.map.showLabels'),
              value: showMapLabels,
              onChange: setShowMapLabels,
            },
          ]}
          bottomInset={insets.bottom}
          onChange={setMapStyle}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <Press
        onPress={() => setSummaryExpanded((value) => !value)}
        style={{
          position: 'absolute',
          left: space.sm,
          right: space.sm,
          bottom: insets.bottom + space.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius.feature,
          backgroundColor: summarySurface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          boxShadow: theme.dark ? '0px 8px 24px rgba(0,0,0,0.48)' : '0px 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MapSummaryMetric theme={theme} value={info.dist || '—'} label={t('journey.elevation.totalDistance')} color={accent} />
          <View style={{ width: StyleSheet.hairlineWidth, height: 28, backgroundColor: theme.border }} />
          <MapSummaryMetric theme={theme} value={info.asc || '—'} label={t('journey.elevation.ascent')} />
          <View style={{ width: StyleSheet.hairlineWidth, height: 28, backgroundColor: theme.border }} />
          <MapSummaryMetric theme={theme} value={`${fmt(maxEle)} m`} label={t('journey.elevation.max')} />
          <Icon name={summaryExpanded ? 'chevronDown' : 'arrowUp'} size={17} color={theme.text3} />
        </View>
        {summaryExpanded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: space.sm, marginTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
            <MapLegendItem theme={theme} color="#34C759" label={t('journey.elevation.waypointStart')} />
            <MapLegendItem theme={theme} color={theme.danger} label={t('journey.elevation.waypointEnd')} />
            <Text style={[type.caption, { color: theme.text3, marginLeft: 'auto' }]}>{t('journey.map.summaryHint')}</Text>
          </View>
        ) : null}
      </Press>
    </View>
  );
}

function MapSummaryMetric({ theme, value, label, color }: { theme: Theme; value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, paddingHorizontal: space.xs }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { color: color || theme.text, fontSize: 16, lineHeight: 20 }]}>{value}</Text>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}

function MapLegendItem({ theme, color, label }: { theme: Theme; color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={[type.caption, { color: theme.text2 }]}>{label}</Text>
    </View>
  );
}

export function TrackDetailContent({
  theme,
  info,
  isMine,
  showMap = true,
  showActions = true,
  contentPaddingHorizontal = 18,
  bottomPadding = 12,
  selectedIndex,
  onSelectionChange,
  onClose,
}: {
  theme: Theme;
  info: Poi;
  isMine?: boolean;
  showMap?: boolean;
  showActions?: boolean;
  contentPaddingHorizontal?: number;
  bottomPadding?: number;
  selectedIndex?: number | null;
  onSelectionChange?: (index: number | null, coord?: [number, number]) => void;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { t } = useI18n();
  ensureMapboxToken();

  const series = useMemo(() => buildElevation(info), [info.id, info.trackElevation]);
  const coords = info.trackCoords || [];
  const hasMap = coords.length >= 2;
  const [mapFull, setMapFull] = useState(false);
  const [containerW, setContainerW] = useState(360);

  const allWaypoints = useMemo(() => {
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

  const [renderedWaypointCount, setRenderedWaypointCount] = useState(INITIAL_WAYPOINT_RENDER_COUNT);

  useEffect(() => {
    const total = allWaypoints.length;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setRenderedWaypointCount(Math.min(INITIAL_WAYPOINT_RENDER_COUNT, total));

    if (total <= INITIAL_WAYPOINT_RENDER_COUNT) {
      return () => { cancelled = true; };
    }

    const step = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        setRenderedWaypointCount((prev) => {
          const next = Math.min(total, prev + WAYPOINT_RENDER_BATCH_SIZE);
          if (next < total) step();
          return next;
        });
      }, 16);
    };

    const interaction = InteractionManager.runAfterInteractions(step);

    return () => {
      cancelled = true;
      interaction.cancel?.();
      if (timer) clearTimeout(timer);
    };
  }, [allWaypoints.length, info.id]);

  const waypoints = useMemo(() => allWaypoints.slice(0, renderedWaypointCount), [allWaypoints, renderedWaypointCount]);

  const N = series.pts.length;
  const controlledSelection = selectedIndex !== undefined;
  const [internalIdx, setInternalIdx] = useState(Math.round(series.peakIdx));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [activeWpIdx, setActiveWpIdx] = useState<number | null>(null);
  const [hasScrubbed, setHasScrubbed] = useState(false);
  const idx = Math.max(0, Math.min(N - 1, dragIdx ?? (controlledSelection ? (selectedIndex ?? internalIdx) : internalIdx)));
  const cur = series.pts[idx];
  const showScrub = controlledSelection ? selectedIndex != null : (hasScrubbed || activeWpIdx != null);
  const snapThreshold = Math.max(3, Math.round(N * 0.015));
  const nearestWpIdx = useMemo(() => {
    let bi = 0;
    for (let ci = 1; ci < waypoints.length; ci++) {
      if (Math.abs(waypoints[ci].i - idx) < Math.abs(waypoints[bi].i - idx)) bi = ci;
    }
    return Math.abs(waypoints[bi].i - idx) <= snapThreshold ? bi : null;
  }, [idx, waypoints, snapThreshold]);
  const highlightWpIdx = activeWpIdx ?? nearestWpIdx;
  const waypointCountLabel = allWaypoints.length > waypoints.length ? `${waypoints.length}/${allWaypoints.length}` : String(allWaypoints.length);
  const ac = theme.accent;
  const routeOuter = theme.dark ? '#FFFFFF' : 'rgba(255,255,255,0.9)';
  const routeHalo = theme.dark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.15)';
  const totalKm = series.totalKm;

  const W = Math.max(240, containerW - contentPaddingHorizontal * 2);
  const PLOT_H = 218;
  const TOP = 16, BOT = 12;
  const { minEle, maxEle } = series;
  const range = Math.max(maxEle - minEle, 1);
  const minP = minEle - range * 0.14, maxP = maxEle + range * 0.14;
  const xOf = (km: number) => (km / (totalKm || 1)) * W;
  const yOf = (ele: number) => TOP + (1 - (ele - minP) / (maxP - minP)) * (PLOT_H - TOP - BOT);

  const line = useMemo(() => {
    let path = '';
    series.pts.forEach((p, i) => (path += `${i === 0 ? 'M' : 'L'}${xOf(p.km).toFixed(1)},${yOf(p.ele).toFixed(1)} `));
    return path;
  }, [series.pts, W, totalKm, minP, maxP]);
  const area = useMemo(() => `${line}L${W},${PLOT_H} L0,${PLOT_H} Z`, [line, W]);
  // Waypoint dot screen positions — scrub-invariant, so WaypointDots stays memoized while dragging.
  const dotPositions = useMemo(
    () => waypoints.map((w) => ({ cx: xOf(w.km), cy: yOf(w.ele) })),
    [waypoints, W, totalKm, minP, maxP]
  );
  const scrubX = xOf(cur.km), scrubY = yOf(cur.ele);
  const gradeColor = (g: number) => (g >= 4 ? '#FF9F0A' : g <= -4 ? (theme.dark ? '#64D2FF' : '#0A84FF') : theme.text2);
  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: TOP + f * (PLOT_H - TOP - BOT), ele: minP + (1 - f) * (maxP - minP) })), [minP, maxP]);
  const tipBelow = scrubY < 70;

  const coordForIndex = (nextIdx: number): [number, number] | undefined => {
    if (!coords.length) return undefined;
    const ci = Math.max(0, Math.min(coords.length - 1, Math.round((nextIdx / Math.max(1, N - 1)) * (coords.length - 1))));
    return coords[ci];
  };

  const scrubCoord = useMemo((): [number, number] | undefined => coordForIndex(idx), [idx, coords, N]);

  const lastParentSyncAt = useRef(0);
  const syncSelectionToParent = (safeIdx: number, force = false) => {
    if (!onSelectionChange) return;
    const now = Date.now();
    // Updating the Mapbox scrub marker above is expensive; keep the chart local
    // at frame rate and sync the map at a lower cadence while dragging.
    if (!force && now - lastParentSyncAt.current < 96) return;
    lastParentSyncAt.current = now;
    onSelectionChange(safeIdx, coordForIndex(safeIdx));
  };

  const setSelection = (nextIdx: number | null, wpIdx: number | null = null, syncParent = true) => {
    setActiveWpIdx(wpIdx);
    if (nextIdx == null) {
      setDragIdx(null);
      setHasScrubbed(false);
      onSelectionChange?.(null);
      return;
    }
    const safeIdx = Math.max(0, Math.min(N - 1, nextIdx));
    setDragIdx(safeIdx);
    setInternalIdx(safeIdx);
    setHasScrubbed(true);
    if (syncParent) syncSelectionToParent(safeIdx);
  };

  const selectionRaf = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const pendingSelection = useRef<number | null>(null);
  const setSelectionRef = useRef(setSelection);
  setSelectionRef.current = setSelection;

  // Stable press handler so memoized MarkerRows don't re-render every scrub
  // frame; latest activeWpIdx/showScrub are read through refs.
  const activeWpIdxRef = useRef(activeWpIdx);
  activeWpIdxRef.current = activeWpIdx;
  const showScrubRef = useRef(showScrub);
  showScrubRef.current = showScrub;
  const handleMarkerPress = useCallback((i: number, wi: number) => {
    const deselect = activeWpIdxRef.current === i && showScrubRef.current;
    setSelectionRef.current(deselect ? null : wi, deselect ? null : i);
  }, []);

  const scheduleDragSelection = (nextIdx: number) => {
    pendingSelection.current = nextIdx;
    if (selectionRaf.current != null) return;
    selectionRaf.current = requestAnimationFrame(() => {
      selectionRaf.current = null;
      const pending = pendingSelection.current;
      if (pending != null) setSelectionRef.current(pending, null, true);
    });
  };

  useEffect(() => () => {
    if (selectionRaf.current != null) cancelAnimationFrame(selectionRaf.current);
  }, []);

  const chartBox = useRef<{ y: number; height: number } | null>(null);
  const markersBox = useRef<{ y: number; height: number } | null>(null);
  const plotW = useRef(W);
  plotW.current = W;
  const scrubPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / plotW.current));
        setSelectionRef.current(Math.round(frac * (N - 1)), null, true);
      },
      onPanResponderMove: (e) => {
        const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / plotW.current));
        scheduleDragSelection(Math.round(frac * (N - 1)));
      },
      onPanResponderRelease: () => {
        const pending = pendingSelection.current;
        if (pending != null) {
          setSelectionRef.current(pending, null, false);
          syncSelectionToParent(Math.max(0, Math.min(N - 1, pending)), true);
        }
      },
      onPanResponderTerminate: () => {
        const pending = pendingSelection.current;
        if (pending != null) syncSelectionToParent(Math.max(0, Math.min(N - 1, pending)), true);
      },
    })
  ).current;

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
    const items: { label: string; destructive?: boolean; onPress: () => void }[] = [
      { label: t('journey.elevation.actionExport'), onPress: exportGpx },
    ];
    if (isMine) {
      items.push(
        { label: t('journey.elevation.actionReupload'), onPress: () => { onClose?.(); nav.openAddRoute(); } },
        {
          label: t('journey.elevation.actionDelete'), destructive: true,
          onPress: () => {
            Alert.alert(t('journey.elevation.deleteTitle'), t('journey.elevation.deleteMessage'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.confirm'), style: 'destructive', onPress: () => {
                nav.patchCurrent({ trackCoords: undefined, trackElevation: undefined, trackDurationMs: undefined, trackWaypoints: undefined });
                onClose?.();
              }},
            ]);
          },
        },
      );
    }
    nav.openActionSheet({ items });
  };

  return (
    <View
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
      onStartShouldSetResponderCapture={(e) => {
        const y = e.nativeEvent.locationY;
        const inBox = (box: { y: number; height: number } | null) => !!box && y >= box.y && y <= box.y + box.height;
        if (!inBox(chartBox.current) && !inBox(markersBox.current)) setSelection(null);
        return false;
      }}
    >
      {showActions ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8, paddingHorizontal: showMap ? contentPaddingHorizontal : 0 }}>
          <Press onPress={onMore}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{t('journey.section.more')}</Text>
          </Press>
        </View>
      ) : null}

      {showMap && hasMap && (
        <Press onPress={() => setMapFull(true)} style={{ paddingHorizontal: contentPaddingHorizontal }}>
          <TrackMap coords={coords} theme={theme} height={232} scrubPt={showScrub ? scrubCoord : undefined} accent={ac} />
        </Press>
      )}

      <View
        onLayout={(e) => { chartBox.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }; }}
        style={{ paddingHorizontal: contentPaddingHorizontal, paddingTop: showMap && hasMap ? 14 : 2 }}
      >
        <View
          onLayout={(e) => { plotW.current = e.nativeEvent.layout.width; }}
          {...scrubPan.panHandlers}
          style={{ position: 'relative', width: W, height: PLOT_H }}
        >
          <Svg width={W} height={PLOT_H} viewBox={`0 0 ${W} ${PLOT_H}`}>
            <Defs>
              <LinearGradient id={`rtElevFill-${info.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ac} stopOpacity={0.3} />
                <Stop offset="1" stopColor={ac} stopOpacity={0.02} />
              </LinearGradient>
              <ClipPath id={`rtDone-${info.id}`}>
                <Rect x="0" y="0" width={scrubX} height={PLOT_H} />
              </ClipPath>
            </Defs>
            {yTicks.map((tk, i) => (
              <Line key={i} x1={0} y1={tk.y} x2={W} y2={tk.y} stroke={theme.hairline} strokeWidth={1} strokeDasharray={i === yTicks.length - 1 ? '0' : '2 4'} />
            ))}
            <Path d={area} fill={`url(#rtElevFill-${info.id})`} opacity={0.5} />
            {showScrub && <Path d={area} fill={`url(#rtElevFill-${info.id})`} clipPath={`url(#rtDone-${info.id})`} />}
            <Path d={line} fill="none" stroke={ac} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            <WaypointDots positions={dotPositions} fill={theme.bg} stroke={ac} />
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>0 km</Text>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>{(totalKm / 2).toFixed(1)} km</Text>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, letterSpacing: 0.3 }}>{totalKm.toFixed(1)} km</Text>
        </View>
        <Text style={{ fontSize: 11.5, color: theme.text3, marginTop: 12, textAlign: 'center' }}>
          {t('journey.elevation.scrubHint')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: contentPaddingHorizontal, paddingTop: 18 }}>
        <Stat theme={theme} value={fmt(maxEle)} unit="m" label={t('journey.elevation.max')} />
        <Stat theme={theme} value={fmt(minEle)} unit="m" label={t('journey.elevation.min')} />
        <Stat theme={theme} value={`+${fmt(series.ascent)}`} unit="m" label={t('journey.elevation.ascent')} color={ac} />
        <Stat theme={theme} value={`−${fmt(series.descent)}`} unit="m" label={t('journey.elevation.descent')} />
      </View>

      {waypoints.length > 0 && (
        <View
          onLayout={(e) => { markersBox.current = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height }; }}
          style={{ marginTop: 20, paddingHorizontal: contentPaddingHorizontal, paddingBottom: bottomPadding }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text2, letterSpacing: 0.8 }}>
              {t('journey.elevation.markers')}
            </Text>
            <View style={{
              minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
              backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.text3 }}>{waypointCountLabel}</Text>
            </View>
          </View>
          <View style={{
            borderRadius: 14, overflow: 'hidden',
            backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline,
          }}>
            {waypoints.map((w, i) => (
              <MarkerRow
                key={i}
                theme={theme}
                label={i + 1}
                name={w.name}
                km={w.km}
                ele={w.ele}
                active={i === highlightWpIdx}
                index={i}
                waypointIndex={w.i}
                onPress={handleMarkerPress}
                showDivider={i < waypoints.length - 1}
              />
            ))}
          </View>
        </View>
      )}

      {mapFull && hasMap ? (
        <FullscreenTrackMap
          theme={theme}
          info={info}
          coords={coords}
          totalKm={totalKm}
          maxEle={maxEle}
          accent={ac}
          onClose={() => setMapFull(false)}
        />
      ) : null}
    </View>
  );
}
