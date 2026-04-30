import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import 'widgets/add_preset_items_sheet.dart';

class PresetDetailScreen extends ConsumerStatefulWidget {
  final String presetId;

  const PresetDetailScreen({super.key, required this.presetId});

  @override
  ConsumerState<PresetDetailScreen> createState() => _PresetDetailScreenState();
}

class _PresetDetailScreenState extends ConsumerState<PresetDetailScreen> {
  String? _presetName;
  bool _isEditingName = false;
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _loadPresetName() {
    final presetsAsync = ref.read(gearPresetsProvider);
    presetsAsync.whenData((presets) {
      final preset = presets.where((p) => p.id == widget.presetId).firstOrNull;
      if (preset != null && mounted) {
        setState(() => _presetName = preset.name);
      }
    });
  }

  void _startRename() {
    _nameController.text = _presetName ?? '';
    setState(() => _isEditingName = true);
  }

  Future<void> _saveRename() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty || newName == _presetName) {
      setState(() => _isEditingName = false);
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.renamePreset(presetId: widget.presetId, newName: newName);
      ref.invalidate(gearPresetsProvider);
      setState(() {
        _presetName = newName;
        _isEditingName = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
  }

  Future<void> _removeItem(GearItemModel item) async {
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.removeItemFromPreset(presetId: widget.presetId, itemId: item.id);
      ref.invalidate(presetItemsProvider(widget.presetId));
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('移除失败: $e')),
        );
      }
    }
  }

  void _showAddItemsSheet(List<GearItemModel> currentItems) {
    final colors = context.kaipaTokens.color;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => AddPresetItemsSheet(
        presetId: widget.presetId,
        currentItemIds: currentItems.map((i) => i.id).toList(),
      ),
    ).then((saved) {
      if (saved == true) {
        ref.invalidate(presetItemsProvider(widget.presetId));
        ref.invalidate(gearPresetsProvider);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final itemsAsync = ref.watch(presetItemsProvider(widget.presetId));

    if (_presetName == null) _loadPresetName();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: KaipaIcon(name: KaipaIcons.back, size: 22, color: colors.ink),
        ),
        title: _isEditingName
            ? TextField(
                controller: _nameController,
                autofocus: true,
                maxLength: 20,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink),
                decoration: InputDecoration(
                  isDense: true,
                  counterText: '',
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: colors.flare),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: colors.flare, width: 1.5),
                  ),
                ),
                onSubmitted: (_) => _saveRename(),
              )
            : GestureDetector(
                onTap: _startRename,
                child: Text(
                  _presetName ?? '预设',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
        actions: [
          if (_isEditingName)
            IconButton(
              onPressed: _saveRename,
              icon: Icon(Icons.check, size: 22, color: colors.flare),
            ),
        ],
      ),
      body: itemsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: colors.ink)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(presetItemsProvider(widget.presetId)),
                child: Text('重试', style: TextStyle(color: colors.flare)),
              ),
            ],
          ),
        ),
        data: (items) => _buildContent(colors, items),
      ),
      floatingActionButton: itemsAsync.whenOrNull(
        data: (items) => FloatingActionButton(
          onPressed: () => _showAddItemsSheet(items),
          backgroundColor: colors.flare,
          child: const KaipaIcon(name: KaipaIcons.plus, size: 20, color: Colors.white, strokeWidth: 2.0),
        ),
      ),
    );
  }

  Widget _buildContent(KaipaColors colors, List<GearItemModel> items) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(name: KaipaIcons.backpack, size: 48, color: colors.inkDim),
            const SizedBox(height: 16),
            Text(
              '还没有装备',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink),
            ),
            const SizedBox(height: 8),
            Text(
              '点击右下角按钮添加装备到此预设',
              style: TextStyle(fontSize: 13, color: colors.inkMuted),
            ),
          ],
        ),
      );
    }

    final totalWeight = items.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text(
            '${items.length} 件装备 · ${(totalWeight / 1000).toStringAsFixed(1)}kg',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return Dismissible(
                key: ValueKey(item.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  margin: const EdgeInsets.only(bottom: 6),
                  decoration: BoxDecoration(
                    color: colors.diff.extreme,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.delete_outline, color: Colors.white, size: 20),
                ),
                onDismissed: (_) => _removeItem(item),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Row(
                    children: [
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
                            ),
                            if (item.brand != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                item.brand!,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.inkMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (item.weightG != null)
                        Text(
                          '${(item.weightG! / 1000).toStringAsFixed(1)}kg',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: colors.inkDim,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
