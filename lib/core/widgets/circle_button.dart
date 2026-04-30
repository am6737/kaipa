import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';
import 'glass_container.dart';
import 'kaipa_icons.dart';

/// Circular glass button with an icon, matching CircleBtn from screen-map.jsx.
class CircleButton extends StatelessWidget {
  final String icon;
  final VoidCallback? onTap;
  final bool dark;
  final Color? color;
  final double size;
  final double iconSize;
  final KaipaTokens? tokens;

  const CircleButton({
    super.key,
    required this.icon,
    this.onTap,
    this.dark = false,
    this.color,
    this.size = 44,
    this.iconSize = 18,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    final iconColor = color ?? (dark ? const Color(0xFFFFFFFF) : c.ink);

    return GestureDetector(
      onTap: onTap,
      child: GlassContainer(
        dark: dark,
        radius: 9999,
        tokens: t,
        child: SizedBox(
          width: size,
          height: size,
          child: Center(
            child: KaipaIcon(
              name: icon,
              size: iconSize,
              color: iconColor,
            ),
          ),
        ),
      ),
    );
  }
}
