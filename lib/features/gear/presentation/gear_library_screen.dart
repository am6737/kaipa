import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/gear_repository.dart';
import 'widgets/create_gear_item_sheet.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── Hardcoded demo data ───────────────────────────────────────────

class _DemoCategory {
  final String icon;
  final String name;
  final int count;
  final double weightKg;

  const _DemoCategory({
    required this.icon,
    required this.name,
    required this.count,
    required this.weightKg,
  });
}

const List<_DemoCategory> _kDemoCategories = [
  _DemoCategory(icon: KaipaIcons.boot, name: '鞋履', count: 4, weightKg: 1.2),
  _DemoCategory(icon: KaipaIcons.backpack, name: '背包', count: 3, weightKg: 4.1),
  _DemoCategory(icon: KaipaIcons.jacket, name: '衣物', count: 12, weightKg: 3.8),
  _DemoCategory(icon: KaipaIcons.tent, name: '帐篷', count: 2, weightKg: 2.4),
  _DemoCategory(icon: KaipaIcons.bottle, name: '水补', count: 6, weightKg: 0.8),
  _DemoCategory(icon: KaipaIcons.light, name: '电子', count: 5, weightKg: 0.6),
  _DemoCategory(icon: KaipaIcons.knife, name: '工具', count: 8, weightKg: 0.9),
  _DemoCategory(icon: KaipaIcons.flame, name: '炊具', count: 4, weightKg: 1.1),
];

class _DemoPreset {
  final String name;
  final String spec;
  final Color dotColor;

  const _DemoPreset({
    required this.name,
    required this.spec,
    required this.dotColor,
  });
}

class _DonutSegment {
  final String label;
  final double value;
  final Color color;
  final String price;

  const _DonutSegment({
    required this.label,
    required this.value,
    required this.color,
    required this.price,
  });
}

// ─── Main screen ────────────────────────────────────────────────────

class GearLibraryScreen extends ConsumerWidget {
  const GearLibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: _buildContent(context, colors, ref),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    WidgetRef ref,
  ) {
    // Donut chart segment data (hardcoded per spec)
    final segments = [
      _DonutSegment(label: '背包', value: 5.1, color: colors.flare, price: '¥5.1k'),
      _DonutSegment(label: '鞋履', value: 4.2, color: colors.sky, price: '¥4.2k'),
      _DonutSegment(label: '衣物', value: 3.6, color: colors.sand, price: '¥3.6k'),
      _DonutSegment(label: '帐篷', value: 2.8, color: const Color(0xFFC47D5A), price: '¥2.8k'),
      _DonutSegment(label: '电子', value: 1.2, color: colors.moss, price: '¥1.2k'),
      _DonutSegment(label: '工具', value: 0.7, color: const Color(0xFF7BAFC8), price: '¥0.7k'),
      _DonutSegment(label: '水补', value: 0.6, color: const Color(0xFFA89070), price: '¥0.6k'),
      _DonutSegment(label: '炊具', value: 0.5, color: colors.inkDim, price: '¥0.5k'),
    ];

    // Presets data (hardcoded per spec)
    final presets = [
      _DemoPreset(name: '一日徒步', spec: '8 件 · 5.2kg', dotColor: colors.moss),
      _DemoPreset(name: '过夜重装', spec: '24 件 · 12.1kg', dotColor: colors.flare),
      _DemoPreset(name: '雪线攀登', spec: '18 件 · 9.4kg', dotColor: colors.sky),
    ];

    return CustomScrollView(
      slivers: [
        // Header
        SliverToBoxAdapter(child: _buildHeader(context, colors, ref)),

        // Overview card
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: colors.line, width: 0.5),
                boxShadow: const [
                  BoxShadow(
                    color: Color.fromRGBO(40, 30, 20, 0.04),
                    offset: Offset(0, 1),
                    blurRadius: 3,
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              child: Column(
                children: [
                  // Donut chart + legend
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Donut chart
                      SizedBox(
                        width: 136,
                        height: 136,
                        child: CustomPaint(
                          painter: _DonutChartPainter(
                            segments: segments,
                            centerTextColor: colors.ink,
                            centerSubTextColor: colors.inkMuted,
                          ),
                          size: const Size(136, 136),
                        ),
                      ),
                      const SizedBox(width: 16),
                      // Legend grid
                      Expanded(
                        child: _buildLegendGrid(segments, colors),
                      ),
                    ],
                  ),

                  // Stats row
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Container(
                      padding: const EdgeInsets.only(top: 14),
                      decoration: BoxDecoration(
                        border: Border(
                          top: BorderSide(
                            color: colors.lineSoft,
                            width: 0.5,
                          ),
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: _StatItem(
                              value: '14.9',
                              unit: ' kg',
                              label: '总重',
                              colors: colors,
                            ),
                          ),
                          Expanded(
                            child: _StatItem(
                              value: '¥18.7',
                              unit: ' k',
                              label: '总值',
                              colors: colors,
                            ),
                          ),
                          Expanded(
                            child: _StatItem(
                              value: '8',
                              unit: ' 个',
                              label: '分类',
                              colors: colors,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Alert banner
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Container(
                      padding: const EdgeInsets.only(top: 12),
                      decoration: BoxDecoration(
                        border: Border(
                          top: BorderSide(
                            color: colors.lineSoft,
                            width: 0.5,
                          ),
                        ),
                      ),
                      child: Row(
                        children: [
                          KaipaIcon(
                            name: KaipaIcons.alert,
                            size: 14,
                            color: colors.flare,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '安全类装备不足，建议补充急救包',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: colors.flare,
                                letterSpacing: -0.2,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Presets section
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '装备预设',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.4,
                  ),
                ),
                Text(
                  '3 套',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: presets.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final preset = presets[index];
                  return _PresetCard(preset: preset, colors: colors);
                },
              ),
            ),
          ),
        ),

        // Categories section
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Text(
              '分类',
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.45,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final cat = _kDemoCategories[index];
                return _CategoryCard(
                  icon: cat.icon,
                  name: cat.name,
                  count: cat.count,
                  weightKg: cat.weightKg,
                  colors: colors,
                  onTap: () {
                    // Navigate using index-based route
                  },
                );
              },
              childCount: _kDemoCategories.length,
            ),
          ),
        ),

        // Bottom padding to clear the floating bottom nav bar
        const SliverToBoxAdapter(
          child: SizedBox(height: 120),
        ),
      ],
    );
  }

  // ─── Header ─────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, KaipaColors colors, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '装备库',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.8,
              ),
            ),
            GestureDetector(
              onTap: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: colors.bg,
                  shape: const RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  builder: (_) => const CreateGearItemSheet(),
                ).then((created) {
                  if (created == true) {
                    ref.invalidate(gearCategoriesProvider);
                    ref.invalidate(allGearItemsProvider);
                  }
                });
              },
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: colors.flare,
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: KaipaIcon(
                    name: KaipaIcons.plus,
                    size: 16,
                    color: Colors.white,
                    strokeWidth: 2.0,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Legend grid ────────────────────────────────────────────────

  Widget _buildLegendGrid(List<_DonutSegment> segments, KaipaColors colors) {
    // 2-column layout with gap 6 vertical, 10 horizontal
    final rows = <Widget>[];
    for (int i = 0; i < segments.length; i += 2) {
      final left = segments[i];
      final right = i + 1 < segments.length ? segments[i + 1] : null;
      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: i + 2 < segments.length ? 6 : 0),
          child: Row(
            children: [
              Expanded(child: _LegendItem(segment: left, colors: colors)),
              const SizedBox(width: 10),
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
}

// ─── Donut chart painter ────────────────────────────────────────────

class _DonutChartPainter extends CustomPainter {
  final List<_DonutSegment> segments;
  final Color centerTextColor;
  final Color centerSubTextColor;

  _DonutChartPainter({
    required this.segments,
    required this.centerTextColor,
    required this.centerSubTextColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // SVG viewBox 0 0 136 136, cx=68 cy=68 r=48 strokeWidth=15
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 48.0;
    const strokeWidth = 15.0;
    // 2px gap between segments, converted to angle
    // circumference = 2 * pi * r = ~301.6
    // 2px gap = 2 / 301.6 radians ~ 0.00663
    const gapAngle = 2.0 / (2 * math.pi * radius) * (2 * math.pi); // 2px / circumference * full circle

    if (segments.isEmpty) {
      final paint = Paint()
        ..color = colorWithOpacity(centerSubTextColor, 0.15)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.butt;
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
          ..strokeCap = StrokeCap.butt;

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

    // Center text: "44" (30px bold, ink, letterSpacing -1)
    final countPainter = TextPainter(
      text: TextSpan(
        text: '44',
        style: TextStyle(
          fontSize: 30,
          fontWeight: FontWeight.w700,
          color: centerTextColor,
          letterSpacing: -1,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    countPainter.paint(
      canvas,
      center - Offset(countPainter.width / 2, countPainter.height / 2 + 7),
    );

    // Sub-label: "件装备" (10px, inkMuted, letterSpacing 0.3)
    final labelPainter = TextPainter(
      text: TextSpan(
        text: '件装备',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w400,
          color: centerSubTextColor,
          letterSpacing: 0.3,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    labelPainter.paint(
      canvas,
      center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 11),
    );
  }

  @override
  bool shouldRepaint(_DonutChartPainter oldDelegate) {
    return oldDelegate.segments.length != segments.length ||
        oldDelegate.centerTextColor != centerTextColor;
  }
}

// ─── Legend item ────────────────────────────────────────────────────

class _LegendItem extends StatelessWidget {
  final _DonutSegment segment;
  final KaipaColors colors;

  const _LegendItem({required this.segment, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            color: segment.color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 5),
        Flexible(
          child: Text(
            segment.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w500,
              color: colors.ink,
            ),
          ),
        ),
        const Spacer(),
        Text(
          segment.price,
          style: TextStyle(
            fontSize: 10,
            color: colors.inkDim,
          ),
        ),
      ],
    );
  }
}

// ─── Stat item ──────────────────────────────────────────────────────

class _StatItem extends StatelessWidget {
  final String value;
  final String unit;
  final String label;
  final KaipaColors colors;

  const _StatItem({
    required this.value,
    required this.unit,
    required this.label,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.4,
                  height: 1,
                ),
              ),
              TextSpan(
                text: unit,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: colors.inkMuted,
                  letterSpacing: -0.1,
                ),
              ),
            ],
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
  final _DemoPreset preset;
  final KaipaColors colors;

  const _PresetCard({required this.preset, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 150),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: preset.dotColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                preset.name,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              preset.spec,
              style: TextStyle(
                fontSize: 11.5,
                color: colors.inkMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Category card ──────────────────────────────────────────────────

class _CategoryCard extends StatelessWidget {
  final String icon;
  final String name;
  final int count;
  final double weightKg;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _CategoryCard({
    required this.icon,
    required this.name,
    required this.count,
    required this.weightKg,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 116),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon container: 36x36, mossSoft bg, borderRadius 10, icon 18px mossDeep
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.mossSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Center(
                child: KaipaIcon(
                  name: icon,
                  size: 18,
                  color: colors.mossDeep,
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Category name: 14.5px bold, ink, letterSpacing -0.2
            Text(
              name,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 4),
            // Count + weight: 11.5px, muted
            Text(
              '$count 件 · ${weightKg.toStringAsFixed(1)}kg',
              style: TextStyle(
                fontSize: 11.5,
                color: colors.inkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
