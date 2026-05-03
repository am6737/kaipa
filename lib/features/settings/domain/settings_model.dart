import 'dart:ui';

class SettingsModel {
  final String mode;
  final String preset;
  final int? customAccent;
  final bool useCustom;
  final String language;
  final String distanceUnit;
  final String elevationUnit;
  final bool offlineMapsEnabled;
  final bool notificationsEnabled;
  final bool weatherAlertsEnabled;
  final bool safetyAlertsEnabled;
  final bool socialNotificationsEnabled;
  final bool trackingAutoStart;
  final bool keepScreenOn;

  const SettingsModel({
    this.mode = 'system',
    this.preset = 'moss',
    this.customAccent,
    this.useCustom = false,
    this.language = 'zh',
    this.distanceUnit = 'km',
    this.elevationUnit = 'm',
    this.offlineMapsEnabled = false,
    this.notificationsEnabled = true,
    this.weatherAlertsEnabled = true,
    this.safetyAlertsEnabled = true,
    this.socialNotificationsEnabled = true,
    this.trackingAutoStart = false,
    this.keepScreenOn = true,
  });

  Color? get customAccentColor {
    if (customAccent == null) return null;
    return Color(customAccent!);
  }

  factory SettingsModel.fromJson(Map<String, dynamic> json) {
    return SettingsModel(
      mode: json['mode'] as String? ?? 'system',
      preset: json['preset'] as String? ?? 'moss',
      customAccent: json['custom_accent'] as int?,
      useCustom: json['use_custom'] as bool? ?? false,
      language: json['language'] as String? ?? 'zh',
      distanceUnit: json['distance_unit'] as String? ?? 'km',
      elevationUnit: json['elevation_unit'] as String? ?? 'm',
      offlineMapsEnabled: json['offline_maps_enabled'] as bool? ?? false,
      notificationsEnabled: json['notifications_enabled'] as bool? ?? true,
      weatherAlertsEnabled: json['weather_alerts_enabled'] as bool? ?? true,
      safetyAlertsEnabled: json['safety_alerts_enabled'] as bool? ?? true,
      socialNotificationsEnabled:
          json['social_notifications_enabled'] as bool? ?? true,
      trackingAutoStart: json['tracking_auto_start'] as bool? ?? false,
      keepScreenOn: json['keep_screen_on'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'mode': mode,
      'preset': preset,
      'custom_accent': customAccent,
      'use_custom': useCustom,
      'language': language,
      'distance_unit': distanceUnit,
      'elevation_unit': elevationUnit,
      'offline_maps_enabled': offlineMapsEnabled,
      'notifications_enabled': notificationsEnabled,
      'weather_alerts_enabled': weatherAlertsEnabled,
      'safety_alerts_enabled': safetyAlertsEnabled,
      'social_notifications_enabled': socialNotificationsEnabled,
      'tracking_auto_start': trackingAutoStart,
      'keep_screen_on': keepScreenOn,
    };
  }

  SettingsModel copyWith({
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
  }) {
    return SettingsModel(
      mode: mode ?? this.mode,
      preset: preset ?? this.preset,
      customAccent: customAccent ?? this.customAccent,
      useCustom: useCustom ?? this.useCustom,
      language: language ?? this.language,
      distanceUnit: distanceUnit ?? this.distanceUnit,
      elevationUnit: elevationUnit ?? this.elevationUnit,
      offlineMapsEnabled: offlineMapsEnabled ?? this.offlineMapsEnabled,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      weatherAlertsEnabled: weatherAlertsEnabled ?? this.weatherAlertsEnabled,
      safetyAlertsEnabled: safetyAlertsEnabled ?? this.safetyAlertsEnabled,
      socialNotificationsEnabled:
          socialNotificationsEnabled ?? this.socialNotificationsEnabled,
      trackingAutoStart: trackingAutoStart ?? this.trackingAutoStart,
      keepScreenOn: keepScreenOn ?? this.keepScreenOn,
    );
  }
}
