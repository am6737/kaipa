// TrackDetailPage.tsx — one library track.
//
// The map owns the whole screen and the track's story is pulled up over it in a
// three-detent sheet, after the recording page: the lowest detent is the grab
// handle, the name and one row of headline numbers; the middle adds the
// elevation curve; fully open adds everything the file carries — meta line,
// measures grid, the journeys that use it, the file rows and (on Android) the
// offline map. Marks are never a list: a track can carry far too many. They are
// numbered on the map and above the curve, and tapping one lifts a card under
// the sheet that steps through them in distance order.
//
// Following the track and applying it to a journey are the page's actions, in
// the footer; settings (name, publishing), export and delete sit in the ⋯ menu.
//
// Someone else's published track opens here too, read-only: given an `owner`,
// the page drops everything that edits the track or ties it to a journey and
// names the uploader instead. Following it and exporting it stay.
//
// Nothing here is synthesized: a file without elevation shows no curve and
// says so, rather than a plausible invented one.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionDialog, layout, motion, radius, space, type } from '../../design-system';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Press';
import { useData } from '../../data/DataContext';
import { buildElevation } from '../../data/elevation';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { Theme } from '../../theme/theme';
import { Track } from '../../data/tracks';
import { formatTrackAscent, formatTrackDistance } from '../../lib/trackParser';
import { formatClock, splitDistance } from '../../lib/trailGeo';
import { measureTrack, positionAtDistance } from '../../lib/routeSegments';
import { exportTrack } from '../../lib/trackExport';
import { removeMedia } from '../../lib/storage';
import { MAP_CONTROL_SIZE, MapControlButton, MapControlGroup } from '../MapControls';
import { MapStylePickerSheet, type MapPresentationStyle } from '../MapStylePickerSheet';
import { TrailSheet, type TrailSheetHandle } from '../Sheet';
import { MarkDetail, type MarkDetailItem } from '../trail/MarkDetail';
import { ensureNativeMapReady, TrackMap, type TrackMapHandle } from '../overlays/TrackMap';
import { useMapPresentation } from '../maps/MapPresentationContext';
import { OfflineMapRow } from '../maps/OfflineMapRow';
import { trackToPoi } from './trackToPoi';
import { PickDialog } from './PickDialog';
import { TrailControlButton } from '../trail/TrailControlButton';
import { TrackProfile, type TrackProfileMark } from './TrackProfile';
import { TrackSettingsPage } from './TrackSettingsPage';
import { FloatingMenu, MenuRow } from '../gear/GearItemsList';
import { usePendingMenuAction } from '../gear/GearMenuTransition';
import { Avatar } from '../Avatar';
import type { PublishedTrackOwner } from '../../hooks/useSocial';
import { trailRouteFromTrack, useOpenTrail } from '../../trail/trailRoutes';
import { regionLabel } from '../../lib/regionLabel';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Distance along the line at every vertex, so a distance picked on the curve
// lands on the right spot of the map even where the points are unevenly spaced.
function cumulativeKm(coords: [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    out.push(out[i - 1] + 12742 * Math.asin(Math.min(1, Math.sqrt(a))));
  }
  return out;
}

// The profile and the line measure distance slightly differently, so the
// picked distance is taken as a share of the profile's length.
function coordAtKm(coords: [number, number][], cum: number[], km: number, profileKm: number): [number, number] | undefined {
  if (coords.length < 2) return coords[0];
  const lineKm = cum[cum.length - 1];
  const target = Math.max(0, Math.min(lineKm, profileKm > 0 ? (km / profileKm) * lineKm : km));
  let a = 0;
  let b = cum.length - 1;
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    if (cum[mid] < target) a = mid; else b = mid;
  }
  const span = cum[b] - cum[a];
  const f = span > 0 ? (target - cum[a]) / span : 0;
  return [coords[a][0] + (coords[b][0] - coords[a][0]) * f, coords[a][1] + (coords[b][1] - coords[a][1]) * f];
}

function formatDay(iso: string | undefined, resolved: 'zh' | 'en') {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (resolved === 'zh') return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

type Measure = { key: string; label: string; value: string; unit?: string };

function MeasureCell({ theme, measure }: { theme: Theme; measure: Measure }) {
  return (
    <View style={{ width: '33.33%', paddingVertical: space.sm, paddingHorizontal: space.md }}>
      <Text numberOfLines={1} style={[type.caption, { color: theme.text2 }]}>{measure.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: space.xxs }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[type.metric, { color: theme.text, flexShrink: 1, fontVariant: ['tabular-nums'] }]}>{measure.value}</Text>
        {measure.unit ? <Text style={[type.caption, { color: theme.text2 }]}>{measure.unit}</Text> : null}
      </View>
    </View>
  );
}

function SectionTitle({ theme, text, count }: { theme: Theme; text: string; count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: layout.sectionGap, marginBottom: space.md }}>
      <Text style={[type.sectionTitle, { color: theme.text }]}>{text}</Text>
      {count != null ? <Text style={[type.metric, { fontSize: 13, color: theme.text3 }]}>{count}</Text> : null}
    </View>
  );
}

// The back and ⋯ controls over a map: a bare icon with no disc behind it, kept
// legible over any tiles by a light halo rather than a plate.
function HaloIconButton({ theme, icon, onPress, accessibilityLabel }: { theme: Theme; icon: IconName; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        width: layout.iconButton,
        height: layout.iconButton,
        alignItems: 'center',
        justifyContent: 'center',
        // The glyph is an SVG, so the halo is a shadow on the subtree. iOS draws
        // a layer shadow from the content's alpha when the view itself is
        // transparent; Android needs the drop-shadow filter for the same.
        ...Platform.select({
          ios: { shadowColor: theme.dark ? '#000000' : '#FFFFFF', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.95, shadowRadius: 3 },
          default: { filter: theme.dark ? 'drop-shadow(0px 1px 3px rgba(0,0,0,0.9))' : 'drop-shadow(0px 1px 3px rgba(255,255,255,0.95))' },
        }),
      }}
    >
      <Icon name={icon} size={26} color={theme.text} strokeWidth={2.4} />
    </Press>
  );
}

function StatChip({ theme, icon, value, unit }: { theme: Theme; icon: IconName; value: string; unit?: string }) {
  const empty = value === '--';
  return (
    <View accessible accessibilityLabel={`${value}${unit ? ` ${unit}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
        <Icon name={icon} size={15} color={theme.text2} strokeWidth={2} />
        <Text style={[type.metric, { fontSize: 15, color: empty ? theme.text3 : theme.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{value}</Text>
        {empty || !unit ? null : <Text style={[type.caption, { color: theme.text2 }]}>{unit}</Text>}
      </View>
    </View>
  );
}

export function TrackDetailPage({
  theme,
  track,
  onBack,
  entryVariant = 'push',
  owner,
}: {
  theme: Theme;
  track: Track;
  onBack: () => void;
  entryVariant?: 'push' | 'continuationX' | 'continuationY';
  /** Someone else's published track: shown read-only, with its uploader. */
  owner?: PublishedTrackOwner;
}) {
  const { t, resolved } = useI18n();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const data = useData();
  const { mapStyle, setMapStyle } = useMapPresentation();
  ensureNativeMapReady();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const readOnly = owner != null;
  // The route card's display switches: kilometre labels and the marks.
  const [layersOpen, setLayersOpen] = useState(false);
  const [distanceMarkersVisible, setDistanceMarkersVisible] = useState(true);
  const [marksVisible, setMarksVisible] = useState(true);
  // Place in the distance-ordered mark list; the map numbers, the curve badges
  // and the card all count in this same order.
  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  // Distance picked by dragging the curve; null while nothing is scrubbing.
  const [scrubKm, setScrubKm] = useState<number | null>(null);
  const [selectedPt, setSelectedPt] = useState<[number, number] | null>(null);
  // Matches the sheet's initialIndex: a track with no line opens fully.
  const [sheetIndex, setSheetIndex] = useState(() => ((track.coords?.length ?? 0) >= 2 ? 1 : 2));
  const [chartW, setChartW] = useState(window.width - space.xl * 2);
  // Measured, so each detent ends exactly under its own content.
  const [headerH, setHeaderH] = useState(96);
  const [chartH, setChartH] = useState(300);
  const trackMapRef = useRef<TrackMapHandle>(null);
  const sheetRef = useRef<TrailSheetHandle>(null);

  const entryX = useRef(new Animated.Value(entryVariant === 'continuationX' ? 52 : entryVariant === 'push' ? window.width : 0)).current;
  const entryY = useRef(new Animated.Value(entryVariant === 'continuationY' ? 44 : 0)).current;
  const entryOpacity = useRef(new Animated.Value(entryVariant === 'push' ? 1 : 0.92)).current;
  const sheetY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (entryVariant === 'push') {
      Animated.spring(entryX, { toValue: 0, useNativeDriver: true, ...motion.pageSpring }).start();
      return;
    }
    Animated.parallel([
      Animated.timing(entryX, { toValue: 0, duration: motion.standard, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      Animated.timing(entryY, { toValue: 0, duration: motion.standard, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      Animated.timing(entryOpacity, { toValue: 1, duration: motion.quick, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // The values are stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const info = useMemo(() => trackToPoi(track), [track]);
  const series = useMemo(() => buildElevation(info, { synthesize: false }), [info]);
  const followRoute = useMemo(() => trailRouteFromTrack(track), [track]);
  const openTrail = useOpenTrail();
  const linkedJourneys = useMemo(() => data.journeys.filter((journey) => journey.trackId === track.id), [data.journeys, track.id]);

  const coords = track.coords ?? [];
  const hasMap = coords.length >= 2;
  const hasProfile = series.pts.length >= 2;
  const cum = useMemo(() => cumulativeKm(coords), [coords]);
  const profileKm = hasProfile ? series.totalKm : (track.distM ?? 0) / 1000;
  const recorded = !track.fileName && !track.fileUrl;

  // Every spot on the track that can be put on the map, in the order a walker
  // meets them. MarkDetail opens on any of them; the ones marked while walking
  // also carry their photo and time. The map numbers, the badges above the
  // curve and the card all count in this order, so number 7 is one place.
  // An imported file's waypoints carry only their distance along the line, so
  // they sit on the line at that distance, as they do when following it.
  const lineMeasure = useMemo(() => measureTrack(coords), [coords]);
  const marks = useMemo<MarkDetailItem[]>(() => (track.waypoints ?? [])
    .flatMap((waypoint, index) => {
      const coord = waypoint.lng != null && waypoint.lat != null
        ? [waypoint.lng, waypoint.lat]
        : lineMeasure ? positionAtDistance(lineMeasure, waypoint.km * 1000).coordinate : null;
      return coord ? [{
        key: String(index),
        name: waypoint.name,
        photo: waypoint.photo,
        at: waypoint.at,
        alongM: waypoint.km * 1000,
        lng: coord[0],
        lat: coord[1],
        ele: waypoint.ele ?? (hasProfile ? series.pts[Math.round((waypoint.km / (series.totalKm || 1)) * (series.pts.length - 1))]?.ele ?? null : null),
      }] : [];
    })
    .sort((a, b) => (a.alongM ?? 0) - (b.alongM ?? 0)), [track.waypoints, lineMeasure, hasProfile, series]);
  // The map numbers badges by its own array order, so it gets the same list.
  const waypoints = useMemo(() => marks.flatMap((mark) => (mark.lng != null && mark.lat != null ? [{
    name: mark.name,
    km: (mark.alongM ?? 0) / 1000,
    coord: [mark.lng, mark.lat] as [number, number],
  }] : [])), [marks]);
  // The curve plots badges by distance, so each mark keeps its own sample height
  // when the waypoint carries none.
  const profileMarks = useMemo<TrackProfileMark[]>(() => marks.map((mark, position) => ({
    index: position,
    km: (mark.alongM ?? 0) / 1000,
    ele: mark.ele ?? series.pts[Math.round(((mark.alongM ?? 0) / 1000 / (series.totalKm || 1)) * (series.pts.length - 1))]?.ele ?? 0,
  })), [marks, series]);
  const selectedMark = selectedPos != null ? marks[selectedPos] ?? null : null;

  // ─── sheet detents ────────────────────────────────────────────────────────
  const footerBar = space.sm + 48 + space.sm + insets.bottom;
  const topChrome = insets.top + space.xs + MAP_CONTROL_SIZE;
  // Measured, so every detent ends exactly under its own content. headerH comes
  // from the sheet and already carries the grab handle; chartH is the curve.
  const snapHeights = useMemo<[number, number, number]>(() => [
    Math.round(headerH + space.md),
    Math.round(Math.max(headerH + space.md + 40, headerH + chartH + space.md + footerBar)),
    Math.round(Math.max(headerH + chartH + footerBar + 40, window.height - topChrome - space.sm)),
  ], [headerH, chartH, footerBar, topChrome, window.height]);
  // The map frames for the middle detent, the height the sheet spends its life at.
  const routePadding = useMemo<[number, number, number, number]>(
    () => [topChrome + space.lg, 40, snapHeights[1] + space.lg, 40],
    [topChrome, snapHeights],
  );
  // The detents are guesses until the sheet has measured its own content, so the
  // route is fitted again once the middle one settles at its real height.
  useEffect(() => {
    if (!hasMap) return undefined;
    const id = setTimeout(() => trackMapRef.current?.fitRoute(), 240);
    return () => clearTimeout(id);
  }, [hasMap, snapHeights[1]]);

  const scrubCoord = useMemo((): [number, number] | undefined => {
    if (!hasMap) return undefined;
    if (selectedMark?.lng != null && selectedMark.lat != null) return [selectedMark.lng, selectedMark.lat];
    return selectedPt ?? undefined;
  }, [hasMap, selectedMark, selectedPt]);

  const dist = splitDistance(track.distM);
  const hasDist = track.distM != null;
  const hasAsc = track.ascM != null || hasProfile;
  const ascValue = track.ascM ?? series.ascent;
  const hasDesc = hasProfile && series.descent > 0;
  const descValue = series.descent;

  const measures: Measure[] = [];
  if (track.durationMs) measures.push({ key: 'duration', label: t('tracks.detail.duration'), value: formatClock(track.durationMs) });
  if (track.durationMs && track.distM) {
    const kmh = track.distM / 1000 / (track.durationMs / 3_600_000);
    if (Number.isFinite(kmh) && kmh > 0) measures.push({ key: 'speed', label: t('tracks.detail.avgSpeed'), value: kmh.toFixed(1), unit: 'km/h' });
  }
  measures.push({ key: 'descent', label: t('tracks.detail.descent'), value: hasDesc ? fmt(descValue) : '--', unit: hasDesc ? 'm' : undefined });
  measures.push({ key: 'max', label: t('tracks.detail.maxEle'), value: hasProfile ? fmt(series.maxEle) : '--', unit: hasProfile ? 'm' : undefined });
  measures.push({ key: 'min', label: t('tracks.detail.minEle'), value: hasProfile ? fmt(series.minEle) : '--', unit: hasProfile ? 'm' : undefined });
  if (track.pointCount) measures.push({ key: 'points', label: t('tracks.detail.points'), value: fmt(track.pointCount) });

  const when = track.startedAt ?? track.createdAt;
  const sourceLabel = recorded
    ? t('tracks.detail.sourceRecorded')
    : t('tracks.detail.sourceImported', { format: (track.fileFormat ?? 'gpx').toUpperCase() });

  const midVisible = sheetIndex >= 1;
  const fullOpen = sheetIndex >= 2;
  const midOpacity = sheetY.interpolate({
    inputRange: [snapHeights[2] - snapHeights[1], snapHeights[2] - snapHeights[0]],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fullOpacity = sheetY.interpolate({
    inputRange: [0, snapHeights[2] - snapHeights[1]],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // Both the control column and the mark card ride the sheet from its fully
  // open height, and fade out as it closes back over the map.
  const rideOpacity = sheetY.interpolate({
    inputRange: [(snapHeights[2] - snapHeights[1]) / 2, snapHeights[2] - snapHeights[1]],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ─── selection ────────────────────────────────────────────────────────────
  // Picking a mark, on the map or the curve, opens it in MarkDetail as the
  // route page and the walk do; the map and the curve keep it highlighted, and
  // follow as the sheet is swiped to the next one.
  const [openMark, setOpenMark] = useState<number | null>(null);
  const highlightMark = useCallback((pos: number | null) => {
    setSelectedPos(pos);
    setScrubKm(null);
    const mark = pos != null ? marks[pos] : undefined;
    setSelectedPt(mark?.lng != null && mark.lat != null ? [mark.lng, mark.lat] : null);
  }, [marks]);
  const selectMark = useCallback((pos: number | null) => {
    highlightMark(pos);
    setOpenMark(pos);
    // A mark is looked at on the map, not buried under a fully open sheet.
    if (pos != null && sheetIndex >= 2) sheetRef.current?.snapTo(1);
  }, [highlightMark, sheetIndex]);

  const scrub = useCallback((km: number | null) => {
    setSelectedPos(null);
    setScrubKm(km);
    setSelectedPt(km == null ? null : coordAtKm(coords, cum, km, profileKm) ?? null);
  }, [coords, cum, profileKm]);

  const renameMark = (item: MarkDetailItem, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !track.waypoints) return;
    void data.updateTrack(track.id, { waypoints: track.waypoints.map((waypoint, index) => (String(index) === item.key ? { ...waypoint, name: trimmed } : waypoint)) }).then((ok) => {
      if (!ok) nav.showToast(t('trail.mark.editFailed'));
    });
  };
  const deleteMark = (item: MarkDetailItem) => {
    if (!track.waypoints) return;
    setSelectedPos(null);
    setScrubKm(null);
    setSelectedPt(null);
    void data.updateTrack(track.id, { waypoints: track.waypoints.filter((_, index) => String(index) !== item.key) }).then((ok) => {
      // The photo goes only once nothing points at it any more.
      if (!ok) {
        nav.showToast(t('trail.mark.editFailed'));
        return;
      }
      nav.showToast(t('trail.mark.deleted'));
      if (item.photo && /^https?:/i.test(item.photo)) void removeMedia([item.photo]).catch(() => undefined);
    });
  };

  const exportGpx = () => {
    if (!(track.coords?.length || track.fileUrl)) return;
    void exportTrack(track).catch((error) => {
      if (error?.message !== 'User did not share') console.warn('[TrackDetailPage] export failed:', error);
    });
  };

  const applyTo = async (journeyId: string, journeyName: string) => {
    setApplyOpen(false);
    setBusy(true);
    // The journey's display strings are derived from the track's numbers, so the
    // card matches the file the moment the link is made.
    await data.updateJourney(journeyId, {
      trackId: track.id,
      ...(track.distM != null ? { dist: formatTrackDistance(track.distM) } : {}),
      ...(track.ascM != null ? { asc: formatTrackAscent(track.ascM) } : {}),
    });
    setBusy(false);
    nav.showToast(t('tracks.apply.done', { name: journeyName }));
  };

  const canExport = Boolean(track.coords?.length || track.fileUrl);
  // The card finishes closing before the action runs: the export share sheet
  // never appears on iOS if it is presented while the menu is still dismissing.
  const menuAction = usePendingMenuAction();
  const closeMoreThen = (action: () => void) => {
    menuAction.run(action);
    setMoreOpen(false);
  };

  const confirmDelete = async () => {
    setBusy(true);
    await data.deleteTracks([track.id]);
    setBusy(false);
    setDeleteOpen(false);
    onBack();
  };

  // ─── sheet content ────────────────────────────────────────────────────────
  // TrailSheet draws only the grab handle; the header brings its own inset,
  // the same as the body below it.
  const sheetHeader = (
    <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
      <Text numberOfLines={2} style={[type.pageTitle, { fontSize: 20, lineHeight: 28, letterSpacing: -0.4, color: theme.text }]}>{track.name || t('tracks.untitled')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs, marginTop: space.sm }}>
        <StatChip theme={theme} icon="distance" value={hasDist ? dist.value : '--'} unit={dist.unit} />
        <StatChip theme={theme} icon="arrowUp" value={hasAsc ? fmt(ascValue) : '--'} unit="m" />
        <StatChip theme={theme} icon="arrowDown" value={hasDesc ? fmt(descValue) : '--'} unit="m" />
        {track.durationMs ? <StatChip theme={theme} icon="clock" value={formatClock(track.durationMs)} /> : null}
      </View>
    </View>
  );

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.fieldSurface, opacity: entryOpacity, transform: [{ translateX: entryX }, { translateY: entryY }] },
      ]}
    >
      {hasMap ? (
        <TrackMap
          ref={trackMapRef}
          coords={coords}
          theme={theme}
          accent={theme.accent}
          fill
          rounded={false}
          showLegend={false}
          interactive
          scrubPt={scrubCoord}
          waypoints={waypoints}
          showWaypoints={marksVisible}
          showDistanceMarkers={distanceMarkersVisible}
          numberWaypoints
          routeStyleWaypoints
          showWaypointCallout={false}
          selectedWaypointIndex={selectedPos}
          onWaypointPress={(_waypoint, index) => selectMark(index)}
          onMapPress={() => selectMark(null)}
          mapStyle={mapStyle}
          routePadding={routePadding}
        />
      ) : null}

      {/* Top chrome: bare icons with a halo, no disc behind them. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space.xs, left: space.sm, right: space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <HaloIconButton theme={theme} icon="chevronL" onPress={onBack} accessibilityLabel={t('common.back')} />
          {readOnly && !canExport ? null : <HaloIconButton theme={theme} icon="more" onPress={() => setMoreOpen(true)} accessibilityLabel={t('journey.section.more')} />}
        </View>
      </View>

      {/* Map controls, floating just above the sheet, fading out as the sheet
          nears the top detent. */}
      <Animated.View
        pointerEvents={fullOpen ? 'none' : 'box-none'}
        style={{
          position: 'absolute',
          right: space.md,
          bottom: snapHeights[2] + space.md,
          transform: [{ translateY: sheetY }],
          opacity: hasMap ? rideOpacity : 0,
        }}
      >
        <MapControlGroup theme={theme}>
          <MapControlButton
            theme={theme}
            icon="layers"
            active={layersOpen}
            onPress={() => setLayersOpen(true)}
            accessibilityLabel={t('trail.action.layers')}
          />
          <MapControlButton
            theme={theme}
            icon="expand"
            onPress={() => trackMapRef.current?.fitRoute()}
            accessibilityLabel={t('tracks.detail.fitRoute')}
          />
        </MapControlGroup>
      </Animated.View>

      <TrailSheet
        ref={sheetRef}
        theme={theme}
        snapHeights={snapHeights}
        initialIndex={hasMap ? 1 : 2}
        onIndexChange={setSheetIndex}
        header={sheetHeader}
        dismissOnDrag={false}
        backgroundColor={theme.featureSurface}
        borderless
        animatedTranslateY={sheetY}
        onHeaderHeightChange={setHeaderH}
        bottomAccessory={(
          // Gone at the lowest detent, where the sheet is just the name and the
          // numbers over the map; it slides back in as the sheet rises to the
          // middle. The transform is always carried, only its output changes.
          <Animated.View
            pointerEvents={sheetIndex === 0 ? 'none' : 'auto'}
            style={{
              flexDirection: 'row',
              gap: space.sm,
              paddingHorizontal: space.xl,
              paddingTop: space.sm,
              paddingBottom: insets.bottom + space.sm,
              backgroundColor: theme.featureSurface,
              transform: [{
                translateY: sheetY.interpolate({
                  inputRange: [snapHeights[2] - snapHeights[1], snapHeights[2] - snapHeights[0]],
                  outputRange: [0, footerBar],
                  extrapolate: 'clamp',
                }),
              }],
            }}
          >
            {readOnly ? null : <TrailControlButton theme={theme} icon="journey" label={t('tracks.action.apply')} onPress={() => setApplyOpen(true)} />}
            {followRoute ? <TrailControlButton theme={theme} icon="play" label={t('trail.entry.followTrack')} primary grow={1.45} onPress={() => openTrail(followRoute)} /> : null}
          </Animated.View>
        )}
        containerStyle={{ borderTopLeftRadius: radius.showcase, borderTopRightRadius: radius.showcase, boxShadow: theme.dark ? '0px -2px 16px rgba(0,0,0,0.4)' : '0px -2px 16px rgba(0,0,0,0.08)' }}
      >
        <View style={{ paddingHorizontal: space.xl }} onLayout={(event) => setChartW(event.nativeEvent.layout.width - space.xl * 2)}>
          <View onLayout={(event) => setChartH(event.nativeEvent.layout.height)}>
            <Animated.View pointerEvents={midVisible ? 'auto' : 'none'} style={{ opacity: midOpacity }}>
              {hasProfile ? (
                <View style={{ paddingTop: space.md }}>
                  <TrackProfile
                    theme={theme}
                    series={series}
                    width={chartW}
                    marks={marksVisible ? profileMarks : undefined}
                    selectedMarkIndex={selectedPos}
                    onSelectMark={selectMark}
                    selectedKm={scrubKm}
                    onSelect={scrub}
                  />
                </View>
              ) : (
                <Text style={[type.body, { color: theme.text2, paddingTop: space.md }]}>{t('tracks.detail.noElevation')}</Text>
              )}
            </Animated.View>
          </View>

          <Animated.View pointerEvents={fullOpen ? 'auto' : 'none'} style={{ opacity: fullOpacity }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: space.xxs, marginTop: space.xl }}>
              {when ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                  <Icon name="calendar" size={13} color={theme.text3} strokeWidth={2} />
                  <Text style={[type.meta, { color: theme.text2 }]}>{formatDay(when, resolved)}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
                <Icon name={recorded ? 'record' : 'upload'} size={13} color={theme.text3} strokeWidth={2} />
                <Text style={[type.meta, { color: theme.text2 }]}>{sourceLabel}</Text>
              </View>
              {marks.length ? (
                <Press accessibilityRole="button" onPress={() => { setMarksVisible(true); selectMark(0); }} style={{ minHeight: layout.fieldHeight, justifyContent: 'center' }}>
                  <Text style={[type.meta, { color: theme.accent, fontWeight: '700' }]}>{t('tracks.detail.marksLink', { count: marks.length })}</Text>
                </Press>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.md, marginHorizontal: -space.xs, paddingVertical: space.xxs, borderRadius: radius.feature, backgroundColor: theme.fieldSurface }}>
              {measures.map((measure) => <MeasureCell key={measure.key} theme={theme} measure={measure} />)}
            </View>

            {owner ? (
              <>
                <SectionTitle theme={theme} text={t('tracks.detail.uploader')} />
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={owner.nick}
                  onPress={() => nav.openUserProfile(owner.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.listRowMinHeight }}
                >
                  <Avatar uri={owner.avatarUrl ?? undefined} size={40} />
                  <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, flex: 1, minWidth: 0 }]}>{owner.nick || t('tracks.detail.uploaderUnnamed')}</Text>
                  <Icon name="chevronR" size={16} color={theme.text3} strokeWidth={2.2} />
                </Press>
              </>
            ) : null}

            {readOnly ? null : <SectionTitle theme={theme} text={t('tracks.detail.journeys')} count={linkedJourneys.length || undefined} />}
            {readOnly ? null : linkedJourneys.length ? linkedJourneys.map((journey) => (
              <Press
                key={journey.id}
                accessibilityRole="button"
                accessibilityLabel={journey.name}
                onPress={() => {
                  onBack();
                  nav.openPoint(journey);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.listRowMinHeight }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{journey.name}</Text>
                  {journey.region || journey.date ? (
                    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 3 }}>
                      {journey.region ? <Text numberOfLines={1} style={[type.caption, { color: theme.text2, flexShrink: 1 }]}>{regionLabel(journey.region)}</Text> : null}
                      {journey.date ? <Text numberOfLines={1} style={[type.caption, { color: theme.text3 }]}>{journey.date}</Text> : null}
                    </View>
                  ) : null}
                </View>
                <Icon name="chevronR" size={16} color={theme.text3} strokeWidth={2.2} />
              </Press>
            )) : (
              <View>
                <Text style={[type.body, { color: theme.text2 }]}>{t('tracks.detail.journeysEmpty')}</Text>
                <Press accessibilityRole="button" onPress={() => setApplyOpen(true)} style={{ minHeight: layout.iconButton, justifyContent: 'center', alignSelf: 'flex-start' }}>
                  <Text style={[type.chatAction, { color: theme.accent }]}>{t('tracks.action.apply')}</Text>
                </Press>
              </View>
            )}

            {/* Android only, and OfflineMapRow returns null by itself elsewhere. */}
            {Platform.OS === 'android' ? <OfflineMapRow theme={theme} /> : null}
            {/* TrailSheet already pads the scroll bottom clear of the home
                indicator; this covers only what the footer pills add. */}
            <View style={{ height: footerBar - (24 + insets.bottom) }} />
          </Animated.View>
        </View>
      </TrailSheet>

      <MarkDetail
        theme={theme}
        items={marks}
        index={openMark}
        onClose={() => selectMark(null)}
        onPageChange={highlightMark}
        onRename={readOnly ? undefined : renameMark}
        onDelete={readOnly ? undefined : deleteMark}
      />


      <PickDialog
        theme={theme}
        visible={applyOpen}
        title={t('tracks.apply.title')}
        emptyLabel={t('tracks.apply.empty')}
        cancelLabel={t('common.cancel')}
        options={data.journeys.map((journey) => ({
          item: journey,
          title: journey.name,
          subtitle: [regionLabel(journey.region), journey.date].filter(Boolean) as string[],
          selected: journey.trackId === track.id,
        }))}
        onCancel={() => setApplyOpen(false)}
        onSelect={(journey) => {
          if (journey.trackId === track.id) {
            setApplyOpen(false);
            nav.showToast(t('tracks.apply.alreadyThere', { name: journey.name }));
            return;
          }
          void applyTo(journey.id, journey.name);
        }}
      />

      <AppActionDialog
        theme={theme}
        visible={deleteOpen}
        title={t('tracks.detail.deleteTitle', { name: track.name })}
        message={t('tracks.detail.deleteMessage')}
        confirmLabel={t('tracks.action.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        confirming={busy}
        confirmIcon="trash"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />

      {layersOpen ? (
        <MapStylePickerSheet
          theme={theme}
          title={t('journey.map.layerTitle')}
          closeLabel={t('common.close')}
          options={([
            { id: 'standard', label: t('journey.map.layerStandard') },
            { id: 'satellite', label: t('journey.map.layerSatellite') },
          ] satisfies { id: MapPresentationStyle; label: string }[])}
          value={mapStyle}
          detailSections={[{
            id: 'track-display',
            title: t('journey.map.routeTracksTitle'),
            options: [
              {
                id: 'distance-markers',
                label: t('journey.map.trackDistanceMarkers'),
                value: distanceMarkersVisible,
                onChange: setDistanceMarkersVisible,
              },
              ...(marks.length ? [{
                id: 'track-marks',
                label: t('journey.map.trackWaypointMarkers'),
                value: marksVisible,
                onChange: (visible: boolean) => {
                  // The highlight and the badges go with the marks they point at.
                  if (!visible) selectMark(null);
                  setMarksVisible(visible);
                },
              }] : []),
            ],
          }]}
          bottomInset={insets.bottom}
          onChange={setMapStyle}
          onClose={() => setLayersOpen(false)}
        />
      ) : null}
      <FloatingMenu theme={theme} visible={moreOpen} top={insets.top + space.xs + MAP_CONTROL_SIZE + space.xs} width={Math.min(232, window.width - space.sm * 2)} onClose={() => { menuAction.cancel(); setMoreOpen(false); }} onClosed={menuAction.onClosed}>
        {readOnly ? null : <MenuRow theme={theme} icon="gearSettings" label={t('tracks.settings.title')} onPress={() => closeMoreThen(() => setSettingsOpen(true))} />}
        {canExport ? <MenuRow theme={theme} icon="download" label={t('tracks.action.export')} onPress={() => closeMoreThen(exportGpx)} /> : null}
        {readOnly ? null : <MenuRow theme={theme} icon="trash" label={t('tracks.action.delete')} destructive onPress={() => closeMoreThen(() => setDeleteOpen(true))} />}
      </FloatingMenu>
      {settingsOpen && !readOnly ? <TrackSettingsPage theme={theme} track={track} onBack={() => setSettingsOpen(false)} /> : null}
    </Animated.View>
  );
}
