import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/section_title.dart';
import '../../../core/widgets/stat_widget.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(top: 60, left: 16, right: 16, bottom: 110),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // --- Header row ---
              _buildHeader(colors, tokens),

              // --- Stats card ---
              _buildStatsCard(colors, tokens),

              // --- Heatmap section ---
              const SizedBox(height: 24),
              _buildHeatmapSection(colors, tokens),

              // --- Badges section ---
              const SizedBox(height: 24),
              _buildBadgesSection(colors, tokens),

              // --- Recent routes section ---
              const SizedBox(height: 24),
              _buildRecentRoutes(colors, tokens),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(KaipaColors colors, KaipaTokens tokens) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 20),
      child: Row(
        children: [
          // Avatar
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
                  color: const Color(0xFFE5604F).withAlpha((0.25 * 255).round()),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Center(
              child: Text(
                '陈',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          // Name + subtitle
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '陈明',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '北京 · 走过 23 条线路',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          // Ellipsis button
          CircleButton(
            icon: KaipaIcons.ellipsis,
            tokens: tokens,
          ),
        ],
      ),
    );
  }

  Widget _buildStatsCard(KaipaColors colors, KaipaTokens tokens) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF281E14).withAlpha((0.04 * 255).round()),
            blurRadius: 3,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: StatWidget(
              value: '287',
              unit: 'km',
              label: '累计',
              tokens: tokens,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StatWidget(
              value: '14.2',
              unit: 'k m',
              label: '爬升',
              tokens: tokens,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StatWidget(
              value: '23',
              label: '路线',
              tokens: tokens,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: StatWidget(
              value: '6',
              label: '徽章',
              tokens: tokens,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeatmapSection(KaipaColors colors, KaipaTokens tokens) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '今年的足迹',
          padding: EdgeInsets.zero,
          tokens: tokens,
          trailing: Text(
            '42 次出行',
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

  Widget _buildBadgesSection(KaipaColors colors, KaipaTokens tokens) {
    const badges = <_BadgeData>[
      _BadgeData(icon: KaipaIcons.mountain, label: '登顶 5K', on: true),
      _BadgeData(icon: KaipaIcons.trail, label: '百公里', on: true),
      _BadgeData(icon: KaipaIcons.sun, label: '十日出', on: true),
      _BadgeData(icon: KaipaIcons.moon, label: '月光', on: true),
      _BadgeData(icon: KaipaIcons.flame, label: '冬季', on: true),
      _BadgeData(icon: KaipaIcons.flag, label: '七大洲', on: false),
      _BadgeData(icon: KaipaIcons.tree, label: '原始林', on: false),
      _BadgeData(icon: KaipaIcons.compass, label: '探索者', on: true),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '徽章',
          padding: EdgeInsets.zero,
          tokens: tokens,
          trailing: Text(
            '6 / 24',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ),
        const SizedBox(height: 10),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1,
          ),
          itemCount: badges.length,
          itemBuilder: (context, index) {
            final b = badges[index];
            return Container(
              decoration: BoxDecoration(
                color: b.on ? colors.surface : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: b.on ? colors.line : colors.lineSoft,
                  width: 0.5,
                ),
              ),
              child: Opacity(
                opacity: b.on ? 1.0 : 0.45,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    KaipaIcon(
                      name: b.icon,
                      size: 24,
                      color: b.on ? colors.flare : colors.inkDim,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      b.label,
                      style: TextStyle(
                        fontSize: 10.5,
                        color: b.on ? colors.ink : colors.inkDim,
                        letterSpacing: -0.1,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildRecentRoutes(KaipaColors colors, KaipaTokens tokens) {
    const routes = <_RouteData>[
      _RouteData(name: '十三陵水库环线', date: '2026.04.20', km: '14.2', up: '480'),
      _RouteData(name: '云蒙山', date: '2026.04.06', km: '7.3', up: '620'),
      _RouteData(name: '海坨山', date: '2026.03.22', km: '18.1', up: '1240'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '最近走过',
          padding: EdgeInsets.zero,
          tokens: tokens,
        ),
        const SizedBox(height: 10),
        ...routes.map((r) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(
              children: [
                // Icon circle
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
                // Name + details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r.name,
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
                        '${r.date}  ·  ${r.km}km  ·  ↑${r.up}m',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: colors.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                // Forward icon
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 14,
                  color: colors.inkDim,
                ),
              ],
            ),
          ),
        )),
      ],
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

    // Generate data with the seeded formula from the prototype:
    // seed = (i * 13 + 7) % 31, then: >26→4, >22→3, >17→2, >13→1, else→0
    final data = List.generate(weeks * days, (i) {
      final seed = (i * 13 + 7) % 31;
      if (seed > 26) return 4;
      if (seed > 22) return 3;
      if (seed > 17) return 2;
      if (seed > 13) return 1;
      return 0;
    });

    // 5 intensity levels: [lineSoft, moss+'35', moss+'70', moss, flare]
    // Co.moss + '35' means moss color at ~21% opacity (0x35 = 53/255 ≈ 0.208)
    // Co.moss + '70' means moss color at ~44% opacity (0x70 = 112/255 ≈ 0.439)
    final levelColors = [
      colors.lineSoft,
      colorWithOpacity(colors.moss, 0.21),
      colorWithOpacity(colors.moss, 0.44),
      colors.moss,
      colors.flare,
    ];

    return Column(
      children: [
        // Grid: 26 columns (weeks), each column has 7 rows (days)
        LayoutBuilder(
          builder: (context, constraints) {
            final totalWidth = constraints.maxWidth;
            // gap between columns = 2, 26 columns, 25 gaps
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
                        padding: EdgeInsets.only(bottom: d < days - 1 ? 2 : 0),
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

        // Month labels
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

// ─── Data classes ──────────────────────────────────────────────────────

class _BadgeData {
  final String icon;
  final String label;
  final bool on;

  const _BadgeData({
    required this.icon,
    required this.label,
    required this.on,
  });
}

class _RouteData {
  final String name;
  final String date;
  final String km;
  final String up;

  const _RouteData({
    required this.name,
    required this.date,
    required this.km,
    required this.up,
  });
}
