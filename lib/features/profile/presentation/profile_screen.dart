import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../../../core/widgets/stat_widget.dart';
import '../data/profile_repository.dart';
import '../domain/profile_model.dart';
import '../../trip/data/trip_repository.dart';
import '../../trip/domain/trip_model.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final profileAsync = ref.watch(currentProfileProvider);
    final tripsAsync = ref.watch(recentTripsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: profileAsync.when(
          data: (profile) {
            return SingleChildScrollView(
              padding: const EdgeInsets.only(
                  top: 12, left: 16, right: 16, bottom: 140),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(context, colors, tokens, profile),
                  _buildStatsCard(colors, tokens, profile),
                  const SizedBox(height: 24),
                  _buildHeatmapSection(colors, tokens, profile),
                  const SizedBox(height: 24),
                  _buildRecentRoutes(context, colors, tokens, tripsAsync),
                ],
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child:
                Text('加载失败', style: TextStyle(color: colors.inkMuted)),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, KaipaColors colors,
      KaipaTokens tokens, ProfileModel profile) {
    final initial = profile.displayName.isNotEmpty
        ? profile.displayName.characters.first
        : '?';

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 20),
      child: Row(
        children: [
          Container(
            width: 68,
            height: 68,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [colors.flare, colors.sand],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFE5604F)
                      .withAlpha((0.25 * 255).round()),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Center(
              child: Text(
                initial,
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile.displayName,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '走过 ${profile.totalTrips} 条线路',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          CircleButton(
            icon: KaipaIcons.ellipsis,
            tokens: tokens,
            onTap: () => context.push('/settings'),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsCard(KaipaColors colors, KaipaTokens tokens,
      ProfileModel profile) {
    final distStr = profile.totalDistanceKm >= 1000
        ? (profile.totalDistanceKm / 1000).toStringAsFixed(1)
        : profile.totalDistanceKm.round().toString();
    final distUnit = profile.totalDistanceKm >= 1000 ? 'k km' : 'km';

    final elevStr = profile.totalElevationM >= 1000
        ? (profile.totalElevationM / 1000).toStringAsFixed(1)
        : profile.totalElevationM.round().toString();
    final elevUnit = profile.totalElevationM >= 1000 ? 'k m' : 'm';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: [
          BoxShadow(
            color:
                const Color(0xFF281E14).withAlpha((0.04 * 255).round()),
            blurRadius: 3,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: StatWidget(
              value: distStr,
              unit: distUnit,
              label: '累计',
              tokens: tokens,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StatWidget(
              value: elevStr,
              unit: elevUnit,
              label: '爬升',
              tokens: tokens,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StatWidget(
              value: profile.totalTrips.toString(),
              label: '路线',
              tokens: tokens,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeatmapSection(
      KaipaColors colors, KaipaTokens tokens, ProfileModel profile) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '今年的足迹',
          padding: EdgeInsets.zero,
          tokens: tokens,
          trailing: Text(
            '${profile.totalTrips} 次出行',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: _YearHeatmap(colors: colors),
        ),
      ],
    );
  }

  Widget _buildRecentRoutes(BuildContext context, KaipaColors colors,
      KaipaTokens tokens, AsyncValue<List<TripModel>> tripsAsync) {
    return tripsAsync.when(
      data: (trips) {
        if (trips.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionTitle(
                title: '最近走过',
                padding: EdgeInsets.zero,
                tokens: tokens,
              ),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: colors.line, width: 0.5),
                ),
                child: Center(
                  child: Text(
                    '还没有行程记录',
                    style: TextStyle(fontSize: 13, color: colors.inkMuted),
                  ),
                ),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionTitle(
              title: '最近走过',
              padding: EdgeInsets.zero,
              tokens: tokens,
              trailing: GestureDetector(
                onTap: () => context.push('/profile/trip-history'),
                child: Text(
                  '更多',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            ...trips.map((t) {
              final dateStr =
                  '${t.startedAt.year}.${t.startedAt.month.toString().padLeft(2, '0')}.${t.startedAt.day.toString().padLeft(2, '0')}';
              final distStr =
                  t.actualDistanceKm?.toStringAsFixed(1) ?? '–';
              final elevStr =
                  t.actualElevationM?.round().toString() ?? '–';
              final title =
                  t.routeName ?? '${t.startedAt.month}月${t.startedAt.day}日';
              final subtitle = t.routeName != null
                  ? '$dateStr  ·  ${distStr}km  ·  ↑${elevStr}m'
                  : '${distStr}km  ·  ↑${elevStr}m';

              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: GestureDetector(
                  onTap: () =>
                      context.push('/discover/route/${t.routeId}'),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border:
                          Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: colors.terrain.lowland,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Center(
                            child: KaipaIcon(
                              name: KaipaIcons.mountain,
                              size: 20,
                              color: colors.mossDeep,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w600,
                                  color: colors.ink,
                                  letterSpacing: -0.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                subtitle,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: colors.inkMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        KaipaIcon(
                          name: KaipaIcons.forward,
                          size: 14,
                          color: colors.inkDim,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

// ─── Year Heatmap ──────────────────────────────────────────────────────

class _YearHeatmap extends StatelessWidget {
  final KaipaColors colors;

  const _YearHeatmap({required this.colors});

  @override
  Widget build(BuildContext context) {
    const weeks = 26;
    const days = 7;

    final data = List.generate(weeks * days, (i) {
      final seed = (i * 13 + 7) % 31;
      if (seed > 26) return 4;
      if (seed > 22) return 3;
      if (seed > 17) return 2;
      if (seed > 13) return 1;
      return 0;
    });

    final levelColors = [
      colors.lineSoft,
      colorWithOpacity(colors.moss, 0.21),
      colorWithOpacity(colors.moss, 0.44),
      colors.moss,
      colors.flare,
    ];

    return Column(
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final totalWidth = constraints.maxWidth;
            final cellSize = (totalWidth - 25 * 2) / 26;

            return Wrap(
              spacing: 2,
              children: List.generate(weeks, (w) {
                return SizedBox(
                  width: cellSize,
                  child: Column(
                    children: List.generate(days, (d) {
                      final level = data[w * days + d];
                      return Padding(
                        padding:
                            EdgeInsets.only(bottom: d < days - 1 ? 2 : 0),
                        child: AspectRatio(
                          aspectRatio: 1,
                          child: Container(
                            decoration: BoxDecoration(
                              color: levelColors[level],
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                );
              }),
            );
          },
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: ['1月', '2月', '3月', '4月', '5月', '6月']
              .map((m) => Text(
                    m,
                    style: TextStyle(
                      fontSize: 10.5,
                      color: colors.inkMuted,
                    ),
                  ))
              .toList(),
        ),
      ],
    );
  }
}
