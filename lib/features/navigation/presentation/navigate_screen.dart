import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../discover/data/route_repository.dart';
import '../../trip/data/trip_repository.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/kaipa_icons.dart';

class NavigateScreen extends ConsumerStatefulWidget {
  final String routeId;
  final String? tripId;

  const NavigateScreen({super.key, required this.routeId, this.tripId});

  @override
  ConsumerState<NavigateScreen> createState() => _NavigateScreenState();
}

class _NavigateScreenState extends ConsumerState<NavigateScreen> {
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

  void _showEndTripSheet() {
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '确定要结束行程吗？',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await _endTrip();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC0392B),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('结束行程'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(
                  '继续',
                  style: TextStyle(color: colors.ink),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _endTrip() async {
    final tripId = widget.tripId;
    if (tripId == null) {
      context.go('/discover');
      return;
    }

    try {
      final duration = Duration(seconds: _elapsedSeconds);
      final tripRepo = ref.read(tripRepositoryProvider);
      await tripRepo.completeTrip(
        tripId,
        distanceKm: 11.4,
        elevationM: 680,
        duration: duration,
        avgSpeedKmh: 4.2,
      );
      if (mounted) {
        context.go('/trip-complete/$tripId');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('结束行程失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));

    return Scaffold(
      body: routeAsync.when(
        loading: () => _buildLoading(colors),
        error: (error, stack) => _buildError(context, colors, error),
        data: (route) => _buildContent(context, tokens, colors, route),
      ),
    );
  }

  Widget _buildLoading(KaipaColors colors) {
    return Container(
      color: colors.bg,
      child: Center(
        child: CircularProgressIndicator(
          color: colors.flare,
          strokeWidth: 2.5,
        ),
      ),
    );
  }

  Widget _buildError(BuildContext context, KaipaColors colors, Object error) {
    return Container(
      color: colors.bg,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(
                name: KaipaIcons.alert,
                size: 48,
                color: colors.diff.hard,
              ),
              const SizedBox(height: 16),
              Text(
                '加载路线失败',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                error.toString(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: colors.inkMuted,
                ),
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () => context.pop(),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.flare,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '返回',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaTokens tokens,
    KaipaColors colors,
    RouteModel route,
  ) {
    final center = LatLng(route.latitude, route.longitude);

    return Stack(
      children: [
        // Full-bleed map
        Positioned.fill(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: center,
              initialZoom: 13.5,
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
              MarkerLayer(
                markers: [
                  Marker(
                    point: center,
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
                            blurRadius: 12,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Center(
                        child: KaipaIcon(
                          name: KaipaIcons.flag,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Top HUD
        Positioned(
          top: 56,
          left: 16,
          right: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 20,
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Status row
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colors.flare,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '进行中 · ${_formatTime(_elapsedSeconds)}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: colors.flare,
                        letterSpacing: -0.1,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '箭扣长城',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
                // Divider
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Container(
                    height: 0.5,
                    color: colors.line,
                  ),
                ),
                const SizedBox(height: 12),
                // 4-column stats grid
                Row(
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
              ],
            ),
          ),
        ),

        // Next waypoint card
        Positioned(
          bottom: 200,
          left: 16,
          right: 16,
          child: GlassContainer(
            tokens: tokens,
            radius: 16,
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Icon box
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: colors.flareSoft,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: colors.flare.withAlpha(77),
                      width: 0.5,
                    ),
                  ),
                  child: Center(
                    child: KaipaIcon(
                      name: KaipaIcons.camera,
                      size: 22,
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
                        '下一个 · 340 米',
                        style: TextStyle(
                          fontSize: 11,
                          color: colors.inkMuted,
                          letterSpacing: -0.1,
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(
                          '鹰飞倒仰 · 打卡点',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: colors.ink,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(top: 1),
                        child: Text(
                          '海拔 1410m · ↑ 98m',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: colors.inkMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Forward icon
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 14,
                  color: colors.inkMuted,
                ),
              ],
            ),
          ),
        ),

        // Bottom action bar
        Positioned(
          bottom: 50,
          left: 16,
          right: 16,
          child: Row(
            children: [
              // Camera button
              CircleButton(
                icon: KaipaIcons.camera,
                size: 56,
                iconSize: 22,
                tokens: tokens,
              ),
              const SizedBox(width: 10),
              // Pause button
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _isPaused = !_isPaused),
                  onLongPress: _showEndTripSheet,
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: colors.flare,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: colors.flare.withAlpha(128),
                          blurRadius: 16,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        KaipaIcon(
                          name: _isPaused ? KaipaIcons.play : KaipaIcons.pause,
                          size: 16,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _isPaused ? '继续' : '暂停',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Bell button
              CircleButton(
                icon: KaipaIcons.bell,
                size: 56,
                iconSize: 22,
                color: colors.flare,
                tokens: tokens,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
