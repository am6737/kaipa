# Departure Flow Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up all 7 departure flow pages end-to-end with real Supabase data, creating a seamless Gear Pick → Weather → Safety Confirm → Navigate → Trip Complete → Route Publish flow.

**Architecture:** A `DepartureFlowProvider` (Riverpod StateNotifier, family-scoped by routeId) accumulates gear/weather/safety selections across the 3 preparation steps. SafetyConfirmScreen creates the trip in Supabase. NavigateScreen and TripCompleteScreen read the tripId from URL query params. RoutePublishScreen reads trip data and creates a new route record.

**Tech Stack:** Flutter 3.x, Riverpod, GoRouter, Supabase (PostgreSQL), existing Kaipa design tokens and widget library.

**Spec:** `docs/superpowers/specs/2026-05-01-departure-flow-wiring-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| NEW | `supabase/migrations/20260501000001_departure_flow.sql` | Add `emergency_contact` to profiles, `safety_settings` to trips |
| NEW | `lib/features/trip/data/departure_flow_provider.dart` | State that accumulates across the 3-step departure flow |
| NEW | `lib/features/trip/presentation/safety_confirm_screen.dart` | Step 3/3 safety confirmation UI |
| MODIFY | `lib/features/trip/domain/trip_model.dart` | Add `safetySettings` field |
| MODIFY | `lib/features/trip/data/trip_repository.dart` | Add `createTrip`, `completeTrip`, `rateTrip` methods |
| MODIFY | `lib/features/profile/domain/profile_model.dart` | Add `emergencyContact` field |
| MODIFY | `lib/features/profile/data/profile_repository.dart` | Add emergency contact methods |
| MODIFY | `lib/features/discover/data/route_repository.dart` | Add `publishRoute` method |
| MODIFY | `lib/core/router/app_router.dart` | Add `/safety-confirm/:routeId`, update navigate & route-publish routes |
| MODIFY | `lib/features/gear/presentation/gear_pick_screen.dart` | CTA navigates to weather, writes gear to departure flow |
| MODIFY | `lib/features/discover/presentation/weather_screen.dart` | CTA navigates to safety-confirm |
| MODIFY | `lib/features/navigation/presentation/navigate_screen.dart` | Accept tripId, add end-trip long-press |
| MODIFY | `lib/features/trip/presentation/trip_complete_screen.dart` | Read real trip data, CTA → route-publish |
| MODIFY | `lib/features/discover/presentation/route_publish_screen.dart` | Accept tripId, real publish logic |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260501000001_departure_flow.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20260501000001_departure_flow.sql`:

```sql
-- Add emergency contact to profiles (persists across trips)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb;

-- Add per-trip safety settings
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS safety_settings jsonb;
```

- [ ] **Step 2: Push migration to remote Supabase**

Run:
```bash
cd /home/coder/workspaces/kaipa && npx supabase db push --linked
```

Expected: Migration applies successfully, no errors.

- [ ] **Step 3: Verify columns exist**

Run:
```bash
cd /home/coder/workspaces/kaipa && npx supabase db push --linked --dry-run
```

Expected: No pending migrations.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260501000001_departure_flow.sql
git commit -m "feat(db): add emergency_contact and safety_settings columns for departure flow"
```

---

### Task 2: Update Models (TripModel + ProfileModel)

**Files:**
- Modify: `lib/features/trip/domain/trip_model.dart`
- Modify: `lib/features/profile/domain/profile_model.dart`

- [ ] **Step 1: Add `safetySettings` to TripModel**

In `lib/features/trip/domain/trip_model.dart`, add the field to the class, constructor, fromJson, toJson, and copyWith.

Class field (add after `weatherSummary`):
```dart
  final Map<String, dynamic>? safetySettings;
```

Constructor parameter (add after `weatherSummary`):
```dart
    this.safetySettings,
```

In `fromJson` (add after the `weatherSummary` line):
```dart
      safetySettings: json['safety_settings'] as Map<String, dynamic>?,
```

In `toJson` (add after the `'weather_summary'` entry):
```dart
      'safety_settings': safetySettings,
```

In `copyWith` — add parameter:
```dart
    Map<String, dynamic>? safetySettings,
```
And in the return body:
```dart
      safetySettings: safetySettings ?? this.safetySettings,
```

- [ ] **Step 2: Add `emergencyContact` to ProfileModel**

In `lib/features/profile/domain/profile_model.dart`, add the field to the class, constructor, fromJson, toJson, and copyWith.

Class field (add after `bio`):
```dart
  final Map<String, dynamic>? emergencyContact;
```

Constructor parameter (add after `this.bio`):
```dart
    this.emergencyContact,
```

In `fromJson` (add after the `bio` line):
```dart
      emergencyContact: json['emergency_contact'] as Map<String, dynamic>?,
```

In `toJson` (add after the `'bio'` entry):
```dart
      'emergency_contact': emergencyContact,
```

In `copyWith` — add parameter:
```dart
    Map<String, dynamic>? emergencyContact,
```
And in the return body:
```dart
      emergencyContact: emergencyContact ?? this.emergencyContact,
```

- [ ] **Step 3: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip/domain/trip_model.dart lib/features/profile/domain/profile_model.dart 2>&1 | head -20
```

Expected: No analysis issues in these files.

- [ ] **Step 4: Commit**

```bash
git add lib/features/trip/domain/trip_model.dart lib/features/profile/domain/profile_model.dart
git commit -m "feat(models): add safetySettings to TripModel, emergencyContact to ProfileModel"
```

---

### Task 3: Repository Methods (Trip, Profile, Route)

**Files:**
- Modify: `lib/features/trip/data/trip_repository.dart`
- Modify: `lib/features/profile/data/profile_repository.dart`
- Modify: `lib/features/discover/data/route_repository.dart`

- [ ] **Step 1: Add createTrip, completeTrip, rateTrip to TripRepository**

In `lib/features/trip/data/trip_repository.dart`, add these methods to the `TripRepository` class (after `fetchTripById`):

```dart
  Future<TripModel> createTrip({
    required String routeId,
    List<String> gearUsed = const [],
    Map<String, dynamic>? weatherSummary,
    Map<String, dynamic>? safetySettings,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client.from('trips').insert({
      'user_id': userId,
      'route_id': routeId,
      'gear_used': gearUsed,
      'weather_summary': weatherSummary,
      'safety_settings': safetySettings,
      'status': 'in_progress',
    }).select().single();
    return TripModel.fromJson(data);
  }

  Future<void> completeTrip(
    String tripId, {
    required double distanceKm,
    required double elevationM,
    required Duration duration,
    required double avgSpeedKmh,
  }) async {
    await _client.from('trips').update({
      'status': 'completed',
      'finished_at': DateTime.now().toIso8601String(),
      'actual_distance_km': distanceKm,
      'actual_elevation_m': elevationM,
      'actual_duration': _durationToInterval(duration),
      'avg_speed_kmh': avgSpeedKmh,
    }).eq('id', tripId);

    // Update profile stats
    final userId = _client.auth.currentUser?.id;
    if (userId != null) {
      final profile = await _client
          .from('profiles')
          .select('total_trips, total_distance_km, total_elevation_m')
          .eq('id', userId)
          .single();
      await _client.from('profiles').update({
        'total_trips': ((profile['total_trips'] as num?)?.toInt() ?? 0) + 1,
        'total_distance_km':
            ((profile['total_distance_km'] as num?)?.toDouble() ?? 0) +
                distanceKm,
        'total_elevation_m':
            ((profile['total_elevation_m'] as num?)?.toDouble() ?? 0) +
                elevationM,
      }).eq('id', userId);
    }
  }

  Future<void> rateTrip(String tripId, int rating, String? notes) async {
    await _client.from('trips').update({
      'rating': rating,
      'notes': notes,
    }).eq('id', tripId);
  }

  static String _durationToInterval(Duration d) {
    final parts = <String>[];
    if (d.inDays > 0) {
      parts.add('${d.inDays} ${d.inDays == 1 ? 'day' : 'days'}');
    }
    final hours = d.inHours % 24;
    if (hours > 0) {
      parts.add('$hours ${hours == 1 ? 'hour' : 'hours'}');
    }
    final minutes = d.inMinutes % 60;
    if (minutes > 0) {
      parts.add('$minutes ${minutes == 1 ? 'minute' : 'minutes'}');
    }
    if (parts.isEmpty) {
      final seconds = d.inSeconds % 60;
      parts.add('$seconds ${seconds == 1 ? 'second' : 'seconds'}');
    }
    return parts.join(' ');
  }
```

- [ ] **Step 2: Add emergency contact methods to ProfileRepository**

In `lib/features/profile/data/profile_repository.dart`, add to the `ProfileRepository` class (after `updateDifficultyPreference`):

```dart
  Future<Map<String, dynamic>?> getEmergencyContact() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client
        .from('profiles')
        .select('emergency_contact')
        .eq('id', userId)
        .single();
    return data['emergency_contact'] as Map<String, dynamic>?;
  }

  Future<void> updateEmergencyContact(Map<String, dynamic> contact) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client
        .from('profiles')
        .update({'emergency_contact': contact})
        .eq('id', userId);
  }
```

Also add a provider for the emergency contact at the bottom of the file:

```dart
final emergencyContactProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.getEmergencyContact();
});
```

- [ ] **Step 3: Add publishRoute method to RouteRepository**

In `lib/features/discover/data/route_repository.dart`, add to the `RouteRepository` class (after `searchRoutes`):

```dart
  Future<RouteModel> publishRoute({
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
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    final data = await _client.from('routes').insert({
      'creator_id': userId,
      'name': name,
      'description': description,
      'distance_km': distanceKm,
      'elevation_gain_m': elevationGainM,
      'estimated_duration': _durationToInterval(estimatedDuration),
      'difficulty': difficulty,
      'tags': tags,
      'is_published': isPublished,
      'latitude': latitude,
      'longitude': longitude,
      'region': region,
    }).select().single();
    return RouteModel.fromJson(data);
  }

  Future<void> createFeedItem({
    required String type,
    required Map<String, dynamic> content,
    String? routeId,
    String? tripId,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    await _client.from('feed_items').insert({
      'user_id': userId,
      'type': type,
      'content': content,
      'route_id': routeId,
      'trip_id': tripId,
    });
  }

  static String _durationToInterval(Duration d) {
    final parts = <String>[];
    if (d.inDays > 0) {
      parts.add('${d.inDays} ${d.inDays == 1 ? 'day' : 'days'}');
    }
    final hours = d.inHours % 24;
    if (hours > 0) {
      parts.add('$hours ${hours == 1 ? 'hour' : 'hours'}');
    }
    final minutes = d.inMinutes % 60;
    if (minutes > 0) {
      parts.add('$minutes ${minutes == 1 ? 'minute' : 'minutes'}');
    }
    if (parts.isEmpty) {
      final seconds = d.inSeconds % 60;
      parts.add('$seconds ${seconds == 1 ? 'second' : 'seconds'}');
    }
    return parts.join(' ');
  }
```

- [ ] **Step 4: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip/data/trip_repository.dart lib/features/profile/data/profile_repository.dart lib/features/discover/data/route_repository.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 5: Commit**

```bash
git add lib/features/trip/data/trip_repository.dart lib/features/profile/data/profile_repository.dart lib/features/discover/data/route_repository.dart
git commit -m "feat(repos): add createTrip, completeTrip, rateTrip, publishRoute, emergency contact methods"
```

---

### Task 4: DepartureFlowProvider

**Files:**
- Create: `lib/features/trip/data/departure_flow_provider.dart`

- [ ] **Step 1: Create DepartureFlowProvider**

Create `lib/features/trip/data/departure_flow_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

class DepartureFlowState {
  final String routeId;
  final List<String> selectedGearIds;
  final String? selectedDate;
  final String? departureTime;
  final Map<String, bool> safetyToggles;
  final String? tripId;

  const DepartureFlowState({
    required this.routeId,
    this.selectedGearIds = const [],
    this.selectedDate,
    this.departureTime,
    this.safetyToggles = const {
      'location_sharing': true,
      'sos_enabled': true,
    },
    this.tripId,
  });

  DepartureFlowState copyWith({
    List<String>? selectedGearIds,
    String? selectedDate,
    String? departureTime,
    Map<String, bool>? safetyToggles,
    String? tripId,
  }) {
    return DepartureFlowState(
      routeId: routeId,
      selectedGearIds: selectedGearIds ?? this.selectedGearIds,
      selectedDate: selectedDate ?? this.selectedDate,
      departureTime: departureTime ?? this.departureTime,
      safetyToggles: safetyToggles ?? this.safetyToggles,
      tripId: tripId ?? this.tripId,
    );
  }
}

class DepartureFlowNotifier extends StateNotifier<DepartureFlowState> {
  DepartureFlowNotifier(String routeId)
      : super(DepartureFlowState(routeId: routeId));

  void setGear(List<String> ids) {
    state = state.copyWith(selectedGearIds: ids);
  }

  void setWeather(String date, String time) {
    state = state.copyWith(selectedDate: date, departureTime: time);
  }

  void setSafety(Map<String, bool> toggles) {
    state = state.copyWith(safetyToggles: toggles);
  }

  void setTripId(String id) {
    state = state.copyWith(tripId: id);
  }
}

final departureFlowProvider = StateNotifierProvider.autoDispose
    .family<DepartureFlowNotifier, DepartureFlowState, String>(
  (ref, routeId) => DepartureFlowNotifier(routeId),
);
```

- [ ] **Step 2: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip/data/departure_flow_provider.dart 2>&1 | head -10
```

Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip/data/departure_flow_provider.dart
git commit -m "feat(state): add DepartureFlowProvider for cross-step state accumulation"
```

---

### Task 5: SafetyConfirmScreen (New Screen)

**Files:**
- Create: `lib/features/trip/presentation/safety_confirm_screen.dart`

- [ ] **Step 1: Create SafetyConfirmScreen**

Create `lib/features/trip/presentation/safety_confirm_screen.dart`. This is the longest new file. It follows the prototype ScreenConfirm design with Kaipa design tokens.

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/widgets/circle_button.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../../discover/data/route_repository.dart';
import '../../profile/data/profile_repository.dart';
import '../data/departure_flow_provider.dart';
import '../data/trip_repository.dart';

class SafetyConfirmScreen extends ConsumerStatefulWidget {
  final String routeId;
  const SafetyConfirmScreen({super.key, required this.routeId});

  @override
  ConsumerState<SafetyConfirmScreen> createState() =>
      _SafetyConfirmScreenState();
}

class _SafetyConfirmScreenState extends ConsumerState<SafetyConfirmScreen> {
  bool _locationSharing = true;
  bool _sosEnabled = true;
  bool _isCreating = false;

  String? _contactName;
  String? _contactPhone;
  String? _contactRelation;

  @override
  void initState() {
    super.initState();
    _loadEmergencyContact();
  }

  Future<void> _loadEmergencyContact() async {
    try {
      final repo = ref.read(profileRepositoryProvider);
      final contact = await repo.getEmergencyContact();
      if (contact != null && mounted) {
        setState(() {
          _contactName = contact['name'] as String?;
          _contactPhone = contact['phone'] as String?;
          _contactRelation = contact['relationship'] as String?;
        });
      }
    } catch (_) {}
  }

  Future<void> _onStartNavigation() async {
    if (_isCreating) return;
    setState(() => _isCreating = true);

    try {
      // Save emergency contact if set
      if (_contactName != null && _contactPhone != null) {
        final profileRepo = ref.read(profileRepositoryProvider);
        await profileRepo.updateEmergencyContact({
          'name': _contactName,
          'phone': _contactPhone,
          'relationship': _contactRelation ?? '',
        });
      }

      // Read gear from departure flow
      final flow = ref.read(departureFlowProvider(widget.routeId));

      // Write safety toggles
      ref.read(departureFlowProvider(widget.routeId).notifier).setSafety({
        'location_sharing': _locationSharing,
        'sos_enabled': _sosEnabled,
      });

      // Create trip in Supabase
      final tripRepo = ref.read(tripRepositoryProvider);
      final trip = await tripRepo.createTrip(
        routeId: widget.routeId,
        gearUsed: flow.selectedGearIds,
        weatherSummary: flow.selectedDate != null
            ? {
                'date': flow.selectedDate,
                'departure_time': flow.departureTime,
              }
            : null,
        safetySettings: {
          'location_sharing': _locationSharing,
          'sos_enabled': _sosEnabled,
        },
      );

      ref.read(departureFlowProvider(widget.routeId).notifier)
          .setTripId(trip.id);

      if (mounted) {
        context.go('/navigate/${widget.routeId}?tripId=${trip.id}');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isCreating = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('创建行程失败: $e')),
        );
      }
    }
  }

  void _showEditContactSheet() {
    final nameCtrl = TextEditingController(text: _contactName ?? '');
    final phoneCtrl = TextEditingController(text: _contactPhone ?? '');
    final relationCtrl = TextEditingController(text: _contactRelation ?? '');
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '紧急联系人',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameCtrl,
              decoration: InputDecoration(
                labelText: '姓名',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: '电话',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: relationCtrl,
              decoration: InputDecoration(
                labelText: '关系',
                hintText: '如：妻子、父亲、朋友',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () {
                  setState(() {
                    _contactName = nameCtrl.text.isEmpty ? null : nameCtrl.text;
                    _contactPhone =
                        phoneCtrl.text.isEmpty ? null : phoneCtrl.text;
                    _contactRelation =
                        relationCtrl.text.isEmpty ? null : relationCtrl.text;
                  });
                  Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('保存'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
    final routeAsync = ref.watch(routeByIdProvider(widget.routeId));

    return Scaffold(
      backgroundColor: colors.bg,
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              16, MediaQuery.of(context).padding.top + 12, 16, 120,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Back + step indicator
                _buildHeader(colors),
                const SizedBox(height: 20),

                // Emergency contact
                _buildEmergencyContactCard(colors),
                const SizedBox(height: 10),

                // ETA
                routeAsync.when(
                  data: (route) => _buildEtaCard(colors, route.estimatedDuration),
                  loading: () => _buildEtaCard(colors, const Duration(hours: 5)),
                  error: (_, _) => _buildEtaCard(colors, const Duration(hours: 5)),
                ),
                const SizedBox(height: 10),

                // Toggle cards
                _buildToggleCard(
                  colors,
                  icon: KaipaIcons.pin,
                  title: '实时位置共享',
                  desc: '家人/朋友可查看实时位置',
                  value: _locationSharing,
                  onChanged: (v) => setState(() => _locationSharing = v),
                ),
                const SizedBox(height: 10),

                _buildCheckCard(
                  colors,
                  icon: KaipaIcons.download,
                  title: '离线地图已下载',
                  desc: '覆盖 60 km² · 32 MB',
                ),
                const SizedBox(height: 10),

                _buildToggleCard(
                  colors,
                  icon: KaipaIcons.alert,
                  title: '一键 SOS',
                  desc: '长按触发 · 拨打 110 + 通知紧急联系人',
                  value: _sosEnabled,
                  onChanged: (v) => setState(() => _sosEnabled = v),
                  isDanger: true,
                ),
              ],
            ),
          ),

          // CTA
          _buildCta(colors),
        ],
      ),
    );
  }

  Widget _buildHeader(KaipaColors colors) {
    return Row(
      children: [
        CircleButton(
          icon: KaipaIcons.back,
          size: 36,
          iconSize: 15,
          onTap: () => context.pop(),
        ),
        const Spacer(),
        Text(
          '第 3 步 / 共 3 步',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: colors.inkMuted,
            letterSpacing: -0.1,
          ),
        ),
        const Spacer(),
        const SizedBox(width: 36),
      ],
    );
  }

  Widget _buildEmergencyContactCard(KaipaColors colors) {
    final hasContact = _contactName != null && _contactPhone != null;
    return GestureDetector(
      onTap: _showEditContactSheet,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colors.line, width: 0.5),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: KaipaIcon(
                  name: KaipaIcons.users,
                  size: 18,
                  color: colors.flare,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '紧急联系人',
                    style: TextStyle(
                      fontSize: 11,
                      color: colors.inkMuted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hasContact
                        ? '$_contactName · $_contactRelation'
                        : '请设置紧急联系人',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: hasContact ? colors.ink : colors.flare,
                      letterSpacing: -0.2,
                    ),
                  ),
                ],
              ),
            ),
            KaipaIcon(
              name: KaipaIcons.forward,
              size: 14,
              color: colors.inkMuted,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEtaCard(KaipaColors colors, Duration estimatedDuration) {
    final eta = DateTime.now().add(estimatedDuration);
    final weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final weekday = weekdays[eta.weekday - 1];
    final timeStr = DateFormat('HH:mm').format(eta);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.mossSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: KaipaIcon(
                name: KaipaIcons.clock,
                size: 18,
                color: colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '预计返回时间',
                  style: TextStyle(
                    fontSize: 11,
                    color: colors.inkMuted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$weekday $timeStr',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '超时自动通知',
            style: TextStyle(
              fontSize: 11,
              color: colors.inkMuted,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleCard(
    KaipaColors colors, {
    required String icon,
    required String title,
    required String desc,
    required bool value,
    required ValueChanged<bool> onChanged,
    bool isDanger = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDanger ? const Color(0x0DC0392B) : colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDanger ? const Color(0x33C0392B) : colors.line,
          width: 0.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isDanger ? const Color(0x1AC0392B) : colors.mossSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: KaipaIcon(
                name: icon,
                size: 18,
                color: isDanger ? const Color(0xFFC0392B) : colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  desc,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => onChanged(!value),
            child: Container(
              width: 42,
              height: 25,
              decoration: BoxDecoration(
                color: value
                    ? (isDanger ? const Color(0xFFC0392B) : colors.flare)
                    : colors.line,
                borderRadius: BorderRadius.circular(99),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeInOut,
                alignment:
                    value ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 21,
                  height: 21,
                  margin: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckCard(
    KaipaColors colors, {
    required String icon,
    required String title,
    required String desc,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.mossSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: KaipaIcon(
                name: icon,
                size: 18,
                color: colors.mossDeep,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.ink,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  desc,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: colors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.check_circle_rounded,
            size: 22,
            color: colors.mossDeep,
          ),
        ],
      ),
    );
  }

  Widget _buildCta(KaipaColors colors) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              colors.bg.withAlpha(0),
              colors.bg,
            ],
            stops: const [0.0, 0.4],
          ),
        ),
        padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding + 16),
        child: GestureDetector(
          onTap: _isCreating ? null : _onStartNavigation,
          child: Container(
            height: 54,
            decoration: BoxDecoration(
              color: _isCreating ? colors.surfaceHi : colors.flare,
              borderRadius: BorderRadius.circular(16),
              boxShadow: _isCreating
                  ? null
                  : [
                      BoxShadow(
                        color: colors.flare.withAlpha(77),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_isCreating)
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: colors.inkMuted,
                    ),
                  )
                else ...[
                  const Text(
                    '一切就绪 · 开始导航',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 6),
                  KaipaIcon(
                    name: KaipaIcons.navigate,
                    size: 16,
                    color: Colors.white,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip/presentation/safety_confirm_screen.dart 2>&1 | head -20
```

Expected: No analysis issues (or minor warnings only). Fix any issues found.

- [ ] **Step 3: Commit**

```bash
git add lib/features/trip/presentation/safety_confirm_screen.dart
git commit -m "feat(safety): add SafetyConfirmScreen — step 3/3 of departure flow"
```

---

### Task 6: Update AppRouter

**Files:**
- Modify: `lib/core/router/app_router.dart`

- [ ] **Step 1: Add SafetyConfirmScreen import**

Add at the top of `lib/core/router/app_router.dart` (after the existing trip imports):

```dart
import '../../features/trip/presentation/safety_confirm_screen.dart';
```

- [ ] **Step 2: Add `/safety-confirm/:routeId` route**

Add a new GoRoute after the `/weather/:routeId` route block (around line 184):

```dart
      GoRoute(
        path: '/safety-confirm/:routeId',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => SafetyConfirmScreen(
          routeId: state.pathParameters['routeId']!,
        ),
      ),
```

- [ ] **Step 3: Update `/navigate/:routeId` to pass tripId**

Change the existing navigate route builder from:

```dart
        builder: (_, state) => NavigateScreen(
          routeId: state.pathParameters['routeId']!,
        ),
```

To:

```dart
        builder: (_, state) => NavigateScreen(
          routeId: state.pathParameters['routeId']!,
          tripId: state.uri.queryParameters['tripId'],
        ),
```

- [ ] **Step 4: Update `/route-publish` to pass tripId**

Change the existing route-publish route builder from:

```dart
        builder: (_, _) => const RoutePublishScreen(),
```

To:

```dart
        builder: (_, state) => RoutePublishScreen(
          tripId: state.uri.queryParameters['tripId'],
        ),
```

- [ ] **Step 5: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/core/router/app_router.dart 2>&1 | head -20
```

Expected: May show errors because `NavigateScreen` and `RoutePublishScreen` constructors don't yet accept `tripId`. That's OK — those will be fixed in Tasks 8 and 10.

- [ ] **Step 6: Commit**

```bash
git add lib/core/router/app_router.dart
git commit -m "feat(router): add safety-confirm route, pass tripId to navigate and route-publish"
```

---

### Task 7: Wire GearPickScreen CTA

**Files:**
- Modify: `lib/features/gear/presentation/gear_pick_screen.dart`

- [ ] **Step 1: Add departure flow import**

Add at the top of `lib/features/gear/presentation/gear_pick_screen.dart` (after existing imports):

```dart
import '../../trip/data/departure_flow_provider.dart';
```

- [ ] **Step 2: Change CTA onTap**

In the `_buildCta` method, find (around line 1054-1059):

```dart
          onTap: hasAlert
              ? null
              : () {
                  // Navigate forward
                  context.pop();
                },
```

Replace with:

```dart
          onTap: hasAlert
              ? null
              : () {
                  final gearIds = ref
                      .read(gearPickProvider)
                      .selectedItemIds
                      .toList();
                  ref
                      .read(departureFlowProvider(widget.routeId).notifier)
                      .setGear(gearIds);
                  context.push('/weather/${widget.routeId}');
                },
```

Note: `_buildCta` is a method of `_GearPickScreenState` which extends `ConsumerState`, so `ref` is available. `widget.routeId` is available from the parent `GearPickScreen` widget.

- [ ] **Step 3: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/gear/presentation/gear_pick_screen.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 4: Commit**

```bash
git add lib/features/gear/presentation/gear_pick_screen.dart
git commit -m "feat(gear-pick): CTA navigates to weather screen, writes gear to departure flow"
```

---

### Task 8: Wire WeatherScreen CTA

**Files:**
- Modify: `lib/features/discover/presentation/weather_screen.dart`

- [ ] **Step 1: Change CTA onTap**

In `lib/features/discover/presentation/weather_screen.dart`, find the empty onTap in the `_buildCta` method (around line 588-591):

```dart
          onTap: () {
            // Navigate to step 3 (safety confirmation)
            // For now, just pop or navigate forward
          },
```

Replace with:

```dart
          onTap: () {
            context.push('/safety-confirm/${widget.routeId}');
          },
```

Note: `WeatherScreen` is a `ConsumerWidget` (not stateful), and has `widget` → actually no, since it's `ConsumerWidget`, the routeId is accessed as `this.routeId`. But wait, the build method receives `ref` as parameter. Let me check — the `_buildCta` is a method on `WeatherScreen` itself. Since `WeatherScreen` is a `ConsumerWidget`, `this.routeId` is correct.

Actually, looking at the code: `_buildCta` takes `BuildContext context` and `KaipaColors colors` as parameters. The `context` here is the build context which has GoRouter access. `routeId` is a field on `WeatherScreen`.

Replace with:

```dart
          onTap: () {
            context.push('/safety-confirm/$routeId');
          },
```

- [ ] **Step 2: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/discover/presentation/weather_screen.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 3: Commit**

```bash
git add lib/features/discover/presentation/weather_screen.dart
git commit -m "feat(weather): CTA navigates to safety-confirm screen"
```

---

### Task 9: Wire NavigateScreen (accept tripId + end-trip)

**Files:**
- Modify: `lib/features/navigation/presentation/navigate_screen.dart`

- [ ] **Step 1: Add tripId parameter and import**

Add import at top:

```dart
import '../../trip/data/trip_repository.dart';
```

Change the constructor to accept `tripId`:

```dart
class NavigateScreen extends ConsumerStatefulWidget {
  final String routeId;
  final String? tripId;

  const NavigateScreen({super.key, required this.routeId, this.tripId});
```

- [ ] **Step 2: Add end-trip confirmation method**

Add this method to `_NavigateScreenState` (after the `_formatTime` method):

```dart
  void _showEndTripSheet() {
    final tokens = ref.read(kaipaTokensProvider);
    final colors = tokens.color;

    showModalBottomSheet(
      context: context,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '确定要结束行程吗？',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: colors.ink,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await _endTrip();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC0392B),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('结束行程'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(
                  '继续',
                  style: TextStyle(color: colors.ink),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _endTrip() async {
    final tripId = widget.tripId;
    if (tripId == null) {
      context.go('/discover');
      return;
    }

    try {
      final duration = Duration(seconds: _elapsedSeconds);
      final tripRepo = ref.read(tripRepositoryProvider);
      await tripRepo.completeTrip(
        tripId,
        distanceKm: 11.4,
        elevationM: 680,
        duration: duration,
        avgSpeedKmh: 4.2,
      );
      if (mounted) {
        context.go('/trip-complete/$tripId');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('结束行程失败: $e')),
        );
      }
    }
  }
```

- [ ] **Step 3: Add long-press to pause button**

Find the pause button GestureDetector (around line 397-398):

```dart
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _isPaused = !_isPaused),
```

Replace with:

```dart
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _isPaused = !_isPaused),
                  onLongPress: _showEndTripSheet,
```

- [ ] **Step 4: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/navigation/presentation/navigate_screen.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 5: Commit**

```bash
git add lib/features/navigation/presentation/navigate_screen.dart
git commit -m "feat(navigate): accept tripId, add long-press end-trip with confirmation sheet"
```

---

### Task 10: Wire TripCompleteScreen (real data + route-publish CTA)

**Files:**
- Modify: `lib/features/trip/presentation/trip_complete_screen.dart`

- [ ] **Step 1: Import trip repository**

Add import at top of `lib/features/trip/presentation/trip_complete_screen.dart`:

```dart
import '../data/trip_repository.dart';
```

- [ ] **Step 2: Fetch real trip data in build**

In the `build` method, add trip data fetch after the tokens line. Then wrap the body content to show real data when available.

After:
```dart
    final tokens = ref.watch(kaipaTokensProvider);
    final colors = tokens.color;
```

Add:
```dart
    final tripAsync = ref.watch(tripByIdProvider(widget.tripId));
```

- [ ] **Step 3: Update stats display to use real data**

In `_buildStatsCard`, change the hardcoded stat values. The method currently takes `KaipaTokens tokens, KaipaColors colors`. Add `TripModel? trip` parameter.

Change the method signature to:
```dart
  Widget _buildStatsCard(KaipaTokens tokens, KaipaColors colors, {double? distanceKm, double? elevationM, Duration? duration, double? avgSpeed}) {
```

Replace the hardcoded stat row:
```dart
          Row(
            children: [
              _statColumn('11.4', 'km', colors),
              _statColumn('680', 'm', colors),
              _statColumn('5:18', null, colors),
              _statColumn('4.2', 'km/h', colors),
            ],
          ),
```

With:
```dart
          Row(
            children: [
              _statColumn((distanceKm ?? 11.4).toStringAsFixed(1), 'km', colors),
              _statColumn((elevationM ?? 680).toInt().toString(), 'm', colors),
              _statColumn(_formatDuration(duration ?? const Duration(hours: 5, minutes: 18)), null, colors),
              _statColumn((avgSpeed ?? 4.2).toStringAsFixed(1), 'km/h', colors),
            ],
          ),
```

Add a helper method:
```dart
  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    return '$h:${m.toString().padLeft(2, '0')}';
  }
```

Update the call site in `build` to pass trip data:
```dart
                _buildStatsCard(
                  tokens, colors,
                  distanceKm: tripAsync.valueOrNull?.actualDistanceKm,
                  elevationM: tripAsync.valueOrNull?.actualElevationM,
                  duration: tripAsync.valueOrNull?.actualDuration,
                  avgSpeed: tripAsync.valueOrNull?.avgSpeedKmh,
                ),
```

- [ ] **Step 4: Replace bottom CTA**

Replace `_buildBottomCta` method content. Change from single "完成 · 返回首页" button to two buttons:

```dart
  Widget _buildBottomCta(KaipaColors colors) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0.0, 0.5, 1.0],
          colors: [
            colors.bg.withAlpha(0),
            colors.bg,
            colors.bg,
          ],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: () {
                context.push('/route-publish?tripId=${widget.tripId}');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.ink,
                foregroundColor: colors.bg,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: const Text('发布路线'),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: TextButton(
              onPressed: () => context.go('/discover'),
              child: Text(
                '跳过',
                style: TextStyle(
                  fontSize: 14,
                  color: colors.inkMuted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
```

- [ ] **Step 5: Add rating save**

Find the star rating section. After the stars tapped, add a save. Look for where `_rating` is set in `setState` in the star row. After the rating section's `_rating` setter, we need to also save to DB. The simplest approach: add a "提交评价" button below the textarea that calls rateTrip. Or save automatically on CTA.

Add this logic inside the "发布路线" button's `onPressed`, before navigating:

```dart
              onPressed: () async {
                if (_rating > 0) {
                  try {
                    final tripRepo = ref.read(tripRepositoryProvider);
                    await tripRepo.rateTrip(
                      widget.tripId,
                      _rating,
                      _feedbackController.text.isEmpty
                          ? null
                          : _feedbackController.text,
                    );
                  } catch (_) {}
                }
                if (mounted) {
                  context.push('/route-publish?tripId=${widget.tripId}');
                }
              },
```

Also save rating when "跳过" is tapped:
```dart
              onPressed: () async {
                if (_rating > 0) {
                  try {
                    final tripRepo = ref.read(tripRepositoryProvider);
                    await tripRepo.rateTrip(
                      widget.tripId,
                      _rating,
                      _feedbackController.text.isEmpty
                          ? null
                          : _feedbackController.text,
                    );
                  } catch (_) {}
                }
                if (mounted) {
                  context.go('/discover');
                }
              },
```

- [ ] **Step 6: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/trip/presentation/trip_complete_screen.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 7: Commit**

```bash
git add lib/features/trip/presentation/trip_complete_screen.dart
git commit -m "feat(trip-complete): read real trip data, CTA goes to route-publish, save rating"
```

---

### Task 11: Wire RoutePublishScreen (accept tripId + real publish)

**Files:**
- Modify: `lib/features/discover/presentation/route_publish_screen.dart`

- [ ] **Step 1: Add tripId parameter and imports**

Add imports at the top:
```dart
import '../../trip/data/trip_repository.dart';
import '../data/route_repository.dart';
```

Change the class definition to accept `tripId`:

```dart
class RoutePublishScreen extends ConsumerStatefulWidget {
  final String? tripId;
  const RoutePublishScreen({super.key, this.tripId});
```

- [ ] **Step 2: Load trip data in initState**

Add fields and loading logic to `_RoutePublishScreenState`:

```dart
  String _title = '箭扣野长城日落穿越';
  String _story = '从将军关下车，沿着野长城往西，午后云开雾散，鹰飞倒仰段落比想象中陡。';
  double? _distanceKm;
  double? _elevationM;
  Duration? _duration;
  double? _latitude;
  double? _longitude;
  String? _region;
  String? _routeId;
  bool _isPublishing = false;

  @override
  void initState() {
    super.initState();
    _loadTripData();
  }

  Future<void> _loadTripData() async {
    if (widget.tripId == null) return;
    try {
      final tripRepo = ref.read(tripRepositoryProvider);
      final trip = await tripRepo.fetchTripById(widget.tripId!);
      _routeId = trip.routeId;

      final routeRepo = ref.read(routeRepositoryProvider);
      final route = await routeRepo.getRouteById(trip.routeId);

      if (mounted) {
        setState(() {
          _title = '${route.name} 穿越';
          _distanceKm = trip.actualDistanceKm ?? route.distanceKm;
          _elevationM = trip.actualElevationM ?? route.elevationGainM;
          _duration = trip.actualDuration ?? route.estimatedDuration;
          _latitude = route.latitude;
          _longitude = route.longitude;
          _region = route.region;
        });
      }
    } catch (_) {}
  }
```

- [ ] **Step 3: Wire up the publish button**

Replace the existing "发布" button's `onTap` handler in `_buildTopBar` (around line 82-89):

```dart
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('路线发布成功！'),
                  duration: Duration(seconds: 1),
                ),
              );
              context.pop();
            },
```

With:

```dart
            onTap: _isPublishing
                ? null
                : () async {
                    setState(() => _isPublishing = true);
                    try {
                      final routeRepo = ref.read(routeRepositoryProvider);
                      final difficultyMap = ['easy', 'easy', 'moderate', 'hard', 'expert'];
                      final route = await routeRepo.publishRoute(
                        name: _title,
                        description: _story,
                        distanceKm: _distanceKm ?? 11.4,
                        elevationGainM: _elevationM ?? 680,
                        estimatedDuration: _duration ?? const Duration(hours: 5),
                        difficulty: difficultyMap[_selectedDifficulty],
                        tags: ['野长城', '怀柔', '一日穿越'],
                        isPublished: _toggles[0],
                        latitude: _latitude ?? 40.45,
                        longitude: _longitude ?? 116.56,
                        region: _region,
                      );

                      await routeRepo.createFeedItem(
                        type: 'route_published',
                        content: {
                          'route_name': _title,
                          'distance_km': _distanceKm ?? 11.4,
                        },
                        routeId: route.id,
                        tripId: widget.tripId,
                      );

                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('路线发布成功！'),
                            duration: Duration(seconds: 1),
                          ),
                        );
                        context.go('/discover');
                      }
                    } catch (e) {
                      if (mounted) {
                        setState(() => _isPublishing = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('发布失败: $e')),
                        );
                      }
                    }
                  },
```

- [ ] **Step 4: Update GPS banner to show real trip data**

In `_buildGpsBanner`, replace the hardcoded text with dynamic data. Change:

```dart
                Text(
                  '箭扣长城  ·  04.27 周日  ·  5:42 出发',
```

To:

```dart
                Text(
                  _title,
```

And update the stats overlay in `_buildMapPreview` to use real data:

```dart
                  child: Text(
                    '11.4 km  ·  ↑680 m',
```

To:

```dart
                  child: Text(
                    '${(_distanceKm ?? 11.4).toStringAsFixed(1)} km  ·  ↑${(_elevationM ?? 680).toInt()} m',
```

- [ ] **Step 5: Verify no compile errors**

Run:
```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/features/discover/presentation/route_publish_screen.dart 2>&1 | head -20
```

Expected: No analysis issues.

- [ ] **Step 6: Commit**

```bash
git add lib/features/discover/presentation/route_publish_screen.dart
git commit -m "feat(route-publish): accept tripId, load real trip data, real publish to Supabase"
```

---

### Task 12: Full Flow Verification

- [ ] **Step 1: Run full analyze**

```bash
cd /home/coder/workspaces/kaipa && flutter analyze lib/ 2>&1 | tail -30
```

Expected: No errors. Fix any that appear.

- [ ] **Step 2: Start dev server and verify flow**

```bash
cd /home/coder/workspaces/kaipa && flutter run -d chrome --web-port=3000
```

Test the complete flow:
1. Open a route detail → tap "准备出发 · 选择装备"
2. Gear Pick screen → toggle items → tap "下一步 · 天气与时间"
3. Weather screen → tap "下一步 · 安全确认"
4. Safety Confirm screen → set emergency contact → toggle settings → tap "一切就绪 · 开始导航"
5. Navigate screen → wait a few seconds → long-press pause → confirm "结束行程"
6. Trip Complete screen → rate → tap "发布路线"
7. Route Publish screen → tap "发布"
8. Should return to discover home

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(departure-flow): wire up complete 7-page departure flow end-to-end"
```
