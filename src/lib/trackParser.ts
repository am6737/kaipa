export interface TrackPt {
  lat: number;
  lon: number;
  ele: number;
  time: Date | null;
}

export interface TrackStats {
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

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  ele: number;
}

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeStats(points: TrackPt[]): TrackStats | null {
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

type TFn = (key: string, vars?: Record<string, any>) => string;

export function parseTrack(text: string, filename: string, t: TFn): { error?: string; name?: string; points?: TrackPt[]; waypoints?: Waypoint[]; format?: string } {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let xml = text.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  xml = xml.replace(/<(\/?)\w+:/g, '<$1');

  const isKml = ext === 'kml' || /<kml[\s>]/i.test(xml);
  const points: TrackPt[] = [];
  const nameM = xml.match(/<name>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
  const name = nameM ? nameM[1].trim() : '';
  if (isKml) {
    const coordRe = /<coord>\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)?\s*<\/coord>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = coordRe.exec(xml))) {
      const lon = parseFloat(cm[1]);
      const lat = parseFloat(cm[2]);
      const ele = cm[3] ? parseFloat(cm[3]) : NaN;
      if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: isFinite(ele) ? ele : NaN, time: null });
    }
    if (points.length > 0) {
      const whenRe = /<when>\s*([^<]+?)\s*<\/when>/gi;
      let wi = 0;
      let wm: RegExpExecArray | null;
      while ((wm = whenRe.exec(xml)) && wi < points.length) {
        points[wi].time = new Date(wm[1].trim());
        wi++;
      }
    }
    if (!points.length) {
      const lsBlocks = xml.match(/<LineString>([\s\S]*?)<\/LineString>/gi) || [];
      for (const ls of lsBlocks) {
        const cBlocks = ls.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) || [];
        for (const b of cBlocks) {
          const inner = b.replace(/<\/?coordinates>/gi, '').trim();
          for (const tok of inner.split(/[\s\n\r]+/)) {
            if (!tok) continue;
            const parts = tok.split(',');
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            const ele = parseFloat(parts[2]);
            if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: isFinite(ele) ? ele : NaN, time: null });
          }
        }
      }
    }
    if (!points.length) {
      const blocks = xml.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) || [];
      for (const b of blocks) {
        const inner = b.replace(/<\/?coordinates>/gi, '').trim();
        for (const tok of inner.split(/[\s\n\r]+/)) {
          if (!tok) continue;
          const parts = tok.split(',');
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          const ele = parseFloat(parts[2]);
          if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: isFinite(ele) ? ele : NaN, time: null });
        }
      }
    }
  } else {
    const re = /<(?:trkpt|rtept)\b([^>]*?)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const attrs = m[1];
      const body = m[2];
      const latM = attrs.match(/lat\s*=\s*["']([-\d.eE+]+)["']/i);
      const lonM = attrs.match(/lon\s*=\s*["']([-\d.eE+]+)["']/i);
      if (!latM || !lonM) continue;
      const lat = parseFloat(latM[1]);
      const lon = parseFloat(lonM[1]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const eleM = body.match(/<ele>\s*([-\d.eE+]+)\s*<\/ele>/i);
      const timeM = body.match(/<time>\s*([^<]+?)\s*<\/time>/i);
      points.push({ lat, lon, ele: eleM ? parseFloat(eleM[1]) : NaN, time: timeM ? new Date(timeM[1].trim()) : null });
    }
    if (!points.length) {
      const re2 = /<(?:trkpt|rtept|wpt)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept|wpt)>)/gi;
      while ((m = re2.exec(xml))) {
        const attrs = m[1];
        const latM = attrs.match(/lat\s*=\s*["']([-\d.eE+]+)["']/i);
        const lonM = attrs.match(/lon\s*=\s*["']([-\d.eE+]+)["']/i);
        if (latM && lonM) {
          const lat = parseFloat(latM[1]);
          const lon = parseFloat(lonM[1]);
          if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon, ele: NaN, time: null });
        }
      }
    }
  }
  if (points.length < 2) {
    console.warn('[Track] parseTrack found', points.length, 'points. First 200 chars:', xml.slice(0, 200));
    return { error: t('record.track.errNoPoints') };
  }

  const waypoints: Waypoint[] = [];
  if (isKml) {
    const pmRe = /<Placemark>([\s\S]*?)<\/Placemark>/gi;
    let pm: RegExpExecArray | null;
    while ((pm = pmRe.exec(xml))) {
      const block = pm[1];
      if (!/<Point>/i.test(block)) continue;
      const wn = block.match(/<name>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
      const wc = block.match(/<Point>[\s\S]*?<coordinates>\s*([-\d.eE+]+),([-\d.eE+]+)(?:,([-\d.eE+]+))?\s*<\/coordinates>/i);
      if (wn && wc) {
        const lon = parseFloat(wc[1]);
        const lat = parseFloat(wc[2]);
        const ele = wc[3] ? parseFloat(wc[3]) : NaN;
        if (isFinite(lat) && isFinite(lon)) waypoints.push({ name: wn[1].trim(), lat, lon, ele: isFinite(ele) ? ele : NaN });
      }
    }
  } else {
    const wptRe = /<wpt\b([^>]*?)>([\s\S]*?)<\/wpt>/gi;
    let wm: RegExpExecArray | null;
    while ((wm = wptRe.exec(xml))) {
      const attrs = wm[1];
      const body = wm[2];
      const wLat = attrs.match(/lat\s*=\s*["']([-\d.eE+]+)["']/i);
      const wLon = attrs.match(/lon\s*=\s*["']([-\d.eE+]+)["']/i);
      const wName = body.match(/<name>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i);
      if (wLat && wLon && wName) {
        const lat = parseFloat(wLat[1]);
        const lon = parseFloat(wLon[1]);
        const eleM = body.match(/<ele>\s*([-\d.eE+]+)\s*<\/ele>/i);
        const ele = eleM ? parseFloat(eleM[1]) : NaN;
        if (isFinite(lat) && isFinite(lon)) waypoints.push({ name: wName[1].trim(), lat, lon, ele: isFinite(ele) ? ele : NaN });
      }
    }
  }

  return { name, points, waypoints: waypoints.length ? waypoints : undefined, format: isKml ? 'KML' : 'GPX' };
}

export function snapWaypoints(waypoints: Waypoint[], stats: TrackStats): { name: string; km: number }[] {
  const pts = stats.points;
  const cum = stats.cum;
  return waypoints.map((wp) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = haversine(wp, pts[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return { name: wp.name, km: cum[bestIdx] / 1000 };
  }).sort((a, b) => a.km - b.km);
}

export function buildTrackData(stats: TrackStats) {
  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / 500));
  const trackCoords: [number, number][] = [];
  for (let i = 0; i < pts.length; i += stride) trackCoords.push([pts[i].lon, pts[i].lat]);
  if (trackCoords[trackCoords.length - 1][0] !== pts[pts.length - 1].lon || trackCoords[trackCoords.length - 1][1] !== pts[pts.length - 1].lat) {
    trackCoords.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
  }
  let trackElevation: { km: number; ele: number }[] | undefined;
  if (stats.hasEle) {
    trackElevation = [];
    for (let i = 0; i < pts.length; i += stride) {
      if (isFinite(pts[i].ele)) trackElevation.push({ km: stats.cum[i] / 1000, ele: pts[i].ele });
    }
  }
  const trackDurationMs = stats.hasTime ? stats.durationMs : undefined;
  const dist = stats.distM >= 1000 ? (stats.distM / 1000).toFixed(stats.distM >= 10000 ? 1 : 2) + ' km' : Math.round(stats.distM) + ' m';
  const asc = stats.hasEle ? `+${stats.ascent} m` : undefined;
  return { trackCoords, trackElevation, trackDurationMs, dist, asc };
}
