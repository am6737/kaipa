import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_preset_model.dart';
import 'widgets/create_preset_sheet.dart';

class PresetManagementScreen extends ConsumerStatefulWidget {
  const PresetManagementScreen({super.key});

  @override
  ConsumerState<PresetManagementScreen> createState() => _PresetManagementScreenState();
}

class _PresetManagementScreenState extends ConsumerState<PresetManagementScreen> {
  String? _editingId;
  final _editController = TextEditingController();

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  void _startEditing(GearPresetModel preset) {
    setState(() {
      _editingId = preset.id;
      _editController.text = preset.name;
    });
  }

  Future<void> _saveEdit(GearPresetModel preset) async {
    final newName = _editController.text.trim();
    if (newName.isEmpty || newName == preset.name) {
      setState(() => _editingId = null);
      return;
    }

    if (newName.length > 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('名称最多 20 个字符')),
      );
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.renamePreset(presetId: preset.id, newName: newName);
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
    setState(() => _editingId = null);
  }

  Future<void> _deletePreset(GearPresetModel preset) async {
    final colors = context.kaipaTokens.color;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text('删除预设', style: TextStyle(color: colors.ink)),
        content: Text(
          '确定要删除「${preset.name}」吗？',
          style: TextStyle(color: colors.inkMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('取消', style: TextStyle(color: colors.inkMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('删除', style: TextStyle(color: colors.diff.extreme)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.deletePreset(presetId: preset.id);
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败: $e')),
        );
      }
    }
  }

  void _showCreateSheet(List<GearPresetModel> presets) {
    if (presets.length >= 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多创建 20 个预设')),
      );
      return;
    }

    final colors = context.kaipaTokens.color;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CreatePresetSheet(
        existingNames: presets.map((p) => p.name).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final presetsAsync = ref.watch(gearPresetsProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: KaipaIcon(name: KaipaIcons.back, size: 22, color: colors.ink),
        ),
        title: Text(
          '预设管理',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.4,
          ),
        ),
        actions: [
          presetsAsync.whenOrNull(
            data: (presets) => IconButton(
              onPressed: () => _showCreateSheet(presets),
              icon: KaipaIcon(name: KaipaIcons.plus, size: 22, color: colors.flare),
            ),
          ) ?? const SizedBox.shrink(),
        ],
      ),
      body: presetsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: colors.ink)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(gearPresetsProvider),
                child: Text('重试', style: TextStyle(color: colors.flare)),
              ),
            ],
          ),
        ),
        data: (presets) => presets.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    KaipaIcon(name: KaipaIcons.backpack, size: 48, color: colors.inkDim),
                    const SizedBox(height: 16),
                    Text('还没有预设', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
                    const SizedBox(height: 8),
                    Text('创建预设来快速管理不同场景的装备', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () => _showCreateSheet(presets),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colors.flare,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      ),
                      child: const Text('新建预设', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              )
            : _buildList(colors, presets),
      ),
    );
  }

  Widget _buildList(KaipaColors colors, List<GearPresetModel> presets) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: presets.length,
      itemBuilder: (context, index) {
        final preset = presets[index];
        final isEditing = _editingId == preset.id;
        final weightKg = preset.totalWeightG / 1000;

        return GestureDetector(
          onTap: isEditing ? null : () => context.go('/gear/preset/${preset.id}'),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(
              children: [
                Expanded(
                  child: isEditing
                      ? TextField(
                          controller: _editController,
                          autofocus: true,
                          maxLength: 20,
                          style: TextStyle(fontSize: 15, color: colors.ink),
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
                          onSubmitted: (_) => _saveEdit(preset),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              preset.name,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${preset.itemCount} 件 · ${weightKg.toStringAsFixed(1)}kg',
                              style: TextStyle(fontSize: 12, color: colors.inkMuted),
                            ),
                          ],
                        ),
                ),
                if (!isEditing) ...[
                  IconButton(
                    onPressed: () => _startEditing(preset),
                    icon: Icon(Icons.edit_outlined, size: 18, color: colors.inkMuted),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    padding: EdgeInsets.zero,
                  ),
                  IconButton(
                    onPressed: () => _deletePreset(preset),
                    icon: Icon(Icons.delete_outline, size: 18, color: colors.diff.extreme),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    padding: EdgeInsets.zero,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
