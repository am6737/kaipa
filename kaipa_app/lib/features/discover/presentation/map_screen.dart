import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../data/route_repository.dart';
import '../domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/diff_badge.dart';


class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final MapController _mapController = MapController();
  String _selectedFilter = '全部';
  final DraggableScrollableController _sheetController =
      DraggableScrollableController();

  static const _filters = ['全部', '入门', '中等', '困难', '附近'];

  static const _filterToDifficulty = <String, String?>{
    '全部': null,
    '入门': 'easy',
    '中等': 'mod',
    '困难': 'hard',
    '附近': null,
  };

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routesAsync = ref.watch(allRoutesProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          // Full-bleed map
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: const LatLng(40.3, 116.5),
              initialZoom: 9,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.kaipa.app',
              ),
              routesAsync.when(
                data: (routes) => MarkerLayer(
                  markers: _buildMarkers(routes, colors),
                ),
                loading: () => const MarkerLayer(markers: []),
                error: (_, _) => const MarkerLayer(markers: []),
              ),
            ],
          ),

          // Floating search bar at top
          SafeArea(
            child: Column(
              children: [
                // Search bar
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: GestureDetector(
                    onTap: () => context.push('/discover/search'),
                    child: GlassContainer(
                      radius: KaipaRadius.lg,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.search, color: colors.inkMuted, size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                '搜索线路、地区...',
                                style: TextStyle(
                                  color: colors.inkDim,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            Icon(Icons.tune, color: colors.inkMuted, size: 20),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Filter pills
                SizedBox(
                  height: 36,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _filters.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final filter = _filters[index];
                      final isSelected = filter == _selectedFilter;
                      return GestureDetector(
                        onTap: () => setState(() => _selectedFilter = filter),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected ? colors.flare : colors.glass,
                            borderRadius: BorderRadius.circular(KaipaRadius.pill),
                            border: isSelected
                                ? null
                                : Border.all(color: colors.lineSoft),
                          ),
                          child: Text(
                            filter,
                            style: TextStyle(
                              color: isSelected ? Colors.white : colors.ink,
                              fontSize: 13,
                              fontWeight:
                                  isSelected ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),

          // Draggable bottom sheet
          DraggableScrollableSheet(
            controller: _sheetController,
            initialChildSize: 0.32,
            minChildSize: 0.12,
            maxChildSize: 0.85,
            snap: true,
            snapSizes: const [0.12, 0.32, 0.85],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: colors.bg,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(20)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(25),
                      blurRadius: 16,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // Handle
                    Padding(
                      padding: const EdgeInsets.only(top: 10, bottom: 8),
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: colors.inkDim.withAlpha(80),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    // Route list
                    Expanded(
                      child: routesAsync.when(
                        data: (routes) {
                          final filtered = _filterRoutes(routes);
                          if (filtered.isEmpty) {
                            return Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.hiking,
                                    size: 48,
                                    color: colors.inkDim,
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    '暂无线路',
                                    style: TextStyle(
                                      color: colors.inkMuted,
                                      fontSize: 15,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }
                          return ListView.separated(
                            controller: scrollController,
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            itemCount: filtered.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              return _RouteCard(
                                route: filtered[index],
                                colors: colors,
                              );
                            },
                          );
                        },
                        loading: () => Center(
                          child: CircularProgressIndicator(
                            color: colors.flare,
                            strokeWidth: 2.5,
                          ),
                        ),
                        error: (error, _) => Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.error_outline,
                                    color: colors.diff.extreme, size: 40),
                                const SizedBox(height: 12),
                                Text(
                                  '加载失败',
                                  style: TextStyle(
                                    color: colors.ink,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  error.toString(),
                                  style: TextStyle(
                                    color: colors.inkMuted,
                                    fontSize: 13,
                                  ),
                                  textAlign: TextAlign.center,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 16),
                                TextButton(
                                  onPressed: () =>
                                      ref.invalidate(allRoutesProvider),
                                  child: Text(
                                    '重试',
                                    style: TextStyle(color: colors.flare),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),

          // FAB for current location
          Positioned(
            right: 16,
            bottom: MediaQuery.of(context).size.height * 0.34 + 16,
            child: FloatingActionButton.small(
              heroTag: 'locate',
              backgroundColor: colors.surface,
              foregroundColor: colors.flare,
              elevation: 4,
              onPressed: () {
                _mapController.move(const LatLng(40.3, 116.5), 9);
              },
              child: const Icon(Icons.my_location, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  List<Marker> _buildMarkers(List<RouteModel> routes, KaipaColors colors) {
    return routes.where((r) => r.latitude != 0 && r.longitude != 0).map((route) {
      final diffColor = colors.diff[route.difficulty];
      return Marker(
        point: LatLng(route.latitude, route.longitude),
        width: 28,
        height: 28,
        child: GestureDetector(
          onTap: () => context.push('/discover/route/${route.id}'),
          child: Container(
            decoration: BoxDecoration(
              color: diffColor,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: diffColor.withAlpha(80),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: const Center(
              child: Icon(Icons.terrain, color: Colors.white, size: 14),
            ),
          ),
        ),
      );
    }).toList();
  }

  List<RouteModel> _filterRoutes(List<RouteModel> routes) {
    final difficulty = _filterToDifficulty[_selectedFilter];
    if (difficulty == null) return routes;
    return routes.where((r) => r.difficulty == difficulty).toList();
  }
}

// ─── Route Card Widget ─────────────────────────────────────────────────

class _RouteCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _RouteCard({required this.route, required this.colors});

  String _formatDuration(Duration d) {
    if (d.inHours > 0) {
      final mins = d.inMinutes % 60;
      return mins > 0 ? '${d.inHours}h${mins}m' : '${d.inHours}h';
    }
    return '${d.inMinutes}m';
  }

  @override
  Widget build(BuildContext context) {
    final diffColor = colors.diff[route.difficulty];

    return GestureDetector(
      onTap: () => context.push('/discover/route/${route.id}'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          border: Border.all(color: colors.lineSoft, width: 0.5),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Left accent bar
            Container(
              width: 4,
              height: 64,
              decoration: BoxDecoration(
                color: diffColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 14),
            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name + region
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          route.name,
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.3,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (route.region != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: colors.flareSoft,
                            borderRadius:
                                BorderRadius.circular(KaipaRadius.pill),
                          ),
                          child: Text(
                            route.region!,
                            style: TextStyle(
                              color: colors.flare,
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Stats row
                  Row(
                    children: [
                      _StatChip(
                        icon: Icons.straighten,
                        label: '${route.distanceKm.toStringAsFixed(1)}km',
                        colors: colors,
                      ),
                      const SizedBox(width: 12),
                      _StatChip(
                        icon: Icons.trending_up,
                        label: '${route.elevationGainM.toInt()}m',
                        colors: colors,
                      ),
                      const SizedBox(width: 12),
                      _StatChip(
                        icon: Icons.schedule,
                        label: _formatDuration(route.estimatedDuration),
                        colors: colors,
                      ),
                      const Spacer(),
                      // Rating
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.star_rounded, color: colors.sand, size: 16),
                          const SizedBox(width: 2),
                          Text(
                            route.rating.toStringAsFixed(1),
                            style: TextStyle(
                              color: colors.ink,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Difficulty badge
                  DiffBadge(
                    level: route.difficulty,
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

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final KaipaColors colors;

  const _StatChip({
    required this.icon,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: colors.inkDim),
        const SizedBox(width: 3),
        Text(
          label,
          style: TextStyle(
            color: colors.inkMuted,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
