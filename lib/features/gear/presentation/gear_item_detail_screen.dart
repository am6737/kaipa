import 'dart:ui' as ui;
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
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

    // Boot silhouette – a large hiking boot shape
    final path = Path();

    // Ankle / shaft top-left
    path.moveTo(w * 0.28, h * 0.10);
    // Top of shaft
    path.cubicTo(
      w * 0.30, h * 0.06,
      w * 0.48, h * 0.04,
      w * 0.52, h * 0.08,
    );
    // Shaft right side going down
    path.cubicTo(
      w * 0.54, h * 0.12,
      w * 0.55, h * 0.28,
      w * 0.54, h * 0.40,
    );
    // Tongue area bump
    path.cubicTo(
      w * 0.53, h * 0.44,
      w * 0.56, h * 0.48,
      w * 0.58, h * 0.50,
    );
    // Toe box – extends forward
    path.cubicTo(
      w * 0.64, h * 0.54,
      w * 0.78, h * 0.58,
      w * 0.88, h * 0.62,
    );
    // Toe tip curves down
    path.cubicTo(
      w * 0.93, h * 0.64,
      w * 0.96, h * 0.68,
      w * 0.96, h * 0.72,
    );
    // Sole front
    path.cubicTo(
      w * 0.96, h * 0.78,
      w * 0.94, h * 0.82,
      w * 0.90, h * 0.85,
    );
    // Sole bottom – flat with tread bumps
    path.lineTo(w * 0.86, h * 0.87);
    path.lineTo(w * 0.80, h * 0.88);
    path.lineTo(w * 0.70, h * 0.88);
    path.lineTo(w * 0.55, h * 0.88);
    path.lineTo(w * 0.40, h * 0.87);
    path.lineTo(w * 0.30, h * 0.86);
    // Heel
    path.cubicTo(
      w * 0.22, h * 0.85,
      w * 0.16, h * 0.82,
      w * 0.14, h * 0.78,
    );
    path.cubicTo(
      w * 0.12, h * 0.74,
      w * 0.14, h * 0.68,
      w * 0.18, h * 0.60,
    );
    // Back of shaft going up
    path.cubicTo(
      w * 0.20, h * 0.50,
      w * 0.22, h * 0.36,
      w * 0.24, h * 0.24,
    );
    path.cubicTo(
      w * 0.25, h * 0.18,
      w * 0.27, h * 0.14,
      w * 0.28, h * 0.10,
    );
    path.close();

    canvas.drawPath(path, paint);

    // Sole line detail
    final solePaint = Paint()
      ..color = color.withAlpha((color.a * 255 * 1.4).round().clamp(0, 255))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    final solePath = Path();
    solePath.moveTo(w * 0.16, h * 0.80);
    solePath.cubicTo(
      w * 0.30, h * 0.84,
      w * 0.60, h * 0.86,
      w * 0.92, h * 0.80,
    );
    canvas.drawPath(solePath, solePaint);

    // Lace eyelets
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
  bool shouldRepaint(_BootSilhouettePainter oldDelegate) {
    return oldDelegate.color != color;
  }
}

// ─── Demo data for the 4 photo slots ─────────────────────────────────
class _PhotoSlot {
  final String label;
  final Color color1;
  final Color color2;

  const _PhotoSlot(this.label, this.color1, this.color2);
}

const _demoPhotos = [
  _PhotoSlot('主图', Color(0xFF3A2F22), Color(0xFF5C4A36)),
  _PhotoSlot('细节', Color(0xFF2E3B2A), Color(0xFF4A5C42)),
  _PhotoSlot('使用中', Color(0xFF2A2E3B), Color(0xFF3E4A5C)),
  _PhotoSlot('磨损', Color(0xFF3B2A2A), Color(0xFF5C3E3E)),
];

// ─── Demo route data ─────────────────────────────────────────────────
class _DemoRoute {
  final String name;
  final String date;
  final String km;

  const _DemoRoute(this.name, this.date, this.km);
}

const _demoRoutes = [
  _DemoRoute('武功山穿越', '2026-03-15', '42.3 km'),
  _DemoRoute('四姑娘山大峰', '2026-01-22', '28.7 km'),
  _DemoRoute('鳌太穿越', '2025-11-08', '86.5 km'),
];

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
  int _currentPhotoIndex = 0;

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

                // Tags
                const SizedBox(height: 12),
                _buildTags(colors),

                // Stats card
                const SizedBox(height: 18),
                _buildStatsCard(colors),

                // Specs section
                const SizedBox(height: 22),
                _buildSpecsSection(colors, item),

                // Notes section
                const SizedBox(height: 22),
                _buildNotesSection(colors),

                // Routes section
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
    final photo = _demoPhotos[_currentPhotoIndex];

    return Container(
      width: double.infinity,
      height: 380,
      color: const Color(0xFF2A2118),
      child: Stack(
        children: [
          // Radial gradient background
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.30, -0.40), // 35% 30%
                  radius: 1.2,
                  colors: [photo.color2, photo.color1],
                ),
              ),
            ),
          ),

          // Boot silhouette illustration
          Positioned(
            left: 20,
            right: 20,
            top: 40,
            bottom: 90,
            child: CustomPaint(
              painter: _BootSilhouettePainter(
                color: Colors.white.withAlpha(18),
              ),
            ),
          ),

          // Top chrome buttons (y=50 from top of container)
          Positioned(
            top: topPadding > 0 ? topPadding + 6 : 50,
            left: 12,
            right: 12,
            child: Row(
              children: [
                // Back button
                _buildChromeButton(
                  icon: KaipaIcons.back,
                  colors: colors,
                  onTap: () => context.pop(),
                ),
                const Spacer(),
                // Photo counter pill
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(0, 0, 0, 0.45),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: BackdropFilter(
                      filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Text(
                        '${_currentPhotoIndex + 1} / 4',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ),
                ),
                const Spacer(),
                // Share button
                _buildChromeButton(
                  icon: KaipaIcons.share,
                  colors: colors,
                  onTap: () {},
                ),
                const SizedBox(width: 8),
                // More button
                _buildChromeButton(
                  icon: KaipaIcons.more,
                  colors: colors,
                  onTap: () => _showMoreMenu(context, colors, item),
                ),
              ],
            ),
          ),

          // Page dots (bottom 76)
          Positioned(
            left: 0,
            right: 0,
            bottom: 76,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (index) {
                final isActive = index == _currentPhotoIndex;
                return Container(
                  width: isActive ? 18 : 6,
                  height: 6,
                  margin: EdgeInsets.only(left: index > 0 ? 4 : 0),
                  decoration: BoxDecoration(
                    color: isActive
                        ? Colors.white
                        : Colors.white.withAlpha(128),
                    borderRadius: BorderRadius.circular(99),
                  ),
                );
              }),
            ),
          ),

          // Thumbnail strip (bottom 12, left/right 12)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: SizedBox(
              height: 52,
              child: Row(
                children: [
                  // 4 photo thumbnails
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (int i = 0; i < _demoPhotos.length; i++) ...[
                            if (i > 0) const SizedBox(width: 6),
                            _buildThumbnail(i),
                          ],
                          const SizedBox(width: 6),
                          // Add photo button
                          _buildAddPhotoButton(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChromeButton({
    required String icon,
    required KaipaColors colors,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: const Color.fromRGBO(255, 255, 255, 0.92),
          shape: BoxShape.circle,
          boxShadow: const [
            BoxShadow(
              color: Color.fromRGBO(0, 0, 0, 0.18),
              offset: Offset(0, 2),
              blurRadius: 8,
            ),
          ],
        ),
        child: ClipOval(
          child: BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Center(
              child: KaipaIcon(
                name: icon,
                size: 16,
                color: colors.ink,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildThumbnail(int index) {
    final photo = _demoPhotos[index];
    final isActive = index == _currentPhotoIndex;

    return GestureDetector(
      onTap: () {
        setState(() {
          _currentPhotoIndex = index;
        });
      },
      child: SizedBox(
        width: 52,
        height: 52,
        child: Stack(
          children: [
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [photo.color2, photo.color1],
                  ),
                  border: Border.all(
                    color: isActive
                        ? Colors.white
                        : const Color.fromRGBO(255, 255, 255, 0.3),
                    width: 2,
                  ),
                ),
              ),
            ),
            // Tag label at bottom
            Positioned(
              bottom: 2,
              left: 2,
              right: 2,
              child: Text(
                photo.label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  shadows: [
                    Shadow(
                      color: Color(0x99000000),
                      blurRadius: 3,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAddPhotoButton() {
    return SizedBox(
      width: 52,
      height: 52,
      child: CustomPaint(
        painter: _DashedBorderPainter(
          color: const Color.fromRGBO(255, 255, 255, 0.6),
          fillColor: const Color.fromRGBO(255, 255, 255, 0.2),
          strokeWidth: 1.5,
          borderRadius: 8,
        ),
        child: const Center(
          child: KaipaIcon(
            name: KaipaIcons.plus,
            size: 16,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  // ─── Title row ─────────────────────────────────────────────────────

  Widget _buildTitleRow(KaipaColors colors, GearItemModel item) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                'Salomon X Ultra 4',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: colors.ink,
                  letterSpacing: -0.6,
                  height: 1.15,
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Condition badge: 良好
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 4,
              ),
              decoration: BoxDecoration(
                color: colors.mossSoft,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '良好',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: colors.moss,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'GTX 中帮防水徒步鞋',
          style: TextStyle(
            fontSize: 13,
            color: colors.inkMuted,
            letterSpacing: -0.2,
          ),
        ),
      ],
    );
  }

  // ─── Tags ──────────────────────────────────────────────────────────

  Widget _buildTags(KaipaColors colors) {
    const tags = ['防水', '中帮', '春秋', '常用'];
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: tags.map((tag) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: colors.surfaceHi,
            borderRadius: BorderRadius.circular(99),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Text(
            tag,
            style: TextStyle(
              fontSize: 11,
              color: colors.ink,
            ),
          ),
        );
      }).toList(),
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
      child: Row(
        children: [
          Expanded(
            child: StatWidget(value: '38', label: '使用次数'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: StatWidget(value: '412', unit: 'km', label: '累计里程'),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: StatWidget(value: '4.6', label: '自评'),
          ),
        ],
      ),
    );
  }

  // ─── Specs section ─────────────────────────────────────────────────

  Widget _buildSpecsSection(KaipaColors colors, GearItemModel item) {
    final specs = <_SpecRow>[
      const _SpecRow('品牌', 'Salomon'),
      const _SpecRow('型号', 'X Ultra 4 Mid GTX'),
      const _SpecRow('尺码', 'EU 42 · UK 8'),
      const _SpecRow('重量', '420 g', mono: true),
      const _SpecRow('价格', '¥1,280', mono: true),
      const _SpecRow('入手日期', '2025-09-12'),
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

  // ─── Notes section ─────────────────────────────────────────────────

  Widget _buildNotesSection(KaipaColors colors) {
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
            '鞋码偏小半码，建议加垫。冰雪路面抓地一般，需配合冰爪。鞋带 3 个月后开始磨损，可考虑换 5mm 圆绳。',
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

  // ─── Routes section ────────────────────────────────────────────────

  Widget _buildRoutesSection(KaipaColors colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle(
          title: '参与过的路线',
          padding: EdgeInsets.zero,
          trailing: Text(
            '38 次',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Column(
          children: [
            for (int i = 0; i < _demoRoutes.length; i++) ...[
              if (i > 0) const SizedBox(height: 8),
              _buildRouteCard(colors, _demoRoutes[i]),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildRouteCard(KaipaColors colors, _DemoRoute route) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          // Route icon circle
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: colors.flareSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: KaipaIcon(
                name: KaipaIcons.route,
                size: 13,
                color: colors.flare,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Name + date/km
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  route.name,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${route.date}  ·  ${route.km}',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: colors.inkMuted,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          KaipaIcon(
            name: KaipaIcons.chevronRight,
            size: 14,
            color: colors.inkDim,
          ),
        ],
      ),
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

              // Favorite toggle
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

              // Delete
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
            height: 380,
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

// ─── Dashed border painter for add-photo button ────────────────────

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final Color? fillColor;
  final double strokeWidth;
  final double borderRadius;

  _DashedBorderPainter({
    required this.color,
    this.fillColor,
    required this.strokeWidth,
    required this.borderRadius,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        strokeWidth / 2,
        strokeWidth / 2,
        size.width - strokeWidth,
        size.height - strokeWidth,
      ),
      Radius.circular(borderRadius),
    );

    // Fill background
    if (fillColor != null) {
      final fillPaint = Paint()
        ..color = fillColor!
        ..style = PaintingStyle.fill;
      canvas.drawRRect(rrect, fillPaint);
    }

    // Dashed stroke
    final strokePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();
    const dashWidth = 5.0;
    const gapWidth = 4.0;

    for (final metric in metrics) {
      double distance = 0;
      bool draw = true;
      while (distance < metric.length) {
        final nextDistance = distance + (draw ? dashWidth : gapWidth);
        if (draw) {
          final segment = metric.extractPath(
            distance,
            math.min(nextDistance, metric.length),
          );
          canvas.drawPath(segment, strokePaint);
        }
        distance = nextDistance;
        draw = !draw;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.fillColor != fillColor ||
        oldDelegate.strokeWidth != strokeWidth ||
        oldDelegate.borderRadius != borderRadius;
  }
}

