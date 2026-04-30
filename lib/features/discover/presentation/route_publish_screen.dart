import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../../core/widgets/mini_map.dart';
import '../../../core/widgets/diff_badge.dart';

class RoutePublishScreen extends ConsumerStatefulWidget {
  const RoutePublishScreen({super.key});

  @override
  ConsumerState<RoutePublishScreen> createState() => _RoutePublishScreenState();
}

class _RoutePublishScreenState extends ConsumerState<RoutePublishScreen> {
  int _selectedDifficulty = 2; // T3 selected by default (index 2)
  final List<bool> _toggles = [true, true, true];

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: Column(
        children: [
          // ── Top bar ──────────────────────────────────────────
          _buildTopBar(colors),
          // ── Scrollable content ───────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildGpsBanner(colors),
                  _buildMapPreview(colors, tokens),
                  _buildTitleCard(colors),
                  _buildStoryCard(colors),
                  _buildPhotosSection(colors, tokens),
                  _buildDifficultyCard(colors),
                  _buildPrivacyCard(colors),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Top bar ──────────────────────────────────────────────────────────
  Widget _buildTopBar(KaipaColors colors) {
    return Padding(
      padding: const EdgeInsets.only(top: 54, left: 16, right: 16, bottom: 14),
      child: Row(
        children: [
          CircleButton(
            icon: 'close',
            size: 36,
            iconSize: 15,
            onTap: () => context.pop(),
          ),
          const Spacer(),
          Text(
            '发布路线',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: colors.ink,
              letterSpacing: -0.2,
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('路线发布成功！'),
                  duration: Duration(seconds: 1),
                ),
              );
              context.pop();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: colors.flare,
                borderRadius: BorderRadius.circular(99),
              ),
              child: const Text(
                '发布',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                  letterSpacing: -0.1,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── GPS source banner ────────────────────────────────────────────────
  Widget _buildGpsBanner(KaipaColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.mossSoft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: colorWithOpacity(colors.mossDeep, 0.30),
          width: 0.5,
        ),
      ),
      child: Row(
        children: [
          // Icon circle
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: KaipaIcon(
                name: 'navigate',
                size: 16,
                color: colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Text column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '基于今日 GPS 轨迹',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '箭扣长城  ·  04.27 周日  ·  5:42 出发',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '更换 →',
            style: TextStyle(
              fontSize: 11.5,
              color: colors.flare,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  // ── Map preview ──────────────────────────────────────────────────────
  Widget _buildMapPreview(KaipaColors colors, KaipaTokens tokens) {
    return Container(
      height: 160,
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Mini map
          SizedBox(
            width: double.infinity,
            height: 160,
            child: MiniMap(seed: 0, height: 160, tokens: tokens),
          ),
          // Stats overlay badge
          Positioned(
            top: 10,
            right: 10,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: colors.glass,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '11.4 km  ·  ↑680 m',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontFamily: 'monospace',
                      color: colors.ink,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Title input card ─────────────────────────────────────────────────
  Widget _buildTitleCard(KaipaColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '标题',
            style: TextStyle(
              fontSize: 11,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '箭扣野长城日落穿越',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: colors.ink,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: colors.flareSoft,
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(
              'AI 已建议  ·  改',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: colors.flare,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Story card ───────────────────────────────────────────────────────
  Widget _buildStoryCard(KaipaColors colors) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '这次走得怎么样？',
            style: TextStyle(
              fontSize: 11,
              color: colors.inkMuted,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(height: 4),
          RichText(
            text: TextSpan(
              style: TextStyle(
                fontSize: 13.5,
                color: colors.ink,
                height: 1.6,
                letterSpacing: -0.1,
              ),
              children: [
                const TextSpan(
                  text: '从将军关下车，沿着野长城往西，午后云开雾散，鹰飞倒仰段落比想象中陡。',
                ),
                TextSpan(
                  text: '...',
                  style: TextStyle(color: colors.inkDim),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: ['#野长城', '#怀柔', '#一日穿越'].map((tag) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.flareSoft,
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  tag,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: colors.flare,
                    letterSpacing: -0.1,
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  // ── Photos section ───────────────────────────────────────────────────
  Widget _buildPhotosSection(KaipaColors colors, KaipaTokens tokens) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header row
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '照片  ·  6 张',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                  letterSpacing: -0.2,
                ),
              ),
              Text(
                '+ 添加',
                style: TextStyle(
                  fontSize: 11.5,
                  color: colors.flare,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        // Horizontal scroll of photo tiles (full-bleed)
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          // Full-bleed: extend beyond the 16px padding
          transform: Matrix4.translationValues(-16, 0, 0),
          child: SizedBox(
            height: 120,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: 6,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) => _PhotoTile(index: i, colors: colors, tokens: tokens),
            ),
          ),
        ),
      ],
    );
  }

  // ── Difficulty card ──────────────────────────────────────────────────
  Widget _buildDifficultyCard(KaipaColors colors) {
    final tiers = ['T1', 'T2', 'T3', 'T4', 'T5'];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: [
          // Header row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '难度评级',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.ink,
                  letterSpacing: -0.2,
                ),
              ),
              const DiffBadge(level: 'hard'),
            ],
          ),
          const SizedBox(height: 10),
          // T1-T5 segmented selector
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: List.generate(tiers.length, (i) {
                final selected = i == _selectedDifficulty;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _selectedDifficulty = i),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      decoration: BoxDecoration(
                        color: selected ? colors.flare : Colors.transparent,
                        borderRadius: BorderRadius.circular(7),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        tiers[i],
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : colors.inkMuted,
                          letterSpacing: -0.1,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 6),
          // Scale labels
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '初学',
                style: TextStyle(
                  fontSize: 10.5,
                  color: colors.inkMuted,
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '挑战',
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
    );
  }

  // ── Privacy card ─────────────────────────────────────────────────────
  Widget _buildPrivacyCard(KaipaColors colors) {
    final rows = [
      {
        'icon': 'users',
        'name': '公开',
        'desc': '所有人可见 · 进入精选有机会被推荐',
      },
      {
        'icon': 'compass',
        'name': '记入足迹',
        'desc': '保留到个人主页的足迹地图',
      },
      {
        'icon': 'pin',
        'name': '隐藏起点',
        'desc': '保护登山口位置 · 推荐用于野线',
      },
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        children: List.generate(rows.length, (i) {
          final row = rows[i];
          final isLast = i == rows.length - 1;
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    // Icon circle
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: colors.mossSoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: KaipaIcon(
                          name: row['icon']!,
                          size: 14,
                          color: colors.mossDeep,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Text column
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row['name']!,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: colors.ink,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            row['desc']!,
                            style: TextStyle(
                              fontSize: 10.5,
                              color: colors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Toggle switch
                    _ToggleSwitch(
                      value: _toggles[i],
                      activeColor: colors.flare,
                      inactiveColor: colors.line,
                      onChanged: (v) => setState(() => _toggles[i] = v),
                    ),
                  ],
                ),
              ),
              if (!isLast)
                Divider(
                  height: 0.5,
                  thickness: 0.5,
                  color: colors.line,
                ),
            ],
          );
        }),
      ),
    );
  }
}

// ── Custom toggle switch (32x19) ─────────────────────────────────────
class _ToggleSwitch extends StatelessWidget {
  final bool value;
  final Color activeColor;
  final Color inactiveColor;
  final ValueChanged<bool> onChanged;

  const _ToggleSwitch({
    required this.value,
    required this.activeColor,
    required this.inactiveColor,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: Container(
        width: 32,
        height: 19,
        decoration: BoxDecoration(
          color: value ? activeColor : inactiveColor,
          borderRadius: BorderRadius.circular(99),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeInOut,
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 15,
            height: 15,
            margin: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: const [
                BoxShadow(
                  color: Color.fromRGBO(0, 0, 0, 0.2),
                  offset: Offset(0, 1),
                  blurRadius: 3,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Photo tile with terrain gradient bands ────────────────────────────
class _PhotoTile extends StatelessWidget {
  final int index;
  final KaipaColors colors;
  final KaipaTokens tokens;

  const _PhotoTile({
    required this.index,
    required this.colors,
    required this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 96,
      height: 120,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Terrain gradient bands via CustomPaint
          CustomPaint(
            size: const Size(96, 120),
            painter: _PhotoTilePainter(
              seed: index,
              terrain: colors.terrain,
            ),
          ),
          // Cover badge on first photo
          if (index == 0)
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color.fromRGBO(0, 0, 0, 0.45),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  '封面',
                  style: TextStyle(
                    fontSize: 9,
                    fontFamily: 'monospace',
                    color: Colors.white,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Photo tile painter (terrain-y bands) ──────────────────────────────
class _PhotoTilePainter extends CustomPainter {
  final int seed;
  final KaipaTerrainColors terrain;

  _PhotoTilePainter({required this.seed, required this.terrain});

  @override
  void paint(Canvas canvas, Size size) {
    final tones = [
      [terrain.lowland, terrain.ridge, terrain.peak],
      [terrain.water, terrain.lowland, terrain.mid],
      [terrain.peak, terrain.snow, terrain.ridge],
      [terrain.mid, terrain.forest, terrain.lowland],
      [terrain.water, terrain.waterDeep, terrain.mid],
      [terrain.lowland, terrain.peak, terrain.snow],
    ];
    final t = tones[seed % tones.length];
    final w = size.width;

    // Top band
    final topPaint = Paint()..color = t[0];
    canvas.drawRect(Rect.fromLTWH(0, 0, w, 60), topPaint);

    // Middle band - organic mountain shape
    final midPaint = Paint()..color = t[1];
    final midPath = Path();
    final y1 = 50.0 + seed * 3;
    midPath.moveTo(0, y1);
    midPath.quadraticBezierTo(30, 30.0 + seed * 2, 50, 45);
    midPath.quadraticBezierTo(73, 42, w, 40);
    midPath.lineTo(w, 80);
    midPath.lineTo(0, 80);
    midPath.close();
    canvas.drawPath(midPath, midPaint);

    // Bottom band
    final botPaint = Paint()..color = t[2];
    final botPath = Path();
    final y2 = 75.0 + seed;
    botPath.moveTo(0, y2);
    botPath.quadraticBezierTo(40, 60, 70, 72);
    botPath.quadraticBezierTo(83, 70, w, 68);
    botPath.lineTo(w, 120);
    botPath.lineTo(0, 120);
    botPath.close();
    canvas.drawPath(botPath, botPaint);
  }

  @override
  bool shouldRepaint(_PhotoTilePainter oldDelegate) =>
      oldDelegate.seed != seed;
}
