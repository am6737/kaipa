# Map Layer Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a map layer switcher popup to the map screen so users can switch between 4 base map styles (Voyager, Positron, Satellite, Topo) and toggle route marker visibility.

**Architecture:** New `MapLayerPrefs` model + Riverpod `StateNotifier` persisted via SharedPreferences (same pattern as `ThemePrefsNotifier`). A new `LayerPicker` popup widget rendered as an overlay in the map screen's `Stack`, anchored near the layers button. The `TileLayer` URL and `MarkerLayer` visibility are driven by the provider state.

**Tech Stack:** Flutter, flutter_map, flutter_riverpod, shared_preferences

---

### Task 1: Create MapLayerPrefs model and provider

**Files:**
- Create: `lib/features/discover/data/map_layer_provider.dart`

- [ ] **Step 1: Create the provider file**

Create `lib/features/discover/data/map_layer_provider.dart` with model, notifier, and providers. Follow the exact same pattern as `lib/core/theme/theme_provider.dart`.

```dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/theme_provider.dart';

class MapLayerDef {
  final String key;
  final String label;
  final String urlTemplate;
  final List<String> subdomains;
  final bool retinaMode;

  const MapLayerDef({
    required this.key,
    required this.label,
    required this.urlTemplate,
    this.subdomains = const [],
    this.retinaMode = true,
  });
}

const mapLayers = [
  MapLayerDef(
    key: 'voyager',
    label: '探索',
    urlTemplate:
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
  ),
  MapLayerDef(
    key: 'positron',
    label: '简洁',
    urlTemplate:
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
  ),
  MapLayerDef(
    key: 'satellite',
    label: '卫星',
    urlTemplate:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    retinaMode: false,
  ),
  MapLayerDef(
    key: 'topo',
    label: '地形',
    urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
  ),
];

class MapLayerPrefs {
  final String baseMap;
  final bool showRoutes;

  const MapLayerPrefs({
    this.baseMap = 'voyager',
    this.showRoutes = true,
  });

  MapLayerDef get activeLayer =>
      mapLayers.firstWhere((l) => l.key == baseMap,
          orElse: () => mapLayers.first);

  MapLayerPrefs copyWith({String? baseMap, bool? showRoutes}) {
    return MapLayerPrefs(
      baseMap: baseMap ?? this.baseMap,
      showRoutes: showRoutes ?? this.showRoutes,
    );
  }

  Map<String, dynamic> toJson() => {
        'baseMap': baseMap,
        'showRoutes': showRoutes,
      };

  factory MapLayerPrefs.fromJson(Map<String, dynamic> json) {
    return MapLayerPrefs(
      baseMap: json['baseMap'] as String? ?? 'voyager',
      showRoutes: json['showRoutes'] as bool? ?? true,
    );
  }
}

const _prefsKey = 'kaipa_map_layer_prefs';

class MapLayerPrefsNotifier extends StateNotifier<MapLayerPrefs> {
  final SharedPreferences _prefs;

  MapLayerPrefsNotifier(SharedPreferences prefs)
      : _prefs = prefs,
        super(const MapLayerPrefs()) {
    _load();
  }

  void _load() {
    final raw = _prefs.getString(_prefsKey);
    if (raw != null) {
      try {
        state = MapLayerPrefs.fromJson(
          json.decode(raw) as Map<String, dynamic>,
        );
      } catch (_) {}
    }
  }

  Future<void> _save() async {
    await _prefs.setString(_prefsKey, json.encode(state.toJson()));
  }

  void setBaseMap(String key) {
    state = state.copyWith(baseMap: key);
    _save();
  }

  void toggleShowRoutes() {
    state = state.copyWith(showRoutes: !state.showRoutes);
    _save();
  }
}

final mapLayerPrefsProvider =
    StateNotifierProvider<MapLayerPrefsNotifier, MapLayerPrefs>((ref) {
  final prefs = ref.watch(sharedPrefsProvider);
  return MapLayerPrefsNotifier(prefs);
});
```

Note: `SharedPreferences` is imported via the re-exported `sharedPrefsProvider` from `theme_provider.dart`. That file already exports `sharedPrefsProvider` which gives access to the `SharedPreferences` instance, so we import `theme_provider.dart` to get it. However, `SharedPreferences` the class itself is needed for the constructor type. Import it from `shared_preferences` package.

Correct the imports at the top:
```dart
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/theme/theme_provider.dart';
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/discover/data/map_layer_provider.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/features/discover/data/map_layer_provider.dart
git commit -m "feat(map): add MapLayerPrefs model and Riverpod provider"
```

---

### Task 2: Create LayerPicker popup widget

**Files:**
- Create: `lib/features/discover/presentation/widgets/layer_picker.dart`

- [ ] **Step 1: Create the LayerPicker widget**

Create `lib/features/discover/presentation/widgets/layer_picker.dart`. This is the glass-morphism popup panel that shows the 2x2 grid of base maps and the overlay toggle.

```dart
import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/glass_container.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../data/map_layer_provider.dart';

class LayerPicker extends StatelessWidget {
  final KaipaColors colors;
  final MapLayerPrefs prefs;
  final ValueChanged<String> onBaseMapChanged;
  final VoidCallback onToggleRoutes;
  final VoidCallback onClose;

  const LayerPicker({
    super.key,
    required this.colors,
    required this.prefs,
    required this.onBaseMapChanged,
    required this.onToggleRoutes,
    required this.onClose,
  });

  static const _thumbColors = {
    'voyager': Color(0xFFF2EDE4),
    'positron': Color(0xFFF0F0F0),
    'satellite': Color(0xFF2D4A2E),
    'topo': Color(0xFFE8DCC8),
  };

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      radius: KaipaRadius.lg,
      padding: const EdgeInsets.all(14),
      child: SizedBox(
        width: 186,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title row
            Row(
              children: [
                Text(
                  '地图图层',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: onClose,
                  child: KaipaIcon(
                    name: KaipaIcons.close,
                    size: 14,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // 2x2 grid
            Row(
              children: [
                _Thumb(
                  layer: mapLayers[0],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[0].key,
                  onTap: () => onBaseMapChanged(mapLayers[0].key),
                ),
                const SizedBox(width: 10),
                _Thumb(
                  layer: mapLayers[1],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[1].key,
                  onTap: () => onBaseMapChanged(mapLayers[1].key),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _Thumb(
                  layer: mapLayers[2],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[2].key,
                  onTap: () => onBaseMapChanged(mapLayers[2].key),
                ),
                const SizedBox(width: 10),
                _Thumb(
                  layer: mapLayers[3],
                  colors: colors,
                  isSelected: prefs.baseMap == mapLayers[3].key,
                  onTap: () => onBaseMapChanged(mapLayers[3].key),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Divider
            Container(height: 0.5, color: colors.line),
            const SizedBox(height: 12),
            // Overlay section
            Text(
              '叠加图层',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: colors.inkMuted,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: onToggleRoutes,
              behavior: HitTestBehavior.opaque,
              child: Row(
                children: [
                  KaipaIcon(
                    name: KaipaIcons.route,
                    size: 16,
                    color: prefs.showRoutes ? colors.flare : colors.inkMuted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '路线标记',
                      style: TextStyle(
                        fontSize: 13,
                        color: colors.ink,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ),
                  _Toggle(
                    value: prefs.showRoutes,
                    activeColor: colors.flare,
                    trackColor: colors.line,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  final MapLayerDef layer;
  final KaipaColors colors;
  final bool isSelected;
  final VoidCallback onTap;

  const _Thumb({
    required this.layer,
    required this.colors,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final thumbColor =
        LayerPicker._thumbColors[layer.key] ?? const Color(0xFFE0E0E0);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              height: 56,
              decoration: BoxDecoration(
                color: thumbColor,
                borderRadius: BorderRadius.circular(KaipaRadius.sm),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.line,
                  width: isSelected ? 2 : 0.5,
                ),
              ),
              child: _thumbDecoration(layer.key, thumbColor),
            ),
            const SizedBox(height: 5),
            Text(
              layer.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? colors.flare : colors.inkMuted,
                letterSpacing: -0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbDecoration(String key, Color bg) {
    final lineColor = key == 'satellite'
        ? const Color(0x20FFFFFF)
        : const Color(0x18000000);
    if (key == 'topo') {
      return CustomPaint(
        painter: _ContourPainter(lineColor: lineColor),
        size: Size.infinite,
      );
    }
    return CustomPaint(
      painter: _GridPainter(lineColor: lineColor),
      size: Size.infinite,
    );
  }
}

class _GridPainter extends CustomPainter {
  final Color lineColor;
  _GridPainter({required this.lineColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.5;
    for (var x = size.width * 0.33; x < size.width; x += size.width * 0.33) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = size.height * 0.5; y < size.height; y += size.height * 0.5) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => old.lineColor != lineColor;
}

class _ContourPainter extends CustomPainter {
  final Color lineColor;
  _ContourPainter({required this.lineColor});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < 3; i++) {
      final r = 12.0 + i * 10;
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset(size.width * 0.4, size.height * 0.6),
          width: r * 2,
          height: r * 1.3,
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_ContourPainter old) => old.lineColor != lineColor;
}

class _Toggle extends StatelessWidget {
  final bool value;
  final Color activeColor;
  final Color trackColor;

  const _Toggle({
    required this.value,
    required this.activeColor,
    required this.trackColor,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 36,
      height: 20,
      decoration: BoxDecoration(
        color: value ? activeColor : trackColor,
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(2),
      alignment: value ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        width: 16,
        height: 16,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/discover/presentation/widgets/layer_picker.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/features/discover/presentation/widgets/layer_picker.dart
git commit -m "feat(map): add LayerPicker popup widget"
```

---

### Task 3: Wire up layer picker in MapScreen

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Add imports and state variable**

Add these imports at the top of `map_screen.dart` (after line 13, the existing `circle_button.dart` import):

```dart
import '../data/map_layer_provider.dart';
import 'widgets/layer_picker.dart';
```

Add a boolean field to `_MapScreenState` (after line 29, the `_cityZoom` field):

```dart
bool _showLayerPicker = false;
```

- [ ] **Step 2: Watch the map layer provider in build()**

In `_MapScreenState.build()`, after line 57 (`final immersive = ref.watch(immersiveModeProvider);`), add:

```dart
final layerPrefs = ref.watch(mapLayerPrefsProvider);
final activeLayer = layerPrefs.activeLayer;
```

- [ ] **Step 3: Replace hardcoded TileLayer with provider-driven one**

Replace the `TileLayer` block (lines 79-85):

Old:
```dart
              TileLayer(
                urlTemplate:
                    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
                userAgentPackageName: 'com.kaipa.app',
                retinaMode: true,
              ),
```

New:
```dart
              TileLayer(
                urlTemplate: activeLayer.urlTemplate,
                subdomains: activeLayer.subdomains,
                userAgentPackageName: 'com.kaipa.app',
                retinaMode: activeLayer.retinaMode,
              ),
```

- [ ] **Step 4: Conditionally show MarkerLayer based on showRoutes**

Wrap the `routesAsync.when(...)` block (lines 86-95) so markers only appear when `showRoutes` is true:

Old:
```dart
              routesAsync.when(
                data: (routes) {
                  final filtered = _filterRoutes(routes);
                  return MarkerLayer(
                    markers: _buildMarkers(filtered, colors),
                  );
                },
                loading: () => const MarkerLayer(markers: []),
                error: (_, _) => const MarkerLayer(markers: []),
              ),
```

New:
```dart
              if (layerPrefs.showRoutes)
                routesAsync.when(
                  data: (routes) {
                    final filtered = _filterRoutes(routes);
                    return MarkerLayer(
                      markers: _buildMarkers(filtered, colors),
                    );
                  },
                  loading: () => const MarkerLayer(markers: []),
                  error: (_, _) => const MarkerLayer(markers: []),
                ),
```

- [ ] **Step 5: Wire up the layers CircleButton onTap**

Replace the layers `CircleButton` (lines 253-259):

Old:
```dart
                      // Layers CircleButton (44px glass circle, layers icon)
                      CircleButton(
                        icon: KaipaIcons.layers,
                        size: 44,
                        iconSize: 18,
                        onTap: () {},
                      ),
```

New:
```dart
                      CircleButton(
                        icon: KaipaIcons.layers,
                        size: 44,
                        iconSize: 18,
                        onTap: () => setState(() => _showLayerPicker = !_showLayerPicker),
                      ),
```

- [ ] **Step 6: Add the LayerPicker overlay to the Stack**

Add a new `Positioned` widget inside the main `Stack`, just before the route preview card section (before the `// ── Route preview card` comment, which is around line 287). Also add a tap-outside-to-dismiss barrier:

```dart
          // ── Layer picker popup ──
          if (_showLayerPicker && !immersive) ...[
            // Tap-outside barrier
            Positioned.fill(
              child: GestureDetector(
                onTap: () => setState(() => _showLayerPicker = false),
                behavior: HitTestBehavior.translucent,
                child: const SizedBox.expand(),
              ),
            ),
            // Popup
            Positioned(
              right: 68,
              top: 200,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 200),
                opacity: 1.0,
                child: LayerPicker(
                  colors: colors,
                  prefs: layerPrefs,
                  onBaseMapChanged: (key) {
                    ref.read(mapLayerPrefsProvider.notifier).setBaseMap(key);
                  },
                  onToggleRoutes: () {
                    ref.read(mapLayerPrefsProvider.notifier).toggleShowRoutes();
                  },
                  onClose: () => setState(() => _showLayerPicker = false),
                ),
              ),
            ),
          ],
```

- [ ] **Step 7: Close layer picker when entering immersive mode**

In the fullscreen `CircleButton.onTap` handler (around line 276), add `_showLayerPicker = false`:

Old:
```dart
                      CircleButton(
                        icon: KaipaIcons.fullscreen,
                        size: 44,
                        iconSize: 18,
                        onTap: () {
                          setState(() => _activeRoute = null);
                          ref.read(immersiveModeProvider.notifier).state = true;
                        },
                      ),
```

New:
```dart
                      CircleButton(
                        icon: KaipaIcons.fullscreen,
                        size: 44,
                        iconSize: 18,
                        onTap: () {
                          setState(() {
                            _activeRoute = null;
                            _showLayerPicker = false;
                          });
                          ref.read(immersiveModeProvider.notifier).state = true;
                        },
                      ),
```

- [ ] **Step 8: Verify it compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/discover/presentation/map_screen.dart`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add lib/features/discover/presentation/map_screen.dart
git commit -m "feat(map): wire up layer picker popup in map screen"
```

---

### Task 4: Manual verification in browser

- [ ] **Step 1: Start the dev server**

Run: `cd /home/coder/workspaces/kaipa && flutter run -d chrome --web-port=8080`

- [ ] **Step 2: Verify layer switching**

Open the app in a browser. On the map screen:
1. Tap the layers button (right side, below zoom selector) — popup should appear
2. Verify 4 base map thumbnails are shown in a 2x2 grid with labels (探索, 简洁, 卫星, 地形)
3. The current selection (探索/Voyager) should have a flare-colored border
4. Tap 简洁 — map tiles should switch to the lighter Positron style
5. Tap 卫星 — map should show satellite imagery
6. Tap 地形 — map should show topographic/contour map
7. Tap 探索 — should go back to default Voyager
8. Toggle the 路线标记 switch off — route marker pins should disappear
9. Toggle it back on — pins should reappear
10. Tap outside the popup — it should close
11. Tap the layers button again — should reopen
12. Tap the X button in the popup — should close
13. Enter immersive mode (fullscreen button) — layer picker should auto-close

- [ ] **Step 3: Verify persistence**

1. Select 卫星 base map
2. Refresh the browser page
3. The map should still show satellite tiles after reload

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -u
git commit -m "fix(map): layer picker adjustments from manual testing"
```
