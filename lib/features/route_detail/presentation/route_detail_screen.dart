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
        return 'T1';
      case 'mod':
      case 'moderate':
        return 'T2';
      case 'hard':
        return 'T3';
      case 'expert':
        return 'T4';
      case 'extreme':
        return 'T5';
      default:
        return 'T2';
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
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
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
                  _GettingThereCard(colors: colors),
                  const SizedBox(height: 22),

                  // Gear section
                  _SectionHeader(
                    title: '推荐装备',
                    colors: colors,
                    trailing: Text(
                      '14 件 · 5.6kg',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.inkMuted,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _GearCard(colors: colors),
                  const SizedBox(height: 22),

                  // Photo spots section
                  _SectionHeader(
                    title: '拍照打卡',
                    colors: colors,
                    trailing: Text(
                      '${route.photoSpots.isNotEmpty ? route.photoSpots.length : 5} 处',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.inkMuted,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ]),
              ),
            ),

            // Photo spots horizontal scroll (full-bleed)
            SliverToBoxAdapter(
              child: _PhotoSpotsRow(
                spots: route.photoSpots,
                colors: colors,
              ),
            ),

            // Reviews + remaining content
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
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
                  SizedBox(height: 80 + bottomPadding),
                ]),
              ),
            ),
          ],
        ),

        // Top chrome at y=56
        Positioned(
          top: 56,
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
                icon: KaipaIcons.heart,
                color: colors.flare,
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

// ─── Hero Section ──────────────────────────────────────────────────────

class _HeroSection extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;

  const _HeroSection({required this.route, required this.colors});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 360,
      child: Stack(
        children: [
          // Full-bleed map
          Positioned.fill(
            child: FlutterMap(
              options: MapOptions(
                initialCenter: LatLng(route.latitude, route.longitude),
                initialZoom: 13,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.none,
                ),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.kaipa.app',
                ),
                MarkerLayer(
                  markers: [
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
          // Gradient overlay: transparent 50% -> bg at 95%
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

class _GettingThereCard extends StatelessWidget {
  final KaipaColors colors;

  const _GettingThereCard({required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(
        children: [
          _AccessRow(
            icon: KaipaIcons.navigate,
            title: '自驾',
            detail: '国贸 → 西栅子村 · 2h10m · 92km',
            badge: '推荐',
            colors: colors,
          ),
          _accessDivider(),
          _AccessRow(
            icon: KaipaIcons.users,
            title: '拼车',
            detail: '周末徒步群拼车 · ¥80/人',
            colors: colors,
          ),
          _accessDivider(),
          _AccessRow(
            icon: KaipaIcons.route,
            title: '公交+打车',
            detail: '916快 → 怀柔 → 黑山寨 · 3h+',
            colors: colors,
          ),
        ],
      ),
    );
  }

  Widget _accessDivider() {
    return Container(
      height: 0.5,
      margin: const EdgeInsets.symmetric(horizontal: -16),
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

// ─── Gear Card ────────────────────────────────────────────────────────

class _GearCard extends StatelessWidget {
  final KaipaColors colors;

  const _GearCard({required this.colors});

  static const _gearItems = [
    (icon: KaipaIcons.boot, label: '高帮鞋'),
    (icon: KaipaIcons.backpack, label: '30L 包'),
    (icon: KaipaIcons.jacket, label: '冲锋衣'),
    (icon: KaipaIcons.bottle, label: '2L 水'),
    (icon: KaipaIcons.light, label: '头灯'),
    (icon: KaipaIcons.gloves, label: '手套'),
    (icon: KaipaIcons.compass, label: '指南针'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
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
          ..._gearItems.map((item) => _GearItem(
                icon: item.icon,
                label: item.label,
                colors: colors,
              )),
          _GearItemMore(colors: colors),
        ],
      ),
    );
  }
}

class _GearItem extends StatelessWidget {
  final String icon;
  final String label;
  final KaipaColors colors;

  const _GearItem({
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
            child: KaipaIcon(
              name: icon,
              size: 22,
              color: colors.moss,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: colors.inkMuted,
          ),
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}

class _GearItemMore extends StatelessWidget {
  final KaipaColors colors;

  const _GearItemMore({required this.colors});

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
            child: KaipaIcon(
              name: KaipaIcons.plus,
              size: 22,
              color: colors.inkMuted,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '更多',
          style: TextStyle(
            fontSize: 11,
            color: colors.inkMuted,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

// ─── Photo Spots Row ──────────────────────────────────────────────────

class _PhotoSpotsRow extends StatelessWidget {
  final List<PhotoSpot> spots;
  final KaipaColors colors;

  const _PhotoSpotsRow({required this.spots, required this.colors});

  // Fallback data when spots list doesn't have enough items
  static const _fallbackSpots = [
    (name: '北京结', distance: '3.2km', type: '日出最佳'),
    (name: '鹰飞倒仰', distance: '5.8km', type: '险段'),
    (name: '天梯', distance: '7.1km', type: '日落'),
    (name: '九眼楼', distance: '11.4km', type: '终点'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 180,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: spots.isNotEmpty ? spots.length : _fallbackSpots.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          if (spots.isNotEmpty && index < spots.length) {
            final spot = spots[index];
            return _PhotoSpotCard(
              name: spot.name,
              distance: '',
              type: spot.description ?? '',
              colors: colors,
            );
          }
          final fb = _fallbackSpots[index];
          return _PhotoSpotCard(
            name: fb.name,
            distance: fb.distance,
            type: fb.type,
            colors: colors,
          );
        },
      ),
    );
  }
}

class _PhotoSpotCard extends StatelessWidget {
  final String name;
  final String distance;
  final String type;
  final KaipaColors colors;

  const _PhotoSpotCard({
    required this.name,
    required this.distance,
    required this.type,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      height: 180,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.terrain.mid,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Stack(
        children: [
          // Terrain gradient bands
          Positioned.fill(
            child: CustomPaint(
              painter: _PhotoStripePainter(colors: colors),
            ),
          ),
          // Dark gradient overlay
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.5, 1.0],
                  colors: [
                    Colors.transparent,
                    Colors.black.withAlpha((0.65 * 255).round()),
                  ],
                ),
              ),
            ),
          ),
          // Bottom content
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (type.isNotEmpty || distance.isNotEmpty)
                  Opacity(
                    opacity: 0.85,
                    child: Text(
                      [type, distance].where((s) => s.isNotEmpty).join(' · '),
                      style: const TextStyle(
                        fontSize: 10,
                        color: Colors.white,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoStripePainter extends CustomPainter {
  final KaipaColors colors;

  _PhotoStripePainter({required this.colors});

  @override
  void paint(Canvas canvas, Size size) {
    final terrain = colors.terrain;
    final stripes = [
      terrain.base,
      terrain.lowland,
      terrain.mid,
      terrain.ridge,
      terrain.peak,
      terrain.ridge,
      terrain.mid,
    ];

    final stripeHeight = size.height / stripes.length;
    for (int i = 0; i < stripes.length; i++) {
      canvas.drawRect(
        Rect.fromLTWH(0, i * stripeHeight, size.width, stripeHeight + 1),
        Paint()..color = stripes[i],
      );
    }
  }

  @override
  bool shouldRepaint(covariant _PhotoStripePainter oldDelegate) => false;
}

// ─── Reviews Card ─────────────────────────────────────────────────────

class _ReviewsCard extends StatelessWidget {
  final AsyncValue<List<ReviewModel>> reviewsAsync;
  final KaipaColors colors;

  const _ReviewsCard({
    required this.reviewsAsync,
    required this.colors,
  });

  // Hardcoded review data matching spec
  static const _fallbackReviews = [
    (
      name: '陈明',
      date: '3 天前',
      rating: 4.5,
      text: '北京结到鹰飞倒仰最险，新手务必带绳子。日出 5:42 抵北京结刚好。',
    ),
    (
      name: 'Sara K.',
      date: '上周',
      rating: 5.0,
      text: '11 月去秋色拉满。下午 3 点后山风很大，建议带防风外套。',
    ),
  ];

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
            // Show fallback reviews from spec
            return _buildFallbackReviews();
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
        error: (_, _) => _buildFallbackReviews(),
      ),
    );
  }

  Widget _buildFallbackReviews() {
    return Column(
      children: [
        for (int i = 0; i < _fallbackReviews.length; i++) ...[
          if (i > 0) _reviewDivider(),
          _FallbackReviewItem(
            name: _fallbackReviews[i].name,
            date: _fallbackReviews[i].date,
            rating: _fallbackReviews[i].rating,
            text: _fallbackReviews[i].text,
            colors: colors,
          ),
        ],
      ],
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
        // Star rating
        Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(5, (i) {
            return Padding(
              padding: const EdgeInsets.only(right: 1),
              child: Icon(
                i < review.rating
                    ? Icons.star_rounded
                    : Icons.star_border_rounded,
                color: colors.flare,
                size: 14,
              ),
            );
          }),
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

class _FallbackReviewItem extends StatelessWidget {
  final String name;
  final String date;
  final double rating;
  final String text;
  final KaipaColors colors;

  const _FallbackReviewItem({
    required this.name,
    required this.date,
    required this.rating,
    required this.text,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
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
                  name.isNotEmpty ? name[0] : '?',
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
                name,
                style: TextStyle(
                  color: colors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              date,
              style: TextStyle(
                color: colors.inkDim,
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        // Star rating
        Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(5, (i) {
            final filled = i < rating.floor() ||
                (i == rating.floor() && rating % 1 >= 0.5);
            return Padding(
              padding: const EdgeInsets.only(right: 1),
              child: Icon(
                filled ? Icons.star_rounded : Icons.star_border_rounded,
                color: colors.flare,
                size: 14,
              ),
            );
          }),
        ),
        const SizedBox(height: 6),
        Opacity(
          opacity: 0.85,
          child: Text(
            text,
            style: TextStyle(
              color: colors.ink,
              fontSize: 13.5,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Sticky CTA ───────────────────────────────────────────────────────

class _StickyCTA extends StatelessWidget {
  final KaipaColors colors;
  final double bottomPadding;
  final String routeId;

  const _StickyCTA({
    required this.colors,
    required this.bottomPadding,
    required this.routeId,
  });

  @override
  Widget build(BuildContext context) {
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
      child: GestureDetector(
        onTap: () => context.push('/gear/pick/$routeId'),
        child: Container(
          height: 54,
          decoration: BoxDecoration(
            color: colors.flare,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: colors.flare.withAlpha(60),
                offset: const Offset(0, 4),
                blurRadius: 16,
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const KaipaIcon(
                name: KaipaIcons.navigate,
                size: 18,
                color: Colors.white,
              ),
              const SizedBox(width: 8),
              const Text(
                '准备出发 · 选择装备',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
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
