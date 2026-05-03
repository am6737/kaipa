# Trip Planning System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified trip planning system covering advance planning (route analysis + gear recommendations + packing checklist) through to departure-day confirmation.

**Architecture:** New `trip_plan` feature module with `trip_plans` and `trip_plan_gear` Supabase tables. OpenWeatherMap API for real weather data. Three-layer gear recommendation engine (rules + personal history + community). Integration with existing departure flow via `SafetyConfirmScreen`.

**Tech Stack:** Flutter, Riverpod (StateNotifier + FutureProvider), Supabase (PostgREST + RPC), OpenWeatherMap One Call API 3.0, CustomPaint for elevation chart.

---

## File Structure

### New Files
```
supabase/migrations/20260502000003_trip_plans.sql         — DB tables + RLS + RPC
lib/features/trip_plan/domain/trip_plan_model.dart         — TripPlanModel + TripPlanGearItem
lib/features/trip_plan/domain/weather_models.dart          — WeatherForecast + HourlyWeather
lib/features/trip_plan/domain/gear_recommendation.dart     — GearRecommendation model + rule engine
lib/features/trip_plan/data/trip_plan_repository.dart      — CRUD + providers
lib/features/trip_plan/data/weather_service.dart           — OpenWeatherMap API + caching
lib/features/trip_plan/data/gear_recommendation_service.dart — 3-layer recommendation engine
lib/features/trip_plan/presentation/trip_plan_detail_screen.dart — Main plan detail page
lib/features/trip_plan/presentation/trip_plan_list_screen.dart   — User's plans list
lib/features/trip_plan/presentation/widgets/elevation_chart.dart — CustomPaint elevation profile
lib/features/trip_plan/presentation/widgets/weather_panel.dart   — Weather forecast section
lib/features/trip_plan/presentation/widgets/gear_checklist.dart  — Packable gear list
lib/features/trip_plan/presentation/widgets/departure_confirm_sheet.dart — Bottom sheet for departure
```

### Modified Files
```
lib/core/router/app_router.dart                            — Add trip plan routes
lib/features/route_detail/presentation/route_detail_screen.dart — Add "Plan Trip" / "Depart Now" CTAs
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260502000003_trip_plans.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Trip plans table
CREATE TABLE trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  route_id UUID NOT NULL REFERENCES routes(id),
  planned_date DATE NOT NULL,
  planned_start_time TIME,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'departed', 'completed', 'cancelled')),
  weather_cache JSONB,
  weather_updated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_plans_user ON trip_plans(user_id);
CREATE INDEX idx_trip_plans_status ON trip_plans(status);
CREATE INDEX idx_trip_plans_date ON trip_plans(planned_date DESC);

ALTER TABLE trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trip plans"
  ON trip_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trip plans"
  ON trip_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trip plans"
  ON trip_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trip plans"
  ON trip_plans FOR DELETE
  USING (auth.uid() = user_id);

-- Trip plan gear table
CREATE TABLE trip_plan_gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  gear_item_id UUID NOT NULL REFERENCES gear_items(id),
  is_packed BOOLEAN NOT NULL DEFAULT false,
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  recommendation_reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, gear_item_id)
);

CREATE INDEX idx_trip_plan_gear_plan ON trip_plan_gear(plan_id);

ALTER TABLE trip_plan_gear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trip plan gear"
  ON trip_plan_gear FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM trip_plans WHERE trip_plans.id = trip_plan_gear.plan_id
      AND trip_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own trip plan gear"
  ON trip_plan_gear FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM trip_plans WHERE trip_plans.id = trip_plan_gear.plan_id
      AND trip_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own trip plan gear"
  ON trip_plan_gear FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM trip_plans WHERE trip_plans.id = trip_plan_gear.plan_id
      AND trip_plans.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own trip plan gear"
  ON trip_plan_gear FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM trip_plans WHERE trip_plans.id = trip_plan_gear.plan_id
      AND trip_plans.user_id = auth.uid()
  ));

-- Community gear stats RPC (bypasses RLS for aggregated data)
CREATE OR REPLACE FUNCTION get_community_gear_stats(target_route_id UUID)
RETURNS TABLE (category_id UUID, category_name TEXT, user_count BIGINT) AS $$
  SELECT gc.id, gc.name, COUNT(DISTINCT t.user_id)
  FROM trips t, unnest(t.gear_used) AS used_id
  JOIN gear_items gi ON gi.id = used_id
  JOIN gear_categories gc ON gc.id = gi.category_id
  WHERE t.route_id = target_route_id
    AND t.status = 'completed'
  GROUP BY gc.id, gc.name
  ORDER BY COUNT(DISTINCT t.user_id) DESC
  LIMIT 20;
$$ LANGUAGE sql SECURITY DEFINER;

-- Seed demo trip plan for demo user
INSERT INTO trip_plans (id, user_id, route_id, planned_date, planned_start_time, status)
SELECT
  'tp000000-0000-0000-0000-000000000001',
  p.id,
  r.id,
  CURRENT_DATE + INTERVAL '3 days',
  '07:00',
  'draft'
FROM profiles p, routes r
WHERE p.username = 'demo_hiker'
  AND r.name = '武功山金顶穿越'
LIMIT 1;
```

- [ ] **Step 2: Apply the migration**

Run: `cd /home/coder/workspaces/kaipa && npx supabase db reset`
Expected: Migration applies successfully, tables created.

- [ ] **Step 3: Verify tables exist**

Run: `cd /home/coder/workspaces/kaipa && npx supabase db lint`
Expected: No errors for trip_plans or trip_plan_gear tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260502000003_trip_plans.sql
git commit -m "feat(db): add trip_plans and trip_plan_gear tables with RLS"
```

---

## Task 2: Domain Models

**Files:**
- Create: `lib/features/trip_plan/domain/trip_plan_model.dart`

- [ ] **Step 1: Create TripPlanModel**

```dart
import '../../discover/domain/route_model.dart';
import '../../gear/domain/gear_item_model.dart';

enum TripPlanStatus { draft, ready, departed, completed, cancelled }

class TripPlanGearItem {
  final String id;
  final String planId;
  final String gearItemId;
  final bool isPacked;
  final bool isRecommended;
  final String? recommendationReason;
  final DateTime addedAt;
  final GearItemModel? gearItem;

  const TripPlanGearItem({
    required this.id,
    required this.planId,
    required this.gearItemId,
    this.isPacked = false,
    this.isRecommended = false,
    this.recommendationReason,
    required this.addedAt,
    this.gearItem,
  });

  factory TripPlanGearItem.fromJson(Map<String, dynamic> json) {
    return TripPlanGearItem(
      id: json['id'] as String,
      planId: json['plan_id'] as String,
      gearItemId: json['gear_item_id'] as String,
      isPacked: json['is_packed'] as bool? ?? false,
      isRecommended: json['is_recommended'] as bool? ?? false,
      recommendationReason: json['recommendation_reason'] as String?,
      addedAt: DateTime.parse(json['added_at'] as String),
      gearItem: json['gear_items'] != null
          ? GearItemModel.fromJson(json['gear_items'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'plan_id': planId,
      'gear_item_id': gearItemId,
      'is_packed': isPacked,
      'is_recommended': isRecommended,
      'recommendation_reason': recommendationReason,
      'added_at': addedAt.toIso8601String(),
    };
  }

  TripPlanGearItem copyWith({
    String? id,
    String? planId,
    String? gearItemId,
    bool? isPacked,
    bool? isRecommended,
    String? recommendationReason,
    DateTime? addedAt,
    GearItemModel? gearItem,
  }) {
    return TripPlanGearItem(
      id: id ?? this.id,
      planId: planId ?? this.planId,
      gearItemId: gearItemId ?? this.gearItemId,
      isPacked: isPacked ?? this.isPacked,
      isRecommended: isRecommended ?? this.isRecommended,
      recommendationReason: recommendationReason ?? this.recommendationReason,
      addedAt: addedAt ?? this.addedAt,
      gearItem: gearItem ?? this.gearItem,
    );
  }
}

class TripPlanModel {
  final String id;
  final String userId;
  final String routeId;
  final DateTime plannedDate;
  final String? plannedStartTime;
  final TripPlanStatus status;
  final Map<String, dynamic>? weatherCache;
  final DateTime? weatherUpdatedAt;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final RouteModel? route;
  final List<TripPlanGearItem> gearItems;

  const TripPlanModel({
    required this.id,
    required this.userId,
    required this.routeId,
    required this.plannedDate,
    this.plannedStartTime,
    this.status = TripPlanStatus.draft,
    this.weatherCache,
    this.weatherUpdatedAt,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
    this.route,
    this.gearItems = const [],
  });

  int get packedCount => gearItems.where((g) => g.isPacked).length;
  int get totalGearCount => gearItems.length;
  double get totalWeightG => gearItems.fold(
      0, (sum, g) => sum + (g.gearItem?.weightG ?? 0));
  bool get isDepartureDay {
    final now = DateTime.now();
    return plannedDate.year == now.year &&
        plannedDate.month == now.month &&
        plannedDate.day == now.day;
  }

  factory TripPlanModel.fromJson(Map<String, dynamic> json) {
    return TripPlanModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      routeId: json['route_id'] as String,
      plannedDate: DateTime.parse(json['planned_date'] as String),
      plannedStartTime: json['planned_start_time'] as String?,
      status: _parseStatus(json['status'] as String?),
      weatherCache: json['weather_cache'] as Map<String, dynamic>?,
      weatherUpdatedAt: json['weather_updated_at'] != null
          ? DateTime.parse(json['weather_updated_at'] as String)
          : null,
      notes: json['notes'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      route: json['routes'] != null
          ? RouteModel.fromJson(json['routes'] as Map<String, dynamic>)
          : null,
      gearItems: _parseGearItems(json['trip_plan_gear']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'route_id': routeId,
      'planned_date': plannedDate.toIso8601String().split('T').first,
      'planned_start_time': plannedStartTime,
      'status': status.name,
      'weather_cache': weatherCache,
      'weather_updated_at': weatherUpdatedAt?.toIso8601String(),
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  TripPlanModel copyWith({
    String? id,
    String? userId,
    String? routeId,
    DateTime? plannedDate,
    String? plannedStartTime,
    TripPlanStatus? status,
    Map<String, dynamic>? weatherCache,
    DateTime? weatherUpdatedAt,
    String? notes,
    DateTime? createdAt,
    DateTime? updatedAt,
    RouteModel? route,
    List<TripPlanGearItem>? gearItems,
  }) {
    return TripPlanModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      routeId: routeId ?? this.routeId,
      plannedDate: plannedDate ?? this.plannedDate,
      plannedStartTime: plannedStartTime ?? this.plannedStartTime,
      status: status ?? this.status,
      weatherCache: weatherCache ?? this.weatherCache,
      weatherUpdatedAt: weatherUpdatedAt ?? this.weatherUpdatedAt,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      route: route ?? this.route,
      gearItems: gearItems ?? this.gearItems,
    );
  }

  static TripPlanStatus _parseStatus(String? value) {
    switch (value) {
      case 'draft':
        return TripPlanStatus.draft;
      case 'ready':
        return TripPlanStatus.ready;
      case 'departed':
        return TripPlanStatus.departed;
      case 'completed':
        return TripPlanStatus.completed;
      case 'cancelled':
        return TripPlanStatus.cancelled;
      default:
        return TripPlanStatus.draft;
    }
  }

  static List<TripPlanGearItem> _parseGearItems(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      return value
          .map((e) => TripPlanGearItem.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    return [];
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/domain/trip_plan_model.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/domain/trip_plan_model.dart
git commit -m "feat(trip-plan): add TripPlanModel and TripPlanGearItem domain models"
```

---

## Task 3: Trip Plan Repository + Providers

**Files:**
- Create: `lib/features/trip_plan/data/trip_plan_repository.dart`

- [ ] **Step 1: Write the repository**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/trip_plan_model.dart';

final tripPlanRepositoryProvider = Provider<TripPlanRepository>((ref) {
  return TripPlanRepository(ref.watch(supabaseProvider));
});

class TripPlanRepository {
  final SupabaseClient _client;

  TripPlanRepository(this._client);

  String get _userId {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) throw Exception('Must be signed in');
    return uid;
  }

  static const _selectWithJoins =
      '*, routes(*), trip_plan_gear(*, gear_items(*))';

  Future<List<TripPlanModel>> getUserPlans() async {
    final uid = _userId;
    final data = await _client
        .from('trip_plans')
        .select(_selectWithJoins)
        .eq('user_id', uid)
        .order('planned_date', ascending: true);

    return (data as List)
        .map((row) => TripPlanModel.fromJson(row))
        .toList();
  }

  Future<TripPlanModel> getPlanById(String planId) async {
    final data = await _client
        .from('trip_plans')
        .select(_selectWithJoins)
        .eq('id', planId)
        .single();

    return TripPlanModel.fromJson(data);
  }

  Future<TripPlanModel> createPlan({
    required String routeId,
    required DateTime plannedDate,
    String? plannedStartTime,
  }) async {
    final uid = _userId;
    final row = await _client
        .from('trip_plans')
        .insert({
          'user_id': uid,
          'route_id': routeId,
          'planned_date': plannedDate.toIso8601String().split('T').first,
          'planned_start_time': plannedStartTime,
          'status': 'draft',
        })
        .select(_selectWithJoins)
        .single();

    return TripPlanModel.fromJson(row);
  }

  Future<TripPlanModel> updatePlan(
      String planId, Map<String, dynamic> updates) async {
    updates['updated_at'] = DateTime.now().toIso8601String();
    final row = await _client
        .from('trip_plans')
        .update(updates)
        .eq('id', planId)
        .select(_selectWithJoins)
        .single();

    return TripPlanModel.fromJson(row);
  }

  Future<void> deletePlan(String planId) async {
    await _client.from('trip_plans').delete().eq('id', planId);
  }

  Future<void> addGearItem({
    required String planId,
    required String gearItemId,
    bool isRecommended = false,
    String? recommendationReason,
  }) async {
    await _client.from('trip_plan_gear').insert({
      'plan_id': planId,
      'gear_item_id': gearItemId,
      'is_recommended': isRecommended,
      'recommendation_reason': recommendationReason,
    });
  }

  Future<void> removeGearItem({
    required String planId,
    required String gearItemId,
  }) async {
    await _client
        .from('trip_plan_gear')
        .delete()
        .eq('plan_id', planId)
        .eq('gear_item_id', gearItemId);
  }

  Future<void> togglePacked({
    required String planId,
    required String gearItemId,
    required bool isPacked,
  }) async {
    await _client
        .from('trip_plan_gear')
        .update({'is_packed': isPacked})
        .eq('plan_id', planId)
        .eq('gear_item_id', gearItemId);
  }

  Future<void> updateWeatherCache({
    required String planId,
    required Map<String, dynamic> weatherData,
  }) async {
    await _client.from('trip_plans').update({
      'weather_cache': weatherData,
      'weather_updated_at': DateTime.now().toIso8601String(),
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', planId);
  }

  Future<List<Map<String, dynamic>>> getCommunityGearStats(
      String routeId) async {
    final data = await _client.rpc('get_community_gear_stats', params: {
      'target_route_id': routeId,
    });
    return (data as List).cast<Map<String, dynamic>>();
  }
}

// ─── Riverpod providers ──────────────────────────────────────────────

final tripPlanListProvider =
    FutureProvider<List<TripPlanModel>>((ref) async {
  final repo = ref.watch(tripPlanRepositoryProvider);
  return repo.getUserPlans();
});

final tripPlanDetailProvider =
    FutureProvider.family<TripPlanModel, String>((ref, planId) async {
  final repo = ref.watch(tripPlanRepositoryProvider);
  return repo.getPlanById(planId);
});
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/data/trip_plan_repository.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/data/trip_plan_repository.dart
git commit -m "feat(trip-plan): add TripPlanRepository with CRUD and providers"
```

---

## Task 4: Weather Service

**Files:**
- Create: `lib/features/trip_plan/domain/weather_models.dart`
- Create: `lib/features/trip_plan/data/weather_service.dart`

- [ ] **Step 1: Create weather domain models**

```dart
class HourlyWeather {
  final DateTime dateTime;
  final double tempC;
  final double feelsLikeC;
  final int humidity;
  final double windSpeedMs;
  final int weatherCode;
  final String weatherMain;
  final String weatherDescription;
  final String weatherIcon;
  final double pop; // probability of precipitation 0-1

  const HourlyWeather({
    required this.dateTime,
    required this.tempC,
    required this.feelsLikeC,
    required this.humidity,
    required this.windSpeedMs,
    required this.weatherCode,
    required this.weatherMain,
    required this.weatherDescription,
    required this.weatherIcon,
    required this.pop,
  });

  factory HourlyWeather.fromOwmJson(Map<String, dynamic> json) {
    final weather = (json['weather'] as List).first as Map<String, dynamic>;
    return HourlyWeather(
      dateTime: DateTime.fromMillisecondsSinceEpoch(
          (json['dt'] as num).toInt() * 1000),
      tempC: (json['temp'] as num).toDouble(),
      feelsLikeC: (json['feels_like'] as num).toDouble(),
      humidity: (json['humidity'] as num).toInt(),
      windSpeedMs: (json['wind_speed'] as num).toDouble(),
      weatherCode: (weather['id'] as num).toInt(),
      weatherMain: weather['main'] as String,
      weatherDescription: weather['description'] as String,
      weatherIcon: weather['icon'] as String,
      pop: (json['pop'] as num?)?.toDouble() ?? 0,
    );
  }

  factory HourlyWeather.fromCacheJson(Map<String, dynamic> json) {
    return HourlyWeather(
      dateTime: DateTime.parse(json['date_time'] as String),
      tempC: (json['temp_c'] as num).toDouble(),
      feelsLikeC: (json['feels_like_c'] as num).toDouble(),
      humidity: (json['humidity'] as num).toInt(),
      windSpeedMs: (json['wind_speed_ms'] as num).toDouble(),
      weatherCode: (json['weather_code'] as num).toInt(),
      weatherMain: json['weather_main'] as String,
      weatherDescription: json['weather_description'] as String,
      weatherIcon: json['weather_icon'] as String,
      pop: (json['pop'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toCacheJson() {
    return {
      'date_time': dateTime.toIso8601String(),
      'temp_c': tempC,
      'feels_like_c': feelsLikeC,
      'humidity': humidity,
      'wind_speed_ms': windSpeedMs,
      'weather_code': weatherCode,
      'weather_main': weatherMain,
      'weather_description': weatherDescription,
      'weather_icon': weatherIcon,
      'pop': pop,
    };
  }

  bool get hasRain => weatherCode >= 200 && weatherCode < 600;
  bool get hasSnow => weatherCode >= 600 && weatherCode < 700;
}

class WeatherForecast {
  final List<HourlyWeather> hourly;
  final DateTime fetchedAt;

  const WeatherForecast({
    required this.hourly,
    required this.fetchedAt,
  });

  double get minTempC =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.tempC).reduce((a, b) => a < b ? a : b);
  double get maxTempC =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.tempC).reduce((a, b) => a > b ? a : b);
  double get maxPop =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.pop).reduce((a, b) => a > b ? a : b);
  double get maxWindSpeedMs =>
      hourly.isEmpty ? 0 : hourly.map((h) => h.windSpeedMs).reduce((a, b) => a > b ? a : b);
  bool get hasRainRisk => hourly.any((h) => h.pop > 0.3);

  List<HourlyWeather> forDate(DateTime date) {
    return hourly
        .where((h) =>
            h.dateTime.year == date.year &&
            h.dateTime.month == date.month &&
            h.dateTime.day == date.day)
        .toList();
  }

  factory WeatherForecast.fromCacheJson(Map<String, dynamic> json) {
    return WeatherForecast(
      hourly: (json['hourly'] as List)
          .map((h) => HourlyWeather.fromCacheJson(h as Map<String, dynamic>))
          .toList(),
      fetchedAt: DateTime.parse(json['fetched_at'] as String),
    );
  }

  Map<String, dynamic> toCacheJson() {
    return {
      'hourly': hourly.map((h) => h.toCacheJson()).toList(),
      'fetched_at': fetchedAt.toIso8601String(),
    };
  }
}
```

- [ ] **Step 2: Create weather service**

```dart
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../domain/weather_models.dart';
import 'trip_plan_repository.dart';

const _owmApiKey = String.fromEnvironment('OWM_API_KEY',
    defaultValue: '');

const _staleThreshold = Duration(hours: 3);

final weatherServiceProvider = Provider<WeatherService>((ref) {
  return WeatherService(ref.watch(tripPlanRepositoryProvider));
});

class WeatherService {
  final TripPlanRepository _planRepo;

  WeatherService(this._planRepo);

  Future<WeatherForecast> getForecast({
    required double lat,
    required double lon,
    String? planId,
    Map<String, dynamic>? cachedWeather,
    DateTime? cachedAt,
  }) async {
    // Check cache freshness
    if (cachedWeather != null && cachedAt != null) {
      final age = DateTime.now().difference(cachedAt);
      if (age < _staleThreshold) {
        return WeatherForecast.fromCacheJson(cachedWeather);
      }
    }

    // Fetch from OWM
    final forecast = await _fetchFromOwm(lat, lon);

    // Update plan cache if planId provided
    if (planId != null) {
      await _planRepo.updateWeatherCache(
        planId: planId,
        weatherData: forecast.toCacheJson(),
      );
    }

    return forecast;
  }

  Future<WeatherForecast> _fetchFromOwm(double lat, double lon) async {
    if (_owmApiKey.isEmpty) {
      return _demoForecast();
    }

    final uri = Uri.parse(
        'https://api.openweathermap.org/data/3.0/onecall'
        '?lat=$lat&lon=$lon&units=metric&lang=zh_cn'
        '&exclude=minutely,daily,alerts'
        '&appid=$_owmApiKey');

    final client = Supabase.instance.client.functions;
    // Use Supabase Edge Function as proxy to avoid exposing API key client-side.
    // If no edge function is set up, fall back to demo data.
    try {
      final response = await client.invoke('owm-proxy', body: {
        'lat': lat,
        'lon': lon,
      });
      final json = response.data as Map<String, dynamic>;
      final hourly = (json['hourly'] as List)
          .map((h) => HourlyWeather.fromOwmJson(h as Map<String, dynamic>))
          .toList();

      return WeatherForecast(
        hourly: hourly,
        fetchedAt: DateTime.now(),
      );
    } catch (_) {
      return _demoForecast();
    }
  }

  WeatherForecast _demoForecast() {
    final now = DateTime.now();
    final hourly = List.generate(48, (i) {
      final hour = now.add(Duration(hours: i));
      final isDay = hour.hour >= 6 && hour.hour < 18;
      final baseTemp = isDay ? 16.0 : 8.0;
      final variation = (i % 7) - 3.0;
      return HourlyWeather(
        dateTime: hour,
        tempC: baseTemp + variation,
        feelsLikeC: baseTemp + variation - 2,
        humidity: 60 + (i % 20),
        windSpeedMs: 2.0 + (i % 5) * 0.5,
        weatherCode: i > 20 && i < 28 ? 500 : 800,
        weatherMain: i > 20 && i < 28 ? 'Rain' : 'Clear',
        weatherDescription: i > 20 && i < 28 ? '小雨' : '晴',
        weatherIcon: i > 20 && i < 28
            ? '10${isDay ? 'd' : 'n'}'
            : '01${isDay ? 'd' : 'n'}',
        pop: i > 20 && i < 28 ? 0.7 : 0.1,
      );
    });

    return WeatherForecast(hourly: hourly, fetchedAt: now);
  }
}

// Provider for fetching weather by route coordinates
final routeWeatherProvider = FutureProvider.family<WeatherForecast,
    ({double lat, double lon, String? planId, Map<String, dynamic>? cache, DateTime? cachedAt})>(
  (ref, params) async {
    final service = ref.watch(weatherServiceProvider);
    return service.getForecast(
      lat: params.lat,
      lon: params.lon,
      planId: params.planId,
      cachedWeather: params.cache,
      cachedAt: params.cachedAt,
    );
  },
);
```

- [ ] **Step 3: Verify both files compile**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/domain/weather_models.dart lib/features/trip_plan/data/weather_service.dart`
Expected: No analysis issues.

- [ ] **Step 4: Commit**

```bash
git add lib/features/trip_plan/domain/weather_models.dart lib/features/trip_plan/data/weather_service.dart
git commit -m "feat(trip-plan): add WeatherService with OWM integration and demo fallback"
```

---

## Task 5: Gear Recommendation Engine

**Files:**
- Create: `lib/features/trip_plan/domain/gear_recommendation.dart`
- Create: `lib/features/trip_plan/data/gear_recommendation_service.dart`

- [ ] **Step 1: Create recommendation model and rule engine**

```dart
class GearRecommendation {
  final String? gearItemId;
  final String categoryId;
  final String categoryName;
  final String reason;
  final GearRecommendationSource source;

  const GearRecommendation({
    this.gearItemId,
    required this.categoryId,
    required this.categoryName,
    required this.reason,
    required this.source,
  });
}

enum GearRecommendationSource { rule, history, community }

// Builtin category IDs from seed migration
class BuiltinCategories {
  static const boot = 'b0000000-0000-0000-0000-000000000001';
  static const backpack = 'b0000000-0000-0000-0000-000000000002';
  static const jacket = 'b0000000-0000-0000-0000-000000000003';
  static const tent = 'b0000000-0000-0000-0000-000000000004';
  static const bottle = 'b0000000-0000-0000-0000-000000000005';
  static const battery = 'b0000000-0000-0000-0000-000000000006';
  static const light = 'b0000000-0000-0000-0000-000000000007';
  static const knife = 'b0000000-0000-0000-0000-000000000008';
  static const socks = 'b0000000-0000-0000-0000-000000000009';
  static const shield = 'b0000000-0000-0000-0000-000000000010';
}

typedef RuleCondition = bool Function({
  required double maxAltitudeM,
  required double elevationGainM,
  required String difficulty,
  required Duration estimatedDuration,
  required bool hasWaterSource,
  required double? rainPop,
  required double? minTempC,
});

class GearRule {
  final String categoryId;
  final String categoryName;
  final String reason;
  final RuleCondition condition;

  const GearRule({
    required this.categoryId,
    required this.categoryName,
    required this.reason,
    required this.condition,
  });
}

final gearRules = <GearRule>[
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '冲锋衣/外套',
    reason: '海拔较高，温差大',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => maxAltitudeM > 2500 || (minTempC != null && minTempC < 10),
  ),
  GearRule(
    categoryId: BuiltinCategories.jacket,
    categoryName: '雨衣/雨具',
    reason: '���降雨风险',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => rainPop != null && rainPop > 0.3,
  ),
  GearRule(
    categoryId: BuiltinCategories.light,
    categoryName: '头灯',
    reason: '行程较长，可能天黑前无法完成',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => estimatedDuration.inHours >= 6,
  ),
  GearRule(
    categoryId: BuiltinCategories.boot,
    categoryName: '登山鞋',
    reason: '路线难度较高，需要抓地力好的鞋',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => difficulty == 'hard' || difficulty == 'expert',
  ),
  GearRule(
    categoryId: BuiltinCategories.bottle,
    categoryName: '水壶/水袋',
    reason: '沿途无水源，需自带充足饮水',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => !hasWaterSource,
  ),
  GearRule(
    categoryId: BuiltinCategories.shield,
    categoryName: '防晒装备',
    reason: '高海拔紫外线强烈',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => maxAltitudeM > 2500,
  ),
  GearRule(
    categoryId: BuiltinCategories.battery,
    categoryName: '充电宝',
    reason: '行程较长，确保手机续航',
    condition: ({
      required maxAltitudeM,
      required elevationGainM,
      required difficulty,
      required estimatedDuration,
      required hasWaterSource,
      required rainPop,
      required minTempC,
    }) => estimatedDuration.inHours >= 5,
  ),
];
```

- [ ] **Step 2: Create recommendation service**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../discover/domain/route_model.dart';
import '../../gear/data/gear_repository.dart';
import '../../gear/domain/gear_item_model.dart';
import '../domain/gear_recommendation.dart';
import '../domain/weather_models.dart';
import 'trip_plan_repository.dart';

final gearRecommendationServiceProvider =
    Provider<GearRecommendationService>((ref) {
  return GearRecommendationService(
    ref.watch(gearRepositoryProvider),
    ref.watch(tripPlanRepositoryProvider),
  );
});

class GearRecommendationService {
  final GearRepository _gearRepo;
  final TripPlanRepository _planRepo;

  GearRecommendationService(this._gearRepo, this._planRepo);

  Future<List<GearRecommendation>> getRecommendations({
    required RouteModel route,
    WeatherForecast? weather,
  }) async {
    final recommendations = <GearRecommendation>[];
    final seenCategories = <String>{};

    // Layer 1: Rule-based
    final ruleRecs = _applyRules(route, weather);
    for (final rec in ruleRecs) {
      seenCategories.add(rec.categoryId);
      recommendations.add(rec);
    }

    // Layer 2: Personal history
    try {
      final historyRecs = await _getHistoryRecommendations(route);
      for (final rec in historyRecs) {
        if (!seenCategories.contains(rec.categoryId)) {
          seenCategories.add(rec.categoryId);
          recommendations.add(rec);
        }
      }
    } catch (_) {
      // History query may fail if user has no trips — that's fine
    }

    // Layer 3: Community data
    try {
      final communityRecs =
          await _getCommunityRecommendations(route.id, seenCategories);
      recommendations.addAll(communityRecs);
    } catch (_) {
      // Community data is optional
    }

    // Match recommendations to user's actual gear items
    final userItems = await _gearRepo.getAllUserItems();
    return _matchToUserGear(recommendations, userItems);
  }

  List<GearRecommendation> _applyRules(
      RouteModel route, WeatherForecast? weather) {
    final results = <GearRecommendation>[];

    for (final rule in gearRules) {
      final matches = rule.condition(
        maxAltitudeM: route.maxAltitudeM ?? route.elevationGainM,
        elevationGainM: route.elevationGainM,
        difficulty: route.difficulty,
        estimatedDuration: route.estimatedDuration,
        hasWaterSource: route.hasWaterSource,
        rainPop: weather?.maxPop,
        minTempC: weather?.minTempC,
      );

      if (matches) {
        results.add(GearRecommendation(
          categoryId: rule.categoryId,
          categoryName: rule.categoryName,
          reason: rule.reason,
          source: GearRecommendationSource.rule,
        ));
      }
    }

    return results;
  }

  Future<List<GearRecommendation>> _getHistoryRecommendations(
      RouteModel route) async {
    // Query trips with similar difficulty and elevation range
    // For now, return empty — will be populated when user has trip history
    return [];
  }

  Future<List<GearRecommendation>> _getCommunityRecommendations(
      String routeId, Set<String> alreadySeen) async {
    final stats = await _planRepo.getCommunityGearStats(routeId);
    final results = <GearRecommendation>[];

    for (final stat in stats) {
      final catId = stat['category_id'] as String;
      if (alreadySeen.contains(catId)) continue;

      final userCount = (stat['user_count'] as num).toInt();
      if (userCount < 2) continue;

      results.add(GearRecommendation(
        categoryId: catId,
        categoryName: stat['category_name'] as String,
        reason: '$userCount位徒步者在此路线携带了此类装备',
        source: GearRecommendationSource.community,
      ));
    }

    return results;
  }

  List<GearRecommendation> _matchToUserGear(
      List<GearRecommendation> recs, List<GearItemModel> userItems) {
    return recs.map((rec) {
      // Find user's gear item in this category
      final matching = userItems
          .where((item) => item.categoryId == rec.categoryId)
          .toList();

      if (matching.isEmpty) return rec;

      // Pick favorite first, then most-used
      matching.sort((a, b) {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return b.useCount.compareTo(a.useCount);
      });

      return GearRecommendation(
        gearItemId: matching.first.id,
        categoryId: rec.categoryId,
        categoryName: rec.categoryName,
        reason: rec.reason,
        source: rec.source,
      );
    }).toList();
  }
}

final gearRecommendationsProvider = FutureProvider.family<
    List<GearRecommendation>,
    ({RouteModel route, WeatherForecast? weather})>((ref, params) async {
  final service = ref.watch(gearRecommendationServiceProvider);
  return service.getRecommendations(
    route: params.route,
    weather: params.weather,
  );
});
```

- [ ] **Step 3: Verify both files compile**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/domain/gear_recommendation.dart lib/features/trip_plan/data/gear_recommendation_service.dart`
Expected: No analysis issues.

- [ ] **Step 4: Commit**

```bash
git add lib/features/trip_plan/domain/gear_recommendation.dart lib/features/trip_plan/data/gear_recommendation_service.dart
git commit -m "feat(trip-plan): add 3-layer gear recommendation engine"
```

---

## Task 6: Elevation Profile Chart Widget

**Files:**
- Create: `lib/features/trip_plan/presentation/widgets/elevation_chart.dart`

- [ ] **Step 1: Create CustomPaint elevation chart**

```dart
import 'package:flutter/material.dart';

import '../../../discover/domain/route_model.dart';

class ElevationChart extends StatelessWidget {
  final List<ElevationPoint> profile;
  final Color lineColor;
  final Color fillColor;
  final Color textColor;

  const ElevationChart({
    super.key,
    required this.profile,
    required this.lineColor,
    required this.fillColor,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    if (profile.isEmpty) {
      return SizedBox(
        height: 120,
        child: Center(
          child: Text('暂无海拔数据', style: TextStyle(color: textColor, fontSize: 13)),
        ),
      );
    }

    return SizedBox(
      height: 120,
      child: CustomPaint(
        painter: _ElevationPainter(
          profile: profile,
          lineColor: lineColor,
          fillColor: fillColor,
          textColor: textColor,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class _ElevationPainter extends CustomPainter {
  final List<ElevationPoint> profile;
  final Color lineColor;
  final Color fillColor;
  final Color textColor;

  _ElevationPainter({
    required this.profile,
    required this.lineColor,
    required this.fillColor,
    required this.textColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (profile.isEmpty) return;

    final w = size.width;
    final h = size.height;
    final chartTop = 8.0;
    final chartBottom = h - 24.0;
    final chartHeight = chartBottom - chartTop;

    final maxDist = profile.last.distance;
    final minElev = profile.map((p) => p.elevation).reduce((a, b) => a < b ? a : b);
    final maxElev = profile.map((p) => p.elevation).reduce((a, b) => a > b ? a : b);
    final elevRange = maxElev - minElev;
    final elevPadding = elevRange * 0.1;

    double xFor(double dist) => (dist / maxDist) * w;
    double yFor(double elev) =>
        chartTop +
        chartHeight -
        ((elev - minElev + elevPadding) / (elevRange + elevPadding * 2)) *
            chartHeight;

    // Fill gradient
    final fillPath = Path();
    fillPath.moveTo(xFor(profile.first.distance), chartBottom);
    for (final p in profile) {
      fillPath.lineTo(xFor(p.distance), yFor(p.elevation));
    }
    fillPath.lineTo(xFor(profile.last.distance), chartBottom);
    fillPath.close();

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [fillColor.withValues(alpha: 0.4), fillColor.withValues(alpha: 0.05)],
      ).createShader(Rect.fromLTWH(0, chartTop, w, chartHeight));

    canvas.drawPath(fillPath, fillPaint);

    // Line
    final linePath = Path();
    linePath.moveTo(xFor(profile.first.distance), yFor(profile.first.elevation));
    for (int i = 1; i < profile.length; i++) {
      linePath.lineTo(xFor(profile[i].distance), yFor(profile[i].elevation));
    }

    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(linePath, linePaint);

    // Peak marker
    final peakIdx = profile.indexWhere((p) => p.elevation == maxElev);
    if (peakIdx >= 0) {
      final px = xFor(profile[peakIdx].distance);
      final py = yFor(maxElev);
      canvas.drawCircle(Offset(px, py), 4, Paint()..color = lineColor);
    }

    // Labels
    final labelStyle = TextStyle(color: textColor, fontSize: 10);
    _drawLabel(canvas, '${minElev.toInt()}m', Offset(4, chartBottom + 4), labelStyle);
    _drawLabel(canvas, '${maxElev.toInt()}m', Offset(w / 2 - 16, chartTop - 2), labelStyle);
    _drawLabel(
        canvas,
        '${(maxDist).toStringAsFixed(1)}km',
        Offset(w - 40, chartBottom + 4),
        labelStyle);
  }

  void _drawLabel(Canvas canvas, String text, Offset offset, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _ElevationPainter oldDelegate) {
    return oldDelegate.profile != profile;
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/widgets/elevation_chart.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/widgets/elevation_chart.dart
git commit -m "feat(trip-plan): add CustomPaint elevation profile chart widget"
```

---

## Task 7: Weather Panel Widget

**Files:**
- Create: `lib/features/trip_plan/presentation/widgets/weather_panel.dart`

- [ ] **Step 1: Create weather panel widget**

```dart
import 'package:flutter/material.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../domain/weather_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class WeatherPanel extends ConsumerWidget {
  final WeatherForecast forecast;
  final DateTime targetDate;

  const WeatherPanel({
    super.key,
    required this.forecast,
    required this.targetDate,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final hourly = forecast.forDate(targetDate);

    // Sample 4 key times: 7:00, 12:00, 15:00, 19:00
    final keyHours = [7, 12, 15, 19];
    final keyForecasts = keyHours.map((targetHour) {
      return hourly.cast<HourlyWeather?>().firstWhere(
            (h) => h != null && h.dateTime.hour == targetHour,
            orElse: () => null,
          );
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '天气预报',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '实时更新',
              style: TextStyle(color: colors.flare, fontSize: 11),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (int i = 0; i < keyForecasts.length; i++)
                _buildHourColumn(
                  keyForecasts[i],
                  ['上午', '中午', '下午', '晚上'][i],
                  colors,
                ),
            ],
          ),
        ),
        if (forecast.hasRainRisk) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Text('⚠️', style: TextStyle(fontSize: 13)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _buildRainWarning(hourly),
                    style: TextStyle(color: Colors.orange.shade700, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildHourColumn(
      HourlyWeather? weather, String label, dynamic colors) {
    if (weather == null) {
      return Column(
        children: [
          const Text('--', style: TextStyle(fontSize: 16)),
          Text('--', style: TextStyle(color: colors.textSecondary, fontSize: 12)),
          Text(label, style: TextStyle(color: colors.textTertiary, fontSize: 10)),
        ],
      );
    }

    return Column(
      children: [
        Text(_weatherEmoji(weather.weatherCode), style: const TextStyle(fontSize: 18)),
        const SizedBox(height: 2),
        Text(
          '${weather.tempC.round()}°',
          style: TextStyle(color: colors.textPrimary, fontSize: 13),
        ),
        Text(label, style: TextStyle(color: colors.textTertiary, fontSize: 10)),
      ],
    );
  }

  String _buildRainWarning(List<HourlyWeather> hourly) {
    final rainyHours = hourly.where((h) => h.pop > 0.3).toList();
    if (rainyHours.isEmpty) return '';
    final firstRain = rainyHours.first.dateTime;
    final lastRain = rainyHours.last.dateTime;
    return '${firstRain.hour}:00-${lastRain.hour + 1}:00 有降雨风险，建议携带雨具';
  }

  static String _weatherEmoji(int code) {
    if (code >= 200 && code < 300) return '⛈';
    if (code >= 300 && code < 400) return '🌧';
    if (code >= 500 && code < 600) return '🌧';
    if (code >= 600 && code < 700) return '❄️';
    if (code >= 700 && code < 800) return '🌫';
    if (code == 800) return '☀️';
    if (code == 801) return '⛅';
    if (code >= 802) return '☁️';
    return '🌤';
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/widgets/weather_panel.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/widgets/weather_panel.dart
git commit -m "feat(trip-plan): add weather forecast panel widget"
```

---

## Task 8: Gear Checklist Widget

**Files:**
- Create: `lib/features/trip_plan/presentation/widgets/gear_checklist.dart`

- [ ] **Step 1: Create gear checklist widget**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../domain/trip_plan_model.dart';
import '../../data/trip_plan_repository.dart';

class GearChecklist extends ConsumerWidget {
  final String planId;
  final List<TripPlanGearItem> gearItems;
  final VoidCallback onChanged;

  const GearChecklist({
    super.key,
    required this.planId,
    required this.gearItems,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final packedCount = gearItems.where((g) => g.isPacked).length;
    final totalWeight = gearItems.fold<double>(
        0, (sum, g) => sum + (g.gearItem?.weightG ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '装备清单',
              style: TextStyle(
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              '$packedCount/${gearItems.length} 已打包 · ${(totalWeight / 1000).toStringAsFixed(1)}kg',
              style: TextStyle(color: colors.textSecondary, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Progress bar
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: gearItems.isEmpty ? 0 : packedCount / gearItems.length,
            backgroundColor: colors.surfaceSecondary,
            color: colors.flare,
            minHeight: 4,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              for (int i = 0; i < gearItems.length; i++) ...[
                _buildGearRow(ref, gearItems[i], colors),
                if (i < gearItems.length - 1)
                  Divider(color: colors.line, height: 1, indent: 48),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGearRow(WidgetRef ref, TripPlanGearItem item, dynamic colors) {
    final gearItem = item.gearItem;
    final name = gearItem?.name ?? '未知装备';
    final weight = gearItem?.weightG;

    return InkWell(
      onTap: () async {
        final repo = ref.read(tripPlanRepositoryProvider);
        await repo.togglePacked(
          planId: planId,
          gearItemId: item.gearItemId,
          isPacked: !item.isPacked,
        );
        onChanged();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            // Checkbox
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: item.isPacked ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
                border: item.isPacked
                    ? null
                    : Border.all(color: colors.line, width: 2),
              ),
              child: item.isPacked
                  ? const Icon(Icons.check, color: Colors.white, size: 14)
                  : null,
            ),
            const SizedBox(width: 12),
            // Name
            Expanded(
              child: Text(
                name,
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 14,
                  decoration:
                      item.isPacked ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            // Weight or recommendation badge
            if (item.isRecommended && !item.isPacked)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '推荐',
                  style: TextStyle(
                      color: Colors.orange.shade700, fontSize: 10),
                ),
              )
            else if (weight != null)
              Text(
                '${weight.toInt()}g',
                style:
                    TextStyle(color: colors.textTertiary, fontSize: 12),
              ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/widgets/gear_checklist.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/widgets/gear_checklist.dart
git commit -m "feat(trip-plan): add packable gear checklist widget"
```

---

## Task 9: Departure Confirm Sheet

**Files:**
- Create: `lib/features/trip_plan/presentation/widgets/departure_confirm_sheet.dart`

- [ ] **Step 1: Create departure confirmation bottom sheet**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/theme_provider.dart';
import '../../domain/trip_plan_model.dart';
import '../../domain/weather_models.dart';

class DepartureConfirmSheet extends ConsumerWidget {
  final TripPlanModel plan;
  final WeatherForecast? weather;

  const DepartureConfirmSheet({
    super.key,
    required this.plan,
    this.weather,
  });

  static Future<bool?> show(
    BuildContext context, {
    required TripPlanModel plan,
    WeatherForecast? weather,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DepartureConfirmSheet(plan: plan, weather: weather),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final route = plan.route;

    final allPacked = plan.gearItems.every((g) => g.isPacked);
    final weatherOk = weather == null || !weather!.hasRainRisk;
    final dayForecast = weather?.forDate(plan.plannedDate) ?? [];

    return Container(
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.line,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            '出发前确认',
            style: TextStyle(
              color: colors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 20),
          // Checklist items
          _buildCheckItem(
            icon: allPacked ? '✅' : '⚠️',
            label: '装备已全部打包',
            value: '${plan.packedCount}/${plan.totalGearCount}',
            isOk: allPacked,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _buildCheckItem(
            icon: weatherOk ? '✅' : '⚠️',
            label: weatherOk ? '天气适宜出行' : '天气有风险',
            value: dayForecast.isEmpty
                ? '--'
                : '${weather!.minTempC.round()}~${weather!.maxTempC.round()}°C',
            isOk: weatherOk,
            colors: colors,
          ),
          const SizedBox(height: 12),
          _buildCheckItem(
            icon: '📍',
            label: route?.name ?? '路线',
            value:
                '${route?.distanceKm.toStringAsFixed(1)}km · ${route?.difficulty}',
            isOk: true,
            colors: colors,
          ),
          const SizedBox(height: 28),
          // Depart button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop(true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF22C55E),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text(
                '确认出发',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(
                '暂不出发，继续准备',
                style: TextStyle(color: colors.textTertiary, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckItem({
    required String icon,
    required String label,
    required String value,
    required bool isOk,
    required dynamic colors,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceSecondary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: colors.textPrimary, fontSize: 14),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: isOk ? const Color(0xFF22C55E) : Colors.orange.shade700,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/widgets/departure_confirm_sheet.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/widgets/departure_confirm_sheet.dart
git commit -m "feat(trip-plan): add departure confirmation bottom sheet"
```

---

## Task 10: Trip Plan Detail Screen

**Files:**
- Create: `lib/features/trip_plan/presentation/trip_plan_detail_screen.dart`

- [ ] **Step 1: Create the main trip plan detail screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../../discover/domain/route_model.dart';
import '../data/gear_recommendation_service.dart';
import '../data/trip_plan_repository.dart';
import '../data/weather_service.dart';
import '../domain/trip_plan_model.dart';
import '../domain/gear_recommendation.dart';
import 'widgets/departure_confirm_sheet.dart';
import 'widgets/elevation_chart.dart';
import 'widgets/gear_checklist.dart';
import 'widgets/weather_panel.dart';

class TripPlanDetailScreen extends ConsumerStatefulWidget {
  final String planId;

  const TripPlanDetailScreen({super.key, required this.planId});

  @override
  ConsumerState<TripPlanDetailScreen> createState() =>
      _TripPlanDetailScreenState();
}

class _TripPlanDetailScreenState extends ConsumerState<TripPlanDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final planAsync = ref.watch(tripPlanDetailProvider(widget.planId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: planAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('加载失败: $e',
              style: TextStyle(color: colors.textSecondary)),
        ),
        data: (plan) => _buildContent(plan, colors),
      ),
    );
  }

  Widget _buildContent(TripPlanModel plan, dynamic colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(tripPlanDetailProvider(widget.planId));
          },
          child: ListView(
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 16,
              bottom: MediaQuery.of(context).padding.bottom + 100,
              left: 20,
              right: 20,
            ),
            children: [
              _buildHeader(plan, route, daysUntil, colors),
              if (route != null) ...[
                const SizedBox(height: 20),
                _buildStats(route, colors),
              ],
              if (route != null && route.elevationProfile.isNotEmpty) ...[
                const SizedBox(height: 20),
                _buildSection('海拔剖面', colors),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: colors.surfaceSecondary,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: ElevationChart(
                    profile: route.elevationProfile,
                    lineColor: colors.flare,
                    fillColor: colors.flare,
                    textColor: colors.textTertiary,
                  ),
                ),
              ],
              if (route != null) ...[
                const SizedBox(height: 20),
                _buildWeatherSection(plan, route, colors),
              ],
              const SizedBox(height: 20),
              GearChecklist(
                planId: plan.id,
                gearItems: plan.gearItems,
                onChanged: () {
                  ref.invalidate(tripPlanDetailProvider(widget.planId));
                },
              ),
              if (plan.gearItems.isEmpty) ...[
                const SizedBox(height: 12),
                _buildAddGearButton(plan, colors),
              ],
              const SizedBox(height: 20),
              _buildNotesField(plan, colors),
            ],
          ),
        ),
        _buildBottomBar(plan, colors),
      ],
    );
  }

  Widget _buildHeader(
      TripPlanModel plan, RouteModel? route, int daysUntil, dynamic colors) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () => context.pop(),
          child: Icon(Icons.arrow_back, color: colors.textPrimary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                route?.name ?? '行程计划',
                style: TextStyle(
                  color: colors.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                plan.isDepartureDay
                    ? '今天出发'
                    : daysUntil > 0
                        ? '${daysUntil}天后出发'
                        : '已过出发日期',
                style: TextStyle(
                  color: plan.isDepartureDay
                      ? const Color(0xFF22C55E)
                      : colors.textSecondary,
                  fontSize: 14,
                  fontWeight:
                      plan.isDepartureDay ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: _statusColor(plan.status).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            _statusLabel(plan.status),
            style: TextStyle(
              color: _statusColor(plan.status),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStats(RouteModel route, dynamic colors) {
    return Row(
      children: [
        _buildStatCard('${route.distanceKm.toStringAsFixed(0)}', '公里', colors),
        const SizedBox(width: 8),
        _buildStatCard('${route.elevationGainM.toInt()}', '爬升m', colors),
        const SizedBox(width: 8),
        _buildStatCard('${route.estimatedDuration.inHours}h', '预计', colors),
        const SizedBox(width: 8),
        _buildStatCard(
          _difficultyLabel(route.difficulty),
          '难度',
          colors,
          valueColor: _difficultyColor(route.difficulty),
        ),
      ],
    );
  }

  Widget _buildStatCard(String value, String label, dynamic colors,
      {Color? valueColor}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: TextStyle(
                color: valueColor ?? colors.flare,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(label,
                style: TextStyle(color: colors.textTertiary, fontSize: 10)),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(String title, dynamic colors) {
    return Text(
      title,
      style: TextStyle(
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildWeatherSection(
      TripPlanModel plan, RouteModel route, dynamic colors) {
    final weatherAsync = ref.watch(routeWeatherProvider((
      lat: route.latitude,
      lon: route.longitude,
      planId: plan.id,
      cache: plan.weatherCache,
      cachedAt: plan.weatherUpdatedAt,
    )));

    return weatherAsync.when(
      loading: () => Container(
        height: 80,
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (forecast) => WeatherPanel(
        forecast: forecast,
        targetDate: plan.plannedDate,
      ),
    );
  }

  Widget _buildAddGearButton(TripPlanModel plan, dynamic colors) {
    return GestureDetector(
      onTap: () => _applyRecommendations(plan),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: colors.flare, width: 1.5),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('✨', style: TextStyle(fontSize: 16)),
            const SizedBox(width: 6),
            Text(
              '智能推荐装备',
              style: TextStyle(
                color: colors.flare,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _applyRecommendations(TripPlanModel plan) async {
    if (plan.route == null) return;

    final recsAsync = ref.read(gearRecommendationsProvider((
      route: plan.route!,
      weather: null,
    )));

    final recs = recsAsync.valueOrNull ?? [];
    if (recs.isEmpty) return;

    final repo = ref.read(tripPlanRepositoryProvider);
    for (final rec in recs) {
      if (rec.gearItemId != null) {
        await repo.addGearItem(
          planId: plan.id,
          gearItemId: rec.gearItemId!,
          isRecommended: true,
          recommendationReason: rec.reason,
        );
      }
    }

    ref.invalidate(tripPlanDetailProvider(widget.planId));
  }

  Widget _buildNotesField(TripPlanModel plan, dynamic colors) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSection('备注', colors),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.surfaceSecondary,
            borderRadius: BorderRadius.circular(10),
          ),
          child: TextField(
            controller: TextEditingController(text: plan.notes ?? ''),
            maxLines: 3,
            style: TextStyle(color: colors.textPrimary, fontSize: 14),
            decoration: InputDecoration(
              hintText: '添加备注...',
              hintStyle: TextStyle(color: colors.textTertiary),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
            onChanged: (value) {
              ref.read(tripPlanRepositoryProvider).updatePlan(
                plan.id,
                {'notes': value},
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar(TripPlanModel plan, dynamic colors) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: MediaQuery.of(context).padding.bottom + 16,
        ),
        decoration: BoxDecoration(
          color: colors.bg,
          border: Border(top: BorderSide(color: colors.line, width: 0.5)),
        ),
        child: plan.isDepartureDay
            ? ElevatedButton(
                onPressed: () => _confirmDeparture(plan),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF22C55E),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '确认出发',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              )
            : ElevatedButton(
                onPressed: () async {
                  await ref.read(tripPlanRepositoryProvider).updatePlan(
                    plan.id,
                    {'status': 'ready'},
                  );
                  ref.invalidate(tripPlanDetailProvider(widget.planId));
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  '准备就绪',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
      ),
    );
  }

  Future<void> _confirmDeparture(TripPlanModel plan) async {
    final confirmed = await DepartureConfirmSheet.show(
      context,
      plan: plan,
    );

    if (confirmed == true && mounted) {
      // Transition to safety confirm then navigation
      await ref.read(tripPlanRepositoryProvider).updatePlan(
        plan.id,
        {'status': 'departed'},
      );
      if (mounted) {
        context.push('/safety-confirm/${plan.routeId}');
      }
    }
  }

  Color _statusColor(TripPlanStatus status) {
    switch (status) {
      case TripPlanStatus.draft:
        return const Color(0xFF1E90FF);
      case TripPlanStatus.ready:
        return const Color(0xFF22C55E);
      case TripPlanStatus.departed:
        return Colors.orange;
      case TripPlanStatus.completed:
        return Colors.grey;
      case TripPlanStatus.cancelled:
        return Colors.red;
    }
  }

  String _statusLabel(TripPlanStatus status) {
    switch (status) {
      case TripPlanStatus.draft:
        return '规划中';
      case TripPlanStatus.ready:
        return '待出发';
      case TripPlanStatus.departed:
        return '进行中';
      case TripPlanStatus.completed:
        return '已完成';
      case TripPlanStatus.cancelled:
        return '已取消';
    }
  }

  String _difficultyLabel(String difficulty) {
    switch (difficulty) {
      case 'easy':
        return '简单';
      case 'moderate':
        return '中等';
      case 'hard':
        return '困难';
      case 'expert':
        return '专家';
      default:
        return difficulty;
    }
  }

  Color _difficultyColor(String difficulty) {
    switch (difficulty) {
      case 'easy':
        return const Color(0xFF22C55E);
      case 'moderate':
        return Colors.orange;
      case 'hard':
        return Colors.red;
      case 'expert':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/trip_plan_detail_screen.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/trip_plan_detail_screen.dart
git commit -m "feat(trip-plan): add trip plan detail screen with all sections"
```

---

## Task 11: Trip Plan List Screen

**Files:**
- Create: `lib/features/trip_plan/presentation/trip_plan_list_screen.dart`

- [ ] **Step 1: Create the plan list screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/theme_provider.dart';
import '../data/trip_plan_repository.dart';
import '../domain/trip_plan_model.dart';

class TripPlanListScreen extends ConsumerWidget {
  const TripPlanListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final plansAsync = ref.watch(tripPlanListProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => context.pop(),
                    child: Icon(Icons.arrow_back, color: colors.textPrimary),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '我的行程计划',
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: plansAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text('加载失败',
                      style: TextStyle(color: colors.textSecondary)),
                ),
                data: (plans) => plans.isEmpty
                    ? _buildEmpty(colors)
                    : _buildList(context, ref, plans, colors),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(dynamic colors) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('📋', style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(
            '还没有行程计划',
            style: TextStyle(color: colors.textSecondary, fontSize: 15),
          ),
          const SizedBox(height: 4),
          Text(
            '去发现页面找条路线，开始规划吧',
            style: TextStyle(color: colors.textTertiary, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildList(BuildContext context, WidgetRef ref,
      List<TripPlanModel> plans, dynamic colors) {
    final upcoming = plans
        .where((p) =>
            p.status == TripPlanStatus.draft ||
            p.status == TripPlanStatus.ready)
        .toList();
    final past = plans
        .where((p) =>
            p.status == TripPlanStatus.completed ||
            p.status == TripPlanStatus.departed ||
            p.status == TripPlanStatus.cancelled)
        .toList();

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(tripPlanListProvider);
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        children: [
          if (upcoming.isNotEmpty) ...[
            _buildSectionHeader('即将出发', colors),
            const SizedBox(height: 8),
            for (final plan in upcoming) ...[
              _buildPlanCard(context, plan, colors),
              const SizedBox(height: 10),
            ],
          ],
          if (past.isNotEmpty) ...[
            const SizedBox(height: 16),
            _buildSectionHeader('历史计划', colors),
            const SizedBox(height: 8),
            for (final plan in past) ...[
              _buildPlanCard(context, plan, colors),
              const SizedBox(height: 10),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, dynamic colors) {
    return Text(
      title,
      style: TextStyle(
        color: colors.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildPlanCard(
      BuildContext context, TripPlanModel plan, dynamic colors) {
    final route = plan.route;
    final daysUntil = plan.plannedDate.difference(DateTime.now()).inDays;

    return GestureDetector(
      onTap: () => context.push('/trip-plans/${plan.id}'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surfaceSecondary,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    route?.name ?? '行程计划',
                    style: TextStyle(
                      color: colors.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  plan.isDepartureDay
                      ? '今天'
                      : daysUntil > 0
                          ? '${daysUntil}天后'
                          : '已过期',
                  style: TextStyle(
                    color: plan.isDepartureDay
                        ? const Color(0xFF22C55E)
                        : colors.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            if (route != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Text(
                    '🎒 ${plan.totalGearCount}件装备',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '📏 ${route.distanceKm.toStringAsFixed(0)}km',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '⛰ ${route.elevationGainM.toInt()}m',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 12),
                  ),
                ],
              ),
            ],
            if (plan.totalGearCount > 0) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: plan.totalGearCount == 0
                            ? 0
                            : plan.packedCount / plan.totalGearCount,
                        backgroundColor: colors.line,
                        color: colors.flare,
                        minHeight: 4,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${plan.packedCount}/${plan.totalGearCount}',
                    style:
                        TextStyle(color: colors.textTertiary, fontSize: 11),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip_plan/presentation/trip_plan_list_screen.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip_plan/presentation/trip_plan_list_screen.dart
git commit -m "feat(trip-plan): add trip plan list screen"
```

---

## Task 12: Router Integration

**Files:**
- Modify: `lib/core/router/app_router.dart`

- [ ] **Step 1: Add trip plan route imports and routes**

Add the following imports at the top of `app_router.dart`:

```dart
import '../../features/trip_plan/presentation/trip_plan_list_screen.dart';
import '../../features/trip_plan/presentation/trip_plan_detail_screen.dart';
```

Add the following routes in the modal routes section (after the existing `GoRoute` entries, before the closing `]` of the `routes` list):

```dart
GoRoute(
  path: '/trip-plans',
  parentNavigatorKey: _rootNavigatorKey,
  builder: (_, __) => const TripPlanListScreen(),
),
GoRoute(
  path: '/trip-plans/:planId',
  parentNavigatorKey: _rootNavigatorKey,
  builder: (_, state) => TripPlanDetailScreen(
    planId: state.pathParameters['planId']!,
  ),
),
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/core/router/app_router.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/core/router/app_router.dart
git commit -m "feat(trip-plan): add trip plan routes to app router"
```

---

## Task 13: Route Detail Screen — Plan Trip / Depart Now CTAs

**Files:**
- Modify: `lib/features/route_detail/presentation/route_detail_screen.dart`

- [ ] **Step 1: Read the current route detail screen to understand its structure**

Read the file to locate the existing CTA/bottom bar area. The changes needed:
- Import `trip_plan_repository.dart`
- Replace or augment the existing bottom CTA with two buttons: "规划此行程" and "立即出发"
- "规划此行程" creates a trip plan and navigates to `/trip-plans/:planId`
- "立即出发" creates a plan with `status: ready` and navigates directly to departure confirm

Add these imports:

```dart
import '../../trip_plan/data/trip_plan_repository.dart';
```

Locate the bottom action bar (usually a `Positioned` widget at the bottom of a `Stack`). Replace it with:

```dart
Positioned(
  left: 0,
  right: 0,
  bottom: 0,
  child: Container(
    padding: EdgeInsets.only(
      left: 20,
      right: 20,
      top: 16,
      bottom: MediaQuery.of(context).padding.bottom + 16,
    ),
    decoration: BoxDecoration(
      color: colors.bg,
      border: Border(top: BorderSide(color: colors.line, width: 0.5)),
    ),
    child: Row(
      children: [
        Expanded(
          child: ElevatedButton(
            onPressed: () async {
              final repo = ref.read(tripPlanRepositoryProvider);
              final plan = await repo.createPlan(
                routeId: routeId,
                plannedDate: DateTime.now().add(const Duration(days: 3)),
              );
              if (context.mounted) {
                context.push('/trip-plans/${plan.id}');
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: colors.flare,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text('📋 规划此行程',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ElevatedButton(
            onPressed: () async {
              final repo = ref.read(tripPlanRepositoryProvider);
              final plan = await repo.createPlan(
                routeId: routeId,
                plannedDate: DateTime.now(),
              );
              await repo.updatePlan(plan.id, {'status': 'ready'});
              if (context.mounted) {
                context.push('/trip-plans/${plan.id}');
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF22C55E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text('🚀 立即出发',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
    ),
  ),
),
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/route_detail/presentation/route_detail_screen.dart`
Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/route_detail/presentation/route_detail_screen.dart
git commit -m "feat(trip-plan): add Plan Trip and Depart Now CTAs to route detail"
```

---

## Task 14: Full Integration Test

- [ ] **Step 1: Run full analysis**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze`
Expected: No analysis errors in the trip_plan feature.

- [ ] **Step 2: Apply DB migration and start dev server**

Run: `cd /home/coder/workspaces/kaipa && npx supabase db reset`
Expected: Migration succeeds, seed data applied.

- [ ] **Step 3: Start dev server and verify**

Run: `cd /home/coder/workspaces/kaipa && flutter run -d chrome --web-port=3000`
Expected: App loads, navigate to a route detail → see "规划此行程" and "立即出发" buttons.

- [ ] **Step 4: Test the plan flow**

Manual test checklist:
1. Open route detail → tap "规划此行程" → creates plan → navigates to plan detail
2. Plan detail shows: route stats, elevation chart, weather panel, empty gear list
3. Tap "智能推荐装备" → gear items appear with recommendation badges
4. Toggle gear items packed/unpacked → progress bar updates
5. Navigate back → open trip plan list → plan appears
6. On departure day → bottom CTA shows "确认出发" → triggers confirmation sheet

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(trip-plan): complete trip planning system integration"
```
