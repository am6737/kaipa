import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'kaipa_tokens.dart';

// ─── SharedPreferences provider ──────────────────────────────────────
final sharedPrefsProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError(
    'sharedPrefsProvider must be overridden in ProviderScope with the '
    'actual SharedPreferences instance.',
  );
});

// ─── Theme preferences model ────────────────────────────────────────
class ThemePrefs {
  final String mode; // 'light' | 'dark' | 'system'
  final String preset; // 'meadow' | 'moss' | 'citrus' | 'ember' | 'peach' | 'lake'
  final String customAccent; // hex string e.g. '#FF0000'
  final bool useCustom;

  const ThemePrefs({
    this.mode = 'light',
    this.preset = 'moss',
    this.customAccent = '#2E5C3E',
    this.useCustom = false,
  });

  String get accentHex =>
      useCustom ? customAccent : KaipaTokens.presetHex(preset);

  ThemePrefs copyWith({
    String? mode,
    String? preset,
    String? customAccent,
    bool? useCustom,
  }) {
    return ThemePrefs(
      mode: mode ?? this.mode,
      preset: preset ?? this.preset,
      customAccent: customAccent ?? this.customAccent,
      useCustom: useCustom ?? this.useCustom,
    );
  }

  Map<String, dynamic> toJson() => {
        'mode': mode,
        'preset': preset,
        'customAccent': customAccent,
        'useCustom': useCustom,
      };

  factory ThemePrefs.fromJson(Map<String, dynamic> json) {
    return ThemePrefs(
      mode: json['mode'] as String? ?? 'light',
      preset: json['preset'] as String? ?? 'moss',
      customAccent: json['customAccent'] as String? ?? '#2E5C3E',
      useCustom: json['useCustom'] as bool? ?? false,
    );
  }
}

// ─── Theme preferences notifier ─────────────────────────────────────
const _prefsKey = 'kaipa_theme_prefs';

class ThemePrefsNotifier extends StateNotifier<ThemePrefs> {
  final SharedPreferences _prefs;

  ThemePrefsNotifier(this._prefs) : super(const ThemePrefs()) {
    _load();
  }

  void _load() {
    final raw = _prefs.getString(_prefsKey);
    if (raw != null) {
      try {
        state = ThemePrefs.fromJson(
          json.decode(raw) as Map<String, dynamic>,
        );
      } catch (_) {
        // invalid data — keep default
      }
    }
  }

  Future<void> _save() async {
    await _prefs.setString(_prefsKey, json.encode(state.toJson()));
  }

  void setMode(String mode) {
    state = state.copyWith(mode: mode);
    _save();
  }

  void setPreset(String preset) {
    state = state.copyWith(preset: preset, useCustom: false);
    _save();
  }

  void setCustomAccent(String hex) {
    state = state.copyWith(customAccent: hex, useCustom: true);
    _save();
  }

  void toggleCustom(bool useCustom) {
    state = state.copyWith(useCustom: useCustom);
    _save();
  }
}

// ─── Riverpod providers ─────────────────────────────────────────────
final themePrefsProvider =
    StateNotifierProvider<ThemePrefsNotifier, ThemePrefs>((ref) {
  final prefs = ref.watch(sharedPrefsProvider);
  return ThemePrefsNotifier(prefs);
});

final kaipaTokensProvider = Provider<KaipaTokens>((ref) {
  final prefs = ref.watch(themePrefsProvider);
  final resolvedMode = prefs.mode; // 'light', 'dark', or 'system'
  // For 'system', caller should resolve to light/dark before reaching here.
  // Default to light if 'system' is passed.
  final mode = (resolvedMode == 'system') ? 'light' : resolvedMode;
  return KaipaTokens.build(mode: mode, accent: prefs.accentHex);
});
