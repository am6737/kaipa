import 'package:flutter/material.dart';
import 'kaipa_tokens.dart';

/// ThemeData extension so widgets can access KaipaTokens via
/// `Theme.of(context).extension<KaipaTokensExtension>()!.tokens`.
class KaipaTokensExtension extends ThemeExtension<KaipaTokensExtension> {
  final KaipaTokens tokens;

  const KaipaTokensExtension({required this.tokens});

  @override
  KaipaTokensExtension copyWith({KaipaTokens? tokens}) {
    return KaipaTokensExtension(tokens: tokens ?? this.tokens);
  }

  @override
  KaipaTokensExtension lerp(covariant ThemeExtension<KaipaTokensExtension>? other, double t) {
    return this; // tokens are discrete, not interpolated
  }
}

class KaipaTheme {
  KaipaTheme._();

  static ThemeData build(KaipaTokens tokens) {
    final c = tokens.color;
    final isDark = tokens.isDark;

    final colorScheme = isDark
        ? ColorScheme.dark(
            surface: c.surface,
            primary: c.flare,
            secondary: c.moss,
            error: c.diff.extreme,
            onSurface: c.ink,
            onPrimary: const Color(0xFFFFFFFF),
            onSecondary: const Color(0xFFFFFFFF),
            onError: const Color(0xFFFFFFFF),
          )
        : ColorScheme.light(
            surface: c.surface,
            primary: c.flare,
            secondary: c.moss,
            error: c.diff.extreme,
            onSurface: c.ink,
            onPrimary: const Color(0xFFFFFFFF),
            onSecondary: const Color(0xFFFFFFFF),
            onError: const Color(0xFFFFFFFF),
          );

    return ThemeData(
      brightness: isDark ? Brightness.dark : Brightness.light,
      scaffoldBackgroundColor: c.bg,
      colorScheme: colorScheme,

      // Text theme — system fonts
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w700,
          color: c.ink,
          letterSpacing: -0.8,
          height: 1.1,
        ),
        displayMedium: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: c.ink,
          letterSpacing: -0.7,
          height: 1.1,
        ),
        displaySmall: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          color: c.ink,
          letterSpacing: -0.5,
          height: 1.0,
        ),
        headlineMedium: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: c.ink,
          letterSpacing: -0.4,
        ),
        titleLarge: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: c.ink,
          letterSpacing: -0.4,
        ),
        titleMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: c.ink,
          letterSpacing: -0.2,
        ),
        bodyLarge: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          color: c.ink,
          letterSpacing: -0.2,
        ),
        bodyMedium: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w400,
          color: c.ink,
          letterSpacing: -0.1,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: c.inkMuted,
          letterSpacing: -0.1,
        ),
        labelLarge: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: c.ink,
          letterSpacing: -0.2,
        ),
        labelMedium: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: c.inkMuted,
          letterSpacing: -0.1,
        ),
        labelSmall: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: c.inkMuted,
          letterSpacing: -0.1,
        ),
      ),

      // Card
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          side: BorderSide(color: c.line, width: 0.5),
        ),
        margin: EdgeInsets.zero,
      ),

      // AppBar
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: c.ink,
          letterSpacing: -0.3,
        ),
        iconTheme: IconThemeData(color: c.ink, size: 22),
      ),

      // Buttons
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.flare,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(KaipaRadius.md),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.2,
          ),
          minimumSize: const Size(0, 50),
        ),
      ),

      // Divider
      dividerTheme: DividerThemeData(
        color: c.line,
        thickness: 0.5,
        space: 0,
      ),

      // Extensions
      extensions: [
        KaipaTokensExtension(tokens: tokens),
      ],
    );
  }
}

/// Convenience extension on BuildContext
extension KaipaTokensContext on BuildContext {
  KaipaTokens get kaipaTokens =>
      Theme.of(this).extension<KaipaTokensExtension>()!.tokens;
}
