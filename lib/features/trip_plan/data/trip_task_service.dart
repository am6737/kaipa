import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../../discover/domain/route_model.dart';
import '../domain/trip_plan_task.dart';
import '../domain/weather_models.dart';

final tripTaskServiceProvider = Provider<TripTaskService>((ref) {
  return TripTaskService(ref.watch(supabaseProvider));
});

class TripTaskService {
  final SupabaseClient _client;

  TripTaskService(this._client);

  Future<List<TripPlanTask>> getTasks(String planId) async {
    final data = await _client
        .from('trip_plan_tasks')
        .select()
        .eq('plan_id', planId)
        .order('sort_order');
    return (data as List)
        .map((r) => TripPlanTask.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  Future<void> toggleTask(String taskId, bool isDone) async {
    await _client.from('trip_plan_tasks').update({
      'is_done': isDone,
      'done_at': isDone ? DateTime.now().toIso8601String() : null,
    }).eq('id', taskId);
  }

  Future<void> deleteTasks(String planId) async {
    await _client.from('trip_plan_tasks').delete().eq('plan_id', planId);
  }

  Future<void> insertTasks(String planId, List<Map<String, dynamic>> tasks) async {
    final rows = tasks.map((t) => {
      ...t,
      'plan_id': planId,
    }).toList();
    await _client.from('trip_plan_tasks').insert(rows);
  }

  /// Generate timeline tasks via AI Edge Function.
  Future<AiTimelineResult> generateTimeline({
    required RouteModel route,
    required WeatherForecast weather,
    required DateTime plannedDate,
    required int dayCount,
  }) async {
    final weatherPayload = {
      'min_temp_c': weather.minTempC,
      'max_temp_c': weather.maxTempC,
      'max_pop': weather.maxPop,
      'max_wind_speed_ms': weather.maxWindSpeedMs,
      'has_rain_risk': weather.hasRainRisk,
      'hourly': weather.hourly.map((h) => {
        'time': h.dateTime.toIso8601String(),
        'temp_c': h.tempC,
        'pop': h.pop,
        'wind_ms': h.windSpeedMs,
        'weather_code': h.weatherCode,
      }).toList(),
    };

    final body = {
      'route': {
        'name': route.name,
        'distance_km': route.distanceKm,
        'elevation_gain_m': route.elevationGainM,
        'max_altitude_m': route.maxAltitudeM,
        'difficulty': route.difficulty,
        'estimated_duration_hours': route.estimatedDuration.inMinutes / 60.0,
        'has_water_source': route.hasWaterSource,
        'region': route.region,
      },
      'weather': weatherPayload,
      'planned_date': plannedDate.toIso8601String().split('T').first,
      'day_count': dayCount,
    };

    final response = await _client.functions.invoke(
      'generate-trip-timeline',
      body: body,
    );

    final data = response.data;
    Map<String, dynamic> parsed;
    if (data is Map<String, dynamic>) {
      parsed = data;
    } else if (data is String) {
      parsed = jsonDecode(data) as Map<String, dynamic>;
    } else {
      throw Exception('Unexpected response format');
    }

    if (parsed.containsKey('error')) {
      throw Exception(parsed['error'] as String);
    }

    return AiTimelineResult.fromJson(parsed);
  }
}

class AiTimelineResult {
  final List<TripPlanTask> tasks;
  final String summary;
  final String? provider;

  const AiTimelineResult({
    required this.tasks,
    required this.summary,
    this.provider,
  });

  factory AiTimelineResult.fromJson(Map<String, dynamic> json) {
    final tasks = (json['tasks'] as List).map((t, [int i = 0]) {
      final m = t as Map<String, dynamic>;
      return TripPlanTask(
        id: '',
        planId: '',
        category: TaskCategoryX.fromJson(m['category'] as String),
        title: m['title'] as String,
        description: m['description'] as String?,
        suggestedTime: m['suggested_time'] as String?,
        sortOrder: m['sort_order'] as int? ?? i,
        aiGenerated: true,
        createdAt: DateTime.now(),
      );
    }).toList();

    return AiTimelineResult(
      tasks: tasks,
      summary: json['summary'] as String? ?? '',
      provider: json['provider'] as String?,
    );
  }
}
