# Footprint Memories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a footprint/personal-memory perspective to the map, letting users see routes they've actually walked and view rich trip memories (photos, notes, GPS track replay, weather/gear review).

**Architecture:** New `features/footprint/` module with domain model, repository, and presentation screens. MapScreen gains a perspective toggle (发现/足迹) that switches between community route markers and personal footprint markers. Tapping a footprint marker opens FootprintDetailScreen — a full scrollable memory archive. Existing trips table is reused; no new DB tables needed.

**Tech Stack:** Flutter + Riverpod + GoRouter + Supabase (PostgreSQL) + flutter_map + latlong2

**Task ordering:** All new files are created first (standalone), then screens (depends on widgets), then modifications to existing files.

---

### Task 1: Create FootprintMemory domain model

**Files:**
- Create: `lib/features/footprint/domain/footprint_memory.dart`

- [ ] **Step 1: Write the model**

```dart
import '../../trip/domain/trip_model.dart';

class FootprintMemory {
  final TripModel trip;
  final String? routeName;
  final String? routeDifficulty;
  final double? routeDistanceKm;
  final double? routeElevationM;
  final bool isManual;
  final double latitude;
  final double longitude;

  const FootprintMemory({
    required this.trip,
    this.routeName,
    this.routeDifficulty,
    this.routeDistanceKm,
    this.routeElevationM,
    this.isManual = false,
    required this.latitude,
    required this.longitude,
  });

  String get displayName {
    if (trip.routeName != null && trip.routeName!.isNotEmpty) return trip.routeName!;
    final d = trip.startedAt;
    return '${d.month}月${d.day}日 徒步';
  }

  String get dateLabel {
    final d = trip.startedAt;
    return '${d.year}.${d.month.toString().padLeft(2, '0')}.${d.day.toString().padLeft(2, '0')}';
  }
}
```

- [ ] **Step 2: Verify the file compiles alone**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/domain/footprint_memory.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/domain/footprint_memory.dart
git commit -m "feat(footprint): add FootprintMemory domain model"
```

---

### Task 2: Create PhotoWall widget

**Files:**
- Create: `lib/features/footprint/presentation/widgets/photo_wall.dart`

- [ ] **Step 1: Write the widget**

```dart
import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';

class PhotoWall extends StatelessWidget {
  final List<String> photos;
  final KaipaColors colors;
  final VoidCallback? onAdd;

  const PhotoWall({super.key, required this.photos, required this.colors, this.onAdd});

  @override
  Widget build(BuildContext context) {
    final size = (MediaQuery.of(context).size.width - 52) / 3;
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        ...photos.map((url) => _photoTile(url, size)),
        if (onAdd != null) _addTile(size),
      ],
    );
  }

  Widget _photoTile(String url, double size) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: size,
        height: size,
        child: Image.network(url, fit: BoxFit.cover,
          errorBuilder: (_, _, _) => Container(color: colors.surfaceHi)),
      ),
    );
  }

  Widget _addTile(double size) {
    return GestureDetector(
      onTap: onAdd,
      child: Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Center(child: Icon(Icons.add_rounded, size: 28, color: colors.inkDim)),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/presentation/widgets/photo_wall.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/presentation/widgets/photo_wall.dart
git commit -m "feat(footprint): add PhotoWall widget"
```

---

### Task 3: Create TrackReplayMap widget

**Files:**
- Create: `lib/features/footprint/presentation/widgets/track_replay_map.dart`

- [ ] **Step 1: Write the widget**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import '../../../../core/theme/kaipa_tokens.dart';

class TrackReplayMap extends StatelessWidget {
  final Map<String, dynamic> trackGeojson;
  final KaipaColors colors;

  const TrackReplayMap({super.key, required this.trackGeojson, required this.colors});

  @override
  Widget build(BuildContext context) {
    final trackPoints = _extractTrackPoints();
    if (trackPoints.isEmpty) {
      return Center(child: Text('无轨迹数据', style: TextStyle(color: colors.inkDim)));
    }
    final bounds = _computeBounds(trackPoints);
    final center = LatLng(
      (bounds['north']! + bounds['south']!) / 2,
      (bounds['east']! + bounds['west']!) / 2,
    );

    return FlutterMap(
      options: MapOptions(
        initialCenter: center,
        initialZoom: 13.0,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          userAgentPackageName: 'com.kaipa.app',
        ),
        PolylineLayer(polylines: [
          Polyline(points: trackPoints, color: colors.flare, strokeWidth: 3),
        ]),
        MarkerLayer(markers: [
          _endpointMarker(trackPoints.first, colors.moss),
          _endpointMarker(trackPoints.last, colors.flare),
        ]),
      ],
    );
  }

  Marker _endpointMarker(LatLng point, Color color) {
    return Marker(
      point: point, width: 24, height: 24,
      child: Container(
        decoration: BoxDecoration(color: color, shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2)),
      ),
    );
  }

  List<LatLng> _extractTrackPoints() {
    try {
      final type = trackGeojson['type'] as String?;
      dynamic coords;
      if (type == 'FeatureCollection') {
        final features = trackGeojson['features'] as List?;
        if (features == null || features.isEmpty) return [];
        for (final f in features) {
          final geom = (f as Map)['geometry'] as Map<String, dynamic>?;
          if (geom?['type'] == 'LineString') { coords = geom!['coordinates']; break; }
        }
      } else if (type == 'Feature') {
        coords = (trackGeojson['geometry'] as Map<String, dynamic>?)!['coordinates'];
      } else if (type == 'LineString') {
        coords = trackGeojson['coordinates'];
      }
      if (coords is List) {
        return coords.whereType<List>().where((c) => c.length >= 2)
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Map<String, double> _computeBounds(List<LatLng> points) {
    double north = -90, south = 90, east = -180, west = 180;
    for (final p in points) {
      if (p.latitude > north) north = p.latitude;
      if (p.latitude < south) south = p.latitude;
      if (p.longitude > east) east = p.longitude;
      if (p.longitude < west) west = p.longitude;
    }
    return {'north': north, 'south': south, 'east': east, 'west': west};
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/presentation/widgets/track_replay_map.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/presentation/widgets/track_replay_map.dart
git commit -m "feat(footprint): add TrackReplayMap widget"
```

---

### Task 4: Create TripSwitcher widget

**Files:**
- Create: `lib/features/footprint/presentation/widgets/trip_switcher.dart`

- [ ] **Step 1: Write the widget**

```dart
import 'package:flutter/material.dart';
import '../../../trip/domain/trip_model.dart';
import '../../../../core/theme/kaipa_tokens.dart';

class TripSwitcher extends StatelessWidget {
  final List<TripModel> trips;
  final TripModel selected;
  final KaipaColors colors;
  final ValueChanged<TripModel> onSelect;

  const TripSwitcher({
    super.key,
    required this.trips,
    required this.selected,
    required this.colors,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (trips.length <= 1) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: trips.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final trip = trips[index];
          final isSelected = trip.id == selected.id;
          return GestureDetector(
            onTap: () => onSelect(trip),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isSelected ? colors.flare : colors.surface,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.line,
                  width: 0.5,
                ),
              ),
              child: Text(
                '${trip.startedAt.month}/${trip.startedAt.day}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? Colors.white : colors.ink,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/presentation/widgets/trip_switcher.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/presentation/widgets/trip_switcher.dart
git commit -m "feat(footprint): add TripSwitcher widget"
```

---

### Task 5: Create FootprintRepository

**Files:**
- Create: `lib/features/footprint/data/footprint_repository.dart`

- [ ] **Step 1: Write the repository**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/supabase/supabase_provider.dart';
import '../domain/footprint_memory.dart';
import '../../trip/domain/trip_model.dart';

class FootprintRepository {
  final SupabaseClient _client;

  FootprintRepository(this._client);

  /// Fetch all completed trips with route info for footprint map display.
  Future<List<FootprintMemory>> fetchMemories() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');

    final data = await _client
        .from('trips')
        .select('*, routes!left(name, difficulty, distance_km, elevation_gain_m, latitude, longitude)')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', ascending: false)
        .limit(200);

    final memories = <FootprintMemory>[];
    for (final row in (data as List)) {
      final trip = TripModel.fromJson(row as Map<String, dynamic>);
      final routeData = row['routes'] as Map<String, dynamic>?;

      final double? lat;
      final double? lng;

      if (routeData != null && routeData['latitude'] != null) {
        lat = _parseDouble(routeData['latitude']);
        lng = _parseDouble(routeData['longitude']);
      } else if (trip.trackGeojson != null) {
        final c = _firstCoordFromGeojson(trip.trackGeojson!);
        lat = c?.$1;
        lng = c?.$2;
      } else {
        continue; // no coordinates available
      }

      if (lat == null || lng == null) continue;

      memories.add(FootprintMemory(
        trip: trip,
        routeName: trip.routeName ?? routeData?['name'] as String?,
        routeDifficulty: routeData?['difficulty'] as String?,
        routeDistanceKm: routeData != null ? _parseDouble(routeData['distance_km']) : null,
        routeElevationM: routeData != null ? _parseDouble(routeData['elevation_gain_m']) : null,
        isManual: trip.source == 'manual',
        latitude: lat,
        longitude: lng,
      ));
    }
    return memories;
  }

  /// Update trip notes and photos.
  Future<void> updateMemory({
    required String tripId,
    String? notes,
    List<String>? photos,
  }) async {
    final updates = <String, dynamic>{};
    if (notes != null) updates['notes'] = notes;
    if (photos != null) updates['photos'] = photos;
    if (updates.isNotEmpty) {
      await _client.from('trips').update(updates).eq('id', tripId);
    }
  }

  /// Publish a trip memory to the community feed.
  Future<void> shareToFeed({
    required String tripId,
    String? routeId,
    required Map<String, dynamic> content,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client.from('feed_items').insert({
      'user_id': userId,
      'type': 'trip_share',
      'content': content,
      'route_id': routeId,
      'trip_id': tripId,
    });
  }

  static double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static (double, double)? _firstCoordFromGeojson(Map<String, dynamic> geojson) {
    try {
      final type = geojson['type'] as String?;
      dynamic coords;
      if (type == 'FeatureCollection') {
        final features = geojson['features'] as List?;
        if (features == null || features.isEmpty) return null;
        final geom = (features[0] as Map)['geometry'] as Map<String, dynamic>?;
        coords = geom?['coordinates'];
      } else if (type == 'Feature') {
        final geom = geojson['geometry'] as Map<String, dynamic>?;
        coords = geom?['coordinates'];
      } else if (type == 'LineString') {
        coords = geojson['coordinates'];
      }
      if (coords is List && coords.isNotEmpty) {
        final first = coords[0];
        if (first is List && first.length >= 2) {
          return (_parseDouble(first[0]) ?? 0, _parseDouble(first[1]) ?? 0);
        }
      }
    } catch (_) {}
    return null;
  }
}

final footprintRepositoryProvider = Provider<FootprintRepository>((ref) {
  final client = ref.watch(supabaseProvider);
  return FootprintRepository(client);
});

final footprintMemoriesProvider = FutureProvider<List<FootprintMemory>>((ref) async {
  final repo = ref.watch(footprintRepositoryProvider);
  return repo.fetchMemories();
});
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/data/footprint_repository.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/data/footprint_repository.dart
git commit -m "feat(footprint): add FootprintRepository"
```

---

### Task 6: Create FootprintPreviewCard widget

**Files:**
- Create: `lib/features/footprint/presentation/widgets/footprint_preview_card.dart`

- [ ] **Step 1: Write the widget**

```dart
import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../../../core/widgets/glass_container.dart';
import '../../../../core/widgets/diff_badge.dart';
import '../../domain/footprint_memory.dart';

class FootprintPreviewCard extends StatelessWidget {
  final FootprintMemory memory;
  final KaipaColors colors;
  final String photoUrl;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const FootprintPreviewCard({
    super.key,
    required this.memory,
    required this.colors,
    required this.photoUrl,
    required this.onTap,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final t = memory.trip;
    final distStr = t.actualDistanceKm?.toStringAsFixed(1) ?? '--';
    final elevStr = t.actualElevationM?.toInt().toString() ?? '--';
    final durStr = t.actualDuration != null ? _fmtDur(t.actualDuration!) : '--';
    final hasPhoto = photoUrl.isNotEmpty;

    return GlassContainer(
      radius: 24,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24), topRight: Radius.circular(24),
            ),
            child: SizedBox(
              width: double.infinity, height: 150,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (hasPhoto)
                    Image.network(photoUrl, fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _placeholder()),
                  if (!hasPhoto) _placeholder(),
                  Positioned(
                    top: 10, left: 0, right: 0,
                    child: Center(
                      child: Container(
                        width: 36, height: 4,
                        decoration: BoxDecoration(
                          color: const Color.fromRGBO(255, 255, 255, 0.6),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(memory.dateLabel,
                  style: TextStyle(fontSize: 11, color: colors.inkMuted)),
                const SizedBox(height: 4),
                Text(memory.displayName,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700,
                    letterSpacing: -0.6, color: colors.ink)),
                const SizedBox(height: 6),
                Row(children: [
                  if (memory.routeDifficulty != null)
                    DiffBadge(level: memory.routeDifficulty!),
                  if (memory.routeDifficulty != null) const SizedBox(width: 8),
                  Expanded(
                    child: Text('$distStr 公里 · ↑$elevStr m · $durStr',
                      style: TextStyle(fontSize: 12, color: colors.inkMuted),
                      overflow: TextOverflow.ellipsis),
                  ),
                  if (memory.isManual)
                    Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: colors.sand, borderRadius: BorderRadius.circular(99)),
                      child: Text('手动',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: colors.ink)),
                    ),
                ]),
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: onTap,
                  child: Container(
                    width: double.infinity, height: 46,
                    decoration: BoxDecoration(
                      color: colors.moss,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [BoxShadow(
                        color: colorWithOpacity(colors.moss, 0.35),
                        blurRadius: 14, offset: const Offset(0, 4))],
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        KaipaIcon(name: KaipaIcons.mountain, size: 16, color: Colors.white),
                        SizedBox(width: 8),
                        Text('查看足迹回忆',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: colors.moss.withAlpha(30),
      child: Center(
        child: KaipaIcon(name: KaipaIcons.mountain, size: 40, color: colors.moss)),
    );
  }

  String _fmtDur(Duration d) {
    if (d.inHours > 0) {
      final m = d.inMinutes % 60;
      return m > 0 ? '${d.inHours} 小时 $m 分' : '${d.inHours} 小时';
    }
    return '${d.inMinutes} 分';
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/presentation/widgets/footprint_preview_card.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/presentation/widgets/footprint_preview_card.dart
git commit -m "feat(footprint): add FootprintPreviewCard widget"
```

---

### Task 7: Create FootprintDetailScreen

**Files:**
- Create: `lib/features/footprint/presentation/footprint_detail_screen.dart`

- [ ] **Step 1: Write the full detail screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../../../core/widgets/glass_container.dart';
import '../../trip/data/trip_repository.dart';
import '../../trip/domain/trip_model.dart';
import '../data/footprint_repository.dart';
import 'widgets/photo_wall.dart';
import 'widgets/track_replay_map.dart';

class FootprintDetailScreen extends ConsumerStatefulWidget {
  final String tripId;
  const FootprintDetailScreen({super.key, required this.tripId});

  @override
  ConsumerState<FootprintDetailScreen> createState() => _FootprintDetailScreenState();
}

class _FootprintDetailScreenState extends ConsumerState<FootprintDetailScreen> {
  final _notesController = TextEditingController();
  bool _editingNotes = false;
  bool _sharing = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final tripAsync = ref.watch(tripByIdProvider(widget.tripId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: tripAsync.when(
        data: (trip) {
          if (_notesController.text.isEmpty) {
            _notesController.text = trip.notes ?? '';
          }
          return _buildContent(trip, colors);
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
      ),
    );
  }

  Widget _buildContent(TripModel trip, KaipaColors colors) {
    final hasPhotos = trip.photos.isNotEmpty;
    final hasTrack = trip.trackGeojson != null;

    return Stack(
      children: [
        CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _buildHeader(trip, colors, hasPhotos, hasTrack)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 16),
                    _buildTitle(trip, colors),
                    const SizedBox(height: 16),
                    _buildStatsCard(trip, colors),
                    const SizedBox(height: 16),
                    if (hasTrack) ...[
                      _buildTrackSection(trip, colors),
                      const SizedBox(height: 16),
                    ],
                    if (trip.weatherSummary != null) ...[
                      _buildWeatherCard(trip, colors),
                      const SizedBox(height: 16),
                    ],
                    _buildPhotoSection(trip, colors),
                    const SizedBox(height: 20),
                    _buildNotesSection(trip, colors),
                  ],
                ),
              ),
            ),
          ],
        ),
        Positioned(
          left: 0, right: 0, bottom: 0,
          child: _buildBottomBar(trip, colors),
        ),
        Positioned(
          top: MediaQuery.of(context).padding.top + 8, left: 8,
          child: GestureDetector(
            onTap: () => context.pop(),
            child: GlassContainer(
              radius: 99, padding: const EdgeInsets.all(8),
              child: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
            ),
          ),
        ),
      ],
    );
  }

  // ─── Header ────────────────────────────────────────────────────────
  Widget _buildHeader(TripModel trip, KaipaColors colors, bool hasPhotos, bool hasTrack) {
    return SizedBox(
      height: 260,
      child: hasPhotos
          ? Image.network(trip.photos.first, fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _headerPlaceholder(colors, trip))
          : hasTrack
              ? TrackReplayMap(trackGeojson: trip.trackGeojson!, colors: colors)
              : _headerPlaceholder(colors, trip),
    );
  }

  Widget _headerPlaceholder(KaipaColors colors, TripModel trip) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [colors.mossDeep, colorWithOpacity(colors.flare, 0.7)],
        ),
      ),
      child: Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          KaipaIcon(name: KaipaIcons.mountain, size: 48,
            color: Colors.white.withAlpha(120)),
          const SizedBox(height: 12),
          Text(trip.routeName ?? '我的足迹',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white)),
        ]),
      ),
    );
  }

  // ─── Title ─────────────────────────────────────────────────────────
  Widget _buildTitle(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
          child: Text(
            trip.routeName ?? '${trip.startedAt.month}月${trip.startedAt.day}日 徒步',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700,
              color: colors.ink, letterSpacing: -0.6),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: colors.moss.withAlpha(30),
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text('已完成',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.moss)),
        ),
      ]),
      const SizedBox(height: 4),
      Text(
        '${trip.startedAt.year}.${trip.startedAt.month.toString().padLeft(2, '0')}.${trip.startedAt.day.toString().padLeft(2, '0')}',
        style: TextStyle(fontSize: 13, color: colors.inkMuted)),
    ]);
  }

  // ─── Stats ─────────────────────────────────────────────────────────
  Widget _buildStatsCard(TripModel trip, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          KaipaIcon(name: KaipaIcons.altitude, size: 14, color: colors.inkMuted),
          const SizedBox(width: 4),
          Text('行程数据',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _stat('距离', '${trip.actualDistanceKm?.toStringAsFixed(1) ?? "--"} km', colors),
          _stat('爬升', '${trip.actualElevationM?.toInt().toString() ?? "--"} m', colors),
          _stat('用时', trip.actualDuration != null ? _fmtDur(trip.actualDuration!) : '--', colors),
          _stat('均速', '${trip.avgSpeedKmh?.toStringAsFixed(1) ?? "--"} km/h', colors),
        ]),
      ]),
    );
  }

  Widget _stat(String label, String value, KaipaColors colors) {
    return Expanded(
      child: Column(children: [
        Text(value,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700,
            color: colors.ink, letterSpacing: -0.3)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 11, color: colors.inkDim)),
      ]),
    );
  }

  String _fmtDur(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return '$h:${m.toString().padLeft(2, '0')}';
  }

  // ─── Track ─────────────────────────────────────────────────────────
  Widget _buildTrackSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(title: 'GPS 轨迹', padding: EdgeInsets.zero),
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          height: 180,
          child: TrackReplayMap(trackGeojson: trip.trackGeojson!, colors: colors),
        ),
      ),
    ]);
  }

  // ─── Weather ───────────────────────────────────────────────────────
  Widget _buildWeatherCard(TripModel trip, KaipaColors colors) {
    final w = trip.weatherSummary!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          KaipaIcon(name: KaipaIcons.sun, size: 16, color: colors.flare),
          const SizedBox(width: 6),
          Text('天气回顾', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _chip('${w['temperature'] ?? '--'}°C', colors),
          _chip('${w['condition'] ?? '--'}', colors),
          _chip('风 ${w['wind'] ?? '--'}', colors),
        ]),
      ]),
    );
  }

  Widget _chip(String label, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: colors.surfaceHi, borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colors.lineSoft, width: 0.5),
      ),
      child: Text(label, style: TextStyle(fontSize: 12, color: colors.ink)),
    );
  }

  // ─── Photos ────────────────────────────────────────────────────────
  Widget _buildPhotoSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle(
        title: '照片', padding: EdgeInsets.zero,
        trailing: Text('${trip.photos.length} 张',
          style: TextStyle(fontSize: 11, color: colors.inkDim)),
      ),
      const SizedBox(height: 8),
      if (trip.photos.isEmpty)
        Text('还没有照片', style: TextStyle(fontSize: 12, color: colors.inkDim)),
      if (trip.photos.isNotEmpty)
        PhotoWall(photos: trip.photos, colors: colors,
          onAdd: () => _onAddPhotos()),
    ]);
  }

  void _onAddPhotos() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('照片选择功能将在后续版本支持')),
    );
  }

  // ─── Notes ─────────────────────────────────────────────────────────
  Widget _buildNotesSection(TripModel trip, KaipaColors colors) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: SectionTitle(title: '笔记', padding: EdgeInsets.zero)),
        GestureDetector(
          onTap: () {
            setState(() {
              if (_editingNotes) _saveNotes(trip);
              _editingNotes = !_editingNotes;
            });
          },
          child: Text(_editingNotes ? '保存' : '编辑',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.flare)),
        ),
      ]),
      const SizedBox(height: 8),
      if (_editingNotes)
        TextField(
          controller: _notesController,
          maxLines: 5, minLines: 3,
          style: TextStyle(fontSize: 13, color: colors.ink),
          decoration: InputDecoration(
            hintText: '记录你的感受和回忆…',
            hintStyle: TextStyle(fontSize: 13, color: colors.inkDim),
            filled: true, fillColor: colors.surface,
            contentPadding: const EdgeInsets.all(12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.flare, width: 1)),
          ),
        )
      else
        Text(
          trip.notes?.isNotEmpty == true ? trip.notes! : '暂无笔记',
          style: TextStyle(fontSize: 13,
            color: trip.notes?.isNotEmpty == true ? colors.ink : colors.inkDim),
        ),
    ]);
  }

  Future<void> _saveNotes(TripModel trip) async {
    try {
      await ref.read(footprintRepositoryProvider).updateMemory(
        tripId: trip.id,
        notes: _notesController.text,
      );
      ref.invalidate(tripByIdProvider(trip.id));
    } catch (_) {}
  }

  // ─── Bottom Bar ────────────────────────────────────────────────────
  Widget _buildBottomBar(TripModel trip, KaipaColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: Row(children: [
        Expanded(
          child: SizedBox(height: 48,
            child: OutlinedButton.icon(
              onPressed: () => context.pop(),
              icon: KaipaIcon(name: KaipaIcons.back, size: 16, color: colors.ink),
              label: Text('返回', style: TextStyle(color: colors.ink)),
              style: OutlinedButton.styleFrom(
                backgroundColor: colors.surface,
                side: BorderSide(color: colors.line, width: 0.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 2,
          child: SizedBox(height: 48,
            child: ElevatedButton.icon(
              onPressed: _sharing ? null : () => _shareTrip(trip),
              icon: _sharing
                  ? const SizedBox(width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const KaipaIcon(name: KaipaIcons.share, size: 16, color: Colors.white),
              label: const Text('分享到社区',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare, elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Future<void> _shareTrip(TripModel trip) async {
    setState(() => _sharing = true);
    try {
      await ref.read(footprintRepositoryProvider).shareToFeed(
        tripId: trip.id,
        routeId: trip.routeId,
        content: {
          'route_name': trip.routeName ?? '',
          'distance_km': trip.actualDistanceKm?.toStringAsFixed(1) ?? '',
          'elevation_m': trip.actualElevationM?.toInt().toString() ?? '',
          'duration': trip.actualDuration?.inHours.toString() ?? '',
          'notes': trip.notes ?? '',
          'photos': trip.photos,
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('已分享到社区')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('分享失败: $e')));
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/presentation/footprint_detail_screen.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/footprint/presentation/footprint_detail_screen.dart
git commit -m "feat(footprint): add FootprintDetailScreen"
```

---

### Task 8: Add footprint route to AppRouter

**Files:**
- Modify: `lib/core/router/app_router.dart`

- [ ] **Step 1: Add import and route**

Add the import (insert after `import '../../features/gear/presentation/gear_item_detail_screen.dart';` around line 15):

```dart
import '../../features/footprint/presentation/footprint_detail_screen.dart';
```

Add the route inside the `routes:` list of GoRouter, after the `/trip-complete/:tripId` route closing `),` (around line 203):

```dart
      GoRoute(
        path: '/footprint/:tripId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => FootprintDetailScreen(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/core/router/app_router.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/core/router/app_router.dart
git commit -m "feat(footprint): add /footprint/:tripId route"
```

---

### Task 9: Add map perspective provider and toggle

**Files:**
- Create: `lib/features/discover/data/map_perspective_provider.dart`
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Create the perspective provider**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum MapPerspective { discover, footprint }

final mapPerspectiveProvider = StateProvider<MapPerspective>((ref) => MapPerspective.discover);
```

- [ ] **Step 2: Add the perspective toggle to MapScreen**

In `map_screen.dart`, add imports at top:

```dart
import '../data/map_perspective_provider.dart';
```

In `_MapScreenState`, add these fields:

```dart
FootprintMemory? _activeFootprint;
```

In `build()`, add after `final layerPrefs` line:

```dart
final perspective = ref.watch(mapPerspectiveProvider);
```

Replace the upload + filter buttons section (the `CircleButton` for upload and filter at lines ~286-299) with:

```dart
                      const SizedBox(width: 8),
                      // Perspective toggle pill
                      GestureDetector(
                        onTap: () {
                          final next = perspective == MapPerspective.discover
                              ? MapPerspective.footprint
                              : MapPerspective.discover;
                          ref.read(mapPerspectiveProvider.notifier).state = next;
                          setState(() {
                            _activeRoute = null;
                            _activeFootprint = null;
                          });
                        },
                        child: Container(
                          height: 46,
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: colors.line, width: 0.5),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _PerspectiveTab(
                                label: '发现',
                                active: perspective == MapPerspective.discover,
                                colors: colors,
                              ),
                              _PerspectiveTab(
                                label: '足迹',
                                active: perspective == MapPerspective.footprint,
                                colors: colors,
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (perspective == MapPerspective.discover) ...[
                        const SizedBox(width: 8),
                        CircleButton(
                          icon: KaipaIcons.upload,
                          size: 46, iconSize: 18,
                          onTap: () => context.push('/gpx-import'),
                        ),
                        const SizedBox(width: 8),
                        CircleButton(
                          icon: KaipaIcons.filter,
                          size: 46, iconSize: 18,
                          onTap: () => _showFilterSheet(context, colors),
                        ),
                      ],
```

- [ ] **Step 4: Add _PerspectiveTab widget at the bottom of map_screen.dart** (before `_FilterCategory`):

```dart
class _PerspectiveTab extends StatelessWidget {
  final String label;
  final bool active;
  final KaipaColors colors;

  const _PerspectiveTab({required this.label, required this.active, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: active ? colors.flare : Colors.transparent,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: active ? Colors.white : colors.inkMuted,
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Update onTap to clear footprint selection**

In `MapOptions.onTap` (around line 175), update to:

```dart
onTap: (_, _) {
  if (ref.read(immersiveModeProvider)) {
    ref.read(immersiveModeProvider.notifier).state = false;
  } else if (_activeRoute != null) {
    setState(() => _activeRoute = null);
  } else if (_activeFootprint != null) {
    setState(() => _activeFootprint = null);
  }
},
```

- [ ] **Step 6: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/discover/presentation/map_screen.dart 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add lib/features/discover/data/map_perspective_provider.dart lib/features/discover/presentation/map_screen.dart
git commit -m "feat(footprint): add perspective toggle to map"
```

---

### Task 10: Add footprint marker layer to MapScreen

**Files:**
- Modify: `lib/features/discover/presentation/map_screen.dart`

- [ ] **Step 1: Add footprint imports to map_screen.dart** (if not already added):

```dart
import '../../../footprint/data/footprint_repository.dart';
import '../../../footprint/domain/footprint_memory.dart';
import '../../../footprint/presentation/widgets/footprint_preview_card.dart';
```

- [ ] **Step 2: Add footprint provider watch** in `build()`, near `routesAsync`:

```dart
final footprintMemoriesAsync = ref.watch(footprintMemoriesProvider);
```

- [ ] **Step 3: Add footprint marker layer in FlutterMap children**, after the discover route marker layer block:

```dart
              if (perspective == MapPerspective.footprint)
                footprintMemoriesAsync.when(
                  data: (memories) => MarkerLayer(
                    markers: _buildFootprintMarkers(memories, colors),
                  ),
                  loading: () => const MarkerLayer(markers: []),
                  error: (_, __) => const MarkerLayer(markers: []),
                ),
```

- [ ] **Step 4: Add the _buildFootprintMarkers method to _MapScreenState:**

```dart
List<Marker> _buildFootprintMarkers(List<FootprintMemory> memories, KaipaColors colors) {
  return memories.map((memory) {
    final isActive = _activeFootprint?.trip.id == memory.trip.id;
    final markerColor = memory.isManual ? colors.sand : colors.moss;

    return Marker(
      point: LatLng(memory.latitude, memory.longitude),
      width: 130, height: 56,
      child: GestureDetector(
        onTap: () {
          setState(() {
            _activeRoute = null;
            _activeFootprint = memory;
          });
          _mapController.move(
            LatLng(memory.latitude, memory.longitude),
            _mapController.camera.zoom.clamp(10, 14),
          );
        },
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: isActive ? 48 : 40,
            height: isActive ? 48 : 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: isActive ? markerColor : Colors.white,
                width: isActive ? 3 : 2.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: (isActive ? markerColor : Colors.black).withAlpha(isActive ? 60 : 25),
                  blurRadius: isActive ? 12 : 6,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: ClipOval(
              child: memory.isManual
                  ? Container(
                      color: colors.sand,
                      child: Center(
                        child: KaipaIcon(name: KaipaIcons.flag,
                          size: isActive ? 20 : 16, color: colors.ink)),
                    )
                  : Image.network(
                      routePhoto(memory.displayName, w: 100, h: 100),
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        color: colors.moss.withAlpha(40),
                        child: Center(
                          child: KaipaIcon(name: KaipaIcons.mountain,
                            size: isActive ? 20 : 16, color: colors.moss)),
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 3),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(color: Colors.black.withAlpha(15),
                  blurRadius: 4, offset: const Offset(0, 1)),
              ],
            ),
            child: Text(
              memory.displayName.length > 6
                  ? '${memory.displayName.substring(0, 6)}…'
                  : memory.displayName,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                color: colors.ink, letterSpacing: -0.2),
            ),
          ),
        ]),
      ),
    );
  }).toList();
}
```

- [ ] **Step 5: Add footprint preview card at the bottom of the Stack**, after the discover route preview card block (before the closing `],` of Stack):

```dart
          // ── Footprint preview card ──
          if (_activeFootprint != null && !immersive && perspective == MapPerspective.footprint)
            Positioned(
              left: 12, right: 12, bottom: 110,
              child: _DismissibleCard(
                onDismissed: () => setState(() => _activeFootprint = null),
                child: FootprintPreviewCard(
                  memory: _activeFootprint!,
                  colors: colors,
                  photoUrl: _activeFootprint!.isManual
                      ? ''
                      : routePhoto(_activeFootprint!.displayName, w: 800, h: 400),
                  onTap: () => context.push('/footprint/${_activeFootprint!.trip.id}'),
                  onClose: () => setState(() => _activeFootprint = null),
                ),
              ),
            ),
```

- [ ] **Step 6: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/discover/presentation/map_screen.dart 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add lib/features/discover/presentation/map_screen.dart
git commit -m "feat(footprint): add footprint marker layer and preview card"
```

---

### Task 11: Add notes input to TripCompleteScreen

**Files:**
- Modify: `lib/features/trip/presentation/trip_complete_screen.dart`

- [ ] **Step 1: Add notes section**

In the `build` method, after `_buildStatsCard(tokens, colors, trip),` and its following `const SizedBox(height: 20),` (around line 57), insert:

```dart
_buildNotesInput(colors),
const SizedBox(height: 20),
```

Add the method to `_TripCompleteScreenState`:

```dart
Widget _buildNotesInput(KaipaColors colors) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SectionTitle(title: '记录笔记', padding: EdgeInsets.zero),
      const SizedBox(height: 8),
      TextField(
        controller: _feedbackController,
        maxLines: 4,
        minLines: 2,
        style: TextStyle(fontSize: 13, color: colors.ink),
        decoration: InputDecoration(
          hintText: '记录这次徒步的感受、见闻…',
          hintStyle: TextStyle(fontSize: 13, color: colors.inkDim),
          filled: true,
          fillColor: colors.surface,
          contentPadding: const EdgeInsets.all(12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: colors.flare, width: 1),
          ),
        ),
      ),
    ],
  );
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/trip/presentation/trip_complete_screen.dart 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip/presentation/trip_complete_screen.dart
git commit -m "feat(footprint): add notes input to trip complete screen"
```

---

### Task 12: Add same-route multi-trip switching to detail screen

**Files:**
- Modify: `lib/features/footprint/data/footprint_repository.dart`
- Modify: `lib/features/footprint/presentation/footprint_detail_screen.dart`

- [ ] **Step 1: Add fetchTripsByRouteId to FootprintRepository**

```dart
  /// Fetch all completed trips for a specific route (for trip switcher).
  Future<List<TripModel>> fetchTripsByRouteId(String routeId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('trips')
        .select()
        .eq('user_id', userId)
        .eq('route_id', routeId)
        .eq('status', 'completed')
        .order('started_at', ascending: false)
        .limit(20);
    return (data as List).map((e) => TripModel.fromJson(e as Map<String, dynamic>)).toList();
  }
```

Add the provider:

```dart
final tripsByRouteProvider = FutureProvider.family<List<TripModel>, String>((ref, routeId) async {
  final repo = ref.watch(footprintRepositoryProvider);
  return repo.fetchTripsByRouteId(routeId);
});
```

- [ ] **Step 2: Add TripSwitcher to FootprintDetailScreen**

Add import at top:

```dart
import 'widgets/trip_switcher.dart';
```

In `_buildContent`, add after the header and before the stats card. Insert after `_buildHeader` and before `const SizedBox(height: 16),` in the Column:

```dart
// Same-route trip switcher (only if trip has a routeId)
if (trip.routeId != null)
  ref.watch(tripsByRouteProvider(trip.routeId!)).whenData((trips) {
    if (trips.length > 1) {
      // Show after the header
    }
  }),
```

Actually, for a simpler implementation, add the TripSwitcher inside the Column after `_buildTitle`. Add a `_buildSwitcherIfNeeded` method:

In `_buildContent`, after `_buildTitle(trip, colors),`, add:

```dart
                    if (trip.routeId != null)
                      _buildSwitcherIfNeeded(trip, colors),
```

Add the method to the state class:

```dart
Widget _buildSwitcherIfNeeded(TripModel trip, KaipaColors colors) {
  final tripsAsync = ref.watch(tripsByRouteProvider(trip.routeId!));
  return tripsAsync.when(
    data: (trips) {
      if (trips.length <= 1) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TripSwitcher(
          trips: trips,
          selected: trip,
          colors: colors,
          onSelect: (selected) {
            if (selected.id != trip.id) {
              context.pushReplacement('/footprint/${selected.id}');
            }
          },
        ),
      );
    },
    loading: () => const SizedBox.shrink(),
    error: (_, __) => const SizedBox.shrink(),
  );
}
```

- [ ] **Step 3: Verify analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/features/footprint/ 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add lib/features/footprint/
git commit -m "feat(footprint): add same-route multi-trip switching"
```

---

### Task 13: Full analysis and final fixes

- [ ] **Step 1: Run full project analysis**

```bash
cd /home/coder/workspaces/kaipa && dart analyze lib/ 2>&1
```

- [ ] **Step 2: Fix any remaining errors or warnings**

- [ ] **Step 3: Run Flutter analyze**

```bash
cd /home/coder/workspaces/kaipa && flutter analyze 2>&1 | tail -30
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve analysis issues from footprint feature"
```

(Only commit if there are fixes.)
