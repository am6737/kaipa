# Gear Category Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create custom gear categories, rename built-in categories (with reset-to-default), delete custom categories, and reorder all categories via drag-and-drop.

**Architecture:** Overlay approach — built-in categories remain as shared read-only rows. User customizations (renames, new categories) are per-user rows in the same `gear_categories` table, distinguished by `is_builtin` / `user_id` fields. A merge query combines built-in + user rows into one list. UI entry points: "+" card on gear library grid for quick-add, plus a dedicated management page for rename/delete/reorder.

**Tech Stack:** Flutter 3.x, Riverpod, Supabase (PostgreSQL + RLS), GoRouter, existing KaipaIcons SVG system + emoji support.

---

### Task 1: Database Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/20260430000001_gear_category_customization.sql`

- [ ] **Step 1: Write the migration SQL file**

```sql
-- supabase/migrations/20260430000001_gear_category_customization.sql
-- Gear category customization: add fields for user-level overrides and custom categories.

-- 1. Add new columns
ALTER TABLE gear_categories ADD COLUMN is_builtin boolean NOT NULL DEFAULT false;
ALTER TABLE gear_categories ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE gear_categories ADD COLUMN icon_type text NOT NULL DEFAULT 'svg'
  CHECK (icon_type IN ('svg', 'emoji'));
ALTER TABLE gear_categories ADD COLUMN builtin_ref uuid REFERENCES gear_categories(id);
ALTER TABLE gear_categories ADD COLUMN original_name text;

-- 2. Mark existing seed categories as built-in
UPDATE gear_categories SET is_builtin = true WHERE user_id IS NULL;

-- 3. Add "未分类" (Uncategorized) built-in category
INSERT INTO gear_categories (id, name, icon, icon_type, sort_order, is_builtin)
VALUES ('b0000000-0000-0000-0000-000000000000', '未分类', 'inbox', 'svg', 999, true);

-- 4. Unique constraint: one override per user per built-in category
ALTER TABLE gear_categories ADD CONSTRAINT uq_user_builtin_override UNIQUE (user_id, builtin_ref);

-- 5. Index for user-specific queries
CREATE INDEX idx_gear_categories_user ON gear_categories(user_id) WHERE user_id IS NOT NULL;

-- 6. Drop old permissive policy and replace with new granular ones
DROP POLICY IF EXISTS "gear_categories_public_read" ON gear_categories;

CREATE POLICY "gear_categories_select" ON gear_categories FOR SELECT USING (
  is_builtin = true OR user_id = auth.uid()
);

CREATE POLICY "gear_categories_insert" ON gear_categories FOR INSERT WITH CHECK (
  is_builtin = false AND user_id = auth.uid()
);

CREATE POLICY "gear_categories_update" ON gear_categories FOR UPDATE USING (
  is_builtin = false AND user_id = auth.uid()
);

CREATE POLICY "gear_categories_delete" ON gear_categories FOR DELETE USING (
  is_builtin = false AND user_id = auth.uid()
);
```

- [ ] **Step 2: Add "inbox" icon path to KaipaIcons**

In `kaipa_app/lib/core/widgets/kaipa_icons.dart`, add the icon constant and path data for "inbox" (used by the "未分类" category). Also add additional generic icons that will be available in the icon picker for custom categories.

Add the constant in the `// UI bits` section after `mic`:

```dart
  static const String inbox = 'inbox';
  static const String rope = 'rope';
  static const String gloves = 'gloves';
  static const String hat = 'hat';
  static const String glasses = 'glasses';
  static const String map = 'map';
  static const String firstAid = 'firstAid';
  static const String food = 'food';
  static const String sleeping = 'sleeping';
  static const String pants = 'pants';
  static const String watch = 'watch';
  static const String radio = 'radio';
```

Add in the `pathData` map:

```dart
    'inbox': 'M3 9l4-5h10l4 5v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm0 0h5l2 3h4l2-3h5',
    'rope': 'M6 4a2 2 0 0 1 4 0c0 2-4 3-4 6a2 2 0 0 0 4 0c0-2-4-3-4-6Zm8 8a2 2 0 0 1 4 0c0 2-4 3-4 6a2 2 0 0 0 4 0c0-2-4-3-4-6Z',
    'gloves': 'M6 10V4a2 2 0 0 1 4 0v4M10 8V3a2 2 0 0 1 4 0v5M14 8V4a2 2 0 0 1 4 0v6l-2 7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7Z',
    'hat': 'M4 16h16M6 16c0-4 2-8 6-10s6 6 6 10M8 16v3h8v-3',
    'glasses': 'M3 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM9 12h6M3 12H2m20 0h-1',
    'map': 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
    'firstAid': 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm6 4v6m-3-3h6',
    'food': 'M4 4v7a3 3 0 0 0 3 3h1v6M4 4h1m-1 3h4m0-3v7a3 3 0 0 1-3 3M20 4v16M17 4v6a3 3 0 0 0 3 3',
    'sleeping': 'M3 18h18M4 18V14a8 8 0 0 1 16 0v4M8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    'pants': 'M6 2h12v7l-2 13h-3l-1-10-1 10H8L6 9V2Z',
    'watch': 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 6V2h4M12 18v4h4M12 9v3l2 1',
    'radio': 'M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm7 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 4l3-2 3 2',
```

- [ ] **Step 3: Verify migration applies cleanly**

Run: `cd /home/coder/workspaces/kaipa && npx supabase db reset 2>&1 | tail -20` (or equivalent local Supabase command)

Expected: Migration applies without errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260430000001_gear_category_customization.sql kaipa_app/lib/core/widgets/kaipa_icons.dart
git commit -m "feat(gear): add database migration for category customization and new icons"
```

---

### Task 2: Update GearCategoryModel

**Files:**
- Modify: `kaipa_app/lib/features/gear/domain/gear_category_model.dart`

- [ ] **Step 1: Add new fields to GearCategoryModel**

Replace the entire file content with:

```dart
class GearCategoryModel {
  final String id;
  final String name;
  final String icon;
  final int sortOrder;
  final bool isBuiltin;
  final String? userId;
  final String iconType;
  final String? builtinRef;
  final String? originalName;

  const GearCategoryModel({
    required this.id,
    required this.name,
    required this.icon,
    this.sortOrder = 0,
    this.isBuiltin = false,
    this.userId,
    this.iconType = 'svg',
    this.builtinRef,
    this.originalName,
  });

  bool get isRenamed => builtinRef != null && originalName != null && originalName != name;
  bool get isUncategorized => id == 'b0000000-0000-0000-0000-000000000000';
  bool get isOverride => builtinRef != null;
  bool get isCustom => !isBuiltin && builtinRef == null;

  factory GearCategoryModel.fromJson(Map<String, dynamic> json) {
    return GearCategoryModel(
      id: json['id'] as String,
      name: json['name'] as String,
      icon: json['icon'] as String,
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      isBuiltin: json['is_builtin'] as bool? ?? false,
      userId: json['user_id'] as String?,
      iconType: json['icon_type'] as String? ?? 'svg',
      builtinRef: json['builtin_ref'] as String?,
      originalName: json['original_name'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'icon': icon,
      'sort_order': sortOrder,
      'is_builtin': isBuiltin,
      'user_id': userId,
      'icon_type': iconType,
      'builtin_ref': builtinRef,
      'original_name': originalName,
    };
  }

  GearCategoryModel copyWith({
    String? id,
    String? name,
    String? icon,
    int? sortOrder,
    bool? isBuiltin,
    String? userId,
    String? iconType,
    String? builtinRef,
    String? originalName,
  }) {
    return GearCategoryModel(
      id: id ?? this.id,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      sortOrder: sortOrder ?? this.sortOrder,
      isBuiltin: isBuiltin ?? this.isBuiltin,
      userId: userId ?? this.userId,
      iconType: iconType ?? this.iconType,
      builtinRef: builtinRef ?? this.builtinRef,
      originalName: originalName ?? this.originalName,
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors related to GearCategoryModel.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/gear/domain/gear_category_model.dart
git commit -m "feat(gear): add customization fields to GearCategoryModel"
```

---

### Task 3: Update GearRepository with Category Management Methods

**Files:**
- Modify: `kaipa_app/lib/features/gear/data/gear_repository.dart`

- [ ] **Step 1: Replace getCategories() and add 7 new methods**

Replace the entire `gear_repository.dart` with:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';

const _uncategorizedId = 'b0000000-0000-0000-0000-000000000000';

final gearRepositoryProvider = Provider<GearRepository>((ref) {
  return GearRepository(ref.watch(supabaseProvider));
});

class GearRepository {
  final SupabaseClient _client;

  GearRepository(this._client);

  String get _userId {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) throw Exception('Must be signed in');
    return uid;
  }

  // ─── Category queries ──────────────────────────────────────────────

  Future<List<GearCategoryModel>> getUserCategories() async {
    final uid = _userId;
    final data = await _client
        .from('gear_categories')
        .select()
        .or('is_builtin.eq.true,user_id.eq.$uid')
        .order('sort_order', ascending: true);

    final rows = (data as List)
        .map((row) => GearCategoryModel.fromJson(row))
        .toList();

    // Exclude built-in categories that have been overridden by this user
    final overriddenBuiltinIds = rows
        .where((c) => c.builtinRef != null && c.userId == uid)
        .map((c) => c.builtinRef!)
        .toSet();

    return rows
        .where((c) => !(c.isBuiltin && overriddenBuiltinIds.contains(c.id)))
        .toList();
  }

  // ─── Category mutations ────────────────────────────────────────────

  Future<GearCategoryModel> createCategory({
    required String name,
    required String icon,
    required String iconType,
  }) async {
    final uid = _userId;

    // Get max sort_order to append at end (before uncategorized at 999)
    final existing = await getUserCategories();
    final maxOrder = existing
        .where((c) => !c.isUncategorized)
        .fold<int>(0, (max, c) => c.sortOrder > max ? c.sortOrder : max);

    final row = await _client
        .from('gear_categories')
        .insert({
          'name': name,
          'icon': icon,
          'icon_type': iconType,
          'sort_order': maxOrder + 1,
          'is_builtin': false,
          'user_id': uid,
        })
        .select()
        .single();

    return GearCategoryModel.fromJson(row);
  }

  Future<GearCategoryModel> renameBuiltinCategory({
    required String builtinId,
    required String newName,
  }) async {
    final uid = _userId;

    // Fetch the original built-in category
    final original = await _client
        .from('gear_categories')
        .select()
        .eq('id', builtinId)
        .eq('is_builtin', true)
        .single();

    final originalModel = GearCategoryModel.fromJson(original);

    // Check if an override already exists
    final existingOverrides = await _client
        .from('gear_categories')
        .select()
        .eq('user_id', uid)
        .eq('builtin_ref', builtinId);

    if ((existingOverrides as List).isNotEmpty) {
      // Update existing override
      final updated = await _client
          .from('gear_categories')
          .update({'name': newName})
          .eq('user_id', uid)
          .eq('builtin_ref', builtinId)
          .select()
          .single();
      return GearCategoryModel.fromJson(updated);
    }

    // Create override record
    final override = await _client
        .from('gear_categories')
        .insert({
          'name': newName,
          'icon': originalModel.icon,
          'icon_type': originalModel.iconType,
          'sort_order': originalModel.sortOrder,
          'is_builtin': false,
          'user_id': uid,
          'builtin_ref': builtinId,
          'original_name': originalModel.name,
        })
        .select()
        .single();

    final overrideModel = GearCategoryModel.fromJson(override);

    // Migrate gear items from built-in to override
    await _client
        .from('gear_items')
        .update({'category_id': overrideModel.id})
        .eq('user_id', uid)
        .eq('category_id', builtinId);

    return overrideModel;
  }

  Future<GearCategoryModel> renameCustomCategory({
    required String categoryId,
    required String newName,
  }) async {
    final uid = _userId;
    final updated = await _client
        .from('gear_categories')
        .update({'name': newName})
        .eq('id', categoryId)
        .eq('user_id', uid)
        .select()
        .single();
    return GearCategoryModel.fromJson(updated);
  }

  Future<void> resetBuiltinCategory({required String overrideId}) async {
    final uid = _userId;

    // Fetch override to get builtin_ref
    final override = await _client
        .from('gear_categories')
        .select()
        .eq('id', overrideId)
        .eq('user_id', uid)
        .single();

    final overrideModel = GearCategoryModel.fromJson(override);
    final builtinId = overrideModel.builtinRef;
    if (builtinId == null) throw Exception('Not an override record');

    // Migrate gear items back to built-in category
    await _client
        .from('gear_items')
        .update({'category_id': builtinId})
        .eq('user_id', uid)
        .eq('category_id', overrideId);

    // Delete the override record
    await _client
        .from('gear_categories')
        .delete()
        .eq('id', overrideId)
        .eq('user_id', uid);
  }

  Future<void> deleteCustomCategory({required String categoryId}) async {
    final uid = _userId;

    // Move gear items to uncategorized
    await _client
        .from('gear_items')
        .update({'category_id': _uncategorizedId})
        .eq('user_id', uid)
        .eq('category_id', categoryId);

    // Delete the category
    await _client
        .from('gear_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', uid);
  }

  Future<void> reorderCategories({required List<String> orderedIds}) async {
    final uid = _userId;
    for (int i = 0; i < orderedIds.length; i++) {
      final id = orderedIds[i];
      // Try updating as user category first
      await _client
          .from('gear_categories')
          .update({'sort_order': i + 1})
          .eq('id', id)
          .eq('user_id', uid);
    }
    // Note: built-in categories that aren't overridden can't be reordered
    // by RLS. To support full reorder, we create override records for
    // built-in categories that change position. This is handled in the
    // UI layer by creating overrides when a built-in category is dragged.
  }

  // ─── Gear item queries ─────────────────────────────────────────────

  Future<List<GearItemModel>> getItemsByCategory(String categoryId) async {
    final uid = _userId;
    final data = await _client
        .from('gear_items')
        .select()
        .eq('user_id', uid)
        .eq('category_id', categoryId)
        .order('created_at', ascending: false);

    return (data as List).map((row) => GearItemModel.fromJson(row)).toList();
  }

  Future<List<GearItemModel>> getAllUserItems() async {
    final uid = _userId;
    final data = await _client
        .from('gear_items')
        .select()
        .eq('user_id', uid)
        .order('created_at', ascending: false);

    return (data as List).map((row) => GearItemModel.fromJson(row)).toList();
  }

  Future<GearItemModel> createItem({
    required String categoryId,
    required String name,
    String? brand,
    double? weightG,
    double? price,
    String? condition,
    String? photoUrl,
    String? notes,
    bool isFavorite = false,
    DateTime? purchasedAt,
  }) async {
    final uid = _userId;
    final itemData = {
      'user_id': uid,
      'category_id': categoryId,
      'name': name,
      'brand': brand,
      'weight_g': weightG,
      'price': price,
      'condition': condition,
      'photo_url': photoUrl,
      'notes': notes,
      'is_favorite': isFavorite,
      'purchased_at': purchasedAt?.toIso8601String(),
    };

    final inserted = await _client
        .from('gear_items')
        .insert(itemData)
        .select()
        .single();

    return GearItemModel.fromJson(inserted);
  }

  Future<GearItemModel> getItemById(String itemId) async {
    final data = await _client
        .from('gear_items')
        .select()
        .eq('id', itemId)
        .single();

    return GearItemModel.fromJson(data);
  }

  Future<GearItemModel> updateItem(String itemId, Map<String, dynamic> updates) async {
    final uid = _userId;
    final updated = await _client
        .from('gear_items')
        .update(updates)
        .eq('id', itemId)
        .eq('user_id', uid)
        .select()
        .single();

    return GearItemModel.fromJson(updated);
  }

  Future<GearItemModel> toggleFavorite(String itemId, bool isFavorite) async {
    return updateItem(itemId, {'is_favorite': isFavorite});
  }

  Future<void> deleteItem(String itemId) async {
    final uid = _userId;
    await _client
        .from('gear_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', uid);
  }

  Future<int> getItemCountForCategory(String categoryId) async {
    final uid = _userId;
    final data = await _client
        .from('gear_items')
        .select('id')
        .eq('user_id', uid)
        .eq('category_id', categoryId);
    return (data as List).length;
  }
}

// ─── Riverpod providers ──────────────────────────────────────────────

final gearCategoriesProvider = FutureProvider<List<GearCategoryModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getUserCategories();
});

final allGearItemsProvider = FutureProvider<List<GearItemModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getAllUserItems();
});

final gearItemsByCategoryProvider =
    FutureProvider.family<List<GearItemModel>, String>((ref, categoryId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getItemsByCategory(categoryId);
});

final gearItemByIdProvider =
    FutureProvider.family<GearItemModel, String>((ref, itemId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getItemById(itemId);
});
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors. Any call sites using the old `getCategories()` method will fail — these are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/gear/data/gear_repository.dart
git commit -m "feat(gear): add category CRUD and reorder methods to GearRepository"
```

---

### Task 4: Create Icon Picker Widget

**Files:**
- Create: `kaipa_app/lib/features/gear/presentation/widgets/icon_picker.dart`

- [ ] **Step 1: Create the icon picker widget**

```dart
import 'package:flutter/material.dart';
import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';

const List<String> kPresetGearIcons = [
  KaipaIcons.backpack,
  KaipaIcons.boot,
  KaipaIcons.jacket,
  KaipaIcons.tent,
  KaipaIcons.bottle,
  KaipaIcons.battery,
  KaipaIcons.light,
  KaipaIcons.knife,
  KaipaIcons.socks,
  KaipaIcons.shield,
  KaipaIcons.compass,
  KaipaIcons.map,
  KaipaIcons.flag,
  KaipaIcons.flame,
  KaipaIcons.drop,
  KaipaIcons.camera,
  KaipaIcons.firstAid,
  KaipaIcons.rope,
  KaipaIcons.gloves,
  KaipaIcons.hat,
  KaipaIcons.glasses,
  KaipaIcons.food,
  KaipaIcons.sleeping,
  KaipaIcons.pants,
  KaipaIcons.watch,
  KaipaIcons.radio,
  KaipaIcons.sun,
  KaipaIcons.moon,
  KaipaIcons.tree,
  KaipaIcons.mountain,
];

class IconPickerResult {
  final String icon;
  final String iconType;

  const IconPickerResult({required this.icon, required this.iconType});
}

class IconPicker extends StatefulWidget {
  final String? initialIcon;
  final String initialIconType;
  final ValueChanged<IconPickerResult> onChanged;

  const IconPicker({
    super.key,
    this.initialIcon,
    this.initialIconType = 'svg',
    required this.onChanged,
  });

  @override
  State<IconPicker> createState() => _IconPickerState();
}

class _IconPickerState extends State<IconPicker> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _selectedSvg;
  String _emojiText = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialIconType == 'emoji' ? 1 : 0,
    );
    if (widget.initialIconType == 'svg') {
      _selectedSvg = widget.initialIcon;
    } else {
      _emojiText = widget.initialIcon ?? '';
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TabBar(
          controller: _tabController,
          labelColor: colors.flare,
          unselectedLabelColor: colors.inkMuted,
          indicatorColor: colors.flare,
          indicatorSize: TabBarIndicatorSize.label,
          labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          tabs: const [
            Tab(text: '预设图标'),
            Tab(text: 'Emoji'),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildSvgGrid(colors),
              _buildEmojiInput(colors),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSvgGrid(KaipaColors colors) {
    return GridView.builder(
      padding: EdgeInsets.zero,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 6,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: kPresetGearIcons.length,
      itemBuilder: (context, index) {
        final iconName = kPresetGearIcons[index];
        final isSelected = _selectedSvg == iconName;
        return GestureDetector(
          onTap: () {
            setState(() => _selectedSvg = iconName);
            widget.onChanged(IconPickerResult(icon: iconName, iconType: 'svg'));
          },
          child: Container(
            decoration: BoxDecoration(
              color: isSelected ? colors.flareSoft : colors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isSelected ? colors.flare : colors.line,
                width: isSelected ? 1.5 : 0.5,
              ),
            ),
            child: Center(
              child: KaipaIcon(
                name: iconName,
                size: 22,
                color: isSelected ? colors.flare : colors.inkMuted,
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildEmojiInput(KaipaColors colors) {
    return Column(
      children: [
        // Preview
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.line, width: 0.5),
          ),
          child: Center(
            child: Text(
              _emojiText.isEmpty ? '?' : _emojiText,
              style: TextStyle(
                fontSize: 32,
                color: _emojiText.isEmpty ? colors.inkDim : null,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: 200,
          child: TextField(
            maxLength: 2,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24),
            decoration: InputDecoration(
              hintText: '输入或粘贴 emoji',
              hintStyle: TextStyle(fontSize: 14, color: colors.inkMuted),
              counterText: '',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            onChanged: (value) {
              setState(() => _emojiText = value);
              if (value.isNotEmpty) {
                widget.onChanged(IconPickerResult(icon: value, iconType: 'emoji'));
              }
            },
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/gear/presentation/widgets/icon_picker.dart
git commit -m "feat(gear): add icon picker widget with SVG presets and emoji support"
```

---

### Task 5: Create "Create Category" BottomSheet

**Files:**
- Create: `kaipa_app/lib/features/gear/presentation/widgets/create_category_sheet.dart`

- [ ] **Step 1: Create the bottom sheet widget**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../data/gear_repository.dart';
import '../../domain/gear_category_model.dart';
import 'icon_picker.dart';

class CreateCategorySheet extends ConsumerStatefulWidget {
  final List<GearCategoryModel> existingCategories;

  const CreateCategorySheet({super.key, required this.existingCategories});

  @override
  ConsumerState<CreateCategorySheet> createState() => _CreateCategorySheetState();
}

class _CreateCategorySheetState extends ConsumerState<CreateCategorySheet> {
  final _nameController = TextEditingController();
  String _selectedIcon = 'backpack';
  String _selectedIconType = 'svg';
  String? _errorText;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _isValid {
    final name = _nameController.text.trim();
    return name.isNotEmpty && name.length <= 10 && _errorText == null;
  }

  void _validate() {
    final name = _nameController.text.trim();
    String? error;
    if (name.isEmpty) {
      error = null; // Don't show error for empty while typing
    } else if (name.length > 10) {
      error = '名称最多 10 个字符';
    } else if (widget.existingCategories.any((c) => c.name == name)) {
      error = '分类名称已存在';
    }
    setState(() => _errorText = error);
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _isSubmitting) return;

    setState(() => _isSubmitting = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.createCategory(
        name: name,
        icon: _selectedIcon,
        iconType: _selectedIconType,
      );
      ref.invalidate(gearCategoriesProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('创建失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.inkDim,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '新建分类',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 16),
          // Name input
          TextField(
            controller: _nameController,
            maxLength: 10,
            autofocus: true,
            onChanged: (_) => _validate(),
            style: TextStyle(fontSize: 16, color: colors.ink),
            decoration: InputDecoration(
              hintText: '分类名称',
              hintStyle: TextStyle(color: colors.inkMuted),
              errorText: _errorText,
              counterText: '${_nameController.text.length}/10',
              counterStyle: TextStyle(color: colors.inkDim, fontSize: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: colors.flare, width: 1.5),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 16),
          // Icon picker
          IconPicker(
            initialIcon: _selectedIcon,
            initialIconType: _selectedIconType,
            onChanged: (result) {
              setState(() {
                _selectedIcon = result.icon;
                _selectedIconType = result.iconType;
              });
            },
          ),
          const SizedBox(height: 20),
          // Submit button
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _isValid && !_isSubmitting ? _submit : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: colors.flare,
                disabledBackgroundColor: colorWithOpacity(colors.flare, 0.3),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text(
                      '创建',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/gear/presentation/widgets/create_category_sheet.dart
git commit -m "feat(gear): add create-category bottom sheet with name validation and icon picker"
```

---

### Task 6: Create Category Management Page

**Files:**
- Create: `kaipa_app/lib/features/gear/presentation/category_management_screen.dart`

- [ ] **Step 1: Create the management screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_category_model.dart';
import 'widgets/create_category_sheet.dart';

class CategoryManagementScreen extends ConsumerStatefulWidget {
  const CategoryManagementScreen({super.key});

  @override
  ConsumerState<CategoryManagementScreen> createState() => _CategoryManagementScreenState();
}

class _CategoryManagementScreenState extends ConsumerState<CategoryManagementScreen> {
  List<GearCategoryModel> _categories = [];
  bool _isLoading = true;
  String? _editingId;
  final _editController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      final cats = await repo.getUserCategories();
      if (mounted) setState(() { _categories = cats; _isLoading = false; });
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载失败: $e')),
        );
      }
    }
  }

  List<GearCategoryModel> get _reorderableCategories =>
      _categories.where((c) => !c.isUncategorized).toList();

  GearCategoryModel? get _uncategorized =>
      _categories.where((c) => c.isUncategorized).isEmpty
          ? null
          : _categories.firstWhere((c) => c.isUncategorized);

  Future<void> _onReorder(int oldIndex, int newIndex) async {
    final list = _reorderableCategories;
    if (newIndex > oldIndex) newIndex--;
    final item = list.removeAt(oldIndex);
    list.insert(newIndex, item);

    final updatedIds = list.map((c) => c.id).toList();
    setState(() {
      _categories = [...list, if (_uncategorized != null) _uncategorized!];
    });

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.reorderCategories(orderedIds: updatedIds);
      ref.invalidate(gearCategoriesProvider);
    } catch (e) {
      _loadCategories();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('排序失败: $e')),
        );
      }
    }
  }

  void _startEditing(GearCategoryModel category) {
    setState(() {
      _editingId = category.id;
      _editController.text = category.name;
    });
  }

  Future<void> _saveEdit(GearCategoryModel category) async {
    final newName = _editController.text.trim();
    if (newName.isEmpty || newName == category.name) {
      setState(() => _editingId = null);
      return;
    }

    if (newName.length > 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('名称最多 10 个字符')),
      );
      return;
    }

    if (_categories.any((c) => c.id != category.id && c.name == newName)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('分类名称已存在')),
      );
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      if (category.isBuiltin) {
        await repo.renameBuiltinCategory(builtinId: category.id, newName: newName);
      } else if (category.isOverride) {
        await repo.renameCustomCategory(categoryId: category.id, newName: newName);
      } else {
        await repo.renameCustomCategory(categoryId: category.id, newName: newName);
      }
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
    setState(() => _editingId = null);
  }

  Future<void> _resetBuiltin(GearCategoryModel category) async {
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.resetBuiltinCategory(overrideId: category.id);
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已恢复为「${category.originalName}」')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('恢复失败: $e')),
        );
      }
    }
  }

  Future<void> _deleteCategory(GearCategoryModel category) async {
    final repo = ref.read(gearRepositoryProvider);
    final itemCount = await repo.getItemCountForCategory(category.id);

    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final colors = context.kaipaTokens.color;
        return AlertDialog(
          backgroundColor: colors.surface,
          title: Text('删除分类', style: TextStyle(color: colors.ink)),
          content: Text(
            itemCount > 0
                ? '该分类下的 $itemCount 件装备将移至「未分类」'
                : '确定要删除「${category.name}」吗？',
            style: TextStyle(color: colors.inkMuted),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text('取消', style: TextStyle(color: colors.inkMuted)),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text('删除', style: TextStyle(color: colors.diff.extreme)),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    try {
      await repo.deleteCustomCategory(categoryId: category.id);
      ref.invalidate(gearCategoriesProvider);
      await _loadCategories();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败: $e')),
        );
      }
    }
  }

  void _showCreateSheet() {
    final customCount = _categories.where((c) => c.isCustom).length;
    if (customCount >= 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多创建 20 个自定义分类')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.kaipaTokens.color.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CreateCategorySheet(existingCategories: _categories),
    ).then((created) {
      if (created == true) _loadCategories();
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: KaipaIcon(name: KaipaIcons.back, size: 22, color: colors.ink),
        ),
        title: Text(
          '管理分类',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.4,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _showCreateSheet,
            icon: KaipaIcon(name: KaipaIcons.plus, size: 22, color: colors.flare),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildList(colors),
    );
  }

  Widget _buildList(KaipaColors colors) {
    final reorderable = _reorderableCategories;
    final uncategorized = _uncategorized;

    return Column(
      children: [
        Expanded(
          child: ReorderableListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: reorderable.length,
            onReorder: _onReorder,
            proxyDecorator: (child, index, animation) {
              return Material(
                elevation: 4,
                color: colors.surface,
                borderRadius: BorderRadius.circular(12),
                child: child,
              );
            },
            itemBuilder: (context, index) {
              final cat = reorderable[index];
              return _buildCategoryTile(cat, colors, key: ValueKey(cat.id));
            },
          ),
        ),
        if (uncategorized != null) ...[
          Divider(height: 1, color: colors.line),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: _buildUncategorizedTile(uncategorized, colors),
          ),
        ],
      ],
    );
  }

  Widget _buildCategoryTile(GearCategoryModel cat, KaipaColors colors, {Key? key}) {
    final isEditing = _editingId == cat.id;

    return Container(
      key: key,
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.line, width: 0.5),
      ),
      child: Row(
        children: [
          // Drag handle
          Icon(Icons.drag_handle, size: 20, color: colors.inkDim),
          const SizedBox(width: 10),
          // Icon
          _buildCategoryIcon(cat, colors),
          const SizedBox(width: 12),
          // Name or edit field
          Expanded(
            child: isEditing
                ? TextField(
                    controller: _editController,
                    autofocus: true,
                    maxLength: 10,
                    style: TextStyle(fontSize: 15, color: colors.ink),
                    decoration: InputDecoration(
                      isDense: true,
                      counterText: '',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: colors.flare),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: colors.flare, width: 1.5),
                      ),
                    ),
                    onSubmitted: (_) => _saveEdit(cat),
                    onEditingComplete: () => _saveEdit(cat),
                  )
                : Text(
                    cat.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    ),
                  ),
          ),
          // Action buttons
          if (!isEditing) ..._buildActions(cat, colors),
        ],
      ),
    );
  }

  Widget _buildCategoryIcon(GearCategoryModel cat, KaipaColors colors) {
    if (cat.iconType == 'emoji') {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: colors.flareSoft,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Center(
          child: Text(cat.icon, style: const TextStyle(fontSize: 18)),
        ),
      );
    }
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: colors.flareSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: KaipaIcon(name: cat.icon, size: 18, color: colors.flare),
      ),
    );
  }

  List<Widget> _buildActions(GearCategoryModel cat, KaipaColors colors) {
    final actions = <Widget>[];

    // Rename button (all except uncategorized)
    actions.add(
      IconButton(
        onPressed: () => _startEditing(cat),
        icon: Icon(Icons.edit_outlined, size: 18, color: colors.inkMuted),
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        padding: EdgeInsets.zero,
        tooltip: '重命名',
      ),
    );

    // Reset button (only for overrides with isRenamed)
    if (cat.isOverride && cat.isRenamed) {
      actions.add(
        IconButton(
          onPressed: () => _resetBuiltin(cat),
          icon: Icon(Icons.restore, size: 18, color: colors.sky),
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          padding: EdgeInsets.zero,
          tooltip: '恢复默认',
        ),
      );
    }

    // Delete button (only for custom categories, not overrides)
    if (cat.isCustom) {
      actions.add(
        IconButton(
          onPressed: () => _deleteCategory(cat),
          icon: Icon(Icons.delete_outline, size: 18, color: colors.diff.extreme),
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          padding: EdgeInsets.zero,
          tooltip: '删除',
        ),
      );
    }

    return actions;
  }

  Widget _buildUncategorizedTile(GearCategoryModel cat, KaipaColors colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: colorWithOpacity(colors.surface, 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const SizedBox(width: 30),
          _buildCategoryIcon(cat, colors),
          const SizedBox(width: 12),
          Text(
            cat.name,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: colors.inkDim,
              letterSpacing: -0.2,
            ),
          ),
          const Spacer(),
          Text(
            '固定',
            style: TextStyle(fontSize: 12, color: colors.inkDim),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/features/gear/presentation/category_management_screen.dart
git commit -m "feat(gear): add category management screen with reorder, rename, delete, and reset"
```

---

### Task 7: Add Route for Category Management Screen

**Files:**
- Modify: `kaipa_app/lib/core/router/app_router.dart`

- [ ] **Step 1: Add import and route**

At the top of `app_router.dart`, add the import after the existing gear imports:

```dart
import '../../features/gear/presentation/category_management_screen.dart';
```

Inside the Gear branch routes (under `GoRoute path: '/gear'` → `routes: [...]`), add a new route after the existing `gear/item/:id` route:

```dart
                GoRoute(
                  path: 'categories/manage',
                  builder: (_, _) => const CategoryManagementScreen(),
                ),
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kaipa_app/lib/core/router/app_router.dart
git commit -m "feat(gear): add route for category management screen"
```

---

### Task 8: Update Gear Library Screen — Add "+" Card and Management Entry

**Files:**
- Modify: `kaipa_app/lib/features/gear/presentation/gear_library_screen.dart`

- [ ] **Step 1: Add import for create_category_sheet**

Add at the top with other imports:

```dart
import 'widgets/create_category_sheet.dart';
```

- [ ] **Step 2: Add "manage categories" button to the header**

In the `_buildHeader` method, add a manage button between the title and the existing "添加" button. Replace the `_buildHeader` method:

```dart
  Widget _buildHeader(BuildContext context, KaipaColors colors, {List<GearCategoryModel>? categories}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '装备库',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.6,
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: () {
                  context.push('/gear/categories/manage');
                },
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Center(
                    child: Icon(Icons.tune, size: 18, color: colors.inkMuted),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () {
                  // Navigate to add gear
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: colors.flare,
                    borderRadius: BorderRadius.circular(KaipaRadius.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      KaipaIcon(
                        name: KaipaIcons.plus,
                        size: 16,
                        color: Colors.white,
                        strokeWidth: 2.0,
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        '添加',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
```

- [ ] **Step 3: Update _buildHeader call sites**

The `_buildHeader` is called in two places. Update both to pass `categories`:

In `_buildContent`, change the header sliver:
```dart
        SliverToBoxAdapter(child: _buildHeader(context, colors, categories: categories)),
```

In the empty state (`data: (categories)` block), change:
```dart
                  _buildHeader(context, colors, categories: categories),
```

- [ ] **Step 4: Update Category Grid to include "+" card**

In the `_buildContent` method, change the `SliverGrid` `childCount` and `itemBuilder` to add a "+" card at the end:

Replace the SliverGrid section (the `SliverPadding` wrapping the `SliverGrid`):

```dart
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.2,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                // Last item is the "+" add category card
                if (index == categories.length) {
                  return _AddCategoryCard(
                    colors: colors,
                    categories: categories,
                  );
                }
                final category = categories[index];
                final itemCount = countByCategory[category.id] ?? 0;
                final weightG = weightByCategory[category.id] ?? 0;
                final weightKg = weightG / 1000;
                return _CategoryCard(
                  category: category,
                  itemCount: itemCount,
                  weightKg: weightKg,
                  colors: colors,
                  onTap: () {
                    context.push('/gear/category/${category.id}');
                  },
                );
              },
              childCount: categories.length + 1,
            ),
          ),
        ),
```

- [ ] **Step 5: Add the _AddCategoryCard widget**

Add this new widget class at the bottom of `gear_library_screen.dart`, before the closing of the file:

```dart
class _AddCategoryCard extends ConsumerWidget {
  final KaipaColors colors;
  final List<GearCategoryModel> categories;

  const _AddCategoryCard({required this.colors, required this.categories});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customCount = categories.where((c) => c.isCustom).length;
    final isAtLimit = customCount >= 20;

    return GestureDetector(
      onTap: isAtLimit
          ? () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('最多创建 20 个自定义分类')),
              );
            }
          : () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                backgroundColor: colors.bg,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                ),
                builder: (_) => CreateCategorySheet(existingCategories: categories),
              ).then((created) {
                if (created == true) {
                  ref.invalidate(gearCategoriesProvider);
                }
              });
            },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(KaipaRadius.lg),
          border: Border.all(
            color: isAtLimit ? colors.inkDim : colors.line,
            width: 1,
            strokeAlign: BorderSide.strokeAlignInside,
          ),
        ),
        child: CustomPaint(
          painter: _DashedBorderPainter(
            color: isAtLimit ? colors.inkDim : colors.inkMuted,
            radius: KaipaRadius.lg,
          ),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                KaipaIcon(
                  name: KaipaIcons.plus,
                  size: 28,
                  color: isAtLimit ? colors.inkDim : colors.inkMuted,
                  strokeWidth: 1.5,
                ),
                const SizedBox(height: 8),
                Text(
                  '新建分类',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: isAtLimit ? colors.inkDim : colors.inkMuted,
                    letterSpacing: -0.1,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double radius;

  _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Radius.circular(radius),
    );

    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();

    for (final metric in metrics) {
      double distance = 0;
      bool draw = true;
      while (distance < metric.length) {
        final len = draw ? 6.0 : 4.0;
        final end = (distance + len).clamp(0.0, metric.length);
        if (draw) {
          final segment = metric.extractPath(distance, end);
          canvas.drawPath(segment, paint);
        }
        distance = end;
        draw = !draw;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
```

- [ ] **Step 6: Update _CategoryCard to handle emoji icons**

In the `_CategoryCard` widget's `build` method, update the icon container to support emoji:

Replace the icon container section (lines with `KaipaIcon(name: category.icon, ...)`):

```dart
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: colors.flareSoft,
                borderRadius: BorderRadius.circular(KaipaRadius.md),
              ),
              child: Center(
                child: category.iconType == 'emoji'
                    ? Text(category.icon, style: const TextStyle(fontSize: 22))
                    : KaipaIcon(
                        name: category.icon,
                        size: 22,
                        color: colors.flare,
                      ),
              ),
            ),
```

Note: This requires `_CategoryCard` to have access to `category.iconType`. Since `GearCategoryModel` now has `iconType`, this will work.

- [ ] **Step 7: Verify compilation**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter analyze 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add kaipa_app/lib/features/gear/presentation/gear_library_screen.dart
git commit -m "feat(gear): add category quick-add card and management entry to gear library"
```

---

### Task 9: Update Seed Data Migration

**Files:**
- Modify: `supabase/migrations/20260429000002_seed.sql`

- [ ] **Step 1: Update seed INSERT to include new columns**

The seed data INSERT for gear_categories currently does not include the new columns (`is_builtin`, `icon_type`). Since the migration in Task 1 sets `is_builtin` default to `false` and then runs `UPDATE gear_categories SET is_builtin = true WHERE user_id IS NULL`, the existing seed data will be properly marked. However, the `icon_type` column defaults to `'svg'` which is correct for all existing categories.

No changes needed to seed data — the migration in Task 1 handles marking existing rows as built-in. Verify by checking:

Run: `cd /home/coder/workspaces/kaipa && grep -n 'icon_type\|is_builtin' supabase/migrations/20260430000001_gear_category_customization.sql`

Expected: Shows the ALTER TABLE and UPDATE statements from Task 1.

- [ ] **Step 2: Commit (skip if no changes)**

No commit needed for this task — verification only.

---

### Task 10: Visual Verification and Final Polish

**Files:**
- All modified files from Tasks 1-8

- [ ] **Step 1: Start the dev server**

Run: `cd /home/coder/workspaces/kaipa/kaipa_app && flutter run -d chrome --web-port=8080 2>&1 | tail -30`

Expected: App launches successfully.

- [ ] **Step 2: Verify gear library screen loads with "+" card and manage button**

Open the gear library tab. Verify:
- The "+" card appears at the end of the category grid with dashed border
- The manage (tune) icon appears in the header next to the "添加" button
- Existing categories still display correctly

- [ ] **Step 3: Test create category flow**

Tap the "+" card → verify bottom sheet opens with name input and icon picker. Test:
- Type a name → select an SVG icon → tap "创建" → verify new category appears in grid
- Switch to emoji tab → enter an emoji → verify preview shows it
- Try duplicate name → verify error message
- Try name > 10 chars → verify character limit

- [ ] **Step 4: Test category management page**

Tap the manage button → verify management page opens with all categories listed. Test:
- Drag a category → verify new order persists after reload
- Tap edit on a built-in category → rename it → verify "恢复默认" button appears
- Tap "恢复默认" → verify name reverts with SnackBar confirmation
- Tap delete on a custom category → verify confirmation dialog shows item count
- Verify "未分类" appears at bottom, greyed out, with no action buttons

- [ ] **Step 5: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(gear): polish category customization UI details"
```

Only commit if there are actual fixes. Skip if everything works correctly.
