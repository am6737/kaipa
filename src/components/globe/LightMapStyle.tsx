import React from 'react';
import { BackgroundLayer, FillLayer, LineLayer, SymbolLayer } from '@rnmapbox/maps';

// Overrides Mapbox Light's existing layers so the discovery map reads like a
// quiet travel canvas: cool water, nearly-white land, sparse roads, soft labels,
// pale province lines, and a selected-country boundary accent.
const LIGHT_MAP = {
  land: '#F8F9F6',
  forest: '#98C98B',
  grass: '#B7DDA9',
  agriculture: '#D2E5B8',
  park: '#8FC482',
  water: '#BDEBF6',
  waterLine: '#AFE3F0',
  road: '#FFFFFF',
  building: '#E9ECE9',
  province: '#B8D7DE',
  country: '#B45B70',
  label: '#858D90',
  labelMuted: '#9AA2A5',
  halo: 'rgba(255,255,255,0.96)',
} as const;

export const LIGHT_MAP_BACKGROUND = LIGHT_MAP.water;

const LIGHT_HIDDEN_LINE_LAYERS = [
  'tunnel-path-trail',
  'tunnel-path-cycleway-piste',
  'tunnel-path',
  'tunnel-steps',
  'tunnel-pedestrian',
  'road-path-trail',
  'road-path-cycleway-piste',
  'road-path',
  'road-steps',
  'road-pedestrian',
  'road-rail',
  'bridge-path-trail',
  'bridge-path-cycleway-piste',
  'bridge-path',
  'bridge-steps',
  'bridge-pedestrian',
  'bridge-rail',
] as const;

const LIGHT_ROAD_LINE_LAYERS = [
  'tunnel-simple',
  'road-simple',
  'bridge-case-simple',
  'bridge-simple',
] as const;

export function LightMapOverrides({ locale, showLabels = true }: { locale: 'zh' | 'en'; showLabels?: boolean }) {
  const labelField = locale === 'zh'
    ? ['coalesce', ['get', 'name_zh-Hans'], ['get', 'name_zh'], ['get', 'name']]
    : ['coalesce', ['get', 'name_en'], ['get', 'name']];

  return (
    <>
      <BackgroundLayer id="land" existing style={{ backgroundColor: LIGHT_MAP.land }} />
      <FillLayer
        id="national-park"
        existing
        minZoomLevel={2}
        style={{
          fillColor: LIGHT_MAP.park,
          fillOpacity: ['interpolate', ['linear'], ['zoom'], 2, 0.48, 5, 0.82, 11, 0.68] as any,
        }}
      />
      <FillLayer
        id="landuse"
        existing
        minZoomLevel={3}
        style={{
          fillColor: [
            'match',
            ['get', 'class'],
            ['wood', 'scrub'], LIGHT_MAP.forest,
            ['grass', 'park'], LIGHT_MAP.grass,
            'agriculture', LIGHT_MAP.agriculture,
            'glacier', '#EAF5F6',
            'sand', '#F3EFE4',
            LIGHT_MAP.land,
          ] as any,
          fillOpacity: ['interpolate', ['linear'], ['zoom'], 3, 0.42, 6, 0.76, 12, 0.64] as any,
        }}
      />
      <FillLayer id="water" existing style={{ fillColor: LIGHT_MAP.water }} />
      <LineLayer id="waterway" existing style={{ lineColor: LIGHT_MAP.waterLine, lineOpacity: 0.82 }} />
      <FillLayer id="land-structure-polygon" existing style={{ fillColor: LIGHT_MAP.land }} />
      <LineLayer id="land-structure-line" existing style={{ lineColor: LIGHT_MAP.land }} />
      <FillLayer id="building" existing style={{ fillColor: LIGHT_MAP.building, fillOpacity: 0.48 }} />

      {LIGHT_HIDDEN_LINE_LAYERS.map((id) => (
        <LineLayer key={id} id={id} existing style={{ visibility: 'none' }} />
      ))}
      {LIGHT_ROAD_LINE_LAYERS.map((id) => (
        <LineLayer key={id} id={id} existing style={{ lineColor: LIGHT_MAP.road, lineOpacity: 1 }} />
      ))}

      <LineLayer
        id="admin-1-boundary-bg"
        existing
        style={{ lineOpacity: 0 }}
      />
      <LineLayer
        id="admin-0-boundary-bg"
        existing
        style={{
          lineColor: LIGHT_MAP.halo,
          lineOpacity: 0.9,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 2.6, 7, 5] as any,
          lineBlur: 0.35,
        }}
      />
      <LineLayer
        id="admin-1-boundary"
        existing
        style={{
          lineColor: LIGHT_MAP.province,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 2, 0.45, 5, 0.78] as any,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 0.45, 8, 1.1] as any,
          lineDasharray: [1, 0],
        }}
      />
      <LineLayer
        id="admin-0-boundary"
        existing
        style={{
          lineColor: '#C3CBCE',
          lineOpacity: 0.72,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1.15, 7, 2.25] as any,
          lineDasharray: [10, 0],
        }}
      />
      <LineLayer
        id="admin-0-boundary-disputed"
        existing
        style={{
          lineColor: '#C3CBCE',
          lineOpacity: 0.68,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1.15, 7, 2.25] as any,
        }}
      />

      {/* The reference highlights the currently selected country. Kaipa opens on
          China, so reuse Mapbox Streets' own admin geometry instead of bundling
          a second geopolitical dataset. Other country boundaries stay subdued. */}
      <LineLayer
        id="kaipa-light-china-boundary"
        sourceID="composite"
        sourceLayerID="admin"
        aboveLayerID="admin-0-boundary-disputed"
        filter={[
          'all',
          ['==', ['get', 'admin_level'], 0],
          ['==', ['get', 'maritime'], 'false'],
          ['==', ['get', 'disputed'], 'false'],
          ['in', 'CN', ['get', 'iso_3166_1']],
          ['match', ['get', 'worldview'], ['all', 'CN'], true, false],
        ] as any}
        style={{
          lineColor: LIGHT_MAP.country,
          lineOpacity: 0.98,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1.4, 7, 2.7] as any,
          lineJoin: 'round',
        }}
      />
      <LineLayer
        id="kaipa-light-china-boundary-disputed"
        sourceID="composite"
        sourceLayerID="admin"
        aboveLayerID="kaipa-light-china-boundary"
        filter={[
          'all',
          ['==', ['get', 'admin_level'], 0],
          ['any', ['==', ['get', 'disputed'], 'true'], ['==', ['get', 'maritime'], 'true']],
          ['in', 'CN', ['get', 'iso_3166_1']],
          ['match', ['get', 'worldview'], ['all', 'CN'], true, false],
        ] as any}
        style={{
          lineColor: LIGHT_MAP.country,
          lineOpacity: 0.94,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1.25, 7, 2.45] as any,
          lineDasharray: [3, 3],
          lineJoin: 'round',
        }}
      />

      {['waterway-label', 'water-line-label', 'water-point-label'].map((id) => (
        <SymbolLayer
          key={id}
          id={id}
          existing
          style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: '#87AEB8', textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.1 }}
        />
      ))}
      {['natural-line-label', 'natural-point-label'].map((id) => (
        <SymbolLayer
          key={id}
          id={id}
          existing
          style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.1 }}
        />
      ))}
      <SymbolLayer id="poi-label" existing style={{ visibility: 'none' }} />
      <SymbolLayer id="airport-label" existing style={{ visibility: 'none' }} />
      <SymbolLayer
        id="road-label-simple"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.2 }}
      />
      <SymbolLayer
        id="settlement-subdivision-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.2 }}
      />
      <SymbolLayer
        id="settlement-minor-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.3 }}
      />
      <SymbolLayer
        id="settlement-major-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.label, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.4 }}
      />
      <SymbolLayer
        id="state-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textOpacity: 0.72, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.25 }}
      />
      <SymbolLayer
        id="country-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.label, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.5 }}
      />
      <SymbolLayer
        id="continent-label"
        existing
        style={{ visibility: showLabels ? 'visible' : 'none', textField: labelField as any, textColor: LIGHT_MAP.labelMuted, textHaloColor: LIGHT_MAP.halo, textHaloWidth: 1.4 }}
      />
    </>
  );
}
