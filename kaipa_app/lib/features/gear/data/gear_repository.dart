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
