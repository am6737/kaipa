# Gear Category & Preset Management Entries

## Problem

The gear library screen has no entry point to the existing category management screen, and gear presets are hardcoded demo data with no backend or CRUD capability.

## Scope

Two changes:

1. **Category management entry** — add navigation from gear library to the existing `CategoryManagementScreen` at `/gear/categories/manage`
2. **Preset management** — build the full feature: database tables, models, repository, UI screens, and replace the hardcoded demo presets with real data

---

## 1. Category Management Entry

Minimal change. Add a「管理」text button next to the「分类」section title in `gear_library_screen.dart`. On tap, navigate to `/gear/categories/manage`.

No new files, no new routes — everything already exists.

---

## 2. Preset Management

### 2.1 Database

New migration file: `20260430000003_gear_presets.sql`

```sql
-- gear_presets: user's named gear loadouts
CREATE TABLE gear_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gear_presets_user ON gear_presets(user_id);
ALTER TABLE gear_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own presets"
  ON gear_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own presets"
  ON gear_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own presets"
  ON gear_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own presets"
  ON gear_presets FOR DELETE USING (auth.uid() = user_id);

-- gear_preset_items: join table linking presets to gear items
CREATE TABLE gear_preset_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id  uuid NOT NULL REFERENCES gear_presets(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset_id, item_id)
);

CREATE INDEX idx_gear_preset_items_preset ON gear_preset_items(preset_id);
ALTER TABLE gear_preset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own preset items"
  ON gear_preset_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
CREATE POLICY "Users add to own presets"
  ON gear_preset_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
CREATE POLICY "Users remove from own presets"
  ON gear_preset_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM gear_presets WHERE id = preset_id AND user_id = auth.uid()));
```

### 2.2 Data Model

New file: `lib/features/gear/domain/gear_preset_model.dart`

```dart
class GearPresetModel {
  final String id;
  final String userId;
  final String name;
  final DateTime createdAt;
  final int itemCount;      // aggregated from join table
  final double totalWeightG; // aggregated from gear_items

  factory GearPresetModel.fromMap(Map<String, dynamic> map);
}
```

### 2.3 Repository Methods

Add to `gear_repository.dart`:

- `getUserPresets()` — query `gear_presets` with item count + total weight via a Supabase RPC or client-side aggregation
- `createPreset(String name)` → returns new preset
- `renamePreset(String id, String name)`
- `deletePreset(String id)`
- `getPresetItems(String presetId)` → returns `List<GearItemModel>`
- `addItemToPreset(String presetId, String itemId)`
- `removeItemFromPreset(String presetId, String itemId)`

New Riverpod providers:
- `gearPresetsProvider` — `FutureProvider<List<GearPresetModel>>`
- `presetItemsProvider` — `FutureProvider.family<List<GearItemModel>, String>`

### 2.4 Routes

Add two new routes under the gear shell branch in `app_router.dart`:

```
/gear/presets/manage     → PresetManagementScreen
/gear/preset/:id         → PresetDetailScreen
```

### 2.5 UI Screens

#### Gear Library Screen Changes (`gear_library_screen.dart`)

1. Replace `_DemoPreset` class and hardcoded `presets` list with `ref.watch(gearPresetsProvider)`
2. Add「管理」button next to「装备预设」title → navigates to `/gear/presets/manage`
3. Add「管理」button next to「分类」title → navigates to `/gear/categories/manage`
4. Preset cards show real `itemCount` and `totalWeightG` data
5. Handle empty state when user has no presets

#### Preset Management Screen (new: `preset_management_screen.dart`)

- AppBar: title「预设管理」
- List of preset cards with name, item count, total weight
- Swipe-to-delete or long-press context menu with delete confirmation
- Tap to rename (inline edit or bottom sheet)
- FAB or AppBar action to create new preset (bottom sheet with name input)
- Tap a preset card → navigate to preset detail

#### Preset Detail Screen (new: `preset_detail_screen.dart`)

- AppBar: preset name as title, with edit/rename action
- List of gear items currently in the preset (show name, category, weight)
- Swipe-to-remove an item from preset
- FAB to add items → opens a bottom sheet showing all user gear items with checkboxes, filtered by category tabs
- Empty state when no items added yet

#### Create Preset Sheet (new widget: `create_preset_sheet.dart`)

- Text field for preset name (required, max 20 chars)
- Validate against duplicate names
- Creates preset via repository, invalidates providers

#### Add Items to Preset Sheet (new widget: `add_preset_items_sheet.dart`)

- Shows all user gear items grouped by category
- Checkbox selection (items already in preset are pre-checked)
- Confirm button adds/removes items in batch
- Invalidates preset items provider on save

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260430000003_gear_presets.sql` | New migration |
| `lib/features/gear/domain/gear_preset_model.dart` | New model |
| `lib/features/gear/data/gear_repository.dart` | Add preset methods + providers |
| `lib/core/router/app_router.dart` | Add 2 new routes |
| `lib/features/gear/presentation/gear_library_screen.dart` | Add management buttons, use real preset data |
| `lib/features/gear/presentation/preset_management_screen.dart` | New screen |
| `lib/features/gear/presentation/preset_detail_screen.dart` | New screen |
| `lib/features/gear/presentation/widgets/create_preset_sheet.dart` | New widget |
| `lib/features/gear/presentation/widgets/add_preset_items_sheet.dart` | New widget |

## Constraints

- Follow existing design token usage (KaipaColors, KaipaRadius, KaipaSpace)
- Follow existing repository pattern (Supabase client + Riverpod providers)
- Follow existing navigation pattern (GoRouter with `context.go()` / `context.push()`)
- Max 20 presets per user (soft limit, enforced in UI)
- Preset names: max 20 characters, no duplicates per user
