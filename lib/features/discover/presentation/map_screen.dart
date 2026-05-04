import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import '../data/route_repository.dart';
import '../data/immersive_provider.dart';
import '../domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/diff_badge.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/circle_button.dart';
import '../data/map_layer_provider.dart';
import '../data/map_perspective_provider.dart';
import '../../trip/data/active_trip_provider.dart';
import '../../navigation/data/navigation_repository.dart';
import '../../navigation/data/location_service.dart';
import 'widgets/layer_picker.dart';
import 'region_picker_screen.dart';
import '../../footprint/data/footprint_repository.dart';
import '../../footprint/domain/footprint_memory.dart';
import '../../footprint/presentation/widgets/footprint_preview_card.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen>
    with SingleTickerProviderStateMixin {
  final MapController _mapController = MapController();
  RouteModel? _activeRoute;
  FootprintMemory? _activeFootprint;
  int _zoomLevel = 1; // 0=globe, 1=region, 2=trail
  String _cityName = '北京';
  LatLng _cityCenter = const LatLng(40.0, 116.4);
  double _cityZoom = 9.5;
  bool _showLayerPicker = false;
  bool _isLocating = false;
  bool _isAtCurrentLocation = false;
  double _userLat = 0;
  double _userLng = 0;
  bool _ignoreNextMapEvent = false;
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _pulseAnim = Tween<double>(begin: 1.0, end: 0.3).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _locateMe();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _locateMe() async {
    if (_isLocating) return;
    setState(() => _isLocating = true);
    _pulseController.repeat(reverse: true);

    final locationService = ref.read(locationServiceProvider);
    try {
      // Android: must request permission first to show system dialog.
      // Web: requestPermission doesn't trigger browser prompt, so skip it
      // and let getCurrentPosition trigger it.
      if (!kIsWeb) {
        final permission = await locationService.requestPermission();
        if (permission == LocationPermissionStatus.deniedForever) {
          _showLocationError('deniedForever');
          return;
        }
        if (permission != LocationPermissionStatus.granted) {
          _showLocationError('permission');
          return;
        }

        final enabled = await locationService.isServiceEnabled;
        if (!enabled) {
          _showLocationError('service');
          return;
        }
      }

      final position = await locationService.getCurrentPosition(
        timeLimit: const Duration(seconds: 15),
      );
      if (mounted) {
        _ignoreNextMapEvent = true;
        setState(() {
          _userLat = position.latitude;
          _userLng = position.longitude;
          _cityCenter = LatLng(_userLat, _userLng);
          _cityName = '当前位置';
          _isAtCurrentLocation = true;
        });
        _mapController.move(_cityCenter, _cityZoom);
      }
    } catch (e) {
      if (mounted) {
        _showLocationError(e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _isLocating = false);
        _pulseController.stop();
        _pulseController.reset();
      }
    }
  }

  void _showLocationError(String error) {
    String message;
    if (error.contains('deniedForever')) {
      message = '定位权限已被永久拒绝，请到系统设置中开启';
    } else if (error.contains('permission') || error.contains('Permission')) {
      message = '定位权限被拒绝';
    } else if (error.contains('service') || error.contains('disabled')) {
      message = '请先开启手机定位服务';
    } else {
      message = '定位失败，请检查网络与定位服务';
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  static const _photoIds = [
    '1508804185872-d7badad00f7d',
    '1464822759023-fed622ff2c3b',
    '1551632811-561732d1e306',
    '1441974231531-c6227db76b6e',
    '1506905925346-21bda4d32df4',
    '1519681393784-d120267933ba',
  ];

  static String routePhoto(String name, {int w = 400, int h = 200}) {
    final idx = name.hashCode.abs() % _photoIds.length;
    return 'https://images.unsplash.com/photo-${_photoIds[idx]}?w=$w&h=$h&fit=crop&q=80';
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routesAsync = ref.watch(allRoutesProvider);
    final immersive = ref.watch(immersiveModeProvider);
    final layerPrefs = ref.watch(mapLayerPrefsProvider);
    final perspective = ref.watch(mapPerspectiveProvider);
    final footprintMemoriesAsync = ref.watch(footprintMemoriesProvider);
    final activeLayer = layerPrefs.activeLayer;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Full-bleed map (CARTO Voyager tiles) ──
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _cityCenter,
              initialZoom: _cityZoom,
              onTap: (_, _) {
                if (ref.read(immersiveModeProvider)) {
                  ref.read(immersiveModeProvider.notifier).state = false;
                } else if (_activeRoute != null) {
                  setState(() => _activeRoute = null);
                } else if (_activeFootprint != null) {
                  setState(() => _activeFootprint = null);
                }
              },
              onMapEvent: (event) {
                if (event is MapEventMoveEnd) {
                  if (_ignoreNextMapEvent) {
                    _ignoreNextMapEvent = false;
                    return;
                  }
                  if (_isAtCurrentLocation) {
                    setState(() => _isAtCurrentLocation = false);
                  }
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate: activeLayer.urlTemplate,
                subdomains: activeLayer.subdomains,
                userAgentPackageName: 'com.kaipa.app',
                retinaMode: activeLayer.retinaMode,
              ),
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
              if (perspective == MapPerspective.footprint)
                footprintMemoriesAsync.when(
                  data: (memories) => MarkerLayer(
                    markers: _buildFootprintMarkers(memories, colors),
                  ),
                  loading: () => const MarkerLayer(markers: []),
                  error: (_, _) => const MarkerLayer(markers: []),
                ),
            ],
          ),

          // ── Top: search bar + profile ──
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 16,
            right: 16,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              offset: immersive ? const Offset(0, -1) : Offset.zero,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut,
                opacity: immersive ? 0.0 : 1.0,
                child: IgnorePointer(
                  ignoring: immersive,
                  child: Row(
                    children: [
                      Expanded(
                        child: GlassContainer(
                          radius: KaipaRadius.pill,
                          child: SizedBox(
                            height: 46,
                            child: Padding(
                              padding: const EdgeInsets.only(left: 4, right: 16),
                              child: Row(
                                children: [
                                  GestureDetector(
                                    onTap: () => _openRegionPicker(context),
                                    behavior: HitTestBehavior.opaque,
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            _cityName,
                                            style: TextStyle(color: colors.ink, fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: -0.2),
                                          ),
                                          const SizedBox(width: 2),
                                          KaipaIcon(name: KaipaIcons.forward, size: 12, color: colors.inkMuted),
                                        ],
                                      ),
                                    ),
                                  ),
                                  Container(width: 1, height: 20, color: colors.line),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => context.push('/discover/search'),
                                      behavior: HitTestBehavior.opaque,
                                      child: Row(
                                        children: [
                                          KaipaIcon(name: KaipaIcons.search, size: 17, color: colors.inkMuted),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              '搜索路线、山峰、地点',
                                              style: TextStyle(color: colors.inkMuted, fontSize: 15, letterSpacing: -0.2),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
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
                          size: 46,
                          iconSize: 18,
                          onTap: () => context.push('/gpx-import'),
                        ),
                        const SizedBox(width: 8),
                        CircleButton(
                          icon: KaipaIcons.filter,
                          size: 46,
                          iconSize: 18,
                          onTap: () => _showFilterSheet(context, colors),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Right-side controls (right 16, top ~200, column, gap 10) ──
          Positioned(
            right: 16,
            top: 200,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              offset: immersive ? const Offset(1, 0) : Offset.zero,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut,
                opacity: immersive ? 0.0 : 1.0,
                child: IgnorePointer(
                  ignoring: immersive,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Zoom level selector: Glass container
                      _ZoomLevelSelector(
                        selected: _zoomLevel,
                        colors: colors,
                        onSelect: (level) {
                          setState(() => _zoomLevel = level);
                          // Adjust map zoom based on level
                          final zooms = [4.0, 9.5, 14.0];
                          _mapController.move(
                            _mapController.camera.center,
                            zooms[level],
                          );
                        },
                      ),
                      const SizedBox(height: 10),
                      CircleButton(
                        icon: KaipaIcons.layers,
                        size: 44,
                        iconSize: 18,
                        onTap: () => setState(() => _showLayerPicker = !_showLayerPicker),
                      ),
                      const SizedBox(height: 10),
                      // Locate me button
                      // grey = not at current location, flare = at current location
                      // pulses while actively locating
                      AnimatedBuilder(
                        animation: _pulseAnim,
                        builder: (context, child) {
                          return Opacity(
                            opacity: _isLocating ? _pulseAnim.value : 1.0,
                            child: CircleButton(
                              icon: KaipaIcons.navigate,
                              size: 44,
                              iconSize: 18,
                              color: _isAtCurrentLocation ? colors.flare : colors.inkMuted,
                              onTap: _isLocating ? null : () => _locateMe(),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 10),
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
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Layer picker popup ──
          if (_showLayerPicker && !immersive) ...[
            Positioned.fill(
              child: GestureDetector(
                onTap: () => setState(() => _showLayerPicker = false),
                behavior: HitTestBehavior.translucent,
                child: const SizedBox.expand(),
              ),
            ),
            Positioned(
              right: 68,
              top: 200,
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
          ],

          // ── Active trip card ──
          if (ref.watch(activeTripProvider) != null && !immersive)
            Positioned(
              left: 12,
              right: 12,
              bottom: _activeRoute != null ? 210 : 110,
              child: _ActiveTripCard(
                trip: ref.watch(activeTripProvider)!,
                colors: colors,
                onTap: () => context.push('/navigate/${ref.read(activeTripProvider)!.routeId}'),
              ),
            ),

          // ── Route preview card (shown when a pin is tapped) ──
          if (_activeRoute != null && !immersive)
            Positioned(
              left: 12,
              right: 12,
              bottom: 110,
              child: _DismissibleCard(
                onDismissed: () => setState(() => _activeRoute = null),
                child: _RoutePreviewCard(
                  route: _activeRoute!,
                  colors: colors,
                  photoUrl: routePhoto(_activeRoute!.name, w: 800, h: 400),
                  onTap: () =>
                      context.push('/discover/route/${_activeRoute!.id}'),
                  onClose: () => setState(() => _activeRoute = null),
                ),
              ),
            ),

          // ── Footprint preview card ──
          if (_activeFootprint != null && !immersive && perspective == MapPerspective.footprint)
            Positioned(
              left: 12,
              right: 12,
              bottom: 110,
              child: _DismissibleCard(
                onDismissed: () => setState(() => _activeFootprint = null),
                child: FootprintPreviewCard(
                  memory: _activeFootprint!,
                  colors: colors,
                  photoUrl: _activeFootprint!.isManual
                      ? ''
                      : routePhoto(_activeFootprint!.displayName, w: 800, h: 400),
                  onTap: () =>
                      context.push('/footprint/${_activeFootprint!.trip.id}'),
                  onClose: () => setState(() => _activeFootprint = null),
                ),
              ),
            ),
        ],
      ),
    );
  }

  List<RouteModel> _filterRoutes(List<RouteModel> routes) {
    return routes;
  }

  Future<void> _openRegionPicker(BuildContext context) async {
    final result = await context.push<CityData>(
      '/region-picker?city=${Uri.encodeComponent(_cityName)}',
    );
    if (result != null && mounted) {
      setState(() {
        _cityName = result.name;
        _cityCenter = LatLng(result.lat, result.lng);
        _cityZoom = result.zoom;
      });
      _mapController.move(_cityCenter, _cityZoom);
    }
  }

  void _showFilterSheet(BuildContext context, KaipaColors colors) {
    final categories = [
      _FilterCategory('难度', [
        _FilterOption('全部难度', null),
        _FilterOption('入门 T4', 'easy'),
        _FilterOption('中等 T3', 'moderate'),
        _FilterOption('困难 T2', 'hard'),
        _FilterOption('专家 T1', 'expert'),
      ]),
      _FilterCategory('距离', [
        _FilterOption('不限', null),
        _FilterOption('5 km 以内', '5km'),
        _FilterOption('5–15 km', '15km'),
        _FilterOption('15–30 km', '30km'),
        _FilterOption('30 km 以上', '30km+'),
      ]),
      _FilterCategory('时长', [
        _FilterOption('不限', null),
        _FilterOption('半日 (< 4h)', 'half'),
        _FilterOption('一日 (4–8h)', 'day'),
        _FilterOption('多日', 'multi'),
      ]),
      _FilterCategory('特征', [
        _FilterOption('有水源', 'water'),
        _FilterOption('看日出', 'sunrise'),
        _FilterOption('可露营', 'camp'),
        _FilterOption('亲子友好', 'family'),
        _FilterOption('宠物友好', 'pet'),
        _FilterOption('轮椅可达', 'accessible'),
      ]),
    ];

    // Single-select for categories 0-2 (difficulty/distance/duration), multi-select for category 3 (features)
    final selected = List<Set<String?>>.generate(categories.length, (i) => <String?>{});

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      useRootNavigator: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.7,
          ),
          decoration: BoxDecoration(
            color: colors.bg,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 8),
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(60, 52, 42, 0.18),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                child: Row(
                  children: [
                    Text('筛选路线', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.5)),
                    const Spacer(),
                    GestureDetector(
                      onTap: () {
                        setSheetState(() {
                          for (final s in selected) {
                            s.clear();
                          }
                        });
                      },
                      child: Text('重置', style: TextStyle(fontSize: 13, color: colors.flare, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              // Filter list
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
                  itemCount: categories.length,
                  itemBuilder: (ctx, ci) {
                    final cat = categories[ci];
                    final isMultiSelect = ci == 3;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            cat.name,
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: colors.inkMuted, letterSpacing: 0.3),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: cat.options.map((opt) {
                              final isSelected = selected[ci].contains(opt.value);
                              return GestureDetector(
                                onTap: () {
                                  setSheetState(() {
                                    if (isMultiSelect) {
                                      if (isSelected) {
                                        selected[ci].remove(opt.value);
                                      } else {
                                        selected[ci].add(opt.value);
                                      }
                                    } else {
                                      selected[ci].clear();
                                      if (opt.value != null) {
                                        selected[ci].add(opt.value);
                                      }
                                    }
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                                  decoration: BoxDecoration(
                                    color: isSelected ? colors.flareSoft : colors.surface,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: isSelected ? colors.flare : colors.line,
                                      width: 0.5,
                                    ),
                                  ),
                                  child: Text(
                                    opt.label,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                                      color: isSelected ? colors.flare : colors.ink,
                                      letterSpacing: -0.1,
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              // Apply button
              Padding(
                padding: EdgeInsets.fromLTRB(18, 0, 18, MediaQuery.of(ctx).padding.bottom + 18),
                child: GestureDetector(
                  onTap: () => Navigator.of(ctx).pop(),
                  child: Container(
                    width: double.infinity,
                    height: 50,
                    decoration: BoxDecoration(
                      color: colors.flare,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [BoxShadow(color: colorWithOpacity(colors.flare, 0.3), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: const Center(
                      child: Text('应用筛选', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Marker> _buildMarkers(List<RouteModel> routes, KaipaColors colors) {
    return routes
        .where((r) => r.latitude != 0 && r.longitude != 0)
        .map((route) {
      final diffColor = colors.diff[route.difficulty];
      final isActive = _activeRoute?.id == route.id;

      return Marker(
        point: LatLng(route.latitude, route.longitude),
        width: 130,
        height: 56,
        child: GestureDetector(
          onTap: () {
            setState(() => _activeRoute = route);
            _mapController.move(
              LatLng(route.latitude, route.longitude),
              _mapController.camera.zoom.clamp(10, 14),
            );
          },
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pin circle with photo
              Container(
                width: isActive ? 48 : 40,
                height: isActive ? 48 : 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isActive ? diffColor : Colors.white,
                    width: isActive ? 3 : 2.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (isActive ? diffColor : Colors.black)
                          .withAlpha(isActive ? 60 : 25),
                      blurRadius: isActive ? 12 : 6,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: ClipOval(
                  child: Image.network(
                    routePhoto(route.name, w: 100, h: 100),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      color: colors.flareSoft,
                      child: Center(
                        child: KaipaIcon(
                          name: KaipaIcons.mountain,
                          size: isActive ? 20 : 16,
                          color: diffColor,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 3),
              // Label
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(15),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
                child: Text(
                  route.name.length > 6
                      ? '${route.name.substring(0, 6)}…'
                      : route.name,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }).toList();
  }

  List<Marker> _buildFootprintMarkers(List<FootprintMemory> memories, KaipaColors colors) {
    return memories.map((memory) {
      final isActive = _activeFootprint?.trip.id == memory.trip.id;
      final markerColor = memory.isManual ? colors.sand : colors.moss;

      return Marker(
        point: LatLng(memory.latitude, memory.longitude),
        width: 130,
        height: 56,
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
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
                            child: KaipaIcon(
                              name: KaipaIcons.flag,
                              size: isActive ? 20 : 16,
                              color: colors.ink,
                            ),
                          ),
                        )
                      : Image.network(
                          routePhoto(memory.displayName, w: 100, h: 100),
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(
                            color: colors.moss.withAlpha(40),
                            child: Center(
                              child: KaipaIcon(
                                name: KaipaIcons.mountain,
                                size: isActive ? 20 : 16,
                                color: colors.moss,
                              ),
                            ),
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 3),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(15),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
                child: Text(
                  memory.displayName.length > 6
                      ? '${memory.displayName.substring(0, 6)}…'
                      : memory.displayName,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }).toList();
  }
}

// ─── Zoom Level Selector ────────────────────────────────────────────

class _ZoomLevelSelector extends StatelessWidget {
  final int selected;
  final KaipaColors colors;
  final ValueChanged<int> onSelect;

  const _ZoomLevelSelector({
    required this.selected,
    required this.colors,
    required this.onSelect,
  });

  static const _icons = [
    KaipaIcons.compass,
    KaipaIcons.layers2,
    KaipaIcons.mountain,
  ];

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      radius: 14,
      padding: const EdgeInsets.all(4),
      child: SizedBox(
        width: 44,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final isActive = i == selected;
            return GestureDetector(
              onTap: () => onSelect(i),
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isActive ? colors.flare : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: KaipaIcon(
                    name: _icons[i],
                    size: 18,
                    color: isActive ? Colors.white : colors.ink,
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

// ─── Swipe-down dismissible wrapper ──────────────────────────────────

class _DismissibleCard extends StatefulWidget {
  final Widget child;
  final VoidCallback onDismissed;

  const _DismissibleCard({required this.child, required this.onDismissed});

  @override
  State<_DismissibleCard> createState() => _DismissibleCardState();
}

class _DismissibleCardState extends State<_DismissibleCard>
    with SingleTickerProviderStateMixin {
  double _dragOffset = 0;
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 200));
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails d) {
    if (d.delta.dy > 0 || _dragOffset > 0) {
      setState(() => _dragOffset = (_dragOffset + d.delta.dy).clamp(0, 400));
    }
  }

  void _onDragEnd(DragEndDetails d) {
    if (_dragOffset > 80 || d.velocity.pixelsPerSecond.dy > 300) {
      widget.onDismissed();
    } else {
      _anim.forward(from: 0).then((_) => setState(() => _dragOffset = 0));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _anim.isAnimating ? (1 - _anim.value) : 1.0;
    final offset = _dragOffset * t;
    final opacity = (1 - offset / 300).clamp(0.0, 1.0);

    return GestureDetector(
      onVerticalDragUpdate: _onDragUpdate,
      onVerticalDragEnd: _onDragEnd,
      child: Transform.translate(
        offset: Offset(0, offset),
        child: Opacity(
          opacity: opacity,
          child: widget.child,
        ),
      ),
    );
  }
}

// ─── Active Trip Card ──────────────────────────────────────────────

class _ActiveTripCard extends StatelessWidget {
  final ActiveTrip trip;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _ActiveTripCard({required this.trip, required this.colors, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(trip.startedAt);
    final mm = elapsed.inMinutes.remainder(60).toString().padLeft(2, '0');
    final hh = elapsed.inHours.toString().padLeft(2, '0');

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: colors.flare,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: colors.flare.withAlpha(80), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            Container(
              width: 8, height: 8,
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    trip.routeName,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: -0.2),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '进行中 · $hh:$mm',
                    style: TextStyle(fontSize: 11.5, color: Colors.white.withAlpha(200)),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withAlpha(38),
                borderRadius: BorderRadius.circular(99),
              ),
              child: const Text('返回导航', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Route Preview Card (active route pin tapped) ───────────────────

class _RoutePreviewCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;
  final String photoUrl;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const _RoutePreviewCard({
    required this.route,
    required this.colors,
    required this.photoUrl,
    required this.onTap,
    required this.onClose,
  });

  String _fmtDuration(Duration d) {
    if (d.inHours > 0) {
      final m = d.inMinutes % 60;
      return m > 0 ? '约 ${d.inHours} 小时 $m 分' : '约 ${d.inHours} 小时';
    }
    return '约 ${d.inMinutes} 分';
  }

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      radius: 24,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Hero photo with drag handle overlay
          ClipRRect(
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
            child: SizedBox(
              width: double.infinity,
              height: 150,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    photoUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      color: colors.flareSoft,
                      child: Center(
                        child: KaipaIcon(name: KaipaIcons.mountain, size: 40, color: colors.flare),
                      ),
                    ),
                  ),
                  // Drag handle on top of photo
                  Positioned(
                    top: 10,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        width: 36,
                        height: 4,
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
          // Content area
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
          // Distance label
          Text(
            '距离你 2.3 公里',
            style: TextStyle(fontSize: 11, color: colors.inkMuted),
          ),
          const SizedBox(height: 4),
          // Route name
          Text(
            route.name,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.6, color: colors.ink),
          ),
          const SizedBox(height: 6),
          // DiffBadge + stats
          Row(
            children: [
              DiffBadge(level: route.difficulty),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${route.distanceKm.toStringAsFixed(1)} 公里 · ↑ ${route.elevationGainM.toInt()} 米 · ${_fmtDuration(route.estimatedDuration)}',
                  style: TextStyle(fontSize: 12, color: colors.inkMuted),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Mini elevation strip
          if (route.elevationProfile.isNotEmpty)
            Container(
              width: double.infinity,
              height: 44,
              decoration: BoxDecoration(
                color: colors.surfaceHi,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: CustomPaint(
                    size: const Size(double.infinity, 28),
                    painter: _MiniElevPainter(points: route.elevationProfile, flareColor: colors.flare, mossColor: colors.moss),
                  ),
                ),
              ),
            ),
          if (route.elevationProfile.isNotEmpty) const SizedBox(height: 10),
          // CTA button
          GestureDetector(
            onTap: onTap,
            child: Container(
              width: double.infinity,
              height: 46,
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: colorWithOpacity(colors.flare, 0.35), blurRadius: 14, offset: const Offset(0, 4))],
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  KaipaIcon(name: KaipaIcons.navigate, size: 16, color: Colors.white),
                  SizedBox(width: 8),
                  Text('查看完整路线', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
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
}

class _MiniElevPainter extends CustomPainter {
  final List<ElevationPoint> points;
  final Color flareColor;
  final Color mossColor;
  _MiniElevPainter({required this.points, required this.flareColor, required this.mossColor});

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    double minE = double.infinity, maxE = double.negativeInfinity, maxD = 0;
    for (final p in points) {
      if (p.elevation < minE) minE = p.elevation;
      if (p.elevation > maxE) maxE = p.elevation;
      if (p.distance > maxD) maxD = p.distance;
    }
    if (maxD == 0 || maxE == minE) return;
    final range = maxE - minE;
    final pts = points.map((p) => Offset(
      (p.distance / maxD) * size.width,
      size.height - ((p.elevation - minE) / range) * size.height * 0.85,
    )).toList();

    final fillPath = Path()..moveTo(0, size.height);
    for (final pt in pts) {
      fillPath.lineTo(pt.dx, pt.dy);
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();
    canvas.drawPath(fillPath, Paint()
      ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [colorWithOpacity(flareColor, 0.2), colorWithOpacity(flareColor, 0.04)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)));

    final linePath = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }
    canvas.drawPath(linePath, Paint()..color = flareColor..style = PaintingStyle.stroke
      ..strokeWidth = 2..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);

    canvas.drawCircle(pts.first, 3.5, Paint()..color = mossColor);
    double minY = double.infinity; Offset? peak;
    for (final pt in pts) { if (pt.dy < minY) { minY = pt.dy; peak = pt; } }
    if (peak != null) canvas.drawCircle(peak, 3.5, Paint()..color = flareColor);
    canvas.drawCircle(pts.last, 3.5, Paint()..color = flareColor);
  }

  @override
  bool shouldRepaint(_MiniElevPainter old) => false;
}

// ─── Perspective Tab ────────────────────────────────────────────────

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

class _FilterCategory {
  final String name;
  final List<_FilterOption> options;
  const _FilterCategory(this.name, this.options);
}

class _FilterOption {
  final String label;
  final String? value;
  const _FilterOption(this.label, this.value);
}

