import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── Demo forecast data ─────────────────────────────────────────────

class _ForecastDay {
  final String dayLabel;
  final String weekday;
  final String icon; // KaipaIcons name
  final int high;
  final int low;
  final String description;
  final int score;
  final bool isSelected;
  final bool isBad;

  const _ForecastDay({
    required this.dayLabel,
    required this.weekday,
    required this.icon,
    required this.high,
    required this.low,
    required this.description,
    required this.score,
    this.isSelected = false,
    this.isBad = false,
  });
}

const _forecastDays = <_ForecastDay>[
  _ForecastDay(
    dayLabel: '今天',
    weekday: '周五',
    icon: 'cloud',
    high: 14,
    low: 6,
    description: '小雨 · 山区雷阵雨',
    score: 42,
    isBad: true,
  ),
  _ForecastDay(
    dayLabel: '明天',
    weekday: '周六',
    icon: 'sun',
    high: 18,
    low: 9,
    description: '晴朗 · 微风',
    score: 87,
    isSelected: true,
  ),
  _ForecastDay(
    dayLabel: '后天',
    weekday: '周日',
    icon: 'sun',
    high: 17,
    low: 7,
    description: '晴 · 中午有云',
    score: 78,
  ),
];

// ─── Sun arc painter ────────────────────────────────────────────────

class _SunArcPainter extends CustomPainter {
  final Color flare;
  final Color water;
  final Color flareSoft;
  final Color lineColor;

  _SunArcPainter({
    required this.flare,
    required this.water,
    required this.flareSoft,
    required this.lineColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Map SVG viewBox (320x90) coordinates to actual size
    final sx = w / 320.0;
    final sy = h / 90.0;

    // 1. Baseline: rect at y=80, height 2
    final baselinePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.fill;
    canvas.drawRect(
      Rect.fromLTWH(0, 80 * sy, w, 2 * sy),
      baselinePaint,
    );

    // 2. Arc path: quadratic bezier "M0,80 Q160,-30 320,80"
    final arcPath = Path();
    arcPath.moveTo(0, 80 * sy);
    arcPath.quadraticBezierTo(160 * sx, -30 * sy, 320 * sx, 80 * sy);

    // 3. Gradient fill under the arc
    final fillPath = Path.from(arcPath);
    fillPath.lineTo(w, 80 * sy);
    fillPath.lineTo(0, 80 * sy);
    fillPath.close();

    final gradientShader = ui.Gradient.linear(
      Offset.zero,
      Offset(w, 0),
      [water, flareSoft, flare, flareSoft, water],
      [0.0, 0.25, 0.5, 0.75, 1.0],
    );

    final fillPaint = Paint()
      ..shader = gradientShader
      ..style = PaintingStyle.fill;

    // Apply 0.4 opacity via saveLayer
    canvas.saveLayer(
      Rect.fromLTWH(0, 0, w, h),
      Paint()..color = const Color.fromRGBO(255, 255, 255, 0.4),
    );
    canvas.drawPath(fillPath, fillPaint);
    canvas.restore();

    // 4. Arc stroke: flare, 1.5px
    final strokePaint = Paint()
      ..color = flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(arcPath, strokePaint);

    // 5. Recommended marker: dashed vertical line at x=40 from y=40 to y=80
    final markerX = 40 * sx;
    final markerTopY = 40 * sy;
    final markerBottomY = 80 * sy;

    final dashPaint = Paint()
      ..color = flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    // Draw dashed line (dash 2, gap 3)
    const dashLen = 2.0;
    const gapLen = 3.0;
    double dy = markerTopY;
    while (dy < markerBottomY) {
      final endY = math.min(dy + dashLen, markerBottomY);
      canvas.drawLine(Offset(markerX, dy), Offset(markerX, endY), dashPaint);
      dy += dashLen + gapLen;
    }

    // 6. Circle at (40,40): r=5, flare fill, white stroke 2px
    final circleFill = Paint()
      ..color = flare
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(markerX, markerTopY), 5, circleFill);

    final circleStroke = Paint()
      ..color = const Color(0xFFFFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawCircle(Offset(markerX, markerTopY), 5, circleStroke);
  }

  @override
  bool shouldRepaint(_SunArcPainter oldDelegate) {
    return oldDelegate.flare != flare ||
        oldDelegate.water != water ||
        oldDelegate.flareSoft != flareSoft ||
        oldDelegate.lineColor != lineColor;
  }
}

// ─── Weather screen ─────────────────────────────────────────────────

class WeatherScreen extends ConsumerWidget {
  final String routeId;
  const WeatherScreen({super.key, required this.routeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context, colors),
                const SizedBox(height: 16),
                _buildScoreCard(colors),
                const SizedBox(height: 20),
                _buildForecast(colors),
                const SizedBox(height: 20),
                _buildSunChart(colors),
              ],
            ),
          ),
          _buildCta(context, colors),
        ],
      ),
    );
  }

  // ─── Header ─────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row: back + spacer + step indicator + spacer + ellipsis
          Row(
            children: [
              CircleButton(
                icon: KaipaIcons.back,
                onTap: () => context.pop(),
              ),
              const Spacer(),
              Text(
                '第 2 步 / 共 3 步',
                style: TextStyle(
                  fontSize: 12,
                  color: colors.inkMuted,
                ),
              ),
              const Spacer(),
              CircleButton(
                icon: KaipaIcons.ellipsis,
                onTap: () {},
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Route name
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              '箭扣长城',
              style: TextStyle(
                fontSize: 12,
                color: colors.inkMuted,
              ),
            ),
          ),
          // Title
          Text(
            '选择出发时间',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: colors.ink,
              letterSpacing: -0.7,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Score card ─────────────────────────────────────────────────────

  Widget _buildScoreCard(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: const Alignment(-1, -1), // 135deg: top-left to bottom-right
            end: const Alignment(1, 1),
            colors: [colors.flareSoft, colors.surface],
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            // Score circle
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: colors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colors.flare, width: 2),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '87',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: colors.flare,
                      letterSpacing: -1,
                      height: 1.1,
                    ),
                  ),
                  Text(
                    '分',
                    style: TextStyle(
                      fontSize: 8,
                      color: colors.inkMuted,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 14),
            // Description column
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '非常适合出行',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: colors.ink,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '周六晴朗少风 · 能见度好 · 山顶 12°C · 建议 5:30 出发观日出',
                    style: TextStyle(
                      fontSize: 12,
                      color: colors.inkMuted,
                      height: 1.5,
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

  // ─── 3-day forecast ─────────────────────────────────────────────────

  Widget _buildForecast(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '未来三天',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (int i = 0; i < _forecastDays.length; i++) ...[
                  _buildForecastRow(_forecastDays[i], colors),
                  if (i < _forecastDays.length - 1)
                    Divider(
                      height: 0.5,
                      thickness: 0.5,
                      color: colors.line,
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForecastRow(_ForecastDay day, KaipaColors colors) {
    // Score color: >70 flare, >50 diff.mod, else inkDim
    Color scoreColor;
    if (day.score > 70) {
      scoreColor = colors.flare;
    } else if (day.score > 50) {
      scoreColor = colors.diff.mod;
    } else {
      scoreColor = colors.inkDim;
    }

    final iconColor = day.isBad ? colors.inkMuted : colors.flare;
    final bgColor = day.isSelected ? colors.flareSoft : Colors.transparent;

    return Container(
      color: bgColor,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      child: Row(
        children: [
          // Weather icon
          KaipaIcon(
            name: day.icon,
            size: 22,
            color: iconColor,
          ),
          const SizedBox(width: 12),
          // Date + description column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${day.dayLabel} ${day.weekday}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: colors.ink,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  day.description,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Temp range (mono font)
          Text(
            '${day.high}°/${day.low}°',
            style: TextStyle(
              fontSize: 12,
              color: colors.ink,
              fontFamily: 'monospace',
              fontFamilyFallback: const ['Courier'],
            ),
          ),
          const SizedBox(width: 12),
          // Score
          Text(
            '${day.score}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: scoreColor,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Sun chart ──────────────────────────────────────────────────────

  Widget _buildSunChart(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '周六 · 时段建议',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: colors.ink,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Column(
              children: [
                // SVG-like custom paint (viewBox 0 0 320 90)
                AspectRatio(
                  aspectRatio: 320 / 90,
                  child: CustomPaint(
                    painter: _SunArcPainter(
                      flare: colors.flare,
                      water: colors.terrain.water,
                      flareSoft: colors.flareSoft,
                      lineColor: colors.line,
                    ),
                    size: Size.infinite,
                  ),
                ),
                const SizedBox(height: 12),
                // Labels row
                Row(
                  children: [
                    Text(
                      '日出 5:42',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                        fontFamily: 'monospace',
                        fontFamilyFallback: const ['Courier'],
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '建议出发 5:30',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: colors.flare,
                        fontFamily: 'monospace',
                        fontFamilyFallback: const ['Courier'],
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '日落 18:54',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.inkMuted,
                        fontFamily: 'monospace',
                        fontFamilyFallback: const ['Courier'],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── CTA button ─────────────────────────────────────────────────────

  Widget _buildCta(BuildContext context, KaipaColors colors) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              colors.bg.withAlpha(0),
              colors.bg,
            ],
            stops: const [0.0, 0.4],
          ),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        child: GestureDetector(
          onTap: () {
            context.push('/safety-confirm/$routeId');
          },
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
                const Text(
                  '下一步 · 安全确认',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 6),
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 16,
                  color: Colors.white,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
