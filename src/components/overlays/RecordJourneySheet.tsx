// RecordJourneySheet.tsx — 记录走过的: log a PAST hike from a recorded track
// and/or photos, producing a 已完成 journey (回忆). Faithful RN port of the
// prototype's record-journey-flow.jsx, adapted to be self-contained:
//   • Tracks come from built-in sample GPX/KML (run through a real parser →
//     real distance / ascent / track-shape / elevation), since RN has no
//     <input type=file> without a native picker.
//   • Photos are tone-based PhotoTile placeholders (same convention the rest of
//     the app already uses for journey photos), tap-to-add / remove / set-cover.
// Everything else (dates, region + map pin, companions, visibility, notes,
// difficulty) is the full prototype flow.
import React, { useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Animated, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Poi, Companion, JourneyStatus } from '../../data/pois';
import { Tone } from '../../data/tones';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF } from './NewJourneySheet';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
interface TrackPt {
  lat: number;
  lon: number;
  ele: number;
  time: Date | null;
}
interface TrackStats {
  points: TrackPt[];
  cum: number[];
  distM: number;
  hasEle: boolean;
  ascent: number;
  descent: number;
  minEle: number | null;
  maxEle: number | null;
  hasTime: boolean;
  durationMs: number;
  startTime: Date | null;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  count: number;
}
interface Track {
  stats: TrackStats;
  fileName: string;
  fileFormat: string;
}
interface RJPhoto {
  id: string;
  tone: Tone;
}
interface RJCompanion {
  id: string;
  name: string;
  role: string;
}

// ──────────────────────────────────────────────────────────────
// Geo / stats helpers (ported from upload-track.jsx)
// ──────────────────────────────────────────────────────────────
function haversine(a: TrackPt, b: TrackPt): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeStats(points: TrackPt[]): TrackStats | null {
  const pts = points.filter((p) => isFinite(p.lat) && isFinite(p.lon));
  if (pts.length < 2) return null;
  let dist = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i - 1], pts[i]);
    cum.push(dist);
  }
  const eles = pts.map((p) => p.ele).filter((e) => isFinite(e));
  const hasEle = eles.length >= pts.length * 0.5;
  let ascent = 0;
  let descent = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  if (hasEle) {
    const first = pts.find((p) => isFinite(p.ele));
    let last = first ? first.ele : 0;
    for (const p of pts) {
      if (!isFinite(p.ele)) continue;
      minEle = Math.min(minEle, p.ele);
      maxEle = Math.max(maxEle, p.ele);
      const d = p.ele - last;
      if (Math.abs(d) >= 3) {
        if (d > 0) ascent += d;
        else descent += -d;
        last = p.ele;
      }
    }
  }
  const times = pts.map((p) => p.time).filter((t): t is Date => t instanceof Date && !isNaN(t.getTime()));
  const hasTime = times.length >= 2;
  const durationMs = hasTime ? times[times.length - 1].getTime() - times[0].getTime() : 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return {
    points: pts,
    cum,
    distM: dist,
    hasEle,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    minEle: hasEle ? Math.round(minEle) : null,
    maxEle: hasEle ? Math.round(maxEle) : null,
    hasTime,
    durationMs,
    startTime: hasTime ? times[0] : null,
    bbox: { minLat, maxLat, minLon, maxLon },
    count: pts.length,
  };
}

function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 1 : 2) + ' km';
  return Math.round(m) + ' m';
}
function fmtDur(ms: number): string {
  if (!ms || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return min + ' 分钟';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d} 天 ${hr} 小时` : `${d} 天`;
}
function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

const REGION_HINTS = [
  { name: '杭州 · 西湖', lat: 30.24, lon: 120.13, r: 0.7 },
  { name: '北京 · 延庆', lat: 40.46, lon: 115.92, r: 1.0 },
  { name: '云南 · 香格里拉', lat: 27.55, lon: 99.95, r: 2.0 },
  { name: '四川 · 甘孜', lat: 29.99, lon: 101.5, r: 2.5 },
  { name: '江西 · 萍乡', lat: 27.4, lon: 113.85, r: 1.2 },
  { name: '安徽 · 黄山', lat: 30.13, lon: 118.17, r: 0.8 },
  { name: '四川 · 阿坝', lat: 31.9, lon: 102.2, r: 2.5 },
];
function guessRegion(lat: number, lon: number): string {
  let best: typeof REGION_HINTS[number] | null = null;
  let bestD = Infinity;
  for (const h of REGION_HINTS) {
    const dy = lat - h.lat;
    const dx = (lon - h.lon) * Math.cos((lat * Math.PI) / 180);
    const d = Math.sqrt(dy * dy + dx * dx);
    if (d < h.r && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  if (best) return best.name;
  const ns = lat >= 0 ? '北纬' : '南纬';
  const ew = lon >= 0 ? '东经' : '西经';
  return `${ns}${Math.abs(lat).toFixed(1)}° ${ew}${Math.abs(lon).toFixed(1)}° 附近`;
}
function suggestDifficulty(stats: TrackStats): string {
  const km = stats.distM / 1000;
  const asc = stats.ascent || 0;
  const score = km * 1.0 + asc / 100;
  if (score < 10) return '易';
  if (score < 22) return '中';
  if (score < 40) return '中高';
  return '高';
}

// ──────────────────────────────────────────────────────────────
// Lightweight GPX / KML parser — no DOMParser in RN, so we read the
// well-formed tags by regex. Handles the sample tracks + typical files.
// ──────────────────────────────────────────────────────────────
function parseTrack(text: string, filename: string): { error?: string; name?: string; points?: TrackPt[]; format?: string } {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const isKml = ext === 'kml' || /<kml[\s>]/i.test(text);
  const points: TrackPt[] = [];
  const nameM = text.match(/<name>\s*([^<]+?)\s*<\/name>/i);
  const name = nameM ? nameM[1].trim() : '';
  if (isKml) {
    const blocks = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) || [];
    for (const b of blocks) {
      const inner = b.replace(/<\/?coordinates>/gi, '').trim();
      for (const tok of inner.split(/\s+/)) {
        if (!tok) continue;
        const parts = tok.split(',');
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const ele = parseFloat(parts[2]);
        if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: isFinite(ele) ? ele : NaN, time: null });
      }
    }
  } else {
    const re = /<(?:trkpt|rtept|wpt)\b([^>]*?)>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const attrs = m[1];
      const body = m[2];
      const latM = attrs.match(/lat="([-\d.]+)"/i);
      const lonM = attrs.match(/lon="([-\d.]+)"/i);
      if (!latM || !lonM) continue;
      const lat = parseFloat(latM[1]);
      const lon = parseFloat(lonM[1]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const eleM = body.match(/<ele>\s*([-\d.]+)\s*<\/ele>/i);
      const timeM = body.match(/<time>\s*([^<]+?)\s*<\/time>/i);
      points.push({ lat, lon, ele: eleM ? parseFloat(eleM[1]) : NaN, time: timeM ? new Date(timeM[1].trim()) : null });
    }
    if (!points.length) {
      const re2 = /<(?:trkpt|rtept|wpt)\b([^>]*?)\/>/gi;
      while ((m = re2.exec(text))) {
        const attrs = m[1];
        const latM = attrs.match(/lat="([-\d.]+)"/i);
        const lonM = attrs.match(/lon="([-\d.]+)"/i);
        if (latM && lonM) {
          const lat = parseFloat(latM[1]);
          const lon = parseFloat(lonM[1]);
          if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: NaN, time: null });
        }
      }
    }
  }
  if (points.length < 2) return { error: '文件里没有找到有效的轨迹点' };
  return { name, points, format: isKml ? 'KML' : 'GPX' };
}

// Sample GPX generator — a believable winding track, run through the real
// parser so the demo is honest. Deterministic per seed.
interface SampleSpec {
  name: string;
  lat0: number;
  lon0: number;
  n: number;
  spanKm: number;
  eleStart: number;
  eleGain: number;
  seed: number;
}
function makeSampleGpx(spec: SampleSpec): string {
  const { name, lat0, lon0, n, spanKm, eleStart, eleGain, seed } = spec;
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const kmToLat = 1 / 111;
  const kmToLon = 1 / (111 * Math.cos((lat0 * Math.PI) / 180));
  const start = new Date(Date.now() - 86400000 * 2);
  let t = start.getTime();
  const pts: TrackPt[] = [];
  let bearing = rnd() * Math.PI * 2;
  let lat = lat0;
  let lon = lon0;
  const stepKm = spanKm / n;
  for (let i = 0; i < n; i++) {
    const prog = i / (n - 1);
    bearing += (rnd() - 0.5) * 0.9;
    const dk = stepKm * (0.6 + rnd() * 0.8);
    lat += Math.cos(bearing) * dk * kmToLat;
    lon += Math.sin(bearing) * dk * kmToLon;
    const peak = 0.62;
    const shape = prog < peak ? prog / peak : 1 - (prog - peak) / (1 - peak);
    const ele = eleStart + eleGain * Math.pow(shape, 0.85) + (rnd() - 0.5) * 14;
    t += (dk / 4.2) * 3600 * 1000;
    pts.push({ lat, lon, ele, time: new Date(t) });
  }
  const body = pts
    .map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele><time>${(p.time as Date).toISOString()}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="kaipa-sample">\n  <trk><name>${name}</name><trkseg>\n${body}\n  </trkseg></trk>\n</gpx>`;
}
function gpxToKml(gpx: string): string {
  const nameM = gpx.match(/<name>([^<]*)<\/name>/i);
  const name = nameM ? nameM[1] : 'track';
  const re = /<trkpt\b[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?>([\s\S]*?)<\/trkpt>/gi;
  let m: RegExpExecArray | null;
  let coords = '';
  while ((m = re.exec(gpx))) {
    const body = m[3];
    const eleM = body.match(/<ele>([-\d.]+)<\/ele>/i);
    coords += `${m[2]},${m[1]},${eleM ? eleM[1] : '0'} `;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${name}</name>\n<LineString><coordinates>${coords.trim()}</coordinates></LineString></Placemark></Document></kml>`;
}

const SAMPLES: { key: string; label: string; region: string; tone: Tone; spec: SampleSpec }[] = [
  { key: 's1', label: '九溪烟树.gpx', region: '杭州 · 西湖', tone: 'forest', spec: { name: '九溪烟树环线', lat0: 30.21, lon0: 120.1, n: 90, spanKm: 6.4, eleStart: 40, eleGain: 180, seed: 7 } },
  { key: 's2', label: '海坨山环线.gpx', region: '北京 · 延庆', tone: 'ridge', spec: { name: '海坨山环线', lat0: 40.56, lon0: 115.84, n: 160, spanKm: 21.5, eleStart: 1100, eleGain: 1450, seed: 23 } },
  { key: 's3', label: '哈巴雪山.kml', region: '云南 · 香格里拉', tone: 'snow', spec: { name: '哈巴雪山冲顶', lat0: 27.36, lon0: 100.1, n: 150, spanKm: 23.8, eleStart: 2700, eleGain: 2350, seed: 41 } },
];

// ──────────────────────────────────────────────────────────────
// Date helpers (past-friendly)
// ──────────────────────────────────────────────────────────────
const RJ_WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function rjMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function rjFmtDateLong(d: Date): string {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${RJ_WEEK[d.getDay()]}`;
}
function rjFmtDateShort(d: Date): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
function rjRangeDays(a: Date, b: Date): number {
  return Math.max(1, Math.round((rjMidnight(b).getTime() - rjMidnight(a).getTime()) / 86400000) + 1);
}
function rjDaysLabel(a: Date, b: Date): string {
  const n = rjRangeDays(a, b);
  return n <= 1 ? '当天往返' : `${n} 天`;
}
function rjPastLabel(d: Date): string {
  const today = rjMidnight(new Date());
  const diff = Math.round((today.getTime() - rjMidnight(d).getTime()) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff < 7) return `${diff} 天前`;
  if (diff < 30) return `${Math.floor(diff / 7)} 周前`;
  if (diff < 365) return `${Math.floor(diff / 30)} 个月前`;
  return `${Math.floor(diff / 365)} 年前`;
}

const RJ_DIFFS: Poi['diff'][] = ['易', '中', '中高', '高'];
const PHOTO_TONES: Tone[] = ['ridge', 'forest', 'dusk', 'snow', 'river', 'moss', 'rock', 'sand'];
const RJ_AVATAR_POOL = ['#0A84FF', '#34C759', '#FF9F0A', '#AF52DE', '#FF5C3A', '#5AC8FA'];
function iniOf(n: string): string {
  const s = (n || '').trim();
  return s.slice(0, /[a-zA-Z]/.test(s[0] || '') ? 2 : 1) || '友';
}

// ──────────────────────────────────────────────────────────────
// Track-shape preview — projects real lat/lon into an SVG polyline
// ──────────────────────────────────────────────────────────────
function UTTrackMap({ stats, theme, height = 158 }: { stats: TrackStats; theme: Theme; height?: number }) {
  const W = 360;
  const H = height;
  const pad = 22;
  const { minLat, maxLat, minLon, maxLon } = stats.bbox;
  const meanLat = (minLat + maxLat) / 2;
  const cos = Math.cos((meanLat * Math.PI) / 180) || 1;
  const rx = (lon: number) => (lon - minLon) * cos;
  const ry = (lat: number) => lat - minLat;
  const spanX = Math.max(rx(maxLon), 1e-6);
  const spanY = Math.max(ry(maxLat), 1e-6);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const X = (lon: number) => offX + rx(lon) * scale;
  const Y = (lat: number) => H - (offY + ry(lat) * scale);
  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / 300));
  const coords: TrackPt[] = [];
  for (let i = 0; i < pts.length; i += stride) coords.push(pts[i]);
  if (coords[coords.length - 1] !== pts[pts.length - 1]) coords.push(pts[pts.length - 1]);
  const d = coords.map((p, i) => `${i ? 'L' : 'M'}${X(p.lon).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ');
  const s = pts[0];
  const e = pts[pts.length - 1];
  const gridColor = theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: theme.dark ? '#16181a' : '#e8edee', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgLinearGradient id="ut-trail" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.accent} stopOpacity={0.55} />
            <Stop offset="1" stopColor={theme.accent} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((g, i) => (
          <Line key={'h' + i} x1={0} y1={H * g} x2={W} y2={H * g} stroke={gridColor} strokeWidth={1} />
        ))}
        {[0.25, 0.5, 0.75].map((g, i) => (
          <Line key={'v' + i} x1={W * g} y1={0} x2={W * g} y2={H} stroke={gridColor} strokeWidth={1} />
        ))}
        <Path d={d} fill="none" stroke={theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)'} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" translateY={1.5} />
        <Path d={d} fill="none" stroke="url(#ut-trail)" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={X(s.lon)} cy={Y(s.lat)} r={6} fill="#34C759" stroke="#fff" strokeWidth={2.2} />
        <Circle cx={X(e.lon)} cy={Y(e.lat)} r={6} fill={theme.danger} stroke="#fff" strokeWidth={2.2} />
      </Svg>
      <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
          <Text style={{ fontSize: 10.5, color: theme.text2 }}>起点</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
          <Text style={{ fontSize: 10.5, color: theme.text2 }}>终点</Text>
        </View>
      </View>
      <View style={{ position: 'absolute', right: 12, top: 10, backgroundColor: theme.dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: theme.text3, letterSpacing: 0.3 }}>{stats.count} 个轨迹点</Text>
      </View>
    </View>
  );
}

// Elevation profile — area chart from real ele samples
function UTElevation({ stats, theme }: { stats: TrackStats; theme: Theme }) {
  if (!stats.hasEle || stats.minEle === null || stats.maxEle === null) return null;
  const W = 360;
  const H = 92;
  const pad = 4;
  const eles = stats.points.map((p) => p.ele);
  const cum = stats.cum;
  const total = cum[cum.length - 1] || 1;
  const lo = stats.minEle;
  const hi = stats.maxEle;
  const range = Math.max(hi - lo, 1);
  const X = (i: number) => pad + (cum[i] / total) * (W - pad * 2);
  const Y = (e: number) => H - 14 - ((e - lo) / range) * (H - 22) + 4;
  const stride = Math.max(1, Math.floor(eles.length / 240));
  let line = '';
  for (let i = 0; i < eles.length; i += stride) {
    if (!isFinite(eles[i])) continue;
    line += `${line ? 'L' : 'M'}${X(i).toFixed(1)},${Y(eles[i]).toFixed(1)} `;
  }
  const area = `${line} L${X(eles.length - 1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`;
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgLinearGradient id="ut-ele" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.accent} stopOpacity={0.3} />
            <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Path d={area} fill="url(#ut-ele)" />
        <Path d={line} fill="none" stroke={theme.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 2 }}>
        <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{lo} m</Text>
        <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>距离 {fmtDist(stats.distM)}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{hi} m</Text>
      </View>
    </View>
  );
}

function UTStatTile({ theme, label, value, accent }: { theme: Theme; label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
      <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: '700', color: accent ? theme.accent : theme.text, letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: theme.text2, marginTop: 3, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Visibility (私人记录 / 公开路线)
// ──────────────────────────────────────────────────────────────
function RJVisibility({ theme, value, onChange }: { theme: Theme; value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: 'private', label: '私人记录', sub: '只有自己能看到这段回忆', icon: 'eye' as const },
    { v: 'public', label: '公开路线', sub: '同时生成可被搜索 · 收藏的路线', icon: 'route' as const },
  ];
  return (
    <View style={{ gap: 8 }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <Press
            key={o.v}
            onPress={() => onChange(o.v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: on ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: on ? theme.accent : theme.hairline }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={o.icon} color={on ? '#fff' : theme.text2} size={17} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: on ? theme.accent : theme.text }}>{o.label}</Text>
              <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>{o.sub}</Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.2)', backgroundColor: on ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} /> : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Track block — sample-driven (no native file picker)
// ──────────────────────────────────────────────────────────────
function RJTrackBlock({ theme, track, onIngest, onRemove, busy, onToast }: { theme: Theme; track: Track | null; onIngest: (text: string, fname: string, region: string | null, tone: Tone | null) => void; onRemove: () => void; busy: boolean; onToast: (m: string) => void }) {
  if (track) {
    const stats = track.stats;
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(52,199,89,0.14)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(52,199,89,0.4)' }}>
          <Icon name="check" color="#34C759" size={13} strokeWidth={2.6} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: MONO, fontSize: 11.5, fontWeight: '600', color: theme.dark ? '#5BDC7E' : '#1E9E48' }}>
            {track.fileName} · {track.fileFormat}
          </Text>
          <Press onPress={onRemove} style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={theme.text3} size={12} />
          </Press>
        </View>
        <UTTrackMap stats={stats} theme={theme} height={158} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <UTStatTile theme={theme} label="总距离" value={fmtDist(stats.distM)} accent />
          <UTStatTile theme={theme} label="累计爬升" value={stats.hasEle ? `${stats.ascent} m` : '—'} />
          <UTStatTile theme={theme} label="用时" value={stats.hasTime ? fmtDur(stats.durationMs) : '—'} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <Press
        onPress={() => !busy && onToast('本地演示 · 请选择下方示例轨迹')}
        style={{ borderRadius: 16, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, marginBottom: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={theme.accent} /> : <Icon name="upload" color={theme.accent} size={24} />}
        </View>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text }}>{busy ? '正在解析轨迹…' : '添加轨迹文件'}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 6, letterSpacing: 0.3 }}>支持 .GPX · .KML</Text>
      </Press>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: theme.text3, marginRight: 2 }}>没有文件？</Text>
        {SAMPLES.map((sp) => (
          <Press
            key={sp.key}
            onPress={() => {
              if (busy) return;
              let txt = makeSampleGpx(sp.spec);
              if (sp.label.endsWith('.kml')) txt = gpxToKml(txt);
              onIngest(txt, sp.label, sp.region, sp.tone);
            }}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: theme.accentSoft }}
          >
            <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: '600', color: theme.accent }}>{sp.label}</Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Hero — cover photo (placeholder) + title
// ──────────────────────────────────────────────────────────────
function RJHero({ theme, photos, onAdd, onRemove, name, setName, nameMissing }: { theme: Theme; photos: RJPhoto[]; onAdd: () => void; onRemove: (id: string) => void; name: string; setName: (v: string) => void; nameMissing: boolean }) {
  const cover = photos[0];
  return (
    <View style={{ marginBottom: 26 }}>
      {cover ? (
        <View style={{ width: '100%', height: 210, borderRadius: 22, overflow: 'hidden' }}>
          <PhotoTile tone={cover.tone} seed={cover.id} radius={22} darken style={{ width: '100%', height: '100%' }} resWidth={1200} />
          <View style={{ position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.42)' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.4 }}>封面</Text>
          </View>
          <Press onPress={() => onRemove(cover.id)} style={{ position: 'absolute', right: 10, top: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color="#fff" size={14} />
          </Press>
        </View>
      ) : (
        <Press onPress={onAdd} style={{ width: '100%', height: 170, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" color={theme.accent} size={26} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>添加封面照片</Text>
          <Text style={{ fontSize: 12, color: theme.text3 }}>这段旅程的封面 · 没有也可以</Text>
        </Press>
      )}
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="给这段旅程起个名字"
        placeholderTextColor={theme.text3}
        maxLength={32}
        style={{ marginTop: 18, paddingBottom: 11, paddingHorizontal: 2, borderBottomWidth: 1.5, borderBottomColor: nameMissing ? (theme.dark ? 'rgba(255,69,58,0.5)' : 'rgba(255,59,48,0.4)') : theme.hairline, fontSize: 25, fontWeight: '700', letterSpacing: -0.5, color: theme.text }}
      />
      <Text style={{ fontSize: 11.5, color: nameMissing ? theme.danger : theme.text3, marginTop: 8, paddingLeft: 2 }}>{nameMissing ? '给这段旅程起个名字（必填）' : '点击上方可重新命名'}</Text>
    </View>
  );
}

// Moments — photo gallery (placeholders), separate from the cover
function RJMoments({ theme, moments, onAdd, onRemove, onSetCover }: { theme: Theme; moments: RJPhoto[]; onAdd: () => void; onRemove: (id: string) => void; onSetCover: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {moments.map((p) => (
        <View key={p.id} style={{ width: '31.7%', aspectRatio: 1, borderRadius: 11, overflow: 'hidden' }}>
          <PhotoTile tone={p.tone} seed={p.id} radius={11} style={{ width: '100%', height: '100%' }} resWidth={420} />
          <Press onPress={() => onSetCover(p.id)} style={{ position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#fff' }}>设为封面</Text>
          </Press>
          <Press onPress={() => onRemove(p.id)} style={{ position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color="#fff" size={10} />
          </Press>
        </View>
      ))}
      <Press onPress={onAdd} style={{ width: '31.7%', aspectRatio: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)' }}>
        <Icon name="plus" color={theme.accent} size={20} strokeWidth={2.2} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: theme.accent }}>添加</Text>
      </Press>
    </View>
  );
}

// When & where — date range + region
function RJFacts({ theme, date, endDate, onOpenDate, region, setRegion, onOpenMap, hasTrack }: { theme: Theme; date: Date; endDate: Date; onOpenDate: (f: 'start' | 'end') => void; region: string; setRegion: (v: string) => void; onOpenMap: () => void; hasTrack: boolean }) {
  return (
    <View style={{ marginBottom: 22, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' }}>
      {/* When */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" color={theme.accent} size={17} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11.5, color: theme.text2 }}>日期 · {rjDaysLabel(date, endDate)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }}>
            <Press onPress={() => onOpenDate('start')}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{rjFmtDateShort(date)}</Text>
            </Press>
            <Svg width={16} height={7} viewBox="0 0 22 8" fill="none">
              <Path d="M1 4h18m0 0-3-3m3 3-3 3" stroke={theme.text3} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Press onPress={() => onOpenDate('end')}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{rjFmtDateShort(endDate)}</Text>
            </Press>
          </View>
        </View>
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 60 }} />
      {/* Where */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" color={theme.accent} size={17} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11.5, color: theme.text2 }}>地点{hasTrack ? ' · 由轨迹推得' : ''}</Text>
          <TextInput value={region} onChangeText={setRegion} placeholder="例如 杭州 · 西湖" placeholderTextColor={theme.text3} style={{ fontSize: 15.5, fontWeight: '600', color: theme.text, padding: 0, marginTop: 1 }} />
        </View>
        <Press onPress={onOpenMap} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accentSoft }}>
          <Icon name="route" color={theme.accent} size={13} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.accent }}>地图</Text>
        </Press>
      </View>
    </View>
  );
}

// Collapsible "更多"
function RJMore({ theme, summary, children }: { theme: Theme; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const rot = useRef(new Animated.Value(0)).current;
  const toggle = () => {
    Animated.timing(rot, { toValue: open ? 0 : 1, duration: 220, useNativeDriver: true }).start();
    setOpen((o) => !o);
  };
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View style={{ marginBottom: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.hairline }}>
      <Press onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 15, paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>更多</Text>
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: 12.5, color: theme.text3, opacity: open ? 0 : 1 }}>{summary}</Text>
        <Animated.View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate }] }}>
          <Icon name="chevronDown" color={theme.accent} size={14} />
        </Animated.View>
      </Press>
      {open ? <View style={{ paddingTop: 4 }}>{children}</View> : null}
    </View>
  );
}

// Companions roster
function RJCompanions({ theme, companions, onAdd, onRemove }: { theme: Theme; companions: RJCompanion[]; onAdd: () => void; onRemove: (id: string) => void }) {
  const Avatar = ({ color, label }: { color: string; label: string }) => (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '700', fontSize: 14, color: '#fff' }}>{label}</Text>
    </View>
  );
  const Badge = ({ text, accent }: { text: string; accent?: boolean }) => (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: accent ? theme.accentSoft : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, color: accent ? theme.accent : theme.text2 }}>{text}</Text>
    </View>
  );
  const divider = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 65 }} />;
  return (
    <View>
      <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13, paddingVertical: 11 }}>
          <Avatar color={theme.accent} label="陈" />
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>陈泽宇</Text>
            <Badge text="我" />
            <Badge text="发起人" accent />
          </View>
        </View>
        {companions.map((c, i) => (
          <React.Fragment key={c.id}>
            {divider}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13, paddingVertical: 11 }}>
              <Avatar color={RJ_AVATAR_POOL[i % RJ_AVATAR_POOL.length]} label={iniOf(c.name)} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.text, flexShrink: 1 }}>{c.name}</Text>
                {c.role ? <Badge text={c.role} accent={c.role === '领队' || c.role === '向导'} /> : null}
              </View>
              <Press onPress={() => onRemove(c.id)} style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                <Icon name="close" color={theme.text2} size={12} />
              </Press>
            </View>
          </React.Fragment>
        ))}
      </View>
      <Press onPress={onAdd} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.accentSoft }}>
        <Icon name="plus" color={theme.accent} size={18} strokeWidth={2.4} />
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>添加同行</Text>
      </Press>
    </View>
  );
}

// Companion add sheet — name (required) + optional role
function RJCompanionSheet({ theme, color, onAdd, onClose }: { theme: Theme; color: string; onAdd: (c: { name: string; role: string }) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onAdd({ name: name.trim(), role: role.trim() });
    onClose();
  };
  const initial = iniOf(name);
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <Press onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>取消</Text>
            </Press>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>添加同行</Text>
            <Press onPress={submit} style={{ padding: 4 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>完成</Text>
            </Press>
          </View>
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30, fontWeight: '700', color: '#fff' }}>{initial}</Text>
            </View>
          </View>
          <TextInput value={name} onChangeText={setName} placeholder="输入伙伴名称" placeholderTextColor={theme.text3} maxLength={16} textAlign="center" style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: theme.hairline, fontSize: 16, fontWeight: '600', color: theme.text }} />
          <Text style={{ fontSize: 12, color: theme.text2, fontWeight: '600', marginTop: 18, marginBottom: 8, marginLeft: 2 }}>分工</Text>
          <TextInput value={role} onChangeText={setRole} placeholder="如 领队 / 摄影（可留空）" placeholderTextColor={theme.text3} maxLength={6} style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: theme.hairline, fontSize: 15.5, color: theme.text }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['领队', '向导', '医疗', '后勤', '摄影'].map((r) => {
              const on = r === role.trim();
              return (
                <Press key={r} onPress={() => setRole(on ? '' : r)} style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: on ? theme.accent : theme.hairline }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : theme.text2 }}>{r}</Text>
                </Press>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </NJBottomSheet>
  );
}

// Add chooser — invite vs manual
function RJAddChooser({ theme, onInvite, onManual, onClose }: { theme: Theme; onInvite: () => void; onManual: () => void; onClose: () => void }) {
  const Row = ({ icon, title, sub, onPress }: { icon: 'share' | 'user'; title: string; sub: string; onPress: () => void }) => (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={theme.accent} size={20} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{title}</Text>
        <Text style={{ fontSize: 11.5, color: theme.text2, marginTop: 2 }}>{sub}</Text>
      </View>
      <Icon name="chevronR" color={theme.text3} size={15} />
    </Press>
  );
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text, paddingVertical: 8 }}>添加同行</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Row icon="share" title="邀请伙伴加入" sub="发送链接，对方加入后可一起补充照片" onPress={onInvite} />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 67 }} />
          <Row icon="user" title="手动添加" sub="直接填写名字和分工" onPress={onManual} />
        </View>
        <Press onPress={onClose} style={{ marginTop: 10, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text2 }}>取消</Text>
        </Press>
      </View>
    </NJBottomSheet>
  );
}

// Date sheet (past dates allowed)
function RJDateSheet({ theme, date, field, onPick, onClose }: { theme: Theme; date: Date; field: 'start' | 'end'; onPick: (d: Date) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(date);
  const title = field === 'end' ? '结束日期' : '出发日期';
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Press onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>取消</Text>
          </Press>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{title}</Text>
          <Press onPress={() => { onPick(draft); onClose(); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>完成</Text>
          </Press>
        </View>
        <NJMiniCalendar theme={theme} selectedDate={draft} onSelect={setDraft} allowPast />
        <Text style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: theme.text2 }}>
          {rjFmtDateLong(draft)} <Text style={{ color: theme.text3 }}>· {rjPastLabel(draft)}</Text>
        </Text>
      </View>
    </NJBottomSheet>
  );
}

// Map location picker — tap a stylized China map to drop a pin → region
const MAP_BOUNDS = { lonMin: 96, lonMax: 123, latMin: 26, latMax: 42 };
function RJMapPickSheet({ theme, onPick, onClose }: { theme: Theme; onPick: (label: string) => void; onClose: () => void }) {
  const H = 230;
  const [box, setBox] = useState({ w: 320, h: H });
  const [pin, setPin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const project = (lat: number, lon: number) => ({
    x: ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * box.w,
    y: box.h - ((lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * box.h,
  });
  const place = (lat: number, lon: number, knownLabel?: string) => {
    setPin({ lat, lon, label: knownLabel || guessRegion(lat, lon) });
  };
  const onTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const lon = MAP_BOUNDS.lonMin + (locationX / box.w) * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
    const lat = MAP_BOUNDS.latMin + ((box.h - locationY) / box.h) * (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin);
    place(lat, lon);
  };
  const onBoxLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };
  const gridColor = theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Press onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>取消</Text>
          </Press>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>选择地点</Text>
          <Press onPress={() => pin && (onPick(pin.label), onClose())} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: pin ? theme.accent : theme.text3 }}>完成</Text>
          </Press>
        </View>
        <Text style={{ fontSize: 12, color: theme.text2, textAlign: 'center', marginBottom: 12 }}>点选常去的山域，或点地图任意位置放一个标记</Text>

        <View onLayout={onBoxLayout} style={{ height: H, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? '#16181a' : '#e7ecee' }}>
          {/* tap layer */}
          <Press onPress={onTap} style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              {[0.2, 0.4, 0.6, 0.8].map((g, i) => (
                <Line key={'h' + i} x1={0} y1={box.h * g} x2={box.w} y2={box.h * g} stroke={gridColor} strokeWidth={1} />
              ))}
              {[0.2, 0.4, 0.6, 0.8].map((g, i) => (
                <Line key={'v' + i} x1={box.w * g} y1={0} x2={box.w * g} y2={box.h} stroke={gridColor} strokeWidth={1} />
              ))}
              {pin
                ? (() => {
                    const { x, y } = project(pin.lat, pin.lon);
                    return (
                      <>
                        <Circle cx={x} cy={y} r={9} fill={theme.accent} opacity={0.18} />
                        <Path d={`M${x} ${y - 16} c4.4 0 8 3.4 8 7.6 0 5.4-8 12.4-8 12.4s-8-7-8-12.4c0-4.2 3.6-7.6 8-7.6Z`} fill={theme.accent} stroke="#fff" strokeWidth={1.6} />
                        <Circle cx={x} cy={y - 8.4} r={2.6} fill="#fff" />
                      </>
                    );
                  })()
                : null}
            </Svg>
          </Press>
          {/* region hint hotspots */}
          {REGION_HINTS.map((h, i) => {
            const { x, y } = project(h.lat, h.lon);
            const sel = pin && pin.label === h.name;
            return (
              <Press key={i} onPress={() => place(h.lat, h.lon, h.name)} style={{ position: 'absolute', left: x - 13, top: y - 13, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: sel ? 10 : 7, height: sel ? 10 : 7, borderRadius: 5, backgroundColor: sel ? theme.accent : theme.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.32)' }} />
              </Press>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Icon name="pin" color={pin ? theme.accent : theme.text3} size={18} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: pin ? theme.text : theme.text3 }}>{pin ? pin.label : '尚未选择地点'}</Text>
            {pin ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, marginTop: 2, letterSpacing: 0.2 }}>{fmtCoord(pin.lat, pin.lon)}</Text> : null}
          </View>
        </View>
      </View>
    </NJBottomSheet>
  );
}

// ──────────────────────────────────────────────────────────────
// Success
// ──────────────────────────────────────────────────────────────
function RJSuccess({ theme, name, dateLabel, distLabel, visibility }: { theme: Theme; name: string; dateLabel: string; distLabel: string; visibility: string }) {
  const pop = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], shadowColor: theme.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
        <Icon name="check" color="#fff" size={48} strokeWidth={3.2} />
      </Animated.View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, marginTop: 26, letterSpacing: -0.5 }}>已记录回忆</Text>
      <Text style={{ fontSize: 14.5, color: theme.text2, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>《{name}》</Text>
        {'\n'}
        {dateLabel}
        {distLabel ? ` · ${distLabel}` : ''}
        {visibility === 'public' ? '\n已同步生成一条公开路线' : ''}
      </Text>
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 20, letterSpacing: 0.4 }}>正在跳转至我的回忆…</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the completed journey Poi
// ──────────────────────────────────────────────────────────────
function buildRecordJourney(args: {
  name: string;
  region: string;
  date: Date;
  endDate: Date;
  diff: Poi['diff'];
  tone: Tone;
  track: Track | null;
  manualDist: string;
  manualAsc: string;
  notes: string;
  companions: RJCompanion[];
  photoCount: number;
}): Poi {
  const { name, region, date, endDate, diff, tone, track, manualDist, manualAsc, notes, companions } = args;
  const start = track ? track.stats.points[0] : null;
  const lng = start ? start.lon : 104.0;
  const lat = start ? start.lat : 35.0;
  const distLabel = track ? fmtDist(track.stats.distM) : manualDist ? `${manualDist} km` : '—';
  const ascLabel = track ? (track.stats.hasEle ? `+${track.stats.ascent} m` : '—') : manualAsc ? `+${manualAsc} m` : '—';
  const totalDays = rjRangeDays(date, endDate);
  const companionList: Companion[] = [
    SELF,
    ...companions.map((c, i) => ({ ini: iniOf(c.name), name: c.name, role: c.role || undefined, color: RJ_AVATAR_POOL[i % RJ_AVATAR_POOL.length] })),
  ];
  return {
    id: `j-${Date.now()}`,
    kind: 'journey',
    status: 'completed' as JourneyStatus,
    name: name.trim() || '未命名旅程',
    region: region.trim() || '未命名地点',
    coord: `${lat.toFixed(2)} N · ${lng.toFixed(2)} E`,
    lng,
    lat,
    dist: distLabel,
    asc: ascLabel,
    diff,
    tone,
    days: rjDaysLabel(date, endDate),
    date: `${date.getFullYear()} · ${date.getMonth() + 1} 月`,
    totalDays,
    companions: companions.length,
    companionList,
    mine: true,
    fav: false,
    desc: notes.trim(),
  };
}

// ──────────────────────────────────────────────────────────────
// Main flow
// ──────────────────────────────────────────────────────────────
export function RecordJourneySheet({ theme, onBack, onCreate, onToast }: { theme: Theme; onBack: () => void; onClose: () => void; onCreate: (poi: Poi) => void; onToast: (m: string) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0); // 0 form · 1 success
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [track, setTrack] = useState<Track | null>(null);
  const [photos, setPhotos] = useState<RJPhoto[]>([]);

  const [name, setName] = useState('');
  const [date, setDate] = useState<Date>(() => rjMidnight(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => rjMidnight(new Date()));
  const [region, setRegion] = useState('');
  const [companions, setCompanions] = useState<RJCompanion[]>([]);
  const [manualDist, setManualDist] = useState('');
  const [manualAsc, setManualAsc] = useState('');
  const [diff, setDiff] = useState<Poi['diff']>('中');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [tone, setTone] = useState<Tone>('ridge');

  const [dateOpen, setDateOpen] = useState(false);
  const [dateField, setDateField] = useState<'start' | 'end'>('start');
  const [mapOpen, setMapOpen] = useState(false);
  const [companionAdd, setCompanionAdd] = useState<null | 'choose' | 'manual' | 'invite'>(null);

  const nameInit = useRef(false);

  const onIngest = (text: string, fname: string, presetRegion: string | null, presetTone: Tone | null) => {
    setError(null);
    setBusy(true);
    setTimeout(() => {
      const parsed = parseTrack(text, fname);
      if (parsed.error || !parsed.points) {
        setBusy(false);
        setError(parsed.error || '无法解析轨迹');
        return;
      }
      const st = computeStats(parsed.points);
      if (!st) {
        setBusy(false);
        setError('轨迹点太少，无法生成路线');
        return;
      }
      const tn = presetTone || PHOTO_TONES[Math.floor((st.distM + st.count) % PHOTO_TONES.length)];
      setTrack({ stats: st, fileName: fname, fileFormat: parsed.format || 'GPX' });
      setTone(tn);
      const base = (parsed.name && parsed.name.trim()) || fname.replace(/\.[^.]+$/, '');
      if (!nameInit.current && !name) {
        setName(base);
        nameInit.current = true;
      }
      if (!region) setRegion(presetRegion || guessRegion(st.points[0].lat, st.points[0].lon));
      setDiff(suggestDifficulty(st) as Poi['diff']);
      if (st.hasTime && st.startTime) {
        const s = rjMidnight(st.startTime);
        setDate(s);
        const e = st.durationMs ? rjMidnight(new Date(st.startTime.getTime() + st.durationMs)) : s;
        setEndDate(e < s ? s : e);
      }
      setBusy(false);
    }, 480);
  };

  const addPhoto = () =>
    setPhotos((prev) => [...prev, { id: `p-${Date.now()}-${prev.length}`, tone: PHOTO_TONES[prev.length % PHOTO_TONES.length] }]);
  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));
  const setCover = (id: string) =>
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev;
      const cp = prev.slice();
      const [item] = cp.splice(idx, 1);
      cp.unshift(item);
      return cp;
    });

  const addCompanion = (c: { name: string; role: string }) => setCompanions((prev) => [...prev, { id: `c-${Date.now()}-${prev.length}`, name: c.name, role: c.role }]);
  const removeCompanion = (id: string) => setCompanions((prev) => prev.filter((p) => p.id !== id));

  const openDate = (field: 'start' | 'end') => {
    setDateField(field);
    setDateOpen(true);
  };
  const pickDate = (d: Date) => {
    if (dateField === 'end') setEndDate(d < date ? date : d);
    else {
      setDate(d);
      if (endDate < d) setEndDate(d);
    }
  };

  const nameValid = name.trim().length > 0;
  const distLabel = track ? fmtDist(track.stats.distM) : manualDist ? `${manualDist} km` : '';
  const moreSummary = [companions.length > 0 ? `${companions.length + 1} 人同行` : '只有自己', `难度 ${diff}`].join(' · ');

  const finish = () => {
    setStep(1);
    const jTone = photos[0] ? photos[0].tone : tone;
    const poi = buildRecordJourney({ name, region, date, endDate, diff, tone: jTone, track, manualDist, manualAsc, notes, companions, photoCount: photos.length });
    setTimeout(() => onCreate(poi), 1500);
  };
  const next = () => {
    if (!nameValid) return;
    setError(null);
    finish();
  };

  const cta = nameValid ? '完成记录' : '请填写旅程名称';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 200 }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Top bar */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {step < 1 ? (
            <NJRoundBtn theme={theme} onPress={onBack}>
              <Icon name="chevronL" color={theme.text} size={16} />
            </NJRoundBtn>
          ) : (
            <View style={{ width: 38, height: 38 }} />
          )}
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{step === 0 ? '旅程回忆' : ''}</Text>
          <View style={{ width: 38, height: 38 }} />
        </View>

        {/* Body */}
        {step === 1 ? (
          <RJSuccess theme={theme} name={name.trim()} dateLabel={`${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`} distLabel={distLabel} visibility={visibility} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
            {/* 1 · cover + title */}
            <RJHero theme={theme} photos={photos} onAdd={addPhoto} onRemove={removePhoto} name={name} setName={setName} nameMissing={!name.trim()} />

            {/* 2 · moments */}
            <NJSection theme={theme} label="瞬间" hint={photos.length > 1 ? `${photos.length - 1} 张` : undefined}>
              <RJMoments theme={theme} moments={photos.slice(1)} onAdd={addPhoto} onRemove={removePhoto} onSetCover={setCover} />
            </NJSection>

            {/* 3 · story */}
            <NJSection theme={theme} label="简介">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="写下这段旅程的故事 · 天气、风景、同行、难忘的瞬间…"
                placeholderTextColor={theme.text3}
                style={{ minHeight: 84, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, fontSize: 14.5, lineHeight: 22, color: theme.text, textAlignVertical: 'top' }}
              />
            </NJSection>

            {/* 4 · when & where */}
            <RJFacts theme={theme} date={date} endDate={endDate} onOpenDate={openDate} region={region} setRegion={setRegion} onOpenMap={() => setMapOpen(true)} hasTrack={!!track} />

            {/* 5 · the route */}
            <NJSection theme={theme} label="轨迹" hint={track ? '来自轨迹' : undefined}>
              <RJTrackBlock theme={theme} track={track} onIngest={onIngest} onRemove={() => setTrack(null)} busy={busy} onToast={onToast} />
              {track && track.stats.hasEle ? (
                <View style={{ marginTop: 12 }}>
                  <UTElevation stats={track.stats} theme={theme} />
                </View>
              ) : null}
            </NJSection>

            {/* 6 · more (manual data / companions / difficulty) */}
            <RJMore theme={theme} summary={moreSummary}>
              {!track ? (
                <NJSection theme={theme} label="数据">
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([['距离', manualDist, setManualDist, 'km'], ['爬升', manualAsc, setManualAsc, 'm']] as const).map(([lab, val, set, unit], i) => (
                      <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 48, borderRadius: 13, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                        <Text style={{ fontSize: 12.5, color: theme.text2 }}>{lab}</Text>
                        <TextInput value={val} onChangeText={(t) => set(t.replace(/[^0-9.]/g, ''))} placeholder="—" placeholderTextColor={theme.text3} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text, textAlign: 'right', padding: 0 }} />
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{unit}</Text>
                      </View>
                    ))}
                  </View>
                </NJSection>
              ) : null}

              <NJSection theme={theme} label="同行伙伴" hint={companions.length > 0 ? `共 ${companions.length + 1} 人` : '默认只有自己'}>
                <RJCompanions theme={theme} companions={companions} onAdd={() => setCompanionAdd('choose')} onRemove={removeCompanion} />
              </NJSection>

              <NJSection theme={theme} label="难度" hint={track ? '已按距离与爬升预估' : undefined} style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {RJ_DIFFS.map((d) => {
                    const on = d === diff;
                    return (
                      <Press key={d} onPress={() => setDiff(d)} style={{ flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: on ? theme.accent : theme.hairline }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: on ? '#fff' : theme.text }}>{d}</Text>
                      </Press>
                    );
                  })}
                </View>
              </NJSection>
            </RJMore>

            {/* 7 · visibility */}
            <NJSection theme={theme} label="可见性">
              <RJVisibility theme={theme} value={visibility} onChange={setVisibility} />
            </NJSection>
          </ScrollView>
        )}

        {/* Error toast */}
        {error && step === 0 ? (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 96, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: theme.dangerSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.danger, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="close" color={theme.danger} size={15} />
            <Text style={{ fontSize: 12.5, color: theme.danger }}>{error}</Text>
          </View>
        ) : null}

        {/* Bottom CTA */}
        {step < 1 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
            <Press
              onPress={nameValid ? next : undefined}
              style={{
                height: 52,
                borderRadius: 16,
                backgroundColor: nameValid ? theme.accent : theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                ...(nameValid ? { shadowColor: theme.accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : {}),
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: nameValid ? '#fff' : theme.text3, letterSpacing: 0.2 }}>{cta}</Text>
              {nameValid ? <Icon name="chevronR" color="#fff" size={15} strokeWidth={2.4} /> : null}
            </Press>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Overlays */}
      {dateOpen ? <RJDateSheet theme={theme} date={dateField === 'end' ? endDate : date} field={dateField} onPick={pickDate} onClose={() => setDateOpen(false)} /> : null}
      {mapOpen ? <RJMapPickSheet theme={theme} onPick={(label) => setRegion(label)} onClose={() => setMapOpen(false)} /> : null}
      {companionAdd === 'choose' ? <RJAddChooser theme={theme} onInvite={() => setCompanionAdd('invite')} onManual={() => setCompanionAdd('manual')} onClose={() => setCompanionAdd(null)} /> : null}
      {companionAdd === 'manual' ? <RJCompanionSheet theme={theme} color={RJ_AVATAR_POOL[companions.length % RJ_AVATAR_POOL.length]} onAdd={addCompanion} onClose={() => setCompanionAdd(null)} /> : null}
      {companionAdd === 'invite' ? <NJSharePanel theme={theme} tripName={name.trim() || '这段旅程'} onClose={() => setCompanionAdd(null)} onToast={onToast} /> : null}
    </View>
  );
}
