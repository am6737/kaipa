import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../gear/data/gear_repository.dart';
import '../../domain/trip_plan_model.dart';
import '../../data/trip_plan_repository.dart';

class GearChecklist extends ConsumerWidget {
  final String planId;
  final List<TripPlanGearItem> gearItems;
  final VoidCallback onChanged;

  const GearChecklist({
    super.key,
    required this.planId,
    required this.gearItems,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final packedCount = gearItems.where((g) => g.isPacked).length;
    final totalWeight = gearItems.fold<double>(
        0, (sum, g) => sum + (g.gearItem?.weightG ?? 0));
    final allPacked = gearItems.isNotEmpty && packedCount == gearItems.length;

    final categoryMap = categoriesAsync.whenOrNull(
      data: (cats) => {for (final c in cats) c.id: c.name},
    ) ?? {};

    final grouped = <String, List<TripPlanGearItem>>{};
    for (final item in gearItems) {
      final catId = item.gearItem?.categoryId ?? 'unknown';
      grouped.putIfAbsent(catId, () => []).add(item);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header row
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '装备清单',
              style: TextStyle(
                color: colors.ink,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
            Row(
              children: [
                Text(
                  '$packedCount/${gearItems.length} 已打包 · ${(totalWeight / 1000).toStringAsFixed(1)}kg',
                  style: TextStyle(color: colors.inkMuted, fontSize: 12),
                ),
                const SizedBox(width: 8),
                _SelectAllButton(
                  allSelected: allPacked,
                  colors: colors,
                  onTap: () async {
                    final repo = ref.read(tripPlanRepositoryProvider);
                    final ids = gearItems.map((g) => g.gearItemId).toList();
                    await repo.batchTogglePacked(
                      planId: planId,
                      gearItemIds: ids,
                      isPacked: !allPacked,
                    );
                    onChanged();
                  },
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Progress bar
        Container(
          height: 6,
          decoration: BoxDecoration(
            color: colors.surfaceHi,
            borderRadius: BorderRadius.circular(3),
          ),
          child: FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: gearItems.isEmpty ? 0 : packedCount / gearItems.length,
            child: Container(
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        ),
        const SizedBox(height: KaipaSpace.s4),

        // Category sections
        for (final entry in grouped.entries) ...[
          _CategorySection(
            planId: planId,
            categoryName: categoryMap[entry.key] ?? '其他',
            items: entry.value,
            colors: colors,
            onChanged: onChanged,
          ),
          const SizedBox(height: KaipaSpace.s2),
        ],
      ],
    );
  }
}

class _SelectAllButton extends StatelessWidget {
  final bool allSelected;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _SelectAllButton({
    required this.allSelected,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: allSelected ? colors.flareSoft : colors.surfaceHi,
          borderRadius: BorderRadius.circular(KaipaRadius.pill),
        ),
        child: Text(
          allSelected ? '取消全选' : '全选',
          style: TextStyle(
            color: allSelected ? colors.flare : colors.inkDim,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _CategorySection extends ConsumerStatefulWidget {
  final String planId;
  final String categoryName;
  final List<TripPlanGearItem> items;
  final KaipaColors colors;
  final VoidCallback onChanged;

  const _CategorySection({
    required this.planId,
    required this.categoryName,
    required this.items,
    required this.colors,
    required this.onChanged,
  });

  @override
  ConsumerState<_CategorySection> createState() => _CategorySectionState();
}

class _CategorySectionState extends ConsumerState<_CategorySection> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final colors = widget.colors;
    final items = widget.items;
    final catPacked = items.where((g) => g.isPacked).length;
    final allPacked = catPacked == items.length;

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: [
          // Category header (tappable)
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: KaipaSpace.s4, vertical: KaipaSpace.s3),
              child: Row(
                children: [
                  // Category select-all checkbox
                  GestureDetector(
                    onTap: () async {
                      final repo = ref.read(tripPlanRepositoryProvider);
                      final ids = items.map((g) => g.gearItemId).toList();
                      await repo.batchTogglePacked(
                        planId: widget.planId,
                        gearItemIds: ids,
                        isPacked: !allPacked,
                      );
                      widget.onChanged();
                    },
                    child: Container(
                      width: 20,
                      height: 20,
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: allPacked ? colors.flare : Colors.transparent,
                        borderRadius: BorderRadius.circular(5),
                        border: allPacked
                            ? null
                            : Border.all(
                                color: catPacked > 0
                                    ? colors.flare.withAlpha(128)
                                    : colors.line,
                                width: 1.5,
                              ),
                      ),
                      child: allPacked
                          ? const Icon(Icons.check, color: Colors.white, size: 13)
                          : catPacked > 0
                              ? Icon(Icons.remove, color: colors.flare, size: 13)
                              : null,
                    ),
                  ),
                  // Category name
                  Expanded(
                    child: Text(
                      widget.categoryName,
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ),
                  // Count badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: allPacked
                          ? colors.flareSoft
                          : colors.surfaceHi,
                      borderRadius: BorderRadius.circular(KaipaRadius.pill),
                    ),
                    child: Text(
                      '$catPacked/${items.length}',
                      style: TextStyle(
                        color: allPacked ? colors.flare : colors.inkDim,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  // Chevron
                  AnimatedRotation(
                    turns: _expanded ? 0 : -0.25,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      Icons.keyboard_arrow_down,
                      size: 18,
                      color: colors.inkDim,
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Items (collapsible)
          AnimatedCrossFade(
            firstChild: Column(
              children: [
                Divider(height: 0.5, thickness: 0.5, color: colors.line,
                    indent: KaipaSpace.s4, endIndent: KaipaSpace.s4),
                for (int i = 0; i < items.length; i++) ...[
                  if (i > 0)
                    Divider(height: 0.5, thickness: 0.5, color: colors.line,
                        indent: KaipaSpace.s9, endIndent: KaipaSpace.s4),
                  _GearItemRow(
                    planId: widget.planId,
                    item: items[i],
                    colors: colors,
                    onChanged: widget.onChanged,
                  ),
                ],
              ],
            ),
            secondChild: const SizedBox.shrink(),
            crossFadeState: _expanded
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            duration: const Duration(milliseconds: 200),
          ),
        ],
      ),
    );
  }
}

class _GearItemRow extends ConsumerWidget {
  final String planId;
  final TripPlanGearItem item;
  final KaipaColors colors;
  final VoidCallback onChanged;

  const _GearItemRow({
    required this.planId,
    required this.item,
    required this.colors,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gearItem = item.gearItem;
    final name = gearItem?.name ?? '未知装备';
    final brand = gearItem?.brand;
    final weight = gearItem?.weightG;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () async {
        final repo = ref.read(tripPlanRepositoryProvider);
        await repo.togglePacked(
          planId: planId,
          gearItemId: item.gearItemId,
          isPacked: !item.isPacked,
        );
        onChanged();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(
            horizontal: KaipaSpace.s4, vertical: KaipaSpace.s3),
        child: Row(
          children: [
            // Checkbox
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: item.isPacked ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: item.isPacked
                    ? null
                    : Border.all(color: colors.line, width: 1.5),
              ),
              child: item.isPacked
                  ? const Icon(Icons.check, color: Colors.white, size: 14)
                  : null,
            ),
            const SizedBox(width: KaipaSpace.s3),
            // Name + brand
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: TextStyle(
                      color: item.isPacked ? colors.inkDim : colors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      decoration:
                          item.isPacked ? TextDecoration.lineThrough : null,
                      decorationColor: colors.inkDim,
                    ),
                  ),
                  if (brand != null)
                    Text(
                      brand,
                      style: TextStyle(
                        color: colors.inkDim,
                        fontSize: 11,
                      ),
                    ),
                ],
              ),
            ),
            // Badge or weight
            if (item.isRecommended && !item.isPacked)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: colors.flareSoft,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '推荐',
                  style: TextStyle(color: colors.flare, fontSize: 10,
                      fontWeight: FontWeight.w600),
                ),
              )
            else if (weight != null)
              Text(
                '${weight.toInt()}g',
                style: TextStyle(color: colors.inkDim, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}
