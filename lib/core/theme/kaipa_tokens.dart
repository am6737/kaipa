import 'dart:ui' show Color;

// ─── Helper functions ────────────────────────────────────────────────
Color hexToColor(String hex) {
  final h = hex.replaceAll('#', '');
  if (h.length == 3) {
    final r = int.parse('${h[0]}${h[0]}', radix: 16);
    final g = int.parse('${h[1]}${h[1]}', radix: 16);
    final b = int.parse('${h[2]}${h[2]}', radix: 16);
    return Color.fromARGB(255, r, g, b);
  }
  if (h.length == 6) {
    return Color(0xFF000000 | int.parse(h, radix: 16));
  }
  if (h.length == 8) {
    return Color(int.parse(h, radix: 16));
  }
  return const Color(0xFF000000);
}

Color colorWithOpacity(Color color, double opacity) {
  return color.withAlpha((opacity * 255).round());
}

Color mixColors(Color a, Color b, double t) {
  final ar = (a.r * 255.0).round().clamp(0, 255);
  final ag = (a.g * 255.0).round().clamp(0, 255);
  final ab = (a.b * 255.0).round().clamp(0, 255);
  final br = (b.r * 255.0).round().clamp(0, 255);
  final bg = (b.g * 255.0).round().clamp(0, 255);
  final bb = (b.b * 255.0).round().clamp(0, 255);
  final r = (ar + (br - ar) * t).round();
  final g = (ag + (bg - ag) * t).round();
  final bl = (ab + (bb - ab) * t).round();
  return Color.fromARGB(255, r.clamp(0, 255), g.clamp(0, 255), bl.clamp(0, 255));
}

// ─── Difficulty colors ───────────────────────────────────────────────
class KaipaDiffColors {
  final Color easy;
  final Color mod;
  final Color hard;
  final Color expert;
  final Color extreme;

  const KaipaDiffColors({
    required this.easy,
    required this.mod,
    required this.hard,
    required this.expert,
    required this.extreme,
  });

  Color operator [](String key) {
    switch (key) {
      case 'easy':
        return easy;
      case 'mod':
      case 'moderate':
        return mod;
      case 'hard':
        return hard;
      case 'expert':
        return expert;
      case 'extreme':
        return extreme;
      default:
        return hard;
    }
  }
}

// ─── Terrain colors ──────────────────────────────────────────────────
class KaipaTerrainColors {
  final Color base;
  final Color lowland;
  final Color mid;
  final Color ridge;
  final Color peak;
  final Color water;
  final Color waterDeep;
  final Color contour;
  final Color contourMajor;
  final Color forest;
  final Color snow;

  const KaipaTerrainColors({
    required this.base,
    required this.lowland,
    required this.mid,
    required this.ridge,
    required this.peak,
    required this.water,
    required this.waterDeep,
    required this.contour,
    required this.contourMajor,
    required this.forest,
    required this.snow,
  });
}

// ─── Color palette ───────────────────────────────────────────────────
class KaipaColors {
  final Color bg;
  final Color surface;
  final Color surfaceHi;
  final Color line;
  final Color lineSoft;

  final Color ink;
  final Color inkMuted;
  final Color inkDim;

  final Color flare;
  final Color flareSoft;
  final Color flareDeep;

  final Color moss;
  final Color mossSoft;
  final Color mossDeep;

  final Color sky;
  final Color skySoft;

  final Color sand;

  final KaipaDiffColors diff;
  final KaipaTerrainColors terrain;

  final Color glass;
  final Color glassDark;

  const KaipaColors({
    required this.bg,
    required this.surface,
    required this.surfaceHi,
    required this.line,
    required this.lineSoft,
    required this.ink,
    required this.inkMuted,
    required this.inkDim,
    required this.flare,
    required this.flareSoft,
    required this.flareDeep,
    required this.moss,
    required this.mossSoft,
    required this.mossDeep,
    required this.sky,
    required this.skySoft,
    required this.sand,
    required this.diff,
    required this.terrain,
    required this.glass,
    required this.glassDark,
  });

  // ─── Semantic aliases ────────────────────────────────────────────────
  Color get textPrimary => ink;
  Color get textSecondary => inkMuted;
  Color get textTertiary => inkDim;
  Color get surfaceSecondary => surface;
}

// ─── Radius tokens ───────────────────────────────────────────────────
class KaipaRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 18;
  static const double xl = 24;
  static const double pill = 9999;
}

// ─── Spacing tokens ──────────────────────────────────────────────────
class KaipaSpace {
  static const List<double> values = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

  static double at(int index) {
    if (index < 0 || index >= values.length) return 0;
    return values[index];
  }

  static const double s0 = 0;
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s7 = 32;
  static const double s8 = 40;
  static const double s9 = 48;
  static const double s10 = 64;
}

// ─── Accent presets ──────────────────────────────────────────────────
class KaipaAccents {
  static const String meadow = '#4CAF50';
  static const String moss = '#2E5C3E';
  static const String citrus = '#E8742E';
  static const String ember = '#A84228';
  static const String peach = '#F48FB1';
  static const String lake = '#2C5D7E';

  static const Map<String, String> all = {
    'meadow': meadow,
    'moss': moss,
    'citrus': citrus,
    'ember': ember,
    'peach': peach,
    'lake': lake,
  };
}

// ─── Main token bundle ───────────────────────────────────────────────
class KaipaTokens {
  final String mode;
  final KaipaColors color;

  const KaipaTokens({
    required this.mode,
    required this.color,
  });

  bool get isDark => mode == 'dark';

  KaipaRadius get radius => KaipaRadius();
  KaipaSpace get space => KaipaSpace();

  /// Returns hex string for preset name.
  static String presetHex(String preset) {
    return KaipaAccents.all[preset] ?? KaipaAccents.moss;
  }

  /// Build tokens from mode and accent, matching buildTokens() in tokens.js exactly.
  factory KaipaTokens.build({String mode = 'light', String accent = '#5C8A4A'}) {
    final dark = mode == 'dark';
    final accentColor = hexToColor(accent);
    final black = hexToColor('#000000');

    if (dark) {
      return KaipaTokens(
        mode: mode,
        color: KaipaColors(
          bg: hexToColor('#0E1110'),
          surface: hexToColor('#181C1B'),
          surfaceHi: hexToColor('#212624'),
          line: colorWithOpacity(hexToColor('#FFFDF5'), 0.10),
          lineSoft: colorWithOpacity(hexToColor('#FFFDF5'), 0.05),

          ink: hexToColor('#F2EFE6'),
          inkMuted: hexToColor('#A8A498'),
          inkDim: hexToColor('#6E6B62'),

          flare: accentColor,
          flareSoft: colorWithOpacity(accentColor, 0.18),
          flareDeep: mixColors(accentColor, black, 0.25),

          moss: hexToColor('#8FB078'),
          mossSoft: colorWithOpacity(hexToColor('#8FB078'), 0.16),
          mossDeep: hexToColor('#A8C492'),

          sky: hexToColor('#7FAFD3'),
          skySoft: colorWithOpacity(hexToColor('#7FAFD3'), 0.16),

          sand: hexToColor('#C9B894'),

          diff: KaipaDiffColors(
            easy: hexToColor('#8FB078'),
            mod: hexToColor('#D9B05B'),
            hard: accentColor,
            expert: mixColors(accentColor, black, 0.3),
            extreme: hexToColor('#7A2E2E'),
          ),

          terrain: KaipaTerrainColors(
            base: hexToColor('#1A1F1D'),
            lowland: hexToColor('#222826'),
            mid: hexToColor('#2A312D'),
            ridge: hexToColor('#363D38'),
            peak: hexToColor('#444B45'),
            water: hexToColor('#1E3140'),
            waterDeep: hexToColor('#15252F'),
            contour: colorWithOpacity(hexToColor('#FFFDF5'), 0.07),
            contourMajor: colorWithOpacity(hexToColor('#FFFDF5'), 0.14),
            forest: hexToColor('#243028'),
            snow: hexToColor('#3F4541'),
          ),

          glass: colorWithOpacity(hexToColor('#181C1B'), 0.70),
          glassDark: colorWithOpacity(hexToColor('#0E1110'), 0.78),
        ),
      );
    } else {
      return KaipaTokens(
        mode: mode,
        color: KaipaColors(
          bg: hexToColor('#F4F1EB'),
          surface: hexToColor('#FFFFFF'),
          surfaceHi: hexToColor('#FAF8F3'),
          line: colorWithOpacity(hexToColor('#3C342A'), 0.10),
          lineSoft: colorWithOpacity(hexToColor('#3C342A'), 0.06),

          ink: hexToColor('#1A1814'),
          inkMuted: hexToColor('#6B6356'),
          inkDim: hexToColor('#9A9285'),

          flare: accentColor,
          flareSoft: colorWithOpacity(accentColor, 0.12),
          flareDeep: mixColors(accentColor, black, 0.20),

          moss: hexToColor('#7A9A6E'),
          mossSoft: colorWithOpacity(hexToColor('#7A9A6E'), 0.14),
          mossDeep: hexToColor('#5A7A52'),

          sky: hexToColor('#5A8FB5'),
          skySoft: colorWithOpacity(hexToColor('#5A8FB5'), 0.12),

          sand: hexToColor('#D4B896'),

          diff: KaipaDiffColors(
            easy: hexToColor('#7A9A6E'),
            mod: hexToColor('#D4A155'),
            hard: accentColor,
            expert: mixColors(accentColor, black, 0.25),
            extreme: hexToColor('#7A2E2E'),
          ),

          terrain: KaipaTerrainColors(
            base: hexToColor('#EDE6D6'),
            lowland: hexToColor('#E5DCC4'),
            mid: hexToColor('#D9CBA8'),
            ridge: hexToColor('#C8B488'),
            peak: hexToColor('#B89F70'),
            water: hexToColor('#AEC9D9'),
            waterDeep: hexToColor('#8DAEC4'),
            contour: colorWithOpacity(hexToColor('#786446'), 0.18),
            contourMajor: colorWithOpacity(hexToColor('#786446'), 0.30),
            forest: hexToColor('#9FB58A'),
            snow: hexToColor('#F2EEE5'),
          ),

          glass: colorWithOpacity(hexToColor('#FFFDF8'), 0.72),
          glassDark: colorWithOpacity(hexToColor('#1E1C18'), 0.72),
        ),
      );
    }
  }
}
