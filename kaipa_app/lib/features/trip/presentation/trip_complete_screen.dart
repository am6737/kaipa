import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/trip_repository.dart';
import '../domain/trip_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/stat_widget.dart';

class TripCompleteScreen extends ConsumerStatefulWidget {
  final String tripId;
  const TripCompleteScreen({super.key, required this.tripId});

  @override
  ConsumerState<TripCompleteScreen> createState() => _TripCompleteScreenState();
}

class _TripCompleteScreenState extends ConsumerState<TripCompleteScreen> {
  int _rating = 0;

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final tripAsync = ref.watch(tripByIdProvider(widget.tripId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: tripAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.ink))),
        data: (trip) => _buildContent(trip, tokens, colors),
      ),
    );
  }

  Widget _buildContent(TripModel trip, KaipaTokens tokens, KaipaColors colors) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const SizedBox(height: 20),
            // Celebration header
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.mossSoft,
              ),
              child: Icon(Icons.check_rounded, size: 44, color: colors.moss),
            ),
            const SizedBox(height: 16),
            Text('行程完成！', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.5)),
            const SizedBox(height: 6),
            Text(
              '${trip.startedAt.month}月${trip.startedAt.day}日',
              style: TextStyle(fontSize: 14, color: colors.inkMuted),
            ),
            const SizedBox(height: 24),

            // Stats grid
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(child: StatWidget(value: trip.actualDistanceKm?.toStringAsFixed(1) ?? '-', unit: 'km', label: '距离', tokens: tokens)),
                      Expanded(child: StatWidget(value: '${trip.actualElevationM?.round() ?? '-'}', unit: 'm', label: '爬升', tokens: tokens)),
                      Expanded(child: StatWidget(value: _formatDuration(trip.actualDuration), label: '时长', tokens: tokens)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: StatWidget(value: trip.avgSpeedKmh?.toStringAsFixed(1) ?? '-', unit: 'km/h', label: '均速', tokens: tokens)),
                      Expanded(child: StatWidget(value: '${trip.caloriesBurned ?? '-'}', unit: 'kcal', label: '消耗', tokens: tokens)),
                      Expanded(child: StatWidget(value: '${trip.steps ?? '-'}', label: '步数', tokens: tokens)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Elevation chart
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('海拔回放', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 80,
                    child: CustomPaint(
                      size: Size(double.infinity, 80),
                      painter: _ElevReplayPainter(colors),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Achievements
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('解锁成就', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _achievementBadge('首次登顶', Icons.flag, colors),
                        _achievementBadge('周末战士', Icons.terrain, colors),
                        _achievementBadge('百公里俱乐部', Icons.route, colors),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Wrapped sharing card
            GlassContainer(
              tokens: tokens,
              radius: 20,
              padding: const EdgeInsets.all(20),
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [colors.flareSoft, colors.surface],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text('KAIPA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: colors.flare, letterSpacing: 3)),
                    const SizedBox(height: 8),
                    Text('${trip.actualDistanceKm?.toStringAsFixed(1) ?? '0'} km', style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: colors.ink)),
                    Text(_formatDuration(trip.actualDuration), style: TextStyle(fontSize: 16, color: colors.inkMuted)),
                    const SizedBox(height: 8),
                    Text('${trip.startedAt.year}.${trip.startedAt.month}.${trip.startedAt.day}', style: TextStyle(fontSize: 12, color: colors.inkDim)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Rate this route
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Column(
                children: [
                  Text('为这条路线评分', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) => GestureDetector(
                      onTap: () => setState(() => _rating = i + 1),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Icon(
                          i < _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                          color: i < _rating ? colors.flare : colors.inkDim,
                          size: 36,
                        ),
                      ),
                    )),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Done button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => context.go('/discover'),
                child: const Text('完成'),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _achievementBadge(String name, IconData icon, KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Column(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.flareSoft,
            ),
            child: Icon(icon, size: 22, color: colors.flare),
          ),
          const SizedBox(height: 6),
          Text(name, style: TextStyle(fontSize: 10, color: colors.inkMuted)),
        ],
      ),
    );
  }

  String _formatDuration(Duration? d) {
    if (d == null) return '--:--';
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return h > 0 ? '${h}h ${m}min' : '${m}min';
  }
}

class _ElevReplayPainter extends CustomPainter {
  final KaipaColors colors;
  _ElevReplayPainter(this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colors.flare.withAlpha(40)
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(0, size.height * 0.7)
      ..cubicTo(size.width * 0.15, size.height * 0.5, size.width * 0.25, size.height * 0.3, size.width * 0.4, size.height * 0.2)
      ..cubicTo(size.width * 0.55, size.height * 0.1, size.width * 0.65, size.height * 0.15, size.width * 0.75, size.height * 0.3)
      ..cubicTo(size.width * 0.85, size.height * 0.45, size.width * 0.95, size.height * 0.5, size.width, size.height * 0.6)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);

    final linePaint = Paint()
      ..color = colors.flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final linePath = Path()
      ..moveTo(0, size.height * 0.7)
      ..cubicTo(size.width * 0.15, size.height * 0.5, size.width * 0.25, size.height * 0.3, size.width * 0.4, size.height * 0.2)
      ..cubicTo(size.width * 0.55, size.height * 0.1, size.width * 0.65, size.height * 0.15, size.width * 0.75, size.height * 0.3)
      ..cubicTo(size.width * 0.85, size.height * 0.45, size.width * 0.95, size.height * 0.5, size.width, size.height * 0.6);
    canvas.drawPath(linePath, linePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
