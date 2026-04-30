import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';
import 'glass_container.dart';
import 'kaipa_icons.dart';

class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback? onCenterLongPress;
  final bool dark;
  final KaipaTokens? tokens;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.onCenterLongPress,
    this.dark = false,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;
    final isDeparture = currentIndex == 1;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 32),
        child: Center(
          child: SizedBox(
            width: 280,
            height: 90,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.bottomCenter,
              children: [
                // Glass pill container
                Positioned(
                  bottom: 0,
                  child: GlassContainer(
                    dark: dark,
                    radius: 999,
                    tokens: t,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 28, vertical: 0),
                    child: SizedBox(
                      width: 280,
                      height: 60,
                      child: Row(
                        children: [
                          // Left: 装备
                          _SideTab(
                            icon: KaipaIcons.backpack,
                            label: '装备',
                            isActive: currentIndex == 0,
                            colors: c,
                            dark: dark,
                            onTap: () => onTap(0),
                          ),
                          const Spacer(),
                          // Center spacer for FAB
                          const SizedBox(width: 64),
                          const Spacer(),
                          // Right: 我
                          _SideTab(
                            icon: KaipaIcons.user,
                            label: '我',
                            isActive: currentIndex == 2,
                            colors: c,
                            dark: dark,
                            onTap: () => onTap(2),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                // Center FAB (elevated above the pill)
                Positioned(
                  bottom: isDeparture ? 46 : 36,
                  child: _CenterFab(
                    isDeparture: isDeparture,
                    colors: c,
                    onTap: () {
                      if (isDeparture) {
                        // Already on explore tab -- show departure sheet
                        showDepartureSheet(context, t);
                      } else {
                        onTap(1);
                      }
                    },
                    onLongPress: onCenterLongPress,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SideTab extends StatelessWidget {
  final String icon;
  final String label;
  final bool isActive;
  final KaipaColors colors;
  final bool dark;
  final VoidCallback onTap;

  const _SideTab({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.colors,
    required this.dark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fg = isActive
        ? colors.flare
        : (dark
            ? const Color.fromRGBO(255, 255, 255, 0.6)
            : colors.inkMuted);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? colors.flareSoft : Colors.transparent,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            KaipaIcon(name: icon, size: 20, color: fg),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: fg,
                letterSpacing: -0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CenterFab extends StatelessWidget {
  final bool isDeparture;
  final KaipaColors colors;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _CenterFab({
    required this.isDeparture,
    required this.colors,
    required this.onTap,
    this.onLongPress,
  });

  static const _curve = Cubic(0.34, 1.56, 0.64, 1);
  static const _duration = Duration(milliseconds: 450);

  @override
  Widget build(BuildContext context) {
    final size = isDeparture ? 54.0 : 50.0;

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: AnimatedScale(
        scale: isDeparture ? 1.1 : 1.0,
        duration: _duration,
        curve: _curve,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: _duration,
              curve: _curve,
              width: size,
              height: size,
              decoration: BoxDecoration(
                color: isDeparture ? colors.flare : colors.surface,
                shape: BoxShape.circle,
                boxShadow: isDeparture
                    ? [
                        BoxShadow(
                          color: colorWithOpacity(colors.flare, 0.66),
                          blurRadius: 18,
                          spreadRadius: 0,
                          offset: const Offset(0, 6),
                        ),
                        BoxShadow(
                          color: colorWithOpacity(colors.flare, 0.20),
                          blurRadius: 0,
                          spreadRadius: 3,
                        ),
                      ]
                    : [
                        const BoxShadow(
                          color: Color.fromRGBO(40, 30, 20, 0.16),
                          blurRadius: 14,
                          spreadRadius: 0,
                          offset: Offset(0, 4),
                        ),
                        const BoxShadow(
                          color: Color.fromRGBO(40, 30, 20, 0.08),
                          blurRadius: 0,
                          spreadRadius: 0.5,
                        ),
                      ],
              ),
              child: Center(
                child: KaipaIcon(
                  name: isDeparture ? KaipaIcons.hiker : KaipaIcons.compass,
                  size: 22,
                  color: isDeparture ? Colors.white : colors.flare,
                ),
              ),
            ),
            const SizedBox(height: 2),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 8.5,
                fontWeight: FontWeight.w700,
                color: isDeparture ? colors.flare : colors.inkMuted,
                letterSpacing: 0.3,
              ),
              child: Text(isDeparture ? '出发' : '探索'),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Departure Sheet ────────────────────────────────────────────────

void showDepartureSheet(BuildContext context, KaipaTokens tokens) {
  showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Dismiss departure sheet',
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 350),
    pageBuilder: (ctx, anim, secondaryAnim) =>
        _DepartureSheetOverlay(tokens: tokens),
    transitionBuilder: (context, animation, _, child) {
      return child;
    },
  );
}

class _DepartureSheetOverlay extends StatefulWidget {
  final KaipaTokens tokens;
  const _DepartureSheetOverlay({required this.tokens});

  @override
  State<_DepartureSheetOverlay> createState() => _DepartureSheetOverlayState();
}

class _DepartureSheetOverlayState extends State<_DepartureSheetOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<Offset> _slideAnim;
  late final Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fadeAnim = Tween<double>(begin: 0, end: 1)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _dismiss() async {
    await _ctrl.reverse();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.tokens.color;

    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        return Stack(
          children: [
            // Overlay scrim with blur
            Positioned.fill(
              child: GestureDetector(
                onTap: _dismiss,
                child: Opacity(
                  opacity: _fadeAnim.value,
                  child: BackdropFilter(
                    filter: ImageFilter.blur(
                      sigmaX: 2 * _fadeAnim.value,
                      sigmaY: 2 * _fadeAnim.value,
                    ),
                    child: const ColoredBox(
                      color: Color.fromRGBO(20, 16, 12, 0.35),
                      child: SizedBox.expand(),
                    ),
                  ),
                ),
              ),
            ),
            // Sheet
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SlideTransition(
                position: _slideAnim,
                child: _DepartureSheetContent(
                  colors: c,
                  onDismiss: _dismiss,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _DepartureSheetContent extends StatelessWidget {
  final KaipaColors colors;
  final VoidCallback onDismiss;

  const _DepartureSheetContent({
    required this.colors,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: mq.size.height * 0.72,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: colors.bg,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(24),
            topRight: Radius.circular(24),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color.fromRGBO(0, 0, 0, 0.18),
              blurRadius: 32,
              offset: Offset(0, -8),
            ),
          ],
        ),
        child: Padding(
          padding: EdgeInsets.fromLTRB(18, 14, 18, 28 + mq.padding.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color.fromRGBO(60, 52, 42, 0.18),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),

              // AI input row
              _buildAiInput(),
              const SizedBox(height: 10),

              // Example chips
              _buildChips(),
              const SizedBox(height: 22),

              // "今天适合去" section header
              _buildSectionHeader(),
              const SizedBox(height: 12),

              // Recommendation cards
              _buildRecommendationCards(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAiInput() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.line, width: 0.5),
        boxShadow: [
          BoxShadow(
            color: colors.flareSoft,
            blurRadius: 0,
            spreadRadius: 4,
          ),
        ],
      ),
      child: Row(
        children: [
          KaipaIcon(name: KaipaIcons.sparkle, size: 16, color: colors.flare),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '想去哪？描述你的想法…',
              style: TextStyle(fontSize: 14, color: colors.inkMuted),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: colors.flareSoft,
              shape: BoxShape.circle,
            ),
            child: Center(
              child:
                  KaipaIcon(name: KaipaIcons.mic, size: 15, color: colors.flare),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChips() {
    const labels = ['3小时能来回的山', '适合新手的长城', '需要露营的路线'];
    return Align(
      alignment: Alignment.centerLeft,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: labels.map((label) {
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: colors.surfaceHi,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Text(
              label,
              style: TextStyle(fontSize: 11.5, color: colors.ink),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSectionHeader() {
    return Row(
      children: [
        Text(
          '今天适合去',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: colors.ink,
          ),
        ),
        const SizedBox(width: 4),
        const KaipaIcon(
          name: KaipaIcons.sun,
          size: 15,
          color: Color(0xFFE8B946),
        ),
        const Spacer(),
        Text(
          '晴 · 22°C · 微风',
          style: TextStyle(fontSize: 11, color: colors.inkMuted),
        ),
      ],
    );
  }

  Widget _buildRecommendationCards() {
    final cards = [
      _RouteCard(
        name: '香山·鬼笑石',
        distance: '5.2km',
        tag: '今天最佳',
        tagColor: colors.flare,
        colors: colors,
      ),
      _RouteCard(
        name: '阳台山·妙峰山',
        distance: '9.8km',
        tag: '风景上佳',
        tagColor: colors.moss,
        colors: colors,
      ),
      _RouteCard(
        name: '坡峰岭·红叶',
        distance: '4.1km',
        tag: '人少清净',
        tagColor: colors.sky,
        colors: colors,
      ),
    ];

    return SizedBox(
      height: 180,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: cards.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }
}

class _RouteCard extends StatelessWidget {
  final String name;
  final String distance;
  final String tag;
  final Color tagColor;
  final KaipaColors colors;

  const _RouteCard({
    required this.name,
    required this.distance,
    required this.tag,
    required this.tagColor,
    required this.colors,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 200,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Mini map placeholder
          Container(
            height: 76,
            decoration: BoxDecoration(
              color: const Color(0xFFE5DDD0),
              borderRadius: BorderRadius.circular(10),
            ),
            child: CustomPaint(
              painter: _TrailPathPainter(color: colors.flare),
              size: const Size(double.infinity, 76),
            ),
          ),
          const SizedBox(height: 10),
          // Route name
          Text(
            name,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: colors.ink,
            ),
          ),
          const SizedBox(height: 2),
          // Distance
          Text(
            distance,
            style: TextStyle(fontSize: 11, color: colors.inkMuted),
          ),
          const Spacer(),
          // Bottom row: tag + action
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: colorWithOpacity(tagColor, 0.14),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  tag,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: tagColor,
                  ),
                ),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: colors.flare,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  '选这条 →',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Paints a simple decorative trail path on the mini-map placeholder.
class _TrailPathPainter extends CustomPainter {
  final Color color;
  _TrailPathPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = colorWithOpacity(color, 0.45)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path();
    path.moveTo(size.width * 0.15, size.height * 0.75);
    path.cubicTo(
      size.width * 0.3, size.height * 0.2,
      size.width * 0.5, size.height * 0.6,
      size.width * 0.7, size.height * 0.3,
    );
    path.cubicTo(
      size.width * 0.8, size.height * 0.15,
      size.width * 0.85, size.height * 0.35,
      size.width * 0.9, size.height * 0.25,
    );

    canvas.drawPath(path, paint);

    // Start dot
    final dotPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(
      Offset(size.width * 0.15, size.height * 0.75),
      3,
      dotPaint,
    );
    // End dot
    canvas.drawCircle(
      Offset(size.width * 0.9, size.height * 0.25),
      3,
      dotPaint,
    );
  }

  @override
  bool shouldRepaint(_TrailPathPainter oldDelegate) =>
      oldDelegate.color != color;
}
