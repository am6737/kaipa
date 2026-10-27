// TrackProfile.tsx — the elevation curve on a library track's page.
//
// Two ways to look along a track, on one chart. Holding and dragging the curve
// scrubs any point: the readout above follows it and the page puts a marker on
// the map there. The numbered badges above the plot are the marked spots — a
// tap there selects one instead of scrubbing, and scrubbing clears the
// selection. Badges that would collide are left out, so a track with many marks
// stays readable; every mark is still on the map. Steep stretches shade the
// band under the line, with a legend naming the grades. The chart follows the
// finger every frame; the page hears about it at a lower rate, because moving a
// native map marker costs far more than redrawing an SVG.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import type { ElevSeries } from '../../data/elevation';
import { radius, space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { MONO } from '../../theme/fonts';
import type { Theme } from '../../theme/theme';
import { Icon } from '../Icon';
import { Press } from '../Press';

const PLOT_H = 168;
const BOTTOM = 6;
const BADGE_FONT = 9.5;
const BADGE_MIN_R = 8.5;
const BADGE_GAP = 4;
const BADGE_TAP_R = 14;
const MODERATE_GRADE = 8;
const STEEP_GRADE = 14;
const PARENT_SYNC_MS = 96;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface TrackProfileMark {
  /** Distance along the profile, in km. */
  km: number;
  /** Height there, in m; the curve's own sample when the mark carries none. */
  ele: number;
  /** Index into the page's mark list, so selection survives the sort. */
  index: number;
}

type Props = {
  theme: Theme;
  series: ElevSeries;
  width: number;
  /** The marked spots, in badge order. Distances are clamped to the profile. */
  marks?: TrackProfileMark[];
  /** The marked spot the page has selected, as `marks[].index`. */
  selectedMarkIndex?: number | null;
  onSelectMark?: (index: number) => void;
  /** Distance picked by scrubbing; null while nothing is being dragged. */
  selectedKm: number | null;
  onSelect: (km: number | null) => void;
};

export function TrackProfile({
  theme,
  series,
  width,
  marks,
  selectedMarkIndex = null,
  onSelectMark,
  selectedKm,
  onSelect,
}: Props) {
  const { t } = useI18n();
  const { pts, totalKm, minEle, maxEle } = series;
  const N = pts.length;
  const W = Math.max(200, width);
  const range = Math.max(maxEle - minEle, 1);
  const lo = minEle - range * 0.12;
  const hi = maxEle + range * 0.12;
  const hasMarks = !!marks?.length;
  // The badge row only takes plot height when there are marks to show.
  const TOP = hasMarks ? 26 : 12;
  // Badges sit centred in that row, clear of the curve below it.
  const ROW_Y = TOP / 2;
  const xOf = useCallback((km: number) => (km / (totalKm || 1)) * W, [totalKm, W]);
  const yOf = useCallback((ele: number) => TOP + (1 - (ele - lo) / (hi - lo)) * (PLOT_H - TOP - BOTTOM), [TOP, lo, hi]);

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

  const line = useMemo(() => pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.km).toFixed(1)},${yOf(p.ele).toFixed(1)}`).join(' '), [pts, W, lo, hi, totalKm]);
  const area = `${line} L${W},${PLOT_H} L0,${PLOT_H} Z`;

  // Each run of steep enough segments is one band, down from the curve to the
  // baseline; anything under 8% keeps the neutral fill. A run is a single
  // shape, so neighbouring samples leave no hairline seams between them.
  const bands = useMemo(() => {
    const out: { d: string; color: string }[] = [];
    let run: { color: string; from: number; to: number } | null = null;
    const close = () => {
      if (!run) return;
      let d = `M${xOf(pts[run.from].km).toFixed(1)},${PLOT_H}`;
      for (let j = run.from; j <= run.to; j++) d += ` L${xOf(pts[j].km).toFixed(1)},${yOf(pts[j].ele).toFixed(1)}`;
      d += ` L${xOf(pts[run.to].km).toFixed(1)},${PLOT_H}Z`;
      out.push({ d, color: run.color });
      run = null;
    };
    for (let i = 1; i < N; i++) {
      const grade = Math.abs(pts[i].grade);
      const color = grade >= STEEP_GRADE ? theme.gradeSteep : grade >= MODERATE_GRADE ? theme.gradeModerate : null;
      if (run && run.color === color) { run.to = i; continue; }
      close();
      if (color) run = { color, from: i - 1, to: i };
    }
    close();
    return out;
  }, [pts, N, theme.gradeModerate, theme.gradeSteep, W, lo, hi, totalKm]);

  // Badge geometry feeds both the drawing and the tap test. A number keeps its
  // own width, so two-digit marks get a wider circle. `cx` is the mark's place
  // on the curve; `bx` is where its badge is drawn, pulled in at the chart's
  // ends so a mark at the start or finish isn't cut in half.
  const badges = useMemo(() => {
    if (!marks?.length) return [] as { cx: number; bx: number; cy: number; r: number; free: boolean; label: string; selected: boolean; index: number }[];
    const placed: { bx: number; r: number }[] = [];
    return marks.map((mark) => {
      const cx = xOf(Math.max(0, Math.min(totalKm, mark.km)));
      const label = String(mark.index + 1);
      const r = Math.max(BADGE_MIN_R, (label.length * BADGE_FONT * 0.6) / 2 + 3);
      const bx = Math.max(r + 1, Math.min(W - r - 1, cx));
      const free = placed.every(({ bx: px, r: pr }) => Math.abs(bx - px) >= pr + r + BADGE_GAP);
      if (free) placed.push({ bx, r });
      return { cx, bx, cy: yOf(mark.ele), r, free, label, selected: mark.index === selectedMarkIndex, index: mark.index };
    });
  }, [marks, xOf, yOf, totalKm, W, selectedMarkIndex]);

  // Latest values for the long-lived responder.
  const live = useRef({ W, N, totalKm, TOP, onSelect, onSelectMark, pts, badges });
  live.current = { W, N, totalKm, TOP, onSelect, onSelectMark, pts, badges };
  const lastSync = useRef(0);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const pending = useRef<number | null>(null);
  const badgeTap = useRef(false);

  const idxAtX = (x: number) => {
    const { W: w, N: n } = live.current;
    return Math.round(Math.max(0, Math.min(1, x / w)) * (n - 1));
  };
  const syncParent = (i: number, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSync.current < PARENT_SYNC_MS) return;
    lastSync.current = now;
    live.current.onSelect(live.current.pts[i]?.km ?? null);
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Once a drag has the curve, a slight vertical drift must not hand the
    // gesture to the page scroll.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      badgeTap.current = false;
      if (y <= live.current.TOP && live.current.onSelectMark) {
        const hit = live.current.badges
          .filter((badge) => badge.free && Math.abs(badge.bx - x) <= BADGE_TAP_R)
          .sort((a, b) => Math.abs(a.bx - x) - Math.abs(b.bx - x))[0];
        if (hit) {
          // A tap in the badge row picks the nearest mark rather than scrubbing.
          badgeTap.current = true;
          live.current.onSelectMark(hit.index);
          return;
        }
      }
      const i = idxAtX(x);
      pending.current = i;
      setDragIdx(i);
      syncParent(i, true);
    },
    onPanResponderMove: (e) => {
      if (badgeTap.current) return;
      pending.current = idxAtX(e.nativeEvent.locationX);
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
      if (badgeTap.current) {
        badgeTap.current = false;
        return;
      }
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
  const readoutPt = cur ?? (selectedMark ? pts[indexAtKm(selectedMark.km)] : null);
  const gradeText = readoutPt ? `${readoutPt.grade >= 0 ? '+' : '−'}${Math.abs(readoutPt.grade).toFixed(1)}` : '';

  return (
    <View>
      {/* Fixed height either way, so picking a point never moves the chart. */}
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
                onPress={() => onSelect(null)}
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

      <View
        {...pan.panHandlers}
        accessible
        accessibilityLabel={t('tracks.detail.profile')}
        style={{ width: W, height: PLOT_H }}
      >
        <Svg width={W} height={PLOT_H}>
          <Defs>
            <ClipPath id="trackProfileDone">
              <Rect x={0} y={0} width={cur ? scrubX : W} height={PLOT_H} />
            </ClipPath>
          </Defs>
          <Line x1={0} x2={W} y1={yOf(maxEle)} y2={yOf(maxEle)} stroke={theme.hairline} strokeWidth={1} strokeDasharray="2 4" />
          <Line x1={0} x2={W} y1={yOf(minEle)} y2={yOf(minEle)} stroke={theme.hairline} strokeWidth={1} strokeDasharray="2 4" />
          {/* Under 8% is flat ground: a neutral fill, so no colour reads as a grade. */}
          <Path d={area} fill={theme.text} fillOpacity={cur ? 0.035 : 0.06} />
          {cur ? <Path d={area} fill={theme.text} fillOpacity={0.06} clipPath="url(#trackProfileDone)" /> : null}
          {bands.map((band, i) => <Path key={i} d={band.d} fill={band.color} />)}
          <Path d={line} fill="none" stroke={bands.length ? theme.text : theme.accent} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {badges.map((badge) => badge.selected || !badge.free ? null : (
            <G key={badge.index}>
              <Line x1={badge.cx} x2={badge.cx} y1={ROW_Y + badge.r} y2={badge.cy} stroke={theme.accent} strokeOpacity={0.32} strokeWidth={1} strokeDasharray="2 3" />
              <Circle cx={badge.bx} cy={ROW_Y} r={badge.r} fill={theme.featureSurface} stroke={theme.accent} strokeWidth={1.6} />
            </G>
          ))}
          {selectedBadge ? (
            <G>
              <Line x1={selectedBadge.cx} x2={selectedBadge.cx} y1={ROW_Y} y2={PLOT_H} stroke={theme.accent} strokeWidth={1.2} />
              <Circle cx={selectedBadge.cx} cy={selectedBadge.cy} r={5.5} fill={theme.accent} stroke={theme.featureSurface} strokeWidth={2.5} />
              <Circle cx={selectedBadge.bx} cy={ROW_Y} r={selectedBadge.r + 1.5} fill={theme.accent} />
            </G>
          ) : null}
          {cur ? (
            <>
              <Line x1={scrubX} x2={scrubX} y1={0} y2={PLOT_H} stroke={theme.text2} strokeWidth={1} />
              <Circle cx={scrubX} cy={scrubY} r={6} fill={theme.accent} stroke={theme.featureSurface} strokeWidth={2.5} />
            </>
          ) : null}
        </Svg>
        {/* Badge numbers ride on top as text; this Svg's typings carry no Text. */}
        {badges.map((badge) => badge.free || badge.selected ? (
          <Text
            key={badge.index}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: badge.bx - 20,
              width: 40,
              top: ROW_Y - BADGE_FONT,
              textAlign: 'center',
              fontFamily: MONO,
              fontSize: BADGE_FONT,
              lineHeight: BADGE_FONT + 3,
              fontWeight: badge.selected ? '800' : '700',
              color: badge.selected ? '#FFFFFF' : theme.accent,
              fontVariant: ['tabular-nums'],
            }}
          >
            {badge.label}
          </Text>
        ) : null)}
        <Text pointerEvents="none" style={[type.indexMono, { position: 'absolute', left: 0, top: yOf(maxEle) - 15, color: theme.text3 }]}>{fmt(maxEle)}</Text>
        <Text pointerEvents="none" style={[type.indexMono, { position: 'absolute', left: 0, top: yOf(minEle) - 15, color: theme.text3 }]}>{fmt(minEle)}</Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs }}>
        <Text style={[type.indexMono, { color: theme.text3 }]}>0 km</Text>
        <Text style={[type.indexMono, { color: theme.text3 }]}>{(totalKm / 2).toFixed(1)} km</Text>
        <Text style={[type.indexMono, { color: theme.text3 }]}>{totalKm.toFixed(1)} km</Text>
      </View>

      {bands.length ? (
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
          <LegendSwatch theme={theme} color={theme.gradeModerate} label={t('tracks.detail.legendModerate')} />
          <LegendSwatch theme={theme} color={theme.gradeSteep} label={t('tracks.detail.legendSteep')} />
        </View>
      ) : null}
    </View>
  );
}

function LegendSwatch({ theme, color, label }: { theme: Theme; color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}>
      <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color }} />
      <Text style={[type.caption, { color: theme.text2 }]}>{label}</Text>
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
