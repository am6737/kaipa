import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/diff_badge.dart';

// ─── Demo data ────────────────────────────────────────────────────────

class _DemoRoute {
  final String name;
  final double distanceKm;
  final int elevationGainM;
  final String duration;
  final String difficulty;
  final double rating;
  final String region;
  final int distFromUserKm;

  const _DemoRoute({
    required this.name,
    required this.distanceKm,
    required this.elevationGainM,
    required this.duration,
    required this.difficulty,
    required this.rating,
    required this.region,
    required this.distFromUserKm,
  });
}

const _demoRoutes = <_DemoRoute>[
  _DemoRoute(
    name: '箭扣长城',
    distanceKm: 11.4,
    elevationGainM: 680,
    duration: '5:20',
    difficulty: 'hard',
    rating: 4.7,
    region: '怀柔',
    distFromUserKm: 15,
  ),
  _DemoRoute(
    name: '云蒙山主峰',
    distanceKm: 7.3,
    elevationGainM: 620,
    duration: '4:00',
    difficulty: 'mod',
    rating: 4.5,
    region: '密云',
    distFromUserKm: 32,
  ),
  _DemoRoute(
    name: '海坨山纵走',
    distanceKm: 18.1,
    elevationGainM: 1240,
    duration: '8:30',
    difficulty: 'expert',
    rating: 4.9,
    region: '延庆',
    distFromUserKm: 65,
  ),
  _DemoRoute(
    name: '十三陵水库环线',
    distanceKm: 14.2,
    elevationGainM: 480,
    duration: '4:40',
    difficulty: 'easy',
    rating: 4.2,
    region: '昌平',
    distFromUserKm: 28,
  ),
  _DemoRoute(
    name: '香山公园主峰',
    distanceKm: 5.4,
    elevationGainM: 380,
    duration: '2:30',
    difficulty: 'easy',
    rating: 4.0,
    region: '海淀',
    distFromUserKm: 8,
  ),
];

// ─── Filter pill labels ───────────────────────────────────────────────

const _pillLabels = ['全部', '入门', '中等', '困难', '50km内'];

// ─── Search Screen ────────────────────────────────────────────────────

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  int _activeFilter = 0; // index into _pillLabels

  List<_DemoRoute> get _filteredRoutes {
    switch (_activeFilter) {
      case 1: // 入门
        return _demoRoutes.where((r) => r.difficulty == 'easy').toList();
      case 2: // 中等
        return _demoRoutes.where((r) => r.difficulty == 'mod').toList();
      case 3: // 困难
        return _demoRoutes
            .where((r) => r.difficulty == 'hard' || r.difficulty == 'expert')
            .toList();
      case 4: // 50km内
        return _demoRoutes.where((r) => r.distFromUserKm <= 50).toList();
      default: // 全部
        return _demoRoutes;
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routes = _filteredRoutes;
    final resultCount = routes.length;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Column(
        children: [
          // ── Top bar ──────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 54, 16, 0),
            child: Row(
              children: [
                CircleButton(
                  icon: 'back',
                  onTap: () => context.pop(),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      children: [
                        Icon(Icons.search, size: 15, color: colors.inkMuted),
                        const SizedBox(width: 8),
                        Text(
                          '北京 周末 一日',
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 14,
                            letterSpacing: -0.2,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          '32 条',
                          style: TextStyle(
                            color: colors.inkDim,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 14),

          // ── Filter pills ─────────────────────────────────────────
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _pillLabels.length + 1, // +1 for filter button
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (context, index) {
                if (index < _pillLabels.length) {
                  final label = _pillLabels[index];
                  final isActive = index == _activeFilter;
                  return GestureDetector(
                    onTap: () => setState(() => _activeFilter = index),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: isActive ? colors.flareSoft : colors.surface,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: isActive ? colors.flare : colors.line,
                          width: 0.5,
                        ),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          color: isActive ? colors.flare : colors.ink,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ),
                  );
                }
                // Filter (筛选) button at end
                return GestureDetector(
                  onTap: () {},
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.tune, size: 12.5, color: colors.inkMuted),
                        const SizedBox(width: 4),
                        Text(
                          '筛选',
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            letterSpacing: -0.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // ── Sort row ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                Text(
                  '找到 $resultCount 条线路 · 距你 0–80km',
                  style: TextStyle(
                    color: colors.inkMuted,
                    fontSize: 11.5,
                  ),
                ),
                const Spacer(),
                Text(
                  '最近',
                  style: TextStyle(
                    color: colors.ink,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 2),
                Icon(Icons.chevron_right, size: 10, color: colors.ink),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // ── Result cards ─────────────────────────────────────────
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              itemCount: routes.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                return _SearchResultCard(
                  route: routes[index],
                  colors: colors,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Search Result Card ───────────────────────────────────────────────

class _SearchResultCard extends StatelessWidget {
  final _DemoRoute route;
  final KaipaColors colors;

  const _SearchResultCard({required this.route, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          // ── Mini map ───────────────────────────────────────────
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 96,
              height: 96,
              child: CustomPaint(
                size: const Size(96, 96),
                painter: _MiniMapPainter(
                  terrainColors: colors.terrain,
                  trailColor: colors.flare,
                  startColor: colors.moss,
                  endColor: colors.flare,
                  seed: route.name.hashCode,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),

          // ── Right column ───────────────────────────────────────
          Expanded(
            child: SizedBox(
              height: 96,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Top row: name + rating
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          route.name,
                          style: TextStyle(
                            color: colors.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            letterSpacing: -0.3,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '★ ${route.rating.toStringAsFixed(1)}',
                        style: TextStyle(
                          color: colors.flare,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  // Region + distance (marginTop 2)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      '${route.region} · 距你 ${route.distFromUserKm}km',
                      style: TextStyle(
                        color: colors.inkMuted,
                        fontSize: 11.5,
                      ),
                    ),
                  ),
                  // Spacer pushes stats + badge to bottom
                  const Spacer(),
                  // Stats row (marginTop 8)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: [
                        Text(
                          '${route.distanceKm.toStringAsFixed(1)}km',
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '↑${route.elevationGainM}m',
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          route.duration,
                          style: TextStyle(
                            color: colors.inkMuted,
                            fontSize: 11,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                  ),
                  // DiffBadge (marginTop 6)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: DiffBadge(level: route.difficulty),
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

// ─── MiniMap Painter ──────────────────────────────────────────────────

class _MiniMapPainter extends CustomPainter {
  final KaipaTerrainColors terrainColors;
  final Color trailColor;
  final Color startColor;
  final Color endColor;
  final int seed;

  _MiniMapPainter({
    required this.terrainColors,
    required this.trailColor,
    required this.startColor,
    required this.endColor,
    required this.seed,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rng = math.Random(seed);
    final w = size.width;
    final h = size.height;

    // ── Terrain background ──────────────────────────────────────
    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, h),
      Paint()..color = terrainColors.base,
    );

    // Lowland region
    final lowland = Path()
      ..moveTo(0, h * (0.55 + rng.nextDouble() * 0.1))
      ..quadraticBezierTo(
        w * 0.25,
        h * (0.35 + rng.nextDouble() * 0.1),
        w * 0.5,
        h * (0.45 + rng.nextDouble() * 0.1),
      )
      ..quadraticBezierTo(
        w * 0.75,
        h * (0.55 + rng.nextDouble() * 0.1),
        w,
        h * (0.3 + rng.nextDouble() * 0.15),
      )
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(lowland, Paint()..color = terrainColors.lowland);

    // Mid-altitude band
    final mid = Path()
      ..moveTo(0, h * (0.65 + rng.nextDouble() * 0.1))
      ..quadraticBezierTo(
        w * 0.35,
        h * (0.5 + rng.nextDouble() * 0.1),
        w * 0.6,
        h * (0.6 + rng.nextDouble() * 0.08),
      )
      ..quadraticBezierTo(
        w * 0.85,
        h * (0.7 + rng.nextDouble() * 0.1),
        w,
        h * (0.5 + rng.nextDouble() * 0.1),
      )
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(mid, Paint()..color = terrainColors.mid);

    // ── Contour lines ────────────────────────────────────────────
    final contourPaint = Paint()
      ..color = terrainColors.contour
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6;

    for (int i = 0; i < 5; i++) {
      final yBase = h * (0.2 + i * 0.14);
      final contour = Path()
        ..moveTo(0, yBase + rng.nextDouble() * 8)
        ..quadraticBezierTo(
          w * 0.3,
          yBase - 6 + rng.nextDouble() * 12,
          w * 0.6,
          yBase + rng.nextDouble() * 10,
        )
        ..quadraticBezierTo(
          w * 0.85,
          yBase - 4 + rng.nextDouble() * 8,
          w,
          yBase + rng.nextDouble() * 6,
        );
      canvas.drawPath(contour, contourPaint);
    }

    // ── Trail path ───────────────────────────────────────────────
    final startX = w * (0.1 + rng.nextDouble() * 0.05);
    final startY = h * (0.7 + rng.nextDouble() * 0.1);
    final endX = w * (0.85 + rng.nextDouble() * 0.05);
    final endY = h * (0.25 + rng.nextDouble() * 0.1);
    final cp1x = w * (0.3 + rng.nextDouble() * 0.1);
    final cp1y = h * (0.4 + rng.nextDouble() * 0.15);
    final cp2x = w * (0.6 + rng.nextDouble() * 0.1);
    final cp2y = h * (0.5 + rng.nextDouble() * 0.15);

    final trail = Path()
      ..moveTo(startX, startY)
      ..cubicTo(cp1x, cp1y, cp2x, cp2y, endX, endY);

    canvas.drawPath(
      trail,
      Paint()
        ..color = trailColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0
        ..strokeCap = StrokeCap.round,
    );

    // Start dot (moss)
    canvas.drawCircle(
      Offset(startX, startY),
      3.5,
      Paint()..color = startColor,
    );

    // End dot (flare)
    canvas.drawCircle(
      Offset(endX, endY),
      3.5,
      Paint()..color = endColor,
    );
  }

  @override
  bool shouldRepaint(covariant _MiniMapPainter oldDelegate) {
    return trailColor != oldDelegate.trailColor || seed != oldDelegate.seed;
  }
}
