// elevation.ts — deterministic elevation series for a POI, derived from its
// distance + total ascent so the profile is plausible and reproducible.
import { hashStr, mulberry32 } from './tones';
import { Poi } from './pois';

export interface ElevPoint {
  km: number;
  ele: number;
  grade: number; // %
}
export interface ElevSeries {
  pts: ElevPoint[];
  totalKm: number;
  minEle: number;
  maxEle: number;
  ascent: number;
  descent: number;
  peakIdx: number;
}

function num(s?: string): number {
  if (!s) return 0;
  const m = String(s).replace(/,/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export function buildElevation(poi: Poi): ElevSeries {
  const totalKm = num(poi.dist) || 12;
  const targetAsc = num(poi.asc) || 800;
  const baseEle = poi.tone === 'snow' ? 3200 : poi.tone === 'ridge' ? 1400 : 800;
  const N = 80;
  const rng = mulberry32(hashStr(poi.name + poi.dist + poi.asc));
  // build a smooth-ish profile that climbs to a peak around 55-70% then descends
  const peakAt = 0.5 + rng() * 0.22;
  const raw: number[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    // base hump toward peak
    let h = Math.sin(Math.min(1, f / peakAt) * (Math.PI / 2));
    if (f > peakAt) h = Math.cos(((f - peakAt) / (1 - peakAt)) * (Math.PI / 2)) * 0.9 + 0.05;
    // add wobble
    h += (rng() - 0.5) * 0.08;
    raw.push(Math.max(0, h));
  }
  const maxRaw = Math.max(...raw);
  const gain = targetAsc / Math.max(0.0001, maxRaw);
  const pts: ElevPoint[] = [];
  let ascent = 0;
  let descent = 0;
  let prev = baseEle + raw[0] * gain;
  let minEle = prev;
  let maxEle = prev;
  let peakIdx = 0;
  for (let i = 0; i < N; i++) {
    const km = (i / (N - 1)) * totalKm;
    const ele = Math.round(baseEle + raw[i] * gain);
    if (i > 0) {
      const d = ele - prev;
      if (d > 0) ascent += d;
      else descent += -d;
    }
    const dkm = i > 0 ? (totalKm / (N - 1)) * 1000 : 1;
    const grade = i > 0 ? ((ele - prev) / dkm) * 100 : 0;
    pts.push({ km, ele, grade });
    if (ele > maxEle) {
      maxEle = ele;
      peakIdx = i;
    }
    if (ele < minEle) minEle = ele;
    prev = ele;
  }
  return { pts, totalKm, minEle, maxEle, ascent: Math.round(ascent), descent: Math.round(descent), peakIdx };
}
