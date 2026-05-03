import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';

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
      _categories = [...list, ?_uncategorized];
    });

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.reorderCategories(orderedIds: updatedIds, categories: list);
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

    if (_categories.any((c) => c.id != category.id && c.name.toLowerCase() == newName.toLowerCase())) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('分类名称已存在')),
      );
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      if (category.isBuiltin) {
        await repo.renameBuiltinCategory(builtinId: category.id, newName: newName);
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
    final itemCount = await repo.getItemCountForCategory(
      category.id,
      builtinRef: category.builtinRef,
    );

    if (!mounted) return;

    final colors = context.kaipaTokens.color;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: colors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('删除分类', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink)),
          content: Text(
            itemCount > 0
                ? '该分类下的 $itemCount 件装备将移至「未分类」'
                : '确定要删除「${category.name}」吗？',
            style: TextStyle(fontSize: 14, color: colors.inkMuted, height: 1.4),
          ),
          actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              style: TextButton.styleFrom(
                foregroundColor: colors.inkMuted,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: TextButton.styleFrom(
                foregroundColor: colors.diff.extreme,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('删除', style: TextStyle(fontWeight: FontWeight.w600)),
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
      useRootNavigator: true,
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

  void _showCategoryActions(GearCategoryModel cat) {
    final colors = context.kaipaTokens.color;

    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: colors.inkDim, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 20),
              _ActionTile(
                icon: KaipaIcons.ellipsis,
                label: '重命名',
                color: colors.ink,
                colors: colors,
                onTap: () {
                  Navigator.pop(ctx);
                  _startEditing(cat);
                },
              ),
              if (cat.isOverride && cat.isRenamed)
                _ActionTile(
                  icon: KaipaIcons.clock,
                  label: '恢复默认名称',
                  color: colors.sky,
                  colors: colors,
                  onTap: () {
                    Navigator.pop(ctx);
                    _resetBuiltin(cat);
                  },
                ),
              if (cat.isCustom)
                _ActionTile(
                  icon: KaipaIcons.close,
                  label: '删除分类',
                  color: colors.diff.extreme,
                  colors: colors,
                  onTap: () {
                    Navigator.pop(ctx);
                    _deleteCategory(cat);
                  },
                ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final topPadding = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: colors.bg,
      body: _isLoading
          ? _buildShimmer(colors, topPadding)
          : _buildBody(colors, topPadding),
    );
  }

  Widget _buildBody(KaipaColors colors, double topPadding) {
    final reorderable = _reorderableCategories;
    final uncategorized = _uncategorized;
    final customCount = _categories.where((c) => c.isCustom).length;

    return Stack(
      children: [
        CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: SizedBox(height: topPadding + 56)),

            // Info bar
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: colors.flareSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      KaipaIcon(name: KaipaIcons.layers, size: 15, color: colors.flare),
                      const SizedBox(width: 8),
                      Text(
                        '${reorderable.length} 个分类',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colors.flare),
                      ),
                      const Spacer(),
                      Text(
                        '自定义 $customCount/20',
                        style: TextStyle(fontSize: 11.5, color: colors.flare),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Hint
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Text(
                  '长按拖动调整顺序，点击右侧按钮编辑',
                  style: TextStyle(fontSize: 12, color: colors.inkDim),
                ),
              ),
            ),

            // Category list
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverReorderableList(
                itemCount: reorderable.length,
                onReorder: _onReorder,
                itemBuilder: (context, index) {
                  final cat = reorderable[index];
                  return _buildCategoryTile(cat, colors, index, key: ValueKey(cat.id));
                },
              ),
            ),

            // Uncategorized
            if (uncategorized != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(height: 0.5, color: colors.lineSoft),
                      const SizedBox(height: 12),
                      _buildUncategorizedTile(uncategorized, colors),
                    ],
                  ),
                ),
              ),

            SliverToBoxAdapter(child: SizedBox(height: MediaQuery.of(context).padding.bottom + 32)),
          ],
        ),

        // Sticky header
        Positioned(
          top: 0, left: 0, right: 0,
          child: _buildHeader(colors, topPadding),
        ),

      ],
    );
  }

  Widget _buildHeader(KaipaColors colors, double topPadding) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [colors.bg.withAlpha(240), colors.bg.withAlpha(0)],
          stops: const [0.75, 1.0],
        ),
      ),
      padding: EdgeInsets.only(top: topPadding + 10, left: 16, right: 16, bottom: 12),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: colors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Center(child: KaipaIcon(name: KaipaIcons.chevronLeft, size: 16, color: colors.ink)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '管理分类',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4),
            ),
          ),
          GestureDetector(
            onTap: _showCreateSheet,
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: colors.flare, shape: BoxShape.circle),
              child: const Center(child: KaipaIcon(name: KaipaIcons.plus, size: 16, color: Colors.white, strokeWidth: 2.0)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryTile(GearCategoryModel cat, KaipaColors colors, int index, {Key? key}) {
    final isEditing = _editingId == cat.id;

    return ReorderableDragStartListener(
      key: key,
      index: index,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.line, width: 0.5),
          boxShadow: const [BoxShadow(color: Color.fromRGBO(40, 30, 20, 0.03), offset: Offset(0, 1), blurRadius: 2)],
        ),
        child: Row(
          children: [
            // Drag grip
            Container(
              width: 24, height: 36,
              alignment: Alignment.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildGripDot(colors),
                  const SizedBox(height: 3),
                  _buildGripDot(colors),
                  const SizedBox(height: 3),
                  _buildGripDot(colors),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // Icon
            _buildCategoryIcon(cat, colors),
            const SizedBox(width: 12),

            // Name / Edit field
            Expanded(
              child: isEditing
                  ? _buildEditField(cat, colors)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          cat.name,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          cat.isCustom ? '自定义' : (cat.isRenamed ? '已重命名' : '内置'),
                          style: TextStyle(fontSize: 11, color: colors.inkDim),
                        ),
                      ],
                    ),
            ),

            // Actions
            if (!isEditing)
              GestureDetector(
                onTap: () => _showCategoryActions(cat),
                child: Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    color: colors.surfaceHi,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(child: KaipaIcon(name: KaipaIcons.ellipsis, size: 14, color: colors.inkMuted)),
                ),
              ),
            if (isEditing)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _editingId = null),
                    child: Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(color: colors.surfaceHi, borderRadius: BorderRadius.circular(8)),
                      child: Center(child: KaipaIcon(name: KaipaIcons.close, size: 12, color: colors.inkMuted)),
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => _saveEdit(cat),
                    child: Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(color: colors.mossSoft, borderRadius: BorderRadius.circular(8)),
                      child: Center(child: KaipaIcon(name: KaipaIcons.check, size: 13, color: colors.mossDeep)),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildGripDot(KaipaColors colors) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 4, height: 4, decoration: BoxDecoration(color: colors.inkDim, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 3),
        Container(width: 4, height: 4, decoration: BoxDecoration(color: colors.inkDim, borderRadius: BorderRadius.circular(2))),
      ],
    );
  }

  Widget _buildEditField(GearCategoryModel cat, KaipaColors colors) {
    return TextField(
      controller: _editController,
      autofocus: true,
      maxLength: 10,
      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink),
      decoration: InputDecoration(
        isDense: true,
        counterText: '',
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        filled: true,
        fillColor: colors.surfaceHi,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: colors.flare, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: colors.flare, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: colors.flare, width: 1.5),
        ),
      ),
      onSubmitted: (_) => _saveEdit(cat),
    );
  }

  Widget _buildCategoryIcon(GearCategoryModel cat, KaipaColors colors) {
    if (cat.iconType == 'emoji') {
      return Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: colors.flareSoft,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Center(child: Text(cat.icon, style: const TextStyle(fontSize: 18))),
      );
    }
    return Container(
      width: 36, height: 36,
      decoration: BoxDecoration(
        color: colors.mossSoft,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Center(child: KaipaIcon(name: cat.icon, size: 18, color: colors.mossDeep)),
    );
  }

  Widget _buildUncategorizedTile(GearCategoryModel cat, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      decoration: BoxDecoration(
        color: colorWithOpacity(colors.surface, 0.6),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.lineSoft, width: 0.5),
      ),
      child: Row(
        children: [
          const SizedBox(width: 32),
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(child: KaipaIcon(name: cat.icon, size: 18, color: colors.inkDim)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(cat.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: colors.inkDim, letterSpacing: -0.2)),
                const SizedBox(height: 2),
                Text('不可编辑或删除', style: TextStyle(fontSize: 11, color: colors.inkDim)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text('固定', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: colors.inkDim)),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmer(KaipaColors colors, double topPadding) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, topPadding + 68, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 40, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(12))),
            const SizedBox(height: 16),
            for (int i = 0; i < 6; i++) ...[
              Container(height: 60, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14))),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final String icon;
  final String label;
  final Color color;
  final KaipaColors colors;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.colors,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: colors.surfaceHi,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: colorWithOpacity(color, 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(child: KaipaIcon(name: icon, size: 14, color: color)),
              ),
              const SizedBox(width: 12),
              Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
