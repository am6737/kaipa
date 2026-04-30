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
import '../../../core/widgets/pill_widget.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final MapController _mapController = MapController();
  RouteModel? _activeRoute;
  int _zoomLevel = 1; // 0=globe, 1=region, 2=trail
  String _activeFilter = '附近 12km';
  static const _defaultCenter = LatLng(40.3, 116.5);
  static const _defaultZoom = 9.5;

  static const _filters = [
    '附近 12km',
    'T1—T2',
    '一日往返',
    '有水源',
    '看日出',
  ];

  static const _filterToDifficulty = <String, String?>{
    '附近 12km': null,
    'T1—T2': null,
    '一日往返': null,
    '有水源': null,
    '看日出': null,
  };

  static const _zoomLabels = [
    '全球 · GLOBE',
    '北京周边 · REGION',
    '箭扣长城 · TRAIL',
  ];

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

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Full-bleed map (CARTO Voyager tiles) ──
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _defaultCenter,
              initialZoom: _defaultZoom,
              onTap: (_, _) {
                if (ref.read(immersiveModeProvider)) {
                  ref.read(immersiveModeProvider.notifier).state = false;
                } else if (_activeRoute != null) {
                  setState(() => _activeRoute = null);
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
                userAgentPackageName: 'com.kaipa.app',
                retinaMode: true,
              ),
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
            ],
          ),

          // ── Top: search bar + profile (y=56, left/right 16, zIndex 20) ──
          AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(0, -1) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 56, 16, 0),
                  child: Row(
                    children: [
                      // Glass pill search bar (flex 1, height 46, borderRadius 999)
                      Expanded(
                        child: GestureDetector(
                          onTap: () => context.push('/discover/search'),
                          child: GlassContainer(
                            radius: KaipaRadius.pill,
                            child: SizedBox(
                              height: 46,
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 16),
                                child: Row(
                                  children: [
                                    KaipaIcon(
                                      name: KaipaIcons.search,
                                      size: 17,
                                      color: colors.inkMuted,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        '搜索路线、山峰、地点',
                                        style: TextStyle(
                                          color: colors.inkMuted,
                                          fontSize: 15,
                                          letterSpacing: -0.2,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Profile CircleButton (46px, glass circle, user icon)
                      CircleButton(
                        icon: KaipaIcons.user,
                        size: 46,
                        iconSize: 18,
                        onTap: () {
                          final shell = StatefulNavigationShell.of(context);
                          shell.goBranch(2);
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Filter chips (y=116, left/right 16, horizontal scroll, gap 6) ──
          AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            offset: immersive ? const Offset(0, -1) : Offset.zero,
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              opacity: immersive ? 0.0 : 1.0,
              child: IgnorePointer(
                ignoring: immersive,
                child: Padding(
                  padding: const EdgeInsets.only(top: 116),
                  child: SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _filters.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 6),
                      itemBuilder: (context, index) {
                        final filter = _filters[index];
                        final isActive = filter == _activeFilter;
                        return PillWidget(
                          active: isActive,
                          onTap: () => setState(() {
                            _activeFilter = filter;
                            _activeRoute = null;
                          }),
                          child: Text(filter),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ── Zoom level label (top 200, left 16) ──
          Positioned(
            top: 200,
            left: 16,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
              offset: immersive ? const Offset(-1, 0) : Offset.zero,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOut,
                opacity: immersive ? 0.0 : 1.0,
                child: IgnorePointer(
                  ignoring: immersive,
                  child: Text(
                    _zoomLabels[_zoomLevel],
                    style: TextStyle(
                      fontSize: 10,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w500,
                      color: colors.inkMuted,
                      letterSpacing: 1.5,
                    ),
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
                      // Layers CircleButton (44px glass circle, layers icon)
                      CircleButton(
                        icon: KaipaIcons.layers,
                        size: 44,
                        iconSize: 18,
                        onTap: () {},
                      ),
                      const SizedBox(height: 10),
                      // Navigate CircleButton (44px glass circle, navigate icon in flare)
                      CircleButton(
                        icon: KaipaIcons.navigate,
                        size: 44,
                        iconSize: 18,
                        color: colors.flare,
                        onTap: () =>
                            _mapController.move(_defaultCenter, _defaultZoom),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── GPX import FAB (region view only, right 16, bottom ~220) ──
          if (_zoomLevel == 1 && !immersive)
            Positioned(
              right: 16,
              bottom: 220,
              child: GestureDetector(
                onTap: () {},
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: colors.flare,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: colorWithOpacity(colors.flare, 0.33),
                        blurRadius: 18,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: KaipaIcon(
                      name: KaipaIcons.upload,
                      size: 22,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),

          // ── Active route preview card (bottom ~102) ──
          if (_activeRoute != null && !immersive)
            Positioned(
              left: 12,
              right: 12,
              bottom: 102,
              child: _DismissibleCard(
                onDismissed: () => setState(() => _activeRoute = null),
                child: _RoutePreviewCard(
                  route: _activeRoute!,
                  colors: colors,
                  onTap: () =>
                      context.push('/discover/route/${_activeRoute!.id}'),
                  onClose: () => setState(() => _activeRoute = null),
                ),
              ),
            ),

          // ── Featured route card (when no active pin, bottom area) ──
          if (_activeRoute == null && !immersive)
            Positioned(
              left: 12,
              right: 12,
              bottom: 102,
              child: routesAsync.when(
                data: (routes) {
                  if (routes.isEmpty) return const SizedBox.shrink();
                  final featured = routes.first;
                  return _FeaturedRouteCard(
                    route: featured,
                    colors: colors,
                    onTap: () =>
                        context.push('/discover/route/${featured.id}'),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ),
        ],
      ),
    );
  }

  List<RouteModel> _filterRoutes(List<RouteModel> routes) {
    final difficulty = _filterToDifficulty[_activeFilter];
    if (difficulty == null) return routes;
    return routes.where((r) => r.difficulty == difficulty).toList();
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

// ─── Route Preview Card (active route pin tapped) ───────────────────

class _RoutePreviewCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;
  final VoidCallback onTap;
  final VoidCallback onClose;

  const _RoutePreviewCard({
    required this.route,
    required this.colors,
    required this.onTap,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final diffColor = colors.diff[route.difficulty];

    return GestureDetector(
      onTap: onTap,
      child: GlassContainer(
        radius: 20,
        padding: const EdgeInsets.all(14),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 4px difficulty color stripe (full height, borderRadius 4)
              Container(
                width: 4,
                decoration: BoxDecoration(
                  color: diffColor,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 12),
              // Content column (flex 1)
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Title row: route name + close button
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            route.name,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.4,
                              color: colors.ink,
                              overflow: TextOverflow.ellipsis,
                            ),
                            maxLines: 1,
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Close button (26px circle, surfaceHi bg, close icon 12px)
                        GestureDetector(
                          onTap: onClose,
                          child: Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(
                              color: colors.surfaceHi,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: KaipaIcon(
                                name: KaipaIcons.close,
                                size: 12,
                                color: colors.inkMuted,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Badge row: DiffBadge + region + rating + user count
                    Row(
                      children: [
                        DiffBadge(level: route.difficulty),
                        if (route.region != null) ...[
                          const SizedBox(width: 8),
                          Text(
                            route.region!,
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.inkMuted,
                            ),
                          ),
                        ],
                        const SizedBox(width: 8),
                        // Rating (star icon in flare + number)
                        KaipaIcon(
                          name: KaipaIcons.star,
                          size: 12,
                          color: colors.flare,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          route.rating > 0
                              ? route.rating.toStringAsFixed(1)
                              : '4.5',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: colors.ink,
                          ),
                        ),
                        const SizedBox(width: 8),
                        // User count (users icon + number)
                        KaipaIcon(
                          name: KaipaIcons.users,
                          size: 12,
                          color: colors.inkMuted,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          '${route.reviewCount > 0 ? route.reviewCount : 128}',
                          style: TextStyle(
                            fontSize: 11,
                            color: colors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    // Button row: "查看路线 →" + bookmark button
                    Row(
                      children: [
                        // CTA button (flex 1, 38px, borderRadius 12, flare bg)
                        Expanded(
                          child: Container(
                            height: 38,
                            decoration: BoxDecoration(
                              color: colors.flare,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Center(
                              child: Text(
                                '查看路线 →',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Bookmark button (38px square, borderRadius 12, surface bg, line border, bookmark icon in flare)
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: colors.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: colors.line,
                              width: 0.5,
                            ),
                          ),
                          child: Center(
                            child: KaipaIcon(
                              name: KaipaIcons.bookmark,
                              size: 16,
                              color: colors.flare,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Featured Route Card (no active pin, bottom area) ───────────────

class _FeaturedRouteCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _FeaturedRouteCard({
    required this.route,
    required this.colors,
    required this.onTap,
  });

  String _fmt(Duration d) {
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
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle at top center
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: const Color.fromRGBO(60, 52, 42, 0.2),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 14),
          // Title area with bookmark button
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Distance label
                    Text(
                      '距离你 2.3 公里',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Route name (26px bold)
                    Text(
                      route.name,
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.7,
                        color: colors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    // DiffBadge + stats
                    Row(
                      children: [
                        DiffBadge(level: route.difficulty),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${route.distanceKm.toStringAsFixed(1)} 公里 · ↑ ${route.elevationGainM.toInt()} 米 · ${_fmt(route.estimatedDuration)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.inkMuted,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Bookmark glass button (44px, borderRadius 12, flareSoft bg + flare border)
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: colors.flareSoft,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: colorWithOpacity(colors.flare, 0.3),
                    width: 0.5,
                  ),
                ),
                child: Center(
                  child: KaipaIcon(
                    name: KaipaIcons.bookmark,
                    size: 18,
                    color: colors.flare,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Mini elevation strip (50px height, borderRadius 10, surfaceHi bg, line border)
          if (route.elevationProfile.isNotEmpty)
            Container(
              width: double.infinity,
              height: 50,
              decoration: BoxDecoration(
                color: colors.surfaceHi,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: colors.line,
                  width: 0.5,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: CustomPaint(
                    size: const Size(double.infinity, 34),
                    painter: _MiniElevPainter(
                      points: route.elevationProfile,
                      flareColor: colors.flare,
                      mossColor: colors.moss,
                    ),
                  ),
                ),
              ),
            ),
          if (route.elevationProfile.isNotEmpty) const SizedBox(height: 14),
          // CTA button (full width, 50px, borderRadius 14, flare bg, navigate icon + text, shadow)
          GestureDetector(
            onTap: onTap,
            child: Container(
              width: double.infinity,
              height: 50,
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: colorWithOpacity(colors.flare, 0.35),
                    blurRadius: 14,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const KaipaIcon(
                    name: KaipaIcons.navigate,
                    size: 16,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    '查看完整路线',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Mini Elevation Painter (with gradient fill, line, 3 marker circles) ──

class _MiniElevPainter extends CustomPainter {
  final List<ElevationPoint> points;
  final Color flareColor;
  final Color mossColor;

  _MiniElevPainter({
    required this.points,
    required this.flareColor,
    required this.mossColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    double minE = double.infinity, maxE = double.negativeInfinity;
    double maxD = 0;
    for (final p in points) {
      if (p.elevation < minE) minE = p.elevation;
      if (p.elevation > maxE) maxE = p.elevation;
      if (p.distance > maxD) maxD = p.distance;
    }
    if (maxD == 0 || maxE == minE) return;

    final range = maxE - minE;
    final pts = points.map((p) {
      final x = (p.distance / maxD) * size.width;
      final y =
          size.height - ((p.elevation - minE) / range) * size.height * 0.85;
      return Offset(x, y);
    }).toList();

    // Gradient fill
    final fillPath = Path()..moveTo(0, size.height);
    for (final pt in pts) {
      fillPath.lineTo(pt.dx, pt.dy);
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();
    canvas.drawPath(
      fillPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            colorWithOpacity(flareColor, 0.2),
            colorWithOpacity(flareColor, 0.04),
          ],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );

    // Line stroke
    final linePath = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = flareColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // 3 marker circles: moss start, flare peak, flare end
    // Start marker (moss)
    _drawMarker(canvas, pts.first, mossColor);

    // Peak marker (flare)
    double minY = double.infinity;
    Offset? peakPt;
    for (final pt in pts) {
      if (pt.dy < minY) {
        minY = pt.dy;
        peakPt = pt;
      }
    }
    if (peakPt != null) {
      _drawMarker(canvas, peakPt, flareColor);
    }

    // End marker (flare)
    _drawMarker(canvas, pts.last, flareColor);
  }

  void _drawMarker(Canvas canvas, Offset point, Color color) {
    canvas.drawCircle(point, 4, Paint()..color = color);
    canvas.drawCircle(point, 2.5, Paint()..color = const Color(0xFFFFFFFF));
  }

  @override
  bool shouldRepaint(_MiniElevPainter old) => false;
}
