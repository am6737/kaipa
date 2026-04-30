import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import 'widgets/create_category_sheet.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/glass_container.dart';

// ─── Preset data model ──────────────────────────────────────────────

class _GearPreset {
  final String name;
  final String description;
  final int itemCount;
  final List<Color> gradientColors;

  const _GearPreset({
    required this.name,
    required this.description,
    required this.itemCount,
    required this.gradientColors,
  });
}

// ─── Donut chart colors per category index ──────────────────────────

const List<Color> _kCategoryChartColors = [
  Color(0xFF5C8A4A), // moss green
  Color(0xFF5A8FB5), // sky blue
  Color(0xFFD4A155), // amber
  Color(0xFFA84228), // ember red
  Color(0xFF7A9A6E), // light green
  Color(0xFF8B6DB0), // purple
  Color(0xFFD97B5A), // coral
  Color(0xFF4A7C9B), // teal
  Color(0xFFC9B894), // sand
  Color(0xFF6E6B62), // grey
];

// ─── Main screen ────────────────────────────────────────────────────

class GearLibraryScreen extends ConsumerWidget {
  const GearLibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final itemsAsync = ref.watch(allGearItemsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: categoriesAsync.when(
          loading: () => _buildShimmerLoading(colors),
          error: (error, stack) => _buildErrorState(colors, error, ref),
          data: (categories) {
            // Items may fail if not authenticated — show categories anyway
            final items = itemsAsync.valueOrNull ?? <GearItemModel>[];
            if (categories.isEmpty && items.isEmpty) {
              return Column(
                children: [
                  _buildHeader(context, colors, categories: categories),
                  Expanded(child: _buildEmptyState(colors)),
                ],
              );
            }
            return _buildContent(context, colors, categories, items);
          },
        ),
      ),
    );
  }

  // ─── Header ─────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors, {List<GearCategoryModel>? categories}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '装备库',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.6,
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: () {
                  context.push('/gear/categories/manage');
                },
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Center(
                    child: Icon(Icons.tune, size: 18, color: colors.inkMuted),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () {
                  // Navigate to add gear
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: colors.flare,
                    borderRadius: BorderRadius.circular(KaipaRadius.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      KaipaIcon(
                        name: KaipaIcons.plus,
                        size: 16,
                        color: Colors.white,
                        strokeWidth: 2.0,
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        '添加',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ─── Content ────────────────────────────────────────────────────

  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
  ) {
    // Compute item count per category
    final countByCategory = <String, int>{};
    final weightByCategory = <String, double>{};
    for (final item in items) {
      countByCategory[item.categoryId] =
          (countByCategory[item.categoryId] ?? 0) + 1;
      weightByCategory[item.categoryId] =
          (weightByCategory[item.categoryId] ?? 0) + (item.weightG ?? 0);
    }

    // Compute totals
    final totalItems = items.length;
    double totalWeightG = 0;
    double totalValue = 0;
    for (final item in items) {
      totalWeightG += item.weightG ?? 0;
      totalValue += item.price ?? 0;
    }
    final totalWeightKg = totalWeightG / 1000;

    // Build chart data
    final chartSegments = <_ChartSegment>[];
    for (int i = 0; i < categories.length; i++) {
      final count = countByCategory[categories[i].id] ?? 0;
      if (count > 0) {
        chartSegments.add(_ChartSegment(
          label: categories[i].name,
          value: count.toDouble(),
          color: _kCategoryChartColors[i % _kCategoryChartColors.length],
        ));
      }
    }

    // Check for missing safety/emergency gear
    final hasSafetyCategory = categories.any((c) =>
        c.name.contains('安全') ||
        c.name.contains('急救') ||
        c.name.contains('应急') ||
        c.icon == KaipaIcons.shield);
    final safetyCategory = hasSafetyCategory
        ? categories.firstWhere(
            (c) =>
                c.name.contains('安全') ||
                c.name.contains('急救') ||
                c.name.contains('应急') ||
                c.icon == KaipaIcons.shield,
            orElse: () => categories.first,
          )
        : null;
    final missingSafetyGear =
        safetyCategory != null && (countByCategory[safetyCategory.id] ?? 0) == 0;

    // Presets
    final presets = [
      _GearPreset(
        name: '日间短途',
        description: '轻装出行',
        itemCount: (totalItems * 0.4).round().clamp(3, 15),
        gradientColors: [colors.moss, colors.mossDeep],
      ),
      _GearPreset(
        name: '过夜露营',
        description: '一晚住宿',
        itemCount: (totalItems * 0.7).round().clamp(5, 25),
        gradientColors: [colors.sky, colorWithOpacity(colors.sky, 0.7)],
      ),
      _GearPreset(
        name: '高海拔挑战',
        description: '极限环境',
        itemCount: (totalItems * 0.9).round().clamp(8, 30),
        gradientColors: [colors.flare, colors.flareDeep],
      ),
    ];

    return CustomScrollView(
      slivers: [
        // Header
        SliverToBoxAdapter(child: _buildHeader(context, colors, categories: categories)),

        // Statistics card
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: GlassContainer(
              radius: KaipaRadius.lg,
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  // Donut chart + legend
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Donut chart
                      SizedBox(
                        width: 120,
                        height: 120,
                        child: CustomPaint(
                          painter: _DonutChartPainter(
                            segments: chartSegments,
                            centerTextColor: colors.ink,
                            centerSubTextColor: colors.inkMuted,
                            totalCount: totalItems,
                          ),
                          size: const Size(120, 120),
                        ),
                      ),
                      const SizedBox(width: 20),
                      // Legend grid
                      Expanded(
                        child: _buildLegendGrid(chartSegments, colors),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Divider
                  Container(
                    height: 0.5,
                    color: colors.line,
                  ),

                  const SizedBox(height: 16),

                  // Stats row
                  Row(
                    children: [
                      Expanded(
                        child: _StatItem(
                          value: '${totalWeightKg.toStringAsFixed(1)} kg',
                          label: '总重量',
                          colors: colors,
                        ),
                      ),
                      Container(width: 0.5, height: 32, color: colors.line),
                      Expanded(
                        child: _StatItem(
                          value: totalValue >= 10000
                              ? '${(totalValue / 10000).toStringAsFixed(1)}万'
                              : '${totalValue.toStringAsFixed(0)}',
                          label: '估值 (¥)',
                          colors: colors,
                        ),
                      ),
                      Container(width: 0.5, height: 32, color: colors.line),
                      Expanded(
                        child: _StatItem(
                          value: '${categories.length}',
                          label: '类别',
                          colors: colors,
                        ),
                      ),
                    ],
                  ),

                  // Alert banner for missing safety gear
                  if (missingSafetyGear) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: colorWithOpacity(
                          const Color(0xFFF59E0B), // amber
                          0.12,
                        ),
                        borderRadius: BorderRadius.circular(KaipaRadius.sm),
                        border: Border.all(
                          color: colorWithOpacity(
                            const Color(0xFFF59E0B),
                            0.3,
                          ),
                          width: 0.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          KaipaIcon(
                            name: KaipaIcons.alert,
                            size: 18,
                            color: const Color(0xFFF59E0B),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              '缺少安全/应急装备，建议补充',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: colors.ink,
                                letterSpacing: -0.1,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),

        // Gear Presets section
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Text(
              '装备方案',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: presets.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final preset = presets[index];
                return _PresetCard(preset: preset, colors: colors);
              },
            ),
          ),
        ),

        // Category Grid section header
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
            child: Text(
              '装备分类',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ),

        // Category Grid
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.2,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                // Last item is the "+" add category card
                if (index == categories.length) {
                  return _AddCategoryCard(
                    colors: colors,
                    categories: categories,
                  );
                }
                final category = categories[index];
                final itemCount = countByCategory[category.id] ?? 0;
                final weightG = weightByCategory[category.id] ?? 0;
                final weightKg = weightG / 1000;
                return _CategoryCard(
                  category: category,
                  itemCount: itemCount,
                  weightKg: weightKg,
                  colors: colors,
                  onTap: () {
                    context.push('/gear/category/${category.id}');
                  },
                );
              },
              childCount: categories.length + 1,
            ),
          ),
        ),

        // Bottom padding
        const SliverToBoxAdapter(
          child: SizedBox(height: 40),
        ),
      ],
    );
  }

  // ─── Legend grid ────────────────────────────────────────────────

  Widget _buildLegendGrid(List<_ChartSegment> segments, KaipaColors colors) {
    // 2-column layout
    final rows = <Widget>[];
    for (int i = 0; i < segments.length; i += 2) {
      final left = segments[i];
      final right = i + 1 < segments.length ? segments[i + 1] : null;
      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: i + 2 < segments.length ? 8 : 0),
          child: Row(
            children: [
              Expanded(child: _LegendItem(segment: left, colors: colors)),
              if (right != null)
                Expanded(child: _LegendItem(segment: right, colors: colors))
              else
                const Expanded(child: SizedBox()),
            ],
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: rows,
    );
  }

  // ─── Empty state ────────────────────────────────────────────────

  Widget _buildEmptyState(KaipaColors colors) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(
              name: KaipaIcons.backpack,
              size: 64,
              color: colors.inkDim,
            ),
            const SizedBox(height: 20),
            Text(
              '还没有装备，点击右上角添加',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: colors.inkMuted,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Error state ────────────────────────────────────────────────

  Widget _buildErrorState(KaipaColors colors, Object error, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(
              name: KaipaIcons.alert,
              size: 48,
              color: colors.diff.extreme,
            ),
            const SizedBox(height: 16),
            Text(
              '加载失败',
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
            const SizedBox(height: 20),
            TextButton(
              onPressed: () {
                ref.invalidate(gearCategoriesProvider);
                ref.invalidate(allGearItemsProvider);
              },
              child: Text(
                '重试',
                style: TextStyle(
                  color: colors.flare,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Shimmer loading ────────────────────────────────────────────

  Widget _buildShimmerLoading(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Header placeholder
            Container(
              height: 40,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 16),
            // Stats card placeholder
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(KaipaRadius.lg),
              ),
            ),
            const SizedBox(height: 16),
            // Preset row placeholder
            Container(
              height: 100,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(KaipaRadius.md),
              ),
            ),
            const SizedBox(height: 16),
            // Grid placeholders
            Expanded(
              child: GridView.builder(
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.2,
                ),
                itemCount: 6,
                itemBuilder: (context, index) {
                  return Container(
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(KaipaRadius.lg),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Chart segment data ─────────────────────────────────────────────

class _ChartSegment {
  final String label;
  final double value;
  final Color color;

  const _ChartSegment({
    required this.label,
    required this.value,
    required this.color,
  });
}

// ─── Donut chart painter ────────────────────────────────────────────

class _DonutChartPainter extends CustomPainter {
  final List<_ChartSegment> segments;
  final Color centerTextColor;
  final Color centerSubTextColor;
  final int totalCount;

  _DonutChartPainter({
    required this.segments,
    required this.centerTextColor,
    required this.centerSubTextColor,
    required this.totalCount,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 12;
    const strokeWidth = 18.0;
    const gapAngle = 0.04; // small gap between segments

    if (segments.isEmpty) {
      // Draw empty ring
      final paint = Paint()
        ..color = colorWithOpacity(centerSubTextColor, 0.15)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      canvas.drawCircle(center, radius, paint);
    } else {
      final total = segments.fold<double>(0, (s, seg) => s + seg.value);
      final totalGap = gapAngle * segments.length;
      final availableAngle = 2 * math.pi - totalGap;
      double startAngle = -math.pi / 2; // start from top

      for (final segment in segments) {
        final sweepAngle = (segment.value / total) * availableAngle;
        final paint = Paint()
          ..color = segment.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round;

        canvas.drawArc(
          Rect.fromCircle(center: center, radius: radius),
          startAngle,
          sweepAngle,
          false,
          paint,
        );

        startAngle += sweepAngle + gapAngle;
      }
    }

    // Center text: total count
    final countPainter = TextPainter(
      text: TextSpan(
        text: '$totalCount',
        style: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: centerTextColor,
          letterSpacing: -0.5,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    countPainter.paint(
      canvas,
      center - Offset(countPainter.width / 2, countPainter.height / 2 + 6),
    );

    // Sub-label
    final labelPainter = TextPainter(
      text: TextSpan(
        text: '件装备',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: centerSubTextColor,
          letterSpacing: -0.1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    labelPainter.paint(
      canvas,
      center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 10),
    );
  }

  @override
  bool shouldRepaint(_DonutChartPainter oldDelegate) {
    return oldDelegate.totalCount != totalCount ||
        oldDelegate.segments.length != segments.length;
  }
}

// ─── Legend item ────────────────────────────────────────────────────

class _LegendItem extends StatelessWidget {
  final _ChartSegment segment;
  final KaipaColors colors;

  const _LegendItem({required this.segment, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: segment.color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            segment.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Stat item ──────────────────────────────────────────────────────

class _StatItem extends StatelessWidget {
  final String value;
  final String label;
  final KaipaColors colors;

  const _StatItem({
    required this.value,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.4,
            height: 1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: colors.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
      ],
    );
  }
}

// ─── Preset card ────────────────────────────────────────────────────

class _PresetCard extends StatelessWidget {
  final _GearPreset preset;
  final KaipaColors colors;

  const _PresetCard({required this.preset, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: preset.gradientColors,
        ),
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            preset.name,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              letterSpacing: -0.3,
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                preset.description,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withAlpha(179), // 0.7 opacity
                  letterSpacing: -0.1,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withAlpha(51), // 0.2 opacity
                  borderRadius: BorderRadius.circular(KaipaRadius.pill),
                ),
                child: Text(
                  '${preset.itemCount} 件',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Category card ──────────────────────────────────────────────────

class _CategoryCard extends StatelessWidget {
  final GearCategoryModel category;
  final int itemCount;
  final double weightKg;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _CategoryCard({
    required this.category,
    required this.itemCount,
    required this.weightKg,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon container
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(KaipaRadius.md),
              ),
              child: Center(
                child: category.iconType == 'emoji'
                    ? Text(category.icon, style: const TextStyle(fontSize: 22))
                    : KaipaIcon(
                        name: category.icon,
                        size: 22,
                        color: colors.flare,
                      ),
              ),
            ),
            const Spacer(),
            // Category name
            Text(
              category.name,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 4),
            // Item count and weight
            Row(
              children: [
                Text(
                  '$itemCount 件',
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
                if (weightKg > 0) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Text(
                      '·',
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.inkDim,
                      ),
                    ),
                  ),
                  Text(
                    '${weightKg.toStringAsFixed(1)}kg',
                    style: TextStyle(
                      fontSize: 12,
                      color: colors.inkMuted,
                      letterSpacing: -0.1,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AddCategoryCard extends ConsumerWidget {
  final KaipaColors colors;
  final List<GearCategoryModel> categories;

  const _AddCategoryCard({required this.colors, required this.categories});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customCount = categories.where((c) => c.isCustom).length;
    final isAtLimit = customCount >= 20;

    return GestureDetector(
      onTap: isAtLimit
          ? () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('最多创建 20 个自定义分类')),
              );
            }
          : () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: colors.bg,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                builder: (_) => CreateCategorySheet(existingCategories: categories),
              ).then((created) {
                if (created == true) {
                  ref.invalidate(gearCategoriesProvider);
                }
              });
            },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          border: Border.all(
            color: isAtLimit ? colors.inkDim : colors.line,
            width: 1,
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        child: CustomPaint(
          painter: _DashedBorderPainter(
            color: isAtLimit ? colors.inkDim : colors.inkMuted,
            radius: KaipaRadius.lg,
          ),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                KaipaIcon(
                  name: KaipaIcons.plus,
                  size: 28,
                  color: isAtLimit ? colors.inkDim : colors.inkMuted,
                  strokeWidth: 1.5,
                ),
                const SizedBox(height: 8),
                Text(
                  '新建分类',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: isAtLimit ? colors.inkDim : colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double radius;

  _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Radius.circular(radius),
    );

    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();

    for (final metric in metrics) {
      double distance = 0;
      bool draw = true;
      while (distance < metric.length) {
        final len = draw ? 6.0 : 4.0;
        final end = (distance + len).clamp(0.0, metric.length);
        if (draw) {
          final segment = metric.extractPath(distance, end);
          canvas.drawPath(segment, paint);
        }
        distance = end;
        draw = !draw;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
