import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supabase/supabase_provider.dart';
import '../domain/gear_category_model.dart';
import '../domain/gear_item_model.dart';
import '../domain/gear_trip_summary.dart';
import '../domain/gear_preset_model.dart';

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

    // Verify no items remain on the override before deleting
    final remaining = await _client
        .from('gear_items')
        .select('id')
        .eq('user_id', uid)
        .eq('category_id', overrideId);
    if ((remaining as List).isNotEmpty) {
      throw Exception('Item migration incomplete, aborting delete');
    }

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

    // Verify no items remain before deleting (prevents cascade data loss)
    final remaining = await _client
        .from('gear_items')
        .select('id')
        .eq('user_id', uid)
        .eq('category_id', categoryId);
    if ((remaining as List).isNotEmpty) {
      throw Exception('Item migration incomplete, aborting delete');
    }

    await _client
        .from('gear_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', uid);
  }

  Future<void> reorderCategories({
    required List<String> orderedIds,
    required List<GearCategoryModel> categories,
  }) async {
    final uid = _userId;
    for (int i = 0; i < orderedIds.length; i++) {
      final id = orderedIds[i];
      final cat = categories.firstWhere((c) => c.id == id);

      if (cat.isBuiltin) {
        // Built-in categories can't be updated via RLS — create an override
        // record that inherits icon/name but carries the new sort_order
        final existingOverrides = await _client
            .from('gear_categories')
            .select()
            .eq('user_id', uid)
            .eq('builtin_ref', id);

        if ((existingOverrides as List).isNotEmpty) {
          await _client
              .from('gear_categories')
              .update({'sort_order': i + 1})
              .eq('user_id', uid)
              .eq('builtin_ref', id);
        } else if (cat.sortOrder != i + 1) {
          // Only create override if position actually changed
          await _client.from('gear_categories').insert({
            'name': cat.name,
            'icon': cat.icon,
            'icon_type': cat.iconType,
            'sort_order': i + 1,
            'is_builtin': false,
            'user_id': uid,
            'builtin_ref': id,
            'original_name': cat.name,
          });

          // Migrate items from built-in to the new override
          await _client
              .from('gear_items')
              .update({'category_id': id})
              .eq('user_id', uid)
              .eq('category_id', id);
        }
      } else {
        await _client
            .from('gear_categories')
            .update({'sort_order': i + 1})
            .eq('id', id)
            .eq('user_id', uid);
      }
    }
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

  Future<List<GearTripSummary>> getTripsForGearItem(String itemId) async {
    final uid = _userId;
    final data = await _client
        .from('trips')
        .select('id, started_at, actual_distance_km, actual_elevation_m, routes(name, difficulty)')
        .eq('user_id', uid)
        .contains('gear_used', [itemId])
        .order('started_at', ascending: false);

    return (data as List)
        .map((row) => GearTripSummary.fromJson(row))
        .toList();
  }

  // ─── Preset queries ────────────────────────────────────────────────

  Future<List<GearPresetModel>> getUserPresets() async {
    final uid = _userId;
    final data = await _client
        .from('gear_presets')
        .select('*, gear_preset_items(item_id, gear_items(weight_g))')
        .eq('user_id', uid)
        .order('created_at', ascending: false);

    return (data as List).map((row) {
      final items = (row['gear_preset_items'] as List?) ?? [];
      final totalWeight = items.fold<double>(0, (sum, item) {
        final gear = item['gear_items'] as Map<String, dynamic>?;
        if (gear == null) return sum;
        final w = gear['weight_g'];
        if (w == null) return sum;
        if (w is num) return sum + w.toDouble();
        return sum;
      });

      return GearPresetModel(
        id: row['id'] as String,
        userId: row['user_id'] as String,
        name: row['name'] as String,
        createdAt: DateTime.parse(row['created_at'] as String),
        itemCount: items.length,
        totalWeightG: totalWeight,
      );
    }).toList();
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

final tripsForGearItemProvider =
    FutureProvider.family<List<GearTripSummary>, String>((ref, itemId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getTripsForGearItem(itemId);
});

final gearPresetsProvider = FutureProvider<List<GearPresetModel>>((ref) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getUserPresets();
});

final presetItemsProvider =
    FutureProvider.family<List<GearItemModel>, String>((ref, presetId) async {
  final repo = ref.watch(gearRepositoryProvider);
  return repo.getPresetItems(presetId);
});
