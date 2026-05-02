# Manual Trip Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to manually log past hiking trips from the trip history screen, without requiring GPS tracking or route association.

**Architecture:** New Supabase migration makes `route_id` nullable and adds a `source` column. TripModel and TripRepository get updated to support manual entries. A new full-screen form (`ManualTripEntryScreen`) is added with a route in `app_router.dart`, accessed via a `+` button in the trip history AppBar.

**Tech Stack:** Flutter, Riverpod, Supabase (PostgreSQL), GoRouter

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260502000001_manual_trip_entry.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Make route_id nullable for manual entries
ALTER TABLE trips ALTER COLUMN route_id DROP NOT NULL;

-- Add source column to distinguish tracked vs manual trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tracked'
  CHECK (source IN ('tracked', 'manual'));

-- Add route_name column for manual entries (no route FK to join on)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_name text;
```

- [ ] **Step 2: Push migration to remote Supabase**

Run: `npx supabase db push --linked`
Expected: Migration applies successfully.

- [ ] **Step 3: Verify columns exist**

Run: `psql "$SUPABASE_DB_URL" -c "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='trips' AND column_name IN ('route_id','source','route_name') ORDER BY column_name;"`
Expected: `route_id` shows `YES` for nullable, `source` shows default `'tracked'`, `route_name` exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260502000001_manual_trip_entry.sql
git commit -m "feat(db): make route_id nullable, add source and route_name columns to trips"
```

---

### Task 2: Update TripModel

**Files:**
- Modify: `lib/features/trip/domain/trip_model.dart`

- [ ] **Step 1: Make `routeId` nullable and add `source` field**

In `trip_model.dart`, change the class fields:

```dart
// Change from:
final String routeId;
// To:
final String? routeId;

// Add new field after routeId:
final String source; // 'tracked' | 'manual'
```

- [ ] **Step 2: Update constructor**

Change the constructor parameter from `required this.routeId` to `this.routeId`, and add `this.source = 'tracked'`:

```dart
const TripModel({
  required this.id,
  required this.userId,
  this.routeId,
  this.source = 'tracked',
  required this.startedAt,
  // ... rest unchanged
});
```

- [ ] **Step 3: Update `fromJson`**

Change `routeId` parsing from:
```dart
routeId: json['route_id'] as String,
```
To:
```dart
routeId: json['route_id'] as String?,
source: json['source'] as String? ?? 'tracked',
```

Also update `routeName` parsing to handle both the join result and the direct column. Change from:
```dart
routeName: (json['routes'] as Map<String, dynamic>?)?['name'] as String?,
```
To:
```dart
routeName: (json['routes'] as Map<String, dynamic>?)?['name'] as String?
    ?? json['route_name'] as String?,
```

- [ ] **Step 4: Update `toJson`**

Add `source` and `route_name` to the map:
```dart
'source': source,
'route_name': routeName,
```

Note: `route_id` is already in toJson and will correctly emit `null` for manual trips.

- [ ] **Step 5: Update `copyWith`**

Change `routeId` parameter type and add `source`:
```dart
TripModel copyWith({
  // ...
  String? routeId,
  String? source,
  // ...
}) {
  return TripModel(
    // ...
    routeId: routeId ?? this.routeId,
    source: source ?? this.source,
    // ...
  );
}
```

- [ ] **Step 6: Verify the app compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze --no-fatal-infos 2>&1 | tail -20`
Expected: No errors related to TripModel. There may be a warning in `trip_repository.dart:createTrip` where `routeId` is required — that's fine, we fix it in the next task.

- [ ] **Step 7: Commit**

```bash
git add lib/features/trip/domain/trip_model.dart
git commit -m "feat(trip): make routeId nullable, add source field to TripModel"
```

---

### Task 3: Update TripRepository

**Files:**
- Modify: `lib/features/trip/data/trip_repository.dart`

- [ ] **Step 1: Update `fetchUserTrips` to handle nullable route_id join**

The current query uses `select('*, routes(name)')` which does a Supabase inner join. With nullable `route_id`, change to a left join by using `!inner` syntax removal. Change:

```dart
final data = await _client
    .from('trips')
    .select('*, routes(name)')
    .eq('user_id', userId)
    .order('started_at', ascending: false)
    .limit(limit);
```

To:

```dart
final data = await _client
    .from('trips')
    .select('*, routes!left(name)')
    .eq('user_id', userId)
    .order('started_at', ascending: false)
    .limit(limit);
```

This ensures trips without a `route_id` are still returned (with `routes: null` in the JSON).

- [ ] **Step 2: Add `createManualTrip` method**

Add this method to `TripRepository`, after the existing `createTrip` method:

```dart
Future<TripModel> createManualTrip({
  required String routeName,
  required DateTime date,
  double? distanceKm,
  double? elevationM,
  Duration? duration,
  int? rating,
  String? notes,
}) async {
  final userId = _client.auth.currentUser?.id;
  if (userId == null) throw Exception('Not authenticated');

  final data = await _client.from('trips').insert({
    'user_id': userId,
    'route_name': routeName,
    'started_at': date.toIso8601String(),
    'finished_at': date.toIso8601String(),
    'actual_distance_km': distanceKm,
    'actual_elevation_m': elevationM,
    'actual_duration': duration != null ? _durationToInterval(duration) : null,
    'rating': rating,
    'notes': notes,
    'status': 'completed',
    'source': 'manual',
  }).select().single();

  // Update profile stats
  await _client.from('profiles').select('total_trips, total_distance_km, total_elevation_m').eq('id', userId).single().then((profile) async {
    await _client.from('profiles').update({
      'total_trips': ((profile['total_trips'] as num?)?.toInt() ?? 0) + 1,
      'total_distance_km': ((profile['total_distance_km'] as num?)?.toDouble() ?? 0) + (distanceKm ?? 0),
      'total_elevation_m': ((profile['total_elevation_m'] as num?)?.toDouble() ?? 0) + (elevationM ?? 0),
    }).eq('id', userId);
  });

  return TripModel.fromJson(data);
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze --no-fatal-infos 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/features/trip/data/trip_repository.dart
git commit -m "feat(trip): add createManualTrip method, fix fetchUserTrips for nullable route_id"
```

---

### Task 4: Create ManualTripEntryScreen

**Files:**
- Create: `lib/features/trip/presentation/manual_trip_entry_screen.dart`

- [ ] **Step 1: Create the screen file with imports and state**

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/trip_repository.dart';

class ManualTripEntryScreen extends ConsumerStatefulWidget {
  const ManualTripEntryScreen({super.key});

  @override
  ConsumerState<ManualTripEntryScreen> createState() =>
      _ManualTripEntryScreenState();
}

class _ManualTripEntryScreenState
    extends ConsumerState<ManualTripEntryScreen> {
  final _nameController = TextEditingController();
  final _distanceController = TextEditingController();
  final _elevationController = TextEditingController();
  final _hoursController = TextEditingController();
  final _minutesController = TextEditingController();
  final _notesController = TextEditingController();

  DateTime _selectedDate = DateTime.now();
  int _rating = 0;
  bool _saving = false;

  bool get _isValid => _nameController.text.trim().isNotEmpty;

  @override
  void dispose() {
    _nameController.dispose();
    _distanceController.dispose();
    _elevationController.dispose();
    _hoursController.dispose();
    _minutesController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text(
          '手动记录',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: colors.ink,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              children: [
                _buildBasicInfoSection(colors),
                const SizedBox(height: 16),
                _buildDataSection(colors),
                const SizedBox(height: 16),
                _buildRatingSection(colors),
                const SizedBox(height: 100),
              ],
            ),
          ),
          _buildBottomCta(colors),
        ],
      ),
    );
  }

  // ─── Section 1: Basic Info ──────────────────────────────────────────
  Widget _buildBasicInfoSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '基本信息',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            onChanged: (_) => setState(() {}),
            style: TextStyle(fontSize: 14, color: colors.ink),
            decoration: InputDecoration(
              hintText: '线路名称，如：武功山穿越',
              hintStyle: TextStyle(fontSize: 14, color: colors.inkDim),
              filled: true,
              fillColor: colors.bg,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _pickDate,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: colors.bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_selectedDate.year}.${_selectedDate.month.toString().padLeft(2, '0')}.${_selectedDate.day.toString().padLeft(2, '0')}',
                      style: TextStyle(fontSize: 14, color: colors.ink),
                    ),
                  ),
                  KaipaIcon(
                    name: KaipaIcons.calendar,
                    size: 18,
                    color: colors.inkMuted,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDate() async {
    final colors = ref.read(kaipaTokensProvider).color;
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: colors.flare,
              surface: colors.surface,
              onSurface: colors.ink,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  // ─── Section 2: Route Data ──────────────────────────────────────────
  Widget _buildDataSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '线路数据（选填）',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _numericField(
                  controller: _distanceController,
                  hint: '距离',
                  suffix: 'km',
                  colors: colors,
                  decimal: true,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _numericField(
                  controller: _elevationController,
                  hint: '累计爬升',
                  suffix: 'm',
                  colors: colors,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _numericField(
                  controller: _hoursController,
                  hint: '时',
                  suffix: '时',
                  colors: colors,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _numericField(
                  controller: _minutesController,
                  hint: '分',
                  suffix: '分',
                  colors: colors,
                ),
              ),
              const Spacer(),
            ],
          ),
        ],
      ),
    );
  }

  Widget _numericField({
    required TextEditingController controller,
    required String hint,
    required String suffix,
    required KaipaColors colors,
    bool decimal = false,
  }) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.numberWithOptions(decimal: decimal),
      inputFormatters: [
        FilteringTextInputFormatter.allow(
          decimal ? RegExp(r'[\d.]') : RegExp(r'\d'),
        ),
      ],
      style: TextStyle(fontSize: 14, color: colors.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(fontSize: 14, color: colors.inkDim),
        suffixText: suffix,
        suffixStyle: TextStyle(fontSize: 13, color: colors.inkMuted),
        filled: true,
        fillColor: colors.bg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colors.flare, width: 1),
        ),
      ),
    );
  }

  // ─── Section 3: Rating ──────────────────────────────────────────────
  Widget _buildRatingSection(KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(KaipaRadius.lg),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '评价（选填）',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _rating;
              return GestureDetector(
                onTap: () => setState(() => _rating = _rating == i + 1 ? 0 : i + 1),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: filled ? colors.flareSoft : colors.lineSoft,
                    ),
                    child: Center(
                      child: KaipaIcon(
                        name: KaipaIcons.star,
                        size: 18,
                        color: filled ? colors.flare : colors.inkDim,
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _notesController,
            maxLines: 4,
            minLines: 2,
            style: TextStyle(fontSize: 12.5, color: colors.ink),
            decoration: InputDecoration(
              hintText: '记录一些感受或注意事项…',
              hintStyle: TextStyle(fontSize: 12.5, color: colors.inkDim),
              filled: true,
              fillColor: colors.bg,
              contentPadding: const EdgeInsets.all(12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Bottom CTA ─────────────────────────────────────────────────────
  Widget _buildBottomCta(KaipaColors colors) {
    return Container(
      padding: EdgeInsets.fromLTRB(
          20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(top: BorderSide(color: colors.line, width: 0.5)),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 50,
        child: ElevatedButton(
          onPressed: _isValid && !_saving ? _save : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: colors.flare,
            disabledBackgroundColor: colors.lineSoft,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          child: _saving
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('保存记录'),
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final hours = int.tryParse(_hoursController.text) ?? 0;
      final minutes = int.tryParse(_minutesController.text) ?? 0;
      final duration = (hours > 0 || minutes > 0)
          ? Duration(hours: hours, minutes: minutes)
          : null;

      await ref.read(tripRepositoryProvider).createManualTrip(
            routeName: _nameController.text.trim(),
            date: _selectedDate,
            distanceKm: double.tryParse(_distanceController.text),
            elevationM: double.tryParse(_elevationController.text),
            duration: duration,
            rating: _rating > 0 ? _rating : null,
            notes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          );

      ref.invalidate(allTripsProvider);

      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze --no-fatal-infos 2>&1 | tail -20`
Expected: May show unused import warning since the screen isn't routed yet, but no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip/presentation/manual_trip_entry_screen.dart
git commit -m "feat(trip): add ManualTripEntryScreen form UI"
```

---

### Task 5: Wire Up Router and Entry Point

**Files:**
- Modify: `lib/core/router/app_router.dart`
- Modify: `lib/features/trip/presentation/trip_history_screen.dart`

- [ ] **Step 1: Add import and route to app_router.dart**

Add import at top of `app_router.dart` (after the existing trip imports around line 23):

```dart
import '../../features/trip/presentation/manual_trip_entry_screen.dart';
```

Add the route in the modal routes section (after the `/profile/trip-history` route, around line 146):

```dart
GoRoute(
  path: '/manual-trip-entry',
  parentNavigatorKey: _rootNavigatorKey,
  builder: (_, _) => const ManualTripEntryScreen(),
),
```

- [ ] **Step 2: Add `+` button to trip history AppBar**

In `trip_history_screen.dart`, add an `actions` list to the AppBar. Change the AppBar from:

```dart
appBar: AppBar(
  backgroundColor: colors.bg,
  surfaceTintColor: Colors.transparent,
  leading: IconButton(
    icon: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
    onPressed: () => context.pop(),
  ),
  title: Text(
    '线路历史',
    style: TextStyle(
      fontSize: 17,
      fontWeight: FontWeight.w600,
      color: colors.ink,
      letterSpacing: -0.3,
    ),
  ),
  centerTitle: true,
),
```

To:

```dart
appBar: AppBar(
  backgroundColor: colors.bg,
  surfaceTintColor: Colors.transparent,
  leading: IconButton(
    icon: KaipaIcon(name: KaipaIcons.back, size: 20, color: colors.ink),
    onPressed: () => context.pop(),
  ),
  title: Text(
    '线路历史',
    style: TextStyle(
      fontSize: 17,
      fontWeight: FontWeight.w600,
      color: colors.ink,
      letterSpacing: -0.3,
    ),
  ),
  centerTitle: true,
  actions: [
    IconButton(
      icon: KaipaIcon(name: KaipaIcons.plus, size: 20, color: colors.ink),
      onPressed: () => context.push('/manual-trip-entry'),
    ),
  ],
),
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze --no-fatal-infos 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/core/router/app_router.dart lib/features/trip/presentation/trip_history_screen.dart
git commit -m "feat(trip): wire manual-trip-entry route and add + button to trip history"
```

---

### Task 6: Update Trip History List for Manual Trips

**Files:**
- Modify: `lib/features/trip/presentation/trip_history_screen.dart`

- [ ] **Step 1: Update `_TripCard` to show "手动" badge and disable tap for manual trips**

Replace the entire `_TripCard` class with:

```dart
class _TripCard extends StatelessWidget {
  final TripModel trip;
  final KaipaColors colors;

  const _TripCard({required this.trip, required this.colors});

  @override
  Widget build(BuildContext context) {
    final t = trip;
    final isManual = t.source == 'manual';
    final dateStr =
        '${t.startedAt.year}.${t.startedAt.month.toString().padLeft(2, '0')}.${t.startedAt.day.toString().padLeft(2, '0')}';
    final distStr = t.actualDistanceKm?.toStringAsFixed(1) ?? '–';
    final elevStr = t.actualElevationM?.round().toString() ?? '–';
    final title = t.routeName ?? '${t.startedAt.month}月${t.startedAt.day}日';
    final subtitle = t.routeName != null
        ? '$dateStr  ·  ${distStr}km  ·  ↑${elevStr}m'
        : '${distStr}km  ·  ↑${elevStr}m';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: isManual ? null : () => context.push('/discover/route/${t.routeId}'),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: colors.terrain.lowland,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: KaipaIcon(
                    name: KaipaIcons.mountain,
                    size: 20,
                    color: colors.mossDeep,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w600,
                              color: colors.ink,
                              letterSpacing: -0.2,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isManual) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: colors.sand,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              '手动',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (!isManual)
                KaipaIcon(
                  name: KaipaIcons.forward,
                  size: 14,
                  color: colors.inkDim,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze --no-fatal-infos 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip/presentation/trip_history_screen.dart
git commit -m "feat(trip): show manual badge on manual trips, disable tap for non-route trips"
```

---

### Task 7: Manual Testing in Browser

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `cd /home/coder/workspaces/kaipa && flutter run -d chrome --web-port=8080 2>&1 | tail -30`

- [ ] **Step 2: Test the happy path**

1. Log in → navigate to Profile → tap "线路历史"
2. Verify the `+` button appears in the AppBar
3. Tap `+` → verify ManualTripEntryScreen opens
4. Enter a route name (e.g. "武功山穿越")
5. Tap the date row → verify date picker opens, select a past date
6. Enter optional data: distance "23.5", elevation "1280", hours "8", minutes "30"
7. Tap 4 stars for rating
8. Enter a note
9. Tap "保存记录"
10. Verify you're popped back to trip history and the new trip appears with "手动" badge
11. Verify the manual trip card has no forward chevron and is not tappable

- [ ] **Step 3: Test edge cases**

1. Try saving with empty name → button should be disabled
2. Try saving with only name + date (no optional fields) → should succeed
3. Tap a star twice → should deselect (rating goes to 0)
4. Try selecting a future date → date picker should not allow it

- [ ] **Step 4: Fix any issues found during testing**

Address any visual or functional issues discovered.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(trip): address manual trip entry issues found during testing"
```
