// ElevationProfile.tsx — the one elevation chart the app draws: the route
// sheet's 海拔 card and a track page's curve are the same component.
//
// The named spots sit in a row above the plot, each with a dashed drop line to
// its place on the curve; a badge that would land on another is left out, so a
// line with many marks stays readable, and every mark is still on the map. The
// curve and the fill under it are coloured by how steep the ground is — flat
// green through to severe red — with a legend naming the bands, over a dashed
// height grid and a row of distance ticks.
//
// Two ways to look along a line, and one way not to. Pulling the curve sideways
// scrubs any point: the readout above follows it and the page puts a marker on
// the map there. The drag only takes the gesture once it is sideways, so a
// finger that starts on the curve can still scroll the sheet. Badges are taps
// and never part of a drag: on a track they select the mark. The chart follows
// the finger every frame; the page hears about it at a lower rate, because
// moving a native map marker costs far more than redrawing an SVG.
// `interactive={false}` is the third way — a route sheet reads its own track
// page for that, so here the chart is a picture: no scrub, no readout, and the
// badges show their numbers without being pressable, leaving the whole card to
// one tap.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import type { ElevSeries } from '../../data/elevation';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

const PLOT_H = 150;
const LANE_H = 34;
const AXIS_H = 18;
const TOP_PAD = 14;
const BOT_PAD = 10;
const PAD_L = 42;
const DISC = 22;
const BADGE_GAP = 4;
const BADGE_FONT = 9.5;
// How far a finger has to travel sideways before the curve takes it.
const SCRUB_SLOP = 8;
const PARENT_SYNC_MS = 96;

/**
 * Data ramp: each colour carries meaning — how steep the segment under it is
 * (|grade| in %) — so, like globeStops in the theme, it is fixed rather than
 * derived from the user-selectable accent. The top band sits on the same red as
 * theme.danger. Buckets follow the Komoot profile convention:
 * <5 flat, 5–10 moderate, 10–15 steep, 15–25 very steep, 25+ severe.
 */
const GRADE_RAMP = [
  { upTo: 5, color: '#2EB85C', label: '<5%' },
  { upTo: 10, color: '#DFB93C', label: '5–10%' },
  { upTo: 15, color: '#FF9F0A', label: '10–15%' },
  { upTo: 25, color: '#FF6B35', label: '15–25%' },
  { upTo: Infinity, color: '#FF453A', label: '≥25%' },
] as const;

const gradeBucket = (absGrade: number) => {
  for (let b = 0; b < GRADE_RAMP.length; b++) if (absGrade < GRADE_RAMP[b].upTo) return b;
  return GRADE_RAMP.length - 1;
};

// Steps the two axes are allowed to tick at, so every label is a round number.
const HEIGHT_STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000];
const DISTANCE_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

let instanceSeq = 0;

export interface ElevationMark {
  /** Distance along the profile, in km. */
  km: number;
  /** The number to show, which is how the page numbers this spot elsewhere. */
  label: string;
  /** Height there, in m; the curve's own sample when the mark carries none. */
  ele?: number;
  /** Index into the page's own list, so a tap reaches the right spot. */
  index: number;
}

type Props = {
  theme: Theme;
  series: ElevSeries;
  width: number;
  /** The marked spots, in badge order. Distances are clamped to the profile. */
  marks?: ElevationMark[];
  /** The marked spot the page has selected, as `marks[].index`. */
  selectedMarkIndex?: number | null;
  onSelectMark?: (index: number) => void;
  /** Distance picked by scrubbing; null while nothing is being dragged. */
  selectedKm?: number | null;
  onSelect?: (km: number | null) => void;
  /** False draws the chart as a picture: no scrub and no readout over the
   *  plot, so nothing competes with the sheet's vertical scroll, and the badges
   *  are not taps. Defaults to true. */
  interactive?: boolean;
};

export function ElevationProfile({
  theme,
  series,
  width,
  marks,
  selectedMarkIndex = null,
  onSelectMark,
  selectedKm,
  onSelect,
  interactive = true,
}: Props) {
  const { t } = useI18n();
  const [uid] = useState(() => `elevationProfile${(instanceSeq += 1)}`);
  const { pts, totalKm, minEle, maxEle } = series;
  const N = pts.length;
  const W = Math.max(200, width);
  // The badge row only takes height when there are marks to show.
  const laneH = marks?.length ? LANE_H : 0;
  const H = laneH + PLOT_H + AXIS_H;
  const plotW = Math.max(1, W - PAD_L);
  const baseline = laneH + PLOT_H;
  const range = Math.max(maxEle - minEle, 1);
  const lo = minEle - range * 0.12;
  const hi = maxEle + range * 0.12;
  const plotTop = laneH + TOP_PAD;
  const plotBottom = baseline - BOT_PAD;
  const xOf = useCallback((km: number) => PAD_L + (km / (totalKm || 1)) * plotW, [totalKm, plotW]);
  const yOf = useCallback((ele: number) => plotTop + (1 - (ele - lo) / (hi - lo)) * (plotBottom - plotTop), [plotTop, plotBottom, lo, hi]);

  // The sample closest to a distance; the profile is evenly spaced enough that
  // a linear search per drag frame would be wasted work, so this bisects.
  const indexAtKm = (km: number) => {
    let a = 0;
    let b = N - 1;
    while (b - a > 1) {
      const mid = (a + b) >> 1;
      if (pts[mid].km < km) a = mid; else b = mid;
    }
    return Math.abs(pts[a].km - km) <= Math.abs(pts[b].km - km) ? a : b;
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const idx = dragIdx ?? (selectedMarkIndex == null && selectedKm != null ? indexAtKm(selectedKm) : null);
  const cur = idx != null ? pts[idx] : null;
  const selectedMark = selectedMarkIndex != null ? marks?.find((mark) => mark.index === selectedMarkIndex) ?? null : null;

  // Grade-coloured drawing: smooth |grade| over a 3-point window so import noise
  // doesn't turn the ramp into confetti, then merge consecutive same-bucket runs
  // into one path (sharing the boundary point) so a profile is a handful of
  // paths, not hundreds.
  const gradeRuns = useMemo(() => {
    if (N < 2) return [];
    const g = pts.map((pt) => Math.abs(pt.grade));
    const buckets = g.map((v, i) => gradeBucket((g[Math.max(0, i - 1)] + v + g[Math.min(g.length - 1, i + 1)]) / 3));
    const runs: { bucket: number; from: number; to: number }[] = [];
    let start = 0;
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i] !== buckets[start]) { runs.push({ bucket: buckets[start], from: start, to: i }); start = i; }
    }
    runs.push({ bucket: buckets[start], from: start, to: buckets.length - 1 });
    return runs;
  }, [pts, N]);

  const paths = useMemo(() => {
    if (!gradeRuns.length) return [];
    return gradeRuns.map((run) => {
      let line = '';
      for (let i = run.from; i <= run.to; i++) line += `${i === run.from ? 'M' : 'L'}${xOf(pts[i].km).toFixed(1)},${yOf(pts[i].ele).toFixed(1)} `;
      const startX = xOf(pts[run.from].km).toFixed(1);
      const endX = xOf(pts[run.to].km).toFixed(1);
      return { bucket: run.bucket, line, area: `${line}L${endX},${baseline} L${startX},${baseline} Z` };
    });
  }, [gradeRuns, pts, xOf, yOf, baseline]);

  // Both axes tick at round numbers, so a label says something about the ground
  // rather than about where the padded range happened to fall.
  const heightTicks = useMemo(() => {
    const step = HEIGHT_STEPS.find((s) => (hi - lo) / s <= 3) ?? HEIGHT_STEPS[HEIGHT_STEPS.length - 1];
    const out: { y: number; ele: number }[] = [];
    for (let ele = Math.ceil(lo / step) * step; ele <= hi; ele += step) out.push({ y: yOf(ele), ele });
    return out;
  }, [lo, hi, yOf]);

  const distanceTicks = useMemo(() => {
    const step = DISTANCE_STEPS.find((s) => totalKm / s <= 5) ?? DISTANCE_STEPS[DISTANCE_STEPS.length - 1];
    const out: { x: number; km: number }[] = [];
    // The last tick keeps clear of the total printed at the right edge.
    for (let km = 0; km <= totalKm - step * 0.6; km += step) out.push({ x: xOf(km), km });
    return out;
  }, [totalKm, xOf]);

  // Badge geometry feeds both the drawing and the discs. `cx` is the mark's
  // place on the curve; `bx` is where its badge sits, pulled in at the chart's
  // ends so a mark at the start or finish isn't cut in half.
  const badges = useMemo(() => {
    if (!marks?.length) return [] as { cx: number; bx: number; cy: number; free: boolean; label: string; selected: boolean; index: number; km: number }[];
    const placed: number[] = [];
    return marks.map((mark) => {
      const km = Math.max(0, Math.min(totalKm, mark.km));
      const cx = xOf(km);
      const ele = mark.ele ?? pts[indexAtKm(km)]?.ele ?? minEle;
      const bx = Math.max(DISC / 2 + 1, Math.min(W - DISC / 2 - 1, cx));
      const free = placed.every((px) => Math.abs(bx - px) >= DISC + BADGE_GAP);
      if (free) placed.push(bx);
      return { cx, bx, cy: yOf(ele), free, label: mark.label, selected: mark.index === selectedMarkIndex, index: mark.index, km };
    });
  }, [marks, xOf, yOf, totalKm, W, pts, minEle, N, selectedMarkIndex]);

  // Latest values for the long-lived responder.
  const live = useRef({ N, plotW, onSelect, pts });
  live.current = { N, plotW, onSelect, pts };
  const lastSync = useRef(0);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const pending = useRef<number | null>(null);

  const idxAtX = (x: number) => {
    const { N: n, plotW: w } = live.current;
    return Math.round(Math.max(0, Math.min(1, (x - PAD_L) / w)) * (n - 1));
  };
  const syncParent = (i: number, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSync.current < PARENT_SYNC_MS) return;
    lastSync.current = now;
    live.current.onSelect?.(live.current.pts[i]?.km ?? null);
  };

  const pan = useRef(PanResponder.create({
    // A touch down is not a scrub: the sheet owns it until the finger proves it
    // is going sideways, so the curve never traps a vertical scroll.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > SCRUB_SLOP && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    // Once a drag has the curve, a slight vertical drift must not hand the
    // gesture back to the page scroll.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const i = idxAtX(event.nativeEvent.locationX);
      pending.current = i;
      setDragIdx(i);
      syncParent(i, true);
    },
    onPanResponderMove: (event) => {
      pending.current = idxAtX(event.nativeEvent.locationX);
      if (frame.current != null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const i = pending.current;
        if (i == null) return;
        setDragIdx(i);
        syncParent(i, false);
      });
    },
    onPanResponderRelease: () => {
      const i = pending.current;
      if (i != null) syncParent(i, true);
      setDragIdx(null);
    },
    onPanResponderTerminate: () => {
      const i = pending.current;
      if (i != null) syncParent(i, true);
      setDragIdx(null);
    },
  })).current;

  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
  }, []);

  const scrubX = cur ? xOf(cur.km) : 0;
  const scrubY = cur ? yOf(cur.ele) : 0;
  const selectedBadge = selectedMarkIndex != null ? badges.find((badge) => badge.index === selectedMarkIndex) ?? null : null;
  const readoutPt = cur ?? (selectedMark ? pts[indexAtKm(Math.max(0, Math.min(totalKm, selectedMark.km)))] : null);
  const gradeText = readoutPt ? `${readoutPt.grade >= 0 ? '+' : '−'}${Math.abs(readoutPt.grade).toFixed(1)}` : '';

  return (
    <View>
      {/* Fixed height either way, so picking a point never moves the chart. A
          readout has nothing to say when nothing can be picked, so the row is
          only reserved on an interactive chart. */}
      {interactive ? (
        <View style={{ height: 44, justifyContent: 'flex-end', marginBottom: space.xs }} accessibilityLiveRegion="polite">
          {readoutPt ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.lg }}>
              <Readout theme={theme} label={t('tracks.detail.alongLabel')} value={readoutPt.km.toFixed(1)} unit="km" />
              <Readout theme={theme} label={t('tracks.detail.eleLabel')} value={fmt(readoutPt.ele)} unit="m" />
              <Readout theme={theme} label={t('tracks.detail.gradeLabel')} value={gradeText} unit="%" />
              {dragIdx == null ? (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={t('tracks.detail.clearPoint')}
                  onPress={() => onSelect?.(null)}
                  style={{ marginLeft: 'auto', width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
                >
                  <Icon name="close" size={18} color={theme.text3} strokeWidth={2.2} />
                </Press>
              ) : null}
            </View>
          ) : (
            <Text style={[type.hint, { color: theme.text3 }]}>{t('tracks.detail.profileHint')}</Text>
          )}
        </View>
      ) : null}

      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H}>
          <Defs>
            {GRADE_RAMP.map((band, bucket) => (
              <LinearGradient key={bucket} id={`${uid}-${bucket}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={band.color} stopOpacity={theme.dark ? 0.42 : 0.3} />
                <Stop offset="1" stopColor={band.color} stopOpacity={0.03} />
              </LinearGradient>
            ))}
          </Defs>
          {heightTicks.map((tick) => (
            <Line key={tick.ele} x1={PAD_L} x2={W} y1={tick.y} y2={tick.y} stroke={theme.hairline} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          {distanceTicks.map((tick) => (
            <Line key={tick.km} x1={tick.x} x2={tick.x} y1={baseline} y2={baseline + 4} stroke={theme.hairline} strokeWidth={1} />
          ))}
          {paths.map((path, i) => (
            <Path key={`fill-${i}`} d={path.area} fill={`url(#${uid}-${path.bucket})`} />
          ))}
          {paths.map((path, i) => (
            <Path key={`line-${i}`} d={path.line} fill="none" stroke={GRADE_RAMP[path.bucket].color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {badges.map((badge) => badge.free ? (
            <Line
              key={`drop-${badge.index}`}
              x1={badge.cx}
              x2={badge.cx}
              y1={laneH / 2 + DISC / 2 + 2}
              y2={badge.selected ? baseline : badge.cy}
              stroke={theme.accent}
              strokeWidth={badge.selected ? 1.2 : 1}
              strokeOpacity={badge.selected ? 0.8 : 0.4}
              strokeDasharray={badge.selected ? undefined : '2 3'}
            />
          ) : null)}
          {selectedBadge ? <Circle cx={selectedBadge.cx} cy={selectedBadge.cy} r={5.5} fill={theme.accent} stroke={theme.featureSurface} strokeWidth={2.5} /> : null}
          {cur ? (
            <>
              <Line x1={scrubX} x2={scrubX} y1={laneH} y2={baseline} stroke={theme.text2} strokeWidth={1} />
              <Circle cx={scrubX} cy={scrubY} r={6} fill={theme.accent} stroke={theme.featureSurface} strokeWidth={2.5} />
            </>
          ) : null}
        </Svg>

        {/* The scrubbing surface is the plot only; the badges above it are taps
            and never hand their press to the curve. A read-only chart has no
            surface to catch a drag, so the sheet scrolls straight through it. */}
        {interactive ? (
          <View
            {...pan.panHandlers}
            accessible
            accessibilityLabel={t('tracks.detail.profile')}
            style={{ position: 'absolute', left: 0, right: 0, top: laneH, height: PLOT_H }}
          />
        ) : null}

        {badges.map((badge) => {
          if (!badge.free && !badge.selected) return null;
          const shell = {
            position: 'absolute',
            left: badge.bx - DISC / 2,
            top: laneH / 2 - DISC / 2,
            width: DISC,
            height: DISC,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: badge.selected ? theme.accent : theme.featureSurface,
            borderWidth: badge.selected ? 0 : 1.6,
            borderColor: theme.accent,
          } as const;
          const number = (
            <Text
              pointerEvents="none"
              style={{
                fontFamily: MONO,
                fontSize: BADGE_FONT,
                lineHeight: BADGE_FONT + 3,
                fontWeight: badge.selected ? '800' : '700',
                // White on the accent fill of the selected badge.
                color: badge.selected ? '#FFFFFF' : theme.accent,
                fontVariant: ['tabular-nums'],
              }}
            >
              {badge.label}
            </Text>
          );
          return interactive ? (
            <Press
              key={`badge-${badge.index}`}
              onPress={() => onSelectMark?.(badge.index)}
              accessibilityRole="button"
              accessibilityLabel={`#${badge.label} ${t('route.preview.waypointKm', { km: badge.km.toFixed(1) })}`}
              hitSlop={6}
              style={shell}
            >
              {number}
            </Press>
          ) : (
            <View key={`badge-${badge.index}`} pointerEvents="none" style={shell}>
              {number}
            </View>
          );
        })}

        {heightTicks.map((tick) => (
          <Text
            key={`h-${tick.ele}`}
            pointerEvents="none"
            numberOfLines={1}
            style={[type.indexMono, { position: 'absolute', left: 0, top: tick.y - 7, width: PAD_L - 6, textAlign: 'right', color: theme.text3 }]}
          >
            {fmt(tick.ele)}
          </Text>
        ))}
        {distanceTicks.map((tick) => (
          <Text
            key={`k-${tick.km}`}
            pointerEvents="none"
            style={[type.indexMono, { position: 'absolute', left: Math.max(0, Math.min(W - 40, tick.x - 20)), top: baseline + 5, width: 40, textAlign: 'center', color: theme.text3, fontVariant: ['tabular-nums'] }]}
          >
            {tick.km % 1 === 0 ? tick.km.toFixed(0) : tick.km.toFixed(1)}
          </Text>
        ))}
        <Text
          pointerEvents="none"
          style={[type.indexMono, { position: 'absolute', right: 0, top: baseline + 5, color: theme.text3, fontVariant: ['tabular-nums'] }]}
        >
          {totalKm.toFixed(1)} km
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.xs, rowGap: space.xxs, marginTop: space.xs }}>
        <Text style={[type.tiny, { color: theme.text3 }]}>{t('tracks.detail.gradeLabel')}</Text>
        {GRADE_RAMP.map((band) => (
          <View key={band.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
            <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: band.color }} />
            <Text style={[type.tiny, { color: theme.text3, fontVariant: ['tabular-nums'] }]}>{band.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Readout({ theme, label, value, unit }: { theme: Theme; label: string; value: string; unit: string }) {
  return (
    <View>
      <Text style={[type.caption, { color: theme.text2 }]}>{label}</Text>
      <Text style={[type.metric, { color: theme.text, marginTop: 2, fontVariant: ['tabular-nums'] }]}>
        {value}
        <Text style={[type.caption, { fontFamily: MONO, color: theme.text2 }]}> {unit}</Text>
      </Text>
    </View>
  );
}
