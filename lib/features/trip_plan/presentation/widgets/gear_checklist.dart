import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/widgets/kaipa_icons.dart';
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

    final categoryFullMap = categoriesAsync.whenOrNull(
      data: (cats) => {for (final c in cats) c.id: c},
    ) ?? {};

    final grouped = <String, List<TripPlanGearItem>>{};
    for (final item in gearItems) {
      final catId = item.gearItem?.categoryId ?? 'unknown';
      grouped.putIfAbsent(catId, () => []).add(item);
    }

    final sortedEntries = grouped.entries.toList()
      ..sort((a, b) {
        final aOrder = categoryFullMap[a.key]?.sortOrder ?? 999;
        final bOrder = categoryFullMap[b.key]?.sortOrder ?? 999;
        return aOrder.compareTo(bOrder);
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.line, width: 0.5)),
          ),
          child: Column(children: [
            Row(children: [
              Text(
                '$packedCount/${gearItems.length} 已打包',
                style: TextStyle(color: colors.inkMuted, fontSize: 12),
              ),
              const Spacer(),
              Text(
                '${(totalWeight / 1000).toStringAsFixed(1)}kg',
                style: TextStyle(color: colors.inkMuted, fontSize: 12),
              ),
              const SizedBox(width: 10),
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
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: gearItems.isEmpty ? 0 : packedCount / gearItems.length,
                minHeight: 3,
                backgroundColor: colors.surfaceHi,
                color: allPacked ? colors.moss : colors.flare,
              ),
            ),
          ]),
        ),

        for (final entry in sortedEntries)
          _CategorySection(
            planId: planId,
            categoryName: categoryFullMap[entry.key]?.name ?? '其他',
            categoryIcon: categoryFullMap[entry.key]?.icon,
            items: entry.value,
            colors: colors,
            onChanged: onChanged,
          ),
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
      child: Text(
        allSelected ? '取消全选' : '全选',
        style: TextStyle(
          color: allSelected ? colors.flare : colors.inkDim,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _CategorySection extends ConsumerStatefulWidget {
  final String planId;
  final String categoryName;
  final String? categoryIcon;
  final List<TripPlanGearItem> items;
  final KaipaColors colors;
  final VoidCallback onChanged;

  const _CategorySection({
    required this.planId,
    required this.categoryName,
    this.categoryIcon,
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

    return Column(
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _expanded = !_expanded),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              border: Border(top: BorderSide(color: colors.line, width: 0.5)),
            ),
            child: Row(
              children: [
                if (widget.categoryIcon != null) ...[
                  KaipaIcon(
                    name: widget.categoryIcon!,
                    size: 14,
                    color: colors.inkMuted,
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    widget.categoryName,
                    style: TextStyle(
                      color: colors.ink,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
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
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: allPacked
                          ? colors.moss.withAlpha(26)
                          : colors.surface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: allPacked
                            ? colors.moss.withAlpha(77)
                            : colors.line,
                        width: 0.5,
                      ),
                    ),
                    child: Text(
                      '$catPacked/${items.length}',
                      style: TextStyle(
                        color: allPacked ? colors.moss : colors.inkDim,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                AnimatedRotation(
                  turns: _expanded ? 0 : -0.25,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(
                    Icons.keyboard_arrow_down,
                    size: 16,
                    color: colors.inkDim,
                  ),
                ),
              ],
            ),
          ),
        ),
        AnimatedCrossFade(
          firstChild: Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 4),
            child: Column(
              children: [
                for (int i = 0; i < items.length; i++)
                  _GearItemRow(
                    planId: widget.planId,
                    item: items[i],
                    colors: colors,
                    onChanged: widget.onChanged,
                  ),
              ],
            ),
          ),
          secondChild: const SizedBox.shrink(),
          crossFadeState: _expanded
              ? CrossFadeState.showFirst
              : CrossFadeState.showSecond,
          duration: const Duration(milliseconds: 200),
        ),
      ],
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: [
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: item.isPacked ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
                border: item.isPacked
                    ? null
                    : Border.all(color: colors.line, width: 1.5),
              ),
              child: item.isPacked
                  ? const Icon(Icons.check, color: Colors.white, size: 12)
                  : null,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                name,
                style: TextStyle(
                  color: item.isPacked ? colors.inkDim : colors.ink,
                  fontSize: 13,
                  decoration: item.isPacked ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            if (weight != null && weight > 0)
              Text(
                '${weight.toInt()}g',
                style: TextStyle(color: colors.inkDim, fontSize: 11),
              ),
          ],
        ),
      ),
    );
  }
}
