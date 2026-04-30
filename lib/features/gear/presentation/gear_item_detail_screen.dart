import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/section_title.dart';

class GearItemDetailScreen extends ConsumerStatefulWidget {
  final String itemId;

  const GearItemDetailScreen({
    super.key,
    required this.itemId,
  });

  @override
  ConsumerState<GearItemDetailScreen> createState() =>
      _GearItemDetailScreenState();
}

class _GearItemDetailScreenState extends ConsumerState<GearItemDetailScreen> {
  bool _isFavorite = false;
  bool _favoriteInitialized = false;

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final itemAsync = ref.watch(gearItemByIdProvider(widget.itemId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: itemAsync.when(
        loading: () => _buildShimmerLoading(colors),
        error: (error, stack) => _buildErrorState(colors, error),
        data: (item) {
          // Initialize favorite state from data once
          if (!_favoriteInitialized) {
            _isFavorite = item.isFavorite;
            _favoriteInitialized = true;
          }
          return _buildContent(context, colors, item);
        },
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    GearItemModel item,
  ) {
    final dateFormat = DateFormat('yyyy-MM-dd');

    return CustomScrollView(
      slivers: [
        // Photo area
        SliverToBoxAdapter(
          child: _buildPhotoArea(context, colors, item),
        ),

        // Body content
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 110),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title row
                _buildTitleRow(colors, item),

                // Stats card
                const SizedBox(height: 18),
                _buildStatsCard(colors),

                // 规格 section
                const SizedBox(height: 22),
                _buildSpecsSection(colors, item, dateFormat),

                // 备注 section
                const SizedBox(height: 22),
                _buildNotesSection(colors, item),

                // 参与过的路线 section
                const SizedBox(height: 22),
                _buildRoutesSection(colors),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ─── Photo area ────────────────────────────────────────────────────

  Widget _buildPhotoArea(
    BuildContext context,
    KaipaColors colors,
    GearItemModel item,
  ) {
    final topPadding = MediaQuery.of(context).padding.top;

    return Container(
      width: double.infinity,
      height: 380,
      color: const Color(0xFF2A2118),
      child: Stack(
        children: [
          // Main photo or placeholder
          Positioned.fill(
            child: item.photoUrl != null
                ? Image.network(
                    item.photoUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) =>
                        _buildPhotoPlaceholder(colors),
                  )
                : _buildPhotoPlaceholder(colors),
          ),

          // Top overlay: back + share + more
          Positioned(
            top: topPadding + 8,
            left: 12,
            right: 12,
            child: Row(
              children: [
                CircleButton(
                  icon: KaipaIcons.back,
                  dark: true,
                  onTap: () => context.pop(),
                ),
                const Spacer(),
                CircleButton(
                  icon: KaipaIcons.share,
                  dark: true,
                  onTap: () {
                    // Share action placeholder
                  },
                ),
                const SizedBox(width: 8),
                CircleButton(
                  icon: KaipaIcons.more,
                  dark: true,
                  onTap: () => _showMoreMenu(context, colors, item),
                ),
              ],
            ),
          ),

          // Photo counter badge centered top
          Positioned(
            top: topPadding + 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: const Color.fromRGBO(0, 0, 0, 0.45),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  '1 / 1',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
            ),
          ),

          // Page dots + thumbnail strip at bottom
          Positioned(
            left: 0,
            right: 0,
            bottom: 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Page dots
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 18,
                      height: 6,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Thumbnail strip
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      // Main thumbnail
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Colors.white,
                                width: 2,
                              ),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: item.photoUrl != null
                                ? Image.network(
                                    item.photoUrl!,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => Container(
                                      color: const Color(0xFF3A3128),
                                      child: Center(
                                        child: KaipaIcon(
                                          name: KaipaIcons.backpack,
                                          size: 20,
                                          color: Colors.white.withAlpha(128),
                                        ),
                                      ),
                                    ),
                                  )
                                : Container(
                                    color: const Color(0xFF3A3128),
                                    child: Center(
                                      child: KaipaIcon(
                                        name: KaipaIcons.backpack,
                                        size: 20,
                                        color: Colors.white.withAlpha(128),
                                      ),
                                    ),
                                  ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            '主图',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 8),

                      // Add-photo button (dashed border)
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Colors.white38,
                                width: 1,
                                // Note: Flutter doesn't support dashed borders
                                // natively, so we use a lighter solid border
                              ),
                            ),
                            child: Center(
                              child: KaipaIcon(
                                name: KaipaIcons.plus,
                                size: 18,
                                color: Colors.white38,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          const SizedBox(height: 12), // match label height
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoPlaceholder(KaipaColors colors) {
    return Center(
      child: KaipaIcon(
        name: KaipaIcons.backpack,
        size: 80,
        color: Colors.white.withAlpha(60),
      ),
    );
  }

  // ─── Title row ─────────────────────────────────────────────────────

  Widget _buildTitleRow(KaipaColors colors, GearItemModel item) {
    final condInfo = _conditionInfo(item.condition, colors);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                item.name,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.6,
                  height: 1.15,
                ),
              ),
            ),
            if (item.condition != null) ...[
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: condInfo.color.withAlpha(26),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  condInfo.label,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: condInfo.color,
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 4),
        Text(
          item.brand ?? '--',
          style: TextStyle(
            fontSize: 13,
            color: colors.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
      ],
    );
  }

  // ─── Stats card ────────────────────────────────────────────────────

  Widget _buildStatsCard(KaipaColors colors) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: const Row(
        children: [
          Expanded(child: StatWidget(value: '--', label: '使用次数')),
          Expanded(child: StatWidget(value: '--', unit: 'km', label: '累计里程')),
          Expanded(child: StatWidget(value: '--', label: '自评')),
        ],
      ),
    );
  }

  // ─── 规格 section ──────────────────────────────────────────────────

  Widget _buildSpecsSection(
    KaipaColors colors,
    GearItemModel item,
    DateFormat dateFormat,
  ) {
    final specs = <_SpecRow>[
      _SpecRow('品牌', item.brand ?? '--'),
      _SpecRow('型号', '--'),
      _SpecRow('尺码', '--'),
      _SpecRow(
        '重量',
        item.weightG != null
            ? '${item.weightG!.toStringAsFixed(0)} g'
            : '--',
        mono: true,
      ),
      _SpecRow(
        '价格',
        item.price != null
            ? '¥${item.price!.toStringAsFixed(0)}'
            : '--',
        mono: true,
      ),
      _SpecRow(
        '入手日期',
        item.purchasedAt != null
            ? dateFormat.format(item.purchasedAt!)
            : '--',
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '规格',
          padding: EdgeInsets.zero,
          trailing: Text(
            '编辑',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.flare,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (int i = 0; i < specs.length; i++) ...[
                if (i > 0)
                  Divider(height: 0.5, thickness: 0.5, color: colors.line),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      Text(
                        specs[i].label,
                        style: TextStyle(
                          fontSize: 13,
                          color: colors.inkMuted,
                          letterSpacing: -0.1,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        specs[i].value,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: colors.ink,
                          fontFamily: specs[i].mono ? 'monospace' : null,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // ─── 备注 section ──────────────────────────────────────────────────

  Widget _buildNotesSection(KaipaColors colors, GearItemModel item) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '备注',
          padding: EdgeInsets.zero,
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Text(
            item.notes ?? '--',
            style: TextStyle(
              fontSize: 13,
              color: colors.ink,
              height: 1.55,
              letterSpacing: -0.1,
            ),
          ),
        ),
      ],
    );
  }

  // ─── 参与过的路线 section ───────────────────────────────────────────

  Widget _buildRoutesSection(KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '参与过的路线',
          padding: EdgeInsets.zero,
          trailing: Text(
            '--',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 24),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Center(
            child: Text(
              '暂无记录',
              style: TextStyle(
                fontSize: 13,
                color: colors.inkDim,
                letterSpacing: -0.1,
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ─── More menu ─────────────────────────────────────────────────────

  void _showMoreMenu(
    BuildContext context,
    KaipaColors colors,
    GearItemModel item,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              const SizedBox(height: 10),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.lineSoft,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 8),

              // 收藏/取消收藏
              ListTile(
                leading: KaipaIcon(
                  name: _isFavorite
                      ? KaipaIcons.heartFill
                      : KaipaIcons.heart,
                  size: 20,
                  color: _isFavorite ? colors.diff.extreme : colors.ink,
                ),
                title: Text(
                  _isFavorite ? '取消收藏' : '收藏',
                  style: TextStyle(
                    fontSize: 15,
                    color: colors.ink,
                  ),
                ),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _toggleFavorite(item);
                },
              ),

              // 删除
              ListTile(
                leading: KaipaIcon(
                  name: KaipaIcons.close,
                  size: 20,
                  color: colors.diff.extreme,
                ),
                title: Text(
                  '删除',
                  style: TextStyle(
                    fontSize: 15,
                    color: colors.diff.extreme,
                  ),
                ),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _showDeleteDialog(context, colors, item);
                },
              ),

              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // ─── Existing business logic (kept unchanged) ──────────────────────

  Future<void> _toggleFavorite(GearItemModel item) async {
    final newValue = !_isFavorite;
    setState(() {
      _isFavorite = newValue;
    });

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.toggleFavorite(item.id, newValue);
      ref.invalidate(gearItemByIdProvider(widget.itemId));
    } catch (_) {
      // Revert on failure
      if (mounted) {
        setState(() {
          _isFavorite = !newValue;
        });
      }
    }
  }

  void _showDeleteDialog(
    BuildContext context,
    KaipaColors colors,
    GearItemModel item,
  ) {
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          title: Text(
            '确认删除',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: colors.ink,
            ),
          ),
          content: Text(
            '确定要删除"${item.name}"吗？此操作无法撤销。',
            style: TextStyle(
              fontSize: 14,
              color: colors.inkMuted,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(
                '取消',
                style: TextStyle(
                  color: colors.inkMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            TextButton(
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                await _deleteItem(item);
              },
              child: Text(
                '删除',
                style: TextStyle(
                  color: colors.diff.extreme,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _deleteItem(GearItemModel item) async {
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.deleteItem(item.id);
      // Invalidate related providers so lists refresh
      ref.invalidate(allGearItemsProvider);
      ref.invalidate(gearItemsByCategoryProvider(item.categoryId));
      if (mounted) {
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('删除失败: $e'),
            backgroundColor: ref.read(kaipaTokensProvider).color.diff.extreme,
          ),
        );
      }
    }
  }

  Widget _buildShimmerLoading(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Column(
        children: [
          Container(
            width: double.infinity,
            height: MediaQuery.of(context).size.width * 0.75,
            color: colors.surface,
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 28,
                  width: 200,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  height: 16,
                  width: 120,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                const SizedBox(height: 24),
                Container(
                  height: 120,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(KaipaColors colors, Object error) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(
                name: KaipaIcons.alert,
                size: 48,
                color: colors.diff.extreme,
              ),
              const SizedBox(height: 16),
              Text(
                '加载失败',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                error.toString(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: colors.inkMuted,
                ),
              ),
              const SizedBox(height: 20),
              TextButton(
                onPressed: () {
                  ref.invalidate(gearItemByIdProvider(widget.itemId));
                },
                child: Text(
                  '重试',
                  style: TextStyle(
                    color: colors.flare,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.pop(),
                child: Text(
                  '返回',
                  style: TextStyle(
                    color: colors.inkMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Spec row helper ───────────────────────────────────────────────

class _SpecRow {
  final String label;
  final String value;
  final bool mono;

  const _SpecRow(this.label, this.value, {this.mono = false});
}

// ─── Condition badge helper ─────────────────────────────────────────

class _ConditionInfo {
  final String label;
  final Color color;

  const _ConditionInfo(this.label, this.color);
}

_ConditionInfo _conditionInfo(String? condition, KaipaColors colors) {
  switch (condition) {
    case 'new':
      return _ConditionInfo('全新', colors.moss);
    case 'good':
      return _ConditionInfo('良好', colors.sky);
    case 'fair':
      return _ConditionInfo('一般', colors.sand);
    case 'worn':
      return _ConditionInfo('磨损', colors.diff.extreme);
    default:
      return _ConditionInfo('未知', colors.inkDim);
  }
}
