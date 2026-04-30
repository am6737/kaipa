import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import 'widgets/create_category_sheet.dart';

class CategoryManagementScreen extends ConsumerStatefulWidget {
  const CategoryManagementScreen({super.key});

  @override
  ConsumerState<CategoryManagementScreen> createState() => _CategoryManagementScreenState();
}

class _CategoryManagementScreenState extends ConsumerState<CategoryManagementScreen> {
  List<GearCategoryModel> _categories = [];
  bool _isLoading = true;
  String? _editingId;
  final _editController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      final cats = await repo.getUserCategories();
      if (mounted) setState(() { _categories = cats; _isLoading = false; });
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载失败: $e')),
        );
      }
    }
  }

  List<GearCategoryModel> get _reorderableCategories =>
      _categories.where((c) => !c.isUncategorized).toList();

  GearCategoryModel? get _uncategorized =>
      _categories.where((c) => c.isUncategorized).isEmpty
          ? null
          : _categories.firstWhere((c) => c.isUncategorized);

  Future<void> _onReorder(int oldIndex, int newIndex) async {
    final list = _reorderableCategories;
    if (newIndex > oldIndex) newIndex--;
    final item = list.removeAt(oldIndex);
    list.insert(newIndex, item);

    final updatedIds = list.map((c) => c.id).toList();
    setState(() {
      _categories = [...list, if (_uncategorized != null) _uncategorized!];
    });

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.reorderCategories(orderedIds: updatedIds);
      ref.invalidate(gearCategoriesProvider);
    } catch (e) {
      _loadCategories();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('排序失败: $e')),
        );
      }
    }
  }

  void _startEditing(GearCategoryModel category) {
    setState(() {
      _editingId = category.id;
      _editController.text = category.name;
    });
  }

  Future<void> _saveEdit(GearCategoryModel category) async {
    final newName = _editController.text.trim();
    if (newName.isEmpty || newName == category.name) {
      setState(() => _editingId = null);
      return;
    }

    if (newName.length > 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('名称最多 10 个字符')),
      );
      return;
    }

    if (_categories.any((c) => c.id != category.id && c.name == newName)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('分类名称已存在')),
      );
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      if (category.isBuiltin) {
        await repo.renameBuiltinCategory(builtinId: category.id, newName: newName);
      } else if (category.isOverride) {
        await repo.renameCustomCategory(categoryId: category.id, newName: newName);
      } else {
        await repo.renameCustomCategory(categoryId: category.id, newName: newName);
      }
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
    setState(() => _editingId = null);
  }

  Future<void> _resetBuiltin(GearCategoryModel category) async {
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.resetBuiltinCategory(overrideId: category.id);
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已恢复为「${category.originalName}」')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('恢复失败: $e')),
        );
      }
    }
  }

  Future<void> _deleteCategory(GearCategoryModel category) async {
    final repo = ref.read(gearRepositoryProvider);
    final itemCount = await repo.getItemCountForCategory(category.id);

    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final colors = context.kaipaTokens.color;
        return AlertDialog(
          backgroundColor: colors.surface,
          title: Text('删除分类', style: TextStyle(color: colors.ink)),
          content: Text(
            itemCount > 0
                ? '该分类下的 $itemCount 件装备将移至「未分类」'
                : '确定要删除「${category.name}」吗？',
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
        );
      },
    );

    if (confirmed != true) return;

    try {
      await repo.deleteCustomCategory(categoryId: category.id);
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败: $e')),
        );
      }
    }
  }

  void _showCreateSheet() {
    final customCount = _categories.where((c) => c.isCustom).length;
    if (customCount >= 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多创建 20 个自定义分类')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.kaipaTokens.color.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CreateCategorySheet(existingCategories: _categories),
    ).then((created) {
      if (created == true) _loadCategories();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

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
          '管理分类',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.4,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _showCreateSheet,
            icon: KaipaIcon(name: KaipaIcons.plus, size: 22, color: colors.flare),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildList(colors),
    );
  }

  Widget _buildList(KaipaColors colors) {
    final reorderable = _reorderableCategories;
    final uncategorized = _uncategorized;

    return Column(
      children: [
        Expanded(
          child: ReorderableListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: reorderable.length,
            onReorder: _onReorder,
            proxyDecorator: (child, index, animation) {
              return Material(
                elevation: 4,
                color: colors.surface,
                borderRadius: BorderRadius.circular(12),
                child: child,
              );
            },
            itemBuilder: (context, index) {
              final cat = reorderable[index];
              return _buildCategoryTile(cat, colors, key: ValueKey(cat.id));
            },
          ),
        ),
        if (uncategorized != null) ...[
          Divider(height: 1, color: colors.line),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: _buildUncategorizedTile(uncategorized, colors),
          ),
        ],
      ],
    );
  }

  Widget _buildCategoryTile(GearCategoryModel cat, KaipaColors colors, {Key? key}) {
    final isEditing = _editingId == cat.id;

    return Container(
      key: key,
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          Icon(Icons.drag_handle, size: 20, color: colors.inkDim),
          const SizedBox(width: 10),
          _buildCategoryIcon(cat, colors),
          const SizedBox(width: 12),
          Expanded(
            child: isEditing
                ? TextField(
                    controller: _editController,
                    autofocus: true,
                    maxLength: 10,
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
                    onSubmitted: (_) => _saveEdit(cat),
                    onEditingComplete: () => _saveEdit(cat),
                  )
                : Text(
                    cat.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    ),
                  ),
          ),
          if (!isEditing) ..._buildActions(cat, colors),
        ],
      ),
    );
  }

  Widget _buildCategoryIcon(GearCategoryModel cat, KaipaColors colors) {
    if (cat.iconType == 'emoji') {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: colors.flareSoft,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Text(cat.icon, style: const TextStyle(fontSize: 18)),
        ),
      );
    }
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: colors.flareSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: KaipaIcon(name: cat.icon, size: 18, color: colors.flare),
      ),
    );
  }

  List<Widget> _buildActions(GearCategoryModel cat, KaipaColors colors) {
    final actions = <Widget>[];

    actions.add(
      IconButton(
        onPressed: () => _startEditing(cat),
        icon: Icon(Icons.edit_outlined, size: 18, color: colors.inkMuted),
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        padding: EdgeInsets.zero,
        tooltip: '重命名',
      ),
    );

    if (cat.isOverride && cat.isRenamed) {
      actions.add(
        IconButton(
          onPressed: () => _resetBuiltin(cat),
          icon: Icon(Icons.restore, size: 18, color: colors.sky),
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          padding: EdgeInsets.zero,
          tooltip: '恢复默认',
        ),
      );
    }

    if (cat.isCustom) {
      actions.add(
        IconButton(
          onPressed: () => _deleteCategory(cat),
          icon: Icon(Icons.delete_outline, size: 18, color: colors.diff.extreme),
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          padding: EdgeInsets.zero,
          tooltip: '删除',
        ),
      );
    }

    return actions;
  }

  Widget _buildUncategorizedTile(GearCategoryModel cat, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colorWithOpacity(colors.surface, 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const SizedBox(width: 30),
          _buildCategoryIcon(cat, colors),
          const SizedBox(width: 12),
          Text(
            cat.name,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: colors.inkDim,
              letterSpacing: -0.2,
            ),
          ),
          const Spacer(),
          Text(
            '固定',
            style: TextStyle(fontSize: 12, color: colors.inkDim),
          ),
        ],
      ),
    );
  }
}
