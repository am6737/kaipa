import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
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
    final packedCount = gearItems.where((g) => g.isPacked).length;
    final totalWeight = gearItems.fold<double>(
        0, (sum, g) => sum + (g.gearItem?.weightG ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '装备清单',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '$packedCount/${gearItems.length} 已打包 · ${(totalWeight / 1000).toStringAsFixed(1)}kg',
              style: TextStyle(color: colors.textSecondary, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: gearItems.isEmpty ? 0 : packedCount / gearItems.length,
            backgroundColor: colors.surfaceSecondary,
            color: colors.flare,
            minHeight: 4,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              for (int i = 0; i < gearItems.length; i++) ...[
                _buildGearRow(ref, gearItems[i], colors),
                if (i < gearItems.length - 1)
                  Divider(color: colors.line, height: 1, indent: 48),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGearRow(WidgetRef ref, TripPlanGearItem item, dynamic colors) {
    final gearItem = item.gearItem;
    final name = gearItem?.name ?? '未知装备';
    final weight = gearItem?.weightG;

    return InkWell(
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: item.isPacked ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
                border: item.isPacked
                    ? null
                    : Border.all(color: colors.line, width: 2),
              ),
              child: item.isPacked
                  ? const Icon(Icons.check, color: Colors.white, size: 14)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                name,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 14,
                  decoration:
                      item.isPacked ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            if (item.isRecommended && !item.isPacked)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '推荐',
                  style: TextStyle(
                      color: Colors.orange.shade700, fontSize: 10),
                ),
              )
            else if (weight != null)
              Text(
                '${weight.toInt()}g',
                style:
                    TextStyle(color: colors.textTertiary, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}
