# Manual Trip Entry — Design Spec

## Problem

All trips in Kaipa are currently created through the active GPS-tracked departure flow. Users who want to log past hikes — trips taken before installing the app or without using it — have no way to record them. This leaves personal stats incomplete and reduces the sense of ownership over one's outdoor history.

## Solution

Add a lightweight manual trip entry form accessible from the trip history screen. Users fill in basic info (name, date) and optional metrics (distance, elevation, duration, rating, notes). The trip is saved as `status: 'completed'` with `source: 'manual'` to distinguish it from GPS-tracked trips.

## Scope

### In scope
- Database migration: `route_id` nullable, new `source` column
- TripModel updates to reflect schema changes
- New `createManualTrip()` method in TripRepository
- Full-screen manual entry form (`ManualTripEntryScreen`)
- Entry point: `+` button in trip history AppBar
- Manual trips display in trip history list with a "手动" badge
- Manual trips are not tappable (no detail page in this iteration)

### Out of scope
- Photo upload (no image_picker in the app yet)
- GPX import
- Manual trip detail/edit screen
- Associating a manual trip with an existing route

## Data Layer

### Migration: `route_id` nullable + `source` column

```sql
-- Make route_id nullable for manual entries
ALTER TABLE trips ALTER COLUMN route_id DROP NOT NULL;

-- Add source column to distinguish tracked vs manual trips
ALTER TABLE trips ADD COLUMN source text NOT NULL DEFAULT 'tracked'
  CHECK (source IN ('tracked', 'manual'));
```

### TripModel changes

```dart
// route_id becomes nullable
final String? routeId;

// New field
final String source; // 'tracked' | 'manual'
```

Update `fromJson` / `toJson` to handle the new field. `source` defaults to `'tracked'` for backward compatibility.

### TripRepository: new method

```dart
Future<String> createManualTrip({
  required String routeName,
  required DateTime date,
  double? distanceKm,
  double? elevationM,
  Duration? duration,
  int? rating,
  String? notes,
}) async {
  // Insert with status='completed', source='manual'
  // Update user profile stats if distance/elevation provided
  // Return the new trip ID
}
```

## UI

### Entry point

Trip history screen (`trip_history_screen.dart`) AppBar gets an action button:

```
AppBar(
  title: '线路历史',
  actions: [
    IconButton(icon: KaipaIcon(KaipaIcons.plus), onPressed: → push /manual-trip-entry)
  ],
)
```

### Manual Trip Entry Screen

Route: `/manual-trip-entry` with `parentNavigatorKey: _rootNavigatorKey` (full-screen modal).

Layout — single scrollable form with sections:

**Section 1: 基本信息**
- 线路名称 (required) — TextField, placeholder "如：武功山穿越"
- 日期 (required) — tappable row that opens `showDatePicker()`, defaults to today, max date = today

**Section 2: 线路数据 (optional)**
- 距离 — numeric TextField with "km" suffix
- 累计爬升 — numeric TextField with "m" suffix
- 用时 — two TextFields side by side: hours ("时") + minutes ("分")

**Section 3: 评价 (optional)**
- 5-star rating — row of 5 tappable star circles, reuse pattern from `trip_complete_screen.dart`
- 备注 — multiline TextField (minLines: 2, maxLines: 4)

**Bottom CTA**
- Fixed bottom button: "保存记录"
- Enabled only when 线路名称 is non-empty
- On save: call `createManualTrip()`, pop back, invalidate `allTripsProvider`

### Styling

Follow existing design tokens:
- Background: `colors.bg`
- Section cards: `colors.surface` with `colors.line` border, `KaipaRadius.lg` corners
- Input fields: filled with `colors.surface`, focus border `colors.flare`
- CTA button: `colors.flare` background, white text, full width
- Section labels: `colors.inkMuted`, 13px, FontWeight.w500
- Spacing: `KaipaSpace.s4` (16) padding, `KaipaSpace.s3` (12) between fields

### Trip History List Changes

- Manual trips show a small "手动" tag next to the date (using `colors.sand` background, small rounded pill)
- Manual trips without `routeId` are not tappable (no `onTap` / no chevron icon)
- `routeName` is used as the title (already nullable in the model, always provided for manual entries)

## Router

Add to `app_router.dart`:

```dart
GoRoute(
  path: '/manual-trip-entry',
  parentNavigatorKey: _rootNavigatorKey,
  builder: (_, __) => const ManualTripEntryScreen(),
),
```

## State Management

- Form state managed locally with `TextEditingController` + `setState` (consistent with existing form patterns like `CreateGearItemSheet`)
- No Riverpod provider needed for the form itself
- On save success: `ref.invalidate(allTripsProvider)` to refresh history list

## User Profile Stats

When a manual trip includes distance or elevation, update the user's aggregate stats (`total_trips`, `total_distance_km`, `total_elevation_m`) in the same way `completeTrip()` does. This keeps the profile stats complete regardless of trip source.
