# Gear Category & Preset Management Entries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add management entry points for gear categories and gear presets on the gear library screen, replacing hardcoded demo presets with a real CRUD backend.

**Architecture:** New `gear_presets` and `gear_preset_items` Supabase tables with RLS. New `GearPresetModel` domain model. Repository methods added to existing `GearRepository`. Two new screens (preset management + preset detail) and two new bottom sheets (create preset + add items). Gear library screen updated with「管理」buttons and real preset data.

**Tech Stack:** Flutter, Riverpod, Supabase, GoRouter, Kaipa design tokens

---

### Task 1: Database Migration — Preset Tables

**Files:**
- Create: `supabase/migrations/20260430000003_gear_presets.sql`

- [ ] **Step 1: Create the migration file**

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

- [ ] **Step 2: Apply migration to local Supabase**

Run: `supabase db reset` (or `supabase migration up` if preferred)
Expected: Tables `gear_presets` and `gear_preset_items` created successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260430000003_gear_presets.sql
git commit -m "feat(gear): add gear_presets and gear_preset_items tables"
```

---

### Task 2: Domain Model — GearPresetModel

**Files:**
- Create: `lib/features/gear/domain/gear_preset_model.dart`

- [ ] **Step 1: Create the model**

```dart
class GearPresetModel {
  final String id;
  final String userId;
  final String name;
  final DateTime createdAt;
  final int itemCount;
  final double totalWeightG;

  const GearPresetModel({
    required this.id,
    required this.userId,
    required this.name,
    required this.createdAt,
    this.itemCount = 0,
    this.totalWeightG = 0,
  });

  factory GearPresetModel.fromJson(Map<String, dynamic> json) {
    return GearPresetModel(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      name: json['name'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      itemCount: (json['item_count'] as num?)?.toInt() ?? 0,
      totalWeightG: (json['total_weight_g'] as num?)?.toDouble() ?? 0,
    );
  }

  GearPresetModel copyWith({
    String? id,
    String? userId,
    String? name,
    DateTime? createdAt,
    int? itemCount,
    double? totalWeightG,
  }) {
    return GearPresetModel(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      name: name ?? this.name,
      createdAt: createdAt ?? this.createdAt,
      itemCount: itemCount ?? this.itemCount,
      totalWeightG: totalWeightG ?? this.totalWeightG,
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/gear/domain/gear_preset_model.dart
git commit -m "feat(gear): add GearPresetModel domain model"
```

---

### Task 3: Repository — Preset CRUD Methods and Providers

**Files:**
- Modify: `lib/features/gear/data/gear_repository.dart`

- [ ] **Step 1: Add import for the new model**

At `gear_repository.dart:7`, after the existing `gear_trip_summary.dart` import, add:

```dart
import '../domain/gear_preset_model.dart';
```

- [ ] **Step 2: Add preset methods to GearRepository class**

Insert the following methods at the end of the `GearRepository` class, before the closing `}` at line 399. Place them after the `getTripsForGearItem` method:

```dart
  // ─── Preset queries ────────────────────────────────────────────────

  Future<List<GearPresetModel>> getUserPresets() async {
    final uid = _userId;
    final data = await _client
        .from('gear_presets')
        .select()
        .eq('user_id', uid)
        .order('created_at', ascending: false);

    final presets = <GearPresetModel>[];
    for (final row in (data as List)) {
      final presetId = row['id'] as String;
      final itemsData = await _client
          .from('gear_preset_items')
          .select('item_id, gear_items(weight_g)')
          .eq('preset_id', presetId);

      final items = itemsData as List;
      final totalWeight = items.fold<double>(0, (sum, item) {
        final gear = item['gear_items'] as Map<String, dynamic>?;
        if (gear == null) return sum;
        final w = gear['weight_g'];
        if (w == null) return sum;
        if (w is num) return sum + w.toDouble();
        return sum;
      });

      presets.add(GearPresetModel(
        id: row['id'] as String,
        userId: row['user_id'] as String,
        name: row['name'] as String,
        createdAt: DateTime.parse(row['created_at'] as String),
        itemCount: items.length,
        totalWeightG: totalWeight,
      ));
    }
    return presets;
  }

  Future<GearPresetModel> createPreset({required String name}) async {
    final uid = _userId;
    final row = await _client
        .from('gear_presets')
        .insert({'user_id': uid, 'name': name})
        .select()
        .single();

    return GearPresetModel.fromJson(row);
  }

  Future<void> renamePreset({required String presetId, required String newName}) async {
    final uid = _userId;
    await _client
        .from('gear_presets')
        .update({'name': newName})
        .eq('id', presetId)
        .eq('user_id', uid);
  }

  Future<void> deletePreset({required String presetId}) async {
    final uid = _userId;
    await _client
        .from('gear_presets')
        .delete()
        .eq('id', presetId)
        .eq('user_id', uid);
  }

  Future<List<GearItemModel>> getPresetItems(String presetId) async {
    final data = await _client
        .from('gear_preset_items')
        .select('item_id, gear_items(*)')
        .eq('preset_id', presetId)
        .order('created_at', ascending: true);

    return (data as List)
        .where((row) => row['gear_items'] != null)
        .map((row) => GearItemModel.fromJson(row['gear_items'] as Map<String, dynamic>))
        .toList();
  }

  Future<void> addItemToPreset({required String presetId, required String itemId}) async {
    await _client
        .from('gear_preset_items')
        .insert({'preset_id': presetId, 'item_id': itemId});
  }

  Future<void> removeItemFromPreset({required String presetId, required String itemId}) async {
    await _client
        .from('gear_preset_items')
        .delete()
        .eq('preset_id', presetId)
        .eq('item_id', itemId);
  }

  Future<void> setPresetItems({required String presetId, required List<String> itemIds}) async {
    // Remove all existing items
    await _client
        .from('gear_preset_items')
        .delete()
        .eq('preset_id', presetId);

    // Insert new items
    if (itemIds.isNotEmpty) {
      await _client
          .from('gear_preset_items')
          .insert(itemIds.map((id) => {'preset_id': presetId, 'item_id': id}).toList());
    }
  }
```

- [ ] **Step 3: Add Riverpod providers for presets**

Append these providers after the existing `tripsForGearItemProvider` at the end of the file:

```dart
final gearPresetsProvider = FutureProvider<List<GearPresetModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getUserPresets();
});

final presetItemsProvider =
    FutureProvider.family<List<GearItemModel>, String>((ref, presetId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getPresetItems(presetId);
});
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/gear/data/gear_repository.dart`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/features/gear/data/gear_repository.dart
git commit -m "feat(gear): add preset CRUD methods and providers to GearRepository"
```

---

### Task 4: Create Preset Sheet Widget

**Files:**
- Create: `lib/features/gear/presentation/widgets/create_preset_sheet.dart`

- [ ] **Step 1: Create the widget**

Follow the exact pattern from `create_category_sheet.dart` — same drag handle, same text field style, same button style, same error handling:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../data/gear_repository.dart';

class CreatePresetSheet extends ConsumerStatefulWidget {
  final List<String> existingNames;

  const CreatePresetSheet({super.key, required this.existingNames});

  @override
  ConsumerState<CreatePresetSheet> createState() => _CreatePresetSheetState();
}

class _CreatePresetSheetState extends ConsumerState<CreatePresetSheet> {
  final _nameController = TextEditingController();
  String? _errorText;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _isValid {
    final name = _nameController.text.trim();
    return name.isNotEmpty && name.length <= 20 && _errorText == null;
  }

  void _validate() {
    final name = _nameController.text.trim();
    String? error;
    if (name.isEmpty) {
      error = null;
    } else if (name.length > 20) {
      error = '名称最多 20 个字符';
    } else if (widget.existingNames.any((n) => n.toLowerCase() == name.toLowerCase())) {
      error = '预设名称已存在';
    }
    setState(() => _errorText = error);
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _isSubmitting) return;

    setState(() => _isSubmitting = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.createPreset(name: name);
      ref.invalidate(gearPresetsProvider);
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
        bottom: MediaQuery.of(context).viewInsets.bottom + 120,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
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
            '新建预设',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: colors.ink,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            maxLength: 20,
            autofocus: true,
            onChanged: (_) => _validate(),
            style: TextStyle(fontSize: 16, color: colors.ink),
            decoration: InputDecoration(
              hintText: '预设名称，如「一日徒步」',
              hintStyle: TextStyle(color: colors.inkMuted),
              errorText: _errorText,
              counterText: '${_nameController.text.length}/20',
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
          const SizedBox(height: 20),
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

- [ ] **Step 2: Commit**

```bash
git add lib/features/gear/presentation/widgets/create_preset_sheet.dart
git commit -m "feat(gear): add CreatePresetSheet widget"
```

---

### Task 5: Add Items to Preset Sheet Widget

**Files:**
- Create: `lib/features/gear/presentation/widgets/add_preset_items_sheet.dart`

- [ ] **Step 1: Create the widget**

This is a bottom sheet that shows all user gear items grouped by category, with checkboxes for selection:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/kaipa_tokens.dart';
import '../../../../core/theme/kaipa_theme.dart';
import '../../../../core/widgets/kaipa_icons.dart';
import '../../data/gear_repository.dart';
import '../../domain/gear_category_model.dart';
import '../../domain/gear_item_model.dart';

class AddPresetItemsSheet extends ConsumerStatefulWidget {
  final String presetId;
  final List<String> currentItemIds;

  const AddPresetItemsSheet({
    super.key,
    required this.presetId,
    required this.currentItemIds,
  });

  @override
  ConsumerState<AddPresetItemsSheet> createState() => _AddPresetItemsSheetState();
}

class _AddPresetItemsSheetState extends ConsumerState<AddPresetItemsSheet> {
  late Set<String> _selectedIds;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _selectedIds = Set<String>.from(widget.currentItemIds);
  }

  Future<void> _save() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.setPresetItems(
        presetId: widget.presetId,
        itemIds: _selectedIds.toList(),
      );
      ref.invalidate(presetItemsProvider(widget.presetId));
      ref.invalidate(gearPresetsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final categoriesAsync = ref.watch(gearCategoriesProvider);
    final itemsAsync = ref.watch(allGearItemsProvider);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Column(
              children: [
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '选择装备',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: colors.ink,
                        letterSpacing: -0.4,
                      ),
                    ),
                    Text(
                      '已选 ${_selectedIds.length} 件',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: colors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: categoriesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
              data: (categories) => itemsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: colors.inkMuted))),
                data: (items) => _buildItemsList(colors, categories, items),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).viewPadding.bottom + 20),
            child: SizedBox(
              height: 48,
              width: double.infinity,
              child: ElevatedButton(
                onPressed: !_isSaving ? _save : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: colors.flare,
                  disabledBackgroundColor: colorWithOpacity(colors.flare, 0.3),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text(
                        '确定',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsList(
    KaipaColors colors,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
  ) {
    final visibleCategories = categories.where((c) => !c.isUncategorized).toList();

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      itemCount: visibleCategories.length,
      itemBuilder: (context, catIndex) {
        final cat = visibleCategories[catIndex];
        final catItems = items
            .where((item) => item.categoryId == cat.id || item.categoryId == cat.builtinRef)
            .toList();

        if (catItems.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (catIndex > 0) const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                cat.name,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.inkMuted,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            ...catItems.map((item) => _buildItemTile(item, colors)),
          ],
        );
      },
    );
  }

  Widget _buildItemTile(GearItemModel item, KaipaColors colors) {
    final isSelected = _selectedIds.contains(item.id);
    final weightStr = item.weightG != null ? '${(item.weightG! / 1000).toStringAsFixed(1)}kg' : '';

    return GestureDetector(
      onTap: () {
        setState(() {
          if (isSelected) {
            _selectedIds.remove(item.id);
          } else {
            _selectedIds.add(item.id);
          }
        });
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          color: isSelected ? colorWithOpacity(colors.flare, 0.08) : colors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? colorWithOpacity(colors.flare, 0.3) : colors.lineSoft,
            width: 0.5,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: isSelected ? colors.flare : Colors.transparent,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected ? colors.flare : colors.inkDim,
                  width: 1.5,
                ),
              ),
              child: isSelected
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                item.name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: colors.ink,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            if (weightStr.isNotEmpty)
              Text(
                weightStr,
                style: TextStyle(
                  fontSize: 12,
                  color: colors.inkDim,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/gear/presentation/widgets/add_preset_items_sheet.dart
git commit -m "feat(gear): add AddPresetItemsSheet for selecting gear items"
```

---

### Task 6: Preset Detail Screen

**Files:**
- Create: `lib/features/gear/presentation/preset_detail_screen.dart`

- [ ] **Step 1: Create the screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_item_model.dart';
import 'widgets/add_preset_items_sheet.dart';

class PresetDetailScreen extends ConsumerStatefulWidget {
  final String presetId;

  const PresetDetailScreen({super.key, required this.presetId});

  @override
  ConsumerState<PresetDetailScreen> createState() => _PresetDetailScreenState();
}

class _PresetDetailScreenState extends ConsumerState<PresetDetailScreen> {
  String? _presetName;
  bool _isEditingName = false;
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _loadPresetName() {
    final presetsAsync = ref.read(gearPresetsProvider);
    presetsAsync.whenData((presets) {
      final preset = presets.where((p) => p.id == widget.presetId).firstOrNull;
      if (preset != null && mounted) {
        setState(() => _presetName = preset.name);
      }
    });
  }

  void _startRename() {
    _nameController.text = _presetName ?? '';
    setState(() => _isEditingName = true);
  }

  Future<void> _saveRename() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty || newName == _presetName) {
      setState(() => _isEditingName = false);
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.renamePreset(presetId: widget.presetId, newName: newName);
      ref.invalidate(gearPresetsProvider);
      setState(() {
        _presetName = newName;
        _isEditingName = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
  }

  Future<void> _removeItem(GearItemModel item) async {
    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.removeItemFromPreset(presetId: widget.presetId, itemId: item.id);
      ref.invalidate(presetItemsProvider(widget.presetId));
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('移除失败: $e')),
        );
      }
    }
  }

  void _showAddItemsSheet(List<GearItemModel> currentItems) {
    final colors = context.kaipaTokens.color;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => AddPresetItemsSheet(
        presetId: widget.presetId,
        currentItemIds: currentItems.map((i) => i.id).toList(),
      ),
    ).then((saved) {
      if (saved == true) {
        ref.invalidate(presetItemsProvider(widget.presetId));
        ref.invalidate(gearPresetsProvider);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final itemsAsync = ref.watch(presetItemsProvider(widget.presetId));

    if (_presetName == null) _loadPresetName();

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: KaipaIcon(name: KaipaIcons.back, size: 22, color: colors.ink),
        ),
        title: _isEditingName
            ? TextField(
                controller: _nameController,
                autofocus: true,
                maxLength: 20,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: colors.ink),
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
                onSubmitted: (_) => _saveRename(),
              )
            : GestureDetector(
                onTap: _startRename,
                child: Text(
                  _presetName ?? '预设',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: colors.ink,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
        actions: [
          if (_isEditingName)
            IconButton(
              onPressed: _saveRename,
              icon: Icon(Icons.check, size: 22, color: colors.flare),
            ),
        ],
      ),
      body: itemsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: colors.ink)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(presetItemsProvider(widget.presetId)),
                child: Text('重试', style: TextStyle(color: colors.flare)),
              ),
            ],
          ),
        ),
        data: (items) => _buildContent(colors, items),
      ),
      floatingActionButton: itemsAsync.whenOrNull(
        data: (items) => FloatingActionButton(
          onPressed: () => _showAddItemsSheet(items),
          backgroundColor: colors.flare,
          child: const KaipaIcon(name: KaipaIcons.plus, size: 20, color: Colors.white, strokeWidth: 2.0),
        ),
      ),
    );
  }

  Widget _buildContent(KaipaColors colors, List<GearItemModel> items) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KaipaIcon(name: KaipaIcons.backpack, size: 48, color: colors.inkDim),
            const SizedBox(height: 16),
            Text(
              '还没有装备',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink),
            ),
            const SizedBox(height: 8),
            Text(
              '点击右下角按钮添加装备到此预设',
              style: TextStyle(fontSize: 13, color: colors.inkMuted),
            ),
          ],
        ),
      );
    }

    final totalWeight = items.fold<double>(0, (sum, item) => sum + (item.weightG ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text(
            '${items.length} 件装备 · ${(totalWeight / 1000).toStringAsFixed(1)}kg',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: colors.inkMuted,
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return Dismissible(
                key: ValueKey(item.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  margin: const EdgeInsets.only(bottom: 6),
                  decoration: BoxDecoration(
                    color: colors.diff.extreme,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.delete_outline, color: Colors.white, size: 20),
                ),
                onDismissed: (_) => _removeItem(item),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: colors.line, width: 0.5),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                                letterSpacing: -0.2,
                              ),
                            ),
                            if (item.brand != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                item.brand!,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.inkMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (item.weightG != null)
                        Text(
                          '${(item.weightG! / 1000).toStringAsFixed(1)}kg',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: colors.inkDim,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/gear/presentation/preset_detail_screen.dart
git commit -m "feat(gear): add PresetDetailScreen with item list and swipe-to-remove"
```

---

### Task 7: Preset Management Screen

**Files:**
- Create: `lib/features/gear/presentation/preset_management_screen.dart`

- [ ] **Step 1: Create the screen**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/kaipa_tokens.dart';
import '../../../core/theme/kaipa_theme.dart';
import '../../../core/widgets/kaipa_icons.dart';
import '../data/gear_repository.dart';
import '../domain/gear_preset_model.dart';
import 'widgets/create_preset_sheet.dart';

class PresetManagementScreen extends ConsumerStatefulWidget {
  const PresetManagementScreen({super.key});

  @override
  ConsumerState<PresetManagementScreen> createState() => _PresetManagementScreenState();
}

class _PresetManagementScreenState extends ConsumerState<PresetManagementScreen> {
  String? _editingId;
  final _editController = TextEditingController();

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  void _startEditing(GearPresetModel preset) {
    setState(() {
      _editingId = preset.id;
      _editController.text = preset.name;
    });
  }

  Future<void> _saveEdit(GearPresetModel preset) async {
    final newName = _editController.text.trim();
    if (newName.isEmpty || newName == preset.name) {
      setState(() => _editingId = null);
      return;
    }

    if (newName.length > 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('名称最多 20 个字符')),
      );
      return;
    }

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.renamePreset(presetId: preset.id, newName: newName);
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('重命名失败: $e')),
        );
      }
    }
    setState(() => _editingId = null);
  }

  Future<void> _deletePreset(GearPresetModel preset) async {
    final colors = context.kaipaTokens.color;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text('删除预设', style: TextStyle(color: colors.ink)),
        content: Text(
          '确定要删除「${preset.name}」吗？',
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
      ),
    );

    if (confirmed != true) return;

    try {
      final repo = ref.read(gearRepositoryProvider);
      await repo.deletePreset(presetId: preset.id);
      ref.invalidate(gearPresetsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('删除失败: $e')),
        );
      }
    }
  }

  void _showCreateSheet(List<GearPresetModel> presets) {
    if (presets.length >= 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多创建 20 个预设')),
      );
      return;
    }

    final colors = context.kaipaTokens.color;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.bg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CreatePresetSheet(
        existingNames: presets.map((p) => p.name).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.kaipaTokens;
    final colors = tokens.color;
    final presetsAsync = ref.watch(gearPresetsProvider);

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
          '预设管理',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: colors.ink,
            letterSpacing: -0.4,
          ),
        ),
        actions: [
          presetsAsync.whenOrNull(
            data: (presets) => IconButton(
              onPressed: () => _showCreateSheet(presets),
              icon: KaipaIcon(name: KaipaIcons.plus, size: 22, color: colors.flare),
            ),
          ) ?? const SizedBox.shrink(),
        ],
      ),
      body: presetsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: colors.ink)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(gearPresetsProvider),
                child: Text('重试', style: TextStyle(color: colors.flare)),
              ),
            ],
          ),
        ),
        data: (presets) => presets.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    KaipaIcon(name: KaipaIcons.backpack, size: 48, color: colors.inkDim),
                    const SizedBox(height: 16),
                    Text('还没有预设', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.ink)),
                    const SizedBox(height: 8),
                    Text('创建预设来快速管理不同场景的装备', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () => _showCreateSheet(presets),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: colors.flare,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      ),
                      child: const Text('新建预设', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              )
            : _buildList(colors, presets),
      ),
    );
  }

  Widget _buildList(KaipaColors colors, List<GearPresetModel> presets) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: presets.length,
      itemBuilder: (context, index) {
        final preset = presets[index];
        final isEditing = _editingId == preset.id;
        final weightKg = preset.totalWeightG / 1000;

        return GestureDetector(
          onTap: isEditing ? null : () => context.go('/gear/preset/${preset.id}'),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: colors.line, width: 0.5),
            ),
            child: Row(
              children: [
                Expanded(
                  child: isEditing
                      ? TextField(
                          controller: _editController,
                          autofocus: true,
                          maxLength: 20,
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
                          onSubmitted: (_) => _saveEdit(preset),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              preset.name,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: colors.ink,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${preset.itemCount} 件 · ${weightKg.toStringAsFixed(1)}kg',
                              style: TextStyle(fontSize: 12, color: colors.inkMuted),
                            ),
                          ],
                        ),
                ),
                if (!isEditing) ...[
                  IconButton(
                    onPressed: () => _startEditing(preset),
                    icon: Icon(Icons.edit_outlined, size: 18, color: colors.inkMuted),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    padding: EdgeInsets.zero,
                  ),
                  IconButton(
                    onPressed: () => _deletePreset(preset),
                    icon: Icon(Icons.delete_outline, size: 18, color: colors.diff.extreme),
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                    padding: EdgeInsets.zero,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/features/gear/presentation/preset_management_screen.dart
git commit -m "feat(gear): add PresetManagementScreen with rename and delete"
```

---

### Task 8: Router — Add Preset Routes

**Files:**
- Modify: `lib/core/router/app_router.dart`

- [ ] **Step 1: Add imports for new screens**

At `app_router.dart:17`, after the `category_management_screen.dart` import, add:

```dart
import '../../features/gear/presentation/preset_management_screen.dart';
import '../../features/gear/presentation/preset_detail_screen.dart';
```

- [ ] **Step 2: Add routes under the gear branch**

In `app_router.dart`, inside the gear branch routes array (after the `categories/manage` route at line 87), add:

```dart
                GoRoute(
                  path: 'presets/manage',
                  builder: (_, _) => const PresetManagementScreen(),
                ),
                GoRoute(
                  path: 'preset/:id',
                  builder: (_, state) => PresetDetailScreen(
                    presetId: state.pathParameters['id']!,
                  ),
                ),
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/core/router/app_router.dart`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/core/router/app_router.dart
git commit -m "feat(gear): add preset management and detail routes"
```

---

### Task 9: Gear Library Screen — Add Management Buttons and Real Preset Data

**Files:**
- Modify: `lib/features/gear/presentation/gear_library_screen.dart`

- [ ] **Step 1: Add import for go_router (already imported) and preset model**

At line 9 (after the `gear_repository.dart` import), the `gear_repository.dart` import already brings in providers. No new domain import is needed because the `gearPresetsProvider` is defined in `gear_repository.dart`. Verify that `go_router` is already imported at line 5 — it is.

- [ ] **Step 2: Remove the _DemoPreset class and hardcoded presets**

Delete lines 16-28 (the `_DemoPreset` class) entirely:

```dart
// DELETE THESE LINES:
// ─── Preset data (feature not yet implemented, keep static) ────────

class _DemoPreset {
  final String name;
  final String spec;
  final Color dotColor;

  const _DemoPreset({
    required this.name,
    required this.spec,
    required this.dotColor,
  });
}
```

- [ ] **Step 3: Remove hardcoded presets from _buildContent**

Delete lines 120-124 (the hardcoded presets inside `_buildContent`):

```dart
// DELETE THESE LINES:
    final presets = [
      _DemoPreset(name: '一日徒步', spec: '8 件 · 5.2kg', dotColor: colors.moss),
      _DemoPreset(name: '过夜重装', spec: '24 件 · 12.1kg', dotColor: colors.flare),
      _DemoPreset(name: '雪线攀登', spec: '18 件 · 9.4kg', dotColor: colors.sky),
    ];
```

- [ ] **Step 4: Update build method to also watch presets provider**

In the `build` method, after line 58 (`final itemsAsync = ref.watch(allGearItemsProvider);`), add:

```dart
    final presetsAsync = ref.watch(gearPresetsProvider);
```

Then update the nested `.when()` to also include presets. Replace lines 64-71 with:

```dart
        child: categoriesAsync.when(
          loading: () => _buildShimmer(colors),
          error: (e, _) => _buildError(colors, e, ref),
          data: (categories) => itemsAsync.when(
            loading: () => _buildShimmer(colors),
            error: (e, _) => _buildError(colors, e, ref),
            data: (items) => presetsAsync.when(
              loading: () => _buildContent(context, colors, ref, categories, items, []),
              error: (_, _) => _buildContent(context, colors, ref, categories, items, []),
              data: (presets) => _buildContent(context, colors, ref, categories, items, presets),
            ),
          ),
        ),
```

- [ ] **Step 5: Update _buildContent signature**

Add `presets` parameter. Import the preset model at the top of the file:

```dart
import '../domain/gear_preset_model.dart';
```

Update the `_buildContent` method signature:

```dart
  Widget _buildContent(
    BuildContext context,
    KaipaColors colors,
    WidgetRef ref,
    List<GearCategoryModel> categories,
    List<GearItemModel> items,
    List<GearPresetModel> presets,
  ) {
```

- [ ] **Step 6: Replace preset section with real data and「管理」button**

Replace the entire preset section (the two `SliverToBoxAdapter` blocks for presets, lines 145-172 in the original) with:

```dart
        // Presets
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text('装备预设', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                    const SizedBox(width: 8),
                    Text('${presets.length} 套', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.inkMuted, letterSpacing: -0.1)),
                  ],
                ),
                GestureDetector(
                  onTap: () => context.go('/gear/presets/manage'),
                  child: Text('管理', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.flare)),
                ),
              ],
            ),
          ),
        ),
        if (presets.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Container(
                height: 96,
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: colors.lineSoft, width: 0.5),
                ),
                child: Center(
                  child: Text('还没有预设，点击「管理」创建', style: TextStyle(fontSize: 13, color: colors.inkMuted)),
                ),
              ),
            ),
          )
        else
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: 12),
              child: SizedBox(
                height: 96,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: presets.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final preset = presets[index];
                    final dotColors = [colors.moss, colors.flare, colors.sky, colors.sand, colors.inkMuted];
                    return GestureDetector(
                      onTap: () => context.go('/gear/preset/${preset.id}'),
                      child: _PresetCard(
                        name: preset.name,
                        spec: '${preset.itemCount} 件 · ${(preset.totalWeightG / 1000).toStringAsFixed(1)}kg',
                        dotColor: dotColors[index % dotColors.length],
                        colors: colors,
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
```

- [ ] **Step 7: Add「管理」button to categories section**

Replace the categories title section (lines 174-179 in the original):

```dart
        // Categories
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Text('分类', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
          ),
        ),
```

With:

```dart
        // Categories
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('分类', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.4)),
                GestureDetector(
                  onTap: () => context.go('/gear/categories/manage'),
                  child: Text('管理', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: colors.flare)),
                ),
              ],
            ),
          ),
        ),
```

- [ ] **Step 8: Update _PresetCard to use plain parameters instead of _DemoPreset**

Replace the entire `_PresetCard` class with:

```dart
class _PresetCard extends StatelessWidget {
  final String name;
  final String spec;
  final Color dotColor;
  final KaipaColors colors;

  const _PresetCard({required this.name, required this.spec, required this.dotColor, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 150),
      decoration: BoxDecoration(color: colors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: colors.line, width: 0.5)),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Text(name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: colors.ink, letterSpacing: -0.3)),
          ]),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(spec, style: TextStyle(fontSize: 11.5, color: colors.inkMuted)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 9: Update _buildError to also invalidate presets**

In the `_buildError` method, update the retry callback at the line containing `ref.invalidate(gearCategoriesProvider)`:

```dart
            onPressed: () { ref.invalidate(gearCategoriesProvider); ref.invalidate(allGearItemsProvider); ref.invalidate(gearPresetsProvider); },
```

- [ ] **Step 10: Verify the file compiles**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze lib/features/gear/presentation/gear_library_screen.dart`
Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add lib/features/gear/presentation/gear_library_screen.dart
git commit -m "feat(gear): add management buttons and real preset data to library screen"
```

---

### Task 10: Verify Full Build

- [ ] **Step 1: Run full Flutter analyze**

Run: `cd /home/coder/workspaces/kaipa && flutter analyze`
Expected: No errors.

- [ ] **Step 2: Test the dev server**

Run: `cd /home/coder/workspaces/kaipa && flutter run -d chrome --web-port=8080`
Expected: App loads, gear library shows「管理」buttons next to「装备预设」and「分类」sections. Presets section shows empty state. Tapping「管理」navigates to the respective management screens.

- [ ] **Step 3: Final commit if any fixes needed**

If any fixes were applied during verification, commit them.
