import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import '../data/review_repository.dart';
import '../domain/review_model.dart';
import '../../discover/data/route_repository.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/diff_badge.dart';
import '../../../core/widgets/pill_widget.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../trip_plan/data/trip_plan_repository.dart';
import '../../trip_plan/data/gear_recommendation_service.dart';
import '../../trip_plan/domain/gear_recommendation.dart';
import '../../gpx/data/gpx_repository.dart';
import 'dart:convert';
import 'package:file_picker/file_picker.dart';

class RouteDetailScreen extends ConsumerWidget {
  final String routeId;

  const RouteDetailScreen({super.key, required this.routeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(routeId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: routeAsync.when(
        data: (route) => _RouteDetailBody(
          route: route,
          routeId: routeId,
        ),
        loading: () => Center(
          child: CircularProgressIndicator(
            color: colors.flare,
            strokeWidth: 2.5,
          ),
        ),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, color: colors.diff.extreme, size: 48),
                const SizedBox(height: 16),
                Text(
                  '无法加载线路',
                  style: TextStyle(
                    color: colors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  error.toString(),
                  style: TextStyle(color: colors.inkMuted, fontSize: 13),
                  textAlign: TextAlign.center,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 20),
                TextButton.icon(
                  onPressed: () => ref.invalidate(routeByIdProvider(routeId)),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('重试'),
                  style: TextButton.styleFrom(foregroundColor: colors.flare),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Main Body ─────────────────────────────────────────────────────────

class _RouteDetailBody extends ConsumerWidget {
  final RouteModel route;
  final String routeId;

  const _RouteDetailBody({required this.route, required this.routeId});

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0 && m > 0) return '$h:${m.toString().padLeft(2, '0')}';
    if (h > 0) return '${h}h';
    return '${m}m';
  }

  String get _difficultyGrade {
    switch (route.difficulty) {
      case 'easy':
        return 'T4';
      case 'mod':
      case 'moderate':
        return 'T3';
      case 'hard':
        return 'T2';
      case 'expert':
        return 'T1';
      case 'extreme':
        return 'T0';
      default:
        return 'T3';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final reviewsAsync = ref.watch(reviewsByRouteProvider(routeId));
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Stack(
      children: [
        // Scrollable content
        CustomScrollView(
          slivers: [
            // Hero map section (360px)
            SliverToBoxAdapter(
              child: _HeroSection(route: route, colors: colors),
            ),

            // Content sections (starts overlapping hero at y=280)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Region
                  if (route.region != null) ...[
                    Text(
                      route.region!,
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 11,
                        letterSpacing: -0.1,
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],

                  // Title
                  Text(
                    route.name,
                    style: TextStyle(
                      color: colors.ink,
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.9,
                      height: 1.05,
                    ),
                  ),

                  // Subtitle / description
                  if (route.description != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      route.description!,
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 14,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Stats card
                  _StatsCard(
                    route: route,
                    colors: colors,
                    durationLabel: _formatDuration(route.estimatedDuration),
                    difficultyGrade: _difficultyGrade,
                  ),
                  const SizedBox(height: 16),

                  // Tags row
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      DiffBadge(level: route.difficulty),
                      ...route.tags.map(
                        (tag) => PillWidget(
                          child: Text(tag),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),

                  // Elevation profile section
                  if (route.elevationProfile.isNotEmpty) ...[
                    _SectionHeader(title: '海拔剖面', colors: colors),
                    const SizedBox(height: 12),
                    _ElevationProfileCard(
                      points: route.elevationProfile,
                      colors: colors,
                    ),
                    const SizedBox(height: 22),
                  ],

                  // Getting there section
                  _SectionHeader(title: '如何抵达', colors: colors),
                  const SizedBox(height: 12),
                  _GettingThereCard(routeName: route.name, colors: colors),
                  const SizedBox(height: 22),

                  // Gear section — rule-based recommendations
                  ref.watch(gearRecommendationsProvider(
                    (route: route, weather: null),
                  )).when(
                    data: (recs) => _GearRecommendSection(
                      recommendations: recs,
                      colors: colors,
                    ),
                    loading: () => _SectionHeader(
                      title: '推荐装备',
                      colors: colors,
                    ),
                    error: (e, s) => _SectionHeader(
                      title: '推荐装备',
                      colors: colors,
                    ),
                  ),
                  const SizedBox(height: 22),

                  // Reviews section
                  _SectionHeader(
                    title: '走过的人',
                    colors: colors,
                    trailing: Text(
                      '见全部',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.inkMuted,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _ReviewsCard(
                    reviewsAsync: reviewsAsync,
                    colors: colors,
                  ),

                  // Bottom spacing for sticky bar
                  SizedBox(height: 100 + bottomPadding),
                ]),
              ),
            ),
          ],
        ),

        // Top chrome
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 16,
          right: 16,
          child: Row(
            children: [
              CircleButton(
                icon: KaipaIcons.back,
                onTap: () => context.pop(),
              ),
              const Spacer(),
              CircleButton(
                icon: KaipaIcons.upload,
                color: colors.flare,
                onTap: () =>
                    _handleUploadTrack(context, ref, routeId, route.name),
              ),
              const SizedBox(width: 8),
              CircleButton(
                icon: KaipaIcons.heart,
                onTap: () {},
              ),
              const SizedBox(width: 8),
              CircleButton(
                icon: KaipaIcons.share,
                onTap: () {},
              ),
            ],
          ),
        ),

        // Sticky CTA at bottom
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: _StickyCTA(
            colors: colors,
            bottomPadding: bottomPadding,
            routeId: routeId,
          ),
        ),
      ],
    );
  }
}

// ─── Section Header ───────────────────────────────────────────────────
// Matches spec: 18px bold, letterSpacing -0.4

class _SectionHeader extends StatelessWidget {
  final String title;
  final KaipaColors colors;
  final Widget? trailing;

  const _SectionHeader({
    required this.title,
    required this.colors,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: colors.ink,
              letterSpacing: -0.4,
            ),
          ),
        ),
        ?trailing,
      ],
    );
  }
}

Future<void> _handleUploadTrack(
    BuildContext context, WidgetRef ref, String routeId, String routeName) async {
  try {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['gpx', 'kml'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;

    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null) return;

    final content = utf8.decode(bytes, allowMalformed: true);
    final gpxRepo = ref.read(gpxRepositoryProvider);
    final parsed = gpxRepo.parseGpxContent(content, fileName: file.name);

    if (parsed.points.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('文件中没有找到轨迹点')),
        );
      }
      return;
    }

    final waypoints = parsed.points
        .map((p) => {'lat': p.latitude, 'lng': p.longitude})
        .toList();

    double cumDist = 0;
    final elevationProfile = <Map<String, dynamic>>[];
    for (int i = 0; i < parsed.points.length; i++) {
      final p = parsed.points[i];
      elevationProfile.add({
        'distance': cumDist,
        'elevation': p.elevation ?? 0,
      });
    }

    final routeRepo = ref.read(routeRepositoryProvider);
    await routeRepo.contributeTrack(
      routeId: routeId,
      waypoints: waypoints,
      elevationProfile: elevationProfile,
    );

    ref.invalidate(routeByIdProvider(routeId));

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('已为「$routeName」上传轨迹 (${parsed.points.length} 点)'),
        ),
      );
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('上传失败: $e')),
      );
    }
  }
}

// ─── Hero Section ──────────────────────────────────────────────────────

class _HeroSection extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _HeroSection({required this.route, required this.colors});

  LatLngBounds? _computeBounds(List<LatLng> points) {
    if (points.length < 2) return null;
    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;
    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    final latPad = (maxLat - minLat) * 0.15 + 0.002;
    final lngPad = (maxLng - minLng) * 0.15 + 0.002;
    return LatLngBounds(
      LatLng(minLat - latPad, minLng - lngPad),
      LatLng(maxLat + latPad, maxLng + lngPad),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasPath = route.waypoints.length >= 2;
    final pathPoints = hasPath
        ? route.waypoints.map((w) => LatLng(w.latitude, w.longitude)).toList()
        : <LatLng>[];
    final bounds = _computeBounds(pathPoints);

    return SizedBox(
      height: 360,
      child: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: hasPath
                    ? LatLng(
                        (pathPoints.first.latitude + pathPoints.last.latitude) / 2,
                        (pathPoints.first.longitude + pathPoints.last.longitude) / 2,
                      )
                    : LatLng(route.latitude, route.longitude),
                initialZoom: 13,
                initialCameraFit: bounds != null
                    ? CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.fromLTRB(32, 48, 32, 100))
                    : null,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.none,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.kaipa.app',
                ),
                if (hasPath)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: pathPoints,
                        color: colors.flare,
                        strokeWidth: 3.5,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: hasPath
                      ? [
                          // Start marker (green)
                          Marker(
                            point: pathPoints.first,
                            width: 28,
                            height: 28,
                            child: Container(
                              decoration: BoxDecoration(
                                color: colors.moss,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: colors.moss.withAlpha(80),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Center(
                                child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 14),
                              ),
                            ),
                          ),
                          // End marker (flare)
                          Marker(
                            point: pathPoints.last,
                            width: 28,
                            height: 28,
                            child: Container(
                              decoration: BoxDecoration(
                                color: colors.flare,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: colors.flare.withAlpha(80),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Center(
                                child: Icon(Icons.flag_rounded, color: Colors.white, size: 14),
                              ),
                            ),
                          ),
                        ]
                      : [
                          Marker(
                            point: LatLng(route.latitude, route.longitude),
                            width: 32,
                            height: 32,
                            child: Container(
                              decoration: BoxDecoration(
                                color: colors.flare,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2.5),
                                boxShadow: [
                                  BoxShadow(
                                    color: colors.flare.withAlpha(80),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Center(
                                child: Icon(Icons.terrain, color: Colors.white, size: 16),
                              ),
                            ),
                          ),
                        ],
                ),
              ],
            ),
          ),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 360 * 0.5,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.0, 0.9],
                  colors: [
                    colors.bg.withAlpha(0),
                    colors.bg,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Stats Card ───────────────────────────────────────────────────────

class _StatsCard extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;
  final String durationLabel;
  final String difficultyGrade;

  const _StatsCard({
    required this.route,
    required this.colors,
    required this.durationLabel,
    required this.difficultyGrade,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(40, 30, 20, 0.04),
            offset: Offset(0, 1),
            blurRadius: 3,
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: StatWidget(
              label: '距离',
              value: route.distanceKm.toStringAsFixed(1),
              unit: 'km',
            ),
          ),
          _gap(12),
          Expanded(
            child: StatWidget(
              label: '爬升',
              value: '${route.elevationGainM.toInt()}',
              unit: 'm',
            ),
          ),
          _gap(12),
          Expanded(
            child: StatWidget(
              label: '时长',
              value: durationLabel,
            ),
          ),
          _gap(12),
          Expanded(
            child: StatWidget(
              label: '难度',
              value: difficultyGrade,
            ),
          ),
        ],
      ),
    );
  }

  Widget _gap(double w) => SizedBox(width: w);
}

// ─── Elevation Profile Card ───────────────────────────────────────────

class _ElevationProfileCard extends StatelessWidget {
  final List<ElevationPoint> points;
  final KaipaColors colors;

  const _ElevationProfileCard({
    required this.points,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    // Find start, peak, end elevations
    double startElev = points.isNotEmpty ? points.first.elevation : 0;
    double endElev = points.isNotEmpty ? points.last.elevation : 0;
    double peakElev = 0;
    for (final p in points) {
      if (p.elevation > peakElev) peakElev = p.elevation;
    }

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          SizedBox(
            height: 140,
            child: CustomPaint(
              size: Size.infinite,
              painter: _ElevationChartPainter(
                points: points,
                flareColor: colors.flare,
                mossColor: colors.moss,
                lineColor: colors.line,
              ),
            ),
          ),
          const SizedBox(height: 10),
          // Labels below chart
          Row(
            children: [
              Text(
                '${startElev.toInt()}m 起点',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.inkMuted,
                ),
              ),
              const Spacer(),
              Text(
                '${peakElev.toInt()}m 鹰飞倒仰',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.flare,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              Text(
                '${endElev.toInt()}m 终点',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.inkMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Elevation Chart Painter ──────────────────────────────────────────

class _ElevationChartPainter extends CustomPainter {
  final List<ElevationPoint> points;
  final Color flareColor;
  final Color mossColor;
  final Color lineColor;

  _ElevationChartPainter({
    required this.points,
    required this.flareColor,
    required this.mossColor,
    required this.lineColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final w = size.width;
    final h = size.height;

    // Find data bounds
    double minElev = double.infinity;
    double maxElev = double.negativeInfinity;
    double maxDist = 0;
    int peakIndex = 0;

    for (int i = 0; i < points.length; i++) {
      if (points[i].elevation < minElev) minElev = points[i].elevation;
      if (points[i].elevation > maxElev) {
        maxElev = points[i].elevation;
        peakIndex = i;
      }
      if (points[i].distance > maxDist) maxDist = points[i].distance;
    }

    if (maxDist == 0) return;
    final elevRange = maxElev - minElev;
    if (elevRange == 0) return;

    final padMin = minElev - elevRange * 0.1;
    final padMax = maxElev + elevRange * 0.1;
    final padRange = padMax - padMin;

    // Map points to screen coords
    final pts = points.map((p) {
      final x = (p.distance / maxDist) * w;
      final y = h - ((p.elevation - padMin) / padRange) * h;
      return Offset(x, y);
    }).toList();

    // Draw dashed grid lines at y=20%, 50%, 80%
    final gridPaint = Paint()
      ..color = lineColor
      ..strokeWidth = 0.5;

    for (final frac in [0.20, 0.50, 0.80]) {
      final y = h * frac;
      _drawDashedLine(canvas, Offset(0, y), Offset(w, y), gridPaint, 4, 3);
    }

    // Gradient fill path
    final fillPath = Path();
    fillPath.moveTo(pts.first.dx, h);
    for (final pt in pts) {
      fillPath.lineTo(pt.dx, pt.dy);
    }
    fillPath.lineTo(pts.last.dx, h);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(0, 0),
        Offset(0, h),
        [
          flareColor.withAlpha((0.28 * 255).round()),
          flareColor.withAlpha(0),
        ],
      );
    canvas.drawPath(fillPath, fillPaint);

    // Line stroke
    final linePaint = Paint()
      ..color = flareColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final linePath = Path();
    linePath.moveTo(pts.first.dx, pts.first.dy);
    for (int i = 1; i < pts.length; i++) {
      linePath.lineTo(pts[i].dx, pts[i].dy);
    }
    canvas.drawPath(linePath, linePaint);

    // Start marker: moss fill, 4px radius, white stroke 1.5
    canvas.drawCircle(
      pts.first,
      4,
      Paint()..color = mossColor,
    );
    canvas.drawCircle(
      pts.first,
      4,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    // Peak marker: flare fill, 4px radius
    final peakPt = pts[peakIndex];
    canvas.drawCircle(
      peakPt,
      4,
      Paint()..color = flareColor,
    );

    // End marker: flare fill, 4px radius
    canvas.drawCircle(
      pts.last,
      4,
      Paint()..color = flareColor,
    );
  }

  void _drawDashedLine(
      Canvas canvas, Offset p1, Offset p2, Paint paint, double dash, double gap) {
    final dx = p2.dx - p1.dx;
    final dy = p2.dy - p1.dy;
    final dist = math.sqrt(dx * dx + dy * dy);
    final ux = dx / dist;
    final uy = dy / dist;
    double d = 0;
    while (d < dist) {
      final start = Offset(p1.dx + ux * d, p1.dy + uy * d);
      d += dash;
      if (d > dist) d = dist;
      final end = Offset(p1.dx + ux * d, p1.dy + uy * d);
      canvas.drawLine(start, end, paint);
      d += gap;
    }
  }

  @override
  bool shouldRepaint(covariant _ElevationChartPainter oldDelegate) {
    return points != oldDelegate.points ||
        flareColor != oldDelegate.flareColor;
  }
}

// ─── Getting There Card ───────────────────────────────────────────────

class _AccessInfo {
  final String drive;
  final String transit;
  final String? carpool;

  const _AccessInfo({
    required this.drive,
    required this.transit,
    this.carpool,
  });
}

const _routeAccess = <String, _AccessInfo>{
  '武功山金顶穿越': _AccessInfo(
    drive: '南昌 → 龙山村 · 3h · 260km',
    transit: '南昌西站 → 萍乡北 (高铁40min) → 班车至龙山村',
    carpool: '萍乡拼车至龙山村 · ¥50/人',
  ),
  '虎跳峡高路徒步': _AccessInfo(
    drive: '丽江 → 桥头镇 · 2h · 100km',
    transit: '丽江客运站 → 桥头镇班车 · 2h · ¥35',
    carpool: '丽江古城拼车 · ¥60/人',
  ),
  '鳌太穿越': _AccessInfo(
    drive: '西安 → 都督门(鳌山登山口) · 4h · 230km',
    transit: '西安 → 眉县(高铁40min) → 包车至都督门',
    carpool: '西安户外群拼车 · ¥150/人',
  ),
  '船底顶穿越': _AccessInfo(
    drive: '广州 → 罗坑镇 · 3h · 220km',
    transit: '广州 → 韶关东(高铁1h) → 班车至罗坑镇',
    carpool: '广州户外群拼车 · ¥100/人',
  ),
  '徽杭古道': _AccessInfo(
    drive: '杭州 → 绩溪鱼川村 · 3h · 250km',
    transit: '杭州东 → 绩溪北(高铁1.5h) → 班车至鱼川村',
    carpool: '绩溪拼车至登山口 · ¥30/人',
  ),
  '雨崩村徒步': _AccessInfo(
    drive: '丽江 → 西当温泉 · 8h · 400km',
    transit: '丽江 → 德钦(班车8h) → 包车至西当',
    carpool: '丽江/香格里拉拼车 · ¥200/人',
  ),
  '洛克线': _AccessInfo(
    drive: '成都 → 木里嘟噜村 · 12h · 700km',
    transit: '成都 → 西昌(火车/飞机) → 木里(班车6h) → 包车至嘟噜',
    carpool: '成都户外群拼车 · ¥400/人',
  ),
  '四姑娘山大峰攀登': _AccessInfo(
    drive: '成都 → 日隆镇 · 4h · 230km',
    transit: '成都茶店子站 → 小金(班车5h) → 日隆镇',
    carpool: '成都拼车至日隆 · ¥120/人',
  ),
  '贡嘎转山': _AccessInfo(
    drive: '成都 → 老榆林 · 7h · 380km',
    transit: '成都 → 康定(班车6h) → 包车至老榆林',
    carpool: '成都户外群拼车 · ¥250/人',
  ),
  '五台山大朝台': _AccessInfo(
    drive: '太原 → 五台山景区 · 3.5h · 230km',
    transit: '太原 → 五台山(火车2h) → 景区班车',
    carpool: '太原拼车至台怀镇 · ¥80/人',
  ),
  '狼塔C线': _AccessInfo(
    drive: '乌鲁木齐 → 呼图壁林场 · 3h · 180km',
    transit: '乌鲁木齐 → 呼图壁(班车1.5h) → 包车至林场',
    carpool: '乌鲁木齐户外群拼车 · ¥150/人',
  ),
  '乌孙古道': _AccessInfo(
    drive: '伊宁 → 琼库什台村 · 4h · 180km',
    transit: '伊宁 → 特克斯(班车3h) → 包车至琼库什台',
    carpool: '伊宁户外群拼车 · ¥200/人',
  ),
  '长穿毕': _AccessInfo(
    drive: '成都 → 长坪沟口 · 4h · 230km',
    transit: '成都茶店子站 → 小金(班车5h) → 包车至长坪沟口',
    carpool: '成都拼车至日隆 · ¥120/人',
  ),
  '七藏沟穿越': _AccessInfo(
    drive: '成都 → 卡卡沟口 · 7h · 430km',
    transit: '成都 → 松潘(班车6h) → 包车至卡卡沟口',
    carpool: '成都/松潘拼车 · ¥200/人',
  ),
  '梅里雪山外转': _AccessInfo(
    drive: '丽江 → 德钦 · 8h · 360km',
    transit: '丽江 → 香格里拉(班车4h) → 德钦(班车4h)',
    carpool: '丽江/香格里拉拼车 · ¥200/人',
  ),
  '珠峰东坡嘎玛沟': _AccessInfo(
    drive: '日喀则 → 曲当乡 · 6h · 280km',
    transit: '拉萨 → 日喀则(火车3h) → 包车至曲当乡',
    carpool: '日喀则户外群拼车 · ¥300/人',
  ),
  '龙脊梯田徒步': _AccessInfo(
    drive: '桂林 → 龙脊景区 · 2h · 80km',
    transit: '桂林琴潭站 → 龙脊(直达班车2h) · ¥40',
    carpool: '桂林拼车 · ¥50/人',
  ),
  '夏特古道': _AccessInfo(
    drive: '伊宁 → 夏特温泉 · 3h · 150km',
    transit: '伊宁 → 昭苏(班车3h) → 包车至夏特温泉',
    carpool: '伊宁户外群拼车 · ¥180/人',
  ),
  '库拉岗日徒步': _AccessInfo(
    drive: '拉萨 → 洛扎县 · 6h · 340km',
    transit: '拉萨 → 洛扎(班车7h) → 包车至登山口',
    carpool: '拉萨户外群拼车 · ¥350/人',
  ),
  '半脊峰攀登': _AccessInfo(
    drive: '成都 → 理县毕棚沟 · 4h · 220km',
    transit: '成都茶店子站 → 理县(班车4h) → 包车至毕棚沟',
    carpool: '成都拼车至毕棚沟 · ¥120/人',
  ),
  '火凤线': _AccessInfo(
    drive: '深圳市区 → 凤凰山森林公园 · 40min · 25km',
    transit: '地铁1号线凤凰岗站A出口 · 步行10min至登山口',
  ),
  '七娘山穿越': _AccessInfo(
    drive: '深圳市区 → 七娘山地质公园 · 1h · 50km',
    transit: '地铁8号线大鹏站 → M471路至七娘山站',
  ),
  '墨脱徒步': _AccessInfo(
    drive: '林芝 → 派镇 · 3h · 130km',
    transit: '拉萨 → 林芝(飞机/火车) → 包车至派镇',
    carpool: '林芝户外群拼车 · ¥200/人',
  ),
  '武夷山主峰穿越': _AccessInfo(
    drive: '福州 → 武夷山景区 · 3h · 300km',
    transit: '福州 → 武夷山北(高铁1.5h) → 景区接驳车',
    carpool: '武夷山拼车 · ¥40/人',
  ),
  '潮州凤凰山': _AccessInfo(
    drive: '潮州市区 → 凤凰镇 · 1h · 40km',
    transit: '潮汕站 → 潮州(公交) → 凤凰镇(班车1h)',
    carpool: '潮州拼车至凤凰镇 · ¥30/人',
  ),
};

class _GettingThereCard extends StatelessWidget {
  final String routeName;
  final KaipaColors colors;

  const _GettingThereCard({required this.routeName, required this.colors});

  @override
  Widget build(BuildContext context) {
    final info = _routeAccess[routeName];
    final driveTxt = info?.drive ?? '导航至登山口';
    final transitTxt = info?.transit ?? '查询当地班车至登山口';
    final carpoolTxt = info?.carpool;

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _AccessRow(
              icon: KaipaIcons.navigate,
              title: '自驾',
              detail: driveTxt,
              badge: '推荐',
              colors: colors,
            ),
          ),
          if (carpoolTxt != null) ...[
            _accessDivider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _AccessRow(
                icon: KaipaIcons.users,
                title: '拼车',
                detail: carpoolTxt,
                colors: colors,
              ),
            ),
          ],
          _accessDivider(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _AccessRow(
              icon: KaipaIcons.route,
              title: '公共交通',
              detail: transitTxt,
              colors: colors,
            ),
          ),
        ],
      ),
    );
  }

  Widget _accessDivider() {
    return Container(
      height: 0.5,
      color: colors.line,
    );
  }
}

class _AccessRow extends StatelessWidget {
  final String icon;
  final String title;
  final String detail;
  final String? badge;
  final KaipaColors colors;

  const _AccessRow({
    required this.icon,
    required this.title,
    required this.detail,
    this.badge,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          // Icon circle
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: colors.mossSoft,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Center(
              child: KaipaIcon(
                name: icon,
                size: 17,
                color: colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Text content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w500,
                        color: colors.ink,
                      ),
                    ),
                    if (badge != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: colors.flareSoft,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          badge!,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: colors.flare,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.inkMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          KaipaIcon(
            name: KaipaIcons.forward,
            size: 16,
            color: colors.inkDim,
          ),
        ],
      ),
    );
  }
}

// ─── Gear Recommend Section ─────────────────────────────────────────────

String _iconForCategory(String categoryId) {
  switch (categoryId) {
    case BuiltinCategories.boot:
      return KaipaIcons.boot;
    case BuiltinCategories.backpack:
      return KaipaIcons.backpack;
    case BuiltinCategories.jacket:
      return KaipaIcons.jacket;
    case BuiltinCategories.tent:
      return KaipaIcons.tent;
    case BuiltinCategories.bottle:
      return KaipaIcons.bottle;
    case BuiltinCategories.battery:
      return KaipaIcons.battery;
    case BuiltinCategories.light:
      return KaipaIcons.light;
    case BuiltinCategories.knife:
      return KaipaIcons.knife;
    case BuiltinCategories.socks:
      return KaipaIcons.socks;
    case BuiltinCategories.shield:
      return KaipaIcons.shield;
    case BuiltinCategories.down:
      return KaipaIcons.down;
    case BuiltinCategories.tee:
      return KaipaIcons.tee;
    case BuiltinCategories.fleece:
      return KaipaIcons.fleece;
    case BuiltinCategories.trekkingPole:
      return KaipaIcons.shield;
    case BuiltinCategories.sleepingBag:
      return KaipaIcons.sleeping;
    case BuiltinCategories.firstAid:
      return KaipaIcons.firstAid;
    case BuiltinCategories.gloves:
      return KaipaIcons.gloves;
    case BuiltinCategories.cooking:
      return KaipaIcons.flame;
    default:
      return KaipaIcons.backpack;
  }
}

class _GearRecommendSection extends StatelessWidget {
  final List<GearRecommendation> recommendations;
  final KaipaColors colors;

  const _GearRecommendSection({
    required this.recommendations,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    final display = recommendations.take(7).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: '推荐装备',
          colors: colors,
          trailing: Text(
            '${recommendations.length} 类装备',
            style: TextStyle(fontSize: 12, color: colors.inkMuted),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          padding: const EdgeInsets.all(16),
          child: GridView.count(
            crossAxisCount: 4,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 0.85,
            children: [
              ...display.map((rec) => _GearRecItem(
                    icon: _iconForCategory(rec.categoryId),
                    label: rec.categoryName,
                    colors: colors,
                  )),
              if (display.length >= 7)
                _GearRecMore(count: recommendations.length - 7, colors: colors),
            ],
          ),
        ),
      ],
    );
  }
}

class _GearRecItem extends StatelessWidget {
  final String icon;
  final String label;
  final KaipaColors colors;

  const _GearRecItem({
    required this.icon,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: colors.surfaceHi,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Center(
            child: KaipaIcon(name: icon, size: 22, color: colors.moss),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: colors.inkMuted),
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _GearRecMore extends StatelessWidget {
  final int count;
  final KaipaColors colors;

  const _GearRecMore({required this.count, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: colors.inkMuted,
              width: 1,
              strokeAlign: BorderSide.strokeAlignInside,
            ),
          ),
          child: Center(
            child: Text(
              '+$count',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: colors.inkMuted,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '更多',
          style: TextStyle(fontSize: 11, color: colors.inkMuted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}


// ─── Rating Label ─────────────────────────────────────────────────────

String _ratingLabel(num rating) {
  if (rating >= 5) return '夯';
  if (rating >= 4) return '顶级';
  if (rating >= 3) return '人上人';
  if (rating >= 2) return 'NPC';
  return '拉完了';
}

Color _ratingLabelColor(num rating, KaipaColors colors) {
  if (rating >= 4) return colors.flare;
  if (rating >= 3) return colors.moss;
  return colors.inkMuted;
}

// ─── Reviews Card ─────────────────────────────────────────────────────

class _ReviewsCard extends StatelessWidget {
  final AsyncValue<List<ReviewModel>> reviewsAsync;
  final KaipaColors colors;

  const _ReviewsCard({
    required this.reviewsAsync,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      padding: const EdgeInsets.all(16),
      child: reviewsAsync.when(
        data: (reviews) {
          if (reviews.isEmpty) {
            return _buildEmpty();
          }
          return Column(
            children: [
              for (int i = 0; i < reviews.length && i < 2; i++) ...[
                if (i > 0) _reviewDivider(),
                _ReviewItem(
                  review: reviews[i],
                  colors: colors,
                ),
              ],
            ],
          );
        },
        loading: () => Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: CircularProgressIndicator(
              color: colors.flare,
              strokeWidth: 2,
            ),
          ),
        ),
        error: (_, _) => _buildEmpty(),
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Text(
          '暂无评价，走完这条路线后来分享你的体验吧',
          style: TextStyle(fontSize: 13, color: colors.inkDim),
        ),
      ),
    );
  }

  Widget _reviewDivider() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Container(
        height: 0.5,
        color: colors.line,
      ),
    );
  }
}

class _ReviewItem extends StatelessWidget {
  final ReviewModel review;
  final KaipaColors colors;

  const _ReviewItem({required this.review, required this.colors});

  String _relativeDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays == 0) return '今天';
    if (diff.inDays == 1) return '昨天';
    if (diff.inDays < 7) return '${diff.inDays} 天前';
    if (diff.inDays < 14) return '上周';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()} 周前';
    if (diff.inDays < 60) return '上月';
    return '${(diff.inDays / 30).floor()} 个月前';
  }

  @override
  Widget build(BuildContext context) {
    final displayName = review.userId.length > 8
        ? '${review.userId.substring(0, 8)}...'
        : review.userId;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            // Avatar
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: colors.mossSoft,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  displayName.isNotEmpty ? displayName[0] : '?',
                  style: TextStyle(
                    color: colors.mossDeep,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                displayName,
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              _relativeDate(review.createdAt),
              style: TextStyle(
                color: colors.inkDim,
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Star rating + label
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ...List.generate(5, (i) {
              final IconData icon;
              if (i < review.rating.floor()) {
                icon = Icons.star_rounded;
              } else if (i == review.rating.floor() && review.rating % 1 >= 0.5) {
                icon = Icons.star_half_rounded;
              } else {
                icon = Icons.star_border_rounded;
              }
              return Padding(
                padding: const EdgeInsets.only(right: 1),
                child: Icon(icon, color: colors.flare, size: 14),
              );
            }),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
              decoration: BoxDecoration(
                color: _ratingLabelColor(review.rating, colors).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                _ratingLabel(review.rating),
                style: TextStyle(
                  color: _ratingLabelColor(review.rating, colors),
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        if (review.content != null && review.content!.isNotEmpty) ...[
          const SizedBox(height: 6),
          Opacity(
            opacity: 0.85,
            child: Text(
              review.content!,
              style: TextStyle(
                color: colors.ink,
                fontSize: 13.5,
                height: 1.5,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Sticky CTA ───────────────────────────────────────────────────────

class _StickyCTA extends ConsumerWidget {
  final KaipaColors colors;
  final double bottomPadding;
  final String routeId;

  const _StickyCTA({
    required this.colors,
    required this.bottomPadding,
    required this.routeId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0.0, 0.5],
          colors: [
            colors.bg.withAlpha(0),
            colors.bg,
          ],
        ),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 32 + bottomPadding),
      child: Row(
        children: [
          Expanded(
            child: ElevatedButton(
              onPressed: () async {
                final now = DateTime.now();
                final picked = await showDatePicker(
                  context: context,
                  initialDate: now.add(const Duration(days: 1)),
                  firstDate: now,
                  lastDate: now.add(const Duration(days: 365)),
                  helpText: '选择出发日期',
                  cancelText: '取消',
                  confirmText: '确定',
                );
                if (picked == null || !context.mounted) return;
                final repo = ref.read(tripPlanRepositoryProvider);
                final plan = await repo.createPlan(
                  routeId: routeId,
                  plannedDate: picked,
                );
                if (context.mounted) {
                  context.push('/trip-plans/${plan.id}?isNew=1');
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text('规划行程',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ElevatedButton(
              onPressed: () async {
                final repo = ref.read(tripPlanRepositoryProvider);
                final plan = await repo.createPlan(
                  routeId: routeId,
                  plannedDate: DateTime.now(),
                );
                if (context.mounted) {
                  context.push('/trip-plans/${plan.id}?isNew=1&immediate=1');
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF22C55E),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text('立即出发',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

// Keep legacy painter for backward compat if anything references it
class ElevationProfilePainter extends CustomPainter {
  final List<ElevationPoint> points;
  final Color lineColor;
  final Color fillColor;
  final Color gridColor;
  final Color labelColor;

  ElevationProfilePainter({
    required this.points,
    required this.lineColor,
    required this.fillColor,
    required this.gridColor,
    required this.labelColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Delegate to new painter logic if needed
  }

  @override
  bool shouldRepaint(covariant ElevationProfilePainter oldDelegate) => false;
}
