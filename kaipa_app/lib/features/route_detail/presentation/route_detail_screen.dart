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
import '../../../core/widgets/section_title.dart';

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

  String get _difficultyLabel {
    switch (route.difficulty) {
      case 'easy':
        return '入门';
      case 'mod':
        return '中等';
      case 'hard':
        return '困难';
      case 'expert':
        return '专家';
      case 'extreme':
        return '极限';
      default:
        return '中等';
    }
  }

  String _formatDuration(Duration d) {
    if (d.inHours > 0) {
      final mins = d.inMinutes % 60;
      return mins > 0 ? '${d.inHours}h${mins}m' : '${d.inHours}h';
    }
    return '${d.inMinutes}m';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final textTheme = Theme.of(context).textTheme;
    final reviewsAsync = ref.watch(reviewsByRouteProvider(routeId));
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Stack(
      children: [
        // Scrollable content
        CustomScrollView(
          slivers: [
            // Hero map section
            SliverToBoxAdapter(
              child: _HeroSection(route: route, colors: colors),
            ),

            // Content sections
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Region subtitle
                  if (route.region != null) ...[
                    Text(
                      route.region!,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.flare,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                  ],

                  // Route name
                  Text(
                    route.name,
                    style: textTheme.displayMedium?.copyWith(
                      color: colors.ink,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Description
                  if (route.description != null) ...[
                    Text(
                      route.description!,
                      style: textTheme.bodyLarge?.copyWith(
                        color: colors.inkMuted,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Stats grid
                  _StatsGrid(
                    route: route,
                    colors: colors,
                    durationLabel: _formatDuration(route.estimatedDuration),
                    difficultyLabel: _difficultyLabel,
                  ),
                  const SizedBox(height: 20),

                  // Tags row
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      DiffBadge(
                        level: route.difficulty,
                      ),
                      if (route.difficultyGrade != null)
                        PillWidget(
                          child: Text(
                            route.difficultyGrade!,
                            style: TextStyle(color: colors.inkMuted),
                          ),
                        ),
                      ...route.tags.map(
                        (tag) => PillWidget(
                          child: Text(
                            tag,
                            style: TextStyle(color: colors.moss),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),

                  // Elevation profile
                  if (route.elevationProfile.isNotEmpty) ...[
                    const SectionTitle(title: '海拔剖面'),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 180,
                      child: CustomPaint(
                        size: Size.infinite,
                        painter: ElevationProfilePainter(
                          points: route.elevationProfile,
                          lineColor: colors.flare,
                          fillColor: colors.flareSoft,
                          gridColor: colors.lineSoft,
                          labelColor: colors.inkDim,
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],

                  // Photo spots
                  if (route.photoSpots.isNotEmpty) ...[
                    const SectionTitle(title: '拍照点'),
                    const SizedBox(height: 12),
                    ...route.photoSpots.asMap().entries.map((entry) {
                      final index = entry.key;
                      final spot = entry.value;
                      return _PhotoSpotItem(
                        index: index + 1,
                        spot: spot,
                        colors: colors,
                      );
                    }),
                    const SizedBox(height: 24),
                  ],

                  // Access method
                  if (route.accessMethod != null) ...[
                    const SectionTitle(title: '交通方式'),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(KaipaRadius.md),
                        border: Border.all(color: colors.lineSoft, width: 0.5),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.directions_bus_outlined,
                              color: colors.moss, size: 20),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              route.accessMethod!,
                              style: textTheme.bodyMedium?.copyWith(
                                color: colors.inkMuted,
                                height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],

                  // Reviews section
                  const SectionTitle(title: '评价'),
                  const SizedBox(height: 12),
                  reviewsAsync.when(
                    data: (reviews) {
                      if (reviews.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Center(
                            child: Text(
                              '暂无评价',
                              style: TextStyle(
                                color: colors.inkDim,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        );
                      }
                      return Column(
                        children: reviews.map((review) {
                          return _ReviewCard(
                            review: review,
                            colors: colors,
                          );
                        }).toList(),
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
                    error: (_, _) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: Text(
                          '评价加载失败',
                          style: TextStyle(
                            color: colors.inkDim,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                  ),

                  // Bottom spacing for sticky bar
                  SizedBox(height: 80 + bottomPadding),
                ]),
              ),
            ),
          ],
        ),

        // Floating back + heart + share buttons on top of hero
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 8,
          right: 8,
          child: Row(
            children: [
              _CircleButton(
                icon: Icons.arrow_back,
                colors: colors,
                onTap: () => context.pop(),
              ),
              const Spacer(),
              _CircleButton(
                icon: Icons.favorite_border,
                colors: colors,
                onTap: () {},
              ),
              const SizedBox(width: 8),
              _CircleButton(
                icon: Icons.share_outlined,
                colors: colors,
                onTap: () {},
              ),
            ],
          ),
        ),

        // Bottom sticky bar
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            padding: EdgeInsets.fromLTRB(20, 14, 20, 14 + bottomPadding),
            decoration: BoxDecoration(
              color: colors.bg,
              border: Border(
                top: BorderSide(color: colors.lineSoft, width: 0.5),
              ),
            ),
            child: Row(
              children: [
                // Weather button
                Expanded(
                  flex: 1,
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/weather/$routeId'),
                    icon: Icon(Icons.wb_sunny_outlined, size: 18, color: colors.flare),
                    label: Text(
                      '查看天气',
                      style: TextStyle(color: colors.flare, fontSize: 14),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: colors.flare),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(KaipaRadius.md),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // Navigate button
                Expanded(
                  flex: 2,
                  child: ElevatedButton.icon(
                    onPressed: () => context.push('/navigate/$routeId'),
                    icon: const Icon(Icons.navigation_outlined, size: 18),
                    label: const Text(
                      '开始导航',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: colors.flare,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(KaipaRadius.md),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
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
      height: 300,
      child: Stack(
        children: [
          // Map
          FlutterMap(
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
          // Gradient fade at bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
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

// ─── Stats Grid ────────────────────────────────────────────────────────

class _StatsGrid extends StatelessWidget {
  final RouteModel route;
  final KaipaColors colors;
  final String durationLabel;
  final String difficultyLabel;

  const _StatsGrid({
    required this.route,
    required this.colors,
    required this.durationLabel,
    required this.difficultyLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.lineSoft, width: 0.5),
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
          _VerticalDivider(color: colors.lineSoft),
          Expanded(
            child: StatWidget(
              label: '爬升',
              value: '${route.elevationGainM.toInt()}',
              unit: 'm',
            ),
          ),
          _VerticalDivider(color: colors.lineSoft),
          Expanded(
            child: StatWidget(
              label: '时长',
              value: durationLabel,
            ),
          ),
          _VerticalDivider(color: colors.lineSoft),
          Expanded(
            child: StatWidget(
              label: '难度',
              value: difficultyLabel,
            ),
          ),
        ],
      ),
    );
  }
}

class _VerticalDivider extends StatelessWidget {
  final Color color;
  const _VerticalDivider({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 0.5,
      height: 40,
      color: color,
    );
  }
}

// ─── Circle Button ─────────────────────────────────────────────────────

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _CircleButton({
    required this.icon,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: colors.glass,
          shape: BoxShape.circle,
        ),
        child: Center(
          child: Icon(icon, color: colors.ink, size: 20),
        ),
      ),
    );
  }
}

// ─── Photo Spot Item ───────────────────────────────────────────────────

class _PhotoSpotItem extends StatelessWidget {
  final int index;
  final PhotoSpot spot;
  final KaipaColors colors;

  const _PhotoSpotItem({
    required this.index,
    required this.spot,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Number badge
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: colors.flareSoft,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '$index',
                style: TextStyle(
                  color: colors.flare,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  spot.name,
                  style: TextStyle(
                    color: colors.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (spot.description != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    spot.description!,
                    style: TextStyle(
                      color: colors.inkMuted,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Review Card ───────────────────────────────────────────────────────

class _ReviewCard extends StatelessWidget {
  final ReviewModel review;
  final KaipaColors colors;

  const _ReviewCard({required this.review, required this.colors});

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.md),
        border: Border.all(color: colors.lineSoft, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: user + date
          Row(
            children: [
              // Avatar placeholder
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: colors.flareSoft,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Icon(
                    Icons.person,
                    color: colors.flare,
                    size: 18,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      review.userId.length > 8
                          ? '${review.userId.substring(0, 8)}...'
                          : review.userId,
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      _formatDate(review.createdAt),
                      style: TextStyle(
                        color: colors.inkDim,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              // Rating stars
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(5, (i) {
                  return Icon(
                    i < review.rating
                        ? Icons.star_rounded
                        : Icons.star_border_rounded,
                    color: colors.sand,
                    size: 14,
                  );
                }),
              ),
            ],
          ),
          // Content
          if (review.content != null && review.content!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              review.content!,
              style: TextStyle(
                color: colors.inkMuted,
                fontSize: 13,
                height: 1.5,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Elevation Profile Painter ─────────────────────────────────────────

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
    if (points.isEmpty) return;

    const leftPadding = 44.0;
    const rightPadding = 12.0;
    const topPadding = 16.0;
    const bottomPadding = 24.0;

    final chartWidth = size.width - leftPadding - rightPadding;
    final chartHeight = size.height - topPadding - bottomPadding;

    if (chartWidth <= 0 || chartHeight <= 0) return;

    // Find data bounds
    double minElev = double.infinity;
    double maxElev = double.negativeInfinity;
    double maxDist = 0;

    for (final p in points) {
      if (p.elevation < minElev) minElev = p.elevation;
      if (p.elevation > maxElev) maxElev = p.elevation;
      if (p.distance > maxDist) maxDist = p.distance;
    }

    if (maxDist == 0) return;

    // Add some padding to elevation range
    final elevRange = maxElev - minElev;
    final paddedMin = minElev - elevRange * 0.1;
    final paddedMax = maxElev + elevRange * 0.1;
    final paddedRange = paddedMax - paddedMin;

    if (paddedRange == 0) return;

    // Draw horizontal grid lines
    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 0.5;

    final labelStyle = TextStyle(
      color: labelColor,
      fontSize: 10,
      fontWeight: FontWeight.w500,
    );

    const gridLines = 4;
    for (int i = 0; i <= gridLines; i++) {
      final y = topPadding + chartHeight * (1 - i / gridLines);
      canvas.drawLine(
        Offset(leftPadding, y),
        Offset(size.width - rightPadding, y),
        gridPaint,
      );

      // Elevation label
      final elev = paddedMin + paddedRange * (i / gridLines);
      final tp = TextPainter(
        text: TextSpan(text: '${elev.toInt()}m', style: labelStyle),
        textDirection: TextDirection.ltr,
      );
      tp.layout();
      tp.paint(canvas, Offset(leftPadding - tp.width - 6, y - tp.height / 2));
    }

    // Map points to screen coordinates
    final screenPoints = points.map((p) {
      final x = leftPadding + (p.distance / maxDist) * chartWidth;
      final y = topPadding + chartHeight * (1 - (p.elevation - paddedMin) / paddedRange);
      return Offset(x, y);
    }).toList();

    // Draw filled area
    final fillPath = Path();
    fillPath.moveTo(screenPoints.first.dx, topPadding + chartHeight);
    for (final pt in screenPoints) {
      fillPath.lineTo(pt.dx, pt.dy);
    }
    fillPath.lineTo(screenPoints.last.dx, topPadding + chartHeight);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          fillColor,
          fillColor.withAlpha(20),
        ],
      ).createShader(Rect.fromLTWH(leftPadding, topPadding, chartWidth, chartHeight));
    canvas.drawPath(fillPath, fillPaint);

    // Draw line on top
    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final linePath = Path();
    linePath.moveTo(screenPoints.first.dx, screenPoints.first.dy);
    for (int i = 1; i < screenPoints.length; i++) {
      linePath.lineTo(screenPoints[i].dx, screenPoints[i].dy);
    }
    canvas.drawPath(linePath, linePaint);

    // Min/max elevation markers
    double minY = double.infinity;
    double maxY = double.negativeInfinity;
    Offset? minPt;
    Offset? maxPt;
    double minElevVal = 0;
    double maxElevVal = 0;

    for (int i = 0; i < screenPoints.length; i++) {
      if (screenPoints[i].dy < minY) {
        minY = screenPoints[i].dy;
        maxPt = screenPoints[i]; // highest elevation = lowest Y
        maxElevVal = points[i].elevation;
      }
      if (screenPoints[i].dy > maxY) {
        maxY = screenPoints[i].dy;
        minPt = screenPoints[i];
        minElevVal = points[i].elevation;
      }
    }

    // Draw max elevation label
    if (maxPt != null) {
      final dotPaint = Paint()..color = lineColor;
      canvas.drawCircle(maxPt, 4, dotPaint);
      canvas.drawCircle(maxPt, 3, Paint()..color = Colors.white);

      final tp = TextPainter(
        text: TextSpan(
          text: '${maxElevVal.toInt()}m',
          style: labelStyle.copyWith(
            color: lineColor,
            fontWeight: FontWeight.w700,
            fontSize: 11,
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      tp.layout();
      final labelX = (maxPt.dx - tp.width / 2)
          .clamp(leftPadding, size.width - rightPadding - tp.width);
      tp.paint(canvas, Offset(labelX, maxPt.dy - tp.height - 8));
    }

    // Draw min elevation label
    if (minPt != null && minPt != maxPt) {
      final dotPaint = Paint()..color = gridColor;
      canvas.drawCircle(minPt, 3, dotPaint);

      final tp = TextPainter(
        text: TextSpan(
          text: '${minElevVal.toInt()}m',
          style: labelStyle.copyWith(fontSize: 10),
        ),
        textDirection: TextDirection.ltr,
      );
      tp.layout();
      final labelX = (minPt.dx - tp.width / 2)
          .clamp(leftPadding, size.width - rightPadding - tp.width);
      tp.paint(canvas, Offset(labelX, minPt.dy + 6));
    }
  }

  @override
  bool shouldRepaint(covariant ElevationProfilePainter oldDelegate) {
    return points != oldDelegate.points ||
        lineColor != oldDelegate.lineColor ||
        fillColor != oldDelegate.fillColor;
  }
}
