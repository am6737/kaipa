#!/usr/bin/env node
// import-hiking-routes.mjs — rebuild the route catalog SQL from local KML tracks.
//
// Reads every .kml in /home/coder/workspaces/徒步路线 (两步路/2bulu exports),
// parses the track and its 标注点 markers the same way the app's
// src/lib/trackParser.ts does, decimates the geometry to a map-friendly size,
// and writes a migration that wipes the routes table and re-inserts it from
// the parsed files. Regenerate the migration by re-running this script, then
// apply it with infra/supabase/apply-migration.sh.
//
// Usage: node scripts/import-hiking-routes.mjs [kml-dir] [out-sql]

import fs from 'node:fs';
import path from 'node:path';

const KML_DIR = process.argv[2] ?? '/home/coder/workspaces/徒步路线';
const OUT_SQL = process.argv[3] ?? 'supabase/migrations/20260917140000_import_hiking_routes.sql';
const MAX_COORDS = 1500; // per-route coordinate pairs kept for map rendering
const MAX_ELEVATION = 400; // per-route elevation profile samples
const MAX_WAYPOINTS = 200; // per-route snapped markers

// filename stem -> real region (省 · 市), produced by scripts/geocode-route-regions.mjs
const REGIONS_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'route-regions.json');
const regionsByStem = fs.existsSync(REGIONS_FILE) ? JSON.parse(fs.readFileSync(REGIONS_FILE, 'utf8')) : {};

// filename stem -> { months, note } best-season metadata, hand-curated in
// scripts/route-seasons.json (consumed by generate-route-seasons.mjs too)
const SEASONS_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'route-seasons.json');
const seasonsByStem = fs.existsSync(SEASONS_FILE) ? JSON.parse(fs.readFileSync(SEASONS_FILE, 'utf8')) : {};

// ─── track parser (ported from src/lib/trackParser.ts) ──────────────────────

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeStats(points) {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) return null;
  let dist = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i - 1], pts[i]);
    cum.push(dist);
  }
  const eles = pts.map((p) => p.ele).filter((e) => Number.isFinite(e));
  const hasEle = eles.length >= pts.length * 0.5;
  let ascent = 0;
  let descent = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  if (hasEle) {
    const first = pts.find((p) => Number.isFinite(p.ele));
    let last = first ? first.ele : 0;
    for (const p of pts) {
      if (!Number.isFinite(p.ele)) continue;
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
  return {
    points: pts,
    cum,
    distM: dist,
    hasEle,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    minEle: hasEle ? Math.round(minEle) : null,
    maxEle: hasEle ? Math.round(maxEle) : null,
    count: pts.length,
  };
}

// Parses a 2bulu KML into raw points + waypoints. Markers live in a 标注点
// folder (id *HisPoint*); everything else is track geometry, either as
// LineString blocks or as one <Point> placemark per GPS fix.
function parseKml(xml) {
  xml = xml.replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '');
  xml = xml.replace(/<(\/?)\w+:/g, '<$1');
  const nameM = xml.match(
    /<name\b[^>]*>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i,
  );
  const name = nameM ? nameM[1].trim() : '';

  const excluded = [];
  const folderRe = /<Folder\b([^>]*)>[\s\S]*?<\/Folder>/g;
  let fm;
  while ((fm = folderRe.exec(xml))) {
    if (/HisPoint|标注点/.test(fm[1]) || /标注点/.test(fm[0].slice(0, 600))) {
      excluded.push([fm.index, fm.index + fm[0].length]);
    }
  }
  let trackXml = xml;
  if (excluded.length) {
    trackXml = excluded.reduceRight((acc, [start, end]) => acc.slice(0, start) + acc.slice(end), xml);
  }

  const points = [];
  const pushToken = (tok) => {
    if (!tok) return;
    const parts = tok.split(',');
    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    const ele = parseFloat(parts[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : NaN });
    }
  };

  // Standard KML track: LineString blocks carry the geometry.
  const lsRe = /<LineString\b[^>]*>[\s\S]*?<\/LineString>/gi;
  for (const ls of xml.match(lsRe) ?? []) {
    for (const cb of ls.match(/<coordinates\b[^>]*>[\s\S]*?<\/coordinates>/gi) ?? []) {
      for (const tok of cb.replace(/<\/?coordinates\b[^>]*>/gi, '').trim().split(/\s+/)) {
        pushToken(tok);
      }
    }
  }
  // Per-point exports: one <coordinates> per GPS fix, in document order.
  if (points.length < 2) {
    for (const cb of trackXml.match(/<coordinates\b[^>]*>[\s\S]*?<\/coordinates>/gi) ?? []) {
      for (const tok of cb.replace(/<\/?coordinates\b[^>]*>/gi, '').trim().split(/\s+/)) {
        pushToken(tok);
      }
    }
  }
  // gx:coord-style exports (rare; kept for parity with the app parser).
  if (points.length < 2) {
    for (const cb of trackXml.match(/<coord\b[^>]*>[\s\S]*?<\/coord>/gi) ?? []) {
      pushToken(cb.replace(/<\/?coord\b[^>]*>/gi, '').trim().replace(/[\s,]+/g, ','));
    }
  }

  const waypoints = [];
  for (const [start, end] of excluded) {
    const block = xml.slice(start, end);
    const pmRe = /<Placemark\b[^>]*>[\s\S]*?<\/Placemark>/gi;
    let pm;
    while ((pm = pmRe.exec(block))) {
      const b = pm[0];
      const wn = b.match(
        /<name\b[^>]*>\s*(?:<!\[CDATA\[)?\s*([^\]<]+?)\s*(?:\]\]>)?\s*<\/name>/i,
      );
      const wc = b.match(
        /<Point\b[^>]*>[\s\S]*?<coordinates\b[^>]*>\s*([-\d.eE+]+),([-\d.eE+]+)(?:,([-\d.eE+]+))?\s*<\/coordinates>/i,
      );
      if (wn && wc) {
        const lon = parseFloat(wc[1]);
        const lat = parseFloat(wc[2]);
        const ele = wc[3] ? parseFloat(wc[3]) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lon) && wn[1].trim()) {
          waypoints.push({ name: wn[1].trim(), lat, lon, ele: Number.isFinite(ele) ? ele : NaN });
        }
      }
    }
  }

  // 2bulu records the outing window as document-level Begin/EndTime Data (ms).
  const beginM = xml.match(/<Data\b[^>]*name="BeginTime"[\s\S]*?<value>\s*([-\d]+)\s*<\/value>/);
  const endM = xml.match(/<Data\b[^>]*name="EndTime"[\s\S]*?<value>\s*([-\d]+)\s*<\/value>/);
  const durationMs =
    beginM && endM && +endM[1] > +beginM[1] ? +endM[1] - +beginM[1] : undefined;

  return { name, points, waypoints, durationMs };
}

// Snaps markers onto the track (same output shape as the app's snapWaypoints).
function snapWaypoints(waypoints, stats) {
  const pts = stats.points;
  const cum = stats.cum;
  const ascCum = [0];
  const descCum = [0];
  if (stats.hasEle) {
    let last = Number.isFinite(pts[0].ele) ? pts[0].ele : null;
    for (let i = 1; i < pts.length; i++) {
      let a = ascCum[i - 1];
      let d = descCum[i - 1];
      if (Number.isFinite(pts[i].ele)) {
        if (last != null) {
          const delta = pts[i].ele - last;
          if (Math.abs(delta) >= 3) {
            if (delta > 0) a += delta;
            else d += -delta;
            last = pts[i].ele;
          }
        } else {
          last = pts[i].ele;
        }
      }
      ascCum.push(a);
      descCum.push(d);
    }
  }
  return waypoints
    .filter((wp) => wp.name.trim())
    .map((wp) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = haversine(wp, pts[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return {
        name: wp.name,
        km: cum[bestIdx] / 1000,
        distanceFromTrackMeters: Math.round(bestDist),
        elevationMeters: Number.isFinite(pts[bestIdx].ele) ? pts[bestIdx].ele : null,
        cumulativeAscentMeters: stats.hasEle ? Math.round(ascCum[bestIdx]) : null,
        cumulativeDescentMeters: stats.hasEle ? Math.round(descCum[bestIdx]) : null,
      };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_WAYPOINTS);
}

function formatTrackDistance(distM) {
  return distM >= 1000
    ? (distM / 1000).toFixed(distM >= 10000 ? 1 : 2) + ' km'
    : Math.round(distM) + ' m';
}

function formatTrackAscent(ascM) {
  return `+${Math.round(ascM)} m`;
}

// buildTrackData equivalent; geometry is decimated because the catalog loads
// every route in one query, while stats stay full-resolution.
function buildTrackData(stats) {
  const pts = stats.points;
  const stride = Math.max(1, Math.floor(pts.length / MAX_COORDS));
  const trackCoords = [];
  for (let i = 0; i < pts.length; i += stride) trackCoords.push([pts[i].lon, pts[i].lat]);
  const last = pts[pts.length - 1];
  if ((pts.length - 1) % stride !== 0) trackCoords.push([last.lon, last.lat]);

  let trackElevation;
  if (stats.hasEle) {
    const estr = Math.max(1, Math.floor(pts.length / MAX_ELEVATION));
    trackElevation = [];
    for (let i = 0; i < pts.length; i += estr) {
      if (Number.isFinite(pts[i].ele)) {
        trackElevation.push({ km: stats.cum[i] / 1000, ele: pts[i].ele });
      }
    }
    if (Number.isFinite(last.ele)) {
      const endKm = stats.distM / 1000;
      if (!trackElevation.length || trackElevation[trackElevation.length - 1].km !== endKm) {
        trackElevation.push({ km: endKm, ele: last.ele });
      }
    }
  }
  return { trackCoords, trackElevation, dist: formatTrackDistance(stats.distM), asc: stats.hasEle ? formatTrackAscent(stats.ascent) : undefined };
}

// ─── route row fields ────────────────────────────────────────────────────────

const TONES = ['ridge', 'forest', 'sand', 'dusk', 'river', 'night', 'moss', 'rock', 'snow'];

// Same PRNG as src/data/tones.ts so the tone (and its photo tile) is stable.
function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

function diffFor(distM, asc) {
  if (distM <= 12000 && asc <= 800) return '易';
  if (distM <= 22000 && asc <= 1500) return '中';
  if (distM <= 40000 && asc <= 2600) return '中高';
  return '高';
}

const sqlStr = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const sqlJson = (v) => (v == null ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
const sqlNum = (v) => (v == null ? 'null' : String(v));

// ─── main ────────────────────────────────────────────────────────────────────

const files = fs
  .readdirSync(KML_DIR)
  .filter((f) => f.toLowerCase().endsWith('.kml'))
  .sort(new Intl.Collator('zh').compare);

const rows = [];
const summary = [];
for (const fileName of files) {
  const xml = fs.readFileSync(path.join(KML_DIR, fileName), 'utf8');
  const parsed = parseKml(xml);
  const stats = computeStats(parsed.points);
  if (!stats) {
    summary.push({ fileName, error: `only ${parsed.points.length} parseable points` });
    continue;
  }
  // The folder filenames are curated; KML document names often carry date/time
  // prefixes or placeholders, so the filename stem is the route name.
  const stem = fileName.replace(/\.kml$/i, '');
  const name = stem;
  const data = buildTrackData(stats);
  const waypoints = parsed.waypoints.length ? snapWaypoints(parsed.waypoints, stats) : undefined;
  const first = stats.points[0];
  const id = `trk${String(rows.length + 1).padStart(3, '0')}`;
  const diff = diffFor(stats.distM, stats.hasEle ? stats.ascent : 0);

  rows.push({
    id,
    name,
    fileName,
    region: regionsByStem[stem] ?? '中国',
    bestMonths: seasonsByStem[stem]?.months ?? null,
    seasonNote: seasonsByStem[stem]?.note ?? null,
    lng: first.lon,
    lat: first.lat,
    dist: data.dist,
    asc: data.asc,
    diff,
    tone: TONES[hashStr(name) % TONES.length],
    trackCoords: data.trackCoords,
    trackElevation: data.trackElevation,
    durationMs: parsed.durationMs,
    trackWaypoints: waypoints,
    pointCount: stats.count,
    distM: stats.distM,
    ascent: stats.hasEle ? stats.ascent : null,
  });
  summary.push({
    id,
    name,
    points: stats.count,
    dist: data.dist,
    asc: data.asc ?? '—',
    diff,
    tone: rows.at(-1).tone,
    markers: waypoints?.length ?? 0,
    hasEle: stats.hasEle,
  });
}

const n = rows.length;
const header = `-- Import the route catalog from local KML track exports.
--
-- Generated by scripts/import-hiking-routes.mjs from ${KML_DIR}
-- on ${new Date().toISOString().slice(0, 10)}. Regenerate with:
--   node scripts/import-hiking-routes.mjs
-- then re-apply with:
--   infra/supabase/apply-migration.sh ${OUT_SQL}
--
-- Effect:
--   1. adds the missing track columns to routes (idempotent)
--   2. detaches journeys from the routes being removed (route_id -> null)
--   3. deletes every route row
--   4. inserts the parsed catalog (${n} routes with decimated track geometry)
`;

const columnsSql = `do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_coords') then
    alter table routes add column track_coords jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_elevation') then
    alter table routes add column track_elevation jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_duration_ms') then
    alter table routes add column track_duration_ms int8;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_waypoints') then
    alter table routes add column track_waypoints jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_file_url') then
    alter table routes add column track_file_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='track_file_name') then
    alter table routes add column track_file_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='best_months') then
    alter table routes add column best_months int4[];
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='routes' and column_name='season_note') then
    alter table routes add column season_note text;
  end if;
end $$;

update journeys set route_id = null where route_id is not null;

delete from routes;

insert into routes
  (id, name, region, coord, lng, lat, dist, asc_, diff, tone, "desc",
   best_months, season_note,
   track_coords, track_elevation, track_duration_ms, track_waypoints,
   track_file_url, track_file_name, created_at)
values`;

const sqlMonths = (months) => (months ? `'{${months.join(',')}}'` : null);

const valueLines = rows.map((r, i) => {
  const coord = `${r.lat.toFixed(2)} N · ${r.lng.toFixed(2)} E`;
  return `  (${sqlStr(r.id)}, ${sqlStr(r.name)}, ${sqlStr(r.region)}, ${sqlStr(coord)}, ${sqlNum(r.lng)}, ${sqlNum(r.lat)},
   ${sqlStr(r.dist)}, ${sqlStr(r.asc)}, ${sqlStr(r.diff)}, ${sqlStr(r.tone)}, null,
   ${sqlMonths(r.bestMonths)}, ${sqlStr(r.seasonNote)},
   ${sqlJson(r.trackCoords)}, ${sqlJson(r.trackElevation)}, ${sqlNum(r.durationMs)}, ${sqlJson(r.trackWaypoints)},
   null, ${sqlStr(r.fileName)}, now() - interval '${n - 1 - i} seconds')`;
});

const sql = `${header}\n${columnsSql}\n${valueLines.join(',\n')};\n`;
fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });
fs.writeFileSync(OUT_SQL, sql);

console.log(`Parsed ${summary.length}/${files.length} files -> ${OUT_SQL}`);
console.log('id      name                              points   dist       asc        diff  tone   markers');
for (const s of summary) {
  if (s.error) {
    console.log(`SKIP    ${s.fileName}: ${s.error}`);
    continue;
  }
  console.log(
    `${s.id}  ${s.name.padEnd(30).slice(0, 30)}  ${String(s.points).padStart(6)}  ${s.dist.padStart(9)}  ${s.asc.padStart(9)}  ${s.diff.padEnd(3)} ${s.tone.padEnd(6)} ${s.markers}`,
  );
}
if (summary.some((s) => s.error)) process.exitCode = 1;
