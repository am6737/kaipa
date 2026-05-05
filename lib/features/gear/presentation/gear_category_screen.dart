import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import 'widgets/create_gear_item_sheet.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── Condition badge info ───────────────────────────────────────────

class _ConditionBadge {
  final String label;
  final Color textColor;
  final Color bgColor;

  const _ConditionBadge(this.label, this.textColor, this.bgColor);
}

_ConditionBadge _conditionBadge(String? condition, KaipaColors colors) {
  switch (condition) {
    case 'good':
      return _ConditionBadge('良好', colors.moss, colors.mossSoft);
    case 'worn':
      return _ConditionBadge('磨损', colors.flare, colors.flareSoft);
    case 'new':
      return _ConditionBadge('全新', const Color(0xFF3D6A8C), const Color(0xFFEAF0F5));
    case 'fair':
      return _ConditionBadge('一般', colors.sand, const Color(0xFFF5EFE6));
    default:
      return _ConditionBadge('未知', colors.inkDim, colors.surfaceHi);
  }
}

// ─── Filter chip model ──────────────────────────────────────────────

class _FilterChip {
  final String label;
  final bool active;

  const _FilterChip(this.label, {this.active = false});
}

// ─── Main screen ────────────────────────────────────────────────────

class GearCategoryScreen extends ConsumerStatefulWidget {
  final String categoryId;

  const GearCategoryScreen({
    super.key,
    required this.categoryId,
  });

  @override
  ConsumerState<GearCategoryScreen> createState() => _GearCategoryScreenState();
}

class _GearCategoryScreenState extends ConsumerState<GearCategoryScreen> {
  bool _gridMode = false;
  int _selectedFilter = 0; // 0=全部, 1=使用中, 2=收藏

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final topPadding = MediaQuery.of(context).padding.top;
    final itemsAsync = ref.watch(gearItemsByCategoryProvider(widget.categoryId));
    final categoriesAsync = ref.watch(gearCategoriesProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: itemsAsync.when(
        loading: () => _buildShimmer(colors, topPadding),
        error: (e, _) => _buildError(colors, e),
        data: (items) {
          final category = categoriesAsync.whenOrNull(
            data: (cats) {
              try {
                return cats.firstWhere((c) => c.id == widget.categoryId);
              } catch (_) {
                return cats.where((c) => c.builtinRef == widget.categoryId).firstOrNull;
              }
            },
          );
          final categoryName = category?.name ?? '分类';
          final totalWeight = items.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0));
          final totalPrice = items.fold<double>(0, (sum, item) => sum + (item.price ?? 0));

          final filterChips = [
            _FilterChip('全部 ${items.length}', active: _selectedFilter == 0),
            _FilterChip('使用中 ${items.where((i) => i.useCount > 0).length}', active: _selectedFilter == 1),
            _FilterChip('收藏 ${items.where((i) => i.isFavorite).length}', active: _selectedFilter == 2),
          ];

          final filteredItems = switch (_selectedFilter) {
            1 => items.where((i) => i.useCount > 0).toList(),
            2 => items.where((i) => i.isFavorite).toList(),
            _ => items,
          };

          return Stack(
            children: [
              CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(child: SizedBox(height: topPadding + 44 + 20)),
                  SliverToBoxAdapter(child: _buildFilterChips(colors, filterChips)),
                  SliverToBoxAdapter(child: _buildSortRow(colors, filteredItems.length)),
                  SliverPadding(
                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 32),
                    sliver: _gridMode
                        ? SliverGrid(
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              mainAxisSpacing: 10,
                              crossAxisSpacing: 10,
                              childAspectRatio: 0.85,
                            ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                return GestureDetector(
                                  onTap: () => context.push('/gear/item/${filteredItems[index].id}'),
                                  child: _buildGridCard(colors, filteredItems[index]),
                                );
                              },
                              childCount: filteredItems.length,
                            ),
                          )
                        : SliverList(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                return Padding(
                                  padding: EdgeInsets.only(bottom: index < filteredItems.length - 1 ? 10 : 32),
                                  child: GestureDetector(
                                    onTap: () => context.push('/gear/item/${filteredItems[index].id}'),
                                    child: _buildItemCard(colors, filteredItems[index]),
                                  ),
                                );
                              },
                              childCount: filteredItems.length,
                            ),
                          ),
                  ),
                ],
              ),
              Positioned(
                top: 0, left: 0, right: 0,
                child: _buildStickyHeader(colors, topPadding, categoryName, items.length, totalWeight, totalPrice),
              ),
            ],
          );
        },
      ),
    );
  }

  // ─── Sticky header ────────────────────────────────────────────────

  Widget _buildStickyHeader(KaipaColors colors, double topPadding, String categoryName, int count, double totalWeightG, double totalPrice) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [colors.bg.withAlpha(204), colors.bg.withAlpha(0)],
          stops: const [0.7, 1.0],
        ),
      ),
      padding: EdgeInsets.only(top: topPadding + 10, left: 16, right: 16, bottom: 10),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: colors.surface, shape: BoxShape.circle, border: Border.all(color: colors.line, width: 0.5)),
              child: Center(child: KaipaIcon(name: KaipaIcons.chevronLeft, size: 16, color: colors.ink)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(categoryName, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                const SizedBox(height: 1),
                Text(
                  '$count 件 · ${(totalWeightG / 1000).toStringAsFixed(2)} kg · ¥${totalPrice.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 11, color: colors.inkMuted),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () {
              showModalBottomSheet(
                context: context,
                useRootNavigator: true,
                isScrollControlled: true,
                backgroundColor: colors.bg,
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
                builder: (_) => CreateGearItemSheet(initialCategoryId: widget.categoryId),
              ).then((created) {
                if (created == true) {
                  ref.invalidate(gearItemsByCategoryProvider(widget.categoryId));
                  ref.invalidate(gearCategoriesProvider);
                  ref.invalidate(allGearItemsProvider);
                }
              });
            },
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: colors.flare, shape: BoxShape.circle),
              child: const Center(child: KaipaIcon(name: KaipaIcons.plus, size: 16, color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Filter chips ─────────────────────────────────────────────────

  Widget _buildFilterChips(KaipaColors colors, List<_FilterChip> chips) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SizedBox(
        height: 30,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: chips.length,
          separatorBuilder: (_, _) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            final chip = chips[index];
            return GestureDetector(
              onTap: () => setState(() => _selectedFilter = index),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                decoration: BoxDecoration(
                  color: chip.active ? colors.flareSoft : colors.surface,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: chip.active ? Colors.transparent : colors.line, width: 0.5),
                ),
                child: Text(
                  chip.label,
                  style: TextStyle(fontSize: 11.5, fontWeight: chip.active ? FontWeight.w600 : FontWeight.w500, color: chip.active ? colors.flare : colors.ink),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  // ─── Sort row ─────────────────────────────────────────────────────

  Widget _buildSortRow(KaipaColors colors, int count) {
    return Padding(
      padding: const EdgeInsets.only(left: 20, right: 16, bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text('$count 件 · 按使用次数', style: TextStyle(fontSize: 12, color: colors.inkMuted))),
          Row(children: [
            GestureDetector(
              onTap: () => setState(() => _gridMode = true),
              child: Container(
                width: 28, height: 28,
                decoration: BoxDecoration(color: _gridMode ? colors.flareSoft : colors.surface, borderRadius: BorderRadius.circular(8), border: Border.all(color: colors.line, width: 0.5)),
                child: Center(child: KaipaIcon(name: KaipaIcons.grid, size: 13, color: _gridMode ? colors.flare : colors.ink)),
              ),
            ),
            const SizedBox(width: 6),
            GestureDetector(
              onTap: () => setState(() => _gridMode = false),
              child: Container(
                width: 28, height: 28,
                decoration: BoxDecoration(color: !_gridMode ? colors.flareSoft : colors.surface, borderRadius: BorderRadius.circular(8), border: Border.all(color: colors.line, width: 0.5)),
                child: Center(child: KaipaIcon(name: KaipaIcons.list, size: 13, color: !_gridMode ? colors.flare : colors.ink)),
              ),
            ),
          ]),
        ],
      ),
    );
  }

  // ─── Item card ────────────────────────────────────────────────────

  Widget _buildItemCard(KaipaColors colors, GearItemModel item) {
    final badge = _conditionBadge(item.condition, colors);

    final tags = <String>[];
    if (item.isFavorite) tags.add('收藏');
    if (item.condition == 'new') tags.add('全新');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [BoxShadow(color: Color.fromRGBO(40, 30, 20, 0.04), offset: Offset(0, 1), blurRadius: 3)],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildThumbnail(item),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(
                    child: Text(item.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: badge.bgColor, borderRadius: BorderRadius.circular(99)),
                    child: Text(badge.label, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: badge.textColor, letterSpacing: 0.2)),
                  ),
                ]),
                const SizedBox(height: 3),
                Text(
                  item.brand != null ? '${item.brand} · ${item.notes ?? ''}' : item.notes ?? '--',
                  style: TextStyle(fontSize: 11.5, color: colors.inkMuted, letterSpacing: -0.1),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (tags.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 4, runSpacing: 4,
                    children: tags.map((tag) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(color: colors.surfaceHi, borderRadius: BorderRadius.circular(99), border: Border.all(color: colors.line, width: 0.5)),
                      child: Text(tag, style: TextStyle(fontSize: 10, color: colors.ink, letterSpacing: -0.1)),
                    )).toList(),
                  ),
                ],
                const SizedBox(height: 6),
                Row(children: [
                  Text(
                    item.weightG != null ? '${item.weightG!.toStringAsFixed(0)}g' : '--',
                    style: TextStyle(fontSize: 10.5, color: colors.inkMuted, fontFamily: 'monospace'),
                  ),
                  const SizedBox(width: 12),
                  Container(width: 1, height: 10, color: colors.line),
                  const SizedBox(width: 12),
                  Text('用过 ${item.useCount} 次', style: TextStyle(fontSize: 10.5, color: colors.inkMuted, fontFamily: 'monospace')),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Grid card ─────────────────────────────────────────────────────

  Widget _buildGridCard(KaipaColors colors, GearItemModel item) {
    final badge = _conditionBadge(item.condition, colors);

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [BoxShadow(color: Color.fromRGBO(40, 30, 20, 0.04), offset: Offset(0, 1), blurRadius: 3)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: _buildGridThumbnail(item, colors)),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                    decoration: BoxDecoration(color: badge.bgColor, borderRadius: BorderRadius.circular(99)),
                    child: Text(badge.label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: badge.textColor)),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    item.weightG != null ? '${item.weightG!.toStringAsFixed(0)}g' : '--',
                    style: TextStyle(fontSize: 10, color: colors.inkMuted, fontFamily: 'monospace'),
                  ),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGridThumbnail(GearItemModel item, KaipaColors colors) {
    final hash = item.id.hashCode;
    final color1 = Color(0xFF2A2118 + (hash & 0x3F3F3F));
    final color2 = Color(0xFF4A3628 + ((hash >> 8) & 0x3F3F3F));
    final hasPhoto = item.photoUrl != null && item.photoUrl!.isNotEmpty;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
      child: Stack(children: [
        if (hasPhoto)
          Positioned.fill(
            child: CachedNetworkImage(
              imageUrl: item.photoUrl!,
              fit: BoxFit.cover,
              placeholder: (context, url) => Container(
                decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
              ),
              errorWidget: (context, url, error) => Container(
                decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
                child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(38))),
              ),
            ),
          )
        else
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
              child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(38))),
            ),
          ),
        if (item.isFavorite)
          Positioned(
            top: 6, right: 6,
            child: Container(
              width: 20, height: 20,
              decoration: const BoxDecoration(color: Color.fromRGBO(0, 0, 0, 0.45), shape: BoxShape.circle),
              child: const Center(child: KaipaIcon(name: KaipaIcons.heartFill, size: 10, color: Colors.white)),
            ),
          ),
      ]),
    );
  }

  // ─── Photo thumbnail ──────────────────────────────────────────────

  Widget _buildThumbnail(GearItemModel item) {
    final hash = item.id.hashCode;
    final color1 = Color(0xFF2A2118 + (hash & 0x3F3F3F));
    final color2 = Color(0xFF4A3628 + ((hash >> 8) & 0x3F3F3F));
    final hasPhoto = item.photoUrl != null && item.photoUrl!.isNotEmpty;

    return SizedBox(
      width: 84, height: 84,
      child: Stack(children: [
        Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: hasPhoto
                ? CachedNetworkImage(
                    imageUrl: item.photoUrl!,
                    fit: BoxFit.cover,
                    placeholder: (context, url) => Container(
                      decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
                    ),
                    errorWidget: (context, url, error) => Container(
                      decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
                      child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(38))),
                    ),
                  )
                : Container(
                    decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color1, color2])),
                    child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(38))),
                  ),
          ),
        ),
        if (item.isFavorite)
          Positioned(
            top: 4, right: 4,
            child: Container(
              width: 18, height: 18,
              decoration: const BoxDecoration(color: Color.fromRGBO(0, 0, 0, 0.45), shape: BoxShape.circle),
              child: const Center(child: KaipaIcon(name: KaipaIcons.heartFill, size: 9, color: Colors.white)),
            ),
          ),
      ]),
    );
  }

  // ─── Loading / Error ──────────────────────────────────────────────

  Widget _buildShimmer(KaipaColors colors, double topPadding) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, topPadding + 60, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 30, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(15))),
            const SizedBox(height: 16),
            for (int i = 0; i < 3; i++) ...[
              Container(height: 100, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16))),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildError(KaipaColors colors, Object error) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          KaipaIcon(name: KaipaIcons.alert, size: 48, color: colors.flare),
          const SizedBox(height: 16),
          Text('加载失败', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
          const SizedBox(height: 8),
          Text(error.toString(), textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: colors.inkMuted)),
          const SizedBox(height: 20),
          TextButton(
            onPressed: () => ref.invalidate(gearItemsByCategoryProvider(widget.categoryId)),
            child: Text('重试', style: TextStyle(color: colors.flare, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ─── Boot silhouette CustomPainter ──────────────────────────────────

class _BootSilhouettePainter extends CustomPainter {
  final Color color;

  _BootSilhouettePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color..style = PaintingStyle.fill;
    final w = size.width;
    final h = size.height;

    final path = Path();
    path.moveTo(w * 0.30, h * 0.20);
    path.lineTo(w * 0.50, h * 0.18);
    path.cubicTo(w * 0.52, h * 0.30, w * 0.50, h * 0.40, w * 0.52, h * 0.48);
    path.cubicTo(w * 0.55, h * 0.55, w * 0.60, h * 0.60, w * 0.70, h * 0.62);
    path.cubicTo(w * 0.78, h * 0.63, w * 0.88, h * 0.64, w * 0.90, h * 0.66);
    path.cubicTo(w * 0.92, h * 0.68, w * 0.93, h * 0.72, w * 0.92, h * 0.75);
    path.lineTo(w * 0.90, h * 0.78);
    path.lineTo(w * 0.85, h * 0.80);
    path.lineTo(w * 0.80, h * 0.79);
    path.lineTo(w * 0.70, h * 0.80);
    path.lineTo(w * 0.60, h * 0.79);
    path.lineTo(w * 0.50, h * 0.80);
    path.lineTo(w * 0.40, h * 0.79);
    path.lineTo(w * 0.30, h * 0.80);
    path.cubicTo(w * 0.22, h * 0.80, w * 0.18, h * 0.78, w * 0.17, h * 0.74);
    path.cubicTo(w * 0.16, h * 0.68, w * 0.18, h * 0.58, w * 0.20, h * 0.48);
    path.cubicTo(w * 0.22, h * 0.38, w * 0.25, h * 0.30, w * 0.28, h * 0.22);
    path.close();

    final eyeletPaint = Paint()..color = color.withAlpha((color.a * 255 * 0.6).round())..style = PaintingStyle.fill;
    canvas.drawPath(path, paint);

    for (int i = 0; i < 3; i++) {
      final ey = h * (0.28 + i * 0.07);
      canvas.drawCircle(Offset(w * 0.36, ey), w * 0.018, eyeletPaint);
      canvas.drawCircle(Offset(w * 0.46, ey), w * 0.018, eyeletPaint);
    }
  }

  @override
  bool shouldRepaint(_BootSilhouettePainter oldDelegate) => oldDelegate.color != color;
}
