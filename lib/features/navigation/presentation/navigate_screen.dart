import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../discover/data/route_repository.dart';
import '../../discover/domain/route_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/glass_container.dart';
import '../../../core/widgets/diff_badge.dart';
import '../../../core/widgets/kaipa_icons.dart';

class NavigateScreen extends ConsumerWidget {
  final String routeId;

  const NavigateScreen({super.key, required this.routeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(routeId));

    return Scaffold(
      body: routeAsync.when(
        loading: () => _buildLoading(colors),
        error: (error, stack) => _buildError(context, colors, error),
        data: (route) => _buildContent(context, ref, tokens, colors, route),
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
    WidgetRef ref,
    KaipaTokens tokens,
    KaipaColors colors,
    RouteModel route,
  ) {
    final center = LatLng(route.latitude, route.longitude);
    final bottomPad = MediaQuery.of(context).padding.bottom;

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

        // Back button top-left
        Positioned(
          top: MediaQuery.of(context).padding.top + 12,
          left: 16,
          child: GestureDetector(
            onTap: () => context.pop(),
            child: GlassContainer(
              dark: true,
              radius: 9999,
              tokens: tokens,
              child: SizedBox(
                width: 44,
                height: 44,
                child: Center(
                  child: KaipaIcon(
                    name: KaipaIcons.back,
                    size: 18,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ),

        // Bottom glass overlay card
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: GlassContainer(
            dark: true,
            radius: 24,
            tokens: tokens,
            padding: EdgeInsets.fromLTRB(20, 24, 20, 20 + bottomPad),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Route name + difficulty badge
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        route.name,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.5,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 12),
                    DiffBadge(level: route.difficulty, tokens: tokens),
                  ],
                ),
                const SizedBox(height: 20),

                // Stats row: distance, elevation gain, estimated time
                Row(
                  children: [
                    _StatItem(
                      icon: KaipaIcons.ruler,
                      value: '${route.distanceKm.toStringAsFixed(1)} km',
                      label: '距离',
                      colors: colors,
                    ),
                    const SizedBox(width: 24),
                    _StatItem(
                      icon: KaipaIcons.altitude,
                      value: '${route.elevationGainM.toInt()} m',
                      label: '爬升',
                      colors: colors,
                    ),
                    const SizedBox(width: 24),
                    _StatItem(
                      icon: KaipaIcons.clock,
                      value: _formatDuration(route.estimatedDuration),
                      label: '预计时间',
                      colors: colors,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Action buttons
                Row(
                  children: [
                    // Gear button
                    Expanded(
                      child: GestureDetector(
                        onTap: () =>
                            context.push('/gear/pick/$routeId'),
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: Colors.white.withAlpha(20),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.white.withAlpha(30),
                              width: 0.5,
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              KaipaIcon(
                                name: KaipaIcons.backpack,
                                size: 18,
                                color: Colors.white.withAlpha(200),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '准备装备',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white.withAlpha(200),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Start navigation button
                    Expanded(
                      flex: 2,
                      child: GestureDetector(
                        onTap: () =>
                            context.push('/navigate-hud/$routeId'),
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: colors.flare,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: colors.flare.withAlpha(60),
                                blurRadius: 16,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              KaipaIcon(
                                name: KaipaIcons.navigate,
                                size: 18,
                                color: Colors.white,
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                '开始导航',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
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

  static String _formatDuration(Duration d) {
    final hours = d.inHours;
    final minutes = d.inMinutes % 60;
    if (hours > 0 && minutes > 0) return '$hours小时$minutes分';
    if (hours > 0) return '$hours小时';
    return '$minutes分钟';
  }
}

class _StatItem extends StatelessWidget {
  final String icon;
  final String value;
  final String label;
  final KaipaColors colors;

  const _StatItem({
    required this.icon,
    required this.value,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(
              name: icon,
              size: 14,
              color: Colors.white.withAlpha(140),
            ),
            const SizedBox(width: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withAlpha(120),
          ),
        ),
      ],
    );
  }
}

