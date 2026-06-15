// PhotoPin.tsx — the circular photo marker shared by both the real Mapbox globe
// and the SVG fallback. It renders ONLY the visual (status ring → thin gap →
// circular photo → float shadow); each globe wraps it in its own positioning
// (MarkerView coordinate vs. absolute orthographic projection).
//
// The photo is the real scenery image picked deterministically from the POI's
// tone + id (same source PhotoTile uses), so a given POI always shows the same
// shot. While it loads — or if it fails offline — the tone palette mid-stop sits
// behind it so the pin is never blank.
import React from 'react';
import { View, Image, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { GlobePoi, poiColor } from './types';
import { photoUrlFor, paletteFor } from '../../data/tones';

export function PhotoPin({ theme, poi, active }: { theme: Theme; poi: GlobePoi; active?: boolean }) {
  const { fill } = poiColor(poi, theme); // status-colored ring (planning/ongoing/completed/route)
  const size = active ? 52 : 40;
  const ring = active ? 3 : 2.5; // single colored ring thickness
  const inner = size - ring * 2;
  const palette = paletteFor(poi.tone);
  const count = poi.count && poi.count > 1 ? poi.count : 0;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        padding: ring,
        boxShadow: theme.dark ? '0px 2px 6px rgba(0,0,0,0.45)' : '0px 2px 6px rgba(0,0,0,0.22)',
      }}
    >
      <Image
        source={{ uri: photoUrlFor(poi.tone, poi.id, 160) }}
        style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: palette[1] }}
      />
      {/* multi-journey place — small count badge in the top-right corner. The
          white ring keeps it legible over any scenery photo or basemap. */}
      {count ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 8.5,
            backgroundColor: theme.accent,
            borderWidth: 1.5,
            borderColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 13 }}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}
