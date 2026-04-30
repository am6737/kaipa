import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';

/// Provider to resolve a category name from its ID.
final _categoryNameProvider =
    FutureProvider.family<String, String>((ref, categoryId) async {
  final categories = await ref.watch(gearCategoriesProvider.future);
  final match = categories.where((c) => c.id == categoryId);
  return match.isNotEmpty ? match.first.name : '装备分类';
});

class GearCategoryScreen extends ConsumerWidget {
  final String categoryId;

  const GearCategoryScreen({
    super.key,
    required this.categoryId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final itemsAsync = ref.watch(gearItemsByCategoryProvider(categoryId));
    final categoryNameAsync = ref.watch(_categoryNameProvider(categoryId));

    final categoryName = categoryNameAsync.valueOrNull ?? '装备分类';

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: KaipaIcon(
            name: KaipaIcons.back,
            size: 22,
            color: colors.ink,
          ),
        ),
        title: Text(
          categoryName,
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: itemsAsync.when(
        loading: () => _buildShimmerLoading(colors),
        error: (error, stack) => _buildErrorState(colors, error, ref),
        data: (items) {
          if (items.isEmpty) {
            return _buildEmptyState(colors);
          }
          return RefreshIndicator(
            color: colors.flare,
            backgroundColor: colors.surface,
            onRefresh: () async {
              ref.invalidate(gearItemsByCategoryProvider(categoryId));
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                return _GearItemRow(
                  item: item,
                  colors: colors,
                  onTap: () {
                    context.push('/gear/item/${item.id}');
                  },
                );
              },
            ),
          );
        },
      ),
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
              size: 56,
              color: colors.inkDim,
            ),
            const SizedBox(height: 16),
            Text(
              '该分类暂无装备',
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
                ref.invalidate(gearItemsByCategoryProvider(categoryId));
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
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: 6,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          return Container(
            height: 72,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
          );
        },
      ),
    );
  }
}

// ─── Condition badge helper ─────────────────────────────────────────

class _ConditionInfo {
  final String label;
  final Color color;

  const _ConditionInfo(this.label, this.color);
}

_ConditionInfo _conditionInfo(String? condition, KaipaColors colors) {
  switch (condition) {
    case 'new':
      return _ConditionInfo('全新', colors.moss);
    case 'good':
      return _ConditionInfo('良好', colors.sky);
    case 'fair':
      return _ConditionInfo('一般', colors.sand);
    case 'worn':
      return _ConditionInfo('磨损', colors.diff.extreme);
    default:
      return _ConditionInfo('未知', colors.inkDim);
  }
}

// ─── Gear item row ──────────────────────────────────────────────────

class _GearItemRow extends StatelessWidget {
  final GearItemModel item;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _GearItemRow({
    required this.item,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final condInfo = _conditionInfo(item.condition, colors);
    final brandInitial = (item.brand != null && item.brand!.isNotEmpty)
        ? item.brand![0].toUpperCase()
        : item.name[0].toUpperCase();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            // Brand logo placeholder
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  brandInitial,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.flare,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),

            // Item info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (item.brand != null && item.brand!.isNotEmpty) ...[
                        Text(
                          item.brand!,
                          style: TextStyle(
                            fontSize: 13,
                            color: colors.inkMuted,
                            letterSpacing: -0.1,
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],
                      if (item.weightG != null)
                        Text(
                          '${item.weightG!.toStringAsFixed(0)}g',
                          style: TextStyle(
                            fontSize: 13,
                            color: colors.inkDim,
                            letterSpacing: -0.1,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(width: 10),

            // Condition badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: condInfo.color.withAlpha(26),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                condInfo.label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: condInfo.color,
                ),
              ),
            ),

            const SizedBox(width: 6),

            // Chevron
            KaipaIcon(
              name: KaipaIcons.chevronRight,
              size: 16,
              color: colors.inkDim,
            ),
          ],
        ),
      ),
    );
  }
}
