import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/kaipa_tokens.dart';
import '../theme/kaipa_theme.dart';

/// Frosted-glass container matching the Glass primitive from screen-map.jsx.
///
/// Uses BackdropFilter with blur(28,28) + saturate and a semi-transparent
/// background with inner glow border and shadow.
class GlassContainer extends StatelessWidget {
  final bool dark;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final Widget? child;
  final KaipaTokens? tokens;

  const GlassContainer({
    super.key,
    this.dark = false,
    this.radius = 18,
    this.padding,
    this.child,
    this.tokens,
  });

  @override
  Widget build(BuildContext context) {
    final t = tokens ?? context.kaipaTokens;
    final c = t.color;

    final bg = dark ? c.glassDark : c.glass;

    final borderColor = dark
        ? const Color.fromRGBO(255, 255, 255, 0.12)
        : const Color.fromRGBO(255, 255, 255, 0.6);

    // Inner glow + outer shadow
    final boxShadows = dark
        ? <BoxShadow>[
            const BoxShadow(
              color: Color.fromRGBO(255, 255, 255, 0.06),
              offset: Offset(0, 1),
              blurRadius: 0,
              spreadRadius: 0,
            ),
            const BoxShadow(
              color: Color.fromRGBO(0, 0, 0, 0.25),
              offset: Offset(0, 8),
              blurRadius: 30,
            ),
          ]
        : <BoxShadow>[
            const BoxShadow(
              color: Color.fromRGBO(255, 255, 255, 0.7),
              offset: Offset(0, 1),
              blurRadius: 0,
              spreadRadius: 0,
            ),
            const BoxShadow(
              color: Color.fromRGBO(40, 30, 20, 0.10),
              offset: Offset(0, 6),
              blurRadius: 24,
            ),
            const BoxShadow(
              color: Color.fromRGBO(40, 30, 20, 0.06),
              offset: Offset(0, 1),
              blurRadius: 3,
            ),
          ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.compose(
          outer: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
          inner: ColorFilter.matrix(<double>[
            1.8, 0, 0, 0, 0, // R — saturate boost
            0, 1.8, 0, 0, 0, // G
            0, 0, 1.8, 0, 0, // B
            0, 0, 0, 1, 0, // A
          ]),
        ),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: borderColor, width: 0.5),
            boxShadow: boxShadows,
          ),
          child: child,
        ),
      ),
    );
  }
}
