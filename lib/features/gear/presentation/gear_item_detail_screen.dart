import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:shimmer/shimmer.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import '../domain/gear_trip_summary.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/stat_widget.dart';
import '../../../core/widgets/section_title.dart';

// ─── Boot silhouette painter ─────────────────────────────────────────
class _BootSilhouettePainter extends CustomPainter {
  final Color color;

  _BootSilhouettePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final w = size.width;
    final h = size.height;

    final path = Path();
    path.moveTo(w * 0.28, h * 0.10);
    path.cubicTo(w * 0.30, h * 0.06, w * 0.48, h * 0.04, w * 0.52, h * 0.08);
    path.cubicTo(w * 0.54, h * 0.12, w * 0.55, h * 0.28, w * 0.54, h * 0.40);
    path.cubicTo(w * 0.53, h * 0.44, w * 0.56, h * 0.48, w * 0.58, h * 0.50);
    path.cubicTo(w * 0.64, h * 0.54, w * 0.78, h * 0.58, w * 0.88, h * 0.62);
    path.cubicTo(w * 0.93, h * 0.64, w * 0.96, h * 0.68, w * 0.96, h * 0.72);
    path.cubicTo(w * 0.96, h * 0.78, w * 0.94, h * 0.82, w * 0.90, h * 0.85);
    path.lineTo(w * 0.86, h * 0.87);
    path.lineTo(w * 0.80, h * 0.88);
    path.lineTo(w * 0.70, h * 0.88);
    path.lineTo(w * 0.55, h * 0.88);
    path.lineTo(w * 0.40, h * 0.87);
    path.lineTo(w * 0.30, h * 0.86);
    path.cubicTo(w * 0.22, h * 0.85, w * 0.16, h * 0.82, w * 0.14, h * 0.78);
    path.cubicTo(w * 0.12, h * 0.74, w * 0.14, h * 0.68, w * 0.18, h * 0.60);
    path.cubicTo(w * 0.20, h * 0.50, w * 0.22, h * 0.36, w * 0.24, h * 0.24);
    path.cubicTo(w * 0.25, h * 0.18, w * 0.27, h * 0.14, w * 0.28, h * 0.10);
    path.close();

    canvas.drawPath(path, paint);

    final solePaint = Paint()
      ..color = color.withAlpha((color.a * 255 * 1.4).round().clamp(0, 255))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    final solePath = Path();
    solePath.moveTo(w * 0.16, h * 0.80);
    solePath.cubicTo(w * 0.30, h * 0.84, w * 0.60, h * 0.86, w * 0.92, h * 0.80);
    canvas.drawPath(solePath, solePaint);

    final eyeletPaint = Paint()
      ..color = color.withAlpha((color.a * 255 * 1.6).round().clamp(0, 255))
      ..style = PaintingStyle.fill;

    for (int i = 0; i < 4; i++) {
      final t = i / 3.0;
      final cx = w * (0.36 + t * 0.14);
      final cy = h * (0.38 - t * 0.18);
      canvas.drawCircle(Offset(cx, cy), 2.5, eyeletPaint);
    }
  }

  @override
  bool shouldRepaint(_BootSilhouettePainter oldDelegate) => oldDelegate.color != color;
}


class GearItemDetailScreen extends ConsumerStatefulWidget {
  final String itemId;

  const GearItemDetailScreen({
    super.key,
    required this.itemId,
  });

  @override
  ConsumerState<GearItemDetailScreen> createState() => _GearItemDetailScreenState();
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
          if (!_favoriteInitialized) {
            _isFavorite = item.isFavorite;
            _favoriteInitialized = true;
          }
          return _buildContent(context, colors, item);
        },
      ),
    );
  }

  Widget _buildContent(BuildContext context, KaipaColors colors, GearItemModel item) {
    final tripsAsync = ref.watch(tripsForGearItemProvider(widget.itemId));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _buildPhotoArea(context, colors, item)),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildTitleRow(colors, item),
                const SizedBox(height: 12),
                _buildTags(colors, item),
                const SizedBox(height: 18),
                _buildStatsCard(colors, item),
                const SizedBox(height: 22),
                _buildSpecsSection(colors, item),
                if (item.notes != null && item.notes!.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  _buildNotesSection(colors, item),
                ],
                const SizedBox(height: 22),
                _buildRoutesSection(colors, item, tripsAsync),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ─── Photo area ────────────────────────────────────────────────────

  Widget _buildPhotoArea(BuildContext context, KaipaColors colors, GearItemModel item) {
    final topPadding = MediaQuery.of(context).padding.top;
    final hasPhoto = item.photoUrl != null && item.photoUrl!.isNotEmpty;
    final hash = item.id.hashCode;
    final color1 = Color(0xFF2A2118 + (hash & 0x3F3F3F));
    final color2 = Color(0xFF4A3628 + ((hash >> 8) & 0x3F3F3F));

    return Container(
      width: double.infinity,
      height: 380,
      color: const Color(0xFF2A2118),
      child: Stack(
        children: [
          if (hasPhoto)
            Positioned.fill(
              child: CachedNetworkImage(
                imageUrl: item.photoUrl!,
                fit: BoxFit.cover,
                placeholder: (context, url) => Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(center: const Alignment(-0.30, -0.40), radius: 1.2, colors: [color2, color1]),
                  ),
                  child: const Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white38))),
                ),
                errorWidget: (context, url, error) => Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(center: const Alignment(-0.30, -0.40), radius: 1.2, colors: [color2, color1]),
                  ),
                  child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(18))),
                ),
              ),
            )
          else ...[
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: RadialGradient(center: const Alignment(-0.30, -0.40), radius: 1.2, colors: [color2, color1]),
                ),
              ),
            ),
            Positioned(
              left: 20, right: 20, top: 40, bottom: 90,
              child: CustomPaint(painter: _BootSilhouettePainter(color: Colors.white.withAlpha(18))),
            ),
          ],
          Positioned(
            top: topPadding > 0 ? topPadding + 6 : 50,
            left: 12, right: 12,
            child: Row(
              children: [
                _buildChromeButton(icon: KaipaIcons.back, colors: colors, onTap: () => context.pop()),
                const Spacer(),
                _buildChromeButton(
                  icon: _isFavorite ? KaipaIcons.heartFill : KaipaIcons.heart,
                  colors: colors,
                  onTap: () => _toggleFavorite(item),
                  iconColor: _isFavorite ? colors.diff.extreme : null,
                ),
                const SizedBox(width: 8),
                _buildChromeButton(icon: KaipaIcons.share, colors: colors, onTap: () {}),
                const SizedBox(width: 8),
                _buildChromeButton(icon: KaipaIcons.more, colors: colors, onTap: () => _showMoreMenu(context, colors, item)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChromeButton({required String icon, required KaipaColors colors, required VoidCallback onTap, Color? iconColor}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38, height: 38,
        decoration: const BoxDecoration(
          color: Color.fromRGBO(255, 255, 255, 0.92),
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Color.fromRGBO(0, 0, 0, 0.18), offset: Offset(0, 2), blurRadius: 8)],
        ),
        child: ClipOval(
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Center(child: KaipaIcon(name: icon, size: 16, color: iconColor ?? colors.ink)),
          ),
        ),
      ),
    );
  }


  // ─── Title row ─────────────────────────────────────────────────────

  Widget _buildTitleRow(KaipaColors colors, GearItemModel item) {
    final cond = _conditionInfo(item.condition, colors);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(item.name, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.6, height: 1.15)),
            ),
            if (item.condition != null) ...[
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: cond.color.withAlpha(26), borderRadius: BorderRadius.circular(999)),
                child: Text(cond.label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: cond.color, letterSpacing: 0.3)),
              ),
            ],
          ],
        ),
        const SizedBox(height: 4),
        Text(item.brand ?? '--', style: TextStyle(fontSize: 13, color: colors.inkMuted, letterSpacing: -0.2)),
      ],
    );
  }

  // ─── Tags (derived from item properties) ──────────────────────────

  Widget _buildTags(KaipaColors colors, GearItemModel item) {
    final tags = <String>[];
    if (item.isFavorite) tags.add('收藏');
    if (item.useCount > 10) tags.add('常用');
    if (item.condition == 'new') tags.add('全新');

    if (tags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 6, runSpacing: 6,
      children: tags.map((tag) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: colors.surfaceHi, borderRadius: BorderRadius.circular(99), border: Border.all(color: colors.line, width: 0.5)),
        child: Text(tag, style: TextStyle(fontSize: 11, color: colors.ink)),
      )).toList(),
    );
  }

  // ─── Stats card (real data) ────────────────────────────────────────

  Widget _buildStatsCard(KaipaColors colors, GearItemModel item) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.line, width: 0.5)),
      child: Row(
        children: [
          Expanded(child: StatWidget(value: '${item.useCount}', label: '使用次数')),
          const SizedBox(width: 12),
          Expanded(child: StatWidget(value: item.totalDistanceKm.toStringAsFixed(1), unit: 'km', label: '累计里程')),
        ],
      ),
    );
  }

  // ─── Specs section ─────────────────────────────────────────────────

  static final _dateFormat = DateFormat('yyyy-MM-dd');

  Widget _buildSpecsSection(KaipaColors colors, GearItemModel item) {
    final specs = <_SpecRow>[
      _SpecRow('品牌', item.brand ?? '--'),
      _SpecRow('重量', item.weightG != null ? '${item.weightG!.toStringAsFixed(0)} g' : '--', mono: true),
      _SpecRow('价格', item.price != null ? '¥${item.price!.toStringAsFixed(0)}' : '--', mono: true),
      _SpecRow('入手日期', item.purchasedAt != null ? _dateFormat.format(item.purchasedAt!) : '--'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(title: '规格', padding: EdgeInsets.zero),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.line, width: 0.5)),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (int i = 0; i < specs.length; i++) ...[
                if (i > 0) Divider(height: 0.5, thickness: 0.5, color: colors.line),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(children: [
                    Text(specs[i].label, style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                    const Spacer(),
                    Text(specs[i].value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.ink, fontFamily: specs[i].mono ? 'monospace' : null)),
                  ]),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // ─── Notes section ─────────────────────────────────────────────────

  Widget _buildNotesSection(KaipaColors colors, GearItemModel item) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(title: '备注', padding: EdgeInsets.zero),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: colors.line, width: 0.5)),
          child: Text(item.notes!, style: TextStyle(fontSize: 13, color: colors.ink, height: 1.55, letterSpacing: -0.1)),
        ),
      ],
    );
  }

  // ─── Routes section (real data from trips) ────────────────────────

  Widget _buildRoutesSection(KaipaColors colors, GearItemModel item, AsyncValue<List<GearTripSummary>> tripsAsync) {
    return tripsAsync.when(
      loading: () => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(title: '参与过的路线', padding: EdgeInsets.zero),
          const SizedBox(height: 8),
          Shimmer.fromColors(
            baseColor: colors.surface,
            highlightColor: colors.surfaceHi,
            child: Container(height: 60, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(12))),
          ),
        ],
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (trips) {
        if (trips.isEmpty) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionTitle(title: '参与过的路线', padding: EdgeInsets.zero),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: colors.line, width: 0.5)),
                child: Text('暂未使用过', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: colors.inkMuted)),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionTitle(
              title: '参与过的路线',
              padding: EdgeInsets.zero,
              trailing: Text('${trips.length} 次', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: colors.inkMuted)),
            ),
            const SizedBox(height: 8),
            Column(children: [
              for (int i = 0; i < trips.length; i++) ...[
                if (i > 0) const SizedBox(height: 8),
                _buildRouteCard(colors, trips[i]),
              ],
            ]),
          ],
        );
      },
    );
  }

  static final _tripDateFormat = DateFormat('yyyy-MM-dd');

  Widget _buildRouteCard(KaipaColors colors, GearTripSummary trip) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: colors.line, width: 0.5)),
      child: Row(children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(color: colors.flareSoft, borderRadius: BorderRadius.circular(8)),
          child: Center(child: KaipaIcon(name: KaipaIcons.route, size: 13, color: colors.flare)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(trip.routeName, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: colors.ink)),
              const SizedBox(height: 2),
              Text(
                '${_tripDateFormat.format(trip.startedAt)}  ·  ${trip.distanceKm.toStringAsFixed(1)} km  ·  ${trip.elevationM}m↑',
                style: TextStyle(fontSize: 10.5, color: colors.inkMuted, fontFamily: 'monospace'),
              ),
            ],
          ),
        ),
        KaipaIcon(name: KaipaIcons.chevronRight, size: 14, color: colors.inkDim),
      ]),
    );
  }

  // ─── More menu ─────────────────────────────────────────────────────

  void _showMoreMenu(BuildContext context, KaipaColors colors, GearItemModel item) {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(width: 36, height: 4, decoration: BoxDecoration(color: colors.lineSoft, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 8),
              ListTile(
                leading: KaipaIcon(name: _isFavorite ? KaipaIcons.heartFill : KaipaIcons.heart, size: 20, color: _isFavorite ? colors.diff.extreme : colors.ink),
                title: Text(_isFavorite ? '取消收藏' : '收藏', style: TextStyle(fontSize: 15, color: colors.ink)),
                onTap: () { Navigator.of(sheetContext).pop(); _toggleFavorite(item); },
              ),
              ListTile(
                leading: KaipaIcon(name: KaipaIcons.close, size: 20, color: colors.diff.extreme),
                title: Text('删除', style: TextStyle(fontSize: 15, color: colors.diff.extreme)),
                onTap: () { Navigator.of(sheetContext).pop(); _showDeleteDialog(context, colors, item); },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // ─── Business logic ───────────────────────────────────────────────

  Future<void> _toggleFavorite(GearItemModel item) async {
    final newValue = !_isFavorite;
    setState(() { _isFavorite = newValue; });

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.toggleFavorite(item.id, newValue);
      ref.invalidate(gearItemByIdProvider(widget.itemId));
    } catch (_) {
      if (mounted) setState(() { _isFavorite = !newValue; });
    }
  }

  void _showDeleteDialog(BuildContext context, KaipaColors colors, GearItemModel item) {
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: colors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: Text('确认删除', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink)),
          content: Text('确定要删除"${item.name}"吗？此操作无法撤销。', style: TextStyle(fontSize: 14, color: colors.inkMuted)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text('取消', style: TextStyle(color: colors.inkMuted, fontWeight: FontWeight.w600)),
            ),
            TextButton(
              onPressed: () async { Navigator.of(dialogContext).pop(); await _deleteItem(item); },
              child: Text('删除', style: TextStyle(color: colors.diff.extreme, fontWeight: FontWeight.w600)),
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
      ref.invalidate(allGearItemsProvider);
      ref.invalidate(gearItemsByCategoryProvider(item.categoryId));
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败: $e'), backgroundColor: ref.read(kaipaTokensProvider).color.diff.extreme),
        );
      }
    }
  }

  Widget _buildShimmerLoading(KaipaColors colors) {
    return Shimmer.fromColors(
      baseColor: colors.surface,
      highlightColor: colors.surfaceHi,
      child: Column(children: [
        Container(width: double.infinity, height: 380, color: colors.surface),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 28, width: 200, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(6))),
              const SizedBox(height: 8),
              Container(height: 16, width: 120, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(6))),
              const SizedBox(height: 24),
              Container(height: 120, width: double.infinity, decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16))),
            ],
          ),
        ),
      ]),
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
              KaipaIcon(name: KaipaIcons.alert, size: 48, color: colors.diff.extreme),
              const SizedBox(height: 16),
              Text('加载失败', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
              const SizedBox(height: 8),
              Text(error.toString(), textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: colors.inkMuted)),
              const SizedBox(height: 20),
              TextButton(
                onPressed: () => ref.invalidate(gearItemByIdProvider(widget.itemId)),
                child: Text('重试', style: TextStyle(color: colors.flare, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.pop(),
                child: Text('返回', style: TextStyle(color: colors.inkMuted, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

class _SpecRow {
  final String label;
  final String value;
  final bool mono;

  const _SpecRow(this.label, this.value, {this.mono = false});
}

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
      return _ConditionInfo('良好', colors.moss);
    case 'fair':
      return _ConditionInfo('一般', colors.sand);
    case 'worn':
      return _ConditionInfo('磨损', colors.diff.extreme);
    default:
      return _ConditionInfo('未知', colors.inkDim);
  }
}

