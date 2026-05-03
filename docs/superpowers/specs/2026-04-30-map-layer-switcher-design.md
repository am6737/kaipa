# Map Layer Switcher Design Spec

## Overview

Add a layer switcher popup to the map screen's existing layers `CircleButton`. Users can switch between 4 base map styles and toggle route marker visibility. The popup anchors near the button on the right side of the screen, using the app's glass-morphism style.

## Base Map Options

| Key | Label | Tile URL | Subdomains |
|-----|-------|----------|------------|
| `voyager` | 探索 | `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` | a,b,c,d |
| `positron` | 简洁 | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` | a,b,c,d |
| `satellite` | 卫星 | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | none |
| `topo` | 地形 | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | a,b,c |

Default: `voyager` (current behavior).

## Overlay Toggle

- **路线标记** — show/hide route marker pins. Default: on.

## UI Layout

The popup appears as a `GlassContainer` panel anchored to the right side of the screen, positioned just to the left of the layers button. It contains:

1. **Title row**: "地图图层" (fontSize 14, w600, `colors.ink`) with a close (X) button
2. **2x2 grid of base map thumbnails** (each ~72x72):
   - Each cell: colored rectangle placeholder representing the map style + label below
   - Selected cell: `flare` color border (2px), label in `flare` color
   - Unselected cell: `colors.line` border (0.5px), label in `colors.inkMuted`
3. **Divider**: 0.5px `colors.line`
4. **Overlay toggles section**: label "叠加图层" (fontSize 12, w600, `colors.inkMuted`), then a row per toggle with label + switch

### Thumbnail Placeholders

Instead of actual map tile screenshots, use styled containers:
- **探索** (Voyager): warm beige `#F2EDE4` with faint grid lines
- **简洁** (Positron): light gray `#F0F0F0` with faint grid lines
- **卫星** (Satellite): dark green-brown `#2D4A2E`
- **地形** (Topo): tan with contour-line-style arcs `#E8DCC8`

### Sizing & Position

- Panel width: 200px
- Position: `right: 68` (44px button + 16px margin + 8px gap), vertically centered with the layers button
- Corner radius: `KaipaRadius.lg` (18)
- Padding: 14px

### Dismiss Behavior

- Tap outside the popup to close
- Tap the layers button again to close
- Selecting a base map keeps the popup open (user may want to compare)

## State Management

### MapLayerPrefs Model

```dart
class MapLayerPrefs {
  final String baseMap; // 'voyager' | 'positron' | 'satellite' | 'topo'
  final bool showRoutes; // toggle route markers

  const MapLayerPrefs({
    this.baseMap = 'voyager',
    this.showRoutes = true,
  });
}
```

### Provider

Follow the same pattern as `ThemePrefsNotifier`:
- `MapLayerPrefsNotifier extends StateNotifier<MapLayerPrefs>`
- Persist to SharedPreferences under key `kaipa_map_layer_prefs`
- Provider: `mapLayerPrefsProvider`

### Integration with MapScreen

- `TileLayer.urlTemplate` reads from `mapLayerPrefs.baseMap` to select the URL
- `TileLayer.subdomains` adjusts per layer (satellite has none)
- `MarkerLayer` is conditionally rendered based on `mapLayerPrefs.showRoutes`
- The layers `CircleButton.onTap` toggles a local `_showLayerPicker` boolean in `_MapScreenState`

## File Changes

| File | Change |
|------|--------|
| `lib/features/discover/data/map_layer_provider.dart` | New file: `MapLayerPrefs`, `MapLayerPrefsNotifier`, `mapLayerPrefsProvider` |
| `lib/features/discover/presentation/map_screen.dart` | Wire up layer picker popup, read tile URL from provider, conditionally show markers |
| `lib/features/discover/presentation/widgets/layer_picker.dart` | New file: `LayerPicker` widget (the popup panel) |

## Behavior Notes

- When switching to satellite view, `retinaMode` should be disabled (ESRI tiles don't support `{r}`)
- `userAgentPackageName` stays `com.kaipa.app` for all tile providers
- The popup uses `GlassContainer` with default (light) style, matching other right-side controls
- Animation: fade in/out with 200ms duration
