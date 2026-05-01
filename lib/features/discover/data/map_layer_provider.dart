import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
