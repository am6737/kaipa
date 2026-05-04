import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../data/trip_repository.dart';
import '../domain/trip_model.dart';

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
    final tripAsync = ref.watch(tripByIdProvider(widget.tripId));
    final trip = tripAsync.valueOrNull;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeroHeader(colors, trip),
                Transform.translate(
                  offset: const Offset(0, -40),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildStatsCard(tokens, colors, trip),
                        const SizedBox(height: 20),
                        _buildNotesInput(colors),
                        const SizedBox(height: 20),
                        _buildPhotoTimeline(colors, trip),
                        const SizedBox(height: 20),
                        _buildShareSection(tokens, colors, trip),
                        const SizedBox(height: 260),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
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
  Widget _buildHeroHeader(KaipaColors colors, TripModel? trip) {
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
                  ClipOval(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: colorWithOpacity(Colors.white, 0.2),
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

                  Text(
                    '行程完成',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colorWithOpacity(Colors.white, 0.7),
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 6),

                  Text(
                    trip?.routeName ?? '--',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.8,
                    ),
                  ),
                  const SizedBox(height: 6),

                  Text(
                    _formatTripDateRange(trip),
                    style: TextStyle(
                      fontSize: 13,
                      color: colorWithOpacity(Colors.white, 0.65),
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
  static const _weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return '$h:${m.toString().padLeft(2, '0')}';
  }

  String _formatDate(DateTime dt) {
    return '${dt.year}.${dt.month.toString().padLeft(2, '0')}.${dt.day.toString().padLeft(2, '0')}';
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  String _formatTripDateRange(TripModel? trip) {
    if (trip == null) return '--';
    final date = _formatDate(trip.startedAt);
    final weekday = _weekdays[trip.startedAt.weekday - 1];
    final start = _formatTime(trip.startedAt);
    final end = trip.finishedAt != null ? _formatTime(trip.finishedAt!) : '--:--';
    return '$date · $weekday · $start — $end';
  }

  String _formatDurationChinese(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0 && m > 0) return '$h 小时 $m 分';
    if (h > 0) return '$h 小时';
    return '$m 分钟';
  }

  String _formatShareSubtitle(TripModel? trip) {
    if (trip == null) return '--';
    final date = _formatDate(trip.startedAt);
    final duration = trip.actualDuration != null
        ? _formatDurationChinese(trip.actualDuration!)
        : '--';
    final elevation = trip.actualElevationM?.toInt().toString() ?? '--';
    return '$date · $duration · ↑${elevation}m';
  }

  Widget _buildStatsCard(KaipaTokens tokens, KaipaColors colors, TripModel? trip) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: [
          BoxShadow(
            color: colorWithOpacity(colors.ink, 0.08),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // 4-column stat grid
          Row(
            children: [
              _statColumn(trip?.actualDistanceKm?.toStringAsFixed(1) ?? '--', 'km', colors),
              _statColumn(trip?.actualElevationM?.toInt().toString() ?? '--', 'm', colors),
              _statColumn(trip?.actualDuration != null ? _formatDuration(trip!.actualDuration!) : '--', null, colors),
              _statColumn(trip?.avgSpeedKmh?.toStringAsFixed(1) ?? '--', 'km/h', colors),
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

          if (trip?.maxAltitudeM != null)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${trip!.maxAltitudeM!.toInt()}m 最高',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: colors.flare,
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

  // ─── 3. Notes input ────────────────────────────────────────────────────
  Widget _buildNotesInput(KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(title: '记录笔记', padding: EdgeInsets.zero),
        const SizedBox(height: 8),
        TextField(
          controller: _feedbackController,
          maxLines: 4,
          minLines: 2,
          style: TextStyle(fontSize: 13, color: colors.ink),
          decoration: InputDecoration(
            hintText: '记录这次徒步的感受、见闻…',
            hintStyle: TextStyle(fontSize: 13, color: colors.inkDim),
            filled: true,
            fillColor: colors.surface,
            contentPadding: const EdgeInsets.all(12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: colors.flare, width: 1),
            ),
          ),
        ),
      ],
    );
  }

  // ─── 4. Photo timeline ────────────────────────────────────────────────
  Widget _buildPhotoTimeline(KaipaColors colors, TripModel? trip) {
    final photos = trip?.photos ?? [];
    if (photos.isEmpty) return const SizedBox.shrink();

    final colorPairs = [
      (colors.moss, colors.flare),
      (colors.flare, colors.sand),
      (colors.sky, colors.moss),
      (colors.sand, colors.flare),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '沿途记录',
          padding: EdgeInsets.zero,
          trailing: Text(
            '${photos.length} 张',
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
            itemCount: photos.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final pair = colorPairs[index % colorPairs.length];
              return _buildPhotoCard(photos[index], pair.$1, pair.$2);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPhotoCard(String photoUrl, Color colorA, Color colorB) {
    return SizedBox(
      width: 130,
      height: 170,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        child: Stack(
          children: [
            Positioned.fill(
              child: Image.network(
                photoUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => CustomPaint(
                  painter: _TerrainCardPainter(colorA, colorB),
                ),
              ),
            ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0.4, 1.0],
                    colors: [
                      Colors.transparent,
                      colorWithOpacity(Colors.black, 0.4),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── 5. Share section ─────────────────────────────────────────────────
  Widget _buildShareSection(KaipaTokens tokens, KaipaColors colors, TripModel? trip) {
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
                        color: colorWithOpacity(Colors.white, 0.75),
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${trip?.routeName ?? '--'} · ${trip?.actualDistanceKm?.toStringAsFixed(1) ?? '--'}km',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _formatShareSubtitle(trip),
                      style: TextStyle(
                        fontSize: 11,
                        color: colorWithOpacity(Colors.white, 0.7),
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

  // ─── Bottom CTA (sticky) ─────────────────────────────────────────────
  Widget _buildBottomCta(KaipaColors colors) {
    final labels = ['夯', '顶级', '人上人', 'npc', '拉完了'];
    final ratingIndex = _rating.clamp(1, 5) - 1;

    return Container(
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Rating selector
          Text(
            '给这条路线评分',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.ink,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: List.generate(labels.length, (i) {
                final selected = i == ratingIndex;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _rating = i + 1),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      decoration: BoxDecoration(
                        color: selected
                            ? (i <= 2 ? colors.mossDeep : colors.flare)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(7),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        labels[i],
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : colors.inkMuted,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: () async {
                if (_rating > 0) {
                  try {
                    final tripRepo = ref.read(tripRepositoryProvider);
                    await tripRepo.rateTrip(
                      widget.tripId,
                      _rating,
                      _feedbackController.text.isEmpty
                          ? null
                          : _feedbackController.text,
                    );
                  } catch (_) {}
                }
                if (mounted) {
                  context.push('/route-publish?tripId=${widget.tripId}');
                }
              },
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
              child: const Text('发布路线'),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: TextButton(
              onPressed: () async {
                if (_rating > 0) {
                  try {
                    final tripRepo = ref.read(tripRepositoryProvider);
                    await tripRepo.rateTrip(
                      widget.tripId,
                      _rating,
                      _feedbackController.text.isEmpty
                          ? null
                          : _feedbackController.text,
                    );
                  } catch (_) {}
                }
                if (mounted) {
                  context.go('/discover');
                }
              },
              child: Text(
                '跳过',
                style: TextStyle(
                  fontSize: 14,
                  color: colors.inkMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
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
