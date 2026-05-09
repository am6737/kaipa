import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';
import 'glass_container.dart';
import 'kaipa_icons.dart';

class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool dark;
  final KaipaTokens? tokens;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.dark = false,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
        child: GlassContainer(
          dark: dark,
          radius: 24,
          tokens: t,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: SizedBox(
            height: 56,
            child: Row(
              children: [
                _NavItem(
                  icon: KaipaIcons.backpack,
                  label: '装备',
                  isActive: currentIndex == 0,
                  colors: c,
                  dark: dark,
                  onTap: () => onTap(0),
                ),
                _NavItem(
                  icon: KaipaIcons.route,
                  label: '行程',
                  isActive: currentIndex == 1,
                  colors: c,
                  dark: dark,
                  onTap: () => onTap(1),
                ),
                _NavItem(
                  icon: KaipaIcons.compass,
                  label: '探索',
                  isActive: currentIndex == 2,
                  colors: c,
                  dark: dark,
                  onTap: () => onTap(2),
                ),
                _NavItem(
                  icon: KaipaIcons.bell,
                  label: '消息',
                  isActive: currentIndex == 3,
                  colors: c,
                  dark: dark,
                  onTap: () => onTap(3),
                ),
                _NavItem(
                  icon: KaipaIcons.user,
                  label: '我',
                  isActive: currentIndex == 4,
                  colors: c,
                  dark: dark,
                  onTap: () => onTap(4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final String icon;
  final String label;
  final bool isActive;
  final KaipaColors colors;
  final bool dark;
  final VoidCallback onTap;

  const _NavItem({
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
            ? const Color.fromRGBO(255, 255, 255, 0.55)
            : colors.inkMuted);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: const BoxDecoration(),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              KaipaIcon(name: icon, size: 21, color: fg),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                  color: fg,
                  letterSpacing: -0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


