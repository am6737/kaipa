import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/glass_container.dart';

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
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        title: Text(
          '装备库',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.3,
          ),
        ),
        actions: [
          IconButton(
            onPressed: () {
              // Navigate to add gear (placeholder for future implementation)
            },
            icon: KaipaIcon(
              name: KaipaIcons.plus,
              size: 22,
              color: colors.ink,
            ),
          ),
        ],
      ),
      body: categoriesAsync.when(
        loading: () => _buildShimmerLoading(colors),
        error: (error, stack) => _buildErrorState(colors, error, ref),
        data: (categories) {
          return itemsAsync.when(
            loading: () => _buildShimmerLoading(colors),
            error: (error, stack) => _buildErrorState(colors, error, ref),
            data: (items) {
              if (categories.isEmpty && items.isEmpty) {
                return _buildEmptyState(colors);
              }
              return _buildContent(
                context,
                colors,
                categories,
                items,
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
  ) {
    // Compute item count per category
    final countByCategory = <String, int>{};
    for (final item in items) {
      countByCategory[item.categoryId] =
          (countByCategory[item.categoryId] ?? 0) + 1;
    }

    // Compute totals for summary card
    final totalItems = items.length;
    double totalWeightG = 0;
    double totalValue = 0;
    for (final item in items) {
      totalWeightG += item.weightG ?? 0;
      totalValue += item.price ?? 0;
    }
    final totalWeightKg = totalWeightG / 1000;

    return CustomScrollView(
      slivers: [
        // Summary card
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: GlassContainer(
              radius: 18,
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Expanded(
                    child: _SummaryColumn(
                      value: '$totalItems',
                      label: '装备总数',
                      colors: colors,
                    ),
                  ),
                  Container(
                    width: 0.5,
                    height: 36,
                    color: colors.line,
                  ),
                  Expanded(
                    child: _SummaryColumn(
                      value: totalWeightKg.toStringAsFixed(1),
                      label: '总重量 (kg)',
                      colors: colors,
                    ),
                  ),
                  Container(
                    width: 0.5,
                    height: 36,
                    color: colors.line,
                  ),
                  Expanded(
                    child: _SummaryColumn(
                      value: totalValue >= 10000
                          ? '${(totalValue / 10000).toStringAsFixed(1)}万'
                          : totalValue.toStringAsFixed(0),
                      label: '估值 (¥)',
                      colors: colors,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Category grid
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.3,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                final category = categories[index];
                final itemCount = countByCategory[category.id] ?? 0;
                return _CategoryCard(
                  category: category,
                  itemCount: itemCount,
                  colors: colors,
                  onTap: () {
                    context.push('/gear/category/${category.id}');
                  },
                );
              },
              childCount: categories.length,
            ),
          ),
        ),

        // Bottom padding
        const SliverToBoxAdapter(
          child: SizedBox(height: 32),
        ),
      ],
    );
  }

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

  Widget _buildShimmerLoading(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Summary card placeholder
            Container(
              height: 80,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(18),
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
                  childAspectRatio: 1.3,
                ),
                itemCount: 6,
                itemBuilder: (context, index) {
                  return Container(
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(16),
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

// ─── Summary column ──────────────────────────────────────────────────

class _SummaryColumn extends StatelessWidget {
  final String value;
  final String label;
  final KaipaColors colors;

  const _SummaryColumn({
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
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.5,
            height: 1,
          ),
        ),
        const SizedBox(height: 6),
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

// ─── Category card ───────────────────────────────────────────────────

class _CategoryCard extends StatelessWidget {
  final GearCategoryModel category;
  final int itemCount;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _CategoryCard({
    required this.category,
    required this.itemCount,
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
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: colors.flareSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: KaipaIcon(
                      name: category.icon,
                      size: 22,
                      color: colors.flare,
                    ),
                  ),
                ),
                if (itemCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: colors.flareSoft,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$itemCount',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: colors.flare,
                      ),
                    ),
                  ),
              ],
            ),
            const Spacer(),
            Text(
              category.name,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: colors.ink,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '$itemCount 件装备',
              style: TextStyle(
                fontSize: 12,
                color: colors.inkMuted,
                letterSpacing: -0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
