import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../data/gear_repository.dart';
import '../../domain/gear_category_model.dart';
import '../../domain/gear_item_model.dart';

class AddPresetItemsSheet extends ConsumerStatefulWidget {
  final String presetId;
  final List<String> currentItemIds;

  const AddPresetItemsSheet({
    super.key,
    required this.presetId,
    required this.currentItemIds,
  });

  @override
  ConsumerState<AddPresetItemsSheet> createState() => _AddPresetItemsSheetState();
}

class _AddPresetItemsSheetState extends ConsumerState<AddPresetItemsSheet> {
  late Set<String> _selectedIds;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _selectedIds = Set<String>.from(widget.currentItemIds);
  }

  Future<void> _save() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.setPresetItems(
        presetId: widget.presetId,
        itemIds: _selectedIds.toList(),
      );
      ref.invalidate(presetItemsProvider(widget.presetId));
      ref.invalidate(gearPresetsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final itemsAsync = ref.watch(allGearItemsProvider);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Column(
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colors.inkDim,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '选择装备',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.ink,
                        letterSpacing: -0.4,
                      ),
                    ),
                    Text(
                      '已选 ${_selectedIds.length} 件',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: categoriesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
              data: (categories) => itemsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
                data: (items) => _buildItemsList(colors, categories, items),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).viewPadding.bottom + 20),
            child: SizedBox(
              height: 48,
              width: double.infinity,
              child: ElevatedButton(
                onPressed: !_isSaving ? _save : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  disabledBackgroundColor: colorWithOpacity(colors.flare, 0.3),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text(
                        '确定',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsList(
    KaipaColors colors,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
  ) {
    final visibleCategories = categories.where((c) => !c.isUncategorized).toList();

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      itemCount: visibleCategories.length,
      itemBuilder: (context, catIndex) {
        final cat = visibleCategories[catIndex];
        final catItems = items
            .where((item) => item.categoryId == cat.id || item.categoryId == cat.builtinRef)
            .toList();

        if (catItems.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (catIndex > 0) const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                cat.name,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.inkMuted,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            ...catItems.map((item) => _buildItemTile(item, colors)),
          ],
        );
      },
    );
  }

  Widget _buildItemTile(GearItemModel item, KaipaColors colors) {
    final isSelected = _selectedIds.contains(item.id);
    final weightStr = item.weightG != null ? '${(item.weightG! / 1000).toStringAsFixed(1)}kg' : '';

    return GestureDetector(
      onTap: () {
        setState(() {
          if (isSelected) {
            _selectedIds.remove(item.id);
          } else {
            _selectedIds.add(item.id);
          }
        });
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          color: isSelected ? colorWithOpacity(colors.flare, 0.08) : colors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? colorWithOpacity(colors.flare, 0.3) : colors.lineSoft,
            width: 0.5,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: isSelected ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.inkDim,
                  width: 1.5,
                ),
              ),
              child: isSelected
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                item.name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: colors.ink,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            if (weightStr.isNotEmpty)
              Text(
                weightStr,
                style: TextStyle(
                  fontSize: 12,
                  color: colors.inkDim,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
