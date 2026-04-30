import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';
import 'glass_container.dart';

/// Pill-shaped glass chip matching Pill from screen-map.jsx.
///
/// Glass background, pill radius (999), active state changes bg to flare.
class PillWidget extends StatelessWidget {
  final bool active;
  final bool dark;
  final Widget child;
  final VoidCallback? onTap;
  final KaipaTokens? tokens;

  const PillWidget({
    super.key,
    this.active = false,
    this.dark = false,
    this.onTap,
    required this.child,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    if (active) {
      // Active state: solid flare background, white text, flare border
      return GestureDetector(
        onTap: onTap,
        child: GlassContainer(
          dark: dark,
          radius: 999,
          tokens: t,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: c.flare,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: c.flare, width: 0.5),
            ),
            child: DefaultTextStyle(
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: const Color(0xFFFFFFFF),
                letterSpacing: -0.1,
              ),
              child: child,
            ),
          ),
        ),
      );
    }

    // Inactive state: glass background
    return GestureDetector(
      onTap: onTap,
      child: GlassContainer(
        dark: dark,
        radius: 999,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        tokens: t,
        child: DefaultTextStyle(
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: dark ? const Color(0xFFFFFFFF) : c.ink,
            letterSpacing: -0.1,
          ),
          child: child,
        ),
      ),
    );
  }
}
