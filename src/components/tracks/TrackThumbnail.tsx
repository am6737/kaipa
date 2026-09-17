// TrackThumbnail.tsx — the shape of a route, drawn small.
//
// A track's identity is its line, so the library shows each one as a tiny
// polyline instead of a generic glyph. Coordinates are normalized into a padded
// square viewBox with the aspect ratio kept, so a long traverse and a tight loop
// both read correctly. Anything without two usable points falls back to the
// route icon the way a photo-less gear row falls back to a package icon.
import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../../theme/theme';
import { Icon } from '../Icon';

const PAD = 10;
const MAX_POINTS = 140;

export const TrackThumbnail = React.memo(function TrackThumbnail({ theme, coords, size = 84 }: {
  theme: Theme;
  coords?: [number, number][];
  size?: number;
}) {
  const path = useMemo(() => {
    const pts = (coords ?? []).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (pts.length < 2) return null;

    // Thumbnails are ~84pt wide, so a few hundred points add nothing but work.
    const stride = Math.max(1, Math.ceil(pts.length / MAX_POINTS));
    const sampled = pts.filter((_, index) => index % stride === 0);
    if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of sampled) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // A single point has no shape to draw; a track that is straight north-south
    // or east-west still does, so only the both-degenerate case falls back.
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    if (latSpan < 1e-9 && lngSpan < 1e-9) return null;
    const safeLat = Math.max(latSpan, 1e-9);
    const safeLng = Math.max(lngSpan, 1e-9);

    const plot = size - PAD * 2;
    const wide = safeLng >= safeLat;
    const plotW = wide ? plot : plot * (safeLng / safeLat);
    const plotH = wide ? plot * (safeLat / safeLng) : plot;
    const offX = (size - plotW) / 2;
    const offY = (size - plotH) / 2;

    return sampled.map(([lat, lng], index) => {
      const x = offX + ((lng - minLng) / safeLng) * plotW;
      const y = offY + ((maxLat - lat) / safeLat) * plotH; // north is up
      return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }, [coords, size]);

  if (!path) return <Icon name="route" color={theme.accent} size={26} strokeWidth={1.8} />;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* A soft underlay gives the hairline a body at thumbnail scale. */}
      <Path d={path} fill="none" stroke={theme.accentSofter} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={path} fill="none" stroke={theme.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
});
