# Departure Flow Wiring - Design Spec

**Date:** 2026-05-01
**Scope:** Wire up all 7 departure flow pages end-to-end with real Supabase data (GPS tracking mocked)

## Overview

The prototype defines a 7-page departure flow. Currently 5 screens exist in Flutter but are disconnected (CTAs pop/no-op). This spec wires them into a continuous flow, adds the missing SafetyConfirmScreen, and connects all screens to real Supabase data.

## Flow

```
Route Detail
  └─ "准备出发 · 选择装备"
      └─ /gear/pick/:routeId .............. Step 1/3 — Gear Pick (exists)
          └─ "下一步 · 天气与时间"
              └─ /weather/:routeId ......... Step 2/3 — Weather (exists)
                  └─ "下一步 · 安全确认"
                      └─ /safety-confirm/:routeId  Step 3/3 — Safety Confirm (NEW)
                          └─ "一切就绪 · 开始导航"
                              └─ [creates trip in DB]
                              └─ /navigate/:routeId?tripId=:tripId  Navigate (exists)
                                  └─ "结束行程"
                                      └─ [completes trip in DB]
                                      └─ /trip-complete/:tripId  Trip Complete (exists)
                                          └─ "发布路线" / "跳过"
                                              └─ /route-publish?tripId=:tripId  Route Publish (exists)
                                                  └─ "发布"
                                                      └─ [inserts route + feed_item in DB]
                                                      └─ /discover (home)
```

## Database Changes

### Migration: `20260501000001_departure_flow.sql`

```sql
-- Add emergency contact to profiles (persists across trips)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb;

-- Add safety settings to trips (per-trip)
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS safety_settings jsonb;
```

**emergency_contact shape:**
```json
{
  "name": "陈芳",
  "phone": "13800138000",
  "relationship": "妻子"
}
```

**safety_settings shape:**
```json
{
  "location_sharing": true,
  "sos_enabled": true
}
```

## State Management

### DepartureFlowProvider

A Riverpod `StateNotifierProvider` that accumulates data across the 3 preparation steps. Reset when the flow starts, consumed when the trip is created.

```dart
// lib/features/trip/data/departure_flow_provider.dart

class DepartureFlowState {
  final String routeId;
  final List<String> selectedGearIds;
  final String? selectedDate;       // ISO-8601 date string
  final String? departureTime;      // e.g. "05:30"
  final Map<String, bool> safetyToggles;
  final String? tripId;

  // factory constructor, copyWith, initial
}

class DepartureFlowNotifier extends StateNotifier<DepartureFlowState> {
  DepartureFlowNotifier(String routeId) : super(DepartureFlowState.initial(routeId));

  void setGear(List<String> ids);
  void setWeather(String date, String time);
  void setSafety(Map<String, bool> toggles);
  void setTripId(String id);
  void reset();
}

final departureFlowProvider =
    StateNotifierProvider<DepartureFlowNotifier, DepartureFlowState>((ref) {
  throw UnimplementedError('Override with routeId');
});
```

The provider is family-scoped by routeId. GearPickScreen initializes it when the flow starts. It lives until the flow completes (navigate screen disposes it). Each subsequent screen reads from the same instance via the routeId key.

## Screen Changes

### 1. GearPickScreen (modify)

**File:** `lib/features/gear/presentation/gear_pick_screen.dart`

**Change:** CTA `onTap` from `context.pop()` to:
```dart
context.push('/weather/${widget.routeId}');
```

Also: write selected gear IDs into DepartureFlowProvider before navigating.

### 2. WeatherScreen (modify)

**File:** `lib/features/discover/presentation/weather_screen.dart`

**Change:** CTA `onTap` from empty to:
```dart
context.push('/safety-confirm/${widget.routeId}');
```

Also: write selected date/time into DepartureFlowProvider.

### 3. SafetyConfirmScreen (NEW)

**File:** `lib/features/trip/presentation/safety_confirm_screen.dart`

**Route:** `/safety-confirm/:routeId`

**UI Structure** (matches prototype ScreenConfirm):
- Step indicator: "第 3 步 / 共 3 步"
- **Emergency contact card** — reads `profile.emergency_contact` from Supabase. If null, shows "请设置紧急联系人" with tap to edit (inline sheet or dialog).
- **ETA card** — calculates from route's `estimated_duration` + current time. Display format: "周六 14:30 · 超时自动通知联系人".
- **Toggle cards:**
  - 实时位置共享 (location_sharing) — default on
  - 离线地图已下载 — display-only with checkmark (mock: always shows ready, 60 km^2 / 32 MB)
  - 一键 SOS — default on, red/danger style
- **CTA button:** "一切就绪 · 开始导航"

**CTA action:**
1. Save emergency contact to profile (if changed): `profile_repository.updateEmergencyContact()`
2. Create trip in Supabase:
   ```dart
   final trip = await tripRepository.createTrip(
     routeId: routeId,
     gearUsed: departureFlow.selectedGearIds,
     weatherSummary: { 'date': selectedDate, 'departure_time': departureTime },
     safetySettings: { 'location_sharing': true, 'sos_enabled': true },
   );
   ```
3. Navigate: `context.go('/navigate/${routeId}?tripId=${trip.id}')`

### 4. NavigateScreen (modify)

**File:** `lib/features/navigation/presentation/navigate_screen.dart`

**Changes:**
- Accept `tripId` from query parameters (in addition to `routeId` path parameter)
- Add "end trip" action: long-press the pause button (2 seconds) to show a confirmation bottom sheet "确定要结束行程吗？" with "结束行程" (destructive) and "继续" buttons
- On confirm:
  1. Call `tripRepository.completeTrip(tripId, ...)` with mock stats (distance, elevation, duration from elapsed timer, avg speed)
  2. Navigate: `context.go('/trip-complete/$tripId')`

### 5. TripCompleteScreen (modify)

**File:** `lib/features/trip/presentation/trip_complete_screen.dart`

**Changes:**
- Fetch real trip data via `tripByIdProvider(tripId)` — show actual stats from DB
- Replace bottom CTA from "完成 · 返回首页" → two buttons:
  - Primary: "发布路线" → `context.push('/route-publish?tripId=${widget.tripId}')`
  - Secondary text button: "跳过" → `context.go('/discover')`
- Rating onSubmit: call `tripRepository.rateTrip(tripId, rating, notes)`

### 6. RoutePublishScreen (modify)

**File:** `lib/features/discover/presentation/route_publish_screen.dart`

**Changes:**
- Accept `tripId` from query parameters
- Fetch trip data to pre-fill: route name, distance, elevation, date
- "发布" button action:
  1. Insert new route into `routes` table:
     ```dart
     routeRepository.publishRoute(
       name: title,
       description: story,
       distanceKm: trip.actualDistanceKm,
       elevationGainM: trip.actualElevationM,
       estimatedDuration: trip.actualDuration,
       difficulty: selectedDifficulty,
       tags: tags,
       isPublished: privacyToggles['public'],
       // latitude/longitude from original route
     );
     ```
  2. Insert feed_item with type `route_published`
  3. Show success snackbar
  4. Navigate: `context.go('/discover')`

### 7. AppRouter (modify)

**File:** `lib/core/router/app_router.dart`

**Add route:**
```dart
GoRoute(
  path: '/safety-confirm/:routeId',
  parentNavigatorKey: _rootNavigatorKey,
  builder: (_, state) => SafetyConfirmScreen(
    routeId: state.pathParameters['routeId']!,
  ),
),
```

**Update `/navigate/:routeId`** to pass tripId from query params:
```dart
builder: (_, state) => NavigateScreen(
  routeId: state.pathParameters['routeId']!,
  tripId: state.uri.queryParameters['tripId'],
),
```

**Update `/route-publish`** to accept tripId:
```dart
builder: (_, state) => RoutePublishScreen(
  tripId: state.uri.queryParameters['tripId'],
),
```

## Repository Changes

### TripRepository — new methods

```dart
Future<TripModel> createTrip({
  required String routeId,
  List<String> gearUsed = const [],
  Map<String, dynamic>? weatherSummary,
  Map<String, dynamic>? safetySettings,
});

Future<void> completeTrip(
  String tripId, {
  required double distanceKm,
  required double elevationM,
  required Duration duration,
  required double avgSpeedKmh,
});

Future<void> rateTrip(String tripId, int rating, String? notes);
```

### ProfileRepository — new methods

```dart
Future<Map<String, dynamic>?> getEmergencyContact();
Future<void> updateEmergencyContact(Map<String, dynamic> contact);
```

### RouteRepository — new method

```dart
Future<void> publishRoute({
  required String name,
  String? description,
  required double distanceKm,
  required double elevationGainM,
  required Duration estimatedDuration,
  required String difficulty,
  List<String> tags = const [],
  bool isPublished = true,
  required double latitude,
  required double longitude,
  String? region,
});
```

## File Inventory

| Action | File |
|--------|------|
| NEW | `supabase/migrations/20260501000001_departure_flow.sql` |
| NEW | `lib/features/trip/presentation/safety_confirm_screen.dart` |
| NEW | `lib/features/trip/data/departure_flow_provider.dart` |
| MODIFY | `lib/features/gear/presentation/gear_pick_screen.dart` |
| MODIFY | `lib/features/discover/presentation/weather_screen.dart` |
| MODIFY | `lib/features/navigation/presentation/navigate_screen.dart` |
| MODIFY | `lib/features/trip/presentation/trip_complete_screen.dart` |
| MODIFY | `lib/features/discover/presentation/route_publish_screen.dart` |
| MODIFY | `lib/core/router/app_router.dart` |
| MODIFY | `lib/features/trip/data/trip_repository.dart` |
| MODIFY | `lib/features/trip/domain/trip_model.dart` |
| MODIFY | `lib/features/profile/domain/profile_model.dart` |
| MODIFY | `lib/features/profile/data/profile_repository.dart` |
| MODIFY | `lib/features/discover/data/route_repository.dart` |

## What's Mocked

- **GPS track**: `track_geojson` in trips table will be null (no real GPS tracking)
- **Offline map**: SafetyConfirmScreen always shows "60 km^2 · 32 MB 已下载" (display-only)
- **Photos**: Trip Complete and Route Publish use placeholder terrain gradients (no camera integration)
- **Navigate stats**: Distance, elevation, speed are demo values (timer is real)
- **Weather data**: Forecast scores and sun chart remain hardcoded (no weather API)

## What's Real

- **Trip lifecycle**: create → in_progress → completed in Supabase
- **Emergency contact**: persisted to profile, editable in SafetyConfirm
- **Safety settings**: saved per-trip
- **Gear selection**: gear_used IDs written to trip record
- **Rating & notes**: saved to trip record
- **Route publishing**: creates real route record + feed_item in Supabase
- **Profile stats**: total_trips, total_distance_km, total_elevation_m updated on trip completion
