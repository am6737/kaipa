// @ts-ignore Deno npm specifier
import { strFromU8, unzipSync } from 'npm:fflate@0.8.3';

export type TrackPoint = { lat: number; lon: number; ele: number; time: Date | null };
export type TrackStats = {
  points: TrackPoint[];
  cum: number[];
  distM: number;
  hasEle: boolean;
  ascent: number;
  hasTime: boolean;
  durationMs: number;
};
export type TrackWaypoint = { name: string; lat: number; lon: number; ele: number };

const decoder = new TextDecoder();

export function trackExtension(name: string) {
  return (name.split('.').pop() || '').toLowerCase();
}

export function isTrackFilename(name: string) {
  const ext = trackExtension(name);
  return ext === 'gpx' || ext === 'kml' || ext === 'kmz';
}

function cleanXml(text: string) {
  return text.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(\/?)\w+:/g, '<$1');
}

export function extractKmlFromKmz(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes);
    const entry = Object.entries(files).find(([name]) => /(^|\/)doc\.kml$/i.test(name))
      || Object.entries(files).find(([name]) => /\.kml$/i.test(name));
    return entry ? strFromU8(entry[1]) : null;
  } catch {
    return null;
  }
}

export function parseTrackText(text: string, filename: string): { name?: string; points: TrackPoint[]; waypoints?: TrackWaypoint[]; format: 'GPX' | 'KML' } {
  const ext = trackExtension(filename);
  const xml = cleanXml(text);
  const isKml = ext === 'kml' || /<kml[\s>]/i.test(xml);
  const points: TrackPoint[] = [];
  const nameM = xml.match(/<name\b[^>]*>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
  const name = nameM ? nameM[1].trim() : '';

  if (isKml) {
    const gxCoordRe = /<coord\b[^>]*>\s*([-\d.eE+]+)\s+([-\d.eE+]+)(?:\s+([-\d.eE+]+))?\s*<\/coord>/gi;
    let coordMatch: RegExpExecArray | null;
    while ((coordMatch = gxCoordRe.exec(xml))) {
      const lon = Number.parseFloat(coordMatch[1]);
      const lat = Number.parseFloat(coordMatch[2]);
      const ele = coordMatch[3] ? Number.parseFloat(coordMatch[3]) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : NaN, time: null });
    }
    if (points.length > 0) {
      const whenRe = /<when\b[^>]*>\s*([^<]+?)\s*<\/when>/gi;
      let index = 0;
      let whenMatch: RegExpExecArray | null;
      while ((whenMatch = whenRe.exec(xml)) && index < points.length) {
        points[index].time = new Date(whenMatch[1].trim());
        index += 1;
      }
    }
    const blocks = points.length
      ? []
      : (xml.match(/<LineString\b[^>]*>[\s\S]*?<\/LineString>/gi) || xml.match(/<coordinates\b[^>]*>[\s\S]*?<\/coordinates>/gi) || []);
    for (const block of blocks) {
      const coordinateBlocks = block.match(/<coordinates\b[^>]*>[\s\S]*?<\/coordinates>/gi) || [block];
      for (const coordinateBlock of coordinateBlocks) {
        const inner = coordinateBlock.replace(/<\/?coordinates\b[^>]*>/gi, '').trim();
        for (const token of inner.split(/[\s\n\r]+/)) {
          if (!token) continue;
          const parts = token.split(',');
          const lon = Number.parseFloat(parts[0]);
          const lat = Number.parseFloat(parts[1]);
          const ele = Number.parseFloat(parts[2]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : NaN, time: null });
        }
      }
    }
  } else {
    const trackRe = /<(?:trkpt|rtept)\b([^>]*?)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
    let match: RegExpExecArray | null;
    while ((match = trackRe.exec(xml))) {
      const latM = match[1].match(/lat\s*=\s*["']([-\d.eE]+)["']/i);
      const lonM = match[1].match(/lon\s*=\s*["']([-\d.eE]+)["']/i);
      if (!latM || !lonM) continue;
      const lat = Number.parseFloat(latM[1]);
      const lon = Number.parseFloat(lonM[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const eleM = match[2].match(/<ele\b[^>]*>\s*([-\d.eE+]+)\s*<\/ele>/i);
      const timeM = match[2].match(/<time\b[^>]*>\s*([^<]+?)\s*<\/time>/i);
      points.push({ lat, lon, ele: eleM ? Number.parseFloat(eleM[1]) : NaN, time: timeM ? new Date(timeM[1].trim()) : null });
    }
  }

  const waypoints: TrackWaypoint[] = [];
  if (isKml) {
    const pmRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pmRe.exec(xml))) {
      const block = pm[1];
      if (!/<Point\b/i.test(block)) continue;
      const wn = block.match(/<name\b[^>]*>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
      const wc = block.match(/<Point\b[^>]*>[\s\S]*?<coordinates\b[^>]*>\s*([-\d.eE+]+),([-\d.eE+]+)(?:,([-\d.eE+]+))?\s*<\/coordinates>/i);
      if (!wn || !wc) continue;
      const lon = Number.parseFloat(wc[1]);
      const lat = Number.parseFloat(wc[2]);
      const ele = wc[3] ? Number.parseFloat(wc[3]) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) waypoints.push({ name: wn[1].trim(), lat, lon, ele: Number.isFinite(ele) ? ele : NaN });
    }
  } else {
    const wptRe = /<wpt\b([^>]*?)>([\s\S]*?)<\/wpt>/gi;
    let wpt: RegExpExecArray | null;
    while ((wpt = wptRe.exec(xml))) {
      const latM = wpt[1].match(/lat\s*=\s*["']([-\d.eE]+)["']/i);
      const lonM = wpt[1].match(/lon\s*=\s*["']([-\d.eE]+)["']/i);
      const nameMatch = wpt[2].match(/<name\b[^>]*>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
      if (!latM || !lonM || !nameMatch) continue;
      const lat = Number.parseFloat(latM[1]);
      const lon = Number.parseFloat(lonM[1]);
      const eleMatch = wpt[2].match(/<ele\b[^>]*>\s*([-\d.eE+]+)\s*<\/ele>/i);
      const ele = eleMatch ? Number.parseFloat(eleMatch[1]) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) waypoints.push({ name: nameMatch[1].trim(), lat, lon, ele: Number.isFinite(ele) ? ele : NaN });
    }
  }

  return { name, points, waypoints: waypoints.length ? waypoints : undefined, format: isKml ? 'KML' : 'GPX' };
}

export async function parseTrackBytes(bytes: Uint8Array, filename: string) {
  const ext = trackExtension(filename);
  if (ext === 'kmz') {
    const kml = extractKmlFromKmz(bytes);
    if (!kml) throw new Error('无法解析这个 KMZ 轨迹文件');
    return parseTrackText(kml, filename.replace(/\.kmz$/i, '.kml'));
  }
  return parseTrackText(decoder.decode(bytes), filename);
}

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radius = 6_371_000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function computeTrackStats(points: TrackPoint[]): TrackStats | null {
  const pts = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (pts.length < 2) return null;
  let distM = 0;
  const cum = [0];
  for (let index = 1; index < pts.length; index += 1) {
    distM += haversine(pts[index - 1], pts[index]);
    cum.push(distM);
  }
  const eles = pts.map((point) => point.ele).filter(Number.isFinite);
  const hasEle = eles.length >= pts.length * 0.5;
  let ascent = 0;
  if (hasEle) {
    const first = pts.find((point) => Number.isFinite(point.ele));
    let last = first ? first.ele : 0;
    for (const point of pts) {
      if (!Number.isFinite(point.ele)) continue;
      const delta = point.ele - last;
      if (Math.abs(delta) >= 3) {
        if (delta > 0) ascent += delta;
        last = point.ele;
      }
    }
  }
  const times = pts.map((point) => point.time).filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
  const hasTime = times.length >= 2;
  return { points: pts, cum, distM, hasEle, ascent: Math.round(ascent), hasTime, durationMs: hasTime ? times[times.length - 1].getTime() - times[0].getTime() : 0 };
}

export function buildAgentTrackData(stats: TrackStats) {
  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / 500));
  const trackCoords: [number, number][] = [];
  for (let index = 0; index < pts.length; index += stride) trackCoords.push([pts[index].lon, pts[index].lat]);
  const end = pts[pts.length - 1];
  if (trackCoords[trackCoords.length - 1][0] !== end.lon || trackCoords[trackCoords.length - 1][1] !== end.lat) trackCoords.push([end.lon, end.lat]);
  const trackElevation = stats.hasEle
    ? pts.flatMap((point, index) => index % stride === 0 && Number.isFinite(point.ele) ? [{ km: stats.cum[index] / 1000, ele: point.ele }] : [])
    : null;
  const dist = stats.distM >= 1000 ? `${(stats.distM / 1000).toFixed(stats.distM >= 10000 ? 1 : 2)} km` : `${Math.round(stats.distM)} m`;
  const asc = stats.hasEle ? `+${stats.ascent} m` : null;
  return { trackCoords, trackElevation, trackDurationMs: stats.hasTime ? stats.durationMs : null, dist, asc };
}

export function snapTrackWaypoints(waypoints: TrackWaypoint[] | undefined, stats: TrackStats) {
  if (!waypoints?.length) return null;
  return waypoints.map((waypoint) => {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let index = 0; index < stats.points.length; index += 1) {
      const distance = haversine(waypoint, stats.points[index]);
      if (distance < bestDist) {
        bestDist = distance;
        bestIndex = index;
      }
    }
    return { name: waypoint.name, km: stats.cum[bestIndex] / 1000 };
  }).sort((a, b) => a.km - b.km);
}
