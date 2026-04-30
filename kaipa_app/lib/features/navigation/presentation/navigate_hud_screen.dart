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
        title: Text('确认发送紧急求助？', style: TextStyle(color: tokens.color.ink)),
        content: Text('这将向你的紧急联系人发送你的当前位置信息。', style: TextStyle(color: tokens.color.inkMuted)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('取消', style: TextStyle(color: tokens.color.inkMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
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
        loading: () => Center(child: CircularProgressIndicator(color: colors.flare)),
        error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.ink))),
        data: (route) => _buildHud(route, tokens, colors),
      ),
    );
  }

  Widget _buildHud(RouteModel route, KaipaTokens tokens, KaipaColors colors) {
    return Stack(
      children: [
        // Full-bleed map
        FlutterMap(
          options: MapOptions(
            initialCenter: LatLng(route.latitude, route.longitude),
            initialZoom: 14,
          ),
          children: [
            TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
          ],
        ),

        // Top route ribbon
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 16, right: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 18,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                GestureDetector(
                  onTap: () => context.pop(),
                  child: Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.surface.withAlpha(120),
                    ),
                    child: Icon(Icons.arrow_back_ios_new, size: 14, color: colors.ink),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: colors.flare)),
                          const SizedBox(width: 5),
                          Text('进行中  ·  ${_formatTime(_elapsedSeconds)}',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colors.flare)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(route.name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    color: colors.mossSoft,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.people, size: 11, color: colors.mossDeep),
                      Text('2', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.mossDeep)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // Right rail buttons
        Positioned(
          top: MediaQuery.of(context).padding.top + 80,
          right: 16,
          child: Column(
            children: [
              _buildGlassBtn(Icons.add, colors, tokens),
              const SizedBox(height: 8),
              _buildGlassBtn(Icons.remove, colors, tokens),
              const SizedBox(height: 8),
              _buildGlassBtn(Icons.my_location, colors, tokens, iconColor: colors.flare),
              const SizedBox(height: 8),
              _buildGlassBtn(Icons.layers, colors, tokens),
            ],
          ),
        ),

        // Left panel: elevation
        Positioned(
          top: MediaQuery.of(context).padding.top + 80,
          left: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 14,
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('ELEV', style: TextStyle(fontSize: 9, color: colors.inkMuted, fontWeight: FontWeight.w500, letterSpacing: 1)),
                const SizedBox(height: 4),
                SizedBox(
                  width: 58, height: 60,
                  child: CustomPaint(painter: _ElevStripPainter(colors)),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('0', style: TextStyle(fontSize: 9, color: colors.inkDim)),
                    const SizedBox(width: 30),
                    Text('${route.distanceKm}', style: TextStyle(fontSize: 9, color: colors.inkDim)),
                  ],
                ),
                const SizedBox(height: 8),
                Container(height: 0.5, width: 58, color: colors.line),
                const SizedBox(height: 8),
                Text('NOW', style: TextStyle(fontSize: 9, color: colors.inkMuted, letterSpacing: 1)),
                const SizedBox(height: 2),
                RichText(text: TextSpan(children: [
                  TextSpan(text: '${route.maxAltitudeM ?? 0}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.ink)),
                  TextSpan(text: 'm', style: TextStyle(fontSize: 9, color: colors.inkDim)),
                ])),
              ],
            ),
          ),
        ),

        // Bottom card
        Positioned(
          bottom: 0, left: 0, right: 0,
          child: GlassContainer(
            tokens: tokens,
            radius: 24,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 34),
            child: Column(
              children: [
                // Next waypoint
                Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        color: colors.flareSoft,
                      ),
                      child: Icon(Icons.flag, size: 18, color: colors.flare),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('下一站', style: TextStyle(fontSize: 10, color: colors.inkMuted)),
                          Text(route.photoSpots.isNotEmpty ? route.photoSpots.first.name : '终点',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${(route.distanceKm * 0.3).toStringAsFixed(1)} km', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.ink)),
                        Text('~${(route.distanceKm * 0.3 / 3 * 60).round()} min', style: TextStyle(fontSize: 10, color: colors.inkMuted)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Stats row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _statCol('距离', '${(route.distanceKm * _elapsedSeconds / 20000).clamp(0, route.distanceKm).toStringAsFixed(1)} km', colors),
                    _statCol('爬升', '${(route.elevationGainM * _elapsedSeconds / 20000).clamp(0, route.elevationGainM).round()} m', colors),
                    _statCol('速度', '${(_elapsedSeconds > 0 ? (route.distanceKm * _elapsedSeconds / 20000 / (_elapsedSeconds / 3600)).clamp(0, 5) : 0).toStringAsFixed(1)} km/h', colors),
                  ],
                ),
                const SizedBox(height: 16),
                // Action buttons
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => setState(() => _isPaused = !_isPaused),
                        icon: Icon(_isPaused ? Icons.play_arrow : Icons.pause, size: 18),
                        label: Text(_isPaused ? '继续' : '暂停'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: colors.sky,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          minimumSize: const Size(0, 48),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 80,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _showSosDialog,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFDC2626),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('SOS', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGlassBtn(IconData icon, KaipaColors colors, KaipaTokens tokens, {Color? iconColor}) {
    return GlassContainer(
      tokens: tokens,
      radius: 14,
      padding: const EdgeInsets.all(10),
      child: Icon(icon, size: 16, color: iconColor ?? colors.ink),
    );
  }

  Widget _statCol(String label, String value, KaipaColors colors) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: 10, color: colors.inkMuted)),
      ],
    );
  }
}

class _ElevStripPainter extends CustomPainter {
  final KaipaColors colors;
  _ElevStripPainter(this.colors);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colors.flare.withAlpha(60)
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(0, size.height * 0.8)
      ..quadraticBezierTo(size.width * 0.2, size.height * 0.5, size.width * 0.4, size.height * 0.3)
      ..quadraticBezierTo(size.width * 0.6, size.height * 0.1, size.width * 0.7, size.height * 0.15)
      ..quadraticBezierTo(size.width * 0.85, size.height * 0.2, size.width, size.height * 0.5)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);

    final linePaint = Paint()
      ..color = colors.flare
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final linePath = Path()
      ..moveTo(0, size.height * 0.8)
      ..quadraticBezierTo(size.width * 0.2, size.height * 0.5, size.width * 0.4, size.height * 0.3)
      ..quadraticBezierTo(size.width * 0.6, size.height * 0.1, size.width * 0.7, size.height * 0.15)
      ..quadraticBezierTo(size.width * 0.85, size.height * 0.2, size.width, size.height * 0.5);
    canvas.drawPath(linePath, linePaint);

    // Current position dot
    canvas.drawCircle(
      Offset(size.width * 0.4, size.height * 0.3),
      3,
      Paint()..color = colors.flare,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
