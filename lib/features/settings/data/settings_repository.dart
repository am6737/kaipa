import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/settings_model.dart';

final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError(
    'sharedPreferencesProvider must be overridden in ProviderScope '
    'with a pre-initialised SharedPreferences instance.',
  );
});

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepository(ref.watch(sharedPreferencesProvider));
});

class SettingsRepository {
  static const _key = 'kaipa_settings';

  final SharedPreferences _prefs;

  SettingsRepository(this._prefs);

  /// Load settings from SharedPreferences, falling back to defaults.
  SettingsModel load() {
    final raw = _prefs.getString(_key);
    if (raw == null) return const SettingsModel();

    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return SettingsModel.fromJson(json);
    } catch (_) {
      return const SettingsModel();
    }
  }

  /// Save settings to SharedPreferences.
  Future<void> save(SettingsModel settings) async {
    final json = jsonEncode(settings.toJson());
    await _prefs.setString(_key, json);
  }

  /// Update a single setting field and persist.
  Future<SettingsModel> update({
    String? mode,
    String? preset,
    int? customAccent,
    bool? useCustom,
    String? language,
    String? distanceUnit,
    String? elevationUnit,
    bool? offlineMapsEnabled,
    bool? notificationsEnabled,
    bool? weatherAlertsEnabled,
    bool? safetyAlertsEnabled,
    bool? socialNotificationsEnabled,
    bool? trackingAutoStart,
    bool? keepScreenOn,
  }) async {
    final current = load();
    final updated = current.copyWith(
      mode: mode,
      preset: preset,
      customAccent: customAccent,
      useCustom: useCustom,
      language: language,
      distanceUnit: distanceUnit,
      elevationUnit: elevationUnit,
      offlineMapsEnabled: offlineMapsEnabled,
      notificationsEnabled: notificationsEnabled,
      weatherAlertsEnabled: weatherAlertsEnabled,
      safetyAlertsEnabled: safetyAlertsEnabled,
      socialNotificationsEnabled: socialNotificationsEnabled,
      trackingAutoStart: trackingAutoStart,
      keepScreenOn: keepScreenOn,
    );
    await save(updated);
    return updated;
  }

  /// Reset settings to defaults.
  Future<void> reset() async {
    await _prefs.remove(_key);
  }
}
