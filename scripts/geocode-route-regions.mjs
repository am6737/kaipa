#!/usr/bin/env node
// geocode-route-regions.mjs — fill each imported route's region with its real
// place name (省 · 市) by reverse-geocoding the track start point with AMap.
//
// Reads AMAP_WEB_KEY from the repo .env and the imported routes from the
// self-hosted database, then writes:
//   scripts/route-regions.json                    — filename stem -> region
//   supabase/migrations/20260917160000_route_regions.sql — UPDATE statements
// scripts/import-hiking-routes.mjs picks the json back up so regenerated
// catalogs keep the real regions without needing network access.
//
// Usage: node scripts/geocode-route-regions.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGIONS_JSON = path.join(ROOT, 'scripts', 'route-regions.json');
const OUT_SQL = path.join(ROOT, 'supabase', 'migrations', '20260917160000_route_regions.sql');
const DB_CONTAINER = process.env.KAIPA_SUPABASE_DB_CONTAINER ?? 'kaipa-supabase-db';

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const amapKey = env.match(/^AMAP_WEB_KEY=(.+)$/m)?.[1]?.trim();
if (!amapKey) {
  console.error('AMAP_WEB_KEY not found in .env');
  process.exit(1);
}

// Routes whose coordinates lie outside AMap's coverage; region can't be
// derived from a Chinese reverse geocode.
const MANUAL_REGIONS = {
  尼泊尔ACT徙步路线: '尼泊尔',
  陆路EBC大环线forios: '尼泊尔',
};

// ─── naming ──────────────────────────────────────────────────────────────────

const stripProvinceSuffix = (s) => s
  .replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市)$/, '');
const stripCitySuffix = (s) => s
  .replace(/(蒙古族藏族自治州|藏族羌族自治州|哈尼族彝族自治州|土家族苗族自治州|傣族自治州|白族自治州|彝族自治州|朝鲜族自治州|哈萨克自治州|蒙古自治州|藏族自治州|苗族自治州|布依族苗族自治州|回族自治州)$/, '')
  .replace(/(自治州|地区|盟|市)$/, '');
const stripDistrictSuffix = (s) => s.replace(/(区|县|市)$/, '');

// 省 · 市, or the shortened province alone when the two collapse to the same
// name (municipalities like 北京 and SARs like 香港).
function regionFrom(addressComponent) {
  const province = stripProvinceSuffix(addressComponent.province ?? '');
  const cityRaw = addressComponent.city ?? '';
  const city = stripCitySuffix(cityRaw && !Array.isArray(cityRaw) ? cityRaw : '');
  const district = stripDistrictSuffix(addressComponent.district ?? '');
  const fallbackCity = city || (province && district) || '';
  if (!province) return '';
  if (!fallbackCity || fallbackCity === province) return province;
  return `${province} · ${fallbackCity}`;
}

// ─── main ────────────────────────────────────────────────────────────────────

const rows = execFileSync('docker', [
  'exec', '-i', DB_CONTAINER, 'psql', '-t', '-A', '-F|', '-U', 'postgres', '-d', 'postgres',
  '-c', 'select id, name, lng, lat, track_file_name from routes order by id',
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  .map((line) => {
    const [id, name, lng, lat, fileName] = line.split('|');
    return { id, name, lng: Number(lng), lat: Number(lat), fileName };
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const regions = {};
const updates = [];
for (const row of rows) {
  const stem = row.fileName?.replace(/\.kml$/i, '');
  if (MANUAL_REGIONS[stem]) {
    regions[stem] = MANUAL_REGIONS[stem];
    updates.push({ ...row, region: MANUAL_REGIONS[stem], source: 'manual' });
    console.log(`${row.id}  ${row.name}  ->  ${MANUAL_REGIONS[stem]}  (manual)`);
    continue;
  }
  let region = '';
  for (let attempt = 0; attempt < 5 && !region; attempt++) {
    try {
      const res = await fetch(
        `https://restapi.amap.com/v3/geocode/regeo?location=${row.lng},${row.lat}&key=${amapKey}&extensions=base`,
      );
      const json = await res.json();
      if (json.status === '1' && json.regeocode) {
        region = regionFrom(json.regeocode.addressComponent ?? {});
      } else if (json.infocode === '10021') {
        // Per-second quota; back off and retry rather than giving up.
        await sleep(2000);
        continue;
      } else {
        console.warn(`${row.id}  ${row.name}: AMap error ${json.infocode} ${json.info}`);
        break; // auth/quota errors won't improve on retry
      }
    } catch (error) {
      console.warn(`${row.id}  ${row.name}: request failed (${error.message})`);
    }
    if (!region) await sleep(400);
  }
  if (!region) {
    region = '海外';
    console.warn(`${row.id}  ${row.name}  ->  海外  (reverse geocode returned nothing)`);
  } else {
    console.log(`${row.id}  ${row.name}  ->  ${region}`);
  }
  regions[stem] = region;
  updates.push({ ...row, region });
  await sleep(250);
}

fs.writeFileSync(REGIONS_JSON, `${JSON.stringify(regions, null, 2)}\n`);

const sqlLines = updates.map((u) => `update routes set region = ${sqlStr(u.region)} where id = ${sqlStr(u.id)};`);
const sql = `-- Fill imported routes with real region names (省 · 市) reverse-geocoded
-- from each track's start point via the AMap regeo API.
--
-- Generated by scripts/geocode-route-regions.mjs on ${new Date().toISOString().slice(0, 10)}.
-- Regenerate with:
--   node scripts/geocode-route-regions.mjs
-- The stem -> region map is also persisted in scripts/route-regions.json so
-- scripts/import-hiking-routes.mjs can embed regions offline.

${sqlLines.join('\n')}
`;
fs.writeFileSync(OUT_SQL, sql);
console.log(`\nWrote ${updates.length} updates -> ${OUT_SQL}`);
console.log(`Wrote region map -> ${REGIONS_JSON}`);

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
