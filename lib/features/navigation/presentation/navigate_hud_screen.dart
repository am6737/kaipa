import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import '../../discover/data/route_repository.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/kaipa_icons.dart';

class NavigateHudScreen extends ConsumerStatefulWidget {
  final String routeId;
  const NavigateHudScreen({super.key, required this.routeId});

  @override
  ConsumerState<NavigateHudScreen> createState() => _NavigateHudScreenState();
}

class _NavigateHudScreenState extends ConsumerState<NavigateHudScreen> {
  Timer? _timer;
  int _elapsedSeconds = 0;
  bool _isPaused = false;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_isPaused) setState(() => _elapsedSeconds++);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatTime(int seconds) {
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  void _showSosDialog() {
    final tokens = ref.read(kaipaTokensProvider);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: tokens.color.surface,
        title: Text('确认发送紧急求助？',
            style: TextStyle(color: tokens.color.ink)),
        content: Text('这将向你的紧急联系人发送你的当前位置信息。',
            style: TextStyle(color: tokens.color.inkMuted)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('取消',
                style: TextStyle(color: tokens.color.inkMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626)),
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('已发送紧急求助信息')),
              );
            },
            child: const Text('确认求助'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));

    return Scaffold(
      body: routeAsync.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => Center(
            child: Text('加载失败', style: TextStyle(color: colors.ink))),
        data: (route) => _buildHud(route, tokens, colors),
      ),
    );
  }

  Widget _buildHud(
      RouteModel route, KaipaTokens tokens, KaipaColors colors) {
    return Stack(
      children: [
        // Full-bleed map
        Positioned.fill(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: LatLng(route.latitude, route.longitude),
              initialZoom: 14,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all,
              ),
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.kaipa.app',
              ),
            ],
          ),
        ),

        // Top ribbon
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 16,
          right: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 18,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                // Back button
                CircleButton(
                  icon: KaipaIcons.back,
                  size: 32,
                  iconSize: 14,
                  tokens: tokens,
                  onTap: () => context.pop(),
                ),
                const SizedBox(width: 10),
                // Status + route column
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: colors.flare,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            '进行中 · ${_formatTime(_elapsedSeconds)}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: colors.flare,
                            ),
                          ),
                        ],
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(
                          '箭扣长城 → 鹰飞倒仰',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: colors.ink,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Participant badge
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    color: colors.mossSoft,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      KaipaIcon(
                        name: KaipaIcons.users,
                        size: 11,
                        color: colors.mossDeep,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        '2',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: colors.mossDeep,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // Right rail
        Positioned(
          top: 130,
          right: 16,
          child: Column(
            children: [
              // Zoom pill
              GlassContainer(
                tokens: tokens,
                radius: 14,
                padding: const EdgeInsets.all(4),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Plus button
                    SizedBox(
                      width: 36,
                      height: 36,
                      child: Center(
                        child: KaipaIcon(
                          name: KaipaIcons.plus,
                          size: 16,
                          color: colors.ink,
                        ),
                      ),
                    ),
                    // Divider
                    Padding(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6),
                      child: Container(
                        height: 0.5,
                        color: colors.line,
                      ),
                    ),
                    // Minus button
                    SizedBox(
                      width: 36,
                      height: 36,
                      child: Center(
                        child: Text(
                          '−',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: colors.ink,
                            height: 1,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Navigate pill
              GlassContainer(
                tokens: tokens,
                radius: 14,
                padding: const EdgeInsets.all(4),
                child: SizedBox(
                  width: 36,
                  height: 36,
                  child: Center(
                    child: KaipaIcon(
                      name: KaipaIcons.navigate,
                      size: 16,
                      color: colors.flare,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              // Layers pill
              GlassContainer(
                tokens: tokens,
                radius: 14,
                padding: const EdgeInsets.all(4),
                child: SizedBox(
                  width: 36,
                  height: 36,
                  child: Center(
                    child: KaipaIcon(
                      name: KaipaIcons.layers,
                      size: 16,
                      color: colors.ink,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Left elevation panel
        Positioned(
          top: 130,
          left: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 14,
            padding: const EdgeInsets.all(10),
            child: SizedBox(
              width: 58,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ELEV label
                  Text(
                    'ELEV',
                    style: TextStyle(
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: colors.inkMuted,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  // Elevation sparkline
                  SizedBox(
                    width: 56,
                    height: 38,
                    child: CustomPaint(
                      size: const Size(56, 38),
                      painter: _ElevSparklinePainter(colors),
                    ),
                  ),
                  // Range labels
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '0',
                          style: TextStyle(
                            fontSize: 9,
                            fontFamily: 'monospace',
                            color: colors.inkDim,
                          ),
                        ),
                        Text(
                          '11.4',
                          style: TextStyle(
                            fontSize: 9,
                            fontFamily: 'monospace',
                            color: colors.inkDim,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Divider
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Container(
                      height: 0.5,
                      color: colors.line,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // NOW label
                  Text(
                    'NOW',
                    style: TextStyle(
                      fontSize: 9,
                      fontFamily: 'monospace',
                      color: colors.inkMuted,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 2),
                  // Current elevation
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '1312',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.ink,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(width: 1),
                      Text(
                        'm',
                        style: TextStyle(
                          fontSize: 9,
                          color: colors.inkDim,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),

        // Bottom card
        Positioned(
          bottom: 28,
          left: 16,
          right: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 20,
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Next waypoint row
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      // Icon box
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: colors.flareSoft,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: colors.flare.withAlpha(77),
                            width: 0.5,
                          ),
                        ),
                        child: Center(
                          child: KaipaIcon(
                            name: KaipaIcons.forward,
                            size: 20,
                            color: colors.flare,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Info column
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'NEXT · 340 m · 右后方',
                              style: TextStyle(
                                fontSize: 10,
                                fontFamily: 'monospace',
                                color: colors.inkMuted,
                                letterSpacing: 1.5,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(top: 2),
                              child: Text(
                                '鹰飞倒仰 · 打卡点',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: colors.ink,
                                  letterSpacing: -0.3,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // 4-column stats grid
                Container(
                  padding: const EdgeInsets.only(top: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: colors.line,
                        width: 0.5,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: StatWidget(
                          value: '4.7',
                          unit: 'km',
                          label: '已走',
                          tokens: tokens,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: StatWidget(
                          value: '312',
                          unit: 'm',
                          label: '爬升',
                          tokens: tokens,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: StatWidget(
                          value: '2.1',
                          unit: 'km/h',
                          label: '均速',
                          tokens: tokens,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: StatWidget(
                          value: '6.7',
                          unit: 'km',
                          label: '剩余',
                          tokens: tokens,
                        ),
                      ),
                    ],
                  ),
                ),

                // Action row
                Container(
                  margin: const EdgeInsets.only(top: 14),
                  padding: const EdgeInsets.only(top: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: colors.line,
                        width: 0.5,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      // Pause button
                      Expanded(
                        child: GestureDetector(
                          onTap: () =>
                              setState(() => _isPaused = !_isPaused),
                          child: Container(
                            height: 46,
                            decoration: BoxDecoration(
                              color: colors.surfaceHi,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.center,
                              children: [
                                KaipaIcon(
                                  name: _isPaused
                                      ? KaipaIcons.play
                                      : KaipaIcons.pause,
                                  size: 13,
                                  color: colors.ink,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  _isPaused ? '继续' : '暂停',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w500,
                                    color: colors.ink,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Checkpoint button
                      Expanded(
                        child: GestureDetector(
                          onTap: () {},
                          child: Container(
                            height: 46,
                            decoration: BoxDecoration(
                              color: colors.surfaceHi,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.center,
                              children: [
                                KaipaIcon(
                                  name: KaipaIcons.camera,
                                  size: 14,
                                  color: colors.ink,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  '打卡',
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w500,
                                    color: colors.ink,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      // SOS button
                      GestureDetector(
                        onTap: _showSosDialog,
                        child: Container(
                          width: 46,
                          height: 46,
                          decoration: BoxDecoration(
                            color: const Color(0xFFC0392B),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFFC0392B)
                                    .withAlpha(115),
                                blurRadius: 14,
                                offset: const Offset(0, 4),
                              ),
                              const BoxShadow(
                                color: Color.fromRGBO(
                                    255, 255, 255, 0.15),
                                blurRadius: 0,
                                spreadRadius: 1,
                                offset: Offset.zero,
                              ),
                            ],
                          ),
                          child: const Center(
                            child: Text(
                              'SOS',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
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

/// Sparkline painter for the elevation strip in the left panel.
class _ElevSparklinePainter extends CustomPainter {
  final KaipaColors colors;

  _ElevSparklinePainter(this.colors);

  static const List<double> _data = [
    0.1, 0.18, 0.28, 0.42, 0.55, 0.68, 0.62, 0.58, 0.74, 0.85, 0.82,
    0.7, 0.55, 0.4,
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (_data.isEmpty) return;

    final points = <Offset>[];
    for (int i = 0; i < _data.length; i++) {
      final x = i / (_data.length - 1) * size.width;
      final y = size.height - _data[i] * size.height;
      points.add(Offset(x, y));
    }

    // Filled area
    final fillPath = Path()..moveTo(0, size.height);
    for (final p in points) {
      fillPath.lineTo(p.dx, p.dy);
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();

    canvas.drawPath(
      fillPath,
      Paint()
        ..color = colors.flareSoft
        ..style = PaintingStyle.fill,
    );

    // Line
    final linePath = Path()..moveTo(points.first.dx, points.first.dy);
    for (int i = 1; i < points.length; i++) {
      linePath.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = colors.flare
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    // Current position marker at index ~5.3
    const markerIdx = 5.3;
    final markerX = markerIdx / (_data.length - 1) * size.width;
    // Interpolate Y between index 5 and 6
    final lowerIdx = markerIdx.floor();
    final upperIdx = markerIdx.ceil();
    final frac = markerIdx - lowerIdx;
    final markerVal =
        _data[lowerIdx] + (_data[upperIdx] - _data[lowerIdx]) * frac;
    final markerY = size.height - markerVal * size.height;

    // White stroke circle
    canvas.drawCircle(
      Offset(markerX, markerY),
      3,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
    // Flare fill circle
    canvas.drawCircle(
      Offset(markerX, markerY),
      3,
      Paint()
        ..color = colors.flare
        ..style = PaintingStyle.fill,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
