import 'dart:ui';
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
  String _selectedFilter = '全部';
  bool _showFilters = false;

  static const _defaultCenter = LatLng(40.3, 116.5);
  static const _defaultZoom = 9.5;
  static const _filters = ['全部', '入门', '中等', '困难', '附近'];
  static const _filterToDifficulty = <String, String?>{
    '全部': null,
    '入门': 'easy',
    '中等': 'moderate',
    '困难': 'hard',
    '附近': null,
  };

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
                if (_activeRoute != null) {
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

          // ── Top: search bar + profile ──
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
                child: SafeArea(
                  bottom: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () => context.push('/discover/search'),
                                child: GlassContainer(
                                  radius: KaipaRadius.pill,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 12),
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
                                              color: colors.inkDim,
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
                            const SizedBox(width: 10),
                            // Filter button
                            GestureDetector(
                              onTap: () => setState(() => _showFilters = !_showFilters),
                              child: GlassContainer(
                                radius: KaipaRadius.pill,
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.tune_rounded,
                                          size: 18, color: colors.ink),
                                      if (_selectedFilter != '全部') ...[
                                        const SizedBox(width: 4),
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            color: colors.flare,
                                            shape: BoxShape.circle,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            CircleButton(
                              icon: KaipaIcons.user,
                              onTap: () {
                                final shell = StatefulNavigationShell.of(context);
                                shell.goBranch(2);
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Tap outside to close filters (below the panel)
          if (_showFilters && !immersive)
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: () => setState(() => _showFilters = false),
                child: const SizedBox.expand(),
              ),
            ),

          // Filter dropdown panel (above the overlay)
          if (_showFilters && !immersive)
            Positioned(
              top: MediaQuery.of(context).padding.top + 60,
              left: 16,
              right: 16,
              child: GlassContainer(
                radius: 18,
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '筛选路线',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: colors.ink,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _filters.map((filter) {
                        final isSelected = filter == _selectedFilter;
                        return GestureDetector(
                          onTap: () => setState(() {
                            _selectedFilter = filter;
                            _activeRoute = null;
                            _showFilters = false;
                          }),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 9),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? colors.flare
                                  : Colors.transparent,
                              borderRadius:
                                  BorderRadius.circular(KaipaRadius.pill),
                              border: isSelected
                                  ? null
                                  : Border.all(color: colors.lineSoft),
                            ),
                            child: Text(
                              filter,
                              style: TextStyle(
                                color:
                                    isSelected ? Colors.white : colors.ink,
                                fontSize: 13,
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),

          // ── Right: zoom + location buttons ──
          Positioned(
            right: 16,
            bottom: 120,
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
                      // NEW: fullscreen enter button
                      _MapButton(
                        icon: Icons.fullscreen,
                        colors: colors,
                        onTap: () {
                          setState(() {
                            _showFilters = false;
                            _activeRoute = null;
                          });
                          ref.read(immersiveModeProvider.notifier).state = true;
                        },
                      ),
                      const SizedBox(height: 14),
                      _MapButton(
                        icon: Icons.add,
                        colors: colors,
                        onTap: () => _mapController.move(
                          _mapController.camera.center,
                          _mapController.camera.zoom + 1,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _MapButton(
                        icon: Icons.remove,
                        colors: colors,
                        onTap: () => _mapController.move(
                          _mapController.camera.center,
                          _mapController.camera.zoom - 1,
                        ),
                      ),
                      const SizedBox(height: 14),
                      _MapButton(
                        icon: Icons.navigation_rounded,
                        colors: colors,
                        highlighted: true,
                        onTap: () =>
                            _mapController.move(_defaultCenter, _defaultZoom),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Active route preview (swipe down to dismiss) ──
          if (_activeRoute != null && !immersive)
            Positioned(
              left: 12,
              right: 12,
              bottom: 100,
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

        ],
      ),
    );
  }

  List<RouteModel> _filterRoutes(List<RouteModel> routes) {
    final difficulty = _filterToDifficulty[_selectedFilter];
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

// ─── Map Button (white circle, Material icon) ───────────────────────

class _MapButton extends StatelessWidget {
  final IconData icon;
  final KaipaColors colors;
  final VoidCallback onTap;
  final bool highlighted;

  const _MapButton({
    required this.icon,
    required this.colors,
    required this.onTap,
    this.highlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(20),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Center(
          child: Icon(
            icon,
            size: 20,
            color: highlighted ? colors.flare : colors.ink,
          ),
        ),
      ),
    );
  }
}

// ─── Featured Route Card (kept for potential future use) ─────────────

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
      return m > 0 ? '约 ${d.inHours}h${m}m' : '约 ${d.inHours}h';
    }
    return '约 ${d.inMinutes}m';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: GlassContainer(
        radius: 24,
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (route.region != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            route.region!,
                            style: TextStyle(
                              color: colors.flare,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ),
                      Text(
                        route.name,
                        style: TextStyle(
                          color: colors.ink,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.6,
                        ),
                      ),
                    ],
                  ),
                ),
                DiffBadge(level: route.difficulty),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${route.distanceKm.toStringAsFixed(1)} 公里  ·  ↑ ${route.elevationGainM.toInt()} 米  ·  ${_fmt(route.estimatedDuration)}',
              style: TextStyle(
                fontSize: 12,
                color: colors.inkMuted,
                letterSpacing: -0.1,
              ),
            ),
            const SizedBox(height: 14),
            // CTA
            Container(
              width: double.infinity,
              height: 48,
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
              child: const Center(
                child: Text(
                  '查看完整路线 →',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Route Preview Card ──────────────────────────────────────────────

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

  String _fmt(Duration d) {
    if (d.inHours > 0) {
      final m = d.inMinutes % 60;
      return m > 0 ? '约 ${d.inHours} 小时 ${m} 分' : '约 ${d.inHours} 小时';
    }
    return '约 ${d.inMinutes} 分';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(20),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Hero photo ──
            SizedBox(
              width: double.infinity,
              height: 140,
              child: Image.network(
                _MapScreenState.routePhoto(route.name, w: 600, h: 280),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Container(
                  color: colors.flareSoft,
                  child: Center(
                    child: KaipaIcon(
                        name: KaipaIcons.mountain,
                        size: 40,
                        color: colors.flare),
                  ),
                ),
              ),
            ),
            // ── Info section ──
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '距离你 2.3 公里',
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.inkMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          route.name,
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: colors.flareSoft,
                          borderRadius: BorderRadius.circular(12),
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
                  const SizedBox(height: 8),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    children: [
                      DiffBadge(level: route.difficulty),
                      Text(
                        '${route.distanceKm.toStringAsFixed(1)} 公里 · ↑ ${route.elevationGainM.toInt()} 米 · ${_fmt(route.estimatedDuration)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: colors.inkMuted,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (route.elevationProfile.isNotEmpty) ...[
                    Container(
                      width: double.infinity,
                      height: 56,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: colorWithOpacity(colors.flare, 0.06),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: CustomPaint(
                        size: const Size(double.infinity, 40),
                        painter: _MiniElevPainter(
                          points: route.elevationProfile,
                          color: colors.flare,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Container(
                    width: double.infinity,
                    height: 48,
                    decoration: BoxDecoration(
                      color: colors.flare,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: colorWithOpacity(colors.flare, 0.35),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.navigation_rounded,
                            size: 16, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Mini Elevation Painter ──────────────────────────────────────────

class _MiniElevPainter extends CustomPainter {
  final List<ElevationPoint> points;
  final Color color;

  _MiniElevPainter({required this.points, required this.color});

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
      final y = size.height - ((p.elevation - minE) / range) * size.height * 0.85;
      return Offset(x, y);
    }).toList();

    // Fill
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
            colorWithOpacity(color, 0.2),
            colorWithOpacity(color, 0.04),
          ],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );

    // Line
    final linePath = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Peak dot
    double minY = double.infinity;
    Offset? peakPt;
    for (final pt in pts) {
      if (pt.dy < minY) {
        minY = pt.dy;
        peakPt = pt;
      }
    }
    if (peakPt != null) {
      canvas.drawCircle(peakPt, 4, Paint()..color = color);
      canvas.drawCircle(peakPt, 2.5, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(_MiniElevPainter old) => false;
}
