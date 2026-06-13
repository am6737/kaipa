// LabeledDonut.tsx — the shared 装备 ring chart: a thick leader-line donut with
// per-category callouts (name + %), tap-to-select (dims the rest, animated),
// tap-off to clear, and a 4-stat readout strip below that narrows to the
// selected category. Used by both the 装备 tab and 套装详情 so they stay identical.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, Metric } from '../../data/gear';
import { yuan } from './parts';

export interface Row extends GearCat {
  value: number;
  count: number;
}

const trackBg = (t: Theme) => (t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)');

const AnimCircle = Animated.createAnimatedComponent(Circle);
const AnimG = Animated.createAnimatedComponent(G);

// One ring arc that eases its opacity + thickness between full and dimmed when
// the selection changes (instead of snapping). Keyed by category so the
// Animated.Values persist across selection changes — that's what makes it smooth.
function ArcSeg({ cx, cy, R, T, C, color, dash, offset, dim }: { cx: number; cy: number; R: number; T: number; C: number; color: string; dash: number; offset: number; dim: boolean }) {
  const op = useRef(new Animated.Value(dim ? 0.3 : 1)).current;
  const sw = useRef(new Animated.Value(dim ? T * 0.72 : T)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: dim ? 0.3 : 1, duration: 260, useNativeDriver: false }),
      Animated.timing(sw, { toValue: dim ? T * 0.72 : T, duration: 240, useNativeDriver: false }),
    ]).start();
  }, [dim, op, sw, T]);
  return (
    <AnimCircle pointerEvents="none" cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="butt" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={offset} opacity={op} />
  );
}

type LabelDatum = { id: string; name: string; color: string; ax: number; ay: number; ex: number; ly: number; side: number; value: number };

// One leader-line callout that eases its opacity when the selection changes.
function LabelCallout({ d, theme, sum, dim }: { d: LabelDatum; theme: Theme; sum: number; dim: boolean }) {
  const op = useRef(new Animated.Value(dim ? 0.32 : 1)).current;
  useEffect(() => {
    Animated.timing(op, { toValue: dim ? 0.32 : 1, duration: 240, useNativeDriver: false }).start();
  }, [dim, op]);
  const pct = (d.value / sum) * 100;
  const endX = d.ex + d.side * 12;
  const textX = endX + d.side * 4;
  const anchor = d.side > 0 ? 'start' : 'end';
  return (
    <AnimG opacity={op} pointerEvents="none">
      <Polyline points={`${d.ax},${d.ay} ${d.ex},${d.ly} ${endX},${d.ly}`} fill="none" stroke={d.color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <SvgText x={textX} y={d.ly} textAnchor={anchor as any}>
        <TSpan x={textX} dy={-2} fontSize={10.5} fontWeight="600" fill={theme.text}>{d.name}</TSpan>
        <TSpan x={textX} dy={13} fontSize={9.5} fontWeight="700" fill={theme.text2}>{pct.toFixed(2)}%</TSpan>
      </SvgText>
    </AnimG>
  );
}

export function LabeledDonut({ theme, agg, total, metric, items, width, sel, onSel }: { theme: Theme; agg: Row[]; total: number; metric: Metric; items: GearItem[]; width: number; sel: string | null; onSel: (s: string | null) => void }) {
  const { t } = useI18n();
  const TOPN = 5;
  const top = agg.slice(0, TOPN);
  const restList = agg.slice(TOPN);
  const restVal = restList.reduce((a, s) => a + s.value, 0);
  const restColor = theme.dark ? '#5A5A5E' : '#C7C7CC';
  const segs = restVal > 0 ? [...top, { id: '__rest', name: t('gear.donut.other'), color: restColor, value: restVal, count: 0, builtin: true } as Row] : top;
  const sum = total || segs.reduce((a, s) => a + s.value, 0) || 1;

  const VW = 340, VH = 232;
  const cx = VW / 2, cy = VH / 2 + 1;
  const R = 58, T = 32, aR = R + T / 2;
  const arcGap = segs.length > 1 ? 1.4 : 0;
  const C = 2 * Math.PI * R;
  const gapAbs = (arcGap / 100) * C;

  // Anchor each segment mid-angle (0 = top, clockwise) on the outer edge.
  let acc = 0;
  type Placed = Row & { sinA: number; cosA: number; side: number; ax: number; ay: number; ex: number; ey: number; ly: number };
  const placed: Placed[] = segs.map((s) => {
    const midFrac = (acc + s.value / 2) / sum;
    acc += s.value;
    const rad = midFrac * 2 * Math.PI;
    const sinA = Math.sin(rad), cosA = Math.cos(rad);
    const side = sinA >= 0 ? 1 : -1;
    return { ...s, sinA, cosA, side, ax: cx + (aR + 3) * sinA, ay: cy - (aR + 3) * cosA, ex: cx + (aR + 13) * sinA, ey: cy - (aR + 13) * cosA, ly: 0 };
  });

  const gapY = 30, topY = 20, botY = VH - 20;
  const layoutSide = (list: Placed[]) => {
    list.sort((a, b) => a.ey - b.ey);
    list.forEach((d) => { d.ly = Math.min(Math.max(d.ey, topY), botY); });
    for (let i = 1; i < list.length; i++) if (list[i].ly - list[i - 1].ly < gapY) list[i].ly = list[i - 1].ly + gapY;
    const over = list.length ? list[list.length - 1].ly - botY : 0;
    if (over > 0) list.forEach((d) => { d.ly -= over; });
    if (list.length && list[0].ly < topY) {
      list[0].ly = topY;
      for (let i = 1; i < list.length; i++) if (list[i].ly - list[i - 1].ly < gapY) list[i].ly = list[i - 1].ly + gapY;
    }
  };
  layoutSide(placed.filter((d) => d.side > 0));
  layoutSide(placed.filter((d) => d.side < 0));

  // Re-route each elbow OUTSIDE the ring at the label's FINAL y. The angle-based
  // elbow (cx ± (aR+13)·sinA) is fine until collision-avoidance pushes a label
  // far from its segment: a near-top label dragged down keeps its tiny angular
  // x, but the band is wide at that y, so the elbow + horizontal + % text land
  // ON the band. halfW = the band's outer half-width at this y (0 when the y is
  // above/below the ring), so cx ± (halfW + clear) always sits just past it.
  placed.forEach((d) => {
    const dy = d.ly - cy;
    const halfW = Math.sqrt(Math.max(aR * aR - dy * dy, 0)); // aR === R + T/2 (band outer radius)
    d.ex = cx + d.side * (halfW + 14);
  });

  // Readout strip: totals by default; when a segment is selected it narrows to
  // that category's 价值 / 重量 / 数量 / 占比 (the '其他' bucket sums every
  // collapsed category).
  const selSeg = sel ? segs.find((s) => s.id === sel) : null;
  const statSource = selSeg
    ? selSeg.id === '__rest'
      ? items.filter((it) => restList.some((r) => r.id === it.cat))
      : items.filter((it) => it.cat === selSeg.id)
    : items;
  const sp = statSource.reduce((a, it) => a + it.p, 0);
  const sw = statSource.reduce((a, it) => a + it.w, 0);
  const stats = selSeg
    ? [
        { id: 'price', label: t('gear.stat.value'), value: yuan(sp) },
        { id: 'weight', label: t('gear.stat.weight'), value: sw.toFixed(2) + ' kg' },
        { id: 'count', label: t('gear.stat.count'), value: statSource.length + ' ' + t('gear.unit.items') },
        { id: 'share', label: t('gear.stat.share'), value: (sum ? (selSeg.value / sum) * 100 : 0).toFixed(1) + '%' },
      ]
    : [
        { id: 'price', label: t('gear.stat.totalValue'), value: yuan(sp) },
        { id: 'weight', label: t('gear.stat.totalWeight'), value: sw.toFixed(2) + ' kg' },
        { id: 'count', label: t('gear.stat.itemCount'), value: items.length + ' ' + t('gear.unit.items') },
        { id: 'cats', label: t('gear.stat.cats'), value: agg.length + ' ' + t('gear.unit.cats') },
      ];

  // Invisible filled hit areas per segment — the actual tap targets (a stroked
  // ring with fill:none receives no touches in react-native-svg). Each is an
  // ANNULAR SECTOR matching the visible ring band exactly, so only taps on the
  // colored ring select (not the empty center or the gap outside it). Computed in
  // the visual frame (top = 0, clockwise) so they line up with the drawn arcs.
  const RI = R - T / 2, RO = R + T / 2; // ring band inner/outer radius
  const pt = (frac: number, rad: number): [number, number] => [cx + rad * Math.sin(2 * Math.PI * frac), cy - rad * Math.cos(2 * Math.PI * frac)];
  let accFrac = 0;
  const wedges = segs.map((s) => {
    const startFrac = accFrac / sum;
    accFrac += s.value;
    return { id: s.id, startFrac, endFrac: accFrac / sum };
  });

  let accArc = 0;
  const arcData = segs.map((s) => {
    const lenAbs = (s.value / sum) * C;
    const dash = Math.max(lenAbs - gapAbs, 0.004 * C);
    const offset = -accArc;
    accArc += lenAbs;
    return { id: s.id, color: s.color, dash, offset };
  });
  const H = (width * VH) / VW;
  return (
    <View style={{ width: '100%', marginTop: -10 }}>
      <Svg width={width} height={H} viewBox={`0 0 ${VW} ${VH}`}>
        {/* Bottom layer: tapping anywhere off the ring (center, gaps, labels)
            clears the selection. The sector hit-paths sit above it. */}
        <Rect x={0} y={0} width={VW} height={VH} fill="transparent" onPress={() => onSel(null)} />
        <G rotation={-90} origin={`${cx}, ${cy}`} pointerEvents="none">
          <Circle pointerEvents="none" cx={cx} cy={cy} r={R} fill="none" stroke={trackBg(theme)} strokeWidth={T} />
          {arcData.map((a) => (
            <ArcSeg key={a.id} cx={cx} cy={cy} R={R} T={T} C={C} color={a.color} dash={a.dash} offset={a.offset} dim={!!sel && sel !== a.id} />
          ))}
        </G>
        {wedges.map((wg) => {
          const span = wg.endFrac - wg.startFrac;
          if (span < 1e-4 || span > 0.999) return null; // skip empty / full-ring (selection moot)
          const [ox0, oy0] = pt(wg.startFrac, RO);
          const [ox1, oy1] = pt(wg.endFrac, RO);
          const [ix1, iy1] = pt(wg.endFrac, RI);
          const [ix0, iy0] = pt(wg.startFrac, RI);
          const large = span > 0.5 ? 1 : 0;
          const d = `M ${ox0} ${oy0} A ${RO} ${RO} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${RI} ${RI} 0 ${large} 0 ${ix0} ${iy0} Z`;
          return <Path key={wg.id} d={d} fill="transparent" onPress={() => onSel(sel === wg.id ? null : wg.id)} />;
        })}
        {placed.map((d) => (
          <LabelCallout key={d.id} d={d} theme={theme} sum={sum} dim={!!sel && sel !== d.id} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 8, paddingTop: 4 }}>
        {stats.map((s) => (
          <View key={s.id} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', letterSpacing: -0.4, color: theme.text }}>{s.value}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: theme.text2, marginTop: 4 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
