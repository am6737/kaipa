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
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CreatePresetSheet(
        existingNames: presets.map((p) => p.name).toList(),
      ),
    ).then((created) {
      if (created == true) ref.invalidate(gearPresetsProvider);
    });
  }

  Future<void> _renamePreset(GearPresetModel preset) async {
    final colors = context.kaipaTokens.color;
    final controller = TextEditingController(text: preset.name);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('重命名预设', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink)),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 20,
          style: TextStyle(fontSize: 16, color: colors.ink),
          decoration: InputDecoration(
            hintText: '预设名称',
            hintStyle: TextStyle(color: colors.inkMuted),
            counterText: '',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: colors.line),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: colors.flare, width: 1.5),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('取消', style: TextStyle(color: colors.inkMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: Text('确定', style: TextStyle(color: colors.flare, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    controller.dispose();
    if (newName == null || newName.isEmpty || newName == preset.name) return;

    if (newName.length > 20) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('名称最多 20 个字符')),
        );
      }
      return;
    }

    try {
      await ref.read(gearRepositoryProvider).renamePreset(presetId: preset.id, newName: newName);
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('重命名失败: $e')));
      }
    }
  }

  Future<bool> _deletePreset(GearPresetModel preset) async {
    final colors = context.kaipaTokens.color;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('删除预设', style: TextStyle(color: colors.ink)),
        content: Text(
          '确定要删除「${preset.name}」吗？装备本身不会被删除。',
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

    if (confirmed != true) return false;

    try {
      await ref.read(gearRepositoryProvider).deletePreset(presetId: preset.id);
      ref.invalidate(gearPresetsProvider);
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $e')));
      }
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.kaipaTokens.color;
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
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4),
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
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('加载失败', style: TextStyle(color: colors.ink)),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => ref.invalidate(gearPresetsProvider),
              child: Text('重试', style: TextStyle(color: colors.flare)),
            ),
          ]),
        ),
        data: (presets) => presets.isEmpty
            ? _buildEmptyState(colors, presets)
            : _buildList(colors, presets),
      ),
    );
  }

  Widget _buildEmptyState(KaipaColors colors, List<GearPresetModel> presets) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
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
      ]),
    );
  }

  Widget _buildList(KaipaColors colors, List<GearPresetModel> presets) {
    final dotColors = [colors.moss, colors.flare, colors.sky, colors.sand, colors.inkMuted];

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      itemCount: presets.length,
      itemBuilder: (context, index) {
        final preset = presets[index];
        final dotColor = dotColors[index % dotColors.length];
        final weightKg = preset.totalWeightG / 1000;

        return Dismissible(
          key: ValueKey(preset.id),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            margin: const EdgeInsets.symmetric(vertical: 4),
            decoration: BoxDecoration(
              color: colors.diff.extreme,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.delete_outline, color: Colors.white, size: 20),
              const SizedBox(height: 2),
              const Text('删除', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w500)),
            ]),
          ),
          confirmDismiss: (_) => _deletePreset(preset),
          child: GestureDetector(
            onTap: () => context.go('/gear/preset/${preset.id}'),
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: const EdgeInsets.fromLTRB(16, 14, 6, 14),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Row(children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        preset.name,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${preset.itemCount} 件 · ${weightKg.toStringAsFixed(1)}kg',
                        style: TextStyle(fontSize: 12, color: colors.inkMuted),
                      ),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  icon: KaipaIcon(name: KaipaIcons.ellipsis, size: 18, color: colors.inkMuted),
                  color: colors.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: EdgeInsets.zero,
                  onSelected: (v) async {
                    if (v == 'rename') await _renamePreset(preset);
                    if (v == 'delete') await _deletePreset(preset);
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(
                      value: 'rename',
                      child: Row(children: [
                        Icon(Icons.edit_outlined, size: 18, color: colors.ink),
                        const SizedBox(width: 12),
                        Text('重命名', style: TextStyle(color: colors.ink)),
                      ]),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(children: [
                        Icon(Icons.delete_outline, size: 18, color: colors.diff.extreme),
                        const SizedBox(width: 12),
                        Text('删除', style: TextStyle(color: colors.diff.extreme)),
                      ]),
                    ),
                  ],
                ),
                KaipaIcon(name: KaipaIcons.chevronRight, size: 16, color: colors.inkDim),
                const SizedBox(width: 4),
              ]),
            ),
          ),
        );
      },
    );
  }
}
