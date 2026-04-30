import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import '../domain/gear_preset_model.dart';
import 'widgets/create_gear_item_sheet.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

class _DonutSegment {
  final String label;
  final double value;
  final Color color;
  final String price;
  final double weightKg;
  final int itemCount;

  const _DonutSegment({
    required this.label,
    required this.value,
    required this.color,
    required this.price,
    required this.weightKg,
    required this.itemCount,
  });
}

// ─── Main screen ────────────────────────────────────────────────────

class GearLibraryScreen extends ConsumerWidget {
  const GearLibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final itemsAsync = ref.watch(allGearItemsProvider);
    final presetsAsync = ref.watch(gearPresetsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: categoriesAsync.when(
          loading: () => _buildShimmer(colors),
          error: (e, _) => _buildError(colors, e, ref),
          data: (categories) => itemsAsync.when(
            loading: () => _buildShimmer(colors),
            error: (e, _) => _buildError(colors, e, ref),
            data: (items) => presetsAsync.when(
              loading: () => _buildContent(context, colors, ref, categories, items, []),
              error: (_, _) => _buildContent(context, colors, ref, categories, items, []),
              data: (presets) => _buildContent(context, colors, ref, categories, items, presets),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    WidgetRef ref,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
    List<GearPresetModel> presets,
  ) {
    final visibleCategories = categories.where((c) => !c.isUncategorized).toList();

    final segmentColors = [
      colors.flare,
      colors.sky,
      colors.sand,
      const Color(0xFFC47D5A),
      colors.moss,
      const Color(0xFF7BAFC8),
      const Color(0xFFA89070),
      colors.inkDim,
      const Color(0xFF8B6E5A),
      const Color(0xFF6B8E7B),
    ];

    final segments = <_DonutSegment>[];
    for (int i = 0; i < visibleCategories.length; i++) {
      final cat = visibleCategories[i];
      final catItems = items.where((item) => item.categoryId == cat.id || item.categoryId == cat.builtinRef).toList();
      final totalPrice = catItems.fold<double>(0, (sum, item) => sum + (item.price ?? 0));
      if (totalPrice > 0) {
        final catWeight = catItems.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0)) / 1000;
        segments.add(_DonutSegment(
          label: cat.name,
          value: totalPrice / 1000,
          color: segmentColors[i % segmentColors.length],
          price: '¥${(totalPrice / 1000).toStringAsFixed(1)}k',
          weightKg: catWeight,
          itemCount: catItems.length,
        ));
      }
    }

    final totalWeight = items.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0));
    final totalPrice = items.fold<double>(0, (sum, item) => sum + (item.price ?? 0));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _buildHeader(context, colors, ref)),

        // Overview card
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
            child: _OverviewCard(
              segments: segments,
              colors: colors,
              totalCount: items.length,
              totalWeightKg: totalWeight / 1000,
              totalPriceK: totalPrice / 1000,
              categoriesCount: visibleCategories.length,
            ),
          ),
        ),

        // Presets
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text('装备预设', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                    const SizedBox(width: 8),
                    Text('${presets.length} 套', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
                  ],
                ),
                GestureDetector(
                  onTap: () => context.go('/gear/presets/manage'),
                  child: Text('管理', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.flare)),
                ),
              ],
            ),
          ),
        ),
        if (presets.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Container(
                height: 96,
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: colors.lineSoft, width: 0.5),
                ),
                child: Center(
                  child: Text('还没有预设，点击「管理」创建', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                ),
              ),
            ),
          )
        else
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
                    final dotColors = [colors.moss, colors.flare, colors.sky, colors.sand, colors.inkMuted];
                    return GestureDetector(
                      onTap: () => context.go('/gear/preset/${preset.id}'),
                      child: _PresetCard(
                        name: preset.name,
                        spec: '${preset.itemCount} 件 · ${(preset.totalWeightG / 1000).toStringAsFixed(1)}kg',
                        dotColor: dotColors[index % dotColors.length],
                        colors: colors,
                      ),
                    );
                  },
                ),
              ),
            ),
          ),

        // Categories
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('分类', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                GestureDetector(
                  onTap: () => context.go('/gear/categories/manage'),
                  child: Text('管理', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.flare)),
                ),
              ],
            ),
          ),
        ),
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
                final cat = visibleCategories[index];
                final catItems = items.where((item) => item.categoryId == cat.id || item.categoryId == cat.builtinRef).toList();
                final totalWeightKg = catItems.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0)) / 1000;
                return _CategoryCard(
                  icon: cat.icon,
                  name: cat.name,
                  count: catItems.length,
                  weightKg: totalWeightKg,
                  colors: colors,
                  onTap: () => context.go('/gear/category/${cat.id}'),
                );
              },
              childCount: visibleCategories.length,
            ),
          ),
        ),

        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }

  Widget _buildHeader(BuildContext context, KaipaColors colors, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
      child: Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('装备库', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.8)),
            GestureDetector(
              onTap: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: colors.bg,
                  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
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
                decoration: BoxDecoration(color: colors.flare, shape: BoxShape.circle),
                child: const Center(child: KaipaIcon(name: KaipaIcons.plus, size: 16, color: Colors.white, strokeWidth: 2.0)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShimmer(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 68, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 32, width: 100, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(8))),
            const SizedBox(height: 24),
            Container(height: 200, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(18))),
            const SizedBox(height: 24),
            Container(height: 20, width: 80, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(6))),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: Container(height: 96, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16)))),
              const SizedBox(width: 10),
              Expanded(child: Container(height: 96, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16)))),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _buildError(KaipaColors colors, Object error, WidgetRef ref) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          KaipaIcon(name: KaipaIcons.alert, size: 48, color: colors.flare),
          const SizedBox(height: 16),
          Text('加载失败', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 8),
          Text(error.toString(), textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),
          TextButton(
            onPressed: () { ref.invalidate(gearCategoriesProvider); ref.invalidate(allGearItemsProvider); ref.invalidate(gearPresetsProvider); },
            child: Text('重试', style: TextStyle(color: colors.flare, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ─── Overview card (stateful for segment selection) ────────────────

class _OverviewCard extends StatefulWidget {
  final List<_DonutSegment> segments;
  final KaipaColors colors;
  final int totalCount;
  final double totalWeightKg;
  final double totalPriceK;
  final int categoriesCount;

  const _OverviewCard({
    required this.segments,
    required this.colors,
    required this.totalCount,
    required this.totalWeightKg,
    required this.totalPriceK,
    required this.categoriesCount,
  });

  @override
  State<_OverviewCard> createState() => _OverviewCardState();
}

class _OverviewCardState extends State<_OverviewCard>
    with SingleTickerProviderStateMixin {
  int? _selectedIndex;
  late AnimationController _animController;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      duration: const Duration(milliseconds: 280),
      vsync: this,
    )..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _selectSegment(int? index) {
    setState(() {
      if (index == null || _selectedIndex == index) {
        _selectedIndex = null;
        _animController.reverse();
      } else {
        final hadSelection = _selectedIndex != null;
        _selectedIndex = index;
        if (hadSelection) {
          _animController.value = 1.0;
        } else {
          _animController.forward(from: 0);
        }
      }
    });
  }

  int? _hitTestSegment(Offset localPosition, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final dx = localPosition.dx - center.dx;
    final dy = localPosition.dy - center.dy;
    final distance = math.sqrt(dx * dx + dy * dy);

    const radius = 48.0;
    const strokeWidth = 15.0;
    const hitPadding = 8.0;
    if (distance < radius - strokeWidth / 2 - hitPadding ||
        distance > radius + strokeWidth / 2 + hitPadding) {
      return null;
    }

    var angle = math.atan2(dy, dx) + math.pi / 2;
    if (angle < 0) angle += 2 * math.pi;

    final segments = widget.segments;
    final total = segments.fold<double>(0, (s, seg) => s + seg.value);
    const gapAngle = 2.0 / (2 * math.pi * radius) * (2 * math.pi);
    final availableAngle = 2 * math.pi - gapAngle * segments.length;

    double accumulated = 0;
    for (int i = 0; i < segments.length; i++) {
      final sweepAngle = (segments[i].value / total) * availableAngle;
      if (angle >= accumulated && angle < accumulated + sweepAngle) {
        return i;
      }
      accumulated += sweepAngle + gapAngle;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final segments = widget.segments;
    final colors = widget.colors;

    return GestureDetector(
      onTap: () => _selectSegment(null),
      child: Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [
          BoxShadow(color: Color.fromRGBO(40, 30, 20, 0.04), offset: Offset(0, 1), blurRadius: 3),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (details) {
                  _selectSegment(_hitTestSegment(details.localPosition, const Size(136, 136)));
                },
                child: SizedBox(
                  width: 136,
                  height: 136,
                  child: CustomPaint(
                    painter: _DonutChartPainter(
                      segments: segments,
                      centerTextColor: colors.ink,
                      centerSubTextColor: colors.inkMuted,
                      totalCount: widget.totalCount,
                      selectedIndex: _selectedIndex,
                      selectionProgress: _animController.value,
                    ),
                    size: const Size(136, 136),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(child: _buildLegendGrid(segments, colors)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Container(
              padding: const EdgeInsets.only(top: 14),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: colors.lineSoft, width: 0.5))),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: _selectedIndex != null
                    ? Row(
                        key: ValueKey('seg_$_selectedIndex'),
                        children: [
                          Expanded(child: _StatItem(value: segments[_selectedIndex!].weightKg.toStringAsFixed(1), unit: ' kg', label: '重量', colors: colors)),
                          Expanded(child: _StatItem(value: segments[_selectedIndex!].price, unit: '', label: '价值', colors: colors)),
                          Expanded(child: _StatItem(value: '${segments[_selectedIndex!].itemCount}', unit: ' 件', label: '装备', colors: colors)),
                        ],
                      )
                    : Row(
                        key: const ValueKey('total'),
                        children: [
                          Expanded(child: _StatItem(value: widget.totalWeightKg.toStringAsFixed(1), unit: ' kg', label: '总重', colors: colors)),
                          Expanded(child: _StatItem(value: '¥${widget.totalPriceK.toStringAsFixed(1)}', unit: ' k', label: '总值', colors: colors)),
                          Expanded(child: _StatItem(value: '${widget.categoriesCount}', unit: ' 个', label: '分类', colors: colors)),
                        ],
                      ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Container(
              padding: const EdgeInsets.only(top: 12),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: colors.lineSoft, width: 0.5))),
              child: Row(
                children: [
                  KaipaIcon(name: KaipaIcons.alert, size: 14, color: colors.flare),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('安全类装备不足，建议补充急救包',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: colors.flare, letterSpacing: -0.2)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
    );
  }

  Widget _buildLegendGrid(List<_DonutSegment> segments, KaipaColors colors) {
    final rows = <Widget>[];
    for (int i = 0; i < segments.length; i += 2) {
      final rightIdx = i + 1;
      final right = rightIdx < segments.length ? segments[rightIdx] : null;
      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: i + 2 < segments.length ? 6 : 0),
          child: Row(
            children: [
              Expanded(
                child: _LegendItem(
                  segment: segments[i], colors: colors,
                  isDimmed: _selectedIndex != null && _selectedIndex != i,
                  onTap: () => _selectSegment(i),
                ),
              ),
              const SizedBox(width: 10),
              if (right != null)
                Expanded(
                  child: _LegendItem(
                    segment: right, colors: colors,
                    isDimmed: _selectedIndex != null && _selectedIndex != rightIdx,
                    onTap: () => _selectSegment(rightIdx),
                  ),
                )
              else
                const Expanded(child: SizedBox()),
            ],
          ),
        ),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: rows);
  }
}

// ─── Donut chart painter ────────────────────────────────────────────

class _DonutChartPainter extends CustomPainter {
  final List<_DonutSegment> segments;
  final Color centerTextColor;
  final Color centerSubTextColor;
  final int totalCount;
  final int? selectedIndex;
  final double selectionProgress;

  _DonutChartPainter({
    required this.segments,
    required this.centerTextColor,
    required this.centerSubTextColor,
    required this.totalCount,
    this.selectedIndex,
    this.selectionProgress = 0.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 48.0;
    const strokeWidth = 15.0;
    const popOutDistance = 5.0;
    const gapAngle = 2.0 / (2 * math.pi * radius) * (2 * math.pi);

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
      double startAngle = -math.pi / 2;
      final hasSelection = selectedIndex != null;

      for (int i = 0; i < segments.length; i++) {
        final segment = segments[i];
        final sweepAngle = (segment.value / total) * availableAngle;
        final isSelected = selectedIndex == i;

        Color segColor = segment.color;
        if (hasSelection && !isSelected) {
          segColor = colorWithOpacity(segment.color, 1.0 - 0.6 * selectionProgress);
        }

        final sw = isSelected ? strokeWidth + 2.0 * selectionProgress : strokeWidth;

        final paint = Paint()
          ..color = segColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = sw
          ..strokeCap = StrokeCap.butt;

        var arcCenter = center;
        if (isSelected) {
          final midAngle = startAngle + sweepAngle / 2;
          final offset = popOutDistance * selectionProgress;
          arcCenter = Offset(
            center.dx + offset * math.cos(midAngle),
            center.dy + offset * math.sin(midAngle),
          );
        }

        canvas.drawArc(Rect.fromCircle(center: arcCenter, radius: radius), startAngle, sweepAngle, false, paint);
        startAngle += sweepAngle + gapAngle;
      }
    }

    if (selectedIndex != null && selectionProgress > 0.5) {
      final seg = segments[selectedIndex!];
      final countPainter = TextPainter(
        text: TextSpan(text: seg.price, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: centerTextColor, letterSpacing: -0.8)),
        textDirection: TextDirection.ltr,
      )..layout();
      countPainter.paint(canvas, center - Offset(countPainter.width / 2, countPainter.height / 2 + 7));

      final labelPainter = TextPainter(
        text: TextSpan(text: seg.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: centerSubTextColor, letterSpacing: 0.3)),
        textDirection: TextDirection.ltr,
      )..layout();
      labelPainter.paint(canvas, center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 11));
    } else {
      final countPainter = TextPainter(
        text: TextSpan(text: '$totalCount', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: centerTextColor, letterSpacing: -1)),
        textDirection: TextDirection.ltr,
      )..layout();
      countPainter.paint(canvas, center - Offset(countPainter.width / 2, countPainter.height / 2 + 7));

      final labelPainter = TextPainter(
        text: TextSpan(text: '件装备', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w400, color: centerSubTextColor, letterSpacing: 0.3)),
        textDirection: TextDirection.ltr,
      )..layout();
      labelPainter.paint(canvas, center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 11));
    }
  }

  @override
  bool shouldRepaint(_DonutChartPainter oldDelegate) {
    return oldDelegate.segments.length != segments.length ||
        oldDelegate.centerTextColor != centerTextColor ||
        oldDelegate.totalCount != totalCount ||
        oldDelegate.selectedIndex != selectedIndex ||
        oldDelegate.selectionProgress != selectionProgress;
  }
}

// ─── Legend item ────────────────────────────────────────────────────

class _LegendItem extends StatelessWidget {
  final _DonutSegment segment;
  final KaipaColors colors;
  final bool isDimmed;
  final VoidCallback? onTap;

  const _LegendItem({required this.segment, required this.colors, this.isDimmed = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedOpacity(
        opacity: isDimmed ? 0.35 : 1.0,
        duration: const Duration(milliseconds: 200),
        child: Row(
          children: [
            Container(width: 7, height: 7, decoration: BoxDecoration(color: segment.color, shape: BoxShape.circle)),
            const SizedBox(width: 5),
            Flexible(child: Text(segment.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: colors.ink))),
            const Spacer(),
            Text(segment.price, style: TextStyle(fontSize: 10, color: colors.inkDim)),
          ],
        ),
      ),
    );
  }
}

// ─── Stat item ──────────────────────────────────────────────────────

class _StatItem extends StatelessWidget {
  final String value;
  final String unit;
  final String label;
  final KaipaColors colors;

  const _StatItem({required this.value, required this.unit, required this.label, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        RichText(
          text: TextSpan(children: [
            TextSpan(text: value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4, height: 1)),
            TextSpan(text: unit, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
          ]),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
      ],
    );
  }
}

// ─── Preset card ────────────────────────────────────────────────────

class _PresetCard extends StatelessWidget {
  final String name;
  final String spec;
  final Color dotColor;
  final KaipaColors colors;

  const _PresetCard({required this.name, required this.spec, required this.dotColor, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 150),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.line, width: 0.5)),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Text(name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3)),
          ]),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(spec, style: TextStyle(fontSize: 11.5, color: colors.inkMuted)),
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
    required this.icon, required this.name, required this.count, required this.weightKg, required this.colors, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 116),
        decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.line, width: 0.5)),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: colors.mossSoft, borderRadius: BorderRadius.circular(10)),
              child: Center(child: KaipaIcon(name: icon, size: 18, color: colors.mossDeep)),
            ),
            const SizedBox(height: 12),
            Text(name, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.2)),
            const SizedBox(height: 4),
            Text('$count 件 · ${weightKg.toStringAsFixed(1)}kg', style: TextStyle(fontSize: 11.5, color: colors.inkMuted)),
          ],
        ),
      ),
    );
  }
}
