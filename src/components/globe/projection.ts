// projection.ts — orthographic projection for the SVG fallback globe. Maps
// [lng,lat] onto a front-facing hemisphere centered on (lon0,lat0).
export interface ProjResult {
  x: number; // pixels, relative to globe top-left
  y: number;
  visible: boolean; // on the near side of the sphere
  z: number; // depth (cosc), >0 = front
}

const D2R = Math.PI / 180;

export function project(
  lng: number,
  lat: number,
  lon0: number,
  lat0: number,
  R: number,
  cx: number,
  cy: number
): ProjResult {
  const phi = lat * D2R;
  const lam = (lng - lon0) * D2R;
  const phi0 = lat0 * D2R;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
  const x = R * Math.cos(phi) * Math.sin(lam);
  const y = R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam));
  return { x: cx + x, y: cy - y, visible: cosc >= 0, z: cosc };
}

// Build a graticule (meridians + parallels) as arrays of polyline point strings,
// keeping only near-side segments.
export function graticule(lon0: number, lat0: number, R: number, cx: number, cy: number): string[] {
  const lines: string[] = [];
  const sample = (pts: [number, number][]) => {
    let cur: string[] = [];
    const segs: string[] = [];
    for (const [lng, lat] of pts) {
      const p = project(lng, lat, lon0, lat0, R, cx, cy);
      if (p.visible) {
        cur.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      } else if (cur.length) {
        segs.push(cur.join(' '));
        cur = [];
      }
    }
    if (cur.length) segs.push(cur.join(' '));
    return segs;
  };
  // meridians every 30°
  for (let lng = -180; lng < 180; lng += 30) {
    const pts: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 4) pts.push([lng, lat]);
    lines.push(...sample(pts));
  }
  // parallels every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 4) pts.push([lng, lat]);
    lines.push(...sample(pts));
  }
  return lines;
}
