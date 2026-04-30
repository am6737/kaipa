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
    final screenWidth = MediaQuery.of(context).size.width;
    final dateFormat = DateFormat('yyyy-MM-dd');

    return CustomScrollView(
      slivers: [
        // Photo area
        SliverToBoxAdapter(
          child: Stack(
            children: [
              // Photo or placeholder
              Container(
                width: screenWidth,
                height: screenWidth * 0.75,
                decoration: BoxDecoration(
                  color: colors.surfaceHi,
                ),
                child: item.photoUrl != null
                    ? Image.network(
                        item.photoUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            _buildPhotoPlaceholder(colors),
                      )
                    : _buildPhotoPlaceholder(colors),
              ),

              // Top bar overlay
              Positioned(
                top: MediaQuery.of(context).padding.top,
                left: 0,
                right: 0,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _CircleButton(
                        colors: colors,
                        onTap: () => context.pop(),
                        child: KaipaIcon(
                          name: KaipaIcons.back,
                          size: 20,
                          color: colors.ink,
                        ),
                      ),
                      _CircleButton(
                        colors: colors,
                        onTap: () => _toggleFavorite(item),
                        child: KaipaIcon(
                          name: _isFavorite
                              ? KaipaIcons.heartFill
                              : KaipaIcons.heart,
                          size: 20,
                          color: _isFavorite ? colors.diff.extreme : colors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // Content
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title and brand
                Text(
                  item.name,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.7,
                    height: 1.1,
                  ),
                ),
                if (item.brand != null && item.brand!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    item.brand!,
                    style: TextStyle(
                      fontSize: 15,
                      color: colors.inkMuted,
                      letterSpacing: -0.2,
                    ),
                  ),
                ],

                const SizedBox(height: 24),

                // Specs card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: _buildSpecsGrid(colors, item, dateFormat),
                ),

                // Notes section
                if (item.notes != null && item.notes!.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Text(
                    '备注',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: colors.ink,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: colors.line, width: 0.5),
                    ),
                    child: Text(
                      item.notes!,
                      style: TextStyle(
                        fontSize: 14,
                        color: colors.ink,
                        letterSpacing: -0.1,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],

                // Action buttons
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 50,
                        child: OutlinedButton(
                          onPressed: () {
                            // Navigate to edit screen (placeholder)
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: colors.flare,
                            side: BorderSide(color: colors.flare, width: 1.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            '编辑',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SizedBox(
                        height: 50,
                        child: ElevatedButton(
                          onPressed: () => _showDeleteDialog(context, colors, item),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: colors.diff.extreme,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            '删除',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSpecsGrid(
    KaipaColors colors,
    GearItemModel item,
    DateFormat dateFormat,
  ) {
    final condInfo = _conditionInfo(item.condition, colors);

    return Wrap(
      spacing: 32,
      runSpacing: 20,
      children: [
        SizedBox(
          width: 120,
          child: StatWidget(
            value: item.weightG != null
                ? item.weightG!.toStringAsFixed(0)
                : '--',
            unit: 'g',
            label: '重量',
          ),
        ),
        SizedBox(
          width: 120,
          child: StatWidget(
            value: item.price != null
                ? item.price!.toStringAsFixed(0)
                : '--',
            unit: '¥',
            label: '价格',
          ),
        ),
        SizedBox(
          width: 120,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
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
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: condInfo.color,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '状态',
                style: TextStyle(
                  fontSize: 11,
                  color: colors.inkMuted,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          width: 120,
          child: StatWidget(
            value: item.purchasedAt != null
                ? dateFormat.format(item.purchasedAt!)
                : '--',
            label: '购买日期',
          ),
        ),
      ],
    );
  }

  Widget _buildPhotoPlaceholder(KaipaColors colors) {
    return Center(
      child: KaipaIcon(
        name: KaipaIcons.backpack,
        size: 80,
        color: colors.inkDim,
      ),
    );
  }

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

// ─── Circle button overlay ──────────────────────────────────────────

class _CircleButton extends StatelessWidget {
  final KaipaColors colors;
  final VoidCallback onTap;
  final Widget child;

  const _CircleButton({
    required this.colors,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: colors.glass,
          shape: BoxShape.circle,
          border: Border.all(
            color: colors.line,
            width: 0.5,
          ),
        ),
        child: Center(child: child),
      ),
    );
  }
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
