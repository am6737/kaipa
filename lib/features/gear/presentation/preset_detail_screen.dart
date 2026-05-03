import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import 'widgets/add_preset_items_sheet.dart';

// ─── Data models ────────────────────────────────────────────────────

class _CategoryGroup {
  final GearCategoryModel category;
  final List<GearItemModel> items;
  final double totalWeightG;
  final double totalPrice;
  final Color color;

  _CategoryGroup({
    required this.category,
    required this.items,
    required this.totalWeightG,
    required this.totalPrice,
    required this.color,
  });
}

class _ChartSegment {
  final String label;
  final double value;
  final Color color;
  final double weightKg;
  final double price;
  final int itemCount;

  const _ChartSegment({
    required this.label,
    required this.value,
    required this.color,
    required this.weightKg,
    required this.price,
    required this.itemCount,
  });
}

// ─── Main screen ────────────────────────────────────────────────────

class PresetDetailScreen extends ConsumerStatefulWidget {
  final String presetId;
  const PresetDetailScreen({super.key, required this.presetId});

  @override
  ConsumerState<PresetDetailScreen> createState() => _PresetDetailScreenState();
}

class _PresetDetailScreenState extends ConsumerState<PresetDetailScreen> {
  String? _renamedName;

  List<Color> _segmentColors(KaipaColors c) => [
    c.flare, c.sky, c.sand, const Color(0xFFC47D5A), c.moss,
    const Color(0xFF7BAFC8), const Color(0xFFA89070), c.inkDim,
    const Color(0xFF8B6E5A), const Color(0xFF6B8E7B),
  ];

  List<_CategoryGroup> _buildGroups(
    List<GearItemModel> items,
    List<GearCategoryModel> categories,
    KaipaColors colors,
  ) {
    final palette = _segmentColors(colors);
    final visible = categories.where((c) => !c.isUncategorized).toList();
    final groups = <_CategoryGroup>[];
    final assigned = <String>{};
    var ci = 0;

    for (final cat in visible) {
      final catItems = items
          .where((i) => !assigned.contains(i.id) &&
              (i.categoryId == cat.id || i.categoryId == cat.builtinRef))
          .toList();
      if (catItems.isEmpty) continue;
      assigned.addAll(catItems.map((i) => i.id));
      groups.add(_CategoryGroup(
        category: cat,
        items: catItems,
        totalWeightG: catItems.fold(0, (s, i) => s + (i.weightG ?? 0)),
        totalPrice: catItems.fold(0, (s, i) => s + (i.price ?? 0)),
        color: palette[ci++ % palette.length],
      ));
    }

    final rest = items.where((i) => !assigned.contains(i.id)).toList();
    if (rest.isNotEmpty) {
      groups.add(_CategoryGroup(
        category: const GearCategoryModel(id: '_other', name: '其他', icon: 'backpack'),
        items: rest,
        totalWeightG: rest.fold(0, (s, i) => s + (i.weightG ?? 0)),
        totalPrice: rest.fold(0, (s, i) => s + (i.price ?? 0)),
        color: palette[ci % palette.length],
      ));
    }

    groups.sort((a, b) => b.totalWeightG.compareTo(a.totalWeightG));
    return groups;
  }

  Future<void> _rename(String currentName) async {
    final colors = context.kaipaTokens.color;
    final controller = TextEditingController(text: currentName);
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
    if (newName == null || newName.isEmpty || newName == currentName) return;

    try {
      await ref.read(gearRepositoryProvider).renamePreset(
        presetId: widget.presetId, newName: newName,
      );
      ref.invalidate(gearPresetsProvider);
      setState(() => _renamedName = newName);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('重命名失败: $e')));
      }
    }
  }

  Future<void> _delete() async {
    final colors = context.kaipaTokens.color;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('删除预设', style: TextStyle(color: colors.ink)),
        content: Text('确定要删除此预设吗？装备本身不会被删除。', style: TextStyle(color: colors.inkMuted)),
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
      await ref.read(gearRepositoryProvider).deletePreset(presetId: widget.presetId);
      ref.invalidate(gearPresetsProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('删除失败: $e')));
      }
    }
  }

  Future<bool> _removeItem(GearItemModel item) async {
    try {
      await ref.read(gearRepositoryProvider).removeItemFromPreset(
        presetId: widget.presetId, itemId: item.id,
      );
      ref.invalidate(presetItemsProvider(widget.presetId));
      ref.invalidate(gearPresetsProvider);
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('移除失败: $e')));
      }
      return false;
    }
  }

  void _addItems(List<GearItemModel> currentItems) {
    final colors = context.kaipaTokens.color;
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
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
    final colors = context.kaipaTokens.color;
    final itemsAsync = ref.watch(presetItemsProvider(widget.presetId));
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final presetName = _renamedName ??
        ref.watch(gearPresetsProvider).valueOrNull
            ?.where((p) => p.id == widget.presetId)
            .firstOrNull?.name ?? '预设';

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
          presetName,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: KaipaIcon(name: KaipaIcons.ellipsis, size: 22, color: colors.ink),
            color: colors.surface,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            onSelected: (v) {
              if (v == 'rename') _rename(presetName);
              if (v == 'delete') _delete();
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
                  Text('删除预设', style: TextStyle(color: colors.diff.extreme)),
                ]),
              ),
            ],
          ),
        ],
      ),
      body: itemsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('加载失败', style: TextStyle(color: colors.ink)),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => ref.invalidate(presetItemsProvider(widget.presetId)),
              child: Text('重试', style: TextStyle(color: colors.flare)),
            ),
          ]),
        ),
        data: (items) => categoriesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => _buildBody(colors, items, []),
          data: (cats) => _buildBody(colors, items, cats),
        ),
      ),
      floatingActionButton: itemsAsync.whenOrNull(
        data: (items) => FloatingActionButton.extended(
          onPressed: () => _addItems(items),
          backgroundColor: colors.flare,
          elevation: 2,
          icon: const KaipaIcon(name: KaipaIcons.plus, size: 18, color: Colors.white, strokeWidth: 2.0),
          label: const Text('添加装备', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
        ),
      ),
    );
  }

  Widget _buildBody(KaipaColors colors, List<GearItemModel> items, List<GearCategoryModel> categories) {
    if (items.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          KaipaIcon(name: KaipaIcons.backpack, size: 48, color: colors.inkDim),
          const SizedBox(height: 16),
          Text('还没有装备', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 8),
          Text('点击下方按钮添加装备到此预设', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
        ]),
      );
    }

    final groups = _buildGroups(items, categories, colors);
    final totalWeight = items.fold<double>(0, (s, i) => s + (i.weightG ?? 0));
    final totalPrice = items.fold<double>(0, (s, i) => s + (i.price ?? 0));

    return CustomScrollView(
      slivers: [
        // Overview card with donut chart
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: _PresetOverviewCard(
              groups: groups,
              colors: colors,
              totalCount: items.length,
              totalWeightKg: totalWeight / 1000,
              totalPriceK: totalPrice / 1000,
              categoriesCount: groups.length,
            ),
          ),
        ),
        // Category groups
        for (final group in groups) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: _buildSectionHeader(group, colors),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList.builder(
              itemCount: group.items.length,
              itemBuilder: (_, i) => _buildItemCard(group.items[i], group.color, colors),
            ),
          ),
        ],
        const SliverToBoxAdapter(child: SizedBox(height: 80)),
      ],
    );
  }

  Widget _buildSectionHeader(_CategoryGroup group, KaipaColors colors) {
    return Row(children: [
      Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: colorWithOpacity(group.color, 0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(child: KaipaIcon(name: group.category.icon, size: 14, color: group.color)),
      ),
      const SizedBox(width: 10),
      Text(
        group.category.name,
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2),
      ),
      const SizedBox(width: 8),
      Text(
        '${group.items.length} 件 · ${(group.totalWeightG / 1000).toStringAsFixed(1)}kg',
        style: TextStyle(fontSize: 12, color: colors.inkMuted),
      ),
    ]);
  }

  Widget _buildItemCard(GearItemModel item, Color accent, KaipaColors colors) {
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
      confirmDismiss: (_) => _removeItem(item),
      child: GestureDetector(
        onTap: () => context.go('/gear/item/${item.id}'),
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: colors.ink, letterSpacing: -0.2),
                  ),
                  if (item.brand != null) ...[
                    const SizedBox(height: 2),
                    Text(item.brand!, style: TextStyle(fontSize: 12, color: colors.inkMuted)),
                  ],
                ],
              ),
            ),
            if (item.weightG != null)
              Text(
                '${(item.weightG! / 1000).toStringAsFixed(1)}kg',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.inkDim),
              ),
          ]),
        ),
      ),
    );
  }
}

// ─── Overview card with donut chart ─────────────────────────────────

enum _ChartMode { weight, price }

class _PresetOverviewCard extends StatefulWidget {
  final List<_CategoryGroup> groups;
  final KaipaColors colors;
  final int totalCount;
  final double totalWeightKg;
  final double totalPriceK;
  final int categoriesCount;

  const _PresetOverviewCard({
    required this.groups,
    required this.colors,
    required this.totalCount,
    required this.totalWeightKg,
    required this.totalPriceK,
    required this.categoriesCount,
  });

  @override
  State<_PresetOverviewCard> createState() => _PresetOverviewCardState();
}

class _PresetOverviewCardState extends State<_PresetOverviewCard>
    with SingleTickerProviderStateMixin {
  _ChartMode _mode = _ChartMode.weight;
  int? _selectedIndex;
  late AnimationController _animController;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      duration: const Duration(milliseconds: 280),
      vsync: this,
    )..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _selectSegment(int? index) {
    setState(() {
      if (index == null || _selectedIndex == index) {
        _selectedIndex = null;
        _animController.reverse();
      } else {
        final hadSelection = _selectedIndex != null;
        _selectedIndex = index;
        if (hadSelection) {
          _animController.value = 1.0;
        } else {
          _animController.forward(from: 0);
        }
      }
    });
  }

  List<_ChartSegment> _buildSegments() {
    return widget.groups.map((g) => _ChartSegment(
      label: g.category.name,
      value: _mode == _ChartMode.weight ? g.totalWeightG : g.totalPrice,
      color: g.color,
      weightKg: g.totalWeightG / 1000,
      price: g.totalPrice,
      itemCount: g.items.length,
    )).toList();
  }

  int? _hitTestSegment(Offset localPosition, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final dx = localPosition.dx - center.dx;
    final dy = localPosition.dy - center.dy;
    final distance = math.sqrt(dx * dx + dy * dy);

    const radius = 48.0;
    const strokeWidth = 15.0;
    const hitPadding = 8.0;
    if (distance < radius - strokeWidth / 2 - hitPadding ||
        distance > radius + strokeWidth / 2 + hitPadding) {
      return null;
    }

    var angle = math.atan2(dy, dx) + math.pi / 2;
    if (angle < 0) angle += 2 * math.pi;

    final segments = _buildSegments();
    final total = segments.fold<double>(0, (s, seg) => s + seg.value);
    if (total <= 0) return null;
    const gapAngle = 2.0 / (2 * math.pi * radius) * (2 * math.pi);
    final availableAngle = 2 * math.pi - gapAngle * segments.length;

    double accumulated = 0;
    for (int i = 0; i < segments.length; i++) {
      final sweepAngle = (segments[i].value / total) * availableAngle;
      if (angle >= accumulated && angle < accumulated + sweepAngle) {
        return i;
      }
      accumulated += sweepAngle + gapAngle;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final segments = _buildSegments();
    final colors = widget.colors;

    String? selectedCenterText;
    String? selectedCenterLabel;
    if (_selectedIndex != null && _selectedIndex! < segments.length) {
      final seg = segments[_selectedIndex!];
      selectedCenterLabel = seg.label;
      if (_mode == _ChartMode.weight) {
        selectedCenterText = '${seg.weightKg.toStringAsFixed(1)}kg';
      } else {
        selectedCenterText = seg.price >= 1000
            ? '¥${(seg.price / 1000).toStringAsFixed(1)}k'
            : '¥${seg.price.toStringAsFixed(0)}';
      }
    }

    return GestureDetector(
      onTap: () => _selectSegment(null),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: colors.line, width: 0.5),
          boxShadow: const [
            BoxShadow(color: Color.fromRGBO(40, 30, 20, 0.04), offset: Offset(0, 1), blurRadius: 3),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        child: Column(children: [
          // Mode toggle
          Align(
            alignment: Alignment.centerRight,
            child: _buildModeToggle(colors),
          ),
          const SizedBox(height: 12),
          // Donut + legend
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (details) {
                  _selectSegment(_hitTestSegment(details.localPosition, const Size(136, 136)));
                },
                child: SizedBox(
                  width: 136,
                  height: 136,
                  child: CustomPaint(
                    painter: _PresetDonutPainter(
                      segments: segments,
                      centerTextColor: colors.ink,
                      centerSubTextColor: colors.inkMuted,
                      totalCount: widget.totalCount,
                      selectedIndex: _selectedIndex,
                      selectionProgress: _animController.value,
                      selectedCenterText: selectedCenterText,
                      selectedCenterLabel: selectedCenterLabel,
                    ),
                    size: const Size(136, 136),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(child: _buildLegendGrid(segments, colors)),
            ],
          ),
          // Stats row
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Container(
              padding: const EdgeInsets.only(top: 14),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: colors.lineSoft, width: 0.5)),
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: _selectedIndex != null && _selectedIndex! < segments.length
                    ? Row(
                        key: ValueKey('seg_$_selectedIndex'),
                        children: [
                          Expanded(child: _StatItem(
                            value: segments[_selectedIndex!].weightKg.toStringAsFixed(1),
                            unit: ' kg', label: '重量', colors: colors,
                          )),
                          Expanded(child: _StatItem(
                            value: segments[_selectedIndex!].price >= 1000
                                ? '¥${(segments[_selectedIndex!].price / 1000).toStringAsFixed(1)}'
                                : '¥${segments[_selectedIndex!].price.toStringAsFixed(0)}',
                            unit: segments[_selectedIndex!].price >= 1000 ? 'k' : '',
                            label: '价值', colors: colors,
                          )),
                          Expanded(child: _StatItem(
                            value: '${segments[_selectedIndex!].itemCount}',
                            unit: ' 件', label: '装备', colors: colors,
                          )),
                        ],
                      )
                    : Row(
                        key: const ValueKey('total'),
                        children: [
                          Expanded(child: _StatItem(
                            value: widget.totalWeightKg.toStringAsFixed(1),
                            unit: ' kg', label: '总重', colors: colors,
                          )),
                          Expanded(child: _StatItem(
                            value: '¥${widget.totalPriceK.toStringAsFixed(1)}',
                            unit: 'k', label: '总值', colors: colors,
                          )),
                          Expanded(child: _StatItem(
                            value: '${widget.categoriesCount}',
                            unit: ' 个', label: '分类', colors: colors,
                          )),
                        ],
                      ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildModeToggle(KaipaColors colors) {
    Widget tab(String label, _ChartMode mode) {
      final active = _mode == mode;
      return GestureDetector(
        onTap: () {
          if (_mode == mode) return;
          setState(() {
            _mode = mode;
            _selectedIndex = null;
            _animController.value = 0;
          });
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: active ? colors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
            boxShadow: active
                ? [const BoxShadow(color: Color.fromRGBO(0, 0, 0, 0.06), blurRadius: 2, offset: Offset(0, 1))]
                : null,
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              color: active ? colors.ink : colors.inkMuted,
            ),
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          tab('重量', _ChartMode.weight),
          tab('价值', _ChartMode.price),
        ],
      ),
    );
  }

  Widget _buildLegendGrid(List<_ChartSegment> segments, KaipaColors colors) {
    final rows = <Widget>[];
    for (int i = 0; i < segments.length; i += 2) {
      final rightIdx = i + 1;
      final right = rightIdx < segments.length ? segments[rightIdx] : null;
      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: i + 2 < segments.length ? 6 : 0),
          child: Row(children: [
            Expanded(child: _buildLegendItem(segments[i], i, colors)),
            const SizedBox(width: 10),
            if (right != null)
              Expanded(child: _buildLegendItem(right, rightIdx, colors))
            else
              const Expanded(child: SizedBox()),
          ]),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: rows,
    );
  }

  Widget _buildLegendItem(_ChartSegment seg, int index, KaipaColors colors) {
    final isDimmed = _selectedIndex != null && _selectedIndex != index;
    final valueStr = _mode == _ChartMode.weight
        ? '${seg.weightKg.toStringAsFixed(1)}kg'
        : (seg.price >= 1000
            ? '¥${(seg.price / 1000).toStringAsFixed(1)}k'
            : '¥${seg.price.toStringAsFixed(0)}');

    return GestureDetector(
      onTap: () => _selectSegment(index),
      behavior: HitTestBehavior.opaque,
      child: AnimatedOpacity(
        opacity: isDimmed ? 0.35 : 1.0,
        duration: const Duration(milliseconds: 200),
        child: Row(children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: seg.color, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Flexible(
            child: Text(seg.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: colors.ink)),
          ),
          const Spacer(),
          Text(valueStr, style: TextStyle(fontSize: 10, color: colors.inkDim)),
        ]),
      ),
    );
  }
}

// ─── Stat item ──────────────────────────────────────────────────────

class _StatItem extends StatelessWidget {
  final String value;
  final String unit;
  final String label;
  final KaipaColors colors;

  const _StatItem({required this.value, required this.unit, required this.label, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        RichText(
          text: TextSpan(children: [
            TextSpan(text: value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4, height: 1)),
            TextSpan(text: unit, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
          ]),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
      ],
    );
  }
}

// ─── Donut chart painter ────────────────────────────────────────────

class _PresetDonutPainter extends CustomPainter {
  final List<_ChartSegment> segments;
  final Color centerTextColor;
  final Color centerSubTextColor;
  final int totalCount;
  final int? selectedIndex;
  final double selectionProgress;
  final String? selectedCenterText;
  final String? selectedCenterLabel;

  _PresetDonutPainter({
    required this.segments,
    required this.centerTextColor,
    required this.centerSubTextColor,
    required this.totalCount,
    this.selectedIndex,
    this.selectionProgress = 0.0,
    this.selectedCenterText,
    this.selectedCenterLabel,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 48.0;
    const strokeWidth = 15.0;
    const popOutDistance = 5.0;
    const gapAngle = 2.0 / (2 * math.pi * radius) * (2 * math.pi);

    if (segments.isEmpty) {
      final paint = Paint()
        ..color = colorWithOpacity(centerSubTextColor, 0.15)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.butt;
      canvas.drawCircle(center, radius, paint);
    } else {
      final total = segments.fold<double>(0, (s, seg) => s + seg.value);
      if (total <= 0) return;
      final totalGap = gapAngle * segments.length;
      final availableAngle = 2 * math.pi - totalGap;
      double startAngle = -math.pi / 2;
      final hasSelection = selectedIndex != null;

      for (int i = 0; i < segments.length; i++) {
        final segment = segments[i];
        final sweepAngle = (segment.value / total) * availableAngle;
        final isSelected = selectedIndex == i;

        Color segColor = segment.color;
        if (hasSelection && !isSelected) {
          segColor = colorWithOpacity(segment.color, 1.0 - 0.6 * selectionProgress);
        }

        final sw = isSelected ? strokeWidth + 2.0 * selectionProgress : strokeWidth;

        final paint = Paint()
          ..color = segColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = sw
          ..strokeCap = StrokeCap.butt;

        var arcCenter = center;
        if (isSelected) {
          final midAngle = startAngle + sweepAngle / 2;
          final offset = popOutDistance * selectionProgress;
          arcCenter = Offset(
            center.dx + offset * math.cos(midAngle),
            center.dy + offset * math.sin(midAngle),
          );
        }

        canvas.drawArc(Rect.fromCircle(center: arcCenter, radius: radius), startAngle, sweepAngle, false, paint);
        startAngle += sweepAngle + gapAngle;
      }
    }

    // Center text
    if (selectedCenterText != null && selectionProgress > 0.5) {
      final countPainter = TextPainter(
        text: TextSpan(
          text: selectedCenterText,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: centerTextColor, letterSpacing: -0.8),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      countPainter.paint(canvas, center - Offset(countPainter.width / 2, countPainter.height / 2 + 7));

      if (selectedCenterLabel != null) {
        final labelPainter = TextPainter(
          text: TextSpan(
            text: selectedCenterLabel,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: centerSubTextColor, letterSpacing: 0.3),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        labelPainter.paint(canvas, center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 11));
      }
    } else {
      final countPainter = TextPainter(
        text: TextSpan(
          text: '$totalCount',
          style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: centerTextColor, letterSpacing: -1),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      countPainter.paint(canvas, center - Offset(countPainter.width / 2, countPainter.height / 2 + 7));

      final labelPainter = TextPainter(
        text: TextSpan(
          text: '件装备',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w400, color: centerSubTextColor, letterSpacing: 0.3),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      labelPainter.paint(canvas, center - Offset(labelPainter.width / 2, labelPainter.height / 2 - 11));
    }
  }

  @override
  bool shouldRepaint(_PresetDonutPainter oldDelegate) {
    return oldDelegate.segments.length != segments.length ||
        oldDelegate.centerTextColor != centerTextColor ||
        oldDelegate.totalCount != totalCount ||
        oldDelegate.selectedIndex != selectedIndex ||
        oldDelegate.selectionProgress != selectionProgress ||
        oldDelegate.selectedCenterText != selectedCenterText;
  }
}
