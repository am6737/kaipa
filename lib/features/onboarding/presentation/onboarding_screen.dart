import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';

import '../../../core/widgets/kaipa_icons.dart';

// =============================================================================
// OnboardingScreen
// =============================================================================

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen>
    with TickerProviderStateMixin {
  final _controller = PageController();
  int _page = 0;
  String _selectedLevel = 'moderate';
  final Set<String> _grantedPermissions = {};

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_page < 2) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    } else {
      context.go('/discover');
    }
  }

  void _prevPage() {
    if (_page > 0) {
      _controller.previousPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            // Page content fills available space
            Positioned.fill(
              child: PageView(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  _WelcomePage(
                    tokens: tokens,
                    colors: colors,
                    onNext: _nextPage,
                  ),
                  _LevelSelectionPage(
                    tokens: tokens,
                    colors: colors,
                    selectedLevel: _selectedLevel,
                    onSelectLevel: (id) =>
                        setState(() => _selectedLevel = id),
                    onNext: _nextPage,
                  ),
                  _SafetyPermissionsPage(
                    tokens: tokens,
                    colors: colors,
                    grantedPermissions: _grantedPermissions,
                    onGrant: (id) =>
                        setState(() => _grantedPermissions.add(id)),
                    onComplete: () => context.go('/discover'),
                  ),
                ],
              ),
            ),
            // Pagination dots at bottom 130
            Positioned(
              left: 0,
              right: 0,
              bottom: 130,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(3, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeInOut,
                    width: active ? 22 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(3),
                      color: active ? colors.flare : colors.line,
                    ),
                  );
                }),
              ),
            ),
            // CTA buttons at bottom 32
            Positioned(
              left: 24,
              right: 24,
              bottom: 32,
              child: Row(
                children: [
                  if (_page > 0) ...[
                    Expanded(
                      child: SizedBox(
                        height: 54,
                        child: OutlinedButton(
                          onPressed: _prevPage,
                          style: OutlinedButton.styleFrom(
                            backgroundColor: colors.surface,
                            side: BorderSide(color: colors.line, width: 1),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: Text(
                            '上一步',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: colors.ink,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: SizedBox(
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _nextPage,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: colors.flare,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          elevation: 4,
                          shadowColor: colorWithOpacity(colors.flare, 0.35),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _page == 2 ? '开始探索' : '继续',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const KaipaIcon(
                              name: KaipaIcons.forward,
                              size: 16,
                              color: Colors.white,
                              strokeWidth: 2.0,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Page 1 — Welcome
// =============================================================================

class _WelcomePage extends StatelessWidget {
  final KaipaTokens tokens;
  final KaipaColors colors;
  final VoidCallback onNext;

  const _WelcomePage({
    required this.tokens,
    required this.colors,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.only(top: 80, left: 28, right: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Hero landscape illustration
          ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: SizedBox(
              height: 360,
              width: double.infinity,
              child: CustomPaint(
                painter: _HeroLandscapePainter(colors: colors),
              ),
            ),
          ),
          const SizedBox(height: 24),
          // "KAIPA · 开拔" label
          Text(
            'KAIPA · 开拔',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: colors.flare,
              letterSpacing: 3,
              fontFamily: 'monospace',
              fontFamilyFallback: const ['Courier', 'Menlo'],
            ),
          ),
          const SizedBox(height: 14),
          // Title
          Text(
            '让每一次\n进山都更安心',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.9,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 12),
          // Description
          Text(
            '离线地图、装备清单、出发前安全确认——一个 App 替你想到的，比你以为的多。',
            style: TextStyle(
              fontSize: 14,
              color: colors.inkMuted,
              height: 1.55,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Hero Landscape CustomPainter
// =============================================================================

class _HeroLandscapePainter extends CustomPainter {
  final KaipaColors colors;

  _HeroLandscapePainter({required this.colors});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Clip to bounds
    canvas.clipRect(Rect.fromLTWH(0, 0, w, h));

    // Sky gradient background (flareSoft -> terrain.snow -> surface)
    final skyPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          colors.flareSoft,
          colors.terrain.snow,
          colors.surface,
        ],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), skyPaint);

    // Sun: circle at (220, 110), r=36, flare color, opacity 0.85
    // + outer halo r=48, opacity 0.18
    final sunX = 220.0 * w / 360;
    final sunY = 110.0 * h / 360;

    // Outer halo
    canvas.drawCircle(
      Offset(sunX, sunY),
      48.0 * w / 360,
      Paint()..color = colorWithOpacity(colors.flare, 0.18),
    );
    // Sun core
    canvas.drawCircle(
      Offset(sunX, sunY),
      36.0 * w / 360,
      Paint()..color = colorWithOpacity(colors.flare, 0.85),
    );

    // Far ridge: quadratic bezier mountain path, terrain.ridge color, opacity 0.7
    final farRidge = Path();
    farRidge.moveTo(0, h * 0.70);
    farRidge.lineTo(0, h * 0.52);
    farRidge.quadraticBezierTo(w * 0.12, h * 0.38, w * 0.25, h * 0.44);
    farRidge.quadraticBezierTo(w * 0.38, h * 0.50, w * 0.48, h * 0.36);
    farRidge.quadraticBezierTo(w * 0.58, h * 0.22, w * 0.70, h * 0.40);
    farRidge.quadraticBezierTo(w * 0.82, h * 0.55, w * 0.92, h * 0.42);
    farRidge.quadraticBezierTo(w * 0.97, h * 0.38, w, h * 0.45);
    farRidge.lineTo(w, h * 0.70);
    farRidge.close();
    canvas.drawPath(
      farRidge,
      Paint()..color = colorWithOpacity(colors.terrain.ridge, 0.7),
    );

    // Mid ridge: another mountain layer, terrain.peak color, opacity 0.85
    final midRidge = Path();
    midRidge.moveTo(0, h * 0.78);
    midRidge.lineTo(0, h * 0.60);
    midRidge.quadraticBezierTo(w * 0.10, h * 0.50, w * 0.22, h * 0.55);
    midRidge.quadraticBezierTo(w * 0.35, h * 0.62, w * 0.45, h * 0.48);
    midRidge.quadraticBezierTo(w * 0.55, h * 0.35, w * 0.65, h * 0.50);
    midRidge.quadraticBezierTo(w * 0.75, h * 0.62, w * 0.85, h * 0.52);
    midRidge.quadraticBezierTo(w * 0.95, h * 0.45, w, h * 0.55);
    midRidge.lineTo(w, h * 0.78);
    midRidge.close();
    canvas.drawPath(
      midRidge,
      Paint()..color = colorWithOpacity(colors.terrain.peak, 0.85),
    );

    // Near ridge: flat ridge path, mossDeep color
    final nearRidge = Path();
    nearRidge.moveTo(0, h);
    nearRidge.lineTo(0, h * 0.72);
    nearRidge.quadraticBezierTo(w * 0.15, h * 0.66, w * 0.30, h * 0.70);
    nearRidge.quadraticBezierTo(w * 0.50, h * 0.76, w * 0.70, h * 0.68);
    nearRidge.quadraticBezierTo(w * 0.85, h * 0.63, w, h * 0.70);
    nearRidge.lineTo(w, h);
    nearRidge.close();
    canvas.drawPath(
      nearRidge,
      Paint()..color = colors.mossDeep,
    );

    // Trail: dashed path from (40,355) to (280,250), flare color,
    // strokeWidth 1.6, opacity 0.65
    final trailPaint = Paint()
      ..color = colorWithOpacity(colors.flare, 0.65)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;

    final trailPath = Path();
    final tx1 = 40.0 * w / 360;
    final ty1 = 355.0 * h / 360;
    final tx2 = 280.0 * w / 360;
    final ty2 = 250.0 * h / 360;
    trailPath.moveTo(tx1, ty1);
    trailPath.cubicTo(
      tx1 + (tx2 - tx1) * 0.3, ty1 - 30 * h / 360,
      tx1 + (tx2 - tx1) * 0.6, ty2 + 40 * h / 360,
      tx2, ty2,
    );

    // Draw dashed
    _drawDashedPath(canvas, trailPath, trailPaint, 8.0, 5.0);

    // Tiny figure on path: circle r=3, flare color, at (160,288) + stick body
    final figX = 160.0 * w / 360;
    final figY = 288.0 * h / 360;
    canvas.drawCircle(
      Offset(figX, figY),
      3,
      Paint()..color = colors.flare,
    );
    // Stick body line
    canvas.drawLine(
      Offset(figX, figY + 3),
      Offset(figX, figY + 10),
      Paint()
        ..color = colors.flare
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round,
    );
  }

  void _drawDashedPath(Canvas canvas, Path path, Paint paint,
      double dashLen, double gapLen) {
    final metrics = path.computeMetrics();
    for (final metric in metrics) {
      double distance = 0;
      while (distance < metric.length) {
        final end = math.min(distance + dashLen, metric.length);
        final segment = metric.extractPath(distance, end);
        canvas.drawPath(segment, paint);
        distance += dashLen + gapLen;
      }
    }
  }

  @override
  bool shouldRepaint(_HeroLandscapePainter oldDelegate) => false;
}

// =============================================================================
// Page 2 — Level Selection
// =============================================================================

class _LevelSelectionPage extends StatelessWidget {
  final KaipaTokens tokens;
  final KaipaColors colors;
  final String selectedLevel;
  final ValueChanged<String> onSelectLevel;
  final VoidCallback onNext;

  const _LevelSelectionPage({
    required this.tokens,
    required this.colors,
    required this.selectedLevel,
    required this.onSelectLevel,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    final levels = [
      _LevelOption(
        id: 'walk',
        icon: KaipaIcons.tree,
        label: '城市散步',
        desc: '公园 · 短距离 · 平路',
        range: '< 5 km',
      ),
      _LevelOption(
        id: 'moderate',
        icon: KaipaIcons.trail,
        label: '入门徒步',
        desc: '郊野 · 半日 · 缓坡',
        range: '5–12 km',
      ),
      _LevelOption(
        id: 'hard',
        icon: KaipaIcons.mountain,
        label: '中级登山',
        desc: '一日 · 较陡 · 专业鞋',
        range: '12–25 km',
      ),
      _LevelOption(
        id: 'expert',
        icon: KaipaIcons.flag,
        label: '高阶纵走',
        desc: '过夜 · 雪线 · 重装',
        range: '25 km +',
      ),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.only(top: 80, left: 24, right: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Step indicator
          Text(
            '2 / 3',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: 2,
              fontFamily: 'monospace',
              fontFamilyFallback: const ['Courier', 'Menlo'],
            ),
          ),
          const SizedBox(height: 14),
          // Title
          Text(
            '你最常走的距离？',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.7,
            ),
          ),
          const SizedBox(height: 8),
          // Subtitle
          Text(
            '我们会推荐合适的路线和装备清单。随时可以改。',
            style: TextStyle(
              fontSize: 13,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 28),
          // Option cards
          ...levels.map((level) {
            final selected = selectedLevel == level.id;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GestureDetector(
                onTap: () => onSelectLevel(level.id),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: selected ? colors.flareSoft : colors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: selected ? colors.flare : colors.line,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      // Left: 44x44 icon circle
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: selected
                              ? colors.mossSoft
                              : colors.surface,
                        ),
                        child: Center(
                          child: KaipaIcon(
                            name: level.icon,
                            size: 22,
                            color: selected
                                ? colors.flare
                                : colors.mossDeep,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      // Text content
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  level.label,
                                  style: TextStyle(
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w700,
                                    color: colors.ink,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  level.range,
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: colors.inkMuted,
                                    fontFamily: 'monospace',
                                    fontFamilyFallback: const [
                                      'Courier',
                                      'Menlo'
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              level.desc,
                              style: TextStyle(
                                fontSize: 11.5,
                                color: colors.inkMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Right: 22px radio circle
                      Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: selected
                              ? colors.flare
                              : Colors.transparent,
                          border: Border.all(
                            color: selected
                                ? colors.flare
                                : colors.line,
                            width: selected ? 0 : 1.5,
                          ),
                        ),
                        child: selected
                            ? const Center(
                                child: KaipaIcon(
                                  name: KaipaIcons.check,
                                  size: 13,
                                  color: Colors.white,
                                  strokeWidth: 2.4,
                                ),
                              )
                            : null,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _LevelOption {
  final String id;
  final String icon;
  final String label;
  final String desc;
  final String range;

  const _LevelOption({
    required this.id,
    required this.icon,
    required this.label,
    required this.desc,
    required this.range,
  });
}

// =============================================================================
// Page 3 — Safety & Permissions
// =============================================================================

class _SafetyPermissionsPage extends StatelessWidget {
  final KaipaTokens tokens;
  final KaipaColors colors;
  final Set<String> grantedPermissions;
  final ValueChanged<String> onGrant;
  final VoidCallback onComplete;

  const _SafetyPermissionsPage({
    required this.tokens,
    required this.colors,
    required this.grantedPermissions,
    required this.onGrant,
    required this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    final permissions = [
      _PermissionItem(
        id: 'location',
        icon: KaipaIcons.navigate,
        title: '位置',
        desc: '实时定位，用于导航和 SOS',
      ),
      _PermissionItem(
        id: 'offline',
        icon: KaipaIcons.download,
        title: '离线地图',
        desc: '下载地图，无信号也能用',
      ),
      _PermissionItem(
        id: 'notification',
        icon: KaipaIcons.bell,
        title: '通知',
        desc: '天气预警、安全提醒',
      ),
      _PermissionItem(
        id: 'contacts',
        icon: KaipaIcons.users,
        title: '联系人',
        desc: 'SOS 时通知紧急联系人',
      ),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.only(top: 80, left: 24, right: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Step indicator
          Text(
            '3 / 3',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
              letterSpacing: 2,
              fontFamily: 'monospace',
              fontFamilyFallback: const ['Courier', 'Menlo'],
            ),
          ),
          const SizedBox(height: 14),
          // Title
          Text(
            '给我们一些权限，\n关键时刻能用上',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.7,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          // Subtitle
          Text(
            '我们只在你出发后使用。任何时候都可以在「我的 → 隐私」里关掉。',
            style: TextStyle(
              fontSize: 13,
              color: colors.inkMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 24),

          // SOS demo card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: const Alignment(-1, -1),
                end: const Alignment(1, 1),
                colors: [
                  colors.flareSoft,
                  colors.surface,
                ],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: colorWithOpacity(colors.flare, 0.5),
                width: 1,
              ),
            ),
            child: Row(
              children: [
                // SOS button: 52x52, red, white "SOS" text
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: const Color(0xFFC0392B),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: colorWithOpacity(
                            const Color(0xFFC0392B), 0.35),
                        offset: const Offset(0, 4),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text(
                      'SOS',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '一键 SOS · 长按 3 秒',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: colors.ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '自动呼叫 110、发送你的实时坐标给紧急联系人。',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: colors.inkMuted,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Permissions list in surface container
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: colors.line, width: 1),
            ),
            child: Column(
              children: permissions.asMap().entries.map((entry) {
                final idx = entry.key;
                final perm = entry.value;
                final granted = grantedPermissions.contains(perm.id);
                return Column(
                  children: [
                    if (idx > 0)
                      Divider(
                        height: 1,
                        thickness: 1,
                        color: colors.line,
                        indent: 16,
                        endIndent: 16,
                      ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          // 36x36 mossSoft icon circle
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: colors.mossSoft,
                            ),
                            child: Center(
                              child: KaipaIcon(
                                name: perm.icon,
                                size: 18,
                                color: colors.mossDeep,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          // Name + desc
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  perm.title,
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w600,
                                    color: colors.ink,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  perm.desc,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: colors.inkMuted,
                                    height: 1.3,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          // State: "ask" pill button or "ok" checkmark
                          if (granted)
                            Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: colors.flare,
                              ),
                              child: const Center(
                                child: KaipaIcon(
                                  name: KaipaIcons.check,
                                  size: 12,
                                  color: Colors.white,
                                  strokeWidth: 2.4,
                                ),
                              ),
                            )
                          else
                            GestureDetector(
                              onTap: () => onGrant(perm.id),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 11,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: colors.flareSoft,
                                  borderRadius: BorderRadius.circular(99),
                                ),
                                child: Text(
                                  '授权',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    color: colors.flare,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _PermissionItem {
  final String id;
  final String icon;
  final String title;
  final String desc;

  const _PermissionItem({
    required this.id,
    required this.icon,
    required this.title,
    required this.desc,
  });
}
