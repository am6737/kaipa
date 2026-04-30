import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/widgets/kaipa_icons.dart';

// ─── Demo data ──────────────────────────────────────────────────────

class _DemoGearItem {
  final String name;
  final String subtitle;
  final int weightG;
  final List<String> tags;
  final String condition; // 'good' | 'worn' | 'new'
  final int uses;
  final int photoCount;
  final List<Color> gradientColors;

  const _DemoGearItem({
    required this.name,
    required this.subtitle,
    required this.weightG,
    required this.tags,
    required this.condition,
    required this.uses,
    required this.photoCount,
    required this.gradientColors,
  });
}

final List<_DemoGearItem> _demoItems = [
  _DemoGearItem(
    name: 'Salomon X Ultra 4',
    subtitle: 'GTX 中帮 · 男 42',
    weightG: 420,
    tags: ['防水', '中帮', '春秋'],
    condition: 'good',
    uses: 38,
    photoCount: 4,
    gradientColors: [const Color(0xFF5C4D3E), const Color(0xFFA04A2C)],
  ),
  _DemoGearItem(
    name: 'La Sportiva TX4',
    subtitle: '接近鞋 · 男 42',
    weightG: 380,
    tags: ['攀爬', '低帮'],
    condition: 'good',
    uses: 12,
    photoCount: 3,
    gradientColors: [const Color(0xFF1F2E1A), const Color(0xFFFFD93D)],
  ),
  _DemoGearItem(
    name: 'Hoka Speedgoat 5',
    subtitle: '越野跑鞋 · 男 42.5',
    weightG: 300,
    tags: ['越野', '夏季'],
    condition: 'worn',
    uses: 64,
    photoCount: 5,
    gradientColors: [const Color(0xFF2C5D7E), const Color(0xFFFFFFFF)],
  ),
  _DemoGearItem(
    name: 'Kailas KX5 高山靴',
    subtitle: '雪线 · 男 42 · B2 卡式',
    weightG: 780,
    tags: ['雪线', '冰爪兼容'],
    condition: 'good',
    uses: 6,
    photoCount: 2,
    gradientColors: [const Color(0xFF34465E), const Color(0xFFFF7A1A)],
  ),
];

// ─── Condition badge info ───────────────────────────────────────────

class _ConditionBadge {
  final String label;
  final Color textColor;
  final Color bgColor;

  const _ConditionBadge(this.label, this.textColor, this.bgColor);
}

_ConditionBadge _conditionBadge(String condition, KaipaColors colors) {
  switch (condition) {
    case 'good':
      return _ConditionBadge('良好', colors.moss, colors.mossSoft);
    case 'worn':
      return _ConditionBadge('磨损', colors.flare, colors.flareSoft);
    case 'new':
      return _ConditionBadge(
        '全新',
        const Color(0xFF3D6A8C),
        const Color(0xFFEAF0F5),
      );
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

const List<_FilterChip> _filterChips = [
  _FilterChip('全部 4', active: true),
  _FilterChip('使用中 2'),
  _FilterChip('收藏 1'),
  _FilterChip('雪线'),
  _FilterChip('越野'),
  _FilterChip('中帮'),
];

// ─── Main screen ────────────────────────────────────────────────────

class GearCategoryScreen extends ConsumerStatefulWidget {
  final String categoryId;

  const GearCategoryScreen({
    super.key,
    required this.categoryId,
  });

  @override
  ConsumerState<GearCategoryScreen> createState() =>
      _GearCategoryScreenState();
}

class _GearCategoryScreenState extends ConsumerState<GearCategoryScreen> {
  bool _gridMode = false;

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final topPadding = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          // Scrollable content
          CustomScrollView(
            slivers: [
              // Space for sticky header
              SliverToBoxAdapter(
                child: SizedBox(height: topPadding + 44 + 20),
              ),

              // Filter chips
              SliverToBoxAdapter(
                child: _buildFilterChips(colors),
              ),

              // Sort row
              SliverToBoxAdapter(
                child: _buildSortRow(colors),
              ),

              // Item cards
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      return Padding(
                        padding: EdgeInsets.only(
                          bottom: index < _demoItems.length - 1 ? 10 : 32,
                        ),
                        child: _buildItemCard(colors, _demoItems[index]),
                      );
                    },
                    childCount: _demoItems.length,
                  ),
                ),
              ),
            ],
          ),

          // Sticky header with gradient bg
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildStickyHeader(colors, topPadding),
          ),
        ],
      ),
    );
  }

  // ─── Sticky header ────────────────────────────────────────────────

  Widget _buildStickyHeader(KaipaColors colors, double topPadding) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            colors.bg.withAlpha(204), // 80%
            colors.bg.withAlpha(0), // transparent
          ],
          stops: const [0.7, 1.0],
        ),
      ),
      padding: EdgeInsets.only(
        top: topPadding + 10,
        left: 16,
        right: 16,
        bottom: 10,
      ),
      child: Row(
        children: [
          // Back button
          GestureDetector(
            onTap: () => context.pop(),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.surface,
                shape: BoxShape.circle,
                border: Border.all(color: colors.line, width: 0.5),
              ),
              child: Center(
                child: KaipaIcon(
                  name: KaipaIcons.chevronLeft,
                  size: 16,
                  color: colors.ink,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Category name + summary
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '鞋履',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '4 件 · 1.88 kg · ¥4,820',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),

          // Add button
          GestureDetector(
            onTap: () {
              // Add action placeholder
            },
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: colors.flare,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: KaipaIcon(
                  name: KaipaIcons.plus,
                  size: 16,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Filter chips ─────────────────────────────────────────────────

  Widget _buildFilterChips(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SizedBox(
        height: 30,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: _filterChips.length,
          separatorBuilder: (_, _) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            final chip = _filterChips[index];
            return Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: chip.active ? colors.flareSoft : colors.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: chip.active ? Colors.transparent : colors.line,
                  width: 0.5,
                ),
              ),
              child: Text(
                chip.label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: chip.active ? FontWeight.w600 : FontWeight.w500,
                  color: chip.active ? colors.flare : colors.ink,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  // ─── Sort row ─────────────────────────────────────────────────────

  Widget _buildSortRow(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(left: 20, right: 16, bottom: 10),
      child: Row(
        children: [
          // Left: count + sort label
          Expanded(
            child: Text(
              '4 件 · 按使用次数',
              style: TextStyle(
                fontSize: 12,
                color: colors.inkMuted,
              ),
            ),
          ),

          // Right: grid/list toggle buttons
          Row(
            children: [
              // Grid button
              GestureDetector(
                onTap: () => setState(() => _gridMode = true),
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: _gridMode ? colors.flareSoft : colors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Center(
                    child: KaipaIcon(
                      name: KaipaIcons.grid,
                      size: 13,
                      color: _gridMode ? colors.flare : colors.ink,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              // List button (active by default)
              GestureDetector(
                onTap: () => setState(() => _gridMode = false),
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: !_gridMode ? colors.flareSoft : colors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Center(
                    child: KaipaIcon(
                      name: KaipaIcons.list,
                      size: 13,
                      color: !_gridMode ? colors.flare : colors.ink,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ─── Item card ────────────────────────────────────────────────────

  Widget _buildItemCard(KaipaColors colors, _DemoGearItem item) {
    final badge = _conditionBadge(item.condition, colors);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(40, 30, 20, 0.04),
            offset: Offset(0, 1),
            blurRadius: 3,
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Photo thumbnail
          _buildThumbnail(item),
          const SizedBox(width: 12),

          // Info column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name + condition badge row
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.name,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.ink,
                          letterSpacing: -0.3,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: badge.bgColor,
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        badge.label,
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w700,
                          color: badge.textColor,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),

                // Subtitle
                Text(
                  item.subtitle,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),

                // Tags
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: item.tags.map((tag) {
                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: colors.surfaceHi,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: colors.line, width: 0.5),
                      ),
                      child: Text(
                        tag,
                        style: TextStyle(
                          fontSize: 10,
                          color: colors.ink,
                          letterSpacing: -0.1,
                        ),
                      ),
                    );
                  }).toList(),
                ),

                // Stats row
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(
                      '${item.weightG}g',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: colors.inkMuted,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Container(
                      width: 1,
                      height: 10,
                      color: colors.line,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      '用过 ${item.uses} 次',
                      style: TextStyle(
                        fontSize: 10.5,
                        color: colors.inkMuted,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─── Photo thumbnail ──────────────────────────────────────────────

  Widget _buildThumbnail(_DemoGearItem item) {
    return SizedBox(
      width: 84,
      height: 84,
      child: Stack(
        children: [
          // Gradient background + boot silhouette
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: item.gradientColors,
                  ),
                ),
                child: CustomPaint(
                  painter: _BootSilhouettePainter(
                    color: Colors.white.withAlpha(38), // ~15% opacity
                  ),
                ),
              ),
            ),
          ),

          // Photo count badge (bottom-right)
          Positioned(
            bottom: 4,
            right: 4,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 4, sigmaY: 4),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(0, 0, 0, 0.55),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const KaipaIcon(
                        name: KaipaIcons.camera,
                        size: 9,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        '${item.photoCount}',
                        style: const TextStyle(
                          fontSize: 9.5,
                          color: Colors.white,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
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
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final w = size.width;
    final h = size.height;

    // Boot shape: hiking boot profile facing right
    // Scaled to fill the thumbnail area nicely
    final path = Path();

    // Start at the top of the boot shaft (left side)
    path.moveTo(w * 0.30, h * 0.20);

    // Top of shaft
    path.lineTo(w * 0.50, h * 0.18);

    // Right side of shaft curving down
    path.cubicTo(
      w * 0.52, h * 0.30,
      w * 0.50, h * 0.40,
      w * 0.52, h * 0.48,
    );

    // Ankle area curving to toe
    path.cubicTo(
      w * 0.55, h * 0.55,
      w * 0.60, h * 0.60,
      w * 0.70, h * 0.62,
    );

    // Toe box extending forward
    path.cubicTo(
      w * 0.78, h * 0.63,
      w * 0.88, h * 0.64,
      w * 0.90, h * 0.66,
    );

    // Toe front curve down to sole
    path.cubicTo(
      w * 0.92, h * 0.68,
      w * 0.93, h * 0.72,
      w * 0.92, h * 0.75,
    );

    // Sole — bottom of boot
    path.lineTo(w * 0.90, h * 0.78);

    // Sole tread (slight bumps)
    path.lineTo(w * 0.85, h * 0.80);
    path.lineTo(w * 0.80, h * 0.79);
    path.lineTo(w * 0.70, h * 0.80);
    path.lineTo(w * 0.60, h * 0.79);
    path.lineTo(w * 0.50, h * 0.80);
    path.lineTo(w * 0.40, h * 0.79);
    path.lineTo(w * 0.30, h * 0.80);

    // Heel
    path.cubicTo(
      w * 0.22, h * 0.80,
      w * 0.18, h * 0.78,
      w * 0.17, h * 0.74,
    );

    // Heel back going up
    path.cubicTo(
      w * 0.16, h * 0.68,
      w * 0.18, h * 0.58,
      w * 0.20, h * 0.48,
    );

    // Left side of shaft going up
    path.cubicTo(
      w * 0.22, h * 0.38,
      w * 0.25, h * 0.30,
      w * 0.28, h * 0.22,
    );

    path.close();

    // Lace eyelets — small circles on the shaft
    final eyeletPaint = Paint()
      ..color = color.withAlpha((color.a * 255 * 0.6).round())
      ..style = PaintingStyle.fill;

    canvas.drawPath(path, paint);

    // Draw lace eyelets
    for (int i = 0; i < 3; i++) {
      final ey = h * (0.28 + i * 0.07);
      canvas.drawCircle(Offset(w * 0.36, ey), w * 0.018, eyeletPaint);
      canvas.drawCircle(Offset(w * 0.46, ey), w * 0.018, eyeletPaint);
    }
  }

  @override
  bool shouldRepaint(_BootSilhouettePainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
