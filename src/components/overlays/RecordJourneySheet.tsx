// RecordJourneySheet.tsx — 记录走过的: log a PAST hike from a recorded track
// and/or photos, producing a journey record.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Animated, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { File as FSFile } from 'expo-file-system';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Mapbox, { MapView, Camera, ShapeSource, LineLayer, MarkerView, Atmosphere, StyleImport } from '@rnmapbox/maps';
import { Theme } from '../../theme/theme';
import { shadow } from '../../theme/shadow';
import { MONO } from '../../theme/fonts';
import { Poi, Companion } from '../../data/pois';
import { Tone } from '../../data/tones';
import { TrackPt, TrackStats, haversine, computeStats, parseTrack, buildTrackData } from '../../lib/trackParser';
import { extractKmlFromKmz } from '../../lib/kmz';
import { PhotoTile } from '../PhotoTile';
import { Press } from '../Press';
import { Icon } from '../Icon';
import { NJSection, NJRoundBtn, NJMiniCalendar, NJBottomSheet, NJSharePanel, SELF } from './NewJourneyParts';
import { useI18n, TKey, TVars } from '../../i18n';
import { formatDuration } from '../../lib/time';
import { useData } from '../../data/DataContext';
import { uploadMedia } from '../../lib/storage';

type TFn = (key: TKey, vars?: TVars) => string;
interface Track {
  stats: TrackStats;
  fileName: string;
  fileFormat: string;
  sourceUri?: string;
}
interface RJPhoto {
  id: string;
  tone: Tone;
  uri?: string;
}
interface RJCompanion {
  id: string;
  name: string;
  role: string;
}


function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 1 : 2) + ' km';
  return Math.round(m) + ' m';
}
const fmtDur = formatDuration;
function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (!MAPBOX_TOKEN) return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&language=zh&limit=1&types=place,locality,district,region`;
    const res = await fetch(url);
    const json = await res.json();
    const f = json.features?.[0];
    if (!f) return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    const ctx = f.context as any[] | undefined;
    const region = ctx?.find((c: any) => c.id?.startsWith('region'))?.text;
    const place = f.text || '';
    return region && region !== place ? `${region} · ${place}` : place || f.place_name || '';
  } catch {
    return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  }
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
const RJ_WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
function rjMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function rjFmtDateLong(d: Date, t: TFn): string {
  const weekday = t(`record.weekday.${RJ_WEEK_KEYS[d.getDay()]}` as TKey);
  return t('record.date.longFull', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), weekday });
}
function rjFmtDateShort(d: Date, t: TFn): string {
  return t('record.date.short', { m: d.getMonth() + 1, d: d.getDate() });
}
function rjRangeDays(a: Date, b: Date): number {
  return Math.max(1, Math.round((rjMidnight(b).getTime() - rjMidnight(a).getTime()) / 86400000) + 1);
}
function rjDaysLabel(a: Date, b: Date, t: TFn): string {
  const n = rjRangeDays(a, b);
  return n <= 1 ? t('record.days.sameDay') : t('record.days.n', { n });
}
function rjPastLabel(d: Date, t: TFn): string {
  const today = rjMidnight(new Date());
  const diff = Math.round((today.getTime() - rjMidnight(d).getTime()) / 86400000);
  if (diff <= 0) return t('record.past.today');
  if (diff === 1) return t('record.past.yesterday');
  if (diff === 2) return t('record.past.dayBefore');
  if (diff < 7) return t('record.past.daysAgo', { n: diff });
  if (diff < 30) return t('record.past.weeksAgo', { n: Math.floor(diff / 7) });
  if (diff < 365) return t('record.past.monthsAgo', { n: Math.floor(diff / 30) });
  return t('record.past.yearsAgo', { n: Math.floor(diff / 365) });
}

const RJ_DIFFS: Poi['diff'][] = ['易', '中', '中高', '高'];
// Preset companion roles. The id is the stable stored value; the visible label
// is translated at render. Free-typed roles fall through unchanged.
const RJ_ROLE_PRESETS = ['leader', 'guide', 'medical', 'logistics', 'photo'] as const;
const RJ_ROLE_ACCENT = new Set<string>(['leader', 'guide']);
function roleLabel(role: string, t: TFn): string {
  return (RJ_ROLE_PRESETS as readonly string[]).includes(role) ? t(`record.role.${role}` as TKey) : role;
}
const PHOTO_TONES: Tone[] = ['ridge', 'forest', 'dusk', 'snow', 'river', 'moss', 'rock', 'sand'];
const RJ_AVATAR_POOL = ['#0A84FF', '#34C759', '#FF9F0A', '#AF52DE', '#FF5C3A', '#5AC8FA'];
function iniOf(n: string): string {
  const s = (n || '').trim();
  return s.slice(0, /[a-zA-Z]/.test(s[0] || '') ? 2 : 1) || '友';
}

// ──────────────────────────────────────────────────────────────
// Track-shape preview — real Mapbox map with route polyline
// ──────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
let _mbTokenSet = false;
function ensureMapboxToken() {
  if (!_mbTokenSet && MAPBOX_TOKEN) {
    Mapbox.setAccessToken(MAPBOX_TOKEN);
    _mbTokenSet = true;
  }
}
const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

function UTTrackMap({ stats, theme, height = 200 }: { stats: TrackStats; theme: Theme; height?: number }) {
  const { t } = useI18n();
  ensureMapboxToken();

  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / 500));
  const coords: [number, number][] = [];
  for (let i = 0; i < pts.length; i += stride) coords.push([pts[i].lon, pts[i].lat]);
  if (coords.length > 0 && (coords[coords.length - 1][0] !== pts[pts.length - 1].lon || coords[coords.length - 1][1] !== pts[pts.length - 1].lat)) {
    coords.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
  }

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    }],
  };

  const { minLat, maxLat, minLon, maxLon } = stats.bbox;
  const padDeg = Math.max((maxLat - minLat), (maxLon - minLon)) * 0.15;
  const bounds = {
    ne: [maxLon + padDeg, maxLat + padDeg] as [number, number],
    sw: [minLon - padDeg, minLat - padDeg] as [number, number],
  };

  const s = pts[0];
  const e = pts[pts.length - 1];

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
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
      >
        <Camera defaultSettings={{ bounds: { ...bounds, paddingLeft: 28, paddingRight: 28, paddingTop: 28, paddingBottom: 28 } }} />
        <StyleImport id="basemap" existing config={{ lightPreset: theme.mapLightPreset, showPlaceLabels: true, showRoadLabels: true, showPointOfInterestLabels: false, showTransitLabels: false } as any} />

        <ShapeSource id="track-route" shape={routeGeoJSON}>
          <LineLayer id="track-route-shadow" style={{ lineColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)', lineWidth: 6, lineBlur: 3, lineCap: 'round', lineJoin: 'round', lineTranslate: [0, 1.5] }} />
          <LineLayer id="track-route-line" style={{ lineColor: theme.accent, lineWidth: 3.5, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>

        <MarkerView coordinate={[s.lon, s.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#fff' }} />
        </MarkerView>
        <MarkerView coordinate={[e.lon, e.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.danger, borderWidth: 2.5, borderColor: '#fff' }} />
        </MarkerView>
      </MapView>

      <View style={{ position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
          <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('record.track.start')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
          <Text style={{ fontSize: 10.5, color: theme.dark ? '#ccc' : theme.text2 }}>{t('record.track.end')}</Text>
        </View>
      </View>
      <View style={{ position: 'absolute', right: 12, top: 10, backgroundColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.75)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
        <Text style={{ fontFamily: MONO, fontSize: 9.5, color: theme.dark ? '#ccc' : theme.text3, letterSpacing: 0.3 }}>{t('record.track.pointCount', { n: stats.count })}</Text>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Full-screen track map overlay — tap inline preview to open
// ──────────────────────────────────────────────────────────────
function TrackMapFull({ stats, theme, onClose }: { stats: TrackStats; theme: Theme; onClose: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  ensureMapboxToken();

  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / 800));
  const coords: [number, number][] = [];
  for (let i = 0; i < pts.length; i += stride) coords.push([pts[i].lon, pts[i].lat]);
  if (coords.length > 0 && (coords[coords.length - 1][0] !== pts[pts.length - 1].lon || coords[coords.length - 1][1] !== pts[pts.length - 1].lat)) {
    coords.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
  }

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
  };

  const { minLat, maxLat, minLon, maxLon } = stats.bbox;
  const padDeg = Math.max((maxLat - minLat), (maxLon - minLon)) * 0.12;
  const bounds = {
    ne: [maxLon + padDeg, maxLat + padDeg] as [number, number],
    sw: [minLon - padDeg, minLat - padDeg] as [number, number],
  };
  const s = pts[0];
  const e = pts[pts.length - 1];

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 300 }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled
      >
        <Camera defaultSettings={{ bounds: { ...bounds, paddingLeft: 40, paddingRight: 40, paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100 } }} />
        <StyleImport id="basemap" existing config={{ lightPreset: theme.mapLightPreset, showPlaceLabels: true, showRoadLabels: true, showPointOfInterestLabels: true, showTransitLabels: true } as any} />

        <ShapeSource id="full-track-route" shape={routeGeoJSON}>
          <LineLayer id="full-track-shadow" style={{ lineColor: theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)', lineWidth: 7, lineBlur: 3, lineCap: 'round', lineJoin: 'round', lineTranslate: [0, 2] }} />
          <LineLayer id="full-track-line" style={{ lineColor: theme.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>

        <MarkerView coordinate={[s.lon, s.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#34C759', borderWidth: 3, borderColor: '#fff' }} />
        </MarkerView>
        <MarkerView coordinate={[e.lon, e.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: theme.danger, borderWidth: 3, borderColor: '#fff' }} />
        </MarkerView>
      </MapView>

      {/* top bar */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Press onPress={onClose} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Icon name="chevronL" color={theme.text} size={16} />
        </Press>
      </View>

      {/* bottom stats */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 12, left: 12, right: 12, flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.accent }}>{fmtDist(stats.distM)}</Text>
          <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{t('record.track.totalDistance')}</Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{stats.hasEle ? `${stats.ascent} m` : '—'}</Text>
          <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{t('record.track.totalAscent')}</Text>
        </View>
        <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text }}>{stats.hasTime ? fmtDur(stats.durationMs, t) : stats.hasEle && stats.maxEle !== null ? `${stats.maxEle} m` : '—'}</Text>
          <Text style={{ fontSize: 10, color: theme.text2, marginTop: 2 }}>{stats.hasTime ? t('record.track.duration') : stats.hasEle ? t('record.track.maxEle') : '—'}</Text>
        </View>
      </View>

      {/* legend */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 88, left: 12, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: theme.dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' }} />
          <Text style={{ fontSize: 11, color: theme.text2 }}>{t('record.track.start')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} />
          <Text style={{ fontSize: 11, color: theme.text2 }}>{t('record.track.end')}</Text>
        </View>
      </View>
    </View>
  );
}

// Elevation profile — area chart from real ele samples
function UTElevation({ stats, theme }: { stats: TrackStats; theme: Theme }) {
  const { t } = useI18n();
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
        <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.text3 }}>{t('record.track.distanceLabel', { dist: fmtDist(stats.distM) })}</Text>
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
  const { t } = useI18n();
  const opts = [
    { v: 'private', label: t('record.visibility.privateLabel'), sub: t('record.visibility.privateSub'), icon: 'eye' as const },
    { v: 'public', label: t('record.visibility.publicLabel'), sub: t('record.visibility.publicSub'), icon: 'route' as const },
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
// Track block — real file picker + sample fallback
// ──────────────────────────────────────────────────────────────
function RJTrackBlock({ theme, track, onIngest, onRemove, busy, setBusy, setError, onToast, onOpenMap }: { theme: Theme; track: Track | null; onIngest: (text: string, fname: string, region: string | null, tone: Tone | null, sourceUri?: string) => void; onRemove: () => void; busy: boolean; setBusy: (b: boolean) => void; setError: (e: string | null) => void; onToast: (m: string) => void; onOpenMap: () => void }) {
  const { t } = useI18n();

  const pickFile = async () => {
    if (busy) return;
    try {
      const result = await FSFile.pickFileAsync({ mimeTypes: '*/*' });
      if (result.canceled || !result.result) return;
      const file = result.result;
      const fname = file.name || 'track.gpx';
      const ext = (fname.split('.').pop() || '').toLowerCase();
      if (ext !== 'gpx' && ext !== 'kml' && ext !== 'kmz') {
        setError(t('record.track.errFormat'));
        return;
      }
      setBusy(true);
      setError(null);
      let text: string;
      let parseName = fname;
      if (ext === 'kmz') {
        const buffer = await file.arrayBuffer();
        const kml = extractKmlFromKmz(new Uint8Array(buffer));
        if (!kml) {
          setBusy(false);
          setError(t('record.track.errParse'));
          return;
        }
        text = kml;
        parseName = fname.replace(/\.kmz$/i, '.kml');
      } else {
        text = await file.text();
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      console.log('[Track] read file:', fname, 'size:', text.length, 'first 120:', text.slice(0, 120));
      onIngest(text, parseName, null, null, file.uri);
    } catch (e) {
      console.warn('[Track] pickFile error:', e);
      setBusy(false);
      setError(t('record.track.errParse') + (e instanceof Error ? `: ${e.message}` : ''));
    }
  };

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
        <Press onPress={onOpenMap}>
          <UTTrackMap stats={stats} theme={theme} />
        </Press>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <UTStatTile theme={theme} label={t('record.track.totalDistance')} value={fmtDist(stats.distM)} accent />
          <UTStatTile theme={theme} label={t('record.track.totalAscent')} value={stats.hasEle ? `${stats.ascent} m` : '—'} />
          <UTStatTile theme={theme} label={t('record.track.duration')} value={stats.hasTime ? fmtDur(stats.durationMs, t) : '—'} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <Press
        onPress={pickFile}
        style={{ borderRadius: 16, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, marginBottom: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator color={theme.accent} /> : <Icon name="upload" color={theme.accent} size={24} />}
        </View>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text }}>{busy ? t('record.track.parsing') : t('record.track.addFile')}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 6, letterSpacing: 0.3 }}>{t('record.track.formats')}</Text>
      </Press>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: theme.text3, marginRight: 2 }}>{t('record.track.noFile')}</Text>
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
function RJHero({ theme, name, setName, nameMissing }: { theme: Theme; name: string; setName: (v: string) => void; nameMissing: boolean }) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: 26 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('record.hero.namePlaceholder')}
        placeholderTextColor={theme.text3}
        maxLength={32}
        style={{ paddingBottom: 11, paddingHorizontal: 2, borderBottomWidth: 1.5, borderBottomColor: nameMissing ? (theme.dark ? 'rgba(255,69,58,0.5)' : 'rgba(255,59,48,0.4)') : theme.hairline, fontSize: 25, fontWeight: '700', letterSpacing: -0.5, color: theme.text }}
      />
      {nameMissing ? <Text style={{ fontSize: 11.5, color: theme.danger, marginTop: 8, paddingLeft: 2 }}>{t('record.hero.nameRequired')}</Text> : null}
    </View>
  );
}

// Moments — photo gallery
function RJMoments({ theme, moments, onAdd, onRemove }: { theme: Theme; moments: RJPhoto[]; onAdd: () => void; onRemove: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {moments.map((p) => (
        <View key={p.id} style={{ width: '31.7%', aspectRatio: 1, borderRadius: 11, overflow: 'hidden' }}>
          {p.uri ? (
            <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <PhotoTile tone={p.tone} seed={p.id} radius={11} style={{ width: '100%', height: '100%' }} resWidth={420} />
          )}
          <Press onPress={() => onRemove(p.id)} style={{ position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color="#fff" size={10} />
          </Press>
        </View>
      ))}
      <Press onPress={onAdd} style={{ width: '31.7%', aspectRatio: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)' }}>
        <Icon name="plus" color={theme.accent} size={20} strokeWidth={2.2} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: theme.accent }}>{t('common.add')}</Text>
      </Press>
    </View>
  );
}

// When & where — date range + region
function RJFacts({ theme, date, endDate, onOpenDate, region, setRegion, onOpenMap, hasTrack }: { theme: Theme; date: Date; endDate: Date; onOpenDate: (f: 'start' | 'end') => void; region: string; setRegion: (v: string) => void; onOpenMap: () => void; hasTrack: boolean }) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: 22, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' }}>
      {/* When */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" color={theme.accent} size={17} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11.5, color: theme.text2 }}>{t('record.facts.dateLabel', { days: rjDaysLabel(date, endDate, t) })}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }}>
            <Press onPress={() => onOpenDate('start')}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{rjFmtDateShort(date, t)}</Text>
            </Press>
            <Svg width={16} height={7} viewBox="0 0 22 8" fill="none">
              <Path d="M1 4h18m0 0-3-3m3 3-3 3" stroke={theme.text3} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Press onPress={() => onOpenDate('end')}>
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.text }}>{rjFmtDateShort(endDate, t)}</Text>
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
          <Text style={{ fontSize: 11.5, color: theme.text2 }}>{hasTrack ? t('record.facts.locationFromTrack') : t('record.facts.location')}</Text>
          <TextInput value={region} onChangeText={setRegion} placeholder={t('record.facts.locationPlaceholder')} placeholderTextColor={theme.text3} style={{ fontSize: 15.5, fontWeight: '600', color: theme.text, padding: 0, marginTop: 1 }} />
        </View>
        <Press onPress={onOpenMap} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accentSoft }}>
          <Icon name="route" color={theme.accent} size={13} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.accent }}>{t('record.facts.map')}</Text>
        </Press>
      </View>
    </View>
  );
}

// Collapsible "更多"
function RJMore({ theme, summary, children }: { theme: Theme; summary: string; children: React.ReactNode }) {
  const { t } = useI18n();
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
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>{t('record.more.title')}</Text>
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
  const { t } = useI18n();
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
            <Badge text={t('record.companions.selfBadge')} />
            <Badge text={t('record.companions.hostBadge')} accent />
          </View>
        </View>
        {companions.map((c, i) => (
          <React.Fragment key={c.id}>
            {divider}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13, paddingVertical: 11 }}>
              <Avatar color={RJ_AVATAR_POOL[i % RJ_AVATAR_POOL.length]} label={iniOf(c.name)} />
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: theme.text, flexShrink: 1 }}>{c.name}</Text>
                {c.role ? <Badge text={roleLabel(c.role, t)} accent={RJ_ROLE_ACCENT.has(c.role)} /> : null}
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
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{t('record.companions.add')}</Text>
      </Press>
    </View>
  );
}

// Companion add sheet — name (required) + optional role
function RJCompanionSheet({ theme, color, onAdd, onClose }: { theme: Theme; color: string; onAdd: (c: { name: string; role: string }) => void; onClose: () => void }) {
  const { t } = useI18n();
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
              <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
            </Press>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{t('record.companions.add')}</Text>
            <Press onPress={submit} style={{ padding: 4 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: valid ? theme.accent : theme.text3 }}>{t('common.done')}</Text>
            </Press>
          </View>
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30, fontWeight: '700', color: '#fff' }}>{initial}</Text>
            </View>
          </View>
          <TextInput value={name} onChangeText={setName} placeholder={t('record.companions.namePlaceholder')} placeholderTextColor={theme.text3} maxLength={16} textAlign="center" style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: theme.hairline, fontSize: 16, fontWeight: '600', color: theme.text }} />
          <Text style={{ fontSize: 12, color: theme.text2, fontWeight: '600', marginTop: 18, marginBottom: 8, marginLeft: 2 }}>{t('record.companions.roleLabel')}</Text>
          <TextInput value={roleLabel(role, t)} onChangeText={setRole} placeholder={t('record.companions.rolePlaceholder')} placeholderTextColor={theme.text3} maxLength={6} style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: 1, borderColor: theme.hairline, fontSize: 15.5, color: theme.text }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {RJ_ROLE_PRESETS.map((r) => {
              const on = r === role.trim();
              return (
                <Press key={r} onPress={() => setRole(on ? '' : r)} style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: on ? theme.accent : theme.hairline }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#fff' : theme.text2 }}>{t(`record.role.${r}` as TKey)}</Text>
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
  const { t } = useI18n();
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
        <Text style={{ textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text, paddingVertical: 8 }}>{t('record.companions.add')}</Text>
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Row icon="share" title={t('record.companions.inviteTitle')} sub={t('record.companions.inviteSub')} onPress={onInvite} />
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 67 }} />
          <Row icon="user" title={t('record.companions.manualTitle')} sub={t('record.companions.manualSub')} onPress={onManual} />
        </View>
        <Press onPress={onClose} style={{ marginTop: 10, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.text2 }}>{t('common.cancel')}</Text>
        </Press>
      </View>
    </NJBottomSheet>
  );
}

// Date sheet (past dates allowed)
function RJDateSheet({ theme, date, field, onPick, onClose }: { theme: Theme; date: Date; field: 'start' | 'end'; onPick: (d: Date) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(date);
  const title = field === 'end' ? t('record.date.endTitle') : t('record.date.startTitle');
  return (
    <NJBottomSheet theme={theme} onClose={onClose} full>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Press onPress={onClose} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, color: theme.text2, fontWeight: '500' }}>{t('common.cancel')}</Text>
          </Press>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{title}</Text>
          <Press onPress={() => { onPick(draft); onClose(); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: theme.accent }}>{t('common.done')}</Text>
          </Press>
        </View>
        <NJMiniCalendar theme={theme} selectedDate={draft} onSelect={setDraft} allowPast />
        <Text style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: theme.text2 }}>
          {rjFmtDateLong(draft, t)} <Text style={{ color: theme.text3 }}>· {rjPastLabel(draft, t)}</Text>
        </Text>
      </View>
    </NJBottomSheet>
  );
}

// Map location picker — real Mapbox map with search
interface GeoResult { label: string; sub: string; lat: number; lon: number }

function RJMapPickSheet({ theme, onPick, onClose, center }: { theme: Theme; onPick: (label: string, lat: number, lon: number) => void; onClose: () => void; center?: { lat: number; lon: number } | null }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  ensureMapboxToken();
  const camRef = useRef<any>(null);
  const inputRef = useRef<TextInput>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initLon = center?.lon ?? 104.0;
  const initLat = center?.lat ?? 35.0;
  const initZoom = center ? 10 : 3.5;

  const flyTo = useCallback((lon: number, lat: number, zoom = 12) => {
    camRef.current?.setCamera({ centerCoordinate: [lon, lat], zoomLevel: zoom, animationDuration: 600 });
  }, []);

  const search = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&language=zh,en&limit=5&types=country,region,place,district,locality,neighborhood,poi`;
        const res = await fetch(url);
        const json = await res.json();
        const items: GeoResult[] = (json.features || []).map((f: any) => ({
          label: f.text || f.place_name,
          sub: f.place_name || '',
          lon: f.center[0],
          lat: f.center[1],
        }));
        setResults(items);
      } catch { setResults([]); }
      setSearching(false);
    }, 350);
  }, []);

  useEffect(() => { search(query); }, [query, search]);

  const pickResult = (r: GeoResult) => {
    inputRef.current?.blur();
    setPin({ lat: r.lat, lon: r.lon, label: r.label });
    setQuery('');
    setResults([]);
    flyTo(r.lon, r.lat);
  };

  const onMapPress = async (e: any) => {
    inputRef.current?.blur();
    const coords = e?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    const lat = coords[1];
    const lon = coords[0];
    setPin({ lat, lon, label: '...' });
    setResults([]);
    const label = await reverseGeocode(lat, lon);
    setPin((p) => p && Math.abs(p.lat - lat) < 0.0001 ? { ...p, label } : p);
  };

  if (!MAPBOX_TOKEN) {
    return (
      <NJBottomSheet theme={theme} onClose={onClose} full>
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: theme.text3 }}>Map unavailable</Text>
        </View>
      </NJBottomSheet>
    );
  }

  const cardBg = theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.95)';

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 250 }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        scaleBarEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled={false}
        onPress={onMapPress}
      >
        <Camera ref={camRef} defaultSettings={{ centerCoordinate: [initLon, initLat], zoomLevel: initZoom }} />
        <StyleImport id="basemap" existing config={{ lightPreset: theme.mapLightPreset, showPlaceLabels: true, showRoadLabels: true, showPointOfInterestLabels: true, showTransitLabels: true } as any} />

        {pin && (
          <MarkerView coordinate={[pin.lon, pin.lat]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' }}>
                <Icon name="pin" color="#fff" size={14} />
              </View>
              <View style={{ width: 3, height: 8, backgroundColor: theme.accent, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
            </View>
          </MarkerView>
        )}
      </MapView>

      {/* top: back + search bar + confirm */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Press onPress={onClose} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="chevronL" color={theme.text} size={16} />
          </Press>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 19, backgroundColor: cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, paddingHorizontal: 12, gap: 8 }}>
            <Icon name="search" color={theme.text3} size={15} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t('record.map.search')}
              placeholderTextColor={theme.text3}
              returnKeyType="search"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 14, color: theme.text, padding: 0 }}
            />
            {query.length > 0 && (
              <Press onPress={() => { setQuery(''); setResults([]); }} style={{ padding: 2 }}>
                <Icon name="close" color={theme.text3} size={12} />
              </Press>
            )}
          </View>
          <Press onPress={() => pin && (onPick(pin.label, pin.lat, pin.lon), onClose())} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: pin ? theme.accent : cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: pin ? 0 : StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            <Icon name="check" color={pin ? '#fff' : theme.text3} size={16} strokeWidth={2.4} />
          </Press>
        </View>

        {/* search results dropdown */}
        {results.length > 0 && (
          <View style={{ marginTop: 6, borderRadius: 14, overflow: 'hidden', backgroundColor: cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
            {results.map((r, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.hairline, marginLeft: 42 }} />}
                <Press onPress={() => pickResult(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Icon name="pin" color={theme.text3} size={14} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{r.label}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, color: theme.text3, marginTop: 1 }}>{r.sub}</Text>
                  </View>
                </Press>
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {/* bottom location card */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 12, left: 12, right: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 16, backgroundColor: cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
          <Icon name="pin" color={pin ? theme.accent : theme.text3} size={20} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: pin ? theme.text : theme.text3 }}>{pin ? pin.label : t('record.map.noPin')}</Text>
            {pin ? <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text2, marginTop: 2, letterSpacing: 0.2 }}>{fmtCoord(pin.lat, pin.lon)}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Success
// ──────────────────────────────────────────────────────────────
function RJSuccess({ theme, name, dateLabel, distLabel, visibility }: { theme: Theme; name: string; dateLabel: string; distLabel: string; visibility: string }) {
  const { t } = useI18n();
  const pop = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 12, speed: 6 }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale }], ...shadow(0.4, 20, 8, theme.accent) }}>
        <Icon name="check" color="#fff" size={48} strokeWidth={3.2} />
      </Animated.View>
      <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, marginTop: 26, letterSpacing: -0.5 }}>{t('record.success.title')}</Text>
      <Text style={{ fontSize: 14.5, color: theme.text2, marginTop: 8, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t('record.success.nameQuoted', { name })}</Text>
        {'\n'}
        {dateLabel}
        {distLabel ? ` · ${distLabel}` : ''}
        {visibility === 'public' ? `\n${t('record.success.publicGenerated')}` : ''}
      </Text>
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: theme.text3, marginTop: 20, letterSpacing: 0.4 }}>{t('record.success.redirecting')}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Build the recorded journey Poi
// ──────────────────────────────────────────────────────────────
function buildRecordJourney(args: {
  name: string;
  region: string;
  regionCoord: { lat: number; lon: number } | null;
  date: Date;
  endDate: Date;
  diff: Poi['diff'];
  tone: Tone;
  track: Track | null;
  manualDist: string;
  manualAsc: string;
  notes: string;
  companions: RJCompanion[];
  photos: RJPhoto[];
  trackPublic: boolean;
  t: TFn;
}): Poi {
  const { name, region, regionCoord, date, endDate, diff, tone, track, manualDist, manualAsc, notes, companions, photos, trackPublic, t } = args;
  const start = track ? track.stats.points[0] : null;
  const lng = regionCoord?.lon ?? (start ? start.lon : 104.0);
  const lat = regionCoord?.lat ?? (start ? start.lat : 35.0);
  const distLabel = track ? fmtDist(track.stats.distM) : manualDist ? `${manualDist} km` : '—';
  const ascLabel = track ? (track.stats.hasEle ? `+${track.stats.ascent} m` : '—') : manualAsc ? `+${manualAsc} m` : '—';
  const totalDays = rjRangeDays(date, endDate);
  const companionList: Companion[] = [
    SELF,
    ...companions.map((c, i) => ({ ini: iniOf(c.name), name: c.name, role: c.role || undefined, color: RJ_AVATAR_POOL[i % RJ_AVATAR_POOL.length] })),
  ];

  // real track data
  let trackCoords: [number, number][] | undefined;
  let trackElevation: { km: number; ele: number }[] | undefined;
  let trackDurationMs: number | undefined;
  if (track) {
    const pts = track.stats.points;
    const stride = Math.max(1, Math.floor(pts.length / 500));
    trackCoords = [];
    for (let i = 0; i < pts.length; i += stride) trackCoords.push([pts[i].lon, pts[i].lat]);
    if (trackCoords[trackCoords.length - 1][0] !== pts[pts.length - 1].lon || trackCoords[trackCoords.length - 1][1] !== pts[pts.length - 1].lat) {
      trackCoords.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
    }
    if (track.stats.hasEle) {
      const cum = track.stats.cum;
      trackElevation = [];
      for (let i = 0; i < pts.length; i += stride) {
        if (isFinite(pts[i].ele)) trackElevation.push({ km: cum[i] / 1000, ele: pts[i].ele });
      }
    }
    if (track.stats.hasTime) trackDurationMs = track.stats.durationMs;
  }

  const photoUris = photos.filter((p) => p.uri).map((p) => p.uri!);

  return {
    id: `j-${Date.now()}`,
    kind: 'journey',
    name: name.trim() || t('record.build.untitledJourney'),
    region: region.trim() || t('record.build.untitledRegion'),
    coord: `${lat.toFixed(2)} N · ${lng.toFixed(2)} E`,
    lng,
    lat,
    dist: distLabel,
    asc: ascLabel,
    diff,
    tone,
    days: rjDaysLabel(date, endDate, t),
    date: t('record.build.yearMonth', { y: date.getFullYear(), m: date.getMonth() + 1 }),
    totalDays,
    companions: companions.length,
    companionList,
    mine: true,
    fav: false,
    desc: notes.trim(),
    photoUris,
    ...(trackCoords ? { trackCoords } : {}),
    ...(trackElevation ? { trackElevation } : {}),
    ...(trackDurationMs ? { trackDurationMs } : {}),
    trackPublic: trackPublic && !!trackCoords,
  };
}

// ──────────────────────────────────────────────────────────────
// Main flow
// ──────────────────────────────────────────────────────────────
export function RecordJourneySheet({ theme, onBack, onCreate, onToast }: { theme: Theme; onBack: () => void; onClose: () => void; onCreate: (poi: Poi) => void; onToast: (m: string) => void }) {
  const { t } = useI18n();
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
  const [regionCoord, setRegionCoord] = useState<{ lat: number; lon: number } | null>(null);
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
  const [trackMapFull, setTrackMapFull] = useState(false);
  const [companionAdd, setCompanionAdd] = useState<null | 'choose' | 'manual' | 'invite'>(null);

  const nameInit = useRef(false);

  const onIngest = (text: string, fname: string, presetRegion: string | null, presetTone: Tone | null, sourceUri?: string) => {
    setError(null);
    setBusy(true);
    setTimeout(() => {
      console.log('[Track] onIngest:', fname, 'length:', text.length);
      const parsed = parseTrack(text, fname, t as any);
      if (parsed.error || !parsed.points) {
        console.warn('[Track] parse failed:', parsed.error, '| first 200 chars:', text.slice(0, 200));
        setBusy(false);
        setError(parsed.error || t('record.track.errParse'));
        return;
      }
      console.log('[Track] parsed OK:', parsed.points.length, 'points, format:', parsed.format);
      const st = computeStats(parsed.points);
      if (!st) {
        console.warn('[Track] computeStats returned null for', parsed.points.length, 'points');
        setBusy(false);
        setError(t('record.track.errTooFew'));
        return;
      }
      const tn = presetTone || PHOTO_TONES[Math.floor((st.distM + st.count) % PHOTO_TONES.length)];
      setTrack({ stats: st, fileName: fname, fileFormat: parsed.format || 'GPX', sourceUri });
      setTone(tn);
      const base = (parsed.name && parsed.name.trim()) || fname.replace(/\.[^.]+$/, '');
      if (!nameInit.current && !name) {
        setName(base);
        nameInit.current = true;
      }
      if (!region) {
        const trkLat = st.points[0].lat;
        const trkLon = st.points[0].lon;
        if (!regionCoord) setRegionCoord({ lat: trkLat, lon: trkLon });
        if (presetRegion) { setRegion(presetRegion); }
        else { reverseGeocode(trkLat, trkLon).then((label) => setRegion((r) => r || label)); }
      }
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

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('journey.photoWall.needLibraryPerm')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
    if (res.canceled || !res.assets) return;
    setPhotos((prev) => [
      ...prev,
      ...res.assets.map((a, i) => ({
        id: `p-${Date.now()}-${prev.length + i}`,
        tone: PHOTO_TONES[(prev.length + i) % PHOTO_TONES.length],
        uri: a.uri,
      })),
    ]);
  };
  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

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
  const moreSummary = [
    companions.length > 0 ? t('record.more.companionCount', { n: companions.length + 1 }) : t('record.more.soloOnly'),
    t('record.more.difficultySummary', { diff: t(`common.diff.${diff}` as TKey) }),
  ].join(' · ');

  const { userId } = useData();

  const finish = async () => {
    const jTone = photos[0] ? photos[0].tone : tone;
    const poi = buildRecordJourney({ name, region, regionCoord, date, endDate, diff, tone: jTone, track, manualDist, manualAsc, notes, companions, photos, trackPublic: visibility === 'public', t });
    try {
      if (userId) {
        const [uploadedPhotos, trackFileUrl] = await Promise.all([
          poi.photoUris?.length ? Promise.all(poi.photoUris.map((uri) => uploadMedia(uri, userId, poi.id))) : Promise.resolve(undefined),
          track?.sourceUri ? uploadMedia(track.sourceUri, userId, poi.id) : Promise.resolve(undefined),
        ]);
        if (uploadedPhotos) poi.photoUris = uploadedPhotos;
        if (trackFileUrl) {
          poi.trackFileUrl = trackFileUrl;
          poi.trackFileName = track?.fileName;
        }
      }
      setStep(1);
      setTimeout(() => onCreate(poi), 1500);
    } catch (uploadError) {
      console.warn('[RecordJourney] photo upload failed:', uploadError);
      setError(t('journey.timeline.uploadFailedMessage'));
      onToast(t('journey.timeline.uploadFailedTitle'));
    }
  };
  const next = () => {
    if (!nameValid) return;
    setError(null);
    finish();
  };

  const cta = nameValid ? t('record.cta.finish') : t('record.cta.needName');

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
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text }}>{step === 0 ? t('record.topTitle') : ''}</Text>
          <View style={{ width: 38, height: 38 }} />
        </View>

        {/* Body */}
        {step === 1 ? (
          <RJSuccess theme={theme} name={name.trim()} dateLabel={`${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`} distLabel={distLabel} visibility={visibility} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
            {/* 1 · cover + title */}
            <RJHero theme={theme} name={name} setName={setName} nameMissing={!name.trim()} />

            {/* 2 · moments */}
            <NJSection theme={theme} label={t('record.sections.moments')} hint={photos.length > 0 ? t('record.sections.photoCount', { n: photos.length }) : undefined}>
              <RJMoments theme={theme} moments={photos} onAdd={addPhoto} onRemove={removePhoto} />
            </NJSection>

            {/* 3 · story */}
            <NJSection theme={theme} label={t('record.sections.story')}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder={t('record.sections.storyPlaceholder')}
                placeholderTextColor={theme.text3}
                style={{ minHeight: 84, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline, fontSize: 14.5, lineHeight: 22, color: theme.text, textAlignVertical: 'top' }}
              />
            </NJSection>

            {/* 4 · when & where */}
            <RJFacts theme={theme} date={date} endDate={endDate} onOpenDate={openDate} region={region} setRegion={setRegion} onOpenMap={() => setMapOpen(true)} hasTrack={!!track} />

            {/* 5 · the route */}
            <NJSection theme={theme} label={t('record.sections.track')} hint={track ? t('record.sections.fromTrack') : undefined}>
              <RJTrackBlock theme={theme} track={track} onIngest={onIngest} onRemove={() => setTrack(null)} busy={busy} setBusy={setBusy} setError={setError} onToast={onToast} onOpenMap={() => track && setTrackMapFull(true)} />
              {track && track.stats.hasEle ? (
                <View style={{ marginTop: 12 }}>
                  <UTElevation stats={track.stats} theme={theme} />
                </View>
              ) : null}
            </NJSection>

            {/* 6 · visibility */}
            <NJSection theme={theme} label={t('record.sections.visibility')}>
              <RJVisibility theme={theme} value={visibility} onChange={setVisibility} />
            </NJSection>

            {/* 7 · more (manual data / companions / difficulty) */}
            <RJMore theme={theme} summary={moreSummary}>
              {!track ? (
                <NJSection theme={theme} label={t('record.sections.data')}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([[t('record.data.distance'), manualDist, setManualDist, 'km'], [t('record.data.ascent'), manualAsc, setManualAsc, 'm']] as const).map(([lab, val, set, unit], i) => (
                      <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 48, borderRadius: 13, backgroundColor: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline }}>
                        <Text style={{ fontSize: 12.5, color: theme.text2 }}>{lab}</Text>
                        <TextInput value={val} onChangeText={(t) => set(t.replace(/[^0-9.]/g, ''))} placeholder="—" placeholderTextColor={theme.text3} keyboardType="decimal-pad" style={{ flex: 1, fontSize: 15, fontWeight: '700', color: theme.text, textAlign: 'right', padding: 0 }} />
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text3 }}>{unit}</Text>
                      </View>
                    ))}
                  </View>
                </NJSection>
              ) : null}

              <NJSection theme={theme} label={t('record.sections.companions')} hint={companions.length > 0 ? t('record.sections.companionTotal', { n: companions.length + 1 }) : t('record.sections.soloDefault')}>
                <RJCompanions theme={theme} companions={companions} onAdd={() => setCompanionAdd('choose')} onRemove={removeCompanion} />
              </NJSection>

              <NJSection theme={theme} label={t('record.sections.difficulty')} hint={track ? t('record.sections.difficultyEstimated') : undefined} style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {RJ_DIFFS.map((d) => {
                    const on = d === diff;
                    return (
                      <Press key={d} onPress={() => setDiff(d)} style={{ flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? theme.accent : theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: on ? theme.accent : theme.hairline }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: on ? '#fff' : theme.text }}>{t(`common.diff.${d}` as TKey)}</Text>
                      </Press>
                    );
                  })}
                </View>
              </NJSection>
            </RJMore>
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
                ...(nameValid ? shadow(0.3, 14, 6, theme.accent) : {}),
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: nameValid ? '#fff' : theme.text3, letterSpacing: 0.2 }}>{cta}</Text>
              {nameValid ? <Icon name="chevronR" color="#fff" size={15} strokeWidth={2.4} /> : null}
            </Press>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Overlays */}
      {trackMapFull && track ? <TrackMapFull stats={track.stats} theme={theme} onClose={() => setTrackMapFull(false)} /> : null}
      {dateOpen ? <RJDateSheet theme={theme} date={dateField === 'end' ? endDate : date} field={dateField} onPick={pickDate} onClose={() => setDateOpen(false)} /> : null}
      {mapOpen ? <RJMapPickSheet theme={theme} onPick={(label, lat, lon) => { setRegion(label); setRegionCoord({ lat, lon }); }} onClose={() => setMapOpen(false)} center={regionCoord || (track ? { lat: track.stats.points[0].lat, lon: track.stats.points[0].lon } : null)} /> : null}
      {companionAdd === 'choose' ? <RJAddChooser theme={theme} onInvite={() => setCompanionAdd('invite')} onManual={() => setCompanionAdd('manual')} onClose={() => setCompanionAdd(null)} /> : null}
      {companionAdd === 'manual' ? <RJCompanionSheet theme={theme} color={RJ_AVATAR_POOL[companions.length % RJ_AVATAR_POOL.length]} onAdd={addCompanion} onClose={() => setCompanionAdd(null)} /> : null}
      {companionAdd === 'invite' ? <NJSharePanel theme={theme} tripName={name.trim() || t('record.build.thisJourney')} onClose={() => setCompanionAdd(null)} onToast={onToast} /> : null}
    </View>
  );
}
