import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';

class TripCompleteScreen extends ConsumerStatefulWidget {
  final String tripId;
  const TripCompleteScreen({super.key, required this.tripId});

  @override
  ConsumerState<TripCompleteScreen> createState() => _TripCompleteScreenState();
}

class _TripCompleteScreenState extends ConsumerState<TripCompleteScreen> {
  int _rating = 4;
  final TextEditingController _feedbackController = TextEditingController();

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Hero gradient header
                _buildHeroHeader(colors),

                // 2. Stats card (overlapping hero by -40px)
                Transform.translate(
                  offset: const Offset(0, -40),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: _buildStatsCard(tokens, colors),
                  ),
                ),

                // Remaining sections with normal padding
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 3. Achievements section
                      _buildAchievementsSection(colors),
                      const SizedBox(height: 20),

                      // 4. Photo timeline
                      _buildPhotoTimeline(colors),
                      const SizedBox(height: 20),

                      // 5. Share section
                      _buildShareSection(tokens, colors),
                      const SizedBox(height: 20),

                      // 6. Rate route
                      _buildRateRouteSection(tokens, colors),
                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Bottom CTA (sticky)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _buildBottomCta(colors),
          ),
        ],
      ),
    );
  }

  // ─── 1. Hero gradient header ──────────────────────────────────────────
  Widget _buildHeroHeader(KaipaColors colors) {
    return SizedBox(
      height: 300,
      child: Stack(
        children: [
          // Gradient background: 135deg from mossDeep to flare with 0xCC opacity
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    colorWithOpacity(colors.mossDeep, 0.8),
                    colorWithOpacity(colors.flare, 0.8),
                  ],
                ),
              ),
            ),
          ),

          // Decorative trail SVG paths
          Positioned.fill(
            child: CustomPaint(
              painter: _TrailPathPainter(),
            ),
          ),

          // Bottom fade: 60px gradient from transparent to bg color
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 60,
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

          // Centered content (padding 70px top)
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.only(top: 70),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Check icon in 52px glass circle
                  ClipOval(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Container(
                        width: 52,
                        height: 52,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color.fromRGBO(255, 255, 255, 0.2),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.check_rounded,
                            size: 28,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // "行程完成" label
                  const Text(
                    '行程完成',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color.fromRGBO(255, 255, 255, 0.7),
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 6),

                  // Route name "箭扣长城"
                  const Text(
                    '箭扣长城',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.8,
                    ),
                  ),
                  const SizedBox(height: 6),

                  // Date: "2026.04.26 · 周六 · 06:12 — 11:30"
                  const Text(
                    '2026.04.26 · 周六 · 06:12 — 11:30',
                    style: TextStyle(
                      fontSize: 13,
                      color: Color.fromRGBO(255, 255, 255, 0.65),
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

  // ─── 2. Stats card ────────────────────────────────────────────────────
  Widget _buildStatsCard(KaipaTokens tokens, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(0, 0, 0, 0.08),
            blurRadius: 20,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // 4-column stat grid
          Row(
            children: [
              _statColumn('11.4', 'km', colors),
              _statColumn('680', 'm', colors),
              _statColumn('5:18', null, colors),
              _statColumn('4.2', 'km/h', colors),
            ],
          ),
          const SizedBox(height: 16),

          // Divider
          Container(
            height: 0.5,
            color: colors.lineSoft,
          ),
          const SizedBox(height: 14),

          // Label row: altitude icon + "海拔轨迹"
          Row(
            children: [
              KaipaIcon(
                name: KaipaIcons.altitude,
                size: 14,
                color: colors.inkMuted,
              ),
              const SizedBox(width: 4),
              Text(
                '海拔轨迹',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.inkMuted,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Mini elevation profile
          SizedBox(
            height: 64,
            width: double.infinity,
            child: CustomPaint(
              size: const Size(double.infinity, 64),
              painter: _ElevationProfilePainter(colors),
            ),
          ),
          const SizedBox(height: 6),

          // Range labels
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '730m 起点',
                style: TextStyle(
                  fontSize: 10,
                  color: colors.inkMuted,
                ),
              ),
              Text(
                '1410m 最高',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: colors.flare,
                ),
              ),
              Text(
                '1180m 终点',
                style: TextStyle(
                  fontSize: 10,
                  color: colors.inkMuted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statColumn(String value, String? unit, KaipaColors colors) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.5,
                  height: 1,
                ),
              ),
              if (unit != null) ...[
                const SizedBox(width: 2),
                Text(
                  unit,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  // ─── 3. Achievements section ──────────────────────────────────────────
  Widget _buildAchievementsSection(KaipaColors colors) {
    final achievements = [
      _AchievementData('登顶 1410m', KaipaIcons.mountain, true),
      _AchievementData('连续 3 周', KaipaIcons.flame, true),
      _AchievementData('首条 T3', KaipaIcons.star, true),
      _AchievementData('日出行者', KaipaIcons.moon, false),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '本次成就',
          padding: EdgeInsets.zero,
          trailing: Text(
            '3 个解锁',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: achievements.map((a) {
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _achievementBadge(a.name, a.icon, a.unlocked, colors),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _achievementBadge(
      String name, String iconName, bool unlocked, KaipaColors colors) {
    return Opacity(
      opacity: unlocked ? 1.0 : 0.4,
      child: AspectRatio(
        aspectRatio: 1,
        child: Container(
          decoration: BoxDecoration(
            color: unlocked ? colors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: colors.line,
              width: 0.5,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: unlocked ? colors.flareSoft : colors.lineSoft,
                ),
                child: Center(
                  child: KaipaIcon(
                    name: iconName,
                    size: 18,
                    color: unlocked ? colors.flare : colors.inkDim,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                name,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  color: unlocked ? colors.ink : colors.inkDim,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ─── 4. Photo timeline ────────────────────────────────────────────────
  Widget _buildPhotoTimeline(KaipaColors colors) {
    final spots = [
      _PhotoSpot('06:42', '北京结', colors.moss, colors.flare),
      _PhotoSpot('08:15', '鹰飞倒仰', colors.flare, colors.sand),
      _PhotoSpot('09:33', '天梯', colors.sky, colors.moss),
      _PhotoSpot('11:01', '九眼楼', colors.sand, colors.flare),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '沿途记录',
          padding: EdgeInsets.zero,
          trailing: Text(
            '4 张',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 170,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: spots.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final spot = spots[index];
              return _buildPhotoCard(spot, colors);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPhotoCard(_PhotoSpot spot, KaipaColors colors) {
    return SizedBox(
      width: 130,
      height: 170,
      child: Stack(
        children: [
          // Terrain gradient background
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(KaipaRadius.lg),
              child: CustomPaint(
                painter: _TerrainCardPainter(spot.colorA, spot.colorB),
              ),
            ),
          ),

          // Dark gradient overlay: transparent 40% -> rgba(0,0,0,0.6) 100%
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(KaipaRadius.lg),
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0.4, 1.0],
                  colors: [
                    Colors.transparent,
                    Color.fromRGBO(0, 0, 0, 0.6),
                  ],
                ),
              ),
            ),
          ),

          // Time badge at top-left: glass dark bg
          Positioned(
            top: 8,
            left: 8,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(0, 0, 0, 0.35),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    spot.time,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ),

          // Spot name at bottom-left
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: Text(
              spot.name,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── 5. Share section ─────────────────────────────────────────────────
  Widget _buildShareSection(KaipaTokens tokens, KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '分享这次旅程',
          padding: EdgeInsets.zero,
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Column(
            children: [
              // KAIPA WRAPPED gradient card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      colors.mossDeep,
                      colorWithOpacity(colors.flare, 0.73), // +bb ~ 73%
                    ],
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'KAIPA WRAPPED',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withAlpha(191), // 0.75
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '箭扣长城 · 11.4km',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '2026.04.26 · 5 小时 18 分 · ↑680m',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white.withAlpha(179), // 0.7
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // 2-column button grid (gap 10)
              Row(
                children: [
                  // "分享给朋友" button
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: ElevatedButton.icon(
                        onPressed: () {},
                        icon: const KaipaIcon(
                          name: KaipaIcons.share,
                          size: 16,
                          color: Colors.white,
                        ),
                        label: const Text('分享给朋友'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: colors.flare,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),

                  // "保存图片" button
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: OutlinedButton.icon(
                        onPressed: () {},
                        icon: KaipaIcon(
                          name: KaipaIcons.download,
                          size: 16,
                          color: colors.ink,
                        ),
                        label: Text(
                          '保存图片',
                          style: TextStyle(color: colors.ink),
                        ),
                        style: OutlinedButton.styleFrom(
                          backgroundColor: colors.surface,
                          side: BorderSide(color: colors.line, width: 0.5),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ─── 6. Rate route ────────────────────────────────────────────────────
  Widget _buildRateRouteSection(KaipaTokens tokens, KaipaColors colors) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: [
          Text(
            '给这条路线评分',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: colors.ink,
            ),
          ),
          const SizedBox(height: 14),

          // 5 star circles (36px, gap 8)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _rating;
              return GestureDetector(
                onTap: () => setState(() => _rating = i + 1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: filled ? colors.flareSoft : colors.lineSoft,
                    ),
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.star,
                        size: 18,
                        color: filled ? colors.flare : colors.inkDim,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 14),

          // Textarea
          SizedBox(
            height: 68,
            child: TextField(
              controller: _feedbackController,
              maxLines: 3,
              minLines: 2,
              style: TextStyle(fontSize: 12.5, color: colors.ink),
              decoration: InputDecoration(
                hintText: '留下一句话给后来的人…',
                hintStyle: TextStyle(fontSize: 12.5, color: colors.inkDim),
                filled: true,
                fillColor: colors.bg,
                contentPadding: const EdgeInsets.all(12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: colors.flare, width: 1),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Bottom CTA (sticky) ─────────────────────────────────────────────
  Widget _buildBottomCta(KaipaColors colors) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0.0, 0.5, 1.0],
          colors: [
            colors.bg.withAlpha(0),
            colors.bg,
            colors.bg,
          ],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 34),
      child: SizedBox(
        width: double.infinity,
        height: 54,
        child: ElevatedButton(
          onPressed: () => context.go('/discover'),
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.ink,
            foregroundColor: colors.bg,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            textStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: const Text('完成 · 返回首页'),
        ),
      ),
    );
  }
}

// ─── Data classes ─────────────────────────────────────────────────────
class _AchievementData {
  final String name;
  final String icon;
  final bool unlocked;
  const _AchievementData(this.name, this.icon, this.unlocked);
}

class _PhotoSpot {
  final String time;
  final String name;
  final Color colorA;
  final Color colorB;
  const _PhotoSpot(this.time, this.name, this.colorA, this.colorB);
}

// ─── Custom painters ──────────────────────────────────────────────────

/// Decorative winding trail paths drawn over the hero gradient header.
/// Dashed path: strokeWidth 3, strokeDasharray "8 6"
/// Solid path: strokeWidth 2
class _TrailPathPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Dashed path: white, opacity 0.12, strokeWidth 3
    final dashedPaint = Paint()
      ..color = const Color.fromRGBO(255, 255, 255, 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final dashedPath = Path()
      ..moveTo(size.width * -0.05, size.height * 0.85)
      ..cubicTo(
        size.width * 0.1, size.height * 0.6,
        size.width * 0.2, size.height * 0.35,
        size.width * 0.35, size.height * 0.45,
      )
      ..cubicTo(
        size.width * 0.5, size.height * 0.55,
        size.width * 0.45, size.height * 0.75,
        size.width * 0.6, size.height * 0.65,
      )
      ..cubicTo(
        size.width * 0.75, size.height * 0.55,
        size.width * 0.7, size.height * 0.25,
        size.width * 0.85, size.height * 0.2,
      )
      ..cubicTo(
        size.width * 1.0, size.height * 0.15,
        size.width * 1.05, size.height * 0.35,
        size.width * 1.1, size.height * 0.1,
      );

    // Draw dashed: dash 8, gap 6
    _drawDashedPath(canvas, dashedPath, dashedPaint, 8.0, 6.0);

    // Solid path: white, opacity 0.12, strokeWidth 2
    final solidPaint = Paint()
      ..color = const Color.fromRGBO(255, 255, 255, 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    final solidPath = Path()
      ..moveTo(size.width * -0.1, size.height * 0.5)
      ..cubicTo(
        size.width * 0.15, size.height * 0.3,
        size.width * 0.3, size.height * 0.6,
        size.width * 0.5, size.height * 0.4,
      )
      ..cubicTo(
        size.width * 0.7, size.height * 0.2,
        size.width * 0.8, size.height * 0.5,
        size.width * 1.1, size.height * 0.3,
      );

    canvas.drawPath(solidPath, solidPaint);
  }

  void _drawDashedPath(
      Canvas canvas, Path path, Paint paint, double dashLen, double gapLen) {
    for (final metric in path.computeMetrics()) {
      double distance = 0.0;
      while (distance < metric.length) {
        final end = (distance + dashLen).clamp(0.0, metric.length);
        final segment = metric.extractPath(distance, end);
        canvas.drawPath(segment, paint);
        distance += dashLen + gapLen;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Mini elevation profile for the stats card.
/// Gradient fill (flare, 0.25 -> 0) + line stroke (flare, 1.5px).
/// Start circle (3px, moss) + end circle (3px, flare).
class _ElevationProfilePainter extends CustomPainter {
  final KaipaColors colors;
  _ElevationProfilePainter(this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    // The elevation curve path
    Path makeCurve() {
      return Path()
        ..moveTo(0, size.height * 0.75)
        ..cubicTo(
          size.width * 0.12, size.height * 0.60,
          size.width * 0.2, size.height * 0.40,
          size.width * 0.3, size.height * 0.30,
        )
        ..cubicTo(
          size.width * 0.38, size.height * 0.22,
          size.width * 0.42, size.height * 0.15,
          size.width * 0.5, size.height * 0.12,
        )
        ..cubicTo(
          size.width * 0.58, size.height * 0.09,
          size.width * 0.62, size.height * 0.18,
          size.width * 0.7, size.height * 0.25,
        )
        ..cubicTo(
          size.width * 0.78, size.height * 0.32,
          size.width * 0.85, size.height * 0.40,
          size.width * 0.92, size.height * 0.50,
        )
        ..lineTo(size.width, size.height * 0.55);
    }

    // Gradient fill (flare 0.25 -> 0)
    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          colorWithOpacity(colors.flare, 0.25),
          colorWithOpacity(colors.flare, 0.0),
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..style = PaintingStyle.fill;

    final fillPath = makeCurve()
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(fillPath, fillPaint);

    // Stroke line (flare, 1.5px)
    final strokePaint = Paint()
      ..color = colors.flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(makeCurve(), strokePaint);

    // Start circle (3px radius, moss)
    final startPoint = Offset(0, size.height * 0.75);
    canvas.drawCircle(
        startPoint,
        3,
        Paint()
          ..color = colors.moss
          ..style = PaintingStyle.fill);

    // End circle (3px radius, flare)
    final endPoint = Offset(size.width, size.height * 0.55);
    canvas.drawCircle(
        endPoint,
        3,
        Paint()
          ..color = colors.flare
          ..style = PaintingStyle.fill);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Terrain gradient background for photo timeline cards.
class _TerrainCardPainter extends CustomPainter {
  final Color colorA;
  final Color colorB;
  _TerrainCardPainter(this.colorA, this.colorB);

  @override
  void paint(Canvas canvas, Size size) {
    // Base gradient
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [colorA, colorB],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // Decorative terrain ridges
    final ridgePaint = Paint()
      ..color = const Color.fromRGBO(255, 255, 255, 0.08)
      ..style = PaintingStyle.fill;

    final ridge = Path()
      ..moveTo(0, size.height * 0.55)
      ..cubicTo(
        size.width * 0.25, size.height * 0.35,
        size.width * 0.5, size.height * 0.45,
        size.width * 0.75, size.height * 0.30,
      )
      ..lineTo(size.width, size.height * 0.40)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(ridge, ridgePaint);

    final ridge2 = Path()
      ..moveTo(0, size.height * 0.70)
      ..cubicTo(
        size.width * 0.3, size.height * 0.55,
        size.width * 0.6, size.height * 0.65,
        size.width, size.height * 0.50,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    final ridge2Paint = Paint()
      ..color = const Color.fromRGBO(255, 255, 255, 0.05)
      ..style = PaintingStyle.fill;
    canvas.drawPath(ridge2, ridge2Paint);
  }

  @override
  bool shouldRepaint(_TerrainCardPainter oldDelegate) =>
      oldDelegate.colorA != colorA || oldDelegate.colorB != colorB;
}
