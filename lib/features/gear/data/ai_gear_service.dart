import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../../discover/domain/route_model.dart';
import '../../trip_plan/domain/weather_models.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';

class AiGearSelection {
  final String itemId;
  final String reason;

  const AiGearSelection({required this.itemId, required this.reason});

  factory AiGearSelection.fromJson(Map<String, dynamic> json) {
    return AiGearSelection(
      itemId: json['item_id'] as String,
      reason: json['reason'] as String,
    );
  }
}

class AiGearWarning {
  final String level;
  final String title;
  final String body;

  const AiGearWarning({
    required this.level,
    required this.title,
    required this.body,
  });

  factory AiGearWarning.fromJson(Map<String, dynamic> json) {
    return AiGearWarning(
      level: json['level'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
    );
  }

  bool get isAlert => level == 'alert';
}

class AiGearResult {
  final List<AiGearSelection> selectedItems;
  final List<AiGearWarning> warnings;
  final String summary;
  final String? provider;

  const AiGearResult({
    required this.selectedItems,
    required this.warnings,
    required this.summary,
    this.provider,
  });

  Set<String> get selectedItemIds =>
      selectedItems.map((s) => s.itemId).toSet();

  String get providerLabel {
    switch (provider) {
      case 'anthropic':
        return 'Claude';
      case 'openai':
        return 'GPT';
      case 'google':
        return 'Gemini';
      case 'deepseek':
        return 'DeepSeek';
      case 'openrouter':
        return 'OpenRouter';
      default:
        return 'AI';
    }
  }

  factory AiGearResult.fromJson(Map<String, dynamic> json) {
    return AiGearResult(
      selectedItems: (json['selected_items'] as List)
          .map((e) => AiGearSelection.fromJson(e as Map<String, dynamic>))
          .toList(),
      warnings: (json['warnings'] as List)
          .map((e) => AiGearWarning.fromJson(e as Map<String, dynamic>))
          .toList(),
      summary: json['summary'] as String,
      provider: json['provider'] as String?,
    );
  }
}

class AiGearService {
  final SupabaseClient _client;

  AiGearService(this._client);

  Future<AiGearResult> getRecommendations({
    required RouteModel route,
    required List<GearItemModel> gearItems,
    required List<GearCategoryModel> categories,
    WeatherForecast? weather,
  }) async {
    final categoryNameMap = <String, String>{};
    for (final cat in categories) {
      categoryNameMap[cat.id] = cat.name;
      if (cat.builtinRef != null) {
        categoryNameMap[cat.builtinRef!] = cat.name;
      }
    }

    final gearItemsPayload = gearItems.map((item) {
      return {
        'id': item.id,
        'name': item.name,
        'category_name': categoryNameMap[item.categoryId] ?? '未分类',
        'category_id': item.categoryId,
        'brand': item.brand,
        'weight_g': item.weightG,
        'condition': item.condition,
        'is_favorite': item.isFavorite,
        'use_count': item.useCount,
      };
    }).toList();

    final routePayload = {
      'name': route.name,
      'distance_km': route.distanceKm,
      'elevation_gain_m': route.elevationGainM,
      'max_altitude_m': route.maxAltitudeM,
      'difficulty': route.difficulty,
      'difficulty_grade': route.difficultyGrade,
      'estimated_duration_hours': route.estimatedDuration.inMinutes / 60.0,
      'has_water_source': route.hasWaterSource,
      'description': route.description,
      'region': route.region,
      'tags': route.tags,
    };

    Map<String, dynamic>? weatherPayload;
    if (weather != null && weather.hourly.isNotEmpty) {
      weatherPayload = {
        'min_temp_c': weather.minTempC,
        'max_temp_c': weather.maxTempC,
        'max_pop': weather.maxPop,
        'max_wind_speed_ms': weather.maxWindSpeedMs,
        'has_rain_risk': weather.hasRainRisk,
      };
    }

    final body = {
      'route': routePayload,
      'gear_items': gearItemsPayload,
      if (weatherPayload != null) 'weather': weatherPayload,
    };

    final response = await _client.functions.invoke(
      'ai-gear-recommend',
      body: body,
    );

    final data = response.data;
    if (data is Map<String, dynamic>) {
      if (data.containsKey('error')) {
        throw Exception(data['error'] as String);
      }
      return AiGearResult.fromJson(data);
    }

    if (data is String) {
      final parsed = jsonDecode(data) as Map<String, dynamic>;
      if (parsed.containsKey('error')) {
        throw Exception(parsed['error'] as String);
      }
      return AiGearResult.fromJson(parsed);
    }

    throw Exception('Unexpected response format');
  }
}

final aiGearServiceProvider = Provider<AiGearService>((ref) {
  return AiGearService(ref.watch(supabaseProvider));
});
