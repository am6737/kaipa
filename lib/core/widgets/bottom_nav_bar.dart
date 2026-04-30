import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';
import 'glass_container.dart';
import 'kaipa_icons.dart';

/// Bottom navigation bar with 4 tabs, glass styling.
///
/// Tabs: 发现 (compass), 装备 (backpack), 动态 (chat), 我的 (user).
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

  static const _tabs = [
    _TabDef(icon: KaipaIcons.compass, label: '发现'),
    _TabDef(icon: KaipaIcons.backpack, label: '装备'),
    _TabDef(icon: KaipaIcons.chat, label: '动态'),
    _TabDef(icon: KaipaIcons.user, label: '我的'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(left: 24, right: 24, bottom: 8),
        child: GlassContainer(
          dark: dark,
          radius: 999,
          tokens: t,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_tabs.length, (index) {
              final tab = _tabs[index];
              final isActive = index == currentIndex;
              final fg = isActive
                  ? c.flare
                  : (dark
                      ? const Color.fromRGBO(255, 255, 255, 0.6)
                      : c.inkMuted);

              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(index),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: isActive
                          ? colorWithOpacity(c.flare, 0.12)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        KaipaIcon(
                          name: tab.icon,
                          size: 20,
                          color: fg,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          tab.label,
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
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _TabDef {
  final String icon;
  final String label;

  const _TabDef({required this.icon, required this.label});
}
